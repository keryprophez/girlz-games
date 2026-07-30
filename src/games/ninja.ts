import type { GameContext, GameDef } from '../core/types'
import { $, pick, rnd } from '../core/utils'
import { sPower, sSlice, sWin } from '../core/audio'
import { FX } from '../core/fx'
import { impact } from '../core/impact'
import {
  createStage, loadPhysics, loader, fixedStep, loadModel, fitModel,
  type Stage, type Cannon
} from '../core/three3d'

/* 🥷 Ninja du Verger, en 3D — les fruits sont de vrais modèles lancés en
   cloche par cannon-es. Le doigt trace une lame ; quand elle croise un fruit,
   il se SÉPARE en ses deux vraies moitiés (les modèles -half du kit, chair
   visible) qui partent chacune de leur côté et retombent en tournant.

   Trancher le piment coûte un cœur — trois piments et c'est fini. Un fruit
   raté casse la série, sans punition : le plafond d'adresse, c'est le combo
   quand tout vole en même temps. */

const G = 11
const LANE = 1.9              // demi-largeur de lancer

/* Chaque fruit connaît sa moitié et la couleur de son jus. */
const FRUITS = [
  { whole: 'apple', half: 'apple-half', juice: '#E8574C' },
  { whole: 'lemon', half: 'lemon-half', juice: '#F5D518' },
  { whole: 'pear', half: 'pear-half', juice: '#B8D96A' },
  { whole: 'avocado', half: 'advocado-half', juice: '#7DB356' }
]
const BAD = 'pepper'

let nj: any = null
let ctx: GameContext

function hud() {
  $('njScore').textContent = '🥷 ' + nj.score
  $('njLives').textContent = '❤️'.repeat(Math.max(0, nj.lives)) || '—'
  const c = $('njCombo')
  c.textContent = nj.combo >= 3 ? `×${Math.min(5, Math.floor(nj.combo / 3) + 1)}` : ''
  c.classList.toggle('on', nj.combo >= 3)
}

/** Lance une volée de fruits depuis le bas, en cloche vers le centre. */
function spawnWave() {
  if (!nj || !nj.running) return
  const CANNON: Cannon = nj.CANNON
  const n = rnd(nj.cfg.min, nj.cfg.max)
  for (let i = 0; i < n; i++) {
    const bad = Math.random() < nj.cfg.bad
    const def = bad ? null : pick(FRUITS)
    const proto = nj.models[bad ? BAD : def!.whole]
    if (!proto) continue
    const obj = proto.clone(true)
    const x = (Math.random() * 2 - 1) * LANE
    obj.position.set(x, -0.9, 0)
    nj.stage.scene.add(obj)
    const body = new CANNON.Body({
      mass: 0.3, shape: new CANNON.Sphere(0.16),
      position: new CANNON.Vec3(x, -0.9, 0)
    })
    // En cloche vers le centre : l'apex reste dans le cadre, jamais au-dessus
    body.velocity.set((0 - x) * (0.55 + Math.random() * 0.3), 6.6 + Math.random() * 0.9, 0)
    body.angularVelocity.set(rnd(-4, 4), rnd(-4, 4), rnd(-4, 4))
    nj.world.addBody(body)
    nj.fruits.push({ obj, body, bad, def, sliced: false })
  }
}

/** Position écran (px) d'un objet 3D — sert au test lame/fruit. */
function toScreen(obj: any) {
  const { camera, renderer } = nj.stage
  const v = nj.v3.copy(obj.position).project(camera)
  const r = renderer.domElement.getBoundingClientRect()
  return { x: (v.x * 0.5 + 0.5) * r.width + r.left, y: (-v.y * 0.5 + 0.5) * r.height + r.top }
}

