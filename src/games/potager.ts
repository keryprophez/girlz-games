import type { GameContext, GameDef, Op } from '../core/types'
import { $ } from '../core/utils'
import { ICON } from '../core/icons'
import { sfx, preloadSfx } from '../core/sfx'
import { tone } from '../core/audio'
import { setMusicIntensity } from '../core/music'
import { onPause } from '../core/session'
import { plantUrl, rowPlant, preloadPlants, type Plant } from '../core/plants'
import {
  addChoices, addPool, beginGame, divChoices, divPool, factEase, isFast, loadMemory, mulChoices, mulPool, nearMiss,
  nearMissAdd, orient, planHarvest, record, requeue, saveMemory, subChoices, subPool, tableOf, viewLevel,
  LV, type Fact, type Item, type Level, type Memory
} from '../core/facts'
import { some, visible } from '../core/hand'

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

   À l'ouverture (28/11) : Jade ou Joyce, puis SES opérations et SES tables
   (dix pastilles, `ctx.tables`), retenues pour elle, comme sa mémoire des
   calculs (`potager:jade`, `potager:joyce`). Rien ne porte sur une autre
   table que les siennes. Le niveau ne règle plus que l'aide : la fleur
   plante chaque calcul (trois réponses), l'éclair laisse la mémoire décider
   calcul par calcul, la flamme demande tout au pavé, sans aide.

   Deux temps, dans cet ordre (28/11 : « la découverte en libre, et après on
   t'interroge » ; le Parcours, qu'on ne comprenait pas, est sorti) :
   - Découvre, à l'ouverture : seules ses tables sont ouvertes. On tire une
     forme du doigt, elle pousse et se compte ; puis les plantes s'en vont
     et le RÉSULTAT RESTE, en gros, sans plante dessous (Joyce, 27/09).
     Toucher le numéro d'une de ses tables dans la marge la fait chanter :
     4, 8, 12… 40 poussent l'un après l'autre et restent. « Tourne » :
     7 × 8 = 8 × 7, 7 + 4 = 4 + 7. Ni compteur ni but ;
   - Récolte, le panier (il appelle après quelques découvertes) : douze
     questions sur ses tables, composées par la mémoire des calculs
     (`core/facts.ts`), réparties entre ses tables, l'aide qui s'efface
     calcul par calcul.
   **La réponse n'apparaît JAMAIS avant qu'elle choisisse** (25/09).

   Apprendre, donc AUCUNE sanction : ni vies, ni chrono, ni bonus de vitesse.
   Le temps de réponse est mesuré en silence. Une erreur ne se refait pas
   sur-le-champ : le « presque » est dessiné (49 pour 7 × 8 : SON carré
   7 × 7, 49 barré à sa vraie place ; 10 pour 7 + 4 : sa bande), ce qui
   manque pousse en or, la bonne réponse s'écrit en vert, puis on passe à la
   suite. La voix ne dit que le contenu (« sept fois huit », « 56 »). */

type Mode = 'discover' | 'harvest'
/** Le tableau montré : celui des × (pour × et ÷) ou celui des + (pour + et −). */
type Fam = 'mul' | 'add'

const N = 10
const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const STEP = 380            // un temps de la mélodie des rangées (ms)
const STEP_ADD = 300        // un pas de la bande de l'addition (ms)
const STEP_SING = 800       // un temps de la table qui chante : la voix dit chaque nombre
const CALL_AT = 3           // découvertes avant que le panier de la Récolte appelle
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760]
const MARKS = ['pl', 'tot', 'res', 'her', 'gold', 'over', 'dig', 'q', 'num', 'bump'] as const
const SYM: Record<Op, string> = { add: '+', sub: '−', mul: '×', div: '÷' }

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
  /** Découvertes de la partie (formes et tables chantées) : le panier appelle à CALL_AT. */
  tried: number
  /** Sa mémoire des calculs (`potager:<elle>`). */
  memKey: string
  mem: Memory
  queue: Item[]
  qi: number
  q: Q | null
  firstTry: number
  streak: number
  done: number
  drag: number | null
  pausedMs: number
  pauseAt: number
}

let pg: State | null = null
let ctx: GameContext

