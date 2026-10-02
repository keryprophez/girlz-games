import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { isPaused } from '../core/session'
import { force, impact } from '../core/impact'
import { createStage, loader, woodTex, type Stage, type T3 } from '../core/three3d'
import { particles, camShake, toScreen, decor, type Particles, type CamShake } from '../core/scene3d'
import { arcade, type Arcade } from '../core/arcade'
import { critterKit, type Critter, type CritterKind, type CritterKit } from '../core/critters'
import { cry, preloadCries, sfx, preloadSfx, type AnimalVoice } from '../core/sfx'
import { planks, hayTex } from '../core/barn3d'
import { ICON } from '../core/icons'
import {
  Pinball, CFG, TABLE, SLING, MOUTH, EGGS, BUMPERS, POSTS, TOP_POST, CHUTE_OUT, RAMP_LEN, R,
  LEFT, RIGHT, autoPilot, type Side, type PinEvent, type Ball
} from '../core/pinball'

/* 🎯 Le Flipper de la grange (1/10) — « deux pouces pour deux batteurs, le
   geste le plus naturel sur une tablette ». Un vrai plateau de flipper en
   bois de grange, penché, vu depuis le bas : la moitié gauche de l'écran
   lève le batteur gauche, la moitié droite le droit (plusieurs doigts à la
   fois, suivis par `pointerId`), tant que le doigt reste posé.

   - Les BUMPERS sont la vache, le cochon et le mouton, chacun sur son
     coussin : la bille les touche, ils sautent, s'illuminent et crient de
     leur VRAIE voix (`cry()`, jamais deux fois la même voix en même temps,
     jamais plus de deux à la fois : une série de dix chocs ne coupe pas les
     cris toutes les 50 ms) ;
   - les trois œufs de la poule, le long du bord gauche, tombent quand on
     les touche ; les trois tombés, la poule chante et tout se relève ;
   - la RAMPE en bois, à droite, monte jusqu'au grenier de la grange (le coq
     chante sur le toit) ; la bille redescend par la goulotte de gauche, vers
     le batteur. Trop molle, elle redescend la rampe ;
   - une SÉRIE de chocs sans temps mort allume les quatre lampes sous les
     animaux, la musique monte (core/arcade), et à la dernière la grange
     lâche deux billes de plus : le multibille ;
   - à la fleur, le chien garde la sortie : il renvoie parfois la bille (et
   toujours dans les premières secondes) — « ouf ». Une bille rattrapée de
     justesse au bord de la sortie fait aussi son « ouf » ;
   - à la flamme, les animaux vont et viennent sur leur coussin ;
   - la dernière bille qui tombe passe au ralenti, puis les animaux saluent.

   La physique est dans `core/pinball.ts` (pure, testée hors navigateur sur
   des centaines de parties) ; ici, on la montre. À deux (`ctx.duo`), chaque
   sœur a son batteur — doré à gauche, rose à droite, comme les lames du
   Ninja —, un seul score, et les messages de fin disent « vous ». */

/** L'inclinaison VISIBLE de la table (la gravité de la bille est réglée à part). */
const ALPHA = 0.13
/** Le plateau : du bas de la façade au haut de la coupole. */
const X0 = -2.98, X1 = 3.68, Y0 = -1.05
const OUT_R = TABLE.arc.r + 0.28
const Y1 = TABLE.arc.y + OUT_R
const FRAME_H = 0.5
/** La façade du bas : une lèvre de bois sous laquelle la bille perdue disparaît. */
const APRON = { y0: -0.78, y1: -0.25, h: 0.52 }
const SERIES_LAMPS = 4
/** La hauteur des portes du grenier sur la façade de la grange. */
const LOFT = 1.62
/** La caméra : derrière les batteurs, en hauteur, toute la table et la grange dans l'écran. */
const CAM = { y: 11.1, z: 6.8, ty: 0.95, tz: -4.9, fov: 42 }

interface BumperView {
  c: Critter
  /** Le halo de lumière sur le plateau, autour du coussin. */
  halo: import('three').Mesh
  haloMat: import('three').MeshBasicMaterial
  base: import('three').Mesh
  ring: import('three').Mesh
  cushion: import('three').MeshStandardMaterial
  ringMat: import('three').MeshStandardMaterial
  glow: import('three').MeshStandardMaterial[]
  hop: number
  flash: number
  voice: AnimalVoice
  color: number
}

interface BallView { mesh: import('three').Mesh; blob: import('three').Mesh }

interface Lamp { m: import('three').MeshStandardMaterial; on: number; base: number }

interface State {
  stage: Stage
  T: T3
  sim: Pinball
  game: Arcade
  fx: Particles
  shake: CamShake
  kit: CritterKit
  table: import('three').Group
  balls: Map<number, BallView>
  ballGeo: import('three').SphereGeometry
  ballMat: import('three').Material
  blobGeo: import('three').PlaneGeometry
  blobMat: import('three').Material
  flippers: import('three').Group[]
  bumpers: BumperView[]
  eggs: { mesh: import('three').Mesh; h: number }[]
  hen: Critter
  dog: Critter
  rooster: Critter
  /** Les sauts des personnages qui ne sont pas des bumpers. */
  hops: Map<Critter, number>
  slings: import('three').Mesh[]
  slingKick: number[]
  rampCurve: import('three').CatmullRomCurve3
  chuteCurve: import('three').CatmullRomCurve3
  plunger: { rod: import('three').Group; spring: import('three').Mesh }
  knob: import('three').Object3D
  barnGlow: import('three').MeshStandardMaterial[]
  bulbs: import('three').MeshStandardMaterial[]
  lamps: { series: Lamp[]; ramp: Lamp[]; eggs: Lamp[]; paw: Lamp | null }
  /** Les doigts posés : chacun son batteur (ou le ressort). */
  pointers: Map<number, Side | 'plunger'>
  keys: { l: boolean; r: boolean; p: boolean }
  /** Les cris en cours : jusqu'à quand chaque voix chante (temps simulé). */
  singing: Map<AnimalVoice, number>
  lastHit: number
  multiAt: number
  armed: boolean
  party: number
  over: boolean
  /** Tests seulement : le salut de la fin, sans finir la partie (les captures). */
  saluting: boolean
  outroT: number
  slowFor: number
  /** La dernière bille de la dernière vie, perdue : elle tombe au ralenti. */
  finalSlow: boolean
  /** Le mode du dernier image (lancer ou jeu) : les batteurs suivent les doigts au changement. */
  wasLaunch: boolean
  frozen: boolean
  /** Tests seulement : la simulation fait N pas d'image par image (la 3D
      logicielle rend une image par seconde ; la physique, elle, est à pas
      fixes : le résultat est le même, plus vite). */
  turbo: number
  t: number
  stats: { bumpers: number; flips: number; ramps: number; eggs: number; cries: number; saves: number; near: number; launches: number; drains: number; multis: number }
}

let pb: State | null = null
let ctx: GameContext

/* ---------- Le plateau peint ---------- */

/** Les planches de grange du plateau, peintes à la ferme : un soleil sous
    les animaux, un pré en bas, des fleurs, les flèches vers la rampe et les
    œufs. Les couleurs restent SOMBRES : la lumière les remonte (ACES). */
function playfieldTex(T: T3) {
  const CW = 1024, CH = 2048
  const c = document.createElement('canvas')
  c.width = CW; c.height = CH
  const g = c.getContext('2d')!
  const X = (x: number) => (x - X0) / (X1 - X0) * CW
  const Y = (y: number) => (1 - (y - Y0) / (Y1 - Y0)) * CH
  const S = CW / (X1 - X0)
  // Les planches, dans le sens de la table
  const bw = 0.48
  for (let i = 0, x = X0; x < X1; i++, x += bw) {
    const l = 0.86 + ((i * 53) % 13) / 70
    g.fillStyle = `rgb(${Math.round(150 * l)},${Math.round(98 * l)},${Math.round(56 * l)})`
    g.fillRect(X(x), 0, bw * S + 1, CH)
    for (let k = 0; k < 14; k++) {
      g.strokeStyle = `rgba(80,48,22,${0.08 + Math.random() * 0.12})`
      g.lineWidth = 1 + Math.random() * 2
      const xx = X(x) + 4 + Math.random() * (bw * S - 8)
      g.beginPath(); g.moveTo(xx, 0)
      g.bezierCurveTo(xx + (Math.random() - 0.5) * 10, CH * 0.33, xx + (Math.random() - 0.5) * 10, CH * 0.66, xx, CH)
      g.stroke()
    }
    g.fillStyle = 'rgba(58,34,16,.75)'
    g.fillRect(X(x), 0, 3, CH)
    // Les nœuds du bois
    for (let k = 0; k < 3; k++) {
      g.fillStyle = 'rgba(70,40,18,.35)'
      g.beginPath(); g.ellipse(X(x) + bw * S * (0.3 + Math.random() * 0.4), Math.random() * CH, 6, 12, 0, 0, Math.PI * 2); g.fill()
    }
  }
  // Un grand soleil peint sous les animaux
  const sx = X(-0.05), sy = Y(7.55)
  const sun = g.createRadialGradient(sx, sy, 10, sx, sy, 2.4 * S)
  sun.addColorStop(0, 'rgba(232,170,60,.95)')
  sun.addColorStop(0.55, 'rgba(214,140,48,.55)')
  sun.addColorStop(1, 'rgba(200,120,40,0)')
  g.fillStyle = sun
  g.beginPath(); g.arc(sx, sy, 2.4 * S, 0, Math.PI * 2); g.fill()
  g.fillStyle = 'rgba(236,184,80,.45)'
  for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2
    g.beginPath()
    g.moveTo(sx + Math.cos(a - 0.09) * 1.9 * S, sy + Math.sin(a - 0.09) * 1.9 * S)
    g.lineTo(sx + Math.cos(a) * 2.7 * S, sy + Math.sin(a) * 2.7 * S)
    g.lineTo(sx + Math.cos(a + 0.09) * 1.9 * S, sy + Math.sin(a + 0.09) * 1.9 * S)
    g.fill()
  }
  // Le pré, en bas, au-dessus des batteurs
  const meadow = g.createLinearGradient(0, Y(4.2), 0, Y(1.0))
  meadow.addColorStop(0, 'rgba(74,130,58,0)')
  meadow.addColorStop(0.45, 'rgba(74,130,58,.55)')
  meadow.addColorStop(1, 'rgba(60,112,48,.8)')
  g.fillStyle = meadow
  g.fillRect(X(TABLE.left), Y(4.2), (TABLE.right - TABLE.left) * S, Y(-0.3) - Y(4.2))
  // Des brins d'herbe et des fleurs
  for (let k = 0; k < 160; k++) {
    const x = TABLE.left + Math.random() * (TABLE.right - TABLE.left)
    const y = 0.6 + Math.random() * 2.6
    g.strokeStyle = `rgba(${60 + Math.random() * 30},${120 + Math.random() * 40},50,.7)`
    g.lineWidth = 2
    g.beginPath(); g.moveTo(X(x), Y(y)); g.lineTo(X(x) + (Math.random() - 0.5) * 6, Y(y) - 8 - Math.random() * 10); g.stroke()
  }
  const flower = (x: number, y: number, col: string, r = 0.07) => {
    g.fillStyle = col
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2
      g.beginPath(); g.arc(X(x) + Math.cos(a) * r * S * 0.9, Y(y) + Math.sin(a) * r * S * 0.9, r * S * 0.62, 0, Math.PI * 2); g.fill()
    }
    g.fillStyle = 'rgba(232,184,64,1)'
    g.beginPath(); g.arc(X(x), Y(y), r * S * 0.45, 0, Math.PI * 2); g.fill()
  }
  const cols = ['rgba(214,84,120,.95)', 'rgba(236,236,226,.95)', 'rgba(150,110,220,.95)', 'rgba(232,150,60,.95)']
  for (let k = 0; k < 22; k++) flower(TABLE.left + 0.3 + Math.random() * 5.0, 0.9 + Math.random() * 2.4, cols[k % 4], 0.05 + Math.random() * 0.04)
  for (let k = 0; k < 10; k++) flower(TABLE.left + 0.3 + Math.random() * 5.0, 4.4 + Math.random() * 5.2, cols[k % 4], 0.05)
  // Le couloir du lanceur, plus sombre
  g.fillStyle = 'rgba(40,22,10,.35)'
  g.fillRect(X(TABLE.laneL), 0, (TABLE.laneR - TABLE.laneL) * S, CH)
  // La sortie : un trou d'ombre entre les batteurs
  const drain = g.createRadialGradient(X(0), Y(-0.2), 4, X(0), Y(-0.2), 0.9 * S)
  drain.addColorStop(0, 'rgba(20,10,4,.9)')
  drain.addColorStop(1, 'rgba(20,10,4,0)')
  g.fillStyle = drain
  g.fillRect(X(-1), Y(0.8), 2 * S, Y(-1) - Y(0.8))
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  t.anisotropy = 8
  // Les coordonnées de la forme SONT les UV (ExtrudeGeometry) : on ramène le plateau à [0, 1]
  t.repeat.set(1 / (X1 - X0), 1 / (Y1 - Y0))
  t.offset.set(-X0 / (X1 - X0), -Y0 / (Y1 - Y0))
  return t
}

