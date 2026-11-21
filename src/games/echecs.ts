import type { GameContext, GameDef } from '../core/types'
import { sfx, preloadSfx } from '../core/sfx'
import { createStage, fitModel, loadModel, loader, picker, woodTex, type Stage, type T3 } from '../core/three3d'
import { particles, toScreen, type Particles } from '../core/scene3d'
import { comeBack, recall, type Item, type Recall } from '../core/facts'
import { chessSet, HEIGHT, squareAt, squareXZ, type ChessSet } from '../core/chess3d'
import {
  NAME, allLegal, attackers, build, clone, inCheck, isHome, isLegal, kingSq, lessonRank, pawnStuck, plan, play,
  pseudo, rankOf, reply, starsFor, type Exo, type Kind, type Move, type Piece, type Pos, type Round
} from '../core/chess'

/* ♟️ LES ÉCHECS (21/11, Apprendre) — pas une partie : huit petits exercices
   sur un vrai échiquier de bois, pour apprendre où vont les pièces, comment
   elles bougent, et les règles en gros (le père : « la position des pièces,
   leur déplacement, les règles »).

   Six leçons, que `core/chess.ts` tire et vérifie (règles testées) :
   ranger les pièces sur leur case de départ · bouger une pièce pour
   attraper des pommes · prendre les pièces noires · sortir d'un échec ·
   faire mat en un coup · le roque, la promotion, la prise en passant.
   Fleur : ranger, bouger, prendre (avec les silhouettes des pièces à
   poser). Éclair : en plus, l'échec. Flamme : le mat et les coups spéciaux,
   et les pastilles du mouvement ne viennent qu'après un raté.

   Sans un mot : on touche une pièce, les cases où ELLE VA s'allument (son
   mouvement, pas la réponse), on touche la case — ou on la fait glisser.
   Un coup qui laisse le roi en échec est refusé, et la ligne d'attaque se
   montre en rouge. Un coup qui ne fait pas mat est joué, le roi noir
   s'échappe, et tout revient en place. La voix ne dit que du contenu : le
   nom de la pièce touchée, « Échec ! », « Échec et mat ! », le nom d'un
   coup spécial. Apprendre : aucune sanction ; les étoiles comptent les
   ratés, et la mémoire (`recall('echecs')`) ramène un exercice raté trois
   exercices plus loin. */

type Phase = 'load' | 'intro' | 'play' | 'busy' | 'win' | 'out' | 'done'
type Mesh = import('three').Mesh
type Obj = import('three').Object3D

interface Man {
  p: Piece
  /** Sa case, ou −1 tant qu'il attend sur le côté (ranger). */
  sq: number
  mesh: Mesh
  /** Sa place sur le côté. */
  side: { x: number; z: number } | null
  gone: boolean
}

interface Tween { t: number; d: number; fn?: (k: number) => void; then?: () => void }

interface State {
  ctx: GameContext
  root: HTMLElement
  running: boolean
  memo: Recall
  queue: Item<Exo>[]
  round: number
  rd: Round
  pos: Pos
  phase: Phase
  pt: number
  /** Les ratés de la partie, et ceux de l'exercice. */
  misses: number
  rmiss: number
  moves: number
  dotsOn: boolean
  lastSaid: Kind | null
  stage: Stage | null
  T: T3 | null
  set: ChessSet | null
  fx: Particles | null
  pick: ReturnType<typeof picker> | null
  ray: import('three').Raycaster | null
  men: Man[]
  ghosts: Map<number, Mesh>
  apples: Map<number, Obj>
  apple: Obj | null
  sel: Man | null
  drag: { pid: number; man: Man; x0: number; y0: number; moved: boolean; ox: number; oz: number } | null
  tweens: Tween[]
  dots: Mesh[]
  rings: Mesh[]
  selTint: Mesh | null
  checkTint: Mesh | null
  crown: Mesh | null
  line: Mesh | null
  lineT: number
  clock: number
  cam: { pos: import('three').Vector3; tg: import('three').Vector3 } | null
  goal: { pos: import('three').Vector3; tg: import('three').Vector3 } | null
}

let me_: State | null = null

/** L'inclinaison de la caméra (depuis la verticale) : assez haut pour que
    les grandes pièces ne cachent pas les cases derrière elles. */
const TILT = 0.7
const SIDE_X = 5.5

const $ = (me: State, sel: string) => me.root.querySelector<HTMLElement>(sel)!
const ease = (k: number) => k * k * (3 - 2 * k)

function tween(me: State, d: number, fn?: (k: number) => void, then?: () => void) {
  me.tweens.push({ t: 0, d, fn, then })
}

const miss = (me: State) => { me.rmiss++; me.misses++ }

