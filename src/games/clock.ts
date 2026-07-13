import type { GameContext, GameDef } from '../core/types'
import { $, rnd, shuffle } from '../core/utils'
import { sGood, sNope, sWin } from '../core/audio'
import { fxAt, JUICE } from '../core/fx'

/* Quelle heure est-il ? — horloge à aiguilles dessinée, réponses en format
   digital (pas de lecture de mots). La voix lit et confirme l'heure. */

function clockSVG(h: number, m: number, px: number): string {
  const hourAngle = ((h % 12) + m / 60) * 30 - 90
  const minAngle = m * 6 - 90
  const rad = (a: number) => (a * Math.PI) / 180
  const hx = 100 + 40 * Math.cos(rad(hourAngle)), hy = 100 + 40 * Math.sin(rad(hourAngle))
  const mx = 100 + 62 * Math.cos(rad(minAngle)), my = 100 + 62 * Math.sin(rad(minAngle))
  let nums = '', ticks = ''
  for (let i = 1; i <= 12; i++) {
    const a = rad(i * 30 - 90)
    nums += `<text x="${100 + 74 * Math.cos(a)}" y="${100 + 74 * Math.sin(a) + 7}"
      text-anchor="middle" font-size="19" font-weight="800" font-family="Baloo 2" fill="#45362A">${i}</text>`
  }
  for (let i = 0; i < 60; i += 5) {
    const a = rad(i * 6 - 90)
    ticks += `<line x1="${100 + 86 * Math.cos(a)}" y1="${100 + 86 * Math.sin(a)}"
      x2="${100 + 91 * Math.cos(a)}" y2="${100 + 91 * Math.sin(a)}" stroke="#8A7A6B" stroke-width="3" stroke-linecap="round"/>`
  }
  return `<svg viewBox="0 0 200 200" width="${px}" height="${px}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="100" cy="100" r="95" fill="#FFFDF8" stroke="#FFB84D" stroke-width="7"/>
    ${ticks}${nums}
    <line x1="100" y1="100" x2="${hx}" y2="${hy}" stroke="#45362A" stroke-width="8" stroke-linecap="round"/>
    <line x1="100" y1="100" x2="${mx}" y2="${my}" stroke="#FF7B6B" stroke-width="5" stroke-linecap="round"/>
    <circle cx="100" cy="100" r="7" fill="#45362A"/>
  </svg>`
}

function timeSpoken(h: number, m: number): string {
  if (m === 0) return `${h} heure${h > 1 ? 's' : ''}`
  if (m === 15) return `${h} heure${h > 1 ? 's' : ''} et quart`
  if (m === 30) return `${h} heure${h > 1 ? 's' : ''} et demie`
  return `${(h % 12) + 1} heures moins le quart`
}
const digital = (h: number, m: number) => `${h}:${String(m).padStart(2, '0')}`

let ck: any = null
let ctx: GameContext

function load() {
  const mins = ctx.byTier([0], [0, 30], [0, 15, 30, 45])
  const h = rnd(1, 12), m = mins[rnd(0, mins.length - 1)]
  ck.h = h; ck.m = m
  $('ckRound').textContent = `${ck.round + 1}/${ck.total}`
  $('ckFace').innerHTML = clockSVG(h, m, Math.min(240, window.innerWidth * 0.55))
  const opts = new Set<string>([digital(h, m)])
  let guard = 0
  while (opts.size < 4 && guard++ < 60) {
    const oh = rnd(1, 12), om = mins[rnd(0, mins.length - 1)]
    opts.add(digital(oh, om))
  }
  const box = $('ckOpts')
  box.innerHTML = ''
  shuffle([...opts]).forEach(t => {
    const b = document.createElement('button')
    b.className = 'qopt'
    b.textContent = t
    b.onclick = () => answer(b, t)
    box.appendChild(b)
  })
  ck.lock = false
}

function answer(b: HTMLButtonElement, t: string) {
  if (!ck || !ck.running || ck.lock) return
  ck.lock = true
  const good = digital(ck.h, ck.m)
  if (t === good) {
    b.classList.add('good'); ck.score++; sGood(); fxAt(b, JUICE.warm, 12)
  } else {
    b.classList.add('bad'); sNope()
    document.querySelectorAll<HTMLButtonElement>('.qopt').forEach(x => { if (x.textContent === good) x.classList.add('good') })
  }
  $('ckScore').textContent = '⭐ ' + ck.score
  ck.round++
  setTimeout(() => {
    if (!ck || !ck.running) return
    if (ck.round < ck.total) load()
    else finish()
  }, 1500)
}

function finish() {
  sWin()
  const stars = ck.score >= ck.total - 1 ? 3 : ck.score >= ck.total - 3 ? 2 : 1
  ctx.finish({
    title: 'Maîtresse du temps !',
    msg: `${ctx.playerName} a lu ${ck.score} heures sur ${ck.total} 🕐`,
    stars, starsEarned: stars
  })
}

export const clock: GameDef = {
  id: 'clock', name: 'Quelle heure ?', icon: '🕐', sq: 'sq-sun', cat: 'reflexion',
  subtitle: 'Lis l\'horloge et choisis la bonne heure',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="ckRound">1/8</div>
        <div class="chip" id="ckScore">⭐ 0</div>
      </div>
      <div class="panel ck-box">
        <div id="ckFace"></div>
        <div class="qopts" id="ckOpts"></div>
      </div>`
    ck = { round: 0, total: 8, score: 0, lock: false, running: true }
    load()
    return () => { if (ck) { ck.running = false; ck = null } }
  }
}
