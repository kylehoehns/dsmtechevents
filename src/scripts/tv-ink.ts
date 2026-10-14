// The /tv/ ink transition (tv-fx.css, data-pull=ink): ink pours across the
// stage from a point, with a ragged, fibrous edge that breaks into halftone
// dots, covers the old sheet while the new one goes up under it, then soaks
// away in blotches. Drawn by one fragment shader on a canvas over the stage.
// inkLayer() returns null where WebGL isn't available, and the slideshow
// then never picks this kind.

const VERT = `attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `
precision highp float; // mediump is 16-bit on Apple GPUs: too coarse for the noise
uniform vec2 res;     // canvas size, px
uniform vec2 origin;  // where the ink starts, 0-1 from the top left
uniform float p;      // 0-1 through the transition
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
  float f = length(uv - o) + (fbm(uv * 3.0) - 0.5) * 0.55 + (fbm(uv * vec2(46.0, 7.0)) - 0.5) * 0.09;
  float c = smoothstep(0.0, 0.42, p);
  float reach = mix(-0.15, aspect + 0.9, c * c * (3.0 - 2.0 * c));
  float amt = (reach - f) / 0.14;
  // soaking away: blotches dry from the thinnest ink first
  float u = smoothstep(0.45, 1.0, p);
  float g = fbm(uv * 2.6 + 11.0) + (fbm(uv * vec2(38.0, 6.0)) - 0.5) * 0.08;
  amt = min(amt, (g - mix(-0.25, 1.15, u)) / 0.1);
  // the edge breaks into a halftone screen
  vec2 cell = fract(gl_FragCoord.xy / (9.0 * dpr)) - 0.5;
  float a = clamp(amt, 0.0, 1.0);
  float on = a >= 1.0 ? 1.0 : step(length(cell), a * 0.72);
  gl_FragColor = vec4(ink * on, on);
}`;

const DURATION = 1100;

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
  // origin: the point to pour from, in viewport px; color: a CSS hex color
  return function play(origin: { x: number; y: number }, color: string) {
    cancelAnimationFrame(frame);
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
    const start = performance.now();
    const draw = (now: number) => {
      const p = Math.min((now - start) / DURATION, 1);
      gl.uniform1f(at('p'), p);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (p < 1) frame = requestAnimationFrame(draw);
      else gl.clear(gl.COLOR_BUFFER_BIT);
    };
    frame = requestAnimationFrame(draw);
  };
}
