// LA FEUILLE de « Mon dessin prend vie » (18/10, la Ferme à construire) :
// elle dessine son animal, « Fini », il devient peluche dans sa ferme
// (`core/plush3d.ts`). Ses traits sont gardés tels qu'elle les a tracés
// (`DrawStroke`, dans la ferme de chaque fille) : rejoués, ils redonnent le
// même dessin au pixel près — et `core/plush.ts` y lit ses vrais trous de
// contour. Plusieurs doigts dessinent à la fois (un trait par doigt).
import type { Stroke } from '../core/plush'
import type { Vivant } from '../core/vivant'
import { sfx } from '../core/sfx'

/** Un trait : sa couleur, son épaisseur, la gomme, ses points (pixels de la feuille, x, y, x, y…). */
export interface DrawStroke { c: string; w: number; e?: 1; p: number[] }
/** Un animal dessiné, tel qu'on le garde : ses traits, et ce que Claude a dit de lui. */
export interface Drawn { s: DrawStroke[]; v?: Vivant }

/** La feuille, en pixels (le format de Devine mon dessin). */
export const CW = 1024, CH = 800
const PAPER = '#FFFDF8'
const PALETTE = ['#E8414F', '#FF8FC8', '#FFA94D', '#FFD43B', '#94D82D', '#4FB8E7', '#9C6ADE', '#8B5E3C', '#3A2E25']
/** Plus épais que dans Devine mon dessin : un trait trop fin ferait un boudin maigre. */
const SIZES = [10, 18, 30]
const MAX_STROKES = 220, MAX_POINTS = 14000

/** Le bout de trait qui finit au point `i` (d'un milieu au suivant : pas de coins). Le même en direct et rejoué. */
function paintSeg(g: CanvasRenderingContext2D, st: DrawStroke, i: number) {
  const p = st.p
  g.lineCap = 'round'; g.lineJoin = 'round'
  g.globalCompositeOperation = st.e ? 'destination-out' : 'source-over'
  g.strokeStyle = st.c; g.fillStyle = st.c; g.lineWidth = st.w
  if (i === 0) { g.beginPath(); g.arc(p[0], p[1], st.w / 2, 0, Math.PI * 2); g.fill() }
  else {
    const [ax, ay] = i === 1 ? [p[0], p[1]] : [(p[2 * i - 4] + p[2 * i - 2]) / 2, (p[2 * i - 3] + p[2 * i - 1]) / 2]
    const bx = (p[2 * i - 2] + p[2 * i]) / 2, by = (p[2 * i - 1] + p[2 * i + 1]) / 2
    g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(p[2 * i - 2], p[2 * i - 1], bx, by); g.stroke()
  }
  g.globalCompositeOperation = 'source-over'
}

/** Ses traits rejoués sur une feuille transparente. */
export function renderStrokes(strokes: DrawStroke[], cv?: HTMLCanvasElement): HTMLCanvasElement {
  const c = cv ?? Object.assign(document.createElement('canvas'), { width: CW, height: CH })
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.clearRect(0, 0, CW, CH)
  for (const st of strokes) for (let i = 0; i < st.p.length / 2; i++) paintSeg(g, st, i)
  return c
}

/** Ses traits pour la peluche (sans la gomme). */
export const plushStrokes = (strokes: DrawStroke[]): Stroke[] =>
  strokes.filter(st => !st.e).map(st => ({ width: st.w, pts: Array.from({ length: st.p.length / 2 }, (_, i) => [st.p[2 * i], st.p[2 * i + 1]] as [number, number]) }))

/** Le dessin tel qu'on le montre à Claude : réduit (512 px de large), sur le papier, en PNG base64. */
export function exportPng(cv: HTMLCanvasElement): string {
  const c = Object.assign(document.createElement('canvas'), { width: 512, height: Math.round(512 * CH / CW) })
  const g = c.getContext('2d')!
  g.fillStyle = PAPER; g.fillRect(0, 0, c.width, c.height)
  g.drawImage(cv, 0, 0, c.width, c.height)
  return c.toDataURL('image/png').split(',')[1]
}

