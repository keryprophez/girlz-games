import type { T3 } from './three3d'
import type { Clip, Paint, Part, Pattern, Royal } from './royal'
import { cloneRoyal } from './royal'

/* LA PRINCESSE en 3D (27/09, refaite le soir même) — la première, construite
   en formes rondes, faisait « pantin de bois de 1950 » : la tête était une
   sphère au visage peint. Elle est maintenant un vrai personnage modélisé
   par des professionnels : la jeune fille de démonstration de pixiv
   (VRM1_Constraint_Twist_Sample, © 2022 pixiv Inc., licence VRM Public
   License 1.0 : modification et redistribution autorisées, crédit non
   exigé — crédité quand même dans CREDITS.md), allégée (textures réduites)
   dans `public/assets/princess/princesse.vrm`, chargée à la demande par
   `@pixiv/three-vrm`.

   Ce qu'elle apporte : un vrai visage et 18 expressions (joie, surprise,
   clignements…), des yeux qui suivent le doigt, un squelette pour danser,
   des cheveux qui ondulent (ressorts). Ce qu'on lui met par-dessus reste à
   nous : les HABITS sont construits ici, ajustés à son corps mesuré, et le
   corsage, les manches et les bottes sont LIÉS À SON SQUELETTE (poids
   recopiés du corps le plus proche) : ils suivent ses gestes. Le reste
   (jupes, cape, ailes, couronne, bijoux, objet) est accroché à un os.

   Le TISSU MAGIQUE (`dye`) n'a pas changé : couleur + motif dans un shader,
   la teinture part du doigt. Ses cheveux, ses yeux et sa peau se
   recolorent sur ses propres matériaux (textures passées en gris, puis
   teintées). Origine aux pieds, regard vers +z, hauteur HEIGHT. */

type Obj3 = import('three').Object3D
type Grp = import('three').Group
type Geo = import('three').BufferGeometry
type Mat = import('three').Material
type Tex = import('three').Texture
type V3 = import('three').Vector3
export type Merge = (g: Geo[], groups?: boolean) => Geo | null

/** Sa taille (unités de la scène) : un peu plus grande que la poupée d'avant. */
export const HEIGHT = 1.1
/** Assombrissement des tissus sous hemi + soleil + IBL. */
const DIM = 0.74

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const luma = (hex: string) => { const [r, g, b] = rgb(hex); return (r * 0.3 + g * 0.59 + b * 0.11) / 255 }

function canvas(w: number, h: number) {
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  return cv
}

/* =====================================================================
   Le tissu magique
   ===================================================================== */

/** Les motifs : un masque alpha qu'on répète sur la pièce. Partagés par
    toutes les princesses (jamais libérés : six petites images). */
const masks = new Map<Pattern, Tex>()
function patternMask(T: T3, p: Pattern): Tex {
  let t = masks.get(p)
  if (t) return t
  const S = 256
  const cv = canvas(S, S)
  const g = cv.getContext('2d')!
  g.fillStyle = '#fff'
  const star = (x: number, y: number, r: number) => {
    g.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
    }
    g.fill()
  }
  const heart = (x: number, y: number, r: number) => {
    g.beginPath()
    g.moveTo(x, y + r * 0.9)
    g.bezierCurveTo(x - r * 1.4, y - r * 0.2, x - r * 0.6, y - r * 1.2, x, y - r * 0.4)
    g.bezierCurveTo(x + r * 0.6, y - r * 1.2, x + r * 1.4, y - r * 0.2, x, y + r * 0.9)
    g.fill()
  }
  const flower = (x: number, y: number, r: number) => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      g.beginPath(); g.arc(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.45, 0, Math.PI * 2); g.fill()
    }
    g.globalCompositeOperation = 'destination-out'
    g.beginPath(); g.arc(x, y, r * 0.28, 0, Math.PI * 2); g.fill()
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 0.6
    g.beginPath(); g.arc(x, y, r * 0.22, 0, Math.PI * 2); g.fill()
    g.globalAlpha = 1
  }
  const cells: [number, number][] = [[0.25, 0.25], [0.75, 0.75]]
  if (p === 'sparkle') {
    let s = 5
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
    for (let i = 0; i < 260; i++) {
      g.globalAlpha = 0.35 + rnd() * 0.65
      g.beginPath(); g.arc(rnd() * S, rnd() * S, 1 + rnd() * 2.6, 0, Math.PI * 2); g.fill()
    }
    g.globalAlpha = 1
  } else {
    for (const [u, v] of cells) {
      const x = u * S, y = v * S
      if (p === 'stars') star(x, y, 24)
      else if (p === 'hearts') heart(x, y, 22)
      else if (p === 'flowers') flower(x, y, 30)
      else if (p === 'dots') { g.beginPath(); g.arc(x, y, 17, 0, Math.PI * 2); g.fill() }
    }
  }
  t = new T.CanvasTexture(cv)
  t.wrapS = t.wrapT = T.RepeatWrapping
  t.anisotropy = 4
  masks.set(p, t)
  return t
}

/** La couleur du motif sur un fond donné : doré ou blanc, qui se voit. */
function motifColor(p: Pattern, base: string): string {
  const light = luma(base) > 0.72
  if (p === 'stars') return light ? '#D9A93A' : '#F8DC84'
  if (p === 'hearts') return light ? '#E0607E' : '#FFF0F4'
  if (p === 'flowers') return light ? '#E88AAE' : '#FFFFFF'
  if (p === 'sparkle') return light ? '#E6C160' : '#FFFFFF'
  return light ? '#C8A0D8' : '#FFFFFF'
}

export interface Fabric {
  mat: import('three').MeshStandardMaterial
  paint: Paint
  /** Change tout de suite (sans vague). */
  set(p: Paint): void
  /** La teinture : la nouvelle peinture se répand depuis `at` (monde). */
  dye(p: Paint, at: V3): void
  /** true tant que la vague court. */
  update(dt: number): boolean
  dispose(): void
}

export interface FabricOpts {
  /** Satin : brillance douce (sheen) — robe, cape. */
  satin?: boolean
  /** Verni : chaussures, rubans. */
  gloss?: boolean
  /** Tulle ou ailes : transparent. */
  opacity?: number
  iridescent?: boolean
  side2?: boolean
  repeat?: [number, number]
  /** Une texture de base multipliée (les mèches des cheveux). */
  map?: Tex
  bump?: Tex
  roughness?: number
  /** Qualité basse : MeshStandard (tablette qui peine). */
  low?: boolean
}

