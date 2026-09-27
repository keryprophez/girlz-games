import type { Stage, T3 } from './three3d'

/* LE SYSTÈME SOLAIRE (27/09) — le rendu du Voyage dans l'Espace, repris
   d'après la maquette du père (`systeme-solaire.html`, three.js et shaders
   écrits à la main) : on garde ses idées une à une.

   - Le CIEL : des étoiles procédurales colorées selon leur température (corps
     noir), trois couches de profondeur, et la Voie lactée posée sur le vrai
     plan galactique, avec son bulbe et ses bandes de poussière.
   - Le SOLEIL : sa texture qui ondule, la granulation qui bout, le bord plus
     sombre et plus rouge, et une couronne qui flotte autour.
   - La TERRE : le jour, la nuit avec les lumières des villes, le reflet du
     Soleil sur les océans, les nuages, le liseré bleu de l'atmosphère.
   - Une atmosphère pour Vénus, Mars, les géantes et Titan ; Jupiter et
     Saturne aplaties ; l'ombre de Saturne sur ses anneaux ET celle des
     anneaux sur Saturne.
   - Les VRAIES POSITIONS du jour (éléments képlériens du JPL, 1800-2050) ; la
     Terre tourne à l'heure vraie (temps sidéral) ; les lunes tournent en
     face de leur planète.
   - Distances et tailles COMPRESSÉES (puissances 0,55 et 0,6) : tout reste
     visible, Jupiter reste énorme et Mercure minuscule.
   - Le rendu en HDR (demi-flottants, lissage ×4), un halo lumineux en sept
     étages, puis la courbe ACES, un vignettage et un tramage.

   Rien ici ne s'affiche en texte (règle 2) : le jeu (`games/space.ts`) garde
   la voix, les billes et la fusée. Textures : Solar System Scope (CC BY 4.0)
   dans `public/assets/space/`. */

type V3 = import('three').Vector3
type Obj3 = import('three').Object3D
type Mesh = import('three').Mesh
type SMat = import('three').ShaderMaterial
type Tex = import('three').Texture
type RT = import('three').WebGLRenderTarget

const D2R = Math.PI / 180

/* ---------- L'échelle : compressée pour que tout reste visible ---------- */
export const distScene = (au: number) => 60 * Math.pow(au, 0.55)
export const radScene = (km: number) => Math.pow(km / 6371, 0.6)
const moonOrbitScene = (aKm: number, parentKm: number, parentR: number) => parentR * (2.2 + 0.9 * Math.log(aKm / parentKm))
export const SUN_R = 10

/* JPL, « Keplerian elements for approximate positions of the major planets »
   (1800-2050) : a, e, I, L, longitude du périhélie, du nœud, puis leurs
   dérives par siècle julien. */
const EL: Record<string, number[]> = {
  mercure: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593, 0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  venus: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255, 0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
  terre: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0, 0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  mars: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  jupiter: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  saturne: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, -0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
  uranus: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503, -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
  neptune: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574, 0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
  pluton: [39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684, -0.00031596, 0.00005170, 0.00004818, 145.20780515, -0.04062942, -0.01183482]
}

/** Position écliptique héliocentrique (UA) au siècle julien T ; `Mover` force
    l'anomalie moyenne (pour tracer l'orbite entière). */
function keplerEcl(el: number[], T: number, Mover?: number): [number, number, number] {
  const a = el[0] + el[6] * T, e = el[1] + el[7] * T, I = (el[2] + el[8] * T) * D2R
  const L = el[3] + el[9] * T, wb = el[4] + el[10] * T, Om = (el[5] + el[11] * T) * D2R
  const w = (wb - (el[5] + el[11] * T)) * D2R
  let M = Mover !== undefined ? Mover : ((L - wb) % 360) * D2R
  M = Math.atan2(Math.sin(M), Math.cos(M))
  let E = M + e * Math.sin(M)
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(Om), sO = Math.sin(Om), cI = Math.cos(I), sI = Math.sin(I)
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    (sw * sI) * xp + (cw * sI) * yp
  ]
}
/** Écliptique (UA) → scène compressée (x, nord = +y, y écliptique = −z). */
function eclToScene(v: [number, number, number], out: V3) {
  const r = Math.hypot(v[0], v[1], v[2])
  const k = distScene(r) / r
  return out.set(v[0] * k, v[2] * k, -v[1] * k)
}

/* ---------- Les astres ---------- */
export interface BodyDef {
  id: string
  /** Le nom tel que la voix le dit (« la Terre »). */
  name: string
  km: number
  color: string
  tex?: string
  tint?: [number, number, number]
  /** Inclinaison de l'axe (degrés) et durée du jour (heures). */
  tilt?: number
  period?: number
  kind?: 'sun' | 'earth' | 'gas'
  flat?: number
  rings?: boolean
  /** Couleur et force de l'atmosphère. */
  atmo?: [number, number, number, number] | null
  /** Une lune : sa planète, sa distance (km), sa période (jours), sa longitude à J2000. */
  parent?: string
  aKm?: number
  pDays?: number
  L0?: number
  inc?: number
  /** Rayon et rayon d'orbite dans la scène (calculés). */
  R: number
  orbitR: number
}

