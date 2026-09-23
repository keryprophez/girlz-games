import type { GameContext, GameDef } from '../core/types'
import { useFerme } from '../core/store'
import { sfx, preloadSfx } from '../core/sfx'
import { ICON } from '../core/icons'
import { critterPortraits } from '../core/portraits'
import { FARM, type CritterKind } from '../core/critters'

/* L'Atelier — remplace le Coloriage (23/09). Une vraie feuille de dessin au
   doigt : pinceau (trois tailles), pinceau arc-en-ciel, pot de peinture qui
   se déverse en rond depuis le doigt, gomme, tampons des animaux de la ferme
   (les mêmes personnages 3D que Tape-Trous, rendus en images), annuler.
   Quatre feuilles : une page blanche et trois dessins à colorier (papillon,
   fleur, maison). Chaque feuille est GARDÉE (IndexedDB, par joueuse) : on
   retrouve son dessin en revenant, et sa vignette dans la colonne.

   Créatif = aucune note (règle 2) : « fini » donne toujours la même fête.
   La feuille a une résolution fixe (1500 × 1000) : un dessin se retrouve
   identique quelle que soit la taille de l'écran. */

const W = 1500
const H = 1000
const SIZES = [16, 34, 66]
const STAMP_SIZES = [150, 230, 330]
const UNDO_MAX = 10

const PALETTE = ['#E8414F', '#FF6B81', '#F58FB8', '#FFA94D', '#FFD43B', '#94D82D',
  '#2F9E44', '#4FB8E7', '#1C64C8', '#9C6ADE', '#8B5E3C', '#3A2E25']

function petals(cx: number, cy: number): string {
  let s = ''
  for (let k = 0; k < 6; k++) {
    s += `<ellipse class="creg" cx="${cx}" cy="${cy - 44}" rx="24" ry="38" transform="rotate(${k * 60} ${cx} ${cy})"/>`
  }
  return s
}

/* Les dessins à colorier : les mêmes que l'ancien Coloriage (les zones
   `creg` servent à reprendre les coloriages déjà faits), en traits seuls. */
interface Page { id: string; svg: string }
const PAGES: Page[] = [
  { id: 'blanche', svg: '' },
  {
    id: 'papillon',
    svg: `<circle class="creg" cx="52" cy="48" r="26"/>
      <path class="creg" d="M186,130 C120,60 60,90 80,150 C90,185 150,190 186,160 Z"/>
      <path class="creg" d="M214,130 C280,60 340,90 320,150 C310,185 250,190 214,160 Z"/>
      <path class="creg" d="M186,170 C130,200 110,250 150,255 C180,258 190,220 190,195 Z"/>
      <path class="creg" d="M214,170 C270,200 290,250 250,255 C220,258 210,220 210,195 Z"/>
      <ellipse class="creg" cx="200" cy="160" rx="14" ry="52"/>
      <circle class="creg" cx="200" cy="95" r="16"/>
      <path class="cdeco" d="M195,82 C185,60 175,55 170,50"/>
      <path class="cdeco" d="M205,82 C215,60 225,55 230,50"/>`
  },
  {
    id: 'fleur',
    svg: `<circle class="creg" cx="348" cy="50" r="26"/>
      <path class="creg" d="M195,170 L205,170 C210,220 205,250 208,290 L192,290 C195,250 190,220 195,170 Z"/>
      <path class="creg" d="M196,230 C160,215 130,225 125,245 C155,255 185,248 199,238 Z"/>
      <path class="creg" d="M204,215 C240,200 270,210 275,230 C245,240 215,233 201,223 Z"/>
      ${petals(200, 120)}
      <circle class="creg" cx="200" cy="120" r="24"/>`
  },
  {
    id: 'maison',
    svg: `<circle class="creg" cx="52" cy="48" r="26"/>
      <rect class="creg" x="120" y="140" width="160" height="120"/>
      <path class="creg" d="M100,140 L200,60 L300,140 Z"/>
      <rect class="creg" x="185" y="200" width="40" height="60" rx="4"/>
      <rect class="creg" x="140" y="160" width="34" height="34"/>
      <rect class="creg" x="226" y="160" width="34" height="34"/>
      <rect class="creg" x="330" y="200" width="18" height="60"/>
      <circle class="creg" cx="339" cy="180" r="36"/>
      <ellipse class="creg" cx="60" cy="252" rx="40" ry="20"/>`
  }
]

