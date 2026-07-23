import type { GameContext, GameDef } from '../core/types'
import { $, shuffle } from '../core/utils'
import { sBonk, sHit, sMoo, sWin, tone } from '../core/audio'
import { FX } from '../core/fx'

/* Chamboule-Tout — le stand de fête foraine ! Une balle se balade toute
   seule en bas : tape au bon moment pour la lancer sur la pyramide de
   boîtes. Les boîtes du dessus dégringolent en cascade. La vache fait meuh
   quand elle tombe. */

const CAN_W = 54, CAN_H = 62
const ANIMALS = ['🐮', '🐷', '🐔', '🐑', '🐰', '🦆']

let ct: any = null
let ctx: GameContext

function buildPyramid() {
  const area = ct.area
  area.querySelectorAll('.ct-can').forEach((e: Element) => e.remove())
  const W = area.clientWidth
  const S = Math.min(66, W / 5.6)
  ct.spacing = S
  const cx = W / 2
  const shelfY = area.clientHeight * 0.52
  const faces = shuffle([...ANIMALS])
  // 3 en bas, 2 au milieu, 1 en haut — chaque boîte sait sur qui elle repose
  const defs = [
    { id: 'b0', x: cx - S, y: shelfY, on: [] }, { id: 'b1', x: cx, y: shelfY, on: [] }, { id: 'b2', x: cx + S, y: shelfY, on: [] },
    { id: 'mL', x: cx - S / 2, y: shelfY - CAN_H + 4, on: ['b0', 'b1'] },
    { id: 'mR', x: cx + S / 2, y: shelfY - CAN_H + 4, on: ['b1', 'b2'] },
    { id: 'top', x: cx, y: shelfY - 2 * CAN_H + 8, on: ['mL', 'mR'] }
  ]
  ct.cans = defs.map((d, i) => {
    const el = document.createElement('div')
    el.className = 'ct-can'
    el.style.left = d.x - CAN_W / 2 + 'px'
    el.style.top = d.y - CAN_H + 'px'
    el.innerHTML = `<span>${faces[i]}</span>`
    area.appendChild(el)
    return { ...d, el, up: true, face: faces[i] }
  })
}

function fall(can: any, delay: number) {
  if (!can.up) return
  can.up = false
  ct.score++
  setTimeout(() => {
    if (!ct || !ct.running) return
    can.el.classList.add(Math.random() < 0.5 ? 'ct-fall-l' : 'ct-fall-r')
    sBonk()
    if (can.face === '🐮') setTimeout(sMoo, 150)
    const r = can.el.getBoundingClientRect()
    FX.burst(r.left + r.width / 2, r.top + r.height / 2, { colors: ['#FFD34D', '#FFF', '#FF9E7A'], count: 7 })
    $('ctScore').textContent = `🎯 ${ct.score}`
    // Cascade : celles qui reposaient dessus dégringolent
    ct.cans.filter((c: any) => c.up && c.on.includes(can.id)).forEach((c: any, i: number) => fall(c, 130 + i * 90))
  }, delay)
}

