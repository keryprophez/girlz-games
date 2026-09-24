import type { GameContext, GameDef } from '../core/types'
import { $, rnd } from '../core/utils'
import { tone } from '../core/audio'
import { sfx, preloadSfx, cry, preloadCries, CRY } from '../core/sfx'
import { fxAt, JUICE } from '../core/fx'
import { ICON, heartsHTML } from '../core/icons'
import { critterPortraits, portraitImg } from '../core/portraits'
import type { CritterKind } from '../core/critters'

/* 🎵 Le Chœur de la ferme — l'ancien Simon, refait le 25/09.

   Les animaux chantent une mélodie, on la rejoue en tapant sur eux. Avant,
   ils faisaient des « bips » : maintenant chacun a SA VRAIE VOIX (des cris
   enregistrés, choisis à l'oreille par le père, `cry()` de core/sfx.ts) et
   saute quand il chante.

   - Un enjeu visible : la mélodie à atteindre est une rangée de notes sur le
     côté (8, 10 ou 12 selon le niveau), qui se remplit tour après tour ;
   - la chorale grandit avec le niveau : 4 animaux en douce, 5 en normal
     (le canard), 6 en expert (le mouton) ;
   - une fausse note n'arrête pas tout : elle coûte un cœur (3, 2 ou 1), le
     bon animal chante, et la MÊME mélodie revient ; le « presque » (raté sur
     la dernière note) se voit ;
   - la fin est un CONCERT : toute la mélodie retenue rejouée d'un trait par
     la ferme, puis tout le monde chante ensemble ;
   - la vitesse monte à chaque tour, jamais au point de couper les voix. */

const NOTES = [392, 523, 659, 784, 880, 988]
const ALL: { animal: CritterKind; bg: string }[] = [
  { animal: 'hen', bg: '#FFE0E4' },
  { animal: 'cow', bg: '#DFF4DE' },
  { animal: 'pig', bg: '#DBEEFE' },
  { animal: 'dog', bg: '#FFEFC8' },
  { animal: 'duck', bg: '#E4E2FB' },
  { animal: 'sheep', bg: '#F3EADF' }
]

interface State {
  pads: typeof ALL
  seq: number[]
  step: number
  playerTurn: boolean
  best: number
  playSpeed: number
  lives: number
  maxLives: number
  goal: number
  over: boolean
}

let simon: State | null = null
let ctx: GameContext

const padEls = () => Array.from(document.querySelectorAll<HTMLElement>('.spad'))

function setPhase(listening: boolean) {
  $('simonPhase').innerHTML = listening ? ICON.sound : ICON.tap
  $('simonPhase').classList.toggle('listen', listening)
  $('simonWrap').classList.toggle('listening', listening)
}

/** Un animal chante : il saute, son pad s'illumine, sa vraie voix. */
function sing(me: State, i: number, dur: number) {
  const pad = padEls()[i]
  if (!pad) return
  pad.classList.remove('lit'); void pad.offsetWidth; pad.classList.add('lit')
  const voice = CRY[me.pads[i].animal]
  // Secours tant que la voix n'est pas décodée : l'ancienne note
  if (!voice || !cry(voice, { max: Math.max(0.35, dur / 1000 * 0.95), solo: true, vol: 0.95 })) {
    tone(NOTES[i], (dur / 1000) * 0.9, 'triangle', 0.18)
  }
  ctx.after(dur * 0.75, () => pad.classList.remove('lit'))
}

function paintSide(me: State) {
  $('simonLives').innerHTML = heartsHTML(me.lives, me.maxLives)
  $('simonGoal').innerHTML = Array.from({ length: me.goal }, (_, k) =>
    `<i class="${k < me.best ? 'on' : k === me.best ? 'next' : ''}">${ICON.sound}</i>`).join('')
}

function playSequence(me: State) {
  if (simon !== me || me.over) return
  me.playerTurn = false
  setPhase(true)
  me.seq.forEach((v, i) => ctx.after(400 + i * me.playSpeed, () => { if (simon === me && !me.over) sing(me, v, me.playSpeed) }))
  ctx.after(400 + me.seq.length * me.playSpeed + 250, () => {
    if (simon !== me || me.over) return
    me.playerTurn = true; me.step = 0
    setPhase(false)
  })
}

function press(me: State, i: number) {
  if (simon !== me || me.over || !me.playerTurn) return
  sing(me, i, 420)
  if (i === me.seq[me.step]) {
    me.step++
    if (me.step === me.seq.length) {
      me.playerTurn = false
      me.best = me.seq.length
      paintSide(me)
      sfx('confirm', { vol: 0.6, rate: 1 + Math.min(10, me.best) * 0.04 })
      padEls().forEach(p => fxAt(p, JUICE.mix, 5))
      if (me.best >= me.goal) { ctx.after(600, () => concert(me, true)); return }
      me.seq.push(rnd(0, me.pads.length - 1))
      // Plus vite à chaque tour, jamais au point de couper les voix
      me.playSpeed = Math.max(ctx.byTier(560, 480, 420), me.playSpeed * 0.95)
      ctx.after(800, () => playSequence(me))
    }
    return
  }
  // Fausse note : le pad tapé se secoue, le bon animal chante, un cœur s'en va
  me.playerTurn = false
  const almost = me.step === me.seq.length - 1 && me.seq.length > 1
  const wrong = padEls()[i]
  wrong.classList.add('wrong')
  sfx('error', { vol: 0.5 })
  me.lives--
  paintSide(me)
  $('simonLives').classList.remove('lost'); void $('simonLives').offsetWidth; $('simonLives').classList.add('lost')
  // Le « presque » : raté sur la toute dernière note, ça se voit
  if (almost) flash(ICON.bolt)
  ctx.after(450, () => { if (simon === me) sing(me, me.seq[me.step], 700) })
  ctx.after(1400, () => {
    if (simon !== me) return
    wrong.classList.remove('wrong')
    if (me.lives <= 0) { concert(me, false); return }
    // La MÊME mélodie revient : on la réécoute et on réessaie
    playSequence(me)
  })
}

