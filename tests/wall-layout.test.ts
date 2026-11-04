import { describe, expect, it } from 'vitest';
import { layoutOnWall, type Rect } from '../src/gallery/wall-layout.js';

const base = {
  width: 5,
  height: 2.7,
  eyeV: 1.25 - 1.35, // seated eye height on a wall centred at 1.35 m
  preferU: 0,
  obstacles: [] as Rect[],
  count: 3,
  printW: 0.4,
  printH: 0.28,
};

const rectOf = (u: number, v: number, w: number, h: number): Rect => ({
  u0: u - w / 2, u1: u + w / 2, v0: v - h / 2, v1: v + h / 2,
});

describe('wall layout', () => {
  it('centres the newest print near eye level where the user looks', () => {
    const l = layoutOnWall(base)!;
    expect(l.slots[0].u).toBeCloseTo(0);
    expect(Math.abs(l.slots[0].v - base.eyeV)).toBeLessThan(0.15);
    expect(l.slots[1].u).toBeLessThan(0);
    expect(l.slots[2].u).toBeGreaterThan(0);
  });

  it.each([1, 2, 3, 4, 5, 6])('slides along the wall to avoid real wall art (%i prints)', (count) => {
    // A 1.2 m wide painting hangs right where the user is looking.
    const painting = rectOf(0, 1.62 - 1.35, 1.22, 0.82);
    const l = layoutOnWall({ ...base, count, printW: 0.476, printH: 0.337, obstacles: [painting] })!;
    expect(l).not.toBeNull();
    for (const s of l.slots) {
      const r = rectOf(s.u, s.v, 0.476, 0.337);
      const hit = r.u0 < painting.u1 && r.u1 > painting.u0 && r.v0 < painting.v1 && r.v1 > painting.v0;
      expect(hit).toBe(false);
    }
  });

  it('never places prints outside the wall', () => {
    const l = layoutOnWall({ ...base, preferU: 2.4, count: 6 })!;
    for (const s of l.slots) {
      expect(s.u + base.printW / 2).toBeLessThanOrEqual(2.5);
      expect(s.v + base.printH / 2).toBeLessThanOrEqual(1.35);
      expect(s.v - base.printH / 2).toBeGreaterThanOrEqual(-1.35);
    }
  });

  it('gives up on a wall too narrow for the grid', () => {
    expect(layoutOnWall({ ...base, width: 0.6 })).toBeNull();
  });
});
