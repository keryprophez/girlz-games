import type { GameDef } from '../core/types'
import { $, faceSprite, pick } from '../core/utils'
import { sCatch, sNope, sPower, sWin } from '../core/audio'
import { FX, JUICE } from '../core/fx'

const GOOD = ['🥕', '🥚', '🍅', '🌽', '🍓', '🥔', '🍎', '🫐']
const BAD = ['🪨', '🥾', '🐛', '🍄']
const POWERS = [{ e: '🥚', k: 'x2' }, { e: '🧲', k: 'magnet' }, { e: '⏳', k: 'slow' }]

let catchG: any = null

function tick() {
  if (!catchG || !catchG.running) return
  catchG.timeLeft--
  $('timerFill').style.width = (catchG.timeLeft / 40) * 100 + '%'
  if (catchG.timeLeft === 30 || catchG.timeLeft === 20 || catchG.timeLeft === 10) {
    catchG.wave++
    catchG.baseSpeed *= 1.22
    catchG.spawnEvery = Math.max(430, catchG.spawnEvery * 0.84)
    showWave('Vague ' + catchG.wave + ' !'); sPower()
  }
  if (catchG.timeLeft <= 0) finish()
}

function showWave(txt: string) {
  const w = $('waveMsg')
  w.textContent = txt
  w.classList.remove('show'); void (w as any).offsetWidth; w.classList.add('show')
}

function loop(t: number) {
  if (!catchG || !catchG.running) return
  const dt = Math.min(50, t - catchG.lastT); catchG.lastT = t
  const A = catchG.area, w = A.clientWidth, h = A.clientHeight
  const kv = 0.55
  if (catchG.keys.left) { catchG.basketX = Math.max(28, catchG.basketX - kv * dt); catchG.basket.style.left = catchG.basketX + 'px' }
  if (catchG.keys.right) { catchG.basketX = Math.min(w - 28, catchG.basketX + kv * dt); catchG.basket.style.left = catchG.basketX + 'px' }
  if (catchG.powerTimer > 0) {
    catchG.powerTimer -= dt
    if (catchG.powerTimer <= 0) {
      catchG.mult = 1; catchG.magnet = false; catchG.slow = false
      $('powerBadge').style.display = 'none'
    }
  }
  const speed = catchG.baseSpeed * (catchG.slow ? 0.5 : 1)
  catchG.lastSpawn += dt
  if (catchG.lastSpawn >= catchG.spawnEvery) { catchG.lastSpawn = 0; spawnItem(w) }
  const bx = catchG.basketX, bw = catchG.magnet ? 92 : 60, catchY = h - 52
  for (let i = catchG.items.length - 1; i >= 0; i--) {
    const it = catchG.items[i]
    it.y += speed * dt
    if (catchG.magnet && it.good) it.x += (bx - it.x) * 0.06
    it.el.style.transform = `translate(${it.x}px,${it.y}px)`
    if (it.y >= catchY && it.y <= catchY + 54 && Math.abs(it.x - bx) < bw) {
      handleCatch(it); it.el.remove(); catchG.items.splice(i, 1); continue
    }
    if (it.y > h + 40) { if (it.good) catchG.combo = 0; it.el.remove(); catchG.items.splice(i, 1) }
  }
  requestAnimationFrame(loop)
}

function handleCatch(it: any) {
  if (it.power) { activatePower(it.power); sparkAt(it.x); return }
  if (it.good) {
    catchG.combo++
    let pts = 1 * catchG.mult
    if (catchG.combo % 5 === 0) { pts += 2; flashCombo('COMBO ×' + catchG.combo + ' !') }
    catchG.score += pts; sCatch(); sparkAt(it.x)
    const rc = catchG.area.getBoundingClientRect()
    FX.burst(rc.left + it.x, rc.top + rc.height - 58, { colors: JUICE.mix, count: 10, speed: 3 })
  } else {
    catchG.score = Math.max(0, catchG.score - 1); catchG.combo = 0; sNope()
  }
  $('catchScore').textContent = '🧺 ' + catchG.score
}

function activatePower(k: string) {
  sPower(); catchG.powerTimer = 5000
  const badge = $('powerBadge')
  badge.style.display = 'block'
  if (k === 'x2') { catchG.mult = 2; badge.textContent = '⚡ Points ×2' }
  if (k === 'magnet') { catchG.magnet = true; badge.textContent = '🧲 Aimant' }
  if (k === 'slow') { catchG.slow = true; badge.textContent = '⏳ Ralenti' }
}

