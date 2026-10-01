import type { GameContext, GameDef } from '../core/types'
import { shuffle } from '../core/utils'
import { sfx, preloadSfx } from '../core/sfx'
import { impact } from '../core/impact'
import { ICON } from '../core/icons'
import { photoUrl } from '../core/sprites'
import { createStage, loader, woodTex, type Stage, type T3 } from '../core/three3d'
import { particles, type Particles, toScreen } from '../core/scene3d'
import { some } from '../core/hand'
import { WORDS, SOUNDS, decoys, landing, reading, nameWord, paintOf, type Word, type SoundKey } from '../core/phonics'

/* Les Cubes de l'alphabet (30/09) — la Chasse aux lettres devenue un vrai
   jeu de lecture, pensé pour Jade qui apprend à lire au CP. Proposition
   validée par le père : « De vrais cubes en bois 3D sous la photo. Chaque
   cube posé dit son son (« mmm », « a »), puis la syllabe (« ma »), puis le
   mot. »

   Sur une table d'enfant peinte : la photo du mot debout dans son support,
   la réglette et ses cases dessous, et les cubes en vrac devant. Un cube
   porte un GRAPHÈME (« ch », « ou », « on » sont un seul cube, comme les
   étiquettes de la classe), en minuscule d'imprimerie — ce qu'elle lit dans
   ses livres —, voyelles en rouge, consonnes en bleu, lettres muettes en
   gris ; la capitale est sur les côtés, comme sur un vrai cube. On le
   touche ou on le glisse : il roule jusqu'à sa case et s'y pose, toc.
   La voix dit son SON (jamais son nom : « mmm », pas « èm » — la table des
   sons est dans `core/phonics.ts`), puis la syllabe quand elle est
   complète, et un arc se dessine dessous, comme au CP. Le mot fini se lit
   « comme un doigt qui lit » : chaque syllabe s'allume à son tour, puis le
   mot entier.

   Apprendre, donc aucune sanction : un mauvais cube revient doucement à sa
   place ; après deux essais sur une même case, le bon cube se met à luire.
   Le mot est montré (cubes fantômes dans les cases) et dit au début, puis
   s'efface. La photo et le haut-parleur redisent le mot, un cube posé
   redit son son : du contenu, jamais une consigne (règle 2). */

type V3 = import('three').Vector3
type Quat = import('three').Quaternion
type Mesh = import('three').Mesh
type Tex = import('three').Texture
type Std = import('three').MeshStandardMaterial
type Geo = import('three').BufferGeometry
type RBox = typeof import('three/examples/jsm/geometries/RoundedBoxGeometry.js').RoundedBoxGeometry

/* La peinture des lettres (sombre : l'éclairage et l'ACES la remontent) */
const PAINT = { vowel: '#B8261F', consonant: '#1B4592', mute: '#9A948B' } as const
/* Le hêtre clair des cubes, le noyer de la réglette et du support */
const BEECH = '#D2A26A'
const WALNUT = '#6E4527'
/* Élévation de la caméra (rad) : on voit la face avant ET le dessus des cubes */
const EL = 0.8

type CubeState = 'rain' | 'rest' | 'held' | 'fly' | 'placed' | 'back' | 'nope' | 'gone'
interface Cube {
  id: number
  t: string
  mesh: Mesh
  /** Ses matériaux à lui (la lueur est propre à chaque cube). */
  mats: Std[]
  home: V3
  yaw: number
  state: CubeState
  slot: number
  t0: number
  dur: number
  from: V3
  to: V3
  fromQ: Quat
  vy: number
  help: boolean
  lit: number
  litT: number
  hop: number
  squash: number
}
interface Look { face: Tex; side: Tex; bump: Tex }
interface Speech { text: string; ms: number; sound?: boolean; start?: () => void }
interface Hold { pid: number; c: Cube; x0: number; y0: number; drag: boolean }

interface State {
  running: boolean
  stage: Stage
  T: T3
  RB: RBox
  words: Word[]
  round: number
  word: Word
  pos: number
  /** Essais manqués sur la case en cours (la lueur s'allume à 2). */
  here: number
  mistakes: number
  lock: boolean
  peeking: boolean
  /** Fin du mot montré, en temps simulé (0 = rien en cours). */
  peekEnd: number
  gen: number
  /** Temps simulé (s) : toutes les animations s'y mesurent. */
  sim: number
  s: number
  cubes: Cube[]
  gone: Cube[]
  nextId: number
  looks: Map<string, Look>
  /** Ce qui attend que les cubes partis aient fini de s'effacer. */
  retired: { dispose(): void }[]
  plainTex: Tex
  trayTex: Tex
  slotTex: Tex
  geo: Geo | null
  /** La géométrie des cubes de la manche d'avant (encore à l'écran). */
  oldGeo: Geo | null
  /** La manche : réglette, cases, fantômes, arcs (reconstruits à chaque mot). */
  round3d: import('three').Group
  slotPos: V3[]
  slotMats: Std[]
  ghostMats: Std[]
  ghostFade: number
  ghosts: Mesh[]
  arcs: { mesh: Mesh; mat: Std; grow: number; flash: number; lit: number }[]
  trayTop: number
  trayFront: number
  card: import('three').Group
  photoMat: Std
  flip: number
  fx: Particles
  cam: { pos: V3; look: V3; tpos: V3; tlook: V3; snap: boolean }
  q: Speech[]
  qBusy: boolean
  said: string[]
  hold: Hold | null
  dragTo: V3
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  sayBtn: HTMLElement
  btnAt: string
}

let lg: State | null = null
let ctx: GameContext

const BOT = () => !!(window as unknown as { __BOT?: boolean }).__BOT

/* ---------- Les textures : le bois, les lettres ---------- */
function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return [c, c.getContext('2d')!]
}
function texOf(T: T3, c: HTMLCanvasElement, color = true) {
  const t = new T.CanvasTexture(c)
  if (color) t.colorSpace = T.SRGBColorSpace
  t.anisotropy = 4
  return t
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath()
}

