/** 显示格式化：面积/百分比都用整数运算，避免浮点误差 */

/** 平方毫米 → "1,234,567 mm²" */
export function fmtArea(mm2: number): string {
  return `${mm2.toLocaleString('zh-CN')} mm²`;
}

/** 平方毫米 → 平方米，整数截断到 3 位小数："1.234 ㎡" */
export function fmtM2(mm2: number): string {
  const whole = Math.floor(mm2 / 1_000_000);
  const frac = String(Math.floor((mm2 % 1_000_000) / 1000)).padStart(3, '0');
  return `${whole}.${frac} ㎡`;
}

/** 面积双口径显示："1,234,567 mm²（1.234 ㎡）" */
export function fmtAreaFull(mm2: number): string {
  return `${fmtArea(mm2)}（${fmtM2(mm2)}）`;
}

/** 万分比整数 → "85.73%"；null → "—" */
export function fmtPct(pctX100: number | null): string {
  if (pctX100 === null) return '—';
  return `${Math.floor(pctX100 / 100)}.${String(pctX100 % 100).padStart(2, '0')}%`;
}

/** 尺寸 "2440×1220" */
export function fmtDims(l: number, w: number): string {
  return `${l}×${w}`;
}

export const ORDER_STATUS: Record<string, string> = {
  open: '待开料',
  cutting: '开料中',
  done: '已完成',
};

export const PLAN_STATUS: Record<string, string> = {
  draft: '草稿（待开料）',
  executed: '已开料',
  superseded: '已作废',
};