/** Le contour du plateau : rectangle en bas, demi-cercle en haut. */
function boardShape(T: T3, pad: number, bottom: number) {
  const a = TABLE.arc
  const sh = new T.Shape()
  sh.moveTo(TABLE.left - pad, bottom)
  sh.lineTo(TABLE.laneR + pad, bottom)
  sh.lineTo(TABLE.laneR + pad, a.y)
  sh.absarc(a.x, a.y, a.r + pad, 0, Math.PI, false)
  sh.lineTo(TABLE.left - pad, bottom)
  return sh
}

/** Un polygone du plateau (coordonnées de la table) en bloc de hauteur `h`. */
function slab(T: T3, pts: [number, number][], h: number, mat: import('three').Material | import('three').Material[], bevel = 0.02) {
  const sh = new T.Shape(pts.map(([x, y]) => new T.Vector2(x, y)))
  const geo = new T.ExtrudeGeometry(sh, { depth: h - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, bevelOffset: -bevel })
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, bevel, 0)
  const m = new T.Mesh(geo, mat)
  m.castShadow = true; m.receiveShadow = true
  return m
}

/** Une poutre du plateau entre deux points (coordonnées de la table). */
function beam(T: T3, ax: number, ay: number, bx: number, by: number, w: number, h: number, mat: import('three').Material, h0 = 0) {
  const len = Math.hypot(bx - ax, by - ay)
  const m = new T.Mesh(new T.BoxGeometry(len, h, w), mat)
  m.position.set((ax + bx) / 2, h0 + h / 2, -(ay + by) / 2)
  m.rotation.y = Math.atan2(by - ay, bx - ax)
  m.castShadow = true; m.receiveShadow = true
  return m
}

/** La forme d'un batteur : une capsule effilée (rayon `r0` au pivot, `r1` au bout). */
function flipperShape(T: T3, len: number, r0: number, r1: number) {
  const phi = Math.asin((r0 - r1) / len)
  const top = Math.PI / 2 - phi
  const sh = new T.Shape()
  sh.moveTo(len + r1 * Math.cos(top), r1 * Math.sin(top))
  sh.absarc(len, 0, r1, top, -top, true)
  sh.lineTo(r0 * Math.cos(-top), r0 * Math.sin(-top))
  sh.absarc(0, 0, r0, -top, top - Math.PI * 2, true)
  sh.closePath()
  return sh
}

/** Une lueur ronde (le halo des animaux qui s'allument). */
function glowTex(T: T3) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(64, 64, 18, 64, 64, 64)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.45, 'rgba(255,255,255,.55)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 128, 128)
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  return t
}

/** Un dégradé rond (l'ombre douce sous la bille). */
function blobTex(T: T3) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32)
  gr.addColorStop(0, 'rgba(20,10,4,.55)')
  gr.addColorStop(1, 'rgba(20,10,4,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 64)
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  return t
}

/** Une lampe encastrée dans le plateau (ronde ou en flèche). */
function lamp(me: State, x: number, y: number, color: number, shape: 'dot' | 'arrow' | 'egg' | 'paw', rot = 0, size = 0.16): Lamp {
  const { T } = me
  let geo: import('three').BufferGeometry
  if (shape === 'arrow') {
    const s = new T.Shape()
    s.moveTo(-size, -size * 0.7); s.lineTo(0, size * 0.55); s.lineTo(size, -size * 0.7); s.lineTo(size * 0.55, -size * 0.7)
    s.lineTo(0, -size * 0.05); s.lineTo(-size * 0.55, -size * 0.7); s.closePath()
    geo = new T.ShapeGeometry(s)
  } else if (shape === 'egg') {
    geo = new T.CircleGeometry(size, 28)
    geo.scale(0.78, 1, 1)
  } else if (shape === 'paw') {
    // Une empreinte de patte : un coussinet et quatre doigts
    const parts: import('three').BufferGeometry[] = []
    const pad = new T.CircleGeometry(size * 0.55, 24); pad.scale(1.15, 0.9, 1); pad.translate(0, -size * 0.25, 0); parts.push(pad)
    for (const [dx, dy] of [[-0.6, 0.35], [-0.22, 0.62], [0.22, 0.62], [0.6, 0.35]]) {
      const toe = new T.CircleGeometry(size * 0.24, 16); toe.translate(dx * size, dy * size, 0); parts.push(toe)
    }
    geo = mergeFlat(T, parts)
  } else geo = new T.CircleGeometry(size, 28)
  const m = new T.MeshStandardMaterial({ color: 0x2A1A10, emissive: color, emissiveIntensity: 0.12, roughness: 0.35, metalness: 0 })
  const mesh = new T.Mesh(geo, m)
  mesh.rotation.x = -Math.PI / 2
  mesh.rotation.z = rot
  mesh.position.set(x, 0.008, -y)
  mesh.receiveShadow = true
  me.table.add(mesh)
  // Un liseré clair autour des lampes rondes : elles se voient éteintes
  if (shape === 'dot' || shape === 'egg') {
    const rim = new T.Mesh(new T.RingGeometry(size, size * 1.22, 28), new T.MeshStandardMaterial({ color: 0xD9C7A0, roughness: 0.5 }))
    rim.rotation.x = -Math.PI / 2
    rim.position.set(x, 0.007, -y)
    if (shape === 'egg') rim.scale.set(0.78, 1, 1)
    me.table.add(rim)
  }
  return { m, on: 0, base: 0.12 }
}

/** Fusionne des géométries planes (positions, normales, uv) sans dépendance de plus. */
function mergeFlat(T: T3, parts: import('three').BufferGeometry[]) {
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = []
  let off = 0
  for (const p of parts) {
    const P = p.getAttribute('position'), N = p.getAttribute('normal'), U = p.getAttribute('uv')
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i)); nrm.push(N.getX(i), N.getY(i), N.getZ(i)); uv.push(U.getX(i), U.getY(i))
    }
    const I = p.getIndex()
    if (I) for (let i = 0; i < I.count; i++) idx.push(I.getX(i) + off)
    off += P.count
    p.dispose()
  }
  const g = new T.BufferGeometry()
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3))
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/** Chaque animal-bumper a SES matériaux (on l'allume sans allumer les autres). */
function ownMaterials(c: Critter): import('three').MeshStandardMaterial[] {
  const out: import('three').MeshStandardMaterial[] = []
  const seen = new Map<import('three').Material, import('three').Material>()
  c.obj.traverse(o => {
    const m = o as import('three').Mesh
    if (!m.isMesh) return
    const src = m.material as import('three').Material
    let cl = seen.get(src)
    if (!cl) {
      cl = src.clone()
      seen.set(src, cl)
      if ((cl as import('three').MeshStandardMaterial).isMeshStandardMaterial) out.push(cl as import('three').MeshStandardMaterial)
    }
    m.material = cl
  })
  return out
}

/* ---------- La construction ---------- */

