import type { GameContext, GameDef } from '../core/types'
import { $, rnd } from '../core/utils'
import { sNope, sPopReal, sPower, sWin, tone } from '../core/audio'
import { impact } from '../core/impact'
import {
  createStage, loadPhysics, loader, fixedStep, loadModel, fitModel, picker,
  type Stage, type Cannon
} from '../core/three3d'

/* 🍿 Pop-corn !, en 3D — une vraie poêle, des grains qui chauffent dedans.
   Quand un grain tremble et brille, tape dessus : il ÉCLATE et le pop-corn
   SAUTE pour de vrai — impulsion cannon-es, rebonds dans la poêle, retombées
   sur la table. Un grain qu'on laisse brûler coûte un cœur : trois grains
   brûlés et la partie s'arrête. Taper trop tôt ne punit pas, ça fait juste
   « toc » — à six ans on tape partout, c'est le tempo qui s'apprend. */

const G = 14
const PAN_Y = 0.14           // fond de la poêle
const PAN_R = 0.78           // rayon jouable : le BASSIN de la poêle, pas son bord

let pc: any = null
let ctx: GameContext

function hud() {
  $('pcScore').textContent = '🍿 ' + pc.score
  $('pcLives').textContent = '❤️'.repeat(Math.max(0, pc.lives)) || '—'
  const c = $('pcCombo')
  c.textContent = pc.combo >= 3 ? `×${Math.min(5, Math.floor(pc.combo / 3) + 1)}` : ''
  c.classList.toggle('on', pc.combo >= 3)
}

/** Un grain de maïs : petite goutte jaune. Sa forme réelle, pas un cube. */
function makeKernel(T: any) {
  const m = new T.Mesh(
    new T.SphereGeometry(0.085, 14, 12),
    new T.MeshStandardMaterial({ color: 0xF5C518, roughness: 0.5, metalness: 0.05 })
  )
  m.scale.set(1, 1.25, 0.85)
  m.castShadow = true
  return m
}

/** Un pop-corn éclaté : l'agglomérat de bulles blanches qu'est un vrai pop-corn. */
function makePop(T: any) {
  const g = new T.Group()
  const mat = new T.MeshStandardMaterial({ color: 0xFFFBF2, roughness: 0.85 })
  for (let i = 0; i < 5; i++) {
    const b = new T.Mesh(new T.SphereGeometry(0.055 + Math.random() * 0.035, 10, 8), mat)
    const a = (i / 5) * Math.PI * 2
    b.position.set(Math.cos(a) * 0.05, (Math.random() - 0.3) * 0.06, Math.sin(a) * 0.05)
    b.castShadow = true
    g.add(b)
  }
  return g
}

/** Place un grain froid quelque part dans la poêle. */
function spawnKernel() {
  if (!pc || !pc.running) return
  const { T, scene } = pc.stage
  const a = Math.random() * Math.PI * 2
  const d = Math.random() * (PAN_R - 0.16)
  const mesh = makeKernel(T)
  mesh.position.set(Math.cos(a) * d, PAN_Y + 0.09, Math.sin(a) * d)
  scene.add(mesh)
  // Cible généreuse : le grain fait 8 cm, le doigt d'une enfant non
  const hit = new T.Mesh(new T.SphereGeometry(0.24, 8, 6), new T.MeshBasicMaterial({ visible: false }))
  hit.position.copy(mesh.position)
  scene.add(hit)
  const k: any = { mesh, hit, state: 'idle', wob: Math.random() * 7 }
  hit.userData.kernel = k
  pc.kernels.push(k)
  k.readyT = setTimeout(() => {
    if (!pc || !pc.running || k.state !== 'idle') return
    k.state = 'ready'
    ;(mesh.material as any).emissive = new T.Color(0xC97A10)
    ;(mesh.material as any).emissiveIntensity = 0.8
    tone(620, 0.06, 'triangle', 0.08)
    k.burnT = setTimeout(() => {
      if (!pc || !pc.running || k.state !== 'ready') return
      // Brûlé : il noircit, et ça coûte un cœur
      k.state = 'gone'
      ;(mesh.material as any).color.set(0x2E2418)
      ;(mesh.material as any).emissiveIntensity = 0
      pc.lives--
      pc.combo = 0
      impact(0.55, { matter: 'sourd' })
      hud()
      setTimeout(() => removeKernel(k), 600)
      if (pc.lives <= 0) { finish(true); return }
      ctx.toast(`💨 Brûlé ! ${'❤️'.repeat(pc.lives)}`)
    }, pc.cfg.window)
  }, rnd(500, pc.cfg.heat))
}

