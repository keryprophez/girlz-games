import type { GameContext, GameDef } from '../core/types'
import { $, pick, rnd } from '../core/utils'
import { impact } from '../core/impact'
import {
  createStage, loadPhysics, loader, fixedStep, loadModel, fitModel,
  type Stage, type Cannon, type T3
} from '../core/three3d'
import { arcade, type Arcade } from '../core/arcade'
import { ground, decor, particles, camShake, toScreen, type Particles, type CamShake } from '../core/scene3d'
import { ICON } from '../core/icons'
import { sfx, preloadSfx } from '../core/sfx'

/* 🥷 Ninja du Verger, en 3D — les fruits sont de vrais modèles lancés en
   cloche par cannon-es. Le doigt trace une lame ; quand elle croise un fruit,
   il se SÉPARE en ses deux vraies moitiés (les modèles -half du kit, chair
   visible), coupées dans le sens du geste, qui partent chacune de leur côté.

   Trancher le piment coûte un cœur — trois piments et c'est fini. Un fruit
   raté casse la série, sans punition. Le plafond d'adresse : trancher
   PLUSIEURS fruits d'un seul trait (bonus, ralenti, « ×3 » qui claque), et
   la cadence qui monte avec la performance, pas avec l'horloge.

   Deuxième jeu sur core/arcade.ts + core/scene3d.ts (2/09). */

const G = 11
const ROUND_S = 45

/* Chaque fruit connaît sa moitié et la couleur de son jus. */
const FRUITS = [
  { whole: 'apple', half: 'apple-half', juice: 0xE8574C },
  { whole: 'lemon', half: 'lemon-half', juice: 0xF5D518 },
  { whole: 'pear', half: 'pear-half', juice: 0xB8D96A },
  { whole: 'avocado', half: 'advocado-half', juice: 0x7DB356 }
]
const BAD = 'pepper'

type Body = import('cannon-es').Body
type Obj = import('three').Object3D
interface Fruit { obj: Obj; body: Body; bad: boolean; def: typeof FRUITS[number] | null; sliced: boolean }
interface Half { obj: Obj; body: Body }
interface Cfg { min: number; max: number; every: number; bad: number; side: number }

interface State {
  stage: Stage
  T: T3
  CANNON: Cannon
  world: import('cannon-es').World
  models: Record<string, Obj>
  fruits: Fruit[]
  halves: Half[]
  game: Arcade
  fx: Particles
  shake: CamShake
  cfg: Cfg
  /** Demi-largeur visible à z = 0 : les fruits utilisent TOUT l'écran. */
  lane: number
  trail: { x: number; y: number; t: number }[]
  /** Fruits tranchés dans le trait en cours (bonus multi-tranche). */
  stroke: number
  over: boolean
  lastWhoosh: number
}

let nj: State | null = null
let ctx: GameContext

/** Lance une volée de fruits, en cloche depuis le bas — ou en travers depuis
    un bord, quand la rampe le permet. */
function spawnWave(me: State) {
  const { CANNON } = me
  const n = rnd(me.cfg.min, me.cfg.max)
  for (let i = 0; i < n; i++) {
    const bad = Math.random() < me.cfg.bad
    const def = bad ? null : pick(FRUITS)
    const proto = me.models[bad ? BAD : def!.whole]
    if (!proto) continue
    const obj = proto.clone(true)
    const fromSide = Math.random() < me.cfg.side
    let x: number, y: number, vx: number, vy: number
    if (fromSide) {
      const s = Math.random() < 0.5 ? -1 : 1
      x = s * (me.lane + 0.4); y = 0.4 + Math.random() * 1.2
      vx = -s * (2.2 + Math.random() * 1.2); vy = 4.2 + Math.random() * 1.6
    } else {
      x = (Math.random() * 2 - 1) * me.lane * 0.85; y = -1
      // En cloche vers le centre, apex haut dans le cadre : le tiers haut sert aussi
      vx = (0 - x) * (0.35 + Math.random() * 0.3); vy = 7.4 + Math.random() * 1.2
    }
    obj.position.set(x, y, 0)
    me.stage.scene.add(obj)
    const body = new CANNON.Body({ mass: 0.3, shape: new CANNON.Sphere(0.16), position: new CANNON.Vec3(x, y, 0) })
    body.velocity.set(vx, vy, 0)
    body.angularVelocity.set(rnd(-4, 4), rnd(-4, 4), rnd(-4, 4))
    me.world.addBody(body)
    me.fruits.push({ obj, body, bad, def, sliced: false })
  }
}