export function fabric(T: T3, paint: Paint, o: FabricOpts = {}): Fabric {
  const physical = !o.low && (o.satin || o.gloss || o.iridescent)
  const common = {
    color: 0xffffff, roughness: o.roughness ?? (o.gloss ? 0.3 : 0.55), metalness: 0,
    map: o.map ?? null, bumpMap: o.bump ?? null, bumpScale: o.bump ? 1.2 : 1,
    transparent: o.opacity !== undefined, opacity: o.opacity ?? 1,
    side: o.side2 ? T.DoubleSide : T.FrontSide, depthWrite: o.opacity === undefined || o.opacity > 0.9
  }
  const mat: import('three').MeshStandardMaterial = physical
    ? new T.MeshPhysicalMaterial({
      ...common,
      sheen: o.satin ? 1 : 0, sheenRoughness: 0.35, sheenColor: new T.Color(0xffffff),
      clearcoat: o.gloss ? 0.8 : 0, clearcoatRoughness: 0.2,
      iridescence: o.iridescent ? 1 : 0, iridescenceIOR: 1.6
    })
    : new T.MeshStandardMaterial(common)
  mat.color.multiplyScalar(DIM)
  const U = {
    uCol0: { value: new T.Color(paint.c) }, uCol1: { value: new T.Color(paint.c) },
    uMot0: { value: new T.Color(motifColor(paint.p, paint.c)) }, uMot1: { value: new T.Color(motifColor(paint.p, paint.c)) },
    uPat0: { value: patternMask(T, paint.p === 'none' ? 'dots' : paint.p) }, uPat1: { value: patternMask(T, paint.p === 'none' ? 'dots' : paint.p) },
    uOn0: { value: paint.p === 'none' ? 0 : 1 }, uOn1: { value: paint.p === 'none' ? 0 : 1 },
    uWaveO: { value: new T.Vector3() }, uWaveR: { value: -1 },
    uRep: { value: new T.Vector2(...(o.repeat ?? [6, 4])) }
  }
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U)
    sh.vertexShader = 'varying vec3 vFabW;\nvarying vec2 vFabUv;\nuniform vec2 uRep;\n' + sh.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\n  vFabW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vFabUv = uv * uRep;')
    sh.fragmentShader = `varying vec3 vFabW;\nvarying vec2 vFabUv;
uniform vec3 uCol0; uniform vec3 uCol1; uniform vec3 uMot0; uniform vec3 uMot1;
uniform sampler2D uPat0; uniform sampler2D uPat1; uniform float uOn0; uniform float uOn1;
uniform vec3 uWaveO; uniform float uWaveR;
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  float fabD = distance(vFabW, uWaveO);
  float fabIn = uWaveR < 0.0 ? 0.0 : step(fabD, uWaveR);
  vec3 fabBase = mix(mix(uCol0, uMot0, texture2D(uPat0, vFabUv).a * uOn0), mix(uCol1, uMot1, texture2D(uPat1, vFabUv).a * uOn1), fabIn);
  diffuseColor.rgb *= fabBase;
  float fabFront = uWaveR < 0.0 ? 0.0 : (1.0 - smoothstep(0.0, 0.03, abs(fabD - uWaveR)));`).replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
  totalEmissiveRadiance += vec3(1.0, 0.86, 0.55) * fabFront * 1.6;`)
  }
  mat.customProgramCacheKey = () => 'fabric' + (o.map ? 'm' : '') + (o.bump ? 'b' : '')
  const setSheen = () => {
    const m = mat as import('three').MeshPhysicalMaterial
    if (m.sheenColor) m.sheenColor.set(0xffffff).lerp(new T.Color(f.paint.c), 0.45)
  }
  const load = (i: 0 | 1, p: Paint) => {
    ;(U[i ? 'uCol1' : 'uCol0'].value as import('three').Color).set(p.c)
    ;(U[i ? 'uMot1' : 'uMot0'].value as import('three').Color).set(motifColor(p.p, p.c))
    U[i ? 'uPat1' : 'uPat0'].value = patternMask(T, p.p === 'none' ? 'dots' : p.p)
    U[i ? 'uOn1' : 'uOn0'].value = p.p === 'none' ? 0 : 1
  }
  let speed = 0
  const f: Fabric = {
    mat, paint: { ...paint },
    set(p) {
      f.paint = { ...p }
      load(0, p); load(1, p)
      U.uWaveR.value = -1
      setSheen()
    },
    dye(p, at) {
      // Une vague déjà en route : on la termine d'un coup
      if (U.uWaveR.value >= 0) load(0, f.paint)
      f.paint = { ...p }
      load(1, p)
      U.uWaveO.value.copy(at)
      U.uWaveR.value = 0
      speed = 0.25
    },
    update(dt) {
      if (U.uWaveR.value < 0) return false
      speed = Math.min(1.6, speed + dt * 2.2)
      U.uWaveR.value += speed * dt
      if (U.uWaveR.value > 2.2) { load(0, f.paint); U.uWaveR.value = -1; setSheen(); return false }
      return true
    },
    dispose() { mat.dispose() }
  }
  setSheen()
  return f
}

/* =====================================================================
   Géométries
   ===================================================================== */

/** Un profil au tour (rayon, hauteur), écrit DU BAS VERS LE HAUT (normales dehors). */
export function lathe(T: T3, pts: number[][], segs = 48, phi0 = 0, phiLen = Math.PI * 2) {
  return new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), segs, phi0, phiLen)
}

/** De vrais plis : le rayon ondule autour de l'axe, de plus en plus vers le bas. */
export function folds(geo: Geo, n: number, amp: number, top: number, bottom = 0) {
  const p = geo.attributes.position as import('three').BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const a = Math.atan2(x, z)
    const k = Math.pow(clamp((top - y) / (top - bottom), 0, 1), 0.9)
    const f = 1 + amp * k * (Math.sin(a * n) * 0.7 + Math.sin(a * n * 0.5 + 1.3) * 0.3)
    p.setXYZ(i, x * f, y, z * f)
  }
  geo.computeVertexNormals()
  return geo
}

/** Une mèche : un ruban effilé le long d'une courbe, aplati contre la tête
    ou le dos (le « dehors » est pris depuis `axis`). */
export function lockGeo(T: T3, pts: V3[], w0: number, w1: number, flat: number, axis: V3, seg = 26, rad = 8): Geo {
  const curve = new T.CatmullRomCurve3(pts, false, 'catmullrom', 0.5)
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  const tan = new T.Vector3(), nrm = new T.Vector3(), bin = new T.Vector3(), p = new T.Vector3(), out = new T.Vector3()
  for (let i = 0; i <= seg; i++) {
    const t = i / seg
    curve.getPointAt(t, p)
    curve.getTangentAt(t, tan)
    out.set(p.x - axis.x, 0, p.z - axis.z)
    if (p.y > axis.y) out.y = (p.y - axis.y) * 0.6
    if (out.lengthSq() < 1e-8) out.set(0, 0, -1)
    out.normalize()
    nrm.copy(out).addScaledVector(tan, -out.dot(tan))
    if (nrm.lengthSq() < 1e-8) nrm.set(0, 0, -1)
    nrm.normalize()
    bin.crossVectors(tan, nrm).normalize()
    const w = (w0 + (w1 - w0) * t) * (t > 0.65 ? Math.pow(Math.max(0, 1 - (t - 0.65) / 0.35), 0.7) * 0.97 + 0.03 : 1) * (t < 0.08 ? 0.4 + t * 7.5 : 1)
    for (let j = 0; j <= rad; j++) {
      const a = (j / rad) * Math.PI * 2
      const cx = Math.cos(a) * w, cy = Math.sin(a) * w * flat
      pos.push(p.x + bin.x * cx + nrm.x * cy, p.y + bin.y * cx + nrm.y * cy, p.z + bin.z * cx + nrm.z * cy)
      uv.push(j / rad, 1 - t)
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) {
    const a = i * (rad + 1) + j, b = a + rad + 1
    idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
  const geo = new T.BufferGeometry()
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}


/* =====================================================================
   Le modèle : chargé une fois (octets), une instance par princesse
   ===================================================================== */

type VRM = import('@pixiv/three-vrm').VRM
type BoneName = import('@pixiv/three-vrm').VRMHumanBoneName
type SMesh = import('three').SkinnedMesh
type M4 = import('three').Matrix4

let bytes: Promise<ArrayBuffer> | null = null
const vrmUrl = () => `${import.meta.env.BASE_URL}assets/princess/princesse.vrm`

async function loadVrm(): Promise<VRM> {
  const [{ GLTFLoader }, { VRMLoaderPlugin, VRMUtils }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('@pixiv/three-vrm')
  ])
  bytes ??= fetch(vrmUrl()).then(r => { if (!r.ok) throw new Error('princesse.vrm ' + r.status); return r.arrayBuffer() })
  let buf: ArrayBuffer
  try { buf = await bytes } catch (e) { bytes = null; throw e }
  const loader = new GLTFLoader()
  loader.register(p => new VRMLoaderPlugin(p))
  const gltf = await loader.parseAsync(buf.slice(0), '')
  const vrm = gltf.userData.vrm as VRM
  VRMUtils.removeUnnecessaryVertices(gltf.scene)
  return vrm
}

/** Le nom de matériau d'un maillage (ses primitives sont des maillages séparés). */
const matName = (m: import('three').Mesh) => {
  const x = Array.isArray(m.material) ? m.material[0] : m.material
  return x?.name || ''
}

/* ---- Textures recolorables : la texture passe en gris (contrastes gardés),
   la couleur voulue vient multiplier ---- */
const grays = new WeakMap<object, Tex>()
function grayOf(T: T3, src: Tex, lo = 0.5): Tex {
  const hit = grays.get(src)
  if (hit) return hit
  const im = src.image as CanvasImageSource & { width: number; height: number }
  const cv = canvas(im.width, im.height)
  const g = cv.getContext('2d')!
  g.drawImage(im, 0, 0)
  const d = g.getImageData(0, 0, cv.width, cv.height)
  let mn = 255, mx = 0
  for (let i = 0; i < d.data.length; i += 16) {
    if (d.data[i + 3] < 40) continue
    const l = d.data[i] * 0.3 + d.data[i + 1] * 0.59 + d.data[i + 2] * 0.11
    if (l < mn) mn = l
    if (l > mx) mx = l
  }
  const span = Math.max(1, mx - mn)
  for (let i = 0; i < d.data.length; i += 4) {
    const l = d.data[i] * 0.3 + d.data[i + 1] * 0.59 + d.data[i + 2] * 0.11
    const v = Math.round(255 * (lo + (1 - lo) * clamp((l - mn) / span, 0, 1)))
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v
  }
  g.putImageData(d, 0, 0)
  const t = new T.CanvasTexture(cv)
  t.flipY = src.flipY
  t.colorSpace = T.SRGBColorSpace
  t.wrapS = src.wrapS; t.wrapT = src.wrapT
  t.anisotropy = 4
  grays.set(src, t)
  return t
}

/** Les iris en cœurs roses (quand elle est amoureuse) : même atlas, un cœur
    peint au centre de chaque iris (trouvés d'après les UV du maillage). */
function heartIris(T: T3, src: Tex, centers: { u: number; v: number; r: number }[]): Tex {
  const im = src.image as CanvasImageSource & { width: number; height: number }
  const cv = canvas(im.width, im.height)
  const g = cv.getContext('2d')!
  g.drawImage(im, 0, 0)
  for (const c of centers) {
    const x = c.u * cv.width, y = (src.flipY ? 1 - c.v : c.v) * cv.height, r = c.r * cv.width * 0.9
    g.fillStyle = '#E2457A'
    g.beginPath()
    g.moveTo(x, y + r * 0.9)
    g.bezierCurveTo(x - r * 1.5, y - r * 0.15, x - r * 0.7, y - r * 1.25, x, y - r * 0.45)
    g.bezierCurveTo(x + r * 0.7, y - r * 1.25, x + r * 1.5, y - r * 0.15, x, y + r * 0.9)
    g.fill()
    g.fillStyle = 'rgba(255,255,255,.85)'
    g.beginPath(); g.arc(x - r * 0.4, y - r * 0.4, r * 0.2, 0, Math.PI * 2); g.fill()
  }
  const t = new T.CanvasTexture(cv)
  t.flipY = src.flipY
  t.colorSpace = T.SRGBColorSpace
  return t
}

/* =====================================================================
   Le visage : ses vraies expressions, ses yeux qui suivent le doigt
   ===================================================================== */

export type Expr = 'neutral' | 'joy' | 'love' | 'laugh' | 'wink' | 'kiss' | 'wow' | 'funny' | 'sleepy'

export interface Face {
  expr(e: Expr, seconds?: number): void
  /** Regarder un point du monde (le doigt), ou droit devant (null). */
  lookAt(p: V3 | null): void
  current(): Expr
  update(dt: number): void
  redraw(): void
  dispose(): void
}

type Weights = Partial<Record<string, number>>
const EXPR: Record<Expr, Weights> = {
  neutral: { relaxed: 0.15 },
  joy: { happy: 0.85, aa: 0.25 },
  love: { relaxed: 0.55, happy: 0.2 },
  laugh: { happy: 1, aa: 0.6 },
  wink: { blinkLeft: 1, happy: 0.3 },
  kiss: { ou: 0.9, blink: 0.75 },
  wow: { surprised: 0.9, oh: 0.35 },
  funny: { blinkRight: 1, ee: 0.55, happy: 0.25 },
  sleepy: { blink: 0.55, relaxed: 0.5 }
}
const CHANNELS = ['relaxed', 'happy', 'aa', 'ee', 'oh', 'ou', 'blink', 'blinkLeft', 'blinkRight', 'surprised']

function makeFace(T: T3, vrm: VRM, iris: { mats: import('@pixiv/three-vrm').MToonMaterial[]; normal: Tex | null; heart: Tex | null; tint: import('three').Color }, live: boolean): Face {
  const em = vrm.expressionManager
  let expr: Expr = 'neutral', left = 0, t = 0
  let blinkIn = 1.5 + Math.random() * 2, blinkT = -1
  const w: Record<string, number> = {}
  CHANNELS.forEach(c => { w[c] = 0 })
  const target = new T.Object3D()
  const ahead = new T.Object3D()
  let tracking = false
  const head = vrm.humanoid.getRawBoneNode('head')
  if (head) { ahead.position.set(0, 0.05, 2); head.add(ahead) }
  if (vrm.lookAt) { vrm.lookAt.autoUpdate = true; vrm.lookAt.target = ahead }
  const apply = (snap: boolean, dt: number) => {
    const goal: Weights = { ...EXPR[expr] }
    if (expr === 'laugh') goal.aa = 0.35 + 0.35 * Math.abs(Math.sin(t * 11))
    // Clignement (pas quand les yeux sont déjà fermés de joie)
    const closed = (goal.happy ?? 0) > 0.6 || (goal.blink ?? 0) > 0.5 || (goal.blinkLeft ?? 0) > 0.5 || (goal.blinkRight ?? 0) > 0.5
    if (blinkT >= 0 && !closed) {
      const k = blinkT / 0.15
      goal.blink = Math.max(goal.blink ?? 0, k < 0.5 ? k * 2 : Math.max(0, 2 - k * 2))
    }
    for (const c of CHANNELS) {
      const g = goal[c] ?? 0
      w[c] = snap ? g : w[c] + (g - w[c]) * Math.min(1, dt * (c.startsWith('blink') ? 30 : 10))
      em?.setValue(c, w[c])
    }
    // Amoureuse : des cœurs roses à la place des iris (pas teintés de la couleur des yeux)
    const love = expr === 'love' && !!iris.heart
    for (const m of iris.mats) {
      const want = love ? iris.heart : iris.normal
      if (want && m.map !== want) { m.map = want; m.needsUpdate = true }
      if (love) m.color.setRGB(1, 1, 1); else m.color.copy(iris.tint)
    }
  }
  apply(true, 0)
  return {
    expr(e, seconds = 2) { expr = e; left = e === 'neutral' ? 0 : seconds; if (!live) apply(true, 0) },
    lookAt(p) {
      if (!vrm.lookAt) return
      if (p) { target.position.copy(p); vrm.lookAt.target = target; tracking = true }
      else if (tracking) { vrm.lookAt.target = ahead; tracking = false }
    },
    current: () => expr,
    update(dt) {
      t += dt
      if (left > 0) { left -= dt; if (left <= 0) expr = 'neutral' }
      if (blinkT < 0) { blinkIn -= dt; if (blinkIn < 0 && live) { blinkT = 0; blinkIn = 2 + Math.random() * 3 } }
      else { blinkT += dt; if (blinkT > 0.15) blinkT = -1 }
      apply(!live, dt)
    },
    redraw() { apply(true, 0) },
    dispose() { ahead.removeFromParent() }
  }
}

/* =====================================================================
   Le personnage
   ===================================================================== */

export interface PoseState {
  bounce: number; lean: number; sway: number
  headX: number; headY: number; headZ: number
  armL: number; armLf: number; elbowL: number
  armR: number; armRf: number; elbowR: number
  legL: number; legR: number; kneeL: number; kneeR: number
  skirtYaw: number; flare: number; wings: number
}
const restPose = (): PoseState => ({
  bounce: 0, lean: 0, sway: 0, headX: 0, headY: 0, headZ: 0,
  armL: 0.12, armLf: 0, elbowL: 0.25, armR: 0.12, armRf: 0, elbowR: 0.25,
  legL: 0, legR: 0, kneeL: 0, kneeR: 0, skirtYaw: 0, flare: 0, wings: 0
})

export interface Princess {
  obj: Grp
  /** Tout le corps : pirouettes (rotation Y) et petits sauts. */
  rig: Grp
  /** Le centre de la tête, axes de la scène (barrettes, papillon, regard). */
  head: Grp
  /** Hauteur du centre de la tête, au repos. */
  headY: number
  /** Pivot de la jupe (à la taille) : elle tourne et s'évase dans les pirouettes. */
  skirt: Grp
  wings: Grp
  face: Face
  look: Royal
  pose: PoseState
  /** Évasement de la jupe, 0..1 (pirouettes). */
  flare: number
  set(r: Royal): void
  dye(part: Part, paint: Paint, at: V3): void
  partOf(o: Obj3): Part | 'face' | 'skin' | 'deco' | null
  update(dt: number): void
  dispose(): void
}

export async function merger(): Promise<Merge> {
  if (!mergeFn) {
    const m = await import('three/examples/jsm/utils/BufferGeometryUtils.js')
    mergeFn = m.mergeGeometries as Merge
  }
  return mergeFn
}
let mergeFn: Merge | null = null

interface Section { group: Grp; geos: Geo[]; mats: Mat[] }

/** Les pièces de tissu et leur réglage de rendu. */
const FABRIC_OPTS: Record<Part, FabricOpts> = {
  hair: {},
  bodice: { satin: true, repeat: [6, 3] },
  sleeves: { satin: true, repeat: [4, 3] },
  skirt: { satin: true, repeat: [12, 5], side2: true },
  under: { satin: true, repeat: [12, 5], side2: true },
  belt: { gloss: true, repeat: [8, 1] },
  shoes: { gloss: true, repeat: [3, 3] },
  cape: { satin: true, repeat: [10, 6], side2: true },
  wings: { iridescent: true, opacity: 0.8, side2: true, repeat: [3, 3], roughness: 0.2 },
  pbody: {}, pmane: {}, pbow: {}
}

/** Les options du rendu. `live` : visage animé (le jeu) ; sinon figé (portraits). */
export interface PrincessOpts { live?: boolean; low?: boolean }

/** Sa peau d'origine (texture) : on la teinte par rapport à elle. */
const BASE_SKIN = [0.98, 0.9, 0.85]

export async function makePrincess(T: T3, look0: Royal, o: PrincessOpts = {}): Promise<Princess> {
  const merge = await merger()
  const vrm = await loadVrm()
  let look = cloneRoyal(look0)
  const live = o.live !== false
  const own: { geos: Geo[]; mats: Mat[]; texs: Tex[] } = { geos: [], mats: [], texs: [] }
  const g = <G extends Geo>(x: G) => { own.geos.push(x); return x }
  const std = (p: import('three').MeshStandardMaterialParameters, dim = 1) => {
    const m = new T.MeshStandardMaterial(p)
    if (dim !== 1) m.color.multiplyScalar(dim)
    own.mats.push(m)
    return m
  }
  const phys = (p: import('three').MeshPhysicalMaterialParameters) => { const m = new T.MeshPhysicalMaterial(p); own.mats.push(m); return m }
  const V = (x: number, y: number, z: number) => new T.Vector3(x, y, z)

  /* --- Mise en place : à l'échelle, ses habits d'origine cachés --- */
  const obj = new T.Group()
  const rig = new T.Group()
  obj.add(rig)
  const root = vrm.scene
  rig.add(root)
  root.updateMatrixWorld(true)
  const box0 = new T.Box3().setFromObject(root)
  const k = HEIGHT / (box0.max.y - box0.min.y)
  root.scale.setScalar(k)
  root.position.y = -box0.min.y * k
  const meshes: import('three').Mesh[] = []
  root.traverse(x => { const m = x as import('three').Mesh; if (m.isMesh) meshes.push(m) })
  const byMat = (re: RegExp) => meshes.filter(m => re.test(matName(m)))
  const tops = byMat(/Tops/), bottoms = byMat(/Bottoms/), shoesM = byMat(/Shoes/)
  const hairBack = byMat(/HairBack/), hairFront = byMat(/^Hair_/)
  const skinBody = byMat(/Body_00_SKIN/), skinFace = byMat(/Face_00_SKIN/)
  const irisM = byMat(/EyeIris/)
  for (const m of [...tops, ...bottoms]) m.visible = false
  meshes.forEach(m => {
    m.frustumCulled = false
    m.castShadow = true
    const n = matName(m)
    m.userData.part = /HAIR/.test(n) ? 'hair' : /Face|Eye/.test(n) ? 'face' : /Shoes/.test(n) ? 'shoes' : 'skin'
    // Les traits du visage (yeux, sourcils, bouche) : le coloriage les garde en noir
    m.userData.feature = /Eye|Mouth|Brow/.test(n)
  })
  obj.updateMatrixWorld(true)
  vrm.springBoneManager?.setInitState()

  const hb = vrm.humanoid
  const raw = (n: BoneName) => hb.getRawBoneNode(n)!
  const nb = (n: BoneName) => hb.getNormalizedBoneNode(n)
  const wpos = (n: BoneName) => raw(n).getWorldPosition(new T.Vector3())
  /** Les matrices « monde » des os AU REPOS (le monde = le repère de la princesse). */
  const rest = new Map<string, M4>()
  for (const n of ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'rightHand', 'leftLowerLeg', 'rightLowerLeg'] as BoneName[]) {
    const b = hb.getRawBoneNode(n)
    if (b) rest.set(n, b.matrixWorld.clone())
  }
  const P = {
    hips: wpos('hips'), spine: wpos('spine'), chest: wpos('chest'), neck: wpos('neck'), head: wpos('head'),
    lua: wpos('leftUpperArm'), rua: wpos('rightUpperArm'), lla: wpos('leftLowerArm'), lh: wpos('leftHand'),
    lleg: wpos('leftUpperLeg'), lknee: wpos('leftLowerLeg'), lfoot: wpos('leftFoot'),
    // Le centre de chaque œil, d'après ses iris (ses os d'yeux sont près du nez)
    leye: V(0, 0, 0), reye: V(0, 0, 0)
  }
  for (const [sd, out] of [[1, P.leye], [-1, P.reye]] as [number, V3][]) {
    const b = new T.Box3(), v = new T.Vector3()
    for (const m of irisM) {
      const p = m.geometry.attributes.position as import('three').BufferAttribute
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); if (v.x * sd > 0) b.expandByPoint(v) }
    }
    out.copy(b.isEmpty() ? wpos(sd > 0 ? 'leftEye' : 'rightEye') : b.getCenter(v))
  }
  /** Le visage : sa boîte donne le centre et le rayon de la tête ; les cheveux, le sommet. */
  const faceBox = new T.Box3()
  skinFace.forEach(m => faceBox.expandByObject(m))
  const hairBox = new T.Box3()
  hairFront.forEach(m => hairBox.expandByObject(m))
  const HR = (faceBox.max.x - faceBox.min.x) / 2
  const HC = V(0, (faceBox.min.y + faceBox.max.y) / 2 + HR * 0.12, (faceBox.min.z + faceBox.max.z) / 2 - HR * 0.15)
  const hairTop = hairBox.max.y

  /* --- Le profil de son buste (peau, et tee-shirt caché là où la peau manque) --- */
  const prof = new Map<number, { x: number; zf: number; zb: number }>()
  const slice = (y: number) => Math.round(y * 100)
  const sampleInto = (list: import('three').Mesh[], onlyMissing: boolean) => {
    for (const m of list) {
      const p = m.geometry.attributes.position as import('three').BufferAttribute
      const v = new T.Vector3()
      const add = new Map<number, { x: number; zf: number; zb: number }>()
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld)
        if (Math.abs(v.x) > 0.13 || v.y < 0.45 || v.y > 0.9) continue
        const key = slice(v.y)
        const r = add.get(key) || { x: 0, zf: 0, zb: 0 }
        r.x = Math.max(r.x, Math.abs(v.x)); if (v.z > 0) r.zf = Math.max(r.zf, v.z); else r.zb = Math.max(r.zb, -v.z)
        add.set(key, r)
      }
      for (const [key, r] of add) if (!onlyMissing || !prof.has(key)) prof.set(key, r)
    }
  }
  sampleInto(skinBody, false)
  sampleInto(tops, true)
  /** Le buste à la hauteur y (unités de la scène), lissé sur trois tranches. */
  const bust = (y: number) => {
    const out = { x: 0, zf: 0, zb: 0 }
    let n = 0
    for (let d = -2; d <= 2; d++) {
      const r = prof.get(slice(y) + d)
      if (!r) continue
      out.x += r.x; out.zf += r.zf; out.zb += r.zb; n++
    }
    return n ? { x: out.x / n, zf: out.zf / n, zb: out.zb / n } : { x: 0.08, zf: 0.06, zb: 0.05 }
  }

  /* --- Les poids du corps, pour lier les habits à son squelette --- */
  const skinMesh = skinBody[0] as SMesh
  const srcPos: number[] = [], srcIdx: number[] = [], srcW: number[] = []
  for (const m of [...skinBody, ...tops] as SMesh[]) {
    const p = m.geometry.attributes.position as import('three').BufferAttribute
    const si = m.geometry.attributes.skinIndex as import('three').BufferAttribute
    const sw = m.geometry.attributes.skinWeight as import('three').BufferAttribute
    if (!si || !sw) continue
    const v = new T.Vector3()
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld)
      srcPos.push(v.x, v.y, v.z)
      srcIdx.push(si.getX(i), si.getY(i), si.getZ(i), si.getW(i))
      srcW.push(sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i))
    }
  }
  const CELL = 0.03
  const grid = new Map<string, number[]>()
  const ck = (x: number, y: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`
  for (let i = 0; i < srcPos.length / 3; i++) {
    const key = ck(srcPos[i * 3], srcPos[i * 3 + 1], srcPos[i * 3 + 2])
    let l = grid.get(key)
    if (!l) { l = []; grid.set(key, l) }
    l.push(i)
  }
  const nearest = (x: number, y: number, z: number) => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), cz = Math.floor(z / CELL)
    for (let r = 1; r <= 6; r++) {
      let best = -1, bd = Infinity
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        const l = grid.get(`${cx + dx},${cy + dy},${cz + dz}`)
        if (!l) continue
        for (const i of l) {
          const d = (srcPos[i * 3] - x) ** 2 + (srcPos[i * 3 + 1] - y) ** 2 + (srcPos[i * 3 + 2] - z) ** 2
          if (d < bd) { bd = d; best = i }
        }
      }
      if (best >= 0) return best
    }
    return 0
  }
  /* Du repère de la princesse (au repos) à celui de la liaison : l'inverse
     de ce que fait le squelette au repos (os × inverse de liaison × liaison). */
  const sk = skinMesh.skeleton
  const bi = Math.max(0, sk.bones.indexOf(raw('hips') as import('three').Bone))
  const toBody = new T.Matrix4().multiplyMatrices(sk.bones[bi].matrixWorld, sk.boneInverses[bi]).multiply(skinMesh.bindMatrix).invert()
  /** Un habit (géométrie dans le repère de la princesse) lié à son squelette. */
  const skinned = (geo: Geo, mat: Mat, part: string) => {
    const p = geo.attributes.position as import('three').BufferAttribute
    const si = new Uint16Array(p.count * 4), sw = new Float32Array(p.count * 4)
    for (let i = 0; i < p.count; i++) {
      const j = nearest(p.getX(i), p.getY(i), p.getZ(i))
      for (let c = 0; c < 4; c++) { si[i * 4 + c] = srcIdx[j * 4 + c]; sw[i * 4 + c] = srcW[j * 4 + c] }
    }
    geo.setAttribute('skinIndex', new T.Uint16BufferAttribute(si, 4))
    geo.setAttribute('skinWeight', new T.Float32BufferAttribute(sw, 4))
    geo.applyMatrix4(toBody)
    geo.computeVertexNormals()
    const m = new T.SkinnedMesh(geo, mat)
    m.frustumCulled = false
    m.castShadow = true
    m.userData.part = part
    m.position.copy(skinMesh.position); m.quaternion.copy(skinMesh.quaternion); m.scale.copy(skinMesh.scale)
    m.bind(skinMesh.skeleton, skinMesh.bindMatrix)
    // La sphère englobante sert au toucher : large, pour les bras levés
    m.computeBoundingSphere()
    if (m.boundingSphere) m.boundingSphere.radius *= 2.5
    return m
  }
  /** Un groupe accroché à un os, placé en `at` (repère de la princesse, au repos). */
  const onBone = (n: BoneName, at: V3) => {
    const grp = new T.Group()
    const bw = rest.get(n) || raw(n).matrixWorld
    const local = new T.Matrix4().copy(bw).invert().multiply(new T.Matrix4().makeTranslation(at.x, at.y, at.z))
    local.decompose(grp.position, grp.quaternion, grp.scale)
    raw(n).add(grp)
    return grp
  }

  /* --- Les matériaux de tissu, un par pièce (réutilisés d'une tenue à l'autre) --- */
  const fab = new Map<Part, Fabric[]>()
  const variants = new Set<Fabric>()
  const fabricOf = (part: Part, variant?: FabricOpts) => {
    let list = fab.get(part) || []
    if (variant) {
      let f = list.find(x => variants.has(x))
      if (!f) { f = fabric(T, look.paint[part], { ...FABRIC_OPTS[part], ...variant, low: o.low }); variants.add(f); list = [...list, f]; fab.set(part, list) }
      return f
    }
    let f = list.find(x => !variants.has(x))
    if (!f) { f = fabric(T, look.paint[part], { ...FABRIC_OPTS[part], low: o.low }); list = [...list, f]; fab.set(part, list) }
    return f
  }
  const partMat = (part: Part, variant?: FabricOpts) => fabricOf(part, variant).mat

  /* --- Ses propres matériaux recolorés : cheveux, yeux, peau, chaussures --- */
  type MToon = import('@pixiv/three-vrm').MToonMaterial
  const mtoons = (list: import('three').Mesh[]) => list.flatMap(m => (Array.isArray(m.material) ? m.material : [m.material]) as MToon[])
    .filter(x => x && (x as unknown as { isMToonMaterial?: boolean }).isMToonMaterial)
  const hairMats = mtoons([...hairBack, ...hairFront])
  const skinMats = mtoons([...skinBody, ...skinFace])
  const shoeMats = mtoons(shoesM)
  const irisMats = mtoons(irisM)
  const skinBase = skinMats.map(m => ({ m, c: m.color.clone(), s: m.shadeColorFactor.clone() }))
  const hairClone = hairMats[0] ? hairMats[0].clone() as MToon : null
  if (hairClone) own.mats.push(hairClone)
  for (const m of [...hairMats, ...(hairClone ? [hairClone] : []), ...shoeMats]) {
    if (m.map) { m.map = grayOf(T, m.map); }
    if (m.shadeMultiplyTexture) m.shadeMultiplyTexture = grayOf(T, m.shadeMultiplyTexture)
    m.needsUpdate = true
  }
  let irisNormal: Tex | null = null, irisHeart: Tex | null = null
  if (irisMats[0]?.map) {
    irisNormal = grayOf(T, irisMats[0].map, 0.35)
    // Les centres des iris, d'après les UV
    const uv = irisM[0].geometry.attributes.uv as import('three').BufferAttribute
    const pts: [number, number][] = []
    for (let i = 0; i < uv.count; i++) pts.push([uv.getX(i), uv.getY(i)])
    // Un iris par œil — ou un seul dessin partagé par les deux (c'est son cas)
    const pos = irisM[0].geometry.attributes.position as import('three').BufferAttribute
    const centers: { u: number; v: number; r: number }[] = []
    for (const sd of [-1, 1]) {
      const c = pts.filter((_, i) => pos.getX(i) * sd > 0)
      if (!c.length) continue
      const xs = c.map(p => p[0]), ys = c.map(p => p[1])
      const q = { u: (Math.min(...xs) + Math.max(...xs)) / 2, v: (Math.min(...ys) + Math.max(...ys)) / 2, r: (Math.max(...xs) - Math.min(...xs)) / 2 }
      if (!centers.some(o => Math.hypot(o.u - q.u, o.v - q.v) < 0.02)) centers.push(q)
    }
    irisHeart = heartIris(T, irisNormal, centers)
    own.texs.push(irisNormal, irisHeart)
    irisMats.forEach(m => { m.map = irisNormal; m.needsUpdate = true })
  }
  /* --- Les taches de rousseur : peintes sur une copie de la texture de son
     visage, là où tombe un rayon tiré vers ses joues --- */
  const faceMat = mtoons(skinFace)[0] || null
  const faceMap0 = faceMat?.map ?? null
  let freckleMap: Tex | null = null
  if (faceMap0) {
    own.texs.push(faceMap0)
    const im = faceMap0.image as CanvasImageSource & { width: number; height: number }
    const cv = canvas(im.width, im.height)
    const gc = cv.getContext('2d')!
    gc.drawImage(im, 0, 0)
    const rc = new T.Raycaster()
    const uvAt = (x: number, y: number) => {
      rc.set(V(x, y, faceBox.max.z + 0.2), V(0, 0, -1))
      return rc.intersectObjects(skinFace, false)[0]?.uv ?? null
    }
    let seed = 7
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    gc.fillStyle = 'rgba(160, 88, 56, 0.6)'
    for (const e of [P.leye, P.reye]) {
      for (let q = 0; q < 9; q++) {
        const x = e.x * 1.08 + (rnd() - 0.5) * HR * 0.55, y = e.y - HR * 0.42 + (rnd() - 0.5) * HR * 0.24
        const a = uvAt(x, y), b = uvAt(x + 0.002, y)
        if (!a) continue
        const r = Math.max(1.2, (b ? Math.hypot(b.x - a.x, b.y - a.y) * cv.width : 2) * (0.5 + rnd() * 0.5))
        gc.beginPath(); gc.arc(a.x * cv.width, (faceMap0.flipY ? 1 - a.y : a.y) * cv.height, r, 0, Math.PI * 2); gc.fill()
      }
    }
    freckleMap = new T.CanvasTexture(cv)
    freckleMap.flipY = faceMap0.flipY
    freckleMap.colorSpace = T.SRGBColorSpace
    freckleMap.anisotropy = 4
    own.texs.push(freckleMap)
  }
  const eyeTint = new T.Color()
  const recolor = () => {
    const hc = new T.Color(look.paint.hair.c)
    for (const m of [...hairMats, ...(hairClone ? [hairClone] : [])]) {
      m.color.copy(hc)
      m.shadeColorFactor.copy(hc).multiplyScalar(0.62)
    }
    const [r, gg, b] = rgb(look.skin).map(x => x / 255)
    const f = [clamp(r / BASE_SKIN[0], 0, 1.05), clamp(gg / BASE_SKIN[1], 0, 1.05), clamp(b / BASE_SKIN[2], 0, 1.05)]
    skinBase.forEach(({ m, c, s }) => {
      m.color.setRGB(c.r * f[0], c.g * f[1], c.b * f[2])
      m.shadeColorFactor.setRGB(s.r * f[0], s.g * f[1], s.b * f[2])
    })
    eyeTint.set(look.eyes).multiplyScalar(1.6)
    irisMats.forEach(m => { m.color.copy(eyeTint) })
    const sc = new T.Color(look.paint.shoes.c)
    shoeMats.forEach(m => { m.color.copy(sc); m.shadeColorFactor.copy(sc).multiplyScalar(0.7) })
    const fm = look.freckles && freckleMap ? freckleMap : faceMap0
    if (faceMat && faceMat.map !== fm) { faceMat.map = fm; faceMat.needsUpdate = true }
  }
  recolor()

  /* --- Le visage --- */
  const face = makeFace(T, vrm, { mats: irisMats, normal: irisNormal, heart: irisHeart, tint: eyeTint }, live)

  /* --- La tête : un repère au centre, axes de la scène --- */
  const head = onBone('head', HC)
  const headY = HC.y

  /* --- Les cheveux : longueur et boucles sur les chaînes de ressorts --- */
  const joints = vrm.springBoneManager ? Array.from(vrm.springBoneManager.joints) : []
  // Les ressorts calculés dans SON repère : quand on la déplace ou qu'on la
  // fait tourner au doigt, ses cheveux ne s'envolent pas (ses pirouettes, sur
  // `rig`, les font toujours voler)
  joints.forEach(j => { j.center = obj })
  /* Ses cheveux sont des chaînes d'os (de la racine à la pointe) : la frange
     (2 os), deux longues mèches devant les épaules, six mèches dans le dos.
     La LONGUEUR étire les chaînes ; attachés (natte, chignon…), les mèches du
     dos se replient sur leur racine, cachées sous la coiffure. */
  const jointOf = new Map<Obj3, (typeof joints)[number]>()
  joints.forEach(j => jointOf.set(j.bone, j))
  const sideChains: Obj3[][] = [], backChains: Obj3[][] = []
  for (const j of joints) {
    if (!/hair/i.test(j.bone.name) || (j.bone.parent && jointOf.has(j.bone.parent))) continue
    const l: Obj3[] = []
    for (let q: (typeof joints)[number] | undefined = j; q;) {
      l.push(q.bone)
      const c: Obj3 | null = q.child
      q = c ? jointOf.get(c) : undefined
      if (c && !q) l.push(c)
    }
    if (l.length <= 3) continue
    ;(l[0].getWorldPosition(V(0, 0, 0)).z > P.head.z ? sideChains : backChains).push(l)
  }
  const restPos = new Map<Obj3, V3>()
  ;[...sideChains, ...backChains].flat().forEach(b => restPos.set(b, b.position.clone()))
  const shapeHair = () => {
    const st = look.hair.style, len = look.hair.len
    // 0 : au menton · 1 : au milieu du dos (sa longueur à elle) · 1,6 : au sol
    const s = len <= 1 ? 0.3 + 0.7 * len : 1 + ((len - 1) / 0.6) * 2.9
    const shape = (l: Obj3[], ci: number, k: number, curl: number) => l.forEach((b, i) => {
      const p0 = restPos.get(b)!
      if (i === 0) { b.position.copy(p0); return }
      b.position.copy(p0).multiplyScalar(k)
      // Boucles : un zigzag de chaque côté, de plus en plus marqué vers les pointes
      const side = (i + ci) % 2 ? 1 : -1
      b.position.x += side * curl * p0.length() * 0.45 * Math.min(1, i / 2)
    })
    const curl = look.hair.curl
    backChains.forEach((l, ci) => shape(l, ci, st === 'loose' ? s : 0.04, st === 'loose' ? curl : 0))
    sideChains.forEach((l, ci) => shape(l, ci, st === 'afro' ? 0.04 : st === 'loose' ? s : Math.min(s, 0.8), st === 'afro' ? 0 : curl))
    vrm.springBoneManager?.setInitState()
    vrm.springBoneManager?.reset()
  }

  /* --- Les sections qu'on reconstruit à la demande --- */
  const sections = new Map<string, Section>()
  const section = (name: string, parent: Obj3): Section => {
    const old = sections.get(name)
    if (old) {
      old.group.removeFromParent()
      old.geos.forEach(x => x.dispose())
      old.mats.forEach(x => x.dispose())
    }
    const s: Section = { group: new T.Group(), geos: [], mats: [] }
    parent.add(s.group)
    sections.set(name, s)
    return s
  }
  const sg = <G extends Geo>(s: Section, x: G) => { s.geos.push(x); return x }
  const fuse = (s: Section, pieces: { geo: Geo; m: M4 }[]) => {
    const list = pieces.map(p => {
      const x = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()).applyMatrix4(p.m)
      if (!x.attributes.uv) x.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2))
      return x
    })
    const out = merge(list, false)!
    list.forEach(x => x.dispose())
    return sg(s, out)
  }
  const M = (px: number, py: number, pz: number, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) =>
    new T.Matrix4().compose(V(px, py, pz), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), V(sx, sy, sz))
  const mesh = (geo: Geo, m: Mat, part?: string) => {
    const x = new T.Mesh(geo, m)
    x.castShadow = true
    if (part) x.userData.part = part
    return x
  }
  const place = <O extends Obj3>(x: O, px: number, py: number, pz: number, sx = 1, sy = sx, sz = sx) => {
    x.position.set(px, py, pz); x.scale.set(sx, sy, sz); return x
  }
  const sphere = g(new T.SphereGeometry(1, 24, 16))
  const gold = std({ color: 0xE3B04B, metalness: 1, roughness: 0.28 })
  const gems = new Map<number, Mat>()
  const gem = (c: number) => {
    let m = gems.get(c)
    if (!m) { m = phys({ color: c, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 }); gems.set(c, m) }
    return m
  }
  const pearl = phys({ color: 0xF4EEE8, roughness: 0.25, iridescence: 0.5, clearcoat: 1 })
  pearl.color.multiplyScalar(0.85)

  /** La taille (haut de la jupe) : un peu au-dessus des hanches. */
  const W = P.spine.y + 0.005
  const skirtPivot = onBone('hips', V(0, W, 0))
  const skirtFlare = new T.Group()
  skirtPivot.add(skirtFlare)
  const wingsPivot = onBone('upperChest', V(0, P.chest.y + 0.03, -(bust(P.chest.y + 0.03).zb + 0.012)))
  let skirtR: (y: number) => number = () => 0

  /** Un tube ajusté (corsage, manche) : des anneaux elliptiques, du bas vers le haut. */
  const tube = (rings: { y: number; x: number; zf: number; zb: number }[], seg = 56) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = []
    rings.forEach((r, i) => {
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * Math.PI * 2
        const c = Math.cos(a)
        pos.push(Math.sin(a) * r.x, r.y, c * (c > 0 ? r.zf : r.zb))
        uv.push(j / seg, i / (rings.length - 1))
      }
    })
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1
      idx.push(a, a + 1, b, b, a + 1, b + 1)
    }
    const geo = new T.BufferGeometry()
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    return geo
  }

  /* ---- Le haut : un corsage moulé sur elle, et les manches ---- */
  function buildTop() {
    const s = section('top', root.parent!)
    const TOP = P.neck.y - 0.045
    const y0 = W - 0.05
    const rings: { y: number; x: number; zf: number; zb: number }[] = []
    const n = 14
    for (let i = 0; i <= n; i++) {
      const y = y0 + (TOP - y0) * (i / n)
      const b = bust(y)
      const m = 0.009
      rings.push({ y, x: b.x + m, zf: b.zf + m, zb: b.zb + m })
    }
    // Le bord du haut rentre un peu (pas de trou), et le bas s'évase sur la jupe
    rings[0].x += 0.01; rings[0].zf += 0.01; rings[0].zb += 0.01
    const bod = tube(rings)
    s.group.add(skinned(sg(s, bod), partMat('bodice'), 'bodice'))
    // Liseré de l'encolure et ceinture (liés eux aussi)
    const edge = (y: number, w: number) => {
      const b = bust(y)
      const rr: { y: number; x: number; zf: number; zb: number }[] = []
      for (let i = 0; i <= 2; i++) {
        const yy = y - w + i * w
        const t = i === 1 ? 0.006 : 0.001
        rr.push({ y: yy, x: b.x + 0.012 + t, zf: b.zf + 0.012 + t, zb: b.zb + 0.012 + t })
      }
      return tube(rr, 48)
    }
    s.group.add(skinned(sg(s, edge(TOP, 0.006)), partMat('belt'), 'belt'))
    s.group.add(skinned(sg(s, edge(W, 0.008)), partMat('belt'), 'belt'))
    // Les manches (au repos, les bras sont à l'horizontale : le long de x)
    const arms: [number, number][] = [[1, P.lua.x], [-1, -P.lua.x]]
    if (look.top === 'puff') {
      for (const [sd, x0] of arms) {
        const c = V(x0 + sd * 0.03, P.lua.y - 0.004, 0)
        const geo = new T.SphereGeometry(0.048, 28, 18)
        geo.scale(1.15, 0.9, 0.95)
        geo.translate(c.x, c.y, c.z)
        s.group.add(skinned(sg(s, geo), partMat('sleeves'), 'sleeves'))
        const cuff = new T.TorusGeometry(0.036, 0.006, 8, 28)
        cuff.rotateY(Math.PI / 2)
        cuff.translate(c.x + sd * 0.05, c.y, c.z)
        s.group.add(skinned(sg(s, cuff), partMat('belt'), 'belt'))
      }
    } else if (look.top === 'long') {
      for (const [sd, x0] of arms) {
        const x1 = sd > 0 ? P.lh.x : -P.lh.x
        const L = Math.abs(x1 - x0)
        // Un tube le long du bras, qui s'évase en cloche au poignet
        const prof2 = [[0.034, 0], [0.032, 0.25], [0.029, 0.5], [0.028, 0.75], [0.036, 0.88], [0.05, 1]]
        const pts = prof2.map(([r, t]) => new T.Vector2(r, t * L))
        const geo = new T.LatheGeometry(pts, 32)
        geo.rotateZ(sd > 0 ? -Math.PI / 2 : Math.PI / 2)
        geo.translate(x0 - sd * 0.01, P.lua.y, 0)
        s.group.add(skinned(sg(s, folds(geo, 8, 0.05, 0)), partMat('sleeves'), 'sleeves'))
      }
    }
  }

  /* ---- La jupe (et la traîne, la ceinture) ---- */
  function buildSkirt() {
    const s = section('skirt', skirtFlare)
    const hipR = Math.max(bust(P.hips.y).x, bust(P.hips.y).zf, bust(P.hips.y).zb) + 0.015
    const wR = Math.max(bust(W).x, bust(W).zf) + 0.012
    const add = (geo: Geo, part: Part, variant?: FabricOpts) => { const m = mesh(sg(s, geo), partMat(part, variant), part); m.position.y = -W; s.group.add(m); return m }
    const tulle: FabricOpts = { opacity: 0.82, satin: false }
    const kind = look.skirt
    const hy = P.hips.y, ky = P.lknee.y
    let prof: number[][]
    if (kind === 'ball') {
      prof = [[0.31, 0.012], [0.33, 0.02], [0.32, 0.09], [0.28, 0.22], [0.22, 0.38], [hipR + 0.04, hy - 0.05], [hipR, hy + 0.02], [wR, W]]
      add(folds(lathe(T, prof, 96), 14, 0.07, W), 'under')
      add(folds(lathe(T, [[0.34, 0.045], [0.33, 0.09], [0.29, 0.22], [0.23, 0.38], [hipR + 0.05, hy - 0.05], [hipR + 0.008, hy + 0.02], [wR + 0.004, W - 0.004]], 80, 0.55, Math.PI * 2 - 1.1), 12, 0.09, W), 'skirt')
      const hem = mesh(sg(s, new T.TorusGeometry(0.325, 0.014, 8, 96)), partMat('under'), 'under')
      hem.rotation.x = Math.PI / 2; hem.position.y = 0.02 - W
      s.group.add(hem)
    } else if (kind === 'short') {
      const hem = ky + 0.12
      prof = [[0.2, hem], [0.21, hem + 0.01], [0.17, hy - 0.02], [hipR + 0.02, hy + 0.01], [wR, W]]
      add(folds(lathe(T, prof, 96), 14, 0.07, W), 'skirt')
      add(folds(lathe(T, [[0.23, hem - 0.015], [0.21, hem + 0.04], [0.15, hy - 0.03], [hipR, hy + 0.01]], 96), 22, 0.1, hy), 'under', tulle)
    } else if (kind === 'mermaid') {
      prof = [[0.27, 0.015], [0.22, 0.06], [0.13, 0.15], [0.09, ky - 0.04], [0.085, ky + 0.06], [hipR + 0.005, hy - 0.04], [hipR + 0.01, hy + 0.02], [wR, W]]
      add(folds(lathe(T, prof, 96), 12, 0.1, ky - 0.04), 'skirt')
      add(folds(lathe(T, [[0.29, 0.012], [0.24, 0.06], [0.14, 0.16], [0.1, ky - 0.03]], 96), 24, 0.12, ky - 0.03), 'under', tulle)
    } else if (kind === 'layers') {
      prof = [[0.3, 0.015], [0.25, 0.14], [0.19, 0.27], [0.16, 0.4], [hipR + 0.03, hy], [wR, W]]
      add(lathe(T, [[0.24, 0.015], [0.13, 0.35], [wR - 0.002, W]], 48), 'under')
      add(folds(lathe(T, [[0.31, 0.015], [0.315, 0.025], [0.24, 0.14], [0.19, 0.25]], 96), 26, 0.06, 0.25), 'skirt')
      add(folds(lathe(T, [[0.23, 0.24], [0.235, 0.25], [0.18, 0.36], [0.15, 0.46]], 96), 24, 0.06, 0.46), 'under')
      add(folds(lathe(T, [[0.17, 0.45], [0.175, 0.46], [hipR + 0.03, hy], [wR, W]], 96), 20, 0.06, W), 'skirt')
    } else {
      const hem = ky + 0.1
      prof = [[0.22, hem], [0.17, hy - 0.02], [wR, W]]
      add(folds(lathe(T, [[0.22, hem + 0.03], [0.2, hem + 0.07], [0.15, hy - 0.03], [hipR, hy + 0.01]], 96), 22, 0.1, hy), 'under', tulle)
      for (let i = 0; i < 8; i++) {
        const geo = lathe(T, [[0.24, hem], [0.22, hem + 0.05], [0.17, hy - 0.04], [hipR + 0.01, hy + 0.01], [wR + 0.003, W]], 12, (i / 8) * Math.PI * 2 - 0.05, (Math.PI * 2) / 8 * 1.25)
        const p = geo.attributes.position as import('three').BufferAttribute
        const uvs = geo.attributes.uv as import('three').BufferAttribute
        for (let q = 0; q < p.count; q++) {
          const f = uvs.getX(q)
          const y = p.getY(q)
          const up = (1 - Math.sin(Math.PI * f)) * (W - y) * 0.5
          const rr = 1 + (i % 2) * 0.03
          p.setXYZ(q, p.getX(q) * rr, y + up, p.getZ(q) * rr)
        }
        geo.computeVertexNormals()
        add(geo, i % 2 ? 'under' : 'skirt')
      }
    }
    const pr = prof.slice().sort((a, b) => a[1] - b[1])
    skirtR = (y: number) => {
      if (y > W || y < pr[0][1] - 0.01) return 0
      for (let i = 1; i < pr.length; i++) {
        if (y <= pr[i][1]) {
          const t = (y - pr[i - 1][1]) / Math.max(1e-6, pr[i][1] - pr[i - 1][1])
          return lerp(pr[i - 1][0], pr[i][0], t) * 1.06 + 0.01
        }
      }
      return pr[pr.length - 1][0]
    }
    if (look.train && (kind === 'ball' || kind === 'mermaid')) {
      const geo = new T.PlaneGeometry(1, 1, 14, 36)
      const p = geo.attributes.position as import('three').BufferAttribute
      for (let q = 0; q < p.count; q++) {
        const u = p.getX(q) + 0.5, v = 0.5 - p.getY(q)
        const width = lerp(0.18, 0.66, Math.pow(v, 0.7))
        let y: number, z: number
        if (v < 0.45) { const t = v / 0.45; y = lerp(W - 0.06, 0.012, t); z = -(skirtR(y) + 0.012) }
        else { const t = (v - 0.45) / 0.55; y = 0.012 + Math.sin(t * Math.PI) * 0.01; z = -(skirtR(0.02) + 0.012) - t * 0.66 }
        p.setXYZ(q, (u - 0.5) * width, y - W + Math.cos((u - 0.5) * Math.PI * 3) * 0.004, z)
      }
      geo.computeVertexNormals()
      s.group.add(mesh(sg(s, geo), partMat('skirt'), 'skirt'))
    }
    if (kind === 'ball' || kind === 'mermaid' || kind === 'layers') {
      const bow = new T.Group()
      for (const b of [-1, 1]) {
        const lobe = mesh(sphere, partMat('belt'), 'belt')
        lobe.scale.set(0.034, 0.021, 0.012); lobe.position.set(b * 0.032, 0.004, 0); lobe.rotation.z = b * 0.35
        bow.add(lobe)
        const tail = mesh(sphere, partMat('belt'), 'belt')
        tail.scale.set(0.012, 0.055, 0.006); tail.position.set(b * 0.014, -0.055, 0.002); tail.rotation.z = b * 0.2
        bow.add(tail)
      }
      bow.add(place(mesh(sphere, partMat('belt'), 'belt'), 0, 0, 0.004, 0.013))
      bow.position.set(0, -0.004, -(bust(W).zb + 0.018))
      s.group.add(bow)
    }
    // Les bottes : une tige autour de chaque mollet (ses chaussures restent dessous)
    const bs = section('boots', root.parent!)
    if (look.shoes === 'boots') {
      for (const sd of [1, -1]) {
        const x = sd * Math.abs(P.lleg.x)
        const top = P.lknee.y - 0.02, bot = P.lfoot.y + 0.01
        const rr = [0.034, 0.036, 0.033, 0.03, 0.028].map((r, i) => ({ y: bot + (top - bot) * (i / 4), x: r, zf: r, zb: r }))
        const geo = tube(rr, 28)
        geo.translate(x, 0, 0)
        bs.group.add(skinned(sg(bs, geo), partMat('shoes'), 'shoes'))
      }
    }
  }

  /* ---- Cape ---- */
  function buildCape() {
    const s = section('cape', onBoneOnce('upperChest'))
    if (look.cape === 'none') return
    const royal = look.cape === 'royal'
    const top = P.neck.y - 0.03
    const back = bust(P.chest.y).zb
    const prof2 = royal
      ? [[0.4, 0.012], [0.38, 0.1], [0.33, 0.25], [0.26, 0.42], [0.19, W], [0.14, P.chest.y], [0.1, top]]
      : [[0.19, W - 0.02], [0.17, W + 0.06], [0.14, P.chest.y], [0.1, top]]
    const safe = prof2.map(([r, y]) => [Math.max(r, skirtR(y) + 0.03, back + 0.03), y])
    const geo = folds(lathe(T, safe, 64, Math.PI / 2 + 0.28, Math.PI - 0.56), 10, 0.05, top)
    const cm = mesh(sg(s, geo), partMat('cape'), 'cape')
    s.group.add(cm)
    const col = mesh(sg(s, new T.TorusGeometry(Math.max(0.06, bust(top).x * 0.75), royal ? 0.02 : 0.008, 10, 40)),
      royal ? std({ color: 0xF4F1EC, roughness: 0.9 }, 0.85) : partMat('belt'), royal ? 'deco' : 'belt')
    if (royal) s.mats.push(col.material as Mat)
    col.rotation.x = Math.PI / 2 + 0.15; col.position.set(0, top, -0.01); col.scale.set(1, 0.8, 1)
    s.group.add(col)
  }
  /** Les accroches rigides partagées (un groupe par os, placé à l'origine de la princesse). */
  const anchors = new Map<string, Grp>()
  function onBoneOnce(n: BoneName) {
    let a = anchors.get(n)
    if (!a) { a = onBone(n, V(0, 0, 0)); anchors.set(n, a) }
    return a
  }

  /* ---- Ailes ---- */
  function buildWings() {
    const s = section('wings', wingsPivot)
    if (look.wings === 'none') return
    const shape = (L: number, Wd: number, round: boolean) => {
      const sh = new T.Shape()
      sh.moveTo(0, 0)
      if (round) { sh.bezierCurveTo(Wd * 0.1, Wd * 1.3, L * 1.1, Wd * 1.4, L, Wd * 0.2); sh.bezierCurveTo(L * 0.95, -Wd * 0.6, L * 0.4, -Wd * 0.4, 0, 0) }
      else { sh.bezierCurveTo(Wd * 0.2, Wd * 0.9, L * 0.8, Wd * 1.1, L, Wd * 0.3); sh.bezierCurveTo(L * 1.02, -Wd * 0.2, L * 0.5, -Wd * 0.3, 0, 0) }
      const geo = sg(s, new T.ShapeGeometry(sh, 24))
      const p = geo.attributes.position as import('three').BufferAttribute
      const uv = geo.attributes.uv as import('three').BufferAttribute
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / L, (p.getY(i) + Wd) / (Wd * 2.5))
      return geo
    }
    const bf = look.wings === 'butterfly'
    const up = shape(bf ? 0.3 : 0.34, bf ? 0.19 : 0.17, bf)
    const low = shape(bf ? 0.2 : 0.22, bf ? 0.13 : 0.11, bf)
    for (const sd of [-1, 1]) {
      const side = new T.Group()
      side.userData.side = sd
      const a = mesh(up, partMat('wings'), 'wings'); a.rotation.z = 0.45
      const b = mesh(low, partMat('wings'), 'wings'); b.rotation.z = -0.5; b.position.y = -0.03
      side.add(a, b)
      side.scale.x = sd
      side.rotation.y = sd * -0.5
      s.group.add(side)
    }
  }

  /* ---- Couronne, barrettes, collier, lunettes, objet ---- */
  /** Un point à la surface de ses cheveux (repère de la tête). */
  const RH = Math.max(HR * 1.15, hairTop - HC.y)
  const onHair = (az: number, th: number, lift = 1) =>
    V(Math.sin(th) * Math.sin(az) * HR * 1.18 * lift, Math.cos(th) * RH * lift, Math.sin(th) * Math.cos(az) * HR * 1.12 * lift)
  /** L'afro : centre et demi-axes du nuage de boucles (repère de la tête). */
  const afroShape = () => {
    const k = 0.9 + look.hair.len * 0.2
    return { c: V(0, HR * 0.4, -HR * 0.47), a: V(HR * 1.7 * k, HR * 1.55 * k, HR * 1.55 * k) }
  }
  /** Ce qu'on pose sur la tête (couronne, barrettes) monte sur le nuage d'afro. */
  const headLift = () => {
    if (look.hair.style !== 'afro') return 1
    const { c, a } = afroShape()
    return (c.y + a.y + HR * 0.3) / RH
  }
  function buildCrown() {
    const s = section('crown', head)
    const pieces = (list: { geo: Geo; m: M4 }[], m: Mat, part = 'deco') => { if (list.length) s.group.add(mesh(fuse(s, list), m, part)) }
    const lift = headLift()
    if (look.crown === 'tiara') {
      const TH = 0.2 * Math.PI
      const arc: V3[] = []
      for (let q = 0; q <= 16; q++) { const a = -1.15 + (q / 16) * 2.3; arc.push(onHair(a, TH + Math.abs(a) * 0.08, lift)) }
      const golds: { geo: Geo; m: M4 }[] = [{ geo: new T.TubeGeometry(new T.CatmullRomCurve3(arc), 48, 0.005, 8), m: new T.Matrix4() }]
      const pink: { geo: Geo; m: M4 }[] = [], blue: typeof pink = []
      const cone = new T.ConeGeometry(0.0065, 1, 8)
      for (let i = -4; i <= 4; i++) {
        const a = i * 0.26
        const base = onHair(a, TH + Math.abs(a) * 0.08, lift)
        const dir = base.clone().normalize().multiplyScalar(0.55).add(V(0, 1, 0)).normalize()
        const h = 0.042 - Math.abs(i) * 0.0062
        const q = new T.Quaternion().setFromUnitVectors(V(0, 1, 0), dir)
        golds.push({ geo: cone, m: new T.Matrix4().compose(base.clone().addScaledVector(dir, h / 2), q, V(1, h, 1)) })
        const tip = base.clone().addScaledVector(dir, h + 0.002)
        ;(i === 0 ? pink : golds).push({ geo: sphere, m: new T.Matrix4().compose(tip, q, V(1, 1, 1).setScalar(i === 0 ? 0.009 : 0.005)) })
        if (i % 2 === 0) {
          const gp = base.clone().addScaledVector(dir, 0.007).addScaledVector(base.clone().normalize(), 0.004)
          ;(i === 0 ? pink : blue).push({ geo: sphere, m: new T.Matrix4().compose(gp, q, V(i === 0 ? 0.013 : 0.007, i === 0 ? 0.017 : 0.007, 0.007)) })
        }
      }
      pieces(golds, gold); pieces(pink, gem(0xD02860)); pieces(blue, gem(0x7FD6F0))
      cone.dispose(); golds[0].geo.dispose()
    } else if (look.crown === 'crown') {
      const golds: { geo: Geo; m: M4 }[] = []
      const R = HR * 0.62
      const ring = new T.CylinderGeometry(R, R * 1.1, 0.04, 32, 1, true)
      golds.push({ geo: ring, m: M(0, 0, 0) })
      const cone = new T.ConeGeometry(0.013, 0.04, 8)
      const red: typeof golds = [], blue: typeof golds = []
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        golds.push({ geo: cone, m: M(Math.sin(a) * R, 0.038, Math.cos(a) * R) })
        golds.push({ geo: sphere, m: M(Math.sin(a) * R, 0.061, Math.cos(a) * R, 0.008) })
        ;(i % 2 ? blue : red).push({ geo: sphere, m: M(Math.sin(a) * R * 1.1, 0, Math.cos(a) * R * 1.1, 0.0085) })
      }
      const c = new T.Group()
      const add = (list: typeof golds, m: Mat) => { if (list.length) c.add(mesh(fuse(s, list), m, 'deco')) }
      add(golds, gold); add(red, gem(0xC02850)); add(blue, gem(0x2F7FD0))
      ring.dispose(); cone.dispose()
      c.position.set(0, RH * lift * 0.9, -HR * 0.12)
      c.rotation.x = -0.22
      s.group.add(c)
    } else if (look.crown === 'flowers') {
      const cols = [0xE8759A, 0xF2F0F4, 0xF5C75A, 0xB795E8]
      const by = new Map<number, { geo: Geo; m: M4 }[]>()
      const hearts: { geo: Geo; m: M4 }[] = []
      for (let i = 0; i < 12; i++) {
        const a = -Math.PI * 0.55 + (i / 11) * Math.PI * 1.1
        const p = onHair(a, 0.25 * Math.PI, lift * 1.03)
        const q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(p.clone().multiplyScalar(3), p, V(0, 1, 0)))
        const list = by.get(cols[i % 4]) || []
        for (let f = 0; f < 5; f++) {
          const pa = (f / 5) * Math.PI * 2
          const off = V(Math.cos(pa) * 0.013, Math.sin(pa) * 0.013, 0).applyQuaternion(q)
          list.push({ geo: sphere, m: new T.Matrix4().compose(p.clone().add(off), q, V(0.014, 0.014, 0.006)) })
        }
        by.set(cols[i % 4], list)
        hearts.push({ geo: sphere, m: new T.Matrix4().compose(p.clone().add(V(0, 0, 0.003).applyQuaternion(q)), q, V(1, 1, 1).setScalar(0.007)) })
      }
      for (const [c, list] of by) { const m = std({ color: c, roughness: 0.6 }, 0.8); s.mats.push(m); pieces(list, m) }
      const cm = std({ color: 0xE0A020, roughness: 0.5 }); s.mats.push(cm); pieces(hearts, cm)
    } else if (look.crown === 'bow') {
      const p = onHair(Math.PI * 0.85, 0.18 * Math.PI, lift * 1.02)
      const b = new T.Group()
      for (const q of [-1, 1]) {
        const lobe = mesh(sphere, partMat('belt'), 'belt'); lobe.scale.set(0.058, 0.036, 0.018); lobe.position.set(q * 0.052, 0, 0); lobe.rotation.z = q * 0.3
        b.add(lobe)
      }
      b.add(place(mesh(sphere, partMat('belt'), 'belt'), 0, 0, 0, 0.02))
      b.position.copy(p)
      b.lookAt(p.clone().multiplyScalar(3))
      s.group.add(b)
    }
    buildClips()
  }
  function buildClips() {
    const s = section('clips', head)
    const lift = look.hair.style === 'afro' ? headLift() : 1.02
    look.hair.clips.forEach((c: Clip) => {
      const p = onHair(c.az, c.th, lift)
      const grp = new T.Group()
      const m = std({ color: c.c, roughness: 0.4 }, 0.8)
      s.mats.push(m)
      const q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(p.clone().multiplyScalar(3), p, V(0, 1, 0)))
      if (c.k === 'flower') {
        for (let f = 0; f < 5; f++) {
          const a = (f / 5) * Math.PI * 2
          grp.add(place(mesh(sphere, m, 'deco'), Math.cos(a) * 0.013, Math.sin(a) * 0.013, 0, 0.013, 0.013, 0.005))
        }
        grp.add(place(mesh(sphere, gold, 'deco'), 0, 0, 0.004, 0.007))
      } else if (c.k === 'bow') {
        for (const q2 of [-1, 1]) { const l = mesh(sphere, m, 'deco'); l.scale.set(0.022, 0.014, 0.007); l.position.x = q2 * 0.02; l.rotation.z = q2 * 0.3; grp.add(l) }
        grp.add(place(mesh(sphere, m, 'deco'), 0, 0, 0.003, 0.009))
      } else {
        const sh = new T.Shape()
        if (c.k === 'star') {
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.01 : 0.024
            if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r)
          }
        } else {
          const r = 0.017
          sh.moveTo(0, -r * 0.9)
          sh.bezierCurveTo(-r * 1.4, r * 0.2, -r * 0.6, r * 1.2, 0, r * 0.4)
          sh.bezierCurveTo(r * 0.6, r * 1.2, r * 1.4, r * 0.2, 0, -r * 0.9)
        }
        const geo = sg(s, new T.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 }))
        grp.add(mesh(geo, c.k === 'star' ? gold : m, 'deco'))
      }
      grp.position.copy(p); grp.quaternion.copy(q)
      s.group.add(grp)
    })
  }
  function buildNeck() {
    const s = section('neck', onBoneOnce('upperChest'))
    const ny = P.neck.y - 0.02
    const b = bust(ny)
    const rx = Math.max(0.032, b.x * 0.55), rz = Math.max(0.028, b.zf * 0.9)
    if (look.neck === 'pearls') {
      const list: { geo: Geo; m: M4 }[] = []
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2
        list.push({ geo: sphere, m: M(Math.sin(a) * rx, ny - Math.max(0, Math.cos(a)) * 0.025, Math.cos(a) * rz, 0.0058) })
      }
      s.group.add(mesh(fuse(s, list), pearl, 'deco'))
    } else if (look.neck === 'heart') {
      const chain = mesh(sg(s, new T.TorusGeometry(1, 0.0025 / rx, 6, 40)), gold, 'deco')
      chain.rotation.x = Math.PI / 2 + 0.5; chain.position.set(0, ny, 0); chain.scale.set(rx, rz * 0.9, rx)
      s.group.add(chain)
      const sh = new T.Shape()
      const r = 0.015
      sh.moveTo(0, -r * 0.9)
      sh.bezierCurveTo(-r * 1.4, r * 0.2, -r * 0.6, r * 1.2, 0, r * 0.4)
      sh.bezierCurveTo(r * 0.6, r * 1.2, r * 1.4, r * 0.2, 0, -r * 0.9)
      const h = mesh(sg(s, new T.ExtrudeGeometry(sh, { depth: 0.005, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 })), gem(0xD02850), 'deco')
      h.position.set(0, ny - 0.035, rz + 0.012)
      s.group.add(h)
    }
  }
  function buildGlasses() {
    const s = section('glasses', head)
    if (look.glasses === 'none') return
    const frame = std({ color: look.glasses === 'hearts' ? 0xE0457E : 0xE0A83A, roughness: 0.35 }, 0.85)
    const lens = phys({ color: look.glasses === 'hearts' ? 0xFF9EC0 : 0x9ED8FF, roughness: 0.1, transparent: true, opacity: 0.45, depthWrite: false })
    s.mats.push(frame, lens)
    const outline = (heart: boolean, r: number) => {
      const sh = new T.Shape()
      if (heart) {
        sh.moveTo(0, -r * 0.9)
        sh.bezierCurveTo(-r * 1.4, r * 0.2, -r * 0.6, r * 1.2, 0, r * 0.4)
        sh.bezierCurveTo(r * 0.6, r * 1.2, r * 1.4, r * 0.2, 0, -r * 0.9)
      } else {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? r * 0.5 : r
          if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
        }
      }
      return sh
    }
    const heart = look.glasses === 'hearts'
    const eyes = [P.leye, P.reye]
    // Un verre par œil, qui touche presque son voisin
    const R = Math.abs(P.leye.x - P.reye.x) * (heart ? 0.46 : 0.52)
    for (const e of eyes) {
      const outer = outline(heart, R)
      const inner = outline(heart, R * 0.77)
      outer.holes.push(new T.Path(inner.getPoints(24).reverse()))
      const f = mesh(sg(s, new T.ExtrudeGeometry(outer, { depth: 0.004, bevelEnabled: false, curveSegments: 16 })), frame, 'face')
      const l = mesh(sg(s, new T.ShapeGeometry(inner, 16)), lens, 'face')
      l.userData.noShadow = true
      const at = V(e.x, e.y - HC.y, faceBox.max.z - HC.z + 0.012)
      f.position.copy(at); l.position.copy(at).add(V(0, 0, 0.001))
      s.group.add(f, l)
    }
    const bridge = mesh(sg(s, new T.CylinderGeometry(0.002, 0.002, Math.abs(P.leye.x - P.reye.x) * 0.3, 6)), frame, 'face')
    bridge.rotation.z = Math.PI / 2; bridge.position.set(0, P.leye.y - HC.y + 0.01, faceBox.max.z - HC.z + 0.014)
    s.group.add(bridge)
  }
  function buildHeld() {
    const s = section('held', onBoneOnce('rightHand'))
    // Au repos, le bras droit est tendu vers −x : l'objet part de la main, pointé vers l'avant
    const hold = new T.Group()
    const hp = wpos('rightHand')
    hold.position.set(hp.x - 0.05, hp.y - 0.012, 0.01)
    hold.rotation.x = Math.PI / 2 - 0.35
    s.group.add(hold)
    if (look.held === 'wand' || look.held === 'scepter') {
      const wand = look.held === 'wand'
      hold.add(place(mesh(sg(s, new T.CylinderGeometry(wand ? 0.004 : 0.006, wand ? 0.004 : 0.007, wand ? 0.18 : 0.26, 10)), wand ? std({ color: 0xF0E6F0, roughness: 0.3 }) : gold, 'deco'), 0, wand ? 0.06 : 0.07, 0))
      if (wand) {
        const sh = new T.Shape()
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.015 : 0.036
          if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r)
        }
        hold.add(place(mesh(sg(s, new T.ExtrudeGeometry(sh, { depth: 0.01, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2 })), gold, 'deco'), 0, 0.165, -0.005))
      } else {
        hold.add(place(mesh(sphere, gem(0x8C3CC8), 'deco'), 0, 0.21, 0, 0.028))
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2
          const c = mesh(sg(s, new T.ConeGeometry(0.006, 0.02, 6)), gold, 'deco')
          c.position.set(Math.sin(a) * 0.017, 0.24, Math.cos(a) * 0.017)
          hold.add(c)
        }
      }
    } else if (look.held === 'bouquet') {
      hold.add(place(mesh(sg(s, new T.ConeGeometry(0.03, 0.09, 16, 1, true)), std({ color: 0xF4F0EA, roughness: 0.7, side: T.DoubleSide }, 0.85), 'deco'), 0, 0.02, 0).rotateX(Math.PI))
      const cols = [0xE8759A, 0xF2F0F4, 0xE83A5E, 0xF5C75A]
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4, r = i ? 0.02 : 0
        const m = std({ color: cols[i % 4], roughness: 0.6 }, 0.85)
        s.mats.push(m)
        hold.add(place(mesh(sphere, m, 'deco'), Math.cos(a) * r, 0.075 + (i ? 0 : 0.008), Math.sin(a) * r, 0.018))
      }
    } else if (look.held === 'fan') {
      const geo = sg(s, new T.CircleGeometry(0.1, 20, 0, Math.PI))
      const p = geo.attributes.position as import('three').BufferAttribute
      for (let i = 0; i < p.count; i++) {
        const a = Math.atan2(p.getY(i), p.getX(i))
        p.setZ(i, Math.sin(a * 20) * 0.004 * Math.hypot(p.getX(i), p.getY(i)) * 10)
      }
      geo.computeVertexNormals()
      const f = mesh(geo, partMat('belt'), 'belt')
      ;(f.material as Mat).side = T.DoubleSide
      f.position.set(0, 0.02, 0.01)
      hold.add(f)
    }
  }

  /* ---- Les coiffures : ses cheveux, ou des cheveux attachés ---- */
  function buildHair() {
    const s = section('hairx', head)
    const style = look.hair.style
    // Lâchés : ses propres cheveux ; attachés : on cache le rideau du dos
    hairBack.forEach(m => { m.visible = style === 'loose' })
    hairFront.forEach(m => { m.visible = style !== 'afro' })
    shapeHair()
    if (style === 'loose' || !hairClone) return
    const hm = hairClone
    const parts: Geo[] = []
    const HS = HR / 0.1 // les anciennes mesures (tête de rayon 0,1) à sa taille
    const at = (az: number, th: number, lift = 1) => onHair(az, th, 0.92 * lift)
    const lockH = (pts: V3[], w0: number, w1: number, flat = 0.55) => parts.push(lockGeo(T, pts, w0 * HS, w1 * HS, flat, V(0, 0, 0), 20, 8))
    const wave = 0.004 + look.hair.curl * 0.02
    const L = (0.12 + look.hair.len * 0.22) * HS
    if (style === 'bun') {
      const bun = new T.SphereGeometry(0.066 * HS, 32, 20)
      bun.scale(1, 0.85, 1); bun.translate(0, RH * 0.95, -HR * 0.45)
      parts.push(bun)
      const wrap = new T.TorusGeometry(0.052 * HS, 0.022 * HS, 12, 32)
      wrap.rotateX(Math.PI / 2 - 0.4); wrap.translate(0, RH * 0.82, -HR * 0.4)
      parts.push(wrap)
    } else if (style === 'ponytail' || style === 'pigtails') {
      const ties = style === 'ponytail' ? [at(Math.PI, 0.3 * Math.PI)] : [at(Math.PI * 0.72, 0.42 * Math.PI), at(-Math.PI * 0.72, 0.42 * Math.PI)]
      ties.forEach((Pt, ti) => {
        const sd = style === 'ponytail' ? 0 : ti === 0 ? 1 : -1
        const n = style === 'ponytail' ? 10 : 7
        for (let q = 0; q < n; q++) {
          const off = (q / (n - 1) - 0.5) * 0.045 * HS
          const w = (t: number) => Math.sin(t * 9 + q) * wave * t * HS
          const pts = style === 'ponytail'
            ? [Pt.clone(), Pt.clone().add(V(off * 0.5, 0.035 * HS, -0.05 * HS)), Pt.clone().add(V(off + w(0.3), -0.03 * HS, -0.12 * HS)), Pt.clone().add(V(off * 1.3 + w(0.6), -0.03 * HS - L * 0.5, -0.13 * HS)), Pt.clone().add(V(off * 1.5 + w(1), -0.03 * HS - L, -0.1 * HS - Math.abs(off)))]
            : [Pt.clone(), Pt.clone().add(V(sd * 0.04 * HS, 0, -0.02 * HS + off * 0.4)), Pt.clone().add(V(sd * 0.065 * HS, -0.07 * HS, -0.04 * HS + off)), Pt.clone().add(V(sd * 0.06 * HS + off * 0.3 + w(0.6), -0.07 * HS - L * 0.45, -0.06 * HS + off)), Pt.clone().add(V(sd * 0.05 * HS + off * 0.5 + w(1), -0.07 * HS - L, -0.055 * HS + off))]
          lockH(pts, 0.03, 0.026, 0.55)
        }
        const bow = new T.Group()
        for (const q of [-1, 1]) { const l = mesh(sphere, partMat('belt'), 'belt'); l.scale.set(0.03, 0.019, 0.01); l.position.x = q * 0.026; l.rotation.z = q * 0.3; bow.add(l) }
        bow.add(place(mesh(sphere, partMat('belt'), 'belt'), 0, 0, 0, 0.011))
        bow.position.copy(Pt).multiplyScalar(1.08)
        bow.lookAt(Pt.clone().multiplyScalar(4))
        s.group.add(bow)
      })
    } else if (style === 'braid') {
      const pts = [at(Math.PI * 0.6, 0.55 * Math.PI), V(0.1 * HS, -0.09 * HS, -0.05 * HS), V(0.1 * HS, -0.16 * HS, 0.05 * HS), V(0.085 * HS, -0.24 * HS, 0.085 * HS)]
      const end = -0.24 * HS - L * 1.3
      for (let y = -0.32 * HS; y > end; y -= 0.08 * HS) pts.push(V(0.075 * HS, y, 0.09 * HS))
      pts.push(V(0.072 * HS, end, 0.092 * HS))
      const path = new T.CatmullRomCurve3(pts)
      const n = Math.round(10 + path.getLength() / HS * 34)
      for (let q = 0; q < n; q++) {
        const t = (q / (n - 1)) * 0.94
        const p = path.getPointAt(t), tg = path.getTangentAt(t)
        const sd = q % 2 ? 1 : -1
        const r = 0.03 * HS * (1 - t * 0.4)
        const qq = new T.Quaternion().setFromUnitVectors(V(0, 1, 0), tg.clone().negate())
        const e = new T.SphereGeometry(1, 14, 10)
        e.scale(r * 1.05, r * 1.45, r * 0.85)
        e.rotateZ(sd * 0.55)
        e.applyQuaternion(qq)
        const side = V(1, 0, 0).applyQuaternion(qq).multiplyScalar(sd * r * 0.35)
        e.translate(p.x + side.x, p.y + side.y, p.z + side.z)
        parts.push(e)
      }
    } else if (style === 'afro') {
      let seed = 11
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
      // Un nuage de boucles rondes autour de la tête, le visage dégagé
      const { c, a: A } = afroShape()
      const top = new T.SphereGeometry(1, 40, 12, 0, Math.PI * 2, 0, 0.35 * Math.PI)
      const back = new T.SphereGeometry(1, 24, 20, Math.PI, Math.PI, 0.2 * Math.PI, 0.58 * Math.PI)
      for (const cap of [top, back]) {
        cap.scale(A.x * 0.84, A.y * 0.84, A.z * 0.84)
        cap.translate(c.x, c.y, c.z)
        parts.push(cap)
      }
      const puff = (p: V3, r: number) => { const e = new T.SphereGeometry(r, 12, 9); e.translate(p.x, p.y, p.z); parts.push(e) }
      const N = 150, big = 0.8 + look.hair.curl * 0.4
      for (let q = 0; q < N; q++) {
        // Directions réparties sur la sphère (spirale de Fibonacci), un peu bousculées
        const y = 1 - (2 * (q + 0.5)) / N, rr = Math.sqrt(1 - y * y), ph = q * 2.39996
        const d = V(Math.cos(ph) * rr + (rnd() - 0.5) * 0.12, y, Math.sin(ph) * rr + (rnd() - 0.5) * 0.12)
        const p = V(c.x + d.x * A.x, c.y + d.y * A.y, c.z + d.z * A.z)
        if (p.z > -HR * 0.07 && p.y < HR * 0.47 && Math.abs(p.x) < HR * 1.02) continue
        // Pas plus bas que la mâchoire (sinon, de face, on dirait une barbe)
        if (p.y < -HR * 0.55) continue
        puff(p, HR * (0.3 + rnd() * 0.2) * big)
      }
      // La lisière sur le front et les tempes
      for (let q = 0; q <= 12; q++) {
        const az = -1.35 + (q / 12) * 2.7
        puff(onHair(az, (0.35 + Math.abs(az) * 0.09) * Math.PI, 0.97), HR * (0.2 + rnd() * 0.08) * big)
      }
    }
    if (parts.length) {
      const geo = merge(parts.map(x => {
        const q = x.index ? x.toNonIndexed() : x
        if (!q.attributes.uv) q.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(q.attributes.position.count * 2), 2))
        return q
      }), false)!
      parts.forEach(x => x.dispose())
      s.group.add(mesh(sg(s, geo), hm, 'hair'))
    }
  }

  /* --- Tout construire, puis ne refaire que ce qui change --- */
  const keys = (r: Royal) => ({
    top: r.top,
    skirt: JSON.stringify([r.skirt, r.train, r.shoes]),
    cape: r.cape + r.skirt,
    wings: r.wings,
    hair: JSON.stringify([r.hair.style, r.hair.len.toFixed(3), r.hair.curl.toFixed(3)]),
    crown: JSON.stringify([r.crown, r.hair.style, r.hair.len.toFixed(2), r.hair.clips]),
    neck: r.neck,
    glasses: r.glasses,
    held: r.held,
    colors: JSON.stringify([r.skin, r.eyes, r.freckles, r.paint.hair.c, r.paint.shoes.c])
  })
  let built = keys(look)
  buildTop(); buildSkirt(); buildCape(); buildWings(); buildHair(); buildCrown(); buildNeck(); buildGlasses(); buildHeld()
  obj.traverse(x => { x.castShadow = !x.userData.noShadow })

  const state = restPose()
  const A0 = 1.22 // bras le long du corps : rotation depuis la pose en T
  const princess: Princess = {
    obj, rig, head, headY, skirt: skirtPivot, wings: wingsPivot, face, flare: 0, pose: state,
    get look() { return look },
    set(r) {
      const next = cloneRoyal(r)
      const kk = keys(next)
      look = next
      if (kk.top !== built.top) buildTop()
      if (kk.skirt !== built.skirt) buildSkirt()
      if (kk.cape !== built.cape) buildCape()
      if (kk.wings !== built.wings) buildWings()
      if (kk.hair !== built.hair) buildHair()
      if (kk.crown !== built.crown || kk.hair !== built.hair) buildCrown()
      if (kk.neck !== built.neck) buildNeck()
      if (kk.glasses !== built.glasses) buildGlasses()
      if (kk.held !== built.held) buildHeld()
      if (kk.colors !== built.colors) recolor()
      built = kk
      for (const [part, list] of fab) {
        const p = next.paint[part]
        list.forEach(f => { if (f.paint.c !== p.c || f.paint.p !== p.p) f.set(p) })
      }
      face.redraw()
      obj.traverse(x => { x.castShadow = !x.userData.noShadow })
    },
    dye(part, paint, at) {
      look.paint[part] = { ...paint }
      const list = fab.get(part)
      if (list) list.forEach(f => f.dye(paint, at))
      if (part === 'hair' || part === 'shoes') recolor()
    },
    partOf(x) {
      for (let q: Obj3 | null = x; q; q = q.parent) {
        const p = q.userData?.part
        if (p) return p as Part | 'face' | 'skin' | 'deco'
        if (q === obj) break
      }
      return null
    },
    update(dt) {
      // La pose sur ses os « normalisés » (axes de la pose en T)
      const st = state
      const set = (n: BoneName, x: number, y: number, z: number) => { const b = nb(n); if (b) b.rotation.set(x, y, z) }
      set('leftUpperArm', -st.armLf, 0, -(A0 - st.armL))
      set('rightUpperArm', -st.armRf, 0, A0 - st.armR)
      set('leftLowerArm', 0, -st.elbowL, 0)
      set('rightLowerArm', 0, st.elbowR, 0)
      set('spine', st.lean * 0.6, 0, st.sway * 0.6)
      set('chest', st.lean * 0.4, 0, st.sway * 0.4)
      set('neck', st.headX * 0.3, st.headY * 0.3, st.headZ * 0.3)
      set('head', st.headX * 0.7, st.headY * 0.7, st.headZ * 0.7)
      set('leftUpperLeg', -st.legL, 0, 0)
      set('rightUpperLeg', -st.legR, 0, 0)
      set('leftLowerLeg', st.kneeL, 0, 0)
      set('rightLowerLeg', st.kneeR, 0, 0)
      // Les doigts un peu repliés : des mains détendues, pas des planches
      for (const sd of ['left', 'right'] as const) {
        for (const f of ['Index', 'Middle', 'Ring', 'Little'] as const) {
          for (const j of ['Proximal', 'Intermediate'] as const) {
            const b = nb(`${sd}${f}${j}` as BoneName)
            if (b) b.rotation.set(0, 0, (sd === 'left' ? -1 : 1) * 0.35)
          }
        }
      }
      rig.position.y = st.bounce
      princess.flare = st.flare
      skirtFlare.rotation.y = st.skirtYaw
      const fl = princess.flare
      skirtFlare.scale.set(1 + fl * 0.28, 1 - fl * 0.1, 1 + fl * 0.28)
      wingsPivot.children.forEach(sec => sec.children.forEach(side => {
        const sd = side.userData.side as number
        if (sd) side.rotation.y = sd * (-0.5 - st.wings)
      }))
      face.update(dt)
      vrm.update(dt)
      for (const list of fab.values()) list.forEach(f => f.update(dt))
    },
    dispose() {
      for (const s of sections.values()) { s.geos.forEach(x => x.dispose()); s.mats.forEach(x => x.dispose()) }
      for (const list of fab.values()) list.forEach(f => f.dispose())
      face.dispose()
      own.geos.forEach(x => x.dispose())
      own.mats.forEach(x => x.dispose())
      own.texs.forEach(x => x.dispose())
      root.traverse(x => {
        const m = x as import('three').Mesh
        if (!m.isMesh) return
        m.geometry.dispose()
        ;(Array.isArray(m.material) ? m.material : [m.material]).forEach(q => {
          const mm = q as unknown as Record<string, unknown>
          for (const key of Object.keys(mm)) { const v = mm[key] as { isTexture?: boolean; dispose?: () => void } | null; if (v && v.isTexture) v.dispose?.() }
          q.dispose()
        })
      })
      obj.removeFromParent()
    }
  }
  princess.update(0)
  return princess
}

