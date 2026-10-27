import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { arcade, type Arcade } from '../core/arcade'
import { ICON } from '../core/icons'
import { sfx, preloadSfx } from '../core/sfx'
import { tone } from '../core/audio'
import { setMusicIntensity } from '../core/music'
import { confetti } from '../core/fx'
import { createStage, loader, woodTex, dotTex, type Stage, type T3 } from '../core/three3d'
import { particles, camShake, toScreen, type Particles, type CamShake } from '../core/scene3d'
import { Bille, makeBoard, autoPilot, BALL_R, HOLE_R, WALL_T, type Board, type BilleEvent } from '../core/bille'

/* 🎱 LE LABYRINTHE À BILLE (27/10, choisi par le père) — le jouet en bois.

   Un plateau de labyrinthe vu de dessus, en légère perspective : des murets
   en bois, des trous cerclés de métal, une bille d'acier qui reflète la
   pièce. On INCLINE la tablette (`DeviceOrientationEvent` ; la position
   tenue quand le plateau arrive sert de zéro) ; sans gyroscope, ou quand un
   doigt est posé, le plateau penche VERS LE DOIGT (depuis la bille).
   - La physique est à nous (`core/bille.ts`, à pas fixe, pure et testée
     comme celle du Flipper) ; les plateaux viennent du générateur du
     Labyrinthe (`core/labyrinth.ts`). Les trous ne sont JAMAIS sur le seul
     chemin : ils guettent les virages manqués.
   - Des drapeaux jalonnent le chemin : une bille tombée revient au dernier
     drapeau atteint. Trois billes pour la partie.
   - Le « presque » : la bille qui frôle un trou vacille sur son rebord ; si
     elle passe, un petit souffle et un point de plus.
   - La rampe suit la joueuse : un plateau fini sans tomber, et le suivant
     est plus grand, avec plus de trous. Trois plateaux par partie.
   - L'outro : la dernière bille tombe dans le trou d'arrivée doré, au
     ralenti, dans une gerbe d'étincelles. */

type Mesh = import('three').Mesh
type Group = import('three').Group

const BOARDS = 3
const OUTRO_MS = 2800
/** L'inclinaison qu'on voit (radians, à pleine inclinaison) et celle du téléphone qui la donne (degrés). */
const SHOW_TILT = 0.075
const PHONE_DEG = 16

interface State {
  stage: Stage
  T: T3
  U: typeof import('three/examples/jsm/utils/BufferGeometryUtils.js')
  game: Arcade
  tier: 0 | 1 | 2
  board: Board
  ball: Bille
  /** Le plateau en 3D (tout ce qui penche) et ce qui change d'un plateau à l'autre. */
  tray: Group
  built: Group | null
  flagMeshes: { cloth: Mesh; pole: Mesh; i: number }[]
  ballMesh: Mesh
  goalGlow: import('three').Sprite | null
  mats: Record<string, import('three').Material>
  fx: Particles
  shake: CamShake
  /** Le plateau en cours (0..2), le niveau de la rampe, les chutes de ce plateau. */
  n: number
  level: number
  falls: number
  state: 'play' | 'fall' | 'goal' | 'next' | 'over'
  /** L'inclinaison qu'on voit (lissée) et celle qu'on demande. */
  tilt: [number, number]
  finger: { id: number; x: number; y: number } | null
  gyro: { on: boolean; zero: [number, number] | null; raw: [number, number] }
  anim: number
  rimT: number
  t: number
  auto: boolean
}

let bi: State | null = null
let ctx: GameContext

/** Les dimensions d'un plateau : le niveau choisi et la rampe. */
function dims(tier: 0 | 1 | 2, level: number): { w: number; h: number; holes: number } {
  const base: [number, number][] = [[5, 4], [6, 4], [6, 5], [7, 5], [8, 5]]
  const [w, h] = base[Math.min(4, level)]
  return { w: w + tier, h: h + (tier ? 1 : 0), holes: 0.3 + level * 0.06 + tier * 0.07 }
}

