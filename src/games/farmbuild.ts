import type { GameDef, GameContext } from '../core/types'
import { createStage, loader, type Stage, type T3 } from '../core/three3d'
import { particles, type Particles } from '../core/scene3d'
import { buildFarm, PLATEAU_R, type Farm, type PieceId } from '../core/farm3d'
import { critterKit, type Critter, type CritterKind, type CritterKit } from '../core/critters'
import { critterPortraits, piecePortraits, portraitImg } from '../core/portraits'
import { sfx, preloadSfx, cry, preloadCries, CRY, type AnimalVoice } from '../core/sfx'
import { visible } from '../core/hand'

/* 🏡 LA FERME À CONSTRUIRE (5/10, Créer) — le plateau de Cache-Cache, vide :
   on y glisse, depuis le tiroir du bas, des bâtiments, de la nature, des
   objets et les animaux de la ferme ; on les reprend au doigt pour les
   déplacer, on les touche pour les faire pivoter, on les jette au panier.
   Le doigt trace des chemins de terre et des clôtures ; la gomme les
   efface. Les animaux vivent : ils se promènent et filent vers leur place
   (le canard à la mare, le cochon dans la boue, la poule au poulailler…),
   et répondent de leur vraie voix quand on les touche. Jour ou nuit.
   La ferme se GARDE (une pour la famille, `ferme:construire`) : on la
   retrouve en revenant. Pas de score, pas de fin, pas de niveau. */

type Tab = 'batiments' | 'nature' | 'objets' | 'animaux'
type Tool = 'none' | 'path' | 'fence' | 'erase'

const TABS: Record<Tab, { name: string; items: [string, string][] }> = {
  batiments: { name: 'Bâtiments', items: [['barn', 'Grange'], ['coop', 'Poulailler'], ['kennel', 'Niche'], ['well', 'Puits']] },
  nature: { name: 'Nature', items: [['appleTree', 'Pommier'], ['bush', 'Buisson'], ['haystack', 'Meule'], ['pond', 'Mare'], ['veggie', 'Potager'], ['mud', 'Boue']] },
  objets: { name: 'Objets', items: [['tractor', 'Tracteur'], ['cart', 'Charrette'], ['barrels', 'Tonneaux'], ['woodpile', 'Bois'], ['bales', 'Bottes']] },
  animaux: {
    name: 'Animaux',
    items: [['cow', 'Vache'], ['pig', 'Cochon'], ['sheep', 'Mouton'], ['hen', 'Poule'], ['chick', 'Poussin'], ['duck', 'Canard'],
      ['dog', 'Chien'], ['cat', 'Chat'], ['rabbit', 'Lapin'], ['horse', 'Cheval'], ['goat', 'Chèvre'], ['rooster', 'Coq']]
  }
}
const ANIMALS = TABS.animaux.items.map(i => i[0]) as CritterKind[]
/** La taille de chaque animal à côté de la grange (celles de Cache-Cache). */
const SIZE: Partial<Record<CritterKind, number>> = { cat: 0.6, rabbit: 0.58, hen: 0.6, chick: 0.5, duck: 0.62, rooster: 0.6, dog: 0.72, pig: 0.74, sheep: 0.78, goat: 0.72, cow: 0.88, horse: 0.82 }
/** Sa place préférée, s'il y en a une sur la ferme. */
const HOME: Partial<Record<CritterKind, PieceId[]>> = {
  duck: ['pond'], pig: ['mud'], hen: ['coop'], rooster: ['coop'], chick: ['coop'], dog: ['kennel'], horse: ['barn'], cow: ['barn'],
  rabbit: ['veggie'], cat: ['haystack', 'bales'], goat: ['woodpile'], sheep: ['bales', 'haystack']
}
/** Les pièces dans lesquelles un animal peut entrer (le canard nage, le cochon se roule). */
const INSIDE: Partial<Record<CritterKind, PieceId>> = { duck: 'pond', pig: 'mud' }
const MAX_PIECES = 36, MAX_ANIMALS = 20, MAX_STROKES = 24
const R = PLATEAU_R, EDGE = R - 0.9
const KEY = 'ferme:construire'

interface SavedItem { a?: CritterKind; p?: PieceId; x: number; z: number; ry: number }
interface Saved { v: 1; night: boolean; items: SavedItem[]; paths: number[][]; fences: number[][] }

interface Thing {
  kind: 'piece' | 'animal'
  id: string
  g: import('three').Object3D
  foot: number
  ry: number
  /** L'animal : son personnage, où il va, quand il repart. */
  c?: Critter
  goal?: { x: number; z: number } | null
  wait?: number
  hop?: number
  /** Une pièce : sa lanterne allumée la nuit. */
  lamp?: import('three').PointLight
  /** Les animations : la chute à la pose, le saut. */
  drop: number
  jump: number
}

interface State {
  stage: Stage
  T: T3
  farm: Farm
  kit: CritterKit
  night: boolean
  things: Thing[]
  paths: { pts: number[]; mesh: import('three').Mesh }[]
  fences: { pts: number[]; mesh: import('three').Mesh }[]
  dirt: import('three').MeshStandardMaterial
  wood: import('three').MeshStandardMaterial
  rot: number; vRot: number; zoom: number; tgtZoom: number
  tool: Tool
  tab: Tab
  /** Ce que le doigt tient (une pièce du tiroir, une chose de la ferme). */
  held: { thing: Thing; pid: number; fresh: boolean; over: boolean; dx: number; dz: number } | null
  /** Le trait en cours (chemin, clôture). */
  stroke: { pid: number; pts: number[]; mesh: import('three').Mesh | null; kind: 'path' | 'fence' } | null
  fx: Particles
  ray: import('three').Raycaster
  t: number
  idle: number
  placed: number
}

let me: State | null = null
let ctx: GameContext
let saved: Saved = { v: 1, night: false, items: [], paths: [], fences: [] }

