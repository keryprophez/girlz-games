import type { T3 } from './three3d'
import type { Hair } from './hair'

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

export const CHILD = 10
/** Points par fil, le long de la mèche. */
export const S = 24

export interface HairView {
  mesh: import('three').Mesh
  /** La lueur de chaque mèche (0..1) : celles à prendre maintenant. */
  glow: Float32Array
  /** À appeler à chaque image, après la physique. */
  update(): void
  setColor(hex: string): void
  /** La lumière principale (direction vers la lumière, dans le monde). */
  setLight(x: number, y: number, z: number): void
  dispose(): void
}

export function hairView(T: T3, hair: Hair, o: { width?: number; child?: number; seed?: number } = {}): HairView {
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
  for (let g = 0, n = 0; g < G; g++) for (let c = 0; c < child; c++, n++) {
    iG.set([g, near[g][0], near[g][1]], n * 3)
    // le poids du guide principal domine ; les voisins remplissent les trous
    let a = 0.55 + rnd() * 0.45, b = rnd() * (1 - a), w = 1 - a - b
    if (c === 0) { a = 1; b = 0; w = 0 }
    iW.set([a, b, w], n * 3)
    // décalage : dans le plan de la mèche (x) et vers l'extérieur (y ≥ 0), une variation de teinte, une épaisseur
    const r = Math.sqrt(rnd()) * 0.07, th = rnd() * Math.PI
    iO.set([Math.cos(th) * r, Math.abs(Math.sin(th)) * r * 0.6, rnd(), 0.75 + rnd() * 0.5], n * 4)
  }
  geo.setAttribute('iG', new T.InstancedBufferAttribute(iG, 3))
  geo.setAttribute('iW', new T.InstancedBufferAttribute(iW, 3))
  geo.setAttribute('iO', new T.InstancedBufferAttribute(iO, 4))
  geo.instanceCount = N

  const uniforms = {
    guides: { value: tex },
    width: { value: o.width ?? 0.03 },
    base: { value: new T.Color('#6B4A2B') },
    light: { value: new T.Vector3(-0.4, 0.8, -0.45).normalize() },
    center: { value: new T.Vector3() },
    time: { value: 0 }
  }
  const mat = new T.ShaderMaterial({
    uniforms,
    alphaToCoverage: true,
    side: T.DoubleSide,
    vertexShader: /* glsl */`
      // (three.js compile en GLSL ES 3.00 sous WebGL 2 : texelFetch y est permis)
      precision highp sampler2D;
      uniform sampler2D guides;
      uniform float width;
      uniform vec3 center;
      attribute vec3 iG; attribute vec3 iW; attribute vec4 iO;
      varying vec3 vT; varying vec3 vN; varying vec3 vPos; varying float vt; varying float vSide; varying float vRnd; varying float vGlow; varying float vHide;
      const float S = ${S}.0;
      void at(float g, float i, out vec3 p, out vec3 t) {
        p = texelFetch(guides, ivec2(int(i), int(g)), 0).xyz;
        t = texelFetch(guides, ivec2(int(i + S), int(g)), 0).xyz;
      }
      void main() {
        float t = position.x;
        float i = floor(t * (S - 1.0) + 0.5);
        vec3 p0, t0, p1, t1, p2, t2;
        at(iG.x, i, p0, t0); at(iG.y, i, p1, t1); at(iG.z, i, p2, t2);
        // une mèche attachée : ses fils ne suivent qu'elle (ses voisines,
        // attachées plus près ou plus loin, couperaient le fil en travers)
        // (le canal porte la place de l'attache le long de la mèche, 0 sinon)
        float tieAt = texelFetch(guides, ivec2(int(S), int(iG.x)), 0).w;
        float tied = step(0.001, max(tieAt, max(texelFetch(guides, ivec2(int(S), int(iG.y)), 0).w, texelFetch(guides, ivec2(int(S), int(iG.z)), 0).w)));
        vec3 bw = mix(iW, vec3(1.0, 0.0, 0.0), tied);
        vec3 p = p0 * bw.x + p1 * bw.y + p2 * bw.z;
        vec3 T = normalize(t0 * bw.x + t1 * bw.y + t2 * bw.z + 1e-6);
        // le repère de la mèche : vers l'extérieur de la tête, et de côté
        vec3 N = p - center; N = normalize(N - T * dot(N, T) + 1e-6);
        vec3 B = cross(T, N);
        // les fils se resserrent vers la pointe : des mèches, pas un rideau
        float clump = mix(1.0, 0.35, smoothstep(0.35, 1.0, t));
        float spread = mix(2.2, 1.0, smoothstep(0.0, 0.25, t));
        // une légère ondulation propre à chaque fil
        // une mèche attachée : sur le crâne, ses fils s'étalent à plat et
        // couvrent sans trou (tirés, lisses) ; dans la queue, ils gardent du volume
        float onSkull = tied * (1.0 - smoothstep(tieAt - 0.07, tieAt - 0.015, t));
        float wave = sin(t * 4.5 + iO.z * 6.28) * 0.006 * smoothstep(0.1, 0.5, t) * (1.0 - tied);
        spread *= mix(1.0, 1.35, onSkull);
        // la queue : les fils se répartissent tout autour (un volume rond, pas un crayon)
        float inTail = tied * smoothstep(tieAt, tieAt + 0.06, t);
        // sous l'élastique, la queue s'ouvre peu à peu (serrée en haut, pleine plus bas)
        float ang = iO.z * 6.2832, rad = length(iO.xy) * 2.6 * mix(0.35, 1.0, smoothstep(tieAt, tieAt + 0.3, t)) * mix(1.0, 0.7, smoothstep(tieAt, 1.0, t));
        vec3 lay = (B * (iO.x * spread + wave) + N * iO.y * smoothstep(0.0, 0.1, t) * mix(1.0, 0.15, onSkull)) * clump;
        // à l'élastique, le faisceau est serré : les fils s'y rejoignent
        float squeeze = 1.0 - 0.85 * tied * exp(-pow((t - tieAt - 0.02) / 0.12, 2.0));
        p += mix(lay, (B * cos(ang) + N * sin(ang)) * rad, inTail) * squeeze;
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
        vec3 side = normalize(mix(cam, Bw, smoothstep(0.15, 0.55, face)));
        // la largeur est en rayons de tête : à l'échelle du monde
        float w = width * iO.w * mix(1.0, 0.18, t * t) * length(modelMatrix[0].xyz) * mix(1.0, 1.7, onSkull);
        vec4 wp = modelMatrix * vec4(p, 1.0);
        wp.xyz += side * position.y * w * 0.5;
        vT = normalize(mat3(modelMatrix) * T); vN = normalize(mat3(modelMatrix) * N);
        vPos = wp.xyz; vt = t; vSide = position.y; vRnd = iO.z;
        vGlow = texelFetch(guides, ivec2(int(i), int(iG.x)), 0).w;
        // sur le crâne, une mèche attachée est dessinée par la calotte (pas de fils : pas d'écailles)
        vHide = onSkull;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 base;
      uniform vec3 light;
      uniform float time;
      varying vec3 vT; varying vec3 vN; varying vec3 vPos; varying float vt; varying float vSide; varying float vRnd; varying float vGlow; varying float vHide;
      float strand(vec3 T, vec3 H, float e) {
        float th = dot(T, H);
        return pow(max(0.0, sqrt(max(0.0, 1.0 - th * th))), e);
      }
      void main() {
        vec3 T = normalize(vT), N = normalize(vN);
        vec3 V = normalize(cameraPosition - vPos), L = normalize(light), H = normalize(L + V);
        // le volume : le dessus de la chevelure dans la lumière, le dessous dans l'ombre
        float vol = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
        float diff = mix(0.32, 1.0, vol);
        // la racine plus sombre, la pointe un peu plus claire (le soleil)
        float ao = mix(0.62, 1.0, smoothstep(0.0, 0.2, vt));
        vec3 c = base * (0.9 + 0.2 * vRnd) * diff * ao * mix(1.0, 1.12, vt);
        // deux reflets décalés le long du cheveu (Kajiya-Kay)
        float shift = (vRnd - 0.5) * 0.25;
        float s1 = strand(normalize(T + N * (0.12 + shift)), H, 90.0);
        float s2 = strand(normalize(T - N * (0.18 - shift)), H, 22.0);
        float sp = smoothstep(0.04, 0.2, vt) * vol;
        c += vec3(1.0, 0.96, 0.9) * s1 * 0.22 * sp + base * s2 * 0.45 * sp;
        // les mèches à prendre maintenant : une lueur dorée qui respire
        // (douce : la chevelure respire, elle ne change pas de couleur)
        float pulse = 0.5 + 0.5 * sin(time * 3.5);
        c *= 1.0 + 0.22 * pulse * vGlow;
        float a = 1.0 - smoothstep(0.45, 1.0, abs(vSide));
        a *= 1.0 - smoothstep(0.86, 1.0, vt);
        // la racine se fond dans le cuir chevelu : aucun départ de fil ne se voit
        a *= smoothstep(0.0, 0.07, vt);
        a *= 1.0 - smoothstep(0.35, 0.8, vHide);
        gl_FragColor = vec4(c, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  })
  const mesh = new T.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.castShadow = false

  /* ---- Chaque image : les guides lissés dans la texture ---- */
  const p = hair.pos
  const glow = new Float32Array(G)
  function update() {
    for (let g = 0; g < G; g++) {
      const base = g * P
      for (let k = 0; k < S; k++) {
        const u = k / (S - 1) * (P - 1), i = Math.min(P - 2, Math.floor(u)), f = u - i
        const a = Math.max(0, i - 1), b = i, c = i + 1, d = Math.min(P - 1, i + 2)
        const o = (g * S * 2 + k) * 4, ot = (g * S * 2 + S + k) * 4
        for (let x = 0; x < 3; x++) {
          const p0 = p[(base + a) * 3 + x], p1 = p[(base + b) * 3 + x], p2 = p[(base + c) * 3 + x], p3 = p[(base + d) * 3 + x]
          const f2 = f * f, f3 = f2 * f
          data[o + x] = 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f3)
          data[ot + x] = 0.5 * ((-p0 + p2) + 2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * f + 3 * (-p0 + 3 * p1 - 3 * p2 + p3) * f2)
        }
        data[o + 3] = glow[g]
        // une mèche attachée est tirée : ses fils se serrent (un aspect lisse)
        data[ot + 3] = hair.tieIdx[g] >= 0 ? Math.max(0.01, hair.tieIdx[g] / (P - 1)) : 0
      }
    }
    uniforms.time.value = performance.now() / 1000
    tex.needsUpdate = true
  }
  update()

  return {
    mesh,
    glow,
    update,
    setColor: hex => { uniforms.base.value.set(hex) },
    setLight: (x, y, z) => { uniforms.light.value.set(x, y, z).normalize() },
    dispose: () => { geo.dispose(); mat.dispose(); tex.dispose() }
  }
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
  dispose(): void
}

export function hairCap(T: T3, skull: { c: [number, number, number]; r: [number, number, number] }, onScalp: (x: number, y: number, z: number) => boolean): HairCap {
  const src = new T.SphereGeometry(1, 128, 96)
  const P = src.getAttribute('position')
  const n = P.count
  // la lisière adoucie : la part d'échantillons voisins qui portent des cheveux
  const mask = new Float32Array(n)
  const jit: number[][] = []
  for (let k = 0; k < 12; k++) { const a = k * 2.399963, r = 0.05 * Math.sqrt((k + 0.5) / 12); jit.push([Math.cos(a) * r, Math.sin(a) * r]) }
  for (let i = 0; i < n; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i)
    let m = onScalp(x, y, z) ? 1 : 0
    for (const [u, v] of jit) {
      // un petit décalage sur la sphère
      const qx = x + u, qy = y + v * 0.7, qz = z + (u - v) * 0.5, l = Math.hypot(qx, qy, qz)
      m += onScalp(qx / l, qy / l, qz / l) ? 1 : 0
    }
    mask[i] = m / (jit.length + 1)
  }
  // ne garder que les triangles qui portent des cheveux
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
    // juste au-dessus du crâne (sous les fils)
    pos.set([skull.c[0] + x * (skull.r[0] + 0.03), skull.c[1] + y * (skull.r[1] + 0.03), skull.c[2] + z * (skull.r[2] + 0.03)], i * 3)
  }
  geo.setAttribute('position', new T.BufferAttribute(pos, 3))
  geo.setAttribute('aDir', new T.BufferAttribute(dir, 3))
  geo.setAttribute('aMask', new T.BufferAttribute(mask, 1))
  geo.setIndex(keep)
  src.dispose()

  const uniforms = {
    base: { value: new T.Color('#6B4A2B') },
    light: { value: new T.Vector3(-0.4, 0.8, -0.45).normalize() },
    tie: { value: new T.Vector3(0, 0.2, -1.1) },
    tieOn: { value: 0 },
    bump: { value: 0 },
    center: { value: new T.Vector3(...skull.c) }
  }
  const mat = new T.ShaderMaterial({
    uniforms,
    alphaToCoverage: true,
    vertexShader: /* glsl */`
      attribute vec3 aDir; attribute float aMask;
      uniform vec3 tie; uniform float tieOn; uniform float bump; uniform vec3 center;
      varying vec3 vPos; varying vec3 vN; varying vec3 vT; varying float vMask; varying vec2 vS; varying float vNear;
      void main() {
        vec3 p = position;
        vec3 n = normalize(aDir);
        vec3 tn = normalize(tie - center);
        // le dôme des cheveux rassemblés, sous l'attache
        float ang = acos(clamp(dot(n, tn), -1.0, 1.0));
        float w = smoothstep(0.75, 0.0, ang);
        p += n * tieOn * bump * pow(w, 1.4);
        // le sens des cheveux : lâchés, ils tombent ; tirés, ils vont vers l'attache
        vec3 loose = vec3(n.x * 0.35, -1.0, -0.35);
        vec3 pulled = tie - p;
        vec3 f = mix(loose, pulled, tieOn);
        f = normalize(f - n * dot(f, n) + 1e-5);
        // les stries : des lignes le long du sens des cheveux. Tirés : des
        // rayons autour de l'attache ; lâchés : des lignes verticales
        vec3 ax = abs(tn.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
        vec3 e1 = normalize(cross(tn, ax)), e2 = cross(tn, e1);
        float phiT = atan(dot(n, e2), dot(n, e1));
        float phiL = atan(n.x, n.z);
        vS = vec2(mix(phiL, phiT, tieOn), mix(n.y, ang, tieOn));
        vNear = tieOn * smoothstep(0.35, 0.0, ang);
        vMask = aMask;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vPos = wp.xyz;
        vN = normalize(mat3(modelMatrix) * n);
        vT = normalize(mat3(modelMatrix) * f);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 base; uniform vec3 light;
      varying vec3 vPos; varying vec3 vN; varying vec3 vT; varying float vMask; varying vec2 vS; varying float vNear;
      float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
      float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
      float strand(vec3 T, vec3 H, float e) { float th = dot(T, H); return pow(max(0.0, sqrt(max(0.0, 1.0 - th * th))), e); }
      void main() {
        vec3 T = normalize(vT), N = normalize(vN);
        vec3 V = normalize(cameraPosition - vPos), L = normalize(light), H = normalize(L + V);
        // des mèches fines et des plus larges, qui varient doucement le long
        float x = vS.x * 26.0;
        // tout près de l'attache, les stries se fondent (leur point de rencontre faisait une tache)
        float calm = smoothstep(0.05, 0.3, vS.y * step(0.5, vNear + 0.5) + (1.0 - step(0.001, vNear)));
        float st = mix(0.5, 0.55 * n1(x * 9.0 + vS.y * 2.0) + 0.3 * n1(x * 3.1 - vS.y) + 0.15 * n1(x * 23.0), calm);
        float vol = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
        vec3 c = base * mix(0.5, 1.08, vol) * (0.66 + 0.62 * st);
        // au pied de l'attache, la chevelure se resserre : un peu plus sombre
        c *= 1.0 - 0.25 * vNear;
        float shift = (st - 0.5) * 0.3;
        float s1 = strand(normalize(T + N * (0.1 + shift)), H, 70.0);
        float s2 = strand(normalize(T - N * (0.2 - shift)), H, 18.0);
        c += (vec3(1.0, 0.96, 0.9) * s1 * 0.32 * (0.5 + st) * vol + base * s2 * 0.6 * vol) * calm;
        // la lisière : adoucie, et un peu irrégulière (des mèches, pas un bord net)
        float a = smoothstep(0.15, 0.75, vMask + (st - 0.5) * 0.35);
        gl_FragColor = vec4(c, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  })
  const mesh = new T.Mesh(geo, mat)
  mesh.frustumCulled = false
  return {
    mesh,
    setColor: hex => { uniforms.base.value.set(hex) },
    setTie: (p, on) => {
      if (p) {
        uniforms.tie.value.set(p[0], p[1], p[2])
        // la hauteur du dôme : de la calotte jusqu'un peu sous l'attache
        const d = uniforms.tie.value.clone().sub(uniforms.center.value)
        const u = d.clone().normalize()
        const surf = 1 / Math.sqrt((u.x / (skull.r[0] + 0.03)) ** 2 + (u.y / (skull.r[1] + 0.03)) ** 2 + (u.z / (skull.r[2] + 0.03)) ** 2)
        uniforms.bump.value = Math.max(0, d.length() - surf - 0.03)
      }
      uniforms.tieOn.value = on
    },
    setLight: (x, y, z) => { uniforms.light.value.set(x, y, z).normalize() },
    dispose: () => { geo.dispose(); mat.dispose() }
  }
}
