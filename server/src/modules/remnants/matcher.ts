/**
 * 余料匹配：把一批部件优先往余料上排，余料放不下才开整板。
 *
 * 选料顺序（每个部件，按面积从大到小）：
 *   1. 本单已打开的余料（先填满正在用的）
 *   2. 库存余料：能放下且面积最小的一块（最省）；面积相同取编号小的（先入先用）
 *   3. 本单已打开的整板（板已开，空隙不用白不用）
 *   4. 新开一张整板
 * 因此只要余料台账里有能用的料，就不会新开整板。
 */
import {
  GuillotinePacker,
  sortParts,
  type BoardLayout,
  type PackerOptions,
  type PartSpec,
} from '../nesting/packer';

export interface RemnantStock {
  id: number;
  w: number;
  h: number;
}

export interface AllocatedBoard {
  source: 'new' | 'remnant';
  remnantId: number | null;
  boardW: number;
  boardH: number;
  layout: BoardLayout;
}

export interface AllocationResult {
  boards: AllocatedBoard[];
  newBoardCount: number;
  remnantUsedIds: number[];
}

export function allocate(
  parts: PartSpec[],
  remnants: RemnantStock[],
  boardW: number,
  boardH: number,
  opts: PackerOptions = {},
): AllocationResult {
  const allowRotation = opts.allowRotation ?? false;
  const sorted = sortParts(parts);
  const openRemnants: { stock: RemnantStock; packer: GuillotinePacker }[] = [];
  const openBoards: GuillotinePacker[] = [];
  const used = new Set<number>();

  const fitsDim = (p: PartSpec, r: RemnantStock): boolean =>
    (p.w <= r.w && p.h <= r.h) || (allowRotation && p.h <= r.w && p.w <= r.h);

  for (const p of sorted) {
    let placed = false;

    // 1) 已打开的余料
    for (const o of openRemnants) {
      if (o.packer.place(p)) {
        placed = true;
        break;
      }
    }

    // 2) 库存余料：最省优先（能放下且面积最小，并列取编号小）
    if (!placed) {
      let best: RemnantStock | null = null;
      for (const r of remnants) {
        if (used.has(r.id) || !fitsDim(p, r)) continue;
        if (
          !best ||
          r.w * r.h < best.w * best.h ||
          (r.w * r.h === best.w * best.h && r.id < best.id)
        ) {
          best = r;
        }
      }
      if (best) {
        const pk = new GuillotinePacker(best.w, best.h, opts);
        const ok = pk.place(p);
        if (!ok) throw new Error(`余料 #${best.id} 尺寸校验与排版结果不一致`);
        used.add(best.id);
        openRemnants.push({ stock: best, packer: pk });
        placed = true;
      }
    }

    // 3) 已打开的整板
    if (!placed) {
      for (const pk of openBoards) {
        if (pk.place(p)) {
          placed = true;
          break;
        }
      }
    }

    // 4) 新开整板
    if (!placed) {
      const pk = new GuillotinePacker(boardW, boardH, opts);
      if (!pk.place(p)) {
        throw new Error(
          `部件「${p.name}」${p.w}×${p.h} 超出整板尺寸 ${boardW}×${boardH}，且无可用余料`,
        );
      }
      openBoards.push(pk);
    }
  }

  const boards: AllocatedBoard[] = [
    ...openRemnants.map((o) => ({
      source: 'remnant' as const,
      remnantId: o.stock.id,
      boardW: o.stock.w,
      boardH: o.stock.h,
      layout: o.packer.layout(opts),
    })),
    ...openBoards.map((pk) => ({
      source: 'new' as const,
      remnantId: null,
      boardW,
      boardH,
      layout: pk.layout(opts),
    })),
  ];
  return {
    boards,
    newBoardCount: openBoards.length,
    remnantUsedIds: [...used].sort((a, b) => a - b),
  };
}
