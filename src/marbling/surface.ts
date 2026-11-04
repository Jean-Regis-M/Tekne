/**
 * GPU marbling surface: the pattern lives in a colour texture, and each
 * operation (drop, stroke) is one full-texture pass that resamples the
 * previous texture through the inverse map from ops.ts. Nothing runs while
 * the water is untouched, so idle cost is zero.
 */
import {

  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from '@iwsdk/core';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const COMMON = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D src;
uniform vec2 size; // tray size in metres
uniform float texel; // metres per texel
vec2 toMetres(vec2 uv) { return (uv - 0.5) * size; }
vec2 toUv(vec2 m) { return m / size + 0.5; }
// Resampling through a bilinear filter softens the pattern a little every
// pass. Where the fluid moved less than a fraction of a texel, keep the
// texel exactly, so repeated operations only blur where paint really moves.
vec3 resample(vec2 q, vec2 p) {
  vec2 d = p - q;
  if (dot(d, d) < 0.09 * texel * texel) p = q;
  return texture2D(src, toUv(p)).rgb;
}
`;

const DROP_FRAG = /* glsl */ `
${COMMON}
uniform vec2 center;
uniform float radius;
uniform vec3 ink;
void main() {
  vec2 q = toMetres(vUv);
  vec2 d = q - center;
  float d2 = dot(d, d);
  float r2 = radius * radius;
  // One texel of antialiasing on the new drop's rim.
  float edge = smoothstep(radius - texel, radius + texel, sqrt(d2));
  vec2 p = center + d * sqrt(max(0.0, 1.0 - r2 / max(d2, 1e-12)));
  gl_FragColor = vec4(mix(ink, resample(q, p), edge), 1.0);
}
`;

const STROKE_FRAG = /* glsl */ `
${COMMON}
uniform vec2 a;
uniform vec2 b;
uniform float lambda;
float segDist2(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float l2 = dot(ab, ab);
  float t = l2 > 1e-12 ? clamp(dot(p - a, ab) / l2, 0.0, 1.0) : 0.0;
  vec2 c = a + ab * t - p;
  return dot(c, c);
}
void main() {
  vec2 q = toMetres(vUv);
  float w = exp(-segDist2(q, a, b) / (lambda * lambda));
  vec2 p = q - (b - a) * w;
  gl_FragColor = vec4(resample(q, p), 1.0);
}
`;

const COMB_FRAG = /* glsl */ `
${COMMON}
uniform vec2 a;       // comb centre, previous frame
uniform vec2 b;       // comb centre, this frame
uniform vec2 across;  // unit vector along the comb's spine
uniform float spacing;
uniform float count;
uniform float lambda;
float segDist2(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float l2 = dot(ab, ab);
  float t = l2 > 1e-12 ? clamp(dot(p - a, ab) / l2, 0.0, 1.0) : 0.0;
  vec2 c = a + ab * t - p;
  return dot(c, c);
}
void main() {
  vec2 q = toMetres(vUv);
  float w = 0.0;
  for (int i = 0; i < 16; i++) {
    if (float(i) >= count) break;
    vec2 o = across * ((float(i) - (count - 1.0) * 0.5) * spacing);
    w = max(w, exp(-segDist2(q, a + o, b + o) / (lambda * lambda)));
  }
  vec2 p = q - (b - a) * w;
  gl_FragColor = vec4(resample(q, p), 1.0);
}
`;

const COPY_FRAG = /* glsl */ `
${COMMON}
void main() { gl_FragColor = vec4(texture2D(src, vUv).rgb, 1.0); }
`;

const FILL_FRAG = /* glsl */ `
${COMMON}
uniform vec3 ink;
void main() { gl_FragColor = vec4(ink, 1.0); }
`;

export interface SurfaceOptions {
  /** Tray interior size in metres. */
  width: number;
  depth: number;
  /** Texture resolution along the width; height follows the aspect. */
  resolution?: number;
  /** Base "size" (water) colour. */
  base?: [number, number, number];
}

export class MarblingSurface {
  readonly width: number;
  readonly depth: number;
  private targets: [WebGLRenderTarget, WebGLRenderTarget];
  private read = 0;
  private scene = new Scene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: Mesh;
  private drop: ShaderMaterial;
  private stroke: ShaderMaterial;
  private fill: ShaderMaterial;
  private comb: ShaderMaterial;
  private copy: ShaderMaterial;
  /** Number of GPU passes run since the last call to takePassCount(). */
  private passes = 0;

  constructor(private renderer: WebGLRenderer, opts: SurfaceOptions) {
    this.width = opts.width;
    this.depth = opts.depth;
    const w = opts.resolution ?? 1536;
    const h = Math.round((w * opts.depth) / opts.width);
    const make = () =>
      new WebGLRenderTarget(w, h, {
        format: RGBAFormat,
        type: UnsignedByteType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
      });
    this.targets = [make(), make()];
    for (const t of this.targets) t.texture.colorSpace = SRGBColorSpace;
    const size = new Vector2(opts.width, opts.depth);
    const base = {
      src: { value: null as Texture | null },
      size: { value: size },
      texel: { value: opts.width / w },
    };
    this.drop = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: DROP_FRAG,
      uniforms: {
        ...base,
        center: { value: new Vector2() },
        radius: { value: 0 },
        ink: { value: new Vector3() },
      },
    });
    this.stroke = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: STROKE_FRAG,
      uniforms: {
        ...base,
        a: { value: new Vector2() },
        b: { value: new Vector2() },
        lambda: { value: 0.012 },
      },
    });
    this.comb = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: COMB_FRAG,
      uniforms: {
        ...base,
        a: { value: new Vector2() },
        b: { value: new Vector2() },
        across: { value: new Vector2(1, 0) },
        spacing: { value: 0.02 },
        count: { value: 12 },
        lambda: { value: 0.006 },
      },
    });
    this.fill = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FILL_FRAG,
      uniforms: { ...base, ink: { value: new Vector3() } },
    });
    this.copy = new ShaderMaterial({ vertexShader: VERT, fragmentShader: COPY_FRAG, uniforms: { ...base } });
    for (const m of [this.drop, this.stroke, this.fill, this.comb, this.copy]) {
      m.depthTest = false;
      m.depthWrite = false;
    }
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.fill);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.clear(opts.base ?? [0.93, 0.9, 0.82]);
  }

  /** Texture to display on the water mesh (always the latest result). */
  get texture(): Texture {
    return this.targets[this.read].texture;
  }

  clear(rgb: readonly [number, number, number]): void {
    (this.fill.uniforms.ink.value as Vector3).set(rgb[0], rgb[1], rgb[2]);
    this.pass(this.fill);
  }

  /** Drop of radius r (metres) at tray coords (x, y). */
  addDrop(x: number, y: number, r: number, rgb: readonly [number, number, number]): void {
    if (r <= 0) return;
    (this.drop.uniforms.center.value as Vector2).set(x, y);
    this.drop.uniforms.radius.value = r;
    (this.drop.uniforms.ink.value as Vector3).set(rgb[0], rgb[1], rgb[2]);
    this.pass(this.drop);
  }

  /** Drag the fluid from a to b with falloff width lambda (metres). */
  addStroke(ax: number, ay: number, bx: number, by: number, lambda = 0.012): void {
    if (Math.abs(bx - ax) + Math.abs(by - ay) < 1e-5) return;
    (this.stroke.uniforms.a.value as Vector2).set(ax, ay);
    (this.stroke.uniforms.b.value as Vector2).set(bx, by);
    this.stroke.uniforms.lambda.value = lambda;
    // Beyond 3 lambda the weight is below exp(-9): nothing visibly moves.
    const m = 3 * lambda;
    this.pass(this.stroke, Math.min(ax, bx) - m, Math.min(ay, by) - m, Math.max(ax, bx) + m, Math.max(ay, by) + m);
  }

  /**
   * Comb (tarak): `count` tines `spacing` apart along `across`, all moved
   * from a to b in one pass.
   */
  addComb(
    ax: number, ay: number, bx: number, by: number,
    acrossX: number, acrossY: number, count: number, spacing: number, lambda = 0.006,
  ): void {
    if (Math.abs(bx - ax) + Math.abs(by - ay) < 1e-5) return;
    const u = this.comb.uniforms;
    (u.a.value as Vector2).set(ax, ay);
    (u.b.value as Vector2).set(bx, by);
    (u.across.value as Vector2).set(acrossX, acrossY);
    u.count.value = Math.min(16, count);
    u.spacing.value = spacing;
    u.lambda.value = lambda;
    const half = ((Math.min(16, count) - 1) / 2) * spacing;
    const m = 3 * lambda;
    const ex = Math.abs(acrossX) * half + m;
    const ey = Math.abs(acrossY) * half + m;
    this.pass(this.comb, Math.min(ax, bx) - ex, Math.min(ay, by) - ey, Math.max(ax, bx) + ex, Math.max(ay, by) + ey);
  }

  takePassCount(): number {
    const n = this.passes;
    this.passes = 0;
    return n;
  }

  /** Copies the current pattern into a canvas (for saving a print). */
  readPixels(): { data: Uint8Array; width: number; height: number } {
    const t = this.targets[this.read];
    const data = new Uint8Array(t.width * t.height * 4);
    this.renderer.readRenderTargetPixels(t, 0, 0, t.width, t.height, data);
    return { data, width: t.width, height: t.height };
  }

  /**
   * One operation. With a region (tray metres) only that rectangle is
   * recomputed: the result is written into the spare target and copied back
   * into the current one, so both stay identical everywhere else. Without a
   * region the whole texture is recomputed (drops push paint everywhere).
   */
  private pass(mat: ShaderMaterial, x0?: number, y0?: number, x1?: number, y1?: number): void {
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    // While an XR session is presenting, three.js would swap in the XR
    // camera and stereo viewports; offscreen passes must bypass that.
    const xrWasEnabled = r.xr.enabled;
    r.xr.enabled = false;
    const src = this.targets[this.read];
    const dst = this.targets[1 - this.read];
    mat.uniforms.src.value = src.texture;
    this.quad.material = mat;
    if (x0 === undefined) {
      r.setRenderTarget(dst);
      r.render(this.scene, this.camera);
      this.read = 1 - this.read;
    } else {
      const W = src.width;
      const H = src.height;
      const px0 = Math.max(0, Math.floor((x0! / this.width + 0.5) * W) - 1);
      const py0 = Math.max(0, Math.floor((y0! / this.depth + 0.5) * H) - 1);
      const px1 = Math.min(W, Math.ceil((x1! / this.width + 0.5) * W) + 1);
      const py1 = Math.min(H, Math.ceil((y1! / this.depth + 0.5) * H) + 1);
      if (px1 > px0 && py1 > py0) {
        for (const t of this.targets) {
          t.scissor.set(px0, py0, px1 - px0, py1 - py0);
          t.scissorTest = true;
        }
        r.setRenderTarget(dst);
        r.render(this.scene, this.camera);
        this.copy.uniforms.src.value = dst.texture;
        this.quad.material = this.copy;
        r.setRenderTarget(src);
        r.render(this.scene, this.camera);
        for (const t of this.targets) t.scissorTest = false;
      }
    }
    r.setRenderTarget(prevTarget);
    r.xr.enabled = xrWasEnabled;
    this.passes++;
  }

  dispose(): void {
    for (const t of this.targets) t.dispose();
    for (const m of [this.drop, this.stroke, this.fill, this.comb, this.copy]) m.dispose();
    this.quad.geometry.dispose();
  }
}

