import type { GameContext, GameDef } from '../core/types'
import { $, shuffle } from '../core/utils'
import { sfx, preloadSfx } from '../core/sfx'
import { fxAt, JUICE, confetti } from '../core/fx'
import { ICON } from '../core/icons'
import { FARM_ANIMALS, loadAtlas, spriteSpan, type Atlas } from '../core/sprites'

/* Memory — retrouver les paires d'animaux de la ferme (vrais sprites).

   Polish du 7/09 (phase 2, jeux 2D) :
   - plein écran : les cartes sont aussi grandes que la place le permet,
     manches en pastilles et compteur sur le côté — plus rien à lire ;
   - le dos des cartes est un vrai dos (motif étoile), plus un « ? » ;
   - l'aperçu du début ne vide plus le défi : long en douce, bref en
     normale, absent en experte ;
   - une paire trouvée saute et brille, une mauvaise paire se secoue ;
   - sons de gestes, état typé, timers de partie. */

interface State {
  atlas: Atlas | null
  rounds: number[]
  round: number
  moves: number
  pairs: number
  found: number
  first: HTMLButtonElement | null
  lock: boolean
  running: boolean
  deck: string[]
  /** Nombre de manches distribuées : les bots attendent la suivante dessus. */
  dealt: number
}

let mem: State | null = null
let ctx: GameContext

function paintSide(me: State) {
  $('memDots').innerHTML = me.rounds.map((_, i) => `<i class="sn-dot${i < me.round ? ' on' : ''}"></i>`).join('')
  $('memMoves').innerHTML = `${ICON.tap}<span>${me.moves}</span>`
}

/** Colonnes et taille de carte : le plus grand carré qui fait tenir la grille. */
function layout(count: number): { cols: number; px: number } {
  const wrap = $('memWrap')
  const W = wrap.clientWidth - 200, H = wrap.clientHeight - 24
  let best = { cols: 3, px: 40 }
  for (let cols = 3; cols <= 6; cols++) {
    const rows = Math.ceil(count / cols)
    const gap = 14
    const px = Math.min((W - gap * (cols - 1)) / cols, (H - gap * (rows - 1)) / rows)
    if (px > best.px) best = { cols, px }
  }
  return { cols: best.cols, px: Math.floor(Math.min(best.px, 240)) }
}

function loadRound(me: State) {
  const pairs = me.rounds[me.round]
  const picks = shuffle([...FARM_ANIMALS]).slice(0, pairs)
  const deck = shuffle([...picks, ...picks])
  me.first = null; me.lock = false; me.found = 0; me.pairs = pairs; me.deck = deck
  me.dealt++
  paintSide(me)
  const board = $('memBoard')
  const { cols, px } = layout(deck.length)
  board.style.gridTemplateColumns = `repeat(${cols},${px}px)`
  board.innerHTML = ''
  const cards: HTMLButtonElement[] = []
  deck.forEach((name, i) => {
    const card = document.createElement('button')
    card.className = 'mcard'
    card.dataset.k = name
    card.dataset.i = String(i)
    card.style.width = card.style.height = px + 'px'
    card.innerHTML = `<div class="mcinner"><div class="face back">${ICON.star}</div><div class="face front">${spriteSpan(me.atlas!, name, Math.round(px * 0.62))}</div></div>`
    card.onclick = () => flipCard(me, card)
    board.appendChild(card)
    cards.push(card)
  })
  // L'aperçu : long en douce, bref en normale, aucun en experte
  const preview = ctx.byTier(Math.min(2600, 1100 + pairs * 230), 900, 0)
  if (!preview) return
  me.lock = true
  cards.forEach(c => c.classList.add('flipped'))
  ctx.after(preview, () => {
    if (mem !== me) return
    cards.forEach(c => c.classList.remove('flipped'))
    me.lock = false
  })
}

function flipCard(me: State, card: HTMLButtonElement) {
  if (mem !== me || me.lock || card.classList.contains('flipped') || card.classList.contains('matched')) return
  card.classList.add('flipped')
  sfx('cloth', { vol: 0.45, rate: 1.4, spread: 0.1 })
  if (!me.first) { me.first = card; return }
  const first = me.first
  me.lock = true; me.moves++
  paintSide(me)
  if (first.dataset.k === card.dataset.k) {
    ctx.after(330, () => {
      if (mem !== me) return
      first.classList.add('matched'); card.classList.add('matched')
      me.found++
      sfx('confirm', { vol: 0.7, rate: 1 + me.found * 0.04 })
      fxAt(card, JUICE.green, 10); fxAt(first, JUICE.green, 10)
      me.first = null; me.lock = false
      if (me.found === me.pairs) {
        me.round++
        paintSide(me)
        if (me.round < me.rounds.length) {
          confetti()
          ctx.after(1000, () => { if (mem === me) loadRound(me) })
        } else ctx.after(600, () => { if (mem === me) finish(me) })
      }
    })
  } else {
    ctx.after(700, () => {
      if (mem !== me) return
      for (const c of [first, card]) { c.classList.add('nope'); c.classList.remove('flipped') }
      sfx('drop', { vol: 0.35, rate: 0.85 })
      ctx.after(320, () => { for (const c of [first, card]) c.classList.remove('nope') })
      me.first = null; me.lock = false
    })
  }
}

function finish(me: State) {
  const perfect = me.rounds.reduce((a, b) => a + b, 0)
  const stars = me.moves <= perfect * 1.4 ? 3 : me.moves <= perfect * 2 ? 2 : 1
  ctx.finish({
    title: 'Toutes les paires trouvées !',
    msg: `${ctx.playerName} a terminé en ${me.moves} coups`,
    stars, starsEarned: stars
  })
}

export const memory: GameDef = {
  id: 'memory', name: 'Memory', icon: '🃏', sq: 'sq-peach', cat: 'memoire',
  subtitle: 'Mémorise pendant l\'aperçu, puis retrouve les paires',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="arena mem-wrap" id="memWrap">
        <div class="board mem-board" id="memBoard"></div>
        <div class="tq-side">
          <div class="tq-moves" id="memMoves"></div>
          <div class="mem-dots" id="memDots"></div>
        </div>
      </div>`
    preloadSfx(['cloth', 'confirm', 'drop'])
    const me: State = {
      atlas: null, rounds: c.byTier([3, 4, 6], [4, 6, 8], [6, 8, 10]), round: 0, moves: 0,
      pairs: 0, found: 0, first: null, lock: false, running: true, deck: [], dealt: 0
    }
    mem = me
    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __mem: unknown }).__mem = {
        get deck() { return me.deck }, get round() { return me.round }, get lock() { return me.lock }, get rounds() { return me.rounds.length }, get dealt() { return me.dealt },
        flip: (i: number) => { const el = document.querySelector<HTMLButtonElement>(`.mcard[data-i="${i}"]`); if (el) flipCard(me, el) }
      }
    }
    // La planche d'abord : les cartes se construisent avec les sprites
    loadAtlas('animals').then((a: Atlas) => { if (mem === me) { me.atlas = a; loadRound(me) } })
    return () => { if (mem === me) mem = null; me.running = false }
  }
}
