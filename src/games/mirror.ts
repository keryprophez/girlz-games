import type { GameContext, GameDef } from '../core/types'
import { sfx, preloadSfx } from '../core/sfx'
import { sSteam, sWin } from '../core/audio'
import { createStage, loader, woodTex, type Stage, type T3 } from '../core/three3d'
import { particles, toScreen, type Particles } from '../core/scene3d'
import { some } from '../core/hand'
import { pegboard, beadPot, axisThread, ironing, BEAD, type Pegboard, type BeadPot, type AxisThread, type Ironing } from '../core/hama3d'
import { PALETTE, makeRounds, isGiven, isComplete, missing, wantAt, sourceOf, type ColorId, type Round } from '../core/perles'

/* Les PERLES MIROIR (30/09, validé par le père : « le Miroir devient les
   perles à repasser ») — une plaque à picots en 3D sur la table de
   l'atelier. La moitié du dessin est déjà posée (un papillon, une fraise,
   une tête de cochon…) ; une ficelle lumineuse marque l'axe ; on prend une
   couleur dans un pot de perles, on touche un picot : la perle tombe dessus,
   rebondit, clic. On complète le REFLET. Zéro lecture.

   Apprendre, donc aucune sanction : une perle fausse (mauvaise couleur ou
   mauvais picot) se pose quand même et clignote doucement ; on la retire
   d'un toucher. On peut aussi glisser le doigt pour poser (ou retirer) une
   rangée d'un coup — le glissé s'écoute sur la fenêtre (piège connu), un
   trait par doigt.

   Le reflet complet : les perles sautent par paires, de l'axe vers les
   bords (on VOIT que ce sont les mêmes, retournées), puis le papier
   sulfurisé se pose, le fer passe en zigzag, les perles fondent, et l'objet
   se décolle et tourne dans les airs sous les confettis.

   Fleur : plaque de 8, le modèle à gauche. Éclair : plaque de 10, le modèle
   à gauche ou à droite, un pot de trop. Flamme : plaque de 12, quatre
   couleurs, puis l'axe horizontal, puis les deux axes (un quart posé, trois
   à compléter). Les dessins sont dans `core/perles.ts`, la 3D dans
   `core/hama3d.ts`. */

type Phase = 'load' | 'intro' | 'play' | 'win' | 'iron' | 'fly' | 'over'

interface Pot { id: ColorId; pot: BeadPot; pos: import('three').Vector3; el: HTMLElement; btn: HTMLButtonElement }
interface Stroke { erase: boolean; seen: Set<number> }

interface State {
  root: HTMLElement
  running: boolean
  rounds: Round[]
  round: number
  rd: Round
  mistakes: number
  phase: Phase
  /** Temps de la phase en cours (simulé : figé en pause). */
  pt: number
  state: (ColorId | null)[]
  color: ColorId
  stage: Stage | null
  T: T3 | null
  fx: Particles | null
  board: Pegboard | null
  threads: AxisThread[]
  pots: Pot[]
  iron: Ironing | null
  strokes: Map<number, Stroke>
  ray: import('three').Raycaster | null
  /** Taille d'un pas de plaque dans la scène. */
  pitch: number
  /** L'envol : départ de la pièce, dernier confetti. */
  fly: { t: number; burst: number; finished: boolean } | null
}

let me_: State | null = null
let ctx: GameContext

/* ---------- La mise en place de la table ----------
   La plaque fait toujours 11 unités de côté à l'écran (une plaque de 8 a
   donc de plus grosses perles : les petites mains de la fleur), les pots
   sont à droite, la caméra regarde de trois quarts, depuis le devant. */
const PLATE = 11
const PX = -3.6
const TILT = 0.5 // de la verticale, en radians (≈ 29°)
const POT_R = 1.45
const POT_GAP = 3.85

/** Où poser n pots : une colonne jusqu'à trois, deux au-delà. */
function potSpots(n: number): [number, number][] {
  const colsN = n <= 3 ? 1 : 2
  const rowsN = Math.ceil(n / colsN)
  const x0 = PX + PLATE / 2 + 1.1 + POT_R
  return Array.from({ length: n }, (_, k) => {
    const col = colsN === 1 ? 0 : k % 2, row = colsN === 1 ? k : Math.floor(k / 2)
    return [x0 + col * (POT_R * 2 + 0.9), (row - (rowsN - 1) / 2) * POT_GAP]
  })
}

