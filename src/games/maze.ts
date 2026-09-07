import type { GameContext, GameDef } from '../core/types'
import { $, shuffle } from '../core/utils'
import { impact } from '../core/impact'
import { sfx, preloadSfx } from '../core/sfx'
import { ICON } from '../core/icons'
import { FX } from '../core/fx'
import { frameStyle, loadAtlas, type Atlas } from '../core/sprites'

/* Labyrinthe — trois façons de se perdre : le jour (classique), la nuit
   (on ne voit qu'autour du poussin), la glace (on glisse jusqu'au mur).

   Polish du 7/09 (phase 2, jeux 2D) :
   - plein écran : le plateau prend toute la hauteur, les modes sont une
     colonne d'icônes, les manches des pastilles — plus rien à lire ;
   - le doigt rapide ne décroche plus : la case visée est rejointe en
     suivant le couloir si elle est à moins de six pas (recherche courte,
     jamais un résolveur), sinon on avance vers elle et on cogne ;
   - un mur heurté se sent : petit choc, le poussin s'écrase, poussière ;
   - retrouver la poule, c'est une fête : câlin, cœurs, son de victoire ;
   - timers de partie (`ctx.after`), état typé, plus d'emoji. */

interface Cell { walls: boolean[] } // haut, droite, bas, gauche
type Mode = 'classic' | 'fog' | 'ice'

interface State {
  running: boolean
  atlas: Atlas | null
  mode: Mode
  sizes: number[]
  round: number
  grid: Cell[][]
  n: number
  px: number
  cell: number
  pos: { x: number; y: number }
  down: boolean
  swipe: { x: number; y: number } | null
  t0: number
  lastBump: number
  won: boolean
}

let mz: State | null = null
let ctx: GameContext

const D = [[0, -1], [1, 0], [0, 1], [-1, 0]]
const MODES: { id: Mode; icon: string; factor: number }[] = [
  { id: 'classic', icon: ICON.sun, factor: 1 },
  { id: 'fog', icon: ICON.moon, factor: 1.6 },
  { id: 'ice', icon: ICON.snowflake, factor: 1.5 }
]

function generate(n: number): Cell[][] {
  const g: Cell[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => ({ walls: [true, true, true, true] })))
  const seen = Array.from({ length: n }, () => Array(n).fill(false))
  const stack: [number, number][] = [[0, 0]]
  seen[0][0] = true
  const DD: [number, number, number, number][] = [[0, -1, 0, 2], [1, 0, 1, 3], [0, 1, 2, 0], [-1, 0, 3, 1]]
  while (stack.length) {
    const [x, y] = stack[stack.length - 1]
    const opts = shuffle([...DD]).filter(([dx, dy]) => {
      const nx = x + dx, ny = y + dy
      return nx >= 0 && ny >= 0 && nx < n && ny < n && !seen[ny][nx]
    })
    if (!opts.length) { stack.pop(); continue }
    const [dx, dy, w, ow] = opts[0]
    const nx = x + dx, ny = y + dy
    g[y][x].walls[w] = false
    g[ny][nx].walls[ow] = false
    seen[ny][nx] = true
    stack.push([nx, ny])
  }
  return g
}

function sizesFor(mode: Mode): number[] {
  if (mode === 'fog') return ctx.byTier([6, 7, 8], [9, 11, 13], [13, 15, 17])
  return ctx.byTier([5, 6, 7], [8, 10, 12], [12, 14, 16])
}

/* La glace ne permet pas de s'arrêter en plein couloir : certaines grilles
   sont ingagnables en glissant. On vérifie par un parcours en « coups de
   glisse » que la sortie est atteignable (y compris en passant dessus). */
function iceSolvable(g: Cell[][], n: number): boolean {
  const seen = new Set(['0:0'])
  const stack: [number, number][] = [[0, 0]]
  while (stack.length) {
    const [x, y] = stack.pop()!
    if (x === n - 1 && y === n - 1) return true
    for (let d = 0; d < 4; d++) {
      let cx = x, cy = y
      while (!g[cy][cx].walls[d]) {
        cx += D[d][0]; cy += D[d][1]
        if (cx === n - 1 && cy === n - 1) return true
      }
      const k = cx + ':' + cy
      if ((cx !== x || cy !== y) && !seen.has(k)) { seen.add(k); stack.push([cx, cy]) }
    }
  }
  return false
}

/** Ouvre quelques murs intérieurs : la glace respire mieux et devient presque toujours gagnable. */
function braid(g: Cell[][], n: number, ratio: number) {
  const target = Math.floor(n * n * ratio)
  for (let k = 0; k < target; k++) {
    const x = 1 + Math.floor(Math.random() * (n - 2))
    const y = 1 + Math.floor(Math.random() * (n - 2))
    const d = Math.random() < 0.5 ? 1 : 2
    if (g[y][x].walls[d]) {
      g[y][x].walls[d] = false
      if (d === 1) g[y][x + 1].walls[3] = false
      else g[y + 1][x].walls[0] = false
    }
  }
}