/** Le fil du hêtre : clair, fin et régulier — un cube, pas une planche. */
function grain(g: CanvasRenderingContext2D, size: number, base: string) {
  g.fillStyle = base; g.fillRect(0, 0, size, size)
  const k = size / 256
  // Des cernes larges et doux, qui ondulent
  for (let i = 0; i < 8; i++) {
    const y0 = Math.random() * size, amp = (2 + Math.random() * 6) * k, th = (5 + Math.random() * 14) * k, ph = Math.random() * 6
    g.fillStyle = `rgba(140,88,42,${0.05 + Math.random() * 0.07})`
    g.beginPath()
    for (let x = 0; x <= size; x += 8) g.lineTo(x, y0 + Math.sin(x / size * 5 + ph) * amp)
    for (let x = size; x >= 0; x -= 8) g.lineTo(x, y0 + th + Math.sin(x / size * 5 + ph + 0.5) * amp)
    g.closePath(); g.fill()
  }
  // Le fil : des traits fins, presque parallèles
  for (let i = 0; i < 70; i++) {
    const y = Math.random() * size
    g.strokeStyle = `rgba(105,64,30,${0.04 + Math.random() * 0.09})`
    g.lineWidth = (0.5 + Math.random() * 1.2) * k
    g.beginPath(); g.moveTo(0, y)
    g.bezierCurveTo(size * 0.33, y + (Math.random() - 0.5) * 8 * k, size * 0.66, y + (Math.random() - 0.5) * 8 * k, size, y + (Math.random() - 0.5) * 5 * k)
    g.stroke()
  }
  // Les pores
  for (let i = 0; i < 180; i++) {
    g.fillStyle = `rgba(90,55,25,${0.06 + Math.random() * 0.1})`
    g.fillRect(Math.random() * size, Math.random() * size, (2 + Math.random() * 5) * k, 0.8 * k)
  }
}

/** Une face de cube : le bois, un liseré peint, la lettre au milieu.
    `bump` : la même en niveaux de gris, pour la graver dans le bois. */
function face(t: string, paint: string, size: number, capital: boolean, bump: boolean) {
  const [c, g] = canvas(size)
  if (bump) { g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, size, size) } else grain(g, size, BEECH)
  const m = size * 0.085
  roundRect(g, m, m, size - 2 * m, size - 2 * m, size * 0.11)
  g.lineWidth = size * 0.026
  g.strokeStyle = bump ? '#909090' : paint
  g.globalAlpha = bump ? 1 : 0.85
  g.stroke()
  g.globalAlpha = 1
  const text = capital ? t.toUpperCase() : t
  let F = size * (capital ? 0.5 : 0.68)
  const font = (px: number) => `800 ${px}px 'Baloo 2', 'Fredoka', sans-serif`
  g.font = font(F)
  const w0 = g.measureText(text).width
  const maxW = size * 0.7
  if (w0 > maxW) { F *= maxW / w0; g.font = font(F) }
  g.textAlign = 'center'
  g.textBaseline = 'alphabetic'
  const mt = g.measureText(text)
  // Centré sur le DESSIN de la lettre, pas sur sa ligne : un « p » et un
  // « l » tombent au milieu de la face
  const y = size / 2 + (mt.actualBoundingBoxAscent - mt.actualBoundingBoxDescent) / 2
  const x = size / 2 + (mt.actualBoundingBoxLeft - mt.actualBoundingBoxRight) / 2
  if (bump) {
    g.filter = `blur(${Math.max(1, size / 160)}px)`
    g.fillStyle = '#3A3A3A'
    g.fillText(text, x, y)
    g.filter = 'none'
  } else {
    // Le creux de la gravure : une ombre fine dans le haut de la lettre
    g.fillStyle = 'rgba(70,40,15,.55)'
    g.fillText(text, x, y - size * 0.008)
    g.fillStyle = paint
    g.fillText(text, x, y + size * 0.004)
  }
  return c
}

function lookOf(me: State, t: string, s: SoundKey | null | undefined): Look {
  const paint = PAINT[paintOf(t, s)]
  const key = `${t}|${paint}`
  let lk = me.looks.get(key)
  if (!lk) {
    const { T } = me
    lk = {
      face: texOf(T, face(t, paint, 384, false, false)),
      side: texOf(T, face(t, paint, 256, true, false)),
      bump: texOf(T, face(t, paint, 384, false, true), false)
    }
    me.looks.set(key, lk)
  }
  return lk
}

/** La photo imprimée sur sa carte, avec un liseré blanc arrondi. Sans photo
    (un prénom) : la photo de la joueuse, ou sa grande initiale. */
function cardTexture(T: T3, url: string | null, initial: string): Promise<Tex> {
  return new Promise(res => {
    const S = 512
    const make = (img: HTMLImageElement | null) => {
      const [c, g] = canvas(S)
      g.fillStyle = '#FFFDF7'; g.fillRect(0, 0, S, S)
      const m = 26, r = 30
      g.save()
      roundRect(g, m, m, S - 2 * m, S - 2 * m, r); g.clip()
      if (img) g.drawImage(img, m, m, S - 2 * m, S - 2 * m)
      else {
        g.fillStyle = '#E6F4EE'; g.fillRect(0, 0, S, S)
        g.fillStyle = '#2E8C84'
        g.font = `800 ${S * 0.62}px 'Baloo 2', sans-serif`
        g.textAlign = 'center'; g.textBaseline = 'middle'
        g.fillText(initial, S / 2, S * 0.56)
      }
      g.restore()
      res(texOf(T, c))
    }
    if (!url) { make(null); return }
    const img = new Image()
    img.onload = () => make(img)
    img.onerror = () => make(null)
    img.src = url
  })
}

/* ---------- La voix : son, syllabe, mot — l'un après l'autre ---------- */
const msFor = (text: string) => 560 + text.length * 70

function say(me: State, text: string) {
  ctx.say(text)
  if (BOT()) me.said.push(text)
}
/** Ajoute à la file. Un cube posé pendant qu'elle parle : les SONS pas
    encore dits sont oubliés (les syllabes restent), la voix ne traîne pas
    trois cubes derrière le doigt. */
function speak(me: State, items: Speech[]) {
  me.q = me.q.filter(x => !x.sound)
  me.q.push(...items)
  pump(me)
}
function pump(me: State) {
  if (me.qBusy) return
  const it = me.q.shift()
  if (!it) return
  me.qBusy = true
  it.start?.()
  if (it.text) say(me, it.text)
  ctx.after(it.ms, () => {
    if (lg !== me) return
    me.qBusy = false
    pump(me)
  })
}