/* ---------- La sauvegarde (une ferme pour la famille) ---------- */

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as Saved | null
    if (s && s.v === 1 && Array.isArray(s.items)) return { v: 1, night: !!s.night, items: s.items, paths: s.paths || [], fences: s.fences || [] }
  } catch { /* une ferme neuve */ }
  return { v: 1, night: false, items: [], paths: [], fences: [] }
}
let saveTimer = 0
function save(s: State) {
  saved = {
    v: 1, night: s.night,
    items: s.things.map(t => ({ ...(t.kind === 'animal' ? { a: t.id as CritterKind } : { p: t.id as PieceId }), x: r2(t.g.position.x), z: r2(t.g.position.z), ry: r2(t.ry) })),
    paths: s.paths.map(p => p.pts), fences: s.fences.map(f => f.pts)
  }
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(saved)) } catch { /* plein : tant pis */ } }, 400)
}
const r2 = (x: number) => Math.round(x * 100) / 100

/* ---------- La ferme : poser, déplacer, jeter ---------- */

function addPiece(s: State, id: PieceId, x: number, z: number, ry: number, drop = true): Thing {
  const p = s.farm.make(id)
  p.g.position.set(x, 0, z)
  p.g.rotation.y = ry
  s.farm.root.add(p.g)
  const t: Thing = { kind: 'piece', id, g: p.g, foot: p.foot, ry, drop: drop ? 1 : 0, jump: 0 }
  if (s.night && p.lamp) {
    const L = new s.T.PointLight(0xFFB45A, 3.2, 5.5, 1.4)
    L.position.set(p.lamp[0], p.lamp[1], p.lamp[2])
    p.g.add(L)
    t.lamp = L
  }
  p.g.traverse(o => { o.userData.thing = t })
  s.things.push(t)
  return t
}

function addAnimal(s: State, kind: CritterKind, x: number, z: number, ry: number, drop = true): Thing {
  const c = s.kit.make(kind, SIZE[kind] ?? 0.7)
  c.obj.position.set(x, 0, z)
  c.obj.rotation.y = ry
  s.farm.root.add(c.obj)
  const t: Thing = { kind: 'animal', id: kind, g: c.obj, foot: 0.3, ry, c, goal: null, wait: 1 + Math.random() * 3, hop: Math.random() * 6, drop: drop ? 1 : 0, jump: 0 }
  c.obj.traverse(o => { o.userData.thing = t })
  s.things.push(t)
  return t
}

function removeThing(s: State, t: Thing) {
  s.things = s.things.filter(x => x !== t)
  s.farm.root.remove(t.g)
  t.g.traverse(o => {
    const m = o as import('three').Mesh
    // Les pièces ont leurs géométries fondues à elles ; les instances et les
    // matériaux peuvent être partagés : on n'y touche pas
    if (m.isMesh && t.kind === 'piece' && !(m as unknown as import('three').InstancedMesh).isInstancedMesh) m.geometry.dispose()
  })
  s.fx.burst(s.farm.root.localToWorld(t.g.position.clone()), { count: 14, color: ['#C9A57A', '#FFFFFF'], speed: 1.4, spread: 1, life: 0.6, size: 0.12 })
  sfx('whoosh', { vol: 0.5 })
  save(s)
}

/** Une place libre pour une pièce de rayon `foot` près de (x, z) : on la
    pousse hors des autres pièces et on la garde sur le plateau. */
function freeSpot(s: State, x: number, z: number, foot: number, self: Thing | null, piece: boolean): { x: number; z: number } {
  for (let k = 0; k < 24; k++) {
    let moved = false
    if (piece) for (const o of s.things) {
      if (o === self || o.kind !== 'piece') continue
      const dx = x - o.g.position.x, dz = z - o.g.position.z
      const d = Math.hypot(dx, dz), need = (foot + o.foot) * 0.82
      if (d < need) {
        const a = d > 1e-3 ? Math.atan2(dz, dx) : Math.random() * Math.PI * 2
        x = o.g.position.x + Math.cos(a) * need; z = o.g.position.z + Math.sin(a) * need
        moved = true
      }
    }
    const r = Math.hypot(x, z), lim = EDGE - foot * 0.6
    if (r > lim) { x *= lim / r; z *= lim / r; moved = true }
    if (!moved) break
  }
  return { x, z }
}

/* ---------- Chemins et clôtures ---------- */

function pathMesh(s: State, pts: number[]): import('three').Mesh {
  const T = s.T
  const pos: number[] = [], idx: number[] = []
  const n = pts.length / 2
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2], z = pts[i * 2 + 1]
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1)
    let tx = pts[b * 2] - pts[a * 2], tz = pts[b * 2 + 1] - pts[a * 2 + 1]
    const l = Math.hypot(tx, tz) || 1
    tx /= l; tz /= l
    const w = 0.4 + Math.sin(i * 0.9) * 0.03
    const y = 0.012 + (i % 3) * 0.0004
    pos.push(x - tz * w, y, z + tx * w, x + tz * w, y, z - tx * w)
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2) }
  }
  const g = new T.BufferGeometry()
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  const m = new T.Mesh(g, s.dirt)
  m.receiveShadow = true
  m.userData.stroke = 'path'
  return m
}

async function fenceMesh(s: State, pts: number[]): Promise<import('three').Mesh> {
  const T = s.T
  const U = await import('three/examples/jsm/utils/BufferGeometryUtils.js')
  const parts: import('three').BufferGeometry[] = []
  const n = pts.length / 2
  // Un piquet tous les 55 cm le long du trait, deux lisses entre deux piquets
  const posts: [number, number][] = [[pts[0], pts[1]]]
  let acc = 0
  for (let i = 1; i < n; i++) {
    const [px, pz] = [pts[i * 2 - 2], pts[i * 2 - 1]], [qx, qz] = [pts[i * 2], pts[i * 2 + 1]]
    acc += Math.hypot(qx - px, qz - pz)
    if (acc >= 0.55 || i === n - 1) { posts.push([qx, qz]); acc = 0 }
  }
  for (const [x, z] of posts) {
    const b = new T.BoxGeometry(0.08, 0.56, 0.08)
    b.translate(x, 0.28, z)
    parts.push(b)
  }
  for (let i = 1; i < posts.length; i++) {
    const [ax, az] = posts[i - 1], [bx, bz] = posts[i]
    const len = Math.hypot(bx - ax, bz - az)
    if (len < 0.05) continue
    for (const y of [0.22, 0.44]) {
      const r = new T.BoxGeometry(len, 0.05, 0.035)
      r.rotateY(-Math.atan2(bz - az, bx - ax))
      r.translate((ax + bx) / 2, y, (az + bz) / 2)
      parts.push(r)
    }
  }
  const g = U.mergeGeometries(parts)!
  parts.forEach(p => p.dispose())
  const m = new T.Mesh(g, s.wood)
  m.castShadow = true
  m.receiveShadow = true
  m.userData.stroke = 'fence'
  return m
}

