import type { GameContext, GameDef } from '../core/types'
import { $, shuffle } from '../core/utils'
import { impact } from '../core/impact'
import { sfx, preloadSfx } from '../core/sfx'
import { ICON } from '../core/icons'
import { tone } from '../core/audio'
import { createStage, loader, bumpyNormal, type Stage, type T3 } from '../core/three3d'
import { particles, camShake, type Particles, type CamShake } from '../core/scene3d'
import { critterKit, type Critter, type CritterKit } from '../core/critters'

/* Labyrinthe — trois façons de se perdre : le jour (classique), la nuit
   (on ne voit qu'autour du poussin), la glace (on glisse jusqu'au mur).

   Polish du 7/09 (phase 2, jeux 2D) :
   - plein écran : le plateau prend toute la hauteur, les modes sont une
     colonne d'icônes, les manches des pastilles — plus rien à lire ;
   - le doigt rapide ne décroche plus : la case visée est rejointe en
     suivant le couloir si elle est à moins de six pas (recherche courte,
     jamais un résolveur), sinon on avance vers elle et on cogne ;
   - un mur heurté se sent : petit choc, le poussin s'écrase, poussière ;
   - retrouver la poule, c'est une fête : câlin, cœurs, son de victoire ;
   - timers de partie (`ctx.after`), état typé, plus d'emoji.

   Refonte du 15/09 (« pas fun et plein de bugs de passe-muraille ») :
   - le poussin MARCHE : il suit le couloir case par case, avec un
     dandinement, au lieu de glisser en ligne droite d'une case à l'autre —
     c'est cette ligne droite qui traversait les coins, le « passe-muraille » ;
   - le poussin et la poule sont dessinés (SVG), plus la pastille ronde de la
     planche Kenney que les filles ont trouvée « digne d'un Minitel » ;
   - des graines à ramasser en chemin : les étoiles viennent des graines, pas
     du chronomètre ; il pépie en marchant, et les murs sont des haies.

   En 3D depuis le 23/09 (« des traits verts sur fond pâle ») : de VRAIES
   haies taillées, vues de haut et un peu de biais ; le poussin et sa maman
   poule sont les personnages 3D de la ferme (ceux de Tape-Trous), le
   poussin trottine en se dandinant et regarde où il va ; des graines dorées
   qui tournent sur elles-mêmes ; la nuit, une lanterne suit le poussin et
   le reste du jardin est noir ; sur la glace, le sol est un étang gelé et
   les haies ont de la neige sur le dos. La logique (génération, doigt qui
   suit le couloir, glisse sur la glace, graines) n'a pas changé. */

interface Cell { walls: boolean[] } // haut, droite, bas, gauche
type Mode = 'classic' | 'fog' | 'ice'

interface Scene3D {
  stage: Stage
  T: T3
  kit: CritterKit
  chick: Critter
  hen: Critter
  maze: import('three').Group | null
  grains: Map<string, import('three').Object3D>
  crumbs: import('three').InstancedMesh
  crumbN: number
  fx: Particles
  shake: CamShake
  lantern: import('three').PointLight
  hemi: import('three').HemisphereLight | null
  ground: import('three').Mesh
  groundMat: import('three').MeshStandardMaterial
  hedgeMat: import('three').MeshStandardMaterial
  snowMat: import('three').MeshStandardMaterial
  grainGeo: import('three').BufferGeometry
  grainMat: import('three').MeshStandardMaterial
  ray: import('three').Raycaster
  hug: number
  bumpT: number
  t: number
}

interface State {
  s3: Scene3D
  running: boolean
  ready: boolean
  mode: Mode
  sizes: number[]
  round: number
  grid: Cell[][]
  n: number
  px: number
  cell: number
  pos: { x: number; y: number }
  down: boolean
  swipe: { x: number; y: number } | null
  t0: number
  lastBump: number
  won: boolean
  /** Position VISIBLE du poussin (en cases, à virgule) et son chemin à suivre. */
  vis: { x: number; y: number }
  path: { x: number; y: number; fast?: boolean }[]
  /** Où regarde le poussin (angle autour de Y) */
  heading: number
  lastPeep: number
  /** Les graines restantes de la manche (clé « x:y »), et le compte. */
  grains: Set<string>
  grainsTotal: number
  grainsGot: number
}

let mz: State | null = null
let ctx: GameContext

