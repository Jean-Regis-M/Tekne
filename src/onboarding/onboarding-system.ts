/**
 * Wordless onboarding: a ghost fingertip (and thumb, for pinches) acts out
 * each gesture in the real tray, a pulsing ring marks the object to use,
 * and five dots on the far rim show progress. No text panels.
 * Runs on first launch, or whenever the URL has `?lesson`.
 */
import {
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { TraySystem } from '../marbling/tray-system.js';
import { OnboardingFlow, STEPS, type Counters, type StepId } from './flow.js';

const KEY = 'tekne.lesson.done.v1';
const LOOP = 2.6; // seconds per demonstration
const QUIET_AFTER_ACTION = 2.0; // ghost steps back while the user is acting

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function lessonNeeded(): boolean {
  if (new URLSearchParams(location.search).has('lesson')) return true;
  try {
    return localStorage.getItem(KEY) !== '1';
  } catch {
    return true;
  }
}

export class OnboardingSystem extends createSystem({}) {
  private tray!: TraySystem;
  private flow!: OnboardingFlow;
  private overlay = new Group();
  private finger!: Mesh;
  private thumb!: Mesh;
  private ring!: Mesh;
  private ripple!: Mesh;
  private dots: Mesh[] = [];
  private t = 0;
  private quiet = 0;
  private lastSum = 0;
  private finished = false;
  private celebrate = 0;
  private target = new Vector3();

  init(): void {
    const tray = this.world.getSystem(TraySystem);
    if (!tray) return;
    this.tray = tray;
    this.flow = new OnboardingFlow(this.snapshot());
    const glow = new MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.75, depthWrite: false });
    this.finger = new Mesh(new SphereGeometry(0.009, 16, 12), glow);
    this.thumb = new Mesh(new SphereGeometry(0.009, 16, 12), glow);
    this.ring = new Mesh(
      new RingGeometry(0.03, 0.036, 40),
      new MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.8, depthWrite: false, side: 2 }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ripple = new Mesh(
      new RingGeometry(0.9, 1, 40),
      new MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.6, depthWrite: false, side: 2 }),
    );
    this.ripple.rotation.x = -Math.PI / 2;
    this.overlay.add(this.finger, this.thumb, this.ring, this.ripple);
    const dotGeo = new SphereGeometry(0.006, 12, 8);
    STEPS.forEach((_, i) => {
      const d = new Mesh(dotGeo, new MeshBasicMaterial({ color: 0x8c7a5c, transparent: true, opacity: 0.9 }));
      d.position.set(-0.04 + i * 0.02, 0.03, -0.19);
      this.dots.push(d);
      this.overlay.add(d);
    });
    this.tray.root.add(this.overlay);
  }

  private snapshot(): Counters {
    return { ...this.tray.counters };
  }

  update(delta: number): void {
    if (!this.tray) return;
    if (this.finished) {
      this.runCelebration(delta);
      return;
    }
    const c = this.snapshot();
    const sum = c.pigmentPicks + c.drops + c.stylusTravel * 10 + c.combTravel * 10 + c.combGrabs + c.paperGrabs + c.prints;
    if (sum !== this.lastSum) {
      this.quiet = QUIET_AFTER_ACTION;
      this.lastSum = sum;
    }
    this.quiet = Math.max(0, this.quiet - delta);

    const r = this.flow.update(c);
    if (r.advanced) this.t = 0;
    if (this.flow.done) {
      this.finished = true;
      try {
        localStorage.setItem(KEY, '1');
      } catch {
        /* storage blocked: lesson simply shows again next time */
      }
      this.finger.visible = this.thumb.visible = this.ring.visible = this.ripple.visible = false;
      return;
    }

    this.dots.forEach((d, i) => {
      const m = d.material as MeshBasicMaterial;
      if (i < this.flow.index) m.color.setHex(0xffc95c);
      else if (i === this.flow.index) {
        m.color.setHex(0xfff1d0);
        d.scale.setScalar(1 + 0.35 * Math.sin(this.t * 6) ** 2 + r.progress * 0.5);
      }
    });

    this.t += delta;
    const show = this.quiet <= 0;
    this.finger.visible = this.thumb.visible = this.ripple.visible = show;
    this.animate(this.flow.step!.id, (this.t % LOOP) / LOOP);
  }

  /** Places the ghost for phase u (0..1) of the current step's loop. */
  private animate(id: StepId, u: number): void {
    const pinch = (open: number, x: number, y: number, z: number) => {
      // Fingertip and thumb tip, `open` metres apart along the tray depth.
      this.finger.position.set(x, y + open * 0.3, z - open / 2);
      this.thumb.position.set(x, y - open * 0.3, z + open / 2);
    };
    this.ripple.visible = false;
    this.thumb.visible = this.finger.visible;
    switch (id) {
      case 'pick': {
        const pot = this.tray.potPosition(0);
        this.target.copy(pot);
        const dip = Math.sin(Math.min(1, u * 1.6) * Math.PI);
        this.finger.position.set(pot.x, lerp(0.12, 0.022, dip), pot.z);
        this.thumb.visible = false;
        break;
      }
      case 'drop': {
        this.target.set(0.05, 0, 0.0);
        if (u < 0.35) pinch(lerp(0.06, 0.004, ease(u / 0.35)), 0.05, 0.1, 0);
        else if (u < 0.55) pinch(0.004, 0.05, 0.1, 0);
        else {
          pinch(lerp(0.004, 0.06, ease(Math.min(1, (u - 0.55) / 0.15))), 0.05, 0.1, 0);
          const k = ease((u - 0.55) / 0.45);
          this.ripple.visible = this.finger.visible;
          this.ripple.position.set(0.05, 0.002, 0);
          this.ripple.scale.setScalar(0.005 + k * 0.03);
          (this.ripple.material as MeshBasicMaterial).opacity = 0.7 * (1 - k);
        }
        break;
      }
      case 'swirl': {
        // Fingertip dips and draws a back-and-forth line across the water.
        const k = ease(u);
        const x = lerp(-0.15, 0.15, k);
        const z = 0.05 * Math.sin(k * Math.PI * 4);
        const dip = u < 0.08 ? 1 - u / 0.08 : u > 0.92 ? (u - 0.92) / 0.08 : 0;
        this.finger.position.set(x, -0.002 + dip * 0.06, z);
        this.thumb.visible = false;
        this.target.set(x, 0, z);
        break;
      }
      case 'comb': {
        const rest = this.tray.combRest;
        this.target.copy(rest);
        if (u < 0.3) pinch(lerp(0.05, 0.004, ease(u / 0.3)), rest.x, rest.y, rest.z);
        else {
          const k = ease((u - 0.3) / 0.7);
          pinch(0.004, lerp(rest.x, 0, Math.min(1, k * 3)), 0.045 + (k < 0.33 ? 0.03 : 0), lerp(0.14, -0.14, k));
        }
        break;
      }
      case 'print': {
        const rest = this.tray.paperRest;
        this.target.copy(rest);
        if (u < 0.3) pinch(lerp(0.05, 0.004, ease(u / 0.3)), rest.x, 0.02, rest.z);
        else if (u < 0.8) {
          const k = ease((u - 0.3) / 0.5);
          pinch(0.004, lerp(rest.x, 0, k), 0.02 + Math.sin(k * Math.PI) * 0.06, 0);
        } else pinch(lerp(0.004, 0.05, ease((u - 0.8) / 0.2)), 0, 0.02, 0);
        break;
      }
    }
    // Pulsing ring on the object to use.
    this.ring.position.set(this.target.x, this.target.y + 0.003, this.target.z);
    const pulse = 1 + 0.15 * Math.sin(this.t * 5);
    this.ring.scale.setScalar(id === 'swirl' || id === 'drop' ? 0.001 : pulse);
  }

  private runCelebration(delta: number): void {
    this.celebrate += delta;
    this.dots.forEach((d, i) => {
      (d.material as MeshBasicMaterial).color.setHex(0xffc95c);
      d.position.y = 0.03 + Math.max(0, Math.sin(this.celebrate * 6 - i * 0.6)) * 0.015 * Math.max(0, 1 - this.celebrate / 3);
    });
    if (this.celebrate > 4) this.overlay.visible = false;
  }
}
