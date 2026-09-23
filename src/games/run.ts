import type { GameContext, GameDef } from '../core/types'
import { impact } from '../core/impact'
import { $ } from '../core/utils'
import { ICON } from '../core/icons'
import { makeDoll, poseDoll } from '../core/doll3d'
import { defaultLook } from '../core/character'
import { sfx, preloadSfx } from '../core/sfx'
import { arcade, type Arcade } from '../core/arcade'
import { runner, type Runner } from '../core/runner'
import { ground, decor, particles, camShake, type Particles, type CamShake } from '../core/scene3d'
import {
  createStage, loadThree, loader, loadModel, fitModel,
  type Stage, type T3
} from '../core/three3d'

/* 🚜 Course — un tracteur fonce sur un chemin de terre en plein jour, saute
   rondins, rochers, souches et bottes de foin, et RAMASSE les pommes et les
   carottes posées sur le chemin, qui remplissent sa remorque.

   Refonte du 15/09 (« la voiture est pourrie », les filles) :
   - un vrai tracteur : capot arrondi, calandre et phares, cabine à montants,
     siège, volant, garde-boue, grosses roues crantées dont on VOIT tourner
     les crampons, cheminée qui fume — et une remorque en bois derrière ;
   - il fait jour : ciel bleu, soleil, nuages qui dérivent, une ferme et son
     silo au loin, une clôture le long du chemin, deux ornières dans la terre ;
   - une seconde décision avec le même geste : les récoltes se ramassent en
     ROULANT dessus, donc sauter au mauvais moment fait rater la pomme.
     Chaque récolte atterrit dans la remorque, qui se remplit à vue.

   Refonte sur core/runner.ts + core/arcade.ts :
   - une seule boucle, en mètres et en secondes (plus de pixels virtuels) ;
   - le score, c'est le nombre d'obstacles sautés ; la vitesse monte tous
     les 5 sauts, et des DOUBLES arrivent aux paliers hauts ;
   - un saut de 0,95 m pour des obstacles de 0,3 à 0,45 m — proportionné,
     avec un tampon d'entrée : taper juste avant d'atterrir, ça ressaute ;
   - le near-miss : frôler un obstacle ou atterrir juste derrière, ça fait
     « Ouf ! » ; percuter, ça envoie l'obstacle valser, secoue la caméra,
     coûte un cœur ; au dernier cœur, le tracteur se renverse au ralenti. */

const PLAYER_X = 0
const SPAWN_X = 9.5
const DESPAWN_X = -4.5
const JUMP_V = 5.2       // m/s → 0,95 m de haut, 0,73 s de vol
const GRAVITY = 14.2
const TRACTOR = { back: -0.24, front: 0.36 } // l'empreinte en x qui compte pour la collision

interface ObData { h: number; knocked: boolean; vx: number; vy: number; rot: number; minClear: number; kind: string
  /** Une récolte : se ramasse en roulant dessus, ne blesse jamais. */
  collect?: boolean }
interface Cfg { speed: number; inc: number; gapMin: number; gapVar: number; doubleFrom: number }

interface State {
  stage: Stage
  game: Arcade
  run: Runner<ObData>
  fx: Particles
  shake: CamShake
  cfg: Cfg
  y: number
  vy: number
  jumping: boolean
  buffered: number      // tampon d'entrée : secondes restantes pour ressauter à l'atterrissage
  nextAt: number        // distance (m) à laquelle naît le prochain obstacle
  over: boolean
  tapHint: HTMLElement
  tractor: import('three').Group
  /** La remorque : ce qu'on a ramassé s'y empile. */
  load: import('three').Group
  picked: number
}

let rn: State | null = null
let ctx: GameContext

function jump(me: State) {
  if (me.over) return
  if (me.jumping) { me.buffered = 0.16; return }
  me.jumping = true
  me.vy = JUMP_V
  sfx('cloth', { vol: 0.5, rate: 1.3 })
  me.fx.burst({ x: -0.1, y: 0.04, z: 0 }, { count: 6, color: [0xA8845E, 0x7A5C3E], speed: 1.2, life: 0.5, size: 0.06, gravity: 3, dir: { x: -0.6, y: 0.6, z: 0 } })
  me.tapHint.classList.add('off')
}

