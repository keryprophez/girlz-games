import type { GameDef, GameContext } from '../core/types'
import { createStage, loader, woodTex, type Stage, type T3 } from '../core/three3d'
import { particles, type Particles } from '../core/scene3d'
import { cakeKit, type CakeKit, type CakeShape, type Tier } from '../core/cake3d'
import { withRenderer } from '../core/portraits'
import { sfx, preloadSfx } from '../core/sfx'
import { getCtx, tone } from '../core/audio'
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
   Puis « Joyeux anniversaire » au carillon, des confettis, et on coupe une
   part, qui sort sur sa petite assiette. Pas de note sur une création. */

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
/** La part : entre ces deux angles (autour de +z, vers nous). */
const CUT = [Math.PI / 2 - 0.38, Math.PI / 2 + 0.38] as const

interface Item { kind: string; obj: import('three').Object3D; candle?: { flame: import('three').Group; lit: number } }

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
  phase: 'make' | 'blow' | 'party' | 'cut' | 'done'
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
  slice: import('three').Group | null
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
  s.cake.updateMatrixWorld(true)
  // Ce qui était posé retombe sur le nouveau gâteau, là où il était
  for (const it of s.items) {
    const p = it.obj.position
    const hit = dropOnto(s, p.x, p.z)
    if (hit) p.y = hit.y
    else { s.cake.remove(it.obj); it.obj.userData.gone = true }
  }
  s.items = s.items.filter(it => !it.obj.userData.gone)
  if (s.sprN) { s.sprN = 0; s.spr.count = 0 }
}

/** Les surfaces où l'on pose (les étages, leur nappage, l'assiette du présentoir). */
function surfaces(s: State, withItems = false): import('three').Object3D[] {
  const out: import('three').Object3D[] = [...s.stand]
  for (const t of s.tiers) { out.push(t.body); if (t.glaze.visible) t.glaze.traverse(o => { if ((o as import('three').Mesh).isMesh) out.push(o) }) }
  if (withItems) for (const it of s.items) if (it.kind === 'rosace' || it.kind === 'goutte') out.push(it.obj)
  return out
}

/** Le point du dessus sous (x, z) du gâteau (repère du gâteau), en tombant d'en haut. */
function dropOnto(s: State, x: number, z: number) {
  const o = s.cake.localToWorld(new s.T.Vector3(x, 5, z))
  s.ray.set(o, new s.T.Vector3(0, -1, 0))
  const h = s.ray.intersectObjects(surfaces(s), false)[0]
  return h ? s.cake.worldToLocal(h.point.clone()) : null
}

/** Le point de la surface sous le doigt : un dessus (normale vers le haut), ou n'importe quoi. */
function pick(s: State, cx: number, cy: number, top: boolean, withItems = false) {
  const r = s.stage.renderer.domElement.getBoundingClientRect()
  s.ray.setFromCamera(new s.T.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), s.stage.camera)
  for (const h of s.ray.intersectObjects(surfaces(s, withItems), false)) {
    if (!h.face) continue
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld)
    if (top && n.y < 0.55) continue
    return { point: h.point, local: s.cake.worldToLocal(h.point.clone()), obj: h.object as import('three').Mesh, n }
  }
  return null
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
    const h = pick(s, cx, cy, false)
    if (!h) return
    const t = s.tiers.find(x => x.body === h.obj || x.glaze.children.includes(h.obj) || x.glaze.getObjectById(h.obj.id))
    if (!t) return
    if (h.obj.userData.paint === 'body' && h.n.y < 0.55) { t.bodyMat.userData.paint(s.glaze, h.point); sfx('cloth', { vol: 0.5 }) }
    else { t.pour(s.glaze, h.point); sfx('pluck', { vol: 0.5, rate: 0.7 }) }
    return
  }
  if (s.step === 'creme') {
    const h = pick(s, cx, cy, true)
    if (!h) return
    const p = h.local
    if (s.items.some(it => (it.kind === 'rosace' || it.kind === 'goutte') && Math.hypot(it.obj.position.x - p.x, it.obj.position.z - p.z) < (drag ? 0.15 : 0.11))) return
    if (addItem(s, s.drop ? 'goutte' : 'rosace', s.kit.rosette(s.cream, s.drop), p)) sfx('cloth', { vol: 0.35, rate: 1.4 })
    return
  }
  if (s.step === 'decor') {
    if (s.deco === 'vermicelles') { sprinkle(s, cx, cy); return }
    if (drag) return
    const h = pick(s, cx, cy, true, true)
    if (!h) return
    const o = s.deco === 'fraise' ? s.kit.strawberry() : s.deco === 'framboise' ? s.kit.raspberry() : s.deco === 'myrtille' ? s.kit.blueberry()
      : s.deco === 'cerise' ? s.kit.cherry() : s.kit.pearls(1, 0, '#FFFFFF')
    if (addItem(s, s.deco, o, h.local)) sfx('pluck', { vol: 0.5, rate: 1.1 + Math.random() * 0.3 })
    return
  }
  if (s.step === 'bougies') {
    if (drag) return
    const h = pick(s, cx, cy, true, true)
    if (!h) return
    if (s.items.filter(it => it.candle).length >= MAX_CANDLES) { sfx('error', { vol: 0.4 }); return }
    const g = s.kit.candle(s.candle)
    const flame = g.userData.flame as import('three').Group
    flame.scale.setScalar(0.001)
    const it = addItem(s, 'bougie', g, h.local, { candle: { flame, lit: 0.001 } })
    if (it) { sfx('click', { vol: 0.5 }); tone(1500, 0.05, 'triangle', 0.06, 0.18) }
    updateBlowBtn(s)
  }
}

