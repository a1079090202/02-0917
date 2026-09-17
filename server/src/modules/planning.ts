/**
 * 开料计划模块：下单、套裁预览、确认开料（事务）。
 * 确认开料时：吃余料→扣整板库存→登记新余料→回写已开料数量，全部在一个事务里。
 */
import { db } from '../db.js';
import { nest, type PartItem, type RemnantCandidate } from '../lib/packing.js';
import type { NestingPlan } from '../types.js';

export interface DemandInput {
  name: string;
  length: number;
  width: number;
  qty: number;
}

export function assertPositiveDims(parts: DemandInput[], sheetL: number, sheetW: number) {
  for (const p of parts) {
    if (p.length <= 0 || p.width <= 0 || p.qty <= 0) {
      throw new Error(`部件「${p.name}」尺寸和数量必须为正整数`);
    }
    const fitNormally = p.length <= sheetL && p.width <= sheetW;
    const fitRotated = p.width <= sheetL && p.length <= sheetW;
    if (!fitNormally && !fitRotated) {
      throw new Error(
        `部件「${p.name}」${p.length}×${p.width}mm 超过板材 ${sheetL}×${sheetW}mm`,
      );
    }
  }
}

export function getSpec(specId: number) {
  const spec = db()
    .prepare('SELECT * FROM materials WHERE id = ?')
    .get(specId) as any;
  if (!spec) throw new Error('板材规格不存在');
  return spec;
}

export function getOrder(orderId: number) {
  const order = db().prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
  if (!order) throw new Error('订单不存在');
  return order;
}

export function listOrders() {
  return db()
    .prepare(
      `SELECT o.*, m.code AS spec_code, m.length AS spec_length, m.width AS spec_width,
              m.thickness AS spec_thickness, m.name AS material_name,
              (SELECT COALESCE(SUM(whole_sheets_used),0) FROM nesting_plans
                WHERE order_id=o.id AND is_current=1) AS sheets_used,
              (SELECT COALESCE(SUM(qty),0) FROM part_demands WHERE order_id=o.id) AS total_qty,
              (SELECT COALESCE(SUM(cut_qty),0) FROM part_demands WHERE order_id=o.id) AS cut_total_qty
       FROM orders o JOIN materials m ON m.id=o.spec_id
       ORDER BY o.id DESC`,
    )
    .all();
}

export function listDemands(orderId: number) {
  return db()
    .prepare('SELECT * FROM part_demands WHERE order_id=? ORDER BY id')
    .all(orderId);
}

/** 创建订单（pending，未开料） */
export function createOrder(input: {
  code: string;
  customer: string;
  spec_id: number;
  parts: DemandInput[];
}) {
  const spec = getSpec(input.spec_id);
  if (!input.code?.trim() || !input.customer?.trim()) {
    throw new Error('订单号和客户名不能为空');
  }
  if (!input.parts?.length) throw new Error('至少要有一个开料部件');
  assertPositiveDims(input.parts, spec.length, spec.width);

  const tx = db().transaction(() => {
    const info = db()
      .prepare('INSERT INTO orders (code, customer, spec_id) VALUES (?,?,?)')
      .run(input.code.trim(), input.customer.trim(), input.spec_id);
    const orderId = Number(info.lastInsertRowid);
    const ins = db().prepare(
      'INSERT INTO part_demands (order_id, name, length, width, qty) VALUES (?,?,?,?,?)',
    );
    for (const p of input.parts) {
      ins.run(orderId, p.name.trim(), p.length, p.width, p.qty);
    }
    return orderId;
  });
  return tx();
}

/** 取某规格当前可用余料 */
export function availableRemnants(specId: number): (RemnantCandidate & {
  location: string;
})[] {
  return db()
    .prepare(
      `SELECT id, length, width, area, location FROM remnants
       WHERE spec_id=? AND status='available' ORDER BY area ASC, id ASC`,
    )
    .all(specId) as any;
}

/** 展开“未开料”的部件需求为套裁实例 */
export function uncutPartItems(orderId: number): PartItem[] {
  const demands = listDemands(orderId) as any[];
  const items: PartItem[] = [];
  for (const d of demands) {
    const n = d.qty - d.cut_qty;
    for (let i = 0; i < n; i++) {
      items.push({ demand_id: d.id, name: d.name, l: d.length, w: d.width });
    }
  }
  return items;
}

