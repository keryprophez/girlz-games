/* @version 2026-11-25 00:20 */
import type { T3 } from './three3d'
import type { Hair, SkullMap } from './hair'

/* Le rendu des cheveux du Salon de coiffure (23/11) : des milliers de fils.

   Chaque mèche « guide » de la physique (`hair.ts`) est habillée de
   `CHILD` fils, dessinés d'un seul appel (un maillage instancié) :
   - le processeur lisse chaque guide en `S` points (Catmull-Rom) et les
     envoie dans une petite texture (position, tangente) ; le processeur
     graphique n'a plus que deux lectures par guide et par sommet ;
   - un fil suit un mélange de trois guides voisins (la chevelure reste
     pleine entre les guides), décalé dans le repère de la mèche, et se
     resserre vers la pointe (les fils forment des mèches, pas un rideau) ;
   - chaque fil est un ruban tourné vers la caméra, plus fin à la pointe,
     bords adoucis par l'alpha-to-coverage (aucun tri de transparence) ;
   - la lumière des cheveux (Kajiya-Kay) : le reflet en bande qui court le
     long de la chevelure, un second reflet coloré, le volume (dessus
     éclairé, dessous dans l'ombre), la racine plus sombre.
   Rien n'est une image étirée : net à toutes les tailles. La teinte est
   une couleur (`setColor`). */

/* L'alpha d'un fil ne sert qu'à sa couverture (l'anticrénelage) : écrit dans
   l'image, il la TROUAIT — le fond de la page perçait en pointillés clairs
   tout le long des fils (24/11). */
const opaque = (T: T3) => ({ blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.ZeroFactor, blendSrcAlpha: T.ZeroFactor, blendDstAlpha: T.OneFactor } as const)

/** Le reflet blanc : plus fort sur des cheveux sombres (sans lui, le noir est un aplat). */
const shineOf = (c: { r: number; g: number; b: number }) => 0.12 + 0.12 * Math.exp(-40 * (0.21 * c.r + 0.72 * c.g + 0.07 * c.b))

export const CHILD = 10
/** Points par fil, le long de la mèche. */
export const S = 28

export interface HairView {
  mesh: import('three').Mesh
  /** La lueur de chaque mèche (0..1) : celles à prendre maintenant. */
  glow: Float32Array
  /** À quel point chaque mèche est rendue « tirée » (0..1). Vide : selon
      la physique (`hair.tiedLook`). */
  look: Float32Array | null
  /** La part des fils dessinés (0..1), un peu plus larges quand il y en a moins. */
  setDensity(k: number): void
  /** La queue est dessinée ailleurs (la tresse) : 1, elle disparaît d'ici. */
  setBraid(v: number): void
  /** À appeler à chaque image, après la physique. */
  update(): void
  setColor(hex: string): void
  /** La lumière principale (direction vers la lumière, dans le monde). */
  setLight(x: number, y: number, z: number): void
  dispose(): void
}

