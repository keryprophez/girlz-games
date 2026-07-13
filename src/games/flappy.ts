import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { chickSVG } from '../core/character'
import { sCatch, sJump, sNope, sWin } from '../core/audio'
import { FX } from '../core/fx'
// PixiJS chargé à la demande (code-splitting), comme pour le Ninja
let PIXI: any = null

/* Poussin Volant — version « vrai jeu » : rendu WebGL, tuyaux dessinés avec
   relief, nuages moelleux, sol herbeux, plumes en particules quand ça touche.
   La physique validée (y depuis le haut, gravité, plafond/sol) ne change pas. */

let fl: any = null
let ctx: GameContext

function pipeGraphics(h: number, capAtBottom: boolean): any {
  const w = 52
  const g = new PIXI.Graphics()
  g.beginFill(0x66bb55); g.lineStyle(3, 0x3e8c30)
  g.drawRoundedRect(4, 0, w - 8, h, 5); g.endFill()
  g.lineStyle(0)
  g.beginFill(0x8fd87a, 0.55); g.drawRoundedRect(9, 4, 9, Math.max(4, h - 8), 4); g.endFill()
  g.beginFill(0x57a848); g.lineStyle(3, 0x3e8c30)
  g.drawRoundedRect(0, capAtBottom ? h - 18 : 0, w, 18, 6); g.endFill()
  return g
}

function cloudGraphics(scale: number): any {
  const g = new PIXI.Graphics()
  g.beginFill(0xffffff, 0.85)
  g.drawEllipse(0, 0, 26, 13); g.drawEllipse(-16, 5, 16, 9); g.drawEllipse(17, 4, 18, 10)
  g.endFill()
  g.scale.set(scale)
  return g
}

function spawnPipe() {
  const gap = fl.H * fl.cfg.gap
  // Le passage peut être n'importe où entre le ciel et le sol
  const groundTop = fl.H - fl.groundH
  const gy = fl.H * 0.06 + Math.random() * (groundTop - gap - fl.H * 0.12)
  const top = pipeGraphics(gy, true)
  top.x = fl.W; top.y = 0
  const botH = groundTop - gy - gap
  const bot = pipeGraphics(botH, false)
  bot.x = fl.W; bot.y = gy + gap
  fl.pipeLayer.addChild(top)
  fl.pipeLayer.addChild(bot)
  fl.pipes.push({ top, bot, x: fl.W, gy, gap, counted: false })
}

function feathers(x: number, y: number) {
  for (let i = 0; i < 10; i++) {
    const p = new PIXI.Sprite(fl.particleT)
    p.anchor.set(0.5)
    p.tint = i % 3 ? 0xffd44d : 0xffffff
    p.scale.set(0.7 + Math.random() * 1.5)
    fl.stage.addChild(p)
    const a = Math.random() * Math.PI * 2
    const v = 0.06 + Math.random() * 0.2
    fl.parts.push({ sp: p, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.1, life: 1 })
  }
}

