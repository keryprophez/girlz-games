import type { GameContext, GameDef } from '../core/types'
import { $, pick } from '../core/utils'
import { sPower, sWin, tone } from '../core/audio'
import { impact } from '../core/impact'
import {
  createStage, loadPhysics, loader, fixedStep, loadModel, fitModel, avatarMedallion,
  type Stage, type Cannon
} from '../core/three3d'

/* 🧺 Attrape la Récolte, en 3D — la récolte TOMBE pour de vrai : chaque fruit
   est un modèle glTF avec son corps physique, il rebondit sur le bord du
   panier, roule et peut en ressortir. Le doigt fait glisser le panier.

   Un seul geste. Attraper un piment coûte un cœur — trois piments et c'est
   fini, avant le chrono. Rater un fruit ne coûte pas de cœur mais casse la
   série : c'est le combo qui fait le plafond d'adresse, pas la punition. Les
   vagues accélèrent la chute et resserrent les envois. */

const G = 16              // gravité franche : une chute molle n'a aucun poids
const LANE = 2.5          // demi-largeur du terrain
const BASKET_Y = 0.1
const FLOOR_Y = -0.6

/* La récolte : que du bon, sauf le piment. Aucun texte à lire, la forme suffit. */
const CROPS = ['apple', 'carrot', 'banana', 'orange', 'strawberry', 'pear', 'broccoli', 'leek', 'pineapple', 'eggplant', 'avocado']
const BAD = 'pepper'

let ca: any = null
let ctx: GameContext

function hud() {
  $('caScore').textContent = '🧺 ' + ca.score
  $('caLives').textContent = '❤️'.repeat(Math.max(0, ca.lives)) || '—'
  const c = $('caCombo')
  c.textContent = ca.combo >= 3 ? `×${Math.min(5, Math.floor(ca.combo / 3) + 1)}` : ''
  c.classList.toggle('on', ca.combo >= 3)
}

function flash(txt: string) {
  const w = $('caWave')
  w.textContent = txt
  w.classList.remove('show'); void w.offsetWidth; w.classList.add('show')
}

/** Lâche un fruit (ou un piment) quelque part au-dessus du terrain. */
function spawn() {
  if (!ca || !ca.running) return
  const CANNON: Cannon = ca.CANNON
  const bad = Math.random() < ca.cfg.bad
  const kind = bad ? BAD : pick(CROPS)
  const proto = ca.models[kind]
  if (!proto) return
  const obj = proto.clone(true)
  const x = (Math.random() * 2 - 1) * (LANE - 0.35)
  obj.position.set(x, 2.9, 0)
  ca.stage.scene.add(obj)
  const body = new CANNON.Body({
    mass: 0.4, material: ca.matFood,
    shape: new CANNON.Sphere(0.13),
    position: new CANNON.Vec3(x, 2.9, 0)
  })
  body.linearDamping = 0.02
  body.angularVelocity.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6)
  body.velocity.set(0, -ca.cfg.speed, 0)
  ca.world.addBody(body)
  ca.items.push({ obj, body, bad, done: false })
}

/** Le fruit est-il tombé DANS le panier ? Test sur le volume de la corbeille. */
function inBasket(p: any) {
  return Math.abs(p.x - ca.basketX) < 0.42 && p.y < BASKET_Y + 0.34 && p.y > BASKET_Y - 0.3
}

function caught(it: any) {
  it.done = true
  if (it.bad) {
    ca.lives--
    ca.combo = 0
    impact(0.85, { matter: 'sourd' })
    hud()
    if (ca.lives <= 0) { drop(it); finish(true); return }
    ctx.toast(`🌶️ Trop piquant ! ${'❤️'.repeat(ca.lives)}`)
  } else {
    ca.combo++
    ca.bestCombo = Math.max(ca.bestCombo, ca.combo)
    ca.score += Math.min(5, Math.floor(ca.combo / 3) + 1)
    tone(560 + Math.min(10, ca.combo) * 55, 0.09, 'triangle', 0.12)
    impact(0.3, { matter: 'neige', noShake: true })
    hud()
  }
  drop(it)
}

/** Un fruit perdu casse la série, mais ne coûte PAS de cœur.
    Rater une chute est normal à six ans ; ce qui doit se payer, c'est
    d'attraper ce qu'on ne devait pas. Sinon la partie meurt en quatre
    secondes et personne ne comprend pourquoi. */
function missed(it: any) {
  it.done = true
  if (!it.bad) {
    ca.combo = 0
    impact(0.45, { matter: 'pate' })
    hud()
  } else {
    impact(0.2, { matter: 'pate', noShake: true })
  }
  drop(it)
}

