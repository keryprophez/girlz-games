import type { GameContext, GameDef } from '../core/types'
import { $, rnd } from '../core/utils'
import { sBoomReal, sWin, tone } from '../core/audio'
import { impact } from '../core/impact'
import {
  createStage, loadPhysics, loader, fixedStep,
  type Stage, type Cannon
} from '../core/three3d'

/* 🎈 Gonfle !, en 3D — un vrai ballon qui se DÉFORME : chaque tap le fait
   gonfler d'un coup avec un rebond élastique, il tremble de plus en plus fort
   près de la limite… BOUM : il explose en morceaux de caoutchouc qui volent
   avec la physique et retombent sur le plancher.

   Il se dégonfle si on s'arrête : il faut pomper sans relâche. Le chrono rend
   la partie perdable — chaque ballon est plus épais et fuit plus vite. */

const G = 12
const FLOOR_Y = -1.1

const COLORS: [number, number][] = [
  [0xFF6B81, 0xC23B52], [0x4FB8E7, 0x2E7EA8], [0xF5C518, 0xC29310],
  [0xB197FC, 0x7D63C9], [0x5EC97B, 0x3A8F54]
]

let bl: any = null
let ctx: GameContext

function sPump(k: number) { tone(220 + k * 4, 0.06, 'triangle', 0.14) }

/** Un ballon : sphère étirée + nœud. La forme d'un vrai ballon de baudruche. */
function makeBalloon(T: any, color: number) {
  const g = new T.Group()
  const mat = new T.MeshPhysicalMaterial({
    color, roughness: 0.24, metalness: 0,
    clearcoat: 0.8, clearcoatRoughness: 0.3
  })
  const body = new T.Mesh(new T.SphereGeometry(0.5, 28, 22), mat)
  body.scale.set(1, 1.15, 1)
  body.castShadow = true
  const knot = new T.Mesh(new T.ConeGeometry(0.09, 0.14, 10), mat)
  knot.position.y = -0.62
  knot.rotation.x = Math.PI
  g.add(body, knot)
  ;(g as any).mat = mat
  return g
}

function hud() {
  $('blRound').textContent = `Ballon ${Math.min(bl.round + 1, bl.goal)}/${bl.goal}`
}

function loadBalloon() {
  if (!bl || !bl.running) return
  const [c] = COLORS[bl.round % COLORS.length]
  bl.size = 12
  bl.popped = false
  bl.leak = 0.004 + bl.round * 0.0022
  ;(bl.balloon as any).mat.color.set(c)
  bl.balloon.visible = true
  hud()
}

function pump() {
  if (!bl || !bl.running || bl.popped) return
  bl.size += bl.pump
  bl.kick = 1                       // le rebond élastique du coup de pompe
  sPump(bl.size)
  if (bl.size >= 100) pop()
}

function pop() {
  if (!bl || bl.popped) return
  bl.popped = true
  sBoomReal()
  impact(1, { matter: 'sourd' })
  const { T, scene } = bl.stage
  const CANNON: Cannon = bl.CANNON
  const [c, cd] = COLORS[bl.round % COLORS.length]
  bl.balloon.visible = false
  ctx.toast('💥 BOUM !')

  // Le ballon explose en lambeaux de caoutchouc qui volent pour de vrai
  const R = 0.5 + (bl.size / 100) * 0.75
  for (let i = 0; i < 14; i++) {
    const shard = new T.Mesh(
      new T.SphereGeometry(0.11, 8, 6, 0, Math.PI * 1.4, 0, Math.PI * 0.6),
      new T.MeshStandardMaterial({
        color: i % 2 ? c : cd, roughness: 0.35, side: T.DoubleSide
      })
    )
    const a = (i / 14) * Math.PI * 2
    const b2 = Math.random() * Math.PI - Math.PI / 2
    shard.position.set(Math.cos(a) * Math.cos(b2) * R * 0.5, 0.6 + Math.sin(b2) * R * 0.5, Math.sin(a) * Math.cos(b2) * R * 0.3)
    shard.castShadow = true
    scene.add(shard)
    const body = new CANNON.Body({
      mass: 0.04, shape: new CANNON.Sphere(0.05),
      position: new CANNON.Vec3(shard.position.x, shard.position.y, shard.position.z)
    })
    body.velocity.set(Math.cos(a) * (2.5 + Math.random() * 2.5), 1.5 + Math.random() * 3, Math.sin(a) * (1.2 + Math.random()))
    body.angularVelocity.set(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12))
    bl.world.addBody(body)
    bl.shards.push({ shard, body, born: performance.now() })
  }

  bl.round++
  if (bl.round < bl.goal) {
    // Zéro temps mort : le ballon suivant arrive tout de suite
    setTimeout(() => bl && bl.running && loadBalloon(), 420)
  } else {
    setTimeout(() => bl && bl.running && finish(false), 550)
  }
}

function finish(timeout: boolean) {
  if (!bl || !bl.running) return
  bl.running = false
  sWin()
  const done = bl.round
  const stars = timeout ? (done >= bl.goal - 1 ? 2 : 1) : 3
  ctx.finish({
    title: timeout ? 'Le temps est écoulé ! ⏱' : 'Tous explosés ! 🎈',
    msg: timeout
      ? `${ctx.playerName} a fait péter ${done} ballon${done > 1 ? 's' : ''} sur ${bl.goal}`
      : `${ctx.playerName} a fait péter les ${bl.goal} ballons 🎉`,
    stars: stars as 1 | 2 | 3, starsEarned: stars
  })
}

