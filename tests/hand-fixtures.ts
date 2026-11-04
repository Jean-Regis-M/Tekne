import { buildHandPose, type HandPoseAngles } from 'iwer/lib/device/configs/hand/builder.js';
import { handPoseAngles } from 'iwer/lib/device/configs/hand/library.js';
import { pinchHandPose } from 'iwer/lib/device/configs/hand/pinch.js';
import { relaxedHandPose } from 'iwer/lib/device/configs/hand/relaxed.js';
import { JOINTS, type Handedness, type HandSnapshot } from '../src/hands/joints.js';
import { SHADOW_POSE_ANGLES } from '../src/hands/shadow-poses.js';

/** Rotation applied to the emulator's wrist-space pose, as a 3x3 row-major matrix. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];
export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export function rotY(deg: number): Mat3 {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

export function anglesFor(id: string): HandPoseAngles {
  const a = (SHADOW_POSE_ANGLES as Record<string, HandPoseAngles>)[id] ?? handPoseAngles[id];
  if (!a) throw new Error(`unknown pose ${id}`);
  return a;
}

/** Builds a world-space hand snapshot from an IWER pose (right-hand data; left mirrors X). */
export function snapshot(
  id: string,
  opts: { handedness?: Handedness; rot?: Mat3; offset?: [number, number, number] } = {},
): HandSnapshot {
  const pose = buildHandPose(anglesFor(id), relaxedHandPose, pinchHandPose);
  const handedness = opts.handedness ?? 'right';
  const rot = opts.rot ?? IDENTITY;
  const off = opts.offset ?? [0, 1.2, -0.4];
  const positions = new Float32Array(75);
  const radii = new Float32Array(25);
  JOINTS.forEach((name, i) => {
    const jt = (pose.jointTransforms as any)[name];
    const m = jt.offsetMatrix as ArrayLike<number>;
    let x = m[12], y = m[13], z = m[14];
    if (handedness === 'left') x = -x;
    positions[i * 3] = rot[0] * x + rot[1] * y + rot[2] * z + off[0];
    positions[i * 3 + 1] = rot[3] * x + rot[4] * y + rot[5] * z + off[1];
    positions[i * 3 + 2] = rot[6] * x + rot[7] * y + rot[8] * z + off[2];
    radii[i] = jt.radius;
  });
  return { handedness, positions, radii };
}

export function rotX(deg: number): Mat3 {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}
export function rotZ(deg: number): Mat3 {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}
/** Moves every joint so that joint `j` lands at `target`. */
export function moveJointTo(h: HandSnapshot, j: number, target: [number, number, number]): HandSnapshot {
  const p = new Float32Array(h.positions);
  const d = [target[0] - p[j * 3], target[1] - p[j * 3 + 1], target[2] - p[j * 3 + 2]];
  for (let i = 0; i < 25; i++) for (let k = 0; k < 3; k++) p[i * 3 + k] += d[k];
  return { ...h, positions: p };
}
