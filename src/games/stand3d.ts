import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { force, impact } from '../core/impact'
import { createStage, loader, loadPhysics, fixedStep, type Stage, type T3, type Cannon } from '../core/three3d'
import { arcade, type Arcade } from '../core/arcade'
import { ground, decor, particles, camShake, type Particles, type CamShake } from '../core/scene3d'
import { ICON } from '../core/icons'
import { sfx, preloadSfx } from '../core/sfx'

/* Le Stand 3D, refait le 9/09 — le chamboule-tout de la fête foraine, en
   vraie 3D (three.js) avec une vraie physique rigide (cannon-es). On tire la
   balle vers le bas, la trajectoire s'affiche, on lâche : les caisses
   s'écroulent pour de vrai.

   La boucle :
   - une MANCHE = une pile de caisses ; tout faire tomber = manche gagnée,
     la pile suivante arrive : plus de caisses, plus lourdes, plus loin ;
   - chaque caisse tombée = un point, et les caisses tombées d'un même lancer
     font monter le combo (« ×3 » quand on en couche trois d'un coup) ;
   - un lancer qui ne fait rien tomber coûte un cœur : c'est l'enjeu. La
     partie finit quand les cœurs sont épuisés, pas sur un compte de balles ;
   - le « presque » : une caisse qui vacille et se rattrape ;
   - zéro lecture : le geste est montré par la trajectoire qui pulse avant le
     premier lancer, la puissance est normalisée à la hauteur de l'arène.

   Quatrième jeu sur core/three3d.ts + core/arcade.ts + core/scene3d.ts. */

interface Crate {
  mesh: import('three').Mesh
  body: import('cannon-es').Body
  down: boolean
  y0: number
  /** Inclinaison maximale vue pendant le lancer en cours (near-miss). */
  tilt: number
}

interface State {
  stage: Stage
  T: T3
  CANNON: Cannon
  world: import('cannon-es').World
  game: Arcade
  fx: Particles
  shake: CamShake
  crates: Crate[]
  crateMats: import('three').Material[]
  crateGeo: import('three').BufferGeometry
  matWood: import('cannon-es').Material
  shelf: import('three').Group
  shelfBody: import('cannon-es').Body
  ball: import('three').Mesh
  ballBody: import('cannon-es').Body
  trail: import('three').Group
  trailDots: import('three').Mesh[]
  trailMat: import('three').MeshBasicMaterial
  aimV: { x: number; y: number; z: number } | null
  /** La trajectoire de démonstration pulse tant qu'on n'a pas encore tiré. */
  demo: boolean
  thrown: boolean
  /** Temps simulé écoulé depuis le lancer (s). */
  flight: number
  /** Points marqués pendant le lancer en cours. */
  knocked: number
  round: number
  over: boolean
  /** Manche en cours de changement : on ne tire pas. */
  building: boolean
  norm: number
  tapHint: HTMLElement
  lastThud: number
}

let st: State | null = null
let ctx: GameContext

/* ---------- Réglages ---------- */
const BANDS = ['#E8574C', '#3F8FD0', '#F2A93B', '#57B267', '#8E6FD4', '#E86FA0']
const CRATE = 0.3
const GAP = 0.045
const SHELF_Y = 0.92
const BALL_R = 0.1
const BALL_START = { x: 0, y: 0.72, z: 2.1 }
const G = 9.82
const CAM = { pos: [0, 2.05, 3.95] as [number, number, number], look: [0, 1.02, -0.15] as [number, number, number] }
/** Les piles, manche après manche : nombre de caisses par rangée, du bas vers le haut. */
const ROUNDS: number[][] = [[3, 2, 1], [3, 3], [2, 2, 2], [4, 3, 2, 1], [3, 3, 3], [4, 4, 3], [5, 4, 3, 2, 1]]

