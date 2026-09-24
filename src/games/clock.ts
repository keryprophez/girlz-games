import type { GameContext, GameDef } from '../core/types'
import { $, rnd, shuffle } from '../core/utils'
import { sfx, preloadSfx } from '../core/sfx'
import { fxAt, JUICE } from '../core/fx'
import { ICON } from '../core/icons'

/* Quelle heure ? — apprendre à LIRE l'heure pas à pas, en cinq modes :
   Découvre (manipule l'horloge, elle dit l'heure), Les heures (la petite
   aiguille seule), Les minutes (la grande aiguille + anneau des minutes),
   Quiz (lire l'heure complète), Règle (déplacer les aiguilles pour faire
   l'heure demandée). La voix ne lit que les heures, jamais de consignes.

   Polish du 9/09 (phase 2, Apprendre) :
   - plein écran : l'horloge prend toute la hauteur, les modes sont une
     colonne d'icônes, les manches des pastilles — plus une ligne à lire ;
   - les aiguilles se déplacent au doigt dans TOUS les modes où on règle
     (Découvre et Règle), plus seulement dans le plus dur ;
   - « une heure », « une heure moins le quart » : la voix parle français ;
   - aucune sanction : pas de vies, pas de chrono ; timers de partie.

   Retours tablette du 23/09 (« très difficile de bouger les aiguilles :
   quand on en place une, l'autre vient en même temps ; les boutons sont
   peu clairs et trop petits ») :
   - l'aiguille est choisie UNE FOIS, au toucher (celle dont on touche la
     direction ; si les deux se superposent, la courte près du centre, la
     longue vers le bord), puis elle reste en main jusqu'au lever du doigt.
     Avant, le choix était refait à chaque mouvement selon la distance au
     centre : en passant près du centre, on attrapait l'autre aiguille.
     Chaque aiguille a une grosse boule au bout, et celle qu'on tient brille ;
   - Règle ne démarre plus à 12:00 (les deux aiguilles l'une sur l'autre) ;
   - les réglages sont deux grosses rangées −/+ avec le dessin de l'aiguille
     qu'elles bougent (la courte, la longue), à droite de l'horloge, et un
     gros bouton vert « Valide » ; les modes sont de grosses icônes dessinées
     (une horloge qui montre la courte, la longue…) avec leur mot en grand. */

type Mode = 'discover' | 'hours' | 'minutes' | 'quiz' | 'set'
type Hand = 'hour' | 'minute'
interface FaceOpts { minuteRing?: boolean; hideMinute?: boolean; fadeHour?: boolean; grab?: Hand | null }

interface State {
  mode: Mode
  h: number
  m: number
  th: number
  tm: number
  round: number
  total: number
  score: number
  lock: boolean
  touched: number
  /** L'aiguille tenue par le doigt, choisie au toucher et gardée jusqu'au lever. */
  grab: Hand | null
  /** Les minutes écrites autour du cadran (05, 10, 15…) : on peut les cacher,
      comme sur une horloge ordinaire (demande du 24/09). Retenu d'une partie
      à l'autre. */
  showMin: boolean
}

const RING_KEY = 'ferme:horloge:minutes'
function loadShowMin(): boolean {
  try { return localStorage.getItem(RING_KEY) !== '0' } catch { return true }
}
function saveShowMin(on: boolean) {
  try { localStorage.setItem(RING_KEY, on ? '1' : '0') } catch { /* stockage bloqué : le choix vaut pour la partie */ }
}

/** L'icône de l'interrupteur : un cadran et sa couronne de minutes. */
const RING_ICON = `<svg class="ck-mini" viewBox="0 0 100 100" aria-hidden="true">
  <circle cx="50" cy="50" r="46" fill="#FFE1DB"/>
  ${Array.from({ length: 12 }, (_, i) => { const a = (i * 30 - 90) * Math.PI / 180; return `<circle cx="${50 + 40 * Math.cos(a)}" cy="${50 + 40 * Math.sin(a)}" r="5" fill="#FF7B6B"/>` }).join('')}
  <circle cx="50" cy="50" r="30" fill="#FFFDF8" stroke="#FFB84D" stroke-width="5"/>
  <path d="M50 50 L50 30 M50 50 L64 50" stroke="#45362A" stroke-width="6" stroke-linecap="round"/>
</svg>`

