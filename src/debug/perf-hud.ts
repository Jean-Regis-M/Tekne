/**
 * In-headset performance readout, enabled with `?hud=1`.
 * Reports frame rate, worst frame time and marbling GPU passes over 1 s
 * windows, and keeps a rolling log readable at `window.__perfLog`.
 */
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, createSystem } from '@iwsdk/core';

export interface PerfSample {
  t: number;
  fps: number;
  worstMs: number;
  passes: number;
  inXR: boolean;
}

export const perfCounters = { passes: 0 };

export class PerfHudSystem extends createSystem({}) {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private tex!: CanvasTexture;
  private mesh!: Mesh;
  private frames = 0;
  private elapsed = 0;
  private worst = 0;
  private log: PerfSample[] = [];

  init(): void {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 64;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new CanvasTexture(this.canvas);
    this.mesh = new Mesh(
      new PlaneGeometry(0.16, 0.04),
      new MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false }),
    );
    this.mesh.renderOrder = 999;
    // Fixed to the head, low in the view so it does not cover the tray centre.
    this.mesh.position.set(0, -0.16, -0.5);
    this.player.head.add(this.mesh);
    (window as unknown as { __perfLog: PerfSample[] }).__perfLog = this.log;
  }

  update(delta: number, time: number): void {
    this.frames++;
    this.elapsed += delta;
    this.worst = Math.max(this.worst, delta * 1000);
    if (this.elapsed < 1) return;
    const sample: PerfSample = {
      t: +time.toFixed(1),
      fps: +(this.frames / this.elapsed).toFixed(1),
      worstMs: +this.worst.toFixed(1),
      passes: perfCounters.passes,
      inXR: !!this.world.session,
    };
    this.log.push(sample);
    if (this.log.length > 600) this.log.shift();
    const c = this.ctx;
    c.clearRect(0, 0, 256, 64);
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillRect(0, 0, 256, 64);
    c.fillStyle = sample.fps >= 60 ? '#8fe08f' : '#ff8a80';
    c.font = '22px monospace';
    c.fillText(`${sample.fps} fps  max ${sample.worstMs}ms`, 8, 26);
    c.fillStyle = '#ddd';
    c.font = '18px monospace';
    c.fillText(`gpu passes/s ${sample.passes}`, 8, 52);
    this.tex.needsUpdate = true;
    this.frames = 0;
    this.elapsed = 0;
    this.worst = 0;
    perfCounters.passes = 0;
  }
}