/* ---------- Textures procédurales ---------- */
/** Une caisse de foire : planches, bandeau peint, étoile au pochoir. */
function crateTex(T: T3, band: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#C99A5F'; g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 4; i++) {
    const y = i * 64
    g.fillStyle = i % 2 ? '#C08F55' : '#CDA168'
    g.fillRect(0, y, 256, 62)
    g.strokeStyle = 'rgba(120,86,48,.45)'; g.lineWidth = 2
    g.beginPath(); g.moveTo(0, y + 62); g.lineTo(256, y + 62); g.stroke()
    for (let k = 0; k < 7; k++) {
      g.strokeStyle = `rgba(140,100,58,${0.1 + Math.random() * 0.16})`
      g.lineWidth = 1 + Math.random() * 2
      const yy = y + 6 + Math.random() * 50
      g.beginPath(); g.moveTo(0, yy)
      g.bezierCurveTo(80, yy + (Math.random() - 0.5) * 8, 170, yy + (Math.random() - 0.5) * 8, 256, yy)
      g.stroke()
    }
  }
  g.fillStyle = band; g.fillRect(0, 96, 256, 64)
  g.fillStyle = 'rgba(255,255,255,.92)'
  g.save(); g.translate(128, 128)
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 ? 15 : 34
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  g.closePath(); g.fill(); g.restore()
  const v = g.createRadialGradient(128, 128, 60, 128, 128, 190)
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,40,20,.35)')
  g.fillStyle = v; g.fillRect(0, 0, 256, 256)
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** Le fond rayé du stand, rouge et crème. */
function stripeTex(T: T3) {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 256
  const g = c.getContext('2d')!
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#D9675C' : '#F4E9D8'
    g.fillRect(i * 64, 0, 64, 256)
  }
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  return t
}

/* ---------- La visée ---------- */
/** Tirer vers le BAS propulse la balle vers l'avant et vers le haut ; la
    puissance est normalisée à la hauteur de l'arène (même geste sur toute tablette). */
function screenToAim(dx: number, dy: number, norm: number) {
  const power = Math.min(1, Math.hypot(dx, dy) / norm)
  const ang = Math.atan2(dy, dx)
  const p = power * 11.5
  return {
    x: -Math.cos(ang) * p * 0.42,
    y: Math.max(0, Math.sin(ang)) * p * 0.42,
    z: -Math.max(0, Math.sin(ang)) * p
  }
}

function updateTrail(me: State) {
  const v = me.aimV
  if (!v) { me.trail.visible = false; return }
  me.trail.visible = true
  const N = me.trailDots.length
  for (let i = 0; i < N; i++) {
    const t = (i + 1) * 0.045
    const d = me.trailDots[i]
    d.position.set(BALL_START.x + v.x * t, BALL_START.y + v.y * t - 0.5 * G * t * t, BALL_START.z + v.z * t)
    const vis = d.position.y > 0.02
    d.visible = vis
    d.scale.setScalar(vis ? 1 - i / (N * 1.4) : 0.001)
  }
}

/* ---------- Les manches ---------- */
function clearPile(me: State) {
  for (const cr of me.crates) {
    me.stage.scene.remove(cr.mesh)
    me.world.removeBody(cr.body)
  }
  me.crates = []
}

