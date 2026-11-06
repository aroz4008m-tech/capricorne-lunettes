// Repris de Capri (mochiiwuff/capri-desktop, licence PolyForm Noncommercial 1.0.0) : sprite.js + acting.js
// Seul changement : les mots 'export' sont retirés pour que la page s'ouvre en double-clic.
// WebGL renderer for the Capri cut-out.
// One texture, one quad: every bit of life (head tilt, mane sway and flare, both arms, sitting with
// dangling legs, smear frames, afterimages, line boil, speckles, the violet misregistration, glitch
// slices, teleport collapse) is done in the fragment shader.

const VERT = `
attribute vec2 aPos;
uniform vec2 uView;
uniform float uPad;
varying vec2 vPx;
void main() {
  vec2 uv = aPos * 0.5 + 0.5;
  vPx = vec2(uv.x, 1.0 - uv.y) * uView - uPad;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vPx;

uniform sampler2D uTex;
uniform vec2 uSize;
uniform float uSeed;
uniform float uBoil;
uniform float uHair;
uniform float uHead;
uniform float uMane;
uniform float uArmL;
uniform float uArmR;
uniform float uLongL;
uniform float uLongR;
uniform float uSit;
uniform float uBend;
uniform float uKickL;
uniform float uKickR;
uniform vec2 uSmear;
uniform vec2 uEcho;
uniform float uGlitch;
uniform float uGlitchSeed;
uniform float uSplit;
uniform float uCollapse;
uniform float uDissolve;
uniform float uSparkle;
uniform float uGrade;
uniform vec4 uSil;
uniform vec2 uMisreg;
uniform vec3 uRim;
uniform float uAlpha;
uniform float uPx; // sprite pixels per screen pixel

// landmarks, in sprite pixels (capri-full.png is 240x420, see tools/build-sprite.py)
const vec2 NECK = vec2(118.0, 152.0);   // the head tilts around this
const vec2 SHOULDER_L = vec2(98.0, 168.0);
const float MIRROR = 234.0;             // the right arm is the left one flipped around x = 117
const vec2 SHOULDER_R = vec2(136.0, 168.0);
const vec2 MANE = vec2(116.0, 92.0);    // middle of the mane, it flares out from here
const vec2 FACE = vec2(124.0, 132.0);   // her mask, kept rigid when the mane flares
const float AXIS = 118.0;
const float HIP = 232.0;                // bottom of the torso
const float KNEE = 305.0;               // both knees sit around here
const float KNEE_LX = 106.0;
const float KNEE_RX = 142.0;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec2 rot(vec2 p, vec2 c, float a) {
  float s = sin(a), k = cos(a);
  p -= c;
  return c + vec2(k * p.x - s * p.y, s * p.x + k * p.y);
}

vec4 tex(vec2 p) {
  if (p.x < 0.0 || p.y < 0.0 || p.x > uSize.x || p.y > uSize.y) return vec4(0.0);
  return texture2D(uTex, p / uSize);
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// The cut-out is darker and duller than the show; pull every pink/crimson toward the
// on-screen hot red and the mask toward neon green. "red" says how much of the mane it is.
vec3 grade(vec3 c, out float red) {
  vec3 h = rgb2hsv(c);
  float hx = h.x < 0.5 ? h.x + 1.0 : h.x;               // unwrap around red
  float lit = smoothstep(0.1, 0.3, h.z);
  red = smoothstep(0.78, 0.85, hx) * (1.0 - smoothstep(1.06, 1.1, hx)) * lit * smoothstep(0.06, 0.2, h.y);
  float green = smoothstep(0.22, 0.27, h.x) * (1.0 - smoothstep(0.47, 0.52, h.x)) * lit * smoothstep(0.15, 0.3, h.y);
  hx = mix(hx, 0.968, red * 0.6 * uGrade);
  h.x = fract(hx);
  h.y = mix(h.y, max(h.y, 0.86), red * uGrade);
  h.y = mix(h.y, min(1.0, h.y * 1.1 + 0.06), green * uGrade);
  h.z = mix(h.z, min(1.0, h.z * 1.5 + 0.1), (red + green) * uGrade);
  return hsv2rgb(h);
}

// Graded, speckled, premultiplied sample of the figure.
vec4 cel(vec2 s) {
  vec4 c = tex(s);
  if (c.a <= 0.0) return vec4(0.0);
  float red;
  c.rgb = grade(c.rgb, red);
  // speckles on the red parts: a fixed star field plus a few that twinkle per drawing.
  // One speck is about one screen pixel whatever her size, and sticks to the body.
  if (red > 0.0 && uSparkle > 0.0) {
    vec2 cell = floor(s / max(0.8, uPx * 1.2));
    float star = step(0.976, hash(cell + 3.1)) * 0.85;
    float tw = step(0.993, hash(cell + uSeed * 1.37));
    c.rgb = mix(c.rgb, vec3(1.0, 0.95, 0.97), clamp((star + tw) * red * uSparkle, 0.0, 1.0));
  }
  return vec4(c.rgb * c.a, c.a);
}

// Lower legs, in source pixels; the line between them leans with the stance.
float legSep(float y) { return 117.0 + max(0.0, y - 300.0) * 0.15; }
float legL(vec2 s) { return step(KNEE - 6.0, s.y) * (1.0 - step(legSep(s.y), s.x)); }
float legR(vec2 s) { return step(KNEE - 6.0, s.y) * step(legSep(s.y), s.x); }

// Sitting, seen from the front: the thighs come toward us so they shrink,
// and everything below them rides up.
float thighScale() { return mix(1.0, 0.3, uSit); }

vec2 unsit(vec2 q) {
  if (uSit <= 0.0 || q.y <= HIP) return q;
  float c = thighScale();
  if (q.y <= HIP + (KNEE - HIP) * c) q.y = HIP + (q.y - HIP) / c;
  else q.y += (KNEE - HIP) * (1.0 - c);
  return q;
}

// The reaching arm, on the left of the cut-out, between the hair spike above it and the hip
// below. The right arm is this same drawing mirrored (the original hanging one was removed).
float armL(vec2 s) {
  if (s.x > 101.0 || s.y > 234.0) return 0.0;
  float top = 159.0 + (98.0 - s.x) * 0.5;
  float bot = s.x < 50.0 ? 234.0 : 178.0 + (98.0 - s.x) * 0.62;
  return step(top, s.y) * step(s.y, bot);
}

vec2 mirrorArm(vec2 s) { return vec2(MIRROR - s.x, s.y); }

// An arm drawn longer than it is (anime exaggeration, so a reach reads past the mane):
// stretched along its length only, from the shoulder, so it stays as thin. In the left arm's
// rest frame, which is where both arms are looked up.
const vec2 ARM_DIR = vec2(-0.85954, 0.51108); // shoulder to hand at rest
vec2 stretchArm(vec2 s, float k) {
  if (k == 1.0) return s;
  vec2 v = s - SHOULDER_L;
  float along = dot(v, ARM_DIR);
  return SHOULDER_L + ARM_DIR * (along / k) + (v - ARM_DIR * along);
}
vec2 armLeft(vec2 q) { return stretchArm(rot(q, SHOULDER_L, -uArmL), uLongL); }
vec2 armRight(vec2 q) { return stretchArm(mirrorArm(rot(q, SHOULDER_R, uArmR)), uLongR); }

bool legsRigged() { return uSit > 0.0 || uKickL != 0.0 || uKickR != 0.0; }

// Bent at the hips (lying back on one arm): her legs swung around her hip, toward the left of the
// cut-out for a positive bend, easing in over the waist so nothing tears.
vec2 hips(vec2 q) {
  if (uBend == 0.0) return q;
  return rot(q, vec2(AXIS, HIP), -uBend * smoothstep(HIP - 16.0, HIP + 8.0, q.y));
}

// Everything but the arms, with each lower leg swung on its knee (outward for positive kicks).
vec4 torso(vec2 q) {
  q = hips(q);
  if (!legsRigged()) return armL(q) > 0.0 ? vec4(0.0) : cel(q);
  float kneeY = HIP + (KNEE - HIP) * thighScale();
  vec2 qB = unsit(q);
  vec2 qL = unsit(rot(q, vec2(KNEE_LX, kneeY), -uKickL));
  vec2 qR = unsit(rot(q, vec2(KNEE_RX, kneeY), uKickR));
  vec4 b = legL(qB) + legR(qB) + armL(qB) > 0.0 ? vec4(0.0) : cel(qB);
  vec4 l = legL(qL) > 0.0 ? cel(qL) : vec4(0.0);
  vec4 r = legR(qR) > 0.0 ? cel(qR) : vec4(0.0);
  vec4 c = l + b * (1.0 - l.a);
  return r + c * (1.0 - r.a);
}

// Both arms turned on their shoulders (positive raises them). They pass in front of the body
// and the mane (a hand reaching up stays visible), except right at the shoulders, which cover the joints.
float armAlpha(vec2 q) {
  vec2 qL = armLeft(q);
  vec2 qR = armRight(q);
  return max(armL(qL) * tex(qL).a, armL(qR) * tex(qR).a);
}

// The head and mane acting, on the body only: an arm raised up into the mane stays straight.
vec2 bend(vec2 q) {
  // head tilt: everything above the collar bends around the neck, the body stays put. So do the
  // tips of the mane hanging down on either side of her shoulders: they belong to the head.
  float tips = smoothstep(26.0, 40.0, abs(q.x - AXIS)) * smoothstep(195.0, 175.0, q.y);
  q = rot(q, NECK, -uHead * max(smoothstep(162.0, 138.0, q.y), tips));

  // mane flare: the shards bristle outward, unevenly, around a rigid face
  if (uMane != 0.0) {
    vec2 d = q - MANE;
    float spikes = 0.55 + 0.9 * vnoise(vec2(atan(d.y, d.x) * 2.6, 4.0));
    float w = smoothstep(182.0, 60.0, q.y) * smoothstep(16.0, 30.0, distance(q, FACE));
    q = MANE + d / (1.0 + uMane * w * 0.32 * spikes);
  }

  // mane sway, strongest at the tips
  float hw = smoothstep(175.0, 5.0, q.y);
  q.x -= uHair * hw * (0.65 + 0.35 * sin(q.y * 0.055));
  q.y -= uHair * 0.22 * hw * sin(q.x * 0.045);
  return q;
}

vec4 rig(vec2 q) {
  vec2 qL = armLeft(q);
  vec2 qR = armRight(q);
  vec4 l = armL(qL) > 0.0 ? cel(qL) : vec4(0.0);
  vec4 r = armL(qR) > 0.0 ? cel(qR) : vec4(0.0);
  vec4 arms = l + r * (1.0 - l.a);
  vec4 b = torso(bend(q));
  bool joint = distance(q, SHOULDER_L) < 18.0 || distance(q, SHOULDER_R) < 18.0;
  if (joint) return b + arms * (1.0 - b.a);
  // where an arm crosses the body or the mane, ink a violet line around it so it reads
  if (arms.a < 0.5 && b.a > 0.5 && (uArmL != 0.0 || uArmR != 0.0)) {
    float edge = max(max(armAlpha(q + vec2(1.8, 0.0)), armAlpha(q - vec2(1.8, 0.0))),
                     max(armAlpha(q + vec2(0.0, 1.8)), armAlpha(q - vec2(0.0, 1.8))));
    if (edge > 0.5) return vec4(uRim, 1.0);
  }
  return arms + b * (1.0 - arms.a);
}

float rigAlpha(vec2 q) {
  return rig(q).a;
}

// What happens to the whole drawing: the teleport collapse, glitch slices, line boil.
vec2 settle(vec2 p) {
  vec2 q = p;

  // teleport: squeeze into a vertical line of light
  q.x = AXIS + (q.x - AXIS) / max(1.0 - uCollapse, 0.025);
  q.y = 240.0 + (q.y - 240.0) / (1.0 + uCollapse * 0.4);

  // relic-style slices
  if (uGlitch > 0.0) {
    float bh = mix(5.0, 26.0, hash(vec2(uGlitchSeed, 7.0)));
    float band = floor(q.y / bh);
    float on = step(1.0 - uGlitch * 0.6, hash(vec2(band, uGlitchSeed)));
    q.x += on * (hash(vec2(band + 3.0, uGlitchSeed)) - 0.5) * 72.0 * uGlitch;
  }

  // boil: the line wobble you get when every drawing is redone by hand
  q += (vec2(vnoise(q * 0.075 + uSeed * 13.7), vnoise(q * 0.075 + uSeed * 7.3 + 31.0)) - 0.5) * 2.0 * uBoil;
  return q;
}

void main() {
  vec2 p = vPx;

  if (uDissolve > 0.0) {
    vec2 g = rot(p, vec2(110.0, 210.0), 0.55);
    vec2 cell = floor(g / vec2(16.0, 9.0));
    if (hash(cell + floor(uGlitchSeed)) < uDissolve) discard;
  }

  vec2 q = settle(p);
  vec4 c = rig(q);
  vec3 col = c.rgb;
  float a = c.a;

  // chromatic split: red and blue channels pulled apart
  if (uSplit > 0.0) {
    vec4 cr = rig(q + vec2(uSplit, 0.0));
    vec4 cb = rig(q - vec2(uSplit, uSplit * 0.3));
    col = vec3(cr.r, col.g, cb.b);
    a = max(a, max(cr.a, cb.a));
  }

  // smear frame: two multiples of the head trailing where it came from
  if (uSmear != vec2(0.0)) {
    float hw = smoothstep(178.0, 140.0, q.y);
    for (int i = 1; i <= 2; i++) {
      vec4 m = rig(q - uSmear * hw * float(i) * 0.5);
      col += m.rgb * (1.0 - a);
      a += m.a * (1.0 - a);
    }
  }

  // impact frame: flat silhouette
  col = mix(col, uSil.rgb * a, uSil.a);

  // afterimages: the other minds in her, a green and a red copy pulled apart
  if (uEcho != vec2(0.0)) {
    float e1 = rigAlpha(q - uEcho) * (1.0 - a);
    col += vec3(0.21, 1.0, 0.48) * e1;
    a += e1;
    float e2 = rigAlpha(q + uEcho) * (1.0 - a);
    col += vec3(1.0, 0.13, 0.32) * e2;
    a += e2;
  }

  // violet misregistration behind the figure
  float rim = rigAlpha(q - uMisreg) * (1.0 - a);
  col += uRim * rim;
  a += rim;

  gl_FragColor = vec4(col, a) * uAlpha;
}`;