function buildTable(me: State) {
  const { T, table, stage } = me
  const keep = <X extends { dispose(): void }>(x: X) => stage.keep(x)

  // Le plateau
  const pf = keep(playfieldTex(T))
  const boardMat = new T.MeshStandardMaterial({ map: pf, roughness: 0.62, metalness: 0 })
  const sideWood = keep(woodTex(T, '#7A4C28'))
  const sideMat = new T.MeshStandardMaterial({ map: sideWood, roughness: 0.8 })
  const boardGeo = new T.ExtrudeGeometry(boardShape(T, 0.28, Y0), { depth: 0.3, bevelEnabled: false, curveSegments: 48 })
  boardGeo.rotateX(-Math.PI / 2)
  boardGeo.translate(0, -0.3, 0)
  const board = new T.Mesh(boardGeo, [boardMat, sideMat])
  board.receiveShadow = true
  table.add(board)

  // Le cadre : une couronne de bois autour du plateau
  const frameTex = keep(planks(T, '#6B3D1E', '#2E1A0C', 8))
  frameTex.repeat.set(0.35, 0.35)
  const frameMat = new T.MeshStandardMaterial({ map: frameTex, roughness: 0.78 })
  const frameShape = boardShape(T, 0.28, Y0)
  const hole = new T.Path()
  const a = TABLE.arc
  hole.moveTo(TABLE.left, APRON.y0)
  hole.lineTo(TABLE.laneR, APRON.y0)
  hole.lineTo(TABLE.laneR, a.y)
  hole.absarc(a.x, a.y, a.r, 0, Math.PI, false)
  hole.lineTo(TABLE.left, APRON.y0)
  frameShape.holes.push(hole)
  const frameGeo = new T.ExtrudeGeometry(frameShape, { depth: FRAME_H - 0.04, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, bevelOffset: -0.03, curveSegments: 48 })
  frameGeo.rotateX(-Math.PI / 2)
  frameGeo.translate(0, 0.01, 0)
  const frame = new T.Mesh(frameGeo, frameMat)
  frame.castShadow = true; frame.receiveShadow = true
  table.add(frame)

  // Les talus sous les rails (là où la bille ne va pas), et la façade qui cache la sortie
  const bankTex = keep(planks(T, '#7E4A24', '#3A2210', 5))
  bankTex.repeat.set(0.5, 0.5)
  const bankMat = new T.MeshStandardMaterial({ map: bankTex, roughness: 0.75 })
  for (const k of [1, -1]) {
    const pts: [number, number][] = k > 0
      ? [[TABLE.left, 2.4], [-1.4, 1.5], [-1.32, 1.12], [-0.5, APRON.y1], [TABLE.left, APRON.y1]]
      : [[1.32, 1.12], [1.4, 1.5], [TABLE.right + 0.05, 2.4], [TABLE.right + 0.05, APRON.y1], [0.5, APRON.y1]]
    table.add(slab(T, pts, 0.26, bankMat))
  }
  // (une PLAQUE à 0,42 du plateau : la bille, haute de 0,4, passe dessous)
  const apron = slab(T, [[TABLE.left, APRON.y0], [TABLE.laneL - 0.05, APRON.y0], [TABLE.laneL - 0.05, APRON.y1], [TABLE.left, APRON.y1]], APRON.h - 0.42, bankMat, 0.025)
  apron.position.y = 0.42
  table.add(apron)

  // La cloison du couloir, le portillon, les rails de métal
  const railMat = new T.MeshStandardMaterial({ color: 0xA9B2BA, metalness: 0.85, roughness: 0.3 })
  const woodMat = new T.MeshStandardMaterial({ map: frameTex, roughness: 0.78 })
  table.add(beam(T, 2.75, TABLE.laneBottom - 0.1, 2.75, TABLE.dividerTop, 0.1, 0.36, woodMat))
  const gate = beam(T, 2.8, TABLE.dividerTop, TABLE.laneR, TABLE.dividerTop + 0.4, 0.05, 0.18, railMat, 0.12)
  table.add(gate)
  for (const k of [1, -1]) table.add(beam(T, k * TABLE.left, 2.4, k * -1.4, 1.5, 0.06, 0.3, railMat))
  // Le nez du ressort
  table.add(beam(T, TABLE.laneL, TABLE.laneBottom - 0.05, TABLE.laneR, TABLE.laneBottom - 0.05, 0.1, 0.3, woodMat))

  // Les bottes de foin au-dessus des batteurs, avec leur élastique rouge
  const hay = keep(hayTex(T))
  hay.wrapS = hay.wrapT = T.RepeatWrapping
  hay.repeat.set(1.6, 1.6)
  const hayMat = new T.MeshStandardMaterial({ map: hay, roughness: 1, color: 0xF0D8A0 })
  const rubber = new T.MeshStandardMaterial({ color: 0xA8221C, roughness: 0.45 })
  const whiteRubber = new T.MeshStandardMaterial({ color: 0xE8E2D8, roughness: 0.5 })
  for (const k of [1, -1]) {
    const s = SLING
    const pts: [number, number][] = [[k * s.bottom.x, s.bottom.y], [k * s.tip.x, s.tip.y], [k * s.top.x, s.top.y]]
    if (k < 0) pts.reverse()
    const bale = slab(T, pts, 0.42, hayMat, 0.05)
    table.add(bale)
    const kickM = beam(T, k * s.top.x, s.top.y, k * s.tip.x, s.tip.y, 0.07, 0.16, rubber, 0.14)
    table.add(kickM)
    me.slings.push(kickM)
    me.slingKick.push(0)
  }

  // Les poteaux (bois et anneau de caoutchouc) ; le piquet du haut a sa fleur
  const pegMat = new T.MeshStandardMaterial({ color: 0x8A5A30, roughness: 0.7 })
  for (const p of POSTS) {
    const peg = new T.Mesh(new T.CylinderGeometry(p.r * 0.7, p.r * 0.8, 0.5, 14), pegMat)
    peg.position.set(p.x, 0.25, -p.y)
    peg.castShadow = true
    table.add(peg)
    const ring = new T.Mesh(new T.TorusGeometry(p.r * 0.86, 0.04, 8, 20), p === POSTS[POSTS.length - 1] ? rubber : whiteRubber)
    ring.rotation.x = Math.PI / 2
    ring.position.set(p.x, 0.16, -p.y)
    table.add(ring)
  }
  const petal = new T.MeshStandardMaterial({ color: 0xC24A78, roughness: 0.6 })
  const heart = new T.MeshStandardMaterial({ color: 0xD9A72A, roughness: 0.5 })
  for (let i = 0; i < 5; i++) {
    const an = i / 5 * Math.PI * 2
    const pt = new T.Mesh(new T.SphereGeometry(0.075, 12, 8), petal)
    pt.scale.set(1, 0.4, 1)
    pt.position.set(TOP_POST.x + Math.cos(an) * 0.09, 0.53, -TOP_POST.y + Math.sin(an) * 0.09)
    table.add(pt)
  }
  const ht = new T.Mesh(new T.SphereGeometry(0.06, 12, 8), heart)
  ht.position.set(TOP_POST.x, 0.56, -TOP_POST.y)
  table.add(ht)

  // (le canal de la rampe n'a pas de rails à lui : le bas de la rampe le couvre)

  // Le nid et les trois œufs
  const nestMat = new T.MeshStandardMaterial({ map: hay, roughness: 1, color: 0xB89050 })
  table.add(slab(T, [[TABLE.left, EGGS.bottom], [EGGS.x - 0.02, EGGS.bottom], [EGGS.x - 0.02, EGGS.top], [TABLE.left, EGGS.top + 0.1]], 0.12, nestMat, 0.03))
  const eggMat = new T.MeshPhysicalMaterial({ color: 0xE9DCC6, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.3 })
  const eggGeo = new T.SphereGeometry(0.15, 24, 16)
  for (const y of EGGS.ys) {
    const egg = new T.Mesh(eggGeo, eggMat)
    egg.scale.set(0.86, 1.25, 0.86)
    egg.position.set(EGGS.x - 0.13, 0.12 + 0.18, -y)
    egg.castShadow = true
    table.add(egg)
    me.eggs.push({ mesh: egg, h: 0.3 })
  }

  // Les trois animaux-bumpers sur leurs coussins (et leur halo, quand la bille les touche)
  const haloTex = keep(glowTex(T))
  const kinds: [CritterKind, AnimalVoice, number][] = [['cow', 'vache', 0x3F8F4E], ['pig', 'cochon', 0x3A78B0], ['sheep', 'mouton', 0xC4922A]]
  BUMPERS.forEach((b, i) => {
    const [kind, voice, color] = kinds[i]
    const cushion = new T.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0 })
    const base = new T.Mesh(new T.CylinderGeometry(b.r * 0.94, b.r, 0.2, 40), cushion)
    base.position.set(b.x, 0.1, -b.y)
    base.castShadow = true; base.receiveShadow = true
    table.add(base)
    const ringMat = new T.MeshStandardMaterial({ color: 0xEDE6DA, roughness: 0.4, emissive: 0xFFE6A0, emissiveIntensity: 0 })
    const ring = new T.Mesh(new T.TorusGeometry(b.r * 0.97, 0.05, 10, 40), ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.set(b.x, 0.07, -b.y)
    table.add(ring)
    const haloMat = new T.MeshBasicMaterial({ map: haloTex, color, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending })
    const halo = new T.Mesh(new T.PlaneGeometry(2.3, 2.3), haloMat)
    halo.rotation.x = -Math.PI / 2
    halo.position.set(b.x, 0.015, -b.y)
    table.add(halo)
    const c = me.kit.make(kind, kind === 'sheep' ? 1.04 : 0.98)
    c.obj.position.set(b.x, 0.2, -b.y)
    c.obj.traverse(o => { o.castShadow = true })
    table.add(c.obj)
    me.bumpers.push({ c, halo, haloMat, base, ring, cushion, ringMat, glow: ownMaterials(c), hop: 0, flash: 0, voice, color })
  })

  // Les batteurs : bois clair, élastique rouge (ou la couleur de chaque sœur à deux)
  const fl = me.sim.flippers[0]
  const bodyMat = new T.MeshPhysicalMaterial({ color: 0xE2D6C2, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.25 })
  const capMat = new T.MeshStandardMaterial({ color: 0xC9CED4, metalness: 0.9, roughness: 0.25 })
  const duoCols = [0xE0A72A, 0xD8508A]
  for (const f of me.sim.flippers) {
    const grp = new T.Group()
    const body = new T.ExtrudeGeometry(flipperShape(T, fl.len, fl.r0 - 0.06, fl.r1 - 0.045), { depth: 0.2, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 3, curveSegments: 20 })
    body.rotateX(-Math.PI / 2)
    body.translate(0, 0.04, 0)
    const bm = new T.Mesh(body, bodyMat)
    bm.castShadow = true; bm.receiveShadow = true
    grp.add(bm)
    const band = new T.ExtrudeGeometry(flipperShape(T, fl.len, fl.r0, fl.r1), { depth: 0.1, bevelEnabled: false, curveSegments: 20 })
    band.rotateX(-Math.PI / 2)
    band.translate(0, 0.07, 0)
    const bandM = new T.Mesh(band, ctx.duo ? new T.MeshStandardMaterial({ color: duoCols[f.side], roughness: 0.45 }) : rubber)
    bandM.castShadow = true
    grp.add(bandM)
    const cap = new T.Mesh(new T.CylinderGeometry(0.075, 0.085, 0.08, 18), capMat)
    cap.position.y = 0.3
    grp.add(cap)
    grp.position.set(f.px, 0, -f.py)
    table.add(grp)
    me.flippers.push(grp)
    // À deux, un repère de couleur sous chaque batteur : à toi celui-là
    if (ctx.duo) {
      const mk = new T.Mesh(new T.RingGeometry(0.24, 0.36, 32), new T.MeshStandardMaterial({ color: duoCols[f.side], emissive: duoCols[f.side], emissiveIntensity: 0.6, roughness: 0.5 }))
      mk.rotation.x = -Math.PI / 2
      mk.position.set(f.px, 0.012, -f.py)
      table.add(mk)
      // Et une grosse pastille sur le talus, juste sous le batteur
      const dot = new T.Mesh(new T.CircleGeometry(0.3, 32), mk.material)
      dot.rotation.x = -Math.PI / 2
      dot.position.set(f.px - f.s * 0.5, 0.275, -(f.py - 0.62))
      table.add(dot)
      const rim = new T.Mesh(new T.RingGeometry(0.3, 0.37, 32), new T.MeshStandardMaterial({ color: 0xF2EADC, roughness: 0.5 }))
      rim.rotation.x = -Math.PI / 2
      rim.position.copy(dot.position)
      table.add(rim)
    }
  }

  // Le ressort du lanceur, sa tige et sa poignée rouge (qui dépasse de la façade)
  const rod = new T.Group()
  const rodMat = new T.MeshStandardMaterial({ color: 0xBFC5CC, metalness: 0.9, roughness: 0.25 })
  const shaft = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 1.5, 10), rodMat)
  shaft.rotation.x = Math.PI / 2
  shaft.position.set(0, 0, 0.75)
  rod.add(shaft)
  const tip = new T.Mesh(new T.CylinderGeometry(0.13, 0.13, 0.08, 18), new T.MeshStandardMaterial({ color: 0x3A2A20, roughness: 0.6 }))
  tip.rotation.x = Math.PI / 2
  rod.add(tip)
  const knob = new T.Mesh(new T.SphereGeometry(0.17, 20, 14), new T.MeshPhysicalMaterial({ color: 0xB42A22, roughness: 0.3, clearcoat: 0.8 }))
  knob.scale.set(1, 1, 1.3)
  knob.position.set(0, 0, 1.62)
  knob.castShadow = true
  rod.add(knob)
  rod.position.set(TABLE.ready.x, R, -(TABLE.ready.y - R - 0.04))
  table.add(rod)
  const helix: import('three').Vector3[] = []
  for (let i = 0; i <= 120; i++) {
    const u = i / 120
    helix.push(new T.Vector3(Math.cos(u * Math.PI * 18) * 0.1, Math.sin(u * Math.PI * 18) * 0.1, u))
  }
  const spring = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(helix), 240, 0.018, 6, false), rodMat)
  spring.position.copy(rod.position)
  table.add(spring)
  me.plunger = { rod, spring }
  me.knob = knob

  // Les lampes : la série (sous les animaux), les flèches de la rampe, les œufs, la patte du chien
  for (let i = 0; i < SERIES_LAMPS; i++) {
    const u = (i - (SERIES_LAMPS - 1) / 2)
    me.lamps.series.push(lamp(me, -0.05 + u * 0.42, 5.55 - Math.abs(u) * 0.12, 0xFFC94A, 'dot', 0, 0.12))
  }
  const mouth = { x: (MOUTH.a.x + MOUTH.b.x) / 2, y: (MOUTH.a.y + MOUTH.b.y) / 2 }
  for (let i = 0; i < 3; i++) {
    const u = 0.32 + i * 0.2
    const x = 0.55 + (mouth.x - 0.55) * u, y = 3.6 + (mouth.y - 3.6) * u
    me.lamps.ramp.push(lamp(me, x, y, 0x7CD0FF, 'arrow', -Math.atan2(mouth.x - 0.55, mouth.y - 3.6), 0.17))
  }
  EGGS.ys.forEach(y => me.lamps.eggs.push(lamp(me, -1.95, y, 0xFFE9B0, 'egg', 0, 0.13)))
  if (me.sim.cfg.guard > 0) me.lamps.paw = lamp(me, 0, 1.75, 0xFFB070, 'paw', 0, 0.2)
}

