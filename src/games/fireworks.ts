import type { GameContext, GameDef } from '../core/types'
import { isPaused, onPause } from '../core/session'
import { $, pick } from '../core/utils'
import { getCtx, sBoomReal, sPopReal, tone } from '../core/audio'
import { playNote, stopMusic } from '../core/music'
import { ICON } from '../core/icons'

/* Feu d'Artifice — tape dans le ciel : une fusée siffle, monte et explose en
   gerbe de couleurs (boule, anneau, cœur, étoile…). Zéro échec, pure magie.

   Un vrai décor depuis le 23/09 : trois calques. Derrière, le ciel de nuit,
   les étoiles, la lune et des collines ; au milieu, les fusées ; devant, la
   ferme (grange, silo, moulin) et le village en silhouette au bord d'un lac,
   fenêtres allumées. Chaque étincelle se REFLÈTE dans le lac.

   Le feu d'artifice qu'on DESSINE (30/09) : le doigt trace une forme dans le
   ciel (un cœur, une étoile, son initiale…) ; le trait brille et scintille
   comme un cierge magique. Au lever du doigt, une fusée part du bas, monte
   au centre du dessin et éclate : ses étincelles filent vers chaque point du
   tracé et y dessinent la forme en lumière, qui brille un instant puis
   retombe en pluie. Un toucher bref reste la fusée d'avant. Un trait qui
   commence tout près d'un dessin qui attend encore sa fusée le complète
   (les deux traits d'un A, les yeux d'un bonhomme) ; deux doigts loin l'un
   de l'autre font deux dessins. Des pastilles choisissent la couleur.

   Le BOUQUET FINAL est un spectacle sur une petite musique écrite (et non
   plus dix fusées au hasard) : les salves tombent sur ses temps, les formes
   dessinées pendant la partie reviennent éclater en grand, une montée en
   croches, puis la grande gerbe d'or.

   Performances (tablette) : les étincelles vivent dans des tableaux typés
   (2 600 au plus), rien n'est alloué image par image, et chacune est un
   petit halo précalculé dans UNE planche (un seul `drawImage` depuis la même
   image, que le navigateur regroupe). Tout avance au temps (et non à
   l'image) : la tablette affiche 90 images/s. */

/* ---------- Les couleurs ---------- */

const PALETTES = [
  ['#FF9E7A', '#FFD34D', '#FFF3B0'], ['#8FD0F2', '#B9A7F2', '#FFFFFF'],
  ['#7BDD97', '#FFE08A', '#C7F9CC'], ['#FF8FA3', '#FFC2D1', '#FFF0F3'],
  ['#FFD34D', '#FF7B6B', '#B9A7F2'], ['#9BF6FF', '#BDB2FF', '#FFC6FF']
]
const SHAPES = ['burst', 'ring', 'heart', 'star', 'double'] as const

/** Les encres du dessin, une pastille chacune ; la première est l'arc-en-ciel
    (la teinte change le long du trait). Des couleurs FRANCHES : des centaines
    d'étincelles s'additionnent sur le tracé, un pastel y vire au blanc. */
const INKS: { name: string; cols: string[] }[] = [
  { name: 'Arc-en-ciel', cols: [] },
  { name: 'Or', cols: ['#FFC83D', '#FFE9A6', '#FF9F1C'] },
  { name: 'Rose', cols: ['#FF4FA3', '#FF9FCB', '#E0287F'] },
  { name: 'Rouge', cols: ['#FF3B3B', '#FF9C8A', '#E0102E'] },
  { name: 'Vert', cols: ['#2EE06F', '#A8F5BF', '#12B85A'] },
  { name: 'Bleu', cols: ['#3DB5FF', '#A9DFFF', '#2F6BFF'] },
  { name: 'Violet', cols: ['#A66BFF', '#D8C2FF', '#7E3FE0'] }
]
/** Longueur de trait (px) pour un tour complet de l'arc-en-ciel */
const HUE_SPAN = 520
const NHUE = 24

