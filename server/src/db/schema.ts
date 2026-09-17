/**
 * 数据库结构。所有长度为毫米、面积为平方毫米，全部 INTEGER，无浮点。
 */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS board_specs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  length_mm     INTEGER NOT NULL CHECK (length_mm > 0),
  width_mm      INTEGER NOT NULL CHECK (width_mm > 0),
  thickness_mm  INTEGER NOT NULL CHECK (thickness_mm > 0),
  material      TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  customer    TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','cutting','done')),
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      INTEGER NOT NULL REFERENCES orders(id),
  part_name     TEXT NOT NULL,
  spec_id       INTEGER NOT NULL REFERENCES board_specs(id),
  length_mm     INTEGER NOT NULL CHECK (length_mm > 0),
  width_mm      INTEGER NOT NULL CHECK (width_mm > 0),
  quantity      INTEGER NOT NULL CHECK (quantity >= 0),
  cut_quantity  INTEGER NOT NULL DEFAULT 0 CHECK (cut_quantity >= 0),
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS nesting_plans (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id           INTEGER NOT NULL REFERENCES orders(id),
  version            INTEGER NOT NULL,
  change_id          INTEGER,
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','executed','superseded')),
  boards_new         INTEGER NOT NULL DEFAULT 0,
  remnants_used      INTEGER NOT NULL DEFAULT 0,
  parts_area         INTEGER NOT NULL DEFAULT 0,
  new_board_area     INTEGER NOT NULL DEFAULT 0,
  remnant_area_used  INTEGER NOT NULL DEFAULT 0,
  requirements_json  TEXT NOT NULL,
  allow_rotation     INTEGER NOT NULL DEFAULT 0,
  kerf               INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL,
  executed_at        TEXT,
  UNIQUE (order_id, version)
);
CREATE INDEX IF NOT EXISTS idx_plans_order ON nesting_plans(order_id);
CREATE INDEX IF NOT EXISTS idx_plans_executed ON nesting_plans(status, executed_at);

CREATE TABLE IF NOT EXISTS plan_boards (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id      INTEGER NOT NULL REFERENCES nesting_plans(id),
  board_index  INTEGER NOT NULL,
  source_type  TEXT NOT NULL CHECK (source_type IN ('new','remnant')),
  spec_id      INTEGER NOT NULL REFERENCES board_specs(id),
  remnant_id   INTEGER,
  length_mm    INTEGER NOT NULL,
  width_mm     INTEGER NOT NULL,
  parts_area   INTEGER NOT NULL,
  layout_json  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plan_boards_plan ON plan_boards(plan_id);

CREATE TABLE IF NOT EXISTS remnants (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  spec_id              INTEGER NOT NULL REFERENCES board_specs(id),
  length_mm            INTEGER NOT NULL CHECK (length_mm > 0),
  width_mm             INTEGER NOT NULL CHECK (width_mm > 0),
  source               TEXT NOT NULL CHECK (source IN ('initial','plan')),
  plan_board_id        INTEGER REFERENCES plan_boards(id),
  order_id             INTEGER REFERENCES orders(id),
  status               TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','consumed')),
  location             TEXT NOT NULL DEFAULT '',
  created_at           TEXT NOT NULL,
  consumed_at          TEXT,
  consumed_by_board_id INTEGER REFERENCES plan_boards(id)
);
CREATE INDEX IF NOT EXISTS idx_remnants_spec_status ON remnants(spec_id, status);
CREATE INDEX IF NOT EXISTS idx_remnants_created ON remnants(created_at);

CREATE TABLE IF NOT EXISTS change_orders (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id           INTEGER NOT NULL REFERENCES orders(id),
  reason             TEXT NOT NULL DEFAULT '',
  deltas_json        TEXT NOT NULL,
  boards_before      INTEGER NOT NULL,
  boards_after       INTEGER NOT NULL DEFAULT 0,
  remnants_before    INTEGER NOT NULL,
  remnants_after     INTEGER NOT NULL DEFAULT 0,
  plan_version_after INTEGER,
  created_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_changes_order ON change_orders(order_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity      TEXT NOT NULL,
  entity_id   INTEGER NOT NULL,
  action      TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);
`;