function crash(me: State, ob: import('../core/runner').Obstacle<ObData>) {
  const d = ob.data
  d.knocked = true
  d.vx = me.run.speed * 1.6 + 1.5
  d.vy = 3.2
  d.rot = 6 + Math.random() * 4
  impact(0.85, { matter: 'sourd', noShake: true })
  me.shake.hit(0.8)
  sfx('bong', { vol: 0.6, rate: 0.8 })
  me.fx.burst({ x: ob.x, y: d.h * 0.6, z: 0 }, { count: 22, color: [0xA8845E, 0xD9B784, 0x6E6A66], speed: 2.6, life: 0.7, size: 0.06, gravity: 6 })
  me.game.flash(ICON.heartEmpty, 'bad')
  me.y = Math.max(me.y, 0.05); me.vy = 2.2; me.jumping = true // le choc soulève le tracteur
  if (me.game.hurt()) { finish(me); return }
  me.run.hurt(1.2)
}

/** Rouler sur une récolte : elle saute dans la remorque. Jamais de sanction. */
function collect(me: State, ob: import('../core/runner').Obstacle<ObData>) {
  const i = me.run.obstacles.indexOf(ob)
  if (i >= 0) me.run.obstacles.splice(i, 1)
  me.stage.scene.remove(ob.obj)
  sfx('pluck', { vol: 0.55, rate: 1 + Math.min(12, me.picked) * 0.03 })
  me.fx.burst({ x: 0, y: me.y + 0.25, z: 0 }, { count: 8, color: [0xFFE08A, 0xFFFFFF], speed: 1.4, life: 0.4, size: 0.05, gravity: 3 })
  const n = me.picked++
  if (n < 12) {
    // Elle prend sa place dans la remorque, en rangs, puis en couches
    const it = ob.obj
    it.position.set(-0.2 + (n % 3) * 0.2, 0.04 + Math.floor(n / 9) * 0.09, -0.15 + (Math.floor(n / 3) % 3) * 0.15)
    it.rotation.set(0, Math.random() * 6, 0)
    it.scale.multiplyScalar(0.8)
    me.load.add(it)
  }
  me.game.hit(1, { silent: true })
}

function finish(me: State) {
  if (me.over) return
  me.over = true
  me.stage.timeScale = 0.35
  const n = me.game.s.score
  const m = Math.floor(me.run.dist)
  const th = ctx.byTier([26, 13], [34, 17], [42, 21])
  const p = me.picked, j = n - p
  me.game.end({
    title: n >= th[0] ? 'Champion du volant !' : n >= th[1] ? 'Belle course !' : 'Le tracteur a versé !',
    msg: `Tu as ramassé ${p} récolte${p > 1 ? 's' : ''} et sauté ${j} obstacle${j > 1 ? 's' : ''} sur ${m} mètres`,
    outroMs: 1300
  })
}

/** La terre du chemin, avec deux ornières claires là où roulent les roues. */
function roadTex(T: T3) {
  const c = document.createElement('canvas')
  c.width = 256; c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#6B4E35'; g.fillRect(0, 0, 256, 128)
  for (const y of [46, 82]) {
    g.fillStyle = 'rgba(128,98,66,.85)'; g.fillRect(0, y - 7, 256, 14)
  }
  g.fillStyle = '#4F8F3A'
  g.fillRect(0, 0, 256, 5); g.fillRect(0, 123, 256, 5)
  for (let i = 0; i < 900; i++) {
    g.globalAlpha = 0.08 + Math.random() * 0.22
    g.fillStyle = Math.random() < 0.5 ? '#3C2A1B' : '#8C6B48'
    const s = 1 + Math.random() * 3
    g.fillRect(Math.random() * 256, Math.random() * 128, s, s * 0.7)
  }
  g.globalAlpha = 1
  const tex = new T.CanvasTexture(c)
  tex.wrapS = tex.wrapT = T.RepeatWrapping
  tex.repeat.set(8, 1)
  tex.colorSpace = T.SRGBColorSpace
  return tex
}

/** Le tracteur, avec sa remorque. Tout est fait de caisses et de cylindres,
    mais assemblés comme un vrai : capot arrondi, calandre, phares, cabine à
    montants, siège, volant, garde-boue, cheminée, et des roues à crampons —
    c'est le crampon qui rend la rotation visible. La remorque a un groupe
    `load` où les récoltes s'empilent. */
