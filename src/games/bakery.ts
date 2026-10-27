import type { GameDef, GameContext } from '../core/types'
import { createStage, loader, woodTex, type Stage, type T3 } from '../core/three3d'
import { particles, type Particles } from '../core/scene3d'
import { cakeKit, radiusAt, biteOf, inBite, TEETH, type CakeKit, type CakeShape, type Tier } from '../core/cake3d'
import { withRenderer } from '../core/portraits'
import { sfx, preloadSfx } from '../core/sfx'
import { sCrunch, tone } from '../core/audio'
import { visible, handNow } from '../core/hand'

/* 🎂 LE GÂTEAU de la Cuisine (c'était la Pâtisserie, du 5/10 au 27/10) —
   un gâteau sur son présentoir, dans une
   petite pâtisserie (mur à rayures, fanions, bocaux, comptoir en marbre).
   Cinq étapes à gauche, chacune son icône et son nom :
   - Gâteau  : un, deux ou trois étages ; rond, en cœur ou carré
   - Glaçage : une couleur, puis toucher le flanc (la couleur s'étale depuis
               le doigt) ou le dessus (le nappage se verse et coule)
   - Crème   : la poche à douille — le doigt dépose des rosaces (ou des gouttes)
   - Décor   : fraises, framboises, myrtilles, cerises, perles ; les
               vermicelles tombent où passe le doigt
   - Bougies : on les plante, allumées (une décoration : plus de souffle,
               plus de micro ni de chanson depuis le 19/10 — le père : « vire
               toute l'animation des bougies, on s'en fout »)
   - Manger  : (la fourchette) les bougies sortent du gâteau une à une, il
               se remet de face, et on le MANGE, comme la pizza (refait le
               19/10 : « l'animation pour manger est vraiment éclatée ») :
               six coups de couteau, les parts s'écartent ; un toucher sur
               l'une, dans l'ordre qu'on veut : elle sort, la crème file
               jusqu'à casser, elle vient devant nous et CROC, CROC — la
               marque des dents se voit —, puis elle disparaît dans les
               miettes. Six parts, et il n'en reste rien.
   Pas de note sur une création. */

type Step = 'base' | 'glacage' | 'creme' | 'decor' | 'bougies'
type Deco = 'fraise' | 'framboise' | 'myrtille' | 'cerise' | 'perle' | 'vermicelles'

const STEPS: Step[] = ['base', 'glacage', 'creme', 'decor', 'bougies']
const STEP_NAME: Record<Step, string> = { base: 'Gâteau', glacage: 'Glaçage', creme: 'Crème', decor: 'Décor', bougies: 'Bougies' }
const GLAZES: [string, string][] = [['#FFF8F0', 'Blanc'], ['#F58FB8', 'Rose'], ['#E83A5F', 'Fraise'], ['#6B3E26', 'Chocolat'], ['#D9963A', 'Caramel'], ['#9EE0C0', 'Menthe'], ['#C3A6F5', 'Lavande'], ['#FFE27A', 'Citron']]
const CREAMS: [string, string][] = [['#FFF7EC', 'Blanc'], ['#FFC2D4', 'Rose'], ['#8A5A3C', 'Chocolat'], ['#C8F0DD', 'Menthe'], ['#FFF0A8', 'Citron']]
const CANDLES: [string, string][] = [['#FF6B81', 'Rose'], ['#4FB8E7', 'Bleue'], ['#FFC94D', 'Jaune'], ['#5EC97B', 'Verte'], ['#B197FC', 'Violette']]
const DECOS: [Deco, string][] = [['fraise', 'Fraise'], ['framboise', 'Framboise'], ['myrtille', 'Myrtille'], ['cerise', 'Cerise'], ['perle', 'Perles'], ['vermicelles', 'Vermicelles']]
const SPONGE = '#E9B872'
const SIZES: Record<number, { r: number; h: number }[]> = {
  1: [{ r: 1.0, h: 0.62 }],
  2: [{ r: 0.98, h: 0.5 }, { r: 0.62, h: 0.42 }],
  3: [{ r: 1.0, h: 0.42 }, { r: 0.72, h: 0.36 }, { r: 0.46, h: 0.32 }]
}
const PLATE_Y = 0.4
const MAX_ITEMS = 140, MAX_CANDLES = 12, MAX_SPRINKLES = 900
/** On mange le gâteau en six parts ; la première est centrée sur +z (vers nous, au repos). */
const PARTS = 6, DP = Math.PI * 2 / PARTS, A0 = Math.PI / 2 - DP / 2

interface Item { kind: string; obj: import('three').Object3D; candle?: { flame: import('three').Group; lit: number } }

type V3 = import('three').Vector3
type Plane = import('three').Plane
type Mat = import('three').Material
/** Une part du gâteau coupé : une copie des étages gardée entre ses deux bords, et ce qui était posé dessus. */
interface Part {
  i: number
  g: import('three').Group
  a0: number; a1: number; mid: number
  /** Ses deux bords (repère de la part), et leurs copies dans le monde (celles des matières). */
  local: Plane[]; world: Plane[]
  /** Ses bouchées, lues par ses matières. */
  u: BiteU
  items: Item[]
  spr: { im: import('three').InstancedMesh; at: [number, number][] } | null
  mats: Mat[]
  /** La paroi que laisse une bouchée (génoise en couches), et sa matière (coupée par les bords). */
  walls: import('three').Mesh[]
  wallMat: Mat | null
  /** Sa longueur (l'étage du bas, de la pointe au bord), la hauteur de son dessus, sa direction (monde). */
  L: number; H: number; dir: V3
  /** 'rest' : sur le présentoir ; 'eat' : on la mange (t : depuis le toucher) ; 'gone'. */
  state: 'rest' | 'eat' | 'gone'
  t: number
  bites: number
  /** Le recul sous les dents (1 → 0). */
  jolt: number
  strands: Strand[]
  from: { p: V3; q: import('three').Quaternion } | null
}
/** Un fil de crème entre une part qu'on prend et sa voisine : ancré sur elle (monde), l'autre bout sur la part (son repère). */
interface Strand { mesh: import('three').Mesh; a: V3; b: V3; snap: number; col: string }
/** Le gâteau qu'on mange : ses six parts, le couteau. */
interface Eat {
  parts: Part[]
  eaten: number
  bites: number
  /** Les coups de couteau donnés, son temps ; prêt : coupé, on peut prendre une part. */
  cuts: number
  knifeT: number
  ready: boolean
  /** L'écart des parts (il grandit à chaque coup). */
  gap: number
  knife: import('three').Group
  /** Le recul de la caméra, 0 → 1. */
  camK: number
  strandGeo: import('three').BufferGeometry
  strandMats: Map<string, Mat>
}

interface State {
  stage: Stage
  T: T3
  kit: CakeKit
  cake: import('three').Group
  tiers: Tier[]
  tierY: number[]
  nTiers: number
  shape: CakeShape
  items: Item[]
  spr: import('three').InstancedMesh
  sprN: number
  step: Step
  glaze: string
  cream: string
  drop: boolean
  deco: Deco
  candle: string
  rot: number
  vRot: number
  phase: 'make' | 'prep' | 'eat' | 'done'
  phaseT: number
  /** « Manger » touché : les bougies qui sortent du gâteau (t < 0 : pas encore), et l'angle où il se remet de face. */
  leaving: { obj: import('three').Object3D; t: number; y0: number; popped: boolean }[]
  prepWant: number
  fx: Particles
  ray: import('three').Raycaster
  t: number
  eat: Eat | null
  stand: import('three').Object3D[]
  /** Pendant que les bougies sortent, la répétition du repas (voir `rehearse`). */
  warm: Warm | null
}

/** La répétition du repas : les copies à préparer (sous le comptoir), si
    leurs rendus sont prêts, et le couteau déjà prêt. */
interface Warm {
  ready: boolean
  g: import('three').Group
  knife: import('three').Group | null
}

let me: State | null = null
let ctx: GameContext
const thumbs: Record<string, string> = {}

/* ---------- Le gâteau ---------- */

function buildBase(s: State) {
  for (const t of s.tiers) s.cake.remove(t.g)
  s.tiers = []; s.tierY = []
  let y = PLATE_Y
  SIZES[s.nTiers].forEach((sz, i) => {
    const t = s.kit.tier({ shape: s.shape, r: sz.r, h: sz.h, body: SPONGE, glaze: '#FFFFFF', seed: 11 + i * 12 })
    t.g.position.y = y
    s.cake.add(t.g)
    s.tiers.push(t); s.tierY.push(y)
    y += sz.h + 0.03
  })
  if (s.sprN) { s.sprN = 0; s.spr.count = 0 }
  // Ce qui était posé retombe sur le nouveau gâteau, là où il était
  reseat(s)
}

const isCream = (it: Item) => it.kind === 'rosace' || it.kind === 'goutte'

