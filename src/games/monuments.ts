import type { GameDef, GameContext } from '../core/types'
import { createStage, loader, type Stage, type T3 } from '../core/three3d'
import { particles, camShake, type Particles, type CamShake } from '../core/scene3d'
import { monumentKit, MONUMENTS, MONUMENT_NAME, type Monument, type MonumentId } from '../core/monuments3d'
import { critterKit, FARM, type CritterKind } from '../core/critters'
import { withRenderer, critterPortraits } from '../core/portraits'
import { sfx, preloadSfx, cry, CRY } from '../core/sfx'
import { tone, sWin } from '../core/audio'
import { visible, handNow, type HandMove } from '../core/hand'
import { BADGE } from '../core/badges'
import { ICON } from '../core/icons'
import { mine, snapScene, whoCards, paintCards, meButton, trashButton, twoTaps, calm, type Who } from '../core/mine'
import { Fingers, Spinner, perWidth, coast } from '../core/touchcam'

/* 🗼 LES MONUMENTS (19/10, demandé par Jade : « construire les pyramides, la
   tour Eiffel, le pont de Californie… et les pimper ») — d'après les
   maquettes validées. Deux cartes à l'ouverture (un monde par fille), puis
   les huit monuments en grandes images ; on en choisit un :
   - Construire : la forme du monument en transparent, la pièce suivante
     flotte à côté ; on la GLISSE jusqu'à sa place (la sienne brille) : près
     de sa place, elle s'emboîte (clac, poussière) ; trop loin, elle revient,
     sans sanction. Les câbles du Golden Gate se TRACENT au doigt d'une
     ancre à l'autre, puis les suspentes tombent une à une.
   - Peindre : une couleur, puis toucher le monument (la matière touchée
     change : la Tour Eiffel rose, la pyramide arc-en-ciel…)
   - Lumières : des guirlandes le long du monument, et le jour ou la nuit
   - Déco : drapeaux, nœuds, ballons, étoiles, cœurs là où l'on touche
   - Visiteurs : les animaux de la ferme, sur le monument ou autour
   (un toucher sur une déco ou un visiteur le reprend)
   « Fini » : la nuit tombe, le monument s'illumine, un bouquet au-dessus,
   la caméra en fait le tour (un toucher passe). Chaque monument est gardé
   tel qu'on l'a laissé, par fille, avec sa photo ; la poubelle (27/10, deux
   touchers) le remet tel qu'au premier jour. Créer : aucune note. */

type Step = 'construire' | 'peindre' | 'lumieres' | 'deco' | 'visiteurs'
type DecoKind = 'drapeau' | 'noeud' | 'ballon' | 'etoile' | 'coeur'
type Lights = 'off' | 'or' | 'blanc' | 'rose' | 'bleu' | 'arc'

/** Un livre de monuments par fille : `ferme:monuments:<qui>`, la photo de chacun (`…:photo:<qui>:<monument>`), la dernière choisie. */
const box = mine('monuments', { delay: 300 })

const STEPS: Step[] = ['construire', 'peindre', 'lumieres', 'deco', 'visiteurs']
const STEP_NAME: Record<Step, string> = { construire: 'Construire', peindre: 'Peindre', lumieres: 'Lumières', deco: 'Déco', visiteurs: 'Visiteurs' }
const COLORS: [string, string][] = [
  ['#F27BAA', 'Rose'], ['#E8456B', 'Framboise'], ['#FF9F43', 'Orange'], ['#FFD34D', 'Jaune'], ['#5EC97B', 'Vert'], ['#4FB8E7', 'Bleu'],
  ['#B197FC', 'Lilas'], ['#FFFFFF', 'Blanc'], ['#E2B85C', 'Or'], ['#3A3340', 'Noir']
]
const LIGHTS: [Lights, string, string][] = [['off', 'Éteint', '#8A8A94'], ['or', 'Or', '#FFD34D'], ['blanc', 'Blanc', '#FFF8E6'], ['rose', 'Rose', '#FF8FB5'], ['bleu', 'Bleu', '#7FD0FF'], ['arc', 'Arc-en-ciel', '#FFC94D']]
const RAINBOW = ['#FF6B81', '#FFC94D', '#5EC97B', '#4FB8E7', '#B197FC']
const DECOS: [DecoKind, string][] = [['drapeau', 'Drapeau'], ['noeud', 'Nœud'], ['ballon', 'Ballon'], ['etoile', 'Étoile'], ['coeur', 'Cœur']]
const VISITORS: CritterKind[] = FARM
const VIS_NAME: Partial<Record<CritterKind, string>> = { cow: 'Vache', pig: 'Cochon', hen: 'Poule', chick: 'Poussin', duck: 'Canard', sheep: 'Mouton', dog: 'Chien', rabbit: 'Lapin' }
const MAX_DECO = 16, MAX_VIS = 10

/** Le décor de chaque monument. */
const ENV: Record<MonumentId, 'parc' | 'desert' | 'baie' | 'ile'> = {
  pyramide: 'desert', eiffel: 'parc', goldengate: 'baie', pise: 'parc', chateau: 'parc', taj: 'parc', bigben: 'parc', moai: 'ile'
}

interface Saved {
  built: number
  colors: Record<number, string>
  lights: Lights
  night: boolean
  deco: { k: DecoKind; p: number[]; n: number[] }[]
  vis: { k: CritterKind; p: number[]; ry: number }[]
}
type Book = Partial<Record<MonumentId, Saved>>
const fresh = (): Saved => ({ built: 0, colors: {}, lights: 'or', night: false, deco: [], vis: [] })

type Obj = import('three').Object3D
type V3 = import('three').Vector3

interface State {
  stage: Stage
  T: T3
  kit: Awaited<ReturnType<typeof monumentKit>>
  ck: ReturnType<typeof critterKit>
  id: MonumentId
  m: Monument
  saved: Saved
  /** Les matières qu'on peint (dans un ordre fixe : les couleurs gardées s'y retrouvent) et leur couleur d'origine. */
  paintMats: import('three').MeshStandardMaterial[]
  origin: string[]
  /** Par pièce : son parent, son centre et sa taille (repère du parent, posée), sa forme en transparent. */
  info: { parent: Obj; c: V3; size: number; ghost: Obj }[]
  ghostMat: import('three').MeshBasicMaterial
  pulseMat: import('three').MeshBasicMaterial
  /** La pièce en route : sa place d'attente, son échelle, glissée ou en vol. */
  cur: {
    i: number; s0: number; s: number; pos: V3; pop: number
    drag: { id: number; off: V3 } | null
    fly: { t: number; from: V3; fromS: number; home: boolean } | null
  } | null
  /** Le câble qu'on trace (le Golden Gate) : jusqu'où, depuis quel bout ; puis les suspentes qui tombent. */
  trace: { prog: number; dir: 1 | -1 | 0; id: number | null; drop: number; total: number } | null
  step: Step
  color: string
  deco: DecoKind
  vis: CritterKind
  rot: number
  /** L'angle de la caméra au moment de « Fini » */
  rot0: number
  vRot: number
  dist: number
  camY: number
  tgtY: number
  night: boolean
  nightG: import('three').Group
  dayG: import('three').Group
  /** Les lumières du socle et leur réglage de jour (la nuit les baisse) */
  lamps: { l: import('three').Light; i: number; c: import('three').Color; g?: import('three').Color }[]
  ibl: number
  glow: import('three').PointLight[]
  bulbs: import('three').InstancedMesh | null
  bulbTw: Float32Array
  decos: { k: DecoKind; g: import('three').Group }[]
  /** Les voitures qui passent sur le pont, une fois le tablier posé */
  cars: { g: Obj; x: number; v: number }[]
  visitors: { k: CritterKind; g: import('three').Group; ph: number }[]
  fx: Particles
  shake: CamShake
  ray: import('three').Raycaster
  phase: 'make' | 'outro' | 'done'
  outroT: number
  t: number
}

let me: State | null = null
let ctx: GameContext
let who: Who = 'jade'
const thumbs: Record<string, string> = {}

/* ---------- La sauvegarde : un livre de monuments par fille ---------- */

function loadBook(w: Who): Book {
  const b = box.read(w) as Book | null
  return b && typeof b === 'object' ? b : {}
}
function loadSaved(w: Who, id: MonumentId): Saved {
  const s = loadBook(w)[id]
  return s && typeof s.built === 'number' ? { ...fresh(), ...s } : fresh()
}
/** Le livre, avec ce monument tel qu'il est (relu au moment d'écrire : les autres monuments n'y perdent rien). */
const bookWith = (w: Who, id: MonumentId, data: Saved) => () => { const b = loadBook(w); b[id] = data; return b }
function save(s: State) {
  box.save(who, bookWith(who, s.id, JSON.parse(JSON.stringify(s.saved)) as Saved))
}
/** La photo du monument pour sa carte : le milieu de l'image, en 4:3. */
function snap(s: State) {
  const url = snapScene(s.stage, 360, true)
  if (url) box.setPhoto(who, url, s.id)
}

/* ---------- Le décor ---------- */

