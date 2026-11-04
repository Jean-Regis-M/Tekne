/**
 * Development-only footage recorder (enabled with `?rec=1` on localhost).
 * Records exactly what the app renders (the WebGL canvas) plus the app's own
 * synthesised audio, and posts the WebM to a local receiver
 * (`node scripts/rec-server.mjs`). Used to capture honest demo footage from
 * the Immersive Web Emulator; never shipped in production builds.
 */
import { sound } from '../audio/sound.js';

export function installRecorder(canvas: HTMLCanvasElement): void {
  let rec: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  const api = {
    start(fps = 60): string {
      const stream = canvas.captureStream(fps);
      const audio = sound.captureTrack();
      if (audio) stream.addTrack(audio);
      const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
        .find((m) => MediaRecorder.isTypeSupported(m))!;
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
      chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.start(500);
      return mime;
    },
    async stop(name: string): Promise<string> {
      if (!rec) return 'not recording';
      const done = new Promise((r) => (rec!.onstop = r));
      rec.stop();
      await done;
      const blob = new Blob(chunks, { type: 'video/webm' });
      const res = await fetch(`http://localhost:8090/save?name=${encodeURIComponent(name)}`, {
        method: 'POST',
        body: blob,
      });
      rec = null;
      return `${res.status} ${await res.text()}`;
    },
  };
  (window as unknown as { __rec: typeof api }).__rec = api;
}
