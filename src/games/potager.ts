import type { GameContext, GameDef, Op } from '../core/types'
import { $, pick } from '../core/utils'
import { ICON } from '../core/icons'
import { sfx, preloadSfx } from '../core/sfx'
import { tone } from '../core/audio'
import { setMusicIntensity } from '../core/music'
import { onPause } from '../core/session'
import { plantUrl, rowPlant, preloadPlants, type Plant } from '../core/plants'
import {
  addChoices, addKey, addPool, beginGame, divChoices, divFact, divPool, factEase, isFast, loadMemory, mulChoices, mulKey,
  mulPool, nearMiss, nearMissAdd, orient, planHarvest, record, requeue, saveMemory, subChoices, subFact, subPool, viewLevel,
  LV, type Fact, type Item, type Level, type Memory
} from '../core/facts'

/* 🥕 Le Potager — LE jeu des calculs (27/09 : « je veux un seul jeu »). Il
   remplace le Grand Tableau + : les quatre opérations dans la même grille
   claire (la maquette « 5a » du père), où chaque case d'une forme reçoit sa
   plante — une espèce par rangée (`core/plants.ts`).

   À l'ouverture, avant la difficulté, les étiquettes + − × ÷ (GameHost,
   `ctx.ops`) : on en allume une ou plusieurs. La grille montre le tableau
   des + (pour + et −) ou celui des × (pour × et ÷) ; son coin dit lequel.

   - × : 7 × 8, c'est 7 rangées de 8. Le total de chaque rangée s'écrit en
     grand sur la dernière colonne (8, 16… 56), là où il vit dans la table ;
   - + : 7 + 4, c'est partir de la rangée du 7 et avancer de 4 cases. Chaque
     case pousse en chantant : 8, 9, 10, 11 — et 11 tombe sur la case 7 + 4 ;
   - ÷ et − : la table lue à l'envers. 56 ÷ 7, c'est chercher 56 dans la
     rangée du 7 ; 11 − 7, chercher 11 dans la rangée du 7.
   Le résultat éclate en pastille VERTE (le vert dit « juste », le rouge
   « faux »). Chaque rangée — ou chaque case — sonne une note plus haute.

   Trois modes :
   - Parcours (il s'ouvre en premier) : découvrir 10 cases au choix (dans
     les tables du niveau), puis ces 10 cases reviennent trois fois, de plus
     en plus dur : 4 réponses au choix (avec le contour), le pavé (le « ? »
     seul), puis « trouve la case » (un nombre, la grille vide : toute case
     qui le vaut est juste). Les étoiles comptent les 30 réponses justes ;
   - Découvre : on touche une case, la forme pousse et se compte ; puis les
     plantes s'en vont et le RÉSULTAT RESTE, en gros, sans plante dessous
     (retour de Joyce, 27/09) — jusqu'à allumer toute la grille, et le
     potager fleurit. « Tourne » : 7 × 8 = 8 × 7, 7 + 4 = 4 + 7 ;
   - Récolte : douze questions composées par la mémoire des calculs
     (`core/facts.ts`), l'aide qui s'efface calcul par calcul.
   **La réponse n'apparaît JAMAIS avant qu'elle choisisse** (25/09).

   Apprendre, donc AUCUNE sanction : ni vies, ni chrono, ni bonus de vitesse.
   Le temps de réponse est mesuré en silence. Une erreur ne se refait pas
   sur-le-champ : le « presque » est dessiné (49 pour 7 × 8 : SON carré
   7 × 7, 49 barré à sa vraie place ; 10 pour 7 + 4 : sa bande), ce qui
   manque pousse en or, la bonne réponse s'écrit en vert, puis on passe à la
   suite. La voix ne dit que le contenu (« sept fois huit », « 56 »). */

type Mode = 'path' | 'discover' | 'harvest'
/** Le tableau montré : celui des × (pour × et ÷) ou celui des + (pour + et −). */
type Fam = 'mul' | 'add'

const N = 10
const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const STEP = 380            // un temps de la mélodie des rangées (ms)
const STEP_ADD = 300        // un pas de la bande de l'addition (ms)
const PATH_N = 10           // cases du Parcours
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760]
const MARKS = ['pl', 'tot', 'res', 'her', 'gold', 'over', 'dig', 'q', 'num', 'bump'] as const
const SYM: Record<Op, string> = { add: '+', sub: '−', mul: '×', div: '÷' }
const STAGE_ICON = [ICON.tap, ICON.choices, ICON.digits, ICON.target]

const famOf = (op: Op): Fam => (op === 'mul' || op === 'div' ? 'mul' : 'add')
const direct = (op: Op) => op === 'mul' || op === 'add'
/** La valeur d'une case dans le tableau `fam`. */
const val = (fam: Fam, r: number, c: number) => (fam === 'mul' ? r * c : r + c)
/** Nombre de cases d'une forme : le rectangle du ×, la bande du +. */
const size = (fam: Fam, r: number, c: number) => (fam === 'mul' ? r * c : c)

/** La phrase de la voix : le contenu, jamais une consigne. */
function phrase(op: Op, r: number, c: number): string {
  if (op === 'mul') return `${r === 1 ? 'une' : r} fois ${c}`
  if (op === 'add') return `${r} plus ${c}`
  if (op === 'div') return `${r * c} divisé par ${r}`
  return `${r + c} moins ${r}`
}

