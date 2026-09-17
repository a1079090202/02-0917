/**
 * SQLite 连接与建表。所有长度 INTEGER 毫米、面积 INTEGER 平方毫米。
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const DB_PATH =
  process.env.PANEL_DB_PATH || new URL('../data/panel.db', import.meta.url).pathname;

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const database = new Database(DB_PATH);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.exec(SCHEMA);
  _db = database;
  return _db;
}

/** 仅供测试/种子重建使用 */
export function resetDb(): Database.Database {
  if (_db) {
    _db.close();
    _db = null;
  }
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const database = new Database(DB_PATH);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = OFF');
  database.exec('DROP TABLE IF EXISTS change_orders');
  database.exec('DROP TABLE IF EXISTS placements');
  database.exec('DROP TABLE IF EXISTS plan_remnants');
  database.exec('DROP TABLE IF EXISTS remnants');
  database.exec('DROP TABLE IF EXISTS nesting_plans');
  database.exec('DROP TABLE IF EXISTS part_demands');
  database.exec('DROP TABLE IF EXISTS orders');
  database.exec('DROP TABLE IF EXISTS materials');
  database.pragma('foreign_keys = ON');
  database.exec(SCHEMA);
  _db = database;
  return database;
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS materials (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,        -- 规格+材质编码
  name          TEXT NOT NULL,               -- 材质
  length        INTEGER NOT NULL,            -- mm
  width         INTEGER NOT NULL,            -- mm
  thickness     INTEGER NOT NULL,            -- mm
  stock_sheets  INTEGER NOT NULL DEFAULT 0,  -- 库存整板
  unit_price    INTEGER NOT NULL DEFAULT 0,  -- 分/张
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  customer    TEXT NOT NULL,
  spec_id     INTEGER NOT NULL REFERENCES materials(id),
  status      TEXT NOT NULL DEFAULT 'pending', -- pending/in_cutting/cut/archived
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  cut_at      TEXT
);

CREATE TABLE IF NOT EXISTS part_demands (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id  INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  length    INTEGER NOT NULL,  -- mm
  width     INTEGER NOT NULL,  -- mm
  qty       INTEGER NOT NULL,  -- 当前需求数量（含变更）
  cut_qty   INTEGER NOT NULL DEFAULT 0 -- 已开料数量
);

-- 每次"确认开料"生成一版套裁方案；改单重算生成新版本
CREATE TABLE IF NOT EXISTS nesting_plans (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id            INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  plan_version        INTEGER NOT NULL,
  whole_sheets_used   INTEGER NOT NULL,
  remnants_used_json  TEXT NOT NULL DEFAULT '[]',   -- 吃掉的余料 id
  part_area           INTEGER NOT NULL,             -- mm²
  board_area          INTEGER NOT NULL,             -- mm²
  reused_area         INTEGER NOT NULL DEFAULT 0,   -- mm² 本版复用余料面积
  is_current          INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 方案里每块板（整板或余料）上的部件落点
CREATE TABLE IF NOT EXISTS placements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id     INTEGER NOT NULL REFERENCES nesting_plans(id) ON DELETE CASCADE,
  board_index INTEGER NOT NULL,
  board_kind  TEXT NOT NULL,              -- sheet/remnant
  remnant_id  INTEGER,                    -- board_kind=remnant
  board_len   INTEGER NOT NULL,
  board_wid   INTEGER NOT NULL,
  part_demand_id INTEGER NOT NULL,
  part_name   TEXT NOT NULL,
  x           INTEGER NOT NULL,
  y           INTEGER NOT NULL,
  p_len       INTEGER NOT NULL,
  p_wid       INTEGER NOT NULL,
  rotated     INTEGER NOT NULL DEFAULT 0
);

-- 方案切出来登记的余料（坐标相对它所在的那块板）
CREATE TABLE IF NOT EXISTS plan_remnants (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id             INTEGER NOT NULL REFERENCES nesting_plans(id) ON DELETE CASCADE,
  board_index         INTEGER NOT NULL,
  origin              TEXT NOT NULL,       -- sheet/remnant
  source_remnant_id   INTEGER,
  x                   INTEGER NOT NULL,
  y                   INTEGER NOT NULL,
  length              INTEGER NOT NULL,
  width               INTEGER NOT NULL,
  area                INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS remnants (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  spec_id             INTEGER NOT NULL REFERENCES materials(id),
  length              INTEGER NOT NULL,
  width               INTEGER NOT NULL,
  area                INTEGER NOT NULL,    -- mm²
  status              TEXT NOT NULL DEFAULT 'available', -- available/consumed/partial
  produced_order_id   INTEGER REFERENCES orders(id),
  produced_plan_id    INTEGER REFERENCES nesting_plans(id),
  parent_remnant_id   INTEGER REFERENCES remnants(id),
  location            TEXT NOT NULL DEFAULT '余料区',
  created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  consumed_at         TEXT,
  consumed_order_id   INTEGER REFERENCES orders(id),
  consumed_plan_id    INTEGER REFERENCES nesting_plans(id)
);

CREATE TABLE IF NOT EXISTS change_orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id       INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  version_before INTEGER NOT NULL,
  version_after  INTEGER NOT NULL,
  kind           TEXT NOT NULL,            -- append/reduce
  demand_id      INTEGER,
  part_name      TEXT NOT NULL,
  length         INTEGER NOT NULL,
  width          INTEGER NOT NULL,
  qty_delta      INTEGER NOT NULL,
  sheets_before  INTEGER NOT NULL,
  sheets_after   INTEGER NOT NULL,
  note           TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_demands_order ON part_demands(order_id);
CREATE INDEX IF NOT EXISTS idx_plans_order ON nesting_plans(order_id);
CREATE INDEX IF NOT EXISTS idx_placements_plan ON placements(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_remnants_plan ON plan_remnants(plan_id);
CREATE INDEX IF NOT EXISTS idx_remnants_status_spec ON remnants(status, spec_id);
CREATE INDEX IF NOT EXISTS idx_changes_order ON change_orders(order_id);
`;
