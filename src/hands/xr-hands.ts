/**
 * Reads WebXR articulated hand joints into reusable HandSnapshot buffers.
 * No per-frame allocation after construction.
 */
import { Matrix4, Vector3, type Object3D } from '@iwsdk/core';
import { JOINTS, type HandSnapshot, type Handedness } from './joints.js';

export class XRHandReader {
  readonly hands: Record<Handedness, HandSnapshot> = {
    left: { handedness: 'left', positions: new Float32Array(75), radii: new Float32Array(25) },
    right: { handedness: 'right', positions: new Float32Array(75), radii: new Float32Array(25) },
  };
  readonly tracked: Record<Handedness, boolean> = { left: false, right: false };
  private v = new Vector3();
  private m = new Matrix4();

  /**
   * @param origin the player rig; joint poses are in the XR reference space,
   * which is parented under it.
   */
  update(frame: XRFrame | null, refSpace: XRReferenceSpace | null, origin: Object3D): void {
    this.tracked.left = false;
    this.tracked.right = false;
    if (!frame || !refSpace) return;
    origin.updateWorldMatrix(true, false);
    this.m.copy(origin.matrixWorld);
    for (const source of frame.session.inputSources) {
      const hand = source.hand;
      const side = source.handedness;
      if (!hand || (side !== 'left' && side !== 'right')) continue;
      const snap = this.hands[side];
      let ok = true;
      for (let i = 0; i < JOINTS.length; i++) {
        const space = hand.get(JOINTS[i] as XRHandJoint);
        const pose = space ? frame.getJointPose?.(space, refSpace) : undefined;
        if (!pose) {
          ok = false;
          break;
        }
        const p = pose.transform.position;
        this.v.set(p.x, p.y, p.z).applyMatrix4(this.m);
        snap.positions[i * 3] = this.v.x;
        snap.positions[i * 3 + 1] = this.v.y;
        snap.positions[i * 3 + 2] = this.v.z;
        snap.radii[i] = pose.radius ?? 0.008;
      }
      this.tracked[side] = ok;
    }
  }
}
