import type { GameContext, GameDef } from '../core/types'
import { createStage, loader, type Stage, type T3 } from '../core/three3d'
import { particles, toScreen, type Particles } from '../core/scene3d'
import { buildFarm, type Farm, type PieceId } from '../core/farm3d'
import { critterKit, type Critter, type CritterKind, type CritterKit } from '../core/critters'
import { sfx, preloadSfx, cry, preloadCries, CRY, type AnimalVoice } from '../core/sfx'
import { tone, sWin } from '../core/audio'
import { impact } from '../core/impact'
import { visible } from '../core/hand'
import { ICON } from '../core/icons'
import { DC, DR, makeRounds, run, solve, starsFor, type Cmd, type Dir, type Level, type Step, type Token } from '../core/tracteur'

/* 🚜 LE TRACTEUR À PROGRAMMER (27/10, Apprendre) — le codage de
   déplacements du cycle 2. Sur le plateau de la ferme (celui de
   Cache-Cache, vide), un pré quadrillé et clôturé ; des bottes, des
   tonneaux, une meule, un buisson en travers ; un animal attend sur une
   case. Le tracteur, sa charrette derrière lui, doit aller le chercher.

   En bas, la file de flèches (des icônes, aucun mot à lire) : on touche
   une flèche de la palette pour l'ajouter au bout de la file, on touche une
   flèche posée pour la retirer ; ▶ lance : le tracteur joue la file pas à
   pas, la flèche en cours s'allume. S'il cogne un obstacle ou la clôture,
   il s'arrête net (un petit choc), la flèche fautive clignote, puis il
   revient à sa place : on corrige la file et on relance. Aucune sanction,
   aucun chrono. Arrivé sur l'animal, celui-ci saute dans la charrette en
   criant de sa vraie voix.

   Fleur : ↑ ↓ ← →, la direction de l'écran, sur un pré de 5 × 5. Éclair :
   « avance, tourne à gauche, tourne à droite », vu du tracteur, comme le
   Bee-Bot de l'école, 6 × 6. Flamme : 7 × 7, la boucle « ×2 » à poser
   devant une flèche (la file est trop courte sans elle), et deux animaux à
   ramasser dans la même file. Huit manches, générées et toujours solubles
   (la logique et sa recherche de chemin : `core/tracteur.ts`, testée). Les
   étoiles comptent les départs qui n'ont pas ramené tout le monde. */

type Phase = 'load' | 'in' | 'edit' | 'run' | 'stuck' | 'back' | 'win' | 'out' | 'done'

interface Beast {
  kind: CritterKind
  c: Critter
  cell: { c: number; r: number }
  /** Où il en est : dans le pré, en vol vers la charrette (ou retour), dans la charrette. */
  at: 'field' | 'up' | 'cart' | 'down'
  t: number
  seat: number
  /** Petit bond quand on le touche. */
  hop: number
}

interface State {
  root: HTMLElement
  running: boolean
  rounds: Level[]
  round: number
  lv: Level
  file: Token[]
  /** La boucle ×2 armée : la prochaine flèche posée la porte. */
  armed: boolean
  phase: Phase
  pt: number
  retries: number
  picked: number
  stage: Stage | null
  T: T3 | null
  farm: Farm | null
  kit: CritterKit | null
  fx: Particles | null
  ray: import('three').Raycaster | null
  cell: number
  /** Le pré de la manche : le quadrillage, la clôture, les obstacles. */
  field: import('three').Group | null
  rocks: import('three').Object3D[]
  beasts: Beast[]
  rig: { g: import('three').Group; cart: import('three').Group; puff: number } | null
  /** Le tracteur : sa case (en fractions), son cap (radians). */
  pose: { x: number; z: number; ang: number }
  exec: { steps: Step[]; i: number; t: number; ok: boolean; fault: number | null; hit: boolean } | null
  /** D'où il repart en revenant à sa place. */
  backFrom: { x: number; z: number; ang: number } | null
}

let me_: State | null = null
let ctx: GameContext

/** Ce que prend la grille sur le plateau (rayon 8) : on garde l'herbe du bord. */
const SPAN = 9.4
/** La taille de chaque animal dans le pré (en cases) : les gros plus gros. */
const SIZE: Partial<Record<CritterKind, number>> = { cow: 0.8, horse: 0.78, pig: 0.68, sheep: 0.7, goat: 0.68, dog: 0.64, cat: 0.56, duck: 0.58, hen: 0.56, rooster: 0.58 }
const KINDS = Object.keys(CRY) as CritterKind[]
/** L'échelle du tracteur et de sa charrette (en cases). */
const TS = 0.33, CS = 0.24
/** Un animal dans la charrette, par rapport à sa taille dans le pré. */
const RIDE = 0.46
const OBSTACLES: PieceId[] = ['bales', 'barrels', 'haystack', 'bush', 'woodpile', 'well']

