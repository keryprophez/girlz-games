import type { GameContext, GameDef } from '../core/types'
import { impact } from '../core/impact'
import { $ } from '../core/utils'
import { ICON } from '../core/icons'
import { sfx, preloadSfx } from '../core/sfx'
import { arcade, type Arcade } from '../core/arcade'
import { runner, type Runner } from '../core/runner'
import { ground, decor, particles, camShake, type Particles, type CamShake } from '../core/scene3d'
import {
  createStage, loadThree, loader, woodTex, avatarMedallion,
  type Stage, type T3
} from '../core/three3d'

/* 🐤 Poussin Volant — un poussin en volume qui bat des ailes et se faufile
   entre des palissades de bois, dans une prairie de fin d'après-midi.

   Refonte sur core/runner.ts + core/arcade.ts :
   - en mètres, y vers le haut, une seule boucle ;
   - une RAMPE : tous les 4 passages, ça va un peu plus vite et le passage
     se resserre un peu (borné) — avant, la difficulté ne bougeait pas ;
   - le sol : on rebondit, mais ça coûte un cœur ; le plafond retient ;
   - le near-miss : passer à un cheveu d'un chapeau de palissade, ça fait
     un « Ouf ! » et une petite plume ;
   - au dernier cœur, le poussin dégringole au ralenti dans un nuage de
     plumes, et le titre de fin ne fête plus une chute. */

const CHICK_X = -1.7
const SPAWN_X = 4.2
const DESPAWN_X = -3.8
const GROUND_Y = -0.95
const CEIL_Y = 1.62
const R = 0.145            // rayon du poussin (m)
const PW = 0.42            // largeur d'une palissade
const GRAVITY = 11.2
const FLAP_V = 3.2

interface PipeData { lo: number; hi: number; minClear: number }
interface Cfg { speed: number; inc: number; gap: number; gapDec: number; space: number }

interface State {
  stage: Stage
  game: Arcade
  run: Runner<PipeData>
  fx: Particles
  shake: CamShake
  cfg: Cfg
  y: number
  vy: number
  started: boolean
  flapT: number
  over: boolean
  spin: number
  tapHint: HTMLElement
  chick: import('three').Group
}

let fl: State | null = null
let ctx: GameContext

function flap(me: State) {
  if (me.over) return
  if (!me.started) { me.started = true; me.tapHint.classList.add('off') }
  me.vy = FLAP_V
  me.flapT = 1
  sfx('cloth', { vol: 0.45, rate: 1.6, spread: 0.1 })
}

function feathers(me: State, n: number) {
  me.fx.burst({ x: CHICK_X, y: me.y, z: 0 }, { count: n, color: [0xE8B93C, 0xF5EED8], speed: 1.6, life: 0.9, size: 0.07, gravity: 2.5, spread: 1 })
}

function hurt(me: State, what: 'sol' | 'bois') {
  if (me.over || me.run.invuln > 0) return
  impact(0.8, { matter: what === 'sol' ? 'sourd' : 'bois', noShake: true })
  me.shake.hit(0.7)
  feathers(me, 14)
  me.game.flash(ICON.heartEmpty, 'bad')
  if (me.game.hurt()) { finish(me); return }
  me.run.hurt(1.2)
}

function finish(me: State) {
  if (me.over) return
  me.over = true
  me.stage.timeScale = 0.35
  me.vy = Math.min(me.vy, 0.5)
  feathers(me, 24)
  const n = me.game.s.score
  const th = ctx.byTier([10, 6], [14, 8], [18, 11])
  me.game.end({
    title: n >= th[0] ? 'Grand envol !' : n >= th[1] ? 'Bel envol !' : 'Le poussin est tombé !',
    msg: `${ctx.playerName} a passé ${n} barrière${n > 1 ? 's' : ''}`,
    outroMs: 1300
  })
}

