import type { GameContext, GameDef } from '../core/types'
import { $, boardSize, shuffle } from '../core/utils'
import { sGood, sJump, sPop, sWin } from '../core/audio'
import { impact } from '../core/impact'
import { frameStyle, loadAtlas, type Atlas } from '../core/sprites'

/* Labyrinthe — 3 façons de se perdre :
   🐤 Classique (grands niveaux), 🌫 Brouillard (on ne voit qu'autour du poussin),
   🧊 Glace (on glisse jusqu'au mur).

   Poussin et poule sont de VRAIS sprites (planche animals de Kenney), le
   poussin sème des traces de pas, la glissade sur glace est animée et se
   termine par un choc de glace. (Le mode « 3D » en raycasting a été retiré
   le 2/09 : si un labyrinthe 3D revient un jour, il partira de three3d.) */

let mz: any = null
let ctx: GameContext

interface Cell { walls: boolean[] } // haut, droite, bas, gauche

function generate(n: number): Cell[][] {
  const g: Cell[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => ({ walls: [true, true, true, true] })))
  const seen = Array.from({ length: n }, () => Array(n).fill(false))
  const stack: [number, number][] = [[0, 0]]
  seen[0][0] = true
  const D: [number, number, number, number][] = [[0, -1, 0, 2], [1, 0, 1, 3], [0, 1, 2, 0], [-1, 0, 3, 1]]
  while (stack.length) {
    const [x, y] = stack[stack.length - 1]
    const opts = shuffle([...D]).filter(([dx, dy]) => {
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

/* Les personnages : de vrais sprites, plus de dessin à la main */
const chickSprite = (px: number) => `<i class="mz-spr" style="${frameStyle(mz.atlas, 'chick', px)}"></i>`
const henSprite = (px: number) => `<i class="mz-spr" style="${frameStyle(mz.atlas, 'chicken', px)}"></i>`

const MODES: Record<string, { label: string; factor: number }> = {
  classic: { label: '🐤', factor: 1 },
  fog: { label: '🌫', factor: 1.6 },
  ice: { label: '🧊', factor: 1.5 }
}

function sizesFor(mode: string): number[] {
  if (mode === 'fog') return ctx.byTier([6, 7, 8], [9, 11, 13], [13, 15, 17])
  return ctx.byTier([5, 6, 7], [8, 10, 12], [12, 14, 16])
}

/* La glace ne permet pas de s'arrêter en plein couloir : certaines grilles
   sont ingagnables en glissant. On vérifie par un parcours en "coups de
   glisse" que la sortie est atteignable (y compris en passant dessus). */
function iceSolvable(g: Cell[][], n: number): boolean {
  const D = [[0, -1], [1, 0], [0, 1], [-1, 0]]
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

/* Ouvre quelques murs intérieurs : la glace respire mieux et devient
   presque toujours gagnable. */
function braid(g: Cell[][], n: number, ratio: number) {
  const target = Math.floor(n * n * ratio)
  for (let k = 0; k < target; k++) {
    const x = 1 + Math.floor(Math.random() * (n - 2))
    const y = 1 + Math.floor(Math.random() * (n - 2))
    const d = Math.random() < 0.5 ? 1 : 2 // droite ou bas
    if (g[y][x].walls[d]) {
      g[y][x].walls[d] = false
      if (d === 1) g[y][x + 1].walls[3] = false
      else g[y + 1][x].walls[0] = false
    }
  }
}

function makeGrid(n: number): Cell[][] {
  if (mz.mode !== 'ice') return generate(n)
  for (let attempt = 0; attempt < 80; attempt++) {
    const g = generate(n)
    braid(g, n, 0.18)
    if (iceSolvable(g, n)) return g
  }
  // Dernier recours : grilles très aérées jusqu'à en trouver une gagnable
  for (let attempt = 0; attempt < 40; attempt++) {
    const g = generate(n)
    braid(g, n, 0.5)
    if (iceSolvable(g, n)) return g
  }
  return generate(n) // improbable : mieux vaut une grille jouable pas à pas que rien
}

/* ============ Modes 2D (classique, brouillard, glace) ============ */

function load2D() {
  const n = mz.sizes[mz.round]
  mz.n = n
  mz.grid = makeGrid(n)
  mz.px = boardSize(380)
  mz.cell = mz.px / n
  mz.pos = { x: 0, y: 0 }
  $('mzRound').textContent = `Labyrinthe ${mz.round + 1}/${mz.sizes.length}`
  const area = $('mzArea')
  area.style.width = mz.px + 'px'
  area.style.height = mz.px + 'px'
  let walls = ''
  const cw = mz.cell
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = mz.grid[y][x]
    if (c.walls[0]) walls += `<line x1="${x * cw}" y1="${y * cw}" x2="${(x + 1) * cw}" y2="${y * cw}"/>`
    if (c.walls[3]) walls += `<line x1="${x * cw}" y1="${y * cw}" x2="${x * cw}" y2="${(y + 1) * cw}"/>`
  }
  walls += `<line x1="0" y1="${mz.px}" x2="${mz.px}" y2="${mz.px}"/><line x1="${mz.px}" y1="0" x2="${mz.px}" y2="${mz.px}"/>`
  const sw = Math.max(2.5, Math.min(4, cw / 8))
  // Deux passes de murs : une ombre décalée dessous, le trait par-dessus —
  // les haies prennent du relief sans coûter un pixel de plus
  area.innerHTML = `
    <svg viewBox="0 0 ${mz.px} ${mz.px}" width="${mz.px}" height="${mz.px}">
      <g stroke="rgba(105,72,38,.35)" stroke-width="${sw + 1}" stroke-linecap="round" transform="translate(0,${sw * 0.6})">${walls}</g>
      <g stroke="#B97F3F" stroke-width="${sw}" stroke-linecap="round">${walls}</g>
    </svg>
    <div class="mz-crumbs" id="mzCrumbs"></div>
    <div class="mz-goal" style="left:${(n - 1) * cw}px;top:${(n - 1) * cw}px;width:${cw}px;height:${cw}px">${henSprite(cw * 0.82)}</div>
    <div class="mz-chick" id="mzChick" style="width:${cw}px;height:${cw}px">${chickSprite(cw * 0.74)}</div>
    ${mz.mode === 'fog' ? '<div class="mz-fog" id="mzFog"></div>' : ''}`
  moveChick(0, 0, false)
}

/** Une trace de pas à la case quittée : le chemin parcouru se lit d'un œil. */
function dropCrumb(x: number, y: number) {
  const box = document.getElementById('mzCrumbs')
  if (!box) return
  const c = document.createElement('i')
  c.className = 'mz-crumb'
  c.style.left = (x + 0.5) * mz.cell + 'px'
  c.style.top = (y + 0.5) * mz.cell + 'px'
  box.appendChild(c)
  while (box.children.length > 60) box.removeChild(box.firstChild!)
}

function moveChick(x: number, y: number, sound = true, slideCells = 0) {
  if (x !== mz.pos.x || y !== mz.pos.y) dropCrumb(mz.pos.x, mz.pos.y)
  mz.pos = { x, y }
  const el = $('mzChick')
  // Glissade sur glace : la durée suit la distance, on VOIT le trajet
  el.style.transitionDuration = slideCells ? Math.min(0.55, 0.08 + slideCells * 0.05) + 's' : ''
  el.style.left = x * mz.cell + 'px'
  el.style.top = y * mz.cell + 'px'
  if (mz.mode === 'fog') {
    const fog = $('mzFog')
    const r = mz.cell * 2.3
    fog.style.background = `radial-gradient(circle ${r}px at ${(x + 0.5) * mz.cell}px ${(y + 0.5) * mz.cell}px, transparent 0 52%, rgba(48,36,24,.96) 78%)`
  }
  if (sound) sPop()
  if (x === mz.n - 1 && y === mz.n - 1) roundWon()
}

function roundWon() {
  sGood()
  mz.round++
  if (mz.round < mz.sizes.length) {
    ctx.toast('Retrouvés ! 🐔🐤')
    setTimeout(() => { if (mz && mz.running) load2D() }, 900)
  } else finish()
}

function open(x: number, y: number, d: number): boolean {
  return !mz.grid[y][x].walls[d]
}

function tryStep(tx: number, ty: number) {
  const { x, y } = mz.pos
  const dx = tx - x, dy = ty - y
  if (Math.abs(dx) + Math.abs(dy) !== 1) return
  if (dy === -1 && open(x, y, 0)) moveChick(x, y - 1)
  else if (dx === 1 && open(x, y, 1)) moveChick(x + 1, y)
  else if (dy === 1 && open(x, y, 2)) moveChick(x, y + 1)
  else if (dx === -1 && open(x, y, 3)) moveChick(x - 1, y)
}

function slide(d: number) {
  // Glace : on glisse jusqu'au prochain mur
  let { x, y } = mz.pos
  const D = [[0, -1], [1, 0], [0, 1], [-1, 0]][d]
  let cells = 0
  let toGoal = false
  while (open(x, y, d)) {
    x += D[0]; y += D[1]; cells++
    if (x === mz.n - 1 && y === mz.n - 1) { toGoal = true; break }
  }
  if (!cells) return
  sJump()
  moveChick(x, y, false, cells)
  // Le TOC contre le mur arrive quand le poussin s'arrête, pas avant —
  // sauf à l'arrivée : là c'est la poule qu'on retrouve, pas un mur
  if (!toGoal) {
    const ms = Math.min(0.55, 0.08 + cells * 0.05) * 1000
    setTimeout(() => { if (mz && mz.running) impact(0.35 + Math.min(0.35, cells * 0.06), { matter: 'glace', noShake: true }) }, ms)
  }
}

/* ============ Coquille commune ============ */

function setMode(mode: string) {
  mz.mode = mode
  mz.sizes = sizesFor(mode)
  mz.round = 0
  mz.t0 = performance.now()
  document.querySelectorAll<HTMLElement>('.mz-mode').forEach(b => b.classList.toggle('sel', b.dataset.m === mode))
  const subs: Record<string, string> = {
    classic: 'Trace le chemin au doigt pour ramener le poussin à sa maman',
    fog: 'Il fait nuit ! On ne voit qu\'autour du poussin…',
    ice: 'Tout est gelé : le poussin glisse jusqu\'au prochain mur ! (glisse ton doigt)'
  }
  $('mzSub').textContent = subs[mode]
  load2D()
}

function finish() {
  const secs = Math.round((performance.now() - mz.t0) / 1000)
  sWin()
  const totalCells = mz.sizes.reduce((s: number, n: number) => s + n * n, 0)
  const f = MODES[mz.mode].factor
  const stars = secs <= totalCells * 0.9 * f ? 3 : secs <= totalCells * 1.6 * f ? 2 : 1
  const names: Record<string, string> = { classic: '', fog: ' dans le noir 🌫', ice: ' sur la glace 🧊' }
  ctx.finish({
    title: 'Famille réunie !',
    msg: `${ctx.playerName} a traversé ${mz.sizes.length} labyrinthes${names[mz.mode]} en ${secs} s 🐤`,
    stars, starsEarned: stars
  })
}

export const maze: GameDef = {
  id: 'maze', name: 'Labyrinthe', icon: '🌀', sq: 'sq-peach', cat: 'reflexion',
  subtitle: 'Classique, dans le noir… ou sur la glace !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        ${Object.entries(MODES).map(([k, v], i) =>
          `<button class="chip mz-mode${i === 0 ? ' sel' : ''}" data-m="${k}">${v.label}</button>`).join('')}
        <div class="chip" id="mzRound">1/3</div>
      </div>
      <div class="gsub" id="mzSub"></div>
      <div id="mzArea"></div>`
    mz = { running: true, mode: 'classic', swipe: null, atlas: null }
    document.querySelectorAll<HTMLElement>('.mz-mode').forEach(b => {
      b.onclick = () => mz && mz.running && mz.atlas && setMode(b.dataset.m!)
    })
    const area = $('mzArea')
    const onMove = (e: PointerEvent) => {
      if (!mz || !mz.running || !mz.down) return
      if (mz.mode === 'ice') return
      const r = area.getBoundingClientRect()
      const tx = Math.floor((e.clientX - r.left) / mz.cell)
      const ty = Math.floor((e.clientY - r.top) / mz.cell)
      if (tx >= 0 && ty >= 0 && tx < mz.n && ty < mz.n) tryStep(tx, ty)
    }
    const onDown = (e: PointerEvent) => {
      if (!mz) return
      mz.down = true
      mz.swipe = { x: e.clientX, y: e.clientY }
      onMove(e)
    }
    const onUp = (e: PointerEvent) => {
      if (!mz) return
      mz.down = false
      if (mz.mode === 'ice' && mz.swipe) {
        const dx = e.clientX - mz.swipe.x, dy = e.clientY - mz.swipe.y
        if (Math.abs(dx) + Math.abs(dy) > 24) {
          const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0)
          slide(d)
        }
      }
      mz.swipe = null
    }
    const onKey = (e: KeyboardEvent) => {
      if (!mz || !mz.running) return
      const dirs: Record<string, number> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 }
      if (!(e.key in dirs)) return
      e.preventDefault()
      const d = dirs[e.key]
      if (mz.mode === 'ice') slide(d)
      else {
        const { x, y } = mz.pos
        const D = [[0, -1], [1, 0], [0, 1], [-1, 0]][d]
        tryStep(x + D[0], y + D[1])
      }
    }
    area.addEventListener('pointerdown', onDown)
    area.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    // Les sprites d'abord : le plateau se construit avec les personnages dedans
    loadAtlas('animals').then((a: Atlas) => {
      if (mz && mz.running) { mz.atlas = a; setMode('classic') }
    })
    return () => {
      if (mz) { mz.running = false; mz = null }
      area.removeEventListener('pointerdown', onDown)
      area.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }
}