function makeGrid(me: State, n: number): Cell[][] {
  if (me.mode !== 'ice') return generate(n)
  for (let attempt = 0; attempt < 80; attempt++) {
    const g = generate(n)
    braid(g, n, 0.18)
    if (iceSolvable(g, n)) return g
  }
  for (let attempt = 0; attempt < 40; attempt++) {
    const g = generate(n)
    braid(g, n, 0.5)
    if (iceSolvable(g, n)) return g
  }
  return generate(n)
}

/* ---------- Le plateau ---------- */
const sprite = (me: State, name: string, px: number) => `<i class="mz-spr" style="${frameStyle(me.atlas!, name, px)}"></i>`

/** Le plus grand carré qui tient dans l'arène, quelle que soit la tablette. */
function fitPx(): number {
  const w = $('mzWrap')
  return Math.max(240, Math.min(w.clientWidth, w.clientHeight) - 20)
}

function render(me: State) {
  const n = me.n
  me.px = fitPx()
  me.cell = me.px / n
  const area = $('mzArea')
  area.style.width = me.px + 'px'
  area.style.height = me.px + 'px'
  area.className = me.mode === 'ice' ? 'ice' : ''
  let walls = ''
  const cw = me.cell
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = me.grid[y][x]
    if (c.walls[0]) walls += `<line x1="${x * cw}" y1="${y * cw}" x2="${(x + 1) * cw}" y2="${y * cw}"/>`
    if (c.walls[3]) walls += `<line x1="${x * cw}" y1="${y * cw}" x2="${x * cw}" y2="${(y + 1) * cw}"/>`
  }
  walls += `<line x1="0" y1="${me.px}" x2="${me.px}" y2="${me.px}"/><line x1="${me.px}" y1="0" x2="${me.px}" y2="${me.px}"/>`
  const sw = Math.max(3, Math.min(6, cw / 7))
  // Deux passes de murs : une ombre décalée dessous, la haie par-dessus
  area.innerHTML = `
    <svg viewBox="0 0 ${me.px} ${me.px}" width="${me.px}" height="${me.px}">
      <g stroke="rgba(105,72,38,.35)" stroke-width="${sw + 1}" stroke-linecap="round" transform="translate(0,${sw * 0.6})">${walls}</g>
      <g stroke="#B97F3F" stroke-width="${sw}" stroke-linecap="round">${walls}</g>
    </svg>
    <div class="mz-crumbs" id="mzCrumbs"></div>
    <div class="mz-goal" id="mzGoal" style="left:${(n - 1) * cw}px;top:${(n - 1) * cw}px;width:${cw}px;height:${cw}px">${sprite(me, 'chicken', cw * 0.82)}</div>
    <div class="mz-chick" id="mzChick" style="width:${cw}px;height:${cw}px">${sprite(me, 'chick', cw * 0.74)}</div>
    ${me.mode === 'fog' ? '<div class="mz-fog" id="mzFog"></div>' : ''}`
  placeChick(me)
  paintDots(me)
}

function newRound(me: State) {
  me.n = me.sizes[me.round]
  me.grid = makeGrid(me, me.n)
  me.pos = { x: 0, y: 0 }
  me.won = false
  render(me)
}

function paintDots(me: State) {
  $('mzDots').innerHTML = me.sizes.map((_, i) => `<i class="sn-dot${i < me.round ? ' on' : ''}"></i>`).join('')
}

/** Une trace de pas à la case quittée : le chemin parcouru se lit d'un œil. */
function dropCrumb(me: State, x: number, y: number) {
  const box = document.getElementById('mzCrumbs')
  if (!box) return
  const c = document.createElement('i')
  c.className = 'mz-crumb'
  c.style.left = (x + 0.5) * me.cell + 'px'
  c.style.top = (y + 0.5) * me.cell + 'px'
  box.appendChild(c)
  while (box.children.length > 80) box.removeChild(box.firstChild!)
}

function placeChick(me: State, slideCells = 0) {
  const el = $('mzChick')
  el.style.transitionDuration = slideCells ? Math.min(0.55, 0.08 + slideCells * 0.05) + 's' : ''
  el.style.left = me.pos.x * me.cell + 'px'
  el.style.top = me.pos.y * me.cell + 'px'
  if (me.mode === 'fog') {
    const r = me.cell * 2.3
    $('mzFog').style.background = `radial-gradient(circle ${r}px at ${(me.pos.x + 0.5) * me.cell}px ${(me.pos.y + 0.5) * me.cell}px, transparent 0 52%, rgba(48,36,24,.96) 78%)`
  }
}

