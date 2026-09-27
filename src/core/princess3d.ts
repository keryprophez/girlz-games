import type { T3 } from './three3d'
import type { Clip, Hair, Paint, Part, Pattern, Royal } from './royal'
import { cloneRoyal } from './royal'

/* LA PRINCESSE en 3D (27/09) — elle remplace la petite poupée ronde de
   `doll3d.ts` partout : dans le jeu de la Princesse, sur l'écran de fin, en
   promenade sur l'accueil, en tampon et en coloriage dans l'Atelier.

   Proportions de poupée (tête moins grosse, cou, taille, coudes, mollets),
   tout au tour (LatheGeometry) ou en mèches : pas un seul modèle téléchargé.
   Origine AUX PIEDS, regard vers +z, hauteur ≈ 1 (l'échelle est sur `obj`).

   Trois choses la rendent vivante :
   - le TISSU MAGIQUE : chaque pièce a sa couleur et son motif dans un
     shader ; une teinture part du point touché et se répand en vague, avec
     un liseré qui brille (`dye`) ;
   - le VISAGE : les yeux et la bouche sont deux petits canevas redessinés
     à la volée — elle cligne, suit le doigt du regard, a des cœurs dans les
     yeux, rit, pouffe, fait un clin d'œil (`face`) ;
   - les CHEVEUX réglables : coiffure, longueur (jusqu'au sol), boucles,
     barrettes piquées où l'on veut.

   Couleurs assombries à la source (piège « couleurs vives + ACES »). */

type Obj3 = import('three').Object3D
type Grp = import('three').Group
type Geo = import('three').BufferGeometry
type Mat = import('three').Material
type Tex = import('three').Texture
type V3 = import('three').Vector3
export type Merge = (g: Geo[], groups?: boolean) => Geo | null

export const HEAD_Y = 0.815
export const HR = 0.1
const HS = [1, 1.07, 0.97] as const
/** Assombrissement des tissus sous hemi + soleil + IBL. */
const DIM = 0.74

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function shade(hex: string, k: number) {
  const [r, g, b] = rgb(hex)
  return `rgb(${clamp(Math.round(r * k), 0, 255)},${clamp(Math.round(g * k), 0, 255)},${clamp(Math.round(b * k), 0, 255)})`
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

/** Les mèches des cheveux : une texture grise (claire/sombre) que la couleur
    multiplie — une seule pour toutes les couleurs. */
let streakTex: Tex | null = null
function streaks(T: T3): Tex {
  if (streakTex) return streakTex
  const W = 512, H = 256
  const cv = canvas(W, H)
  const g = cv.getContext('2d')!
  g.fillStyle = '#E6E6E6'; g.fillRect(0, 0, W, H)
  let s = 9
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  for (let i = 0; i < 900; i++) {
    const x = rnd() * W
    const light = rnd() < 0.45
    g.strokeStyle = light ? 'rgba(255,255,255,.35)' : 'rgba(40,40,40,.22)'
    g.lineWidth = 0.6 + rnd() * 2
    g.beginPath(); g.moveTo(x, 0)
    g.bezierCurveTo(x + (rnd() - 0.5) * 8, H * 0.3, x + (rnd() - 0.5) * 8, H * 0.6, x + (rnd() - 0.5) * 12, H)
    g.stroke()
  }
  streakTex = new T.CanvasTexture(cv)
  streakTex.wrapS = streakTex.wrapT = T.RepeatWrapping
  streakTex.colorSpace = T.SRGBColorSpace
  streakTex.anisotropy = 4
  return streakTex
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

/** La tête en œuf : la mâchoire s'affine, le menton avance à peine. Sur une
    sphère unité, AVANT l'échelle HS. */
function egg(x: number, y: number, z: number): [number, number, number] {
  const k = y < 0 ? Math.pow(-y, 1.6) : 0
  return [x * (1 - 0.2 * k), y, z * (1 - 0.06 * k) + (z > 0 ? 0.04 * k * z : 0)]
}

/** Un point de la tête (repère de la tête, centre à l'origine) : az autour
    depuis le nez (+x à droite de l'image), th depuis le sommet. */
function onHead(T: T3, az: number, th: number, lift = 1) {
  const [x, y, z] = egg(Math.sin(th) * Math.sin(az), Math.cos(th), Math.sin(th) * Math.cos(az))
  return new T.Vector3(x * HR * HS[0] * lift, y * HR * HS[1] * lift, z * HR * HS[2] * lift)
}

/** Un morceau de la surface de la tête (pour les yeux et la bouche), UV 0..1. */
function headPatch(T: T3, az0: number, az1: number, th0: number, th1: number, lift: number, seg = 20) {
  const geo = new T.SphereGeometry(1, seg, seg, Math.PI / 2 + az0, az1 - az0, th0, th1 - th0)
  const p = geo.attributes.position as import('three').BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = egg(p.getX(i), p.getY(i), p.getZ(i))
    p.setXYZ(i, x * HR * HS[0] * lift, y * HR * HS[1] * lift, z * HR * HS[2] * lift)
  }
  geo.computeVertexNormals()
  return geo
}

/* =====================================================================
   Le visage vivant
   ===================================================================== */

export type Expr = 'neutral' | 'joy' | 'love' | 'laugh' | 'wink' | 'kiss' | 'wow' | 'funny' | 'sleepy'

const EYE_AZ = 0.37, EYE_TH = Math.PI / 2 + 0.04
const PX = 560 // pixels par radian des canevas du visage
const EP = { l: 0.22, r: 0.22, t: 0.34, b: 0.3 } // étendue du morceau de l'œil autour de son centre
const MP = { w: 0.27, t: 0.13, b: 0.15 } // étendue du morceau de la bouche
const MOUTH_TH = Math.PI / 2 + 0.36

interface EyeDraw { iris: string; brow: string; side: number; gx: number; gy: number; lid: number; mode: 'open' | 'happy' | 'heart' | 'wide'; blush: number; browUp: number }

function drawEye(cv: HTMLCanvasElement, o: EyeDraw) {
  const g = cv.getContext('2d')!
  const W = cv.width, H = cv.height
  g.clearRect(0, 0, W, H)
  const cx = W / 2, cy = EP.t * PX
  // Le morceau est transparent : le crâne porte la peau (aucune couture).
  // Rose aux joues en plus quand elle est amoureuse ou qu'elle rit.
  if (o.blush > 0) {
    const bx = cx + o.side * 0.1 * PX, by = cy + 0.18 * PX
    const bg = g.createRadialGradient(bx, by, 0, bx, by, 0.1 * PX)
    bg.addColorStop(0, `rgba(236,90,115,${0.45 * o.blush})`); bg.addColorStop(1, 'rgba(236,90,115,0)')
    g.fillStyle = bg; g.fillRect(0, 0, W, H)
  }
  // Fard très léger au-dessus de l'œil
  const eg = g.createRadialGradient(cx, cy - 0.12 * PX, 0, cx, cy - 0.12 * PX, 0.2 * PX)
  eg.addColorStop(0, 'rgba(214,120,160,.26)'); eg.addColorStop(1, 'rgba(214,120,160,0)')
  g.fillStyle = eg; g.fillRect(0, 0, W, H)
  // Sourcil
  g.strokeStyle = o.brow; g.lineWidth = 0.024 * PX; g.lineCap = 'round'
  const byy = cy - (0.25 + o.browUp * 0.06) * PX
  g.beginPath()
  g.moveTo(cx - o.side * 0.17 * PX, byy + 0.035 * PX)
  g.quadraticCurveTo(cx + o.side * 0.0 * PX, byy - 0.05 * PX - o.browUp * 0.02 * PX, cx + o.side * 0.16 * PX, byy + 0.02 * PX)
  g.stroke()

  const rw = 0.16 * PX * (o.mode === 'wide' ? 1.06 : 1)
  const rh = 0.19 * PX * (o.mode === 'wide' ? 1.14 : 1)
  const ink = '#2A1A18'
  if (o.mode === 'happy' || o.lid > 0.92) {
    // Paupière close : un arc (^ joyeux, ou ‿ endormi) et trois cils
    g.strokeStyle = ink; g.lineWidth = 0.034 * PX
    g.beginPath()
    if (o.mode === 'happy') {
      g.moveTo(cx - rw, cy + 0.03 * PX); g.quadraticCurveTo(cx, cy - rh * 0.75, cx + rw, cy + 0.03 * PX)
    } else {
      g.moveTo(cx - rw, cy + rh * 0.1); g.quadraticCurveTo(cx, cy + rh * 0.62, cx + rw, cy + rh * 0.1)
    }
    g.stroke()
    g.lineWidth = 0.02 * PX
    for (let k = 0; k < 3; k++) {
      const t = 0.6 + k * 0.16, lx = cx + o.side * rw * t
      const ly = o.mode === 'happy' ? cy - rh * 0.35 * (1 - t) : cy + rh * 0.3
      g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + o.side * rw * 0.22, ly - (o.mode === 'happy' ? 0.05 : -0.02) * PX); g.stroke()
    }
  } else {
    // L'ouverture : une ellipse dont la paupière du haut descend avec `lid`
    const top = cy - rh + 2 * rh * o.lid
    g.save()
    g.beginPath(); g.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2); g.clip()
    g.beginPath(); g.rect(0, top, W, H); g.clip()
    g.fillStyle = '#FBF8F4'; g.fillRect(0, 0, W, H)
    const ix = cx + o.gx * PX, iy = cy + rh * 0.08 + o.gy * PX
    const ir = 0.13 * PX
    if (o.mode === 'heart') {
      // Des cœurs dans les yeux
      g.fillStyle = '#E2457A'
      const r = ir * 0.95
      g.beginPath()
      g.moveTo(ix, iy + r * 0.95)
      g.bezierCurveTo(ix - r * 1.5, iy - r * 0.15, ix - r * 0.7, iy - r * 1.25, ix, iy - r * 0.45)
      g.bezierCurveTo(ix + r * 0.7, iy - r * 1.25, ix + r * 1.5, iy - r * 0.15, ix, iy + r * 0.95)
      g.fill()
      g.fillStyle = 'rgba(255,255,255,.9)'
      g.beginPath(); g.arc(ix - r * 0.45, iy - r * 0.45, r * 0.22, 0, Math.PI * 2); g.fill()
    } else {
      const gr = g.createRadialGradient(ix, iy + ir * 0.35, ir * 0.1, ix, iy, ir)
      gr.addColorStop(0, shade(o.iris, 1.9)); gr.addColorStop(0.55, o.iris); gr.addColorStop(1, shade(o.iris, 0.45))
      g.fillStyle = gr; g.beginPath(); g.ellipse(ix, iy, ir, ir * 1.12, 0, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#140C0A'; g.beginPath(); g.ellipse(ix, iy, ir * 0.48, ir * 0.55, 0, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#FFFFFF'
      g.beginPath(); g.arc(ix - ir * 0.38, iy - ir * 0.42, ir * 0.3, 0, Math.PI * 2); g.fill()
      g.beginPath(); g.arc(ix + ir * 0.35, iy + ir * 0.4, ir * 0.13, 0, Math.PI * 2); g.fill()
    }
    // Ombre de la paupière
    const lg = g.createLinearGradient(0, top, 0, top + rh * 0.7)
    lg.addColorStop(0, 'rgba(60,30,30,.42)'); lg.addColorStop(1, 'rgba(60,30,30,0)')
    g.fillStyle = lg; g.fillRect(0, top, W, rh)
    g.restore()
    // Trait de cils sur la paupière du haut, et trois cils vers l'extérieur
    g.strokeStyle = ink; g.lineWidth = 0.034 * PX
    g.beginPath()
    if (o.lid < 0.02) g.ellipse(cx, cy, rw, rh, 0, Math.PI * 1.08, Math.PI * 1.92)
    else {
      const hw = rw * Math.sqrt(Math.max(0, 1 - Math.pow((top - cy) / rh, 2)))
      g.moveTo(cx - hw, top); g.quadraticCurveTo(cx, top - rh * 0.08, cx + hw, top)
    }
    g.stroke()
    g.lineWidth = 0.021 * PX
    const lashY = o.lid < 0.02 ? 0 : top - (cy - rh)
    for (let k = 0; k < 3; k++) {
      const a = o.side > 0 ? Math.PI * (1.72 + k * 0.1) : Math.PI * (1.28 - k * 0.1)
      const lx = cx + Math.cos(a) * rw, ly = cy + Math.sin(a) * rh + lashY * 0.8
      g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + o.side * 0.07 * PX, ly - 0.05 * PX + k * 0.025 * PX); g.stroke()
    }
    g.lineWidth = 0.01 * PX; g.strokeStyle = 'rgba(42,26,24,.55)'
    g.beginPath(); g.ellipse(cx, cy, rw, rh, 0, Math.PI * 0.2, Math.PI * 0.8); g.stroke()
  }
}

