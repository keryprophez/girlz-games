import type { GameContext, GameDef } from '../core/types'
import { $, pick, shuffle } from '../core/utils'
import { sfx, preloadSfx } from '../core/sfx'
import { fxAt, JUICE } from '../core/fx'
import { ICON } from '../core/icons'
import { photoImg } from '../core/sprites'

/* L'Intrus — parmi des choses qui vont ensemble, une seule ne va pas.

   Polish du 9/09 (phase 2, Apprendre) :
   - plus de chrono ni de bonus de vitesse ni de série : un exercice, pas
     une course (règle « Apprendre sans sanction ») ;
   - plus d'énoncé en négation à lire : la grille elle-même montre la
     famille ; un petit titre positif (« Les oiseaux ») reste pour celles
     qui lisent, et la voix dit la famille (du contenu, pas une consigne) ;
   - plein écran : les tuiles sont aussi grandes que la place le permet,
     manches en pastilles ; timers de partie, état typé.
   - 23/09 : des photos GÉANTES (la grille choisit le nombre de colonnes qui
     les fait les plus grandes), et la réponse se VOIT : la famille file dans
     le panier en bas, l'intrus reste seul au milieu. Trompée, la joueuse
     voit quand même le tri se faire — c'est là qu'elle apprend.

   Depuis le 12/09, **tout le jeu est en photos réelles** (68 sujets, voir
   `scripts/import-photos.mjs`) : une vraie vache, une vraie fraise, une vraie
   casserole. Il n'y a plus un seul rendu Kenney ici — la règle du père : pas
   deux styles. C'est aussi une règle de jeu : si l'intrus était le seul dessin
   d'une grille de photos, il se repèrerait à son trait, pas à sa famille. */

/* --- Les familles --- */
const FARM = ['cow', 'pig', 'chicken', 'duck', 'horse', 'goat', 'sheep', 'rabbit', 'dog', 'cat']
const WILD = ['elephant', 'giraffe', 'lion', 'monkey', 'bear', 'zebra', 'fox', 'deer', 'hedgehog', 'turtle']
const WATER = ['whale', 'fish', 'penguin', 'frog']
const BIRD = ['duck', 'owl', 'parrot', 'penguin', 'chicken']
const NONBIRD = ['cow', 'pig', 'dog', 'rabbit', 'frog', 'snake', 'fish', 'lion']
const FRUITS = ['apple', 'banana', 'strawberry', 'grapes', 'cherries', 'orange', 'pear',
  'lemon', 'watermelon', 'peach', 'plum']
const VEG = ['carrot', 'tomato', 'broccoli', 'corn', 'eggplant', 'onion', 'cabbage',
  'pumpkin', 'radish', 'potato', 'cucumber', 'mushroom']
const FOODS = ['bread', 'baguette', 'cheese', 'cake', 'cookie', 'muffin', 'croissant', 'egg', 'honey']
const OBJECTS = ['plate', 'cup', 'pot', 'spoon', 'glass']
const ANIMALS = [...FARM, ...WILD]
/* La famille (la majorité) et les intrus possibles ; `q` nomme la famille, en positif */
const CATS = [
  { q: 'Les animaux de la ferme', maj: FARM, intr: WILD },
  { q: 'Les animaux sauvages', maj: WILD, intr: FARM },
  { q: 'Les animaux de l\'eau', maj: WATER, intr: FARM },
  { q: 'Les oiseaux', maj: BIRD, intr: NONBIRD },
  { q: 'Les fruits', maj: FRUITS, intr: ANIMALS },
  { q: 'Les légumes', maj: VEG, intr: FRUITS },
  { q: 'À manger', maj: FOODS, intr: OBJECTS },
  { q: 'Dans la cuisine', maj: OBJECTS, intr: FOODS }
]

