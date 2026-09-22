import type { GameContext, GameDef } from '../core/types'
import { pick, shuffle } from '../core/utils'
import { sfx, preloadSfx } from '../core/sfx'
import { fxAt, JUICE } from '../core/fx'
import { ICON } from '../core/icons'
import { photoImg } from '../core/sprites'

/* Chasse aux lettres — retrouve les lettres du mot, dans l'ordre. Premier
   mot : ton prénom (quand on sait qui joue). Calibré CP pour Jade, mots plus
   longs pour Joyce.

   Repris le 22/09 : plein écran (la photo en grand à gauche, le mot et de
   grosses lettres à droite), manches en pastilles au lieu de « Mot 1/3 »,
   un haut-parleur pour réentendre le mot (contenu, règle 2), la lettre
   trouvée VOLE jusqu'à sa case, et après deux erreurs sur une même case la
   bonne lettre se met à luire (de l'aide, pas une sanction). État typé. */

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

interface State {
  words: string[]
  word: string
  round: number
  pos: number
  /** Erreurs sur la case en cours (l'aide s'allume à 2). */
  here: number
  mistakes: number
  running: boolean
  peeking: boolean
  root: HTMLElement
}

let lg: State | null = null
let ctx: GameContext

const q = (me: State, sel: string) => me.root.querySelector<HTMLElement>(sel)!

function paintDots(me: State) {
  q(me, '.lg-dots').innerHTML = me.words.map((_, i) =>
    `<i class="sn-dot${i < me.round ? ' on' : ''}${i === me.round ? ' cur' : ''}"></i>`).join('')
}

function loadWord(me: State) {
  const word = me.words[me.round]
  me.word = word
  me.pos = 0
  me.here = 0
  paintDots(me)

  // Le mot est d'abord MONTRÉ en entier, dit par la voix et illustré ;
  // puis les lettres s'effacent et il faut les retrouver dans l'ordre
  const pic = PICS[word]
  q(me, '.lg-pic').innerHTML = pic ? photoImg(pic, 260) : `<span class="lg-name">${word.charAt(0)}</span>`
  const slots = q(me, '.lg-word')
  slots.innerHTML = word.split('').map((ch, i) =>
    `<span class="lg-slot peek" data-i="${i}">${ch}</span>`).join('')
  ctx.say(word.toLowerCase())
  me.peeking = true
  ctx.after(3000, () => {
    if (lg !== me || !me.running || me.word !== word) return
    me.peeking = false
    slots.querySelectorAll<HTMLElement>('.lg-slot').forEach((sl, i) => { sl.textContent = ''; sl.classList.remove('peek'); if (i === 0) sl.classList.add('next') })
  })

  // La grille : lettres du mot + intrus
  const gridSize = ctx.byTier(Math.max(8, word.length + 3), Math.max(12, word.length + 5), Math.max(14, word.length + 6))
  const decoys: string[] = []
  while (decoys.length < gridSize - word.length) decoys.push(pick(ALPHABET.split('')))
  const tiles = shuffle([...word.split(''), ...decoys])
  const grid = q(me, '.lg-grid')
  const cols = tiles.length <= 8 ? 4 : tiles.length <= 12 ? 4 : 5
  grid.style.gridTemplateColumns = `repeat(${cols},minmax(0,1fr))`
  grid.style.setProperty('--cols', String(cols))
  grid.style.setProperty('--rows', String(Math.ceil(tiles.length / cols)))
  grid.innerHTML = ''
  tiles.forEach(ch => {
    const b = document.createElement('button')
    b.className = 'lg-tile'
    b.textContent = ch
    b.dataset.ch = ch
    b.onclick = () => tapLetter(me, b, ch)
    grid.appendChild(b)
  })
}

