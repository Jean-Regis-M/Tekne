// Local receiver for dev footage recordings (see src/debug/recorder.ts).
// Listens on 127.0.0.1:8090 only and writes POSTed WebM files to the folder
// given as the first argument. Names are sanitised; nothing else is served.
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const outDir = resolve(process.argv[2] ?? 'recordings');
mkdirSync(outDir, { recursive: true });

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:8082');
  if (req.method === 'OPTIONS') return res.end();
  const url = new URL(req.url, 'http://localhost');
  if (req.method !== 'POST' || url.pathname !== '/save') {
    res.statusCode = 404;
    return res.end('not found');
  }
  const name = (url.searchParams.get('name') ?? 'clip').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  const parts = [];
  req.on('data', (c) => parts.push(c));
  req.on('end', () => {
    const file = join(outDir, `${name}.webm`);
    writeFileSync(file, Buffer.concat(parts));
    res.end(`saved ${file} (${Buffer.concat(parts).length} bytes)`);
    console.log('saved', file);
  });
}).listen(8090, '127.0.0.1', () => console.log('rec-server on 127.0.0.1:8090 ->', outDir));
