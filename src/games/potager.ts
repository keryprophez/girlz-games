import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { ICON } from '../core/icons'
import { sfx, preloadSfx } from '../core/sfx'
import { tone } from '../core/audio'
import { setMusicIntensity } from '../core/music'
import { onPause } from '../core/session'
import { plantUrl, rowPlant, preloadPlants, type Plant } from '../core/plants'
import {
  beginGame, divChoices, divPool, factEase, isFast, loadMemory, mulChoices, mulKey, mulPool, nearMiss, orient,
  planHarvest, record, recOf, requeue, saveMemory, viewLevel, LV, type Fact, type Item, type Level, type Memory
} from '../core/facts'

/* 🥕 Le Potager — phase 4, « la Ferme des calculs » (23/09). Il remplace le
   Grand Tableau × : c'est la même table de Pythagore, en grille claire (le
   rendu choisi par le père sur maquette, la « 5a »), où chaque case d'un
   rectangle reçoit sa plante — une espèce par rangée (`core/plants.ts`).

   7 × 8, c'est 7 rangées de 8 : on le trace au doigt depuis le coin, les
   plantes poussent, puis on compte par rangées. Le total de chaque rangée
   s'écrit EN GRAND sur la plante estompée de la dernière colonne (8, 16…
   56) — exactement là où ce nombre vit dans la table — et le résultat final
   éclate en pastille VERTE : dans ce jeu, le vert dit « juste » et le rouge
   « faux » (24/09 : une bonne réponse en corail passait pour une erreur). Chaque rangée sonne une note plus haute : la
   table devient une petite mélodie.

   Trois modes :
   - Découvre : rectangles libres au doigt ; « Tourne » fait sauter chaque
     plante sur sa case miroir (7 × 8 = 8 × 7, les mêmes plantes) ;
   - Récolte : douze questions composées par la mémoire des calculs
     (`core/facts.ts`), une caisse par bonne réponse. L'aide s'efface calcul
     par calcul : le carré qui se compte seul, le carré planté, le contour,
     les nombres seuls, le pavé. En flamme, les divisions des calculs sus :
     56 ÷ 7, c'est chercher 56 dans la rangée du 7 ;
   - Tableau : toute la table ; les calculs sus gardent leur plante (rien ne
     fane jamais), une case touchée dit son calcul, « Tout montrer ».

   Apprendre, donc AUCUNE sanction : ni vies, ni chrono, ni bonus de vitesse.
   Le temps de réponse est mesuré en silence (su par cœur ou recompté ?).
   Le « presque » est dessiné : 49 pour 7 × 8, le champ plante SON carré 7 × 7
   (et 49 s'écrit à sa vraie place dans la table), puis la colonne qui manque
   pousse en or. La voix ne dit que le contenu (« sept fois huit, 56 »). */

type Mode = 'discover' | 'harvest' | 'table'

const N = 10
const STEP = 380            // un temps de la mélodie des rangées (ms)
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760]
const MARKS = ['pl', 'tot', 'res', 'her', 'gold', 'over', 'dig', 'q', 'num', 'bump'] as const

const fois = (a: number, b: number) => `${a === 1 ? 'une' : a} fois ${b}`
const divise = (a: number, b: number) => `${a * b} divisé par ${a}`

/** Couleur d'une case selon sa valeur, comme l'ancien Grand Tableau :
    petit → jaune, grand → corail. */