let ck: State | null = null
let ctx: GameContext

/** Une petite horloge dessinée pour les boutons : on y voit QUELLE aiguille
    compte (la courte, la longue, les deux), plus un badge pour le geste. */
function miniClock(o: { hour?: boolean; minute?: boolean; badge?: string }): string {
  const hand = (len: number, ang: number, col: string, w: number) => {
    const a = (ang - 90) * Math.PI / 180
    return `<line x1="24" y1="24" x2="${24 + len * Math.cos(a)}" y2="${24 + len * Math.sin(a)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`
  }
  return `<svg class="ck-mini" viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="21" fill="#FFFDF8" stroke="#FFB84D" stroke-width="4"/>
    ${o.hour ? hand(10, 120, '#45362A', 5.5) : ''}${o.minute ? hand(16, 0, '#FF7B6B', 3.6) : ''}
    <circle cx="24" cy="24" r="3" fill="#45362A"/>
    ${o.badge ? `<g transform="translate(26 26) scale(.9)"><circle cx="11" cy="11" r="11" fill="#fff"/><g transform="translate(1 1) scale(.83)" color="#45362A">${o.badge.replace('width="1em" height="1em"', 'width="24" height="24"')}</g></g>` : ''}
  </svg>`
}

/* Chaque mode porte SON mot : l'icône dit le geste, le mot le confirme. */
const MODES: { id: Mode; icon: string; cap: string }[] = [
  { id: 'discover', icon: miniClock({ hour: true, minute: true, badge: ICON.search }), cap: 'Découvre' },
  { id: 'hours', icon: miniClock({ hour: true }), cap: 'Heures' },
  { id: 'minutes', icon: miniClock({ minute: true }), cap: 'Minutes' },
  { id: 'quiz', icon: miniClock({ hour: true, minute: true, badge: ICON.target }), cap: 'Trouve' },
  { id: 'set', icon: miniClock({ hour: true, minute: true, badge: ICON.tap }), cap: 'Règle' }
]

const MINUS = '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>'
const PLUS = '<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path d="M5 12h14M12 5v14" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>'

