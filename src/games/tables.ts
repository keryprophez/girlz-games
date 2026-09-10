import type { GameContext, GameDef } from '../core/types'
import { $, pick, rnd, uniqueNumbers } from '../core/utils'
import { sfx, preloadSfx } from '../core/sfx'
import { fxAt, JUICE } from '../core/fx'
import { ICON } from '../core/icons'

/* Le Grand Tableau — un cadran 10×10 avec quatre façons de jouer :
   Explore (tape une case, elle se révèle et la voix la lit),
   Trouve la case (« où est 42 ? »), Remplis ta ligne (compléter une ligne
   entière), Tape le résultat (clavier chiffres).
   Le même moteur sert aux multiplications ET aux additions : seule
   l'opération change (symbole, calcul, phrase dite par la voix).

   Polish du 9/09 (phase 2, Apprendre) :
   - plein écran : la grille prend toute la hauteur, cases LISIBLES (police
     à la taille de la case, cases cachées à 45 % au lieu de 28 %) ;
   - les modes sont une colonne d'icônes, la consigne devient un grand
     nombre-cible ou une opération sur le côté : plus une phrase à lire ;
   - aucune sanction ; timers de partie ; état typé. */

interface BoardOp {
  id: string
  name: string
  icon: string
  sq: string
  subtitle: string
  symbol: string
  compute(r: number, c: number): number
  /** La phrase lue par la voix — seule chose qu'elle a le droit de dire. */
  voice(r: number, c: number, v: number): string
  vMin: number
  vMax: number
  allowed(ctx: GameContext): number[]
  fillTitle(t: number): string
  exploreWord: string
}

type Mode = 'explore' | 'find' | 'fill' | 'type'
type Cell = HTMLButtonElement & { _r: number; _c: number }

interface State {
  mode: Mode
  cells: Record<string, Cell>
  explored: number
  lock: boolean
  q: number
  totalQ: number
  score: number
  mistakes: number
  target: number
  table: number
  col: number
  typeAnswer: number
  typeT: number
  typeC: number
  typed: string
}

