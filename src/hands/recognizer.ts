/**
 * Shadow-shape recognizer. Pure logic: feed it hand snapshots and time,
 * it reports per-shape scores, hold progress and "cast" events.
 *
 * Each shape is a fuzzy AND (minimum) of simple, explainable conditions,
 * so thresholds can be tuned on device and reasoned about in tests.
 */
import { computeFeatures, palmFacing, type HandFeatures } from './features.js';
import { type HandSnapshot, J, type Vec3, dist, jointPos } from './joints.js';

export type ShapeId = 'rabbit' | 'crocodile' | 'swan' | 'bird';
export const SHAPES: readonly ShapeId[] = ['rabbit', 'crocodile', 'swan', 'bird'];

/** Smooth membership: 0 at `zero`, 1 at `one` (works for either direction). */
export function ramp(x: number, zero: number, one: number): number {
  const t = (x - zero) / (one - zero);
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

const extended = (c: number) => ramp(c, 0.55, 0.25);
const curled = (c: number) => ramp(c, 0.3, 0.6);

export interface ShapeContext {
  /** Unit normal of the wall the shadows fall on (pointing into the room). */
  wallNormal: Vec3;
  /** World up. */
  up: Vec3;
}

export function scoreRabbit(f: HandFeatures): number {
  const thumbHoldsFolded = ramp(Math.min(f.tipToThumb.ring, f.tipToThumb.pinky), 0.75, 0.4);
  const earsApart = ramp(f.gaps[0], 0.08, 0.22);
  const earsFree = ramp(f.tipToThumb.index, 0.45, 0.8);
  return Math.min(
    earsFree,
    extended(f.curl.index),
    extended(f.curl.middle),
    curled(f.curl.ring),
    curled(f.curl.pinky),
    Math.max(thumbHoldsFolded, 0.55),
    Math.max(earsApart, 0.6),
  );
}

export function scoreCrocodile(f: HandFeatures, ctx: ShapeContext): number {
  const fingersStraight = Math.min(
    extended(f.curl.index),
    extended(f.curl.middle),
    extended(f.curl.ring),
  );
  const together = ramp(Math.max(f.gaps[0], f.gaps[1]), 0.32, 0.18);
  // Profile pose: the edge of the hand faces the wall, so the shadow shows a jaw.
  const edgeOn = ramp(palmFacing(f, ctx.wallNormal), 0.8, 0.45);
  // ...and the palm is vertical (not a resting palm-down or palm-up hand).
  const upright = ramp(palmFacing(f, ctx.up), 0.75, 0.45);
  return Math.min(fingersStraight, together, edgeOn, upright);
}

/** Mouth openness for the puppeteered crocodile, 0 closed .. 1 wide open. */
export function crocodileMouth(f: HandFeatures): number {
  return ramp(f.tipToThumb.middle, 0.35, 1.0);
}

export function scoreSwan(f: HandFeatures): number {
  // "Beak": index, middle and ring tips gathered at the thumb tip.
  const beak = ramp(
    Math.max(f.tipToThumb.index, f.tipToThumb.middle, f.tipToThumb.ring),
    0.6,
    0.32,
  );
  const notFist = ramp(f.curl.index, 0.95, 0.7);
  return Math.min(beak, notFist);
}

export function scoreBird(
  a: HandFeatures,
  b: HandFeatures,
  ha: HandSnapshot,
  hb: HandSnapshot,
  ctx: ShapeContext,
): number {
  const thumbsHooked = ramp(
    dist(jointPos(ha, J['thumb-tip']), jointPos(hb, J['thumb-tip'])),
    0.09,
    0.045,
  );
  const wings = Math.min(
    extended((a.curl.index + a.curl.middle + a.curl.ring) / 3),
    extended((b.curl.index + b.curl.middle + b.curl.ring) / 3),
  );
  const facing = Math.min(
    ramp(palmFacing(a, ctx.wallNormal), 0.35, 0.7),
    ramp(palmFacing(b, ctx.wallNormal), 0.35, 0.7),
  );
  return Math.min(thumbsHooked, wings, facing);
}

export interface FrameScores {
  scores: Record<ShapeId, number>;
  features: { left?: HandFeatures; right?: HandFeatures };
}

export function scoreFrame(
  hands: { left?: HandSnapshot; right?: HandSnapshot },
  ctx: ShapeContext,
): FrameScores {
  const fl = hands.left ? computeFeatures(hands.left) : undefined;
  const fr = hands.right ? computeFeatures(hands.right) : undefined;
  const one = (fn: (f: HandFeatures) => number) =>
    Math.max(fl ? fn(fl) : 0, fr ? fn(fr) : 0);
  const bird =
    fl && fr && hands.left && hands.right
      ? scoreBird(fl, fr, hands.left, hands.right, ctx)
      : 0;
  // Two-hand bird wins over single-hand reads of the same hands.
  const single = bird > 0.5 ? 0.5 : 1;
  return {
    scores: {
      rabbit: one(scoreRabbit) * single,
      crocodile: one((f) => scoreCrocodile(f, ctx)) * single,
      swan: one(scoreSwan) * single,
      bird,
    },
    features: { left: fl, right: fr },
  };
}

export interface RecognizerOptions {
  enter: number;
  exit: number;
  holdSeconds: number;
  cooldownSeconds: number;
}

export const DEFAULT_RECOGNIZER: RecognizerOptions = {
  enter: 0.7,
  exit: 0.45,
  holdSeconds: 0.6,
  cooldownSeconds: 1.0,
};

export interface RecognizerState {
  /** Shape currently being held, if any. */
  current: ShapeId | null;
  /** 0..1 progress towards casting `current`. */
  progress: number;
  /** Set on the frame a shape is cast. */
  cast: ShapeId | null;
}

/**
 * Hysteresis + hold timer. A shape must stay above `exit` (after first passing
 * `enter`) for `holdSeconds` to be cast. Only shapes in `allowed` count.
 */
export class ShapeRecognizer {
  readonly state: RecognizerState = { current: null, progress: 0, cast: null };
  private held = 0;
  private cooldown = 0;

  constructor(public options: RecognizerOptions = { ...DEFAULT_RECOGNIZER }) {}

  reset(): void {
    this.state.current = null;
    this.state.progress = 0;
    this.state.cast = null;
    this.held = 0;
  }

  update(
    scores: Record<ShapeId, number>,
    dt: number,
    allowed: readonly ShapeId[] = SHAPES,
  ): RecognizerState {
    const s = this.state;
    s.cast = null;
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      s.current = null;
      s.progress = 0;
      return s;
    }
    let best: ShapeId | null = null;
    let bestScore = 0;
    for (const id of allowed) {
      if (scores[id] > bestScore) {
        bestScore = scores[id];
        best = id;
      }
    }
    if (s.current && allowed.includes(s.current) && scores[s.current] >= this.options.exit) {
      this.held += dt;
    } else if (best && bestScore >= this.options.enter) {
      s.current = best;
      this.held = dt;
    } else {
      s.current = null;
      this.held = 0;
    }
    s.progress = s.current ? Math.min(1, this.held / this.options.holdSeconds) : 0;
    if (s.current && s.progress >= 1) {
      s.cast = s.current;
      s.current = null;
      s.progress = 0;
      this.held = 0;
      this.cooldown = this.options.cooldownSeconds;
    }
    return s;
  }
}
