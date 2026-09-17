/**
 * 套裁引擎（纯函数，不碰数据库）。
 *
 * 规则：
 *  1. 先吃余料再开整板：部件优先排进可用余料，余料不够再开整板；
 *  2. 部件可旋转 90°，占位计入锯路 SAW_KERF_MM，全程整数坐标；
 *  3. 一块板切完，用自由矩形差集 + 相邻合并求出真实余料矩形，碎料不登记；
 *  4. 多策略确定性选优：跑若干种部件排序，按
 *     「新开整板最少 → 余料利用最多 → 产生余料更整块」挑出最优方案。
 */

import {
  SAW_KERF_MM,
  MIN_REMNANT_SIDE,
  Rect,
  ceilDiv,
  area,
  mergeRects,
  rectArea,
} from './geometry.js';
import type {
  NestingPlan,
  NestingSheet,
  PlacedPart,
  ProducedRemnant,
} from '../types.js';

export interface PartItem {
  demand_id: number;
  name: string;
  l: number;
  w: number;
}

export interface RemnantCandidate {
  id: number;
  length: number;
  width: number;
}

interface FreeRect extends Rect {}

interface Board {
  kind: 'sheet' | 'remnant';
  remnant_id?: number;
  L: number;
  W: number;
  placed: PlacedPart[];
  free: FreeRect[];
}

function newBoard(kind: 'sheet' | 'remnant', L: number, W: number, remnant_id?: number): Board {
  return { kind, remnant_id, L, W, placed: [], free: [{ x: 0, y: 0, l: L, w: W }] };
}

/** 矩形差集 a - b（轴对齐），返回 0~4 块不相交矩形 */
function subtractRect(a: Rect, b: Rect): Rect[] {
  if (
    b.x >= a.x + a.l ||
    b.x + b.l <= a.x ||
    b.y >= a.y + a.w ||
    b.y + b.w <= a.y
  ) {
    return [a];
  }
  const bx1 = Math.max(b.x, a.x);
  const by1 = Math.max(b.y, a.y);
  const bx2 = Math.min(b.x + b.l, a.x + a.l);
  const by2 = Math.min(b.y + b.w, a.y + a.w);
  const out: Rect[] = [];
  if (bx1 > a.x) out.push({ x: a.x, y: a.y, l: bx1 - a.x, w: a.w });
  if (bx2 < a.x + a.l) out.push({ x: bx2, y: a.y, l: a.x + a.l - bx2, w: a.w });
  if (by1 > a.y) out.push({ x: bx1, y: a.y, l: bx2 - bx1, w: by1 - a.y });
  if (by2 < a.y + a.w)
    out.push({ x: bx1, y: by2, l: bx2 - bx1, w: a.y + a.w - by2 });
  return out;
}

/** 放置一块后更新自由矩形（扣掉部件 + 右侧/上侧锯路，碎条直接丢弃） */
function occupy(board: Board, occ: Rect) {
  const next: FreeRect[] = [];
  for (const f of board.free) {
    for (const c of subtractRect(f, occ)) {
      if (c.l >= MIN_REMNANT_SIDE && c.w >= MIN_REMNANT_SIDE) next.push(c);
    }
  }
  board.free = mergeRects(next);
}

interface Fit {
  rect: FreeRect;
  rotated: boolean;
  pl: number; // 含锯路占位
  pw: number;
  /** 越小越贴合 */
  tightness: number;
}

/** 在一块板的自由矩形中找部件最佳落脚点（两种朝向都试） */
function bestFitOnBoard(board: Board, item: PartItem): Fit | null {
  let best: Fit | null = null;
  const dirs: Array<[number, number, boolean]> = [
    [item.l + SAW_KERF_MM, item.w + SAW_KERF_MM, false],
    [item.w + SAW_KERF_MM, item.l + SAW_KERF_MM, true],
  ];
  for (const [pl, pw, rotated] of dirs) {
    for (const r of board.free) {
      if (pl <= r.l && pw <= r.w) {
        const tightness =
          r.l * r.w - (item.l * item.w) + // 剩余面积
          Math.min(r.l - pl, r.w - pw); // 最短边浪费（平手时用）
        if (!best || tightness < best.tightness) {
          best = { rect: r, rotated, pl, pw, tightness };
        }
      }
    }
  }
  return best;
}

function placeItem(board: Board, item: PartItem, uid: string, fit: Fit) {
  const l = fit.rotated ? item.w : item.l;
  const w = fit.rotated ? item.l : item.w;
  board.placed.push({
    uid,
    demand_id: item.demand_id,
    name: item.name,
    x: fit.rect.x,
    y: fit.rect.y,
    length: l,
    width: w,
    rotated: fit.rotated,
  });
  occupy(board, { x: fit.rect.x, y: fit.rect.y, l: fit.pl, w: fit.pw });
}

