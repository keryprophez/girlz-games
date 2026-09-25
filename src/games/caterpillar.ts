import type { GameContext, GameDef } from '../core/types'
import { $, pick } from '../core/utils'
import { impact } from '../core/impact'
import { loader } from '../core/three3d'
import { arcade, type Arcade } from '../core/arcade'
import { ICON } from '../core/icons'
import { sfx, preloadSfx, cry, preloadCries } from '../core/sfx'
import { isPaused } from '../core/session'

/* 🐛 La Chenille qui fait des trous — refaite en 2D le 25/09.

   « Mouais » pour le snake rhabillé : c'est maintenant l'histoire que les
   filles connaissent. Une chenille sur une GRANDE FEUILLE (le bord de la
   feuille est le mur, on joue dans une vraie forme de feuille), et une
   semaine de repas : lundi 1 pomme, mardi 2 poires, mercredi 3 prunes,
   jeudi 4 fraises, vendredi 5 oranges, samedi le festin (6 fruits), dimanche
   une belle feuille verte. Puis la chrysalide, et le papillon s'envole.

   - Chaque bouchée est COMPTÉE par la voix (« un, deux, trois… ») et laisse
     un trou grignoté dans la feuille, là où était le repas : à la fin de la
     semaine, la feuille est pleine de trous. La voix dit aussi le jour au
     lever du soleil (le coq chante) — du contenu, jamais une consigne ;
   - le soir, la lune passe et la chenille dort ; le matin, le jour suivant ;
   - sortir de la feuille ou se mordre coûte un cœur (la chenille raccourcit
     et repart) ; frôler sa queue sans la toucher fait « ouf » ;
   - la chenille grandit en mangeant (un anneau par fruit, un pour deux en
     douce) et va un peu plus vite chaque jour.

   Rendu : un canvas 2D ; la feuille est dessinée une fois dans un canvas à
   part, les trous y sont PERCÉS (on voit le fond au travers). Illustrations
   Canva (`public/assets/chenille/`, `fruits/`), comme le Ninja et le Potager. */

const COLS = 13
const ROWS = 11
const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const COUNT = ['un', 'deux', 'trois', 'quatre', 'cinq', 'six']
/** Les repas de la semaine ; le samedi est un festin de fruits différents. */
const WEEK: string[][] = [
  ['pomme'], ['poire', 'poire'], ['prune', 'prune', 'prune'], ['fraise', 'fraise', 'fraise', 'fraise'],
  ['orange', 'orange', 'orange', 'orange', 'orange'],
  ['pomme', 'poire', 'prune', 'fraise', 'orange', 'kiwi'],
  ['feuille']
]
const base = import.meta.env.BASE_URL
const SRC: Record<string, string> = {
  pomme: `${base}assets/fruits/pomme.webp`, poire: `${base}assets/fruits/poire.webp`, prune: `${base}assets/fruits/prune.webp`,
  fraise: `${base}assets/fruits/fraise.webp`, orange: `${base}assets/fruits/orange.webp`, kiwi: `${base}assets/fruits/kiwi.webp`,
  feuille: `${base}assets/chenille/feuille.webp`,
  leaf: `${base}assets/chenille/grande-feuille.webp`,
  tete: `${base}assets/chenille/tete.webp`, croque: `${base}assets/chenille/tete-croque.webp`,
  anneau: `${base}assets/chenille/anneau.webp`, clair: `${base}assets/chenille/anneau-clair.webp`,
  queue: `${base}assets/chenille/queue.webp`,
  chrysalide: `${base}assets/chenille/chrysalide.webp`, papillon: `${base}assets/chenille/papillon.webp`,
  ferme: `${base}assets/chenille/papillon-ferme.webp`,
  soleil: `${base}assets/chenille/soleil.webp`, lune: `${base}assets/chenille/lune.webp`
}

type Cell = { x: number; y: number }
interface Item extends Cell { kind: string; born: number }
interface Crumb { x: number; y: number; vx: number; vy: number; life: number; col: string }