function drop(it: any) {
  ca.world.removeBody(it.body)
  ca.stage.scene.remove(it.obj)
  const i = ca.items.indexOf(it)
  if (i >= 0) ca.items.splice(i, 1)
}

function finish(piquant: boolean) {
  if (!ca || !ca.running) return
  ca.running = false
  clearInterval(ca.timer)
  clearTimeout(ca.spawnT)
  sWin()
  const th = ctx.byTier([26, 13], [36, 18], [48, 24])
  const stars = ca.score >= th[0] ? 3 : ca.score >= th[1] ? 2 : 1
  ctx.finish({
    title: piquant ? 'Aïe, le piment ! 🌶️' : ca.score >= th[0] ? 'Quelle récolte !' : 'Récolte rentrée !',
    msg: `${ctx.playerName} a marqué ${ca.score} points`
      + (ca.bestCombo >= 3 ? ` — ${ca.bestCombo} d'affilée !` : ''),
    stars: stars as 1 | 2 | 3, starsEarned: stars
  })
}

export const catchGame: GameDef = {
  id: 'catch', name: 'Attrape', icon: '🧺', sq: 'sq-sky', cat: 'action', music: 'meadow',
  subtitle: 'Glisse le panier sous la récolte… mais pas sous le piment !',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="caScore">🧺 0</div>
        <div class="chip" id="caLives">❤️❤️❤️</div>
      </div>
      <div class="g3-combo" id="caCombo"></div>
      <div class="tbar" style="max-width:520px"><div class="tfill" id="caTimer"></div></div>
      <div class="arena g3-arena ca-arena" id="caArena">
        <div class="hint g3-hint" id="caHint">Glisse ton doigt pour déplacer le panier 🧺</div>
        <div class="g3-wave" id="caWave"></div>
      </div>`

    const arena = $('caArena')
    const hideLoader = loader(arena, '🧺')

    ;(async () => {
      const [, CANNON] = await loadPhysics()
      if (dead) return
      const stage: Stage = await createStage(arena, {
        sky: '#1D3C5E',
        fog: [7, 20], fogColor: '#1D3C5E',
        cam: [0, 1.35, 5.0], target: [0, 1.1, 0], fov: 46,
        hemi: ['#CFE4FF', '#22384F', 0.9],
        sun: { pos: [2.6, 6, 4.5], color: '#FFF2D8', intensity: 2.2, area: 5, far: 16 },
        fill: 0.35, exposure: 0.95, iblIntensity: 0.55
      })
      if (dead) { stage.dispose(); return }
      hideLoader()
      const T = stage.T
      const scene = stage.scene

      /* Sol sombre : c'est la récolte qui doit ressortir, pas le décor */
      const ground = new T.Mesh(
        new T.PlaneGeometry(26, 26),
        new T.MeshStandardMaterial({ color: 0x1F4433, roughness: 0.95 })
      )
      ground.rotation.x = -Math.PI / 2
      ground.position.y = FLOOR_Y
      ground.receiveShadow = true
      scene.add(ground)

      /* Décor : des caisses de marché et un fond de grange. Sans lui, le panier
         flotte dans le vide et rien ne donne l'échelle de la chute. */
      const crateMat = new T.MeshStandardMaterial({ color: 0x6B4A2E, roughness: 0.85 })
      for (const [x, z, sc] of [[-2.4, -1.2, 0.5], [2.5, -1.4, 0.62], [-3.1, -2.2, 0.42], [3.2, -2.4, 0.48]] as [number, number, number][]) {
        const crate = new T.Mesh(new T.BoxGeometry(sc, sc * 0.8, sc), crateMat)
        crate.position.set(x, FLOOR_Y + sc * 0.4, z)
        crate.rotation.y = Math.random()
        crate.castShadow = true; crate.receiveShadow = true
        scene.add(crate)
      }
      const barn = new T.Mesh(
        new T.PlaneGeometry(20, 2.2),
        new T.MeshStandardMaterial({ color: 0x3A2A1E, roughness: 1 })
      )
      barn.position.set(0, FLOOR_Y + 1.1, -4.5)
      scene.add(barn)

      /* Monde physique */
      const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0) })
      world.broadphase = new CANNON.SAPBroadphase(world)
      ;(world.solver as any).iterations = 8
      const matFood = new CANNON.Material('food')
      world.addContactMaterial(new CANNON.ContactMaterial(matFood, matFood, { friction: 0.4, restitution: 0.18 }))
      world.addBody(new CANNON.Body({
        type: CANNON.Body.STATIC, material: matFood, shape: new CANNON.Plane(),
        position: new CANNON.Vec3(0, FLOOR_Y, 0),
        quaternion: new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0)
      }))

      /* Le panier : un vrai modèle, piloté au doigt */
      const basket = await loadModel('food', 'bowl')
      fitModel(T, basket, 0.9)
      basket.position.set(0, BASKET_Y, 0)
      scene.add(basket)

      /* Toute la récolte préchargée : un fruit ne doit jamais faire attendre */
      const models: Record<string, any> = {}
      await Promise.all([...CROPS, BAD].map(async k => {
        const g = await loadModel('food', k)
        fitModel(T, g, k === BAD ? 0.24 : 0.3)
        models[k] = g
      }))
      if (dead) { stage.dispose(); return }

      const cfg = c.byTier(
        { speed: 0.1, every: 1250, bad: 0.1 },
        { speed: 0.5, every: 980, bad: 0.17 },
        { speed: 1.0, every: 780, bad: 0.24 }
      )
      ca = {
        stage, CANNON, world, matFood, models, basket,
        items: [], score: 0, lives: 3, combo: 0, bestCombo: 0,
        basketX: 0, wantX: 0, timeLeft: 45, wave: 1, running: true,
        cfg: { ...cfg }, step: fixedStep()
      }
      hud()

      /* --- Un seul geste : glisser --- */
      const moveTo = (clientX: number) => {
        const r = stage.renderer.domElement.getBoundingClientRect()
        const t = (clientX - r.left) / r.width
        ca.wantX = Math.max(-1, Math.min(1, t * 2 - 1)) * (LANE - 0.45)
        $('caHint').style.opacity = '0'
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
        if (!ca || !ca.running) return
        spawn()
        ca.spawnT = setTimeout(spawner, ca.cfg.every * (0.75 + Math.random() * 0.5))
      }
      spawner()

      ca.timer = setInterval(() => {
        if (!ca || !ca.running) return
        ca.timeLeft--
        $('caTimer').style.width = (ca.timeLeft / 45) * 100 + '%'
        if (ca.timeLeft === 34 || ca.timeLeft === 22 || ca.timeLeft === 11) {
          ca.wave++
          ca.cfg.speed = ca.cfg.speed * 1.25 + 0.3
          ca.cfg.every = Math.max(420, ca.cfg.every * 0.82)
          ca.cfg.bad = Math.min(0.32, ca.cfg.bad + 0.05)
          flash('Vague ' + ca.wave + ' !'); sPower()
        }
        if (ca.timeLeft <= 0) finish(false)
      }, 1000)

      /* --- Boucle --- */
      // C'est SON panier : médaillon photo qui l'accompagne (hors du groupe
      // remis à l'échelle par fitModel, il suit dans la boucle)
      let med: any = null
      avatarMedallion(T, c.avatar, 0.28).then(m => {
        if (m && ca) { med = m; scene.add(m) }
      })

      stage.start(dt => {
        if (!ca || !ca.running) return
        // Le panier suit le doigt en douceur : un suivi sec donnerait du zapping
        ca.basketX += (ca.wantX - ca.basketX) * Math.min(1, dt * 16)
        basket.position.x = ca.basketX
        basket.rotation.z = (ca.wantX - ca.basketX) * 0.5   // il penche : ça lui donne du poids
        if (med) med.position.set(ca.basketX, basket.position.y + 0.62, 0)

        ca.step(dt, () => {
          world.step(1 / 60)
          // Terrain plat : rien ne doit partir vers le fond
          for (const it of ca.items) { it.body.position.z = 0; it.body.velocity.z = 0 }
        })

        for (let i = ca.items.length - 1; i >= 0; i--) {
          const it = ca.items[i]
          if (it.done) continue
          it.obj.position.copy(it.body.position as any)
          it.obj.quaternion.copy(it.body.quaternion as any)
          if (inBasket(it.body.position)) { caught(it); if (!ca || !ca.running) return; continue }
          if (it.body.position.y < FLOOR_Y + 0.22) { missed(it); if (!ca || !ca.running) return }
        }
      })

      ca.cleanup = () => {
        stage.renderer.domElement.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        clearInterval(ca.timer)
        clearTimeout(ca.spawnT)
        stage.dispose()
      }
    })().catch(() => { hideLoader(); ctx.toast('La 3D n\'est pas disponible ici 😕') })

    return () => {
      dead = true
      if (ca) {
        ca.running = false
        try { ca.cleanup?.() } catch { /* déjà démonté */ }
        ca = null
      }
    }
  }
}
