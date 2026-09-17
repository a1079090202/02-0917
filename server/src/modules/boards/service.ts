import type { DB } from '../../db';
import { badRequest } from '../../core/errors';
import { nowStr } from '../../core/time';
import type { BoardSpecRow } from '../../types';

export interface BoardSpecView extends BoardSpecRow {
  area_mm2: number;
}

export function listSpecs(db: DB): BoardSpecView[] {
  const rows = db.prepare('SELECT * FROM board_specs ORDER BY id').all() as BoardSpecRow[];
  return rows.map((r) => ({ ...r, area_mm2: r.length_mm * r.width_mm }));
}

export function getSpec(db: DB, id: number): BoardSpecRow | undefined {
  return db.prepare('SELECT * FROM board_specs WHERE id = ?').get(id) as BoardSpecRow | undefined;
}

export function createSpec(db: DB, payload: unknown, at: string = nowStr()): BoardSpecView {
  const p = (payload ?? {}) as Record<string, unknown>;
  const name = String(p.name ?? '').trim();
  const material = String(p.material ?? '').trim();
  if (!name) throw badRequest('规格名称不能为空');
  if (!material) throw badRequest('材质不能为空');
  const dims: Array<[string, unknown]> = [
    ['长度', p.length_mm],
    ['宽度', p.width_mm],
    ['厚度', p.thickness_mm],
  ];
  for (const [label, v] of dims) {
    if (!Number.isInteger(v) || (v as number) <= 0) {
      throw badRequest(`${label}必须为正整数（毫米）`);
    }
  }
  const info = db
    .prepare(
      'INSERT INTO board_specs (name, length_mm, width_mm, thickness_mm, material, created_at) VALUES (?,?,?,?,?,?)',
    )
    .run(name, p.length_mm, p.width_mm, p.thickness_mm, material, at);
  const row = getSpec(db, Number(info.lastInsertRowid))!;
  return { ...row, area_mm2: row.length_mm * row.width_mm };
}