/* ---------- Le cadrage ---------- */
function frame(me: State, snap = false) {
  const st = me.stage!, T = me.T!, cam = st.camera
  const wide = me.rd.goal === 'place'
  const box = { x0: -4.7, x1: wide ? SIDE_X + 1.9 : 4.7, z0: -4.7, z1: 4.7 }
  const dir = new T.Vector3(0, Math.cos(TILT), Math.sin(TILT))
  const tg = new T.Vector3((box.x0 + box.x1) / 2, 0, 0)
  let dist = 30
  const corners = [box.x0, box.x1].flatMap(x => [box.z0, box.z1].flatMap(z => [0, 1.5].map(y => new T.Vector3(x, y, z))))
  const v = new T.Vector3()
  // La barre ronde flotte en haut : la scène se cale un peu plus bas
  const want = { w: 1.9, h: 1.74, cx: 0, cy: -0.08 }
  const keepPos = cam.position.clone(), keepQ = cam.quaternion.clone()
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
  me.goal = { pos: tg.clone().addScaledVector(dir, dist), tg }
  if (snap || !me.cam) me.cam = { pos: me.goal.pos.clone(), tg: me.goal.tg.clone() }
  cam.position.copy(keepPos)
  cam.quaternion.copy(keepQ)
  aimCam(me)
}

function aimCam(me: State) {
  const cam = me.stage!.camera, c = me.cam!
  cam.position.copy(c.pos)
  cam.lookAt(c.tg)
  cam.updateMatrixWorld()
}

function paintDots(me: State) {
  $(me, '.ec-dots').innerHTML = me.queue.map((_, i) =>
    `<i class="sn-dot${i < me.round ? ' on' : ''}${i === me.round ? ' cur' : ''}"></i>`).join('')
}

/* ---------- Les pièces ---------- */
function place(man: Man) {
  const p = man.sq >= 0 ? squareXZ(man.sq) : man.side!
  man.mesh.position.set(p.x, 0, p.z)
}

function addMan(me: State, p: Piece, s: number, side: { x: number; z: number } | null, delay: number): Man {
  const mesh = me.set!.make(p)
  const man: Man = { p, sq: s, mesh, side, gone: false }
  place(man)
  mesh.scale.setScalar(0.001)
  me.stage!.scene.add(mesh)
  // Elle pousse en rebondissant, chacune à son tour
  const pop = 0.32
  tween(me, delay + pop, k => {
    const u = Math.max(0, (k * (delay + pop) - delay) / pop)
    mesh.scale.setScalar(Math.max(0.001, ease(u) * (1 + 0.25 * Math.sin(u * Math.PI))))
  }, () => mesh.scale.setScalar(1))
  me.men.push(man)
  return man
}

const manAt = (me: State, s: number) => me.men.find(m => !m.gone && m.sq === s) ?? null

/** Fait aller une pièce à sa case (ou à sa place sur le côté). */
function glide(me: State, man: Man, hop: boolean, then?: () => void) {
  const to = man.sq >= 0 ? squareXZ(man.sq) : man.side!
  const from = { x: man.mesh.position.x, y: man.mesh.position.y, z: man.mesh.position.z }
  const L = Math.hypot(to.x - from.x, to.z - from.z)
  const d = Math.min(0.55, 0.16 + L * 0.07)
  tween(me, d, k => {
    const u = ease(k)
    man.mesh.position.set(from.x + (to.x - from.x) * u, from.y * (1 - u) + (hop ? Math.sin(k * Math.PI) * 0.9 : 0), from.z + (to.z - from.z) * u)
  }, () => {
    man.mesh.position.set(to.x, 0, to.z)
    then?.()
  })
}

function burst(me: State, s: number, colors: number[], count = 26) {
  const p = squareXZ(s)
  me.fx?.burst({ x: p.x, y: 0.5, z: p.z }, { count, color: colors, speed: 5, spread: 0.9, life: 0.9, size: 1.1, gravity: 9 })
}

/** Applique un coup : la position, les pièces qui glissent, celle qui est prise. */
function apply(me: State, m: Move, then: () => void) {
  const man = manAt(me, m.from)!
  const taken = m.take !== undefined ? manAt(me, m.take) : null
  me.pos = play(me.pos, m)
  me.phase = 'busy'
  man.sq = m.to
  if (m.castle) {
    const home = rankOf(m.from) * 8
    const rook = manAt(me, home + (m.castle === 'K' ? 7 : 0))!
    rook.sq = home + (m.castle === 'K' ? 5 : 3)
    glide(me, rook, true)
  }
  glide(me, man, man.p.k === 'N' || !!m.castle, () => {
    if (taken) {
      taken.gone = true
      taken.mesh.visible = false
      burst(me, m.take!, taken.p.s === 'b' ? [0x2B1C15, 0x84512F, 0xFFD34D] : [0xD9CDB4, 0xFFFFFF, 0xFFD34D])
      sfx('chop', { vol: 0.5 })
    } else sfx('drop', { vol: 0.5, rate: man.p.k === 'P' ? 1.3 : 1 })
    if (m.promo) {
      // Le pion devient une dame
      const q = me.set!.make({ k: m.promo, s: man.p.s })
      q.position.copy(man.mesh.position)
      me.stage!.scene.remove(man.mesh)
      me.stage!.scene.add(q)
      man.mesh = q
      man.p = { k: m.promo, s: man.p.s }
      burst(me, m.to, [0xFFD34D, 0xFFFFFF, 0xFF6B81], 50)
    }
    then()
  })
}

