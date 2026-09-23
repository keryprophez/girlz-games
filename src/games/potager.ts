import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { ICON } from '../core/icons'
import { sfx, preloadSfx } from '../core/sfx'
import { tone } from '../core/audio'
import { impact } from '../core/impact'
import { setMusicIntensity } from '../core/music'
import { makeDoll, poseDoll, type Doll, type DollPose } from '../core/doll3d'
import { defaultLook } from '../core/character'
import { critterKit, type Critter, type CritterKit } from '../core/critters'
import { makeTractor, type Tractor } from '../core/tractor'
import { GARDEN, PLANT_MODEL, tintPlant } from '../core/portraits'
import { ground, decor, particles, type Particles } from '../core/scene3d'
import { createStage, loadThree, loader, loadModel, fitModel, woodTex, type Stage, type T3 } from '../core/three3d'
import {
  beginGame, isFast, loadMemory, saveMemory, mulPool, mulEase, mulChoices, nearMiss, orient,
  planHarvest, record, requeue, viewLevel, LV, type Fact, type Item, type Level, type Memory
} from '../core/facts'

/* 🥕 Le Potager — phase 4, « la Ferme des calculs » (23/09).

   Un carré de légumes de 7 rangées de 8, c'est 7 × 8 : on le trace au doigt
   depuis le coin du potager, il pousse, et on le compte par rangées (8, 16,
   24… 56), chaque rangée sur une note plus haute — la table devient une
   petite mélodie. Une espèce par rangée, les mêmes plantes que le Grand
   Tableau (`gardenPortraits`) : la rangée 3, ce sont les violettes.

   Deux modes :
   - Découvre : rectangles libres, et un bouton qui fait pivoter le carré
     (chaque plante saute sur sa case miroir : 7 × 8 = 8 × 7, les mêmes) ;
   - Récolte : douze questions composées par la mémoire des calculs
     (`core/facts.ts`), une caisse par bonne réponse dans la remorque du
     tracteur. L'aide s'efface calcul par calcul (carré qui se compte seul,
     carré planté, contour, nombres seuls, pavé) ; une erreur la ramène.

   Apprendre, donc AUCUNE sanction : ni vies, ni chrono, ni bonus de vitesse.
   Le temps de réponse est mesuré en silence (su par cœur ou recompté ?) et
   n'est jamais montré. Le « presque » est dessiné : 49 pour 7 × 8, le champ
   plante le carré 7 × 7 qu'elle a donné, puis la colonne qui manque pousse.
   La voix ne dit que le contenu (« sept fois huit, cinquante-six »). */

type Mode = 'discover' | 'harvest'
type V3 = import('three').Vector3
type IMesh = import('three').InstancedMesh

/* ---------- Le champ ---------- */
const N = 10
const P = 0.44                 // côté d'une parcelle (m)
const X0 = -N * P / 2          // bord gauche (colonne 1)
const Z0 = N * P / 2           // bord avant, côté caméra (rangée 1)
const plotX = (c: number) => X0 + (c - 0.5) * P
const plotZ = (r: number) => Z0 - (r - 0.5) * P
const MOUND_Y = 0.045          // le haut des buttes : les plantes y sont posées
/** Hauteur de chaque plante au champ (m) : la table de `PLANT_MODEL` est
    faite pour un portrait, où une fraise peut être petite ; ici, chaque
    rangée doit se voir d'aussi loin que les autres. */
const FIELD_SIZE = [0.56, 0.56, 0.56, 0.4, 0.52, 0.5, 0.38, 0.42, 0.44, 0.5]
/** Une espèce tient une rangée, et après un pivot une colonne : au pire les
    deux à la fois (19 buttes). On ne dessine jamais que celles-là. */
const CAP = 20

/** Les rangées chantent : une gamme pentatonique qui monte. */
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760]
/** Couleur de chaque plante en vrac dans les caisses (même ordre que GARDEN). */
const CRATE_COLORS = [0xB8322E, 0xD9A72A, 0x7A4FB0, 0xC02A3A, 0xD4702A, 0xE0B83A, 0xB0302A, 0x3E7A33, 0x5E2E6E, 0xC98A2A]
/** Les buttes : terre, terre fraîche (contour), manque (or), trop (corail). */
const MOUND = { soil: '#3F2716', fresh: '#6E4828', gold: '#C8901E', coral: '#B8452F' } as const
type MoundTint = keyof typeof MOUND

const fois = (a: number, b: number) => `${a === 1 ? 'une' : a} fois ${b}`

interface Slot {
  r: number
  c: number
  /** Espèce (indice dans GARDEN), -1 = rien. */
  sp: number
  /** Croissance affichée 0..1 et visée. */
  g: number
  tg: number
  delay: number
  /** Petit rebond (compté à rebours). */
  pop: number
  /** Saut vers la case miroir (pivot). */
  hop: { x: number; z: number; t: number; dur: number } | null
  yaw: number
  tint: MoundTint
}

interface Lab {
  el: HTMLElement
  x: number
  y: number
  z: number
}

interface Walker {
  c: Critter
  x: number
  z: number
  tx: number
  tz: number
  wait: number
  speed: number
  lead: Walker | null
}

interface Q {
  item: Item
  r: number
  c: number
  ans: number
  view: Level
  tries: number
  ready: boolean
  /** Temps simulé où les réponses sont devenues touchables. */
  t0: number
  pad: boolean
  typed: string
  opts: number[]
}

interface State {
  stage: Stage
  T: T3
  fx: Particles
  mode: Mode
  /** Jeton : tout rappel programmé vérifie qu'il est toujours d'actualité. */
  gen: number
  lock: boolean
  over: boolean
  slots: Slot[]
  kinds: IMesh[][]
  mounds: IMesh
  frame: import('three').Group
  dirty: boolean
  moundDirty: boolean
  R: number
  C: number
  labs: Lab[]
  stakeRows: HTMLElement[]
  stakeCols: HTMLElement[]
  labHost: HTMLElement
  doll: Doll
  pose: DollPose
  poseUntil: number
  kit: CritterKit
  walkers: Walker[]
  tractor: Tractor
  tractorX: number
  crate: { geo: import('three').BufferGeometry; wood: import('three').Material; ball: import('three').BufferGeometry; colors: import('three').Material[] }
  flying: { g: import('three').Group; from: V3; to: V3; t: number; slot: number }[]
  cam: { pos: V3; look: V3; wantPos: V3; wantLook: V3; basePos: V3; baseLook: V3 }
  simT: number
  mem: Memory
  pool: Fact[]
  queue: Item[]
  qi: number
  q: Q | null
  firstTry: number
  streak: number
  done: number
  drag: number | null
  hint: Lab | null
  outroT: number
  counting: boolean
}