/* ---------- Les matières : bois clair du plateau, murets plus foncés, métal, or ---------- */
function materials(stage: Stage) {
  const T = stage.T
  const floor = stage.keep(woodTex(T, '#C99A5F'))
  floor.wrapS = floor.wrapT = T.RepeatWrapping
  floor.repeat.set(0.22, 0.22)
  const wall = stage.keep(woodTex(T, '#8E5E32'))
  const frame = stage.keep(woodTex(T, '#7A4A26'))
  const table = stage.keep(woodTex(T, '#5A3A22'))
  table.wrapS = table.wrapT = T.RepeatWrapping
  table.repeat.set(4, 4)
  const S = (o: import('three').MeshStandardMaterialParameters) => new T.MeshStandardMaterial(o)
  return {
    floor: S({ map: floor, roughness: 0.62, color: 0xC8B49A }),
    wall: S({ map: wall, roughness: 0.55, color: 0xB89A80 }),
    frame: S({ map: frame, roughness: 0.5, color: 0xA88A70 }),
    table: S({ map: table, roughness: 0.75, color: 0x9A8A7A }),
    under: S({ color: 0x0E0906, roughness: 1, side: T.BackSide }),
    pit: S({ color: 0x050302, roughness: 1 }),
    rim: S({ color: 0x8C949C, metalness: 1, roughness: 0.28 }),
    gold: S({ color: 0xC9921E, metalness: 1, roughness: 0.22, emissive: 0x4A2A00, emissiveIntensity: 0.4 }),
    goldPit: S({ color: 0x3A2400, emissive: 0xFFB020, emissiveIntensity: 0.9, roughness: 0.5 }),
    steel: S({ color: 0xE6EBF0, metalness: 1, roughness: 0.07 }),
    pole: S({ color: 0x5A4632, roughness: 0.6 }),
    cloth: S({ color: 0xB0302A, roughness: 0.7, side: T.DoubleSide }),
    clothOn: S({ color: 0xE0A21A, roughness: 0.5, side: T.DoubleSide, emissive: 0x6A4000, emissiveIntensity: 0.4 }),
    start: S({ color: 0x5E9E46, roughness: 0.7, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 })
  }
}