/* ---------- Les icônes des flèches ---------- */
const COLOR: Record<Cmd, string> = { N: '#3FA45E', F: '#3FA45E', W: '#3A93BC', L: '#3A93BC', E: '#E8873A', R: '#E8873A', S: '#E8574C' }
const ARROW = '<path d="M24 5 41 23H31v19H17V23H7z" fill="#fff"/>'
const TURN = '<path d="M32 43V25a9 9 0 0 0-9-9h-7" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/><path d="M4 16 18 4v24z" fill="#fff"/>'
const GLYPH: Record<Cmd, string> = {
  N: ARROW, F: ARROW,
  S: `<g transform="rotate(180 24 24)">${ARROW}</g>`,
  E: `<g transform="rotate(90 24 24)">${ARROW}</g>`,
  W: `<g transform="rotate(-90 24 24)">${ARROW}</g>`,
  L: TURN,
  R: `<g transform="matrix(-1 0 0 1 48 0)">${TURN}</g>`
}
const NAME: Record<Cmd, string> = { N: 'Haut', S: 'Bas', W: 'Gauche', E: 'Droite', F: 'Avance', L: 'Tourne', R: 'Tourne' }
const glyph = (c: Cmd, sz = 40) => `<svg viewBox="0 0 48 48" width="${sz}" height="${sz}" aria-hidden="true">${GLYPH[c]}</svg>`
const PAW = `<svg class="ico" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><ellipse cx="12" cy="16" rx="5.4" ry="4.6" fill="currentColor"/><ellipse cx="5.6" cy="10.4" rx="2.3" ry="2.9" fill="currentColor"/><ellipse cx="9.4" cy="6.4" rx="2.3" ry="3" fill="currentColor"/><ellipse cx="14.6" cy="6.4" rx="2.3" ry="3" fill="currentColor"/><ellipse cx="18.4" cy="10.4" rx="2.3" ry="2.9" fill="currentColor"/></svg>`

/** Le cap, en radians : le tracteur de la ferme regarde +x au repos. */
const ANG = (d: Dir) => Math.PI / 2 - d * Math.PI / 2
const ease = (k: number) => { const x = Math.min(1, Math.max(0, k)); return x * x * (3 - 2 * x) }
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

const $ = (me: State, sel: string) => me.root.querySelector<HTMLElement>(sel)!

/** Une case → la scène. */
function cellPos(me: State, c: number, r: number) {
  const h = (me.lv.n - 1) / 2
  return { x: (c - h) * me.cell, z: (r - h) * me.cell }
}

/* ---------- La file, en DOM ---------- */
function paintFile(me: State) {
  const lv = me.lv
  const box = $(me, '.tr-file')
  let html = ''
  for (let i = 0; i < lv.slots; i++) {
    const t = me.file[i]
    if (!t) { html += `<i class="tr-slot${i === me.file.length && me.armed ? ' tr-armed' : ''}">${i === me.file.length && me.armed ? '<b class="tr-x2b">×2</b>' : ''}</i>`; continue }
    html += `<button class="tr-tok" data-i="${i}" style="--c:${COLOR[t.cmd]}" aria-label="${NAME[t.cmd]}">${t.x2 ? '<b class="tr-x2b">×2</b>' : ''}${glyph(t.cmd, 34)}</button>`
  }
  box.innerHTML = html
  box.querySelectorAll<HTMLButtonElement>('.tr-tok').forEach(b => b.addEventListener('click', () => removeTok(me, Number(b.dataset.i))))
  $(me, '.tr-go').classList.toggle('on', me.file.length > 0 && me.phase === 'edit')
  me.root.querySelector('.tr-x2')?.classList.toggle('on', me.armed)
}

function paintDots(me: State) {
  $(me, '.tr-dots').innerHTML = me.rounds.map((_, i) =>
    `<i class="sn-dot${i < me.round ? ' on' : ''}${i === me.round ? ' cur' : ''}"></i>`).join('')
}

function paintPalette(me: State) {
  const cmds: Cmd[] = me.lv.mode === 'abs' ? ['W', 'N', 'S', 'E'] : ['L', 'F', 'R']
  let html = cmds.map(c => `<span class="tool-item"><button class="tr-cmd" data-cmd="${c}" style="--c:${COLOR[c]}" aria-label="${NAME[c]}">${glyph(c)}</button><i class="tool-cap">${NAME[c]}</i></span>`).join('')
  if (me.lv.loops) html += '<span class="tool-item"><button class="tr-x2" aria-label="Deux fois"><b>×2</b></button><i class="tool-cap">Deux fois</i></span>'
  const pal = $(me, '.tr-pal')
  pal.innerHTML = html
  pal.querySelectorAll<HTMLButtonElement>('.tr-cmd').forEach(b => b.addEventListener('click', () => addTok(me, b.dataset.cmd as Cmd, b)))
  pal.querySelector('.tr-x2')?.addEventListener('click', () => {
    if (me.phase !== 'edit') return
    me.armed = !me.armed
    sfx('switch', { vol: 0.4 })
    clearFault(me)
    paintFile(me)
  })
}