const $ = (me: State, sel: string) => me.root.querySelector<HTMLElement>(sel)!
const idx = (me: State, c: number, r: number) => r * me.rd.n + c
const hex = (id: ColorId) => PALETTE[id].hex

/** Cadre la table : la plaque et les pots dans l'écran, de l'air en haut pour
    la barre et les pastilles, quelle que soit la forme de l'écran. */
function frame(me: State) {
  const st = me.stage!, T = me.T!, cam = st.camera
  // Le cadre compte toujours une colonne pleine (ou deux) : il ne bouge pas
  // d'une manche à l'autre quand le nombre de pots change
  const spots = potSpots(me.rd.pots.length <= 3 ? 3 : 6)
  const box = {
    x0: PX - PLATE / 2 - 0.2,
    x1: Math.max(...spots.map(s => s[0])) + POT_R + 0.2,
    z0: Math.min(-PLATE / 2, ...spots.map(s => s[1] - POT_R)) - 0.2,
    z1: Math.max(PLATE / 2, ...spots.map(s => s[1] + POT_R + 0.6)) + 0.2
  }
  const dir = new T.Vector3(0, Math.cos(TILT), Math.sin(TILT))
  const tg = new T.Vector3((box.x0 + box.x1) / 2, 0, (box.z0 + box.z1) / 2)
  let dist = 30
  const corners = [box.x0, box.x1].flatMap(x => [box.z0, box.z1].flatMap(z => [0, 1.2].map(y => new T.Vector3(x, y, z))))
  const v = new T.Vector3()
  const want = { w: 1.86, h: 1.7, cx: 0, cy: -0.07 }
  for (let k = 0; k < 24; k++) {
    cam.position.copy(tg).addScaledVector(dir, dist)
    cam.lookAt(tg)
    cam.updateMatrixWorld()
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9
    for (const c of corners) {
      v.copy(c).project(cam)
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y)
    }
    const s = Math.max((x1 - x0) / want.w, (y1 - y0) / want.h)
    dist *= 0.35 + 0.65 * s
    const half = Math.tan(cam.fov * Math.PI / 360) * dist
    tg.x += ((x0 + x1) / 2 - want.cx) * half * cam.aspect * 0.8
    tg.z -= ((y0 + y1) / 2 - want.cy) * half / Math.cos(TILT) * 0.8
  }
  cam.position.copy(tg).addScaledVector(dir, dist)
  cam.lookAt(tg)
  cam.updateMatrixWorld()
}

/** Place les boutons des pots (et leur petit nom) sur les pots 3D. */
function placePots(me: State) {
  const st = me.stage
  if (!st) return
  const a = $(me, '.pl-arena').getBoundingClientRect()
  const T = me.T!
  for (const p of me.pots) {
    const c = toScreen(st, p.pos)
    const e = toScreen(st, new T.Vector3(p.pos.x + POT_R, p.pos.y, p.pos.z))
    const n = toScreen(st, new T.Vector3(p.pos.x, p.pos.y, p.pos.z - POT_R))
    const w = Math.abs(e.x - c.x) * 2.1, h = Math.abs(c.y - n.y) * 2.1 + 10
    p.btn.style.width = w + 'px'
    p.btn.style.height = h + 'px'
    p.el.style.left = (c.x - a.left) + 'px'
    p.el.style.top = (c.y - a.top - h / 2) + 'px'
  }
}

function paintDots(me: State) {
  $(me, '.pl-dots').innerHTML = me.rounds.map((_, i) =>
    `<i class="sn-dot${i < me.round ? ' on' : ''}${i === me.round ? ' cur' : ''}"></i>`).join('')
}

function selectColor(me: State, id: ColorId, sound = true) {
  me.color = id
  for (const p of me.pots) {
    const on = p.id === id
    p.pot.select(on)
    p.btn.classList.toggle('sel', on)
  }
  if (sound) sfx('click', { vol: 0.4 })
}