/* ---------- Un plateau en 3D ---------- */
function buildBoard(me: State) {
  const { T, U } = me
  const M = me.mats as ReturnType<typeof materials>
  const b = me.board
  if (me.built) { me.tray.remove(me.built); disposeGroup(me.built) }
  const g = new T.Group()
  const ox = -b.w / 2, oz = -b.h / 2
  // Le fond : une planche percée de ses trous (vue de dessus, y = 0 en haut)
  const shape = new T.Shape()
  shape.moveTo(0, 0); shape.lineTo(b.w, 0); shape.lineTo(b.w, b.h); shape.lineTo(0, b.h); shape.closePath()
  for (const h of b.holes) {
    const p = new T.Path()
    p.absarc(h.x, h.y, HOLE_R, 0, Math.PI * 2, true)
    shape.holes.push(p)
  }
  const slab = new T.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false, curveSegments: 20 })
  // Le dessin est dans le plan (x, y) : on le couche, son dessus à y = 0
  slab.rotateX(Math.PI / 2)
  slab.translate(ox, 0, oz)
  const floor = new T.Mesh(slab, M.floor)
  floor.receiveShadow = true
  g.add(floor)
  // Sous chaque trou, un puits noir ; un cerclage de métal (or à l'arrivée)
  const tube = new T.CylinderGeometry(HOLE_R, HOLE_R * 0.9, 0.7, 24, 1, true)
  const torus = new T.TorusGeometry(HOLE_R + 0.025, 0.04, 8, 28)
  torus.rotateX(Math.PI / 2)
  const rims: { p: number[] }[] = []
  for (const h of b.holes) {
    const pit = new T.Mesh(tube, h.goal ? M.goldPit : M.under)
    pit.position.set(ox + h.x, -0.35, oz + h.y)
    g.add(pit)
    const bottom = new T.Mesh(new T.CircleGeometry(HOLE_R * 0.92, 20), h.goal ? M.goldPit : M.pit)
    bottom.rotation.x = -Math.PI / 2
    bottom.position.set(ox + h.x, -0.68, oz + h.y)
    g.add(bottom)
    if (h.goal) {
      const gr = new T.Mesh(torus, M.gold)
      gr.position.set(ox + h.x, 0.012, oz + h.y)
      gr.scale.setScalar(1.12)
      gr.castShadow = true
      g.add(gr)
    } else rims.push({ p: [ox + h.x, 0.012, oz + h.y] })
  }
  if (rims.length) {
    const im = new T.InstancedMesh(torus, M.rim, rims.length)
    const m4 = new T.Matrix4()
    rims.forEach((r, i) => { m4.makeTranslation(r.p[0], r.p[1], r.p[2]); im.setMatrixAt(i, m4) })
    im.castShadow = true; im.receiveShadow = true
    im.computeBoundingSphere()
    g.add(im)
  }
  // La lueur de l'arrivée
  const goal = b.holes.find(h => h.goal)!
  const glow = new T.Sprite(new T.SpriteMaterial({ map: me.stage.keep(dotTex(T, '#FFD870')), color: 0xFFC040, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.7 }))
  glow.position.set(ox + goal.x, 0.15, oz + goal.y)
  glow.scale.setScalar(1.5)
  g.add(glow)
  me.goalGlow = glow
  // Les murets : une seule géométrie, chaque muret à sa vraie taille (le fil du bois suit sa longueur)
  const H = 0.42
  const boxes = b.rects.map(r => {
    const w = r.x1 - r.x0, d = r.y1 - r.y0
    const bx = new T.BoxGeometry(w, H, d)
    if (d > w) bx.rotateY(0) // le bois des murets en long dans les deux sens
    bx.translate(ox + (r.x0 + r.x1) / 2, H / 2, oz + (r.y0 + r.y1) / 2)
    return bx
  })
  const walls = new T.Mesh(U.mergeGeometries(boxes)!, M.wall)
  boxes.forEach(x => x.dispose())
  walls.castShadow = true; walls.receiveShadow = true
  g.add(walls)
  // Le cadre du jouet, plus haut que les murets, et le dessous du plateau
  const F = 0.42, FH = 0.62
  const fr = [
    [0, -b.h / 2 - F / 2 - WALL_T / 2, b.w + 2 * F + WALL_T, F],
    [0, b.h / 2 + F / 2 + WALL_T / 2, b.w + 2 * F + WALL_T, F],
    [-b.w / 2 - F / 2 - WALL_T / 2, 0, F, b.h + WALL_T],
    [b.w / 2 + F / 2 + WALL_T / 2, 0, F, b.h + WALL_T]
  ].map(([x, z, w, d]) => { const bx = new T.BoxGeometry(w, FH, d); bx.translate(x, FH / 2 - 0.2, z); return bx })
  const frame = new T.Mesh(U.mergeGeometries(fr)!, M.frame)
  fr.forEach(x => x.dispose())
  frame.castShadow = true; frame.receiveShadow = true
  g.add(frame)
  const base = new T.Mesh(new T.BoxGeometry(b.w + 2 * F + WALL_T, 0.1, b.h + 2 * F + WALL_T), M.frame)
  base.position.y = -0.75
  base.receiveShadow = true
  g.add(base)
  // Le départ : un rond vert peint
  const st = new T.Mesh(new T.CircleGeometry(0.3, 24), M.start)
  st.rotation.x = -Math.PI / 2
  st.position.set(ox + b.path[0][0] + 0.5, 0.004, oz + b.path[0][1] + 0.5)
  g.add(st)
  // Les drapeaux, plantés au coin de leur case
  me.flagMeshes = []
  const poleG = new T.CylinderGeometry(0.025, 0.025, 0.75, 6)
  poleG.translate(0, 0.375, 0)
  const tri = new T.Shape()
  tri.moveTo(0, 0); tri.lineTo(0.34, -0.11); tri.lineTo(0, -0.22); tri.closePath()
  const clothG = new T.ShapeGeometry(tri)
  for (const i of b.flags) {
    const [cx, cy] = b.path[i]
    const x = ox + cx + 1 - WALL_T / 2, z = oz + cy + WALL_T / 2
    const pole = new T.Mesh(poleG, M.pole)
    pole.position.set(x, 0.3, z)
    pole.castShadow = true
    const cloth = new T.Mesh(clothG, M.cloth)
    cloth.position.set(x, 1.04, z)
    cloth.rotation.y = Math.PI * 0.75
    cloth.castShadow = true
    g.add(pole, cloth)
    me.flagMeshes.push({ cloth, pole, i })
  }
  me.tray.add(g)
  me.built = g
  frame3(me)
}

function disposeGroup(g: Group) {
  g.traverse(o => {
    const m = o as Mesh
    if (m.geometry) m.geometry.dispose()
    const sm = (o as import('three').Sprite).material as import('three').SpriteMaterial | undefined
    if ((o as import('three').Sprite).isSprite && sm) sm.dispose()
  })
}