let pg: State | null = null
let ctx: GameContext

const idx = (r: number, c: number) => (r - 1) * N + (c - 1)

/* ---------- Les plantes, instanciées ----------
   Chaque espèce = les maillages de son modèle Kenney, cuits dans la pose et
   l'échelle du potager, en `InstancedMesh` compacts : on ne dessine que les
   plantes visibles (`count`), jamais cent instances aplaties. */
async function plantMeshes(T: T3, k: number): Promise<IMesh[]> {
  const [kit, name, , tilt] = PLANT_MODEL[GARDEN[k]]
  const m = await loadModel(kit, name)
  fitModel(T, m, FIELD_SIZE[k])
  m.rotation.set(0, -0.5, tilt)
  m.updateMatrixWorld(true)
  const box = new T.Box3().setFromObject(m)
  const ctr = box.getCenter(new T.Vector3())
  const out: IMesh[] = []
  m.traverse(o => {
    const mesh = o as import('three').Mesh
    if (!mesh.isMesh) return
    const geo = mesh.geometry.clone()
    geo.applyMatrix4(mesh.matrixWorld)
    geo.translate(-ctr.x, -box.min.y, -ctr.z)
    const mat = (mesh.material as import('three').MeshStandardMaterial).clone()
    tintPlant(T, mat)
    const im = new T.InstancedMesh(geo, mat, CAP)
    im.instanceMatrix.setUsage(T.DynamicDrawUsage)
    im.count = 0
    im.castShadow = true
    im.frustumCulled = false
    out.push(im)
  })
  return out
}

/** Terre du potager : un fond sombre, les buttes posées dessus. */
function soilTex(T: T3) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#2E1B0F'
  g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 900; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(90,60,36,.5)' : 'rgba(30,18,10,.45)'
    const s = 1 + Math.random() * 3
    g.fillRect(Math.random() * 256, Math.random() * 256, s, s)
  }
  const tex = new T.CanvasTexture(c)
  tex.wrapS = tex.wrapT = T.RepeatWrapping
  tex.repeat.set(4, 4)
  tex.colorSpace = T.SRGBColorSpace
  return tex
}

/* ---------- Mise à jour du champ ---------- */

function backOut(x: number) {
  const k = 1.70158
  return 1 + (k + 1) * Math.pow(x - 1, 3) + k * Math.pow(x - 1, 2)
}

function updatePlants(me: State, dt: number) {
  let moving = false
  for (const s of me.slots) {
    if (s.delay > 0) { s.delay -= dt; moving = true; continue }
    if (s.g !== s.tg) {
      const sp = s.tg > s.g ? 1 / 0.3 : 1 / 0.18
      s.g = s.tg > s.g ? Math.min(s.tg, s.g + dt * sp) : Math.max(s.tg, s.g - dt * sp)
      if (s.g === 0 && s.tg === 0) s.sp = -1
      moving = true
    }
    if (s.pop > 0) { s.pop = Math.max(0, s.pop - dt); moving = true }
    if (s.hop) {
      s.hop.t += dt
      if (s.hop.t >= s.hop.dur) s.hop = null
      moving = true
    }
  }
  if (!moving && !me.dirty) return
  me.dirty = false
  const { T } = me
  const m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), pos = new T.Vector3(), scl = new T.Vector3()
  const counts = me.kinds.map(() => 0)
  for (const s of me.slots) {
    if (s.sp < 0 || s.g <= 0.001) continue
    const k = s.sp
    const n = counts[k]
    if (n >= CAP) continue
    const grow = s.tg >= s.g ? backOut(s.g) : s.g
    const bounce = s.pop > 0 ? 1 + Math.sin((1 - s.pop / 0.3) * Math.PI) * 0.28 : 1
    let x = plotX(s.c), z = plotZ(s.r), y = MOUND_Y
    if (s.hop) {
      const u = Math.min(1, s.hop.t / s.hop.dur)
      const w = u * u * (3 - 2 * u)
      x = s.hop.x + (x - s.hop.x) * w
      z = s.hop.z + (z - s.hop.z) * w
      y += Math.sin(u * Math.PI) * 0.55
    }
    pos.set(x, y, z)
    e.set(0, s.yaw, 0)
    q.setFromEuler(e)
    scl.set(grow, grow * bounce, grow)
    m.compose(pos, q, scl)
    for (const im of me.kinds[k]) im.setMatrixAt(n, m)
    counts[k] = n + 1
  }
  me.kinds.forEach((parts, k) => {
    for (const im of parts) { im.count = counts[k]; im.instanceMatrix.needsUpdate = true }
  })
}

function updateMounds(me: State) {
  if (!me.moundDirty) return
  me.moundDirty = false
  const col = new me.T.Color()
  for (const s of me.slots) {
    col.set(MOUND[s.tint])
    me.mounds.setColorAt(idx(s.r, s.c), col)
  }
  if (me.mounds.instanceColor) me.mounds.instanceColor.needsUpdate = true
}

function tintMounds(me: State, f: (r: number, c: number) => MoundTint) {
  for (const s of me.slots) s.tint = f(s.r, s.c)
  me.moundDirty = true
}

/** Plante (ou arrache) le rectangle R × C. `wave` : ça pousse en vague
    depuis le coin ; sinon d'un coup. Une espèce par rangée. */
function setRect(me: State, R: number, C: number, wave = false, delay0 = 0) {
  me.R = R; me.C = C
  for (const s of me.slots) {
    const inside = s.r <= R && s.c <= C
    if (inside) {
      if (s.tg === 0 || s.sp < 0) {
        if (s.g <= 0.001 || s.sp < 0) s.sp = s.r - 1
        s.tg = 1
        s.delay = wave ? delay0 + (s.r + s.c - 2) * 0.035 : 0
      }
    } else if (s.tg !== 0) {
      s.tg = 0
      s.delay = 0
    }
  }
  me.dirty = true
}

function clearField(me: State) {
  for (const s of me.slots) { s.tg = 0; s.delay = 0; s.hop = null }
  me.R = 0; me.C = 0
  tintMounds(me, () => 'soil')
  me.frame.visible = false
  dropLabels(me)
  me.dirty = true
}

/** Le sillon à la craie autour du rectangle (niveau « Contour »). */
function showFrame(me: State, R: number, C: number) {
  const [top, bottom, left, right] = me.frame.children
  const w = C * P, d = R * P
  const x0 = X0, z0 = Z0
  top.position.set(x0 + w / 2, 0.03, z0 - d); top.scale.set(w + 0.05, 1, 1)
  bottom.position.set(x0 + w / 2, 0.03, z0); bottom.scale.set(w + 0.05, 1, 1)
  left.position.set(x0, 0.03, z0 - d / 2); left.scale.set(1, 1, d + 0.05)
  right.position.set(x0 + w, 0.03, z0 - d / 2); right.scale.set(1, 1, d + 0.05)
  me.frame.visible = true
}

