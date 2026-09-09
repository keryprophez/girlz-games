import type { GameContext, GameDef } from '../core/types'
import { $, pick, shuffle } from '../core/utils'
import { sfx, preloadSfx } from '../core/sfx'
import { fxAt, JUICE } from '../core/fx'
import { ICON } from '../core/icons'
import { foodImg, loadAtlas, spriteSpan, type Atlas } from '../core/sprites'

/* L'Intrus — parmi des choses qui vont ensemble, une seule ne va pas.

   Polish du 9/09 (phase 2, Apprendre) :
   - plus de chrono ni de bonus de vitesse ni de série : un exercice, pas
     une course (règle « Apprendre sans sanction ») ;
   - plus d'énoncé en négation à lire : la grille elle-même montre la
     famille ; un petit titre positif (« Les oiseaux ») reste pour celles
     qui lisent, et la voix dit la famille (du contenu, pas une consigne) ;
   - plein écran : les tuiles sont aussi grandes que la place le permet,
     manches en pastilles sur le côté ; timers de partie, état typé.

   Chaque proposition est un VRAI visuel : sprite de la planche animals (a),
   poisson de la planche fish (f), ou icône food (i). */
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
/* La famille (la majorité) et les intrus possibles ; `q` nomme la famille, en positif */
const CATS = [
  { q: 'Les animaux de la terre', maj: P_LAND, intr: P_WATER },
  { q: 'Les animaux de l\'eau', maj: P_WATER, intr: P_LAND },
  { q: 'Les oiseaux', maj: P_BIRD, intr: P_NONBIRD },
  { q: 'Les choses jaunes', maj: P_YELLOW, intr: P_NONYELLOW },
  { q: 'Les fruits', maj: I_FRUITS, intr: I_VEG },
  { q: 'Les légumes', maj: I_VEG, intr: I_FRUITS },
  { q: 'Les animaux', maj: P_ANIMALS, intr: P_OBJECTS },
  { q: 'À manger', maj: I_FOODS, intr: P_ANIMALS }
]
const same = (a: It, b: It) => a.k === b.k && a.n === b.n

interface State {
  round: number
  total: number
  score: number
  lock: boolean
  animals: Atlas | null
  fish: Atlas | null
  intruder: number
}

let intr: State | null = null
let ctx: GameContext

function paintSide(me: State) {
  $('intDots').innerHTML = Array.from({ length: me.total }, (_, i) => `<i class="sn-dot${i < me.round ? ' on' : ''}"></i>`).join('')
  $('intScore').innerHTML = `${ICON.star}<span>${me.score}</span>`
}

function load(me: State) {
  paintSide(me)
  const size = ctx.byTier(me.round >= 3 ? 6 : 4, me.round >= 3 ? 9 : 6, me.round >= 2 ? 12 : 9)
  const cat = pick(CATS)
  const members = shuffle([...cat.maj]).slice(0, Math.min(size - 1, cat.maj.length))
  const intruderE = pick(cat.intr.filter(e => !members.some(m => same(m, e))))
  const items = shuffle([...members.map(e => ({ e, intruder: false })), { e: intruderE, intruder: true }])
  me.intruder = items.findIndex(i => i.intruder)
  $('intQ').textContent = cat.q
  ctx.say(cat.q)
  const grid = $('intGrid')
  const n = items.length, cols = n <= 4 ? 2 : n <= 6 ? 3 : 4
  const rows = Math.ceil(n / cols)
  const wrap = $('intWrap')
  const gap = 14
  const px = Math.floor(Math.min((wrap.clientWidth - 280 - gap * (cols - 1)) / cols, (wrap.clientHeight - 90 - gap * (rows - 1)) / rows, 220))
  grid.style.gridTemplateColumns = `repeat(${cols},${px}px)`
  grid.innerHTML = ''
  me.lock = false
  items.forEach((item, i) => {
    const b = document.createElement('button')
    b.className = 'itile'
    b.style.width = b.style.height = px + 'px'
    const sp = Math.round(px * 0.62)
    b.innerHTML = item.e.k === 'i' ? foodImg(item.e.n, sp) : spriteSpan(item.e.k === 'a' ? me.animals! : me.fish!, item.e.n, sp)
    b.dataset.i = String(i)
    b.onclick = () => pickTile(me, b, item.intruder)
    grid.appendChild(b)
  })
}

function pickTile(me: State, btn: HTMLButtonElement, isIntruder: boolean) {
  if (intr !== me || me.lock) return
  me.lock = true
  if (isIntruder) {
    btn.classList.add('good'); me.score++
    sfx('confirm', { vol: 0.7 })
    fxAt(btn, JUICE.warm, 14)
  } else {
    btn.classList.add('bad')
    sfx('drop', { vol: 0.4, rate: 0.8 })
    const t = document.querySelector<HTMLElement>(`.itile[data-i="${me.intruder}"]`)
    t?.classList.add('reveal')
  }
  paintSide(me)
  me.round++
  ctx.after(isIntruder ? 800 : 1300, () => {
    if (intr !== me) return
    if (me.round < me.total) load(me)
    else finish(me)
  })
}

function finish(me: State) {
  const stars = me.score >= me.total - 1 ? 3 : me.score >= me.total - 2 ? 2 : 1
  ctx.finish({ title: 'Bravo l\'inspectrice !', msg: `${ctx.playerName} a trouvé ${me.score} intrus sur ${me.total}`, stars, starsEarned: stars })
}

export const intrus: GameDef = {
  id: 'intrus', name: "L'Intrus", icon: '🔍', sq: 'sq-sun', cat: 'reflexion',
  subtitle: 'Trouve celui qui ne va pas avec les autres',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="arena int-wrap" id="intWrap">
        <div class="int-main">
          <div class="int-q saytext" id="intQ"></div>
          <div class="igrid int-grid" id="intGrid"></div>
        </div>
        <div class="tq-side">
          <div class="tq-moves" id="intScore"></div>
          <div class="mem-dots" id="intDots"></div>
        </div>
      </div>`
    preloadSfx(['confirm', 'drop'])
    const me: State = { round: 0, total: 6, score: 0, lock: false, animals: null, fish: null, intruder: -1 }
    intr = me
    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __int: unknown }).__int = {
        get intruder() { return me.intruder }, get round() { return me.round }, get lock() { return me.lock }, get total() { return me.total }
      }
    }
    Promise.all([loadAtlas('animals'), loadAtlas('fish')]).then(([a, f]: Atlas[]) => {
      if (intr === me) { me.animals = a; me.fish = f; load(me) }
    })
    return () => { if (intr === me) intr = null }
  }
}
