/**
 * The tekne (marbling tray): placement on a real table, hand input on the
 * water, paint pots, and per-frame driving of the GPU surface.
 */
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
  XRPlane,
  createSystem,
} from '@iwsdk/core';
import { type Handedness, J } from '../hands/joints.js';
import { XRHandReader } from '../hands/xr-hands.js';
import { PALETTE, spreadIncrement } from './ops.js';
import { MarblingSurface } from './surface.js';

const TRAY_W = 0.48;
const TRAY_D = 0.34;
const TOUCH_DEPTH = 0.008; // fingertip below this height (m) is "in the water"
const PINCH_ON = 0.018;
const PINCH_OFF = 0.03;
const DROP_SPREAD_SECONDS = 0.5;
/** Spreading happens in a few discrete steps: each step is one GPU pass. */
const DROP_SPREAD_STEPS = 6;

interface SpreadingDrop {
  x: number;
  y: number;
  target: number;
  current: number;
  age: number;
  rgb: readonly [number, number, number];
}

interface HandInput {
  touching: boolean;
  lastX: number;
  lastY: number;
  pinched: boolean;
}

export class TraySystem extends createSystem({
  planes: { required: [XRPlane] },
}) {
  private tray!: Group;
  private water!: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private surface!: MarblingSurface;
  private reader = new XRHandReader();
  private drops: SpreadingDrop[] = [];
  private handInput: Record<Handedness, HandInput> = {
    left: { touching: false, lastX: 0, lastY: 0, pinched: false },
    right: { touching: false, lastX: 0, lastY: 0, pinched: false },
  };
  private pots: Mesh[] = [];
  private pigment = 0;
  private placedOnTable = false;
  private placedInFront = false;
  private tip = new Vector3();
  private thumb = new Vector3();
  private tmp = new Vector3();

  /** Exposed for the debug HUD / tests. */
  stats = { passesLastFrame: 0, placedOnTable: false };

  init(): void {
    this.surface = new MarblingSurface(this.renderer, { width: TRAY_W, depth: TRAY_D });
    this.tray = new Group();
    this.tray.name = 'tekne';

    const wood = new MeshStandardMaterial({ color: 0x6b4428, roughness: 0.7 });
    const rim = 0.025;
    const wall = 0.045;
    const sides: Array<[number, number, number, number]> = [
      [TRAY_W + rim * 2, rim, 0, -(TRAY_D + rim) / 2],
      [TRAY_W + rim * 2, rim, 0, (TRAY_D + rim) / 2],
      [rim, TRAY_D, -(TRAY_W + rim) / 2, 0],
      [rim, TRAY_D, (TRAY_W + rim) / 2, 0],
    ];
    for (const [w, d, x, z] of sides) {
      const m = new Mesh(new BoxGeometry(w, wall, d), wood);
      m.position.set(x, wall / 2 - 0.012, z);
      this.tray.add(m);
    }
    const floor = new Mesh(new BoxGeometry(TRAY_W + rim * 2, 0.012, TRAY_D + rim * 2), wood);
    floor.position.y = -0.018;
    this.tray.add(floor);

    this.water = new Mesh(
      new PlaneGeometry(TRAY_W, TRAY_D),
      new MeshBasicMaterial({ map: this.surface.texture }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.tray.add(this.water);

    // Paint pots along the front rim, nearest the user.
    PALETTE.forEach((p, i) => {
      const pot = new Mesh(
        new CylinderGeometry(0.022, 0.018, 0.035, 20),
        new MeshStandardMaterial({ color: 0xd8cbb2, roughness: 0.9 }),
      );
      const ink = new Mesh(
        new CylinderGeometry(0.019, 0.019, 0.002, 20),
        new MeshBasicMaterial({ color: (p.rgb[0] * 255) << 16 | (p.rgb[1] * 255) << 8 | (p.rgb[2] * 255) }),
      );
      ink.position.y = 0.0175;
      pot.add(ink);
      pot.position.set(-TRAY_W / 2 + 0.04 + i * ((TRAY_W - 0.08) / (PALETTE.length - 1)), 0.0, TRAY_D / 2 + 0.07);
      this.tray.add(pot);
      this.pots.push(pot);
    });
    this.selectPigment(0);

    this.world.createTransformEntity(this.tray);

    this.queries.planes.subscribe('qualify', (entity) => {
      if (this.placedOnTable) return;
      const plane = entity.getValue(XRPlane, '_plane') as XRPlane | undefined;
      const obj = entity.object3D;
      if (!plane || !obj || plane.orientation !== 'horizontal') return;
      obj.getWorldPosition(this.tmp);
      // A seated desk or table: between knee and chest height.
      if (this.tmp.y < 0.45 || this.tmp.y > 1.15) return;
      this.player.head.getWorldPosition(this.tip);
      const horizontal = Math.hypot(this.tmp.x - this.tip.x, this.tmp.z - this.tip.z);
      if (horizontal > 1.2) return;
      this.placeAt(this.tmp.x, this.tmp.y + 0.012, this.tmp.z);
      this.placedOnTable = true;
      this.stats.placedOnTable = true;
    });
  }

  private selectPigment(i: number): void {
    this.pigment = i;
    this.pots.forEach((pot, k) => {
      pot.position.y = k === i ? 0.012 : 0;
      pot.scale.setScalar(k === i ? 1.15 : 1);
    });
  }

  /** Puts the tray at a world point, turned to face the user. */
  private placeAt(x: number, y: number, z: number): void {
    this.player.head.getWorldPosition(this.tmp);
    this.tray.position.set(x, y, z);
    this.tray.rotation.set(0, Math.atan2(this.tmp.x - x, this.tmp.z - z), 0);
  }

  private placeInFrontOfUser(): void {
    const head = this.player.head;
    head.getWorldPosition(this.tmp);
    head.getWorldDirection(this.tip); // camera looks down -Z, so this is "backwards"
    const fx = -this.tip.x;
    const fz = -this.tip.z;
    const l = Math.hypot(fx, fz) || 1;
    this.placeAt(this.tmp.x + (fx / l) * 0.42, this.tmp.y - 0.5, this.tmp.z + (fz / l) * 0.42);
  }

  update(delta: number): void {
    const frame = this.world.xrFrame;
    if (!this.placedOnTable && !this.placedInFront && frame) {
      this.placeInFrontOfUser();
      this.placedInFront = true;
    }

    this.reader.update(frame, this.world.xrReferenceSpace, this.player);
    for (const side of ['left', 'right'] as const) {
      if (this.reader.tracked[side]) this.handleHand(side);
      else {
        this.handInput[side].touching = false;
        this.handInput[side].pinched = false;
      }
    }

    // Spread drops over a short time, like ink settling on the size.
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += delta;
      const t = Math.min(1, d.age / DROP_SPREAD_SECONDS);
      const step = Math.ceil(t * DROP_SPREAD_STEPS) / DROP_SPREAD_STEPS;
      const next = d.target * Math.sqrt(1 - (1 - step) * (1 - step));
      if (next <= d.current) continue;
      this.surface.addDrop(d.x, d.y, spreadIncrement(d.current, next), d.rgb);
      d.current = next;
      if (t >= 1) this.drops.splice(i, 1);
    }

    this.water.material.map = this.surface.texture;
    this.stats.passesLastFrame = this.surface.takePassCount();
  }

  private handleHand(side: Handedness): void {
    const snap = this.reader.hands[side];
    const st = this.handInput[side];
    const p = snap.positions;
    const ti = J['index-finger-tip'] * 3;
    const tt = J['thumb-tip'] * 3;
    this.tip.set(p[ti], p[ti + 1], p[ti + 2]);
    this.thumb.set(p[tt], p[tt + 1], p[tt + 2]);
    const pinchDist = this.tip.distanceTo(this.thumb);
    this.tray.worldToLocal(this.tip);
    // Tray local: x across, -z away from user. Surface coords: y = -z.
    const sx = this.tip.x;
    const sy = -this.tip.z;
    const over = Math.abs(sx) < TRAY_W / 2 && Math.abs(sy) < TRAY_D / 2;

    // Poke a pot to choose a pigment.
    for (let i = 0; i < this.pots.length; i++) {
      const pot = this.pots[i];
      if (
        Math.hypot(this.tip.x - pot.position.x, this.tip.z - pot.position.z) < 0.03 &&
        this.tip.y < 0.05 &&
        this.tip.y > -0.01 &&
        i !== this.pigment
      ) {
        this.selectPigment(i);
      }
    }

    // Stylus: fingertip in the water drags the fluid.
    const inWater = over && this.tip.y < TOUCH_DEPTH;
    if (inWater && st.touching) {
      this.surface.addStroke(st.lastX, st.lastY, sx, sy);
    }
    st.touching = inWater;
    st.lastX = sx;
    st.lastY = sy;

    // Pinch above the water, release to let a drop fall.
    if (!st.pinched && pinchDist < PINCH_ON) st.pinched = true;
    else if (st.pinched && pinchDist > PINCH_OFF) {
      st.pinched = false;
      if (over && this.tip.y > TOUCH_DEPTH && this.tip.y < 0.35) {
        // Higher release, bigger splash (within a natural range).
        const target = 0.014 + Math.min(0.3, this.tip.y) * 0.08;
        this.drops.push({
          x: sx,
          y: sy,
          target,
          current: 0,
          age: 0,
          rgb: PALETTE[this.pigment].rgb,
        });
      }
    }
  }
}