type MouthShape = 'smile' | 'grin' | 'laugh' | 'o' | 'kiss' | 'tongue'
function drawMouth(cv: HTMLCanvasElement, shape: MouthShape, open: number) {
  const g = cv.getContext('2d')!
  const W = cv.width, H = cv.height
  g.clearRect(0, 0, W, H)
  const cx = W / 2, cy = MP.t * PX
  const X = (a: number) => cx + a * PX, Y = (t: number) => cy + t * PX
  const lip = '#C8505E', dark = '#6E1E2A', line = '#8E2F3E'
  g.lineCap = 'round'; g.lineJoin = 'round'
  if (shape === 'smile' || shape === 'tongue') {
    g.fillStyle = lip
    g.beginPath()
    g.moveTo(X(-0.17), Y(-0.04)); g.quadraticCurveTo(X(0), Y(0.1), X(0.17), Y(-0.04))
    g.quadraticCurveTo(X(0), Y(0.01), X(-0.17), Y(-0.04)); g.fill()
    g.strokeStyle = line; g.lineWidth = 0.016 * PX
    g.beginPath(); g.moveTo(X(-0.17), Y(-0.04)); g.quadraticCurveTo(X(0), Y(0.01), X(0.17), Y(-0.04)); g.stroke()
    if (shape === 'tongue') {
      g.fillStyle = '#E86F86'
      g.beginPath(); g.ellipse(X(0.02), Y(0.055), 0.07 * PX, 0.075 * PX, 0.15, 0, Math.PI * 2); g.fill()
      g.strokeStyle = '#C24A63'; g.lineWidth = 0.008 * PX
      g.beginPath(); g.moveTo(X(0.02), Y(0.02)); g.lineTo(X(0.03), Y(0.09)); g.stroke()
    } else {
      g.fillStyle = 'rgba(255,255,255,.35)'
      g.beginPath(); g.ellipse(X(0.03), Y(0.045), 0.04 * PX, 0.011 * PX, 0, 0, Math.PI * 2); g.fill()
    }
  } else if (shape === 'grin' || shape === 'laugh') {
    const w = shape === 'laugh' ? 0.19 : 0.17
    const d = (shape === 'laugh' ? 0.13 : 0.09) * (0.55 + 0.45 * open)
    g.fillStyle = dark
    g.beginPath()
    g.moveTo(X(-w), Y(-0.04)); g.quadraticCurveTo(X(0), Y(-0.01), X(w), Y(-0.04))
    g.quadraticCurveTo(X(w * 0.8), Y(d + 0.02), X(0), Y(d + 0.04)); g.quadraticCurveTo(X(-w * 0.8), Y(d + 0.02), X(-w), Y(-0.04))
    g.fill()
    g.save(); g.clip()
    g.fillStyle = '#FFFFFF'; g.fillRect(X(-w), Y(-0.05), 2 * w * PX, 0.045 * PX)
    g.fillStyle = '#E86F86'; g.beginPath(); g.ellipse(X(0), Y(d + 0.04), w * 0.6 * PX, 0.06 * PX, 0, 0, Math.PI * 2); g.fill()
    g.restore()
    g.strokeStyle = lip; g.lineWidth = 0.02 * PX
    g.beginPath()
    g.moveTo(X(-w), Y(-0.04)); g.quadraticCurveTo(X(w * 0.8 - w * 1.6), Y(d + 0.02), X(0), Y(d + 0.04))
    g.stroke()
    g.beginPath(); g.moveTo(X(w), Y(-0.04)); g.quadraticCurveTo(X(w * 0.8), Y(d + 0.02), X(0), Y(d + 0.04)); g.stroke()
  } else if (shape === 'o') {
    g.fillStyle = dark
    g.beginPath(); g.ellipse(X(0), Y(0.02), 0.055 * PX, (0.05 + 0.02 * open) * PX, 0, 0, Math.PI * 2); g.fill()
    g.strokeStyle = lip; g.lineWidth = 0.022 * PX; g.stroke()
  } else {
    // Bisou : les lèvres en cœur, avancées
    g.fillStyle = lip
    const r = 0.05 * PX
    g.beginPath()
    g.moveTo(X(0), Y(0.06))
    g.bezierCurveTo(X(-0.1), Y(0.02), X(-0.07), Y(-0.05), X(0), Y(-0.015))
    g.bezierCurveTo(X(0.07), Y(-0.05), X(0.1), Y(0.02), X(0), Y(0.06))
    g.fill()
    g.strokeStyle = line; g.lineWidth = 0.01 * PX
    g.beginPath(); g.moveTo(X(-0.04), Y(0.018)); g.lineTo(X(0.04), Y(0.018)); g.stroke()
    g.fillStyle = 'rgba(255,255,255,.4)'
    g.beginPath(); g.arc(X(0.02), Y(0.035), r * 0.18, 0, Math.PI * 2); g.fill()
  }
}

/** Le crâne : la peau, l'ombre du nez, les taches de rousseur. */
function skullCanvas(skin: string, freckles: boolean) {
  const W = 1024, H = 512
  const cv = canvas(W, H)
  const g = cv.getContext('2d')!
  g.fillStyle = skin; g.fillRect(0, 0, W, H)
  const px = W / (Math.PI * 2)
  const X = (az: number) => W * 0.25 + az * px, Y = (th: number) => (th / Math.PI) * H
  for (const s of [-1, 1]) {
    const bg = g.createRadialGradient(X(s * 0.56), Y(EYE_TH + 0.22), 0, X(s * 0.56), Y(EYE_TH + 0.22), 0.2 * px)
    bg.addColorStop(0, 'rgba(236,110,120,.42)'); bg.addColorStop(1, 'rgba(236,110,120,0)')
    g.fillStyle = bg; g.fillRect(0, 0, W, H)
  }
  const ng = g.createRadialGradient(X(0), Y(MOUTH_TH - 0.16), 0, X(0), Y(MOUTH_TH - 0.16), 0.07 * px)
  ng.addColorStop(0, 'rgba(150,80,60,.3)'); ng.addColorStop(1, 'rgba(150,80,60,0)')
  g.fillStyle = ng; g.fillRect(0, 0, W, H)
  g.strokeStyle = 'rgba(160,90,70,.5)'; g.lineWidth = 0.012 * px; g.lineCap = 'round'
  g.beginPath(); g.moveTo(X(-0.035), Y(MOUTH_TH - 0.16)); g.quadraticCurveTo(X(0), Y(MOUTH_TH - 0.135), X(0.035), Y(MOUTH_TH - 0.16)); g.stroke()
  if (freckles) {
    let s = 3
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
    g.fillStyle = 'rgba(150,80,50,.45)'
    for (const side of [-1, 1]) for (let i = 0; i < 9; i++) {
      const az = side * (0.2 + rnd() * 0.3), th = MOUTH_TH - 0.22 + rnd() * 0.12
      g.beginPath(); g.arc(X(az), Y(th), 1.2 + rnd() * 1.4, 0, Math.PI * 2); g.fill()
    }
  }
  return cv
}

export interface Face {
  expr(e: Expr, seconds?: number): void
  /** Regarder un point du monde (le doigt), ou droit devant (null). */
  lookAt(p: V3 | null): void
  current(): Expr
  update(dt: number): void
  redraw(): void
  dispose(): void
}

