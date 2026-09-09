import type { GameContext, GameDef } from '../core/types'
import { $, pick, shuffle } from '../core/utils'
import { sfx, preloadSfx } from '../core/sfx'
import { fxAt, JUICE } from '../core/fx'
import { loadAtlas, spriteSpan, type Atlas } from '../core/sprites'

/* Chasse aux lettres — retrouve les lettres du mot dans l'ordre.
   Premier mot : ton prénom ! Calibré CP pour Jade, mots plus longs pour Joyce. */

/* Des mots qu'on peut MONTRER (un animal de la planche) : le mot est vu,
   dit par la voix et illustré avant d'être cherché — plus d'essai-erreur. */
const WORDS = {
  easy: ['CHAT', 'VACHE', 'POULE', 'CHIEN'],
  med: ['LAPIN', 'CHEVAL', 'COCHON', 'CANARD', 'HIBOU'],
  exp: ['GRENOUILLE', 'PERROQUET', 'PINGOUIN', 'ÉLÉPHANT', 'GIRAFE']
}
const PICS: Record<string, string> = {
  CHAT: 'cat', VACHE: 'cow', POULE: 'chicken', CHIEN: 'dog', LAPIN: 'rabbit', CHEVAL: 'horse', COCHON: 'pig',
  CANARD: 'duck', HIBOU: 'owl', GRENOUILLE: 'frog', PERROQUET: 'parrot', PINGOUIN: 'penguin', ÉLÉPHANT: 'elephant', GIRAFE: 'giraffe'
}
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

let lg: any = null
let ctx: GameContext

function loadWord() {
  const word: string = lg.words[lg.round]
  lg.word = word
  lg.pos = 0
  $('lgRound').textContent = `Mot ${lg.round + 1}/${lg.words.length}`

  // Le mot est d'abord MONTRÉ en entier, dit par la voix et illustré ;
  // puis les lettres s'effacent et il faut les retrouver dans l'ordre
  const pic = PICS[word]
  $('lgPic').innerHTML = pic && lg.atlas ? spriteSpan(lg.atlas, pic, 96) : ''
  const slots = $('lgWord')
  slots.innerHTML = word.split('').map((ch, i) =>
    `<span class="lg-slot peek" data-i="${i}">${ch}</span>`).join('')
  ctx.say(word.toLowerCase())
  lg.peeking = true
  ctx.after(3000, () => {
    if (!lg || !lg.running || lg.word !== word) return
    lg.peeking = false
    slots.querySelectorAll<HTMLElement>('.lg-slot').forEach((s, i) => { s.textContent = ''; s.classList.remove('peek'); if (i === 0) s.classList.add('next') })
  })

  // La grille : lettres du mot + intrus (3 s d’aperçu : le carton-titre en mange 1,5)
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
  if (!lg || !lg.running || lg.peeking || b.classList.contains('used')) return
  if (ch === lg.word[lg.pos]) {
    b.classList.add('used'); sfx('tick', { vol: 0.4, rate: 1.3 }); fxAt(b, JUICE.green, 8)
    const slot = document.querySelector(`.lg-slot[data-i="${lg.pos}"]`) as HTMLElement
    slot.textContent = ch
    slot.classList.add('fill'); slot.classList.remove('next')
    lg.pos++
    const nextSlot = document.querySelector(`.lg-slot[data-i="${lg.pos}"]`)
    if (nextSlot) nextSlot.classList.add('next')
    if (lg.pos === lg.word.length) {
      sfx('confirm', { vol: 0.8 })
      ctx.say(lg.word.toLowerCase())
      lg.round++
      if (lg.round < lg.words.length) ctx.after(1400, () => lg && lg.running && loadWord())
      else ctx.after(1400, () => lg && lg.running && finish())
    }
  } else {
    b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake')
    lg.mistakes++; sfx('drop', { vol: 0.35, rate: 0.8 })
  }
}

function finish() {
  const stars = lg.mistakes <= 1 ? 3 : lg.mistakes <= 4 ? 2 : 1
  ctx.finish({
    title: 'Tous les mots trouvés !',
    msg: `${ctx.playerName} a chassé ${lg.words.length} mots`,
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
      <div class="lg-pic" id="lgPic"></div>
      <div class="lg-word" id="lgWord"></div>
      <div class="lg-grid" id="lgGrid"></div>`
    preloadSfx(['tick', 'confirm', 'drop'])
    const tierWords = c.byTier(WORDS.easy, WORDS.med, WORDS.exp)
    lg = {
      words: [c.playerName.toUpperCase(), ...shuffle([...tierWords]).slice(0, 2)],
      round: 0, mistakes: 0, running: true, atlas: null, peeking: false
    }
    loadAtlas('animals').then((a: Atlas) => { if (lg && lg.running) { lg.atlas = a; loadWord() } })
    return () => { if (lg) { lg.running = false; lg = null } }
  }
}