function clearFault(me: State) {
  me.root.querySelectorAll('.tr-tok.bad').forEach(e => e.classList.remove('bad'))
}

function addTok(me: State, cmd: Cmd, btn: HTMLElement) {
  if (me.phase !== 'edit') return
  if (me.file.length >= me.lv.slots) {
    // La file est pleine : le bouton tremble, rien d'autre
    btn.classList.remove('tr-no'); void btn.offsetWidth; btn.classList.add('tr-no')
    sfx('drop', { vol: 0.3, rate: 0.8 })
    return
  }
  me.file.push(me.armed ? { cmd, x2: true } : { cmd })
  me.armed = false
  sfx('click', { vol: 0.5, rate: 0.9 + me.file.length * 0.04 })
  clearFault(me)
  paintFile(me)
}

function removeTok(me: State, i: number) {
  if (me.phase !== 'edit' || !me.file[i]) return
  me.file.splice(i, 1)
  sfx('pluck', { vol: 0.4, rate: 1.4 })
  clearFault(me)
  paintFile(me)
}

/* ---------- Le pré d'une manche ---------- */

/** Le quadrillage tondu en damier, peint au canvas. */
function lawnTex(T: T3, n: number) {
  const px = 64 * n
  const cv = document.createElement('canvas')
  cv.width = cv.height = px
  const g = cv.getContext('2d')!
  const s = px / n
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    // Opaque : la cour en terre du plateau ne doit pas transparaître
    g.fillStyle = (r + c) % 2 ? '#7CBC48' : '#62A23A'
    g.fillRect(c * s, r * s, s, s)
    // Des brins tondus dans le sens de la tonte
    g.strokeStyle = (r + c) % 2 ? 'rgba(255,255,220,0.16)' : 'rgba(30,70,20,0.16)'
    g.lineWidth = 1.2
    for (let k = 0; k < 18; k++) {
      const x = c * s + Math.random() * s, y = r * s + Math.random() * s
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + ((r + c) % 2 ? 2 : -2), y - 5); g.stroke()
    }
  }
  // Un fin liseré clair entre les cases
  g.strokeStyle = 'rgba(255,250,225,0.55)'
  g.lineWidth = 2
  for (let k = 1; k < n; k++) {
    g.beginPath(); g.moveTo(k * s, 0); g.lineTo(k * s, px); g.stroke()
    g.beginPath(); g.moveTo(0, k * s); g.lineTo(px, k * s); g.stroke()
  }
  const t = new T.CanvasTexture(cv)
  t.colorSpace = T.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function buildField(me: State) {
  const T = me.T!, st = me.stage!, farm = me.farm!, lv = me.lv
  const n = lv.n, cs = me.cell, half = n * cs / 2
  const g = new T.Group()
  // Le damier
  const tex = lawnTex(T, n)
  const lawn = new T.Mesh(new T.PlaneGeometry(n * cs, n * cs), new T.MeshStandardMaterial({
    map: tex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2
  }))
  lawn.rotation.x = -Math.PI / 2
  lawn.position.y = 0.012
  lawn.receiveShadow = true
  g.add(lawn)
  // La clôture : des piquets à chaque coin de case, deux lisses
  const wood = new T.MeshStandardMaterial({ color: 0x7A5232, roughness: 0.8 })
  const e = half + 0.22
  const posts: [number, number][] = []
  for (let k = 0; k <= n; k++) {
    const v = -half + k * cs
    posts.push([v, -e], [v, e], [-e, v], [e, v])
  }
  const postGeo = new T.CylinderGeometry(0.07, 0.085, 0.62, 8)
  postGeo.translate(0, 0.31, 0)
  const im = new T.InstancedMesh(postGeo, wood, posts.length)
  const m4 = new T.Matrix4()
  posts.forEach(([x, z], i) => im.setMatrixAt(i, m4.makeTranslation(x, 0, z)))
  im.castShadow = true
  g.add(im)
  const railGeo = new T.BoxGeometry(1, 0.06, 0.05)
  for (const y of [0.24, 0.48]) for (const [x, z, ry] of [[0, -e, 0], [0, e, 0], [-e, 0, Math.PI / 2], [e, 0, Math.PI / 2]] as const) {
    const rail = new T.Mesh(railGeo, wood)
    rail.scale.x = 2 * e
    rail.position.set(x, y, z)
    rail.rotation.y = ry
    rail.castShadow = true
    g.add(rail)
  }
  farm.root.add(g)
  me.field = g
  // Les obstacles : les pièces de la ferme, ramenées à une case
  me.rocks = lv.rocks.map((p, i) => {
    const piece = farm.make(OBSTACLES[(i * 7 + me.round * 3) % OBSTACLES.length])
    const o = piece.g
    const box = new T.Box3().setFromObject(o)
    const sz = box.getSize(new T.Vector3())
    const k = Math.min(cs * 0.82 / Math.max(sz.x, sz.z), cs * 1.05 / sz.y)
    const q = cellPos(me, p.c, p.r)
    const holder = new T.Group()
    holder.add(o)
    o.scale.setScalar(k)
    o.position.set(-(box.min.x + box.max.x) / 2 * k, 0, -(box.min.z + box.max.z) / 2 * k)
    holder.position.set(q.x, 0, q.z)
    holder.rotation.y = Math.floor(Math.random() * 4) * Math.PI / 2 + (Math.random() - 0.5) * 0.3
    farm.root.add(holder)
    return holder
  })
  // Les animaux qui attendent
  const kinds = KINDS.slice().sort(() => Math.random() - 0.5)
  me.beasts = lv.animals.map((p, i) => {
    const kind = kinds[i]
    const c = me.kit!.make(kind, (SIZE[kind] ?? 0.5) * cs)
    const q = cellPos(me, p.c, p.r)
    c.obj.position.set(q.x, 0, q.z)
    c.obj.rotation.y = (Math.random() - 0.5) * 0.8
    farm.root.add(c.obj)
    return { kind, c, cell: p, at: 'field', t: 0, seat: i, hop: 0 } as Beast
  })
  placeRig(me, lv.start.c, lv.start.r, lv.dir)
  st.settle()
}