function makeFace(T: T3, head: Grp, look: () => Royal, live: boolean): Face {
  const texs: Tex[] = [], geos: Geo[] = [], mats: Mat[] = []
  const mk = (cv: HTMLCanvasElement, geo: Geo) => {
    const t = new T.CanvasTexture(cv)
    t.colorSpace = T.SRGBColorSpace
    t.anisotropy = 4
    texs.push(t)
    geos.push(geo)
    const m = new T.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })
    m.color.multiplyScalar(0.86)
    mats.push(m)
    const mesh = new T.Mesh(geo, m)
    mesh.renderOrder = 2
    mesh.userData.part = 'face'
    mesh.userData.noShadow = true
    head.add(mesh)
    return { cv, t }
  }
  const eyes = [-1, 1].map(side => mk(
    canvas(Math.round((EP.l + EP.r) * PX), Math.round((EP.t + EP.b) * PX)),
    headPatch(T, side * EYE_AZ - EP.l, side * EYE_AZ + EP.r, EYE_TH - EP.t, EYE_TH + EP.b, 1.004, 22)
  ))
  const mouth = mk(canvas(Math.round(MP.w * 2 * PX), Math.round((MP.t + MP.b) * PX)),
    headPatch(T, -MP.w, MP.w, MOUTH_TH - MP.t, MOUTH_TH + MP.b, 1.004, 18))

  let expr: Expr = 'neutral', exprLeft = 0
  let gx = 0, gy = 0, tgx = 0, tgy = 0
  let lid = 0, blinkIn = 1.5 + Math.random() * 2, blinkT = -1
  let glanceIn = 2
  let t = 0
  let sig = ''
  const target = new T.Vector3()
  let tracking = false

  const draw = (force = false) => {
    const L = look()
    const laughOpen = expr === 'laugh' ? 0.5 + 0.5 * Math.sin(t * 22) : expr === 'joy' ? 0.7 : 0.5
    const modeFor = (side: number): EyeDraw['mode'] =>
      expr === 'joy' || expr === 'laugh' ? 'happy'
        : expr === 'love' ? 'heart'
          : expr === 'wow' ? 'wide'
            : (expr === 'wink' || expr === 'funny') && side > 0 ? 'happy'
              : 'open'
    const lidFor = (side: number) => expr === 'sleepy' ? 0.62 : expr === 'kiss' ? 1 : (modeFor(side) === 'open' || modeFor(side) === 'heart' || modeFor(side) === 'wide') ? lid : 0
    const mouthShape: MouthShape = expr === 'joy' ? 'grin' : expr === 'laugh' ? 'laugh' : expr === 'wow' ? 'o' : expr === 'kiss' ? 'kiss' : expr === 'funny' ? 'tongue' : 'smile'
    const s = [L.skin, L.eyes, L.paint.hair.c, expr, gx.toFixed(3), gy.toFixed(3), lidFor(-1).toFixed(2), lidFor(1).toFixed(2), laughOpen.toFixed(1)].join('|')
    if (!force && s === sig) return
    const mouthChanged = !sig || force || sig.split('|')[3] !== expr || expr === 'laugh'
    sig = s
    eyes.forEach((e, i) => {
      const side = i === 0 ? -1 : 1
      drawEye(e.cv, {
        iris: L.eyes, brow: shade(L.paint.hair.c, 0.7), side,
        gx, gy, lid: lidFor(side), mode: modeFor(side),
        blush: expr === 'love' || expr === 'laugh' || expr === 'kiss' ? 1 : 0,
        browUp: expr === 'wow' ? 1 : expr === 'love' ? 0.4 : 0
      })
      e.t.needsUpdate = true
    })
    if (mouthChanged) { drawMouth(mouth.cv, mouthShape, laughOpen); mouth.t.needsUpdate = true }
  }
  draw(true)

  return {
    expr(e, seconds = 2) { expr = e; exprLeft = e === 'neutral' ? 0 : seconds; if (live) draw() },
    lookAt(p) { if (p) { target.copy(p); tracking = true } else tracking = false },
    current: () => expr,
    update(dt) {
      if (!live) return
      t += dt
      if (exprLeft > 0) { exprLeft -= dt; if (exprLeft <= 0) expr = 'neutral' }
      // Le regard : vers le doigt, ou de petits coups d'œil de temps en temps
      if (tracking) {
        const loc = head.worldToLocal(target.clone())
        const az = Math.atan2(loc.x, loc.z), el = Math.atan2(loc.y, Math.hypot(loc.x, loc.z))
        tgx = clamp(az * 0.12, -0.055, 0.055)
        tgy = clamp(-el * 0.1, -0.035, 0.045)
      } else {
        glanceIn -= dt
        if (glanceIn < 0) {
          glanceIn = 1.6 + Math.random() * 2.8
          const r = Math.random()
          tgx = r < 0.5 ? 0 : (Math.random() - 0.5) * 0.08
          tgy = r < 0.5 ? 0 : (Math.random() - 0.5) * 0.04
        }
      }
      gx += (tgx - gx) * Math.min(1, dt * 14)
      gy += (tgy - gy) * Math.min(1, dt * 14)
      // Clignement : 140 ms toutes les 2 à 5 secondes
      if (blinkT < 0) {
        blinkIn -= dt
        if (blinkIn < 0) { blinkT = 0; blinkIn = 2 + Math.random() * 3 }
      } else {
        blinkT += dt
        const k = blinkT / 0.14
        lid = k < 0.5 ? k * 2 : Math.max(0, 2 - k * 2)
        if (k >= 1) { blinkT = -1; lid = 0 }
      }
      draw()
    },
    redraw() { draw(true) },
    dispose() {
      texs.forEach(x => x.dispose()); geos.forEach(x => x.dispose()); mats.forEach(x => x.dispose())
    }
  }
}

/* =====================================================================
   Les cheveux
   ===================================================================== */

/** La ligne de naissance des cheveux : angle depuis le sommet (θ), selon
    l'écart au milieu du front (d ∈ [0, π]). */
function hairlineTheta(d: number, style: Hair['style']) {
  const front = style === 'bun' || style === 'ponytail' ? 0.28 : 0.31
  return Math.PI * (front + 0.5 * Math.pow(d / Math.PI, 1.5))
}

interface HairCtx {
  /** Rayon de la jupe à la hauteur y (0 au-dessus de la taille) : les
      cheveux très longs passent PAR-DESSUS la robe. */
  skirtR(y: number): number
  cape: boolean
}

interface HairBuild { geo: Geo; seat: number }

