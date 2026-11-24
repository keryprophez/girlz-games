/* @version 2026-11-25 00:20 */
import type { T3 } from './three3d'
import { HOLD, type Hair } from './hair'

/* La tresse du Salon de coiffure (24/11) : trois brins de fils, tressés au doigt.

   Pourquoi un rendu à part : une mèche guide n'a que sept points pour toute
   la queue, une tresse en demande dix fois plus ; et trois brins simulés se
   traverseraient. Ici la PHYSIQUE ne donne que la ligne de la tresse (la
   moyenne des queues, qui pend et se balance comme avant), et la tresse se
   CALCULE autour : chaque brin suit un huit (de droite à gauche en passant
   devant, puis derrière), les trois décalés d'un tiers.

   Un CRAN, c'est un sixième de tour : un brin de côté passe par-dessus celui
   du milieu, une fois à gauche, une fois à droite. La tresse est faite
   jusqu'au `front` ; au-dessous, les trois brins pendent, écartés. Ils y
   gardent la phase du front : quand le front descend d'un cran, celui de côté
   glisse de lui-même devant le milieu — le doigt ne fait que mener ce
   mouvement, et la fin d'un cran EST le début du suivant (rien ne saute).

   `local` (la place d'un brin) est écrite deux fois, ici et dans le shader :
   les deux doivent rester pareilles. */

/** Points le long de la ligne (position, sens, dehors). */
const M = 40
/** Points par fil. */
const S = 88
/** Le nombre de crans d'une tresse entière. */
export const CRANS = 8
/** Où commence la tresse, et la touffe sous l'élastique (rayons de tête). */
const START = 0.3, TUFT = 0.55
/** Tressés, les cheveux raccourcissent. */
const SHORT = 0.76
/** La largeur du huit, sa profondeur, la grosseur d'un brin. */
const WIDE = 0.195, DEEP = 0.11, THICK = 0.163
/** L'écart des mèches qui pendent, et leur relief. */
const SPREAD = 0.36, RELIEF = 0.1
const THIRD = Math.PI * 2 / 3

export interface BraidState {
  /** Les crans faits, et l'avancée de celui qu'on fait (0..1). */
  n: number
  g: number
  /** Les mèches libres écartées (0..1), l'élastique serré (0..1), visible (0..1). */
  spread: number
  tied: number
  show: number
  /** La mèche tenue (−1 : aucune), où la main la tient (de côté, le long), à quel point. */
  held: number
  hx: number
  hs: number
  hw: number
  /** La mèche qui s'éclaire (−1 : aucune), et à quel point. */
  glow: number
  lit: number
  /** Les brins naissent fins, cachés dans la queue (0), puis prennent leur grosseur (1). */
  born: number
}

export interface BraidView {
  mesh: import('three').Mesh
  state: BraidState
  /** Une nouvelle tresse : rien de fait (ou toute faite), mesurée sur les cheveux tels qu'ils pendent. */
  reset(done?: boolean): void
  /** À chaque image, après la physique. */
  update(): void
  /** La mèche à passer pour le prochain cran, et son côté (−1 ou 1). */
  next(): { k: number; side: number }
  /** Le front : jusqu'où c'est tressé. La longueur de la ligne. */
  readonly front: number
  readonly len: number
  /** Un point d'un brin (repère de la tête). */
  point(k: number, s: number): V
  /** Le repère de la ligne en s. */
  frame(s: number): { p: V; t: V; d: V; x: V }
  /** Où un rayon passe près de chaque mèche libre : [distance, s, profondeur]. */
  near(o: V, d: V): [number, number, number][]
  /** Un rayon dans le plan de la tresse : de côté, et le long. */
  touch(o: V, d: V): { x: number; s: number }
  /** Où se pose l'élastique. */
  end(): { p: V; t: V; d: V }
  setColor(hex: string): void
  setLight(x: number, y: number, z: number): void
  dispose(): void
}

type V = [number, number, number]
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: V): V => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l] }
const mix = (a: number, b: number, u: number) => a + (b - a) * u
const step = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
/** Ce qui reste de `a`, perpendiculaire à `t`. */
const flat = (a: V, t: V): V => { const k = dot(a, t); return unit([a[0] - t[0] * k, a[1] - t[1] * k, a[2] - t[2] * k]) }