function removeKernel(k: any) {
  if (!pc) return
  clearTimeout(k.readyT); clearTimeout(k.burnT)
  pc.stage.scene.remove(k.mesh); pc.stage.scene.remove(k.hit)
  const i = pc.kernels.indexOf(k)
  if (i >= 0) pc.kernels.splice(i, 1)
}

function tapKernel(k: any) {
  if (!pc || !pc.running || k.state === 'gone') return
  const { T, scene } = pc.stage
  const CANNON: Cannon = pc.CANNON
  if (k.state === 'idle') {
    // Pas encore chaud : petit toc, le grain se dandine, aucune punition
    k.nope = 1
    sNope()
    return
  }
  k.state = 'gone'
  clearTimeout(k.burnT)
  pc.combo++
  pc.bestCombo = Math.max(pc.bestCombo, pc.combo)
  pc.score += Math.min(5, Math.floor(pc.combo / 3) + 1)
  sPopReal()
  impact(0.4, { matter: 'neige', noShake: true })

  // L'éclatement : le pop-corn SAUTE avec une vraie impulsion et retombe
  const p = k.mesh.position.clone()
  removeKernel(k)
  const pop = makePop(T)
  pop.position.copy(p)
  scene.add(pop)
  const body = new CANNON.Body({
    mass: 0.1, material: pc.matPop,
    shape: new CANNON.Sphere(0.1),
    position: new CANNON.Vec3(p.x, p.y + 0.05, p.z)
  })
  body.velocity.set((Math.random() - 0.5) * 2.2, 3.6 + Math.random() * 1.8, (Math.random() - 0.5) * 2.2)
  body.angularVelocity.set(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8))
  pc.world.addBody(body)
  pc.pops.push({ pop, body, born: performance.now() })

  if (pc.combo % 8 === 0) { sPower(); ctx.toast('🍿 Quelle rafale !') }
  hud()
}

function finish(burnt = false) {
  if (!pc || !pc.running) return
  pc.running = false
  clearInterval(pc.spawner)
  clearInterval(pc.timer)
  sWin()
  const score = pc.score
  const th = ctx.byTier([24, 14], [34, 20], [44, 28])
  const stars = score >= th[0] ? 3 : score >= th[1] ? 2 : 1
  ctx.finish({
    title: burnt ? 'Tout a brûlé ! 💨' : 'Le carton est plein !',
    msg: `${ctx.playerName} a marqué ${score} points`
      + (pc.bestCombo >= 3 ? ` — ${pc.bestCombo} d'affilée !` : ''),
    stars: stars as 1 | 2 | 3, starsEarned: stars
  })
}