/* Le dessin 400 × 300 d'origine, centré dans une feuille 3:2 */
const VIEW = 'viewBox="-25 0 450 300"'
const lineSvg = (p: Page, sw: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${VIEW} width="${W}" height="${H}"><style>
    .creg,.cdeco{fill:none;stroke:#3A2E25;stroke-width:${sw};stroke-linejoin:round;stroke-linecap:round}</style>${p.svg}</svg>`

/* ---- Icônes des outils (dessinées ici : elles prennent la couleur choisie) ---- */
const svgI = (body: string) => `<svg viewBox="0 0 48 48" width="40" height="40">${body}</svg>`
const TOOL_ICON = {
  brush: (c: string) => svgI(`<path d="M31 5l12 12-15 15-12-12z" fill="#C99457"/><path d="M31 5l12 12-5 5-12-12z" fill="#E8B676"/>
    <path d="M16 20l12 12-4 3c-2 6-8 9-17 9 2-7 1-13 6-17z" fill="${c}"/><path d="M16 20l12 12-3 2-11-11z" fill="#9AA3AD"/>`),
  rainbow: () => svgI(`<path d="M5 36a19 19 0 0 1 38 0" fill="none" stroke="#E8414F" stroke-width="5"/>
    <path d="M10 36a14 14 0 0 1 28 0" fill="none" stroke="#FFD43B" stroke-width="5"/>
    <path d="M15 36a9 9 0 0 1 18 0" fill="none" stroke="#2F9E44" stroke-width="5"/>
    <path d="M20 36a4 4 0 0 1 8 0" fill="none" stroke="#1C64C8" stroke-width="5"/>`),
  bucket: (c: string) => svgI(`<path d="M9 17l17-9 13 22-17 10z" fill="#DDE3EA" stroke="#8A96A3" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M9 17c3 5 17-3 17-9" fill="none" stroke="#8A96A3" stroke-width="2.5"/>
    <path d="M26 8c7 1 13 6 15 14 1 5 0 11 2 14 1 3-1 6-4 5-3 0-4-4-3-7 1-4 1-8-2-12" fill="${c}"/>`),
  eraser: () => svgI(`<path d="M6 30L24 12l16 16-12 12H16z" fill="#FF9CB1"/><path d="M6 30l8-8 16 16-2 2H16z" fill="#F4F0EA"/>
    <path d="M16 40h26" stroke="#B9AEA2" stroke-width="3" stroke-linecap="round"/>`),
  stamp: () => svgI(`<rect x="18" y="4" width="12" height="16" rx="5" fill="#B97F3F"/><path d="M11 20h26l2 8H9z" fill="#8B5E3C"/>
    <rect x="7" y="28" width="34" height="6" rx="2" fill="#E8414F"/><ellipse cx="24" cy="42" rx="15" ry="3.5" fill="#E8414F" opacity=".45"/>`),
  undo: () => svgI(`<path d="M18 12 7 21l11 9" fill="none" stroke="#45362A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 21h19c8 0 13 5 13 11s-5 10-12 10h-6" fill="none" stroke="#45362A" stroke-width="5" stroke-linecap="round"/>`),
  clear: () => svgI(`<rect x="9" y="6" width="26" height="34" rx="3" fill="#fff" stroke="#B9AEA2" stroke-width="2.5"/>
    <path d="M38 10l1.8 4.2L44 16l-4.2 1.8L38 22l-1.8-4.2L32 16l4.2-1.8z" fill="#FFC533"/>
    <path d="M40 28l1.2 2.8 2.8 1.2-2.8 1.2L40 36l-1.2-2.8L36 32l2.8-1.2z" fill="#FFC533"/>`)
}

type Tool = 'brush' | 'rainbow' | 'bucket' | 'eraser' | 'stamp'

interface Pour { fill: HTMLCanvasElement; x: number; y: number; r: number; rMax: number }

interface State {
  running: boolean
  profileId: string
  tool: Tool
  color: string
  size: number
  stamp: CritterKind
  page: Page
  paint: CanvasRenderingContext2D
  lines: CanvasRenderingContext2D
  /** Pixels de trait du dessin à colorier : les murs du pot de peinture. */
  wall: Uint8Array
  undo: ImageData[]
  strokes: Map<number, { x: number; y: number; mx: number; my: number; run: number }>
  hue: number
  pour: Pour | null
  stamps: Partial<Record<CritterKind, HTMLImageElement>>
  saveId: number
  dirty: boolean
  thumbs: Record<string, string>
  /** Le tampon en train de tomber (230 ms) : imprimé AVANT tout autre geste,
      changement de feuille ou « annuler » — sinon il atterrit après coup,
      sur la mauvaise feuille ou par-dessus l'annulation. */
  pending: (() => void) | null
  /** Nombre de gestes posés sur la feuille (pour le bot). */
  marks: number
}

let at: State | null = null
let ctx: GameContext

/* ---- Les dessins gardés : IndexedDB (une image PNG par feuille) ----
   localStorage est trop petit pour des images ; IndexedDB reste local à la
   tablette (règle 3). */
let dbp: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((res, rej) => {
    const rq = indexedDB.open('ferme-atelier', 1)
    rq.onupgradeneeded = () => rq.result.createObjectStore('pages')
    rq.onsuccess = () => res(rq.result)
    rq.onerror = () => rej(rq.error)
  })
  return dbp
}
async function getBlob(key: string): Promise<Blob | null> {
  try {
    const d = await db()
    return await new Promise(res => {
      const rq = d.transaction('pages').objectStore('pages').get(key)
      rq.onsuccess = () => res((rq.result as Blob) || null)
      rq.onerror = () => res(null)
    })
  } catch { return null }
}
async function putBlob(key: string, blob: Blob) {
  try {
    const d = await db()
    d.transaction('pages', 'readwrite').objectStore('pages').put(blob, key)
  } catch { /* stockage refusé (navigation privée) : le dessin reste à l'écran */ }
}
const pageKey = (me: State, id: string) => `${me.profileId}:${id}`

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = rej
    im.src = src
  })
}