/* ---------- Une manche ---------- */
function startRound(me: State) {
  const T = me.T!, st = me.stage!
  me.rd = me.rounds[me.round]
  const rd = me.rd
  me.state = new Array(rd.n * rd.n).fill(null)
  me.strokes.clear()
  // La plaque de la bonne taille (elle change de taille d'un niveau à l'autre)
  if (!me.board || me.board.cols !== rd.n) {
    me.board?.dispose()
    const b = pegboard(T, { cols: rd.n, rows: rd.n })
    const k = PLATE / (rd.n + 1.02)
    b.group.scale.setScalar(k)
    b.group.position.set(PX, 0, 0)
    st.scene.add(b.group)
    b.onLand = (c, r) => {
      const i = idx(me, c, r)
      const got = me.state[i]
      const bad = !isGiven(me.rd, c, r) && got !== wantAt(me.rd, c, r)
      sfx('tick', { vol: me.phase === 'intro' ? 0.16 : 0.42, rate: 1.25 + Math.random() * 0.35 })
      if (bad && me.phase === 'play') sfx('drop', { vol: 0.28, rate: 0.8 })
    }
    me.board = b
    me.pitch = k
  }
  const board = me.board
  board.clear()
  board.piece.position.set(0, 0, 0)
  board.piece.rotation.set(0, 0, 0)
  // L'axe (ou les deux) : une ficelle lumineuse
  me.threads.forEach(t => t.dispose())
  me.threads = []
  if (rd.axis !== 'h') me.threads.push(axisThread(T, board, 'v'))
  if (rd.axis !== 'v') me.threads.push(axisThread(T, board, 'h'))
  // Les perles du modèle tombent en pluie, de l'axe vers le bord
  const order: { c: number; r: number; d: number }[] = []
  for (let r = 0; r < rd.n; r++) for (let c = 0; c < rd.n; c++) {
    const col = wantAt(rd, c, r)
    if (!col || !isGiven(rd, c, r)) continue
    const dv = rd.axis === 'h' ? 0 : Math.abs(c - (rd.n - 1) / 2)
    const dh = rd.axis === 'v' ? 0 : Math.abs(r - (rd.n - 1) / 2)
    order.push({ c, r, d: Math.max(dv, dh) + r * 0.05 + Math.random() * 0.4 })
  }
  order.sort((a, b) => a.d - b.d)
  order.forEach((o, k) => {
    me.state[idx(me, o.c, o.r)] = wantAt(rd, o.c, o.r)
    board.put(o.c, o.r, hex(wantAt(rd, o.c, o.r)!), { delay: 0.25 + k * 0.022, drop: 3 })
  })
  // Les pots : ceux du dessin, et parfois un de trop
  me.pots.forEach(p => { p.pot.dispose(); p.el.remove() })
  me.pots = []
  const holder = $(me, '.pl-pots')
  const spots = potSpots(rd.pots.length)
  rd.pots.forEach((id, k) => {
    const [x, z] = spots[k]
    const pot = beadPot(T, hex(id), { radius: POT_R, bead: me.pitch * 0.92 })
    pot.group.position.set(x, 0, z)
    pot.group.rotation.y = Math.random() * 6.28
    st.scene.add(pot.group)
    const el = document.createElement('span')
    el.className = 'tool-item pl-pot'
    el.innerHTML = `<button class="pl-potbtn" data-c="${id}" aria-label="${PALETTE[id].name}"></button><i class="tool-cap">${PALETTE[id].name}</i>`
    const btn = el.querySelector('button')!
    btn.addEventListener('pointerdown', e => { e.stopPropagation(); if (me.phase !== 'over') selectColor(me, id) })
    holder.appendChild(el)
    me.pots.push({ id, pot, pos: new T.Vector3(x, POT_R * 0.35, z), el, btn })
  })
  // La couleur de départ : celle dont on aura le plus besoin
  const need = missing(rd, me.state).need
  const most = rd.colors.slice().sort((a, b) => need.filter(x => x.color === b).length - need.filter(x => x.color === a).length)[0]
  selectColor(me, most, false)
  frame(me)
  placePots(me)
  paintDots(me)
  me.phase = 'intro'
  me.pt = 0
}

/** Pose ou retire la perle d'une case du côté à compléter. */
function touchCell(me: State, c: number, r: number, erase: boolean) {
  const board = me.board!
  const i = idx(me, c, r)
  if (erase) {
    if (!me.state[i]) return
    me.state[i] = null
    board.take(c, r)
    sfx('pluck', { vol: 0.35, rate: 1.5 })
    return
  }
  if (me.state[i]) return
  me.state[i] = me.color
  board.put(c, r, hex(me.color), { drop: 2.4 })
  if (me.color !== wantAt(me.rd, c, r)) {
    // Pas de sanction : elle se pose, elle clignote, on la retire d'un toucher
    me.mistakes++
    board.wrong(c, r, true)
  }
}

