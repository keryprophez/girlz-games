import type { GameContext, GameDef } from '../core/types'
import { sMoo, tone } from '../core/audio'
import { ICON } from '../core/icons'
import { cry, preloadCries, CRY } from '../core/sfx'
import { isPaused, onPause } from '../core/session'
import { critterPortraits, portraitImg } from '../core/portraits'
import type { CritterKind } from '../core/critters'

/* Boîte à Rythme de la Ferme — une grille de 8 temps × 4 animaux :
   on allume des cases, on appuie sur Joue, la ferme fait de la musique.

   Repris le 22/09 : plein écran (la grille prend toute la place, les cases
   sont de vrais gros boutons), les animaux sont les personnages 3D de la
   ferme (`core/portraits.ts`, plus les dessins ni les pastilles Kenney) et
   ils SAUTENT quand ils chantent ; une barre de lecture parcourt la grille ;
   les outils sont une colonne d'icônes avec leur mot dessous. Créer : aucune
   note, l'écran de fin ne juge pas. La lecture s'arrête avec la pause.
   Depuis le 25/09, les animaux chantent avec leur VRAIE voix (les cris
   choisis par le père pour le Chœur, `cry()` de core/sfx.ts), coupée à la
   longueur d'un temps ; l'ancienne voix synthétique reste en secours. */

const STEPS = 8
const ROWS: { animal: CritterKind; color: string; synth(): void }[] = [
  { animal: 'cow', color: '#B197FC', synth() { sMoo() } },
  { animal: 'pig', color: '#F58FB8', synth() { tone(150, 0.09, 'square', 0.12); tone(110, 0.09, 'square', 0.1, 0.06) } },
  { animal: 'duck', color: '#4FB8E7', synth() { tone(280, 0.1, 'sawtooth', 0.12); tone(230, 0.1, 'sawtooth', 0.1, 0.07) } },
  { animal: 'hen', color: '#FFA94D', synth() { tone(880, 0.05, 'triangle', 0.14); tone(1180, 0.06, 'triangle', 0.1, 0.045) } }
]

const TEMPOS = [{ ms: 500, cap: 'Lent', dots: 1 }, { ms: 340, cap: 'Moyen', dots: 2 }, { ms: 230, cap: 'Vite', dots: 3 }]

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

interface State {
  grid: number[][]
  playing: boolean
  step: number
  tempo: number
  raf: number
  nextAt: number
  root: HTMLElement
  cells: HTMLElement[][]
  animals: HTMLElement[]
  head: HTMLElement
}

let bb: State | null = null
let ctx: GameContext

function render(me: State) {
  me.cells.forEach((row, r) => row.forEach((c, s) => c.classList.toggle('on', !!me.grid[r][s])))
}

/** Un animal chante : il saute, sa case s'illumine. */
function sing(me: State, r: number) {
  // La vraie voix, le temps d'un pas et demi (les voix se chevauchent un peu)
  const voice = CRY[ROWS[r].animal]
  if (!voice || !cry(voice, { max: Math.min(0.9, me.tempo / 1000 * 1.5), vol: 0.85 })) ROWS[r].synth()
  const a = me.animals[r]
  a.classList.remove('sing'); void a.offsetWidth; a.classList.add('sing')
}

function tick(me: State) {
  me.step = (me.step + 1) % STEPS
  me.cells.forEach(row => row.forEach((c, s) => c.classList.toggle('now', s === me.step)))
  // La barre de lecture glisse sur la colonne jouée
  const c0 = me.cells[0][me.step], cN = me.cells[ROWS.length - 1][me.step]
  me.head.style.transform = `translateX(${c0.offsetLeft}px)`
  me.head.style.width = c0.offsetWidth + 'px'
  me.head.style.top = c0.offsetTop + 'px'
  me.head.style.height = cN.offsetTop + cN.offsetHeight - c0.offsetTop + 'px'
  ROWS.forEach((_, r) => { if (me.grid[r][me.step]) sing(me, r) })
}

/* L'horloge : le temps du prochain pas est ACCUMULÉ sur `performance.now()`
   (pas de dérive de minuteur) ; en pause, rien ne joue et on ne rattrape pas
   en rafale au retour. */
function clock(now: number) {
  const me = bb
  if (!me || !me.playing) return
  if (isPaused()) me.nextAt = now + me.tempo
  else if (now >= me.nextAt) {
    tick(me)
    me.nextAt += me.tempo
    if (now - me.nextAt > me.tempo * 2) me.nextAt = now + me.tempo
  }
  me.raf = requestAnimationFrame(clock)
}

function setPlaying(me: State, on: boolean) {
  me.playing = on
  cancelAnimationFrame(me.raf)
  const btn = me.root.querySelector<HTMLElement>('#bbPlay')!
  btn.innerHTML = on ? ICON.pause : ICON.play
  btn.parentElement!.classList.toggle('sel', on)
  me.head.classList.toggle('on', on)
  if (on) { me.step = -1; me.nextAt = performance.now(); me.raf = requestAnimationFrame(clock) }
  else me.cells.forEach(row => row.forEach(c => c.classList.remove('now')))
}

