import type { GameDef } from '../core/types'
import { $, pick } from '../core/utils'
import { basketSVG } from '../core/character'
import { sCatch, sNope, sPower, sWin } from '../core/audio'
// PixiJS chargé à la demande (code-splitting), comme pour le Ninja
let PIXI: any = null

/* Attrape la Récolte — version « vrai jeu » : rendu WebGL, légumes dessinés
   qui tombent en tournoyant, panier avec la tête de la joueuse, étincelles en
   particules. La logique validée (vagues, bonus, combos) ne change pas. */

let ca: any = null

function tick() {
  if (!ca || !ca.running) return
  ca.timeLeft--
  $('timerFill').style.width = (ca.timeLeft / 40) * 100 + '%'
  if (ca.timeLeft === 30 || ca.timeLeft === 20 || ca.timeLeft === 10) {
    ca.wave++
    ca.baseSpeed *= 1.22
    ca.spawnEvery = Math.max(430, ca.spawnEvery * 0.84)
    showWave('Vague ' + ca.wave + ' !'); sPower()
  }
  if (ca.timeLeft <= 0) finish()
}

function showWave(txt: string) {
  const w = $('waveMsg')
  w.textContent = txt
  w.classList.remove('show'); void (w as any).offsetWidth; w.classList.add('show')
}

function flashCombo(txt: string) {
  const c = $('comboMsg') as any
  c.textContent = txt; c.style.opacity = '1'
  clearTimeout(c._h); c._h = setTimeout(() => (c.style.opacity = '0'), 700)
}

function burst(x: number, y: number, color: number, count: number) {
  for (let i = 0; i < count; i++) {
    const p = new PIXI.Sprite(ca.particleT)
    p.anchor.set(0.5)
    p.tint = color
    p.scale.set(0.6 + Math.random() * 1.4)
    ca.stage.addChild(p)
    const a = Math.random() * Math.PI * 2
    const v = 0.08 + Math.random() * 0.24
    ca.parts.push({ sp: p, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.14, life: 1 })
  }
}

function spawnItem() {
  const r = Math.random()
  let good: boolean, art: any, power: string | null = null
  if (r < 0.10) { const k = pick(['x2', 'magnet', 'slow']); art = ca.T.powers[k]; power = k; good = true }
  else if (r < 0.10 + ca.badChance) { good = false; art = pick(ca.T.bads) }
  else { good = true; art = pick(ca.T.goods) }
  const sp = new PIXI.Sprite(art.tex)
  sp.anchor.set(0.5)
  sp.scale.set(0.52 + Math.random() * 0.1)
  ca.stage.addChild(sp)
  const x = 30 + Math.random() * (ca.W - 60)
  ca.items.push({
    sp, x, y: -40, good, power, tint: art.tint,
    rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.0035
  })
}

function handleCatch(it: any) {
  if (it.power) { activatePower(it.power); burst(it.x, ca.H - 70, 0xffce3c, 12); return }
  if (it.good) {
    ca.combo++
    let pts = 1 * ca.mult
    if (ca.combo % 5 === 0) { pts += 2; flashCombo('COMBO ×' + ca.combo + ' !') }
    ca.score += pts; sCatch()
    burst(it.x, ca.H - 70, it.tint, 10)
    burst(it.x, ca.H - 70, 0xffffff, 4)
  } else {
    ca.score = Math.max(0, ca.score - 1); ca.combo = 0; sNope()
    burst(it.x, ca.H - 70, 0x8a8a8a, 8)
  }
  $('catchScore').textContent = '🧺 ' + ca.score
}

function activatePower(k: string) {
  sPower(); ca.powerTimer = 5000
  const badge = $('powerBadge')
  badge.style.display = 'block'
  if (k === 'x2') { ca.mult = 2; badge.textContent = '⚡ Points ×2' }
  if (k === 'magnet') { ca.magnet = true; badge.textContent = '🧲 Aimant' }
  if (k === 'slow') { ca.slow = true; badge.textContent = '⏳ Ralenti' }
}