/* ---------- Étiquettes en DOM (nombres nets à toute taille) ---------- */

function addLab(me: State, html: string, cls: string, x: number, y: number, z: number): Lab {
  const el = document.createElement('div')
  el.className = 'pg-lab ' + cls
  el.innerHTML = `<span>${html}</span>`
  me.labHost.appendChild(el)
  const lab = { el, x, y, z }
  me.labs.push(lab)
  return lab
}

function dropLabels(me: State) {
  me.labs = me.labs.filter(l => {
    if (l.el.classList.contains('pg-keep')) return true
    l.el.remove()
    return false
  })
}

function placeLabels(me: State) {
  const { camera, renderer } = me.stage
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight
  const v = new me.T.Vector3()
  for (const l of me.labs) {
    v.set(l.x, l.y, l.z).project(camera)
    l.el.style.transform = `translate(${((v.x + 1) / 2 * w).toFixed(1)}px,${((1 - v.y) / 2 * h).toFixed(1)}px)`
  }
}

function lightStakes(me: State, r: number, c: number) {
  me.stakeRows.forEach((el, i) => el.classList.toggle('on', i + 1 === r))
  me.stakeCols.forEach((el, i) => el.classList.toggle('on', i + 1 === c))
}

/* ---------- Compter par rangées : la table qui chante ---------- */

function countRows(me: State, R: number, C: number, done?: () => void) {
  const g = me.gen
  me.counting = true
  dropLabels(me)
  const STEP = 380
  for (let i = 1; i <= R; i++) {
    ctx.after(i * STEP, () => {
      if (pg !== me || me.gen !== g) return
      for (const s of me.slots) if (s.r === i && s.c <= C) s.pop = 0.3
      me.dirty = true
      addLab(me, String(i * C), 'pg-row', X0 + C * P + 0.26, 0.12, plotZ(i))
      tone(PENTA[i - 1], 0.32, 'triangle', 0.11)
      tone(PENTA[i - 1] * 2, 0.18, 'sine', 0.04, 0.02)
    })
  }
  ctx.after((R + 1) * STEP, () => {
    if (pg !== me || me.gen !== g) return
    totalLabel(me, R, C)
    ctx.say(`${fois(R, C)}, ${R * C}`)
    me.counting = false
    done?.()
  })
}

function totalLabel(me: State, R: number, C: number) {
  addLab(me, String(R * C), 'pg-total', X0 + C * P / 2, 0.55, Z0 - R * P / 2)
}

/* ---------- Découvre ---------- */

function plotAt(me: State, ev: PointerEvent): { r: number; c: number } | null {
  const { T, camera, renderer } = me.stage
  const rect = renderer.domElement.getBoundingClientRect()
  const ndc = new T.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1)
  const ray = new T.Raycaster()
  ray.setFromCamera(ndc, camera)
  const hit = new T.Vector3()
  if (!ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -MOUND_Y), hit)) return null
  const c = Math.ceil((hit.x - X0) / P), r = Math.ceil((Z0 - hit.z) / P)
  if (c < 0 || r < 0 || c > N + 1 || r > N + 1) return null // bien loin du champ : on ignore
  return { r: Math.max(1, Math.min(N, r)), c: Math.max(1, Math.min(N, c)) }
}

function paintDiscover(me: State, withResult: boolean) {
  const q = $('pgQ')
  if (!me.R) { q.innerHTML = ''; return }
  q.innerHTML = `<span class="r">${me.R}</span><span class="pg-x">×</span><span class="c">${me.C}</span>` +
    (withResult ? `<span class="pg-x">=</span><span class="v">${me.R * me.C}</span>` : '')
  const pv = document.getElementById('pgPivot') as HTMLButtonElement | null
  if (pv) pv.disabled = !withResult || me.R === me.C
}

function dragTo(me: State, r: number, c: number) {
  if (r === me.R && c === me.C) return
  const before = me.R * me.C
  me.gen++
  me.counting = false
  dropLabels(me)
  setRect(me, r, c)
  lightStakes(me, r, c)
  paintDiscover(me, false)
  if (r * c > before) {
    sfx('pluck', { vol: 0.3, rate: 0.75 + (r * c) / 100 * 0.7 })
    for (const s of me.slots) {
      if (s.r <= r && s.c <= c && s.g === 0 && s.delay === 0 && Math.random() < 0.35) {
        me.fx.burst({ x: plotX(s.c), y: MOUND_Y, z: plotZ(s.r) }, { count: 3, color: [0x6B4A2A, 0x8A6238], speed: 0.9, life: 0.35, size: 0.04 })
      }
    }
  }
}

function releaseDrag(me: State) {
  if (!me.R) return
  const g = me.gen
  countRows(me, me.R, me.C, () => { if (me.gen === g) paintDiscover(me, true) })
}

function pivot(me: State) {
  if (me.counting || !me.R || me.R === me.C) return
  const R = me.R, C = me.C
  me.gen++
  dropLabels(me)
  // Chaque plante de (r, c) saute sur (c, r) : ce sont LES MÊMES plantes
  const old = me.slots.map(s => ({ sp: s.sp, on: s.tg === 1 && s.sp >= 0 }))
  for (const s of me.slots) {
    const inNew = s.r <= C && s.c <= R
    if (inNew) {
      const src = old[idx(s.c, s.r)]
      s.sp = src.sp >= 0 ? src.sp : s.c - 1
      s.g = 1; s.tg = 1; s.delay = 0
      s.hop = { x: plotX(s.r), z: plotZ(s.c), t: -((s.r + s.c) * 0.03), dur: 0.62 }
    } else {
      s.g = 0; s.tg = 0; s.delay = 0; s.hop = null; s.sp = -1
    }
  }
  // Un départ différé : t négatif = attente avant le saut
  for (const s of me.slots) if (s.hop && s.hop.t < 0) { s.delay = -s.hop.t; s.hop.t = 0 }
  me.R = C; me.C = R
  me.dirty = true
  lightStakes(me, me.R, me.C)
  paintDiscover(me, false)
  sfx('whoosh', { vol: 0.45 })
  const g = me.gen
  ctx.after(1100, () => {
    if (pg !== me || me.gen !== g) return
    countRows(me, me.R, me.C, () => { if (me.gen === g) paintDiscover(me, true) })
  })
}

/* ---------- Récolte ---------- */

function paintDots(me: State) {
  const n = me.queue.length
  $('pgDots').innerHTML = Array.from({ length: n }, (_, i) => `<i class="pg-dot${i < me.done ? ' on' : ''}"></i>`).join('')
}

