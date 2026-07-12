import type { GameContext, GameDef } from '../core/types'
import { $, shuffle } from '../core/utils'
import { sGood, sPop, sWin } from '../core/audio'

/* Labyrinthe — ramène le poussin à sa maman ! Labyrinthe généré (toujours
   solvable), on trace le chemin au doigt, le poussin suit. */

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

function chickDot(px: number): string {
  return `<svg viewBox="0 0 40 40" width="${px}" height="${px}">
    <circle cx="20" cy="22" r="14" fill="#FFD44D" stroke="#E8B923" stroke-width="2.5"/>
    <circle cx="15" cy="18" r="2.4" fill="#45362A"/><circle cx="25" cy="18" r="2.4" fill="#45362A"/>
    <path d="M17,25 L23,25 L20,29 Z" fill="#FFA94D"/>
    <path d="M12,8 Q14,3 17,7 Q20,2 23,7 Q26,3 28,8" fill="none" stroke="#E8B923" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`
}
function henDot(px: number): string {
  return `<svg viewBox="0 0 40 40" width="${px}" height="${px}">
    <circle cx="20" cy="22" r="15" fill="#FFF6E8" stroke="#D9BFA0" stroke-width="2.5"/>
    <path d="M12,10 Q14,3 17,8 Q20,1 23,8 Q26,3 28,10" fill="#FF6B81" stroke="#E04E63" stroke-width="2"/>
    <circle cx="15" cy="19" r="2.4" fill="#45362A"/><circle cx="25" cy="19" r="2.4" fill="#45362A"/>
    <path d="M17,26 L23,26 L20,31 Z" fill="#FFA94D"/>
  </svg>`
}

function loadMaze() {
  const n = mz.sizes[mz.round]
  mz.n = n
  mz.grid = generate(n)
  mz.px = Math.min(380, window.innerWidth - 44)
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
  area.innerHTML = `
    <svg viewBox="0 0 ${mz.px} ${mz.px}" width="${mz.px}" height="${mz.px}">
      <g stroke="#B97F3F" stroke-width="4" stroke-linecap="round">${walls}</g>
    </svg>
    <div class="mz-goal" style="left:${(n - 1) * cw}px;top:${(n - 1) * cw}px;width:${cw}px;height:${cw}px">${henDot(cw * 0.8)}</div>
    <div class="mz-chick" id="mzChick" style="width:${cw}px;height:${cw}px">${chickDot(cw * 0.72)}</div>`
  moveChick(0, 0, false)
  ctx.say('Ramène le poussin à sa maman !')
}

function moveChick(x: number, y: number, sound = true) {
  mz.pos = { x, y }
  const el = $('mzChick')
  el.style.left = x * mz.cell + 'px'
  el.style.top = y * mz.cell + 'px'
  if (sound) sPop()
  if (x === mz.n - 1 && y === mz.n - 1) {
    sGood()
    mz.round++
    if (mz.round < mz.sizes.length) {
      ctx.toast('Retrouvés ! 🐔🐤')
      setTimeout(() => mz && mz.running && loadMaze(), 900)
    } else finish()
  }
}

function tryStep(tx: number, ty: number) {
  const { x, y } = mz.pos
  const dx = tx - x, dy = ty - y
  if (Math.abs(dx) + Math.abs(dy) !== 1) return
  const c = mz.grid[y][x]
  if (dy === -1 && !c.walls[0]) moveChick(x, y - 1)
  else if (dx === 1 && !c.walls[1]) moveChick(x + 1, y)
  else if (dy === 1 && !c.walls[2]) moveChick(x, y + 1)
  else if (dx === -1 && !c.walls[3]) moveChick(x - 1, y)
}

function finish() {
  const secs = Math.round((performance.now() - mz.t0) / 1000)
  sWin()
  const totalCells = mz.sizes.reduce((s: number, n: number) => s + n * n, 0)
  const stars = secs <= totalCells * 0.9 ? 3 : secs <= totalCells * 1.6 ? 2 : 1
  ctx.finish({
    title: 'Famille réunie !',
    msg: `${ctx.playerName} a traversé ${mz.sizes.length} labyrinthes en ${secs} secondes 🐤`,
    stars, starsEarned: stars
  })
}

export const maze: GameDef = {
  id: 'maze', name: 'Labyrinthe', icon: '🌀', sq: 'sq-peach', cat: 'reflexion',
  subtitle: 'Trace le chemin au doigt pour ramener le poussin à sa maman',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="mzRound">Labyrinthe 1/3</div>
      </div>
      <div id="mzArea"></div>`
    mz = { sizes: c.byTier([5, 6, 7], [7, 8, 9], [9, 10, 12]), round: 0, t0: performance.now(), running: true }
    const area = $('mzArea')
    const onMove = (e: PointerEvent) => {
      if (!mz || !mz.running || !mz.down) return
      const r = area.getBoundingClientRect()
      const tx = Math.floor((e.clientX - r.left) / mz.cell)
      const ty = Math.floor((e.clientY - r.top) / mz.cell)
      if (tx >= 0 && ty >= 0 && tx < mz.n && ty < mz.n) tryStep(tx, ty)
    }
    const onDown = (e: PointerEvent) => { if (mz) { mz.down = true; onMove(e) } }
    const onUp = () => { if (mz) mz.down = false }
    const onKey = (e: KeyboardEvent) => {
      if (!mz || !mz.running) return
      const { x, y } = mz.pos
      if (e.key === 'ArrowUp') { e.preventDefault(); tryStep(x, y - 1) }
      if (e.key === 'ArrowDown') { e.preventDefault(); tryStep(x, y + 1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); tryStep(x - 1, y) }
      if (e.key === 'ArrowRight') { e.preventDefault(); tryStep(x + 1, y) }
    }
    area.addEventListener('pointerdown', onDown)
    area.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    loadMaze()
    return () => {
      if (mz) { mz.running = false; mz = null }
      area.removeEventListener('pointerdown', onDown)
      area.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }
}