function hsl(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const a = s * Math.min(l, 1 - l)
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(v * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase()
}
/** Mélange vers le blanc : le cœur clair d'un trait */
function lighten(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => Math.round(v + (255 - v) * k).toString(16).padStart(2, '0')
  return `#${ch(n >> 16)}${ch((n >> 8) & 255)}${ch(n & 255)}`.toUpperCase()
}

/* Toutes les couleurs d'étincelles sont connues d'avance : chacune a sa case
   dans la planche des halos (voir `atlas`). */
const COLS: string[] = []
const CI = new Map<string, number>()
function ci(hex: string): number {
  let i = CI.get(hex)
  if (i === undefined) { i = COLS.length; COLS.push(hex); CI.set(hex, i) }
  return i
}
const WHITE = ci('#FFFFFF')
const SPARK = ci('#FFF3B0')
const EMBER = ci('#FFC56B')
const PAL_I = PALETTES.map(p => p.map(ci))
const INK_I = INKS.map(k => k.cols.map(ci))
const HUE_HEX = Array.from({ length: NHUE }, (_, i) => hsl(i * 360 / NHUE, 1, 0.62))
const HUE_I = HUE_HEX.map(ci)
const HUE_LIGHT = HUE_HEX.map(h => lighten(h, 0.55))
const INK_LIGHT = INKS.map(k => k.cols.length ? k.cols[1] : '#FFFFFF')
const GOLD = ['#FFD34D', '#FFE7A8', '#FFB347'].map(ci)

/** La planche des halos : une case de 32 px par couleur, un cœur blanc qui
    vire à la couleur puis s'évanouit. Dessinée une fois pour toutes. */
const CELL = 32
const PER_ROW = 16
let ATLAS: HTMLCanvasElement | null = null
function atlas(): HTMLCanvasElement {
  if (ATLAS) return ATLAS
  const rows = Math.ceil(COLS.length / PER_ROW)
  const cv = document.createElement('canvas')
  cv.width = CELL * PER_ROW; cv.height = CELL * rows
  const g = cv.getContext('2d')!
  const rgba = (hex: string, a: number) => {
    const n = parseInt(hex.slice(1), 16)
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
  }
  COLS.forEach((col, i) => {
    const x = (i % PER_ROW) * CELL + CELL / 2, y = Math.floor(i / PER_ROW) * CELL + CELL / 2
    const r = g.createRadialGradient(x, y, 0, x, y, CELL / 2)
    r.addColorStop(0, 'rgba(255,255,255,1)')
    r.addColorStop(0.16, rgba(col, 1))
    r.addColorStop(0.34, rgba(col, 0.5))
    r.addColorStop(0.62, rgba(col, 0.12))
    r.addColorStop(1, rgba(col, 0))
    g.fillStyle = r
    g.fillRect(x - CELL / 2, y - CELL / 2, CELL, CELL)
  })
  ATLAS = cv
  return cv
}
/** Une grande lueur douce, sans cœur blanc : le ciel qui s'illumine */
let GLOW: HTMLCanvasElement | null = null
function glowSprite(): HTMLCanvasElement {
  if (GLOW) return GLOW
  const cv = document.createElement('canvas')
  cv.width = cv.height = 128
  const g = cv.getContext('2d')!
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  r.addColorStop(0, 'rgba(255,236,190,1)')
  r.addColorStop(0.35, 'rgba(255,214,150,.45)')
  r.addColorStop(0.7, 'rgba(200,160,255,.12)')
  r.addColorStop(1, 'rgba(200,160,255,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  GLOW = cv
  return cv
}

/* ---------- Les étincelles : un réservoir en tableaux typés ---------- */

const MAXP = 2600
/** Comportements : libre (gravité), en vol vers son point du tracé, posée qui brille */
const FREE = 0, FLY = 1, HOLD = 2

function pool() {
  const F = () => new Float32Array(MAXP)
  return {
    n: 0,
    x: F(), y: F(), vx: F(), vy: F(), life: F(), decay: F(), r: F(), g: F(), ph: F(),
    sx: F(), sy: F(), tx: F(), ty: F(), age: F(), fly: F(), hold: F(),
    col: new Uint16Array(MAXP), kind: new Uint8Array(MAXP), tw: new Uint8Array(MAXP)
  }
}
type Pool = ReturnType<typeof pool>

/* ---------- Les dessins ---------- */

/** Un trait au doigt : ses points (x, y à la suite) et la longueur cumulée de
    chacun (continue d'un trait à l'autre du même dessin : l'arc-en-ciel suit) */
interface Path { xy: number[]; cl: number[]; dot: boolean }
/** Un dessin en cours, qui attend sa fusée */
interface Draft {
  paths: Path[]
  /** Doigts encore posés dessus */
  live: number
  /** Secondes avant le départ de la fusée, une fois tous les doigts levés */
  wait: number
  ink: number
  len: number
  minX: number; minY: number; maxX: number; maxY: number
  /** Fusée partie : le tracé pâlit pendant qu'elle monte */
  launched: boolean
  fade: number
}
/** Un dessin prêt à éclater : ses points réguliers, relatifs à son centre */
interface Drawing {
  n: number
  px: Float32Array; py: Float32Array
  brk: Uint8Array
  col: Uint16Array
  w: number; h: number
  /** Dessiné par l'enfant (et non une forme du bouquet) */
  own: boolean
}
interface Stroke { draft: Draft; path: Path; lx: number; ly: number; ox: number; oy: number; acc: number; note: number }

interface Rocket {
  x0: number; y0: number; tx: number; ty: number
  t: number; dur: number
  shape: string; pal: number[]; big: boolean; quiet: boolean
  drawing: Drawing | null; scale: number; draft: Draft | null
}

interface Finale {
  t: number
  vis: { t: number; fn: () => void }[]
  vi: number
  aud: { t: number; fn: (d: number, at: number) => void }[]
  ai: number
}

interface State {
  c2d: CanvasRenderingContext2D
  dpr: number
  w: number
  h: number
  /** Le bord du lac : au-dessus le ciel, en dessous l'eau et ses reflets */
  shore: number
  /** Le reflet est tassé : hauteur du lac / hauteur du ciel */
  squash: number
  time: number
  last: number
  p: Pool
  rockets: Rocket[]
  drafts: Draft[]
  strokes: Map<number, Stroke>
  drawings: Drawing[]
  ink: number
  need: number
  count: number
  /** Dessins de l'enfant qui ont éclaté (et, dans le bouquet, qui sont revenus) */
  drawn: number
  encore: number
  last2: { cx: number; cy: number; w: number; h: number; n: number; ink: number } | null
  /** Le ciel illuminé : secondes restantes, durée, centre et rayon de la lueur */
  sky: { t: number; dur: number; x: number; y: number; R: number; a: number }
  finale: boolean
  fin: Finale | null
  running: boolean
  raf: number
}

let fw: State | null = null
let ctx: GameContext
/** La main alterne : un cœur tracé, puis un toucher */
let handTurn = 0

const TAP_LEN = 28   // px de trait : en dessous, c'est un toucher (la fusée d'avant)
const JOIN = 70      // px : un trait qui commence si près d'un dessin qui attend le complète
const WAIT = 0.45    // s : un dessin attend ce temps un autre trait avant de partir
const G = 0.028      // gravité (px par image² à 60 images/s)

function whistle(vol = 0.05) {
  // Sifflement de fusée qui monte — programmé sur l'horloge AUDIO : pas un
  // seul timer qui survivrait au démontage
  for (let i = 0; i < 6; i++) tone(420 + i * 130, 0.07, 'sine', vol, i * 0.055)
}
/** Le « tadaa » scintillant d'une forme qui se dessine */
function shimmer(d = 0, vol = 0.045) {
  ;[1568, 1976, 2349, 3136].forEach((f, i) => tone(f, 0.22, 'sine', vol, d + 0.3 + i * 0.05))
}
/** Les notes du cierge magique, pendant que le doigt dessine */
const WAND = [1047, 1175, 1319, 1568, 1760, 2093, 2349, 2637]

function spawn(P: Pool, x: number, y: number, vx: number, vy: number, col: number, r: number, decay: number, tw: boolean, g = 1): number {
  if (P.n >= MAXP) return -1
  const i = P.n++
  P.x[i] = x; P.y[i] = y; P.vx[i] = vx; P.vy[i] = vy
  P.life[i] = 1; P.decay[i] = decay; P.r[i] = r; P.g[i] = g; P.ph[i] = Math.random() * 6.283
  P.col[i] = col; P.kind[i] = FREE; P.tw[i] = tw ? 1 : 0
  P.age[i] = 0
  return i
}
/** Retire l'étincelle i : la dernière prend sa place (les boucles vont à rebours) */
function kill(P: Pool, i: number) {
  const j = --P.n
  if (i === j) return
  P.x[i] = P.x[j]; P.y[i] = P.y[j]; P.vx[i] = P.vx[j]; P.vy[i] = P.vy[j]
  P.life[i] = P.life[j]; P.decay[i] = P.decay[j]; P.r[i] = P.r[j]; P.g[i] = P.g[j]; P.ph[i] = P.ph[j]
  P.sx[i] = P.sx[j]; P.sy[i] = P.sy[j]; P.tx[i] = P.tx[j]; P.ty[i] = P.ty[j]
  P.age[i] = P.age[j]; P.fly[i] = P.fly[j]; P.hold[i] = P.hold[j]
  P.col[i] = P.col[j]; P.kind[i] = P.kind[j]; P.tw[i] = P.tw[j]
}

/** Un éclair de lumière dessiné une fois : le fondu du calque l'éteint */
function flash(me: State, x: number, y: number, R: number, col: number, a: number) {
  const c = me.c2d
  const op = c.globalCompositeOperation
  c.globalCompositeOperation = 'lighter'
  c.globalAlpha = a
  c.drawImage(atlas(), (col % PER_ROW) * CELL, Math.floor(col / PER_ROW) * CELL, CELL, CELL, x - R, y - R, R * 2, R * 2)
  c.globalCompositeOperation = op
  c.globalAlpha = 1
}

/* ---------- Les fusées classiques ---------- */

function explode(me: State, x: number, y: number, shape: string, pal: number[], big = false, quiet = false) {
  const P = me.p
  const n = big ? 110 : 46 + Math.floor(Math.random() * 19)
  if (!quiet) { sBoomReal(); sPopReal(0.16 + Math.random() * 0.16) }
  flash(me, x, y, big ? 170 : 90, pal[0], big ? 0.5 : 0.35)
  if (shape === 'willow') {
    // Le saule d'or du bouquet : lent, lourd, de longues traînées qui tombent
    for (let i = 0; i < 320; i++) {
      const a = Math.random() * Math.PI * 2, v = 1.5 + Math.pow(Math.random(), 0.7) * 5.2
      spawn(P, x, y, Math.cos(a) * v, Math.sin(a) * v - 0.5, pick(GOLD), 2.2 + Math.random() * 1.3,
        0.0045 + Math.random() * 0.003, Math.random() < 0.45, 0.6)
    }
    return
  }
  if (shape === 'crackle') {
    // Crépitement : de petites paillettes blanches qui clignotent
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, v = 0.4 + Math.random() * 1.6
      spawn(P, x, y, Math.cos(a) * v, Math.sin(a) * v, Math.random() < 0.7 ? WHITE : pal[0], 1.3 + Math.random() * 0.6,
        0.03 + Math.random() * 0.03, true, 0.5)
    }
    return
  }
  for (let i = 0; i < n; i++) {
    let a = Math.random() * Math.PI * 2
    let v = 1.6 + Math.random() * 2.6
    if (shape === 'ring') v = 3 + Math.random() * 0.4
    if (shape === 'heart') {
      // Paramétrique cœur : jolie silhouette qui s'ouvre
      const t = (i / n) * Math.PI * 2
      const hx = 16 * Math.pow(Math.sin(t), 3)
      const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
      a = Math.atan2(hy, hx)
      v = Math.hypot(hx, hy) * 0.16
    }
    if (shape === 'star' && i % 2 === 0) v *= 0.45
    if (big) v *= 1.35
    spawn(P, x, y, Math.cos(a) * v, Math.sin(a) * v - (shape === 'heart' ? 0.4 : 0), pick(pal),
      big ? 3.2 : 2.2 + Math.random() * 1.6, 0.008 + Math.random() * 0.008, Math.random() < 0.3)
  }
  if (shape === 'double') {
    ctx.after(260, () => {
      if (fw === me && me.running) explode(me, x + (Math.random() - 0.5) * 80, y + (Math.random() - 0.7) * 40, 'ring', pick(PAL_I), false, quiet)
    })
  }
}

function launch(me: State, tx: number, ty: number, o: Partial<Rocket> = {}) {
  if (!me.running) return
  me.rockets.push({
    x0: tx + (Math.random() - 0.5) * 16, y0: me.shore, tx, ty: Math.max(40, ty),
    t: 0, dur: 0.77 + Math.random() * 0.2,
    shape: pick([...SHAPES]), pal: pick(PAL_I), big: false, quiet: false,
    drawing: null, scale: 1, draft: null,
    ...o
  })
  if (!o.quiet) whistle()
}

function counted(me: State) {
  me.count++
  $('fwCount').innerHTML = `${ICON.bolt}<span>${me.count}</span>`
  if (me.count === me.need) $('fwFinalItem').style.display = ''
}

/* ---------- Les dessins : du tracé au feu d'artifice ---------- */

/** La couleur d'un point du tracé (encre, ou teinte de l'arc-en-ciel) */
function inkAt(ink: number, cl: number): number {
  if (ink === 0) return HUE_I[hueAt(cl)]
  const r = Math.random()
  const k = INK_I[ink]
  return r < 0.05 ? WHITE : r < 0.72 ? k[0] : r < 0.9 ? k[2] : k[1]
}
/** Le halo et le cœur clair du trait, à la longueur `cl` */
const hueAt = (cl: number) => Math.floor(cl / HUE_SPAN * NHUE) % NHUE
const glowHex = (ink: number, cl: number) => ink === 0 ? HUE_HEX[hueAt(cl)] : INKS[ink].cols[0]
const coreHex = (ink: number, cl: number) => ink === 0 ? HUE_LIGHT[hueAt(cl)] : INK_LIGHT[ink]

/** Des points réguliers le long des traits (un tous les `step` px), relatifs
    au centre (cx, cy) */
function makeDrawing(paths: Path[], ink: number, len: number, cx: number, cy: number, w: number, h: number, own: boolean): Drawing {
  const N = Math.max(40, Math.min(420, Math.round(len / 3)))
  const step = Math.max(2.5, len / N)
  const xs: number[] = [], ys: number[] = [], brk: number[] = [], col: number[] = []
  for (const p of paths) {
    const xy = p.xy, cl = p.cl, m = xy.length / 2
    let first = true
    const emit = (x: number, y: number, at: number) => {
      xs.push(x - cx); ys.push(y - cy); brk.push(first ? 1 : 0); col.push(inkAt(ink, at))
      first = false
    }
    if (m === 1) { emit(xy[0], xy[1], cl[0]); continue }
    let next = cl[0]
    for (let j = 0; j < m - 1; j++) {
      const a = cl[j], b = cl[j + 1]
      while (next <= b) {
        const u = b > a ? (next - a) / (b - a) : 0
        emit(xy[2 * j] + (xy[2 * j + 2] - xy[2 * j]) * u, xy[2 * j + 1] + (xy[2 * j + 3] - xy[2 * j + 1]) * u, next)
        next += step
      }
    }
  }
  return {
    n: xs.length, px: Float32Array.from(xs), py: Float32Array.from(ys),
    brk: Uint8Array.from(brk), col: Uint16Array.from(col), w, h, own
  }
}

/** La forme éclate : chaque étincelle file du centre vers son point du
    tracé, la forme brille, puis retombe en pluie (dans l'ordre du tracé). */
function burstDrawing(me: State, d: Drawing, cx: number, cy: number, s: number, quiet: boolean) {
  const P = me.p
  const big = s > 1.3
  // En grand, on garde la densité : des étincelles entre deux points
  const m = big ? Math.max(1, Math.min(3, Math.round(s * 0.9))) : 1
  const free = MAXP - P.n
  const stride = Math.max(1, Math.ceil(d.n * m / Math.max(1, free)))
  for (let i = 0; i < d.n; i += stride) {
    const last = i + 1 >= d.n || d.brk[i + 1] === 1
    for (let q = 0; q < m; q++) {
      if (q > 0 && last) break
      const u = q / m
      const x = last ? d.px[i] : d.px[i] + (d.px[i + 1] - d.px[i]) * u
      const y = last ? d.py[i] : d.py[i] + (d.py[i + 1] - d.py[i]) * u
      const k = spawn(P, cx, cy, 0, 0, d.col[i], (2.1 + Math.random() * 0.6) * (big ? 1.15 : 1), 0, false)
      if (k < 0) break
      P.kind[k] = FLY
      P.sx[k] = cx + (Math.random() - 0.5) * 4; P.sy[k] = cy + (Math.random() - 0.5) * 4
      P.tx[k] = cx + x * s; P.ty[k] = cy + y * s
      P.fly[k] = 0.36 + Math.random() * 0.1
      P.hold[k] = 0.8 + (i / d.n) * 0.45
    }
  }
  flash(me, cx, cy, big ? 150 : 100, WHITE, 0.45)
  if (!quiet) { sBoomReal(0, 0.8); shimmer() }
  if (d.own) {
    if (me.finale) me.encore++
    else me.drawn++
  }
}

/** Le dessin est complet : sa fusée part du bas vers son centre */
function launchDraft(me: State, d: Draft) {
  const i = me.drafts.indexOf(d)
  if (d.paths.every(p => p.dot)) {
    // Deux touchers voisins en même temps : deux fusées d'avant, pas un dessin
    if (i >= 0) me.drafts.splice(i, 1)
    for (const p of d.paths) { launch(me, p.xy[0], Math.min(p.xy[1], me.shore - 140)); counted(me) }
    return
  }
  const w = Math.max(1, d.maxX - d.minX), h = Math.max(1, d.maxY - d.minY)
  let cx = (d.minX + d.maxX) / 2, cy = (d.minY + d.maxY) / 2
  const drawing = makeDrawing(d.paths, d.ink, d.len, cx, cy, w, h, true)
  // Un dessin tracé sur le village ou dans le lac éclate dans le ciel
  let s = 1
  const room = me.shore - 30
  if (h > room) s = room / h
  cy = Math.min(cy, me.shore - 24 - h * s / 2)
  cy = Math.max(cy, 8 + h * s / 2)
  cx = Math.max(w * s / 2 + 8, Math.min(me.w - w * s / 2 - 8, cx))
  d.launched = true
  d.fade = 1
  me.drawings.push(drawing)
  if (me.drawings.length > 12) me.drawings.shift()
  me.last2 = { cx, cy, w: w * s, h: h * s, n: drawing.n, ink: d.ink }
  launch(me, cx, cy, { drawing, scale: s, draft: d, dur: 0.8, shape: 'drawing' })
  counted(me)
}

/* ---------- La boucle ---------- */

function loop(me: State, now: number) {
  if (fw !== me || !me.running) return
  me.raf = requestAnimationFrame(n => loop(me, n))
  // En pause (onglet caché, minuteur parental) le ciel se fige
  if (isPaused()) { me.last = now; return }
  const dt = Math.min(0.1, Math.max(0, (now - me.last) / 1000))
  me.last = now
  me.time += dt
  const k = dt * 60
  const c = me.c2d
  const P = me.p
  const A = atlas()
  const shore = me.shore, H = me.h, sq = me.squash, time = me.time
  // Traînées lumineuses : on efface doucement vers le transparent (le ciel
  // et le village sont sur leurs propres calques)
  c.globalCompositeOperation = 'destination-out'
  c.globalAlpha = 1
  c.fillStyle = `rgba(0,0,0,${1 - Math.pow(0.8, k)})`
  c.fillRect(0, 0, me.w, me.h)
  c.globalCompositeOperation = 'lighter'
  if (me.fin) {
    runFinale(me, dt)
    if (fw !== me || !me.running) return
  }
  // Le ciel illuminé par une grande gerbe (redessiné à chaque image, il s'éteint doucement)
  if (me.sky.t > 0) {
    const L = me.sky
    L.t = Math.max(0, L.t - dt)
    c.globalAlpha = L.a * (L.t / L.dur) * (1 - Math.pow(0.8, k))
    c.drawImage(glowSprite(), L.x - L.R, L.y - L.R, L.R * 2, L.R * 2)
  }

  // Les dessins en cours : le trait brille, scintille, puis attend sa fusée
  for (let i = me.drafts.length - 1; i >= 0; i--) {
    const d = me.drafts[i]
    if (d.launched) {
      d.fade = Math.max(0, d.fade - dt * 1.1)
      if (d.fade <= 0) { me.drafts.splice(i, 1); continue }
    } else if (d.live === 0 && d.paths.length) {
      d.wait -= dt
      if (d.wait <= 0) { launchDraft(me, d); continue }
    }
    const a = d.launched ? 0.2 + 0.5 * d.fade : 0.85 + 0.15 * Math.sin(time * 9)
    guide(me, d, a)
    if (!d.launched) sparkle(me, d, k)
  }
  // Le bout du doigt : un cierge magique
  me.strokes.forEach(s => {
    const n = Math.random() < k ? 3 : 2
    const tip = s.path.xy.length - 2
    const x = s.path.xy[tip], y = s.path.xy[tip + 1]
    const colA = inkAt(s.draft.ink, s.path.cl[s.path.cl.length - 1])
    for (let j = 0; j < n; j++) {
      const a = Math.random() * Math.PI * 2, v = 0.8 + Math.random() * 1.9
      spawn(P, x, y, Math.cos(a) * v, Math.sin(a) * v - 0.3, Math.random() < 0.55 ? SPARK : colA,
        1 + Math.random() * 0.6, 0.05 + Math.random() * 0.04, Math.random() < 0.5, 0.9)
    }
  })

  // Fusées qui montent
  for (let i = me.rockets.length - 1; i >= 0; i--) {
    const r = me.rockets[i]
    r.t += dt
    const u = Math.min(1, r.t / r.dur)
    const x = r.x0 + (r.tx - r.x0) * u
    const y = r.y0 - (r.y0 - r.ty) * (1 - Math.pow(1 - u, 2))
    dot(c, A, x, y, 2.8, SPARK, 1, shore, H, sq, time)
    if (Math.random() < 0.8 * k) spawn(P, x + (Math.random() - 0.5) * 2, y + 4, (Math.random() - 0.5) * 0.4, 0.4, EMBER, 1.2, 0.07, false, 0.4)
    if (u >= 1) {
      me.rockets.splice(i, 1)
      if (r.drawing) {
        burstDrawing(me, r.drawing, r.tx, r.ty, r.scale, r.quiet)
        if (r.draft) r.draft.fade = Math.min(r.draft.fade, 0.3)
      } else explode(me, r.tx, r.ty, r.shape, r.pal, r.big, r.quiet)
    }
  }

  // Étincelles
  const drag = Math.pow(0.985, k)
  for (let i = P.n - 1; i >= 0; i--) {
    const kind = P.kind[i]
    let a: number, sz: number
    if (kind === FLY) {
      P.age[i] += dt
      const u = Math.min(1, P.age[i] / P.fly[i])
      const e = 1 - (1 - u) * (1 - u) * (1 - u)
      P.x[i] = P.sx[i] + (P.tx[i] - P.sx[i]) * e
      P.y[i] = P.sy[i] + (P.ty[i] - P.sy[i]) * e
      if (u >= 1) { P.kind[i] = HOLD; P.age[i] = 0 }
      a = 1; sz = P.r[i] * 1.05
    } else if (kind === HOLD) {
      P.age[i] += dt
      const ph = P.ph[i]
      P.x[i] = P.tx[i] + Math.sin(time * 7 + ph) * 0.5
      P.y[i] = P.ty[i] + Math.cos(time * 6 + ph) * 0.5
      if (P.age[i] >= P.hold[i]) {
        // La forme se défait : chaque étincelle retombe en pluie scintillante
        P.kind[i] = FREE
        P.vx[i] = (Math.random() - 0.5) * 0.7
        P.vy[i] = Math.random() * 0.5 - 0.1
        P.g[i] = 0.8; P.tw[i] = 1
        P.life[i] = 1; P.decay[i] = 1 / (60 * (1.4 + Math.random() * 1.2))
      } else if (Math.random() < 0.01 * k) {
        // Pendant qu'elle brille, des paillettes s'en détachent et tombent
        spawn(P, P.x[i], P.y[i], (Math.random() - 0.5) * 0.3, 0.2, P.col[i], 1 + Math.random() * 0.5, 0.025 + Math.random() * 0.02, true, 0.7)
      }
      // Elle brille : un éclat plein dès qu'elle arrive, puis un scintillement
      const fresh = Math.max(0, 1 - P.age[i] * 4)
      a = 0.5 + 0.28 * Math.sin(time * 15 + ph) + fresh
      sz = P.r[i] * (1.05 + fresh * 0.6)
    } else {
      P.x[i] += P.vx[i] * k; P.y[i] += P.vy[i] * k
      P.vy[i] += G * P.g[i] * k
      P.vx[i] *= drag; P.vy[i] *= drag
      P.life[i] -= P.decay[i] * k
      const life = P.life[i]
      if (life <= 0 || P.y[i] > shore + 2) { kill(P, i); continue }
      a = P.tw[i] ? life * (0.35 + 0.65 * Math.abs(Math.sin(time * 17 + P.ph[i]))) : life
      sz = P.r[i] * life + 0.6
    }
    dot(c, A, P.x[i], P.y[i], sz, P.col[i], Math.min(1, a), shore, H, sq, time)
  }
  c.globalAlpha = 1
  c.globalCompositeOperation = 'source-over'
}

/** Un point lumineux (un halo de la planche) et son reflet dans le lac, qui
    tremble sur l'eau */
function dot(c: CanvasRenderingContext2D, A: HTMLCanvasElement, x: number, y: number, r: number, col: number, a: number,
  shore: number, H: number, sq: number, time: number) {
  const sx = (col % PER_ROW) * CELL, sy = Math.floor(col / PER_ROW) * CELL
  const S = r * 5
  c.globalAlpha = a
  c.drawImage(A, sx, sy, CELL, CELL, x - S / 2, y - S / 2, S, S)
  // Le lac est plus court que le ciel : le reflet est tassé à sa hauteur
  if (y < shore && a > 0.08) {
    const ry = shore + (shore - y) * sq
    if (ry < H) {
      c.globalAlpha = a * 0.32
      const S2 = S * 0.9
      c.drawImage(A, sx, sy, CELL, CELL, x + Math.sin(ry * 0.09 + time * 7) * 4 - S2 / 2, ry - S2 / 2, S2, S2)
    }
  }
}

/** Le trait lumineux d'un dessin (halo large + cœur clair), et son reflet */
function guide(me: State, d: Draft, a: number) {
  const c = me.c2d
  c.lineCap = 'round'; c.lineJoin = 'round'
  strokeDraft(c, d, a)
  // Le reflet dans le lac : y' = rive + (rive − y) × tassement
  c.save()
  c.setTransform(me.dpr, 0, 0, -me.dpr * me.squash, 0, me.dpr * me.shore * (1 + me.squash))
  strokeDraft(c, d, a * 0.3)
  c.restore()
}
function strokeDraft(c: CanvasRenderingContext2D, d: Draft, a: number) {
  const CH = 8
  for (const p of d.paths) {
    const xy = p.xy, n = xy.length / 2
    if (n < 2) continue
    for (let s = 0; s < n - 1; s += CH) {
      const e = Math.min(n - 1, s + CH)
      c.beginPath()
      c.moveTo(xy[2 * s], xy[2 * s + 1])
      for (let j = s + 1; j <= e; j++) c.lineTo(xy[2 * j], xy[2 * j + 1])
      c.strokeStyle = glowHex(d.ink, p.cl[s])
      c.globalAlpha = a * 0.09; c.lineWidth = 16; c.stroke()
      c.globalAlpha = a * 0.16; c.lineWidth = 7; c.stroke()
      c.strokeStyle = coreHex(d.ink, p.cl[s])
      c.globalAlpha = a * 0.55; c.lineWidth = 2.6; c.stroke()
    }
  }
}
/** Des paillettes qui scintillent le long du trait */
function sparkle(me: State, d: Draft, k: number) {
  const P = me.p
  const want = Math.min(6, 1 + d.len / 160) * k
  let n = Math.floor(want) + (Math.random() < want % 1 ? 1 : 0)
  while (n-- > 0) {
    const p = d.paths[Math.floor(Math.random() * d.paths.length)]
    const m = p.xy.length / 2
    const j = Math.floor(Math.random() * m)
    spawn(P, p.xy[2 * j] + (Math.random() - 0.5) * 3, p.xy[2 * j + 1] + (Math.random() - 0.5) * 3,
      (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5 - 0.1, Math.random() < 0.35 ? WHITE : inkAt(d.ink, p.cl[j]),
      1.1 + Math.random() * 0.7, 0.045 + Math.random() * 0.04, true, 0.25)
  }
}

/* ---------- Le décor ---------- */

/** Le ciel de nuit (calque du fond) : dégradé, étoiles, lune, collines au loin */
function drawSky(c: CanvasRenderingContext2D, w: number, h: number, shore: number) {
  const g = c.createLinearGradient(0, 0, 0, shore)
  g.addColorStop(0, '#0B0A26'); g.addColorStop(0.6, '#1E1A4A'); g.addColorStop(1, '#3A2C5E')
  c.fillStyle = g; c.fillRect(0, 0, w, h)
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * w, y = Math.random() * shore * 0.85
    c.globalAlpha = 0.3 + Math.random() * 0.7
    c.fillStyle = '#FFFFFF'
    c.beginPath(); c.arc(x, y, Math.random() * 1.3 + 0.3, 0, 7); c.fill()
  }
  c.globalAlpha = 1
  // La lune, en croissant, avec son halo
  const mx = w * 0.84, my = shore * 0.2
  const halo = c.createRadialGradient(mx, my, 10, mx, my, 90)
  halo.addColorStop(0, 'rgba(255,244,210,.28)'); halo.addColorStop(1, 'rgba(255,244,210,0)')
  c.fillStyle = halo; c.fillRect(mx - 90, my - 90, 180, 180)
  // Croissant = disque privé d'un autre disque (découpe en pair-impair, pas de disque sombre posé dessus)
  c.save()
  c.beginPath(); c.rect(mx - 40, my - 40, 80, 80); c.arc(mx + 11, my - 7, 23, 0, 7); c.clip('evenodd')
  c.fillStyle = '#FFF4D2'
  c.beginPath(); c.arc(mx, my, 26, 0, 7); c.fill()
  c.restore()
  // Collines au loin
  c.fillStyle = '#2A2152'
  c.beginPath(); c.moveTo(0, shore)
  for (let x = 0; x <= w; x += 20) c.lineTo(x, shore - 40 - Math.sin(x / 170) * 22 - Math.sin(x / 61) * 8)
  c.lineTo(w, shore); c.fill()
  // Le lac : une eau sombre (les reflets passent par-dessus)
  const l = c.createLinearGradient(0, shore, 0, h)
  l.addColorStop(0, '#1C1840'); l.addColorStop(1, '#0B0A1E')
  c.fillStyle = l; c.fillRect(0, shore, w, h - shore)
}

/** La ferme et le village en silhouette sur la rive (calque du devant) */
function drawShore(c: CanvasRenderingContext2D, w: number, h: number, shore: number) {
  const ink = '#08061A'
  const lit = 'rgba(255,208,110,.9)'
  c.fillStyle = ink
  const house = (x: number, bw: number, bh: number) => {
    c.fillStyle = ink
    c.beginPath(); c.moveTo(x, shore); c.lineTo(x, shore - bh); c.lineTo(x + bw / 2, shore - bh - bw * 0.42)
    c.lineTo(x + bw, shore - bh); c.lineTo(x + bw, shore); c.fill()
    c.fillStyle = lit
    c.fillRect(x + bw * 0.22, shore - bh * 0.62, bw * 0.16, bh * 0.22)
    if (bw > 50) c.fillRect(x + bw * 0.6, shore - bh * 0.62, bw * 0.16, bh * 0.22)
  }
  const pine = (x: number, s: number) => {
    c.fillStyle = ink
    c.beginPath(); c.moveTo(x, shore); c.lineTo(x + s / 2, shore - s * 1.8); c.lineTo(x + s, shore); c.fill()
  }
  const scene = () => {
    // La ferme, à gauche : grange au toit à deux pentes, silo, moulin
    const gx = w * 0.05
    c.fillStyle = ink
    c.beginPath(); c.moveTo(gx, shore); c.lineTo(gx, shore - 60); c.lineTo(gx + 22, shore - 92); c.lineTo(gx + 78, shore - 92)
    c.lineTo(gx + 100, shore - 60); c.lineTo(gx + 100, shore); c.fill()
    c.fillStyle = lit; c.fillRect(gx + 40, shore - 70, 20, 14)
    c.fillStyle = ink
    c.fillRect(gx + 108, shore - 110, 30, 110)
    c.beginPath(); c.arc(gx + 123, shore - 110, 15, Math.PI, 0); c.fill()
    const mx = gx + 190, my = shore - 104
    c.beginPath(); c.moveTo(mx - 14, shore); c.lineTo(mx - 7, my); c.lineTo(mx + 7, my); c.lineTo(mx + 14, shore); c.fill()
    c.save(); c.translate(mx, my); c.rotate(0.35)
    for (let k = 0; k < 4; k++) { c.rotate(Math.PI / 2); c.fillRect(-4, 0, 8, 54); c.fillRect(4, 14, 10, 38) }
    c.restore()
    pine(gx + 240, 30)
    // Le village, à droite : maisons, un clocher, des sapins
    let x = w * 0.36
    let i = 0
    while (x < w) {
      const k = i % 5
      if (k === 2) { pine(x, 28 + (i % 3) * 8); x += 40 }
      else if (k === 4) {
        c.fillStyle = ink
        c.beginPath(); c.moveTo(x, shore); c.lineTo(x, shore - 80); c.lineTo(x + 14, shore - 118); c.lineTo(x + 28, shore - 80); c.lineTo(x + 28, shore); c.fill()
        c.fillStyle = lit; c.beginPath(); c.arc(x + 14, shore - 62, 5, 0, 7); c.fill()
        x += 42
      } else { house(x, 44 + (i % 4) * 10, 30 + (i % 3) * 10); x += 58 + (i % 4) * 10 }
      i++
    }
  }
  // Le reflet de la rive dans le lac : la même scène, retournée et tassée
  c.save()
  c.translate(0, shore); c.scale(1, -0.5); c.translate(0, -shore)
  c.globalAlpha = 0.55
  scene()
  c.restore()
  scene()
  // La berge, puis le reflet des fenêtres qui tremble dans l'eau
  c.fillStyle = ink
  c.fillRect(0, shore - 3, w, 6)
  c.fillStyle = 'rgba(255,208,110,.16)'
  for (let k = 0; k < 26; k++) {
    const rx = Math.random() * w, ry = shore + 8 + Math.random() * (h - shore) * 0.6
    c.fillRect(rx, ry, 14 + Math.random() * 30, 2)
  }
  // Un voile d'eau sur les reflets des fusées (calque du devant, très léger)
  const water = c.createLinearGradient(0, shore, 0, h)
  water.addColorStop(0, 'rgba(20,18,60,.25)'); water.addColorStop(1, 'rgba(8,6,26,.55)')
  c.fillStyle = water; c.fillRect(0, shore + 3, w, h - shore)
}

/* ---------- Le bouquet final, en musique ---------- */

/** Les formes du bouquet quand l'enfant n'a rien dessiné (ou pas assez) */
function builtIn(kind: number): { paths: Path[]; ink: number } {
  const mk = (pts: number[], dot = false): Path => {
    const cl = [0]
    for (let i = 2; i < pts.length; i += 2) cl.push(cl[cl.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]))
    return { xy: pts, cl, dot }
  }
  const ring = (cx: number, cy: number, r: number, a0: number, a1: number, n: number) => {
    const o: number[] = []
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r) }
    return o
  }
  const curve = (n: number, f: (t: number) => [number, number]) => {
    const o: number[] = []
    for (let i = 0; i <= n; i++) o.push(...f(i / n))
    return o
  }
  switch (kind % 6) {
    case 0: return { ink: 2, paths: [mk(curve(90, t => { const a = t * Math.PI * 2; return [80 * Math.pow(Math.sin(a), 3), -5 * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))] }))] }
    case 1: return { ink: 1, paths: [mk(curve(10, t => { const i = Math.round(t * 10), r = i % 2 ? 36 : 88, a = -Math.PI / 2 + i * Math.PI / 5; return [Math.cos(a) * r, Math.sin(a) * r] }))] }
    case 2: return { ink: 0, paths: [mk(curve(140, t => { const a = t * Math.PI * 2, r = 44 + 40 * Math.abs(Math.sin(2.5 * a)); return [Math.cos(a) * r, Math.sin(a) * r] }))] }
    case 3: return {
      ink: 1, paths: [mk(ring(0, 0, 78, 0, Math.PI * 2, 60)), mk(ring(-26, -22, 8, 0, Math.PI * 2, 10), true),
        mk(ring(26, -22, 8, 0, Math.PI * 2, 10), true), mk(ring(0, 6, 44, 0.18 * Math.PI, 0.82 * Math.PI, 24))]
    }
    case 4: return { ink: 5, paths: [mk(curve(120, t => { const a = t * Math.PI * 4.2, r = 4 + a * 6; return [Math.cos(a) * r, Math.sin(a) * r] }))] }
    default: return { ink: 3, paths: [mk(curve(90, t => { const a = t * Math.PI * 2; return [80 * Math.pow(Math.sin(a), 3), -5 * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))] }))] }
  }
}
function builtInDrawing(kind: number): Drawing {
  const { paths, ink } = builtIn(kind)
  // Les longueurs cumulées se suivent d'un trait à l'autre (l'arc-en-ciel)
  let len = 0, minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9
  for (const p of paths) {
    const off = len - p.cl[0]
    for (let i = 0; i < p.cl.length; i++) p.cl[i] += off
    len = p.cl[p.cl.length - 1]
    for (let i = 0; i < p.xy.length; i += 2) {
      minX = Math.min(minX, p.xy[i]); maxX = Math.max(maxX, p.xy[i])
      minY = Math.min(minY, p.xy[i + 1]); maxY = Math.max(maxY, p.xy[i + 1])
    }
  }
  return makeDrawing(paths, ink, len, (minX + maxX) / 2, (minY + maxY) / 2, maxX - minX, maxY - minY, false)
}

