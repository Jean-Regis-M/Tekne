/**
 * Physical tools on the tray rim: the comb (tarak) and the paper (kağıt),
 * plus print capture and local persistence. No menus: tools are objects
 * you pinch and use, as in a real ebru studio.
 */
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';

export const COMB_TINES = 12;
export const COMB_SPACING = 0.02; // 2 cm between tines
export const COMB_TINE_LENGTH = 0.05; // pinch point to tine tips

export function createComb(): Group {
  const g = new Group();
  g.name = 'comb';
  const wood = new MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.6 });
  const pin = new MeshStandardMaterial({ color: 0xc9c2b4, metalness: 0.6, roughness: 0.35 });
  const span = (COMB_TINES - 1) * COMB_SPACING;
  const spine = new Mesh(new BoxGeometry(span + 0.03, 0.012, 0.018), wood);
  g.add(spine);
  const pinGeo = new CylinderGeometry(0.0012, 0.0008, COMB_TINE_LENGTH - 0.006, 6);
  for (let i = 0; i < COMB_TINES; i++) {
    const m = new Mesh(pinGeo, pin);
    m.position.set(-span / 2 + i * COMB_SPACING, -(COMB_TINE_LENGTH - 0.006) / 2 - 0.006, 0);
    g.add(m);
  }
  return g;
}

export function createPaper(width: number, depth: number): Mesh {
  const m = new Mesh(
    new PlaneGeometry(width, depth),
    new MeshStandardMaterial({ color: 0xf3ecdc, roughness: 1, side: 2 }),
  );
  m.name = 'paper';
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** Converts raw RGBA pixels (bottom-up rows) into an upright canvas. */
export function pixelsToCanvas(data: Uint8Array, width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(width, height);
  const row = width * 4;
  for (let y = 0; y < height; y++) {
    img.data.set(data.subarray((height - 1 - y) * row, (height - y) * row), y * row);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** A framed print, ready to hang. `widthM` is the paper width in metres. */
export function createPrintMesh(canvas: HTMLCanvasElement, widthM: number): Mesh {
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  const h = (widthM * canvas.height) / canvas.width;
  const print = new Mesh(new PlaneGeometry(widthM, h), new MeshBasicMaterial({ map: tex }));
  const frame = new Mesh(
    new BoxGeometry(widthM + 0.02, h + 0.02, 0.008),
    new MeshStandardMaterial({ color: 0x3b2516, roughness: 0.8 }),
  );
  frame.position.z = -0.0045;
  print.add(frame);
  print.name = 'print';
  return print;
}

// ---- Persistence (local to this browser; no network) ----

const KEY = 'tekne.prints.v1';
const MAX_PRINTS = 12;

export interface StoredPrint {
  id: string;
  createdAt: string;
  /** JPEG data URL, downscaled. */
  image: string;
}

export function loadPrints(): StoredPrint[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as StoredPrint[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function savePrint(canvas: HTMLCanvasElement): StoredPrint | null {
  const small = document.createElement('canvas');
  small.width = 768;
  small.height = Math.round((768 * canvas.height) / canvas.width);
  small.getContext('2d')!.drawImage(canvas, 0, 0, small.width, small.height);
  const entry: StoredPrint = {
    id: `${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    image: small.toDataURL('image/jpeg', 0.85),
  };
  const list = [entry, ...loadPrints()].slice(0, MAX_PRINTS);
  // Storage can be full or blocked (private mode); drop oldest until it fits.
  while (list.length > 0) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return entry;
    } catch {
      list.pop();
    }
  }
  return null;
}

export function imageToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d')!.drawImage(img, 0, 0);
      resolve(c);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
