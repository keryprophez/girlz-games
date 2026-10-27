import type { GameDef, GameContext } from '../core/types'
import { createStage, loader, type Stage, type T3 } from '../core/three3d'
import { particles, toScreen, type Particles } from '../core/scene3d'
import { buildStudio, potView, WHEEL_Y, type PotView, type Studio } from '../core/pottery3d'
import { copyClay, freshPot, hollow, isBlank, packPot, preset, profilePath, raise, readPot, rAt, shape, MAX_OPS, MAX_PTS, type Band, type PotData, type Preset } from '../core/pottery'
import { sfx, preloadSfx } from '../core/sfx'
import { tone } from '../core/audio'
import { visible, handNow, type HandMove } from '../core/hand'

/* 🏺 LA POTERIE (27/10, choisie par le père avec le Château de sable et
   l'Aquarium) — l'atelier du potier : le tour en alu dans son bac émaillé,
   le seau et l'éponge, la fenêtre sur le jardin, l'étagère au mur, le four
   à briques. Quatre étapes à gauche, chacune son icône et son nom :
   - Modeler : le tour tourne. Un doigt qui MONTE étire la terre vers le
     haut (elle s'affine), qui descend la tasse ; sur le CÔTÉ, il l'évase ou
     la resserre autour de lui ; au CENTRE, en haut, il la creuse. Les formes
     de départ en un toucher (la motte, le bol, le vase, le pot) pour Jade.
   - Peindre : huit couleurs. Un doigt TENU pendant que le tour tourne trace
     une bande parfaite ; un toucher pose un point qui devient un anneau de
     points. L'éponge efface la peinture.
   - L'étagère : les huit pièces gardées ; en toucher une la remet sur le
     tour (celle du tour prend sa place : on ne jette jamais une création).
   - Le four : la pièce y glisse, la porte se ferme, ça rougeoie (la braise,
     le hublot, l'aiguille du cadran) ; la terre crue, grise et mate, ressort
     cuite et émaillée, brillante, les couleurs vives.
   « Fini » : pas encore cuite, elle passe d'abord au four ; puis elle rejoint
   l'étagère. Jusqu'à huit pièces gardées (la plus ancienne laisse sa place à
   la neuvième) : leur profil et leur peinture, pas d'image (`pottery.ts`).
   La pièce est UNE géométrie de révolution dont seules les positions
   changent (`pottery3d.ts`). Créer : aucune note. */

type Step = 'modeler' | 'peindre' | 'etagere'
const STEPS: Step[] = ['modeler', 'peindre', 'etagere']
const STEP_NAME: Record<Step, string> = { modeler: 'Modeler', peindre: 'Peindre', etagere: 'Étagère' }
const COLORS: [string, string][] = [
  ['#2F6FD0', 'Bleu'], ['#E8414F', 'Rouge'], ['#FFC93C', 'Jaune'], ['#45A85A', 'Vert'],
  ['#F27BAA', 'Rose'], ['#8E5BD6', 'Violet'], ['#FFFFFF', 'Blanc'], ['#3A2E25', 'Noir']
]
const PRESETS: [Preset, string][] = [['motte', 'Motte'], ['bol', 'Bol'], ['vase', 'Vase'], ['pot', 'Pot']]
const SHELF = 8
/** La taille d'une pièce sur l'étagère. */
const SHELF_K = 0.4
/** La vitesse du tour (radians par seconde) : assez lent pour qu'on voie la terre tourner. */
const SPIN = 3.2

/* ---------- La sauvegarde : une seule pour la famille, pour l'instant ----------
   Isolée ici (`load` / `save`) : l'orchestrateur la branchera sur les cartes
   Jade / Joyce de `core/mine.ts`. Des données légères : profils et traits. */
const KEY = 'ferme:poterie'
interface Saved { cur: PotData; slot: number | null; shelf: (PotData | null)[] }
export function load(): Saved {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null') as { v?: number; cur?: unknown; slot?: unknown; shelf?: unknown[] } | null
    if (o && o.v === 1) {
      const shelf = Array.from({ length: SHELF }, (_, i) => readPot(o.shelf?.[i]))
      const slot = typeof o.slot === 'number' && o.slot >= 0 && o.slot < SHELF && !shelf[o.slot] ? o.slot : null
      return { cur: readPot(o.cur) ?? freshPot(), slot, shelf }
    }
  } catch { /* une étagère neuve */ }
  return { cur: freshPot(), slot: null, shelf: Array(SHELF).fill(null) }
}
export function save(s: Saved) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, cur: packPot(s.cur), slot: s.slot, shelf: s.shelf.map(p => p ? packPot(p) : null) })) } catch { /* plein : tant pis */ }
}

interface Flight { view: PotView; from: import('three').Vector3; to: import('three').Vector3; k0: number; k1: number; t: number; dur: number; done: () => void }

interface State {
  stage: Stage
  T: T3
  studio: Studio
  saved: Saved
  pot: PotView
  /** Les pièces de l'étagère (leur vue), place par place. */
  shelf: (PotView | null)[]
  step: Step
  color: string
  spin: number
  spinV: number
  phase: 'make' | 'fire' | 'outro' | 'done'
  /** Au four : le temps, et ce qui suit (retour au tour, ou l'étagère). */
  fire: { t: number; then: 'back' | 'shelf'; glazed: boolean } | null
  outro: { t: number; slot: number } | null
  flights: Flight[]
  fx: Particles
  ray: import('three').Raycaster
  cam: { p: import('three').Vector3; t: import('three').Vector3 }
  door: number
  heat: number
  t: number
  /** La pièce bouge (un geste, une forme) : on la garde un peu plus tard. */
  dirty: number
  /** Les bandes tenues au doigt, peintes à chaque image (posé par `mount`). */
  paintTick: (() => void) | null
}

