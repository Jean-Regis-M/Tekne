/**
 * Chooses where prints hang on a wall: a grid near eye level, slid along
 * the wall to avoid real windows, doors and existing wall art detected by
 * scene understanding. Pure 2D maths in wall coordinates (metres), where
 * u runs along the wall and v is height relative to the wall centre.
 */

export interface Rect {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

export interface WallLayoutInput {
  /** Wall extent along u and v (centred on 0). */
  width: number;
  height: number;
  /** Eye height relative to the wall centre. */
  eyeV: number;
  /** Preferred grid centre along u (e.g. where the user is looking). */
  preferU: number;
  obstacles: Rect[];
  count: number;
  printW: number;
  printH: number;
  cols?: number;
  gap?: number;
  margin?: number;
}

export interface WallLayout {
  /** Slot centres, newest first. */
  slots: Array<{ u: number; v: number }>;
  bounds: Rect;
}

const overlaps = (a: Rect, b: Rect) => a.u0 < b.u1 && a.u1 > b.u0 && a.v0 < b.v1 && a.v1 > b.v0;

/** Slot order around the centre: centre, left, right, then the row below. */
function slotOffsets(count: number, cols: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const half = Math.floor(cols / 2);
  for (let row = 0; out.length < count; row++) {
    out.push([0, row]);
    for (let k = 1; k <= half && out.length < count; k++) {
      out.push([-k, row]);
      if (out.length < count) out.push([k, row]);
    }
  }
  return out;
}

export function layoutOnWall(input: WallLayoutInput): WallLayout | null {
  const cols = input.cols ?? 3;
  const gap = input.gap ?? 0.08;
  const margin = input.margin ?? 0.05;
  const n = Math.max(1, input.count);
  const offsets = slotOffsets(n, cols);
  const usedCols = Math.min(cols, n);
  const rows = Math.ceil(n / cols);
  const gridW = usedCols * input.printW + (usedCols - 1) * gap;
  const stepU = input.printW + gap;
  const stepV = input.printH + gap;

  // Top row centred slightly above eye level, clamped inside the wall.
  const topV = Math.min(
    input.height / 2 - margin - input.printH / 2,
    input.eyeV + input.printH * 0.25,
  );
  if (topV - (rows - 1) * stepV - input.printH / 2 < -input.height / 2 + margin) return null;

  const maxShift = input.width / 2 - margin - gridW / 2;
  if (maxShift < 0) return null;
  const clampU = (u: number) => Math.max(-maxShift, Math.min(maxShift, u));

  // Try positions sliding outward from the preferred centre.
  const candidates: number[] = [clampU(input.preferU)];
  for (let s = 0.15; s <= input.width; s += 0.15) {
    candidates.push(clampU(input.preferU + s), clampU(input.preferU - s));
  }
  for (const cu of candidates) {
    const bounds: Rect = {
      u0: cu - gridW / 2 - gap / 2,
      u1: cu + gridW / 2 + gap / 2,
      v0: topV - (rows - 1) * stepV - input.printH / 2 - gap / 2,
      v1: topV + input.printH / 2 + gap / 2,
    };
    if (input.obstacles.some((o) => overlaps(o, bounds))) continue;
    // Centre the occupied columns. Odd widths are symmetric by construction;
    // two columns fill the centre and left slots, so shift right by half a step.
    const shift = usedCols % 2 === 0 ? stepU / 2 : 0;
    return {
      slots: offsets.map(([c, r]) => ({ u: cu + shift + c * stepU, v: topV - r * stepV })),
      bounds,
    };
  }
  return null;
}
