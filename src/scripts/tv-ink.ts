// The /tv/ ink transition (tv-fx.css, data-pull=ink): a wave of ink rolls
// out from the slide's big date, its ragged, fibrous edges breaking into
// halftone dots. The new sheet shows behind the wave and the old one ahead
// of it, so the screen is never solid ink. One fragment shader on a canvas
// over the stage draws the wave; the new sheet is revealed by a clip-path
// circle that stays inside the wave, where the ink hides its smooth edge.
// inkLayer() returns null where WebGL isn't available, and the slideshow
// then never picks this kind.

const DURATION = 1000;
// The roughness can push the wave's edges this far (in screen heights) either
// way of a true circle; the band is wide enough that the new sheet's circle,
// drawn SLACK inside the front, always sits under ink.
const ROUGH = 0.3;
const SLACK = 0.17;
const BAND = 0.4;

const VERT = `attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `
#define ROUGH ${ROUGH.toFixed(2)}
#define BAND ${BAND.toFixed(2)}
precision highp float; // mediump is 16-bit on Apple GPUs: too coarse for the noise
uniform vec2 res;     // canvas size, px
uniform vec2 origin;  // where the ink starts, 0-1 from the top left
uniform float reach;  // how far the wave's front has rolled, in screen heights
uniform vec3 ink;
uniform float seed;
uniform float dpr;

// sin-free hash (Dave Hoskins), stable across GPUs
float hash(vec2 q) {
  vec3 p3 = fract(vec3(q.xyx + seed) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 q) {
  vec2 i = floor(q), f = fract(q);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 q) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(q); q *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  float aspect = res.x / res.y;
  vec2 uv = vec2(gl_FragCoord.x / res.y, 1.0 - gl_FragCoord.y / res.y);
  vec2 o = origin * vec2(aspect, 1.0);
  // distance from the pour, roughened by blots and paper fibres
  float f = length(uv - o) + (fbm(uv * 3.0) - 0.5) * ROUGH + (fbm(uv * vec2(46.0, 7.0)) - 0.5) * 0.09;
  // ink between the front (crisp) and the back (thinning into dots)
  float amt = min((reach - f) / 0.04, (f - (reach - BAND)) / 0.12);
  vec2 cell = fract(gl_FragCoord.xy / (9.0 * dpr)) - 0.5;
  float a = clamp(amt, 0.0, 1.0);
  float on = a >= 1.0 ? 1.0 : step(length(cell), a * 0.72);
  gl_FragColor = vec4(ink * on, on);
}`;

const hex = (css: string) => {
  const m = css.trim().match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? m.slice(1).map((h) => parseInt(h, 16) / 255) : [0.88, 0.38, 0.62];
};

export function inkLayer(stage: HTMLElement) {
  const canvas = document.createElement('canvas');
  canvas.className = 'tv-ink';
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true });
  if (!gl) return null;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const a = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(a);
  gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  const at = (name: string) => gl.getUniformLocation(prog, name);
  stage.append(canvas);

  let frame = 0;
  let clipped: HTMLElement | null = null;
  // Roll the wave across `slide` (the one coming in) from `origin`, a point
  // in viewport px, in `color`, a CSS hex color.
  return function play(slide: HTMLElement, origin: { x: number; y: number }, color: string) {
    cancelAnimationFrame(frame);
    if (clipped) clipped.style.clipPath = ''; // a quick key press cut the last wave short
    clipped = slide;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const box = canvas.getBoundingClientRect();
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(at('res'), canvas.width, canvas.height);
    gl.uniform2f(at('origin'), (origin.x - box.left) / box.width, (origin.y - box.top) / box.height);
    gl.uniform3fv(at('ink'), hex(color));
    gl.uniform1f(at('seed'), Math.random() * 100);
    gl.uniform1f(at('dpr'), dpr);
    // far enough that the wave's back has cleared the farthest corner
    const far =
      Math.max(
        ...[
          [box.left, box.top],
          [box.right, box.top],
          [box.left, box.bottom],
          [box.right, box.bottom],
        ].map(([x, y]) => Math.hypot(x - origin.x, y - origin.y)),
      ) / box.height;
    const end = far + BAND + ROUGH;
    const sheet = slide.getBoundingClientRect();
    const cx = origin.x - sheet.left;
    const cy = origin.y - sheet.top;
    const start = performance.now();
    const draw = (now: number) => {
      const p = Math.min(Math.max((now - start) / DURATION, 0), 1);
      const e = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
      const reach = -0.05 + (end + 0.05) * e;
      gl.uniform1f(at('reach'), reach);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      slide.style.clipPath = `circle(${Math.max(reach - SLACK, 0) * box.height}px at ${cx}px ${cy}px)`;
      if (p < 1) frame = requestAnimationFrame(draw);
      else {
        gl.clear(gl.COLOR_BUFFER_BIT);
        slide.style.clipPath = '';
      }
    };
    slide.style.clipPath = 'circle(0 at 0 0)';
    frame = requestAnimationFrame(draw);
  };
}