/** Construit tous les cheveux d'une coiffure en UNE géométrie (repère de la tête). */
function buildHair(T: T3, merge: Merge, hair: Hair, hc: HairCtx): HairBuild {
  const parts: Geo[] = []
  const style = hair.style
  const wave = 0.004 + hair.curl * 0.024
  const V = (x: number, y: number, z: number) => new T.Vector3(x, y, z)
  const HC = V(0, HEAD_Y, 0)
  const axisHead = V(0, 0, 0)
  const toBody = (v: V3) => v.clone().add(HC)
  const lockHead = (pts: V3[], w0: number, w1: number, flat = 0.4) => parts.push(lockGeo(T, pts, w0, w1, flat, axisHead, 20, 8))
  const lockBody = (pts: V3[], w0: number, w1: number, flat = 0.35) =>
    parts.push(lockGeo(T, pts.map(p => p.clone().sub(HC)), w0, w1, flat, V(0, 0, 0), 34, 9))
  let seed = 11
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }

  /* --- La calotte : elle épouse la ligne de naissance --- */
  const puff = style === 'afro' ? 1.1 + hair.len * 0.12 : 1.02
  const vol = style === 'loose' ? 0.06 + Math.min(1, hair.len) * 0.03 : style === 'braid' ? 0.08 : 0.02
  const cap = new T.SphereGeometry(HR * 1.055, 64, 40)
  {
    const p = cap.attributes.position as import('three').BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
      const r = Math.hypot(x, y, z)
      const th = Math.acos(clamp(y / r, -1, 1))
      const d = Math.abs(Math.atan2(x, z))
      const lim = hairlineTheta(d, style)
      const k = smooth(lim - 0.05, lim + 0.06, th)
      const f = (1 - k * 0.14) * (1 + (puff - 1) * Math.max(0, Math.cos(th) + (style === 'afro' ? 0.5 : 0)) * (1 - k)) *
        (1 + vol * Math.pow(Math.sin(th), 2) * (0.45 + 0.55 * smooth(0.4, 2.2, d)) * (1 - k))
      const [ex, ey, ez] = egg(x / (HR * 1.055), y / (HR * 1.055), z / (HR * 1.055))
      p.setXYZ(i, ex * HR * 1.055 * f * HS[0], ey * HR * 1.055 * f * HS[1], ez * HR * 1.055 * f * HS[2])
    }
    cap.computeVertexNormals()
  }
  parts.push(cap)
  const onCap = (az: number, th: number, lift = 1.05) => onHead(T, az, th, lift)

  /* --- Frange balayée (sauf chignon, queue de cheval, boucles) --- */
  if (style === 'loose' || style === 'braid' || style === 'pigtails') {
    for (let i = 0; i < 8; i++) {
      const a0 = 0.22 - i * 0.045, a1 = -0.05 - i * 0.15
      const pts: V3[] = []
      for (let k = 0; k <= 6; k++) {
        const t = k / 6
        const th = 0.08 * Math.PI + (0.36 * Math.PI - 0.08 * Math.PI) * Math.pow(t, 0.75) + (i > 4 ? t * 0.12 : 0)
        pts.push(onCap(a0 + (a1 - a0) * t, th, 1.06 + Math.sin(t * Math.PI) * 0.07 + t * 0.02))
      }
      lockHead(pts, 0.04, 0.03, 0.4)
    }
    for (let i = 0; i < 3; i++) {
      const pts: V3[] = []
      for (let k = 0; k <= 5; k++) {
        const t = k / 5
        pts.push(onCap(0.3 + i * 0.13 + t * (0.28 + i * 0.1), 0.08 * Math.PI + t * 0.26 * Math.PI, 1.06 + Math.sin(t * Math.PI) * 0.06 + t * 0.02))
      }
      lockHead(pts, 0.038, 0.028, 0.4)
    }
  }

  /** Repousse un point hors de la robe (et de la cape) : les cheveux tombent dessus. */
  const clear = (p: V3, margin = 0.018) => {
    const need = hc.skirtR(p.y) + margin + (hc.cape && p.y < 0.72 ? 0.035 : 0)
    const r = Math.hypot(p.x, p.z)
    if (need > 0 && r < need) {
      if (r < 1e-4) p.z = -need
      else { p.x *= need / r; p.z *= need / r }
    }
    return p
  }
  /** Le bas des cheveux lâchés (y du corps) selon la longueur. */
  const endY = (len: number) => len <= 1 ? 0.735 - len * 0.28 : 0.455 - (len - 1) * 0.67
  let seat = style === 'afro' ? 1.2 + hair.len * 0.14 : 1.1

  if (style === 'loose' && hair.len < 0.28) {
    // Carré : les pointes rentrent sous la mâchoire
    const k = hair.len / 0.28
    for (let i = 0; i < 22; i++) {
      const a = Math.PI * (0.3 + 1.4 * (i / 21))
      lockHead([onCap(a, 0.26 * Math.PI, 1.04), onCap(a, 0.5 * Math.PI, 1.17), onCap(a, (0.64 + k * 0.06) * Math.PI, 1.16),
        onCap(a - Math.sign(Math.sin(a)) * 0.05, (0.74 + k * 0.06) * Math.PI, 1.02)], 0.046, 0.04, 0.34)
    }
  } else if (style === 'loose') {
    const yEnd = endY(hair.len)
    const N = 26
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1)
      const a = Math.PI * (0.56 + 0.88 * u) + (rnd() - 0.5) * 0.04
      const sa = Math.sin(a), ca = Math.cos(a)
      const side = Math.abs(sa)
      const zb = (z: number) => Math.min(z, -0.07 - (1 - side) * 0.025 - (hc.cape ? 0.03 : 0))
      const ph = rnd() * 6
      const end = yEnd + rnd() * 0.04
      const pts = [toBody(onCap(a, 0.3 * Math.PI, 1.05)), toBody(onCap(a, 0.55 * Math.PI, 1.17))]
      // Des points tous les 8 cm jusqu'au bout, écartés de la robe
      const y0 = HEAD_Y - 0.04
      const n = Math.max(3, Math.ceil((y0 - end) / 0.08))
      for (let k = 1; k <= n; k++) {
        const t = k / n
        const y = lerp(0.7, end, (k - 1) / Math.max(1, n - 1))
        const w = Math.sin(t * 11 + ph) * wave * Math.min(1, t * 2)
        const spread = 1 + t * 0.15 * Math.min(1, hair.len)
        pts.push(clear(V(sa * 0.108 * spread + w * Math.abs(ca), y, zb(ca * 0.1 * spread - 0.01 * t) + w * sa * 0.5)))
      }
      lockBody(pts, 0.042, 0.034, 0.34)
    }
    // Devant : deux mèches de chaque côté, sur la poitrine (pas plus bas que la taille)
    const frontEnd = Math.max(0.5, yEnd + 0.04)
    for (const s of [-1, 1]) for (let j = 0; j < 2; j++) {
      const a = s * Math.PI * (0.3 + j * 0.08)
      const w = (t: number) => s * Math.sin(t * 11 + j * 2) * wave * t
      lockBody([
        toBody(onCap(a, 0.27 * Math.PI, 1.04)),
        toBody(onCap(a + s * 0.08, 0.5 * Math.PI, 1.12)),
        V(s * (0.088 + j * 0.008), HEAD_Y - 0.1, 0.045 - j * 0.015),
        V(s * (0.078 + j * 0.01) + w(0.45), Math.max(frontEnd + 0.1, 0.67), 0.07 - j * 0.008),
        V(s * (0.07 + j * 0.01) + w(0.7), Math.max(frontEnd + 0.05, 0.59), 0.074),
        V(s * (0.066 + j * 0.012) + w(0.95), frontEnd + j * 0.025, 0.078)
      ], 0.034, 0.026, 0.3)
    }
  } else if (style === 'braid') {
    // Une grosse tresse sur l'épaule, plus ou moins longue
    const bEnd = Math.max(0.12, 0.6 - hair.len * 0.3)
    const ctrl = [toBody(onCap(Math.PI * 0.62, 0.55 * Math.PI, 1.0)), V(0.1, 0.72, -0.04), V(0.1, 0.66, 0.05), V(0.085, 0.58, 0.08)]
    for (let y = 0.5; y > bEnd; y -= 0.08) ctrl.push(clear(V(0.074, y, 0.086 + (0.58 - y) * 0.05), 0.03))
    ctrl.push(clear(V(0.072, bEnd, 0.09 + (0.58 - bEnd) * 0.05), 0.03))
    const path = new T.CatmullRomCurve3(ctrl)
    const n = Math.round(10 + path.getLength() * 34)
    for (let k = 0; k < n; k++) {
      const t = (k / (n - 1)) * 0.94
      const p = path.getPointAt(t), tg = path.getTangentAt(t)
      const s = k % 2 ? 1 : -1
      const r = 0.03 * (1 - t * 0.4)
      const q = new T.Quaternion().setFromUnitVectors(V(0, 1, 0), tg.clone().negate())
      const e = new T.SphereGeometry(1, 14, 10)
      e.scale(r * 1.05, r * 1.45, r * 0.85)
      e.rotateZ(s * 0.55)
      e.applyQuaternion(q)
      const side = V(1, 0, 0).applyQuaternion(q).multiplyScalar(s * r * 0.35)
      e.translate(p.x + side.x - HC.x, p.y + side.y - HC.y, p.z + side.z - HC.z)
      parts.push(e)
    }
    const tip = path.getPointAt(0.995).sub(HC)
    parts.push(lockGeo(T, [tip.clone().add(V(0, 0.03, 0)), tip.clone().add(V(0.004, -0.02, 0.004)), tip.clone().add(V(-0.004, -0.06, 0.01))], 0.022, 0.03, 0.6, axisHead, 12, 8))
    for (let i = 0; i < 9; i++) {
      const u = i / 8, a = Math.PI * (0.62 + 0.76 * u), sa = Math.sin(a), ca = Math.cos(a)
      lockBody([toBody(onCap(a, 0.45 * Math.PI, 1.03)), V(sa * 0.11, HEAD_Y - 0.04, ca * 0.115), V(sa * 0.09, 0.71, Math.min(ca * 0.09, -0.07))], 0.034, 0.024, 0.35)
    }
  } else if (style === 'bun') {
    const bun = new T.SphereGeometry(0.064, 32, 20)
    bun.scale(1, 0.85, 1); bun.translate(0, 0.1, -0.035)
    parts.push(bun)
    const wrap = new T.TorusGeometry(0.05, 0.022, 12, 32)
    wrap.rotateX(Math.PI / 2 - 0.4); wrap.translate(0, 0.085, -0.03)
    parts.push(wrap)
    for (const s of [-1, 1]) {
      lockHead([onCap(s * 0.95, 0.36 * Math.PI, 1.04), onCap(s * 1.02, 0.5 * Math.PI, 1.1), V(s * 0.093, -0.06, 0.035), V(s * 0.085, -0.1, 0.04)], 0.013, 0.01, 0.6)
    }
    seat = 1.08
  } else if (style === 'ponytail' || style === 'pigtails') {
    const ties = style === 'ponytail' ? [onCap(Math.PI, 0.28 * Math.PI, 1.02)] : [onCap(Math.PI * 0.7, 0.42 * Math.PI, 1.03), onCap(-Math.PI * 0.7, 0.42 * Math.PI, 1.03)]
    const L = 0.12 + hair.len * 0.22
    ties.forEach((P, ti) => {
      const s = style === 'ponytail' ? 0 : ti === 0 ? 1 : -1
      const n = style === 'ponytail' ? 9 : 6
      for (let k = 0; k < n; k++) {
        const o = (k / (n - 1) - 0.5) * 0.04
        const w = (t: number) => Math.sin(t * 9 + k) * wave * t
        const raw = style === 'ponytail'
          ? [P.clone(), P.clone().add(V(o * 0.5, 0.035, -0.05)), P.clone().add(V(o + w(0.3), -0.03, -0.12)), P.clone().add(V(o * 1.3 + w(0.6), -0.03 - L * 0.5, -0.13)), P.clone().add(V(o * 1.5 + w(1), -0.03 - L, -0.1 - Math.abs(o)))]
          : [P.clone(), P.clone().add(V(s * 0.04, 0, -0.02 + o * 0.4)), P.clone().add(V(s * 0.065, -0.07, -0.04 + o)), P.clone().add(V(s * 0.06 + o * 0.3 + w(0.6), -0.07 - L * 0.45, -0.06 + o)), P.clone().add(V(s * 0.05 + o * 0.5 + w(1), -0.07 - L, -0.055 + o))]
        // Les queues très longues passent sur la robe
        const pts = raw.map((p, i) => i < 2 ? p : clear(p.clone().add(HC), 0.02).sub(HC))
        lockHead(pts, 0.03, 0.026, 0.55)
      }
    })
    seat = 1.08
  } else if (style === 'afro') {
    const R = 1.15 + hair.len * 0.1
    for (let i = 0; i < 80; i++) {
      const az = (rnd() * 2 - 1) * Math.PI
      const d = Math.abs(az)
      const th = 0.1 * Math.PI + rnd() * (d < 0.9 ? 0.22 * Math.PI : 0.62 * Math.PI)
      if (d < 0.9 && th > hairlineTheta(d, 'afro') + 0.05) continue
      const r = (0.026 + rnd() * 0.02) * (0.8 + hair.curl * 0.4)
      const p = onCap(az, th, R + rnd() * 0.12)
      if (th > 0.6 * Math.PI) { p.x *= 1.15; p.z *= 1.1 }
      const e = new T.SphereGeometry(r, 14, 10)
      e.translate(p.x, p.y, p.z)
      parts.push(e)
    }
  }

  const geo = merge(parts.map(x => {
    const g = x.index ? x.toNonIndexed() : x
    if (!g.attributes.uv) g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    return g
  }), false)!
  parts.forEach(x => x.dispose())
  return { geo, seat }
}

/* =====================================================================
   Le personnage
   ===================================================================== */

export interface Princess {
  obj: Grp
  /** Le corps entier (sauts, révérence) ; la jupe a son propre pivot. */
  rig: Grp
  head: Grp
  armL: Grp
  armR: Grp
  foreL: Grp
  foreR: Grp
  legL: Grp
  legR: Grp
  /** Pivot de la jupe (à la taille) : elle tourne et s'évase dans les pirouettes. */
  skirt: Grp
  wings: Grp
  face: Face
  look: Royal
  /** Évasement de la jupe, 0..1 (pirouettes). */
  flare: number
  /** Met à jour la tenue : ne reconstruit que ce qui a changé. */
  set(r: Royal): void
  /** La teinture magique sur une pièce, depuis un point du monde. */
  dye(part: Part, paint: Paint, at: V3): void
  /** La pièce (ou « face », « skin ») sous un objet touché. */
  partOf(o: Obj3): Part | 'face' | 'skin' | 'deco' | null
  update(dt: number): void
  dispose(): void
}

let mergeFn: Merge | null = null
export async function merger(): Promise<Merge> {
  if (!mergeFn) {
    const m = await import('three/examples/jsm/utils/BufferGeometryUtils.js')
    mergeFn = m.mergeGeometries as Merge
  }
  return mergeFn
}

interface Section {
  group: Grp
  geos: Geo[]
  mats: Mat[]
}

