import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { sNope, sWin, tone } from '../core/audio'
import { force, impact } from '../core/impact'

/* La Tour de Glace — l'archétype du bon jeu Flash : UN SEUL GESTE, un plafond
   d'adresse infini, un ÉCHEC RÉEL, un réessai immédiat.

   Un bloc de glace se balance au bout d'une grue. Un tap le lâche. La physique
   décide : bien centré → la tour monte et le combo « PARFAIT » grimpe ; décalé
   → le bloc dépasse, la tour penche, et elle peut s'écrouler. Le balancier
   accélère et les blocs rétrécissent à mesure qu'on monte. Score = hauteur.

   Ce jeu n'a AUCUN palier de déblocage : la seule récompense est de mieux jouer. */

let it: any = null
let ctx: GameContext

const BLOCK_H = 0.34
const BASE_W = 1.5
const CRANE_H = 1.65       // le bloc doit TOUJOURS rester visible au-dessus du sommet
const SETTLE_MS = 1300

function iceTex(T: any, tint: number): any {
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
  void tint
  return t
}

function hud() {
  $('itH').textContent = `🏔 ${it.placed}`
  $('itLives').textContent = '❤️'.repeat(Math.max(0, it.lives)) || '—'
  const combo = $('itCombo')
  combo.textContent = it.combo >= 2 ? `PARFAIT ×${it.combo}` : ''
  combo.classList.toggle('on', it.combo >= 2)
}

/** Un nouveau bloc part se balancer au bout de la grue. */
function nextBlock() {
  if (!it || !it.running) return
  const { T, CANNON, RB } = it
  const w = Math.max(0.62, BASE_W - it.placed * 0.028)   // ça rétrécit : la difficulté monte
  const topY = it.topY
  const y = topY + CRANE_H
  const mesh = new T.Mesh(
    new RB.RoundedBoxGeometry(w, BLOCK_H, 0.82, 3, 0.045),
    new T.MeshStandardMaterial({
      map: iceTex(T, 0), color: 0x5FA8D4, roughness: 0.2, metalness: 0.1
    })
  )
  mesh.castShadow = true; mesh.receiveShadow = true
  it.scene.add(mesh)
  const body = new CANNON.Body({
    mass: 1.1, material: it.matIce,
    shape: new CANNON.Box(new CANNON.Vec3(w / 2, BLOCK_H / 2, 0.41)),
    type: CANNON.Body.STATIC
  })
  body.position.set(0, y, 0)
  it.world.addBody(body)
  body.allowSleep = true
  body.sleepSpeedLimit = 0.2
  body.sleepTimeLimit = 0.35
  it.swing = { mesh, body, w, y, t: Math.random() * 6.28, dropped: false }
  // Le câble de la grue
  it.cable.visible = true
}

function drop() {
  if (!it || !it.running || !it.swing || it.swing.dropped || it.busy) return
  const s = it.swing
  s.dropped = true
  it.busy = true
  it.cable.visible = false
  s.body.type = it.CANNON.Body.DYNAMIC
  s.body.wakeUp()
  s.body.updateMassProperties()
  s.body.velocity.set(0, 0, 0)   // chute franche, sans impulsion artificielle
  s.body.angularVelocity.set(0, 0, 0)
  it.dropAt = performance.now()
  tone(300, 0.07, 'triangle', 0.09)
}

