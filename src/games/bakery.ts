import type { GameDef, GameContext } from '../core/types'
import { createStage, loader, woodTex, type Stage, type T3 } from '../core/three3d'
import { particles, type Particles } from '../core/scene3d'
import { cakeKit, radiusAt, type CakeKit, type CakeShape, type Tier } from '../core/cake3d'
import { withRenderer } from '../core/portraits'
import { sfx, preloadSfx } from '../core/sfx'
import { getCtx, sCrunch, tone } from '../core/audio'
import { playNote } from '../core/music'
import { onPause } from '../core/session'
import { openMic, type Mic } from '../core/mic'
import { visible } from '../core/hand'

/* 🎂 LA PÂTISSERIE (5/10, Créer) — un gâteau sur son présentoir, dans une
   petite pâtisserie (mur à rayures, fanions, bocaux, comptoir en marbre).
   Cinq étapes à gauche, chacune son icône et son nom :
   - Gâteau  : un, deux ou trois étages ; rond, en cœur ou carré
   - Glaçage : une couleur, puis toucher le flanc (la couleur s'étale depuis
               le doigt) ou le dessus (le nappage se verse et coule)
   - Crème   : la poche à douille — le doigt dépose des rosaces (ou des gouttes)
   - Décor   : fraises, framboises, myrtilles, cerises, perles ; les
               vermicelles tombent où passe le doigt
   - Bougies : on les plante (elles s'allument), puis on SOUFFLE pour de vrai
               (le micro, ouvert à cette étape seulement) ou on touche « Souffle ! »
   Puis « Joyeux anniversaire » au carillon, des confettis, et on le MANGE
   (6/10, demandé par Joyce : « comme la pizza ») : la première part se
   coupe toute seule et glisse sur sa petite assiette ; un toucher = une
   bouchée à la fourchette (la pointe d'abord, la coupe se voit), deux par
   part ; puis un toucher sur le gâteau : il tourne, le couteau coupe la
   part suivante. Six parts, et il n'en reste rien. Pas de note sur une création. */

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
/** La petite assiette, sur le comptoir. */
const PLATE = { x: 1.55, z: 1.35 }

interface Item { kind: string; obj: import('three').Object3D; candle?: { flame: import('three').Group; lit: number } }