/* ---------- La scène fixe : la table, le support de la photo ---------- */
function buildTable(me: State) {
  const { T, stage } = me
  // Une table d'enfant peinte (planches vert d'eau) : les cubes clairs s'y détachent
  const top = new T.Mesh(new T.PlaneGeometry(60, 60), new T.MeshStandardMaterial({
    map: stage.keep(woodTex(T, '#5E968A', 3.5)), roughness: 0.72
  }))
  top.rotation.x = -Math.PI / 2
  top.receiveShadow = true
  stage.scene.add(top)

  // La carte-photo, debout dans un bloc de noyer fendu (le groupe mesure 1 :
  // il est mis à l'échelle à chaque mot)
  const card = new T.Group()
  const walnut = new T.MeshStandardMaterial({ map: stage.keep(woodTex(T, WALNUT, 0.6)), roughness: 0.6 })
  const holder = new T.Mesh(new me.RB(1.12, 0.16, 0.26, 3, 0.05), walnut)
  holder.position.set(0, 0.08, 0)
  holder.castShadow = true; holder.receiveShadow = true
  const white = new T.MeshStandardMaterial({ color: 0xF6F1E8, roughness: 0.7 })
  const photoMat = new T.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.62 })
  // Faces : +x, −x, +y, −y, +z (la photo), −z
  const sheet = new T.Mesh(new me.RB(1, 1, 0.035, 2, 0.03), [white, white, white, white, photoMat, white])
  sheet.position.set(0, 0.6, 0)
  sheet.rotation.x = -0.14
  sheet.castShadow = true
  sheet.userData.card = true
  card.add(holder, sheet)
  stage.scene.add(card)
  me.card = card
  me.photoMat = photoMat
}

/* ---------- Une manche : la réglette, ses cases, les cubes ---------- */
function slotTexture(T: T3) {
  const [c, g] = canvas(128)
  const grd = g.createRadialGradient(64, 64, 20, 64, 64, 70)
  grd.addColorStop(0, 'rgba(40,22,10,.30)')
  grd.addColorStop(0.75, 'rgba(40,22,10,.42)')
  grd.addColorStop(1, 'rgba(40,22,10,.62)')
  roundRect(g, 6, 6, 116, 116, 18)
  g.fillStyle = grd
  g.fill()
  g.lineWidth = 3
  g.strokeStyle = 'rgba(255,236,200,.35)'
  roundRect(g, 8, 10, 112, 112, 16)
  g.stroke()
  return texOf(T, c)
}

/** Rend au GPU une manche finie — sauf la géométrie des cubes, que les
    cubes partants utilisent encore (elle part avec eux, `retired`). */
function disposeGroup(g: import('three').Object3D, keep: Geo | null) {
  g.traverse(o => {
    const m = o as Mesh
    if (m.geometry && m.geometry !== keep) m.geometry.dispose()
    if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose())
  })
  g.parent?.remove(g)
}

function buildRound(me: State) {
  const { T } = me
  const w = me.word
  const n = w.g.length
  const s = me.s
  // L'ancienne réglette part (ses fantômes et ses arcs avec elle)
  disposeGroup(me.round3d, me.oldGeo)
  me.round3d = new T.Group()
  me.stage.scene.add(me.round3d)

  const pitch = s * 1.12
  const L = n * pitch + s * 0.55
  const D = s * 1.3
  const H = s * 0.2
  me.trayTop = H
  me.trayFront = D / 2
  const trayMat = new T.MeshStandardMaterial({ map: me.trayTex, roughness: 0.55 })
  const tray = new T.Mesh(new me.RB(L, H, D, 3, Math.min(0.08, H * 0.45)), trayMat)
  tray.position.y = H / 2
  tray.castShadow = true; tray.receiveShadow = true
  me.round3d.add(tray)

  // Les cases, un creux par cube ; la suivante s'allume
  const slotTex = me.slotTex
  const slotGeo = new T.PlaneGeometry(s * 1.04, s * 1.04)
  me.slotPos = []
  me.slotMats = []
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * pitch
    const mat = new T.MeshStandardMaterial({ map: slotTex, transparent: true, depthWrite: false, roughness: 0.9, emissive: new T.Color('#FFC53D'), emissiveIntensity: 0 })
    const sl = new T.Mesh(slotGeo, mat)
    sl.rotation.x = -Math.PI / 2
    sl.position.set(x, H + 0.003, 0)
    sl.receiveShadow = true
    me.round3d.add(sl)
    me.slotPos.push(new T.Vector3(x, H + s / 2, 0))
    me.slotMats.push(mat)
  }

  // Le mot fantôme : montré au début dans les cases, puis il s'efface
  me.ghostMats = []
  me.ghosts = []
  const ghostPlain = new T.MeshStandardMaterial({ color: 0xFFF3DE, transparent: true, opacity: 0, depthWrite: false, roughness: 0.8 })
  me.ghostMats.push(ghostPlain)
  w.g.forEach((gr, i) => {
    const lk = lookOf(me, gr.t, gr.s)
    const fm = new T.MeshStandardMaterial({ map: lk.face, transparent: true, opacity: 0, depthWrite: false, roughness: 0.8 })
    me.ghostMats.push(fm)
    const gh = new T.Mesh(me.geo!, [ghostPlain, ghostPlain, fm, ghostPlain, fm, ghostPlain])
    gh.position.copy(me.slotPos[i])
    me.round3d.add(gh)
    me.ghosts.push(gh)
  })
  me.ghostFade = 0

  // Les arcs des syllabes, sous la réglette (couleurs alternées), cachés
  // jusqu'à ce que la syllabe soit complète
  me.arcs = w.syl.map((sy, k) => {
    const x0 = me.slotPos[sy.from].x - s * 0.42, x1 = me.slotPos[sy.to].x + s * 0.42
    const z0 = D / 2 + s * 0.18
    const curve = new T.QuadraticBezierCurve3(
      new T.Vector3(x0 - (x0 + x1) / 2, 0, 0),
      new T.Vector3(0, 0, s * 0.95),
      new T.Vector3(x1 - (x0 + x1) / 2, 0, 0)
    )
    const col = k % 2 ? '#2F8A4E' : '#D9761E'
    const mat = new T.MeshStandardMaterial({ color: col, roughness: 0.45, emissive: new T.Color(col), emissiveIntensity: 0 })
    const mesh = new T.Mesh(new T.TubeGeometry(curve, 24, s * 0.05, 8, false), mat)
    mesh.position.set((x0 + x1) / 2, s * 0.05, z0)
    mesh.scale.setScalar(0.001)
    mesh.castShadow = true
    me.round3d.add(mesh)
    return { mesh, mat, grow: 0, flash: 0, lit: 0 }
  })

  // Les cubes : ceux du mot et les leurres, en vrac devant la réglette
  const extra = decoys(w, ctx.byTier(4, 6, 6), ctx.tier)
  const texts = shuffle([...w.g.map(g => ({ t: g.t, s: g.s as SoundKey | null | undefined })), ...extra.map(t => ({ t, s: undefined }))])
  const total = texts.length
  const cols = Math.max(4, Math.min(8, Math.ceil(total / 2)))
  const rows = Math.ceil(total / cols)
  const sx = s * 1.5, sz = s * 1.8
  const z0 = D / 2 + s * 1.55 + s / 2
  me.bounds = {
    minX: -(cols - 1) / 2 * sx - s * 0.3, maxX: (cols - 1) / 2 * sx + s * 0.3,
    minZ: z0 - s * 0.2, maxZ: z0 + (rows - 1) * sz + s * 0.3
  }
  texts.forEach((it, k) => {
    const r = Math.floor(k / cols), cIn = k % cols
    const inRow = Math.min(cols, total - r * cols)
    const x = (cIn - (inRow - 1) / 2) * sx + (r % 2 ? sx * 0.22 : 0) + (Math.random() - 0.5) * s * 0.3
    const z = z0 + r * sz + (Math.random() - 0.5) * s * 0.28
    const c = makeCube(me, it.t, it.s)
    c.home.set(x, s / 2, z)
    c.yaw = (Math.random() - 0.5) * 0.55
    // Ils tombent en tournoyant, un par un — de pas trop haut : un cube lâché
    // de 5 m passait sous le nez de la caméra, énorme, devant la photo
    c.state = 'rain'
    c.mesh.position.set(x + (Math.random() - 0.5) * 0.4, s * (1.8 + k * 0.09 + Math.random() * 0.4), z - 0.3)
    c.mesh.quaternion.setFromEuler(new T.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6))
    c.fromQ.copy(c.mesh.quaternion)
    c.from.copy(c.mesh.position)
    c.vy = 0
    me.cubes.push(c)
  })

  // La photo : grande, au fond, au milieu
  const W = Math.max(L, cols * sx, 7)
  const P = Math.min(3.6, Math.max(2.5, W * 0.34))
  me.card.scale.setScalar(P)
  me.card.position.set(0, 0, -D / 2 - P * 0.34)
  fitCamera(me)
}

