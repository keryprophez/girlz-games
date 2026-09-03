import type { GameContext, GameDef } from '../core/types'
import { $, pick } from '../core/utils'
import { sCrunch } from '../core/audio'
import { ICON } from '../core/icons'
import { sfx, preloadSfx } from '../core/sfx'
import { impact } from '../core/impact'
import { confetti } from '../core/fx'
import { decor, ring, particles, toScreen, type Particles } from '../core/scene3d'
import {
  createStage, loadPhysics, loader, fixedStep, orbitCam, snowTex, bumpyNormal, picker,
  type Stage, type Cannon, type T3, type Orbit
} from '../core/three3d'

/* ⛄ Bonhomme de neige — on ROULE vraiment une boule dans la neige : elle
   creuse un sillon et grossit. Quand elle est assez grosse, on la roule
   JUSQU'À LA PILE : elle y monte d'elle-même, tombe et s'écrase avec la
   physique. Trois boules, puis on habille le bonhomme en GLISSANT de vrais
   objets 3D depuis un plateau : chapeau, yeux, nez, écharpe, bras, boutons.
   Jeu créatif : aucun échec, aucun chrono, aucune note.

   Refonte du 3/09 : plus de boule téléportée sur la pile (elle y roule),
   plus de formulaire à six onglets (un plateau d'objets à glisser), chocs
   branchés sur core/impact.ts, particules GPU, plein écran. */

/* ---------- Réglages ---------- */
const FIELD = 4.6            // demi-largeur du champ de neige jouable
const PILE = { x: 0, z: -0.6 } // où l'on empile
const R0 = 0.17
const MIN_POSE = 0.27        // rayon à partir duquel la pile accepte la boule
const CAP0 = 0.62            // plus grosse boule possible (la suivante : 78 % de la précédente)
const GROW = 0.055           // rayon gagné par unité de distance roulée
const G = 9.82
const SHELF_SIZE = 0.14      // taille d'un objet sur le plateau (m, en espace caméra)

type Kind = 'hat' | 'eyes' | 'nose' | 'scarf' | 'arms' | 'buttons'
interface ItemDef { kind: Kind; variant: string; color?: number }

/* Le plateau : seize objets, deux rangées, une seule pièce par famille sur le bonhomme */
const ITEMS: ItemDef[] = [
  { kind: 'hat', variant: 'tophat' }, { kind: 'hat', variant: 'bonnet' }, { kind: 'hat', variant: 'crown' },
  { kind: 'eyes', variant: 'coal' }, { kind: 'eyes', variant: 'button' }, { kind: 'eyes', variant: 'star' },
  { kind: 'nose', variant: 'carrot' }, { kind: 'nose', variant: 'dot' },
  { kind: 'scarf', variant: 'red', color: 0xE04E63 }, { kind: 'scarf', variant: 'blue', color: 0x4FA3D8 }, { kind: 'scarf', variant: 'green', color: 0x5EC97B },
  { kind: 'arms', variant: 'branch' }, { kind: 'arms', variant: 'mitten' },
  { kind: 'buttons', variant: 'coal', color: 0x332A22 }, { kind: 'buttons', variant: 'red', color: 0xE04E63 }, { kind: 'buttons', variant: 'yellow', color: 0xFFB84D }
]

interface Anatomy { bodyR: number; headR: number; headY: number; bodyY: number; topY: number }
/** Proportions de référence pour fabriquer les objets du plateau (avant que le bonhomme existe). */
const REF: Anatomy = { bodyR: 0.46, headR: 0.34, headY: 1.64, bodyY: 0.98, topY: 1.98 }

type Obj = import('three').Object3D
type Group = import('three').Group
type Mesh = import('three').Mesh

interface Item {
  def: ItemDef
  shelf: Group            // la version miniature sur le plateau
  real: Group | null      // la version à la taille du bonhomme
  placed: boolean
}

interface Ball { mesh: Mesh; r: number; body: import('cannon-es').Body | null; tx: number; tz: number; topY: number; settled: boolean; t: number; landed: boolean; squash: number }

interface State {
  stage: Stage
  CANNON: Cannon
  world: import('cannon-es').World
  matSnow: import('cannon-es').Material
  snowMat: import('three').MeshStandardMaterial
  ballGeo: import('three').SphereGeometry
  trail: { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: import('three').CanvasTexture }
  fall: { pts: import('three').Points; pos: Float32Array; N: number }
  fx: Particles
  phase: 'roll' | 'lift' | 'drop' | 'deco'
  stack: Ball[]
  r: number
  ball: Mesh | null
  rolled: number
  lift: { t: number; from: import('three').Vector3; to: import('three').Vector3; mesh: Mesh; r: number } | null
  man: Group              // la pile + l'habillage, à la position de la pile
  items: Item[]
  tray: Group
  drag: { item: Item; off: import('three').Vector3; plane: import('three').Plane } | null
  pileRing: Mesh
  arrow: Group
  orbit: Orbit
  step: (dt: number, fn: () => void) => void
  done: boolean
  hint: HTMLElement
}

let ctx: GameContext
let S: State | null = null

