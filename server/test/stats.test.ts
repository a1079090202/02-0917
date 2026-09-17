/**
 * 利用率统计：
 * - 两个口径（按整张数 / 按面积）的分子分母与万分比；
 * - 对账等式：投入 = 部件 + 回收余料 + 损耗（恒等）；
 * - 余料复用台账月结：期初 + 登记 - 耗用 = 期末。
 *
 * 固定数据（手算可核对）：
 *   整板 2440×1220 = 2,976,800 mm²
 *   订单一：面板 1500×800（1 张整板）→ 余料 940×800、2440×420
 *   订单二：层板 900×700（吃 940×800 余料，不开整板）
 */
import { describe, expect, it } from 'vitest';
import { createDb, type DB } from '../src/db';
import { createSpec } from '../src/modules/boards/service';
import { createOrder } from '../src/modules/orders/service';
import { executePlan, generatePlan } from '../src/modules/nesting/service';
import { remnantLedger, utilization } from '../src/modules/stats/service';

const BOARD = 2440 * 1220; // 2,976,800
const PART1 = 1500 * 800; // 1,200,000
const PART2 = 900 * 700; // 630,000
const REM_A = 940 * 800; // 752,000（被订单二吃掉）
const REM_B = 2440 * 420; // 1,024,800（留在台账）

function setup(): { db: DB } {
  const db = createDb(':memory:');
  const spec = createSpec(db, {
    name: '颗粒板 2440×1220×18',
    length_mm: 2440,
    width_mm: 1220,
    thickness_mm: 18,
    material: '颗粒板',
  });
  const o1 = createOrder(db, {
    customer: '甲',
    note: '',
    items: [{ part_name: '面板', spec_id: spec.id, length_mm: 1500, width_mm: 800, quantity: 1 }],
  });
  executePlan(db, generatePlan(db, o1.order.id).id, '2026-09-05 10:00:00');
  const o2 = createOrder(db, {
    customer: '乙',
    note: '',
    items: [{ part_name: '层板', spec_id: spec.id, length_mm: 900, width_mm: 700, quantity: 1 }],
  });
  executePlan(db, generatePlan(db, o2.order.id).id, '2026-09-06 10:00:00');
  return { db };
}

describe('利用率统计', () => {
  it('按整张数口径：整板切出的部件面积 ÷ 整板总面积', () => {
    const { db } = setup();
    const s = utilization(db, '2026-09');
    expect(s.boards.newCount).toBe(1);
    expect(s.boards.newArea).toBe(BOARD);
    expect(s.byCount.numerator).toBe(PART1);
    expect(s.byCount.denominator).toBe(BOARD);
    expect(s.byCount.pctX100).toBe(4031); // floor(1,200,000×10000 / 2,976,800)
  });

  it('按面积口径：全部部件面积 ÷（整板 + 耗用余料）', () => {
    const { db } = setup();
    const s = utilization(db, '2026-09');
    expect(s.boards.remnantCount).toBe(1);
    expect(s.boards.remnantArea).toBe(REM_A);
    expect(s.byArea.numerator).toBe(PART1 + PART2);
    expect(s.byArea.denominator).toBe(BOARD + REM_A);
    expect(s.byArea.pctX100).toBe(4907); // floor(1,830,000×10000 / 3,728,800)
  });

  it('对账等式：投入 = 部件 + 回收余料 + 损耗', () => {
    const { db } = setup();
    const s = utilization(db, '2026-09');
    // 订单一：余料两块全登记，损耗 0；订单二：940×800 切 900×700 后全是碎料，损耗 122,000
    expect(s.remnantsRegistered.count).toBe(2);
    expect(s.remnantsRegistered.area).toBe(REM_A + REM_B);
    expect(s.wasteArea).toBe(REM_A - PART2);
    expect(s.balance.inputs).toBe(BOARD + REM_A);
    expect(s.balance.outputs).toBe(PART1 + PART2 + (REM_A + REM_B) + (REM_A - PART2));
    expect(s.balance.ok).toBe(true);
  });

  it('余料台账月结：期初 + 登记 - 耗用 = 期末', () => {
    const { db } = setup();
    const l = remnantLedger(db, '2026-09');
    expect(l.opening).toEqual({ count: 0, area: 0 });
    expect(l.registered).toEqual({ count: 2, area: REM_A + REM_B });
    expect(l.consumed).toEqual({ count: 1, area: REM_A });
    expect(l.closing).toEqual({ count: 1, area: REM_B });
  });

  it('没有开料的月份：全部为 0，万分比为 null', () => {
    const { db } = setup();
    const s = utilization(db, '2026-08');
    expect(s.boards.newCount).toBe(0);
    expect(s.byCount.pctX100).toBeNull();
    expect(s.byArea.pctX100).toBeNull();
    expect(s.balance.ok).toBe(true);
  });

  it('月份格式错误被拒绝', () => {
    const { db } = setup();
    expect(() => utilization(db, '2026-13')).toThrowError(/YYYY-MM/);
    expect(() => utilization(db, 'abc')).toThrowError(/YYYY-MM/);
  });
});
