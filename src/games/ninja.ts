import type { GameContext, GameDef } from '../core/types'
import { $, pick, rnd } from '../core/utils'
import { sNope, sPower, sSlice, sWin } from '../core/audio'
// PixiJS est chargé à la demande (code-splitting) : il ne pèse rien tant
// qu'on n'ouvre pas le Ninja, puis reste en cache hors-ligne (PWA).
let PIXI: any = null

/* Ninja du Verger — pilote « vrai jeu » : rendu WebGL (PixiJS), fruits
   texturés qui tournent, moitiés qui montrent la CHAIR du fruit, jus en
   particules, lame lumineuse, tremblé d'écran. La logique de jeu (combos,
   hérisson, chrono) reste celle validée. */

let nj: any = null
let ctx: GameContext

interface Fruit {
  sp: any
  x: number; y: number; vx: number; vy: number; g: number
  rot: number; vr: number; r: number
  bad: boolean; half: boolean; sliced: boolean
  juice: number; inner?: any
}

function spawnWave(T: any) {
  const n = rnd(nj.cfg.min, nj.cfg.max)
  for (let i = 0; i < n; i++) {
    const bad = Math.random() < nj.cfg.hedge
    const art: any = bad ? null : pick(T.fruits as any[])
    const sp = new PIXI.Sprite(bad ? T.hedgehog : art!.whole)
    sp.anchor.set(0.5)
    const scale = (nj.W < 500 ? 0.62 : 0.78) * (0.9 + Math.random() * 0.25)
    sp.scale.set(scale)
    const x = nj.W * (0.12 + Math.random() * 0.76)
    const peak = nj.H * (0.55 + Math.random() * 0.3)
    const g = 0.0016
    nj.stage.addChild(sp)
    nj.fruits.push({
      sp, x, y: nj.H + 60,
      vx: ((nj.W / 2 - x) / nj.W) * 0.16 + (Math.random() - 0.5) * 0.1,
      vy: -Math.sqrt(2 * g * peak), g,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.004,
      r: 52 * scale, bad, half: false, sliced: false,
      juice: art ? art.juice : 0x8a7a6b, inner: art?.inner
    } as Fruit)
  }
}

function burst(x: number, y: number, color: number, count: number, T: any) {
  for (let i = 0; i < count; i++) {
    const p = new PIXI.Sprite(T.particle)
    p.anchor.set(0.5)
    p.tint = color
    const s = 0.6 + Math.random() * 1.6
    p.scale.set(s)
    nj.stage.addChild(p)
    const a = Math.random() * Math.PI * 2
    const v = 0.08 + Math.random() * 0.28
    nj.parts.push({ sp: p, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.12, life: 1 })
  }
}

function floatText(x: number, y: number, txt: string, color: number) {
  const t = new PIXI.Text(txt, {
    fontFamily: 'Baloo 2, sans-serif', fontWeight: '800', fontSize: 26,
    fill: color, stroke: 0xffffff, strokeThickness: 4
  })
  t.anchor.set(0.5)
  t.x = x; t.y = y
  nj.stage.addChild(t)
  nj.floats.push({ sp: t, y, life: 1 })
}

function updateScore() { $('njScore').textContent = '🥷 ' + nj.score }

