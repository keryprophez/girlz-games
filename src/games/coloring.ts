import type { GameContext, GameDef } from '../core/types'
import { useFerme } from '../core/store'
import { sfx, preloadSfx } from '../core/sfx'
import { tone } from '../core/audio'
import { ICON } from '../core/icons'
import { critterPortraits, princessPortraits } from '../core/portraits'
import { FARM } from '../core/critters'
import { drawings, idbDel, idbGet, idbPut, princessPages, type Drawing } from '../core/atelierdb'
import { SHEETS, sheetById, sheetLines, sheetMinis } from '../core/lineart'

/* L'Atelier — remplace le Coloriage (23/09), enrichi le 27/09 (« elles
   adorent l'Atelier : complexifie-le, rends-le encore plus stylé »).

   Une vraie feuille de dessin au doigt :
   - DIX PINCEAUX dans un tiroir : feutre, crayon, aquarelle, craie, spray,
     paillettes, néon, arc-en-ciel, cœurs, étoiles ; trois tailles ;
   - le pot de peinture qui se déverse en rond depuis le doigt, la gomme,
     les tampons des animaux de la ferme (les mêmes personnages 3D) ;
   - le MIROIR : ce qu'on dessine se reflète en 2, en 4, ou tourne en rosace
     de 8 ;
   - des PAPIERS de couleur (le néon sur papier nuit !) ;
   - quatre modèles : une page blanche et trois dessins à colorier.

   Chaque feuille est gardée toute seule (IndexedDB, local à la tablette —
   règle 3). Et le DOSSIER : « Ranger » y met le dessin et rouvre une feuille
   propre ; dans le dossier, chaque dessin se reprend, se revoit en FILM
   (tout le dessin qui se refait en accéléré), s'enregistre en image dans la
   tablette, ou se jette. « Tout effacer » : une poubelle qu'on touche deux
   fois, et la feuille part en boule. « Fini » rejoue le film du dessin.

   Créatif = aucune note (règle 2) : « fini » donne toujours la même fête.
   La feuille a une résolution fixe (1500 × 1000) : un dessin se retrouve
   identique quelle que soit la taille de l'écran. */

const W = 1500
const H = 1000
const SIZES = [16, 34, 66]
const STAMP_SIZES = [150, 230, 330]
const UNDO_MAX = 10
/** Le film : une image par geste, au plus 90 (on en garde une sur deux au-delà). */
const FRAMES_MAX = 90
const FRAME_W = 450
const FRAME_H = 300

const PALETTE = ['#E8414F', '#FF6B81', '#F58FB8', '#FFA94D', '#FFD43B', '#94D82D',
  '#2F9E44', '#4FB8E7', '#1C64C8', '#9C6ADE', '#8B5E3C', '#3A2E25']

/** Les papiers : blanc, crème, rose, ciel, kraft, nuit. */
const PAPERS = ['#FFFDF8', '#FFF1D6', '#FFE0EC', '#DDF0FF', '#E6D3AE', '#1F1B2E']
const isDark = (hex: string) => { const [r, g, b] = hexRgb(hex); return r * 0.3 + g * 0.59 + b * 0.11 < 110 }

function petals(cx: number, cy: number): string {
  let s = ''
  for (let k = 0; k < 6; k++) {
    s += `<ellipse class="creg" cx="${cx}" cy="${cy - 44}" rx="24" ry="38" transform="rotate(${k * 60} ${cx} ${cy})"/>`
  }
  return s
}

/* Les dessins à colorier : les mêmes que l'ancien Coloriage (les zones
   `creg` servent à reprendre les coloriages déjà faits), en traits seuls. */
interface Page { id: string; svg: string; img?: string }
/** Les coloriages des princesses (photos de la Princesse, 27/09) : un trait
    en image, rangé dans IndexedDB ; les quatre plus récents sont proposés. */
const EXTRA: Page[] = []
const PRINCESS_SHOWN = 4
const pageById = (id: string) => PAGES.find(x => x.id === id) || EXTRA.find(x => x.id === id)
/** Une feuille du livre de coloriages (core/lineart.ts) : son trait est
    calculé à la première demande, puis gardé. */
async function sheetPage(id: string): Promise<Page | null> {
  const had = EXTRA.find(x => x.id === id)
  if (had) return had
  const url = await sheetLines(id)
  if (!url) return null
  let p = EXTRA.find(x => x.id === id)
  if (!p) { p = { id, svg: '', img: url }; EXTRA.push(p) }
  return p
}
/** N'importe quelle feuille, y compris celle d'un livre pas encore ouvert
    (un dessin du dossier repris après avoir fermé l'app). */