function paintQuestion(me: State, withAnswer = false) {
  const q = me.q
  if (!q) return
  let tail = ''
  if (withAnswer) tail = `<span class="pg-x">=</span><span class="v">${q.ans}</span>`
  else if (q.pad) tail = `<span class="pg-x">=</span><span class="v pg-typed" id="pgTyped">${q.typed || '…'}</span>`
  $('pgQ').innerHTML = `<span class="r">${q.r}</span><span class="pg-x">×</span><span class="c">${q.c}</span>${tail}`
}

function startHarvest(me: State) {
  me.gen++
  me.lock = false
  me.over = false
  beginGame(me.mem)
  saveMemory('potager', me.mem)
  me.queue = planHarvest(me.mem, me.pool, { ease: mulEase })
  me.qi = 0; me.done = 0; me.firstTry = 0; me.streak = 0
  setMusicIntensity(0)
  // La remorque repart vide
  for (const cr of [...me.tractor.load.children]) me.tractor.load.remove(cr)
  paintDots(me)
  const g = me.gen
  ctx.after(500, () => { if (pg === me && me.gen === g) ask(me) })
}

function ask(me: State) {
  if (me.qi >= me.queue.length) { outro(me); return }
  const item = me.queue[me.qi]
  const [r, c] = orient(item.fact)
  const view = viewLevel(me.mem, item)
  me.gen++
  const g = me.gen
  clearField(me)
  me.q = { item, r, c, ans: r * c, view, tries: 0, ready: false, t0: 0, pad: view === LV.heart, typed: '', opts: [] }
  lightStakes(me, r, c)
  paintQuestion(me)
  $('pgOpts').innerHTML = ''
  const later = (ms: number, fn: () => void) => ctx.after(ms, () => { if (pg === me && me.gen === g) fn() })
  if (view === LV.discover) {
    // Découverte : le carré pousse, puis se compte tout seul
    later(350, () => {
      setRect(me, r, c, true)
      later(600 + (r + c) * 35, () => countRows(me, r, c, () => { paintQuestion(me); offer(me, 3) }))
    })
  } else if (view === LV.plants) {
    later(250, () => {
      setRect(me, r, c, true)
      ctx.say(fois(r, c))
      later(450 + (r + c) * 35, () => offer(me, 3))
    })
  } else if (view === LV.outline) {
    later(250, () => {
      tintMounds(me, (rr, cc) => rr <= r && cc <= c ? 'fresh' : 'soil')
      showFrame(me, r, c)
      sfx('cloth', { vol: 0.35 })
      ctx.say(fois(r, c))
      later(500, () => offer(me, 4))
    })
  } else {
    later(250, () => {
      ctx.say(fois(r, c))
      later(350, () => offer(me, view === LV.heart ? 0 : 4))
    })
  }
}

/** Montre les réponses : `n` boutons, ou le pavé si n = 0. */
function offer(me: State, n: number, exclude: number[] = []) {
  const q = me.q
  if (!q) return
  const box = $('pgOpts')
  q.pad = n === 0
  q.typed = ''
  paintQuestion(me)
  if (q.pad) {
    box.className = 'pg-opts pg-padbox'
    box.innerHTML = `<div class="pg-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'del', 0].map(k =>
      `<button class="pg-key${k === 'del' ? ' del' : ''}" data-k="${k}">${k === 'del' ? ICON.turnLeft : k}</button>`).join('')}</div>`
    box.querySelectorAll<HTMLButtonElement>('.pg-key').forEach(b => { b.onclick = () => typeKey(me, b.dataset.k!) })
  } else {
    q.opts = mulChoices(q.r, q.c, n, Math.random, exclude)
    box.className = 'pg-opts' + (n === 3 ? ' three' : '')
    box.innerHTML = q.opts.map(v => `<button class="pg-opt" data-v="${v}">${v}</button>`).join('')
    box.querySelectorAll<HTMLButtonElement>('.pg-opt').forEach(b => { b.onclick = () => answer(me, Number(b.dataset.v), b) })
  }
  q.ready = true
  q.t0 = me.simT
}

function typeKey(me: State, k: string) {
  const q = me.q
  if (!q || !q.ready || !q.pad || me.lock) return
  sfx('click', { vol: 0.3 })
  if (k === 'del') q.typed = q.typed.slice(0, -1)
  else if (q.typed.length < 3) q.typed += k
  const t = document.getElementById('pgTyped')
  if (t) t.textContent = q.typed || '…'
  if (q.typed.length === String(q.ans).length) answer(me, Number(q.typed), null)
}

function answer(me: State, v: number, btn: HTMLButtonElement | null) {
  const q = me.q
  if (!q || !q.ready || me.lock) return
  q.ready = false
  const ms = (me.simT - q.t0) * 1000
  if (v === q.ans) {
    if (q.tries === 0) {
      record(me.mem, q.item, { ok: true, fast: isFast(ms, q.pad) })
      saveMemory('potager', me.mem)
      me.firstTry++
      me.streak++
      setMusicIntensity(me.streak >= 10 ? 3 : me.streak >= 6 ? 2 : me.streak >= 3 ? 1 : 0)
    }
    btn?.classList.add('good')
    success(me)
    return
  }
  // Une erreur : aucune sanction, l'aide revient
  q.tries++
  me.streak = 0
  setMusicIntensity(0)
  sfx('drop', { vol: 0.35, rate: 0.8 })
  if (btn) { btn.classList.add('bad'); btn.disabled = true }
  if (q.tries === 1) {
    record(me.mem, q.item, { ok: false, fast: false })
    saveMemory('potager', me.mem)
    if (q.item.kind !== 'again') requeue(me.queue, me.qi, q.item.fact)
    showMiss(me, v)
  } else {
    // Deuxième erreur : la bonne réponse brille, jamais d'impasse
    document.querySelectorAll<HTMLButtonElement>('.pg-opt').forEach(b => {
      if (Number(b.dataset.v) === q.ans) b.classList.add('hint')
      else b.disabled = true
    })
    q.ready = true
  }
}

/** Le « presque » : le carré qu'elle a donné, puis ce qui manque (ou ce qui
    dépasse). Sinon, le bon carré pousse et se compte. Puis la même question
    revient, légumes visibles, sa mauvaise réponse retirée. */
