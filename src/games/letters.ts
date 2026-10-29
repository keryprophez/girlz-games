import type { GameContext, GameDef } from '../core/types'
import { pick, shuffle } from '../core/utils'
import { sfx, preloadSfx } from '../core/sfx'
import { fxAt, JUICE } from '../core/fx'
import { ICON } from '../core/icons'
import { photoImg } from '../core/sprites'
import { some, visible } from '../core/hand'
import { recall, type Item, type Keyed, type Recall } from '../core/facts'
import { IMAGIER, PIC } from '../core/imagier'

/* Chasse aux lettres — retrouve les lettres du mot, dans l'ordre. Premier
   mot : ton prénom (quand on sait qui joue). Calibré CP pour Jade, mots plus
   longs pour Joyce.

   Repris le 22/09 : plein écran (la photo en grand à gauche, le mot et de
   grosses lettres à droite), manches en pastilles au lieu de « Mot 1/3 »,
   un haut-parleur pour réentendre le mot (contenu, règle 2), la lettre
   trouvée VOLE jusqu'à sa case, et après deux erreurs sur une même case la
   bonne lettre se met à luire (de l'aide, pas une sanction). État typé.

   La mémoire (27/10, `core/facts.ts`) : chaque mot est un élément. Les
   trois mots d'une partie restent différents ; d'abord ceux qui ont été
   ratés (deux erreurs ou plus dans le mot), puis ceux qu'on n'a pas vus
   depuis longtemps. Trois mots, c'est trop court pour qu'un raté revienne
   trois mots plus loin : il revient en tête de la partie suivante.
   Muette : rien ne s'affiche.

   La flamme (29/10, demande du père) : le mot n'est plus montré du tout.
   Seules la photo et la voix le donnent ; les cases vides disent sa
   longueur, à toi de l'écrire.

   Le même jour, Joyce : « c'est quasiment toujours les mêmes mots ». Il y
   en avait vingt-deux ; ce sont maintenant ceux de l'imagier
   (`core/imagier.ts`), plus de trois cents, classés par difficulté
   d'orthographe : la fleur ≈ CP, l'éclair ≈ CE1, la flamme ≈ CE2-CM1. La
   mémoire les fait tous passer avant d'en remontrer un. Les mots composés
   (étoile de mer, arc-en-ciel) ont leurs blancs, tirets et apostrophes déjà
   posés ; à la flamme, les lettres en trop sont les fautes qu'on fait
   vraiment (é pour è, f pour ph, s pour c…) : une vraie dictée. */