let me: State | null = null
let ctx: GameContext

const potOf = (s: State) => s.saved.cur

/* ---------- La caméra ---------- */

function camWant(s: State): { p: [number, number, number]; t: [number, number, number] } {
  if (s.phase === 'fire') return { p: [0.55, 1.25, 1.6], t: [1.35, 0.55, -0.45] }
  // Le départ vers l'étagère : on suit la pièce jusqu'à sa place
  if (s.outro) { const q = s.studio.slots[s.outro.slot]; return { p: [q.x + 0.3, q.y + 0.4, q.z + 1.75], t: [q.x, q.y + 0.12, q.z] } }
  if (s.phase === 'outro' || s.phase === 'done' || s.step === 'etagere') return { p: [-1.4, 1.65, 1.0], t: [-1.55, 1.36, -1.3] }
  // Elle suit la taille de la pièce : une motte de près, un grand vase recule
  const c = potOf(s).clay
  const h = Math.max(0.32, c.h, Math.max(...c.r) * 1.5)
  const ty = WHEEL_Y + h * 0.45
  const d = 1.25 + h * 1.5
  return { p: [0, ty + d * 0.4, d], t: [0, ty - 0.04, 0] }
}

/* ---------- Le doigt sur la pièce ---------- */

/** Le point du doigt dans le plan vertical de l'axe du tour, face à nous : (écart, hauteur sur le plateau). */
function onAxisPlane(s: State, cx: number, cy: number) {
  const T = s.T, cam = s.stage.camera
  const r = s.stage.renderer.domElement.getBoundingClientRect()
  s.ray.setFromCamera(new T.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), cam)
  const f = new T.Vector3(); cam.getWorldDirection(f); f.y = 0; f.normalize()
  const plane = new T.Plane().setFromNormalAndCoplanarPoint(f, new T.Vector3(0, WHEEL_Y, 0))
  const p = s.ray.ray.intersectPlane(plane, new T.Vector3())
  if (!p) return null
  const right = new T.Vector3(f.z, 0, -f.x).multiplyScalar(-1)
  return { x: p.clone().setY(0).dot(right), y: p.y - WHEEL_Y }
}
/** Un point de la pièce (écart, hauteur) à l'écran. */
function potScreen(s: State, x: number, y: number) {
  const T = s.T, f = new T.Vector3(); s.stage.camera.getWorldDirection(f); f.y = 0; f.normalize()
  const right = new T.Vector3(f.z, 0, -f.x).multiplyScalar(-1)
  return toScreen(s.stage, right.multiplyScalar(x).add(new T.Vector3(0, WHEEL_Y + y, 0)))
}
/** Le point de la peinture (tour, hauteur) sous le doigt, ou null. */
function paintAt(s: State, cx: number, cy: number) {
  const T = s.T, r = s.stage.renderer.domElement.getBoundingClientRect()
  s.ray.setFromCamera(new T.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), s.stage.camera)
  const h = s.ray.intersectObject(s.pot.mesh, false)[0]
  if (!h?.uv || h.uv.y > 0.955) return null
  return { u: h.uv.x, v: h.uv.y, p: h.point }
}

let lastClaySound = 0
function claySound() {
  const now = performance.now()
  if (now - lastClaySound < 140) return
  lastClaySound = now
  sfx('cloth', { vol: 0.22, rate: 0.55 + Math.random() * 0.2 })
}

function reshape(s: State) {
  const d = potOf(s)
  s.pot.setClay(d.clay)
  if (d.glazed) unglaze(s)
  s.dirty = 0.4
}
/** Retouchée après le four : elle redevient crue (il faudra la recuire). */
function unglaze(s: State) {
  const d = potOf(s)
  d.glazed = false
  s.pot.setGlazed(false)
  s.pot.repaint(d)
}

/** Une forme de départ, d'un toucher. */
function usePreset(s: State, p: Preset) {
  const d = potOf(s)
  d.clay = preset(p)
  s.pot.setClay(d.clay)
  if (d.glazed) unglaze(s)
  s.pot.mesh.scale.set(1.25, 0.6, 1.25)
  sfx('drop', { vol: 0.5, rate: 0.8 })
  claySound()
  s.dirty = 0.1
}

/* ---------- Le four ---------- */

const ease = (k: number) => k * k * (3 - 2 * k)
const arc = (a: import('three').Vector3, b: import('three').Vector3, k: number, hgt: number, out: import('three').Vector3) =>
  out.lerpVectors(a, b, ease(k)).setY(a.y + (b.y - a.y) * ease(k) + Math.sin(k * Math.PI) * hgt)

function startFire(s: State, then: 'back' | 'shelf') {
  if (s.phase !== 'make' || s.flights.length) return
  s.phase = 'fire'
  s.fire = { t: 0, then, glazed: false }
  ctx.root.querySelector('.pt-wrap')?.setAttribute('data-phase', 'fire')
  // La pièce quitte le plateau : elle vole dans le repère de la scène
  const w = s.pot.mesh.getWorldPosition(new s.T.Vector3())
  s.studio.head.remove(s.pot.mesh)
  s.stage.scene.add(s.pot.mesh)
  s.pot.mesh.position.copy(w)
  sfx('whoosh', { vol: 0.5, rate: 0.9 })
}