function finish(me: State) {
  const notes = me.grid.flat().filter(Boolean).length
  ctx.finish({
    title: 'Quel orchestre !',
    msg: `Tu as composé un rythme avec ${notes} sons de la ferme`,
    stars: 3
  })
}

const tool = (id: string, icon: string, cap: string, extra = '') =>
  `<span class="tool-item"><button class="sn-tool${extra}" id="${id}" aria-label="${cap}">${icon}</button><i class="tool-cap">${cap}</i></span>`

export const beatbox: GameDef = {
  id: 'beatbox', name: 'Boîte à Rythme', icon: '🥁', sq: 'sq-pink', cat: 'creatif',
  subtitle: 'Allume des cases, appuie sur Joue : la ferme fait de la musique !',
  mount(c) {
    ctx = c
    preloadCries(ROWS.map(r => CRY[r.animal]!).filter(Boolean))
    c.root.innerHTML = `
      <div class="arena bb-arena">
        <div class="tq-tools bb-tools">
          ${tool('bbPlay', ICON.play, 'Joue', ' go')}
          ${TEMPOS.map((t, i) => `<span class="tool-item${i === 1 ? ' sel' : ''}"><button class="sn-tool bb-tempo" data-t="${t.ms}" aria-label="${t.cap}">${ICON.timer}<i class="bb-dots">${'•'.repeat(t.dots)}</i></button><i class="tool-cap">${t.cap}</i></span>`).join('')}
          ${tool('bbP1', ICON.sound + '<i class="bb-num">1</i>', 'Air 1')}
          ${tool('bbP2', ICON.sound + '<i class="bb-num">2</i>', 'Air 2')}
          ${tool('bbClear', ICON.replay, 'Efface')}
        </div>
        <div class="bb-board" id="bbGrid">
          <div class="bb-head"></div>
          ${ROWS.map((row, r) => `
            <button class="bb-animal" data-r="${r}" style="--rc:${row.color}" aria-label="${row.animal}"></button>
            ${Array.from({ length: STEPS }, (_, s) =>
              `<button class="bb-cell${s % 4 === 0 ? ' bar' : ''}" data-r="${r}" data-s="${s}" style="--rc:${row.color}"></button>`).join('')}`).join('')}
        </div>
        <button class="sn-tool go bb-done" id="bbDone" aria-label="Fini">${ICON.check}</button>
      </div>`
    const root = c.root
    const board = root.querySelector<HTMLElement>('#bbGrid')!
    const cells = ROWS.map((_, r) => Array.from(board.querySelectorAll<HTMLElement>(`.bb-cell[data-r="${r}"]`)))
    const animals = Array.from(board.querySelectorAll<HTMLElement>('.bb-animal'))
    const me: State = {
      grid: ROWS.map(() => Array(STEPS).fill(0)), playing: false, step: -1, tempo: 340, raf: 0, nextAt: 0,
      root, cells, animals, head: board.querySelector<HTMLElement>('.bb-head')!
    }
    bb = me

    // Les vrais personnages de la ferme sur les boutons de ligne
    const px = Math.max(64, Math.round(animals[0].clientHeight * 0.95))
    critterPortraits(ROWS.map(r => r.animal), px).then(img => {
      if (bb !== me) return
      animals.forEach((a, r) => { a.innerHTML = portraitImg(img[ROWS[r].animal], px) })
    })

    board.addEventListener('click', e => {
      const t = e.target as HTMLElement
      const cell = t.closest<HTMLElement>('.bb-cell')
      if (cell) {
        const r = +cell.dataset.r!, s = +cell.dataset.s!
        me.grid[r][s] = me.grid[r][s] ? 0 : 1
        if (me.grid[r][s]) sing(me, r)
        render(me)
        return
      }
      const an = t.closest<HTMLElement>('.bb-animal')
      if (an) sing(me, +an.dataset.r!)
    })
    root.querySelectorAll<HTMLElement>('.bb-tempo').forEach(t => {
      t.onclick = () => {
        me.tempo = +t.dataset.t!
        root.querySelectorAll('.bb-tempo').forEach(x => x.parentElement!.classList.toggle('sel', x === t))
      }
    })
    const preset = (k: string) => {
      me.grid = PRESETS[k].map(row => [...row])
      render(me)
      if (!me.playing) setPlaying(me, true)
    }
    root.querySelector<HTMLElement>('#bbP1')!.onclick = () => preset('p1')
    root.querySelector<HTMLElement>('#bbP2')!.onclick = () => preset('p2')
    root.querySelector<HTMLElement>('#bbPlay')!.onclick = () => setPlaying(me, !me.playing)
    root.querySelector<HTMLElement>('#bbClear')!.onclick = () => { me.grid = ROWS.map(() => Array(STEPS).fill(0)); render(me) }
    root.querySelector<HTMLElement>('#bbDone')!.onclick = () => { setPlaying(me, false); finish(me) }
    // Pause (onglet caché, minuteur parental) : on ne chante pas dans le vide
    const offPause = onPause(p => { if (p) me.cells.forEach(row => row.forEach(c => c.classList.remove('now'))) })
    return () => {
      offPause()
      cancelAnimationFrame(me.raf)
      me.playing = false
      if (bb === me) bb = null
    }
  }
}
