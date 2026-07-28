import type { GameContext, GameDef } from '../core/types'
import { impact } from '../core/impact'
import { $ } from '../core/utils'
import { sCatch, sJump, sNope, sWin } from '../core/audio'
import {
  createStage, loadThree, loader, woodTex, avatarMedallion,
  type Stage
} from '../core/three3d'

/* 🐤 Poussin Volant, en 3D — un vrai poussin en volume qui bat des ailes,
   pique du nez quand il tombe, et se faufile entre des palissades de bois
   dans la lumière du soir. Plumes qui volent au choc, prairie fleurie qui
   défile, nuages moelleux en parallaxe.

   La PHYSIQUE validée ne change pas d'un chiffre : y mesuré depuis le haut,
   gravité, impulsion, plafond, sol, fenêtres de collision — tout tourne dans
   les mêmes « pixels virtuels », seul le rendu les traduit en mètres. */

const W = 900             // largeur virtuelle en px (fixe : le feel ne dépend plus de l'écran)
const H = 420             // hauteur virtuelle
const PX = 0.008          // 1 px virtuel → mètres
const R = 18              // rayon du poussin en px
const PW = 52             // largeur d'une palissade en px

const wx = (x: number) => (x - W / 2) * PX
const wy = (y: number) => (H / 2 - y) * PX   // y virtuel = depuis le HAUT

let fl: any = null
let ctx: GameContext

function hit() {
  if (!fl || fl.invuln > 0) return
  fl.lives--; fl.invuln = 1200; sNope()
  impact(0.8, { matter: 'sourd' })
  fl.feathers()
  $('flHearts').textContent = '❤️'.repeat(fl.lives) + '🖤'.repeat(3 - fl.lives)
  if (fl.lives <= 0) { fl.running = false; setTimeout(() => fl && finish(), 400) }
}

function finish() {
  const score = fl ? fl.score : 0
  if (fl) fl.running = false
  sWin()
  const th = ctx.byTier([10, 6], [14, 8], [18, 11])
  const stars = score >= th[0] ? 3 : score >= th[1] ? 2 : 1
  ctx.finish({ title: 'Bel envol !', msg: `${ctx.playerName} a passé ${score} barrières 🐤`, stars, starsEarned: stars })
}

/** Le poussin : corps rond, ailes articulées, bec, yeux, houppette. */
function makeChick(T: any) {
  const g = new T.Group()
  const yellow = new T.MeshStandardMaterial({ color: 0xE8B93C, roughness: 0.65 })
  const orange = new T.MeshStandardMaterial({ color: 0xD97B2E, roughness: 0.6 })
  const white = new T.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.3 })
  const dark = new T.MeshStandardMaterial({ color: 0x2A2A2A, roughness: 0.4 })
  const body = new T.Mesh(new T.SphereGeometry(0.15, 20, 16), yellow)
  body.scale.set(1.05, 1, 0.95)
  body.castShadow = true
  const beak = new T.Mesh(new T.ConeGeometry(0.045, 0.09, 8), orange)
  beak.rotation.z = -Math.PI / 2
  beak.position.set(0.16, 0.01, 0)
  const crest = new T.Mesh(new T.SphereGeometry(0.045, 8, 6), yellow)
  crest.position.set(-0.02, 0.15, 0)
  g.add(body, beak, crest)
  for (const s of [-1, 1]) {
    const eye = new T.Mesh(new T.SphereGeometry(0.035, 10, 8), white)
    eye.position.set(0.1, 0.05, s * 0.075)
    const pupil = new T.Mesh(new T.SphereGeometry(0.018, 8, 6), dark)
    pupil.position.set(0.125, 0.05, s * 0.085)
    g.add(eye, pupil)
  }
  // Les ailes : pivot à l'épaule pour battre
  const wings: any[] = []
  for (const s of [-1, 1]) {
    const pivot = new T.Group()
    const wing = new T.Mesh(new T.SphereGeometry(0.1, 12, 10), yellow)
    wing.scale.set(1.15, 0.35, 0.7)
    wing.position.set(-0.03, 0, s * 0.06)
    wing.castShadow = true
    pivot.add(wing)
    pivot.position.set(-0.04, 0.03, s * 0.12)
    g.add(pivot)
    wings.push({ pivot, side: s })
  }
  // Pattes
  for (const s of [-1, 1]) {
    const leg = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.07, 6), orange)
    leg.position.set(0.02, -0.16, s * 0.05)
    g.add(leg)
  }
  return { g, wings }
}