/* =====================================================================
   Les poses et les pas de danse
   ===================================================================== */

export type Pose = 'idle' | 'wave' | 'cheer' | 'curtsy' | 'spin' | 'jump' | 'waltz' | 'arms' | 'bow' | 'walk' | 'stride' | 'laugh' | 'photo' | 'twirl'
/** Les pas du bal : durée (s) de chacun. */
export const MOVES: Record<'spin' | 'curtsy' | 'jump' | 'waltz' | 'arms' | 'twirl', number> = {
  spin: 1.6, curtsy: 1.8, jump: 1.3, waltz: 2.4, arms: 1.8, twirl: 2
}

const ease = (t: number) => t * t * (3 - 2 * t)

/** Pose le personnage au temps `t` (secondes depuis le début de la pose).
    Renvoie la rotation (autour de Y) à AJOUTER à son orientation. */
export function posePrincess(p: Princess, pose: Pose, t: number): number {
  const s = p.pose
  Object.assign(s, restPose())
  let yaw = 0
  const breathe = Math.sin(t * 1.6)
  s.wings = Math.sin(t * 5) * 0.12
  if (pose === 'idle') {
    s.headZ = Math.sin(t * 1.2) * 0.05
    s.headX = 0.03
    s.armL = 0.12 + breathe * 0.02; s.armR = 0.12 + breathe * 0.02
    s.skirtYaw = Math.sin(t * 1.1) * 0.03
    s.bounce = breathe * 0.002
    s.sway = Math.sin(t * 0.9) * 0.02
  } else if (pose === 'wave') {
    s.armR = 2.5; s.elbowR = 0.6 + Math.sin(t * 8) * 0.35
    s.headZ = -0.12
  } else if (pose === 'cheer') {
    s.bounce = Math.abs(Math.sin(t * 5)) * 0.05
    s.armL = 2.7 + Math.sin(t * 10) * 0.12; s.armR = 2.7 + Math.sin(t * 10) * 0.12
    s.elbowL = 0.25; s.elbowR = 0.25
    s.headZ = Math.sin(t * 5) * 0.1
    s.flare = Math.abs(Math.sin(t * 5)) * 0.2
  } else if (pose === 'laugh') {
    s.lean = 0.08 + Math.sin(t * 18) * 0.04
    s.headX = 0.12 + Math.sin(t * 18) * 0.05
    s.headZ = Math.sin(t * 9) * 0.08
    s.armL = 0.35; s.armR = 0.35; s.armLf = 0.6; s.armRf = 0.6; s.elbowL = 1.5; s.elbowR = 1.5
  } else if (pose === 'photo') {
    // Une main sur la hanche, l'autre en coucou, la tête penchée
    s.armL = 0.55; s.elbowL = 1.9
    s.armR = 2.2; s.elbowR = 0.5
    s.headZ = 0.14
    s.sway = -0.05
  } else if (pose === 'curtsy') {
    const k = Math.sin(clamp(t / MOVES.curtsy, 0, 1) * Math.PI)
    s.bounce = -0.035 * k
    s.kneeL = 0.5 * k; s.kneeR = 0.5 * k; s.legL = 0.25 * k; s.legR = 0.25 * k
    s.headX = 0.3 * k; s.headZ = 0.1 * k; s.lean = 0.12 * k
    s.armL = 0.3 + 0.35 * k; s.armR = 0.3 + 0.35 * k; s.armLf = 0.2 * k; s.armRf = 0.2 * k
    s.flare = 0.12 * k
  } else if (pose === 'spin' || pose === 'twirl') {
    const D = MOVES[pose]
    const k = clamp(t / D, 0, 1)
    const turns = pose === 'twirl' ? 2 : 1
    yaw = ease(k) * Math.PI * 2 * turns
    const open = Math.sin(k * Math.PI)
    s.armL = 0.12 + open * (pose === 'twirl' ? 2.6 : 1.1); s.armR = 0.12 + open * (pose === 'twirl' ? 2.6 : 1.1)
    s.elbowL = 0.2; s.elbowR = 0.2
    s.flare = open
    s.skirtYaw = -open * 0.4
    s.bounce = open * 0.01
    s.headX = -0.1 * open
  } else if (pose === 'jump') {
    const k = clamp(t / MOVES.jump, 0, 1)
    const h = Math.max(0, Math.sin(k * Math.PI * 2)) * (k < 0.5 ? 1 : 0.6)
    s.bounce = h * 0.12
    s.armL = 0.12 + h * 2.4; s.armR = 0.12 + h * 2.4
    s.kneeL = h * 0.7; s.kneeR = h * 0.7; s.legL = h * 0.35; s.legR = h * 0.35
    s.flare = h * 0.5
  } else if (pose === 'waltz') {
    const beat = t * 2.6
    const sway = Math.sin(beat * Math.PI / 1.5)
    s.bounce = Math.abs(Math.sin(beat * Math.PI)) * 0.012
    s.sway = -sway * 0.06
    yaw = clamp(t / MOVES.waltz, 0, 1) * Math.PI * 2
    s.armL = 1.3; s.elbowL = 0.6; s.armR = 0.6; s.armRf = 0.6; s.elbowR = 1.0
    s.headZ = sway * 0.1
    s.flare = 0.25 + Math.abs(sway) * 0.2
    s.skirtYaw = -sway * 0.15
  } else if (pose === 'arms') {
    const k = clamp(t / MOVES.arms, 0, 1)
    const up = Math.sin(k * Math.PI)
    s.armL = 0.12 + up * 2.7 + Math.sin(t * 7) * 0.2 * up
    s.armR = 0.12 + up * 2.7 + Math.sin(t * 7 + 1) * 0.2 * up
    s.elbowL = Math.abs(Math.sin(t * 7)) * 0.5 * up; s.elbowR = Math.abs(Math.sin(t * 7 + 1)) * 0.5 * up
    s.sway = Math.sin(t * 3.5) * 0.06 * up
    s.headZ = Math.sin(t * 3.5) * 0.12 * up
  } else if (pose === 'bow') {
    s.bounce = -0.02
    s.headX = 0.35; s.lean = 0.2
    s.armL = 0.55; s.armR = 0.55; s.armLf = 0.35; s.armRf = 0.35
    s.kneeL = 0.3; s.kneeR = 0.3
  } else if (pose === 'walk' || pose === 'stride') {
    const q = Math.sin(t * 8) * (pose === 'stride' ? -1 : 1)
    s.legL = q * 0.4; s.legR = -q * 0.4
    s.kneeL = Math.max(0, -q) * 0.4; s.kneeR = Math.max(0, q) * 0.4
    s.armLf = -q * 0.35; s.armRf = q * 0.35
    s.bounce = Math.abs(Math.cos(t * 8)) * 0.012
    s.skirtYaw = q * 0.06
    s.flare = 0.05
  }
  return yaw
}
