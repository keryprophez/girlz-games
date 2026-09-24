import type { GameContext, GameDef } from '../core/types'
import { $, pick, rnd } from '../core/utils'
import { impact } from '../core/impact'
import { loader } from '../core/three3d'
import { arcade, type Arcade } from '../core/arcade'
import { ICON } from '../core/icons'
import { sfx, preloadSfx } from '../core/sfx'
import { isPaused } from '../core/session'

/* 🥷 Ninja du Verger, en 2D sur le ciel du verger (24/09). La version 3D
   (modèles du kit Food) était « pas trop jouable, les fruits trop grossiers,
   c'est confus » : les fruits sont maintenant les illustrations Canva du
   Potager (même style, `public/assets/fruits/`), gros, lisibles, et le jeu a
   une FORME : cinq vagues de plus en plus denses, puis la pluie de fruits.

   Les règles, validées avec le père :
   - seul le CACTUS coûte un cœur (il cogne, la tablette tremble) ;
   - un fruit qui retombe sans être tranché casse seulement la série ;
   - plusieurs fruits d'un seul trait : bonus, « ×2 » doré sur place, et à
     partir de trois un ralenti pour savourer ;
   - frôler un cactus sans le toucher fait « ouf » (le presque) ;
   - à deux : une lame par doigt (dorée à gauche, rose à droite), un seul score.

   Rendu : un canvas 2D (pas de WebGL) ; les ombres et la lueur du cactus
   sont précalculées une fois par image, rien de flou n'est recalculé par
   frame. La simulation tourne sur l'horloge d'`arcade` (pause comprise). */

type Kind = 'pomme' | 'orange' | 'pasteque' | 'fraise' | 'kiwi'
const FRUITS: { k: Kind; juice: string }[] = [
  { k: 'pomme', juice: '#E8404A' }, { k: 'orange', juice: '#FF9A1F' },
  { k: 'pasteque', juice: '#E8404A' }, { k: 'fraise', juice: '#E0303C' }, { k: 'kiwi', juice: '#8CC63F' }
]
const url = (n: string) => `${import.meta.env.BASE_URL}assets/fruits/${n}.webp`

/* Réglages par niveau. T = durée de montée jusqu'au plus haut du ciel (s) :
   plus elle est longue, plus les fruits flottent. TOL = marge de la lame (px)
   autour d'un fruit — jamais autour du cactus. */
const T_UP = { easy: 1.5, med: 1.3, exp: 1.12 }
const TOL = { easy: 30, med: 20, exp: 12 }
const WAVES = 5
/** Volées par vague. */
const VOLLEYS = { easy: [4, 5, 5, 6, 6], med: [4, 5, 6, 6, 7], exp: [5, 6, 6, 7, 8] }
/** Fruits par volée [min, max], vague par vague. */
const COUNT = {
  easy: [[1, 1], [1, 2], [1, 2], [2, 2], [2, 3]],
  med: [[1, 2], [2, 2], [2, 3], [2, 3], [3, 4]],
  exp: [[2, 3], [2, 3], [3, 4], [3, 4], [3, 5]]
}
/** Chance qu'une volée porte un cactus, vague par vague. */
const BAD = { easy: [0, 0.2, 0.25, 0.3, 0.35], med: [0.2, 0.3, 0.35, 0.4, 0.45], exp: [0.3, 0.4, 0.45, 0.5, 0.55] }
/** Écart entre deux volées (ms), de la première à la dernière vague. */
const GAP = { easy: [1800, 1350], med: [1500, 1100], exp: [1300, 900] }
/** La pluie finale : durée, et un fruit tous les… (ms). */
const RAIN_MS = 7000
const RAIN_EVERY = { easy: 330, med: 270, exp: 220 }
/** Barème : part des fruits tranchés pendant les vagues, pour 2 et 3 étoiles. */
const STARS = { easy: [0.45, 0.7], med: [0.55, 0.78], exp: [0.6, 0.85] }

