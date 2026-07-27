import type { GameContext, GameDef } from '../core/types'
import { impact } from '../core/impact'
import { $ } from '../core/utils'
import { sJump, sNope, sWin } from '../core/audio'
import {
  createStage, loadThree, loader, woodTex,
  type Stage
} from '../core/three3d'

/* 🚜 Course, en 3D — un vrai tracteur low-poly qui fonce sur un chemin de
   terre au crépuscule : roues qui tournent, fumée qui sort de la cheminée,
   bottes de foin, rochers et caisses à sauter, nuage de poussière à
   l'atterrissage.

   La SIMULATION ne change pas d'un chiffre : mêmes gravité, impulsion de
   saut, cadence d'apparition, fenêtre de collision et invulnérabilité que
   la version validée — elle tourne toujours en « pixels virtuels », seul le
   rendu les traduit en mètres. */

const PX = 0.008          // 1 pixel virtuel → mètres du monde 3D
const TX = 78             // position x du tracteur en px virtuels (comme avant)
const W = 900             // largeur virtuelle de la piste

let run: any = null
let ctx: GameContext

function loop(t: number) {
  if (!run || !run.running) return
  const dt = Math.min(50, t - run.lastT); run.lastT = t
  if (run.jumping) {
    run.y += run.vy * dt
    run.vy -= 0.0032 * dt
    if (run.y <= 0) {
      run.y = 0; run.jumping = false; run.vy = 0
      run.puffDust(1)
      impact(0.35, { matter: 'sourd', noShake: true })
    }
  }
  run.dist += run.speed * dt * 0.06
  run.speed += dt * 0.0000075
  const d = Math.floor(run.dist)
  $('runScore').textContent = '🚜 ' + d + ' m'
  run.sinceSpawn += dt
  if (run.sinceSpawn >= run.nextSpawn) {
    run.sinceSpawn = 0
    run.nextSpawn = run.cfg.gapMin + Math.random() * run.cfg.gapVar
    run.spawn()
  }
  if (run.invuln > 0) { run.invuln -= dt; run.tractor.visible = Math.floor(t / 90) % 2 === 0 }
  else run.tractor.visible = true
  for (let i = run.obstacles.length - 1; i >= 0; i--) {
    const o = run.obstacles[i]
    o.x -= run.speed * dt
    o.mesh.position.x = (o.x + 21 - TX) * PX
    const overlapX = Math.abs(o.x + 21 - TX) < 46
    const onGroundLevel = run.y < 34
    if (overlapX && onGroundLevel && run.invuln <= 0) {
      run.lives--; run.invuln = 1200
      $('runHearts').textContent = '❤️'.repeat(run.lives) + '🖤'.repeat(3 - run.lives)
      sNope()
      // Percuter un obstacle : choc plein, ressenti comme partout ailleurs
      impact(0.85, { matter: 'sourd' })
      if (run.lives <= 0) { finish(); return }
    }
    if (o.x < -60) { run.scene.remove(o.mesh); run.obstacles.splice(i, 1) }
  }
  requestAnimationFrame(loop)
}

function finish() {
  if (!run || !run.running) return
  run.running = false
  const d = Math.floor(run.dist)
  sWin()
  const th = ctx.byTier([140, 70], [180, 100], [220, 120])
  const stars = d >= th[0] ? 3 : d >= th[1] ? 2 : 1
  ctx.finish({ title: 'Fin de course !', msg: `${ctx.playerName} a parcouru ${d} mètres 🚜`, stars, starsEarned: stars })
}