/* ---------- Les marques sur le plateau ---------- */
function marks(me: State) {
  const rd = me.rd, pos = me.pos
  me.dots.forEach(d => { d.visible = false })
  me.rings.forEach(r => { r.visible = false; r.userData.hot = false })
  let nd = 0, nr = 0
  const ring = (s: number, hot: boolean) => {
    let r = me.rings.find(x => x.visible && x.userData.sq === s)
    if (!r) { r = me.rings[nr++]; if (!r) return }
    const p = squareXZ(s)
    r.position.set(p.x, 0.02, p.z)
    r.userData.sq = s
    r.userData.hot = hot || r.userData.hot
    r.visible = true
  }
  if (rd.goal === 'takes') pos.board.forEach((p, s) => { if (p?.s === 'b') ring(s, false) })
  const sel = me.sel
  me.selTint!.visible = !!sel && sel.sq >= 0
  if (sel && sel.sq >= 0) {
    const p = squareXZ(sel.sq)
    me.selTint!.position.set(p.x, 0.012, p.z)
    if (me.dotsOn && rd.goal !== 'place') {
      for (const m of pseudo(pos, sel.sq)) {
        if (m.take !== undefined) { ring(m.to, true); continue }
        const d = me.dots[nd++]
        if (!d) break
        const q = squareXZ(m.to)
        d.position.set(q.x, 0.02, q.z)
        d.visible = true
      }
    }
  }
  const wk = kingSq(pos.board, 'w')
  const check = wk >= 0 && inCheck(pos, 'w')
  me.checkTint!.visible = check
  if (check) { const p = squareXZ(wk); me.checkTint!.position.set(p.x, 0.014, p.z) }
  // Le mat : une couronne d'or sous le roi à prendre au piège
  const bk = kingSq(pos.board, 'b')
  me.crown!.visible = rd.exo.lesson === 'mat' && bk >= 0
  if (me.crown!.visible) { const p = squareXZ(bk); me.crown!.position.set(p.x, 0.02, p.z) }
}

/** La ligne d'attaque, en rouge, de la pièce qui menace jusqu'au roi. */
function showLine(me: State, from: number, to: number) {
  const a = squareXZ(from), b = squareXZ(to), ln = me.line!
  const L = Math.hypot(b.x - a.x, b.z - a.z)
  ln.scale.set(L, 1, 1)
  ln.position.set((a.x + b.x) / 2, 0.03, (a.z + b.z) / 2)
  ln.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x)
  ln.visible = true
  me.lineT = 1.1
}

/* ---------- Un exercice ---------- */
function clearRound(me: State) {
  const sc = me.stage!.scene
  me.tweens = []
  for (const m of me.men) sc.remove(m.mesh)
  me.men = []
  me.ghosts.forEach(g => sc.remove(g))
  me.ghosts.clear()
  me.apples.forEach(a => sc.remove(a))
  me.apples.clear()
  me.sel = null
  me.drag = null
  if (me.line) me.line.visible = false
}

function sidePlace(i: number, n: number) {
  const rows = Math.ceil(n / 2)
  return { x: SIDE_X + (i % 2) * 1.15, z: (Math.floor(i / 2) - (rows - 1) / 2) * 1.25 }
}

function startRound(me: State) {
  const st = me.stage!
  clearRound(me)
  const rd = me.rd = build(me.queue[me.round].fact, me.ctx.tier)
  me.pos = clone(rd.pos)
  me.rmiss = 0
  me.moves = 0
  me.dotsOn = rd.dots
  me.lastSaid = null
  let i = 0
  rd.pos.board.forEach((p, s) => { if (p) addMan(me, p, s, null, Math.min(0.5, i++ * 0.03)) })
  rd.tray.forEach((p, k) => addMan(me, p, -1, sidePlace(k, rd.tray.length), 0.3 + k * 0.05))
  if (rd.ghosts) {
    // Les silhouettes : une par case vide à remplir
    const left = [...rd.tray]
    for (let s = 0; s < 64; s++) {
      if (rd.pos.board[s]) continue
      const k = left.findIndex(p => isHome(p, s))
      if (k < 0) continue
      const g = me.set!.ghost(left[k])
      left.splice(k, 1)
      const q = squareXZ(s)
      g.position.set(q.x, 0, q.z)
      st.scene.add(g)
      me.ghosts.set(s, g)
    }
  }
  for (const s of rd.apples) {
    if (!me.apple) break
    const a = me.apple.clone(true)
    const q = squareXZ(s)
    a.position.set(q.x, 0.2, q.z)
    a.userData.x = q.x
    st.scene.add(a)
    me.apples.set(s, a)
  }
  frame(me, me.round === 0 && !me.cam)
  marks(me)
  paintDots(me)
  me.phase = 'intro'
  me.pt = 0
  st.settle()
}