const D = [[0, -1], [1, 0], [0, 1], [-1, 0]]
const MODES: { id: Mode; icon: string; factor: number; cap: string }[] = [
  { id: 'classic', icon: ICON.sun, factor: 1, cap: 'Jour' },
  { id: 'fog', icon: ICON.moon, factor: 1.6, cap: 'Nuit' },
  { id: 'ice', icon: ICON.snowflake, factor: 1.5, cap: 'Glace' }
]

function generate(n: number): Cell[][] {
  const g: Cell[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => ({ walls: [true, true, true, true] })))
  const seen = Array.from({ length: n }, () => Array(n).fill(false))
  const stack: [number, number][] = [[0, 0]]
  seen[0][0] = true
  const DD: [number, number, number, number][] = [[0, -1, 0, 2], [1, 0, 1, 3], [0, 1, 2, 0], [-1, 0, 3, 1]]
  while (stack.length) {
    const [x, y] = stack[stack.length - 1]
    const opts = shuffle([...DD]).filter(([dx, dy]) => {
      const nx = x + dx, ny = y + dy
      return nx >= 0 && ny >= 0 && nx < n && ny < n && !seen[ny][nx]
    })
    if (!opts.length) { stack.pop(); continue }
    const [dx, dy, w, ow] = opts[0]
    const nx = x + dx, ny = y + dy
    g[y][x].walls[w] = false
    g[ny][nx].walls[ow] = false
    seen[ny][nx] = true
    stack.push([nx, ny])
  }
  return g
}

function sizesFor(mode: Mode): number[] {
  if (mode === 'fog') return ctx.byTier([6, 7, 8], [9, 11, 13], [13, 15, 17])
  return ctx.byTier([5, 6, 7], [8, 10, 12], [12, 14, 16])
}

/* La glace ne permet pas de s'arrêter en plein couloir : certaines grilles
   sont ingagnables en glissant. On vérifie par un parcours en « coups de
   glisse » que la sortie est atteignable (y compris en passant dessus). */
function iceSolvable(g: Cell[][], n: number): boolean {
  const seen = new Set(['0:0'])
  const stack: [number, number][] = [[0, 0]]
  while (stack.length) {
    const [x, y] = stack.pop()!
    if (x === n - 1 && y === n - 1) return true
    for (let d = 0; d < 4; d++) {
      let cx = x, cy = y
      while (!g[cy][cx].walls[d]) {
        cx += D[d][0]; cy += D[d][1]
        if (cx === n - 1 && cy === n - 1) return true
      }
      const k = cx + ':' + cy
      if ((cx !== x || cy !== y) && !seen.has(k)) { seen.add(k); stack.push([cx, cy]) }
    }
  }
  return false
}

/** Ouvre quelques murs intérieurs : la glace respire mieux et devient presque toujours gagnable. */
function braid(g: Cell[][], n: number, ratio: number) {
  const target = Math.floor(n * n * ratio)
  for (let k = 0; k < target; k++) {
    const x = 1 + Math.floor(Math.random() * (n - 2))
    const y = 1 + Math.floor(Math.random() * (n - 2))
    const d = Math.random() < 0.5 ? 1 : 2
    if (g[y][x].walls[d]) {
      g[y][x].walls[d] = false
      if (d === 1) g[y][x + 1].walls[3] = false
      else g[y + 1][x].walls[0] = false
    }
  }
}

function makeGrid(me: State, n: number): Cell[][] {
  if (me.mode !== 'ice') return generate(n)
  for (let attempt = 0; attempt < 80; attempt++) {
    const g = generate(n)
    braid(g, n, 0.18)
    if (iceSolvable(g, n)) return g
  }
  for (let attempt = 0; attempt < 40; attempt++) {
    const g = generate(n)
    braid(g, n, 0.5)
    if (iceSolvable(g, n)) return g
  }
  return generate(n)
}

/* ---------- La scène 3D ---------- */
/** Case (x, y) → coordonnées monde : le labyrinthe est centré, une case = 1 */
const wx = (me: State, x: number) => x + 0.5 - me.n / 2
const wz = (me: State, y: number) => y + 0.5 - me.n / 2

/** La caméra cadre tout le labyrinthe, de haut et un peu de biais */
function frame(me: State) {
  const cam = me.s3.stage.camera
  const tan = Math.tan(cam.fov / 2 * Math.PI / 180)
  const need = me.n * 0.62 + 0.6
  const dist = Math.max(need / tan, need / (tan * cam.aspect * 0.86))
  cam.position.set(0.35, dist * 0.9, dist * 0.44)
  cam.lookAt(0.35, 0, 0.35)
}