export const flappy: GameDef = {
  id: 'flappy', name: 'Poussin Volant', icon: '🐤', sq: 'sq-lilac', cat: 'action',
  subtitle: 'Tape ou ESPACE pour battre des ailes !',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="topbar">
        <div class="hearts" id="flHearts">❤️❤️❤️</div>
        <div class="chip" id="flScore">🐤 0</div>
      </div>
      <div id="flArea" class="arena g3-arena fl-arena">
        <div class="hint g3-hint" id="flStart">Tape pour voler ! 🐤</div>
      </div>`
    const area = $('flArea')
    const startMsg = $('flStart')
    const hideLoader = loader(area, '🐤')
    const cfg = c.byTier(
      { gap: 0.36, sp: 0.15, space: 0.66 },
      { gap: 0.31, sp: 0.19, space: 0.58 },
      { gap: 0.26, sp: 0.23, space: 0.5 }
    )
    const groundH = H * 0.22
    const groundTop = H - groundH

    ;(async () => {
      const T = await loadThree()
      if (dead) return
      const stage: Stage = await createStage(area, {
        sky: '#243550',
        fog: [4.5, 10], fogColor: '#243550',
        cam: [0, 0.45, 4.5], target: [0, -0.05, 0], fov: 44,
        hemi: ['#F5DCB8', '#20304A', 0.75],
        sun: { pos: [2.5, 5, 3.5], color: '#FFDCA8', intensity: 1.8, area: 6, far: 15 },
        fill: 0.35, exposure: 0.93, iblIntensity: 0.55
      })
      if (dead) { stage.dispose(); return }
      hideLoader()
      const scene = stage.scene

      /* La prairie : un sol vert sombre au niveau du sol virtuel, fleurs qui
         défilent — c'est le sol qui donne la vitesse. */
      const groundY = wy(groundTop)
      const grass = new T.Mesh(
        new T.PlaneGeometry(18, 8),
        new T.MeshStandardMaterial({ color: 0x27452C, roughness: 0.95 })
      )
      grass.rotation.x = -Math.PI / 2
      grass.position.set(0, groundY, 1)
      grass.receiveShadow = true
      scene.add(grass)
      const flowers: any[] = []
      const stemMat = new T.MeshStandardMaterial({ color: 0x3A6B40, roughness: 0.9 })
      const petalMats = [0xC46A8A, 0xC9A227, 0xB6604A].map(col =>
        new T.MeshStandardMaterial({ color: col, roughness: 0.7 }))
      for (let i = 0; i < 16; i++) {
        const f = new T.Group()
        const stem = new T.Mesh(new T.CylinderGeometry(0.012, 0.015, 0.16, 5), stemMat)
        stem.position.y = 0.08
        const head = new T.Mesh(new T.SphereGeometry(0.04, 8, 6), petalMats[i % 3])
        head.position.y = 0.18
        f.add(stem, head)
        f.position.set(-6 + i * 0.85, groundY, 0.4 + (i % 3) * 0.5)
        scene.add(f)
        flowers.push(f)
      }
      // Nuages moelleux : grappes de sphères, parallaxe lente
      const cloudMat = new T.MeshStandardMaterial({ color: 0xB8BED4, roughness: 1 })
      const clouds: any[] = []
      for (let i = 0; i < 4; i++) {
        const cl = new T.Group()
        for (let j = 0; j < 3; j++) {
          const b = new T.Mesh(new T.SphereGeometry(0.22 - j * 0.05, 10, 8), cloudMat)
          b.position.set(j * 0.25 - 0.25, (j % 2) * 0.08, 0)
          cl.add(b)
        }
        cl.position.set(-5 + i * 3, 1 + (i % 2) * 0.6, -2.5)
        cl.scale.setScalar(0.8 + (i % 3) * 0.3)
        scene.add(cl)
        clouds.push(cl)
      }

      /* Les palissades : tours de bois avec chapeau, du plafond et du sol */
      const wood = woodTex(T, '#A87848')
      stage.keep(wood)
      const woodMat = new T.MeshStandardMaterial({ map: wood, roughness: 0.8 })
      const capMat = new T.MeshStandardMaterial({ color: 0x6B4A32, roughness: 0.75 })
      // Le fût déborde largement du cadre (EXTRA) : une palissade doit sortir
      // de l'écran, pas flotter en l'air — seul le chapeau marque le passage.
      const EXTRA = 1.6
      const makeTower = (hPx: number, capAtBottom: boolean) => {
        const g = new T.Group()
        const h = hPx * PX
        const body = new T.Mesh(new T.BoxGeometry(PW * PX, h + EXTRA, 0.5), woodMat)
        body.position.y = capAtBottom ? -h + (h + EXTRA) / 2 : h - (h + EXTRA) / 2
        body.castShadow = true
        const cap = new T.Mesh(new T.BoxGeometry(PW * PX * 1.35, 0.12, 0.58), capMat)
        cap.position.y = capAtBottom ? -h + 0.06 : h - 0.06
        cap.castShadow = true
        g.add(body, cap)
        return g
      }

      /* Le poussin */
      const { g: chick, wings } = makeChick(T)
      chick.scale.setScalar(1.15) // un peu plus gros que sa hitbox : plus lisible, plus indulgent
      scene.add(chick)
      // Le poussin, c'est ELLE : médaillon photo au-dessus de la houppette
      avatarMedallion(T, c.avatar, 0.14).then(med => {
        if (med && fl) { med.position.set(0, 0.34, 0); chick.add(med) }
      })

      /* Plumes : petites sphères jaunes qui voltigent au choc */
      const featherGeo = new T.SphereGeometry(0.03, 6, 5)
      const featherMats = [
        new T.MeshBasicMaterial({ color: 0xE8B93C, transparent: true }),
        new T.MeshBasicMaterial({ color: 0xF5EED8, transparent: true })
      ]
      const parts: any[] = []

      fl = {
        stage, cfg,
        y: H * 0.45, vy: 0, score: 0, lives: 3,
        running: true, started: false, pipes: [], invuln: 0, flapT: 0,
        feathers() {
          for (let i = 0; i < 10; i++) {
            const m = new T.Mesh(featherGeo, featherMats[i % 2])
            m.position.copy(chick.position)
            scene.add(m)
            const a = Math.random() * Math.PI * 2
            const v = 0.5 + Math.random() * 1.6
            parts.push({ m, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 0.8, life: 1 })
          }
        }
      }

      const cx = W * 0.22
      const spawnPipe = () => {
        const gap = H * cfg.gap
        // Le passage peut être n'importe où entre le ciel et le sol
        const gy = H * 0.06 + Math.random() * (groundTop - gap - H * 0.12)
        const top = makeTower(gy, true)
        top.position.set(wx(W + PW / 2), wy(0), 0)
        const bot = makeTower(groundTop - gy - gap, false)
        bot.position.set(wx(W + PW / 2), wy(groundTop), 0)
        scene.add(top, bot)
        fl.pipes.push({ top, bot, x: W, gy, gap, counted: false })
      }

      const flap = (e?: Event) => {
        if (e) e.preventDefault()
        if (!fl || !fl.running) return
        fl.started = true; fl.vy = -0.40; fl.flapT = 1; sJump()
        startMsg.style.display = 'none'
      }
      const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.key === 'ArrowUp') flap(e) }
      area.addEventListener('pointerdown', flap)
      window.addEventListener('keydown', onKey)

      /* --- Boucle : simulation en px virtuels, rendu en mètres --- */
      stage.start((dtS, t) => {
        if (!fl || !fl.running) return
        const dt = Math.min(40, dtS * 1000)

        // fl.y est mesuré DEPUIS LE HAUT : la gravité augmente y (le poussin
        // tombe), battre des ailes le diminue (il monte)
        if (fl.started) { fl.vy += 0.0014 * dt; fl.y += fl.vy * dt }
        else fl.y = H * 0.45 + Math.sin(t * 0.004) * 8

        if (fl.y < R) { fl.y = R; fl.vy = 0 } // plafond
        if (fl.y > groundTop - R) { fl.y = groundTop - R; if (fl.started) hit(); if (!fl) return; fl.vy = -0.30 }

        chick.position.set(wx(cx), wy(fl.y), 0)
        chick.rotation.z = -Math.max(-0.52, Math.min(0.87, (fl.vy || 0) * 1.6))
        // Les ailes battent fort au coup d'aile, doucement en plané
        fl.flapT = Math.max(0, fl.flapT - dt * 0.004)
        const beat = fl.flapT > 0 ? Math.sin(fl.flapT * Math.PI * 3) * 1 : Math.sin(t * 0.01) * 0.25
        for (const wgn of wings) wgn.pivot.rotation.x = wgn.side * beat * 0.9
        if (fl.invuln > 0) { fl.invuln -= dt; chick.visible = Math.floor(t / 90) % 2 === 0 }
        else chick.visible = true

        const lastX = fl.pipes.length ? fl.pipes[fl.pipes.length - 1].x : -1e9
        if (fl.started && (fl.pipes.length === 0 || lastX < W - W * cfg.space)) spawnPipe()

        for (let i = fl.pipes.length - 1; i >= 0; i--) {
          const p = fl.pipes[i]
          p.x -= cfg.sp * dt
          p.top.position.x = wx(p.x + PW / 2)
          p.bot.position.x = wx(p.x + PW / 2)
          if (!p.counted && p.x + PW < cx - R) {
            p.counted = true; fl.score++; sCatch()
            impact(0.25, { matter: 'neige', noShake: true })
            $('flScore').textContent = '🐤 ' + fl.score
          }
          if (fl.invuln <= 0 && p.x < cx + R && p.x + PW > cx - R) {
            if (fl.y - R < p.gy || fl.y + R > p.gy + p.gap) hit()
            if (!fl) return
          }
          if (p.x < -70) { scene.remove(p.top); scene.remove(p.bot); fl.pipes.splice(i, 1) }
        }

        // Prairie et nuages : défilement + parallaxe
        const v = cfg.sp * dt * PX
        for (const f of flowers) {
          f.position.x -= v
          if (f.position.x < -7) f.position.x += 14
        }
        for (const cl of clouds) {
          cl.position.x -= v * 0.3
          if (cl.position.x < -6.5) cl.position.x = 6.5
        }

        // Vie des plumes
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i]
          p.life -= dtS * 1.4
          p.vy -= dtS * 4
          p.m.position.x += p.vx * dtS
          p.m.position.y += p.vy * dtS
          p.m.material.opacity = Math.max(0, p.life)
          if (p.life <= 0) { scene.remove(p.m); parts.splice(i, 1) }
        }
      })

      fl.cleanup = () => {
        area.removeEventListener('pointerdown', flap)
        window.removeEventListener('keydown', onKey)
        featherGeo.dispose()
        stage.dispose()
      }
    })().catch(() => { hideLoader(); ctx.toast('La 3D n\'est pas disponible ici 😕') })

    return () => {
      dead = true
      if (fl) {
        fl.running = false
        try { fl.cleanup?.() } catch { /* déjà démonté */ }
        fl = null
      }
    }
  }
}