/* ---------- Le sillon creusé dans la neige ---------- */
function makeTrail(T: T3) {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')!
  g.clearRect(0, 0, 512, 512)
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  return { canvas: c, g, tex: t }
}

/** Creuse un rond de neige à la position monde (x,z) : la glace bleutée apparaît. */
function digAt(me: State, x: number, z: number, r: number) {
  const { g, tex } = me.trail
  const px = ((x + FIELD) / (FIELD * 2)) * 512
  const py = ((z + FIELD) / (FIELD * 2)) * 512
  const pr = (r / (FIELD * 2)) * 512
  const grad = g.createRadialGradient(px, py, pr * 0.2, px, py, pr)
  grad.addColorStop(0, 'rgba(150,190,220,.85)')
  grad.addColorStop(0.7, 'rgba(178,210,235,.6)')
  grad.addColorStop(1, 'rgba(200,225,245,0)')
  g.fillStyle = grad
  g.beginPath(); g.arc(px, py, pr, 0, 7); g.fill()
  tex.needsUpdate = true
}

/** Flocons qui tombent en continu : un nuage de points recyclé, ça ne coûte rien. */
function addSnowfall(T: T3, scene: import('three').Scene) {
  const N = 700
  const pos = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 24
    pos[i * 3 + 1] = Math.random() * 12
    pos[i * 3 + 2] = (Math.random() - 0.5) * 24
  }
  const geo = new T.BufferGeometry()
  geo.setAttribute('position', new T.BufferAttribute(pos, 3))
  const pts = new T.Points(geo, new T.PointsMaterial({
    color: 0xFFFFFF, size: 0.07, transparent: true, opacity: 0.85, depthWrite: false
  }))
  scene.add(pts)
  return { pts, pos, N }
}

/* ---------- Les objets d'habillage ----------
   Chaque objet est un groupe dont l'origine est celle du bonhomme : le poser,
   c'est l'ajouter au groupe `man` sans rien déplacer. */