/* La grange : la tête du flipper, debout au bout de la table. La rampe entre
   par la porte du grenier à droite, la goulotte ressort à gauche ; le coq sur
   le toit. */
function buildBarn(me: State) {
  const { T, table, stage } = me
  const barn = new T.Group()
  barn.position.set(TABLE.arc.x, 0, -(Y1 + 0.05))
  barn.rotation.x = -ALPHA // elle se tient droite, la table penche
  table.add(barn)
  const red = stage.keep(planks(T, '#7E2A20', '#3A120C', 12))
  red.repeat.set(0.26, 0.3)
  const redMat = new T.MeshStandardMaterial({ map: red, roughness: 0.85 })
  const trim = new T.MeshStandardMaterial({ color: 0xD8D0C2, roughness: 0.7 })
  const roofMat = new T.MeshStandardMaterial({ color: 0x4A3A36, roughness: 0.8 })
  const W = 4.6, H = 2.25, D = 1.6, PEAK = 1.2
  // Le corps, pignon en façade
  const front = new T.Shape()
  front.moveTo(-W / 2, 0); front.lineTo(W / 2, 0); front.lineTo(W / 2, H); front.lineTo(0, H + PEAK); front.lineTo(-W / 2, H); front.closePath()
  const body = new T.ExtrudeGeometry(front, { depth: D, bevelEnabled: false })
  body.translate(0, 0, -D)
  const bm = new T.Mesh(body, redMat)
  bm.castShadow = true; bm.receiveShadow = true
  barn.add(bm)
  // Le toit : deux pans qui débordent
  const slope = Math.hypot(W / 2, PEAK)
  const ang = Math.atan2(PEAK, W / 2)
  for (const s of [-1, 1]) {
    const pan = new T.Mesh(new T.BoxGeometry(slope + 0.35, 0.12, D + 0.4), roofMat)
    pan.position.set(s * W / 4, H + PEAK / 2 + 0.07, -D / 2)
    pan.rotation.z = -s * ang
    pan.castShadow = true
    barn.add(pan)
  }
  // Les montants blancs du pignon
  const bar = (x: number, y: number, w: number, h: number, rz = 0, z = 0.02) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, 0.05), trim)
    m.position.set(x, y, z); m.rotation.z = rz
    barn.add(m)
  }
  bar(0, H, W, 0.12)
  for (const s of [-1, 1]) {
    bar(s * (W / 2 - 0.06), H / 2, 0.12, H)
    const len = Math.hypot(W / 2, PEAK)
    bar(s * W / 4, H + PEAK / 2, len, 0.12, -s * ang)
  }
  // La grande porte en croix, en bas
  const dw = 1.7, dh = 1.1
  bar(0, dh, dw + 0.12, 0.12); bar(-dw / 2, dh / 2, 0.12, dh); bar(dw / 2, dh / 2, 0.12, dh); bar(0, dh / 2, 0.1, dh)
  for (const s of [-1, 1]) {
    const len = Math.hypot(dw / 2, dh)
    bar(s * dw / 4, dh / 2, 0.1, len, s * Math.atan2(dw / 2, dh))
  }
  // Les deux portes du grenier : à droite la rampe entre, à gauche la goulotte sort
  for (const s of [-1, 1]) {
    const glow = new T.MeshStandardMaterial({ color: 0x1E120A, emissive: 0xFFB45A, emissiveIntensity: 0.15, roughness: 0.9 })
    me.barnGlow.push(glow)
    const door = new T.Mesh(new T.PlaneGeometry(0.78, 0.74), glow)
    door.position.set(s * 0.65, LOFT, 0.03)
    barn.add(door)
    bar(s * 0.65, LOFT + 0.41, 0.94, 0.1, 0, 0.04); bar(s * 0.65, LOFT - 0.41, 0.94, 0.1, 0, 0.04)
    bar(s * 0.65 - 0.44, LOFT, 0.1, 0.92, 0, 0.04); bar(s * 0.65 + 0.44, LOFT, 0.1, 0.92, 0, 0.04)
  }
  // Une guirlande d'ampoules sous le toit
  const bulbGeo = new T.SphereGeometry(0.06, 10, 8)
  const bulbCols = [0xFFD27A, 0xFF9E7A, 0xA8E0FF, 0xFFE9A8, 0xC8A8FF]
  for (let i = 0; i <= 18; i++) {
    const u = i / 18
    const x = -W / 2 + 0.15 + u * (W - 0.3)
    const y = H + PEAK * (1 - Math.abs(x) / (W / 2)) - 0.18 - Math.sin(u * Math.PI * 6) ** 2 * 0.06
    const m = new T.MeshStandardMaterial({ color: bulbCols[i % 5], emissive: bulbCols[i % 5], emissiveIntensity: 0.9, roughness: 0.3 })
    me.bulbs.push(m)
    const b = new T.Mesh(bulbGeo, m)
    b.position.set(x, y, 0.12)
    barn.add(b)
  }
  // Le socle de bois sous la grange
  const plinth = new T.Mesh(new T.BoxGeometry(W + 0.4, 0.5, D + 0.3), new T.MeshStandardMaterial({ color: 0x4A2C16, roughness: 0.85 }))
  plinth.position.set(0, -0.25, -D / 2)
  barn.add(plinth)
  // Le coq, perché sur le bord de la table à côté de la rampe (le haut de la
  // grange est sous le score) : il chante quand la bille monte au grenier
  me.rooster = me.kit.make('rooster', 0.8)
  me.rooster.obj.position.set(TABLE.laneR + 0.14, FRAME_H, -7.2)
  me.rooster.obj.rotation.y = -0.5
  me.rooster.obj.traverse(o => { o.castShadow = true })
  me.table.add(me.rooster.obj)
}