/**
 * 套裁预览（dry-run，不写库、不扣库存）。
 * @param onlyUncut true=改单后只排未开料部分；false/pending=排全部
 */
export function previewPlan(orderId: number): NestingPlan {
  const order = getOrder(orderId);
  const spec = getSpec(order.spec_id);
  const items = uncutPartItems(orderId);
  if (items.length === 0) throw new Error('没有需要开料的部件（可能已全部开料）');
  return nest({
    spec_id: order.spec_id,
    sheet_length: spec.length,
    sheet_width: spec.width,
    parts: items,
    availableRemnants: availableRemnants(order.spec_id),
  });
}

function locationByArea(areaMm2: number): string {
  if (areaMm2 >= 1_000_000) return 'A架-大料区';
  if (areaMm2 >= 500_000) return 'B架-中料区';
  return 'C架-小料区';
}

/**
 * 确认开料：落库当前方案并真正扣减库存/消耗余料/登记新余料。
 * 只排“未开料”部分；已开料部件一律不动。
 */
export function commitCut(orderId: number): { planId: number; plan: NestingPlan } {
  const order = getOrder(orderId);
  const spec = getSpec(order.spec_id);
  const plan = previewPlan(orderId);

  if (spec.stock_sheets < plan.whole_sheets_used) {
    throw new Error(
      `整板库存不足：需要 ${plan.whole_sheets_used} 张，库存只剩 ${spec.stock_sheets} 张`,
    );
  }

  const versionRow = db()
    .prepare(
      'SELECT COALESCE(MAX(plan_version),0)+1 AS v FROM nesting_plans WHERE order_id=?',
    )
    .get(orderId) as any;
  const planVersion = versionRow.v;

  const reusedArea = plan.remnants_used.reduce((sum, id) => {
    const r = db().prepare('SELECT area FROM remnants WHERE id=?').get(id) as any;
    return sum + (r?.area ?? 0);
  }, 0);

  const run = db().transaction(() => {
    const planInfo = db()
      .prepare(
        `INSERT INTO nesting_plans
          (order_id, plan_version, whole_sheets_used, remnants_used_json,
           part_area, board_area, reused_area, is_current)
         VALUES (?,?,?,?,?,?,?,1)`,
      )
      .run(
        orderId,
        planVersion,
        plan.whole_sheets_used,
        JSON.stringify(plan.remnants_used),
        plan.total_part_area,
        plan.total_board_area,
        reusedArea,
      );
    const planId = Number(planInfo.lastInsertRowid);

    // 旧版本置为历史
    db()
      .prepare(
        'UPDATE nesting_plans SET is_current=0 WHERE order_id=? AND id<>?',
      )
      .run(orderId, planId);

    const insPlacement = db().prepare(
      `INSERT INTO placements
        (plan_id, board_index, board_kind, remnant_id, board_len, board_wid,
         part_demand_id, part_name, x, y, p_len, p_wid, rotated)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    const insPlanRemnant = db().prepare(
      `INSERT INTO plan_remnants
        (plan_id, board_index, origin, source_remnant_id, x, y, length, width, area)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    );
    const insRemnant = db().prepare(
      `INSERT INTO remnants
        (spec_id, length, width, area, produced_order_id, produced_plan_id,
         parent_remnant_id, location)
       VALUES (?,?,?,?,?,?,?,?)`,
    );

    for (const board of plan.boards) {
      for (const p of board.parts) {
        insPlacement.run(
          planId,
          board.index,
          board.kind,
          board.remnant_id ?? null,
          board.board_length,
          board.board_width,
          p.demand_id,
          p.name,
          p.x,
          p.y,
          p.length,
          p.width,
          p.rotated ? 1 : 0,
        );
      }
      for (const r of board.remnants) {
        insPlanRemnant.run(
          planId,
          board.index,
          r.origin,
          r.source_remnant_id ?? null,
          r.x,
          r.y,
          r.length,
          r.width,
          r.area,
        );
        // 登记进余料复用台账（同规格；位置按面积分区）
        insRemnant.run(
          order.spec_id,
          r.length,
          r.width,
          r.area,
          orderId,
          planId,
          r.origin === 'remnant' ? r.source_remnant_id : null,
          `${locationByArea(r.area)}（单${order.code}）`,
        );
      }
    }

    // 吃掉的余料标记 consumed（物理板已被切走，余料身份退役；
    // 若切完还有剩，剩料已作为 parent_remnant_id 指向它的新余料登记）
    if (plan.remnants_used.length > 0) {
      const mark = db()
        .prepare(
          `UPDATE remnants SET status='consumed', consumed_at=datetime('now','localtime'),
                              consumed_order_id=?, consumed_plan_id=?
           WHERE id=? AND status='available'`,
        );
      for (const id of plan.remnants_used) mark.run(orderId, planId, id);
    }

    // 扣整板库存
    if (plan.whole_sheets_used > 0) {
      db()
        .prepare('UPDATE materials SET stock_sheets = stock_sheets - ? WHERE id=?')
        .run(plan.whole_sheets_used, order.spec_id);
    }

    // 回写已开料数量
    const cutCount = new Map<number, number>();
    for (const board of plan.boards) {
      for (const p of board.parts) {
        cutCount.set(p.demand_id, (cutCount.get(p.demand_id) ?? 0) + 1);
      }
    }
    const upd = db().prepare(
      'UPDATE part_demands SET cut_qty = cut_qty + ? WHERE id=?',
    );
    for (const [demandId, n] of cutCount) upd.run(n, demandId);

    // 订单状态
    const all = listDemands(orderId) as any[];
    const allCut = all.every((d) => d.cut_qty >= d.qty);
    db()
      .prepare(
        `UPDATE orders SET status=?, cut_at=COALESCE(cut_at, datetime('now','localtime')) WHERE id=?`,
      )
      .run(allCut ? 'cut' : 'in_cutting', orderId);

    return planId;
  });

  return { planId: run(), plan };
}