function clockSVG(h: number, m: number, px: number, o: FaceOpts = {}): string {
  const hourAngle = ((h % 12) + m / 60) * 30 - 90
  const minAngle = m * 6 - 90
  const rad = (a: number) => (a * Math.PI) / 180
  const hx = 100 + 38 * Math.cos(rad(hourAngle)), hy = 100 + 38 * Math.sin(rad(hourAngle))
  const mx = 100 + 60 * Math.cos(rad(minAngle)), my = 100 + 60 * Math.sin(rad(minAngle))
  let nums = '', ticks = '', ring = ''
  for (let i = 1; i <= 12; i++) {
    const a = rad(i * 30 - 90)
    nums += `<text x="${100 + 70 * Math.cos(a)}" y="${100 + 70 * Math.sin(a) + 6.5}"
      text-anchor="middle" font-size="17" font-weight="800" font-family="Baloo 2" fill="#45362A">${i}</text>`
    if (o.minuteRing) {
      const mm = (i * 5) % 60
      ring += `<text x="${100 + 89 * Math.cos(a)}" y="${100 + 89 * Math.sin(a) + 4}"
        text-anchor="middle" font-size="9.5" font-weight="700" font-family="Baloo 2" fill="#FF7B6B">${String(mm).padStart(2, '0')}</text>`
    }
  }
  for (let i = 0; i < 60; i += 5) {
    const a = rad(i * 6 - 90)
    ticks += `<line x1="${100 + 80 * Math.cos(a)}" y1="${100 + 80 * Math.sin(a)}"
      x2="${100 + 84 * Math.cos(a)}" y2="${100 + 84 * Math.sin(a)}" stroke="#8A7A6B" stroke-width="2.6" stroke-linecap="round"/>`
  }
  return `<svg viewBox="0 0 200 200" width="${px}" height="${px}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="100" cy="100" r="97" fill="#FFFDF8" stroke="#FFB84D" stroke-width="6"/>
    ${o.minuteRing ? `<circle cx="100" cy="100" r="85" fill="none" stroke="rgba(255,123,107,.18)" stroke-width="9"/>` : ''}
    ${ticks}${nums}${ring}
    ${o.grab === 'hour' ? `<circle cx="${hx}" cy="${hy}" r="15" fill="rgba(69,54,42,.18)"/>` : ''}
    ${o.grab === 'minute' ? `<circle cx="${mx}" cy="${my}" r="15" fill="rgba(255,123,107,.28)"/>` : ''}
    <g opacity="${o.fadeHour ? 0.2 : 1}">
      <line x1="100" y1="100" x2="${hx}" y2="${hy}" stroke="#45362A" stroke-width="${o.grab === 'hour' ? 10 : 8}" stroke-linecap="round"/>
      <circle cx="${hx}" cy="${hy}" r="${o.grab === 'hour' ? 8 : 6.5}" fill="#45362A"/>
    </g>
    ${o.hideMinute ? '' : `<line x1="100" y1="100" x2="${mx}" y2="${my}" stroke="#FF7B6B" stroke-width="${o.grab === 'minute' ? 6 : 4.5}" stroke-linecap="round"/>
    <circle cx="${mx}" cy="${my}" r="${o.grab === 'minute' ? 7.5 : 6}" fill="#FF7B6B"/>`}
    <circle cx="100" cy="100" r="6.5" fill="#45362A"/>
  </svg>`
}

/** L'heure comme on la dit : « une heure et quart », « midi », « deux heures moins le quart ». */
function timeSpoken(h: number, m: number): string {
  const hourWord = (x: number) => x === 12 ? 'midi' : x === 1 ? 'une heure' : `${x} heures`
  const hh = hourWord(h)
  if (m === 0) return hh
  if (m === 15) return `${hh} et quart`
  if (m === 30) return `${hh} et demie`
  if (m === 45) return `${hourWord((h % 12) + 1)} moins le quart`
  return `${hh} ${m}`
}
const digital = (h: number, m: number) => `${h}:${String(m).padStart(2, '0')}`

function facePx(): number {
  const w = $('ckWrap')
  return Math.max(220, Math.min(w.clientHeight - 130, w.clientWidth - 520))
}

function faceOpts(me: State): FaceOpts {
  if (me.mode === 'minutes') return { minuteRing: me.showMin, fadeHour: true }
  if (me.mode === 'quiz') return { minuteRing: me.showMin && ctx.tier !== 'exp' }
  if (me.mode === 'hours') return {}
  return { minuteRing: me.showMin, grab: me.grab }
}

function renderFace(me: State) {
  $('ckFace').innerHTML = clockSVG(me.h, me.m, facePx(), faceOpts(me))
}

function paintSide(me: State) {
  const quiz = me.mode !== 'discover'
  $('ckDots').style.display = quiz ? '' : 'none'
  $('ckDots').innerHTML = quiz ? Array.from({ length: me.total }, (_, i) => `<i class="sn-dot${i < me.round ? ' on' : ''}"></i>`).join('') : ''
  $('ckScore').style.display = quiz ? '' : 'none'
  $('ckScore').innerHTML = `${ICON.star}<span>${me.score}</span>`
}