const svg = (inner: string, s = 40) => `<svg viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true">${inner}</svg>`
export const DRAW_ICONS = {
  /** La tuile du tiroir : un crayon qui trace un petit animal. */
  pen: svg(`<path d="M9 33c3-6 9-8 14-6s9 1 11-3" fill="none" stroke="#FF8FC8" stroke-width="4" stroke-linecap="round"/><circle cx="14" cy="27" r="1.8" fill="#3A2E25"/>
    <path d="M30 6l10 10-17 17-11 2 2-11z" fill="#FFD43B"/><path d="M30 6l10 10-4 4-10-10z" fill="#E8414F"/><path d="M14 24l10 10-11 2z" fill="#F4D7B0"/><path d="M12 33l1 3 3-1z" fill="#3A2E25"/>`, 64),
  eraser: svg(`<path d="M6 30L24 12l16 16-12 12H16z" fill="#FF9CB1"/><path d="M6 30l8-8 16 16-2 2H16z" fill="#F4F0EA"/><path d="M16 40h26" stroke="#B9AEA2" stroke-width="3" stroke-linecap="round"/>`, 32),
  trash: svg(`<path d="M12 15h24l-2 25a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill="#E8574C"/><rect x="8" y="9" width="32" height="6" rx="2.5" fill="#C8453B"/><rect x="19" y="5" width="10" height="6" rx="2.5" fill="#C8453B"/><path d="M19 21v16M24 21v16M29 21v16" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".85"/>`, 32),
  /** « Fini » : la baguette qui donne vie (des étincelles). */
  done: svg(`<path d="M8 40 30 18" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M33 5c1 5 3 7 8 8-5 1-7 3-8 8-1-5-3-7-8-8 5-1 7-3 8-8z" fill="#FFE98A"/><circle cx="40" cy="27" r="2.4" fill="#fff"/><circle cx="21" cy="9" r="2" fill="#fff"/>`, 56),
  close: svg(`<path d="M14 14l20 20M34 14 14 34" stroke="#45362A" stroke-width="5" stroke-linecap="round"/>`, 30)
}

export interface Sheet {
  readonly open: boolean
  show(): void
  hide(): void
  /** Le geste de la main : tracer sur la feuille vide, puis toucher « Fini ». */
  hand(): { trace: { x: number; y: number }[] } | { tap: Element } | null
  /** « Fini » refusé (rien de dessiné, ou rien qui fasse une peluche) : il tremble. */
  shake(): void
  dispose(): void
}

/**
 * La feuille, posée dans `host` (la ferme reste derrière, voilée). `done`
 * reçoit ses traits et la feuille (et rend `false` si rien n'en fait une
 * peluche : « Fini » tremble) ; la feuille se vide et se cache après.
 */