/** Monte la pile de la manche : plus de caisses, plus lourdes, plus loin. */
function buildPile(me: State) {
  const { T, CANNON } = me
  clearPile(me)
  const rows = ROUNDS[Math.min(me.round, ROUNDS.length - 1)]
  const z = -0.3 * Math.min(me.round, 4)
  const mass = Math.min(1.1, 0.6 + me.round * 0.08)
  me.shelf.position.z = z
  me.shelfBody.position.z = z
  let i = 0
  rows.forEach((n, row) => {
    for (let k = 0; k < n; k++) {
      const x = (k - (n - 1) / 2) * (CRATE + GAP)
      const y = SHELF_Y + 0.045 + CRATE / 2 + row * (CRATE + 0.004)
      const mesh = new T.Mesh(me.crateGeo, me.crateMats[i % me.crateMats.length])
      mesh.castShadow = true; mesh.receiveShadow = true
      mesh.position.set(x, y, z)
      me.stage.scene.add(mesh)
      const body = new CANNON.Body({
        mass, material: me.matWood,
        shape: new CANNON.Box(new CANNON.Vec3(CRATE / 2, CRATE / 2, CRATE / 2)),
        position: new CANNON.Vec3(x, y, z)
      })
      body.linearDamping = 0.02
      body.angularDamping = 0.06
      body.allowSleep = true; body.sleepSpeedLimit = 0.12
      // Les caisses qui dégringolent font du bruit, proportionnel au choc
      body.addEventListener('collide', (e: { contact: { getImpactVelocityAlongNormal(): number } }) => {
        if (st !== me || me.game.s.time - me.lastThud < 0.06) return
        const v = Math.abs(e.contact.getImpactVelocityAlongNormal())
        if (v < 1.2) return
        me.lastThud = me.game.s.time
        impact(force(v, 1.2, 7) * 0.7, { matter: 'bois', noShake: true })
      })
      me.world.addBody(body)
      me.crates.push({ mesh, body, down: false, y0: y, tilt: 0 })
      i++
    }
  })
  me.building = false
}

function knockDown(me: State, cr: Crate) {
  if (cr.down || me.over) return
  cr.down = true
  me.knocked++
  me.game.hit(1, { silent: true })
  sfx('chop', { vol: 0.5, rate: 1 + Math.min(6, me.knocked) * 0.06 })
  me.fx.burst(cr.mesh.position, { count: 10, color: [0xD9B27A, 0xA97E4C], speed: 1.6, life: 0.5, size: 0.06, spread: 1 })
  if (me.knocked >= 3) me.game.flash('×' + me.knocked)
  const standing = me.crates.filter(c => !c.down).length
  if (standing === 0) strike(me)
}

/** Tout est tombé : fête, puis la pile suivante. */
function strike(me: State) {
  me.building = true
  me.round++
  me.shake.hit(0.5)
  sfx('confirm', { vol: 0.8 })
  me.game.flash(ICON.star, 'gold')
  me.fx.burst({ x: 0, y: SHELF_Y + 0.6, z: me.shelf.position.z }, { count: 40, color: [0xFFE08A, 0xFFB84D, 0xFFFFFF], speed: 3, life: 0.9, size: 0.09, gravity: 4, spread: 1.4 })
  me.game.after(1400, () => {
    if (st !== me || me.over) return
    buildPile(me)
    me.game.flash(ICON.bolt)
  })
}

function endThrow(me: State) {
  me.thrown = false
  const wobbled = me.crates.some(c => !c.down && c.tilt > 0.28)
  if (me.knocked === 0 && !me.building) {
    if (wobbled) {
      // Le « presque » : une caisse a vacillé puis s'est rattrapée
      sfx('creak', { vol: 0.5 })
      me.game.flash(ICON.target, 'near')
    }
    // Un lancer pour rien : un cœur
    if (me.game.hurt()) { gameOver(me); return }
    me.game.flash(ICON.heartEmpty, 'bad')
  }
  for (const c of me.crates) c.tilt = 0
  resetBall(me)
}

function resetBall(me: State) {
  const { ballBody, CANNON } = me
  ballBody.velocity.setZero()
  ballBody.angularVelocity.setZero()
  ballBody.position.set(BALL_START.x, BALL_START.y, BALL_START.z)
  ballBody.quaternion.set(0, 0, 0, 1)
  ballBody.mass = 0 // figé (piège connu : STATIC seul ne suffit pas)
  ballBody.type = CANNON.Body.STATIC
  ballBody.updateMassProperties()
  me.thrown = false
  me.knocked = 0
  me.flight = 0
}

