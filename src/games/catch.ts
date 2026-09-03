import type { GameContext, GameDef } from '../core/types'
import { $, pick } from '../core/utils'
import { impact, force } from '../core/impact'
import {
  createStage, loadPhysics, loader, fixedStep, loadModel, fitModel,
  type Stage, type Cannon, type T3
} from '../core/three3d'
import { arcade, type Arcade } from '../core/arcade'
import { ground, decor, particles, camShake, type Particles, type CamShake } from '../core/scene3d'
import { ICON } from '../core/icons'
import { sfx, preloadSfx } from '../core/sfx'

/* 🧺 Attrape la Récolte, refait le 2/09 — la récolte TOMBE pour de vrai, et
   le panier est un VRAI panier : un corps physique avec un fond et des bords.
   Un fruit qui arrive dedans rebondit, roule, se pose ; un fruit qui touche
   le bord peut ressortir. C'est là que naît l'adresse : viser le milieu.

   La boucle :
   - un fruit posé dans le panier = points × combo ;
   - un fruit qui tombe par terre = un cœur ; un piment attrapé = un cœur ;
   - un piment qui tombe par terre = rien (c'est ce qu'on voulait) ;
   - une ombre au sol sous chaque fruit dit OÙ il va tomber ;
   - la rampe suit la performance : tous les 8 fruits, ils tombent plus vite
     et plus souvent. Pas de chrono : la partie finit aux cœurs.

   Quatrième jeu sur core/arcade.ts + core/scene3d.ts. */

const LANE = 2.6          // demi-largeur du terrain
const FLOOR_Y = 0
const SPAWN_Y = 3.9

/* La récolte : que du bon, sauf le piment. Aucun texte à lire, la forme suffit. */
const CROPS = ['apple', 'carrot', 'banana', 'orange', 'strawberry', 'pear', 'broccoli', 'leek', 'pineapple', 'eggplant', 'avocado']
const BAD = 'pepper'

type Body = import('cannon-es').Body
type Obj = import('three').Object3D
interface Item { obj: Obj; body: Body; bad: boolean; shadow: import('three').Mesh; caught: number; done: boolean }
interface Cfg { every: number; bad: number; g: number }

interface State {
  stage: Stage
  T: T3
  CANNON: Cannon
  world: import('cannon-es').World
  models: Record<string, Obj>
  items: Item[]
  basket: Obj
  basketBody: Body
  game: Arcade
  fx: Particles
  shake: CamShake
  cfg: Cfg
  basketX: number
  wantX: number
  over: boolean
  tapHint: HTMLElement
  shadowGeo: import('three').CircleGeometry
  shadowMat: import('three').MeshBasicMaterial
}

let ca: State | null = null
let ctx: GameContext

/** Lâche un fruit (ou un piment) quelque part au-dessus du terrain. */
function spawn(me: State) {
  const { CANNON, T } = me
  const bad = Math.random() < me.cfg.bad
  const kind = bad ? BAD : pick(CROPS)
  const proto = me.models[kind]
  if (!proto) return
  const obj = proto.clone(true)
  const x = (Math.random() * 2 - 1) * (LANE - 0.4)
  obj.position.set(x, SPAWN_Y, 0)
  me.stage.scene.add(obj)
  const body = new CANNON.Body({ mass: 0.4, shape: new CANNON.Sphere(0.17), position: new CANNON.Vec3(x, SPAWN_Y, 0) })
  body.linearDamping = 0.02
  body.angularVelocity.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6)
  me.world.addBody(body)
  // L'ombre au sol : elle dit où ça va tomber, et grossit à l'approche
  const shadow = new T.Mesh(me.shadowGeo, me.shadowMat)
  shadow.rotation.x = -Math.PI / 2
  shadow.position.set(x, FLOOR_Y + 0.012, 0)
  me.stage.scene.add(shadow)
  me.items.push({ obj, body, bad, shadow, caught: 0, done: false })
}

/** Le fruit est-il posé DANS le panier ? Dans le volume, et calme. */
function inBasket(me: State, it: Item) {
  const p = it.body.position, v = it.body.velocity
  return Math.abs(p.x - me.basketX) < 0.42 && p.y > 0.02 && p.y < 0.4 && Math.abs(v.y) < 2.4
}