function setMode(me: State, mode: Mode) {
  me.mode = mode
  me.round = 0; me.score = 0; me.lock = false
  document.querySelectorAll<HTMLElement>('.ck-tool').forEach(b => {
    const on = b.dataset.m === mode
    b.classList.toggle('sel', on)
    b.parentElement?.classList.toggle('sel', on)
  })
  $('ckDone').parentElement!.style.display = mode === 'discover' ? '' : 'none'
  $('ckCtrl').innerHTML = ''
  $('ckOpts').innerHTML = ''
  if (mode === 'discover') loadDiscover(me)
  if (mode === 'hours') nextHours(me)
  if (mode === 'minutes') nextMinutes(me)
  if (mode === 'quiz') nextQuiz(me)
  if (mode === 'set') nextSet(me)
  paintSide(me)
}

/* ---- Découvre : manipuler et écouter ---- */
function refreshDiscover(me: State) {
  renderFace(me)
  paintDigital(me.h, me.m, false)
}

/** L'heure écrite, en GRAND à côté du cadran (24/09 : « l'heure à trouver est
    marquée en beaucoup trop petit ») : les heures dans la couleur de la petite
    aiguille, les minutes dans celle de la grande. */
function paintDigital(h: number, m: number, target: boolean) {
  const el = $('ckDigital')
  el.classList.toggle('target', target)
  el.innerHTML = `${target ? `<span class="ck-tg">${ICON.target}</span>` : ''}<span class="h">${h}</span><span class="x">:</span><span class="m">${String(m).padStart(2, '0')}</span>`
}
/** Les réglages : une rangée par aiguille (− le dessin de l'aiguille +),
    et en Règle un gros bouton vert pour valider. */
function adjustButtons(me: State, withCheck: boolean) {
  const row = (k: Hand) => `
    <div class="ck-row ck-row-${k}">
      <button class="ck-pm" data-k="${k}" data-d="-1" aria-label="${k === 'hour' ? 'Heure' : 'Minutes'} moins">${MINUS}</button>
      ${miniClock(k === 'hour' ? { hour: true } : { minute: true })}
      <button class="ck-pm" data-k="${k}" data-d="1" aria-label="${k === 'hour' ? 'Heure' : 'Minutes'} plus">${PLUS}</button>
    </div>`
  $('ckCtrl').innerHTML = row('hour') + row('minute') + (withCheck
    ? `<span class="tool-item ck-valid"><button class="ck-check" id="ckCheck" aria-label="Valide">${ICON.check}</button><i class="tool-cap">Valide</i></span>`
    : '')
  $('ckCtrl').querySelectorAll<HTMLElement>('.ck-pm').forEach(b => {
    b.onclick = () => {
      if (ck !== me || me.lock) return
      const d = +b.dataset.d!
      if (b.dataset.k === 'hour') {
        me.h = ((me.h - 1 + d + 12) % 12) + 1
        sfx('tick', { vol: 0.4, rate: 1.2 })
      } else {
        me.m += 5 * d
        // Découvre : une vraie horloge, la grande aiguille entraîne la petite
        if (me.m >= 60) { me.m -= 60; if (me.mode === 'discover') me.h = (me.h % 12) + 1 }
        if (me.m < 0) { me.m += 60; if (me.mode === 'discover') me.h = ((me.h + 10) % 12) + 1 }
        sfx('tick', { vol: 0.4, rate: 1.5 })
      }
      me.touched++
      afterAdjust(me)
    }
  })
  if (withCheck) ($('ckCheck') as HTMLButtonElement).onclick = () => checkSet(me)
}
function afterAdjust(me: State) {
  if (me.mode === 'discover') { refreshDiscover(me); ctx.say(timeSpoken(me.h, me.m)) }
  else renderFace(me)
}
function loadDiscover(me: State) {
  me.h = 3; me.m = 0; me.touched = 0
  $('ckDigital').style.display = ''
  adjustButtons(me, false)
  refreshDiscover(me)
}

