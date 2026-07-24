import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { sBonk, sHit, sWin, sWoosh, tone } from '../core/audio'

/* Le Stand 3D — vraie 3D temps réel (Three.js) + vraie physique rigide
   (cannon-es). Rendu moderne : éclairage physique, ombres portées douces,
   matériaux PBR, tone mapping cinéma, brouillard de profondeur, textures
   générées à la volée. Tire la balle en arrière, la trajectoire s'affiche,
   et les caisses s'écroulent pour de vrai. */

let st: any = null
let ctx: GameContext

/* ---------- Textures procédurales (aucun fichier) ---------- */
function woodTex(T: any, band: string): any {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#C99A5F'; g.fillRect(0, 0, 256, 256)
  // Planches + veinage
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
  // Bandeau peint + étoile au pochoir
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
  // Vignettage : donne du relief au matériau
  const v = g.createRadialGradient(128, 128, 60, 128, 128, 190)
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(60,40,20,.35)')
  g.fillStyle = v; g.fillRect(0, 0, 256, 256)
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function groundTex(T: any): any {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#8FBE68'; g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 5200; i++) {
    const x = Math.random() * 512, y = Math.random() * 512
    g.fillStyle = `hsla(${88 + Math.random() * 26},${38 + Math.random() * 22}%,${40 + Math.random() * 22}%,.5)`
    g.fillRect(x, y, 2 + Math.random() * 3, 3 + Math.random() * 5)
  }
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  t.wrapS = t.wrapT = T.RepeatWrapping
  t.repeat.set(9, 9)
  t.anisotropy = 4
  return t
}

function stripeTex(T: any): any {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 256
  const g = c.getContext('2d')!
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#F2867C' : '#FFF6EA'
    g.fillRect(i * 64, 0, 64, 256)
  }
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  return t
}

/* ---------- Le jeu ---------- */
const BANDS = ['#E8574C', '#3F8FD0', '#F2A93B', '#57B267', '#8E6FD4', '#E86FA0']
const CRATE = 0.3
const SHELF_Y = 0.92
const BALL_R = 0.1
const BALL_START = { x: 0, y: 0.72, z: 2.1 }
const G = 9.82

function screenToAim(dx: number, dy: number) {
  // Tirer vers le BAS/l'arrière propulse la balle vers l'avant et vers le haut
  const power = Math.min(1, Math.hypot(dx, dy) / 210)
  const ang = Math.atan2(dy, dx)
  const p = power * 11.5
  return {
    x: -Math.cos(ang) * p * 0.42,
    y: Math.max(0, Math.sin(ang)) * p * 0.42,
    z: -Math.max(0, Math.sin(ang)) * p
  }
}

function updateTrail() {
  const { T } = st
  const v = st.aimV
  if (!v) { st.trail.visible = false; return }
  st.trail.visible = true
  const N = st.trailDots.length
  for (let i = 0; i < N; i++) {
    const t = (i + 1) * 0.045
    const d = st.trailDots[i]
    d.position.set(
      BALL_START.x + v.x * t,
      BALL_START.y + v.y * t - 0.5 * G * t * t,
      BALL_START.z + v.z * t
    )
    const vis = d.position.y > 0.02
    d.visible = vis
    d.scale.setScalar(vis ? 1 - i / (N * 1.4) : 0.001)
  }
  void T
}

function knockDown(c: any) {
  if (c.down) return
  c.down = true
  st.score++
  $('s3Score').textContent = `🎯 ${st.score}/6`
  tone(560 + st.score * 60, 0.1, 'sine', 0.11)
}

function endThrow() {
  st.thrown = false
  st.throws--
  $('s3Balls').textContent = '🎾'.repeat(Math.max(0, st.throws)) || '—'
  const standing = st.crates.filter((c: any) => !c.down).length
  if (standing === 0) { ctx.toast('STRIKE ! 🎉'); setTimeout(() => st && st.running && finish(), 900); return }
  if (st.throws <= 0) { setTimeout(() => st && st.running && finish(), 900); return }
  resetBall()
}

