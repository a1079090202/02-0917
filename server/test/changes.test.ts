import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, insertSpec } from './helpers.js';
import * as planning from '../src/modules/planning.js';
import * as changes from '../src/modules/changes.js';
import { db } from '../src/db.js';

beforeAll(async () => {
  await freshDb();
});

function demandRows(orderId: number) {
  return db()
    .prepare('SELECT * FROM part_demands WHERE order_id=? ORDER BY id')
    .all(orderId) as any[];
}

function planRows(orderId: number) {
  return db()
    .prepare('SELECT * FROM nesting_plans WHERE order_id=? ORDER BY plan_version')
    .all(orderId) as any[];
}

describe('改单：已开料部分冻结 + 重算耗板 + 留痕', () => {
  it('已开料后追加部件：cut_qty 不动，新件未开，方案与耗板重算', async () => {
    const specId = await insertSpec('PB-CHG-18');
    const orderId = planning.createOrder({
      code: 'CHG-001',
      customer: '改单客户',
      spec_id: specId,
      parts: [
        { name: '侧板', length: 2000, width: 580, qty: 2 },
        { name: '层板', length: 800, width: 550, qty: 4 },
      ],
    });

    // 第一次开料
    const cut1 = planning.commitCut(orderId);
    expect(cut1.plan.whole_sheets_used).toBeGreaterThanOrEqual(1);
    const sheetsV1 = cut1.plan.whole_sheets_used;

    const before = demandRows(orderId);
    expect(before.find((d) => d.name === '层板').cut_qty).toBe(4);

    // 客户追加两块层板
    const result = changes.applyChange(orderId, {
      kind: 'append',
      name: '层板',
      length: 800,
      width: 550,
      qty_delta: 2,
      note: '客户加层板',
    });

    const after = demandRows(orderId);
    const shelf = after.find((d) => d.name === '层板');
    // 已开 4 件纹丝不动
    expect(shelf.cut_qty).toBe(4);
    // 需求变成 6，未开 2
    expect(shelf.qty).toBe(6);
    expect(shelf.qty - shelf.cut_qty).toBe(2);

    // 重算后总耗板 = 已耗 + 未开部分新方案
    expect(result.sheets_before).toBe(sheetsV1);
    expect(result.sheets_after).toBe(result.already_cut_sheets + (result.after_plan?.whole_sheets_used ?? 0));
    expect(result.sheets_after).toBeGreaterThanOrEqual(result.sheets_before);

    // 留痕
    const log = db()
      .prepare('SELECT * FROM change_orders WHERE order_id=?')
      .all(orderId) as any[];
    expect(log).toHaveLength(1);
    expect(log[0].kind).toBe('append');
    expect(log[0].qty_delta).toBe(2);
    expect(log[0].version_after).toBe(log[0].version_before + 1);

    // 订单版本号 +1
    const o = db().prepare('SELECT version, status FROM orders WHERE id=?').get(orderId) as any;
    expect(o.version).toBe(2);
    expect(o.status).toBe('in_cutting');

    // 把追加的两块也开掉，方案为第 2 版，且只包含未开的 2 件
    const cut2 = planning.commitCut(orderId);
    expect(cut2.plan.boards.reduce((s, b) => s + b.parts.length, 0)).toBe(2);
    expect(cut2.plan.boards.every((b) => b.parts.every((p) => p.name === '层板'))).toBe(true);

    // 历史方案保留两版，可追溯
    const plans = planRows(orderId);
    expect(plans).toHaveLength(2);
    expect(plans.map((p) => p.is_current)).toEqual([0, 1]);
    const totalSheets = plans.reduce((s, p) => s + p.whole_sheets_used, 0);
    expect(totalSheets).toBe(result.sheets_after); // 月末按方案累加与此一致

    const finalShelf = demandRows(orderId).find((d) => d.name === '层板');
    expect(finalShelf.cut_qty).toBe(6);
  });

  it('减少数量不能动已开料部分，超减直接拒绝', async () => {
    const specId = await insertSpec('PB-CHG-18B');
    const orderId = planning.createOrder({
      code: 'CHG-002',
      customer: '改单客户B',
      spec_id: specId,
      parts: [{ name: '层板', length: 800, width: 500, qty: 6 }],
    });
    planning.commitCut(orderId); // 6 块全开
    const shelfId = demandRows(orderId)[0].id;

    expect(() =>
      changes.applyChange(orderId, { kind: 'reduce', demand_id: shelfId, qty_delta: 1 }),
    ).toThrow(/已开料/);

    // 数据没变
    const d = demandRows(orderId)[0];
    expect(d.qty).toBe(6);
    expect(d.cut_qty).toBe(6);
  });

  it('开料前可以减少未开料数量，耗板数随之重算', async () => {
    const specId = await insertSpec('PB-CHG-18C');
    const orderId = planning.createOrder({
      code: 'CHG-003',
      customer: '改单客户C',
      spec_id: specId,
      parts: [
        { name: '侧板', length: 2200, width: 500, qty: 2 },
        { name: '层板', length: 900, width: 450, qty: 10 },
      ],
    });
    const beforePreview = planning.previewPlan(orderId).whole_sheets_used;

    const shelfId = demandRows(orderId).find((d) => d.name === '层板').id;
    const result = changes.applyChange(orderId, {
      kind: 'reduce',
      demand_id: shelfId,
      qty_delta: 4,
      note: '减少 4 块',
    });

    const shelf = demandRows(orderId).find((d) => d.name === '层板');
    expect(shelf.qty).toBe(6);
    expect(shelf.cut_qty).toBe(0);
    expect(result.sheets_before).toBe(beforePreview);
    expect(result.sheets_after).toBeLessThanOrEqual(result.sheets_before);

    // 开料后实际耗板与重算一致
    const cut = planning.commitCut(orderId);
    expect(cut.plan.whole_sheets_used).toBe(result.sheets_after);
  });

  it('追加与已有行同名同尺寸时合并数量而不是新开部件行', async () => {
    const specId = await insertSpec('PB-CHG-18D');
    const orderId = planning.createOrder({
      code: 'CHG-004',
      customer: '改单客户D',
      spec_id: specId,
      parts: [{ name: '背板', length: 1000, width: 400, qty: 2 }],
    });
    changes.applyChange(orderId, {
      kind: 'append',
      name: '背板',
      length: 1000,
      width: 400,
      qty_delta: 3,
    });
    const rows = demandRows(orderId);
    expect(rows).toHaveLength(1);
    expect(rows[0].qty).toBe(5);
  });
});
