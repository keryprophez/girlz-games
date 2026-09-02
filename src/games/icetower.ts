import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { tone } from '../core/audio'
import { force, impact } from '../core/impact'
import { createStage, fixedStep, loader, loadPhysics, snowTex, type Stage, type Cannon, type T3 } from '../core/three3d'
import { arcade, type Arcade } from '../core/arcade'
import { ground, decor, particles, camShake, ring, type Particles, type CamShake } from '../core/scene3d'
import { ICON } from '../core/icons'
import { sfx, preloadSfx } from '../core/sfx'

/* La Tour de Glace — l'archétype du bon jeu Flash : UN SEUL GESTE, un plafond
   d'adresse infini, un ÉCHEC RÉEL, un réessai immédiat.

   Un bloc de glace se balance au bout d'une grue. Un tap le lâche. La physique
   décide : bien centré → la tour monte et le combo « PARFAIT » grimpe ; décalé
   → le bloc dépasse, la tour penche, et elle peut s'écrouler. Le balancier
   accélère avec chaque bloc posé (la rampe suit la performance), les blocs
   rétrécissent à mesure qu'on monte, et un « tic » à chaque extrémité du
   balancier fait jouer à l'oreille. Quand la tour tombe, on la VOIT tomber
   (outro au ralenti), puis seulement le score.

   Premier jeu sur core/arcade.ts + core/scene3d.ts (2/09). Aucun palier de
   déblocage : la seule récompense est de mieux jouer. */

const BLOCK_H = 0.34
const BASE_W = 1.5
const CRANE_H = 1.65       // le bloc doit TOUJOURS rester visible au-dessus du sommet
const SETTLE_S = 1.3
const OUTRO_MS = 1800

interface Block { mesh: import('three').Mesh; body: import('cannon-es').Body; w: number }
interface Swing extends Block { y: number; t: number; dropped: boolean; dropAt: number; lastSide: number }

interface State {
  stage: Stage
  T: T3
  CANNON: Cannon
  world: import('cannon-es').World
  matIce: import('cannon-es').Material
  cable: import('three').Mesh
  iceMap: import('three').Texture
  RB: typeof import('three/examples/jsm/geometries/RoundedBoxGeometry.js')
  game: Arcade
  fx: Particles
  shake: CamShake
  blocks: Block[]
  swing: Swing | null
  placed: number
  topY: number
  swingSpeed: number
  swingSpan: number
  busy: boolean
  camY: number
  over: boolean
  tapHint: HTMLElement
}

let it: State | null = null
let ctx: GameContext

function iceTex(T: T3): import('three').Texture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 128, 128)
  grad.addColorStop(0, '#BFE4F6'); grad.addColorStop(0.4, '#79B8DC'); grad.addColorStop(1, '#3A72A0')
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128)
  // Fissures et éclats : la glace n'est jamais lisse
  for (let i = 0; i < 9; i++) {
    g.strokeStyle = `rgba(226,244,255,${0.18 + Math.random() * 0.22})`
    g.lineWidth = 1 + Math.random() * 2
    const x = Math.random() * 128, y = Math.random() * 128
    g.beginPath(); g.moveTo(x, y)
    g.lineTo(x + (Math.random() - 0.5) * 44, y + (Math.random() - 0.5) * 44)
    g.stroke()
  }
  g.fillStyle = 'rgba(226,244,255,.3)'
  g.fillRect(8, 8, 44, 12)
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  return t
}

/** Un nouveau bloc part se balancer au bout de la grue. */
function nextBlock(me: State) {
  const { T, CANNON, RB } = me
  const w = Math.max(0.62, BASE_W - me.placed * 0.028)   // ça rétrécit : la difficulté monte
  const y = me.topY + CRANE_H
  const mesh = new T.Mesh(
    new RB.RoundedBoxGeometry(w, BLOCK_H, 0.82, 3, 0.045),
    new T.MeshStandardMaterial({ map: me.iceMap, color: 0x5FA8D4, roughness: 0.2, metalness: 0.1 })
  )
  mesh.castShadow = true; mesh.receiveShadow = true
  me.stage.scene.add(mesh)
  const body = new CANNON.Body({
    mass: 1.1, material: me.matIce,
    shape: new CANNON.Box(new CANNON.Vec3(w / 2, BLOCK_H / 2, 0.41)),
    type: CANNON.Body.STATIC
  })
  body.position.set(0, y, 0)
  me.world.addBody(body)
  body.allowSleep = true
  body.sleepSpeedLimit = 0.2
  body.sleepTimeLimit = 0.35
  me.swing = { mesh, body, w, y, t: Math.random() * 6.28, dropped: false, dropAt: 0, lastSide: 0 }
  me.cable.visible = true
}