function showMiss(me: State, v: number) {
  const q = me.q!
  const g = me.gen
  const later = (ms: number, fn: () => void) => ctx.after(ms, () => { if (pg === me && me.gen === g) fn() })
  me.lock = true
  const retry = () => {
    me.lock = false
    offer(me, 3, [v])
  }
  me.frame.visible = false
  tintMounds(me, () => 'soil')
  dropLabels(me)
  const nm = q.pad ? null : nearMiss(q.r, q.c, v)
  $('pgOpts').querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = true })
  if (nm) {
    // Son carré à elle
    setRect(me, nm.r, nm.c, true)
    later(700 + (nm.r + nm.c) * 35, () => {
      const less = nm.r * nm.c < q.ans
      tintMounds(me, (r, c) => {
        const inAns = r <= q.r && c <= q.c, inHers = r <= nm.r && c <= nm.c
        if (inAns && !inHers) return 'gold'
        if (!inAns && inHers) return 'coral'
        return 'soil'
      })
      if (less) {
        // Ce qui manque pousse, en or
        setRect(me, q.r, q.c, false)
        for (const s of me.slots) {
          if (s.r <= q.r && s.c <= q.c && !(s.r <= nm.r && s.c <= nm.c)) {
            s.delay = 0.1 + ((s.r - 1) + (s.c - 1)) * 0.03
            me.fx.burst({ x: plotX(s.c), y: MOUND_Y + 0.1, z: plotZ(s.r) }, { count: 4, color: [0xFFD24A, 0xFFF1A0], speed: 1.2, life: 0.6, size: 0.06 })
          }
        }
        sfx('pluck', { vol: 0.5, rate: 1.25 })
      } else {
        // Ce qui dépasse rentre sous terre
        later(500, () => { setRect(me, q.r, q.c, false); sfx('drop', { vol: 0.3, rate: 1.3 }) })
      }
      later(1500, () => { tintMounds(me, () => 'soil'); retry() })
    })
  } else {
    setRect(me, q.r, q.c, true)
    later(600 + (q.r + q.c) * 35, () => countRows(me, q.r, q.c, () => { dropLabels(me); retry() }))
  }
}

function success(me: State) {
  const q = me.q!
  me.lock = true
  const g = me.gen
  const later = (ms: number, fn: () => void) => ctx.after(ms, () => { if (pg === me && me.gen === g) fn() })
  me.frame.visible = false
  tintMounds(me, () => 'soil')
  // Le carré pousse d'un coup (s'il n'était pas là), et c'est la fête
  setRect(me, q.r, q.c, true)
  paintQuestion(me, true)
  sfx('confirm', { vol: 0.65 })
  ctx.say(`${fois(q.r, q.c)}, ${q.ans}`)
  me.pose = 'cheer'
  me.poseUntil = me.simT + 1.4
  dropLabels(me)
  later(350, () => {
    totalLabel(me, q.r, q.c)
    me.fx.burst({ x: X0 + q.c * P / 2, y: 0.5, z: Z0 - q.r * P / 2 }, { count: 26, color: [0xFFD24A, 0xFFFFFF, 0x9FE08A], speed: 2.2, life: 0.8, size: 0.08 })
  })
  later(1300, () => harvest(me))
  later(2300, () => { me.qi++; me.lock = false; ask(me) })
}

/** Les plantes rentrent sous terre, une caisse s'envole vers la remorque. */
function harvest(me: State) {
  const q = me.q!
  const { T } = me
  for (const s of me.slots) {
    if (s.tg === 1 && Math.random() < 0.3) {
      me.fx.burst({ x: plotX(s.c), y: MOUND_Y + 0.12, z: plotZ(s.r) }, { count: 3, color: [0x5E9E3A, 0x3E7A33], speed: 1.1, life: 0.5, size: 0.05 })
    }
    s.tg = 0; s.delay = Math.random() * 0.15
  }
  me.dirty = true
  dropLabels(me)
  sfx('whoosh', { vol: 0.35 })
  const cr = new T.Group()
  const box = new T.Mesh(me.crate.geo, me.crate.wood)
  box.castShadow = true
  cr.add(box)
  for (let i = 0; i < 5; i++) {
    const row = Math.min(q.r, 10) - 1 - (i % Math.max(1, q.r))
    const ball = new T.Mesh(me.crate.ball, me.crate.colors[Math.max(0, row)])
    ball.position.set((i % 3 - 1) * 0.05, 0.07, (Math.floor(i / 3) - 0.5) * 0.06)
    cr.add(ball)
  }
  cr.scale.setScalar(me.tractor.g.scale.x)
  const slot = me.done
  const from = new T.Vector3(X0 + q.c * P / 2, 0.4, Z0 - q.r * P / 2)
  const to = me.tractor.load.localToWorld(crateLocal(T, slot))
  cr.position.copy(from)
  me.stage.scene.add(cr)
  me.flying.push({ g: cr, from, to, t: 0, slot })
  me.done++
  paintDots(me)
}

function crateLocal(T: T3, i: number): V3 {
  const layer = Math.floor(i / 6), j = i % 6
  return new T.Vector3(-0.2 + (j % 3) * 0.2, 0.06 + layer * 0.13, -0.1 + Math.floor(j / 3) * 0.2)
}

function updateCrates(me: State, dt: number) {
  for (let i = me.flying.length - 1; i >= 0; i--) {
    const f = me.flying[i]
    f.t += dt / 0.8
    const u = Math.min(1, f.t)
    f.g.position.lerpVectors(f.from, f.to, u)
    f.g.position.y += Math.sin(u * Math.PI) * 1.4
    f.g.rotation.y = u * Math.PI * 2
    if (u >= 1) {
      me.tractor.load.attach(f.g)
      f.g.position.copy(crateLocal(me.T, f.slot))
      f.g.rotation.set(0, 0, 0)
      f.g.scale.setScalar(1)
      impact(0.35, { matter: 'bois', noShake: true })
      me.fx.burst(f.to, { count: 8, color: [0xC99A5F, 0x9C7340], speed: 1, life: 0.4, size: 0.05 })
      me.flying.splice(i, 1)
    }
  }
}

function outro(me: State) {
  me.over = true
  me.lock = true
  me.gen++
  me.q = null
  $('pgOpts').innerHTML = ''
  lightStakes(me, 0, 0)
  me.pose = 'wave'
  me.poseUntil = Infinity
  me.outroT = 0
  sfx('creak', { vol: 0.5 })
  setMusicIntensity(0)
  const n = me.queue.length
  const stars = me.firstTry >= n - 2 ? 3 : me.firstTry >= Math.ceil(n * 0.58) ? 2 : 1
  ctx.finish({
    title: 'La récolte est rentrée !',
    msg: me.firstTry === n ? 'Tout juste du premier coup' : `${me.firstTry} sur ${n} du premier coup`,
    stars,
    score: n,
    scoreIcon: ICON.basket,
    outroMs: 2800
  })
}

/* ---------- Les modes ---------- */