async function pageFor(id: string): Promise<Page | undefined> {
  return pageById(id) || (sheetById(id) ? (await sheetPage(id)) ?? undefined : undefined)
}
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
const lineSvg = (p: Page, sw: number, color = '#3A2E25') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${VIEW} width="${W}" height="${H}"><style>
    .creg,.cdeco{fill:none;stroke:${color};stroke-width:${sw};stroke-linejoin:round;stroke-linecap:round}</style>${p.svg}</svg>`

/* ---- Icônes (dessinées ici : elles prennent la couleur choisie) ---- */
const svgI = (body: string) => `<svg viewBox="0 0 48 48" width="40" height="40">${body}</svg>`
const star4 = (x: number, y: number, r: number, fill: string) =>
  `<path d="M${x} ${y - r}L${x + r * 0.28} ${y - r * 0.28}L${x + r} ${y}L${x + r * 0.28} ${y + r * 0.28}L${x} ${y + r}L${x - r * 0.28} ${y + r * 0.28}L${x - r} ${y}L${x - r * 0.28} ${y - r * 0.28}Z" fill="${fill}"/>`
const heartD = (x: number, y: number, s: number) =>
  `M${x} ${y + s * 0.35}C${x - s * 0.9} ${y - s * 0.25} ${x - s * 0.45} ${y - s * 0.95} ${x} ${y - s * 0.45}C${x + s * 0.45} ${y - s * 0.95} ${x + s * 0.9} ${y - s * 0.25} ${x} ${y + s * 0.35}Z`
const starD = (x: number, y: number, r: number) => {
  let d = ''
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r
    d += `${k ? 'L' : 'M'}${(x + Math.cos(a) * rr).toFixed(1)} ${(y + Math.sin(a) * rr).toFixed(1)}`
  }
  return d + 'Z'
}

type Brush = 'feutre' | 'crayon' | 'aquarelle' | 'craie' | 'spray' | 'paillettes' | 'neon' | 'arcenciel' | 'coeurs' | 'etoiles'
const BRUSHES: Brush[] = ['feutre', 'crayon', 'aquarelle', 'craie', 'spray', 'paillettes', 'neon', 'arcenciel', 'coeurs', 'etoiles']
/** Les pinceaux « à grain » : des empreintes posées le long du trait. */
const TEXTURED: Brush[] = ['crayon', 'craie', 'spray', 'paillettes', 'coeurs', 'etoiles']

const BRUSH_ICON: Record<Brush, (c: string) => string> = {
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

type Sym = 1 | 2 | 4 | 8
const SYMS: Sym[] = [1, 2, 4, 8]
/** L'icône du miroir : autant de pétales que de reflets. */
const symIcon = (n: Sym) => svgI(Array.from({ length: n }, (_, k) =>
  `<ellipse cx="24" cy="13" rx="5.5" ry="10" fill="${n === 1 ? '#C8BCAE' : '#9C6ADE'}" transform="rotate(${k * 360 / n} 24 24)"/>`).join('') +
  `<circle cx="24" cy="24" r="3.4" fill="#FFC533"/>`)

const TOOL_ICON = {
  bucket: (c: string) => svgI(`<path d="M9 17l17-9 13 22-17 10z" fill="#DDE3EA" stroke="#8A96A3" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M9 17c3 5 17-3 17-9" fill="none" stroke="#8A96A3" stroke-width="2.5"/>
    <path d="M26 8c7 1 13 6 15 14 1 5 0 11 2 14 1 3-1 6-4 5-3 0-4-4-3-7 1-4 1-8-2-12" fill="${c}"/>`),
  eraser: () => svgI(`<path d="M6 30L24 12l16 16-12 12H16z" fill="#FF9CB1"/><path d="M6 30l8-8 16 16-2 2H16z" fill="#F4F0EA"/>
    <path d="M16 40h26" stroke="#B9AEA2" stroke-width="3" stroke-linecap="round"/>`),
  stamp: () => svgI(`<rect x="18" y="4" width="12" height="16" rx="5" fill="#B97F3F"/><path d="M11 20h26l2 8H9z" fill="#8B5E3C"/>
    <rect x="7" y="28" width="34" height="6" rx="2" fill="#E8414F"/><ellipse cx="24" cy="42" rx="15" ry="3.5" fill="#E8414F" opacity=".45"/>`),
  undo: () => svgI(`<path d="M18 12 7 21l11 9" fill="none" stroke="#45362A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 21h19c8 0 13 5 13 11s-5 10-12 10h-6" fill="none" stroke="#45362A" stroke-width="5" stroke-linecap="round"/>`),
  trash: () => svgI(`<path d="M12 15h24l-2 25a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill="#E8574C"/>
    <rect x="8" y="9" width="32" height="6" rx="2.5" fill="#C8453B"/><rect x="19" y="5" width="10" height="6" rx="2.5" fill="#C8453B"/>
    <path d="M19 21v16M24 21v16M29 21v16" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".85"/>`),
  paper: (c: string) => svgI(`<rect x="12" y="6" width="26" height="34" rx="3" fill="#FFE0EC" stroke="#E0A8BC" stroke-width="2" transform="rotate(10 25 23)"/>
    <rect x="9" y="8" width="26" height="34" rx="3" fill="#DDF0FF" stroke="#A8C8E0" stroke-width="2" transform="rotate(-6 22 25)"/>
    <rect x="10" y="9" width="26" height="34" rx="3" fill="${c}" stroke="#B9AEA2" stroke-width="2"/>`),
  ranger: () => svgI(`<path d="M4 14a4 4 0 0 1 4-4h11l4 5h17a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#E0A23A"/>
    <path d="M4 20h40v19a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#FFCE5C"/>
    <path d="M24 22v13m-6-6 6 6 6-6" stroke="#fff" stroke-width="3.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`),
  dossier: () => svgI(`<path d="M4 14a4 4 0 0 1 4-4h11l4 5h17a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#E0A23A"/>
    <rect x="11" y="10" width="20" height="16" rx="2" fill="#fff" transform="rotate(-8 21 18)"/>
    <rect x="18" y="12" width="20" height="16" rx="2" fill="#DDF0FF" transform="rotate(6 28 20)"/>
    <circle cx="24" cy="18" r="3" fill="#FF6B81"/><path d="M4 22h40v17a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="#FFCE5C"/>`),
  download: () => svgI(`<path d="M24 6v22m-9-9 9 9 9-9" stroke="#45362A" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 32v6a4 4 0 0 0 4 4h24a4 4 0 0 0 4-4v-6" stroke="#45362A" stroke-width="5" fill="none" stroke-linecap="round"/>`),
  close: () => svgI(`<path d="M12 12l24 24M36 12 12 36" stroke="#45362A" stroke-width="5.5" stroke-linecap="round"/>`)
}

type Tool = 'brush' | 'bucket' | 'eraser' | 'stamp'

interface Pour { fill: HTMLCanvasElement; x: number; y: number; r: number; rMax: number }
interface Stroke { x: number; y: number; mx: number; my: number; run: number; acc: number }


interface State {
  running: boolean
  profileId: string
  tool: Tool
  brush: Brush
  sym: Sym
  color: string
  paper: string
  size: number
  /** Un animal de la ferme, ou une princesse (`royal:jade`…). */
  stamp: string
  page: Page
  /** Le dessin du dossier en cours de reprise (null : la feuille du modèle). */
  galleryId: number | null
  paint: CanvasRenderingContext2D
  lines: CanvasRenderingContext2D
  /** Pixels de trait du dessin à colorier : les murs du pot de peinture. */
  wall: Uint8Array
  undo: ImageData[]
  strokes: Map<number, Stroke>
  hue: number
  pour: Pour | null
  stamps: Record<string, HTMLImageElement>
  saveId: number
  frameId: number
  clearId: number
  clearArmed: boolean
  dirty: boolean
  thumbs: Record<string, string>
  /** Le film du dessin : une petite image après chaque geste. */
  frames: Blob[]
  filming: boolean
  folderCount: number
  /** Le tampon en train de tomber (230 ms) : imprimé AVANT tout autre geste,
      changement de feuille ou « annuler » — sinon il atterrit après coup,
      sur la mauvaise feuille ou par-dessus l'annulation. */
  pending: (() => void) | null
  /** Nombre de gestes posés sur la feuille (pour le bot). */
  marks: number
}

let at: State | null = null
let ctx: GameContext

const pageKey = (me: State, id: string) => `${me.profileId}:${id}`
const paperKey = (key: string) => `ferme:atelier:papier:${key}`

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = rej
    im.src = src
  })
}
async function blobImage(b: Blob): Promise<HTMLImageElement | null> {
  const url = URL.createObjectURL(b)
  try { return await loadImage(url) } catch { return null } finally { URL.revokeObjectURL(url) }
}
const canvasBlob = (cv: HTMLCanvasElement, type = 'image/png', q?: number) =>
  new Promise<Blob | null>(res => cv.toBlob(b => res(b), type, q))
async function pageLines(p: Page, paper: string): Promise<CanvasImageSource> {
  if (p.img) {
    // Le trait d'une photo de princesse : en clair sur un papier sombre
    const im = await loadImage(p.img)
    if (!isDark(paper)) return im
    const cv = document.createElement('canvas')
    cv.width = im.width; cv.height = im.height
    const g = cv.getContext('2d')!
    g.drawImage(im, 0, 0)
    g.globalCompositeOperation = 'source-in'
    g.fillStyle = '#F4EFE6'; g.fillRect(0, 0, cv.width, cv.height)
    return cv
  }
  return loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(lineSvg(p, 3.2, isDark(paper) ? '#F4EFE6' : '#3A2E25')))
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

