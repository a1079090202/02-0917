/**
 * 套裁排版引擎：Guillotine（可一刀切的直通锯路）装箱，纯函数、纯整数。
 *
 * 规则：
 * - 每块板维护一组互不相交的空闲矩形（free rects），初始为整板；
 * - 放件用「最佳面积适配」（BAF）：选能放下该件且面积最小的空闲矩形，
 *   并列时取 y 最小、再 x 最小，结果确定可复现；
 * - 放件后按锯路切分：右侧余条（与件同高）+ 下方余条（与矩形同宽），
 *   两块余条不相交，因此所有空闲矩形始终构成一个无重叠划分；
 * - 锯缝（kerf）从余条中扣除，自然计入损耗；
 * - 每次放件后对相邻同边界的空闲矩形做合并，减少碎片化、让余料更大块；
 * - 结算时，小于最小余料尺寸的空闲矩形不算余料，计入损耗。
 *
 * 面积恒等式（每块板都成立，统计模块的对账基础）：
 *   板面积 = 部件面积 + 登记余料面积 + 损耗面积
 */

export interface PartSpec {
  /** 唯一标识，用于确定性排序，如 "12#3"（order_item 12 的第 3 件） */
  key: string;
  itemId: number | null;
  name: string;
  /** 沿板长方向尺寸（毫米） */
  w: number;
  /** 沿板宽方向尺寸（毫米） */
  h: number;
}

export interface Placement extends PartSpec {
  x: number;
  y: number;
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
  /** 切完后达到最小登记尺寸的边角料（互不重叠） */
  remnants: FreeRect[];
  partsArea: number;
  remnantsArea: number;
  wasteArea: number;
}

export interface PackerOptions {
  /** 锯缝宽度（毫米），默认 0 */
  kerf?: number;
  /** 是否允许部件旋转 90°（有木纹方向要求时关掉），默认 false */
  allowRotation?: boolean;
  /** 余料最小边长（毫米），默认 150 */
  minRemnantSide?: number;
  /** 余料最小面积（平方毫米），默认 45000（约 300×150） */
  minRemnantArea?: number;
}

export class GuillotinePacker {
  private free: FreeRect[];
  private placements: Placement[] = [];
  private readonly kerf: number;
  private readonly allowRotation: boolean;

  constructor(
    readonly boardW: number,
    readonly boardH: number,
    opts: PackerOptions = {},
  ) {
    if (!Number.isInteger(boardW) || !Number.isInteger(boardH) || boardW <= 0 || boardH <= 0) {
      throw new Error('板材尺寸必须为正整数（毫米）');
    }
    this.free = [{ x: 0, y: 0, w: boardW, h: boardH }];
    this.kerf = opts.kerf ?? 0;
    this.allowRotation = opts.allowRotation ?? false;
  }

  /** 已放置的部件（只读副本） */
  get placed(): readonly Placement[] {
    return this.placements;
  }

  /** 在空闲矩形中找 w×h 的最佳位置，返回下标；找不到返回 -1 */
  private findBest(w: number, h: number): number {
    let best = -1;
    for (let i = 0; i < this.free.length; i++) {
      const f = this.free[i]!;
      if (w > f.w || h > f.h) continue;
      if (best < 0) {
        best = i;
        continue;
      }
      const b = this.free[best]!;
      const areaDiff = f.w * f.h - b.w * b.h;
      if (areaDiff < 0 || (areaDiff === 0 && (f.y < b.y || (f.y === b.y && f.x < b.x)))) {
        best = i;
      }
    }
    return best;
  }

  /** 某尺寸（含旋转可能）能否放下 */
  fits(w: number, h: number): boolean {
    if (this.findBest(w, h) >= 0) return true;
    return this.allowRotation && w !== h && this.findBest(h, w) >= 0;
  }

