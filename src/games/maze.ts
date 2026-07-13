import type { GameContext, GameDef } from '../core/types'
import { $, shuffle } from '../core/utils'
import { sGood, sJump, sPop, sWin } from '../core/audio'

/* Labyrinthe — 4 façons de se perdre :
   🐤 Classique (grands niveaux), 🌫 Brouillard (on ne voit qu'autour du poussin),
   🧊 Glace (on glisse jusqu'au mur), 🕶 3D (vue première personne, raycasting canvas). */

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
    <path d="M13,9 Q15,3 18,8 Q20,1 23,8 Q25,3 27,9" fill="#FF6B81" stroke="#E04E63" stroke-width="2"/>
    <circle cx="15" cy="19" r="2.4" fill="#45362A"/><circle cx="25" cy="19" r="2.4" fill="#45362A"/>
    <path d="M17,26 L23,26 L20,31 Z" fill="#FFA94D"/>
  </svg>`
}

const MODES: Record<string, { label: string; factor: number }> = {
  classic: { label: '🐤', factor: 1 },
  fog: { label: '🌫', factor: 1.6 },
  ice: { label: '🧊', factor: 1.5 },
  d3: { label: '🕶', factor: 2.6 }
}

function sizesFor(mode: string): number[] {
  if (mode === 'd3') return ctx.byTier([4, 5], [6, 8], [9, 11])
  if (mode === 'fog') return ctx.byTier([6, 7, 8], [9, 11, 13], [13, 15, 17])
  return ctx.byTier([5, 6, 7], [8, 10, 12], [12, 14, 16])
}

/* ============ Modes 2D (classique, brouillard, glace) ============ */

function load2D() {
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
  const sw = Math.max(2.5, Math.min(4, cw / 8))
  area.innerHTML = `
    <svg viewBox="0 0 ${mz.px} ${mz.px}" width="${mz.px}" height="${mz.px}">
      <g stroke="#B97F3F" stroke-width="${sw}" stroke-linecap="round">${walls}</g>
    </svg>
    <div class="mz-goal" style="left:${(n - 1) * cw}px;top:${(n - 1) * cw}px;width:${cw}px;height:${cw}px">${henDot(cw * 0.8)}</div>
    <div class="mz-chick" id="mzChick" style="width:${cw}px;height:${cw}px">${chickDot(cw * 0.72)}</div>
    ${mz.mode === 'fog' ? '<div class="mz-fog" id="mzFog"></div>' : ''}`
  moveChick(0, 0, false)
}

function moveChick(x: number, y: number, sound = true) {
  mz.pos = { x, y }
  const el = $('mzChick')
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
    setTimeout(() => { if (mz && mz.running) (mz.mode === 'd3' ? load3D : load2D)() }, 900)
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
  let moved = false
  while (open(x, y, d)) {
    x += D[0]; y += D[1]; moved = true
    if (x === mz.n - 1 && y === mz.n - 1) break
  }
  if (moved) { sJump(); moveChick(x, y, false) }
}

/* ============ Mode 3D (raycasting première personne) ============ */

function load3D() {
  const n = mz.sizes[mz.round]
  mz.n = n
  mz.grid = generate(n)
  mz.pos = { x: 0, y: 0 }
  mz.dir = 1 // 0=N 1=E 2=S 3=O
  mz.ang = 90
  mz.animQ = []
  $('mzRound').textContent = `Labyrinthe ${mz.round + 1}/${mz.sizes.length}`
  // Grille "bloquée" (2n+1)² : impair = couloir, pair = mur potentiel
  const m = 2 * n + 1
  const B: boolean[][] = Array.from({ length: m }, () => Array(m).fill(true))
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    B[2 * y + 1][2 * x + 1] = false
    if (!mz.grid[y][x].walls[1] && x < n - 1) B[2 * y + 1][2 * x + 2] = false
    if (!mz.grid[y][x].walls[2] && y < n - 1) B[2 * y + 2][2 * x + 1] = false
  }
  mz.B = B; mz.m = m
  // Murs dorés autour de la sortie
  const gx = 2 * (n - 1) + 1, gy = 2 * (n - 1) + 1
  mz.gold = new Set([`${gx + 1}:${gy}`, `${gx - 1}:${gy}`, `${gx}:${gy + 1}`, `${gx}:${gy - 1}`])
  const area = $('mzArea')
  const px = Math.min(380, window.innerWidth - 44)
  area.style.width = px + 'px'
  area.style.height = Math.round(px * 0.72) + 'px'
  area.innerHTML = `
    <canvas id="mz3dCv" width="${px * 2}" height="${Math.round(px * 0.72) * 2}" style="width:${px}px;height:${Math.round(px * 0.72)}px"></canvas>
    <canvas id="mzMap" width="100" height="100"></canvas>
    <div class="mz3d-btns">
      <button class="mz3d-btn" data-a="left">⟲</button>
      <button class="mz3d-btn" data-a="fwd">⬆️</button>
      <button class="mz3d-btn" data-a="right">⟳</button>
    </div>`
  document.querySelectorAll<HTMLElement>('.mz3d-btn').forEach(b => {
    b.onclick = () => act3D(b.dataset.a!)
  })
  render3D()
  drawMap()
}

function act3D(a: string) {
  if (!mz || !mz.running || mz.anim) return
  if (a === 'left') { mz.dir = (mz.dir + 3) % 4; animate(mz.ang - 90, null) }
  else if (a === 'right') { mz.dir = (mz.dir + 1) % 4; animate(mz.ang + 90, null) }
  else {
    const { x, y } = mz.pos
    if (!open(x, y, mz.dir)) { sPop(); return }
    const D = [[0, -1], [1, 0], [0, 1], [-1, 0]][mz.dir]
    sJump()
    animate(null, { x: x + D[0], y: y + D[1] })
  }
}

function animate(toAng: number | null, toPos: { x: number; y: number } | null) {
  mz.anim = { t0: performance.now(), dur: 210, fromAng: mz.ang, toAng, fromPos: { ...mz.pos }, toPos }
  const step = () => {
    if (!mz || !mz.anim) return
    const k = Math.min(1, (performance.now() - mz.anim.t0) / mz.anim.dur)
    if (mz.anim.toAng !== null) mz.ang = mz.anim.fromAng + (mz.anim.toAng - mz.anim.fromAng) * k
    if (mz.anim.toPos) {
      mz.rx = mz.anim.fromPos.x + (mz.anim.toPos.x - mz.anim.fromPos.x) * k
      mz.ry = mz.anim.fromPos.y + (mz.anim.toPos.y - mz.anim.fromPos.y) * k
    }
    render3D()
    if (k < 1) { requestAnimationFrame(step); return }
    if (mz.anim.toAng !== null) mz.ang = ((mz.anim.toAng % 360) + 360) % 360
    if (mz.anim.toPos) {
      mz.pos = mz.anim.toPos
      mz.rx = mz.pos.x; mz.ry = mz.pos.y
    }
    mz.anim = null
    drawMap()
    if (mz.pos.x === mz.n - 1 && mz.pos.y === mz.n - 1) { roundWon(); return }
    render3D()
  }
  requestAnimationFrame(step)
}

function render3D() {
  const cv = document.getElementById('mz3dCv') as HTMLCanvasElement
  if (!cv || !mz) return
  const g = cv.getContext('2d')!
  const W = cv.width, H = cv.height
  // Ciel et herbe
  const sky = g.createLinearGradient(0, 0, 0, H / 2)
  sky.addColorStop(0, '#8FD0F5'); sky.addColorStop(1, '#D8EFFC')
  g.fillStyle = sky; g.fillRect(0, 0, W, H / 2)
  const ground = g.createLinearGradient(0, H / 2, 0, H)
  ground.addColorStop(0, '#C6E8B4'); ground.addColorStop(1, '#8FCC7A')
  g.fillStyle = ground; g.fillRect(0, H / 2, W, H / 2)
  // Position dans la grille bloquée (centres des cases impaires)
  const px = 2 * (mz.rx ?? mz.pos.x) + 1.5
  const py = 2 * (mz.ry ?? mz.pos.y) + 1.5
  const FOV = 66 * Math.PI / 180
  const base = (mz.ang - 90) * Math.PI / 180 // ang 90 = est
  const cols = 160, cw = W / cols
  for (let i = 0; i < cols; i++) {
    const ra = base - FOV / 2 + (FOV * (i + 0.5)) / cols
    const dx = Math.cos(ra), dy = Math.sin(ra)
    // DDA
    let mapX = Math.floor(px), mapY = Math.floor(py)
    const dDX = Math.abs(1 / (dx || 1e-9)), dDY = Math.abs(1 / (dy || 1e-9))
    let sx, sy, sideX, sideY
    if (dx < 0) { sx = -1; sideX = (px - mapX) * dDX } else { sx = 1; sideX = (mapX + 1 - px) * dDX }
    if (dy < 0) { sy = -1; sideY = (py - mapY) * dDY } else { sy = 1; sideY = (mapY + 1 - py) * dDY }
    let side = 0, guard = 0
    while (guard++ < 200) {
      if (sideX < sideY) { sideX += dDX; mapX += sx; side = 0 } else { sideY += dDY; mapY += sy; side = 1 }
      if (mapX < 0 || mapY < 0 || mapX >= mz.m || mapY >= mz.m || mz.B[mapY][mapX]) break
    }
    const dist = Math.max(0.05, (side === 0 ? sideX - dDX : sideY - dDY) * Math.cos(ra - base))
    const h = Math.min(H * 1.6, H / dist)
    const gold = mz.gold.has(`${mapX}:${mapY}`)
    const shade = Math.max(0.35, 1 - dist / 12)
    let r = 217, gg = 160, b = 95 // bois chaud
    if (gold) { r = 255; gg = 206; b = 60 }
    if (side === 1) { r *= 0.78; gg *= 0.78; b *= 0.78 }
    g.fillStyle = `rgb(${r * shade | 0},${gg * shade | 0},${b * shade | 0})`
    g.fillRect(i * cw, (H - h) / 2, cw + 1, h)
  }
}

function drawMap() {
  const cv = document.getElementById('mzMap') as HTMLCanvasElement
  if (!cv || !mz) return
  const g = cv.getContext('2d')!
  const n = mz.n, s = 100 / n
  g.clearRect(0, 0, 100, 100)
  g.fillStyle = 'rgba(255,249,240,.92)'
  g.fillRect(0, 0, 100, 100)
  g.strokeStyle = '#B97F3F'; g.lineWidth = 1.5; g.lineCap = 'round'
  g.beginPath()
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = mz.grid[y][x]
    if (c.walls[0]) { g.moveTo(x * s, y * s); g.lineTo((x + 1) * s, y * s) }
    if (c.walls[3]) { g.moveTo(x * s, y * s); g.lineTo(x * s, (y + 1) * s) }
  }
  g.moveTo(0, 100); g.lineTo(100, 100); g.moveTo(100, 0); g.lineTo(100, 100)
  g.stroke()
  // Sortie + joueur
  g.fillStyle = '#FFCE3C'
  g.fillRect((n - 1) * s + 1.5, (n - 1) * s + 1.5, s - 3, s - 3)
  const cx = (mz.pos.x + 0.5) * s, cy = (mz.pos.y + 0.5) * s
  const a = (mz.ang - 90) * Math.PI / 180
  g.fillStyle = '#FF6B81'
  g.beginPath()
  g.arc(cx, cy, Math.max(2.5, s * 0.28), 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#FF6B81'; g.lineWidth = 2
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * s * 0.55, cy + Math.sin(a) * s * 0.55); g.stroke()
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
    ice: 'Tout est gelé : le poussin glisse jusqu\'au prochain mur ! (glisse ton doigt)',
    d3: 'Tu ES le poussin ! Avance et tourne pour trouver la sortie dorée'
  }
  $('mzSub').textContent = subs[mode]
  if (mode === 'd3') load3D()
  else load2D()
}

function finish() {
  const secs = Math.round((performance.now() - mz.t0) / 1000)
  sWin()
  const totalCells = mz.sizes.reduce((s: number, n: number) => s + n * n, 0)
  const f = MODES[mz.mode].factor
  const stars = secs <= totalCells * 0.9 * f ? 3 : secs <= totalCells * 1.6 * f ? 2 : 1
  const names: Record<string, string> = { classic: '', fog: ' dans le noir 🌫', ice: ' sur la glace 🧊', d3: ' en 3D 🕶' }
  ctx.finish({
    title: 'Famille réunie !',
    msg: `${ctx.playerName} a traversé ${mz.sizes.length} labyrinthes${names[mz.mode]} en ${secs} s 🐤`,
    stars, starsEarned: stars
  })
}

export const maze: GameDef = {
  id: 'maze', name: 'Labyrinthe', icon: '🌀', sq: 'sq-peach', cat: 'reflexion',
  subtitle: 'Classique, dans le noir, sur la glace… ou en 3D !',
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
    mz = { running: true, mode: 'classic', anim: null, swipe: null }
    document.querySelectorAll<HTMLElement>('.mz-mode').forEach(b => {
      b.onclick = () => mz && mz.running && setMode(b.dataset.m!)
    })
    const area = $('mzArea')
    const onMove = (e: PointerEvent) => {
      if (!mz || !mz.running || !mz.down) return
      if (mz.mode === 'ice' || mz.mode === 'd3') return
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
      else if (mz.mode === 'd3') {
        if (e.key === 'ArrowUp') act3D('fwd')
        else if (e.key === 'ArrowLeft') act3D('left')
        else if (e.key === 'ArrowRight') act3D('right')
      } else {
        const { x, y } = mz.pos
        const D = [[0, -1], [1, 0], [0, 1], [-1, 0]][d]
        tryStep(x + D[0], y + D[1])
      }
    }
    area.addEventListener('pointerdown', onDown)
    area.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    setMode('classic')
    return () => {
      if (mz) { mz.running = false; mz = null }
      area.removeEventListener('pointerdown', onDown)
      area.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }
}