export function hairView(T: T3, hair: Hair, o: { width?: number; child?: number; seed?: number; skull?: SkullMap } = {}): HairView {
  const { G, P } = hair
  const child = o.child ?? CHILD
  const N = G * child
  let seed = (o.seed ?? 11) >>> 0
  const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }

  /* ---- La texture des guides : S points lissés par guide, position puis tangente ---- */
  const data = new Float32Array(S * 2 * G * 4)
  const tex = new T.DataTexture(data, S * 2, G, T.RGBAFormat, T.FloatType)
  tex.minFilter = tex.magFilter = T.NearestFilter
  tex.needsUpdate = true

  /* ---- Les voisins de chaque guide ----
     Proches par la racine ET partis du même côté : un fil mélangé entre une
     mèche partie à gauche de la raie et une partie à droite passerait au
     milieu, devant le visage (le père, 23/11 : « des cheveux sur les yeux »). */
  const roots: number[][] = [], dirs: number[][] = []
  for (let g = 0; g < G; g++) { roots.push(Array.from(hair.rootL.slice(g * 3, g * 3 + 3))); dirs.push(Array.from(hair.dirL.slice(g * 3, g * 3 + 3))) }
  const near: [number, number][] = []
  for (let g = 0; g < G; g++) {
    const d = roots.map((r, k) => [k, Math.hypot(r[0] - roots[g][0], r[1] - roots[g][1], r[2] - roots[g][2])] as [number, number])
      .filter(([k]) => k !== g && dirs[k][0] * dirs[g][0] + dirs[k][1] * dirs[g][1] + dirs[k][2] * dirs[g][2] > 0.75)
      .sort((a, b) => a[1] - b[1])
    near.push([d[0]?.[0] ?? g, d[1]?.[0] ?? g])
  }

  /* ---- Le maillage : un ruban de S points, instancié N fois ---- */
  const geo = new T.InstancedBufferGeometry()
  const pos = new Float32Array(S * 2 * 3)
  for (let i = 0; i < S; i++) for (let s = 0; s < 2; s++) pos.set([i / (S - 1), s ? 1 : -1, 0], (i * 2 + s) * 3)
  geo.setAttribute('position', new T.BufferAttribute(pos, 3))
  const idx: number[] = []
  for (let i = 0; i < S - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
  geo.setIndex(idx)
  const iG = new Float32Array(N * 3), iW = new Float32Array(N * 3), iO = new Float32Array(N * 4)
  // (un fil de chaque mèche, puis un autre de chaque… : en dessiner moins les éclaircit partout)
  for (let c = 0, n = 0; c < child; c++) for (let g = 0; g < G; g++, n++) {
    iG.set([g, near[g][0], near[g][1]], n * 3)
    // le poids du guide principal domine ; les voisins remplissent les trous
    let a = 0.5 + rnd() * 0.5, b = rnd() * (1 - a), w = 1 - a - b
    if (c === 0) { a = 1; b = 0; w = 0 }
    iW.set([a, b, w], n * 3)
    // décalage : dans le plan de la mèche (x) et vers l'extérieur (y ≥ 0), une variation de teinte, une épaisseur
    const r = Math.sqrt(rnd()) * 0.075, th = rnd() * Math.PI
    iO.set([Math.cos(th) * r, Math.abs(Math.sin(th)) * r * 0.6, rnd(), 0.7 + rnd() * 0.6], n * 4)
  }
  geo.setAttribute('iG', new T.InstancedBufferAttribute(iG, 3))
  geo.setAttribute('iW', new T.InstancedBufferAttribute(iW, 3))
  geo.setAttribute('iO', new T.InstancedBufferAttribute(iO, 4))
  geo.instanceCount = N

  /* ---- Le crâne, en petite image (longitude × latitude) : sans lui, les fils
     d'une mèche tirée s'étalaient sur un plan, en tuiles — le contour de la
     tête était dentelé (24/11) ---- */
  const SW = 96, SH = 48, sk = new Uint16Array(SW * SH)
  for (let j = 0; j < SH; j++) for (let i = 0; i < SW; i++) {
    const a = ((i + 0.5) / SW - 0.5) * Math.PI * 2, b = (j + 0.5) / SH * Math.PI, r = Math.sin(b)
    sk[j * SW + i] = T.DataUtils.toHalfFloat(o.skull ? o.skull.at(Math.sin(a) * r, Math.cos(b), Math.cos(a) * r) : 0)
  }
  const skTex = new T.DataTexture(sk, SW, SH, T.RedFormat, T.HalfFloatType)
  skTex.minFilter = skTex.magFilter = T.LinearFilter
  skTex.wrapS = T.RepeatWrapping
  skTex.needsUpdate = true

  const uniforms = {
    guides: { value: tex },
    skull: { value: skTex },
    onMap: { value: o.skull ? 1 : 0 },
    braid: { value: 0 },
    width: { value: o.width ?? 0.03 },
    base: { value: new T.Color('#6B4A2B') },
    shine: { value: 0.12 },
    light: { value: new T.Vector3(-0.4, 0.8, -0.45).normalize() },
    center: { value: new T.Vector3() },
    time: { value: 0 }
  }
  const mat = new T.ShaderMaterial({
    uniforms,
    ...opaque(T),
    alphaToCoverage: true,
    side: T.DoubleSide,
    vertexShader: /* glsl */`
      // (three.js compile en GLSL ES 3.00 sous WebGL 2 : texelFetch y est permis)
      precision highp sampler2D;
      uniform sampler2D guides;
      uniform sampler2D skull;
      uniform float onMap;
      uniform float braid;
      uniform float width;
      uniform vec3 center;
      attribute vec3 iG; attribute vec3 iW; attribute vec4 iO;
      varying vec3 vT; varying vec3 vN; varying vec3 vPos; varying float vt; varying float vSide; varying float vRnd; varying float vGlow; varying float vHide; varying float vMat; varying vec2 vRoot;
      const float S = ${S}.0;
      // (les canaux libres des tangentes : 0 la place de l'attache, 1 tirée, 2 tenue à part, 3 la lueur, 4 posée dans l'attache)
      float chan(float g, int c) { return texelFetch(guides, ivec2(int(S) + c, int(g)), 0).w; }
      void at(float g, float i, out vec4 p, out vec3 t) {
        p = texelFetch(guides, ivec2(int(i), int(g)), 0);
        t = texelFetch(guides, ivec2(int(i + S), int(g)), 0).xyz;
      }
      // (tirée et fondue dans la calotte, une mèche ne se voit plus sur le crâne :
      // ses points glissent vers la queue, qui s'arrondit)
      float warp(float x, float lv, float k) { float k0 = mix(k, 0.15, lv); return x < k0 ? x / k0 * k : k + (x - k0) / (1.0 - k0) * (1.0 - k); }
      float skullR(vec3 d) { d = normalize(d); return textureLod(skull, vec2(atan(d.x, d.z) / 6.2831853 + 0.5, acos(clamp(d.y, -1.0, 1.0)) / 3.1415927), 0.0).r; }
      void main() {
        float t = position.x;
        float i = floor(t * (S - 1.0) + 0.5);
        vec4 p0, p1, p2; vec3 t0, t1, t2;
        at(iG.x, i, p0, t0); at(iG.y, i, p1, t1); at(iG.z, i, p2, t2);
        // une mèche tenue ou attachée : ses fils ne suivent qu'elle (ses
        // voisines les couperaient en travers). En fondu : rien ne saute à la prise.
        float tieAt = chan(iG.x, 0), tied = chan(iG.x, 1), solo = chan(iG.x, 2), laid = chan(iG.x, 4), lv = chan(iG.x, 5);
        if (lv > 0.0) t = warp(t, lv, tieAt - 1.2 / ${P - 1}.0);
        float w1 = iW.y * (1.0 - solo) * (1.0 - chan(iG.y, 2)), w2 = iW.z * (1.0 - solo) * (1.0 - chan(iG.z, 2));
        vec3 bw = vec3(1.0 - w1 - w2, w1, w2);
        vec3 p = p0.xyz * bw.x + p1.xyz * bw.y + p2.xyz * bw.z;
        vec3 T = normalize(t0 * bw.x + t1 * bw.y + t2 * bw.z + 1e-6);
        // la vraie place le long de la mèche (une mèche tenue est redécoupée)
        float ta = p0.w;
        // le repère de la mèche : vers l'extérieur de la tête, et de côté
        vec3 N = p - center; N = normalize(N - T * dot(N, T) + 1e-6);
        vec3 B = cross(T, N);
        // les fils se resserrent vers la pointe : des mèches, pas un rideau
        float clump = mix(1.0, 0.4, smoothstep(0.35, 1.0, ta));
        // à la racine, ils s'écartent : ils couvrent sans trou entre les guides
        float spread = mix(2.4, 1.0, smoothstep(0.0, 0.3, ta));
        float seg = 1.0 / ${P - 1}.0;
        // une mèche tirée : sur le crâne, ses fils s'étalent à plat ; dans la queue, ils gardent du volume
        // (tieAt : le bout du faisceau ; le faisceau est le segment d'avant)
        float onSkull = tied * (1.0 - smoothstep(tieAt - 1.3 * seg, tieAt - 0.95 * seg, t));
        float flatS = max(onSkull, solo * (1.0 - smoothstep(tieAt - 2.5 * seg, tieAt - seg, t)));
        // une légère ondulation propre à chaque fil
        float wave = sin(ta * 4.5 + iO.z * 6.28) * 0.006 * smoothstep(0.1, 0.5, ta) * (1.0 - tied);
        spread = mix(spread, min(spread, 1.5), flatS) * mix(1.0, 1.2, onSkull);
        // la queue : les fils se répartissent tout autour (un volume rond, pas un crayon)
        float inTail = laid * smoothstep(tieAt - 0.6 * seg, tieAt + 0.06, t);
        // sous l'élastique, la queue s'ouvre peu à peu (serrée en haut, pleine plus bas)
        float ang = iO.z * 6.2832, rad = length(iO.xy) * 3.4 * mix(0.35, 1.0, smoothstep(tieAt, tieAt + 0.3, t)) * mix(1.0, 0.7, smoothstep(tieAt, 1.0, t));
        vec3 lay = (B * (iO.x * spread + wave) + N * iO.y * smoothstep(0.0, 0.1, ta) * mix(1.0, 0.15, flatS)) * clump;
        // à l'élastique, le faisceau est serré : les fils s'y rejoignent
        float squeeze = 1.0 - 0.85 * laid * exp(-pow((t - tieAt + 0.3 * seg) / (0.9 * seg), 2.0));
        // dans la main aussi
        squeeze *= 1.0 - 0.55 * solo * (1.0 - laid) * exp(-pow((t - tieAt) / (1.4 * seg), 2.0));
        p += mix(lay, (B * cos(ang) + N * sin(ang)) * rad, inTail) * squeeze;
        // là où la mèche tenue ou tirée touche le crâne, ses fils en épousent la
        // courbe, presque à la même hauteur (un contour lisse, sans tuiles)
        vec3 d0 = p0.xyz - center, dp = p - center;
        float high = length(d0) - skullR(d0);
        // (en main, elle passe plus haut, par-dessus les autres : elle suit la
        // même courbe, à sa hauteur)
        float hug = onMap * flatS * (1.0 - smoothstep(0.3, 0.6, high));
        float hh = 0.012 + max(0.0, high) * mix(0.3, 1.0, smoothstep(0.04, 0.16, high)) + 0.004 * iO.z + 0.016 * solo * (1.0 - laid);
        // (les racines partent au ras du cuir chevelu)
        hh *= smoothstep(0.0, 0.16, ta);
        dp = normalize(dp) * mix(length(dp), skullR(dp) + hh, hug);
        p = center + dp;
        N = normalize(mix(N, normalize(dp - T * dot(dp, T) + 1e-6), hug));
        // en se fondant dans la calotte, les fils tirés s'y enfoncent (aucun halo autour de la tête)
        p -= normalize(dp) * (0.07 * onSkull + (1.0 - onMap) * 0.02 * flatS * (1.0 - smoothstep(0.0, 0.2, ta)));
        // le ruban : couché sur la chevelure quand on la regarde de face (pas
        // de torsion quand le cheveu part vers la caméra), tourné vers la
        // caméra quand on la voit de profil
        vec3 Tw = normalize(mat3(modelMatrix) * T), Nw = normalize(mat3(modelMatrix) * N), Bw = normalize(cross(Tw, Nw));
        vec3 V = normalize(cameraPosition - (modelMatrix * vec4(p, 1.0)).xyz);
        vec3 cam = cross(Tw, V);
        float lc = length(cam);
        cam = lc > 1e-4 ? cam / lc : Bw;
        if (dot(cam, Bw) < 0.0) cam = -cam;
        float face = abs(dot(Nw, V));
        // (tirés sur le crâne, ils sont couchés partout : un contour net, sans franges)
        vec3 side = normalize(mix(cam, Bw, max(smoothstep(0.15, 0.55, face), flatS)));
        // la largeur est en rayons de tête : à l'échelle du monde
        float w = width * iO.w * mix(1.0, 0.25, ta * ta) * length(modelMatrix[0].xyz) * mix(1.0, 1.7, onSkull);
        vec4 wp = modelMatrix * vec4(p, 1.0);
        wp.xyz += side * position.y * w * 0.5;
        vT = normalize(mat3(modelMatrix) * T); vN = normalize(mat3(modelMatrix) * N);
        vPos = wp.xyz; vt = ta; vSide = position.y; vRnd = iO.z;
        // la racine : chaque fil naît un peu plus loin que son voisin, en
        // fondu sur la calotte (aucune rangée de départs : pas d'écailles)
        vRoot = vec2(fract(iO.z * 7.31) * 0.12, 0.14) * mix(1.0, 0.3, solo);
        vGlow = chan(iG.x, 3);
        // posée sur le crâne : presque mate (les reflets de chaque mèche s'y
        // arrêtaient à des hauteurs différentes : des taches, en couronne)
        vMat = laid * flatS;
        // sur le crâne, une mèche attachée est dessinée par la calotte (pas de fils : pas d'écailles)
        // ... et jusque sous l'élastique (leurs départs y faisaient une couronne effilochée)
        // (le faisceau, lui, se voit en entier : il relie la tête à l'élastique)
        vHide = tied * (1.0 - smoothstep(tieAt - 1.05 * seg, tieAt - 0.9 * seg, t));
        // (une tresse : la queue est dessinée par elle)
        vHide = max(vHide, tied * braid);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 base;
      uniform vec3 light;
      uniform float time;
      uniform float shine;
      varying vec3 vT; varying vec3 vN; varying vec3 vPos; varying float vt; varying float vSide; varying float vRnd; varying float vGlow; varying float vHide; varying float vMat; varying vec2 vRoot;
      float strand(vec3 T, vec3 H, float e) {
        float th = dot(T, H);
        return pow(max(0.0, sqrt(max(0.0, 1.0 - th * th))), e);
      }
      void main() {
        vec3 T = normalize(vT), N = normalize(vN);
        vec3 V = normalize(cameraPosition - vPos), L = normalize(light), H = normalize(L + V);
        // le volume : le dessus de la chevelure dans la lumière, le dessous dans l'ombre
        float vol = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
        float diff = mix(0.5, 1.0, vol);
        // la pointe un peu plus claire (le soleil)
        vec3 c = base * (0.86 + 0.28 * vRnd) * diff * mix(1.0, 1.12, vt);
        // deux reflets décalés le long du cheveu (Kajiya-Kay)
        float shift = (vRnd - 0.5) * 0.25;
        float s1 = strand(normalize(T + N * (0.12 + shift)), H, 90.0);
        float s2 = strand(normalize(T - N * (0.18 - shift)), H, 22.0);
        float sp = vol * mix(1.0, 0.25, vMat);
        c += vec3(1.0, 0.96, 0.9) * s1 * shine * sp + base * s2 * 0.45 * sp;
        // les mèches à prendre maintenant : une lueur dorée qui respire
        // (douce : la chevelure respire, elle ne change pas de couleur)
        float pulse = 0.5 + 0.5 * sin(time * 3.5);
        c *= 1.0 + 0.22 * pulse * vGlow;
        float a = 1.0 - smoothstep(0.45, 1.0, abs(vSide));
        a *= 1.0 - smoothstep(0.86, 1.0, vt);
        a *= smoothstep(vRoot.x, vRoot.x + vRoot.y, vt);
        a *= 1.0 - smoothstep(0.35, 0.8, vHide);
        gl_FragColor = vec4(c, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  })
  const mesh = new T.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.castShadow = false

  /* ---- Chaque image : les guides lissés dans la texture ----
     Une mèche endormie n'est pas recalculée ; si rien n'a bougé, rien n'est renvoyé. */
  const p = hair.pos
  const glow = new Float32Array(G), solo = new Float32Array(G), slept = new Uint8Array(G), seen = new Float32Array(G * 6).fill(-9)
  // les coefficients de Catmull-Rom (position, tangente) de chaque point lissé
  // (`lv` : à quel point les points ont glissé vers la queue, par seizièmes)
  const coefs = (lv: number, knee: number) => {
    const at = new Int32Array(S * 4), cp = new Float32Array(S * 4), ct = new Float32Array(S * 4), tt = new Float32Array(S)
    // (le faisceau sous l'élastique, lui, garde ses points)
    const kn = knee - 1.2 / (P - 1), k0 = kn + (0.15 - kn) * lv
    for (let k = 0; k < S; k++) {
      const x = k / (S - 1)
      tt[k] = !lv ? x : x < k0 ? x / k0 * kn : kn + (x - k0) / (1 - k0) * (1 - kn)
      const u = tt[k] * (P - 1), i = Math.min(P - 2, Math.floor(u)), f = u - i, f2 = f * f, f3 = f2 * f
      at.set([Math.max(0, i - 1) * 3, i * 3, (i + 1) * 3, Math.min(P - 1, i + 2) * 3], k * 4)
      cp.set([0.5 * (-f + 2 * f2 - f3), 0.5 * (2 - 5 * f2 + 3 * f3), 0.5 * (f + 4 * f2 - 3 * f3), 0.5 * (f3 - f2)], k * 4)
      ct.set([0.5 * (-1 + 4 * f - 3 * f2), 0.5 * (-10 * f + 9 * f2), 0.5 * (1 + 8 * f - 9 * f2), 0.5 * (3 * f2 - 2 * f)], k * 4)
    }
    return { at, cp, ct, tt }
  }
  const tables = new Map<number, ReturnType<typeof coefs>>()
  const table = (n: number, knee: number) => { let c = tables.get(n); if (!c) tables.set(n, c = coefs(n / 16, knee)); return c }
  let lastT = performance.now()
  function update() {
    const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000)
    lastT = now
    let dirty = false
    for (let g = 0; g < G; g++) {
      const row = g * S * 8, held = hair.tieIdx[g] >= 0
      solo[g] = held ? Math.min(1, solo[g] + dt / 0.2) : Math.max(0, solo[g] - dt / 0.35)
      // (lâchée, elle garde un instant la place de sa main, le temps du fondu)
      const look = view.look ? view.look[g] : hair.tiedLook(g), lv = held ? Math.round(look * 16) : 0
      const want = [held ? hair.tieIdx[g] / (P - 1) : solo[g] > 0 ? seen[g * 6] : 0, look, solo[g], glow[g], hair.tiedLook(g), lv / 16], moved = seen[g * 6 + 5] !== lv / 16
      for (let c = 0; c < 6; c++) if (seen[g * 6 + c] !== Math.fround(want[c])) { seen[g * 6 + c] = data[row + (S + c) * 4 + 3] = want[c]; dirty = true }
      if (hair.asleep[g] && slept[g] && !moved) continue
      slept[g] = hair.asleep[g]
      dirty = true
      const b0 = g * P * 3, knee = held ? hair.tieIdx[g] / (P - 1) : 1, arc = held ? hair.arc[g] : 1
      const { at, cp, ct, tt } = table(lv, knee)
      for (let k = 0; k < S; k++) {
        const k4 = k * 4, o = row + k4, ot = o + S * 4
        const A = b0 + at[k4], B = b0 + at[k4 + 1], C = b0 + at[k4 + 2], D = b0 + at[k4 + 3]
        const a0 = cp[k4], a1 = cp[k4 + 1], a2 = cp[k4 + 2], a3 = cp[k4 + 3], b1 = ct[k4], b2 = ct[k4 + 1], b3 = ct[k4 + 2], b4 = ct[k4 + 3]
        data[o] = p[A] * a0 + p[B] * a1 + p[C] * a2 + p[D] * a3
        data[o + 1] = p[A + 1] * a0 + p[B + 1] * a1 + p[C + 1] * a2 + p[D + 1] * a3
        data[o + 2] = p[A + 2] * a0 + p[B + 2] * a1 + p[C + 2] * a2 + p[D + 2] * a3
        data[ot] = p[A] * b1 + p[B] * b2 + p[C] * b3 + p[D] * b4
        data[ot + 1] = p[A + 1] * b1 + p[B + 1] * b2 + p[C + 1] * b3 + p[D + 1] * b4
        data[ot + 2] = p[A + 2] * b1 + p[B + 2] * b2 + p[C + 2] * b3 + p[D + 2] * b4
        const t = tt[k]
        data[o + 3] = t <= knee ? t / knee * arc : arc + (t - knee) / (1 - knee) * (1 - arc)
      }
    }
    uniforms.time.value = now / 1000
    if (dirty) tex.needsUpdate = true
  }
  const view: HairView = {
    mesh,
    glow,
    look: null,
    update,
    setDensity: k => { geo.instanceCount = G * Math.max(1, Math.round(child * k)); uniforms.width.value = (o.width ?? 0.03) / Math.sqrt(Math.max(0.2, k)) },
    setBraid: v => { uniforms.braid.value = v },
    setColor: hex => { uniforms.base.value.set(hex); uniforms.shine.value = shineOf(uniforms.base.value) },
    setLight: (x, y, z) => { uniforms.light.value.set(x, y, z).normalize() },
    dispose: () => { geo.dispose(); mat.dispose(); tex.dispose(); skTex.dispose() }
  }
  update()
  return view
}

/* ---------- La calotte (23/11) ----------
   Sous les fils, une surface lisse qui épouse le crâne, dessinée avec des
   stries qui suivent le sens des cheveux. Pourquoi : des cheveux TIRÉS
   (une queue de cheval) dessinés en fils montraient le départ de chaque
   fil, venus de directions différentes — des écailles (le père : « dégueu »).
   Une calotte n'a ni départ ni bord : lisse et brillante comme une
   chevelure tirée. Lâchés, ses stries tombent ; attachés, elles
   convergent vers l'attache, où la calotte se soulève en un petit dôme
   (les cheveux rassemblés). Sa lisière suit celle du cuir chevelu, adoucie.
   Elle remplace aussi la peinture sombre du cuir chevelu sous les fils. */

export interface HairCap {
  mesh: import('three').Mesh
  setColor(hex: string): void
  /** L'attache (repère de la tête) et à quel point la chevelure y est tirée (0..1). */
  setTie(p: [number, number, number] | null, on: number): void
  setLight(x: number, y: number, z: number): void
  /** Le point de la calotte dans une direction (repère de la tête). */
  surface(dir: [number, number, number]): [number, number, number]
  /** À quel point chaque mèche est tirée (0..1, par mèche) : les stries de la
      calotte tournent là où elles sont, peu à peu. `roots` : leurs racines. */
  setTieField(roots: Float32Array, look: ArrayLike<number>): void
  /** Le dôme sous chaque attache (0..1) : quand toute la chevelure y est. */
  setDome(a: number, b: number): void
  /** Une seconde attache (les couettes), ou aucune. */
  setTie2(p: [number, number, number] | null): void
  /** Quelle attache tire chaque endroit du crâne (0 ou 1), selon sa direction. */
  setSides(side: (x: number, y: number, z: number) => number): void
  /** La raie au milieu (0 : aucune, 1 : tracée), ouverte de `lo` à `hi`
      (angles dans le plan du milieu : 0 le sommet, + le front). */
  setPart(v: number, lo?: number, hi?: number): void
  dispose(): void
}

/** La calotte. `surface` : le VRAI cuir chevelu du modèle (ses triangles,
    repère de la tête) — la calotte l'épouse exactement, avec sa lisière
    (le 24/11 : posée sur un ovale, elle flottait au-dessus du front et
    laissait voir le cuir chevelu peint dessous). Sans lui : un ovale. */
export function hairCap(T: T3, skull: { c: [number, number, number]; r: [number, number, number] }, onScalp: (x: number, y: number, z: number) => boolean,
  surface?: { tris: Float32Array; lift: number; map: SkullMap }): HairCap {
  const geo = surface ? capFromSurface(T, surface.tris, skull.c, surface.lift, surface.map) : capFromSphere(T, skull, onScalp)
  let near: number[][] | null = null
  const ray = new T.Raycaster()
  const probe = new T.Mesh(geo, new T.MeshBasicMaterial({ side: T.DoubleSide }))
  const uniforms = {
    base: { value: new T.Color('#6B4A2B') },
    shine: { value: 0.12 },
    light: { value: new T.Vector3(-0.4, 0.8, -0.45).normalize() },
    tie: { value: new T.Vector3(0, 0.2, -1.1) },
    tieOn: { value: 0 },
    bump: { value: 0 },
    dome: { value: new T.Vector2() },
    tie2: { value: new T.Vector3(0, 0.2, -1.1) },
    bump2: { value: 0 },
    part: { value: 0 },
    partR: { value: new T.Vector2(9, -9) },
    center: { value: new T.Vector3(...skull.c) }
  }
  const mat = new T.ShaderMaterial({
    uniforms,
    ...opaque(T),
    alphaToCoverage: true,
    vertexShader: /* glsl */`
      attribute vec3 aDir; attribute float aMask; attribute float aTie; attribute float aSide;
      uniform vec3 tie; uniform float tieOn; uniform float bump; uniform vec3 center;
      uniform vec3 tie2; uniform float bump2; uniform float part; uniform vec2 partR; uniform vec2 dome;
      varying vec3 vPos; varying vec3 vN; varying vec3 vT; varying vec3 vTp; varying float vMask; varying vec4 vS; varying float vNear; varying vec3 vD; varying float vOn;
      void main() {
        // tirée seulement là où les cheveux sont déjà arrivés à l'attache
        float on = aTie * tieOn;
        vec3 p = position;
        vec3 n = normalize(aDir);
        // l'attache de cet endroit du crâne (les couettes : celle de son côté)
        vec3 tieP = mix(tie, tie2, aSide);
        float bmp = mix(bump, bump2, aSide);
        vec3 tn = normalize(tieP - center);
        // le dôme des cheveux rassemblés, sous l'attache
        float ang = acos(clamp(dot(n, tn), -1.0, 1.0));
        float w = smoothstep(0.75, 0.0, ang);
        p += n * mix(dome.x, dome.y, aSide) * bmp * pow(w, 1.4);
        // le sens des cheveux : lâchés, ils tombent ; tirés, ils vont vers l'attache
        // (avec la raie, ils partent de chaque côté de la ligne du milieu)
        float sgn = n.x >= 0.0 ? 1.0 : -1.0, th = atan(n.z, n.y);
        float opened = part * smoothstep(partR.x - 0.15, partR.x + 0.05, th) * (1.0 - smoothstep(partR.y - 0.05, partR.y + 0.15, th));
        vec3 loose = vec3(n.x * 0.35 + sgn * opened * 1.6 * smoothstep(-0.4, 0.5, n.y), -1.0, -0.35);
        vec3 pulled = tieP - p;
        vec3 f = normalize(loose - n * dot(loose, n) + 1e-5), fp = normalize(pulled - n * dot(pulled, n) + 1e-5);
        // les stries : des lignes le long du sens des cheveux. Tirés : des
        // rayons autour de l'attache ; lâchés : des lignes verticales
        vec3 ax = abs(tn.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
        vec3 e1 = normalize(cross(tn, ax)), e2 = cross(tn, e1);
        float phiT = atan(dot(n, e2), dot(n, e1));
        float phiL = atan(n.x, n.z);
        vS = vec4(phiL, n.y, phiT, ang);
        vOn = on;
        vNear = smoothstep(0.35, 0.0, ang);
        vMask = aMask;
        vD = n;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vPos = wp.xyz;
        vN = normalize(mat3(modelMatrix) * n);
        vT = normalize(mat3(modelMatrix) * f); vTp = normalize(mat3(modelMatrix) * fp);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 base; uniform vec3 light; uniform float shine; uniform float part; uniform vec2 partR;
      varying vec3 vPos; varying vec3 vN; varying vec3 vT; varying vec3 vTp; varying float vMask; varying vec4 vS; varying float vNear; varying vec3 vD; varying float vOn;
      float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
      float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
      float strand(vec3 T, vec3 H, float e) { float th = dot(T, H); return pow(max(0.0, sqrt(max(0.0, 1.0 - th * th))), e); }
      // la chevelure dans un sens : ses stries, sa lumière (w : la strie)
      vec4 hairs(vec3 T, vec2 s, float calm, float near, vec3 N, vec3 H, float vol) {
        // des mèches fines et des plus larges, qui varient doucement le long
        float x = s.x * 26.0;
        float st = mix(0.5, 0.55 * n1(x * 9.0 + s.y * 2.0) + 0.3 * n1(x * 3.1 - s.y) + 0.15 * n1(x * 23.0), calm);
        vec3 c = base * mix(0.5, 1.08, vol) * (0.66 + 0.62 * st);
        // au pied de l'attache, la chevelure se resserre : un peu plus sombre
        c *= 1.0 - 0.25 * near;
        float shift = (st - 0.5) * 0.3;
        float s1 = strand(normalize(T + N * (0.1 + shift)), H, 70.0);
        float s2 = strand(normalize(T - N * (0.2 - shift)), H, 18.0);
        // le reflet s'efface vers la lisière (il faisait une bande blanche au front)
        float rim = smoothstep(0.3, 1.0, vMask);
        c += (vec3(1.0, 0.96, 0.9) * s1 * shine * (0.5 + st) * vol + base * s2 * 0.5 * vol) * calm * rim;
        return vec4(c, st);
      }
      void main() {
        vec3 N = normalize(vN), V = normalize(cameraPosition - vPos), L = normalize(light), H = normalize(L + V);
        float vol = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
        // lâchée, tirée : en fondu de couleur (les stries qui tournent d'un sens à
        // l'autre faisaient passer un grand reflet blanc). Tout près de l'attache,
        // elles se fondent (leur point de rencontre faisait une tache)
        vec4 l = hairs(normalize(vT), vS.xy, 1.0, 0.0, N, H, vol);
        vec4 p = hairs(normalize(vTp), vS.zw, mix(1.0, smoothstep(0.05, 0.3, vS.w), smoothstep(0.0, 0.2, vNear)), vNear, N, H, vol);
        vec4 m = mix(l, p, vOn);
        vec3 c = m.rgb;
        // la lisière : adoucie, et un peu irrégulière (des mèches, pas un bord net)
        float a = smoothstep(0.15, 0.75, vMask + (m.w - 0.5) * 0.35);
        // la raie : une fine ligne de peau au milieu, un peu irrégulière, les
        // racines plus sombres de chaque côté (au pixel : par sommet, c'était
        // une bande floue, un serre-tête)
        float th = atan(vD.z, vD.y), off = abs(vD.x) / length(vD) + 0.006 * (n1(th * 70.0) - 0.5);
        float opened = part * smoothstep(partR.x - 0.04, partR.x + 0.04, th) * (1.0 - smoothstep(partR.y - 0.04, partR.y + 0.04, th));
        c *= 1.0 - 0.35 * opened * (1.0 - smoothstep(0.008, 0.06, off));
        c = mix(c, vec3(0.56, 0.29, 0.21) * mix(0.7, 1.0, vol), opened * 0.9 * (1.0 - smoothstep(0.006, 0.013, off)));
        gl_FragColor = vec4(c, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  })
  const mesh = new T.Mesh(geo, mat)
  mesh.frustumCulled = false
  return {
    mesh,
    setColor: hex => { uniforms.base.value.set(hex); uniforms.shine.value = shineOf(uniforms.base.value) },
    setTie: (p, on) => {
      if (p) {
        uniforms.tie.value.set(p[0], p[1], p[2])
        // la hauteur du dôme : de la calotte jusqu'un peu sous l'attache
        const d = uniforms.tie.value.clone().sub(uniforms.center.value)
        const surf = surfaceAt(d)
        uniforms.bump.value = Math.max(0, d.length() - surf - 0.03)
      }
      uniforms.tieOn.value = on
    },
    setLight: (x, y, z) => { uniforms.light.value.set(x, y, z).normalize() },
    setTie2: p => {
      if (!p) { uniforms.bump2.value = 0; return }
      uniforms.tie2.value.set(p[0], p[1], p[2])
      const d = uniforms.tie2.value.clone().sub(uniforms.center.value)
      uniforms.bump2.value = Math.max(0, d.length() - surfaceAt(d) - 0.03)
    },
    setSides: side => {
      const a = geo.getAttribute('aSide') as import('three').BufferAttribute, dirs = geo.getAttribute('aDir')
      for (let v = 0; v < a.count; v++) a.setX(v, side(dirs.getX(v), dirs.getY(v), dirs.getZ(v)))
      a.needsUpdate = true
    },
    setPart: (v, lo = -9, hi = 9) => { uniforms.part.value = v; uniforms.partR.value.set(lo, hi) },
    setDome: (a, b) => { uniforms.dome.value.set(a * a * (3 - 2 * a), b * b * (3 - 2 * b)) },
    setTieField: (roots, look) => {
      const aTie = geo.getAttribute('aTie') as import('three').BufferAttribute, dirs = geo.getAttribute('aDir')
      if (!near) {
        // une fois : pour chaque sommet, les racines proches et leur poids (une
        // cloche sur l'angle) — la frontière entre la chevelure tirée et la
        // libre est douce, pas une plaque au bord net
        const G = roots.length / 3, ru: number[] = []
        for (let g = 0; g < G; g++) { const x = roots[g * 3], y = roots[g * 3 + 1], z = roots[g * 3 + 2], l = Math.hypot(x, y, z) || 1; ru.push(x / l, y / l, z / l) }
        near = []
        for (let v = 0; v < dirs.count; v++) {
          const dx = dirs.getX(v), dy = dirs.getY(v), dz = dirs.getZ(v), list: number[] = []
          let best = -1, bg = 0
          for (let g = 0; g < G; g++) {
            const d = dx * ru[g * 3] + dy * ru[g * 3 + 1] + dz * ru[g * 3 + 2]
            if (d > best) { best = d; bg = g }
            const ang = Math.acos(Math.min(1, d))
            if (ang < 0.5) list.push(g, Math.exp(-((ang / 0.22) ** 2)))
          }
          // loin de toute racine (la nuque) : la plus proche
          near.push(list.length ? list : [bg, 1])
        }
      }
      const arr = aTie.array as Float32Array
      for (let v = 0; v < arr.length; v++) {
        const list = near[v]
        let sum = 0, w = 0
        for (let k = 0; k < list.length; k += 2) { sum += look[list[k]] * list[k + 1]; w += list[k + 1] }
        arr[v] = sum / w
      }
      aTie.needsUpdate = true
    },
    surface: (dir: [number, number, number]) => {
      const d = new T.Vector3(...dir).normalize()
      const r = surfaceAt(d)
      return [uniforms.center.value.x + d.x * r, uniforms.center.value.y + d.y * r, uniforms.center.value.z + d.z * r]
    },
    dispose: () => { geo.dispose(); mat.dispose(); (probe.material as import('three').Material).dispose() }
  }

  /** La distance du centre à la calotte dans une direction. */
  function surfaceAt(dir: import('three').Vector3) {
    const u = dir.clone().normalize(), c = uniforms.center.value
    ray.set(c.clone().addScaledVector(u, 6), u.clone().negate())
    const hit = ray.intersectObject(probe, false)[0]
    if (hit) return hit.point.distanceTo(c)
    return 1 / Math.sqrt((u.x / (skull.r[0] + 0.03)) ** 2 + (u.y / (skull.r[1] + 0.03)) ** 2 + (u.z / (skull.r[2] + 0.03)) ** 2)
  }
}

/** Un ovale découpé par la lisière (le repli, sans modèle). */
function capFromSphere(T: T3, skull: { c: [number, number, number]; r: [number, number, number] }, onScalp: (x: number, y: number, z: number) => boolean) {
  const src = new T.SphereGeometry(1, 128, 96)
  const P = src.getAttribute('position')
  const n = P.count
  const mask = new Float32Array(n)
  const jit: number[][] = []
  for (let k = 0; k < 12; k++) { const a = k * 2.399963, r = 0.05 * Math.sqrt((k + 0.5) / 12); jit.push([Math.cos(a) * r, Math.sin(a) * r]) }
  for (let i = 0; i < n; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i)
    let m = onScalp(x, y, z) ? 1 : 0
    for (const [u, v] of jit) {
      const qx = x + u, qy = y + v * 0.7, qz = z + (u - v) * 0.5, l = Math.hypot(qx, qy, qz)
      m += onScalp(qx / l, qy / l, qz / l) ? 1 : 0
    }
    mask[i] = m / (jit.length + 1)
  }
  const idx = src.getIndex()!
  const keep: number[] = []
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2)
    if (mask[a] + mask[b] + mask[c] > 0) keep.push(a, b, c)
  }
  const geo = new T.BufferGeometry()
  const pos = new Float32Array(n * 3), dir = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i)
    dir.set([x, y, z], i * 3)
    pos.set([skull.c[0] + x * (skull.r[0] + 0.03), skull.c[1] + y * (skull.r[1] + 0.03), skull.c[2] + z * (skull.r[2] + 0.03)], i * 3)
  }
  geo.setAttribute('position', new T.BufferAttribute(pos, 3))
  geo.setAttribute('aDir', new T.BufferAttribute(dir, 3))
  geo.setAttribute('aTie', new T.BufferAttribute(new Float32Array(mask.length), 1))
  geo.setAttribute('aSide', new T.BufferAttribute(new Float32Array(mask.length), 1))
  geo.setAttribute('aMask', new T.BufferAttribute(mask, 1))
  geo.setIndex(keep)
  src.dispose()
  return geo
}