function stepFire(s: State, dt: number) {
  const f = s.fire!, T = s.T
  f.t += dt
  const t = f.t, m = s.pot.mesh, K = s.studio.kiln
  const c = potOf(s).clay
  const fit = Math.min(1, 0.4 / Math.max(c.h, Math.max(...c.r) * 2))
  const head = new T.Vector3(0, WHEEL_Y, 0)
  const front = K.g.localToWorld(new T.Vector3(0, 0.2, 0.75))
  const tmp = new T.Vector3()
  if (t < 1.6) s.door = Math.min(s.door, 1 - ease(Math.min(1, t / 0.6)))
  if (t < 1.1) {
    arc(head, front, t / 1.1, 0.5, m.position)
    m.scale.setScalar(1 + (fit - 1) * ease(t / 1.1))
    m.rotation.y += dt * 2
  } else if (t < 1.6) {
    m.position.lerpVectors(front, K.spot, ease((t - 1.1) / 0.5))
    m.scale.setScalar(fit)
  } else if (t < 2.1) {
    const was = s.door
    s.door = ease((t - 1.6) / 0.5)
    if (was < 0.95 && s.door >= 0.95) { sfx('metal', { vol: 0.8, rate: 0.7 }); tone(110, 0.25, 'triangle', 0.08) }
  } else if (t < 4.8) {
    // Ça rougeoie : la braise monte, l'aiguille du cadran file au rouge, la cheminée fume
    s.heat = Math.min(1, s.heat + dt / 1.2)
    if (Math.random() < dt * 9) {
      const top = K.g.localToWorld(new T.Vector3(0.22, 2.1, -0.15))
      s.fx.burst(top, { count: 2, color: ['#D8D2CC', '#BDB6AF'], speed: 0.35, spread: 0.3, life: 1.4, size: 0.16, gravity: -0.4 })
    }
    if (Math.random() < dt * 5) s.fx.burst(K.g.localToWorld(new T.Vector3(0.05, 0.5, 0.5)), { count: 1, color: ['#FFB347', '#FF7A30'], speed: 0.4, spread: 0.6, life: 0.6, size: 0.04, gravity: -0.8 })
    if (Math.floor((t - dt) * 2.2) !== Math.floor(t * 2.2)) tone(70 + Math.random() * 20, 0.5, 'sine', 0.05)
    if (t >= 4.4 && !f.glazed) {
      // Cuite : la terre crue devient biscuit, l'émail fond et brille
      f.glazed = true
      const d = potOf(s)
      d.glazed = true
      s.pot.setGlazed(true)
      s.pot.repaint(d)
    }
  } else if (t < 5.4) {
    s.heat = Math.max(0.15, s.heat - dt * 1.4)
    const was = s.door
    s.door = 1 - ease((t - 4.8) / 0.6)
    if (was > 0.9 && s.door <= 0.9) {
      sfx('creak', { vol: 0.5 })
      s.fx.burst(front, { count: 30, color: ['#FFFFFF', '#FFF3D6', '#FFE0B0'], speed: 0.6, spread: 1, life: 1, size: 0.12, gravity: -0.6 })
    }
  } else if (f.then === 'shelf') {
    s.heat = Math.max(0, s.heat - dt)
    toShelf(s)
  } else if (t < 6.6) {
    s.heat = Math.max(0, s.heat - dt)
    const k = (t - 5.4) / 1.2
    if (k < 0.35) m.position.lerpVectors(K.spot, front, ease(k / 0.35))
    else arc(front, head, (k - 0.35) / 0.65, 0.5, m.position)
    m.scale.setScalar(fit + (1 - fit) * ease(Math.max(0, (k - 0.35) / 0.65)))
  } else {
    // De retour sur le tour, toute brillante
    s.stage.scene.remove(m)
    s.studio.head.add(m)
    m.position.set(0, 0, 0); m.scale.setScalar(1); m.rotation.set(0, 0, 0)
    s.phase = 'make'
    s.fire = null
    ctx.root.querySelector('.pt-wrap')?.setAttribute('data-phase', 'make')
    sfx('confirm', { vol: 0.5 })
    tone(988, 0.12, 'triangle', 0.07); tone(1319, 0.2, 'triangle', 0.06, 0.1)
    s.fx.burst(tmp.set(0, WHEEL_Y + potOf(s).clay.h * 0.6, 0), { count: 26, color: ['#FFFFFF', '#FFF3B0', '#CDEBFF'], speed: 1, spread: 1, life: 0.8, size: 0.05, gravity: 0.2 })
    s.dirty = 0.1
  }
}

/* ---------- L'étagère ---------- */

/** La place où va la pièce du tour : la sienne, sinon la première libre, sinon (pleine) la plus ancienne s'en va. */
function placeFor(s: State) {
  const sv = s.saved
  if (sv.slot !== null && !sv.shelf[sv.slot]) return sv.slot
  const free = sv.shelf.findIndex(p => !p)
  if (free >= 0) return free
  // Pleine : toutes glissent d'une place, la première laisse la sienne
  s.shelf[0]?.mesh.removeFromParent(); s.shelf[0]?.dispose()
  sv.shelf.shift(); sv.shelf.push(null)
  s.shelf.shift(); s.shelf.push(null)
  s.shelf.forEach((v, i) => v?.mesh.position.copy(s.studio.slots[i]))
  return SHELF - 1
}

function toShelf(s: State) {
  if (s.phase === 'outro') return
  const slot = placeFor(s)
  s.phase = 'outro'
  s.fire = null
  s.outro = { t: 0, slot }
  ctx.root.querySelector('.pt-wrap')?.setAttribute('data-phase', 'outro')
  const m = s.pot.mesh
  if (m.parent === s.studio.head) {
    const w = m.getWorldPosition(new s.T.Vector3())
    s.studio.head.remove(m); s.stage.scene.add(m); m.position.copy(w)
  }
  const view = s.pot
  const d = potOf(s)
  s.flights.push({
    view, from: m.position.clone(), to: s.studio.slots[slot].clone(), k0: m.scale.x, k1: SHELF_K, t: 0, dur: 1.3,
    done: () => {
      s.shelf[slot] = view
      s.saved.shelf[slot] = d
      s.saved.cur = freshPot()
      s.saved.slot = null
      save(s.saved)
      sfx('drop', { vol: 0.6, rate: 1.1 })
      tone(784, 0.12, 'triangle', 0.07); tone(1175, 0.2, 'triangle', 0.06, 0.1)
      s.fx.burst(s.studio.slots[slot].clone().setY(s.studio.slots[slot].y + 0.2), { count: 30, color: ['#FFD34D', '#FFFFFF', '#FF8FB5'], speed: 1.1, spread: 1, life: 0.9, size: 0.05, gravity: 0.4 })
    }
  })
  sfx('whoosh', { vol: 0.5, rate: 1.1 })
}