function cellColor(v: number): string {
  const t = Math.min(1, Math.max(0, (v - 1) / 99))
  const a = [255, 224, 138], b = [255, 123, 107]
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(',')})`
}

interface Cell {
  el: HTMLElement
  img: HTMLImageElement
  n: HTMLElement
  r: number
  c: number
  sp: Plant
}

interface Q {
  item: Item
  op: 'mul' | 'div'
  /** Rangées (le premier facteur, ou le diviseur) et colonnes. */
  r: number
  c: number
  /** Ce qu'on demande : r × c, ou c pour (r × c) ÷ r. */
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
  gen: number
  lock: boolean
  over: boolean
  counting: boolean
  cells: Cell[]
  rows: HTMLElement[]
  cols: HTMLElement[]
  grid: HTMLElement
  frame: HTMLElement
  R: number
  C: number
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
  shownAll: boolean
}

let pg: State | null = null
let ctx: GameContext

const cellAt = (me: State, r: number, c: number) => me.cells[(r - 1) * N + (c - 1)]

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
  g.appendChild(Object.assign(document.createElement('div'), { className: 'pg-h pg-corner', textContent: '×' }))
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
      el.style.setProperty('--cc', cellColor(r * c))
      const img = document.createElement('img')
      img.alt = ''
      img.draggable = false
      const sp = rowPlant(r)
      img.src = plantUrl(sp)
      const n = document.createElement('b')
      n.className = 'pg-n'
      el.append(img, n)
      g.appendChild(el)
      me.cells.push({ el, img, n, r, c, sp })
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

function lightHeads(me: State, r: number, c: number) {
  me.rows.forEach((h, i) => h.classList.toggle('on', i + 1 === r))
  me.cols.forEach((h, i) => h.classList.toggle('on', i + 1 === c))
}

function setSpecies(cell: Cell, sp: Plant) {
  if (cell.sp === sp) return
  cell.sp = sp
  cell.img.src = plantUrl(sp)
}

/** Plante le rectangle R × C (une espèce par rangée) et arrache le reste.
    `wave` : ça pousse en vague depuis le coin. */
function setRect(me: State, R: number, C: number, wave = false) {
  me.R = R; me.C = C
  for (const cell of me.cells) {
    const inside = cell.r <= R && cell.c <= C
    const was = cell.el.classList.contains('pl')
    if (inside && !was) {
      setSpecies(cell, rowPlant(cell.r))
      cell.el.style.setProperty('--d', wave ? `${(cell.r + cell.c - 2) * 28}ms` : '0ms')
      cell.el.classList.add('pl')
    } else if (!inside && was) {
      cell.el.classList.remove('pl')
    }
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

/** Le contour à la craie autour du rectangle (niveau « Contour »). */
function placeFrame(me: State) {
  if (!me.frame.classList.contains('on') || !me.frame.dataset.r) return
  const R = Number(me.frame.dataset.r), C = Number(me.frame.dataset.c)
  const a = cellAt(me, 1, 1).el, b = cellAt(me, R, C).el
  const pad = 4
  Object.assign(me.frame.style, {
    left: a.offsetLeft - pad + 'px', top: a.offsetTop - pad + 'px',
    width: b.offsetLeft + b.offsetWidth - a.offsetLeft + pad * 2 + 'px',
    height: b.offsetTop + b.offsetHeight - a.offsetTop + pad * 2 + 'px'
  })
}

function showFrame(me: State, R: number, C: number) {
  me.frame.dataset.r = String(R); me.frame.dataset.c = String(C)
  me.frame.classList.add('on')
  placeFrame(me)
}

/* ---------- Compter par rangées : la table qui chante ---------- */

function countRows(me: State, R: number, C: number, done?: () => void) {
  me.counting = true
  for (let i = 1; i <= R; i++) {
    later(me, i * STEP, () => {
      for (let c = 1; c <= C; c++) {
        const cell = cellAt(me, i, c)
        cell.el.classList.remove('bump'); void cell.el.offsetWidth; cell.el.classList.add('bump')
      }
      mark(cellAt(me, i, C), 'tot', i * C)
      tone(PENTA[i - 1], 0.32, 'triangle', 0.11)
      tone(PENTA[i - 1] * 2, 0.18, 'sine', 0.035, 0.02)
    })
  }
  later(me, (R + 1) * STEP, () => {
    const last = cellAt(me, R, C)
    last.el.classList.remove('tot')
    mark(last, 'res', R * C)
    sfx('pluck', { vol: 0.5, rate: 1.2 })
    me.counting = false
    done?.()
  })
}

/* ---------- Découvre ---------- */

function paintDiscover(me: State, withResult: boolean) {
  const q = $('pgQ')
  if (!me.R) { q.innerHTML = ''; return }
  q.innerHTML = `<span class="r">${me.R}</span><span class="x">×</span><span class="c">${me.C}</span>` +
    (withResult ? `<span class="x">=</span><span class="v">${me.R * me.C}</span>` : '')
  const pv = document.getElementById('pgPivot') as HTMLButtonElement | null
  if (pv) pv.disabled = !withResult || me.R === me.C
}

function dragTo(me: State, r: number, c: number) {
  if (r === me.R && c === me.C) return
  const grew = r * c > me.R * me.C
  me.gen++
  me.counting = false
  clearMarks(me, true)
  setRect(me, r, c)
  lightHeads(me, r, c)
  paintDiscover(me, false)
  if (grew) sfx('pluck', { vol: 0.28, rate: 0.75 + (r * c) / 100 * 0.7 })
}

function release(me: State) {
  if (!me.R) return
  const R = me.R, C = me.C
  countRows(me, R, C, () => {
    paintDiscover(me, true)
    ctx.say(`${fois(R, C)}, ${R * C}`)
  })
}

/** Chaque plante de (r, c) saute sur (c, r) : ce sont LES MÊMES plantes. */
function pivot(me: State) {
  if (me.counting || !me.R || me.R === me.C) return
  const R = me.R, C = me.C
  me.gen++
  clearMarks(me, true)
  // Où est chaque plante, et laquelle c'est, avant le saut
  const from = new Map<string, DOMRect>()
  const species = new Map<string, Plant>()
  for (const cell of me.cells) {
    if (cell.r <= R && cell.c <= C) {
      from.set(`${cell.r}:${cell.c}`, cell.img.getBoundingClientRect())
      species.set(`${cell.r}:${cell.c}`, cell.sp)
    }
  }
  me.R = C; me.C = R
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
  later(me, 900 + (me.R + me.C) * 22, () => {
    for (const cell of moving) cell.img.style.transition = ''
    countRows(me, me.R, me.C, () => {
      paintDiscover(me, true)
      ctx.say(`${fois(me.R, me.C)}, ${me.R * me.C}`)
    })
  })
}

/* ---------- Récolte ---------- */

function paintDots(me: State) {
  $('pgDots').innerHTML = Array.from({ length: me.queue.length }, (_, i) => `<i class="pg-dot${i < me.done ? ' on' : ''}"></i>`).join('')
}

function paintQuestion(me: State, withAnswer = false) {
  const q = me.q
  if (!q) return
  const tail = withAnswer ? `<span class="x">=</span><span class="ok">${q.ans}</span>`
    : q.pad ? `<span class="x">=</span><span class="v pg-typed" id="pgTyped">${q.typed || '…'}</span>` : ''
  $('pgQ').innerHTML = q.op === 'div'
    ? `<span class="v">${q.r * q.c}</span><span class="x">÷</span><span class="r">${q.r}</span>${tail}`
    : `<span class="r">${q.r}</span><span class="x">×</span><span class="c">${q.c}</span>${tail}`
}

function harvestPool(me: State): Fact[] {
  const mul = ctx.byTier(mulPool([2, 5, 10]), mulPool([1, 2, 3, 4, 5]), mulPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
  // En flamme, les divisions des multiplications déjà sues
  return ctx.tier === 'exp' ? [...mul, ...divPool(mul, me.mem)] : mul
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

function ask(me: State) {
  if (me.qi >= me.queue.length) { outro(me); return }
  const item = me.queue[me.qi]
  const [r, c] = orient(item.fact)
  const op = item.fact.op
  const view = viewLevel(me.mem, item)
  me.gen++
  clearMarks(me)
  setRect(me, 0, 0)
  me.q = { item, op, r, c, ans: op === 'div' ? c : r * c, view, tries: 0, ready: false, t0: 0, pad: view === LV.heart, typed: '', opts: [] }
  lightHeads(me, r, op === 'div' ? 0 : c)
  paintQuestion(me)
  $('pgOpts').innerHTML = ''
  const say = () => ctx.say(op === 'div' ? divise(r, c) : fois(r, c))
  if (op === 'div') {
    // 56 ÷ 7 : chercher 56 dans la rangée du 7
    if (view === LV.discover) {
      later(me, 300, () => {
        rowNumbers(me, r)
        later(me, 250 + N * 45, () => {
          const hit = cellAt(me, r, c)
          hit.el.classList.remove('num'); mark(hit, 'res', r * c)
          lightHeads(me, r, c)
          say()
          later(me, 700, () => offer(me, 3))
        })
      })
    } else if (view === LV.plants) {
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
      setRect(me, r, c, true)
      later(me, 450 + (r + c) * 28, () => countRows(me, r, c, () => {
        ctx.say(`${fois(r, c)}, ${r * c}`)
        later(me, 600, () => offer(me, 3))
      }))
    })
  } else if (view === LV.plants) {
    later(me, 250, () => {
      setRect(me, r, c, true)
      say()
      later(me, 450 + (r + c) * 28, () => offer(me, 3))
    })
  } else if (view === LV.outline) {
    later(me, 250, () => {
      for (const cell of me.cells) if (cell.r <= r && cell.c <= c) mark(cell, 'dig')
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

/** La rangée du diviseur se remplit de ses nombres : 7, 14, 21… 70. */
function rowNumbers(me: State, r: number) {
  for (let c = 1; c <= N; c++) {
    later(me, c * 45, () => mark(cellAt(me, r, c), 'num', r * c))
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
    q.opts = q.op === 'div' ? divChoices(q.r, q.c, n, Math.random, exclude) : mulChoices(q.r, q.c, n, Math.random, exclude)
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
      me.firstTry++
      me.streak++
      setMusicIntensity(me.streak >= 10 ? 3 : me.streak >= 6 ? 2 : me.streak >= 3 ? 1 : 0)
    }
    btn?.classList.add('good')
    success(me)
    return
  }
  // Une erreur : aucune sanction, l'aide revient
  q.tries++
  me.streak = 0
  setMusicIntensity(0)
  sfx('drop', { vol: 0.35, rate: 0.8 })
  if (btn) { btn.classList.add('bad'); btn.disabled = true }
  if (q.tries === 1) {
    record(me.mem, q.item, { ok: false, fast: false })
    saveMemory('potager', me.mem)
    if (q.item.kind !== 'again') requeue(me.queue, me.qi, q.item.fact)
    showMiss(me, v)
  } else {
    // Deuxième erreur : la bonne réponse brille, jamais d'impasse
    document.querySelectorAll<HTMLButtonElement>('.pg-opt').forEach(b => {
      if (Number(b.dataset.v) === q.ans) b.classList.add('hint')
      else b.disabled = true
    })
    q.ready = true
  }
}

/** Le « presque » : SON rectangle, et sa réponse écrite à sa vraie place
    dans la table (49 est dans la case 7 × 7). Puis ce qui manque pousse en
    or — ou ce qui dépasse rentre sous terre. Sinon, le bon rectangle pousse
    et se compte. Puis la même question revient, sa mauvaise réponse retirée. */
function showMiss(me: State, v: number) {
  const q = me.q!
  me.gen++ // les animations de la question (rangée de nombres…) s'arrêtent là
  me.lock = true
  $('pgOpts').querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = true })
  clearMarks(me)
  setRect(me, 0, 0)
  // La division 56 ÷ 7 = v, c'est le rectangle 7 × v ; la multiplication, son voisin
  const nm = q.op === 'div' ? (v >= 1 && v <= N ? { r: q.r, c: v } : null) : nearMiss(q.r, q.c, v)
  const total = q.r * q.c
  // Le nouvel essai garde l'aide (les plantes, ou la rangée des nombres pour
  // une division) mais pas la réponse : c'est à elle de la retrouver
  const retry = () => {
    clearMarks(me, true)
    if (q.op === 'div') { setRect(me, 0, 0); rowNumbers(me, q.r); lightHeads(me, q.r, 0) }
    else { setRect(me, q.r, q.c); lightHeads(me, q.r, q.c) }
    me.lock = false
    offer(me, 3, [v])
  }
  if (nm) {
    later(me, 200, () => {
      setRect(me, nm.r, nm.c, true)
      later(me, 350 + (nm.r + nm.c) * 28, () => {
        mark(cellAt(me, nm.r, nm.c), 'her', nm.r * nm.c)
        lightHeads(me, nm.r, nm.c)
        later(me, 900, () => {
          const bigger = nm.r * nm.c > total
          for (const cell of me.cells) {
            const inAns = cell.r <= q.r && cell.c <= q.c, inHers = cell.r <= nm.r && cell.c <= nm.c
            if (inAns && !inHers) mark(cell, 'gold')
            if (!inAns && inHers) mark(cell, 'over')
          }
          if (bigger) {
            later(me, 450, () => { setRect(me, q.r, q.c); sfx('drop', { vol: 0.3, rate: 1.3 }) })
          } else {
            setRect(me, q.r, q.c, true)
            sfx('pluck', { vol: 0.5, rate: 1.25 })
          }
          later(me, 700, () => {
            const her = cellAt(me, nm.r, nm.c)
            her.el.classList.remove('her'); her.n.textContent = ''
            mark(cellAt(me, q.r, q.c), 'res', total)
            lightHeads(me, q.r, q.c)
            later(me, 1100, () => {
              for (const cell of me.cells) cell.el.classList.remove('gold', 'over')
              retry()
            })
          })
        })
      })
    })
  } else {
    later(me, 200, () => {
      setRect(me, q.r, q.c, true)
      later(me, 450 + (q.r + q.c) * 28, () => countRows(me, q.r, q.c, () => later(me, 500, retry)))
    })
  }
}

function success(me: State) {
  const q = me.q!
  me.gen++ // idem : plus rien de la question ne doit apparaître après la réponse
  me.lock = true
  me.frame.classList.remove('on')
  for (const cell of me.cells) {
    cell.el.classList.remove('dig', 'q', 'num', 'tot', 'her', 'res')
    cell.n.textContent = ''
  }
  setRect(me, q.r, q.c, true)
  mark(cellAt(me, q.r, q.c), 'res', q.r * q.c)
  lightHeads(me, q.r, q.c)
  paintQuestion(me, true)
  sfx('confirm', { vol: 0.65 })
  ctx.say(q.op === 'div' ? `${divise(q.r, q.c)}, ${q.c}` : `${fois(q.r, q.c)}, ${q.ans}`)
  // La récolte : les plantes rentrent dans la caisse, une caisse de plus
  later(me, 1500, () => {
    setRect(me, 0, 0)
    for (const cell of me.cells) { cell.el.classList.remove('res'); cell.n.textContent = '' }
    me.done++
    paintDots(me)
    sfx('pluck', { vol: 0.45, rate: 0.9 })
  })
  later(me, 2050, () => { me.qi++; me.lock = false; ask(me) })
}

function outro(me: State) {
  me.over = true
  me.lock = true
  me.q = null
  $('pgOpts').innerHTML = ''
  lightHeads(me, 0, 0)
  $('pgDots').classList.add('wave')
  // Tout le potager fleurit une dernière fois
  setRect(me, N, N, true)
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

/* ---------- Tableau : toute la table, et ce qu'elle sait déjà ---------- */

function showTable(me: State) {
  clearMarks(me)
  // Les calculs sus gardent leur plante — rien ne fane jamais
  for (const cell of me.cells) {
    const known = recOf(me.mem, mulKey(cell.r, cell.c)).lv >= LV.numbers
    setSpecies(cell, rowPlant(cell.r))
    cell.el.style.setProperty('--d', `${(cell.r + cell.c) * 18}ms`)
    cell.el.classList.toggle('pl', known)
  }
  me.shownAll = false
}

function tapTable(me: State, cell: Cell) {
  const v = cell.r * cell.c
  lightHeads(me, cell.r, cell.c)
  if (!cell.el.classList.contains('num')) {
    mark(cell, 'num', v)
    sfx('tick', { vol: 0.35, rate: 1.3 })
  }
  ctx.say(`${fois(cell.r, cell.c)}, ${v}`)
}

function toggleAll(me: State) {
  me.gen++
  me.shownAll = !me.shownAll
  if (!me.shownAll) {
    for (const cell of me.cells) { cell.el.classList.remove('num'); cell.n.textContent = '' }
    sfx('drop', { vol: 0.3, rate: 0.9 })
    return
  }
  sfx('confirm', { vol: 0.5 })
  for (const cell of me.cells) later(me, (cell.r + cell.c) * 22, () => mark(cell, 'num', cell.r * cell.c))
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
  clearMarks(me)
  setRect(me, 0, 0)
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
  me.hint?.remove()
  me.hint = null
  if (mode === 'discover') {
    extra.innerHTML = `<span class="tool-item"><button class="sn-tool pg-big" id="pgPivot" aria-label="Tourne" disabled>${ICON.rotate}</button><i class="tool-cap">Tourne</i></span>`
    ;($('pgPivot') as HTMLButtonElement).onclick = () => { if (pg === me) pivot(me) }
    // La main qui montre le geste : du coin, on tire le rectangle
    const hint = document.createElement('div')
    hint.className = 'pg-hint'
    hint.innerHTML = ICON.tap
    me.grid.appendChild(hint)
    me.hint = hint
  } else if (mode === 'table') {
    extra.innerHTML = `<span class="tool-item"><button class="sn-tool pg-big pg-all" id="pgAll" aria-label="Tout montrer">${ICON.digits}</button><i class="tool-cap">Tout montrer</i></span>`
    ;($('pgAll') as HTMLButtonElement).onclick = () => { if (pg === me) toggleAll(me) }
    showTable(me)
  } else {
    startHarvest(me)
  }
}

/* ---------- Le jeu ---------- */

export const potager: GameDef = {
  id: 'potager', name: 'Le Potager', icon: '🥕', sq: 'sq-mint', cat: 'reflexion',
  music: 'meadow',
  subtitle: 'Les tables de multiplication qui poussent',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="arena pg-arena" id="pgArea">
        <div class="pg-grid" id="pgGrid"></div>
        <div class="tq-tools pg-tools">
          <span class="tool-item"><button class="sn-tool pg-tool" data-m="discover" aria-label="Découvre">${ICON.tap}</button><i class="tool-cap">Découvre</i></span>
          <span class="tool-item sel"><button class="sn-tool pg-tool sel" data-m="harvest" aria-label="Récolte">${ICON.basket}</button><i class="tool-cap">Récolte</i></span>
          <span class="tool-item"><button class="sn-tool pg-tool" data-m="table" aria-label="Tableau">${ICON.digits}</button><i class="tool-cap">Tableau</i></span>
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
    const me: State = {
      mode: 'harvest', gen: 0, lock: false, over: false, counting: false,
      cells: [], rows: [], cols: [], grid: $('pgGrid'), frame: document.createElement('div'), R: 0, C: 0,
      mem: loadMemory('potager'), queue: [], qi: 0, q: null, firstTry: 0, streak: 0, done: 0,
      drag: null, hint: null, pausedMs: 0, pauseAt: 0, shownAll: false
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
    const onDown = (ev: PointerEvent) => {
      if (pg !== me) return
      const cell = cellFrom(ev.clientX, ev.clientY)
      if (!cell) return
      if (me.mode === 'table') { tapTable(me, cell); return }
      if (me.mode !== 'discover' || me.drag !== null) return
      me.drag = ev.pointerId
      me.hint?.remove(); me.hint = null
      dragTo(me, cell.r, cell.c)
    }
    const onMove = (ev: PointerEvent) => {
      if (pg !== me || me.drag !== ev.pointerId) return
      const cell = cellFrom(ev.clientX, ev.clientY)
      if (cell) dragTo(me, cell.r, cell.c)
    }
    const onUp = (ev: PointerEvent) => {
      if (pg !== me || me.drag !== ev.pointerId) return
      me.drag = null
      release(me)
    }
    me.grid.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
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
        get op() { return me.q ? me.q.op : '' },
        get r() { return me.q ? me.q.r : NaN }, get c() { return me.q ? me.q.c : NaN },
        get answer() { return me.q ? me.q.ans : NaN }, get view() { return me.q ? me.q.view : NaN },
        get tries() { return me.q ? me.q.tries : NaN }, get pad() { return !!me.q?.pad },
        get opts() { return me.q ? [...me.q.opts] : [] }, get over() { return me.over },
        get rect() { return [me.R, me.C] }, get counting() { return me.counting },
        /** Le centre d'une case à l'écran, pour glisser un vrai doigt dessus. */
        cell(r: number, c: number) { const b = cellAt(me, r, c).el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 } },
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

    setMode(me, 'harvest')
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
