import type { DB } from '../../db';
import { badRequest, notFound } from '../../core/errors';
import { nowStr } from '../../core/time';
import { listPlans } from '../nesting/service';
import type { AuditLogRow, ChangeOrderRow, OrderItemRow, OrderRow } from '../../types';

export interface OrderItemInput {
  part_name: string;
  spec_id: number;
  length_mm: number;
  width_mm: number;
  quantity: number;
}

/** 校验一个部件行（新建订单 / 变更追加共用） */
export function validateItem(db: DB, it: unknown): OrderItemInput {
  const p = (it ?? {}) as Record<string, unknown>;
  const partName = String(p.part_name ?? '').trim();
  if (!partName) throw badRequest('部件名不能为空');
  if (!Number.isInteger(p.spec_id)) throw badRequest(`部件「${partName}」缺少板材规格`);
  const spec = db
    .prepare('SELECT id, length_mm, width_mm FROM board_specs WHERE id = ?')
    .get(p.spec_id) as { id: number; length_mm: number; width_mm: number } | undefined;
  if (!spec) throw badRequest(`板材规格 #${p.spec_id} 不存在`);
  const dims: Array<[string, unknown]> = [
    ['长', p.length_mm],
    ['宽', p.width_mm],
    ['数量', p.quantity],
  ];
  for (const [label, v] of dims) {
    if (!Number.isInteger(v) || (v as number) <= 0) {
      throw badRequest(`部件「${partName}」的${label}必须为正整数`);
    }
  }
  const fits =
    ((p.length_mm as number) <= spec.length_mm && (p.width_mm as number) <= spec.width_mm) ||
    ((p.length_mm as number) <= spec.width_mm && (p.width_mm as number) <= spec.length_mm);
  if (!fits) {
    throw badRequest(
      `部件「${partName}」${p.length_mm}×${p.width_mm} 超出整板尺寸 ${spec.length_mm}×${spec.width_mm}`,
    );
  }
  return {
    part_name: partName,
    spec_id: p.spec_id as number,
    length_mm: p.length_mm as number,
    width_mm: p.width_mm as number,
    quantity: p.quantity as number,
  };
}

export function createOrder(
  db: DB,
  payload: unknown,
  at: string = nowStr(),
): ReturnType<typeof getOrderDetail> {
  const p = (payload ?? {}) as Record<string, unknown>;
  const customer = String(p.customer ?? '').trim();
  if (!customer) throw badRequest('客户不能为空');
  if (!Array.isArray(p.items) || p.items.length === 0) throw badRequest('至少需要一个部件');
  const items = p.items.map((it) => validateItem(db, it));

  const orderId = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO orders (code, customer, note, status, created_at)
         VALUES ((SELECT printf('SO-%04d', COALESCE(MAX(id), 0) + 1) FROM orders), ?, ?, 'open', ?)`,
      )
      .run(customer, String(p.note ?? ''), at);
    const id = Number(info.lastInsertRowid);
    const ins = db.prepare(
      `INSERT INTO order_items (order_id, part_name, spec_id, length_mm, width_mm, quantity, cut_quantity, created_at)
       VALUES (?,?,?,?,?,?,0,?)`,
    );
    for (const it of items) {
      ins.run(id, it.part_name, it.spec_id, it.length_mm, it.width_mm, it.quantity, at);
    }
    db.prepare(
      `INSERT INTO audit_log (entity, entity_id, action, detail_json, created_at)
       VALUES ('order', ?, 'created', ?, ?)`,
    ).run(id, JSON.stringify({ customer, itemCount: items.length }), at);
    return id;
  })();

  return getOrderDetail(db, orderId);
}

export function listOrders(db: DB) {
  return db
    .prepare(
      `SELECT o.*,
         (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count,
         (SELECT COALESCE(SUM(quantity), 0) FROM order_items i WHERE i.order_id = o.id) AS parts_total,
         (SELECT COALESCE(SUM(cut_quantity), 0) FROM order_items i WHERE i.order_id = o.id) AS parts_cut,
         (SELECT COALESCE(SUM(boards_new), 0) FROM nesting_plans p WHERE p.order_id = o.id AND p.status = 'executed') AS boards_used,
         (SELECT COALESCE(SUM(remnants_used), 0) FROM nesting_plans p WHERE p.order_id = o.id AND p.status = 'executed') AS remnants_used
       FROM orders o ORDER BY o.id DESC`,
    )
    .all();
}

export interface OrderItemView extends OrderItemRow {
  spec_name: string;
  material: string;
  thickness_mm: number;
}

export function getOrderDetail(db: DB, id: number) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined;
  if (!order) throw notFound('订单不存在');
  const items = db
    .prepare(
      `SELECT i.*, s.name AS spec_name, s.material, s.thickness_mm
       FROM order_items i JOIN board_specs s ON s.id = i.spec_id
       WHERE i.order_id = ? ORDER BY i.id`,
    )
    .all(id) as OrderItemView[];
  const plans = listPlans(db, id);
  const changes = (
    db.prepare('SELECT * FROM change_orders WHERE order_id = ? ORDER BY id').all(id) as ChangeOrderRow[]
  ).map((c) => ({ ...c, deltas: JSON.parse(c.deltas_json) as unknown }));
  return { order, items, plans, changes };
}

/** 订单操作留痕：建单、方案生成/执行、变更 */
export function orderAudit(db: DB, orderId: number): AuditLogRow[] {
  return db
    .prepare(
      `SELECT * FROM audit_log
       WHERE (entity = 'order' AND entity_id = ?)
          OR (entity = 'plan' AND entity_id IN (SELECT id FROM nesting_plans WHERE order_id = ?))
       ORDER BY id`,
    )
    .all(orderId, orderId) as AuditLogRow[];
}
