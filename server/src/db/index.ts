import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SCHEMA } from './schema';

export type DB = Database.Database;

const DEFAULT_PATH = resolve(process.cwd(), 'data/app.db');

/** 创建（或打开）数据库并建表。传 ':memory:' 用于测试。 */
export function createDb(path: string = process.env.DB_PATH ?? DEFAULT_PATH): DB {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