type V3 = import('three').Vector3
type Plane = import('three').Plane
type Mat = import('three').Material
/** Une part coupée, sur sa petite assiette. */
interface Slice {
  g: import('three').Group
  a0: number; a1: number; mid: number
  /** Ses deux bords et la bouchée (repère de la part), et leurs copies dans le monde (celles des matières). */
  local: Plane[]; world: Plane[]
  bites: number
  items: Item[]
  tiers: { t: Tier; y: number }[]
  mats: Mat[]
  /** La coupe d'une bouchée (pas coupée elle-même : elle est pile sur le plan). */
  cap: Mat
  top: Mat
  from: { p: V3; r: number }; to: { p: V3; r: number }
  t: number
}
/** Le gâteau qu'on mange : ce qui en reste (deux plans de coupe), la part servie, le couteau, la fourchette. */
interface Eat {
  parts: number
  base: number
  local: Plane[]; world: Plane[]
  mats: Mat[]
  faces: import('three').Mesh[]
  knife: import('three').Group
  fork: import('three').Group
  slice: Slice | null
  /** Le recul de la caméra, 0 → 1. */
  camK: number
  anim: null
    | { kind: 'turn'; t: number; from: number; to: number }
    | { kind: 'knife'; t: number; lines: number[]; hit: number }
    | { kind: 'fork'; t: number; at: V3; from: V3; morsel: import('three').Mesh | null }
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
  phase: 'make' | 'blow' | 'party' | 'eat' | 'done'
  phaseT: number
  mic: Mic | null
  blow: number
  /** « Souffle ! » touché : une rafale qui dure jusqu'à la dernière flamme. */
  gust: boolean
  blowHeld: number
  blowNext: number
  fx: Particles
  ray: import('three').Raycaster
  t: number
  eat: Eat | null
  stand: import('three').Object3D[]
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
    updateBlowBtn(s)
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

/* ---------- Souffler ---------- */

const litCandles = (s: State) => s.items.filter(it => it.candle && it.candle.lit > 0)

function updateBlowBtn(s: State) {
  ctx.root.querySelector('#bkBlow')?.classList.toggle('off', !litCandles(s).length)
}

async function startMic(s: State) {
  if (s.mic || !ctx.alive()) return
  try {
    const mic = await openMic(x => {
      let sum = 0
      for (let i = 0; i < x.length; i++) sum += x[i] * x[i]
      const rms = Math.sqrt(sum / x.length)
      // Un souffle : un bruit fort et continu (le micro tout près de la bouche)
      s.blow = Math.max(s.blow * 0.6, Math.min(1, (rms - 0.04) / 0.12))
    }, { raw: !!(window as unknown as { __BOT?: boolean }).__BOT })
    if (me !== s || s.step !== 'bougies' || s.phase !== 'make') { mic.stop(); return }
    s.mic = mic
  } catch { /* sans micro, le bouton « Souffle ! » suffit */ }
}
function stopMic(s: State) { s.mic?.stop(); s.mic = null; s.blow = 0 }

/** Une bougie s'éteint : sa flamme se couche, un filet de fumée. */
function blowOut(s: State, it: Item) {
  if (!it.candle) return
  it.candle.lit = -1
  const w = it.candle.flame.getWorldPosition(new s.T.Vector3())
  s.fx.burst(w, { count: 8, color: ['#CFC6BE', '#E8E2DC'], speed: 0.25, spread: 0.2, life: 1.4, size: 0.06, gravity: -0.4 })
  tone(220 + Math.random() * 60, 0.12, 'sine', 0.05)
}

/* ---------- La fête et la part ---------- */

function party(s: State) {
  s.phase = 'party'; s.phaseT = 0
  stopMic(s)
  ctx.root.querySelector('.bk-wrap')?.setAttribute('data-phase', 'party')
  const ac = getCtx()
  const t0 = (ac?.currentTime ?? 0) + 0.3
  // « Joyeux anniversaire » : la mélodie au carillon, les accords en dessous (3/4, 0,42 s le temps)
  const B = 0.42
  const tune: [number, number][] = [
    [67, 0.75], [67, 0.25], [69, 1], [67, 1], [72, 1], [71, 2],
    [67, 0.75], [67, 0.25], [69, 1], [67, 1], [74, 1], [72, 2],
    [67, 0.75], [67, 0.25], [79, 1], [76, 1], [72, 1], [71, 1], [69, 2],
    [77, 0.75], [77, 0.25], [76, 1], [72, 1], [74, 1], [72, 3]
  ]
  let at = 0
  for (const [n, d] of tune) { playNote('bell', n, t0 + at * B, Math.max(0.3, d * B), 0.16); at += d }
  const chords: [number[], number][] = [[[48, 52, 55], 3], [[43, 47, 50], 3], [[43, 47, 50], 3], [[48, 52, 55], 3], [[48, 52, 55], 3], [[41, 45, 48], 3], [[48, 52, 55], 3], [[43, 47, 50], 3], [[48, 52, 55], 3]]
  let ct = 0
  for (const [c, d] of chords) { playNote('pad', c, t0 + ct * B, d * B, 0.05); ct += d }
  s.phaseT = -at * B
  for (let i = 0; i < 6; i++) ctx.after(i * 900, () => confetti(s))
}

function confetti(s: State) {
  if (me !== s) return
  const top = s.tierY[s.tierY.length - 1] + 0.8
  s.fx.burst(new s.T.Vector3((Math.random() - 0.5) * 1.6, top, (Math.random() - 0.5) * 0.6), {
    count: 60, color: ['#FF6B81', '#FFC94D', '#5EC97B', '#4FB8E7', '#B197FC'], speed: 2.4, spread: 2.2, life: 2.4, size: 0.07, gravity: 1.6
  })
  sfx('confirm', { vol: 0.25, rate: 1.2 })
}

/* ---------- On mange le gâteau, part par part ----------
   Ce qui reste du gâteau est COUPÉ par deux plans (`localClippingEnabled`) :
   la part enlevée grandit d'un sixième à chaque fois, toujours d'un seul
   tenant — moins d'un demi-tour, on garde l'union des deux demi-espaces ;
   plus, leur intersection. Les faces de coupe (génoise, crème, confiture)
   sont posées pile sur les plans, sans être coupées. La part, elle, est une
   COPIE des étages (nappage, bourrelet, coulures compris) gardée entre ses
   deux bords, et une bouchée est un troisième plan qui avance depuis la
   pointe. Ce qui part avec la part reçoit ses matières à elle. */

const isMesh = (o: import('three').Object3D): o is import('three').Mesh => (o as import('three').Mesh).isMesh
const matsOf = (m: import('three').Mesh) => Array.isArray(m.material) ? m.material : [m.material]
/** L'angle (repère du gâteau) est-il dans la part [a0, a0 + DP] ? */
const inPart = (a: number, a0: number) => ((a - a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) < DP

function startEat(s: State) {
  const T = s.T
  s.phase = 'eat'
  // Ce qui est posé sur l'assiette du présentoir ne se coupe pas : ses matières à lui
  for (const it of s.items) {
    if (it.obj.position.y >= PLATE_Y + 0.01) continue
    it.obj.traverse(o => { if (isMesh(o)) o.material = Array.isArray(o.material) ? o.material.map(x => x.clone()) : o.material.clone() })
  }
  // Les vermicelles tombés sur l'assiette : à part, eux aussi
  {
    const m4 = new T.Matrix4(), c = new T.Color(), keep: number[] = []
    for (let i = 0; i < s.sprN; i++) { s.spr.getMatrixAt(i, m4); if (m4.elements[13] < PLATE_Y + 0.01) keep.push(i) }
    if (keep.length) {
      const im = new T.InstancedMesh(s.spr.geometry, (s.spr.material as Mat).clone(), keep.length)
      keep.forEach((i, j) => { s.spr.getMatrixAt(i, m4); im.setMatrixAt(j, m4); s.spr.getColorAt(i, c); im.setColorAt(j, c) })
      im.frustumCulled = false
      s.cake.add(im)
    }
  }
  // Toutes les matières du gâteau (étages, crème, fruits, bougies, vermicelles) suivent les deux plans
  const local = [new T.Plane(), new T.Plane()], world = [new T.Plane(), new T.Plane()]
  const mats = new Set<Mat>()
  for (const t of s.tiers) t.g.traverse(o => { if (isMesh(o)) matsOf(o).forEach(m => mats.add(m)) })
  for (const it of s.items) if (it.obj.position.y >= PLATE_Y + 0.01) it.obj.traverse(o => { if (isMesh(o)) matsOf(o).forEach(m => mats.add(m)) })
  matsOf(s.spr).forEach(m => mats.add(m))
  for (const m of mats) { m.clippingPlanes = world; m.clipIntersection = true }
  s.stage.renderer.localClippingEnabled = true
  // Le couteau (sa lame part du centre, le manche dehors) et la fourchette
  const knife = new T.Group()
  const k = s.kit.knife()
  k.rotation.y = Math.PI; k.position.x = 1.08
  knife.add(k)
  knife.visible = false
  s.cake.add(knife)
  const fork = s.kit.fork()
  fork.visible = false
  s.stage.scene.add(fork)
  // La petite assiette
  const plate = new T.Mesh(new T.CylinderGeometry(0.62, 0.55, 0.05, 48), new T.MeshPhysicalMaterial({ color: '#F6F2EC', roughness: 0.22, clearcoat: 0.7 }))
  plate.position.set(PLATE.x, 0.025, PLATE.z)
  plate.receiveShadow = true; plate.castShadow = true
  s.stage.scene.add(plate)
  s.stage.keep(plate.geometry); s.stage.keep(plate.material as Mat)
  s.eat = { parts: 0, base: s.rot, local, world, mats: [...mats], faces: [], knife, fork, slice: null, camK: 0, anim: null }
  setCakePlanes(s)
  cutNext(s)
}

/** Les deux plans de ce qui reste, et ses faces de coupe. */
function setCakePlanes(s: State) {
  const e = s.eat!, T = s.T
  const A1 = A0 + e.parts * DP
  e.local[0].set(new T.Vector3(Math.sin(A0), 0, -Math.cos(A0)), 0)
  e.local[1].set(new T.Vector3(-Math.sin(A1), 0, Math.cos(A1)), 0)
  const union = e.parts * DP <= Math.PI + 1e-6
  for (const m of e.mats) if (m.clipIntersection !== union) { m.clipIntersection = union; m.needsUpdate = true }
  for (const f of e.faces) s.cake.remove(f)
  e.faces = []
  if (e.parts >= PARTS) {
    // Plus rien : les étages et ce qui était dessus disparaissent
    for (const t of s.tiers) t.g.visible = false
    for (const it of s.items) if (it.obj.position.y >= PLATE_Y + 0.01) it.obj.visible = false
    s.spr.visible = false
    return
  }
  if (e.parts === 0) return
  s.tiers.forEach((t, i) => {
    for (const f of s.kit.cutFaces(t, A0, A1)) { f.position.y = s.tierY[i]; s.cake.add(f); e.faces.push(f) }
  })
}

/** La part suivante : le gâteau tourne pour la présenter, le couteau coupe, elle glisse sur l'assiette. */
function cutNext(s: State) {
  const e = s.eat
  if (!e || e.anim || e.slice || e.parts >= PARTS) return
  e.anim = { kind: 'turn', t: 0, from: s.rot, to: e.base + e.parts * DP }
}

function serve(s: State) {
  const e = s.eat!
  const a0 = A0 + e.parts * DP
  e.parts++
  setCakePlanes(s)
  e.slice = makeSlice(s, a0, a0 + DP)
  sfx('cloth', { vol: 0.45, rate: 0.8 })
}

function makeSlice(s: State, a0: number, a1: number): Slice {
  const T = s.T
  const mid = (a0 + a1) / 2
  const g = new T.Group()
  g.rotation.y = s.cake.rotation.y
  s.stage.scene.add(g)
  const local = [
    new T.Plane(new T.Vector3(-Math.sin(a0), 0, Math.cos(a0)), 0), // garde ce qui est après a0
    new T.Plane(new T.Vector3(Math.sin(a1), 0, -Math.cos(a1)), 0), // garde ce qui est avant a1
    new T.Plane(new T.Vector3(Math.cos(mid), 0, Math.sin(mid)), 1) // la bouchée (au début : rien)
  ]
  const world = local.map(p => p.clone())
  const mats: Mat[] = []
  const own = (m: Mat, planes: Plane[] | null) => { const c = m.clone(); c.clippingPlanes = planes; c.clipIntersection = false; mats.push(c); return c }
  let sponge: Mat | null = null
  const tiers: Slice['tiers'] = []
  s.tiers.forEach((t, i) => {
    const c = t.g.clone(true)
    c.visible = true
    c.position.y = s.tierY[i]
    c.traverse(o => { if (isMesh(o)) o.material = Array.isArray(o.material) ? o.material.map(m => own(m, world)) : own(o.material, world) })
    g.add(c)
    // Ses deux coupes (la génoise en couches), rognées par la bouchée
    for (const f of s.kit.cutFaces(t, a0, a1)) { sponge ??= own(f.material as Mat, [world[2]]); f.material = sponge; f.position.y = s.tierY[i]; g.add(f) }
    tiers.push({ t, y: s.tierY[i] })
  })
  const cap = own(sponge!, null)
  // Ce qui est posé sur la part part avec elle
  const items: Item[] = []
  for (const it of s.items.slice()) {
    const p = it.obj.position
    if (p.y < PLATE_Y + 0.01 || !inPart(Math.atan2(p.z, p.x), a0)) continue
    s.cake.remove(it.obj)
    it.obj.traverse(o => { if (isMesh(o)) o.material = Array.isArray(o.material) ? o.material.map(m => own(m, null)) : own(o.material, null) })
    g.add(it.obj)
    items.push(it)
    s.items = s.items.filter(x => x !== it)
  }
  // Et ses vermicelles
  {
    const m4 = new T.Matrix4(), c = new T.Color(), v = new T.Vector3(), keep: number[] = []
    for (let i = 0; i < s.sprN; i++) {
      s.spr.getMatrixAt(i, m4); v.setFromMatrixPosition(m4)
      if (v.y >= PLATE_Y + 0.01 && inPart(Math.atan2(v.z, v.x), a0)) keep.push(i)
    }
    if (keep.length) {
      const im = new T.InstancedMesh(s.spr.geometry, own(s.spr.material as Mat, [world[2]]), keep.length)
      keep.forEach((i, j) => { s.spr.getMatrixAt(i, m4); im.setMatrixAt(j, m4); s.spr.getColorAt(i, c); im.setColorAt(j, c) })
      im.frustumCulled = false
      g.add(im)
    }
  }
  // Le dessus de la part, pour la bouchée sur la fourchette
  const tt = s.tiers[s.tiers.length - 1]
  const top = own(tt.glaze.visible ? tt.glazeMat : tt.bodyMat, null)
  // Sur l'assiette, de trois quarts : la pointe à gauche, le glaçage du bord à droite —
  // les bouchées avancent de la pointe vers le bord sous nos yeux
  const L = radiusAt(s.tiers[0].outline, mid)
  const want = -0.3
  let rot = mid - want
  rot += Math.PI * 2 * Math.round((g.rotation.y - rot) / (Math.PI * 2))
  const cx = Math.cos(mid) * L * 0.45, cz = Math.sin(mid) * L * 0.45
  const wx = cx * Math.cos(rot) + cz * Math.sin(rot), wz = -cx * Math.sin(rot) + cz * Math.cos(rot)
  return {
    g, a0, a1, mid, local, world, bites: 0, items, tiers, mats, cap, top,
    from: { p: g.position.clone(), r: g.rotation.y },
    to: { p: new T.Vector3(PLATE.x - wx, 0.05 - PLATE_Y, PLATE.z - wz), r: rot },
    t: 0
  }
}

/** Le dessus de la part à la distance d de la pointe (repère de la part). */
function sliceTop(sl: Slice, d: number) {
  let y = sl.tiers[0].y + sl.tiers[0].t.h
  for (const { t, y: ty } of sl.tiers) if (radiusAt(t.outline, sl.mid) > d + 0.04) y = ty + t.h
  return y
}
/** Là où la fourchette pique : le milieu de ce qui reste à manger. */
function biteAt(s: State, sl: Slice) {
  const L = radiusAt(sl.tiers[0].t.outline, sl.mid)
  const d = sl.bites === 0 ? L * 0.25 : L * 0.72
  return sl.g.localToWorld(new s.T.Vector3(Math.cos(sl.mid) * d, sliceTop(sl, d) + 0.01, Math.sin(sl.mid) * d))
}

/** Un toucher pendant qu'on mange : une bouchée de la part servie, ou la part suivante. */
function eatTap(s: State) {
  const e = s.eat
  if (s.phase !== 'eat' || !e || e.anim) return
  if (e.slice) {
    if (e.slice.t < 1) return
    const at = biteAt(s, e.slice)
    e.fork.visible = true
    e.anim = { kind: 'fork', t: 0, at, from: at.clone().add(new s.T.Vector3(0.9, 1.1, 0.7)), morsel: null }
    sfx('select', { vol: 0.3, rate: 1.4 })
  } else cutNext(s)
}

/** La fourchette pique : la pointe de la part disparaît (une coupe à la place), ou le reste. */
function applyBite(s: State, at: V3) {
  const e = s.eat!, sl = e.slice!
  sl.bites++
  const L = radiusAt(sl.tiers[0].t.outline, sl.mid)
  const col = '#' + ((sl.top as import('three').MeshStandardMaterial).color?.getHexString() ?? 'E9B872')
  s.fx.burst(at, { count: 16, color: ['#E9B872', col, '#FFF4E0'], speed: 0.7, spread: 1, life: 0.8, size: 0.04, gravity: 1.6 })
  sCrunch()
  if (sl.bites === 1) {
    const d = L * 0.5
    sl.local[2].constant = -d
    for (const { t, y } of sl.tiers) {
      const f = s.kit.biteFace(t, sl.a0, sl.a1, d)
      if (f) { f.material = sl.cap; f.position.y = y; sl.g.add(f) }
    }
    const ux = Math.cos(sl.mid), uz = Math.sin(sl.mid)
    for (const it of sl.items) if (it.obj.position.x * ux + it.obj.position.z * uz < d + 0.02) it.obj.visible = false
    return
  }
  // La dernière bouchée : il ne reste rien de la part
  s.stage.scene.remove(sl.g)
  sl.mats.forEach(m => { if (m !== sl.top) m.dispose() })
  e.slice = null
}

/** Pendant qu'on mange, la caméra recule et glisse à droite : le gâteau ET la petite assiette. */
const CAM0 = { p: [0, 2.05, 5.4], t: [0, 0.95, 0] }, CAM_EAT = { p: [0.5, 2.15, 6.7], t: [0.5, 0.72, 0.3] }

function stepEat(s: State, dt: number) {
  const e = s.eat
  if (!e) return
  const T = s.T
  const ease = (k: number) => k * k * (3 - 2 * k)
  e.camK = Math.min(1, e.camK + dt / 1.6)
  {
    const k = ease(e.camK), L = (a: number[], b: number[], i: number) => a[i] + (b[i] - a[i]) * k
    s.stage.camera.position.set(L(CAM0.p, CAM_EAT.p, 0), L(CAM0.p, CAM_EAT.p, 1), L(CAM0.p, CAM_EAT.p, 2))
    s.stage.camera.lookAt(L(CAM0.t, CAM_EAT.t, 0), L(CAM0.t, CAM_EAT.t, 1), L(CAM0.t, CAM_EAT.t, 2))
  }
  const a = e.anim
  if (a?.kind === 'turn') {
    a.t = Math.min(1, a.t + dt / 0.7)
    s.rot = a.from + (a.to - a.from) * ease(a.t)
    if (a.t >= 1) {
      s.rot = a.to
      const k = e.parts
      const lines = k === 0 ? [A0, A0 + DP] : k < PARTS - 1 ? [A0 + (k + 1) * DP] : []
      e.anim = lines.length ? { kind: 'knife', t: 0, lines, hit: 0 } : null
      if (!lines.length) serve(s)
    }
  } else if (a?.kind === 'knife') {
    // Le couteau descend jusqu'au présentoir le long de chaque coupe, puis remonte
    const per = 0.8
    a.t += dt
    const i = Math.min(a.lines.length - 1, Math.floor(a.t / per)), p = (a.t - i * per) / per
    const top = s.tierY[s.tierY.length - 1] + s.tiers[s.tiers.length - 1].h
    const hi = top + 0.45, lo = PLATE_Y + 0.004
    const y = p < 0.45 ? hi + (lo - hi) * ease(p / 0.45) : p < 0.6 ? lo : lo + (hi - lo) * ease((p - 0.6) / 0.4)
    e.knife.visible = true
    e.knife.rotation.y = -a.lines[i]
    e.knife.position.y = y
    if (p >= 0.42 && a.hit <= i) { a.hit = i + 1; sfx('chop', { vol: 0.6 }) }
    if (a.t >= a.lines.length * per) { e.knife.visible = false; e.anim = null; serve(s) }
  } else if (a?.kind === 'fork') {
    // La fourchette arrive, pique, et repart vers nous avec la bouchée
    a.t += dt
    const f = e.fork
    const above = a.at.clone().add(new T.Vector3(0.06, 0.4, 0.05)), into = a.at.clone().add(new T.Vector3(0.02, 0.1, 0.02))
    const cam = s.stage.camera
    const mouth = cam.position.clone().add(cam.getWorldDirection(new T.Vector3()).multiplyScalar(1.1)).add(new T.Vector3(0.15, -0.3, 0))
    if (a.t < 0.4) f.position.lerpVectors(a.from, above, ease(a.t / 0.4))
    else if (a.t < 0.55) f.position.lerpVectors(above, into, ease((a.t - 0.4) / 0.15))
    else {
      if (!a.morsel) {
        applyBite(s, a.at)
        a.morsel = s.kit.morsel(e.slice?.top ?? s.tiers[0].bodyMat)
        a.morsel.position.y = -0.14
        f.add(a.morsel)
      }
      const k = Math.min(1, (a.t - 0.55) / 0.75)
      f.position.lerpVectors(into, mouth, k * k)
    }
    f.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), new T.Vector3(-0.42, -1, -0.3).normalize())
    f.scale.setScalar(a.t > 1.1 ? Math.max(0.001, 1 - (a.t - 1.1) / 0.2) : 1)
    if (a.t >= 1.3) {
      if (a.morsel) f.remove(a.morsel)
      f.visible = false
      tone(520, 0.09, 'triangle', 0.08); tone(780, 0.14, 'triangle', 0.08, 0.11)
      e.anim = null
      if (!e.slice && e.parts >= PARTS) {
        s.phase = 'done'
        ctx.after(900, () => { if (me === s) ctx.finish({ title: 'Gâteau dévoré !', msg: 'Il n’en reste pas une miette', stars: 3 }) })
      }
    }
  }
  // La part glisse sur son assiette (en arc), en tournant
  const sl = e.slice
  if (sl && sl.t < 1) {
    sl.t = Math.min(1, sl.t + dt / 1.4)
    const k = ease(sl.t)
    sl.g.position.lerpVectors(sl.from.p, sl.to.p, k)
    sl.g.position.y += Math.sin(k * Math.PI) * 0.45
    sl.g.rotation.y = sl.from.r + (sl.to.r - sl.from.r) * k
    if (sl.t >= 1) sfx('confirm', { vol: 0.4 })
  }
  // Les plans suivent le gâteau et la part
  s.cake.rotation.y = s.rot
  s.cake.updateMatrixWorld()
  e.local.forEach((p, i) => e.world[i].copy(p).applyMatrix4(s.cake.matrixWorld))
  if (sl) { sl.g.updateMatrixWorld(); sl.local.forEach((p, i) => sl.world[i].copy(p).applyMatrix4(sl.g.matrixWorld)) }
}