function caught(me: State, it: Item) {
  it.done = true
  it.caught = 0.001
  const p = it.body.position
  if (it.bad) {
    impact(0.85, { matter: 'sourd', noShake: true })
    me.shake.hit(0.8)
    me.fx.burst(p, { count: 22, color: [0xC63B2A, 0x7A1E12, 0xFF7A4D], speed: 2.6, life: 0.7, size: 0.08 })
    me.game.flash(ICON.heartEmpty, 'bad')
    if (me.game.hurt()) finish(me, true)
    return
  }
  sfx('drop', { vol: 0.6, rate: 1.1 + Math.min(10, me.game.s.combo) * 0.03 })
  impact(force(Math.abs(it.body.velocity.y), 1, 8) * 0.5, { matter: 'bois', noShake: true })
  me.fx.burst({ x: p.x, y: p.y + 0.1, z: 0.3 }, { count: 12, color: [0xFFE08A, 0xFFFFFF, 0xC3E88D], speed: 1.8, life: 0.55, size: 0.07, gravity: 4 })
  me.game.hit(1, { silent: true })
  if (me.game.s.combo >= 5 && me.game.s.combo % 5 === 0) me.game.flash('×' + me.game.s.combo)
  me.tapHint.classList.add('off')
}

/** Tombé par terre : un bon fruit perdu coûte un cœur, un piment perdu, rien. */
function missed(me: State, it: Item) {
  it.done = true
  it.caught = 0.001
  const p = it.body.position
  if (!it.bad) {
    impact(0.45, { matter: 'pate', noShake: true })
    me.fx.burst({ x: p.x, y: FLOOR_Y + 0.1, z: 0.2 }, { count: 12, color: [0x8A6238, 0xB08050], speed: 1.4, life: 0.5, size: 0.06 })
    me.game.flash(ICON.heartEmpty, 'bad')
    if (me.game.hurt()) finish(me, false)
  } else {
    impact(0.2, { matter: 'pate', noShake: true })
    me.fx.burst({ x: p.x, y: FLOOR_Y + 0.1, z: 0.2 }, { count: 6, color: 0x8A6238, speed: 1, life: 0.4, size: 0.05 })
  }
}

function drop(me: State, it: Item) {
  me.world.removeBody(it.body)
  me.stage.scene.remove(it.obj)
  me.stage.scene.remove(it.shadow)
  const i = me.items.indexOf(it)
  if (i >= 0) me.items.splice(i, 1)
}

function finish(me: State, piquant: boolean) {
  if (me.over) return
  me.over = true
  me.stage.timeScale = 0.45
  const s = me.game.s
  const th = ctx.byTier([30, 15], [42, 21], [56, 28])
  me.game.end({
    title: piquant ? 'Aïe, le piment !' : s.score >= th[0] ? 'Quelle récolte !' : s.score >= th[1] ? 'Récolte rentrée !' : 'La récolte est tombée…',
    msg: `${ctx.playerName} a marqué ${s.score} points` + (s.bestCombo >= 5 ? `, ${s.bestCombo} d'affilée` : ''),
    outroMs: 1200
  })
}

