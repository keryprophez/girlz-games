import type { GameContext, GameDef } from '../core/types'
import { $, shuffle } from '../core/utils'
import { impact } from '../core/impact'
import { sfx, preloadSfx } from '../core/sfx'
import { ICON } from '../core/icons'
import { FX } from '../core/fx'
import { tone } from '../core/audio'

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
   - timers de partie (`ctx.after`), état typé, plus d'emoji.

   Refonte du 15/09 (« pas fun et plein de bugs de passe-muraille ») :
   - le poussin MARCHE : il suit le couloir case par case, avec un
     dandinement, au lieu de glisser en ligne droite d'une case à l'autre —
     c'est cette ligne droite qui traversait les coins, le « passe-muraille » ;
   - le poussin et la poule sont dessinés (SVG), plus la pastille ronde de la
     planche Kenney que les filles ont trouvée « digne d'un Minitel » ;
   - des graines à ramasser en chemin : les étoiles viennent des graines, pas
     du chronomètre ; il pépie en marchant, et les murs sont des haies. */

interface Cell { walls: boolean[] } // haut, droite, bas, gauche
type Mode = 'classic' | 'fog' | 'ice'

interface State {
  running: boolean
  ready: boolean
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
  /** Position VISIBLE du poussin (en cases, à virgule) et son chemin à suivre. */
  vis: { x: number; y: number }
  path: { x: number; y: number; fast?: boolean }[]
  facing: 1 | -1
  lastPeep: number
  /** Les graines restantes de la manche (clé « x:y »), et le compte. */
  grains: Set<string>
  grainsTotal: number
  grainsGot: number
  ticker: number
}

let mz: State | null = null
let ctx: GameContext