/** La rampe de bois jusqu'au grenier, et la goulotte de fil qui redescend. */
function buildRamp(me: State) {
  const { T, table, stage } = me
  const V = (x: number, h: number, y: number) => new T.Vector3(x, h, -y)
  const sill = LOFT - 0.36
  const door = (s: number) => new T.Vector3(TABLE.arc.x + s * 0.65, 0, -(Y1 + 0.05)).add(new T.Vector3(0, sill * Math.cos(ALPHA), -sill * Math.sin(ALPHA)))
  const mouth = { x: (MOUTH.a.x + MOUTH.b.x) / 2, y: (MOUTH.a.y + MOUTH.b.y) / 2 }
  const rIn = door(1)
  me.rampCurve = new T.CatmullRomCurve3([
    V(mouth.x, 0, mouth.y),
    V(2.34, 0.36, 6.4),
    V(2.38, 0.8, 7.45),
    V(2.2, 1.12, 8.75),
    V(1.65, 1.3, 9.95),
    new T.Vector3(rIn.x + 0.05, rIn.y, rIn.z + 0.35),
    rIn
  ], false, 'catmullrom', 0.5)
  const lOut = door(-1)
  me.chuteCurve = new T.CatmullRomCurve3([
    lOut,
    new T.Vector3(lOut.x - 0.3, lOut.y - 0.05, lOut.z + 0.35),
    V(-2.3, 1.25, 10.0),
    V(-3.42, 1.1, 8.4),
    V(-3.45, 0.95, 6.4),
    V(-3.2, 0.78, 4.8),
    // Elle passe AU-DESSUS du cadre (haut de 0,5), puis plonge dans le couloir
    V(-2.86, 0.66, 4.3),
    V(-2.6, 0.24, 4.12),
    V(CHUTE_OUT.x, 0, CHUTE_OUT.y)
  ], false, 'catmullrom', 0.5)

  // Le plancher et les deux bords de la rampe : un ruban le long de la courbe
  const rampTex = stage.keep(planks(T, '#9A6A3A', '#4A2E16', 4))
  rampTex.repeat.set(1, 6)
  const floorMat = new T.MeshStandardMaterial({ map: rampTex, roughness: 0.75, side: T.DoubleSide })
  const sideMat = new T.MeshStandardMaterial({ color: 0x8A5A30, roughness: 0.8, side: T.DoubleSide })
  const N = 90, HW = 0.34, SIDE = 0.24
  const fl: number[] = [], fu: number[] = [], sl: number[] = [], sr: number[] = []
  const up = new T.Vector3(0, 1, 0)
  for (let i = 0; i <= N; i++) {
    const u = i / N
    const p = me.rampCurve.getPointAt(u)
    const t = me.rampCurve.getTangentAt(u)
    const side = new T.Vector3().crossVectors(t, up).normalize()
    const a = p.clone().addScaledVector(side, -HW), b = p.clone().addScaledVector(side, HW)
    fl.push(a.x, a.y - 0.01, a.z, b.x, b.y - 0.01, b.z)
    fu.push(0, u * 6, 1, u * 6)
    sl.push(a.x, a.y - 0.05, a.z, a.x, a.y + SIDE, a.z)
    sr.push(b.x, b.y - 0.05, b.z, b.x, b.y + SIDE, b.z)
  }
  const strip = (pos: number[], uv: number[] | null, mat: import('three').Material) => {
    const g = new T.BufferGeometry()
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3))
    if (uv) g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
    const idx: number[] = []
    for (let i = 0; i < N; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2) }
    g.setIndex(idx)
    g.computeVertexNormals()
    const m = new T.Mesh(g, mat)
    m.castShadow = true; m.receiveShadow = true
    table.add(m)
  }
  strip(fl, fu, floorMat)
  strip(sl, null, sideMat)
  strip(sr, null, sideMat)
  // Une main courante de métal sur chaque bord : la rampe se lit d'un coup d'œil
  const railMat = new T.MeshStandardMaterial({ color: 0xC8CDD3, metalness: 0.9, roughness: 0.25 })
  for (const k of [-1, 1]) {
    const rail: import('three').Vector3[] = []
    for (let i = 0; i <= 40; i++) {
      const u = i / 40
      const p = me.rampCurve.getPointAt(u)
      const t = me.rampCurve.getTangentAt(u)
      const side = new T.Vector3().crossVectors(t, up).normalize()
      rail.push(p.addScaledVector(side, k * HW).add(new T.Vector3(0, SIDE + 0.02, 0)))
    }
    const m = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(rail), 120, 0.035, 8, false), railMat)
    m.castShadow = true
    table.add(m)
  }
  // Les pieds de la rampe
  const legMat = new T.MeshStandardMaterial({ color: 0x5A361C, roughness: 0.8 })
  for (const u of [0.3, 0.52, 0.74]) {
    const p = me.rampCurve.getPointAt(u)
    const leg = new T.Mesh(new T.CylinderGeometry(0.05, 0.06, p.y, 8), legMat)
    leg.position.set(p.x, p.y / 2, p.z)
    leg.castShadow = true
    table.add(leg)
  }
  // La goulotte : trois fils de métal autour du chemin de la bille
  const wireMat = new T.MeshStandardMaterial({ color: 0xC8CDD3, metalness: 0.9, roughness: 0.22 })
  const pts = me.chuteCurve.getSpacedPoints(80)
  for (const [dx, dy] of [[-0.21, R], [0.21, R], [0, -0.02]] as [number, number][]) {
    const wire: import('three').Vector3[] = []
    pts.forEach((p, i) => {
      const t = me.chuteCurve.getTangentAt(i / 80)
      const side = new T.Vector3().crossVectors(t, up).normalize()
      wire.push(p.clone().addScaledVector(side, dx).add(new T.Vector3(0, dy, 0)))
    })
    const m = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(wire), 160, 0.022, 6, false), wireMat)
    m.castShadow = true
    table.add(m)
  }
  for (const u of [0.38, 0.62]) {
    const p = me.chuteCurve.getPointAt(u)
    const leg = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, p.y + 1.2, 6), wireMat)
    leg.position.set(p.x, (p.y - 1.2) / 2, p.z)
    table.add(leg)
  }
}

/** Le pré autour : l'herbe, les pieds de la table, des bottes de foin, une barrière, des arbres. */
async function buildDecor(me: State) {
  const { T, stage } = me
  const scene = stage.scene
  const grass = new T.Mesh(new T.PlaneGeometry(120, 120), new T.MeshStandardMaterial({ color: 0x4E8A3E, roughness: 1 }))
  grass.rotation.x = -Math.PI / 2
  grass.position.y = -1.9
  grass.receiveShadow = true
  scene.add(grass)
  // Les pieds de la table
  const legMat = new T.MeshStandardMaterial({ color: 0x4A2C16, roughness: 0.85 })
  for (const [x, y] of [[X0 + 0.2, Y0 + 0.3], [X1 - 0.2, Y0 + 0.3], [X0 + 0.2, 8], [X1 - 0.2, 8]]) {
    const p = me.table.localToWorld(new T.Vector3(x, -0.3, -y))
    const len = p.y + 1.9
    const leg = new T.Mesh(new T.BoxGeometry(0.22, len, 0.22), legMat)
    leg.position.set(p.x, p.y - len / 2, p.z)
    leg.castShadow = true
    scene.add(leg)
  }
  // Les bottes de foin, empilées au bord du pré
  const hay = stage.keep(hayTex(T))
  const hayMat = new T.MeshStandardMaterial({ map: hay, roughness: 1, color: 0xF2DCA0 })
  const baleGeo = new T.BoxGeometry(1.3, 0.65, 0.8)
  const bale = (x: number, y: number, z: number, ry: number) => {
    const m = new T.Mesh(baleGeo, hayMat)
    m.position.set(x, -1.9 + 0.325 + y, z); m.rotation.y = ry
    m.castShadow = true; m.receiveShadow = true
    scene.add(m)
  }
  bale(-5.6, 0, 0.2, 0.3); bale(-5.4, 0.65, 0.1, 0.1); bale(-6.6, 0, -0.9, 1.2); bale(-5.2, 0, -1.6, -0.2)
  bale(6.4, 0, 0.4, -0.3); bale(6.5, 0.65, 0.3, -0.15); bale(7.4, 0, -1.0, 1.4); bale(6.1, 0, -1.9, 0.25)
  bale(-6.2, 0, -6.5, 0.5); bale(7.0, 0, -7.2, -0.4)
  // Une barrière, des arbres, des fleurs (les kits nature, assombris : ACES)
  const items: import('../core/scene3d').DecorItem[] = []
  for (let i = 0; i < 9; i++) {
    items.push({ model: 'nature/fence_simple', x: -9 + i * 1.0, z: -12.5, size: 0.9, rot: 0, shade: 0.7 })
    items.push({ model: 'nature/fence_simple', x: 2.6 + i * 1.0, z: -12.5, size: 0.9, rot: 0, shade: 0.7 })
  }
  for (const [x, z, s, m] of [[-9.5, -9, 4.2, 'tree_oak'], [-7.5, -15, 5, 'tree_default'], [9.8, -10, 4.4, 'tree_fat'], [8, -16, 5.2, 'tree_oak'], [-12, -3, 4.6, 'tree_default'], [12.5, -3.5, 4.2, 'tree_oak']] as [number, number, number, string][]) {
    items.push({ model: 'nature/' + m, x, z, size: s, shade: 0.7, tint: 0x9CCB7A })
  }
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1
    items.push({ model: 'nature/' + ['flower_redA', 'flower_yellowA', 'flower_purpleA', 'grass', 'grass_large'][i % 5], x: side * (4.6 + Math.random() * 5), z: 1.5 - Math.random() * 11, size: 0.35 + Math.random() * 0.25, shade: 0.75 })
  }
  try {
    const g = await decor(stage, items)
    g.position.y = -1.9
  } catch { /* le pré sans ses arbres : la table reste jouable */ }
}

/* ---------- Le jeu ---------- */

/** La bille → la scène (coordonnées de la table). */
function ballPos(me: State, b: Ball, out: import('three').Vector3) {
  switch (b.st) {
    case 'ramp': {
      const u = Math.max(0, Math.min(1, b.s / RAMP_LEN))
      out.copy(me.rampCurve.getPointAt(u)).y += R
      return true
    }
    case 'chute': {
      // Elle prend de la vitesse en descendant
      const u = Math.max(0, Math.min(1, b.s * b.s * 0.6 + b.s * 0.4))
      out.copy(me.chuteCurve.getPointAt(u)).y += R
      return true
    }
    case 'barn': return false
    case 'guard': {
      // Le chien l'a dans la gueule : elle remonte vers lui
      const k = Math.max(0, Math.min(1, 1 - b.hold / 0.45))
      out.set(b.x * (1 - k), R + Math.sin(k * Math.PI) * 0.5 + k * 0.3, -(b.y * (1 - k) + (-0.35) * k))
      return true
    }
    default:
      out.set(b.x, R, -b.y)
      return true
  }
}

/** Un animal crie — sans couper un autre cri, jamais plus de deux voix à la fois. */
function voice(me: State, v: AnimalVoice, o: { vol?: number; max?: number; rate?: number } = {}): boolean {
  const now = me.sim.t
  const until = me.singing.get(v) ?? 0
  if (until > now) return false
  let busy = 0
  me.singing.forEach(u => { if (u > now) busy++ })
  if (busy >= 2) return false
  const max = o.max ?? 0.9
  if (!cry(v, { vol: o.vol ?? 0.75, max, rate: o.rate })) return false
  me.singing.set(v, now + max + 0.05)
  me.stats.cries++
  return true
}