function moveTo(me: State, x: number, y: number, slideCells = 0) {
  if (me.won) return
  if (x !== me.pos.x || y !== me.pos.y) dropCrumb(me, me.pos.x, me.pos.y)
  me.pos = { x, y }
  placeChick(me, slideCells)
  if (!slideCells) sfx('tick', { vol: 0.25, rate: 1.4, spread: 0.08 })
  if (x === me.n - 1 && y === me.n - 1) roundWon(me)
}

/** Cogner un mur : ça se sent, mais pas plus de quatre fois par seconde. */
function bump(me: State, d: number) {
  const now = performance.now()
  if (now - me.lastBump < 250) return
  me.lastBump = now
  impact(0.25, { matter: 'bois', noShake: true })
  const el = $('mzChick')
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump')
  const r = el.getBoundingClientRect()
  FX.burst(r.left + r.width / 2 + D[d][0] * r.width * 0.45, r.top + r.height / 2 + D[d][1] * r.height * 0.45, { colors: ['#B97F3F', '#D9B784'], count: 5, speed: 0.6 })
}

const open = (me: State, x: number, y: number, d: number) => !me.grid[y][x].walls[d]

/** Un pas vers une case voisine, si le mur est ouvert ; sinon on cogne. */
function step(me: State, dx: number, dy: number): boolean {
  const { x, y } = me.pos
  const d = dy === -1 ? 0 : dx === 1 ? 1 : dy === 1 ? 2 : 3
  if (open(me, x, y, d)) { moveTo(me, x + dx, y + dy); return true }
  bump(me, d)
  return false
}

/** Le doigt : on rejoint la case visée en suivant le couloir, mais seulement
    si elle est à moins de six pas (une recherche courte, jamais un résolveur :
    le doigt doit rester près du poussin). Un doigt rapide qui saute un coin
    ne décroche plus. Si la case est hors de portée, on avance vers elle et on
    cogne le mur qui bloque. */
const REACH = 6
function walkTo(me: State, tx: number, ty: number) {
  const { x, y } = me.pos
  if (tx === x && ty === y) return
  // Recherche en largeur bornée depuis le poussin
  const key = (cx: number, cy: number) => cy * me.n + cx
  const prev = new Map<number, number>([[key(x, y), -1]])
  const queue: [number, number, number][] = [[x, y, 0]]
  let found = false
  while (queue.length && !found) {
    const [cx, cy, depth] = queue.shift()!
    if (depth >= REACH) continue
    for (let d = 0; d < 4; d++) {
      if (!open(me, cx, cy, d)) continue
      const nx = cx + D[d][0], ny = cy + D[d][1]
      const k = key(nx, ny)
      if (prev.has(k)) continue
      prev.set(k, key(cx, cy))
      if (nx === tx && ny === ty) { found = true; break }
      queue.push([nx, ny, depth + 1])
    }
  }
  if (found) {
    const path: number[] = []
    for (let k = key(tx, ty); k !== key(x, y); k = prev.get(k)!) path.unshift(k)
    for (const k of path) { moveTo(me, k % me.n, Math.floor(k / me.n)); if (me.won) return }
    return
  }
  // Hors de portée : un pas vers la cible, et on cogne ce qui bloque
  const dx = tx - x, dy = ty - y
  const first: [number, number] = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]
  const second: [number, number] = first[0] ? [0, Math.sign(dy)] : [Math.sign(dx), 0]
  if (step(me, first[0], first[1])) return
  if (second[0] || second[1]) step(me, second[0], second[1])
}

function slide(me: State, d: number) {
  let { x, y } = me.pos
  let cells = 0
  let toGoal = false
  while (open(me, x, y, d)) {
    x += D[d][0]; y += D[d][1]; cells++
    if (x === me.n - 1 && y === me.n - 1) { toGoal = true; break }
  }
  if (!cells) { bump(me, d); return }
  sfx('whoosh', { vol: 0.4, rate: 1.2 })
  moveTo(me, x, y, cells)
  // Le TOC contre le mur arrive quand le poussin s'arrête, pas avant
  if (!toGoal) {
    const ms = Math.min(0.55, 0.08 + cells * 0.05) * 1000
    ctx.after(ms, () => { if (mz === me) impact(0.35 + Math.min(0.35, cells * 0.06), { matter: 'glace', noShake: true }) })
  }
}

function roundWon(me: State) {
  me.won = true
  sfx('confirm', { vol: 0.8, rate: 1.1 })
  const goal = $('mzGoal')
  goal.classList.add('hug')
  const r = goal.getBoundingClientRect()
  FX.burst(r.left + r.width / 2, r.top + r.height / 2, { colors: ['#FF5A6E', '#FFC533', '#FFFFFF'], count: 16, speed: 1.1 })
  me.round++
  paintDots(me)
  if (me.round < me.sizes.length) ctx.after(1000, () => { if (mz === me) newRound(me) })
  else ctx.after(900, () => { if (mz === me) finish(me) })
}