/* Les coloriages de l'ancien jeu (zones remplies, localStorage) reviennent
   dans la feuille : rien n'est perdu au passage à l'Atelier. */
async function legacyFill(me: State, p: Page): Promise<HTMLImageElement | null> {
  let fills: Record<string, string> = {}
  try { fills = JSON.parse(localStorage.getItem(`ferme:coloriage:${me.profileId}:${p.id}`) || '{}') } catch { return null }
  if (!Object.keys(fills).length) return null
  let i = 0
  const svg = p.svg.replace(/class="creg"/g, () => {
    const f = fills[i++]
    return `fill="${f && f !== '#FFFFFF' ? f : 'none'}"`
  }).replace(/class="cdeco"/g, 'fill="none"')
  try {
    return await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" ${VIEW} width="${W}" height="${H}">${svg}</svg>`))
  } catch { return null }
}

async function openPage(me: State, p: Page) {
  flushStamp(me)
  flushSave(me)
  me.page = p
  me.undo = []
  me.pour = null
  me.strokes.clear()
  document.querySelectorAll<HTMLElement>('.at-page').forEach(b => b.classList.toggle('sel', b.dataset.p === p.id))
  me.paint.clearRect(0, 0, W, H)
  me.lines.clearRect(0, 0, W, H)
  me.wall = new Uint8Array(W * H)
  if (p.svg) {
    const im = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(lineSvg(p, 3.2)))
    if (at !== me || me.page !== p) return
    me.lines.drawImage(im, 0, 0, W, H)
    const d = me.lines.getImageData(0, 0, W, H).data
    for (let i = 0; i < W * H; i++) me.wall[i] = d[i * 4 + 3] > 90 ? 1 : 0
  }
  const blob = await getBlob(pageKey(me, p.id))
  if (at !== me || me.page !== p) return
  if (blob) {
    const url = URL.createObjectURL(blob)
    try { me.paint.drawImage(await loadImage(url), 0, 0, W, H) } catch { /* image abîmée : feuille vierge */ }
    URL.revokeObjectURL(url)
  } else if (p.svg) {
    const old = await legacyFill(me, p)
    if (old && at === me && me.page === p) { me.paint.drawImage(old, 0, 0, W, H); me.dirty = true; scheduleSave(me) }
  }
}