function clearField(me: State) {
  const farm = me.farm!
  const drop = (o: import('three').Object3D, piece: boolean) => {
    farm.root.remove(o)
    o.traverse(x => {
      const m = x as import('three').Mesh
      // Les pièces ont leurs géométries à elles ; les matériaux sont partagés
      if (piece && m.isMesh && !(m as unknown as import('three').InstancedMesh).isInstancedMesh) m.geometry.dispose()
    })
  }
  for (const r of me.rocks) drop(r, true)
  for (const b of me.beasts) farm.root.remove(b.c.obj)
  if (me.field) {
    farm.root.remove(me.field)
    me.field.traverse(x => {
      const m = x as import('three').Mesh
      if (!m.isMesh) return
      m.geometry.dispose()
      const mat = m.material as import('three').MeshStandardMaterial
      mat.map?.dispose()
      mat.dispose()
    })
  }
  me.rocks = []
  me.beasts = []
  me.field = null
}

/* ---------- Le tracteur et sa charrette ---------- */
function buildRig(me: State) {
  const T = me.T!, farm = me.farm!, cs = me.cell
  const g = new T.Group()
  const tr = farm.make('tractor').g
  // Le milieu du tracteur (roues arrière → godet) sur l'origine
  tr.position.x = -0.38
  g.add(tr)
  g.scale.setScalar(cs * TS)
  farm.root.add(g)
  const cart = new T.Group()
  const ct = farm.make('cart').g
  cart.add(ct)
  cart.scale.setScalar(cs * CS)
  farm.root.add(cart)
  me.rig = { g, cart, puff: 0 }
}

/** Le point d'attelage, derrière le tracteur (dans la scène). */
function hitch(me: State) {
  const k = me.cell * TS * 1.42
  return { x: me.pose.x - Math.cos(me.pose.ang) * k, z: me.pose.z + Math.sin(me.pose.ang) * k }
}
/** Du milieu de la charrette au bout de ses brancards. */
const cartReach = (me: State) => me.cell * CS * 2.05

function placeRig(me: State, c: number, r: number, d: Dir) {
  const q = cellPos(me, c, r)
  me.pose = { x: q.x, z: q.z, ang: ANG(d) }
  syncRig(me, true)
}

/** Le tracteur à sa pose ; la charrette suit l'attelage comme une remorque. */
function syncRig(me: State, snap = false, bob = 0) {
  const rig = me.rig
  if (!rig) return
  rig.g.position.set(me.pose.x, bob, me.pose.z)
  rig.g.rotation.y = me.pose.ang
  const h = hitch(me), D = cartReach(me)
  let ux: number, uz: number
  if (snap) { ux = Math.cos(me.pose.ang); uz = -Math.sin(me.pose.ang) } else {
    ux = h.x - rig.cart.position.x; uz = h.z - rig.cart.position.z
    const l = Math.hypot(ux, uz) || 1
    ux /= l; uz /= l
  }
  rig.cart.position.set(h.x - ux * D, 0, h.z - uz * D)
  rig.cart.rotation.y = Math.atan2(-uz, ux)
}

/** La place d'un animal sur le foin de la charrette (dans la scène). */
function seatPos(me: State, i: number) {
  const T = me.T!, cart = me.rig!.cart
  cart.updateMatrixWorld()
  const v = new T.Vector3(me.lv.animals.length > 1 ? (i ? 0.35 : -0.45) : -0.1, 1.02, 0).applyMatrix4(cart.matrixWorld)
  // Le repère du plateau (le plateau ne tourne pas ici, mais on reste propre)
  return me.farm!.root.worldToLocal(v)
}