/** La gomme : ce qui passe sous le doigt disparaît (le trait entier). */
function eraseAt(s: State, x: number, z: number) {
  const near = (pts: number[]) => { for (let i = 0; i < pts.length; i += 2) if (Math.hypot(pts[i] - x, pts[i + 1] - z) < 0.45) return true; return false }
  for (const list of [s.paths, s.fences]) {
    const hit = list.find(p => near(p.pts))
    if (!hit) continue
    list.splice(list.indexOf(hit), 1)
    s.farm.root.remove(hit.mesh)
    hit.mesh.geometry.dispose()
    s.fx.burst(s.farm.root.localToWorld(new s.T.Vector3(x, 0.1, z)), { count: 10, color: ['#C9A57A', '#8A5A34'], speed: 1, spread: 1, life: 0.5, size: 0.1 })
    sfx('cloth', { vol: 0.5 })
    save(s)
    return
  }
}

/* ---------- Le doigt sur la scène ---------- */

/** Le point du plateau sous le doigt, dans le repère de la ferme (ou null). */
function ground(s: State, cx: number, cy: number): { x: number; z: number } | null {
  const r = s.stage.renderer.domElement.getBoundingClientRect()
  const p = new s.T.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1)
  s.ray.setFromCamera(p, s.stage.camera)
  const plane = new s.T.Plane(new s.T.Vector3(0, 1, 0), 0)
  const hit = s.ray.ray.intersectPlane(plane, new s.T.Vector3())
  if (!hit) return null
  s.farm.root.worldToLocal(hit)
  return { x: hit.x, z: hit.z }
}

function thingAt(s: State, cx: number, cy: number): Thing | null {
  const r = s.stage.renderer.domElement.getBoundingClientRect()
  const p = new s.T.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1)
  s.ray.setFromCamera(p, s.stage.camera)
  // Les animaux d'abord (plus petits, souvent devant une pièce)
  const animals = s.things.filter(t => t.kind === 'animal').map(t => t.g)
  const a = s.ray.intersectObjects(animals, true)[0]
  if (a) return a.object.userData.thing as Thing
  const h = s.ray.intersectObjects(s.things.filter(t => t.kind === 'piece').map(t => t.g), true)[0]
  return h ? h.object.userData.thing as Thing : null
}

const overTrash = (cx: number, cy: number) => {
  const b = ctx.root.querySelector('#fbTrash')?.getBoundingClientRect()
  return !!b && cx > b.left - 14 && cx < b.right + 14 && cy > b.top - 14 && cy < b.bottom + 14
}
const overTray = (cy: number) => {
  const b = ctx.root.querySelector('#fbTray')?.getBoundingClientRect()
  return !!b && cy > b.top
}

/** On prend une chose de la ferme (ou une neuve du tiroir) au doigt. */
function grab(s: State, t: Thing, pid: number, fresh: boolean, cx: number, cy: number) {
  const g = ground(s, cx, cy)
  // Une neuve (du tiroir) se tient pile sous le doigt ; une de la ferme garde l'écart où on l'a prise
  const off = !fresh && g
  s.held = { thing: t, pid, fresh, over: !!g, dx: off ? t.g.position.x - g.x : 0, dz: off ? t.g.position.z - g.z : 0 }
  if (t.c) t.goal = null
  ctx.root.querySelector('.fb-wrap')?.classList.add('holding')
}

function moveHeld(s: State, cx: number, cy: number) {
  const h = s.held
  if (!h) return
  const g = ground(s, cx, cy)
  const inTray = overTray(cy)
  h.over = !!g && !inTray
  h.thing.g.visible = h.over || !h.fresh
  if (!g) return
  const x = g.x + h.dx, z = g.z + h.dz
  const r = Math.hypot(x, z), lim = EDGE - h.thing.foot * 0.6
  const k = r > lim ? lim / r : 1
  h.thing.g.position.set(x * k, 0.35, z * k)
  ctx.root.querySelector('#fbTrash')?.classList.toggle('hot', overTrash(cx, cy))
}

function dropHeld(s: State, cx: number, cy: number) {
  const h = s.held
  if (!h) return
  s.held = null
  ctx.root.querySelector('.fb-wrap')?.classList.remove('holding')
  ctx.root.querySelector('#fbTrash')?.classList.remove('hot')
  const t = h.thing
  if (overTrash(cx, cy) || (h.fresh && !h.over)) { removeThing(s, t); return }
  const spot = freeSpot(s, t.g.position.x, t.g.position.z, t.foot, t, t.kind === 'piece')
  t.g.position.set(spot.x, 0, spot.z)
  t.drop = 0.5
  t.g.visible = true
  landed(s, t)
}

/** Posé : un bruit, un nuage de poussière ; un animal dit bonjour. */
function landed(s: State, t: Thing) {
  s.idle = 0
  const w = s.farm.root.localToWorld(t.g.position.clone())
  if (t.kind === 'piece') {
    sfx(t.id === 'pond' || t.id === 'mud' ? 'pluck' : 'drop', { vol: 0.7 })
    s.fx.burst(w, { count: 16, color: ['#C9A57A', '#E8D8B8'], speed: 1.6, spread: 1.4, life: 0.7, size: 0.14, gravity: -2 })
  } else {
    const v = CRY[t.id as CritterKind]
    if (!v || !cry(v, { max: 1, vol: 0.6 })) sfx('pluck', { vol: 0.6 })
    t.jump = 0.5
  }
  s.placed++
  save(s)
}