/* La partition : 108 à la noire, une mesure d'ouverture, six mesures de
   mélodie (une forme dessinée sur chaque premier temps), une montée en
   croches, et l'accord final sous la grande gerbe. Do majeur, à la fête. */
const BPM = 108
const BEAT = 60 / BPM
const T0 = 1.2        // s : les premières fusées sifflent avant le premier temps
const FLIGHT = 0.8    // s : une fusée part ce temps-là avant son temps
const LOOK = 0.15     // s : les notes sont programmées juste un peu à l'avance
/** Accords (octave 4), basse, par mesure ; la 8ᵉ change au 3ᵉ temps */
const CHORDS = [
  [60, 64, 67, 72], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65],
  [60, 64, 67, 72], [55, 59, 62, 67], [53, 57, 60, 65], [53, 57, 60, 65]
]
const BASS = [48, 43, 45, 41, 48, 43, 41, 41]
/** La mélodie : [mesure, temps, durée en temps, note MIDI] */
const MELODY: [number, number, number, number][] = [
  [1, 0, 1, 79], [1, 1, 0.5, 76], [1, 1.5, 0.5, 79], [1, 2, 2, 84],
  [2, 0, 1, 83], [2, 1, 0.5, 86], [2, 1.5, 0.5, 83], [2, 2, 2, 79],
  [3, 0, 1, 81], [3, 1, 0.5, 84], [3, 1.5, 0.5, 88], [3, 2, 1, 86], [3, 3, 1, 84],
  [4, 0, 1, 84], [4, 1, 1, 81], [4, 2, 2, 77],
  [5, 0, 0.5, 76], [5, 0.5, 0.5, 79], [5, 1, 1, 84], [5, 2, 1, 88], [5, 3, 1, 91],
  [6, 0, 1, 89], [6, 1, 0.5, 88], [6, 1.5, 0.5, 86], [6, 2, 2, 83],
  // La montée : une croche, une fusée
  [7, 0, 0.5, 77], [7, 0.5, 0.5, 81], [7, 1, 0.5, 84], [7, 1.5, 0.5, 89],
  [7, 2, 0.5, 79], [7, 2.5, 0.5, 83], [7, 3, 0.5, 86], [7, 3.5, 0.5, 91]
]
const ARP = [0, 1, 2, 3, 2, 1, 2, 1]