/* ---------- Une manche ---------- */
function startRound(me: State) {
  me.lv = me.rounds[me.round]
  me.file = []
  me.armed = false
  me.exec = null
  clearField(me)
  buildField(me)
  paintPalette(me)
  paintFile(me)
  paintDots(me)
  frame(me)
  me.phase = 'in'
  me.pt = 0
}

function go(me: State) {
  if (me.phase !== 'edit' || !me.file.length) return
  clearFault(me)
  const r = run(me.lv, me.file)
  me.exec = { ...r, i: 0, t: 0, hit: false }
  me.phase = 'run'
  me.pt = 0
  me.armed = false
  paintFile(me)
  // Tut-tut : il démarre
  tone(392, 0.12, 'square', 0.05); tone(330, 0.16, 'square', 0.05, 0.14)
}

/** La durée d'un pas, et la part du début où il se tourne. */
function timing(s: Step) {
  const turn = s.from.dir !== s.to.dir ? (s.kind === 'turn' ? 0.48 : 0.28) : 0
  const go_ = s.kind === 'turn' ? 0 : s.kind === 'move' ? 0.56 : 0.5
  return { turn, total: turn + go_ + 0.08 }
}

function lit(me: State, tok: number | null, rep = 0) {
  me.root.querySelectorAll('.tr-tok.cur').forEach(e => e.classList.remove('cur', 'rep'))
  if (tok === null) return
  const el = me.root.querySelector(`.tr-tok[data-i="${tok}"]`)
  el?.classList.add('cur')
  if (rep) el?.classList.add('rep')
}

function stepExec(me: State, dt: number) {
  const ex = me.exec!
  const s = ex.steps[ex.i]
  if (!s) {
    lit(me, null)
    if (ex.ok) win(me)
    else {
      me.retries++
      me.phase = 'stuck'
      me.pt = 0
      if (ex.fault !== null) me.root.querySelector(`.tr-tok[data-i="${ex.fault}"]`)?.classList.add('bad')
      else sfx('drop', { vol: 0.35, rate: 0.7 })
    }
    return
  }
  if (ex.t === 0) {
    lit(me, s.tok, s.rep)
    if (s.kind === 'turn' || s.from.dir !== s.to.dir) sfx('switch', { vol: 0.25, rate: 0.8 })
    if (s.kind === 'move') sfx('tick', { vol: 0.35, rate: 0.7 })
  }
  ex.t += dt
  const { turn, total } = timing(s)
  const a0 = ANG(s.from.dir), a1 = a0 + wrapA(ANG(s.to.dir) - a0)
  me.pose.ang = a0 + (a1 - a0) * ease(turn ? ex.t / turn : 1)
  const k = Math.max(0, ex.t - turn)
  const p0 = cellPos(me, s.from.c, s.from.r)
  let bob = 0
  if (s.kind === 'move') {
    const p1 = cellPos(me, s.to.c, s.to.r)
    const e = ease(k / 0.56)
    me.pose.x = p0.x + (p1.x - p0.x) * e
    me.pose.z = p0.z + (p1.z - p0.z) * e
    bob = Math.abs(Math.sin(k / 0.56 * Math.PI * 2)) * me.cell * 0.02
    if (k > 0 && k < 0.56) puff(me, dt)
  } else if (s.kind === 'bump' || s.kind === 'out') {
    // Il fonce, cogne, recule : un petit choc, rien de plus
    const lunge = Math.sin(Math.min(1, k / 0.5) * Math.PI) * me.cell * (s.kind === 'out' ? 0.36 : 0.3)
    const d = s.to.dir
    me.pose.x = p0.x + DC[d] * lunge
    me.pose.z = p0.z + DR[d] * lunge
    if (!ex.hit && k >= 0.25) {
      ex.hit = true
      const sp = toScreen(me.stage!, { x: me.pose.x + DC[d] * me.cell * 0.4, y: me.cell * 0.3, z: me.pose.z + DR[d] * me.cell * 0.4 })
      impact(0.45, { matter: s.kind === 'out' ? 'bois' : 'sourd', x: sp.x, y: sp.y, colors: ['#E8C66A', '#C99A5F', '#FFFFFF'] })
    }
  }
  syncRig(me, false, bob)
  if (ex.t >= total) {
    if (s.kind === 'move') { me.pose.x = cellPos(me, s.to.c, s.to.r).x; me.pose.z = cellPos(me, s.to.c, s.to.r).z }
    if (s.pick !== undefined) board(me, s.pick)
    if (s.kind === 'bump' || s.kind === 'out') me.pose = { x: p0.x, z: p0.z, ang: ANG(s.to.dir) }
    ex.i++
    ex.t = 0
  }
}

/** La fumée du pot d'échappement, en route. */
function puff(me: State, dt: number) {
  const rig = me.rig!
  rig.puff -= dt
  if (rig.puff > 0) return
  rig.puff = 0.13
  const T = me.T!
  const p = new T.Vector3(0.62 - 0.38, 1.7, 0.16).applyMatrix4(rig.g.matrixWorld)
  me.fx?.burst(p, { count: 2, color: [0xE8E4DC, 0xC9C4BA], speed: 0.5, spread: 0.4, life: 0.9, size: me.cell * 0.9, gravity: -1.2 })
}