function flash(html: string) {
  const el = $('simonFlash')
  el.innerHTML = html
  el.classList.remove('go'); void el.offsetWidth; el.classList.add('go')
}

/** Le concert : la mélodie retenue rejouée d'un trait par la ferme, puis
    toute la chorale chante ensemble. Puis l'écran de fin. */
function concert(me: State, won: boolean) {
  if (me.over) return
  me.over = true
  me.playerTurn = false
  setPhase(true)
  $('simonWrap').classList.add('concert')
  const melody = me.seq.slice(0, Math.max(1, me.best))
  const beat = 300
  melody.forEach((v, k) => ctx.after(300 + k * beat, () => { if (simon === me) sing(me, v, beat) }))
  const tutti = 300 + melody.length * beat + 250
  ctx.after(tutti, () => {
    if (simon !== me) return
    padEls().forEach((p, k) => {
      p.classList.remove('lit'); void p.offsetWidth; p.classList.add('lit')
      const voice = CRY[me.pads[k].animal]
      if (voice) cry(voice, { max: 1.2, vol: 0.7, delay: k * 0.04 })
      fxAt(p, won ? JUICE.warm : JUICE.mix, won ? 10 : 5)
    })
    if (won) sfx('confirm', { vol: 0.7, rate: 1.2 })
  })
  ctx.after(tutti + 1300, () => finish(me, won))
}

function finish(me: State, won: boolean) {
  const best = me.best
  const two = ctx.byTier(5, 6, 8)
  const stars = won ? 3 : best >= two ? 2 : 1
  ctx.finish({
    title: won ? 'Quel concert !' : best >= two ? 'Belle mélodie !' : 'Encore un petit air ?',
    msg: `Tu as retenu ${best} note${best > 1 ? 's' : ''}`,
    stars,
    score: best,
    scoreIcon: ICON.sound
  })
}

export const simonGame: GameDef = {
  id: 'simon', name: 'Le Chœur', icon: '🎵', sq: 'sq-sky', cat: 'memoire',
  subtitle: 'Répète la chanson des animaux de la ferme',
  mount(c) {
    ctx = c
    const pads = ALL.slice(0, c.byTier(4, 5, 6))
    c.root.innerHTML = `
      <div class="arena sm-wrap" id="simonArena">
        <div id="simonWrap" class="listening n${pads.length}"></div>
        <div class="sm-phase listen" id="simonPhase">${ICON.sound}</div>
        <div class="hud-flash near" id="simonFlash"></div>
        <div class="tq-side sm-side">
          <div class="sm-lives" id="simonLives"></div>
          <div class="sm-goal" id="simonGoal"></div>
        </div>
      </div>`
    preloadSfx(['confirm', 'error'])
    preloadCries(pads.map(p => CRY[p.animal]!).filter(Boolean))
    const lives = c.byTier(3, 2, 1)
    const me: State = {
      pads, seq: [], step: 0, playerTurn: false, best: 0, playSpeed: c.byTier(760, 640, 560),
      lives, maxLives: lives, goal: c.byTier(8, 10, 12), over: false
    }
    simon = me
    for (let i = 0; i < c.byTier(1, 2, 3); i++) me.seq.push(rnd(0, pads.length - 1))
    paintSide(me)

    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __simon: unknown }).__simon = {
        get seq() { return [...me.seq] }, get playerTurn() { return me.playerTurn }, get best() { return me.best },
        get over() { return me.over }, get lives() { return me.lives }, get goal() { return me.goal }, get pads() { return me.pads.length },
        press: (i: number) => press(me, i)
      }
    }

    const wrap = $('simonWrap')
    const cols = pads.length <= 4 ? 2 : 3
    const px = Math.max(80, Math.floor(Math.min(wrap.clientWidth / cols, wrap.clientHeight / 2) * 0.72))
    critterPortraits(pads.map(p => p.animal), px).then(img => {
      if (simon !== me) return
      wrap.innerHTML = pads.map((p, i) => `<button class="spad" data-i="${i}" style="background:${p.bg}">${portraitImg(img[p.animal], px)}</button>`).join('')
      wrap.querySelectorAll<HTMLElement>('.spad').forEach(p => { p.onclick = () => press(me, parseInt(p.dataset.i!)) })
      ctx.after(500, () => playSequence(me))
    })
    return () => { if (simon === me) simon = null; me.over = true }
  }
}
