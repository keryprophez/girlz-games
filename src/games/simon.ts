import type { GameContext, GameDef } from '../core/types'
import { $, rnd } from '../core/utils'
import { tone } from '../core/audio'
import { sfx, preloadSfx, cry, preloadCries, CRY } from '../core/sfx'
import { ICON, heartsHTML } from '../core/icons'
import { createStage, loader, picker, type Stage } from '../core/three3d'
import { particles, type Particles, toScreen } from '../core/scene3d'
import { critterKit, type CritterKind } from '../core/critters'
import { barnChoir, singOn, emitNotes, stepChoir, type Choir } from '../core/barn3d'
import { some } from '../core/hand'

/* 🎵 Le Chœur de la ferme — l'ancien Simon, refait le 25/09, SUR SCÈNE depuis
   le 28/09 : une vraie grange en 3D (mur de planches rouges, poutres, bottes
   de foin, guirlande d'ampoules), une estrade en bois, et la chorale debout
   dessus, chacun sur son coussin, sous son projecteur. Le coq, le cheval et
   le chat, qui avaient déjà leur voix, ont enfin leur personnage.

   Les animaux chantent une mélodie, on la rejoue en les touchant. Chacun a
   SA VRAIE VOIX (des cris enregistrés, choisis à l'oreille par le père,
   `cry()` de core/sfx.ts) : quand il chante, son projecteur s'allume, il
   saute et des notes s'envolent.

   - Un enjeu visible : la mélodie à atteindre est une rangée de notes sur le
     côté (10, 12 ou 14 selon le niveau), qui se remplit tour après tour ;
   - la chorale grandit avec le niveau : 5 animaux à la fleur (avec le
     chat), 6 à l'éclair et à la flamme (le cheval) ;
   - une fausse note n'arrête pas tout : elle coûte un cœur (2, 1 ou 1), le
     bon animal chante, et la MÊME mélodie revient ; le « presque » (raté sur
     la dernière note) se voit ;
   - la fin est un CONCERT : toute la mélodie retenue rejouée d'un trait par
     la ferme, puis tout le monde chante ensemble, la guirlande clignote ;
   - la vitesse monte à chaque tour, jamais au point de couper les voix. */

const NOTES = [392, 523, 659, 784, 880, 988]
const ALL: { animal: CritterKind; color: number }[] = [
  { animal: 'rooster', color: 0xC9544A },
  { animal: 'cow', color: 0x4E9A55 },
  { animal: 'pig', color: 0x3F86BE },
  { animal: 'dog', color: 0xC99A2E },
  { animal: 'cat', color: 0x8A6CC8 },
  { animal: 'horse', color: 0xC8648E }
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
  stage: Stage | null
  /** La grange et sa chorale (core/barn3d.ts), une fois la scène montée */
  choir: Choir | null
  fx: Particles | null
  listening: boolean
  concert: boolean
}

let simon: State | null = null
let ctx: GameContext

function setPhase(me: State, listening: boolean) {
  me.listening = listening
  $('simonPhase').innerHTML = listening ? ICON.sound : ICON.tap
  $('simonPhase').classList.toggle('listen', listening)
}

/** Un animal chante : son projecteur s'allume, il saute, sa vraie voix. */
function sing(me: State, i: number, dur: number) {
  if (me.choir) singOn(me.choir, i, Math.max(0.3, dur / 1000 * 0.85))
  const voice = CRY[me.pads[i].animal]
  // Secours tant que la voix n'est pas décodée : l'ancienne note
  if (!voice || !cry(voice, { max: Math.max(0.35, dur / 1000 * 0.95), solo: true, vol: 0.95 })) {
    tone(NOTES[i], (dur / 1000) * 0.9, 'triangle', 0.18)
  }
}

function paintSide(me: State) {
  $('simonLives').innerHTML = heartsHTML(me.lives, me.maxLives)
  $('simonGoal').innerHTML = Array.from({ length: me.goal }, (_, k) =>
    `<i class="${k < me.best ? 'on' : k === me.best ? 'next' : ''}">${ICON.sound}</i>`).join('')
}