/** Les vermicelles tombent autour du doigt. */
function sprinkle(s: State, cx: number, cy: number) {
  const h = pick(s, cx, cy, true)
  if (!h) return
  const m4 = new s.T.Matrix4(), q = new s.T.Quaternion(), e = new s.T.Euler(), col = new s.T.Color()
  const COLS = ['#FF6B81', '#FFC94D', '#5EC97B', '#4FB8E7', '#B197FC', '#FFFFFF', '#FF9F43']
  for (let i = 0; i < 6 && s.sprN < MAX_SPRINKLES; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * 0.13
    const x = h.local.x + Math.cos(a) * d, z = h.local.z + Math.sin(a) * d
    e.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.3)
    q.setFromEuler(e)
    m4.compose(new s.T.Vector3(x, h.local.y + 0.006, z), q, new s.T.Vector3(1, 1, 1))
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

/** On coupe : la part (et ce qui est posé dessus) sort sur sa petite assiette. */
function cut(s: State) {
  s.phase = 'cut'; s.phaseT = 0
  const T = s.T
  s.cake.rotation.y = 0
  s.cake.updateMatrixWorld(true)
  const [a0, a1] = CUT
  // Le gâteau perd sa part : deux plans qui se croisent au centre
  const p1 = new T.Plane(new T.Vector3(Math.sin(a0), 0, -Math.cos(a0)), 0)
  const p2 = new T.Plane(new T.Vector3(-Math.sin(a1), 0, Math.cos(a1)), 0)
  s.stage.renderer.localClippingEnabled = true
  const inWedge = (x: number, z: number) => { const a = Math.atan2(z, x); return a > a0 && a < a1 }
  const slice = new T.Group()
  const faces: import('three').Mesh[] = []
  for (const [i, t] of s.tiers.entries()) {
    const sl = s.kit.slice(t, a0, a1)
    sl.material = (sl.material as import('three').Material[]).map(m => m.clone())
    sl.position.y = s.tierY[i]
    slice.add(sl)
    for (const f of s.kit.cutFaces(t, a0, a1)) { f.position.y = s.tierY[i]; faces.push(f) }
  }
  // Ce qui est posé sur la part part avec elle (ses matières à elle : pas coupées)
  for (const it of s.items.slice()) {
    const p = it.obj.position
    if (!inWedge(p.x, p.z) || p.y < PLATE_Y + 0.01) continue
    s.cake.remove(it.obj)
    it.obj.traverse(o => {
      const m = o as import('three').Mesh
      if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map(x => x.clone()) : m.material.clone()
    })
    slice.add(it.obj)
    s.items = s.items.filter(x => x !== it)
  }
  // Tout le gâteau perd sa part — sauf le présentoir (pas de trou dans l'assiette)
  s.cake.traverse(o => {
    const m = o as import('three').Mesh
    if (!m.isMesh || s.stand.includes(m)) return
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) { mat.clippingPlanes = [p1, p2]; mat.clipIntersection = true }
  })
  // Les faces de coupe, posées APRÈS : elles sont pile sur les plans
  for (const f of faces) s.cake.add(f)
  // La petite assiette, sur le comptoir
  const plate = new T.Mesh(new T.CylinderGeometry(0.62, 0.55, 0.05, 48), new T.MeshPhysicalMaterial({ color: '#F6F2EC', roughness: 0.22, clearcoat: 0.7 }))
  plate.position.set(1.55, 0.025, 1.35)
  plate.receiveShadow = true; plate.castShadow = true
  s.stage.scene.add(plate)
  s.stage.keep(plate.geometry); s.stage.keep(plate.material as import('three').Material)
  slice.userData.from = new T.Vector3(0, 0, 0)
  slice.userData.to = new T.Vector3(1.5, 0.05 - PLATE_Y, 1.35 - 0.62)
  s.stage.scene.add(slice)
  s.slice = slice
  sfx('chop', { vol: 0.6 })
}

