/**
 * 变更单模块：只能追加 / 减少“还没开料”的部分，已开料部件 (cut_qty) 不许动。
 * 每次变更：重算套裁方案与耗板数（已耗整板 + 未开部分重新套裁），并写 change_orders 留痕。
 */
import { db } from '../db.js';
import {
  getOrder,
  getSpec,
  listDemands,
  availableRemnants,
  assertPositiveDims,
} from './planning.js';
import { nest, type PartItem, type NestingPlan } from '../lib/packing.js';

export interface ChangeInput {
  kind: 'append' | 'reduce';
  /** reduce 时指定已有部件行 */
  demand_id?: number;
  /** append 新部件时用；与已有行同名同尺寸则自动合并数量 */
  name?: string;
  length?: number;
  width?: number;
  /** 变化数量：append 传正数；reduce 传要减少的正数 */
  qty_delta: number;
  note?: string;
}

function uncutItems(demands: any[]): PartItem[] {
  const items: PartItem[] = [];
  for (const d of demands) {
    for (let i = 0; i < d.qty - d.cut_qty; i++) {
      items.push({ demand_id: d.id, name: d.name, l: d.length, w: d.width });
    }
  }
  return items;
}

function dryRun(specId: number, items: PartItem[]) {
  if (items.length === 0) {
    return { whole_sheets_used: 0, plan: null as NestingPlan | null };
  }
  const spec = getSpec(specId);
  const plan = nest({
    spec_id: specId,
    sheet_length: spec.length,
    sheet_width: spec.width,
    parts: items,
    availableRemnants: availableRemnants(specId),
  });
  return { whole_sheets_used: plan.whole_sheets_used, plan };
}

/** 该单实际已消耗的整板数（所有历史版本方案累加） */
export function alreadyCutSheets(orderId: number): number {
  const row = db()
    .prepare(
      'SELECT COALESCE(SUM(whole_sheets_used),0) AS n FROM nesting_plans WHERE order_id=?',
    )
    .get(orderId) as any;
  return row.n;
}

export function listChanges(orderId?: number) {
  if (orderId) {
    return db()
      .prepare(
        `SELECT c.*, o.code AS order_code FROM change_orders c
         JOIN orders o ON o.id=c.order_id WHERE c.order_id=? ORDER BY c.id DESC`,
      )
      .all(orderId);
  }
  return db()
    .prepare(
      `SELECT c.*, o.code AS order_code FROM change_orders c
       JOIN orders o ON o.id=c.order_id ORDER BY c.id DESC`,
    )
    .all();
}

/**
 * 应用变更。返回留痕记录和重算前后的耗板数/方案预览。
 * 不实际开料、不动库存——确认开料走 planning.commitCut。
 */
export function applyChange(orderId: number, input: ChangeInput) {
  const order = getOrder(orderId);
  const spec = getSpec(order.spec_id);
  if (order.status === 'archived') throw new Error('订单已归档，不能改单');
  if (!Number.isInteger(input.qty_delta) || input.qty_delta <= 0) {
    throw new Error('变更数量必须是正整数');
  }

  const run = db().transaction(() => {
    const beforeDemands = listDemands(orderId) as any[];
    const alreadySheets = alreadyCutSheets(orderId);
    const beforeDry = dryRun(order.spec_id, uncutItems(beforeDemands));
    const sheetsBefore = alreadySheets + beforeDry.whole_sheets_used;

    let demandId: number | null = null;
    let partName = '';
    let pLen = 0;
    let pWid = 0;
    let signedDelta = 0;

    if (input.kind === 'append') {
      const name = (input.name ?? '').trim();
      const l = Math.trunc(input.length ?? 0);
      const w = Math.trunc(input.width ?? 0);
      if (!name) throw new Error('追加部件必须填写部件名');
      assertPositiveDims([{ name, length: l, width: w, qty: 1 }], spec.length, spec.width);

      // 同名同尺寸行合并；否则新开一行
      const existing = beforeDemands.find(
        (d) => d.name === name && d.length === l && d.width === w,
      );
      if (existing) {
        db()
          .prepare('UPDATE part_demands SET qty = qty + ? WHERE id=?')
          .run(input.qty_delta, existing.id);
        demandId = existing.id;
      } else {
        const info = db()
          .prepare(
            'INSERT INTO part_demands (order_id, name, length, width, qty, cut_qty) VALUES (?,?,?,?,?,0)',
          )
          .run(orderId, name, l, w, input.qty_delta);
        demandId = Number(info.lastInsertRowid);
      }
      partName = name;
      pLen = l;
      pWid = w;
      signedDelta = input.qty_delta;
    } else {
      // reduce：只允许减未开料部分，qty 不得低于 cut_qty
      const target = beforeDemands.find((d) => d.id === input.demand_id);
      if (!target) throw new Error('要减少的部件行不存在');
      const uncut = target.qty - target.cut_qty;
      if (input.qty_delta > uncut) {
        throw new Error(
          `部件「${target.name}」未开料只有 ${uncut} 件，不能减少 ${input.qty_delta} 件；已开料的 ${target.cut_qty} 件不许动`,
        );
      }
      db()
        .prepare('UPDATE part_demands SET qty = qty - ? WHERE id=?')
        .run(input.qty_delta, target.id);
      demandId = target.id;
      partName = target.name;
      pLen = target.length;
      pWid = target.width;
      signedDelta = -input.qty_delta;
    }

    const afterDemands = listDemands(orderId) as any[];
    const afterDry = dryRun(order.spec_id, uncutItems(afterDemands));
    const sheetsAfter = alreadySheets + afterDry.whole_sheets_used;

    const versionBefore = order.version;
    // 变更后重算订单状态：全开完→cut，开过一部分→in_cutting，一件没开→pending
    const anyCut = afterDemands.some((d) => d.cut_qty > 0);
    const allCut = afterDemands.every((d) => d.cut_qty >= d.qty);
    const newStatus = allCut ? 'cut' : anyCut ? 'in_cutting' : 'pending';
    db()
      .prepare('UPDATE orders SET version = version + 1, status = ? WHERE id=?')
      .run(newStatus, orderId);

    const info = db()
      .prepare(
        `INSERT INTO change_orders
          (order_id, version_before, version_after, kind, demand_id,
           part_name, length, width, qty_delta, sheets_before, sheets_after, note)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        orderId,
        versionBefore,
        versionBefore + 1,
        input.kind,
        demandId,
        partName,
        pLen,
        pWid,
        signedDelta,
        sheetsBefore,
        sheetsAfter,
        (input.note ?? '').trim(),
      );

    return {
      change_id: Number(info.lastInsertRowid),
      sheets_before: sheetsBefore,
      sheets_after: sheetsAfter,
      already_cut_sheets: alreadySheets,
      before_plan: beforeDry.plan,
      after_plan: afterDry.plan,
    };
  });

  return run();
}