export function createSheet(host: HTMLElement, o: { done: (strokes: DrawStroke[], cv: HTMLCanvasElement) => boolean; opened: () => void; closed: () => void }): Sheet {
  const el = document.createElement('div')
  el.className = 'fb-draw'
  el.hidden = true
  el.innerHTML = `
    <div class="fb-dpaper"><canvas width="${CW}" height="${CH}"></canvas>
      <span class="tool-item fb-ddone"><button aria-label="Fini">${DRAW_ICONS.done}</button><i class="tool-cap">Fini</i></span>
    </div>
    <div class="fb-dtray">
      ${PALETTE.map((p, i) => `<button class="at-color${i === 1 ? ' sel' : ''}" data-c="${p}" style="background:${p}" aria-label="Couleur"></button>`).join('')}
      <span class="fb-dsizes">${SIZES.map((z, i) => `<button class="at-size${i === 1 ? ' sel' : ''}" data-s="${z}" aria-label="Taille"><i style="width:${8 + i * 8}px;height:${8 + i * 8}px;background:#45362A"></i></button>`).join('')}</span>
      <span class="tool-item"><button class="at-tool fb-deraser" aria-label="Gomme">${DRAW_ICONS.eraser}</button><i class="tool-cap">Gomme</i></span>
      <span class="tool-item"><button class="at-tool fb-dclear" aria-label="Tout effacer">${DRAW_ICONS.trash}</button><i class="tool-cap">Effacer</i></span>
    </div>
    <span class="tool-item fb-dclose"><button class="sn-tool" aria-label="Fermer">${DRAW_ICONS.close}</button><i class="tool-cap">Fermer</i></span>`
  host.appendChild(el)
  const cv = el.querySelector('canvas')!
  const g = cv.getContext('2d', { willReadFrequently: true })!
  const doneBtn = el.querySelector<HTMLElement>('.fb-ddone')!
  let strokes: DrawStroke[] = []
  let color = PALETTE[1], size = SIZES[1], eraser = false, points = 0
  const live = new Map<number, DrawStroke>()

  const sync = () => doneBtn.classList.toggle('ready', strokes.some(st => !st.e))
  const at = (e: PointerEvent) => {
    const r = cv.getBoundingClientRect()
    return [Math.round((e.clientX - r.left) / r.width * CW), Math.round((e.clientY - r.top) / r.height * CH)]
  }
  const down = (e: PointerEvent) => {
    if (strokes.length >= MAX_STROKES || points >= MAX_POINTS) return
    e.preventDefault()
    try { cv.setPointerCapture(e.pointerId) } catch { /* déjà pris */ }
    const [x, y] = at(e)
    const st: DrawStroke = { c: color, w: eraser ? SIZES[2] * 1.6 : size, p: [x, y], ...(eraser ? { e: 1 as const } : {}) }
    strokes.push(st); live.set(e.pointerId, st); points++
    paintSeg(g, st, 0)
    sync()
  }
  const move = (e: PointerEvent) => {
    const st = live.get(e.pointerId)
    if (!st || points >= MAX_POINTS) return
    const [x, y] = at(e), n = st.p.length
    if (Math.hypot(x - st.p[n - 2], y - st.p[n - 1]) < 3) return
    st.p.push(x, y); points++
    paintSeg(g, st, st.p.length / 2 - 1)
  }
  const up = (e: PointerEvent) => { live.delete(e.pointerId) }
  cv.addEventListener('pointerdown', down)
  cv.addEventListener('pointermove', move)
  cv.addEventListener('pointerup', up)
  cv.addEventListener('pointercancel', up)

  const clear = () => { strokes = []; points = 0; live.clear(); g.clearRect(0, 0, CW, CH); sync() }
  // La feuille s'envole, puis se cache ; rouverte avant (380 ms), ce minuteur ne doit pas la vider ni la cacher
  let gone = 0
  const hide = () => {
    if (el.hidden || el.classList.contains('out')) return
    el.classList.add('out')
    gone = window.setTimeout(() => { gone = 0; el.hidden = true; el.classList.remove('out'); clear() }, 380)
  }
  const shake = () => { doneBtn.classList.remove('shake'); void doneBtn.offsetWidth; doneBtn.classList.add('shake'); sfx('tick', { vol: 0.3 }) }
  el.addEventListener('click', e => {
    const t = e.target as HTMLElement
    const c = t.closest<HTMLElement>('.at-color')
    if (c?.dataset.c) {
      color = c.dataset.c; eraser = false
      el.querySelectorAll('.at-color').forEach(b => b.classList.toggle('sel', b === c))
      el.querySelector('.fb-deraser')!.classList.remove('sel')
      sfx('select', { vol: 0.4 }); return
    }
    const z = t.closest<HTMLElement>('.at-size')
    if (z?.dataset.s) {
      size = Number(z.dataset.s); eraser = false
      el.querySelectorAll('.at-size').forEach(b => b.classList.toggle('sel', b === z))
      el.querySelector('.fb-deraser')!.classList.remove('sel')
      sfx('select', { vol: 0.4 }); return
    }
    if (t.closest('.fb-deraser')) { eraser = !eraser; el.querySelector('.fb-deraser')!.classList.toggle('sel', eraser); sfx('switch', { vol: 0.4 }); return }
    if (t.closest('.fb-dclear')) { if (strokes.length) { clear(); sfx('whoosh', { vol: 0.4 }) } return }
    if (t.closest('.fb-ddone')) {
      if (!strokes.some(st => !st.e)) { shake(); return }
      if (o.done(strokes, cv)) hide()
      else shake()
      return
    }
    if (t.closest('.fb-dclose')) { hide(); o.closed(); sfx('close', { vol: 0.4 }) }
  })

  return {
    get open() { return !el.hidden },
    show() { clearTimeout(gone); gone = 0; clear(); el.hidden = false; el.classList.remove('out'); o.opened(); sfx('open', { vol: 0.4 }) },
    hide,
    shake,
    hand() {
      if (el.hidden) return null
      if (strokes.some(st => !st.e)) return { tap: doneBtn }
      // Un cœur, tracé au milieu de la feuille
      const r = cv.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * 0.5, k = r.height * 0.022
      const pts: { x: number; y: number }[] = []
      for (let i = 0; i <= 24; i++) {
        const a = i / 24 * Math.PI * 2
        pts.push({ x: cx + 16 * Math.sin(a) ** 3 * k, y: cy - (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * k })
      }
      return { trace: pts }
    },
    dispose() { clearTimeout(gone); el.remove() }
  }
}