function sliceCheck(a: { x: number; y: number }, b: { x: number; y: number }, T: any) {
  for (const f of [...nj.fruits] as Fruit[]) {
    if (f.sliced || f.half) continue
    const dx = b.x - a.x, dy = b.y - a.y
    const len2 = dx * dx + dy * dy || 1
    let t = ((f.x - a.x) * dx + (f.y - a.y) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    const px = a.x + t * dx, py = a.y + t * dy
    if ((f.x - px) ** 2 + (f.y - py) ** 2 > f.r * f.r * 1.4) continue
    f.sliced = true
    if (f.bad) {
      nj.score = Math.max(0, nj.score - 3); sNope()
      nj.shake = 14
      nj.flash = 1
      floatText(f.x, f.y - 30, 'Aïe ! -3', 0xff5a4d)
    } else {
      nj.score++; nj.swipeHits++
      sSlice()
      burst(f.x, f.y, f.juice, 14, T)
      floatText(f.x, f.y - 30, '+1', 0x45362a)
      // Deux vraies moitiés : la face coupée (chair) alignée sur le coup de sabre
      const ang = Math.atan2(dy, dx)
      const base = f.inner!.baseTexture
      const w = base.width, h = base.height
      const tex = [
        new PIXI.Texture(base, new PIXI.Rectangle(0, 0, w, h / 2)),
        new PIXI.Texture(base, new PIXI.Rectangle(0, h / 2, w, h / 2))
      ]
      tex.forEach((tx, k) => {
        const s = k === 0 ? -1 : 1
        const half = new PIXI.Sprite(tx)
        half.anchor.set(0.5, k === 0 ? 1 : 0) // ancré sur le bord coupé
        half.scale.set(f.sp.scale.x)
        half.rotation = ang
        nj.stage.addChild(half)
        const na = ang + Math.PI / 2
        nj.fruits.push({
          sp: half, x: f.x, y: f.y,
          vx: f.vx + Math.cos(na) * 0.12 * s, vy: f.vy + Math.sin(na) * 0.12 * s - 0.05,
          g: f.g, rot: ang, vr: 0.002 * s, r: f.r,
          bad: false, half: true, sliced: true, juice: f.juice
        } as Fruit)
      })
    }
    f.sp.destroy()
    nj.fruits.splice(nj.fruits.indexOf(f), 1)
    updateScore()
  }
}

function drawBlade() {
  const g = nj.blade
  g.clear()
  const pts = nj.bladePts
  if (pts.length < 2) return
  for (let i = 1; i < pts.length; i++) {
    const k = i / pts.length
    g.lineStyle({ width: 12 * k, color: 0x4fb8e7, alpha: 0.35 * k, cap: 'round' as any })
    g.moveTo(pts[i - 1].x, pts[i - 1].y)
    g.lineTo(pts[i].x, pts[i].y)
  }
  for (let i = 1; i < pts.length; i++) {
    const k = i / pts.length
    g.lineStyle({ width: 4 * k, color: 0xffffff, alpha: 0.9 * k, cap: 'round' as any })
    g.moveTo(pts[i - 1].x, pts[i - 1].y)
    g.lineTo(pts[i].x, pts[i].y)
  }
}

function finish() {
  const score = nj ? nj.score : 0
  sWin()
  const th = ctx.byTier([18, 10], [26, 16], [34, 22])
  const stars = score >= th[0] ? 3 : score >= th[1] ? 2 : 1
  ctx.finish({ title: 'Sabre rangé !', msg: `${ctx.playerName} a marqué ${score} points 🥷`, stars, starsEarned: stars })
}

export const ninja: GameDef = {
  id: 'ninja', name: 'Ninja Verger', icon: '🥷', sq: 'sq-pink', cat: 'action',
  subtitle: 'Tranche les fruits d\'un geste — évite le hérisson !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="njScore">🥷 0</div>
        <div class="chip" id="njBest">Combo ×1</div>
      </div>
      <div class="tbar" style="max-width:560px"><div class="tfill" id="njTimer"></div></div>
      <div id="njArea" class="arena nj-arena"><div class="nj-loading">🥷…</div></div>`
    const area = $('njArea')
    const W = area.clientWidth || 400, H = area.clientHeight || 360
    const cfg = c.byTier(
      { spawn: 1500, min: 1, max: 2, hedge: 0.10 },
      { spawn: 1200, min: 1, max: 3, hedge: 0.16 },
      { spawn: 950, min: 2, max: 4, hedge: 0.22 }
    )
    let dead = false
    let app: any = null
    let timer: any = null
    const listeners: [string, any][] = []

    ;(async () => {
      PIXI = PIXI || await import('pixi.js')
      const { loadNinjaTextures } = await import('./ninjaArt')
      const T = await loadNinjaTextures()
      if (dead) return
      app = new PIXI.Application({
        width: W, height: H, backgroundAlpha: 0, antialias: true,
        resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true
      })
      area.querySelector('.nj-loading')?.remove()
      area.appendChild(app.view as HTMLCanvasElement)

      const stage = new PIXI.Container()
      app.stage.addChild(stage)
      const blade = new PIXI.Graphics()
      app.stage.addChild(blade)
      const flash = new PIXI.Graphics()
      flash.beginFill(0xff5a4d).drawRect(0, 0, W, H).endFill()
      flash.alpha = 0
      app.stage.addChild(flash)

      nj = {
        stage, blade, flashG: flash, W, H, cfg,
        fruits: [] as Fruit[], parts: [] as any[], floats: [] as any[],
        score: 0, bestCombo: 1, timeLeft: 60, running: true,
        since: 900, down: false, swipeHits: 0, lastPt: null, bladePts: [],
        shake: 0, flash: 0
      }

      const pos = (e: PointerEvent) => {
        const r = area.getBoundingClientRect()
        return { x: e.clientX - r.left, y: e.clientY - r.top }
      }
      const pd = (e: PointerEvent) => {
        e.preventDefault()
        if (!nj || !nj.running) return
        nj.down = true; nj.swipeHits = 0
        nj.lastPt = pos(e)
        nj.bladePts = [nj.lastPt]
      }
      const pm = (e: PointerEvent) => {
        if (!nj || !nj.down || !nj.running) return
        const p = pos(e)
        nj.bladePts.push(p)
        if (nj.bladePts.length > 16) nj.bladePts.shift()
        sliceCheck(nj.lastPt, p, T)
        nj.lastPt = p
      }
      const pu = () => {
        if (!nj) return
        nj.down = false
        if (nj.swipeHits >= 3) {
          nj.score += nj.swipeHits
          if (nj.swipeHits > nj.bestCombo) {
            nj.bestCombo = nj.swipeHits
            $('njBest').textContent = 'Combo ×' + nj.bestCombo
          }
          floatText(nj.W / 2, nj.H * 0.25, 'COMBO ×' + nj.swipeHits + ' !', 0xff7b6b)
          sPower(); updateScore()
        }
      }
      area.addEventListener('pointerdown', pd); listeners.push(['pointerdown', pd])
      area.addEventListener('pointermove', pm); listeners.push(['pointermove', pm])
      area.addEventListener('pointerup', pu); listeners.push(['pointerup', pu])
      area.addEventListener('pointerleave', pu); listeners.push(['pointerleave', pu])

      timer = setInterval(() => {
        if (!nj || !nj.running) return
        nj.timeLeft--
        $('njTimer').style.width = (nj.timeLeft / 60) * 100 + '%'
        if (nj.timeLeft <= 0) finish()
      }, 1000)

      app.ticker.add(() => {
        if (!nj || !nj.running || !app) return
        const dt = Math.min(40, app.ticker.deltaMS)
        nj.since += dt
        if (nj.since >= nj.cfg.spawn) { nj.since = 0; spawnWave(T) }

        for (let i = nj.fruits.length - 1; i >= 0; i--) {
          const f = nj.fruits[i] as Fruit
          f.x += f.vx * dt; f.y += f.vy * dt; f.vy += f.g * dt
          f.rot += f.vr * dt
          if (f.y > nj.H + 90) { f.sp.destroy(); nj.fruits.splice(i, 1); continue }
          f.sp.x = f.x; f.sp.y = f.y
          f.sp.rotation = f.half ? f.rot : f.rot
        }
        for (let i = nj.parts.length - 1; i >= 0; i--) {
          const p = nj.parts[i]
          p.life -= 0.03 * (dt / 16.7)
          p.vy += 0.012 * (dt / 16.7)
          p.x += p.vx * dt; p.y += p.vy * dt
          if (p.life <= 0) { p.sp.destroy(); nj.parts.splice(i, 1); continue }
          p.sp.x = p.x; p.sp.y = p.y; p.sp.alpha = p.life
        }
        for (let i = nj.floats.length - 1; i >= 0; i--) {
          const t = nj.floats[i]
          t.life -= 0.022 * (dt / 16.7)
          t.y -= 0.05 * dt
          if (t.life <= 0) { t.sp.destroy(); nj.floats.splice(i, 1); continue }
          t.sp.y = t.y; t.sp.alpha = t.life
        }
        // Traînée de lame qui s'évanouit même sans bouger
        if (!nj.down && nj.bladePts.length) nj.bladePts.shift()
        drawBlade()
        // Secousse et flash quand on touche le hérisson
        if (nj.shake > 0) {
          nj.shake -= dt * 0.05
          nj.stage.x = (Math.random() - 0.5) * nj.shake
          nj.stage.y = (Math.random() - 0.5) * nj.shake
        } else { nj.stage.x = 0; nj.stage.y = 0 }
        if (nj.flash > 0) { nj.flash -= dt * 0.004; nj.flashG.alpha = Math.max(0, nj.flash) * 0.4 }
      })
    })()

    return () => {
      dead = true
      if (nj) { nj.running = false; nj = null }
      clearInterval(timer)
      listeners.forEach(([ev, fn]) => area.removeEventListener(ev, fn))
      if (app) { app.destroy(true, { children: true, texture: false, baseTexture: false }); app = null }
    }
  }
}