/** La calotte sur le vrai cuir chevelu : ses triangles soudés, subdivisés
    deux fois (assez fins pour le dôme de l'attache), décollés de `lift`
    vers l'extérieur ; la lisière s'adoucit sur deux rangs de sommets. */
function capFromSurface(T: T3, tris: Float32Array, c: [number, number, number], lift: number, map: SkullMap) {
  // souder les sommets confondus (les coutures de la texture)
  const verts: number[] = [], key = new Map<string, number>()
  let index: number[] = []
  for (let k = 0; k < tris.length; k += 3) {
    const id = `${Math.round(tris[k] * 1e4)},${Math.round(tris[k + 1] * 1e4)},${Math.round(tris[k + 2] * 1e4)}`
    let v = key.get(id)
    if (v === undefined) { v = verts.length / 3; verts.push(tris[k], tris[k + 1], tris[k + 2]); key.set(id, v) }
    index.push(v)
  }
  // deux subdivisions par le milieu des arêtes
  for (let pass = 0; pass < 2; pass++) {
    const mid = new Map<string, number>(), next: number[] = []
    const m = (a: number, b: number) => {
      const id = a < b ? `${a},${b}` : `${b},${a}`
      let v = mid.get(id)
      if (v === undefined) {
        v = verts.length / 3
        verts.push((verts[a * 3] + verts[b * 3]) / 2, (verts[a * 3 + 1] + verts[b * 3 + 1]) / 2, (verts[a * 3 + 2] + verts[b * 3 + 2]) / 2)
        mid.set(id, v)
      }
      return v
    }
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t], b = index[t + 1], cc = index[t + 2], ab = m(a, b), bc = m(b, cc), ca = m(cc, a)
      next.push(a, ab, ca, ab, b, bc, ca, bc, cc, ab, bc, ca)
    }
    index = next
  }
  const n = verts.length / 3
  // la lisière : les arêtes qui ne bordent qu'un triangle ; puis la distance au bord
  const edges = new Map<string, number>()
  for (let t = 0; t < index.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = index[t + e], b = index[t + (e + 1) % 3], id = a < b ? `${a},${b}` : `${b},${a}`
    edges.set(id, (edges.get(id) ?? 0) + 1)
  }
  const nb: number[][] = Array.from({ length: n }, () => [])
  const dist = new Float32Array(n).fill(1e9)
  const queue: number[] = []
  for (const [id, count] of edges) {
    const [a, b] = id.split(',').map(Number)
    nb[a].push(b); nb[b].push(a)
    if (count === 1) for (const v of [a, b]) if (dist[v]) { dist[v] = 0; queue.push(v) }
  }
  for (let q = 0; q < queue.length; q++) for (const w of nb[queue[q]]) if (dist[w] > dist[queue[q]] + 1) { dist[w] = dist[queue[q]] + 1; queue.push(w) }
  // le contour arrondi : les milieux d'arêtes tombent sur des cordes plates
  // (un crâne à facettes) — chaque sommet se pose sur la carte du crâne, douce
  for (let i = 0; i < n; i++) {
    const x = verts[i * 3] - c[0], y = verts[i * 3 + 1] - c[1], z = verts[i * 3 + 2] - c[2], f = map.at(x, y, z) / (Math.hypot(x, y, z) || 1)
    verts[i * 3] = c[0] + x * f; verts[i * 3 + 1] = c[1] + y * f; verts[i * 3 + 2] = c[2] + z * f
  }
  const pos = new Float32Array(n * 3), dir = new Float32Array(n * 3), mask = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = verts[i * 3] - c[0], y = verts[i * 3 + 1] - c[1], z = verts[i * 3 + 2] - c[2], l = Math.hypot(x, y, z) || 1
    dir.set([x / l, y / l, z / l], i * 3)
    pos.set([verts[i * 3] + x / l * lift, verts[i * 3 + 1] + y / l * lift, verts[i * 3 + 2] + z / l * lift], i * 3)
    // (sous la nuque, le cuir chevelu peint du modèle descendait jusqu'au col : un
    // casque ; une lisière douce, plus basse au milieu, en pointe)
    const nape = -0.93 + 0.3 * Math.abs(x / l)
    mask[i] = Math.min(1, dist[i] / 3) * Math.min(1, Math.max(0, (y / l - nape) / 0.22))
  }
  const geo = new T.BufferGeometry()
  geo.setAttribute('position', new T.BufferAttribute(pos, 3))
  geo.setAttribute('aDir', new T.BufferAttribute(dir, 3))
  geo.setAttribute('aTie', new T.BufferAttribute(new Float32Array(mask.length), 1))
  geo.setAttribute('aSide', new T.BufferAttribute(new Float32Array(mask.length), 1))
  geo.setAttribute('aMask', new T.BufferAttribute(mask, 1))
  geo.setIndex(index)
  return geo
}
