import type { GameContext, GameDef } from '../core/types'
import { $, rnd, shuffle } from '../core/utils'
import { sGood, sNope, sPop, sWin } from '../core/audio'
import { fxAt, JUICE } from '../core/fx'

/* Quelle heure ? — apprendre à LIRE l'heure pas à pas, en 5 modes :
   🔎 Découvre (manipule l'horloge, elle dit l'heure),
   🕐 Les heures (la petite aiguille seule),
   ⏱ Les minutes (la grande aiguille + anneau des minutes),
   🎯 Quiz (lire l'heure complète),
   🤲 Règle (déplacer les aiguilles pour faire l'heure demandée).
   La voix ne lit que les heures (du contenu, jamais de consignes). */

interface FaceOpts {
  minuteRing?: boolean // anneau 5,10,…60 autour du cadran
  hideMinute?: boolean // concentre sur la petite aiguille
  fadeHour?: boolean   // concentre sur la grande aiguille
}

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

function timeSpoken(h: number, m: number): string {
  const hh = `${h} heure${h > 1 ? 's' : ''}`
  if (m === 0) return hh
  if (m === 15) return `${hh} et quart`
  if (m === 30) return `${hh} et demie`
  if (m === 45) return `${(h % 12) + 1} heures moins le quart`
  return `${hh} ${m}`
}
const digital = (h: number, m: number) => `${h}:${String(m).padStart(2, '0')}`

const MODE_SUBS: Record<string, string> = {
  discover: 'Appuie sur les boutons : regarde les aiguilles bouger et écoute l\'heure',
  hours: 'La PETITE aiguille noire montre les heures — quelle heure est-il ?',
  minutes: 'La GRANDE aiguille rouge montre les minutes — combien de minutes ?',
  quiz: 'Lis l\'horloge en entier et choisis la bonne heure',
  set: 'Déplace les aiguilles avec ton doigt pour faire l\'heure demandée !'
}

let ck: any = null
let ctx: GameContext

function facePx() { return Math.min(250, window.innerWidth * 0.58) }

function renderFace(o: FaceOpts = {}) {
  $('ckFace').innerHTML = clockSVG(ck.h, ck.m, facePx(), o)
}

function setMode(mode: string) {
  ck.mode = mode
  ck.round = 0; ck.score = 0; ck.mistakes = 0; ck.lock = false
  document.querySelectorAll<HTMLElement>('.ck-mode').forEach(b => b.classList.toggle('sel', b.dataset.m === mode))
  $('ckSub').textContent = MODE_SUBS[mode]
  $('ckRound').style.display = mode === 'discover' ? 'none' : ''
  $('ckScore').style.display = mode === 'discover' ? 'none' : ''
  $('ckDone').style.display = mode === 'discover' ? '' : 'none'
  if (mode === 'discover') loadDiscover()
  if (mode === 'hours') nextHours()
  if (mode === 'minutes') nextMinutes()
  if (mode === 'quiz') nextQuiz()
  if (mode === 'set') nextSet()
}

/* ---- 🔎 Découvre : manipuler et écouter ---- */
function refreshDiscover() {
  renderFace({ minuteRing: true })
  $('ckDigital').textContent = digital(ck.h, ck.m)
}
function loadDiscover() {
  ck.h = 3; ck.m = 0; ck.touched = 0
  $('ckDigital').style.display = ''
  // Les boutons sont créés UNE fois : seuls le cadran et l'affichage bougent
  $('ckOpts').innerHTML = `
    <button class="ck-btn" id="ckPlusH">+1 heure 🕐</button>
    <button class="ck-btn ck-btn-min" id="ckPlusM">+5 minutes ⏱</button>`
  ;($('ckPlusH') as HTMLButtonElement).onclick = () => {
    if (!ck || !ck.running) return
    ck.h = (ck.h % 12) + 1; ck.touched++
    sPop(); refreshDiscover(); ctx.say(timeSpoken(ck.h, ck.m))
  }
  ;($('ckPlusM') as HTMLButtonElement).onclick = () => {
    if (!ck || !ck.running) return
    ck.m += 5; ck.touched++
    if (ck.m >= 60) { ck.m = 0; ck.h = (ck.h % 12) + 1 }
    sPop(); refreshDiscover(); ctx.say(timeSpoken(ck.h, ck.m))
  }
  refreshDiscover()
}