function finish() {
  if (!ca) return
  const { score, ctx } = ca
  sWin()
  const stars = score >= 28 ? 3 : score >= 14 ? 2 : 1
  // ctx.finish déclenche le cleanup complet via GameHost
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
        <div class="nj-loading">🧺…</div>
      </div>`
    const area = $('catchArea')
    const cfg = ctx.byTier(
      { sp: 0.13, spawn: 1000, bad: 0.17 },
      { sp: 0.18, spawn: 780, bad: 0.25 },
      { sp: 0.24, spawn: 620, bad: 0.32 }
    )
    let dead = false
    let app: any = null
    let timer: any = null
    const listeners: [any, string, any][] = []

    ;(async () => {
      PIXI = PIXI || await import('pixi.js')
      const [{ texFromSVG, particleTex }, { GOODS_ART, BADS_ART, POWERS_ART }] =
        await Promise.all([import('./pixiKit'), import('./farmArt')])
      const goods = await Promise.all(GOODS_ART.map(async a => ({ tint: a.tint, tex: await texFromSVG(a.svg, 96) })))
      const bads = await Promise.all(BADS_ART.map(async a => ({ tint: a.tint, tex: await texFromSVG(a.svg, 96) })))
      const powers: any = {}
      for (const k of Object.keys(POWERS_ART)) powers[k] = { tint: POWERS_ART[k].tint, tex: await texFromSVG(POWERS_ART[k].svg, 96) }
      const basketT = await texFromSVG(basketSVG(ctx.avatar, ctx.look, 74), 168, 163)
      if (dead) return
      const W = area.clientWidth || 400, H = area.clientHeight || 360
      app = new PIXI.Application({
        width: W, height: H, backgroundAlpha: 0, antialias: true,
        resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true
      })
      area.querySelector('.nj-loading')?.remove()
      area.appendChild(app.view as HTMLCanvasElement)
      const stage = new PIXI.Container()
      app.stage.addChild(stage)

      const basket = new PIXI.Sprite(basketT)
      basket.anchor.set(0.5, 1)
      basket.width = 84; basket.height = 82
      basket.y = H - 4
      stage.addChild(basket)

      ca = {
        ctx, stage, W, H, T: { goods, bads, powers }, particleT: particleTex(), basket,
        score: 0, combo: 0, basketX: W / 2, items: [], parts: [],
        baseSpeed: cfg.sp, spawnEvery: cfg.spawn, badChance: cfg.bad,
        lastSpawn: 0, timeLeft: 40, running: true,
        wave: 1, mult: 1, magnet: false, slow: false, powerTimer: 0,
        keys: { left: false, right: false }
      }
      basket.x = ca.basketX
      showWave('Vague 1 !')

      const onKey = (e: KeyboardEvent, down: boolean) => {
        if (!ca || !ca.running) return
        if (e.key === 'ArrowLeft') { ca.keys.left = down; e.preventDefault() }
        if (e.key === 'ArrowRight') { ca.keys.right = down; e.preventDefault() }
      }
      const kd = (e: KeyboardEvent) => onKey(e, true)
      const ku = (e: KeyboardEvent) => onKey(e, false)
      const pm = (e: any) => {
        if (!ca || !ca.running) return
        const cx = e.touches ? e.touches[0].clientX : e.clientX
        const rect = area.getBoundingClientRect()
        ca.basketX = Math.max(30, Math.min(rect.width - 30, cx - rect.left))
      }
      window.addEventListener('keydown', kd); listeners.push([window, 'keydown', kd])
      window.addEventListener('keyup', ku); listeners.push([window, 'keyup', ku])
      window.addEventListener('pointermove', pm); listeners.push([window, 'pointermove', pm])
      window.addEventListener('touchmove', pm); listeners.push([window, 'touchmove', pm])

      timer = setInterval(tick, 1000)

      app.ticker.add(() => {
        if (!ca || !ca.running || !app) return
        const dt = Math.min(50, app.ticker.deltaMS)
        const kv = 0.55
        if (ca.keys.left) ca.basketX = Math.max(30, ca.basketX - kv * dt)
        if (ca.keys.right) ca.basketX = Math.min(ca.W - 30, ca.basketX + kv * dt)
        // Le panier glisse en douceur vers le doigt
        basket.x += (ca.basketX - basket.x) * Math.min(1, dt * 0.02)
        basket.rotation = Math.max(-0.12, Math.min(0.12, (ca.basketX - basket.x) * 0.004))

        if (ca.powerTimer > 0) {
          ca.powerTimer -= dt
          if (ca.powerTimer <= 0) {
            ca.mult = 1; ca.magnet = false; ca.slow = false
            $('powerBadge').style.display = 'none'
          }
        }
        const speed = ca.baseSpeed * (ca.slow ? 0.5 : 1)
        ca.lastSpawn += dt
        if (ca.lastSpawn >= ca.spawnEvery) { ca.lastSpawn = 0; spawnItem() }

        const bx = basket.x, bw = ca.magnet ? 92 : 62, catchY = ca.H - 56
        for (let i = ca.items.length - 1; i >= 0; i--) {
          const it = ca.items[i]
          it.y += speed * dt
          it.rot += it.vr * dt
          if (ca.magnet && it.good) it.x += (bx - it.x) * 0.06
          it.sp.x = it.x; it.sp.y = it.y; it.sp.rotation = it.rot
          if (it.y >= catchY && it.y <= catchY + 56 && Math.abs(it.x - bx) < bw) {
            handleCatch(it); it.sp.destroy(); ca.items.splice(i, 1); continue
          }
          if (it.y > ca.H + 50) { if (it.good) ca.combo = 0; it.sp.destroy(); ca.items.splice(i, 1) }
        }
        for (let i = ca.parts.length - 1; i >= 0; i--) {
          const p = ca.parts[i]
          p.life -= 0.03 * (dt / 16.7)
          p.vy += 0.012 * (dt / 16.7)
          p.x += p.vx * dt; p.y += p.vy * dt
          if (p.life <= 0) { p.sp.destroy(); ca.parts.splice(i, 1); continue }
          p.sp.x = p.x; p.sp.y = p.y; p.sp.alpha = p.life
        }
      })
    })()

    const cleanup = () => {
      dead = true
      if (ca) { ca.running = false; ca = null }
      clearInterval(timer)
      listeners.forEach(([t, ev, fn]) => t.removeEventListener(ev, fn))
      if (app) { app.destroy(true, { children: true, texture: false, baseTexture: false }); app = null }
    }
    return cleanup
  }
}