/** Les haies, les graines, la poule : reconstruits à chaque manche */
function render(me: State) {
  const S3 = me.s3, { T, stage } = S3
  if (S3.maze) {
    stage.scene.remove(S3.maze)
    S3.maze.traverse(o => { const m = o as import('three').Mesh; if (m.isMesh && m.geometry !== S3.grainGeo) m.geometry.dispose() })
  }
  const g = new T.Group()
  const n = me.n
  // Chaque mur est une haie : un bloc taillé (instancié : un seul appel de dessin)
  const walls: [number, number, boolean][] = []   // centre x, centre z, horizontale ?
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = me.grid[y][x]
    if (c.walls[0]) walls.push([x + 0.5 - n / 2, y - n / 2, true])
    if (c.walls[3]) walls.push([x - n / 2, y + 0.5 - n / 2, false])
  }
  for (let k = 0; k < n; k++) { walls.push([k + 0.5 - n / 2, n / 2, true]); walls.push([n / 2, k + 0.5 - n / 2, false]) }
  const HT = 0.62, TH = 0.26
  const box = new T.BoxGeometry(1 + TH, HT, TH)
  box.translate(0, HT / 2, 0)
  const hedges = new T.InstancedMesh(box, S3.hedgeMat, walls.length)
  const cap = new T.BoxGeometry(1 + TH + 0.02, 0.06, TH + 0.04)
  cap.translate(0, HT + 0.02, 0)
  const snow = new T.InstancedMesh(cap, S3.snowMat, walls.length)
  const m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), one = new T.Vector3(1, 1, 1)
  walls.forEach(([x, z, h], i) => {
    q.setFromAxisAngle(up, h ? 0 : Math.PI / 2)
    m4.compose(new T.Vector3(x, 0, z), q, one)
    hedges.setMatrixAt(i, m4)
    snow.setMatrixAt(i, m4)
  })
  hedges.castShadow = true; hedges.receiveShadow = true
  snow.visible = me.mode === 'ice'
  g.add(hedges, snow)
  // Les graines : deux grains dorés qui tournent doucement
  S3.grains.clear()
  for (const k of me.grains) {
    const [gx, gy] = k.split(':').map(Number)
    const m = new T.Mesh(S3.grainGeo, S3.grainMat)
    m.position.set(wx(me, gx), 0.18, wz(me, gy))
    m.castShadow = true
    g.add(m)
    S3.grains.set(k, m)
  }
  stage.scene.add(g)
  S3.maze = g
  // La poule attend au bout, tournée vers le labyrinthe
  S3.hen.obj.position.set(wx(me, n - 1), 0, wz(me, n - 1))
  S3.hen.obj.rotation.y = Math.PI * 1.25
  S3.chick.obj.position.set(wx(me, 0), 0, wz(me, 0))
  S3.crumbN = 0
  S3.crumbs.count = 0
  S3.hug = 0
  applyMode(me)
  frame(me)
  paintDots(me)
}

/** Jour, nuit (une lanterne suit le poussin) ou glace (étang gelé, haies enneigées) */
function applyMode(me: State) {
  const S3 = me.s3, { stage } = S3
  const night = me.mode === 'fog', ice = me.mode === 'ice'
  stage.scene.background = new S3.T.Color(night ? '#0E1424' : ice ? '#CFE6F5' : '#BFE3F2')
  if (stage.sun) stage.sun.intensity = night ? 0.05 : 2.2
  if (S3.hemi) S3.hemi.intensity = night ? 0.03 : 0.32
  stage.scene.environmentIntensity = night ? 0.04 : 0.6
  S3.lantern.visible = night
  S3.groundMat.color.set(ice ? 0x9CC6E0 : 0x4C8538)
  S3.groundMat.roughness = ice ? 0.12 : 0.95
  S3.hedgeMat.color.set(ice ? 0x2F6444 : 0x24561F)
  if (S3.maze) S3.maze.children[1].visible = ice
}

