/**
 * Hangs prints on a real wall found by scene understanding. Picks the wall
 * the user faces, keeps clear of detected windows, doors and wall art, and
 * flies each new print from the tray to its frame. Falls back to a row
 * behind the tray when no usable wall is known.
 */
import { Group, Matrix4, Mesh, Quaternion, Vector3, XRPlane, createSystem } from '@iwsdk/core';
import { TraySystem } from '../marbling/tray-system.js';
import { createPrintMesh, imageToCanvas, loadPrints } from '../marbling/tools.js';
import { layoutOnWall, type Rect } from './wall-layout.js';

const SHOWN = 6;
const FLY_SECONDS = 1.4;
const OBSTACLE_LABELS = new Set(['window', 'door', 'wall art', 'screen', 'other']);

interface Wall {
  center: Vector3;
  normal: Vector3;
  right: Vector3;
  up: Vector3;
  width: number;
  height: number;
  distance: number;
  obstacles: Rect[];
}

interface Flight {
  mesh: Mesh;
  from: Vector3;
  t: number;
}

export class GallerySystem extends createSystem({ planes: { required: [XRPlane] } }) {
  private tray!: TraySystem;
  private root = new Group();
  private prints: Mesh[] = [];
  private flights: Flight[] = [];
  private wall: Wall | null = null;
  private dirty = true;
  private settle = 0;
  private m = new Matrix4();
  private q = new Quaternion();
  private v = new Vector3();
  private head = new Vector3();
  /** Exposed for tests and the debug handle. */
  readonly info = { onWall: false, wallDistance: 0, printW: 0 };

  init(): void {
    const tray = this.world.getSystem(TraySystem);
    if (!tray) return;
    this.tray = tray;
    this.world.createTransformEntity(this.root);
    tray.printListeners.push((canvas, from) => this.add(canvas, from.clone().setY(from.y + 0.05)));
    // Restore saved prints (newest first), without the fly-in.
    const stored = loadPrints().slice(0, SHOWN).reverse();
    for (const p of stored) void imageToCanvas(p.image).then((c) => this.add(c, null));
    const mark = () => {
      this.dirty = true;
      this.settle = 0.5; // planes arrive in bursts; wait for the burst to end
    };
    this.queries.planes.subscribe('qualify', mark);
    this.queries.planes.subscribe('disqualify', mark);
  }

  private add(canvas: HTMLCanvasElement, from: Vector3 | null): void {
    const mesh = createPrintMesh(canvas, 1);
    this.prints.unshift(mesh);
    this.root.add(mesh);
    while (this.prints.length > SHOWN) this.root.remove(this.prints.pop()!);
    if (from) this.flights.push({ mesh, from, t: 0 });
    this.dirty = true;
  }

  /** Wall the user faces: large, vertical, facing them, 0.6–5 m away. */
  private pickWall(): Wall | null {
    this.player.head.getWorldPosition(this.head);
    this.player.head.getWorldDirection(this.v);
    const fwd = new Vector3(-this.v.x, 0, -this.v.z).normalize();
    const walls: Array<Wall & { score: number }> = [];
    const verticals: Array<{ center: Vector3; normal: Vector3; w: number; h: number; label: string }> = [];
    for (const e of this.queries.planes.entities) {
      const plane = e.getValue(XRPlane, '_plane') as XRPlane | undefined;
      const obj = e.object3D as Mesh | undefined;
      if (!plane || !obj || plane.orientation !== 'vertical') continue;
      obj.updateWorldMatrix(true, false);
      const el = obj.matrixWorld.elements;
      const center = new Vector3(el[12], el[13], el[14]);
      const ax = new Vector3(el[0], el[1], el[2]).normalize();
      const ay = new Vector3(el[4], el[5], el[6]).normalize();
      const az = new Vector3(el[8], el[9], el[10]).normalize();
      obj.geometry.computeBoundingBox();
      const b = obj.geometry.boundingBox!;
      const sx = b.max.x - b.min.x;
      const sz = b.max.z - b.min.z;
      // Plane-space x/z span the plane; whichever is closer to world up is "up".
      const xIsUp = Math.abs(ax.y) > Math.abs(az.y);
      const up = (xIsUp ? ax : az).clone();
      if (up.y < 0) up.negate();
      const w = xIsUp ? sz : sx;
      const h = xIsUp ? sx : sz;
      const normal = ay.clone();
      if (normal.dot(this.v.subVectors(this.head, center)) < 0) normal.negate();
      const label = ((plane as XRPlane & { semanticLabel?: string }).semanticLabel ?? '').toLowerCase();
      verticals.push({ center, normal, w, h, label });
      if (label && label !== 'wall') continue;
      if (w < 1.2 || h < 1.2) continue;
      const toWall = this.v.subVectors(center, this.head);
      const distance = Math.abs(toWall.dot(normal));
      if (distance < 0.6 || distance > 5) continue;
      const right = new Vector3().crossVectors(up, normal).normalize();
      const facing = -normal.dot(fwd); // 1 when the wall is straight ahead
      if (facing < 0.2) continue;
      walls.push({ center, normal, right, up, width: w, height: h, distance, obstacles: [], score: facing * 2 - distance * 0.15 });
    }
    walls.sort((a, b) => b.score - a.score);
    const best = walls[0];
    if (!best) return null;
    // Obstacles: other vertical planes lying on this wall.
    for (const o of verticals) {
      if (o.label === 'wall' || (!o.label && o.w >= 1.2 && o.h >= 1.2)) continue;
      if (o.label && !OBSTACLE_LABELS.has(o.label)) continue;
      const d = this.v.subVectors(o.center, best.center);
      if (Math.abs(d.dot(best.normal)) > 0.15) continue;
      const u = d.dot(best.right);
      const vv = d.dot(best.up);
      best.obstacles.push({ u0: u - o.w / 2, u1: u + o.w / 2, v0: vv - o.h / 2, v1: vv + o.h / 2 });
    }
    return best;
  }