export const balloon: GameDef = {
  id: 'balloon', name: 'Gonfle !', icon: '🎈', sq: 'sq-pink', cat: 'action', music: 'fair',
  subtitle: 'Tapote à toute vitesse pour gonfler le ballon… jusqu\'au BOUM !',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="blRound">Ballon 1/3</div>
        <div class="chip" id="blTime">⏱ 30s</div>
      </div>
      <div class="tbar" style="max-width:420px"><div class="tfill" id="blFill" style="width:0%"></div></div>
      <div class="arena g3-arena bl-arena" id="blArena">
        <div class="hint g3-hint">Tapote vite, il se dégonfle si tu t'arrêtes !</div>
      </div>`

    const arena = $('blArena')
    const hideLoader = loader(arena, '🎈')

    ;(async () => {
      const [, CANNON] = await loadPhysics()
      if (dead) return
      const stage: Stage = await createStage(arena, {
        sky: '#2A1E3E',
        fog: [6, 15], fogColor: '#2A1E3E',
        cam: [0, 1.1, 3.4], target: [0, 0.7, 0], fov: 44,
        hemi: ['#E4D4FF', '#241B36', 0.8],
        sun: { pos: [2.2, 5, 3.4], color: '#FFEFD4', intensity: 2.2, area: 4, far: 12 },
        fill: 0.4, exposure: 0.95, iblIntensity: 0.6
      })
      if (dead) { stage.dispose(); return }
      hideLoader()
      const T = stage.T
      const scene = stage.scene

      /* Plancher de fête sombre : le ballon vif doit être la star */
      const floor = new T.Mesh(
        new T.PlaneGeometry(18, 18),
        new T.MeshStandardMaterial({ color: 0x241B36, roughness: 0.85 })
      )
      floor.rotation.x = -Math.PI / 2
      floor.position.y = FLOOR_Y
      floor.receiveShadow = true
      scene.add(floor)
      // Guirlande de fanions au fond
      const bunting = new T.Group()
      for (let i = 0; i < 9; i++) {
        const flag = new T.Mesh(
          new T.ConeGeometry(0.09, 0.22, 4),
          new T.MeshStandardMaterial({ color: COLORS[i % COLORS.length][0], roughness: 0.7 })
        )
        const t = i / 8
        flag.position.set(-2 + t * 4, 1.9 - Math.sin(t * Math.PI) * 0.4, -2.4)
        flag.rotation.x = Math.PI
        bunting.add(flag)
      }
      scene.add(bunting)

      const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0) })
      world.addBody(new CANNON.Body({
        type: CANNON.Body.STATIC, shape: new CANNON.Plane(),
        position: new CANNON.Vec3(0, FLOOR_Y, 0),
        quaternion: new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0)
      }))

      const balloonObj = makeBalloon(T, COLORS[0][0])
      balloonObj.position.set(0, 0.55, 0)
      scene.add(balloonObj)

      bl = {
        stage, CANNON, world, balloon: balloonObj, shards: [],
        round: 0, size: 12, popped: false, running: true, leak: 0.004, kick: 0,
        goal: c.byTier(3, 4, 5),
        limit: c.byTier(34, 32, 30),
        pump: c.byTier(4.6, 3.7, 3.1),
        t0: performance.now(), step: fixedStep()
      }
      loadBalloon()

      const onTap = (e: Event) => { e.preventDefault(); pump() }
      stage.renderer.domElement.addEventListener('pointerdown', onTap)
      const onKey = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); pump() } }
      window.addEventListener('keydown', onKey)

      /* --- Boucle --- */
      stage.start((dt, now) => {
        if (!bl || !bl.running) return

        // Fuite d'air + chrono qui rend la partie perdable
        if (!bl.popped && bl.size > 12) bl.size = Math.max(12, bl.size - dt * 1000 * bl.leak)
        $('blFill').style.width = Math.min(100, bl.size) + '%'
        const left = bl.limit - (now - bl.t0) / 1000
        const chip = $('blTime')
        chip.textContent = '⏱ ' + Math.max(0, left).toFixed(0) + 's'
        chip.classList.toggle('urgent', left <= 8)
        // finish() démonte le jeu : toujours sortir de la boucle juste après
        if (left <= 0) { finish(true); return }

        // Le ballon grossit, rebondit à chaque coup de pompe et tremble à la limite
        if (!bl.popped) {
          const base = 0.55 + (bl.size / 100) * 1.35
          bl.kick = Math.max(0, bl.kick - dt * 5)
          const k = Math.sin(bl.kick * Math.PI) * 0.12
          const strain = bl.size > 72 ? Math.sin(now / 34) * 0.02 * ((bl.size - 72) / 28) : 0
          bl.balloon.scale.set(base * (1 + k + strain), base * (1 - k * 0.7 + strain), base * (1 + k + strain))
          bl.balloon.position.y = 0.55 + base * 0.14
          bl.balloon.rotation.z = strain * 3
        }

        // Les lambeaux de l'explosion vivent puis fondent
        bl.step(dt, () => world.step(1 / 60))
        for (let i = bl.shards.length - 1; i >= 0; i--) {
          const s = bl.shards[i]
          s.shard.position.copy(s.body.position as any)
          s.shard.quaternion.copy(s.body.quaternion as any)
          if (now - s.born > 1800) {
            s.shard.scale.multiplyScalar(0.88)
            if (s.shard.scale.x < 0.1) {
              world.removeBody(s.body)
              scene.remove(s.shard)
              bl.shards.splice(i, 1)
            }
          }
        }
      })

      bl.cleanup = () => {
        stage.renderer.domElement.removeEventListener('pointerdown', onTap)
        window.removeEventListener('keydown', onKey)
        stage.dispose()
      }
    })().catch(() => { hideLoader(); ctx.toast('La 3D n\'est pas disponible ici 😕') })

    return () => {
      dead = true
      if (bl) {
        bl.running = false
        try { bl.cleanup?.() } catch { /* déjà démonté */ }
        bl = null
      }
    }
  }
}