function scenery(stage: Stage, id: MonumentId, m: Monument) {
  const T = stage.T
  const day = new T.Group(), night = new T.Group()
  const env = ENV[id]
  const mat = (color: string, o: Partial<import('three').MeshStandardMaterialParameters> = {}) => new T.MeshStandardMaterial({ color, roughness: 0.95, ...o })
  const add = (g: import('three').BufferGeometry, mm: import('three').Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const o = new T.Mesh(g, mm); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.receiveShadow = true; o.castShadow = true; day.add(o); return o
  }
  const disc = (r: number, color: string, y = 0, o: Partial<import('three').MeshStandardMaterialParameters> = {}) => {
    const d = new T.Mesh(new T.CircleGeometry(r, 72), mat(color, o)); d.rotation.x = -Math.PI / 2; d.position.y = y; d.receiveShadow = true; day.add(d); return d
  }
  const R = Math.max(m.w, 1.6) / 2
  // Le tour de la caméra : rien de haut en deçà (sinon, en tournant, un arbre bouche tout l'écran)
  const far = Math.max(m.h * 2.3, m.w * 1.45) + 3.4
  const ring = (an: number, extra = 0): [number, number] => [Math.sin(an) * (far + extra), Math.cos(an) * (far + extra)]
  const sphere = new T.SphereGeometry(1, 24, 16)
  const tree = (x: number, z: number, s: number) => {
    add(new T.CylinderGeometry(0.05 * s, 0.07 * s, 0.4 * s, 8), mat('#7A5A3C'), x, 0.2 * s, z)
    add(sphere, mat('#5DAE4C', { roughness: 0.9 }), x, 0.62 * s, z, 0.38 * s, 0.38 * s, 0.38 * s)
  }
  const palm = (x: number, z: number, s: number) => {
    add(new T.CylinderGeometry(0.04 * s, 0.06 * s, 1.1 * s, 8), mat('#A07A50'), x, 0.55 * s, z).rotation.z = 0.12
    for (let i = 0; i < 6; i++) {
      const leaf = add(new T.ConeGeometry(0.09 * s, 0.6 * s, 6), mat('#4FA24A', { roughness: 0.8 }), x + 0.06 * s, 1.08 * s, z)
      leaf.rotation.set(Math.PI / 2 - 0.5, i * Math.PI / 3, 0, 'YXZ')
      leaf.translateY(0.28 * s)
    }
  }
  if (env === 'desert') {
    disc(40, '#E8CC8C')
    for (const [x, z, s] of [[-6, -6, 2.4], [5, -7, 3], [9, -2, 2], [-9, 1, 2.2]]) add(sphere, mat('#E2C07E'), x, -s * 0.75, z, s * 1.6, s, s * 1.3)
    for (const [an, e, k] of [[-1.1, 0, 1.6], [-1.3, 1.2, 1.3], [1.2, 0.4, 1.5], [2.6, 0, 1.4], [3.4, 1, 1.7]]) palm(...ring(an, e), k)
  } else if (env === 'baie') {
    disc(50, '#5FA8D8', 0, { roughness: 0.25, metalness: 0.1 }).userData.water = true
    for (const sx of [-1, 1]) add(sphere, mat('#7CBF5C'), sx * (m.w / 2 + 1.2), -0.7, 0, 2.2, 1.3, 2.4)
    for (const [x, z] of [[-3.6, -0.8], [-3.2, 0.9], [3.5, -0.6], [3.9, 0.7]]) tree(x, z, 0.9)
  } else if (env === 'ile') {
    disc(50, '#5FA8D8', -0.02, { roughness: 0.25, metalness: 0.1 }).userData.water = true
    disc(far + 2.6, '#7CBF5C')
    for (const [an, e, k] of [[-0.9, 0, 1.4], [-1.2, 1, 1.2], [1.0, 0.3, 1.5], [2.4, 0, 1.3], [3.6, 0.8, 1.6], [4.6, 0.2, 1.2]]) palm(...ring(an, e), k)
  } else {
    disc(40, '#8CCB6A')
    disc(R + 0.9, '#E8D8B4', 0.004)
    const a = new T.Mesh(new T.PlaneGeometry(1.0, 20), mat('#E8D8B4')); a.rotation.x = -Math.PI / 2; a.position.set(0, 0.003, 10 + R); a.receiveShadow = true; day.add(a)
    // Les grands arbres au-delà du tour de la caméra ; près du monument, des buissons assez bas pour ne rien cacher
    for (let i = 0; i < 16; i++) tree(...ring(i / 16 * Math.PI * 2 + 0.2, (i % 3) * 1.6), 1.5 + (i % 4) * 0.22)
    const bush = mat('#5DAE4C', { roughness: 0.9 })
    for (let i = 0; i < 12; i++) {
      const an = i / 12 * Math.PI * 2 + 0.26, d = R + 1.3 + (i % 2) * 0.35
      if (Math.cos(an) > 0.93) continue
      add(sphere, bush, Math.sin(an) * d, 0.02, Math.cos(an) * d, 0.28, 0.2 + (i % 3) * 0.04, 0.28)
    }
  }
  stage.scene.add(day)
  // La nuit : des étoiles, la lune
  const n = 600, pos = new Float32Array(n * 3)
  let seed = 9
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  for (let i = 0; i < n; i++) { const an = r() * Math.PI * 2, e = 0.1 + r() * 1.3, d = 60; pos.set([Math.cos(an) * Math.cos(e) * d, Math.sin(e) * d, Math.sin(an) * Math.cos(e) * d], i * 3) }
  const gg = new T.BufferGeometry(); gg.setAttribute('position', new T.BufferAttribute(pos, 3))
  night.add(new T.Points(gg, new T.PointsMaterial({ color: '#FFF8E0', size: 0.28, sizeAttenuation: true, fog: false })))
  const moon = new T.Mesh(new T.SphereGeometry(2, 28, 18), new T.MeshBasicMaterial({ color: '#FFF4CC', fog: false })); moon.position.set(22, 26, -44); night.add(moon)
  night.visible = false
  stage.scene.add(night)
  return { day, night }
}

/* ---------- La déco ---------- */

function makeDeco(T: T3, k: DecoKind, size: number) {
  const g = new T.Group()
  const m = (c: string, o: Partial<import('three').MeshStandardMaterialParameters> = {}) => new T.MeshStandardMaterial({ color: c, roughness: 0.5, ...o })
  const add = (geo: import('three').BufferGeometry, mm: import('three').Material, x = 0, y = 0, z = 0) => { const o = new T.Mesh(geo, mm); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o }
  const shape = (pts: [number, number][]) => { const s = new T.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) s.lineTo(x, y); s.closePath(); return s }
  if (k === 'drapeau') {
    add(new T.CylinderGeometry(0.02, 0.02, 1, 8), m('#E2B85C', { metalness: 0.8, roughness: 0.3 }), 0, 0.5, 0)
    add(new T.SphereGeometry(0.025, 10, 8), m('#E2B85C', { metalness: 0.8, roughness: 0.3 }), 0, 1.01, 0)
    const f = add(new T.ExtrudeGeometry(shape([[0, 0], [0.5, -0.13], [0, -0.26]]), { depth: 0.01, bevelEnabled: false }), m('#FF6B81', { side: T.DoubleSide }), 0.01, 0.97, 0)
    f.userData.wave = true
  } else if (k === 'noeud') {
    const lobe = new T.SphereGeometry(0.2, 18, 12)
    for (const sx of [-1, 1]) { const l = add(lobe, m('#FF8FB5', { roughness: 0.4 }), sx * 0.2, 0.25, 0); l.scale.set(1, 0.65, 0.4); l.rotation.z = sx * 0.3 }
    add(new T.SphereGeometry(0.09, 14, 10), m('#E8456B'), 0, 0.25, 0.02)
    for (const sx of [-1, 1]) { const t = add(new T.BoxGeometry(0.08, 0.28, 0.02), m('#FF8FB5'), sx * 0.08, 0.08, 0); t.rotation.z = sx * 0.35 }
  } else if (k === 'ballon') {
    add(new T.CylinderGeometry(0.004, 0.004, 0.8, 4), m('#FFFFFF'), 0, 0.4, 0)
    const b = add(new T.SphereGeometry(0.2, 24, 18), new T.MeshPhysicalMaterial({ color: '#4FB8E7', roughness: 0.15, clearcoat: 1 }), 0, 1.0, 0)
    b.scale.y = 1.15
    add(new T.ConeGeometry(0.035, 0.05, 8), m('#4FB8E7'), 0, 0.78, 0)
  } else if (k === 'etoile') {
    const pts: [number, number][] = Array.from({ length: 10 }, (_, i) => { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.12 : 0.28; return [Math.cos(a) * r, Math.sin(a) * r] })
    const geo = new T.ExtrudeGeometry(shape(pts), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 2 })
    geo.translate(0, 0.28, -0.03)
    add(geo, m('#FFD34D', { metalness: 0.6, roughness: 0.3 }))
  } else {
    const s = new T.Shape(); s.moveTo(0, -0.25); s.bezierCurveTo(-0.38, 0.02, -0.25, 0.3, 0, 0.14); s.bezierCurveTo(0.25, 0.3, 0.38, 0.02, 0, -0.25)
    const geo = new T.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.02, bevelSegments: 2 })
    geo.translate(0, 0.28, -0.03)
    add(geo, new T.MeshPhysicalMaterial({ color: '#FF6B81', roughness: 0.3, clearcoat: 0.6 }))
  }
  g.scale.setScalar(size)
  g.userData.deco = k
  // Où la prendre du doigt : le tissu du drapeau, pas son mât
  g.userData.grab = k === 'drapeau' ? [0.2, 0.85, 0] : k === 'ballon' ? [0, 1, 0] : [0, 0.27, 0.04]
  return g
}
const disposeTree = (o: Obj) => o.traverse(x => {
  const mm = x as import('three').Mesh
  if (mm.geometry) mm.geometry.dispose()
  if (mm.material) (Array.isArray(mm.material) ? mm.material : [mm.material]).forEach(q => q.dispose())
})

/* ---------- Les guirlandes ---------- */