function throwBall() {
  if (!ct || !ct.running || ct.throwing || ct.throws <= 0) return
  ct.throwing = true
  const x = ct.ballX
  tone(340, 0.12, 'triangle', 0.1); tone(520, 0.1, 'sine', 0.08)
  const ball = $('ctBall')
  const area = ct.area
  const y0 = area.clientHeight - 34
  const y1 = area.clientHeight * 0.52 - CAN_H / 2
  const t0 = performance.now()
  const D = 420
  const anim = (now: number) => {
    if (!ct || !ct.running) return
    const k = Math.min(1, (now - t0) / D)
    ball.style.top = y0 + (y1 - y0) * k + 'px'
    ball.style.transform = `translateX(-50%) scale(${1 - k * 0.35}) rotate(${k * 300}deg)`
    if (k < 1) { requestAnimationFrame(anim); return }
    // Impact : la boîte du bas la plus proche (si assez bien visé)
    const target = ct.cans.find((c: any) => c.on.length === 0 && c.up && Math.abs(c.x - x) < ct.spacing * 0.42)
    if (target) { sHit(); fall(target, 0) }
    else { tone(200, 0.15, 'sine', 0.08); ctx.toast('Loupé ! 😄') }
    ct.throws--
    $('ctThrows').textContent = '🎾'.repeat(ct.throws) || '—'
    setTimeout(() => {
      if (!ct || !ct.running) return
      ball.style.top = area.clientHeight - 34 + 'px'
      ball.style.transform = 'translateX(-50%)'
      ct.throwing = false
      const standing = ct.cans.filter((c: any) => c.up).length
      if (standing === 0) {
        tone(660, 0.14, 'sine', 0.12); setTimeout(() => tone(880, 0.18, 'sine', 0.12), 120)
        ctx.toast('STRIKE ! Tout est tombé ! 🎉')
      }
      if (standing === 0 || ct.throws <= 0) nextPyramid()
    }, 750)
  }
  requestAnimationFrame(anim)
}

function nextPyramid() {
  ct.round++
  if (ct.round >= ct.rounds) { finish(); return }
  ct.throws = ct.throwsPer
  $('ctThrows').textContent = '🎾'.repeat(ct.throws)
  ctx.toast('Nouvelle pyramide !')
  setTimeout(() => ct && ct.running && buildPyramid(), 500)
}

function finish() {
  sWin()
  const total = ct.rounds * 6
  const stars = ct.score >= total - 1 ? 3 : ct.score >= Math.ceil(total * 0.6) ? 2 : 1
  ctx.finish({
    title: 'Quel bras !',
    msg: `${ctx.playerName} a fait tomber ${ct.score} boîtes sur ${total} 🎪`,
    stars: stars as 1 | 2 | 3, starsEarned: stars
  })
}

export const chamboule: GameDef = {
  id: 'chamboule', name: 'Chamboule-Tout', icon: '🎪', sq: 'sq-sun', cat: 'action',
  subtitle: 'Tape au bon moment pour lancer la balle sur les boîtes !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="ctScore">🎯 0</div>
        <div class="chip" id="ctThrows"></div>
      </div>
      <div class="arena ct-arena" id="ctArena">
        <div class="ct-bunting">🚩🚩🚩🚩🚩🚩🚩🚩</div>
        <div class="hint">Tape pour lancer la balle !</div>
        <div class="ct-shelf"></div>
        <div class="ct-ball" id="ctBall"></div>
      </div>`
    const area = $('ctArena')
    ct = {
      area, cans: [], score: 0, round: 0, throwing: false, running: true,
      rounds: 2, throwsPer: c.byTier(4, 3, 3),
      ballSpeed: c.byTier(120, 170, 230), ballX: 40, ballDir: 1
    }
    ct.throws = ct.throwsPer
    $('ctThrows').textContent = '🎾'.repeat(ct.throws)
    buildPyramid()
    // La balle se balade en bas — taper = lancer
    const ball = $('ctBall')
    ball.style.top = area.clientHeight - 34 + 'px'
    let last = performance.now()
    const glide = (now: number) => {
      if (!ct || !ct.running) return
      const dt = (now - last) / 1000; last = now
      if (!ct.throwing) {
        const W = area.clientWidth
        ct.ballX += ct.ballDir * ct.ballSpeed * dt
        if (ct.ballX > W - 30) { ct.ballX = W - 30; ct.ballDir = -1 }
        if (ct.ballX < 30) { ct.ballX = 30; ct.ballDir = 1 }
        ball.style.left = ct.ballX + 'px'
      }
      ct.raf = requestAnimationFrame(glide)
    }
    ct.raf = requestAnimationFrame(glide)
    area.onpointerdown = throwBall
    return () => { if (ct) { ct.running = false; cancelAnimationFrame(ct.raf); ct = null } }
  }
}
