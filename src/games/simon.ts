import type { GameContext, GameDef } from '../core/types'
import { $, rnd } from '../core/utils'
import { tone } from '../core/audio'
import { sfx, preloadSfx } from '../core/sfx'
import { fxAt, JUICE } from '../core/fx'
import { ICON } from '../core/icons'
import { loadAtlas, spriteSpan, type Atlas } from '../core/sprites'

/* Simon — quatre animaux chantent une mélodie, on la rejoue en tapant sur
   eux. Une note de plus à chaque tour, un peu plus vite à chaque fois.

   Polish du 9/09 (phase 2, jeux 2D) :
   - plein écran : quatre grands pads aussi grands que la place le permet,
     avec les VRAIS animaux (sprites Kenney) au lieu d'emoji ;
   - plus de texte pour dire à qui c'est : une oreille pendant l'écoute,
     une main quand c'est à toi, et les pads se grisent pendant l'écoute ;
   - l'animal qui chante saute ; une fausse note secoue le pad en rouge et
     montre le bon ; la mélodie retenue se compte en notes sur le côté ;
   - timers de partie (pause-safe), état typé. */

const NOTES = [392, 523, 659, 784]
const PADS = [
  { animal: 'chicken', bg: '#FFE0E4' },
  { animal: 'cow', bg: '#DFF4DE' },
  { animal: 'pig', bg: '#DBEEFE' },
  { animal: 'dog', bg: '#FFEFC8' }
]

interface State {
  seq: number[]
  step: number
  playerTurn: boolean
  best: number
  playSpeed: number
  atlas: Atlas | null
  over: boolean
}

let simon: State | null = null
let ctx: GameContext

const pads = () => Array.from(document.querySelectorAll<HTMLElement>('.spad'))

function setPhase(listening: boolean) {
  $('simonPhase').innerHTML = listening ? ICON.sound : ICON.tap
  $('simonPhase').classList.toggle('listen', listening)
  $('simonWrap').classList.toggle('listening', listening)
}

function litPad(i: number, dur: number) {
  const pad = pads()[i]
  if (!pad) return
  pad.classList.remove('lit'); void pad.offsetWidth; pad.classList.add('lit')
  tone(NOTES[i], (dur / 1000) * 0.9, 'triangle', 0.18)
  ctx.after(dur * 0.75, () => pad.classList.remove('lit'))
}

function playSequence(me: State) {
  if (simon !== me || me.over) return
  me.playerTurn = false
  setPhase(true)
  me.seq.forEach((v, i) => ctx.after(400 + i * me.playSpeed, () => { if (simon === me && !me.over) litPad(v, me.playSpeed) }))
  ctx.after(400 + me.seq.length * me.playSpeed + 250, () => {
    if (simon !== me || me.over) return
    me.playerTurn = true; me.step = 0
    setPhase(false)
  })
}

function press(me: State, i: number) {
  if (simon !== me || me.over || !me.playerTurn) return
  litPad(i, 320)
  if (i === me.seq[me.step]) {
    me.step++
    if (me.step === me.seq.length) {
      me.playerTurn = false
      me.best = me.seq.length
      $('simonScore').innerHTML = `${ICON.sound}<span>${me.best}</span>`
      sfx('confirm', { vol: 0.7, rate: 1 + Math.min(10, me.best) * 0.04 })
      pads().forEach(p => fxAt(p, JUICE.mix, 5))
      me.seq.push(rnd(0, 3))
      me.playSpeed = Math.max(300, me.playSpeed * 0.96)
      ctx.after(700, () => playSequence(me))
    }
  } else {
    // Fausse note : le pad tapé se secoue, le bon s'allume, et c'est fini
    me.playerTurn = false
    me.over = true
    sfx('error', { vol: 0.6 })
    const wrong = pads()[i], right = pads()[me.seq[me.step]]
    wrong.classList.add('wrong')
    ctx.after(350, () => { right.classList.add('lit'); tone(NOTES[me.seq[me.step]], 0.5, 'triangle', 0.14) })
    ctx.after(1100, () => finish(me))
  }
}

function finish(me: State) {
  const best = me.best
  const th = ctx.byTier([5, 3], [7, 5], [8, 6])
  const stars = best >= th[0] ? 3 : best >= th[1] ? 2 : 1
  ctx.finish({
    title: best >= th[0] ? 'Oreille d\'or !' : best >= th[1] ? 'Belle mélodie !' : 'Fausse note !',
    msg: `${ctx.playerName} a retenu ${best} note${best > 1 ? 's' : ''}`,
    stars, starsEarned: stars
  })
}

export const simonGame: GameDef = {
  id: 'simon', name: 'Simon', icon: '🎵', sq: 'sq-sky', cat: 'memoire',
  subtitle: 'Répète la mélodie des animaux',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="arena sm-wrap" id="simonArena">
        <div id="simonWrap" class="listening"></div>
        <div class="sm-phase listen" id="simonPhase">${ICON.sound}</div>
        <div class="tq-side"><div class="tq-moves" id="simonScore">${ICON.sound}<span>0</span></div></div>
      </div>`
    preloadSfx(['confirm', 'error'])
    const me: State = {
      seq: [], step: 0, playerTurn: false, best: 0, playSpeed: c.byTier(650, 520, 420), atlas: null, over: false
    }
    simon = me
    for (let i = 0; i < c.byTier(1, 2, 3); i++) me.seq.push(rnd(0, 3))

    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __simon: unknown }).__simon = {
        get seq() { return [...me.seq] }, get playerTurn() { return me.playerTurn }, get best() { return me.best }, get over() { return me.over },
        press: (i: number) => press(me, i)
      }
    }

    loadAtlas('animals').then((a: Atlas) => {
      if (simon !== me) return
      me.atlas = a
      const wrap = $('simonWrap')
      const side = Math.min(wrap.clientWidth, wrap.clientHeight)
      const px = Math.max(60, Math.floor(side * 0.28))
      wrap.innerHTML = PADS.map((p, i) => `<button class="spad" data-i="${i}" style="background:${p.bg}">${spriteSpan(a, p.animal, px)}</button>`).join('')
      wrap.querySelectorAll<HTMLElement>('.spad').forEach(p => { p.onclick = () => press(me, parseInt(p.dataset.i!)) })
      ctx.after(500, () => playSequence(me))
    })
    return () => { if (simon === me) simon = null; me.over = true }
  }
}
