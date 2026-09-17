/**
 * 展示层格式化：后端存的是整数 mm / mm²，这里换算也只做整数除法，
 * 不把浮点带进任何统计口径。
 */

/** mm → m，保留 3 位小数（内部整数运算） */
export function fmtM(mm: number): string {
  const v = Math.trunc(mm);
  const whole = Math.floor(v / 1000);
  const frac = Math.abs(v % 1000);
  return `${whole}.${String(frac).padStart(3, '0')}`;
}

/** mm² → m²，保留 3 位小数（内部整数运算） */
export function fmtM2(mm2: number): string {
  const v = Math.trunc(mm2);
  const whole = Math.floor(v / 1_000_000);
  const frac = v % 1_000_000;
  return `${whole}.${String(Math.floor(frac / 1000)).padStart(3, '0')}`;
}

/** 千分比 → 百分比字符串，如 837 → "83.7%" */
export function fmtPermille(permille: number): string {
  const v = Math.trunc(permille);
  return `${(v / 10).toFixed(1)}%`;
}

export function fmtDim(l: number, w: number, t?: number): string {
  return t !== undefined ? `${l}×${w}×${t}mm` : `${l}×${w}mm`;
}

export function yuanFromFen(fen: number): string {
  return (fen / 100).toFixed(2);
}