/* ---------- Chaque image ---------- */

function frame(s: State, dt: number) {
  s.t += dt
  s.phaseT += dt
  // Le plateau tourne au doigt (avec son élan) ; pendant la fête, tout seul
  if (s.phase === 'party') s.rot += dt * 0.35
  else if (s.phase === 'make' || s.phase === 'blow') { s.rot += s.vRot * dt; s.vRot *= Math.pow(0.01, dt) }
  if (s.phase !== 'cut' && s.phase !== 'done') s.cake.rotation.y = s.rot
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
  // Après la chanson, on coupe ; la part glisse sur son assiette ; puis la fin
  if (s.phase === 'party' && s.phaseT > 1.2) {
    // Le gâteau se remet de face avant la coupe
    const want = Math.round(s.rot / (Math.PI * 2)) * Math.PI * 2
    s.rot += (want - s.rot) * Math.min(1, dt * 3)
    s.cake.rotation.y = s.rot
    if (Math.abs(want - s.rot) < 0.01) cut(s)
  }
  if (s.phase === 'cut' && s.slice) {
    const k = Math.min(1, s.phaseT / 1.6), e = k * k * (3 - 2 * k)
    const from = s.slice.userData.from as import('three').Vector3, to = s.slice.userData.to as import('three').Vector3
    s.slice.position.lerpVectors(from, to, e)
    s.slice.position.y += Math.sin(e * Math.PI) * 0.45
    if (k >= 1) {
      s.phase = 'done'
      sfx('confirm', { vol: 0.5 })
      ctx.after(1600, () => { if (me === s) ctx.finish({ title: 'Joyeux anniversaire !', msg: 'Quel beau gâteau, et une part pour toi', stars: 3 }) })
    }
  }
  s.fx.update(dt)
}

/* ---------- La scène ---------- */

async function build(c: GameContext, arena: HTMLElement): Promise<State | null> {
  const stage = await createStage(arena, {
    sky: '#F6E3D6', fov: 30, cam: [0, 2.05, 5.4], target: [0, 0.95, 0],
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
  const counter = new T.Mesh(new T.BoxGeometry(8, 0.12, 3.2), new T.MeshStandardMaterial({ map: marble, roughness: 0.22 }))
  counter.position.set(0, -0.06, -0.3)
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
  cake.add(spr)
  const s: State = {
    stage, T, kit, cake, tiers: [], tierY: [], nTiers: 2, shape: 'round', items: [], spr, sprN: 0,
    step: 'base', glaze: GLAZES[1][0], cream: CREAMS[0][0], drop: false, deco: 'fraise', candle: CANDLES[0][0],
    rot: 0.35, vRot: 0, phase: 'make', phaseT: 0, mic: null, blow: 0, gust: false, blowHeld: 0, blowNext: 0,
    fx: particles(stage, 500), ray: new T.Raycaster(), t: 0, slice: null, stand: standMeshes
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
  subtitle: 'Fais un gâteau, décore-le, et souffle les bougies',
  // La main : selon l'étape, choisir dans la palette, toucher le gâteau, tracer la crème, souffler
  hand: root => {
    const s = me
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
      if (!s || e.target !== s.stage.renderer.domElement || s.phase !== 'make') return
      const onCake = s.step !== 'base' && !!pick(s, e.clientX, e.clientY, s.step !== 'glacage', true)
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
        get lit() { return me ? litCandles(me).length : 0 },
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