const cellAt = (me: State, r: number, c: number) => me.cells[(r - 1) * N + (c - 1)]
const emptyKept = (): Record<Fam, Map<string, number>> => ({ mul: new Map(), add: new Map() })
// Ses tables, choisies à l'ouverture (28/11) : les mêmes pastilles pour × ÷
// (la table de 4) et pour + − (la table de + 4)
const tables = () => (ctx.tables.length ? ctx.tables : ALL.slice(0, 5))

/** L'aide d'une question selon le niveau (28/11 : il ne choisit plus les
    tables) : la fleur plante chaque calcul et propose trois réponses (un
    calcul raté garde son comptage), l'éclair suit la mémoire calcul par
    calcul, la flamme demande tout au pavé, sans plante ni contour. */
function helpOf(me: State, item: Item): Level {
  if (ctx.tier === 'exp') return LV.heart
  const lv = viewLevel(me.mem, item)
  return ctx.tier === 'easy' ? (Math.min(lv, LV.plants) as Level) : lv
}

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
    h.dataset.r = String(r)
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
  return me.fams.length > 1 && !me.lock && me.mode === 'discover'
}

/** La zone de Découvre : ses tables, en rangée ou en colonne (7 × 4 est
    dans la table de 4) ; le reste de la grille est grisé. */
function inZone(me: State, r: number, c: number) {
  if (me.mode !== 'discover') return true
  const t = tables()
  return t.includes(r) || t.includes(c)
}

function paintGrid(me: State) {
  const kept = me.mode === 'discover' ? me.found[me.fam] : null
  for (const cell of me.cells) {
    cell.el.style.setProperty('--cc', cellColor(me.fam, val(me.fam, cell.r, cell.c)))
    const v = kept?.get(`${cell.r}:${cell.c}`)
    cell.k.textContent = v === undefined ? '' : String(v)
    cell.el.classList.toggle('kp', v !== undefined)
    cell.el.classList.toggle('out', !inZone(me, cell.r, cell.c))
  }
  // Dans Découvre, les numéros de ses tables chantent ; les autres s'estompent
  const mine = (n: number) => me.mode !== 'discover' || tables().includes(n)
  me.rows.forEach((h, i) => { h.classList.toggle('sing', me.mode === 'discover' && mine(i + 1)); h.classList.toggle('off', !mine(i + 1)) })
  me.cols.forEach((h, i) => h.classList.toggle('off', !mine(i + 1)))
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
  me.found[fam].set(`${R}:${C}`, v)
  me.tried++
  paintPivot(me)
  later(me, 1300, () => {
    clearMarks(me)
    setShape(me, 0, 0)
    lightHeads(me, 0, 0)
    paintGrid(me)
    callHarvest(me)
  })
}

/** La table qui chante (28/11) : toucher le numéro d'une de ses tables dans
    la marge la fait pousser case après case. × : la forme gagne une colonne
    à chaque temps (4, 8, 12… 40) ; + : la bande avance d'une case (5, 6…
    14). Chaque nombre s'écrit au bout de la rangée, la voix le dit (le
    contenu, jamais une consigne), puis la rangée entière reste écrite,
    comme les cases découvertes. */
function sing(me: State, r: number) {
  if (me.mode !== 'discover' || me.lock || me.over || !tables().includes(r)) return
  me.gen++
  me.counting = true
  clearMarks(me)
  setShape(me, 0, 0)
  lightHeads(me, r, 0)
  $('pgQ').innerHTML = ''
  paintPivot(me)
  const fam = me.fam
  for (let c = 1; c <= N; c++) {
    later(me, 250 + (c - 1) * STEP_SING, () => {
      setShape(me, r, c)
      lightHeads(me, r, c)
      const v = val(fam, r, c)
      mark(cellAt(me, r, c), 'tot', v)
      me.found[fam].set(`${r}:${c}`, v)
      tone(PENTA[c - 1], 0.32, 'triangle', 0.11)
      tone(PENTA[c - 1] * 2, 0.18, 'sine', 0.035, 0.02)
      ctx.say(String(v))
    })
  }
  later(me, 250 + N * STEP_SING + 500, () => {
    me.counting = false
    me.tried++
    clearMarks(me)
    setShape(me, 0, 0)
    lightHeads(me, 0, 0)
    paintGrid(me)
    paintPivot(me)
    sfx('pluck', { vol: 0.5, rate: 1.2 })
    callHarvest(me)
  })
}

