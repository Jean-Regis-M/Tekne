/**
 * WebXR hand joint layout and a plain-data hand snapshot.
 * Kept free of Three.js and WebXR types so it can be unit-tested in Node.
 */

export const JOINTS = [
  'wrist',
  'thumb-metacarpal',
  'thumb-phalanx-proximal',
  'thumb-phalanx-distal',
  'thumb-tip',
  'index-finger-metacarpal',
  'index-finger-phalanx-proximal',
  'index-finger-phalanx-intermediate',
  'index-finger-phalanx-distal',
  'index-finger-tip',
  'middle-finger-metacarpal',
  'middle-finger-phalanx-proximal',
  'middle-finger-phalanx-intermediate',
  'middle-finger-phalanx-distal',
  'middle-finger-tip',
  'ring-finger-metacarpal',
  'ring-finger-phalanx-proximal',
  'ring-finger-phalanx-intermediate',
  'ring-finger-phalanx-distal',
  'ring-finger-tip',
  'pinky-finger-metacarpal',
  'pinky-finger-phalanx-proximal',
  'pinky-finger-phalanx-intermediate',
  'pinky-finger-phalanx-distal',
  'pinky-finger-tip',
] as const;

export type JointName = (typeof JOINTS)[number];
export const JOINT_COUNT = JOINTS.length;

export const J = Object.fromEntries(JOINTS.map((n, i) => [n, i])) as Record<
  JointName,
  number
>;

/** Finger chains: metacarpal -> tip (thumb starts at its metacarpal). */
export const FINGERS = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8, 9],
  middle: [10, 11, 12, 13, 14],
  ring: [15, 16, 17, 18, 19],
  pinky: [20, 21, 22, 23, 24],
} as const;

export type FingerName = keyof typeof FINGERS;

/** Bones drawn as capsules for the shadow caster (pairs of joint indices). */
export const BONES: ReadonlyArray<readonly [number, number]> = (() => {
  const out: Array<[number, number]> = [];
  for (const chain of Object.values(FINGERS)) {
    out.push([0, chain[0]]);
    for (let i = 0; i < chain.length - 1; i++) out.push([chain[i], chain[i + 1]]);
  }
  return out;
})();

export type Handedness = 'left' | 'right';

export interface HandSnapshot {
  handedness: Handedness;
  /** 25 joints * xyz, world space, metres. */
  positions: Float32Array;
  /** 25 joint radii, metres. */
  radii: Float32Array;
}

export type Vec3 = [number, number, number];

export function jointPos(h: HandSnapshot, j: number): Vec3 {
  const p = h.positions;
  return [p[j * 3], p[j * 3 + 1], p[j * 3 + 2]];
}

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));
export const norm = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : [0, 0, 0];
};
