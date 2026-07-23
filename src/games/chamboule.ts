import type { GameContext, GameDef } from '../core/types'
import { $, shuffle } from '../core/utils'
import { sBonk, sHit, sMoo, sNope, sWin, sWoosh, tone } from '../core/audio'
import { FX } from '../core/fx'
import { shake } from '../core/juice'

/* Chamboule-Tout — VRAIE physique (matter.js) : tire la balle en arrière
   comme un lance-pierre, la trajectoire s'affiche en pointillés, et les
   boîtes culbutent, s'entrechoquent et roulent pour de vrai. La vache fait
   meuh en tombant. */

const CAN_W = 46, CAN_H = 56, BALL_R = 15
const ANIMALS = ['🐮', '🐷', '🐔', '🐑', '🐰', '🦆']
const POW = 0.24          // drag → vitesse
const MAX_V = 32          // vitesse maxi du lancer

let ct: any = null
let ctx: GameContext

function screenPos(x: number, y: number) {
  const r = ct.canvas.getBoundingClientRect()
  return { x: r.left + x, y: r.top + y }
}

function canDown(can: any) {
  if (can.down) return
  can.down = true
  ct.score++
  sBonk()
  if (can.face === '🐮') setTimeout(sMoo, 120)
  const p = screenPos(can.body.position.x, can.body.position.y)
  FX.burst(p.x, p.y, { colors: ['#FFD34D', '#FFF', '#FF9E7A'], count: 8 })
  $('ctScore').textContent = `🎯 ${ct.score}`
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

function render() {
  const c: CanvasRenderingContext2D = ct.c2d
  c.clearRect(0, 0, ct.W, ct.H)
  // Boîtes
  for (const can of ct.cans) {
    const b = can.body
    c.save()
    c.translate(b.position.x, b.position.y)
    c.rotate(b.angle)
    const g = c.createLinearGradient(-CAN_W / 2, 0, CAN_W / 2, 0)
    g.addColorStop(0, '#D9E2EA'); g.addColorStop(0.3, '#FDFEFF'); g.addColorStop(0.7, '#C4D1DC'); g.addColorStop(1, '#AEBECC')
    c.fillStyle = g
    roundRect(c, -CAN_W / 2, -CAN_H / 2, CAN_W, CAN_H, 6)
    c.fill()
    c.strokeStyle = '#93A5B4'; c.lineWidth = 2; c.stroke()
    c.fillStyle = 'rgba(255,255,255,.75)'
    roundRect(c, -CAN_W / 2 + 4, -CAN_H / 2 + 3, CAN_W - 8, 5, 2.5)
    c.fill()
    c.font = '26px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'
    c.fillText(can.face, 0, 3)
    c.restore()
  }
  // Balle
  if (ct.ball) {
    const b = ct.ball
    c.save()
    c.translate(b.position.x, b.position.y)
    c.rotate(b.angle)
    const g = c.createRadialGradient(-5, -5, 2, 0, 0, BALL_R)
    g.addColorStop(0, '#FFE9C0'); g.addColorStop(0.6, '#E8A13F'); g.addColorStop(1, '#B06A1E')
    c.fillStyle = g
    c.beginPath(); c.arc(0, 0, BALL_R, 0, Math.PI * 2); c.fill()
    c.strokeStyle = '#8A5A33'; c.lineWidth = 2; c.stroke()
    c.beginPath(); c.arc(0, 0, BALL_R * 0.55, 0.3, 1.6); c.stroke()
    c.restore()
  }
  // Élastique + trajectoire en pointillés pendant la visée.
  // Les pointillés sont EXACTS : une balle fantôme est simulée par un petit
  // moteur matter jetable avec les mêmes réglages que le vrai lancer.
  if (ct.aim && ct.ball && !ct.thrown && ct.ghost) {
    const bx = ct.ball.position.x, by = ct.ball.position.y
    const { vx, vy } = aimVelocity()
    c.strokeStyle = 'rgba(138,90,51,.6)'; c.lineWidth = 3
    c.beginPath(); c.moveTo(bx, by); c.lineTo(bx - vx * 2.2, by - vy * 2.2); c.stroke()
    const M = ct.M
    M.Body.setPosition(ct.ghost, { x: bx, y: by })
    M.Body.setVelocity(ct.ghost, { x: vx, y: vy })
    M.Body.setAngularVelocity(ct.ghost, 0)
    c.fillStyle = 'rgba(255,255,255,.88)'
    for (let i = 0; i < 15; i++) {
      for (let s = 0; s < 3; s++) M.Engine.update(ct.preview, 16.666)
      c.beginPath()
      c.arc(ct.ghost.position.x, ct.ghost.position.y, Math.max(2, 4.5 - i * 0.2), 0, Math.PI * 2)
      c.fill()
      if (ct.ghost.position.y > ct.H) break
    }
  }
}

function aimVelocity() {
  const dx = (ct.aim.x0 - ct.aim.x1) * POW
  const dy = (ct.aim.y0 - ct.aim.y1) * POW
  const sp = Math.hypot(dx, dy)
  const k = sp > MAX_V ? MAX_V / sp : 1
  return { vx: dx * k, vy: dy * k }
}

function buildPyramid(M: any) {
  const { Bodies, Composite } = M
  ct.cans.forEach((can: any) => Composite.remove(ct.engine.world, can.body))
  const faces = shuffle([...ANIMALS])
  const cx = ct.W / 2
  const topY = ct.shelfY - 6
  const S = CAN_W + 7
  const spots = [
    [cx - S, 0], [cx, 0], [cx + S, 0],
    [cx - S / 2, 1], [cx + S / 2, 1],
    [cx, 2]
  ]
  ct.cans = spots.map(([x, row], i) => {
    const body = Bodies.rectangle(x as number, topY - CAN_H / 2 - (row as number) * (CAN_H + 1), CAN_W, CAN_H, {
      friction: 0.5, restitution: 0.1, density: 0.0009,
      collisionFilter: { category: 0x0002, mask: 0xFFFF }
    })
    Composite.add(ct.engine.world, body)
    return { body, face: faces[i], down: false }
  })
}

function newBall(M: any) {
  const { Bodies, Body, Composite } = M
  if (ct.ball) Composite.remove(ct.engine.world, ct.ball)
  // La balle ignore la planche de l'étagère (0x0008) : elle vole au travers
  // pour frapper les boîtes, comme un vrai lancer de face.
  // Créée dynamique PUIS figée : un corps né statique garde une masse infinie
  // quand on le libère (bug matter-js) → positions NaN.
  ct.ball = Bodies.circle(ct.W / 2, ct.H - 46, BALL_R, {
    restitution: 0.3, friction: 0.4, density: 0.010,
    collisionFilter: { category: 0x0004, mask: 0xFFF7 }
  })
  Body.setStatic(ct.ball, true)
  Composite.add(ct.engine.world, ct.ball)
  ct.thrown = false
  ct.aim = null
}

function endThrow(M: any) {
  if (!ct || !ct.running) return
  ct.throws--
  $('ctThrows').textContent = '🎾'.repeat(ct.throws) || '—'
  const standing = ct.cans.filter((c: any) => !c.down).length
  if (standing === 0) {
    tone(660, 0.14, 'sine', 0.12); setTimeout(() => tone(880, 0.18, 'sine', 0.12), 120)
    ctx.toast('STRIKE ! Tout est tombé ! 🎉')
  }
  if (standing === 0 || ct.throws <= 0) {
    ct.round++
    if (ct.round >= ct.rounds) { setTimeout(() => ct && ct.running && finish(), 600); return }
    ctx.toast('Nouvelle pyramide !')
    setTimeout(() => {
      if (!ct || !ct.running) return
      buildPyramid(M)
      ct.throws = ct.throwsPer
      $('ctThrows').textContent = '🎾'.repeat(ct.throws)
      newBall(M)
    }, 700)
  } else {
    newBall(M)
  }
}

function finish() {
  sWin()
  const total = ct.rounds * 6
  const stars = ct.score >= total - 1 ? 3 : ct.score >= Math.ceil(total * 0.58) ? 2 : 1
  ctx.finish({
    title: 'Quel bras !',
    msg: `${ctx.playerName} a fait tomber ${ct.score} boîtes sur ${total} 🎪`,
    stars: stars as 1 | 2 | 3, starsEarned: stars
  })
}

export const chamboule: GameDef = {
  id: 'chamboule', name: 'Chamboule-Tout', icon: '🎪', sq: 'sq-sun', cat: 'action', music: 'fair',
  subtitle: 'Tire la balle en arrière comme un lance-pierre, et vise !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="ctScore">🎯 0</div>
        <div class="chip" id="ctThrows"></div>
      </div>
      <div class="arena ct-arena" id="ctArena">
        <div class="ct-bunting">🚩🚩🚩🚩🚩🚩🚩🚩</div>
        <div class="hint">Tire la balle vers l'arrière… et lâche ! 🏹</div>
        <div class="ct-shelf"></div>
        <canvas id="ctCanvas"></canvas>
      </div>`
    const area = $('ctArena')
    const canvas = $('ctCanvas') as unknown as HTMLCanvasElement
    canvas.width = area.clientWidth
    canvas.height = area.clientHeight
    ct = {
      canvas, c2d: canvas.getContext('2d'), W: canvas.width, H: canvas.height,
      shelfY: canvas.height * 0.52, cans: [], ball: null, aim: null, thrown: false,
      score: 0, round: 0, rounds: 2, throwsPer: c.byTier(5, 4, 4),
      running: true, raf: 0, lastSnd: 0, simMs: 0, throwSim: 0
    }
    ct.throws = ct.throwsPer
    $('ctThrows').textContent = '🎾'.repeat(ct.throws)

    let dead = false
    ;(async () => {
      const M = await import('matter-js')
      if (dead || !ct) return
      const { Engine, Bodies, Composite, Events } = M
      ct.M = M
      ct.engine = Engine.create()
      ct.engine.gravity.y = 1
      // Moteur jetable pour la trajectoire prévisualisée (balle fantôme seule)
      ct.preview = Engine.create()
      ct.preview.gravity.y = 1
      ct.ghost = Bodies.circle(0, 0, BALL_R, { restitution: 0.3, friction: 0.4, density: 0.004 })
      Composite.add(ct.preview.world, ct.ghost)

      // Étagère (ne porte QUE les boîtes : la balle passe au travers) + sol + murs
      Composite.add(ct.engine.world, [
        // Étagère à peine plus large que la pyramide : les boîtes frappées
        // basculent du bord et dégringolent sur le sable
        Bodies.rectangle(ct.W / 2, ct.shelfY, (CAN_W + 7) * 2 + CAN_W + 56, 10, {
          isStatic: true, friction: 0.8, collisionFilter: { category: 0x0008, mask: 0x0002 }
        }),
        Bodies.rectangle(ct.W / 2, ct.H + 4, ct.W * 2, 20, { isStatic: true, friction: 0.7 }),
        Bodies.rectangle(-14, ct.H / 2, 28, ct.H * 2, { isStatic: true }),
        Bodies.rectangle(ct.W + 14, ct.H / 2, 28, ct.H * 2, { isStatic: true })
      ])
      buildPyramid(M)
      newBall(M)

      // Sons d'impact selon la violence du choc (avec anti-mitraillette)
      Events.on(ct.engine, 'collisionStart', (ev: any) => {
        if (!ct || !ct.running) return
        const now = performance.now()
        if (now - ct.lastSnd < 90) return
        for (const pair of ev.pairs) {
          const sp = Math.max(pair.bodyA.speed || 0, pair.bodyB.speed || 0)
          if (sp > 9) { ct.lastSnd = now; sHit(); shake(area, 5, 220); break }
          if (sp > 3.5) { ct.lastSnd = now; sBonk(); break }
        }
      })

      // Pas de temps FIXE avec accumulateur : la physique reste en temps réel
      // même si le rendu ralentit (vieille tablette), et reste déterministe
      const STEP = 16.666
      let last = performance.now()
      let acc = 0
      const loop = (now: number) => {
        if (!ct || !ct.running) return
        acc += Math.min(100, now - last); last = now
        let n = 0
        while (acc >= STEP && n < 5) {
          Engine.update(ct.engine, STEP)
          ct.simMs += STEP
          acc -= STEP; n++
        }
        // Boîtes tombées : penchées ou éjectées de l'étagère
        for (const can of ct.cans) {
          if (!can.down && (Math.abs(can.body.angle) > 0.85 || can.body.position.y > ct.shelfY + 42)) canDown(can)
        }
        // Fin du lancer (en temps SIMULÉ) : balle arrêtée ou sortie
        if (ct.thrown && ct.ball) {
          const t = ct.simMs - ct.throwSim
          const done = t > 3200 || (t > 900 && ct.ball.speed < 0.35) || ct.ball.position.y > ct.H + 80
          if (done) { ct.thrown = false; endThrow(M) }
        }
        render()
        ct.raf = requestAnimationFrame(loop)
      }
      ct.raf = requestAnimationFrame(loop)

      // Le lance-pierre
      area.onpointerdown = (e: PointerEvent) => {
        if (!ct || !ct.running || ct.thrown || !ct.ball) return
        const r = canvas.getBoundingClientRect()
        ct.aim = { x0: e.clientX - r.left, y0: e.clientY - r.top, x1: e.clientX - r.left, y1: e.clientY - r.top }
      }
      area.onpointermove = (e: PointerEvent) => {
        if (!ct || !ct.aim) return
        const r = canvas.getBoundingClientRect()
        ct.aim.x1 = e.clientX - r.left
        ct.aim.y1 = e.clientY - r.top
      }
      area.onpointerup = () => {
        if (!ct || !ct.aim || ct.thrown || !ct.ball) { if (ct) ct.aim = null; return }
        const { vx, vy } = aimVelocity()
        const drag = Math.hypot(ct.aim.x0 - ct.aim.x1, ct.aim.y0 - ct.aim.y1)
        ct.aim = null
        if (drag < 16) return // simple tap : on ne lance pas
        if (vy > 0) { sNope(); ctx.toast('Tire vers le HAUT ! 😄'); return }
        M.Body.setStatic(ct.ball, false)
        M.Body.setVelocity(ct.ball, { x: vx, y: vy })
        M.Body.setAngularVelocity(ct.ball, vx * 0.02)
        ct.thrown = true
        ct.throwSim = ct.simMs
        sWoosh()
      }
    })()

    return () => {
      dead = true
      if (ct) { ct.running = false; cancelAnimationFrame(ct.raf); ct = null }
    }
  }
}