function makeTractor(T: T3) {
  const g = new T.Group()
  const m = (color: number, roughness = 0.6, metalness = 0) => new T.MeshStandardMaterial({ color, roughness, metalness })
  const red = m(0x9E2E22, 0.45, 0.15), redDark = m(0x76231A, 0.5, 0.1)
  const rubber = m(0x2A2826, 0.9), tread = m(0x403C3A, 0.9), hub = m(0xC9A227, 0.4, 0.3)
  const dark = m(0x22201E, 0.7), steel = m(0x8A8F96, 0.35, 0.6), wood = m(0x8A6A3E, 0.8)
  const glass = new T.MeshStandardMaterial({ color: 0x9EC7D8, roughness: 0.1, transparent: true, opacity: 0.5 })
  const lamp = new T.MeshStandardMaterial({ color: 0xFFE9A0, emissive: 0xFFD060, emissiveIntensity: 0.9 })
  const box = (mat: import('three').Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0, into: import('three').Object3D = g) => {
    const b = new T.Mesh(new T.BoxGeometry(sx, sy, sz), mat)
    b.position.set(x, y, z); b.rotation.set(rx, ry, rz); b.castShadow = true
    into.add(b); return b
  }
  const cyl = (mat: import('three').Material, x: number, y: number, z: number, r: number, h: number, rx = 0, ry = 0, rz = 0, into: import('three').Object3D = g, rTop = r) => {
    const c = new T.Mesh(new T.CylinderGeometry(rTop, r, h, 18), mat)
    c.position.set(x, y, z); c.rotation.set(rx, ry, rz); c.castShadow = true
    into.add(c); return c
  }
  // Châssis et capot
  box(dark, 0.06, 0.3, 0, 0.92, 0.12, 0.36)
  box(red, 0.34, 0.5, 0, 0.52, 0.24, 0.34)
  const top = cyl(red, 0.34, 0.62, 0, 0.17, 0.52, 0, 0, Math.PI / 2)
  top.scale.x = 0.55 // aplati : le capot est bombé, pas rond
  box(dark, 0.61, 0.48, 0, 0.04, 0.2, 0.26)
  cyl(lamp, 0.62, 0.56, 0.11, 0.035, 0.03, 0, 0, Math.PI / 2)
  cyl(lamp, 0.62, 0.56, -0.11, 0.035, 0.03, 0, 0, Math.PI / 2)
  cyl(dark, 0.46, 0.8, 0.1, 0.03, 0.34)
  cyl(dark, 0.46, 0.99, 0.1, 0.05, 0.035)
  // Cabine : plancher, panneau arrière, quatre montants, toit, pare-brise
  box(redDark, -0.16, 0.42, 0, 0.42, 0.06, 0.36)
  box(red, -0.36, 0.62, 0, 0.05, 0.36, 0.36)
  for (const x of [0.03, -0.35]) for (const z of [-0.17, 0.17]) box(steel, x, 0.72, z, 0.03, 0.5, 0.03)
  box(red, -0.16, 0.99, 0, 0.48, 0.05, 0.42)
  box(glass, 0.03, 0.74, 0, 0.015, 0.42, 0.3)
  // Siège, dossier, volant
  box(dark, -0.22, 0.5, 0, 0.2, 0.08, 0.22)
  box(dark, -0.31, 0.62, 0, 0.05, 0.22, 0.22)
  const wheel = new T.Mesh(new T.TorusGeometry(0.07, 0.012, 8, 20), steel)
  wheel.position.set(-0.04, 0.66, 0); wheel.rotation.y = Math.PI / 2; wheel.rotation.x = 0.35
  g.add(wheel)
  // Garde-boue au-dessus des roues arrière
  box(red, -0.2, 0.6, 0.27, 0.42, 0.04, 0.14)
  box(red, -0.2, 0.6, -0.27, 0.42, 0.04, 0.14)

  const wheels: import('three').Group[] = []
  const mkWheel = (r: number, w: number, x: number, z: number, into: import('three').Object3D = g) => {
    const wg = new T.Group()
    const tire = new T.Mesh(new T.CylinderGeometry(r, r, w, 20), rubber)
    tire.rotation.x = Math.PI / 2; tire.castShadow = true
    const cap = new T.Mesh(new T.CylinderGeometry(r * 0.45, r * 0.45, w + 0.012, 12), hub)
    cap.rotation.x = Math.PI / 2
    wg.add(tire, cap)
    // Les crampons : dix pavés autour de la bande de roulement
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      const lug = new T.Mesh(new T.BoxGeometry(0.05, r * 0.28, w + 0.024), tread)
      lug.position.set(Math.cos(a) * r, Math.sin(a) * r, 0)
      lug.rotation.z = a
      wg.add(lug)
    }
    wg.position.set(x, r, z)
    into.add(wg)
    wheels.push(wg)
  }
  mkWheel(0.28, 0.16, -0.2, 0.27); mkWheel(0.28, 0.16, -0.2, -0.27)
  mkWheel(0.16, 0.11, 0.42, 0.21); mkWheel(0.16, 0.11, 0.42, -0.21)

  // La remorque en bois, attelée derrière
  box(steel, -0.56, 0.27, 0, 0.3, 0.03, 0.03)
  box(wood, -0.98, 0.32, 0, 0.66, 0.06, 0.5)
  box(wood, -0.98, 0.42, 0.25, 0.66, 0.14, 0.03)
  box(wood, -0.98, 0.42, -0.25, 0.66, 0.14, 0.03)
  box(wood, -0.66, 0.42, 0, 0.03, 0.14, 0.5)
  box(wood, -1.3, 0.42, 0, 0.03, 0.14, 0.5)
  mkWheel(0.14, 0.1, -1.05, 0.28); mkWheel(0.14, 0.1, -1.05, -0.28)
  const load = new T.Group()
  load.position.set(-0.98, 0.35, 0)
  g.add(load)

  g.traverse(o => { if ((o as import('three').Mesh).isMesh) o.castShadow = true })
  return { g, wheels, load }
}