function makeCube(me: State, t: string, s: SoundKey | null | undefined): Cube {
  const { T } = me
  const lk = lookOf(me, t, s)
  const plain = new T.MeshStandardMaterial({ map: me.plainTex, roughness: 0.6, emissive: new T.Color('#FFC53D'), emissiveIntensity: 0 })
  const side = new T.MeshStandardMaterial({ map: lk.side, roughness: 0.6, emissive: new T.Color('#FFC53D'), emissiveIntensity: 0 })
  const fc = new T.MeshStandardMaterial({ map: lk.face, bumpMap: lk.bump, bumpScale: 2.2, roughness: 0.56, emissive: new T.Color('#FFC53D'), emissiveIntensity: 0 })
  // Faces : +x, −x (la capitale), +y (dessus), −y, +z (devant), −z
  const mesh = new T.Mesh(me.geo!, [side, side, fc, plain, fc, plain])
  mesh.castShadow = true
  mesh.receiveShadow = true
  const id = me.nextId++
  mesh.userData.cube = id
  me.stage.scene.add(mesh)
  return {
    id, t, mesh, mats: [plain, side, fc], home: new T.Vector3(), yaw: 0, state: 'rest', slot: -1,
    t0: 0, dur: 0, from: new T.Vector3(), to: new T.Vector3(), fromQ: new T.Quaternion(), vy: 0,
    help: false, lit: 0, litT: 0, hop: -1, squash: 0
  }
}

/* ---------- La caméra cadre tout : photo, réglette, cubes ---------- */
function fitCamera(me: State) {
  const { T, stage } = me
  const cam = stage.camera
  const pts: V3[] = []
  const add = (b: import('three').Box3) => {
    for (let k = 0; k < 8; k++) pts.push(new T.Vector3(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z))
  }
  me.card.updateMatrixWorld(true)
  add(new T.Box3().setFromObject(me.card))
  const b = me.bounds, s = me.s
  add(new T.Box3(new T.Vector3(b.minX - s / 2, 0, b.minZ - s / 2), new T.Vector3(b.maxX + s / 2, s * 1.2, b.maxZ + s / 2)))
  const n = me.slotPos.length
  const half = (n / 2) * s * 1.12 + s * 0.4
  add(new T.Box3(new T.Vector3(-half, 0, -me.trayFront), new T.Vector3(half, me.trayTop + s, me.trayFront + s * 1.2)))
  const probe = cam.clone()
  const dir = new T.Vector3(0, Math.sin(EL), Math.cos(EL))
  const v = new T.Vector3()
  // La colonne des pastilles à droite, la barre de jeu en haut : un peu d'air
  const fits = (look: V3, d: number) => {
    probe.position.copy(look).addScaledVector(dir, d)
    probe.lookAt(look)
    probe.updateMatrixWorld(true)
    probe.updateProjectionMatrix()
    for (const p of pts) {
      v.copy(p).project(probe)
      if (Math.abs(v.x) > 0.84 || v.y > 0.86 || v.y < -0.93 || v.z > 1) return false
    }
    return true
  }
  const zs = pts.map(p => p.z)
  const zA = Math.min(...zs), zB = Math.max(...zs)
  let best: { look: V3; d: number } | null = null
  for (let k = 0; k <= 14; k++) {
    const look = new T.Vector3(0, 0.4, zA + (zB - zA) * k / 14)
    let lo = 2, hi = 80
    if (!fits(look, hi)) continue
    for (let it = 0; it < 24; it++) {
      const d = (lo + hi) / 2
      if (fits(look, d)) hi = d; else lo = d
    }
    if (!best || hi < best.d) best = { look, d: hi }
  }
  if (!best) return
  me.cam.tlook.copy(best.look)
  me.cam.tpos.copy(best.look).addScaledVector(dir, best.d)
  if (me.cam.snap) {
    me.cam.snap = false
    me.cam.pos.copy(me.cam.tpos)
    me.cam.look.copy(me.cam.tlook)
  }
}