/** La caméra cadre le plateau entier, d'au-dessus, un peu de face. */
function frame3(me: State) {
  const cam = me.stage.camera
  const b = me.board
  const el = 62 * Math.PI / 180
  const vf = cam.fov * Math.PI / 180 / 2
  const hf = Math.atan(Math.tan(vf) * cam.aspect)
  const halfW = b.w / 2 + 0.75, halfH = b.h / 2 + 0.75
  const d = Math.max(halfW / Math.tan(hf), halfH * Math.sin(el) / Math.tan(vf) + halfH * Math.cos(el)) * 1.06
  cam.position.set(0, Math.sin(el) * d, Math.cos(el) * d)
  cam.lookAt(0, 0, 0.15)
  if (me.stage.sun) {
    const s = me.stage.sun.shadow.camera
    const r = Math.max(b.w, b.h) / 2 + 1.5
    s.left = -r; s.right = r; s.top = r; s.bottom = -r
    s.updateProjectionMatrix()
  }
}

function newBoard(me: State) {
  const { w, h, holes } = dims(me.tier, me.level)
  me.board = makeBoard({ w, h, holes, flagEvery: Math.max(3, Math.round(w * h / 7)) })
  me.ball = new Bille(me.board)
  me.falls = 0
  buildBoard(me)
  placeBall(me, 0)
  me.ballMesh.visible = true
  me.state = 'play'
  me.anim = 0.6 // la bille tombe sur le départ
  me.gyro.zero = null // la position tenue maintenant sert de zéro
  if (me.auto) me.ball.pilot = autoPilot()
  paintPips(me)
}

function paintPips(me: State) {
  document.querySelectorAll<HTMLElement>('#biPips i').forEach((p, i) => { p.className = i < me.n ? 'won' : i === me.n ? 'now' : '' })
}

/** La bille à sa place sur le plateau (et `lift` au-dessus, quand elle tombe dessus). */
function placeBall(me: State, lift: number) {
  const b = me.board
  me.ballMesh.position.set(me.ball.x - b.w / 2, BALL_R + lift, me.ball.y - b.h / 2)
}

function onEvents(me: State, ev: BilleEvent[]) {
  for (const e of ev) {
    if (e.t === 'wall') {
      sfx('click', { vol: Math.min(0.7, 0.15 + e.f * 0.12), rate: 0.7 })
      tone(140 + Math.random() * 30, 0.06, 'triangle', Math.min(0.12, e.f * 0.03))
    } else if (e.t === 'rim') {
      me.rimT = 0.5
      sfx('tick', { vol: 0.35, rate: 1.4 })
    } else if (e.t === 'escape') {
      // Le « presque » : elle a frôlé le trou et elle est passée
      me.game.hit(1, { silent: true })
      sfx('whoosh', { rate: 1.3, vol: 0.35 })
      const p = me.ballMesh.position
      me.fx.burst(me.tray.localToWorld(p.clone()), { count: 8, color: ['#FFFFFF', '#CFE6FF'], speed: 1.2, life: 0.5, size: 0.08, gravity: 2 })
    } else if (e.t === 'flag') {
      const f = me.flagMeshes.find(x => x.i === e.i)
      if (f) { f.cloth.material = me.mats.clothOn; f.cloth.scale.setScalar(1.25) }
      me.game.hit(2)
      sfx('pluck', { vol: 0.6, rate: 1.2 })
    } else if (e.t === 'fall') {
      me.state = 'fall'
      me.anim = 0
      me.falls++
      sfx('drop', { vol: 0.7, rate: 0.75 })
      tone(90, 0.3, 'sine', 0.2, 0.25)
    } else if (e.t === 'goal') {
      me.state = 'goal'
      me.anim = 0
      sfx('metal', { vol: 0.7 })
      sfx('confirm', { vol: 0.8, delay: 0.3 })
      me.game.hit(10, { perfect: me.falls === 0 })
      if (me.n === BOARDS - 1) me.stage.timeScale = 0.35
    }
  }
}

function afterFall(me: State) {
  const dead = me.game.hurt()
  if (dead) {
    me.state = 'over'
    me.game.end({ title: 'Plus de billes !', msg: me.n ? `${me.n} plateau${me.n > 1 ? 'x' : ''} fini${me.n > 1 ? 's' : ''}` : 'Les trous ont tout avalé', outroMs: 1200 })
    return
  }
  me.ball.respawn()
  me.state = 'play'
  me.anim = 0.6
  me.ballMesh.visible = true
}