function buildBulbs(s: State) {
  const T = s.T
  // `dispose()` de l'InstancedMesh lui-même : ses tampons d'instances (positions, couleurs) quittent le GPU
  if (s.bulbs) { s.m.obj.remove(s.bulbs); s.bulbs.geometry.dispose(); (s.bulbs.material as import('three').Material).dispose(); s.bulbs.dispose(); s.bulbs = null }
  if (s.saved.lights === 'off' || s.saved.built < s.m.pieces.length) return
  const pts: V3[] = []
  for (const line of s.m.lights) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1], n = Math.max(1, Math.round(a.distanceTo(b) / 0.09))
      for (let j = 0; j < n; j++) pts.push(a.clone().lerp(b, j / n))
    }
    pts.push(line[line.length - 1].clone())
  }
  const im = new T.InstancedMesh(new T.SphereGeometry(0.022, 10, 8), new T.MeshBasicMaterial({ color: '#FFFFFF' }), pts.length)
  const m4 = new T.Matrix4(), c = new T.Color()
  const base = LIGHTS.find(l => l[0] === s.saved.lights)![2]
  pts.forEach((p, i) => { im.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)); im.setColorAt(i, c.set(s.saved.lights === 'arc' ? RAINBOW[i % RAINBOW.length] : base)) })
  im.userData.colors = pts.map((_, i) => s.saved.lights === 'arc' ? RAINBOW[i % RAINBOW.length] : base)
  s.bulbTw = Float32Array.from(pts, () => Math.random() * 6.28)
  s.m.obj.add(im)
  s.bulbs = im
}

/* ---------- Les voitures du pont ---------- */

/** Six petites voitures sur les deux voies, dans les deux sens ; leurs phares s'allument la nuit. */
function buildCars(s: State) {
  const road = s.m.road
  if (!road || s.cars.length || s.saved.built < s.m.pieces.length) return
  const T = s.T
  const RB = s.kit.RoundedBoxGeometry
  const body = new RB(0.13, 0.036, 0.062, 2, 0.012), cabin = new RB(0.068, 0.032, 0.054, 2, 0.012)
  const lamp = new T.BoxGeometry(0.006, 0.012, 0.05)
  const glass = new T.MeshStandardMaterial({ color: '#BFE4F6', roughness: 0.2, metalness: 0.3 })
  const head = new T.MeshStandardMaterial({ color: '#FFF4C8', emissive: '#FFE7A0', emissiveIntensity: 0.4 })
  head.userData.headlight = true
  const cols = ['#FF6B81', '#FFC94D', '#4FB8E7', '#5EC97B', '#B197FC', '#FFFFFF']
  for (let i = 0; i < 6; i++) {
    const g = new T.Group(), lane = i % 2, dir = lane ? -1 : 1
    const b = new T.Mesh(body, new T.MeshStandardMaterial({ color: cols[i], roughness: 0.35, metalness: 0.2 })); b.position.y = 0.018
    const c = new T.Mesh(cabin, glass); c.position.set(-0.012, 0.048, 0)
    const l = new T.Mesh(lamp, head); l.position.set(0.066, 0.02, 0)
    g.add(b, c, l)
    g.traverse(o => { o.castShadow = true })
    g.rotation.y = dir > 0 ? 0 : Math.PI
    g.position.set(0, road.y, road.lanes[lane])
    s.m.obj.add(g)
    s.cars.push({ g, x: -road.half + ((i * 0.37) % 1) * road.half * 2, v: dir * (0.38 + (i % 3) * 0.07) })
  }
}
function stepCars(s: State, dt: number) {
  const road = s.m.road
  if (!road) return
  for (const c of s.cars) {
    c.x += c.v * dt
    if (c.x > road.half) c.x -= road.half * 2
    if (c.x < -road.half) c.x += road.half * 2
    // Elles arrivent du bout du pont en grandissant et s'y effacent en rapetissant
    const edge = Math.min(1, (road.half - Math.abs(c.x)) / 0.25)
    c.g.position.x = c.x
    c.g.scale.setScalar(Math.max(0.001, edge) * 1.4)
  }
}

/* ---------- Jour, nuit ---------- */

function setNight(s: State, on: boolean) {
  s.night = on
  const T = s.T
  s.stage.scene.background = new T.Color(on ? '#1B2346' : '#BFE6F7')
  if (s.stage.scene.fog) s.stage.scene.fog.color.set(on ? '#1B2346' : '#BFE6F7')
  s.nightG.visible = on
  // La lune éclaire bleu et peu ; le reflet de la pièce (l'IBL) s'éteint presque, sinon l'eau reste claire
  for (const { l, i, c, g } of s.lamps) {
    const hemi = l as import('three').HemisphereLight, dir = l as import('three').DirectionalLight
    if (hemi.isHemisphereLight) { l.color.set(on ? '#5A6AAA' : c); hemi.groundColor.set(on ? '#1E2440' : g!); l.intensity = i * (on ? 0.55 : 1) }
    else { l.color.set(on ? '#BFD0FF' : c); l.intensity = i * (on ? (dir.castShadow ? 0.22 : 0.12) : 1) }
  }
  s.stage.scene.environmentIntensity = s.ibl * (on ? 0.12 : 1)
  // Les phares des voitures
  for (const c of s.cars) c.g.traverse(o => { const m = (o as import('three').Mesh).material as import('three').MeshStandardMaterial | undefined; if (m?.userData.headlight) m.emissiveIntensity = on ? 2.2 : 0.4 })
  for (const l of s.glow) l.visible = on && s.saved.lights !== 'off' && s.saved.built >= s.m.pieces.length
}

/* ---------- Construire ---------- */

const ease = (k: number) => k * k * (3 - 2 * k)
/** Le plan où glisse la pièce : face à la caméra, par le centre de sa place. */
function dragPlane(s: State, at: V3) {
  const n = s.stage.camera.getWorldDirection(new s.T.Vector3()).negate()
  return new s.T.Plane().setFromNormalAndCoplanarPoint(n, at)
}
const worldOf = (s: State, i: number) => s.info[i].parent.localToWorld(s.info[i].c.clone())
function rayAt(s: State, cx: number, cy: number) {
  const r = s.stage.renderer.domElement.getBoundingClientRect()
  s.ray.setFromCamera(new s.T.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), s.stage.camera)
  return s.ray
}
function scr(s: State, w: V3) {
  const v = w.clone().project(s.stage.camera), r = s.stage.renderer.domElement.getBoundingClientRect()
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }
}
/** La place d'attente de la pièce en route : à droite du monument, sur le plan de sa place. */
function waitSpot(s: State, i: number) {
  const tgt = worldOf(s, i)
  const ray = new s.T.Raycaster()
  ray.setFromCamera(new s.T.Vector2(0.5, -0.12), s.stage.camera)
  return ray.ray.intersectPlane(dragPlane(s, tgt), new s.T.Vector3()) ?? tgt.clone().add(new s.T.Vector3(2, 0, 0))
}
/** Pose la pièce i à l'échelle k, son centre au point du monde w. */
function putPiece(s: State, i: number, w: V3, k: number) {
  const p = s.m.pieces[i].obj, inf = s.info[i]
  p.scale.setScalar(k)
  p.position.copy(inf.parent.worldToLocal(w.clone())).sub(inf.c.clone().multiplyScalar(k))
}

function nextPiece(s: State) {
  s.cur = null; s.trace = null
  const i = s.saved.built
  s.info.forEach((inf, j) => { inf.ghost.visible = j >= i; setGhostMat(inf.ghost, j === i ? s.pulseMat : s.ghostMat) })
  if (i >= s.m.pieces.length) return
  const piece = s.m.pieces[i]
  piece.obj.visible = true
  if (piece.trace) {
    // Les câbles : ils grandissent le long du chemin qu'on trace
    piece.obj.position.set(0, 0, 0); piece.obj.scale.setScalar(1)
    let total = 0
    piece.obj.traverse(o => {
      const im = o as import('three').InstancedMesh
      if (im.isInstancedMesh) { total = im.count; im.userData.full = im.count; im.count = 0 }
      else if ((o as import('three').Mesh).isMesh) { const g = (o as import('three').Mesh).geometry; g.setDrawRange(0, 0) }
    })
    s.trace = { prog: 0, dir: 0, id: null, drop: 0, total }
    return
  }
  const pos = waitSpot(s, i)
  const vh = 2 * Math.tan(s.stage.camera.fov * Math.PI / 360) * s.stage.camera.position.distanceTo(pos)
  const s0 = Math.min(1, Math.max(0.18, vh * 0.3 / s.info[i].size))
  s.cur = { i, s0, s: s0, pos, pop: 0, drag: null, fly: null }
  putPiece(s, i, pos, 0.001)
}
function setGhostMat(g: Obj, mat: import('three').Material) {
  g.traverse(o => { const mm = o as import('three').Mesh; if (mm.isMesh) mm.material = mat })
}