function checkDone(me: State) {
  if (me.phase !== 'play' || me.strokes.size) return
  if (!isComplete(me.rd, me.state)) return
  win(me)
}

/** Le reflet est juste : la vague des paires, puis le fer. */
function win(me: State) {
  const rd = me.rd, board = me.board!
  me.phase = 'win'
  me.pt = 0
  sfx('confirm', { vol: 0.8 })
  me.threads.forEach(t => t.set(0))
  const mid = (rd.n - 1) / 2
  for (let r = 0; r < rd.n; r++) for (let c = 0; c < rd.n; c++) {
    if (!me.state[idx(me, c, r)]) continue
    const [sc, sr] = sourceOf(rd, c, r)
    // Une perle et son modèle sautent ensemble : même distance à l'axe
    const d = rd.axis === 'v' ? Math.abs(sc - mid) : rd.axis === 'h' ? Math.abs(sr - mid) : Math.max(Math.abs(sc - mid), Math.abs(sr - mid))
    board.hop(c, r, (mid + 0.5 - d) * 0.075, 0.7)
  }
}

function startIron(me: State) {
  const T = me.T!, board = me.board!
  me.phase = 'iron'
  me.pt = 0
  me.iron = ironing(T, board, {
    steam: p => me.fx?.burst(p, { count: 2, color: [0xFFFFFF, 0xF2F6FA], speed: 1.4, spread: 0.5, life: 1.2, size: 3.2, gravity: -1.5 }),
    sizzle: () => sSteam(),
    land: () => sfx('metal', { vol: 0.25, rate: 0.9 }),
    lift: () => sfx('whoosh', { vol: 0.25 })
  })
}

/** L'objet fondu se décolle et tourne dans les airs, sous les confettis. */
function startFly(me: State) {
  me.iron?.dispose()
  me.iron = null
  me.phase = 'fly'
  me.pt = 0
  me.fly = { t: 0, burst: 0, finished: false }
  sfx('pluck', { vol: 0.5, rate: 0.9 })
  me.round++
  paintDots(me)
}

function finish(me: State) {
  const stars = me.mistakes <= 3 ? 3 : me.mistakes <= 10 ? 2 : 1
  ctx.finish({
    title: 'Quel joli reflet !',
    msg: `Tu as complété ${me.rounds.length} reflets en perles`,
    stars,
    outroMs: 2600
  })
}

/* ---------- La boucle ---------- */
const ease = (k: number) => { const x = Math.min(1, Math.max(0, k)); return x * x * (3 - 2 * x) }