/** L'animal monte dans la charrette, de sa vraie voix. */
function board(me: State, i: number) {
  const b = me.beasts[i]
  if (!b || b.at !== 'field') return
  b.at = 'up'
  b.t = 0
  me.picked++
  const v: AnimalVoice | undefined = CRY[b.kind]
  if (v) cry(v, { vol: 0.9, max: 1.6 })
  sfx('pluck', { vol: 0.4, rate: 1.1 })
}

function win(me: State) {
  me.phase = 'win'
  me.pt = 0
  sfx('confirm', { vol: 0.8 })
  const T = me.T!
  const p = new T.Vector3()
  me.rig!.cart.getWorldPosition(p)
  me.fx?.burst({ x: p.x, y: p.y + me.cell * 0.6, z: p.z }, { count: 50, color: [0xFFD34D, 0xFF6B81, 0x4FB8E7, 0x8CD867, 0xFFFFFF], speed: 6, spread: 0.6, life: 1.5, size: me.cell * 0.8, gravity: 9 })
  me.round++
  paintDots(me)
}

function finish(me: State) {
  ctx.finish({
    title: 'Tout le monde est monté !',
    msg: `Tu as programmé ${me.rounds.length} voyages du tracteur`,
    stars: starsFor(me.retries),
    score: me.picked,
    scoreIcon: PAW,
    outroMs: 2200
  })
}

/* ---------- Le cadrage ---------- */
/** La caméra regarde le pré de trois quarts, depuis le devant ; le pré
    entier tient au-dessus de la barre des flèches, quelle que soit la
    forme de l'écran. */
function frame(me: State) {
  const st = me.stage, T = me.T
  if (!st || !T) return
  const cam = st.camera
  const arena = $(me, '.tr-arena').getBoundingClientRect()
  const bar = $(me, '.tr-bar').getBoundingClientRect()
  const yb = -1 + 2 * (arena.bottom - bar.top + 10) / Math.max(1, arena.height)
  const want = { x0: -0.94, x1: 0.94, y0: yb, y1: 0.8 }
  const e = me.lv.n * me.cell / 2 + 0.3
  const corners = [-e, e].flatMap(x => [-e, e].flatMap(z => [0, 0.7].map(y => new T.Vector3(x, y, z))))
  const elev = 0.98 // ≈ 56° au-dessus de l'horizon
  const dir = new T.Vector3(0, Math.sin(elev), Math.cos(elev))
  const tg = new T.Vector3(0, 0, 0)
  let dist = 18
  const v = new T.Vector3()
  for (let k = 0; k < 24; k++) {
    cam.position.copy(tg).addScaledVector(dir, dist)
    cam.lookAt(tg)
    cam.updateMatrixWorld()
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9
    for (const c of corners) {
      v.copy(c).project(cam)
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y)
    }
    const s = Math.max((x1 - x0) / (want.x1 - want.x0), (y1 - y0) / (want.y1 - want.y0))
    dist *= 0.35 + 0.65 * s
    const halfH = Math.tan(cam.fov * Math.PI / 360) * dist
    tg.z -= ((y0 + y1) / 2 - (want.y0 + want.y1) / 2) * halfH / Math.cos(Math.PI / 2 - elev) * 0.8
  }
  cam.position.copy(tg).addScaledVector(dir, dist)
  cam.lookAt(tg)
  cam.updateMatrixWorld()
}