const D = [[0, -1], [1, 0], [0, 1], [-1, 0]]
const MODES: { id: Mode; icon: string; factor: number; cap: string }[] = [
  { id: 'classic', icon: ICON.sun, factor: 1, cap: 'Jour' },
  { id: 'fog', icon: ICON.moon, factor: 1.6, cap: 'Nuit' },
  { id: 'ice', icon: ICON.snowflake, factor: 1.5, cap: 'Glace' }
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

/* ---------- Les personnages, dessinés ---------- */
/** Le poussin : rond, jaune, une houppette, un bec, des pattes. */
function chickSVG(px: number): string {
  return `<svg class="mz-spr mz-body" viewBox="0 0 64 64" width="${px}" height="${px}" aria-hidden="true">
    <ellipse cx="32" cy="58" rx="16" ry="3.5" fill="rgba(69,54,42,.18)"/>
    <path d="M24 56l-4 5M40 56l4 5M24 56l-5-1M40 56l5-1" stroke="#E8873A" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="32" cy="40" rx="19" ry="17" fill="#F2C230"/>
    <ellipse cx="14" cy="40" rx="6" ry="10" fill="#E0AE22" transform="rotate(20 14 40)"/>
    <circle cx="34" cy="22" r="15" fill="#F5CB3C"/>
    <path d="M30 8c1-4 4-6 6-4M35 8c0-4 3-6 5-4" stroke="#E0AE22" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="M46 22l9 3-9 4z" fill="#E8873A"/>
    <circle cx="40" cy="20" r="4.2" fill="#fff"/><circle cx="41.4" cy="20.4" r="2.2" fill="#2B2118"/>
    <circle cx="42.4" cy="19.2" r=".8" fill="#fff"/>
  </svg>`
}
/** La poule : blanche, crête rouge, barbillon, plus grande. */
function henSVG(px: number): string {
  return `<svg class="mz-spr" viewBox="0 0 64 64" width="${px}" height="${px}" aria-hidden="true">
    <ellipse cx="32" cy="59" rx="18" ry="3.5" fill="rgba(69,54,42,.18)"/>
    <path d="M24 55l-3 6M40 55l3 6M24 55l-5-1M40 55l5-1" stroke="#E8873A" stroke-width="3" stroke-linecap="round"/>
    <ellipse cx="30" cy="40" rx="21" ry="17" fill="#F7F3EA"/>
    <path d="M10 36c-4-2-8 2-6 8 2 4 8 4 10 1z" fill="#E8DED0"/>
    <ellipse cx="16" cy="42" rx="7" ry="10" fill="#E8DED0" transform="rotate(15 16 42)"/>
    <circle cx="38" cy="22" r="13" fill="#F7F3EA"/>
    <path d="M30 11c-1-6 4-8 6-3 2-5 7-5 7 1 1-4 6-3 5 2l-1 3H30z" fill="#E8574C"/>
    <path d="M49 30c4 1 4 6 0 7z" fill="#E8574C"/>
    <path d="M50 22l9 3-9 4z" fill="#E8873A"/>
    <circle cx="43" cy="20" r="4" fill="#fff"/><circle cx="44.4" cy="20.4" r="2.1" fill="#2B2118"/>
  </svg>`
}
/** Une graine : deux petits grains dorés. */
function grainSVG(px: number): string {
  return `<svg viewBox="0 0 24 24" width="${px}" height="${px}" aria-hidden="true">
    <ellipse cx="9" cy="14" rx="4" ry="6" fill="#D9A72A" transform="rotate(-25 9 14)"/>
    <ellipse cx="16" cy="12" rx="4" ry="6" fill="#E8B830" transform="rotate(20 16 12)"/>
    <ellipse cx="8" cy="12" rx="1.2" ry="2.5" fill="#FFE08A" transform="rotate(-25 8 12)"/>
  </svg>`
}

/* ---------- Le plateau ---------- */

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
  const sw = Math.max(4, Math.min(9, cw / 5))
  // Les murs sont des haies : une ombre en dessous, la haie sombre, un liseré clair
  const grains = [...me.grains].map(k => {
    const [gx, gy] = k.split(':').map(Number)
    return `<i class="mz-grain" data-k="${k}" style="left:${(gx + 0.5) * cw}px;top:${(gy + 0.5) * cw}px">${grainSVG(Math.round(cw * 0.42))}</i>`
  }).join('')
  area.innerHTML = `
    <svg viewBox="0 0 ${me.px} ${me.px}" width="${me.px}" height="${me.px}">
      <g stroke="rgba(40,70,30,.28)" stroke-width="${sw + 2}" stroke-linecap="round" transform="translate(0,${sw * 0.5})">${walls}</g>
      <g stroke="#4B8A3A" stroke-width="${sw}" stroke-linecap="round">${walls}</g>
      <g stroke="#7CC25C" stroke-width="${sw * 0.4}" stroke-linecap="round" transform="translate(0,${-sw * 0.18})">${walls}</g>
    </svg>
    <div class="mz-crumbs" id="mzCrumbs"></div>
    ${grains}
    <div class="mz-goal" id="mzGoal" style="left:${(n - 1) * cw}px;top:${(n - 1) * cw}px;width:${cw}px;height:${cw}px">${henSVG(cw * 0.9)}</div>
    <div class="mz-chick" id="mzChick" style="width:${cw}px;height:${cw}px">${chickSVG(cw * 0.8)}</div>
    ${me.mode === 'fog' ? '<div class="mz-fog" id="mzFog"></div>' : ''}`
  placeChick(me)
  paintDots(me)
}

/** Les graines de la manche : quatre sur le chemin de la poule, une à l'écart. */
function sowGrains(me: State) {
  const n = me.n
  const key = (x: number, y: number) => y * n + x
  const prev = new Map<number, number>([[0, -1]])
  const queue = [[0, 0]]
  while (queue.length) {
    const [x, y] = queue.shift()!
    for (let d = 0; d < 4; d++) {
      if (me.grid[y][x].walls[d]) continue
      const nx = x + D[d][0], ny = y + D[d][1], k = key(nx, ny)
      if (!prev.has(k)) { prev.set(k, key(x, y)); queue.push([nx, ny]) }
    }
  }
  const path: number[] = []
  for (let k = key(n - 1, n - 1); k > 0; k = prev.get(k)!) path.unshift(k)
  path.pop()   // pas sur la poule
  me.grains = new Set()
  const onPath = shuffle(path).slice(0, Math.min(4, path.length))
  for (const k of onPath) me.grains.add(`${k % n}:${Math.floor(k / n)}`)
  const off = shuffle([...prev.keys()].filter(k => k > 0 && !path.includes(k) && k !== key(n - 1, n - 1)))
  if (off.length) me.grains.add(`${off[0] % n}:${Math.floor(off[0] / n)}`)
  me.grainsTotal += me.grains.size
}