/** La hauteur de ce qu'il y a de plus haut sous un objet posé en (x, z) (le centre et quatre points du tour). */
function restOn(s: State, x: number, z: number, rad: number, withItems: boolean) {
  let y = -Infinity
  for (const [ox, oz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const p = dropOnto(s, x + ox * rad * 0.6, z + oz * rad * 0.6, withItems)
    if (p) y = Math.max(y, p.y)
  }
  return isFinite(y) ? y : null
}

/** Tout ce qui est posé se repose sur ce qu'il y a dessous (un nouveau gâteau,
    le nappage versé APRÈS le décor : sinon il l'aurait recouvert). La crème
    d'abord, puis ce qui peut être posé sur elle ; les vermicelles en dernier. */
function reseat(s: State) {
  s.cake.updateMatrixWorld(true)
  for (const cream of [true, false]) for (const it of s.items) {
    if (isCream(it) !== cream) continue
    const p = it.obj.position
    const y = restOn(s, p.x, p.z, (FOOT[it.kind] ?? [0.05])[0], !cream)
    if (y !== null) p.y = y
    else { s.cake.remove(it.obj); it.obj.userData.gone = true }
  }
  s.items = s.items.filter(it => !it.obj.userData.gone)
  const m4 = new s.T.Matrix4(), q = new s.T.Quaternion(), p = new s.T.Vector3(), sc = new s.T.Vector3()
  for (let i = 0; i < s.sprN; i++) {
    s.spr.getMatrixAt(i, m4)
    m4.decompose(p, q, sc)
    const h = dropHit(s, p.x, p.z, true)
    if (!h) continue
    s.spr.setMatrixAt(i, m4.compose(h.p.addScaledVector(h.n, 0.006), lay(s, h.n, q), sc))
  }
  s.spr.instanceMatrix.needsUpdate = true
}

/** Un vermicelle couché sur la surface (de normale n), tourné au hasard. */
function lay(s: State, n: import('three').Vector3, q: import('three').Quaternion) {
  const yaw = new s.T.Quaternion().setFromAxisAngle(new s.T.Vector3(0, 1, 0), Math.random() * Math.PI * 2)
  return q.setFromUnitVectors(new s.T.Vector3(0, 1, 0), n.lengthSq() ? n.clone().normalize() : new s.T.Vector3(0, 1, 0)).multiply(yaw)
}

/** Les surfaces où l'on pose (les étages, leur nappage, l'assiette du présentoir). */
function surfaces(s: State, withItems = false): import('three').Object3D[] {
  const out: import('three').Object3D[] = [...s.stand]
  for (const t of s.tiers) { out.push(t.body); if (t.glaze.visible) t.glaze.traverse(o => { if ((o as import('three').Mesh).isMesh) out.push(o) }) }
  if (withItems) for (const it of s.items) if (it.kind === 'rosace' || it.kind === 'goutte') out.push(it.obj)
  return out
}

/** Le point du dessus sous (x, z) du gâteau (repère du gâteau), en tombant d'en haut. */
function dropOnto(s: State, x: number, z: number, withItems = false) {
  return dropHit(s, x, z, withItems)?.p ?? null
}
/** Pareil, avec la normale de la surface (repère du gâteau). */
function dropHit(s: State, x: number, z: number, withItems = false) {
  const o = s.cake.localToWorld(new s.T.Vector3(x, 5, z))
  s.ray.set(o, new s.T.Vector3(0, -1, 0))
  const h = s.ray.intersectObjects(surfaces(s, withItems), false)[0]
  if (!h?.face) return null
  const n = h.face.normal.clone().transformDirection(h.object.matrixWorld)
  return { p: s.cake.worldToLocal(h.point.clone()), n: n.applyQuaternion(s.cake.getWorldQuaternion(new s.T.Quaternion()).invert()) }
}

/** Ce qu'on touche sous le doigt : la PREMIÈRE surface (jamais une autre
    derrière : une baie posée sur le flanc d'un étage passait derrière lui). */
function pick(s: State, cx: number, cy: number, withItems = false) {
  const r = s.stage.renderer.domElement.getBoundingClientRect()
  s.ray.setFromCamera(new s.T.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), s.stage.camera)
  for (const h of s.ray.intersectObjects(surfaces(s, withItems), false)) {
    if (!h.face) continue
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld)
    return { point: h.point, local: s.cake.worldToLocal(h.point.clone()), obj: h.object as import('three').Mesh, n }
  }
  return null
}

/** L'étage d'une surface touchée (son génoise ou son nappage), -1 sinon. */
const tierOf = (s: State, o: import('three').Object3D) =>
  s.tiers.findIndex(t => t.body === o || !!t.glaze.getObjectById(o.id))

/** Le rayon (vu d'en haut) de ce qu'on pose, et ce qu'il peut dépasser du bord. */
const FOOT: Record<string, [number, number]> = {
  rosace: [0.12, 0.07], goutte: [0.11, 0.06], fraise: [0.05, 0.02], framboise: [0.045, 0.015], myrtille: [0.05, 0.015],
  cerise: [0.06, 0.02], perle: [0.03, 0.01], bougie: [0.03, 0.01]
}

/** Où se pose ce qu'on a touché : sur le DESSUS de l'étage touché (un toucher
    sur son flanc remonte au bord), sans entrer dans l'étage d'au-dessus ni
    dans ses coulures, sans pendre dans le vide ; à la hauteur de ce qu'il y a
    de plus haut sous lui (le bourrelet du nappage, une rosace). */
function seat(s: State, h: NonNullable<ReturnType<typeof pick>>, kind: string, withItems: boolean) {
  const [rad, over] = FOOT[kind] ?? [0.05, 0.02]
  let { x, z } = h.local
  let level = tierOf(s, h.obj)
  if (level < 0 && !s.stand.includes(h.obj)) {
    // Sur une rosace : l'étage dessous (celui dont le dessus est juste en dessous)
    level = s.tierY.reduce((b, y, i) => h.local.y >= y + s.tiers[i].h - 0.02 ? i : b, -1)
  }
  const a = Math.atan2(z, x)
  let d = Math.hypot(x, z)
  const R = (i: number) => radiusAt(s.tiers[i].outline, a)
  const maxR = level < 0 ? 1.3 - rad : R(level) - rad + over
  const minR = level + 1 < s.tiers.length ? R(level + 1) + rad + 0.02 : 0
  // Le flanc touché : la décoration va au bord du dessus de cet étage
  if (level >= 0 && h.n.y < 0.55 && tierOf(s, h.obj) >= 0) d = maxR
  d = minR > maxR ? (minR + maxR) / 2 : Math.min(maxR, Math.max(minR, d))
  x = Math.cos(a) * d; z = Math.sin(a) * d
  const y = restOn(s, x, z, rad, withItems)
  return y === null ? null : new s.T.Vector3(x, y, z)
}

function addItem(s: State, kind: string, obj: import('three').Object3D, at: import('three').Vector3, extra: Partial<Item> = {}) {
  if (s.items.length >= MAX_ITEMS) return null
  obj.position.copy(at)
  obj.rotation.y = Math.random() * Math.PI * 2
  obj.scale.setScalar(0.001)
  obj.userData.grow = 0
  s.cake.add(obj)
  const it: Item = { kind, obj, ...extra }
  s.items.push(it)
  return it
}

/* ---------- Les gestes ---------- */

function onPlace(s: State, cx: number, cy: number, drag: boolean) {
  if (s.phase !== 'make') return
  if (s.step === 'glacage') {
    if (drag) return
    const h = pick(s, cx, cy)
    if (!h) return
    const t = s.tiers.find(x => x.body === h.obj || x.glaze.getObjectById(h.obj.id))
    if (!t) return
    if (h.obj.userData.paint === 'body' && h.n.y < 0.55) { t.bodyMat.userData.paint(s.glaze, h.point); sfx('cloth', { vol: 0.5 }) }
    else {
      const first = !t.glaze.visible
      t.pour(s.glaze, h.point); sfx('pluck', { vol: 0.5, rate: 0.7 })
      // Le nappage versé après le décor : ce qui est posé remonte dessus
      if (first && (s.items.length || s.sprN)) reseat(s)
    }
    return
  }
  if (s.step === 'creme') {
    const h = pick(s, cx, cy)
    const kind = s.drop ? 'goutte' : 'rosace'
    const p = h && seat(s, h, kind, false)
    if (!p) return
    if (s.items.some(it => isCream(it) && Math.hypot(it.obj.position.x - p.x, it.obj.position.z - p.z) < (drag ? 0.15 : 0.11))) return
    if (addItem(s, kind, s.kit.rosette(s.cream, s.drop), p)) sfx('cloth', { vol: 0.35, rate: 1.4 })
    return
  }
  if (s.step === 'decor') {
    if (s.deco === 'vermicelles') { sprinkle(s, cx, cy); return }
    if (drag) return
    const h = pick(s, cx, cy, true)
    const p = h && seat(s, h, s.deco, true)
    if (!p) return
    const o = s.deco === 'fraise' ? s.kit.strawberry() : s.deco === 'framboise' ? s.kit.raspberry() : s.deco === 'myrtille' ? s.kit.blueberry()
      : s.deco === 'cerise' ? s.kit.cherry() : s.kit.pearls(1, 0, '#FFFFFF')
    if (addItem(s, s.deco, o, p)) sfx('pluck', { vol: 0.5, rate: 1.1 + Math.random() * 0.3 })
    return
  }
  if (s.step === 'bougies') {
    if (drag) return
    const h = pick(s, cx, cy, true)
    const p = h && seat(s, h, 'bougie', true)
    if (!p) return
    if (s.items.filter(it => it.candle).length >= MAX_CANDLES) { sfx('error', { vol: 0.4 }); return }
    const g = s.kit.candle(s.candle)
    const flame = g.userData.flame as import('three').Group
    flame.scale.setScalar(0.001)
    const it = addItem(s, 'bougie', g, p, { candle: { flame, lit: 0.001 } })
    if (it) { sfx('click', { vol: 0.5 }); tone(1500, 0.05, 'triangle', 0.06, 0.18) }
  }
}

/** Les vermicelles tombent autour du doigt, chacun sur ce qu'il y a sous lui
    (le nappage, son bourrelet, une rosace, l'étage du dessous) ; ceux qui
    tomberaient contre un flanc ne restent pas. */
function sprinkle(s: State, cx: number, cy: number) {
  const h = pick(s, cx, cy, true)
  const c = h && seat(s, h, 'perle', true)
  if (!c) return
  const m4 = new s.T.Matrix4(), q = new s.T.Quaternion(), col = new s.T.Color(), one = new s.T.Vector3(1, 1, 1)
  const COLS = ['#FF6B81', '#FFC94D', '#5EC97B', '#4FB8E7', '#B197FC', '#FFFFFF', '#FF9F43']
  for (let i = 0; i < 6 && s.sprN < MAX_SPRINKLES; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * 0.13
    const g = dropHit(s, c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, true)
    if (!g || g.n.y < 0.5) continue
    m4.compose(g.p.addScaledVector(g.n, 0.006), lay(s, g.n, q), one)
    s.spr.setMatrixAt(s.sprN, m4)
    s.spr.setColorAt(s.sprN, col.set(COLS[Math.floor(Math.random() * COLS.length)]))
    s.sprN++
  }
  s.spr.count = s.sprN
  s.spr.instanceMatrix.needsUpdate = true
  if (s.spr.instanceColor) s.spr.instanceColor.needsUpdate = true
  if (Math.random() < 0.3) tone(2200 + Math.random() * 800, 0.025, 'sine', 0.03)
}