function playSequence(me: State) {
  if (simon !== me || me.over) return
  me.playerTurn = false
  setPhase(me, true)
  me.seq.forEach((v, i) => ctx.after(400 + i * me.playSpeed, () => { if (simon === me && !me.over) sing(me, v, me.playSpeed) }))
  ctx.after(400 + me.seq.length * me.playSpeed + 250, () => {
    if (simon !== me || me.over) return
    me.playerTurn = true; me.step = 0
    setPhase(me, false)
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
      for (const a of me.choir?.actors ?? []) me.fx?.burst({ x: a.base.x, y: a.base.y + 1, z: a.base.z }, { count: 8, color: [0xFFD34D, 0xFFFFFF, 0xFF9E7A], speed: 1.6, life: 0.7, size: 0.07, gravity: 2 })
      if (me.best >= me.goal) { ctx.after(600, () => concert(me, true)); return }
      me.seq.push(rnd(0, me.pads.length - 1))
      // Plus vite à chaque tour, jamais au point de couper les voix
      me.playSpeed = Math.max(ctx.byTier(480, 420, 360), me.playSpeed * 0.95)
      ctx.after(800, () => playSequence(me))
    }
    return
  }
  // Fausse note : l'animal touché se trémousse, le bon chante, un cœur s'en va
  me.playerTurn = false
  const almost = me.step === me.seq.length - 1 && me.seq.length > 1
  const a = me.choir?.actors[i]
  if (a) a.wrong = 0.6
  sfx('error', { vol: 0.5 })
  me.lives--
  paintSide(me)
  $('simonLives').classList.remove('lost'); void $('simonLives').offsetWidth; $('simonLives').classList.add('lost')
  // Le « presque » : raté sur la toute dernière note, ça se voit
  if (almost) flash(ICON.bolt)
  ctx.after(450, () => { if (simon === me) sing(me, me.seq[me.step], 700) })
  ctx.after(1400, () => {
    if (simon !== me) return
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
  setPhase(me, true)
  me.concert = true
  const melody = me.seq.slice(0, Math.max(1, me.best))
  const beat = 300
  melody.forEach((v, k) => ctx.after(300 + k * beat, () => { if (simon === me) sing(me, v, beat) }))
  const tutti = 300 + melody.length * beat + 250
  ctx.after(tutti, () => {
    if (simon !== me) return
    const ch = me.choir
    ch?.actors.forEach((a, k) => {
      a.sing = 1
      emitNotes(ch, a, 4)
      const voice = CRY[me.pads[k].animal]
      if (voice) cry(voice, { max: 1.2, vol: 0.7, delay: k * 0.04 })
      me.fx?.burst({ x: a.base.x, y: a.base.y + 1.2, z: a.base.z }, { count: won ? 22 : 8, color: [0xFFD34D, 0xFF7AA8, 0x7FD3FF, 0xFFFFFF], speed: 2.6, life: 1, size: 0.08, gravity: 2.5 })
    })
    if (won) sfx('confirm', { vol: 0.7, rate: 1.2 })
  })
  ctx.after(tutti + 1300, () => finish(me, won))
}

function finish(me: State, won: boolean) {
  const best = me.best
  const two = ctx.byTier(6, 8, 10)
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
  // La main : « l'un de ceux-là » — jamais celui qui a chanté
  hand: () => {
    const me = simon
    const st = me?.stage
    if (!me || !st || !me.choir || !me.playerTurn || me.over) return null
    return { choose: some(me.choir.actors, 3).map(a => toScreen(st, a.base.clone().setY(0.95))) }
  },
  mount(c) {
    ctx = c
    const pads = ALL.slice(0, c.byTier(5, 6, 6))
    c.root.innerHTML = `
      <div class="arena sm-wrap" id="simonArena">
        <div class="sm-scene" id="simonScene"></div>
        <div class="sm-phase listen" id="simonPhase">${ICON.sound}</div>
        <div class="hud-flash near" id="simonFlash"></div>
        <div class="tq-side sm-side">
          <div class="sm-lives" id="simonLives"></div>
          <div class="sm-goal" id="simonGoal"></div>
        </div>
      </div>`
    preloadSfx(['confirm', 'error'])
    preloadCries(pads.map(p => CRY[p.animal]!).filter(Boolean))
    const lives = c.byTier(2, 1, 1)
    const me: State = {
      pads, seq: [], step: 0, playerTurn: false, best: 0, playSpeed: c.byTier(640, 560, 480),
      lives, maxLives: lives, goal: c.byTier(10, 12, 14), over: false,
      stage: null, choir: null, fx: null, listening: true, concert: false
    }
    simon = me
    for (let i = 0; i < c.byTier(2, 3, 4); i++) me.seq.push(rnd(0, pads.length - 1))
    paintSide(me)

    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __simon: unknown }).__simon = {
        get seq() { return [...me.seq] }, get playerTurn() { return me.playerTurn }, get best() { return me.best },
        get over() { return me.over }, get lives() { return me.lives }, get goal() { return me.goal }, get pads() { return me.pads.length },
        get step() { return me.step },
        press: (i: number) => press(me, i),
        /** Où toucher l'animal n° i à l'écran (pour un vrai toucher). */
        screen(i: number) {
          const st = me.stage, a = me.choir?.actors[i]
          if (!st || !a) return null
          const v = a.base.clone().setY(0.95).project(st.camera)
          const r = st.renderer.domElement.getBoundingClientRect()
          return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }
        }
      }
    }

    const holder = $('simonScene')
    const hideLoader = loader(holder, 'simon')
    ;(async () => {
      const stage = await createStage(holder, {
        sky: '#1E1410', fog: [12, 26], fogColor: '#2A1C14', fov: 36,
        cam: [0, 1.8, 6.1], target: [0, 1.3, -0.8],
        hemi: ['#FFE2B8', '#3A2416', 1.05],
        sun: { pos: [2.5, 7.5, 5], color: '#FFE3B0', intensity: 1.7, area: 7, far: 25 },
        fill: 0.55, exposure: 1.08
      })
      if (simon !== me) { stage.dispose(); return }
      me.stage = stage
      const kit = critterKit(stage.T)
      stage.keep({ dispose: () => kit.dispose() })
      me.fx = particles(stage, 400)
      const choir = barnChoir(stage, kit, me.pads)
      me.choir = choir
      // On touche un animal pour qu'il chante
      const pick = picker(stage)
      stage.renderer.domElement.addEventListener('pointerdown', e => {
        const hits = pick(e, choir.actors.map(a => a.hit), false)
        if (hits.length) press(me, hits[0].object.userData.i as number)
      })
      hideLoader()
      stage.start(dt => {
        if (simon !== me) return
        // L'écoute : la salle se tamise un peu, les projecteurs parlent
        stepChoir(choir, dt, { dim: me.listening && !me.concert, party: me.concert })
        me.fx?.update(dt)
      })
      ctx.after(700, () => playSequence(me))
    })().catch(err => { hideLoader(); if (simon === me) throw err })
    return () => {
      if (simon === me) simon = null
      me.over = true
      me.stage?.dispose()
      me.stage = null
    }
  }
}