/** Ce qui n'est pas une lettre à chercher : posé d'avance dans le mot. */
const SEP = /[ '-]/
/** La case suivante à remplir, en sautant les blancs, tirets et apostrophes. */
const skip = (w: string, i: number) => { while (i < w.length && SEP.test(w[i])) i++; return i }

/** Les pièges de la flamme : pour chaque lettre du mot, celles qu'on écrit
    à sa place quand on hésite (le son est le même, l'accent change). */
const TWINS: Record<string, string> = {
  E: 'ÉÈÊ', É: 'EÈÊ', È: 'ÉÊE', Ê: 'ÈÉE', Ë: 'EÉ', A: 'ÂÀ', Â: 'A', À: 'A', I: 'YÎ', Î: 'I', Ï: 'IÎ', Y: 'I',
  O: 'Ô', Ô: 'O', U: 'Û', Û: 'U', C: 'SKQÇ', Ç: 'CS', S: 'ZC', Z: 'S', X: 'S', K: 'CQ', Q: 'KC',
  G: 'J', J: 'G', M: 'N', N: 'M', T: 'D', D: 'T', P: 'B', B: 'P', Œ: 'EO'
}
/** Les pièges d'un mot : les lettres jumelles, et les sons qui s'écrivent
    autrement (ph/f, au/o, ai/è, en/an), sans les lettres du mot lui-même. */
export function traps(word: string): string[] {
  const out = new Set<string>()
  for (const ch of word) for (const t of TWINS[ch] ?? '') out.add(t)
  if (word.includes('PH')) out.add('F')
  if (/E?AU/.test(word)) out.add('O')
  if (word.includes('AI')) { out.add('È'); out.add('É') }
  if (word.includes('EN')) out.add('A')
  if (word.includes('AN')) out.add('E')
  for (const ch of word) out.delete(ch)
  return [...out]
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

interface State {
  /** Les mots de la partie, en capitales (`queue` en garde les photos). */
  words: string[]
  word: string
  round: number
  pos: number
  /** Erreurs sur la case en cours (l'aide s'allume à 2). */
  here: number
  mistakes: number
  /** Erreurs dans le mot en cours : à deux, le mot est raté (en silence). */
  slips: number
  /** Les mots de la partie, tirés sans remise (`words` en est la liste). */
  queue: Item<Keyed>[]
  running: boolean
  peeking: boolean
  root: HTMLElement
}

/** Un raté : deux erreurs ou plus dans le mot. */
const SLIPS_MISS = 2

let lg: State | null = null
let ctx: GameContext
/** La mémoire des mots (`ferme:memoire:letters`), ouverte au montage. */
let memo: Recall

const q = (me: State, sel: string) => me.root.querySelector<HTMLElement>(sel)!

function paintDots(me: State) {
  q(me, '.lg-dots').innerHTML = me.words.map((_, i) =>
    `<i class="sn-dot${i < me.round ? ' on' : ''}${i === me.round ? ' cur' : ''}"></i>`).join('')
}

function loadWord(me: State) {
  const word = me.words[me.round]
  me.word = word
  me.pos = skip(word, 0)
  me.here = 0
  me.slips = 0
  paintDots(me)

  // Le mot est d'abord MONTRÉ en entier, dit par la voix et illustré ;
  // puis les lettres s'effacent et il faut les retrouver dans l'ordre.
  // À la flamme, rien n'est montré : la photo, la voix, des cases vides
  const pic = me.queue[me.round]?.fact.key
  q(me, '.lg-pic').innerHTML = pic ? photoImg(pic, 260) : `<span class="lg-name">${word.charAt(0)}</span>`
  const slots = q(me, '.lg-word')
  ctx.say(word.toLowerCase())
  me.peeking = ctx.tier !== 'exp'
  // Un morceau par mot (étoile / de / mer) : la ligne ne se coupe qu'entre deux mots
  const letters = word.split('').filter(ch => !SEP.test(ch))
  slots.classList.toggle('long', letters.length > 9)
  slots.innerHTML = word.split(' ').map((part, k, all) => {
    const at = all.slice(0, k).reduce((n, p) => n + p.length + 1, 0)
    return '<span class="lg-chunk">' + part.split('').map((ch, j) => {
      const i = at + j
      if (SEP.test(ch)) return `<span class="lg-slot sep" data-i="${i}">${ch}</span>`
      return `<span class="lg-slot${me.peeking ? ' peek' : i === me.pos ? ' next' : ''}" data-i="${i}">${me.peeking ? ch : ''}</span>`
    }).join('') + '</span>'
  }).join('')
  if (me.peeking) ctx.after(3000, () => {
    if (lg !== me || !me.running || me.word !== word) return
    me.peeking = false
    slots.querySelectorAll<HTMLElement>('.lg-slot:not(.sep)').forEach(sl => { sl.textContent = ''; sl.classList.remove('peek'); sl.classList.toggle('next', sl.dataset.i === String(me.pos)) })
  })

  // La grille : lettres du mot + intrus (à la flamme, d'abord les pièges)
  const gridSize = ctx.byTier(Math.max(12, letters.length + 5), Math.max(14, letters.length + 6), Math.max(16, letters.length + 6))
  const decoys: string[] = ctx.tier === 'exp' ? shuffle(traps(word)).slice(0, Math.ceil((gridSize - letters.length) * 0.6)) : []
  while (decoys.length < gridSize - letters.length) decoys.push(pick(ALPHABET.split('')))
  const tiles = shuffle([...letters, ...decoys])
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
  // Le mot est complet, c'est la fête : les touchers de plus ne comptent pas
  // (deux suffisaient à perdre une étoile — une sanction dans Apprendre)
  if (me.pos >= me.word.length) return
  if (ch === me.word[me.pos]) {
    b.classList.add('used')
    me.root.querySelectorAll('.lg-tile.help').forEach(t => t.classList.remove('help'))
    sfx('tick', { vol: 0.4, rate: 1.3 })
    const i = me.pos
    const slot = q(me, `.lg-slot[data-i="${i}"]`)
    me.pos = skip(me.word, me.pos + 1)
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
      // Trouvé sans se tromper (ou presque) : gardé en silence ; un raté l'a
      // déjà été, à sa deuxième erreur
      if (me.slips < SLIPS_MISS && me.queue[me.round]) memo.note(me.queue[me.round], true)
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
    me.slips++
    // Le mot est raté : il reviendra en tête de la prochaine partie
    if (me.slips === SLIPS_MISS && me.queue[me.round]) memo.note(me.queue[me.round], false)
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
  // La main : « l'une de ces lettres-là » — jamais la suivante du mot
  hand: root => {
    const me = lg
    const tiles = me && me.running && !me.peeking && me.pos < me.word.length ? visible(root, '.lg-tile:not(.used)') : []
    return tiles.length ? { choose: some(tiles, 4) } : null
  },
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
    const level = c.byTier(1, 2, 3)
    memo = recall('letters')
    // Trois mots différents, tirés dans la mémoire : les ratés d'abord, puis
    // ceux qu'on n'a pas vus depuis le plus longtemps (la clé : la photo)
    const queue = memo.series(IMAGIER.filter(p => p.niveau === level).map(p => ({ key: p.id })), 3)
    const me: State = {
      words: queue.map(it => PIC[it.fact.key].mot.toUpperCase()), queue,
      word: '', round: 0, pos: 0, here: 0, mistakes: 0, slips: 0, running: true, peeking: false, root: c.root
    }
    lg = me
    q(me, '.lg-say').onclick = () => { if (me.word) ctx.say(me.word.toLowerCase()) }
    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __lg: unknown }).__lg = {
        get word() { return me.word }, get pos() { return me.pos }, get peeking() { return me.peeking }, get round() { return me.round },
        /** Les trois mots de la partie (sans remise). */
        get words() { return [...me.words] }
      }
    }
    loadWord(me)
    return () => { me.running = false; if (lg === me) lg = null }
  }
}
