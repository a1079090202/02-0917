/**
 * 变更单模块：订单变更只能追加部件、或减少"还没开料"的数量；
 * 已开料的部件一律不许动。变更落账后立即按最新未开料需求
 * 重算套裁方案（新版本草稿），耗板数前后对比写入变更单留痕。
 */
import type { DB } from '../../db';
import { badRequest, notFound } from '../../core/errors';
import { nowStr } from '../../core/time';
import { generatePlan, getPlan, uncutRequirements, type PlanView } from '../nesting/service';
import { validateItem, type OrderItemInput } from '../orders/service';
import type { ChangeOrderRow, OrderItemRow, OrderRow } from '../../types';

export interface ReductionInput {
  item_id: number;
  new_quantity: number;
}

export interface ChangePayload {
  reason?: string;
  adds?: unknown[];
  reductions?: Array<{ item_id?: unknown; new_quantity?: unknown }>;
}

export interface ChangeView extends Omit<ChangeOrderRow, 'deltas_json'> {
  deltas: unknown;
}

/** 订单当前"承诺耗板"：已执行方案 + 当前草稿（整板张数 / 余料块数） */
function committed(db: DB, orderId: number): { boards: number; remnants: number } {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(boards_new), 0) AS boards, COALESCE(SUM(remnants_used), 0) AS remnants
       FROM nesting_plans WHERE order_id = ? AND status IN ('executed', 'draft')`,
    )
    .get(orderId) as { boards: number; remnants: number };
  return row;
}

export function applyChange(
  db: DB,
  orderId: number,
  payload: ChangePayload,
  at: string = nowStr(),
): { change: ChangeView; plan: PlanView | null } {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as
    | OrderRow
    | undefined;
  if (!order) throw notFound('订单不存在');

  const adds: OrderItemInput[] = (payload.adds ?? []).map((a) => validateItem(db, a));
  const reductions: ReductionInput[] = (payload.reductions ?? []).map((r) => {
    const itemId = Number(r.item_id);
    const newQty = Number(r.new_quantity);
    if (!Number.isInteger(itemId) || !Number.isInteger(newQty) || newQty < 0) {
      throw badRequest('变更数量必须为非负整数');
    }
    return { item_id: itemId, new_quantity: newQty };
  });
  if (adds.length === 0 && reductions.length === 0) throw badRequest('变更内容为空');

  // 校验减少项：不能动已开料的部分
  const reducedItems = new Map<number, OrderItemRow>();
  for (const r of reductions) {
    const item = db
      .prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?')
      .get(r.item_id, orderId) as OrderItemRow | undefined;
    if (!item) throw badRequest(`部件 #${r.item_id} 不存在或不属于该订单`);
    if (r.new_quantity < item.cut_quantity) {
      throw badRequest(
        `部件「${item.part_name}」已开料 ${item.cut_quantity} 件，数量不能减到 ${r.new_quantity} 件`,
      );
    }
    if (r.new_quantity === item.quantity) {
      throw badRequest(`部件「${item.part_name}」数量未变化`);
    }
    if (r.new_quantity > item.quantity) {
      throw badRequest(`部件「${item.part_name}」要增加数量请用"追加部件"`);
    }
    reducedItems.set(r.item_id, item);
  }

  const before = committed(db, orderId);

  const { changeId, planId } = db.transaction(() => {
    const deltas = {
      added: adds.map((a) => ({ ...a })),
      reduced: reductions.map((r) => ({
        item_id: r.item_id,
        part_name: reducedItems.get(r.item_id)!.part_name,
        from: reducedItems.get(r.item_id)!.quantity,
        to: r.new_quantity,
      })),
    };
    const info = db
      .prepare(
        `INSERT INTO change_orders
           (order_id, reason, deltas_json, boards_before, boards_after, remnants_before, remnants_after, created_at)
         VALUES (?,?,?,?,0,?,0,?)`,
      )
      .run(orderId, String(payload.reason ?? ''), JSON.stringify(deltas), before.boards, before.remnants, at);
    const cid = Number(info.lastInsertRowid);

    const insertItem = db.prepare(
      `INSERT INTO order_items (order_id, part_name, spec_id, length_mm, width_mm, quantity, cut_quantity, created_at)
       VALUES (?,?,?,?,?,?,0,?)`,
    );
    for (const a of adds) {
      insertItem.run(orderId, a.part_name, a.spec_id, a.length_mm, a.width_mm, a.quantity, at);
    }
    const upd = db.prepare('UPDATE order_items SET quantity = ? WHERE id = ?');
    for (const r of reductions) {
      upd.run(r.new_quantity, r.item_id);
    }

    // 重算：按最新未开料需求生成新版本方案；没有待开料部件则只作废旧草稿
    let pid: number | null = null;
    let planVersion: number | null = null;
    if (uncutRequirements(db, orderId).length > 0) {
      const plan = generatePlan(db, orderId, { changeId: cid, at });
      pid = plan.id;
      planVersion = plan.version;
    } else {
      db.prepare(`UPDATE nesting_plans SET status = 'superseded' WHERE order_id = ? AND status = 'draft'`).run(orderId);
    }

    const after = committed(db, orderId);
    db.prepare(
      'UPDATE change_orders SET boards_after = ?, remnants_after = ?, plan_version_after = ? WHERE id = ?',
    ).run(after.boards, after.remnants, planVersion, cid);

    // 订单状态：全部开完 → done；开过料还有剩余 → cutting；一件未开 → open
    const { c } = db
      .prepare('SELECT COUNT(*) AS c FROM order_items WHERE order_id = ? AND quantity > cut_quantity')
      .get(orderId) as { c: number };
    const { e } = db
      .prepare(`SELECT COUNT(*) AS e FROM nesting_plans WHERE order_id = ? AND status = 'executed'`)
      .get(orderId) as { e: number };
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(
      c === 0 ? 'done' : e > 0 ? 'cutting' : 'open',
      orderId,
    );

    db.prepare(
      `INSERT INTO audit_log (entity, entity_id, action, detail_json, created_at)
       VALUES ('order', ?, 'changed', ?, ?)`,
    ).run(
      orderId,
      JSON.stringify({ changeId: cid, deltas, boardsBefore: before, boardsAfter: after }),
      at,
    );
    return { changeId: cid, planId: pid };
  })();

  const row = db.prepare('SELECT * FROM change_orders WHERE id = ?').get(changeId) as ChangeOrderRow;
  const { deltas_json, ...rest } = row;
  return {
    change: { ...rest, deltas: JSON.parse(deltas_json) as unknown },
    plan: planId === null ? null : getPlan(db, planId),
  };
}

export function listChanges(db: DB, orderId?: number): ChangeView[] {
  const base = `
    SELECT c.*, o.code AS order_code, o.customer
    FROM change_orders c JOIN orders o ON o.id = c.order_id`;
  const rows = (
    orderId !== undefined
      ? (db.prepare(`${base} WHERE c.order_id = ? ORDER BY c.id DESC`).all(orderId) as ChangeOrderRow[])
      : (db.prepare(`${base} ORDER BY c.id DESC`).all() as ChangeOrderRow[])
  );
  return rows.map((c) => {
    const { deltas_json, ...rest } = c;
    return { ...rest, deltas: JSON.parse(deltas_json) as unknown };
  });
}