/** Le papier : sa couleur sous la feuille, et les traits du modèle en clair
    sur un papier sombre. */
async function setPaper(me: State, paper: string) {
  me.paper = paper
  const el = document.getElementById('atPaper')
  if (el) el.style.background = paper
  const pb = document.querySelector('#atPaperBtn')
  if (pb) pb.innerHTML = TOOL_ICON.paper(paper)
  document.querySelectorAll<HTMLElement>('.at-pp').forEach(b => b.classList.toggle('sel', b.dataset.c === paper))
  const p = me.page
  me.lines.clearRect(0, 0, W, H)
  if (!p.svg && !p.img) return
  const im = await pageLines(p, paper)
  if (at !== me || me.page !== p || me.paper !== paper) return
  me.lines.clearRect(0, 0, W, H)
  me.lines.drawImage(im, 0, 0, W, H)
}

/** Ouvre une feuille : celle du modèle `p`, ou un dessin du dossier `d`. */
async function openPage(me: State, p: Page, d?: Drawing) {
  flushStamp(me)
  flushSave(me)
  me.page = p
  me.galleryId = d ? d.id : null
  me.undo = []
  me.pour = null
  me.strokes.clear()
  document.querySelectorAll<HTMLElement>('.at-page').forEach(b => b.classList.toggle('sel', !d && b.dataset.p === p.id))
  document.getElementById('atBookBtn')?.classList.toggle('sel', !d && !!sheetById(p.id))
  document.querySelectorAll<HTMLElement>('.at-sheet').forEach(b => b.classList.toggle('sel', !d && b.dataset.p === p.id))
  document.getElementById('atFolderBtn')?.classList.toggle('sel', !!d)
  me.paint.clearRect(0, 0, W, H)
  me.lines.clearRect(0, 0, W, H)
  me.wall = new Uint8Array(W * H)
  const key = pageKey(me, p.id)
  let paper = PAPERS[0]
  try { paper = d ? d.paper : localStorage.getItem(paperKey(key)) || PAPERS[0] } catch { /* stockage refusé */ }
  if (p.svg || p.img) {
    // Les murs du pot de peinture : les traits du modèle, quelle que soit leur couleur
    const im = await pageLines(p, PAPERS[0])
    if (at !== me || me.page !== p) return
    me.lines.drawImage(im, 0, 0, W, H)
    const data = me.lines.getImageData(0, 0, W, H).data
    for (let i = 0; i < W * H; i++) me.wall[i] = data[i * 4 + 3] > 90 ? 1 : 0
  }
  await setPaper(me, paper)
  if (at !== me || me.page !== p) return
  if (d) {
    me.frames = [...(d.frames || [])]
    const im = await blobImage(d.paint)
    if (im && at === me && me.galleryId === d.id) me.paint.drawImage(im, 0, 0, W, H)
    return
  }
  me.frames = (await idbGet<Blob[]>('pages', key + ':frames')) || []
  const blob = await idbGet<Blob>('pages', key)
  if (at !== me || me.page !== p || me.galleryId !== null) return
  if (blob) {
    const im = await blobImage(blob)
    if (im) me.paint.drawImage(im, 0, 0, W, H)
  } else if (p.svg) {
    const old = await legacyFill(me, p)
    if (old && at === me && me.page === p) { me.paint.drawImage(old, 0, 0, W, H); me.dirty = true; scheduleSave(me) }
  }
}

/** L'image entière : papier, peinture, traits du modèle. */
function composite(me: State, w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const g = cv.getContext('2d')!
  g.fillStyle = me.paper
  g.fillRect(0, 0, w, h)
  g.drawImage(me.paint.canvas, 0, 0, w, h)
  g.drawImage(me.lines.canvas, 0, 0, w, h)
  return cv
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
  const galleryId = me.galleryId
  const paper = me.paper
  const frames = [...me.frames]
  const thumb = galleryId !== null ? composite(me, 360, 240) : null
  me.paint.canvas.toBlob(b => {
    if (!b) return
    if (galleryId !== null) {
      // Un dessin du dossier repris : c'est lui qu'on met à jour
      void canvasBlob(thumb!, 'image/jpeg', 0.82).then(async t => {
        const old = await idbGet<Drawing>('gallery', galleryId)
        if (old && t) await idbPut('gallery', { ...old, paint: b, thumb: t, frames, paper, at: Date.now() })
      })
      return
    }
    void idbPut('pages', b, key)
    void idbPut('pages', frames, key + ':frames')
    try { localStorage.setItem(paperKey(key), paper) } catch { /* stockage refusé */ }
    if (at === me) setThumb(me, id, URL.createObjectURL(b))
  }, 'image/png')
}
function setThumb(me: State, id: string, url: string) {
  if (me.thumbs[id]) URL.revokeObjectURL(me.thumbs[id])
  me.thumbs[id] = url
  const img = document.querySelector<HTMLImageElement>(`.at-page[data-p="${id}"] .at-thumb`)
  if (img) img.src = url
}

/* ---- Le film : une petite image après chaque geste ---- */
function scheduleFrame(me: State) {
  ctx.cancel(me.frameId)
  me.frameId = ctx.after(350, () => {
    if (at !== me) return
    void canvasBlob(composite(me, FRAME_W, FRAME_H), 'image/jpeg', 0.72).then(b => {
      if (!b || at !== me) return
      me.frames.push(b)
      if (me.frames.length > FRAMES_MAX) me.frames = me.frames.filter((_, i) => i % 2 === 0 || i === me.frames.length - 1)
    })
  })
}

/** Rejoue le film dans `cv` (≈ 5 s au plus), puis montre `last` s'il est donné. */
async function playFilm(me: State, frames: Blob[], cv: HTMLCanvasElement, last: HTMLCanvasElement | null, done?: () => void) {
  me.filming = true
  const imgs = (await Promise.all(frames.map(blobImage))).filter((x): x is HTMLImageElement => !!x)
  if (at !== me) return
  const g = cv.getContext('2d')!
  const per = Math.max(70, Math.min(260, 5000 / Math.max(1, imgs.length)))
  let i = 0
  sfx('whoosh', { vol: 0.4 })
  const tick = () => {
    if (at !== me) return
    if (i < imgs.length) {
      g.drawImage(imgs[i], 0, 0, cv.width, cv.height)
      if (i % 3 === 0) tone(660 + (i / Math.max(1, imgs.length)) * 520, 0.05, 'triangle', 0.04)
      i++
      ctx.after(per, tick)
      return
    }
    if (last) g.drawImage(last, 0, 0, cv.width, cv.height)
    sfx('confirm', { vol: 0.6, rate: 1.15 })
    ctx.after(900, () => { me.filming = false; done?.() })
  }
  tick()
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
  scheduleFrame(me)
}

