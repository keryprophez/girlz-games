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
   - aucune sanction : pas de vies, pas de chrono ; timers de partie. */

type Mode = 'discover' | 'hours' | 'minutes' | 'quiz' | 'set'
interface FaceOpts { minuteRing?: boolean; hideMinute?: boolean; fadeHour?: boolean }

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
}

let ck: State | null = null
let ctx: GameContext

/* Chaque mode porte SON mot : l'icône dit le geste, le mot le confirme. */
const MODES: { id: Mode; icon: string; cap: string }[] = [
  { id: 'discover', icon: ICON.search, cap: 'Découvre' },
  { id: 'hours', icon: ICON.clock, cap: 'Heures' },
  { id: 'minutes', icon: ICON.timer, cap: 'Minutes' },
  { id: 'quiz', icon: ICON.target, cap: 'Trouve' },
  { id: 'set', icon: ICON.tap, cap: 'Règle' }
]

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
    <line x1="100" y1="100" x2="${hx}" y2="${hy}" stroke="#45362A" stroke-width="8" stroke-linecap="round" opacity="${o.fadeHour ? 0.2 : 1}"/>
    ${o.hideMinute ? '' : `<line x1="100" y1="100" x2="${mx}" y2="${my}" stroke="#FF7B6B" stroke-width="4.5" stroke-linecap="round"/>`}
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
  return Math.max(220, Math.min(w.clientHeight - 150, w.clientWidth - 320))
}

function faceOpts(me: State): FaceOpts {
  if (me.mode === 'minutes') return { minuteRing: true, fadeHour: true }
  if (me.mode === 'quiz') return { minuteRing: ctx.tier !== 'exp' }
  if (me.mode === 'hours') return {}
  return { minuteRing: true }
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
  $('ckDone').style.display = mode === 'discover' ? '' : 'none'
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
  $('ckDigital').textContent = digital(me.h, me.m)
}
function adjustButtons(me: State, withCheck: boolean) {
  $('ckOpts').innerHTML = `
    <button class="ck-btn" id="ckPlusH">+1 ${ICON.clock}</button>
    <button class="ck-btn ck-btn-min" id="ckPlusM">+5 ${ICON.timer}</button>
    ${withCheck ? `<button class="ck-btn ck-check" id="ckCheck">${ICON.check}</button>` : ''}`
  ;($('ckPlusH') as HTMLButtonElement).onclick = () => {
    if (ck !== me || me.lock) return
    me.h = (me.h % 12) + 1; me.touched++
    sfx('tick', { vol: 0.4, rate: 1.2 })
    afterAdjust(me)
  }
  ;($('ckPlusM') as HTMLButtonElement).onclick = () => {
    if (ck !== me || me.lock) return
    me.m += 5; me.touched++
    if (me.m >= 60) { me.m = 0; me.h = (me.h % 12) + 1 }
    sfx('tick', { vol: 0.4, rate: 1.5 })
    afterAdjust(me)
  }
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
  me.h = 12; me.m = 0
  $('ckDigital').style.display = ''
  $('ckDigital').innerHTML = `${ICON.target} ${digital(me.th, me.tm)}`
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

/* Déplacement des aiguilles au doigt (Découvre et Règle) :
   près du centre = petite aiguille (heures), vers le bord = grande (minutes) */
function dragHands(me: State, e: PointerEvent) {
  if (me.mode !== 'set' && me.mode !== 'discover') return
  const svg = $('ckFace').querySelector('svg')
  if (!svg) return
  const r = svg.getBoundingClientRect()
  const dx = e.clientX - (r.left + r.width / 2)
  const dy = e.clientY - (r.top + r.height / 2)
  const dist = Math.hypot(dx, dy) / (r.width / 2)
  if (dist > 1.05 || dist < 0.06) return
  const ang = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360
  if (dist < 0.45) {
    const h = Math.round(ang / 30) % 12 || 12
    if (h !== me.h) { me.h = h; sfx('tick', { vol: 0.3, rate: 1.2 }); me.touched++; renderFace(me); if (me.mode === 'discover') $('ckDigital').textContent = digital(me.h, me.m) }
  } else {
    const m = (Math.round(ang / 30) * 5) % 60
    if (m !== me.m) { me.m = m; sfx('tick', { vol: 0.3, rate: 1.5 }); me.touched++; renderFace(me); if (me.mode === 'discover') $('ckDigital').textContent = digital(me.h, me.m) }
  }
}

function finishQuizMode(me: State) {
  const names: Record<Mode, string> = { discover: '', hours: 'heures', minutes: 'minutes', quiz: 'heures complètes', set: 'horloges réglées' }
  const stars = me.score >= me.total - 1 ? 3 : me.score >= me.total - 3 ? 2 : 1
  ctx.finish({
    title: 'Maîtresse du temps !',
    msg: `${ctx.playerName} : ${me.score} sur ${me.total} ${names[me.mode]}`,
    stars, starsEarned: stars
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
          <div class="ck-digital" id="ckDigital"></div>
          <div id="ckFace"></div>
          <div class="qopts ck-opts" id="ckOpts"></div>
        </div>
        <div class="tq-tools">
          ${MODES.map((m, i) => `<span class="tool-item${i === 0 ? ' sel' : ''}">
            <button class="sn-tool ck-tool${i === 0 ? ' sel' : ''}" data-m="${m.id}" aria-label="${m.cap}">${m.icon}</button>
            <i class="tool-cap">${m.cap}</i></span>`).join('')}
        </div>
        <div class="tq-side">
          <div class="tq-moves" id="ckScore"></div>
          <div class="mem-dots" id="ckDots"></div>
          <button class="sn-tool go" id="ckDone" aria-label="Fini">${ICON.check}</button>
        </div>
      </div>`
    preloadSfx(['tick', 'confirm', 'drop'])
    const me: State = { mode: 'discover', h: 3, m: 0, th: 3, tm: 0, round: 0, total: 8, score: 0, lock: false, touched: 0 }
    ck = me
    document.querySelectorAll<HTMLElement>('.ck-tool').forEach(b => {
      b.onclick = () => { if (ck === me) { sfx('click', { vol: 0.4 }); setMode(me, b.dataset.m as Mode) } }
    })
    ;($('ckDone') as HTMLButtonElement).onclick = () => {
      if (ck !== me || me.mode !== 'discover') return
      ctx.finish({
        title: 'Belle découverte !',
        msg: `${ctx.playerName} a fait tourner les aiguilles ${me.touched} fois`,
        stars: 3, starsEarned: 3
      })
    }
    const face = $('ckFace')
    let dragging = false
    const pd = (e: PointerEvent) => { dragging = true; dragHands(me, e) }
    const pm = (e: PointerEvent) => { if (dragging) dragHands(me, e) }
    const pu = () => {
      if (dragging && me.mode === 'discover' && ck === me) ctx.say(timeSpoken(me.h, me.m))
      dragging = false
    }
    const onResize = () => { if (ck === me) renderFace(me) }
    face.addEventListener('pointerdown', pd)
    window.addEventListener('pointermove', pm)
    window.addEventListener('pointerup', pu)
    window.addEventListener('resize', onResize)
    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __ck: unknown }).__ck = {
        get h() { return me.h }, get m() { return me.m }, get mode() { return me.mode }, get round() { return me.round }, get score() { return me.score }, get lock() { return me.lock }
      }
    }
    setMode(me, 'discover')
    return () => {
      if (ck === me) ck = null
      face.removeEventListener('pointerdown', pd)
      window.removeEventListener('pointermove', pm)
      window.removeEventListener('pointerup', pu)
      window.removeEventListener('resize', onResize)
    }
  }
}