/** Une neuve, du tiroir : là où le doigt la lâche, ou devant si on l'a juste touchée. */
function fromDrawer(s: State, id: string): Thing | null {
  const animal = ANIMALS.includes(id as CritterKind)
  const n = s.things.filter(t => (t.kind === 'animal') === animal).length
  if (n >= (animal ? MAX_ANIMALS : MAX_PIECES)) {
    const b = ctx.root.querySelector<HTMLElement>(`.fb-item[data-id="${id}"]`)
    b?.classList.remove('nope'); void b?.offsetWidth; b?.classList.add('nope')
    sfx('error', { vol: 0.4 })
    return null
  }
  // Sa porte (son museau) vers nous, quel que soit le tour de la ferme
  const face = -s.rot
  return animal ? addAnimal(s, id as CritterKind, 0, 0, face, true) : addPiece(s, id as PieceId, 0, 0, face, true)
}

/* ---------- La vie des animaux ---------- */

function pickGoal(s: State, t: Thing) {
  const kind = t.id as CritterKind
  const homes = s.things.filter(o => o.kind === 'piece' && HOME[kind]?.includes(o.id as PieceId))
  if (homes.length && Math.random() < 0.6) {
    const h = homes[Math.floor(Math.random() * homes.length)]
    if (INSIDE[kind] === h.id) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * h.foot * 0.45
      t.goal = { x: h.g.position.x + Math.cos(a) * d, z: h.g.position.z + Math.sin(a) * d }
    } else {
      // Devant sa place (+z d'une pièce regarde ce qu'elle a devant elle)
      const d = h.foot * 0.95 + 0.3 + Math.random() * 0.4, sp = (Math.random() - 0.5) * 0.8
      t.goal = { x: h.g.position.x + Math.sin(h.ry) * d + Math.cos(h.ry) * sp, z: h.g.position.z + Math.cos(h.ry) * d - Math.sin(h.ry) * sp }
    }
    return
  }
  const a = Math.random() * Math.PI * 2, d = 0.8 + Math.random() * 2.2
  t.goal = { x: t.g.position.x + Math.cos(a) * d, z: t.g.position.z + Math.sin(a) * d }
}

function stepAnimal(s: State, t: Thing, dt: number) {
  const o = t.g, kind = t.id as CritterKind
  if (s.held?.thing === t) { o.rotation.z = Math.sin(s.t * 14) * 0.15; return }
  o.rotation.z = 0
  if (!t.goal) {
    t.wait = (t.wait ?? 0) - dt
    if (t.wait <= 0) pickGoal(s, t)
  } else {
    const dx = t.goal.x - o.position.x, dz = t.goal.z - o.position.z
    const d = Math.hypot(dx, dz)
    if (d < 0.08) { t.goal = null; t.wait = 2 + Math.random() * 5 }
    else {
      const sp = Math.min(d, (kind === 'chick' || kind === 'rabbit' ? 0.9 : 0.6) * dt)
      const want = Math.atan2(dx, dz)
      let da = want - t.ry
      da = Math.atan2(Math.sin(da), Math.cos(da))
      t.ry += da * Math.min(1, dt * 6)
      o.position.x += dx / d * sp; o.position.z += dz / d * sp
      t.hop = (t.hop ?? 0) + dt * 11
    }
  }
  // Il contourne les pièces (sauf celle où il a le droit d'entrer) et reste sur le plateau
  for (const p of s.things) {
    if (p.kind !== 'piece' || INSIDE[kind] === p.id || p.id === 'mud' || p.id === 'veggie') continue
    const dx = o.position.x - p.g.position.x, dz = o.position.z - p.g.position.z
    const d = Math.hypot(dx, dz), need = p.foot * 0.8 + 0.2
    if (d < need && d > 1e-3) { o.position.x = p.g.position.x + dx / d * need; o.position.z = p.g.position.z + dz / d * need }
  }
  const r = Math.hypot(o.position.x, o.position.z)
  if (r > EDGE) { o.position.x *= EDGE / r; o.position.z *= EDGE / r; t.goal = null }
  // Le canard flotte sur la mare
  const swim = kind === 'duck' && s.things.some(p => p.id === 'pond' && Math.hypot(o.position.x - p.g.position.x, o.position.z - p.g.position.z) < p.foot * 0.6)
  const bob = t.goal ? Math.abs(Math.sin(t.hop ?? 0)) * 0.05 : 0
  const jump = t.jump > 0 ? Math.sin((1 - t.jump / 0.5) * Math.PI) * 0.35 : 0
  if (t.jump > 0) t.jump = Math.max(0, t.jump - dt)
  if (t.drop <= 0) o.position.y = (swim ? -0.06 + Math.sin(s.t * 2) * 0.01 : 0) + bob + jump
  o.rotation.y = t.ry
}

/* ---------- Chaque image ---------- */

function frame(s: State, dt: number) {
  s.t += dt
  s.idle += dt
  if (!s.held && !s.stroke) {
    s.rot += s.vRot * dt
    s.vRot *= Math.pow(0.004, dt)
    if (Math.abs(s.vRot) < 0.01) s.vRot = 0
  }
  s.farm.root.rotation.y = s.rot
  s.zoom += (s.tgtZoom - s.zoom) * Math.min(1, dt * 8)
  const cam = s.stage.camera
  cam.position.set(0, 10.2 / s.zoom, 12.4 / s.zoom)
  cam.lookAt(0, 0, 0.6 / s.zoom)
  for (const t of s.things) {
    // La chute à la pose : elle tombe et s'écrase un peu en touchant l'herbe
    if (t.drop > 0) {
      t.drop = Math.max(0, t.drop - dt * 2.2)
      const k = t.drop
      t.g.position.y = s.held?.thing === t ? 0.35 : k * k * 1.6
      const sq = k < 0.15 ? 1 - Math.sin(k / 0.15 * Math.PI) * 0.12 : 1
      t.g.scale.set(2 - sq, sq, 2 - sq)
    } else if (s.held?.thing !== t) t.g.scale.set(1, 1, 1)
    // Le quart de tour d'une pièce touchée : elle y va en douceur
    if (t.kind === 'piece') t.g.rotation.y += (t.ry - t.g.rotation.y) * Math.min(1, dt * 14)
    if (t.c) { s.kit.blink(t.c, dt); stepAnimal(s, t, dt) }
  }
  s.farm.step(dt, s.t)
  s.fx.update(dt)
}

/* ---------- Monter la scène (le jour, ou la nuit) ---------- */

