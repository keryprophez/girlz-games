/* @version 2026-11-26 09:32 */
import { sfx } from './sfx'

/* LES PINCEAUX — sortis de l'Atelier (`games/coloring.ts`, 27/09) pour servir
   aussi au Courrier : les dix pinceaux, leur icône, la palette, les tailles,
   le miroir. Le code est celui de l'Atelier, au tirage au hasard près : un
   trait refait avec le même hasard donne la même image, pixel pour pixel.

   Un `Trait` dit tout ce qu'il faut pour peindre : le contexte, le pinceau
   (ou la gomme), la couleur, l'épaisseur en pixels de feuille, la teinte de
   départ de l'arc-en-ciel et les reflets du miroir. Plusieurs doigts : un
   `Stroke` par doigt. */

export type Brush = 'feutre' | 'crayon' | 'aquarelle' | 'craie' | 'spray' | 'paillettes' | 'neon' | 'arcenciel' | 'coeurs' | 'etoiles'
export const BRUSHES: Brush[] = ['feutre', 'crayon', 'aquarelle', 'craie', 'spray', 'paillettes', 'neon', 'arcenciel', 'coeurs', 'etoiles']
/** Le petit nom sous chaque pinceau. */
export const BRUSH_NAME: Record<Brush, string> = {
  feutre: 'Feutre', crayon: 'Crayon', aquarelle: 'Aquarelle', craie: 'Craie', spray: 'Spray', paillettes: 'Paillettes',
  neon: 'Néon', arcenciel: 'Arc-en-ciel', coeurs: 'Cœurs', etoiles: 'Étoiles'
}
/** Les pinceaux « à grain » : des empreintes posées le long du trait. */
const TEXTURED: Brush[] = ['crayon', 'craie', 'spray', 'paillettes', 'coeurs', 'etoiles']

export const PALETTE = ['#E8414F', '#FF6B81', '#F58FB8', '#FFA94D', '#FFD43B', '#94D82D',
  '#2F9E44', '#4FB8E7', '#1C64C8', '#9C6ADE', '#8B5E3C', '#3A2E25']
/** L'épaisseur des trois tailles, en pixels de feuille (1500 × 1000). */
export const SIZES = [16, 34, 66]

/* ---- Icônes (dessinées ici : elles prennent la couleur choisie) ---- */
export const svgI = (body: string) => `<svg viewBox="0 0 48 48" width="40" height="40">${body}</svg>`
export const star4 = (x: number, y: number, r: number, fill: string) =>
  `<path d="M${x} ${y - r}L${x + r * 0.28} ${y - r * 0.28}L${x + r} ${y}L${x + r * 0.28} ${y + r * 0.28}L${x} ${y + r}L${x - r * 0.28} ${y + r * 0.28}L${x - r} ${y}L${x - r * 0.28} ${y - r * 0.28}Z" fill="${fill}"/>`
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