/** Distance d'un point à un segment — la lame est une suite de segments. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function slice(me: State, f: Fruit, dirX: number, dirY: number) {
  if (me.over || f.sliced) return
  f.sliced = true
  const { CANNON, stage: { scene } } = me
  const p = f.body.position

  if (f.bad) {
    impact(0.85, { matter: 'sourd', noShake: true })
    me.shake.hit(0.8)
    me.fx.burst(p, { count: 24, color: [0xC63B2A, 0x7A1E12, 0xFF7A4D], speed: 3, life: 0.8, size: 0.09 })
    me.game.flash(ICON.heartEmpty, 'bad')
    removeFruit(me, f)
    if (me.game.hurt()) finish(me, true)
    return
  }

  me.stroke++
  sfx('slice', { vol: 0.8 })
  impact(0.35, { matter: 'bois', noShake: true })
  me.fx.burst(p, { count: 14, color: [f.def!.juice, 0xFFFFFF], speed: 2.4, life: 0.6, size: 0.075, gravity: 7, spread: 1.2 })
  me.game.hit(1, { silent: true })
  // Plusieurs fruits d'un seul trait : LE geste du genre. Bonus, mot-image,
  // et un quart de seconde de ralenti pour savourer.
  if (me.stroke >= 3) {
    me.game.hit(me.stroke, { silent: true, perfect: true })
    me.game.flash('×' + me.stroke)
    sfx('confirm', { vol: 0.8, rate: 1 + me.stroke * 0.04 })
    me.stage.timeScale = 0.35
    me.game.after(90, () => { if (!me.over) me.stage.timeScale = 1 })
  }

  // Le fruit se sépare en ses deux moitiés, coupées DANS LE SENS DU GESTE et
  // éjectées de part et d'autre du trait
  const half = me.models[f.def!.half]
  const px = -dirY, py = dirX          // perpendiculaire au geste (repère écran, y vers le bas)
  const angle = -Math.atan2(dirY, dirX) // le même trait, dans le repère monde (y vers le haut)
  for (const side of [-1, 1]) {
    const h = half.clone(true)
    h.position.set(p.x, p.y, 0)
    h.rotation.z = angle + (side > 0 ? 0 : Math.PI)
    scene.add(h)
    const body = new CANNON.Body({ mass: 0.15, shape: new CANNON.Sphere(0.1), position: new CANNON.Vec3(p.x, p.y, 0) })
    body.velocity.set(
      f.body.velocity.x + side * px * 1.6,
      Math.max(1.2, f.body.velocity.y * 0.4) + side * -py * 1.6,
      0
    )
    body.angularVelocity.set(0, 0, side * rnd(6, 11))
    me.world.addBody(body)
    me.halves.push({ obj: h, body })
  }
  removeFruit(me, f)
}

function removeFruit(me: State, f: Fruit) {
  me.world.removeBody(f.body)
  me.stage.scene.remove(f.obj)
  const i = me.fruits.indexOf(f)
  if (i >= 0) me.fruits.splice(i, 1)
}

function finish(me: State, peppered: boolean) {
  if (me.over) return
  me.over = true
  // Outro : sur le piment, on encaisse au ralenti ; sinon les derniers fruits
  // retombent tranquillement, puis le score.
  me.stage.timeScale = peppered ? 0.4 : 0.7
  const s = me.game.s
  const th = ctx.byTier([22, 12], [32, 17], [44, 24])
  me.game.end({
    title: peppered ? 'Aïe, le piment !' : s.score >= th[0] ? 'Sabre d\'or !' : 'Beau tranchage !',
    msg: `${ctx.playerName} a marqué ${s.score} points` + (s.bestCombo >= 6 ? `, ${s.bestCombo} fruits d'affilée` : ''),
    outroMs: peppered ? 1100 : 700
  })
}

export const ninja: GameDef = {
  id: 'ninja', name: 'Ninja Verger', icon: '🥷', sq: 'sq-mint', cat: 'action', music: 'fair',
  subtitle: 'Tranche les fruits d\'un trait de doigt… pas le piment !',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="arena g3-arena nj3-arena" id="njArena">
        <canvas id="njBlade"></canvas>
      </div>`
    const arena = $('njArena')
    const hideLoader = loader(arena, '🥷')
    preloadSfx(['slice', 'whoosh', 'confirm', 'error'])

    ;(async () => {
      const [T, CANNON] = await loadPhysics()
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
      const scene = stage.scene

      /* Sol d'herbe sombre, vrais arbres au fond : un verger au crépuscule */
      const g = ground(stage, { radius: 16, color: 0x1C3A28 })
      g.position.y = -1.1
      const trees = [[-4.6, -6, 2.6], [4.8, -6.5, 3], [-2.4, -8, 2.2], [3, -8.5, 2.4], [0.3, -9, 2.8], [-6.5, -8, 2.5], [6.8, -8.6, 2.7]]
        .map(([x, z, size], i) => ({ model: `nature/${['tree_default', 'tree_oak', 'tree_fat', 'tree_detailed'][i % 4]}`, x, z, size, tint: 0x5E9A3C }))
      decor(stage, trees).then(grp => grp.position.y = -1.1).catch(() => { /* sans décor, le jeu tourne */ })

      /* La fête au verger : lampions chauds qui se balancent + lucioles. */
      const lanterns: { g: import('three').Group; phase: number }[] = []
      for (const [lx, ly, lz] of [[-2.4, 1.9, -2.2], [-0.8, 2.15, -2.6], [0.8, 2.15, -2.6], [2.4, 1.9, -2.2]] as [number, number, number][]) {
        const grp = new T.Group()
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
        grp.add(paper, cap, wire)
        grp.position.set(lx, ly, lz)
        scene.add(grp)
        lanterns.push({ g: grp, phase: lx * 2.1 })
      }
      const fireflyGeo = new T.SphereGeometry(0.02, 6, 5)
      const fireflyMat = new T.MeshBasicMaterial({ color: 0xFFE9A0, transparent: true })
      const fireflies: { m: import('three').Mesh; ph: number; sp: number }[] = []
      for (let i = 0; i < 12; i++) {
        const m = new T.Mesh(fireflyGeo, fireflyMat.clone())
        m.position.set((Math.random() * 2 - 1) * 3.4, -0.6 + Math.random() * 2.2, -1 - Math.random() * 4)
        scene.add(m)
        fireflies.push({ m, ph: Math.random() * 9, sp: 0.25 + Math.random() * 0.3 })
      }

      /* Monde physique : pas de sol — ce qui retombe sort de l'écran et meurt */
      const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0) })

      /* Fruits, moitiés et piment, tous préchargés AVANT d'enlever l'attente */
      const models: Record<string, Obj> = {}
      const names = [BAD, ...FRUITS.flatMap(f => [f.whole, f.half])]
      await Promise.all(names.map(async k => {
        const m = await loadModel('food', k)
        fitModel(T, m, k === BAD ? 0.34 : 0.46)
        models[k] = m
      }))
      if (dead) { stage.dispose(); return }
      hideLoader()

      // Demi-largeur visible à z = 0 : le lancer s'adapte à l'écran (paysage)
      const halfH = Math.tan(stage.camera.fov / 2 * Math.PI / 180) * 4.1
      const lane = halfH * stage.camera.aspect * 0.8

      const cfg: Cfg = c.byTier(
        { min: 2, max: 2, every: 1450, bad: 0.08, side: 0 },
        { min: 2, max: 3, every: 1250, bad: 0.15, side: 0.15 },
        { min: 3, max: 4, every: 1050, bad: 0.22, side: 0.3 }
      )
      const game = arcade(c, {
        host: arena,
        lives: 3,
        scoreIcon: ICON.blade,
        timer: ROUND_S,
        // La rampe suit la performance : tous les 6 fruits, plus de fruits, plus vite
        ramp: { every: 6, max: 6 },
        onLevel: () => {
          me.cfg.every = Math.max(650, me.cfg.every * 0.88)
          me.cfg.max = Math.min(5, me.cfg.max + 1)
          me.cfg.bad = Math.min(0.3, me.cfg.bad + 0.02)
          me.cfg.side = Math.min(0.45, me.cfg.side + 0.08)
          me.game.flash(ICON.bolt)
        },
        onTimeUp: () => finish(me, false),
        stars: s => { const th = c.byTier([22, 12], [32, 17], [44, 24]); return s.score >= th[0] ? 3 : s.score >= th[1] ? 2 : 1 }
      })
      const me: State = {
        stage, T, CANNON, world, models, fruits: [], halves: [], game,
        fx: particles(stage, 700), shake: camShake(stage), cfg: { ...cfg }, lane,
        trail: [], stroke: 0, over: false, lastWhoosh: 0
      }
      nj = me

      /* --- La lame : un canvas 2D par-dessus la scène, net sur tablette (DPR) --- */
      const blade = $('njBlade') as unknown as HTMLCanvasElement
      const bctx = blade.getContext('2d')!
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const sizeBlade = () => {
        blade.width = Math.round(arena.clientWidth * dpr); blade.height = Math.round(arena.clientHeight * dpr)
        bctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
      sizeBlade()
      window.addEventListener('resize', sizeBlade)

      let slicing = false
      let last: { x: number; y: number } | null = null
      const onDown = (e: PointerEvent) => {
        slicing = true
        last = { x: e.clientX, y: e.clientY }
        me.stroke = 0
      }
      const onMove = (e: PointerEvent) => {
        if (!slicing || !last || nj !== me || me.over) return
        const cur = { x: e.clientX, y: e.clientY }
        const dx = cur.x - last.x, dy = cur.y - last.y
        const len = Math.hypot(dx, dy)
        if (len < 6) return
        const now = performance.now()
        me.trail.push({ x: cur.x, y: cur.y, t: now })
        // Un « whoosh » quand la lame file vite, jamais plus de 6 par seconde
        if (len > 26 && now - me.lastWhoosh > 160) { me.lastWhoosh = now; sfx('whoosh', { vol: 0.35, rate: 1.15 }) }
        // La lame tranche tout fruit dont la projection écran croise le segment
        for (const f of [...me.fruits]) {
          const s = toScreen(stage, f.obj.position)
          if (segDist(s.x, s.y, last.x, last.y, cur.x, cur.y) < 46) {
            slice(me, f, dx / len, dy / len)
            if (nj !== me || me.over) return
          }
        }
        last = cur
      }
      const onUp = () => { slicing = false; last = null; me.stroke = 0 }
      stage.renderer.domElement.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)

      // Les volées vivent sur l'horloge SIMULÉE : pas de rafale au retour d'onglet
      const waver = () => {
        if (nj !== me || me.over) return
        spawnWave(me)
        game.after(me.cfg.every * (0.8 + Math.random() * 0.4), waver)
      }
      waver()

      const step = fixedStep()
      stage.start((dt, now) => {
        if (nj !== me) return
        game.tick(dt)
        // La fête vit toute seule : lampions qui se balancent, lucioles
        for (const l of lanterns) l.g.rotation.z = Math.sin(now / 900 + l.phase) * 0.09
        for (const fy of fireflies) {
          fy.m.position.x += Math.sin(now / 1300 + fy.ph) * dt * fy.sp
          fy.m.position.y += Math.cos(now / 1100 + fy.ph * 2) * dt * fy.sp * 0.6
          ;(fy.m.material as import('three').MeshBasicMaterial).opacity = 0.35 + Math.sin(now / 240 + fy.ph * 3) * 0.3
        }
        step(dt, () => {
          world.step(1 / 60)
          for (const f of me.fruits) { f.body.position.z = 0; f.body.velocity.z = 0 }
          for (const h of me.halves) { h.body.position.z = 0; h.body.velocity.z = 0 }
        })

        for (let i = me.fruits.length - 1; i >= 0; i--) {
          const f = me.fruits[i]
          f.obj.position.copy(f.body.position as unknown as import('three').Vector3)
          f.obj.quaternion.copy(f.body.quaternion as unknown as import('three').Quaternion)
          // Retombé sans être tranché : la série casse, sans punition
          if (f.body.position.y < -1.3 && f.body.velocity.y < 0) {
            if (!f.bad) game.miss()
            removeFruit(me, f)
          }
        }
        for (let i = me.halves.length - 1; i >= 0; i--) {
          const h = me.halves[i]
          h.obj.position.copy(h.body.position as unknown as import('three').Vector3)
          h.obj.quaternion.copy(h.body.quaternion as unknown as import('three').Quaternion)
          if (h.body.position.y < -1.4) {
            world.removeBody(h.body)
            scene.remove(h.obj)
            me.halves.splice(i, 1)
          }
        }
        me.fx.update(dt)
        me.shake.apply(dt)

        // La traîne de la lame s'estompe en 160 ms : fine et blanche sur un halo large
        const r = stage.renderer.domElement.getBoundingClientRect()
        bctx.clearRect(0, 0, blade.width, blade.height)
        me.trail = me.trail.filter(p => now - p.t < 160)
        if (me.trail.length > 1) {
          bctx.lineCap = 'round'; bctx.lineJoin = 'round'
          for (const pass of [0, 1]) {
            for (let i = 1; i < me.trail.length; i++) {
              const a = me.trail[i - 1], b = me.trail[i]
              const age = 1 - (now - b.t) / 160
              bctx.strokeStyle = pass === 0 ? `rgba(180,230,255,${0.35 * age})` : `rgba(255,255,255,${0.9 * age})`
              bctx.lineWidth = pass === 0 ? 6 + 14 * age : 1.5 + 5 * age
              bctx.beginPath()
              bctx.moveTo(a.x - r.left, a.y - r.top)
              bctx.lineTo(b.x - r.left, b.y - r.top)
              bctx.stroke()
            }
          }
        }
      })

      stage.keep({ dispose() {
        stage.renderer.domElement.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        window.removeEventListener('resize', sizeBlade)
        fireflyGeo.dispose(); fireflyMat.dispose()
        me.fx.dispose()
        me.game.dispose()
      } })
    })().catch(err => { if (!dead) throw err })

    return () => {
      dead = true
      if (nj) {
        nj.stage.dispose()
        nj = null
      }
    }
  }
}
