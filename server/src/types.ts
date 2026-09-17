/**
 * 全局类型定义。
 * 长度一律毫米（number，整数），面积一律平方毫米（bigint 或 number 整数）。
 * 全程不使用浮点：面积由整数相乘得到，统计比例只在展示层做千分比换算。
 */

export interface MaterialSpec {
  id: number;
  code: string;        // 规格编码，如 PB-2440-1220-18
  name: string;        // 材质名称，如 颗粒板/多层板
  length: number;      // 长 mm
  width: number;       // 宽 mm
  thickness: number;   // 厚 mm
  stock_sheets: number;// 库存整板数
  unit_price: number;  // 单价（分/张，整数）
}

export type OrderStatus = 'pending' | 'in_cutting' | 'cut' | 'archived';

export interface Order {
  id: number;
  code: string;            // 订单号
  customer: string;
  status: OrderStatus;
  spec_id: number;         // 本单使用的板材规格（一单一种规格，余料复用也限同规格同材质）
  created_at: string;
  cut_at: string | null;
  version: number;         // 变更版本号，每次改单 +1
}

export interface PartDemand {
  id: number;
  order_id: number;
  name: string;     // 部件名，如 抽屉侧板
  length: number;   // 部件长 mm（沿板材长边方向）
  width: number;    // 部件宽 mm
  qty: number;
  cut_qty: number; // 已开料数量；改单时只允许动 (qty - cut_qty) 未开料部分
}

/** 排样里的一个已放置部件实例 */
export interface PlacedPart {
  uid: string;       // 方案内唯一编号 p1、p2…
  demand_id: number;
  name: string;
  x: number;
  y: number;
  length: number;    // 沿 X
  width: number;     // 沿 Y
  rotated: boolean;  // 是否相对部件原始长宽旋转了 90°
}

/** 一次切割产生的余料（矩形） */
export interface ProducedRemnant {
  x: number;
  y: number;
  length: number;
  width: number;
  area: number;
  origin: 'sheet' | 'remnant';
  source_remnant_id?: number;
}

/** 单块板材（整板或余料）上的排样结果 */
export interface NestingSheet {
  index: number;
  kind: 'sheet' | 'remnant';
  remnant_id?: number;        // kind=remnant 时复用的余料
  board_length: number;
  board_width: number;
  parts: PlacedPart[];
  remnants: ProducedRemnant[]; // 本块板切完后登记的余料
}

export interface NestingPlan {
  spec_id: number;
  boards: NestingSheet[];
  whole_sheets_used: number; // 新开整板数（不含复用余料）
  remnants_used: number[];   // 被吃掉的余料 id
  total_part_area: number;   // mm²
  total_board_area: number;  // 实际占用板面积（整板按整板面积，余料按余料面积）
}

export interface Remnant {
  id: number;
  spec_id: number;
  length: number;
  width: number;
  area: number;
  status: 'available' | 'consumed' | 'partial';
  produced_order_id: number | null;
  produced_sheet_index: number | null;
  location: string; // 存放位置
  created_at: string;
  consumed_at: string | null;
  consumed_order_id: number | null;
  parent_remnant_id: number | null; // 余料再切后产生新余料时的溯源
}

export interface ChangeOrder {
  id: number;
  order_id: number;
  version_before: number;
  version_after: number;
  kind: 'append' | 'reduce';
  demand_id: number | null; // 已有部件行（减少时必有）
  part_name: string;
  length: number;
  width: number;
  qty_delta: number; // 增加为正、减少为负
  sheets_before: number;
  sheets_after: number;
  note: string;
  created_at: string;
}

export interface MonthlyStats {
  month: string; // YYYY-MM
  whole_sheets_used: number;
  remnant_consumes: number;      // 复用余料的次数（块数）
  reused_area: number;           // 被复用余料面积 mm²
  part_area: number;             // 已开料部件总面积 mm²
  whole_sheet_area: number;      // 新开整板总面积 mm²
  utilized_by_sheets: number;    // 按整张数口径利用率，千分比（整数），实际值 = /1000
  utilized_by_area: number;      // 按面积口径，千分比
  remnant_inventory_count: number;
  remnant_inventory_area: number;
  orders_cut: number;
}
