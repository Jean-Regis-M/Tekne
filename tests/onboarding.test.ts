import { describe, expect, it } from 'vitest';
import { type Counters, OnboardingFlow } from '../src/onboarding/flow.js';

const zero = (): Counters => ({
  pigmentPicks: 0, drops: 0, stylusTravel: 0, combTravel: 0, combGrabs: 0, paperGrabs: 0, prints: 0,
});

describe('onboarding flow', () => {
  it('walks pick → drop → swirl → comb → print by doing each action', () => {
    const c = zero();
    const f = new OnboardingFlow(c);
    expect(f.update(c).step).toBe('pick');
    c.pigmentPicks = 1;
    expect(f.update(c).advanced).toBe(true);
    c.drops = 2;
    expect(f.update(c).progress).toBeCloseTo(2 / 3);
    c.drops = 3;
    f.update(c);
    c.stylusTravel = 0.41;
    f.update(c);
    c.combTravel = 0.2;
    f.update(c);
    expect(f.step?.id).toBe('print');
    c.prints = 1;
    f.update(c);
    expect(f.done).toBe(true);
  });

  it('counts only actions taken after a step begins', () => {
    const c = zero();
    c.drops = 10; // played freely before the lesson reached "drop"
    const f = new OnboardingFlow(c);
    c.pigmentPicks = 1;
    f.update(c);
    expect(f.update(c)).toMatchObject({ step: 'drop', progress: 0 });
  });
});