const fr = (a: number, b: number) => a + Math.random() * (b - a)

interface Body { x: number; y: number; vx: number; vy: number; a: number; va: number }
interface Fruit extends Body {
  kind: Kind | null
  bad: boolean
  /** Tombé du ciel pendant la pluie : le rater ne casse rien. */
  rain: boolean
  /** Cactus déjà frôlé (le « ouf » une fois) ou déjà cogné. */
  grazed: boolean
  knocked: boolean
}
interface Half extends Body { img: HTMLCanvasElement; shadow: HTMLCanvasElement; w: number; h: number }
interface Drop { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; col: string }
/** Une image prête à dessiner : le sprite et son ombre floue, précalculés. */
interface Sprite { img: HTMLCanvasElement; shadow: HTMLCanvasElement; glow?: HTMLCanvasElement; w: number; h: number }

interface State {
  arena: HTMLElement
  cv: HTMLCanvasElement
  g: CanvasRenderingContext2D
  W: number; H: number; dpr: number
  /** Côté d'un fruit entier à l'écran (px). */
  S: number
  grav: number
  sprites: Record<string, Sprite>
  fruits: Fruit[]; halves: Half[]; drops: Drop[]
  trail: { x: number; y: number; t: number; id: number; tint: number }[]
  blades: Map<number, { x: number; y: number; stroke: number; tint: number }>
  game: Arcade
  /** Vague en cours (0..4), 5 = la pluie. */
  wave: number
  volleys: number
  /** Fruits d'une volée programmés mais pas encore lancés. */
  pending: number
  /** Toutes les volées de la vague sont parties : on attend le ciel vide. */
  waiting: boolean
  raining: boolean
  rainDone: boolean
  /** Fruits lancés / tranchés pendant les vagues (le barème), et pendant la pluie. */
  launched: number; sliced: number; rainSliced: number
  /** Fruits tranchés d'affilée (le combo d'arcade compte aussi les bonus). */
  streak: number; bestStreak: number
  /** Rampe de performance : l'écart entre les volées se resserre. */
  pace: number
  simT: number
  slowUntil: number
  shakeT: number
  over: boolean
  dead: boolean
  raf: number
  last: number
  hint: HTMLElement | null
  lastWhoosh: number
}

let nj: State | null = null
let ctx: GameContext

/* ---------- Les images ---------- */

async function loadImg(n: string): Promise<HTMLImageElement> {
  const im = new Image()
  im.src = url(n)
  await im.decode()
  return im
}

/** Le sprite à sa taille d'écran (× dpr), son ombre floue et, pour le cactus,
    sa lueur rouge : trois canvas faits une fois, puis de simples drawImage. */
function bake(im: HTMLImageElement, scale: number, dpr: number, glow: boolean): Sprite {
  const w = im.naturalWidth * scale, h = im.naturalHeight * scale
  const pw = Math.ceil(w * dpr), ph = Math.ceil(h * dpr)
  const img = document.createElement('canvas')
  img.width = pw; img.height = ph
  img.getContext('2d')!.drawImage(im, 0, 0, pw, ph)
  const pad = Math.ceil(18 * dpr)
  const silhouette = (col: string, blur: number) => {
    const c = document.createElement('canvas')
    c.width = pw + pad * 2; c.height = ph + pad * 2
    const g = c.getContext('2d')!
    g.filter = `blur(${blur * dpr}px)`
    g.drawImage(img, pad, pad)
    g.filter = 'none'
    g.globalCompositeOperation = 'source-in'
    g.fillStyle = col
    g.fillRect(0, 0, c.width, c.height)
    return c
  }
  return {
    img, w, h,
    shadow: silhouette('rgba(40,70,110,.26)', 7),
    glow: glow ? silhouette('rgba(255,50,50,1)', 12) : undefined
  }
}

/* ---------- Les lancers ---------- */

