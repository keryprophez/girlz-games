import type { GameContext, GameDef } from '../core/types'
import { isPaused } from '../core/session'
import { $, pick, rnd } from '../core/utils'
import { sBoomReal, sPopReal, tone } from '../core/audio'
import { confetti } from '../core/fx'
import { ICON } from '../core/icons'

/* Feu d'Artifice — tape dans le ciel : une fusée siffle, monte et explose en
   gerbe de couleurs (boule, anneau, cœur, étoile filante…). Zéro échec, pure
   magie. Après quelques lancers, le BOUQUET FINAL illumine tout le ciel.

   Un vrai décor depuis le 23/09 (un écran noir vide au départ) : trois
   calques. Derrière, le ciel de nuit en dégradé, les étoiles, la lune et
   des collines au loin ; au milieu, les fusées ; devant, la ferme (grange,
   silo, moulin) et le village (maisons, clocher, sapins) en silhouette au
   bord d'un lac, fenêtres allumées. Chaque étincelle se REFLÈTE dans le
   lac, en tremblant sur l'eau. */

const PALETTES = [
  ['#FF9E7A', '#FFD34D', '#FFF3B0'], ['#8FD0F2', '#B9A7F2', '#FFFFFF'],
  ['#7BDD97', '#FFE08A', '#C7F9CC'], ['#FF8FA3', '#FFC2D1', '#FFF0F3'],
  ['#FFD34D', '#FF7B6B', '#B9A7F2'], ['#9BF6FF', '#BDB2FF', '#FFC6FF']
]
const SHAPES = ['burst', 'ring', 'heart', 'star', 'double'] as const

interface Rocket { x: number; y: number; tx: number; ty: number; t: number; dur: number; cols: string[]; shape: string }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; decay: number; r: number; col: string; tw: boolean }
interface State {
  c2d: CanvasRenderingContext2D
  w: number
  h: number
  /** Le bord du lac : au-dessus le ciel, en dessous l'eau et ses reflets */
  shore: number
  /** Le reflet est tassé : hauteur du lac / hauteur du ciel */
  squash: number
  t: number
  rockets: Rocket[]
  parts: Spark[]
  count: number
  finale: boolean
  running: boolean
  raf: number
}

let fw: State | null = null
let ctx: GameContext

function whistle() {
  // Sifflement de fusée qui monte — programmé sur l'horloge AUDIO : pas un
  // seul timer qui survivrait au démontage
  for (let i = 0; i < 6; i++) tone(420 + i * 130, 0.07, 'sine', 0.05, i * 0.055)
}

function explode(x: number, y: number, shape: string, cols: string[], big = false) {
  if (!fw) return
  const P = fw.parts
  const n = big ? 90 : rnd(46, 64)
  sBoomReal()
  sPopReal(rnd(160, 320) / 1000)
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
    P.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (shape === 'heart' ? 0.4 : 0),
      life: 1, decay: 0.008 + Math.random() * 0.008,
      r: big ? 3.2 : 2.2 + Math.random() * 1.6,
      col: pick(cols), tw: Math.random() < 0.3
    })
  }
  if (shape === 'double') ctx.after(260, () => { if (fw && fw.running) explode(x + rnd(-40, 40), y + rnd(-30, 10), 'ring', pick(PALETTES)) })
}

function launch(tx: number, ty: number, shape?: string) {
  if (!fw || !fw.running) return
  const cols = pick(PALETTES)
  const sh = shape || pick([...SHAPES])
  whistle()
  fw.rockets.push({
    x: tx + rnd(-8, 8), y: fw.shore, tx, ty: Math.max(40, ty),
    t: 0, dur: 46 + Math.random() * 12, cols, shape: sh
  })
}