function judge() {
  const s = it.swing
  const expected = it.topY + BLOCK_H / 2
  const dx = Math.abs(s.body.position.x)
  const fell = s.body.position.y < expected - BLOCK_H * 0.75
  const tilted = Math.abs(new it.T.Euler().setFromQuaternion(
    new it.T.Quaternion(s.body.quaternion.x, s.body.quaternion.y, s.body.quaternion.z, s.body.quaternion.w)
  ).z) > 0.5

  if (fell || tilted) {
    // ÉCHEC RÉEL : le bloc a raté la tour
    it.lives--
    it.combo = 0
    sNope()
    // Un bloc qui rate, c'est un vrai fracas : force maximale
    impact(0.95, { matter: 'glace' })
    hud()
    if (it.lives <= 0) { gameOver(); return }
    ctx.toast('Raté ! Encore ' + it.lives + ' bloc' + (it.lives > 1 ? 's' : ''))
    it.blocks.push(s)     // il reste dans la scène, tombé au sol : la preuve de l'erreur
    it.swing = null
    it.busy = false
    nextBlock()
    return
  }

  // Posé !
  it.placed++
  it.topY += BLOCK_H
  it.blocks.push(s)
  const perfect = dx < 0.075
  if (perfect) {
    it.combo++
    it.best = Math.max(it.best, it.combo)
    // Le son monte avec le combo : la récompense sonore de l'adresse
    tone(520 + Math.min(12, it.combo) * 70, 0.13, 'sine', 0.13)
    setTimeout(() => tone(720 + Math.min(12, it.combo) * 80, 0.12, 'sine', 0.1), 90)
    flash(s)
  } else {
    it.combo = 0
    // Posé de travers : le choc se sent d'autant plus que le bloc est décalé
    impact(force(0.9 + dx * 9, 1, 7), { matter: 'glace', noShake: dx < 0.2 })
  }
  hud()
  it.swing = null
  it.busy = false
  nextBlock()
}

function flash(s: any) {
  const { T } = it
  const halo = new T.Mesh(
    new T.RingGeometry(0.5, 0.72, 24),
    new T.MeshBasicMaterial({ color: 0xFFE08A, transparent: true, opacity: 0.9, side: T.DoubleSide })
  )
  halo.position.set(s.body.position.x, s.body.position.y, 0.5)
  it.scene.add(halo)
  const t0 = performance.now()
  const grow = () => {
    if (!it || !it.running) return
    const k = (performance.now() - t0) / 420
    if (k >= 1) { it.scene.remove(halo); halo.geometry.dispose(); (halo.material as any).dispose(); return }
    halo.scale.setScalar(1 + k * 2.2)
    ;(halo.material as any).opacity = 0.9 * (1 - k)
    requestAnimationFrame(grow)
  }
  requestAnimationFrame(grow)
}

function gameOver() {
  it.running2 = false
  sWin()
  const h = it.placed
  const stars = h >= 14 ? 3 : h >= 7 ? 2 : 1
  ctx.finish({
    title: h >= 14 ? 'Tour GÉANTE !' : h >= 7 ? 'Belle tour !' : 'La tour s\'écroule !',
    msg: `${ctx.playerName} a empilé ${h} blocs de glace` + (it.best >= 2 ? ` — ${it.best} parfaits d'affilée !` : ''),
    stars: stars as 1 | 2 | 3, starsEarned: stars
  })
}

