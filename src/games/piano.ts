import type { GameContext, GameDef } from '../core/types'
import { tone } from '../core/audio'
import { sfx, preloadSfx } from '../core/sfx'
import { ICON } from '../core/icons'
import { critterPortraits, portraitImg } from '../core/portraits'
import type { CritterKind } from '../core/critters'
import { some, visible } from '../core/hand'

/* Petit Piano — mode libre + mélodies guidées « suis les lumières ».
   Créatif et musical : on ne peut pas perdre, on suit la touche qui brille.

   Repris le 22/09 : plein écran (huit grandes touches sur toute la
   largeur), chansons choisies sur des dessins et plus sur des numéros, et la
   chanson s'affiche en PARTITION DE COULEURS au-dessus du clavier : une
   pastille par note, de la couleur de sa touche. Celle à jouer bat, celles
   jouées se remplissent — on voit où on en est sans lire « 7/14 ».

   Refait le 23/09 (« huit barres colorées ») : un VRAI piano laqué noir,
   touches d'ivoire qui s'enfoncent (et leurs dièses noirs, pour le décor),
   et au-dessus huit animaux de la ferme — un par note, du plus grave (la
   vache) au plus aigu (le poussin). Chaque note jouée monte le long de son
   couloir jusqu'à son animal, qui saute en chantant. En mode chanson, la
   partition DESCEND vers les touches : la prochaine note attend juste
   au-dessus de sa touche, en battant, les suivantes empilées derrière. */

const NOTES = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25]
const NAMES = ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si', 'Do']
const KEY_COLORS = ['#FF6B81', '#FFA94D', '#FFD43B', '#94D82D', '#5EC97B', '#4FB8E7', '#B197FC', '#F58FB8']
/** Un chanteur par note, du plus grave au plus aigu */
/* Le 28/09, le cheval et le chat prennent la place du lapin et du poussin */
const SINGERS: CritterKind[] = ['cow', 'pig', 'sheep', 'dog', 'duck', 'hen', 'horse', 'cat']
/** Les dièses (décor) : entre Do-Ré, Ré-Mi, Fa-Sol, Sol-La, La-Si */
const SHARPS = [0, 1, 3, 4, 5]
/** Notes de la partition visibles d'un coup dans les couloirs */
const AHEAD = 6

const svg = (body: string) => `<svg class="ico" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">${body}</svg>`
const BELL = svg('<path d="M12 3.2c-3.4 0-5.8 2.6-5.8 6v4.2L4.5 16.6h15l-1.7-3.2V9.2c0-3.4-2.4-6-5.8-6z" fill="currentColor"/><circle cx="12" cy="19" r="2.1" fill="currentColor"/>')
const CAKE = svg('<rect x="4" y="12" width="16" height="8.5" rx="2" fill="currentColor"/><path d="M4 15c2.7 1.6 5.3 1.6 8 0s5.3-1.6 8 0" stroke="#fff" stroke-width="1.6" fill="none"/><rect x="11" y="6.5" width="2" height="5" rx="1" fill="currentColor"/><path d="M12 2.6c1.3 1.5 1.3 2.6 0 3.3-1.3-.7-1.3-1.8 0-3.3z" fill="currentColor"/>')
const LION = svg('<circle cx="12" cy="12" r="9.5" fill="currentColor" opacity=".55"/><circle cx="12" cy="12.5" r="6" fill="currentColor"/><circle cx="9.8" cy="11.3" r="1" fill="#fff"/><circle cx="14.2" cy="11.3" r="1" fill="#fff"/><path d="M10.6 14.6h2.8L12 16z" fill="#fff"/>')
const HEN = svg('<path d="M4.6 12.8c0-3.4 2.9-5.8 6.3-5.8.9 0 1.7.2 2.4.5V6.1a2.4 2.4 0 0 1 4.8 0v2.1l2.3 1.2-2.3 1V12c0 4-3.1 7-7 7h-.3c-3.4 0-6.2-2.7-6.2-6.2z" fill="currentColor"/><path d="M14.3 4.1c.4-1.1 1.5-1.4 2.2-.6.6-.8 1.9-.5 1.9.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M5.2 11.6L1.8 8.7l.4 4.5 2.9 1.4z" fill="currentColor"/><circle cx="16" cy="7.4" r=".9" fill="#fff"/><path d="M9 19.4v2.2M12 19.4v2.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>')
const MILL = svg('<path d="M9.6 21.5l1.2-10h2.4l1.2 10z" fill="currentColor"/><path d="M12 9.5 5.2 2.7M12 9.5l6.8-6.8M12 9.5l-6.8 6.8M12 9.5l6.8 6.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M8.6 6.1 6.1 3.6 4.6 5.1l2.5 2.5zM15.4 6.1l2.5-2.5 1.5 1.5-2.5 2.5zM8.6 12.9l-2.5 2.5 1.5 1.5 2.5-2.5zM15.4 12.9l2.5 2.5-1.5 1.5-2.5-2.5z" fill="currentColor"/><circle cx="12" cy="9.5" r="1.7" fill="currentColor"/>')
const CROWN = svg('<path d="M3.2 7.6 7.6 11 12 4.6l4.4 6.4 4.4-3.4-1.9 10H5.1z" fill="currentColor"/><rect x="5" y="18.6" width="14" height="2.4" rx="1.2" fill="currentColor"/><circle cx="12" cy="13.6" r="1.4" fill="#fff"/>')
const FERRET = svg('<path d="M2.6 16.4c1.9-3.6 5.5-5.2 9.2-4.8 2.3.2 3.6-1 4.6-2.6.8-1.3 2.2-1.9 3.6-1.4l1.6.6-.7 1.3c-.4.7-1 1.2-1.8 1.4-.5 2.8-2.6 4.9-5.4 5.3-2 .3-3.7 1-5 2.3l-1.4 1.6H6l1-2.4c-1.8.6-3.4.4-4.4-1.3z" fill="currentColor"/><path d="M8.4 17.2 9.6 20.6M13.6 15.6l1 3.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="18.6" cy="8.8" r=".8" fill="#fff"/>')
const FOUNTAIN = svg('<path d="M3.5 15h17l-1.7 3.8a2 2 0 0 1-1.8 1.2H7a2 2 0 0 1-1.8-1.2z" fill="currentColor"/><rect x="10.8" y="9.5" width="2.4" height="5.5" rx=".6" fill="currentColor"/><path d="M12 9.5V2.8M12 6c-2.2-1.9-5-2-7 .2-.9 1-1.3 2.9-1.2 5.2M12 6c2.2-1.9 5-2 7 .2.9 1 1.3 2.9 1.2 5.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>')

