/**
 * 余料复用台账模块：查询、试算匹配（先吃哪块最省）。
 */
import { db } from '../db.js';
import { fitsRemnant, rankRemnants, type PartItem, type RemnantCandidate } from '../lib/packing.js';

export function listRemnants(filter: {
  spec_id?: number;
  status?: string;
  location?: string;
} = {}) {
  const where: string[] = [];
  const args: any[] = [];
  if (filter.spec_id) {
    where.push('r.spec_id=?');
    args.push(filter.spec_id);
  }
  if (filter.status) {
    where.push('r.status=?');
    args.push(filter.status);
  } else {
    where.push("r.status='available'");
  }
  if (filter.location) {
    where.push('r.location LIKE ?');
    args.push(`%${filter.location}%`);
  }
  return db()
    .prepare(
      `SELECT r.*, m.code AS spec_code, m.length AS spec_length, m.width AS spec_width,
              m.thickness AS spec_thickness,
              po.code AS produced_order_code,
              co.code AS consumed_order_code
       FROM remnants r
       JOIN materials m ON m.id=r.spec_id
       LEFT JOIN orders po ON po.id=r.produced_order_id
       LEFT JOIN orders co ON co.id=r.consumed_order_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY r.status ASC, r.area DESC, r.id DESC`,
    )
    .all(...args);
}

export function remnantSummary() {
  return db()
    .prepare(
      `SELECT m.id AS spec_id, m.code AS spec_code, COUNT(*) AS count,
              COALESCE(SUM(r.area),0) AS total_area
       FROM materials m
       LEFT JOIN remnants r ON r.spec_id=m.id AND r.status='available'
       GROUP BY m.id ORDER BY m.id`,
    )
    .all();
}

export interface MatchLine {
  remnant_id: number;
  spec_code: string;
  length: number;
  width: number;
  area: number;
  location: string;
  usable: boolean;               // 这块料至少能切一个部件
  matched_part: string | null;   // 建议先切的部件
  matched_dims: string | null;
  waste_area: number;            // 相对该部件的浪费面积 mm²
  rank_reason: string;
}

/**
 * 余料匹配试算：给定规格和部件清单，按“最省”排序返回余料建议。
 * 排序规则同套裁引擎：总面积差最小 → 短边差最小 → 小料优先。
 */
export function matchRemnants(specId: number, parts: PartItem[]): MatchLine[] {
  const rows = db()
    .prepare(
      `SELECT r.*, m.code AS spec_code FROM remnants r
       JOIN materials m ON m.id=r.spec_id
       WHERE r.spec_id=? AND r.status='available'
       ORDER BY r.area ASC, r.id ASC`,
    )
    .all(specId) as any[];

  const needArea = parts.reduce((s, p) => s + p.l * p.w, 0);
  const ranked = rankRemnants(
    rows.map((r) => ({ id: r.id, length: r.length, width: r.width })),
    parts,
  );
  const rowById = new Map<number, any>(rows.map((r) => [r.id, r]));

  return ranked.map((cand: RemnantCandidate, idx: number) => {
    const row = rowById.get(cand.id)!;
    // 找这块料能切的、面积最大的部件
    let best: PartItem | null = null;
    for (const p of parts) {
      if (fitsRemnant(cand, p)) {
        if (!best || p.l * p.w > best.l * best.w) best = p;
      }
    }
    const usable = !!best;
    const waste = best ? cand.length * cand.width - best.l * best.w : cand.length * cand.width;
    const reason = usable
      ? `浪费仅 ${waste}mm²（全单需 ${needArea}mm²，本料 ${cand.length * cand.width}mm²），${idx === 0 ? '最省，优先开' : `第 ${idx + 1} 顺位`}`
      : '没有部件能从这块料切出，暂不动用';
    return {
      remnant_id: cand.id,
      spec_code: row.spec_code,
      length: cand.length,
      width: cand.width,
      area: cand.length * cand.width,
      location: row.location,
      usable,
      matched_part: best?.name ?? null,
      matched_dims: best ? `${best.l}×${best.w}` : null,
      waste_area: waste,
      rank_reason: reason,
    };
  });
}
