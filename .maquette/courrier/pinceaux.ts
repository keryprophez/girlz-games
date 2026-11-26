// Les pinceaux de l'Atelier (src/games/coloring.ts), recopiés ici sans le miroir ni le pot : dans le jeu, ils
// sortiront dans un module commun aux deux.
import { sfx } from '../../src/core/sfx'

export type Brush = 'feutre' | 'crayon' | 'aquarelle' | 'craie' | 'spray' | 'paillettes' | 'neon' | 'arcenciel' | 'coeurs' | 'etoiles'
export const BRUSHES: Brush[] = ['feutre', 'crayon', 'aquarelle', 'craie', 'spray', 'paillettes', 'neon', 'arcenciel', 'coeurs', 'etoiles']
export const BRUSH_NAME: Record<Brush, string> = {
  feutre: 'Feutre', crayon: 'Crayon', aquarelle: 'Aquarelle', craie: 'Craie', spray: 'Spray', paillettes: 'Paillettes',
  neon: 'Néon', arcenciel: 'Arc-en-ciel', coeurs: 'Cœurs', etoiles: 'Étoiles'
}
const TEXTURED: Brush[] = ['crayon', 'craie', 'spray', 'paillettes', 'coeurs', 'etoiles']
export const PALETTE = ['#E8414F', '#FF6B81', '#F58FB8', '#FFA94D', '#FFD43B', '#94D82D', '#2F9E44', '#4FB8E7', '#1C64C8', '#9C6ADE', '#8B5E3C', '#3A2E25']
export const SIZES = [16, 34, 66]

export const heartD = (x: number, y: number, s: number) =>
  `M${x} ${y + s * 0.35}C${x - s * 0.9} ${y - s * 0.25} ${x - s * 0.45} ${y - s * 0.95} ${x} ${y - s * 0.45}C${x + s * 0.45} ${y - s * 0.95} ${x + s * 0.9} ${y - s * 0.25} ${x} ${y + s * 0.35}Z`
export const starD = (x: number, y: number, r: number) => {
  let d = ''
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r
    d += `${k ? 'L' : 'M'}${(x + Math.cos(a) * rr).toFixed(1)} ${(y + Math.sin(a) * rr).toFixed(1)}`
  }
  return d + 'Z'
}
const svgI = (body: string) => `<svg viewBox="0 0 48 48" width="36" height="36">${body}</svg>`
const star4 = (x: number, y: number, r: number, fill: string) =>
  `<path d="M${x} ${y - r}L${x + r * 0.28} ${y - r * 0.28}L${x + r} ${y}L${x + r * 0.28} ${y + r * 0.28}L${x} ${y + r}L${x - r * 0.28} ${y + r * 0.28}L${x - r} ${y}L${x - r * 0.28} ${y - r * 0.28}Z" fill="${fill}"/>`