/** 部件排序策略（确定性）：归一化后按不同键排，最后都过一遍选优 */
type Strategy = (a: PartItem, b: PartItem) => number;

const normL = (p: PartItem) => Math.max(p.l, p.w);
const normW = (p: PartItem) => Math.min(p.l, p.w);

const STRATEGIES: Array<[string, Strategy]> = [
  ['面积降序', (a, b) => b.l * b.w - a.l * a.w || normL(b) - normL(a)],
  ['长边降序', (a, b) => normL(b) - normL(a) || b.l * b.w - a.l * a.w],
  ['短边降序', (a, b) => normW(b) - normW(a) || b.l * b.w - a.l * a.w],
  ['周长降序', (a, b) => normL(b) + normW(b) - (normL(a) + normW(a)) || b.l * b.w - a.l * a.w],
  ['宽度分组', (a, b) => normW(b) - normW(a) || normL(b) - normL(a)],
  ['面积升序(小件填缝)', (a, b) => a.l * a.w - b.l * b.w || normL(a) - normL(b)],
];

interface RawResult {
  boards: Board[];
  remnantIdsUsed: number[];
  partAreaOnRemnants: number;
  sheets: number;
  strategyIndex: number;
}

/** 按一种策略完整跑一遍：先吃余料，再开整板 */
function runStrategy(
  sheetL: number,
  sheetW: number,
  items: Array<PartItem & { uid: string }>,
  remnants: RemnantCandidate[],
  cmp: Strategy,
  strategyIndex: number,
): RawResult {
  const ordered = [...items].sort(cmp);
  const remnantBoards: Board[] = [];
  const sheetBoards: Board[] = [];
  const usedIds: number[] = [];
  let onRemnants = 0;
  const leftovers: Array<PartItem & { uid: string }> = [];

  const openRemnantFor = (item: PartItem): Board | null => {
    // “先吃哪块最省”：未动用余料里能装下该件、浪费面积最小的
    let pick: RemnantCandidate | null = null;
    let bestWaste = Infinity;
    let bestSide = Infinity;
    for (const cand of remnants) {
      if (usedIds.includes(cand.id)) continue;
      const fits =
        (item.l + SAW_KERF_MM <= cand.length && item.w + SAW_KERF_MM <= cand.width) ||
        (item.w + SAW_KERF_MM <= cand.length && item.l + SAW_KERF_MM <= cand.width);
      if (!fits) continue;
      const waste = cand.length * cand.width - item.l * item.w;
      const side = Math.min(cand.length, cand.width) - Math.min(item.l, item.w);
      if (waste < bestWaste || (waste === bestWaste && side < bestSide)) {
        pick = cand;
        bestWaste = waste;
        bestSide = side;
      }
    }
    if (!pick) return null;
    usedIds.push(pick.id);
    const b = newBoard('remnant', pick.length, pick.width, pick.id);
    remnantBoards.push(b);
    return b;
  };

  // ---------- 余料阶段 ----------
  for (const it of ordered) {
    // 已打开的余料里找最贴合的位置
    let target: Board | null = null;
    let targetFit: Fit | null = null;
    for (const b of remnantBoards) {
      const f = bestFitOnBoard(b, it);
      if (f && (!targetFit || f.tightness < targetFit.tightness)) {
        target = b;
        targetFit = f;
      }
    }
    if (!target) {
      const nb = openRemnantFor(it);
      if (nb) {
        target = nb;
        targetFit = bestFitOnBoard(nb, it);
      }
    }
    if (target && targetFit) {
      placeItem(target, it, it.uid, targetFit);
      onRemnants += it.l * it.w;
    } else {
      leftovers.push(it);
    }
  }

  // ---------- 整板阶段：跨所有已开整板找最贴合位置，放不下再开新板 ----------
  const need = leftovers.slice().sort(cmp);
  for (const it of need) {
    let target: Board | null = null;
    let targetFit: Fit | null = null;
    for (const b of sheetBoards) {
      const f = bestFitOnBoard(b, it);
      if (f && (!targetFit || f.tightness < targetFit.tightness)) {
        target = b;
        targetFit = f;
      }
    }
    if (!target) {
      // 开新板前做尺寸校验
      const fitsNormally = it.l <= sheetL && it.w <= sheetW;
      const fitsRotated = it.w <= sheetL && it.l <= sheetW;
      if (!fitsNormally && !fitsRotated) {
        throw new Error(
          `部件「${it.name}」${it.l}×${it.w}mm 超过板材规格 ${sheetL}×${sheetW}mm，无法开料`,
        );
      }
      target = newBoard('sheet', sheetL, sheetW);
      sheetBoards.push(target);
      targetFit = bestFitOnBoard(target, it);
    }
    placeItem(target!, it, it.uid, targetFit!);
  }

  return {
    boards: [...remnantBoards, ...sheetBoards],
    remnantIdsUsed: usedIds,
    partAreaOnRemnants: onRemnants,
    sheets: sheetBoards.length,
    strategyIndex,
  };
}