/** Une trace de pas à la case quittée : le chemin parcouru se lit d'un œil */
function dropCrumb(me: State, x: number, y: number) {
  const S3 = me.s3
  const i = S3.crumbN % 120
  const m = new S3.T.Matrix4().makeTranslation(wx(me, x) + (Math.random() - 0.5) * 0.2, 0.012, wz(me, y) + (Math.random() - 0.5) * 0.2)
  S3.crumbs.setMatrixAt(i, m)
  S3.crumbN++
  S3.crumbs.count = Math.min(120, S3.crumbN)
  S3.crumbs.instanceMatrix.needsUpdate = true
}

/** Le poussin avance vers le prochain point de son chemin — case par case,
    donc jamais à travers un coin. */
function advance(me: State, dt: number) {
  if (!me.path.length) return
  const w = me.path[0]
  const speed = w.fast ? 26 : 13   // cases par seconde
  const dx = w.x - me.vis.x, dy = w.y - me.vis.y
  const dist = Math.hypot(dx, dy)
  const step = speed * dt
  if (dist > 0.01) me.heading = Math.atan2(dx, dy)
  if (dist <= step) {
    me.vis = { x: w.x, y: w.y }
    me.path.shift()
    arrived(me, w.x, w.y)
  } else {
    me.vis = { x: me.vis.x + dx / dist * step, y: me.vis.y + dy / dist * step }
  }
}

/** Le poussin pose la patte sur une case : graine, miette, pépiement. */
function arrived(me: State, x: number, y: number) {
  const k = `${x}:${y}`
  const S3 = me.s3
  if (me.grains.has(k)) {
    me.grains.delete(k)
    me.grainsGot++
    const m = S3.grains.get(k)
    if (m) {
      S3.fx.burst({ x: m.position.x, y: 0.25, z: m.position.z }, { count: 12, color: [0xFFE08A, 0xD9A72A, 0xFFFFFF], speed: 1.2, spread: 1, life: 0.6, size: 0.08, gravity: 2 })
      m.parent?.remove(m)
      S3.grains.delete(k)
    }
    sfx('pluck', { vol: 0.5, rate: 1 + me.grainsGot * 0.04 })
  }
  dropCrumb(me, x, y)
  const now = performance.now()
  if (now - me.lastPeep > 260) {
    me.lastPeep = now
    tone(1300 + Math.random() * 300, 0.045, 'square', 0.025)
  }
  if (!me.path.length && x === me.n - 1 && y === me.n - 1) roundWon(me)
}

/** Un pas logique : la position de jeu change tout de suite (le doigt peut
    continuer), et le poussin visible rattrape en marchant. */
function moveTo(me: State, x: number, y: number, fast = false) {
  if (me.won) return
  me.pos = { x, y }
  me.path.push({ x, y, fast })
  // Un doigt très rapide ne doit pas laisser le poussin dix cases derrière
  if (me.path.length > 8) { me.vis = { x: me.path[me.path.length - 6].x, y: me.path[me.path.length - 6].y }; me.path = me.path.slice(-5) }
}

/** Cogner un mur : ça se sent, mais pas plus de quatre fois par seconde. */
function bump(me: State, d: number) {
  const now = performance.now()
  if (now - me.lastBump < 250) return
  me.lastBump = now
  impact(0.25, { matter: 'bois', noShake: true })
  const S3 = me.s3
  S3.bumpT = 0.001
  S3.fx.burst({ x: wx(me, me.vis.x) + D[d][0] * 0.4, y: 0.3, z: wz(me, me.vis.y) + D[d][1] * 0.4 },
    { count: 8, color: [0x4B8A3A, 0x7CC25C, 0xB97F3F], speed: 0.8, spread: 1, life: 0.5, size: 0.07, gravity: 2 })
}

/** Les graines de la manche : quatre sur le chemin de la poule, une à l'écart. */
function sowGrains(me: State) {
  const n = me.n
  const key = (x: number, y: number) => y * n + x
  const prev = new Map<number, number>([[0, -1]])
  const queue = [[0, 0]]
  while (queue.length) {
    const [x, y] = queue.shift()!
    for (let d = 0; d < 4; d++) {
      if (me.grid[y][x].walls[d]) continue
      const nx = x + D[d][0], ny = y + D[d][1], k = key(nx, ny)
      if (!prev.has(k)) { prev.set(k, key(x, y)); queue.push([nx, ny]) }
    }
  }
  const path: number[] = []
  for (let k = key(n - 1, n - 1); k > 0; k = prev.get(k)!) path.unshift(k)
  path.pop()   // pas sur la poule
  me.grains = new Set()
  const onPath = shuffle(path).slice(0, Math.min(4, path.length))
  for (const k of onPath) me.grains.add(`${k % n}:${Math.floor(k / n)}`)
  const off = shuffle([...prev.keys()].filter(k => k > 0 && !path.includes(k) && k !== key(n - 1, n - 1)))
  if (off.length) me.grains.add(`${off[0] % n}:${Math.floor(off[0] / n)}`)
  me.grainsTotal += me.grains.size
}