/** Reprendre une pièce de l'étagère : elle revient sur le tour, celle du tour prend sa place. */
function takeBack(s: State, i: number) {
  const view = s.shelf[i], data = s.saved.shelf[i]
  if (!view || !data || s.phase !== 'make' || s.flights.length) return
  const T = s.T, cur = s.pot, curData = potOf(s)
  const keep = !isBlank(curData)
  const slot = s.studio.slots[i].clone()
  s.shelf[i] = null; s.saved.shelf[i] = null
  // Celle du tour part sur l'étagère (rien ne se jette), ou s'efface si ce n'était qu'une motte
  const w = cur.mesh.getWorldPosition(new T.Vector3())
  s.studio.head.remove(cur.mesh)
  if (keep) {
    s.stage.scene.add(cur.mesh); cur.mesh.position.copy(w)
    s.flights.push({ view: cur, from: w, to: slot, k0: 1, k1: SHELF_K, t: 0, dur: 0.9, done: () => { s.shelf[i] = cur; s.saved.shelf[i] = curData; save(s.saved) } })
  } else cur.dispose()
  s.flights.push({
    view, from: slot, to: new T.Vector3(0, WHEEL_Y, 0), k0: SHELF_K, k1: 1, t: 0, dur: 1.0,
    done: () => {
      view.mesh.removeFromParent()
      s.studio.head.add(view.mesh)
      view.mesh.position.set(0, 0, 0); view.mesh.scale.setScalar(1)
      sfx('drop', { vol: 0.6, rate: 0.85 })
    }
  })
  s.pot = view
  s.saved.cur = data
  s.saved.slot = keep ? null : i
  save(s.saved)
  sfx('whoosh', { vol: 0.5 })
}

function stepFlights(s: State, dt: number) {
  for (const f of s.flights.slice()) {
    f.t = Math.min(1, f.t + dt / f.dur)
    const m = f.view.mesh
    arc(f.from, f.to, f.t, 0.35, m.position)
    m.scale.setScalar(f.k0 + (f.k1 - f.k0) * ease(f.t))
    if (f.t >= 1) { s.flights.splice(s.flights.indexOf(f), 1); f.done() }
  }
}

/* ---------- Chaque image ---------- */

function frame(s: State, dt: number) {
  s.t += dt
  const T = s.T
  const want = camWant(s)
  const k = Math.min(1, dt * 2.6)
  s.cam.p.lerp(new T.Vector3(...want.p), k); s.cam.t.lerp(new T.Vector3(...want.t), k)
  s.stage.camera.position.copy(s.cam.p); s.stage.camera.lookAt(s.cam.t)
  // Le tour : il tourne pendant qu'on modèle et qu'on peint, ralentit ailleurs
  const spinWant = s.phase === 'make' && s.step !== 'etagere' ? SPIN : s.phase === 'make' ? 0.6 : 0
  s.spinV += (spinWant - s.spinV) * Math.min(1, dt * 2)
  s.spin += s.spinV * dt
  s.studio.head.rotation.y = s.spin
  // La forme qui vient de tomber sur le plateau rebondit
  const ps = s.pot.mesh.scale
  if (s.phase === 'make' && !s.flights.length && s.pot.mesh.parent === s.studio.head) {
    ps.x += (1 - ps.x) * Math.min(1, dt * 9); ps.z = ps.x; ps.y += (1 - ps.y) * Math.min(1, dt * 7)
  }
  if (s.fire) stepFire(s, dt)
  if (s.outro) {
    s.outro.t += dt
    if (s.outro.t > 2.6 && s.phase === 'outro') endGame(s)
  }
  stepFlights(s, dt)
  // Hors cuisson, la porte du four reste fermée
  if (!s.fire || s.fire.t > 6.3) s.door += (1 - s.door) * Math.min(1, dt * 2.5)
  s.studio.step(dt, s.door, s.heat, s.t)
  // Les pièces de l'étagère tournent doucement sur elles-mêmes quand on les regarde
  for (const v of s.shelf) if (v && s.step === 'etagere') v.mesh.rotation.y += dt * 0.5
  s.paintTick?.()
  s.pot.flush(s.stage.renderer)
  s.fx.update(dt)
  if (s.dirty > 0) { s.dirty -= dt; if (s.dirty <= 0) save(s.saved) }
}

function endGame(s: State) {
  if (s.phase === 'done') return
  s.phase = 'done'
  ctx.finish({ title: 'Quel joli pot !', msg: 'Il est sur l’étagère', stars: 3 })
}

/* ---------- La scène ---------- */