/** Les pièces de tissu et leur réglage de rendu. */
const FABRIC_OPTS: Record<Part, FabricOpts> = {
  hair: { roughness: 0.42 },
  bodice: { satin: true, repeat: [6, 2] },
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

export async function makePrincess(T: T3, look0: Royal, o: PrincessOpts = {}): Promise<Princess> {
  const merge = await merger()
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

  /* --- Les matériaux de tissu, un par pièce (réutilisés d'une tenue à l'autre) --- */
  const fab = new Map<Part, Fabric[]>()
  const extra = new Map<Part, Fabric>()
  const fabricOf = (part: Part, variant?: FabricOpts) => {
    if (variant) {
      // Une variante (le tulle transparent du jupon) : une deuxième matière pour la même pièce
      const key = (part + ':v') as Part
      let f = extra.get(key)
      if (!f) {
        f = fabric(T, look.paint[part], { ...FABRIC_OPTS[part], ...variant, low: o.low })
        extra.set(key, f)
        fab.set(part, [...(fab.get(part) || []), f])
      }
      return f
    }
    let list = fab.get(part)
    let f = list?.find(x => !Array.from(extra.values()).includes(x))
    if (!f) {
      f = fabric(T, look.paint[part], { ...FABRIC_OPTS[part], low: o.low, map: part === 'hair' ? streaks(T) : undefined, bump: part === 'hair' ? streaks(T) : undefined })
      list = [...(list || []), f]
      fab.set(part, list)
    }
    return f
  }
  const partMat = (part: Part, variant?: FabricOpts) => fabricOf(part, variant).mat

  const skinMat = std({ color: look.skin, roughness: 0.55 }, 0.86)
  const gold = std({ color: 0xE3B04B, metalness: 1, roughness: 0.28 })
  const gems = new Map<number, Mat>()
  const gem = (c: number) => {
    let m = gems.get(c)
    if (!m) { m = phys({ color: c, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 }); gems.set(c, m) }
    return m
  }
  const pearl = phys({ color: 0xF4EEE8, roughness: 0.25, iridescence: 0.5, clearcoat: 1 })
  pearl.color.multiplyScalar(0.85)

  const mesh = (geo: Geo, m: Mat, part?: string) => {
    const x = new T.Mesh(geo, m)
    x.castShadow = true
    if (part) x.userData.part = part
    return x
  }
  const place = <O extends Obj3>(x: O, px: number, py: number, pz: number, sx = 1, sy = sx, sz = sx) => {
    x.position.set(px, py, pz); x.scale.set(sx, sy, sz); return x
  }
  const sphere = g(new T.SphereGeometry(1, 28, 18))
  const limb = (pts: number[][]) => g(lathe(T, pts, 20))

  const obj = new T.Group()
  const rig = new T.Group()
  obj.add(rig)

  /* --- Jambes (pivot à la hanche) --- */
  const legs = [1, -1].map(s => {
    const p = new T.Group()
    p.position.set(s * 0.035, 0.47, 0)
    p.add(mesh(limb([[0.001, -0.456], [0.014, -0.45], [0.016, -0.42], [0.022, -0.35], [0.025, -0.3], [0.021, -0.245], [0.023, -0.22], [0.03, -0.12], [0.033, -0.03], [0.02, 0.005], [0.001, 0.012]]), skinMat, 'skin'))
    rig.add(p)
    return p
  })
  const [legL, legR] = legs

  /* --- Buste : épaules, cou --- */
  rig.add(place(mesh(g(lathe(T, [[0.001, 0.655], [0.058, 0.655], [0.07, 0.668], [0.076, 0.683], [0.06, 0.7], [0.034, 0.712], [0.024, 0.72], [0.024, 0.78]], 40)), skinMat, 'skin'), 0, 0, 0, 1, 1, 0.7))

  /* --- Bras : épaule → coude → poignet --- */
  const arms = [1, -1].map(s => {
    const sh = new T.Group()
    sh.position.set(s * 0.074, 0.672, 0)
    sh.add(mesh(limb([[0.001, -0.148], [0.014, -0.142], [0.016, -0.1], [0.019, -0.04], [0.02, 0], [0.012, 0.015], [0.001, 0.02]]), skinMat, 'skin'))
    const fore = new T.Group()
    fore.position.set(0, -0.14, 0)
    fore.add(mesh(limb([[0.001, -0.124], [0.0105, -0.118], [0.013, -0.08], [0.0155, -0.03], [0.0145, 0], [0.008, 0.01], [0.001, 0.014]]), skinMat, 'skin'))
    fore.add(place(mesh(sphere, skinMat, 'skin'), 0, -0.128, 0.004, 0.017, 0.026, 0.011))
    fore.add(place(mesh(sphere, skinMat, 'skin'), -s * 0.012, -0.12, 0.009, 0.006, 0.012, 0.006))
    sh.add(fore)
    rig.add(sh)
    return { sh, fore }
  })
  const [aL, aR] = arms

  /* --- La tête et le visage --- */
  const head = new T.Group()
  head.position.set(0, HEAD_Y, 0)
  rig.add(head)
  const skullCv = { cv: skullCanvas(look.skin, look.freckles) }
  const skullTex = new T.CanvasTexture(skullCv.cv)
  skullTex.colorSpace = T.SRGBColorSpace
  own.texs.push(skullTex)
  const faceMat = std({ map: skullTex, roughness: 0.55 }, 0.86)
  const skullGeo = g(new T.SphereGeometry(1, 64, 40))
  {
    const p = skullGeo.attributes.position as import('three').BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const [x, y, z] = egg(p.getX(i), p.getY(i), p.getZ(i))
      p.setXYZ(i, x * HR * HS[0], y * HR * HS[1], z * HR * HS[2])
    }
    skullGeo.computeVertexNormals()
  }
  head.add(mesh(skullGeo, faceMat, 'face'))
  for (const s of [-1, 1]) head.add(place(mesh(sphere, skinMat, 'skin'), s * 0.097, -0.005, -0.008, 0.012, 0.022, 0.014))
  const face = makeFace(T, head, () => look, live)

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

  /** Fusionne des morceaux déjà placés en une seule géométrie (un seul appel de rendu). */
  const fuse = (s: Section, pieces: { geo: Geo; m: import('three').Matrix4 }[]) => {
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
    new T.Matrix4().compose(new T.Vector3(px, py, pz), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz))

  const skirtPivot = new T.Group()
  skirtPivot.position.y = 0.535
  rig.add(skirtPivot)
  const wingsPivot = new T.Group()
  wingsPivot.position.set(0, 0.61, -0.065)
  rig.add(wingsPivot)

  /** Rayon de la jupe à une hauteur donnée (les cheveux et la cape l'évitent). */
  let skirtR: (y: number) => number = () => 0

  /* ---- Le haut ---- */
  function buildTop() {
    const s = section('top', rig)
    const bodice = mesh(sg(s, lathe(T, [[0.001, 0.5], [0.05, 0.5], [0.047, 0.535], [0.052, 0.57], [0.063, 0.61], [0.066, 0.64], [0.063, 0.662], [0.001, 0.662]], 40)), partMat('bodice'), 'bodice')
    bodice.scale.set(1, 1, 0.78)
    s.group.add(bodice)
    const trim = mesh(sg(s, new T.TorusGeometry(0.064, 0.006, 8, 48)), partMat('belt'), 'belt')
    trim.rotation.x = Math.PI / 2; trim.position.y = 0.66; trim.scale.set(1, 0.78, 1)
    s.group.add(trim)
    // Les manches suivent les bras : elles sont rangées dans les épaules
    const armBits = [section('sleeveL', aL.sh), section('sleeveR', aR.sh), section('cuffL', aL.fore), section('cuffR', aR.fore)]
    if (look.top === 'puff') {
      for (const [i, sd] of [[0, 1], [1, -1]] as [number, number][]) {
        const b = armBits[i]
        b.group.add(place(mesh(sphere, partMat('sleeves'), 'sleeves'), sd * 0.006, -0.012, 0, 0.042, 0.036, 0.04))
        const cuff = mesh(sg(b, new T.TorusGeometry(0.03, 0.006, 6, 24)), partMat('belt'), 'belt')
        cuff.position.set(sd * 0.006, -0.043, 0); cuff.rotation.x = Math.PI / 2
        b.group.add(cuff)
      }
    } else if (look.top === 'long') {
      for (const [i, sd] of [[0, 1], [1, -1]] as [number, number][]) {
        const up = armBits[i]
        up.group.add(place(mesh(sphere, partMat('sleeves'), 'sleeves'), sd * 0.004, -0.008, 0, 0.034, 0.03, 0.033))
        up.group.add(mesh(sg(up, lathe(T, [[0.001, -0.152], [0.0215, -0.15], [0.023, -0.1], [0.025, -0.04], [0.028, 0], [0.018, 0.02], [0.001, 0.024]], 20)), partMat('sleeves'), 'sleeves'))
        const lo = armBits[i + 2]
        const bell = sg(lo, folds(lathe(T, [[0.046, -0.118], [0.047, -0.11], [0.03, -0.06], [0.019, -0.01], [0.017, 0.012]], 32), 8, 0.1, 0.0, -0.118))
        lo.group.add(mesh(bell, partMat('sleeves'), 'sleeves'))
        const cuff = mesh(sg(lo, new T.TorusGeometry(0.046, 0.005, 6, 32)), partMat('belt'), 'belt')
        cuff.position.y = -0.117; cuff.rotation.x = Math.PI / 2
        lo.group.add(cuff)
      }
    }
  }

  /* ---- La jupe (et la traîne, la ceinture, les jambes visibles) ---- */
  function buildSkirt() {
    const s = section('skirt', skirtPivot)
    const W = 0.535
    const add = (geo: Geo, part: Part, variant?: FabricOpts) => { const m = mesh(sg(s, geo), partMat(part, variant), part); m.position.y = -W; s.group.add(m); return m }
    const tulle: FabricOpts = { opacity: 0.82, satin: false }
    const kind = look.skirt
    let prof: number[][]
    if (kind === 'ball') {
      prof = [[0.27, 0.012], [0.29, 0.02], [0.28, 0.07], [0.25, 0.16], [0.21, 0.26], [0.16, 0.36], [0.105, 0.45], [0.07, 0.5], [0.049, W]]
      add(folds(lathe(T, prof, 96), 14, 0.07, W), 'under')
      add(folds(lathe(T, [[0.3, 0.045], [0.29, 0.08], [0.262, 0.16], [0.225, 0.25], [0.175, 0.35], [0.12, 0.44], [0.08, 0.49], [0.052, 0.53]], 80, 0.55, Math.PI * 2 - 1.1), 12, 0.09, 0.53), 'skirt')
      const hem = mesh(sg(s, new T.TorusGeometry(0.285, 0.014, 8, 96)), partMat('under'), 'under')
      hem.rotation.x = Math.PI / 2; hem.position.y = 0.02 - W
      s.group.add(hem)
    } else if (kind === 'short') {
      prof = [[0.19, 0.335], [0.2, 0.345], [0.18, 0.38], [0.13, 0.44], [0.075, 0.5], [0.049, W]]
      add(folds(lathe(T, prof, 96), 14, 0.07, W), 'skirt')
      add(folds(lathe(T, [[0.215, 0.32], [0.2, 0.37], [0.14, 0.43], [0.06, 0.5]], 96), 22, 0.1, 0.5), 'under', tulle)
    } else if (kind === 'mermaid') {
      prof = [[0.24, 0.015], [0.2, 0.05], [0.12, 0.12], [0.085, 0.2], [0.075, 0.26], [0.082, 0.33], [0.09, 0.42], [0.07, 0.49], [0.049, W]]
      add(folds(lathe(T, prof, 96), 12, 0.1, 0.2), 'skirt')
      add(folds(lathe(T, [[0.265, 0.012], [0.22, 0.06], [0.13, 0.15], [0.092, 0.2]], 96), 24, 0.12, 0.2), 'under', tulle)
    } else if (kind === 'layers') {
      prof = [[0.27, 0.015], [0.22, 0.12], [0.17, 0.21], [0.15, 0.3], [0.12, 0.38], [0.06, 0.51], [0.049, W]]
      add(lathe(T, [[0.22, 0.015], [0.12, 0.3], [0.05, W]], 48), 'under')
      add(folds(lathe(T, [[0.28, 0.015], [0.285, 0.025], [0.22, 0.12], [0.17, 0.21]], 96), 26, 0.06, 0.21), 'skirt')
      add(folds(lathe(T, [[0.205, 0.2], [0.21, 0.21], [0.16, 0.3], [0.12, 0.38]], 96), 24, 0.06, 0.38), 'under')
      add(folds(lathe(T, [[0.145, 0.38], [0.15, 0.39], [0.1, 0.46], [0.06, 0.51], [0.049, W]], 96), 20, 0.06, W), 'skirt')
    } else {
      // Pétales de fée : huit pétales pointus, et un jupon de tulle dessous
      prof = [[0.2, 0.3], [0.16, 0.4], [0.1, 0.47], [0.05, W]]
      add(folds(lathe(T, [[0.2, 0.34], [0.19, 0.38], [0.13, 0.44], [0.06, 0.5]], 96), 22, 0.1, 0.5), 'under', tulle)
      for (let i = 0; i < 8; i++) {
        const geo = lathe(T, [[0.22, 0.3], [0.2, 0.34], [0.15, 0.41], [0.1, 0.47], [0.052, W]], 12, (i / 8) * Math.PI * 2 - 0.05, (Math.PI * 2) / 8 * 1.25)
        const p = geo.attributes.position as import('three').BufferAttribute
        const uvs = geo.attributes.uv as import('three').BufferAttribute
        for (let k = 0; k < p.count; k++) {
          const f = uvs.getX(k)
          const y = p.getY(k)
          const up = (1 - Math.sin(Math.PI * f)) * (W - y) * 0.55
          const rr = 1 + (i % 2) * 0.03
          p.setXYZ(k, p.getX(k) * rr, y + up, p.getZ(k) * rr)
        }
        geo.computeVertexNormals()
        add(geo, i % 2 ? 'under' : 'skirt')
      }
    }
    // Le rayon de la jupe, pour les cheveux et la cape : interpolé sur le profil
    const pr = prof.slice().sort((a, b) => a[1] - b[1])
    skirtR = (y: number) => {
      if (y > W || y < pr[0][1] - 0.01) return 0
      for (let i = 1; i < pr.length; i++) {
        if (y <= pr[i][1]) {
          const t = (y - pr[i - 1][1]) / Math.max(1e-6, pr[i][1] - pr[i - 1][1])
          return lerp(pr[i - 1][0], pr[i][0], t) * 1.08 + 0.01
        }
      }
      return pr[pr.length - 1][0]
    }
    // La traîne : un pan de robe qui glisse derrière elle sur le sol
    if (look.train && (kind === 'ball' || kind === 'mermaid')) {
      const geo = new T.PlaneGeometry(1, 1, 14, 36)
      const p = geo.attributes.position as import('three').BufferAttribute
      for (let k = 0; k < p.count; k++) {
        const u = p.getX(k) + 0.5, v = 0.5 - p.getY(k) // v : 0 à la taille, 1 au bout
        const width = lerp(0.16, 0.62, Math.pow(v, 0.7))
        let y: number, z: number
        if (v < 0.45) {
          const t = v / 0.45
          y = lerp(0.5, 0.012, t)
          z = -(skirtR(y) + 0.012)
        } else {
          const t = (v - 0.45) / 0.55
          y = 0.012 + Math.sin(t * Math.PI) * 0.01
          z = -(skirtR(0.02) + 0.012) - t * 0.62
        }
        const x = (u - 0.5) * width
        p.setXYZ(k, x, y - W + Math.cos((u - 0.5) * Math.PI * 3) * 0.004, z)
      }
      geo.computeVertexNormals()
      const m = mesh(sg(s, geo), partMat('skirt'), 'skirt')
      s.group.add(m)
    }
    // La ceinture : un ruban, et un gros nœud dans le dos sous les robes longues
    const sash = mesh(sg(s, new T.TorusGeometry(0.05, 0.009, 8, 40)), partMat('belt'), 'belt')
    sash.rotation.x = Math.PI / 2; sash.scale.set(1, 0.78, 1)
    sash.position.y = -0.003
    s.group.add(sash)
    if (kind === 'ball' || kind === 'mermaid' || kind === 'layers') {
      const bow = new T.Group()
      for (const b of [-1, 1]) {
        const lobe = mesh(sphere, partMat('belt'), 'belt')
        lobe.scale.set(0.032, 0.02, 0.012); lobe.position.set(b * 0.03, 0.004, 0); lobe.rotation.z = b * 0.35
        bow.add(lobe)
        const tail = mesh(sphere, partMat('belt'), 'belt')
        tail.scale.set(0.012, 0.05, 0.006); tail.position.set(b * 0.014, -0.05, 0.002); tail.rotation.z = b * 0.2
        bow.add(tail)
      }
      bow.add(place(mesh(sphere, partMat('belt'), 'belt'), 0, 0, 0.004, 0.012))
      bow.position.set(0, -0.004, -0.046)
      s.group.add(bow)
    }
    // Chaussures
    const sh = [section('shoeL', legL), section('shoeR', legR)]
    for (const b of sh) {
      if (look.shoes === 'boots') {
        b.group.add(mesh(sg(b, lathe(T, [[0.001, -0.46], [0.03, -0.458], [0.03, -0.44], [0.026, -0.4], [0.027, -0.33], [0.03, -0.27], [0.001, -0.268]], 24)), partMat('shoes'), 'shoes'))
        b.group.add(place(mesh(sphere, partMat('shoes'), 'shoes'), 0, -0.448, 0.025, 0.03, 0.018, 0.05))
      } else {
        b.group.add(place(mesh(sphere, partMat('shoes'), 'shoes'), 0, -0.448, 0.018, 0.028, 0.018, 0.05))
        const bw = mesh(sphere, partMat('belt'), 'belt'); bw.scale.set(0.012, 0.007, 0.006); bw.position.set(0, -0.435, 0.05)
        b.group.add(bw)
      }
    }
  }

  /* ---- Cape ---- */
  function buildCape() {
    const s = section('cape', rig)
    if (look.cape === 'none') return
    const royal = look.cape === 'royal'
    const top = 0.695
    const prof = royal
      ? [[0.36, 0.012], [0.34, 0.1], [0.3, 0.25], [0.24, 0.42], [0.16, 0.56], [0.11, 0.65], [0.08, top]]
      : [[0.17, 0.42], [0.15, 0.5], [0.12, 0.6], [0.09, 0.67], [0.075, top]]
    // Toujours à l'extérieur de la jupe
    const safe = prof.map(([r, y]) => [Math.max(r, skirtR(y) + 0.03), y])
    const geo = folds(lathe(T, safe, 64, Math.PI / 2 + 0.28, Math.PI - 0.56), 10, 0.05, top)
    s.group.add(mesh(sg(s, geo), partMat('cape'), 'cape'))
    // Le col : blanc à mouchetures (hermine) pour la cape royale, un ruban sinon
    const col = mesh(sg(s, new T.TorusGeometry(0.066, royal ? 0.018 : 0.008, 10, 40)),
      royal ? std({ color: 0xF4F1EC, roughness: 0.9 }, 0.85) : partMat('belt'), royal ? 'skin' : 'belt')
    if (royal) s.mats.push(col.material as Mat)
    col.rotation.x = Math.PI / 2 + 0.15; col.position.set(0, 0.69, -0.01); col.scale.set(1, 0.8, 1)
    s.group.add(col)
    if (royal) {
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.25 + (i / 8) * 1.5)
        const d = mesh(sphere, std({ color: 0x1A1A1A, roughness: 0.8 }), 'skin')
        s.mats.push(d.material as Mat)
        d.scale.set(0.004, 0.006, 0.003)
        d.position.set(Math.sin(a) * 0.084, 0.692, Math.cos(a) * 0.066 - 0.01)
        s.group.add(d)
      }
    }
  }

  /* ---- Ailes ---- */
  function buildWings() {
    const s = section('wings', wingsPivot)
    if (look.wings === 'none') return
    const shape = (L: number, Wd: number, round: boolean) => {
      const sh = new T.Shape()
      sh.moveTo(0, 0)
      if (round) {
        sh.bezierCurveTo(Wd * 0.1, Wd * 1.3, L * 1.1, Wd * 1.4, L, Wd * 0.2)
        sh.bezierCurveTo(L * 0.95, -Wd * 0.6, L * 0.4, -Wd * 0.4, 0, 0)
      } else {
        sh.bezierCurveTo(Wd * 0.2, Wd * 0.9, L * 0.8, Wd * 1.1, L, Wd * 0.3)
        sh.bezierCurveTo(L * 1.02, -Wd * 0.2, L * 0.5, -Wd * 0.3, 0, 0)
      }
      const geo = sg(s, new T.ShapeGeometry(sh, 24))
      // UV : la forme entière dans 0..1
      const p = geo.attributes.position as import('three').BufferAttribute
      const uv = geo.attributes.uv as import('three').BufferAttribute
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / L, (p.getY(i) + Wd) / (Wd * 2.5))
      return geo
    }
    const bf = look.wings === 'butterfly'
    const up = shape(bf ? 0.26 : 0.3, bf ? 0.17 : 0.15, bf)
    const low = shape(bf ? 0.18 : 0.2, bf ? 0.12 : 0.1, bf)
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
  let seat = 1.1
  function buildCrown() {
    const s = section('crown', head)
    const pieces = (list: { geo: Geo; m: import('three').Matrix4 }[], m: Mat, part = 'deco') => { if (list.length) s.group.add(mesh(fuse(s, list), m, part)) }
    if (look.crown === 'tiara') {
      const TH = 0.19 * Math.PI, LIFT = seat
      const arc: V3[] = []
      for (let k = 0; k <= 16; k++) { const a = -1.15 + (k / 16) * 2.3; arc.push(onHead(T, a, TH + Math.abs(a) * 0.08, LIFT)) }
      const golds: { geo: Geo; m: import('three').Matrix4 }[] = [{ geo: new T.TubeGeometry(new T.CatmullRomCurve3(arc), 48, 0.0045, 8), m: new T.Matrix4() }]
      const pink: { geo: Geo; m: import('three').Matrix4 }[] = [], blue: typeof pink = []
      const cone = new T.ConeGeometry(0.0055, 1, 8)
      for (let i = -4; i <= 4; i++) {
        const a = i * 0.26
        const base = onHead(T, a, TH + Math.abs(a) * 0.08, LIFT)
        const dir = base.clone().normalize().multiplyScalar(0.55).add(new T.Vector3(0, 1, 0)).normalize()
        const h = 0.036 - Math.abs(i) * 0.0055
        const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir)
        const at = base.clone().addScaledVector(dir, h / 2)
        golds.push({ geo: cone, m: new T.Matrix4().compose(at, q, new T.Vector3(1, h, 1)) })
        const tip = base.clone().addScaledVector(dir, h + 0.002)
        ;(i === 0 ? pink : golds).push({ geo: sphere, m: new T.Matrix4().compose(tip, q, new T.Vector3().setScalar(i === 0 ? 0.008 : 0.0045)) })
        if (i % 2 === 0) {
          const gp = base.clone().addScaledVector(dir, 0.006).addScaledVector(base.clone().normalize(), 0.004)
          ;(i === 0 ? pink : blue).push({ geo: sphere, m: new T.Matrix4().compose(gp, q, new T.Vector3(i === 0 ? 0.012 : 0.006, i === 0 ? 0.015 : 0.006, 0.006)) })
        }
      }
      pieces(golds, gold); pieces(pink, gem(0xD02860)); pieces(blue, gem(0x7FD6F0))
      cone.dispose()
      golds[0].geo.dispose()
    } else if (look.crown === 'crown') {
      const y = HR * HS[1] * (seat - 0.12)
      const golds: { geo: Geo; m: import('three').Matrix4 }[] = []
      const ring = new T.CylinderGeometry(0.052, 0.058, 0.035, 32, 1, true)
      golds.push({ geo: ring, m: M(0, 0, 0) })
      const cone = new T.ConeGeometry(0.011, 0.035, 8)
      const red: typeof golds = [], blue: typeof golds = []
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        golds.push({ geo: cone, m: M(Math.sin(a) * 0.053, 0.034, Math.cos(a) * 0.053) })
        golds.push({ geo: sphere, m: M(Math.sin(a) * 0.053, 0.054, Math.cos(a) * 0.053, 0.007) })
        ;(i % 2 ? blue : red).push({ geo: sphere, m: M(Math.sin(a) * 0.058, 0, Math.cos(a) * 0.058, 0.0075) })
      }
      const c = new T.Group()
      const add = (list: typeof golds, m: Mat) => { if (list.length) c.add(mesh(fuse(s, list), m, 'deco')) }
      add(golds, gold); add(red, gem(0xC02850)); add(blue, gem(0x2F7FD0))
      ring.dispose(); cone.dispose()
      c.position.set(0, y, -0.015)
      c.rotation.x = -0.22
      s.group.add(c)
    } else if (look.crown === 'flowers') {
      const cols = [0xE8759A, 0xF2F0F4, 0xF5C75A, 0xB795E8]
      const by = new Map<number, { geo: Geo; m: import('three').Matrix4 }[]>()
      const hearts: { geo: Geo; m: import('three').Matrix4 }[] = []
      for (let i = 0; i < 11; i++) {
        const a = -Math.PI * 0.55 + (i / 10) * Math.PI * 1.1
        const p = onHead(T, a, 0.24 * Math.PI, seat + 0.02)
        const q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(p.clone().multiplyScalar(3), p, new T.Vector3(0, 1, 0)))
        const list = by.get(cols[i % 4]) || []
        for (let k = 0; k < 5; k++) {
          const pa = (k / 5) * Math.PI * 2
          const off = new T.Vector3(Math.cos(pa) * 0.011, Math.sin(pa) * 0.011, 0).applyQuaternion(q)
          list.push({ geo: sphere, m: new T.Matrix4().compose(p.clone().add(off), q, new T.Vector3(0.012, 0.012, 0.005)) })
        }
        by.set(cols[i % 4], list)
        hearts.push({ geo: sphere, m: new T.Matrix4().compose(p.clone().add(new T.Vector3(0, 0, 0.003).applyQuaternion(q)), q, new T.Vector3().setScalar(0.006)) })
      }
      for (const [c, list] of by) { const m = std({ color: c, roughness: 0.6 }, 0.8); s.mats.push(m); pieces(list, m) }
      const cm = std({ color: 0xE0A020, roughness: 0.5 }); s.mats.push(cm); pieces(hearts, cm)
    } else if (look.crown === 'bow') {
      const p = onHead(T, Math.PI * 0.85, 0.15 * Math.PI, seat + 0.05)
      const b = new T.Group()
      for (const k of [-1, 1]) {
        const lobe = mesh(sphere, partMat('belt'), 'belt'); lobe.scale.set(0.05, 0.032, 0.016); lobe.position.set(k * 0.045, 0, 0); lobe.rotation.z = k * 0.3
        b.add(lobe)
      }
      b.add(place(mesh(sphere, partMat('belt'), 'belt'), 0, 0, 0, 0.018))
      b.position.copy(p)
      b.lookAt(p.clone().multiplyScalar(3))
      s.group.add(b)
    }
    // Les barrettes, là où le doigt les a piquées
    buildClips()
  }
  function buildClips() {
    const s = section('clips', head)
    const lift = look.hair.style === 'afro' ? 1.3 + look.hair.len * 0.1 : 1.13
    look.hair.clips.forEach((c: Clip) => {
      const p = onHead(T, c.az, c.th, lift)
      const grp = new T.Group()
      const m = std({ color: c.c, roughness: 0.4 }, 0.8)
      s.mats.push(m)
      const q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().lookAt(p.clone().multiplyScalar(3), p, new T.Vector3(0, 1, 0)))
      if (c.k === 'flower') {
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2
          grp.add(place(mesh(sphere, m, 'deco'), Math.cos(a) * 0.012, Math.sin(a) * 0.012, 0, 0.012, 0.012, 0.005))
        }
        grp.add(place(mesh(sphere, gold, 'deco'), 0, 0, 0.004, 0.006))
      } else if (c.k === 'bow') {
        for (const k of [-1, 1]) { const l = mesh(sphere, m, 'deco'); l.scale.set(0.02, 0.013, 0.007); l.position.x = k * 0.018; l.rotation.z = k * 0.3; grp.add(l) }
        grp.add(place(mesh(sphere, m, 'deco'), 0, 0, 0.003, 0.008))
      } else {
        const sh = new T.Shape()
        if (c.k === 'star') {
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.009 : 0.022
            if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r)
          }
        } else {
          const r = 0.016
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
    const s = section('neck', rig)
    if (look.neck === 'pearls') {
      const list: { geo: Geo; m: import('three').Matrix4 }[] = []
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2
        const y = 0.705 - Math.max(0, Math.cos(a)) * 0.022
        list.push({ geo: sphere, m: M(Math.sin(a) * 0.037, y, Math.cos(a) * 0.029 + 0.004, 0.0052) })
      }
      s.group.add(mesh(fuse(s, list), pearl, 'deco'))
    } else if (look.neck === 'heart') {
      const chain = mesh(sg(s, new T.TorusGeometry(0.036, 0.0022, 6, 40)), gold, 'deco')
      chain.rotation.x = Math.PI / 2 + 0.5; chain.position.set(0, 0.705, 0.008); chain.scale.set(1, 0.75, 1)
      s.group.add(chain)
      const sh = new T.Shape()
      const r = 0.014
      sh.moveTo(0, -r * 0.9)
      sh.bezierCurveTo(-r * 1.4, r * 0.2, -r * 0.6, r * 1.2, 0, r * 0.4)
      sh.bezierCurveTo(r * 0.6, r * 1.2, r * 1.4, r * 0.2, 0, -r * 0.9)
      const h = mesh(sg(s, new T.ExtrudeGeometry(sh, { depth: 0.005, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 })), gem(0xD02850), 'deco')
      h.position.set(0, 0.678, 0.044)
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
    for (const sd of [-1, 1]) {
      const outer = outline(heart, 0.034)
      const inner = outline(heart, 0.026)
      outer.holes.push(new T.Path(inner.getPoints(24).reverse()))
      const f = mesh(sg(s, new T.ExtrudeGeometry(outer, { depth: 0.004, bevelEnabled: false, curveSegments: 16 })), frame, 'face')
      const l = mesh(sg(s, new T.ShapeGeometry(inner, 16)), lens, 'face')
      l.userData.noShadow = true
      const at = onHead(T, sd * EYE_AZ, EYE_TH, 1.1)
      f.position.copy(at); l.position.copy(at).add(new T.Vector3(0, 0, 0.001))
      f.rotation.y = sd * 0.3; l.rotation.y = sd * 0.3
      s.group.add(f, l)
    }
    const bridge = mesh(sg(s, new T.CylinderGeometry(0.003, 0.003, 0.03, 6)), frame, 'face')
    bridge.rotation.z = Math.PI / 2; bridge.position.copy(onHead(T, 0, EYE_TH - 0.05, 1.12))
    s.group.add(bridge)
  }
  function buildHeld() {
    const s = section('held', aR.fore)
    const hold = new T.Group()
    hold.position.set(0, -0.125, 0.012)
    hold.rotation.x = 0.35
    s.group.add(hold)
    if (look.held === 'wand' || look.held === 'scepter') {
      const wand = look.held === 'wand'
      hold.add(place(mesh(sg(s, new T.CylinderGeometry(wand ? 0.004 : 0.006, wand ? 0.004 : 0.007, wand ? 0.16 : 0.24, 10)), wand ? std({ color: 0xF0E6F0, roughness: 0.3 }) : gold, 'deco'), 0, wand ? 0.06 : 0.07, 0))
      if (wand) {
        const sh = new T.Shape()
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.014 : 0.034
          if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r)
        }
        hold.add(place(mesh(sg(s, new T.ExtrudeGeometry(sh, { depth: 0.01, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2 })), gold, 'deco'), 0, 0.155, -0.005))
      } else {
        hold.add(place(mesh(sphere, gem(0x8C3CC8), 'deco'), 0, 0.2, 0, 0.026))
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2
          const c = mesh(sg(s, new T.ConeGeometry(0.006, 0.02, 6)), gold, 'deco')
          c.position.set(Math.sin(a) * 0.016, 0.228, Math.cos(a) * 0.016)
          hold.add(c)
        }
        hold.add(place(mesh(sphere, gold, 'deco'), 0, 0.18, 0, 0.012, 0.006, 0.012))
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
      const leaf = std({ color: 0x3E7A4A, roughness: 0.7 })
      s.mats.push(leaf)
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26
        hold.add(place(mesh(sphere, leaf, 'deco'), Math.cos(a) * 0.03, 0.06, Math.sin(a) * 0.03, 0.016, 0.006, 0.01))
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
      f.rotation.z = 0.2
      hold.add(f)
    }
  }

  /* ---- Les cheveux ---- */
  function buildHairSection() {
    const s = section('hair', head)
    const hb = buildHair(T, merge, look.hair, { skirtR: y => skirtR(y), cape: look.cape !== 'none' })
    seat = hb.seat
    s.geos.push(hb.geo)
    s.group.add(mesh(hb.geo, partMat('hair'), 'hair'))
  }

  /* --- Tout construire, puis ne refaire que ce qui change --- */
  const keys = (r: Royal) => ({
    top: r.top,
    skirt: JSON.stringify([r.skirt, r.train, r.shoes]),
    cape: r.cape + (r.skirt),
    wings: r.wings,
    hair: JSON.stringify([r.hair.style, r.hair.len.toFixed(3), r.hair.curl.toFixed(3), r.skirt, r.train, r.cape]),
    crown: JSON.stringify([r.crown, r.hair.style, r.hair.len.toFixed(2), r.hair.clips]),
    neck: r.neck,
    glasses: r.glasses,
    held: r.held,
    skin: r.skin + r.freckles
  })
  let built = keys(look)
  buildTop(); buildSkirt(); buildCape(); buildWings(); buildHairSection(); buildCrown(); buildNeck(); buildGlasses(); buildHeld()
  obj.traverse(x => { x.castShadow = !x.userData.noShadow })

  const princess: Princess = {
    obj, rig, head, armL: aL.sh, armR: aR.sh, foreL: aL.fore, foreR: aR.fore, legL, legR,
    skirt: skirtPivot, wings: wingsPivot, face, flare: 0,
    get look() { return look },
    set(r) {
      const next = cloneRoyal(r)
      const k = keys(next)
      const prev = look
      look = next
      if (k.top !== built.top) buildTop()
      if (k.skirt !== built.skirt) buildSkirt()
      if (k.cape !== built.cape) buildCape()
      if (k.wings !== built.wings) buildWings()
      if (k.hair !== built.hair) buildHairSection()
      if (k.crown !== built.crown || k.hair !== built.hair) buildCrown()
      if (k.neck !== built.neck) buildNeck()
      if (k.glasses !== built.glasses) buildGlasses()
      if (k.held !== built.held) buildHeld()
      if (k.skin !== built.skin) {
        skinMat.color.set(next.skin).multiplyScalar(0.86)
        const cv = skullCanvas(next.skin, next.freckles)
        skullCv.cv.getContext('2d')!.drawImage(cv, 0, 0)
        skullTex.needsUpdate = true
      }
      built = k
      // Les peintures qui ont changé sans teinture : tout de suite
      for (const [part, list] of fab) {
        const p = next.paint[part]
        if (p.c !== prev.paint[part].c || p.p !== prev.paint[part].p) list.forEach(f => { if (f.paint.c !== p.c || f.paint.p !== p.p) f.set(p) })
      }
      face.redraw()
      obj.traverse(x => { x.castShadow = !x.userData.noShadow })
    },
    dye(part, paint, at) {
      look.paint[part] = { ...paint }
      const list = fab.get(part)
      if (list) list.forEach(f => f.dye(paint, at))
      if (part === 'hair') face.redraw()
    },
    partOf(x) {
      for (let o: Obj3 | null = x; o; o = o.parent) {
        const p = o.userData?.part
        if (p) return p as Part | 'face' | 'skin' | 'deco'
        if (o === obj) break
      }
      return null
    },
    update(dt) {
      face.update(dt)
      for (const list of fab.values()) list.forEach(f => f.update(dt))
      // La jupe s'évase dans les pirouettes (le pivot est à la taille)
      const fl = princess.flare
      skirtPivot.scale.set(1 + fl * 0.28, 1 - fl * 0.12, 1 + fl * 0.28)
    },
    dispose() {
      for (const s of sections.values()) { s.geos.forEach(x => x.dispose()); s.mats.forEach(x => x.dispose()) }
      for (const list of fab.values()) list.forEach(f => f.dispose())
      face.dispose()
      own.geos.forEach(x => x.dispose())
      own.mats.forEach(x => x.dispose())
      own.texs.forEach(x => x.dispose())
      obj.removeFromParent()
    }
  }
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
  p.rig.position.set(0, 0, 0)
  p.rig.rotation.set(0, 0, 0)
  p.head.rotation.set(0, 0, 0)
  p.legL.rotation.set(0, 0, 0); p.legR.rotation.set(0, 0, 0)
  p.armL.rotation.set(0, 0, 0.2); p.armR.rotation.set(0, 0, -0.2)
  p.foreL.rotation.set(-0.35, 0, -0.1); p.foreR.rotation.set(-0.35, 0, 0.1)
  p.skirt.rotation.set(0, 0, 0)
  p.flare = 0
  let yaw = 0
  const breathe = Math.sin(t * 1.6)
  if (pose === 'idle') {
    p.head.rotation.z = Math.sin(t * 1.2) * 0.05
    p.head.rotation.x = -0.04
    p.armL.rotation.z = 0.2 + breathe * 0.02
    p.armR.rotation.z = -0.2 - breathe * 0.02
    p.skirt.rotation.y = Math.sin(t * 1.1) * 0.03
    p.rig.position.y = breathe * 0.002
  } else if (pose === 'wave') {
    p.armR.rotation.set(0, 0, -2.3)
    p.foreR.rotation.set(0, 0, -0.5 + Math.sin(t * 8) * 0.35)
    p.head.rotation.z = -0.12
  } else if (pose === 'cheer') {
    p.rig.position.y = Math.abs(Math.sin(t * 5)) * 0.05
    p.armL.rotation.z = 2.6 + Math.sin(t * 10) * 0.12; p.armR.rotation.z = -2.6 - Math.sin(t * 10) * 0.12
    p.foreL.rotation.set(0, 0, 0.3); p.foreR.rotation.set(0, 0, -0.3)
    p.head.rotation.z = Math.sin(t * 5) * 0.1
    p.flare = Math.abs(Math.sin(t * 5)) * 0.2
  } else if (pose === 'laugh') {
    p.rig.rotation.x = Math.sin(t * 18) * 0.03
    p.head.rotation.x = -0.12 + Math.sin(t * 18) * 0.05
    p.head.rotation.z = Math.sin(t * 9) * 0.08
    p.armL.rotation.set(-0.6, 0, 0.45); p.armR.rotation.set(-0.6, 0, -0.45)
    p.foreL.rotation.set(-1.4, 0, -0.3); p.foreR.rotation.set(-1.4, 0, 0.3)
  } else if (pose === 'photo') {
    // Une main sur la hanche, l'autre en coucou, la tête penchée
    p.armL.rotation.set(0.1, 0, 0.75); p.foreL.rotation.set(-0.3, 0, -1.9)
    p.armR.rotation.set(-0.2, 0, -2.1); p.foreR.rotation.set(0, 0, -0.4)
    p.head.rotation.z = 0.14
    yaw = 0
  } else if (pose === 'curtsy') {
    const k = Math.sin(clamp(t / MOVES.curtsy, 0, 1) * Math.PI)
    p.rig.position.y = -0.035 * k
    p.head.rotation.set(0.28 * k, 0, 0.1 * k)
    p.armL.rotation.set(0.3 * k, 0, 0.2 + 0.5 * k); p.armR.rotation.set(0.3 * k, 0, -0.2 - 0.5 * k)
    p.foreL.rotation.set(-0.3, 0, 0.2 * k); p.foreR.rotation.set(-0.3, 0, -0.2 * k)
    p.flare = 0.12 * k
  } else if (pose === 'spin' || pose === 'twirl') {
    // Pirouette : un tour complet (deux pour « twirl »), les bras qui s'ouvrent, la jupe qui s'évase
    const D = MOVES[pose]
    const k = clamp(t / D, 0, 1)
    const turns = pose === 'twirl' ? 2 : 1
    yaw = ease(k) * Math.PI * 2 * turns
    const open = Math.sin(k * Math.PI)
    p.armL.rotation.z = 0.2 + open * (pose === 'twirl' ? 2.6 : 1.2); p.armR.rotation.z = -0.2 - open * (pose === 'twirl' ? 2.6 : 1.2)
    p.foreL.rotation.set(0, 0, 0.2 * open); p.foreR.rotation.set(0, 0, -0.2 * open)
    p.flare = open
    p.skirt.rotation.y = -open * 0.4
    p.rig.position.y = open * 0.01
    p.head.rotation.x = -0.1 * open
  } else if (pose === 'jump') {
    const k = clamp(t / MOVES.jump, 0, 1)
    const h = Math.max(0, Math.sin(k * Math.PI * 2)) * (k < 0.5 ? 1 : 0.6)
    p.rig.position.y = h * 0.12
    p.armL.rotation.z = 0.2 + h * 2.4; p.armR.rotation.z = -0.2 - h * 2.4
    p.legL.rotation.x = -h * 0.5; p.legR.rotation.x = -h * 0.5
    p.flare = h * 0.5
  } else if (pose === 'waltz') {
    // Pas de valse : un-deux-trois, de côté, en tournant doucement
    const beat = t * 2.6
    const sway = Math.sin(beat * Math.PI / 1.5)
    p.rig.position.x = sway * 0.05
    p.rig.position.y = Math.abs(Math.sin(beat * Math.PI)) * 0.012
    p.rig.rotation.z = -sway * 0.05
    yaw = clamp(t / MOVES.waltz, 0, 1) * Math.PI * 2
    p.armL.rotation.set(-0.3, 0, 1.3); p.foreL.rotation.set(-0.2, 0, 0.6)
    p.armR.rotation.set(-0.6, 0, -0.6); p.foreR.rotation.set(-1.0, 0, 0)
    p.head.rotation.z = sway * 0.1
    p.flare = 0.25 + Math.abs(sway) * 0.2
    p.skirt.rotation.y = -sway * 0.15
  } else if (pose === 'arms') {
    // Les bras en l'air qui ondulent, comme une vague
    const k = clamp(t / MOVES.arms, 0, 1)
    const up = Math.sin(k * Math.PI)
    p.armL.rotation.z = 0.2 + up * 2.7 + Math.sin(t * 7) * 0.2 * up
    p.armR.rotation.z = -0.2 - up * 2.7 + Math.sin(t * 7 + 1) * 0.2 * up
    p.foreL.rotation.set(0, 0, Math.sin(t * 7) * 0.5 * up); p.foreR.rotation.set(0, 0, Math.sin(t * 7 + 1) * 0.5 * up)
    p.rig.rotation.z = Math.sin(t * 3.5) * 0.06 * up
    p.head.rotation.z = Math.sin(t * 3.5) * 0.12 * up
  } else if (pose === 'bow') {
    p.rig.position.y = -0.02
    p.head.rotation.x = 0.35
    p.rig.rotation.x = 0.12
    p.armL.rotation.set(0.35, 0, 0.55); p.armR.rotation.set(0.35, 0, -0.55)
  } else if (pose === 'walk' || pose === 'stride') {
    const s = Math.sin(t * 8) * (pose === 'stride' ? -1 : 1)
    p.legL.rotation.x = s * 0.4; p.legR.rotation.x = -s * 0.4
    p.armL.rotation.x = -s * 0.35; p.armR.rotation.x = s * 0.35
    p.rig.position.y = Math.abs(Math.cos(t * 8)) * 0.012
    p.skirt.rotation.y = s * 0.06
    p.flare = 0.05
  }
  // Les ailes battent doucement
  p.wings.children.forEach(s => s.children.forEach(side => {
    const sd = side.userData.side as number
    if (sd) side.rotation.y = sd * (-0.5 - Math.sin(t * 5) * 0.12)
  }))
  return yaw
}