function throwBall(me: State, v: { x: number; y: number; z: number }) {
  const { ballBody, CANNON } = me
  ballBody.type = CANNON.Body.DYNAMIC
  ballBody.mass = 0.75
  ballBody.updateMassProperties()
  ballBody.wakeUp()
  ballBody.velocity.set(v.x, v.y, v.z)
  ballBody.angularVelocity.set(-v.z * 1.4, 0, v.x * 1.4)
  me.thrown = true
  me.flight = 0
  me.knocked = 0
  for (const c of me.crates) c.tilt = 0
  sfx('whoosh', { vol: 0.6, rate: 0.9 + Math.hypot(v.x, v.y, v.z) / 40 })
}

function gameOver(me: State) {
  if (me.over) return
  me.over = true
  me.trail.visible = false
  // Outro : au ralenti, la caméra s'approche des caisses restées debout
  me.stage.timeScale = 0.5
  const s = me.game.s
  const th = ctx.byTier([10, 22], [14, 30], [18, 40])
  me.game.end({
    title: s.score >= th[1] ? 'Championne du chamboule-tout !' : s.score >= th[0] ? 'Ça dégringole !' : 'Les caisses tiennent bon !',
    msg: `${ctx.playerName} a fait tomber ${s.hits} caisses` + (me.round > 0 ? `, ${me.round} pile${me.round > 1 ? 's' : ''} entière${me.round > 1 ? 's' : ''}` : ''),
    outroMs: 1500
  })
}