function spawnFruit(me: State, bad: boolean, x: number, y: number, vx: number, vy: number, rain = false) {
  me.fruits.push({
    kind: bad ? null : pick(FRUITS).k, bad, rain, grazed: false, knocked: false,
    x, y, vx, vy, a: fr(-0.5, 0.5), va: fr(1, 2.6) * (Math.random() < 0.5 ? -1 : 1)
  })
  if (!bad && !rain) me.launched++
}

/** Un lancer en cloche depuis le bas : le sommet en (tx, apex). */
function lob(me: State, bad: boolean, x: number, tx: number, apex: number) {
  const y0 = me.H + me.S * 0.6
  const tUp = Math.sqrt(2 * (y0 - apex) / me.grav)
  spawnFruit(me, bad, x, y0, (tx - x) / tUp, -me.grav * tUp)
}

/** Une volée : dispersée, en grappe (pour trancher plusieurs fruits d'un
    trait) ou, plus tard, en travers depuis un bord. */
function volley(me: State) {
  const { W, H, wave } = me
  const tier = ctx.tier
  const [lo, hi] = COUNT[tier][wave]
  const n = rnd(lo, hi) + (ctx.duo ? 1 : 0)
  const cactus = Math.random() < BAD[tier][wave]
  const r = Math.random()
  const shape = wave >= 1 && n >= 2 && r < 0.3 ? 'grappe'
    : tier !== 'easy' && wave >= (tier === 'exp' ? 2 : 3) && r < 0.5 ? 'travers' : 'large'

  if (shape === 'grappe') {
    // Les fruits partent ensemble et montent côte à côte : un seul trait les prend tous
    const x = fr(0.25, 0.75) * W, tx = x + (W / 2 - x) * fr(0.2, 0.5), apex = fr(0.22, 0.4) * H
    for (let i = 0; i < n; i++) {
      const dx = (i - (n - 1) / 2) * me.S * 0.75
      me.pending++
      me.game.after(i * 60, () => {
        me.pending--
        if (nj === me && !me.over) lob(me, false, x + dx, tx + dx * 1.3, apex + fr(-0.03, 0.03) * H)
      })
    }
    // Le cactus, s'il y en a un, part à l'écart de la grappe
    if (cactus) {
      me.pending++
      me.game.after(350, () => {
        me.pending--
        if (nj !== me || me.over) return
        const cx = x < W / 2 ? fr(0.65, 0.85) * W : fr(0.15, 0.35) * W
        lob(me, true, cx, cx + fr(-0.05, 0.05) * W, fr(0.25, 0.45) * H)
      })
    }
    return
  }
  const bad = cactus ? rnd(0, n - 1) : -1
  for (let i = 0; i < n; i++) {
    me.pending++
    me.game.after(i * fr(90, 220), () => {
      me.pending--
      if (nj !== me || me.over) return
      if (shape === 'travers') {
        const s = Math.random() < 0.5 ? -1 : 1
        const x0 = s < 0 ? -me.S * 0.6 : W + me.S * 0.6
        const y0 = fr(0.5, 0.75) * H, apex = fr(0.2, 0.38) * H
        const tUp = Math.sqrt(2 * (y0 - apex) / me.grav)
        spawnFruit(me, i === bad, x0, y0, -s * W * fr(0.28, 0.4), -me.grav * tUp)
      } else {
        const x = fr(0.12, 0.88) * W
        lob(me, i === bad, x, x + (W / 2 - x) * fr(0.15, 0.55), fr(0.18, 0.45) * H)
      }
    })
  }
}

function startWave(me: State) {
  if (nj !== me || me.over) return
  me.volleys = VOLLEYS[ctx.tier][me.wave]
  me.waiting = false
  paintWaves(me)
  sfx('pluck', { vol: 0.5, rate: 1 + me.wave * 0.08 })
  nextVolley(me)
}

