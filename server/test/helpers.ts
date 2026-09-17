/**
 * 每个测试文件独立的内存级临时库：在 import 业务模块前设好路径。
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.PANEL_DB_PATH = join(
  tmpdir(),
  `panel-test-${Math.random().toString(36).slice(2)}.db`,
);

export const TEST_MONTH = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
})();

export async function freshDb() {
  const { resetDb } = await import('../src/db.js');
  resetDb();
}

export async function insertSpec(
  code = 'PB-2440-1220-18',
  dims: [number, number, number] = [2440, 1220, 18],
  stock = 100,
) {
  const { db } = await import('../src/db.js');
  const info = db()
    .prepare(
      'INSERT INTO materials (code,name,length,width,thickness,stock_sheets,unit_price) VALUES (?,?,?,?,?,?,?)',
    )
    .run(code, '测试板', dims[0], dims[1], dims[2], stock, 10000);
  return Number(info.lastInsertRowid);
}