function setMode(me: State, mode: Mode) {
  me.mode = mode
  me.sizes = sizesFor(mode)
  me.round = 0
  me.t0 = performance.now()
  document.querySelectorAll<HTMLElement>('.mz-tool').forEach(b => b.classList.toggle('sel', b.dataset.m === mode))
  newRound(me)
}

function finish(me: State) {
  const secs = Math.round((performance.now() - me.t0) / 1000)
  const totalCells = me.sizes.reduce((s, n) => s + n * n, 0)
  const f = MODES.find(m => m.id === me.mode)!.factor
  const stars = secs <= totalCells * 0.9 * f ? 3 : secs <= totalCells * 1.6 * f ? 2 : 1
  const names: Record<Mode, string> = { classic: '', fog: ' dans le noir', ice: ' sur la glace' }
  ctx.finish({
    title: 'Famille réunie !',
    msg: `${ctx.playerName} a traversé ${me.sizes.length} labyrinthes${names[me.mode]} en ${secs} s`,
    stars, starsEarned: stars
  })
}

export const maze: GameDef = {
  id: 'maze', name: 'Labyrinthe', icon: '🌀', sq: 'sq-peach', cat: 'reflexion',
  subtitle: 'Classique, dans le noir… ou sur la glace !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="arena mz-wrap" id="mzWrap">
        <div id="mzArea"></div>
        <div class="mz-tools">
          ${MODES.map((m, i) => `<button class="sn-tool mz-tool${i === 0 ? ' sel' : ''}" data-m="${m.id}" aria-label="${m.id}">${m.icon}</button>`).join('')}
        </div>
        <div class="mz-dots" id="mzDots"></div>
      </div>`
    preloadSfx(['tick', 'confirm', 'whoosh'])
    const me: State = {
      running: true, atlas: null, mode: 'classic', sizes: [], round: 0, grid: [], n: 0, px: 0, cell: 1,
      pos: { x: 0, y: 0 }, down: false, swipe: null, t0: performance.now(), lastBump: 0, won: false
    }
    mz = me
    document.querySelectorAll<HTMLElement>('.mz-tool').forEach(b => {
      b.onclick = () => { if (mz === me && me.atlas) { sfx('click', { vol: 0.4 }); setMode(me, b.dataset.m as Mode) } }
    })
    const area = $('mzArea')
    const cellAt = (e: PointerEvent) => {
      const r = area.getBoundingClientRect()
      return { tx: Math.floor((e.clientX - r.left) / me.cell), ty: Math.floor((e.clientY - r.top) / me.cell) }
    }
    const onMove = (e: PointerEvent) => {
      if (mz !== me || !me.down || !me.atlas || me.mode === 'ice') return
      const { tx, ty } = cellAt(e)
      if (tx >= 0 && ty >= 0 && tx < me.n && ty < me.n) walkTo(me, tx, ty)
    }
    const onDown = (e: PointerEvent) => {
      if (mz !== me) return
      me.down = true
      me.swipe = { x: e.clientX, y: e.clientY }
      onMove(e)
    }
    const onUp = (e: PointerEvent) => {
      if (mz !== me) return
      me.down = false
      if (me.mode === 'ice' && me.swipe && me.atlas) {
        const dx = e.clientX - me.swipe.x, dy = e.clientY - me.swipe.y
        if (Math.abs(dx) + Math.abs(dy) > 24) slide(me, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0))
      }
      me.swipe = null
    }
    const onKey = (e: KeyboardEvent) => {
      if (mz !== me || !me.atlas) return
      const dirs: Record<string, number> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 }
      if (!(e.key in dirs)) return
      e.preventDefault()
      const d = dirs[e.key]
      if (me.mode === 'ice') slide(me, d)
      else step(me, D[d][0], D[d][1])
    }
    const onResize = () => { if (mz === me && me.atlas) render(me) }
    area.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)

    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __mz: unknown }).__mz = {
        get grid() { return me.grid.map(row => row.map(c => c.walls)) }, get n() { return me.n }, get pos() { return me.pos },
        get round() { return me.round }, get mode() { return me.mode },
        cellCenter: (x: number, y: number) => { const r = area.getBoundingClientRect(); return { x: r.left + (x + 0.5) * me.cell, y: r.top + (y + 0.5) * me.cell } }
      }
    }

    // Les sprites d'abord : le plateau se construit avec les personnages dedans
    loadAtlas('animals').then((a: Atlas) => { if (mz === me) { me.atlas = a; setMode(me, 'classic') } })
    return () => {
      if (mz === me) mz = null
      me.running = false
      area.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }
}
