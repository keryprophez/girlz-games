import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { sCrunch, sPop, sWin, tone } from '../core/audio'
import { confetti } from '../core/fx'
import {
  createStage, loadPhysics, loader, fixedStep, orbitCam, woodTex, bumpyNormal, picker,
  type Stage, type Cannon
} from '../core/three3d'

/* 🍕 La Pizzeria 3D — un vrai bac à sable, façon cuisine pour enfants :
   AUCUNE étape imposée. On étale la sauce au doigt, on lâche les ingrédients
   qui TOMBENT et roulent pour de vrai sur la pâte (et parfois à côté…), on
   enfourne quand on veut — le four chauffe, la pâte dore, le fromage fond —
   on ressort quand on veut, et on mange les parts une par une. */

const PR = 0.56            // rayon de la pizza
const PR_IN = PR - 0.075   // rayon de la garniture (à l'intérieur de la croûte)
const PH = 0.05            // épaisseur de la pâte
const SLICES = 6
const OVEN_Z = -1.5
const G = 9.82

type ToolId = 'tomato' | 'cream' | 'cheese' | 'mushroom' | 'olive' | 'slice' | 'corn' | 'basil' | 'eat'

const TOOLS: { id: ToolId; icon: string }[] = [
  { id: 'tomato', icon: '🥫' }, { id: 'cream', icon: '🥛' },
  { id: 'cheese', icon: '🧀' }, { id: 'mushroom', icon: '🍄' },
  { id: 'olive', icon: '🫒' }, { id: 'slice', icon: '🍅' },
  { id: 'corn', icon: '🌽' }, { id: 'basil', icon: '🌿' },
  { id: 'eat', icon: '😋' }
]
const SAUCES: Record<string, string> = { tomato: 'rgba(206,58,38,1)', cream: 'rgba(255,243,220,1)' }

let ctx: GameContext
let S: any = null

/* ---------- Pâte crue peinte sur une texture : la sauce s'y étale ---------- */
function doughCanvas() {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#F0DCAE'; g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `hsla(${36 + Math.random() * 14},${45 + Math.random() * 25}%,${74 + Math.random() * 18}%,.45)`
    g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3.5, 0, 7); g.fill()
  }
  return { c, g }
}

/** Pose une tache de sauce à la position monde (x,z) de la pizza. */
function paintSauce(x: number, z: number, color: string) {
  const { g, tex } = S.sauce
  const px = ((x / PR) * 0.5 + 0.5) * 512
  const py = ((z / PR) * 0.5 + 0.5) * 512
  const rad = 52
  const grad = g.createRadialGradient(px, py, 4, px, py, rad)
  grad.addColorStop(0, color)
  grad.addColorStop(0.62, color)
  grad.addColorStop(1, color.replace(/1\)$/, '0)'))
  g.fillStyle = grad
  g.beginPath(); g.arc(px, py, rad, 0, 7); g.fill()
  tex.needsUpdate = true
}

/* ---------- Fabrique d'ingrédients ---------- */
function ingredientKit(T: any) {
  const std = (c: number, r = 0.7) => new T.MeshStandardMaterial({ color: c, roughness: r })
  const capGeo = new T.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)
  const stemGeo = new T.CylinderGeometry(0.018, 0.022, 0.045, 8)
  const mushMat = std(0xE7D5BD, 0.85)
  return {
    cheese: {
      r: 0.05, melt: true,
      make: () => new T.Mesh(new T.BoxGeometry(0.095, 0.034, 0.095), std(0xFFD98A, 0.6))
    },
    mushroom: {
      r: 0.056, melt: false,
      make: () => {
        const g = new T.Group()
        const cap = new T.Mesh(capGeo, mushMat)
        cap.position.y = 0.012
        const stem = new T.Mesh(stemGeo, mushMat)
        stem.position.y = -0.012
        g.add(cap, stem)
        return g
      }
    },
    olive: {
      r: 0.042, melt: false,
      make: () => {
        const m = new T.Mesh(new T.TorusGeometry(0.036, 0.016, 8, 14), std(0x2F2A38, 0.42))
        m.rotation.x = Math.PI / 2
        return m
      }
    },
    slice: {
      r: 0.064, melt: false,
      make: () => new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.022, 16), std(0xDD4E38, 0.55))
    },
    corn: {
      r: 0.024, melt: false,
      make: () => new T.Mesh(new T.CapsuleGeometry(0.016, 0.02, 4, 8), std(0xFFC63C, 0.5))
    },
    basil: {
      r: 0.04, melt: false,
      make: () => {
        const m = new T.Mesh(new T.SphereGeometry(0.062, 10, 7), std(0x4C9E4A, 0.8))
        m.scale.set(1, 0.28, 0.7)
        return m
      }
    }
  }
}