/* ---------- Le déroulé d'un mot ---------- */
function paintDots(me: State) {
  me.sayBtn.parentElement!.querySelector('.lg-dots')!.innerHTML = me.words.map((_, i) =>
    `<i class="sn-dot${i < me.round ? ' on' : ''}${i === me.round ? ' cur' : ''}"></i>`).join('')
}

async function loadRound(me: State) {
  const gen = ++me.gen
  const w = me.words[me.round]
  me.word = w
  me.pos = 0
  me.here = 0
  me.lock = true
  me.peeking = true
  me.q = []
  paintDots(me)
  // Les cubes de la manche d'avant rapetissent et s'en vont
  for (const c of me.cubes) { c.state = 'gone'; c.t0 = me.sim; me.gone.push(c) }
  me.cubes = []
  const retiredLooks = [...me.looks.values()]
  me.looks = new Map()
  me.oldGeo = me.geo
  if (me.geo) me.retired.push(me.geo)
  retiredLooks.forEach(lk => me.retired.push(lk.face, lk.side, lk.bump))

  const url = w.pic ? photoUrl(w.pic) : ctx.avatar
  const tex = await cardTexture(me.T, url, w.text.charAt(0).toUpperCase())
  if (lg !== me || me.gen !== gen) { tex.dispose(); return }
  // La carte pivote pour montrer la nouvelle photo
  me.flip = 0.0001
  ctx.after(220, () => {
    if (lg !== me || me.gen !== gen) { tex.dispose(); return }
    me.photoMat.map?.dispose()
    me.photoMat.map = tex
    me.photoMat.needsUpdate = true
  })

  // Un long mot : des cubes un peu plus petits, pour que tout tienne
  me.s = Math.min(1, Math.max(0.72, 7.2 / w.g.length))
  me.geo = new me.RB(me.s, me.s, me.s, 3, me.s * 0.1)
  buildRound(me)
  sfx('cloth', { vol: 0.25, rate: 0.9 })

  // Le mot est MONTRÉ (cubes fantômes dans les cases) et dit, puis s'efface
  // (compté en temps SIMULÉ, comme le fondu : une tablette qui rame ne doit
  // pas effacer le mot avant de l'avoir montré)
  me.ghostFade = 1
  me.peekEnd = me.sim + 3.2
  ctx.after(700, () => { if (lg === me && me.gen === gen) speak(me, [{ text: w.text, ms: msFor(w.text) + 300 }]) })
}

function nextRound(me: State) {
  me.round++
  paintDots(me)
  if (me.round < me.words.length) void loadRound(me)
  else finish(me)
}

/* ---------- Poser un cube ---------- */
function sendBack(me: State, c: Cube) {
  c.state = 'back'; c.t0 = me.sim; c.dur = 0.42
  c.from.copy(c.mesh.position); c.fromQ.copy(c.mesh.quaternion)
}

function tryPlace(me: State, c: Cube, how: 'tap' | 'drag') {
  const w = me.word
  const i = me.pos
  if (i >= w.g.length || me.lock || me.peeking) { if (c.state === 'held') sendBack(me, c); return }
  if (c.t === w.g[i].t) {
    me.pos++
    me.here = 0
    for (const x of me.cubes) x.help = false
    c.slot = i
    c.state = 'fly'; c.t0 = me.sim
    c.from.copy(c.mesh.position); c.fromQ.copy(c.mesh.quaternion)
    c.to.copy(me.slotPos[i])
    c.dur = 0.5 + Math.min(0.25, c.from.distanceTo(c.to) * 0.04)
    sfx('whoosh', { vol: 0.16, rate: 1.7 })
    if (me.pos === w.g.length) me.lock = true
  } else {
    // Pas le bon : il revient doucement, sans rien perdre
    me.mistakes++
    me.here++
    sfx('drop', { vol: 0.28, rate: 0.75 })
    if (how === 'tap') { c.state = 'nope'; c.t0 = me.sim; c.dur = 0.6 } else sendBack(me, c)
    if (me.here >= 2) {
      const want = w.g[i].t
      const good = me.cubes.find(x => x.state === 'rest' && x.t === want)
      if (good) good.help = true
    }
  }
}

/** Le cube est posé dans sa case : toc, sciure, et la voix. */
function landed(me: State, c: Cube) {
  const w = me.word
  const i = c.slot
  c.squash = 1
  // Un « e » reste un « e » : n'importe lequel convient, et il prend la
  // couleur de SA place — gris là où il est muet (grenouille), rouge là
  // où il se dit
  const lk = lookOf(me, w.g[i].t, w.g[i].s)
  const [, side, fc] = c.mats
  if (fc.map !== lk.face) { fc.map = lk.face; fc.bumpMap = lk.bump; side.map = lk.side }
  impact(0.32, { matter: 'bois', noShake: true })
  me.fx.burst({ x: c.mesh.position.x, y: me.trayTop + 0.05, z: c.mesh.position.z + me.s * 0.3 },
    { count: 10, color: ['#E9C48F', '#D2A26A', '#FFF1D6'], speed: 1.3, spread: 0.9, life: 0.5, size: 0.07, gravity: 5 })
  const k = w.g[i].syl
  const sylDone = w.syl[k].to === i
  const texts = landing(w, i)
  const items: Speech[] = texts.map((t, j) => {
    const isSyl = sylDone && j === texts.length - 1
    return { text: t, ms: msFor(t), sound: !isSyl, start: isSyl ? () => { if (me.arcs[k]) me.arcs[k].flash = 1 } : undefined }
  })
  if (sylDone && me.arcs[k]) me.arcs[k].grow = 0.0001
  // Le dernier cube : la lecture finale, « comme un doigt qui lit »
  if (i === w.g.length - 1) {
    const gen = me.gen
    const rd = reading(w)
    rd.forEach((t, j) => {
      const whole = j === rd.length - 1
      items.push({
        text: t, ms: msFor(t) + (whole ? 500 : 80),
        start: () => {
          if (me.gen !== gen) return
          if (whole) readWhole(me)
          else readSyllable(me, j)
        }
      })
    })
    items.push({ text: '', ms: 900, start: () => { if (me.gen === gen) nextRound(me) } })
    // Une petite respiration avant de lire
    items.splice(texts.length, 0, { text: '', ms: 350 })
  }
  speak(me, items)
}