interface State {
  arena: HTMLElement
  cv: HTMLCanvasElement
  g: CanvasRenderingContext2D
  img: Record<string, HTMLImageElement>
  /** Cases jouables : sur la feuille (calculé sur l'alpha de l'image). */
  onLeaf: boolean[][]
  /** Mise en page (px CSS) : la feuille, et une case. */
  W: number; H: number; LX: number; LY: number; LW: number; LH: number; cw: number; ch: number; dpr: number
  /** La feuille, dessinée une fois, et percée à chaque repas. */
  leafCv: HTMLCanvasElement
  holes: { x: number; y: number; s: number }[]
  snake: Cell[]
  prev: Cell[]
  dir: Cell
  nextDir: Cell
  items: Item[]
  day: number
  /** Repas croqués aujourd'hui. */
  bites: number
  eaten: number
  grow: number
  speed: number
  acc: number
  /** La chenille avance (faux la nuit, et pendant la métamorphose). */
  moving: boolean
  over: boolean
  game: Arcade
  crumbs: Crumb[]
  lastOuf: number
  simT: number
  shakeT: number
  /** La métamorphose : 0 rien, puis le temps écoulé depuis la chrysalide. */
  meta: number
  metaAt: Cell | null
  raf: number
  last: number
  hint: HTMLElement | null
}

let cp: State | null = null
let ctx: GameContext

const cx = (me: State, c: number) => me.LX + (c + 0.5) * me.cw
const cy = (me: State, r: number) => me.LY + (r + 0.5) * me.ch
const playable = (me: State, c: Cell) => c.x >= 0 && c.x < COLS && c.y >= 0 && c.y < ROWS && me.onLeaf[c.y][c.x]

/* ---------- La feuille ---------- */

/** Les cases de la grille qui tombent sur la feuille : centre et quatre
    presque-coins opaques dans l'image. */
function leafMask(im: HTMLImageElement): boolean[][] {
  const c = document.createElement('canvas')
  c.width = im.naturalWidth; c.height = im.naturalHeight
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(im, 0, 0)
  const data = g.getImageData(0, 0, c.width, c.height).data
  const a = (x: number, y: number) => data[(Math.min(c.height - 1, Math.floor(y)) * c.width + Math.min(c.width - 1, Math.floor(x))) * 4 + 3]
  const cw = c.width / COLS, ch = c.height / ROWS
  return Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, k) =>
    [[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]].every(([u, v]) => a((k + u) * cw, (r + v) * ch) > 200)))
}

/** Un trou grignoté : une forme molle et irrégulière, percée dans la feuille,
    avec un liseré de feuille un peu brunie. */
function holePath(g: CanvasRenderingContext2D, x: number, y: number, R: number, seed: number) {
  g.beginPath()
  for (let k = 0; k <= 22; k++) {
    const a = k / 22 * Math.PI * 2
    const bite = 1 + 0.16 * Math.sin(a * 3 + seed) + 0.08 * Math.sin(a * 7 + seed * 2)
    const px = x + Math.cos(a) * R * bite, py = y + Math.sin(a) * R * bite * 0.9
    if (k) g.lineTo(px, py); else g.moveTo(px, py)
  }
  g.closePath()
}

function punch(me: State, h: { x: number; y: number; s: number }) {
  const g = me.leafCv.getContext('2d')!
  const x = (h.x + 0.5) * me.cw, y = (h.y + 0.5) * me.ch, R = me.cw * 0.3 * h.s, seed = h.x * 7 + h.y * 13
  g.save()
  g.scale(me.dpr, me.dpr)
  g.lineJoin = 'round'
  holePath(g, x, y, R, seed)
  g.strokeStyle = '#D5E89A'; g.lineWidth = 7; g.stroke()
  g.globalCompositeOperation = 'destination-out'
  holePath(g, x, y, R, seed)
  g.fill()
  g.globalCompositeOperation = 'source-over'
  holePath(g, x, y, R, seed)
  g.strokeStyle = '#6F8F32'; g.lineWidth = 2.4; g.stroke()
  g.restore()
}

function layout(me: State) {
  const W = me.arena.clientWidth, H = me.arena.clientHeight
  if (!W || !H || (W === me.W && H === me.H)) return
  me.W = W; me.H = H
  me.cv.width = Math.round(W * me.dpr); me.cv.height = Math.round(H * me.dpr)
  // La feuille prend toute la hauteur libre entre la barre du haut et la semaine
  const ratio = me.img.leaf.naturalWidth / me.img.leaf.naturalHeight
  // (en haut, les cœurs et la barre de jeu ; en bas, la semaine : rien ne doit tomber dessous)
  const top = 66, bottom = 112
  const availH = H - top - bottom, availW = W - 300
  let LH = availH, LW = LH * ratio
  if (LW > availW) { LW = availW; LH = LW / ratio }
  me.LW = LW; me.LH = LH
  me.LX = (W - LW) / 2 + 20; me.LY = top + (availH - LH) / 2
  me.cw = LW / COLS; me.ch = LH / ROWS
  me.leafCv.width = Math.round(LW * me.dpr); me.leafCv.height = Math.round(LH * me.dpr)
  me.leafCv.getContext('2d')!.drawImage(me.img.leaf, 0, 0, me.leafCv.width, me.leafCv.height)
  for (const h of me.holes) punch(me, h)
}