/* ---------- Lâcher un ingrédient ---------- */
function drop(kind: ToolId, x: number, z: number) {
  if (!S || S.inOven) return
  const { T, scene } = S.stage
  const CANNON: Cannon = S.CANNON
  const kit = S.kit[kind]
  if (!kit) return
  const obj = kit.make()
  obj.position.set(x, 0.62, z)
  obj.castShadow = true
  scene.add(obj)
  const body = new CANNON.Body({
    mass: 0.05, material: S.matFood,
    shape: new CANNON.Sphere(kit.r),
    position: new CANNON.Vec3(x, 0.62, z)
  })
  body.linearDamping = 0.12
  body.angularDamping = 0.35
  body.angularVelocity.set((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5)
  S.world.addBody(body)
  S.loose.push({ obj, body, kind, melt: kit.melt, t: 0 })
  sPop()
}

/** Une fois posé, l'ingrédient rejoint sa part de pizza : plus de physique à simuler. */
function attach(item: any) {
  const { T, scene } = S.stage
  S.world.removeBody(item.body)
  const p = item.obj.position
  const d = Math.hypot(p.x, p.z)
  if (d < PR) {
    let ang = Math.atan2(p.x, p.z)
    if (ang < 0) ang += Math.PI * 2
    const wi = Math.min(SLICES - 1, Math.floor(ang / (Math.PI * 2 / SLICES)))
    const w = S.wedges[wi]
    if (w && !w.eaten) { w.group.attach(item.obj); w.items.push(item) }
    else scene.remove(item.obj)
  }
  // Tombé à côté : il reste sur le plan de travail, c'est la vie
  if (item.melt) S.melting.push(item)
  void T
}

/* ---------- Four ---------- */
function toOven(on: boolean) {
  if (!S || S.ended) return
  S.inOven = on
  S.ovenT = 0
  ;($('pzOven') as HTMLElement).style.display = on ? 'none' : ''
  ;($('pzOut') as HTMLElement).style.display = on ? '' : 'none'
  if (!on) $('pzState').textContent = S.bake > 0.75 ? '🍕 Bien dorée !' : S.bake > 0.3 ? '🍕 Toute chaude !' : '🍕 À toi de garnir !'
  ctx.toast(on ? 'Au four ! 🔥' : 'Elle est prête ! 🍕')
  if (on) tone(180, 0.5, 'sawtooth', 0.06)
  else sPop()
}

/* ---------- Manger ---------- */
function eatWedge(wi: number) {
  const w = S.wedges[wi]
  if (!w || w.eaten) return
  w.eaten = true
  w.fade = 0
  S.eaten++
  sCrunch()
  tone(300 + S.eaten * 40, 0.1, 'triangle', 0.1)
  if (S.eaten >= SLICES) {
    ctx.toast('Miam, tout mangé ! 😋')
    setTimeout(() => S && finish(), 700)
  }
}

function finish() {
  if (!S || S.ended) return
  S.ended = true
  confetti()
  sWin()
  const n = S.dropped
  ctx.finish({
    title: S.eaten >= SLICES ? 'Pizza dévorée ! 🍕' : 'Quelle belle pizza ! 🍕',
    msg: `${ctx.playerName} a posé ${n} ingrédient${n > 1 ? 's' : ''}`,
    stars: 3, starsEarned: 3
  })
}

/* ---------- Interface ---------- */
function paintUI() {
  if (!S) return
  $('pzTools').querySelectorAll<HTMLElement>('.g3-tool').forEach(b => {
    b.classList.toggle('sel', b.dataset.t === S.tool)
  })
}

export const pizza: GameDef = {
  id: 'pizza', name: 'La Pizzeria', icon: '🍕', sq: 'sq-peach', cat: 'creatif', duel: false, music: 'kitchen',
  subtitle: 'Sauce au doigt, ingrédients qui tombent, four bien chaud… puis on croque !',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="topbar">
        <button class="chip" id="pzLeft">◀</button>
        <div class="chip" id="pzState">🍕 À toi de garnir !</div>
        <button class="chip" id="pzRight">▶</button>
      </div>
      <div class="arena g3-arena pz-arena" id="pzArena">
        <div class="hint g3-hint" id="pzHint">Choisis un ingrédient, puis touche la pizza 👇</div>
      </div>
      <div class="g3-bar">
        <div class="g3-row" id="pzTools">
          ${TOOLS.map(t => `<button class="g3-tool" data-t="${t.id}">${t.icon}</button>`).join('')}
        </div>
        <div class="g3-row">
          <button class="g3-btn" id="pzOven">🔥 Au four</button>
          <button class="g3-btn" id="pzOut" style="display:none">🍽️ Sortir</button>
          <button class="g3-btn ghost" id="pzDone">C'est fini ! ✅</button>
        </div>
      </div>`

    const arena = $('pzArena')
    const hideLoader = loader(arena, '🍕')

    ;(async () => {
      const [, CANNON] = await loadPhysics()
      if (dead) return
      const stage: Stage = await createStage(arena, {
        sky: '#3B2A22',
        fog: [4, 12], fogColor: '#3B2A22',
        cam: [0, 1.2, 1.6], target: [0, 0.06, 0], fov: 46,
        hemi: ['#FFE6C4', '#5A3E2C', 0.9],
        sun: { pos: [1.6, 3.2, 2.2], color: '#FFEFD2', intensity: 2.6, area: 3, far: 10 },
        fill: 0.45, exposure: 1.1
      })
      if (dead) { stage.dispose(); return }
      hideLoader()
      const T = stage.T
      const scene = stage.scene

      /* --- Plan de travail --- */
      const counterMat = new T.MeshStandardMaterial({
        map: stage.keep(woodTex(T, '#A87C4E', 2)),
        normalMap: stage.keep(bumpyNormal(T, 5, 6)),
        roughness: 0.72, metalness: 0.02
      })
      const counter = new T.Mesh(new T.PlaneGeometry(14, 14), counterMat)
      counter.rotation.x = -Math.PI / 2
      counter.receiveShadow = true
      scene.add(counter)

      /* --- Le four à bois : une vraie voûte en berceau, ouverte vers nous --- */
      const oven = new T.Group()
      const brickTex = stage.keep(bumpyNormal(T, 20, 5))
      const brick = new T.MeshStandardMaterial({
        color: 0xB4553E, roughness: 0.96, normalMap: brickTex, normalScale: new T.Vector2(0.8, 0.8)
      })
      const soot = new T.MeshStandardMaterial({ color: 0x3A2318, roughness: 1, side: T.BackSide })
      const VAULT_R = 0.74, VAULT_L = 1.05, VAULT_Z = OVEN_Z - 0.18

      // Intérieur : demi-cylindre couché, vu de l'intérieur
      const vault = new T.Mesh(
        new T.CylinderGeometry(VAULT_R, VAULT_R, VAULT_L, 22, 1, true, 0, Math.PI),
        soot
      )
      vault.rotation.set(Math.PI / 2, 0, -Math.PI / 2)
      vault.position.set(0, 0, VAULT_Z)
      // Fond du four
      const back = new T.Mesh(
        new T.CircleGeometry(VAULT_R, 22, 0, Math.PI),
        new T.MeshStandardMaterial({ color: 0x33200F, roughness: 1 })
      )
      back.position.set(0, 0, VAULT_Z - VAULT_L / 2)
      // Sole (le sol du four), un peu plus sombre que le plan de travail
      const sole = new T.Mesh(
        new T.PlaneGeometry(VAULT_R * 2, VAULT_L),
        new T.MeshStandardMaterial({ color: 0x6A4B34, roughness: 0.95 })
      )
      sole.rotation.x = -Math.PI / 2
      sole.position.set(0, 0.004, VAULT_Z)
      // Extérieur en brique + encadrement de la bouche
      const shell = new T.Mesh(
        new T.CylinderGeometry(VAULT_R + 0.16, VAULT_R + 0.16, VAULT_L + 0.1, 22, 1, true, 0, Math.PI),
        brick
      )
      shell.rotation.copy(vault.rotation)
      shell.position.copy(vault.position)
      shell.castShadow = true
      const frame = new T.Mesh(new T.RingGeometry(VAULT_R, VAULT_R + 0.16, 22, 1, 0, Math.PI), brick)
      frame.position.set(0, 0, VAULT_Z + VAULT_L / 2 + 0.03)
      const hearth = new T.Mesh(new T.BoxGeometry(VAULT_R * 2 + 0.34, 0.09, VAULT_L + 0.24), brick)
      hearth.position.set(0, -0.045, VAULT_Z)
      hearth.receiveShadow = true

      const fire = new T.Mesh(
        new T.SphereGeometry(0.17, 14, 10),
        new T.MeshBasicMaterial({ color: 0xFF8A2E })
      )
      fire.position.set(0, 0.1, VAULT_Z - VAULT_L / 2 + 0.16)
      fire.scale.set(2.2, 0.55, 0.7)
      // Bûches
      const logMat = new T.MeshStandardMaterial({ color: 0x4A2E1B, roughness: 1 })
      for (let i = 0; i < 3; i++) {
        const log = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.34, 8), logMat)
        log.rotation.z = Math.PI / 2
        log.rotation.y = (i - 1) * 0.3
        log.position.set(-0.32 + i * 0.06, 0.04 + i * 0.05, VAULT_Z - VAULT_L / 2 + 0.2)
        oven.add(log)
      }
      oven.add(vault, back, sole, shell, frame, hearth, fire)
      scene.add(oven)
      const fireLight = new T.PointLight(0xFF7A22, 6, 3.2, 2)
      fireLight.position.copy(fire.position)
      fireLight.position.y = 0.22
      scene.add(fireLight)

      /* --- La pizza : 6 parts indépendantes, pour pouvoir la manger --- */
      const dc = doughCanvas()
      const sauceTex = new T.CanvasTexture(dc.c)
      sauceTex.colorSpace = T.SRGBColorSpace
      sauceTex.anisotropy = 4
      const doughMat = new T.MeshStandardMaterial({ map: sauceTex, roughness: 0.82 })
      const sideMat = new T.MeshStandardMaterial({ color: 0xEBD3A2, roughness: 0.85 })
      const crustMat = new T.MeshStandardMaterial({
        color: 0xE9C88A, roughness: 0.78,
        normalMap: stage.keep(bumpyNormal(T, 14, 3)), normalScale: new T.Vector2(0.5, 0.5)
      })

      const pizzaGroup = new T.Group()
      scene.add(pizzaGroup)
      const step = (Math.PI * 2) / SLICES
      const wedges: any[] = []
      for (let i = 0; i < SLICES; i++) {
        const a0 = i * step
        const g = new T.Group()
        const dough = new T.Mesh(
          new T.CylinderGeometry(PR_IN, PR_IN * 0.97, PH, 22, 1, false, a0, step),
          [sideMat, doughMat, sideMat]
        )
        dough.position.y = PH / 2
        dough.castShadow = true; dough.receiveShadow = true
        g.add(dough)
        // Croûte : un boudin suivant l'arc de la part
        const pts: any[] = []
        for (let k = 0; k <= 8; k++) {
          const a = a0 + (k / 8) * step
          pts.push(new T.Vector3(Math.sin(a) * (PR - 0.05), PH * 0.75, Math.cos(a) * (PR - 0.05)))
        }
        const crust = new T.Mesh(
          new T.TubeGeometry(new T.CatmullRomCurve3(pts), 12, 0.055, 10, false),
          crustMat
        )
        crust.castShadow = true; crust.receiveShadow = true
        g.add(crust)
        pizzaGroup.add(g)
        wedges.push({ group: g, items: [], eaten: false, fade: -1, a0, a1: a0 + step })
      }

      /* --- Physique --- */
      const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0) })
      world.broadphase = new CANNON.SAPBroadphase(world)
      ;(world.solver as any).iterations = 10
      const matFood = new CANNON.Material('food')
      world.addContactMaterial(new CANNON.ContactMaterial(matFood, matFood, { friction: 0.62, restitution: 0.08 }))
      world.addBody(new CANNON.Body({
        type: CANNON.Body.STATIC, material: matFood, shape: new CANNON.Plane(),
        quaternion: new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0)
      }))
      // Galette : un cylindre couché (cannon oriente ses cylindres sur Z)
      const disc = new CANNON.Body({ type: CANNON.Body.STATIC, material: matFood })
      disc.addShape(
        new CANNON.Cylinder(PR, PR, PH, 16),
        new CANNON.Vec3(0, PH / 2, 0)
      )
      world.addBody(disc)

      S = {
        stage, CANNON, world, matFood, kit: ingredientKit(T),
        sauce: { g: dc.g, tex: sauceTex },
        doughMat, crustMat, sideMat, pizzaGroup, wedges, fire, fireLight,
        loose: [], melting: [], tool: 'tomato' as ToolId, dropped: 0, eaten: 0,
        bake: 0, inOven: false, ovenT: 0, ended: false,
        orbit: orbitCam(stage, 1.55, 1.05, [0, 0.06, 0]),
        step: fixedStep()
      }
      paintUI()

      /* --- Toucher la pizza --- */
      const pick = picker(stage)
      let painting = false

      const hitPizza = (e: PointerEvent) => {
        const hits = pick(e, [pizzaGroup], true)
        return hits.length ? hits[0] : null
      }

      const act = (e: PointerEvent, first: boolean) => {
        if (!S || S.ended) return
        const h = hitPizza(e)
        if (!h) return
        // Coordonnées locales de la pizza (le groupe bouge quand elle est au four)
        const p = pizzaGroup.worldToLocal(h.point.clone())
        if (S.tool === 'tomato' || S.tool === 'cream') {
          painting = true
          paintSauce(p.x, p.z, SAUCES[S.tool])
          if (first) tone(240, 0.07, 'sine', 0.06)
          return
        }
        if (!first) return
        if (S.tool === 'eat') {
          let ang = Math.atan2(p.x, p.z)
          if (ang < 0) ang += Math.PI * 2
          eatWedge(Math.min(SLICES - 1, Math.floor(ang / step)))
          return
        }
        if (S.inOven) { ctx.toast('Sors-la du four d\'abord ! 🍽️'); return }
        // Un peu de dispersion : deux taps au même endroit ne donnent pas deux clones
        drop(S.tool, p.x + (Math.random() - 0.5) * 0.04, p.z + (Math.random() - 0.5) * 0.04)
        S.dropped++
      }

      const onDown = (e: PointerEvent) => act(e, true)
      const onMove = (e: PointerEvent) => { if (painting) act(e, false) }
      const onUp = () => { painting = false }
      stage.renderer.domElement.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)

      $('pzTools').querySelectorAll<HTMLElement>('.g3-tool').forEach(b => {
        b.onclick = () => {
          if (!S) return
          S.tool = b.dataset.t as ToolId
          sPop()
          paintUI()
          $('pzHint').style.opacity = '0'
        }
      })
      $('pzOven').onclick = () => toOven(true)
      $('pzOut').onclick = () => toOven(false)
      $('pzDone').onclick = () => finish()
      $('pzLeft').onclick = () => { S?.orbit.turn(-0.5); sPop() }
      $('pzRight').onclick = () => { S?.orbit.turn(0.5); sPop() }

      /* --- Boucle --- */
      stage.start((dt, now) => {
        if (!S) return

        // Va-et-vient du four : la pizza glisse, la caméra suit
        const targetZ = S.inOven ? OVEN_Z : 0
        pizzaGroup.position.z += (targetZ - pizzaGroup.position.z) * Math.min(1, dt * 2.2)
        S.orbit.look = [0, 0.06, pizzaGroup.position.z * 0.8]
        S.orbit.dist = 1.5 + Math.abs(pizzaGroup.position.z) * 0.18
        S.orbit.height = 1.02 - Math.abs(pizzaGroup.position.z) * 0.36
        S.orbit.update(dt)

        // Cuisson : la pâte dore, le fromage fond
        if (S.inOven && S.bake < 1) {
          S.bake = Math.min(1, S.bake + dt / 14)
          const k = S.bake
          const tint = (a: number, b: number, cc: number) => {
            const c1 = new T.Color(a), c2 = new T.Color(b), c3 = new T.Color(cc)
            return k < 0.55 ? c1.lerp(c2, k / 0.55) : c2.lerp(c3, (k - 0.55) / 0.45)
          }
          S.doughMat.color.copy(tint(0xFFFFFF, 0xE8C793, 0xB98149))
          S.crustMat.color.copy(tint(0xE9C88A, 0xD79E52, 0x9C6027))
          S.sideMat.color.copy(tint(0xEBD3A2, 0xD8A863, 0xA26B33))
          for (const m of S.melting) m.obj.scale.set(1 + k * 0.25, Math.max(0.3, 1 - k * 0.7), 1 + k * 0.25)
          $('pzState').textContent = k < 0.4 ? '🔥 Ça chauffe…' : k < 0.85 ? '😋 Ça sent bon !' : '🍕 Bien dorée !'
        }

        // Flamme du four
        const fl = 1 + Math.sin(now / 90) * 0.18 + Math.sin(now / 37) * 0.08
        S.fire.scale.set(2.2 * fl, 0.55 * fl, 0.7)
        S.fireLight.intensity = 5 + fl * 2

        // Ingrédients encore en l'air
        S.step(dt, () => world.step(1 / 60))
        for (let i = S.loose.length - 1; i >= 0; i--) {
          const it = S.loose[i]
          it.obj.position.copy(it.body.position as any)
          it.obj.quaternion.copy(it.body.quaternion as any)
          it.t += dt
          if ((it.t > 0.3 && it.body.velocity.length() < 0.12) || it.t > 5) {
            S.loose.splice(i, 1)
            attach(it)
            tone(520 + Math.random() * 90, 0.05, 'sine', 0.05)
          }
        }

        // Parts mangées : elles rétrécissent et disparaissent
        for (const w of S.wedges) {
          if (!w.eaten || w.fade < 0) continue
          w.fade += dt * 2.6
          if (w.fade >= 1) {
            w.fade = -1
            w.group.visible = false
          } else {
            w.group.scale.setScalar(1 - w.fade)
            w.group.position.y = w.fade * 0.35
          }
        }
      })

      S.cleanup = () => {
        stage.renderer.domElement.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        sauceTex.dispose()
        stage.dispose()
      }
    })().catch(() => { hideLoader(); ctx.toast('La 3D n\'est pas disponible ici 😕') })

    return () => {
      dead = true
      if (S) {
        try { S.cleanup?.() } catch { /* déjà démonté */ }
        S = null
      }
    }
  }
}