export const BRUSH_ICON: Record<Brush, (c: string) => string> = {
  feutre: c => svgI(`<path d="M31 5l12 12-15 15-12-12z" fill="#C99457"/><path d="M31 5l12 12-5 5-12-12z" fill="#E8B676"/>
    <path d="M16 20l12 12-4 3c-2 6-8 9-17 9 2-7 1-13 6-17z" fill="${c}"/><path d="M16 20l12 12-3 2-11-11z" fill="#9AA3AD"/>`),
  crayon: c => svgI(`<path d="M9 39l4-12 20-20 8 8-20 20z" fill="${c}"/><path d="M9 39l4-12 8 8z" fill="#F2D1A0"/>
    <path d="M9 39l2-6 4 4z" fill="#45362A"/><path d="M33 7l8 8 2-2a3 3 0 0 0 0-4l-4-4a3 3 0 0 0-4 0z" fill="#FF9CB1"/>`),
  aquarelle: c => svgI(`<circle cx="18" cy="30" r="12" fill="${c}" opacity=".32"/><circle cx="27" cy="27" r="10" fill="${c}" opacity=".32"/>
    <path d="M34 5c4 6 7 10 7 14a7 7 0 0 1-14 0c0-4 3-8 7-14z" fill="${c}" opacity=".9"/>`),
  craie: c => svgI(`<path d="M6 36c8-4 14 2 22-2s10-6 14-4" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round" stroke-dasharray="3 3"/>
    <rect x="22" y="7" width="20" height="10" rx="3" transform="rotate(-30 32 12)" fill="#F4EFE6" stroke="#C8BCAE" stroke-width="2"/>`),
  spray: c => svgI(`<rect x="7" y="18" width="16" height="25" rx="4" fill="#8A96A3"/><rect x="10" y="12" width="10" height="7" rx="2" fill="#5E6873"/>
    ${[[31, 12], [38, 18], [33, 22], [40, 9], [29, 18], [42, 25], [35, 29], [30, 26]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.3" fill="${c}"/>`).join('')}`),
  paillettes: c => svgI(`${star4(17, 17, 11, c)}${star4(33, 30, 9, '#FFC533')}${star4(15, 36, 6, c)}${star4(37, 12, 5, '#FFC533')}`),
  neon: c => svgI(`<path d="M7 36C15 20 29 40 41 13" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round" opacity=".28"/>
    <path d="M7 36C15 20 29 40 41 13" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/>
    <path d="M7 36C15 20 29 40 41 13" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`),
  arcenciel: () => svgI(`<path d="M5 36a19 19 0 0 1 38 0" fill="none" stroke="#E8414F" stroke-width="5"/>
    <path d="M10 36a14 14 0 0 1 28 0" fill="none" stroke="#FFD43B" stroke-width="5"/>
    <path d="M15 36a9 9 0 0 1 18 0" fill="none" stroke="#2F9E44" stroke-width="5"/>
    <path d="M20 36a4 4 0 0 1 8 0" fill="none" stroke="#1C64C8" stroke-width="5"/>`),
  coeurs: c => svgI(`<path d="${heartD(17, 20, 16)}" fill="${c}"/><path d="${heartD(33, 34, 12)}" fill="${c}" opacity=".75"/>`),
  etoiles: c => svgI(`<path d="${starD(18, 19, 13)}" fill="${c}"/><path d="${starD(34, 33, 10)}" fill="${c}" opacity=".75"/>`)
}
export const ERASER_ICON = svgI(`<path d="M6 30L24 12l16 16-12 12H16z" fill="#FF9CB1"/><path d="M6 30l8-8 16 16-2 2H16z" fill="#F4F0EA"/>
    <path d="M16 40h26" stroke="#B9AEA2" stroke-width="3" stroke-linecap="round"/>`)

/* ---- Le miroir : chaque geste est redessiné par ses reflets ---- */
export type Sym = 1 | 2 | 4 | 8
export type Mat = [number, number, number, number, number, number]
export function symMats(sym: Sym, w: number, h: number): Mat[] {
  const id: Mat = [1, 0, 0, 1, 0, 0]
  if (sym === 1) return [id]
  const fx: Mat = [-1, 0, 0, 1, w, 0], fy: Mat = [1, 0, 0, -1, 0, h], fxy: Mat = [-1, 0, 0, -1, w, h]
  if (sym === 2) return [id, fx]
  if (sym === 4) return [id, fx, fy, fxy]
  // La rosace : huit rotations de 45° autour du centre de la feuille
  const cx = w / 2, cy = h / 2
  return Array.from({ length: 8 }, (_, k) => {
    const a = k * Math.PI / 4, c = Math.cos(a), s = Math.sin(a)
    return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy] as Mat
  })
}

/* ---- Un trait ---- */
export interface Stroke { x: number; y: number; mx: number; my: number; run: number; acc: number }
export interface Trait {
  g: CanvasRenderingContext2D
  brush: Brush
  color: string
  /** L'épaisseur, en pixels de feuille (une des `SIZES`). */
  px: number
  /** La gomme (le pinceau est alors ignoré). */
  eraser: boolean
  /** La teinte de départ de l'arc-en-ciel. */
  hue: number
  /** Les reflets du miroir (`symMats`) ; `[[1,0,0,1,0,0]]` sans miroir. */
  mats: Mat[]
}

export const textured = (t: Pick<Trait, 'brush' | 'eraser'>) => !t.eraser && TEXTURED.includes(t.brush)
export const newStroke = (x: number, y: number): Stroke => ({ x, y, mx: x, my: y, run: 0, acc: 0 })

function mirrored(t: Trait, draw: () => void) {
  for (const m of t.mats) { t.g.setTransform(...m); draw() }
  t.g.setTransform(1, 0, 0, 1, 0, 0)
}
function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
/** Une teinte plus claire de la couleur (reflet des paillettes). */
function lighter(hex: string, k = 0.55): string {
  const [r, g, b] = hexRgb(hex)
  return `rgb(${Math.round(r + (255 - r) * k)},${Math.round(g + (255 - g) * k)},${Math.round(b + (255 - b) * k)})`
}
const rainbow = (t: Trait, run: number) => `hsl(${(t.hue + run * 0.35) % 360}, 88%, 56%)`

/** Le style d'un trait continu (feutre, néon, aquarelle, arc-en-ciel, gomme). */
function strokeStyle(t: Trait, run: number) {
  const g = t.g, size = t.px
  g.globalCompositeOperation = t.eraser ? 'destination-out' : 'source-over'
  g.globalAlpha = 1
  g.shadowBlur = 0
  g.shadowColor = 'transparent'
  g.lineCap = 'round'
  g.lineJoin = 'round'
  if (t.eraser) { g.lineWidth = size * 1.6; g.strokeStyle = g.fillStyle = '#000'; return }
  const c = t.brush === 'arcenciel' ? rainbow(t, run) : t.color
  g.strokeStyle = g.fillStyle = c
  g.lineWidth = size
  if (t.brush === 'neon') { g.lineWidth = size * 0.55; g.shadowBlur = size * 0.9; g.shadowColor = c }
  if (t.brush === 'aquarelle') { g.lineWidth = size * 1.5; g.globalAlpha = 0.14; g.shadowBlur = size * 0.5; g.shadowColor = c }
}
function resetStyle(t: Trait) {
  const g = t.g
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  g.shadowBlur = 0
  g.shadowColor = 'transparent'
}

/** Une empreinte d'un pinceau à grain, au point (x, y). */
function grain(t: Trait, x: number, y: number) {
  const g = t.g, size = t.px, c = t.color
  const R = Math.random
  resetStyle(t)
  mirrored(t, () => {
    switch (t.brush) {
      case 'crayon':
        g.fillStyle = c
        for (let k = 0; k < 4; k++) {
          const a = R() * 6.3, r = R() * size * 0.34
          g.globalAlpha = 0.35 + R() * 0.4
          g.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 2.4, 2.4)
        }
        break
      case 'craie':
        g.fillStyle = c
        for (let k = 0; k < 12; k++) {
          const a = R() * 6.3, r = R() * size * 0.5
          g.globalAlpha = 0.45 + R() * 0.45
          g.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 3.4, 3.4)
        }
        break
      case 'spray':
        g.fillStyle = c
        for (let k = 0; k < 18; k++) {
          const a = R() * 6.3, r = Math.sqrt(R()) * size * 1.1
          g.globalAlpha = 0.8
          g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 1.4, 0, 6.3); g.fill()
        }
        break
      case 'paillettes': {
        const cols = [c, lighter(c), lighter(c, 0.85), '#FFE08A']
        for (let k = 0; k < 8; k++) {
          const a = R() * 6.3, r = R() * size * 0.6
          g.globalAlpha = 0.9
          g.fillStyle = cols[(R() * cols.length) | 0]
          g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 1.2 + R() * 1.6, 0, 6.3); g.fill()
        }
        if (R() < 0.22) {
          const s = size * (0.25 + R() * 0.25), sx = x + (R() - 0.5) * size, sy = y + (R() - 0.5) * size
          g.globalAlpha = 1
          g.fillStyle = R() < 0.5 ? '#FFFFFF' : '#FFE08A'
          g.fill(new Path2D(`M${sx} ${sy - s}L${sx + s * 0.28} ${sy - s * 0.28}L${sx + s} ${sy}L${sx + s * 0.28} ${sy + s * 0.28}L${sx} ${sy + s}L${sx - s * 0.28} ${sy + s * 0.28}L${sx - s} ${sy}L${sx - s * 0.28} ${sy - s * 0.28}Z`))
        }
        break
      }
      case 'coeurs':
      case 'etoiles': {
        const s = size * (0.9 + R() * 0.35)
        g.save()
        g.translate(x, y)
        g.rotate((R() - 0.5) * 0.7)
        g.fillStyle = c
        g.globalAlpha = 1
        g.fill(new Path2D(t.brush === 'coeurs' ? heartD(0, 0, s) : starD(0, 0, s * 0.62)))
        g.restore()
        break
      }
    }
  })
  resetStyle(t)
}

/** La touche au moment où le doigt se pose. */
export function dab(t: Trait, x: number, y: number) {
  if (textured(t)) { grain(t, x, y); return }
  const g = t.g
  strokeStyle(t, 0)
  mirrored(t, () => { g.beginPath(); g.arc(x, y, g.lineWidth / 2, 0, Math.PI * 2); g.fill() })
  resetStyle(t)
}

/** Le doigt a bougé jusqu'en (x, y). */
export function segment(t: Trait, s: Stroke, x: number, y: number) {
  const g = t.g
  const len = Math.hypot(x - s.x, y - s.y)
  if (textured(t)) {
    // Des empreintes à intervalle régulier le long du trait
    const size = t.px
    const step = t.brush === 'crayon' ? 2 : t.brush === 'craie' ? size * 0.22 : t.brush === 'spray' ? size * 0.3
      : t.brush === 'paillettes' ? size * 0.28 : size * 1.3
    let d = step - s.acc
    while (d <= len) {
      const k = d / len
      grain(t, s.x + (x - s.x) * k, s.y + (y - s.y) * k)
      d += step
    }
    s.acc = len - (d - step)
  } else {
    const mx = (s.x + x) / 2, my = (s.y + y) / 2
    strokeStyle(t, s.run)
    // Courbe lissée : du milieu précédent au milieu courant, en passant par le point
    mirrored(t, () => { g.beginPath(); g.moveTo(s.mx, s.my); g.quadraticCurveTo(s.x, s.y, mx, my); g.stroke() })
    if (!t.eraser && t.brush === 'neon') {
      // Le cœur blanc du néon
      g.shadowBlur = 0
      g.lineWidth = t.px * 0.2
      g.strokeStyle = 'rgba(255,255,255,.9)'
      mirrored(t, () => { g.beginPath(); g.moveTo(s.mx, s.my); g.quadraticCurveTo(s.x, s.y, mx, my); g.stroke() })
    }
    resetStyle(t)
    s.mx = mx; s.my = my
  }
  // Un petit frottement de feutre tous les 140 px de trait
  if (Math.floor((s.run + len) / 140) > Math.floor(s.run / 140)) {
    const soft = t.eraser ? 0.18 : t.brush === 'spray' ? 0.2 : 0.12
    sfx('cloth', { vol: soft, rate: t.eraser ? 0.8 : t.brush === 'spray' ? 2.2 : 1.5, spread: 0.2 })
  }
  s.run += len
  s.x = x; s.y = y
}

/** Le doigt se lève : la fin du trait lissé, jusqu'au dernier point. */
export function endStroke(t: Trait, s: Stroke) {
  if (textured(t)) return
  const g = t.g
  strokeStyle(t, s.run)
  mirrored(t, () => { g.beginPath(); g.moveTo(s.mx, s.my); g.lineTo(s.x, s.y); g.stroke() })
  resetStyle(t)
}