/* ---------- La semaine ---------- */

function paintWeek(me: State) {
  const el = me.arena.querySelector('.ch-week')
  if (!el) return
  el.querySelectorAll<HTMLElement>('.ch-day').forEach((d, k) => {
    d.classList.toggle('done', k < me.day)
    d.classList.toggle('now', k === me.day)
    const pips = d.querySelector('.pips')
    if (pips) pips.innerHTML = k === me.day ? WEEK[k].map((_, i) => `<i class="${i < me.bites ? 'on' : ''}"></i>`).join('') : ''
  })
}

function freeCell(me: State, avoid: Cell[]): Cell | null {
  const head = me.snake[0]
  const free: Cell[] = []
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const c = { x, y }
    if (!playable(me, c)) continue
    if (me.snake.some(s => s.x === x && s.y === y)) continue
    if (avoid.some(a => Math.abs(a.x - x) + Math.abs(a.y - y) < 2)) continue
    if (Math.abs(head.x - x) + Math.abs(head.y - y) < 3) continue
    free.push(c)
  }
  return free.length ? pick(free) : null
}

/** Le matin : le coq, le jour dit par la voix, le soleil, les repas du jour. */
function dawn(me: State) {
  if (cp !== me || me.over) return
  me.bites = 0
  me.arena.classList.remove('night')
  const sky = $('chSky') as unknown as HTMLImageElement
  sky.src = SRC.soleil; sky.classList.remove('rise'); void sky.offsetWidth; sky.classList.add('rise')
  cry('coq', { vol: 0.55, max: 1.4 })
  me.game.after(900, () => { if (cp === me) ctx.say(DAY_NAMES[me.day]) })
  paintWeek(me)
  const placed: Cell[] = []
  WEEK[me.day].forEach((kind, i) => {
    me.game.after(700 + i * 220, () => {
      if (cp !== me || me.over) return
      const c = freeCell(me, placed)
      if (!c) return
      placed.push(c)
      me.items.push({ ...c, kind, born: me.simT })
      sfx('pluck', { vol: 0.45, rate: 1 + i * 0.06 })
    })
  })
  me.speed = ctx.byTier(340, 280, 230) - me.day * ctx.byTier(12, 13, 14)
  me.game.after(700 + WEEK[me.day].length * 220, () => { if (cp === me && !me.over) me.moving = true })
}

/** Le soir : la lune passe, la chenille dort, puis le jour suivant. */
function dusk(me: State) {
  me.moving = false
  sfx('confirm', { vol: 0.6 })
  me.arena.classList.add('night')
  const sky = $('chSky') as unknown as HTMLImageElement
  sky.src = SRC.lune; sky.classList.remove('rise'); void sky.offsetWidth; sky.classList.add('rise')
  me.day++
  paintWeek(me)
  me.game.after(2200, () => dawn(me))
}

/* ---------- La chenille ---------- */

function setDir(x: number, y: number) {
  const me = cp
  if (!me || me.over) return
  if (x === -me.dir.x && y === -me.dir.y) return // pas de demi-tour sur place
  me.nextDir = { x, y }
  if (me.hint) { me.hint.remove(); me.hint = null }
}

function bump(me: State, wall: boolean): boolean {
  impact(0.7, { matter: wall ? 'bois' : 'pate', noShake: true })
  me.shakeT = 0.3
  me.game.flash(ICON.heartEmpty, 'bad')
  if (me.game.hurt()) { finish(me, false); return true }
  // Il reste une vie : on raccourcit et on repart, sans temps mort
  const keep = Math.max(3, Math.floor(me.snake.length / 2))
  me.snake = me.snake.slice(0, keep)
  me.prev = me.prev.slice(0, keep)
  return false
}