function producedRemnants(board: Board): ProducedRemnant[] {
  const out: ProducedRemnant[] = [];
  for (const r of mergeRects(board.free)) {
    if (r.l >= MIN_REMNANT_SIDE && r.w >= MIN_REMNANT_SIDE) {
      out.push({
        x: r.x,
        y: r.y,
        length: r.l,
        width: r.w,
        area: rectArea(r),
        origin: board.kind,
        source_remnant_id: board.remnant_id,
      });
    }
  }
  out.sort((a, b) => b.area - a.area);
  return out;
}

export interface NestInput {
  spec_id: number;
  sheet_length: number;
  sheet_width: number;
  parts: PartItem[];
  availableRemnants: RemnantCandidate[];
}

/** 生成套裁方案（多策略选优） */
export function nest(input: NestInput): NestingPlan {
  const { spec_id, sheet_length, sheet_width, parts } = input;

  let seq = 0;
  const items = parts.map((p) => ({ ...p, uid: `p${++seq}` }));

  let best: RawResult | null = null;
  STRATEGIES.forEach(([, cmp], i) => {
    const r = runStrategy(
      sheet_length,
      sheet_width,
      items,
      input.availableRemnants,
      cmp,
      i,
    );
    if (!best || score(r) < score(best)) best = r;
  });
  const chosen = best!;

  const boards: NestingSheet[] = chosen.boards.map((b, index) => ({
    index,
    kind: b.kind,
    remnant_id: b.remnant_id,
    board_length: b.L,
    board_width: b.W,
    parts: b.placed,
    remnants: producedRemnants(b),
  }));

  return {
    spec_id,
    boards,
    whole_sheets_used: chosen.sheets,
    remnants_used: chosen.remnantIdsUsed,
    total_part_area: parts.reduce((s, p) => s + p.l * p.w, 0),
    total_board_area: chosen.boards.reduce((s, b) => s + b.L * b.W, 0),
  };
}

/** 方案评分：整板数优先，其次多吃余料，再其次余料更整块，最后策略序号保确定性 */
function score(r: RawResult): string {
  const maxRemnant = Math.max(0, ...r.boards.flatMap((b) => b.free.map((f) => f.l * f.w)));
  return [
    r.sheets.toString().padStart(4, '0'),
    (1_000_000_000 - r.partAreaOnRemnants).toString().padStart(10, '0'),
    (1_000_000_000 - maxRemnant).toString().padStart(10, '0'),
    r.strategyIndex.toString().padStart(3, '0'),
  ].join('-');
}

/**
 * 余料复用优先级（台账“先吃哪块最省”展示用）：
 * 面积浪费最小 → 短边最接近 → 先吃小料留大料。
 */
export function rankRemnants(
  candidates: RemnantCandidate[],
  parts: PartItem[],
): RemnantCandidate[] {
  const need = parts.reduce((s, p) => s + p.l * p.w, 0);
  return [...candidates].sort((a, b) => {
    const da = a.length * a.width - need;
    const db = b.length * b.width - need;
    if (da !== db) return da - db;
    const sa = Math.min(a.length, a.width);
    const sb = Math.min(b.length, b.width);
    if (sa !== sb) return sa - sb;
    return a.length * a.width - b.length * b.width;
  });
}

/** 单一部件能否从余料切出（含锯路、可旋转） */
export function fitsRemnant(
  r: { length: number; width: number },
  p: { l: number; w: number },
): boolean {
  const pl = p.l + SAW_KERF_MM;
  const pw = p.w + SAW_KERF_MM;
  return (
    (pl <= r.length && pw <= r.width) ||
    (pw <= r.length && pl <= r.width)
  );
}

/** 只开整板的快速估算（不产生余料登记） */
export function estimateWholeSheets(sheetL: number, sheetW: number, parts: PartItem[]): number {
  return nest({
    spec_id: 0,
    sheet_length: sheetL,
    sheet_width: sheetW,
    parts,
    availableRemnants: [],
  }).whole_sheets_used;
}

export { ceilDiv, area, SAW_KERF_MM };