async function build(c: GameContext, arena: HTMLElement): Promise<State | null> {
  const stage = await createStage(arena, {
    sky: '#EFE2CF', fov: 34, cam: [0, 1.25, 1.6], target: [0, 0.8, 0],
    hemi: ['#FFF4E4', '#B98A5E', 0.95], sun: { pos: [-1.6, 4.6, 3.2], color: '#FFF0D8', intensity: 2.5, area: 2.6, far: 14 },
    fill: 0.6, exposure: 1.02
  })
  if (!c.alive()) { stage.dispose(); return null }
  const T = stage.T
  const studio = buildStudio(T, stage)
  const saved = load()
  const pot = potView(T, saved.cur, 1024, studio.rings)
  studio.head.add(pot.mesh)
  const shelf = saved.shelf.map((d, i) => {
    if (!d) return null
    const v = potView(T, d, 512, studio.rings)
    v.mesh.position.copy(studio.slots[i]); v.mesh.scale.setScalar(SHELF_K); v.mesh.rotation.y = i * 0.7
    stage.scene.add(v.mesh)
    return v
  })
  const s: State = {
    stage, T, studio, saved, pot, shelf, step: 'modeler', color: COLORS[0][0], spin: 0, spinV: SPIN,
    phase: 'make', fire: null, outro: null, flights: [], fx: particles(stage, 400), ray: new T.Raycaster(),
    cam: { p: new T.Vector3(0, 1.25, 1.6), t: new T.Vector3(0, 0.8, 0) }, door: 1, heat: 0, t: 0, dirty: 0, paintTick: null
  }
  const w = camWant(s)
  s.cam.p.set(...w.p); s.cam.t.set(...w.t)
  return s
}

/* ---------- Les icônes ---------- */

const svg = (inner: string, sz = 34) => `<svg viewBox="0 0 48 48" width="${sz}" height="${sz}">${inner}</svg>`
const STEP_ICON: Record<Step, string> = {
  modeler: svg('<ellipse cx="24" cy="40" rx="18" ry="4.5" fill="#9EA3A9"/><path d="M15 39c-2-6-1-12 3-16 2-2 2-5 1-8h10c-1 3-1 6 1 8 4 4 5 10 3 16z" fill="#B48C70"/><path d="M19 15h10" stroke="#8F6E57" stroke-width="2.6" stroke-linecap="round"/><path d="M6 26c4-1 7 0 9 3M42 26c-4-1-7 0-9 3" stroke="#F4C9A8" stroke-width="5" stroke-linecap="round"/>'),
  peindre: svg('<path d="M14 40c-2-6-1-12 3-16 2-2 2-5 1-8h12c-1 3-1 6 1 8 4 4 5 10 3 16z" fill="#F4E6D2"/><path d="M15.2 30h18.2" stroke="#2F6FD0" stroke-width="3.4"/><path d="M14.4 35h19.8" stroke="#E8414F" stroke-width="3"/><circle cx="21" cy="25" r="1.6" fill="#FFC93C"/><circle cx="27" cy="25" r="1.6" fill="#FFC93C"/><path d="M33 4l6 4-9 13-4-3z" fill="#C99A5F"/><path d="M26 18l4 3-3 4c-1.5 1-3.5 0-3.5-1.8z" fill="#2F6FD0"/>'),
  etagere: svg('<rect x="5" y="20" width="38" height="3.4" rx="1.4" fill="#B07A45"/><rect x="5" y="38" width="38" height="3.4" rx="1.4" fill="#B07A45"/><path d="M9 20c-1-4 0-7 2-8v-2h4v2c2 1 3 4 2 8z" fill="#2F6FD0"/><path d="M21 20c-1.5-3-1.5-6 0-9h6c1.5 3 1.5 6 0 9z" fill="#E8414F"/><path d="M31 20c0-5 2-8 5-8s5 3 5 8z" fill="#45A85A"/><path d="M10 38c-1-5 1-9 4-10h4c3 1 5 5 4 10z" fill="#FFC93C"/><path d="M27 38c-1-3 0-7 3-8l-1-3h6l-1 3c3 1 4 5 3 8z" fill="#F27BAA"/>')
}
const FOUR_ICON = svg('<path d="M6 42V22C6 12 14 6 24 6s18 6 18 16v20z" fill="#B85C3E"/><path d="M6 26h36M6 34h36M15 18h18" stroke="#8F4430" stroke-width="2"/><rect x="14" y="24" width="20" height="18" rx="3" fill="#2D2A28"/><path d="M24 39c-5 0-7-3-6-7 1-3 4-4 3-8 4 2 5 5 5 7 1-1 1-2 1-3 2 2 3 4 3 6 0 3-2 5-6 5z" fill="#FFB347"/><path d="M24 39c-2.5 0-3.5-1.5-3-3.5.5-1.5 2-2 1.6-4 2 1 2.6 2.6 2.6 3.6.6-.4.6-1 .6-1.6 1 1 1.5 2 1.5 3 0 1.5-1 2.5-3.3 2.5z" fill="#FFE98A"/>')
const FINI_ICON = svg('<circle cx="24" cy="24" r="18" fill="#5EC97B"/><path d="m15 24.5 6 6L33.5 18" fill="none" stroke="#fff" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>')
const SPONGE_ICON = svg('<rect x="9" y="16" width="30" height="20" rx="6" fill="#F2D04E"/><circle cx="16" cy="23" r="2" fill="#D9B43A"/><circle cx="25" cy="27" r="2.4" fill="#D9B43A"/><circle cx="32" cy="22" r="1.7" fill="#D9B43A"/><circle cx="19" cy="31" r="1.5" fill="#D9B43A"/><circle cx="36" cy="12" r="3" fill="#BFE6FF"/><circle cx="12" cy="10" r="2.2" fill="#BFE6FF"/>')
/** La silhouette d'une forme de départ, tirée de son vrai profil. */
function presetIcon(p: Preset) {
  const c = preset(p), { pts } = profilePath(c)
  const k = 34 / Math.max(0.5, c.h + 0.05, Math.max(...c.r) * 2)
  const outer = pts.slice(3, 3 + c.r.length + 6)
  const right = outer.map(([r, y]) => `${(24 + r * k).toFixed(1)},${(42 - y * k).toFixed(1)}`)
  const left = outer.slice().reverse().map(([r, y]) => `${(24 - r * k).toFixed(1)},${(42 - y * k).toFixed(1)}`)
  const top = 42 - c.h * k, rTop = c.r[c.r.length - 1] * k
  const mouth = c.depth > 0 ? `<ellipse cx="24" cy="${top.toFixed(1)}" rx="${(rTop - 1.6).toFixed(1)}" ry="${Math.max(1.2, rTop * 0.22).toFixed(1)}" fill="#7A5E4C"/>` : ''
  return svg(`<ellipse cx="24" cy="43" rx="17" ry="3" fill="#C9CED6"/><polygon points="${right.join(' ')} ${left.join(' ')}" fill="#B48C70"/>${mouth}`, 40)
}