type Def = Omit<BodyDef, 'R' | 'orbitR'>
const DEFS: Def[] = [
  { id: 'soleil', name: 'le Soleil', km: 696340, color: '#ffcf7a', kind: 'sun' },
  { id: 'mercure', name: 'Mercure', km: 2439.7, tex: 'mercury.jpg', tilt: 0.03, period: 1407.6, color: '#a9a39b', atmo: null },
  { id: 'venus', name: 'Vénus', km: 6051.8, tex: 'venus.jpg', tilt: 177.4, period: 5832.5, color: '#e8cf9a', atmo: [1.0, 0.86, 0.55, 0.9] },
  { id: 'terre', name: 'la Terre', km: 6371, tex: 'earth_day.jpg', tilt: 23.44, period: 23.9345, color: '#6fa8ff', kind: 'earth', atmo: [0.35, 0.6, 1.0, 1.25] },
  { id: 'lune', name: 'la Lune', km: 1737.4, tex: 'moon.jpg', parent: 'terre', aKm: 384400, pDays: 27.321661, inc: 5.14, color: '#bdbab4' },
  { id: 'mars', name: 'Mars', km: 3389.5, tex: 'mars.jpg', tilt: 25.19, period: 24.6229, color: '#e0875a', atmo: [1.0, 0.62, 0.42, 0.45] },
  { id: 'jupiter', name: 'Jupiter', km: 69911, tex: 'jupiter.jpg', tilt: 3.13, period: 9.925, color: '#d9b38c', kind: 'gas', flat: 0.0649, atmo: [0.95, 0.85, 0.7, 0.45] },
  { id: 'io', name: 'Io', km: 1821.6, tex: 'moon.jpg', tint: [1.35, 1.15, 0.55], parent: 'jupiter', aKm: 421700, pDays: 1.769138, L0: 163.8069, color: '#e6d36a' },
  { id: 'europe', name: 'Europe', km: 1560.8, tex: 'moon.jpg', tint: [1.25, 1.12, 0.95], parent: 'jupiter', aKm: 671034, pDays: 3.551181, L0: 358.4140, color: '#d9cfbf' },
  { id: 'ganymede', name: 'Ganymède', km: 2634.1, tex: 'moon.jpg', tint: [0.95, 0.9, 0.85], parent: 'jupiter', aKm: 1070412, pDays: 7.154553, L0: 5.7176, color: '#a8a094' },
  { id: 'callisto', name: 'Callisto', km: 2410.3, tex: 'moon.jpg', tint: [0.62, 0.58, 0.52], parent: 'jupiter', aKm: 1882709, pDays: 16.689018, L0: 224.8092, color: '#7d766c' },
  { id: 'saturne', name: 'Saturne', km: 58232, tex: 'saturn.jpg', tilt: 26.73, period: 10.656, color: '#e6cf98', kind: 'gas', flat: 0.098, rings: true, atmo: [0.95, 0.88, 0.7, 0.35] },
  { id: 'titan', name: 'Titan', km: 2574.7, tex: 'venus.jpg', tint: [1.1, 0.78, 0.42], parent: 'saturne', aKm: 1221870, pDays: 15.945, L0: 120, color: '#d8a15a', atmo: [1.0, 0.7, 0.35, 0.8] },
  { id: 'uranus', name: 'Uranus', km: 25362, tex: 'uranus.jpg', tilt: 97.77, period: 17.24, color: '#a7e0e6', kind: 'gas', atmo: [0.6, 0.9, 1.0, 0.6] },
  { id: 'neptune', name: 'Neptune', km: 24622, tex: 'neptune.jpg', tilt: 28.32, period: 16.11, color: '#5b7fe0', kind: 'gas', atmo: [0.45, 0.6, 1.0, 0.7] },
  { id: 'pluton', name: 'Pluton', km: 1188.3, tex: 'moon.jpg', tint: [1.2, 1.0, 0.82], tilt: 122.5, period: 153.29, color: '#c9ad8f' }
]

/* ---------- Le bruit 3D (ciel, Soleil) et les fonctions GLSL partagées ---------- */
function makeNoise(T: T3) {
  const N = 64, C = 16, cell = N / C
  const lat = new Float32Array(C * C * C)
  let seed = 7331
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (let i = 0; i < lat.length; i++) lat[i] = rnd()
  const data = new Uint8Array(N * N * N)
  const L = (x: number, y: number, z: number) => lat[(x % C) + (y % C) * C + (z % C) * C * C]
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
  let o = 0
  for (let z = 0; z < N; z++) {
    const gz = z / cell, iz = gz | 0, fz = fade(gz - iz)
    for (let y = 0; y < N; y++) {
      const gy = y / cell, iy = gy | 0, fy = fade(gy - iy)
      for (let x = 0; x < N; x++) {
        const gx = x / cell, ix = gx | 0, fx = fade(gx - ix)
        const a = L(ix, iy, iz) + (L(ix + 1, iy, iz) - L(ix, iy, iz)) * fx
        const b = L(ix, iy + 1, iz) + (L(ix + 1, iy + 1, iz) - L(ix, iy + 1, iz)) * fx
        const c = L(ix, iy, iz + 1) + (L(ix + 1, iy, iz + 1) - L(ix, iy, iz + 1)) * fx
        const d = L(ix, iy + 1, iz + 1) + (L(ix + 1, iy + 1, iz + 1) - L(ix, iy + 1, iz + 1)) * fx
        const e = a + (b - a) * fy, f = c + (d - c) * fy
        data[o++] = Math.round((e + (f - e) * fz) * 255)
      }
    }
  }
  const t = new T.Data3DTexture(data, N, N, N)
  t.format = T.RedFormat
  t.type = T.UnsignedByteType
  t.minFilter = t.magFilter = T.LinearFilter
  t.wrapS = t.wrapT = t.wrapR = T.RepeatWrapping
  t.unpackAlignment = 1
  t.needsUpdate = true
  return t
}

const NOISE_GLSL = `
uniform highp sampler3D uNoise;
float n3(vec3 p){ return texture(uNoise, p * 0.0625).r; }
float fbm(vec3 p, int oct){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++){ if (i >= oct) break; s += a * n3(p); p = mat3(0.0,0.8,0.6,-0.8,0.36,-0.48,-0.6,-0.48,0.64) * p * 2.03; a *= 0.5; }
  return s;
}
float hash13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
vec3 bbody(float T){
  T = clamp(T, 1000.0, 15000.0);
  float u = (0.860117757 + 1.54118254e-4*T + 1.28641212e-7*T*T) / (1.0 + 8.42420235e-4*T + 7.08145163e-7*T*T);
  float v = (0.317398726 + 4.22806245e-5*T + 4.20481691e-8*T*T) / (1.0 - 2.89741816e-5*T + 1.61456053e-7*T*T);
  float x = 3.0*u / (2.0*u - 8.0*v + 4.0), y = 2.0*v / (2.0*u - 8.0*v + 4.0);
  vec3 rgb = max(mat3(3.2404542,-0.9692660,0.0556434,-1.5371385,1.8760108,-0.2040259,-0.4985314,0.0415560,1.0572252) * vec3(x/y, 1.0, (1.0-x-y)/y), 0.0);
  return rgb / max(rgb.r, max(rgb.g, rgb.b));
}`

const PLANET_VS = `varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`