function afterGoal(me: State) {
  me.n++
  // La rampe : un plateau sans chute, et le suivant grandit
  if (me.falls === 0) me.level = Math.min(4, me.level + 1)
  paintPips(me)
  if (me.n >= BOARDS) {
    me.state = 'over'
    confetti()
    const lives = me.game.s.lives
    me.game.end({
      title: lives === me.game.s.maxLives ? 'Sans une chute !' : 'Arrivée !',
      msg: 'Trois plateaux, la bille au trou doré',
      outroMs: OUTRO_MS
    })
    return
  }
  me.state = 'next'
  ctx.after(900, () => { if (bi === me) newBoard(me) })
}

/* ---------- L'inclinaison : le doigt, sinon le gyroscope ---------- */
function wanted(me: State): [number, number] {
  if (me.finger) {
    const p = toScreen(me.stage, me.tray.localToWorld(me.ballMesh.position.clone()))
    const r = me.stage.renderer.domElement.getBoundingClientRect()
    const k = Math.min(r.width, r.height) * 0.26
    let dx = (me.finger.x - p.x) / k, dy = (me.finger.y - p.y) / k
    const l = Math.hypot(dx, dy)
    if (l > 1) { dx /= l; dy /= l }
    return [dx, dy]
  }
  if (me.gyro.on && me.gyro.zero) {
    const [db, dg] = [me.gyro.raw[0] - me.gyro.zero[0], me.gyro.raw[1] - me.gyro.zero[1]]
    const ang = ((screen.orientation?.angle ?? 0) + 360) % 360
    const [x, y] = ang === 90 ? [db, -dg] : ang === 180 ? [-dg, -db] : ang === 270 ? [-db, dg] : [dg, db]
    const c = (v: number) => Math.max(-1, Math.min(1, v / PHONE_DEG))
    return [c(x), c(y)]
  }
  return [0, 0]
}

function step(me: State, dt: number) {
  me.t += dt
  me.game.tick(dt)
  const want = me.state === 'play' && !me.ball.pilot ? wanted(me) : me.state === 'play' ? [me.ball.tx, me.ball.ty] as [number, number] : [0, 0] as [number, number]
  // Le plateau suit la main sans à-coup
  const k = Math.min(1, dt * 12)
  me.tilt[0] += (want[0] - me.tilt[0]) * k
  me.tilt[1] += (want[1] - me.tilt[1]) * k
  me.tray.rotation.z = -me.tilt[0] * SHOW_TILT
  me.tray.rotation.x = me.tilt[1] * SHOW_TILT
  const ball = me.ball
  if (me.state === 'play') {
    if (!ball.pilot) { ball.tx = me.tilt[0]; ball.ty = me.tilt[1] }
    const ox = ball.x, oy = ball.y
    if (me.anim > 0) {
      // La bille arrive d'en haut et rebondit sur le plateau
      me.anim = Math.max(0, me.anim - dt)
      const u = 1 - me.anim / 0.6
      placeBall(me, Math.abs(Math.cos(u * Math.PI * 1.5)) * (1 - u) * 1.4)
      if (me.anim === 0) sfx('metal', { vol: 0.45, rate: 1.3 })
    } else {
      onEvents(me, ball.update(dt))
      placeBall(me, 0)
      // Elle roule vraiment : elle tourne sur elle-même selon le chemin parcouru
      const dx = ball.x - ox, dy = ball.y - oy, d = Math.hypot(dx, dy)
      if (d > 1e-5) me.ballMesh.rotateOnWorldAxis(new me.T.Vector3(dy / d, 0, -dx / d), d / BALL_R)
      // Au bord d'un trou, elle vacille
      if (ball.rim >= 0) me.ballMesh.position.y += Math.sin(me.t * 38) * 0.02
    }
  } else if (me.state === 'fall' || me.state === 'goal') {
    // Elle glisse au centre du trou et s'y enfonce
    me.anim += dt
    const h = me.state === 'goal' ? me.board.holes.find(x => x.goal)! : me.board.holes.reduce((a, x) => Math.hypot(x.x - ball.x, x.y - ball.y) < Math.hypot(a.x - ball.x, a.y - ball.y) ? x : a)
    const u = Math.min(1, me.anim / 0.45)
    ball.x += (h.x - ball.x) * Math.min(1, dt * 10)
    ball.y += (h.y - ball.y) * Math.min(1, dt * 10)
    placeBall(me, -u * u * 0.9)
    if (me.state === 'goal' && me.anim < 0.05) {
      const p = me.tray.localToWorld(new me.T.Vector3(h.x - me.board.w / 2, 0.2, h.y - me.board.h / 2))
      me.fx.burst(p, { count: me.n === BOARDS - 1 ? 90 : 40, color: ['#FFD34D', '#FFF2B0', '#FFB020'], speed: 3, life: 1.2, size: 0.13, gravity: 3 })
    }
    if (me.anim >= 0.5) {
      me.ballMesh.visible = false
      if (me.state === 'fall') { me.state = 'next'; ctx.after(500, () => { if (bi === me && me.state === 'next') afterFall(me) }) }
      else { me.stage.timeScale = 1; afterGoal(me) }
    }
  }
  me.rimT = Math.max(0, me.rimT - dt)
  if (me.goalGlow) { me.goalGlow.scale.setScalar(1.4 + Math.sin(me.t * 3) * 0.15); (me.goalGlow.material as import('three').SpriteMaterial).opacity = 0.55 + Math.sin(me.t * 3) * 0.15 }
  for (const f of me.flagMeshes) f.cloth.rotation.y = Math.PI * 0.75 + Math.sin(me.t * 3 + f.i) * 0.2
  // La fin : la caméra descend vers le trou doré
  if (me.state === 'over' && me.n >= BOARDS) {
    const cam = me.stage.camera
    const g = me.board.holes.find(x => x.goal)!
    const at = me.tray.localToWorld(new me.T.Vector3(g.x - me.board.w / 2, 0, g.y - me.board.h / 2))
    cam.position.lerp(at.clone().add(new me.T.Vector3(-1.2, 4.2, 3.4)), Math.min(1, dt * 0.9))
    cam.lookAt(at)
    if (Math.random() < dt * 8) me.fx.burst(at.clone().setY(0.3), { count: 6, color: ['#FFD34D', '#FFF2B0'], speed: 2, life: 1, size: 0.1, gravity: 1 })
  }
  me.shake.apply(dt)
  me.fx.update(dt)
}

