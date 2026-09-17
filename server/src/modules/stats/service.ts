/**
 * 利用率统计模块：月末报表，全部整数运算。
 *
 * 两个口径：
 * - 按整张数：只看整板 —— 整板切出的部件面积 ÷ 新开整板总面积（每张整板切得满不满）
 * - 按面积：看全部投入材料 —— 全部部件面积 ÷（新开整板面积 + 耗用余料面积）
 *
 * 对账等式（由排版引擎的面积恒等式保证，恒成立）：
 *   投入面积（整板 + 耗用余料）= 部件面积 + 回收余料面积 + 损耗面积
 *
 * 百分比用"万分比整数"表示（如 8573 = 85.73%），前端再格式化，全程无浮点。
 */
import type { DB } from '../../db';
import { badRequest } from '../../core/errors';
import { monthRange } from '../../core/time';
import type { BoardLayout } from '../nesting/packer';

interface ExecBoardRow {
  source_type: 'new' | 'remnant';
  length_mm: number;
  width_mm: number;
  layout_json: string;
}

/** 万分比：den 为 0 时返回 null（前端显示 —）；否则 floor(num*10000/den) */
function permyriad(num: number, den: number): number | null {
  return den > 0 ? Math.floor((num * 10000) / den) : null;
}

export function utilization(db: DB, month: string) {
  let start: string, end: string;
  try {
    [start, end] = monthRange(month);
  } catch {
    throw badRequest('月份格式应为 YYYY-MM');
  }

  const boards = db
    .prepare(
      `SELECT pb.source_type, pb.length_mm, pb.width_mm, pb.layout_json
       FROM plan_boards pb
       JOIN nesting_plans p ON p.id = pb.plan_id
       WHERE p.status = 'executed' AND p.executed_at >= ? AND p.executed_at < ?`,
    )
    .all(start, end) as ExecBoardRow[];

  let newCount = 0,
    newArea = 0,
    remnantCount = 0,
    remnantArea = 0,
    partsFromNew = 0,
    partsFromRemnant = 0,
    registeredCount = 0,
    registeredArea = 0,
    wasteArea = 0;

  for (const b of boards) {
    const layout = JSON.parse(b.layout_json) as BoardLayout;
    const area = b.length_mm * b.width_mm;
    if (b.source_type === 'new') {
      newCount++;
      newArea += area;
      partsFromNew += layout.partsArea;
    } else {
      remnantCount++;
      remnantArea += area;
      partsFromRemnant += layout.partsArea;
    }
    registeredCount += layout.remnants.length;
    for (const r of layout.remnants) registeredArea += r.w * r.h;
    wasteArea += layout.wasteArea;
  }

  const partsTotal = partsFromNew + partsFromRemnant;
  const inputs = newArea + remnantArea;
  const outputs = partsTotal + registeredArea + wasteArea;

  return {
    month,
    boards: { newCount, newArea, remnantCount, remnantArea },
    parts: { totalArea: partsTotal, fromNewArea: partsFromNew, fromRemnantArea: partsFromRemnant },
    remnantsRegistered: { count: registeredCount, area: registeredArea },
    wasteArea,
    byCount: {
      numerator: partsFromNew,
      denominator: newArea,
      pctX100: permyriad(partsFromNew, newArea),
    },
    byArea: {
      numerator: partsTotal,
      denominator: inputs,
      pctX100: permyriad(partsTotal, inputs),
    },
    balance: { inputs, outputs, ok: inputs === outputs },
  };
}

/** 余料复用台账月结：期初 → 本月登记 → 本月耗用 → 期末 */
export function remnantLedger(db: DB, month: string) {
  let start: string, end: string;
  try {
    [start, end] = monthRange(month);
  } catch {
    throw badRequest('月份格式应为 YYYY-MM');
  }

  const opening = db
    .prepare(
      `SELECT COUNT(*) AS c, COALESCE(SUM(length_mm * width_mm), 0) AS a
       FROM remnants
       WHERE created_at < ? AND (status = 'available' OR consumed_at >= ?)`,
    )
    .get(start, start) as { c: number; a: number };
  const inflow = db
    .prepare(
      `SELECT COUNT(*) AS c, COALESCE(SUM(length_mm * width_mm), 0) AS a
       FROM remnants WHERE created_at >= ? AND created_at < ?`,
    )
    .get(start, end) as { c: number; a: number };
  const outflow = db
    .prepare(
      `SELECT COUNT(*) AS c, COALESCE(SUM(length_mm * width_mm), 0) AS a
       FROM remnants WHERE status = 'consumed' AND consumed_at >= ? AND consumed_at < ?`,
    )
    .get(start, end) as { c: number; a: number };

  return {
    month,
    opening: { count: opening.c, area: opening.a },
    registered: { count: inflow.c, area: inflow.a },
    consumed: { count: outflow.c, area: outflow.a },
    closing: {
      count: opening.c + inflow.c - outflow.c,
      area: opening.a + inflow.a - outflow.a,
    },
  };
}