/** Tout revient comme au début de l'exercice (le pion coincé). */
function restart(me: State) {
  miss(me)
  me.phase = 'busy'
  sfx('whoosh', { vol: 0.3 })
  tween(me, 0.5, undefined, () => {
    const keep = me.rmiss
    startRound(me)
    me.rmiss = keep
    me.dotsOn = true
  })
}

function win(me: State) {
  const rd = me.rd
  me.phase = 'win'
  me.pt = 0
  if (me.sel) me.sel.mesh.position.y = 0
  me.sel = null
  marks(me)
  // Trop de détours : l'exercice reviendra, sans que rien ne le dise
  const free = rd.goal === 'apples' || rd.goal === 'takes'
  const ok = me.rmiss === 0 && (!free || me.moves <= rd.par + 1)
  me.memo.note(me.queue[me.round], ok)
  if (!ok) comeBack(me.queue, me.round)
  me.round++
  paintDots(me)
  if (rd.done) me.ctx.say(rd.done)
  sfx('confirm', { vol: 0.7 })
  me.fx?.burst({ x: 0, y: 1.2, z: 0 }, { count: 70, color: [0xFF4F86, 0xFFB627, 0x41C26A, 0x3D9BF0, 0xFFFFFF], speed: 9, spread: 0.7, life: 1.5, size: 1.3, gravity: 10 })
  if (rd.exo.lesson === 'mat') {
    // Le roi noir se couche : c'est fini pour lui
    const k = me.men.find(m => !m.gone && m.p.k === 'K' && m.p.s === 'b')
    if (k) tween(me, 0.5, u => { k.mesh.rotation.z = ease(u) * Math.PI / 2; k.mesh.position.y = ease(u) * 0.3 })
  }
}

function finish(me: State) {
  me.phase = 'done'
  me.ctx.finish({
    title: 'Bien joué !',
    msg: `Tu as réussi ${me.queue.length} exercices d'échecs`,
    stars: starsFor(me.misses),
    outroMs: 1200
  })
}

/* ---------- Les coups ---------- */
function shakeMan(me: State, man: Man) {
  const home = man.sq >= 0 ? squareXZ(man.sq) : man.side!
  const from = { x: man.mesh.position.x, y: man.mesh.position.y, z: man.mesh.position.z }
  tween(me, 0.36, k => {
    const u = ease(Math.min(1, k * 2))
    man.mesh.position.set(from.x + (home.x - from.x) * u + Math.sin(k * Math.PI * 5) * 0.09 * (1 - k), from.y * (1 - u), from.z + (home.z - from.z) * u)
  }, () => man.mesh.position.set(home.x, 0, home.z))
}

/** Un coup refusé : la pièce revient en tremblant. */
function refuse(me: State, man: Man, m: Move | null) {
  miss(me)
  me.dotsOn = true
  sfx('error', { vol: 0.28 })
  shakeMan(me, man)
  if (m) {
    // Pourquoi : la pièce qui menacerait encore le roi
    const after = play(me.pos, m)
    const k = kingSq(after.board, 'w')
    const by = k >= 0 ? attackers(after.board, k, 'b') : []
    if (by.length) showLine(me, by[0], k)
  }
  marks(me)
}

interface Snap { pos: Pos; men: { m: Man; sq: number; gone: boolean }[] }
const snapOf = (me: State): Snap => ({ pos: clone(me.pos), men: me.men.map(m => ({ m, sq: m.sq, gone: m.gone })) })

function restore(me: State, s: Snap, then: () => void) {
  me.pos = s.pos
  for (const { m, sq, gone } of s.men) {
    m.gone = gone
    m.mesh.visible = !gone
    if (m.sq !== sq) { m.sq = sq; glide(me, m, false) }
  }
  tween(me, 0.6, undefined, then)
}

/** Un coup permis qui ne fait pas mat : le roi noir s'en sort, puis tout revient. */
function notMate(me: State, m: Move) {
  const snap = snapOf(me)
  miss(me)
  me.dotsOn = true
  me.sel = null
  apply(me, m, () => {
    marks(me)
    if (inCheck(me.pos, 'b')) me.ctx.say('Échec !')
    const back = () => restore(me, snap, () => { me.phase = 'play'; marks(me) })
    const r = reply(me.pos)
    tween(me, 0.5, undefined, () => {
      if (!r) { sfx('error', { vol: 0.25 }); back(); return }
      apply(me, r, () => tween(me, 0.7, undefined, back))
    })
  })
}