/* ---------- Ce que le jeu voit du système ---------- */
export interface Cosmos {
  bodies: BodyDef[]
  byId: Record<string, BodyDef>
  /** Le Soleil comme lumière des objets ordinaires (la fusée). */
  light: import('three').PointLight
  /** Place tout au jour julien `jd` ; `spinJd` règle les rotations et les lunes. */
  setTime(jd: number, spinJd: number): void
  /** Uniformes de l'image (Soleil animé, points lointains, orbites qui s'effacent). */
  frame(dt: number): void
  worldPos(id: string, out?: V3): V3
  radius(id: string): number
  /** Distance au Soleil (UA) d'une planète, ou de la planète d'une lune. */
  au(id: string): number
  /** L'astre sous le doigt (tolérance en pixels, au moins `minTol`). */
  pick(x: number, y: number, minTol: number): string | null
  pxPerUnit(d: number): number
  /** Le rendu complet : à brancher sur `stage.render`. */
  render(): void
  resize(): void
  /** Densité de pixels (réglage automatique quand la tablette peine). */
  pixelRatio: number
  setPixelRatio(pr: number): void
  /** Lissage ×4 des bords (coûteux) : retiré en dernier recours. */
  setMsaa(on: boolean): void
  dispose(): void
}

/** Construit le système solaire dans la scène du `stage` (textures chargées
    avant de rendre la main). `base` : l'URL du dossier des textures. */
