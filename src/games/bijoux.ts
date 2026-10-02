import type { GameContext, GameDef } from '../core/types'
import { createStage, loader, woodTex, type Stage, type T3 } from '../core/three3d'
import { particles, toScreen, type Particles } from '../core/scene3d'
import { sfx, preloadSfx } from '../core/sfx'
import { tone, sSteam, sWin } from '../core/audio'
import { confetti } from '../core/fx'
import { ICON } from '../core/icons'
import { visible } from '../core/hand'
import { useFerme, soloRoyal } from '../core/store'
import { makePrincess, posePrincess, MOVES, type Princess, type Pose } from '../core/princess3d'
import { makeDecor, type Decor } from '../core/castle3d'
import { beadKit, beadRun, instancedRun, orientQ, BEAD_GAP, BEAD_HALF, BEAD_LEN, type BeadKit } from '../core/bijoux3d'
import { BEADS_MAX, type Bead, type BeadKind, type Piece } from '../core/royal'
import {
  pegboard, beadPot, ironing, fusedPieceGeo, fusedMaterial, pendantGeos, pendantPitch, BEAD,
  type Pegboard, type BeadPot, type Ironing
} from '../core/hama3d'
import { LETTER, PALETTE, PLATE_MAX, PLATE_SHAPES, PLATE_SIZE, plateMask, plateOutline, pieceOf, type ColorId, type PlateShape } from '../core/perles'

/* LES BIJOUX (30/09) — la demande de Jade : un collier de perles enfilé
   perle par perle, que sa princesse porte ensuite (le père : « collier de
   perles », « oui, elle les porte » ; maquette validée).
   1. L'établi : la planche à collier en feutrine, le fil de soie tendu en U
      — le fermoir doré au départ, l'aiguille au bout — et le boîtier à douze
      compartiments. On TOUCHE une perle (ou on la glisse) : elle vole jusqu'à
      l'aiguille, s'enfile avec un petit « tic » et glisse le long du fil
      jusqu'aux autres. Les perles sont à leur vraie taille (`core/bijoux3d.ts`).
   2. Annuler (la dernière repart dans son compartiment), Vider (deux
      touchers, comme la poubelle de l'Atelier), Fermer : le fil se referme en
      rond et le fermoir claque.
   3. La vitrine : le collier sur un coussin de velours qui tourne doucement
      sous une lumière de bijouterie.
   4. La princesse (le bouton à la couronne) le porte, dans la salle de bal —
      et désormais aussi dans la Princesse (`royal.beads`, `wearNecklace`).
   Le second mode (1/10, « les perles à repasser dedans ») : une plaque à
   picots en création LIBRE — carré, cœur, étoile ou rond, comme les vraies
   plaques à formes —, douze pots de perles (leur nom dessous) ; on pose au
   toucher ou en glissant, un toucher sur une perle posée la reprend. Le fer
   (`ironing` de `core/hama3d.ts`) : le papier se pose, le fer passe, les
   perles fondent, l'objet se décolle et tourne dans les airs. Puis « Garder »
   (la vitrine des créations, gardée sur la tablette) ou « Au collier » : il
   devient le PENDENTIF du collier, pendu au milieu par un petit anneau doré
   (`royal.pendant`, `wearPendant`), dans la vitrine, sur la princesse ici
   et dans la Princesse.
   Rien à lire, aucune note (Créer). */

type V3 = import('three').Vector3
type Q = import('three').Quaternion
type M4 = import('three').Matrix4
type IM = import('three').InstancedMesh

/* ---- L'établi (mètres, vraie taille ; la maquette validée) ---- */
const BX = -0.02, BZ = 0            // la planche à collier
const TOP = 0.0101                  // le dessus de la feutrine
const CORD_Y = TOP + 0.0035         // la hauteur du fil
const OX = 0.2, OZ = -0.005         // le boîtier à perles
const COLS = 3, ROWS = 4, CW = 0.046, WALL = 0.002, HGT = 0.016
const OW = COLS * CW + WALL, OD = ROWS * CW + WALL
const X0 = OX - OW / 2 + WALL / 2, Z0 = OZ - OD / 2 + WALL / 2
const NEEDLE = 0.045                // l'aiguille, au bout du fil
const START = 0.006                 // la première perle, contre le fermoir
/** Les douze compartiments (la maquette) : une sorte, une couleur. */
const BOX: [BeadKind, string][] = [
  ['pearl', '#F6EEF0'], ['pearl', '#F7C6D6'], ['crystal', '#F27BA5'],
  ['glass', '#B79CF2'], ['glass', '#7FD3E0'], ['crystal', '#DDEBFF'],
  ['heart', '#E8435F'], ['heart', '#FF9EC0'], ['star', '#FFC94D'],
  ['flower', '#FFFFFF'], ['spacer', '#E2B657'], ['cube', '#9FE0B8']
]
/** Les modes de l'atelier : le collier enfilé, les perles à repasser (la
    colonne d'outils les montre en haut, le dernier choisi est retenu). */
type Mode = 'collier' | 'hama'
const MODES: { id: Mode; cap: string }[] = [{ id: 'collier', cap: 'Collier' }, { id: 'hama', cap: 'Perles à repasser' }]
const MODE_KEY = 'ferme:bijoux:mode', SHAPE_KEY = 'ferme:bijoux:plaque'
const remember = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* stockage refusé : on oublie */ } }
const recall = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }

/* ---- Les perles à repasser (en PAS de plaque : 1 = 5 mm, `Hama.root` mis à l’échelle) ---- */
const PITCH = 0.005
/** Les douze pots, trois colonnes de quatre, à droite de la plaque. */
const POTS: ColorId[] = ['rouge', 'rose', 'fuchsia', 'orange', 'jaune', 'vert', 'bleu', 'violet', 'blanc', 'noir', 'marron', 'beige']
const POT_R = 1.8
const potXZ = (k: number): [number, number] => [PLATE_MAX / 2 + 3.2 + POT_R + (k % 3) * 4.4, (Math.floor(k / 3) - 1.75) * 4.7]
/** Le nom des plaques (sous leur bouton) et leur plastique, comme les vraies. */
const PLATES: Record<PlateShape, { cap: string; color: number; ink: string }> = {
  carre: { cap: 'Carré', color: 0x9CC4E0, ink: '#A9D0EC' },
  coeur: { cap: 'Cœur', color: 0xE0809F, ink: '#F2A2BC' },
  etoile: { cap: 'Étoile', color: 0xE2B547, ink: '#F4CF6E' },
  rond: { cap: 'Rond', color: 0xA791DD, ink: '#BCA9EE' }
}

