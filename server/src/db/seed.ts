/**
 * 演示数据：5 种板材规格、10 个订单（其中 2 个走过变更单）、一批边角料。
 * 全部通过 service 层写入，因此套裁方案、余料台账、变更留痕都是真实计算出来的。
 * 仅在数据库为空时写入；直接运行 `npm run seed` 可查看状态，`--reset` 可清空重灌。
 */
import { createDb, type DB } from './index';
import { createSpec } from '../modules/boards/service';
import { createOrder } from '../modules/orders/service';
import { generatePlan, executePlan } from '../modules/nesting/service';
import { applyChange } from '../modules/changes/service';

export function seedIfEmpty(db: DB): boolean {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM board_specs').get() as { c: number };
  if (c > 0) return false;
  seed(db);
  return true;
}

function seed(db: DB): void {
  // ── 板材台账：5 种规格 ─────────────────────────────
  const s1 = createSpec(db, { name: '颗粒板 2440×1220×18', length_mm: 2440, width_mm: 1220, thickness_mm: 18, material: '颗粒板' }, '2026-08-01 08:00:00').id;
  const s2 = createSpec(db, { name: '多层板 2440×1220×18', length_mm: 2440, width_mm: 1220, thickness_mm: 18, material: '多层板' }, '2026-08-01 08:00:00').id;
  const s3 = createSpec(db, { name: '颗粒板 2440×1220×25', length_mm: 2440, width_mm: 1220, thickness_mm: 25, material: '颗粒板' }, '2026-08-01 08:00:00').id;
  const s4 = createSpec(db, { name: '密度板 2440×1220×9', length_mm: 2440, width_mm: 1220, thickness_mm: 9, material: '密度板' }, '2026-08-01 08:00:00').id;
  const s5 = createSpec(db, { name: '颗粒板 2800×1220×18', length_mm: 2800, width_mm: 1220, thickness_mm: 18, material: '颗粒板' }, '2026-08-01 08:00:00').id;

  // ── 期初边角料（老库存，登记位置） ──────────────────
  const insR = db.prepare(
    `INSERT INTO remnants (spec_id, length_mm, width_mm, source, plan_board_id, order_id, status, location, created_at)
     VALUES (?,?,?,'initial',NULL,NULL,'available',?,?)`,
  );
  insR.run(s1, 1200, 800, 'A区-01', '2026-08-01 09:00:00');
  insR.run(s1, 900, 600, 'A区-02', '2026-08-01 09:00:00');
  insR.run(s1, 2440, 300, 'A区-03', '2026-08-01 09:00:00');
  insR.run(s2, 1000, 500, 'B区-01', '2026-08-01 09:00:00');
  insR.run(s5, 1400, 700, 'C区-01', '2026-08-01 09:00:00');

  // ── 10 个订单 ─────────────────────────────────────
  const run = (orderId: number, at: string) => {
    const plan = generatePlan(db, orderId, { at });
    executePlan(db, plan.id, at);
  };

  // SO-0001 衣柜（8 月，已完成）
  const o1 = createOrder(db, {
    customer: '张敏', note: '主卧衣柜', items: [
      { part_name: '侧板', spec_id: s1, length_mm: 1800, width_mm: 560, quantity: 2 },
      { part_name: '顶底板', spec_id: s1, length_mm: 800, width_mm: 560, quantity: 2 },
      { part_name: '层板', spec_id: s1, length_mm: 800, width_mm: 560, quantity: 3 },
      { part_name: '背板', spec_id: s4, length_mm: 1800, width_mm: 800, quantity: 1 },
      { part_name: '抽屉侧板', spec_id: s1, length_mm: 400, width_mm: 150, quantity: 4 },
      { part_name: '抽屉底板', spec_id: s4, length_mm: 400, width_mm: 400, quantity: 2 },
    ],
  }, '2026-08-03 10:00:00');
  run(o1.order.id, '2026-08-04 08:30:00');

  // SO-0002 书柜（8 月，已完成）
  const o2 = createOrder(db, {
    customer: '李强', note: '书房书柜', items: [
      { part_name: '侧板', spec_id: s1, length_mm: 1200, width_mm: 300, quantity: 2 },
      { part_name: '层板', spec_id: s1, length_mm: 760, width_mm: 300, quantity: 4 },
      { part_name: '顶板', spec_id: s1, length_mm: 800, width_mm: 300, quantity: 1 },
      { part_name: '背板', spec_id: s4, length_mm: 1200, width_mm: 800, quantity: 1 },
    ],
  }, '2026-08-10 09:00:00');
  run(o2.order.id, '2026-08-11 08:30:00');

  // SO-0003 橱柜（8 月，已完成，多层板 + 25 厚台面）
  const o3 = createOrder(db, {
    customer: '王芳', note: '厨房橱柜', items: [
      { part_name: '地柜侧板', spec_id: s2, length_mm: 720, width_mm: 560, quantity: 4 },
      { part_name: '层板', spec_id: s2, length_mm: 600, width_mm: 560, quantity: 4 },
      { part_name: '台面', spec_id: s3, length_mm: 1800, width_mm: 600, quantity: 1 },
    ],
  }, '2026-08-18 14:00:00');
  run(o3.order.id, '2026-08-19 08:30:00');

  // SO-0004 办公桌（8 月，已完成）
  const o4 = createOrder(db, {
    customer: '赵磊', note: '办公桌两张', items: [
      { part_name: '桌面', spec_id: s3, length_mm: 1400, width_mm: 700, quantity: 2 },
      { part_name: '侧挡板', spec_id: s1, length_mm: 700, width_mm: 500, quantity: 2 },
      { part_name: '抽屉面', spec_id: s1, length_mm: 350, width_mm: 160, quantity: 3 },
    ],
  }, '2026-08-25 10:00:00');
  run(o4.order.id, '2026-08-26 08:30:00');

  // SO-0005 高柜（9 月，已完成，2800 大板）
  const o5 = createOrder(db, {
    customer: '陈静', note: '通顶高柜', items: [
      { part_name: '侧板', spec_id: s5, length_mm: 2400, width_mm: 580, quantity: 2 },
      { part_name: '层板', spec_id: s5, length_mm: 860, width_mm: 580, quantity: 5 },
      { part_name: '顶板', spec_id: s5, length_mm: 900, width_mm: 580, quantity: 1 },
    ],
  }, '2026-09-02 09:00:00');
  run(o5.order.id, '2026-09-03 08:30:00');

  // SO-0006 电视柜（9 月，已完成；后变更加两块层板）★ 改过单 1
  const o6 = createOrder(db, {
    customer: '刘洋', note: '客厅电视柜', items: [
      { part_name: '侧板', spec_id: s1, length_mm: 450, width_mm: 400, quantity: 2 },
      { part_name: '层板', spec_id: s1, length_mm: 1160, width_mm: 400, quantity: 2 },
      { part_name: '背板', spec_id: s4, length_mm: 1200, width_mm: 450, quantity: 1 },
    ],
  }, '2026-09-05 09:00:00');
  run(o6.order.id, '2026-09-06 08:30:00');
  const ch6 = applyChange(db, o6.order.id, {
    reason: '客户要求加两块层板',
    adds: [{ part_name: '层板', spec_id: s1, length_mm: 1160, width_mm: 400, quantity: 2 }],
  }, '2026-09-08 10:00:00');
  if (ch6.plan) executePlan(db, ch6.plan.id, '2026-09-08 14:00:00');

  // SO-0007 床头柜（9 月，已完成；后变更加两块层板）★ 改过单 2
  const o7 = createOrder(db, {
    customer: '孙丽', note: '床头柜两个', items: [
      { part_name: '侧板', spec_id: s1, length_mm: 400, width_mm: 380, quantity: 4 },
      { part_name: '层板', spec_id: s1, length_mm: 360, width_mm: 380, quantity: 4 },
      { part_name: '抽屉侧板', spec_id: s1, length_mm: 300, width_mm: 120, quantity: 4 },
    ],
  }, '2026-09-09 09:00:00');
  run(o7.order.id, '2026-09-10 08:30:00');
  const ch7 = applyChange(db, o7.order.id, {
    reason: '客户每个床头柜多加一块层板',
    adds: [{ part_name: '层板', spec_id: s1, length_mm: 360, width_mm: 380, quantity: 2 }],
  }, '2026-09-12 10:00:00');
  if (ch7.plan) executePlan(db, ch7.plan.id, '2026-09-12 14:00:00');

  // SO-0008 储物柜（方案已生成，待开料）
  const o8 = createOrder(db, {
    customer: '周杰', note: '阳台储物柜', items: [
      { part_name: '侧板', spec_id: s1, length_mm: 900, width_mm: 450, quantity: 2 },
      { part_name: '层板', spec_id: s1, length_mm: 860, width_mm: 450, quantity: 3 },
    ],
  }, '2026-09-14 09:00:00');
  generatePlan(db, o8.order.id, { at: '2026-09-14 15:00:00' });

  // SO-0009 茶水柜（待排版）
  createOrder(db, {
    customer: '吴敏', note: '办公室茶水柜', items: [
      { part_name: '侧板', spec_id: s1, length_mm: 800, width_mm: 560, quantity: 2 },
      { part_name: '层板', spec_id: s1, length_mm: 760, width_mm: 560, quantity: 2 },
    ],
  }, '2026-09-15 10:00:00');

  // SO-0010 展示架（待排版）
  createOrder(db, {
    customer: '郑凯', note: '门店展示架', items: [
      { part_name: '立板', spec_id: s2, length_mm: 1500, width_mm: 350, quantity: 2 },
      { part_name: '横板', spec_id: s2, length_mm: 600, width_mm: 350, quantity: 6 },
    ],
  }, '2026-09-16 10:00:00');
}

// 直接运行：npm run seed [-- --reset]
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  const db = createDb();
  if (process.argv.includes('--reset')) {
    db.exec(`
      DELETE FROM audit_log; DELETE FROM change_orders; DELETE FROM remnants;
      DELETE FROM plan_boards; DELETE FROM nesting_plans; DELETE FROM order_items;
      DELETE FROM orders; DELETE FROM board_specs;
      DELETE FROM sqlite_sequence;
    `);
    console.log('已清空全部数据');
  }
  const done = seedIfEmpty(db);
  const counts = {
    板材规格: (db.prepare('SELECT COUNT(*) c FROM board_specs').get() as { c: number }).c,
    订单: (db.prepare('SELECT COUNT(*) c FROM orders').get() as { c: number }).c,
    变更单: (db.prepare('SELECT COUNT(*) c FROM change_orders').get() as { c: number }).c,
    余料: (db.prepare('SELECT COUNT(*) c FROM remnants').get() as { c: number }).c,
  };
  console.log(done ? '演示数据已写入' : '数据库非空，未重复写入');
  console.log(counts);
}