/* ---------- « Manger » : les bougies sortent, le repas se prépare ----------
   (19/10) Plus de souffle, de chanson ni de fête : « Manger », et les
   bougies sortent du gâteau une à une ; il se remet de face — et RIEN
   d'autre ne le fait tourner pendant ce temps : avant, il tournait tout
   seul pendant la fête en même temps qu'il se remettait de face, les deux
   s'équilibraient à 0,12 radian du but, et à vitesse normale le repas ne
   commençait jamais (les bots, en temps accéléré, ne le voyaient pas). */

const candlesOf = (s: State) => s.items.filter(it => it.candle)

function prepEat(s: State) {
  if (s.phase !== 'make') return
  s.phase = 'prep'; s.phaseT = 0
  ctx.root.querySelector('.bk-wrap')?.setAttribute('data-phase', 'prep')
  const out = candlesOf(s)
  s.items = s.items.filter(it => !it.candle)
  s.leaving = out.map((it, i) => ({ obj: it.obj, t: -0.15 - i * 0.13, y0: it.obj.position.y, popped: false }))
  s.prepWant = Math.round(s.rot / (Math.PI * 2)) * Math.PI * 2
  s.vRot = 0
  rehearse(s)
}

/* ---------- Pendant que les bougies sortent, la répétition du repas ----------
   Les parts sont des copies des étages coupées par leurs deux bords
   (`clippingPlanes`) et trouées par les bouchées (un bout de shader) : la
   tablette doit préparer de nouveaux rendus (des shaders) — sans répétition,
   des dizaines PENDANT le repas (35 mesurés le 11/10, avec l'ancien), de quoi
   la figer juste quand l'enfant veut manger. Chaque matière est donc
   préparée avant, telle qu'elle sera (une part, son ombre coupée, ses faces,
   la paroi d'une bouchée, les fils de crème, le couteau), sur des copies
   posées sous le comptoir — en arrière-plan (`compileAsync`). Le moteur
   garde ces rendus tant que les copies vivent : le repas les retrouve prêts. */

/** Des plans qui gardent tout (la coupe des copies n'a pas d'importance : seul leur NOMBRE compte). */
const keepAll = (T: T3, n: number) => Array.from({ length: n }, () => new T.Plane(new T.Vector3(0, 1, 0), 1e3))

/** Les bouchées d'une part, lues par ses matières : du monde au repère de la
    part, puis les ronds de la bouche et des dents dans son plan vertical
    (u, y, rayon ; 0 : rien). */
interface BiteU {
  uToPart: { value: import('three').Matrix4 }
  /** La bissectrice de la part (repère de la part) : u = sa distance à la pointe. */
  uDir: { value: import('three').Vector2 }
  uBig: { value: V3[] }
  uTeeth: { value: V3[] }
}
const newBiteU = (T: T3): BiteU => ({
  uToPart: { value: new T.Matrix4() },
  uDir: { value: new T.Vector2(1, 0) },
  uBig: { value: [new T.Vector3(), new T.Vector3()] },
  uTeeth: { value: Array.from({ length: 2 * TEETH }, () => new T.Vector3()) }
})

/** Une matière de part : coupée par ses deux bords (`planes`, son ombre aussi),
    trouée par ses bouchées (`u`). La peinture (le cercle qui s'étale) ne suit pas. */
function partMat(m: Mat, planes: Plane[] | null, u: BiteU | null): Mat {
  const c = m.clone()
  c.clippingPlanes = planes
  c.clipIntersection = false
  // Sinon chaque part porte l'ombre du gâteau entier
  c.clipShadows = !!planes
  if (u) {
    c.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u)
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 uToPart;\nuniform vec2 uDir;\nvarying vec2 vBite;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvec3 bp = (uToPart * modelMatrix * vec4(transformed, 1.0)).xyz;\nvBite = vec2(dot(bp.xz, uDir), bp.y);')
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform vec3 uBig[2];\nuniform vec3 uTeeth[${2 * TEETH}];\nvarying vec2 vBite;`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
for (int i = 0; i < 2; i++) if (distance(vBite, uBig[i].xy) < uBig[i].z) discard;
for (int i = 0; i < ${2 * TEETH}; i++) if (distance(vBite, uTeeth[i].xy) < uTeeth[i].z) discard;`)
    }
    c.customProgramCacheKey = () => 'bouchee'
  }
  return c
}

/** Le couteau : sa lame part du centre, le manche dehors. */
function makeKnife(s: State) {
  const knife = new s.T.Group()
  const k = s.kit.knife()
  k.rotation.y = Math.PI; k.position.x = 1.08
  knife.add(k)
  return knife
}

/** Un fil de crème : un cylindre de hauteur 1 qui part de son ancre. */
function strandGeo(T: T3) {
  const g = new T.CylinderGeometry(0.032, 0.032, 1, 8, 1, true)
  g.translate(0, 0.5, 0)
  return g
}

function rehearse(s: State) {
  const T = s.T
  s.stage.renderer.localClippingEnabled = true
  const g = new T.Group()
  g.position.set(0, -0.8, 0.6) // sous le comptoir : dessiné, jamais vu
  s.stage.scene.add(g)
  const w: Warm = { ready: false, g, knife: null }
  s.warm = w
  const add = (o: import('three').Object3D, shadow = false) => { o.traverse(x => { x.frustumCulled = false; x.castShadow = shadow }); g.add(o) }
  const u = newBiteU(T), planes = keepAll(T, 2)
  // Les étages d'une part : chaque matière coupée et trouée, et son ombre coupée
  const seen = new Set<Mat>()
  for (const t of s.tiers) t.g.traverseVisible(o => {
    if (isMesh(o)) for (const m of matsOf(o)) if (!seen.has(m)) { seen.add(m); add(new T.Mesh(o.geometry, s.stage.keep(partMat(m, planes, u))), true) }
  })
  // Ses faces de coupe (trouées), la paroi d'une bouchée (coupée), un fil de crème
  const [f] = s.kit.cutFaces(s.tiers[0], A0, A0 + DP)
  add(new T.Mesh(f.geometry, s.stage.keep(partMat(f.material as Mat, null, u))))
  add(new T.Mesh(f.geometry, s.stage.keep(partMat(f.material as Mat, planes, null))))
  add(new T.Mesh(s.stage.keep(strandGeo(T)), s.stage.keep(new T.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.35 }))))
  // Le couteau, le vrai : le repas le reprendra
  w.knife = makeKnife(s)
  add(w.knife, true)
  // Leurs rendus préparés en arrière-plan (sans l'extension qui le permet,
  // d'un bloc : pendant que les bougies sortent, pas pendant qu'on mange) ;
  // la qualité ne compte pas ces images
  s.stage.settle()
  const done = () => { w.ready = true }
  s.stage.renderer.compileAsync(g, s.stage.camera, s.stage.scene).then(done, done)
}

/* ---------- On mange le gâteau, part par part ----------
   (19/10, le père : « l'animation pour manger le gâteau est vraiment éclatée,
   fais comme la pizza ») Plus de gâteau qui tourne, de fourchette, de petite
   assiette ni de bouchée sur la fourchette. Six coups de couteau, et les six
   parts s'écartent un peu ; un toucher sur l'une, dans l'ordre qu'on veut :
   elle sort du gâteau, la crème, la confiture et le glaçage FILENT entre
   elle et ses voisines puis cassent ; elle vient devant nous, la pointe la
   première, et CROC, CROC : deux bouchées qui laissent la marque des dents
   (`biteOf` : la bouche et ses dents, des trous dans ses matières, et la
   paroi de génoise qu'elles laissent) ; le reste disparaît dans les miettes.

   Une part est une COPIE des étages (nappage, bourrelet, coulures compris)
   gardée entre ses deux bords ; ce qui était posé dessus part avec elle. */