/** Distance d'un point à un segment — la lame est une suite de segments. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function slice(f: any, dirX: number, dirY: number) {
  if (!nj || !nj.running || f.sliced) return
  f.sliced = true
  const CANNON: Cannon = nj.CANNON
  const { scene } = nj.stage
  const p = f.body.position
  const s = toScreen(f.obj)

  if (f.bad) {
    nj.lives--
    nj.combo = 0
    impact(0.85, { matter: 'sourd', x: s.x, y: s.y, colors: ['#C63B2A', '#7A1E12'] })
    hud()
    removeFruit(f)
    if (nj.lives <= 0) { finish(true); return }
    ctx.toast(`🌶️ Aïe, le piment ! ${'❤️'.repeat(nj.lives)}`)
    return
  }

  nj.combo++
  nj.bestCombo = Math.max(nj.bestCombo, nj.combo)
  nj.score += Math.min(5, Math.floor(nj.combo / 3) + 1)
  sSlice()
  impact(0.35, { matter: 'bois', noShake: true })
  FX.burst(s.x, s.y, { colors: [f.def.juice, '#FFFFFF'], count: 10 })
  if (nj.combo > 0 && nj.combo % 6 === 0) { sPower(); ctx.toast('🥷 Quelle lame !') }
  hud()

  // Le fruit se sépare en ses deux moitiés, éjectées de part et d'autre du trait
  const half = nj.models[f.def.half]
  const px = -dirY, py = dirX          // perpendiculaire au geste (repère écran)
  for (const side of [-1, 1]) {
    const h = half.clone(true)
    h.position.set(p.x, p.y, 0)
    h.rotation.z = side > 0 ? 0 : Math.PI
    scene.add(h)
    const body = new CANNON.Body({
      mass: 0.15, shape: new CANNON.Sphere(0.1),
      position: new CANNON.Vec3(p.x, p.y, 0)
    })
    body.velocity.set(
      f.body.velocity.x + side * px * 1.6,
      Math.max(1.2, f.body.velocity.y * 0.4) + side * -py * 1.6,
      0
    )
    body.angularVelocity.set(0, 0, side * rnd(6, 11))
    nj.world.addBody(body)
    nj.halves.push({ obj: h, body })
  }
  removeFruit(f)
}

function removeFruit(f: any) {
  nj.world.removeBody(f.body)
  nj.stage.scene.remove(f.obj)
  const i = nj.fruits.indexOf(f)
  if (i >= 0) nj.fruits.splice(i, 1)
}

function finish(peppered = false) {
  if (!nj || !nj.running) return
  nj.running = false
  clearInterval(nj.timer)
  clearTimeout(nj.waveT)
  sWin()
  const th = ctx.byTier([22, 12], [32, 17], [44, 24])
  const stars = nj.score >= th[0] ? 3 : nj.score >= th[1] ? 2 : 1
  ctx.finish({
    title: peppered ? 'Aïe, le piment ! 🌶️' : nj.score >= th[0] ? 'Sabre d\'or !' : 'Beau tranchage !',
    msg: `${ctx.playerName} a marqué ${nj.score} points`
      + (nj.bestCombo >= 3 ? ` — ${nj.bestCombo} d'affilée !` : ''),
    stars: stars as 1 | 2 | 3, starsEarned: stars
  })
}

export const ninja: GameDef = {
  id: 'ninja', name: 'Ninja Verger', icon: '🥷', sq: 'sq-mint', cat: 'action', music: 'fair',
  subtitle: 'Tranche les fruits d\'un trait de doigt… pas le piment !',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="njScore">🥷 0</div>
        <div class="chip" id="njLives">❤️❤️❤️</div>
      </div>
      <div class="g3-combo" id="njCombo"></div>
      <div class="tbar" style="max-width:520px"><div class="tfill" id="njTimer"></div></div>
      <div class="arena g3-arena nj3-arena" id="njArena">
        <div class="hint g3-hint" id="njHint">Glisse ton doigt en travers des fruits ! ⚔️</div>
        <canvas id="njBlade"></canvas>
      </div>`

    const arena = $('njArena')
    const hideLoader = loader(arena, '🥷')

    ;(async () => {
      const [, CANNON] = await loadPhysics()
      if (dead) return
      const stage: Stage = await createStage(arena, {
        sky: '#1A2E24',
        fog: [8, 22], fogColor: '#1A2E24',
        cam: [0, 1.1, 4.1], target: [0, 0.95, 0], fov: 46,
        hemi: ['#D8EFCF', '#1E3226', 0.8],
        sun: { pos: [2.5, 6, 4], color: '#FFF2D0', intensity: 2.1, area: 5, far: 15 },
        fill: 0.35, exposure: 0.95, iblIntensity: 0.55
      })
      if (dead) { stage.dispose(); return }
      hideLoader()
      const T = stage.T
      const scene = stage.scene

      /* Sol d'herbe sombre + quelques arbres au fond : un verger au crépuscule */
      const ground = new T.Mesh(
        new T.PlaneGeometry(24, 24),
        new T.MeshStandardMaterial({ color: 0x1C3A28, roughness: 0.95 })
      )
      ground.rotation.x = -Math.PI / 2
      ground.position.y = -1.1
      ground.receiveShadow = true
      scene.add(ground)
      const trunkMat = new T.MeshStandardMaterial({ color: 0x4A3524, roughness: 0.9 })
      const leafMat = new T.MeshStandardMaterial({ color: 0x265C38, roughness: 0.85 })
      for (const [x, z, k] of [[-4.2, -6, 1], [4.4, -6.5, 1.15], [-2.8, -8, 0.8], [3, -8.5, 0.9], [0.2, -9, 1.05]] as [number, number, number][]) {
        const tr = new T.Mesh(new T.CylinderGeometry(0.09 * k, 0.13 * k, 1.6 * k, 8), trunkMat)
        tr.position.set(x, -1.1 + 0.8 * k, z)
        tr.castShadow = true
        const lv = new T.Mesh(new T.SphereGeometry(0.8 * k, 12, 10), leafMat)
        lv.position.set(x, -1.1 + 1.9 * k, z)
        lv.castShadow = true
        scene.add(tr, lv)
      }

      /* La fête au verger : lampions chauds qui se balancent + lucioles.
         Entre deux volées, l'écran vivait mal son vide — plus maintenant. */
      const lanterns: any[] = []
      for (const [lx, ly, lz] of [[-1.7, 1.75, -2.2], [0, 2.05, -2.6], [1.7, 1.8, -2.2]] as [number, number, number][]) {
        const g = new T.Group()
        const paper = new T.Mesh(
          new T.SphereGeometry(0.15, 12, 10),
          new T.MeshStandardMaterial({ color: 0xB2402E, roughness: 0.6, emissive: 0xFF9040, emissiveIntensity: 0.9 })
        )
        paper.scale.set(1, 1.2, 1)
        const cap = new T.Mesh(new T.CylinderGeometry(0.05, 0.07, 0.05, 8),
          new T.MeshStandardMaterial({ color: 0x4A3524, roughness: 0.8 }))
        cap.position.y = 0.19
        const wire = new T.Mesh(new T.CylinderGeometry(0.006, 0.006, 0.5, 4),
          new T.MeshStandardMaterial({ color: 0x2A2018, roughness: 1 }))
        wire.position.y = 0.45
        g.add(paper, cap, wire)
        g.position.set(lx, ly, lz)
        scene.add(g)
        lanterns.push({ g, phase: lx * 2.1 })
      }
      const fireflyGeo = new T.SphereGeometry(0.02, 6, 5)
      const fireflyMat = new T.MeshBasicMaterial({ color: 0xFFE9A0, transparent: true })
      const fireflies: any[] = []
      for (let i = 0; i < 12; i++) {
        const m = new T.Mesh(fireflyGeo, fireflyMat.clone())
        m.position.set((Math.random() * 2 - 1) * 3.4, -0.6 + Math.random() * 2.2, -1 - Math.random() * 4)
        scene.add(m)
        fireflies.push({ m, ph: Math.random() * 9, sp: 0.25 + Math.random() * 0.3 })
      }

      /* Monde physique : pas de sol — ce qui retombe sort de l'écran et meurt */
      const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0) })

      /* Fruits, moitiés et piment, tous préchargés */
      const models: Record<string, any> = {}
      const names = [BAD, ...FRUITS.flatMap(f => [f.whole, f.half])]
      await Promise.all(names.map(async k => {
        const g = await loadModel('food', k)
        fitModel(T, g, k === BAD ? 0.34 : 0.46)
        models[k] = g
      }))
      if (dead) { stage.dispose(); return }

      // Cadence resserrée : une volée vole ~1,3 s — au-delà de 1,5 s entre
      // deux, l'écran restait vide (vu en passe visuelle). Zéro temps mort.
      const cfg = c.byTier(
        { min: 2, max: 2, every: 1450, bad: 0.08 },
        { min: 2, max: 3, every: 1250, bad: 0.15 },
        { min: 3, max: 4, every: 1050, bad: 0.22 }
      )
      nj = {
        stage, CANNON, world, models, fruits: [], halves: [],
        score: 0, lives: 3, combo: 0, bestCombo: 0, timeLeft: 45,
        cfg: { ...cfg }, running: true, step: fixedStep(),
        v3: new T.Vector3(), trail: [] as { x: number; y: number; t: number }[]
      }
      hud()

      /* --- La lame : un canvas 2D par-dessus la scène --- */
      const blade = $('njBlade') as unknown as HTMLCanvasElement
      const bctx = blade.getContext('2d')!
      const sizeBlade = () => { blade.width = arena.clientWidth; blade.height = arena.clientHeight }
      sizeBlade()
      window.addEventListener('resize', sizeBlade)

      let slicing = false
      let last: { x: number; y: number } | null = null
      const onDown = (e: PointerEvent) => {
        slicing = true
        last = { x: e.clientX, y: e.clientY }
        $('njHint').style.opacity = '0'
      }
      const onMove = (e: PointerEvent) => {
        if (!slicing || !last || !nj || !nj.running) return
        const cur = { x: e.clientX, y: e.clientY }
        const dx = cur.x - last.x, dy = cur.y - last.y
        const len = Math.hypot(dx, dy)
        if (len < 6) return
        nj.trail.push({ x: cur.x, y: cur.y, t: performance.now() })
        // La lame tranche tout fruit dont la projection écran croise le segment
        for (const f of [...nj.fruits]) {
          const s = toScreen(f.obj)
          if (segDist(s.x, s.y, last.x, last.y, cur.x, cur.y) < 46) {
            slice(f, dx / len, dy / len)
            if (!nj || !nj.running) return
          }
        }
        last = cur
      }
      const onUp = () => { slicing = false; last = null }
      stage.renderer.domElement.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)

      const waver = () => {
        if (!nj || !nj.running) return
        spawnWave()
        nj.waveT = setTimeout(waver, nj.cfg.every * (0.8 + Math.random() * 0.4))
      }
      waver()

      nj.timer = setInterval(() => {
        if (!nj || !nj.running) return
        nj.timeLeft--
        $('njTimer').style.width = (nj.timeLeft / 45) * 100 + '%'
        if (nj.timeLeft === 30 || nj.timeLeft === 15) {
          nj.cfg.every = Math.max(900, nj.cfg.every * 0.78)
          nj.cfg.max = Math.min(5, nj.cfg.max + 1)
          sPower(); ctx.toast('⚡ Plus vite !')
        }
        if (nj.timeLeft <= 0) finish(false)
      }, 1000)

      /* --- Boucle --- */
      stage.start((dt, now) => {
        if (!nj || !nj.running) return
        // La fête vit toute seule : lampions qui se balancent, lucioles
        for (const l of lanterns) l.g.rotation.z = Math.sin(now / 900 + l.phase) * 0.09
        for (const fy of fireflies) {
          fy.m.position.x += Math.sin(now / 1300 + fy.ph) * dt * fy.sp
          fy.m.position.y += Math.cos(now / 1100 + fy.ph * 2) * dt * fy.sp * 0.6
          fy.m.material.opacity = 0.35 + Math.sin(now / 240 + fy.ph * 3) * 0.3
        }
        nj.step(dt, () => {
          world.step(1 / 60)
          for (const f of nj.fruits) { f.body.position.z = 0; f.body.velocity.z = 0 }
          for (const h of nj.halves) { h.body.position.z = 0; h.body.velocity.z = 0 }
        })

        for (let i = nj.fruits.length - 1; i >= 0; i--) {
          const f = nj.fruits[i]
          f.obj.position.copy(f.body.position as any)
          f.obj.quaternion.copy(f.body.quaternion as any)
          // Retombé sans être tranché : la série casse, sans punition
          if (f.body.position.y < -1.3 && f.body.velocity.y < 0) {
            if (!f.bad && nj.combo > 0) { nj.combo = 0; hud() }
            removeFruit(f)
          }
        }
        for (let i = nj.halves.length - 1; i >= 0; i--) {
          const h = nj.halves[i]
          h.obj.position.copy(h.body.position as any)
          h.obj.quaternion.copy(h.body.quaternion as any)
          if (h.body.position.y < -1.4) {
            world.removeBody(h.body)
            scene.remove(h.obj)
            nj.halves.splice(i, 1)
          }
        }

        // La traîne de la lame s'estompe en 160 ms
        const r = stage.renderer.domElement.getBoundingClientRect()
        bctx.clearRect(0, 0, blade.width, blade.height)
        nj.trail = nj.trail.filter((p: any) => now - p.t < 160)
        if (nj.trail.length > 1) {
          bctx.lineCap = 'round'; bctx.lineJoin = 'round'
          for (let i = 1; i < nj.trail.length; i++) {
            const a = nj.trail[i - 1], b = nj.trail[i]
            const age = 1 - (now - b.t) / 160
            bctx.strokeStyle = `rgba(255,255,255,${0.85 * age})`
            bctx.lineWidth = 2 + 7 * age
            bctx.beginPath()
            bctx.moveTo(a.x - r.left, a.y - r.top)
            bctx.lineTo(b.x - r.left, b.y - r.top)
            bctx.stroke()
          }
        }
      })

      nj.cleanup = () => {
        stage.renderer.domElement.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        window.removeEventListener('resize', sizeBlade)
        clearInterval(nj.timer)
        clearTimeout(nj.waveT)
        fireflyGeo.dispose(); fireflyMat.dispose()
        stage.dispose()
      }
    })().catch(() => { hideLoader(); ctx.toast('La 3D n\'est pas disponible ici 😕') })

    return () => {
      dead = true
      if (nj) {
        nj.running = false
        try { nj.cleanup?.() } catch { /* déjà démonté */ }
        nj = null
      }
    }
  }
}