/* ---- Sauvegarde : une demi-seconde après le dernier geste ---- */
function scheduleSave(me: State) {
  me.dirty = true
  ctx.cancel(me.saveId)
  me.saveId = ctx.after(600, () => flushSave(me))
}
function flushSave(me: State) {
  if (!me.dirty) return
  me.dirty = false
  const id = me.page.id
  const key = pageKey(me, id)
  me.paint.canvas.toBlob(b => {
    if (!b) return
    void putBlob(key, b)
    if (at === me) setThumb(me, id, URL.createObjectURL(b))
  }, 'image/png')
}
function setThumb(me: State, id: string, url: string) {
  if (me.thumbs[id]) URL.revokeObjectURL(me.thumbs[id])
  me.thumbs[id] = url
  const img = document.querySelector<HTMLImageElement>(`.at-page[data-p="${id}"] .at-thumb`)
  if (img) img.src = url
}

/* ---- Annuler ---- */
function snapshot(me: State) {
  flushStamp(me)
  finishPour(me)
  me.undo.push(me.paint.getImageData(0, 0, W, H))
  if (me.undo.length > UNDO_MAX) me.undo.shift()
}
function undo(me: State) {
  flushStamp(me)
  finishPour(me)
  const img = me.undo.pop()
  if (!img) { sfx('error', { vol: 0.3 }); return }
  me.paint.putImageData(img, 0, 0)
  sfx('switch', { vol: 0.5 })
  scheduleSave(me)
}

/* ---- Pinceaux ---- */
function toPaper(e: PointerEvent, cv: HTMLCanvasElement) {
  const r = cv.getBoundingClientRect()
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }
}
function strokeStyle(me: State, run: number): string {
  if (me.tool === 'rainbow') return `hsl(${(me.hue + run * 0.35) % 360}, 88%, 56%)`
  return me.color
}
function dab(me: State, x: number, y: number, run: number) {
  const g = me.paint
  g.globalCompositeOperation = me.tool === 'eraser' ? 'destination-out' : 'source-over'
  g.fillStyle = strokeStyle(me, run)
  g.beginPath()
  g.arc(x, y, SIZES[me.size] / 2, 0, Math.PI * 2)
  g.fill()
  g.globalCompositeOperation = 'source-over'
}
function segment(me: State, s: { x: number; y: number; mx: number; my: number; run: number }, x: number, y: number) {
  const g = me.paint
  const mx = (s.x + x) / 2, my = (s.y + y) / 2
  const len = Math.hypot(x - s.x, y - s.y)
  g.globalCompositeOperation = me.tool === 'eraser' ? 'destination-out' : 'source-over'
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.lineWidth = SIZES[me.size] * (me.tool === 'eraser' ? 1.6 : 1)
  g.strokeStyle = strokeStyle(me, s.run)
  // Courbe lissée : du milieu précédent au milieu courant, en passant par le point
  g.beginPath()
  g.moveTo(s.mx, s.my)
  g.quadraticCurveTo(s.x, s.y, mx, my)
  g.stroke()
  g.globalCompositeOperation = 'source-over'
  // Un petit frottement de feutre tous les 140 px de trait
  if (Math.floor((s.run + len) / 140) > Math.floor(s.run / 140)) {
    sfx('cloth', { vol: me.tool === 'eraser' ? 0.18 : 0.12, rate: me.tool === 'eraser' ? 0.8 : 1.5, spread: 0.2 })
  }
  s.run += len
  s.x = x; s.y = y; s.mx = mx; s.my = my
}