const isMesh = (o: import('three').Object3D): o is import('three').Mesh => (o as import('three').Mesh).isMesh
const matsOf = (m: import('three').Mesh) => Array.isArray(m.material) ? m.material : [m.material]
/** L'angle (repère du gâteau) est-il dans la part [a0, a0 + DP] ? */
const inPart = (a: number, a0: number) => ((a - a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) < DP
const ease = (k: number) => k * k * (3 - 2 * k)

/** Le temps d'une part qu'on mange : elle sort, elle vient à nous, croc, croc, avalée. */
const OUT = 0.55, FLY = 0.65, BITE1 = OUT + FLY, BITE2 = BITE1 + 0.5, GULP = BITE2 + 0.42, GONE = GULP + 0.28
/** Une part qu'on tire : de combien elle sort, de combien elle monte. */
const PULL = 0.14, LIFT = 0.45
/** Un coup de couteau ; la hauteur du couteau au-dessus du gâteau ; l'écart des parts coupées. */
const CHOP = 0.3, KNIFE_UP = 0.09, GAP = 0.06

function makePart(s: State, i: number): Part {
  const T = s.T
  const a0 = A0 + i * DP, a1 = a0 + DP, mid = a0 + DP / 2
  const g = new T.Group()
  g.rotation.y = s.cake.rotation.y
  s.stage.scene.add(g)
  const local = [
    new T.Plane(new T.Vector3(-Math.sin(a0), 0, Math.cos(a0)), 0), // garde ce qui est après a0
    new T.Plane(new T.Vector3(Math.sin(a1), 0, -Math.cos(a1)), 0) // garde ce qui est avant a1
  ]
  const world = local.map(p => p.clone())
  const u = newBiteU(T)
  u.uDir.value.set(Math.cos(mid), Math.sin(mid))
  const mats: Mat[] = []
  const mine = (m: Mat, planes: Plane[] | null, bitten: boolean) => { const c = partMat(m, planes, bitten ? u : null); mats.push(c); return c }
  let faceMat: Mat | null = null, sponge: Mat | null = null
  s.tiers.forEach((t, k) => {
    const c = t.g.clone(true)
    c.visible = true
    c.position.y = s.tierY[k]
    const conv = new Map<Mat, Mat>()
    const to = (m: Mat) => { let x = conv.get(m); if (!x) conv.set(m, x = mine(m, world, true)); return x }
    c.traverse(o => { if (isMesh(o)) o.material = Array.isArray(o.material) ? o.material.map(to) : to(o.material) })
    g.add(c)
    // Ses deux coupes (la génoise en couches), trouées elles aussi
    for (const f of s.kit.cutFaces(t, a0, a1)) {
      sponge ??= f.material as Mat
      faceMat ??= mine(sponge, null, true)
      f.material = faceMat; f.position.y = s.tierY[k]; g.add(f)
    }
  })
  // Ce qui est posé sur la part part avec elle
  const items: Item[] = []
  for (const it of s.items) {
    const p = it.obj.position
    if (p.y < PLATE_Y + 0.01 || !inPart(Math.atan2(p.z, p.x), a0)) continue
    s.cake.remove(it.obj)
    g.add(it.obj)
    items.push(it)
  }
  s.items = s.items.filter(it => !items.includes(it))
  // Et ses vermicelles
  let spr: Part['spr'] = null
  {
    const m4 = new T.Matrix4(), c = new T.Color(), v = new T.Vector3(), keep: number[] = []
    for (let j = 0; j < s.sprN; j++) {
      s.spr.getMatrixAt(j, m4); v.setFromMatrixPosition(m4)
      if (v.y >= PLATE_Y + 0.01 && inPart(Math.atan2(v.z, v.x), a0)) keep.push(j)
    }
    if (keep.length) {
      const im = new T.InstancedMesh(s.spr.geometry, s.spr.material, keep.length)
      const at: [number, number][] = []
      keep.forEach((j, n) => {
        s.spr.getMatrixAt(j, m4); im.setMatrixAt(n, m4); s.spr.getColorAt(j, c); im.setColorAt(n, c)
        v.setFromMatrixPosition(m4); at.push([v.x * Math.cos(mid) + v.z * Math.sin(mid), v.y])
      })
      im.frustumCulled = false
      g.add(im)
      spr = { im, at }
    }
  }
  const last = s.tiers.length - 1
  return {
    i, g, a0, a1, mid, local, world, u, items, spr, mats,
    wallMat: sponge ? mine(sponge, world, false) : null, walls: [],
    L: radiusAt(s.tiers[0].outline, mid), H: s.tierY[last] + s.tiers[last].h,
    dir: new T.Vector3(Math.cos(mid), 0, Math.sin(mid)).applyAxisAngle(new T.Vector3(0, 1, 0), g.rotation.y),
    state: 'rest', t: 0, bites: 0, jolt: 0, strands: [], from: null
  }
}

function startEat(s: State) {
  const T = s.T
  s.phase = 'eat'
  // Une couleur qui s'étalait encore : finie (les parts n'ont pas le cercle qui s'étale)
  for (const t of s.tiers) { t.bodyMat.userData.step?.(10); t.glazeMat.userData.step?.(10) }
  s.stage.renderer.localClippingEnabled = true
  // La répétition est finie : ses copies quittent la scène (leurs matières
  // restent en vie, et avec elles les rendus préparés) ; le couteau répété sert pour de vrai
  const knife = s.warm?.knife ?? makeKnife(s)
  if (s.warm) s.stage.scene.remove(s.warm.g)
  knife.traverse(x => { x.frustumCulled = true })
  knife.visible = false
  s.cake.add(knife)
  s.cake.updateMatrixWorld(true)
  const parts = Array.from({ length: PARTS }, (_, i) => makePart(s, i))
  for (const t of s.tiers) t.g.visible = false
  // Les vermicelles restés sur l'assiette du présentoir : seuls dans les leurs
  {
    const m4 = new T.Matrix4(), c = new T.Color()
    let n = 0
    for (let j = 0; j < s.sprN; j++) {
      s.spr.getMatrixAt(j, m4)
      if (m4.elements[13] >= PLATE_Y + 0.01) continue
      s.spr.getColorAt(j, c)
      s.spr.setMatrixAt(n, m4); s.spr.setColorAt(n, c); n++
    }
    s.sprN = n; s.spr.count = n
    s.spr.instanceMatrix.needsUpdate = true
    if (s.spr.instanceColor) s.spr.instanceColor.needsUpdate = true
  }
  s.eat = {
    parts, eaten: 0, bites: 0, cuts: 0, knifeT: 0, ready: false, gap: 0, knife, camK: 0,
    strandGeo: s.stage.keep(strandGeo(T)), strandMats: new Map()
  }
  placeParts(s)
}

/** Une part qu'on mange occupe la bouche : la suivante attend sa deuxième bouchée. */
const busy = (e: Eat) => e.parts.some(p => p.state === 'eat' && p.t < BITE2)

/** Où on la prend : le dessus de la part et le milieu de son bord (monde). */
function grabPoints(s: State, p: Part) {
  const T = s.T
  let y = s.tierY[0] + s.tiers[0].h
  const d = p.L * 0.55
  s.tiers.forEach((t, k) => { if (radiusAt(t.outline, p.mid) > d + 0.04) y = s.tierY[k] + t.h })
  const loc = (r: number, yy: number) => p.g.localToWorld(new T.Vector3(Math.cos(p.mid) * r, yy, Math.sin(p.mid) * r))
  return [loc(d, y + 0.01), loc(p.L * 0.95, s.tierY[0] + s.tiers[0].h * 0.5)]
}
function toScr(s: State, w: V3) {
  const r = s.stage.renderer.domElement.getBoundingClientRect()
  const v = w.clone().project(s.stage.camera)
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }
}

/** La part sous le doigt (la plus proche, d'assez près), si on peut en prendre une. */
function partAt(s: State, x: number, y: number) {
  const e = s.eat
  if (s.phase !== 'eat' || !e?.ready || busy(e)) return null
  const r = s.stage.renderer.domElement.getBoundingClientRect()
  let best: Part | null = null, bd = 0.2 * Math.min(r.width, r.height)
  for (const p of e.parts) if (p.state === 'rest') for (const w of grabPoints(s, p)) {
    const q = toScr(s, w), d = Math.hypot(q.x - x, q.y - y)
    if (d < bd) { bd = d; best = p }
  }
  return best
}

/** Un toucher pendant qu'on mange : la part touchée sort, et on la mange. */
function eatTap(s: State, x: number, y: number) {
  const e = s.eat, p = partAt(s, x, y)
  if (!e || !p) return
  const T = s.T
  p.state = 'eat'; p.t = 0
  p.from = { p: p.g.position.clone(), q: p.g.quaternion.clone() }
  p.g.traverse(o => { o.castShadow = false })
  sfx('cloth', { vol: 0.45, rate: 1.2 })
  // Les fils, comme le fromage de la pizza : du dessus de la part au dessus de
  // ses voisines restées là, par-dessus l'écart — vus d'en haut, même pour la part de devant
  const glazeOf = (t: Tier) => '#' + (t.glaze.visible ? t.glazeMat : t.bodyMat).color.getHexString()
  for (const [nb, edge, sg] of [[e.parts[(p.i + PARTS - 1) % PARTS], p.a0, -1], [e.parts[(p.i + 1) % PARTS], p.a1, 1]] as [Part, number, number][]) {
    if (nb.state !== 'rest') continue
    s.tiers.forEach((t, k) => {
      const y = s.tierY[k] + t.h + 0.012
      // Sur ce qui se voit du dessus : pas sous l'étage d'au-dessus
      const R = radiusAt(t.outline, edge), r0 = k < s.tiers.length - 1 ? Math.min(R * 0.8, radiusAt(s.tiers[k + 1].outline, edge) + 0.07) : R * 0.35
      const pt = (a: number, r: number) => new T.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)
      const add = (a: V3, b: V3, col: string) => {
        let m = e.strandMats.get(col)
        if (!m) e.strandMats.set(col, m = s.stage.keep(new T.MeshStandardMaterial({ color: col, roughness: 0.35 })))
        const mesh = new T.Mesh(e.strandGeo, m)
        mesh.frustumCulled = false
        s.stage.scene.add(mesh)
        const aw = nb.g.localToWorld(a)
        p.strands.push({ mesh, a: aw, b, snap: aw.distanceTo(p.g.localToWorld(b.clone())) + 0.22 + Math.random() * 0.25, col })
      }
      // Au coin (sur la silhouette de la part, vu de face), et par-dessus la voisine, plus loin
      add(pt(edge + sg * 0.03, R * 0.95), pt(edge - sg * 0.03, R * 0.95), glazeOf(t))
      const r = r0 + (R * 0.9 - r0) * Math.random()
      add(pt(edge + sg * 0.32, r), pt(edge - sg * 0.04, r), '#FFF4E0')
    })
  }
}