function crumbs(me: State, x: number, y: number, col: string) {
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 120
    me.crumbs.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.3, col })
  }
}

const JUICE: Record<string, string> = { pomme: '#E8404A', poire: '#B9C93F', prune: '#7B4BB5', fraise: '#E0303C', orange: '#FF9A1F', kiwi: '#8CC63F', feuille: '#5E9E3A' }

function eat(me: State, it: Item) {
  me.items.splice(me.items.indexOf(it), 1)
  me.bites++
  me.eaten++
  sfx('chop', { vol: 0.75, rate: 1.05 + me.bites * 0.05 })
  const x = cx(me, it.x), y = cy(me, it.y)
  crumbs(me, x, y, JUICE[it.kind] ?? '#7B4BB5')
  // La bouchée est comptée, à voix haute et en grand
  ctx.say(COUNT[me.bites - 1] ?? String(me.bites))
  const n = document.createElement('div')
  n.className = 'ch-count'
  n.textContent = String(me.bites)
  n.style.left = x + 'px'; n.style.top = (y - me.ch * 0.9) + 'px'
  n.addEventListener('animationend', () => n.remove())
  me.arena.appendChild(n)
  // Le trou reste dans la feuille, là où était le repas
  const h = { x: it.x, y: it.y, s: it.kind === 'feuille' ? 1.3 : 0.8 + Math.random() * 0.25 }
  me.holes.push(h)
  punch(me, h)
  me.game.hit(1, { silent: true })
  me.grow += ctx.byTier(0.5, 1, 1)
  paintWeek(me)
  if (me.bites >= WEEK[me.day].length) {
    me.moving = false
    if (me.day === WEEK.length - 1) metamorphosis(me)
    else me.game.after(500, () => { if (cp === me && !me.over) dusk(me) })
  }
}

function step(me: State) {
  if (me.over || !me.moving) return
  me.dir = me.nextDir
  const head = me.snake[0]
  const nxt = { x: head.x + me.dir.x, y: head.y + me.dir.y }
  // Le bord de la feuille : on cogne, on perd un cœur, on repart ailleurs
  if (!playable(me, nxt)) {
    if (bump(me, true)) return
    const turns: Cell[] = me.dir.x ? [{ x: 0, y: -1 }, { x: 0, y: 1 }] : [{ x: -1, y: 0 }, { x: 1, y: 0 }]
    const ok = turns.filter(d => {
      const t = { x: head.x + d.x, y: head.y + d.y }
      return playable(me, t) && !me.snake.some(s => s.x === t.x && s.y === t.y)
    })
    me.dir = me.nextDir = ok.length ? pick(ok) : { x: -me.dir.x, y: -me.dir.y }
    return
  }
  // Se mordre : un cœur
  const hitIdx = me.snake.findIndex(s => s.x === nxt.x && s.y === nxt.y)
  if (hitIdx > 0 && hitIdx < me.snake.length - 1) {
    if (bump(me, false)) return
  }
  me.prev = me.snake.map(s => ({ ...s }))
  me.snake.unshift(nxt)
  me.prev.unshift({ ...head })
  if (me.grow >= 1) { me.grow -= 1; me.prev.pop(); me.prev.push({ ...me.snake[me.snake.length - 1] }) }
  else { me.snake.pop(); me.prev.pop() }
  sfx('tick', { vol: 0.12, rate: 0.9 + me.day * 0.05, spread: 0.02 })

  const it = me.items.find(i => i.x === nxt.x && i.y === nxt.y)
  if (it) { eat(me, it); return }
  // Le « ouf » : frôler sa queue (pas le cou) sans la toucher
  const close = me.snake.some((s, i) => i >= 4 && Math.abs(s.x - nxt.x) + Math.abs(s.y - nxt.y) === 1)
  if (close && me.simT - me.lastOuf > 3) {
    me.lastOuf = me.simT
    sfx('whoosh', { vol: 0.4, rate: 0.85 })
    me.game.flash(ICON.bolt)
  }
}

/** Dimanche soir : la chenille devient chrysalide, puis le papillon s'envole. */
function metamorphosis(me: State) {
  me.moving = false
  me.over = true
  me.metaAt = { ...me.snake[0] }
  me.meta = 0.0001
  sfx('confirm', { vol: 0.8, rate: 1.1 })
  me.arena.classList.add('night')
  const sky = $('chSky') as unknown as HTMLImageElement
  sky.src = SRC.lune; sky.classList.remove('rise'); void sky.offsetWidth; sky.classList.add('rise')
  me.day = WEEK.length
  paintWeek(me)
  me.game.end({ title: 'Un beau papillon !', msg: `Tu as croqué ${me.eaten} repas en une semaine`, outroMs: 5200 })
}

