/**
 * 改单重算：
 * - 已开料的部件不许动（减到已开料数以下直接拒绝）；
 * - 只能追加或减少未开料部分；
 * - 改完自动重算套裁方案（新版本），耗板数前后对比留痕。
 */
import { describe, expect, it } from 'vitest';
import { createDb, type DB } from '../src/db';
import { createSpec } from '../src/modules/boards/service';
import { createOrder, getOrderDetail } from '../src/modules/orders/service';
import { executePlan, generatePlan } from '../src/modules/nesting/service';
import { applyChange } from '../src/modules/changes/service';
import type { AuditLogRow, NestingPlanRow } from '../src/types';

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

const plans = (db: DB, orderId: number) =>
  db
    .prepare('SELECT * FROM nesting_plans WHERE order_id = ? ORDER BY version')
    .all(orderId) as NestingPlanRow[];

describe('变更单', () => {
  it('已开料的部件不许减：减到已开料数以下被拒绝', () => {
    const { db, specId } = setup();
    const order = createOrder(db, {
      customer: '甲',
      note: '',
      items: [
        { part_name: '侧板', spec_id: specId, length_mm: 1500, width_mm: 800, quantity: 1 },
        { part_name: '层板', spec_id: specId, length_mm: 500, width_mm: 400, quantity: 4 },
      ],
    });
    executePlan(db, generatePlan(db, order.order.id).id, '2026-09-01 10:00:00');
    const items = getOrderDetail(db, order.order.id).items as Array<{
      id: number;
      part_name: string;
    }>;
    const side = items.find((i) => i.part_name === '侧板')!;
    const shelf = items.find((i) => i.part_name === '层板')!;

    expect(() =>
      applyChange(db, order.order.id, { reductions: [{ item_id: side.id, new_quantity: 0 }] }),
    ).toThrowError(/已开料 1 件/);
    expect(() =>
      applyChange(db, order.order.id, { reductions: [{ item_id: shelf.id, new_quantity: 2 }] }),
    ).toThrowError(/已开料 4 件/);
  });

  it('改单加两块层板：已开料部分不动，方案与耗板数重算并留痕', () => {
    const { db, specId } = setup();
    const order = createOrder(db, {
      customer: '乙',
      note: '',
      items: [{ part_name: '面板', spec_id: specId, length_mm: 1500, width_mm: 800, quantity: 1 }],
    });
    const plan1 = generatePlan(db, order.order.id);
    executePlan(db, plan1.id, '2026-09-01 10:00:00');

    const { change, plan: plan2 } = applyChange(db, order.order.id, {
      reason: '客户加两块层板',
      adds: [{ part_name: '层板', spec_id: specId, length_mm: 700, width_mm: 400, quantity: 2 }],
    });

    // 耗板数重算：整板数 = 已执行 1 张 + 新草稿 0 张（两块层板吃第一单留下的余料）
    expect(change.boards_before).toBe(1);
    expect(plan2).not.toBeNull();
    expect(plan2!.boards_new).toBe(0);
    expect(plan2!.remnants_used).toBe(1);
    expect(change.boards_after).toBe(1);
    expect(change.remnants_after).toBe(1);
    expect(change.plan_version_after).toBe(2);

    // 已开料的方案与部件不动
    const all = plans(db, order.order.id);
    expect(all).toHaveLength(2);
    expect(all[0]!.status).toBe('executed');
    expect(all[0]!.boards_new).toBe(1);
    expect(all[1]!.status).toBe('draft');
    const detail = getOrderDetail(db, order.order.id);
    const oldItem = (detail.items as Array<{ id: number; part_name: string; quantity: number; cut_quantity: number }>).find(
      (i) => i.part_name === '面板',
    )!;
    expect(oldItem.quantity).toBe(1);
    expect(oldItem.cut_quantity).toBe(1); // 已开料部分原封不动
    const newItem = (detail.items as Array<{ part_name: string; quantity: number; cut_quantity: number }>).find(
      (i) => i.part_name === '层板',
    )!;
    expect(newItem.quantity).toBe(2);
    expect(newItem.cut_quantity).toBe(0);

    // 留痕：变更单 + 审计日志
    const deltas = change.deltas as { added: Array<{ part_name: string; quantity: number }> };
    expect(deltas.added[0]).toMatchObject({ part_name: '层板', quantity: 2 });
    const audit = db
      .prepare(`SELECT * FROM audit_log WHERE entity = 'order' AND action = 'changed'`)
      .all() as AuditLogRow[];
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0]!.detail_json)).toMatchObject({ changeId: change.id });

    // 新方案开料后订单完成
    executePlan(db, plan2!.id, '2026-09-02 10:00:00');
    expect(getOrderDetail(db, order.order.id).order.status).toBe('done');
  });

  it('减少未开料部分：旧草稿作废，按新需求重算，耗板数下降', () => {
    const { db, specId } = setup();
    const order = createOrder(db, {
      customer: '丙',
      note: '',
      items: [
        { part_name: '面板', spec_id: specId, length_mm: 1500, width_mm: 800, quantity: 1 },
        { part_name: '层板', spec_id: specId, length_mm: 900, width_mm: 700, quantity: 3 },
      ],
    });
    const plan1 = generatePlan(db, order.order.id);
    // 1500×800 + 3×(900×700) = 1,200,000 + 1,890,000 = 3,090,000 > 2,976,800 → 2 张整板
    expect(plan1.boards_new).toBe(2);

    const items = getOrderDetail(db, order.order.id).items as Array<{
      id: number;
      part_name: string;
    }>;
    const shelf = items.find((i) => i.part_name === '层板')!;
    const { change, plan: plan2 } = applyChange(db, order.order.id, {
      reason: '客户减两块层板',
      reductions: [{ item_id: shelf.id, new_quantity: 1 }],
    });

    // 1,200,000 + 630,000 = 1,830,000 → 1 张整板
    expect(plan2).not.toBeNull();
    expect(plan2!.boards_new).toBe(1);
    expect(change.boards_before).toBe(2);
    expect(change.boards_after).toBe(1);

    const all = plans(db, order.order.id);
    expect(all[0]!.status).toBe('superseded'); // 旧草稿作废
    expect(all[1]!.status).toBe('draft');
  });

  it('变更内容为空被拒绝', () => {
    const { db, specId } = setup();
    const order = createOrder(db, {
      customer: '丁',
      note: '',
      items: [{ part_name: '面板', spec_id: specId, length_mm: 1500, width_mm: 800, quantity: 1 }],
    });
    expect(() => applyChange(db, order.order.id, { adds: [], reductions: [] })).toThrowError(
      /变更内容为空/,
    );
  });
});