function hit() {
  if (!fl || fl.invuln > 0) return
  fl.lives--; fl.invuln = 1200; sNope(); FX.shake(7)
  feathers(fl.chick.x, fl.chick.y)
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
        <div class="nj-loading">🐤…</div>
        <div class="fl-start" id="flStart">Tape pour voler !</div>
      </div>`
    const area = $('flArea')
    const startMsg = $('flStart')
    const W = area.clientWidth || 400, H = area.clientHeight || 360
    const groundH = H * 0.22
    const cfg = c.byTier(
      { gap: 0.36, sp: 0.15, space: 0.66 },
      { gap: 0.31, sp: 0.19, space: 0.58 },
      { gap: 0.26, sp: 0.23, space: 0.5 }
    )
    let dead = false
    let app: any = null
    const listeners: [any, string, any][] = []

    ;(async () => {
      PIXI = PIXI || await import('pixi.js')
      const { texFromSVG, particleTex } = await import('./pixiKit')
      const chickT = await texFromSVG(chickSVG(c.avatar, c.look, 56), 128, 138)
      if (dead) return
      app = new PIXI.Application({
        width: W, height: H, backgroundAlpha: 0, antialias: true,
        resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true
      })
      area.querySelector('.nj-loading')?.remove()
      area.appendChild(app.view as HTMLCanvasElement)
      const stage = new PIXI.Container()
      app.stage.addChild(stage)

      // Le sol : terre + bande d'herbe + touffes
      const groundTop = H - groundH
      const ground = new PIXI.Graphics()
      ground.beginFill(0xd9a05b); ground.drawRect(0, groundTop, W, groundH); ground.endFill()
      ground.beginFill(0x6fbf5a); ground.drawRect(0, groundTop, W, 14); ground.endFill()
      for (let x = 8; x < W; x += 26) {
        ground.beginFill(0x57a848)
        ground.moveTo(x, groundTop); ground.lineTo(x + 5, groundTop - 9); ground.lineTo(x + 10, groundTop)
        ground.endFill()
      }
      for (let x = 20; x < W; x += 70) {
        ground.beginFill(0xff8fa8); ground.drawCircle(x, groundTop + 30 + (x % 3) * 8, 4); ground.endFill()
        ground.beginFill(0xffd44d); ground.drawCircle(x + 34, groundTop + 48 - (x % 5) * 4, 3); ground.endFill()
      }

      const clouds: any[] = []
      for (let i = 0; i < 4; i++) {
        const cl = cloudGraphics(0.6 + Math.random() * 0.8)
        cl.x = Math.random() * W
        cl.y = H * 0.08 + Math.random() * H * 0.3
        stage.addChild(cl)
        clouds.push(cl)
      }

      const chick = new PIXI.Sprite(chickT)
      chick.anchor.set(0.5)
      chick.width = 56; chick.height = 60

      // Ordre : nuages derrière, puis tuyaux, sol, poussin devant
      const pipeLayer = new PIXI.Container()
      stage.addChild(pipeLayer)
      stage.addChild(ground)
      stage.addChild(chick)

      fl = {
        stage, pipeLayer, chick, W, H, groundH, cfg, particleT: particleTex(),
        y: H * 0.45, vy: 0, score: 0, lives: 3,
        running: true, started: false, pipes: [], parts: [], clouds, invuln: 0
      }

      const flap = (e?: Event) => {
        if (e) e.preventDefault()
        if (!fl || !fl.running) return
        fl.started = true; fl.vy = -0.40; sJump()
        startMsg.style.display = 'none'
      }
      const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.key === 'ArrowUp') flap(e) }
      area.addEventListener('pointerdown', flap); listeners.push([area, 'pointerdown', flap])
      window.addEventListener('keydown', onKey); listeners.push([window, 'keydown', onKey])

      app.ticker.add(() => {
        if (!fl || !fl.running || !app) return
        const dt = Math.min(40, app.ticker.deltaMS)
        const t = performance.now()
        const cx = W * 0.22, r = 18

        // fl.y est mesuré DEPUIS LE HAUT : la gravité augmente y (le poussin
        // tombe), battre des ailes le diminue (il monte)
        if (fl.started) { fl.vy += 0.0014 * dt; fl.y += fl.vy * dt }
        else fl.y = H * 0.45 + Math.sin(t * 0.004) * 8

        if (fl.y < r) { fl.y = r; fl.vy = 0 } // plafond
        if (fl.y > groundTop - r) { fl.y = groundTop - r; if (fl.started) hit(); if (fl) fl.vy = -0.30 }
        if (!fl) return

        chick.x = cx
        chick.y = fl.y
        chick.rotation = Math.max(-0.52, Math.min(0.87, (fl.vy || 0) * 1.6))
        if (fl.invuln > 0) { fl.invuln -= dt; chick.alpha = Math.floor(t / 90) % 2 ? 0.35 : 1 }
        else chick.alpha = 1

        const lastX = fl.pipes.length ? fl.pipes[fl.pipes.length - 1].x : -1e9
        if (fl.started && (fl.pipes.length === 0 || lastX < W - W * cfg.space)) spawnPipe()

        const pw = 52
        for (let i = fl.pipes.length - 1; i >= 0; i--) {
          const p = fl.pipes[i]
          p.x -= cfg.sp * dt
          p.top.x = p.x
          p.bot.x = p.x
          if (!p.counted && p.x + pw < cx - r) {
            p.counted = true; fl.score++; sCatch()
            $('flScore').textContent = '🐤 ' + fl.score
          }
          if (fl.invuln <= 0 && p.x < cx + r && p.x + pw > cx - r) {
            if (fl.y - r < p.gy || fl.y + r > p.gy + p.gap) hit()
            if (!fl) return
          }
          if (p.x < -70) { p.top.destroy(); p.bot.destroy(); fl.pipes.splice(i, 1) }
        }

        for (const cl of fl.clouds) {
          cl.x -= cfg.sp * dt * 0.3
          if (cl.x < -60) cl.x = W + 60
        }

        for (let i = fl.parts.length - 1; i >= 0; i--) {
          const p = fl.parts[i]
          p.life -= 0.03 * (dt / 16.7)
          p.vy += 0.012 * (dt / 16.7)
          p.x += p.vx * dt; p.y += p.vy * dt
          if (p.life <= 0) { p.sp.destroy(); fl.parts.splice(i, 1); continue }
          p.sp.x = p.x; p.sp.y = p.y; p.sp.alpha = p.life
        }
      })
    })()

    return () => {
      dead = true
      if (fl) { fl.running = false; fl = null }
      listeners.forEach(([tg, ev, fn]) => tg.removeEventListener(ev, fn))
      if (app) { app.destroy(true, { children: true, texture: false, baseTexture: false }); app = null }
    }
  }
}