function createBoard(op: BoardOp): GameDef {
  /* Les quatre modes, avec LE mot qui va sous l'icône : l'icône dit déjà tout
   (loupe, cible, crayon, chiffres), le mot est un renfort pour Joyce (8 ans)
   et pour l'adulte qui regarde par-dessus l'épaule — jamais l'inverse. */
const MODE_BTNS: { id: Mode; icon: string; cap: string }[] = [
  { id: 'explore', icon: ICON.search, cap: 'Explore' },
  { id: 'find', icon: ICON.target, cap: 'Trouve' },
  { id: 'fill', icon: ICON.pencil, cap: 'Remplis' },
  { id: 'type', icon: ICON.digits, cap: 'Écris' }
]

let tb: State | null = null
  let ctx: GameContext

  function cellColor(v: number): string {
    const t = Math.min(1, Math.max(0, (v - op.vMin) / (op.vMax - op.vMin)))
    const from = [255, 224, 138], to = [255, 123, 107]
    const c = from.map((f, i) => Math.round(f + (to[i] - f) * t))
    return `rgb(${c[0]},${c[1]},${c[2]})`
  }

  function buildGrid(me: State) {
    const grid = $('tbGrid')
    const wrap = $('tbWrap')
    const side = Math.max(260, Math.min(wrap.clientHeight - 24, wrap.clientWidth - 400))
    grid.style.width = grid.style.height = side + 'px'
    grid.style.fontSize = Math.max(11, Math.floor(side / 11 * 0.42)) + 'px'
    grid.innerHTML = ''
    grid.appendChild(Object.assign(document.createElement('div'), { className: 'tb-h tb-corner', textContent: op.symbol }))
    for (let c = 1; c <= 10; c++) grid.appendChild(Object.assign(document.createElement('div'), { className: 'tb-h', textContent: String(c) }))
    me.cells = {}
    for (let r = 1; r <= 10; r++) {
      grid.appendChild(Object.assign(document.createElement('div'), { className: 'tb-h', textContent: String(r) }))
      for (let c = 1; c <= 10; c++) {
        const b = document.createElement('button') as Cell
        b.className = 'tb-cell'
        b._r = r; b._c = c
        b.style.setProperty('--cc', cellColor(op.compute(r, c)))
        b.onclick = () => tapCell(me, b)
        grid.appendChild(b)
        me.cells[r + ':' + c] = b
      }
    }
  }

  function revealCell(b: Cell, ...cls: string[]) {
    b.textContent = String(op.compute(b._r, b._c))
    b.classList.add('shown', ...cls)
  }

  function resetCells(me: State) {
    Object.values(me.cells).forEach(b => { b.textContent = ''; b.className = 'tb-cell' })
  }

  function paintSide(me: State, html: string) {
    $('tbPrompt').innerHTML = html
    const quiz = me.mode === 'find' || me.mode === 'type'
    $('tbDots').style.display = quiz ? '' : 'none'
    if (quiz) $('tbDots').innerHTML = Array.from({ length: me.totalQ }, (_, i) => `<i class="sn-dot${i < me.q ? ' on' : ''}"></i>`).join('')
    $('tbScore').style.display = me.mode === 'explore' ? 'none' : ''
    $('tbScore').innerHTML = `${ICON.star}<span>${me.mode === 'fill' ? me.col - 1 : me.score}</span>`
  }

  function setMode(me: State, mode: Mode) {
    me.mode = mode
    document.querySelectorAll<HTMLElement>('.tb-tool').forEach(x => {
      const on = x.dataset.m === mode
      x.classList.toggle('sel', on)
      x.parentElement?.classList.toggle('sel', on)
    })
    resetCells(me)
    $('tbOpts').innerHTML = ''
    $('tbDone').style.display = mode === 'explore' ? '' : 'none'
    me.lock = false
    me.q = 0; me.score = 0; me.mistakes = 0; me.totalQ = 8
    if (mode === 'explore') { me.explored = 0; paintSide(me, ICON.search) }
    if (mode === 'find') nextFind(me)
    if (mode === 'type') nextType(me)
    if (mode === 'fill') {
      me.table = pick(op.allowed(ctx).filter(t => t > 1)); me.col = 1
      nextFill(me)
    }
  }

  function nextFind(me: State) {
    if (me.q >= me.totalQ) return finishFind(me)
    const t = pick(op.allowed(ctx))
    const c = rnd(1, 10)
    me.target = op.compute(t, c)
    paintSide(me, `${ICON.target}<b class="tb-big">${me.target}</b>`)
    me.lock = false
  }

  function nextFill(me: State) {
    document.querySelectorAll('.tb-cell.want').forEach(x => x.classList.remove('want'))
    if (me.col > 10) {
      const stars = me.mistakes <= 1 ? 3 : me.mistakes <= 4 ? 2 : 1
      ctx.finish({
        title: op.fillTitle(me.table),
        msg: `${ctx.playerName} a rempli toute la ligne${me.mistakes ? ` (${me.mistakes} essai${me.mistakes > 1 ? 's' : ''} de trop)` : ' sans se tromper'}`,
        stars, starsEarned: stars
      })
      return
    }
    const cell = me.cells[me.table + ':' + me.col]
    cell.classList.add('want')
    const answer = op.compute(me.table, me.col)
    paintSide(me, `<b class="tb-big">${me.table} ${op.symbol} ${me.col}</b>`)
    const opts = uniqueNumbers(answer, Math.max(op.vMin, answer - 12), answer + 12, 4)
    const box = $('tbOpts')
    box.innerHTML = ''
    opts.forEach(v => {
      const b = document.createElement('button')
      b.className = 'qopt tb-opt'
      b.textContent = String(v)
      b.onclick = () => {
        if (tb !== me || me.lock) return
        if (v === answer) {
          revealCell(cell, 'good'); sfx('confirm', { vol: 0.7 }); fxAt(cell, JUICE.green, 8)
          ctx.say(op.voice(me.table, me.col, answer))
          me.col++
          box.innerHTML = ''
          ctx.after(600, () => { if (tb === me && me.mode === 'fill') nextFill(me) })
        } else {
          b.classList.add('bad'); me.mistakes++; sfx('drop', { vol: 0.4, rate: 0.8 })
        }
      }
      box.appendChild(b)
    })
  }

  function nextType(me: State) {
    document.querySelectorAll('.tb-cell.want').forEach(x => x.classList.remove('want'))
    if (me.q >= me.totalQ) return finishType(me)
    const t = pick(op.allowed(ctx))
    const c = rnd(1, 10)
    me.typeAnswer = op.compute(t, c)
    me.typeT = t; me.typeC = c
    me.typed = ''
    me.cells[t + ':' + c].classList.add('want')
    paintSide(me, `<b class="tb-big tb-target">${t} ${op.symbol} ${c} = <span id="tbTyped">…</span></b>`)
    const box = $('tbOpts')
    box.innerHTML = `<div class="tb-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0, '⌫']
      .map(k => `<button class="tb-key${k === '⌫' ? ' del' : ''}" data-k="${k}">${k === '⌫' ? ICON.turnLeft : k}</button>`).join('')}</div>`
    box.querySelectorAll<HTMLElement>('.tb-key').forEach(b => { b.onclick = () => typeKey(me, b.dataset.k!) })
  }

  function typeKey(me: State, k: string) {
    if (tb !== me || me.mode !== 'type' || me.lock) return
    const disp = document.getElementById('tbTyped')
    if (!disp) return
    if (k === '⌫') me.typed = me.typed.slice(0, -1)
    else if (k === '✔') { if (me.typed) checkTyped(me); return }
    else if (me.typed.length < 3) me.typed += k
    disp.textContent = me.typed || '…'
    if (me.typed.length === String(me.typeAnswer).length) checkTyped(me)
  }

  function checkTyped(me: State) {
    const cell = me.cells[me.typeT + ':' + me.typeC]
    if (parseInt(me.typed) === me.typeAnswer) {
      me.lock = true
      revealCell(cell, 'good'); me.score++; sfx('confirm', { vol: 0.7 }); fxAt(cell, JUICE.green, 10)
      ctx.say(op.voice(me.typeT, me.typeC, me.typeAnswer))
      me.q++
      ctx.after(900, () => { if (tb === me && me.mode === 'type') { me.lock = false; nextType(me) } })
    } else {
      me.mistakes++; sfx('drop', { vol: 0.4, rate: 0.8 })
      me.typed = ''
      const disp = document.getElementById('tbTyped')
      if (disp) {
        disp.textContent = '…'
        const target = disp.closest('.tb-target') as HTMLElement | null
        if (target) { target.classList.remove('shake'); void target.offsetWidth; target.classList.add('shake') }
      }
    }
  }

  function finishType(me: State) {
    const stars = me.mistakes <= 1 ? 3 : me.mistakes <= 4 ? 2 : 1
    ctx.finish({
      title: 'Championne du calcul !',
      msg: `${ctx.playerName} a tapé ${me.score} résultats`,
      stars, starsEarned: stars
    })
  }

  function tapCell(me: State, b: Cell) {
    if (tb !== me || me.lock) return
    const v = op.compute(b._r, b._c)
    if (me.mode === 'explore') {
      if (b.classList.contains('shown')) { ctx.say(op.voice(b._r, b._c, v)); return }
      revealCell(b); sfx('tick', { vol: 0.35, rate: 1.3 }); fxAt(b, JUICE.warm, 6)
      ctx.say(op.voice(b._r, b._c, v))
      me.explored++
      if (me.explored === 100) sfx('confirm', { vol: 0.8 })
      return
    }
    if (me.mode === 'find') {
      me.lock = true
      if (v === me.target) {
        revealCell(b, 'good'); me.score++; sfx('confirm', { vol: 0.7 }); fxAt(b, JUICE.green, 10)
        ctx.say(op.voice(b._r, b._c, v))
      } else {
        revealCell(b, 'bad'); sfx('drop', { vol: 0.4, rate: 0.8 })
        ctx.say(op.voice(b._r, b._c, v))
        ctx.after(900, () => b.classList.remove('bad'))
      }
      me.q++
      paintSide(me, `${ICON.target}<b class="tb-big">${me.target}</b>`)
      ctx.after(1200, () => { if (tb === me && me.mode === 'find') nextFind(me) })
    }
  }

  function finishFind(me: State) {
    const stars = me.score >= me.totalQ - 1 ? 3 : me.score >= me.totalQ - 3 ? 2 : 1
    ctx.finish({
      title: 'Chasse aux cases terminée !',
      msg: `${ctx.playerName} a trouvé ${me.score} cases sur ${me.totalQ}`,
      stars, starsEarned: stars
    })
  }

  return {
    id: op.id, name: op.name, icon: op.icon, sq: op.sq, cat: 'reflexion',
    subtitle: op.subtitle,
    mount(c) {
      ctx = c
      c.root.innerHTML = `
        <div class="arena tb-wrap" id="tbWrap">
          <div id="tbGrid"></div>
          <div class="tq-tools">
            ${MODE_BTNS.map((m, i) => `<span class="tool-item">
              <button class="sn-tool tb-tool${i === 0 ? ' sel' : ''}" data-m="${m.id}" aria-label="${m.cap}">${m.icon}</button>
              <i class="tool-cap">${m.cap}</i>
            </span>`).join('')}
          </div>
          <div class="tq-side tb-side">
            <div class="tb-prompt" id="tbPrompt"></div>
            <div class="tb-optsrow" id="tbOpts"></div>
            <div class="tq-moves" id="tbScore"></div>
            <div class="mem-dots" id="tbDots"></div>
            <button class="sn-tool go" id="tbDone" aria-label="Fini">${ICON.check}</button>
          </div>
        </div>`
      preloadSfx(['tick', 'confirm', 'drop'])
      const me: State = {
        mode: 'explore', cells: {}, explored: 0, lock: false, q: 0, totalQ: 8, score: 0, mistakes: 0,
        target: 0, table: 2, col: 1, typeAnswer: 0, typeT: 1, typeC: 1, typed: ''
      }
      tb = me
      buildGrid(me)
      document.querySelectorAll<HTMLElement>('.tb-tool').forEach(b => {
        b.onclick = () => { if (tb === me) { sfx('click', { vol: 0.4 }); setMode(me, b.dataset.m as Mode) } }
      })
      ;($('tbDone') as HTMLButtonElement).onclick = () => {
        if (tb !== me || me.mode !== 'explore') return
        ctx.finish({
          title: 'Belle exploration !',
          msg: `${ctx.playerName} a découvert ${me.explored} ${op.exploreWord}`,
          stars: 3, starsEarned: 3
        })
      }
      const onKey = (e: KeyboardEvent) => {
        if (tb !== me || me.mode !== 'type') return
        if (/^[0-9]$/.test(e.key)) typeKey(me, e.key)
        else if (e.key === 'Backspace') typeKey(me, '⌫')
        else if (e.key === 'Enter') typeKey(me, '✔')
      }
      window.addEventListener('keydown', onKey)
      // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __tb: unknown }).__tb = {
          get mode() { return me.mode }, get target() { return me.target }, get q() { return me.q }, get lock() { return me.lock }, get score() { return me.score },
          find: (v: number) => { for (const b of Object.values(me.cells)) if (op.compute(b._r, b._c) === v) { b.click(); return true } return false }
        }
      }
      setMode(me, 'explore')
      return () => {
        if (tb === me) tb = null
        window.removeEventListener('keydown', onKey)
      }
    }
  }
}

/** « une fois huit », pas « un fois huit » */
function fois(a: number, b: number, v: number): string {
  return `${a === 1 ? 'une' : a} fois ${b}, ${v}`
}

export const tables = createBoard({
  id: 'tables', name: 'Grand Tableau ×', icon: '✖️', sq: 'sq-mint',
  subtitle: 'Explore le tableau des multiplications, ou relève un défi !',
  symbol: '×',
  compute: (r, c) => r * c,
  voice: fois,
  vMin: 1, vMax: 100,
  allowed: ctx => ctx.byTier([1, 2, 5, 10], [1, 2, 3, 4, 5, 10], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  fillTitle: t => `Table de ${t} complète !`,
  exploreWord: 'multiplications'
})

export const additions = createBoard({
  id: 'addboard', name: 'Grand Tableau +', icon: '➕', sq: 'sq-sun',
  subtitle: 'Explore le tableau des additions, ou relève un défi !',
  symbol: '+',
  compute: (r, c) => r + c,
  voice: (a, b, v) => `${a} plus ${b}, ${v}`,
  vMin: 2, vMax: 20,
  allowed: ctx => ctx.byTier([1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
  fillTitle: t => `Ligne des ${t} + complète !`,
  exploreWord: 'additions'
})
