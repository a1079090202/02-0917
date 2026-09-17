/**
 * 开料全流程（验收主线）：
 * 开一单 → 生成方案 → 看整板张数 → 确认开料 → 边角料登记进余料台账；
 * 余料台账有货时再开一单 → 先吃余料而不是开整板。
 */
import { describe, expect, it } from 'vitest';
import { createDb, type DB } from '../src/db';
import { createSpec } from '../src/modules/boards/service';
import { createOrder, getOrderDetail } from '../src/modules/orders/service';
import { executePlan, generatePlan } from '../src/modules/nesting/service';
import type { RemnantRow } from '../src/types';

function setup(): { db: DB; specId: number } {
  const db = createDb(':memory:');
  const spec = createSpec(db, {
    name: '颗粒板 2440×1220×18',
    length_mm: 2440,
    width_mm: 1220,
    thickness_mm: 18,
    material: '颗粒板',
  });
  return { db, specId: spec.id };
}

const remnants = (db: DB, status: string) =>
  db.prepare('SELECT * FROM remnants WHERE status = ? ORDER BY id').all(status) as RemnantRow[];

describe('开料全流程', () => {
  it('开单→方案→开料：整板张数正确，边角料登记进台账', () => {
    const { db, specId } = setup();
    const order = createOrder(db, {
      customer: '测试客户',
      note: '',
      items: [{ part_name: '面板', spec_id: specId, length_mm: 1500, width_mm: 800, quantity: 1 }],
    });

    const plan = generatePlan(db, order.order.id);
    expect(plan.status).toBe('draft');
    expect(plan.boards_new).toBe(1);
    expect(plan.remnants_used).toBe(0);
    // 1500×800 放在 2440×1220 上 → 余料 940×800 与 2440×420
    expect(plan.boards.length).toBe(1);
    const layout = plan.boards[0]!.layout;
    expect(layout.remnants).toHaveLength(2);
    const dims = layout.remnants.map((r) => `${r.w}x${r.h}`).sort();
    expect(dims).toEqual(['2440x420', '940x800']);

    // 草稿不登记余料
    expect(remnants(db, 'available')).toHaveLength(0);

    executePlan(db, plan.id, '2026-09-01 10:00:00');
    const available = remnants(db, 'available');
    expect(available).toHaveLength(2);
    expect(available.map((r) => `${r.length_mm}x${r.width_mm}`).sort()).toEqual([
      '2440x420',
      '940x800',
    ]);
    expect(available.every((r) => r.source === 'plan' && r.order_id === order.order.id)).toBe(true);

    const detail = getOrderDetail(db, order.order.id);
    expect(detail.order.status).toBe('done');
    expect(detail.items.every((i) => i.cut_quantity === i.quantity)).toBe(true);
  });

  it('余料台账有货时，新订单先吃余料而不是开整板', () => {
    const { db, specId } = setup();
    // 第一单：开出余料 940×800 和 2440×420
    const o1 = createOrder(db, {
      customer: '甲',
      note: '',
      items: [{ part_name: '面板', spec_id: specId, length_mm: 1500, width_mm: 800, quantity: 1 }],
    });
    executePlan(db, generatePlan(db, o1.order.id).id, '2026-09-01 10:00:00');

    // 第二单：900×700 小件，正好能吃 940×800 的余料
    const o2 = createOrder(db, {
      customer: '乙',
      note: '',
      items: [{ part_name: '层板', spec_id: specId, length_mm: 900, width_mm: 700, quantity: 1 }],
    });
    const plan2 = generatePlan(db, o2.order.id);
    expect(plan2.boards_new).toBe(0); // 不开整板
    expect(plan2.remnants_used).toBe(1); // 吃一块余料
    const board = plan2.boards[0]!;
    expect(board.source_type).toBe('remnant');
    expect(board.length_mm).toBe(940);
    expect(board.width_mm).toBe(800);

    executePlan(db, plan2.id, '2026-09-02 10:00:00');
    const consumed = remnants(db, 'consumed');
    expect(consumed).toHaveLength(1);
    expect(consumed[0]!.length_mm).toBe(940);
    expect(consumed[0]!.width_mm).toBe(800);
    // 940×800 切 900×700 后只剩碎料，不新增登记
    expect(remnants(db, 'available')).toHaveLength(1); // 还剩 2440×420
  });

  it('需求变更后旧草稿不能开料，需重新生成方案', () => {
    const { db, specId } = setup();
    const order = createOrder(db, {
      customer: '丙',
      note: '',
      items: [{ part_name: '面板', spec_id: specId, length_mm: 1500, width_mm: 800, quantity: 1 }],
    });
    const plan = generatePlan(db, order.order.id);
    // 直接改需求（模拟变更单之外的脏数据路径），执行应被拒绝
    db.prepare('UPDATE order_items SET quantity = 2 WHERE order_id = ?').run(order.order.id);
    expect(() => executePlan(db, plan.id)).toThrowError(/需求已变更/);
  });
});