/** La pièce est à sa place : clac, poussière ; la suivante. */
function land(s: State) {
  const i = s.saved.built, p = s.m.pieces[i]
  p.obj.position.set(0, 0, 0); p.obj.scale.setScalar(1)
  s.saved.built++
  const c = worldOf(s, i), base = c.clone(); base.y = Math.max(0.05, c.y - s.info[i].size * 0.3)
  s.fx.burst(base, { count: 26, color: ['#E8D8B4', '#FFFFFF', '#D9C49A'], speed: 1.4, spread: 1, life: 0.9, size: 0.06, gravity: 1.5 })
  s.shake.hit(0.35)
  sfx('chop', { vol: 0.7, rate: 0.85 + Math.random() * 0.2 })
  tone(392 + s.saved.built * 40, 0.1, 'triangle', 0.08)
  save(s)
  if (s.saved.built >= s.m.pieces.length) built(s)
  else ctx.after(250, () => { if (me === s) nextPiece(s) })
}
/** Le monument est debout : la fête, et les étapes pour le pimper s'allument. */
function built(s: State) {
  nextPiece(s)
  sWin()
  const top = new s.T.Vector3(0, s.m.h * 0.9, 0)
  for (let k = 0; k < 3; k++) ctx.after(k * 220, () => { if (me === s) s.fx.burst(top.clone().add(new s.T.Vector3((Math.random() - 0.5) * s.m.w * 0.5, Math.random() * 0.5, 0)), { count: 40, color: ['#FF6B81', '#FFC94D', '#5EC97B', '#4FB8E7', '#B197FC'], speed: 2.2, spread: 1, life: 1.4, size: 0.07, gravity: 1.2 }) })
  buildBulbs(s)
  buildCars(s)
  setNight(s, s.night)
  ctx.root.querySelector('.mn-wrap')?.setAttribute('data-built', '1')
  ctx.after(900, () => { if (me === s) { setStepRef?.('peindre'); handNow() } })
}
let setStepRef: ((st: Step) => void) | null = null

/* ---------- Chaque image ---------- */

function frame(s: State, dt: number) {
  s.t += dt
  const T = s.T, cam = s.stage.camera
  // La caméra tourne autour du monument (au doigt, avec élan ; à la fin, toute seule)
  if (s.phase === 'outro') {
    // Une tour, on en fait le tour ; un monument large (le pont), on le regarde en se balançant devant
    if (s.m.w > s.m.h * 1.4) s.rot += (s.rot0 + Math.sin(s.outroT * 0.9) * 0.5 - s.rot) * (1 - Math.pow(0.05, dt))
    else s.rot += dt * 0.9
  }
  else coast(s, dt, 0.03)
  cam.position.set(Math.sin(s.rot) * s.dist, s.camY, Math.cos(s.rot) * s.dist)
  cam.lookAt(0, s.tgtY, 0)
  s.shake.apply(dt)
  cam.updateMatrixWorld()
  // Les formes en transparent : celle de la pièce attendue respire
  s.pulseMat.opacity = 0.45 + Math.sin(s.t * 4) * 0.2
  // La pièce en route
  const c = s.cur
  if (c) {
    const tgt = worldOf(s, c.i)
    if (c.pop < 1) c.pop = Math.min(1, c.pop + dt * 3)
    if (c.fly) {
      c.fly.t = Math.min(1, c.fly.t + dt / (c.fly.home ? 0.35 : 0.22))
      const k = ease(c.fly.t)
      const to = c.fly.home ? waitSpot(s, c.i) : tgt
      const toS = c.fly.home ? c.s0 : 1
      c.s = c.fly.fromS + (toS - c.fly.fromS) * k
      putPiece(s, c.i, c.fly.from.clone().lerp(to, k), c.s)
      if (c.fly.t >= 1) { if (c.fly.home) { c.fly = null; c.pos = to } else { s.cur = null; land(s) } }
    } else if (!c.drag) {
      // Elle attend en flottant (et revient à sa place d'attente si la caméra a tourné)
      c.pos = waitSpot(s, c.i)
      const bob = Math.sin(s.t * 2.6) * 0.04 * s.info[c.i].size * c.s0
      const k = c.pop < 1 ? ease(c.pop) * (1 + Math.sin(c.pop * Math.PI) * 0.15) : 1
      putPiece(s, c.i, c.pos.clone().add(new T.Vector3(0, bob, 0)), c.s0 * k)
      s.m.pieces[c.i].obj.rotation.y = Math.sin(s.t * 1.3) * 0.15
    }
    if (c.drag || c.fly) s.m.pieces[c.i].obj.rotation.y *= Math.pow(0.001, dt)
  }
  // Les suspentes du Golden Gate qui tombent une à une
  const tr = s.trace
  if (tr && tr.prog >= 1 && tr.drop < tr.total) {
    const before = Math.floor(tr.drop)
    tr.drop = Math.min(tr.total, tr.drop + dt * tr.total / 1.2)
    s.m.pieces[s.saved.built].obj.traverse(o => { const im = o as import('three').InstancedMesh; if (im.isInstancedMesh) im.count = Math.floor(tr.drop) })
    if (Math.floor(tr.drop / 8) > Math.floor(before / 8)) sfx('tick', { vol: 0.35, rate: 1.4 + Math.random() * 0.4 })
    if (tr.drop >= tr.total) land(s)
  }
  stepCars(s, dt)
  // Les guirlandes scintillent ; la nuit, un peu plus
  if (s.bulbs) {
    const col = s.bulbs.userData.colors as string[], cc = new T.Color()
    for (let i = 0; i < col.length; i++) {
      const k = 0.75 + 0.25 * Math.sin(s.t * 3 + s.bulbTw[i]) + (s.night && Math.sin(s.t * 1.7 + s.bulbTw[i] * 7) > 0.985 ? 0.8 : 0)
      s.bulbs.setColorAt(i, cc.set(col[i]).multiplyScalar(k))
    }
    if (s.bulbs.instanceColor) s.bulbs.instanceColor.needsUpdate = true
  }
  // Les drapeaux ondulent, les ballons se balancent, les visiteurs sautillent
  for (const d of s.decos) {
    if (d.k === 'drapeau') d.g.children[2].rotation.y = Math.sin(s.t * 4 + d.g.id) * 0.25
    else if (d.k === 'ballon') d.g.rotation.z = Math.sin(s.t * 1.5 + d.g.id) * 0.08
  }
  for (const v of s.visitors) {
    v.ph += dt
    v.g.children[0].position.y = Math.abs(Math.sin(v.ph * 3)) * 0.04
  }
  // Fini : la nuit, un bouquet au-dessus, la caméra en fait le tour
  if (s.phase === 'outro') {
    s.outroT += dt
    if (Math.floor(s.outroT / 0.55) > Math.floor((s.outroT - dt) / 0.55) && s.outroT < 5.5) {
      const p = new T.Vector3((Math.random() - 0.5) * s.m.w * 0.9, s.m.h * (1.05 + Math.random() * 0.4), (Math.random() - 0.5) * 1.2)
      s.fx.burst(p, { count: 50, color: [RAINBOW[Math.floor(Math.random() * 5)], '#FFFFFF', '#FFD34D'], speed: 2.4, spread: 1, life: 1.5, size: 0.07, gravity: 0.6 })
      tone(500 + Math.random() * 400, 0.12, 'triangle', 0.05)
    }
    if (s.outroT > 6.2) endGame(s)
  }
  s.fx.update(dt)
}

function startOutro(s: State) {
  if (s.phase !== 'make' || s.saved.built < s.m.pieces.length) return
  s.phase = 'outro'; s.outroT = 0
  // Un monument large se regarde de face : la caméra y revient (le tour de face le plus proche)
  s.rot0 = Math.round(s.rot / (Math.PI * 2)) * Math.PI * 2
  if (s.saved.lights === 'off') s.saved.lights = 'or'
  buildBulbs(s)
  setNight(s, true)
  snap(s)
  save(s)
  ctx.root.querySelector('.mn-wrap')?.setAttribute('data-phase', 'outro')
  sfx('confirm', { vol: 0.5 })
}
function endGame(s: State) {
  if (s.phase === 'done') return
  s.phase = 'done'
  ctx.finish({ title: 'Quel beau monument !', msg: 'Tu l’as construit pièce par pièce', stars: 3 })
}

/* ---------- La scène d'un monument ---------- */

async function build(c: GameContext, arena: HTMLElement, id: MonumentId, saved: Saved): Promise<State | null> {
  const stage = await createStage(arena, {
    sky: '#BFE6F7', fov: 32, cam: [0, 2, 8], target: [0, 1, 0], fog: [20, 40],
    hemi: ['#E8F6FF', '#8CCB6A', 0.9], sun: { pos: [4, 9, 6], color: '#FFF1D0', intensity: 2.4, area: 7, far: 34 }, fill: 0.5, exposure: 1.0
  })
  if (!c.alive()) { stage.dispose(); return null }
  const T = stage.T
  const kit = await monumentKit(T)
  if (!c.alive() || !stage.alive) { kit.dispose(); stage.dispose(); return null }
  const m = kit.build(id)
  const { day, night } = scenery(stage, id, m)
  stage.scene.add(m.obj)
  m.obj.updateMatrixWorld(true)
  // Chaque pièce : son centre, sa taille, sa forme en transparent
  const ghostMat = new T.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.32, depthWrite: false })
  const pulseMat = new T.MeshBasicMaterial({ color: '#FFE27A', transparent: true, opacity: 0.55, depthWrite: false })
  stage.keep(ghostMat); stage.keep(pulseMat)
  const info = m.pieces.map(p => {
    const parent = p.obj.parent!
    const box = new T.Box3().setFromObject(p.obj)
    const c2 = parent.worldToLocal(box.getCenter(new T.Vector3()))
    const g = kit.ghost(p, ghostMat)
    parent.add(g)
    return { parent, c: c2, size: Math.max(0.2, box.getSize(new T.Vector3()).length()), ghost: g as Obj }
  })
  // Les matières qu'on peint, et leur couleur d'origine
  const paintMats: import('three').MeshStandardMaterial[] = []
  for (const p of m.pieces) p.obj.traverse(o => {
    const mm = o as import('three').Mesh
    if (!mm.isMesh) return
    for (const q of Array.isArray(mm.material) ? mm.material : [mm.material]) {
      const st = q as import('three').MeshStandardMaterial
      if (st.isMeshStandardMaterial && !paintMats.includes(st)) paintMats.push(st)
    }
  })
  const origin = paintMats.map(q => '#' + q.color.getHexString())
  paintMats.forEach((q, i) => { if (saved.colors[i]) q.color.set(saved.colors[i]) })
  m.pieces.forEach((p, i) => { p.obj.visible = i < saved.built })
  const lamps: State['lamps'] = []
  stage.scene.traverse(o => {
    const l = o as import('three').Light
    if (l.isLight && !(l as import('three').PointLight).isPointLight) lamps.push({ l, i: l.intensity, c: l.color.clone(), g: (l as import('three').HemisphereLight).groundColor?.clone() })
  })
  const reach = Math.max(m.h, m.w * 0.6)
  const glow = [new T.PointLight('#FFC870', 5, reach * 2.4), new T.PointLight('#FFB0D8', 4, reach * 2.2)]
  // Devant le monument, assez loin de ses faces : tout près, une lampe brûle une tache blanche (la Pyramide)
  glow[0].position.set(0, m.h * 0.3, m.w * 0.5 + 0.9); glow[1].position.set(0, m.h * 0.8, m.w * 0.4 + 1.0)
  for (const l of glow) { l.visible = false; stage.scene.add(l) }
  const dist = Math.max(m.h * 2.3, m.w * 1.45) + 2.2
  const s: State = {
    stage, T, kit, ck: critterKit(T), id, m, saved, paintMats, origin, info, ghostMat, pulseMat,
    cur: null, trace: null, step: 'construire', color: COLORS[0][0], deco: 'drapeau', vis: 'cow',
    rot: 0.35, rot0: 0.35, vRot: 0, dist, camY: m.h * 0.55 + dist * 0.2, tgtY: m.h * 0.42,
    night: false, nightG: night, dayG: day,
    lamps, ibl: stage.scene.environmentIntensity,
    glow, bulbs: null, bulbTw: new Float32Array(0), decos: [], cars: [], visitors: [],
    fx: particles(stage, 500), shake: camShake(stage), ray: new T.Raycaster(), phase: 'make', outroT: 0, t: 0
  }
  for (const d of saved.deco) addDeco(s, d.k, new T.Vector3().fromArray(d.p), new T.Vector3().fromArray(d.n), false)
  for (const v of saved.vis) addVisitor(s, v.k, new T.Vector3().fromArray(v.p), v.ry, false)
  buildBulbs(s)
  buildCars(s)
  setNight(s, saved.night)
  return s
}

