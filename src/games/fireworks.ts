import type { GameContext, GameDef } from '../core/types'
import { $, pick, rnd } from '../core/utils'
import { sBoomReal, sPopReal, sWin, tone } from '../core/audio'
import { confetti } from '../core/fx'

/* Feu d'Artifice — tape dans le ciel : une fusée siffle, monte et explose en
   gerbe de couleurs (boule, anneau, cœur, étoile filante…). Zéro échec, pure
   magie. Après quelques lancers, le BOUQUET FINAL illumine tout le ciel. */

const PALETTES = [
  ['#FF9E7A', '#FFD34D', '#FFF3B0'], ['#8FD0F2', '#B9A7F2', '#FFFFFF'],
  ['#7BDD97', '#FFE08A', '#C7F9CC'], ['#FF8FA3', '#FFC2D1', '#FFF0F3'],
  ['#FFD34D', '#FF7B6B', '#B9A7F2'], ['#9BF6FF', '#BDB2FF', '#FFC6FF']
]
const SHAPES = ['burst', 'ring', 'heart', 'star', 'double'] as const

let fw: any = null
let ctx: GameContext

function whistle() {
  // Sifflement de fusée qui monte
  for (let i = 0; i < 6; i++) setTimeout(() => tone(420 + i * 130, 0.07, 'sine', 0.05), i * 55)
}

function explode(x: number, y: number, shape: string, cols: string[], big = false) {
  const P = fw.parts
  const n = big ? 90 : rnd(46, 64)
  sBoomReal()
  setTimeout(() => sPopReal(), rnd(160, 320))
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
  if (shape === 'double') setTimeout(() => fw && fw.running && explode(x + rnd(-40, 40), y + rnd(-30, 10), 'ring', pick(PALETTES)), 260)
}

function launch(tx: number, ty: number, shape?: string) {
  if (!fw || !fw.running) return
  const cols = pick(PALETTES)
  const sh = shape || pick([...SHAPES])
  whistle()
  fw.rockets.push({
    x: tx + rnd(-8, 8), y: fw.h + 10, tx, ty: Math.max(40, ty),
    t: 0, dur: 46 + Math.random() * 12, cols, shape: sh
  })
}

function loop() {
  if (!fw || !fw.running) return
  const c: CanvasRenderingContext2D = fw.c2d
  // Voile léger pour les traînées lumineuses
  c.fillStyle = 'rgba(20,14,44,.22)'
  c.fillRect(0, 0, fw.w, fw.h)

  // Fusées qui montent
  for (let i = fw.rockets.length - 1; i >= 0; i--) {
    const r = fw.rockets[i]
    r.t++
    const k = r.t / r.dur
    const x = r.x + (r.tx - r.x) * k
    const y = fw.h - (fw.h - r.ty) * (1 - Math.pow(1 - k, 2))
    c.fillStyle = '#FFF3B0'
    c.beginPath(); c.arc(x, y, 2.4, 0, 7); c.fill()
    c.fillStyle = 'rgba(255,210,120,.5)'
    c.beginPath(); c.arc(x + rnd(-2, 2), y + 8, 1.6, 0, 7); c.fill()
    if (k >= 1) { fw.rockets.splice(i, 1); explode(r.tx, r.ty, r.shape, r.cols) }
  }
  // Étincelles
  for (let i = fw.parts.length - 1; i >= 0; i--) {
    const p = fw.parts[i]
    p.x += p.vx; p.y += p.vy
    p.vy += 0.028; p.vx *= 0.985; p.vy *= 0.985
    p.life -= p.decay
    if (p.life <= 0) { fw.parts.splice(i, 1); continue }
    c.globalAlpha = p.tw ? p.life * (0.4 + 0.6 * Math.abs(Math.sin(p.life * 24))) : p.life
    c.fillStyle = p.col
    c.beginPath(); c.arc(p.x, p.y, p.r * p.life + 0.6, 0, 7); c.fill()
  }
  c.globalAlpha = 1
  fw.raf = requestAnimationFrame(loop)
}

function bouquet() {
  if (!fw || !fw.running || fw.finale) return
  fw.finale = true
  $('fwFinal').style.display = 'none'
  $('fwHint').textContent = '✨ BOUQUET FINAL ! ✨'
  const N = 10
  for (let i = 0; i < N; i++) {
    setTimeout(() => {
      if (!fw || !fw.running) return
      launch(rnd(fw.w * 0.12, fw.w * 0.88), rnd(fw.h * 0.12, fw.h * 0.5))
    }, i * 420)
  }
  setTimeout(() => {
    if (!fw || !fw.running) return
    explode(fw.w / 2, fw.h * 0.3, 'burst', ['#FFD34D', '#FFFFFF', '#FF9E7A'], true)
    sWin(); confetti()
    setTimeout(() => fw && fw.running && ctx.finish({
      title: 'Quel spectacle !',
      msg: `${ctx.playerName} a illuminé tout le ciel 🎆`,
      stars: 3, starsEarned: 3
    }), 1600)
  }, N * 420 + 500)
}

export const fireworks: GameDef = {
  id: 'fireworks', name: "Feu d'Artifice", icon: '🎆', sq: 'sq-lilac', cat: 'creatif', duel: false,
  subtitle: 'Tape dans le ciel pour lancer tes fusées !',
  mount(c) {
    ctx = c
    const need = c.byTier(8, 10, 12)
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="fwCount">🎆 0</div>
        <button class="chip" id="fwFinal" style="display:none">✨ Bouquet final !</button>
      </div>
      <div class="arena fw-arena" id="fwArena">
        <div class="hint fw-hint" id="fwHint">Tape dans le ciel !</div>
        <canvas id="fwCanvas"></canvas>
        <div class="fw-town">🏠🏡🏠⛪🏠🌲🏡</div>
      </div>`
    const arena = $('fwArena')
    const canvas = $('fwCanvas') as unknown as HTMLCanvasElement
    canvas.width = arena.clientWidth
    canvas.height = arena.clientHeight
    fw = {
      c2d: canvas.getContext('2d'), w: canvas.width, h: canvas.height,
      rockets: [], parts: [], count: 0, finale: false, running: true, raf: 0
    }
    // Fond de nuit initial
    fw.c2d.fillStyle = '#140E2C'
    fw.c2d.fillRect(0, 0, fw.w, fw.h)

    arena.onpointerdown = (e: PointerEvent) => {
      if (!fw || !fw.running || fw.finale) return
      const r = canvas.getBoundingClientRect()
      launch(e.clientX - r.left, e.clientY - r.top)
      fw.count++
      $('fwCount').textContent = `🎆 ${fw.count}`
      if (fw.count === need) {
        $('fwFinal').style.display = ''
        $('fwHint').textContent = 'Encore, ou lance le bouquet final !'
      }
    }
    ;($('fwFinal') as HTMLButtonElement).onclick = bouquet
    loop()
    return () => { if (fw) { fw.running = false; cancelAnimationFrame(fw.raf); fw = null } }
  }
}