/** La ligne d'une tresse : lissée, à pas égaux, avec son repère (le sens, et
    le dehors porté le long de la ligne, sans torsion). `out` : décollée du
    dos. `keep` : la part de sa longueur. */
export function braidLine(pts: V[], m: number, out: number, keep = 1) {
  // adoucie (elle sort de la tête, puis retombe : un coude)
  let p = pts
  for (let k = 0; k < 2; k++) p = p.map((q, i) => i === 0 || i === p.length - 1 ? q : [0, 1, 2].map(c => p[i - 1][c] * 0.25 + q[c] * 0.5 + p[i + 1][c] * 0.25) as V)
  const fine: V[] = []
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[Math.max(0, i - 1)], b = p[i], c = p[i + 1], d = p[Math.min(p.length - 1, i + 2)]
    for (let k = 0; k < 8; k++) {
      const f = k / 8, f2 = f * f, f3 = f2 * f
      fine.push([0, 1, 2].map(x => 0.5 * (2 * b[x] + (c[x] - a[x]) * f + (2 * a[x] - 5 * b[x] + 4 * c[x] - d[x]) * f2 + (3 * b[x] - a[x] - 3 * c[x] + d[x]) * f3)) as V)
    }
  }
  fine.push(p[p.length - 1])
  const acc = [0]
  for (let i = 1; i < fine.length; i++) acc.push(acc[i - 1] + Math.hypot(...sub(fine[i], fine[i - 1])))
  const len = acc[acc.length - 1] * keep, pos: V[] = []
  for (let k = 0, j = 1; k < m; k++) {
    const s = len * k / (m - 1)
    while (j < fine.length - 1 && acc[j] < s) j++
    const u = Math.min(1, Math.max(0, (s - acc[j - 1]) / (acc[j] - acc[j - 1] || 1)))
    pos.push([0, 1, 2].map(x => fine[j - 1][x] + (fine[j][x] - fine[j - 1][x]) * u) as V)
  }
  const tan = pos.map((_, k) => unit(sub(pos[Math.min(m - 1, k + 1)], pos[Math.max(0, k - 1)])))
  const dir: V[] = []
  let d: V = flat([0, 1, 0], tan[0])
  for (let k = 0; k < m; k++) { d = flat(d, tan[k]); dir.push(d) }
  for (let k = 0; k < m; k++) { const w = out * Math.min(1, k / (m - 1) * len / 0.5); for (let x = 0; x < 3; x++) pos[k][x] += dir[k][x] * w }
  return { pos, tan, dir, len }
}

/** La phase du brin k au front, après `c` crans (avec leur fraction). */
export const phaseAt = (k: number, c: number) => Math.PI / 3 * (1 + c) + k * THIRD
/** Le brin qui passe devant pendant le cran `n`, et le côté d'où il part. */
export function crossing(n: number) {
  for (let k = 0; k < 3; k++) if (-Math.sin(2 * phaseAt(k, n + 0.5)) > 0.5) return { k, side: Math.sign(Math.sin(phaseAt(k, n))) }
  return { k: 0, side: 1 }
}

/** La place d'un brin autour de la ligne : de côté, et vers dehors. `pas` : la
    longueur d'un cran ; `end` : où finit la tresse ; `len` : la ligne. */
export function local(b: BraidState, k: number, s: number, pas: number, end: number, len: number): [number, number] {
  const front = START + (b.n + b.g) * pas, w = Math.PI / 3 / pas
  // (le dernier cran reste lâche : plus court, le brin tournait plus serré que
  // sa propre épaisseur — un pli net, de profil)
  const soft = pas * mix(1.05, 0.4, b.tied)
  const q = s - (front - soft), run = q < 0 ? s : front - soft * Math.exp(-q / soft)
  const ph = w * (run - START) + Math.PI / 3 + k * THIRD, pf = w * (front - START) + Math.PI / 3 + k * THIRD
  const env = step(0.06, 0.45, s) * (1 - step(end - 0.2, end, s) * b.tied), taper = mix(1, 0.76, Math.min(1, s / end))
  const ax = WIDE * env * taper * Math.sin(ph), az = -DEEP * env * taper * Math.sin(2 * ph)
  // les mèches libres : écartées, d'autant moins qu'il en reste peu
  const wide = SPREAD * b.spread * (1 - b.tied) * step(0.2, 1.3, len - front) + WIDE * 0.75 * (1 - b.tied) * b.spread
  const r = s > front ? (1 - Math.exp(-Math.pow((s - front) / 0.46, 1.5))) * (1 - b.tied) : 0
  const sx = wide * Math.sin(pf) / 0.866, sz = -RELIEF * Math.sin(2 * pf)
  let x = mix(ax, sx, r) + 0.022 * r * Math.sin(s * 4.2 + k * 2.1), z = mix(az, sz, r)
  if (k === b.held && b.hw > 0) {
    const h = step(0, 1, (s - front) / Math.max(0.2, b.hs - front)), over = step(0, 1, (s - b.hs) / Math.max(0.2, len - b.hs))
    x = mix(x, mix(ax, mix(b.hx, sx, over * 0.3), h), b.hw)
    z += 0.16 * h * b.hw
  }
  return [x, z]
}

