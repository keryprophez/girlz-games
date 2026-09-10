import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { sMoo, tone } from '../core/audio'
import { ICON } from '../core/icons'
import { loadAtlas, spriteSpan, type Atlas } from '../core/sprites'

/* Boîte à Rythme de la Ferme — une grille de 8 temps × 4 animaux :
   on allume des cases, on appuie sur play, la ferme fait de la musique. */

const STEPS = 8
const ROWS = [
  {
    key: 'vache', color: '#B197FC',
    icon: `<svg viewBox="0 0 40 40" width="30" height="30"><circle cx="20" cy="20" r="15" fill="#FFF6E8" stroke="#C9B497" stroke-width="2"/>
      <circle cx="13" cy="13" r="4.5" fill="#5B4632"/><ellipse cx="20" cy="27" rx="9" ry="6" fill="#F8C8CE"/>
      <circle cx="17" cy="27" r="1.6" fill="#B26E78"/><circle cx="23" cy="27" r="1.6" fill="#B26E78"/>
      <path d="M6,10 Q3,5 8,5 M34,10 Q37,5 32,5" stroke="#C9B497" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="14" cy="18" r="1.8" fill="#45362A"/><circle cx="26" cy="18" r="1.8" fill="#45362A"/></svg>`,
    play() { sMoo() }
  },
  {
    key: 'cochon', color: '#F58FB8',
    icon: `<svg viewBox="0 0 40 40" width="30" height="30"><circle cx="20" cy="20" r="15" fill="#FBC6D3" stroke="#DE93AB" stroke-width="2"/>
      <ellipse cx="20" cy="24" rx="7.5" ry="5.5" fill="#F291B2"/>
      <circle cx="17" cy="24" r="1.7" fill="#B25A7B"/><circle cx="23" cy="24" r="1.7" fill="#B25A7B"/>
      <path d="M8,9 L13,13 M32,9 L27,13" stroke="#DE93AB" stroke-width="4" stroke-linecap="round"/>
      <circle cx="14" cy="15" r="1.8" fill="#45362A"/><circle cx="26" cy="15" r="1.8" fill="#45362A"/></svg>`,
    play() { tone(150, 0.09, 'square', 0.12); tone(110, 0.09, 'square', 0.1, 0.06) }
  },
  {
    key: 'canard', color: '#4FB8E7',
    icon: `<svg viewBox="0 0 40 40" width="30" height="30"><circle cx="20" cy="20" r="15" fill="#FFE9A8" stroke="#DEC06A" stroke-width="2"/>
      <path d="M12,24 Q20,30 28,24 L28,27 Q20,33 12,27 Z" fill="#FFA94D" stroke="#E08A2E" stroke-width="1.5"/>
      <circle cx="14" cy="16" r="1.9" fill="#45362A"/><circle cx="26" cy="16" r="1.9" fill="#45362A"/></svg>`,
    play() { tone(280, 0.1, 'sawtooth', 0.12); tone(230, 0.1, 'sawtooth', 0.1, 0.07) }
  },
  {
    key: 'poule', color: '#FFA94D',
    icon: `<svg viewBox="0 0 40 40" width="30" height="30"><circle cx="20" cy="21" r="14" fill="#FFF6E8" stroke="#D9BFA0" stroke-width="2"/>
      <path d="M13,9 Q15,3 18,8 Q20,2 23,8 Q25,3 27,9" fill="#FF6B81" stroke="#E04E63" stroke-width="1.5"/>
      <path d="M17,23 L23,23 L20,27 Z" fill="#FFA94D"/>
      <circle cx="15" cy="18" r="1.8" fill="#45362A"/><circle cx="25" cy="18" r="1.8" fill="#45362A"/></svg>`,
    play() { tone(880, 0.05, 'triangle', 0.14); tone(1180, 0.06, 'triangle', 0.1, 0.045) }
  }
]

const PRESETS: Record<string, number[][]> = {
  // [ligne][pas] — 1 = case allumée
  p1: [
    [1, 0, 0, 0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 1, 0],
    [0, 0, 0, 0, 0, 1, 0, 0],
    [1, 0, 1, 0, 1, 0, 1, 1]
  ],
  p2: [
    [1, 0, 0, 1, 0, 0, 1, 0],
    [0, 1, 0, 0, 1, 0, 0, 1],
    [0, 0, 1, 0, 0, 1, 0, 0],
    [1, 1, 0, 1, 1, 0, 1, 0]
  ]
}

let bb: any = null
let ctx: GameContext

function render() {
  document.querySelectorAll<HTMLElement>('.bb-cell').forEach(cell => {
    const r = +cell.dataset.r!, s = +cell.dataset.s!
    cell.classList.toggle('on', !!bb.grid[r][s])
  })
}

function tick() {
  bb.step = (bb.step + 1) % STEPS
  document.querySelectorAll<HTMLElement>('.bb-cell').forEach(cell => {
    cell.classList.toggle('now', +cell.dataset.s! === bb.step)
  })
  ROWS.forEach((row, r) => { if (bb.grid[r][bb.step]) row.play() })
}

/* L'horloge : une frame d'avance sur `performance.now()`, le temps du
   prochain pas est ACCUMULÉ (plus de dérive de setTimeout) ; en pause d'onglet
   on ne rattrape pas en rafale. */
