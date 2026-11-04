/**
 * Renders a high-resolution ebru (taraklı: battal ground, gelgit, comb)
 * using the same marbling maths as the app (src/marbling/ops.ts).
 * Used for the cover, thumbnail and presentation artwork: no AI imagery,
 * no stock images.
 *
 *   node scripts/marble-art.ts <out.png> [width] [height] [seed]
 *
 * Requires Node 23.6+ (runs TypeScript by type stripping).
 */
import { writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { PALETTE, dropInverse, tineInverse, type V2 } from '../src/marbling/ops.ts';

const [out = 'marble.png', wArg = '3000', hArg = '2000', seedArg = '1453'] = process.argv.slice(2);
const W = Number(wArg);
const H = Number(hArg);
const ASPECT = W / H;
// Surface in metres: 1.0 tall, ASPECT wide (like a large tekne).
const SW = ASPECT;
const SH = 1.0;

let seed = Number(seedArg);
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

type Op =
  | { kind: 'drop'; c: V2; r: number; rgb: readonly [number, number, number] }
  | { kind: 'tine'; b: V2; m: V2; z: number; u: number };

const ops: Op[] = [];
const base = [0.93, 0.9, 0.82] as const;
const pal = (id: string) => PALETTE.find((p) => p.id === id)!.rgb;

// Battal: layered grounds of drops, darker first, lighter accents last.
const layers: Array<[string, number, number, number]> = [
  ['lapis', 120, 0.05, 0.085],
  ['ochre', 95, 0.045, 0.075],
  ['madder', 85, 0.04, 0.07],
  ['malachite', 60, 0.035, 0.06],
  ['umber', 25, 0.025, 0.045],
  ['chalk', 70, 0.03, 0.055],
];
for (const [id, n, r0, r1] of layers) {
  for (let i = 0; i < n; i++) {
    ops.push({
      kind: 'drop',
      // Spread drops beyond the frame so combing never pulls in bare water.
      c: [(rnd() - 0.5) * SW * 1.3, (rnd() - 0.5) * SH * 1.6],
      r: r0 + rnd() * (r1 - r0),
      rgb: pal(id),
    });
  }
}
// Gelgit: back-and-forth tine lines across the width.
for (let y = -0.62, k = 0; y <= 0.62 + 1e-9; y += 0.042, k++) {
  ops.push({ kind: 'tine', b: [0, y], m: [k % 2 ? -1 : 1, 0], z: 0.16, u: 1e-16 });
}
// Tarak: a comb pulled once along the height.
for (let x = -SW / 2 - 0.05; x <= SW / 2 + 0.05; x += 0.028) {
  ops.push({ kind: 'tine', b: [x, 0], m: [0, 1], z: 0.09, u: 1e-20 });
}

const px = Buffer.alloc(H * (1 + W * 3));
const t0 = Date.now();
for (let j = 0; j < H; j++) {
  const row = j * (1 + W * 3);
  px[row] = 0; // PNG filter: none
  for (let i = 0; i < W; i++) {
    let p: V2 = [((i + 0.5) / W - 0.5) * SW, (0.5 - (j + 0.5) / H) * SH];
    let rgb: readonly [number, number, number] = base;
    for (let k = ops.length - 1; k >= 0; k--) {
      const op = ops[k];
      if (op.kind === 'tine') p = tineInverse(p, op.b, op.m, op.z, op.u);
      else {
        const q = dropInverse(p, op.c, op.r);
        if (q === null) {
          rgb = op.rgb;
          break;
        }
        p = q;
      }
    }
    const o = row + 1 + i * 3;
    px[o] = Math.round(rgb[0] * 255);
    px[o + 1] = Math.round(rgb[1] * 255);
    px[o + 2] = Math.round(rgb[2] * 255);
  }
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // RGB
writeFileSync(
  out,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(px, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);
console.log(`${out}: ${W}x${H}, ${ops.length} operations, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