/* ---------- Le jeu ---------- */

export const poterie: GameDef = {
  id: 'poterie', name: 'La Poterie', icon: '🏺', sq: 'sq-peach', cat: 'creatif', noTier: true,
  subtitle: 'Tourne, peins et cuis ton pot',
  // La main : faire monter la motte ; la creuser ; puis peindre en touchant la pièce ; reprendre une pièce de l'étagère
  hand: (root): HandMove | null => {
    const s = me
    if (!s || s.phase !== 'make' || s.flights.length) return null
    const c = potOf(s).clay
    if (s.step === 'modeler') {
      const r = rAt(c, c.h * 0.35)
      if (c.h < 0.4) return { drag: [potScreen(s, r * 0.55, c.h * 0.3), potScreen(s, r * 0.55, c.h * 0.3 + 0.28)] }
      if (c.depth < 0.05) return { drag: [potScreen(s, 0, c.h + 0.01), potScreen(s, 0, c.h - 0.12)] }
      return { drag: [potScreen(s, rAt(c, c.h * 0.5) + 0.02, c.h * 0.5), potScreen(s, rAt(c, c.h * 0.5) + 0.12, c.h * 0.5)] }
    }
    if (s.step === 'peindre') return potOf(s).paint.length ? { choose: visible(root, '.pt-opt[data-color]').slice(0, 4) } : { tap: potScreen(s, 0, c.h * 0.45) }
    const full = s.shelf.map((v, i) => v ? i : -1).filter(i => i >= 0)
    return full.length ? { choose: full.slice(0, 4).map(i => toScreen(s.stage, s.studio.slots[i].clone().setY(s.studio.slots[i].y + 0.15))) } : null
  },
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="arena g3-arena pt-wrap" id="ptWrap" data-step="modeler" data-phase="make">
        <div class="pt-steps">${STEPS.map(st => `<span class="tool-item"><button class="sn-tool pt-step${st === 'modeler' ? ' sel' : ''}" data-step="${st}" aria-label="${STEP_NAME[st]}">${STEP_ICON[st]}</button><i class="tool-cap">${STEP_NAME[st]}</i></span>`).join('')}
          <span class="tool-item"><button class="sn-tool pt-four" id="ptFour" aria-label="Le four">${FOUR_ICON}</button><i class="tool-cap">Four</i></span>
          <span class="tool-item"><button class="sn-tool pt-fini" id="ptFini" aria-label="Fini">${FINI_ICON}</button><i class="tool-cap">Fini</i></span></div>
        <div class="pt-pal" id="ptPal"></div>
      </div>`
    const arena = c.root.querySelector<HTMLElement>('#ptWrap')!
    preloadSfx(['cloth', 'drop', 'whoosh', 'metal', 'creak', 'confirm', 'select', 'pluck', 'tick'])
    const opt = (attrs: string, icon: string, cap: string, sel: boolean, big = false) =>
      `<span class="tool-item"><button class="sn-tool pt-opt${big ? ' big' : ''}${sel ? ' sel' : ''}" ${attrs} aria-label="${cap}">${icon}</button><i class="tool-cap">${cap}</i></span>`
    const showPal = () => {
      const s = me
      const pal = c.root.querySelector<HTMLElement>('#ptPal')!
      if (!s) { pal.innerHTML = ''; return }
      if (s.step === 'modeler') pal.innerHTML = PRESETS.map(([p, n]) => opt(`data-preset="${p}"`, presetIcon(p), n, false, true)).join('')
      else if (s.step === 'peindre') pal.innerHTML = COLORS.map(([col, n]) => opt(`data-color="${col}"`, `<span class="pt-dot" style="background:${col}"></span>`, n, s.color === col)).join('') +
        '<i class="pt-sep"></i>' + opt('data-sponge="1"', SPONGE_ICON, 'Éponge', false)
      else pal.innerHTML = ''
      arena.setAttribute('data-pal', pal.innerHTML ? '1' : '0')
    }
    const setStep = (st: Step) => {
      const s = me
      if (!s || s.phase !== 'make') return
      s.step = st
      arena.setAttribute('data-step', st)
      c.root.querySelectorAll<HTMLElement>('.pt-step').forEach(b => b.classList.toggle('sel', b.dataset.step === st))
      showPal()
      if (st !== 'modeler') handNow()
    }

    const hideLoader = loader(arena, 'poterie')
    build(c, arena).then(s => {
      hideLoader()
      if (!s || dead) { if (s) { s.pot.dispose(); s.stage.dispose() } return }
      me = s
      s.paintTick = paintTick
      setStep('modeler')
      s.stage.start(dt => { if (me === s) frame(s, dt) })
    }).catch(e => { hideLoader(); console.error(e); if (!dead) c.toast('La 3D n\'est pas disponible ici') })

    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      const s = me
      if (!s || s.phase !== 'make') return
      if (t.closest('#ptFour')) { if (!s.flights.length) startFire(s, 'back'); return }
      if (t.closest('#ptFini')) { if (!s.flights.length) { if (potOf(s).glazed) toShelf(s); else startFire(s, 'shelf') } return }
      const stepB = t.closest<HTMLElement>('.pt-step')
      if (stepB?.dataset.step) { setStep(stepB.dataset.step as Step); sfx('select', { vol: 0.5 }); return }
      const o = t.closest<HTMLElement>('.pt-opt')
      if (!o) return
      const d = o.dataset
      if (d.preset) usePreset(s, d.preset as Preset)
      else if (d.color) { s.color = d.color; sfx('select', { vol: 0.4 }) }
      else if (d.sponge) {
        const pd = potOf(s)
        if (pd.paint.length) {
          pd.paint = []
          if (pd.glazed) unglaze(s); else s.pot.repaint(pd)
          sfx('whoosh', { vol: 0.4, rate: 0.7 })
          s.fx.burst(new s.T.Vector3(0, WHEEL_Y + pd.clay.h * 0.5, 0.2), { count: 20, color: ['#BFE6FF', '#FFFFFF'], speed: 0.8, spread: 1, life: 0.7, size: 0.05, gravity: 0.5 })
          s.dirty = 0.1
        }
      }
      showPal()
    }
    c.root.addEventListener('click', onClick)

    /* Le doigt : un geste par doigt (suivi par pointerId) */
    interface Pt { x: number; y: number; t0: number; t0Wall: number; moved: number; mode: 'hollow' | 'raise' | 'side' | 'free' | 'paint' | 'none'; last: { x: number; y: number } | null; band: Band | null; lastU: number; on: boolean }
    const pts = new Map<number, Pt>()
    const onDown = (e: PointerEvent) => {
      const s = me
      if (!s || e.target !== s.stage.renderer.domElement) return
      if (s.phase === 'outro') { endGame(s); return }
      if (s.phase !== 'make' || s.flights.length) return
      const p: Pt = { x: e.clientX, y: e.clientY, t0: e.timeStamp, t0Wall: performance.now(), moved: 0, mode: 'none', last: null, band: null, lastU: 0, on: true }
      if (s.step === 'modeler') {
        const L = onAxisPlane(s, e.clientX, e.clientY)
        if (L) {
          const c2 = potOf(s).clay, r = rAt(c2, L.y)
          p.last = L
          if (Math.abs(L.x) < Math.max(0.06, r * 0.5) && L.y > c2.h * 0.6 && L.y < c2.h + 0.12) p.mode = 'hollow'
          else if (Math.abs(L.x) < r + 0.2 && L.y > -0.05 && L.y < c2.h + 0.25) p.mode = 'free'
        }
      } else if (s.step === 'peindre') {
        if (paintAt(s, e.clientX, e.clientY)) p.mode = 'paint'
      } else {
        // L'étagère : la pièce touchée revient sur le tour
        const views = s.shelf.map(v => v?.mesh).filter((m): m is import('three').Mesh => !!m)
        const r = s.stage.renderer.domElement.getBoundingClientRect()
        s.ray.setFromCamera(new s.T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), s.stage.camera)
        const h = s.ray.intersectObjects(views, false)[0]
        let i = h ? s.shelf.findIndex(v => v?.mesh === h.object) : -1
        // Manquée de peu : la plus proche à l'écran
        if (i < 0) {
          let bd = 0.08 * Math.min(r.width, r.height)
          s.shelf.forEach((v, k) => { if (!v) return; const q = toScreen(s.stage, s.studio.slots[k].clone().setY(s.studio.slots[k].y + 0.12)); const dd = Math.hypot(q.x - e.clientX, q.y - e.clientY); if (dd < bd) { bd = dd; i = k } })
        }
        if (i >= 0) { takeBack(s, i); setStep('modeler') }
      }
      pts.set(e.pointerId, p)
    }
    const onMove = (e: PointerEvent) => {
      const s = me, p = pts.get(e.pointerId)
      if (!s || !p || s.phase !== 'make') return
      p.moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y)
      p.x = e.clientX; p.y = e.clientY
      if (s.step !== 'modeler' || p.mode === 'none' || p.mode === 'paint' || !p.last) return
      const L = onAxisPlane(s, e.clientX, e.clientY)
      if (!L) return
      const dx = Math.abs(L.x) - Math.abs(p.last.x), dy = L.y - p.last.y
      const d = potOf(s)
      if (p.mode === 'free') {
        // Le sens du geste décide, une fois pour toutes : monter / descendre, ou de côté
        if (p.moved < 12) return
        p.mode = Math.abs(L.y - p.last.y) > Math.abs(L.x - p.last.x) * 1.1 ? 'raise' : 'side'
      }
      const before = copyClay(d.clay)
      if (p.mode === 'raise') raise(d.clay, dy * 0.9)
      else if (p.mode === 'side') shape(d.clay, Math.max(0, Math.min(d.clay.h, L.y)), dx * 0.9)
      else if (p.mode === 'hollow') hollow(d.clay, -dy * 1.1)
      p.last = L
      const moved = d.clay.h !== before.h || d.clay.depth !== before.depth || d.clay.r.some((v, i) => Math.abs(v - before.r[i]) > 1e-5)
      if (moved) {
        reshape(s)
        claySound()
        // La barbotine qui gicle un peu sous les doigts
        if (Math.random() < 0.25) s.fx.burst(new s.T.Vector3(0, WHEEL_Y + Math.max(0, Math.min(d.clay.h, L.y)), 0).add(new s.T.Vector3(L.x, 0, 0.1)), { count: 2, color: ['#8F7462', '#A98E7A'], speed: 0.8, spread: 0.6, life: 0.5, size: 0.03, gravity: 3 })
      }
    }
    const onUp = (e: PointerEvent) => {
      const s = me, p = pts.get(e.pointerId)
      pts.delete(e.pointerId)
      if (!s || !p || s.phase !== 'make') return
      if (e.type === 'pointercancel') return
      const d = potOf(s)
      if (p.mode === 'hollow' && p.moved < 12) {
        // Un toucher au centre : un petit coup de pouce qui creuse
        hollow(d.clay, 0.06); reshape(s); claySound()
      } else if (p.mode === 'paint' && !p.band && p.moved < 14 && e.timeStamp - p.t0 < 260) {
        // Un toucher : un point… et le tour en fait un anneau de points
        const q = paintAt(s, e.clientX, e.clientY)
        if (q && d.paint.length < MAX_OPS) {
          const op = { k: 'd' as const, c: s.color, u: q.u, v: q.v, n: 8 }
          d.paint.push(op)
          if (d.glazed) { unglaze(s) } else s.pot.addOp(op, d)
          sfx('pluck', { vol: 0.5, rate: 1.2 + Math.random() * 0.3 })
          s.fx.burst(q.p, { count: 8, color: [s.color, '#FFFFFF'], speed: 0.5, spread: 1, life: 0.5, size: 0.03, gravity: 0.5 })
          s.dirty = 0.3
        }
      }
      if (p.band) { s.dirty = 0.3; p.band = null }
    }
    c.root.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    /* La bande : tant que le doigt est tenu sur la pièce qui tourne, la peinture s'y dépose, image après image */
    let lastPaintSound = 0
    function paintTick() {
      const s = me
      if (!s || s.phase !== 'make' || s.step !== 'peindre') return
      const d = potOf(s)
      for (const p of pts.values()) {
        if (p.mode !== 'paint') continue
        if (!p.band && performance.now() - p.t0Wall < 170) continue
        const q = paintAt(s, p.x, p.y)
        if (!q) continue
        if (!p.band) {
          if (d.paint.length >= MAX_OPS) continue
          if (d.glazed) unglaze(s)
          p.band = { k: 'b', c: s.color, w: 0.05, p: [q.u, q.v] }
          p.lastU = q.u
          d.paint.push(p.band)
          s.pot.addOp({ ...p.band, p: [q.u, q.v] }, d)
          continue
        }
        const n = p.band.p.length
        // Le tour déroulé : on suit l'angle d'un bord à l'autre sans saut
        let du = q.u - (p.lastU % 1 + 1) % 1
        if (du > 0.5) du -= 1
        if (du < -0.5) du += 1
        const u = p.lastU + du
        if (Math.abs(u - p.band.p[n - 2]) < 0.004 && Math.abs(q.v - p.band.p[n - 1]) < 0.004) continue
        if (n >= MAX_PTS * 2) continue
        const seg = { k: 'b' as const, c: p.band.c, w: p.band.w, p: [p.band.p[n - 2], p.band.p[n - 1], u, q.v] }
        p.band.p.push(Math.round(u * 1000) / 1000, Math.round(q.v * 1000) / 1000)
        p.lastU = u
        s.pot.addOp(seg, d)
        const now = performance.now()
        if (now - lastPaintSound > 220) { lastPaintSound = now; sfx('cloth', { vol: 0.12, rate: 1.5 }) }
        if (Math.random() < 0.15) s.fx.burst(q.p, { count: 1, color: [p.band.c], speed: 0.3, spread: 1, life: 0.4, size: 0.025, gravity: 1 })
      }
    }

    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __pt: unknown }).__pt = {
        get ready() { return !!me && me.phase === 'make' && !me.flights.length },
        get phase() { return me?.phase },
        get step() { return me?.step },
        get clay() { return me ? JSON.parse(JSON.stringify(potOf(me).clay)) : null },
        get paint() { return me ? potOf(me).paint.length : 0 },
        get glazed() { return me ? potOf(me).glazed : false },
        get shelf() { return me ? me.saved.shelf.filter(Boolean).length : 0 },
        /** Un point de la pièce (écart à l'axe, hauteur sur le plateau), à l'écran. */
        pt(x: number, y: number) { return me ? potScreen(me, x, y) : null },
        /** Une pièce de l'étagère, à l'écran. */
        slot(i: number) { const s = me; return s && s.shelf[i] ? toScreen(s.stage, s.studio.slots[i].clone().setY(s.studio.slots[i].y + 0.12)) : null },
        speed(k: number) { if (me) me.stage.timeScale = k },
        /** L'affiche : un vase bleu et blanc, émaillé, des pièces sur l'étagère. */
        demo() {
          const s = me
          if (!s) return
          const d = potOf(s)
          d.clay = preset('vase')
          shape(d.clay, d.clay.h * 0.32, 0.03)
          d.paint = [
            { k: 'b', c: '#2F6FD0', w: 0.07, p: [0, 0.22, 1.02, 0.22] },
            { k: 'b', c: '#2F6FD0', w: 0.035, p: [0, 0.62, 1.02, 0.62] },
            { k: 'd', c: '#FFFFFF', u: 0.05, v: 0.22, n: 12 },
            { k: 'd', c: '#FFC93C', u: 0, v: 0.43, n: 9 },
            { k: 'b', c: '#E8414F', w: 0.03, p: [0, 0.84, 1.02, 0.84] }
          ]
          d.glazed = true
          s.pot.setClay(d.clay); s.pot.setGlazed(true); s.pot.repaint(d)
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
        // Quittée en plein vol ou au four : la pièce reste celle du tour, gardée telle quelle
        if (s.phase !== 'done') save(s.saved)
        s.pot.dispose()
        s.shelf.forEach(v => v?.dispose())
        s.flights.forEach(f => f.view.dispose())
        try { s.stage.dispose() } catch { /* déjà démonté */ }
      }
      hideLoader()
    }
  }
}
