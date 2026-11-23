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
      varying vec3 vT; varying vec3 vN; varying vec3 vPos; varying float vt; varying float vSide; varying float vRnd; varying float vGlow;
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
        float onSkull = tied * (1.0 - smoothstep(tieAt - 0.02, tieAt + 0.04, t));
        float wave = sin(t * 4.5 + iO.z * 6.28) * 0.006 * smoothstep(0.1, 0.5, t) * (1.0 - tied);
        spread *= mix(1.0, 1.35, onSkull);
        // la queue : les fils se répartissent tout autour (un volume rond, pas un crayon)
        float inTail = tied * smoothstep(tieAt, tieAt + 0.06, t);
        float ang = iO.z * 6.2832, rad = length(iO.xy) * 2.6 * mix(1.0, 0.7, smoothstep(tieAt, 1.0, t));
        vec3 lay = (B * (iO.x * spread + wave) + N * iO.y * smoothstep(0.0, 0.1, t) * mix(1.0, 0.15, onSkull)) * clump;
        p += mix(lay, (B * cos(ang) + N * sin(ang)) * rad, inTail);
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
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 base;
      uniform vec3 light;
      uniform float time;
      varying vec3 vT; varying vec3 vN; varying vec3 vPos; varying float vt; varying float vSide; varying float vRnd; varying float vGlow;
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