/** 订单详情：需求行 + 各版方案（含板上落点与余料）+ 变更记录 */
export function orderDetail(orderId: number) {
  const order = getOrder(orderId);
  const spec = getSpec(order.spec_id);
  const demands = listDemands(orderId);
  const plans = db()
    .prepare('SELECT * FROM nesting_plans WHERE order_id=? ORDER BY plan_version')
    .all(orderId) as any[];
  for (const plan of plans) {
    plan.remnants_used = JSON.parse(plan.remnants_used_json);
    plan.boards = planBoards(plan.id);
  }
  const changes = db()
    .prepare('SELECT * FROM change_orders WHERE order_id=? ORDER BY id')
    .all(orderId);
  return { order, spec, demands, plans, changes };
}

export function planBoards(planId: number) {
  const placements = db()
    .prepare('SELECT * FROM placements WHERE plan_id=? ORDER BY board_index, id')
    .all(planId) as any[];
  const planRemnants = db()
    .prepare('SELECT * FROM plan_remnants WHERE plan_id=? ORDER BY board_index, id')
    .all(planId) as any[];
  const boards = new Map<number, any>();
  for (const p of placements) {
    if (!boards.has(p.board_index)) {
      boards.set(p.board_index, {
        index: p.board_index,
        kind: p.board_kind,
        remnant_id: p.remnant_id,
        board_length: p.board_len,
        board_width: p.board_wid,
        parts: [],
        remnants: [],
      });
    }
    boards.get(p.board_index).parts.push({
      uid: `p${p.id}`,
      demand_id: p.part_demand_id,
      name: p.part_name,
      x: p.x,
      y: p.y,
      length: p.p_len,
      width: p.p_wid,
      rotated: !!p.rotated,
    });
  }
  for (const r of planRemnants) {
    if (!boards.has(r.board_index)) {
      boards.set(r.board_index, {
        index: r.board_index,
        kind: r.origin,
        remnant_id: r.source_remnant_id,
        board_length: 0,
        board_width: 0,
        parts: [],
        remnants: [],
      });
    }
    boards.get(r.board_index).remnants.push({
      x: r.x,
      y: r.y,
      length: r.length,
      width: r.width,
      area: r.area,
      origin: r.origin,
      source_remnant_id: r.source_remnant_id,
    });
  }
  return [...boards.values()].sort((a, b) => a.index - b.index);
}