/* ---- Quiz (heures / minutes / complet) ---- */
function askOptions(me: State, opts: string[], good: string, onDone: () => void) {
  const box = $('ckOpts')
  box.innerHTML = ''
  shuffle([...opts]).forEach(t => {
    const b = document.createElement('button')
    b.className = 'qopt'
    b.textContent = t
    b.onclick = () => {
      if (ck !== me || me.lock) return
      me.lock = true
      if (t === good) { b.classList.add('good'); me.score++; sfx('confirm', { vol: 0.7 }); fxAt(b, JUICE.warm, 12) }
      else {
        b.classList.add('bad'); sfx('drop', { vol: 0.4, rate: 0.8 })
        document.querySelectorAll<HTMLButtonElement>('.qopt').forEach(x => { if (x.textContent === good) x.classList.add('good') })
      }
      paintSide(me)
      onDone()
    }
    box.appendChild(b)
  })
}

function advance(me: State, next: (me: State) => void) {
  me.round++
  paintSide(me)
  ctx.after(1500, () => {
    if (ck !== me) return
    if (me.round < me.total) next(me)
    else finishQuizMode(me)
  })
}

function nextHours(me: State) {
  me.total = 8
  me.h = rnd(1, 12); me.m = 0
  $('ckDigital').style.display = 'none'
  renderFace(me)
  const opts = new Set([String(me.h)])
  while (opts.size < 3) opts.add(String(rnd(1, 12)))
  askOptions(me, [...opts].map(x => x + ' h'), me.h + ' h', () => { ctx.say(timeSpoken(me.h, 0)); advance(me, nextHours) })
  me.lock = false
}

function nextMinutes(me: State) {
  me.total = 8
  const mins = ctx.byTier([0, 15, 30, 45], [0, 5, 10, 15, 20, 30, 40, 45, 50], [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])
  me.h = rnd(1, 12); me.m = mins[rnd(0, mins.length - 1)]
  $('ckDigital').style.display = 'none'
  renderFace(me)
  const opts = new Set([String(me.m)])
  while (opts.size < 4) opts.add(String(mins[rnd(0, mins.length - 1)]))
  askOptions(me, [...opts].map(x => x + ' min'), me.m + ' min', () => {
    ctx.say(me.m === 0 ? 'zéro minute' : `${me.m} minutes`)
    advance(me, nextMinutes)
  })
  me.lock = false
}

function nextQuiz(me: State) {
  me.total = 8
  const mins = ctx.byTier([0], [0, 30], [0, 15, 30, 45])
  me.h = rnd(1, 12); me.m = mins[rnd(0, mins.length - 1)]
  $('ckDigital').style.display = 'none'
  renderFace(me)
  const opts = new Set([digital(me.h, me.m)])
  let guard = 0
  while (opts.size < 4 && guard++ < 60) opts.add(digital(rnd(1, 12), mins[rnd(0, mins.length - 1)]))
  askOptions(me, [...opts], digital(me.h, me.m), () => { ctx.say(timeSpoken(me.h, me.m)); advance(me, nextQuiz) })
  me.lock = false
}

/* ---- Règle l'horloge : elle déplace les aiguilles ---- */
function nextSet(me: State) {
  me.total = 6
  const mins = ctx.byTier([0], [0, 30], [0, 15, 30, 45])
  me.th = rnd(1, 12); me.tm = mins[rnd(0, mins.length - 1)]
  // Pas 12:00 au départ : les deux aiguilles l'une sur l'autre, on ne sait
  // pas laquelle on attrape. Une heure au hasard, jamais la réponse.
  do { me.h = rnd(1, 11); me.m = 0 } while (me.h === me.th && me.m === me.tm)
  $('ckDigital').style.display = ''
  paintDigital(me.th, me.tm, true)
  ctx.say(timeSpoken(me.th, me.tm))
  renderFace(me)
  adjustButtons(me, true)
  me.lock = false
}

function checkSet(me: State) {
  if (ck !== me || me.lock) return
  if (me.h === me.th && me.m === me.tm) {
    me.lock = true
    me.score++
    sfx('confirm', { vol: 0.8 })
    fxAt($('ckFace'), JUICE.green, 16)
    ctx.say(timeSpoken(me.th, me.tm))
    advance(me, nextSet)
  } else {
    sfx('drop', { vol: 0.4, rate: 0.8 })
    const f = $('ckFace')
    f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake')
  }
}