function finish(me: State, won: boolean) {
  if (me.over) return
  me.over = true
  me.moving = false
  me.game.end({
    title: won ? 'Un beau papillon !' : 'La chenille est fatiguée…',
    msg: `Tu as croqué ${me.eaten} repas`,
    outroMs: 1200
  })
}

/* ---------- La boucle ---------- */

function update(me: State, dt: number) {
  if (me.moving && !me.over) {
    me.acc += dt * 1000
    while (me.acc >= me.speed && me.moving && !me.over) { me.acc -= me.speed; step(me) }
  }
  for (let i = me.crumbs.length - 1; i >= 0; i--) {
    const c = me.crumbs[i]
    c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= 0.92; c.vy *= 0.92
    c.life -= dt
    if (c.life <= 0) me.crumbs.splice(i, 1)
  }
  if (me.shakeT > 0) me.shakeT = Math.max(0, me.shakeT - dt)
  if (me.meta) {
    me.meta += dt
    if (me.meta > 2.2 && !me.arena.classList.contains('dawnlast')) {
      me.arena.classList.add('dawnlast')
      me.arena.classList.remove('night')
      const sky = $('chSky') as unknown as HTMLImageElement
      sky.src = SRC.soleil; sky.classList.remove('rise'); void sky.offsetWidth; sky.classList.add('rise')
      sfx('confirm', { vol: 0.7, rate: 1.3 })
    }
  }
}

function drawImg(g: CanvasRenderingContext2D, im: HTMLImageElement, x: number, y: number, sz: number, rot = 0, alpha = 1) {
  g.save()
  g.globalAlpha = alpha
  g.translate(x, y); g.rotate(rot)
  g.drawImage(im, -sz / 2, -sz / 2, sz, sz)
  g.restore()
}

