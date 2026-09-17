import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, insertSpec } from './helpers.js';
import { fitsRemnant, rankRemnants, nest } from '../src/lib/packing.js';
import * as planning from '../src/modules/planning.js';
import * as remnants from '../src/modules/remnants.js';
import { db } from '../src/db.js';

beforeAll(async () => {
  await freshDb();
});

describe('余料匹配纯函数', () => {
  it('部件可旋转放入余料（含 3mm 锯路）', () => {
    expect(fitsRemnant({ length: 500, width: 800 }, { l: 700, w: 400 })).toBe(true);
    expect(fitsRemnant({ length: 500, width: 400 }, { l: 600, w: 450 })).toBe(false); // 603>500
    expect(fitsRemnant({ length: 1000, width: 350 }, { l: 300, w: 900 })).toBe(true); // 旋转后 903×303
    expect(fitsRemnant({ length: 1000, width: 200 }, { l: 300, w: 900 })).toBe(false); // 短边 303>200
  });

  it('rankRemnants 浪费最小的余料排最前（最省优先）', () => {
    const parts = [
      { demand_id: 1, name: '层板', l: 600, w: 400 },
      { demand_id: 1, name: '层板', l: 600, w: 400 },
    ];
    const need = 2 * 600 * 400; // 480000
    const ranked = rankRemnants(
      [
        { id: 1, length: 2000, width: 600 }, // 120万，浪费大
        { id: 2, length: 700, width: 700 },   // 49万，浪费仅 1 万
        { id: 3, length: 1000, width: 500 },  // 50万
      ],
      parts,
    );
    expect(ranked[0].id).toBe(2);
    expect(ranked.map((r) => r.id)).toEqual([2, 3, 1]);
    expect(need).toBe(480000);
  });

  it('面积全程整数，没有浮点尾数', () => {
    const r = rankRemnants([{ id: 9, length: 1234, width: 567 }], [
      { demand_id: 1, name: 'x', l: 333, w: 222 },
    ]);
    expect(Number.isInteger(r[0].length * r[0].width)).toBe(true);
  });
});

describe('套裁：先吃余料再开整板', () => {
  it('有余料能切时优先消耗余料，整板数相应减少', async () => {
    const specId = await insertSpec('PB-TEST-A');
    // 放一块 800×700 余料
    db()
      .prepare(
        `INSERT INTO remnants (spec_id, length, width, area, location)
         VALUES (?,?,?,?,?)`,
      )
      .run(specId, 800, 700, 800 * 700, '测试余料区');

    const orderId = planning.createOrder({
      code: 'T-REMNANT-1',
      customer: '测试客户',
      spec_id: specId,
      parts: [
        { name: '小层板', length: 600, width: 500, qty: 1 }, // 吃得下余料
        { name: '大侧板', length: 2200, width: 580, qty: 2 }, // 必须整板
      ],
    });

    const plan = planning.previewPlan(orderId);
    expect(plan.remnants_used.length).toBe(1);
    expect(plan.whole_sheets_used).toBe(1); // 两块大侧板一张板，小层板走余料
    const remnantBoard = plan.boards.find((b) => b.kind === 'remnant');
    expect(remnantBoard?.parts[0].name).toBe('小层板');

    // 确认开料后：余料被消耗，新切余料登记
    planning.commitCut(orderId);
    const consumed = db()
      .prepare("SELECT status FROM remnants WHERE length=800 AND width=700 AND spec_id=?")
      .get(specId) as any;
    expect(consumed.status).toBe('consumed');
    const fresh = db()
      .prepare("SELECT COUNT(*) c FROM remnants WHERE status='available' AND spec_id=?")
      .get(specId) as any;
    expect(fresh.c).toBeGreaterThan(0); // 切剩下的余料已登记
    const mat = db().prepare('SELECT stock_sheets FROM materials WHERE id=?').get(specId) as any;
    expect(mat.stock_sheets).toBe(99);
  });

  it('没有可用余料时全部走整板', async () => {
    const specId = await insertSpec('PB-TEST-B', [2440, 1220, 18], 50);
    const orderId = planning.createOrder({
      code: 'T-REMNANT-2',
      customer: '测试客户',
      spec_id: specId,
      parts: [{ name: '层板', length: 800, width: 400, qty: 4 }],
    });
    const plan = planning.previewPlan(orderId);
    expect(plan.remnants_used.length).toBe(0);
    expect(plan.whole_sheets_used).toBe(1);
  });

  it('规格/材质不同的余料不串用', async () => {
    // 另建一个 16mm 规格，余料属于它；18mm 单不能吃
    const otherId = await insertSpec('PB-TEST-16', [2440, 1220, 16], 50);
    db().prepare(
      `INSERT INTO remnants (spec_id, length, width, area, location) VALUES (?,?,?,?,?)`,
    ).run(otherId, 800, 700, 800 * 700, '16mm 余料');

    const mainId = (
      db().prepare("SELECT id FROM materials WHERE code='PB-TEST-A'").get() as any
    ).id;
    const orderId = planning.createOrder({
      code: 'T-REMNANT-3',
      customer: '测试客户',
      spec_id: mainId,
      parts: [{ name: '小层板', length: 600, width: 500, qty: 1 }],
    });
    const plan = planning.previewPlan(orderId);
    expect(plan.remnants_used.length).toBe(0);
    expect(plan.whole_sheets_used).toBe(1);
  });
});

describe('余料台账匹配试算', () => {
  it('matchRemnants 标注最省余料和可切部件', async () => {
    const specId = (
      db().prepare("SELECT id FROM materials WHERE code='PB-TEST-B'").get() as any
    ).id;
    // 登记两块大小不同的余料
    db().prepare(
      `INSERT INTO remnants (spec_id, length, width, area, location) VALUES (?,?,?,?,?)`,
    ).run(specId, 850, 450, 850 * 450, 'B架');
    db().prepare(
      `INSERT INTO remnants (spec_id, length, width, area, location) VALUES (?,?,?,?,?)`,
    ).run(specId, 2000, 600, 2000 * 600, 'A架');

    const lines = remnants.matchRemnants(specId, [
      { demand_id: 1, name: '层板', l: 800, w: 400 },
    ]);
    expect(lines[0].usable).toBe(true);
    expect(lines[0].matched_part).toBe('层板');
    // 850×450 比 2000×600 浪费少，应排第一
    expect(lines[0].length).toBe(850);
    expect(lines[0].waste_area).toBe(850 * 450 - 800 * 400);
  });
});

describe('nest 边界', () => {
  it('部件超过板面直接报错而不是静默多开板', () => {
    expect(() =>
      nest({
        spec_id: 1,
        sheet_length: 2440,
        sheet_width: 1220,
        parts: [{ demand_id: 1, name: '超大板', l: 2500, w: 1300 }],
        availableRemnants: [],
      }),
    ).toThrow(/超过板材规格/);
  });
});