export const runGame: GameDef = {
  id: 'run', name: 'Course', icon: '🚜', sq: 'sq-mint', cat: 'action',
  subtitle: 'Tape pour sauter les obstacles',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `<div class="arena g3-arena run3-arena" id="runArea"></div>`
    const area = $('runArea')
    const hideLoader = loader(area, 'run')
    preloadSfx(['cloth', 'bong', 'whoosh', 'confirm', 'pluck'])

    ;(async () => {
      const T = await loadThree()
      if (dead) return
      const stage: Stage = await createStage(area, {
        sky: '#8FCDEB',
        fog: [12, 28], fogColor: '#BFE3F4',
        cam: [0.5, 1.5, 4.6], target: [0.9, 0.6, 0], fov: 42,
        hemi: ['#E8F6FF', '#4E7A3C', 0.95],
        sun: { pos: [3, 6, 4], color: '#FFF4D6', intensity: 2.1, area: 7, far: 22 },
        fill: 0.4, exposure: 1.0, iblIntensity: 0.5
      })
      if (dead) { stage.dispose(); return }
      const scene = stage.scene

      /* Le chemin de terre : sa texture DÉFILE, c'est elle qui donne la vitesse.
         Deux ornières plus claires là où passent les roues. */
      const dirt = stage.keep(roadTex(T))
      const road = new T.Mesh(new T.PlaneGeometry(22, 1.9), new T.MeshStandardMaterial({ map: dirt, roughness: 0.95 }))
      road.rotation.x = -Math.PI / 2
      road.position.set(2, 0.002, 0)
      road.receiveShadow = true
      scene.add(road)
      const g = ground(stage, { radius: 30, color: 0x4F8F3A, roughness: 0.98 })
      g.position.set(2, -0.004, 0)

      /* Le soleil, les nuages qui dérivent, la ferme et son silo au loin */
      const sun = new T.Mesh(new T.SphereGeometry(0.55, 16, 12), new T.MeshBasicMaterial({ color: 0xFFF0B0 }))
      sun.position.set(6, 5.6, -10)
      scene.add(sun)
      // Éclairés par-derrière, des nuages standard sortent gris : on les fait luire un peu
      const cloudMat = new T.MeshStandardMaterial({ color: 0xF4F6F8, roughness: 1, emissive: 0xE9EFF5, emissiveIntensity: 0.55 })
      const clouds: import('three').Group[] = []
      for (let i = 0; i < 5; i++) {
        const cl = new T.Group()
        for (let k = 0; k < 4; k++) {
          const puff = new T.Mesh(new T.SphereGeometry(0.45 + Math.random() * 0.35, 12, 9), cloudMat)
          puff.position.set(k * 0.55 - 0.8 + Math.random() * 0.2, Math.random() * 0.25, (Math.random() - 0.5) * 0.4)
          puff.scale.y = 0.62
          cl.add(puff)
        }
        cl.position.set(-8 + i * 4.6 + Math.random() * 2, 3.2 + Math.random() * 1.2, -7.5 - Math.random() * 2)
        cl.scale.setScalar(1.1 + Math.random() * 0.6)
        scene.add(cl)
        clouds.push(cl)
      }
      const farm = new T.Group()
      const barn = new T.Mesh(new T.BoxGeometry(1.8, 1.1, 1.2), new T.MeshStandardMaterial({ color: 0x8E2F25, roughness: 0.8 }))
      barn.position.y = 0.55
      const roofMat = new T.MeshStandardMaterial({ color: 0x5A3A2A, roughness: 0.9 })
      const roofA = new T.Mesh(new T.BoxGeometry(1.9, 0.06, 0.78), roofMat); roofA.position.set(0, 1.28, 0.34); roofA.rotation.x = 0.6
      const roofB = new T.Mesh(new T.BoxGeometry(1.9, 0.06, 0.78), roofMat); roofB.position.set(0, 1.28, -0.34); roofB.rotation.x = -0.6
      const door = new T.Mesh(new T.BoxGeometry(0.02, 0.7, 0.5), new T.MeshStandardMaterial({ color: 0x4A2A1F, roughness: 0.9 }))
      door.position.set(0.91, 0.35, 0)
      const silo = new T.Mesh(new T.CylinderGeometry(0.4, 0.4, 1.8, 14), new T.MeshStandardMaterial({ color: 0xB0B5BC, roughness: 0.5, metalness: 0.3 }))
      silo.position.set(-1.6, 0.9, -0.2)
      const siloTop = new T.Mesh(new T.CylinderGeometry(0.03, 0.42, 0.4, 14), barn.material)
      siloTop.position.set(-1.6, 2.0, -0.2)
      farm.add(barn, roofA, roofB, door, silo, siloTop)
      farm.position.set(5, 0, -6.5)
      farm.traverse(o => { if ((o as import('three').Mesh).isMesh) o.castShadow = true })
      scene.add(farm)

      /* Le décor du kit nature en deux couches qui bouclent : arbres proches et lointains */
      const span = 18
      // Les arbres proches restent DERRIÈRE le chemin : devant, ils boucheraient la vue
      const near = Array.from({ length: 7 }, (_, i) => ({ model: `nature/${['tree_default', 'tree_oak', 'tree_fat', 'tree_pineRoundA'][i % 4]}`, x: -6 + i * (span / 7) + Math.random(), z: -(1.9 + Math.random() * 0.9), size: 1.5 + Math.random() * 0.6, tint: 0x5E9A3C }))
      const far = Array.from({ length: 8 }, (_, i) => ({ model: `nature/${['tree_pineDefaultA', 'tree_cone', 'tree_pineRoundC'][i % 3]}`, x: -8 + i * (span / 8), z: -4.2 - Math.random() * 1.5, size: 2.2 + Math.random(), tint: 0x4C7F38 }))
      const fences = Array.from({ length: 12 }, (_, i) => ({ model: 'nature/fence_simple', x: -8 + i * 1.5, z: -1.32, size: 0.5, rot: 0, tint: 0xC9A874 }))
      const bits = Array.from({ length: 10 }, (_, i) => {
        const side = i % 2 ? 1 : -1
        return { model: `nature/${['rock_smallA', 'plant_bush', 'grass_large', 'flower_yellowA', 'mushroom_red'][i % 5]}`, x: -7 + i * (span / 10) + Math.random() * 0.8, z: side * (1.15 + Math.random() * 0.3), size: 0.22 + Math.random() * 0.14, tint: 0x8FB56A }
      })

      /* Les obstacles : vrais modèles du kit nature + une botte de foin maison.
         Et les récoltes (kit food), posées sur le chemin, à ramasser en roulant. */
      const protos: { g: import('three').Object3D; h: number; hw: number; kind: string }[] = []
      const crops: import('three').Object3D[] = []
      const mk = async (name: string, h: number, hw: number, tint: number, rot = 0, kit = 'nature', into = protos) => {
        const m = await loadModel(kit, name)
        fitModel(T, m, h)
        const col = new T.Color(tint)
        m.traverse(o => {
          const mesh = o as import('three').Mesh
          if (!mesh.isMesh) return
          const mat = (mesh.material as import('three').MeshStandardMaterial).clone()
          mat.color.multiply(col)
          mesh.material = mat
          mesh.castShadow = true
        })
        const box = new T.Box3().setFromObject(m)
        const wrap = new T.Group()
        m.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2)
        m.rotation.y = rot
        wrap.add(m)
        into.push({ g: wrap, h, hw, kind: name })
      }
      const cropProtos: typeof protos = []
      await Promise.all([
        mk('log', 0.34, 0.24, 0xB89468, Math.PI / 2),
        mk('rock_smallA', 0.32, 0.22, 0xA89A88),
        mk('stump_round', 0.36, 0.2, 0xB08A5E),
        mk('rock_largeA', 0.44, 0.26, 0x9C9288),
        mk('apple', 0.2, 0.1, 0xFFFFFF, 0, 'food', cropProtos),
        mk('carrot', 0.22, 0.1, 0xFFFFFF, Math.PI / 2, 'food', cropProtos)
      ])
      for (const cp of cropProtos) crops.push(cp.g)
      const hayMat = new T.MeshStandardMaterial({ color: 0xB08D3E, roughness: 0.9 })
      const hay = new T.Group()
      const hm = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 0.42, 14), hayMat)
      hm.rotation.x = Math.PI / 2; hm.position.y = 0.22; hm.castShadow = true
      hay.add(hm)
      protos.push({ g: hay, h: 0.44, hw: 0.22, kind: 'hay' })
      if (dead) { stage.dispose(); return }

      /* Le tracteur, et c'est ELLE qui conduit : assise sur le siège */
      const { g: tractor, wheels, load } = makeTractor(T)
      scene.add(tractor)
      // Au volant : SON personnage, habillé comme dans Habille-toi (23/09)
      const DS = 0.55
      const driver = makeDoll(T, c.look || defaultLook(), DS)
      driver.obj.position.set(-0.23, 0.55 - 0.27 * DS, 0)
      driver.obj.rotation.y = Math.PI / 2
      tractor.add(driver.obj)
      stage.keep(driver)

      hideLoader()
      const tapHint = document.createElement('div')
      tapHint.className = 'tap-hint'
      tapHint.innerHTML = ICON.tap
      area.appendChild(tapHint)

      const cfg: Cfg = c.byTier(
        { speed: 2.1, inc: 0.2, gapMin: 3.4, gapVar: 2.4, doubleFrom: 99 },
        { speed: 2.6, inc: 0.22, gapMin: 2.9, gapVar: 2.0, doubleFrom: 3 },
        { speed: 3.1, inc: 0.24, gapMin: 2.5, gapVar: 1.8, doubleFrom: 2 }
      )
      const game = arcade(c, {
        host: area,
        lives: c.byTier(5, 3, 3),
        scoreIcon: ICON.bolt,
        plainScore: true,
        ramp: { every: 5, max: 8 },
        onLevel: lv => { me.run.speed = cfg.speed + cfg.inc * lv; sfx('confirm', { vol: 0.5, rate: 1.2 }) },
        stars: s => { const th = c.byTier([26, 13], [34, 17], [42, 21]); return s.score >= th[0] ? 3 : s.score >= th[1] ? 2 : 1 }
      })
      const run = runner<ObData>(stage, { speed: cfg.speed, spawnX: SPAWN_X, despawnX: DESPAWN_X, playerX: PLAYER_X })
      const me: State = {
        stage, game, run, fx: particles(stage, 400), shake: camShake(stage), cfg,
        y: 0, vy: 0, jumping: false, buffered: 0, nextAt: 4, over: false, tapHint, tractor, load, picked: 0
      }
      rn = me

      // Les nuages et la ferme défilent lentement : ils sont loin
      run.layer(clouds, 0.12, 23, -11)
      run.layer([farm], 0.3, 30, -13)
      decor(stage, [...near, ...far, ...bits, ...fences]).then(grp => {
        if (rn !== me) return
        const kids = grp.children
        const a = near.length, b = a + far.length, d = b + bits.length
        run.layer(kids.slice(0, a), 1, span, -8)
        run.layer(kids.slice(a, b), 0.45, span, -10)
        run.layer(kids.slice(b, d), 1, span, -8)
        run.layer(kids.slice(d), 1, 18, -9)
      }).catch(() => { /* sans décor, le jeu tourne */ })

      const spawnOne = (x: number) => {
        const p = protos[Math.floor(Math.random() * protos.length)]
        const obj = p.g.clone(true)
        run.spawn(obj, p.hw, { h: p.h, knocked: false, vx: 0, vy: 0, rot: 0, minClear: 9, kind: p.kind }, x)
      }
      // Une rangée de récoltes sur le chemin, à ramasser en roulant dessus
      const spawnCrops = (x: number, n: number) => {
        if (!crops.length) return
        const proto = crops[Math.floor(Math.random() * crops.length)]
        for (let i = 0; i < n; i++) {
          const obj = proto.clone(true)
          run.spawn(obj, 0.1, { h: 0, knocked: false, vx: 0, vy: 0, rot: 0, minClear: 9, kind: 'crop', collect: true }, x + i * 0.45)
        }
      }
      const spawn = () => {
        const lv = game.s.level
        spawnOne(SPAWN_X)
        const double = lv >= cfg.doubleFrom && Math.random() < 0.3
        if (double) spawnOne(SPAWN_X + 0.78)
        // Juste après l'obstacle, trois récoltes : sauter trop tard les fait rater
        if (Math.random() < 0.75) spawnCrops(SPAWN_X + (double ? 2.1 : 1.3), 3)
        me.nextAt = run.dist + Math.max(2.1, cfg.gapMin - lv * 0.1) + Math.random() * cfg.gapVar
      }

      // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __run: unknown }).__run = {
          get running() { return !me.over }, get speed() { return run.speed }, get y() { return me.y },
          get jumping() { return me.jumping }, get dist() { return run.dist }, get lives() { return game.s.lives },
          get score() { return game.s.score },
          get obstacles() { return run.obstacles.filter(o => !o.data.knocked && !o.data.collect).map(o => ({ x: o.x, hw: o.hw, h: o.data.h })) },
          get picked() { return me.picked },
          get crops() { return run.obstacles.filter(o => o.data.collect).map(o => ({ x: o.x })) },
          front: TRACTOR.front
        }
      }

      /* --- Boucle --- */
      let smokeAt = 0
      let tilt = 0
      stage.start((dt, now) => {
        if (rn !== me) return
        game.tick(dt)
        // Le saut
        if (me.jumping) {
          me.y += me.vy * dt
          me.vy -= GRAVITY * dt
          if (me.y <= 0) {
            me.y = 0; me.jumping = false; me.vy = 0
            if (!me.over) {
              me.fx.burst({ x: -0.1, y: 0.04, z: 0 }, { count: 10, color: [0xA8845E, 0x7A5C3E], speed: 1.4, life: 0.5, size: 0.06, gravity: 3, dir: { x: -0.6, y: 0.5, z: 0 } })
              impact(0.35, { matter: 'sourd', noShake: true })
              // Atterrir juste derrière un obstacle : c'est le near-miss
              const justBehind = run.obstacles.find(o => o.passed && !o.data.knocked && PLAYER_X + TRACTOR.back - (o.x + o.hw) < 0.3)
              if (justBehind && justBehind.data.minClear < 0.16) { sfx('whoosh', { vol: 0.5 }); game.flash(ICON.bolt, 'good') }
              if (me.buffered > 0) { me.buffered = 0; jump(me) }
            }
          }
        }
        if (me.buffered > 0) me.buffered -= dt
        // Le monde avance (l'outro le ralentit avec timeScale)
        const v = run.speed * dt
        run.update(dt, {
          onPass: ob => {
            if (ob.data.knocked || ob.data.collect || me.over) return
            const close = ob.data.minClear < 0.16
            game.hit(1, { perfect: close })
            if (close) { sfx('whoosh', { vol: 0.5, rate: 1.1 }) }
          }
        })
        dirt.offset.x += v / (22 / 8)
        for (const w of wheels) w.rotation.z -= v / 0.2
        if (!me.over && run.dist >= me.nextAt) spawn()
        // Collision : empreinte du tracteur contre la boîte de l'obstacle ;
        // un obstacle percuté vole et tourne
        for (const ob of run.obstacles) {
          const d = ob.data
          if (d.collect) {
            // Une récolte tourne sur elle-même ; on la ramasse en roulant dessus
            ob.obj.rotation.y += dt * 2.2
            if (!me.over && me.y < 0.24 && Math.abs(ob.x - PLAYER_X) < 0.42) collect(me, ob)
            continue
          }
          if (d.knocked) {
            d.vx *= 0.99; d.vy -= GRAVITY * dt
            ob.obj.position.y += d.vy * dt; ob.x += d.vx * dt
            ob.obj.rotation.z += d.rot * dt
            continue
          }
          if (me.over) continue
          const overlap = ob.x + ob.hw > PLAYER_X + TRACTOR.back && ob.x - ob.hw < PLAYER_X + TRACTOR.front
          if (!overlap) continue
          d.minClear = Math.min(d.minClear, me.y - d.h)
          if (me.y < d.h - 0.06 && run.invuln <= 0) { crash(me, ob); break }
        }
        // Les nuages dérivent un peu d'eux-mêmes
        for (const cl of clouds) cl.position.x -= dt * 0.06
        // Le tracteur : hauteur, cabrage, trépidation, renversement d'outro
        tractor.position.y = me.y + (me.jumping ? 0 : Math.abs(Math.sin(now / 90)) * 0.012)
        // Elle conduit ; en l'air elle lève les bras, et la voilà qui s'accroche au renversement
        poseDoll(driver, 'sit', now / 1000, dt)
        if (me.jumping || me.over) {
          const w = Math.sin(now / 70) * 0.25
          driver.armL.rotation.set(0, 0, 2.3 + w); driver.armR.rotation.set(0, 0, -2.3 - w)
        }
        if (me.over) { tilt = Math.min(1.1, tilt + dt * 2.2); tractor.rotation.z = tilt; tractor.position.y = me.y + Math.sin(tilt) * 0.3 }
        else tractor.rotation.z = me.jumping ? Math.max(-0.35, Math.min(0.3, me.vy * 0.07)) : Math.sin(now / 60) * 0.008
        run.blink(tractor, now)
        // Fumée de cheminée : un pof régulier, plus dense quand ça va vite
        if (now - smokeAt > Math.max(120, 300 - run.speed * 40)) {
          smokeAt = now
          me.fx.burst({ x: 0.46, y: me.y + 1.02, z: 0.1 }, { count: 1, color: 0x9A93A8, speed: 0.5, spread: 0.2, life: 0.9, size: 0.14, gravity: -0.6, dir: { x: -0.7, y: 1, z: 0 } })
        }
        // La caméra recule un peu avec la vitesse, et tremble aux chocs
        const back = (run.speed - cfg.speed) * 0.25
        stage.camera.position.set(0.5 + back * 0.3, 1.5 + back * 0.2, 4.6 + back)
        stage.camera.lookAt(0.9 + back * 0.4, 0.6, 0)
        me.shake.apply(dt)
        me.fx.update(dt)
      })

      const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); jump(me) } }
      const onTap = (e: Event) => { e.preventDefault(); jump(me) }
      window.addEventListener('keydown', onKey)
      area.addEventListener('pointerdown', onTap)

      stage.keep({ dispose() {
        window.removeEventListener('keydown', onKey)
        area.removeEventListener('pointerdown', onTap)
        hm.geometry.dispose(); hayMat.dispose()
        me.fx.dispose()
        me.game.dispose()
      } })
    })().catch(err => { if (!dead) throw err })

    return () => {
      dead = true
      if (rn) { rn.stage.dispose(); rn = null }
    }
  }
}
