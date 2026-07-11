import type { GameContext, GameDef } from '../core/types'
import { $, faceSprite, pick } from '../core/utils'
import { sJump, sNope, sWin } from '../core/audio'
import { FX } from '../core/fx'

const RUN_OBST = ['🌾', '🪨', '🛢️', '🧱']
let run: any = null
let ctx: GameContext

function loop(t: number) {
  if (!run || !run.running) return
  const dt = Math.min(50, t - run.lastT); run.lastT = t
  const w = run.area.clientWidth
  if (run.jumping) {
    run.y += run.vy * dt
    run.vy -= 0.0032 * dt
    if (run.y <= 0) { run.y = 0; run.jumping = false; run.vy = 0 }
    run.tractor.style.bottom = run.groundH + run.y + 'px'
  }
  run.dist += run.speed * dt * 0.06
  run.speed += dt * 0.0000075
  const d = Math.floor(run.dist)
  $('runDist').textContent = d + ' m'
  $('runScore').textContent = '🚜 ' + d + ' m'
  run.sinceSpawn += dt
  if (run.sinceSpawn >= run.nextSpawn) {
    run.sinceSpawn = 0
    run.nextSpawn = run.cfg.gapMin + Math.random() * run.cfg.gapVar
    const el = document.createElement('div')
    el.className = 'obst'; el.textContent = pick(RUN_OBST)
    el.style.bottom = run.groundH + 'px'
    run.area.appendChild(el)
    run.obstacles.push({ el, x: w + 40 })
  }
  if (run.invuln > 0) { run.invuln -= dt; run.tractor.style.opacity = Math.floor(t / 90) % 2 ? '0.35' : '1' }
  else run.tractor.style.opacity = '1'
  const tx = 52 + 26, tw = 30
  for (let i = run.obstacles.length - 1; i >= 0; i--) {
    const o = run.obstacles[i]
    o.x -= run.speed * dt
    o.el.style.transform = `translateX(${o.x}px)`
    const overlapX = Math.abs(o.x + 21 - tx) < tw + 16
    const onGroundLevel = run.y < 34
    if (overlapX && onGroundLevel && run.invuln <= 0) {
      run.lives--; run.invuln = 1200
      $('runHearts').textContent = '❤️'.repeat(run.lives) + '🖤'.repeat(3 - run.lives)
      run.area.classList.remove('hitflash'); void run.area.offsetWidth; run.area.classList.add('hitflash')
      sNope(); FX.shake(8)
      if (run.lives <= 0) { finish(); return }
    }
    if (o.x < -60) { o.el.remove(); run.obstacles.splice(i, 1) }
  }
  requestAnimationFrame(loop)
}

function finish() {
  const d = run ? Math.floor(run.dist) : 0
  sWin()
  const th = ctx.byTier([140, 70], [180, 100], [220, 120])
  const stars = d >= th[0] ? 3 : d >= th[1] ? 2 : 1
  ctx.finish({ title: 'Fin de course !', msg: `${ctx.playerName} a parcouru ${d} mètres 🚜`, stars, starsEarned: stars })
}

export const runGame: GameDef = {
  id: 'run', name: 'Course', icon: '🚜', sq: 'sq-mint', cat: 'action',
  subtitle: 'Tape ou ESPACE pour sauter les obstacles',
  mount(c) {
    ctx = c
    const rider = c.avatar ? `<span class="rider">${faceSprite(c.avatar, '', 26)}</span>` : ''
    c.root.innerHTML = `
      <div class="topbar">
        <div class="hearts" id="runHearts">❤️❤️❤️</div>
        <div class="chip" id="runScore">🚜 0 m</div>
      </div>
      <div id="runArea">
        <div class="rundist" id="runDist">0 m</div>
        <div id="tractor">${rider}🚜</div>
      </div>`
    const area = $('runArea')
    const cfg = c.byTier(
      { sp: 0.21, gapMin: 1400, gapVar: 900 },
      { sp: 0.27, gapMin: 1150, gapVar: 800 },
      { sp: 0.34, gapMin: 900, gapVar: 700 }
    )
    const groundH = area.clientHeight * 0.45
    run = {
      area, tractor: $('tractor'),
      y: 0, vy: 0, jumping: false, obstacles: [],
      speed: cfg.sp, cfg, dist: 0, lives: 3, running: true,
      lastT: performance.now(), nextSpawn: 900, sinceSpawn: 0,
      groundH, invuln: 0
    }
    run.tractor.style.bottom = groundH + 'px'
    const jump = () => {
      if (!run || !run.running) return
      if (!run.jumping) { run.jumping = true; run.vy = 0.95; sJump() }
    }
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); jump() } }
    const onTap = (e: Event) => { e.preventDefault(); jump() }
    window.addEventListener('keydown', onKey)
    area.addEventListener('pointerdown', onTap)
    requestAnimationFrame(loop)
    return () => {
      if (run) { run.running = false; run.obstacles.forEach((o: any) => o.el.remove()); run = null }
      window.removeEventListener('keydown', onKey)
      area.removeEventListener('pointerdown', onTap)
    }
  }
}