  private relayout(): void {
    this.wall = this.pickWall();
    const n = this.prints.length;
    if (n === 0) return;
    const wall = this.wall;
    if (wall) {
      // Prints read at a similar visual size whatever the wall distance.
      const printW = Math.min(0.6, Math.max(0.32, wall.distance * 0.14));
      const printH = printW * 0.708;
      this.player.head.getWorldPosition(this.head);
      const preferU = this.v.subVectors(this.head, wall.center).dot(wall.right);
      const layout = layoutOnWall({
        width: wall.width,
        height: wall.height,
        eyeV: this.head.y - wall.center.y,
        preferU,
        obstacles: wall.obstacles,
        count: n,
        printW,
        printH,
      });
      if (layout) {
        this.m.makeBasis(wall.right, wall.up, wall.normal);
        this.q.setFromRotationMatrix(this.m);
        layout.slots.forEach((s, i) => {
          const mesh = this.prints[i];
          mesh.scale.setScalar(printW);
          mesh.quaternion.copy(this.q);
          mesh.userData.target = wall.center
            .clone()
            .addScaledVector(wall.right, s.u)
            .addScaledVector(wall.up, s.v)
            .addScaledVector(wall.normal, 0.02);
        });
        this.info.onWall = true;
        this.info.wallDistance = +wall.distance.toFixed(2);
        this.info.printW = printW;
        this.applyTargets();
        return;
      }
    }
    // Fallback: a row behind the tray, tilted toward the user.
    const tray = this.tray.root;
    tray.updateWorldMatrix(true, false);
    this.prints.forEach((mesh, i) => {
      const slot = Math.ceil(i / 2) * (i % 2 ? -1 : 1);
      mesh.scale.setScalar(0.24);
      mesh.userData.target = tray.localToWorld(new Vector3(slot * 0.27, 0.32 - Math.abs(slot) * 0.02, -0.25));
      tray.getWorldQuaternion(mesh.quaternion);
    });
    this.info.onWall = false;
    this.applyTargets();
  }

  private applyTargets(): void {
    for (const mesh of this.prints) {
      if (!this.flights.some((f) => f.mesh === mesh)) mesh.position.copy(mesh.userData.target as Vector3);
    }
  }

  update(delta: number): void {
    if (!this.tray) return;
    if (this.dirty) {
      this.settle -= delta;
      if (this.settle <= 0) {
        this.dirty = false;
        this.relayout();
      }
    }
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      const target = f.mesh.userData.target as Vector3 | undefined;
      if (!target) continue;
      f.t = Math.min(1, f.t + delta / FLY_SECONDS);
      const k = f.t < 0.5 ? 2 * f.t * f.t : 1 - (-2 * f.t + 2) ** 2 / 2;
      f.mesh.position.lerpVectors(f.from, target, k);
      f.mesh.position.y += Math.sin(k * Math.PI) * 0.25; // a gentle arc
      if (f.t >= 1) this.flights.splice(i, 1);
    }
  }
}
