/** 数据库行类型（better-sqlite3 查询结果 cast 用） */

export interface BoardSpecRow {
  id: number;
  name: string;
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
  material: string;
  created_at: string;
}

export interface OrderRow {
  id: number;
  code: string;
  customer: string;
  note: string;
  status: 'open' | 'cutting' | 'done';
  created_at: string;
}

export interface OrderItemRow {
  id: number;
  order_id: number;
  part_name: string;
  spec_id: number;
  length_mm: number;
  width_mm: number;
  quantity: number;
  cut_quantity: number;
  created_at: string;
}

export interface NestingPlanRow {
  id: number;
  order_id: number;
  version: number;
  change_id: number | null;
  status: 'draft' | 'executed' | 'superseded';
  boards_new: number;
  remnants_used: number;
  parts_area: number;
  new_board_area: number;
  remnant_area_used: number;
  requirements_json: string;
  allow_rotation: number;
  kerf: number;
  created_at: string;
  executed_at: string | null;
}

export interface PlanBoardRow {
  id: number;
  plan_id: number;
  board_index: number;
  source_type: 'new' | 'remnant';
  spec_id: number;
  remnant_id: number | null;
  length_mm: number;
  width_mm: number;
  parts_area: number;
  layout_json: string;
}

export interface RemnantRow {
  id: number;
  spec_id: number;
  length_mm: number;
  width_mm: number;
  source: 'initial' | 'plan';
  plan_board_id: number | null;
  order_id: number | null;
  status: 'available' | 'consumed';
  location: string;
  created_at: string;
  consumed_at: string | null;
  consumed_by_board_id: number | null;
}

export interface ChangeOrderRow {
  id: number;
  order_id: number;
  reason: string;
  deltas_json: string;
  boards_before: number;
  boards_after: number;
  remnants_before: number;
  remnants_after: number;
  plan_version_after: number | null;
  created_at: string;
}

export interface AuditLogRow {
  id: number;
  entity: string;
  entity_id: number;
  action: string;
  detail_json: string;
  created_at: string;
}