/* ---- Les icônes (viewBox 48, formes pleines) ---- */
const svg = (inner: string, s = 40) => `<svg viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true">${inner}</svg>`
const IC = {
  collier: svg(`<path d="M9 10c0 17 7 26 15 26s15-9 15-26" fill="none" stroke="#C9A24A" stroke-width="2.4"/>
    ${[[10.5, 17], [13, 24], [17, 30], [31, 30], [35, 24], [37.5, 17]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="#F4E9F0" stroke="#D9C2D0"/>`).join('')}
    <path d="M24 36c-4-3-6-5-6-7.5a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 2.5-2 4.5-6 7.5z" fill="#FF6B81"/>`),
  annuler: svg('<path d="M18 12 8 21l10 9" fill="none" stroke="#45362A" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 21h18a10 10 0 0 1 0 20h-6" fill="none" stroke="#45362A" stroke-width="4.5" stroke-linecap="round"/>'),
  vider: svg('<path d="M13 16h22l-2 24H15z" fill="#FF8A7A"/><rect x="10" y="11" width="28" height="5" rx="2" fill="#E8574C"/><rect x="20" y="7" width="8" height="4" rx="1.5" fill="#E8574C"/>'),
  // Le collier fermé : un rond de perles blanches, le fermoir doré en haut
  fermer: svg(`<circle cx="24" cy="25" r="13" fill="none" stroke="#fff" stroke-width="2.2" opacity=".8"/>
    ${[0, 1, 2, 3, 4, 5, 6].map(i => { const a = Math.PI / 2 + (i - 3) * 0.72; return `<circle cx="${(24 + Math.cos(a) * 13).toFixed(1)}" cy="${(25 + Math.sin(a) * 13).toFixed(1)}" r="4" fill="#fff"/>` }).join('')}
    <circle cx="24" cy="12" r="3.4" fill="none" stroke="#FFE08A" stroke-width="2.6"/>`, 52),
  couronne: svg('<path d="M9 34 12 16l7 9 5-13 5 13 7-9 3 18z" fill="#FFC94D"/><rect x="9" y="35" width="30" height="5" rx="2" fill="#E0A23A"/><circle cx="24" cy="10" r="2.8" fill="#FF6B81"/><circle cx="12" cy="14" r="2.2" fill="#7FD3E0"/><circle cx="36" cy="14" r="2.2" fill="#7FD3E0"/>', 54),
  // La plaque à picots, un petit cœur de perles posé dessus
  hama: svg(`<rect x="6" y="6" width="36" height="36" rx="7" fill="#CFE6F4" stroke="#9CC6E0" stroke-width="1.5"/>
    ${[0, 1, 2, 3, 4].flatMap(r => [0, 1, 2, 3, 4].map(c => `<circle cx="${11.6 + c * 6.2}" cy="${11.6 + r * 6.2}" r="1.3" fill="#9CC6E0"/>`)).join('')}
    ${[[1, 1], [3, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [2, 3], [3, 3], [2, 4]].map(([c, r]) => `<circle cx="${11.6 + c * 6.2}" cy="${11.6 + (r - 0.6) * 6.2}" r="2.7" fill="none" stroke="#E8435F" stroke-width="2.3"/>`).join('')}`),
  // Le fer à repasser bleu, de profil, et sa vapeur
  fer: svg(`<path d="M7 33h29c3 0 5-2 5-4.5 0-6-6-12.5-14-12.5H16c-5 0-9 7-9 17z" fill="#2F93C8"/>
    <rect x="6" y="33" width="36" height="4" rx="2" fill="#B9C0CA"/>
    <path d="M15 16c0-5 3-8 8-8h6c4 0 6 3 6 8" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>
    <circle cx="13" cy="26" r="2" fill="#FFB347"/>
    <path d="M12 43c1.5-1.5 1.5-3 0-4.5M20 44c1.5-1.5 1.5-3 0-4.5M28 44c1.5-1.5 1.5-3 0-4.5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".85"/>`, 52),
  // La vitrine : un petit présentoir doré, un cœur de perles derrière la vitre
  garder: svg(`<rect x="8" y="9" width="32" height="30" rx="4" fill="#5A1433" stroke="#E3B65A" stroke-width="3"/>
    <path d="M24 33c-5-3.6-8-6.4-8-9.6a4 4 0 0 1 8-1.4 4 4 0 0 1 8 1.4c0 3.2-3 6-8 9.6z" fill="#FF6B81"/>
    <path d="M12 13l7 0-7 8z" fill="#fff" opacity=".35"/>
    <rect x="12" y="39" width="24" height="4" rx="2" fill="#C9A24A"/>`, 52),
  // Le collier et son pendentif en cœur, pendu à son anneau
  pendentif: svg(`<path d="M9 8c0 13 7 19 15 19s15-6 15-19" fill="none" stroke="#C9A24A" stroke-width="2.4"/>
    ${[[10.5, 14], [13.5, 20], [18, 24.5], [30, 24.5], [34.5, 20], [37.5, 14]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#F4E9F0" stroke="#D9C2D0"/>`).join('')}
    <circle cx="24" cy="29.5" r="2.6" fill="none" stroke="#E3B65A" stroke-width="2"/>
    <path d="M24 45c-6-4.4-9.5-7.6-9.5-11.2a4.6 4.6 0 0 1 9.5-1.6 4.6 4.6 0 0 1 9.5 1.6c0 3.6-3.5 6.8-9.5 11.2z" fill="#E8435F"/>`, 52)
}
/** L'icône d'une plaque à forme : sa silhouette et quelques picots. */
function plateIcon(s: PlateShape) {
  const n = PLATE_SIZE[s], poly = plateOutline(s), k = 34 / (n + 1)
  const d = poly.map(([x, y], i) => `${i ? 'L' : 'M'}${(24 + x * k).toFixed(1)} ${(24 - y * k).toFixed(1)}`).join('') + 'Z'
  const m = plateMask(s)
  let dots = ''
  for (let r = 1; r < n; r += 3) for (let c = 1; c < n; c += 3) {
    if (m[r * n + c]) dots += `<circle cx="${(24 + (c - (n - 1) / 2) * k).toFixed(1)}" cy="${(24 - ((n - 1) / 2 - r) * k).toFixed(1)}" r="1.4" fill="#fff" opacity=".9"/>`
  }
  return svg(`<path d="${d}" fill="${PLATES[s].ink}" stroke="rgba(69,54,42,.35)" stroke-width="1.2"/>${dots}`, 40)
}
const tool = (id: string, icon: string, cap: string, cls = '') =>
  `<span class="tool-item ${cls}"><button class="sn-tool" id="${id}" aria-label="${cap}">${icon}</button><i class="tool-cap">${cap}</i></span>`

/* ---- L'état de la partie ---- */
/** `iron` : le fer passe ; `fly` : la création fondue tourne dans les airs
    (Garder · Au collier) ; `gallery` : la vitrine des créations. */
type Phase = 'load' | 'work' | 'closing' | 'vitrine' | 'loading' | 'princess' | 'end' | 'iron' | 'fly' | 'gallery'

/** Les perles à repasser : la plaque, ses perles, les pots. */
interface Hama {
  /** Tout l'atelier des perles à repasser, en pas de plaque (mis à l'échelle). */
  root: import('three').Group
  board: Pegboard
  shape: PlateShape
  n: number
  /** La couleur posée sur chaque picot (case r·n + c). */
  grid: (ColorId | null)[]
  pots: { id: ColorId; pot: BeadPot; pos: V3; el: HTMLElement; btn: HTMLButtonElement }[]
  color: ColorId
  /** Un trait par doigt : poser, ou reprendre (son premier picot portait
      une perle) ; `erase` vaut null tant qu'il n'a touché aucun picot. */
  strokes: Map<number, { erase: boolean | null; seen: Set<number> }>
  iron: Ironing | null
  /** L'envol de la création fondue (`out` : quand elle est partie, sinon −1). */
  fly: { t: number; burst: number; out: number } | null
  /** La plaque porte une création fondue (on repart d'une plaque vide). */
  fused: boolean
  /** Ce qu'on vient de repasser. */
  piece: Piece | null
  clearArmed: boolean
  clearId: number
}

/** La vitrine des créations : un plateau de velours, les créations dessus. */
interface Gallery {
  root: import('three').Group
  items: { mesh: import('three').Mesh; piece: Piece; base: V3; lift: number; drop: number }[]
  sel: number
  geos: import('three').BufferGeometry[]
  mats: import('three').Material[]
  extent: [number, number]
}

/** Une perle du fil. Tant qu'elle vole ou glisse, sa pose se recalcule. */
interface SB {
  bead: Bead
  len: number
  /** Son début sur le fil (m, depuis le fermoir). */
  s: number
  st: 'fly' | 'slide' | 'rest' | 'leave'
  t: number
  dur: number
  from: V3
  fromQ: Q
  to: V3
  dist: number
  comp: number
  key: string
  slot: number
  bump: number
  /** Sa taille au départ du vol (la perle tenue au doigt est grossie). */
  grow: number
  pos: V3
  q: Q
}
interface Pool { im: IM; owners: SB[] }
interface Comp { im: IM; mats: M4[]; pos: V3[]; hidden: Set<number> }
interface Held { id: number; comp: number; j: number; x: number; y: number; drag: boolean; mesh: import('three').Mesh | null; pos: V3 }

interface State {
  c: GameContext
  phase: Phase
  stage: Stage
  T: T3
  kit: BeadKit
  /** Les perles de la vitrine (réfraction vraie). */
  gems: BeadKit | null
  fx: Particles
  work: import('three').Group
  strand: import('three').Group
  pools: Map<string, Pool>
  box: Comp[]
  beads: SB[]
  leaving: SB[]
  held: Held | null
  curve: import('three').CatmullRomCurve3
  L: number
  uPts: V3[]
  loopPts: V3[]
  cord: import('three').Mesh
  cordMat: import('three').Material
  needle: import('three').Mesh
  clasp: import('three').Group
  tip: V3
  te: V3
  needleQ: Q
  /** L'aiguille au repos (elle tremble quand le fil est plein). */
  needleAt: V3
  up: V3
  shake: number
  morph: number
  lift: number
  ims: IM[]
  vitrine: import('three').Group | null
  spin: import('three').Group | null
  decor: Decor | null
  princess: Princess | null
  pose: Pose
  poseT: number
  poseDur: number
  camFrom: [V3, V3] | null
  camTo: [V3, V3] | null
  camT: number
  t: number
  clearArmed: boolean
  clearId: number
  ids: number[]
  /** Le chargement de la princesse en cours (retiré au démontage). */
  hideLoad: (() => void) | null
  /** Images encore à dessiner sur l'établi (rendu à la demande). */
  dirty: number
  /** Le rendu à la demande de l'établi (retiré quand tout s'anime, remis au retour). */
  lazy: () => void
  alive: boolean
  mode: Mode
  hama: Hama | null
  gallery: Gallery | null
  /** Les choix (Garder · Au collier) sont là. */
  choose: boolean
}

let S: State | null = null
const ease = (x: number) => x * x * (3 - 2 * x)
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/* =====================================================================
   L'établi
   ===================================================================== */

/** Le fil en U : il part du fermoir (en haut à gauche), fait le tour par le
    bas et remonte vers l'aiguille (en haut à droite). */
function uPoints(T: T3): V3[] {
  const pts: V3[] = []
  const cx = BX, cz = BZ - 0.01, a = 0.105, b = 0.085
  for (let i = 0; i <= 64; i++) {
    const t = Math.PI + 0.42 - (i / 64) * (Math.PI + 0.84)
    pts.push(new T.Vector3(cx + a * Math.cos(t), 0, cz + b * Math.sin(t)))
  }
  return pts
}
/** Le même fil refermé en rond (même longueur), fermoir en haut. */
function loopPoints(T: T3, L: number): V3[] {
  // Ramanujan : le périmètre d'une ellipse de demi-axes a et 0,82 a
  const k = 0.82
  const per = (a: number) => Math.PI * (3 * (a + k * a) - Math.sqrt((3 * a + k * a) * (a + 3 * k * a)))
  const a = L / per(1)
  const cx = BX, cz = BZ + 0.012
  const pts: V3[] = []
  for (let i = 0; i <= 64; i++) {
    const t = Math.PI * 1.5 - (i / 64) * Math.PI * 2
    pts.push(new T.Vector3(cx + a * Math.cos(t), 0, cz + k * a * Math.sin(t)))
  }
  return pts
}

function buildWorkbench(me: State) {
  const { T, stage } = me
  const g = me.work
  // Le plan de travail : un bois clair
  const wood = stage.keep(woodTex(T, '#D2A876', 3))
  const table = new T.Mesh(new T.PlaneGeometry(1.6, 1.2), new T.MeshStandardMaterial({ map: wood, roughness: 0.62 }))
  table.rotation.x = -Math.PI / 2
  table.receiveShadow = true
  // Le même établi pour les deux ateliers (le collier, les perles à repasser)
  table.name = 'etabli'
  stage.scene.add(table)
  // La planche à collier : feutrine gris-bleu, un sillon en U, des graduations
  const shape = new T.Shape()
  const W = 0.3, H = 0.22, R = 0.03
  shape.moveTo(-W / 2 + R, -H / 2); shape.lineTo(W / 2 - R, -H / 2); shape.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + R)
  shape.lineTo(W / 2, H / 2 - R); shape.quadraticCurveTo(W / 2, H / 2, W / 2 - R, H / 2); shape.lineTo(-W / 2 + R, H / 2)
  shape.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - R); shape.lineTo(-W / 2, -H / 2 + R); shape.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + R, -H / 2)
  const board = new T.Mesh(new T.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.003, bevelSegments: 4 }),
    new T.MeshPhysicalMaterial({ color: 0x55627E, roughness: 0.95, sheen: 1, sheenRoughness: 0.6, sheenColor: new T.Color(0x9AA9C8) }))
  board.rotation.x = -Math.PI / 2
  board.position.set(BX, 0, BZ)
  board.receiveShadow = true; board.castShadow = true
  g.add(board)
  const curve = me.curve
  const groove = new T.Mesh(new T.TubeGeometry(curve, 200, 0.0055, 10), new T.MeshStandardMaterial({ color: 0x323B50, roughness: 1 }))
  groove.scale.y = 0.08
  groove.position.y = TOP
  g.add(groove)
  // Les graduations, tous les centimètres (plus longues tous les cinq) : d'un seul coup
  const L = me.L
  const n = Math.floor(L / 0.01) + 1
  const ticks = new T.InstancedMesh(new T.BoxGeometry(0.0008, 0.0004, 1), new T.MeshStandardMaterial({ color: 0xEDE6D6, roughness: 0.7 }), n)
  const m4 = new T.Matrix4(), q = new T.Quaternion(), p = new T.Vector3(), sc = new T.Vector3()
  for (let i = 0; i < n; i++) {
    const d = i * 0.01, u = Math.min(1, d / L)
    const at = curve.getPointAt(u), tg = curve.getTangentAt(u)
    const nrm = new T.Vector3(-tg.z, 0, tg.x)
    const big = i % 5 === 0
    p.copy(at).addScaledVector(nrm, -0.011 - (big ? 0.002 : 0)); p.y = TOP
    q.setFromUnitVectors(new T.Vector3(0, 0, 1), nrm)
    ticks.setMatrixAt(i, m4.compose(p, q, sc.set(1, 1, big ? 0.009 : 0.005)))
  }
  me.ims.push(ticks)
  g.add(ticks)
  // Le fil de soie rose
  me.cordMat = new T.MeshStandardMaterial({ color: 0xF4C6D6, roughness: 0.55 })
  me.cord = new T.Mesh(new T.TubeGeometry(curve, 300, 0.00065, 8), me.cordMat)
  me.cord.position.y = CORD_Y
  me.cord.castShadow = true
  g.add(me.cord)
  // Le fermoir doré, au départ du fil
  const gold = new T.MeshPhysicalMaterial({ color: 0xE3B65A, metalness: 1, roughness: 0.2 })
  const p0 = curve.getPointAt(0)
  const ring = new T.Mesh(new T.TorusGeometry(0.003, 0.0007, 10, 24), gold)
  ring.rotation.x = Math.PI / 2
  ring.position.set(-0.003, 0, -0.003)
  const claw = new T.Mesh(new T.TorusGeometry(0.0045, 0.0013, 12, 28, Math.PI * 1.7), gold)
  claw.position.set(-0.009, 0, -0.008); claw.rotation.x = Math.PI / 2; claw.rotation.z = 0.8
  ring.castShadow = claw.castShadow = true
  me.clasp.add(ring, claw)
  me.clasp.position.set(p0.x, CORD_Y, p0.z)
  g.add(me.clasp)
  // L'aiguille, au bout : c'est là que les perles arrivent
  const pe = curve.getPointAt(1)
  me.te.copy(curve.getTangentAt(1))
  me.needle = new T.Mesh(new T.CylinderGeometry(0.0004, 0.0007, NEEDLE, 10), new T.MeshPhysicalMaterial({ color: 0xD8DCE2, metalness: 1, roughness: 0.15 }))
  me.needle.position.copy(pe).addScaledVector(me.te, NEEDLE / 2); me.needle.position.y = CORD_Y
  me.needleAt.copy(me.needle.position)
  orientQ(T, me.needle.quaternion, me.te, new T.Vector3(0, 1, 0))
  me.needle.castShadow = true
  g.add(me.needle)
  me.tip.copy(pe).addScaledVector(me.te, NEEDLE); me.tip.y = CORD_Y
  orientQ(T, me.needleQ, me.te, new T.Vector3(0, 1, 0))
  buildOrganizer(me)
  // Son pendentif (les perles à repasser), s'il en a un, attend au milieu
  // du U : le collier qu'on enfile le portera
  const pend = soloRoyal(useFerme.getState()).pendant
  if (pend) {
    const pg = pendantGeos(T, pend.rows, pendantPitch(pend.rows), { seg: 10 })
    const grp = new T.Group()
    grp.name = 'pendentif'
    const piece = new T.Mesh(pg.piece, fusedMaterial(T))
    const ring = new T.Mesh(pg.ring, new T.MeshPhysicalMaterial({ color: 0xE3B65A, metalness: 1, roughness: 0.2 }))
    piece.castShadow = piece.receiveShadow = ring.castShadow = true
    grp.add(piece, ring)
    // Couché sur la feutrine, le haut du dessin vers le fond, centré dans le U
    grp.rotation.x = -Math.PI / 2
    grp.position.set(BX, TOP + pg.thick / 2 + 0.0003, BZ - 0.012 - pg.drop / 2)
    g.add(grp)
  }
}

/** Le boîtier à perles : 3 × 4 compartiments, chacun plein d'une sorte. */
function buildOrganizer(me: State) {
  const { T } = me
  const g = new T.Group()
  // Un plastique rosé laiteux (sans transmission : c'est le verre des perles qui brille)
  const plastic = new T.MeshPhysicalMaterial({ color: 0xF7EEF6, roughness: 0.25, clearcoat: 0.8, transparent: true, opacity: 0.82 })
  const floor = new T.Mesh(new T.BoxGeometry(OW, 0.002, OD), new T.MeshStandardMaterial({ color: 0xF1E2EA, roughness: 0.5 }))
  floor.position.set(OX, 0.001, OZ); floor.receiveShadow = true
  g.add(floor)
  const wallX = new T.BoxGeometry(WALL, HGT, OD), wallZ = new T.BoxGeometry(OW, HGT, WALL)
  for (let c = 0; c <= COLS; c++) {
    const w = new T.Mesh(wallX, plastic); w.position.set(X0 + c * CW, HGT / 2, OZ); w.castShadow = true; g.add(w)
  }
  for (let r = 0; r <= ROWS; r++) {
    const w = new T.Mesh(wallZ, plastic); w.position.set(OX, HGT / 2, Z0 + r * CW); w.castShadow = true; g.add(w)
  }
  me.work.add(g)
  // Les perles en vrac : une instance par perle, un seul dessin par compartiment
  const qq = new T.Quaternion(), e = new T.Euler(), one = new T.Vector3(1, 1, 1)
  let seed = 11
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  BOX.forEach(([kind, color], i) => {
    const c = i % COLS, r = Math.floor(i / COLS)
    const cx = X0 + (c + 0.5) * CW, cz = Z0 + (r + 0.5) * CW
    const n = kind === 'spacer' ? 40 : kind === 'heart' || kind === 'star' || kind === 'flower' ? 18 : 26
    const im = new T.InstancedMesh(me.kit.geo(kind), me.kit.mat(kind, color), n)
    const comp: Comp = { im, mats: [], pos: [], hidden: new Set() }
    for (let j = 0; j < n; j++) {
      const layer = j < n * 0.62 ? 0 : 1
      e.set(rnd() * 6.3, rnd() * 6.3, rnd() * 6.3)
      if (kind === 'heart' || kind === 'star' || kind === 'flower') e.set(Math.PI / 2 + (rnd() - 0.5) * 0.6, rnd() * 6.3, 0, 'YXZ')
      qq.setFromEuler(e)
      const p = new T.Vector3(cx + (rnd() - 0.5) * (CW - 0.012), 0.004 + layer * 0.0045 + rnd() * 0.001, cz + (rnd() - 0.5) * (CW - 0.012))
      const m = new T.Matrix4().compose(p, qq, one)
      im.setMatrixAt(j, m)
      comp.mats.push(m); comp.pos.push(p)
    }
    im.castShadow = true; im.receiveShadow = true
    im.computeBoundingSphere()
    me.ims.push(im)
    me.box.push(comp)
    me.work.add(im)
  })
}

/** La caméra de l'établi : planche et boîtier entiers, quelle que soit la forme de l'écran. */
function fitWorkCam(me: State) {
  const { stage } = me
  const cam = stage.camera
  const tanH = Math.tan((cam.fov / 2) * Math.PI / 180)
  const d = Math.max(0.148 / tanH, 0.252 / (tanH * cam.aspect))
  const dir = new me.T.Vector3(0, 0.44, 0.132).normalize()
  cam.position.set(0.06, 0, -0.012).addScaledVector(dir, d)
  cam.lookAt(0.06, 0, -0.012)
}

/* ---- Les perles du fil : une instance chacune, un dessin par sorte et couleur ---- */
function poolOf(me: State, b: Bead): Pool {
  const key = b.k + b.c
  let p = me.pools.get(key)
  if (!p) {
    const im = new me.T.InstancedMesh(me.kit.geo(b.k), me.kit.mat(b.k, b.c), BEADS_MAX + 4)
    im.count = 0
    im.frustumCulled = false // les instances bougent : pas de sphère englobante figée
    im.castShadow = true; im.receiveShadow = true
    me.strand.add(im)
    me.ims.push(im)
    p = { im, owners: [] }
    me.pools.set(key, p)
  }
  return p
}
const M = { m: null as M4 | null, one: null as V3 | null }
function draw(me: State, b: SB, scale = 1) {
  const p = me.pools.get(b.key)
  if (!p) return
  M.m ??= new me.T.Matrix4()
  M.one ??= new me.T.Vector3()
  p.im.setMatrixAt(b.slot, M.m.compose(b.pos, b.q, M.one.setScalar(scale)))
  p.im.instanceMatrix.needsUpdate = true
}
function unpool(me: State, b: SB) {
  const p = me.pools.get(b.key)
  if (!p) return
  const last = p.owners.pop()!
  if (last !== b) {
    const m = new me.T.Matrix4()
    p.im.getMatrixAt(p.owners.length, m)
    p.owners[b.slot] = last
    last.slot = b.slot
    p.im.setMatrixAt(b.slot, m)
  }
  p.im.count = p.owners.length
  p.im.instanceMatrix.needsUpdate = true
}

/** Où finit le fil (la place de la prochaine perle). */
const nextS = (me: State) => {
  const last = me.beads[me.beads.length - 1]
  return last ? last.s + last.len + BEAD_GAP : START
}
const fits = (me: State, k: BeadKind) => me.beads.length < BEADS_MAX && nextS(me) + BEAD_LEN[k] <= me.L - 0.003

/** La pose d'une perle au repos sur le fil. */
function restPose(me: State, b: SB) {
  const u = clamp01((b.s + b.len / 2) / me.L)
  const p = me.curve.getPointAt(u), tg = me.curve.getTangentAt(u)
  b.pos.set(p.x, TOP + BEAD_HALF[b.bead.k], p.z)
  orientQ(me.T, b.q, tg, me.up)
}

/** Enfiler une perle du compartiment `comp`, partie de `from`. */
function string(me: State, comp: number, from: V3, fromQ: Q, grow = 1) {
  const [k, c] = BOX[comp]
  const bead: Bead = { k, c }
  const b: SB = {
    bead, len: BEAD_LEN[k], s: nextS(me), st: 'fly', t: 0, dur: 0, from: from.clone(), fromQ: fromQ.clone(),
    to: me.tip.clone(), dist: 0, comp, key: k + c, slot: 0, bump: 0, grow, pos: from.clone(), q: fromQ.clone()
  }
  b.dur = 0.34 + Math.min(0.3, from.distanceTo(me.tip) * 1.1)
  const pool = poolOf(me, bead)
  b.slot = pool.owners.length
  pool.owners.push(b)
  pool.im.count = pool.owners.length
  me.beads.push(b)
  draw(me, b, grow)
  refreshUi(me)
}

/** Une perle quitte le fil et retourne dans son compartiment. */
function leave(me: State, b: SB, delay = 0) {
  b.st = 'leave'
  b.t = -delay
  b.from.copy(b.pos); b.fromQ.copy(b.q)
  const c = b.comp % COLS, r = Math.floor(b.comp / COLS)
  b.to.set(X0 + (c + 0.5 + (Math.random() - 0.5) * 0.5) * CW, 0.008, Z0 + (r + 0.5 + (Math.random() - 0.5) * 0.5) * CW)
  b.dur = 0.36 + Math.min(0.25, b.from.distanceTo(b.to) * 0.8)
  me.leaving.push(b)
}

/** Fait avancer les perles qui bougent. */
function stepBeads(me: State, dt: number) {
  const T = me.T
  for (const b of me.beads) {
    if (b.st === 'rest') {
      if (b.bump > 0) {
        b.bump = Math.max(0, b.bump - dt)
        draw(me, b, 1 + 0.2 * Math.sin(Math.PI * (1 - b.bump / 0.18)))
      }
      continue
    }
    b.t += dt
    if (b.st === 'fly') {
      const k = clamp01(b.t / b.dur), e = ease(k)
      b.pos.lerpVectors(b.from, b.to, e)
      b.pos.y += Math.sin(Math.PI * k) * 0.05
      b.q.slerpQuaternions(b.fromQ, me.needleQ, Math.min(1, e * 1.3))
      draw(me, b, b.grow + (1 - b.grow) * e)
      if (k >= 1) {
        // Elle s'enfile : le petit « tic » de l'aiguille
        b.st = 'slide'; b.t = 0
        b.dist = NEEDLE + (me.L - (b.s + b.len / 2))
        b.dur = 0.18 + b.dist * 1.25
        sfx('tick', { vol: 0.55, rate: 1.25 })
      }
    } else if (b.st === 'slide') {
      const k = clamp01(b.t / b.dur)
      const d = b.dist * (1 - Math.pow(1 - k, 2.3))
      if (d < NEEDLE) {
        b.pos.copy(me.tip).addScaledVector(me.te, -d)
        b.pos.y = TOP + BEAD_HALF[b.bead.k]
        b.q.copy(me.needleQ)
      } else {
        const u = clamp01((me.L - (d - NEEDLE)) / me.L)
        const p = me.curve.getPointAt(u), tg = me.curve.getTangentAt(u)
        b.pos.set(p.x, TOP + BEAD_HALF[b.bead.k], p.z)
        orientQ(T, b.q, tg, me.up)
      }
      if (k >= 1) {
        b.st = 'rest'
        b.bump = 0.18
        restPose(me, b)
        const k2 = b.bead.k
        if (k2 === 'glass' || k2 === 'crystal') sfx('glass', { vol: 0.22, rate: 1.7 })
        else if (k2 === 'spacer') sfx('metal', { vol: 0.25, rate: 1.6 })
        else sfx('click', { vol: 0.32, rate: 1.4 })
      }
    }
    if (b.st !== 'fly') draw(me, b)
  }
  for (let i = me.leaving.length - 1; i >= 0; i--) {
    const b = me.leaving[i]
    b.t += dt
    if (b.t < 0) continue
    const k = clamp01(b.t / b.dur), e = ease(k)
    b.pos.lerpVectors(b.from, b.to, e)
    b.pos.y += Math.sin(Math.PI * k) * 0.035
    draw(me, b, 1 - Math.max(0, k - 0.8) * 5)
    if (k >= 1) {
      unpool(me, b)
      me.leaving.splice(i, 1)
      if (Math.random() < 0.6) sfx('drop', { vol: 0.18, rate: 1.8 })
    }
  }
}

/* =====================================================================
   Le toucher : prendre une perle (au doigt ou en glissant)
   ===================================================================== */
const ray = { r: null as import('three').Raycaster | null, v: null as import('three').Vector2 | null }
function onPlane(me: State, x: number, y: number, h: number): V3 | null {
  const T = me.T
  const rect = me.stage.renderer.domElement.getBoundingClientRect()
  ray.r ??= new T.Raycaster()
  ray.v ??= new T.Vector2()
  ray.v.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1)
  ray.r.setFromCamera(ray.v, me.stage.camera)
  const o = ray.r.ray.origin, d = ray.r.ray.direction
  if (Math.abs(d.y) < 1e-6) return null
  const t = (h - o.y) / d.y
  return t > 0 ? o.clone().addScaledVector(d, t) : null
}
/** Le compartiment sous ce point (un peu de marge au bord du boîtier). */
function compAt(p: V3): number {
  const c = Math.floor((p.x - X0) / CW), r = Math.floor((p.z - Z0) / CW)
  const cc = Math.min(COLS - 1, Math.max(0, c)), rr = Math.min(ROWS - 1, Math.max(0, r))
  if (Math.abs(c - cc) > 0 || Math.abs(r - rr) > 0) {
    // Hors du boîtier : accepté à un demi-centimètre près
    const dx = p.x < X0 ? X0 - p.x : p.x > X0 + COLS * CW ? p.x - X0 - COLS * CW : 0
    const dz = p.z < Z0 ? Z0 - p.z : p.z > Z0 + ROWS * CW ? p.z - Z0 - ROWS * CW : 0
    if (Math.max(dx, dz) > 0.006) return -1
  }
  return rr * COLS + cc
}
const overBox = (p: V3) => p.x > X0 - 0.01 && p.x < X0 + COLS * CW + 0.01 && p.z > Z0 - 0.01 && p.z < Z0 + ROWS * CW + 0.01

function hideInstance(me: State, comp: number, near: V3): number {
  const c = me.box[comp]
  let best = -1, bd = Infinity
  c.pos.forEach((p, j) => {
    if (c.hidden.has(j)) return
    const d = (p.x - near.x) ** 2 + (p.z - near.z) ** 2 - p.y * 0.02 // celles du dessus d'abord
    if (d < bd) { bd = d; best = j }
  })
  if (best < 0) return -1
  c.hidden.add(best)
  c.im.setMatrixAt(best, new me.T.Matrix4().makeScale(0, 0, 0))
  c.im.instanceMatrix.needsUpdate = true
  me.dirty = 2
  return best
}
function showInstance(me: State, comp: number, j: number) {
  const c = me.box[comp]
  if (j < 0 || !c.hidden.has(j)) return
  c.hidden.delete(j)
  c.im.setMatrixAt(j, c.mats[j])
  c.im.instanceMatrix.needsUpdate = true
  me.dirty = 2
}

/** Le fil est plein : la perle reste au boîtier, l'aiguille tremble, le fermoir appelle. */
function full(me: State) {
  me.shake = 0.35
  tone(262, 0.14, 'sine', 0.07); tone(196, 0.18, 'sine', 0.06, 0.1)
  const b = document.getElementById('bjClose')
  b?.classList.remove('nudge'); void b?.offsetWidth; b?.classList.add('nudge')
}

function takeFrom(me: State, comp: number, at: V3 | null, drag: Held | null) {
  const [k] = BOX[comp]
  if (!fits(me, k)) { full(me); if (drag) showInstance(me, comp, drag.j); return }
  const T = me.T
  let from: V3, q: Q, grow = 1
  if (drag?.mesh) {
    from = drag.mesh.position.clone(); q = drag.mesh.quaternion.clone(); grow = drag.mesh.scale.x
  } else {
    const j = drag ? drag.j : hideInstance(me, comp, at || new T.Vector3())
    const c = me.box[comp]
    from = j >= 0 ? c.pos[j].clone() : new T.Vector3(X0 + ((comp % COLS) + 0.5) * CW, 0.008, Z0 + (Math.floor(comp / COLS) + 0.5) * CW)
    q = new T.Quaternion()
    if (j >= 0) c.mats[j].decompose(new T.Vector3(), q, new T.Vector3())
    // Le compartiment se remplit à nouveau (il n'est jamais vide)
    if (j >= 0) later(me, 700, () => showInstance(me, comp, j))
  }
  if (drag) later(me, 700, () => showInstance(me, comp, drag.j))
  sfx('pluck', { vol: 0.3, rate: 1.4 })
  string(me, comp, from, q, grow)
}

/* =====================================================================
   Annuler, vider, fermer
   ===================================================================== */
function refreshUi(me: State) {
  const close = document.getElementById('bjClose')
  if (!close) return
  close.classList.toggle('ready', me.beads.length > 0)
  const last = me.beads[me.beads.length - 1]
  close.classList.toggle('full', !!last && (me.beads.length >= BEADS_MAX || nextS(me) + 0.0056 > me.L - 0.003))
  document.getElementById('bjUndo')?.classList.toggle('off', !me.beads.length)
}

function undo(me: State) {
  const b = me.beads.pop()
  if (!b) { tone(220, 0.1, 'sine', 0.05); return }
  sfx('whoosh', { vol: 0.25, rate: 1.6 })
  leave(me, b)
  refreshUi(me)
}

function clearAll(me: State) {
  const btn = document.getElementById('bjClear')
  if (!me.beads.length) { tone(220, 0.1, 'sine', 0.05); return }
  if (!me.clearArmed) {
    me.clearArmed = true
    btn?.classList.add('arm')
    sfx('switch', { vol: 0.5 })
    me.c.cancel(me.clearId)
    me.clearId = me.c.after(2600, () => { me.clearArmed = false; btn?.classList.remove('arm') })
    return
  }
  me.clearArmed = false
  btn?.classList.remove('arm')
  me.c.cancel(me.clearId)
  sfx('whoosh', { vol: 0.6, rate: 0.9 })
  // Elles repartent toutes, de la dernière à la première, en cascade
  const list = me.beads.splice(0)
  list.reverse().forEach((b, i) => leave(me, b, i * 0.025))
  refreshUi(me)
}

function later(me: State, ms: number, fn: () => void) {
  const id = me.c.after(ms, () => { if (S === me && me.alive) fn() })
  me.ids.push(id)
  return id
}

function close(me: State) {
  if (me.phase !== 'work' || me.mode !== 'collier') return
  if (!me.beads.length) {
    tone(262, 0.12, 'sine', 0.06)
    const b = document.getElementById('bjClose')
    b?.classList.remove('nudge'); void b?.offsetWidth; b?.classList.add('nudge')
    return
  }
  dropHeld(me)
  me.phase = 'closing'
  setPhaseClass(me)
  // Fini le rendu à la demande : tout bouge désormais (et la qualité
  // automatique du socle reprend la main)
  me.stage.render = undefined
  // Les perles en route arrivent tout de suite ; celles qui repartaient sont rangées
  for (const b of me.beads) { b.st = 'rest'; b.bump = 0; restPose(me, b); draw(me, b) }
  for (const b of me.leaving) unpool(me, b)
  me.leaving.length = 0
  // Le collier est à elle : sa princesse le porte, ici et dans la Princesse
  useFerme.getState().wearNecklace(me.beads.map(b => ({ ...b.bead })))
  sfx('cloth', { vol: 0.35, rate: 1.3 })
  me.morph = 0.0001
}

/** Le fil se referme : du U au rond, perle après perle. */
function stepMorph(me: State, dt: number) {
  if (me.morph <= 0 || me.morph >= 1) return
  const T = me.T
  me.morph = Math.min(1, me.morph + dt / 1.1)
  const k = ease(me.morph)
  const pts = me.uPts.map((p, i) => new T.Vector3().lerpVectors(p, me.loopPts[i], k))
  me.curve = new T.CatmullRomCurve3(pts)
  // Le fil suit (reconstruit à chaque image, le temps de se fermer)
  me.cord.geometry.dispose()
  me.cord.geometry = new T.TubeGeometry(me.curve, 240, 0.00065, 6)
  const p0 = me.curve.getPointAt(0)
  me.clasp.position.set(p0.x, CORD_Y + me.lift, p0.z)
  // L'aiguille s'en va
  const nk = clamp01(me.morph * 3)
  me.needle.scale.setScalar(1 - nk)
  me.needle.visible = nk < 1
  for (const b of me.beads) { restPose(me, b); draw(me, b) }
  if (me.morph >= 1) {
    // Le fermoir claque, une pluie d'or
    sfx('metal', { vol: 0.6, rate: 1.1 })
    tone(988, 0.14, 'sine', 0.05); tone(1319, 0.16, 'sine', 0.05, 0.09); tone(1760, 0.2, 'sine', 0.04, 0.18)
    me.fx.burst({ x: p0.x, y: CORD_Y + 0.004, z: p0.z }, { count: 22, color: [0xFFE08A, 0xFFFFFF, 0xFFC94D], speed: 0.09, spread: 0.9, life: 0.8, size: 0.006, gravity: 0.05 })
    later(me, 650, () => toVitrine(me))
  }
}

/* =====================================================================
   Les perles à repasser (1/10) : la plaque, les pots, le fer
   ===================================================================== */

/** Cadre une boîte de la scène dans l'écran, moins des marges en pixels (la
    colonne d'outils, la barre, les boutons du bas) : la caméra regarde selon
    `dir` ; distance et point visé se corrigent jusqu'à ce que la boîte tienne
    pile (comme le cadrage des Perles Miroir), quelle que soit la forme de l'écran. */
function frameBox(me: State, corners: V3[], dir: V3, inset: { l: number; r: number; t: number; b: number }) {
  const T = me.T, cam = me.stage.camera
  const rect = me.stage.renderer.domElement.getBoundingClientRect()
  const W = Math.max(1, rect.width), H = Math.max(1, rect.height)
  const want = {
    x0: -1 + 2 * Math.min(inset.l, W * 0.3) / W, x1: 1 - 2 * Math.min(inset.r, W * 0.3) / W,
    y0: -1 + 2 * Math.min(inset.b, H * 0.3) / H, y1: 1 - 2 * Math.min(inset.t, H * 0.3) / H
  }
  const tg = new T.Vector3()
  corners.forEach(c => tg.add(c))
  tg.divideScalar(corners.length)
  let dist = 0
  corners.forEach(c => { dist = Math.max(dist, c.distanceTo(tg)) })
  dist *= 3
  const v = new T.Vector3(), right = new T.Vector3(), upv = new T.Vector3()
  for (let k = 0; k < 32; k++) {
    cam.position.copy(tg).addScaledVector(dir, dist)
    cam.lookAt(tg)
    cam.updateMatrixWorld()
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9
    for (const c of corners) {
      v.copy(c).project(cam)
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y)
    }
    const s = Math.max((x1 - x0) / (want.x1 - want.x0), (y1 - y0) / (want.y1 - want.y0))
    dist *= 0.35 + 0.65 * s
    const half = Math.tan(cam.fov * Math.PI / 360) * dist
    right.setFromMatrixColumn(cam.matrixWorld, 0)
    upv.setFromMatrixColumn(cam.matrixWorld, 1)
    tg.addScaledVector(right, ((x0 + x1) / 2 - (want.x0 + want.x1) / 2) * half * cam.aspect * 0.8)
    tg.addScaledVector(upv, ((y0 + y1) / 2 - (want.y0 + want.y1) / 2) * half * 0.8)
  }
  cam.position.copy(tg).addScaledVector(dir, dist)
  cam.lookAt(tg)
  cam.updateMatrixWorld()
}

/** Vue de trois quarts, depuis le devant (comme les Perles Miroir). */
const HAMA_TILT = 0.47
/** La création fondue monte vers la caméra jusqu'au quart du chemin. */
const FLY_K = 0.25
function fitHamaCam(me: State) {
  const h = me.hama
  if (!h) return
  const T = me.T
  h.root.updateWorldMatrix(true, true)
  const P = PLATE_MAX / 2 + 0.6
  const x1 = potXZ(2)[0] + POT_R + 0.3, z0 = Math.min(-P, potXZ(0)[1] - POT_R - 0.3), z1 = P
  const corners = [-P, x1].flatMap(x => [z0, z1].flatMap(z => [0, 1.4].map(y => h.root.localToWorld(new T.Vector3(x, y, z)))))
  frameBox(me, corners, new T.Vector3(0, Math.cos(HAMA_TILT), Math.sin(HAMA_TILT)), { l: 112, r: 16, t: 62, b: 100 })
}

/** Les boutons des pots (et leur nom) sur les pots 3D ; la rangée des
    plaques sous la plaque. */
function placeHamaUi(me: State) {
  const h = me.hama
  if (!h) return
  const T = me.T, st = me.stage
  const arena = document.getElementById('bjArena')
  if (!arena) return
  const a = arena.getBoundingClientRect()
  h.root.updateWorldMatrix(true, true)
  const w = (x: number, y: number, z: number) => toScreen(st, h.root.localToWorld(new T.Vector3(x, y, z)))
  for (const p of h.pots) {
    const c = w(p.pos.x, p.pos.y, p.pos.z), e = w(p.pos.x + POT_R, p.pos.y, p.pos.z), n = w(p.pos.x, p.pos.y, p.pos.z - POT_R)
    const bw = Math.abs(e.x - c.x) * 2.1, bh = Math.abs(c.y - n.y) * 2.1 + 10
    p.btn.style.width = bw + 'px'
    p.btn.style.height = bh + 'px'
    p.el.style.left = (c.x - a.left) + 'px'
    p.el.style.top = (c.y - a.top - bh / 2) + 'px'
  }
  const row = document.getElementById('bjShapes')
  if (row) row.style.left = (w(0, 0, 0).x - a.left) + 'px'
}

/** Une plaque de la forme voulue. `keep` : les perles posées qui tombent sur
    un picot de la nouvelle plaque y restent (elles sautent juste un peu). */
function makeBoard(me: State, shape: PlateShape, keep: boolean) {
  const h = me.hama!, T = me.T
  const old = h.board as Pegboard | null, oldN = h.n, oldGrid = h.grid
  const n = PLATE_SIZE[shape]
  const board = pegboard(T, { cols: n, rows: n, plate: PLATES[shape].color, opacity: 0.84, outline: plateOutline(shape), mask: plateMask(shape) })
  board.onLand = () => sfx('tick', { vol: 0.4, rate: 1.25 + Math.random() * 0.35 })
  h.root.add(board.group)
  h.board = board
  h.shape = shape
  h.n = n
  h.grid = new Array(n * n).fill(null)
  if (old) {
    if (keep && !h.fused) {
      const d = (n - oldN) / 2
      for (let r = 0; r < oldN; r++) for (let c = 0; c < oldN; c++) {
        const col = oldGrid[r * oldN + c]
        if (!col) continue
        const cc = c + d, rr = r + d
        if (!board.has(cc, rr)) continue
        h.grid[rr * n + cc] = col
        board.put(cc, rr, PALETTE[col].hex, { drop: 0.7, delay: Math.random() * 0.12 })
      }
    }
    old.dispose()
  }
  h.fused = false
  me.dirty = 3
}

/** L'atelier des perles à repasser, construit au premier passage. */
function ensureHama(me: State): Hama {
  if (me.hama) return me.hama
  const T = me.T
  const root = new T.Group()
  root.scale.setScalar(PITCH)
  me.stage.scene.add(root)
  const saved = recall(SHAPE_KEY) as PlateShape | null
  const shape: PlateShape = saved && PLATE_SHAPES.includes(saved) ? saved : 'coeur'
  const h: Hama = {
    root, board: null as unknown as Pegboard, shape, n: 0, grid: [], pots: [], color: 'rose',
    strokes: new Map(), iron: null, fly: null, fused: false, piece: null, clearArmed: false, clearId: 0
  }
  me.hama = h
  makeBoard(me, shape, false)
  // Les douze pots, chacun un petit tas de perles de sa couleur
  const holder = document.getElementById('bjPots')
  POTS.forEach((id, k) => {
    const [x, z] = potXZ(k)
    const pot = beadPot(T, PALETTE[id].hex, { radius: POT_R, bead: 0.9, count: 22, calm: true, detail: 'tiny' })
    pot.group.position.set(x, 0, z)
    pot.group.rotation.y = k * 2.4
    root.add(pot.group)
    const el = document.createElement('span')
    el.className = 'tool-item pl-pot'
    el.innerHTML = `<button class="pl-potbtn bj-potbtn" data-c="${id}" aria-label="${PALETTE[id].name}"></button><i class="tool-cap">${PALETTE[id].name}</i>`
    const btn = el.querySelector('button')!
    btn.addEventListener('pointerdown', e => {
      e.stopPropagation()
      if (me.phase === 'work' && me.mode === 'hama') pickColor(me, id)
    })
    holder?.appendChild(el)
    h.pots.push({ id, pot, pos: new T.Vector3(x, POT_R * 0.35, z), el, btn })
  })
  pickColor(me, 'rose', false)
  document.querySelectorAll<HTMLElement>('.bj-shape').forEach(b => b.classList.toggle('sel', b.dataset.s === shape))
  return h
}

/** L'établi et l'atelier en cours (`on`), ou plus rien (la vitrine, le bal). */
function showDesk(me: State, on: boolean) {
  const table = me.stage.scene.getObjectByName('etabli')
  if (table) table.visible = on
  me.work.visible = me.strand.visible = on && me.mode === 'collier'
  if (me.hama) me.hama.root.visible = on && me.mode === 'hama'
}

/** Le collier ou les perles à repasser : l'autre atelier se range (ce qui y
    est commencé reste là pour plus tard). */
function setMode(me: State, m: Mode, sound = true) {
  if (me.phase !== 'work' || me.mode === m) return
  dropHeld(me)
  if (me.hama) me.hama.strokes.clear()
  me.mode = m
  remember(MODE_KEY, m)
  const hama = m === 'hama'
  if (hama) ensureHama(me)
  showDesk(me, true)
  const a = document.getElementById('bjArena')
  if (a) a.className = a.className.replace(/\bmd-\w+/g, '').trim() + ' md-' + m
  for (const x of MODES) document.getElementById('bjMode-' + x.id)?.classList.toggle('sel', x.id === m)
  if (hama) { fitHamaCam(me); placeHamaUi(me); refreshHamaUi(me) } else { fitWorkCam(me); refreshUi(me) }
  if (sound) sfx('switch', { vol: 0.45 })
  me.dirty = 3
}

function pickColor(me: State, id: ColorId, sound = true) {
  const h = me.hama
  if (!h) return
  h.color = id
  for (const p of h.pots) {
    p.pot.select(p.id === id)
    p.btn.classList.toggle('sel', p.id === id)
  }
  if (sound) sfx('click', { vol: 0.4 })
  me.dirty = 2
}

const hamaCount = (h: Hama) => h.grid.reduce((n, c) => n + (c ? 1 : 0), 0)

function refreshHamaUi(me: State) {
  const h = me.hama
  if (!h) return
  const n = hamaCount(h)
  document.getElementById('bjIron')?.classList.toggle('ready', n > 0)
  document.getElementById('bjHClear')?.classList.toggle('off', !n)
  document.querySelector('.bj-galitem')?.classList.toggle('bj-none', !useFerme.getState().creations.length)
}

/** Pose une perle de la couleur choisie (ou reprend celle qui est là). */
function touchPeg(me: State, c: number, r: number, erase: boolean) {
  const h = me.hama!
  const i = r * h.n + c
  if (erase) {
    if (!h.grid[i]) return
    h.grid[i] = null
    h.board.take(c, r)
    sfx('pluck', { vol: 0.35, rate: 1.5 })
  } else {
    if (h.grid[i]) return
    h.grid[i] = h.color
    h.board.put(c, r, PALETTE[h.color].hex, { drop: 2.4 })
  }
  me.dirty = 2
  refreshHamaUi(me)
}

/** Le rayon du doigt dans la scène. */
function rayAt(me: State, x: number, y: number) {
  const rect = me.stage.renderer.domElement.getBoundingClientRect()
  ray.r ??= new me.T.Raycaster()
  ray.v ??= new me.T.Vector2()
  ray.v.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1)
  ray.r.setFromCamera(ray.v, me.stage.camera)
  return ray.r
}

/** Un doigt se pose : un trait commence. Il pose, ou il reprend si son
    premier picot porte une perle (la gomme d'un toucher) ; parti à côté de
    la plaque, il commence au premier picot qu'il rencontre. */
function hamaDown(me: State, e: PointerEvent) {
  const h = me.hama
  if (!h || h.fused) return
  h.strokes.set(e.pointerId, { erase: null, seen: new Set() })
  hamaMove(me, e)
}
function hamaMove(me: State, e: PointerEvent) {
  const h = me.hama
  const s = h?.strokes.get(e.pointerId)
  if (!h || !s) return
  const cell = h.board.pick(rayAt(me, e.clientX, e.clientY).ray)
  if (!cell) return
  const i = cell.r * h.n + cell.c
  if (s.seen.has(i)) return
  s.seen.add(i)
  s.erase ??= !!h.grid[i]
  touchPeg(me, cell.c, cell.r, s.erase)
}

function setShape(me: State, s: PlateShape) {
  const h = me.hama
  if (!h || me.phase !== 'work' || me.mode !== 'hama' || h.shape === s) return
  remember(SHAPE_KEY, s)
  h.strokes.clear()
  makeBoard(me, s, true)
  document.querySelectorAll<HTMLElement>('.bj-shape').forEach(b => b.classList.toggle('sel', b.dataset.s === s))
  sfx('switch', { vol: 0.45 })
  sfx('drop', { vol: 0.25, rate: 0.9 })
  placeHamaUi(me)
  refreshHamaUi(me)
}

/** Vider la plaque : deux touchers (la poubelle se dandine entre les deux). */
function clearHama(me: State) {
  const h = me.hama
  if (!h) return
  const btn = document.getElementById('bjHClear')
  if (!hamaCount(h)) { tone(220, 0.1, 'sine', 0.05); return }
  if (!h.clearArmed) {
    h.clearArmed = true
    btn?.classList.add('arm')
    sfx('switch', { vol: 0.5 })
    me.c.cancel(h.clearId)
    h.clearId = me.c.after(2600, () => { h.clearArmed = false; btn?.classList.remove('arm') })
    return
  }
  h.clearArmed = false
  btn?.classList.remove('arm')
  me.c.cancel(h.clearId)
  sfx('whoosh', { vol: 0.6, rate: 0.9 })
  for (let r = 0; r < h.n; r++) for (let c = 0; c < h.n; c++) if (h.grid[r * h.n + c]) h.board.take(c, r)
  h.grid.fill(null)
  me.dirty = 2
  refreshHamaUi(me)
}

/** Le fer : le papier sulfurisé se pose, le fer passe en S, les perles fondent. */
function startIron(me: State) {
  const h = me.hama
  if (!h || me.phase !== 'work' || me.mode !== 'hama') return
  const btn = document.getElementById('bjIron')
  if (!hamaCount(h)) {
    tone(262, 0.12, 'sine', 0.06)
    btn?.classList.remove('nudge'); void btn?.offsetWidth; btn?.classList.add('nudge')
    return
  }
  h.strokes.clear()
  h.piece = { rows: pieceOf(h.grid, h.n)! }
  me.phase = 'iron'
  setPhaseClass(me)
  // Tout bouge désormais : fini le rendu à la demande (la qualité automatique reprend la main)
  me.stage.render = undefined
  h.pots.forEach(p => p.pot.select(false))
  sfx('confirm', { vol: 0.5 })
  h.iron = ironing(me.T, h.board, {
    steam: p => me.fx.burst(p, { count: 2, color: [0xFFFFFF, 0xF2F6FA], speed: 0.006, spread: 0.5, life: 1.2, size: 0.024, gravity: -0.0065 }),
    sizzle: () => sSteam(),
    land: () => sfx('metal', { vol: 0.25, rate: 0.9 }),
    lift: () => sfx('whoosh', { vol: 0.25 })
  })
}

/** La création fondue se décolle et monte vers nous en tournant ; puis
    deux choix : la garder dans la vitrine, ou l'accrocher au collier. */
function startFly(me: State) {
  const h = me.hama!
  h.iron?.dispose()
  h.iron = null
  h.fused = true
  me.phase = 'fly'
  setPhaseClass(me)
  h.fly = { t: 0, burst: 0, out: -1 }
  sfx('pluck', { vol: 0.5, rate: 0.9 })
  later(me, 1700, () => {
    if (me.phase !== 'fly') return
    me.choose = true
    document.getElementById('bjArena')?.classList.add('choose')
  })
}

function stepFly(me: State, dt: number) {
  const h = me.hama!, f = h.fly
  if (!f) return
  f.t += dt
  const t = f.t, T = me.T
  const p = h.board.piece
  // Vers la caméra, au quart du chemin : elle grandit, presque face à nous
  const camL = h.board.group.worldToLocal(me.stage.camera.position.clone())
  const up = ease(clamp01((t - 0.3) / 1.1))
  const shake = t < 0.3 ? Math.sin(t * 13) * 0.06 : 0
  p.position.set(shake + camL.x * FLY_K * up, (t < 0.3 ? Math.sin(t / 0.3 * Math.PI) * 0.25 : 0) + camL.y * FLY_K * up + Math.sin(t * 2.2) * 0.15 * up, camL.z * FLY_K * up)
  p.rotation.x = up * HAMA_TILT * 0.9 + Math.sin(t * 1.7) * 0.05 * up
  p.rotation.y = up * Math.PI * 2 + (t > 1.4 ? Math.sin((t - 1.4) * 1.1) * 0.35 : 0)
  // Les confettis : deux gerbes de part et d'autre, aux couleurs de la création
  if (t > 0.45 && f.burst === 0) {
    f.burst = 1
    sWin()
    const inks = [...new Set(h.grid.filter((c): c is ColorId => !!c && c !== 'noir' && c !== 'marron'))].map(c => PALETTE[c].hex)
    const cols = [...inks, 0xFFFFFF, 0xFFD34D, 0xFF6B81]
    for (const side of [-1, 1]) {
      const w = h.board.group.localToWorld(new T.Vector3(side * h.n * 0.45, h.board.top, 0))
      me.fx.burst({ x: w.x, y: w.y + 0.005, z: w.z + 0.005 }, { count: 40, color: cols, speed: 0.055, spread: 0.45, life: 1.8, size: 0.011, gravity: 0.06, dir: { x: -side * 0.25, y: 1, z: 0.1 } })
    }
  }
  if (t > 1.2 && f.burst === 1) {
    f.burst = 2
    const w = h.board.group.localToWorld(new T.Vector3(0, h.board.top, 0))
    me.fx.burst({ x: w.x, y: w.y + 0.045, z: w.z }, { count: 50, color: [0xFFFFFF, 0xFFD34D, 0xFF6B81, 0x4FB8E7, 0x8CD867], speed: 0.025, spread: 1, life: 1.8, size: 0.009, gravity: 0.035 })
  }
  // Elle part (vers le collier ou la vitrine) : elle rapetisse et s'envole
  if (f.out >= 0) {
    const k = ease(clamp01((t - f.out) / 0.5))
    p.scale.setScalar(1 - 0.85 * k)
    p.position.y += k * 18
  }
}

/** « Garder » : elle rejoint la vitrine des créations (sur la tablette). */
function keepPiece(me: State) {
  const h = me.hama
  if (me.phase !== 'fly' || !me.choose || !h?.piece) return
  me.choose = false
  document.getElementById('bjArena')?.classList.remove('choose')
  useFerme.getState().keepCreation(h.piece)
  sfx('confirm', { vol: 0.5 })
  if (h.fly) h.fly.out = h.fly.t
  toGallery(me, true)
}

/** « Au collier » : elle devient le pendentif du collier (et reste aussi
    dans la vitrine des créations) ; le collier se montre sur son coussin. */
function pieceToCollar(me: State, piece: Piece, fresh: boolean) {
  const st = useFerme.getState()
  if (fresh) st.keepCreation(piece)
  st.wearPendant(piece)
  me.choose = false
  document.getElementById('bjArena')?.classList.remove('choose', 'gsel')
  sfx('cloth', { vol: 0.4, rate: 1.2 })
  tone(988, 0.14, 'sine', 0.05); tone(1319, 0.16, 'sine', 0.05, 0.09)
  const f = me.hama?.fly
  if (f && me.phase === 'fly') f.out = f.t
  if (me.gallery && me.gallery.sel >= 0) me.gallery.items[me.gallery.sel].drop = -1
  // Plus un bouton pendant que le voile tombe
  me.phase = 'loading'
  setPhaseClass(me)
  toVitrine(me)
}

/** Retour à la plaque : vide si la création vient d'être repassée. */
function backToPlate(me: State) {
  if (me.phase !== 'gallery') return
  const veil = document.getElementById('bjVeil')
  if (veil) { veil.style.background = PRESET.work.sky; veil.classList.add('on') }
  me.phase = 'loading'
  setPhaseClass(me)
  sfx('whoosh', { vol: 0.3, rate: 1.1 })
  later(me, 520, () => {
    disposeGallery(me)
    const h = ensureHama(me)
    if (h.fused) {
      h.board.clear()
      h.grid.fill(null)
      h.board.piece.position.set(0, 0, 0)
      h.board.piece.rotation.set(0, 0, 0)
      h.board.piece.scale.setScalar(1)
      h.fused = false
      h.fly = null
    }
    showDesk(me, true)
    light(me, 'work')
    const cam = me.stage.camera
    cam.fov = 38; cam.updateProjectionMatrix()
    fitHamaCam(me)
    me.phase = 'work'
    setPhaseClass(me)
    placeHamaUi(me)
    pickColor(me, h.color, false)
    refreshHamaUi(me)
    me.stage.render = me.lazy
    me.dirty = 3
    veil?.classList.remove('on')
  })
}

/* ---- La vitrine des créations : un plateau de velours, les créations dessus ---- */
const CELL = 0.1
function disposeGallery(me: State) {
  const g = me.gallery
  if (!g) return
  g.root.removeFromParent()
  g.geos.forEach(x => x.dispose())
  g.mats.forEach(x => x.dispose())
  me.gallery = null
}

function buildGallery(me: State, fresh: boolean) {
  disposeGallery(me)
  const T = me.T
  const list = useFerme.getState().creations
  const n = Math.max(1, list.length)
  const cols = n === 1 ? 1 : Math.min(6, Math.ceil(Math.sqrt(n * 1.6))), rows = Math.ceil(n / cols)
  const W = cols * CELL + 0.035, D = rows * CELL + 0.035
  const geos: import('three').BufferGeometry[] = [], mats: import('three').Material[] = []
  const root = new T.Group()
  // Le plateau : du velours bordé d'or
  const rr = (w: number, d: number, r: number) => {
    const s = new T.Shape()
    s.moveTo(-w / 2 + r, -d / 2); s.lineTo(w / 2 - r, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r)
    s.lineTo(w / 2, d / 2 - r); s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); s.lineTo(-w / 2 + r, d / 2)
    s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); s.lineTo(-w / 2, -d / 2 + r); s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2)
    return s
  }
  const slabOf = (w: number, d: number, h: number, r: number) => {
    const g = new T.ExtrudeGeometry(rr(w, d, r), { depth: h, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 3, curveSegments: 8 })
    g.rotateX(-Math.PI / 2)
    geos.push(g)
    return g
  }
  const goldM = new T.MeshPhysicalMaterial({ color: 0xB8893A, metalness: 1, roughness: 0.3 })
  const velvet = new T.MeshPhysicalMaterial({ color: 0x3E0A20, roughness: 0.95, sheen: 1, sheenRoughness: 0.35, sheenColor: new T.Color(0xB23A6A) })
  mats.push(goldM, velvet)
  const rim = new T.Mesh(slabOf(W + 0.012, D + 0.012, 0.008, 0.012), goldM)
  rim.receiveShadow = true; rim.castShadow = true
  root.add(rim)
  const pad = new T.Mesh(slabOf(W, D, 0.009, 0.01), velvet)
  pad.position.y = 0.002
  pad.receiveShadow = true
  root.add(pad)
  const top = 0.002 + 0.009 + 0.002
  // Les créations, à plat, chacune dans sa case (les plus récentes d'abord)
  const mat = fusedMaterial(T)
  mats.push(mat)
  const items: Gallery['items'] = []
  list.forEach((piece, k) => {
    const row = Math.floor(k / cols), inRow = Math.min(cols, list.length - row * cols), col = k % cols
    const geo = fusedPieceGeo(T, piece.rows, { seg: list.length <= 8 ? 10 : 8, hole: list.length <= 8 })
    const span = Math.max(piece.rows.length, piece.rows[0].length)
    // À taille réelle ; une toute petite un peu plus grande, qu'on la voie
    const s = Math.min(PITCH * 1.3, (CELL * 0.86) / (span + 0.2))
    geo.scale(s, s, s)
    geos.push(geo)
    const m = new T.Mesh(geo, mat)
    m.castShadow = true; m.receiveShadow = true
    const base = new T.Vector3((col - (inRow - 1) / 2) * CELL, top, (row - (rows - 1) / 2) * CELL)
    m.position.copy(base)
    m.rotation.y = (k % 2 ? 1 : -1) * 0.06
    root.add(m)
    items.push({ mesh: m, piece, base, lift: 0, drop: fresh && k === 0 ? 0 : 1 })
  })
  // Des bulles de lumière floues derrière, comme la vitrine du collier
  const disc = new T.CircleGeometry(1, 24)
  geos.push(disc)
  const bm = [0xFFB8D0, 0xFFE3A0, 0xE0B0FF].map(c => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.18, depthWrite: false }))
  mats.push(...bm)
  for (let i = 0; i < 22; i++) {
    const b = new T.Mesh(disc, bm[i % bm.length])
    b.scale.setScalar(0.01 + Math.random() * 0.018)
    b.position.set((Math.random() - 0.5) * (W + 0.5), 0.05 + Math.random() * 0.2, -D / 2 - 0.25 - Math.random() * 0.3)
    root.add(b)
  }
  me.stage.scene.add(root)
  me.gallery = { root, items, sel: -1, geos, mats, extent: [W + 0.03, D + 0.03] }
}

function fitGalleryCam(me: State) {
  const g = me.gallery
  if (!g) return
  const T = me.T, [W, D] = g.extent
  const corners = [-W / 2, W / 2].flatMap(x => [-D / 2, D / 2].flatMap(z => [0, 0.02].map(y => new T.Vector3(x, y, z))))
  frameBox(me, corners, new T.Vector3(0, Math.cos(0.72), Math.sin(0.72)), { l: 30, r: 30, t: 70, b: 130 })
}

function toGallery(me: State, fresh: boolean) {
  const veil = document.getElementById('bjVeil')
  if (veil) { veil.style.background = '#2B1622'; veil.classList.add('on') }
  sfx('whoosh', { vol: 0.35, rate: 0.8 })
  // Plus un bouton pendant que le voile tombe
  me.phase = 'loading'
  setPhaseClass(me)
  later(me, 520, () => {
    if (me.hama?.fly) me.hama.fly = null
    buildGallery(me, fresh)
    showDesk(me, false)
    light(me, 'vitrine')
    const cam = me.stage.camera
    cam.fov = 34; cam.updateProjectionMatrix()
    fitGalleryCam(me)
    me.stage.render = undefined
    me.phase = 'gallery'
    setPhaseClass(me)
    document.getElementById('bjArena')?.classList.remove('gsel')
    veil?.classList.remove('on')
    ;[1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.5, 'sine', 0.035, 0.25 + i * 0.16))
  })
}

/** Toucher une création : elle se soulève vers nous (« Au collier » paraît). */
function galleryTap(me: State, e: PointerEvent) {
  const g = me.gallery
  if (!g) return
  const hit = rayAt(me, e.clientX, e.clientY).intersectObjects(g.items.map(i => i.mesh), false)[0]
  const k = hit ? g.items.findIndex(i => i.mesh === hit.object) : -1
  g.sel = k >= 0 && k !== g.sel ? k : -1
  document.getElementById('bjArena')?.classList.toggle('gsel', g.sel >= 0)
  if (g.sel >= 0) { sfx('pluck', { vol: 0.35, rate: 1.3 }); tone(1175, 0.14, 'sine', 0.04) }
  else sfx('drop', { vol: 0.2, rate: 1.4 })
}

function stepGallery(me: State, dt: number) {
  const g = me.gallery
  if (!g) return
  g.items.forEach((it, k) => {
    // La nouvelle venue tombe du haut et rebondit sur le velours
    if (it.drop >= 0 && it.drop < 1) {
      it.drop = Math.min(1, it.drop + dt / 0.75)
      const d = it.drop
      const y = d < 0.6 ? (1 - (d / 0.6) ** 2) * 0.09 : Math.sin((d - 0.6) / 0.4 * Math.PI) * 0.008
      it.mesh.position.y = it.base.y + y
      if (d >= 1) {
        sfx('click', { vol: 0.35, rate: 0.9 })
        me.fx.burst({ x: it.base.x, y: it.base.y + 0.01, z: it.base.z }, { count: 16, color: [0xFFFFFF, 0xFFE9A8, 0xFFD1E3], speed: 0.05, spread: 1, life: 0.9, size: 0.008, gravity: 0.03 })
      }
      return
    }
    const want = k === g.sel ? 1 : 0
    it.lift += (want - it.lift) * Math.min(1, dt * 8)
    const l = it.lift
    if (it.drop === -1 && k === g.sel) {
      // Partie au collier : elle monte et s'efface
      it.mesh.position.y += dt * 0.25
      it.mesh.scale.multiplyScalar(Math.max(0, 1 - dt * 2))
      return
    }
    it.mesh.position.set(it.base.x, it.base.y + l * 0.022 + (l > 0.5 ? Math.sin(me.t * 2.4) * 0.002 : 0), it.base.z + l * 0.012)
    it.mesh.rotation.x = l * 0.55
  })
}

/* =====================================================================
   La vitrine : le collier sur un coussin de velours
   ===================================================================== */
type Preset = { sky: string; hemi: [string, string, number]; sun: [number, number, number]; sunI: number; area: number; far: number; fill: number; env: number; near: number; camFar: number }
const PRESET: Record<'work' | 'vitrine' | 'bal', Preset> = {
  work: { sky: '#E9D9C4', hemi: ['#FFF3E2', '#8A6A4A', 0.75], sun: [-0.3, 0.8, 0.35], sunI: 2.6, area: 0.5, far: 3, fill: 0.35, env: 0.9, near: 0.005, camFar: 6 },
  vitrine: { sky: '#2B1622', hemi: ['#FFE9F2', '#3A1A2A', 0.5], sun: [0.25, 0.6, 0.35], sunI: 2.2, area: 0.4, far: 3, fill: 0.35, env: 1.1, near: 0.005, camFar: 6 },
  bal: { sky: '#F3E4EA', hemi: ['#FFF4FA', '#C9A6B8', 1], sun: [1.8, 4.2, 3.2], sunI: 2.1, area: 4.5, far: 20, fill: 0.5, env: 0.6, near: 0.02, camFar: 60 }
}
function light(me: State, name: keyof typeof PRESET) {
  const { T, stage } = me
  const p = PRESET[name]
  const scene = stage.scene
  scene.background = new T.Color(p.sky)
  scene.fog = name === 'bal' ? new T.Fog(p.sky, 7, 16) : null
  scene.environmentIntensity = p.env
  const hemi = scene.children.find(o => (o as import('three').HemisphereLight).isHemisphereLight) as import('three').HemisphereLight | undefined
  if (hemi) { hemi.color.set(p.hemi[0]); hemi.groundColor.set(p.hemi[1]); hemi.intensity = p.hemi[2] * 0.32 }
  const fill = scene.children.find(o => (o as import('three').DirectionalLight).isDirectionalLight && o !== stage.sun) as import('three').DirectionalLight | undefined
  if (fill) fill.intensity = p.fill * 0.45
  const sun = stage.sun
  if (sun) {
    sun.position.set(p.sun[0], p.sun[1], p.sun[2])
    sun.intensity = p.sunI
    sun.color.set('#FFF1DC')
    const sc = sun.shadow.camera
    sc.left = sc.bottom = -p.area; sc.right = sc.top = p.area
    sc.near = 0.05; sc.far = p.far
    sc.updateProjectionMatrix()
  }
  stage.camera.near = p.near; stage.camera.far = p.camFar
  stage.camera.updateProjectionMatrix()
}

function buildVitrine(me: State) {
  const { T } = me
  const root = new T.Group()
  // Un plateau rond et doré, un coussin de velours bombé
  const base = new T.Mesh(new T.CylinderGeometry(0.13, 0.135, 0.012, 64), new T.MeshPhysicalMaterial({ color: 0xB8893A, metalness: 1, roughness: 0.32 }))
  base.position.y = -0.006
  base.receiveShadow = true
  root.add(base)
  const spin = new T.Group()
  root.add(spin)
  const cush = new T.Mesh(new T.SphereGeometry(0.115, 64, 32), new T.MeshPhysicalMaterial({ color: 0x3E0A20, roughness: 0.95, sheen: 1, sheenRoughness: 0.35, sheenColor: new T.Color(0xB23A6A) }))
  cush.scale.set(1, 0.24, 0.82)
  cush.position.y = 0.012
  cush.receiveShadow = true; cush.castShadow = true
  spin.add(cush)
  const btn = new T.Mesh(new T.SphereGeometry(0.006, 20, 12), new T.MeshPhysicalMaterial({ color: 0x5A1433, roughness: 0.6, sheen: 1, sheenColor: new T.Color(0xD06090) }))
  btn.scale.y = 0.5; btn.position.y = 0.012 + 0.115 * 0.24 - 0.001
  spin.add(btn)
  // Le collier posé en rond sur le bombé : le fil a la longueur de celui de
  // l'établi. Celui qu'elle porte : ses perles, et son pendentif (1/10)
  const worn = soloRoyal(useFerme.getState())
  const beads = worn.beads, pend = worn.pendant
  const pg = pend ? pendantGeos(T, pend.rows, pendantPitch(pend.rows), { seg: 12 }) : null
  const surf = (x: number, z: number) => 0.012 + 0.115 * 0.24 * Math.sqrt(Math.max(0, 1 - (x / 0.115) ** 2 - (z / (0.115 * 0.82)) ** 2))
  const L = me.L
  const ra = L / (2 * Math.PI * 0.9055), rb = ra * 0.8
  // Avec un pendentif, le rond recule pour lui laisser le devant du coussin
  const back = pg ? pg.drop * 0.55 : 0
  const pts: V3[] = []
  for (let i = 0; i < 96; i++) {
    // Du fermoir (au fond) vers le devant (u = 0,5), et retour
    const a = -Math.PI / 2 + (i / 96) * Math.PI * 2
    const x = Math.cos(a) * ra, z = Math.sin(a) * rb - back
    pts.push(new T.Vector3(x, surf(x, z), z))
  }
  const curve = new T.CatmullRomCurve3(pts, true)
  const Lc = curve.getLength()
  const cordPts = pts.map(p => p.clone().setY(p.y + 0.0033))
  spin.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(cordPts, true), 300, 0.00065, 8, true), me.cordMat))
  const run = beadRun(beads)
  // Le pendentif au milieu : un peu de place pour son anneau, les perles de part et d'autre
  const G = pg ? 0.0035 : 0
  const half = pg ? Math.ceil(beads.length / 2) : beads.length
  const gapAt = half > 0 ? run.at[half - 1] + BEAD_LEN[beads[half - 1].k] : 0
  const start = pg ? Lc / 2 - gapAt - G / 2 : Lc / 2 - run.total / 2
  const q = new T.Quaternion(), up = new T.Vector3(), one = new T.Vector3(1, 1, 1)
  const items = beads.map((bead, i) => {
    const u = (((start + run.at[i] + (i >= half ? G : 0) + BEAD_LEN[bead.k] / 2) / Lc) % 1 + 1) % 1
    const p = curve.getPointAt(u), tg = curve.getTangentAt(u)
    up.set(p.x / 0.115 * 0.3, 1, p.z / 0.1 * 0.3).normalize()
    orientQ(T, q, tg, up)
    const pos = p.clone().addScaledVector(up, BEAD_HALF[bead.k])
    return { bead, m: new T.Matrix4().compose(pos, q, one) }
  })
  // La vitrine est une scène fixe : le verre et le cristal y sont vraiment réfractés
  me.gems ??= beadKit(T, { refract: true })
  const run3d = instancedRun(T, me.gems, items)
  run3d.traverse(o => { const im = o as IM; if (im.isInstancedMesh) me.ims.push(im) })
  spin.add(run3d)
  // Le fermoir, au fond
  const gold = new T.MeshPhysicalMaterial({ color: 0xE3B65A, metalness: 1, roughness: 0.2 })
  const clasp = new T.Mesh(new T.TorusGeometry(0.004, 0.0012, 12, 28), gold)
  clasp.position.copy(curve.getPointAt(0)).y += 0.0035
  clasp.rotation.x = Math.PI / 2
  spin.add(clasp)
  if (pg) {
    // Le pendentif couché sur le velours, vers nous, pendu à son anneau
    const grp = new T.Group()
    grp.name = 'pendentif'
    const piece = new T.Mesh(pg.piece, fusedMaterial(T))
    piece.castShadow = piece.receiveShadow = true
    const ring = new T.Mesh(pg.ring, gold)
    ring.castShadow = true
    grp.add(piece, ring)
    const top = curve.getPointAt(0.5).clone()
    top.y += 0.0033
    // Il descend avec le bombé du coussin : son bout touche le velours
    const end = surf(top.x, top.z + pg.drop) + pg.thick / 2 + 0.0004
    const tilt = Math.asin(Math.max(-0.6, Math.min(0.6, (top.y - end) / pg.drop)))
    grp.position.copy(top)
    grp.rotation.x = -Math.PI / 2 + tilt
    spin.add(grp)
  }
  // Des bulles de lumière floues derrière
  const bokeh = new T.Group()
  const disc = new T.CircleGeometry(1, 32)
  const mats = [0xFFB8D0, 0xFFE3A0, 0xE0B0FF].flatMap(c => [0.14, 0.24].map(o => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false })))
  for (let i = 0; i < 26; i++) {
    const m = new T.Mesh(disc, mats[i % mats.length])
    m.scale.setScalar(0.008 + Math.random() * 0.014)
    m.position.set((Math.random() - 0.5) * 0.8, 0.04 + Math.random() * 0.16, -0.3 - Math.random() * 0.25)
    bokeh.add(m)
  }
  root.add(bokeh)
  root.visible = false
  me.stage.scene.add(root)
  me.vitrine = root
  me.spin = spin
}

function toVitrine(me: State) {
  const veil = document.getElementById('bjVeil')
  if (veil) { veil.style.background = '#2B1622'; veil.classList.add('on') }
  sfx('whoosh', { vol: 0.35, rate: 0.8 })
  me.lift = 0.0001
  later(me, 520, () => {
    buildVitrine(me)
    showDesk(me, false)
    disposeGallery(me)
    me.stage.render = undefined
    me.vitrine!.visible = true
    light(me, 'vitrine')
    const cam = me.stage.camera
    cam.fov = 34; cam.updateProjectionMatrix()
    cam.position.set(0, 0.155, 0.255); cam.lookAt(0, 0.028, 0.005)
    me.phase = 'vitrine'
    setPhaseClass(me)
    veil?.classList.remove('on')
    // Une boîte à musique qui s'ouvre
    ;[1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.5, 'sine', 0.035, 0.25 + i * 0.16))
  })
}

/* =====================================================================
   La princesse le porte
   ===================================================================== */
async function toPrincess(me: State) {
  if (me.phase !== 'vitrine') return
  me.phase = 'loading'
  setPhaseClass(me)
  sfx('confirm', { vol: 0.45 })
  const veil = document.getElementById('bjVeil')
  if (veil) { veil.style.background = '#F3E4EA'; veil.classList.add('on') }
  const arena = document.getElementById('bjArena')!
  const hideL = loader(arena, 'bijoux', 45000)
  const hide = () => { hideL(); me.hideLoad = null }
  me.hideLoad = hide
  try {
    const T = me.T
    const look = soloRoyal(useFerme.getState())
    await new Promise<void>(res => { later(me, 500, res) })
    if (!me.alive) return
    if (me.vitrine) me.vitrine.visible = false
    light(me, 'bal')
    me.decor = makeDecor(me.stage, 'bal', me.fx)
    const p = await makePrincess(T, look)
    if (!me.alive || S !== me) { p.dispose(); return }
    me.princess = p
    const fy = me.decor.floorY
    p.obj.position.set(0, fy, 0)
    p.obj.rotation.y = -0.22
    me.stage.scene.add(p.obj)
    posePrincess(p, 'idle', 0)
    p.update(0.016)
    p.obj.updateWorldMatrix(true, true)
    // La caméra : de pied en cap, puis tout près du collier
    const cam = me.stage.camera
    cam.fov = 30; cam.updateProjectionMatrix()
    const c = neckCenter(me) || new T.Vector3(0, fy + p.headY - 0.17, 0.03)
    me.camFrom = [new T.Vector3(0.15, fy + 1.05, 3.1), new T.Vector3(0.05, fy + 0.66, 0)]
    // Le collier au centre de l'image, son visage au-dessus
    me.camTo = [c.clone().add(new T.Vector3(0.14, 0.08, 0.82)), c.clone().add(new T.Vector3(0.02, 0.05, 0))]
    me.camT = -0.9
    cam.position.copy(me.camFrom[0]); cam.lookAt(me.camFrom[1])
    hide()
    me.phase = 'princess'
    setPhaseClass(me)
    veil?.classList.remove('on')
    doPose(me, 'cheer', 1.4)
    p.face.expr('joy', 1.6)
    later(me, 1600, () => { me.princess?.face.expr('love', 4) })
    confetti()
    ;[784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.3, 'sine', 0.05, i * 0.1))
  } catch (e) {
    hide()
    console.error(e)
    me.c.toast('La princesse n\'a pas pu venir')
    finish(me)
  }
}

/** Le centre de son collier, dans la scène. */
function neckCenter(me: State): V3 | null {
  const g = me.princess?.obj.getObjectByName('collier')
  if (!g) return null
  const box = new me.T.Box3().setFromObject(g)
  return box.isEmpty() ? null : box.getCenter(new me.T.Vector3())
}

function doPose(me: State, pose: Pose, dur: number) {
  me.pose = pose; me.poseT = 0; me.poseDur = dur
}

function stepPrincess(me: State, dt: number) {
  const p = me.princess
  if (!p) return
  me.poseT += dt
  if (me.pose !== 'idle' && me.poseT > me.poseDur) doPose(me, 'idle', 0)
  const yaw = posePrincess(p, me.pose, me.pose === 'idle' ? me.t : me.poseT)
  p.obj.rotation.y = -0.22 + yaw
  p.face.lookAt(me.stage.camera.position)
  p.update(dt)
  me.decor?.update(dt)
  // La caméra glisse vers le collier
  if (me.camFrom && me.camTo) {
    me.camT += dt / 2.6
    const k = ease(clamp01(me.camT))
    const cam = me.stage.camera
    cam.position.lerpVectors(me.camFrom[0], me.camTo[0], k)
    const tg = new me.T.Vector3().lerpVectors(me.camFrom[1], me.camTo[1], k)
    cam.lookAt(tg)
  }
  // Des étincelles sur les perles
  if (Math.random() < dt * 5) {
    const c = neckCenter(me)
    if (c) me.fx.burst({ x: c.x + (Math.random() - 0.5) * 0.12, y: c.y + (Math.random() - 0.5) * 0.04, z: c.z + 0.03 },
      { count: 2, color: [0xFFFFFF, 0xFFE9A8, 0xFFD1E3], speed: 0.03, spread: 1, life: 0.9, size: 0.012, gravity: 0 })
  }
}

function finish(me: State) {
  if (me.phase === 'end') return
  const gallery = me.phase === 'gallery'
  me.phase = 'end'
  setPhaseClass(me)
  sfx('confirm', { vol: 0.5 })
  me.c.finish(gallery
    ? { title: 'Quelle jolie vitrine !', msg: 'Tes créations y sont rangées', stars: 3 }
    : { title: 'Quel joli collier !', msg: 'Ta princesse le porte aussi au château', stars: 3 })
}

/* =====================================================================
   Le montage
   ===================================================================== */
function setPhaseClass(me: State) {
  const a = document.getElementById('bjArena')
  if (!a) return
  a.className = a.className.replace(/\bph-\w+/g, '').trim() + ' ph-' + me.phase
}

function dropHeld(me: State) {
  const h = me.held
  if (!h) return
  me.held = null
  if (h.mesh) { h.mesh.removeFromParent() }
  showInstance(me, h.comp, h.j)
}

export const bijoux: GameDef = {
  id: 'bijoux', name: 'Les Bijoux', icon: '📿', sq: 'sq-pink', cat: 'creatif', music: 'palace', noTier: true,
  subtitle: 'Enfile des perles, ferme le collier… et ta princesse le porte !',
  // La main : une perle du boîtier ; le fil bien garni (ou plein), le
  // fermoir ; à la vitrine, la couronne ; chez la princesse, « Fini ».
  // Les perles à repasser : un pot, puis un picot libre ; la plaque bien
  // garnie, le fer ; la création en l'air, « Garder » ou « Au collier »
  hand: root => {
    const me = S
    if (!me || !me.alive) return null
    if (me.phase === 'work' && me.mode === 'hama' && me.hama) {
      const h = me.hama
      if (h.strokes.size || h.board.busy) return null
      const iron = root.querySelector<HTMLElement>('#bjIron')
      if (iron && hamaCount(h) >= 12) return { tap: iron }
      const pots = visible(root, '.bj-potbtn')
      const pot = pots[Math.floor(Math.random() * pots.length)]
      const free: [number, number][] = []
      const m = (h.n - 1) / 2
      for (let r = 0; r < h.n; r++) for (let c = 0; c < h.n; c++) {
        if (h.board.has(c, r) && !h.grid[r * h.n + c] && Math.abs(c - m) + Math.abs(r - m) <= 5) free.push([c, r])
      }
      const peg = free[Math.floor(Math.random() * free.length)]
      if (!pot || !peg) return iron ? { tap: iron } : null
      return { taps: [pot, toScreen(me.stage, h.board.world(peg[0], peg[1], BEAD.h * 0.5))] }
    }
    if (me.phase === 'work') {
      if (me.held || me.beads.some(b => b.st !== 'rest')) return null
      const close = root.querySelector<HTMLElement>('#bjClose')
      if (close && (me.beads.length >= 14 || close.classList.contains('full'))) return { tap: close }
      const i = Math.floor(Math.random() * BOX.length)
      const c = i % COLS, r = Math.floor(i / COLS)
      return { tap: toScreen(me.stage, { x: X0 + (c + 0.5) * CW, y: 0.008, z: Z0 + (r + 0.5) * CW }) }
    }
    if (me.phase === 'fly' && me.choose) return { choose: visible(root, '#bjKeep, #bjCollar') }
    if (me.phase === 'gallery') return { choose: visible(root, '#bjAgain, #bjGalCollar, #bjGalDone') }
    if (me.phase === 'vitrine') return { tap: root.querySelector('#bjPrincess') }
    if (me.phase === 'princess') return { tap: root.querySelector('#bjDone') }
    return null
  },
  mount(c) {
    c.root.innerHTML = `
      <div class="arena g3-arena bj-arena ph-load md-collier" id="bjArena">
        <div class="bj-pots" id="bjPots"></div>
        <div class="tq-tools bj-tools">
          <div class="bj-modes">${MODES.map(m => tool('bjMode-' + m.id, m.id === 'hama' ? IC.hama : IC.collier, m.cap, 'bj-modeitem')).join('')}</div>
          <span class="bj-sep"></span>
          ${tool('bjUndo', IC.annuler, 'Annuler', 'bj-c')}
          ${tool('bjClear', IC.vider, 'Vider', 'bj-trashitem bj-c')}
          ${tool('bjHClear', IC.vider, 'Vider', 'bj-trashitem bj-h')}
          ${tool('bjGallery', IC.garder, 'Vitrine', 'bj-h bj-galitem')}
        </div>
        <div class="bj-shapes" id="bjShapes">${PLATE_SHAPES.map(s => `<span class="tool-item"><button class="sn-tool bj-shape" data-s="${s}" aria-label="${PLATES[s].cap}">${plateIcon(s)}</button><i class="tool-cap">${PLATES[s].cap}</i></span>`).join('')}</div>
        <span class="tool-item bj-go bj-closeitem"><button class="sn-tool go bj-close" id="bjClose" aria-label="Fermer le collier">${IC.fermer}</button><i class="tool-cap">Fermer</i></span>
        <span class="tool-item bj-go bj-ironitem"><button class="sn-tool go bj-close" id="bjIron" aria-label="Repasser">${IC.fer}</button><i class="tool-cap">Repasser</i></span>
        <div class="bj-choices" id="bjChoices">
          <span class="tool-item"><button class="sn-tool bj-big" id="bjKeep" aria-label="Garder">${IC.garder}</button><i class="tool-cap">Garder</i></span>
          <span class="tool-item"><button class="sn-tool go bj-big" id="bjCollar" aria-label="Au collier">${IC.pendentif}</button><i class="tool-cap">Au collier</i></span>
        </div>
        <div class="bj-galbar">
          <span class="tool-item"><button class="sn-tool bj-big" id="bjAgain" aria-label="Encore">${IC.hama}</button><i class="tool-cap">Encore</i></span>
          <span class="tool-item bj-galcollar"><button class="sn-tool go bj-big" id="bjGalCollar" aria-label="Au collier">${IC.pendentif}</button><i class="tool-cap">Au collier</i></span>
          <span class="tool-item"><button class="sn-tool go bj-big" id="bjGalDone" aria-label="Fini">${ICON.check}</button><i class="tool-cap">Fini</i></span>
        </div>
        <span class="tool-item bj-princeitem"><button class="sn-tool bj-prince" id="bjPrincess" aria-label="La princesse">${IC.couronne}</button><i class="tool-cap">La princesse</i></span>
        <span class="tool-item bj-go bj-doneitem"><button class="sn-tool go" id="bjDone" aria-label="Fini">${ICON.check}</button><i class="tool-cap">Fini</i></span>
        <div class="bj-veil" id="bjVeil"></div>
      </div>`
    document.getElementById('bjClear')!.classList.add('bj-trash')
    document.getElementById('bjHClear')!.classList.add('bj-trash')
    const arena = document.getElementById('bjArena')!
    const hideLoader = loader(arena, 'bijoux')
    preloadSfx(['tick', 'click', 'glass', 'metal', 'drop', 'pluck', 'confirm', 'switch', 'whoosh', 'cloth'])
    let me: State | null = null
    let dead = false
    const offs: (() => void)[] = []

    ;(async () => {
      const stage = await createStage(arena, {
        sky: PRESET.work.sky, cam: [0.06, 0.44, 0.12], target: [0.06, 0, -0.012], fov: 38,
        hemi: PRESET.work.hemi, sun: { pos: PRESET.work.sun, color: '#FFF1DC', intensity: PRESET.work.sunI, area: PRESET.work.area, far: PRESET.work.far },
        fill: PRESET.work.fill, exposure: 1.0, iblIntensity: PRESET.work.env
      })
      if (dead) { stage.dispose(); return }
      const T = stage.T
      // La réfraction (la vitrine) : une passe de plus, à demi-résolution
      stage.renderer.transmissionResolutionScale = 0.5
      stage.camera.near = PRESET.work.near; stage.camera.far = PRESET.work.camFar
      stage.camera.updateProjectionMatrix()
      const work = new T.Group(), strand = new T.Group()
      stage.scene.add(work, strand)
      const uPts = uPoints(T)
      const curve = new T.CatmullRomCurve3(uPts)
      const L = curve.getLength()
      const st: State = {
        c, phase: 'load', stage, T, kit: beadKit(T), gems: null, fx: particles(stage, 400), work, strand, pools: new Map(), box: [],
        beads: [], leaving: [], held: null, curve, L, uPts, loopPts: loopPoints(T, L),
        cord: null as unknown as import('three').Mesh, cordMat: null as unknown as import('three').Material,
        needle: null as unknown as import('three').Mesh, clasp: new T.Group(),
        tip: new T.Vector3(), te: new T.Vector3(), needleQ: new T.Quaternion(), needleAt: new T.Vector3(), up: new T.Vector3(0, 1, 0),
        shake: 0, morph: 0, lift: 0, ims: [],
        vitrine: null, spin: null, decor: null, princess: null, pose: 'idle', poseT: 0, poseDur: 0,
        camFrom: null, camTo: null, camT: 0, t: 0, clearArmed: false, clearId: 0, ids: [], hideLoad: null, dirty: 3,
        lazy: () => {}, alive: true, mode: 'collier', hama: null, gallery: null, choose: false
      }
      me = st
      S = st
      buildWorkbench(st)
      fitWorkCam(st)
      stage.onResize = () => {
        st.dirty = 2
        const desk = st.phase === 'work' || st.phase === 'load' || st.phase === 'closing' || st.phase === 'iron' || st.phase === 'fly'
        if (desk && st.mode === 'collier') fitWorkCam(st)
        if (desk && st.mode === 'hama') { fitHamaCam(st); placeHamaUi(st) }
        if (st.phase === 'gallery') fitGalleryCam(st)
      }
      /* L'établi est immobile la plupart du temps : il ne se redessine que
         quand quelque chose bouge (une perle qui vole, glisse, repart, tombe
         sur un picot ; la perle tenue ; l'aiguille qui tremble ; un pot qui
         se lève ; un changement de taille). Sur la tablette, autant de
         batterie et de chaleur en moins ; sous la 3D logicielle des bots, la
         page reste disponible pour le doigt. */
      st.lazy = () => {
        if (st.dirty <= 0) return
        st.dirty--
        stage.renderer.render(stage.scene, stage.camera)
      }
      stage.render = st.lazy
      hideLoader()
      st.phase = 'work'
      setPhaseClass(st)
      refreshUi(st)
      document.getElementById('bjMode-collier')?.classList.add('sel')
      if (recall(MODE_KEY) === 'hama') setMode(st, 'hama', false)

      /* --- Le doigt : un seul objet en main, suivi sur la fenêtre --- */
      const cv = stage.renderer.domElement
      const onDown = (e: PointerEvent) => {
        if (st.phase === 'princess' && st.princess) {
          // Toucher la princesse : elle tourne sur elle-même et rit
          if (st.pose === 'idle') {
            doPose(st, 'twirl', MOVES.twirl)
            st.princess.face.expr('laugh', 1.4)
            sfx('cloth', { vol: 0.4, rate: 1.2 })
            tone(1175, 0.16, 'sine', 0.05); tone(1568, 0.2, 'sine', 0.04, 0.1)
          }
          return
        }
        if (st.phase === 'gallery') { galleryTap(st, e); return }
        if (st.phase === 'work' && st.mode === 'hama') { hamaDown(st, e); return }
        if (st.phase !== 'work' || st.held) return
        const p = onPlane(st, e.clientX, e.clientY, 0.007)
        if (!p) return
        const comp = compAt(p)
        if (comp < 0) return
        st.held = { id: e.pointerId, comp, j: -1, x: e.clientX, y: e.clientY, drag: false, mesh: null, pos: p }
      }
      const onMove = (e: PointerEvent) => {
        if (st.hama?.strokes.size) { if (st.phase === 'work') hamaMove(st, e); return }
        const h = st.held
        if (!h || e.pointerId !== h.id) return
        if (!h.drag && Math.hypot(e.clientX - h.x, e.clientY - h.y) > 12) {
          const [k] = BOX[h.comp]
          if (!fits(st, k)) { st.held = null; full(st); return }
          h.drag = true
          h.j = hideInstance(st, h.comp, h.pos)
          const [kk, cc] = BOX[h.comp]
          h.mesh = st.kit.mesh({ k: kk, c: cc })
          h.mesh.scale.setScalar(1.6) // qu'on la voie encore sous le doigt
          if (h.j >= 0) st.box[h.comp].mats[h.j].decompose(new T.Vector3(), h.mesh.quaternion, new T.Vector3())
          stage.scene.add(h.mesh)
          sfx('pluck', { vol: 0.3, rate: 1.2 })
        }
        if (h.drag && h.mesh) {
          const p = onPlane(st, e.clientX, e.clientY, 0.03)
          if (p) h.mesh.position.copy(p)
        }
      }
      const onUp = (e: PointerEvent) => {
        if (st.hama?.strokes.delete(e.pointerId)) return
        const h = st.held
        if (!h || e.pointerId !== h.id) return
        st.held = null
        if (st.phase !== 'work') { if (h.mesh) h.mesh.removeFromParent(); showInstance(st, h.comp, h.j); return }
        if (!h.drag) { takeFrom(st, h.comp, h.pos, null); return }
        const p = h.mesh ? h.mesh.position : null
        if (e.type === 'pointercancel' || !p || overBox(p)) {
          // Reposée dans le boîtier
          h.mesh?.removeFromParent()
          showInstance(st, h.comp, h.j)
          sfx('drop', { vol: 0.25, rate: 1.6 })
          return
        }
        takeFrom(st, h.comp, null, h)
        h.mesh?.removeFromParent()
      }
      cv.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      offs.push(() => {
        cv.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
      })

      document.getElementById('bjUndo')!.onclick = () => { if (st.phase === 'work') undo(st) }
      document.getElementById('bjClear')!.onclick = () => { if (st.phase === 'work') clearAll(st) }
      document.getElementById('bjClose')!.onclick = () => close(st)
      document.getElementById('bjPrincess')!.onclick = () => { void toPrincess(st) }
      document.getElementById('bjDone')!.onclick = () => { if (st.phase === 'princess') finish(st) }
      // Les perles à repasser
      for (const m of MODES) document.getElementById('bjMode-' + m.id)!.onclick = () => setMode(st, m.id)
      document.querySelectorAll<HTMLElement>('.bj-shape').forEach(b => { b.onclick = () => setShape(st, b.dataset.s as PlateShape) })
      document.getElementById('bjHClear')!.onclick = () => { if (st.phase === 'work') clearHama(st) }
      document.getElementById('bjGallery')!.onclick = () => { if (st.phase === 'work' && st.mode === 'hama') toGallery(st, false) }
      document.getElementById('bjIron')!.onclick = () => startIron(st)
      document.getElementById('bjKeep')!.onclick = () => keepPiece(st)
      document.getElementById('bjCollar')!.onclick = () => {
        const p = st.hama?.piece
        if (st.phase === 'fly' && st.choose && p) pieceToCollar(st, p, true)
      }
      document.getElementById('bjAgain')!.onclick = () => backToPlate(st)
      document.getElementById('bjGalCollar')!.onclick = () => {
        const g = st.gallery
        if (st.phase === 'gallery' && g && g.sel >= 0) pieceToCollar(st, g.items[g.sel].piece, false)
      }
      document.getElementById('bjGalDone')!.onclick = () => { if (st.phase === 'gallery') finish(st) }

      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        const scr = (x: number, y: number, z: number) => toScreen(stage, { x, y, z })
        ;(window as unknown as { __bj: unknown }).__bj = {
          get phase() { return st.phase },
          stage,
          get count() { return st.beads.length },
          get moving() { return st.beads.filter(b => b.st !== 'rest').length + st.leaving.length },
          /** Le centre du compartiment i, à l'écran. */
          comp: (i: number) => scr(X0 + ((i % COLS) + 0.5) * CW, 0.008, Z0 + (Math.floor(i / COLS) + 0.5) * CW),
          /** Le milieu de la planche (où lâcher une perle glissée). */
          board: () => scr(BX, TOP, BZ),
          get beads() { return st.beads.map(b => b.bead.k) },
          /** Les perles que la princesse porte (maillages de son collier). */
          get worn() {
            let n = 0
            st.princess?.obj.getObjectByName('collier')?.traverse(o => { if ((o as import('three').Mesh).isMesh) n++ })
            return n
          },
          /* Les perles à repasser (1/10) */
          get mode() { return st.mode },
          get choose() { return st.choose },
          get hama() {
            const h = st.hama
            return h ? { placed: hamaCount(h), shape: h.shape, color: h.color, n: h.n, fused: h.fused, busy: h.board.busy } : null
          },
          /** Le picot (c, r) à l'écran (le dessus d'une perle posée). */
          peg: (cc: number, r: number) => st.hama ? toScreen(stage, st.hama.board.world(cc, r, BEAD.h * 0.5)) : null,
          /** Des picots libres, près du milieu (loin des boutons). */
          freePegs(k: number) {
            const h = st.hama
            if (!h) return []
            const m = (h.n - 1) / 2, out: { c: number; r: number; d: number }[] = []
            for (let r = 0; r < h.n; r++) for (let cc = 0; cc < h.n; cc++) {
              if (h.board.has(cc, r) && !h.grid[r * h.n + cc]) out.push({ c: cc, r, d: Math.hypot(cc - m, r - m) })
            }
            return out.sort((a, b) => a.d - b.d).slice(0, k).map(({ c: cc, r }) => ({ c: cc, r }))
          },
          /** Pose d'un coup un dessin au milieu de la plaque (captures, affiches) :
              une lettre par perle (`LETTER` de perles.ts), `.` sans perle. */
          paint(rows: string[]) {
            const h = st.hama
            if (!h || st.phase !== 'work') return
            const oy = Math.floor((h.n - rows.length) / 2), ox = Math.floor((h.n - Math.max(...rows.map(x => x.length))) / 2)
            rows.forEach((line, r) => [...line].forEach((ch, cc) => {
              const col = LETTER[ch]
              if (!col || !h.board.has(cc + ox, r + oy)) return
              if (h.grid[(r + oy) * h.n + cc + ox]) h.board.take(cc + ox, r + oy, false)
              h.grid[(r + oy) * h.n + cc + ox] = col
              h.board.put(cc + ox, r + oy, PALETTE[col].hex, { drop: 1.2, delay: r * 0.03 })
            }))
            st.dirty = 2
            refreshHamaUi(st)
          },
          /** Le pendentif gardé (ses lignes), dans la vitrine du collier, sur la princesse. */
          get pendant() { return soloRoyal(useFerme.getState()).pendant?.rows || null },
          get vitrinePendant() { return !!st.vitrine?.getObjectByName('pendentif') },
          get wornPendant() { return !!st.princess?.obj.getObjectByName('pendentif') },
          get creations() { return useFerme.getState().creations.length },
          get gallery() { return st.gallery ? { count: st.gallery.items.length, sel: st.gallery.sel } : null },
          /** Une création de la vitrine, à l'écran. */
          galleryItem: (k: number) => st.gallery?.items[k] ? toScreen(stage, st.gallery.items[k].mesh.position) : null
        }
      }

      stage.start(dt => {
        st.t += dt
        const h = st.hama
        if (h && h.root.visible) {
          // Les perles à repasser : les perles qui tombent, les pots, le fer, l'envol
          h.board.update(dt)
          for (const p of h.pots) p.pot.update(dt)
          if (h.board.busy || h.pots.some(p => p.pot.moving)) st.dirty = 2
          if (st.phase === 'iron' && h.iron && h.iron.update(dt)) startFly(st)
          if (h.fly) stepFly(st, dt)
        }
        if (st.gallery) stepGallery(st, dt)
        if ((st.phase === 'work' || st.phase === 'closing') && st.mode === 'collier') {
          if (st.held?.mesh || st.shake > 0 || st.leaving.length || st.beads.some(b => b.st !== 'rest' || b.bump > 0)) st.dirty = 2
          stepBeads(st, dt)
          stepMorph(st, dt)
          if (st.shake > 0) {
            // L'aiguille frétille de côté, puis revient à sa place
            st.shake = Math.max(0, st.shake - dt)
            st.needle.position.copy(st.needleAt)
            st.needle.position.x += Math.sin(st.t * 70) * st.shake * 0.004 * st.te.z
            st.needle.position.z -= Math.sin(st.t * 70) * st.shake * 0.004 * st.te.x
          }
        }
        if (st.lift > 0 && st.phase === 'closing') {
          // Le collier fermé se soulève de la planche
          st.lift = Math.min(0.06, st.lift + dt * 0.12)
          st.strand.position.y = st.lift
          st.cord.position.y = CORD_Y + st.lift
          st.clasp.position.y = CORD_Y + st.lift
        }
        if (st.phase === 'vitrine' && st.spin) {
          // Il se balance doucement, ses perles toujours tournées vers nous
          st.spin.rotation.y = Math.sin(st.t * 0.4) * 0.45
          if (Math.random() < dt * 9) {
            const a = Math.random() * Math.PI * 2
            st.fx.burst({ x: Math.cos(a) * 0.07, y: 0.05 + Math.random() * 0.03, z: Math.sin(a) * 0.06 },
              { count: 1, color: [0xFFFFFF, 0xFFE9A8, 0xFFD1E3], speed: 0.01, spread: 0.01, life: 1.2, size: 0.006, gravity: 0.004 })
          }
        }
        if (st.phase === 'princess' || st.phase === 'end') stepPrincess(st, dt)
        st.fx.update(dt)
      })
    })().catch(err => {
      hideLoader()
      console.error(err)
      c.toast('La 3D n\'est pas disponible ici')
    })

    return () => {
      if (dead) return
      dead = true
      hideLoader()
      offs.forEach(f => f())
      const st = me
      if (st) {
        st.alive = false
        st.hideLoad?.()
        st.ids.forEach(id => c.cancel(id))
        st.princess?.dispose()
        st.decor?.dispose()
        st.ims.forEach(im => im.dispose())
        st.kit.dispose()
        st.gems?.dispose()
        // Les perles à repasser : la plaque, le fer, les pots ; la vitrine des créations
        const h = st.hama
        if (h) {
          if (h.clearId) c.cancel(h.clearId)
          h.iron?.dispose()
          h.board.dispose()
          h.pots.forEach(p => p.pot.dispose())
        }
        disposeGallery(st)
        st.fx.dispose()
        st.stage.dispose()
      }
      if (S === st) S = null
      const w = window as unknown as { __bj?: unknown }
      if (w.__bj) delete w.__bj
    }
  }
}
