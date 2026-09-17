import type { DB } from '../../db';
import { badRequest, notFound } from '../../core/errors';
import type { RemnantRow } from '../../types';

export interface RemnantQuery {
  status?: string;
  spec_id?: number;
}

/** 余料复用台账：可用/已用，按规格筛选 */
export function listRemnants(db: DB, query: RemnantQuery = {}) {
  let sql = `
    SELECT r.*, s.name AS spec_name, s.material, s.thickness_mm,
           o.code AS source_order_code,
           pb.plan_id AS source_plan_id,
           cb.plan_id AS consumed_by_plan_id
    FROM remnants r
    JOIN board_specs s ON s.id = r.spec_id
    LEFT JOIN orders o ON o.id = r.order_id
    LEFT JOIN plan_boards pb ON pb.id = r.plan_board_id
    LEFT JOIN plan_boards cb ON cb.id = r.consumed_by_board_id`;
  const conds: string[] = [];
  const args: unknown[] = [];
  if (query.status) {
    if (!['available', 'consumed'].includes(query.status)) throw badRequest('状态无效');
    conds.push('r.status = ?');
    args.push(query.status);
  }
  if (query.spec_id !== undefined) {
    conds.push('r.spec_id = ?');
    args.push(query.spec_id);
  }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY r.status, r.id';
  const rows = db.prepare(sql).all(...args) as Array<RemnantRow & Record<string, unknown>>;
  return rows.map((r) => ({ ...r, area_mm2: r.length_mm * r.width_mm }));
}

/** 更新存放位置（如 "A区-03"） */
export function updateLocation(db: DB, id: number, payload: unknown) {
  const row = db.prepare('SELECT * FROM remnants WHERE id = ?').get(id) as RemnantRow | undefined;
  if (!row) throw notFound('余料不存在');
  const location = String((payload as Record<string, unknown>)?.location ?? '').trim();
  db.prepare('UPDATE remnants SET location = ? WHERE id = ?').run(location, id);
  return db.prepare('SELECT * FROM remnants WHERE id = ?').get(id);
}