function buildItem(T: T3, def: ItemDef, a: Anatomy, thick = 1): Group {
  const D = new T.Group()
  const std = (o: ConstructorParameters<typeof T.MeshStandardMaterial>[0]) => new T.MeshStandardMaterial(o)
  const add = (m: Mesh) => { m.castShadow = true; D.add(m) }
  const neckY = (a.headY - a.headR * 0.82 + a.bodyY + a.bodyR * 0.82) / 2

  if (def.kind === 'eyes') {
    const col = def.variant === 'button' ? 0x3F8FD0 : def.variant === 'star' ? 0xFFD75E : 0x2A2320
    const geo = def.variant === 'star' ? new T.OctahedronGeometry(a.headR * 0.17, 0) : new T.SphereGeometry(a.headR * 0.13, 14, 12)
    const mat = std({ color: col, roughness: 0.35, metalness: 0.15 })
    for (const sx of [-1, 1]) {
      const e = new T.Mesh(geo, mat)
      e.position.set(sx * a.headR * 0.36, a.headY + a.headR * 0.22, a.headR * 0.86)
      add(e)
    }
  } else if (def.kind === 'nose') {
    if (def.variant === 'carrot') {
      const n = new T.Mesh(new T.ConeGeometry(a.headR * 0.19, a.headR * 0.95, 12), std({ color: 0xF08A2E, roughness: 0.55 }))
      n.rotation.x = Math.PI / 2
      n.position.set(0, a.headY, a.headR * 1.25)
      add(n)
    } else {
      const n = new T.Mesh(new T.SphereGeometry(a.headR * 0.18, 16, 12), std({ color: 0xE0504F, roughness: 0.4 }))
      n.position.set(0, a.headY, a.headR * 0.95)
      add(n)
    }
  } else if (def.kind === 'hat') {
    if (def.variant === 'tophat') {
      const mat = std({ color: 0x2A2733, roughness: 0.45, metalness: 0.1 })
      const brim = new T.Mesh(new T.CylinderGeometry(a.headR * 1.15, a.headR * 1.15, a.headR * 0.09, 24), mat)
      brim.position.y = a.headY + a.headR * 0.86
      const top = new T.Mesh(new T.CylinderGeometry(a.headR * 0.72, a.headR * 0.72, a.headR * 1.15, 24), mat)
      top.position.y = a.headY + a.headR * 1.45
      const band = new T.Mesh(new T.CylinderGeometry(a.headR * 0.74, a.headR * 0.74, a.headR * 0.24, 24), std({ color: 0xE04E63, roughness: 0.6 }))
      band.position.y = a.headY + a.headR * 1.0
      ;[brim, top, band].forEach(add)
    } else if (def.variant === 'bonnet') {
      const mat = std({ color: 0x4FA3D8, roughness: 0.95 })
      const cap = new T.Mesh(new T.SphereGeometry(a.headR * 1.03, 22, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat)
      cap.position.y = a.headY + a.headR * 0.28
      const rim = new T.Mesh(new T.TorusGeometry(a.headR * 1.0, a.headR * 0.13, 10, 24), mat)
      rim.rotation.x = Math.PI / 2
      rim.position.y = a.headY + a.headR * 0.3
      const pom = new T.Mesh(new T.SphereGeometry(a.headR * 0.26, 14, 12), std({ color: 0xFFF3E0, roughness: 1 }))
      pom.position.y = a.headY + a.headR * 1.35
      ;[cap, rim, pom].forEach(add)
    } else {
      const mat = std({ color: 0xF0C24A, roughness: 0.28, metalness: 0.85 })
      const band = new T.Mesh(new T.CylinderGeometry(a.headR * 0.8, a.headR * 0.8, a.headR * 0.4, 20, 1, true), mat)
      band.position.y = a.headY + a.headR * 1.0
      add(band)
      for (let i = 0; i < 6; i++) {
        const sp = new T.Mesh(new T.ConeGeometry(a.headR * 0.16, a.headR * 0.42, 8), mat)
        const ang = (i / 6) * Math.PI * 2
        sp.position.set(Math.sin(ang) * a.headR * 0.8, a.headY + a.headR * 1.38, Math.cos(ang) * a.headR * 0.8)
        add(sp)
      }
    }
  } else if (def.kind === 'scarf') {
    const mat = std({ color: def.color, roughness: 1 })
    const nr = Math.max(a.headR * 0.85, a.bodyR * 0.62)
    const rg = new T.Mesh(new T.TorusGeometry(nr, nr * 0.22, 12, 26), mat)
    rg.rotation.x = Math.PI / 2
    rg.position.y = neckY
    add(rg)
    for (const sx of [-0.55, 0.35]) {
      const tail = new T.Mesh(new T.BoxGeometry(nr * 0.5, nr * 1.5, nr * 0.2), mat)
      tail.position.set(sx * nr, neckY - nr * 0.75, nr * 0.72)
      tail.rotation.x = -0.25
      tail.rotation.z = sx * 0.18
      add(tail)
    }
  } else if (def.kind === 'arms') {
    const woodMat = std({ color: 0x6B4A32, roughness: 0.9 })
    const len = a.bodyR * 2.0
    const armGeo = new T.CylinderGeometry(a.bodyR * 0.055 * thick, a.bodyR * 0.075 * thick, len, 8)
    const TILT = 0.55
    for (const sx of [-1, 1]) {
      const dx = sx * Math.cos(TILT), dy = Math.sin(TILT)
      const shx = sx * a.bodyR * 0.8, shy = a.bodyY + a.bodyR * 0.3
      const arm = new T.Mesh(armGeo, woodMat)
      arm.position.set(shx + dx * len / 2, shy + dy * len / 2, 0)
      arm.rotation.z = -sx * (Math.PI / 2 - TILT)
      add(arm)
      const tipX = shx + dx * len, tipY = shy + dy * len
      for (const k of [-1, 1]) {
        const tw = new T.Mesh(new T.CylinderGeometry(a.bodyR * 0.03 * thick, a.bodyR * 0.04 * thick, a.bodyR * 0.5, 6), woodMat)
        tw.position.set(tipX + dx * a.bodyR * 0.16, tipY + a.bodyR * 0.2, k * a.bodyR * 0.16)
        tw.rotation.z = -sx * 0.9
        tw.rotation.x = k * 0.5
        add(tw)
      }
      if (def.variant === 'mitten') {
        const mit = new T.Mesh(new T.SphereGeometry(a.bodyR * 0.2, 14, 12), std({ color: 0xE04E63, roughness: 1 }))
        mit.position.set(tipX, tipY, 0)
        mit.scale.set(1, 1.25, 0.85)
        add(mit)
      }
    }
  } else {
    const mat = std({ color: def.color, roughness: 0.4, metalness: 0.2 })
    const geo = new T.SphereGeometry(a.bodyR * 0.11, 14, 12)
    for (let i = 0; i < 3; i++) {
      const b = new T.Mesh(geo, mat)
      const ang = 0.5 - i * 0.5
      b.position.set(0, a.bodyY + Math.sin(ang) * a.bodyR * 0.86, Math.cos(ang) * a.bodyR * 0.94)
      add(b)
    }
  }
  return D
}

/** La bouche : petits cailloux en arc, toujours là, c'est ce qui donne le sourire. */
function buildMouth(T: T3, a: Anatomy): Group {
  const D = new T.Group()
  const mGeo = new T.SphereGeometry(a.headR * 0.07, 10, 8)
  const mMat = new T.MeshStandardMaterial({ color: 0x2A2320, roughness: 0.5 })
  for (let i = -2; i <= 2; i++) {
    const p = new T.Mesh(mGeo, mMat)
    const ang = i * 0.30
    p.position.set(Math.sin(ang) * a.headR * 0.6, a.headY - a.headR * 0.34 - Math.cos(ang) * a.headR * 0.06, a.headR * 0.83)
    D.add(p)
  }
  return D
}

/** Rayons et hauteurs des trois boules empilées, mesurés sur la pile réelle. */
function anatomy(me: State): Anatomy {
  const [, m, h] = me.stack
  return { bodyR: m.r, headR: h.r, headY: h.mesh.position.y, bodyY: m.mesh.position.y, topY: h.topY }
}

/* ---------- Le plateau d'objets, accroché à la caméra ---------- */
function buildTray(me: State) {
  const { T } = me.stage
  const tray = me.tray
  const panel = new T.Mesh(new T.PlaneGeometry(1.86, 0.56), new T.MeshStandardMaterial({ color: 0x6E4D33, roughness: 0.9 }))
  panel.position.set(0, -0.88, -2.7)
  tray.add(panel)
  const rim = new T.Mesh(new T.PlaneGeometry(1.92, 0.62), new T.MeshStandardMaterial({ color: 0x4E3522, roughness: 0.9 }))
  rim.position.set(0, -0.88, -2.71)
  tray.add(rim)
  ITEMS.forEach((def, i) => {
    // Les bras sont larges et fins : plus épais en miniature, sinon deux traits de cheveu
    const g = buildItem(T, def, REF, def.kind === 'arms' ? 5 : 1)
    // Recentré et réduit : une miniature qui tient dans SHELF_SIZE
    const box = new T.Box3().setFromObject(g)
    const c = box.getCenter(new T.Vector3())
    const size = box.getSize(new T.Vector3())
    const k = (def.kind === 'arms' ? SHELF_SIZE * 1.7 : SHELF_SIZE) / Math.max(size.x, size.y, size.z)
    g.position.set(-c.x * k, -c.y * k, -c.z * k)
    g.scale.setScalar(k)
    g.traverse(o => { o.castShadow = false; o.userData.item = i })
    const wrap = new T.Group()
    wrap.add(g)
    const row = Math.floor(i / 8), col = i % 8
    wrap.position.set(-0.77 + col * 0.22, row === 0 ? -0.77 : -0.99, -2.6)
    wrap.userData.item = i
    tray.add(wrap)
    me.items.push({ def, shelf: wrap, real: null, placed: false })
  })
}

/** Où va un objet sur le bonhomme : posé = ajouté au groupe, sans rien déplacer. */
function placeItem(me: State, it: Item) {
  const { T } = me.stage
  // Une seule pièce par famille : l'ancienne retourne sur le plateau
  for (const o of me.items) if (o !== it && o.placed && o.def.kind === it.def.kind) unplaceItem(me, o)
  if (!it.real) it.real = buildItem(T, it.def, anatomy(me))
  it.real.position.set(0, 0, 0)
  it.real.rotation.set(0, 0, 0)
  it.real.scale.setScalar(1.3)
  it.real.userData.pop = 1
  me.man.add(it.real)
  it.placed = true
  it.shelf.visible = false
  sfx('confirm', { vol: 0.6, rate: 1.1 })
  const a = anatomy(me)
  const y = it.def.kind === 'hat' ? a.headY + a.headR : it.def.kind === 'arms' || it.def.kind === 'buttons' || it.def.kind === 'scarf' ? a.bodyY + a.bodyR * 0.6 : a.headY
  const w = me.man.localToWorld(new T.Vector3(0, y, a.headR))
  me.fx.burst(w, { count: 10, color: 0xFFFFFF, speed: 0.8, life: 0.5, size: 0.06, gravity: 3 })
}

function unplaceItem(me: State, it: Item) {
  if (it.real) { me.man.remove(it.real); me.stage.scene.remove(it.real) }
  it.placed = false
  it.shelf.visible = true
}

/* ---------- Rouler, monter, tomber ---------- */
function newBall(me: State) {
  const { T, scene } = me.stage
  me.r = R0
  const m = new T.Mesh(me.ballGeo, me.snowMat)
  m.castShadow = true; m.receiveShadow = true
  m.scale.setScalar(R0)
  // Toujours devant la caméra, bien visible : une petite ne doit rien chercher
  m.position.set(PILE.x + (Math.random() - 0.5) * 1.6, R0, PILE.z + 2.4)
  scene.add(m)
  me.ball = m
  me.phase = 'roll'
  me.orbit.look = [PILE.x, 0.7, PILE.z + 1.2]
  paintUI(me)
}

/** Le plus gros rayon autorisé pour la boule en cours. */
function capNow(me: State) {
  const top = me.stack[me.stack.length - 1]
  return top ? top.r * 0.78 : CAP0
}

/** La boule touche la pile : elle y monte en arc, puis tombe dessus avec la physique. */
function startLift(me: State) {
  const { T } = me.stage
  const mesh = me.ball!
  me.ball = null
  const r = me.r
  const top = me.stack[me.stack.length - 1]
  const topY = top ? top.topY : 0
  const tx = PILE.x + (Math.random() - 0.5) * r * 0.14
  const tz = PILE.z + (Math.random() - 0.5) * r * 0.14
  me.lift = { t: 0, from: mesh.position.clone(), to: new T.Vector3(tx, topY + r + 0.4, tz), mesh, r }
  me.phase = 'lift'
  me.arrow.visible = false
  sfx('whoosh', { vol: 0.5, rate: 0.9 })
  paintUI(me)
}

function startDrop(me: State) {
  const CANNON = me.CANNON
  const L = me.lift!
  me.lift = null
  const body = new CANNON.Body({
    mass: 1.2 + L.r, material: me.matSnow, shape: new CANNON.Sphere(L.r),
    position: new CANNON.Vec3(L.to.x, L.to.y, L.to.z)
  })
  body.linearDamping = 0.2
  body.angularDamping = 0.9
  me.world.addBody(body)
  me.stack.push({ mesh: L.mesh, body, r: L.r, tx: L.to.x, tz: L.to.z, topY: 0, settled: false, t: 0, landed: false, squash: 0 })
  me.phase = 'drop'
}

/** Fige une boule posée : une sphère sur une sphère finirait toujours par rouler. */
function settle(me: State, e: Ball) {
  const CANNON = me.CANNON
  e.settled = true
  const b = e.body!
  b.velocity.setZero()
  b.angularVelocity.setZero()
  // mass = 0 AVANT le passage en statique : sinon invMass reste fini et la boule
  // suivante « s'enfonce » dedans au lieu de rebondir (piège connu)
  b.mass = 0
  b.type = CANNON.Body.STATIC
  b.updateMassProperties()
  e.topY = b.position.y + e.r
  e.mesh.scale.setScalar(e.r)
  // La boule rejoint le groupe du bonhomme (il tourne d'un bloc à l'habillage)
  me.stage.scene.remove(e.mesh)
  e.mesh.position.sub(me.man.position)
  me.man.add(e.mesh)

  if (me.stack.length >= 3) {
    me.phase = 'deco'
    me.pileRing.visible = false
    me.arrow.visible = false
    me.orbit.look = [PILE.x, e.topY * 0.38, PILE.z]
    me.orbit.dist = Math.max(3.6, e.topY * 1.7 + 1.5)
    me.orbit.height = e.topY * 0.3
    me.orbit.target = 0
    me.man.add(buildMouth(me.stage.T, anatomy(me)))
    me.tray.visible = true
    $('snTools').style.display = ''
    ctx.toast('Ton bonhomme est né ! Habille-le')
  } else {
    newBall(me)
  }
  paintUI(me)
}

/* ---------- Interface ---------- */
function paintUI(me: State) {
  const rolling = me.phase !== 'deco'
  $('snRoll').style.display = rolling ? '' : 'none'
  if (rolling) {
    const pct = Math.min(1, (me.r - R0) / (MIN_POSE - R0))
    $('snGauge').style.width = (pct * 100).toFixed(0) + '%'
    $('snDots').innerHTML = [0, 1, 2].map(i => `<i class="sn-dot${i < me.stack.length ? ' on' : ''}"></i>`).join('')
  }
}

/* ---------- Fin ---------- */
function finish(me: State) {
  if (me.done) return
  me.done = true
  confetti()
  const names = ['génial', 'magnifique', 'trop beau', 'super rigolo']
  ctx.finish({
    title: 'Quel beau bonhomme !',
    msg: `${ctx.playerName} a roulé un bonhomme de neige ${pick(names)}`,
    stars: 3, starsEarned: 3
  })
}

export const snowman: GameDef = {
  id: 'snowman', name: 'Bonhomme de neige', icon: '⛄', sq: 'sq-sky', cat: 'creatif', duel: false, music: 'winter',
  subtitle: 'Roule tes boules dans la neige, empile-les, puis habille-le !',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="arena g3-arena sn-arena" id="snArena">
        <div class="g3-bar sn-overlay" id="snRoll">
          <div class="g3-gauge"><i id="snGauge"></i></div>
          <div class="sn-dots" id="snDots"></div>
        </div>
        <div class="sn-tools" id="snTools" style="display:none">
          <button class="sn-tool" id="snLeft" aria-label="Tourner">${ICON.turnLeft}</button>
          <button class="sn-tool" id="snRight" aria-label="Tourner">${ICON.turnRight}</button>
          <button class="sn-tool" id="snDice" aria-label="Surprise">${ICON.dice}</button>
          <button class="sn-tool go" id="snDone" aria-label="Fini">${ICON.check}</button>
        </div>
      </div>`
    const arena = $('snArena')
    const hideLoader = loader(arena, '⛄')
    preloadSfx(['whoosh', 'confirm', 'drop', 'pluck'])

    ;(async () => {
      const [, CANNON] = await loadPhysics()
      if (dead) return
      const stage: Stage = await createStage(arena, {
        sky: '#AEDCF5',
        fog: [12, 34], fogColor: '#D3EAF8',
        cam: [0, 2.9, 6.1], target: [0, 0.85, 0], fov: 46,
        hemi: ['#DDF0FF', '#9FBBD0', 1.15],
        sun: { pos: [5.5, 8, 5], color: '#FFF4E0', intensity: 2.5, area: 8, far: 26 },
        fill: 0.5, exposure: 1.08
      })
      if (dead) { stage.dispose(); return }
      const T = stage.T
      const scene = stage.scene

      /* Sol de neige + calque de sillon */
      const snowMap = stage.keep(snowTex(T, 9))
      const snowNrm = stage.keep(bumpyNormal(T, 10, 9))
      const groundMesh = new T.Mesh(
        new T.PlaneGeometry(60, 60),
        new T.MeshStandardMaterial({ map: snowMap, normalMap: snowNrm, roughness: 0.86, metalness: 0 })
      )
      groundMesh.rotation.x = -Math.PI / 2
      groundMesh.receiveShadow = true
      scene.add(groundMesh)

      const trail = makeTrail(T)
      stage.keep(trail.tex)
      const trailMesh = new T.Mesh(
        new T.PlaneGeometry(FIELD * 2, FIELD * 2),
        new T.MeshStandardMaterial({
          map: trail.tex, transparent: true, roughness: 0.55, metalness: 0.05,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
        })
      )
      trailMesh.rotation.x = -Math.PI / 2
      trailMesh.position.y = 0.002
      trailMesh.receiveShadow = true
      scene.add(trailMesh)

      /* Vrais sapins enneigés du kit holiday, en couronne autour du terrain */
      decor(stage, ring(22, FIELD + 1.4, FIELD + 6.4).map(([x, z], i) => ({
        model: `holiday/tree-snow-${['a', 'b', 'c'][i % 3]}`, x, z, size: 1.6 + Math.random() * 1.5
      }))).catch(() => { /* sans sapins, le jeu tourne */ })
      const fall = addSnowfall(T, scene)

      /* La pile : un cercle de neige tassée, et une flèche qui dit « ici » quand la boule est prête */
      const pileRing = new T.Mesh(new T.TorusGeometry(0.5, 0.035, 8, 40), new T.MeshStandardMaterial({ color: 0x8FC3E8, roughness: 0.8 }))
      pileRing.rotation.x = -Math.PI / 2
      pileRing.position.set(PILE.x, 0.02, PILE.z)
      scene.add(pileRing)
      const arrow = new T.Group()
      const arrowMat = new T.MeshStandardMaterial({ color: 0xFFB84D, roughness: 0.5 })
      const cone = new T.Mesh(new T.ConeGeometry(0.16, 0.3, 12), arrowMat)
      cone.rotation.x = Math.PI
      const shaft = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.3, 10), arrowMat)
      shaft.position.y = 0.3
      arrow.add(cone, shaft)
      arrow.visible = false
      scene.add(arrow)

      /* Monde physique : ne sert qu'à la chute et à l'écrasement des boules */
      const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0) })
      world.broadphase = new CANNON.SAPBroadphase(world)
      ;(world.solver as unknown as { iterations: number }).iterations = 14
      const matSnow = new CANNON.Material('snow')
      world.addContactMaterial(new CANNON.ContactMaterial(matSnow, matSnow, { friction: 0.9, restitution: 0.02 }))
      world.addBody(new CANNON.Body({
        type: CANNON.Body.STATIC, material: matSnow, shape: new CANNON.Plane(),
        quaternion: new CANNON.Quaternion().setFromEuler(-Math.PI / 2, 0, 0)
      }))

      const snowMat = new T.MeshStandardMaterial({
        color: 0xFAFDFF, map: snowMap, normalMap: snowNrm, roughness: 0.78, metalness: 0.02
      })
      const ballGeo = new T.SphereGeometry(1, 30, 22)
      const man = new T.Group()
      man.position.set(PILE.x, 0, PILE.z)
      scene.add(man)
      // Le plateau vit dans le repère de la caméra : il reste en bas de l'écran quoi qu'on regarde
      scene.add(stage.camera)
      const tray = new T.Group()
      tray.visible = false
      stage.camera.add(tray)

      hideLoader()
      const hint = document.createElement('div')
      hint.className = 'tap-hint'
      hint.innerHTML = ICON.tap
      arena.appendChild(hint)

      const me: State = {
        stage, CANNON, world, matSnow, snowMat, ballGeo, trail, fall, fx: particles(stage, 300),
        phase: 'roll', stack: [], r: R0, ball: null, rolled: 0, lift: null, man, items: [], tray, drag: null,
        pileRing, arrow, orbit: orbitCam(stage, 5.6, 2.1, [PILE.x, 0.7, PILE.z + 1.2]), step: fixedStep(), done: false, hint
      }
      S = me
      buildTray(me)
      newBall(me)

      /* --- Rouler la boule : glisser le doigt --- */
      const pickAt = picker(stage)
      let dragging = false
      let lastPt: { x: number; y: number } | null = null
      const fwd = new T.Vector3(), right = new T.Vector3(), move = new T.Vector3()
      const hitPt = new T.Vector3()
      const ray = new T.Raycaster()
      const ndc = new T.Vector2()
      const pointerRay = (e: PointerEvent) => {
        const r = stage.renderer.domElement.getBoundingClientRect()
        ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1
        ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1
        ray.setFromCamera(ndc, stage.camera)
        return ray.ray
      }

      const onDown = (e: PointerEvent) => {
        if (S !== me) return
        hint.classList.add('off')
        if (me.phase === 'roll' && me.ball) {
          dragging = true
          lastPt = { x: e.clientX, y: e.clientY }
          return
        }
        if (me.phase !== 'deco' || me.drag) return
        // Attraper un objet : sur le plateau, ou déjà posé sur le bonhomme
        const targets: Obj[] = [tray, ...me.items.filter(i => i.placed && i.real).map(i => i.real!)]
        const hit = pickAt(e, targets, true).find(h => h.object.userData.item !== undefined || h.object.parent?.userData.item !== undefined)
        let idx: number | undefined
        if (hit) {
          let o: Obj | null = hit.object
          while (o && o.userData.item === undefined) o = o.parent
          idx = o?.userData.item
        }
        if (idx === undefined) return
        const it = me.items[idx]
        if (!it.real) { it.real = buildItem(T, it.def, anatomy(me)); it.real.traverse(o => { o.userData.item = idx }) }
        if (it.placed) unplaceItem(me, it)
        it.shelf.visible = false
        it.real.scale.setScalar(1)
        it.real.rotation.copy(man.rotation)
        scene.add(it.real)
        // L'objet suit le doigt sur un plan face caméra passant par le bonhomme
        const a = anatomy(me)
        const n = stage.camera.getWorldDirection(new T.Vector3()).negate()
        const plane = new T.Plane().setFromNormalAndCoplanarPoint(n, man.position.clone().add(new T.Vector3(0, a.topY * 0.5, 0)))
        const box = new T.Box3().setFromObject(it.real)
        const off = box.getCenter(new T.Vector3()).sub(it.real.position)
        me.drag = { item: it, off, plane }
        sfx('pluck', { vol: 0.5, rate: 1.2 })
        moveDrag(e)
      }
      const moveDrag = (e: PointerEvent) => {
        const d = me.drag
        if (!d || !d.item.real) return
        if (pointerRay(e).intersectPlane(d.plane, hitPt)) d.item.real.position.copy(hitPt).sub(d.off)
      }
      const onMove = (e: PointerEvent) => {
        if (S !== me) return
        if (me.drag) { moveDrag(e); return }
        if (!dragging || !lastPt || !me.ball || me.phase !== 'roll') return
        const dx = e.clientX - lastPt.x, dy = e.clientY - lastPt.y
        lastPt = { x: e.clientX, y: e.clientY }
        // Le doigt pousse dans le repère de la caméra : « vers le haut » = « vers le fond »
        stage.camera.getWorldDirection(fwd)
        fwd.y = 0; fwd.normalize()
        right.set(-fwd.z, 0, fwd.x)
        move.copy(right).multiplyScalar(dx * 0.011).add(fwd.clone().multiplyScalar(-dy * 0.011))
        const dist = move.length()
        if (dist < 0.0004) return

        const b = me.ball
        b.position.add(move)
        const lim = FIELD - me.r
        b.position.x = Math.max(-lim, Math.min(lim, b.position.x))
        b.position.z = Math.max(-lim, Math.min(lim, b.position.z))
        const cap = capNow(me)
        if (me.r < cap) me.r = Math.min(cap, me.r + dist * GROW)
        b.scale.setScalar(me.r)
        b.position.y = me.r
        // Rotation de roulement autour de l'axe perpendiculaire au déplacement
        const axis = new T.Vector3(move.z, 0, -move.x).normalize()
        b.rotateOnWorldAxis(axis, dist / me.r)
        digAt(me, b.position.x, b.position.z, me.r * 1.15)
        me.rolled += dist
        if (me.rolled > 0.55) { me.rolled = 0; sCrunch() }
        paintUI(me)

        // Assez grosse et contre la pile : elle y monte toute seule
        const top = me.stack[me.stack.length - 1]
        const reach = me.r + (top ? top.r * 0.7 : 0.3)
        if (me.r >= MIN_POSE && Math.hypot(b.position.x - PILE.x, b.position.z - PILE.z) < reach) {
          dragging = false; lastPt = null
          startLift(me)
        }
      }
      const onUp = () => {
        if (S !== me) return
        dragging = false; lastPt = null
        const d = me.drag
        if (!d) return
        me.drag = null
        const it = d.item
        if (!it.real) return
        // Lâché sur le bonhomme ? Chaque objet connaît sa place, on y va tout seul
        const a = anatomy(me)
        const c = new T.Box3().setFromObject(it.real).getCenter(new T.Vector3())
        const local = man.worldToLocal(c.clone())
        const onMan = Math.hypot(local.x, local.z) < a.bodyR * 1.9 && local.y > -0.2 && local.y < a.topY + a.headR * 2.2
        scene.remove(it.real)
        if (onMan) placeItem(me, it)
        else { it.shelf.visible = true; sfx('drop', { vol: 0.4 }) }
      }

      stage.renderer.domElement.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)

      /* --- Boutons d'habillage --- */
      $('snLeft').onclick = () => { me.orbit.turn(-0.6); sfx('click', { vol: 0.4 }) }
      $('snRight').onclick = () => { me.orbit.turn(0.6); sfx('click', { vol: 0.4 }) }
      $('snDone').onclick = () => finish(me)
      $('snDice').onclick = () => {
        if (me.phase !== 'deco') return
        for (const it of me.items) if (it.placed) unplaceItem(me, it)
        for (const kind of ['hat', 'eyes', 'nose', 'scarf', 'arms', 'buttons'] as Kind[]) {
          if (kind !== 'eyes' && kind !== 'nose' && Math.random() < 0.25) continue
          placeItem(me, pick(me.items.filter(i => i.def.kind === kind)))
        }
      }

      // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __sn: unknown }).__sn = {
          get phase() { return me.phase }, get r() { return me.r }, minPose: MIN_POSE, get stack() { return me.stack.length },
          get done() { return me.done },
          ball: () => me.ball ? toScreen(stage, me.ball.position) : null,
          pile: () => toScreen(stage, { x: PILE.x, y: me.r, z: PILE.z }),
          head: () => { const a = anatomy(me); return toScreen(stage, man.localToWorld(new T.Vector3(0, a.headY, a.headR))) },
          items: () => me.items.map(it => ({ kind: it.def.kind, variant: it.def.variant, placed: it.placed, screen: toScreen(stage, it.shelf.getWorldPosition(new T.Vector3())) }))
        }
      }

      /* --- Boucle --- */
      stage.start((dt, now) => {
        if (S !== me) return
        // Pendant le roulage la caméra suit la boule : elle ne sort jamais du cadre
        if (me.phase === 'roll' && me.ball) {
          me.orbit.look = [PILE.x + (me.ball.position.x - PILE.x) * 0.7, 0.7, PILE.z + (me.ball.position.z - PILE.z) * 0.7]
        }
        me.orbit.update(dt)

        // La pile : anneau qui respire et flèche qui dit « amène-la ici » quand la boule est prête
        const ready = me.phase === 'roll' && me.r >= MIN_POSE
        me.arrow.visible = ready
        if (ready) {
          const top = me.stack[me.stack.length - 1]
          me.arrow.position.set(PILE.x, (top ? top.topY : 0) + 0.55 + Math.sin(now / 220) * 0.08, PILE.z)
          me.pileRing.scale.setScalar(1 + Math.sin(now / 260) * 0.08)
        } else me.pileRing.scale.setScalar(1)

        // Neige qui tombe : recyclage des flocons arrivés au sol
        const p = fall.pos
        for (let i = 0; i < fall.N; i++) {
          p[i * 3 + 1] -= dt * (0.5 + (i % 7) * 0.09)
          p[i * 3] += Math.sin((now / 1400) + i) * dt * 0.12
          if (p[i * 3 + 1] < 0) { p[i * 3 + 1] = 11 + Math.random() * 2 }
        }
        fall.pts.geometry.attributes.position.needsUpdate = true

        // La montée en arc vers la pile
        if (me.lift) {
          const L = me.lift
          L.t = Math.min(1, L.t + dt / 0.65)
          const k = L.t < 0.5 ? 2 * L.t * L.t : 1 - Math.pow(-2 * L.t + 2, 2) / 2
          L.mesh.position.lerpVectors(L.from, L.to, k)
          L.mesh.position.y += Math.sin(L.t * Math.PI) * 0.5
          L.mesh.rotation.x -= dt * 4
          if (L.t >= 1) startDrop(me)
        }

        me.step(dt, () => {
          world.step(1 / 60)
          for (const e of me.stack) {
            if (e.settled || !e.body) continue
            // Rail vertical : la chute est simulée, la dérive latérale ne l'est pas
            e.body.position.x = e.tx
            e.body.position.z = e.tz
            e.body.velocity.x = 0
            e.body.velocity.z = 0
            e.t += 1 / 60
          }
        })
        for (const e of me.stack) {
          if (e.settled || !e.body) continue
          e.mesh.position.set(e.body.position.x, e.body.position.y, e.body.position.z)
          e.mesh.quaternion.set(e.body.quaternion.x, e.body.quaternion.y, e.body.quaternion.z, e.body.quaternion.w)
          const idx = me.stack.indexOf(e)
          const rest = (idx ? me.stack[idx - 1].topY : 0) + e.r
          if (!e.landed && e.body.position.y <= rest + 0.02) {
            e.landed = true
            e.squash = 1
            impact(0.55, { matter: 'neige', noShake: true })
            me.fx.burst({ x: e.tx, y: e.body.position.y - e.r, z: e.tz }, { count: 24, color: 0xFFFFFF, speed: 1.8, life: 0.7, size: 0.07, gravity: 5 })
          }
          if (e.squash > 0) {
            e.squash = Math.max(0, e.squash - dt * 3.4)
            const k = Math.sin(e.squash * Math.PI * 2.2) * e.squash * 0.22
            e.mesh.scale.set(e.r * (1 + k), e.r * (1 - k), e.r * (1 + k))
          } else e.mesh.scale.setScalar(e.r)
          if (e.t > 0.3 && e.body.velocity.length() < 0.14) settle(me, e)
          else if (e.t > 4) settle(me, e) // filet de sécurité : on ne bloque jamais le jeu
        }
        // Les objets fraîchement posés rebondissent un peu
        for (const it of me.items) {
          const r = it.real
          if (!r || !it.placed || !r.userData.pop) continue
          r.userData.pop = Math.max(0, r.userData.pop - dt * 4)
          r.scale.setScalar(1 + r.userData.pop * 0.3)
        }
        me.fx.update(dt)
      })

      stage.keep({ dispose() {
        stage.renderer.domElement.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        me.fx.dispose()
      } })
    })().catch(err => { if (!dead) throw err })

    return () => {
      dead = true
      if (S) { S.stage.dispose(); S = null }
    }
  }
}