/* ---- Quiz génériques (heures / minutes / complet) ---- */
function askOptions(opts: string[], good: string, onGood: () => void) {
  const box = $('ckOpts')
  box.innerHTML = ''
  shuffle([...opts]).forEach(t => {
    const b = document.createElement('button')
    b.className = 'qopt'
    b.textContent = t
    b.onclick = () => {
      if (!ck || !ck.running || ck.lock) return
      ck.lock = true
      if (t === good) { b.classList.add('good'); ck.score++; sGood(); fxAt(b, JUICE.warm, 12); onGood() }
      else {
        b.classList.add('bad'); sNope()
        document.querySelectorAll<HTMLButtonElement>('.qopt').forEach(x => { if (x.textContent === good) x.classList.add('good') })
        onGood()
      }
      $('ckScore').textContent = '⭐ ' + ck.score
    }
    box.appendChild(b)
  })
}

function advance(next: () => void) {
  ck.round++
  setTimeout(() => {
    if (!ck || !ck.running) return
    if (ck.round < ck.total) next()
    else finishQuizMode()
  }, 1500)
}

function nextHours() {
  ck.total = 8
  ck.h = rnd(1, 12); ck.m = 0
  $('ckRound').textContent = `${ck.round + 1}/${ck.total}`
  $('ckDigital').style.display = 'none'
  renderFace({ hideMinute: false })
  const opts = new Set([String(ck.h)])
  while (opts.size < 3) opts.add(String(rnd(1, 12)))
  askOptions([...opts].map(x => x + ' h'), ck.h + ' h', () => {
    ctx.say(timeSpoken(ck.h, 0))
    advance(nextHours)
  })
  ck.lock = false
}

function nextMinutes() {
  ck.total = 8
  const mins = ctx.byTier([0, 15, 30, 45], [0, 5, 10, 15, 20, 30, 40, 45, 50], [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])
  ck.h = rnd(1, 12); ck.m = mins[rnd(0, mins.length - 1)]
  $('ckRound').textContent = `${ck.round + 1}/${ck.total}`
  $('ckDigital').style.display = 'none'
  renderFace({ minuteRing: true, fadeHour: true })
  const opts = new Set([String(ck.m)])
  while (opts.size < 4) opts.add(String(mins[rnd(0, mins.length - 1)]))
  askOptions([...opts].map(x => x + ' min'), ck.m + ' min', () => {
    ctx.say(ck.m === 0 ? 'zéro minute' : `${ck.m} minutes`)
    advance(nextMinutes)
  })
  ck.lock = false
}

function nextQuiz() {
  ck.total = 8
  const mins = ctx.byTier([0], [0, 30], [0, 15, 30, 45])
  ck.h = rnd(1, 12); ck.m = mins[rnd(0, mins.length - 1)]
  $('ckRound').textContent = `${ck.round + 1}/${ck.total}`
  $('ckDigital').style.display = 'none'
  renderFace({ minuteRing: ctx.tier !== 'exp' })
  const opts = new Set([digital(ck.h, ck.m)])
  let guard = 0
  while (opts.size < 4 && guard++ < 60) opts.add(digital(rnd(1, 12), mins[rnd(0, mins.length - 1)]))
  askOptions([...opts], digital(ck.h, ck.m), () => {
    ctx.say(timeSpoken(ck.h, ck.m))
    advance(nextQuiz)
  })
  ck.lock = false
}

/* ---- 🤲 Règle l'horloge : elle déplace les aiguilles ---- */
function nextSet() {
  ck.total = 6
  const mins = ctx.byTier([0], [0, 30], [0, 15, 30, 45])
  ck.th = rnd(1, 12); ck.tm = mins[rnd(0, mins.length - 1)]
  ck.h = 12; ck.m = 0
  $('ckRound').textContent = `${ck.round + 1}/${ck.total}`
  $('ckDigital').style.display = ''
  $('ckDigital').textContent = '🎯 ' + digital(ck.th, ck.tm)
  renderFace({ minuteRing: true })
  $('ckOpts').innerHTML = `
    <button class="ck-btn" id="ckPlusH">+1 heure 🕐</button>
    <button class="ck-btn ck-btn-min" id="ckPlusM">+5 minutes ⏱</button>
    <button class="ck-btn ck-check" id="ckCheck">✔ C'est ça !</button>`
  ;($('ckPlusH') as HTMLButtonElement).onclick = () => { if (ck && ck.running) { ck.h = (ck.h % 12) + 1; sPop(); renderFace({ minuteRing: true }) } }
  ;($('ckPlusM') as HTMLButtonElement).onclick = () => {
    if (!ck || !ck.running) return
    ck.m = (ck.m + 5) % 60
    sPop(); renderFace({ minuteRing: true })
  }
  ;($('ckCheck') as HTMLButtonElement).onclick = checkSet
  ck.lock = false
}