async function build(c: GameContext, arena: HTMLElement, night: boolean): Promise<State | null> {
  const stage = await createStage(arena, night ? {
    sky: '#0A1230', fov: 38, cam: [0, 10.2, 12.4], target: [0, 0, 0.6],
    hemi: ['#4A5A9A', '#1A1E2A', 0.9], sun: { pos: [-6, 14, -4], color: '#8EA6FF', intensity: 0.4, area: 10, far: 45 }, fill: 0.3, exposure: 0.92
  } : {
    sky: '#9ED4F2', fov: 38, cam: [0, 10.2, 12.4], target: [0, 0, 0.6],
    hemi: ['#DCEFFF', '#5E8A44', 1.0], sun: { pos: [6.5, 14, 7], color: '#FFF0D2', intensity: 2.3, area: 10, far: 45 }, fill: 0.45, exposure: 1.0
  })
  if (!c.alive()) { stage.dispose(); return null }
  const T = stage.T
  const farm = await buildFarm(stage, { night, empty: true })
  if (!c.alive() || !stage.alive) { stage.dispose(); return null }
  const s: State = {
    stage, T, farm, kit: critterKit(T), night, things: [], paths: [], fences: [],
    dirt: stage.keep(new T.MeshStandardMaterial({ color: night ? 0x4A3C30 : 0xA8865E, roughness: 1 })),
    wood: stage.keep(new T.MeshStandardMaterial({ color: night ? 0x3E2A1A : 0x6E4A2C, roughness: 0.8 })),
    rot: -0.15, vRot: 0, zoom: 1, tgtZoom: 1, tool: 'none', tab: 'batiments', held: null, stroke: null,
    fx: particles(stage, 300), ray: new T.Raycaster(), t: 0, idle: 0, placed: 0
  }
  // La ferme gardée revient telle quelle
  for (const it of saved.items) {
    if (it.a && ANIMALS.includes(it.a)) addAnimal(s, it.a, it.x, it.z, it.ry, false)
    else if (it.p && TABS.batiments.items.concat(TABS.nature.items, TABS.objets.items).some(i => i[0] === it.p)) addPiece(s, it.p, it.x, it.z, it.ry, false)
  }
  for (const pts of saved.paths) if (pts.length >= 4) { const m = pathMesh(s, pts); farm.root.add(m); s.paths.push({ pts, mesh: m }) }
  for (const pts of saved.fences) if (pts.length >= 4) { const m = await fenceMesh(s, pts); farm.root.add(m); s.fences.push({ pts, mesh: m }) }
  if (!c.alive() || !stage.alive) { stage.dispose(); return null }
  return s
}

function disposeState(s: State) {
  for (const p of [...s.paths, ...s.fences]) p.mesh.geometry.dispose()
  s.kit.dispose()
  try { s.stage.dispose() } catch { /* déjà démonté */ }
}

/* ---------- Les icônes ---------- */

const svg = (inner: string, sz = 32) => `<svg viewBox="0 0 48 48" width="${sz}" height="${sz}">${inner}</svg>`
const TAB_ICONS: Record<Tab, string> = {
  batiments: svg('<path d="M8 22 24 9l16 13v18H8z" fill="#C2483A"/><rect x="19" y="27" width="10" height="13" fill="#7A2A20"/><path d="M5 23 24 7l19 16" fill="none" stroke="#5A2A1C" stroke-width="3" stroke-linejoin="round"/>'),
  nature: svg('<rect x="21" y="26" width="6" height="15" rx="2" fill="#8A5A34"/><circle cx="24" cy="19" r="12" fill="#5EAA4A"/><circle cx="19" cy="17" r="2.4" fill="#E04848"/><circle cx="28" cy="22" r="2.4" fill="#E04848"/>'),
  objets: svg('<rect x="6" y="20" width="24" height="12" rx="3" fill="#D24A3A"/><rect x="20" y="12" width="12" height="12" rx="2" fill="#E8B74A"/><circle cx="13" cy="34" r="6" fill="#3A3028"/><circle cx="34" cy="33" r="8" fill="#3A3028"/><circle cx="34" cy="33" r="3" fill="#9A8A70"/>'),
  animaux: svg('<circle cx="24" cy="25" r="13" fill="#F2B8C2"/><ellipse cx="24" cy="29" rx="6" ry="4.5" fill="#D4788A"/><circle cx="18.5" cy="21" r="2" fill="#3A302A"/><circle cx="29.5" cy="21" r="2" fill="#3A302A"/><path d="M13 15l3-7 6 5zM35 15l-3-7-6 5z" fill="#F2B8C2"/>')
}
const TOOL_ICONS = {
  path: svg('<path d="M14 42c2-10 12-12 10-20s6-12 10-14" fill="none" stroke="#A8865E" stroke-width="9" stroke-linecap="round"/><path d="M14 42c2-10 12-12 10-20s6-12 10-14" fill="none" stroke="#C9A57A" stroke-width="3" stroke-dasharray="3 5" stroke-linecap="round"/>'),
  fence: svg('<g fill="#8A5A34"><rect x="8" y="12" width="5" height="28" rx="1"/><rect x="21.5" y="12" width="5" height="28" rx="1"/><rect x="35" y="12" width="5" height="28" rx="1"/><rect x="6" y="18" width="36" height="4" rx="1"/><rect x="6" y="29" width="36" height="4" rx="1"/></g>'),
  erase: svg('<path d="M10 30 26 12l12 11-15 17H14z" fill="#FF8FAB"/><path d="M10 30l8-9 12 11-6.5 8H14z" fill="#FFD3DE"/><path d="M8 40h32" stroke="#45362A" stroke-width="3" stroke-linecap="round"/>'),
  trash: svg('<path d="M10 18h28l-3 22H13z" fill="#C99A5F"/><path d="M10 18h28" stroke="#9C7340" stroke-width="3"/><path d="M16 18c0-7 4-11 8-11s8 4 8 11" fill="none" stroke="#9C7340" stroke-width="3"/><path d="M17 24v12M24 24v12M31 24v12" stroke="#9C7340" stroke-width="2"/>'),
  day: svg('<circle cx="24" cy="24" r="9" fill="#FFC94D"/><g stroke="#FFC94D" stroke-width="3.5" stroke-linecap="round"><path d="M24 6v5M24 37v5M6 24h5M37 24h5M11 11l3.5 3.5M33.5 33.5 37 37M11 37l3.5-3.5M33.5 14.5 37 11"/></g>', 34),
  night: svg('<path d="M30 8a16 16 0 1 0 10 26A13 13 0 0 1 30 8z" fill="#8EA6FF"/><circle cx="14" cy="12" r="1.6" fill="#FFF6D0"/><circle cx="38" cy="14" r="1.3" fill="#FFF6D0"/>', 34)
}