/* ---- Le miroir : chaque geste est redessiné par ses reflets ---- */
type Mat = [number, number, number, number, number, number]
function symMats(sym: Sym): Mat[] {
  const id: Mat = [1, 0, 0, 1, 0, 0]
  if (sym === 1) return [id]
  const fx: Mat = [-1, 0, 0, 1, W, 0], fy: Mat = [1, 0, 0, -1, 0, H], fxy: Mat = [-1, 0, 0, -1, W, H]
  if (sym === 2) return [id, fx]
  if (sym === 4) return [id, fx, fy, fxy]
  // La rosace : huit rotations de 45° autour du centre de la feuille
  const cx = W / 2, cy = H / 2
  return Array.from({ length: 8 }, (_, k) => {
    const a = k * Math.PI / 4, c = Math.cos(a), s = Math.sin(a)
    return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy] as Mat
  })
}
function mirrored(me: State, draw: () => void) {
  const g = me.paint
  for (const m of symMats(me.sym)) { g.setTransform(...m); draw() }
  g.setTransform(1, 0, 0, 1, 0, 0)
}

/** Les guides du miroir, en pointillés sur la feuille (jamais dans le dessin). */
function paintGuides(me: State) {
  const el = document.getElementById('atGuides')
  if (!el) return
  const L = (x1: number, y1: number, x2: number, y2: number) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`
  let body = ''
  if (me.sym >= 2) body += L(W / 2, 0, W / 2, H)
  if (me.sym >= 4) body += L(0, H / 2, W, H / 2)
  if (me.sym === 8) body += L(W / 2 - H / 2, 0, W / 2 + H / 2, H) + L(W / 2 + H / 2, 0, W / 2 - H / 2, H)
  el.innerHTML = body
  const b = document.getElementById('atSym')
  if (b) { b.innerHTML = symIcon(me.sym); b.classList.toggle('on', me.sym > 1) }
}

/* ---- Pinceaux ---- */
function toPaper(e: PointerEvent, cv: HTMLCanvasElement) {
  const r = cv.getBoundingClientRect()
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }
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

const rainbow = (me: State, run: number) => `hsl(${(me.hue + run * 0.35) % 360}, 88%, 56%)`

/** Le style d'un trait continu (feutre, néon, aquarelle, arc-en-ciel, gomme). */
function strokeStyle(me: State, run: number) {
  const g = me.paint, size = SIZES[me.size]
  g.globalCompositeOperation = me.tool === 'eraser' ? 'destination-out' : 'source-over'
  g.globalAlpha = 1
  g.shadowBlur = 0
  g.shadowColor = 'transparent'
  g.lineCap = 'round'
  g.lineJoin = 'round'
  if (me.tool === 'eraser') { g.lineWidth = size * 1.6; g.strokeStyle = g.fillStyle = '#000'; return }
  const c = me.brush === 'arcenciel' ? rainbow(me, run) : me.color
  g.strokeStyle = g.fillStyle = c
  g.lineWidth = size
  if (me.brush === 'neon') { g.lineWidth = size * 0.55; g.shadowBlur = size * 0.9; g.shadowColor = c }
  if (me.brush === 'aquarelle') { g.lineWidth = size * 1.5; g.globalAlpha = 0.14; g.shadowBlur = size * 0.5; g.shadowColor = c }
}
function resetStyle(me: State) {
  const g = me.paint
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  g.shadowBlur = 0
  g.shadowColor = 'transparent'
}
const textured = (me: State) => me.tool === 'brush' && TEXTURED.includes(me.brush)

/** Une empreinte d'un pinceau à grain, au point (x, y). */
function grain(me: State, x: number, y: number) {
  const g = me.paint, size = SIZES[me.size], c = me.color
  const R = Math.random
  resetStyle(me)
  mirrored(me, () => {
    switch (me.brush) {
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
        g.fill(new Path2D(me.brush === 'coeurs' ? heartD(0, 0, s) : starD(0, 0, s * 0.62)))
        g.restore()
        break
      }
    }
  })
  resetStyle(me)
}

/** La touche au moment où le doigt se pose. */
function dab(me: State, x: number, y: number) {
  if (textured(me)) { grain(me, x, y); return }
  const g = me.paint
  strokeStyle(me, 0)
  mirrored(me, () => { g.beginPath(); g.arc(x, y, g.lineWidth / 2, 0, Math.PI * 2); g.fill() })
  resetStyle(me)
}

function segment(me: State, s: Stroke, x: number, y: number) {
  const g = me.paint
  const len = Math.hypot(x - s.x, y - s.y)
  if (textured(me)) {
    // Des empreintes à intervalle régulier le long du trait
    const size = SIZES[me.size]
    const step = me.brush === 'crayon' ? 2 : me.brush === 'craie' ? size * 0.22 : me.brush === 'spray' ? size * 0.3
      : me.brush === 'paillettes' ? size * 0.28 : size * 1.3
    let d = step - s.acc
    while (d <= len) {
      const t = d / len
      grain(me, s.x + (x - s.x) * t, s.y + (y - s.y) * t)
      d += step
    }
    s.acc = len - (d - step)
  } else {
    const mx = (s.x + x) / 2, my = (s.y + y) / 2
    strokeStyle(me, s.run)
    // Courbe lissée : du milieu précédent au milieu courant, en passant par le point
    mirrored(me, () => { g.beginPath(); g.moveTo(s.mx, s.my); g.quadraticCurveTo(s.x, s.y, mx, my); g.stroke() })
    if (me.tool === 'brush' && me.brush === 'neon') {
      // Le cœur blanc du néon
      g.shadowBlur = 0
      g.lineWidth = SIZES[me.size] * 0.2
      g.strokeStyle = 'rgba(255,255,255,.9)'
      mirrored(me, () => { g.beginPath(); g.moveTo(s.mx, s.my); g.quadraticCurveTo(s.x, s.y, mx, my); g.stroke() })
    }
    resetStyle(me)
    s.mx = mx; s.my = my
  }
  // Un petit frottement de feutre tous les 140 px de trait
  if (Math.floor((s.run + len) / 140) > Math.floor(s.run / 140)) {
    const soft = me.tool === 'eraser' ? 0.18 : me.brush === 'spray' ? 0.2 : 0.12
    sfx('cloth', { vol: soft, rate: me.tool === 'eraser' ? 0.8 : me.brush === 'spray' ? 2.2 : 1.5, spread: 0.2 })
  }
  s.run += len
  s.x = x; s.y = y
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
  // Couleur vue sur la feuille (le transparent, c'est le papier)
  const pap = hexRgb(me.paper)
  const comp = (i: number, k: number) => {
    const a = data[i * 4 + 3] / 255
    return data[i * 4 + k] * a + pap[k] * (1 - a)
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
  // Deux pixels de débord sous les traits : pas de liseré au bord
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
  scheduleFrame(me)
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
    // Le miroir reflète aussi les tampons
    mirrored(me, () => {
      g.save()
      g.translate(x, y)
      g.rotate(rot)
      g.drawImage(im, -s / 2, -s / 2, s, s)
      g.restore()
    })
    scheduleSave(me)
    scheduleFrame(me)
  }
  me.pending = print
  ctx.after(230, () => { if (at === me && me.pending === print) flushStamp(me) })
}
function pickStamp(me: State, b: HTMLElement) {
  me.stamp = b.dataset.k!
  document.querySelectorAll('.at-stamp').forEach(x => x.classList.toggle('sel', x === b))
  sfx('pluck', { vol: 0.5 })
}
function flushStamp(me: State) {
  const p = me.pending
  me.pending = null
  p?.()
}

/* ---- Les outils ---- */
function closeTrays() {
  document.querySelectorAll('.at-tray.open').forEach(t => t.classList.remove('open'))
}
function toggleTray(id: string, anchor: HTMLElement, side: 'right' | 'left') {
  const tray = document.getElementById(id)
  if (!tray) return
  const open = !tray.classList.contains('open')
  closeTrays()
  if (!open) return
  const arena = document.querySelector('.at-arena')!.getBoundingClientRect()
  const r = anchor.getBoundingClientRect()
  tray.style.top = Math.max(60, Math.min(arena.height - 20 - tray.offsetHeight, r.top - arena.top - 10)) + 'px'
  if (side === 'right') { tray.style.left = r.right - arena.left + 12 + 'px'; tray.style.right = '' }
  else { tray.style.right = arena.right - r.left + 12 + 'px'; tray.style.left = '' }
  tray.classList.add('open')
  sfx('open', { vol: 0.4 })
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
  if (b) b.innerHTML = BRUSH_ICON[me.brush](me.color)
  const k = document.querySelector('.at-tool[data-t="bucket"]')
  if (k) k.innerHTML = TOOL_ICON.bucket(me.color)
  document.querySelectorAll<HTMLElement>('.at-bk').forEach(x => {
    x.innerHTML = BRUSH_ICON[x.dataset.b as Brush](me.color)
    x.classList.toggle('sel', x.dataset.b === me.brush)
  })
  document.querySelectorAll<HTMLElement>('.at-size i').forEach(i => { i.style.background = me.brush === 'arcenciel' ? 'conic-gradient(#E8414F,#FFD43B,#2F9E44,#1C64C8,#9C6ADE,#E8414F)' : me.color })
}

/** La feuille est-elle encore vierge ? (échantillon grossier) */
function blank(me: State): boolean {
  const d = me.paint.getImageData(0, 0, W, H).data
  for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) return false
  return true
}

/* La feuille garde son format 3:2 dans la place qui reste */
function fitPaper(desk: HTMLElement, paper: HTMLElement) {
  const r = desk.getBoundingClientRect()
  const pad = 18
  const w = Math.max(100, Math.min(r.width - pad * 2, (r.height - pad * 2) * W / H))
  paper.style.width = w + 'px'
  paper.style.height = w * H / W + 'px'
}

/* ---- Le dossier ---- */
async function refreshCount(me: State) {
  const n = (await drawings(me.profileId)).length
  if (at !== me) return
  me.folderCount = n
  const b = document.getElementById('atFolderN')
  if (b) { b.textContent = n ? String(n) : ''; b.classList.toggle('on', n > 0) }
}

/** « Ranger » : le dessin vole dans le dossier, et une feuille propre revient. */
async function range(me: State) {
  flushStamp(me)
  finishPour(me)
  const btn = document.getElementById('atRanger')!
  if (blank(me)) {
    sfx('error', { vol: 0.35 })
    btn.classList.remove('at-no'); void btn.offsetWidth; btn.classList.add('at-no')
    return
  }
  const final = composite(me, 360, 240)
  const [paint, thumb] = await Promise.all([canvasBlob(me.paint.canvas), canvasBlob(final, 'image/jpeg', 0.82)])
  if (!paint || !thumb || at !== me) return
  await canvasBlob(composite(me, FRAME_W, FRAME_H), 'image/jpeg', 0.72).then(b => { if (b) me.frames.push(b) })
  const entry: Drawing = {
    id: me.galleryId ?? Date.now(), profile: me.profileId, page: me.page.id, paper: me.paper,
    paint, thumb, frames: [...me.frames], at: Date.now()
  }
  await idbPut('gallery', entry)
  if (at !== me) return
  // Le dessin s'envole vers le dossier
  const paperEl = document.getElementById('atPaper')!, folder = document.getElementById('atFolderBtn')!
  const a = paperEl.getBoundingClientRect(), f = folder.getBoundingClientRect()
  const fly = document.createElement('img')
  fly.className = 'at-fly'
  fly.src = final.toDataURL('image/jpeg', 0.8)
  fly.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px`
  document.body.appendChild(fly)
  void fly.offsetWidth
  fly.style.transform = `translate(${f.left + f.width / 2 - a.left - a.width / 2}px,${f.top + f.height / 2 - a.top - a.height / 2}px) scale(.08) rotate(-12deg)`
  fly.style.opacity = '0.4'
  ctx.after(650, () => { fly.remove(); folder.classList.remove('at-bump'); void folder.offsetWidth; folder.classList.add('at-bump') })
  sfx('whoosh', { vol: 0.5 })
  ctx.after(450, () => sfx('confirm', { vol: 0.6 }))
  me.marks++
  void refreshCount(me)
  if (me.galleryId !== null) {
    // Un dessin du dossier, rangé à nouveau : on retrouve la feuille du modèle
    // telle qu'elle était (surtout ne pas l'écraser par une feuille vide)
    me.galleryId = null
    void openPage(me, me.page)
    return
  }
  // Une feuille propre, sur le même modèle
  me.undo = []
  me.paint.clearRect(0, 0, W, H)
  me.frames = []
  me.dirty = true
  flushSave(me)
}