function afterMove(me: State, man: Man, m: Move) {
  const rd = me.rd
  me.moves++
  const a = me.apples.get(m.to)
  if (a) {
    me.apples.delete(m.to)
    me.stage!.scene.remove(a)
    burst(me, m.to, [0xD92B2B, 0xFF6B81, 0x94D82D])
    sfx('pluck', { vol: 0.5, rate: 1.5 })
  }
  if (rd.goal === 'apples' || rd.goal === 'takes') { me.pos.turn = 'w'; me.pos.ep = -1 }
  const foes = me.pos.board.flatMap((p, s) => (p?.s === 'b' ? [s] : []))
  const done = rd.goal === 'apples' ? me.apples.size === 0 : rd.goal === 'takes' ? foes.length === 0 : true
  if (done) { win(me); return }
  if (rd.goal === 'takes' && man.p.k === 'P' && pawnStuck(man.sq, foes)) { restart(me); return }
  me.phase = 'play'
  me.sel = man
  marks(me)
}

function tryMove(me: State, man: Man, to: number) {
  const rd = me.rd
  const m = pseudo(me.pos, man.sq).find(x => x.to === to)
  if (!m) {
    // Pas un mouvement de cette pièce : à la flamme, les pastilles viennent l'aider
    if (!me.dotsOn) { refuse(me, man, null); return }
    shakeMan(me, man)
    return
  }
  if (rd.goal === 'legal' || rd.goal === 'moves') {
    if (!isLegal(me.pos, m)) { refuse(me, man, m); return }
    if (rd.goal === 'moves' && !rd.want.some(w => w.from === m.from && w.to === m.to)) {
      if (rd.exo.lesson === 'mat') notMate(me, m)
      else refuse(me, man, null)
      return
    }
  }
  me.sel = null
  marks(me)
  apply(me, m, () => afterMove(me, man, m))
}

/** Ranger : poser une pièce du côté sur une case. */
function tryPlace(me: State, man: Man, s: number) {
  if (s < 0 || me.pos.board[s] || !isHome(man.p, s)) {
    // Une case déjà prise n'est pas une erreur : seulement une mauvaise case vide
    if (s >= 0 && !me.pos.board[s]) { miss(me); sfx('error', { vol: 0.28 }) }
    shakeMan(me, man)
    return
  }
  me.pos.board[s] = man.p
  man.sq = s
  me.sel = null
  const g = me.ghosts.get(s)
  if (g) { me.stage!.scene.remove(g); me.ghosts.delete(s) }
  me.phase = 'busy'
  marks(me)
  glide(me, man, true, () => {
    sfx('drop', { vol: 0.55 })
    burst(me, s, [0xFFD34D, 0xFFFFFF], 14)
    if (me.men.every(x => x.sq >= 0)) win(me)
    else me.phase = 'play'
  })
}

const selectable = (me: State, man: Man) =>
  !man.gone && (me.rd.goal === 'place' ? man.sq < 0 : man.sq >= 0 && man.p.s === 'w')

function select(me: State, man: Man) {
  if (me.sel !== man) {
    sfx('select', { vol: 0.3 })
    if (me.sel && !me.sel.gone) me.sel.mesh.position.y = 0
  }
  me.sel = man
  // Le nom de la pièce (du contenu) — une fois, pas à chaque toucher
  if (me.lastSaid !== man.p.k) { me.lastSaid = man.p.k; me.ctx.say(NAME[man.p.k]) }
  marks(me)
}

/* ---------- Le doigt ---------- */
/** Le point du plateau (y = 0) sous le doigt. */
function under(me: State, e: { clientX: number; clientY: number }) {
  const st = me.stage
  if (!st || !me.ray) return null
  const r = st.renderer.domElement.getBoundingClientRect()
  const v = new me.T!.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  me.ray.setFromCamera(v, st.camera)
  const ray = me.ray.ray
  if (Math.abs(ray.direction.y) < 1e-6) return null
  const t = -ray.origin.y / ray.direction.y
  return t < 0 ? null : { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t }
}

/** La pièce sous le doigt (la première que le rayon touche). */
function manUnder(me: State, e: { clientX: number; clientY: number }): Man | null {
  if (!me.pick) return null
  const live = me.men.filter(m => !m.gone)
  const hit = me.pick(e, live.map(m => m.mesh), false)[0]
  return hit ? live.find(m => m.mesh === hit.object) ?? null : null
}