function step(me: State, dt: number) {
  const board = me.board
  if (!board) return
  me.pt += dt
  board.update(dt)
  me.threads.forEach(t => t.update(dt))
  me.pots.forEach(p => p.pot.update(dt))
  me.fx?.update(dt)

  if (me.phase === 'intro' && me.pt > 1.1) me.phase = 'play'
  if (me.phase === 'win' && me.pt > 1.25) startIron(me)
  if (me.phase === 'iron' && me.iron && me.iron.update(dt)) startFly(me)
  if (me.phase === 'fly' && me.fly) {
    const f = me.fly, T = me.T!
    f.t += dt
    const t = f.t
    const p = board.piece
    // 1. Il se décolle (petit tremblement, il se soulève d'un coup)
    // 2. Il monte vers nous en tournant, penché pour qu'on le voie de face
    // 3. Il flotte en tournant (la dernière manche : l'outro), ou s'envole
    const up = ease((t - 0.3) / 1.1)
    const s = me.pitch
    const rise = (t < 0.3 ? Math.sin(t / 0.3 * Math.PI) * 0.25 : 0) + up * 4.2 / s
    p.position.set(Math.sin(t * 13) * (t < 0.3 ? 0.06 : 0), rise + Math.sin(t * 2.2) * 0.15 * up, up * 1.6 / s)
    p.rotation.x = up * 0.5 + Math.sin(t * 1.7) * 0.08 * up
    p.rotation.y = up * Math.PI * 2 * 1.25 + Math.max(0, t - 1.4) * 1.3
    // Les confettis : deux gerbes qui retombent de part et d'autre de l'objet,
    // aux couleurs du dessin (sauf les foncées, qui font des taches)
    if (t > 0.45 && f.burst === 0) {
      f.burst = 1
      sWin()
      const light = me.rd.colors.filter(c => c !== 'noir' && c !== 'marron').map(hex)
      const cols = [...light, 0xFFFFFF, 0xFFD34D, 0xFF6B81]
      for (const side of [-1, 1]) {
        const w = board.group.localToWorld(new T.Vector3(side * me.rd.n * 0.45, board.top, 0))
        me.fx?.burst({ x: w.x, y: w.y + 1, z: w.z + 1 }, { count: 45, color: cols, speed: 11, spread: 0.45, life: 1.8, size: 1.4, gravity: 12, dir: { x: -side * 0.25, y: 1, z: 0.1 } })
      }
    }
    if (t > 1.2 && f.burst === 1) {
      f.burst = 2
      const w = board.group.localToWorld(new T.Vector3(0, board.top, 0))
      me.fx?.burst({ x: w.x, y: w.y + 9, z: w.z }, { count: 60, color: [0xFFFFFF, 0xFFD34D, 0xFF6B81, 0x4FB8E7, 0x8CD867], speed: 5, spread: 1, life: 1.8, size: 1.2, gravity: 7 })
    }
    if (me.round >= me.rounds.length) {
      if (!f.finished && t > 0.5) { f.finished = true; finish(me) }
    } else if (t > 2.7) {
      // Il s'envole hors de l'écran, la manche suivante arrive
      const k = ease((t - 2.7) / 0.6)
      p.position.y += k * 14 / s
      p.position.z -= k * 4 / s
      if (t > 3.3) { me.fly = null; startRound(me) }
    }
  }
}

/* ---------- Le doigt ---------- */
function cellAt(me: State, e: { clientX: number; clientY: number }) {
  const st = me.stage, board = me.board
  if (!st || !board || !me.ray) return null
  const r = st.renderer.domElement.getBoundingClientRect()
  const v = new me.T!.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  me.ray.setFromCamera(v, st.camera)
  return board.pick(me.ray.ray)
}

