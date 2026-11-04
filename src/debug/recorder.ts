/**
 * Development-only footage recorder (enabled with `?rec=1` on localhost).
 *
 * Records what the user sees in the Immersive Web Emulator: the emulator's
 * room layer (its stand-in for passthrough, a separate canvas behind the
 * app) with the app's own WebGL canvas composited on top, plus the app's
 * synthesised audio. The emulator's UI overlay is not included. The WebM is
 * posted to a local receiver (`node scripts/rec-server.mjs`). Never shipped
 * in production builds.
 */
import { sound } from '../audio/sound.js';

function roomLayer(app: HTMLCanvasElement): HTMLCanvasElement | null {
  // The emulator's room canvas sits directly behind the app canvas.
  const others = [...document.querySelectorAll('canvas')].filter((c) => c !== app);
  return others.find((c) => getComputedStyle(c).zIndex === '1') ?? null;
}

export function installRecorder(canvas: HTMLCanvasElement): void {
  let rec: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let running = false;
  const out = document.createElement('canvas');
  const ctx = out.getContext('2d')!;

  const draw = () => {
    if (!running) return;
    if (out.width !== canvas.width || out.height !== canvas.height) {
      out.width = canvas.width;
      out.height = canvas.height;
    }
    const room = roomLayer(canvas);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, out.width, out.height);
    if (room) ctx.drawImage(room, 0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    requestAnimationFrame(draw);
  };

  const api = {
    start(fps = 30): string {
      running = true;
      draw();
      const stream = out.captureStream(fps);
      const audio = sound.captureTrack();
      if (audio) stream.addTrack(audio);
      const mime = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm'].find((m) =>
        MediaRecorder.isTypeSupported(m),
      )!;
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10_000_000 });
      chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.start(500);
      return mime;
    },
    pause(): void {
      if (rec?.state === 'recording') rec.pause();
    },
    resume(): void {
      if (rec?.state === 'paused') rec.resume();
    },
    async stop(name: string): Promise<string> {
      if (!rec) return 'not recording';
      const done = new Promise((r) => (rec!.onstop = r));
      rec.stop();
      await done;
      running = false;
      const blob = new Blob(chunks, { type: 'video/webm' });
      const res = await fetch(`http://localhost:8090/save?name=${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'content-type': 'video/webm' },
        body: blob,
      });
      rec = null;
      return `${res.status} ${await res.text()}`;
    },
  };
  (window as unknown as { __rec: typeof api }).__rec = api;
}