const decoSize = (s: State) => Math.min(0.6, Math.max(0.3, s.m.h * 0.18))
const visSize = (s: State) => Math.min(0.42, Math.max(0.22, s.m.h * 0.12))

function addDeco(s: State, k: DecoKind, p: V3, n: V3, record = true) {
  const g = makeDeco(s.T, k, decoSize(s))
  g.position.copy(p)
  // Drapeau et ballon : debout ; le reste se colle à la surface, face à nous
  if (k === 'noeud' || k === 'etoile' || k === 'coeur') {
    const flat = n.y > 0.7
    if (flat) g.rotation.y = s.rot
    else g.quaternion.setFromUnitVectors(new s.T.Vector3(0, 0, 1), n.clone().setY(0).normalize())
  }
  g.traverse(o => { o.castShadow = true })
  s.m.obj.add(g)
  s.decos.push({ k, g })
  if (record) { s.saved.deco.push({ k, p: p.toArray().map(x => +x.toFixed(3)), n: n.toArray().map(x => +x.toFixed(3)) }); save(s) }
}
function addVisitor(s: State, k: CritterKind, p: V3, ry: number, record = true) {
  const g = new s.T.Group()
  const c = s.ck.make(k, visSize(s))
  c.obj.traverse(o => { o.castShadow = true })
  g.add(c.obj)
  g.position.copy(p); g.rotation.y = ry
  g.userData.vis = k
  s.m.obj.add(g)
  s.visitors.push({ k, g, ph: Math.random() * 3 })
  if (record) { s.saved.vis.push({ k, p: p.toArray().map(x => +x.toFixed(3)), ry: +ry.toFixed(2) }); save(s) }
}

/** Ce que touche le doigt : une déco, un visiteur, le monument (sa matière), le sol. */
function hitScene(s: State, cx: number, cy: number) {
  const ray = rayAt(s, cx, cy)
  const placed = s.m.pieces.slice(0, s.saved.built).map(p => p.obj)
  const hits = ray.intersectObjects([...s.decos.map(d => d.g), ...s.visitors.map(v => v.g), ...placed, s.dayG], true)
  for (const h of hits) {
    let o: Obj | null = h.object
    while (o) {
      if (o.userData.deco) return { type: 'deco' as const, obj: o, h }
      if (o.userData.vis) return { type: 'vis' as const, obj: o, h }
      if (o.userData.water) return { type: 'water' as const, obj: o, h }
      if (o === s.dayG) return { type: 'ground' as const, obj: o, h }
      if (placed.includes(o as import('three').Group)) return { type: 'mon' as const, obj: o, h }
      o = o.parent
    }
  }
  return null
}

/** Un point du monument à l'écran que le doigt toucherait vraiment : pas le vide entre deux câbles
    du pont, ni entre deux poutres de la Tour Eiffel (on tourne en spirale autour de son milieu). */
function monSpot(s: State) {
  const at = (y: number) => scr(s, s.m.obj.localToWorld(new s.T.Vector3(0, y, 0)))
  const c = at(s.m.h * 0.45), span = Math.max(40, Math.abs(at(0).y - at(s.m.h).y))
  for (let r = 0; r <= 8; r++) {
    const n = Math.max(1, r * 6)
    for (let a = 0; a < n; a++) {
      const an = a / n * Math.PI * 2, x = c.x + Math.cos(an) * r * span * 0.06, y = c.y + Math.sin(an) * r * span * 0.06
      if (hitScene(s, x, y)?.type === 'mon') return { x, y }
    }
  }
  return c
}

/* ---------- Les vignettes (rendues une fois, en 3D) ---------- */

async function monumentThumbs(px: number) {
  if (MONUMENTS.every(id => thumbs['m-' + id])) return
  await withRenderer(px, Math.round(px * 0.75), async (T, r, env) => {
    const kit = await monumentKit(T)
    r.setClearColor('#BFE6F7', 1)
    for (const id of MONUMENTS) {
      const m = kit.build(id)
      const sc = new T.Scene(); sc.environment = env; sc.environmentIntensity = 0.6
      sc.background = new T.Color('#BFE6F7')
      sc.add(new T.HemisphereLight('#E8F6FF', '#8CCB6A', 0.6))
      const sun = new T.DirectionalLight('#FFF1D0', 2.4); sun.position.set(3, 6, 5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024)
      const sc2 = sun.shadow.camera as import('three').OrthographicCamera; sc2.left = sc2.bottom = -4; sc2.right = sc2.top = 4
      sc.add(sun)
      const ground = new T.Mesh(new T.CircleGeometry(m.w * 1.4 + 1, 48), new T.MeshStandardMaterial({ color: id === 'pyramide' ? '#E8CC8C' : id === 'goldengate' ? '#5FA8D8' : '#8CCB6A', roughness: 1 }))
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; sc.add(ground)
      sc.add(m.obj)
      const box = new T.Box3().setFromObject(m.obj), size = box.getSize(new T.Vector3()), ctr = box.getCenter(new T.Vector3())
      const fit = Math.max(size.y * 1.2, Math.max(size.x, size.z) * 1.05 / (4 / 3)) / 2 / Math.tan(15 * Math.PI / 180)
      const D = fit + Math.max(size.x, size.z) * 0.5
      const cam = new T.PerspectiveCamera(30, 4 / 3, 0.05, 100)
      cam.position.copy(ctr).addScaledVector(new T.Vector3(0.42, 0.32, 0.85).normalize(), D); cam.lookAt(ctr.x, ctr.y - size.y * 0.04, ctr.z)
      r.render(sc, cam)
      thumbs['m-' + id] = r.domElement.toDataURL('image/jpeg', 0.85)
      ground.geometry.dispose(); (ground.material as import('three').Material).dispose()
      m.dispose()
    }
    kit.dispose()
  }).catch(() => { /* sans vignettes : les dessins */ })
}
async function paletteThumbs(px: number) {
  if (thumbs['d-drapeau']) return
  await withRenderer(px, px, async (T, r, env) => {
    for (const [k] of DECOS) {
      const sc = new T.Scene(); sc.environment = env; sc.environmentIntensity = 0.6
      sc.add(new T.HemisphereLight('#FFF4E6', '#C8A88E', 0.5))
      const sun = new T.DirectionalLight('#FFF1DC', 1.8); sun.position.set(-1.5, 3, 3); sc.add(sun)
      const g = makeDeco(T, k, 1); sc.add(g)
      const box = new T.Box3().setFromObject(g), c = box.getCenter(new T.Vector3()), rad = box.getSize(new T.Vector3()).length() / 2
      const cam = new T.PerspectiveCamera(30, 1, 0.01, 50)
      cam.position.copy(c).add(new T.Vector3(0.25, 0.15, 1).normalize().multiplyScalar(rad / Math.sin(15 * Math.PI / 180) * 0.85)); cam.lookAt(c)
      r.render(sc, cam)
      thumbs['d-' + k] = r.domElement.toDataURL('image/png')
      disposeTree(g)
    }
  }).catch(() => { /* des pastilles */ })
  const crit = await critterPortraits(VISITORS, px).catch(() => ({} as Record<string, string>))
  for (const [k, v] of Object.entries(crit)) thumbs['v-' + k] = v
}

/* ---------- Les icônes ---------- */