function drop() {
  const me = it
  if (!me || me.over || !me.swing || me.swing.dropped || me.busy) return
  const s = me.swing
  s.dropped = true
  me.busy = true
  me.cable.visible = false
  me.tapHint.classList.add('off')
  s.body.type = me.CANNON.Body.DYNAMIC
  s.body.wakeUp()
  s.body.updateMassProperties()
  s.body.velocity.set(0, 0, 0)   // chute franche, sans impulsion artificielle
  s.body.angularVelocity.set(0, 0, 0)
  s.dropAt = me.game.s.time
  sfx('drop', { vol: 0.5, rate: 1.2 })
}

function judge(me: State) {
  const s = me.swing!
  const { T } = me
  const expected = me.topY + BLOCK_H / 2
  const dx = Math.abs(s.body.position.x)
  const fell = s.body.position.y < expected - BLOCK_H * 0.75
  const q = s.body.quaternion
  const tilted = Math.abs(new T.Euler().setFromQuaternion(new T.Quaternion(q.x, q.y, q.z, q.w)).z) > 0.5
  const p = s.body.position

  if (fell || tilted) {
    // ÉCHEC RÉEL : le bloc a raté la tour. Un vrai fracas, la caméra tremble.
    impact(0.95, { matter: 'glace', noShake: true })
    me.shake.hit(0.9)
    me.fx.burst(p, { count: 26, color: [0xDFF3FF, 0x9ED2F0, 0xFFFFFF], speed: 3.2, life: 0.9, size: 0.11 })
    me.game.flash(ICON.heartEmpty, 'bad')
    me.blocks.push(s)     // il reste dans la scène, tombé au sol : la preuve de l'erreur
    me.swing = null
    const dead = me.game.hurt()
    if (dead) { gameOver(me, false); return }
    me.busy = false
    nextBlock(me)
    return
  }

  // Posé !
  me.placed++
  me.topY += BLOCK_H
  me.blocks.push(s)
  const perfect = dx < 0.075
  // La rampe suit la performance : chaque bloc posé accélère un peu le balancier
  me.swingSpeed = Math.min(me.swingSpeed * 1.035, ctx.byTier(1.05, 1.5, 1.9) * 1.8)
  if (perfect) {
    // Le son monte avec le combo : la récompense sonore de l'adresse
    const c = me.game.s.combo
    tone(520 + Math.min(12, c) * 70, 0.13, 'sine', 0.13)
    setTimeout(() => tone(720 + Math.min(12, c) * 80, 0.12, 'sine', 0.1), 90)
    me.fx.burst({ x: p.x, y: p.y + BLOCK_H / 2, z: p.z + 0.3 }, { count: 22, color: [0xFFE08A, 0xFFFFFF, 0xFFC533], speed: 2.4, life: 0.8, size: 0.1, gravity: 3 })
    me.game.hit(2, { perfect: true, silent: true })
    if (me.game.s.combo >= 4) me.game.flash('×' + me.game.s.combo)
  } else {
    // Posé de travers : le choc se sent d'autant plus que le bloc est décalé
    const f = force(0.9 + dx * 9, 1, 7)
    impact(f, { matter: 'glace', noShake: true })
    me.shake.hit(f * 0.5)
    me.fx.burst({ x: p.x, y: p.y - BLOCK_H / 2, z: p.z + 0.3 }, { count: 10, color: [0xDFF3FF, 0xFFFFFF], speed: 1.6, life: 0.6, size: 0.07 })
    me.game.hit(1)
  }
  me.swing = null
  me.busy = false
  nextBlock(me)
}

function gameOver(me: State, collapsed: boolean) {
  if (me.over) return
  me.over = true
  me.cable.visible = false
  // Outro : la physique continue AU RALENTI, la caméra recule, on regarde la
  // tour tomber. Le score n'arrive qu'après.
  me.stage.timeScale = 0.45
  if (collapsed) { impact(1, { matter: 'glace', noShake: true }); me.shake.hit(1) }
  const h = me.placed
  const best = me.game.s.bestCombo
  me.game.end({
    title: h >= 14 ? 'Tour GÉANTE !' : h >= 7 ? 'Belle tour !' : 'La tour s\'écroule !',
    msg: `${ctx.playerName} a empilé ${h} blocs de glace` + (best >= 4 ? ` et enchaîné ${Math.floor(best / 2)} parfaits` : ''),
    outroMs: OUTRO_MS
  })
}