/** Couleur d'une case selon sa valeur : petit → jaune, grand → corail. */
function cellColor(fam: Fam, v: number): string {
  const t = fam === 'mul' ? Math.min(1, Math.max(0, (v - 1) / 99)) : Math.min(1, Math.max(0, (v - 2) / 18))
  const a = [255, 224, 138], b = [255, 123, 107]
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(',')})`
}

function factOf(op: Op, r: number, c: number): Fact {
  if (op === 'mul') return { key: mulKey(r, c), a: Math.min(r, c), b: Math.max(r, c), op }
  if (op === 'add') return { key: addKey(r, c), a: Math.min(r, c), b: Math.max(r, c), op }
  return op === 'div' ? divFact(r, c) : subFact(r, c)
}

interface Cell {
  el: HTMLElement
  img: HTMLImageElement
  /** Le nombre d'une marque (total, résultat, « ? »…). */
  n: HTMLElement
  /** Le résultat GARDÉ d'une case découverte, en gros, sans plante. */
  k: HTMLElement
  r: number
  c: number
  sp: Plant
}

interface Q {
  item: Item
  op: Op
  fam: Fam
  /** La rangée (premier nombre, ou diviseur / nombre ôté) et la colonne. */
  r: number
  c: number
  /** Ce qu'on demande : la case (× +), ou la colonne (÷ −). */
  ans: number
  view: Level
  tries: number
  ready: boolean
  t0: number
  pad: boolean
  typed: string
  opts: number[]
  /** Parcours, « trouve la case » : le nombre à chercher dans la grille (0 sinon). */
  find: number
}

interface Tile { fam: Fam; r: number; c: number }

interface Path {
  /** 0 découvrir, 1 quatre choix, 2 le pavé, 3 trouve la case. */
  stage: number
  tiles: Tile[]
  list: { fam: Fam; op: Op; r: number; c: number }[]
  i: number
  /** Réponses justes du premier coup (étapes 1 à 3) : les étoiles. */
  good: number
  kept: Record<Fam, Map<string, number>>
}

interface State {
  mode: Mode
  ops: Op[]
  fams: Fam[]
  fam: Fam
  gen: number
  lock: boolean
  over: boolean
  counting: boolean
  cells: Cell[]
  rows: HTMLElement[]
  cols: HTMLElement[]
  corner: HTMLElement
  grid: HTMLElement
  frame: HTMLElement
  /** La forme plantée. */
  R: number
  C: number
  /** La dernière case découverte (pour « Tourne »). */
  lastR: number
  lastC: number
  /** Les cases découvertes dans Découvre, par tableau (pour cette partie). */
  found: Record<Fam, Map<string, number>>
  mem: Memory
  queue: Item[]
  qi: number
  q: Q | null
  firstTry: number
  streak: number
  done: number
  drag: number | null
  hint: HTMLElement | null
  pausedMs: number
  pauseAt: number
  path: Path | null
}

let pg: State | null = null
let ctx: GameContext

const cellAt = (me: State, r: number, c: number) => me.cells[(r - 1) * N + (c - 1)]
const emptyKept = (): Record<Fam, Map<string, number>> => ({ mul: new Map(), add: new Map() })
const tables = () => ctx.byTier([2, 5, 10], [1, 2, 3, 4, 5], ALL)
const addRows = () => ctx.byTier([1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6, 7, 8], ALL)

/** Un rappel de partie qui ne tire que si la partie ET la question n'ont pas changé. */
function later(me: State, ms: number, fn: () => void) {
  const g = me.gen
  ctx.after(ms, () => { if (pg === me && me.gen === g) fn() })
}

/** Le temps de jeu, pause déduite : pour savoir, en silence, si la réponse
    est venue de mémoire ou d'un recomptage. */
function now(me: State) {
  return performance.now() - me.pausedMs - (me.pauseAt ? performance.now() - me.pauseAt : 0)
}

function shuffle<T>(a: T[]): T[] {
  const out = [...a]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/* ---------- La grille ---------- */

function buildGrid(me: State) {
  const g = me.grid
  g.innerHTML = ''
  me.corner = Object.assign(document.createElement('div'), { className: 'pg-h pg-corner' })
  g.appendChild(me.corner)
  me.cols = []
  for (let c = 1; c <= N; c++) {
    const h = Object.assign(document.createElement('div'), { className: 'pg-h col', textContent: String(c) })
    g.appendChild(h); me.cols.push(h)
  }
  me.rows = []
  me.cells = []
  for (let r = 1; r <= N; r++) {
    const h = Object.assign(document.createElement('div'), { className: 'pg-h row', textContent: String(r) })
    g.appendChild(h); me.rows.push(h)
    for (let c = 1; c <= N; c++) {
      const el = document.createElement('div')
      el.className = 'pg-cell'
      el.dataset.r = String(r); el.dataset.c = String(c)
      const img = document.createElement('img')
      img.alt = ''
      img.draggable = false
      const sp = rowPlant(r)
      img.src = plantUrl(sp)
      const n = document.createElement('b')
      n.className = 'pg-n'
      const k = document.createElement('b')
      k.className = 'pg-k'
      el.append(img, n, k)
      g.appendChild(el)
      me.cells.push({ el, img, n, k, r, c, sp })
    }
  }
  me.frame = Object.assign(document.createElement('div'), { className: 'pg-frame' })
  g.appendChild(me.frame)
}

/** La grille prend toute la hauteur, entre la colonne des modes et celle de la question. */
function layout(me: State) {
  const wrap = $('pgArea')
  const W = wrap.clientWidth, H = wrap.clientHeight
  const side = Math.min(380, W * 0.34)
  const tools = 108
  const s = Math.max(240, Math.min(H - 24, W - side - tools - 44))
  const g = me.grid
  g.style.width = g.style.height = s + 'px'
  g.style.left = Math.max(tools, tools + (W - side - tools - s) / 2 - 10) + 'px'
  g.style.top = (H - s) / 2 + 'px'
  g.style.fontSize = Math.max(12, Math.floor(s / 11 * 0.42)) + 'px'
  placeFrame(me)
}

/** Le coin se touche pour changer de tableau (+ ↔ ×) : seulement quand les
    deux familles sont choisies, et là où l'on découvre. */
function cornerLive(me: State) {
  return me.fams.length > 1 && !me.lock && (me.mode === 'discover' || (me.mode === 'path' && me.path?.stage === 0))
}

/** Les résultats gardés à montrer : ceux de Découvre, ou les 10 cases du Parcours. */
function keptOf(me: State): Map<string, number> | null {
  if (me.mode === 'discover') return me.found[me.fam]
  if (me.mode === 'path' && me.path && (me.path.stage === 0 || me.over)) return me.path.kept[me.fam]
  return null
}

/** La zone du Parcours : les tables du niveau (le reste de la grille est grisé). */
function inZone(me: State, r: number, c: number) {
  if (me.mode !== 'path' || !me.path || me.path.stage !== 0) return true
  const t = me.fam === 'mul' ? tables() : addRows()
  return t.includes(r) || t.includes(c)
}

function paintGrid(me: State) {
  const kept = keptOf(me)
  for (const cell of me.cells) {
    cell.el.style.setProperty('--cc', cellColor(me.fam, val(me.fam, cell.r, cell.c)))
    const v = kept?.get(`${cell.r}:${cell.c}`)
    cell.k.textContent = v === undefined ? '' : String(v)
    cell.el.classList.toggle('kp', v !== undefined)
    cell.el.classList.toggle('out', !inZone(me, cell.r, cell.c))
  }
  me.corner.textContent = me.fam === 'mul' ? '×' : '+'
  me.corner.classList.toggle('sw', cornerLive(me))
}

function setFam(me: State, fam: Fam) {
  me.fam = fam
  paintGrid(me)
}

function lightHeads(me: State, r: number, c: number) {
  me.rows.forEach((h, i) => h.classList.toggle('on', i + 1 === r))
  me.cols.forEach((h, i) => h.classList.toggle('on', i + 1 === c))
}

function setSpecies(cell: Cell, sp: Plant) {
  if (cell.sp === sp) return
  cell.sp = sp
  cell.img.src = plantUrl(sp)
}

/** La forme d'une case : le rectangle R × C du ×, la bande R + C du +. */
function inShape(fam: Fam, R: number, C: number, r: number, c: number) {
  return R > 0 && (fam === 'mul' ? r <= R && c <= C : r === R && c <= C)
}

/** Plante la forme R, C (une espèce par rangée) et arrache le reste.
    `wave` : ça pousse en vague depuis le coin (ou le long de la rangée). */
function setShape(me: State, R: number, C: number, wave = false) {
  me.R = R; me.C = C
  for (const cell of me.cells) {
    const inside = inShape(me.fam, R, C, cell.r, cell.c)
    const was = cell.el.classList.contains('pl')
    if (inside && !was) {
      setSpecies(cell, rowPlant(cell.r))
      const d = me.fam === 'mul' ? (cell.r + cell.c - 2) * 28 : (cell.c - 1) * 55
      cell.el.style.setProperty('--d', wave ? `${d}ms` : '0ms')
      cell.el.classList.add('pl')
    } else if (!inside && was) {
      cell.el.classList.remove('pl')
    }
  }
}

/** Le temps que met une forme à pousser en vague. */
const growMs = (me: State, R: number, C: number) => (me.fam === 'mul' ? 450 + (R + C) * 28 : 300 + C * 55)

/** Tout le potager fleurit (fin de partie) : chaque case, quel que soit le tableau. */
function bloomAll(me: State) {
  me.R = N; me.C = N
  for (const cell of me.cells) {
    setSpecies(cell, rowPlant(cell.r))
    cell.el.style.setProperty('--d', `${(cell.r + cell.c - 2) * 28}ms`)
    cell.el.classList.add('pl')
  }
}

function clearMarks(me: State, keepPlants = false) {
  for (const cell of me.cells) {
    for (const m of MARKS) if (!(keepPlants && m === 'pl')) cell.el.classList.remove(m)
    cell.n.textContent = ''
  }
  me.frame.classList.remove('on')
  if (!keepPlants) { me.R = 0; me.C = 0 }
}

function mark(cell: Cell, cls: string, text?: string | number) {
  cell.el.classList.add(cls)
  if (text !== undefined) cell.n.textContent = String(text)
}

function bump(cell: Cell) {
  cell.el.classList.remove('bump'); void cell.el.offsetWidth; cell.el.classList.add('bump')
}

/** Le contour à la craie autour de la forme (aide « Contour »). */
function placeFrame(me: State) {
  if (!me.frame.classList.contains('on') || !me.frame.dataset.r) return
  const R = Number(me.frame.dataset.r), C = Number(me.frame.dataset.c), R0 = Number(me.frame.dataset.r0)
  const a = cellAt(me, R0, 1).el, b = cellAt(me, R, C).el
  const pad = 4
  Object.assign(me.frame.style, {
    left: a.offsetLeft - pad + 'px', top: a.offsetTop - pad + 'px',
    width: b.offsetLeft + b.offsetWidth - a.offsetLeft + pad * 2 + 'px',
    height: b.offsetTop + b.offsetHeight - a.offsetTop + pad * 2 + 'px'
  })
}

function showFrame(me: State, R: number, C: number) {
  me.frame.dataset.r = String(R); me.frame.dataset.c = String(C)
  me.frame.dataset.r0 = String(me.fam === 'mul' ? 1 : R)
  me.frame.classList.add('on')
  placeFrame(me)
}

/* ---------- Compter : la table qui chante ---------- */

/** Compte la forme : rangée par rangée pour ×, case par case pour +. En
    question (`ask`), le dernier nombre ne s'écrit pas : il garde son « ? ». */
function countShape(me: State, R: number, C: number, done?: () => void, ask = false) {
  me.counting = true
  const fam = me.fam
  const n = fam === 'mul' ? R : C
  const step = fam === 'mul' ? STEP : STEP_ADD
  for (let i = 1; i <= n; i++) {
    later(me, i * step, () => {
      if (fam === 'mul') for (let c = 1; c <= C; c++) bump(cellAt(me, i, c))
      else bump(cellAt(me, R, i))
      const at = fam === 'mul' ? cellAt(me, i, C) : cellAt(me, R, i)
      const v = fam === 'mul' ? i * C : R + i
      if (ask && i === n) mark(at, 'q', '?')
      else mark(at, 'tot', v)
      tone(PENTA[i - 1], 0.32, 'triangle', 0.11)
      tone(PENTA[i - 1] * 2, 0.18, 'sine', 0.035, 0.02)
    })
  }
  later(me, (n + 1) * step, () => {
    if (!ask) {
      const last = cellAt(me, R, C)
      last.el.classList.remove('tot')
      mark(last, 'res', val(fam, R, C))
      sfx('pluck', { vol: 0.5, rate: 1.2 })
    }
    me.counting = false
    done?.()
  })
}

/* ---------- Découvrir une case (Découvre, et l'étape 1 du Parcours) ---------- */

function paintDiscover(me: State, withResult: boolean) {
  const q = $('pgQ')
  if (!me.R) { q.innerHTML = ''; return }
  const op = me.fam === 'mul' ? 'mul' : 'add'
  q.innerHTML = `<span class="r">${me.R}</span><span class="x">${SYM[op]}</span><span class="c">${me.C}</span>` +
    (withResult ? `<span class="x">=</span><span class="v">${val(me.fam, me.R, me.C)}</span>` : '')
}

function paintPivot(me: State) {
  const pv = document.getElementById('pgPivot') as HTMLButtonElement | null
  if (pv) pv.disabled = me.counting || !me.lastR || me.lastR === me.lastC
}

function paintCount(me: State) {
  const el = document.getElementById('pgCount')
  if (el) el.innerHTML = `<b>${me.found[me.fam].size}</b><i>/ ${N * N}</i>`
}

/** La forme suit le doigt. `fresh` : un nouveau toucher repart toujours de
    zéro, même sur la case déjà plantée (sinon l'effacement programmé de la
    découverte précédente tomberait en plein comptage). */
function dragTo(me: State, r: number, c: number, fresh = false) {
  if (!fresh && r === me.R && c === me.C) return
  const grew = size(me.fam, r, c) > size(me.fam, me.R, me.C)
  me.gen++
  me.counting = false
  clearMarks(me, true)
  setShape(me, r, c)
  lightHeads(me, r, c)
  paintDiscover(me, false)
  paintPivot(me)
  if (grew) sfx('pluck', { vol: 0.28, rate: 0.75 + val(me.fam, r, c) / (me.fam === 'mul' ? 100 : 20) * 0.7 })
}

function release(me: State) {
  if (!me.R) return
  const R = me.R, C = me.C
  countShape(me, R, C, () => discovered(me, R, C))
}

/** Une case découverte : la voix la dit, puis les plantes s'en vont et le
    RÉSULTAT RESTE dans sa case, en gros, sans plante dessous (Joyce, 27/09). */
function discovered(me: State, R: number, C: number) {
  const fam = me.fam
  const v = val(fam, R, C)
  paintDiscover(me, true)
  ctx.say(`${phrase(fam === 'mul' ? 'mul' : 'add', R, C)}, ${v}`)
  me.lastR = R; me.lastC = C
  if (me.mode === 'discover') {
    me.found[fam].set(`${R}:${C}`, v)
    paintCount(me)
  } else if (me.path) {
    const p = me.path
    if (!p.tiles.some(t => t.fam === fam && t.r === R && t.c === C)) p.tiles.push({ fam, r: R, c: C })
    p.kept[fam].set(`${R}:${C}`, v)
    paintPathDots(me)
    if (p.tiles.length >= PATH_N) me.lock = true
  }
  paintPivot(me)
  later(me, 1300, () => {
    clearMarks(me)
    setShape(me, 0, 0)
    lightHeads(me, 0, 0)
    paintGrid(me)
    if (me.mode === 'discover' && me.found[fam].size >= N * N) allLit(me)
    else if (me.mode === 'path' && me.path && me.path.tiles.length >= PATH_N) later(me, 500, () => nextStage(me))
  })
}

/** « Tourne » : 7 × 8 = 8 × 7 (chaque plante saute sur sa case miroir),
    7 + 4 = 4 + 7 (la bande repousse dans la rangée du 4). */
function pivot(me: State) {
  if (me.counting || !me.lastR || me.lastR === me.lastC) return
  const R0 = me.lastR, C0 = me.lastC
  me.gen++
  clearMarks(me)
  if (me.fam === 'add') {
    setShape(me, 0, 0)
    lightHeads(me, C0, R0)
    sfx('whoosh', { vol: 0.45 })
    later(me, 250, () => {
      setShape(me, C0, R0, true)
      paintDiscover(me, false)
      later(me, growMs(me, C0, R0), () => countShape(me, C0, R0, () => discovered(me, C0, R0)))
    })
    return
  }
  // La forme de départ, d'un coup, puis chaque plante saute sur sa case miroir
  setShape(me, R0, C0)
  const from = new Map<string, DOMRect>()
  const species = new Map<string, Plant>()
  for (const cell of me.cells) {
    if (cell.r <= R0 && cell.c <= C0) {
      from.set(`${cell.r}:${cell.c}`, cell.img.getBoundingClientRect())
      species.set(`${cell.r}:${cell.c}`, cell.sp)
    }
  }
  me.R = C0; me.C = R0
  for (const cell of me.cells) {
    const inNew = cell.r <= me.R && cell.c <= me.C
    if (!inNew) { cell.el.classList.remove('pl'); continue }
    setSpecies(cell, species.get(`${cell.c}:${cell.r}`) || rowPlant(cell.r))
    cell.el.style.setProperty('--d', '0ms')
    cell.el.classList.add('pl')
  }
  // FLIP : chaque plante part de la case miroir et glisse à sa place
  const moving: Cell[] = []
  for (const cell of me.cells) {
    const src = from.get(`${cell.c}:${cell.r}`)
    if (!src || !(cell.r <= me.R && cell.c <= me.C)) continue
    const dst = cell.img.getBoundingClientRect()
    cell.img.style.transition = 'none'
    cell.img.style.transform = `translate(${src.left - dst.left}px,${src.top - dst.top}px)`
    moving.push(cell)
  }
  void me.grid.offsetWidth
  for (const cell of moving) {
    cell.img.style.transition = `transform .6s cubic-bezier(.3,1.35,.5,1) ${(cell.r + cell.c) * 22}ms`
    cell.img.style.transform = ''
  }
  lightHeads(me, me.R, me.C)
  paintDiscover(me, false)
  sfx('whoosh', { vol: 0.45 })
  const R = me.R, C = me.C
  later(me, 900 + (R + C) * 22, () => {
    for (const cell of moving) cell.img.style.transition = ''
    countShape(me, R, C, () => discovered(me, R, C))
  })
}

/** Toute la grille est allumée : le potager fleurit, fin de la partie. */
function allLit(me: State) {
  me.over = true
  me.lock = true
  bloomAll(me)
  sfx('confirm', { vol: 0.8, rate: 1.12 })
  ctx.finish({
    title: 'Tout le potager est découvert !',
    msg: `Les ${N * N} cases du tableau`,
    stars: 3,
    score: N * N,
    scoreIcon: ICON.flower,
    outroMs: 2200
  })
}

/* ---------- Les questions (Récolte et Parcours) ---------- */

function paintDots(me: State) {
  $('pgDots').innerHTML = Array.from({ length: me.queue.length }, (_, i) => `<i class="pg-dot${i < me.done ? ' on' : ''}"></i>`).join('')
}

function paintQuestion(me: State, withAnswer = false) {
  const q = me.q
  if (!q) return
  if (q.find) {
    $('pgQ').innerHTML = `<span class="pg-find">${ICON.target}</span><span class="v">${q.find}</span>`
    return
  }
  const tail = withAnswer ? `<span class="x">=</span><span class="ok">${q.ans}</span>`
    : q.pad ? `<span class="x">=</span><span class="v pg-typed" id="pgTyped">${q.typed || '…'}</span>` : ''
  $('pgQ').innerHTML = direct(q.op)
    ? `<span class="r">${q.r}</span><span class="x">${SYM[q.op]}</span><span class="c">${q.c}</span>${tail}`
    : `<span class="v">${val(q.fam, q.r, q.c)}</span><span class="x">${SYM[q.op]}</span><span class="r">${q.r}</span>${tail}`
}

/** Toutes les questions de la récolte, dans les opérations choisies. */
function harvestPool(me: State): Fact[] {
  const mul = mulPool(tables()), add = addPool(addRows())
  const out: Fact[] = []
  if (me.ops.includes('add')) out.push(...add)
  if (me.ops.includes('sub')) out.push(...subPool(add))
  if (me.ops.includes('mul')) out.push(...mul)
  if (me.ops.includes('div')) out.push(...divPool(mul))
  return out
}

function startHarvest(me: State) {
  me.gen++
  me.lock = false
  me.over = false
  beginGame(me.mem)
  saveMemory('potager', me.mem)
  me.queue = planHarvest(me.mem, harvestPool(me), { ease: factEase })
  me.qi = 0; me.done = 0; me.firstTry = 0; me.streak = 0
  setMusicIntensity(0)
  paintDots(me)
  later(me, 400, () => ask(me))
}

function newQ(me: State, item: Item, op: Op, r: number, c: number, view: Level, find = 0): Q {
  const fam = famOf(op)
  me.gen++
  clearMarks(me)
  setFam(me, fam)
  setShape(me, 0, 0)
  me.q = { item, op, fam, r, c, ans: direct(op) ? val(fam, r, c) : c, view, tries: 0, ready: false, t0: 0, pad: view === LV.heart, typed: '', opts: [], find }
  lightHeads(me, find ? 0 : r, find || !direct(op) ? 0 : c)
  paintQuestion(me)
  $('pgOpts').innerHTML = ''
  $('pgOpts').className = 'pg-opts'
  return me.q
}

function ask(me: State) {
  if (me.qi >= me.queue.length) { outro(me); return }
  const item = me.queue[me.qi]
  const [r, c] = orient(item.fact)
  showHelp(me, newQ(me, item, item.fact.op, r, c, viewLevel(me.mem, item)))
}

/** L'aide du champ selon le niveau de la question, puis les réponses. */
function showHelp(me: State, q: Q) {
  const { r, c, view } = q
  const say = () => ctx.say(phrase(q.op, r, c))
  if (!direct(q.op)) {
    // 56 ÷ 7 ou 11 − 7 : chercher 56 (ou 11) dans la rangée du 7
    if (view <= LV.plants) {
      later(me, 300, () => { rowNumbers(me, r); say(); later(me, 250 + N * 45, () => offer(me, 3)) })
    } else if (view === LV.outline) {
      later(me, 250, () => {
        for (let cc = 1; cc <= N; cc++) mark(cellAt(me, r, cc), 'dig')
        say()
        later(me, 400, () => offer(me, 4))
      })
    } else {
      later(me, 250, () => { say(); later(me, 300, () => offer(me, view === LV.heart ? 0 : 4)) })
    }
    return
  }
  if (view === LV.discover) {
    later(me, 300, () => {
      setShape(me, r, c, true)
      later(me, growMs(me, r, c), () => countShape(me, r, c, () => {
        say()
        later(me, 500, () => offer(me, 3))
      }, true))
    })
  } else if (view === LV.plants) {
    later(me, 250, () => {
      setShape(me, r, c, true)
      say()
      later(me, growMs(me, r, c), () => offer(me, 3))
    })
  } else if (view === LV.outline) {
    later(me, 250, () => {
      for (const cell of me.cells) if (inShape(me.fam, r, c, cell.r, cell.c)) mark(cell, 'dig')
      showFrame(me, r, c)
      sfx('cloth', { vol: 0.3 })
      say()
      later(me, 450, () => offer(me, 4))
    })
  } else {
    later(me, 250, () => {
      mark(cellAt(me, r, c), 'q', '?')
      say()
      later(me, 300, () => offer(me, view === LV.heart ? 0 : 4))
    })
  }
}

/** La rangée se remplit de ses nombres : 7, 14, 21… 70 (ou 8, 9… 17 pour +). */
function rowNumbers(me: State, r: number) {
  for (let c = 1; c <= N; c++) {
    later(me, c * 45, () => mark(cellAt(me, r, c), 'num', val(me.fam, r, c)))
  }
}

/** Les réponses : `n` boutons, ou le pavé si n = 0. */
function offer(me: State, n: number, exclude: number[] = []) {
  const q = me.q
  if (!q) return
  const box = $('pgOpts')
  q.pad = n === 0
  q.typed = ''
  paintQuestion(me)
  if (q.pad) {
    box.className = 'pg-opts pg-padbox'
    box.innerHTML = `<div class="pg-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'del', 0].map(k =>
      `<button class="pg-key${k === 'del' ? ' del' : ''}" data-k="${k}">${k === 'del' ? ICON.turnLeft : k}</button>`).join('')}</div>`
    box.querySelectorAll<HTMLButtonElement>('.pg-key').forEach(b => { b.onclick = () => typeKey(me, b.dataset.k!) })
  } else {
    const choose = { mul: mulChoices, add: addChoices, div: divChoices, sub: subChoices }[q.op]
    q.opts = choose(q.r, q.c, n, Math.random, exclude)
    box.className = 'pg-opts' + (n === 3 ? ' three' : '')
    box.innerHTML = q.opts.map(v => `<button class="pg-opt" data-v="${v}">${v}</button>`).join('')
    box.querySelectorAll<HTMLButtonElement>('.pg-opt').forEach(b => { b.onclick = () => answer(me, Number(b.dataset.v), b) })
  }
  q.ready = true
  q.t0 = now(me)
}

function typeKey(me: State, k: string) {
  const q = me.q
  if (!q || !q.ready || !q.pad || me.lock) return
  sfx('click', { vol: 0.3 })
  if (k === 'del') q.typed = q.typed.slice(0, -1)
  else if (q.typed.length < 3) q.typed += k
  const t = document.getElementById('pgTyped')
  if (t) t.textContent = q.typed || '…'
  if (q.typed.length === String(q.ans).length) answer(me, Number(q.typed), null)
}

function answer(me: State, v: number, btn: HTMLButtonElement | null) {
  const q = me.q
  if (!q || !q.ready || me.lock) return
  q.ready = false
  if (v === q.ans) {
    if (q.tries === 0) {
      record(me.mem, q.item, { ok: true, fast: isFast(now(me) - q.t0, q.pad) })
      saveMemory('potager', me.mem)
      if (me.path) me.path.good++
      else me.firstTry++
      me.streak++
      setMusicIntensity(me.streak >= 10 ? 3 : me.streak >= 6 ? 2 : me.streak >= 3 ? 1 : 0)
    }
    btn?.classList.add('good')
    success(me)
    return
  }
  // Une erreur : aucune sanction. On lui montre, puis on passe à la suite ;
  // dans la Récolte, le calcul revient trois questions plus loin (requeue)
  q.tries++
  me.streak = 0
  setMusicIntensity(0)
  sfx('drop', { vol: 0.35, rate: 0.8 })
  if (btn) btn.classList.add('bad')
  record(me.mem, q.item, { ok: false, fast: false })
  saveMemory('potager', me.mem)
  if (me.mode === 'harvest' && q.item.kind !== 'again') requeue(me.queue, me.qi, q.item.fact)
  showMiss(me, v)
}

/** Le « presque » : SA forme, et sa réponse écrite à sa vraie place dans la
    table (49 est dans la case 7 × 7, 10 au bout de la bande 7 + 3). Puis ce
    qui manque pousse en or — ou ce qui dépasse rentre sous terre. Sinon, la
    bonne forme pousse et se compte. Puis la bonne réponse s'écrit en vert,
    et on passe à la suite : pas de nouvel essai sur-le-champ. */
function showMiss(me: State, v: number) {
  const q = me.q!
  me.gen++ // les animations de la question (rangée de nombres…) s'arrêtent là
  me.lock = true
  $('pgOpts').querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = true })
  clearMarks(me)
  setShape(me, 0, 0)
  // Pour ÷ et −, sa réponse v, c'est la forme de la rangée r jusqu'à la colonne v
  const nm = q.op === 'mul' ? nearMiss(q.r, q.c, v) : q.op === 'add' ? nearMissAdd(q.r, q.c, v)
    : (v >= 1 && v <= N && v !== q.c ? { r: q.r, c: v } : null)
  const total = val(q.fam, q.r, q.c)
  const reveal = () => {
    $('pgOpts').querySelectorAll<HTMLButtonElement>('.pg-opt').forEach(b => {
      if (Number(b.dataset.v) === q.ans) b.classList.add('good')
    })
    paintQuestion(me, true)
    sfx('pluck', { vol: 0.5, rate: 1.1 })
    ctx.say(`${phrase(q.op, q.r, q.c)}, ${q.ans}`)
    moveOn(me, 2600)
  }
  if (nm) {
    later(me, 200, () => {
      setShape(me, nm.r, nm.c, true)
      later(me, growMs(me, nm.r, nm.c), () => {
        mark(cellAt(me, nm.r, nm.c), 'her', val(q.fam, nm.r, nm.c))
        lightHeads(me, nm.r, nm.c)
        later(me, 900, () => {
          const bigger = size(q.fam, nm.r, nm.c) > size(q.fam, q.r, q.c)
          for (const cell of me.cells) {
            const inAns = inShape(q.fam, q.r, q.c, cell.r, cell.c), inHers = inShape(q.fam, nm.r, nm.c, cell.r, cell.c)
            if (inAns && !inHers) mark(cell, 'gold')
            if (!inAns && inHers) mark(cell, 'over')
          }
          if (bigger) {
            later(me, 450, () => { setShape(me, q.r, q.c); sfx('drop', { vol: 0.3, rate: 1.3 }) })
          } else {
            setShape(me, q.r, q.c, true)
            sfx('pluck', { vol: 0.5, rate: 1.25 })
          }
          later(me, 700, () => {
            // Sa réponse reste barrée à sa place, la bonne s'écrit en vert
            mark(cellAt(me, q.r, q.c), 'res', total)
            lightHeads(me, q.r, q.c)
            reveal()
          })
        })
      })
    })
  } else {
    later(me, 200, () => {
      setShape(me, q.r, q.c, true)
      later(me, growMs(me, q.r, q.c), () => countShape(me, q.r, q.c, reveal))
    })
  }
}

function success(me: State) {
  const q = me.q!
  me.gen++ // plus rien de la question ne doit apparaître après la réponse
  me.lock = true
  me.frame.classList.remove('on')
  for (const cell of me.cells) {
    cell.el.classList.remove('dig', 'q', 'num', 'tot', 'her', 'res')
    cell.n.textContent = ''
  }
  setShape(me, q.r, q.c, true)
  mark(cellAt(me, q.r, q.c), 'res', val(q.fam, q.r, q.c))
  lightHeads(me, q.r, q.c)
  paintQuestion(me, true)
  sfx('confirm', { vol: 0.65 })
  ctx.say(`${phrase(q.op, q.r, q.c)}, ${q.ans}`)
  moveOn(me, 1500)
}

/** La récolte : les plantes rentrent dans la caisse, une caisse de plus,
    puis le calcul suivant. */
function moveOn(me: State, ms: number) {
  later(me, ms, () => {
    clearMarks(me)
    setShape(me, 0, 0)
    sfx('pluck', { vol: 0.45, rate: 0.9 })
    if (me.path) { me.path.i++; paintPathDots(me) } else { me.done++; paintDots(me) }
  })
  later(me, ms + 550, () => {
    me.lock = false
    if (me.path) pathAsk(me)
    else { me.qi++; ask(me) }
  })
}

function outro(me: State) {
  me.over = true
  me.lock = true
  me.q = null
  $('pgOpts').innerHTML = ''
  lightHeads(me, 0, 0)
  $('pgDots').classList.add('wave')
  // Tout le potager fleurit une dernière fois
  bloomAll(me)
  setMusicIntensity(0)
  const n = me.queue.length
  const stars = me.firstTry >= n - 2 ? 3 : me.firstTry >= Math.ceil(n * 0.58) ? 2 : 1
  ctx.finish({
    title: 'La récolte est rentrée !',
    msg: me.firstTry === n ? 'Tout juste du premier coup' : `${me.firstTry} sur ${n} du premier coup`,
    stars,
    score: n,
    scoreIcon: ICON.basket,
    outroMs: 1600
  })
}

/* ---------- Le Parcours ---------- */

function paintStages(me: State) {
  const p = me.path
  const el = $('pgStages')
  if (!p) { el.innerHTML = ''; return }
  el.innerHTML = STAGE_ICON.map((ic, i) => `<i class="${i < p.stage ? 'done' : i === p.stage ? 'now' : ''}">${ic}</i>`).join('')
}

function paintPathDots(me: State) {
  const p = me.path
  if (!p) return
  const n = p.stage === 0 ? p.tiles.length : p.i
  $('pgDots').innerHTML = Array.from({ length: PATH_N }, (_, i) => `<i class="pg-dot${i < n ? ' on' : ''}"></i>`).join('')
}

function startPath(me: State) {
  me.gen++
  me.lock = false
  me.over = false
  beginGame(me.mem)
  saveMemory('potager', me.mem)
  me.path = { stage: 0, tiles: [], list: [], i: 0, good: 0, kept: emptyKept() }
  me.streak = 0
  setMusicIntensity(0)
  setFam(me, me.fams[0])
  paintStages(me)
  paintPathDots(me)
  showHint(me)
}

/** Une case du Parcours, posée avec l'une des opérations choisies de son
    tableau : 7 + 4 peut revenir en 11 − 7 (ou 11 − 4). */
function pathQuestion(me: State, t: Tile) {
  const ops = me.ops.filter(o => famOf(o) === t.fam)
  let op = pick(ops.length ? ops : [t.fam])
  let r = t.r, c = t.c
  if (!direct(op) && Math.random() < 0.5) [r, c] = [c, r]
  // Pas de « ÷ 1 », qui n'apprend rien, quand on peut l'éviter
  if (op === 'div' && r === 1) {
    if (c > 1) [r, c] = [c, r]
    else if (ops.includes('mul')) op = 'mul'
  }
  return { fam: t.fam, op, r, c }
}

function nextStage(me: State) {
  const p = me.path
  if (!p) return
  p.stage++
  me.gen++
  me.lock = true
  me.hint?.remove(); me.hint = null
  clearMarks(me)
  setShape(me, 0, 0)
  lightHeads(me, 0, 0)
  $('pgQ').innerHTML = ''
  $('pgOpts').innerHTML = ''
  if (p.stage > 3) { pathOutro(me); return }
  p.i = 0
  p.list = shuffle(p.tiles).map(t => pathQuestion(me, t))
  paintGrid(me)
  paintStages(me)
  paintPathDots(me)
  sfx('confirm', { vol: 0.6, rate: 0.9 + p.stage * 0.1 })
  later(me, 900, () => { me.lock = false; pathAsk(me) })
}

function pathAsk(me: State) {
  const p = me.path
  if (!p) return
  if (p.i >= p.list.length) { nextStage(me); return }
  const t = p.list[p.i]
  const item: Item = { fact: factOf(t.op, t.r, t.c), kind: 'probe' }
  if (p.stage === 3) {
    // Trouve la case : le nombre, la grille vide ; toute case qui le vaut est juste
    const q = newQ(me, item, t.op, t.r, t.c, LV.numbers, val(t.fam, t.r, t.c))
    ctx.say(String(q.find))
    q.ready = true
    return
  }
  // 1 : quatre réponses, avec le contour ; 2 : le pavé, le « ? » seul
  showHelp(me, newQ(me, item, t.op, t.r, t.c, p.stage === 1 ? LV.outline : LV.heart))
}

/** « Trouve la case » : elle touche une case de la grille. */
function findTap(me: State, cell: Cell) {
  const q = me.q, p = me.path
  if (!q || !p || !q.ready || me.lock) return
  q.ready = false
  me.gen++
  me.lock = true
  const v = val(q.fam, cell.r, cell.c)
  const op = q.fam === 'mul' ? 'mul' : 'add'
  if (v === q.find) {
    p.good++
    me.streak++
    setMusicIntensity(me.streak >= 10 ? 3 : me.streak >= 6 ? 2 : me.streak >= 3 ? 1 : 0)
    setShape(me, cell.r, cell.c, true)
    mark(cell, 'res', v)
    lightHeads(me, cell.r, cell.c)
    sfx('confirm', { vol: 0.65 })
    ctx.say(`${phrase(op, cell.r, cell.c)}, ${v}`)
    moveOn(me, 1500)
    return
  }
  // Une case fausse montre son nombre, barré ; puis SA case pousse, en vert
  me.streak = 0
  setMusicIntensity(0)
  mark(cell, 'her', v)
  sfx('drop', { vol: 0.35, rate: 0.8 })
  later(me, 900, () => {
    setShape(me, q.r, q.c, true)
    later(me, growMs(me, q.r, q.c), () => {
      const t = cellAt(me, q.r, q.c)
      mark(t, 'res', q.find)
      lightHeads(me, q.r, q.c)
      sfx('pluck', { vol: 0.5, rate: 1.1 })
      ctx.say(`${phrase(op, q.r, q.c)}, ${q.find}`)
      moveOn(me, 2200)
    })
  })
}

function pathOutro(me: State) {
  const p = me.path!
  me.over = true
  me.lock = true
  me.q = null
  $('pgDots').classList.add('wave')
  // Ses dix cases reviennent, et tout le potager fleurit
  setFam(me, p.tiles[0]?.fam ?? me.fam)
  bloomAll(me)
  setMusicIntensity(0)
  const n = PATH_N * 3
  const stars = p.good >= n - 3 ? 3 : p.good >= 20 ? 2 : 1
  ctx.finish({
    title: 'Le parcours est fini !',
    msg: p.good === n ? 'Tout juste du premier coup' : `${p.good} sur ${n} du premier coup`,
    stars,
    score: p.good,
    scoreIcon: ICON.check,
    outroMs: 2000
  })
}

/* ---------- Les modes ---------- */

function showHint(me: State) {
  me.hint?.remove()
  // La main qui montre le geste : on touche une case
  const hint = document.createElement('div')
  hint.className = 'pg-hint'
  hint.innerHTML = ICON.tap
  me.grid.appendChild(hint)
  me.hint = hint
}

function setMode(me: State, mode: Mode) {
  me.mode = mode
  me.gen++
  me.lock = false
  me.counting = false
  me.over = false
  me.q = null
  me.drag = null
  me.path = null
  me.lastR = 0; me.lastC = 0
  clearMarks(me)
  setShape(me, 0, 0)
  lightHeads(me, 0, 0)
  setMusicIntensity(0)
  document.querySelectorAll<HTMLElement>('.pg-tool').forEach(b => {
    const on = b.dataset.m === mode
    b.classList.toggle('sel', on)
    b.parentElement?.classList.toggle('sel', on)
  })
  $('pgQ').innerHTML = ''
  $('pgOpts').innerHTML = ''
  $('pgOpts').className = 'pg-opts'
  $('pgDots').innerHTML = ''
  $('pgDots').classList.remove('wave')
  $('pgStages').innerHTML = ''
  const extra = $('pgExtra')
  extra.innerHTML = ''
  me.hint?.remove()
  me.hint = null
  if (mode === 'discover') {
    extra.innerHTML = `<div class="pg-count" id="pgCount"></div>
      <span class="tool-item"><button class="sn-tool pg-big" id="pgPivot" aria-label="Tourne" disabled>${ICON.rotate}</button><i class="tool-cap">Tourne</i></span>`
    ;($('pgPivot') as HTMLButtonElement).onclick = () => { if (pg === me) pivot(me) }
    setFam(me, me.fam)
    paintCount(me)
    showHint(me)
  } else if (mode === 'path') {
    startPath(me)
  } else {
    paintGrid(me)
    startHarvest(me)
  }
}

/* ---------- Le jeu ---------- */

export const potager: GameDef = {
  id: 'potager', name: 'Le Potager', icon: '🥕', sq: 'sq-mint', cat: 'reflexion',
  music: 'meadow',
  ops: true,
  subtitle: 'Les tables qui poussent : + − × ÷',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="arena pg-arena" id="pgArea">
        <div class="pg-grid" id="pgGrid"></div>
        <div class="tq-tools pg-tools">
          <span class="tool-item sel"><button class="sn-tool pg-tool sel" data-m="path" aria-label="Parcours">${ICON.flag}</button><i class="tool-cap">Parcours</i></span>
          <span class="tool-item"><button class="sn-tool pg-tool" data-m="discover" aria-label="Découvre">${ICON.tap}</button><i class="tool-cap">Découvre</i></span>
          <span class="tool-item"><button class="sn-tool pg-tool" data-m="harvest" aria-label="Récolte">${ICON.basket}</button><i class="tool-cap">Récolte</i></span>
        </div>
        <div class="tq-side pg-side">
          <div class="pg-stages" id="pgStages"></div>
          <div class="pg-q" id="pgQ"></div>
          <div class="pg-opts" id="pgOpts"></div>
          <div class="pg-dots" id="pgDots"></div>
          <div class="pg-extra" id="pgExtra"></div>
        </div>
      </div>`
    preloadSfx(['pluck', 'confirm', 'drop', 'click', 'whoosh', 'tick', 'cloth'])
    preloadPlants()
    const ops: Op[] = c.ops.length ? c.ops : ['mul']
    const fams = (['add', 'mul'] as Fam[]).filter(f => ops.some(o => famOf(o) === f))
    const me: State = {
      mode: 'path', ops, fams, fam: fams[0], gen: 0, lock: false, over: false, counting: false,
      cells: [], rows: [], cols: [], corner: document.createElement('div'), grid: $('pgGrid'), frame: document.createElement('div'),
      R: 0, C: 0, lastR: 0, lastC: 0, found: emptyKept(),
      mem: loadMemory('potager'), queue: [], qi: 0, q: null, firstTry: 0, streak: 0, done: 0,
      drag: null, hint: null, pausedMs: 0, pauseAt: 0, path: null
    }
    pg = me
    buildGrid(me)
    layout(me)
    const ro = new ResizeObserver(() => { if (pg === me) layout(me) })
    ro.observe($('pgArea'))
    const unPause = onPause(p => {
      if (p) me.pauseAt = performance.now()
      else if (me.pauseAt) { me.pausedMs += performance.now() - me.pauseAt; me.pauseAt = 0 }
    })

    /* --- Le doigt : suivi par pointerId, le glissé écouté sur window --- */
    const cellFrom = (x: number, y: number): Cell | null => {
      const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('.pg-cell')
      if (!el || !me.grid.contains(el)) return null
      return cellAt(me, Number(el.dataset.r), Number(el.dataset.c))
    }
    const drawing = () => !me.lock && !me.over && (me.mode === 'discover' || (me.mode === 'path' && me.path?.stage === 0))
    const onDown = (ev: PointerEvent) => {
      if (pg !== me) return
      const cell = cellFrom(ev.clientX, ev.clientY)
      if (!cell) return
      if (me.mode === 'path' && me.path?.stage === 3) { findTap(me, cell); return }
      if (!drawing() || me.drag !== null || !inZone(me, cell.r, cell.c)) return
      me.drag = ev.pointerId
      me.hint?.remove(); me.hint = null
      dragTo(me, cell.r, cell.c, true)
    }
    const onMove = (ev: PointerEvent) => {
      if (pg !== me || me.drag !== ev.pointerId) return
      const cell = cellFrom(ev.clientX, ev.clientY)
      if (cell && inZone(me, cell.r, cell.c)) dragTo(me, cell.r, cell.c)
    }
    const onUp = (ev: PointerEvent) => {
      if (pg !== me || me.drag !== ev.pointerId) return
      me.drag = null
      if (drawing()) release(me)
    }
    me.grid.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    // Le coin change de tableau (+ ↔ ×) quand les deux sont choisis
    me.corner.addEventListener('click', () => {
      if (pg !== me || !cornerLive(me) || me.drag !== null) return
      me.gen++
      me.counting = false
      clearMarks(me)
      setShape(me, 0, 0)
      lightHeads(me, 0, 0)
      me.lastR = 0; me.lastC = 0
      $('pgQ').innerHTML = ''
      setFam(me, me.fam === 'mul' ? 'add' : 'mul')
      paintCount(me)
      paintPivot(me)
      sfx('whoosh', { vol: 0.4 })
    })
    document.querySelectorAll<HTMLElement>('.pg-tool').forEach(b => {
      b.onclick = () => { if (pg === me && b.dataset.m !== me.mode) { sfx('click', { vol: 0.4 }); setMode(me, b.dataset.m as Mode) } }
    })
    const onKey = (e: KeyboardEvent) => {
      if (pg !== me || !me.q?.pad) return
      if (/^[0-9]$/.test(e.key)) typeKey(me, e.key)
      else if (e.key === 'Backspace') typeKey(me, 'del')
    }
    window.addEventListener('keydown', onKey)

    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __pg: unknown }).__pg = {
        get mode() { return me.mode }, get ready() { return !!me.q?.ready && !me.lock },
        get qi() { return me.qi }, get done() { return me.done }, get total() { return me.queue.length },
        get op() { return me.q ? me.q.op : '' }, get fam() { return me.fam }, get fams() { return [...me.fams] },
        get ops() { return [...me.ops] },
        get r() { return me.q ? me.q.r : NaN }, get c() { return me.q ? me.q.c : NaN },
        get answer() { return me.q ? me.q.ans : NaN }, get view() { return me.q ? me.q.view : NaN },
        get tries() { return me.q ? me.q.tries : NaN }, get pad() { return !!me.q?.pad },
        get opts() { return me.q ? [...me.q.opts] : [] }, get over() { return me.over },
        get rect() { return [me.R, me.C] }, get counting() { return me.counting }, get lock() { return me.lock },
        get found() { return me.found[me.fam].size }, get kept() { return me.cells.filter(x => x.k.textContent).length },
        get stage() { return me.path ? me.path.stage : -1 }, get tiles() { return me.path ? me.path.tiles.length : 0 },
        get pathI() { return me.path ? me.path.i : 0 }, get good() { return me.path ? me.path.good : 0 },
        get find() { return me.q ? me.q.find : 0 },
        /** La case est-elle ouverte (zone du niveau, dans le Parcours) ? */
        open(r: number, c: number) { return inZone(me, r, c) },
        /** Une case qui vaut v dans le tableau montré (pour « trouve la case »). */
        where(v: number) { const x = me.cells.find(k => val(me.fam, k.r, k.c) === v); return x ? [x.r, x.c] : null },
        /** Le centre d'une case à l'écran, pour poser un vrai doigt dessus. */
        cell(r: number, c: number) { const b = cellAt(me, r, c).el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } },
        corner() { const b = me.corner.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } },
        /** Touche la réponse v comme un doigt : le bouton, ou le pavé chiffre par chiffre. */
        pick(v: number) {
          if (me.q?.pad) {
            for (const d of String(v)) document.querySelector<HTMLButtonElement>(`.pg-key[data-k="${d}"]`)?.click()
            return true
          }
          const b = document.querySelector<HTMLButtonElement>(`.pg-opt[data-v="${v}"]`)
          if (!b || b.disabled) return false
          b.click()
          return true
        }
      }
    }

    setMode(me, 'path')
    return () => {
      if (pg === me) pg = null
      me.gen++
      ro.disconnect()
      unPause()
      me.grid.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
      setMusicIntensity(0)
    }
  }
}