const svg = (inner: string, sz = 34) => `<svg viewBox="0 0 48 48" width="${sz}" height="${sz}">${inner}</svg>`
const STEP_ICON: Record<Step, string> = {
  construire: svg('<rect x="22" y="6" width="5" height="34" fill="#F2B632"/><rect x="8" y="9" width="34" height="5" fill="#F2B632"/><path d="M36 14v9" stroke="#5A4A3A" stroke-width="2"/><rect x="31" y="23" width="10" height="7" rx="1.5" fill="#E8546F"/><rect x="14" y="38" width="22" height="5" rx="2" fill="#8A6A4A"/>'),
  peindre: svg('<path d="M30 6l12 12-14 14-12-12z" fill="#B197FC"/><path d="M16 20l12 12-4 4c-2 2-6 2-8 0l-4-4c-2-2-2-6 0-8z" fill="#8A6A4A"/><path d="M12 36c-3 3-4 6-6 6 0-2 2-5 6-6z" fill="#FF6B81"/>'),
  lumieres: svg('<path d="M4 14c10 8 30 8 40 0" fill="none" stroke="#5A4A3A" stroke-width="2"/>' + [8, 16, 24, 32, 40].map((x, i) => `<circle cx="${x}" cy="${14 + Math.sin(i / 4 * Math.PI) * 6 + 4}" r="4" fill="${RAINBOW[i]}"/>`).join('')),
  deco: svg('<path d="M12 6v36" stroke="#8A6A4A" stroke-width="3" stroke-linecap="round"/><path d="M13 8h24l-6 7 6 7H13z" fill="#FF6B81"/><circle cx="34" cy="34" r="7" fill="#FFC94D"/>'),
  visiteurs: svg('<circle cx="24" cy="26" r="13" fill="#F6A9C0"/><ellipse cx="24" cy="30" rx="6" ry="4.5" fill="#E8869F"/><circle cx="21.5" cy="30" r="1.3" fill="#7A3A4A"/><circle cx="26.5" cy="30" r="1.3" fill="#7A3A4A"/><circle cx="19" cy="22" r="1.8" fill="#3A2A2A"/><circle cx="29" cy="22" r="1.8" fill="#3A2A2A"/><path d="M13 16l4-6 4 5zM35 16l-4-6-4 5z" fill="#E8869F"/>')
}
const FINI_ICON = svg('<circle cx="24" cy="24" r="18" fill="#5EC97B"/><path d="m15 24.5 6 6L33.5 18" fill="none" stroke="#fff" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>')
const SUN_ICON = svg('<circle cx="24" cy="24" r="9" fill="#FFC94D"/>' + Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return `<path d="M${24 + Math.cos(a) * 13} ${24 + Math.sin(a) * 13}L${24 + Math.cos(a) * 19} ${24 + Math.sin(a) * 19}" stroke="#FFC94D" stroke-width="3.4" stroke-linecap="round"/>` }).join(''))
const MOON_ICON = svg('<path d="M30 8a17 17 0 1 0 10 28A14 14 0 0 1 30 8z" fill="#5B6FA8"/><circle cx="36" cy="12" r="2" fill="#FFD34D"/><circle cx="41" cy="22" r="1.4" fill="#FFD34D"/>')

/* ---------- Le jeu ---------- */

/** Le geste à montrer pour la pièce en route : de la pièce à sa place, ou le long du câble. */
function pieceGesture(s: State): HandMove | null {
  if (s.trace) {
    if (s.trace.prog >= 1) return null
    const path = s.m.pieces[s.saved.built].trace!, par = s.info[s.saved.built].parent
    return { trace: [0, 10, 20, 30, 40, 50, 60, 70, 80].map(i => scr(s, par.localToWorld(path[i].clone()))) }
  }
  const c = s.cur
  if (!c || c.drag || c.fly || c.pop < 1) return null
  return { drag: [scr(s, c.pos), scr(s, worldOf(s, c.i))] }
}
/** Le chemin du câble à l'écran (le pointillé à suivre). */
function tracePts(s: State) {
  const path = s.m.pieces[s.saved.built]?.trace
  if (!path) return null
  const par = s.info[s.saved.built].parent
  return path.map(p => scr(s, par.localToWorld(p.clone())))
}