export const icetower: GameDef = {
  id: 'icetower', name: 'La Tour de Glace', icon: '🏔', sq: 'sq-sky', cat: 'action', music: 'winter',
  subtitle: 'Un tap pour lâcher le bloc. Monte le plus haut possible !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `<div class="arena it-arena" id="itArena"></div>`
    const arena = $('itArena')
    const hideLoader = loader(arena, '🧊')
    preloadSfx(['tick', 'drop', 'confirm', 'pluck', 'error'])
    let dead = false

    ;(async () => {
      const [[T, CANNON], RB] = await Promise.all([
        loadPhysics(),
        import('three/examples/jsm/geometries/RoundedBoxGeometry.js')
      ])
      if (dead) return
      const stage = await createStage(arena, {
        sky: '#1B3350', fog: [15, 40], fogColor: '#1E3A59',
        cam: [0, 1.5, 8.4], target: [0, 1.1, 0], fov: 34,
        hemi: ['#BBD8F0', '#24405E', 0.7],
        sun: { pos: [4, 8, 6], color: '#FFF0D4', intensity: 1.6, area: 6, far: 30 },
        fill: 0.25, exposure: 0.9, iblIntensity: 0.55
      })
      if (dead) { stage.dispose(); return }
      const { scene } = stage

      const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) })
      world.broadphase = new CANNON.SAPBroadphase(world)
      ;(world.solver as unknown as { iterations: number }).iterations = 20
      world.allowSleep = true
      const matIce = new CANNON.Material('ice')
      // Frottement élevé : les blocs adhèrent mais un porte-à-faux fait basculer
      world.addContactMaterial(new CANNON.ContactMaterial(matIce, matIce, { friction: 0.62, restitution: 0.02 }))

      // Neige au sol, un peu bleutée par la nuit
      const snow = stage.keep(snowTex(T, 8))
      const g = ground(stage, { radius: 26, map: snow, color: 0x9FB8D0, roughness: 0.98 })
      void g
      world.addBody(new CANNON.Body({
        type: CANNON.Body.STATIC, material: matIce, shape: new CANNON.Plane(),
        quaternion: new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0)
      }))

      // Socle de départ
      const baseMesh = new T.Mesh(
        new RB.RoundedBoxGeometry(BASE_W + 0.35, 0.3, 1, 2, 0.03),
        new T.MeshStandardMaterial({ color: 0x37597B, roughness: 0.82 })
      )
      baseMesh.position.set(0, 0.15, 0)
      baseMesh.castShadow = true; baseMesh.receiveShadow = true
      scene.add(baseMesh)
      world.addBody(new CANNON.Body({
        type: CANNON.Body.STATIC, material: matIce,
        shape: new CANNON.Box(new CANNON.Vec3((BASE_W + 0.35) / 2, 0.15, 0.5)),
        position: new CANNON.Vec3(0, 0.15, 0)
      }))

      // Repère central : rend l'adresse APPRENABLE (on voit où viser)
      const guide = new T.Mesh(
        new T.PlaneGeometry(0.035, 40),
        new T.MeshBasicMaterial({ color: 0xFFB13D, transparent: true, opacity: 0.32 })
      )
      guide.position.set(0, 20, -0.5)
      scene.add(guide)

      // Câble de la grue
      const cable = new T.Mesh(
        new T.CylinderGeometry(0.018, 0.018, 1, 6),
        new T.MeshBasicMaterial({ color: 0x8AA6B8 })
      )
      scene.add(cable)

      // Sapins enneigés (Holiday Kit) et rochers : un vrai décor, posé une fois
      // Une forêt en arc derrière la tour, loin pour ne pas la concurrencer
      const trees = ring(11, 7, 13, [Math.PI * 0.06, Math.PI * 0.94]).map(([x, z], i) => ({
        model: `holiday/tree-snow-${'abc'[i % 3]}`, x: x * 1.15, z: -Math.abs(z) - 3, size: 1.4 + Math.random() * 1.3
      }))
      decor(stage, trees).catch(() => { /* sans décor, le jeu tourne quand même */ })

      const tapHint = document.createElement('div')
      tapHint.className = 'tap-hint'
      tapHint.innerHTML = ICON.tap
      arena.appendChild(tapHint)

      const game = arcade(c, {
        host: arena,
        lives: c.byTier(5, 3, 2),
        scoreIcon: ICON.cube,
        stars: s => (s.score >= 26 ? 3 : s.score >= 12 ? 2 : 1)
      })

      const me: State = {
        stage, T, CANNON, world, matIce, cable, RB,
        iceMap: stage.keep(iceTex(T)),
        game, fx: particles(stage, 500), shake: camShake(stage),
        blocks: [], swing: null, placed: 0, topY: 0.3,
        swingSpeed: c.byTier(1.05, 1.5, 1.9),
        swingSpan: c.byTier(1.05, 1.35, 1.55),
        busy: false, camY: 1.1, over: false, tapHint
      }
      it = me
      hideLoader()
      nextBlock(me)

      arena.addEventListener('pointerdown', drop)
      const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Enter') drop() }
      window.addEventListener('keydown', onKey)

      const step = fixedStep(1 / 60, 4)
      let outroT = 0
      stage.start(dt => {
        if (it !== me) return
        game.tick(dt)

        // Le bloc se balance tant qu'on ne l'a pas lâché ; un « tic » à chaque
        // extrémité : le rythme s'entend, une enfant de 6 ans joue à l'oreille
        const s = me.swing
        if (s && !s.dropped) {
          s.t += dt * me.swingSpeed
          const x = Math.sin(s.t) * me.swingSpan
          const side = Math.cos(s.t) >= 0 ? 1 : -1
          if (side !== s.lastSide) { if (s.lastSide !== 0) sfx('tick', { vol: 0.55, rate: 1.1 }); s.lastSide = side }
          s.body.position.set(x, s.y, 0)
          s.mesh.position.set(x, s.y, 0)
          s.mesh.quaternion.set(0, 0, 0, 1)
          ;(window as unknown as { __towerX: number }).__towerX = x  // accroche pour les tests automatisés
          cable.position.set(x, s.y + CRANE_H * 0.32, 0)
          cable.scale.y = CRANE_H * 0.64
        }

        step(dt, () => world.step(1 / 60))

        for (const b of me.blocks) {
          b.mesh.position.copy(b.body.position as unknown as import('three').Vector3)
          b.mesh.quaternion.copy(b.body.quaternion as unknown as import('three').Quaternion)
        }
        if (s && s.dropped) {
          s.mesh.position.copy(s.body.position as unknown as import('three').Vector3)
          s.mesh.quaternion.copy(s.body.quaternion as unknown as import('three').Quaternion)
          const el = game.s.time - s.dropAt
          if (!me.over && (el > SETTLE_S || (el > 0.2 && s.body.velocity.length() < 0.45))) judge(me)
        }

        // La tour s'est écroulée ? Le sommet réel a chuté → fin (et on regarde)
        if (!me.over && me.placed >= 3) {
          const top = me.blocks[me.blocks.length - 1]
          if (top && top.body.position.y < me.topY - BLOCK_H * 2.5) gameOver(me, true)
        }

        // La caméra suit le sommet (recul progressif : on voit la tour entière) ;
        // pendant l'outro elle recule franchement pour cadrer la chute
        if (me.over) outroT += dt
        const want = me.over ? Math.max(0.9, me.topY * 0.45) : me.topY + 0.55
        me.camY += (want - me.camY) * Math.min(1, dt * 2.8)
        const cam = stage.camera
        cam.position.set(0, me.camY, 7.2 + Math.min(3, me.topY * 0.22) + (me.over ? Math.min(4, outroT * 6) : 0))
        cam.lookAt(0, me.camY, 0)
        me.shake.apply(dt)
        if (stage.sun) {
          stage.sun.position.set(4, me.camY + 8, 6)
          stage.sun.target.position.set(0, me.camY, 0)
          stage.sun.target.updateMatrixWorld()
        }
        me.fx.update(dt)
      })

      me.stage.keep({ dispose() {
        arena.removeEventListener('pointerdown', drop)
        window.removeEventListener('keydown', onKey)
        me.fx.dispose()
        me.game.dispose()
      } })
    })().catch(err => { if (!dead) throw err })

    return () => {
      dead = true
      if (it) {
        it.stage.dispose()
        it = null
      }
    }
  }
}