function resetBall() {
  const { ballBody, CANNON } = st
  ballBody.velocity.setZero()
  ballBody.angularVelocity.setZero()
  ballBody.position.set(BALL_START.x, BALL_START.y, BALL_START.z)
  ballBody.quaternion.set(0, 0, 0, 1)
  ballBody.type = CANNON.Body.STATIC
  ballBody.updateMassProperties()
  st.thrown = false
}

function finish() {
  sWin()
  const stars = st.score >= 6 ? 3 : st.score >= 4 ? 2 : 1
  ctx.finish({
    title: st.score >= 6 ? 'STRIKE ! Tout est tombé !' : 'Joli lancer !',
    msg: `${ctx.playerName} a fait tomber ${st.score} caisses sur 6`,
    stars: stars as 1 | 2 | 3, starsEarned: stars
  })
}

export const stand3d: GameDef = {
  id: 'stand3d', name: 'Le Stand 3D', icon: '🎯', sq: 'sq-peach', cat: 'action', music: 'fair',
  subtitle: 'Vraie 3D : tire la balle en arrière et fais tomber les caisses !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="s3Score">🎯 0/6</div>
        <div class="chip" id="s3Balls"></div>
      </div>
      <div class="arena s3-arena" id="s3Arena">
        <div class="hint s3-hint">Tire vers le bas… et lâche ! 🏹</div>
        <div class="nj-loading" id="s3Load">🎪</div>
      </div>`
    const arena = $('s3Arena')
    let dead = false

    ;(async () => {
      const [T, CANNON] = await Promise.all([import('three'), import('cannon-es')])
      if (dead) return
      const W = arena.clientWidth, H = arena.clientHeight

      /* --- Rendu : réglages « jeu moderne » --- */
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
      renderer.setSize(W, H)
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = T.PCFSoftShadowMap
      renderer.toneMapping = T.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.05
      renderer.outputColorSpace = T.SRGBColorSpace
      $('s3Load')?.remove()
      arena.appendChild(renderer.domElement)

      const scene = new T.Scene()
      scene.background = new T.Color('#BFE3F5')
      scene.fog = new T.Fog('#CFE9F7', 9, 26)

      const camera = new T.PerspectiveCamera(48, W / H, 0.1, 80)
      camera.position.set(0, 2.05, 3.95)
      camera.lookAt(0, 1.02, -0.15)

      /* --- Lumières : ciel + soleil rasant avec ombres douces --- */
      scene.add(new T.HemisphereLight(0xCFE9FF, 0x6E8F52, 1.05))
      const sun = new T.DirectionalLight(0xFFF1D0, 2.3)
      sun.position.set(3.4, 6.2, 4.2)
      sun.castShadow = true
      sun.shadow.mapSize.set(1024, 1024)
      sun.shadow.camera.near = 1
      sun.shadow.camera.far = 18
      const d = 4.2
      sun.shadow.camera.left = -d; sun.shadow.camera.right = d
      sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d
      sun.shadow.bias = -0.0012
      sun.shadow.radius = 3
      scene.add(sun)
      // Appoint frontal doux : évite les faces avant éteintes
      const fill = new T.DirectionalLight(0xFFFFFF, 0.55)
      fill.position.set(-1.6, 2.4, 5)
      scene.add(fill)

      /* --- Monde physique --- */
      const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0) })
      world.broadphase = new CANNON.SAPBroadphase(world)
      ;(world.solver as any).iterations = 12
      const matWood = new CANNON.Material('wood')
      const matBall = new CANNON.Material('ball')
      world.addContactMaterial(new CANNON.ContactMaterial(matWood, matWood, { friction: 0.45, restitution: 0.06 }))
      world.addContactMaterial(new CANNON.ContactMaterial(matWood, matBall, { friction: 0.3, restitution: 0.25 }))

      /* --- Sol --- */
      const ground = new T.Mesh(
        new T.PlaneGeometry(60, 60),
        new T.MeshStandardMaterial({ map: groundTex(T), roughness: 0.98, metalness: 0 })
      )
      ground.rotation.x = -Math.PI / 2
      ground.receiveShadow = true
      scene.add(ground)
      world.addBody(new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: matWood,
        quaternion: new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0) }))

      /* --- Décor du stand : fond rayé + poteaux + auvent --- */
      const back = new T.Mesh(
        new T.PlaneGeometry(7.2, 3.1),
        new T.MeshStandardMaterial({ map: stripeTex(T), roughness: 0.95 })
      )
      back.position.set(0, 1.55, -2.4)
      back.receiveShadow = true
      scene.add(back)
      const postMat = new T.MeshStandardMaterial({ color: 0xA9773F, roughness: 0.75 })
      for (const px of [-3.1, 3.1]) {
        const post = new T.Mesh(new T.CylinderGeometry(0.09, 0.1, 3, 12), postMat)
        post.position.set(px, 1.5, -2.1)
        post.castShadow = true
        scene.add(post)
      }

      /* --- Étagère --- */
      const shelfMat = new T.MeshStandardMaterial({ color: 0xB0854F, roughness: 0.72 })
      const shelf = new T.Mesh(new T.BoxGeometry(2.3, 0.09, 0.62), shelfMat)
      shelf.position.set(0, SHELF_Y, 0)
      shelf.castShadow = true; shelf.receiveShadow = true
      scene.add(shelf)
      world.addBody(new CANNON.Body({
        type: CANNON.Body.STATIC, material: matWood,
        shape: new CANNON.Box(new CANNON.Vec3(1.15, 0.045, 0.31)),
        position: new CANNON.Vec3(0, SHELF_Y, 0)
      }))
      for (const lx of [-1.0, 1.0]) {
        const leg = new T.Mesh(new T.BoxGeometry(0.1, SHELF_Y, 0.1), shelfMat)
        leg.position.set(lx, SHELF_Y / 2, 0)
        leg.castShadow = true
        scene.add(leg)
      }

      /* --- Les caisses (3-2-1) --- */
      const geo = new T.BoxGeometry(CRATE, CRATE, CRATE)
      const spots: [number, number][] = [
        [-CRATE - 0.045, 0], [0, 0], [CRATE + 0.045, 0],
        [-(CRATE + 0.045) / 2, 1], [(CRATE + 0.045) / 2, 1],
        [0, 2]
      ]
      const crates = spots.map(([x, row], i) => {
        const y = SHELF_Y + 0.045 + CRATE / 2 + row * (CRATE + 0.004)
        const mat = new T.MeshStandardMaterial({ map: woodTex(T, BANDS[i]), roughness: 0.72, metalness: 0.02 })
        const mesh = new T.Mesh(geo, mat)
        mesh.castShadow = true; mesh.receiveShadow = true
        mesh.position.set(x, y, 0)
        scene.add(mesh)
        const body = new CANNON.Body({
          mass: 0.6, material: matWood,
          shape: new CANNON.Box(new CANNON.Vec3(CRATE / 2, CRATE / 2, CRATE / 2)),
          position: new CANNON.Vec3(x, y, 0)
        })
        body.linearDamping = 0.02
        body.angularDamping = 0.06
        body.allowSleep = true; body.sleepSpeedLimit = 0.12
        world.addBody(body)
        return { mesh, body, down: false, y0: y }
      })

      /* --- La balle --- */
      const ball = new T.Mesh(
        new T.SphereGeometry(BALL_R, 32, 24),
        new T.MeshStandardMaterial({ color: 0xE8A13F, roughness: 0.42, metalness: 0.12 })
      )
      ball.castShadow = true
      scene.add(ball)
      const ballBody = new CANNON.Body({
        mass: 0.75, material: matBall, shape: new CANNON.Sphere(BALL_R),
        position: new CANNON.Vec3(BALL_START.x, BALL_START.y, BALL_START.z)
      })
      ballBody.linearDamping = 0 // trajectoire balistique exacte = prévisualisation honnête
      world.addBody(ballBody)

      /* --- Trajectoire prévisualisée (points 3D) --- */
      const trail = new T.Group()
      const dotGeo = new T.SphereGeometry(0.028, 10, 8)
      const dotMat = new T.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.85 })
      const trailDots = Array.from({ length: 16 }, () => {
        const m = new T.Mesh(dotGeo, dotMat)
        trail.add(m); return m
      })
      trail.visible = false
      scene.add(trail)

      st = {
        T, CANNON, renderer, scene, camera, world, crates, ball, ballBody,
        trail, trailDots, aimV: null, thrown: false, throws: c.byTier(6, 5, 4),
        score: 0, running: true, raf: 0, acc: 0, last: performance.now(), lastSnd: 0
      }
      resetBall()
      $('s3Balls').textContent = '🎾'.repeat(st.throws)

      // Sons d'impact proportionnels au choc
      world.addEventListener('postStep', () => {})
      ballBody.addEventListener('collide', (e: any) => {
        const now = performance.now()
        if (now - st.lastSnd < 80) return
        st.lastSnd = now
        const v = Math.abs(e.contact.getImpactVelocityAlongNormal())
        if (v > 3.5) sHit(); else if (v > 1) sBonk()
      })

      /* --- Visée : glisser / lâcher --- */
      let start: { x: number; y: number } | null = null
      const onDown = (e: PointerEvent) => {
        if (!st || !st.running || st.thrown) return
        start = { x: e.clientX, y: e.clientY }
      }
      const onMove = (e: PointerEvent) => {
        if (!start || !st || st.thrown) return
        st.aimV = screenToAim(e.clientX - start.x, e.clientY - start.y)
        updateTrail()
      }
      const onUp = (e: PointerEvent) => {
        if (!start || !st || !st.running) { start = null; return }
        const dx = e.clientX - start.x, dy = e.clientY - start.y
        start = null
        st.trail.visible = false
        if (!st.aimV || Math.hypot(dx, dy) < 24 || dy <= 0) { st.aimV = null; return }
        const v = st.aimV
        st.aimV = null
        ballBody.type = CANNON.Body.DYNAMIC
        ballBody.wakeUp()
        ballBody.updateMassProperties()
        ballBody.velocity.set(v.x, v.y, v.z)
        ballBody.angularVelocity.set(-v.z * 1.4, 0, v.x * 1.4)
        st.thrown = true
        st.thrownAt = performance.now()
        sWoosh()
      }
      arena.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)

      const onResize = () => {
        if (!st || !st.running) return
        const w = arena.clientWidth, h = arena.clientHeight
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        renderer.setSize(w, h)
      }
      window.addEventListener('resize', onResize)

      /* --- Boucle : physique à pas fixe, rendu libre --- */
      const STEP = 1 / 60
      const loop = () => {
        if (!st || !st.running) return
        const now = performance.now()
        const dt = Math.min(0.1, (now - st.last) / 1000)
        st.last = now
        world.step(STEP, dt, 4)

        for (const cr of crates) {
          cr.mesh.position.copy(cr.body.position as any)
          cr.mesh.quaternion.copy(cr.body.quaternion as any)
          if (!cr.down) {
            // Tombée : basculée ou éjectée de l'étagère
            const up = new T.Vector3(0, 1, 0).applyQuaternion(cr.mesh.quaternion)
            if (up.y < 0.72 || cr.body.position.y < cr.y0 - 0.22) knockDown(cr)
          }
        }
        ball.position.copy(ballBody.position as any)
        ball.quaternion.copy(ballBody.quaternion as any)

        if (st.thrown) {
          const t = now - st.thrownAt
          if (t > 3400 || (t > 700 && ballBody.velocity.length() < 0.35) || ballBody.position.y < -2) endThrow()
        }
        renderer.render(scene, camera)
        st.raf = requestAnimationFrame(loop)
      }
      st.raf = requestAnimationFrame(loop)

      st.cleanup = () => {
        arena.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('resize', onResize)
        scene.traverse((o: any) => {
          if (o.geometry) o.geometry.dispose()
          if (o.material) {
            const ms = Array.isArray(o.material) ? o.material : [o.material]
            ms.forEach((m: any) => { if (m.map) m.map.dispose(); m.dispose() })
          }
        })
        renderer.dispose()
        renderer.domElement.remove()
      }
    })()

    return () => {
      dead = true
      if (st) {
        st.running = false
        cancelAnimationFrame(st.raf)
        try { st.cleanup?.() } catch { /* déjà démonté */ }
        st = null
      }
    }
  }
}
