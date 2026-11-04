/**
 * Three small engraved tiles on the front rim that toggle comfort settings
 * by poking, like the pots. Icons are drawn on canvas (no text needed):
 * a hovering hand (paint without dipping), a half-filled circle (contrast),
 * and a speaker (sound). A lit tile means "on".
 */
import { BoxGeometry, CanvasTexture, Mesh, MeshBasicMaterial, MeshStandardMaterial, SRGBColorSpace } from '@iwsdk/core';
import type { Settings } from '../settings.js';

export type TileId = keyof Settings;
export const TILE_IDS: TileId[] = ['hoverPaint', 'highContrast', 'sound'];

function drawIcon(id: TileId, on: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = on ? '#f6dfa6' : '#4a3221';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = g.fillStyle = on ? '#3b2516' : '#d9c7a6';
  g.lineWidth = 9;
  g.lineCap = 'round';
  if (id === 'hoverPaint') {
    // Fingertip above a wavy water line.
    g.beginPath();
    g.moveTo(64, 22);
    g.lineTo(64, 66);
    g.stroke();
    g.beginPath();
    g.arc(64, 70, 7, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    for (let x = 18; x <= 110; x += 2) g.lineTo(x, 98 + Math.sin(x / 9) * 6);
    g.stroke();
  } else if (id === 'highContrast') {
    g.beginPath();
    g.arc(64, 64, 38, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(64, 64, 38, -Math.PI / 2, Math.PI / 2);
    g.fill();
  } else {
    g.beginPath();
    g.moveTo(26, 52);
    g.lineTo(44, 52);
    g.lineTo(66, 32);
    g.lineTo(66, 96);
    g.lineTo(44, 76);
    g.lineTo(26, 76);
    g.closePath();
    g.fill();
    if (on) {
      g.beginPath();
      g.arc(70, 64, 22, -0.8, 0.8);
      g.stroke();
      g.beginPath();
      g.arc(70, 64, 38, -0.8, 0.8);
      g.stroke();
    } else {
      g.beginPath();
      g.moveTo(82, 48);
      g.lineTo(108, 80);
      g.moveTo(108, 48);
      g.lineTo(82, 80);
      g.stroke();
    }
  }
  return c;
}

export class SettingTile {
  readonly mesh: Mesh;
  private top: MeshBasicMaterial;

  constructor(readonly id: TileId, on: boolean) {
    this.top = new MeshBasicMaterial();
    const wood = new MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 });
    // Box faces: +x, -x, +y (top), -y, +z, -z.
    this.mesh = new Mesh(new BoxGeometry(0.034, 0.012, 0.034), [wood, wood, this.top, wood, wood, wood]);
    this.mesh.name = `tile-${id}`;
    this.set(on);
  }

  set(on: boolean): void {
    this.top.map?.dispose();
    const tex = new CanvasTexture(drawIcon(this.id, on));
    tex.colorSpace = SRGBColorSpace;
    this.top.map = tex;
    this.top.needsUpdate = true;
  }
}
