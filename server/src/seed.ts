/**
 * 种子数据：重建数据库并灌入演示数据。
 * 5 种规格板材、10 个订单（其中 2 单走过变更单）、一批边角料。
 * 运行：npm run seed
 */
import { db, resetDb } from './db.js';
import * as planning from './modules/planning.js';
import * as changes from './modules/changes.js';

const MATERIALS = [
  // code, 材质, 长, 宽, 厚, 库存张, 单价(分)
  ['PB-2440-1220-18', '颗粒板', 2440, 1220, 18, 200, 16800],
  ['PB-2440-1220-16', '颗粒板', 2440, 1220, 16, 120, 15200],
  ['MP-2440-1220-18', '多层板', 2440, 1220, 18, 150, 23800],
  ['MP-2745-1830-18', '多层板', 2745, 1830, 18, 60, 35600],
  ['MDF-2440-1220-09', '密度板', 2440, 1220, 9, 100, 12600],
] as const;

function runSeed() {
  resetDb();
  const d = db();

  const insMat = d.prepare(
    'INSERT INTO materials (code,name,length,width,thickness,stock_sheets,unit_price) VALUES (?,?,?,?,?,?,?)',
  );
  const specId = new Map<string, number>();
  for (const m of MATERIALS) {
    const id = Number(insMat.run(...m).lastInsertRowid);
    specId.set(m[0], id);
  }

  const P = (name: string, length: number, width: number, qty: number) => ({
    name,
    length,
    width,
    qty,
  });

  const cut = (code: string) => {
    const row = d.prepare('SELECT id FROM orders WHERE code=?').get(code) as any;
    return planning.commitCut(row.id);
  };

  // ---------- 订单 1：衣柜（已开料，产生边角料） ----------
  planning.createOrder({
    code: 'SO-2609-001',
    customer: '万科售楼处样板间',
    spec_id: specId.get('PB-2440-1220-18')!,
    parts: [
      P('衣柜侧板', 2200, 580, 2),
      P('衣柜顶底板', 880, 580, 2),
      P('衣柜层板', 844, 550, 4),
      P('衣柜背板', 2180, 420, 2),
    ],
  });

  // ---------- 订单 2：橱柜地柜（已开料，会先吃订单 1 的余料） ----------
  planning.createOrder({
    code: 'SO-2609-002',
    customer: '李先生家',
    spec_id: specId.get('PB-2440-1220-18')!,
    parts: [
      P('地柜侧板', 700, 560, 8),
      P('地柜底板', 600, 560, 6),
      P('地柜拉条', 600, 100, 8),
      P('吊柜背板', 680, 600, 3),
    ],
  });

  // ---------- 订单 3：书柜 16mm（已开料） ----------
  planning.createOrder({
    code: 'SO-2609-003',
    customer: '精装公寓A栋',
    spec_id: specId.get('PB-2440-1220-16')!,
    parts: [
      P('书柜侧板', 2000, 300, 2),
      P('书柜层板', 800, 300, 8),
      P('书柜顶板', 800, 300, 2),
    ],
  });

  // ---------- 订单 4：衣柜，改单追加两块层板（已开部分不动，新件未开） ----------
  planning.createOrder({
    code: 'SO-2609-004',
    customer: '陈女士',
    spec_id: specId.get('PB-2440-1220-18')!,
    parts: [
      P('衣柜侧板', 2000, 580, 2),
      P('衣柜顶底板', 800, 580, 3),
      P('衣柜层板', 764, 550, 4),
    ],
  });

  // ---------- 订单 5：抽屉板批单 多层板（已开料） ----------
  planning.createOrder({
    code: 'SO-2609-005',
    customer: '代工-抽屉板批单',
    spec_id: specId.get('MP-2440-1220-18')!,
    parts: [
      P('抽屉侧板', 450, 150, 20),
      P('抽屉面板', 800, 200, 10),
      P('抽屉底板', 780, 400, 10),
    ],
  });

  // ---------- 订单 6：床头柜 密度板（未开料，可吃 9mm 余料） ----------
  planning.createOrder({
    code: 'SO-2609-006',
    customer: '酒店家具批单',
    spec_id: specId.get('MDF-2440-1220-09')!,
    parts: [
      P('床头柜背板', 450, 400, 6),
      P('床头柜抽屉底', 400, 300, 6),
    ],
  });

  // ---------- 订单 7：办公室书柜，开料前减少层板 10→6（改单 #2，已开料） ----------
  planning.createOrder({
    code: 'SO-2609-007',
    customer: '科创园办公室',
    spec_id: specId.get('MP-2440-1220-18')!,
    parts: [
      P('书柜侧板', 2200, 350, 2),
      P('书柜层板', 900, 350, 10),
      P('书柜顶板', 900, 350, 2),
    ],
  });

  // ---------- 订单 8/9/10：未开料 ----------
  planning.createOrder({
    code: 'SO-2609-008',
    customer: '王女士阳台柜',
    spec_id: specId.get('PB-2440-1220-18')!,
    parts: [
      P('阳台柜侧板', 1800, 550, 2),
      P('阳台柜层板', 700, 520, 5),
      P('阳台柜门板', 1750, 350, 2),
    ],
  });

  planning.createOrder({
    code: 'SO-2609-009',
    customer: '张先生电视柜',
    spec_id: specId.get('PB-2440-1220-18')!,
    parts: [
      P('电视柜台面板', 1800, 400, 2),
      P('电视柜侧板', 400, 380, 4),
      P('电视柜层板', 1700, 350, 2),
      P('电视柜背板', 1700, 300, 2),
    ],
  });

  planning.createOrder({
    code: 'SO-2609-010',
    customer: '会议桌定制',
    spec_id: specId.get('MP-2745-1830-18')!,
    parts: [
      P('会议桌桌面', 2400, 900, 2),
      P('会议桌侧板', 900, 700, 4),
    ],
  });

  // ---------- 历史开料 + 两条变更留痕 ----------
  cut('SO-2609-001');
  cut('SO-2609-002'); // 自动先吃 001 的余料
  cut('SO-2609-003');
  cut('SO-2609-004');
  cut('SO-2609-005');

  // 改单 #1：004 已开料后客户追加两块层板（已开部分冻结）
  {
    const row = d.prepare('SELECT id FROM orders WHERE code=?').get('SO-2609-004') as any;
    changes.applyChange(row.id, {
      kind: 'append',
      name: '衣柜层板',
      length: 764,
      width: 550,
      qty_delta: 2,
      note: '客户加两块活动层板',
    });
  }

  // 改单 #2：007 开料前客户把层板从 10 块减到 6 块
  {
    const row = d.prepare('SELECT id FROM orders WHERE code=?').get('SO-2609-007') as any;
    const demand = d
      .prepare("SELECT id FROM part_demands WHERE order_id=? AND name='书柜层板'")
      .get(row.id) as any;
    changes.applyChange(row.id, {
      kind: 'reduce',
      demand_id: demand.id,
      qty_delta: 4,
      note: '层板间距加大，减少 4 块',
    });
    cut('SO-2609-007');
  }

  // ---------- 一批历史边角料（开料台账建立前堆在角落里的存料） ----------
  const insLegacy = d.prepare(
    `INSERT INTO remnants
       (spec_id, length, width, area, produced_order_id, location)
     VALUES (?,?,?,?,NULL,?)`,
  );
  const legacy: Array<[string, number, number, string]> = [
    ['PB-2440-1220-18', 1200, 600, 'A架-大料区（历史存料）'],
    ['PB-2440-1220-18', 900, 500, 'B架-中料区（历史存料）'],
    ['PB-2440-1220-18', 600, 400, 'B架-中料区（历史存料）'],
    ['MP-2440-1220-18', 1000, 650, 'A架-大料区（历史存料）'],
    ['MDF-2440-1220-09', 900, 500, 'B架-中料区（历史存料）'],
    ['MDF-2440-1220-09', 700, 350, 'C架-小料区（历史存料）'],
  ];
  for (const [code, l, w, loc] of legacy) {
    insLegacy.run(specId.get(code)!, l, w, l * w, loc);
  }

  // ---------- 种子结果汇总 ----------
  const summary = () => {
    const mats = d.prepare('SELECT code, stock_sheets FROM materials').all() as any[];
    const orders = d
      .prepare(
        `SELECT o.code, o.status, o.version,
                (SELECT COALESCE(SUM(whole_sheets_used),0) FROM nesting_plans WHERE order_id=o.id) AS sheets,
                (SELECT COUNT(*) FROM change_orders WHERE order_id=o.id) AS changes
         FROM orders o ORDER BY o.id`,
      )
      .all() as any[];
    const remnants = d
      .prepare(
        `SELECT status, COUNT(*) AS c, COALESCE(SUM(area),0) AS a FROM remnants GROUP BY status`,
      )
      .all() as any[];
    console.log('\n===== 板材套裁系统 种子数据 =====');
    console.log('板材规格：');
    for (const m of mats) console.log(`  ${m.code.padEnd(18)} 库存 ${m.stock_sheets} 张`);
    console.log('订单：');
    for (const o of orders) {
      console.log(
        `  ${o.code}  ${o.status.padEnd(11)} v${o.version}  已耗整板 ${o.sheets} 张  变更 ${o.changes} 次`,
      );
    }
    console.log('余料台账：');
    for (const r of remnants) {
      console.log(`  ${r.status.padEnd(10)} ${r.c} 块，${r.a.toLocaleString()} mm²`);
    }
    console.log('=================================\n');
  };
  summary();
}

runSeed();