/* Les mélodies sont relevées sur des partitions (Wikipédia, et le recueil
   de comptines de Galouvielle en ABC pour Meunier, tu dors), puis
   transposées pour tenir sur les huit touches blanches : Do grave = 0,
   Do aigu = 7. Une chanson qui a besoin d'un dièse, ou qui court de la
   quinte grave à la quinte aiguë (Il était un petit navire, Une souris
   verte, Savez-vous planter les choux, Sur le pont d'Avignon), n'y tient
   pas : elle n'est pas là plutôt que fausse. */
const SONGS: { name: string; icon: string; seq: number[] }[] = [
  { name: 'Au clair de la lune', icon: ICON.moon, seq: [0, 0, 0, 1, 2, 1, 0, 2, 1, 1, 0] },
  { name: 'Frère Jacques', icon: BELL, seq: [0, 1, 2, 0, 0, 1, 2, 0, 2, 3, 4, 2, 3, 4] },
  { name: 'Ah ! vous dirai-je maman', icon: ICON.star, seq: [0, 0, 4, 4, 5, 5, 4, 3, 3, 2, 2, 1, 1, 0] },
  { name: 'Joyeux anniversaire', icon: CAKE, seq: [0, 0, 1, 0, 3, 2, 0, 0, 1, 0, 4, 3, 0, 0, 7, 5, 3, 2, 1, 6, 6, 5, 3, 4, 3] },
  { name: 'Le lion est mort ce soir', icon: LION, seq: [2, 3, 4, 4, 5, 5, 4, 3, 2, 3, 4, 3, 2, 1, 0] },
  // Fa majeur, telle quelle
  { name: 'Une poule sur un mur', icon: HEN, seq: [3, 3, 3, 3, 4, 4, 0, 3, 3, 3, 3, 4, 4, 0, 3, 3, 3, 3, 3, 4, 3, 3, 4, 3, 4, 7, 3] },
  // Do majeur → Fa majeur (la quinte grave tombe sur le Do)
  { name: 'Meunier, tu dors', icon: MILL, seq: [0, 3, 5, 3, 2, 3, 4, 4, 4, 4, 3, 4, 5, 3, 0, 3, 5, 3, 2, 3, 4, 4, 4, 4, 5, 4, 3] },
  // Sol majeur → Do majeur
  { name: 'Le bon roi Dagobert', icon: CROWN, seq: [2, 2, 1, 1, 0, 0, 1, 2, 3, 2, 1, 0, 1, 0, 0, 1, 2, 2, 2, 3, 4, 1, 1, 1, 0, 1, 2, 2, 2, 3, 4, 1, 1, 1, 2, 2, 1, 1, 0, 0, 1, 2, 3, 2, 1, 0, 1, 0, 0] },
  // Si bémol majeur → Fa majeur, le premier couplet
  { name: 'Il court, il court, le furet', icon: FERRET, seq: [0, 3, 4, 5, 4, 4, 1, 3, 2, 1, 0, 1, 2, 3, 0, 3, 4, 5, 4, 4, 1, 3, 2, 1, 0, 1, 2, 3] },
  // Fa majeur, telle quelle
  { name: 'À la claire fontaine', icon: FOUNTAIN, seq: [3, 3, 5, 5, 4, 5, 4, 3, 3, 5, 5, 4, 5, 5, 5, 4, 3, 5, 7, 5, 7, 7, 5, 3, 5, 4, 3, 3, 5, 5, 4, 3, 5, 3, 5, 5, 4, 3, 5, 4, 3] }
]

