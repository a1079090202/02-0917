import { describe, expect, it } from 'vitest';
import { allocate } from '../src/modules/remnants/matcher';
import type { PartSpec } from '../src/modules/nesting/packer';

const part = (key: string, w: number, h: number): PartSpec => ({
  key,
  itemId: null,
  name: key,
  w,
  h,
});

describe('余料匹配', () => {
  it('余料够用时先吃余料，不开整板', () => {
    const r = allocate(
      [part('a', 500, 400), part('b', 300, 200)],
      [{ id: 1, w: 1200, h: 800 }],
      2440,
      1220,
    );
    expect(r.newBoardCount).toBe(0);
    expect(r.remnantUsedIds).toEqual([1]);
  });

  it('先吃哪块最省：能放下的余料里选面积最小的', () => {
    const r = allocate(
      [part('a', 1000, 700)],
      [
        { id: 1, w: 2000, h: 1000 },
        { id: 2, w: 1200, h: 800 },
        { id: 3, w: 2440, h: 1220 },
      ],
      2440,
      1220,
    );
    expect(r.remnantUsedIds).toEqual([2]);
    expect(r.newBoardCount).toBe(0);
  });

  it('面积相同取编号小的（先入先用）', () => {
    const r = allocate(
      [part('a', 500, 500)],
      [
        { id: 5, w: 600, h: 1000 },
        { id: 2, w: 1000, h: 600 },
      ],
      2440,
      1220,
    );
    expect(r.remnantUsedIds).toEqual([2]);
  });

  it('余料放不下的部件才开整板，小件仍吃余料', () => {
    const r = allocate(
      [part('a', 2000, 1000), part('b', 500, 500)],
      [{ id: 1, w: 600, h: 600 }],
      2440,
      1220,
    );
    expect(r.newBoardCount).toBe(1);
    expect(r.remnantUsedIds).toEqual([1]);
    const newBoard = r.boards.find((b) => b.source === 'new')!;
    expect(newBoard.layout.placements.map((p) => p.key)).toEqual(['a']);
    const remnantBoard = r.boards.find((b) => b.source === 'remnant')!;
    expect(remnantBoard.layout.placements.map((p) => p.key)).toEqual(['b']);
  });

  it('多个小件共用一块余料', () => {
    const r = allocate(
      [part('a', 400, 300), part('b', 400, 300), part('c', 400, 300)],
      [{ id: 1, w: 1300, h: 400 }],
      2440,
      1220,
    );
    expect(r.remnantUsedIds).toEqual([1]);
    expect(r.newBoardCount).toBe(0);
    expect(r.boards[0]!.layout.placements.length).toBe(3);
  });

  it('余料耗尽后，剩余部件开整板且张数正确', () => {
    const parts = Array.from({ length: 5 }, (_, i) => part(`p${i}`, 1200, 1100));
    const r = allocate(parts, [{ id: 1, w: 1300, h: 1200 }], 2440, 1220);
    // 余料吃 1 件；剩 4 件，2440×1220 每张放 2 件 → 2 张整板
    expect(r.remnantUsedIds).toEqual([1]);
    expect(r.newBoardCount).toBe(2);
  });

  it('不允许旋转时，方向不合的余料不会被用', () => {
    const r = allocate(
      [part('a', 900, 300)],
      [{ id: 1, w: 400, h: 1000 }], // 旋转能放下，但默认不旋转
      2440,
      1220,
    );
    expect(r.remnantUsedIds).toEqual([]);
    expect(r.newBoardCount).toBe(1);
  });

  it('允许旋转时，方向不合的余料可以用', () => {
    const r = allocate(
      [part('a', 900, 300)],
      [{ id: 1, w: 400, h: 1000 }],
      2440,
      1220,
      { allowRotation: true },
    );
    expect(r.remnantUsedIds).toEqual([1]);
    expect(r.newBoardCount).toBe(0);
  });
});