/** Le poussin : corps rond, ailes articulées, bec, yeux, houppette. */
function makeChick(T: T3) {
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
  const wings: { pivot: import('three').Group; side: number }[] = []
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
  for (const s of [-1, 1]) {
    const leg = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.07, 6), orange)
    leg.position.set(0.02, -0.16, s * 0.05)
    g.add(leg)
  }
  return { g, wings }
}

export const flappy: GameDef = {
  id: 'flappy', name: 'Poussin Volant', icon: '🐤', sq: 'sq-lilac', cat: 'action',
  subtitle: 'Tape pour battre des ailes !',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `<div id="flArea" class="arena g3-arena fl-arena"></div>`
    const area = $('flArea')
    const hideLoader = loader(area, '🐤')
    preloadSfx(['cloth', 'whoosh', 'confirm', 'pluck'])
    const cfg: Cfg = c.byTier(
      { speed: 1.2, inc: 0.07, gap: 1.25, gapDec: 0.03, space: 4.4 },
      { speed: 1.5, inc: 0.09, gap: 1.05, gapDec: 0.03, space: 3.9 },
      { speed: 1.85, inc: 0.1, gap: 0.9, gapDec: 0.03, space: 3.4 }
    )

    ;(async () => {
      const T = await loadThree()
      if (dead) return
      const stage: Stage = await createStage(area, {
        sky: '#7FB8E0',
        fog: [6, 14], fogColor: '#BFD9EE',
        cam: [0, 0.45, 4.6], target: [0, 0.1, 0], fov: 44,
        hemi: ['#EAF4FF', '#4E7A3C', 0.9],
        sun: { pos: [2.5, 5, 3.5], color: '#FFEBC8', intensity: 1.9, area: 7, far: 18 },
        fill: 0.35, exposure: 1.0, iblIntensity: 0.55
      })
      if (dead) { stage.dispose(); return }
      const scene = stage.scene

      /* La prairie : un sol, et des fleurs, buissons, herbes du kit nature qui défilent */
      const g = ground(stage, { radius: 26, color: 0x4F8F3A, roughness: 0.98 })
      g.position.set(0, GROUND_Y, 2)
      const span = 16
      const front = Array.from({ length: 12 }, (_, i) => ({ model: `nature/${['flower_redA', 'flower_yellowA', 'flower_purpleA', 'grass_large', 'plant_bush', 'mushroom_red'][i % 6]}`, x: -7 + i * (span / 12) + Math.random() * 0.6, z: 0.4 + Math.random() * 0.7, size: 0.13 + Math.random() * 0.1, tint: 0xFFFFFF }))
      const trees = Array.from({ length: 7 }, (_, i) => ({ model: `nature/${['tree_default', 'tree_oak', 'tree_fat', 'tree_detailed'][i % 4]}`, x: -7 + i * (span / 7) + Math.random(), z: -3 - Math.random() * 1.6, size: 2 + Math.random() * 1.1, tint: 0x6EAE48 }))
      const bushes = Array.from({ length: 6 }, (_, i) => ({ model: `nature/${['plant_bushLarge', 'rock_smallA', 'stump_round'][i % 3]}`, x: -7 + i * (span / 6) + Math.random(), z: -1.6 - Math.random() * 0.8, size: 0.4 + Math.random() * 0.3, tint: 0x8FB56A }))

      // Nuages moelleux : grappes de sphères, parallaxe lente
      const cloudMat = new T.MeshStandardMaterial({ color: 0xF4F6FA, roughness: 1 })
      const cloudGeo = new T.SphereGeometry(1, 10, 8)
      const clouds: import('three').Group[] = []
      for (let i = 0; i < 5; i++) {
        const cl = new T.Group()
        for (let j = 0; j < 5; j++) {
          const b = new T.Mesh(cloudGeo, cloudMat)
          const r = 0.16 + Math.random() * 0.14
          b.scale.setScalar(r)
          b.position.set(j * 0.22 - 0.44, (j % 2) * 0.09 + Math.random() * 0.05, (Math.random() - 0.5) * 0.2)
          cl.add(b)
        }
        cl.position.set(-6 + i * 3, 1.1 + (i % 3) * 0.35, -4)
        cl.scale.setScalar(1.1 + (i % 3) * 0.4)
        scene.add(cl)
        clouds.push(cl)
      }

      /* Les palissades : tours de bois avec chapeau, depuis le plafond et depuis le sol */
      const wood = stage.keep(woodTex(T, '#A87848'))
      const woodMat = new T.MeshStandardMaterial({ map: wood, roughness: 0.8 })
      const capMat = new T.MeshStandardMaterial({ color: 0x6B4A32, roughness: 0.75 })
      const EXTRA = 1.6 // le fût déborde du cadre : une palissade sort de l'écran, elle ne flotte pas
      const makePair = (lo: number, hi: number) => {
        const grp = new T.Group()
        const hTop = CEIL_Y + 0.3 - hi
        const top = new T.Mesh(new T.BoxGeometry(PW, hTop + EXTRA, 0.5), woodMat)
        top.position.y = hi + (hTop + EXTRA) / 2
        const capT = new T.Mesh(new T.BoxGeometry(PW * 1.35, 0.12, 0.58), capMat)
        capT.position.y = hi + 0.06
        const hBot = lo - GROUND_Y
        const bot = new T.Mesh(new T.BoxGeometry(PW, hBot + 0.3, 0.5), woodMat)
        bot.position.y = lo - (hBot + 0.3) / 2
        const capB = new T.Mesh(new T.BoxGeometry(PW * 1.35, 0.12, 0.58), capMat)
        capB.position.y = lo - 0.06
        for (const m of [top, capT, bot, capB]) m.castShadow = true
        grp.add(top, capT, bot, capB)
        return grp
      }

      /* Le poussin, et c'est ELLE */
      const { g: chick, wings } = makeChick(T)
      chick.scale.setScalar(1.15) // un peu plus gros que sa hitbox : plus lisible, plus indulgent
      chick.position.x = CHICK_X
      scene.add(chick)
      avatarMedallion(T, c.avatar, 0.14).then(med => { if (med && fl) { med.position.set(0, 0.34, 0); chick.add(med) } })

      hideLoader()
      const tapHint = document.createElement('div')
      tapHint.className = 'tap-hint'
      tapHint.innerHTML = ICON.tap
      area.appendChild(tapHint)

      const game = arcade(c, {
        host: area,
        lives: c.byTier(5, 3, 3),
        scoreIcon: ICON.check,
        plainScore: true,
        ramp: { every: 4, max: 6 },
        onLevel: lv => { me.run.speed = cfg.speed + cfg.inc * lv; sfx('confirm', { vol: 0.5, rate: 1.2 }) },
        stars: s => { const th = c.byTier([10, 6], [14, 8], [18, 11]); return s.score >= th[0] ? 3 : s.score >= th[1] ? 2 : 1 }
      })
      const run = runner<PipeData>(stage, { speed: cfg.speed, spawnX: SPAWN_X, despawnX: DESPAWN_X, playerX: CHICK_X })
      const me: State = {
        stage, game, run, fx: particles(stage, 400), shake: camShake(stage), cfg,
        y: 0.3, vy: 0, started: false, flapT: 0, over: false, spin: 0, tapHint, chick
      }
      fl = me
      run.layer(clouds, 0.2, 15, -8)
      decor(stage, [...front, ...trees, ...bushes]).then(grp => {
        if (fl !== me) return
        grp.position.y = GROUND_Y
        const kids = grp.children
        run.layer(kids.slice(0, front.length), 1, span, -8)
        run.layer(kids.slice(front.length, front.length + trees.length), 0.5, span, -9)
        run.layer(kids.slice(front.length + trees.length), 0.8, span, -8.5)
      }).catch(() => { /* sans décor, le jeu tourne */ })

      const spawn = () => {
        const gap = Math.max(cfg.gap - 0.35, cfg.gap - cfg.gapDec * game.s.level)
        // Le passage peut être n'importe où entre le ciel et le sol
        const lo = GROUND_Y + 0.35 + Math.random() * (CEIL_Y - GROUND_Y - gap - 0.7)
        const hi = lo + gap
        run.spawn(makePair(lo, hi), PW / 2, { lo, hi, minClear: 9 })
      }

      // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __fl: unknown }).__fl = {
          get running() { return !me.over }, get started() { return me.started }, get y() { return me.y }, get vy() { return me.vy },
          get score() { return game.s.score }, get lives() { return game.s.lives }, x: CHICK_X, r: R,
          get pipes() { return run.obstacles.map(o => ({ x: o.x, hw: o.hw, lo: o.data.lo, hi: o.data.hi })) }
        }
      }

      /* --- Boucle --- */
      stage.start((dt, now) => {
        if (fl !== me) return
        game.tick(dt)
        if (me.started) {
          me.vy -= GRAVITY * dt
          me.y += me.vy * dt
        } else me.y = 0.3 + Math.sin(now * 0.004) * 0.06
        if (me.y > CEIL_Y - R) { me.y = CEIL_Y - R; me.vy = Math.min(me.vy, 0) }
        if (me.y < GROUND_Y + R) {
          me.y = GROUND_Y + R
          if (me.started && !me.over) { hurt(me, 'sol'); me.vy = FLAP_V } // le sol coûte un cœur, et relance comme un coup d'aile
          else me.vy = 0
        }
        if (me.started && !me.over) {
          const last = run.last()
          const space = Math.max(2.6, cfg.space - game.s.level * 0.15)
          if (!last || last.x < SPAWN_X - space) spawn()
        }
        run.update(dt, {
          onPass: ob => {
            if (me.over) return
            const close = ob.data.minClear < 0.09
            game.hit(1, { perfect: close })
            if (close) { sfx('whoosh', { vol: 0.45, rate: 1.2 }); game.flash(ICON.bolt, 'good'); feathers(me, 3) }
            impact(0.2, { matter: 'neige', noShake: true })
          }
        })
        // Collision : le disque du poussin contre les deux fûts
        if (!me.over) for (const ob of run.obstacles) {
          const inX = ob.x + ob.hw > CHICK_X - R && ob.x - ob.hw < CHICK_X + R
          if (!inX) continue
          ob.data.minClear = Math.min(ob.data.minClear, me.y - R - ob.data.lo, ob.data.hi - (me.y + R))
          if (me.y - R < ob.data.lo || me.y + R > ob.data.hi) { hurt(me, 'bois'); if (fl !== me) return; me.vy = Math.max(me.vy, 1.4); break }
        }
        // Le poussin : hauteur, piqué, battement, culbute d'outro
        chick.position.y = me.y
        if (me.over) { me.spin += dt * 9; chick.rotation.z = me.spin; chick.rotation.x = Math.sin(me.spin) * 0.4 }
        else chick.rotation.z = Math.max(-0.9, Math.min(0.5, me.vy * 0.28))
        me.flapT = Math.max(0, me.flapT - dt * 4)
        const beat = me.flapT > 0 ? Math.sin(me.flapT * Math.PI * 3) : Math.sin(now * 0.01) * 0.25
        for (const w of wings) w.pivot.rotation.x = w.side * beat * 0.9
        run.blink(chick, now)
        stage.camera.position.set(0, 0.45, 4.6)
        stage.camera.lookAt(0, 0.1, 0)
        me.shake.apply(dt)
        me.fx.update(dt)
      })

      const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); flap(me) } }
      const onTap = (e: Event) => { e.preventDefault(); flap(me) }
      area.addEventListener('pointerdown', onTap)
      window.addEventListener('keydown', onKey)

      stage.keep({ dispose() {
        area.removeEventListener('pointerdown', onTap)
        window.removeEventListener('keydown', onKey)
        cloudGeo.dispose(); cloudMat.dispose(); woodMat.dispose(); capMat.dispose()
        me.fx.dispose()
        me.game.dispose()
      } })
    })().catch(err => { if (!dead) throw err })

    return () => {
      dead = true
      if (fl) { fl.stage.dispose(); fl = null }
    }
  }
}