function exportPng(cv: HTMLCanvasElement) {
  cv.toBlob(b => {
    if (!b) return
    const url = URL.createObjectURL(b)
    const a = document.createElement('a')
    const d = new Date()
    a.href = url
    a.download = `dessin-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    ctx.after(4000, () => URL.revokeObjectURL(url)) // après le téléchargement
  }, 'image/png')
  sfx('confirm', { vol: 0.5 })
}

/** Un dessin du dossier, en grand : papier, peinture, traits du modèle. */
async function drawingCanvas(d: Drawing, w: number, h: number): Promise<HTMLCanvasElement> {
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const g = cv.getContext('2d')!
  g.fillStyle = d.paper
  g.fillRect(0, 0, w, h)
  const im = await blobImage(d.paint)
  if (im) g.drawImage(im, 0, 0, w, h)
  const p = await pageFor(d.page)
  if (p && (p.svg || p.img)) { try { g.drawImage(await pageLines(p, d.paper), 0, 0, w, h) } catch { /* sans les traits */ } }
  return cv
}

async function openFolder(me: State) {
  flushStamp(me)
  finishPour(me)
  flushSave(me)
  closeTrays()
  const box = document.getElementById('atFolder')!
  const grid = document.getElementById('atFGrid')!
  const view = document.getElementById('atFView')!
  view.hidden = true
  grid.hidden = false
  const list = await drawings(me.profileId)
  if (at !== me) return
  grid.querySelectorAll('img').forEach(i => URL.revokeObjectURL(i.src))
  grid.innerHTML = list.length
    ? list.map(d => `<button class="at-fcard" data-id="${d.id}" aria-label="Dessin"><img alt="" src="${URL.createObjectURL(d.thumb)}"></button>`).join('')
    : `<div class="at-fempty">${TOOL_ICON.dossier()}</div>`
  grid.querySelectorAll<HTMLElement>('.at-fcard').forEach(b => {
    b.onclick = () => {
      const d = list.find(x => x.id === Number(b.dataset.id))
      if (d) void showDrawing(me, d)
    }
  })
  box.hidden = false
  sfx('open', { vol: 0.5 })
}

function closeFolder() {
  const box = document.getElementById('atFolder')
  if (!box) return
  box.hidden = true
  box.querySelectorAll<HTMLImageElement>('.at-fcard img').forEach(i => URL.revokeObjectURL(i.src))
}

async function showDrawing(me: State, d: Drawing) {
  const grid = document.getElementById('atFGrid')!
  const view = document.getElementById('atFView')!
  const cv = document.getElementById('atFCanvas') as HTMLCanvasElement
  const full = await drawingCanvas(d, 900, 600)
  if (at !== me) return
  cv.getContext('2d')!.drawImage(full, 0, 0, cv.width, cv.height)
  grid.hidden = true
  view.hidden = false
  sfx('pluck', { vol: 0.5 })
  const del = document.getElementById('atFDel')!
  del.classList.remove('arm')
  let armed = false, armId = 0
  ;(document.getElementById('atFEdit') as HTMLButtonElement).onclick = () => {
    if (me.filming) return
    closeFolder()
    sfx('open', { vol: 0.5 })
    void pageFor(d.page).then(p => { if (at === me) void openPage(me, p || PAGES[0], d) })
  }
  ;(document.getElementById('atFFilm') as HTMLButtonElement).onclick = () => {
    if (me.filming) return
    if (d.frames?.length) void playFilm(me, d.frames, cv, full)
    else sfx('error', { vol: 0.3 })
  }
  ;(document.getElementById('atFSave') as HTMLButtonElement).onclick = () => {
    void drawingCanvas(d, W, H).then(exportPng)
  }
  del.onclick = async () => {
    if (me.filming) return
    if (!armed) {
      armed = true
      del.classList.add('arm')
      sfx('switch', { vol: 0.5 })
      armId = ctx.after(2600, () => { armed = false; del.classList.remove('arm') })
      return
    }
    ctx.cancel(armId)
    await idbDel('gallery', d.id)
    if (me.galleryId === d.id) me.galleryId = null
    sfx('whoosh', { vol: 0.5 })
    void refreshCount(me)
    void openFolder(me)
  }
}

export const coloring: GameDef = {
  id: 'coloring', name: 'L\'Atelier', icon: '🎨', sq: 'sq-sun', cat: 'creatif', music: 'meadow',
  subtitle: 'Dessine au doigt, remplis, tamponne',
  // La main : un trait sur la feuille (le seau et les tampons : un toucher)
  hand: root => {
    const me = at
    const paper = root.querySelector('#atPaint')
    const folder = root.querySelector<HTMLElement>('#atFolder')
    if (!me || !paper || !me.running || me.filming || me.strokes.size || me.pour || (folder && !folder.hidden)) return null
    const r = paper.getBoundingClientRect()
    const p = (u: number, v: number) => ({ x: r.left + r.width * u, y: r.top + r.height * v })
    return me.tool === 'bucket' || me.tool === 'stamp' ? { tap: p(0.5, 0.5) } : { drag: [p(0.32, 0.4), p(0.68, 0.6)] }
  },
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="arena at-arena">
        <div class="at-tools">
          <button class="at-tool sel" data-t="brush" id="atBrush" aria-label="Pinceau"></button>
          <button class="at-tool" data-t="bucket" aria-label="Pot de peinture"></button>
          <button class="at-tool" data-t="eraser" aria-label="Gomme">${TOOL_ICON.eraser()}</button>
          <button class="at-tool" data-t="stamp" aria-label="Tampons">${TOOL_ICON.stamp()}</button>
          <button class="at-tool at-sym" id="atSym" aria-label="Miroir"></button>
          <div class="at-sizes">
            ${SIZES.map((_, i) => `<button class="at-size${i === 1 ? ' sel' : ''}" data-s="${i}" aria-label="Taille"><i style="width:${8 + i * 9}px;height:${8 + i * 9}px"></i></button>`).join('')}
          </div>
          <button class="at-tool" id="atUndo" aria-label="Annuler">${TOOL_ICON.undo()}</button>
          <button class="at-tool at-trash" id="atClear" aria-label="Tout effacer">${TOOL_ICON.trash()}</button>
        </div>
        <div class="at-desk" id="atDesk">
          <div class="at-paper" id="atPaper">
            <canvas id="atPaint" width="${W}" height="${H}"></canvas>
            <canvas id="atLines" width="${W}" height="${H}"></canvas>
            <svg class="at-guides" id="atGuides" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"></svg>
            <canvas class="at-film" id="atFilm" width="900" height="600"></canvas>
          </div>
        </div>
        <div class="at-side">
          <div class="at-pages">
            ${PAGES.map((p, i) => `<button class="at-page${i === 0 ? ' sel' : ''}" data-p="${p.id}" aria-label="Feuille">
              <img class="at-thumb" alt="">${p.svg ? lineSvg(p, 7).replace(/ width="\d+" height="\d+"/, '') : ''}</button>`).join('')}
            <button class="at-page at-bookbtn" id="atBookBtn" aria-label="Coloriages"><img class="at-bookcover" alt=""></button>
          </div>
          <div class="at-row">
            <button class="at-tool at-small" id="atPaperBtn" aria-label="Papier"></button>
            <button class="at-tool at-small" id="atRanger" aria-label="Ranger">${TOOL_ICON.ranger()}</button>
            <button class="at-tool at-small at-folderbtn" id="atFolderBtn" aria-label="Dossier">${TOOL_ICON.dossier()}<b id="atFolderN"></b></button>
          </div>
          <div class="at-pal">
            ${PALETTE.map((p, i) => `<button class="at-color${i === 7 ? ' sel' : ''}" data-c="${p}" style="background:${p}" aria-label="Couleur"></button>`).join('')}
          </div>
          <div class="at-stamps">
            ${FARM.map((k, i) => `<button class="at-stamp${i === 0 ? ' sel' : ''}" data-k="${k}" aria-label="Tampon"></button>`).join('')}
          </div>
        </div>
        <div class="at-tray at-brushes" id="atBrushes">
          ${BRUSHES.map(b => `<button class="at-bk" data-b="${b}" aria-label="Pinceau"></button>`).join('')}
        </div>
        <div class="at-tray at-book" id="atBook"></div>
        <div class="at-tray at-papers" id="atPapers">
          ${PAPERS.map(p => `<button class="at-pp" data-c="${p}" style="background:${p}" aria-label="Papier"></button>`).join('')}
        </div>
        <div class="at-folder" id="atFolder" hidden>
          <div class="at-fgrid" id="atFGrid"></div>
          <div class="at-fview" id="atFView" hidden>
            <canvas id="atFCanvas" width="900" height="600"></canvas>
            <div class="at-factions">
              <button class="at-tool" id="atFEdit" aria-label="Reprendre">${BRUSH_ICON.feutre('#FF6B81')}</button>
              <button class="at-tool" id="atFFilm" aria-label="Film">${svgI('<path d="M15 10v28l24-14z" fill="#45362A"/>')}</button>
              <button class="at-tool" id="atFSave" aria-label="Enregistrer">${TOOL_ICON.download()}</button>
              <button class="at-tool at-trash" id="atFDel" aria-label="Jeter">${TOOL_ICON.trash()}</button>
            </div>
          </div>
          <button class="at-tool at-fclose" id="atFClose" aria-label="Fermer">${TOOL_ICON.close()}</button>
        </div>
        <button class="sn-tool go at-done" id="atDone" aria-label="Fini">${ICON.check}</button>
      </div>`
    preloadSfx(['cloth', 'click', 'confirm', 'drop', 'pluck', 'switch', 'whoosh', 'error', 'open'])

    const paintCv = document.getElementById('atPaint') as HTMLCanvasElement
    const linesCv = document.getElementById('atLines') as HTMLCanvasElement
    const me: State = {
      running: true,
      profileId: useFerme.getState().currentId,
      tool: 'brush', brush: 'feutre', sym: 1, color: PALETTE[7], paper: PAPERS[0], size: 1, stamp: FARM[0],
      page: PAGES[0], galleryId: null,
      paint: paintCv.getContext('2d', { willReadFrequently: true })!,
      lines: linesCv.getContext('2d', { willReadFrequently: true })!,
      wall: new Uint8Array(W * H),
      undo: [], strokes: new Map(), hue: 0, pour: null, stamps: {}, pending: null,
      saveId: 0, frameId: 0, clearId: 0, clearArmed: false, dirty: false, thumbs: {}, frames: [], filming: false,
      folderCount: 0, marks: 0
    }
    at = me
    tintIcons(me)
    paintGuides(me)

    // La feuille suit la place disponible
    const desk = document.getElementById('atDesk')!
    const paper = document.getElementById('atPaper')!
    const ro = new ResizeObserver(() => fitPaper(desk, paper))
    ro.observe(desk)
    fitPaper(desk, paper)

    // Outils
    document.querySelectorAll<HTMLElement>('.at-tool[data-t]').forEach(b => {
      b.onclick = () => {
        if (!me.running) return
        const t = b.dataset.t as Tool
        if (t === 'brush') {
          // Le pinceau ouvre son tiroir : dix pinceaux
          if (me.tool !== 'brush') selectTool(me, 'brush')
          toggleTray('atBrushes', b, 'right')
          return
        }
        closeTrays()
        selectTool(me, t)
      }
    })
    document.querySelectorAll<HTMLElement>('.at-bk').forEach(b => {
      b.onclick = () => {
        if (!me.running) return
        me.brush = b.dataset.b as Brush
        tintIcons(me)
        closeTrays()
        sfx('pluck', { vol: 0.45, rate: 1 + BRUSHES.indexOf(me.brush) * 0.05 })
      }
    })
    ;(document.getElementById('atSym') as HTMLButtonElement).onclick = () => {
      if (!me.running) return
      closeTrays()
      me.sym = SYMS[(SYMS.indexOf(me.sym) + 1) % SYMS.length]
      paintGuides(me)
      sfx('switch', { vol: 0.45, rate: 0.9 + SYMS.indexOf(me.sym) * 0.12 })
    }
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
        if (me.tool === 'eraser' || me.tool === 'stamp') selectTool(me, 'brush')
        if (me.brush === 'arcenciel') me.brush = 'feutre'
        tintIcons(me)
        sfx('click', { vol: 0.4 })
      }
    })
    document.querySelectorAll<HTMLElement>('.at-stamp').forEach(b => {
      b.onclick = () => {
        if (!me.running) return
        pickStamp(me, b)
      }
    })
    document.querySelectorAll<HTMLElement>('.at-page').forEach(b => wirePage(me, b))
    void (async () => {
      // Les coloriages des princesses (photos de la Princesse), les plus récents
      const ids = (await princessPages()).slice(0, PRINCESS_SHOWN)
      const host = document.querySelector('.at-pages')
      for (const id of ids) {
        if (at !== me || !host) return
        let p = EXTRA.find(x => x.id === id)
        if (!p) {
          const blob = await idbGet<Blob>('pages', id + ':trait')
          if (!blob || at !== me) continue
          p = { id, svg: '', img: URL.createObjectURL(blob) }
          EXTRA.push(p)
        }
        const b = document.createElement('button')
        b.className = 'at-page'
        b.dataset.p = id
        b.setAttribute('aria-label', 'Feuille')
        b.innerHTML = `<img class="at-thumb" alt=""><img src="${p.img}" alt="">`
        host.appendChild(b)
        wirePage(me, b)
        void idbGet<Blob>('pages', pageKey(me, id)).then(t => { if (t && at === me) setThumb(me, id, URL.createObjectURL(t)) })
      }
    })()
    function wirePage(me: State, b: HTMLElement) {
      b.onclick = () => {
        if (!me.running) return
        closeTrays()
        const p = pageById(b.dataset.p!)!
        if (p === me.page && me.galleryId === null) return
        sfx('open', { vol: 0.5 })
        void openPage(me, p)
      }
    }
    // Le livre de coloriages : les animaux de la ferme, le train, la fusée, la grange
    const bookBtn = document.getElementById('atBookBtn') as HTMLButtonElement
    const book = document.getElementById('atBook')!
    book.innerHTML = SHEETS.map(sh => `<button class="at-sheet" data-p="${sh.id}" aria-label="Coloriage"><img alt=""></button>`).join('')
    let bookFilled = false
    bookBtn.onclick = () => {
      if (!me.running) return
      toggleTray('atBook', bookBtn, 'left')
      if (bookFilled) return
      bookFilled = true
      void sheetMinis().then(urls => {
        if (at !== me) return
        for (const [id, url] of Object.entries(urls)) {
          const img = book.querySelector<HTMLImageElement>(`.at-sheet[data-p="${id}"] img`)
          if (img) img.src = url
        }
      })
    }
    book.querySelectorAll<HTMLElement>('.at-sheet').forEach(b => {
      b.onclick = async () => {
        if (!me.running || b.classList.contains('busy')) return
        b.classList.add('busy')
        const p = await sheetPage(b.dataset.p!)
        b.classList.remove('busy')
        if (!p || at !== me) return
        closeTrays()
        if (p === me.page && me.galleryId === null) return
        sfx('open', { vol: 0.5 })
        void openPage(me, p)
      }
    })
    critterPortraits(['cow'], 120).then(u => {
      const im = bookBtn.querySelector<HTMLImageElement>('img')
      if (u.cow && im && at === me) im.src = u.cow
    })
    const paperBtn = document.getElementById('atPaperBtn') as HTMLButtonElement
    paperBtn.onclick = () => { if (me.running) toggleTray('atPapers', paperBtn, 'left') }
    document.querySelectorAll<HTMLElement>('.at-pp').forEach(b => {
      b.onclick = () => {
        if (!me.running) return
        closeTrays()
        void setPaper(me, b.dataset.c!)
        me.marks++
        scheduleSave(me)
        scheduleFrame(me)
        sfx('cloth', { vol: 0.4, rate: 1.1 })
      }
    })
    ;(document.getElementById('atRanger') as HTMLButtonElement).onclick = () => { if (me.running && !me.filming) { closeTrays(); void range(me) } }
    ;(document.getElementById('atFolderBtn') as HTMLButtonElement).onclick = () => { if (me.running && !me.filming) void openFolder(me) }
    ;(document.getElementById('atFClose') as HTMLButtonElement).onclick = () => {
      if (me.filming) return
      const view = document.getElementById('atFView')!
      if (!view.hidden) { void openFolder(me); return } // de l'aperçu, on revient au dossier
      closeFolder()
      sfx('click', { vol: 0.4 })
    }
    ;(document.getElementById('atUndo') as HTMLButtonElement).onclick = () => { if (me.running) { closeTrays(); undo(me) } }
    // « Tout effacer » : deux touchers (le premier arme la poubelle), et la feuille part en boule
    const clearBtn = document.getElementById('atClear') as HTMLButtonElement
    clearBtn.onclick = () => {
      if (!me.running || me.filming) return
      closeTrays()
      if (!me.clearArmed) {
        me.clearArmed = true
        clearBtn.classList.add('arm')
        sfx('switch', { vol: 0.5 })
        ctx.cancel(me.clearId)
        me.clearId = ctx.after(2600, () => { me.clearArmed = false; clearBtn.classList.remove('arm') })
        return
      }
      me.clearArmed = false
      clearBtn.classList.remove('arm')
      ctx.cancel(me.clearId)
      snapshot(me)
      paper.classList.remove('at-swish', 'at-crumple'); void paper.offsetWidth; paper.classList.add('at-crumple')
      sfx('whoosh', { vol: 0.7, rate: 0.8 })
      ctx.after(430, () => {
        if (at !== me) return
        me.paint.clearRect(0, 0, W, H)
        me.frames = []
        // Un dessin du dossier ne s'efface pas : la feuille propre redevient celle du modèle
        if (me.galleryId !== null) {
          me.galleryId = null
          document.querySelectorAll<HTMLElement>('.at-page').forEach(b => b.classList.toggle('sel', b.dataset.p === me.page.id))
          document.getElementById('atFolderBtn')?.classList.remove('sel')
        }
        paper.classList.remove('at-crumple'); void paper.offsetWidth; paper.classList.add('at-swish')
        me.marks++
        scheduleSave(me)
      })
    }
    ;(document.getElementById('atDone') as HTMLButtonElement).onclick = () => {
      if (!me.running || me.filming) return
      closeTrays()
      flushStamp(me)
      finishPour(me)
      flushSave(me)
      const end = () => c.finish({ title: 'Chef-d\'œuvre !', msg: 'Ton dessin est gardé dans l\'Atelier', stars: 3 })
      // Le film du dessin, puis la fête
      if (me.frames.length >= 3) {
        const film = document.getElementById('atFilm') as HTMLCanvasElement
        film.classList.add('on')
        void playFilm(me, me.frames, film, composite(me, 900, 600), end)
      } else end()
    }

    // Dessin au doigt — plusieurs doigts à la fois, chacun son trait
    const down = (e: PointerEvent) => {
      if (!me.running || me.filming) return
      e.preventDefault()
      closeTrays()
      const p = toPaper(e, paintCv)
      if (me.tool === 'bucket') { pourAt(me, p.x, p.y); return }
      if (me.tool === 'stamp') { stampAt(me, p.x, p.y); return }
      if (!me.strokes.size) snapshot(me)
      paintCv.setPointerCapture?.(e.pointerId)
      if (me.brush === 'arcenciel') me.hue = (me.hue + 47) % 360
      me.strokes.set(e.pointerId, { x: p.x, y: p.y, mx: p.x, my: p.y, run: 0, acc: 0 })
      dab(me, p.x, p.y)
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
      if (!textured(me)) {
        // La fin du trait lissé, jusqu'au dernier point
        const g = me.paint
        strokeStyle(me, s.run)
        mirrored(me, () => { g.beginPath(); g.moveTo(s.mx, s.my); g.lineTo(s.x, s.y); g.stroke() })
        resetStyle(me)
      }
      me.strokes.delete(e.pointerId)
      scheduleSave(me)
      scheduleFrame(me)
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

    // Tampons : leurs princesses (gardées dans la Princesse), rendues en images
    const rs = useFerme.getState().royals
    for (const slot of ['jade', 'joyce', 'solo'] as const) {
      const look = rs[slot]
      if (!look || (slot === 'solo' && (rs.jade || rs.joyce))) continue
      void princessPortraits([look], ['wave'], 180).then(async urls => {
        if (at !== me || !urls.wave) return
        // Carrée (les tampons le sont), la princesse au milieu
        const src = await loadImage(urls.wave)
        const cv = document.createElement('canvas')
        cv.width = cv.height = src.height
        cv.getContext('2d')!.drawImage(src, (src.height - src.width) / 2, 0)
        const url = cv.toDataURL()
        const im = new Image()
        im.src = url
        const key = 'royal:' + slot
        me.stamps[key] = im
        const host = document.querySelector('.at-stamps')
        if (!host || host.querySelector(`[data-k="${key}"]`)) return
        const b = document.createElement('button')
        b.className = 'at-stamp'
        b.dataset.k = key
        b.setAttribute('aria-label', 'Tampon')
        b.innerHTML = `<img src="${url}" alt="">`
        host.prepend(b)
        b.onclick = () => { if (me.running) pickStamp(me, b) }
      })
    }
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

    // Vignettes des feuilles déjà dessinées, le dossier, puis la première feuille
    for (const p of PAGES) {
      void idbGet<Blob>('pages', pageKey(me, p.id)).then(b => { if (b && at === me) setThumb(me, p.id, URL.createObjectURL(b)) })
    }
    void refreshCount(me)
    void openPage(me, PAGES[0])

    if ((window as { __BOT?: boolean }).__BOT) {
      (window as unknown as { __at: unknown }).__at = {
        get marks() { return me.marks },
        get pouring() { return !!me.pour },
        get undo() { return me.undo.length },
        get folder() { return me.folderCount },
        get gallery() { return me.galleryId },
        get filming() { return me.filming },
        get frames() { return me.frames.length },
        get sym() { return me.sym },
        get brush() { return me.brush },
        get paper() { return me.paper },
        get page() { return me.page.id },
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
      closeFolder()
      document.querySelectorAll('.at-fly').forEach(x => x.remove())
      if (at === me) at = null
      const urls = Object.values(me.thumbs)
      me.thumbs = {}
      for (const u of urls) URL.revokeObjectURL(u)
      me.undo = []
      delete (window as { __at?: unknown }).__at
    }
  }
}
