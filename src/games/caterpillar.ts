import type { GameContext, GameDef } from '../core/types'
import { $, pick, rnd } from '../core/utils'
import { sCrunch, sNope, sWin, tone } from '../core/audio'
import { FX } from '../core/fx'

/* La Chenille qui grandit — un snake tout doux : glisse le doigt pour guider
   la chenille vers les fruits, elle grandit à chaque bouchée. Pas de mort :
   les bords ramènent de l'autre côté (pré magique) et se marcher dessus fait
   juste trébucher (on raccourcit un peu). Objectif : devenir bien dodue ! */

const FRUITS = ['🍎', '🍓', '🍇', '🍊', '🍐', '🫐']
const CELL = 30

let cp: any = null
let ctx: GameContext

function placeFruit() {
  let x = 0, y = 0, tries = 0
  do { x = rnd(0, cp.cols - 1); y = rnd(0, cp.rows - 1); tries++ }
  while (tries < 60 && cp.snake.some((s: any) => s.x === x && s.y === y))
  cp.fruit = { x, y, e: pick(FRUITS) }
}

function draw() {
  const c: CanvasRenderingContext2D = cp.cx2d
  const { cols, rows } = cp
  c.clearRect(0, 0, cols * CELL, rows * CELL)
  // Pré en damier très léger
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if ((x + y) % 2 === 0) { c.fillStyle = 'rgba(143,203,116,.12)'; c.fillRect(x * CELL, y * CELL, CELL, CELL) }
  }
  // Fruit sur une petite assiette claire (pour bien le voir sur l'herbe)
  const fx = cp.fruit.x * CELL + CELL / 2, fy = cp.fruit.y * CELL + CELL / 2
  c.fillStyle = 'rgba(255,255,255,.8)'
  c.beginPath(); c.arc(fx, fy, CELL * 0.55, 0, Math.PI * 2); c.fill()
  c.font = `${CELL * 0.88}px serif`
  c.textAlign = 'center'; c.textBaseline = 'middle'
  c.fillText(cp.fruit.e, fx, fy + 1)
  // Chenille : segments ronds dégradés, tête expressive
  const n = cp.snake.length
  for (let i = n - 1; i >= 0; i--) {
    const s = cp.snake[i]
    const px = s.x * CELL + CELL / 2, py = s.y * CELL + CELL / 2
    const r = CELL * (i === 0 ? 0.48 : 0.42 - (i / n) * 0.08)
    const t = i / Math.max(1, n - 1)
    c.fillStyle = i === 0 ? '#7BC96A' : `hsl(${95 - t * 30}, 62%, ${58 + t * 12}%)`
    c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill()
    c.strokeStyle = 'rgba(70,110,55,.35)'; c.lineWidth = 2; c.stroke()
    if (i === 0) {
      // Antennes, yeux, joues, sourire
      const dx = cp.dir.x, dy = cp.dir.y
      c.strokeStyle = '#5B8F4A'; c.lineWidth = 2.5
      c.beginPath()
      c.moveTo(px - 6, py - r + 2); c.quadraticCurveTo(px - 9, py - r - 8, px - 12, py - r - 6)
      c.moveTo(px + 6, py - r + 2); c.quadraticCurveTo(px + 9, py - r - 8, px + 12, py - r - 6)
      c.stroke()
      c.fillStyle = '#5B8F4A'
      c.beginPath(); c.arc(px - 12, py - r - 6, 2.5, 0, 7); c.arc(px + 12, py - r - 6, 2.5, 0, 7); c.fill()
      c.fillStyle = '#fff'
      c.beginPath(); c.arc(px - 5 + dx * 2, py - 3 + dy * 2, 4.5, 0, 7); c.arc(px + 5 + dx * 2, py - 3 + dy * 2, 4.5, 0, 7); c.fill()
      c.fillStyle = '#3A3A3A'
      c.beginPath(); c.arc(px - 4 + dx * 3, py - 3 + dy * 3, 2.2, 0, 7); c.arc(px + 6 + dx * 3, py - 3 + dy * 3, 2.2, 0, 7); c.fill()
      c.fillStyle = 'rgba(255,150,160,.65)'
      c.beginPath(); c.arc(px - 9, py + 3, 2.6, 0, 7); c.arc(px + 9, py + 3, 2.6, 0, 7); c.fill()
      c.strokeStyle = '#3A3A3A'; c.lineWidth = 1.8
      c.beginPath(); c.arc(px + dx * 2, py + 3 + dy * 2, 4, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke()
    }
  }
}