/** Croc ! La bouchée n° k : des trous dans ses matières, la paroi de génoise, des miettes. */
function bite(s: State, e: Eat, p: Part, k: number) {
  const T = s.T
  const b = biteOf(p.L, PLATE_Y, p.H, k, p.i + 1)
  p.u.uBig.value[k].set(b.c[0], b.c[1], b.R)
  b.teeth.forEach(([x, z, r], j) => p.u.uTeeth.value[k * TEETH + j].set(x, z, r))
  // La paroi : celle de la dernière bouchée (elle contient la précédente)
  for (const w of p.walls) { p.g.remove(w); w.geometry.dispose() }
  p.walls = []
  if (p.wallMat) s.tiers.forEach((t, j) => {
    const w = s.kit.biteWall(t, b, p.mid, s.tierY[j], DP / 2)
    if (!w) return
    w.material = p.wallMat!
    w.position.y = s.tierY[j]
    p.g.add(w); p.walls.push(w)
  })
  // Ce qui était posé là est mangé aussi
  const cu = Math.cos(p.mid), su = Math.sin(p.mid)
  for (const it of p.items) { const o = it.obj.position; if (inBite(b, o.x * cu + o.z * su, o.y)) it.obj.visible = false }
  if (p.spr) {
    const zero = new T.Matrix4().makeScale(0, 0, 0)
    p.spr.at.forEach(([u, y], j) => { if (inBite(b, u, y)) p.spr!.im.setMatrixAt(j, zero) })
    p.spr.im.instanceMatrix.needsUpdate = true
  }
  p.bites++; e.bites++
  p.jolt = 1
  // Les miettes, là où les dents ont mordu
  const r = b.c[0] + b.R * 0.9, at = p.g.localToWorld(new T.Vector3(cu * r, b.c[1], su * r))
  const col = '#' + (s.tiers[s.tiers.length - 1].glaze.visible ? s.tiers[s.tiers.length - 1].glazeMat : s.tiers[0].bodyMat).color.getHexString()
  s.fx.burst(at, { count: 22, color: [SPONGE, col, '#FFF4E0'], speed: 0.9, spread: 1, life: 0.9, size: 0.045, gravity: 2.2 })
  sCrunch()
}

/** Avalée : la part s'en va, ses matières aussi. */
function gone(s: State, e: Eat, p: Part) {
  p.state = 'gone'
  s.stage.scene.remove(p.g)
  for (const st of p.strands) s.stage.scene.remove(st.mesh)
  p.strands = []
  for (const w of p.walls) w.geometry.dispose()
  p.mats.forEach(m => m.dispose())
  p.spr?.im.dispose()
  e.eaten++
  tone(520 + e.eaten * 30, 0.09, 'triangle', 0.08); tone(780 + e.eaten * 30, 0.14, 'triangle', 0.08, 0.11)
  if (e.eaten >= PARTS) {
    s.phase = 'done'
    ctx.after(900, () => { if (me === s) ctx.finish({ title: 'Gâteau dévoré !', msg: 'Il n’en reste pas une miette', stars: 3 }) })
  }
}

/** Devant nous, de profil et un peu à droite du gâteau : la pointe à
    gauche, une coupe (ses couches) tournée vers nous, le dessus un peu
    aussi — la bouche mord le coin du dessus de la pointe. */
function mouthPose(s: State, p: Part) {
  const T = s.T, cam = s.stage.camera
  const fwd = cam.getWorldDirection(new T.Vector3())
  // La bissectrice vers la droite : on voit la bouchée par la tranche, son arc net
  const yaw = p.mid - (Math.atan2(fwd.z, fwd.x) + Math.PI / 2)
  const right = new T.Vector3().crossVectors(fwd, new T.Vector3(0, 1, 0)).normalize()
  const up = new T.Vector3().crossVectors(right, fwd)
  const q = new T.Quaternion().setFromAxisAngle(right, 0.22).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw))
  const D = 2.1 + 0.9 * Math.max(p.L, p.H - PLATE_Y)
  // Le cadre à cette distance : la part un peu à droite, un peu haut
  const hh = Math.tan(s.stage.camera.fov * Math.PI / 360) * D, ww = hh * s.stage.camera.aspect
  const at = cam.position.clone().addScaledVector(fwd, D).addScaledVector(right, ww * 0.3).addScaledVector(up, hh * 0.08)
  const c = new T.Vector3(Math.cos(p.mid) * p.L * 0.5, (PLATE_Y + p.H) / 2, Math.sin(p.mid) * p.L * 0.5).applyQuaternion(q)
  const along = new T.Vector3(Math.cos(p.mid), 0, Math.sin(p.mid)).applyQuaternion(q)
  return { p: at.sub(c), q, fwd, along }
}

function stepPart(s: State, e: Eat, p: Part, dt: number) {
  const T = s.T
  p.t += dt
  const t = p.t
  if (t < OUT) {
    // On la tire : elle monte, en sortant un peu (les fils s'étirent à ses coins, devant les voisines)
    const k = ease(t / OUT)
    p.g.position.copy(p.from!.p).addScaledVector(p.dir, PULL * k)
    p.g.position.y += LIFT * k
  } else {
    const m = mouthPose(s, p)
    const k = ease(Math.min(1, (t - OUT) / FLY))
    const out = p.from!.p.clone().addScaledVector(p.dir, PULL)
    out.y += LIFT
    p.g.position.lerpVectors(out, m.p, k)
    p.g.position.y += Math.sin(k * Math.PI) * 0.35
    p.g.quaternion.slerpQuaternions(p.from!.q, m.q, k)
    // Croc : elle part un peu sous les dents, et revient
    p.jolt = Math.max(0, p.jolt - dt * 6)
    p.g.position.addScaledVector(m.along, 0.08 * Math.sin(p.jolt * Math.PI))
    if (t >= BITE1 && p.bites === 0) bite(s, e, p, 0)
    if (t >= BITE2 && p.bites === 1) bite(s, e, p, 1)
    if (t >= GULP) {
      // Avalée : ce qui reste file vers nous en rapetissant
      const g = Math.min(1, (t - GULP) / (GONE - GULP))
      p.g.position.addScaledVector(m.fwd, -0.6 * g * g)
      p.g.scale.setScalar(Math.max(0.001, 1 - g * g))
      if (g >= 1) {
        s.fx.burst(p.g.localToWorld(new T.Vector3(Math.cos(p.mid) * p.L * 0.85, p.H * 0.7, Math.sin(p.mid) * p.L * 0.85)), { count: 14, color: [SPONGE, '#FFF4E0'], speed: 0.6, spread: 1, life: 0.7, size: 0.04, gravity: 2 })
        sCrunch()
        gone(s, e, p)
        return
      }
    }
  }
  // Les fils s'étirent depuis la voisine, et cassent
  p.g.updateMatrixWorld()
  const up = new T.Vector3(0, 1, 0)
  for (let j = p.strands.length - 1; j >= 0; j--) {
    const st = p.strands[j]
    const b = p.g.localToWorld(st.b.clone())
    const len = st.a.distanceTo(b)
    if (len > st.snap) {
      s.stage.scene.remove(st.mesh); p.strands.splice(j, 1)
      sfx('pluck', { vol: 0.3, rate: 1.2 + Math.random() * 0.5 })
      s.fx.burst(b.lerp(st.a, 0.5), { count: 3, color: [st.col], speed: 0.25, spread: 1, life: 0.5, size: 0.03, gravity: 2 })
      continue
    }
    st.mesh.position.copy(st.a)
    st.mesh.quaternion.setFromUnitVectors(up, b.clone().sub(st.a).normalize())
    const thin = Math.max(0.45, 1 - len * 1.5)
    st.mesh.scale.set(thin, Math.max(0.001, len), thin)
  }
}

/** Les parts posées : écartées d'autant que de coups de couteau donnés ; et les plans de toutes. */
function placeParts(s: State) {
  const e = s.eat!
  for (const p of e.parts) {
    if (p.state === 'rest') p.g.position.copy(p.dir).multiplyScalar(e.gap)
    if (p.state === 'gone') continue
    p.g.updateMatrixWorld(true)
    p.local.forEach((pl, i) => p.world[i].copy(pl).applyMatrix4(p.g.matrixWorld))
    p.u.uToPart.value.copy(p.g.matrixWorld).invert()
  }
}

/** Pendant qu'on mange, la caméra recule un peu : le gâteau entier, et la place devant nous. */
const CAM0 = { p: [0, 2.05, 5.4], t: [0, 0.95, 0] }, CAM_EAT = { p: [0, 2.3, 6.3], t: [0, 0.82, 0] }

function stepEat(s: State, dt: number) {
  const e = s.eat
  if (!e) return
  const T = s.T
  e.camK = Math.min(1, e.camK + dt / 1.2)
  {
    const k = ease(e.camK), L = (a: number[], b: number[], i: number) => a[i] + (b[i] - a[i]) * k
    s.stage.camera.position.set(L(CAM0.p, CAM_EAT.p, 0), L(CAM0.p, CAM_EAT.p, 1), L(CAM0.p, CAM_EAT.p, 2))
    s.stage.camera.lookAt(L(CAM0.t, CAM_EAT.t, 0), L(CAM0.t, CAM_EAT.t, 1), L(CAM0.t, CAM_EAT.t, 2))
    s.stage.camera.updateMatrixWorld()
  }
  // Six coups de couteau, un par bord de part ; entre deux, il tourne en remontant
  if (!e.ready) {
    e.knifeT += dt
    const k = Math.min(PARTS - 1, Math.floor(e.knifeT / CHOP)), p = Math.min(1, (e.knifeT - k * CHOP) / CHOP)
    const top = s.tierY[s.tierY.length - 1] + s.tiers[s.tiers.length - 1].h
    const hi = top + KNIFE_UP, lo = PLATE_Y + 0.004
    const y = p < 0.4 ? hi + (lo - hi) * ease(p / 0.4) : p < 0.55 ? lo : lo + (hi - lo) * ease((p - 0.55) / 0.45)
    const turn = k < PARTS - 1 && p > 0.55 ? ease((p - 0.55) / 0.45) : 0
    e.knife.visible = true
    e.knife.rotation.y = -(A0 + (k + turn) * DP)
    e.knife.position.y = y
    if (p >= 0.38 && e.cuts <= k) {
      e.cuts = k + 1
      sfx('chop', { vol: 0.6, rate: 0.95 + k * 0.04 })
      const a = A0 + k * DP, r = s.tiers[0].r * 0.7
      s.fx.burst(s.cake.localToWorld(new T.Vector3(Math.cos(a) * r, top, Math.sin(a) * r)), { count: 6, color: [SPONGE, '#FFF4E0'], speed: 0.4, spread: 1, life: 0.6, size: 0.035, gravity: 2 })
    }
    if (e.knifeT >= PARTS * CHOP) {
      e.ready = true
      e.knife.visible = false
      // Un geste nouveau : toucher une part
      handNow()
    }
  }
  e.gap += (GAP * e.cuts / PARTS - e.gap) * Math.min(1, dt * 10)
  for (const p of e.parts) if (p.state === 'eat') stepPart(s, e, p, dt)
  placeParts(s)
}

