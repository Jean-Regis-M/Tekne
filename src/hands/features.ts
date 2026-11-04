/**
 * Orientation-independent hand features used by the shape recognizer.
 * All distances are normalised by hand size so they work for any hand.
 */
import {
  FINGERS,
  type FingerName,
  type HandSnapshot,
  J,
  type Vec3,
  cross,
  dist,
  dot,
  jointPos,
  norm,
  sub,
} from './joints.js';

export interface HandFeatures {
  handSize: number;
  /** 0 = straight, 1 = fully curled. */
  curl: Record<FingerName, number>;
  /** Fingertip-to-thumb-tip distance / handSize. */
  tipToThumb: Record<Exclude<FingerName, 'thumb'>, number>;
  /** Adjacent fingertip gaps / handSize: index-middle, middle-ring, ring-pinky. */
  gaps: [number, number, number];
  /** Unit palm normal (sign depends on handedness, use abs when comparing). */
  palmNormal: Vec3;
  /** Unit vector from wrist toward the middle knuckle. */
  pointing: Vec3;
  /** Palm centre in world space. */
  palmCenter: Vec3;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Straightness ratio of a chain: chord / path length. 1 = straight. */
function straightness(h: HandSnapshot, chain: readonly number[], from: number): number {
  let path = 0;
  for (let i = from; i < chain.length - 1; i++) {
    path += dist(jointPos(h, chain[i]), jointPos(h, chain[i + 1]));
  }
  const chord = dist(jointPos(h, chain[from]), jointPos(h, chain[chain.length - 1]));
  return path > 1e-6 ? chord / path : 1;
}

export function computeFeatures(h: HandSnapshot): HandFeatures {
  const wrist = jointPos(h, J.wrist);
  const midKnuckle = jointPos(h, J['middle-finger-phalanx-proximal']);
  const handSize = Math.max(dist(wrist, midKnuckle), 0.04);

  const curl = {} as Record<FingerName, number>;
  for (const name of Object.keys(FINGERS) as FingerName[]) {
    const chain = FINGERS[name];
    // Fingers: measure from the proximal phalanx; thumb: from its proximal too.
    const s = straightness(h, chain, 1);
    // A straight finger is ~0.98, a fist is ~0.45. Map that range to 0..1.
    curl[name] = clamp01((0.97 - s) / 0.42);
  }

  const thumbTip = jointPos(h, J['thumb-tip']);
  const tip = (n: 'index' | 'middle' | 'ring' | 'pinky') =>
    jointPos(h, FINGERS[n][FINGERS[n].length - 1]);
  const tipToThumb = {
    index: dist(tip('index'), thumbTip) / handSize,
    middle: dist(tip('middle'), thumbTip) / handSize,
    ring: dist(tip('ring'), thumbTip) / handSize,
    pinky: dist(tip('pinky'), thumbTip) / handSize,
  };
  const gaps: [number, number, number] = [
    dist(tip('index'), tip('middle')) / handSize,
    dist(tip('middle'), tip('ring')) / handSize,
    dist(tip('ring'), tip('pinky')) / handSize,
  ];

  const indexBase = jointPos(h, J['index-finger-metacarpal']);
  const pinkyBase = jointPos(h, J['pinky-finger-metacarpal']);
  const palmNormal = norm(cross(sub(indexBase, wrist), sub(pinkyBase, wrist)));
  const pointing = norm(sub(midKnuckle, wrist));
  const palmCenter: Vec3 = [
    (wrist[0] + midKnuckle[0]) / 2,
    (wrist[1] + midKnuckle[1]) / 2,
    (wrist[2] + midKnuckle[2]) / 2,
  ];

  return { handSize, curl, tipToThumb, gaps, palmNormal, pointing, palmCenter };
}

/** |cos| between the palm normal and a direction. 1 = palm faces it, 0 = edge-on. */
export function palmFacing(f: HandFeatures, dir: Vec3): number {
  return Math.abs(dot(f.palmNormal, norm(dir)));
}