function loop() {
  if (!fw || !fw.running) return
  // En pause (onglet caché, minuteur parental) le ciel se fige
  if (isPaused()) { fw.raf = requestAnimationFrame(loop); return }
  const c = fw.c2d
  fw.t++
  // Traînées lumineuses : on efface doucement vers le transparent (le ciel
  // et le village sont sur leurs propres calques)
  c.globalCompositeOperation = 'destination-out'
  c.fillStyle = 'rgba(0,0,0,.2)'
  c.fillRect(0, 0, fw.w, fw.h)
  c.globalCompositeOperation = 'lighter'
  const shore = fw.shore
  /** Un point lumineux et son reflet dans le lac, qui tremble sur l'eau */
  const dot = (x: number, y: number, r: number, col: string, a: number) => {
    c.globalAlpha = a
    c.fillStyle = col
    c.beginPath(); c.arc(x, y, r, 0, 7); c.fill()
    // Le lac est plus court que le ciel : le reflet est tassé à sa hauteur
    const ry = shore + (shore - y) * fw!.squash
    if (ry < fw!.h && y < shore) {
      c.globalAlpha = a * 0.32
      c.beginPath(); c.arc(x + Math.sin(ry * 0.09 + fw!.t * 0.12) * 4, ry, r * 0.9, 0, 7); c.fill()
    }
  }

  // Fusées qui montent
  for (let i = fw.rockets.length - 1; i >= 0; i--) {
    const r = fw.rockets[i]
    r.t++
    const k = r.t / r.dur
    const x = r.x + (r.tx - r.x) * k
    const y = shore - (shore - r.ty) * (1 - Math.pow(1 - k, 2))
    dot(x, y, 2.4, '#FFF3B0', 1)
    dot(x + rnd(-2, 2), y + 8, 1.6, 'rgba(255,210,120,.5)', 1)
    if (k >= 1) { fw.rockets.splice(i, 1); explode(r.tx, r.ty, r.shape, r.cols); if (!fw) return }
  }
  // Étincelles
  for (let i = fw.parts.length - 1; i >= 0; i--) {
    const p = fw.parts[i]
    p.x += p.vx; p.y += p.vy
    p.vy += 0.028; p.vx *= 0.985; p.vy *= 0.985
    p.life -= p.decay
    if (p.life <= 0 || p.y > shore) { fw.parts.splice(i, 1); continue }
    const a = p.tw ? p.life * (0.4 + 0.6 * Math.abs(Math.sin(p.life * 24))) : p.life
    dot(p.x, p.y, p.r * p.life + 0.6, p.col, a)
  }
  c.globalAlpha = 1
  c.globalCompositeOperation = 'source-over'
  fw.raf = requestAnimationFrame(loop)
}

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

function bouquet() {
  if (!fw || !fw.running || fw.finale) return
  fw.finale = true
  $('fwFinal').style.display = 'none'
  const N = 10
  for (let i = 0; i < N; i++) {
    ctx.after(i * 420, () => {
      if (!fw || !fw.running) return
      launch(rnd(fw.w * 0.12, fw.w * 0.88), rnd(fw.h * 0.12, fw.h * 0.5))
    })
  }
  ctx.after(N * 420 + 500, () => {
    if (!fw || !fw.running) return
    explode(fw.w / 2, fw.h * 0.3, 'burst', ['#FFD34D', '#FFFFFF', '#FF9E7A'], true)
    confetti()
    ctx.after(1600, () => {
      if (!fw || !fw.running) return
      ctx.finish({
        title: 'Quel spectacle !',
        msg: `Tu as illuminé tout le ciel`,
        stars: 3
      })
    })
  })
}

export const fireworks: GameDef = {
  id: 'fireworks', name: "Feu d'Artifice", icon: '🎆', sq: 'sq-lilac', cat: 'creatif', music: 'night',
  subtitle: 'Tape dans le ciel pour lancer tes fusées !',
  mount(c) {
    ctx = c
    const need = c.byTier(8, 10, 12)
    c.root.innerHTML = `
      <div class="arena fw-arena" id="fwArena">
        <canvas id="fwSky" class="fw-layer"></canvas>
        <canvas id="fwCanvas" class="fw-layer"></canvas>
        <canvas id="fwShore" class="fw-layer"></canvas>
        <div class="tap-hint" id="fwHint">${ICON.tap}</div>
        <div class="tq-side">
          <div class="tq-moves" id="fwCount">${ICON.bolt}<span>0</span></div>
          <button class="sn-tool go fw-final" id="fwFinal" style="display:none" aria-label="Bouquet final">${ICON.star}</button>
        </div>
      </div>`
    const arena = $('fwArena')
    const canvas = $('fwCanvas') as unknown as HTMLCanvasElement
    // Net sur tablette : les calques ont la densité de l'écran (plafonnée), le dessin reste en px CSS
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const W = arena.clientWidth, H = arena.clientHeight
    const shore = Math.round(H * 0.78)
    const layer = (id: string) => {
      const cv = $(id) as unknown as HTMLCanvasElement
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr)
      cv.style.width = W + 'px'; cv.style.height = H + 'px'
      const g = cv.getContext('2d')!
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      return g
    }
    drawSky(layer('fwSky'), W, H, shore)
    drawShore(layer('fwShore'), W, H, shore)
    const c2d = layer('fwCanvas')
    const me: State = {
      c2d, w: W, h: H, shore, squash: (H - shore) / shore, t: 0,
      rockets: [], parts: [], count: 0, finale: false, running: true, raf: 0
    }
    fw = me
    void canvas

    arena.onpointerdown = (e: PointerEvent) => {
      if (fw !== me || !me.running || me.finale) return
      const r = arena.getBoundingClientRect()
      // Un toucher dans le lac lance quand même une fusée, juste au-dessus des toits
      launch(e.clientX - r.left, Math.min(e.clientY - r.top, me.shore - 140))
      me.count++
      $('fwHint').classList.add('off')
      $('fwCount').innerHTML = `${ICON.bolt}<span>${me.count}</span>`
      if (me.count === need) $('fwFinal').style.display = ''
    }
    ;($('fwFinal') as HTMLButtonElement).onclick = bouquet
    loop()
    return () => { me.running = false; cancelAnimationFrame(me.raf); if (fw === me) fw = null }
  }
}