/* ---------- La boucle ---------- */
function step(me: State, dt: number) {
  me.pt += dt
  me.clock += dt
  me.fx?.update(dt)
  // Les animations (une liste figée : une fin peut en lancer d'autres)
  for (const tw of [...me.tweens]) {
    tw.t += dt
    const k = Math.min(1, tw.t / tw.d)
    tw.fn?.(k)
    if (k >= 1) {
      const i = me.tweens.indexOf(tw)
      if (i >= 0) me.tweens.splice(i, 1)
      tw.then?.()
    }
  }
  // La caméra rejoint son cadrage
  if (me.cam && me.goal) {
    const k = 1 - Math.pow(0.004, dt)
    me.cam.pos.lerp(me.goal.pos, k)
    me.cam.tg.lerp(me.goal.tg, k)
    aimCam(me)
  }
  // Ce qui respire : les pommes, les anneaux, la case du roi en échec
  const t = me.clock
  me.apples.forEach((a, s) => {
    a.position.y = 0.22 + Math.sin(t * 2.6 + s) * 0.07
    a.rotation.y = t * 1.2 + s
  })
  for (const r of me.rings) if (r.visible) r.scale.setScalar(1 + Math.sin(t * (r.userData.hot ? 7 : 3.2)) * (r.userData.hot ? 0.09 : 0.05))
  if (me.checkTint?.visible) (me.checkTint.material as import('three').MeshBasicMaterial).opacity = 0.5 + Math.sin(t * 6) * 0.22
  if (me.crown?.visible) me.crown.scale.setScalar(1 + Math.sin(t * 3.4) * 0.07)
  if (me.sel && !me.drag && me.phase === 'play') me.sel.mesh.position.y = 0.06 + Math.abs(Math.sin(t * 3.2)) * 0.07
  if (me.lineT > 0) {
    me.lineT -= dt
    if (me.lineT <= 0 && me.line) me.line.visible = false
  }

  if (me.phase === 'intro' && me.pt > 0.75) {
    const rd = me.rd
    if (rd.say) {
      me.ctx.say(rd.say)
      const k = (Object.keys(NAME) as Kind[]).find(x => NAME[x] === rd.say)
      if (k) me.lastSaid = k
    }
    // L'échec : d'où il vient, en rouge, le temps de le voir
    if (rd.goal === 'legal') {
      const k = kingSq(me.pos.board, 'w')
      const by = attackers(me.pos.board, k, 'b')
      if (by.length) { showLine(me, by[0], k); me.lineT = 1.8 }
    }
    if (rd.intro) apply(me, rd.intro, () => { me.phase = 'play'; marks(me) })
    else me.phase = 'play'
    // Une seule pièce à jouer : elle est déjà choisie
    const mine = me.men.filter(m => selectable(me, m))
    if (rd.goal !== 'place' && mine.length === 1) { me.sel = mine[0]; marks(me) }
  }
  if (me.phase === 'win' && me.pt > 1.7) {
    if (me.round >= me.queue.length) { finish(me); return }
    me.phase = 'out'
    me.pt = 0
    sfx('whoosh', { vol: 0.3 })
    const all: Obj[] = [...me.men.map(m => m.mesh), ...me.apples.values()]
    tween(me, 0.36, k => all.forEach(o => o.scale.setScalar(Math.max(0.001, 1 - ease(k)))))
  }
  if (me.phase === 'out' && me.pt > 0.42) startRound(me)
}

/* ---------- La bonne suite, pour la main et pour le bot ---------- */
function nextMove(me: State): { from: number; to: number } | null {
  const rd = me.rd, pos = me.pos
  const mine = pos.board.findIndex(p => p?.s === 'w')
  if (rd.goal === 'apples') {
    const a = rd.apples.find(s => me.apples.has(s))
    if (a === undefined || mine < 0) return null
    const opts = pseudo(pos, mine)
    const m = opts.find(x => x.to === a) ?? opts.find(x => !x.double && x.take === undefined)
    return m ? { from: m.from, to: m.to } : null
  }
  if (rd.goal === 'takes') {
    const t = rd.targets.find(s => pos.board[s]?.s === 'b')
    return t === undefined || mine < 0 ? null : { from: mine, to: t }
  }
  if (rd.goal === 'moves') return rd.want[0] ?? null
  if (rd.goal === 'legal') return allLegal(pos)[0] ?? null
  return null
}