function nextVolley(me: State) {
  if (nj !== me || me.over) return
  if (me.volleys <= 0) { me.waiting = true; return }
  me.volleys--
  volley(me)
  const [g0, g1] = GAP[ctx.tier]
  const gap = (g0 + (g1 - g0) * me.wave / (WAVES - 1)) * me.pace * (ctx.duo ? 0.85 : 1)
  me.game.after(gap * fr(0.85, 1.15), () => nextVolley(me))
}

/** La pluie : les fruits tombent du ciel, lentement, plus de cactus. */
function startRain(me: State) {
  if (nj !== me || me.over) return
  me.raining = true
  paintWaves(me)
  me.game.flash(`<span class="nj-rainflash">${['pomme', 'fraise', 'kiwi'].map(n => `<img src="${url(n)}" alt="">`).join('')}</span>`, 'gold')
  sfx('confirm', { vol: 0.8 })
  const every = RAIN_EVERY[ctx.tier] * (ctx.duo ? 0.75 : 1)
  const end = me.game.s.time + RAIN_MS / 1000
  const drop = () => {
    if (nj !== me || me.over) return
    if (me.game.s.time >= end) { me.rainDone = true; return }
    spawnFruit(me, false, fr(0.1, 0.9) * me.W, -me.S * 0.6, fr(-0.04, 0.04) * me.W, fr(0.05, 0.16) * me.H, true)
    me.game.after(every * fr(0.7, 1.3), drop)
  }
  drop()
}

/* ---------- La lame ---------- */

/** Distance d'un point à un segment. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

const hitR = (me: State, f: Fruit) => f.bad ? me.S * 0.36 : me.S * 0.42 + TOL[ctx.tier]

function burst(me: State, x: number, y: number, cols: string[], n: number, nx: number, ny: number) {
  for (let i = 0; i < n; i++) {
    // Surtout de part et d'autre de la coupe, un peu partout quand même
    const side = Math.random() < 0.5 ? -1 : 1
    const sp = fr(120, 420)
    const jx = fr(-0.6, 0.6), jy = fr(-0.6, 0.6)
    const life = fr(0.45, 0.85)
    me.drops.push({
      x, y, vx: (nx * side + jx) * sp, vy: (ny * side + jy) * sp - fr(60, 200),
      r: fr(3.5, 9), life, max: life, col: pick(cols)
    })
  }
}

function slice(me: State, f: Fruit, dx: number, dy: number, blade: { stroke: number }) {
  if (me.over) return
  if (me.hint) { me.hint.remove(); me.hint = null }
  const i = me.fruits.indexOf(f)
  if (i < 0) return

  if (f.bad) {
    // Le cactus ne se coupe pas : il COGNE, repart en tournant, et coûte un cœur
    f.knocked = true
    f.vx = dx * 380; f.vy = Math.min(f.vy, -120) + dy * 200; f.va = (dx >= 0 ? 1 : -1) * 9
    impact(0.85, { matter: 'sourd' })
    me.shakeT = 0.35
    me.streak = 0
    burst(me, f.x, f.y, ['#5E9E3A', '#7DBE4E', '#F59AC0'], 14, -dy, dx)
    me.game.flash(ICON.heartEmpty, 'bad')
    if (me.game.hurt()) finish(me, true)
    return
  }

  me.fruits.splice(i, 1)
  blade.stroke++
  me.streak++
  me.bestStreak = Math.max(me.bestStreak, me.streak)
  if (f.rain) me.rainSliced++
  else me.sliced++
  sfx('slice', { vol: 0.8, rate: fr(0.95, 1.1) })
  me.game.hit(1, { silent: true })

  // Les deux moitiés, coupées DANS LE SENS DU GESTE, s'écartent de part et
  // d'autre du trait. Sur la planche, la coupe d'une moitié gauche est à sa
  // droite : on tourne l'image pour que ce bord regarde le trait.
  const nx = -dy, ny = dx
  const rot = Math.atan2(ny, nx)
  const def = FRUITS.find(d => d.k === f.kind)!
  for (const [side, key] of [[-1, 'g'], [1, 'd']] as const) {
    const sp = me.sprites[`${f.kind}-${key}`]
    const off = sp.w * 0.4
    me.halves.push({
      img: sp.img, shadow: sp.shadow, w: sp.w, h: sp.h,
      x: f.x + nx * off * side, y: f.y + ny * off * side,
      vx: f.vx * 0.5 + nx * side * 170, vy: Math.min(f.vy * 0.4, 0) + ny * side * 170 - 80,
      a: rot, va: side * fr(2.5, 5)
    })
  }
  burst(me, f.x, f.y, [def.juice, def.juice, '#FFFFFF'], 18, nx, ny)

  // Plusieurs fruits d'un seul trait : LE geste du genre
  if (blade.stroke >= 2) {
    me.game.hit(blade.stroke - 1, { silent: true, perfect: blade.stroke >= 3 })
    pop(me, f.x, f.y - me.S * 0.55, '×' + blade.stroke)
    sfx('confirm', { vol: 0.8, rate: 1 + blade.stroke * 0.05 })
    if (blade.stroke >= 3) me.slowUntil = me.simT + 0.12
  }
}

/** Le « ×2 » doré, sur place, qui monte et s'efface. */
function pop(me: State, x: number, y: number, txt: string) {
  const el = document.createElement('div')
  el.className = 'nj-x'
  el.textContent = txt
  el.style.left = Math.max(60, Math.min(me.W - 60, x)) + 'px'
  el.style.top = Math.max(110, y) + 'px'
  el.addEventListener('animationend', () => el.remove())
  me.arena.appendChild(el)
}