/* Déplacement des aiguilles au doigt (Découvre et Règle). L'aiguille est
   choisie AU TOUCHER et gardée jusqu'au lever du doigt. */
function fingerOnFace(e: PointerEvent): { ang: number; dist: number } | null {
  const svg = $('ckFace').querySelector('svg')
  if (!svg) return null
  const r = svg.getBoundingClientRect()
  const dx = e.clientX - (r.left + r.width / 2)
  const dy = e.clientY - (r.top + r.height / 2)
  return { ang: (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360, dist: Math.hypot(dx, dy) / (r.width / 2) }
}
const angGap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }

/** Quelle aiguille le doigt vient-il de prendre ? */
function pickHand(me: State, e: PointerEvent): Hand | null {
  const f = fingerOnFace(e)
  if (!f || f.dist > 1.08 || f.dist < 0.08) return null
  const dh = angGap(f.ang, ((me.h % 12) + me.m / 60) * 30)
  const dm = angGap(f.ang, me.m * 6)
  // Les deux aiguilles dans la même direction : la courte près du centre
  if (Math.abs(dh - dm) < 25 && Math.min(dh, dm) < 40) return f.dist < 0.5 ? 'hour' : 'minute'
  if (Math.min(dh, dm) < 45) return dh < dm ? 'hour' : 'minute'
  // Loin des deux : la zone décide (le centre pour les heures, le bord pour les minutes)
  return f.dist < 0.5 ? 'hour' : 'minute'
}

function dragHand(me: State, e: PointerEvent) {
  if (!me.grab) return
  const f = fingerOnFace(e)
  if (!f || f.dist < 0.06) return
  if (me.grab === 'hour') {
    // La petite aiguille avance aussi avec les minutes : on retire ce décalage
    const h = Math.round((f.ang - me.m * 0.5) / 30 + 12) % 12 || 12
    if (h === me.h) return
    me.h = h
    sfx('tick', { vol: 0.3, rate: 1.2 })
  } else {
    const m = (Math.round(f.ang / 30) * 5) % 60
    if (m === me.m) return
    // Découvre : passer le 12 fait avancer (ou reculer) l'heure, comme une vraie horloge
    if (me.mode === 'discover') {
      if (me.m >= 45 && m <= 15) me.h = (me.h % 12) + 1
      else if (me.m <= 15 && m >= 45) me.h = ((me.h + 10) % 12) + 1
    }
    me.m = m
    sfx('tick', { vol: 0.3, rate: 1.5 })
  }
  me.touched++
  renderFace(me)
  if (me.mode === 'discover') $('ckDigital').textContent = digital(me.h, me.m)
}

function finishQuizMode(me: State) {
  const names: Record<Mode, string> = { discover: '', hours: 'heures', minutes: 'minutes', quiz: 'heures complètes', set: 'horloges réglées' }
  const stars = me.score >= me.total - 1 ? 3 : me.score >= me.total - 3 ? 2 : 1
  ctx.finish({
    title: 'Maîtresse du temps !',
    msg: `${me.score} sur ${me.total} ${names[me.mode]}`,
    stars
  })
}

