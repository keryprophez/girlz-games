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
     manches en pastilles sur le côté ; timers de partie, état typé.

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
  'lemon', 'pineapple', 'watermelon', 'peach', 'plum']
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
  const intruderE = pick(cat.intr.filter(e => !members.includes(e)))
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
    // La photo remplit la case : elle a déjà son cadre arrondi
    b.innerHTML = photoImg(item.e, Math.round(px * 0.86))
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