const UNIFORMS = [
  'uView', 'uPad', 'uTex', 'uSize', 'uSeed', 'uBoil', 'uHair', 'uHead', 'uMane', 'uArmL', 'uArmR', 'uLongL', 'uLongR',
  'uSit', 'uBend', 'uKickL', 'uKickR',
  'uSmear', 'uEcho', 'uGlitch', 'uGlitchSeed',
  'uSplit', 'uCollapse', 'uDissolve', 'uSparkle', 'uGrade', 'uSil', 'uMisreg', 'uRim', 'uAlpha', 'uPx',
];

const SPRITE = {
  width: 240, height: 420, pad: 56,
  head: { x: 116, y: 132 },
  feet: { x: 128, y: 418 },
  hip: 232, // where she sits
  // the reaching arm, as in the shader; the right arm is it mirrored around x = mirror / 2
  shoulder: { x: 98, y: 168 },
  hand: { x: 24, y: 212 },
  mirror: 234,
  armL(x, y) {
    if (x > 101 || y > 234) return false;
    const top = 159 + (98 - x) * 0.5;
    const bot = x < 50 ? 234 : 178 + (98 - x) * 0.62;
    return y >= top && y <= bot;
  },
};

class SpriteRenderer {
  constructor(canvas, image) {
    this.canvas = canvas;
    this.image = image;
    this.scale = null;
    this.setup();
    // the GPU can be reset (waking from sleep, a driver update): without this she'd stay gone
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    canvas.addEventListener('webglcontextrestored', () => {
      this.setup();
      if (this.scale) this.resize(this.scale);
    });
  }

