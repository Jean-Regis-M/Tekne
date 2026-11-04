import { describe, expect, it } from 'vitest';
import {
  type V2,
  dropForward,
  dropInverse,
  spreadIncrement,
  strokeInverse,
  strokeWeight,
} from '../src/marbling/ops.js';

const close = (a: V2, b: V2, eps = 1e-9) => {
  expect(a[0]).toBeCloseTo(b[0], -Math.log10(eps));
  expect(a[1]).toBeCloseTo(b[1], -Math.log10(eps));
};

describe('ink drop', () => {
  const c: V2 = [0.1, 0.05];
  it('inverse undoes forward', () => {
    for (const p of [[0.2, 0.05], [-0.1, 0.3], [0.1, 0.051]] as V2[]) {
      close(dropInverse(dropForward(p, c, 0.02), c, 0.02)!, p, 1e-7);
    }
  });
  it('conserves area: a ring of radius s moves to radius sqrt(s^2+r^2)', () => {
    const q = dropForward([0.1 + 0.03, 0.05], c, 0.04);
    expect(Math.hypot(q[0] - c[0], q[1] - c[1])).toBeCloseTo(0.05, 10);
  });
  it('points inside the new drop take the drop colour', () => {
    expect(dropInverse([0.1, 0.06], c, 0.02)).toBeNull();
  });
  it('spreading in steps equals one big drop', () => {
    let p: V2 = [0.3, -0.2];
    let r = 0;
    for (const next of [0.005, 0.012, 0.02, 0.03]) {
      p = dropForward(p, c, spreadIncrement(r, next));
      r = next;
    }
    close(p, dropForward([0.3, -0.2], c, 0.03), 1e-9);
  });
});

describe('stylus stroke', () => {
  const a: V2 = [0, 0];
  const b: V2 = [0.01, 0];
  it('drags fluid at the fingertip by the full step', () => {
    expect(strokeWeight([0.005, 0], a, b, 0.01)).toBeCloseTo(1, 10);
  });
  it('leaves distant fluid alone', () => {
    expect(strokeWeight([0, 0.08], a, b, 0.01)).toBeLessThan(1e-20);
    close(strokeInverse([0.2, 0.2], a, b, 0.01), [0.2, 0.2]);
  });
});