/* Le panier d'osier où file la famille */
const BASKET = `<svg viewBox="0 0 120 80" width="150" height="100">
  <path d="M30 34 Q60 -6 90 34" fill="none" stroke="#8B5E3C" stroke-width="7" stroke-linecap="round"/>
  <path d="M8 32 H112 L100 74 Q99 78 94 78 H26 Q21 78 20 74 Z" fill="#D9A05B"/>
  <path d="M14 46 H106 M17 58 H103 M20 70 H100" stroke="#B97F3F" stroke-width="3"/>
  <path d="M34 34 L38 78 M52 34 L53 78 M68 34 L67 78 M86 34 L82 78" stroke="#B97F3F" stroke-width="3"/>
  <rect x="4" y="26" width="112" height="12" rx="6" fill="#B97F3F"/></svg>`

interface State {
  /** Les cases de la manche : les membres de la famille filent au panier. */
  tiles: HTMLButtonElement[]
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
  const intruderE = pick(cat.intr.filter(e => !members.includes(e)))
  const items = shuffle([...members.map(e => ({ e, intruder: false })), { e: intruderE, intruder: true }])
  me.intruder = items.findIndex(i => i.intruder)
  $('intQ').textContent = cat.q
  ctx.say(cat.q)
  const grid = $('intGrid')
  const n = items.length
  // Le nombre de colonnes qui donne les plus grandes photos
  const wrap = $('intWrap')
  const gap = 18
  const W = wrap.clientWidth - 40, H = wrap.clientHeight - 64 - 60 - 130 // barre, titre, panier
  let cols = 1, px = 0
  for (let c = 1; c <= n; c++) {
    const r = Math.ceil(n / c)
    const p = Math.floor(Math.min((W - gap * (c - 1)) / c, (H - gap * (r - 1)) / r, 380))
    if (p > px) { px = p; cols = c }
  }
  grid.style.gridTemplateColumns = `repeat(${cols},${px}px)`
  grid.innerHTML = ''
  me.tiles = []
  me.lock = false
  items.forEach((item, i) => {
    const b = document.createElement('button')
    b.className = 'itile'
    b.style.width = b.style.height = px + 'px'
    // La photo remplit la case : elle a déjà son cadre arrondi
    b.innerHTML = photoImg(item.e, Math.round(px * 0.86))
    b.dataset.i = String(i)
    b.style.animationDelay = `${i * 60}ms`
    b.onclick = () => pickTile(me, b, item.intruder)
    grid.appendChild(b)
    me.tiles.push(b)
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
  ctx.after(isIntruder ? 350 : 900, () => { if (intr === me) toBasket(me) })
  ctx.after(isIntruder ? 1500 : 2100, () => {
    if (intr !== me) return
    if (me.round < me.total) load(me)
    else finish(me)
  })
}

/* La famille file dans le panier, une photo après l'autre ; l'intrus reste */
function toBasket(me: State) {
  const basket = $('intBasket')
  const to = basket.getBoundingClientRect()
  const members = me.tiles.filter((_, i) => i !== me.intruder)
  members.forEach((t, k) => {
    const r = t.getBoundingClientRect()
    const dx = to.left + to.width / 2 - (r.left + r.width / 2)
    const dy = to.top + to.height * 0.35 - (r.top + r.height / 2)
    t.style.transitionDelay = `${k * 90}ms`
    t.style.transform = `translate(${dx}px,${dy}px) scale(.16) rotate(${(k % 2 ? 1 : -1) * 20}deg)`
    t.classList.add('int-fly')
  })
  ctx.after(380 + members.length * 90, () => {
    if (intr !== me) return
    basket.classList.remove('int-got'); void basket.offsetWidth; basket.classList.add('int-got')
    sfx('pluck', { vol: 0.5 })
  })
  me.tiles[me.intruder]?.classList.add('int-alone')
}

function finish(me: State) {
  const stars = me.score >= me.total - 1 ? 3 : me.score >= me.total - 2 ? 2 : 1
  ctx.finish({ title: 'Bravo l\'inspectrice !', msg: `Tu as trouvé ${me.score} intrus sur ${me.total}`, stars })
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
        <div class="int-side">
          <div class="tq-moves" id="intScore"></div>
          <div class="mem-dots" id="intDots"></div>
        </div>
        <div class="int-basket" id="intBasket">${BASKET}</div>
      </div>`
    preloadSfx(['confirm', 'drop', 'pluck'])
    const me: State = { tiles: [], round: 0, total: 6, score: 0, lock: false, intruder: -1 }
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
