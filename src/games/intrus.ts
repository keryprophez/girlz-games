import type { GameContext, GameDef } from '../core/types'
import { $, pick, shuffle } from '../core/utils'
import { sfx, preloadSfx } from '../core/sfx'
import { fxAt, JUICE } from '../core/fx'
import { ICON } from '../core/icons'
import { foodImg, photoImg } from '../core/sprites'

/* L'Intrus — parmi des choses qui vont ensemble, une seule ne va pas.

   Polish du 9/09 (phase 2, Apprendre) :
   - plus de chrono ni de bonus de vitesse ni de série : un exercice, pas
     une course (règle « Apprendre sans sanction ») ;
   - plus d'énoncé en négation à lire : la grille elle-même montre la
     famille ; un petit titre positif (« Les oiseaux ») reste pour celles
     qui lisent, et la voix dit la famille (du contenu, pas une consigne) ;
   - plein écran : les tuiles sont aussi grandes que la place le permet,
     manches en pastilles sur le côté ; timers de partie, état typé.

   Depuis le 12/09, les familles sont faites de **photos réelles** (licences
   libres, voir `scripts/import-photos.mjs`) : une vraie vache, une vraie
   fraise. Règle absolue : **jamais deux styles dans la même grille** — sinon
   l'intrus se repère à son dessin, pas à sa famille. Les familles sur photo
   n'utilisent donc que des mots photographiés (`P(...)`), les autres restent
   entièrement en rendus Kenney. */
type It = { k: 'i' | 'p'; n: string }
const I = (n: string): It => ({ k: 'i', n })
const P = (n: string): It => ({ k: 'p', n })

/* --- Familles EN PHOTO (le gros du jeu) --- */
const PH_FARM = ['cow', 'pig', 'duck', 'goat', 'rabbit', 'dog', 'cat'].map(P)
const PH_WILD = ['elephant', 'giraffe', 'lion', 'monkey', 'bear', 'fox', 'hedgehog', 'turtle'].map(P)
const PH_WATER = ['whale', 'fish', 'penguin', 'frog'].map(P)
const PH_BIRD = ['duck', 'owl', 'parrot', 'penguin'].map(P)
const PH_NONBIRD = ['cow', 'pig', 'dog', 'rabbit', 'frog', 'snake', 'fish', 'lion'].map(P)
const PH_FRUITS = ['apple', 'banana', 'strawberry', 'grapes', 'cherries', 'lemon', 'watermelon'].map(P)
const PH_ANIMALS = ['cow', 'pig', 'dog', 'cat', 'rabbit', 'goat', 'duck', 'lion', 'monkey', 'giraffe'].map(P)
/* --- Familles en rendus Kenney (les mots sans photo digne de ce nom) --- */
const I_VEG = ['carrot', 'broccoli', 'corn', 'tomato', 'eggplant', 'onion', 'cabbage', 'pumpkin-basic', 'radish'].map(I)
const I_FRUITS = ['apple', 'banana', 'strawberry', 'grapes', 'cherries', 'orange', 'pear', 'lemon', 'pineapple', 'watermelon'].map(I)
const P_OBJECTS = ['pot', 'plate-dinner', 'cup', 'bread', 'cake', 'loaf-baguette', 'muffin', 'cookie'].map(I)
const I_FOODS = ['apple', 'bread', 'cheese', 'cookie', 'strawberry', 'muffin', 'corn', 'cake', 'watermelon'].map(I)
/* La famille (la majorité) et les intrus possibles ; `q` nomme la famille, en positif */
const CATS = [
  { q: 'Les animaux de la ferme', maj: PH_FARM, intr: PH_WILD },
  { q: 'Les animaux sauvages', maj: PH_WILD, intr: PH_FARM },
  { q: 'Les animaux de l\'eau', maj: PH_WATER, intr: PH_FARM },
  { q: 'Les oiseaux', maj: PH_BIRD, intr: PH_NONBIRD },
  { q: 'Les fruits', maj: PH_FRUITS, intr: PH_ANIMALS },
  { q: 'Les légumes', maj: I_VEG, intr: I_FRUITS },
  { q: 'À manger', maj: I_FOODS, intr: P_OBJECTS }
]
const same = (a: It, b: It) => a.k === b.k && a.n === b.n

interface State {
  round: number
  total: number
  score: number
  lock: boolean
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
    // Une photo remplit la case (elle a son propre cadre), un rendu 3D respire
    b.innerHTML = item.e.k === 'p'
      ? photoImg(item.e.n, Math.round(px * 0.86))
      : foodImg(item.e.n, Math.round(px * 0.62))
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
    const me: State = { round: 0, total: 6, score: 0, lock: false, intruder: -1 }
    intr = me
    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __int: unknown }).__int = {
        get intruder() { return me.intruder }, get round() { return me.round }, get lock() { return me.lock }, get total() { return me.total }
      }
    }
    load(me)   // plus rien à charger : les photos sont de simples <img>
    return () => { if (intr === me) intr = null }
  }
}