export const catchGame: GameDef = {
  id: 'catch', name: 'Attrape', icon: '🧺', sq: 'sq-sky', cat: 'action', music: 'meadow',
  subtitle: 'Glisse le panier sous la récolte… mais pas sous le piment !',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `<div class="arena g3-arena ca-arena" id="caArena"></div>`
    const arena = $('caArena')
    const hideLoader = loader(arena, '🧺')
    preloadSfx(['drop', 'error', 'confirm', 'pluck'])

    ;(async () => {
      const [T, CANNON] = await loadPhysics()
      if (dead) return
      const stage: Stage = await createStage(arena, {
        sky: '#8FCDEB', fog: [12, 30], fogColor: '#B9E0F2',
        cam: [0, 2.0, 5.8], target: [0, 1.35, 0], fov: 46,
        hemi: ['#DFF3FF', '#4E7A3C', 0.95],
        sun: { pos: [2.6, 7, 4.5], color: '#FFF4D6', intensity: 2.0, area: 5, far: 20 },
        fill: 0.35, exposure: 1.0, iblIntensity: 0.5
      })
      if (dead) { stage.dispose(); return }
      const scene = stage.scene

      /* Un verger : herbe, clôture, arbres derrière — le panier a une échelle */
      const g = ground(stage, { radius: 22, color: 0x4F8F3A, roughness: 0.98 })
      g.position.y = FLOOR_Y
      const back = -3.2
      const items3d = [
        ...[-5.2, -2.6, 0.4, 3.2, 5.8].map((x, i) => ({ model: `nature/${['tree_default', 'tree_oak', 'tree_fat', 'tree_detailed'][i % 4]}`, x, z: back - 1.6 - Math.random(), size: 2.4 + Math.random() * 1.2, tint: 0x6EAE48 })),
        ...[-4.5, -3, -1.5, 0, 1.5, 3, 4.5].map(x => ({ model: 'nature/fence_simple', x, z: back, size: 0.7, rot: 0, tint: 0xC9A874 })),
        ...[[-3.4, -1.2], [3.5, -1.4], [-4.2, 0.6], [4.3, 0.8]].map(([x, z]) => ({ model: 'nature/plant_bush', x, z, size: 0.55, tint: 0x6EAE48 })),
        ...[[-2.4, 0.9], [2.6, 1.1], [-3.8, -0.4], [3.9, -0.2]].map(([x, z], i) => ({ model: `nature/${['flower_redA', 'flower_yellowA', 'flower_purpleA'][i % 3]}`, x, z, size: 0.36, tint: 0xFFFFFF }))
      ]
      decor(stage, items3d).then(grp => grp.position.y = FLOOR_Y).catch(() => { /* sans décor, le jeu tourne */ })

      /* Monde physique */
      const cfg: Cfg = c.byTier(
        { every: 1350, bad: 0.1, g: 7.5 },
        { every: 1050, bad: 0.17, g: 9 },
        { every: 820, bad: 0.24, g: 10.5 }
      )
      const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -cfg.g, 0) })
      world.broadphase = new CANNON.SAPBroadphase(world)
      ;(world.solver as unknown as { iterations: number }).iterations = 10
      const matFood = new CANNON.Material('food')
      world.addContactMaterial(new CANNON.ContactMaterial(matFood, matFood, { friction: 0.5, restitution: 0.22 }))
      world.defaultContactMaterial.friction = 0.5
      world.defaultContactMaterial.restitution = 0.22
      world.addBody(new CANNON.Body({
        type: CANNON.Body.STATIC, material: matFood, shape: new CANNON.Plane(),
        position: new CANNON.Vec3(0, FLOOR_Y, 0),
        quaternion: new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0)
      }))

      /* Le panier : un vrai modèle ET un vrai corps — fond + deux bords.
         Cinématique : il pousse les fruits, rien ne le pousse. */
      const basket = await loadModel('food', 'bowl')
      fitModel(T, basket, 1.2)
      const bb = new T.Box3().setFromObject(basket)
      basket.position.set(0, -bb.min.y, 0)
      scene.add(basket)
      const basketBody = new CANNON.Body({ type: CANNON.Body.KINEMATIC, material: matFood })
      basketBody.addShape(new CANNON.Box(new CANNON.Vec3(0.52, 0.04, 0.45)), new CANNON.Vec3(0, 0.04, 0))
      basketBody.addShape(new CANNON.Box(new CANNON.Vec3(0.05, 0.22, 0.45)), new CANNON.Vec3(-0.56, 0.22, 0))
      basketBody.addShape(new CANNON.Box(new CANNON.Vec3(0.05, 0.22, 0.45)), new CANNON.Vec3(0.56, 0.22, 0))
      basketBody.position.set(0, 0, 0)
      world.addBody(basketBody)

      /* Toute la récolte préchargée : un fruit ne doit jamais faire attendre */
      const models: Record<string, Obj> = {}
      await Promise.all([...CROPS, BAD].map(async k => {
        const m = await loadModel('food', k)
        fitModel(T, m, k === BAD ? 0.34 : 0.42)
        models[k] = m
      }))
      if (dead) { stage.dispose(); return }
      hideLoader()

      const tapHint = document.createElement('div')
      tapHint.className = 'tap-hint'
      tapHint.innerHTML = ICON.tap
      arena.appendChild(tapHint)

      const game = arcade(c, {
        host: arena,
        lives: c.byTier(5, 3, 3),
        scoreIcon: ICON.basket,
        ramp: { every: 8, max: 8 },
        onLevel: () => {
          me.cfg.every = Math.max(450, me.cfg.every * 0.88)
          me.cfg.bad = Math.min(0.32, me.cfg.bad + 0.03)
          me.cfg.g += 1.0
          world.gravity.set(0, -me.cfg.g, 0)
          me.game.flash(ICON.bolt)
        },
        stars: s => { const th = c.byTier([30, 15], [42, 21], [56, 28]); return s.score >= th[0] ? 3 : s.score >= th[1] ? 2 : 1 }
      })
      const me: State = {
        stage, T, CANNON, world, models, items: [], basket, basketBody, game,
        fx: particles(stage, 500), shake: camShake(stage), cfg: { ...cfg },
        basketX: 0, wantX: 0, over: false, tapHint,
        shadowGeo: new T.CircleGeometry(0.16, 20),
        shadowMat: new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })
      }
      ca = me

      /* --- Un seul geste : glisser --- */
      const moveTo = (clientX: number) => {
        const r = stage.renderer.domElement.getBoundingClientRect()
        const t = (clientX - r.left) / r.width
        me.wantX = Math.max(-1, Math.min(1, t * 2 - 1)) * (LANE - 0.5)
      }
      let dragging = false
      const onDown = (e: PointerEvent) => { dragging = true; moveTo(e.clientX) }
      const onMove = (e: PointerEvent) => { if (dragging) moveTo(e.clientX) }
      const onUp = () => { dragging = false }
      stage.renderer.domElement.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)

      const spawner = () => {
        if (ca !== me || me.over) return
        spawn(me)
        game.after(me.cfg.every * (0.75 + Math.random() * 0.5), spawner)
      }
      spawner()

      // Accroche pour les bots : où tombent les fruits, où est le panier
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __catch: unknown }).__catch = {
          state: () => ({ basketX: me.basketX, over: me.over, fruits: me.items.filter(i => !i.done).map(i => ({ x: i.body.position.x, y: i.body.position.y, bad: i.bad })) }),
          want: (x: number) => { me.wantX = Math.max(-(LANE - 0.5), Math.min(LANE - 0.5, x)) }
        }
      }

      const step = fixedStep()
      stage.start(dt => {
        if (ca !== me) return
        game.tick(dt)
        // Le panier suit le doigt en douceur : un suivi sec donnerait du zapping.
        // Cinématique : on lui donne une VITESSE, la physique le déplace et
        // pousse les fruits qui sont dedans.
        basketBody.velocity.set((me.wantX - me.basketX) * 14, 0, 0)

        step(dt, () => {
          world.step(1 / 60)
          for (const it of me.items) { it.body.position.z = 0; it.body.velocity.z = 0 }
        })
        me.basketX = basketBody.position.x
        basket.position.x = me.basketX
        basket.rotation.z = (me.wantX - me.basketX) * 0.35   // il penche : ça lui donne du poids

        for (let i = me.items.length - 1; i >= 0; i--) {
          const it = me.items[i]
          it.obj.position.copy(it.body.position as unknown as import('three').Vector3)
          it.obj.quaternion.copy(it.body.quaternion as unknown as import('three').Quaternion)
          if (it.done) {
            // Ramassé ou perdu : il rétrécit un quart de seconde, puis s'en va
            it.caught += dt
            const k = Math.max(0, 1 - it.caught / 0.28)
            it.obj.scale.setScalar(k)
            it.shadow.visible = false
            if (k <= 0) drop(me, it)
            continue
          }
          // L'ombre suit et grossit à l'approche du sol
          const h = Math.max(0, it.body.position.y - FLOOR_Y)
          it.shadow.position.x = it.body.position.x
          const s = 0.7 + Math.max(0, 1 - h / (SPAWN_Y - FLOOR_Y)) * 1.4
          it.shadow.scale.setScalar(s)
          if (!me.over) {
            if (inBasket(me, it)) { caught(me, it); continue }
            // Par terre = bas ET hors du panier (dedans, un fruit peut être bas mais encore en mouvement)
            if (it.body.position.y < FLOOR_Y + 0.2 && Math.abs(it.body.position.x - me.basketX) > 0.5) missed(me, it)
          }
        }
        me.fx.update(dt)
        stage.camera.position.set(me.basketX * 0.12, 2.0, 5.8)
        stage.camera.lookAt(me.basketX * 0.1, 1.35, 0)
        me.shake.apply(dt)
      })

      stage.keep({ dispose() {
        stage.renderer.domElement.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        me.shadowGeo.dispose(); me.shadowMat.dispose()
        me.fx.dispose()
        me.game.dispose()
      } })
    })().catch(err => { if (!dead) throw err })

    return () => {
      dead = true
      if (ca) { ca.stage.dispose(); ca = null }
    }
  }
}