/** Où toucher pendant qu'on mange (la main, les bots) : la part la plus proche de nous. */
function eatTarget(s: State) {
  const e = s.eat
  if (s.phase !== 'eat' || !e?.ready || busy(e)) return null
  let best: Part | null = null
  for (const p of e.parts) if (p.state === 'rest' && (!best || p.dir.z > best.dir.z)) best = p
  return best ? toScr(s, grabPoints(s, best)[0]) : null
}

/* ---------- Chaque image ---------- */

function frame(s: State, dt: number) {
  s.t += dt
  s.phaseT += dt
  // Le plateau tourne au doigt (avec son élan) ; « Manger », il se remet de face (et rien d'autre ne le tourne)
  if (s.phase === 'make') { s.rot += s.vRot * dt; s.vRot *= Math.pow(0.01, dt) }
  else if (s.phase === 'prep') {
    s.rot += (s.prepWant - s.rot) * Math.min(1, dt * 4)
    if (Math.abs(s.prepWant - s.rot) < 0.004) s.rot = s.prepWant
  }
  s.cake.rotation.y = s.rot
  for (const t of s.tiers) t.step(dt)
  for (const it of s.items) {
    const o = it.obj
    if (o.userData.grow < 1) {
      o.userData.grow = Math.min(1, o.userData.grow + dt * 5)
      const g = o.userData.grow
      o.scale.setScalar(Math.max(0.001, g < 0.7 ? g / 0.7 * 1.15 : 1.15 - (g - 0.7) / 0.3 * 0.15))
    }
    const c = it.candle
    if (!c) continue
    if (c.lit > 0 && c.lit < 1) c.lit = Math.min(1, c.lit + dt * 3)
    // La flamme danse
    const f = c.flame
    f.scale.set(c.lit * (1 + Math.sin(s.t * 17 + o.id) * 0.06), c.lit * (1 + Math.sin(s.t * 13 + o.id) * 0.1), c.lit)
    f.rotation.z = Math.sin(s.t * 7 + o.id) * 0.08
  }
  // « Manger » : les bougies sortent du gâteau, une à une (un petit « pop »)
  for (const l of s.leaving) {
    l.t += dt
    if (l.t < 0) continue
    if (!l.popped) { l.popped = true; sfx('pluck', { vol: 0.55, rate: 1.25 + Math.random() * 0.35 }) }
    const k = Math.min(1, l.t / 0.42)
    l.obj.position.y = l.y0 + k * 0.55
    l.obj.scale.setScalar(Math.max(0.001, 1 - k * k))
    if (k >= 1) l.obj.parent?.remove(l.obj)
  }
  s.leaving = s.leaving.filter(l => l.obj.parent)
  // Les bougies parties, le gâteau de face, le repas préparé (huit secondes au plus) : la première part se coupe toute seule
  if (s.phase === 'prep' && !s.leaving.length && s.rot === s.prepWant && (s.warm?.ready || s.phaseT > 8)) {
    s.cake.rotation.y = s.rot
    startEat(s)
  }
  if (s.phase === 'eat' || s.phase === 'done') stepEat(s, dt)
  s.fx.update(dt)
}

/* ---------- La scène ---------- */

async function build(c: GameContext, arena: HTMLElement): Promise<State | null> {
  const stage = await createStage(arena, {
    sky: '#F6E3D6', fov: 30, cam: CAM0.p as [number, number, number], target: CAM0.t as [number, number, number],
    hemi: ['#FFF4E6', '#C8A88E', 0.9], sun: { pos: [-3.5, 6, 4.5], color: '#FFF1DC', intensity: 2.2, area: 3, far: 20 },
    fill: 0.55, exposure: 1.02
  })
  if (!c.alive()) { stage.dispose(); return null }
  const T = stage.T
  const kit = await cakeKit(T)
  if (!c.alive() || !stage.alive) { kit.dispose(); stage.dispose(); return null }
  const tex = (w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h
    draw(cv.getContext('2d')!)
    const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4
    return stage.keep(t)
  }
  // Le mur à rayures et son soubassement
  const wall = new T.Mesh(new T.PlaneGeometry(12, 6), new T.MeshStandardMaterial({
    roughness: 0.9, map: tex(1024, 512, x => {
      for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#FFF4E4' : '#CFEDE0'; x.fillRect(i * 64, 0, 64, 512) }
      x.fillStyle = '#F2B8C6'; x.fillRect(0, 400, 1024, 112)
      x.fillStyle = '#E79AAE'; x.fillRect(0, 396, 1024, 8)
    })
  }))
  wall.position.set(0, 1.5, -2.2)
  wall.receiveShadow = true
  stage.scene.add(wall)
  // Le comptoir en marbre
  const marble = tex(1024, 512, x => {
    x.fillStyle = '#F7F4F0'; x.fillRect(0, 0, 1024, 512)
    x.strokeStyle = 'rgba(160,150,160,0.35)'; x.lineWidth = 2
    let seed = 7
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    for (let i = 0; i < 18; i++) {
      x.beginPath(); let px = r() * 1024, py = r() * 512; x.moveTo(px, py)
      for (let j = 0; j < 8; j++) { px += 40 + r() * 90; py += (r() - 0.5) * 90; x.lineTo(px, py) }
      x.stroke()
    }
  })
  // Profond : quand la caméra recule pour le repas, on n'en voit pas le bord
  const counter = new T.Mesh(new T.BoxGeometry(9, 0.12, 6.4), new T.MeshStandardMaterial({ map: marble, roughness: 0.22 }))
  counter.position.set(0, -0.06, 1.0)
  counter.receiveShadow = true
  stage.scene.add(counter)
  // L'étagère et ses bocaux de bonbons, les fanions
  const shelf = new T.Mesh(new T.BoxGeometry(3.4, 0.07, 0.4), new T.MeshStandardMaterial({ map: stage.keep(woodTex(T, '#C99A5F')), roughness: 0.7 }))
  shelf.position.set(-1.9, 1.95, -2.0)
  shelf.castShadow = true
  stage.scene.add(shelf)
  ;([['#FF8FAB', 0.5], ['#FFD36B', 0.42], ['#9ED9F2', 0.55], ['#B9A6F5', 0.38]] as [string, number][]).forEach(([col, h], i) => {
    const jar = new T.Mesh(new T.CylinderGeometry(0.17, 0.17, h, 28), new T.MeshStandardMaterial({ color: col, roughness: 0.3 }))
    jar.position.set(-3.2 + i * 0.42, 1.985 + h / 2, -2.0)
    jar.castShadow = true
    const lid = new T.Mesh(new T.CylinderGeometry(0.18, 0.18, 0.06, 28), new T.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.5 }))
    lid.position.y = h / 2 + 0.03
    jar.add(lid)
    stage.scene.add(jar)
  })
  const flagCols = ['#FF6B81', '#FFC94D', '#5EC97B', '#4FB8E7', '#B197FC']
  const flagShape = new T.Shape(); flagShape.moveTo(-0.13, 0); flagShape.lineTo(0.13, 0); flagShape.lineTo(0, -0.26); flagShape.closePath()
  const flagGeo = new T.ShapeGeometry(flagShape)
  for (let i = 0; i < 15; i++) {
    const f = new T.Mesh(flagGeo, new T.MeshStandardMaterial({ color: flagCols[i % 5], roughness: 0.8, side: T.DoubleSide }))
    f.position.set(-3.2 + i * 0.46, 2.75 - Math.sin((i / 14) * Math.PI) * 0.35, -2.15)
    stage.scene.add(f)
  }
  // Le présentoir et le gâteau (qui tournent ensemble)
  const cake = new T.Group()
  stage.scene.add(cake)
  const stand = kit.stand()
  cake.add(stand)
  const standMeshes: import('three').Object3D[] = []
  stand.traverse(o => { if ((o as import('three').Mesh).isMesh) standMeshes.push(o) })
  const spr = kit.sprinkles(MAX_SPRINKLES, 0.001)
  spr.count = 0
  // Sa sphère englobante serait calculée une fois, vide (aucun vermicelle encore) :
  // le moteur ne les dessinerait jamais
  spr.frustumCulled = false
  cake.add(spr)
  const s: State = {
    stage, T, kit, cake, tiers: [], tierY: [], nTiers: 2, shape: 'round', items: [], spr, sprN: 0,
    step: 'base', glaze: GLAZES[1][0], cream: CREAMS[0][0], drop: false, deco: 'fraise', candle: CANDLES[0][0],
    rot: 0.35, vRot: 0, phase: 'make', phaseT: 0, leaving: [], prepWant: 0,
    fx: particles(stage, 500), ray: new T.Raycaster(), t: 0, eat: null, stand: standMeshes, warm: null
  }
  buildBase(s)
  return s
}

/* ---------- Les vignettes de la palette (rendues une fois, en 3D) ---------- */

async function renderThumbs(px: number) {
  if (Object.keys(thumbs).length) return
  await withRenderer(px * 2, px * 2, async (T2, r, env) => {
    const k2 = await cakeKit(T2)
    const make: Record<string, () => import('three').Object3D> = {
      fraise: () => k2.strawberry(), framboise: () => k2.raspberry(), myrtille: () => k2.blueberry(), cerise: () => k2.cherry(),
      perle: () => k2.pearls(1, 0, '#FFFFFF'), rosace: () => k2.rosette('#FFF7EC'), goutte: () => k2.rosette('#FFF7EC', true)
    }
    for (const [c] of CANDLES) make['bougie' + c] = () => k2.candle(c)
    for (const [id, f] of Object.entries(make)) {
      const sc = new T2.Scene()
      sc.environment = env; sc.environmentIntensity = 0.7
      sc.add(new T2.HemisphereLight('#FFF4E6', '#C8A88E', 0.6))
      const sun = new T2.DirectionalLight('#FFF1DC', 2.4); sun.position.set(-2, 4, 3); sc.add(sun)
      const o = f(); sc.add(o)
      const box = new T2.Box3().setFromObject(o)
      const ctr = box.getCenter(new T2.Vector3()), rad = box.getSize(new T2.Vector3()).length() / 2
      const cam = new T2.PerspectiveCamera(30, 1, 0.005, 10)
      const d = rad / Math.sin(15 * Math.PI / 180) * 0.8
      cam.position.set(ctr.x, ctr.y + d * 0.45, ctr.z + d * 0.9); cam.lookAt(ctr)
      r.render(sc, cam)
      thumbs[id] = r.domElement.toDataURL('image/png')
    }
    k2.dispose()
  }).catch(() => { /* sans vignettes : des pastilles de couleur */ })
}

