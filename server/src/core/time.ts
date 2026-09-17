/** 本地时间 'YYYY-MM-DD HH:MM:SS'，字典序即时间序，便于 SQLite 字符串比较 */
export function nowStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 当前月份 'YYYY-MM' */
export function currentMonth(): string {
  return nowStr().slice(0, 7);
}

/** 月份 'YYYY-MM' → [月初, 次月初) 两个日期串，用于范围比较 */
export function monthRange(month: string): [string, string] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error(`月份格式应为 YYYY-MM，收到：${month}`);
  }
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return [start, end];
}
