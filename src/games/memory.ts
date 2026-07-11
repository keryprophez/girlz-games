import type { GameContext, GameDef } from '../core/types'
import { $, FARM, shuffle } from '../core/utils'
import { sFlip, sGood, sWin } from '../core/audio'
import { fxAt, JUICE } from '../core/fx'

let mem: any = {}
let ctx: GameContext

function loadRound() {
  const pairs = mem.rounds[mem.round]
  const picks = shuffle([...FARM]).slice(0, pairs)
  const deck = shuffle([...picks, ...picks])
  mem.first = null; mem.lock = false; mem.found = 0; mem.pairs = pairs
  $('memRound').textContent = `Manche ${mem.round + 1}/${mem.rounds.length}`
  $('memMoves').textContent = `Coups : ${mem.moves}`
  const board = $('memBoard')
  const cols = pairs <= 3 ? 3 : pairs >= 9 ? 5 : 4
  board.style.gridTemplateColumns = `repeat(${cols},minmax(0,1fr))`
  board.style.maxWidth = cols * 98 + 'px'
  board.innerHTML = ''
  const cards: HTMLButtonElement[] = []
  deck.forEach(emoji => {
    const card = document.createElement('button')
    card.className = 'mcard'
    card.dataset.emoji = emoji
    card.innerHTML = `<div class="mcinner"><div class="face back">❓</div><div class="face front">${emoji}</div></div>`
    card.onclick = () => flipCard(card)
    board.appendChild(card)
    cards.push(card)
  })
  mem.lock = true
  cards.forEach(c => c.classList.add('flipped'))
  ctx.toast('Mémorise ! 👀')
  mem.previewT = setTimeout(() => {
    cards.forEach(c => c.classList.remove('flipped'))
    mem.lock = false
  }, Math.min(3400, 1100 + pairs * 230))
}

function flipCard(card: HTMLButtonElement) {
  if (mem.lock || card.classList.contains('flipped') || card.classList.contains('matched')) return
  card.classList.add('flipped'); sFlip()
  if (!mem.first) { mem.first = card; return }
  mem.lock = true; mem.moves++
  $('memMoves').textContent = `Coups : ${mem.moves}`
  if (mem.first.dataset.emoji === card.dataset.emoji) {
    setTimeout(() => {
      if (!mem.running) return
      mem.first.classList.add('matched'); card.classList.add('matched')
      mem.found++; sGood()
      fxAt(card, JUICE.green, 10); fxAt(mem.first, JUICE.green, 10)
      mem.first = null; mem.lock = false
      if (mem.found === mem.pairs) {
        mem.round++
        if (mem.round < mem.rounds.length) {
          ctx.toast('Manche suivante ! 🎉'); sWin()
          setTimeout(() => mem.running && loadRound(), 900)
        } else finish()
      }
    }, 330)
  } else {
    setTimeout(() => {
      if (!mem.running) return
      mem.first.classList.remove('flipped'); card.classList.remove('flipped')
      mem.first = null; mem.lock = false
    }, 820)
  }
}

function finish() {
  sWin()
  const perfect = mem.rounds.reduce((a: number, b: number) => a + b, 0)
  const stars = mem.moves <= perfect * 1.4 ? 3 : mem.moves <= perfect * 2 ? 2 : 1
  ctx.finish({
    title: 'Toutes les paires trouvées !',
    msg: `${ctx.playerName}, terminé en ${mem.moves} coups`,
    stars, starsEarned: stars
  })
}

export const memory: GameDef = {
  id: 'memory', name: 'Memory', icon: '🃏', sq: 'sq-peach', cat: 'memoire',
  subtitle: 'Mémorise pendant l\'aperçu, puis retrouve les paires',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="memRound">Manche 1/3</div>
        <div class="chip" id="memMoves">Coups : 0</div>
      </div>
      <div class="board" id="memBoard"></div>`
    mem = { rounds: c.byTier([3, 4, 6], [4, 6, 8], [6, 8, 10]), round: 0, moves: 0, running: true }
    loadRound()
    return () => { mem.running = false; clearTimeout(mem.previewT) }
  }
}