function setMode(me: State, mode: Mode) {
  me.mode = mode
  me.gen++
  me.lock = false
  me.counting = false
  me.q = null
  clearField(me)
  lightStakes(me, 0, 0)
  setMusicIntensity(0)
  document.querySelectorAll<HTMLElement>('.pg-tool').forEach(b => {
    const on = b.dataset.m === mode
    b.classList.toggle('sel', on)
    b.parentElement?.classList.toggle('sel', on)
  })
  $('pgOpts').innerHTML = ''
  $('pgOpts').className = 'pg-opts'
  const side = $('pgExtra')
  if (mode === 'discover') {
    $('pgDots').style.display = 'none'
    side.innerHTML = `<span class="tool-item"><button class="sn-tool pg-pivot" id="pgPivot" aria-label="Tourne" disabled>${ICON.rotate}</button><i class="tool-cap">Tourne</i></span>`
    ;($('pgPivot') as HTMLButtonElement).onclick = () => { if (pg === me) pivot(me) }
    paintDiscover(me, false)
    if (!me.hint) me.hint = addLab(me, ICON.tap, 'pg-hint pg-keep', plotX(4), 0.25, plotZ(3))
  } else {
    $('pgDots').style.display = ''
    side.innerHTML = ''
    if (me.hint) { me.hint.el.remove(); me.labs = me.labs.filter(l => l !== me.hint); me.hint = null }
    $('pgQ').innerHTML = ''
    startHarvest(me)
  }
}

/* ---------- Le jeu ---------- */