/** Où toucher pendant qu'on mange (la main, les bots) : la part servie, sinon le gâteau. */
function eatTarget(s: State) {
  const e = s.eat
  if (!e || e.anim || s.phase !== 'eat') return null
  const r = s.stage.renderer.domElement.getBoundingClientRect()
  const scr = (w: V3) => { const v = w.project(s.stage.camera); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height } }
  if (e.slice) return e.slice.t >= 1 ? scr(biteAt(s, e.slice)) : null
  const t = s.tiers.length - 1
  return scr(s.cake.localToWorld(new s.T.Vector3(0, s.tierY[t] + s.tiers[t].h * 0.6, 0)))
}
/* ---------- Chaque image ---------- */

function frame(s: State, dt: number) {
  s.t += dt
  s.phaseT += dt
  // Le plateau tourne au doigt (avec son élan) ; pendant la fête, tout seul
  if (s.phase === 'party') s.rot += dt * 0.35
  else if (s.phase === 'make' || s.phase === 'blow') { s.rot += s.vRot * dt; s.vRot *= Math.pow(0.01, dt) }
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
    const f = c.flame
    if (c.lit > 0) {
      // La flamme danse ; quand on souffle, elle se couche
      const b = s.blow
      f.scale.set(c.lit * (1 + Math.sin(s.t * 17 + o.id) * 0.06), c.lit * (1 + Math.sin(s.t * 13 + o.id) * 0.1 - b * 0.4), c.lit)
      f.rotation.z = Math.sin(s.t * 7 + o.id) * 0.08 + b * 0.7
    } else if (c.lit < 0) { c.lit = Math.max(-2, c.lit - dt * 6); f.scale.setScalar(Math.max(0.001, (c.lit + 2) / 1 * 0.2)) }
  }
  // Le souffle : tenu un quart de seconde, il éteint les bougies une à une
  if (s.gust) { s.blow = 1; if (!litCandles(s).length) s.gust = false }
  if (s.phase === 'make' && s.step === 'bougies' && litCandles(s).length) {
    if (s.blow > 0.45) s.blowHeld += dt; else s.blowHeld = Math.max(0, s.blowHeld - dt * 2)
    if (s.blowHeld > 0.25 && s.t > s.blowNext) {
      const lit = litCandles(s)
      blowOut(s, lit[Math.floor(Math.random() * lit.length)])
      s.blowNext = s.t + 0.14
      if (!litCandles(s).length) { updateBlowBtn(s); ctx.after(700, () => { if (me === s) party(s) }) }
    }
  }
  s.blow *= Math.pow(0.2, dt)
  // Après la chanson, le gâteau se remet de face ; la première part se coupe toute seule
  if (s.phase === 'party' && s.phaseT > 1.2) {
    const want = Math.round(s.rot / (Math.PI * 2)) * Math.PI * 2
    s.rot += (want - s.rot) * Math.min(1, dt * 3)
    if (Math.abs(want - s.rot) < 0.01) { s.rot = want; s.cake.rotation.y = want; startEat(s) }
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
    rot: 0.35, vRot: 0, phase: 'make', phaseT: 0, mic: null, blow: 0, gust: false, blowHeld: 0, blowNext: 0,
    fx: particles(stage, 500), ray: new T.Raycaster(), t: 0, eat: null, stand: standMeshes
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
const BLOW = svg('<circle cx="16" cy="24" r="11" fill="#FFD3B5"/><circle cx="12.5" cy="21" r="1.6" fill="#45362A"/><ellipse cx="22" cy="27" rx="3.2" ry="2.6" fill="#E2557E"/><path d="M29 22c4 0 6-2 9-1M29 27c5 0 7 1 11 0M29 32c4 0 6 2 9 1" fill="none" stroke="#7FC8E8" stroke-width="2.8" stroke-linecap="round"/>', 48)
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

export const bakery: GameDef = {
  id: 'bakery', name: 'La Pâtisserie', icon: '🎂', sq: 'sq-pink', cat: 'creatif', noTier: true,
  subtitle: 'Fais un gâteau, décore-le, souffle les bougies… et mange-le !',
  // La main : selon l'étape, choisir dans la palette, toucher le gâteau, tracer la crème, souffler
  hand: root => {
    const s = me
    if (s?.phase === 'eat') { const p = eatTarget(s); return p ? { tap: p } : null }
    if (!s || s.phase !== 'make') return null
    if (s.step === 'base') return { choose: visible(root, '.bk-opt').slice(0, 3) }
    if (s.step === 'glacage') return { tap: Math.random() < 0.5 ? sideOf(s, 0) : topOf(s, s.tiers.length - 1, 0) }
    if (s.step === 'creme') { const a = topOf(s, 0, 0.82); return { drag: [{ x: a.x - 90, y: a.y + 6 }, { x: a.x + 90, y: a.y + 6 }] } }
    if (s.step === 'decor') return { tap: topOf(s, s.tiers.length - 1, 0.3) }
    if (litCandles(s).length) { const b = root.querySelector('#bkBlow'); return b ? { tap: b } : null }
    return { tap: topOf(s, s.tiers.length - 1, 0.35) }
  },
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="arena g3-arena bk-wrap" id="bkWrap" data-step="base">
        <div class="bk-steps">${STEPS.map(st => `<span class="tool-item"><button class="sn-tool bk-step${st === 'base' ? ' sel' : ''}" data-step="${st}" aria-label="${STEP_NAME[st]}">${STEP_ICON[st]}</button><i class="tool-cap">${STEP_NAME[st]}</i></span>`).join('')}</div>
        <div class="bk-pal" id="bkPal"></div>
        <span class="tool-item bk-blowitem"><button class="sn-tool bk-blow off" id="bkBlow" aria-label="Souffle">${BLOW}</button><i class="tool-cap">Souffle !</i></span>
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
      // Le micro ne s'ouvre qu'aux bougies
      if (st === 'bougies') startMic(s); else stopMic(s)
      updateBlowBtn(s)
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
      if (t.closest('#bkBlow') && s.phase === 'make' && litCandles(s).length) {
        // Toucher « Souffle ! » : une rafale, jusqu'à la dernière flamme
        s.gust = true; s.blowHeld = 0.3
        sfx('whoosh', { vol: 0.5 })
      }
    }
    c.root.addEventListener('click', onClick)

    // Le doigt sur la scène : poser, tracer ; ailleurs, faire tourner le plateau
    const pts = new Map<number, { x: number; y: number; moved: number; placing: boolean }>()
    let lastT = 0
    const onDown = (e: PointerEvent) => {
      const s = me
      if (!s || e.target !== s.stage.renderer.domElement) return
      // Pendant qu'on mange : un toucher = une bouchée (ou la part suivante)
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
      if (s.phase === 'eat') { if (e.type !== 'pointercancel' && p.moved < 14) eatTap(s); return }
      if (performance.now() - lastT > 90) s.vRot = 0
      if (e.type !== 'pointercancel' && p.moved < 12 && s.step !== 'creme') onPlace(s, e.clientX, e.clientY, false)
    }
    c.root.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    // Pause (onglet caché, minuteur parental) : le micro se coupe ; il revient aux bougies
    const offPause = onPause(p => {
      const s = me
      if (!s) return
      if (p) stopMic(s)
      else if (s.step === 'bougies' && s.phase === 'make') startMic(s)
    })

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
        get lit() { return me ? litCandles(me).length : 0 },
        /** Le temps du jeu accéléré (la 3D logicielle des bots fait une image par seconde) : la fête et le repas sont longs. */
        speed(k: number) { if (me) me.stage.timeScale = k },
        /** Pendant qu'on mange : parts coupées, bouchées de la part servie, où toucher (null : attendre). */
        get eat() { const e = me?.eat; return e ? { parts: e.parts, bites: e.slice?.bites ?? null, at: me && eatTarget(me) } : null },
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
      offPause()
      c.root.removeEventListener('click', onClick)
      c.root.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      const s = me
      me = null
      if (s) {
        stopMic(s)
        s.kit.dispose()
        try { s.stage.dispose() } catch { /* déjà démonté */ }
      }
      hideLoader()
    }
  }
}