/* ---------- La boucle ---------- */
function step(me: State, dt: number) {
  const farm = me.farm
  if (!farm) return
  me.pt += dt
  farm.step(dt, me.pt)
  me.fx?.update(dt)
  // Les animaux : clignent, sautillent, montent ou descendent de la charrette
  me.beasts.forEach((b, i) => {
    me.kit!.blink(b.c, dt)
    const o = b.c.obj
    const home = cellPos(me, b.cell.c, b.cell.r)
    if (b.hop > 0) b.hop = Math.max(0, b.hop - dt * 2.6)
    const hopY = Math.sin(b.hop * Math.PI) * me.cell * 0.25
    if (b.at === 'field') {
      o.position.set(home.x, hopY, home.z)
      o.scale.setScalar(1)
    } else if (b.at === 'cart') {
      const sp = seatPos(me, b.seat)
      const party = me.phase === 'win' ? Math.abs(Math.sin(me.pt * 7 + i)) * me.cell * 0.12 : 0
      o.position.set(sp.x, sp.y + party + hopY, sp.z)
      o.rotation.y = me.rig!.cart.rotation.y - Math.PI / 2 + 0.4
      o.scale.setScalar(RIDE)
    } else {
      // En vol : un saut en cloche, de la case au foin (ou l'inverse)
      b.t += dt / 0.55
      const k = ease(b.t)
      const sp = seatPos(me, b.seat)
      const [a, z] = b.at === 'up' ? [home, sp] : [sp, home]
      const ay = b.at === 'up' ? 0 : sp.y, zy = b.at === 'up' ? sp.y : 0
      o.position.set(a.x + (z.x - a.x) * k, ay + (zy - ay) * k + Math.sin(k * Math.PI) * me.cell * 0.7, a.z + (z.z - a.z) * k)
      const sc = b.at === 'up' ? 1 - (1 - RIDE) * k : RIDE + (1 - RIDE) * k
      o.scale.setScalar(sc)
      if (b.t >= 1) { b.at = b.at === 'up' ? 'cart' : 'field'; b.t = 0; if (b.at === 'field') o.rotation.y = (Math.random() - 0.5) * 0.8 }
    }
  })
  // L'arrivée d'une manche : les obstacles tombent, rebondissent
  const pop = (o: import('three').Object3D, delay: number) => {
    const k = Math.max(0, Math.min(1, (me.pt - delay) / 0.45))
    const s = k < 1 ? Math.sin(k * Math.PI / 2) * (1 + Math.sin(k * Math.PI) * 0.18) : 1
    o.scale.setScalar(Math.max(0.001, s))
  }
  if (me.phase === 'in') {
    me.rocks.forEach((r, i) => pop(r, i * 0.07))
    me.beasts.forEach((b, i) => pop(b.c.obj, 0.3 + i * 0.15))
    if (me.rig) { pop(me.rig.g.children[0], 0.1); pop(me.rig.cart.children[0], 0.18) }
    if (me.pt > 0.9) {
      me.phase = 'edit'
      // L'animal appelle : c'est lui qu'on vient chercher
      const v = CRY[me.beasts[0]?.kind]
      if (v) cry(v, { vol: 0.7, max: 1.4 })
      me.beasts.forEach(b => { b.hop = 1 })
      paintFile(me)
    }
  }
  if (me.phase === 'run' && me.exec) stepExec(me, dt)
  if (me.phase === 'stuck' && me.pt > 1.5) {
    me.phase = 'back'
    me.pt = 0
    me.backFrom = { ...me.pose }
    for (const b of me.beasts) if (b.at === 'cart' || b.at === 'up') { b.at = 'down'; b.t = 0 }
    me.picked -= me.beasts.filter(b => b.at === 'down').length
  }
  if (me.phase === 'back' && me.backFrom) {
    // Il revient à sa place, en marche arrière douce
    const f = me.backFrom, lv = me.lv
    const q = cellPos(me, lv.start.c, lv.start.r)
    const k = ease(me.pt / 0.8)
    const a1 = f.ang + wrapA(ANG(lv.dir) - f.ang)
    me.pose = { x: f.x + (q.x - f.x) * k, z: f.z + (q.z - f.z) * k, ang: f.ang + (a1 - f.ang) * k }
    syncRig(me, me.pt > 0.8)
    if (me.pt > 0.85) { me.phase = 'edit'; me.backFrom = null; me.exec = null; paintFile(me) }
  }
  if (me.phase === 'win') {
    if (me.pt > 0.3 && me.pt - dt <= 0.3) { tone(523, 0.1, 'square', 0.05); tone(659, 0.18, 'square', 0.05, 0.12) }
    if (me.round >= me.rounds.length) {
      if (me.pt > 0.9) { me.phase = 'done'; sWin(); finish(me) }
    } else if (me.pt > 2.2) { me.phase = 'out'; me.pt = 0 }
  }
  if (me.phase === 'out') {
    const k = 1 - ease(me.pt / 0.35)
    me.rocks.forEach(r => r.scale.setScalar(Math.max(0.001, k)))
    me.beasts.forEach(b => b.c.obj.scale.setScalar(Math.max(0.001, k * (b.at === 'cart' ? RIDE : 1))))
    if (me.rig) { me.rig.g.children[0].scale.setScalar(Math.max(0.001, k)); me.rig.cart.children[0].scale.setScalar(Math.max(0.001, k)) }
    if (me.pt > 0.4) startRound(me)
  }
}