export const potager: GameDef = {
  id: 'potager', name: 'Le Potager', icon: '🥕', sq: 'sq-mint', cat: 'reflexion',
  music: 'meadow',
  subtitle: 'Fais pousser les tables de multiplication',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="arena g3-arena pg-arena" id="pgArea">
        <div class="pg-labs" id="pgLabs"></div>
        <div class="tq-tools pg-tools">
          <span class="tool-item"><button class="sn-tool pg-tool" data-m="discover" aria-label="Découvre">${ICON.search}</button><i class="tool-cap">Découvre</i></span>
          <span class="tool-item sel"><button class="sn-tool pg-tool sel" data-m="harvest" aria-label="Récolte">${ICON.basket}</button><i class="tool-cap">Récolte</i></span>
        </div>
        <div class="tq-side pg-side">
          <div class="pg-q" id="pgQ"></div>
          <div class="pg-opts" id="pgOpts"></div>
          <div class="pg-dots" id="pgDots"></div>
          <div class="pg-extra" id="pgExtra"></div>
        </div>
      </div>`
    const area = $('pgArea')
    const hideLoader = loader(area, 'potager')
    preloadSfx(['pluck', 'confirm', 'drop', 'whoosh', 'click', 'creak', 'cloth'])

    ;(async () => {
      const T = await loadThree()
      if (dead) return
      const stage = await createStage(area, {
        sky: '#9ED6F0',
        fog: [16, 36], fogColor: '#C6E6F5',
        cam: [1.2, 6.4, 6.2], target: [1.2, 0, 0.2], fov: 40,
        hemi: ['#EAF6FF', '#4E7A3C', 0.95],
        sun: { pos: [3.5, 8, 4.5], color: '#FFF4D6', intensity: 2.1, area: 6.5, far: 26 },
        fill: 0.45, exposure: 1.0, iblIntensity: 0.5
      })
      if (dead) { stage.dispose(); return }
      const { scene } = stage
      // Le canvas passe SOUS les étiquettes et les colonnes
      area.insertBefore(stage.renderer.domElement, area.firstChild)

      /* Le sol : le pré, le carré de terre dans son cadre de planches */
      ground(stage, { radius: 34, color: 0x4F8F3A, roughness: 0.98 })
      const soil = stage.keep(soilTex(T))
      const bed = new T.Mesh(new T.PlaneGeometry(N * P + 0.12, N * P + 0.12), new T.MeshStandardMaterial({ map: soil, roughness: 1 }))
      bed.rotation.x = -Math.PI / 2
      bed.position.y = 0.004
      bed.receiveShadow = true
      scene.add(bed)
      const wood = stage.keep(woodTex(T, '#A07A48'))
      const plank = new T.MeshStandardMaterial({ map: wood, roughness: 0.85 })
      const W = N * P + 0.24
      for (const [x, z, sx, sz] of [[0, Z0 + 0.1, W, 0.08], [0, -Z0 - 0.1, W, 0.08], [X0 - 0.1, 0, 0.08, W], [-X0 + 0.1, 0, 0.08, W]] as const) {
        const b = new T.Mesh(new T.BoxGeometry(sx, 0.12, sz), plank)
        b.position.set(x, 0.06, z)
        b.castShadow = true; b.receiveShadow = true
        scene.add(b)
      }

      /* Les cent buttes, teintables une à une */
      const moundGeo = new T.SphereGeometry(0.5, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2)
      const mounds = new T.InstancedMesh(moundGeo, new T.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 1 }), N * N)
      const mm = new T.Matrix4()
      for (let r = 1; r <= N; r++) for (let cc = 1; cc <= N; cc++) {
        mm.compose(new T.Vector3(plotX(cc), 0.004, plotZ(r)), new T.Quaternion(), new T.Vector3(P * 0.78, 0.085, P * 0.78))
        mounds.setMatrixAt(idx(r, cc), mm)
        mounds.setColorAt(idx(r, cc), new T.Color(MOUND.soil))
      }
      mounds.receiveShadow = true
      scene.add(mounds)

      /* Le sillon à la craie (niveau Contour) */
      const chalk = new T.MeshStandardMaterial({ color: 0xF4EEDD, roughness: 0.9 })
      const frame = new T.Group()
      for (let i = 0; i < 4; i++) {
        const bar = new T.Mesh(new T.BoxGeometry(i < 2 ? 1 : 0.045, 0.03, i < 2 ? 0.045 : 1), chalk)
        frame.add(bar)
      }
      frame.visible = false
      scene.add(frame)

      /* Les piquets : 1 à 10 le long de l'avant (colonnes) et de la gauche (rangées) */
      const stakeGeo = new T.CylinderGeometry(0.022, 0.028, 0.26, 8)
      const stakeMat = new T.MeshStandardMaterial({ color: 0x8A6A3E, roughness: 0.8 })
      const stakes = new T.InstancedMesh(stakeGeo, stakeMat, 2 * N)
      for (let i = 0; i < N; i++) {
        mm.makeTranslation(plotX(i + 1), 0.13, Z0 + 0.3); stakes.setMatrixAt(i, mm)
        mm.makeTranslation(X0 - 0.3, 0.13, plotZ(i + 1)); stakes.setMatrixAt(N + i, mm)
      }
      stakes.castShadow = true
      scene.add(stakes)

      /* Les dix plantes du Grand Tableau, en vraie 3D */
      const kinds = await Promise.all(GARDEN.map((_, k) => plantMeshes(T, k).catch(() => [] as IMesh[])))
      if (dead) { stage.dispose(); kinds.flat().forEach(im => { im.geometry.dispose(); (im.material as import('three').Material).dispose() }); return }
      kinds.flat().forEach(im => scene.add(im))

      /* Leur personnage, au coin du potager — c'est de là que partent les carrés */
      const doll = makeDoll(T, c.look || defaultLook(), 0.95)
      // Au coin avant droit, sous la colonne de la question : on la voit toujours
      doll.obj.position.set(-X0 + 0.62, 0, Z0 - 0.25)
      doll.obj.rotation.y = -0.75
      scene.add(doll.obj)
      stage.keep(doll)

      /* Le tracteur et sa remorque, garés derrière le potager */
      const tractor = makeTractor(T)
      tractor.g.scale.setScalar(1.35)
      const tractorX = 1.1
      tractor.g.position.set(tractorX, 0, -Z0 - 1.05)
      scene.add(tractor.g)

      /* La poule et son poussin picorent à gauche */
      const kit = critterKit(T)
      stage.keep(kit)
      const hen = kit.make('hen', 0.42), chick = kit.make('chick', 0.2)
      const walker = (cr: Critter, x: number, z: number, lead: Walker | null): Walker => {
        cr.obj.position.set(x, 0, z)
        scene.add(cr.obj)
        return { c: cr, x, z, tx: x, tz: z, wait: Math.random() * 2, speed: lead ? 0.5 : 0.32, lead }
      }
      const wHen = walker(hen, -3.4, -2.6, null)
      const wChick = walker(chick, -3.0, -2.2, wHen)

      /* Le décor : des arbres au fond, des buissons et des fleurs autour */
      decor(stage, [
        // Même teinte que le pré de Tape-Trous : le kit Nature est menthe, et
        // l'ACES en ferait de la glace
        ...[[-4.9, -4.9, 2.6], [5.4, -4.7, 2.4], [-5.6, -6.4, 3.4], [4.8, -6.9, 3.2], [-7.6, -2.0, 2.8], [7.4, -3.8, 3.0], [0.9, -8.6, 3.6], [-2.4, -7.6, 2.9]].map(([x, z, size], i) =>
          ({ model: `nature/${['tree_oak', 'tree_default', 'tree_fat', 'tree_detailed'][i % 4]}`, x, z, size, tint: 0x6EAE48 })),
        ...[-4.2, -2.6, -1.0, 0.6, 2.2, 3.8].map(x => ({ model: 'nature/fence_simple', x, z: -4.5, size: 0.62, rot: 0, tint: 0xC9A874 })),
        ...[[-4.3, -2.6], [3.9, -2.2], [-4.1, 2.2]].map(([x, z]) => ({ model: 'nature/plant_bush', x, z, size: 0.6, tint: 0x6EAE48 })),
        ...[[-3.4, 1.5], [-3.8, 0.4], [3.4, 1.2], [3.8, 0.1], [-3.2, 2.8], [3.0, 2.9]].map(([x, z], i) =>
          ({ model: `nature/${['flower_redA', 'flower_yellowA', 'flower_purpleA'][i % 3]}`, x, z, size: 0.34, tint: 0xFFFFFF })),
        { model: 'nature/rock_smallA', x: 3.1, z: 2.4, size: 0.3, tint: 0xB8AFA2 },
        { model: 'nature/stump_round', x: -3.6, z: -1.2, size: 0.35, tint: 0xB08A5E },
        ...[[2.9, -0.4], [-2.9, 3.0], [3.6, -1.6]].map(([x, z]) => ({ model: 'nature/grass_large', x, z, size: 0.4, tint: 0x6EAE48 }))
      ]).catch(() => { /* sans décor, le jeu tourne */ })

      /* La caisse de récolte : planches et légumes en vrac */
      const crate = {
        geo: new T.BoxGeometry(0.18, 0.12, 0.18),
        wood: new T.MeshStandardMaterial({ map: wood, color: 0xC8A06A, roughness: 0.85 }),
        ball: new T.SphereGeometry(0.035, 10, 8),
        colors: CRATE_COLORS.map(col => new T.MeshStandardMaterial({ color: col, roughness: 0.6 }))
      }
      stage.keep({ dispose() {
        crate.geo.dispose(); crate.wood.dispose(); crate.ball.dispose(); crate.colors.forEach(m => m.dispose())
      } })

      const slots: Slot[] = []
      for (let r = 1; r <= N; r++) for (let cc = 1; cc <= N; cc++) {
        slots.push({ r, c: cc, sp: -1, g: 0, tg: 0, delay: 0, pop: 0, hop: null, yaw: (Math.random() - 0.5) * 0.8, tint: 'soil' })
      }

      const labHost = $('pgLabs')
      const cam = {
        pos: new T.Vector3(1.2, 6.4, 6.2), look: new T.Vector3(1.2, 0, 0.2),
        wantPos: new T.Vector3(), wantLook: new T.Vector3(),
        basePos: new T.Vector3(), baseLook: new T.Vector3()
      }
      const pool = c.byTier(mulPool([2, 5, 10]), mulPool([1, 2, 3, 4, 5]), mulPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
      const me: State = {
        stage, T, fx: particles(stage, 500), mode: 'harvest', gen: 0, lock: false, over: false,
        slots, kinds, mounds, frame, dirty: true, moundDirty: true, R: 0, C: 0,
        labs: [], stakeRows: [], stakeCols: [], labHost,
        doll, pose: 'idle', poseUntil: 0, kit, walkers: [wHen, wChick],
        tractor, tractorX, crate, flying: [], cam, simT: 0,
        mem: loadMemory('potager'), pool, queue: [], qi: 0, q: null, firstTry: 0, streak: 0, done: 0,
        drag: null, hint: null, outroT: -1, counting: false
      }
      pg = me

      // Les numéros des piquets, en DOM : nets à toute taille, colorés comme la question
      for (let i = 1; i <= N; i++) {
        me.stakeCols.push(addLab(me, String(i), 'pg-stake col pg-keep', plotX(i), 0.36, Z0 + 0.3).el)
        me.stakeRows.push(addLab(me, String(i), 'pg-stake row pg-keep', X0 - 0.3, 0.36, plotZ(i)).el)
      }
      addLab(me, '×', 'pg-stake corner pg-keep', X0 - 0.3, 0.36, Z0 + 0.3)

      /* La caméra cadre le potager dans la place que laissent les colonnes */
      const frameCam = () => {
        const w = area.clientWidth, h = area.clientHeight
        const aspect = w / Math.max(1, h)
        // Le champ est visé un peu à gauche du centre : à droite, la question
        const shift = Math.min(1.8, Math.max(0.6, (aspect - 1) * 1.7))
        const d = aspect < 1.25 ? 10.5 : 8.6
        cam.baseLook.set(shift, 0, -0.45)
        cam.basePos.set(shift, d * 0.8, d * 0.62 - 0.45)
      }
      frameCam()
      cam.pos.copy(cam.basePos).add(new T.Vector3(0, 1.4, 1.6))
      cam.look.copy(cam.baseLook)
      const ro = new ResizeObserver(frameCam)
      ro.observe(area)

      hideLoader()

      /* --- Le doigt (Découvre) : suivi par pointerId, écouté sur window --- */
      const canvas = stage.renderer.domElement
      const onDown = (ev: PointerEvent) => {
        if (pg !== me || me.mode !== 'discover' || me.drag !== null) return
        const p = plotAt(me, ev)
        if (!p) return
        me.drag = ev.pointerId
        if (me.hint) { me.hint.el.remove(); me.labs = me.labs.filter(l => l !== me.hint); me.hint = null }
        dragTo(me, p.r, p.c)
      }
      const onMove = (ev: PointerEvent) => {
        if (pg !== me || me.drag !== ev.pointerId) return
        const p = plotAt(me, ev)
        if (p) dragTo(me, p.r, p.c)
      }
      const onUp = (ev: PointerEvent) => {
        if (pg !== me || me.drag !== ev.pointerId) return
        me.drag = null
        releaseDrag(me)
      }
      canvas.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      document.querySelectorAll<HTMLElement>('.pg-tool').forEach(b => {
        b.onclick = () => { if (pg === me && !me.over && b.dataset.m !== me.mode) { sfx('click', { vol: 0.4 }); setMode(me, b.dataset.m as Mode) } }
      })
      const onKey = (e: KeyboardEvent) => {
        if (pg !== me || !me.q?.pad) return
        if (/^[0-9]$/.test(e.key)) typeKey(me, e.key)
        else if (e.key === 'Backspace') typeKey(me, 'del')
      }
      window.addEventListener('keydown', onKey)

      // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __pg: unknown }).__pg = {
          get mode() { return me.mode }, get ready() { return !!me.q?.ready && !me.lock },
          get qi() { return me.qi }, get done() { return me.done }, get total() { return me.queue.length },
          get r() { return me.q ? me.q.r : NaN }, get c() { return me.q ? me.q.c : NaN },
          get answer() { return me.q ? me.q.ans : NaN }, get view() { return me.q ? me.q.view : NaN },
          get tries() { return me.q ? me.q.tries : NaN }, get pad() { return !!me.q?.pad },
          get opts() { return me.q ? [...me.q.opts] : [] }, get over() { return me.over },
          get rect() { return [me.R, me.C] }, get counting() { return me.counting },
          /** Touche la réponse v comme un doigt : le bouton, ou le pavé chiffre par chiffre. */
          pick(v: number) {
            if (me.q?.pad) {
              for (const d of String(v)) document.querySelector<HTMLButtonElement>(`.pg-key[data-k="${d}"]`)?.click()
              return true
            }
            const b = document.querySelector<HTMLButtonElement>(`.pg-opt[data-v="${v}"]`)
            if (!b || b.disabled) return false
            b.click()
            return true
          }
        }
      }

      /* --- La boucle --- */
      stage.start(dt => {
        if (pg !== me) return
        me.simT += dt
        updatePlants(me, dt)
        updateMounds(me)
        updateCrates(me, dt)
        // Leur personnage : la joie, le coucou, sinon elle attend
        if (me.pose !== 'idle' && me.simT > me.poseUntil) me.pose = 'idle'
        poseDoll(doll, me.pose, me.simT, dt)
        // La poule picore, le poussin la suit
        for (const w of me.walkers) {
          if (w.wait > 0) {
            w.wait -= dt
            w.c.obj.rotation.x = w.lead ? 0 : Math.max(0, Math.sin(me.simT * 7)) * 0.35
          } else {
            const dx = w.tx - w.x, dz = w.tz - w.z, dd = Math.hypot(dx, dz)
            if (dd < 0.05) {
              w.wait = w.lead ? 0.4 + Math.random() : 1 + Math.random() * 2.5
              if (w.lead) { w.tx = w.lead.x + (Math.random() - 0.5) * 0.7; w.tz = w.lead.z + 0.3 + Math.random() * 0.4 }
              else { w.tx = -4.4 + Math.random() * 1.8; w.tz = -3.9 + Math.random() * 2.2 }
            } else {
              const st = Math.min(dd, w.speed * dt)
              w.x += dx / dd * st; w.z += dz / dd * st
              w.c.obj.rotation.set(0, Math.atan2(dx, dz), 0)
            }
          }
          w.c.obj.position.set(w.x, w.wait > 0 ? 0 : Math.abs(Math.sin(me.simT * 11)) * 0.025, w.z)
          me.kit.blink(w.c, dt)
        }
        // La caméra : le cadre de base, un peu plus près quand on compte ; à
        // la fin, elle recule et suit le tracteur qui s'en va
        cam.wantPos.copy(cam.basePos)
        cam.wantLook.copy(cam.baseLook)
        if (me.outroT >= 0) {
          me.outroT += dt
          const t = me.outroT
          const v = Math.min(2.6, t * 1.5)
          tractor.g.position.x += v * dt
          for (const wh of tractor.wheels) wh.rotation.z -= v * dt / 0.3
          cam.wantPos.add(new T.Vector3(0.6, 1.2, 1.6))
          cam.wantLook.x += Math.min(1.5, (tractor.g.position.x - me.tractorX) * 0.3)
        } else if (me.R && (me.counting || me.lock)) {
          // Un peu plus près du carré qu'on compte, sans perdre le champ
          const fx = X0 + me.C * P / 2, fz = Z0 - me.R * P / 2
          cam.wantLook.lerp(new T.Vector3(fx, 0, fz), 0.22)
          cam.wantPos.copy(cam.wantLook).add(cam.basePos.clone().sub(cam.baseLook).multiplyScalar(0.9))
        }
        const k = 1 - Math.pow(0.04, dt)
        cam.pos.lerp(cam.wantPos, k)
        cam.look.lerp(cam.wantLook, k)
        stage.camera.position.copy(cam.pos)
        stage.camera.position.x += Math.sin(me.simT * 0.25) * 0.05
        stage.camera.lookAt(cam.look)
        me.fx.update(dt)
        placeLabels(me)
      })

      stage.keep({ dispose() {
        ro.disconnect()
        canvas.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        window.removeEventListener('keydown', onKey)
        for (const im of [...kinds.flat(), mounds, stakes]) im.dispose()
        me.fx.dispose()
      } })

      setMode(me, 'harvest')
    })().catch(err => { if (!dead) throw err })

    return () => {
      dead = true
      setMusicIntensity(0)
      if (pg) { pg.stage.dispose(); pg = null }
    }
  }
}