export const icetower: GameDef = {
  id: 'icetower', name: 'La Tour de Glace', icon: '🏔', sq: 'sq-sky', cat: 'action', music: 'winter',
  subtitle: 'Un tap pour lâcher le bloc. Monte le plus haut possible !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="itH">🏔 0</div>
        <div class="chip" id="itLives"></div>
      </div>
      <div class="arena it-arena" id="itArena">
        <div class="hint it-hint">Tape pour lâcher le bloc !</div>
        <div class="it-combo" id="itCombo"></div>
        <div class="nj-loading" id="itLoad">🧊</div>
      </div>`
    const arena = $('itArena')
    let dead = false

    ;(async () => {
      const [T, CANNON, RB, RE, EC, RP, BP, OP] = await Promise.all([
        import('three'), import('cannon-es'),
        import('three/examples/jsm/geometries/RoundedBoxGeometry.js'),
        import('three/examples/jsm/environments/RoomEnvironment.js'),
        import('three/examples/jsm/postprocessing/EffectComposer.js'),
        import('three/examples/jsm/postprocessing/RenderPass.js'),
        import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
        import('three/examples/jsm/postprocessing/OutputPass.js')
      ])
      if (dead) return
      const W = arena.clientWidth, H = arena.clientHeight

      const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
      renderer.setSize(W, H)
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = T.PCFSoftShadowMap
      renderer.toneMapping = T.ACESFilmicToneMapping
      renderer.toneMappingExposure = 0.88
      renderer.outputColorSpace = T.SRGBColorSpace
      $('itLoad')?.remove()
      arena.appendChild(renderer.domElement)

      const scene = new T.Scene()
      scene.background = new T.Color('#1B3350')
      // IBL : sans carte d'environnement, un matériau standard reste plat et
      // plastique. RoomEnvironment est généré par Three (aucun fichier).
      const pmrem = new T.PMREMGenerator(renderer)
      scene.environment = pmrem.fromScene(new RE.RoomEnvironment(), 0.04).texture
      scene.environmentIntensity = 0.7
      pmrem.dispose()
      scene.fog = new T.Fog('#1E3A59', 15, 40)

      // Caméra presque frontale : l'alignement doit se LIRE au pixel
      const composer = new EC.EffectComposer(renderer)
      const camera = new T.PerspectiveCamera(34, W / H, 0.1, 90)
      camera.position.set(0, 1.5, 8.4)
      camera.lookAt(0, 1.1, 0)

      composer.addPass(new RP.RenderPass(scene, camera))
      const bloom = new BP.UnrealBloomPass(new T.Vector2(W, H), 0.16, 0.4, 0.96)
      composer.addPass(bloom)
      composer.addPass(new OP.OutputPass())

      scene.add(new T.HemisphereLight(0xBBD8F0, 0x24405E, 0.55))
      const sun = new T.DirectionalLight(0xFFF0D4, 1.4)
      sun.position.set(4, 8, 6)
      sun.castShadow = true
      sun.shadow.mapSize.set(1024, 1024)
      sun.shadow.camera.near = 1; sun.shadow.camera.far = 30
      const d = 5
      sun.shadow.camera.left = -d; sun.shadow.camera.right = d
      sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -2
      sun.shadow.bias = -0.0013
      sun.shadow.radius = 3
      scene.add(sun)
      const fill = new T.DirectionalLight(0xC8DCF0, 0.18)
      fill.position.set(-2, 3, 7)
      scene.add(fill)

      const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) })
      world.broadphase = new CANNON.SAPBroadphase(world)
      ;(world.solver as any).iterations = 20
      world.allowSleep = true
      const matIce = new CANNON.Material('ice')
      // Frottement élevé : les blocs adhèrent mais un porte-à-faux fait basculer
      world.addContactMaterial(new CANNON.ContactMaterial(matIce, matIce, { friction: 0.62, restitution: 0.02 }))

      // Neige au sol
      const ground = new T.Mesh(
        new T.CircleGeometry(22, 48),
        new T.MeshStandardMaterial({ color: 0x2B4763, roughness: 0.96 })
      )
      ground.rotation.x = -Math.PI / 2
      ground.receiveShadow = true
      scene.add(ground)
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

      // Quelques sapins en fond pour l'échelle
      for (const [fx, fz, fs] of [[-4.2, -3, 1], [4.6, -3.4, 1.2], [-6, -5, 1.4], [6.4, -5.6, 1.1]]) {
        const trunk = new T.Mesh(new T.CylinderGeometry(0.09, 0.12, 0.5, 8),
          new T.MeshStandardMaterial({ color: 0x8A5A33, roughness: 0.9 }))
        trunk.position.set(fx, 0.25 * fs, fz)
        scene.add(trunk)
        for (let k = 0; k < 3; k++) {
          const cone = new T.Mesh(new T.ConeGeometry(0.62 * fs * (1 - k * 0.2), 0.9 * fs, 10),
            new T.MeshStandardMaterial({ color: k === 2 ? 0x4CA772 : 0x2E7D57, roughness: 0.85 }))
          cone.position.set(fx, (0.72 + k * 0.5) * fs, fz)
          cone.castShadow = true
          scene.add(cone)
        }
      }

      it = {
        T, CANNON, RB, renderer, scene, camera, world, matIce, cable,
        blocks: [], swing: null, placed: 0, topY: 0.3, combo: 0, best: 0,
        lives: c.byTier(5, 3, 2),
        swingSpeed: c.byTier(1.05, 1.5, 1.9),
        swingSpan: c.byTier(1.05, 1.35, 1.55),
        busy: false, running: true, running2: true, raf: 0, last: performance.now(), camY: 1.1
      }
      hud()
      nextBlock()

      arena.addEventListener('pointerdown', drop)
      const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Enter') drop() }
      window.addEventListener('keydown', onKey)
      const onResize = () => {
        if (!it || !it.running) return
        camera.aspect = arena.clientWidth / arena.clientHeight
        camera.updateProjectionMatrix()
        renderer.setSize(arena.clientWidth, arena.clientHeight)
        composer.setSize(arena.clientWidth, arena.clientHeight)
      }
      window.addEventListener('resize', onResize)

      const STEP = 1 / 60
      const loop = () => {
        if (!it || !it.running) return
        const now = performance.now()
        const dt = Math.min(0.08, (now - it.last) / 1000)
        it.last = now

        // Le bloc se balance tant qu'on ne l'a pas lâché
        const s = it.swing
        if (s && !s.dropped) {
          s.t += dt * it.swingSpeed
          const x = Math.sin(s.t) * it.swingSpan
          s.body.position.set(x, s.y, 0)
          s.mesh.position.set(x, s.y, 0)
          s.mesh.quaternion.set(0, 0, 0, 1)
          ;(window as any).__towerX = x  // accroche pour les tests automatisés
          cable.position.set(x, s.y + CRANE_H * 0.32, 0)
          cable.scale.y = CRANE_H * 0.64
        }

        if (it.running2) world.step(STEP, dt, 4)

        for (const b of it.blocks) {
          b.mesh.position.copy(b.body.position as any)
          b.mesh.quaternion.copy(b.body.quaternion as any)
        }
        if (s && s.dropped) {
          s.mesh.position.copy(s.body.position as any)
          s.mesh.quaternion.copy(s.body.quaternion as any)
          const el = now - it.dropAt
          if (el > SETTLE_MS || (el > 200 && s.body.velocity.length() < 0.45)) {
            judge()
            if (!it || !it.running) return   // judge() a pu terminer la partie
          }
        }

        // La tour s'est écroulée ? Le sommet réel a chuté → fin
        if (it.running2 && it.placed >= 3) {
          const top = it.blocks[it.blocks.length - 1]
          if (top && top.body.position.y < it.topY - BLOCK_H * 2.5) { gameOver(); return }
        }

        // La caméra suit le sommet (recul progressif : on voit la tour entière)
        const want = it.topY + 0.55
        it.camY += (want - it.camY) * Math.min(1, dt * 2.8)
        camera.position.y = it.camY
        camera.position.z = 7.2 + Math.min(3, it.topY * 0.22)
        camera.lookAt(0, it.camY, 0)
        sun.position.set(4, it.camY + 8, 6)
        sun.target.position.set(0, it.camY, 0)
        sun.target.updateMatrixWorld()

        composer.render()
        it.raf = requestAnimationFrame(loop)
      }
      it.raf = requestAnimationFrame(loop)

      it.cleanup = () => {
        arena.removeEventListener('pointerdown', drop)
        window.removeEventListener('keydown', onKey)
        window.removeEventListener('resize', onResize)
        scene.traverse((o: any) => {
          if (o.geometry) o.geometry.dispose()
          if (o.material) {
            const ms = Array.isArray(o.material) ? o.material : [o.material]
            ms.forEach((m: any) => { if (m.map) m.map.dispose(); m.dispose() })
          }
        })
        composer.dispose?.()
        renderer.dispose()
        renderer.domElement.remove()
      }
    })()

    return () => {
      dead = true
      if (it) {
        it.running = false
        cancelAnimationFrame(it.raf)
        try { it.cleanup?.() } catch { /* déjà démonté */ }
        it = null
      }
    }
  }
}
