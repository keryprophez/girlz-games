import type { GameContext, GameDef } from '../core/types'
import { $, pick, shuffle } from '../core/utils'
import { sGood, sNope, sWin } from '../core/audio'
import { fxAt, JUICE } from '../core/fx'

const P_NONFLY = ['🐕', '🐈', '🐷', '🐮', '🐑', '🐰', '🐴', '🐐', '🐢', '🐌', '🦔', '🐹']
const P_FLY = ['🦋', '🐝', '🐞', '🦅', '🕊️', '🦜', '🦇', '🦉', '🐦']
const P_LAND = ['🐕', '🐈', '🐷', '🐮', '🐑', '🐰', '🐴', '🐐', '🦒', '🦓', '🐘', '🦔']
const P_WATER = ['🐟', '🐠', '🐙', '🦈', '🐬', '🦀', '🐳', '🦭', '🐡', '🦞']
const P_NONBIRD = ['🐕', '🐈', '🐷', '🐮', '🐑', '🐰', '🐴', '🐠', '🐙', '🦊', '🐸', '🐢']
const P_BIRD = ['🐔', '🐤', '🦆', '🦅', '🦉', '🐧', '🦜', '🦩', '🕊️']
const P_YELLOW = ['🍌', '🐤', '🌽', '🧀', '🌟', '🍋', '⭐', '🌻']
const P_NONYELLOW = ['🍎', '🍇', '🍓', '🦋', '🐷', '🐸', '🍆', '🔵', '🍅']
const I_FRUITS = ['🍎', '🍓', '🍌', '🍇', '🍊', '🍉', '🍑', '🍒', '🥝', '🍍']
const I_VEG = ['🥕', '🥦', '🌽', '🥔', '🍅', '🥬', '🧅', '🍆', '🫑']
const P_ANIMALS = ['🐕', '🐈', '🐔', '🐷', '🐮', '🐑', '🐰', '🐴', '🦆', '🐐', '🦁', '🐯', '🐘']
const P_OBJECTS = ['🍎', '🚗', '⚽', '🌳', '🏠', '🎈', '📚', '🔵', '⭐', '🪁', '🥕']
const CATS = [
  { q: 'Lequel sait voler ?', maj: P_NONFLY, intr: P_FLY },
  { q: "Lequel vit dans l'eau ?", maj: P_LAND, intr: P_WATER },
  { q: 'Lequel est un oiseau ?', maj: P_NONBIRD, intr: P_BIRD },
  { q: "Lequel n'est PAS jaune ?", maj: P_YELLOW, intr: P_NONYELLOW },
  { q: "Lequel n'est PAS un fruit ?", maj: I_FRUITS, intr: I_VEG },
  { q: "Lequel n'est PAS un animal ?", maj: P_ANIMALS, intr: P_OBJECTS }
]

let intr: any = {}
let ctx: GameContext

function load() {
  $('intRound').textContent = `${intr.round + 1}/${intr.total}`
  $('intScore').textContent = '⭐ ' + intr.score
  const size = ctx.byTier(intr.round >= 3 ? 6 : 4, intr.round >= 3 ? 9 : 6, intr.round >= 2 ? 12 : 9)
  const cat = pick(CATS)
  const members = shuffle([...cat.maj]).slice(0, Math.min(size - 1, cat.maj.length))
  const intruderE = pick(cat.intr.filter(e => !members.includes(e)))
  const items = shuffle([...members.map(e => ({ e, intruder: false })), { e: intruderE, intruder: true }])
  $('intQ').textContent = cat.q + ' 🔊'
  ctx.say(cat.q)
  ;($('intQ') as HTMLElement).onclick = () => ctx.say(cat.q)
  const grid = $('intGrid')
  const n = items.length, cols = n <= 4 ? 2 : n <= 6 ? 3 : 4
  grid.style.gridTemplateColumns = `repeat(${cols},minmax(0,1fr))`
  grid.style.maxWidth = cols * 104 + 'px'
  grid.innerHTML = ''
  intr.lock = false
  items.forEach(item => {
    const b = document.createElement('button') as any
    b.className = 'itile'; b.textContent = item.e
    b._isIntruder = item.intruder
    b.onclick = () => pickTile(b, item.intruder)
    grid.appendChild(b)
  })
  const limit = ctx.byTier(9000, 7000, 5000)
  intr.tStart = performance.now(); intr.tLimit = limit
  const fill = $('intTimer')
  fill.style.width = '100%'
  clearInterval(intr.tInt)
  intr.tInt = setInterval(() => {
    const left = Math.max(0, 1 - (performance.now() - intr.tStart) / limit)
    fill.style.width = left * 100 + '%'
    if (left <= 0) { clearInterval(intr.tInt); if (!intr.lock) onTimeout() }
  }, 80)
}

function pickTile(btn: any, isIntruder: boolean) {
  if (intr.lock) return
  intr.lock = true; clearInterval(intr.tInt)
  if (isIntruder) {
    const fast = performance.now() - intr.tStart < intr.tLimit * 0.5
    btn.classList.add('good'); intr.score++; intr.streak++; sGood()
    fxAt(btn, JUICE.warm, 14)
    if (fast) { intr.score++; ctx.toast('⚡ Rapide ! +1') }
    else if (intr.streak >= 3) ctx.toast('🔥 Série de ' + intr.streak + ' !')
  } else {
    btn.classList.add('bad'); intr.streak = 0; sNope()
    document.querySelectorAll<any>('.itile').forEach(t => { if (t._isIntruder) t.classList.add('reveal') })
  }
  $('intScore').textContent = '⭐ ' + intr.score
  advance(isIntruder ? 700 : 1100)
}

function onTimeout() {
  intr.lock = true; intr.streak = 0; sNope()
  document.querySelectorAll<any>('.itile').forEach(t => { if (t._isIntruder) t.classList.add('reveal') })
  ctx.toast('⏰ Trop tard !')
  advance(1100)
}

function advance(delay: number) {
  intr.round++
  setTimeout(() => {
    if (!intr.running) return
    if (intr.round < intr.total) load()
    else finish()
  }, delay)
}

function finish() {
  sWin()
  const stars = intr.score >= 9 ? 3 : intr.score >= 6 ? 2 : 1
  ctx.finish({ title: "Bravo l'inspecteur !", msg: `${intr.score} points sur 6 manches 🔍`, stars, starsEarned: stars })
}

export const intrus: GameDef = {
  id: 'intrus', name: "L'Intrus", icon: '🔍', sq: 'sq-sun', cat: 'reflexion',
  subtitle: 'Trouve celui qui ne va pas avec les autres',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="intRound">1/6</div>
        <div class="chip" id="intScore">⭐ 0</div>
      </div>
      <div class="gsub saytext" id="intQ"></div>
      <div class="tbar" style="max-width:420px"><div class="tfill" id="intTimer"></div></div>
      <div class="igrid" id="intGrid"></div>`
    intr = { round: 0, total: 6, score: 0, streak: 0, lock: false, tInt: null, running: true }
    load()
    return () => { intr.running = false; clearInterval(intr.tInt) }
  }
}