/* ---------- Les vagues, en pastilles sous le score ---------- */

function paintWaves(me: State) {
  const el = me.arena.querySelector('.nj-waves')
  if (!el) return
  const cur = me.raining ? WAVES : me.wave
  el.querySelectorAll('i').forEach((d, k) => {
    d.classList.toggle('done', k < cur)
    d.classList.toggle('now', k === cur)
  })
}

function finish(me: State, dead: boolean) {
  if (me.over) return
  me.over = true
  me.dead = dead
  const total = me.sliced + me.rainSliced
  const stars = starsOf(me)
  me.game.end({
    title: dead ? 'Aïe, le cactus !' : stars === 3 ? 'Sabre d\'or !' : 'Beau tranchage !',
    msg: `${ctx.duo ? 'Vous avez' : 'Tu as'} tranché ${total} fruit${total > 1 ? 's' : ''}` +
      (total >= 6 && me.bestStreak >= total ? ', sans en rater un !'
        : me.bestStreak >= 6 ? `, dont ${me.bestStreak} d'affilée` : ''),
    outroMs: dead ? 1100 : 900
  })
}

function starsOf(me: State): 1 | 2 | 3 {
  if (me.dead) return 1
  const ratio = me.launched ? me.sliced / me.launched : 0
  const [two, three] = STARS[ctx.tier]
  return ratio >= three ? 3 : ratio >= two ? 2 : 1
}

/* ---------- La boucle ---------- */