export const monuments: GameDef = {
  id: 'monuments', name: 'Les Monuments', icon: '🗼', sq: 'sq-sky', cat: 'creatif', noTier: true,
  subtitle: 'Construis les monuments du monde, et fais-les briller',
  hand: (root): HandMove | null => {
    const wrap = root.querySelector('.mn-wrap')
    if (!wrap) return null
    if (wrap.getAttribute('data-who') === '') return { choose: visible(root, '.mn-card') }
    if (wrap.getAttribute('data-mon') === '') return { choose: visible(root, '.mn-mcard').slice(0, 4) }
    const s = me
    if (!s || s.phase !== 'make') return null
    if (s.saved.built < s.m.pieces.length) return pieceGesture(s)
    if (s.step === 'peindre') return { tap: monSpot(s) }
    if (s.step === 'deco' || s.step === 'visiteurs') return { tap: scr(s, new s.T.Vector3(s.m.w * 0.3, 0, 0.9)) }
    return { choose: visible(root, '.mn-opt').slice(0, 4) }
  },
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="arena g3-arena mn-wrap" id="mnWrap" data-who="" data-mon="" data-step="construire" data-built="0">
        ${whoCards('mn', true)}
        <div class="mn-grid" id="mnGrid"></div>
        <div class="mn-steps">${STEPS.map(st => `<span class="tool-item"><button class="sn-tool mn-step${st === 'construire' ? ' sel' : ''}" data-step="${st}" aria-label="${STEP_NAME[st]}">${STEP_ICON[st]}</button><i class="tool-cap">${STEP_NAME[st]}</i></span>`).join('')}<span class="tool-item"><button class="sn-tool mn-fini" id="mnFini" aria-label="Fini">${FINI_ICON}</button><i class="tool-cap">Fini</i></span></div>
        <span class="tool-item mn-back"><button class="sn-tool" id="mnBack" aria-label="Les monuments">${ICON.choices}</button><i class="tool-cap">Monuments</i></span>
        ${trashButton('mnReset', 'mn-reset', 'Effacer le monument')}
        <div class="mn-pal" id="mnPal"></div>
        <svg class="mn-guide" id="mnGuide" aria-hidden="true"><path id="mnGuidePath" d=""/></svg>
      </div>`
    const arena = c.root.querySelector<HTMLElement>('#mnWrap')!
    preloadSfx(['chop', 'tick', 'pluck', 'select', 'confirm', 'drop', 'cloth', 'whoosh'])

    const opt = (attrs: string, icon: string, cap: string, sel: boolean, big = false) =>
      `<span class="tool-item"><button class="sn-tool mn-opt${big ? ' big' : ''}${sel ? ' sel' : ''}" ${attrs} aria-label="${cap}">${icon}</button><i class="tool-cap">${cap}</i></span>`
    const img = (id: string, fb: string) => thumbs[id] ? `<img src="${thumbs[id]}" alt="" draggable="false">` : fb
    const dot = (col: string) => `<span class="mn-dot" style="background:${col}"></span>`
    const sep = '<i class="mn-sep"></i>'
    const showPal = () => {
      const s = me, pal = c.root.querySelector<HTMLElement>('#mnPal')!
      if (!s || s.saved.built < s.m.pieces.length) { pal.innerHTML = ''; arena.setAttribute('data-pal', '0'); return }
      if (s.step === 'peindre') pal.innerHTML = COLORS.map(([col, n]) => opt(`data-color="${col}"`, dot(col), n, s.color === col)).join('') + sep + opt('data-color="origine"', dot('conic-gradient(#C9B07A,#7A5E48,#F4F1EA,#C2412D,#C9B07A)'), 'Comme avant', s.color === 'origine')
      else if (s.step === 'lumieres') pal.innerHTML = LIGHTS.map(([l, n, col]) => opt(`data-light="${l}"`, dot(l === 'arc' ? `conic-gradient(${RAINBOW.join(',')},${RAINBOW[0]})` : col), n, s.saved.lights === l)).join('') + sep +
        opt('data-night="0"', SUN_ICON, 'Jour', !s.night) + opt('data-night="1"', MOON_ICON, 'Nuit', s.night)
      else if (s.step === 'deco') pal.innerHTML = DECOS.map(([k, n]) => opt(`data-deco="${k}"`, img('d-' + k, dot('#FF6B81')), n, s.deco === k, true)).join('')
      else if (s.step === 'visiteurs') pal.innerHTML = VISITORS.map(k => opt(`data-vis="${k}"`, img('v-' + k, dot('#F6A9C0')), VIS_NAME[k] ?? k, s.vis === k, true)).join('')
      else pal.innerHTML = ''
      arena.setAttribute('data-pal', pal.innerHTML ? '1' : '0')
    }
    const setStep = (st: Step) => {
      const s = me
      if (!s || s.phase !== 'make') return
      if (st !== 'construire' && s.saved.built < s.m.pieces.length) return
      s.step = st
      arena.setAttribute('data-step', st)
      c.root.querySelectorAll<HTMLElement>('.mn-step').forEach(b => b.classList.toggle('sel', b.dataset.step === st))
      showPal()
    }
    setStepRef = setStep

    /* Les cartes des filles, puis les monuments */
    const showWho = () => paintCards(arena, box)
    showWho()
    const showGrid = () => {
      const grid = c.root.querySelector<HTMLElement>('#mnGrid')!
      grid.innerHTML = `${meButton('mnMe', 'mn-me', 'Changer', who)}
        <div class="mn-cards">${MONUMENTS.map(id => {
          const src = box.photo(who, id) ?? thumbs['m-' + id] ?? null
          return `<span class="tool-item"><button class="mn-mcard" data-mon="${id}" aria-label="${MONUMENT_NAME[id]}">${src ? `<img src="${src}" alt="" draggable="false">` : `<span class="mn-empty">${BADGE.monuments || ''}</span>`}</button><i class="tool-cap">${MONUMENT_NAME[id]}</i></span>`
        }).join('')}</div>`
    }
    // « Changer » de la grille est à la place du retour « Monuments » : le second toucher d'un double toucher n'y appuie pas
    const quiet = calm()
    const toGrid = () => {
      quiet.mark()
      arena.setAttribute('data-mon', '')
      showGrid()
      if (!(window as unknown as { __BOT?: boolean }).__BOT) monumentThumbs(320).then(() => { if (!dead && arena.getAttribute('data-mon') === '') showGrid() })
    }
    const chooseWho = (w: Who) => {
      who = w
      box.setLast(w)
      arena.setAttribute('data-who', w)
      sfx('confirm', { vol: 0.5 })
      toGrid()
    }
    let hideLoader = () => { /* rien */ }
    let starting = false
    const open = async (id: MonumentId) => {
      if (me || starting) return
      starting = true
      sfx('confirm', { vol: 0.5 })
      arena.setAttribute('data-mon', id)
      arena.setAttribute('data-phase', '')
      hideLoader = loader(arena, 'monuments')
      const saved = loadSaved(who, id)
      const s = await build(c, arena, id, saved).catch(e => { console.error(e); return null })
      starting = false
      hideLoader()
      if (!s || dead) { if (s) leave(s, false); else if (!dead) { c.toast('La 3D n\'est pas disponible ici'); toGrid() } return }
      me = s
      arena.setAttribute('data-built', s.saved.built >= s.m.pieces.length ? '1' : '0')
      s.step = 'construire'
      setStep(s.saved.built >= s.m.pieces.length ? 'peindre' : 'construire')
      nextPiece(s)
      s.stage.start(dt => { if (me === s) { frame(s, dt); drawGuide(s) } })
      if (!(window as unknown as { __BOT?: boolean }).__BOT) paletteThumbs(96).then(() => { if (!dead) showPal() })
      ctx.after(600, () => { if (me === s) handNow() })
    }
    /** On quitte le monument : gardé, photographié, libéré. */
    const leave = (s: State, photo = true) => {
      if (photo && s.phase === 'make') snap(s)
      box.write(who, bookWith(who, s.id, JSON.parse(JSON.stringify(s.saved)) as Saved))
      pts.clear()
      if (me === s) me = null
      for (const d of s.decos) disposeTree(d.g)
      for (const c of s.cars) disposeTree(c.g)
      if (s.bulbs) { s.bulbs.geometry.dispose(); (s.bulbs.material as import('three').Material).dispose() }
      s.ck.dispose(); s.m.dispose(); s.kit.dispose()
      try { s.stage.dispose() } catch { /* déjà démonté */ }
    }
    /** Le pointillé du câble à tracer. */
    const guide = c.root.querySelector<SVGSVGElement>('#mnGuide')!, gpath = c.root.querySelector<SVGPathElement>('#mnGuidePath')!
    let guideOn = false
    const drawGuide = (s: State) => {
      const on = !!s.trace && s.trace.prog < 1
      if (on !== guideOn) { guideOn = on; guide.classList.toggle('on', on) }
      if (!on) return
      const r = arena.getBoundingClientRect(), pts = tracePts(s)!
      guide.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`)
      gpath.setAttribute('d', pts.map((p, i) => `${i ? 'L' : 'M'}${(p.x - r.left).toFixed(1)} ${(p.y - r.top).toFixed(1)}`).join(''))
    }

    // Les boutons
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      const card = t.closest<HTMLElement>('.mn-card')
      if (card?.dataset.who) { chooseWho(card.dataset.who as Who); return }
      if (t.closest('#mnMe')) { if (quiet.quiet()) return; arena.setAttribute('data-who', ''); showWho(); sfx('select', { vol: 0.4 }); return }
      const mc = t.closest<HTMLElement>('.mn-mcard')
      if (mc?.dataset.mon) { open(mc.dataset.mon as MonumentId); return }
      const s = me
      if (!s) return
      if (!t.closest('#mnReset')) trash.disarm()
      if (t.closest('#mnReset')) { if (s.phase === 'make') trash.tap(); return }
      if (t.closest('#mnBack')) { if (s.phase === 'make') { leave(s); toGrid(); sfx('select', { vol: 0.4 }) } return }
      if (t.closest('#mnFini')) { startOutro(s); return }
      const stepB = t.closest<HTMLElement>('.mn-step')
      if (stepB?.dataset.step) { setStep(stepB.dataset.step as Step); sfx('select', { vol: 0.5 }); return }
      const o = t.closest<HTMLElement>('.mn-opt')
      if (!o || s.phase !== 'make') return
      const d = o.dataset
      if (d.color) s.color = d.color
      else if (d.light) {
        s.saved.lights = d.light as Lights
        buildBulbs(s); setNight(s, s.night); save(s)
        if (d.light !== 'off') sfx('pluck', { vol: 0.5, rate: 1.5 })
      } else if (d.night) { s.saved.night = d.night === '1'; setNight(s, s.saved.night); save(s); sfx('whoosh', { vol: 0.4 }) }
      else if (d.deco) s.deco = d.deco as DecoKind
      else if (d.vis) { s.vis = d.vis as CritterKind; const v = CRY[s.vis]; if (v) cry(v, { vol: 0.5, max: 1.2, solo: true }) }
      sfx('select', { vol: 0.4 })
      showPal()
    }
    c.root.addEventListener('click', onClick)
    /* La poubelle (27/10) : deux touchers, et le monument ouvert redevient tel
       qu'au premier jour — rien de posé, sa photo oubliée ; on le rouvre neuf */
    const trash = twoTaps(c.root.querySelector<HTMLElement>('#mnReset')!, c, () => {
      const s = me
      if (!s || s.phase !== 'make') return
      const id = s.id
      sfx('whoosh', { vol: 0.6, rate: 0.8 })
      s.saved = fresh()
      leave(s, false)
      box.dropPhoto(who, id)
      open(id)
    })

    // Le doigt : glisser la pièce, tracer le câble, toucher le monument, ou tourner autour
    const pts = new Fingers<{ kind: 'piece' | 'trace' | 'turn' }>()
    const spin = new Spinner({ max: 3, sign: -1, perPx: () => me ? perWidth(me.stage.renderer.domElement, 160, 0.5)() : 0 })
    const onDown = (e: PointerEvent) => {
      const s = me
      if (!s || e.target !== s.stage.renderer.domElement) return
      // Un toucher passe la fin — pas le second d'un double toucher sur « Fini » (la première seconde)
      if (s.phase === 'outro') { if (s.outroT >= 1) endGame(s); return }
      if (s.phase !== 'make') return
      let kind: 'piece' | 'trace' | 'turn' = 'turn'
      const cur = s.cur
      if (cur && !cur.fly && !cur.drag && cur.pop >= 1) {
        // La pièce : sous le doigt, ou tout près (une enfant ne vise pas au pixel)
        const sp = scr(s, s.info[cur.i].parent.localToWorld(s.info[cur.i].c.clone().multiplyScalar(cur.s).add(s.m.pieces[cur.i].obj.position)))
        const r = s.stage.renderer.domElement.getBoundingClientRect()
        const hitR = Math.max(0.1 * Math.min(r.width, r.height), 0.5 * cur.s * s.info[cur.i].size / (2 * Math.tan(s.stage.camera.fov * Math.PI / 360) * s.stage.camera.position.distanceTo(cur.pos)) * r.height)
        if (Math.hypot(sp.x - e.clientX, sp.y - e.clientY) < hitR) {
          const w = rayAt(s, e.clientX, e.clientY).ray.intersectPlane(dragPlane(s, worldOf(s, cur.i)), new s.T.Vector3())
          const center = s.info[cur.i].parent.localToWorld(s.info[cur.i].c.clone().multiplyScalar(cur.s).add(s.m.pieces[cur.i].obj.position))
          cur.drag = { id: e.pointerId, off: w ? center.clone().sub(w) : new s.T.Vector3() }
          kind = 'piece'
          sfx('whoosh', { vol: 0.35, rate: 1.3 })
        }
      } else if (s.trace && s.trace.prog < 1 && s.trace.id === null) {
        const tp = tracePts(s)!
        const d0 = Math.hypot(tp[0].x - e.clientX, tp[0].y - e.clientY), d1 = Math.hypot(tp[tp.length - 1].x - e.clientX, tp[tp.length - 1].y - e.clientY)
        const near = 0.12 * Math.min(window.innerWidth, window.innerHeight)
        if (Math.min(d0, d1) < near || s.trace.dir !== 0) {
          if (s.trace.dir === 0) s.trace.dir = d0 <= d1 ? 1 : -1
          s.trace.id = e.pointerId
          kind = 'trace'
        }
      }
      pts.down(e, { kind })
      if (kind === 'turn') spin.start(s)
    }
    const onMove = (e: PointerEvent) => {
      const s = me, m = s ? pts.move(e) : null
      if (!s || !m) return
      const { f: p, dx } = m
      if (p.kind === 'piece' && s.cur?.drag?.id === e.pointerId) {
        const cur = s.cur, tgt = worldOf(s, cur.i)
        const w = rayAt(s, e.clientX, e.clientY).ray.intersectPlane(dragPlane(s, tgt), new s.T.Vector3())
        if (!w) return
        w.add(cur.drag!.off.multiplyScalar(0.92))
        const far = Math.max(0.5, cur.pos.distanceTo(tgt))
        cur.s = cur.s0 + (1 - cur.s0) * Math.max(0, Math.min(1, 1 - w.distanceTo(tgt) / far))
        putPiece(s, cur.i, w, cur.s)
        return
      }
      if (p.kind === 'trace' && s.trace && s.trace.id === e.pointerId) {
        // Le doigt avance le long du câble : on garde le point du chemin le plus proche, un peu plus loin que là où on en est
        const tp = tracePts(s)!, n = tp.length - 1, tr = s.trace
        const at = Math.round(tr.prog * n)
        let best = -1, bd = 0.09 * Math.min(window.innerWidth, window.innerHeight)
        for (let k = 0; k <= 10; k++) {
          const j = at + k
          if (j > n) break
          const q = tp[tr.dir === 1 ? j : n - j], d = Math.hypot(q.x - e.clientX, q.y - e.clientY)
          if (d < bd) { bd = d; best = j }
        }
        if (best > at) {
          tr.prog = Math.min(1, best / n)
          if (tr.prog > 0.94) tr.prog = 1
          const piece = s.m.pieces[s.saved.built].obj
          piece.traverse(o => {
            const mm = o as import('three').Mesh
            if (!mm.isMesh || (o as import('three').InstancedMesh).isInstancedMesh) return
            const idx = mm.geometry.index!.count, k2 = Math.floor(idx * tr.prog / 6) * 6
            if (tr.dir === 1) mm.geometry.setDrawRange(0, k2); else mm.geometry.setDrawRange(idx - k2, k2)
          })
          if (Math.random() < 0.3) sfx('pluck', { vol: 0.2, rate: 0.8 + tr.prog })
          if (tr.prog >= 1) { sfx('confirm', { vol: 0.5 }); tr.id = null }
        }
        return
      }
      if (p.kind === 'turn') {
        // Le doigt qui reste après deux doigts ne fait rien
        if (p.multi) spin.hold(s)
        else spin.turn(s, dx)
      }
    }
    const onUp = (e: PointerEvent) => {
      const s = me, p = pts.up(e)
      if (!s || !p || s.phase !== 'make') return
      if (p.kind === 'piece' && s.cur?.drag?.id === e.pointerId) {
        const cur = s.cur, tgt = worldOf(s, cur.i)
        const now = s.info[cur.i].parent.localToWorld(s.info[cur.i].c.clone().multiplyScalar(cur.s).add(s.m.pieces[cur.i].obj.position))
        const a = scr(s, now), b = scr(s, tgt), r = s.stage.renderer.domElement.getBoundingClientRect()
        cur.drag = null
        const close = Math.hypot(a.x - b.x, a.y - b.y) < 0.17 * Math.min(r.width, r.height)
        cur.fly = { t: 0, from: now, fromS: cur.s, home: !close }
        if (!close) sfx('cloth', { vol: 0.35, rate: 0.9 })
        return
      }
      if (p.kind === 'trace') { if (s.trace) s.trace.id = null; return }
      spin.release(s)
      if (e.type === 'pointercancel' || p.moved >= 12 || p.multi || s.saved.built < s.m.pieces.length) return
      // Un toucher : peindre, poser une déco ou un visiteur, ou les reprendre
      const h = hitScene(s, e.clientX, e.clientY)
      if (!h) return
      if ((s.step === 'deco' && h.type === 'deco') || (s.step === 'visiteurs' && h.type === 'vis')) {
        const isDeco = h.type === 'deco'
        const arr = isDeco ? s.decos : s.visitors
        const i = arr.findIndex(x => x.g === h.obj)
        if (i >= 0) {
          s.m.obj.remove(arr[i].g)
          if (isDeco) { disposeTree(arr[i].g); s.saved.deco.splice(i, 1) } else s.saved.vis.splice(i, 1)
          arr.splice(i, 1)
          save(s)
          sfx('cloth', { vol: 0.5, rate: 1.3 })
        }
        return
      }
      const pt = h.h.point.clone(), wn = h.h.face ? h.h.face.normal.clone().transformDirection(h.h.object.matrixWorld) : new s.T.Vector3(0, 1, 0)
      const local = s.m.obj.worldToLocal(pt.clone())
      if (s.step === 'peindre' && h.type === 'mon') {
        const mm = h.h.object as import('three').Mesh
        const mat = (Array.isArray(mm.material) ? mm.material[h.h.face?.materialIndex ?? 0] : mm.material) as import('three').MeshStandardMaterial
        const i = s.paintMats.indexOf(mat)
        if (i < 0) return
        const col = s.color === 'origine' ? s.origin[i] : s.color
        mat.color.set(col)
        if (s.color === 'origine') delete s.saved.colors[i]; else s.saved.colors[i] = col
        save(s)
        sfx('pluck', { vol: 0.5, rate: 0.9 + Math.random() * 0.3 })
        s.fx.burst(pt, { count: 18, color: [col, '#FFFFFF'], speed: 0.9, spread: 1, life: 0.7, size: 0.05, gravity: 0.8 })
      } else if (s.step === 'deco' && (h.type === 'mon' || h.type === 'ground')) {
        if (s.decos.length >= MAX_DECO) return
        addDeco(s, s.deco, local, wn)
        sfx('drop', { vol: 0.6 })
        s.fx.burst(pt, { count: 12, color: ['#FFD34D', '#FFFFFF'], speed: 0.8, spread: 1, life: 0.6, size: 0.04, gravity: 0.6 })
      } else if (s.step === 'visiteurs' && (h.type === 'ground' || (h.type === 'mon' && wn.y > 0.6))) {
        if (s.visitors.length >= MAX_VIS) return
        // Tourné vers nous
        const camP = s.stage.camera.position
        addVisitor(s, s.vis, local, Math.atan2(camP.x - pt.x, camP.z - pt.z))
        const v = CRY[s.vis]
        if (v) cry(v, { vol: 0.6, max: 1.4, solo: true }); else sfx('pluck', { vol: 0.5 })
      } else if (h.type === 'water' && (s.step === 'deco' || s.step === 'visiteurs')) {
        // Le canard nage ; tout le reste fait plouf
        if (s.step === 'visiteurs' && s.vis === 'duck' && s.visitors.length < MAX_VIS) {
          const camP = s.stage.camera.position
          addVisitor(s, 'duck', local, Math.atan2(camP.x - pt.x, camP.z - pt.z))
          cry(CRY.duck!, { vol: 0.6, max: 1.4, solo: true })
        } else sfx('drop', { vol: 0.5, rate: 1.5 })
        s.fx.burst(pt, { count: 16, color: ['#BFE4F6', '#FFFFFF'], speed: 1.1, spread: 0.5, life: 0.6, size: 0.04, gravity: 2 })
      }
    }
    c.root.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __mn: unknown }).__mn = {
        get cards() { return arena.getAttribute('data-who') === '' },
        get grid() { return arena.getAttribute('data-mon') === '' && arena.getAttribute('data-who') !== '' },
        get ready() { return !!me },
        get step() { return me?.step },
        get phase() { return me?.phase },
        get built() { return me?.saved.built ?? 0 },
        get total() { return me?.m.pieces.length ?? 0 },
        /** La pièce en route : d'où la glisser, jusqu'où ; ou le câble à tracer (null : attendre). */
        piece() {
          const s = me
          if (!s) return null
          if (s.trace) return s.trace.prog < 1 ? { trace: tracePts(s) } : null
          const cur = s.cur
          if (!cur || cur.drag || cur.fly || cur.pop < 1) return null
          return { from: scr(s, s.info[cur.i].parent.localToWorld(s.info[cur.i].c.clone().multiplyScalar(cur.s).add(s.m.pieces[cur.i].obj.position))), to: scr(s, worldOf(s, cur.i)) }
        },
        /** Un point du monument (son repère) à l'écran. */
        pt(x: number, y: number, z: number) { return me ? scr(me, me.m.obj.localToWorld(new me.T.Vector3(x, y, z))) : null },
        /** Là où l'on reprend la déco n° i. */
        decoPt(i: number) { const d = me?.decos[i]; return d && me ? scr(me, d.g.localToWorld(new me.T.Vector3().fromArray(d.g.userData.grab as number[]))) : null },
        /** Un point du monument que le pinceau touche vraiment. */
        mon() { return me ? monSpot(me) : null },
        get h() { return me?.m.h ?? 0 },
        get w() { return me?.m.w ?? 0 },
        get saved() { return me ? JSON.parse(JSON.stringify(me.saved)) : null },
        speed(k: number) { if (me) me.stage.timeScale = k },
        /** L'affiche : la Tour Eiffel entière, rose, ses guirlandes, la nuit, des visiteurs. */
        demo() {
          const s = me
          if (!s) return
          s.cur = null; s.trace = null
          s.m.pieces.forEach(p => { p.obj.visible = true; p.obj.position.set(0, 0, 0); p.obj.scale.setScalar(1) })
          s.saved.built = s.m.pieces.length
          s.info.forEach(i => { i.ghost.visible = false })
          s.paintMats.forEach((q, i) => { if (!q.map) { q.color.set(i % 2 ? '#F07AA8' : '#E86FA0'); s.saved.colors[i] = '#' + q.color.getHexString() } })
          s.saved.lights = 'or'
          buildBulbs(s)
          s.saved.night = true
          setNight(s, true)
          addVisitor(s, 'cow', new s.T.Vector3(-1.1, 0, 0.9), 0.5)
          addVisitor(s, 'pig', new s.T.Vector3(1.2, 0, 1.0), -0.4)
          s.rot = 0.2
          buildCars(s)
          arena.setAttribute('data-built', '1')
        }
      }
    }

    return () => {
      if (dead) return
      dead = true
      setStepRef = null
      c.root.removeEventListener('click', onClick)
      c.root.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      const s = me
      if (s) leave(s)
      hideLoader()
    }
  }
}