export const farmbuild: GameDef = {
  id: 'farmbuild', name: 'La Ferme à construire', icon: '🏡', sq: 'sq-mint', cat: 'creatif', noTier: true,
  subtitle: 'Construis ta ferme et fais-y vivre les animaux',
  // La main : glisser une pièce du tiroir jusque sur la ferme
  hand: root => {
    if (!me || me.held || me.stroke) return null
    const items = visible(root, '.fb-item')
    if (!items.length) return null
    return { drag: [items[Math.floor(Math.random() * Math.min(3, items.length))], { fx: 0.5, fy: 0.42 }], ghost: true }
  },
  mount(c) {
    ctx = c
    let dead = false
    saved = load()
    c.root.innerHTML = `
      <div class="arena g3-arena fb-wrap" id="fbWrap">
        <span class="tool-item fb-dn"><button class="sn-tool" id="fbNight" aria-label="Jour ou nuit"></button><i class="tool-cap" id="fbNightCap"></i></span>
        <div class="fb-tray" id="fbTray">
          <div class="fb-tabs">${(Object.keys(TABS) as Tab[]).map(k => `<span class="tool-item"><button class="sn-tool fb-tab${k === 'batiments' ? ' sel' : ''}" data-tab="${k}" aria-label="${TABS[k].name}">${TAB_ICONS[k]}</button><i class="tool-cap">${TABS[k].name}</i></span>`).join('')}</div>
          <i class="fb-sep"></i>
          <div class="fb-items" id="fbItems"></div>
          <i class="fb-sep"></i>
          <div class="fb-tools">
            <span class="tool-item"><button class="sn-tool fb-tool" data-tool="path" aria-label="Chemin">${TOOL_ICONS.path}</button><i class="tool-cap">Chemin</i></span>
            <span class="tool-item"><button class="sn-tool fb-tool" data-tool="fence" aria-label="Clôture">${TOOL_ICONS.fence}</button><i class="tool-cap">Clôture</i></span>
            <span class="tool-item"><button class="sn-tool fb-tool" data-tool="erase" aria-label="Gomme">${TOOL_ICONS.erase}</button><i class="tool-cap">Gomme</i></span>
            <span class="tool-item"><button class="sn-tool fb-trash" id="fbTrash" aria-label="Panier">${TOOL_ICONS.trash}</button><i class="tool-cap">Panier</i></span>
          </div>
        </div>
      </div>`
    const arena = c.root.querySelector<HTMLElement>('#fbWrap')!
    preloadSfx(['drop', 'pluck', 'whoosh', 'click', 'cloth', 'error', 'switch'])
    preloadCries(ANIMALS.map(k => CRY[k]).filter((v): v is AnimalVoice => !!v))
    const pics: Record<string, string> = {}
    const showTab = (tab: Tab) => {
      if (me) me.tab = tab
      c.root.querySelectorAll<HTMLElement>('.fb-tab').forEach(b => b.classList.toggle('sel', b.dataset.tab === tab))
      const box = c.root.querySelector<HTMLElement>('#fbItems')!
      // Tant que les vignettes se fabriquent (la toute première fois), l'icône de l'onglet
      box.innerHTML = TABS[tab].items.map(([id, n]) => `<span class="tool-item"><button class="sn-tool fb-item" data-id="${id}" aria-label="${n}">${pics[id] ? portraitImg(pics[id], 80) : TAB_ICONS[tab]}</button><i class="tool-cap">${n}</i></span>`).join('')
      box.scrollLeft = 0
    }
    const setNightBtn = (night: boolean) => {
      c.root.querySelector('#fbNight')!.innerHTML = night ? TOOL_ICONS.day : TOOL_ICONS.night
      c.root.querySelector('#fbNightCap')!.textContent = night ? 'Jour' : 'Nuit'
    }
    setNightBtn(saved.night)
    showTab('batiments')
    // Les vignettes (rendues une fois, gardées)
    const ids = (Object.values(TABS).flatMap(t => t.items.map(i => i[0])))
    Promise.all([
      piecePortraits(ids.filter(i => !ANIMALS.includes(i as CritterKind)) as PieceId[], 96),
      critterPortraits(ANIMALS, 96)
    ]).then(([a, b]) => {
      if (dead) return
      Object.assign(pics, a, b)
      showTab(me?.tab ?? 'batiments')
    }).catch(() => { /* les boutons restent ronds */ })

    let hideLoader = loader(arena, 'farmbuild')
    let building = false
    const start = async (night: boolean) => {
      building = true
      const s = await build(c, arena, night).catch(() => null)
      building = false
      hideLoader()
      if (!s || dead) { if (s) disposeState(s); if (!s && !dead) c.toast('La 3D n\'est pas disponible ici'); return }
      me = s
      s.tab = (c.root.querySelector<HTMLElement>('.fb-tab.sel')?.dataset.tab as Tab) || 'batiments'
      s.stage.start(dt => { if (me === s) frame(s, dt) })
    }
    start(saved.night)

    /* Le doigt : par pointerId (deux doigts = pincer) ; le glissé s'écoute sur window */
    const pts = new Map<number, { x: number; y: number }>()
    let tap: { x: number; y: number; t: number; moved: number; thing: Thing | null } | null = null
    let pinch0 = 0, zoom0 = 1, lastT = 0
    let drawerDown: { id: string; pid: number; x: number; y: number; started: boolean } | null = null

    const onDown = (e: PointerEvent) => {
      const s = me
      if (!s) return
      const t = e.target as HTMLElement
      // Une pièce du tiroir : on la prendra si le doigt monte vers la ferme
      const item = t.closest<HTMLElement>('.fb-item')
      if (item?.dataset.id) { drawerDown = { id: item.dataset.id, pid: e.pointerId, x: e.clientX, y: e.clientY, started: false }; return }
      if (t !== s.stage.renderer.domElement) return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      s.vRot = 0
      lastT = performance.now()
      s.idle = 0
      if (pts.size === 2) {
        // Un second doigt : on pince — le trait ou la chose tenue s'arrêtent
        const [a, b] = [...pts.values()]
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = s.tgtZoom
        if (s.stroke) { if (s.stroke.mesh) { s.farm.root.remove(s.stroke.mesh); s.stroke.mesh.geometry.dispose() } s.stroke = null }
        if (s.held && !s.held.fresh) dropHeld(s, e.clientX, e.clientY)
        tap = null
        return
      }
      if (s.tool === 'path' || s.tool === 'fence') {
        const g = ground(s, e.clientX, e.clientY)
        if (g && Math.hypot(g.x, g.z) < EDGE) { s.stroke = { pid: e.pointerId, pts: [g.x, g.z], mesh: null, kind: s.tool }; return }
      }
      if (s.tool === 'erase') { const g = ground(s, e.clientX, e.clientY); if (g) eraseAt(s, g.x, g.z); tap = { x: e.clientX, y: e.clientY, t: lastT, moved: 0, thing: null }; return }
      tap = { x: e.clientX, y: e.clientY, t: lastT, moved: 0, thing: thingAt(s, e.clientX, e.clientY) }
    }

    const onMove = (e: PointerEvent) => {
      const s = me
      if (!s) return
      // Du tiroir vers la ferme : la pièce naît sous le doigt
      if (drawerDown && e.pointerId === drawerDown.pid) {
        if (!drawerDown.started && (drawerDown.y - e.clientY > 14 || !overTray(e.clientY))) {
          drawerDown.started = true
          const t = fromDrawer(s, drawerDown.id)
          if (t) { grab(s, t, e.pointerId, true, e.clientX, e.clientY); t.g.visible = false }
        }
        if (drawerDown.started) moveHeld(s, e.clientX, e.clientY)
        return
      }
      const p = pts.get(e.pointerId)
      if (!p) return
      const dx = e.clientX - p.x, dy = e.clientY - p.y
      p.x = e.clientX; p.y = e.clientY
      if (tap) tap.moved += Math.abs(dx) + Math.abs(dy)
      if (pts.size === 2 && pinch0 > 0) {
        const [a, b] = [...pts.values()]
        s.tgtZoom = Math.max(0.8, Math.min(1.6, zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch0))
        return
      }
      if (s.stroke && s.stroke.pid === e.pointerId) {
        const g = ground(s, e.clientX, e.clientY)
        if (!g || Math.hypot(g.x, g.z) > EDGE) return
        const L = s.stroke.pts
        if (Math.hypot(g.x - L[L.length - 2], g.z - L[L.length - 1]) < 0.22 || L.length > 400) return
        L.push(g.x, g.z)
        if (s.stroke.kind === 'path' && L.length >= 4) {
          if (s.stroke.mesh) { s.farm.root.remove(s.stroke.mesh); s.stroke.mesh.geometry.dispose() }
          s.stroke.mesh = pathMesh(s, L)
          s.farm.root.add(s.stroke.mesh)
        } else if (s.stroke.kind === 'fence') {
          // Un petit piquet suit le doigt pendant qu'on trace
          s.fx.burst(s.farm.root.localToWorld(new s.T.Vector3(g.x, 0.3, g.z)), { count: 1, color: '#8A5A34', speed: 0.1, spread: 0.1, life: 1.2, size: 0.16, gravity: 0 })
        }
        return
      }
      if (s.tool === 'erase') { const g = ground(s, e.clientX, e.clientY); if (g) eraseAt(s, g.x, g.z); return }
      // Une chose de la ferme qu'on emmène
      if (s.held && s.held.pid === e.pointerId) { moveHeld(s, e.clientX, e.clientY); return }
      if (tap?.thing && tap.moved > 10 && !s.held) { grab(s, tap.thing, e.pointerId, false, e.clientX, e.clientY); moveHeld(s, e.clientX, e.clientY); return }
      if (tap?.thing) return
      // Sinon, la ferme tourne (avec son élan)
      const now = performance.now()
      const dts = Math.max(8, now - lastT) / 1000
      lastT = now
      const k = 1 / Math.max(120, s.stage.renderer.domElement.clientWidth * 0.36)
      s.rot += dx * k
      s.vRot = Math.max(-3.2, Math.min(3.2, s.vRot * 0.5 + dx * k / dts * 0.5))
    }

    const onUp = (e: PointerEvent) => {
      const s = me
      if (!s) { pts.delete(e.pointerId); drawerDown = null; return }
      if (drawerDown && e.pointerId === drawerDown.pid) {
        const d = drawerDown
        drawerDown = null
        if (d.started) { if (s.held) dropHeld(s, e.clientX, e.clientY) }
        else if (e.type !== 'pointercancel' && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 12) {
          // Juste touchée : elle tombe sur la ferme, devant, à une place libre
          const t = fromDrawer(s, d.id)
          if (t) {
            const a = Math.random() * Math.PI * 2, r = Math.random() * 2.2
            const fwd = { x: Math.sin(-s.rot) * 1.2, z: Math.cos(-s.rot) * 1.2 }
            const spot = freeSpot(s, fwd.x + Math.cos(a) * r, fwd.z + Math.sin(a) * r, t.foot, t, t.kind === 'piece')
            t.g.position.set(spot.x, 0, spot.z)
            landed(s, t)
          }
        }
        return
      }
      if (!pts.has(e.pointerId)) return
      pts.delete(e.pointerId)
      if (pts.size < 2) pinch0 = 0
      if (s.stroke && s.stroke.pid === e.pointerId) {
        const st = s.stroke
        s.stroke = null
        if (st.pts.length >= 6) finishStroke(s, st)
        else if (st.mesh) { s.farm.root.remove(st.mesh); st.mesh.geometry.dispose() }
        return
      }
      if (s.held && s.held.pid === e.pointerId) { dropHeld(s, e.clientX, e.clientY); tap = null; return }
      if (performance.now() - lastT > 90) s.vRot = 0
      const t = tap
      tap = null
      if (e.type === 'pointercancel' || !t || t.moved > 12 || performance.now() - t.t > 600 || !t.thing) return
      // Un toucher : la pièce pivote d'un quart de tour, l'animal répond
      const th = t.thing
      s.vRot = 0
      if (th.kind === 'piece') { th.ry += Math.PI / 2; sfx('click', { vol: 0.6 }); save(s) }
      else {
        th.jump = 0.5
        const v = CRY[th.id as CritterKind]
        if (!v || !cry(v, { max: 1.2, vol: 0.8 })) sfx('pluck')
      }
    }

    const finishStroke = async (s: State, st: NonNullable<State['stroke']>) => {
      const list = st.kind === 'path' ? s.paths : s.fences
      if (s.paths.length + s.fences.length >= MAX_STROKES) {
        const old = (s.paths.length >= s.fences.length ? s.paths : s.fences).shift()
        if (old) { s.farm.root.remove(old.mesh); old.mesh.geometry.dispose() }
      }
      const pts2 = st.pts.map(r2)
      let mesh = st.mesh
      if (st.kind === 'fence') mesh = await fenceMesh(s, pts2)
      else if (mesh) { s.farm.root.remove(mesh); mesh.geometry.dispose(); mesh = pathMesh(s, pts2) }
      if (me !== s || !mesh) { mesh?.geometry.dispose(); return }
      s.farm.root.add(mesh)
      list.push({ pts: pts2, mesh })
      sfx(st.kind === 'fence' ? 'drop' : 'cloth', { vol: 0.6 })
      save(s)
    }

    const onWheel = (e: WheelEvent) => {
      if (!me || e.target !== me.stage.renderer.domElement) return
      e.preventDefault()
      me.tgtZoom = Math.max(0.8, Math.min(1.6, me.tgtZoom * Math.exp(-e.deltaY * 0.0012)))
    }

    // Les boutons : onglets, outils, jour / nuit
    const onClick = async (e: MouseEvent) => {
      const s = me
      const t = e.target as HTMLElement
      const tab = t.closest<HTMLElement>('.fb-tab')
      if (tab?.dataset.tab) { showTab(tab.dataset.tab as Tab); sfx('select', { vol: 0.5 }); return }
      const tool = t.closest<HTMLElement>('.fb-tool')
      if (tool?.dataset.tool && s) {
        const want = tool.dataset.tool as Tool
        s.tool = s.tool === want ? 'none' : want
        c.root.querySelectorAll<HTMLElement>('.fb-tool').forEach(b => b.classList.toggle('sel', b.dataset.tool === s.tool))
        c.root.querySelector('.fb-wrap')?.setAttribute('data-tool', s.tool)
        sfx('switch', { vol: 0.5 })
        return
      }
      if (t.closest('#fbNight') && s && !building) {
        const night = !s.night
        save(s)
        saved.night = night
        try { localStorage.setItem(KEY, JSON.stringify(saved)) } catch { /* rien */ }
        sfx('switch', { vol: 0.6 })
        setNightBtn(night)
        me = null
        disposeState(s)
        hideLoader = loader(arena, 'farmbuild')
        start(night)
      }
    }
    c.root.addEventListener('click', onClick)
    c.root.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    c.root.addEventListener('wheel', onWheel, { passive: false })

    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      const screenOf = (t: Thing) => {
        const s = me!
        const v = s.farm.root.localToWorld(t.g.position.clone().setY(0.3)).project(s.stage.camera)
        const r = s.stage.renderer.domElement.getBoundingClientRect()
        return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }
      }
      ;(window as unknown as { __fb: unknown }).__fb = {
        get ready() { return !!me && !building },
        get night() { return me?.night },
        get tool() { return me?.tool },
        get pieces() { return me?.things.filter(t => t.kind === 'piece').map(t => ({ id: t.id, x: t.g.position.x, z: t.g.position.z, ry: t.ry })) ?? [] },
        get animals() { return me?.things.filter(t => t.kind === 'animal').map(t => ({ id: t.id, x: t.g.position.x, z: t.g.position.z })) ?? [] },
        get paths() { return me?.paths.length ?? 0 },
        get fences() { return me?.fences.length ?? 0 },
        /** Où toucher la chose n° i (pièces puis animaux, dans l'ordre de pose). */
        at(i: number) { const t = me?.things[i]; return t ? screenOf(t) : null },
        /** L'affiche : une ferme toute faite (celle de la maquette). */
        demo() {
          const s = me
          if (!s) return
          const P: [PieceId, number, number, number][] = [['barn', -1.6, -4.4, 0.25], ['coop', 3.6, -2.6, -0.9], ['pond', -4.2, 1.4, 0.4], ['appleTree', 4.6, 1.8, 0], ['haystack', 1.8, -5.2, 0], ['mud', 1.6, 2.8, 0], ['well', -1.2, 0.2, 0.3], ['bales', 5.2, -0.6, 1.2]]
          for (const [id, x, z, ry] of P) addPiece(s, id, x, z, ry, false)
          const A: [CritterKind, number, number, number][] = [['cow', -0.6, -2.4, 0.4], ['sheep', -2.6, -1.2, 1.4], ['duck', -4.1, 1.5, 0.6], ['pig', 1.5, 2.9, -0.4], ['hen', 2.9, -1.4, 0.4], ['dog', 0.4, -0.2, 0.5], ['horse', 0.8, -2.6, -0.2], ['cat', 4.6, -0.2, -0.6]]
          for (const [k, x, z, ry] of A) { const t = addAnimal(s, k, x, z, ry, false); t.wait = 999 }
          const road = [-1.4, -2.0, -1.2, -1.0, -0.4, 0.9, 0.2, 2.4, 0.4, 4.2, 0.2, 6.0]
          const m = pathMesh(s, road); s.farm.root.add(m); s.paths.push({ pts: road, mesh: m })
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
      c.root.removeEventListener('wheel', onWheel)
      const s = me
      me = null
      if (s) {
        // La ferme est gardée telle qu'on la quitte
        save(s)
        clearTimeout(saveTimer)
        try { localStorage.setItem(KEY, JSON.stringify(saved)) } catch { /* plein */ }
        disposeState(s)
      }
      hideLoader()
    }
  }
}