function update(me: State, dt: number) {
  const { W, H, S } = me
  for (let i = me.fruits.length - 1; i >= 0; i--) {
    const f = me.fruits[i]
    f.vy += me.grav * (f.rain ? 0.28 : 1) * dt
    f.x += f.vx * dt; f.y += f.vy * dt; f.a += f.va * dt
    const gone = (f.vy > 0 && f.y > H + S * 0.7) || f.x < -S * 1.3 || f.x > W + S * 1.3
    if (!gone) continue
    me.fruits.splice(i, 1)
    // Raté pendant les vagues : la série casse, et c'est tout
    if (!f.bad && !f.rain && !me.over) { me.game.miss(); me.streak = 0 }
  }
  for (let i = me.halves.length - 1; i >= 0; i--) {
    const h = me.halves[i]
    h.vy += me.grav * dt
    h.x += h.vx * dt; h.y += h.vy * dt; h.a += h.va * dt
    if (h.y > H + S) me.halves.splice(i, 1)
  }
  for (let i = me.drops.length - 1; i >= 0; i--) {
    const d = me.drops[i]
    d.vy += me.grav * 0.9 * dt
    d.x += d.vx * dt; d.y += d.vy * dt
    d.life -= dt
    if (d.life <= 0) me.drops.splice(i, 1)
  }
  if (me.shakeT > 0) me.shakeT = Math.max(0, me.shakeT - dt)

  if (me.over) return
  // Le ciel est vide : vague suivante, ou la pluie, ou la fin
  if (me.waiting && me.pending === 0 && me.fruits.length === 0) {
    me.waiting = false
    me.wave++
    paintWaves(me)
    me.game.after(1300, () => (me.wave < WAVES ? startWave(me) : startRain(me)))
  }
  if (me.rainDone && me.fruits.length === 0) finish(me, false)
}

function drawSprite(g: CanvasRenderingContext2D, sp: { img: HTMLCanvasElement; shadow: HTMLCanvasElement; w: number; h: number },
  x: number, y: number, a: number, dpr: number) {
  const pad = (sp.shadow.width - sp.img.width) / 2 / dpr
  g.save()
  g.translate(x, y + 11)
  g.rotate(a)
  g.drawImage(sp.shadow, -sp.w / 2 - pad, -sp.h / 2 - pad, sp.w + pad * 2, sp.h + pad * 2)
  g.restore()
  g.save()
  g.translate(x, y)
  g.rotate(a)
  g.drawImage(sp.img, -sp.w / 2, -sp.h / 2, sp.w, sp.h)
  g.restore()
}

function draw(me: State, now: number) {
  const { g, dpr, W, H } = me
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, W, H)
  if (me.shakeT > 0) {
    const k = me.shakeT / 0.35 * 9
    g.translate(fr(-k, k), fr(-k, k))
  }

  for (const h of me.halves) drawSprite(g, h, h.x, h.y, h.a, dpr)
  for (const f of me.fruits) {
    const sp = me.sprites[f.kind ?? 'cactus']
    if (f.bad && sp.glow) {
      // La lueur rouge du cactus respire : on la voit sans avoir à lire
      const pad = (sp.glow.width - sp.img.width) / 2 / dpr
      g.save()
      g.globalAlpha = f.knocked ? 1 : 0.6 + 0.35 * Math.sin(now / 180)
      g.translate(f.x, f.y); g.rotate(f.a); g.scale(1.1, 1.1)
      g.drawImage(sp.glow, -sp.w / 2 - pad, -sp.h / 2 - pad, sp.w + pad * 2, sp.h + pad * 2)
      g.restore()
    }
    drawSprite(g, sp, f.x, f.y, f.a, dpr)
  }
  for (const d of me.drops) {
    g.globalAlpha = Math.min(1, d.life / d.max * 1.6)
    g.fillStyle = d.col
    g.beginPath(); g.arc(d.x, d.y, d.r * (0.5 + 0.5 * d.life / d.max), 0, Math.PI * 2); g.fill()
  }
  g.globalAlpha = 1

  drawBlades(me, now)
}

/** La lame : un trait effilé, fin à la queue, épais sous le doigt, qui
    s'efface en 150 ms. Un tracé par doigt. */