function clock(now: number) {
  if (!bb || !bb.playing) return
  if (now >= bb.nextAt) {
    tick()
    bb.nextAt += bb.tempo
    if (now - bb.nextAt > bb.tempo * 2) bb.nextAt = now + bb.tempo
  }
  bb.raf = requestAnimationFrame(clock)
}

function setPlaying(on: boolean) {
  bb.playing = on
  cancelAnimationFrame(bb.raf)
  $('bbPlay').innerHTML = on ? ICON.pause : ICON.play
  if (on) { bb.step = -1; bb.nextAt = performance.now(); bb.raf = requestAnimationFrame(clock) }
  else document.querySelectorAll('.bb-cell').forEach(c => c.classList.remove('now'))
}

function finish() {
  const notes = bb.grid.flat().filter(Boolean).length
  ctx.finish({
    title: 'Quel orchestre !',
    msg: `${ctx.playerName} a composé un rythme avec ${notes} sons de la ferme`,
    stars: 3, starsEarned: 3
  })
}

export const beatbox: GameDef = {
  id: 'beatbox', name: 'Boîte à Rythme', icon: '🥁', sq: 'sq-pink', cat: 'creatif',
  subtitle: 'Allume des cases, appuie sur Joue : la ferme fait de la musique !',
  mount(c) {
    ctx = c
    const ANIMALS = ['cow', 'pig', 'duck', 'chicken']
    c.root.innerHTML = `
      <div class="topbar">
        <button class="chip bb-big" id="bbPlay" aria-label="Joue">${ICON.play}</button>
        <button class="chip bb-tempo" data-t="500" aria-label="Lent">${ICON.timer}<i class="bb-dots">•</i></button>
        <button class="chip bb-tempo sel" data-t="340" aria-label="Moyen">${ICON.timer}<i class="bb-dots">••</i></button>
        <button class="chip bb-tempo" data-t="230" aria-label="Rapide">${ICON.timer}<i class="bb-dots">•••</i></button>
        <button class="chip" id="bbClear" aria-label="Effacer">${ICON.replay}</button>
      </div>
      <div id="bbGrid">
        ${ROWS.map((row, r) => `
          <div class="bb-row">
            <button class="bb-animal" data-r="${r}" data-a="${ANIMALS[r]}" style="--rc:${row.color}">${row.icon}</button>
            ${Array.from({ length: STEPS }, (_, s) =>
              `<button class="bb-cell${s % 4 === 0 ? ' bar' : ''}" data-r="${r}" data-s="${s}" style="--rc:${row.color}"></button>`).join('')}
          </div>`).join('')}
      </div>
      <div class="bb-presets">
        <button class="chip" data-p="p1" aria-label="Rythme 1">${ICON.sound} 1</button>
        <button class="chip" data-p="p2" aria-label="Rythme 2">${ICON.sound} 2</button>
      </div>
      <button class="sn-tool go" id="bbDone" style="margin-top:12px" aria-label="Fini">${ICON.check}</button>`
    bb = { grid: ROWS.map(() => Array(STEPS).fill(0)), playing: false, step: -1, tempo: 340, running: true, raf: 0, nextAt: 0 }
    // Les vrais animaux de la planche sur les boutons de ligne
    loadAtlas('animals').then((a: Atlas) => {
      if (!bb) return
      document.querySelectorAll<HTMLElement>('.bb-animal').forEach(b => { b.innerHTML = spriteSpan(a, b.dataset.a!, 40) })
    })
    document.querySelectorAll<HTMLElement>('.bb-cell').forEach(cell => {
      cell.onclick = () => {
        if (!bb) return
        const r = +cell.dataset.r!, s = +cell.dataset.s!
        bb.grid[r][s] = bb.grid[r][s] ? 0 : 1
        if (bb.grid[r][s]) ROWS[r].play()
        render()
      }
    })
    document.querySelectorAll<HTMLElement>('.bb-animal').forEach(a => {
      a.onclick = () => ROWS[+a.dataset.r!].play()
    })
    document.querySelectorAll<HTMLElement>('.bb-tempo').forEach(t => {
      t.onclick = () => {
        if (!bb) return
        bb.tempo = +t.dataset.t!
        document.querySelectorAll('.bb-tempo').forEach(x => x.classList.remove('sel'))
        t.classList.add('sel')
      }
    })
    document.querySelectorAll<HTMLElement>('.bb-presets .chip').forEach(p => {
      p.onclick = () => {
        if (!bb) return
        bb.grid = PRESETS[p.dataset.p!].map(row => [...row])
        render()
        if (!bb.playing) setPlaying(true)
      }
    })
    ;($('bbPlay') as HTMLButtonElement).onclick = () => bb && setPlaying(!bb.playing)
    ;($('bbClear') as HTMLButtonElement).onclick = () => { if (bb) { bb.grid = ROWS.map(() => Array(STEPS).fill(0)); render() } }
    ;($('bbDone') as HTMLButtonElement).onclick = () => { if (bb) { setPlaying(false); finish() } }
    return () => { if (bb) { cancelAnimationFrame(bb.raf); bb = null } }
  }
}