export async function makeCosmos(stage: Stage, base: string): Promise<Cosmos> {
  const T = stage.T
  const { renderer, scene, camera } = stage
  scene.background = null
  scene.fog = null
  renderer.autoClear = false
  camera.far = 1e5
  camera.updateProjectionMatrix()

  const bodies: BodyDef[] = DEFS.map(d => ({ ...d, R: 0, orbitR: 0 }))
  const byId: Record<string, BodyDef> = Object.fromEntries(bodies.map(b => [b.id, b]))
  for (const b of bodies) {
    b.R = b.id === 'soleil' ? SUN_R : radScene(b.km)
    if (b.parent) b.orbitR = moonOrbitScene(b.aKm!, byId[b.parent].km, radScene(byId[b.parent].km))
  }

  /* --- Textures (attendues : pas de planète blanche au premier regard) --- */
  const maxAniso = renderer.capabilities.getMaxAnisotropy()
  const texCache = new Map<string, Tex>()
  const loader = new T.TextureLoader()
  const files = new Set<string>(['sun.jpg', 'earth_night.jpg', 'earth_clouds.jpg', 'earth_spec.jpg', 'saturn_ring.png'])
  bodies.forEach(b => { if (b.tex) files.add(b.tex) })
  await Promise.all(Array.from(files).map(async f => {
    const t = await loader.loadAsync(base + f)
    t.colorSpace = /spec|clouds/.test(f) ? T.NoColorSpace : T.SRGBColorSpace
    t.anisotropy = Math.min(8, maxAniso)
    t.wrapS = T.RepeatWrapping
    texCache.set(f, stage.keep(t))
  }))
  const tex = (f: string) => texCache.get(f)!
  const noiseTex = stage.keep(makeNoise(T))

  /* --- Le ciel : dans sa propre scène, rendu d'abord, sans profondeur --- */
  const skyScene = new T.Scene()
  const skyCam = new T.PerspectiveCamera(50, 1, 0.1, 10)
  const skyMat = stage.keep(new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, depthTest: false,
    uniforms: { uNoise: { value: noiseTex }, uPix: { value: 0.001 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: NOISE_GLSL + `
    uniform float uPix;
    varying vec3 vDir;
    vec3 stars(vec3 d, float scale, float dens, float gain){
      vec3 p = d * scale; vec3 id = floor(p);
      if (hash13(id) > dens) return vec3(0.0);
      vec3 sp = normalize(id + 0.15 + 0.7 * vec3(hash13(id + 1.7), hash13(id + 3.1), hash13(id + 5.3)));
      float dist = length(d - sp);
      float sz = uPix * 0.85;
      float b = pow(hash13(id + 9.1), 7.0) * 2.0 + 0.03;
      return bbody(mix(3000.0, 12000.0, hash13(id + 7.7))) * b * gain * exp(-dist * dist / (sz * sz));
    }
    void main(){
      vec3 d = normalize(vDir);
      vec3 pole = vec3(-0.868, 0.497, 0.0);
      vec3 gc = normalize(vec3(-0.0556, -0.0958, 0.9942));
      float lat = dot(d, pole);
      float band = exp(-lat * lat / 0.018);
      float toC = acos(clamp(dot(d, gc), -1.0, 1.0));
      float bulge = exp(-toC * toC / 0.35) * exp(-lat * lat / 0.03);
      float n = fbm(d * 6.0, 5);
      float dust = smoothstep(0.42, 0.7, fbm(d * 13.0 + 3.0, 4)) * exp(-lat * lat / 0.004);
      float mw = (band * (0.35 + 0.9 * n) + bulge * 1.4 * (0.6 + 0.6 * n)) * (1.0 - 0.8 * dust);
      vec3 col = mw * mix(vec3(0.55, 0.6, 0.75), vec3(0.95, 0.8, 0.62), bulge * 1.5) * 0.028;
      col += stars(d, 70.0, 0.07, 0.9) * (0.6 + 1.2 * band);
      col += stars(d, 170.0, 0.07, 0.35) * (0.3 + 2.0 * band);
      col += stars(d, 360.0, 0.1, 0.15) * (0.1 + 3.0 * band + 2.0 * bulge);
      gl_FragColor = vec4(col, 1.0);
    }`
  }))
  const skyGeo = stage.keep(new T.SphereGeometry(5, 48, 24))
  skyScene.add(new T.Mesh(skyGeo, skyMat))

  /* --- Le Soleil et sa couronne --- */
  const sunUniforms = { map: { value: tex('sun.jpg') }, uNoise: { value: noiseTex }, uTime: { value: 0 } }
  const sunMesh = new T.Mesh(new T.SphereGeometry(SUN_R, 96, 64), new T.ShaderMaterial({
    uniforms: sunUniforms,
    vertexShader: `varying vec3 vN; varying vec3 vW; varying vec2 vUv; varying vec3 vObj;
    void main(){ vUv = uv; vObj = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: NOISE_GLSL + `
    uniform sampler2D map; uniform float uTime;
    varying vec3 vN; varying vec3 vW; varying vec2 vUv; varying vec3 vObj;
    void main(){
      vec3 V = normalize(cameraPosition - vW);
      float mu = max(dot(normalize(vN), V), 0.0);
      vec3 p = normalize(vObj);
      vec2 warp = vec2(fbm(p * 5.0 + uTime * 0.02, 3), fbm(p * 5.0 + 11.0 - uTime * 0.02, 3)) - 0.5;
      vec3 base = texture2D(map, vUv + warp * 0.012).rgb;
      float gran = fbm(p * 38.0 + vec3(0.0, uTime * 0.05, 0.0), 3);
      base *= 0.8 + 0.45 * gran;
      vec3 limb = mix(vec3(1.0, 0.42, 0.18), vec3(1.0, 0.88, 0.7), pow(mu, 0.55));
      vec3 col = base * limb * (0.3 + 0.7 * pow(mu, 0.45)) * 6.0;
      gl_FragColor = vec4(col, 1.0);
    }`
  }))
  sunMesh.userData.body = 'soleil'
  scene.add(sunMesh)
  const coronaMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { uNoise: { value: noiseTex }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: NOISE_GLSL + `
    uniform float uTime; varying vec2 vUv;
    void main(){
      vec2 q = (vUv - 0.5) * 2.0 * 6.0;
      float r = length(q);
      if (r < 0.98) discard;
      float a = atan(q.y, q.x);
      float streams = fbm(vec3(cos(a) * 3.5, sin(a) * 3.5, uTime * 0.03 + r * 0.05), 4);
      float glow = exp(-(r - 1.0) * 3.2) * 1.3 + exp(-(r - 1.0) * 0.9) * 0.22;
      glow *= 0.65 + 0.9 * pow(streams, 2.0);
      glow *= 1.0 - smoothstep(4.5, 6.0, r);
      gl_FragColor = vec4(vec3(1.0, 0.78, 0.5) * glow * 0.9, 1.0);
    }`
  })
  const corona = new T.Mesh(new T.PlaneGeometry(SUN_R * 12, SUN_R * 12), coronaMat)
  corona.frustumCulled = false
  scene.add(corona)

  /* La lumière des objets ordinaires (la fusée) : le Soleil, sans atténuation
     (les distances sont compressées), plus une ambiante très faible. */
  const light = new T.PointLight(0xFFF2DD, 2.6, 0, 0)
  scene.add(light)
  scene.add(new T.AmbientLight(0x8090B0, 0.22))

  /* --- Les matériaux des planètes et des lunes --- */
  function planetMaterial(b: BodyDef) {
    const defines: Record<string, number> = {}
    const uniforms: Record<string, { value: unknown }> = {
      map: { value: tex(b.tex!) }, uSunI: { value: 1 },
      uTint: { value: new T.Vector3(...(b.tint || [1, 1, 1])) },
      uAtmo: { value: new T.Vector4(...(b.atmo || [0, 0, 0, 0])) }
    }
    if (b.kind === 'earth') {
      defines.EARTH = 1
      uniforms.nightMap = { value: tex('earth_night.jpg') }
      uniforms.specMap = { value: tex('earth_spec.jpg') }
    }
    if (b.kind === 'gas') defines.GAS = 1
    if (b.rings) {
      defines.RINGSHADOW = 1
      uniforms.ringMap = { value: tex('saturn_ring.png') }
      uniforms.uCenter = { value: new T.Vector3() }
      uniforms.uRingN = { value: new T.Vector3(0, 1, 0) }
      uniforms.uRingR = { value: new T.Vector2(1.24 * b.R, 2.27 * b.R) }
    }
    return new T.ShaderMaterial({
      defines, uniforms, vertexShader: PLANET_VS,
      fragmentShader: `
      uniform sampler2D map; uniform float uSunI; uniform vec3 uTint; uniform vec4 uAtmo;
      #ifdef EARTH
      uniform sampler2D nightMap; uniform sampler2D specMap;
      #endif
      #ifdef RINGSHADOW
      uniform sampler2D ringMap; uniform vec3 uCenter; uniform vec3 uRingN; uniform vec2 uRingR;
      #endif
      varying vec3 vN; varying vec3 vW; varying vec2 vUv;
      void main(){
        vec3 N = normalize(vN);
        vec3 L = normalize(-vW);
        vec3 V = normalize(cameraPosition - vW);
        float ndl = dot(N, L);
        float ndv = max(dot(N, V), 0.0);
        vec3 alb = texture2D(map, vUv).rgb * uTint;
        float wrap = uAtmo.w > 0.0 ? 0.06 : 0.0;
        float diff = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
      #ifdef GAS
        diff *= mix(0.55, 1.0, pow(ndv, 0.35));
      #else
        // Surfaces rugueuses : un peu de Lommel-Seeliger vers le bord
        diff = mix(diff, 2.0 * diff * ndv / (ndv + max(ndl, 0.0) + 1e-3) * 0.5 + diff * 0.5, 0.5);
      #endif
      #ifdef RINGSHADOW
        float den = dot(L, uRingN);
        if (abs(den) > 1e-4){
          float t = dot(uCenter - vW, uRingN) / den;
          if (t > 0.0){
            float rr = length(vW + L * t - uCenter);
            if (rr > uRingR.x && rr < uRingR.y){
              float a = texture2D(ringMap, vec2((rr - uRingR.x) / (uRingR.y - uRingR.x), 0.5)).a;
              diff *= 1.0 - 0.85 * a;
            }
          }
        }
      #endif
        vec3 col = alb * diff * uSunI * vec3(1.0, 0.97, 0.92);
      #ifdef EARTH
        float spec = texture2D(specMap, vUv).r;
        vec3 H = normalize(L + V);
        col += vec3(1.0, 0.92, 0.8) * pow(max(dot(N, H), 0.0), 70.0) * spec * 0.9 * smoothstep(0.0, 0.2, ndl) * uSunI;
        vec3 city = texture2D(nightMap, vUv).rgb;
        col += city * vec3(1.0, 0.78, 0.5) * 1.6 * smoothstep(0.05, -0.2, ndl);
      #endif
        // Perspective aérienne vers le bord, côté jour
        float fres = pow(1.0 - ndv, 3.0);
        col += uAtmo.rgb * fres * uAtmo.w * 0.6 * smoothstep(-0.25, 0.45, ndl) * uSunI;
        gl_FragColor = vec4(col, 1.0);
      }`
    })
  }

  function atmosphereMesh(b: BodyDef, scaleR: number) {
    const m = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.BackSide,
      uniforms: { uAtmo: { value: new T.Vector4(...b.atmo!) }, uSunI: { value: 1 } },
      vertexShader: PLANET_VS,
      fragmentShader: `uniform vec4 uAtmo; uniform float uSunI;
      varying vec3 vN; varying vec3 vW; varying vec2 vUv;
      void main(){
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW), L = normalize(-vW);
        float rim = 1.0 - abs(dot(N, V));
        float edge = smoothstep(0.0, 1.0, rim);
        float glow = pow(edge, 4.0) * (1.0 - smoothstep(0.92, 1.0, rim) * 0.85);
        float lit = smoothstep(-0.4, 0.35, dot(N, L));
        gl_FragColor = vec4(uAtmo.rgb * glow * lit * uAtmo.w * 1.5 * uSunI, 1.0);
      }`
    })
    return new T.Mesh(new T.SphereGeometry(b.R * scaleR, 96, 48), m)
  }

  /* --- Le graphe : position (orbite) > inclinaison > rotation --- */
  interface Node {
    b: BodyDef
    pos: Obj3
    tilt: Obj3
    spin: Obj3
    mesh: Mesh
    clouds?: Mesh
    atmo?: Mesh
    ring?: Mesh
    orbitFrame?: Obj3
  }
  const nodes: Record<string, Node> = {}
  const sphereGeo = new T.SphereGeometry(1, 128, 64)
  const sphereGeoLo = new T.SphereGeometry(1, 64, 32)
  for (const b of bodies) {
    if (b.id === 'soleil') continue
    const pos = new T.Group(), tilt = new T.Group(), spin = new T.Group()
    pos.add(tilt); tilt.add(spin)
    tilt.rotation.x = (b.tilt || 0) * D2R
    const mesh = new T.Mesh(b.parent ? sphereGeoLo : sphereGeo, planetMaterial(b))
    mesh.scale.set(b.R, b.R * (1 - (b.flat || 0)), b.R)
    mesh.userData.body = b.id
    spin.add(mesh)
    const n: Node = { b, pos, tilt, spin, mesh }
    if (b.kind === 'earth') {
      const cl = new T.Mesh(sphereGeo, new T.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { map: { value: tex('earth_clouds.jpg') }, uSunI: { value: 1 } },
        vertexShader: PLANET_VS,
        fragmentShader: `uniform sampler2D map; uniform float uSunI; varying vec3 vN; varying vec3 vW; varying vec2 vUv;
        void main(){
          vec3 N = normalize(vN), L = normalize(-vW);
          float a = texture2D(map, vUv).r;
          a = smoothstep(0.08, 0.9, a);
          float d = clamp(dot(N, L) * 1.1 + 0.05, 0.0, 1.0);
          gl_FragColor = vec4(vec3(1.0, 0.99, 0.97) * d * uSunI, a * 0.95);
        }`
      }))
      cl.scale.setScalar(b.R * 1.012)
      spin.add(cl)
      n.clouds = cl
    }
    if (b.atmo && !b.parent) {
      const k = b.kind === 'earth' ? 1.055 : b.kind === 'gas' ? 1.03 : 1.035
      n.atmo = atmosphereMesh(b, k)
      n.atmo.scale.set(1, 1 - (b.flat || 0), 1)
      tilt.add(n.atmo)
    }
    if (b.id === 'titan') { n.atmo = atmosphereMesh(b, 1.12); tilt.add(n.atmo) }
    if (b.rings) {
      const inner = 1.24 * b.R, outer = 2.27 * b.R
      const rm = new T.ShaderMaterial({
        transparent: true, depthWrite: false, side: T.DoubleSide,
        uniforms: { ringMap: { value: tex('saturn_ring.png') }, uR: { value: new T.Vector2(inner, outer) }, uCenter: { value: new T.Vector3() }, uPR: { value: b.R }, uSunI: { value: 1 } },
        vertexShader: `varying vec3 vW; varying vec2 vP; void main(){ vP = position.xy; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: `uniform sampler2D ringMap; uniform vec2 uR; uniform vec3 uCenter; uniform float uPR; uniform float uSunI;
        varying vec3 vW; varying vec2 vP;
        void main(){
          float r = length(vP);
          vec4 t = texture2D(ringMap, vec2((r - uR.x) / (uR.y - uR.x), 0.5));
          vec3 L = normalize(-vW);
          // L'ombre de la planète sur les anneaux
          vec3 oc = vW - uCenter;
          float bq = dot(oc, L), cq = dot(oc, oc) - uPR * uPR;
          float h = bq * bq - cq;
          float sh = (h > 0.0 && -bq - sqrt(h) > 0.0) ? 0.06 : 1.0;
          vec3 V = normalize(cameraPosition - vW);
          float fwd = pow(max(dot(-V, L), 0.0), 6.0) * 0.6;
          gl_FragColor = vec4(t.rgb * vec3(1.0, 0.93, 0.82) * (0.8 + fwd) * sh * uSunI * 1.25, t.a * 0.92);
        }`
      })
      const ring = new T.Mesh(new T.RingGeometry(inner, outer, 256, 1), rm)
      ring.rotation.x = -Math.PI / 2
      tilt.add(ring)
      n.ring = ring
    }
    nodes[b.id] = n
  }
  for (const n of Object.values(nodes)) {
    if (n.b.parent) {
      const p = nodes[n.b.parent]
      // Les lunes tournent dans le plan de l'équateur de leur planète, sauf la
      // Lune (près de l'écliptique)
      n.orbitFrame = new T.Group()
      n.orbitFrame.rotation.x = (n.b.id === 'lune' ? n.b.inc! : p.b.tilt || 0) * D2R
      p.pos.add(n.orbitFrame)
      n.orbitFrame.add(n.pos)
    } else scene.add(n.pos)
  }
  // Les géométries partagées ne sont libérées qu'une fois
  stage.keep(sphereGeo); stage.keep(sphereGeoLo)

  /* --- Les orbites, la ceinture d'astéroïdes, les points lointains --- */
  interface OrbitLine { line: import('three').LineLoop; id: string; base: number }
  const orbitLines: OrbitLine[] = []
  const addOrbitLine = (parent: Obj3, pts: V3[], color: import('three').Color, id: string, base: number) => {
    const g = new T.BufferGeometry().setFromPoints(pts)
    const m = new T.LineBasicMaterial({ color, transparent: true, opacity: base, depthWrite: false, blending: T.AdditiveBlending })
    const line = new T.LineLoop(g, m)
    parent.add(line)
    orbitLines.push({ line, id, base })
  }
  const planetOrbitPoints = (id: string, Tc: number) => {
    const pts: V3[] = []
    const v = new T.Vector3()
    for (let i = 0; i < 360; i++) pts.push(eclToScene(keplerEcl(EL[id], Tc, (i / 360) * Math.PI * 2), v).clone())
    return pts
  }
  let orbitsT: number | null = null
  const buildOrbits = (Tc: number) => {
    for (const o of orbitLines) { o.line.removeFromParent(); o.line.geometry.dispose(); (o.line.material as import('three').Material).dispose() }
    orbitLines.length = 0
    const grey = new T.Color('#9fb3c8')
    for (const id of Object.keys(EL)) addOrbitLine(scene, planetOrbitPoints(id, Tc), new T.Color(byId[id].color).lerp(grey, 0.5), id, 0.3)
    for (const n of Object.values(nodes)) {
      if (!n.orbitFrame) continue
      const pts: V3[] = []
      for (let i = 0; i < 128; i++) { const a = i / 128 * Math.PI * 2; pts.push(new T.Vector3(Math.cos(a) * n.b.orbitR, 0, Math.sin(a) * n.b.orbitR)) }
      addOrbitLine(n.orbitFrame, pts, grey, n.b.id, 0.22)
    }
    orbitsT = Tc
  }

  const beltGeo = new T.BufferGeometry()
  {
    const N = 6000, P = new Float32Array(N * 3), S = new Float32Array(N)
    let seed = 99
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
    for (let i = 0; i < N; i++) {
      const a = 2.15 + Math.pow(rnd(), 0.8) * 1.2
      const r = distScene(a) * (1 + (rnd() - 0.5) * 0.02)
      const th = rnd() * Math.PI * 2
      const inc = (rnd() - 0.5) * 0.12
      P[i * 3] = r * Math.cos(th); P[i * 3 + 1] = r * Math.sin(inc) * (0.5 + rnd()); P[i * 3 + 2] = r * Math.sin(th)
      S[i] = 0.4 + Math.pow(rnd(), 3) * 1.6
    }
    beltGeo.setAttribute('position', new T.BufferAttribute(P, 3))
    beltGeo.setAttribute('aS', new T.BufferAttribute(S, 1))
  }
  const beltMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { uScale: { value: 1 } },
    vertexShader: `attribute float aS; uniform float uScale; varying float vA;
    void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float px = aS * uScale / -mv.z; gl_PointSize = clamp(px, 1.0, 2.5); vA = clamp(px, 0.15, 1.0) * 0.38; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard; gl_FragColor = vec4(vec3(0.78, 0.72, 0.64) * vA * (1.0 - d * 3.0), 1.0); }`
  })
  const belt = new T.Points(beltGeo, beltMat)
  scene.add(belt)

  // Quand un astre ne fait plus qu'un pixel, un point coloré le montre encore
  const spriteBodies = bodies.filter(b => b.id !== 'soleil')
  const spriteGeo = new T.BufferGeometry()
  spriteGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(spriteBodies.length * 3), 3))
  spriteGeo.setAttribute('aCol', new T.BufferAttribute(new Float32Array(spriteBodies.flatMap(b => new T.Color(b.color).toArray())), 3))
  spriteGeo.setAttribute('aVis', new T.BufferAttribute(new Float32Array(spriteBodies.length), 1))
  const spriteMat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { uPx: { value: 1 } },
    vertexShader: `attribute vec3 aCol; attribute float aVis; uniform float uPx; varying vec3 vC; varying float vV;
    void main(){ vC = aCol; vV = aVis; gl_PointSize = 5.0 * uPx; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vC; varying float vV; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = smoothstep(0.5, 0.1, d); gl_FragColor = vec4(vC * a * vV * 1.3, 1.0); }`
  })
  const sprites = new T.Points(spriteGeo, spriteMat)
  sprites.frustumCulled = false
  scene.add(sprites)

  /* --- Le temps : positions, rotations --- */
  const helioAU: Record<string, number> = {}
  const tmpV = new T.Vector3(), tmpV2 = new T.Vector3(), tmpQ = new T.Quaternion()
  function setTime(jd: number, spinJd: number) {
    const Tc = (jd - 2451545) / 36525
    const d = spinJd - 2451545
    for (const id of Object.keys(EL)) {
      const e = keplerEcl(EL[id], Tc)
      helioAU[id] = Math.hypot(e[0], e[1], e[2])
      eclToScene(e, nodes[id].pos.position)
    }
    // La Terre suit le temps sidéral : le jour et la nuit sont ceux de l'horloge
    const gmst = (280.46061837 + 360.98564736629 * d) * D2R
    for (const n of Object.values(nodes)) {
      const b = n.b
      if (b.parent) {
        const ang = (b.id === 'lune' ? 218.316 + 13.176396 * d : (b.L0 || 0) + 360 * d / b.pDays!) * D2R
        n.pos.position.set(Math.cos(ang) * b.orbitR, 0, -Math.sin(ang) * b.orbitR)
        n.spin.rotation.y = ang + Math.PI // toujours la même face vers sa planète
      } else if (b.id === 'terre') n.spin.rotation.y = gmst
      else n.spin.rotation.y = (d * 24 / b.period!) * Math.PI * 2
      if (n.clouds) n.clouds.rotation.y = d * 0.35
    }
    sunMesh.rotation.y = d / 25.38 * Math.PI * 2
    belt.rotation.y = d / 1680 * Math.PI * 2
    if (orbitsT === null || Math.abs(Tc - orbitsT) > 0.05) buildOrbits(Tc)
  }

  const worldPos = (id: string, out: V3 = new T.Vector3()) =>
    id === 'soleil' || !nodes[id] ? out.set(0, 0, 0) : nodes[id].pos.getWorldPosition(out)
  const radius = (id: string) => byId[id]?.R ?? SUN_R
  const pxPerUnit = (d: number) => renderer.domElement.clientHeight / (2 * Math.tan(camera.fov * D2R / 2) * d)
  const au = (id: string) => helioAU[byId[id]?.parent || id] || 1

  /* --- Chaque image : le Soleil qui bout, les points lointains, l'intensité
     du Soleil selon la distance, les orbites qui s'effacent de près --- */
  let simSec = 0
  function frame(dt: number) {
    simSec += dt
    sunUniforms.uTime.value = simSec
    coronaMat.uniforms.uTime.value = simSec
    corona.quaternion.copy(camera.quaternion)
    const spPos = spriteGeo.attributes.position as import('three').BufferAttribute
    const spVis = spriteGeo.attributes.aVis as import('three').BufferAttribute
    spriteBodies.forEach((b, i) => {
      const p = worldPos(b.id, tmpV)
      spPos.setXYZ(i, p.x, p.y, p.z)
      const rpx = b.R * pxPerUnit(camera.position.distanceTo(p))
      let vis = 1 - T.MathUtils.smoothstep(rpx, 1.2, 4)
      if (b.parent) vis *= 0.6
      spVis.setX(i, vis)
    })
    spPos.needsUpdate = true; spVis.needsUpdate = true
    for (const n of Object.values(nodes)) {
      const sunI = 1.35 * Math.pow(1 / au(n.b.id), 0.3)
      ;(n.mesh.material as SMat).uniforms.uSunI.value = sunI
      if (n.clouds) (n.clouds.material as SMat).uniforms.uSunI.value = sunI
      if (n.atmo) (n.atmo.material as SMat).uniforms.uSunI.value = sunI
      if (n.ring) {
        const rmu = (n.ring.material as SMat).uniforms
        rmu.uSunI.value = sunI
        const c = n.pos.getWorldPosition(tmpV2)
        rmu.uCenter.value.copy(c)
        const pmu = (n.mesh.material as SMat).uniforms
        pmu.uCenter.value.copy(c)
        pmu.uRingN.value.set(0, 1, 0).applyQuaternion(n.tilt.getWorldQuaternion(tmpQ))
      }
    }
    // Près d'un astre (le Soleil compris), les orbites des autres s'effacent :
    // vues par la tranche, elles barraient l'écran de lignes
    let closeness = Infinity
    for (const b of bodies) closeness = Math.min(closeness, camera.position.distanceTo(worldPos(b.id, tmpV)) / b.R)
    const globalFade = 0.12 + 0.88 * T.MathUtils.smoothstep(closeness, 6, 45)
    for (const o of orbitLines) {
      const b = byId[o.id]
      const d = camera.position.distanceTo(worldPos(o.id, tmpV))
      // L'orbite d'une lune s'efface quand la caméra est dedans (vue par la tranche)
      const inMoon = b.parent ? T.MathUtils.smoothstep(camera.position.distanceTo(worldPos(b.parent, tmpV2)), b.orbitR * 1.3, b.orbitR * 3) : 1
      ;(o.line.material as import('three').LineBasicMaterial).opacity = o.base * T.MathUtils.smoothstep(d, b.R * 6, b.R * 30) * (b.parent ? inMoon : globalFade)
    }
    // Le plan proche suit la caméra : on peut frôler une lune sans la couper
    let near = Infinity
    for (const b of bodies) near = Math.min(near, camera.position.distanceTo(worldPos(b.id, tmpV)) - b.R)
    camera.near = Math.max(0.0005, Math.min(20, near * 0.35))
    camera.updateProjectionMatrix()
  }

  /* --- Le toucher : l'astre le plus proche du doigt à l'écran --- */
  function pick(x: number, y: number, minTol: number) {
    const rect = renderer.domElement.getBoundingClientRect()
    let best: string | null = null, bs = Infinity
    for (const b of bodies) {
      const p = worldPos(b.id, tmpV)
      const d = camera.position.distanceTo(p)
      tmpV2.copy(p).project(camera)
      if (tmpV2.z >= 1) continue
      const sx = rect.left + (tmpV2.x * 0.5 + 0.5) * rect.width, sy = rect.top + (-tmpV2.y * 0.5 + 0.5) * rect.height
      const rpx = b.R * pxPerUnit(d)
      const dist = Math.hypot(sx - x, sy - y)
      const tol = Math.max(rpx * 1.05, minTol)
      if (dist < tol) {
        const score = dist / tol + d * 1e-6
        if (score < bs) { bs = score; best = b.id }
      }
    }
    return best
  }

  /* --- Le rendu : HDR (demi-flottants), halo en sept étages, ACES --- */
  const quadScene = new T.Scene()
  const quadCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const quadGeo = stage.keep(new T.PlaneGeometry(2, 2))
  const quad = new T.Mesh(quadGeo)
  quad.frustumCulled = false
  quadScene.add(quad)
  const QVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`
  const downMat = stage.keep(new T.ShaderMaterial({
    uniforms: { src: { value: null }, texel: { value: new T.Vector2() }, first: { value: 0 } },
    vertexShader: QVS, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D src; uniform vec2 texel; uniform int first; varying vec2 vUv;
    vec3 t(vec2 o){ vec3 v = texture2D(src, vUv + o * texel).rgb; return (any(isnan(v)) || any(isinf(v))) ? vec3(0.0) : min(v, vec3(3000.0)); }
    float lu(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    void main(){
      vec3 a=t(vec2(-2,2)),b=t(vec2(0,2)),c=t(vec2(2,2)),d=t(vec2(-2,0)),e=t(vec2(0,0)),f=t(vec2(2,0)),g=t(vec2(-2,-2)),h=t(vec2(0,-2)),i=t(vec2(2,-2));
      vec3 j=t(vec2(-1,1)),k=t(vec2(1,1)),l=t(vec2(-1,-1)),m=t(vec2(1,-1));
      vec3 r;
      if (first == 1){
        vec3 g0=(j+k+l+m)*0.25,g1=(a+b+d+e)*0.25,g2=(b+c+e+f)*0.25,g3=(d+e+g+h)*0.25,g4=(e+f+h+i)*0.25;
        float w0=0.5/(1.0+lu(g0)),w1=0.125/(1.0+lu(g1)),w2=0.125/(1.0+lu(g2)),w3=0.125/(1.0+lu(g3)),w4=0.125/(1.0+lu(g4));
        r=(g0*w0+g1*w1+g2*w2+g3*w3+g4*w4)/(w0+w1+w2+w3+w4);
      } else r = e*0.125+(a+c+g+i)*0.03125+(b+d+f+h)*0.0625+(j+k+l+m)*0.125;
      gl_FragColor = vec4(max(r, 0.0), 1.0);
    }`
  }))
  const upMat = stage.keep(new T.ShaderMaterial({
    uniforms: { src: { value: null }, texel: { value: new T.Vector2() } },
    vertexShader: QVS, depthTest: false, depthWrite: false, transparent: true, blending: T.AdditiveBlending,
    fragmentShader: `uniform sampler2D src; uniform vec2 texel; varying vec2 vUv;
    void main(){
      vec2 d = texel;
      vec3 s = texture2D(src, vUv + vec2(-d.x, d.y)).rgb + 2.0*texture2D(src, vUv + vec2(0.0, d.y)).rgb + texture2D(src, vUv + d).rgb
        + 2.0*texture2D(src, vUv + vec2(-d.x, 0.0)).rgb + 4.0*texture2D(src, vUv).rgb + 2.0*texture2D(src, vUv + vec2(d.x, 0.0)).rgb
        + texture2D(src, vUv - d).rgb + 2.0*texture2D(src, vUv + vec2(0.0, -d.y)).rgb + texture2D(src, vUv + vec2(d.x, -d.y)).rgb;
      gl_FragColor = vec4(s / 16.0, 1.0);
    }`
  }))
  const compMat = stage.keep(new T.ShaderMaterial({
    uniforms: { scene: { value: null }, bloom: { value: null }, exposure: { value: 1.0 }, bloomAmt: { value: 0.12 }, res: { value: new T.Vector2() } },
    vertexShader: QVS, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D scene; uniform sampler2D bloom; uniform float exposure; uniform float bloomAmt; uniform vec2 res; varying vec2 vUv;
    const mat3 AI = mat3(0.59719,0.07600,0.02840,0.35458,0.90834,0.13383,0.04823,0.01566,0.83777);
    const mat3 AO = mat3(1.60475,-0.10208,-0.00327,-0.53108,1.10813,-0.07276,-0.07367,-0.00605,1.07602);
    vec3 rrt(vec3 v){ vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return a/b; }
    vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
    float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){
      vec3 sc = texture2D(scene, vUv).rgb;
      if (any(isnan(sc)) || any(isinf(sc))) sc = vec3(0.0);
      vec3 c = (min(sc, vec3(3000.0)) + texture2D(bloom, vUv).rgb * bloomAmt) * exposure;
      vec2 q = (vUv - 0.5) * vec2(res.x / res.y, 1.0);
      c *= 1.0 - 0.22 * dot(q, q);
      c = srgb(clamp(AO * rrt(AI * c), 0.0, 1.0));
      c += (h12(gl_FragCoord.xy) - 0.5) / 255.0;
      gl_FragColor = vec4(c, 1.0);
    }`
  }))

  // Les demi-flottants : la tablette les accepte (WebGL2 + EXT_color_buffer_*) ;
  // sinon on retombe sur des octets (le Soleil sature, le reste est pareil)
  const halfOk = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float')
  const rtType = halfOk ? T.HalfFloatType : T.UnsignedByteType
  let msaa = true
  let rtScene: RT | null = null
  let mips: RT[] = []
  const size = new T.Vector2()
  function resize() {
    renderer.getDrawingBufferSize(size)
    const W = Math.max(1, size.x), H = Math.max(1, size.y)
    rtScene?.dispose()
    mips.forEach(m => m.dispose())
    const opts = { type: rtType, format: T.RGBAFormat, minFilter: T.LinearFilter, magFilter: T.LinearFilter, depthBuffer: false }
    rtScene = new T.WebGLRenderTarget(W, H, { ...opts, depthBuffer: true, samples: msaa ? 4 : 0 })
    mips = []
    let mw = W, mh = H
    for (let i = 0; i < 7; i++) { mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); mips.push(new T.WebGLRenderTarget(mw, mh, opts)) }
    compMat.uniforms.res.value.set(W, H)
    const cssH = Math.max(1, renderer.domElement.clientHeight)
    skyMat.uniforms.uPix.value = 2 * Math.tan(camera.fov * D2R / 2) / H
    spriteMat.uniforms.uPx.value = cosmos.pixelRatio
    beltMat.uniforms.uScale.value = cssH * cosmos.pixelRatio * 0.9
  }
  const runQuad = (mat: SMat, target: RT | null) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam) }
  function render() {
    if (!rtScene) resize()
    skyCam.quaternion.copy(camera.quaternion)
    skyCam.fov = camera.fov
    skyCam.aspect = camera.aspect
    skyCam.updateProjectionMatrix()
    renderer.setRenderTarget(rtScene)
    renderer.setClearColor(0x000000, 1)
    renderer.clear(true, true, true)
    renderer.render(skyScene, skyCam)
    renderer.clearDepth()
    renderer.render(scene, camera)
    let src = rtScene!
    for (let i = 0; i < mips.length; i++) {
      downMat.uniforms.src.value = src.texture
      downMat.uniforms.texel.value.set(1 / src.width, 1 / src.height)
      downMat.uniforms.first.value = i === 0 ? 1 : 0
      runQuad(downMat, mips[i])
      src = mips[i]
    }
    for (let i = mips.length - 1; i > 0; i--) {
      upMat.uniforms.src.value = mips[i].texture
      upMat.uniforms.texel.value.set(1 / mips[i - 1].width, 1 / mips[i - 1].height)
      runQuad(upMat, mips[i - 1])
    }
    compMat.uniforms.scene.value = rtScene!.texture
    compMat.uniforms.bloom.value = mips[0].texture
    runQuad(compMat, null)
  }

  const cosmos: Cosmos = {
    bodies, byId, light, setTime, frame, worldPos, radius, au, pick, pxPerUnit, render, resize,
    pixelRatio: renderer.getPixelRatio(),
    setPixelRatio(pr) {
      cosmos.pixelRatio = pr
      renderer.setPixelRatio(pr)
      resize()
    },
    setMsaa(on) { if (msaa !== on) { msaa = on; resize() } },
    dispose() {
      rtScene?.dispose()
      mips.forEach(m => m.dispose())
      for (const o of orbitLines) { o.line.geometry.dispose(); (o.line.material as import('three').Material).dispose() }
    }
  }
  return cosmos
}