/* ---------- Les icônes ---------- */

const svg = (inner: string, sz = 34) => `<svg viewBox="0 0 48 48" width="${sz}" height="${sz}">${inner}</svg>`
const STEP_ICON: Record<Step, string> = {
  base: svg('<rect x="9" y="26" width="30" height="14" rx="3" fill="#E9B872"/><rect x="14" y="14" width="20" height="12" rx="3" fill="#E9B872"/><path d="M9 33h30M14 20h20" stroke="#C98F45" stroke-width="2"/>'),
  glacage: svg('<rect x="10" y="18" width="28" height="22" rx="4" fill="#FFF1D6"/><path d="M10 22c0-4 2-6 6-6h16c4 0 6 2 6 6v2c-2 0-2 6-4 6s-2-5-4-5-2 9-4 9-2-9-4-9-2 4-4 4-2-7-4-7z" fill="#E2557E"/>'),
  creme: svg('<path d="M14 8h20l-6 22h-8z" fill="#BFE4F6"/><path d="M20 30h8l-4 8z" fill="#9CA6B0"/><path d="M18 40c0-3 3-4 6-4s6 1 6 4c0 2-2 3-6 3s-6-1-6-3z" fill="#FFF7EC" stroke="#E8DCCB"/>'),
  decor: svg('<path d="M24 14c8 0 12 5 11 12-1 8-7 14-11 14S14 34 13 26c-1-7 3-12 11-12z" fill="#D2203A"/><path d="M17 15l7 3 7-3-3 4h-8z" fill="#3E8B3C"/><g fill="#EDC65A"><circle cx="20" cy="24" r="1"/><circle cx="27" cy="23" r="1"/><circle cx="24" cy="30" r="1"/><circle cx="19" cy="31" r="1"/><circle cx="29" cy="30" r="1"/></g>'),
  bougies: svg('<rect x="20" y="20" width="8" height="22" rx="2" fill="#FFFFFF" stroke="#FF6B81" stroke-width="2"/><path d="M24 6c4 5 5 8 0 12-5-4-4-7 0-12z" fill="#FFB347"/><path d="M24 11c2 3 2 4 0 6-2-2-2-3 0-6z" fill="#FFF6C8"/>')
}
const tiersIcon = (n: number) => svg(Array.from({ length: n }, (_, i) => {
  const w = 30 - i * 8, h = 9, y = 38 - (i + 1) * (h + 1)
  return `<rect x="${24 - w / 2}" y="${y}" width="${w}" height="${h}" rx="2.5" fill="#E9B872" stroke="#C98F45" stroke-width="1.4"/>`
}).join(''))
const SHAPE_ICON: Record<CakeShape, string> = {
  round: svg('<ellipse cx="24" cy="26" rx="15" ry="13" fill="#E9B872" stroke="#C98F45" stroke-width="2"/>'),
  heart: svg('<path d="M24 40C10 30 7 23 9 17c2-6 10-8 15-2 5-6 13-4 15 2 2 6-1 13-15 23z" fill="#E9B872" stroke="#C98F45" stroke-width="2"/>'),
  square: svg('<rect x="10" y="12" width="28" height="26" rx="5" fill="#E9B872" stroke="#C98F45" stroke-width="2"/>')
}
const SHAPE_NAME: Record<CakeShape, string> = { round: 'Rond', heart: 'Cœur', square: 'Carré' }
const pot = (c: string) => svg(`<path d="M12 18h24v16a8 8 0 0 1-8 8h-8a8 8 0 0 1-8-8z" fill="${c}" stroke="rgba(69,54,42,.35)" stroke-width="1.5"/><path d="M14 18c2 5 4 6 6 2 2 6 5 6 7 1 2 4 5 4 7-3" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="2"/>`)
const EAT_ICON = svg('<path d="M5 40h25V21z" fill="#E9B872"/><path d="M5 40 30 21v5L11 40z" fill="#F58FB8"/><path d="M15.5 33.5H30" stroke="#FFF4E0" stroke-width="2.6"/><circle cx="26.5" cy="20" r="3.4" fill="#E2453C"/><path d="M36 6v8a4 4 0 0 0 8 0V6M40 6v9" fill="none" stroke="#9CA6B0" stroke-width="2.4" stroke-linecap="round"/><rect x="38.5" y="17" width="3" height="25" rx="1.5" fill="#9CA6B0"/>')
const SPRINKLE_ICON = svg(['#FF6B81', '#FFC94D', '#5EC97B', '#4FB8E7', '#B197FC'].map((c, i) => `<rect x="${10 + i * 6}" y="${14 + (i % 2) * 14}" width="4" height="12" rx="2" fill="${c}" transform="rotate(${-30 + i * 15} ${12 + i * 6} ${20 + (i % 2) * 14})"/>`).join(''))

/* ---------- Le jeu ---------- */

/** Un point du gâteau à l'écran (repère du gâteau). */
function screenOf(s: State, x: number, y: number, z: number) {
  const v = s.cake.localToWorld(new s.T.Vector3(x, y, z)).project(s.stage.camera)
  const r = s.stage.renderer.domElement.getBoundingClientRect()
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }
}
/** Le dessus de l'étage n° i, un peu devant le centre (vers nous, au repos). */
const topOf = (s: State, i: number, d = 0.25) => {
  const t = s.tiers[i]
  const a = Math.PI / 2 - s.cake.rotation.y
  return screenOf(s, Math.cos(a) * t.r * d, s.tierY[i] + t.h + 0.01, Math.sin(a) * t.r * d)
}
const sideOf = (s: State, i: number) => {
  const t = s.tiers[i]
  const a = Math.PI / 2 - s.cake.rotation.y
  return screenOf(s, Math.cos(a) * t.r * 0.98, s.tierY[i] + t.h * 0.5, Math.sin(a) * t.r * 0.98)
}

/** Le gâteau de la Cuisine (`games/cuisine.ts`) : fais-le, décore-le,
    plante les bougies… et mange-le ! */