/** Le tracteur : caisses et cylindres low-poly, roues séparées pour tourner. */
function makeTractor(T: any) {
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
  const wheels: any[] = []
  const mkWheel = (r: number, x: number, z: number) => {
    const w = new T.Group()
    const tire = new T.Mesh(new T.CylinderGeometry(r, r, 0.12, 18), dark)
    tire.rotation.x = Math.PI / 2
    const cap = new T.Mesh(new T.CylinderGeometry(r * 0.45, r * 0.45, 0.13, 12), hub)
    cap.rotation.x = Math.PI / 2
    w.add(tire, cap)
    w.position.set(x, r, z)
    w.traverse((m: any) => { m.castShadow = true })
    g.add(w)
    wheels.push(w)
  }
  mkWheel(0.24, -0.18, 0.2); mkWheel(0.24, -0.18, -0.2)
  mkWheel(0.15, 0.34, 0.19); mkWheel(0.15, 0.34, -0.19)
  g.add(body, hood, cab, roof, pipe)
  g.traverse((m: any) => { if (m.isMesh) m.castShadow = true })
  return { g, wheels, pipeTip: new T.Vector3(0.36, 0.66, 0.1) }
}

export const runGame: GameDef = {
  id: 'run', name: 'Course', icon: '🚜', sq: 'sq-mint', cat: 'action',
  subtitle: 'Tape ou ESPACE pour sauter les obstacles',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="topbar">
        <div class="hearts" id="runHearts">❤️❤️❤️</div>
        <div class="chip" id="runScore">🚜 0 m</div>
      </div>
      <div class="arena g3-arena run3-arena" id="runArea">
        <div class="hint g3-hint">Tape pour sauter ! 🚜</div>
      </div>`
    const area = $('runArea')
    const hideLoader = loader(area, '🚜')

    ;(async () => {
      const T = await loadThree()
      if (dead) return
      const stage: Stage = await createStage(area, {
        sky: '#2B2140',
        fog: [7, 16], fogColor: '#2B2140',
        cam: [0.4, 1.5, 4.4], target: [0.7, 0.7, 0], fov: 42,
        hemi: ['#FFD9B0', '#241C36', 0.7],
        sun: { pos: [3, 4.5, 3], color: '#FFC98A', intensity: 1.8, area: 6, far: 15 },
        fill: 0.35, exposure: 0.92, iblIntensity: 0.5
      })
      if (dead) { stage.dispose(); return }
      hideLoader()
      const scene = stage.scene

      /* Le chemin de terre : une bande dont la texture DÉFILE — c'est elle
         qui donne la vitesse, le tracteur ne bouge pas. */
      // Bois nettement plus clair que la route : sinon rondin et caisse se fondent
      const dirtTex = woodTex(T, '#B98E58')
      const road = new T.Mesh(
        new T.PlaneGeometry(16, 1.9),
        new T.MeshStandardMaterial({ color: 0x6B4A32, roughness: 0.95 })
      )
      road.rotation.x = -Math.PI / 2
      road.receiveShadow = true
      scene.add(road)
      // Traces de roues : deux lignes plus sombres
      for (const z of [-0.2, 0.2]) {
        const rut = new T.Mesh(
          new T.PlaneGeometry(16, 0.14),
          new T.MeshStandardMaterial({ color: 0x543A26, roughness: 1 })
        )
        rut.rotation.x = -Math.PI / 2
        rut.position.set(0, 0.002, z)
        scene.add(rut)
      }
      // Prés de chaque côté
      for (const z of [-4.4, 4.4]) {
        const grass = new T.Mesh(
          new T.PlaneGeometry(16, 7),
          new T.MeshStandardMaterial({ color: 0x2C4A2E, roughness: 0.95 })
        )
        grass.rotation.x = -Math.PI / 2
        grass.position.set(0, -0.005, z)
        grass.receiveShadow = true
        scene.add(grass)
      }
      // Cailloux du bord de route qui défilent : le sol « avance »
      const pebbles: any[] = []
      const pebGeo = new T.DodecahedronGeometry(0.045, 0)
      const pebMat = new T.MeshStandardMaterial({ color: 0x8A7460, roughness: 0.9 })
      for (let i = 0; i < 14; i++) {
        const p = new T.Mesh(pebGeo, pebMat)
        p.position.set(-7 + i * 1.1, 0.03, (i % 2 ? 1 : -1) * (0.95 + (i % 3) * 0.1))
        p.rotation.set(i, i * 2, 0)
        scene.add(p)
        pebbles.push(p)
      }
      // Arbres au fond, en deux rangées de parallaxe
      const trees: any[] = []
      const trunkMat = new T.MeshStandardMaterial({ color: 0x4A3423, roughness: 0.9 })
      const leafMat = new T.MeshStandardMaterial({ color: 0x24422A, roughness: 0.85 })
      const leafMat2 = new T.MeshStandardMaterial({ color: 0x1D3623, roughness: 0.85 })
      for (let i = 0; i < 12; i++) {
        const far2 = i >= 6
        const tr = new T.Group()
        const trunk = new T.Mesh(new T.CylinderGeometry(0.06, 0.09, 0.5, 7), trunkMat)
        trunk.position.y = 0.25
        const crown = new T.Mesh(new T.ConeGeometry(0.42, 0.95, 8), far2 ? leafMat2 : leafMat)
        crown.position.y = 0.95
        tr.add(trunk, crown)
        const s = far2 ? 0.75 : 1.1
        tr.scale.setScalar(s)
        tr.position.set(-7 + (i % 6) * 2.6 + (far2 ? 1.2 : 0), 0, far2 ? -4.6 : -2.9)
        tr.traverse((m: any) => { if (m.isMesh) m.castShadow = true })
        scene.add(tr)
        trees.push({ g: tr, depth: far2 ? 0.35 : 0.6, span: 15.6, off: far2 ? 1.2 : 0 })
      }

      /* Le tracteur */
      const { g: tractor, wheels } = makeTractor(T)
      tractor.position.set(0, 0, 0)
      scene.add(tractor)

      /* Fumée de cheminée + poussière : petites sphères recyclées */
      const puffGeo = new T.SphereGeometry(0.05, 8, 6)
      const puffs: any[] = []
      const smokeMat = new T.MeshBasicMaterial({ color: 0x9A93A8, transparent: true, opacity: 0.5 })
      const dustMat = new T.MeshBasicMaterial({ color: 0xA8845E, transparent: true, opacity: 0.6 })
      const puff = (x: number, y: number, mat: any, vy: number, n: number) => {
        for (let i = 0; i < n; i++) {
          const m = new T.Mesh(puffGeo, mat)
          m.position.set(x + (Math.random() - 0.5) * 0.15, y, (Math.random() - 0.5) * 0.3)
          scene.add(m)
          puffs.push({ m, vx: -0.4 - Math.random() * 0.4, vy: vy + Math.random() * 0.3, t: 0 })
        }
      }

      /* Les obstacles : botte de foin, rocher, caisse, rondin */
      const hayMat = new T.MeshStandardMaterial({ color: 0xB08D3E, roughness: 0.9 })
      const rockMat = new T.MeshStandardMaterial({ color: 0x6E6A66, roughness: 0.85 })
      const crateMat = new T.MeshStandardMaterial({ roughness: 0.8, map: dirtTex })
      stage.keep(dirtTex)
      const makers = [
        () => { // botte de foin couchée
          const m = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 0.4, 14), hayMat)
          m.rotation.x = Math.PI / 2
          m.position.y = 0.22
          return m
        },
        () => { // rocher
          const m = new T.Mesh(new T.DodecahedronGeometry(0.26, 0), rockMat)
          m.position.y = 0.2
          m.rotation.set(0.4, 0.8, 0)
          return m
        },
        () => { // caisse en bois
          const m = new T.Mesh(new T.BoxGeometry(0.4, 0.4, 0.4), crateMat)
          m.position.y = 0.2
          return m
        },
        () => { // rondin
          const m = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.55, 10), crateMat)
          m.rotation.x = Math.PI / 2
          m.position.y = 0.16
          return m
        }
      ]

      const cfg = c.byTier(
        { sp: 0.21, gapMin: 1400, gapVar: 900 },
        { sp: 0.27, gapMin: 1150, gapVar: 800 },
        { sp: 0.34, gapMin: 900, gapVar: 700 }
      )
      run = {
        scene, tractor, obstacles: [],
        y: 0, vy: 0, jumping: false,
        speed: cfg.sp, cfg, dist: 0, lives: 3, running: true,
        lastT: performance.now(), nextSpawn: 900, sinceSpawn: 0, invuln: 0,
        spawn() {
          const wrap = new T.Group()
          wrap.add(makers[Math.floor(Math.random() * makers.length)]())
          wrap.position.set((W + 40 + 21 - TX) * PX, 0, 0)
          wrap.traverse((m: any) => { if (m.isMesh) m.castShadow = true })
          scene.add(wrap)
          run.obstacles.push({ mesh: wrap, x: W + 40 })
        },
        puffDust(n: number) { puff(-0.1, 0.06, dustMat, 0.5, 4 * n) }
      }
      $('runHearts').textContent = '❤️❤️❤️'

      const jump = () => {
        if (!run || !run.running) return
        // 1.18 (et pas 0.95 comme en 2D) : sur le rendu 3D le saut paraissait
        // riquiqui — retour joueur. Plus haut ET plus de temps de vol.
        if (!run.jumping) { run.jumping = true; run.vy = 1.18; sJump() }
      }
      const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); jump() } }
      const onTap = (e: Event) => { e.preventDefault(); jump() }
      window.addEventListener('keydown', onKey)
      area.addEventListener('pointerdown', onTap)

      /* --- Rendu : la simulation tourne dans loop(), ici on incarne --- */
      let smokeAt = 0
      stage.start((dt, now) => {
        if (!run || !run.running) return
        // Le tracteur : hauteur de saut, cabrage, trépidation, roues
        tractor.position.y = run.y * PX
        tractor.rotation.z = run.jumping ? Math.min(0.3, run.vy * 0.35) : Math.sin(now / 60) * 0.008
        if (!run.jumping) tractor.position.y += Math.abs(Math.sin(now / 90)) * 0.012
        for (const w of wheels) w.rotation.z -= run.speed * dt * 1000 * PX / 0.2
        // La route défile : cailloux et arbres reculent, et bouclent
        const v = run.speed * dt * 1000 * PX
        for (const p of pebbles) {
          p.position.x -= v
          if (p.position.x < -7.5) p.position.x += 15
        }
        for (const t2 of trees) {
          t2.g.position.x -= v * t2.depth
          if (t2.g.position.x < -8) t2.g.position.x += t2.span
        }
        // Fumée : un pof régulier, plus dense quand ça va vite
        if (now - smokeAt > Math.max(140, 320 - run.speed * 400)) {
          smokeAt = now
          puff(0.36, (run.y * PX) + 0.68, smokeMat, 0.8, 1)
        }
        for (let i = puffs.length - 1; i >= 0; i--) {
          const s = puffs[i]
          s.t += dt
          s.m.position.x += s.vx * dt
          s.m.position.y += s.vy * dt
          s.m.scale.multiplyScalar(1 + dt * 1.6)
          if (s.t > 0.9) { scene.remove(s.m); puffs.splice(i, 1) }
        }
      })

      requestAnimationFrame(loop)

      run.cleanup = () => {
        window.removeEventListener('keydown', onKey)
        area.removeEventListener('pointerdown', onTap)
        puffGeo.dispose(); pebGeo.dispose()
        stage.dispose()
      }
    })().catch(() => { hideLoader(); ctx.toast('La 3D n\'est pas disponible ici 😕') })

    return () => {
      dead = true
      if (run) {
        run.running = false
        try { run.cleanup?.() } catch { /* déjà démonté */ }
        run = null
      }
    }
  }
}
