/**
 * 月末利用率统计（纯整数运算，比例返回千分比 permille）。
 *
 * 两个口径：
 *  1. 按整张数：整板上切出的部件面积 ÷（新开整板张数 × 单张面积）。
 *     分子只算落在整板上的部件，张数与面积可逐单对账。
 *  2. 按面积（含余料复用）：全部已开部件面积 ÷（新开整板面积 + 被复用余料面积）。
 *
 * 统计区间按方案确认开料时间 nesting_plans.created_at 归属月份。
 */
import { db } from '../db.js';
import { permille } from '../lib/geometry.js';
import type { MonthlyStats } from '../types.js';

interface PlanAggRow {
  plan_id: number;
  spec_id: number;
  sheet_area: number;     // 整板面积
  part_on_sheet: number;  // 落在整板上的部件面积
  part_on_remnant: number;// 落在余料上的部件面积
  whole_sheets: number;
  reused_area: number;
  order_id: number;
}

function aggregatePlans(month?: string): PlanAggRow[] {
  const pRows = month
    ? db()
        .prepare(
          `SELECT p.id AS plan_id, p.order_id, o.spec_id,
                  p.whole_sheets_used AS whole_sheets, p.reused_area,
                  m.length AS sl, m.width AS sw
           FROM nesting_plans p
           JOIN orders o ON o.id=p.order_id
           JOIN materials m ON m.id=o.spec_id
           WHERE strftime('%Y-%m', p.created_at)=?`,
        )
        .all(month)
    : db()
        .prepare(
          `SELECT p.id AS plan_id, p.order_id, o.spec_id,
                  p.whole_sheets_used AS whole_sheets, p.reused_area,
                  m.length AS sl, m.width AS sw
           FROM nesting_plans p
           JOIN orders o ON o.id=p.order_id
           JOIN materials m ON m.id=o.spec_id`,
        )
        .all();

  return (pRows as any[]).map((p) => {
    const areaSplit = db()
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN board_kind='sheet' THEN p_len*p_wid ELSE 0 END),0) AS on_sheet,
           COALESCE(SUM(CASE WHEN board_kind='remnant' THEN p_len*p_wid ELSE 0 END),0) AS on_remnant
         FROM placements WHERE plan_id=?`,
      )
      .get(p.plan_id) as any;
    return {
      plan_id: p.plan_id,
      spec_id: p.spec_id,
      order_id: p.order_id,
      whole_sheets: p.whole_sheets,
      reused_area: p.reused_area,
      sheet_area: p.whole_sheets * p.sl * p.sw,
      part_on_sheet: areaSplit.on_sheet,
      part_on_remnant: areaSplit.on_remnant,
    };
  });
}

export function monthlyStats(month: string): MonthlyStats {
  const rows = aggregatePlans(month);

  const wholeSheetsUsed = rows.reduce((s, r) => s + r.whole_sheets, 0);
  const wholeSheetArea = rows.reduce((s, r) => s + r.sheet_area, 0);
  const partOnSheet = rows.reduce((s, r) => s + r.part_on_sheet, 0);
  const partOnRemnant = rows.reduce((s, r) => s + r.part_on_remnant, 0);
  const partArea = partOnSheet + partOnRemnant;
  const reusedArea = rows.reduce((s, r) => s + r.reused_area, 0);
  const remnantConsumes = rows.reduce(
    (s, r) => s + JSON.parse(
      (db().prepare('SELECT remnants_used_json AS j FROM nesting_plans WHERE id=?').get(r.plan_id) as any).j,
    ).length,
    0,
  );
  const ordersCut = new Set(rows.map((r) => r.order_id)).size;

  const inv = db()
    .prepare(
      `SELECT COALESCE(COUNT(*),0) AS c, COALESCE(SUM(area),0) AS a
       FROM remnants WHERE status='available'`,
    )
    .get() as any;

  return {
    month,
    whole_sheets_used: wholeSheetsUsed,
    remnant_consumes: remnantConsumes,
    reused_area: reusedArea,
    part_area: partArea,
    whole_sheet_area: wholeSheetArea,
    utilized_by_sheets: permille(partOnSheet, wholeSheetArea),
    utilized_by_area: permille(partArea, wholeSheetArea + reusedArea),
    remnant_inventory_count: inv.c,
    remnant_inventory_area: inv.a,
    orders_cut: ordersCut,
  };
}

/** 按月列出统计行（近 12 个月有开料记录的月份） */
export function monthlyStatsRows(limit = 12): MonthlyStats[] {
  const months = db()
    .prepare(
      `SELECT DISTINCT strftime('%Y-%m', created_at) AS m FROM nesting_plans
       ORDER BY m DESC LIMIT ?`,
    )
    .all(limit) as any[];
  return months.map((x) => monthlyStats(x.m)).sort((a, b) => (a.month < b.month ? 1 : -1));
}

/** 按规格拆行，便于“张数对不上账”时逐规格核对 */
export function monthlyStatsBySpec(month: string) {
  const rows = aggregatePlans(month);
  const bySpec = new Map<number, any>();
  for (const r of rows) {
    if (!bySpec.has(r.spec_id)) {
      bySpec.set(r.spec_id, {
        spec_id: r.spec_id,
        spec: db().prepare('SELECT code, length, width, thickness FROM materials WHERE id=?').get(r.spec_id),
        whole_sheets_used: 0,
        whole_sheet_area: 0,
        part_on_sheet: 0,
        part_on_remnant: 0,
        reused_area: 0,
      });
    }
    const g = bySpec.get(r.spec_id);
    g.whole_sheets_used += r.whole_sheets;
    g.whole_sheet_area += r.sheet_area;
    g.part_on_sheet += r.part_on_sheet;
    g.part_on_remnant += r.part_on_remnant;
    g.reused_area += r.reused_area;
  }
  return [...bySpec.values()].map((g) => ({
    ...g,
    utilized_by_sheets: permille(g.part_on_sheet, g.whole_sheet_area),
    utilized_by_area: permille(
      g.part_on_sheet + g.part_on_remnant,
      g.whole_sheet_area + g.reused_area,
    ),
  }));
}