function drawBlades(me: State, now: number) {
  const { g } = me
  me.trail = me.trail.filter(p => now - p.t < 150)
  const ids = new Set(me.trail.map(p => p.id))
  for (const id of ids) {
    const pts = me.trail.filter(p => p.id === id)
    if (pts.length < 2) continue
    const L: [number, number][] = [], R: [number, number][] = []
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
      let dx = b.x - a.x, dy = b.y - a.y
      const l = Math.hypot(dx, dy) || 1
      dx /= l; dy /= l
      const age = 1 - (now - p.t) / 150
      const w = (1 + 12 * (i / (pts.length - 1))) * age
      L.push([p.x - dy * w, p.y + dx * w]); R.push([p.x + dy * w, p.y - dx * w])
    }
    g.beginPath()
    g.moveTo(L[0][0], L[0][1])
    for (const [x, y] of L.slice(1)) g.lineTo(x, y)
    for (const [x, y] of R.reverse()) g.lineTo(x, y)
    g.closePath()
    const halo = pts[0].tint ? 'rgba(255,110,170,.95)' : 'rgba(255,170,40,.95)'
    g.shadowColor = halo; g.shadowBlur = 16
    g.fillStyle = '#FFFFFF'
    g.fill()
    g.shadowBlur = 0
  }
}

/* ---------- Le jeu ---------- */