function readSyllable(me: State, k: number) {
  const sy = me.word.syl[k]
  for (const c of me.cubes) {
    if (c.state !== 'placed') continue
    const on = c.slot >= sy.from && c.slot <= sy.to
    c.litT = on ? 1 : 0
    if (on) c.hop = me.sim
  }
  me.arcs.forEach((a, j) => { a.lit = j === k ? 1 : 0 })
}

function readWhole(me: State) {
  const placed = me.cubes.filter(c => c.state === 'placed')
  for (const c of placed) { c.litT = 1; c.hop = me.sim + c.slot * 0.07 }
  me.arcs.forEach(a => { a.lit = 1 })
  sfx('confirm', { vol: 0.7, delay: 0.15 })
  for (const c of placed) {
    me.fx.burst({ x: c.mesh.position.x, y: me.trayTop + me.s, z: c.mesh.position.z },
      { count: 8, color: ['#FFD34D', '#7BD88F', '#FFFFFF', '#FF8FA3'], speed: 2, spread: 0.8, life: 0.9, size: 0.09, gravity: 3 })
  }
}

function finish(me: State) {
  me.lock = true
  const stars = me.mistakes <= 2 ? 3 : me.mistakes <= 5 ? 2 : 1
  ctx.finish({
    title: 'Tous les mots écrits !',
    msg: `Tu as écrit ${me.words.length} mots avec les cubes`,
    stars
  })
}

/* ---------- La boucle ---------- */
const ease = (u: number) => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2

function step(me: State, dt: number) {
  const { T, stage } = me
  me.sim += dt
  const s = me.s
  const qa = new T.Quaternion(), qb = new T.Quaternion()
  const X = new T.Vector3(1, 0, 0), Y = new T.Vector3(0, 1, 0)
  const restQ = (yaw: number) => qa.setFromAxisAngle(Y, yaw)

  for (const c of me.cubes) {
    const p = c.mesh.position
    const u = c.dur ? Math.min(1, (me.sim - c.t0) / c.dur) : 1
    switch (c.state) {
      case 'rain': {
        const y0 = c.from.y
        c.vy -= 24 * dt
        p.y += c.vy * dt
        p.x += (c.home.x - p.x) * Math.min(1, dt * 6)
        p.z += (c.home.z - p.z) * Math.min(1, dt * 6)
        const k = Math.min(1, Math.max(0, 1 - (p.y - c.home.y) / (y0 - c.home.y)))
        c.mesh.quaternion.slerpQuaternions(c.fromQ, restQ(c.yaw), Math.min(1, k * 1.15))
        if (p.y <= c.home.y) {
          p.y = c.home.y
          if (c.vy < -3) {
            impact(Math.min(0.5, -c.vy / 26), { matter: 'bois', noShake: true })
            c.vy = -c.vy * 0.28
          } else {
            c.state = 'rest'
            p.copy(c.home)
            c.mesh.quaternion.copy(restQ(c.yaw))
          }
        }
        break
      }
      case 'held': {
        p.lerp(me.dragTo, Math.min(1, dt * 16))
        c.mesh.quaternion.slerp(restQ(c.yaw * 0.3), Math.min(1, dt * 10))
        break
      }
      case 'fly': {
        const e = ease(u)
        p.lerpVectors(c.from, c.to, e)
        p.y += Math.sin(Math.PI * e) * (1.1 + c.from.distanceTo(c.to) * 0.12) * s
        // Il roule en l'air : un tour complet vers la réglette
        qb.setFromAxisAngle(X, -Math.PI * 2 * e)
        c.mesh.quaternion.slerpQuaternions(c.fromQ, qa.identity(), e).multiply(qb)
        if (u >= 1) {
          c.state = 'placed'
          p.copy(c.to)
          c.mesh.quaternion.identity()
          landed(me, c)
        }
        break
      }
      case 'back': {
        const e = ease(u)
        p.lerpVectors(c.from, c.home, e)
        p.y += Math.sin(Math.PI * e) * 0.35 * s
        c.mesh.quaternion.slerpQuaternions(c.fromQ, restQ(c.yaw), e)
        if (u >= 1) { c.state = 'rest'; p.copy(c.home); impact(0.12, { matter: 'bois', noShake: true }) }
        break
      }
      case 'nope': {
        // Il s'élance vers la réglette, hésite, et revient à sa place
        const hop = Math.sin(Math.PI * u)
        p.copy(c.home)
        p.z -= hop * 0.55 * s
        p.y += hop * 0.45 * s
        c.mesh.quaternion.copy(restQ(c.yaw + Math.sin(u * Math.PI * 4) * 0.35 * (1 - u)))
        if (u >= 1) { c.state = 'rest'; p.copy(c.home); c.mesh.quaternion.copy(restQ(c.yaw)) }
        break
      }
      case 'placed': {
        p.copy(me.slotPos[c.slot])
        if (c.hop >= 0) {
          const h = (me.sim - c.hop) / 0.38
          if (h >= 1) c.hop = -1
          else if (h > 0) p.y += Math.sin(Math.PI * h) * 0.38 * s
        }
        break
      }
    }
    // Posé : il s'écrase un rien, puis reprend sa forme
    if (c.squash > 0) {
      c.squash = Math.max(0, c.squash - dt * 6)
      const k = Math.sin(c.squash * Math.PI) * 0.09
      c.mesh.scale.set(1 + k * 0.6, 1 - k, 1 + k * 0.6)
      p.y -= k * s / 2
    }
    // La lueur : l'aide (le bon cube qui respire) ou la lecture finale
    c.lit += (c.litT - c.lit) * Math.min(1, dt * 8)
    const glow = Math.max(c.help ? 0.16 + 0.14 * Math.sin(me.sim * 6) : 0, c.lit * 0.2)
    // Le bon cube, après deux essais : il luit et sautille sur place
    if (c.state === 'rest') p.y = c.home.y + (c.help ? Math.abs(Math.sin(me.sim * 3.2)) * 0.14 * s : 0)
    for (const m of c.mats) m.emissiveIntensity = glow
  }

  // Les cubes de la manche d'avant : ils rapetissent, puis on les rend au GPU
  for (let i = me.gone.length - 1; i >= 0; i--) {
    const c = me.gone[i]
    const u = Math.min(1, (me.sim - c.t0) / 0.35)
    c.mesh.scale.setScalar(Math.max(0.001, 1 - ease(u)))
    c.mesh.position.y += dt * 1.5
    if (u >= 1) {
      stage.scene.remove(c.mesh)
      c.mats.forEach(m => m.dispose())
      me.gone.splice(i, 1)
    }
  }
  if (!me.gone.length && me.retired.length) {
    me.retired.forEach(r => r.dispose())
    me.retired = []
  }

  // La case suivante respire
  me.slotMats.forEach((m, i) => {
    m.emissiveIntensity = !me.peeking && i === me.pos && !me.lock ? 0.35 + 0.3 * Math.sin(me.sim * 5) : 0
  })
  // Le mot fantôme : il apparaît, puis s'efface — et la main est à elle
  if (me.peeking && me.peekEnd > 0 && me.sim >= me.peekEnd) {
    me.peekEnd = 0
    me.ghostFade = -1
    me.peeking = false
    me.lock = false
  }
  if (me.ghostFade) {
    const o = me.ghostMats[0].opacity
    const to = me.ghostFade > 0 ? 0.5 : 0
    const nx = o + Math.sign(to - o) * Math.min(Math.abs(to - o), dt * 1.4)
    me.ghostMats.forEach((m, i) => { m.opacity = i ? nx * 1.5 : nx })
    // Effacés : on ne les dessine plus du tout
    if (me.ghostFade < 0 && nx <= 0) { me.ghostFade = 0; me.ghosts.forEach(g => { g.visible = false }) }
  }
  // Les arcs : ils se dessinent sous la syllabe finie, s'allument quand on la dit
  for (const a of me.arcs) {
    if (a.grow > 0 && a.grow < 1) a.grow = Math.min(1, a.grow + dt * 3.2)
    const g = a.grow > 0 ? ease(a.grow) : 0.001
    a.mesh.scale.set(Math.max(0.001, g), 1, Math.max(0.001, g))
    a.flash = Math.max(0, a.flash - dt * 1.4)
    a.mat.emissiveIntensity = Math.max(a.flash, a.lit) * 1.3
  }
  // La carte pivote au changement de mot
  if (me.flip > 0) {
    me.flip = Math.min(1, me.flip + dt * 2.2)
    me.card.rotation.y = ease(me.flip) * Math.PI * 2
    if (me.flip >= 1) { me.flip = 0; me.card.rotation.y = 0 }
  }
  me.fx.update(dt)

  // La caméra glisse vers son cadrage
  const k = 1 - Math.pow(0.02, dt)
  me.cam.pos.lerp(me.cam.tpos, k)
  me.cam.look.lerp(me.cam.tlook, k)
  stage.camera.position.copy(me.cam.pos)
  stage.camera.lookAt(me.cam.look)

  // Le haut-parleur suit la carte-photo, à sa droite
  const at = me.card.localToWorld(new T.Vector3(0.62, 0.62, 0))
  const sp = toScreen(stage, at)
  const r = stage.arena.getBoundingClientRect()
  const x = Math.round(sp.x - r.left), y = Math.round(sp.y - r.top)
  const pos = `${x},${y}`
  if (pos !== me.btnAt) {
    me.btnAt = pos
    me.sayBtn.style.left = x + 'px'
    me.sayBtn.style.top = y + 'px'
  }
}