function step() {
  if (!cp || !cp.running) return
  cp.dir = cp.nextDir
  const head = cp.snake[0]
  let nx = (head.x + cp.dir.x + cp.cols) % cp.cols
  let ny = (head.y + cp.dir.y + cp.rows) % cp.rows
  // Se marcher dessus : on trébuche (raccourcit de 2), sans mourir
  const hitIdx = cp.snake.findIndex((s: any) => s.x === nx && s.y === ny)
  if (hitIdx > 0 && hitIdx < cp.snake.length - 1) {
    cp.stumbles++
    sNope()
    cp.snake = cp.snake.slice(0, Math.max(3, cp.snake.length - 2))
    $('cpArena').classList.remove('shake'); void $('cpArena').offsetWidth; $('cpArena').classList.add('shake')
  }
  cp.snake.unshift({ x: nx, y: ny })
  if (nx === cp.fruit.x && ny === cp.fruit.y) {
    cp.eaten++
    sCrunch(); tone(520 + cp.eaten * 22, 0.09, 'triangle', 0.12)
    const r = cp.canvas.getBoundingClientRect()
    FX.burst(r.left + (nx + 0.5) * (r.width / cp.cols), r.top + (ny + 0.5) * (r.height / cp.rows),
      { colors: ['#FFE08A', '#8FCB74', '#FF9E7A'], count: 8 })
    $('cpScore').textContent = `🍎 ${cp.eaten}/${cp.goal}`
    placeFruit()
    if (cp.eaten >= cp.goal) { finish(); return }
    // La chenille accélère tout doucement
    cp.speed = Math.max(130, cp.speed - 6)
    clearInterval(cp.timer)
    cp.timer = setInterval(step, cp.speed)
  } else {
    cp.snake.pop()
  }
  draw()
}

function setDir(x: number, y: number) {
  if (!cp || !cp.running) return
  // Pas de demi-tour sur place
  if (x === -cp.dir.x && y === -cp.dir.y) return
  cp.nextDir = { x, y }
}

function finish() {
  sWin()
  const stars = cp.stumbles === 0 ? 3 : cp.stumbles <= 2 ? 2 : 1
  ctx.finish({
    title: 'Quelle belle chenille !',
    msg: `${ctx.playerName} a fait grandir une chenille de ${cp.snake.length} anneaux 🐛`,
    stars: stars as 1 | 2 | 3, starsEarned: stars
  })
}

export const caterpillar: GameDef = {
  id: 'caterpillar', name: 'La Chenille', icon: '🐛', sq: 'sq-mint', cat: 'action', music: 'meadow',
  subtitle: 'Glisse ton doigt pour guider la chenille vers les fruits !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar"><div class="chip" id="cpScore">🍎 0/?</div></div>
      <div class="arena cp-arena" id="cpArena"><canvas id="cpCanvas"></canvas></div>`
    const arena = $('cpArena')
    const cols = Math.max(10, Math.floor(arena.clientWidth / CELL))
    const rows = Math.max(9, Math.floor(arena.clientHeight / CELL))
    const canvas = $('cpCanvas') as unknown as HTMLCanvasElement
    canvas.width = cols * CELL
    canvas.height = rows * CELL
    const midY = Math.floor(rows / 2)
    cp = {
      cols, rows, canvas, cx2d: canvas.getContext('2d'),
      snake: [{ x: 5, y: midY }, { x: 4, y: midY }, { x: 3, y: midY }],
      dir: { x: 1, y: 0 }, nextDir: { x: 1, y: 0 },
      eaten: 0, stumbles: 0, running: true,
      goal: c.byTier(8, 12, 16),
      speed: c.byTier(300, 240, 190)
    }
    $('cpScore').textContent = `🍎 0/${cp.goal}`
    placeFruit()
    draw()
    cp.timer = setInterval(step, cp.speed)

    // Glisser dans une direction (n'importe où sur l'arène)
    let start: { x: number; y: number } | null = null
    arena.onpointerdown = e => { start = { x: e.clientX, y: e.clientY } }
    arena.onpointermove = e => {
      if (!start) return
      const dx = e.clientX - start.x, dy = e.clientY - start.y
      if (Math.hypot(dx, dy) < 22) return
      if (Math.abs(dx) > Math.abs(dy)) setDir(Math.sign(dx), 0)
      else setDir(0, Math.sign(dy))
      start = { x: e.clientX, y: e.clientY }
    }
    arena.onpointerup = () => { start = null }
    // Flèches du clavier (si un clavier traîne)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') setDir(0, -1)
      else if (e.key === 'ArrowDown') setDir(0, 1)
      else if (e.key === 'ArrowLeft') setDir(-1, 0)
      else if (e.key === 'ArrowRight') setDir(1, 0)
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
      if (cp) { cp.running = false; clearInterval(cp.timer); cp = null }
    }
  }
}