export const ninja: GameDef = {
  id: 'ninja', name: 'Ninja Verger', icon: '🥷', sq: 'sq-mint', cat: 'action', music: 'fair', duo: true,
  subtitle: 'Tranche les fruits d\'un trait de doigt… pas le cactus !',
  mount(c) {
    ctx = c
    let dead = false
    const cleanups: (() => void)[] = []
    c.root.innerHTML = `
      <div class="arena nj-arena" id="njArena">
        <i class="nj-cloud"></i><i class="nj-cloud b"></i><i class="nj-cloud c"></i>
        <canvas id="njCanvas"></canvas>
        <div class="nj-waves">${'<i></i>'.repeat(WAVES)}<i class="rain"></i></div>
      </div>`
    const arena = $('njArena')
    const cv = $('njCanvas') as unknown as HTMLCanvasElement
    const hideLoader = loader(arena, 'ninja')
    cleanups.push(hideLoader)
    preloadSfx(['slice', 'whoosh', 'confirm', 'error', 'pluck'])

    const names = [...FRUITS.flatMap(f => [f.k, f.k + '-g', f.k + '-d']), 'cactus']
    Promise.all(names.map(loadImg)).then(imgs => {
      if (dead) return
      hideLoader()
      const raw: Record<string, HTMLImageElement> = {}
      names.forEach((n, i) => { raw[n] = imgs[i] })

      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const g = cv.getContext('2d')!
      const game = arcade(c, {
        host: arena,
        lives: c.byTier(5, 3, 3) + (c.duo ? 1 : 0),
        scoreIcon: ICON.blade,
        // La rampe suit la performance : tous les dix fruits, les volées se rapprochent
        ramp: { every: c.byTier(10, 8, 8), max: 4 },
        onLevel: () => { me.pace = Math.max(0.78, me.pace * 0.94) },
        stars: () => starsOf(me)
      })
      const me: State = {
        arena, cv, g, W: 0, H: 0, dpr, S: 0, grav: 0, sprites: {},
        fruits: [], halves: [], drops: [], trail: [], blades: new Map(), game,
        wave: 0, volleys: 0, pending: 0, waiting: false, raining: false, rainDone: false,
        launched: 0, sliced: 0, rainSliced: 0, streak: 0, bestStreak: 0, pace: 1, simT: 0, slowUntil: 0, shakeT: 0,
        over: false, dead: false, raf: 0, last: performance.now(), hint: null, lastWhoosh: 0
      }
      nj = me

      // La taille des fruits suit l'arène : grands, lisibles, sans manger l'écran
      const size = () => {
        const W = arena.clientWidth, H = arena.clientHeight
        if (!W || !H || (W === me.W && H === me.H)) return
        me.W = W; me.H = H
        cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr)
        me.S = Math.max(96, Math.min(170, Math.min(W, H) * 0.19))
        me.grav = 2 * (0.85 * H) / (T_UP[c.tier] ** 2)
        const k = me.S / 256
        for (const n of names) me.sprites[n] = bake(raw[n], k, dpr, n === 'cactus')
      }
      size()
      const ro = new ResizeObserver(size)
      ro.observe(arena)
      cleanups.push(() => ro.disconnect())

      if (c.duo) game.flash(ICON.duo)
      // Le geste, montré sans un mot : une main qui balaie, jusqu'au premier fruit tranché
      const hint = document.createElement('div')
      hint.className = 'nj-hint'
      hint.innerHTML = `<i></i>${ICON.tap}`
      arena.appendChild(hint)
      me.hint = hint

      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __nj: unknown }).__nj = {
          duo: c.duo,
          blades: () => me.blades.size,
          wave: () => me.raining ? WAVES : me.wave,
          over: () => me.over,
          lives: () => game.s.lives,
          counts: () => ({ launched: me.launched, sliced: me.sliced, rain: me.rainSliced }),
          fruits: () => {
            const r = cv.getBoundingClientRect()
            return me.fruits.filter(f => !f.knocked).map(f => ({
              x: r.left + f.x, y: r.top + f.y, vx: f.vx, vy: f.vy, bad: f.bad, r: hitR(me, f)
            }))
          }
        }
      }

      /* Une lame PAR DOIGT (piège « Deux doigts, une seule lame »). À deux,
         chaque sœur a sa couleur : dorée à gauche, rose à droite. */
      let rect = cv.getBoundingClientRect()
      const onDown = (e: PointerEvent) => {
        rect = cv.getBoundingClientRect()
        const x = e.clientX - rect.left, y = e.clientY - rect.top
        const tint = c.duo && x > me.W / 2 ? 1 : 0
        me.blades.set(e.pointerId, { x, y, stroke: 0, tint })
        me.trail.push({ x, y, t: performance.now(), id: e.pointerId, tint })
      }
      const onMove = (e: PointerEvent) => {
        const last = me.blades.get(e.pointerId)
        if (!last || nj !== me || me.over) return
        const x = e.clientX - rect.left, y = e.clientY - rect.top
        const dx = x - last.x, dy = y - last.y
        const len = Math.hypot(dx, dy)
        if (len < 4) return
        const now = performance.now()
        me.trail.push({ x, y, t: now, id: e.pointerId, tint: last.tint })
        // Un « whoosh » quand la lame file vite, jamais plus de 6 par seconde
        if (len > 26 && now - me.lastWhoosh > 160) { me.lastWhoosh = now; sfx('whoosh', { vol: 0.35, rate: 1.15 }) }
        for (const f of [...me.fruits]) {
          if (f.knocked) continue
          const d = segDist(f.x, f.y, last.x, last.y, x, y)
          const r = hitR(me, f)
          if (d < r) {
            slice(me, f, dx / len, dy / len, last)
            if (nj !== me || me.over) return
          } else if (f.bad && !f.grazed && d < r + 40) {
            // Le presque : frôler le cactus sans le toucher
            f.grazed = true
            sfx('whoosh', { vol: 0.55, rate: 0.8 })
            me.game.flash(ICON.bolt)
          }
        }
        last.x = x; last.y = y
      }
      const onUp = (e: PointerEvent) => { me.blades.delete(e.pointerId) }
      cv.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      cleanups.push(() => {
        cv.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
      })

      const loop = (now: number) => {
        if (nj !== me) return
        me.raf = requestAnimationFrame(loop)
        let dt = Math.min(0.05, (now - me.last) / 1000)
        me.last = now
        if (isPaused()) return
        size()
        dt *= me.over ? 0.55 : me.simT < me.slowUntil ? 0.35 : 1
        me.simT += dt
        game.tick(dt)
        update(me, dt)
        draw(me, now)
      }
      me.raf = requestAnimationFrame(loop)
      game.after(900, () => startWave(me))
    }).catch(err => { if (!dead) throw err })

    return () => {
      if (dead) return
      dead = true
      cleanups.forEach(fn => fn())
      if (nj) {
        cancelAnimationFrame(nj.raf)
        nj.game.dispose()
        nj = null
      }
    }
  }
}