/** Le panier de la Récolte appelle (il pulse) une fois quelques découvertes faites. */
function callHarvest(me: State) {
  document.querySelector('.pg-tool[data-m="harvest"]')?.classList.toggle('call', me.mode === 'discover' && me.tried >= CALL_AT)
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

/* ---------- Les questions de la Récolte ---------- */

function paintDots(me: State) {
  $('pgDots').innerHTML = Array.from({ length: me.queue.length }, (_, i) => `<i class="pg-dot${i < me.done ? ' on' : ''}"></i>`).join('')
}

function paintQuestion(me: State, withAnswer = false) {
  const q = me.q
  if (!q) return
  const tail = withAnswer ? `<span class="x">=</span><span class="ok">${q.ans}</span>`
    : q.pad ? `<span class="x">=</span><span class="v pg-typed" id="pgTyped">${q.typed || '…'}</span>` : ''
  $('pgQ').innerHTML = direct(q.op)
    ? `<span class="r">${q.r}</span><span class="x">${SYM[q.op]}</span><span class="c">${q.c}</span>${tail}`
    : `<span class="v">${val(q.fam, q.r, q.c)}</span><span class="x">${SYM[q.op]}</span><span class="r">${q.r}</span>${tail}`
}

/** Toutes les questions de la récolte : ses tables, ses opérations. */
function harvestPool(me: State): Fact[] {
  const mul = mulPool(tables()), add = addPool(tables())
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
  saveMemory(me.memKey, me.mem)
  // Réparties entre ses tables : chacune sa part (28/11)
  me.queue = planHarvest(me.mem, harvestPool(me), { ease: factEase, group: tableOf(tables()) })
  me.qi = 0; me.done = 0; me.firstTry = 0; me.streak = 0
  setMusicIntensity(0)
  paintDots(me)
  later(me, 400, () => ask(me))
}

function newQ(me: State, item: Item, op: Op, r: number, c: number, view: Level): Q {
  const fam = famOf(op)
  me.gen++
  clearMarks(me)
  setFam(me, fam)
  setShape(me, 0, 0)
  me.q = { item, op, fam, r, c, ans: direct(op) ? val(fam, r, c) : c, view, tries: 0, ready: false, t0: 0, pad: view === LV.heart, typed: '', opts: [] }
  lightHeads(me, r, direct(op) ? c : 0)
  paintQuestion(me)
  $('pgOpts').innerHTML = ''
  $('pgOpts').className = 'pg-opts'
  return me.q
}

function ask(me: State) {
  if (me.qi >= me.queue.length) { outro(me); return }
  const item = me.queue[me.qi]
  const [r, c] = orient(item.fact)
  showHelp(me, newQ(me, item, item.fact.op, r, c, helpOf(me, item)))
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
      saveMemory(me.memKey, me.mem)
      me.firstTry++
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
  saveMemory(me.memKey, me.mem)
  if (q.item.kind !== 'again') requeue(me.queue, me.qi, q.item.fact)
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
    me.done++
    paintDots(me)
  })
  later(me, ms + 550, () => {
    me.lock = false
    me.qi++
    ask(me)
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

/* ---------- Les modes ---------- */

function setMode(me: State, mode: Mode) {
  me.mode = mode
  me.gen++
  me.lock = false
  me.counting = false
  me.over = false
  me.q = null
  me.drag = null
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
  const extra = $('pgExtra')
  extra.innerHTML = ''
  callHarvest(me)
  if (mode === 'discover') {
    extra.innerHTML = `<span class="tool-item"><button class="sn-tool pg-big" id="pgPivot" aria-label="Tourne" disabled>${ICON.rotate}</button><i class="tool-cap">Tourne</i></span>`
    ;($('pgPivot') as HTMLButtonElement).onclick = () => { if (pg === me) pivot(me) }
    setFam(me, me.fam)
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
  who: true,
  tables: true,
  subtitle: 'Les tables qui poussent : + − × ÷',
  // La main : Découvre, on dessine une forme dans ses tables, puis (quelques
  // découvertes faites) le panier de la Récolte ; dans la Récolte, « l'une de
  // celles-là » (réponses, touches) — jamais la réponse
  hand: root => {
    const me = pg
    if (!me || me.lock || me.over || me.counting || me.drag !== null) return null
    const cells = visible(root, '#pgGrid .pg-cell:not(.out)')
    if (me.mode === 'discover') {
      const basket = me.tried >= CALL_AT ? visible(root, '.pg-tool[data-m="harvest"]')[0] : undefined
      if (basket) return { tap: basket }
      const a = some(cells, 1)[0]
      if (!a) return null
      const b = root.querySelector<HTMLElement>(`#pgGrid .pg-cell[data-r="${Number(a.dataset.r) + 1}"][data-c="${Number(a.dataset.c) + 2}"]:not(.out)`)
      return b ? { drag: [a, b] } : { tap: a }
    }
    if (!me.q?.ready) return null
    const opts = visible(root, '#pgOpts .pg-opt')
    if (opts.length) return { choose: opts }
    const keys = visible(root, '.pg-pad .pg-key')
    return keys.length ? { choose: some(keys, 4) } : null
  },
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="arena pg-arena" id="pgArea">
        <div class="pg-grid" id="pgGrid"></div>
        <div class="tq-tools pg-tools">
          <span class="tool-item sel"><button class="sn-tool pg-tool sel" data-m="discover" aria-label="Découvre">${ICON.tap}</button><i class="tool-cap">Découvre</i></span>
          <span class="tool-item"><button class="sn-tool pg-tool" data-m="harvest" aria-label="Récolte">${ICON.basket}</button><i class="tool-cap">Récolte</i></span>
        </div>
        <div class="tq-side pg-side">
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
    // Sa mémoire à elle (28/11) ; la première fois, une copie de l'ancienne
    // mémoire commune
    const memKey = c.who ? `potager:${c.who}` : 'potager'
    const me: State = {
      mode: 'discover', ops, fams, fam: fams[0], gen: 0, lock: false, over: false, counting: false,
      cells: [], rows: [], cols: [], corner: document.createElement('div'), grid: $('pgGrid'), frame: document.createElement('div'),
      R: 0, C: 0, lastR: 0, lastC: 0, found: emptyKept(), tried: 0,
      memKey, mem: loadMemory(memKey, 'potager'), queue: [], qi: 0, q: null, firstTry: 0, streak: 0, done: 0,
      drag: null, pausedMs: 0, pauseAt: 0
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
    const drawing = () => !me.lock && !me.over && me.mode === 'discover'
    // Le doigt peut partir de n'importe où dans la grille (le coin, une case
    // grisée) : la forme naît dès qu'il entre dans ses tables (28/11)
    let grew = false
    const onDown = (ev: PointerEvent) => {
      if (pg !== me) return
      const head = (ev.target as HTMLElement | null)?.closest<HTMLElement>('.pg-h')
      if (head) {
        // Le numéro d'une de ses tables, dans la marge : la table chante
        if (head.classList.contains('sing') && me.drag === null) sing(me, Number(head.dataset.r))
        return
      }
      if (!drawing() || me.drag !== null) return
      me.drag = ev.pointerId
      grew = false
      const cell = cellFrom(ev.clientX, ev.clientY)
      if (cell && inZone(me, cell.r, cell.c)) { dragTo(me, cell.r, cell.c, true); grew = true }
    }
    const onMove = (ev: PointerEvent) => {
      if (pg !== me || me.drag !== ev.pointerId) return
      const cell = cellFrom(ev.clientX, ev.clientY)
      if (cell && inZone(me, cell.r, cell.c)) { dragTo(me, cell.r, cell.c, !grew); grew = true }
    }
    const onUp = (ev: PointerEvent) => {
      if (pg !== me || me.drag !== ev.pointerId) return
      me.drag = null
      if (grew && drawing()) release(me)
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
        get who() { return ctx.who }, get tables() { return tables() }, get tried() { return me.tried },
        get memKey() { return me.memKey }, get first() { return me.queue.map(it => it.fact) },
        get calling() { return !!document.querySelector('.pg-tool.call') },
        /** La case est-elle ouverte (dans ses tables, dans Découvre) ? */
        open(r: number, c: number) { return inZone(me, r, c) },
        /** Le centre d'une case à l'écran, pour poser un vrai doigt dessus. */
        cell(r: number, c: number) { const b = cellAt(me, r, c).el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } },
        /** Le centre du numéro d'une rangée, dans la marge. */
        head(r: number) { const b = me.rows[r - 1].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } },
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

    setMode(me, 'discover')
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
