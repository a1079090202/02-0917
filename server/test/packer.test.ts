import { describe, expect, it } from 'vitest';
import { GuillotinePacker, nestParts, type PartSpec } from '../src/modules/nesting/packer';

const part = (key: string, w: number, h: number): PartSpec => ({
  key,
  itemId: null,
  name: key,
  w,
  h,
});

describe('排版引擎（Guillotine）', () => {
  it('部件互不重叠、不越界，面积守恒：部件+余料+损耗=板面积', () => {
    const pk = new GuillotinePacker(2440, 1220);
    const parts = [part('a', 1800, 560), part('b', 800, 560), part('c', 800, 560), part('d', 400, 150)];
    for (const p of parts) expect(pk.place(p)).not.toBeNull();
    const layout = pk.layout();

    for (let i = 0; i < layout.placements.length; i++) {
      for (let j = i + 1; j < layout.placements.length; j++) {
        const a = layout.placements[i]!;
        const b = layout.placements[j]!;
        const overlap =
          a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
    for (const p of layout.placements) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(2440);
      expect(p.y + p.h).toBeLessThanOrEqual(1220);
    }
    expect(layout.partsArea + layout.remnantsArea + layout.wasteArea).toBe(2440 * 1220);
  });

  it('超出板材的部件放不下；nestParts 直接抛错', () => {
    const pk = new GuillotinePacker(1000, 500);
    expect(pk.place(part('big', 1200, 300))).toBeNull();
    expect(() => nestParts([part('big', 3000, 100)], 2440, 1220)).toThrow(/超出板材尺寸/);
  });

  it('相同输入结果完全一致（确定性）', () => {
    const parts = [part('a', 800, 560), part('b', 700, 300), part('c', 500, 500), part('d', 1200, 400)];
    const l1 = nestParts(parts, 2440, 1220);
    const l2 = nestParts(parts, 2440, 1220);
    expect(JSON.stringify(l1)).toBe(JSON.stringify(l2));
  });

  it('锯缝（kerf）占用间隙，部件不重叠', () => {
    const pk = new GuillotinePacker(1000, 500, { kerf: 4 });
    expect(pk.place(part('a', 500, 500))).not.toBeNull();
    const p2 = pk.place(part('b', 400, 500));
    expect(p2).not.toBeNull();
    expect(p2!.x).toBeGreaterThanOrEqual(504);
  });

  it('小于最小登记尺寸的边料计入损耗，不登记余料', () => {
    const pk = new GuillotinePacker(2440, 1220);
    pk.place(part('a', 2440, 1200)); // 只剩 2440×20 一条
    const layout = pk.layout();
    expect(layout.remnants.length).toBe(0);
    expect(layout.wasteArea).toBe(2440 * 20);
  });

  it('允许旋转时能放下原本放不下的部件', () => {
    const pk = new GuillotinePacker(1000, 500, { allowRotation: true });
    const p = pk.place(part('r', 400, 800)); // 旋转成 800×400
    expect(p).not.toBeNull();
    expect(p!.rotated).toBe(true);
    expect(p!.w).toBe(800);
    expect(p!.h).toBe(400);
  });

  it('默认不旋转：竖放不下的件不会被转', () => {
    const pk = new GuillotinePacker(1000, 500);
    expect(pk.place(part('r', 400, 800))).toBeNull();
  });
});