function draw(me: State, now: number) {
  const { g, dpr, W, H } = me
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, W, H)
  if (me.shakeT > 0) { const k = me.shakeT / 0.3 * 7; g.translate((Math.random() * 2 - 1) * k, (Math.random() * 2 - 1) * k) }
  // La feuille (percée), avec son ombre douce
  g.save()
  g.shadowColor = 'rgba(90,70,30,.28)'; g.shadowBlur = 18; g.shadowOffsetY = 12
  g.drawImage(me.leafCv, me.LX, me.LY, me.LW, me.LH)
  g.restore()

  // Les repas du jour : ils apparaissent d'un bond, puis respirent
  for (const it of me.items) {
    const age = me.simT - it.born
    const pop = Math.min(1, age / 0.25)
    const s = me.cw * 1.15 * (pop < 1 ? 0.4 + pop * 0.75 : 1 + Math.sin(now / 320 + it.x) * 0.04)
    const x = cx(me, it.x), y = cy(me, it.y)
    g.fillStyle = 'rgba(40,70,20,.22)'
    g.beginPath(); g.ellipse(x + 3, y + s * 0.36, s * 0.34, s * 0.12, 0, 0, Math.PI * 2); g.fill()
    drawImg(g, me.img[it.kind], x, y, s)
  }

  // La chenille : chaque anneau glisse de la case qu'il quitte vers la suivante
  const p = me.moving ? Math.min(1, me.acc / me.speed) : 1
  const pos = me.snake.map((b, i) => {
    const a = me.prev[i] ?? b
    return { x: cx(me, a.x + (b.x - a.x) * p), y: cy(me, a.y + (b.y - a.y) * p) }
  })
  const metaK = me.meta ? Math.min(1, me.meta / 1.2) : 0
  const bodyAlpha = 1 - metaK
  if (bodyAlpha > 0.01) {
    for (let i = pos.length - 1; i >= 0; i--) {
      const q = pos[i], nx = pos[Math.max(0, i - 1)]
      const dx = i === 0 ? me.dir.x : nx.x - q.x, dy = i === 0 ? me.dir.y : nx.y - q.y
      const rot = Math.atan2(dy, dx) + Math.PI / 2
      const wob = 1 + Math.sin(now / 160 - i * 0.8) * 0.04
      g.globalAlpha = bodyAlpha
      g.fillStyle = 'rgba(40,70,20,.22)'
      g.beginPath(); g.ellipse(q.x + 3, q.y + me.cw * 0.42, me.cw * 0.42, me.cw * 0.14, 0, 0, Math.PI * 2); g.fill()
      if (i === 0) {
        const hungry = me.items.some(it => Math.abs(it.x - me.snake[0].x) + Math.abs(it.y - me.snake[0].y) <= 1)
        drawImg(g, hungry ? me.img.croque : me.img.tete, q.x, q.y, me.cw * 1.35, rot, bodyAlpha)
      } else {
        const im = i === pos.length - 1 && pos.length > 2 ? me.img.queue : i % 2 ? me.img.anneau : me.img.clair
        drawImg(g, im, q.x, q.y, me.cw * (i === pos.length - 1 ? 0.95 : 1.12) * wob, rot, bodyAlpha)
      }
    }
    g.globalAlpha = 1
  }

  // Les miettes
  for (const c of me.crumbs) {
    g.globalAlpha = Math.min(1, c.life * 2)
    g.fillStyle = c.col
    g.beginPath(); g.arc(c.x, c.y, 4.5, 0, Math.PI * 2); g.fill()
  }
  g.globalAlpha = 1

  // La métamorphose : la chrysalide qui brille, puis le papillon qui s'envole
  if (me.meta && me.metaAt) {
    const x = cx(me, me.metaAt.x), y = cy(me, me.metaAt.y)
    const t = me.meta
    if (t < 3) {
      g.save()
      g.shadowColor = 'rgba(255,210,60,.95)'; g.shadowBlur = 24 * Math.min(1, t)
      drawImg(g, me.img.chrysalide, x, y, me.cw * 2.2 * Math.min(1, 0.3 + t), Math.sin(t * 3) * 0.08, Math.min(1, t * 1.5) * (t > 2.6 ? (3 - t) / 0.4 : 1))
      g.restore()
    }
    if (t > 2.6) {
      const f = t - 2.6
      const bx = x + f * me.W * 0.16 + Math.sin(f * 4) * 30, by = y - f * me.H * 0.22
      const flap = Math.sin(f * 14) > 0
      g.save()
      g.shadowColor = 'rgba(255,210,60,.9)'; g.shadowBlur = 18
      drawImg(g, flap ? me.img.papillon : me.img.ferme, bx, by, me.cw * 2.6 * Math.min(1, 0.4 + f), 0.25)
      g.restore()
    }
  }
}

/* ---------- Le jeu ---------- */