export function braidView(T: T3, hair: Hair, o: { fibers?: number; width?: number; seed?: number; settle?: (p: V) => V } = {}): BraidView {
  const per = o.fibers ?? 380, N = per * 3
  let seed = (o.seed ?? 5) >>> 0
  const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }

  const data = new Float32Array(M * 3 * 4)
  const tex = new T.DataTexture(data, 3, M, T.RGBAFormat, T.FloatType)
  tex.minFilter = tex.magFilter = T.NearestFilter

  const geo = new T.InstancedBufferGeometry()
  const pos = new Float32Array(S * 2 * 3)
  for (let i = 0; i < S; i++) for (let s = 0; s < 2; s++) pos.set([i / (S - 1), s ? 1 : -1, 0], (i * 2 + s) * 3)
  geo.setAttribute('position', new T.BufferAttribute(pos, 3))
  const idx: number[] = []
  for (let i = 0; i < S - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
  geo.setIndex(idx)
  // brin, angle autour du brin, place du centre (0) à la surface (1), hasard
  const iA = new Float32Array(N * 4)
  for (let k = 0, n = 0; k < 3; k++) for (let c = 0; c < per; c++, n++) {
    // (répartis à pas égaux, un peu tremblés : aucun trou)
    const loose = rnd() < 0.03 ? 1 + rnd() * 0.1 : 0.82 + 0.18 * Math.sqrt(rnd())
    iA.set([k, (c + rnd() * 0.9) / per * Math.PI * 2, loose, rnd()], n * 4)
  }
  geo.setAttribute('iA', new T.InstancedBufferAttribute(iA, 4))
  geo.instanceCount = N

  const uniforms = {
    line: { value: tex }, len: { value: 1 }, end: { value: 1 }, pas: { value: 0.2 },
    front: { value: START }, spread: { value: 0 }, tied: { value: 0 }, show: { value: 0 },
    // la mèche tenue : laquelle, de côté, le long, à quel point
    hold: { value: new T.Vector4(-1, 0, 0, 0) },
    glow: { value: -1 }, lit: { value: 0 }, born: { value: 1 }, time: { value: 0 },
    width: { value: o.width ?? 0.03 },
    base: { value: new T.Color('#6B4A2B') }, shine: { value: 0.12 },
    light: { value: new T.Vector3(-0.4, 0.8, -0.45).normalize() }
  }
  const f = (x: number) => x.toFixed(4)
  const mat = new T.ShaderMaterial({
    uniforms,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.ZeroFactor, blendSrcAlpha: T.ZeroFactor, blendDstAlpha: T.OneFactor,
    alphaToCoverage: true,
    side: T.DoubleSide,
    vertexShader: /* glsl */`
      precision highp sampler2D;
      uniform sampler2D line; uniform float len, end, pas, front, spread, tied, width, glow, lit, born; uniform vec4 hold;
      attribute vec4 iA;
      varying vec3 vT; varying vec3 vN; varying vec3 vPos; varying float vSide; varying float vRnd; varying float vAo; varying float vTip; varying float vGlow;
      vec3 at(float u, int c) {
        float i = clamp(u, 0.0, 1.0) * ${M - 1}.0, f = fract(i);
        int a = int(i), b = min(a + 1, ${M - 1});
        return mix(texelFetch(line, ivec2(c, a), 0).xyz, texelFetch(line, ivec2(c, b), 0).xyz, f);
      }
      // la place d'un brin (la même chose que local() en TypeScript) ; y : libre (0..1)
      vec3 place(float k, float s) {
        float w = ${f(Math.PI / 3)} / pas, soft = pas * mix(1.05, 0.4, tied), q = s - (front - soft);
        float run = q < 0.0 ? s : front - soft * exp(-q / soft);
        float ph = w * (run - ${f(START)}) + ${f(Math.PI / 3)} + k * ${f(THIRD)}, pf = w * (front - ${f(START)}) + ${f(Math.PI / 3)} + k * ${f(THIRD)};
        float env = smoothstep(0.06, 0.45, s) * (1.0 - smoothstep(end - 0.2, end, s) * tied), taper = mix(1.0, 0.76, min(1.0, s / end));
        float ax = ${f(WIDE)} * env * taper * sin(ph), az = -${f(DEEP)} * env * taper * sin(2.0 * ph);
        float wide = ${f(SPREAD)} * spread * (1.0 - tied) * smoothstep(0.2, 1.3, len - front) + ${f(WIDE * 0.75)} * (1.0 - tied) * spread;
        float r = s > front ? (1.0 - exp(-pow((s - front) / 0.46, 1.5))) * (1.0 - tied) : 0.0;
        float sx = wide * sin(pf) / 0.866, sz = -${f(RELIEF)} * sin(2.0 * pf);
        float x = mix(ax, sx, r) + 0.022 * r * sin(s * 4.2 + k * 2.1), z = mix(az, sz, r);
        if (abs(k - hold.x) < 0.5 && hold.w > 0.0) {
          float h = smoothstep(0.0, 1.0, (s - front) / max(0.2, hold.z - front)), over = smoothstep(0.0, 1.0, (s - hold.z) / max(0.2, len - hold.z));
          x = mix(x, mix(ax, mix(hold.y, sx, over * 0.3), h), hold.w);
          z += 0.16 * h * hold.w;
        }
        return vec3(x, r, z);
      }
      void main() {
        // (les points de tous les fils sont alignés : décalés, les rubans se
        // passaient dessus-dessous, en pointillés)
        float s = position.x * len;
        if (abs(iA.x - hold.x) < 0.5 && hold.w > 0.0) {
          float a0 = hold.z - front, pulled = (sqrt(a0 * a0 + hold.y * hold.y) - a0) * hold.w * 0.8;
          s = min(s, front) + max(0.0, s - front) * (1.0 - pulled / max(0.3, len - front));
        }
        float u = s / len;
        vec3 c = at(u, 0), T = normalize(at(u, 1)), D = normalize(at(u, 2)), X = cross(T, D);
        vec3 l = place(iA.x, s), l2 = place(iA.x, s + 0.025);
        float x = l.x, r = l.y, z = l.z;
        float env = smoothstep(0.06, 0.45, s) * (1.0 - smoothstep(end - 0.2, end, s) * tied);
        float taper = mix(1.0, 0.76, min(1.0, s / end));
        vec3 Tb = normalize(T + (X * (l2.x - l.x) + D * (l2.z - l.z)) / 0.025);
        vec3 N1 = normalize(D - Tb * dot(D, Tb)), N2 = cross(Tb, N1);
        // le brin : un ovale ; serré à l'élastique, un peu plus large quand il pend
        float pinch = exp(-pow((s - end) / 0.085, 2.0)) * tied, after = smoothstep(end, end + 0.28, s) * tied;
        float rad = mix(${f(THICK)} * taper * mix(0.4, 1.0, smoothstep(0.0, 0.42, s)), 0.17, after) * mix(1.0, 0.42, pinch) * mix(0.92, 1.0, smoothstep(-0.07, 0.07, z));
        rad *= mix(1.0, 0.9, r) * mix(0.5, 1.0, born);
        float a = iA.y + s * 0.8;
        vec3 off = (N2 * cos(a) * (1.0 + 0.35 * r) + N1 * sin(a) * mix(0.86, 0.62, r)) * rad * iA.z;
        // les pointes s'affinent ; dans la touffe, les fils remplissent le milieu
        off *= mix(1.0, 0.55, smoothstep(len - 0.6, len, s)) * mix(1.0, mix(0.35, 1.0, fract(iA.w * 13.7)), max(after, smoothstep(len - 0.7, len, s)));
        vec3 core = X * x + D * z;
        vec3 p = c + core + off;
        vec3 Nn = normalize(off + 1e-6);
        // l'ombre des creux : le dedans de la tresse, et les bords de chaque brin
        vec3 outw = normalize(core + off + 1e-6);
        float inside = smoothstep(-0.5, 0.75, dot(Nn, outw)), edge = pow(abs(cos(a)), 4.0);
        vAo = mix(1.0, mix(0.34, 1.0, inside) * (1.0 - 0.4 * edge), env * (1.0 - r)) * mix(1.0, 1.0 - 0.3 * edge, r);
        vec3 Tw = normalize(mat3(modelMatrix) * Tb), Nw = normalize(mat3(modelMatrix) * Nn), Bw = normalize(cross(Tw, Nw));
        vec3 V = normalize(cameraPosition - (modelMatrix * vec4(p, 1.0)).xyz);
        vec3 cam = cross(Tw, V);
        float lc = length(cam);
        cam = lc > 1e-4 ? cam / lc : Bw;
        // (c'est le plat qui se tourne vers la caméra, pas l'inverse : au bord du
        // brin, le ruban se retournait d'un point au suivant, une entaille)
        if (dot(cam, Bw) < 0.0) Bw = -Bw;
        vec3 side = normalize(mix(cam, Bw, smoothstep(0.04, 0.22, abs(dot(Nw, V)))));
        float wd = width * (0.7 + 0.6 * iA.w) * length(modelMatrix[0].xyz) * mix(1.0, 0.4, smoothstep(len - 0.6, len, s));
        vec4 wp = modelMatrix * vec4(p, 1.0);
        wp.xyz += side * position.y * wd * 0.5;
        vT = Tw; vN = Nw; vPos = wp.xyz; vSide = position.y; vRnd = iA.w;
        // (aux pointes, les fils n'ont pas tous la même longueur)
        float tip = len - 0.42 * iA.w * iA.w;
        vTip = smoothstep(tip - 0.16, tip, position.x * len);
        vGlow = abs(iA.x - glow) < 0.5 ? lit * smoothstep(front - 0.25, front + 0.15, s) : 0.0;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 base; uniform vec3 light; uniform float shine, show, time;
      varying vec3 vT; varying vec3 vN; varying vec3 vPos; varying float vSide; varying float vRnd; varying float vAo; varying float vTip; varying float vGlow;
      float strand(vec3 T, vec3 H, float e) { float th = dot(T, H); return pow(max(0.0, sqrt(max(0.0, 1.0 - th * th))), e); }
      void main() {
        vec3 T = normalize(vT), N = normalize(vN);
        vec3 V = normalize(cameraPosition - vPos), L = normalize(light), H = normalize(L + V);
        float vol = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
        vec3 c = base * (0.74 + 0.5 * vRnd) * mix(0.5, 1.0, vol) * vAo;
        float shift = (vRnd - 0.5) * 0.25;
        float s1 = strand(normalize(T + N * (0.12 + shift)), H, 60.0);
        float s2 = strand(normalize(T - N * (0.18 - shift)), H, 16.0);
        c += (vec3(1.0, 0.96, 0.9) * s1 * shine + base * s2 * 0.5) * vol * vAo;
        // la mèche à prendre : une lueur dorée qui respire
        float pulse = 0.5 + 0.5 * sin(time * 4.0);
        c = mix(c, c * 1.75 + base * 0.35 + vec3(0.05, 0.03, 0.004), vGlow * (0.3 + 0.7 * pulse));
        float a = (1.0 - smoothstep(0.45, 1.0, abs(vSide))) * (1.0 - vTip) * show;
        gl_FragColor = vec4(c, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  })
  const mesh = new T.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.visible = false

  const state: BraidState = { n: 0, g: 0, spread: 0, tied: 0, show: 0, held: -1, hx: 0, hs: 0, hw: 0, glow: -1, lit: 0, born: 1 }
  let long: number[] = [], pas = 0.2, end = 1
  let line = { pos: [[0, 0, 0]] as V[], tan: [[0, -1, 0]] as V[], dir: [[0, 0, -1]] as V[], len: 1 }
  /** La ligne : la moyenne des queues les plus longues, de l'attache à la pointe. */
  function measure() {
    const { P } = hair, p = hair.pos, pts: V[] = []
    for (let i = HOLD - 1; i < P; i++) {
      let x = 0, y = 0, z = 0
      for (const g of long) { const k = (g * P + i) * 3; x += p[k]; y += p[k + 1]; z += p[k + 2] }
      const q: V = [x / long.length, y / long.length, z / long.length]
      pts.push(o.settle && i > HOLD ? o.settle(q) : q)
    }
    // (elle naît SOUS le cuir chevelu : aucun bord)
    const a = pts[0]
    pts.unshift([a[0] * 0.8, a[1] * 0.8 + 0.1, a[2] * 0.8])
    line = braidLine(pts, M, 0.12, mix(1, SHORT, (state.n + state.g) / CRANS))
  }
  const front = () => START + (state.n + state.g) * pas
  function frame(s: number) {
    const i = Math.min(M - 1.001, Math.max(0, s / line.len * (M - 1))), a = Math.floor(i), u = i - a
    const l = (q: V[]) => [0, 1, 2].map(x => mix(q[a][x], q[a + 1][x], u)) as V
    const t = unit(l(line.tan)), d = flat(l(line.dir), t)
    return { p: l(line.pos), t, d, x: cross(t, d) }
  }
  function point(k: number, s: number): V {
    const e = frame(s), [x, z] = local(state, k, s, pas, end, line.len)
    return [0, 1, 2].map(c => e.p[c] + e.x[c] * x + e.d[c] * z) as V
  }
  function update() {
    if (!long.length) return
    measure()
    for (let k = 0; k < M; k++) { data.set(line.pos[k], k * 12); data.set(line.tan[k], k * 12 + 4); data.set(line.dir[k], k * 12 + 8) }
    tex.needsUpdate = true
    uniforms.len.value = line.len
    uniforms.end.value = end; uniforms.pas.value = pas
    uniforms.front.value = front(); uniforms.spread.value = state.spread; uniforms.tied.value = state.tied; uniforms.show.value = state.show
    uniforms.hold.value.set(state.held, state.hx, state.hs, state.hw)
    uniforms.glow.value = state.glow; uniforms.lit.value = state.lit; uniforms.born.value = state.born
    uniforms.time.value = performance.now() / 1000
  }
  return {
    mesh, state, update, point, frame,
    reset: done => {
      // (les plus longues : celles du front, courtes, la raccourcissaient)
      long = Array.from({ length: hair.G }, (_, g) => g).sort((a, b) => hair.segB[b] - hair.segB[a]).slice(0, Math.ceil(hair.G * 0.25))
      state.n = CRANS; state.g = 0
      measure()
      end = line.len - TUFT
      pas = (end - START) / CRANS
      Object.assign(state, { n: done ? CRANS : 0, g: 0, spread: done ? 1 : 0, tied: done ? 1 : 0, show: done ? 1 : 0, held: -1, hx: 0, hs: 0, hw: 0, glow: -1, lit: 0, born: done ? 1 : 0 })
      measure()
      update()
    },
    next: () => crossing(state.n),
    get front() { return front() },
    get len() { return line.len },
    near: (ro, rd) => [0, 1, 2].map(k => {
      let best: [number, number, number] = [1e9, 0, 0]
      for (let s = front() + 0.05; s < line.len; s += 0.06) {
        const v = sub(point(k, s), ro), t = dot(v, rd), q = Math.sqrt(Math.max(0, dot(v, v) - t * t))
        if (q < best[0]) best = [q, s, t]
      }
      return best
    }),
    touch: (ro, rd) => {
      let s = front() + 0.4, x = 0
      for (let it = 0; it < 4; it++) {
        const e = frame(s), den = dot(rd, e.d)
        const t = Math.abs(den) > 0.15 ? dot(sub(e.p, ro), e.d) / den : dot(sub(e.p, ro), rd)
        const h: V = [ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t], v = sub(h, e.p)
        x = dot(v, e.x)
        s = Math.min(line.len, Math.max(0, s + dot(v, e.t)))
      }
      return { x, s }
    },
    end: () => { const e = frame(end); return { p: e.p, t: e.t, d: e.d } },
    setColor: hex => { const c = uniforms.base.value.set(hex); uniforms.shine.value = 0.12 + 0.12 * Math.exp(-40 * (0.21 * c.r + 0.72 * c.g + 0.07 * c.b)) },
    setLight: (x, y, z) => { uniforms.light.value.set(x, y, z).normalize() },
    dispose: () => { geo.dispose(); mat.dispose(); tex.dispose() }
  }
}
