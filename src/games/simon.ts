import type { GameContext, GameDef } from '../core/types'
import { $, rnd } from '../core/utils'
import { sGood, sNope, sWin, tone } from '../core/audio'
import { fxAt, JUICE } from '../core/fx'

const SIMON_NOTES = [392, 523, 659, 784]
let simon: any = null
let ctx: GameContext

function setStatus(t: string) { $('simonStatus').textContent = t }

function litPad(i: number, dur: number) {
  const pad = document.querySelectorAll('.spad')[i] as HTMLElement
  pad.classList.add('lit')
  tone(SIMON_NOTES[i], (dur / 1000) * 0.9, 'triangle', 0.18)
  setTimeout(() => pad.classList.remove('lit'), dur * 0.75)
}

function playSequence() {
  if (!simon || !simon.running) return
  simon.playerTurn = false
  setStatus('Écoute bien… 👂')
  simon.seq.forEach((v: number, i: number) => {
    setTimeout(() => { if (simon && simon.running) litPad(v, simon.playSpeed) }, i * simon.playSpeed)
  })
  setTimeout(() => {
    if (!simon || !simon.running) return
    simon.playerTurn = true; simon.step = 0
    setStatus('À toi ! 🎶')
  }, simon.seq.length * simon.playSpeed + 250)
}

function press(i: number) {
  if (!simon || !simon.running || !simon.playerTurn) return
  litPad(i, 320)
  if (i === simon.seq[simon.step]) {
    simon.step++
    if (simon.step === simon.seq.length) {
      simon.playerTurn = false
      simon.best = simon.seq.length
      $('simonScore').textContent = '🎵 ' + simon.best
      setStatus('Bravo ! 🌟'); sGood()
      document.querySelectorAll('.spad').forEach(p => fxAt(p, JUICE.mix, 5))
      simon.seq.push(rnd(0, 3))
      simon.playSpeed = Math.max(300, simon.playSpeed * 0.96)
      setTimeout(() => simon && simon.running && playSequence(), 900)
    }
  } else {
    simon.playerTurn = false; sNope()
    setStatus('Oups… 💫')
    setTimeout(finish, 700)
  }
}

function finish() {
  const best = simon ? simon.best : 0
  sWin()
  const th = ctx.byTier([5, 3], [7, 5], [8, 6])
  const stars = best >= th[0] ? 3 : best >= th[1] ? 2 : 1
  ctx.finish({ title: 'Belle mélodie !', msg: `${ctx.playerName} a retenu ${best} notes 🎵`, stars, starsEarned: stars })
}

export const simonGame: GameDef = {
  id: 'simon', name: 'Simon', icon: '🎵', sq: 'sq-sky', cat: 'memoire',
  subtitle: 'Répète la mélodie des animaux',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="simonScore">🎵 0</div>
      </div>
      <div class="simonstatus" id="simonStatus">Écoute bien…</div>
      <div id="simonWrap">
        <button class="spad sp1" data-i="0">🐔</button>
        <button class="spad sp2" data-i="1">🐮</button>
        <button class="spad sp3" data-i="2">🐷</button>
        <button class="spad sp4" data-i="3">🐕</button>
      </div>`
    simon = {
      seq: [], step: 0, playerTurn: false, best: 0, running: true,
      startLen: c.byTier(1, 2, 3),
      playSpeed: c.byTier(650, 520, 420)
    }
    document.querySelectorAll<HTMLElement>('.spad').forEach(p => {
      p.onclick = () => press(parseInt(p.dataset.i!))
    })
    for (let i = 0; i < simon.startLen; i++) simon.seq.push(rnd(0, 3))
    const startT = setTimeout(playSequence, 700)
    return () => {
      if (simon) { simon.running = false; simon = null }
      clearTimeout(startT)
    }
  }
}