export const stand3d: GameDef = {
  id: 'stand3d', name: 'Le Stand 3D', icon: '🎯', sq: 'sq-peach', cat: 'action', music: 'fair',
  subtitle: 'Tire la balle en arrière et fais tomber les caisses !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `<div class="arena g3-arena s3-arena" id="s3Arena"></div>`
    const arena = $('s3Arena')
    const hideLoader = loader(arena, '🎪')
    preloadSfx(['whoosh', 'chop', 'creak', 'confirm', 'error', 'pluck'])
    let dead = false

    ;(async () => {
      const [T, CANNON] = await loadPhysics()
      if (dead) return
      const stage = await createStage(arena, {
        sky: '#7FB0CC', fog: [9, 26], fogColor: '#9CC4DC',
        cam: CAM.pos, target: CAM.look, fov: 48,
        hemi: ['#CFE9FF', '#6E8F52', 1.0],
        sun: { pos: [3.4, 6.2, 4.2], color: '#FFF1D0', intensity: 2.3, area: 4.2, far: 18 },
        fill: 0.5, exposure: 0.95, iblIntensity: 0.55
      })
      if (dead) { stage.dispose(); return }
      const { scene } = stage

      /* --- Monde physique --- */
      const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0) })
      world.broadphase = new CANNON.SAPBroadphase(world)
      ;(world.solver as unknown as { iterations: number }).iterations = 12
      const matWood = new CANNON.Material('wood')
      const matBall = new CANNON.Material('ball')
      world.addContactMaterial(new CANNON.ContactMaterial(matWood, matWood, { friction: 0.45, restitution: 0.06 }))
      world.addContactMaterial(new CANNON.ContactMaterial(matWood, matBall, { friction: 0.3, restitution: 0.25 }))

      /* --- Sol et décor : un pré de fête foraine, des arbres derrière --- */
      ground(stage, { radius: 30, color: 0x4F8F3A, roughness: 0.98 })
      world.addBody(new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: matWood,
        quaternion: new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0) }))
      const back = -4.2
      decor(stage, [
        ...[-6.5, -4.2, -1.8, 1.4, 3.9, 6.4].map((x, i) => ({ model: `nature/${['tree_default', 'tree_oak', 'tree_fat', 'tree_detailed'][i % 4]}`, x, z: back - 1.5 - Math.random() * 1.5, size: 2.6 + Math.random() * 1.2, tint: 0x6EAE48 })),
        ...[-5.6, -4.1, 4.1, 5.6].map(x => ({ model: 'nature/fence_simple', x, z: -2.2, size: 0.7, rot: 0, tint: 0xC9A874 })),
        ...[[-3.2, 1.2], [3.4, 1.0], [-2.6, -1.2], [2.8, -1.1], [-4.4, 0.2], [4.6, 0.4]].map(([x, z], i) => ({ model: `nature/${['flower_redA', 'flower_yellowA', 'flower_purpleA'][i % 3]}`, x, z, size: 0.36, tint: 0xFFFFFF })),
        ...[[-4.6, -1.6], [4.8, -1.4]].map(([x, z]) => ({ model: 'nature/plant_bush', x, z, size: 0.6, tint: 0x6EAE48 }))
      ]).catch(() => { /* sans décor, le jeu tourne */ })

      /* --- Le stand : fond rayé, poteaux, auvent --- */
      const stripes = stage.keep(stripeTex(T))
      const backWall = new T.Mesh(new T.PlaneGeometry(7.2, 3.1), new T.MeshStandardMaterial({ map: stripes, roughness: 0.95 }))
      backWall.position.set(0, 1.55, -2.4)
      backWall.receiveShadow = true
      scene.add(backWall)
      const postMat = new T.MeshStandardMaterial({ color: 0xA9773F, roughness: 0.75 })
      for (const px of [-3.1, 3.1]) {
        const post = new T.Mesh(new T.CylinderGeometry(0.09, 0.1, 3, 12), postMat)
        post.position.set(px, 1.5, -2.1)
        post.castShadow = true
        scene.add(post)
      }
      const awning = new T.Mesh(new T.BoxGeometry(6.6, 0.06, 1.1), new T.MeshStandardMaterial({ map: stripes, roughness: 0.9 }))
      awning.position.set(0, 3.25, -2.0)
      awning.rotation.x = 0.18
      awning.castShadow = true
      scene.add(awning)

      /* --- L'étagère (elle recule avec les manches) --- */
      const shelfMat = new T.MeshStandardMaterial({ color: 0xB0854F, roughness: 0.72 })
      const shelf = new T.Group()
      const top = new T.Mesh(new T.BoxGeometry(2.3, 0.09, 0.62), shelfMat)
      top.position.y = SHELF_Y
      top.castShadow = true; top.receiveShadow = true
      shelf.add(top)
      for (const lx of [-1.0, 1.0]) {
        const leg = new T.Mesh(new T.BoxGeometry(0.1, SHELF_Y, 0.1), shelfMat)
        leg.position.set(lx, SHELF_Y / 2, 0)
        leg.castShadow = true
        shelf.add(leg)
      }
      scene.add(shelf)
      const shelfBody = new CANNON.Body({
        mass: 0, material: matWood,
        shape: new CANNON.Box(new CANNON.Vec3(1.15, 0.045, 0.31)),
        position: new CANNON.Vec3(0, SHELF_Y, 0)
      })
      world.addBody(shelfBody)

      /* --- Caisses : six textures partagées, une géométrie --- */
      const crateGeo = new T.BoxGeometry(CRATE, CRATE, CRATE)
      const crateMats = BANDS.map(b => new T.MeshStandardMaterial({ map: stage.keep(crateTex(T, b)), roughness: 0.55, metalness: 0.03, envMapIntensity: 1.1 }))

      /* --- La balle --- */
      const ball = new T.Mesh(
        new T.SphereGeometry(BALL_R, 32, 24),
        new T.MeshStandardMaterial({ color: 0xE8A13F, roughness: 0.28, metalness: 0.05, envMapIntensity: 1.2 })
      )
      ball.castShadow = true
      scene.add(ball)
      const ballBody = new CANNON.Body({
        mass: 0.75, material: matBall, shape: new CANNON.Sphere(BALL_R),
        position: new CANNON.Vec3(BALL_START.x, BALL_START.y, BALL_START.z)
      })
      ballBody.linearDamping = 0 // trajectoire balistique exacte = prévisualisation honnête
      world.addBody(ballBody)
      ballBody.addEventListener('collide', (e: { contact: { getImpactVelocityAlongNormal(): number } }) => {
        if (st !== me) return
        const v = Math.abs(e.contact.getImpactVelocityAlongNormal())
        impact(force(v, 1, 8), { matter: 'bois', noShake: true })
        me.shake.hit(force(v, 1, 8) * 0.6)
      })

      /* --- Trajectoire prévisualisée --- */
      const trail = new T.Group()
      const dotGeo = new T.SphereGeometry(0.028, 10, 8)
      const trailMat = new T.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.85 })
      const trailDots = Array.from({ length: 16 }, () => { const m = new T.Mesh(dotGeo, trailMat); trail.add(m); return m })
      trail.visible = false
      scene.add(trail)

      hideLoader()
      const tapHint = document.createElement('div')
      tapHint.className = 'tap-hint'
      tapHint.innerHTML = ICON.tap
      arena.appendChild(tapHint)

      const game = arcade(c, {
        host: arena,
        lives: c.byTier(5, 4, 3),
        scoreIcon: ICON.target,
        stars: s => { const th = c.byTier([10, 22], [14, 30], [18, 40]); return s.score >= th[1] ? 3 : s.score >= th[0] ? 2 : 1 }
      })
      const me: State = {
        stage, T, CANNON, world, game, fx: particles(stage, 400), shake: camShake(stage),
        crates: [], crateMats, crateGeo, matWood, shelf, shelfBody, ball, ballBody,
        trail, trailDots, trailMat, aimV: null, demo: true, thrown: false, flight: 0, knocked: 0,
        round: 0, over: false, building: true, norm: Math.max(160, arena.clientHeight * 0.32),
        tapHint, lastThud: 0
      }
      st = me
      buildPile(me)
      resetBall(me)

      /* --- Visée : glisser / lâcher --- */
      let start: { x: number; y: number } | null = null
      const onDown = (e: PointerEvent) => {
        if (st !== me || me.over || me.thrown || me.building) return
        start = { x: e.clientX, y: e.clientY }
        me.demo = false
        me.trailMat.opacity = 0.85
        me.aimV = null
        me.trail.visible = false
        tapHint.classList.add('off')
      }
      const onMove = (e: PointerEvent) => {
        if (!start || st !== me || me.thrown) return
        me.aimV = screenToAim(e.clientX - start.x, e.clientY - start.y, me.norm)
        updateTrail(me)
      }
      const onUp = (e: PointerEvent) => {
        if (!start || st !== me || me.over) { start = null; return }
        const dx = e.clientX - start.x, dy = e.clientY - start.y
        start = null
        me.trail.visible = false
        if (!me.aimV || Math.hypot(dx, dy) < 24 || dy <= 0 || me.building) { me.aimV = null; return }
        const v = me.aimV
        me.aimV = null
        throwBall(me, v)
      }
      stage.renderer.domElement.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)

      // Accroche pour les bots : où est la balle à l'écran, l'état de la manche
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __stand: unknown }).__stand = {
          ball: () => {
            const v = new T.Vector3(BALL_START.x, BALL_START.y, BALL_START.z).project(stage.camera)
            const r = stage.renderer.domElement.getBoundingClientRect()
            return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, norm: me.norm }
          },
          state: () => ({ thrown: me.thrown, building: me.building, over: me.over, round: me.round, score: me.game.s.score, standing: me.crates.filter(c => !c.down).length }),
          /** Décalage horizontal (px) du glisser pour viser la caisse debout la
              plus basse, avec un glisser vertical de 0,85 × norm. */
          aimPx: () => {
            const up = me.crates.filter(c => !c.down).sort((a, b) => a.body.position.y - b.body.position.y)[0]
            if (!up) return 0
            const dy = me.norm * 0.85
            const p = 11.5 * 0.85, t = (BALL_START.z - up.body.position.z) / p
            return -dy * up.body.position.x / (t * p * 0.42)
          }
        }
      }

      /* --- Boucle : physique à pas fixe, rendu libre --- */
      const step = fixedStep(1 / 60, 4)
      const up = new T.Vector3()
      let demoT = 0
      stage.start((dt, now) => {
        if (st !== me) return
        game.tick(dt)
        step(dt, () => world.step(1 / 60))

        for (const cr of me.crates) {
          cr.mesh.position.copy(cr.body.position as unknown as import('three').Vector3)
          cr.mesh.quaternion.copy(cr.body.quaternion as unknown as import('three').Quaternion)
          if (cr.down) continue
          up.set(0, 1, 0).applyQuaternion(cr.mesh.quaternion)
          cr.tilt = Math.max(cr.tilt, Math.acos(Math.min(1, up.y)))
          // Tombée : basculée ou éjectée de l'étagère
          if (up.y < 0.72 || cr.body.position.y < cr.y0 - 0.22) knockDown(me, cr)
        }
        ball.position.copy(ballBody.position as unknown as import('three').Vector3)
        ball.quaternion.copy(ballBody.quaternion as unknown as import('three').Quaternion)

        if (me.thrown) {
          me.flight += dt
          // Le tour est fini quand la balle ne peut plus rien toucher (passée
          // derrière la pile, retombée devant, arrêtée) ET que les caisses ont
          // fini de bouger — pas quand elle a fini de rouler dans le pré
          const p = ballBody.position, shelfZ = me.shelf.position.z
          const passed = p.z < shelfZ - 0.9 || p.y < -2
            || (me.flight > 0.7 && ballBody.velocity.length() < 0.35)
            || (me.flight > 0.5 && p.y < BALL_R + 0.03 && p.z > shelfZ + 0.5)
          const settled = me.crates.every(c => c.down || (c.body.velocity.length() < 0.3 && c.body.angularVelocity.length() < 0.5))
          if (me.flight > 3.4 || (passed && settled && me.flight > 0.5)) endThrow(me)
        }

        // Avant le premier lancer : la trajectoire d'un bon tir pulse, sans un mot
        if (me.demo && !me.over) {
          demoT += dt
          me.aimV = screenToAim(0, me.norm * 0.85, me.norm)
          updateTrail(me)
          me.trailMat.opacity = 0.45 + 0.4 * Math.sin(demoT * 4)
        }

        // La caméra suit un peu la balle en vol, puis revient ; à la fin elle
        // s'approche des caisses au ralenti
        const cam = stage.camera
        let tx = CAM.pos[0], ty = CAM.pos[1], tz = CAM.pos[2]
        let lx = CAM.look[0], ly = CAM.look[1], lz = CAM.look[2]
        if (me.thrown && ballBody.position.z > -1) {
          tx = ballBody.position.x * 0.35
          tz = CAM.pos[2] + (ballBody.position.z - BALL_START.z) * 0.3
          lx = ballBody.position.x * 0.5
        }
        if (me.over) { ty = 1.6; tz = 2.6 + me.shelf.position.z; ly = SHELF_Y + 0.3; lz = me.shelf.position.z }
        const k = 1 - Math.pow(0.002, dt)
        cam.position.x += (tx - cam.position.x) * k
        cam.position.y += (ty - cam.position.y) * k
        cam.position.z += (tz - cam.position.z) * k
        cam.lookAt(lx, ly, lz)
        me.fx.update(dt)
        me.shake.apply(dt)
        void now
      })

      stage.keep({ dispose() {
        stage.renderer.domElement.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        me.fx.dispose()
        me.game.dispose()
      } })
    })().catch(err => { if (!dead) throw err })

    return () => {
      dead = true
      if (st) { st.stage.dispose(); st = null }
    }
  }
}
