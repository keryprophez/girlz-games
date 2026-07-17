import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { sWin, tone } from '../core/audio'
import { fxAt, JUICE } from '../core/fx'

/* Petit Piano — mode libre + mélodies guidées « suis les lumières ».
   Créatif et musical : on ne peut pas perdre, on suit la touche qui brille. */

const NOTES = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25]
const NAMES = ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si', 'Do']
const KEY_COLORS = ['#FF6B81', '#FFA94D', '#FFE066', '#94D82D', '#5EC97B', '#4FB8E7', '#B197FC', '#F58FB8']

const SONGS: { name: string; icon: string; seq: number[] }[] = [
  { name: 'Au clair de la lune', icon: '🌙', seq: [0, 0, 0, 1, 2, 1, 0, 2, 1, 1, 0] },
  { name: 'Frère Jacques', icon: '🔔', seq: [0, 1, 2, 0, 0, 1, 2, 0, 2, 3, 4, 2, 3, 4] },
  { name: 'Ah ! vous dirai-je maman', icon: '⭐', seq: [0, 0, 4, 4, 5, 5, 4, 3, 3, 2, 2, 1, 1, 0] },
  { name: 'Joyeux anniversaire', icon: '🎂', seq: [0, 0, 1, 0, 3, 2, 0, 0, 1, 0, 4, 3, 0, 0, 7, 5, 3, 2, 1, 6, 6, 5, 3, 4, 3] },
  { name: 'Le lion est mort ce soir', icon: '🦁', seq: [2, 3, 4, 4, 5, 5, 4, 3, 2, 3, 4, 3, 2, 1, 0] }
]

let pn: any = null
let ctx: GameContext

function setStatus(t: string) { $('pnStatus').textContent = t }

function pulseTarget() {
  document.querySelectorAll('.pkey').forEach(k => k.classList.remove('pulse'))
  if (pn.mode === 'song' && pn.idx < pn.song.seq.length) {
    const target = pn.song.seq[pn.idx]
    document.querySelectorAll('.pkey')[target].classList.add('pulse')
  }
}

function press(i: number) {
  if (!pn || !pn.running) return
  const key = document.querySelectorAll('.pkey')[i] as HTMLElement
  tone(NOTES[i], 0.45, 'triangle', 0.2)
  key.classList.remove('play'); void key.offsetWidth; key.classList.add('play')
  if (pn.mode === 'free') { pn.played++; return }
  // Mode mélodie : guidé, sans punition
  if (i === pn.song.seq[pn.idx]) {
    pn.idx++
    fxAt(key, JUICE.mix, 6)
    if (pn.idx >= pn.song.seq.length) {
      pn.running = false
      setStatus('Bravo, toute la chanson ! 🎉')
      sWin()
      setTimeout(() => finish(pn.song.name), 900)
      return
    }
    setStatus(`${pn.song.icon} ${pn.song.name} — ${pn.idx}/${pn.song.seq.length}`)
    pulseTarget()
  } else {
    key.classList.remove('oops'); void key.offsetWidth; key.classList.add('oops')
  }
}

function startSong(si: number) {
  pn.mode = 'song'
  pn.song = SONGS[si]
  pn.idx = 0
  document.querySelectorAll('.pn-mode').forEach((b, k) => b.classList.toggle('sel', k === si + 1))
  setStatus(`${pn.song.icon} ${pn.song.name} — suis la touche qui brille !`)
  pulseTarget()
}

function startFree() {
  pn.mode = 'free'
  pn.idx = 0
  document.querySelectorAll('.pn-mode').forEach((b, k) => b.classList.toggle('sel', k === 0))
  document.querySelectorAll('.pkey').forEach(k => k.classList.remove('pulse'))
  setStatus('Joue ce que tu veux ! 🎶')
}

function finish(songName?: string) {
  ctx.finish({
    title: songName ? 'Quelle musicienne !' : 'Joli concert !',
    msg: songName
      ? `${ctx.playerName} a joué « ${songName} » en entier 🎹`
      : `${ctx.playerName} a joué ${pn ? pn.played : 0} notes 🎶`,
    stars: 3, starsEarned: 3
  })
}

export const piano: GameDef = {
  id: 'piano', name: 'Petit Piano', icon: '🎹', sq: 'sq-sky', cat: 'creatif', duel: false,
  subtitle: 'Joue librement, ou suis les lumières pour jouer une vraie chanson',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <button class="chip pn-mode sel">🎶 Libre</button>
        ${SONGS.map((s, i) => `<button class="chip pn-mode" data-s="${i}">${s.icon}</button>`).join('')}
      </div>
      <div class="simonstatus" id="pnStatus">Joue ce que tu veux ! 🎶</div>
      <div id="pnKeys">
        ${NOTES.map((_, i) => `
          <button class="pkey" data-i="${i}" style="--kc:${KEY_COLORS[i]}">
            <span class="pkname">${NAMES[i]}</span>
          </button>`).join('')}
      </div>
      <button class="bigbtn primary" id="pnDone" style="margin-top:16px">✨ Fin du concert !</button>`
    pn = { mode: 'free', song: null, idx: 0, played: 0, running: true }
    document.querySelectorAll<HTMLElement>('.pkey').forEach(k => {
      k.addEventListener('pointerdown', e => { e.preventDefault(); press(parseInt(k.dataset.i!)) })
    })
    document.querySelectorAll<HTMLElement>('.pn-mode').forEach(b => {
      b.onclick = () => {
        if (!pn) return
        pn.running = true
        if (b.dataset.s === undefined) startFree()
        else startSong(parseInt(b.dataset.s))
      }
    })
    ;($('pnDone') as HTMLButtonElement).onclick = () => { if (pn) { pn.running = false; finish() } }
    return () => { pn = null }
  }
}
