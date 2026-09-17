/** 前端展示层类型，字段与后端 API 对齐。长度 mm、面积 mm² 均为整数。 */

export interface Material {
  id: number;
  code: string;
  name: string;
  length: number;
  width: number;
  thickness: number;
  stock_sheets: number;
  unit_price: number;
}

export interface OrderRow {
  id: number;
  code: string;
  customer: string;
  status: 'pending' | 'in_cutting' | 'cut' | 'archived';
  spec_id: number;
  spec_code: string;
  spec_length: number;
  spec_width: number;
  spec_thickness: number;
  material_name: string;
  version: number;
  created_at: string;
  cut_at: string | null;
  sheets_used: number;
  total_qty: number;
  cut_total_qty: number;
}

export interface Demand {
  id: number;
  name: string;
  length: number;
  width: number;
  qty: number;
  cut_qty: number;
}

export interface PlacedPart {
  uid: string;
  demand_id: number;
  name: string;
  x: number;
  y: number;
  length: number;
  width: number;
  rotated: boolean;
}

export interface ProducedRemnant {
  x: number;
  y: number;
  length: number;
  width: number;
  area: number;
  origin: 'sheet' | 'remnant';
  source_remnant_id?: number;
}

export interface NestingSheet {
  index: number;
  kind: 'sheet' | 'remnant';
  remnant_id?: number;
  board_length: number;
  board_width: number;
  parts: PlacedPart[];
  remnants: ProducedRemnant[];
}

export interface NestingPlan {
  spec_id: number;
  boards: NestingSheet[];
  whole_sheets_used: number;
  remnants_used: number[];
  total_part_area: number;
  total_board_area: number;
}

export interface PlanRow extends NestingPlan {
  id: number;
  plan_version: number;
  reused_area: number;
  part_area: number;
  board_area: number;
  is_current: number;
  created_at: string;
}

export interface ChangeLog {
  id: number;
  version_before: number;
  version_after: number;
  kind: 'append' | 'reduce';
  part_name: string;
  length: number;
  width: number;
  qty_delta: number;
  sheets_before: number;
  sheets_after: number;
  note: string;
  created_at: string;
}

export interface OrderDetail {
  order: OrderRow;
  spec: Material;
  demands: Demand[];
  plans: PlanRow[];
  changes: ChangeLog[];
}

export interface RemnantRow {
  id: number;
  spec_id: number;
  spec_code: string;
  length: number;
  width: number;
  area: number;
  status: 'available' | 'consumed' | 'partial';
  location: string;
  produced_order_code: string | null;
  consumed_order_code: string | null;
  created_at: string;
}

export interface MatchLine {
  remnant_id: number;
  spec_code: string;
  length: number;
  width: number;
  area: number;
  location: string;
  usable: boolean;
  matched_part: string | null;
  matched_dims: string | null;
  waste_area: number;
  rank_reason: string;
}

export interface MonthlyStats {
  month: string;
  whole_sheets_used: number;
  remnant_consumes: number;
  reused_area: number;
  part_area: number;
  whole_sheet_area: number;
  utilized_by_sheets: number;
  utilized_by_area: number;
  remnant_inventory_count: number;
  remnant_inventory_area: number;
  orders_cut: number;
}
