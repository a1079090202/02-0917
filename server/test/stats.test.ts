import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, insertSpec, TEST_MONTH } from './helpers.js';
import * as planning from '../src/modules/planning.js';
import * as stats from '../src/modules/stats.js';
import { db } from '../src/db.js';
import { permille } from '../src/lib/geometry.js';

beforeAll(async () => {
  await freshDb();
});

describe('月末利用率（按整张数 / 按面积两个口径）', () => {
  it('两张数口径与逐单累加能对上账', async () => {
    const specId = await insertSpec('PB-STAT-1', [2440, 1220, 18], 100);
    const orderId = planning.createOrder({
      code: 'STAT-001',
      customer: '统计客户',
      spec_id: specId,
      parts: [
        { name: '侧板', length: 2200, width: 580, qty: 2 },
        { name: '层板', length: 800, width: 500, qty: 6 },
      ],
    });
    const { plan } = planning.commitCut(orderId);

    // 手工按 placements 重算一遍，作为对账基准
    const planId = db()
      .prepare('SELECT id FROM nesting_plans WHERE order_id=?')
      .get(orderId) as any;
    const split = db()
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN board_kind='sheet' THEN p_len*p_wid ELSE 0 END),0) AS on_sheet,
          COALESCE(SUM(CASE WHEN board_kind='remnant' THEN p_len*p_wid ELSE 0 END),0) AS on_rem
        FROM placements WHERE plan_id=?`,
      )
      .get(planId.id) as any;
    const sheetArea = plan.whole_sheets_used * 2440 * 1220;

    const s = stats.monthlyStats(TEST_MONTH);
    expect(s.whole_sheets_used).toBe(plan.whole_sheets_used);
    expect(s.whole_sheet_area).toBe(sheetArea);
    expect(s.part_area).toBe(split.on_sheet + split.on_rem);
    expect(s.utilized_by_sheets).toBe(permille(split.on_sheet, sheetArea));
    expect(Number.isInteger(s.utilized_by_sheets)).toBe(true);
    expect(s.utilized_by_sheets).toBeGreaterThan(0);
    expect(s.utilized_by_sheets).toBeLessThanOrEqual(1000);
  });

  it('余料复用只进面积口径分母，不进整张数口径', async () => {
    const specId = (
      db().prepare("SELECT id FROM materials WHERE code='PB-STAT-1'").get() as any
    ).id;

    // 人工放一块余料：1000×600
    db().prepare(
      `INSERT INTO remnants (spec_id, length, width, area, location) VALUES (?,?,?,?,?)`,
    ).run(specId, 1000, 600, 600000, '测试架');

    const orderId = planning.createOrder({
      code: 'STAT-002',
      customer: '统计客户B',
      spec_id: specId,
      parts: [
        { name: '抽屉板', length: 900, width: 500, qty: 1 }, // 走余料
        { name: '侧板', length: 2000, width: 550, qty: 2 },  // 走整板
      ],
    });
    const { plan } = planning.commitCut(orderId);
    expect(plan.remnants_used.length).toBe(1);

    const s = stats.monthlyStats(TEST_MONTH);
    // 复用面积 = 被吃余料的原面积
    expect(s.reused_area).toBeGreaterThanOrEqual(600000);
    // 按面积口径分母 = 整板面积 + 复用余料面积
    expect(s.utilized_by_area).toBe(
      permille(s.part_area, s.whole_sheet_area + s.reused_area),
    );
    // 复用料上的部件不计入“按整张数”分子
    const planRow = db()
      .prepare('SELECT id FROM nesting_plans WHERE order_id=? ORDER BY id DESC LIMIT 1')
      .get(orderId) as any;
    const onRem = db()
      .prepare(
        `SELECT COALESCE(SUM(p_len*p_wid),0) a FROM placements WHERE plan_id=? AND board_kind='remnant'`,
      )
      .get(planRow.id) as any;
    expect(onRem.a).toBe(900 * 500);
    expect(s.utilized_by_sheets).toBe(
      permille(s.part_area - onRem.a, s.whole_sheet_area),
    );
  });

  it('按规格拆行累加与月总一致', async () => {
    const rows = stats.monthlyStatsBySpec(TEST_MONTH);
    const s = stats.monthlyStats(TEST_MONTH);
    expect(rows.reduce((x, r) => x + r.whole_sheets_used, 0)).toBe(s.whole_sheets_used);
    expect(rows.reduce((x, r) => x + r.whole_sheet_area, 0)).toBe(s.whole_sheet_area);
    expect(rows.reduce((x, r) => x + r.part_on_sheet + r.part_on_remnant, 0)).toBe(
      s.part_area,
    );
    expect(rows.reduce((x, r) => x + r.reused_area, 0)).toBe(s.reused_area);
  });

  it('没有开料记录的月份返回零值，千分比为 0 而不是 NaN', () => {
    const s = stats.monthlyStats('2000-01');
    expect(s.whole_sheets_used).toBe(0);
    expect(s.part_area).toBe(0);
    expect(s.utilized_by_sheets).toBe(0);
    expect(s.utilized_by_area).toBe(0);
  });

  it('全部面积字段为整数（无浮点误差）', () => {
    const s = stats.monthlyStats(TEST_MONTH);
    for (const k of [
      'reused_area',
      'part_area',
      'whole_sheet_area',
      'remnant_inventory_area',
    ] as const) {
      expect(Number.isInteger(s[k]), `${k} 应为整数`).toBe(true);
    }
  });
});