interface State {
  mode: 'free' | 'song'
  song: typeof SONGS[number] | null
  idx: number
  played: number
  running: boolean
  root: HTMLElement
  keys: HTMLElement[]
  singers: HTMLElement[]
  lanes: HTMLElement
}

let pn: State | null = null
let ctx: GameContext

/** La partition qui descend : la note à jouer attend au-dessus de sa touche,
    les suivantes montent derrière elle dans leurs couloirs. */
function paintScore(me: State) {
  const el = me.lanes
  el.querySelectorAll('.pn-note').forEach(n => n.remove())
  if (me.mode === 'song' && me.song) {
    const seq = me.song.seq
    for (let k = me.idx; k < Math.min(seq.length, me.idx + AHEAD); k++) {
      const n = document.createElement('i')
      n.className = 'pn-note' + (k === me.idx ? ' cur' : '')
      n.style.setProperty('--kc', KEY_COLORS[seq[k]])
      n.style.setProperty('--lane', String(seq[k]))
      n.style.setProperty('--row', String(k - me.idx))
      el.appendChild(n)
    }
  }
  // La barre d'avancement : une pastille par note, sans chiffre
  const bar = me.root.querySelector<HTMLElement>('.pn-score')!
  bar.innerHTML = me.mode === 'song' && me.song
    ? me.song.seq.map((n, k) => `<b class="${k < me.idx ? 'done' : ''}" style="--kc:${KEY_COLORS[n]}"></b>`).join('')
    : ''
  me.keys.forEach((k, i) => k.classList.toggle('pulse', me.mode === 'song' && !!me.song && me.song.seq[me.idx] === i))
}

/** La note jouée monte le long de son couloir jusqu'à son chanteur */
function rise(me: State, i: number) {
  const n = document.createElement('i')
  n.className = 'pn-rise'
  n.style.setProperty('--kc', KEY_COLORS[i])
  n.style.setProperty('--lane', String(i))
  me.lanes.appendChild(n)
  ctx.after(520, () => {
    n.remove()
    if (pn !== me) return
    const s = me.singers[i]
    s.classList.remove('sing'); void s.offsetWidth; s.classList.add('sing')
  })
}

function press(me: State, i: number) {
  if (pn !== me || !me.running) return
  const key = me.keys[i]
  // Un son plus rond : la note, et son octave tout doucement par-dessus
  tone(NOTES[i], 0.6, 'triangle', 0.17)
  tone(NOTES[i] * 2, 0.35, 'sine', 0.04)
  key.classList.remove('play'); void key.offsetWidth; key.classList.add('play')
  // La touche remonte d'elle-même (sinon elle restait enfoncée jusqu'au toucher suivant)
  ctx.after(170, () => key.classList.remove('play'))
  rise(me, i)
  if (me.mode === 'free' || !me.song) { me.played++; return }
  // Mode chanson : guidé, sans punition
  if (i === me.song.seq[me.idx]) {
    me.idx++
    paintScore(me)
    if (me.idx >= me.song.seq.length) {
      me.running = false
      me.keys.forEach(k => k.classList.remove('pulse'))
      sfx('confirm', { vol: 0.8 })
      me.root.querySelector('.pn-score')!.classList.add('won')
      // Tout le chœur saute pour saluer
      me.singers.forEach((s, k) => ctx.after(k * 70, () => { s.classList.remove('sing'); void s.offsetWidth; s.classList.add('sing') }))
      const song = me.song.name
      ctx.after(1400, () => { if (pn === me) finish(me, song) })
    }
  } else {
    key.classList.remove('oops'); void key.offsetWidth; key.classList.add('oops')
  }
}