/** La lettre vole de sa tuile jusqu'à la case. */
function fly(from: HTMLElement, to: HTMLElement, ch: string, done: () => void) {
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect()
  const el = document.createElement('span')
  el.className = 'lg-fly'
  el.textContent = ch
  el.style.left = a.left + a.width / 2 + 'px'
  el.style.top = a.top + a.height / 2 + 'px'
  document.body.appendChild(el)
  requestAnimationFrame(() => {
    el.style.transform = `translate(calc(-50% + ${b.left + b.width / 2 - a.left - a.width / 2}px), calc(-50% + ${b.top + b.height / 2 - a.top - a.height / 2}px)) scale(.8)`
  })
  ctx.after(280, () => { el.remove(); done() })
}

function tapLetter(me: State, b: HTMLButtonElement, ch: string) {
  if (lg !== me || !me.running || me.peeking || b.classList.contains('used')) return
  if (ch === me.word[me.pos]) {
    b.classList.add('used')
    me.root.querySelectorAll('.lg-tile.help').forEach(t => t.classList.remove('help'))
    sfx('tick', { vol: 0.4, rate: 1.3 })
    const i = me.pos
    const slot = q(me, `.lg-slot[data-i="${i}"]`)
    me.pos++
    me.here = 0
    slot.classList.remove('next')
    fly(b, slot, ch, () => {
      if (lg !== me) return
      slot.textContent = ch
      slot.classList.add('fill')
      fxAt(slot, JUICE.green, 8)
    })
    me.root.querySelector(`.lg-slot[data-i="${me.pos}"]`)?.classList.add('next')
    if (me.pos === me.word.length) {
      sfx('confirm', { vol: 0.8, delay: 0.3 })
      ctx.after(350, () => { if (lg === me) { ctx.say(me.word.toLowerCase()); q(me, '.lg-word').classList.add('won') } })
      me.round++
      ctx.after(1700, () => {
        if (lg !== me || !me.running) return
        q(me, '.lg-word').classList.remove('won')
        if (me.round < me.words.length) loadWord(me)
        else finish(me)
      })
    }
  } else {
    b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake')
    me.mistakes++
    me.here++
    sfx('drop', { vol: 0.35, rate: 0.8 })
    // Deux erreurs sur la même case : la bonne lettre se met à luire
    if (me.here >= 2) {
      const want = me.word[me.pos]
      const t = Array.from(me.root.querySelectorAll<HTMLElement>('.lg-tile:not(.used)')).find(x => x.dataset.ch === want)
      t?.classList.add('help')
    }
  }
}

function finish(me: State) {
  const stars = me.mistakes <= 1 ? 3 : me.mistakes <= 4 ? 2 : 1
  ctx.finish({
    title: 'Tous les mots trouvés !',
    msg: `Tu as chassé ${me.words.length} mots`,
    stars
  })
}

export const letters: GameDef = {
  id: 'letters', name: 'Chasse aux lettres', icon: '🔤', sq: 'sq-mint', cat: 'reflexion',
  subtitle: 'Retrouve les lettres du mot, dans l\'ordre !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="arena lg-arena">
        <div class="lg-left">
          <div class="lg-pic"></div>
          <button class="geo-again lg-say" aria-label="Réécouter">${ICON.sound}</button>
        </div>
        <div class="lg-right">
          <div class="lg-word"></div>
          <div class="lg-grid"></div>
        </div>
        <div class="tq-side"><div class="mem-dots lg-dots"></div></div>
      </div>`
    preloadSfx(['tick', 'confirm', 'drop'])
    const tierWords = c.byTier(WORDS.easy, WORDS.med, WORDS.exp)
    const me: State = {
      // Le prénom en premier mot, seulement si on sait qui joue
      words: c.playerName
        ? [c.playerName.toUpperCase(), ...shuffle([...tierWords]).slice(0, 2)]
        : shuffle([...tierWords]).slice(0, 3),
      word: '', round: 0, pos: 0, here: 0, mistakes: 0, running: true, peeking: false, root: c.root
    }
    lg = me
    q(me, '.lg-say').onclick = () => { if (me.word) ctx.say(me.word.toLowerCase()) }
    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __lg: unknown }).__lg = {
        get word() { return me.word }, get pos() { return me.pos }, get peeking() { return me.peeking }, get round() { return me.round }
      }
    }
    loadWord(me)
    return () => { me.running = false; if (lg === me) lg = null }
  }
}
