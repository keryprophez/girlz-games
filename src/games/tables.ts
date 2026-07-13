import type { GameContext, GameDef } from '../core/types'
import { $, pick, rnd, shuffle, uniqueNumbers } from '../core/utils'
import { sGood, sNope, sPop, sWin } from '../core/audio'
import { fxAt, JUICE } from '../core/fx'

/* Le Grand Tableau — un cadran 10×10 des multiplications avec 3 façons de jouer :
   🔎 Explore (tape une case, elle se révèle et la voix la lit),
   🎯 Trouve la case (« où est 42 ? »),
   ✏️ Remplis ta table (compléter une ligne entière).
   Les cases sont colorées en dégradé selon la valeur : la table devient un paysage. */

let tb: any = null
let ctx: GameContext

function cellColor(v: number): string {
  // Dégradé beurre → corail selon la valeur (1 → 100)
  const t = Math.min(1, (v - 1) / 99)
  const from = [255, 224, 138], to = [255, 123, 107]
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * t))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

function allowedTables(): number[] {
  return ctx.byTier([1, 2, 5, 10], [1, 2, 3, 4, 5, 10], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
}

function buildGrid() {
  const grid = $('tbGrid')
  grid.innerHTML = ''
  // Coin + entêtes colonnes
  grid.appendChild(Object.assign(document.createElement('div'), { className: 'tb-h tb-corner', textContent: '×' }))
  for (let c = 1; c <= 10; c++) grid.appendChild(Object.assign(document.createElement('div'), { className: 'tb-h', textContent: String(c) }))
  tb.cells = {}
  for (let r = 1; r <= 10; r++) {
    grid.appendChild(Object.assign(document.createElement('div'), { className: 'tb-h', textContent: String(r) }))
    for (let c = 1; c <= 10; c++) {
      const b = document.createElement('button') as any
      b.className = 'tb-cell'
      b._r = r; b._c = c
      b.style.setProperty('--cc', cellColor(r * c))
      b.onclick = () => tapCell(b)
      grid.appendChild(b)
      tb.cells[r + ':' + c] = b
    }
  }
}

/** « une fois huit », pas « un fois huit » */
function fois(a: number, b: number, v: number): string {
  return `${a === 1 ? 'une' : a} fois ${b}, ${v}`
}

function revealCell(b: any, ...cls: string[]) {
  b.textContent = String(b._r * b._c)
  b.classList.add('shown', ...cls)
}

function resetCells() {
  Object.values(tb.cells).forEach((b: any) => {
    b.textContent = ''
    b.className = 'tb-cell'
  })
}

function setMode(mode: string) {
  tb.mode = mode
  document.querySelectorAll<HTMLElement>('.tb-mode').forEach(x => x.classList.toggle('sel', x.dataset.m === mode))
  resetCells()
  $('tbOpts').innerHTML = ''
  $('tbDone').style.display = mode === 'explore' ? '' : 'none'
  tb.lock = false
  if (mode === 'explore') {
    tb.explored = 0
    $('tbPrompt').textContent = 'Tape une case pour la découvrir 🔎'
  }
  if (mode === 'find') {
    tb.q = 0; tb.score = 0; tb.totalQ = 8
    nextFind()
  }
  if (mode === 'type') {
    tb.q = 0; tb.score = 0; tb.mistakes = 0; tb.totalQ = 8
    nextType()
  }
  if (mode === 'fill') {
    const t = pick(allowedTables().filter(t => t > 1))
    tb.table = t; tb.col = 1; tb.mistakes = 0
    $('tbPrompt').textContent = `✏️ Remplis la table de ${t} !`
    nextFill()
  }
}

function nextFind() {
  if (tb.q >= tb.totalQ) return finishFind()
  const t = pick(allowedTables())
  const c = rnd(1, 10)
  tb.target = t * c
  $('tbPrompt').innerHTML = `🎯 Trouve une case qui fait <b class="tb-target">${tb.target}</b> <span class="tb-sub">(${tb.q + 1}/${tb.totalQ})</span>`
  tb.lock = false
}

function nextFill() {
  document.querySelectorAll('.tb-cell.want').forEach(x => x.classList.remove('want'))
  if (tb.col > 10) {
    sWin()
    const stars = tb.mistakes <= 1 ? 3 : tb.mistakes <= 4 ? 2 : 1
    ctx.finish({
      title: `Table de ${tb.table} complète !`,
      msg: `${ctx.playerName} a rempli toute la ligne (${tb.mistakes} erreur${tb.mistakes > 1 ? 's' : ''}) ✏️`,
      stars, starsEarned: stars
    })
    return
  }
  const cell = tb.cells[tb.table + ':' + tb.col]
  cell.classList.add('want')
  const answer = tb.table * tb.col
  const opts = uniqueNumbers(answer, Math.max(1, answer - 12), answer + 12, 4)
  const box = $('tbOpts')
  box.innerHTML = ''
  opts.forEach(v => {
    const b = document.createElement('button')
    b.className = 'qopt tb-opt'
    b.textContent = String(v)
    b.onclick = () => {
      if (!tb || !tb.running || tb.lock) return
      if (v === answer) {
        revealCell(cell, 'good'); sGood(); fxAt(cell, JUICE.green, 8)
        ctx.say(fois(tb.table, tb.col, answer))
        tb.col++
        box.innerHTML = ''
        setTimeout(() => tb && tb.running && tb.mode === 'fill' && nextFill(), 600)
      } else {
        b.classList.add('bad'); tb.mistakes++; sNope()
      }
    }
    box.appendChild(b)
  })
}

function nextType() {
  document.querySelectorAll('.tb-cell.want').forEach(x => x.classList.remove('want'))
  if (tb.q >= tb.totalQ) return finishType()
  const t = pick(allowedTables())
  const c = rnd(1, 10)
  tb.typeAnswer = t * c
  tb.typeT = t; tb.typeC = c
  tb.typed = ''
  const cell = tb.cells[t + ':' + c]
  cell.classList.add('want')
  $('tbPrompt').innerHTML = `⌨️ <b class="tb-target">${t} × ${c} = <span id="tbTyped">…</span></b> <span class="tb-sub">(${tb.q + 1}/${tb.totalQ})</span>`
  const box = $('tbOpts')
  // Réglette horizontale : une seule ligne, la grille reste visible dessous
  box.innerHTML = `<div class="tb-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0, '⌫']
    .map(k => `<button class="tb-key${k === '⌫' ? ' del' : ''}" data-k="${k}">${k}</button>`).join('')}</div>`
  box.querySelectorAll<HTMLElement>('.tb-key').forEach(b => {
    b.onclick = () => typeKey(b.dataset.k!)
  })
}

function typeKey(k: string) {
  if (!tb || !tb.running || tb.mode !== 'type' || tb.lock) return
  const disp = document.getElementById('tbTyped')
  if (!disp) return
  if (k === '⌫') { tb.typed = tb.typed.slice(0, -1) }
  else if (k === '✔') { if (tb.typed) checkTyped(); return }
  else if (tb.typed.length < 3) tb.typed += k
  disp.textContent = tb.typed || '…'
  // Validation automatique quand on a tapé autant de chiffres que la réponse
  if (tb.typed.length === String(tb.typeAnswer).length) checkTyped()
}

function checkTyped() {
  const cell = tb.cells[tb.typeT + ':' + tb.typeC]
  if (parseInt(tb.typed) === tb.typeAnswer) {
    tb.lock = true
    revealCell(cell, 'good'); tb.score++; sGood(); fxAt(cell, JUICE.green, 10)
    ctx.say(fois(tb.typeT, tb.typeC, tb.typeAnswer))
    tb.q++
    setTimeout(() => { if (tb && tb.running && tb.mode === 'type') { tb.lock = false; nextType() } }, 900)
  } else {
    tb.mistakes++; sNope()
    tb.typed = ''
    const disp = document.getElementById('tbTyped')
    if (disp) {
      disp.textContent = '…'
      const target = disp.closest('.tb-target') as HTMLElement
      if (target) { target.classList.remove('shake'); void target.offsetWidth; target.classList.add('shake') }
    }
  }
}

function finishType() {
  sWin()
  const stars = tb.mistakes <= 1 ? 3 : tb.mistakes <= 4 ? 2 : 1
  ctx.finish({
    title: 'Championne du calcul !',
    msg: `${ctx.playerName} a tapé ${tb.score} résultats (${tb.mistakes} erreur${tb.mistakes > 1 ? 's' : ''}) ⌨️`,
    stars, starsEarned: stars
  })
}

function tapCell(b: any) {
  if (!tb || !tb.running || tb.lock) return
  const v = b._r * b._c
  if (tb.mode === 'explore') {
    if (b.classList.contains('shown')) { ctx.say(fois(b._r, b._c, v)); return }
    revealCell(b); sPop(); fxAt(b, JUICE.warm, 6)
    ctx.say(fois(b._r, b._c, v))
    tb.explored++
    if (tb.explored === 100) { sWin(); ctx.toast('Tout le tableau découvert ! 🌈') }
    return
  }
  if (tb.mode === 'find') {
    tb.lock = true
    if (v === tb.target) {
      revealCell(b, 'good'); tb.score++; sGood(); fxAt(b, JUICE.green, 10)
      ctx.say('Oui ! ' + fois(b._r, b._c, v))
    } else {
      revealCell(b, 'bad'); sNope()
      ctx.say(`Non, cette case fait ${v}`)
      setTimeout(() => { b.classList.remove('bad') }, 900)
    }
    tb.q++
    setTimeout(() => tb && tb.running && tb.mode === 'find' && nextFind(), 1200)
  }
}

function finishFind() {
  sWin()
  const stars = tb.score >= tb.totalQ - 1 ? 3 : tb.score >= tb.totalQ - 3 ? 2 : 1
  ctx.finish({
    title: 'Chasse aux cases terminée !',
    msg: `${ctx.playerName} a trouvé ${tb.score} cases sur ${tb.totalQ} 🎯`,
    stars, starsEarned: stars
  })
}

export const tables: GameDef = {
  id: 'tables', name: 'Grand Tableau', icon: '✖️', sq: 'sq-mint', cat: 'reflexion',
  subtitle: 'Explore le tableau des multiplications, ou relève un défi !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <button class="chip tb-mode sel" data-m="explore">🔎 Explore</button>
        <button class="chip tb-mode" data-m="find">🎯 Trouve</button>
        <button class="chip tb-mode" data-m="fill">✏️ Remplis</button>
        <button class="chip tb-mode" data-m="type">⌨️ Tape</button>
      </div>
      <div class="gsub" id="tbPrompt"></div>
      <div class="tb-optsrow" id="tbOpts"></div>
      <div id="tbGrid"></div>
      <button class="bigbtn primary" id="tbDone" style="margin-top:10px">✨ J'ai fini d'explorer</button>`
    tb = { mode: 'explore', explored: 0, lock: false, running: true }
    buildGrid()
    document.querySelectorAll<HTMLElement>('.tb-mode').forEach(b => {
      b.onclick = () => tb && tb.running && setMode(b.dataset.m!)
    })
    const doneBtn = $('tbDone') as HTMLButtonElement
    doneBtn.onclick = () => {
      if (!tb || !tb.running || tb.mode !== 'explore') return
      sWin()
      ctx.finish({
        title: 'Belle exploration !',
        msg: `${ctx.playerName} a découvert ${tb.explored} multiplications 🔎`,
        stars: 3, starsEarned: 3
      })
    }
    const onKey = (e: KeyboardEvent) => {
      if (!tb || !tb.running || tb.mode !== 'type') return
      if (/^[0-9]$/.test(e.key)) typeKey(e.key)
      else if (e.key === 'Backspace') typeKey('⌫')
      else if (e.key === 'Enter') typeKey('✔')
    }
    window.addEventListener('keydown', onKey)
    setMode('explore')
    return () => {
      if (tb) { tb.running = false; tb = null }
      window.removeEventListener('keydown', onKey)
    }
  }
}
