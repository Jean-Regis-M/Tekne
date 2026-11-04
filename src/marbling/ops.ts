/**
 * Marbling operations, after S. Lu, A. Jaffer, X. Jin, H. Zhao, X. Mao,
 * "Mathematical Marbling", IEEE Computer Graphics and Applications, 2012.
 *
 * Coordinates are tray-surface metres (x across, y away from the user).
 * The GPU shaders in surface.ts implement the same inverse maps; these CPU
 * versions exist so the maths is unit-tested and reusable (e.g. for hints).
 */

export type V2 = [number, number];

/**
 * Ink drop at centre c with radius r: every existing point is pushed outward
 * so that area is conserved. Forward map for points outside the new drop.
 */
export function dropForward(p: V2, c: V2, r: number): V2 {
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  const d2 = dx * dx + dy * dy;
  if (d2 < 1e-12) return [c[0] + r, c[1]];
  const k = Math.sqrt(1 + (r * r) / d2);
  return [c[0] + dx * k, c[1] + dy * k];
}

/**
 * Inverse of dropForward. Returns null when q lies inside the new drop
 * (that pixel takes the drop's colour).
 */
export function dropInverse(q: V2, c: V2, r: number): V2 | null {
  const dx = q[0] - c[0];
  const dy = q[1] - c[1];
  const d2 = dx * dx + dy * dy;
  if (d2 <= r * r) return null;
  const k = Math.sqrt(1 - (r * r) / d2);
  return [c[0] + dx * k, c[1] + dy * k];
}

/**
 * Radius increment that grows an existing drop from `from` to `to` while
 * keeping the exact result of a single drop of radius `to` (concentric drops
 * compose: areas add).
 */
export function spreadIncrement(from: number, to: number): number {
  return Math.sqrt(Math.max(0, to * to - from * from));
}

/** Squared distance from p to segment ab. */
export function segDist2(p: V2, a: V2, b: V2): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const l2 = abx * abx + aby * aby;
  let t = l2 > 1e-12 ? ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = a[0] + abx * t - p[0];
  const y = a[1] + aby * t - p[1];
  return x * x + y * y;
}

/**
 * Stylus stroke from a to b: points near the stroke are dragged along with
 * it, with a Gaussian falloff of width `lambda`. This is a local, finite
 * version of the paper's tine line, suited to a fingertip.
 */
export function strokeWeight(p: V2, a: V2, b: V2, lambda: number): number {
  return Math.exp(-segDist2(p, a, b) / (lambda * lambda));
}

/** Approximate inverse used per pixel (exact as the step size goes to 0). */
export function strokeInverse(q: V2, a: V2, b: V2, lambda: number): V2 {
  const w = strokeWeight(q, a, b, lambda);
  return [q[0] - (b[0] - a[0]) * w, q[1] - (b[1] - a[1]) * w];
}

/** Ebru pigments (named after traditional earth and plant colours). */
export const PALETTE = [
  { id: 'lapis', name: 'Lapis', rgb: [0.13, 0.27, 0.55] },
  { id: 'madder', name: 'Madder', rgb: [0.7, 0.16, 0.14] },
  { id: 'ochre', name: 'Ochre', rgb: [0.85, 0.62, 0.2] },
  { id: 'malachite', name: 'Malachite', rgb: [0.16, 0.48, 0.38] },
  { id: 'umber', name: 'Umber', rgb: [0.28, 0.19, 0.13] },
  { id: 'chalk', name: 'Chalk', rgb: [0.95, 0.93, 0.88] },
] as const;

/** High-contrast set: maximally distinct in lightness and hue. */
export const PALETTE_HIGH_CONTRAST = [
  { id: 'lapis', name: 'Ink blue', rgb: [0.02, 0.12, 0.6] },
  { id: 'madder', name: 'Signal red', rgb: [0.85, 0.05, 0.05] },
  { id: 'ochre', name: 'Bright yellow', rgb: [1.0, 0.85, 0.0] },
  { id: 'malachite', name: 'Emerald', rgb: [0.0, 0.55, 0.3] },
  { id: 'umber', name: 'Black', rgb: [0.03, 0.03, 0.03] },
  { id: 'chalk', name: 'White', rgb: [1.0, 1.0, 1.0] },
] as const;

export type PigmentId = (typeof PALETTE)[number]['id'];

/**
 * Tine line (Lu, Jaffer et al. 2012): an infinitely long stroke through B in
 * unit direction M. Every point moves along M by z * u^d, where d is its
 * distance from the line and 0 < u < 1 sets how sharply the effect fades.
 * Because the shift is parallel to the line, d is unchanged, so the inverse
 * is exact. Used for whole-tray gelgit and comb passes (offline art, motifs).
 */
export function tineForward(p: V2, b: V2, m: V2, z: number, u: number): V2 {
  const d = Math.abs((p[0] - b[0]) * -m[1] + (p[1] - b[1]) * m[0]);
  const s = z * Math.pow(u, d);
  return [p[0] + m[0] * s, p[1] + m[1] * s];
}

export function tineInverse(q: V2, b: V2, m: V2, z: number, u: number): V2 {
  const d = Math.abs((q[0] - b[0]) * -m[1] + (q[1] - b[1]) * m[0]);
  const s = z * Math.pow(u, d);
  return [q[0] - m[0] * s, q[1] - m[1] * s];
}