function spawnItem(w: number) {
  const r = Math.random()
  let good: boolean, emoji: string, power: string | null = null
  if (r < 0.10) { const p = pick(POWERS); emoji = p.e; power = p.k; good = true }
  else if (r < 0.10 + catchG.badChance) { good = false; emoji = pick(BAD) }
  else { good = true; emoji = pick(GOOD) }
  const el = document.createElement('div')
  el.className = 'falling'; el.textContent = emoji
  const x = 24 + Math.random() * (w - 68)
  el.style.transform = `translate(${x}px,-40px)`
  catchG.area.appendChild(el)
  catchG.items.push({ el, x, y: -40, good, power })
}

function sparkAt(x: number) {
  if (!catchG) return
  const s = document.createElement('div')
  s.className = 'spark'; s.textContent = '✨'
  s.style.left = x + 'px'; s.style.bottom = '56px'
  catchG.area.appendChild(s)
  setTimeout(() => s.remove(), 600)
}

function flashCombo(txt: string) {
  const c = $('comboMsg') as any
  c.textContent = txt; c.style.opacity = '1'
  clearTimeout(c._h); c._h = setTimeout(() => (c.style.opacity = '0'), 700)
}

let finishCb: any = null
function finish() {
  const score = catchG ? catchG.score : 0
  const ctx = catchG.ctx
  sWin()
  const stars = score >= 28 ? 3 : score >= 14 ? 2 : 1
  finishCb?.()
  ctx.finish({ title: 'Belle récolte !', msg: `${ctx.playerName} a ramassé ${score} bonnes choses 🧺`, stars, starsEarned: stars })
}

export const catchGame: GameDef = {
  id: 'catch', name: 'Attrape', icon: '🧺', sq: 'sq-sky', cat: 'action',
  subtitle: 'Attrape la récolte, évite les bêtises',
  mount(ctx) {
    ctx.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="catchScore">🧺 0</div>
      </div>
      <div class="tbar"><div class="tfill" id="timerFill"></div></div>
      <div id="catchArea">
        <div class="hint">Glisse n'importe où · flèches ⬅️ ➡️ (maintiens !)</div>
        <div class="powerbadge" id="powerBadge"></div>
        <div class="combo" id="comboMsg"></div>
        <div class="wavemsg" id="waveMsg"></div>
        <div id="basket">${faceSprite(ctx.avatar, '🧺', 46)}${ctx.avatar ? '<span class="basket-under">🧺</span>' : ''}</div>
      </div>`
    const area = $('catchArea')
    const cfg = ctx.byTier(
      { sp: 0.13, spawn: 1000, bad: 0.17 },
      { sp: 0.18, spawn: 780, bad: 0.25 },
      { sp: 0.24, spawn: 620, bad: 0.32 }
    )
    catchG = {
      ctx, area, basket: $('basket'),
      score: 0, combo: 0, basketX: area.clientWidth / 2, items: [],
      baseSpeed: cfg.sp, spawnEvery: cfg.spawn, badChance: cfg.bad,
      lastSpawn: 0, timeLeft: 40, running: true, lastT: performance.now(),
      wave: 1, mult: 1, magnet: false, slow: false, powerTimer: 0,
      keys: { left: false, right: false }
    }
    catchG.basket.style.left = catchG.basketX + 'px'
    showWave('Vague 1 !')
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (!catchG || !catchG.running) return
      if (e.key === 'ArrowLeft') { catchG.keys.left = down; e.preventDefault() }
      if (e.key === 'ArrowRight') { catchG.keys.right = down; e.preventDefault() }
    }
    const kd = (e: KeyboardEvent) => onKey(e, true)
    const ku = (e: KeyboardEvent) => onKey(e, false)
    const pm = (e: any) => {
      if (!catchG || !catchG.running) return
      const cx = e.touches ? e.touches[0].clientX : e.clientX
      const rect = catchG.area.getBoundingClientRect()
      const x = Math.max(28, Math.min(rect.width - 28, cx - rect.left))
      catchG.basketX = x; catchG.basket.style.left = x + 'px'
    }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('pointermove', pm)
    window.addEventListener('touchmove', pm, { passive: true })
    const timer = setInterval(tick, 1000)
    const cleanup = () => {
      if (catchG) { catchG.running = false; catchG.items.forEach((it: any) => it.el.remove()); catchG = null }
      clearInterval(timer)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      window.removeEventListener('pointermove', pm)
      window.removeEventListener('touchmove', pm)
    }
    finishCb = cleanup
    requestAnimationFrame(loop)
    return cleanup
  }
}