  /** 放置一个部件；放不下返回 null */
  place(part: PartSpec): Placement | null {
    let idx = this.findBest(part.w, part.h);
    let rotated = false;
    if (this.allowRotation && part.w !== part.h) {
      const ridx = this.findBest(part.h, part.w);
      if (ridx >= 0) {
        if (idx < 0) {
          idx = ridx;
          rotated = true;
        } else {
          const a = this.free[idx]!;
          const b = this.free[ridx]!;
          // 两种朝向都能放时，选空闲矩形更小的；并列保持不旋转
          if (b.w * b.h < a.w * a.h) {
            idx = ridx;
            rotated = true;
          }
        }
      }
    }
    if (idx < 0) return null;

    const f = this.free[idx]!;
    const pw = rotated ? part.h : part.w;
    const ph = rotated ? part.w : part.h;
    const placement: Placement = { ...part, x: f.x, y: f.y, w: pw, h: ph, rotated };

    // Guillotine 切分：右侧余条（与件同高）+ 下方余条（与矩形同宽），二者不相交
    const rects: FreeRect[] = [];
    const rightW = f.w - pw;
    const bottomH = f.h - ph;
    if (rightW > this.kerf) {
      rects.push({ x: f.x + pw + this.kerf, y: f.y, w: rightW - this.kerf, h: ph });
    }
    if (bottomH > this.kerf) {
      rects.push({ x: f.x, y: f.y + ph + this.kerf, w: f.w, h: bottomH - this.kerf });
    }
    this.free.splice(idx, 1, ...rects);
    this.mergeFree();
    this.placements.push(placement);
    return placement;
  }

  /** 合并共边的空闲矩形（水平/垂直），保持互不相交，结果确定 */
  private mergeFree(): void {
    let changed = true;
    while (changed) {
      changed = false;
      this.free.sort((a, b) => a.y - b.y || a.x - b.x || a.w - b.w || a.h - b.h);
      for (let i = 0; i < this.free.length && !changed; i++) {
        for (let j = i + 1; j < this.free.length && !changed; j++) {
          const a = this.free[i]!;
          const b = this.free[j]!;
          if (a.y === b.y && a.h === b.h && a.x + a.w === b.x) {
            this.free[i] = { x: a.x, y: a.y, w: a.w + b.w, h: a.h };
            this.free.splice(j, 1);
            changed = true;
          } else if (a.x === b.x && a.w === b.w && a.y + a.h === b.y) {
            this.free[i] = { x: a.x, y: a.y, w: a.w, h: a.h + b.h };
            this.free.splice(j, 1);
            changed = true;
          }
        }
      }
    }
  }

  /** 结算当前板：部件、达标余料、损耗（面积恒等式成立） */
  layout(opts: PackerOptions = {}): BoardLayout {
    const minSide = opts.minRemnantSide ?? 150;
    const minArea = opts.minRemnantArea ?? 45000;
    const remnants = this.free
      .filter((r) => Math.min(r.w, r.h) >= minSide && r.w * r.h >= minArea)
      .map((r) => ({ ...r }));
    const partsArea = this.placements.reduce((s, p) => s + p.w * p.h, 0);
    const remnantsArea = remnants.reduce((s, r) => s + r.w * r.h, 0);
    const boardArea = this.boardW * this.boardH;
    return {
      boardW: this.boardW,
      boardH: this.boardH,
      placements: this.placements.map((p) => ({ ...p })),
      remnants,
      partsArea,
      remnantsArea,
      wasteArea: boardArea - partsArea - remnantsArea,
    };
  }
}

/** 确定性排序：面积降序 → 长降序 → 宽降序 → key 升序 */
export function sortParts<T extends { w: number; h: number; key: string }>(parts: T[]): T[] {
  return [...parts].sort(
    (a, b) =>
      b.w * b.h - a.w * a.h ||
      b.w - a.w ||
      b.h - a.h ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
}

/**
 * 纯整板排版（不考虑余料）：先放先开（first-fit），放不下再开新板。
 * 部件放不进任何板时抛错（调用方应提前校验尺寸）。
 */
export function nestParts(
  parts: PartSpec[],
  boardW: number,
  boardH: number,
  opts: PackerOptions = {},
): BoardLayout[] {
  const sorted = sortParts(parts);
  const packers: GuillotinePacker[] = [];
  for (const p of sorted) {
    let done = false;
    for (const pk of packers) {
      if (pk.place(p)) {
        done = true;
        break;
      }
    }
    if (!done) {
      const pk = new GuillotinePacker(boardW, boardH, opts);
      if (!pk.place(p)) {
        throw new Error(`部件「${p.name}」${p.w}×${p.h} 超出板材尺寸 ${boardW}×${boardH}`);
      }
      packers.push(pk);
    }
  }
  return packers.map((pk) => pk.layout(opts));
}