export const mirror: GameDef = {
  id: 'mirror', name: 'Perles Miroir', icon: '🪞', sq: 'sq-lilac', cat: 'reflexion',
  subtitle: 'Pose les perles pour compléter le reflet, puis le fer les fait fondre !',
  // La main : « un de ces picots-là », dans la moitié à compléter — jamais la réponse
  hand: () => {
    const me = me_
    if (!me || me.phase !== 'play' || me.strokes.size || !me.stage || !me.board) return null
    const free: [number, number][] = []
    for (let r = 0; r < me.rd.n; r++) for (let c = 0; c < me.rd.n; c++) {
      if (!isGiven(me.rd, c, r) && !me.state[idx(me, c, r)]) free.push([c, r])
    }
    const st = me.stage, board = me.board
    return free.length ? { choose: some(free, 3).map(([c, r]) => toScreen(st, board.world(c, r, 0.5))) } : null
  },
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="arena pl-arena">
        <div class="pl-scene"></div>
        <div class="pl-pots"></div>
        <div class="mem-dots pl-dots"></div>
      </div>`
    preloadSfx(['tick', 'drop', 'confirm', 'click', 'pluck', 'metal', 'whoosh'])
    const rounds = makeRounds(c.tier)
    const me: State = {
      root: c.root, running: true, rounds, round: 0, rd: rounds[0], mistakes: 0, phase: 'load', pt: 0,
      state: [], color: rounds[0].pots[0], stage: null, T: null, fx: null, board: null, threads: [], pots: [],
      iron: null, strokes: new Map(), ray: null, pitch: 1, fly: null
    }
    me_ = me
    paintDots(me)
    const holder = c.root.querySelector<HTMLElement>('.pl-scene')!
    const hideLoader = loader(holder, 'mirror')

    // Poser en touchant, ou en glissant (un trait par doigt, écouté sur la fenêtre)
    const onDown = (e: PointerEvent) => {
      if (me.phase !== 'play') return
      const cell = cellAt(me, e)
      if (!cell) return
      e.preventDefault()
      if (isGiven(me.rd, cell.c, cell.r)) {
        // Le modèle ne se touche pas : sa perle fait juste un petit bond
        if (me.state[idx(me, cell.c, cell.r)]) me.board!.hop(cell.c, cell.r, 0, 0.35)
        return
      }
      const i = idx(me, cell.c, cell.r)
      const s: Stroke = { erase: !!me.state[i], seen: new Set([i]) }
      me.strokes.set(e.pointerId, s)
      touchCell(me, cell.c, cell.r, s.erase)
    }
    const onMove = (e: PointerEvent) => {
      const s = me.strokes.get(e.pointerId)
      if (!s || me.phase !== 'play') return
      const cell = cellAt(me, e)
      if (!cell) return
      const i = idx(me, cell.c, cell.r)
      if (s.seen.has(i)) return
      s.seen.add(i)
      if (!isGiven(me.rd, cell.c, cell.r)) touchCell(me, cell.c, cell.r, s.erase)
    }
    const onUp = (e: PointerEvent) => {
      if (!me.strokes.delete(e.pointerId)) return
      checkDone(me)
    }
    holder.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    ;(async () => {
      const stage = await createStage(holder, {
        sky: '#E6D5BE', fov: 26, cam: [0, 30, 16], target: [0, 0, 0],
        hemi: ['#FFF3E2', '#8A6A4A', 0.72],
        sun: { pos: [-7, 18, 8], color: '#FFF1DC', intensity: 2.4, area: 12, far: 50 },
        fill: 0.3, exposure: 0.96, iblIntensity: 0.75
      })
      if (!me.running) { stage.dispose(); return }
      me.stage = stage
      const T = me.T = stage.T
      me.ray = new T.Raycaster()
      me.fx = particles(stage, 500)
      // L'établi : un grand plateau de bois clair
      const wood = woodTex(T, '#CFA271', 5)
      const table = new T.Mesh(new T.PlaneGeometry(90, 60), new T.MeshStandardMaterial({ map: wood, roughness: 0.62 }))
      table.rotation.x = -Math.PI / 2
      table.receiveShadow = true
      stage.scene.add(table)
      stage.keep({
        dispose: () => {
          me.iron?.dispose()
          me.threads.forEach(t => t.dispose())
          me.pots.forEach(p => p.pot.dispose())
          me.board?.dispose()
        }
      })
      stage.onResize = () => { frame(me); placePots(me) }
      hideLoader()
      startRound(me)
      stage.start(dt => { if (me_ === me && me.running) step(me, dt) })
      // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __mi: unknown }).__mi = {
          get round() { return me.round },
          get phase() { return me.phase },
          get motif() { return me.rd.motif },
          get mistakes() { return me.mistakes },
          get need() { return missing(me.rd, me.state).need },
          get wrong() { return missing(me.rd, me.state).wrong },
          /** Une case vide du côté à compléter qui doit le rester (pour tester
              l'erreur) : la plus proche du milieu, loin de la barre du haut. */
          get blank() {
            const n = me.rd.n, m = (n - 1) / 2
            let best: { c: number; r: number } | null = null, bd = Infinity
            for (let r = 0; r < n; r++) for (let cc = 0; cc < n; cc++) {
              if (isGiven(me.rd, cc, r) || wantAt(me.rd, cc, r) || me.state[idx(me, cc, r)]) continue
              const d = (cc - m) ** 2 + (r - m) ** 2
              if (d < bd) { bd = d; best = { c: cc, r } }
            }
            return best
          },
          at: (cc: number, r: number) => toScreen(stage, me.board!.world(cc, r, BEAD.h * 0.5)),
          /** Pose d'un coup toutes les perles justes (captures, affiches). */
          solve() {
            if (me.phase !== 'play') return
            for (const w of missing(me.rd, me.state).wrong) touchCell(me, w.c, w.r, true)
            for (const n of missing(me.rd, me.state).need) { me.color = n.color; touchCell(me, n.c, n.r, false) }
            checkDone(me)
          }
        }
      }
    })().catch(err => { hideLoader(); if (me.running) throw err })

    return () => {
      if (!me.running) return
      me.running = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      me.stage?.dispose()
      if (me_ === me) me_ = null
      const w = window as unknown as { __mi?: unknown }
      if (w.__mi) delete w.__mi
    }
  }
}
