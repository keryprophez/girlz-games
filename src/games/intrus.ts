import type { GameContext, GameDef } from '../core/types'
import { $, pick, shuffle } from '../core/utils'
import { sGood, sNope, sWin } from '../core/audio'
import { fxAt, JUICE } from '../core/fx'
import { foodImg, loadAtlas, spriteSpan, type Atlas } from '../core/sprites'

/* Chaque proposition est un VRAI visuel : sprite de la planche animals (a),
   poisson de la planche fish (f), ou icône food (i) — plus d'emoji. */
type It = { k: 'a' | 'f' | 'i'; n: string }
const A = (n: string): It => ({ k: 'a', n })
const F = (n: string): It => ({ k: 'f', n })
const I = (n: string): It => ({ k: 'i', n })

const P_LAND = ['cow', 'pig', 'dog', 'horse', 'goat', 'rabbit', 'giraffe', 'zebra', 'elephant', 'monkey', 'bear', 'moose'].map(A)
const P_WATER = [A('whale'), A('narwhal'), A('walrus'), F('fish_blue'), F('fish_orange'), F('fish_pink'), F('fish_red'), F('fish_green')]
const P_BIRD = ['chicken', 'chick', 'duck', 'owl', 'parrot', 'penguin'].map(A)
const P_NONBIRD = [...['cow', 'pig', 'dog', 'horse', 'goat', 'rabbit', 'frog', 'snake', 'panda'].map(A), F('fish_blue'), F('fish_orange')]
const I_FRUITS = ['apple', 'banana', 'strawberry', 'grapes', 'cherries', 'orange', 'pear', 'lemon', 'pineapple', 'watermelon'].map(I)
const I_VEG = ['carrot', 'broccoli', 'corn', 'tomato', 'eggplant', 'onion', 'cabbage', 'pumpkin-basic', 'radish'].map(I)
const P_ANIMALS = ['cow', 'pig', 'chicken', 'duck', 'horse', 'goat', 'rabbit', 'dog', 'monkey', 'panda', 'zebra', 'elephant'].map(A)
const P_OBJECTS = ['pot', 'plate-dinner', 'cup', 'bread', 'cake', 'loaf-baguette', 'muffin', 'cookie'].map(I)
const P_YELLOW = [I('banana'), I('corn'), I('cheese'), I('lemon'), A('chick')]
const P_NONYELLOW = [I('apple'), I('strawberry'), I('broccoli'), I('tomato'), A('pig'), A('frog'), A('whale'), I('grapes')]
const I_FOODS = ['apple', 'bread', 'cheese', 'cookie', 'strawberry', 'muffin', 'corn', 'cake', 'watermelon'].map(I)
const CATS = [
  { q: "Lequel vit dans l'eau ?", maj: P_LAND, intr: P_WATER },
  { q: 'Lequel est un oiseau ?', maj: P_NONBIRD, intr: P_BIRD },
  { q: "Lequel n'est PAS jaune ?", maj: P_YELLOW, intr: P_NONYELLOW },
  { q: "Lequel n'est PAS un fruit ?", maj: I_FRUITS, intr: I_VEG },
  { q: "Lequel n'est PAS un animal ?", maj: P_ANIMALS, intr: P_OBJECTS },
  { q: "Lequel n'est PAS à manger ?", maj: I_FOODS, intr: P_ANIMALS }
]
const same = (a: It, b: It) => a.k === b.k && a.n === b.n

let intr: any = {}
let ctx: GameContext

function load() {
  $('intRound').textContent = `${intr.round + 1}/${intr.total}`
  $('intScore').textContent = '⭐ ' + intr.score
  const size = ctx.byTier(intr.round >= 3 ? 6 : 4, intr.round >= 3 ? 9 : 6, intr.round >= 2 ? 12 : 9)
  const cat = pick(CATS)
  const members = shuffle([...cat.maj]).slice(0, Math.min(size - 1, cat.maj.length))
  const intruderE = pick(cat.intr.filter(e => !members.some(m => same(m, e))))
  const items = shuffle([...members.map(e => ({ e, intruder: false })), { e: intruderE, intruder: true }])
  $('intQ').textContent = cat.q
  const grid = $('intGrid')
  const n = items.length, cols = n <= 4 ? 2 : n <= 6 ? 3 : 4
  grid.style.gridTemplateColumns = `repeat(${cols},minmax(0,1fr))`
  grid.style.maxWidth = cols * 104 + 'px'
  grid.innerHTML = ''
  intr.lock = false
  items.forEach(item => {
    const b = document.createElement('button') as any
    b.className = 'itile'
    b.innerHTML = item.e.k === 'i' ? foodImg(item.e.n, 54)
      : spriteSpan(item.e.k === 'a' ? intr.animals : intr.fish, item.e.n, 54)
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
    // Les planches d'abord : les manches se construisent avec les sprites
    Promise.all([loadAtlas('animals'), loadAtlas('fish')]).then(([a, f]: Atlas[]) => {
      if (intr.running) { intr.animals = a; intr.fish = f; load() }
    })
    return () => { intr.running = false; clearInterval(intr.tInt) }
  }
}