function hop(me: State, c: Critter, k = 1) { me.hops.set(c, Math.max(me.hops.get(c) ?? 0, k)) }

/** Une position de la table → la scène (pour les étincelles). */
function world(me: State, x: number, h: number, y: number) {
  return me.table.localToWorld(new me.T.Vector3(x, h, -y))
}

function onEvent(me: State, e: PinEvent) {
  const { game, sim } = me
  const scoring = (p: number) => { if (!me.over) { game.hit(p, { silent: true }); me.lastHit = sim.t } }
  switch (e.k) {
    case 'bumper': {
      const bv = me.bumpers[e.i]
      bv.hop = 1; bv.flash = 1
      me.stats.bumpers++
      scoring(10)
      if (!voice(me, bv.voice, { max: 0.85 })) sfx('pluck', { vol: 0.45, rate: 1.25 + e.i * 0.08 })
      sfx('drop', { vol: 0.35, rate: 1.5 })
      me.fx.burst(world(me, e.x, 0.6, e.y), { count: 18, color: [0xFFE08A, 0xFFFFFF, bv.color], speed: 2.4, life: 0.6, size: 0.09, gravity: 3 })
      me.shake.hit(0.12)
      break
    }
    case 'sling': {
      me.slingKick[e.side] = 1
      sfx('pluck', { vol: 0.55, rate: 0.85 })
      impact(force(e.v, 1, 8) * 0.6, { matter: 'sourd', noShake: true })
      me.fx.burst(world(me, e.x, 0.3, e.y), { count: 10, color: [0xE6C877, 0xD9B25A, 0xB98E3A], speed: 1.6, life: 0.6, size: 0.07, gravity: 4 })
      break
    }
    case 'wall':
      impact(force(e.v, 1.6, 12) * 0.7, { matter: e.kind === 'rail' || e.kind === 'portillon' ? 'metal' : 'bois', noShake: true })
      break
    case 'post':
      sfx('pluck', { vol: 0.35, rate: 1.4 })
      break
    case 'flip':
      if (e.up) sfx('click', { vol: 0.55, rate: 0.7 })
      break
    case 'flipHit':
      if (e.v > 3) me.stats.flips++
      if (e.v > 4) impact(force(e.v, 3, 14) * 0.5, { matter: 'sourd', noShake: true })
      break
    case 'target': {
      sfx('drop', { vol: 0.6, rate: 0.9 })
      voice(me, 'poule', { max: 0.6, vol: 0.6 })
      hop(me, me.hen, 0.7)
      scoring(25)
      me.lamps.eggs[e.i].on = 1
      me.fx.burst(world(me, EGGS.x - 0.1, 0.4, EGGS.ys[e.i]), { count: 10, color: [0xFFF4D8, 0xE6C877], speed: 1.4, life: 0.5, size: 0.07 })
      break
    }
    case 'targets':
      me.stats.eggs++
      scoring(150)
      hop(me, me.hen, 1.4)
      me.singing.delete('poule')
      voice(me, 'poule', { max: 1.4 })
      sfx('confirm', { vol: 0.6 })
      game.flash(EGG_SVG, 'gold')
      break
    case 'targetsUp':
      me.lamps.eggs.forEach(l => { l.on = 0 })
      sfx('switch', { vol: 0.4 })
      break
    case 'rampIn':
      sfx('whoosh', { vol: 0.5, rate: 0.9 })
      break
    case 'rampBack':
      sfx('drop', { vol: 0.4, rate: 0.7 })
      break
    case 'barn':
      me.stats.ramps++
      scoring(100)
      me.party = Math.max(me.party, 1.6)
      hop(me, me.rooster, 1.3)
      me.singing.delete('coq')
      voice(me, 'coq', { max: 1.6, vol: 0.7 })
      sfx('confirm', { vol: 0.6, rate: 1.1 })
      me.lamps.ramp.forEach(l => { l.on = 1.6 })
      game.flash(BARN_SVG, 'gold')
      break
    case 'chuteOut':
      sfx('metal', { vol: 0.4 })
      break
    case 'near':
      me.stats.near++
      game.flash(ICON.bolt, 'near')
      sfx('whoosh', { vol: 0.55, rate: 0.8 })
      me.slowFor = Math.max(me.slowFor, 0.35)
      break
    case 'save':
      me.stats.saves++
      hop(me, me.dog, 1.5)
      me.singing.delete('chien')
      voice(me, 'chien', { max: 1.1 })
      game.flash(ICON.heart, 'near')
      me.slowFor = Math.max(me.slowFor, 0.45)
      me.fx.burst(world(me, 0, 0.6, -0.3), { count: 20, color: [0xFFFFFF, 0xFFE08A], speed: 2.2, life: 0.7, size: 0.09 })
      break
    case 'toss':
      sfx('whoosh', { vol: 0.5, rate: 1.2 })
      break
    case 'doomed':
      // La dernière bille, la dernière vie : elle tombe au ralenti
      if (e.last && game.s.lives <= 1 && !me.over) me.finalSlow = true
      break
    case 'drain':
      me.stats.drains++
      if (e.left > 0) { sfx('drop', { vol: 0.4, rate: 0.6 }); break }
      if (me.over) break
      me.finalSlow = false
      game.miss()
      me.armed = true
      me.shake.hit(0.35)
      game.flash(ICON.heartEmpty, 'bad')
      if (game.hurt()) gameOver(me)
      else game.after(1300, () => { if (pb === me && !me.over) sim.serve() })
      break
    case 'launch':
      me.stats.launches++
      sfx('whoosh', { vol: 0.6, rate: 0.8 + e.p * 0.4 })
      sfx('metal', { vol: 0.5, rate: 0.8 })
      break
    case 'ready':
      sfx('drop', { vol: 0.35, rate: 1.1 })
      break
    case 'nudge':
      me.shake.hit(0.25)
      sfx('creak', { vol: 0.3 })
      break
  }
}

const EGG_SVG = `<svg viewBox="0 0 48 48" width="1em" height="1em" aria-hidden="true"><path d="M24 4c8 0 15 12 15 23a15 15 0 0 1-30 0C9 16 16 4 24 4z" fill="#FFD34D"/><path d="M24 4c8 0 15 12 15 23a15 15 0 0 1-15 15z" fill="#E8A92A"/><ellipse cx="18" cy="18" rx="3.5" ry="6" fill="#fff" opacity=".7"/></svg>`
const BARN_SVG = `<svg viewBox="0 0 48 48" width="1em" height="1em" aria-hidden="true"><path d="M5 20 24 6l19 14v22H5z" fill="#E8574C"/><path d="M24 6l19 14v22H24z" fill="#C9443A"/><path d="M3 21 24 5l21 16" fill="none" stroke="#FFF6E8" stroke-width="3.4" stroke-linejoin="round"/><rect x="16" y="26" width="16" height="16" fill="#FFF6E8"/><path d="m17 27 14 14M31 27 17 41" stroke="#E8574C" stroke-width="2.6"/><rect x="20" y="13" width="8" height="7" fill="#45362A"/></svg>`
const BALLS_SVG = `<svg viewBox="0 0 48 48" width="1em" height="1em" aria-hidden="true"><circle cx="13" cy="30" r="9" fill="#C8CDD3"/><circle cx="35" cy="30" r="9" fill="#C8CDD3"/><circle cx="24" cy="14" r="9" fill="#E8ECF0"/><circle cx="21" cy="11" r="2.6" fill="#fff"/><circle cx="10" cy="27" r="2.4" fill="#fff"/><circle cx="32" cy="27" r="2.4" fill="#fff"/></svg>`

function multiball(me: State) {
  me.armed = false
  me.stats.multis++
  me.sim.release(2, 0.8)
  me.party = Math.max(me.party, 3)
  hop(me, me.rooster, 1.5)
  me.singing.delete('coq')
  voice(me, 'coq', { max: 1.6 })
  sfx('confirm', { vol: 0.7, rate: 1.25 })
  me.game.flash(BALLS_SVG, 'gold')
}

function gameOver(me: State) {
  if (me.over) return
  me.over = true
  me.outroT = 0
  me.stage.timeScale = 0.35
  me.sim.setFlipper(LEFT, false)
  me.sim.setFlipper(RIGHT, false)
  const s = me.game.s.score
  const duo = ctx.duo
  const thr = starsAt()
  const animals = me.stats.bumpers
  me.game.end({
    title: s >= thr[1] ? 'Quelle partie !' : s >= thr[0] ? 'Bien joué !' : 'Encore une bille ?',
    msg: `${duo ? 'Vous avez' : 'Tu as'} marqué ${s} points` + (animals > 0 ? ` et fait chanter les animaux ${animals} fois` : ''),
    score: s,
    outroMs: 3200
  })
}

/** Les seuils des 2ᵉ et 3ᵉ étoiles, par niveau, réglés sur des parties jouées
    par le pilote hors navigateur (core/pinball.test.ts, PB_SKILL) : la 2ᵉ
    étoile vers le score médian d'une joueuse qui rate souvent (skill 0,3 :
    6 150, 2 830, 2 240 points), la 3ᵉ vers celui d'une joueuse moyenne
    (skill 0,5 : 18 200, 10 200, 6 300). */
function starsAt(): [number, number] {
  return ctx.byTier<[number, number]>([5000, 15000], [3000, 10000], [2000, 6500])
}

/* ---------- Les commandes ---------- */

function launchMode(me: State) { return !!me.sim.readyBall() && me.sim.inPlay().length === 0 }

function applyInput(me: State) {
  if (me.over) return
  let l = me.keys.l, r = me.keys.r
  me.pointers.forEach(s => { if (s === LEFT) l = true; else if (s === RIGHT) r = true })
  me.sim.setFlipper(LEFT, l && !launchMode(me))
  me.sim.setFlipper(RIGHT, r && !launchMode(me))
}