const open = (me: State, x: number, y: number, d: number) => !me.grid[y][x].walls[d]

/** Un pas vers une case voisine, si le mur est ouvert ; sinon on cogne. */
function step(me: State, dx: number, dy: number): boolean {
  const { x, y } = me.pos
  const d = dy === -1 ? 0 : dx === 1 ? 1 : dy === 1 ? 2 : 3
  if (open(me, x, y, d)) { moveTo(me, x + dx, y + dy); return true }
  bump(me, d)
  return false
}

/** Le doigt : on rejoint la case visée en suivant le couloir, mais seulement
    si elle est à moins de six pas (une recherche courte, jamais un résolveur :
    le doigt doit rester près du poussin). Un doigt rapide qui saute un coin
    ne décroche plus. Si la case est hors de portée, on avance vers elle et on
    cogne le mur qui bloque. */
const REACH = 6
function walkTo(me: State, tx: number, ty: number) {
  const { x, y } = me.pos
  if (tx === x && ty === y) return
  // Recherche en largeur bornée depuis le poussin
  const key = (cx: number, cy: number) => cy * me.n + cx
  const prev = new Map<number, number>([[key(x, y), -1]])
  const queue: [number, number, number][] = [[x, y, 0]]
  let found = false
  while (queue.length && !found) {
    const [cx, cy, depth] = queue.shift()!
    if (depth >= REACH) continue
    for (let d = 0; d < 4; d++) {
      if (!open(me, cx, cy, d)) continue
      const nx = cx + D[d][0], ny = cy + D[d][1]
      const k = key(nx, ny)
      if (prev.has(k)) continue
      prev.set(k, key(cx, cy))
      if (nx === tx && ny === ty) { found = true; break }
      queue.push([nx, ny, depth + 1])
    }
  }
  if (found) {
    const path: number[] = []
    for (let k = key(tx, ty); k !== key(x, y); k = prev.get(k)!) path.unshift(k)
    for (const k of path) { moveTo(me, k % me.n, Math.floor(k / me.n)); if (me.won) return }
    return
  }
  // Hors de portée : un pas vers la cible, et on cogne ce qui bloque
  const dx = tx - x, dy = ty - y
  const first: [number, number] = Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]
  const second: [number, number] = first[0] ? [0, Math.sign(dy)] : [Math.sign(dx), 0]
  if (step(me, first[0], first[1])) return
  if (second[0] || second[1]) step(me, second[0], second[1])
}

function slide(me: State, d: number) {
  let { x, y } = me.pos
  let cells = 0
  let toGoal = false
  while (open(me, x, y, d)) {
    x += D[d][0]; y += D[d][1]; cells++
    if (x === me.n - 1 && y === me.n - 1) { toGoal = true; break }
  }
  if (!cells) { bump(me, d); return }
  sfx('whoosh', { vol: 0.4, rate: 1.2 })
  moveTo(me, x, y, true)
  // Le TOC contre le mur arrive quand le poussin s'arrête, pas avant
  if (!toGoal) {
    const ms = Math.min(0.55, 0.08 + cells * 0.05) * 1000
    ctx.after(ms, () => { if (mz === me) impact(0.35 + Math.min(0.35, cells * 0.06), { matter: 'glace', noShake: true }) })
  }
}

function roundWon(me: State) {
  if (me.won) return
  me.won = true
  sfx('confirm', { vol: 0.8, rate: 1.1 })
  const S3 = me.s3
  S3.hug = 0.001
  const p = S3.hen.obj.position
  S3.fx.burst({ x: p.x, y: 0.7, z: p.z }, { count: 22, color: [0xFF5A6E, 0xFFC533, 0xFFFFFF], speed: 1.6, spread: 1, life: 0.9, size: 0.11, gravity: 1 })
  me.round++
  paintDots(me)
  if (me.round < me.sizes.length) ctx.after(1100, () => { if (mz === me) newRound(me) })
  else ctx.after(1000, () => { if (mz === me) finish(me) })
}