export const clock: GameDef = {
  id: 'clock', name: 'Quelle heure ?', icon: '🕐', sq: 'sq-sun', cat: 'reflexion',
  subtitle: 'Découvre, apprends les aiguilles, puis règle l\'horloge toi-même',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="arena ck-wrap" id="ckWrap">
        <div class="ck-main">
          <div id="ckFace"></div>
          <div class="qopts ck-opts" id="ckOpts"></div>
        </div>
        <div class="ck-right">
          <div class="ck-digital" id="ckDigital"></div>
          <div class="ck-ctrl" id="ckCtrl"></div>
        </div>
        <div class="tq-tools">
          ${MODES.map((m, i) => `<span class="tool-item${i === 0 ? ' sel' : ''}">
            <button class="sn-tool ck-tool${i === 0 ? ' sel' : ''}" data-m="${m.id}" aria-label="${m.cap}">${m.icon}</button>
            <i class="tool-cap">${m.cap}</i></span>`).join('')}
        </div>
        <div class="tq-side">
          <span class="tool-item ck-ringitem" id="ckRingItem"><button class="sn-tool ck-ringbtn" id="ckRing" aria-label="Les minutes du cadran">${RING_ICON}</button><i class="tool-cap">5 10 15</i></span>
          <div class="tq-moves" id="ckScore"></div>
          <div class="mem-dots" id="ckDots"></div>
          <span class="tool-item"><button class="sn-tool go ck-done" id="ckDone" aria-label="Fini">${ICON.check}</button><i class="tool-cap">Fini</i></span>
        </div>
      </div>`
    preloadSfx(['tick', 'confirm', 'drop'])
    const me: State = { mode: 'discover', h: 3, m: 0, th: 3, tm: 0, round: 0, total: 8, score: 0, lock: false, touched: 0, grab: null, showMin: loadShowMin() }
    ck = me
    const paintRing = () => {
      $('ckRing').classList.toggle('sel', me.showMin)
      $('ckRingItem').classList.toggle('sel', me.showMin)
    }
    paintRing()
    ;($('ckRing') as HTMLButtonElement).onclick = () => {
      if (ck !== me) return
      me.showMin = !me.showMin
      saveShowMin(me.showMin)
      sfx('click', { vol: 0.4, rate: me.showMin ? 1.2 : 0.9 })
      paintRing()
      renderFace(me)
    }
    document.querySelectorAll<HTMLElement>('.ck-tool').forEach(b => {
      b.onclick = () => { if (ck === me) { sfx('click', { vol: 0.4 }); setMode(me, b.dataset.m as Mode) } }
    })
    ;($('ckDone') as HTMLButtonElement).onclick = () => {
      if (ck !== me || me.mode !== 'discover') return
      ctx.finish({
        title: 'Belle découverte !',
        msg: `Tu as fait tourner les aiguilles ${me.touched} fois`,
        stars: 3
      })
    }
    const face = $('ckFace')
    const pd = (e: PointerEvent) => {
      if (me.lock || (me.mode !== 'set' && me.mode !== 'discover')) return
      me.grab = pickHand(me, e)
      if (!me.grab) return
      e.preventDefault()
      sfx('click', { vol: 0.3, rate: me.grab === 'hour' ? 0.9 : 1.3 })
      renderFace(me)
      dragHand(me, e)
    }
    const pm = (e: PointerEvent) => { if (me.grab) dragHand(me, e) }
    const pu = () => {
      if (!me.grab || ck !== me) return
      me.grab = null
      renderFace(me)
      if (me.mode === 'discover') ctx.say(timeSpoken(me.h, me.m))
    }
    const onResize = () => { if (ck === me) renderFace(me) }
    face.addEventListener('pointerdown', pd)
    window.addEventListener('pointermove', pm)
    window.addEventListener('pointerup', pu)
    window.addEventListener('pointercancel', pu)
    window.addEventListener('resize', onResize)
    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __ck: unknown }).__ck = {
        get h() { return me.h }, get m() { return me.m }, get th() { return me.th }, get tm() { return me.tm }, get grab() { return me.grab }, get mode() { return me.mode }, get round() { return me.round }, get score() { return me.score }, get lock() { return me.lock }
      }
    }
    setMode(me, 'discover')
    return () => {
      if (ck === me) ck = null
      face.removeEventListener('pointerdown', pd)
      window.removeEventListener('pointermove', pm)
      window.removeEventListener('pointerup', pu)
      window.removeEventListener('pointercancel', pu)
      window.removeEventListener('resize', onResize)
    }
  }
}