function checkSet() {
  if (!ck || !ck.running || ck.lock) return
  if (ck.h === ck.th && ck.m === ck.tm) {
    ck.lock = true
    ck.score++; sGood()
    fxAt($('ckFace'), JUICE.green, 16)
    ctx.say(timeSpoken(ck.th, ck.tm))
    $('ckScore').textContent = '⭐ ' + ck.score
    advance(nextSet)
  } else {
    ck.mistakes++; sNope()
    const f = $('ckFace')
    f.classList.remove('shake'); void (f as any).offsetWidth; f.classList.add('shake')
  }
}

/* Déplacement des aiguilles au doigt (mode Règle) :
   près du centre = petite aiguille (heures), vers le bord = grande (minutes) */
function dragHands(e: PointerEvent) {
  if (!ck || !ck.running || ck.mode !== 'set') return
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
    if (h !== ck.h) { ck.h = h; sPop(); renderFace({ minuteRing: true }) }
  } else {
    const m = (Math.round(ang / 30) * 5) % 60
    if (m !== ck.m) { ck.m = m; sPop(); renderFace({ minuteRing: true }) }
  }
}

/* ---- Fins de partie ---- */
function finishQuizMode() {
  sWin()
  const names: Record<string, string> = { hours: 'heures 🕐', minutes: 'minutes ⏱', quiz: 'heures complètes 🎯', set: 'horloges réglées 🤲' }
  const stars = ck.score >= ck.total - 1 ? 3 : ck.score >= ck.total - 3 ? 2 : 1
  ctx.finish({
    title: 'Maîtresse du temps !',
    msg: `${ctx.playerName} : ${ck.score}/${ck.total} ${names[ck.mode]}`,
    stars, starsEarned: stars
  })
}

export const clock: GameDef = {
  id: 'clock', name: 'Quelle heure ?', icon: '🕐', sq: 'sq-sun', cat: 'reflexion',
  subtitle: 'Découvre, apprends les aiguilles, puis règle l\'horloge toi-même',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <button class="chip ck-mode sel" data-m="discover">🔎</button>
        <button class="chip ck-mode" data-m="hours">🕐</button>
        <button class="chip ck-mode" data-m="minutes">⏱</button>
        <button class="chip ck-mode" data-m="quiz">🎯</button>
        <button class="chip ck-mode" data-m="set">🤲</button>
        <div class="chip" id="ckRound">1/8</div>
        <div class="chip" id="ckScore">⭐ 0</div>
      </div>
      <div class="gsub" id="ckSub"></div>
      <div class="panel ck-box">
        <div class="ck-digital" id="ckDigital"></div>
        <div id="ckFace"></div>
        <div class="qopts ck-opts" id="ckOpts"></div>
      </div>
      <button class="bigbtn primary" id="ckDone" style="margin-top:10px">✨ J'ai bien regardé !</button>`
    ck = { mode: 'discover', h: 3, m: 0, round: 0, total: 8, score: 0, mistakes: 0, lock: false, running: true, touched: 0 }
    document.querySelectorAll<HTMLElement>('.ck-mode').forEach(b => {
      b.onclick = () => ck && ck.running && setMode(b.dataset.m!)
    })
    ;($('ckDone') as HTMLButtonElement).onclick = () => {
      if (!ck || !ck.running || ck.mode !== 'discover') return
      sWin()
      ctx.finish({
        title: 'Belle découverte !',
        msg: `${ctx.playerName} a fait tourner les aiguilles ${ck.touched} fois 🔎`,
        stars: 3, starsEarned: 3
      })
    }
    const face = $('ckFace')
    let dragging = false
    const pd = (e: PointerEvent) => { dragging = true; dragHands(e) }
    const pm = (e: PointerEvent) => { if (dragging) dragHands(e) }
    const pu = () => { dragging = false }
    face.addEventListener('pointerdown', pd)
    window.addEventListener('pointermove', pm)
    window.addEventListener('pointerup', pu)
    setMode('discover')
    return () => {
      if (ck) { ck.running = false; ck = null }
      face.removeEventListener('pointerdown', pd)
      window.removeEventListener('pointermove', pm)
      window.removeEventListener('pointerup', pu)
    }
  }
}
