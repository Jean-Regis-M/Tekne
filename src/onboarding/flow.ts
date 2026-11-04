/**
 * Wordless first-run lesson. Each step is completed by doing the real
 * action, measured from the tray's interaction counters relative to the
 * moment the step began, so earlier play never skips a lesson by accident.
 */

export interface Counters {
  pigmentPicks: number;
  drops: number;
  stylusTravel: number;
  combTravel: number;
  combGrabs: number;
  paperGrabs: number;
  prints: number;
}

export type StepId = 'pick' | 'drop' | 'swirl' | 'comb' | 'print';

export interface StepDef {
  id: StepId;
  /** 0..1 progress from counter deltas since the step started. */
  progress: (d: Counters) => number;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const STEPS: readonly StepDef[] = [
  { id: 'pick', progress: (d) => clamp01(d.pigmentPicks) },
  { id: 'drop', progress: (d) => clamp01(d.drops / 3) },
  { id: 'swirl', progress: (d) => clamp01(d.stylusTravel / 0.4) },
  { id: 'comb', progress: (d) => clamp01(d.combTravel / 0.2) },
  { id: 'print', progress: (d) => clamp01(d.prints) },
];

export class OnboardingFlow {
  index = 0;
  done = false;
  private base: Counters;

  constructor(start: Counters) {
    this.base = { ...start };
  }

  get step(): StepDef | null {
    return this.done ? null : STEPS[this.index];
  }

  /** Returns progress of the current step; advances when it reaches 1. */
  update(now: Counters): { step: StepId | null; progress: number; advanced: boolean } {
    if (this.done) return { step: null, progress: 1, advanced: false };
    const d = {} as Counters;
    for (const k of Object.keys(now) as (keyof Counters)[]) d[k] = now[k] - this.base[k];
    const step = STEPS[this.index];
    const p = step.progress(d);
    if (p >= 1) {
      this.index++;
      this.base = { ...now };
      if (this.index >= STEPS.length) this.done = true;
      return { step: step.id, progress: 1, advanced: true };
    }
    return { step: step.id, progress: p, advanced: false };
  }
}