function setMode(me: State, song: number | null) {
  me.running = true
  me.idx = 0
  me.mode = song === null ? 'free' : 'song'
  me.song = song === null ? null : SONGS[song]
  me.root.querySelectorAll<HTMLElement>('.pn-mode').forEach(b =>
    b.parentElement!.classList.toggle('sel', (b.dataset.s ?? '') === (song === null ? '' : String(song))))
  // Le nom du mode choisi, sous les boutons (30/09 : « un label en plus du
  // symbole » — dix titres de chanson ne tiennent pas sous des boutons de 58 px)
  me.root.querySelector('.pn-now')!.textContent = song === null ? 'Libre' : SONGS[song].name
  me.root.querySelector('.pn-score')!.classList.remove('won')
  if (song === null) me.keys.forEach(k => k.classList.remove('pulse'))
  paintScore(me)
}

function finish(me: State, songName?: string) {
  ctx.finish({
    title: songName ? 'Quelle musicienne !' : 'Joli concert !',
    msg: songName ? `Tu as joué « ${songName} » en entier` : `Tu as joué ${me.played} notes`,
    stars: 3
  })
}

export const piano: GameDef = {
  id: 'piano', name: 'Petit Piano', icon: '🎹', sq: 'sq-sky', cat: 'creatif',
  subtitle: 'Joue librement, ou suis les lumières pour jouer une vraie chanson',
  // La main : une touche (en chanson, celle qui brille : c'est le jeu)
  hand: root => {
    if (!pn || !pn.running) return null
    const lit = root.querySelector<HTMLElement>('.pkey.pulse')
    return { tap: lit || some(visible(root, '.pkey'), 1)[0] }
  },
  mount(c) {
    ctx = c
    const modeBtn = (s: string, icon: string, label: string, sel = false) =>
      `<span class="tool-item${sel ? ' sel' : ''}"><button class="sn-tool pn-mode" ${s ? `data-s="${s}"` : ''} aria-label="${label}">${icon}</button></span>`
    c.root.innerHTML = `
      <div class="arena pn-arena">
        <div class="tq-tools pn-tools">
          ${modeBtn('', ICON.sound, 'Libre', true)}
          ${SONGS.map((s, i) => modeBtn(String(i), s.icon, s.name)).join('')}
          <i class="tool-cap pn-now">Libre</i>
        </div>
        <div class="pn-main">
          <div class="pn-score"></div>
          <div class="pn-choir">${SINGERS.map((_, i) => `<span class="pn-singer" style="--kc:${KEY_COLORS[i]}"></span>`).join('')}</div>
          <div class="pn-lanes">${NOTES.map((_, i) => `<span class="pn-lane" style="--lane:${i};--kc:${KEY_COLORS[i]}"></span>`).join('')}</div>
          <div class="pn-piano">
            <div class="pn-keys">
              ${NOTES.map((_, i) => `
                <button class="pkey" data-i="${i}" style="--kc:${KEY_COLORS[i]}">
                  <span class="pkname">${NAMES[i]}</span>
                </button>`).join('')}
              ${SHARPS.map(i => `<span class="pn-sharp" style="--after:${i}"></span>`).join('')}
            </div>
          </div>
        </div>
        <button class="sn-tool go pn-done" id="pnDone" aria-label="Fini">${ICON.check}</button>
      </div>`
    preloadSfx(['confirm'])
    const me: State = {
      mode: 'free', song: null, idx: 0, played: 0, running: true, root: c.root,
      keys: Array.from(c.root.querySelectorAll<HTMLElement>('.pkey')),
      singers: Array.from(c.root.querySelectorAll<HTMLElement>('.pn-singer')),
      lanes: c.root.querySelector<HTMLElement>('.pn-lanes')!
    }
    pn = me
    critterPortraits(SINGERS, 110).then(img => {
      if (pn !== me) return
      me.singers.forEach((el, i) => { el.innerHTML = portraitImg(img[SINGERS[i]], 110) })
    })
    me.keys.forEach((k, i) => {
      k.addEventListener('pointerdown', e => { e.preventDefault(); press(me, i) })
    })
    c.root.querySelectorAll<HTMLElement>('.pn-mode').forEach(b => {
      b.onclick = () => setMode(me, b.dataset.s === undefined ? null : parseInt(b.dataset.s))
    })
    c.root.querySelector<HTMLElement>('#pnDone')!.onclick = () => { me.running = false; finish(me) }
    return () => { me.running = false; if (pn === me) pn = null }
  }
}
