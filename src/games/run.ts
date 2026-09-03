import type { GameContext, GameDef } from '../core/types'
import { impact } from '../core/impact'
import { $ } from '../core/utils'
import { ICON } from '../core/icons'
import { sfx, preloadSfx } from '../core/sfx'
import { arcade, type Arcade } from '../core/arcade'
import { runner, scrollTex, type Runner } from '../core/runner'
import { ground, decor, particles, camShake, type Particles, type CamShake } from '../core/scene3d'
import {
  createStage, loadThree, loader, loadModel, fitModel, avatarMedallion,
  type Stage, type T3
} from '../core/three3d'

/* 🚜 Course — un tracteur low-poly fonce sur un chemin de terre au crépuscule
   et saute rondins, rochers, souches et bottes de foin.

   Refonte sur core/runner.ts + core/arcade.ts :
   - une seule boucle, en mètres et en secondes (plus de pixels virtuels) ;
   - le score, c'est le nombre d'obstacles sautés ; la vitesse monte tous
     les 5 sauts, et des DOUBLES arrivent aux paliers hauts ;
   - un saut de 0,95 m pour des obstacles de 0,3 à 0,45 m — proportionné,
     avec un tampon d'entrée : taper juste avant d'atterrir, ça ressaute ;
   - le near-miss : frôler un obstacle ou atterrir juste derrière, ça fait
     « Ouf ! » ; percuter, ça envoie l'obstacle valser, secoue la caméra,
     coûte un cœur ; au dernier cœur, le tracteur se renverse au ralenti. */

const PLAYER_X = 0
const SPAWN_X = 9.5
const DESPAWN_X = -4.5
const JUMP_V = 5.2       // m/s → 0,95 m de haut, 0,73 s de vol
const GRAVITY = 14.2
const TRACTOR = { back: -0.24, front: 0.36 } // l'empreinte en x qui compte pour la collision

interface ObData { h: number; knocked: boolean; vx: number; vy: number; rot: number; minClear: number; kind: string }
interface Cfg { speed: number; inc: number; gapMin: number; gapVar: number; doubleFrom: number }

interface State {
  stage: Stage
  game: Arcade
  run: Runner<ObData>
  fx: Particles
  shake: CamShake
  cfg: Cfg
  y: number
  vy: number
  jumping: boolean
  buffered: number      // tampon d'entrée : secondes restantes pour ressauter à l'atterrissage
  nextAt: number        // distance (m) à laquelle naît le prochain obstacle
  over: boolean
  tapHint: HTMLElement
  tractor: import('three').Group
}

let rn: State | null = null
let ctx: GameContext

function jump(me: State) {
  if (me.over) return
  if (me.jumping) { me.buffered = 0.16; return }
  me.jumping = true
  me.vy = JUMP_V
  sfx('cloth', { vol: 0.5, rate: 1.3 })
  me.fx.burst({ x: -0.1, y: 0.04, z: 0 }, { count: 6, color: [0xA8845E, 0x7A5C3E], speed: 1.2, life: 0.5, size: 0.06, gravity: 3, dir: { x: -0.6, y: 0.6, z: 0 } })
  me.tapHint.classList.add('off')
}

function crash(me: State, ob: import('../core/runner').Obstacle<ObData>) {
  const d = ob.data
  d.knocked = true
  d.vx = me.run.speed * 1.6 + 1.5
  d.vy = 3.2
  d.rot = 6 + Math.random() * 4
  impact(0.85, { matter: 'sourd', noShake: true })
  me.shake.hit(0.8)
  sfx('bong', { vol: 0.6, rate: 0.8 })
  me.fx.burst({ x: ob.x, y: d.h * 0.6, z: 0 }, { count: 22, color: [0xA8845E, 0xD9B784, 0x6E6A66], speed: 2.6, life: 0.7, size: 0.06, gravity: 6 })
  me.game.flash(ICON.heartEmpty, 'bad')
  me.y = Math.max(me.y, 0.05); me.vy = 2.2; me.jumping = true // le choc soulève le tracteur
  if (me.game.hurt()) { finish(me); return }
  me.run.hurt(1.2)
}