function setMode(me: State, mode: Mode) {
  me.mode = mode
  me.sizes = sizesFor(mode)
  me.round = 0
  me.grainsTotal = 0; me.grainsGot = 0
  me.t0 = performance.now()
  document.querySelectorAll<HTMLElement>('.mz-tool').forEach(b => {
    const on = b.dataset.m === mode
    b.classList.toggle('sel', on)
    b.parentElement?.classList.toggle('sel', on)
  })
  newRound(me)
}

function newRound(me: State) {
  me.n = me.sizes[me.round]
  me.grid = makeGrid(me, me.n)
  me.pos = { x: 0, y: 0 }
  me.vis = { x: 0, y: 0 }
  me.path = []
  me.won = false
  sowGrains(me)
  render(me)
}

function paintDots(me: State) {
  $('mzDots').innerHTML = me.sizes.map((_, i) => `<i class="sn-dot${i < me.round ? ' on' : ''}"></i>`).join('')
}

function finish(me: State) {
  // Les étoiles viennent des graines ramassées, pas du chronomètre
  const r = me.grainsTotal ? me.grainsGot / me.grainsTotal : 1
  const stars = r >= 0.99 ? 3 : r >= 0.6 ? 2 : 1
  const names: Record<Mode, string> = { classic: '', fog: ' dans le noir', ice: ' sur la glace' }
  ctx.finish({
    title: 'Famille réunie !',
    msg: `Tu as traversé ${me.sizes.length} labyrinthes${names[me.mode]} et ramassé ${me.grainsGot} graine${me.grainsGot > 1 ? 's' : ''} sur ${me.grainsTotal}`,
    stars
  })
}