export const BRUSH_ICON: Record<Brush, (c: string) => string> = {
  feutre: c => svgI(`<path d="M31 5l12 12-15 15-12-12z" fill="#C99457"/><path d="M31 5l12 12-5 5-12-12z" fill="#E8B676"/><path d="M16 20l12 12-4 3c-2 6-8 9-17 9 2-7 1-13 6-17z" fill="${c}"/><path d="M16 20l12 12-3 2-11-11z" fill="#9AA3AD"/>`),
  crayon: c => svgI(`<path d="M9 39l4-12 20-20 8 8-20 20z" fill="${c}"/><path d="M9 39l4-12 8 8z" fill="#F2D1A0"/><path d="M9 39l2-6 4 4z" fill="#45362A"/><path d="M33 7l8 8 2-2a3 3 0 0 0 0-4l-4-4a3 3 0 0 0-4 0z" fill="#FF9CB1"/>`),
  aquarelle: c => svgI(`<circle cx="18" cy="30" r="12" fill="${c}" opacity=".32"/><circle cx="27" cy="27" r="10" fill="${c}" opacity=".32"/><path d="M34 5c4 6 7 10 7 14a7 7 0 0 1-14 0c0-4 3-8 7-14z" fill="${c}" opacity=".9"/>`),
  craie: c => svgI(`<path d="M6 36c8-4 14 2 22-2s10-6 14-4" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round" stroke-dasharray="3 3"/><rect x="22" y="7" width="20" height="10" rx="3" transform="rotate(-30 32 12)" fill="#F4EFE6" stroke="#C8BCAE" stroke-width="2"/>`),
  spray: c => svgI(`<rect x="7" y="18" width="16" height="25" rx="4" fill="#8A96A3"/><rect x="10" y="12" width="10" height="7" rx="2" fill="#5E6873"/>${[[31, 12], [38, 18], [33, 22], [40, 9], [29, 18], [42, 25], [35, 29], [30, 26]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.3" fill="${c}"/>`).join('')}`),
  paillettes: c => svgI(`${star4(17, 17, 11, c)}${star4(33, 30, 9, '#FFC533')}${star4(15, 36, 6, c)}${star4(37, 12, 5, '#FFC533')}`),
  neon: c => svgI(`<path d="M7 36C15 20 29 40 41 13" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round" opacity=".28"/><path d="M7 36C15 20 29 40 41 13" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/><path d="M7 36C15 20 29 40 41 13" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`),
  arcenciel: () => svgI(`<path d="M5 36a19 19 0 0 1 38 0" fill="none" stroke="#E8414F" stroke-width="5"/><path d="M10 36a14 14 0 0 1 28 0" fill="none" stroke="#FFD43B" stroke-width="5"/><path d="M15 36a9 9 0 0 1 18 0" fill="none" stroke="#2F9E44" stroke-width="5"/><path d="M20 36a4 4 0 0 1 8 0" fill="none" stroke="#1C64C8" stroke-width="5"/>`),
  coeurs: c => svgI(`<path d="${heartD(17, 20, 16)}" fill="${c}"/><path d="${heartD(33, 34, 12)}" fill="${c}" opacity=".75"/>`),
  etoiles: c => svgI(`<path d="${starD(18, 19, 13)}" fill="${c}"/><path d="${starD(34, 33, 10)}" fill="${c}" opacity=".75"/>`)
}
export const ERASER_ICON = svgI('<path d="M6 30L24 12l16 16-12 12H16z" fill="#FF9CB1"/><path d="M6 30l8-8 16 16-2 2H16z" fill="#F4F0EA"/><path d="M16 40h26" stroke="#B9AEA2" stroke-width="3" stroke-linecap="round"/>')

const rgb = (h: string): [number, number, number] => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
const lighter = (hex: string, k = 0.55) => `rgb(${rgb(hex).map(v => Math.round(v + (255 - v) * k)).join(',')})`

interface Stroke { x: number; y: number; mx: number; my: number; run: number; acc: number }