function finish(me: State) {
  if (me.over) return
  me.over = true
  me.stage.timeScale = 0.35
  const n = me.game.s.score
  const m = Math.floor(me.run.dist)
  const th = ctx.byTier([18, 9], [24, 12], [30, 15])
  me.game.end({
    title: n >= th[0] ? 'Champion du volant !' : n >= th[1] ? 'Belle course !' : 'Le tracteur a versé !',
    msg: `${ctx.playerName} a sauté ${n} obstacle${n > 1 ? 's' : ''} sur ${m} mètres`,
    outroMs: 1300
  })
}

/** Le tracteur : caisses et cylindres low-poly, roues séparées pour tourner. */
function makeTractor(T: T3) {
  const g = new T.Group()
  const red = new T.MeshStandardMaterial({ color: 0xB6382E, roughness: 0.5, metalness: 0.15 })
  const dark = new T.MeshStandardMaterial({ color: 0x22201E, roughness: 0.7 })
  const hub = new T.MeshStandardMaterial({ color: 0xC9A227, roughness: 0.45, metalness: 0.3 })
  const glass = new T.MeshStandardMaterial({ color: 0x9EC7D8, roughness: 0.15, transparent: true, opacity: 0.75 })
  const body = new T.Mesh(new T.BoxGeometry(0.62, 0.3, 0.36), red)
  body.position.set(0.02, 0.34, 0)
  const hood = new T.Mesh(new T.BoxGeometry(0.3, 0.18, 0.3), red)
  hood.position.set(0.34, 0.3, 0)
  const cab = new T.Mesh(new T.BoxGeometry(0.3, 0.26, 0.32), glass)
  cab.position.set(-0.14, 0.6, 0)
  const roof = new T.Mesh(new T.BoxGeometry(0.36, 0.05, 0.36), red)
  roof.position.set(-0.14, 0.76, 0)
  const pipe = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.26, 8), dark)
  pipe.position.set(0.36, 0.5, 0.1)
  const wheels: import('three').Group[] = []
  const mkWheel = (r: number, x: number, z: number) => {
    const w = new T.Group()
    const tire = new T.Mesh(new T.CylinderGeometry(r, r, 0.12, 18), dark)
    tire.rotation.x = Math.PI / 2
    const cap = new T.Mesh(new T.CylinderGeometry(r * 0.45, r * 0.45, 0.13, 12), hub)
    cap.rotation.x = Math.PI / 2
    w.add(tire, cap)
    w.position.set(x, r, z)
    g.add(w)
    wheels.push(w)
  }
  mkWheel(0.24, -0.18, 0.2); mkWheel(0.24, -0.18, -0.2)
  mkWheel(0.15, 0.34, 0.19); mkWheel(0.15, 0.34, -0.19)
  g.add(body, hood, cab, roof, pipe)
  g.traverse(m => { if ((m as import('three').Mesh).isMesh) m.castShadow = true })
  return { g, wheels }
}