function bouquet(me: State) {
  if (fw !== me || !me.running || me.finale) return
  me.finale = true
  $('fwArena').classList.add('fw-show')
  // Les dessins qui attendaient partent tout de suite ; les doigts posés sont oubliés
  me.strokes.clear()
  for (const d of me.drafts.slice()) {
    if (d.launched) continue
    if (d.paths.length && d.live === 0) launchDraft(me, d)
    else me.drafts.splice(me.drafts.indexOf(d), 1)
  }
  // L'ambiance de la nuit se tait : place à la partition
  stopMusic(0.8)
  const ac = getCtx()
  // La sortie audio a du retard (plus sur une tablette) : les images l'attendent
  const lat = ac ? Math.min(0.25, (ac.outputLatency || 0) + (ac.baseLatency || 0)) : 0
  const vis: Finale['vis'] = []
  const aud: Finale['aud'] = []
  const at = (bar: number, beat: number) => T0 + (bar * 4 + beat) * BEAT
  const W = me.w, SKY = me.shore
  const V = (t: number, fn: () => void) => vis.push({ t: t + lat, fn })
  const S = (t: number, fn: (d: number, when: number) => void) => aud.push({ t, fn })
  const boom = (t: number, v = 0.55) => S(t, d => { sBoomReal(d, v); sPopReal(d + 0.12 + Math.random() * 0.1) })

  /** Une fusée qui ÉCLATE sur le temps t */
  const salvo = (t: number, fx: number, fy: number, shape: string, pal: number[], big = false) => {
    V(t - FLIGHT, () => launch(me, W * fx, SKY * fy, { shape, pal, big, quiet: true, dur: FLIGHT }))
    V(t - FLIGHT, () => whistle(0.025))
    boom(t, big ? 0.8 : 0.5)
  }

  // Les six formes : celles de l'enfant (réparties sur sa partie), complétées
  // par celles du bouquet
  const mine = me.drawings
  const shapes: Drawing[] = []
  const nMine = Math.min(6, mine.length)
  for (let i = 0; i < nMine; i++) shapes.push(mine[Math.floor(i * mine.length / nMine)])
  for (let i = 0; shapes.length < 6; i++) shapes.push(builtInDrawing(i))
  // En grand : jusqu'à six dixièmes du ciel
  const T = Math.min(SKY * 0.6, W * 0.42)

  // Mesure 0 : l'ouverture, trois gerbes d'un coup puis une par temps
  salvo(at(0, 0), 0.24, 0.36, 'burst', PAL_I[0])
  salvo(at(0, 0), 0.5, 0.24, 'ring', PAL_I[5], true)
  salvo(at(0, 0), 0.76, 0.36, 'burst', PAL_I[3])
  V(at(0, 0), () => { me.sky = { t: 0.8, dur: 0.8, x: W * 0.5, y: SKY * 0.3, R: Math.max(W, SKY) * 0.6, a: 0.4 } })
  salvo(at(0, 1), 0.34, 0.5, 'star', PAL_I[2])
  salvo(at(0, 2), 0.66, 0.46, 'ring', PAL_I[1])
  salvo(at(0, 3), 0.5, 0.36, 'heart', PAL_I[3])
  // Mesures 1 à 6 : une forme dessinée sur le premier temps, une paire au troisième
  for (let b = 1; b <= 6; b++) {
    const d = shapes[b - 1]
    const s = Math.max(0.8, Math.min(2.6, T / Math.max(d.w, d.h, 1), SKY * 0.8 / Math.max(1, d.h)))
    const cx = W * (0.5 + (b % 2 ? -0.08 : 0.08)), cy = SKY * 0.44
    V(at(b, 0) - FLIGHT, () => launch(me, cx, cy, { drawing: d, scale: s, quiet: true, dur: FLIGHT, shape: 'drawing' }))
    V(at(b, 0) - FLIGHT, () => whistle(0.03))
    boom(at(b, 0), 0.7)
    S(at(b, 0), d2 => shimmer(d2 + 0.06, 0.035))
    // Des teintes franches (les palettes pastel virent au blanc en si grand nombre)
    const h = (b * 5) % NHUE
    const pal = [HUE_I[h], HUE_I[(h + 2) % NHUE], WHITE]
    salvo(at(b, 2), 0.13, 0.3, b % 2 ? 'ring' : 'burst', pal)
    salvo(at(b, 2), 0.87, 0.3, b % 2 ? 'ring' : 'burst', pal)
    V(at(b, 1), () => explode(me, W * (0.16 + Math.random() * 0.1), SKY * (0.14 + Math.random() * 0.1), 'crackle', pal, false, true))
    V(at(b, 3), () => explode(me, W * (0.74 + Math.random() * 0.1), SKY * (0.14 + Math.random() * 0.1), 'crackle', pal, false, true))
    S(at(b, 1), d2 => sPopReal(d2)); S(at(b, 3), d2 => sPopReal(d2))
  }
  // Mesure 7 : la montée, une fusée par croche, de plus en plus haut
  for (let q = 0; q < 8; q++) {
    const side = q % 2 ? 1 : -1
    salvo(at(7, q / 2), 0.5 + side * (0.1 + 0.045 * q), 0.62 - 0.05 * q, q % 3 === 2 ? 'ring' : 'burst', [HUE_I[(q * 3) % NHUE], HUE_I[(q * 3 + 2) % NHUE], WHITE])
  }
  // Mesure 8 : la grande gerbe d'or, et le ciel s'illumine
  const tEnd = at(8, 0)
  V(tEnd - FLIGHT, () => { launch(me, W * 0.5, SKY * 0.3, { shape: 'willow', pal: GOLD, quiet: true, dur: FLIGHT }); whistle(0.04) })
  salvo(tEnd, 0.2, 0.34, 'ring', [HUE_I[20], HUE_I[22], HUE_I[16]], true)
  salvo(tEnd, 0.8, 0.34, 'ring', [HUE_I[0], HUE_I[2], HUE_I[22]], true)
  V(tEnd, () => {
    me.sky = { t: 1.6, dur: 1.6, x: W * 0.5, y: SKY * 0.32, R: Math.max(W, SKY) * 0.85, a: 0.75 }
    explode(me, W * 0.5, SKY * 0.3, 'ring', [WHITE, SPARK], true, true)
  })
  V(tEnd + 0.35, () => {
    for (let i = 0; i < 5; i++) explode(me, W * (0.15 + i * 0.175), SKY * (0.18 + Math.random() * 0.12), 'crackle', GOLD, false, true)
  })
  S(tEnd, d => { sBoomReal(d, 1); sBoomReal(d + 0.08, 0.6) })
  S(tEnd + 0.35, d => { for (let i = 0; i < 6; i++) sPopReal(d + i * 0.07) })
  // La fin : la pluie d'or retombe pendant l'outro (le fondu de la musique aussi)
  V(tEnd + 0.9, () => {
    ctx.finish({ title: 'Quel spectacle !', msg: 'Tu as illuminé tout le ciel', stars: 3, outroMs: 2800 })
  })

  // La musique : basse, nappe, harpe en croches, shaker, et la mélodie aux clochettes
  const note = (voice: Parameters<typeof playNote>[0], n: number | number[], t: number, dur: number, vol: number) =>
    S(t, (_d, when) => playNote(voice, n, when, dur, vol))
  for (let b = 0; b < 8; b++) {
    const ch = CHORDS[b]
    if (b === 7) {
      note('bass', 41, at(7, 0), BEAT * 2, 0.09); note('bass', 43, at(7, 2), BEAT * 2, 0.09)
      note('pad', [53, 57, 60, 65], at(7, 0), BEAT * 2, 0.018); note('pad', [55, 59, 62, 67], at(7, 2), BEAT * 2.2, 0.018)
    } else {
      note('bass', BASS[b], at(b, 0), BEAT * 4, 0.09)
      note('pad', ch, at(b, 0), BEAT * 4.1, 0.018)
    }
    for (let e = 0; e < 8; e++) {
      const chord = b === 7 && e >= 4 ? [55, 59, 62, 67] : ch
      note('harp', chord[ARP[e]] + 12, at(b, e / 2), 0, b === 0 ? 0.045 : 0.032)
      if (b > 0) note('hat', 0, at(b, e / 2), 0, e % 2 ? 0.02 : 0.035)
    }
  }
  for (const [b, beat, len, n] of MELODY) note('bell', n, at(b, beat), Math.max(0.5, len * BEAT * 1.4), len < 1 ? 0.1 : 0.13)
  note('bell', [84, 88, 91, 96], tEnd, 3.4, 0.09)
  note('bass', [36, 48], tEnd, 3.6, 0.1)
  note('pad', [60, 64, 67, 72], tEnd, 3.6, 0.025)

  vis.sort((a, b) => a.t - b.t)
  aud.sort((a, b) => a.t - b.t)
  me.fin = { t: 0, vis, vi: 0, aud, ai: 0 }
}