/* ---------- Le doigt ---------- */
function wirePointer(me: State) {
  const { T, stage } = me
  const el = stage.renderer.domElement
  const ray = new T.Raycaster()
  const ndc = new T.Vector2()
  const plane = new T.Plane(new T.Vector3(0, 1, 0), 0)
  const hit = new T.Vector3()
  const aim = (x: number, y: number) => {
    const r = el.getBoundingClientRect()
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, stage.camera)
    return ray
  }
  const onDown = (e: PointerEvent) => {
    if (lg !== me || !stage.alive) return
    const ry = aim(e.clientX, e.clientY)
    const rest = me.cubes.filter(c => c.state === 'rest')
    const pick = ry.intersectObjects([...rest.map(c => c.mesh), me.card, ...me.cubes.filter(c => c.state === 'placed').map(c => c.mesh)], true)[0]
    if (!pick) return
    let o: import('three').Object3D | null = pick.object
    while (o && o.userData.cube === undefined && o !== me.card) o = o.parent
    if (!o) return
    // La photo redit le mot ; un cube posé redit son son (du contenu)
    if (o === me.card) { if (!me.lock || me.peeking) speak(me, [{ text: me.word.text, ms: msFor(me.word.text) }]); return }
    const c = me.cubes.find(x => x.id === o!.userData.cube)
    if (!c) return
    if (c.state === 'placed') {
      const gr = me.word.g[c.slot]
      if (gr.s && !me.lock) {
        c.hop = me.sim
        const t = SOUNDS[gr.s].say
        speak(me, [{ text: t, ms: msFor(t), sound: true }])
      }
      return
    }
    if (me.hold || me.lock || me.peeking) return
    me.hold = { pid: e.pointerId, c, x0: e.clientX, y0: e.clientY, drag: false }
  }
  const onMove = (e: PointerEvent) => {
    const h = me.hold
    if (!h || e.pointerId !== h.pid) return
    if (!h.drag && Math.hypot(e.clientX - h.x0, e.clientY - h.y0) > 12) {
      if (h.c.state !== 'rest') { me.hold = null; return }
      h.drag = true
      h.c.state = 'held'
      sfx('cloth', { vol: 0.3, rate: 1.6 })
    }
    if (h.drag) {
      plane.constant = -me.s * 1.15
      if (aim(e.clientX, e.clientY).ray.intersectPlane(plane, hit)) {
        const b = me.bounds
        me.dragTo.set(
          Math.max(b.minX - me.s * 2, Math.min(b.maxX + me.s * 2, hit.x)),
          me.s * 1.15,
          Math.max(-me.trayFront - me.s, Math.min(b.maxZ + me.s, hit.z))
        )
      }
    }
  }
  const onUp = (e: PointerEvent) => {
    const h = me.hold
    if (!h || e.pointerId !== h.pid) return
    me.hold = null
    if (lg !== me) return
    if (!h.drag) { if (h.c.state === 'rest') tryPlace(me, h.c, 'tap'); return }
    if (e.type === 'pointercancel') { sendBack(me, h.c); return }
    // Lâché sur la réglette : on essaie ; ailleurs sur la table : il reste là
    if (me.dragTo.z < me.trayFront + me.s * 0.9) tryPlace(me, h.c, 'drag')
    else {
      const b = me.bounds
      h.c.home.set(
        Math.max(b.minX, Math.min(b.maxX, me.dragTo.x)), me.s / 2,
        Math.max(b.minZ, Math.min(b.maxZ, me.dragTo.z)))
      sendBack(me, h.c)
    }
  }
  el.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  return () => {
    el.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  }
}