/* ---- Pot de peinture : remplissage par balayage, puis déversé en rond ---- */
function flood(me: State, sx: number, sy: number): { mask: Uint8Array; x0: number; y0: number; x1: number; y1: number } | null {
  const data = me.paint.getImageData(0, 0, W, H).data
  const wall = me.wall
  // Tapé pile sur un trait : on cherche la zone la plus proche
  let seed = -1
  for (let rad = 0; rad <= 14 && seed < 0; rad += 2) {
    for (let a = 0; a < 8 && seed < 0; a++) {
      const x = Math.round(sx + Math.cos(a * Math.PI / 4) * rad), y = Math.round(sy + Math.sin(a * Math.PI / 4) * rad)
      if (x >= 0 && y >= 0 && x < W && y < H && !wall[y * W + x]) seed = y * W + x
      if (rad === 0) break
    }
  }
  if (seed < 0) return null
  // Couleur vue sur la feuille (le transparent est le blanc du papier)
  const comp = (i: number, k: number) => {
    const a = data[i * 4 + 3] / 255
    return data[i * 4 + k] * a + 255 * (1 - a)
  }
  const r0 = comp(seed, 0), g0 = comp(seed, 1), b0 = comp(seed, 2)
  const [fr, fg, fb] = hexRgb(me.color)
  if (Math.abs(r0 - fr) + Math.abs(g0 - fg) + Math.abs(b0 - fb) < 12) return null
  const mask = new Uint8Array(W * H)
  const ok = (i: number) => !mask[i] && !wall[i] &&
    Math.abs(comp(i, 0) - r0) + Math.abs(comp(i, 1) - g0) + Math.abs(comp(i, 2) - b0) <= 70
  let x0 = W, y0 = H, x1 = 0, y1 = 0
  const stack = [seed]
  while (stack.length) {
    const p = stack.pop()!
    const y = (p / W) | 0
    let x = p - y * W
    while (x > 0 && ok(y * W + x - 1)) x--
    let upOpen = false, downOpen = false
    for (; x < W && ok(y * W + x); x++) {
      const i = y * W + x
      mask[i] = 1
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y > 0) {
        const u = ok(i - W)
        if (u && !upOpen) stack.push(i - W)
        upOpen = u
      }
      if (y < H - 1) {
        const d = ok(i + W)
        if (d && !downOpen) stack.push(i + W)
        downOpen = d
      }
    }
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  // Deux pixels de débord sous les traits : pas de liseré blanc au bord
  for (let pass = 0; pass < 2; pass++) {
    const grow: number[] = []
    for (let y = Math.max(1, y0 - 2); y <= Math.min(H - 2, y1 + 2); y++) {
      for (let x = Math.max(1, x0 - 2); x <= Math.min(W - 2, x1 + 2); x++) {
        const i = y * W + x
        if (!mask[i] && (mask[i - 1] || mask[i + 1] || mask[i - W] || mask[i + W])) grow.push(i)
      }
    }
    for (const i of grow) mask[i] = 1
    x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(W - 1, x1 + 1); y1 = Math.min(H - 1, y1 + 1)
  }
  return { mask, x0, y0, x1, y1 }
}
function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function pourAt(me: State, x: number, y: number) {
  const f = flood(me, x, y)
  if (!f) { sfx('click', { vol: 0.3 }); return }
  snapshot(me)
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const g = cv.getContext('2d')!
  const img = g.createImageData(W, H)
  const [r, gg, b] = hexRgb(me.color)
  for (let i = 0; i < W * H; i++) {
    if (!f.mask[i]) continue
    img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  const rMax = Math.max(Math.hypot(x - f.x0, y - f.y0), Math.hypot(x - f.x1, y - f.y0),
    Math.hypot(x - f.x0, y - f.y1), Math.hypot(x - f.x1, y - f.y1))
  me.pour = { fill: cv, x, y, r: 0, rMax }
  sfx('drop', { vol: 0.7, rate: 0.9 })
  me.marks++
  scheduleSave(me)
}
function stepPour(me: State, dt: number) {
  const p = me.pour
  if (!p) return
  // Vite au début, puis la peinture ralentit en s'étalant
  p.r += Math.max(900, p.rMax * 2.6) * dt
  if (p.r >= p.rMax) { finishPour(me); return }
  const g = me.paint
  g.save()
  g.beginPath()
  g.arc(p.x, p.y, p.r, 0, Math.PI * 2)
  g.clip()
  g.drawImage(p.fill, 0, 0)
  g.restore()
}
function finishPour(me: State) {
  if (!me.pour) return
  me.paint.drawImage(me.pour.fill, 0, 0)
  me.pour = null
}

/* ---- Tampons : l'animal saute sur la feuille, puis y reste imprimé ---- */
function stampAt(me: State, x: number, y: number) {
  const im = me.stamps[me.stamp]
  if (!im) return
  snapshot(me)
  const s = STAMP_SIZES[me.size]
  const rot = (Math.random() - 0.5) * 0.3
  const paper = me.paint.canvas
  const r = paper.getBoundingClientRect()
  const k = r.width / W
  const ghost = document.createElement('img')
  ghost.className = 'at-ghost'
  ghost.src = im.src
  ghost.style.cssText = `left:${x * k}px;top:${y * k}px;width:${s * k}px;height:${s * k}px;--rot:${rot}rad`
  paper.parentElement!.appendChild(ghost)
  sfx('pluck', { vol: 0.7, rate: 0.8 + Math.random() * 0.5 })
  me.marks++
  const print = () => {
    ghost.remove()
    const g = me.paint
    g.save()
    g.translate(x, y)
    g.rotate(rot)
    g.drawImage(im, -s / 2, -s / 2, s, s)
    g.restore()
    scheduleSave(me)
  }
  me.pending = print
  ctx.after(230, () => { if (at === me && me.pending === print) flushStamp(me) })
}
function flushStamp(me: State) {
  const p = me.pending
  me.pending = null
  p?.()
}

function selectTool(me: State, t: Tool) {
  finishPour(me)
  me.tool = t
  document.querySelectorAll<HTMLElement>('.at-tool[data-t]').forEach(b => b.classList.toggle('sel', b.dataset.t === t))
  const arena = document.querySelector('.at-arena')
  arena?.classList.toggle('stamping', t === 'stamp')
  sfx('click', { vol: 0.4 })
}
function tintIcons(me: State) {
  const b = document.querySelector('.at-tool[data-t="brush"]')
  if (b) b.innerHTML = TOOL_ICON.brush(me.color)
  const k = document.querySelector('.at-tool[data-t="bucket"]')
  if (k) k.innerHTML = TOOL_ICON.bucket(me.color)
  document.querySelectorAll<HTMLElement>('.at-size i').forEach(i => { i.style.background = me.color })
}

/* La feuille garde son format 3:2 dans la place qui reste */
function fitPaper(desk: HTMLElement, paper: HTMLElement) {
  const r = desk.getBoundingClientRect()
  const pad = 18
  const w = Math.max(100, Math.min(r.width - pad * 2, (r.height - pad * 2) * W / H))
  paper.style.width = w + 'px'
  paper.style.height = w * H / W + 'px'
}

export const coloring: GameDef = {
  id: 'coloring', name: 'L\'Atelier', icon: '🎨', sq: 'sq-sun', cat: 'creatif', music: 'meadow',
  subtitle: 'Dessine au doigt, remplis, tamponne',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="arena at-arena">
        <div class="at-tools">
          <button class="at-tool sel" data-t="brush" aria-label="Pinceau"></button>
          <button class="at-tool" data-t="rainbow" aria-label="Arc-en-ciel">${TOOL_ICON.rainbow()}</button>
          <button class="at-tool" data-t="bucket" aria-label="Pot de peinture"></button>
          <button class="at-tool" data-t="eraser" aria-label="Gomme">${TOOL_ICON.eraser()}</button>
          <button class="at-tool" data-t="stamp" aria-label="Tampons">${TOOL_ICON.stamp()}</button>
          <div class="at-sizes">
            ${SIZES.map((_, i) => `<button class="at-size${i === 1 ? ' sel' : ''}" data-s="${i}" aria-label="Taille"><i style="width:${8 + i * 9}px;height:${8 + i * 9}px"></i></button>`).join('')}
          </div>
          <button class="at-tool" id="atUndo" aria-label="Annuler">${TOOL_ICON.undo()}</button>
          <button class="at-tool" id="atClear" aria-label="Nouvelle feuille">${TOOL_ICON.clear()}</button>
        </div>
        <div class="at-desk" id="atDesk">
          <div class="at-paper" id="atPaper">
            <canvas id="atPaint" width="${W}" height="${H}"></canvas>
            <canvas id="atLines" width="${W}" height="${H}"></canvas>
          </div>
        </div>
        <div class="at-side">
          <div class="at-pages">
            ${PAGES.map((p, i) => `<button class="at-page${i === 0 ? ' sel' : ''}" data-p="${p.id}" aria-label="Feuille">
              <img class="at-thumb" alt="">${p.svg ? lineSvg(p, 7).replace(/ width="\d+" height="\d+"/, '') : ''}</button>`).join('')}
          </div>
          <div class="at-pal">
            ${PALETTE.map((p, i) => `<button class="at-color${i === 7 ? ' sel' : ''}" data-c="${p}" style="background:${p}" aria-label="Couleur"></button>`).join('')}
          </div>
          <div class="at-stamps">
            ${FARM.map((k, i) => `<button class="at-stamp${i === 0 ? ' sel' : ''}" data-k="${k}" aria-label="Tampon"></button>`).join('')}
          </div>
        </div>
        <button class="sn-tool go at-done" id="atDone" aria-label="Fini">${ICON.check}</button>
      </div>`
    preloadSfx(['cloth', 'click', 'confirm', 'drop', 'pluck', 'switch', 'whoosh', 'error'])

    const paintCv = document.getElementById('atPaint') as HTMLCanvasElement
    const linesCv = document.getElementById('atLines') as HTMLCanvasElement
    const me: State = {
      running: true,
      profileId: useFerme.getState().currentId,
      tool: 'brush', color: PALETTE[7], size: 1, stamp: FARM[0],
      page: PAGES[0],
      paint: paintCv.getContext('2d', { willReadFrequently: true })!,
      lines: linesCv.getContext('2d', { willReadFrequently: true })!,
      wall: new Uint8Array(W * H),
      undo: [], strokes: new Map(), hue: 0, pour: null, stamps: {}, pending: null,
      saveId: 0, dirty: false, thumbs: {}, marks: 0
    }
    at = me
    tintIcons(me)

    // La feuille suit la place disponible
    const desk = document.getElementById('atDesk')!
    const paper = document.getElementById('atPaper')!
    const ro = new ResizeObserver(() => fitPaper(desk, paper))
    ro.observe(desk)
    fitPaper(desk, paper)

    // Outils
    document.querySelectorAll<HTMLElement>('.at-tool[data-t]').forEach(b => {
      b.onclick = () => { if (me.running) selectTool(me, b.dataset.t as Tool) }
    })
    document.querySelectorAll<HTMLElement>('.at-size').forEach(b => {
      b.onclick = () => {
        if (!me.running) return
        me.size = +b.dataset.s!
        document.querySelectorAll('.at-size').forEach(x => x.classList.toggle('sel', x === b))
        sfx('click', { vol: 0.35, rate: 1.3 - me.size * 0.2 })
      }
    })
    document.querySelectorAll<HTMLElement>('.at-color').forEach(b => {
      b.onclick = () => {
        if (!me.running) return
        me.color = b.dataset.c!
        document.querySelectorAll('.at-color').forEach(x => x.classList.toggle('sel', x === b))
        // Choisir une couleur avec la gomme ou le tampon en main : on reprend le pinceau
        if (me.tool === 'eraser' || me.tool === 'rainbow' || me.tool === 'stamp') selectTool(me, 'brush')
        tintIcons(me)
        sfx('click', { vol: 0.4 })
      }
    })
    document.querySelectorAll<HTMLElement>('.at-stamp').forEach(b => {
      b.onclick = () => {
        if (!me.running) return
        me.stamp = b.dataset.k as CritterKind
        document.querySelectorAll('.at-stamp').forEach(x => x.classList.toggle('sel', x === b))
        sfx('pluck', { vol: 0.5 })
      }
    })
    document.querySelectorAll<HTMLElement>('.at-page').forEach(b => {
      b.onclick = () => {
        if (!me.running) return
        const p = PAGES.find(x => x.id === b.dataset.p)!
        if (p === me.page) return
        sfx('open', { vol: 0.5 })
        void openPage(me, p)
      }
    })
    ;(document.getElementById('atUndo') as HTMLButtonElement).onclick = () => { if (me.running) undo(me) }
    ;(document.getElementById('atClear') as HTMLButtonElement).onclick = () => {
      if (!me.running) return
      snapshot(me)
      me.paint.clearRect(0, 0, W, H)
      paper.classList.remove('at-swish'); void paper.offsetWidth; paper.classList.add('at-swish')
      sfx('whoosh', { vol: 0.6 })
      scheduleSave(me)
    }
    ;(document.getElementById('atDone') as HTMLButtonElement).onclick = () => {
      if (!me.running) return
      flushStamp(me)
      finishPour(me)
      flushSave(me)
      c.finish({ title: 'Chef-d\'œuvre !', msg: 'Ton dessin est gardé dans l\'Atelier', stars: 3 })
    }

    // Dessin au doigt — plusieurs doigts à la fois, chacun son trait
    const down = (e: PointerEvent) => {
      if (!me.running) return
      e.preventDefault()
      const p = toPaper(e, paintCv)
      if (me.tool === 'bucket') { pourAt(me, p.x, p.y); return }
      if (me.tool === 'stamp') { stampAt(me, p.x, p.y); return }
      if (!me.strokes.size) snapshot(me)
      paintCv.setPointerCapture?.(e.pointerId)
      if (me.tool === 'rainbow') me.hue = (me.hue + 47) % 360
      me.strokes.set(e.pointerId, { x: p.x, y: p.y, mx: p.x, my: p.y, run: 0 })
      dab(me, p.x, p.y, 0)
      me.marks++
    }
    const move = (e: PointerEvent) => {
      const s = me.strokes.get(e.pointerId)
      if (!s || !me.running) return
      const evs = e.getCoalescedEvents?.() || []
      for (const ev of evs.length ? evs : [e]) {
        const p = toPaper(ev, paintCv)
        if (Math.hypot(p.x - s.x, p.y - s.y) > 1.5) segment(me, s, p.x, p.y)
      }
    }
    const up = (e: PointerEvent) => {
      const s = me.strokes.get(e.pointerId)
      if (!s) return
      me.paint.globalCompositeOperation = me.tool === 'eraser' ? 'destination-out' : 'source-over'
      me.paint.lineWidth = SIZES[me.size] * (me.tool === 'eraser' ? 1.6 : 1)
      me.paint.strokeStyle = strokeStyle(me, s.run)
      me.paint.beginPath(); me.paint.moveTo(s.mx, s.my); me.paint.lineTo(s.x, s.y); me.paint.stroke()
      me.paint.globalCompositeOperation = 'source-over'
      me.strokes.delete(e.pointerId)
      scheduleSave(me)
    }
    paintCv.addEventListener('pointerdown', down)
    paintCv.addEventListener('pointermove', move)
    paintCv.addEventListener('pointerup', up)
    paintCv.addEventListener('pointercancel', up)

    // Le déversé du pot de peinture
    let last = performance.now(), raf = 0
    const loop = (now: number) => {
      if (!me.running) return
      stepPour(me, Math.min(0.05, (now - last) / 1000))
      last = now
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    // Tampons : les animaux de la ferme en 3D, rendus en images
    critterPortraits(FARM, 180).then(urls => {
      if (at !== me) return
      for (const k of FARM) {
        if (!urls[k]) continue
        const im = new Image()
        im.src = urls[k]
        me.stamps[k] = im
        const b = document.querySelector(`.at-stamp[data-k="${k}"]`)
        if (b) b.innerHTML = `<img src="${urls[k]}" alt="">`
      }
    })

    // Vignettes des feuilles déjà dessinées, puis la première feuille
    for (const p of PAGES) {
      void getBlob(pageKey(me, p.id)).then(b => { if (b && at === me) setThumb(me, p.id, URL.createObjectURL(b)) })
    }
    void openPage(me, PAGES[0])

    if ((window as { __BOT?: boolean }).__BOT) {
      (window as unknown as { __at: unknown }).__at = {
        get marks() { return me.marks },
        get pouring() { return !!me.pour },
        get undo() { return me.undo.length },
        /** Part de la feuille couverte de peinture (échantillon grossier). */
        painted() {
          const d = me.paint.getImageData(0, 0, W, H).data
          let n = 0, t = 0
          for (let i = 3; i < d.length; i += 4 * 97) { t++; if (d[i] > 0) n++ }
          return n / t
        }
      }
    }

    return () => {
      if (!me.running) return
      me.running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      flushStamp(me)
      finishPour(me)
      flushSave(me)
      if (at === me) at = null
      const urls = Object.values(me.thumbs)
      me.thumbs = {}
      for (const u of urls) URL.revokeObjectURL(u)
      me.undo = []
      delete (window as { __at?: unknown }).__at
    }
  }
}