export const maze: GameDef = {
  id: 'maze', name: 'Labyrinthe', icon: '🌀', sq: 'sq-peach', cat: 'reflexion',
  subtitle: 'Classique, dans le noir… ou sur la glace !',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="arena g3-arena mz-wrap" id="mzWrap">
        <div class="mz-tools">
          ${MODES.map((m, i) => `<span class="tool-item${i === 0 ? ' sel' : ''}">
            <button class="sn-tool mz-tool${i === 0 ? ' sel' : ''}" data-m="${m.id}" aria-label="${m.cap}">${m.icon}</button>
            <i class="tool-cap">${m.cap}</i></span>`).join('')}
        </div>
        <div class="mz-dots" id="mzDots"></div>
      </div>`
    preloadSfx(['tick', 'confirm', 'whoosh', 'pluck', 'click'])
    const arena = $('mzWrap')
    const hideLoader = loader(arena, 'maze')
    const cleanups: (() => void)[] = []

    ;(async () => {
      const stage = await createStage(arena, {
        sky: '#BFE3F2', cam: [0, 12, 6], target: [0, 0, 0], fov: 40,
        hemi: ['#E6F4FF', '#5E7A40', 1],
        sun: { pos: [4, 12, 6], color: '#FFF3DE', intensity: 2.2, area: 11, far: 40 },
        fill: 0.35, exposure: 1
      })
      if (dead) { stage.dispose(); return }
      const T = stage.T
      const scene = stage.scene
      let hemi: import('three').HemisphereLight | null = null
      scene.traverse(o => { if ((o as import('three').HemisphereLight).isHemisphereLight) hemi = o as import('three').HemisphereLight })
      const groundMat = new T.MeshStandardMaterial({ color: 0x5E9A45, roughness: 0.95, normalMap: stage.keep(bumpyNormal(T, 6, 18)) })
      const ground = new T.Mesh(new T.PlaneGeometry(60, 60), groundMat)
      ground.rotation.x = -Math.PI / 2
      ground.receiveShadow = true
      scene.add(ground)
      // Une haie feuillue : couleur sombre (l'éclairage la remonte), relief de feuillage marqué
      const hedgeMat = new T.MeshStandardMaterial({ color: 0x24561F, roughness: 0.95, normalMap: stage.keep(bumpyNormal(T, 40, 4)), normalScale: new T.Vector2(2.2, 2.2) })
      const snowMat = new T.MeshStandardMaterial({ color: 0xF4F8FF, roughness: 0.8 })
      // Une graine : deux grains dorés
      const g1 = new T.SphereGeometry(0.07, 10, 8); g1.scale(0.7, 1, 0.7); g1.rotateZ(0.4); g1.translate(-0.05, 0, 0)
      const g2 = new T.SphereGeometry(0.07, 10, 8); g2.scale(0.7, 1, 0.7); g2.rotateZ(-0.4); g2.translate(0.05, 0.01, 0)
      const grainGeo = mergeTwo(T, g1, g2)
      const grainMat = new T.MeshStandardMaterial({ color: 0xC8901A, roughness: 0.35, metalness: 0.15, emissive: 0x3A2800 })
      const crumbs = new T.InstancedMesh(new T.CircleGeometry(0.05, 8).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x8A6A3A, transparent: true, opacity: 0.45 }), 120)
      crumbs.count = 0
      scene.add(crumbs)
      const kit = critterKit(T)
      const chick = kit.make('chick', 1)
      const hen = kit.make('hen', 1)
      const fit = (cr: Critter, h: number) => {
        const b = new T.Box3().setFromObject(cr.obj)
        cr.obj.scale.multiplyScalar(h / (b.max.y - b.min.y))
        cr.obj.traverse(o => { o.castShadow = true })
      }
      fit(chick, 0.82); fit(hen, 1.05)
      scene.add(chick.obj, hen.obj)
      const lantern = new T.PointLight(0xFFC46B, 7, 3.2, 1.6)
      lantern.visible = false
      scene.add(lantern)
      const me: State = {
        s3: {
          stage, T, kit, chick, hen, maze: null, grains: new Map(), crumbs, crumbN: 0, fx: particles(stage, 300),
          shake: camShake(stage), lantern, hemi, ground, groundMat, hedgeMat, snowMat, grainGeo, grainMat,
          ray: new T.Raycaster(), hug: 0, bumpT: 0, t: 0
        },
        running: true, ready: true, mode: 'classic', sizes: [], round: 0, grid: [], n: 0, px: 0, cell: 1,
        pos: { x: 0, y: 0 }, down: false, swipe: null, t0: performance.now(), lastBump: 0, won: false,
        vis: { x: 0, y: 0 }, path: [], heading: 0, lastPeep: 0, grains: new Set(), grainsTotal: 0, grainsGot: 0
      }
      mz = me
      hideLoader()

      document.querySelectorAll<HTMLElement>('.mz-tool').forEach(b => {
        b.onclick = () => { if (mz === me && me.ready) { sfx('click', { vol: 0.4 }); setMode(me, b.dataset.m as Mode) } }
      })
      // Le doigt → la case visée, par un rayon sur le sol (la vue est de biais)
      const ndc = new T.Vector2(), hit = new T.Vector3(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0)
      const cellAt = (e: PointerEvent) => {
        const r = stage.renderer.domElement.getBoundingClientRect()
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
        me.s3.ray.setFromCamera(ndc, stage.camera)
        if (!me.s3.ray.ray.intersectPlane(plane, hit)) return { tx: -1, ty: -1 }
        return { tx: Math.floor(hit.x + me.n / 2), ty: Math.floor(hit.z + me.n / 2) }
      }
      const onMove = (e: PointerEvent) => {
        if (mz !== me || !me.down || !me.ready || me.mode === 'ice') return
        const { tx, ty } = cellAt(e)
        if (tx >= 0 && ty >= 0 && tx < me.n && ty < me.n) walkTo(me, tx, ty)
      }
      const onDown = (e: PointerEvent) => {
        if (mz !== me) return
        me.down = true
        me.swipe = { x: e.clientX, y: e.clientY }
        onMove(e)
      }
      const onUp = (e: PointerEvent) => {
        if (mz !== me) return
        me.down = false
        if (me.mode === 'ice' && me.swipe && me.ready) {
          const dx = e.clientX - me.swipe.x, dy = e.clientY - me.swipe.y
          if (Math.abs(dx) + Math.abs(dy) > 24) slide(me, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0))
        }
        me.swipe = null
      }
      const onKey = (e: KeyboardEvent) => {
        if (mz !== me || !me.ready) return
        const dirs: Record<string, number> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 }
        if (!(e.key in dirs)) return
        e.preventDefault()
        const d = dirs[e.key]
        if (me.mode === 'ice') slide(me, d)
        else step(me, D[d][0], D[d][1])
      }
      const onResize = () => { if (mz === me) frame(me) }
      stage.renderer.domElement.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      window.addEventListener('keydown', onKey)
      window.addEventListener('resize', onResize)
      cleanups.push(() => {
        stage.renderer.domElement.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        window.removeEventListener('keydown', onKey)
        window.removeEventListener('resize', onResize)
      })

      // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __mz: unknown }).__mz = {
          get grid() { return me.grid.map(row => row.map(cc => cc.walls)) }, get n() { return me.n }, get pos() { return me.pos },
          get round() { return me.round }, get mode() { return me.mode },
          cellCenter: (x: number, y: number) => {
            const v = new T.Vector3(wx(me, x), 0, wz(me, y)).project(stage.camera)
            const r = stage.renderer.domElement.getBoundingClientRect()
            return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }
          }
        }
      }

      stage.start(dt => {
        if (mz !== me) return
        const S3 = me.s3
        S3.t += dt
        advance(me, dt)
        // Le poussin : il regarde où il va, se dandine en marchant, s'écrase sur un mur
        const ch = S3.chick.obj
        ch.position.x = wx(me, me.vis.x)
        ch.position.z = wz(me, me.vis.y)
        let dy = me.s3.chick.obj.rotation.y
        let target = me.heading
        while (target - dy > Math.PI) target -= Math.PI * 2
        while (target - dy < -Math.PI) target += Math.PI * 2
        dy += (target - dy) * Math.min(1, dt * 14)
        ch.rotation.y = dy
        const walking = me.path.length > 0
        ch.rotation.z = walking ? Math.sin(S3.t * 22) * 0.16 : 0
        ch.position.y = walking ? Math.abs(Math.sin(S3.t * 22)) * 0.06 : 0
        if (S3.bumpT > 0) {
          S3.bumpT += dt
          const k = Math.max(0, 1 - S3.bumpT / 0.25)
          ch.scale.setScalar(ch.userData.s0 ?? (ch.userData.s0 = ch.scale.x))
          ch.scale.y *= 1 - 0.3 * k; ch.scale.x *= 1 + 0.2 * k; ch.scale.z *= 1 + 0.2 * k
          if (S3.bumpT > 0.25) { S3.bumpT = 0; ch.scale.setScalar(ch.userData.s0) }
        }
        // La poule attend en picorant, et saute de joie quand le poussin arrive
        const hen2 = S3.hen.obj
        hen2.rotation.x = me.won ? 0 : Math.max(0, Math.sin(S3.t * 3)) * 0.25
        if (S3.hug > 0) {
          S3.hug += dt
          hen2.position.y = Math.abs(Math.sin(S3.hug * 9)) * 0.3 * Math.max(0, 1 - S3.hug / 1)
        } else hen2.position.y = 0
        S3.kit.blink(S3.chick, dt); S3.kit.blink(S3.hen, dt)
        // Les graines tournent et flottent un peu
        for (const m of S3.grains.values()) { m.rotation.y += dt * 1.6; m.position.y = 0.18 + Math.sin(S3.t * 3 + m.position.x) * 0.04 }
        // La lanterne de la nuit suit le poussin
        if (S3.lantern.visible) S3.lantern.position.set(ch.position.x, 1.1, ch.position.z + 0.2)
        S3.fx.update(dt)
      })

      cleanups.push(() => {
        S3dispose(me)
        delete (window as { __mz?: unknown }).__mz
      })
      stage.keep({ dispose() { cleanups.forEach(f => f()) } })
      setMode(me, 'classic')
    })().catch(() => { hideLoader(); ctx.toast('La 3D n\'est pas disponible ici') })

    return () => {
      dead = true
      const me = mz
      mz = null
      if (me) { me.running = false; try { me.s3.stage.dispose() } catch { /* déjà démonté */ } }
    }
  }
}

function S3dispose(me: State) {
  const S3 = me.s3
  S3.fx.dispose()
  S3.kit.dispose()
  S3.grainGeo.dispose()
}

/** Deux géométries en une (positions + normales), pour la graine */
function mergeTwo(T: T3, a: import('three').BufferGeometry, b: import('three').BufferGeometry) {
  const pos: number[] = [], nor: number[] = []
  for (const g0 of [a, b]) {
    const g = g0.index ? g0.toNonIndexed() : g0
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array)
    if (g !== g0) g.dispose()
    g0.dispose()
  }
  const out = new T.BufferGeometry()
  out.setAttribute('position', new T.Float32BufferAttribute(pos, 3))
  out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3))
  return out
}