export const letters: GameDef = {
  // Sans article : « Les Cubes de l'alphabet » passait sur deux lignes de tuile
  id: 'letters', name: 'Cubes de l\'alphabet', icon: '🔤', sq: 'sq-mint', cat: 'reflexion',
  subtitle: 'Pose les cubes sous la photo : chaque cube dit son son',
  // La main : « l'un de ces cubes-là » — jamais le bon tout seul
  hand: () => {
    const me = lg
    if (!me || me.lock || me.peeking || me.hold) return null
    const free = me.cubes.filter(c => c.state === 'rest')
    if (free.length < 3) return null
    return { choose: some(free, 4).map(c => toScreen(me.stage, c.mesh.position)) }
  },
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="arena g3-arena lg-arena" id="lgArena">
        <button class="geo-again lg-say" aria-label="Réécouter">${ICON.sound}</button>
        <div class="tq-side"><div class="mem-dots lg-dots"></div></div>
      </div>`
    preloadSfx(['cloth', 'confirm', 'drop', 'whoosh'])
    const arena = c.root.querySelector<HTMLElement>('#lgArena')!
    const sayBtn = arena.querySelector<HTMLElement>('.lg-say')!
    const hideLoader = loader(arena, 'letters')
    let dead = false
    let me: State | null = null
    let unwire = () => {}

    // Trois mots du niveau ; le prénom d'abord, quand on sait qui joue
    const pool = shuffle([...c.byTier(WORDS.easy, WORDS.med, WORDS.exp)])
    const name = c.playerName ? nameWord(c.playerName) : null
    const words = name ? [name, ...pool.slice(0, 2)] : pool.slice(0, 3)

    ;(async () => {
      const [stage, rb] = await Promise.all([
        createStage(arena, {
          sky: '#CFE6DC', fov: 34, cam: [0, 9, 9], target: [0, 0, 0],
          hemi: ['#FFF4E2', '#5E7F72', 1.0],
          sun: { pos: [-4.5, 10, 6], color: '#FFF1D6', intensity: 2.3, area: 9, far: 34 },
          fill: 0.5, exposure: 1.0
        }),
        import('three/examples/jsm/geometries/RoundedBoxGeometry.js'),
        // Les lettres sont écrites dans la police de l'app : l'attendre
        document.fonts.load("800 100px 'Baloo 2'").catch(() => [])
      ])
      if (dead) { stage.dispose(); return }
      const T = stage.T
      const [pc, pg] = canvas(256)
      grain(pg, 256, BEECH)
      const st: State = {
        running: true, stage, T, RB: rb.RoundedBoxGeometry, words, round: 0, word: words[0], pos: 0, here: 0, mistakes: 0,
        lock: true, peeking: true, peekEnd: 0, gen: 0, sim: 0, s: 1, cubes: [], gone: [], nextId: 1, looks: new Map(), retired: [],
        plainTex: stage.keep(texOf(T, pc)), trayTex: stage.keep(woodTex(T, WALNUT, 0.5)), slotTex: stage.keep(slotTexture(T)),
        geo: null, oldGeo: null, round3d: new T.Group(), slotPos: [], slotMats: [], ghostMats: [],
        ghostFade: 0, ghosts: [], arcs: [], trayTop: 0.2, trayFront: 0.65, card: new T.Group(), photoMat: new T.MeshStandardMaterial(),
        flip: 0, fx: particles(stage, 260),
        cam: { pos: new T.Vector3(0, 9, 9), look: new T.Vector3(), tpos: new T.Vector3(0, 9, 9), tlook: new T.Vector3(), snap: true },
        q: [], qBusy: false, said: [], hold: null, dragTo: new T.Vector3(), bounds: { minX: -3, maxX: 3, minZ: 1, maxZ: 3 },
        sayBtn, btnAt: ''
      }
      me = st
      lg = st
      buildTable(st)
      stage.onResize = () => { if (lg === st && st.slotPos.length) fitCamera(st) }
      unwire = wirePointer(st)
      stage.keep({
        dispose() {
          st.fx.dispose()
          st.looks.forEach(lk => { lk.face.dispose(); lk.side.dispose(); lk.bump.dispose() })
          st.retired.forEach(r => r.dispose())
          st.geo?.dispose()
          for (const cb of [...st.cubes, ...st.gone]) cb.mats.forEach(m => m.dispose())
        }
      })
      // Le haut-parleur redit le mot (pas pendant la lecture finale : elle le dit)
      sayBtn.onclick = () => { if (lg === st && (!st.lock || st.peeking)) speak(st, [{ text: st.word.text, ms: msFor(st.word.text) }]) }
      // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
      if (BOT()) {
        const scr = (v: V3) => toScreen(stage, v)
        ;(window as unknown as { __lg: unknown }).__lg = {
          get word() { return st.word.id }, get text() { return st.word.text }, get pos() { return st.pos },
          get peeking() { return st.peeking }, get round() { return st.round }, get lock() { return st.lock },
          get need() { return st.word.g[st.pos]?.t ?? null }, get size() { return st.word.g.length },
          get idle() { return !st.qBusy && !st.q.length && !st.cubes.some(x => x.state !== 'rest' && x.state !== 'placed') },
          get said() { return st.said.slice() },
          get expected() { return [st.word.text, ...st.word.g.flatMap((_, i) => landing(st.word, i)), ...reading(st.word)] },
          cubes: () => st.cubes.map(x => ({ id: x.id, t: x.t, state: x.state, ...scr(x.mesh.position) })),
          slot: (i: number) => scr(st.slotPos[i])
        }
      }
      hideLoader()
      stage.start(dt => { if (lg === st) step(st, dt) })
      void loadRound(st)
    })().catch(err => { hideLoader(); if (!dead) throw err })

    return () => {
      if (dead) return
      dead = true
      unwire()
      if (me) {
        me.running = false
        if (lg === me) lg = null
        try { me.stage.dispose() } catch { /* déjà démonté */ }
      }
      const w = window as unknown as { __lg?: unknown }
      if (w.__lg) delete w.__lg
    }
  }
}