export const cakeDish: Pick<GameDef, 'hand' | 'mount'> = {
  // La main : selon l'étape, choisir dans la palette, toucher le gâteau, tracer la crème, planter une bougie
  hand: root => {
    const s = me
    if (s?.phase === 'eat') { const p = eatTarget(s); return p ? { tap: p } : null }
    if (!s || s.phase !== 'make') return null
    if (s.step === 'base') return { choose: visible(root, '.bk-opt').slice(0, 3) }
    if (s.step === 'glacage') return { tap: Math.random() < 0.5 ? sideOf(s, 0) : topOf(s, s.tiers.length - 1, 0) }
    if (s.step === 'creme') { const a = topOf(s, 0, 0.82); return { drag: [{ x: a.x - 90, y: a.y + 6 }, { x: a.x + 90, y: a.y + 6 }] } }
    if (s.step === 'decor') return { tap: topOf(s, s.tiers.length - 1, 0.3) }
    return { tap: topOf(s, s.tiers.length - 1, 0.35) }
  },
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="arena g3-arena bk-wrap" id="bkWrap" data-step="base">
        <div class="bk-steps">${STEPS.map(st => `<span class="tool-item"><button class="sn-tool bk-step${st === 'base' ? ' sel' : ''}" data-step="${st}" aria-label="${STEP_NAME[st]}">${STEP_ICON[st]}</button><i class="tool-cap">${STEP_NAME[st]}</i></span>`).join('')}<span class="tool-item"><button class="sn-tool bk-eat" id="bkEat" aria-label="Manger">${EAT_ICON}</button><i class="tool-cap">Manger</i></span></div>
        <div class="bk-pal" id="bkPal"></div>
      </div>`
    const arena = c.root.querySelector<HTMLElement>('#bkWrap')!
    preloadSfx(['cloth', 'pluck', 'click', 'error', 'confirm', 'chop', 'select'])

    const opt = (attrs: string, icon: string, cap: string, sel: boolean, big = false) =>
      `<span class="tool-item"><button class="sn-tool bk-opt${big ? ' big' : ''}${sel ? ' sel' : ''}" ${attrs} aria-label="${cap}">${icon}</button><i class="tool-cap">${cap}</i></span>`
    const img = (id: string, fallback: string) => thumbs[id] ? `<img src="${thumbs[id]}" alt="" draggable="false">` : fallback
    const showPal = () => {
      const s = me
      const pal = c.root.querySelector<HTMLElement>('#bkPal')!
      if (!s) { pal.innerHTML = ''; return }
      const st = s.step
      if (st === 'base') pal.innerHTML = [1, 2, 3].map(n => opt(`data-tiers="${n}"`, tiersIcon(n), n === 1 ? '1 étage' : `${n} étages`, s.nTiers === n)).join('') + '<i class="bk-sep"></i>' +
        (Object.keys(SHAPE_ICON) as CakeShape[]).map(k => opt(`data-shape="${k}"`, SHAPE_ICON[k], SHAPE_NAME[k], s.shape === k)).join('')
      else if (st === 'glacage') pal.innerHTML = GLAZES.map(([col, n]) => opt(`data-glaze="${col}"`, pot(col), n, s.glaze === col)).join('')
      else if (st === 'creme') pal.innerHTML = CREAMS.map(([col, n]) => opt(`data-cream="${col}"`, `<span class="bk-dot" style="background:${col}"></span>`, n, s.cream === col)).join('') + '<i class="bk-sep"></i>' +
        opt('data-nozzle="star"', img('rosace', '✿'), 'Étoile', !s.drop, true) + opt('data-nozzle="drop"', img('goutte', '●'), 'Goutte', s.drop, true)
      else if (st === 'decor') pal.innerHTML = DECOS.map(([d, n]) => opt(`data-deco="${d}"`, d === 'vermicelles' ? SPRINKLE_ICON : img(d, `<span class="bk-dot" style="background:#D2203A"></span>`), n, s.deco === d, true)).join('')
      else pal.innerHTML = CANDLES.map(([col, n]) => opt(`data-candle="${col}"`, img('bougie' + col, `<span class="bk-dot" style="background:${col}"></span>`), n, s.candle === col, true)).join('')
    }
    const setStep = (st: Step) => {
      const s = me
      if (!s || s.phase !== 'make') return
      s.step = st
      arena.setAttribute('data-step', st)
      c.root.querySelectorAll<HTMLElement>('.bk-step').forEach(b => b.classList.toggle('sel', b.dataset.step === st))
      showPal()
    }

    /** « Manger » : les bougies sortent, il se remet de face, la première part se coupe. */
    const askToEat = () => {
      const s = me
      if (!s || s.phase !== 'make') return
      sfx('confirm', { vol: 0.4 })
      prepEat(s)
    }

    const hideLoader = loader(arena, 'bakery')
    ;(async () => {
      const s = await build(c, arena)
      hideLoader()
      if (!s || dead) { if (s) { s.kit.dispose(); s.stage.dispose() } return }
      me = s
      showPal()
      s.stage.start(dt => { if (me === s) frame(s, dt) })
      // Les vignettes (un second contexte 3D, une douzaine de rendus) : pas pour les bots,
      // dont elles bloquent les premiers clics sous la 3D logicielle ; ils voient des pastilles
      if (!(window as unknown as { __BOT?: boolean }).__BOT) renderThumbs(96).then(() => { if (!dead) showPal() })
    })().catch(() => { hideLoader(); c.toast('La 3D n\'est pas disponible ici') })

    // Les boutons
    const onClick = (e: MouseEvent) => {
      const s = me
      if (!s) return
      const t = e.target as HTMLElement
      if (t.closest('#bkEat')) { askToEat(); return }
      const stepB = t.closest<HTMLElement>('.bk-step')
      if (stepB?.dataset.step) { setStep(stepB.dataset.step as Step); sfx('select', { vol: 0.5 }); return }
      const o = t.closest<HTMLElement>('.bk-opt')
      if (o && s.phase === 'make') {
        const d = o.dataset
        if (d.tiers) { s.nTiers = +d.tiers; buildBase(s); sfx('pluck', { vol: 0.6, rate: 0.8 }) }
        else if (d.shape) { s.shape = d.shape as CakeShape; buildBase(s); sfx('pluck', { vol: 0.6, rate: 0.9 }) }
        else if (d.glaze) s.glaze = d.glaze
        else if (d.cream) s.cream = d.cream
        else if (d.nozzle) s.drop = d.nozzle === 'drop'
        else if (d.deco) s.deco = d.deco as Deco
        else if (d.candle) s.candle = d.candle
        sfx('select', { vol: 0.4 })
        showPal()
        return
      }
    }
    c.root.addEventListener('click', onClick)

    // Le doigt sur la scène : poser, tracer ; ailleurs, faire tourner le plateau
    const pts = new Map<number, { x: number; y: number; moved: number; placing: boolean }>()
    let lastT = 0
    const onDown = (e: PointerEvent) => {
      const s = me
      if (!s || e.target !== s.stage.renderer.domElement) return
      // Pendant qu'on mange : un toucher prend une part
      if (s.phase === 'eat') { pts.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: 0, placing: true }); return }
      if (s.phase !== 'make') return
      const onCake = s.step !== 'base' && !!pick(s, e.clientX, e.clientY, true)
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: 0, placing: onCake })
      lastT = performance.now()
      s.vRot = 0
      if (onCake && (s.step === 'creme' || (s.step === 'decor' && s.deco === 'vermicelles'))) onPlace(s, e.clientX, e.clientY, true)
    }
    const onMove = (e: PointerEvent) => {
      const s = me
      const p = pts.get(e.pointerId)
      if (!s || !p) return
      const dx = e.clientX - p.x
      p.moved += Math.abs(dx) + Math.abs(e.clientY - p.y)
      p.x = e.clientX; p.y = e.clientY
      if (p.placing && (s.step === 'creme' || (s.step === 'decor' && s.deco === 'vermicelles'))) { onPlace(s, e.clientX, e.clientY, true); return }
      if (p.placing) return
      if (pts.size > 1) return
      const now = performance.now(), dts = Math.max(8, now - lastT) / 1000
      lastT = now
      const k = 1 / Math.max(120, s.stage.renderer.domElement.clientWidth * 0.4)
      s.rot += dx * k
      s.vRot = Math.max(-3, Math.min(3, s.vRot * 0.5 + dx * k / dts * 0.5))
    }
    const onUp = (e: PointerEvent) => {
      const s = me
      const p = pts.get(e.pointerId)
      pts.delete(e.pointerId)
      if (!s || !p) return
      if (s.phase === 'eat') { if (e.type !== 'pointercancel' && p.moved < 14) eatTap(s, e.clientX, e.clientY); return }
      if (performance.now() - lastT > 90) s.vRot = 0
      if (e.type !== 'pointercancel' && p.moved < 12 && s.step !== 'creme') onPlace(s, e.clientX, e.clientY, false)
    }
    c.root.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __bk: unknown }).__bk = {
        get ready() { return !!me },
        get step() { return me?.step },
        get phase() { return me?.phase },
        get tiers() { return me?.tiers.length ?? 0 },
        get shape() { return me?.shape },
        body(i: number) { return me ? '#' + me.tiers[i].bodyMat.color.getHexString() : null },
        glazed(i: number) { return !!me?.tiers[i].glaze.visible },
        count(kind: string) { return me?.items.filter(it => it.kind === kind).length ?? 0 },
        get sprinkles() { return me?.sprN ?? 0 },
        /** Ce qui est posé : sorte et place (repère du gâteau). */
        items() { return me?.items.map(it => [it.kind, ...it.obj.position.toArray().map(v => +v.toFixed(2))]) ?? [] },
        get candles() { return me ? candlesOf(me).length + me.leaving.length : 0 },
        /** La répétition du repas : 0 quand ses rendus sont prêts (null : pas commencée). */
        get warmLeft() { const w = me?.warm; return w ? (w.ready ? 0 : 1) : null },
        /** Le temps du jeu accéléré (la 3D logicielle des bots fait une image par seconde) : la fête et le repas sont longs. */
        speed(k: number) { if (me) me.stage.timeScale = k },
        /** Pendant qu'on mange : coups de couteau, parts mangées, bouchées, où toucher (null : attendre). */
        get eat() { const e = me?.eat; return e ? { cuts: e.cuts, eaten: e.eaten, bites: e.bites, at: me && eatTarget(me) } : null },
        /** Le temps de la part qu'on mange (depuis le toucher), pour les captures. */
        get eatT() { return me?.eat?.parts.find(p => p.state === 'eat')?.t ?? null },
        /** Les fils de crème encore tendus. */
        get strands() { return me?.eat?.parts.reduce((n, p) => n + p.strands.length, 0) ?? 0 },
        top(i?: number, d?: number) { return me ? topOf(me, i ?? me.tiers.length - 1, d) : null },
        side(i = 0) { return me ? sideOf(me, i) : null },
        /** L'affiche : un gâteau tout fait, ses bougies allumées. */
        demo(shape: CakeShape = 'round', n = 2) {
          const s = me
          if (!s) return
          s.nTiers = n; s.shape = shape; buildBase(s)
          const T = s.T
          const BODY = ['#F28BA6', '#FFE2A8', '#C3A6F5'], GLAZE = ['#FFFFFF', '#D8336A', '#FFFFFF']
          s.tiers.forEach((t, i) => { t.bodyMat.color.set(BODY[i]); t.pour(GLAZE[i], new T.Vector3()) })
          const at = (x: number, z: number) => dropOnto(s, x, z) ?? new T.Vector3(x, 1, z)
          const R0 = s.tiers[0].r * 0.82
          for (let i = 0; i < 13; i++) { const a = i / 13 * Math.PI * 2; addItem(s, 'rosace', s.kit.rosette('#FFF7EC'), at(Math.cos(a) * R0, Math.sin(a) * R0)) }
          for (let i = 0; i < 13; i++) {
            const a = (i + 0.5) / 13 * Math.PI * 2
            const o = [s.kit.raspberry(), s.kit.blueberry(), s.kit.strawberry()][i % 3]
            addItem(s, 'fruit', o, at(Math.cos(a) * R0, Math.sin(a) * R0))
          }
          CANDLES.forEach(([col], i) => {
            const a = i / 5 * Math.PI * 2 + 0.3
            const g = s.kit.candle(col)
            const rc = s.tiers[s.tiers.length - 1].r * 0.55
            addItem(s, 'bougie', g, at(Math.cos(a) * rc, Math.sin(a) * rc), { candle: { flame: g.userData.flame, lit: 1 } })
          })
          addItem(s, 'fraise', s.kit.strawberry(), at(0, 0))
          s.items.forEach(it => { it.obj.userData.grow = 1; it.obj.scale.setScalar(1) })
          s.step = 'bougies'
          ctx.root.querySelector('.bk-wrap')?.setAttribute('data-step', 'bougies')
        }
      }
    }

    return () => {
      if (dead) return
      dead = true
      c.root.removeEventListener('click', onClick)
      c.root.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      const s = me
      me = null
      if (s) {
        s.kit.dispose()
        try { s.stage.dispose() } catch { /* déjà démonté */ }
      }
      hideLoader()
    }
  }
}