export const echecs: GameDef = {
  id: 'echecs', name: 'Les Échecs', icon: '♟️', sq: 'sq-peach', cat: 'reflexion',
  subtitle: 'Apprends où vont les pièces et comment elles bougent',
  // La main : toucher une pièce, puis l'une des cases où elle va — jamais la bonne
  hand: () => {
    const me = me_
    if (!me || me.phase !== 'play' || me.drag || !me.stage) return null
    const st = me.stage
    const spot = (m: Man) => toScreen(st, { x: m.mesh.position.x, y: HEIGHT[m.p.k] * 0.5, z: m.mesh.position.z })
    const cell = (s: number) => { const p = squareXZ(s); return toScreen(st, { x: p.x, y: 0, z: p.z }) }
    const mine = me.men.filter(m => selectable(me, m))
    if (me.rd.goal === 'place') {
      const sel = me.sel
      if (!sel) return mine.length ? { tap: spot(mine[Math.floor(Math.random() * mine.length)]) } : null
      // La fleur : la silhouette dit déjà où elle va
      const g = [...me.ghosts.keys()].find(s => isHome(sel.p, s))
      return g === undefined ? null : { drag: [spot(sel), cell(g)] }
    }
    if (!me.sel) return mine.length === 1 ? { tap: spot(mine[0]) } : mine.length ? { choose: mine.slice(0, 4).map(spot) } : null
    if (!me.dotsOn) return null
    const tos = pseudo(me.pos, me.sel.sq).map(m => m.to)
    if (!tos.length) return null
    const some = tos.sort(() => Math.random() - 0.5).slice(0, 3)
    return { choose: some.map(cell) }
  },
  mount(c) {
    c.root.innerHTML = `
      <div class="arena ec-arena">
        <div class="ec-scene"></div>
        <div class="mem-dots ec-dots"></div>
      </div>`
    preloadSfx(['select', 'drop', 'chop', 'pluck', 'confirm', 'error', 'whoosh'])
    const memo = recall('echecs')
    const queue = memo.mix<Exo>(plan(c.tier)).sort((a, b) => lessonRank(a.fact) - lessonRank(b.fact))
    const me: State = {
      ctx: c, root: c.root, running: true, memo, queue, round: 0,
      rd: build(queue[0].fact, c.tier), pos: null as unknown as Pos, phase: 'load', pt: 0,
      misses: 0, rmiss: 0, moves: 0, dotsOn: true, lastSaid: null,
      stage: null, T: null, set: null, fx: null, pick: null, ray: null,
      men: [], ghosts: new Map(), apples: new Map(), apple: null, sel: null, drag: null, tweens: [],
      dots: [], rings: [], selTint: null, checkTint: null, crown: null, line: null, lineT: 0, clock: 0,
      cam: null, goal: null
    }
    me.pos = clone(me.rd.pos)
    me_ = me
    paintDots(me)
    const holder = c.root.querySelector<HTMLElement>('.ec-scene')!
    const hideLoader = loader(holder, 'echecs')

    const onDown = (e: PointerEvent) => {
      if (me.phase !== 'play' || me.drag) return
      const hit = manUnder(me, e)
      const p = under(me, e)
      if (hit && selectable(me, hit)) {
        e.preventDefault()
        select(me, hit)
        me.drag = { pid: e.pointerId, man: hit, x0: e.clientX, y0: e.clientY, moved: false, ox: p ? hit.mesh.position.x - p.x : 0, oz: p ? hit.mesh.position.z - p.z : 0 }
        return
      }
      const sel = me.sel
      if (!sel) return
      const s = hit && hit.sq >= 0 ? hit.sq : p ? squareAt(p.x, p.z) : -1
      if (me.rd.goal === 'place') tryPlace(me, sel, s)
      else if (s >= 0 && s !== sel.sq) tryMove(me, sel, s)
    }
    const onMove = (e: PointerEvent) => {
      const d = me.drag
      if (!d || d.pid !== e.pointerId) return
      if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 12) return
      d.moved = true
      const p = under(me, e)
      if (p) d.man.mesh.position.set(p.x + d.ox, 0.3, p.z + d.oz)
    }
    const onUp = (e: PointerEvent) => {
      const d = me.drag
      if (!d || d.pid !== e.pointerId) return
      me.drag = null
      if (!d.moved || me.phase !== 'play') { if (d.moved) shakeMan(me, d.man); return }
      // Lâchée : la case sous la pièce (pas sous le doigt, qui la tient par le corps)
      const s = squareAt(d.man.mesh.position.x, d.man.mesh.position.z)
      if (me.rd.goal === 'place') tryPlace(me, d.man, s)
      else if (s < 0 || s === d.man.sq) glide(me, d.man, false)
      else tryMove(me, d.man, s)
    }
    holder.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    ;(async () => {
      const stage = await createStage(holder, {
        sky: '#DDE9D6', fov: 26, cam: [0, 26, 18], target: [0, 0, 0],
        hemi: ['#FFF6E8', '#8A7A5A', 0.7],
        sun: { pos: [-6, 16, 9], color: '#FFF1DC', intensity: 2.3, area: 11, far: 60 },
        fill: 0.32, exposure: 0.95, iblIntensity: 0.7
      })
      if (!me.running) { stage.dispose(); return }
      const [set, apple] = await Promise.all([chessSet(stage), loadModel('food', 'apple').catch(() => null)])
      if (!me.running) { set.dispose(); stage.dispose(); return }
      me.stage = stage
      const T = me.T = stage.T
      me.set = set
      me.ray = new T.Raycaster()
      me.pick = picker(stage)
      me.fx = particles(stage, 400)
      stage.scene.add(set.group)
      if (apple) me.apple = fitModel(T, apple, 0.5)
      // La table de bois sous l'échiquier
      const table = new T.Mesh(new T.PlaneGeometry(90, 60), new T.MeshStandardMaterial({ map: woodTex(T, '#7E5C3E', 4), roughness: 0.7 }))
      table.rotation.x = -Math.PI / 2
      table.position.y = -0.36
      table.receiveShadow = true
      stage.scene.add(table)

      // Les marques : pastilles (où va la pièce), anneaux (ce qu'elle prend)…
      const flat = (g: import('three').BufferGeometry, color: number, opacity: number) => {
        const m = new T.Mesh(g, new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }))
        m.rotation.x = -Math.PI / 2
        m.visible = false
        m.renderOrder = 3
        stage.scene.add(m)
        return m
      }
      const dotG = new T.CircleGeometry(0.17, 20), ringG = new T.RingGeometry(0.33, 0.45, 28), sqG = new T.PlaneGeometry(0.98, 0.98)
      for (let i = 0; i < 28; i++) me.dots.push(flat(dotG, 0x2E9E57, 0.85))
      for (let i = 0; i < 14; i++) me.rings.push(flat(ringG, 0xF0503C, 0.92))
      me.selTint = flat(sqG, 0xFFD34D, 0.55)
      me.checkTint = flat(sqG, 0xE5322D, 0.6)
      me.crown = flat(ringG, 0xFFC21F, 0.95)
      const ln = new T.Mesh(new T.BoxGeometry(1, 0.03, 0.14), new T.MeshBasicMaterial({ color: 0xE5322D, transparent: true, opacity: 0.85, depthWrite: false }))
      ln.visible = false
      ln.renderOrder = 5
      stage.scene.add(ln)
      me.line = ln

      stage.keep({ dispose: () => set.dispose() })
      stage.onResize = () => frame(me, true)
      hideLoader()
      startRound(me)
      stage.start(dt => { if (me_ === me && me.running) step(me, dt) })

      // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        /** Un point de cette case qu'un doigt toucherait vraiment (pas caché par une grande pièce devant). */
        const aim = (s: number) => {
          const q = squareXZ(s), man = manAt(me, s)
          const tries = man
            ? [0.45, 0.7, 0.25, 0.9].map(k => ({ x: q.x, y: HEIGHT[man.p.k] * k, z: q.z }))
            : [[0, 0], [0, 0.3], [0.3, 0], [-0.3, 0], [0, -0.3], [0.3, 0.3], [-0.3, 0.3]].map(([dx, dz]) => ({ x: q.x + dx, y: 0, z: q.z + dz }))
          for (const w of tries) {
            const p = toScreen(stage, w)
            const hit = manUnder(me, { clientX: p.x, clientY: p.y })
            if (man ? hit === man : !hit) return { ...p, h: w.y }
          }
          return { ...toScreen(stage, tries[0]), h: tries[0].y }
        }
        ;(window as unknown as { __ec: unknown }).__ec = {
          get round() { return me.round },
          get phase() { return me.phase },
          get lesson() { return me.rd.exo.lesson },
          get id() { return me.rd.exo.id },
          get goal() { return me.rd.goal },
          get misses() { return me.misses },
          get total() { return me.queue.length },
          get dots() { return me.dots.filter(d => d.visible).length },
          get apples() { return me.apples.size },
          get check() { return inCheck(me.pos, 'w') },
          get ghosts() { return me.ghosts.size },
          aim,
          /** Le centre d'une case à la hauteur `h` : où tenir une pièce prise à cette hauteur pour la poser là. */
          at(s: number, h: number) { const q = squareXZ(s); return toScreen(stage, { x: q.x, y: h, z: q.z }) },
          /** Les pièces qui attendent sur le côté, et la case de chacune. */
          tray() {
            const free = new Set(me.pos.board.flatMap((p, s) => (p ? [] : [s])))
            return me.men.filter(m => m.sq < 0).map(m => {
              const to = [...free].find(s => isHome(m.p, s)) ?? -1
              free.delete(to)
              const wrong = [...free].find(s => !isHome(m.p, s) && rankOf(s) >= 2 && rankOf(s) <= 5) ?? -1
              const p = toScreen(stage, { x: m.side!.x, y: HEIGHT[m.p.k] * 0.45, z: m.side!.z })
              return { k: m.p.k, x: p.x, y: p.y, h: HEIGHT[m.p.k] * 0.45, to, wrong }
            })
          },
          next: () => nextMove(me),
          /** Un coup que le jeu doit refuser (laisse le roi en échec), ou un coup permis qui ne fait pas mat. */
          bad() {
            const pos = me.pos
            if (me.rd.goal === 'legal') {
              for (let s = 0; s < 64; s++) {
                if (pos.board[s]?.s !== 'w') continue
                const m = pseudo(pos, s).find(x => !isLegal(pos, x))
                if (m) return { from: m.from, to: m.to }
              }
            }
            if (me.rd.exo.lesson === 'mat') {
              const m = allLegal(pos).find(x => !me.rd.want.some(w => w.from === x.from && w.to === x.to))
              if (m) return { from: m.from, to: m.to }
            }
            return null
          }
        }
      }
    })().catch(err => { hideLoader(); console.error(err); if (me.running) throw err })

    return () => {
      if (!me.running) return
      me.running = false
      holder.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      me.stage?.dispose()
      if (me_ === me) me_ = null
      const w = window as unknown as { __ec?: unknown }
      if (w.__ec) delete w.__ec
    }
  }
}
