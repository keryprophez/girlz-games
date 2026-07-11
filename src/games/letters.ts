import type { GameContext, GameDef } from '../core/types'
import { $, pick, shuffle } from '../core/utils'
import { sGood, sNope, sPop, sWin } from '../core/audio'
import { fxAt, JUICE } from '../core/fx'

/* Chasse aux lettres — retrouve les lettres du mot dans l'ordre.
   Premier mot : ton prénom ! Calibré CP pour Jade, mots plus longs pour Joyce. */

const WORDS = {
  easy: ['CHAT', 'VACHE', 'POULE', 'LAIT'],
  med: ['LAPIN', 'CHEVAL', 'FERME', 'POMME', 'MOUTON'],
  exp: ['TRACTEUR', 'PAPILLON', 'CAROTTE', 'GRENOUILLE', 'COCCINELLE']
}
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

let lg: any = null
let ctx: GameContext

function loadWord() {
  const word: string = lg.words[lg.round]
  lg.word = word
  lg.pos = 0
  $('lgRound').textContent = `Mot ${lg.round + 1}/${lg.words.length}`
  ctx.say(word === ctx.playerName.toUpperCase() ? 'Trouve les lettres de ton prénom !' : `Trouve les lettres du mot ${word.toLowerCase()}`)

  // Les cases du mot à remplir
  const slots = $('lgWord')
  slots.innerHTML = word.split('').map((ch, i) =>
    `<span class="lg-slot${i === 0 ? ' next' : ''}" data-i="${i}"></span>`).join('')

  // La grille : lettres du mot + intrus
  const gridSize = ctx.byTier(Math.max(8, word.length + 3), Math.max(12, word.length + 5), Math.max(14, word.length + 6))
  const decoys: string[] = []
  while (decoys.length < gridSize - word.length) decoys.push(pick(ALPHABET.split('')))
  const tiles = shuffle([...word.split(''), ...decoys])
  const grid = $('lgGrid')
  const cols = tiles.length <= 8 ? 4 : 5
  grid.style.gridTemplateColumns = `repeat(${cols},minmax(0,1fr))`
  grid.style.maxWidth = cols * 78 + 'px'
  grid.innerHTML = ''
  tiles.forEach(ch => {
    const b = document.createElement('button')
    b.className = 'lg-tile'
    b.textContent = ch
    b.onclick = () => tapLetter(b, ch)
    grid.appendChild(b)
  })
}

function tapLetter(b: HTMLButtonElement, ch: string) {
  if (!lg || !lg.running || b.classList.contains('used')) return
  if (ch === lg.word[lg.pos]) {
    b.classList.add('used'); sPop(); fxAt(b, JUICE.green, 8)
    const slot = document.querySelector(`.lg-slot[data-i="${lg.pos}"]`) as HTMLElement
    slot.textContent = ch
    slot.classList.add('fill'); slot.classList.remove('next')
    lg.pos++
    const nextSlot = document.querySelector(`.lg-slot[data-i="${lg.pos}"]`)
    if (nextSlot) nextSlot.classList.add('next')
    if (lg.pos === lg.word.length) {
      sGood(); ctx.say(lg.word.toLowerCase()); ctx.toast('Bravo ! 🎉')
      lg.round++
      if (lg.round < lg.words.length) setTimeout(() => lg && lg.running && loadWord(), 1200)
      else setTimeout(() => lg && lg.running && finish(), 1200)
    }
  } else {
    b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake')
    lg.mistakes++; sNope()
  }
}

function finish() {
  sWin()
  const stars = lg.mistakes <= 1 ? 3 : lg.mistakes <= 4 ? 2 : 1
  ctx.finish({
    title: 'Tous les mots trouvés !',
    msg: `${ctx.playerName} a chassé ${lg.words.length} mots 🔤`,
    stars, starsEarned: stars
  })
}

export const letters: GameDef = {
  id: 'letters', name: 'Chasse aux lettres', icon: '🔤', sq: 'sq-mint', cat: 'reflexion',
  subtitle: 'Retrouve les lettres du mot, dans l\'ordre !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="lgRound">Mot 1/3</div>
      </div>
      <div class="lg-word" id="lgWord"></div>
      <div class="lg-grid" id="lgGrid"></div>`
    const tierWords = c.byTier(WORDS.easy, WORDS.med, WORDS.exp)
    lg = {
      words: [c.playerName.toUpperCase(), ...shuffle([...tierWords]).slice(0, 2)],
      round: 0, mistakes: 0, running: true
    }
    loadWord()
    return () => { if (lg) { lg.running = false; lg = null } }
  }
}
