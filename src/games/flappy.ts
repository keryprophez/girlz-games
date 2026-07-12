import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { chickSVG } from '../core/character'
import { sCatch, sJump, sNope, sWin } from '../core/audio'
import { FX } from '../core/fx'

let fl: any = null
let ctx: GameContext

function spawnPipe() {
  const gap = fl.H * fl.cfg.gap
  const gy = fl.H * 0.10 + Math.random() * (fl.H * 0.68 - gap - fl.groundH)
  const topEl = document.createElement('div')
  topEl.className = 'fl-pipe top'
  topEl.innerHTML = `<div class="fl-pipe-body" style="flex:1"></div><div class="fl-pipe-cap"></div>`
  topEl.style.height = gy + 'px'
  topEl.style.left = fl.W + 'px'
  fl.area.appendChild(topEl)

  const botEl = document.createElement('div')
  const botH = fl.H - fl.groundH - gy - gap
  botEl.className = 'fl-pipe bot'
  botEl.innerHTML = `<div class="fl-pipe-cap"></div><div class="fl-pipe-body" style="height:${botH}px"></div>`
  botEl.style.left = fl.W + 'px'
  fl.area.appendChild(botEl)

  fl.pipes.push({ topEl, botEl, x: fl.W, gy, gap, counted: false })
}

function loop(t: number) {
  if (!fl || !fl.running) return
  const dt = Math.min(40, t - fl.lastT); fl.lastT = t
  const { W, H, groundH, cfg, chick } = fl
  const cx = W * 0.22, r = 18

  if (fl.started) { fl.vy += 0.0014 * dt; fl.y += fl.vy * dt }
  else fl.y = H * 0.45 + Math.sin(t * 0.004) * 8

  if (fl.y < r) { fl.y = r; fl.vy = 0 }
  const floor = groundH + r + 4
  if (fl.y > H - floor) { fl.y = H - floor; if (fl.started) hit(); if (fl) fl.vy = -0.25 }
  if (!fl) return

  chick.style.bottom = fl.y - r + 'px'
  chick.style.transform = 'rotate(' + Math.max(-30, Math.min(50, (fl.vy || 0) * 90)) + 'deg)'
  if (fl.invuln > 0) { fl.invuln -= dt; chick.style.opacity = Math.floor(t / 90) % 2 ? '0.35' : '1' }
  else chick.style.opacity = '1'

  const lastX = fl.pipes.length ? fl.pipes[fl.pipes.length - 1].x : -1e9
  if (fl.started && (fl.pipes.length === 0 || lastX < W - W * cfg.space)) spawnPipe()

  const pw = 52
  for (let i = fl.pipes.length - 1; i >= 0; i--) {
    const p = fl.pipes[i]
    p.x -= cfg.sp * dt
    p.topEl.style.left = p.x + 'px'
    p.botEl.style.left = p.x + 'px'
    if (!p.counted && p.x + pw < cx - r) {
      p.counted = true; fl.score++; sCatch()
      $('flScore').textContent = '🐤 ' + fl.score
    }
    const chickY = H - fl.y
    if (fl.invuln <= 0 && p.x < cx + r && p.x + pw > cx - r) {
      if (chickY - r < p.gy || chickY + r > p.gy + p.gap) hit()
      if (!fl) return
    }
    if (p.x < -70) { p.topEl.remove(); p.botEl.remove(); fl.pipes.splice(i, 1) }
  }

  fl.area.querySelectorAll('.fl-cloud').forEach((c: any) => {
    let cx2 = parseFloat(c.style.left) - cfg.sp * dt * 0.3
    if (cx2 < -50) cx2 = W + 50
    c.style.left = cx2 + 'px'
  })

  requestAnimationFrame(loop)
}

function hit() {
  if (!fl || fl.invuln > 0) return
  fl.lives--; fl.invuln = 1200; sNope(); FX.shake(7)
  fl.area.classList.remove('hitflash'); void fl.area.offsetWidth; fl.area.classList.add('hitflash')
  $('flHearts').textContent = '❤️'.repeat(fl.lives) + '🖤'.repeat(3 - fl.lives)
  if (fl.lives <= 0) { fl.running = false; setTimeout(finish, 400) }
}

function finish() {
  const score = fl ? fl.score : 0
  sWin()
  const th = ctx.byTier([10, 6], [14, 8], [18, 11])
  const stars = score >= th[0] ? 3 : score >= th[1] ? 2 : 1
  ctx.finish({ title: 'Bel envol !', msg: `${ctx.playerName} a passé ${score} barrières 🐤`, stars, starsEarned: stars })
}

export const flappy: GameDef = {
  id: 'flappy', name: 'Poussin Volant', icon: '🐤', sq: 'sq-lilac', cat: 'action',
  subtitle: 'Tape ou ESPACE pour battre des ailes !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="hearts" id="flHearts">❤️❤️❤️</div>
        <div class="chip" id="flScore">🐤 0</div>
      </div>
      <div id="flArea" class="arena fl-arena">
        <div class="fl-ground"></div>
        <div class="fl-chick" id="flChick">${chickSVG(c.avatar, c.look, 56)}</div>
        <div class="fl-start" id="flStart">Tape pour voler !</div>
      </div>`
    const area = $('flArea')
    const chick = $('flChick')
    const startMsg = $('flStart')
    const W = area.clientWidth || 400, H = area.clientHeight || 360
    const groundH = H * 0.22
    const cfg = c.byTier(
      { gap: 0.36, sp: 0.15, space: 0.66 },
      { gap: 0.31, sp: 0.19, space: 0.58 },
      { gap: 0.26, sp: 0.23, space: 0.5 }
    )
    fl = {
      area, chick, W, H, groundH, cfg, y: H * 0.45, vy: 0, score: 0, lives: 3,
      running: true, started: false, pipes: [], lastT: performance.now(), invuln: 0
    }
    chick.style.bottom = H * 0.45 + 'px'
    chick.style.transform = 'rotate(0deg)'
    for (let i = 0; i < 4; i++) {
      const cl = document.createElement('div')
      cl.className = 'fl-cloud'; cl.textContent = '☁️'
      cl.style.left = Math.random() * W + 'px'
      cl.style.top = H * 0.06 + Math.random() * H * 0.32 + 'px'
      cl.style.fontSize = 14 + Math.random() * 14 + 'px'
      area.appendChild(cl)
    }
    const flap = (e?: Event) => {
      if (e) e.preventDefault()
      if (!fl || !fl.running) return
      fl.started = true; fl.vy = -0.40; sJump()
      startMsg.style.display = 'none'
    }
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.key === 'ArrowUp') flap(e) }
    area.addEventListener('pointerdown', flap)
    window.addEventListener('keydown', onKey)
    requestAnimationFrame(loop)
    return () => {
      if (fl) { fl.running = false; fl.pipes.forEach((p: any) => { p.topEl.remove(); p.botEl.remove() }); fl = null }
      area.removeEventListener('pointerdown', flap)
      window.removeEventListener('keydown', onKey)
    }
  }
}