/** Un canvas qu'on peint au doigt (plusieurs doigts : un trait chacun). */
export class Peintre {
  brush: Brush = 'feutre'
  color = PALETTE[8]
  size = 1
  eraser = false
  private hue = Math.random() * 360
  private strokes = new Map<number, Stroke>()
  readonly g: CanvasRenderingContext2D
  constructor(readonly cv: HTMLCanvasElement, private o: { scale?: number; before?: () => void; after?: () => void } = {}) {
    this.g = cv.getContext('2d')!
  }
  /** Branche les doigts sur `el` ; `on` dit si on peint en ce moment. */
  listen(el: HTMLElement, on: () => boolean) {
    const at = (e: PointerEvent) => {
      const r = this.cv.getBoundingClientRect()
      return [(e.clientX - r.left) / r.width * this.cv.width, (e.clientY - r.top) / r.height * this.cv.height] as const
    }
    el.addEventListener('pointerdown', e => {
      if (!on()) return
      if (!this.strokes.size) this.o.before?.()
      const [x, y] = at(e)
      try { el.setPointerCapture(e.pointerId) } catch { /* doigt déjà levé */ }
      const s = { x, y, mx: x, my: y, run: 0, acc: 0 }
      this.strokes.set(e.pointerId, s)
      this.dab(x, y)
    })
    el.addEventListener('pointermove', e => {
      const s = this.strokes.get(e.pointerId)
      if (!s) return
      const all = e.getCoalescedEvents?.() ?? []
      for (const c of all.length ? all : [e]) { const [x, y] = at(c); this.segment(s, x, y) }
    })
    const up = (e: PointerEvent) => { if (this.strokes.delete(e.pointerId) && !this.strokes.size) this.o.after?.() }
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }
  private get px() { return SIZES[this.size] * (this.o.scale ?? 1) }
  private get textured() { return !this.eraser && TEXTURED.includes(this.brush) }
  private reset() { const g = this.g; g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.shadowBlur = 0; g.shadowColor = 'transparent' }
  private style(run: number) {
    const g = this.g, size = this.px
    this.reset()
    g.lineCap = g.lineJoin = 'round'
    if (this.eraser) { g.globalCompositeOperation = 'destination-out'; g.lineWidth = size * 1.6; g.strokeStyle = g.fillStyle = '#000'; return }
    const c = this.brush === 'arcenciel' ? `hsl(${(this.hue + run * 0.35) % 360}, 88%, 56%)` : this.color
    g.strokeStyle = g.fillStyle = c
    g.lineWidth = size
    if (this.brush === 'neon') { g.lineWidth = size * 0.55; g.shadowBlur = size * 0.9; g.shadowColor = c }
    if (this.brush === 'aquarelle') { g.lineWidth = size * 1.5; g.globalAlpha = 0.14; g.shadowBlur = size * 0.5; g.shadowColor = c }
  }
  private grain(x: number, y: number) {
    const g = this.g, size = this.px, c = this.color, R = Math.random
    this.reset()
    const dots = (n: number, rad: number, px: number, a0: number, a1: number) => {
      g.fillStyle = c
      for (let k = 0; k < n; k++) { const a = R() * 6.3, r = R() * size * rad; g.globalAlpha = a0 + R() * a1; g.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, px, px) }
    }
    if (this.brush === 'crayon') dots(4, 0.34, 2.4, 0.35, 0.4)
    else if (this.brush === 'craie') dots(12, 0.5, 3.4, 0.45, 0.45)
    else if (this.brush === 'spray') {
      g.fillStyle = c; g.globalAlpha = 0.8
      for (let k = 0; k < 18; k++) { const a = R() * 6.3, r = Math.sqrt(R()) * size * 1.1; g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 1.4, 0, 6.3); g.fill() }
    } else if (this.brush === 'paillettes') {
      const cols = [c, lighter(c), lighter(c, 0.85), '#FFE08A']
      g.globalAlpha = 0.9
      for (let k = 0; k < 8; k++) { const a = R() * 6.3, r = R() * size * 0.6; g.fillStyle = cols[(R() * 4) | 0]; g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 1.2 + R() * 1.6, 0, 6.3); g.fill() }
      if (R() < 0.22) {
        const s = size * (0.25 + R() * 0.25), a = x + (R() - 0.5) * size, b = y + (R() - 0.5) * size
        g.globalAlpha = 1; g.fillStyle = R() < 0.5 ? '#FFFFFF' : '#FFE08A'
        g.fill(new Path2D(`M${a} ${b - s}L${a + s * 0.28} ${b - s * 0.28}L${a + s} ${b}L${a + s * 0.28} ${b + s * 0.28}L${a} ${b + s}L${a - s * 0.28} ${b + s * 0.28}L${a - s} ${b}L${a - s * 0.28} ${b - s * 0.28}Z`))
      }
    } else {
      const s = size * (0.9 + R() * 0.35)
      g.save(); g.translate(x, y); g.rotate((R() - 0.5) * 0.7); g.fillStyle = c
      g.fill(new Path2D(this.brush === 'coeurs' ? heartD(0, 0, s) : starD(0, 0, s * 0.62)))
      g.restore()
    }
    this.reset()
  }
  private dab(x: number, y: number) {
    if (this.textured) { this.grain(x, y); return }
    this.style(0)
    this.g.beginPath(); this.g.arc(x, y, this.g.lineWidth / 2, 0, 6.3); this.g.fill()
    this.reset()
  }
  private segment(s: Stroke, x: number, y: number) {
    const g = this.g, len = Math.hypot(x - s.x, y - s.y), size = this.px
    if (this.textured) {
      const step = this.brush === 'crayon' ? 2 : this.brush === 'craie' ? size * 0.22 : this.brush === 'spray' ? size * 0.3 : this.brush === 'paillettes' ? size * 0.28 : size * 1.3
      let d = step - s.acc
      while (d <= len) { const t = d / len; this.grain(s.x + (x - s.x) * t, s.y + (y - s.y) * t); d += step }
      s.acc = len - (d - step)
    } else {
      const mx = (s.x + x) / 2, my = (s.y + y) / 2
      this.style(s.run)
      const trace = () => { g.beginPath(); g.moveTo(s.mx, s.my); g.quadraticCurveTo(s.x, s.y, mx, my); g.stroke() }
      trace()
      if (!this.eraser && this.brush === 'neon') { g.shadowBlur = 0; g.lineWidth = size * 0.2; g.strokeStyle = 'rgba(255,255,255,.9)'; trace() }
      this.reset()
      s.mx = mx; s.my = my
    }
    if (Math.floor((s.run + len) / 140) > Math.floor(s.run / 140)) sfx('cloth', { vol: 0.12, rate: this.eraser ? 0.8 : 1.5, spread: 0.2 })
    s.run += len; s.x = x; s.y = y
  }
}