function runFinale(me: State, dt: number) {
  const f = me.fin!
  f.t += dt
  while (f.vi < f.vis.length && f.vis[f.vi].t <= f.t) {
    f.vis[f.vi++].fn()
    if (fw !== me || !me.running) return
  }
  const ac = getCtx()
  while (f.ai < f.aud.length && f.aud[f.ai].t <= f.t + LOOK) {
    const e = f.aud[f.ai++]
    const d = Math.max(0, e.t - f.t)
    e.fn(d, (ac ? ac.currentTime : 0) + d)
  }
}

/* ---------- Le jeu ---------- */

/** Le cœur que la main dessine, en points d'écran */
function heartTrace(root: HTMLElement): { x: number; y: number }[] {
  const a = (root.querySelector('.arena') || root).getBoundingClientRect()
  const cx = a.left + a.width * 0.42, cy = a.top + a.height * 0.34
  const s = Math.min(a.width, a.height) * 0.0085
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i <= 36; i++) {
    const t = i / 36 * Math.PI * 2
    pts.push({
      x: cx + s * 16 * Math.pow(Math.sin(t), 3),
      y: cy - s * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))
    })
  }
  return pts
}

export const fireworks: GameDef = {
  id: 'fireworks', name: "Feu d'Artifice", icon: '🎆', sq: 'sq-lilac', cat: 'creatif', music: 'night',
  subtitle: 'Dessine dans le ciel : ta fusée éclate en forme !',
  // La main : un cœur tracé dans le ciel, puis un toucher ; le bouquet quand il est là
  hand: root => {
    if (!fw || !fw.running || fw.finale) return null
    const turn = handTurn++
    const btn = root.querySelector<HTMLElement>('#fwFinal')
    if (fw.count >= fw.need && btn && turn % 2 === 1) return { tap: btn }
    return turn % 2 === 0 ? { trace: heartTrace(root) } : { tap: { fx: 0.62, fy: 0.3 } }
  },
  mount(c) {
    ctx = c
    handTurn = 0
    const need = c.byTier(10, 12, 15)
    c.root.innerHTML = `
      <div class="arena fw-arena" id="fwArena">
        <canvas id="fwSky" class="fw-layer"></canvas>
        <canvas id="fwCanvas" class="fw-layer"></canvas>
        <canvas id="fwShore" class="fw-layer"></canvas>
        <div class="fw-pal" id="fwPal">
          ${INKS.map((k, i) => `<button class="fw-ink${i === 0 ? ' fw-rainbow sel' : ''}" data-i="${i}"${k.cols.length ? ` style="--c:${k.cols[0]}"` : ''} aria-label="${k.name}"></button>`).join('')}
        </div>
        <div class="tq-side fw-side">
          <div class="tq-moves" id="fwCount">${ICON.bolt}<span>0</span></div>
          <span class="tool-item" id="fwFinalItem" style="display:none"><button class="sn-tool go fw-final" id="fwFinal" aria-label="Bouquet final">${ICON.star}</button><i class="tool-cap">Bouquet</i></span>
        </div>
      </div>`
    const arena = $('fwArena')
    // Net sur tablette : les calques ont la densité de l'écran (plafonnée), le dessin reste en px CSS
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const layer = (id: string, W: number, H: number) => {
      const cv = $(id) as unknown as HTMLCanvasElement
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr)
      cv.style.width = W + 'px'; cv.style.height = H + 'px'
      const g = cv.getContext('2d')!
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      return g
    }
    const W0 = arena.clientWidth, H0 = arena.clientHeight
    const me: State = {
      c2d: layer('fwCanvas', W0, H0), dpr, w: W0, h: H0, shore: 0, squash: 0, time: 0, last: performance.now(),
      p: pool(), rockets: [], drafts: [], strokes: new Map(), drawings: [], ink: 0, need,
      count: 0, drawn: 0, encore: 0, last2: null, sky: { t: 0, dur: 1, x: 0, y: 0, R: 0, a: 0 }, finale: false, fin: null, running: true, raf: 0
    }
    /** Le décor à la taille de l'arène (et encore si elle change : plein écran) */
    const layout = (W: number, H: number) => {
      me.w = W; me.h = H
      me.shore = Math.round(H * 0.78)
      me.squash = (H - me.shore) / me.shore
      drawSky(layer('fwSky', W, H), W, H, me.shore)
      drawShore(layer('fwShore', W, H), W, H, me.shore)
      me.c2d = layer('fwCanvas', W, H)
    }
    layout(W0, H0)
    fw = me
    const ro = new ResizeObserver(() => {
      const W = arena.clientWidth, H = arena.clientHeight
      if (fw === me && W > 0 && H > 0 && (W !== me.w || H !== me.h)) layout(W, H)
    })
    ro.observe(arena)

    /* Le doigt : un toucher bref = une fusée ; un tracé = un dessin. Chaque
       doigt est suivi par son pointerId, le glissé écouté sur la fenêtre. */
    const onDown = (e: PointerEvent) => {
      if (fw !== me || !me.running || me.finale) return
      if ((e.target as Element).closest('button, .fw-pal, .tq-side')) return
      const r = arena.getBoundingClientRect()
      const x = e.clientX - r.left, y = e.clientY - r.top
      let d = me.drafts.find(q => !q.launched && x > q.minX - JOIN && x < q.maxX + JOIN && y > q.minY - JOIN && y < q.maxY + JOIN)
      if (!d) {
        d = { paths: [], live: 0, wait: 0, ink: me.ink, len: 0, minX: x, minY: y, maxX: x, maxY: y, launched: false, fade: 1 }
        me.drafts.push(d)
      }
      d.live++
      const path: Path = { xy: [x, y], cl: [d.len], dot: false }
      d.paths.push(path)
      d.minX = Math.min(d.minX, x); d.maxX = Math.max(d.maxX, x); d.minY = Math.min(d.minY, y); d.maxY = Math.max(d.maxY, y)
      me.strokes.set(e.pointerId, { draft: d, path, lx: x, ly: y, ox: r.left, oy: r.top, acc: 0, note: 3 })
    }
    const onMove = (e: PointerEvent) => {
      const s = me.strokes.get(e.pointerId)
      if (!s || fw !== me) return
      const evs = e.getCoalescedEvents?.() || []
      const list = evs.length ? evs : [e]
      const d = s.draft
      for (const ev of list) {
        const x = ev.clientX - s.ox, y = ev.clientY - s.oy
        const dist = Math.hypot(x - s.lx, y - s.ly)
        if (dist < 3 || s.path.xy.length >= 2400) continue
        s.path.xy.push(x, y)
        // Longueur cumulée du trait lui-même (un autre doigt peut dessiner en même temps)
        s.path.cl.push(s.path.cl[s.path.cl.length - 1] + dist)
        d.len += dist
        d.minX = Math.min(d.minX, x); d.maxX = Math.max(d.maxX, x); d.minY = Math.min(d.minY, y); d.maxY = Math.max(d.maxY, y)
        s.lx = x; s.ly = y
        s.acc += dist
        if (s.acc > 70) {
          // Le cierge magique chante en montant et descendant sa gamme
          s.acc = 0
          s.note = Math.max(0, Math.min(WAND.length - 1, s.note + (Math.random() < 0.5 ? -1 : 1)))
          tone(WAND[s.note], 0.14, 'sine', 0.03)
        }
      }
    }
    const onUp = (e: PointerEvent) => {
      const s = me.strokes.get(e.pointerId)
      if (!s) return
      me.strokes.delete(e.pointerId)
      const d = s.draft
      d.live--
      if (e.type === 'pointercancel') {
        d.paths.splice(d.paths.indexOf(s.path), 1)
        if (!d.paths.length) me.drafts.splice(me.drafts.indexOf(d), 1)
        else if (d.live === 0) d.wait = WAIT
        return
      }
      const p = s.path
      const len = p.cl[p.cl.length - 1] - p.cl[0]
      if (len < TAP_LEN) {
        if (d.paths.length === 1) {
          // Un toucher tout seul : la fusée d'avant, qui part tout de suite
          me.drafts.splice(me.drafts.indexOf(d), 1)
          if (fw === me && me.running && !me.finale) {
            // Un toucher dans le lac lance quand même une fusée, juste au-dessus des toits
            launch(me, p.xy[0], Math.min(p.xy[1], me.shore - 140))
            counted(me)
          }
          return
        }
        // Un toucher sur un dessin qui attend : un point (les yeux d'un bonhomme)
        const x0 = p.xy[0], y0 = p.xy[1], base = d.len
        p.xy = []; p.cl = []; p.dot = true
        for (let i = 0; i <= 10; i++) {
          const a = i / 10 * Math.PI * 2
          p.xy.push(x0 + Math.cos(a) * 5, y0 + Math.sin(a) * 5)
          p.cl.push(base + i * 3.1)
        }
        d.len += 31
      }
      if (d.live === 0) d.wait = WAIT
    }
    arena.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    // Les pastilles : la couleur du prochain dessin
    const pal = $('fwPal')
    pal.onclick = (e: MouseEvent) => {
      const b = (e.target as Element).closest<HTMLElement>('.fw-ink')
      if (!b) return
      me.ink = Number(b.dataset.i) || 0
      pal.querySelectorAll('.fw-ink').forEach(x => x.classList.toggle('sel', x === b))
      tone(880 + me.ink * 60, 0.09, 'sine', 0.08)
    }
    ;($('fwFinal') as HTMLButtonElement).onclick = () => bouquet(me)

    // Après une pause, GameHost relance l'ambiance : pendant le bouquet, c'est la partition qui joue
    const offPause = onPause(p => { if (!p && me.finale && me.running && fw === me) stopMusic(0.05) })

    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __fw: unknown }).__fw = {
        get count() { return me.count },
        get need() { return me.need },
        get drawn() { return me.drawn },
        get encore() { return me.encore },
        get finale() { return me.finale },
        get parts() { return me.p.n },
        /** Le temps du jeu (s) : il ne court pas en pause, et ralentit avec la machine */
        get time() { return me.time },
        get last() { return me.last2 },
        arena: () => { const r = arena.getBoundingClientRect(); return { x: r.left, y: r.top } }
      }
    }

    me.last = performance.now()
    me.raf = requestAnimationFrame(n => loop(me, n))
    return () => {
      if (!me.running) return
      me.running = false
      cancelAnimationFrame(me.raf)
      ro.disconnect()
      offPause()
      arena.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (fw === me) fw = null
      const w = window as unknown as { __fw?: unknown }
      if (w.__fw) delete w.__fw
    }
  }
}