export const tracteur: GameDef = {
  id: 'tracteur', name: 'Le Tracteur', icon: '🚜', sq: 'sq-mint', cat: 'reflexion', music: 'meadow',
  subtitle: 'Programme le tracteur pour aller chercher les animaux',
  // La main : l'une des flèches (jamais la bonne seule) ; une file posée : ▶
  hand: root => {
    const me = me_
    if (!me || me.phase !== 'edit') return null
    if (!me.file.length) return { choose: visible(root, '.tr-pal .tr-cmd') }
    return { tap: root.querySelector('.tr-go') }
  },
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="arena tr-arena">
        <div class="tr-scene"></div>
        <div class="mem-dots tr-dots"></div>
        <div class="tr-bar">
          <div class="tr-pal"></div>
          <div class="tr-file"></div>
          <span class="tool-item"><button class="tr-go" aria-label="Partir">${ICON.play}</button><i class="tool-cap">Partir</i></span>
        </div>
      </div>`
    preloadSfx(['tick', 'click', 'pluck', 'switch', 'drop', 'confirm'])
    preloadCries(Object.values(CRY) as AnimalVoice[])
    const rounds = makeRounds(c.tier)
    const me: State = {
      root: c.root, running: true, rounds, round: 0, lv: rounds[0], file: [], armed: false, phase: 'load', pt: 0,
      retries: 0, picked: 0, stage: null, T: null, farm: null, kit: null, fx: null, ray: null, cell: SPAN / rounds[0].n,
      field: null, rocks: [], beasts: [], rig: null, pose: { x: 0, z: 0, ang: 0 }, exec: null, backFrom: null
    }
    me_ = me
    paintDots(me)
    paintPalette(me)
    paintFile(me)
    c.root.querySelector('.tr-go')!.addEventListener('click', () => go(me))
    const holder = c.root.querySelector<HTMLElement>('.tr-scene')!
    const hideLoader = loader(holder, 'tracteur')

    // Toucher un animal : il répond de sa vraie voix et sautille
    const onDown = (e: PointerEvent) => {
      if (!me.stage || !me.ray || me.phase === 'load') return
      const r = me.stage.renderer.domElement.getBoundingClientRect()
      const v = new me.T!.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      me.ray.setFromCamera(v, me.stage.camera)
      const hits = me.ray.intersectObjects(me.beasts.map(b => b.c.obj), true)
      if (!hits.length) return
      const b = me.beasts.find(x => { let o: import('three').Object3D | null = hits[0].object; while (o) { if (o === x.c.obj) return true; o = o.parent } return false })
      if (!b || b.hop > 0) return
      b.hop = 1
      const vo = CRY[b.kind]
      if (vo) cry(vo, { vol: 0.8, max: 1.4 })
    }
    holder.addEventListener('pointerdown', onDown)

    ;(async () => {
      const stage = await createStage(holder, {
        sky: '#9ED4F2', fov: 34, cam: [0, 14, 10], target: [0, 0, 0],
        hemi: ['#DCEFFF', '#5E8A44', 1.0], sun: { pos: [6.5, 14, 7], color: '#FFF0D2', intensity: 2.3, area: 10, far: 45 }, fill: 0.45, exposure: 1.0
      })
      if (!me.running) { stage.dispose(); return }
      const farm = await buildFarm(stage, { night: false, empty: true })
      if (!me.running || !stage.alive) { stage.dispose(); return }
      me.stage = stage
      me.T = stage.T
      me.farm = farm
      me.kit = critterKit(stage.T)
      stage.keep(me.kit)
      me.fx = particles(stage, 400)
      me.ray = new stage.T.Raycaster()
      // Le décor, au fond et sur les côtés (rien de haut devant le pré)
      const deco: [PieceId, number, number, number, number][] = [
        ['barn', -1.6, -6.75, 0.5, 0], ['appleTree', 6.6, -3.2, 0.62, 0.4], ['appleTree', -6.7, -2.4, 0.56, 1.2],
        ['haystack', 4.2, -6.4, 0.5, 0.6], ['coop', -5.1, -5.4, 0.42, 0.9], ['bush', 7.2, 0.6, 0.5, 0], ['bush', -7.25, 1.0, 0.45, 2]
      ]
      for (const [id, x, z, s, ry] of deco) {
        const p = farm.make(id)
        p.g.position.set(x, 0, z)
        p.g.scale.setScalar(s)
        p.g.rotation.y = ry
        farm.root.add(p.g)
      }
      buildRig(me)
      stage.onResize = () => frame(me)
      hideLoader()
      startRound(me)
      stage.start(dt => { if (me_ === me && me.running) step(me, dt) })
      // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __tr: unknown }).__tr = {
          get round() { return me.round },
          get phase() { return me.phase },
          get mode() { return me.lv.mode },
          get file() { return me.file.map(t => ({ ...t })) },
          get retries() { return me.retries },
          get picked() { return me.picked },
          /** Le plus court programme de la manche (le bot le pose). */
          get solution() { return solve(me.lv) },
          /** La flèche qui clignote (fautive), ou -1. */
          get fault() { const e = me.root.querySelector<HTMLElement>('.tr-tok.bad'); return e ? Number(e.dataset.i) : -1 },
          /** Où est le tracteur (sa case). */
          get at() { const h = (me.lv.n - 1) / 2; return { c: Math.round(me.pose.x / me.cell + h), r: Math.round(me.pose.z / me.cell + h) } }
        }
      }
    })().catch(err => { hideLoader(); console.error(err); if (me.running) throw err })

    return () => {
      if (!me.running) return
      me.running = false
      holder.removeEventListener('pointerdown', onDown)
      me.stage?.dispose()
      if (me_ === me) me_ = null
      const w = window as unknown as { __tr?: unknown }
      if (w.__tr) delete w.__tr
    }
  }
}
