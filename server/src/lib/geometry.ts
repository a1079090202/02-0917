/**
 * 整数几何工具：长度 mm、面积 mm²，全部整数运算。
 * 利用率比例用千分比（permille）整数返回，展示层再除以 10，杜绝浮点误差。
 */

export interface Rect {
  x: number;
  y: number;
  l: number; // 沿 X 方向长度
  w: number; // 沿 Y 方向宽度
}

export const SAW_KERF_MM = 3;       // 锯路宽度
export const MIN_REMNANT_SIDE = 100; // 短边小于 100mm 的碎料不登记

export function area(l: number, w: number): number {
  return l * w;
}

/** floor(part / whole * 1000)，千分比整数 */
export function permille(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.floor((part * 1000) / whole);
}

/** ceil(a / b)，a、b 均正整数 */
export function ceilDiv(a: number, b: number): number {
  return Math.floor((a + b - 1) / b);
}

export function rectArea(r: Rect): number {
  return r.l * r.w;
}

export function rectsEqual(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.l === b.l && a.w === b.w;
}

/** a 是否被 b 包含（含相等） */
export function rectContained(a: Rect, b: Rect): boolean {
  return (
    b.x <= a.x &&
    b.y <= a.y &&
    b.x + b.l >= a.x + a.l &&
    b.y + b.w >= a.y + a.w
  );
}

/** 删除被其他矩形包含的冗余自由矩形（相等的去重） */
export function pruneContained(rects: Rect[]): Rect[] {
  const out: Rect[] = [];
  for (let i = 0; i < rects.length; i++) {
    let dominated = false;
    for (let j = 0; j < rects.length; j++) {
      if (i === j) continue;
      if (rectContained(rects[i], rects[j])) {
        if (rectsEqual(rects[i], rects[j]) && i > j) {
          dominated = true;
          break;
        }
        if (!rectsEqual(rects[i], rects[j])) {
          dominated = true;
          break;
        }
      }
    }
    if (!dominated) out.push(rects[i]);
  }
  return out;
}

/**
 * 反复合并相邻且共边的自由矩形，得到更大的可用余料矩形。
 * 被锯路隔开（坐标不严格相邻）的不合并。
 */
export function mergeRects(input: Rect[]): Rect[] {
  let rects = pruneContained(input.map((r) => ({ ...r })));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        let m: Rect | null = null;
        // 水平相邻：同 y、同宽，x 首尾相接
        if (
          a.y === b.y && a.w === b.w &&
          (a.x + a.l === b.x || b.x + b.l === a.x)
        ) {
          const x = Math.min(a.x, b.x);
          m = { x, y: a.y, l: a.l + b.l, w: a.w };
        }
        // 竖直相邻：同 x、同长，y 首尾相接
        if (
          a.x === b.x && a.l === b.l &&
          (a.y + a.w === b.y || b.y + b.w === a.y)
        ) {
          const y = Math.min(a.y, b.y);
          m = { x: a.x, y, l: a.l, w: a.w + b.w };
        }
        if (m) {
          rects = rects.filter((_, k) => k !== i && k !== j);
          rects.push(m);
          changed = true;
          break outer;
        }
      }
    }
    rects = pruneContained(rects);
  }
  return rects;
}