export const runGame: GameDef = {
  id: 'run', name: 'Course', icon: '🚜', sq: 'sq-mint', cat: 'action',
  subtitle: 'Tape pour sauter les obstacles',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `<div class="arena g3-arena run3-arena" id="runArea"></div>`
    const area = $('runArea')
    const hideLoader = loader(area, '🚜')
    preloadSfx(['cloth', 'bong', 'whoosh', 'confirm', 'pluck'])

    ;(async () => {
      const T = await loadThree()
      if (dead) return
      const stage: Stage = await createStage(area, {
        sky: '#3B2E5C',
        fog: [9, 20], fogColor: '#3B2E5C',
        cam: [0.5, 1.5, 4.6], target: [0.9, 0.6, 0], fov: 42,
        hemi: ['#FFD9B0', '#241C36', 0.75],
        sun: { pos: [3, 4.5, 3], color: '#FFC98A', intensity: 1.9, area: 7, far: 18 },
        fill: 0.35, exposure: 0.95, iblIntensity: 0.5
      })
      if (dead) { stage.dispose(); return }
      const scene = stage.scene

      /* Le chemin de terre : sa texture DÉFILE, c'est elle qui donne la vitesse */
      const dirt = stage.keep(scrollTex(T, '#5E4530', '#3C2A1B', 8))
      const road = new T.Mesh(new T.PlaneGeometry(22, 1.9), new T.MeshStandardMaterial({ map: dirt, roughness: 0.95 }))
      road.rotation.x = -Math.PI / 2
      road.position.set(2, 0.002, 0)
      road.receiveShadow = true
      scene.add(road)
      const g = ground(stage, { radius: 26, color: 0x2C4A2E, roughness: 0.98 })
      g.position.set(2, -0.004, 0)

      /* Le décor du kit nature en deux couches qui bouclent : arbres proches et lointains */
      const span = 18
      // Les arbres proches restent DERRIÈRE le chemin : devant, ils boucheraient la vue
      const near = Array.from({ length: 7 }, (_, i) => ({ model: `nature/${['tree_default', 'tree_oak', 'tree_fat', 'tree_pineRoundA'][i % 4]}`, x: -6 + i * (span / 7) + Math.random(), z: -(1.9 + Math.random() * 0.9), size: 1.5 + Math.random() * 0.6, tint: 0x5E9A3C }))
      const far = Array.from({ length: 8 }, (_, i) => ({ model: `nature/${['tree_pineDefaultA', 'tree_cone', 'tree_pineRoundC'][i % 3]}`, x: -8 + i * (span / 8), z: -4.2 - Math.random() * 1.5, size: 2.2 + Math.random(), tint: 0x4C7F38 }))
      const bits = Array.from({ length: 10 }, (_, i) => {
        const side = i % 2 ? 1 : -1
        return { model: `nature/${['rock_smallA', 'plant_bush', 'grass_large', 'flower_yellowA', 'mushroom_red'][i % 5]}`, x: -7 + i * (span / 10) + Math.random() * 0.8, z: side * (1.15 + Math.random() * 0.3), size: 0.22 + Math.random() * 0.14, tint: 0x8FB56A }
      })

      /* Les obstacles : vrais modèles du kit nature + une botte de foin maison */
      const protos: { g: import('three').Object3D; h: number; hw: number; kind: string }[] = []
      const mk = async (name: string, h: number, hw: number, tint: number, rot = 0) => {
        const m = await loadModel('nature', name)
        fitModel(T, m, h)
        const col = new T.Color(tint)
        m.traverse(o => {
          const mesh = o as import('three').Mesh
          if (!mesh.isMesh) return
          const mat = (mesh.material as import('three').MeshStandardMaterial).clone()
          mat.color.multiply(col)
          mesh.material = mat
          mesh.castShadow = true
        })
        const box = new T.Box3().setFromObject(m)
        const wrap = new T.Group()
        m.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2)
        m.rotation.y = rot
        wrap.add(m)
        protos.push({ g: wrap, h, hw, kind: name })
      }
      await Promise.all([
        mk('log', 0.34, 0.24, 0xB89468, Math.PI / 2),
        mk('rock_smallA', 0.32, 0.22, 0xA89A88),
        mk('stump_round', 0.36, 0.2, 0xB08A5E),
        mk('rock_largeA', 0.44, 0.26, 0x9C9288)
      ])
      const hayMat = new T.MeshStandardMaterial({ color: 0xB08D3E, roughness: 0.9 })
      const hay = new T.Group()
      const hm = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 0.42, 14), hayMat)
      hm.rotation.x = Math.PI / 2; hm.position.y = 0.22; hm.castShadow = true
      hay.add(hm)
      protos.push({ g: hay, h: 0.44, hw: 0.22, kind: 'hay' })
      if (dead) { stage.dispose(); return }

      /* Le tracteur, et c'est ELLE qui conduit */
      const { g: tractor, wheels } = makeTractor(T)
      scene.add(tractor)
      avatarMedallion(T, c.avatar, 0.26).then(med => { if (med && rn) { med.position.set(-0.14, 1.02, 0); tractor.add(med) } })

      hideLoader()
      const tapHint = document.createElement('div')
      tapHint.className = 'tap-hint'
      tapHint.innerHTML = ICON.tap
      area.appendChild(tapHint)

      const cfg: Cfg = c.byTier(
        { speed: 2.1, inc: 0.2, gapMin: 3.4, gapVar: 2.4, doubleFrom: 99 },
        { speed: 2.6, inc: 0.22, gapMin: 2.9, gapVar: 2.0, doubleFrom: 3 },
        { speed: 3.1, inc: 0.24, gapMin: 2.5, gapVar: 1.8, doubleFrom: 2 }
      )
      const game = arcade(c, {
        host: area,
        lives: c.byTier(5, 3, 3),
        scoreIcon: ICON.bolt,
        plainScore: true,
        ramp: { every: 5, max: 8 },
        onLevel: lv => { me.run.speed = cfg.speed + cfg.inc * lv; sfx('confirm', { vol: 0.5, rate: 1.2 }) },
        stars: s => { const th = c.byTier([18, 9], [24, 12], [30, 15]); return s.score >= th[0] ? 3 : s.score >= th[1] ? 2 : 1 }
      })
      const run = runner<ObData>(stage, { speed: cfg.speed, spawnX: SPAWN_X, despawnX: DESPAWN_X, playerX: PLAYER_X })
      const me: State = {
        stage, game, run, fx: particles(stage, 400), shake: camShake(stage), cfg,
        y: 0, vy: 0, jumping: false, buffered: 0, nextAt: 4, over: false, tapHint, tractor
      }
      rn = me

      decor(stage, [...near, ...far, ...bits]).then(grp => {
        if (rn !== me) return
        const kids = grp.children
        run.layer(kids.slice(0, near.length), 1, span, -8)
        run.layer(kids.slice(near.length, near.length + far.length), 0.45, span, -10)
        run.layer(kids.slice(near.length + far.length), 1, span, -8)
      }).catch(() => { /* sans décor, le jeu tourne */ })

      const spawnOne = (x: number) => {
        const p = protos[Math.floor(Math.random() * protos.length)]
        const obj = p.g.clone(true)
        run.spawn(obj, p.hw, { h: p.h, knocked: false, vx: 0, vy: 0, rot: 0, minClear: 9, kind: p.kind }, x)
      }
      const spawn = () => {
        const lv = game.s.level
        spawnOne(SPAWN_X)
        if (lv >= cfg.doubleFrom && Math.random() < 0.3) spawnOne(SPAWN_X + 0.78)
        me.nextAt = run.dist + Math.max(2.1, cfg.gapMin - lv * 0.1) + Math.random() * cfg.gapVar
      }

      // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __run: unknown }).__run = {
          get running() { return !me.over }, get speed() { return run.speed }, get y() { return me.y },
          get jumping() { return me.jumping }, get dist() { return run.dist }, get lives() { return game.s.lives },
          get score() { return game.s.score },
          get obstacles() { return run.obstacles.filter(o => !o.data.knocked).map(o => ({ x: o.x, hw: o.hw, h: o.data.h })) },
          front: TRACTOR.front
        }
      }

      /* --- Boucle --- */
      let smokeAt = 0
      let tilt = 0
      stage.start((dt, now) => {
        if (rn !== me) return
        game.tick(dt)
        // Le saut
        if (me.jumping) {
          me.y += me.vy * dt
          me.vy -= GRAVITY * dt
          if (me.y <= 0) {
            me.y = 0; me.jumping = false; me.vy = 0
            if (!me.over) {
              me.fx.burst({ x: -0.1, y: 0.04, z: 0 }, { count: 10, color: [0xA8845E, 0x7A5C3E], speed: 1.4, life: 0.5, size: 0.06, gravity: 3, dir: { x: -0.6, y: 0.5, z: 0 } })
              impact(0.35, { matter: 'sourd', noShake: true })
              // Atterrir juste derrière un obstacle : c'est le near-miss
              const justBehind = run.obstacles.find(o => o.passed && !o.data.knocked && PLAYER_X + TRACTOR.back - (o.x + o.hw) < 0.3)
              if (justBehind && justBehind.data.minClear < 0.16) { sfx('whoosh', { vol: 0.5 }); game.flash(ICON.bolt, 'good') }
              if (me.buffered > 0) { me.buffered = 0; jump(me) }
            }
          }
        }
        if (me.buffered > 0) me.buffered -= dt
        // Le monde avance (l'outro le ralentit avec timeScale)
        const v = run.speed * dt
        run.update(dt, {
          onPass: ob => {
            if (ob.data.knocked || me.over) return
            const close = ob.data.minClear < 0.16
            game.hit(1, { perfect: close })
            if (close) { sfx('whoosh', { vol: 0.5, rate: 1.1 }) }
          }
        })
        dirt.offset.x += v / (22 / 8)
        for (const w of wheels) w.rotation.z -= v / 0.2
        if (!me.over && run.dist >= me.nextAt) spawn()
        // Collision : empreinte du tracteur contre la boîte de l'obstacle ;
        // un obstacle percuté vole et tourne
        for (const ob of run.obstacles) {
          const d = ob.data
          if (d.knocked) {
            d.vx *= 0.99; d.vy -= GRAVITY * dt
            ob.obj.position.y += d.vy * dt; ob.x += d.vx * dt
            ob.obj.rotation.z += d.rot * dt
            continue
          }
          if (me.over) continue
          const overlap = ob.x + ob.hw > PLAYER_X + TRACTOR.back && ob.x - ob.hw < PLAYER_X + TRACTOR.front
          if (!overlap) continue
          d.minClear = Math.min(d.minClear, me.y - d.h)
          if (me.y < d.h - 0.06 && run.invuln <= 0) { crash(me, ob); break }
        }
        // Le tracteur : hauteur, cabrage, trépidation, renversement d'outro
        tractor.position.y = me.y + (me.jumping ? 0 : Math.abs(Math.sin(now / 90)) * 0.012)
        if (me.over) { tilt = Math.min(1.1, tilt + dt * 2.2); tractor.rotation.z = tilt; tractor.position.y = me.y + Math.sin(tilt) * 0.3 }
        else tractor.rotation.z = me.jumping ? Math.max(-0.35, Math.min(0.3, me.vy * 0.07)) : Math.sin(now / 60) * 0.008
        run.blink(tractor, now)
        // Fumée de cheminée : un pof régulier, plus dense quand ça va vite
        if (now - smokeAt > Math.max(120, 300 - run.speed * 40)) {
          smokeAt = now
          me.fx.burst({ x: 0.36, y: me.y + 0.66, z: 0.1 }, { count: 1, color: 0x9A93A8, speed: 0.5, spread: 0.2, life: 0.9, size: 0.14, gravity: -0.6, dir: { x: -0.7, y: 1, z: 0 } })
        }
        // La caméra recule un peu avec la vitesse, et tremble aux chocs
        const back = (run.speed - cfg.speed) * 0.25
        stage.camera.position.set(0.5 + back * 0.3, 1.5 + back * 0.2, 4.6 + back)
        stage.camera.lookAt(0.9 + back * 0.4, 0.6, 0)
        me.shake.apply(dt)
        me.fx.update(dt)
      })

      const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); jump(me) } }
      const onTap = (e: Event) => { e.preventDefault(); jump(me) }
      window.addEventListener('keydown', onKey)
      area.addEventListener('pointerdown', onTap)

      stage.keep({ dispose() {
        window.removeEventListener('keydown', onKey)
        area.removeEventListener('pointerdown', onTap)
        hm.geometry.dispose(); hayMat.dispose()
        me.fx.dispose()
        me.game.dispose()
      } })
    })().catch(err => { if (!dead) throw err })

    return () => {
      dead = true
      if (rn) { rn.stage.dispose(); rn = null }
    }
  }
}
