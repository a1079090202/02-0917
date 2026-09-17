/**
 * 套裁方案模块：按订单未开料需求生成方案（草稿）→ 确认开料（执行）。
 *
 * - 生成方案：把每个部件的未开料数量展开成单件，按板材规格分组，
 *   调余料匹配模块先吃余料再开整板，产出每张板的排版落位图；
 *   草稿不占用余料，只记录"打算用哪块"。
 * - 确认开料：校验需求未变、余料仍在库，然后落账——
 *   余料标记消耗、边角料登记进余料台账、部件已开料数量累加。
 */
import type { DB } from '../../db';
import { badRequest, conflict, notFound } from '../../core/errors';
import { nowStr } from '../../core/time';
import { allocate } from '../remnants/matcher';
import type { BoardLayout, PartSpec } from './packer';
import type {
  BoardSpecRow,
  NestingPlanRow,
  OrderRow,
  PlanBoardRow,
  RemnantRow,
} from '../../types';

export interface Requirement {
  item_id: number;
  part_name: string;
  spec_id: number;
  length_mm: number;
  width_mm: number;
  remaining: number;
}

export interface PlanBoardView {
  id: number;
  board_index: number;
  source_type: 'new' | 'remnant';
  remnant_id: number | null;
  spec_id: number;
  spec_name: string;
  length_mm: number;
  width_mm: number;
  parts_area: number;
  layout: BoardLayout;
}

export interface PlanView extends Omit<NestingPlanRow, 'requirements_json'> {
  boards: PlanBoardView[];
}

/** 订单当前未开料需求（按部件行，remaining > 0） */
export function uncutRequirements(db: DB, orderId: number): Requirement[] {
  return db
    .prepare(
      `SELECT id AS item_id, part_name, spec_id, length_mm, width_mm,
              quantity - cut_quantity AS remaining
       FROM order_items
       WHERE order_id = ? AND quantity > cut_quantity
       ORDER BY id`,
    )
    .all(orderId) as Requirement[];
}

/** 需求快照（用于执行前校验需求未变）。只含决定排版结果的字段。 */
function snapshot(reqs: Requirement[]): string {
  return JSON.stringify(
    reqs.map((r) => [r.item_id, r.spec_id, r.length_mm, r.width_mm, r.remaining]),
  );
}

export interface GenerateOptions {
  allowRotation?: boolean;
  kerf?: number;
  changeId?: number | null;
  at?: string;
}

/** 生成套裁方案（草稿）。同一订单同时只有一个草稿，旧草稿作废。 */
export function generatePlan(db: DB, orderId: number, opts: GenerateOptions = {}): PlanView {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as
    | OrderRow
    | undefined;
  if (!order) throw notFound('订单不存在');
  const reqs = uncutRequirements(db, orderId);
  if (reqs.length === 0) throw badRequest('没有待开料的部件');
  const at = opts.at ?? nowStr();
  const allowRotation = opts.allowRotation ?? false;
  const kerf = opts.kerf ?? 0;
  if (!Number.isInteger(kerf) || kerf < 0) throw badRequest('锯缝必须为非负整数（毫米）');

  const planId = db.transaction(() => {
    db.prepare(`UPDATE nesting_plans SET status = 'superseded' WHERE order_id = ? AND status = 'draft'`).run(orderId);
    const { v } = db
      .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM nesting_plans WHERE order_id = ?')
      .get(orderId) as { v: number };
    const version = v + 1;

    // 按板材规格分组，各组独立排版
    const bySpec = new Map<number, Requirement[]>();
    for (const r of reqs) {
      const group = bySpec.get(r.spec_id) ?? [];
      group.push(r);
      bySpec.set(r.spec_id, group);
    }

    interface PendingBoard {
      specId: number;
      source: 'new' | 'remnant';
      remnantId: number | null;
      boardW: number;
      boardH: number;
      layout: BoardLayout;
    }
    const pending: PendingBoard[] = [];
    let boardsNew = 0;
    let remnantsUsed = 0;
    let partsArea = 0;
    let newBoardArea = 0;
    let remnantAreaUsed = 0;

    for (const [specId, group] of bySpec) {
      const spec = db.prepare('SELECT * FROM board_specs WHERE id = ?').get(specId) as
        | BoardSpecRow
        | undefined;
      if (!spec) throw badRequest(`板材规格 #${specId} 不存在`);
      const parts: PartSpec[] = [];
      for (const r of group) {
        for (let i = 1; i <= r.remaining; i++) {
          parts.push({
            key: `${r.item_id}#${i}`,
            itemId: r.item_id,
            name: r.part_name,
            w: r.length_mm,
            h: r.width_mm,
          });
        }
      }
      const stocks = db
        .prepare(
          `SELECT id, length_mm AS w, width_mm AS h FROM remnants
           WHERE spec_id = ? AND status = 'available'`,
        )
        .all(specId) as Array<{ id: number; w: number; h: number }>;
      const result = allocate(parts, stocks, spec.length_mm, spec.width_mm, {
        allowRotation,
        kerf,
      });
      for (const b of result.boards) {
        pending.push({ specId, ...b });
        if (b.source === 'new') {
          boardsNew++;
          newBoardArea += b.boardW * b.boardH;
        } else {
          remnantsUsed++;
          remnantAreaUsed += b.boardW * b.boardH;
        }
        partsArea += b.layout.partsArea;
      }
    }

    const info = db
      .prepare(
        `INSERT INTO nesting_plans
           (order_id, version, change_id, status, boards_new, remnants_used,
            parts_area, new_board_area, remnant_area_used,
            requirements_json, allow_rotation, kerf, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        orderId,
        version,
        opts.changeId ?? null,
        'draft',
        boardsNew,
        remnantsUsed,
        partsArea,
        newBoardArea,
        remnantAreaUsed,
        snapshot(reqs),
        allowRotation ? 1 : 0,
        kerf,
        at,
      );
    const id = Number(info.lastInsertRowid);

    const insertBoard = db.prepare(
      `INSERT INTO plan_boards
         (plan_id, board_index, source_type, spec_id, remnant_id, length_mm, width_mm, parts_area, layout_json)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    );
    pending.forEach((b, i) => {
      insertBoard.run(
        id,
        i + 1,
        b.source,
        b.specId,
        b.remnantId,
        b.boardW,
        b.boardH,
        b.layout.partsArea,
        JSON.stringify(b.layout),
      );
    });

    db.prepare(
      `INSERT INTO audit_log (entity, entity_id, action, detail_json, created_at)
       VALUES ('plan', ?, 'generated', ?, ?)`,
    ).run(
      id,
      JSON.stringify({ orderId, version, boardsNew, remnantsUsed, changeId: opts.changeId ?? null }),
      at,
    );
    return id;
  })();

  return getPlan(db, planId);
}

