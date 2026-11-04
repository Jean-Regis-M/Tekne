import { describe, expect, it } from 'vitest';
import { computeFeatures } from '../src/hands/features.js';
import { J, jointPos } from '../src/hands/joints.js';
import { SHAPES, ShapeRecognizer, crocodileMouth, scoreFrame, type ShapeId } from '../src/hands/recognizer.js';
import { moveJointTo, rotX, rotZ, snapshot } from './hand-fixtures.js';

// The emulator's default pose has the palm facing +Y (up). The wall is at -Z, facing +Z.
const ctx = { wallNormal: [0, 0, 1] as [number, number, number], up: [0, 1, 0] as [number, number, number] };
const best = (s: Record<ShapeId, number>) => SHAPES.reduce((a, b) => (s[b] > s[a] ? b : a));

describe('shape scoring on emulator skeletons', () => {
  it('peace-sign style rabbit is a rabbit', () => {
    const s = scoreFrame({ right: snapshot('rabbit') }, ctx).scores;
    expect(best(s)).toBe('rabbit');
    expect(s.rabbit).toBeGreaterThan(0.9);
  });

  it('beak hand is a swan and nothing else passes the enter threshold', () => {
    const s = scoreFrame({ right: snapshot('swan') }, ctx).scores;
    expect(best(s)).toBe('swan');
    for (const id of SHAPES) if (id !== 'swan') expect(s[id]).toBeLessThan(0.7);
  });

  it('crocodile needs a vertical palm seen edge-on', () => {
    const sideways = scoreFrame({ right: snapshot('crocodile', { rot: rotZ(90) }) }, ctx).scores;
    expect(best(sideways)).toBe('crocodile');
    expect(sideways.crocodile).toBeGreaterThan(0.7);
    // Same hand resting palm-up must not trigger.
    const resting = scoreFrame({ right: snapshot('crocodile') }, ctx).scores;
    expect(resting.crocodile).toBeLessThan(0.3);
  });

  it('resting hands (open, fist, flat palm-down) cast nothing', () => {
    for (const id of ['open', 'fist', 'flat']) {
      const s = scoreFrame({ right: snapshot(id), left: snapshot(id, { handedness: 'left', offset: [-0.3, 1.2, -0.4] }) }, ctx).scores;
      for (const sh of SHAPES) expect(s[sh], `${id}/${sh}`).toBeLessThan(0.7);
    }
  });

  it('two open hands facing the wall with hooked thumbs make a bird', () => {
    const right = snapshot('open', { rot: rotX(90) });
    const tip = jointPos(right, J['thumb-tip']);
    const left = moveJointTo(snapshot('open', { handedness: 'left', rot: rotX(90) }), J['thumb-tip'], [tip[0] + 0.02, tip[1], tip[2]]);
    const s = scoreFrame({ right, left }, ctx).scores;
    expect(s.bird).toBeGreaterThan(0.7);
    expect(best(s)).toBe('bird');
    // Pull the hands apart: no bird.
    const apart = moveJointTo(left, J['thumb-tip'], [tip[0] + 0.25, tip[1], tip[2]]);
    expect(scoreFrame({ right, left: apart }, ctx).scores.bird).toBe(0);
  });

  it('crocodile mouth opens as the thumb drops away', () => {
    expect(crocodileMouth(computeFeatures(snapshot('flat')))).toBeLessThan(crocodileMouth(computeFeatures(snapshot('crocodile'))));
  });
});

describe('ShapeRecognizer hold timer', () => {
  const zero = { rabbit: 0, crocodile: 0, swan: 0, bird: 0 };
  it('casts after holding past the hold time, then cools down', () => {
    const r = new ShapeRecognizer({ enter: 0.7, exit: 0.45, holdSeconds: 0.6, cooldownSeconds: 1 });
    let cast: ShapeId | null = null;
    for (let i = 0; i < 6; i++) cast = r.update({ ...zero, rabbit: 0.9 }, 0.1).cast ?? cast;
    expect(cast).toBe('rabbit');
    expect(r.update({ ...zero, rabbit: 0.9 }, 0.1).current).toBeNull(); // cooling down
  });
  it('hysteresis keeps a wobbling shape alive but a drop resets it', () => {
    const r = new ShapeRecognizer({ enter: 0.7, exit: 0.45, holdSeconds: 1, cooldownSeconds: 0 });
    r.update({ ...zero, swan: 0.8 }, 0.3);
    r.update({ ...zero, swan: 0.5 }, 0.3);
    expect(r.state.progress).toBeCloseTo(0.6, 5);
    r.update({ ...zero, swan: 0.2 }, 0.3);
    expect(r.state.progress).toBe(0);
  });
  it('ignores shapes the story is not asking for', () => {
    const r = new ShapeRecognizer();
    r.update({ ...zero, rabbit: 0.95 }, 0.5, ['bird']);
    expect(r.state.current).toBeNull();
  });
});