export const pinball: GameDef = {
  id: 'pinball', name: 'Le Flipper', icon: '🕹', sq: 'sq-peach', cat: 'action', music: 'fair', duo: true,
  subtitle: 'Un pouce à gauche, un pouce à droite : renvoie la bille vers les animaux !',
  // La main : au lancer, tirer le ressort ; en jeu, un pouce à gauche, puis à droite
  hand: () => {
    const me = pb
    if (!me || me.over || me.frozen) return null
    if (launchMode(me)) {
      // Tirer le ressort : on pose le doigt sur la bille qui attend, on le ramène vers soi
      const p = toScreen(me.stage, world(me, TABLE.ready.x, R, TABLE.ready.y))
      return { drag: [{ x: p.x, y: p.y - 6 }, { x: p.x, y: p.y + 64 }] }
    }
    if (!me.sim.balls.some(b => b.st === 'table')) return null
    return { taps: [{ fx: 0.16, fy: 0.8 }, { fx: 0.84, fy: 0.8 }] }
  },
  mount(c) {
    ctx = c
    c.root.innerHTML = `<div class="arena pb-arena" id="pbArena"></div>`
    const arena = $('pbArena')
    const hideLoader = loader(arena, 'pinball')
    preloadSfx(['click', 'pluck', 'drop', 'whoosh', 'confirm', 'creak', 'metal', 'switch', 'error'])
    preloadCries(['vache', 'cochon', 'mouton', 'poule', 'coq', 'chien'])
    let dead = false

    ;(async () => {
      const stage = await createStage(arena, {
        sky: '#A8D8F0', fog: [26, 70], fogColor: '#BFE3F2',
        cam: [0.35, CAM.y, CAM.z], target: [0.35, CAM.ty, CAM.tz], fov: CAM.fov,
        hemi: ['#E6F4FF', '#7FA35A', 1.1],
        sun: { pos: [-4.5, 11, 5], color: '#FFF1D6', intensity: 2.4, area: 8.5, far: 32 },
        fill: 0.55, exposure: 1.02, iblIntensity: 0.55
      })
      if (dead) { stage.dispose(); return }
      const { T, scene } = stage
      if (stage.sun) {
        stage.sun.target.position.set(0.35, 0.5, -5)
        scene.add(stage.sun.target)
      }

      const sim = new Pinball(c.byTier(CFG.easy, CFG.med, CFG.exp))
      const kit = critterKit(T)
      stage.keep({ dispose: () => kit.dispose() })
      const table = new T.Group()
      table.rotation.x = ALPHA
      scene.add(table)
      table.updateMatrixWorld(true)

      const game = arcade(c, {
        host: arena,
        lives: c.byTier(3, 3, 2),
        scoreIcon: ICON.star,
        // La rampe de difficulté suit la performance : tous les 30 chocs, la bille file un peu plus
        ramp: { every: 30, max: 4 },
        onLevel: lv => { sim.pace = 1 + lv * 0.05 },
        stars: s => { const t = starsAt(); return s.score >= t[1] ? 3 : s.score >= t[0] ? 2 : 1 }
      })

      const blob = stage.keep(blobTex(T))
      const me: State = {
        stage, T, sim, game, fx: particles(stage, 700), shake: camShake(stage), kit, table,
        balls: new Map(),
        ballGeo: new T.SphereGeometry(R, 32, 20),
        ballMat: new T.MeshStandardMaterial({ color: 0xE8ECF0, metalness: 1, roughness: 0.14, envMapIntensity: 1.35 }),
        blobGeo: new T.PlaneGeometry(1, 1),
        blobMat: new T.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false }),
        flippers: [], bumpers: [], eggs: [],
        hen: null as unknown as Critter, dog: null as unknown as Critter, rooster: null as unknown as Critter,
        hops: new Map(), slings: [], slingKick: [],
        rampCurve: null as unknown as import('three').CatmullRomCurve3,
        chuteCurve: null as unknown as import('three').CatmullRomCurve3,
        plunger: null as unknown as State['plunger'], knob: null as unknown as import('three').Object3D,
        barnGlow: [], bulbs: [], lamps: { series: [], ramp: [], eggs: [], paw: null },
        pointers: new Map(), keys: { l: false, r: false, p: false },
        singing: new Map(), lastHit: 0, multiAt: c.byTier(10, 12, 14), armed: true, party: 0,
        over: false, saluting: false, outroT: 0, slowFor: 0, finalSlow: false, wasLaunch: true, frozen: false, turbo: 1, t: 0,
        stats: { bumpers: 0, flips: 0, ramps: 0, eggs: 0, cries: 0, saves: 0, near: 0, launches: 0, drains: 0, multis: 0 }
      }
      stage.keep({ dispose: () => { me.ballGeo.dispose(); me.ballMat.dispose(); me.blobGeo.dispose(); me.blobMat.dispose() } })
      buildTable(me)
      buildBarn(me)
      buildRamp(me)
      // La poule sur le bord, derrière ses œufs ; le chien qui garde la sortie
      me.hen = kit.make('hen', 0.62)
      me.hen.obj.position.set(TABLE.left - 0.15, FRAME_H, -(EGGS.ys[1] + 0.05))
      me.hen.obj.rotation.y = 0.9
      me.hen.obj.traverse(o => { o.castShadow = true })
      table.add(me.hen.obj)
      me.dog = kit.make('dog', 0.6)
      me.dog.obj.position.set(0, APRON.h, -(APRON.y0 + APRON.y1) / 2 - 0.02)
      me.dog.obj.traverse(o => { o.castShadow = true })
      me.dog.obj.visible = sim.cfg.guard > 0
      table.add(me.dog.obj)
      table.updateMatrixWorld(true)
      await buildDecor(me)
      if (dead) { stage.dispose(); return }
      pb = me
      hideLoader()
      if (c.duo) game.flash(ICON.duo)
      game.after(700, () => { if (pb === me) sim.serve() })

      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        // Accroche des tests : l'état, le pilote, et des mises en scène pour les captures
        const scr = (x: number, h: number, y: number) => toScreen(stage, world(me, x, h, y))
        ;(window as unknown as { __pb: unknown }).__pb = {
          duo: c.duo,
          tier: c.tier,
          state: () => ({
            t: sim.t, score: game.s.score, lives: game.s.lives, combo: game.s.combo, over: me.over, outroT: me.outroT,
            waiting: launchMode(me), pull: sim.pull, inPlay: sim.inPlay().length,
            balls: sim.balls.map(b => ({ st: b.st, x: b.x, y: b.y })),
            flippers: sim.flippers.map(f => f.held), angles: sim.flippers.map(f => f.a)
          }),
          stats: () => ({ ...me.stats }),
          auto: (on: boolean) => {
            sim.pilot = on ? autoPilot({ launch: true }) : null
            if (!on) { sim.setFlipper(LEFT, false); sim.setFlipper(RIGHT, false) }
          },
          knob: () => toScreen(stage, me.knob.getWorldPosition(new T.Vector3())),
          at: scr,
          multiball: () => multiball(me),
          freeze: (on: boolean) => { me.frozen = on },
          turbo: (k: number) => { me.turbo = Math.max(1, Math.min(12, Math.round(k))) },
          salute: () => { me.saluting = true; me.outroT = 0; stage.timeScale = 0.35 },
          /** Une mise en scène : des billes posées là, en mouvement, des animaux allumés. */
          pose: (balls: { x: number; y: number; vx?: number; vy?: number; st?: 'ramp' | 'chute'; s?: number }[], o: { flip?: [boolean, boolean]; glow?: number[]; eggs?: number; party?: number } = {}) => {
            sim.balls = []
            for (const p of balls) {
              const b = sim.serve()
              b.st = p.st ?? 'table'; b.x = p.x; b.y = p.y; b.vx = p.vx ?? 0; b.vy = p.vy ?? 0
              b.s = p.s ?? 0
              b.sv = p.st === 'ramp' ? 6 : 0
              b.launchedAt = sim.t
            }
            sim.events.length = 0
            if (o.flip) { sim.setFlipper(LEFT, o.flip[0]); sim.setFlipper(RIGHT, o.flip[1]); sim.flippers.forEach(f => { f.a = f.held ? f.up : f.rest }) }
            for (const i of o.glow ?? []) { me.bumpers[i].flash = 1; me.bumpers[i].hop = 0.6 }
            for (let i = 0; i < (o.eggs ?? 0); i++) { sim.eggs[i].down = true; me.lamps.eggs[i].on = 1 }
            if (o.party) me.party = o.party
          },
          glow: (i: number) => { const bv = me.bumpers[i]; bv.flash = 1; bv.hop = 1; voice(me, bv.voice) }
        }
      }

      /* Les commandes : un doigt PAR batteur (piège « Deux doigts, une seule
         lame ») — la moitié de l'arène où il se pose décide lequel, et il
         reste levé tant que ce doigt est là. Le ressort : n'importe quel
         doigt, tant que la bille l'attend. */
      let downY = new Map<number, number>()
      const onDown = (e: PointerEvent) => {
        if (pb !== me || me.over || isPaused()) return
        if (launchMode(me)) {
          me.pointers.set(e.pointerId, 'plunger')
          downY.set(e.pointerId, e.clientY)
          if (!sim.pulling) sfx('creak', { vol: 0.35, rate: 1.2 })
          sim.plunger(true)
          return
        }
        const r = arena.getBoundingClientRect()
        me.pointers.set(e.pointerId, e.clientX < r.left + r.width / 2 ? LEFT : RIGHT)
        applyInput(me)
      }
      const onMove = (e: PointerEvent) => {
        if (me.pointers.get(e.pointerId) !== 'plunger') return
        // Tirer le ressort vers soi le tend aussi
        const dy = e.clientY - (downY.get(e.pointerId) ?? e.clientY)
        if (dy > 0 && sim.pulling) sim.pull = Math.max(sim.pull, Math.min(1, dy / 140))
      }
      const onUp = (e: PointerEvent) => {
        const s = me.pointers.get(e.pointerId)
        if (s === undefined) return
        me.pointers.delete(e.pointerId)
        downY.delete(e.pointerId)
        if (s === 'plunger') {
          if (![...me.pointers.values()].includes('plunger')) sim.plunger(false)
        } else applyInput(me)
      }
      const KL = ['ArrowLeft', 'ShiftLeft', 'KeyA', 'KeyQ'], KR = ['ArrowRight', 'ShiftRight', 'KeyL', 'KeyM'], KP = ['Space', 'Enter', 'ArrowDown']
      const onKey = (e: KeyboardEvent) => {
        if (pb !== me || me.over) return
        const down = e.type === 'keydown'
        if (KL.includes(e.code)) me.keys.l = down
        else if (KR.includes(e.code)) me.keys.r = down
        else if (KP.includes(e.code)) {
          e.preventDefault()
          if (e.repeat) return
          me.keys.p = down
          if (down && launchMode(me)) { sfx('creak', { vol: 0.35, rate: 1.2 }); sim.plunger(true) }
          if (!down) sim.plunger(false)
          return
        } else return
        e.preventDefault()
        applyInput(me)
      }
      arena.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      window.addEventListener('keydown', onKey)
      window.addEventListener('keyup', onKey)

      const tmp = new T.Vector3()
      const camBase = stage.camera.position.clone()
      stage.start((dt, now) => {
        if (pb !== me) return
        // (figée pour une capture : la physique ET les animations s'arrêtent)
        const raw = me.frozen ? 0 : stage.timeScale > 0 ? dt / stage.timeScale : dt
        me.t += raw
        // Le temps : ralenti pour la dernière bille et pour un « ouf », normal sinon
        me.slowFor = Math.max(0, me.slowFor - raw)
        if (!me.over) stage.timeScale = me.finalSlow ? 0.3 : me.slowFor > 0 ? 0.45 : 1
        for (let k = 0; k < me.turbo; k++) {
          if (!me.frozen) {
            sim.update(dt)
            for (const e of sim.events.splice(0)) onEvent(me, e)
          }
          game.tick(dt)
        }
        // La série retombe après 4 s sans un choc
        if (!me.over && game.s.combo > 0 && sim.t - me.lastHit > 4) game.miss()
        if (!me.over && me.armed && game.s.combo >= me.multiAt && sim.inPlay().length === 1) multiball(me)
        if (!me.over && !me.armed && game.s.combo === 0 && sim.inPlay().length <= 1) me.armed = true
        // Les batteurs retombent quand la bille attend sur le ressort, et
        // reprennent les doigts posés une fois lancée (sauf sous le pilote des tests)
        const lm = launchMode(me)
        if (lm !== me.wasLaunch) { me.wasLaunch = lm; if (!sim.pilot) applyInput(me) }

        // Les billes
        const seen = new Set<number>()
        for (const b of sim.balls) {
          let v = me.balls.get(b.id)
          if (!v) {
            const mesh = new T.Mesh(me.ballGeo, me.ballMat)
            mesh.castShadow = true
            const bl = new T.Mesh(me.blobGeo, me.blobMat)
            bl.rotation.x = -Math.PI / 2
            bl.scale.setScalar(0.62)
            table.add(mesh); table.add(bl)
            v = { mesh, blob: bl }
            me.balls.set(b.id, v)
          }
          seen.add(b.id)
          const vis = ballPos(me, b, tmp)
          v.mesh.visible = vis
          v.blob.visible = vis && (b.st === 'table' || b.st === 'ready')
          if (!vis) continue
          const p0 = v.mesh.position
          const dx = tmp.x - p0.x, dz = tmp.z - p0.z
          const d = Math.hypot(dx, dz)
          // Elle ROULE : elle tourne sur elle-même selon le chemin parcouru
          if (d > 1e-4 && d < 1) v.mesh.rotateOnWorldAxis(new T.Vector3(dz / d, 0, -dx / d), d / R)
          p0.copy(tmp)
          v.blob.position.set(tmp.x, 0.006, tmp.z)
        }
        for (const [id, v] of me.balls) {
          if (seen.has(id)) continue
          table.remove(v.mesh); table.remove(v.blob)
          me.balls.delete(id)
        }

        // Les batteurs
        sim.flippers.forEach((f, i) => { me.flippers[i].rotation.y = f.side === LEFT ? f.a : Math.PI - f.a })
        // Le ressort
        const pull = sim.readyBall() ? sim.pull : 0
        me.plunger.rod.position.z = -(TABLE.ready.y - R - 0.04) + pull * 0.32
        me.plunger.spring.position.z = me.plunger.rod.position.z + 0.08
        me.plunger.spring.scale.z = Math.max(0.2, 0.62 - pull * 0.32)
        // Les bottes de foin : l'élastique claque
        me.slings.forEach((s, i) => {
          me.slingKick[i] = Math.max(0, me.slingKick[i] - raw * 6)
          s.scale.set(1, 1 + me.slingKick[i] * 0.6, 1 + me.slingKick[i] * 1.4)
        })

        // Les animaux-bumpers : ils sautent, ils s'allument, et à la flamme ils se promènent
        me.bumpers.forEach((bv, i) => {
          const b = sim.bumpers[i]
          bv.hop = Math.max(0, bv.hop - raw * 3.2)
          bv.flash = Math.max(0, bv.flash - raw * 2.4)
          const jump = Math.sin(bv.hop * Math.PI) * 0.28 * Math.min(1, bv.hop * 2)
          bv.base.position.set(b.x, 0.1, -b.y)
          bv.halo.position.set(b.x, 0.015, -b.y)
          bv.haloMat.opacity = Math.min(1, bv.flash * 1.3)
          bv.ring.position.set(b.x, 0.07, -b.y)
          bv.c.obj.position.set(b.x, 0.2 + jump, -b.y)
          const sq = 1 + Math.sin(bv.hop * Math.PI * 2) * 0.08 * bv.hop
          bv.c.obj.scale.set(1 / sq, sq, 1 / sq)
          bv.c.obj.rotation.y = Math.sin(me.t * 0.8 + i * 2) * 0.25
          bv.cushion.emissiveIntensity = 0.12 + bv.flash * 1.4
          bv.ringMat.emissiveIntensity = bv.flash * 2.2
          bv.ring.scale.setScalar(1 + bv.flash * 0.1)
          for (const m of bv.glow) { m.emissive.setHex(0xFFD890); m.emissiveIntensity = bv.flash * 0.3 }
          kit.blink(bv.c, raw)
        })
        for (const cr of [me.hen, me.dog, me.rooster]) {
          kit.blink(cr, raw)
          const h = Math.max(0, (me.hops.get(cr) ?? 0) - raw * 2.4)
          me.hops.set(cr, h)
          const base = cr === me.hen ? FRAME_H : cr === me.dog ? APRON.h : cr.obj.userData.y0 ?? (cr.obj.userData.y0 = cr.obj.position.y)
          cr.obj.position.y = base + Math.abs(Math.sin(h * Math.PI * 1.5)) * 0.3 * Math.min(1, h)
        }
        // Le chien remue la queue en surveillant la sortie
        me.dog.obj.rotation.y = Math.sin(me.t * 3) * 0.12

        // Les œufs tombent dans le nid, se relèvent ensemble
        me.eggs.forEach((eg, i) => {
          const want = sim.eggs[i].down ? -0.25 : 0.3
          eg.h += (want - eg.h) * Math.min(1, raw * (want > eg.h ? 7 : 14))
          eg.mesh.position.y = eg.h
          eg.mesh.visible = eg.h > -0.2
        })

        // Les lampes : la série vers le multibille, les flèches qui appellent la rampe
        const series = me.armed ? Math.min(SERIES_LAMPS, Math.floor(game.s.combo / me.multiAt * SERIES_LAMPS + 1e-6)) : SERIES_LAMPS
        me.lamps.series.forEach((l, i) => {
          const on = i < series ? 1 : 0
          l.m.emissiveIntensity = on ? 1.5 + (me.armed ? 0 : Math.sin(me.t * 10 + i) * 0.6) : l.base
        })
        me.lamps.ramp.forEach((l, i) => {
          l.on = Math.max(0, l.on - raw * 0.8)
          const chase = (Math.floor(me.t * 3) % 3) === i ? 0.9 : 0.15
          l.m.emissiveIntensity = Math.max(chase, l.on)
        })
        me.lamps.eggs.forEach((l, i) => { l.m.emissiveIntensity = sim.eggs[i].down ? 1.4 : l.base })
        if (me.lamps.paw) me.lamps.paw.m.emissiveIntensity = sim.t >= sim.guardReadyAt ? 0.7 + Math.sin(me.t * 3) * 0.25 : 0.1

        // La grange : le grenier s'allume, la guirlande fait la fête
        me.party = Math.max(0, me.party - raw)
        const inBarn = sim.balls.some(b => b.st === 'barn' || (b.st === 'ramp' && b.s > RAMP_LEN * 0.8))
        me.barnGlow.forEach(m => { m.emissiveIntensity += ((inBarn || me.party > 0 ? 1.6 : 0.15) - m.emissiveIntensity) * Math.min(1, raw * 6) })
        me.bulbs.forEach((m, i) => { m.emissiveIntensity = me.party > 0 ? (Math.sin(me.t * 12 + i * 1.3) > 0 ? 2 : 0.3) : 0.8 + Math.sin(me.t * 1.6 + i) * 0.2 })

        // L'outro : le ralenti, puis les animaux saluent l'un après l'autre
        if (me.over || me.saluting) {
          me.outroT += raw
          if (me.outroT > 0.7) stage.timeScale = 1
          const order: Critter[] = [...me.bumpers.map(b => b.c), me.hen, me.dog, me.rooster]
          const voices: AnimalVoice[] = ['vache', 'cochon', 'mouton', 'poule', 'chien', 'coq']
          order.forEach((cr, i) => {
            const at = 0.9 + i * 0.32
            if (me.outroT >= at && (cr.obj.userData.bow ?? 0) === 0) {
              cr.obj.userData.bow = 1
              const bv = me.bumpers.find(b => b.c === cr)
              if (bv) { bv.hop = 1; bv.flash = 1 } else hop(me, cr, 1.2)
              if (i % 2 === 0) voice(me, voices[i], { max: 0.8, vol: 0.6 })
            }
          })
          // Et pour finir, tout le monde saute ensemble, dans une pluie d'étincelles
          if (me.outroT >= 2.75 && !me.table.userData.chorus) {
            me.table.userData.chorus = true
            me.bumpers.forEach(bv => {
              bv.hop = 1; bv.flash = 1
              const b = sim.bumpers[me.bumpers.indexOf(bv)]
              me.fx.burst(world(me, b.x, 1.1, b.y), { count: 26, color: [0xFFE08A, 0xFFFFFF, bv.color], speed: 2.8, life: 0.9, size: 0.1, gravity: 2.5 })
            })
            for (const cr of [me.hen, me.dog, me.rooster]) hop(me, cr, 1.3)
          }
        }

        // La caméra : posée, elle suit à peine la bille ; à la fin, elle prend du recul
        const lead = sim.balls.find(b => b.st === 'table')
        const ly = lead ? Math.max(0, Math.min(1, (lead.y - 2) / 6)) : 0.3
        const back = me.over || me.saluting ? Math.min(1, me.outroT / 2.4) : 0
        const cam = stage.camera
        cam.position.set(camBase.x, camBase.y + back * 1.2, camBase.z + back * 1.6 - ly * 0.25)
        cam.lookAt(0.35, CAM.ty + ly * 0.25 + back * 0.4, CAM.tz - ly * 0.3)
        me.shake.apply(raw)
        me.fx.update(me.frozen ? 0 : dt)
        void now
      })

      stage.keep({ dispose() {
        arena.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        window.removeEventListener('keydown', onKey)
        window.removeEventListener('keyup', onKey)
        downY = new Map()
        me.fx.dispose()
        me.game.dispose()
      } })
    })().catch(err => { if (!dead) throw err })

    return () => {
      if (dead) return
      dead = true
      hideLoader()
      if (pb) {
        pb.stage.dispose()
        pb = null
      }
      delete (window as unknown as { __pb?: unknown }).__pb
    }
  }
}
