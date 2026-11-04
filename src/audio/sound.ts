/**
 * Procedural, spatial sound for the studio. Every sound is synthesised with
 * Web Audio at runtime: no recorded samples, so no third-party licences.
 *
 * - water bed: very quiet filtered noise that breathes slowly
 * - drop: a soft "plip" whose pitch follows the pigment
 * - swish: filtered noise whose loudness follows stylus or comb speed
 * - tock: wooden pot tap
 * - print: paper rustle plus a three-note bell (pentatonic, gentle)
 * All sources sit at the tray through an HRTF panner; the listener follows the head.
 */

export class StudioSound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private panner!: PannerNode;
  private noise!: AudioBuffer;
  private swishGain!: GainNode;
  private swishFilter!: BiquadFilterNode;
  private swishTarget = 0;
  enabled = true;

  /** Must be called from a user gesture (e.g. the Enter XR click). */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.panner = new PannerNode(ctx, {
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      refDistance: 0.6,
      rolloffFactor: 1,
    });
    this.panner.connect(this.master).connect(ctx.destination);

    // Two seconds of pink-ish noise, reused by every noisy sound.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029;
      b1 = 0.985 * b1 + w * 0.032;
      b2 = 0.95 * b2 + w * 0.048;
      d[i] = (b0 + b1 + b2 + w * 0.02) * 0.6;
    }

    // Water bed.
    const bed = this.loopNoise();
    const bedFilter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 520, Q: 0.4 });
    const bedGain = new GainNode(ctx, { gain: 0.035 });
    const lfo = new OscillatorNode(ctx, { frequency: 0.07 });
    const lfoDepth = new GainNode(ctx, { gain: 0.015 });
    lfo.connect(lfoDepth).connect(bedGain.gain);
    bed.connect(bedFilter).connect(bedGain).connect(this.panner);
    lfo.start();

    // Swish channel, driven every frame by stroke speed.
    const swish = this.loopNoise();
    this.swishFilter = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 900, Q: 0.8 });
    this.swishGain = new GainNode(ctx, { gain: 0 });
    swish.connect(this.swishFilter).connect(this.swishGain).connect(this.panner);
  }

  private loopNoise(): AudioBufferSourceNode {
    const src = new AudioBufferSourceNode(this.ctx!, { buffer: this.noise, loop: true });
    src.start(0, Math.random() * 2);
    return src;
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  /** Places the sound sources (the tray) and the listener (the head). */
  setPose(
    src: { x: number; y: number; z: number },
    head: { x: number; y: number; z: number },
    fwd: { x: number; y: number; z: number },
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.panner.positionX.setTargetAtTime(src.x, t, 0.05);
    this.panner.positionY.setTargetAtTime(src.y, t, 0.05);
    this.panner.positionZ.setTargetAtTime(src.z, t, 0.05);
    const l = ctx.listener;
    if (l.positionX) {
      l.positionX.setTargetAtTime(head.x, t, 0.05);
      l.positionY.setTargetAtTime(head.y, t, 0.05);
      l.positionZ.setTargetAtTime(head.z, t, 0.05);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.05);
      l.forwardY.setTargetAtTime(fwd.y, t, 0.05);
      l.forwardZ.setTargetAtTime(fwd.z, t, 0.05);
    }
  }

  /** Stroke speed in m/s (0 when nothing moves through the water). */
  setStrokeSpeed(speed: number, comb: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.swishTarget = Math.min(0.22, speed * (comb ? 0.9 : 0.6));
    this.swishGain.gain.setTargetAtTime(this.swishTarget, ctx.currentTime, 0.06);
    this.swishFilter.frequency.setTargetAtTime(comb ? 1800 : 900 + speed * 900, ctx.currentTime, 0.06);
  }

  /** Soft water "plip". `pitch` 0..1 shifts it per pigment. */
  drop(pitch: number, size: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const f0 = 720 + pitch * 380 - size * 3000;
    const osc = new OscillatorNode(ctx, { type: 'sine', frequency: f0 });
    osc.frequency.exponentialRampToValueAtTime(Math.max(120, f0 * 0.35), t + 0.11);
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.linearRampToValueAtTime(0.32, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.2);
    osc.connect(g).connect(this.panner);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  tock(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = new OscillatorNode(ctx, { type: 'triangle', frequency: 240 });
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.06);
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.linearRampToValueAtTime(0.25, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.12);
    osc.connect(g).connect(this.panner);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  /** Paper rustle and a quiet three-note bell. */
  print(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = new AudioBufferSourceNode(ctx, { buffer: this.noise });
    const bp = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 2500, Q: 1.2 });
    bp.frequency.exponentialRampToValueAtTime(5200, t + 0.5);
    const g = new GainNode(ctx, { gain: 0 });
    g.gain.linearRampToValueAtTime(0.18, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    src.connect(bp).connect(g).connect(this.panner);
    src.start(t, Math.random());
    src.stop(t + 0.6);
    [523.25, 659.25, 783.99].forEach((f, i) => this.bell(f, t + 0.35 + i * 0.16, 0.12));
  }

  /** Small two-note cue for a completed lesson step. */
  chime(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.bell(659.25, t, 0.08);
    this.bell(987.77, t + 0.12, 0.08);
  }

  private bell(freq: number, at: number, level: number): void {
    const ctx = this.ctx!;
    for (const [mult, amp] of [[1, 1], [2.76, 0.35], [5.4, 0.12]] as const) {
      const osc = new OscillatorNode(ctx, { type: 'sine', frequency: freq * mult });
      const g = new GainNode(ctx, { gain: 0 });
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(level * amp, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0005, at + 1.6 / mult);
      osc.connect(g).connect(this.panner);
      osc.start(at);
      osc.stop(at + 1.7);
    }
  }
}

/** One shared instance for the app. */
export const sound = new StudioSound();