function newRound(me: State) {
  me.n = me.sizes[me.round]
  me.grid = makeGrid(me, me.n)
  me.pos = { x: 0, y: 0 }
  me.vis = { x: 0, y: 0 }
  me.path = []
  me.won = false
  sowGrains(me)
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

function placeChick(me: State) {
  const el = document.getElementById('mzChick')
  if (!el) return
  el.style.left = me.vis.x * me.cell + 'px'
  el.style.top = me.vis.y * me.cell + 'px'
  el.classList.toggle('walk', me.path.length > 0)
  el.classList.toggle('left', me.facing < 0)
  if (me.mode === 'fog') {
    const r = me.cell * 2.3
    const fog = document.getElementById('mzFog')
    if (fog) fog.style.background = `radial-gradient(circle ${r}px at ${(me.vis.x + 0.5) * me.cell}px ${(me.vis.y + 0.5) * me.cell}px, transparent 0 52%, rgba(48,36,24,.96) 78%)`
  }
}

/** Le poussin avance vers le prochain point de son chemin — case par case,
    donc jamais à travers un coin. Un tour toutes les 30 ms (horloge de jeu). */
function advance(me: State, dt: number) {
  if (!me.path.length) return
  const w = me.path[0]
  const speed = w.fast ? 26 : 13   // cases par seconde
  const dx = w.x - me.vis.x, dy = w.y - me.vis.y
  const dist = Math.hypot(dx, dy)
  const step = speed * dt
  if (Math.abs(dx) > 0.01) me.facing = dx > 0 ? 1 : -1
  if (dist <= step) {
    me.vis = { x: w.x, y: w.y }
    me.path.shift()
    arrived(me, w.x, w.y)
  } else {
    me.vis = { x: me.vis.x + dx / dist * step, y: me.vis.y + dy / dist * step }
  }
  placeChick(me)
}

/** Le poussin pose la patte sur une case : graine, miette, pépiement. */
function arrived(me: State, x: number, y: number) {
  const k = `${x}:${y}`
  if (me.grains.has(k)) {
    me.grains.delete(k)
    me.grainsGot++
    const el = document.querySelector<HTMLElement>(`.mz-grain[data-k="${k}"]`)
    if (el) {
      const r = el.getBoundingClientRect()
      FX.burst(r.left + r.width / 2, r.top + r.height / 2, { colors: ['#FFE08A', '#D9A72A', '#FFFFFF'], count: 8, speed: 0.8 })
      el.remove()
    }
    sfx('pluck', { vol: 0.5, rate: 1 + me.grainsGot * 0.04 })
  }
  dropCrumb(me, x, y)
  const now = performance.now()
  if (now - me.lastPeep > 260) {
    me.lastPeep = now
    tone(1300 + Math.random() * 300, 0.045, 'square', 0.025)
  }
  if (!me.path.length && x === me.n - 1 && y === me.n - 1) roundWon(me)
}

/** Un pas logique : la position de jeu change tout de suite (le doigt peut
    continuer), et le poussin visible rattrape en marchant. */
function moveTo(me: State, x: number, y: number, fast = false) {
  if (me.won) return
  me.pos = { x, y }
  me.path.push({ x, y, fast })
  // Un doigt très rapide ne doit pas laisser le poussin dix cases derrière
  if (me.path.length > 8) { const w = me.path[me.path.length - 1]; me.vis = { x: me.path[me.path.length - 6].x, y: me.path[me.path.length - 6].y }; me.path = me.path.slice(-5); void w }
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
  moveTo(me, x, y, true)
  // Le TOC contre le mur arrive quand le poussin s'arrête, pas avant
  if (!toGoal) {
    const ms = Math.min(0.55, 0.08 + cells * 0.05) * 1000
    ctx.after(ms, () => { if (mz === me) impact(0.35 + Math.min(0.35, cells * 0.06), { matter: 'glace', noShake: true }) })
  }
}

function roundWon(me: State) {
  if (me.won) return
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
  me.grainsTotal = 0; me.grainsGot = 0
  me.t0 = performance.now()
  document.querySelectorAll<HTMLElement>('.mz-tool').forEach(b => {
    const on = b.dataset.m === mode
    b.classList.toggle('sel', on)
    b.parentElement?.classList.toggle('sel', on)
  })
  newRound(me)
}

function finish(me: State) {
  // Les étoiles viennent des graines ramassées, pas du chronomètre
  const r = me.grainsTotal ? me.grainsGot / me.grainsTotal : 1
  const stars = r >= 0.99 ? 3 : r >= 0.6 ? 2 : 1
  const names: Record<Mode, string> = { classic: '', fog: ' dans le noir', ice: ' sur la glace' }
  ctx.finish({
    title: 'Famille réunie !',
    msg: `${ctx.playerName} a traversé ${me.sizes.length} labyrinthes${names[me.mode]} et ramassé ${me.grainsGot} graine${me.grainsGot > 1 ? 's' : ''} sur ${me.grainsTotal}`,
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
          ${MODES.map((m, i) => `<span class="tool-item${i === 0 ? ' sel' : ''}">
            <button class="sn-tool mz-tool${i === 0 ? ' sel' : ''}" data-m="${m.id}" aria-label="${m.cap}">${m.icon}</button>
            <i class="tool-cap">${m.cap}</i></span>`).join('')}
        </div>
        <div class="mz-dots" id="mzDots"></div>
      </div>`
    preloadSfx(['tick', 'confirm', 'whoosh'])
    const me: State = {
      running: true, ready: true, mode: 'classic', sizes: [], round: 0, grid: [], n: 0, px: 0, cell: 1,
      pos: { x: 0, y: 0 }, down: false, swipe: null, t0: performance.now(), lastBump: 0, won: false,
      vis: { x: 0, y: 0 }, path: [], facing: 1, lastPeep: 0, grains: new Set(), grainsTotal: 0, grainsGot: 0, ticker: 0
    }
    mz = me
    // Le poussin marche sur l'horloge de jeu : suspendu en pause, annulé au démontage
    let lastTick = performance.now()
    me.ticker = c.every(30, () => {
      const now = performance.now()
      const dt = Math.min(0.1, (now - lastTick) / 1000)
      lastTick = now
      if (mz === me) advance(me, dt)
    })
    document.querySelectorAll<HTMLElement>('.mz-tool').forEach(b => {
      b.onclick = () => { if (mz === me && me.ready) { sfx('click', { vol: 0.4 }); setMode(me, b.dataset.m as Mode) } }
    })
    const area = $('mzArea')
    const cellAt = (e: PointerEvent) => {
      const r = area.getBoundingClientRect()
      return { tx: Math.floor((e.clientX - r.left) / me.cell), ty: Math.floor((e.clientY - r.top) / me.cell) }
    }
    const onMove = (e: PointerEvent) => {
      if (mz !== me || !me.down || !me.ready || me.mode === 'ice') return
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
      if (me.mode === 'ice' && me.swipe && me.ready) {
        const dx = e.clientX - me.swipe.x, dy = e.clientY - me.swipe.y
        if (Math.abs(dx) + Math.abs(dy) > 24) slide(me, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0))
      }
      me.swipe = null
    }
    const onKey = (e: KeyboardEvent) => {
      if (mz !== me || !me.ready) return
      const dirs: Record<string, number> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 }
      if (!(e.key in dirs)) return
      e.preventDefault()
      const d = dirs[e.key]
      if (me.mode === 'ice') slide(me, d)
      else step(me, D[d][0], D[d][1])
    }
    const onResize = () => { if (mz === me && me.ready) render(me) }
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

    setMode(me, 'classic')
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