export const bille: GameDef = {
  id: 'bille', name: 'Le Labyrinthe à bille', icon: '🎱', sq: 'sq-peach', cat: 'action',
  subtitle: 'Penche la tablette pour mener la bille au trou doré',
  // La main : pencher la tablette (ou, sans gyroscope, glisser le doigt depuis la bille)
  hand: () => {
    const me = bi
    if (!me || me.state !== 'play' || me.anim > 0) return null
    const n = me.board.path[Math.min(me.board.path.length - 1, me.ball.flag + 1)]
    const dx = n[0] + 0.5 - me.ball.x, dy = n[1] + 0.5 - me.ball.y
    const l = Math.hypot(dx, dy) || 1
    const at = toScreen(me.stage, me.tray.localToWorld(me.ballMesh.position.clone()))
    if (me.gyro.on) return { tilt: { fx: 0.5, fy: 0.5 }, dx: dx / l, dy: dy / l }
    return { drag: [at, { x: at.x + dx / l * 150, y: at.y + dy / l * 150 }] }
  },
  mount(c) {
    ctx = c
    let dead = false
    const tier = c.byTier<0 | 1 | 2>(0, 1, 2)
    c.root.innerHTML = `
      <div class="arena g3-arena bi-arena" id="biArena">
        <div class="bi-pips" id="biPips">${Array.from({ length: BOARDS }, () => `<i>${ICON.target}</i>`).join('')}</div>
      </div>`
    const arena = $('biArena')
    const hideLoader = loader(arena, 'bille')
    preloadSfx(['click', 'tick', 'drop', 'metal', 'confirm', 'pluck', 'whoosh', 'error'])

    ;(async () => {
      const stage = await createStage(arena, {
        sky: '#3E2A1E', fov: 38, cam: [0, 9, 5], target: [0, 0, 0],
        hemi: ['#FFF0DC', '#4A3020', 0.9],
        sun: { pos: [-3, 10, 4], color: '#FFF0D8', intensity: 2.2, area: 7, far: 30 },
        fill: 0.45, exposure: 0.95, iblIntensity: 0.7
      })
      if (dead) { stage.dispose(); return }
      const T = stage.T
      const U = await import('three/examples/jsm/utils/BufferGeometryUtils.js')
      if (dead || !stage.alive) { stage.dispose(); return }
      const mats = materials(stage)
      // La table : un grand plateau de noyer sous le jouet, et une lumière chaude de lampe
      const table = new T.Mesh(new T.PlaneGeometry(60, 60), mats.table)
      table.rotation.x = -Math.PI / 2
      table.position.y = -0.85
      table.receiveShadow = true
      stage.scene.add(table)
      stage.scene.fog = new T.Fog('#3E2A1E', 18, 40)
      const lamp = new T.PointLight(0xFFD8A0, 18, 30, 1.6)
      lamp.position.set(4, 7, -3)
      stage.scene.add(lamp)
      const tray = new T.Group()
      stage.scene.add(tray)
      const ballMesh = new T.Mesh(new T.SphereGeometry(BALL_R, 36, 26), mats.steel)
      ballMesh.castShadow = true
      tray.add(ballMesh)
      const game = arcade(c, {
        host: arena,
        lives: 3,
        scoreIcon: ICON.target,
        stars: s => (bi && bi.n >= BOARDS ? (s.lives >= 2 ? 3 : 2) : 1)
      })
      const me: State = {
        stage, T, U, game, tier, board: null!, ball: null!, tray, built: null, flagMeshes: [], ballMesh, goalGlow: null,
        mats, fx: particles(stage, 500), shake: camShake(stage),
        n: 0, level: 0, falls: 0, state: 'play', tilt: [0, 0], finger: null,
        gyro: { on: false, zero: null, raw: [0, 0] }, anim: 0, rimT: 0, t: 0, auto: false
      }
      bi = me
      stage.onResize = () => { if (bi === me && me.board) frame3(me) }
      newBoard(me)
      hideLoader()

      /* --- Le doigt (suivi par son pointerId) et le gyroscope --- */
      const el = stage.renderer.domElement
      const onDown = (e: PointerEvent) => {
        if (bi !== me || e.target !== el || me.finger) return
        me.finger = { id: e.pointerId, x: e.clientX, y: e.clientY }
      }
      const onMove = (e: PointerEvent) => { if (me.finger && e.pointerId === me.finger.id) { me.finger.x = e.clientX; me.finger.y = e.clientY } }
      const onUp = (e: PointerEvent) => { if (me.finger && e.pointerId === me.finger.id) me.finger = null }
      const onTilt = (e: DeviceOrientationEvent) => {
        if (e.beta === null || e.gamma === null) return
        me.gyro.on = true
        me.gyro.raw = [e.beta, e.gamma]
        if (!me.gyro.zero) me.gyro.zero = [e.beta, e.gamma]
      }
      el.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      window.addEventListener('deviceorientation', onTilt)

      // Accroche pour les bots (scripts/play.mjs) — inerte en production
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __bi: unknown }).__bi = {
          get state() { return me.state }, get n() { return me.n }, get lives() { return me.game.s.lives }, get level() { return me.level },
          get tilt() { return me.tilt.slice() }, get size() { return [me.board.w, me.board.h] }, get holes() { return me.board.holes.length - 1 },
          get flag() { return me.ball.flag }, get falls() { return me.falls }, get rim() { return me.ball.rim },
          ball: () => toScreen(stage, me.tray.localToWorld(me.ballMesh.position.clone())),
          /** Le premier pas du chemin depuis le départ (la case voisine ouverte) : [dx, dy]. */
          get firstStep() { const [a, b] = me.board.path; return [b[0] - a[0], b[1] - a[1]] },
          /** Le pilote (le même que celui des tests) incline à la place du doigt. */
          set auto(v: boolean) { me.auto = v; me.ball.pilot = v ? autoPilot() : null },
          get auto() { return me.auto }
        }
      }

      stage.start(dt => { if (bi === me) step(me, dt) })
      stage.keep({
        dispose() {
          el.removeEventListener('pointerdown', onDown)
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          window.removeEventListener('pointercancel', onUp)
          window.removeEventListener('deviceorientation', onTilt)
          me.fx.dispose()
          me.game.dispose()
          Object.values(me.mats).forEach(m => m.dispose())
          delete (window as { __bi?: unknown }).__bi
        }
      })
    })().catch(err => { console.error(err); hideLoader(); ctx.toast('La 3D n\'est pas disponible ici') })

    return () => {
      dead = true
      setMusicIntensity(0)
      const me = bi
      bi = null
      if (me) { try { me.stage.dispose() } catch { /* déjà démonté */ } }
    }
  }
}
