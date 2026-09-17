/** 与后端 API 对应的类型 */

export interface BoardSpec {
  id: number;
  name: string;
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
  material: string;
  created_at: string;
  area_mm2: number;
}

export interface OrderRow {
  id: number;
  code: string;
  customer: string;
  note: string;
  status: 'open' | 'cutting' | 'done';
  created_at: string;
}

export interface OrderListItem extends OrderRow {
  item_count: number;
  parts_total: number;
  parts_cut: number;
  boards_used: number;
  remnants_used: number;
}

export interface OrderItem {
  id: number;
  order_id: number;
  part_name: string;
  spec_id: number;
  spec_name: string;
  material: string;
  thickness_mm: number;
  length_mm: number;
  width_mm: number;
  quantity: number;
  cut_quantity: number;
  created_at: string;
}

export interface Placement {
  key: string;
  itemId: number | null;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotated: boolean;
}

export interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardLayout {
  boardW: number;
  boardH: number;
  placements: Placement[];
  remnants: FreeRect[];
  partsArea: number;
  remnantsArea: number;
  wasteArea: number;
}

export interface PlanBoard {
  id: number;
  board_index: number;
  source_type: 'new' | 'remnant';
  remnant_id: number | null;
  spec_id: number;
  spec_name: string;
  length_mm: number;
  width_mm: number;
  parts_area: number;
  layout: BoardLayout;
}

export interface Plan {
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
  allow_rotation: number;
  kerf: number;
  created_at: string;
  executed_at: string | null;
  boards?: PlanBoard[];
}

export interface ChangeDeltas {
  added: Array<{ part_name: string; spec_id: number; length_mm: number; width_mm: number; quantity: number }>;
  reduced: Array<{ item_id: number; part_name: string; from: number; to: number }>;
}

export interface ChangeOrder {
  id: number;
  order_id: number;
  reason: string;
  deltas: ChangeDeltas;
  boards_before: number;
  boards_after: number;
  remnants_before: number;
  remnants_after: number;
  plan_version_after: number | null;
  created_at: string;
  order_code?: string;
  customer?: string;
}

export interface OrderDetail {
  order: OrderRow;
  items: OrderItem[];
  plans: Plan[];
  changes: ChangeOrder[];
}

export interface Remnant {
  id: number;
  spec_id: number;
  spec_name: string;
  material: string;
  thickness_mm: number;
  length_mm: number;
  width_mm: number;
  area_mm2: number;
  source: 'initial' | 'plan';
  source_order_code: string | null;
  source_plan_id: number | null;
  order_id: number | null;
  status: 'available' | 'consumed';
  location: string;
  created_at: string;
  consumed_at: string | null;
  consumed_by_plan_id: number | null;
}

export interface Utilization {
  month: string;
  boards: { newCount: number; newArea: number; remnantCount: number; remnantArea: number };
  parts: { totalArea: number; fromNewArea: number; fromRemnantArea: number };
  remnantsRegistered: { count: number; area: number };
  wasteArea: number;
  byCount: { numerator: number; denominator: number; pctX100: number | null };
  byArea: { numerator: number; denominator: number; pctX100: number | null };
  balance: { inputs: number; outputs: number; ok: boolean };
}

export interface RemnantLedger {
  month: string;
  opening: { count: number; area: number };
  registered: { count: number; area: number };
  consumed: { count: number; area: number };
  closing: { count: number; area: number };
}

export interface AuditEntry {
  id: number;
  entity: string;
  entity_id: number;
  action: string;
  detail_json: string;
  created_at: string;
}