/** 确认开料：方案落账，余料消耗、边角料登记、部件已开料数量累加 */
export function executePlan(db: DB, planId: number, at?: string): PlanView {
  const plan = db.prepare('SELECT * FROM nesting_plans WHERE id = ?').get(planId) as
    | NestingPlanRow
    | undefined;
  if (!plan) throw notFound('套裁方案不存在');
  if (plan.status !== 'draft') throw conflict('只有草稿状态的方案可以确认开料');

  const reqs = uncutRequirements(db, plan.order_id);
  if (snapshot(reqs) !== plan.requirements_json) {
    throw conflict('订单需求已变更，请重新生成套裁方案');
  }
  const boards = db
    .prepare('SELECT * FROM plan_boards WHERE plan_id = ? ORDER BY board_index')
    .all(planId) as PlanBoardRow[];
  for (const b of boards) {
    if (b.source_type === 'remnant') {
      const r = db.prepare('SELECT status FROM remnants WHERE id = ?').get(b.remnant_id) as
        | Pick<RemnantRow, 'status'>
        | undefined;
      if (!r || r.status !== 'available') {
        throw conflict(`余料 #${b.remnant_id} 已被占用，请重新生成套裁方案`);
      }
    }
  }

  const now = at ?? nowStr();
  db.transaction(() => {
    db.prepare(`UPDATE nesting_plans SET status = 'executed', executed_at = ? WHERE id = ?`).run(now, planId);

    const consumeRemnant = db.prepare(
      `UPDATE remnants SET status = 'consumed', consumed_at = ?, consumed_by_board_id = ? WHERE id = ?`,
    );
    const insertRemnant = db.prepare(
      `INSERT INTO remnants (spec_id, length_mm, width_mm, source, plan_board_id, order_id, status, location, created_at)
       VALUES (?,?,?,?,?,?, 'available', '', ?)`,
    );
    let registered = 0;
    for (const b of boards) {
      const layout = JSON.parse(b.layout_json) as BoardLayout;
      if (b.source_type === 'remnant') {
        consumeRemnant.run(now, b.id, b.remnant_id);
      }
      for (const r of layout.remnants) {
        insertRemnant.run(b.spec_id, r.w, r.h, 'plan', b.id, plan.order_id, now);
        registered++;
      }
    }

    // 按需求快照累加已开料数量
    const reqsSnapshot = JSON.parse(plan.requirements_json) as Array<
      [number, number, number, number, number]
    >;
    const bump = db.prepare('UPDATE order_items SET cut_quantity = cut_quantity + ? WHERE id = ?');
    for (const [itemId, , , , remaining] of reqsSnapshot) {
      bump.run(remaining, itemId);
    }

    const { c } = db
      .prepare('SELECT COUNT(*) AS c FROM order_items WHERE order_id = ? AND quantity > cut_quantity')
      .get(plan.order_id) as { c: number };
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(
      c === 0 ? 'done' : 'cutting',
      plan.order_id,
    );

    db.prepare(
      `INSERT INTO audit_log (entity, entity_id, action, detail_json, created_at)
       VALUES ('plan', ?, 'executed', ?, ?)`,
    ).run(
      planId,
      JSON.stringify({ orderId: plan.order_id, version: plan.version, registeredRemnants: registered }),
      now,
    );
  })();

  return getPlan(db, planId);
}

export function getPlan(db: DB, planId: number): PlanView {
  const plan = db.prepare('SELECT * FROM nesting_plans WHERE id = ?').get(planId) as
    | NestingPlanRow
    | undefined;
  if (!plan) throw notFound('套裁方案不存在');
  const boards = db
    .prepare(
      `SELECT pb.*, s.name AS spec_name
       FROM plan_boards pb JOIN board_specs s ON s.id = pb.spec_id
       WHERE pb.plan_id = ? ORDER BY pb.board_index`,
    )
    .all(planId) as Array<PlanBoardRow & { spec_name: string }>;
  const { requirements_json: _req, ...rest } = plan;
  return {
    ...rest,
    boards: boards.map((b) => ({
      id: b.id,
      board_index: b.board_index,
      source_type: b.source_type,
      remnant_id: b.remnant_id,
      spec_id: b.spec_id,
      spec_name: b.spec_name,
      length_mm: b.length_mm,
      width_mm: b.width_mm,
      parts_area: b.parts_area,
      layout: JSON.parse(b.layout_json) as BoardLayout,
    })),
  };
}

export function listPlans(db: DB, orderId: number): NestingPlanRow[] {
  return db
    .prepare('SELECT * FROM nesting_plans WHERE order_id = ? ORDER BY version DESC')
    .all(orderId) as NestingPlanRow[];
}
