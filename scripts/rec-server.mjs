// Local receiver for dev footage recordings (see src/debug/recorder.ts).
// Listens on 127.0.0.1:8090 only and writes POSTed WebM files to the folder
// given as the first argument.
//
// Hardening (a page on any site could otherwise POST here while it runs):
// - only requests whose Origin is exactly the local dev server are accepted;
// - the body must be declared video/webm (which also forces a CORS preflight);
// - bodies are capped; names are sanitised; existing files are never overwritten.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ALLOWED_ORIGIN = 'http://localhost:8082';
const MAX_BYTES = 400 * 1024 * 1024;
const outDir = resolve(process.argv[2] ?? 'recordings');
mkdirSync(outDir, { recursive: true });

createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin !== ALLOWED_ORIGIN) {
    res.statusCode = 403;
    return res.end('forbidden');
  }
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.end();
  const url = new URL(req.url, 'http://localhost');
  if (req.method !== 'POST' || url.pathname !== '/save' || !String(req.headers['content-type']).startsWith('video/webm')) {
    res.statusCode = 400;
    return res.end('bad request');
  }
  const base = (url.searchParams.get('name') ?? 'clip').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || 'clip';
  let file = join(outDir, `${base}.webm`);
  for (let i = 2; existsSync(file); i++) file = join(outDir, `${base}_${i}.webm`);
  const parts = [];
  let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BYTES) {
      res.statusCode = 413;
      res.end('too large');
      req.destroy();
      return;
    }
    parts.push(c);
  });
  req.on('end', () => {
    if (size > MAX_BYTES) return;
    writeFileSync(file, Buffer.concat(parts));
    res.end(`saved ${file} (${size} bytes)`);
    console.log('saved', file);
  });
}).listen(8090, '127.0.0.1', () => console.log('rec-server on 127.0.0.1:8090 ->', outDir));