export const popcorn: GameDef = {
  id: 'popcorn', name: 'Pop-corn !', icon: '🍿', sq: 'sq-sun', cat: 'action', music: 'fair',
  subtitle: 'Tape les grains qui tremblent… avant qu\'ils brûlent !',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="pcScore">🍿 0</div>
        <div class="chip" id="pcLives">❤️❤️❤️</div>
      </div>
      <div class="g3-combo" id="pcCombo"></div>
      <div class="tbar" style="max-width:540px"><div class="tfill" id="pcTimer"></div></div>
      <div class="arena g3-arena pc-arena" id="pcArena">
        <div class="hint g3-hint">Tape les grains qui brillent ! 🍿</div>
      </div>`

    const arena = $('pcArena')
    const hideLoader = loader(arena, '🍿')

    ;(async () => {
      const [, CANNON] = await loadPhysics()
      if (dead) return
      const stage: Stage = await createStage(arena, {
        sky: '#241B12',
        fog: [4.5, 11], fogColor: '#241B12',
        cam: [0, 2.25, 2.95], target: [0, 0.1, 0], fov: 46,
        hemi: ['#FFE6C4', '#33241A', 0.7],
        sun: { pos: [1.8, 4, 2.6], color: '#FFE9C0', intensity: 2.4, area: 3, far: 10 },
        fill: 0.35, exposure: 0.95, iblIntensity: 0.55
      })
      if (dead) { stage.dispose(); return }
      hideLoader()
      const T = stage.T
      const scene = stage.scene

      /* Plan de travail sombre : les grains jaunes doivent flamboyer dessus */
      const table = new T.Mesh(
        new T.PlaneGeometry(16, 16),
        new T.MeshStandardMaterial({ color: 0x3A2B1E, roughness: 0.9 })
      )
      table.rotation.x = -Math.PI / 2
      table.receiveShadow = true
      scene.add(table)

      /* La poêle : un vrai modèle, posé au centre */
      const pan = await loadModel('food', 'frying-pan')
      fitModel(T, pan, 2.9)
      pan.position.set(0.35, 0, 0)
      scene.add(pan)
      if (dead) { stage.dispose(); return }

      /* La flamme sous la poêle : une lumière chaude qui vacille */
      const fire = new T.PointLight(0xFF8A2E, 5, 3.2, 2)
      fire.position.set(0, 0.5, 0)
      scene.add(fire)

      /* Monde physique : la poêle est une assiette creuse (sol + bord) */
      const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0) })
      const matPop = new CANNON.Material('pop')
      world.addContactMaterial(new CANNON.ContactMaterial(matPop, matPop, { friction: 0.4, restitution: 0.45 }))
      world.addBody(new CANNON.Body({
        type: CANNON.Body.STATIC, material: matPop, shape: new CANNON.Plane(),
        position: new CANNON.Vec3(0, PAN_Y, 0),
        quaternion: new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0)
      }))

      const cfg = c.byTier(
        { heat: 2600, window: 2600, spawn: 950, time: 45 },
        { heat: 2000, window: 1800, spawn: 750, time: 45 },
        { heat: 1500, window: 1200, spawn: 560, time: 45 }
      )
      pc = {
        stage, CANNON, world, matPop, kernels: [], pops: [],
        score: 0, lives: 3, combo: 0, bestCombo: 0, timeLeft: cfg.time,
        cfg, running: true, step: fixedStep()
      }
      hud()

      /* --- Taper un grain : picker 3D, zéro latence --- */
      const pick = picker(stage)
      const onTap = (e: PointerEvent) => {
        if (!pc || !pc.running) return
        const hits = pick(e, pc.kernels.map((k: any) => k.hit), false)
        if (hits.length) tapKernel(hits[0].object.userData.kernel)
      }
      stage.renderer.domElement.addEventListener('pointerdown', onTap)

      pc.spawner = setInterval(spawnKernel, cfg.spawn)
      spawnKernel(); spawnKernel()
      pc.timer = setInterval(() => {
        if (!pc || !pc.running) return
        pc.timeLeft--
        $('pcTimer').style.width = (pc.timeLeft / cfg.time) * 100 + '%'
        if (pc.timeLeft <= 0) finish(false)
      }, 1000)

      /* --- Boucle --- */
      stage.start((dt, now) => {
        if (!pc || !pc.running) return
        fire.intensity = 4.4 + Math.sin(now / 90) * 1.1 + Math.sin(now / 37) * 0.5

        // Les grains frémissent ; ceux qui sont prêts tremblent fort
        for (const k of pc.kernels) {
          k.wob += dt * (k.state === 'ready' ? 34 : 7)
          const amp = k.state === 'ready' ? 0.035 : 0.008
          k.mesh.position.y = PAN_Y + 0.09 + Math.abs(Math.sin(k.wob)) * amp * 3
          k.mesh.rotation.z = Math.sin(k.wob * 1.3) * amp * 8
          if (k.nope) {
            k.nope = Math.max(0, k.nope - dt * 4)
            k.mesh.rotation.y = Math.sin(k.nope * 30) * 0.5
          }
        }

        // Les pop-corns éclatés vivent leur vie physique puis s'en vont
        pc.step(dt, () => world.step(1 / 60))
        for (let i = pc.pops.length - 1; i >= 0; i--) {
          const p = pc.pops[i]
          p.pop.position.copy(p.body.position as any)
          p.pop.quaternion.copy(p.body.quaternion as any)
          if (now - p.born > 2600) {
            // Il fond en douceur plutôt que de disparaître d'un coup
            p.pop.scale.multiplyScalar(0.9)
            if (p.pop.scale.x < 0.1) {
              world.removeBody(p.body)
              scene.remove(p.pop)
              pc.pops.splice(i, 1)
            }
          }
        }
      })

      pc.cleanup = () => {
        stage.renderer.domElement.removeEventListener('pointerdown', onTap)
        clearInterval(pc.spawner)
        clearInterval(pc.timer)
        pc.kernels.forEach((k: any) => { clearTimeout(k.readyT); clearTimeout(k.burnT) })
        stage.dispose()
      }
    })().catch(() => { hideLoader(); ctx.toast('La 3D n\'est pas disponible ici 😕') })

    return () => {
      dead = true
      if (pc) {
        pc.running = false
        try { pc.cleanup?.() } catch { /* déjà démonté */ }
        pc = null
      }
    }
  }
}