  // Her shader and picture on the GPU (again, after a reset).
  setup() {
    const gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;

    const prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]]) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    for (const name of UNIFORMS) this.u[name] = gl.getUniformLocation(prog, name);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.uniform1i(this.u.uTex, 0);
    gl.uniform2f(this.u.uSize, SPRITE.width, SPRITE.height);
    gl.uniform1f(this.u.uPad, SPRITE.pad);
    gl.uniform2f(this.u.uView, SPRITE.width + SPRITE.pad * 2, SPRITE.height + SPRITE.pad * 2);
    gl.clearColor(0, 0, 0, 0);
  }

  // css size of the canvas for a given sprite scale
  static cssSize(scale) {
    return {
      width: Math.round((SPRITE.width + SPRITE.pad * 2) * scale),
      height: Math.round((SPRITE.height + SPRITE.pad * 2) * scale),
    };
  }

  resize(scale) {
    this.scale = scale;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = SpriteRenderer.cssSize(scale);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl.uniform1f(this.u.uPx, 1 / (scale * dpr));
  }

  draw(s) {
    const { gl, u } = this;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(u.uSeed, s.seed);
    gl.uniform1f(u.uBoil, s.boil);
    gl.uniform1f(u.uHair, s.hair);
    gl.uniform1f(u.uHead, s.head);
    gl.uniform1f(u.uMane, s.mane);
    gl.uniform1f(u.uArmL, s.armL);
    gl.uniform1f(u.uArmR, s.armR);
    gl.uniform1f(u.uLongL, s.longL);
    gl.uniform1f(u.uLongR, s.longR);
    gl.uniform1f(u.uSit, s.sit);
    gl.uniform1f(u.uBend, s.bend);
    gl.uniform1f(u.uKickL, s.kickL);
    gl.uniform1f(u.uKickR, s.kickR);
    gl.uniform2f(u.uSmear, s.smear[0], s.smear[1]);
    gl.uniform2f(u.uEcho, s.echo[0], s.echo[1]);
    gl.uniform1f(u.uGlitch, s.glitch);
    gl.uniform1f(u.uGlitchSeed, s.glitchSeed);
    gl.uniform1f(u.uSplit, s.split);
    gl.uniform1f(u.uCollapse, s.collapse);
    gl.uniform1f(u.uDissolve, s.dissolve);
    gl.uniform1f(u.uSparkle, s.sparkle);
    gl.uniform1f(u.uGrade, s.grade);
    gl.uniform4f(u.uSil, s.sil[0], s.sil[1], s.sil[2], s.silAmount);
    gl.uniform2f(u.uMisreg, s.misreg[0], s.misreg[1]);
    gl.uniform3f(u.uRim, 0.48, 0.24, 1.0);
    gl.uniform1f(u.uAlpha, s.alpha);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
// Pose-to-pose acting, timed the way cel animation is: an act is an exposure sheet,
// a list of drawings, each held for a number of frames. Nothing is tweened. A move is
// a couple of key drawings, an anticipation the other way, sometimes a smear frame, and holds.
//
// Pose fields (anything left out falls back to the stance underneath):
//   head    head tilt, radians, sprite space       mane   mane flare, + bristles, - settles
//   hair    mane sway, px                          tilt   whole-body lean, degrees, screen
//   bob     vertical offset, px, - is up           sx/sy  squash & stretch (sx < 0 mirrors her)
//   arms    both arms, radians, + raises them      armL / armR   one arm each
//   reach   in directional acts: the arm on the side the act aims at (x the act's reach,
//           a number or a function for a moving target)
//   long    that same arm drawn longer than it is, 1 = as drawn (longL / longR for one arm)
//   smear   [x, y] trail of head multiples, px     echo   [x, y] green/red afterimages, px
//   kickL / kickR   lower legs swinging outward, radians (when sitting)
//   bend    bent at the hips, radians: the legs swing toward the left of the cut-out (lying back)
//
// A key can carry a cue as third item: capri.js fires effects and sounds when it's reached.
// Directional acts are drawn leaning to screen-right; played with dir -1 they're mirrored.

const SHEET_FPS = 12;

const rep = (n, keys) => Array.from({ length: n }, () => keys).flat();

const NEUTRAL = {
  head: 0, mane: 0, hair: 0, tilt: 0, bob: 0, sx: 1, sy: 1, armL: 0, armR: 0, longL: 1, longR: 1,
  smear: [0, 0], echo: [0, 0], kickL: 0, kickR: 0, bend: 0,
};

const ACTS = {
  // ---- stances (looping) ----

  // floating: four drawings; the arms lag behind the body (down when she rises, up when she sinks)
  stand: {
    loop: true,
    keys: [
      [6, { bob: 0, hair: -2.5, arms: 0.04 }],
      [4, { bob: -2, hair: 0, arms: 0 }],
      [6, { bob: -4, hair: 2.5, arms: -0.05 }],
      [4, { bob: -2, hair: 0, arms: 0 }],
    ],
  },

  // perched on a window, hands down on the ledge, legs kicking one after the other
  sit: {
    loop: true,
    keys: [
      [5, { kickL: 0.24, kickR: -0.03, hair: -1.5, arms: -0.42 }],
      [2, { kickL: 0.08, kickR: 0.08, arms: -0.42 }],
      [5, { kickL: -0.03, kickR: 0.24, hair: 1.5, arms: -0.42 }],
      [2, { kickL: 0.08, kickR: 0.08, arms: -0.42 }],
      [5, { kickL: 0.24, kickR: -0.03, hair: -1.5, arms: -0.42 }],
      [2, { kickL: 0.08, kickR: 0.08, arms: -0.42 }],
      [5, { kickL: -0.03, kickR: 0.24, hair: 1.5, arms: -0.42 }],
      [10, { kickL: 0.04, kickR: 0.04, head: 0.08, arms: -0.4 }], // a pause, head cocked
    ],
  },

  // lying back on her ledge (capri.js turns her): propped up on her side, bent at the hips so her
  // legs lie along it, head up, arms tucked in against her (drawn to nothing). Barely moving: her
  // mane rising and settling as she breathes, her head lolling a little, her top leg drawn up
  // now and then and let down again.
  lounge: {
    loop: true,
    keys: [
      [20, { bend: 0.52, head: -0.9, mane: -0.02, armL: -0.88, longL: 0.01, armR: 0, longR: 0.01, kickL: 0.25, hair: -1 }],
      [20, { bend: 0.52, head: -0.92, mane: 0.04, armL: -0.88, longL: 0.01, armR: 0, longR: 0.01, kickL: 0.25, hair: 1 }],
      [14, { bend: 0.52, head: -0.8, mane: -0.02, armL: -0.88, longL: 0.01, armR: 0, longR: 0.01, kickL: 0.25, hair: -1 }],
      [20, { bend: 0.52, head: -0.84, mane: 0.04, armL: -0.88, longL: 0.01, armR: 0, longR: 0.01, kickL: 0.25, hair: 1 }],
      [3, { bend: 0.52, head: -0.88, mane: 0.02, armL: -0.88, longL: 0.01, armR: 0, longR: 0.01, kickL: 0.36 }],
      [12, { bend: 0.52, head: -0.9, mane: 0.03, armL: -0.88, longL: 0.01, armR: 0, longR: 0.01, kickL: 0.46 }],
      [3, { bend: 0.52, head: -0.9, mane: 0, armL: -0.88, longL: 0.01, armR: 0, longR: 0.01, kickL: 0.33 }],
      [20, { bend: 0.52, head: -0.92, mane: -0.02, armL: -0.88, longL: 0.01, armR: 0, longR: 0.01, kickL: 0.25, hair: -1 }],
    ],
  },

  // leaning in from the edge of the screen, toward the middle
  peek: {
    loop: true,
    directional: true,
    keys: [
      [18, { tilt: 7, head: 0.14, reach: 0.1 }],
      [1, { tilt: 7, head: 0.2, smear: [-6, 0], reach: 0.16 }],
      [14, { tilt: 7.5, head: 0.24, mane: 0.08, reach: 0.18 }],
      [1, { tilt: 6, head: 0.14, reach: 0.12 }],
      [12, { tilt: 6.5, head: 0.12, bob: -2, reach: 0.1 }],
    ],
  },

  // asleep: arms hanging, head dropped; every so often it falls a bit further and she jolts awake
  sleep: {
    loop: true,
    keys: [
      [18, { head: 0.1, mane: -0.12, bob: 2, arms: -0.3 }],
      [1, { head: 0.16, mane: -0.13, bob: 4, arms: -0.34 }],
      [10, { head: 0.21, mane: -0.15, bob: 5, arms: -0.36 }],
      [1, { head: 0.06, mane: -0.08, bob: 0, smear: [0, 8], arms: -0.18 }], // jolt
      [4, { head: 0.08, mane: -0.1, bob: 1, arms: -0.26 }],
    ],
  },

  // ---- one-shot acts ----

  // little nods while the words come out, two drawings on threes
  talk: { priority: 0, keys: rep(2, [[3, { head: 0.04, mane: 0.08 }], [3, { head: 0, mane: 0.03 }]]) },

  // the cocked head: anticipation the other way, a smear, then a long hold
  curious: {
    priority: 1,
    directional: true,
    keys: [
      [1, { head: -0.05, mane: 0.04 }],
      [1, { head: 0.12, mane: 0.15, tilt: 1, smear: [-12, 4] }],
      [10, { head: 0.19, mane: 0.14, tilt: 2 }],
      [6, { head: 0.16, mane: 0.1, tilt: 1.6 }],
      [1, { head: 0.07, tilt: 0.6 }],
    ],
  },

  // head snapping from one side to the other, held each time
  look: {
    priority: 1,
    keys: [
      [1, { head: 0.08, smear: [-8, 0] }],
      [8, { head: 0.16 }],
      [1, { head: 0 }],
      [1, { head: -0.08, smear: [8, 0] }],
      [8, { head: -0.16 }],
      [1, { head: -0.05 }],
      [3, { head: 0 }],
    ],
  },

  // The satellite, the quiet way: a glint, a beat, she notices and snaps to it, her specks
  // catch its light, she reaches for it (slow-in: the drawings bunch up as the hand gets there)
  // and holds. It twinkles back. Her hand drops with a sigh.
  gaze: {
    priority: 1,
    directional: true,
    keys: [
      [3, {}, 'glint'],
      [1, { head: -0.05, bob: 1 }],
      [1, { head: 0.14, mane: 0.12, smear: [-8, 6] }, 'notice'],
      [6, { head: 0.2, mane: 0.1, hair: 0, bob: 0 }],
      [6, { head: 0.23, mane: 0.14, hair: 0, bob: 0 }, 'starlight'],
      [3, { head: 0.23, mane: 0.15, hair: 0, bob: 0, reach: 0.25, long: 1.1 }],
      [3, { head: 0.24, mane: 0.16, hair: 0, bob: 0, reach: 0.55, long: 1.2 }],
      [2, { head: 0.24, mane: 0.16, hair: 0, bob: -1, reach: 0.8, long: 1.3 }],
      [2, { head: 0.25, mane: 0.17, hair: 0, bob: -2, reach: 0.93, long: 1.35 }],
      [14, { head: 0.25, mane: 0.17, hair: 0, bob: -3, reach: 1, long: 1.38 }],
      [1, { head: 0.27, mane: 0.22, hair: 0, bob: -4, reach: 1.02, long: 1.42 }, 'glimmer'],
      [8, { head: 0.25, mane: 0.18, hair: 0, bob: -3, reach: 1, long: 1.38 }],
      [2, { head: 0.14, mane: 0.1, bob: -2, reach: 0.45, long: 1.15 }],
      [2, { head: 0.08, mane: 0.04, bob: -1, reach: 0.12, long: 1.03 }],
      [8, { head: 0.06, mane: -0.04, reach: -0.06 }], // a sigh
      [1, {}],
    ],
  },

  // The satellite, the whole way, after the season's ending: "could we make it up there?"
  // I.   Hush. The glint; her float stops dead and the white specks of her mane lift off,
  //      hanging over her like a sky of her own, linked up like a constellation.
  // II.  She snaps to it and reaches; her stars line up into a road from her fingers to it.
  // III. Anticipation: she sinks and coils, the mane bristles, sparks crawl out of her hand,
  //      cut-in on her eyes.
  // IV.  The red light goes up the road, she's lifted with it, it hits the satellite.
  // V.   It snaps and falls apart. Silence. Then the satellite twinkles back, twice.
  //      Her stars come home and her hand drops.
  uplink: {
    priority: 1,
    directional: true,
    keys: [
      [2, { hair: 0, bob: -2 }, 'glint'],
      [3, { hair: 0, bob: -2 }, 'stars'],
      [3, { hair: 0, bob: -2, mane: 0.05 }],
      [4, { hair: 0, bob: -2, mane: 0.1, head: 0.03 }],
      [1, { hair: 0, bob: -1, head: -0.06 }],
      [1, { hair: 0, bob: -2, head: 0.16, mane: 0.16, smear: [-8, 6] }, 'notice'],
      [5, { hair: 0, bob: -2, head: 0.22, mane: 0.14 }],
      [3, { hair: 0, bob: -2, head: 0.23, mane: 0.15, reach: 0.3, long: 1.15 }],
      [3, { hair: 0, bob: -2, head: 0.24, mane: 0.16, reach: 0.6, long: 1.3 }, 'align'],
      [2, { hair: 0, bob: -3, head: 0.25, mane: 0.17, reach: 0.85, long: 1.42 }],
      [2, { hair: 0, bob: -4, head: 0.25, mane: 0.18, reach: 0.96, long: 1.5 }],
      [9, { hair: 0, bob: -5, head: 0.25, mane: 0.18, reach: 1, long: 1.52 }],
      // the arm pulls back a little as she coils, then shoots out
      [1, { hair: 0, bob: 1, head: 0.24, mane: 0.26, reach: 0.98, long: 1.45, sy: 0.95, sx: 1.03 }, 'charge'],
      [2, { hair: 0, bob: 3, head: 0.23, mane: 0.32, reach: 0.98, long: 1.42, sy: 0.93, sx: 1.04 }],
      [2, { hair: 0, bob: 4, head: 0.23, mane: 0.38, reach: 0.99, long: 1.4, sy: 0.92, sx: 1.05 }],
      [2, { hair: 0, bob: 5, head: 0.22, mane: 0.44, reach: 1, long: 1.4, sy: 0.91, sx: 1.06, echo: [2, 0] }],
      [1, { hair: 0, bob: -10, head: 0.3, mane: 0.7, reach: 1.05, long: 1.78, sy: 1.14, sx: 0.9, echo: [10, -4], smear: [0, 14] }, 'surge'],
      [1, { hair: 0, bob: -16, head: 0.31, mane: 0.86, reach: 1.06, long: 1.7, sy: 1.06, sx: 0.96, echo: [16, -6] }],
      [2, { hair: 0, bob: -19, head: 0.3, mane: 0.8, reach: 1.06, long: 1.66, echo: [9, -3] }],
      [2, { hair: 0, bob: -19, head: 0.28, mane: 0.74, reach: 1.06, long: 1.62, echo: [4, -1] }],
      [5, { hair: 0, bob: -18, head: 0.28, mane: 0.62, reach: 1.05, long: 1.6 }],
      [1, { hair: 0, bob: -15, head: 0.27, mane: 0.5, reach: 1.03, long: 1.55, smear: [0, -8] }, 'break'],
      [7, { hair: 0, bob: -13, head: 0.26, mane: 0.36, reach: 1.02, long: 1.52 }],
      [1, { hair: 0, bob: -13, head: 0.29, mane: 0.4, reach: 1.03, long: 1.54 }, 'twinkle'],
      [4, { hair: 0, bob: -12, head: 0.28, mane: 0.32, reach: 1.02, long: 1.52 }],
      [1, { hair: 0, bob: -12, head: 0.29, mane: 0.34, reach: 1.02, long: 1.53 }, 'glimmer'],
      [7, { hair: 0, bob: -11, head: 0.27, mane: 0.28, reach: 1, long: 1.5 }],
      [2, { bob: -7, head: 0.2, mane: 0.2, reach: 0.7, long: 1.3 }, 'home'],
      [2, { bob: -4, head: 0.14, mane: 0.12, reach: 0.4, long: 1.12 }],
      [2, { bob: -1, head: 0.08, mane: 0.04, reach: 0.12, long: 1.03 }],
      [10, { bob: 1, head: 0.06, mane: -0.06, reach: -0.06 }], // a sigh
      [1, {}],
    ],
  },

  // Job done. Wind-up with the mane pulled in, a stretched smear frame, then the key pose:
  // arms flung up, mane exploding, held while the lines hit. She laughs, head shaking every
  // other drawing, then drops back down with a squash and a small overshoot. She only talks
  // (the "done" panel) once she's coming down, so nothing covers the key pose.
  victory: {
    priority: 4, // nothing cuts this one off
    fps: 24,
    directional: true,
    keys: [
      [3, { sy: 0.9, sx: 1.05, bob: 6, arms: -0.3, mane: -0.15 }],
      [3, { sy: 0.82, sx: 1.1, bob: 10, arms: -0.5, mane: -0.3, head: -0.04 }, 'gather'],
      [1, { sy: 1.24, sx: 0.85, bob: -16, arms: 0.55, mane: 0.45, smear: [0, 22], echo: [12, 0] }, 'launch'],
      [2, { sy: 1.1, sx: 0.94, bob: -30, arms: 1.45, mane: 0.85, echo: [20, -4] }, 'peak'],
      [10, { bob: -36, arms: 1.32, mane: 0.78, head: 0.05 }],
      [2, { bob: -34, arms: 1.18, mane: 0.7, head: -0.08 }, 'laugh'],
      [2, { bob: -38, arms: 1.36, mane: 0.8, head: 0.08 }],
      ...rep(4, [[2, { bob: -34, arms: 1.18, mane: 0.7, head: -0.08 }], [2, { bob: -38, arms: 1.36, mane: 0.8, head: 0.08 }]]),
      [2, { bob: -24, arms: 0.7, mane: 0.45, sy: 1.04 }, 'speak'],
      [2, { bob: -8, arms: 0.15, mane: 0.2, sy: 1.06, sx: 0.96, smear: [0, -12] }],
      [2, { bob: 3, arms: -0.15, mane: -0.06, sy: 0.88, sx: 1.08 }],
      [3, { bob: 1, arms: 0.05, sy: 0.97, sx: 1.02 }],
      [2, { arms: 0 }],
    ],
  },

  // The menace: arm pulled in, then jabbed at your pointer with a jolt of red lightning,
  // held while she grins, and dropped.
  zap: {
    priority: 2,
    fps: 24,
    directional: true,
    keys: [
      [3, { reach: 0.2, long: 0.9, head: -0.06, mane: 0.1, bob: 1 }],
      [1, { reach: 1, long: 1.6, head: 0.12, mane: 0.32, smear: [-10, 0], echo: [6, 0] }, 'zap'],
      [6, { reach: 1, long: 1.52, head: 0.14, mane: 0.26 }],
      [4, { reach: 0.96, long: 1.42, head: 0.18, mane: 0.2 }, 'grin'],
      [10, { reach: 0.9, long: 1.36, head: 0.2, mane: 0.16 }],
      [3, { reach: 0.5, long: 1.15, head: 0.14, mane: 0.08 }],
      [3, { reach: 0.15, head: 0.06 }],
      [1, {}],
    ],
  },

  // Showing you something, the way she'd do it in the show. Her head snaps to it, she coils
  // up leaning away with the arm cocked back behind her, then strikes: one stretched drawing
  // where her construct arm shoots out to more than twice its length, red lightning off the
  // fingertip and the reticle slamming onto it ('lock'). The arm recoils, overshoots, settles.
  point: {
    priority: 2,
    fps: 24,
    directional: true,
    keys: [
      [2, { head: 0.16, mane: 0.15, tilt: 1, smear: [-10, 2] }, 'spot'],
      [3, { head: 0.2, mane: 0.12, tilt: 1.5 }],
      [3, { reach: -0.45, long: 0.8, head: 0.12, tilt: -5, sy: 0.9, sx: 1.06, bob: 5, mane: -0.2 }],
      [2, { reach: -0.55, long: 0.75, head: 0.1, tilt: -6, sy: 0.86, sx: 1.08, bob: 7, mane: -0.28 }, 'coil'],
      [1, { reach: 0.9, long: 2.3, head: 0.24, tilt: 8, sx: 0.94, sy: 1.1, mane: 0.6, smear: [-18, 0], echo: [14, 0] }, 'lock'],
      [1, { reach: 1.08, long: 2, head: 0.22, tilt: 7, mane: 0.55, echo: [8, 0] }],
      [2, { reach: 1.02, long: 1.42, head: 0.19, tilt: 4, mane: 0.4 }],
      [2, { reach: 0.98, long: 1.58, head: 0.18, tilt: 3, mane: 0.3 }],
      [2, { reach: 1, long: 1.5, head: 0.17, tilt: 3, mane: 0.22 }],
    ],
  },

  // ...and held while she explains, leaning in: a jab at it now and then (two taps, like on a
  // screen), and a glance back at you before her eyes go back to it. A stance: it lasts until
  // the guide moves on.
  pointing: {
    loop: true,
    directional: true,
    keys: [
      [12, { reach: 1, long: 1.5, head: 0.17, mane: 0.16, tilt: 3 }],
      [1, { reach: 1.05, long: 1.8, head: 0.2, mane: 0.24, tilt: 4 }, 'tap'],
      [2, { reach: 1, long: 1.52, head: 0.18, mane: 0.18, tilt: 3 }],
      [1, { reach: 1.05, long: 1.8, head: 0.2, mane: 0.24, tilt: 4 }, 'tap'],
      [10, { reach: 1, long: 1.5, head: 0.17, mane: 0.16, tilt: 3, bob: -2 }],
      [1, { reach: 1, long: 1.5, head: 0.02, mane: 0.12, tilt: 2, smear: [10, 0] }],
      [8, { reach: 1, long: 1.5, head: -0.1, mane: 0.1, tilt: 2 }],
      [1, { reach: 1, long: 1.5, head: 0.12, mane: 0.16, tilt: 3, smear: [-10, 0] }],
      [8, { reach: 1, long: 1.5, head: 0.17, mane: 0.16, tilt: 3, bob: -1 }],
    ],
  },

  // Done showing: the line reels back into her finger and the arm is snapped back in.
  unpoint: {
    priority: 2,
    fps: 24,
    directional: true,
    keys: [
      [1, { reach: 0.6, long: 0.9, head: 0.08, tilt: -2, smear: [12, 0], mane: 0.1 }],
      [2, { reach: 0.1, long: 0.85, head: 0.04, tilt: -1 }],
      [2, { reach: -0.06, long: 1, tilt: 0 }],
      [1, {}],
    ],
  },

  // Folding herself away into her biochip: a little cock of the head at you, then the mane
  // and the arms pulled in tight, crouching small.
  fold: {
    priority: 3,
    fps: 24,
    keys: [
      [4, { head: 0.12, mane: 0.12 }],
      [2, { head: 0.06, mane: -0.18, arms: -0.5, sy: 0.93, sx: 1.04 }],
      [3, { mane: -0.36, arms: -0.72, sy: 0.84, sx: 1.08, bob: 4 }],
    ],
  },

  // Before she dives into the window she sits on: head cocked at it, the legs swing up, she
  // coils with the mane pulled in and the arms tucked, then stretches down into it.
  dive: {
    priority: 3,
    keys: [
      [1, { head: -0.05 }],
      [5, { head: 0.18, mane: 0.1, kickL: 0.1, kickR: 0.1 }],
      [2, { head: 0.22, mane: -0.15, sy: 0.9, sx: 1.06, kickL: 0.34, kickR: 0.34, arms: -0.6 }],
      [1, { head: 0.1, mane: -0.28, sy: 1.16, sx: 0.88, smear: [0, -14], arms: -0.7 }],
    ],
  },

  // The other minds in her: her green and red copies pull away from her, hang there
  // flickering, and snap back in.
  split: {
    priority: 3,
    fps: 24,
    keys: [
      [2, { echo: [3, 0], mane: 0.1 }],
      [2, { echo: [10, -2], mane: 0.18, head: 0.05 }],
      [2, { echo: [22, -4], mane: 0.22, head: -0.06 }, 'minds'],
      [6, { echo: [34, -5], mane: 0.24, head: 0.06, bob: -3 }],
      [2, { echo: [41, -6], mane: 0.26, head: -0.05, bob: -3 }],
      [6, { echo: [36, -5], mane: 0.24, head: 0.07, bob: -3 }],
      [1, { echo: [12, 0], sx: 1.08, sy: 0.94, bob: -1 }, 'snap'],
      [1, { sx: 0.96, sy: 1.04, mane: 0.3 }],
      [3, { mane: 0.1 }],
      [1, {}],
    ],
  },

  // bristling, flickering, arms flared, leaning toward you; she stares with all her eyes
  alarm: {
    priority: 2,
    directional: true,
    keys: [
      [1, { mane: 0.34, head: 0.1, tilt: 3, arms: 0.36 }, 'stare'],
      [1, { mane: 0.12, head: 0.1, tilt: 3, arms: 0.24 }],
      ...rep(14, [[1, { mane: 0.34, head: 0.1, tilt: 3, arms: 0.36 }], [1, { mane: 0.12, head: 0.1, tilt: 3, arms: 0.24 }]]),
    ],
  },

  // knocked back by a failure, arms snapped in
  flinch: {
    priority: 2,
    keys: [
      [2, { head: 0.22, tilt: 4, sx: 0.92, sy: 1.06, mane: -0.12, bob: 5, smear: [-10, 0], arms: -0.32 }],
      [5, { head: 0.18, tilt: 3.4, mane: -0.1, bob: 4, arms: -0.22 }],
      [1, { head: 0.09, tilt: 1.5, bob: 2, arms: -0.08 }],
    ],
  },

  // turnaround: the flat cut-out squashes to a sliver and comes back mirrored
  turn: {
    priority: 3,
    fps: 24,
    flip: true,
    keys: [
      [1, { sx: 0.7, sy: 1.02, echo: [6, 0], arms: -0.1 }],
      [1, { sx: 0.25, sy: 1.04, echo: [10, 0], mane: 0.2, arms: -0.2 }],
      [1, { sx: -0.25, sy: 1.04, echo: [10, 0], mane: 0.2, arms: -0.2 }],
      [1, { sx: -0.7, sy: 1.02, arms: -0.1 }],
      [2, { sx: -1, arms: 0.04 }],
    ],
  },

  // a full spin on ones, arms thrown out, afterimages flying
  spin: {
    priority: 3,
    fps: 24,
    keys: [
      [2, { sy: 0.92, sx: 1.05, bob: 3, arms: -0.2 }], // wind-up
      [1, { sx: 0.7, echo: [8, 0], mane: 0.25, arms: 0.15 }],
      [1, { sx: 0.2, echo: [14, 0], mane: 0.35, bob: -4, arms: 0.28 }],
      [1, { sx: -0.3, echo: [14, 0], mane: 0.35, bob: -6, arms: 0.3 }],
      [1, { sx: -0.75, echo: [10, 0], mane: 0.3, bob: -6, arms: 0.3 }],
      [1, { sx: -1, echo: [6, 0], bob: -6, arms: 0.28 }],
      [1, { sx: -0.75, echo: [10, 0], mane: 0.3, bob: -5, arms: 0.3 }],
      [1, { sx: -0.3, echo: [14, 0], mane: 0.35, bob: -4, arms: 0.3 }],
      [1, { sx: 0.2, echo: [14, 0], mane: 0.35, bob: -2, arms: 0.25 }],
      [1, { sx: 0.7, echo: [8, 0], mane: 0.25, arms: 0.15 }],
      [2, { sx: 1.06, sy: 0.95, mane: 0.15, arms: -0.06 }], // overshoot
      [1, { sx: 1 }],
    ],
  },

  // a hop in place: crouch, stretch, hang at the top with the arms up, squash on landing
  hop: {
    priority: 3,
    fps: 24,
    keys: [
      [3, { sy: 0.86, sx: 1.08, bob: 6, mane: -0.08, arms: -0.3 }],
      [1, { sy: 1.18, sx: 0.9, bob: -10, smear: [0, 16], arms: 0.4 }],
      [2, { sy: 1.08, sx: 0.95, bob: -32, mane: 0.15, arms: 0.55 }],
      [4, { bob: -42, mane: 0.3, arms: 0.6 }],
      [2, { sy: 1.06, bob: -26, mane: 0.2, arms: 0.35 }],
      [1, { sy: 1.12, sx: 0.92, bob: -8, smear: [0, -14], arms: 0.15 }],
      [2, { sy: 0.82, sx: 1.12, bob: 5, mane: -0.1, arms: -0.28 }],
      [2, { sy: 0.94, sx: 1.04, bob: 2, arms: 0.06 }],
      [1, {}],
    ],
  },

  // landing after a fall: the impact pushes the arms down, they bounce back past rest
  land: {
    priority: 3,
    fps: 24,
    keys: [
      [2, { sy: 0.72, sx: 1.22, bob: 6, mane: -0.22, arms: -0.4 }],
      [2, { sy: 0.88, sx: 1.08, bob: 3, mane: -0.1, arms: -0.15 }],
      [2, { sy: 1.05, sx: 0.97, mane: 0.1, arms: 0.1 }],
      [1, {}],
    ],
  },

  // plopping down on a window ledge
  plop: {
    priority: 3,
    fps: 24,
    keys: [
      [2, { sy: 0.85, sx: 1.1, mane: -0.12, kickL: 0.3, kickR: 0.3, arms: -0.55 }],
      [2, { sy: 1.05, sx: 0.97, kickL: 0.12, kickR: 0.12, arms: -0.38 }],
      [1, {}],
    ],
  },

  // a stretch on the ledge: hunched first, then both arms flung up over her head and held there,
  // head back, the mane bristling, legs out; then they drop and she slumps with a sigh
  stretch: {
    priority: 1,
    keys: [
      [3, { arms: -0.55, head: 0.08, mane: -0.1, sy: 0.95, sx: 1.04 }],
      [1, { arms: 1.2, head: -0.04, mane: 0.18, sy: 1.06, sx: 0.96, smear: [0, -10] }],
      [2, { arms: 1.8, head: -0.12, mane: 0.3, sy: 1.08, sx: 0.95, kickL: 0.22, kickR: 0.22 }],
      [12, { arms: 1.92, head: -0.15, mane: 0.36, sy: 1.09, sx: 0.94, kickL: 0.26, kickR: 0.26 }],
      [2, { arms: 1.86, head: -0.13, mane: 0.32, sy: 1.08, sx: 0.95, kickL: 0.2, kickR: 0.2 }],
      [1, { arms: 0.7, mane: 0.1, smear: [0, 8] }],
      [3, { arms: -0.5, head: 0.1, mane: -0.16, sy: 0.95, sx: 1.04 }],
      [4, { arms: -0.42, head: 0.05, mane: -0.08 }],
    ],
  },

  // while falling: stretched, mane blown up, arms flailing every other drawing
  fall: {
    loop: true,
    fps: 24,
    keys: [
      [2, { sy: 1.12, sx: 0.92, mane: 0.36, head: 0.05, smear: [0, -16], armL: 0.8, armR: 0.55 }],
      [2, { sy: 1.1, sx: 0.93, mane: 0.26, head: -0.04, smear: [0, -12], armL: 0.55, armR: 0.82 }],
    ],
  },

  // ---- thrown around (capri.js throwHer) ----

  // picked up: a jolt, arms flung up, the mane bristling, stretched for one drawing
  grabbed: {
    priority: 3,
    fps: 24,
    keys: [
      [1, { sy: 1.1, sx: 0.92, mane: 0.55, armL: 0.95, armR: 0.85, head: -0.06, smear: [0, 10] }],
      [2, { sy: 1.04, sx: 0.97, mane: 0.42, armL: 0.8, armR: 0.72, head: 0.04 }],
      [2, { mane: 0.3, armL: 0.62, armR: 0.5 }],
    ],
  },

  // held up by the pointer: dangling from where you grabbed her (she swings around it, capri.js),
  // legs kicking one after the other, arms up and out
  held: {
    loop: true,
    keys: [
      [3, { armL: 0.62, armR: 0.36, mane: 0.22, head: 0.06, kickL: 0.24, kickR: -0.06, hair: -1.5 }],
      [3, { armL: 0.4, armR: 0.6, mane: 0.17, head: -0.04, kickL: -0.06, kickR: 0.26, hair: 1.5 }],
    ],
  },

  // flying through the air: limbs flailing on ones (her spin, trail and mane come from capri.js)
  tumble: {
    loop: true,
    fps: 24,
    keys: [
      [2, { armL: 1.1, armR: 0.32, mane: 0.5, head: 0.12, kickL: 0.32, kickR: -0.08, sx: 0.95, sy: 1.06 }],
      [2, { armL: 0.38, armR: 1.15, mane: 0.42, head: -0.1, kickL: -0.08, kickR: 0.34, sx: 0.96, sy: 1.05 }],
    ],
  },

  // before she jumps over to another screen: she sinks, leaning toward it, arms pulled back
  crouch: {
    priority: 3,
    fps: 24,
    directional: true,
    keys: [
      [2, { sy: 0.92, sx: 1.04, bob: 3, mane: -0.08, armL: -0.25, armR: -0.25, head: 0.08, tilt: 2 }],
      [3, { sy: 0.82, sx: 1.1, bob: 7, mane: -0.24, armL: -0.5, armR: -0.5, head: 0.15, tilt: 4 }],
      [3, { sy: 0.78, sx: 1.13, bob: 9, mane: -0.3, armL: -0.56, armR: -0.56, head: 0.18, tilt: 5, echo: [2, 0] }],
    ],
  },

  // the jump itself: leading with her reaching arm, the other one back, legs tucked, mane streaming
  leap: {
    loop: true,
    fps: 24,
    directional: true,
    keys: [
      [3, { reach: 0.75, long: 1.25, mane: 0.42, head: 0.14, kickL: 0.36, kickR: 0.3, sy: 1.08, sx: 0.94 }],
      [3, { reach: 0.82, long: 1.3, mane: 0.5, head: 0.16, kickL: 0.3, kickR: 0.38, sy: 1.1, sx: 0.93 }],
    ],
  },

  // knocked down, lying on her side (capri.js turns her): limp, the mane flat, a leg twitching
  ko: {
    loop: true,
    keys: [
      [10, { armL: 0.34, armR: 0.1, mane: -0.18, head: 0.16, kickL: 0.2, kickR: 0.05 }],
      [1, { armL: 0.38, armR: 0.14, mane: -0.14, head: 0.22, kickL: 0.3, kickR: 0.06 }],
      [7, { armL: 0.34, armR: 0.1, mane: -0.18, head: 0.14, kickL: 0.18, kickR: 0.04 }],
    ],
  },

  // back on her feet after a crash: her head shaken hard both ways, then the mane flares the dust off
  shake: {
    priority: 3,
    fps: 24,
    keys: [
      [2, { head: 0.2, mane: 0.3, tilt: 2, smear: [-10, 0] }],
      [2, { head: -0.2, mane: 0.34, tilt: -2, smear: [10, 0] }],
      ...rep(2, [[2, { head: 0.16, mane: 0.3, tilt: 1.5 }], [2, { head: -0.16, mane: 0.32, tilt: -1.5 }]]),
      [1, { head: 0.04, mane: 0.6, sy: 1.05, sx: 0.97 }, 'dust'],
      [3, { head: 0, mane: 0.32 }],
      [4, { mane: 0.12 }],
      [1, {}],
    ],
  },

  // thrown, and down on her feet anyway: a deep crouch, a hand slammed down, a beat, then up
  touchdown: {
    priority: 3,
    fps: 24,
    keys: [
      [2, { sy: 0.62, sx: 1.3, bob: 8, mane: -0.32, armL: -0.95, armR: 0.28, head: 0.12, smear: [0, -12] }],
      [4, { sy: 0.7, sx: 1.22, bob: 7, mane: -0.22, armL: -0.9, armR: 0.22, head: 0.14 }],
      [6, { sy: 0.74, sx: 1.18, bob: 6, mane: -0.16, armL: -0.85, armR: 0.2, head: 0.1 }],
      [1, { sy: 1.12, sx: 0.92, bob: -6, mane: 0.36, armL: 0.2, armR: 0.3, smear: [0, 14] }],
      [2, { sy: 1.03, sx: 0.98, bob: -2, mane: 0.26 }],
      [3, { mane: 0.12 }],
      [1, {}],
    ],
  },

  // ---- your PC (pc.js) ----

  // overheating with your processor: head thrown back, fanning herself with one hand, heat coming
  // off her ('steam'), then a slump
  overheat: {
    priority: 2,
    keys: [
      [2, { head: -0.08, mane: 0.3, armL: -0.3, armR: 1.25, tilt: -1 }, 'steam'],
      [2, { head: -0.1, mane: 0.36, armL: -0.3, armR: 0.82, tilt: -1.5 }],
      ...rep(4, [[2, { head: -0.08, mane: 0.32, armL: -0.3, armR: 1.25, tilt: -1 }, 'steam'], [2, { head: -0.1, mane: 0.38, armL: -0.3, armR: 0.82, tilt: -1.5 }]]),
      [8, { head: 0.08, mane: 0.06, armL: -0.42, armR: -0.4, bob: 3 }],
      [1, {}],
    ],
  },

  // the battery running out: she sags, head down, arms hanging, mane flat
  drained: {
    priority: 2,
    keys: [
      [3, { head: 0.12, mane: -0.12, arms: -0.3, bob: 2 }],
      [14, { head: 0.24, mane: -0.26, arms: -0.55, bob: 6, sy: 0.96, sx: 1.02 }],
      [1, { head: 0.08, mane: -0.1, arms: -0.2, bob: 1, smear: [0, 8] }], // a start
      [10, { head: 0.2, mane: -0.22, arms: -0.5, bob: 5 }],
      [2, { head: 0.1, arms: -0.2 }],
      [1, {}],
    ],
  },

  // ---- jealous (bond.js) ----

  // glaring at you over another AI: she snaps to it, leans in, mane bristling, holds it, and hisses
  glare: {
    priority: 2,
    directional: true,
    keys: [
      [1, { head: 0.1, mane: 0.32, tilt: 2, smear: [-8, 0] }, 'notice'],
      [9, { head: 0.18, mane: 0.36, tilt: 3, armL: -0.22, armR: -0.22 }],
      [1, { head: 0.22, mane: 0.46, tilt: 3.6, armL: -0.3, armR: -0.3, echo: [4, 0] }, 'hiss'],
      [12, { head: 0.19, mane: 0.38, tilt: 3, armL: -0.25, armR: -0.25 }],
      [2, { head: 0.1, mane: 0.2, tilt: 1 }],
      [1, {}],
    ],
  },

  // sulking: head turned away from you, mane down, arms in
  // Petted: she leans her head into your hand, a little squashed with it, her mane bristling and
  // settling on threes, held while the strokes go on
  petted: {
    priority: 1,
    directional: true,
    keys: [
      [2, { head: 0.1, mane: 0.12, tilt: 1, sy: 0.98, sx: 1.01 }],
      [3, { head: 0.22, mane: 0.22, tilt: 2.5, sy: 0.96, sx: 1.03, bob: 2 }],
      [3, { head: 0.24, mane: 0.15, tilt: 3, sy: 0.96, sx: 1.03, bob: 3 }],
      [3, { head: 0.23, mane: 0.24, tilt: 2.6, sy: 0.965, sx: 1.025, bob: 2 }],
      [3, { head: 0.25, mane: 0.15, tilt: 3, sy: 0.96, sx: 1.03, bob: 3 }],
      [3, { head: 0.23, mane: 0.23, tilt: 2.6, sy: 0.965, sx: 1.025, bob: 2 }],
      [3, { head: 0.24, mane: 0.16, tilt: 3, sy: 0.96, sx: 1.03, bob: 3 }],
      [2, { head: 0.12, mane: 0.08, tilt: 1.2 }],
      [1, {}],
    ],
  },

  huff: {
    priority: 2,
    directional: true,
    keys: [
      [1, { head: -0.06, mane: 0.1, smear: [8, 0] }],
      [3, { head: -0.16, mane: -0.08, tilt: -2, armL: -0.28, armR: -0.28 }],
      [16, { head: -0.18, mane: -0.14, tilt: -2.5, armL: -0.32, armR: -0.32, bob: 2 }],
      [2, { head: -0.1, mane: -0.06, tilt: -1 }],
      [1, {}],
    ],
  },
};

class Player {
  constructor(name, { dir = 0, reach = 1, at = performance.now() } = {}) {
    this.name = name;
    this.act = ACTS[name];
    this.dir = dir;
    this.reach = reach;
    this.start = at;
    this.total = this.act.keys.reduce((n, [hold]) => n + hold, 0);
  }

  get priority() {
    return this.act.priority ?? 0;
  }

  // The drawing on screen at `now` ({ pose, index, cue }), or null once a one-shot act is over.
  sample(now) {
    const fps = this.act.fps || SHEET_FPS;
    let f = Math.floor((now - this.start) / (1000 / fps));
    if (f >= this.total) {
      if (!this.act.loop) return null;
      f %= this.total;
    }
    const { keys } = this.act;
    for (let i = 0; i < keys.length; i++) {
      const [hold, pose, cue] = keys[i];
      if (f < hold) return { pose, index: i, cue };
      f -= hold;
    }
    return null;
  }

  // Turn a drawing into plain fields: mirror it toward the act's direction (`facing` maps
  // screen to sprite space) and spell out arms / reach as armL / armR.
  resolve(pose, facing) {
    const out = { ...pose };
    const lean = this.act.directional && this.dir ? this.dir * facing : 0;
    if (lean) {
      if (pose.head !== undefined) out.head = pose.head * lean;
      if (pose.tilt !== undefined) out.tilt = pose.tilt * this.dir;
      if (pose.smear) out.smear = [pose.smear[0] * lean, pose.smear[1]];
      if (pose.echo) out.echo = [pose.echo[0] * lean, pose.echo[1]];
    }
    if (pose.arms !== undefined) {
      out.armL = pose.arms;
      out.armR = pose.arms;
    }
    if (pose.reach !== undefined) {
      // the left arm of the sprite points to sprite-left; reach can follow a moving target
      const scale = typeof this.reach === 'function' ? this.reach() : this.reach;
      out[lean < 0 ? 'armL' : 'armR'] = pose.reach * scale;
    }
    if (pose.long !== undefined) out[lean < 0 ? 'longL' : 'longR'] = pose.long;
    delete out.arms;
    delete out.reach;
    delete out.long;
    return out;
  }
}