export const caterpillar: GameDef = {
  id: 'caterpillar', name: 'La Chenille', icon: '🐛', sq: 'sq-mint', cat: 'action', music: 'meadow',
  subtitle: 'Une semaine de repas… puis le papillon !',
  mount(c) {
    ctx = c
    let dead = false
    const cleanups: (() => void)[] = []
    c.root.innerHTML = `
      <div class="arena ch-arena" id="cpArena">
        <canvas id="chCanvas"></canvas>
        <img class="ch-sky rise" id="chSky" src="${SRC.soleil}" alt="">
        <div class="ch-week">${WEEK.map((foods, k) => `
          <div class="ch-day">
            ${k === 5 ? `<span class="feast"><img src="${SRC.pomme}" alt=""><img src="${SRC.fraise}" alt=""><img src="${SRC.kiwi}" alt=""></span>` : `<img src="${SRC[foods[0]]}" alt="">`}
            <b>${foods.length}</b><span class="ok">${ICON.check}</span><span class="pips"></span>
          </div>`).join('')}</div>
      </div>`
    const arena = $('cpArena')
    const cv = $('chCanvas') as unknown as HTMLCanvasElement
    const hideLoader = loader(arena, 'caterpillar')
    cleanups.push(hideLoader)
    preloadSfx(['tick', 'chop', 'pluck', 'error', 'confirm', 'whoosh'])
    preloadCries(['coq'])

    const names = Object.keys(SRC)
    Promise.all(names.map(n => { const im = new Image(); im.src = SRC[n]; return im.decode().then(() => im) })).then(imgs => {
      if (dead) return
      hideLoader()
      const img: Record<string, HTMLImageElement> = {}
      names.forEach((n, i) => { img[n] = imgs[i] })
      const onLeaf = leafMask(img.leaf)

      const game = arcade(c, {
        host: arena,
        lives: c.byTier(5, 3, 3),
        scoreIcon: ICON.apple,
        plainScore: true,
        // Le papillon, c'est déjà une victoire : les étoiles comptent les cœurs gardés
        stars: s => {
          if (me.day < WEEK.length) return me.day >= 4 ? 2 : 1
          return s.lives >= s.maxLives ? 3 : s.lives >= s.maxLives - 2 ? 2 : 1
        }
      })
      // Le départ : au milieu de la feuille, trois anneaux vers la gauche
      const start: Cell = { x: 6, y: 5 }
      const snake = [start, { x: 5, y: 5 }, { x: 4, y: 5 }].filter(s => onLeaf[s.y][s.x])
      const me: State = {
        arena, cv, g: cv.getContext('2d')!, img, onLeaf,
        W: 0, H: 0, LX: 0, LY: 0, LW: 0, LH: 0, cw: 0, ch: 0, dpr: Math.min(2, window.devicePixelRatio || 1),
        leafCv: document.createElement('canvas'), holes: [],
        snake, prev: snake.map(s => ({ x: s.x - 1, y: s.y })),
        dir: { x: 1, y: 0 }, nextDir: { x: 1, y: 0 },
        items: [], day: 0, bites: 0, eaten: 0, grow: 0, speed: 340, acc: 0,
        moving: false, over: false, game, crumbs: [], lastOuf: -9, simT: 0, shakeT: 0,
        meta: 0, metaAt: null, raf: 0, last: performance.now(), hint: null
      }
      cp = me
      layout(me)
      const ro = new ResizeObserver(() => { if (cp === me) layout(me) })
      ro.observe(arena)
      cleanups.push(() => ro.disconnect())

      const hint = document.createElement('div')
      hint.className = 'tap-hint'
      hint.innerHTML = ICON.tap
      arena.appendChild(hint)
      me.hint = hint

      // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __cp: unknown }).__cp = {
          get running() { return !me.over }, get moving() { return me.moving }, get snake() { return me.snake },
          get items() { return me.items.map(i => ({ x: i.x, y: i.y, kind: i.kind })) },
          get dir() { return me.dir }, get next() { return me.nextDir }, get eaten() { return me.eaten }, get day() { return me.day },
          get lives() { return game.s.lives }, get holes() { return me.holes.length },
          cols: COLS, rows: ROWS, onLeaf: (x: number, y: number) => playable(me, { x, y })
        }
      }

      /* Glisser dans une direction (n'importe où sur l'arène), ou les flèches */
      let from: { x: number; y: number; id: number } | null = null
      const onDown = (e: PointerEvent) => { from = { x: e.clientX, y: e.clientY, id: e.pointerId } }
      const onMove = (e: PointerEvent) => {
        if (!from || from.id !== e.pointerId) return
        const dx = e.clientX - from.x, dy = e.clientY - from.y
        if (Math.hypot(dx, dy) < 22) return
        if (Math.abs(dx) > Math.abs(dy)) setDir(Math.sign(dx), 0)
        else setDir(0, Math.sign(dy))
        from = { x: e.clientX, y: e.clientY, id: e.pointerId }
      }
      const onUp = (e: PointerEvent) => { if (from?.id === e.pointerId) from = null }
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'ArrowUp') setDir(0, -1)
        else if (e.key === 'ArrowDown') setDir(0, 1)
        else if (e.key === 'ArrowLeft') setDir(-1, 0)
        else if (e.key === 'ArrowRight') setDir(1, 0)
      }
      arena.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      window.addEventListener('keydown', onKey)
      cleanups.push(() => {
        arena.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        window.removeEventListener('keydown', onKey)
      })

      const loop = (now: number) => {
        if (cp !== me) return
        me.raf = requestAnimationFrame(loop)
        const dt = Math.min(0.05, (now - me.last) / 1000)
        me.last = now
        if (isPaused()) return
        layout(me)
        me.simT += dt
        game.tick(dt)
        update(me, dt)
        draw(me, now)
      }
      me.raf = requestAnimationFrame(loop)
      game.after(600, () => dawn(me))
    }).catch(err => { if (!dead) throw err })

    return () => {
      if (dead) return
      dead = true
      cleanups.forEach(fn => fn())
      if (cp) { cancelAnimationFrame(cp.raf); cp.game.dispose(); cp = null }
    }
  }
}
