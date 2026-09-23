import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { sCrunch, sPop, sWin, tone } from '../core/audio'
import { confetti } from '../core/fx'
import {
  createStage, loader, woodTex, bumpyNormal, picker,
  type Stage, type T3
} from '../core/three3d'
import { particles, decor, type Particles } from '../core/scene3d'
import { ICON } from '../core/icons'
import { sfx, preloadSfx } from '../core/sfx'

/* 🍕 La Pizzeria — refaite le 23/09 (« le jeu de pizza est absolument
   éclaté », les filles). Ce qui n'allait pas : des ingrédients illisibles
   (un « fromage » en pommes de terre, un épi de maïs planté debout, un
   oignon pour une olive) qui tombaient en vrac ; une cuisson qui ne se
   voyait pas ; une petite pizza au milieu d'une planche floue.

   Ce qu'elle est devenue, en trois temps et UNE chose à faire à la fois :
   1. GARNIR. La pizza en grand sur sa pelle en bois. Dix bols de chaque
      côté de l'écran : on touche un bol, puis on étale (la sauce suit le
      doigt) ou on saupoudre en glissant — les ingrédients tombent SOUS le
      doigt et se posent à plat. Ce sont de vrais ingrédients de pizza,
      construits en 3D comme les animaux de la ferme : mozzarella râpée,
      rondelles de tomate, lamelles de champignon, olives, jambon, lanières
      de poivron, basilic, grains de maïs.
   2. CUIRE. Le gros bouton flamme : la pelle glisse dans le four, la caméra
      suit. La cuisson SE VOIT : la pâte dore, le bord gonfle, la mozzarella
      fond en nappe puis gratine ; oubliée, la pizza noircit et fume. La
      jauge dit quand c'est parfait ; sortie trop tôt, la pizza ne sort pas :
      « pas encore », elle continue de cuire (Créer = aucune sanction).
   3. CROQUER. La pizza se coupe en six parts sous nos yeux ; on en tire
      une, et le fromage FILE avant de casser. Plus de parts : c'est fini.

   Plus de physique (cannon) : les ingrédients tombent sur une trajectoire
   maîtrisée, rebondissent une fois et se posent à plat — lisibles, jamais
   debout. La surface de la pizza est UNE texture composée à la volée :
   pâte (qui dore), sauce (peinte au doigt), nappe de fromage (qui fond),
   gratin, et le noir du brûlé. */

const PR = 0.56            // rayon de la pizza (bord compris)
const PR_IN = PR - 0.075   // rayon de la garniture
const PH = 0.03            // épaisseur de la pâte
const SLICES = 6
const OVEN_Z = -1.55
const TEX = 1024
const MAX_PIECES = 180
/** La cuisson va de 0 (crue) à 1 (charbon) ; la zone parfaite, au milieu. */
const PERFECT_FROM = 0.58, PERFECT_TO = 0.86

type Sauce = 'tomato' | 'cream'
type Topping = 'cheese' | 'slice' | 'mushroom' | 'olive' | 'ham' | 'pepper' | 'basil' | 'corn'
type ToolId = Sauce | Topping
type Phase = 'garnir' | 'cuisson' | 'servi'

const SAUCE_COL: Record<Sauce, string> = { tomato: '#C8321F', cream: '#FFF6E2' }
/** Chaque ingrédient a SA note : l'oreille reconnaît ce qu'on saupoudre. */
const NOTE: Record<Topping, number> = {
  cheese: 523, slice: 440, mushroom: 349, olive: 294, ham: 392, pepper: 587, basil: 659, corn: 784
}

/* ---------- Les bols (SVG) : on voit ce qu'il y a dedans ---------- */
const bowl = (inside: string, rim = '#F4E6CF') => `<svg viewBox="0 0 64 64" width="64" height="64">
  <ellipse cx="32" cy="52" rx="22" ry="5" fill="rgba(60,35,20,.25)"/>
  <path d="M6 28h52c0 14-11 24-26 24S6 42 6 28z" fill="#D9825B"/>
  <path d="M10 34c3 9 11 15 22 15s19-6 22-15" fill="none" stroke="#C06A45" stroke-width="2.5"/>
  <ellipse cx="32" cy="28" rx="26" ry="9" fill="${rim}"/>
  <g>${inside}</g></svg>`
const BOWL: Record<ToolId, string> = {
  tomato: bowl('<ellipse cx="32" cy="28" rx="22" ry="7" fill="#C8321F"/><ellipse cx="25" cy="26" rx="6" ry="1.8" fill="#E86A52"/>'),
  cream: bowl('<ellipse cx="32" cy="28" rx="22" ry="7" fill="#FFFBEF"/><ellipse cx="26" cy="26" rx="7" ry="2" fill="#FFFFFF"/>', '#E8D2B0'),
  cheese: bowl(['M18 26l8 3', 'M28 22l7 4', 'M36 27l9-2', 'M22 31l9-1', 'M40 30l6 2', 'M31 25l2 7', 'M44 23l4 5']
    .map(d => `<path d="${d}" stroke="#F7E3A1" stroke-width="3.4" stroke-linecap="round"/>`).join('')),
  slice: bowl([[22, 26], [34, 24], [42, 29], [28, 31]].map(([x, y]) =>
    `<circle cx="${x}" cy="${y}" r="7" fill="#D63A2A"/><circle cx="${x}" cy="${y}" r="4.5" fill="#EF6A55"/><circle cx="${x}" cy="${y}" r="1.5" fill="#F9C9A8"/>`).join('')),
  mushroom: bowl([[20, 27], [32, 24], [44, 27], [28, 32], [39, 32]].map(([x, y]) =>
    `<path d="M${x - 6} ${y}a6 5 0 0 1 12 0z" fill="#EAD9C0" stroke="#A5825F" stroke-width="1.4"/><rect x="${x - 2}" y="${y}" width="4" height="4" fill="#EAD9C0"/>`).join('')),
  olive: bowl([[21, 26], [31, 24], [41, 26], [26, 31], [37, 31], [46, 30]].map(([x, y]) =>
    `<circle cx="${x}" cy="${y}" r="4" fill="none" stroke="#2E2533" stroke-width="3"/>`).join('')),
  ham: bowl([[23, 26], [37, 25], [30, 31]].map(([x, y]) =>
    `<ellipse cx="${x}" cy="${y}" rx="8" ry="5.5" fill="#EE9A9C"/><ellipse cx="${x - 2}" cy="${y - 1}" rx="3" ry="1.6" fill="#F7C3C4"/>`).join('')),
  pepper: bowl([[22, 27], [32, 24], [42, 28], [30, 31]].map(([x, y], i) =>
    `<path d="M${x - 7} ${y}q7 ${i % 2 ? -7 : 7} 14 0" fill="none" stroke="#3E9A3C" stroke-width="3.6" stroke-linecap="round"/>`).join('')),
  basil: bowl([[22, 27, -20], [33, 24, 15], [43, 28, -10], [30, 31, 40]].map(([x, y, r]) =>
    `<g transform="rotate(${r} ${x} ${y})"><path d="M${x - 7} ${y}q7 -7 14 0q-7 7 -14 0z" fill="#2F8A34"/><path d="M${x - 6} ${y}h12" stroke="#5DB85A" stroke-width="1.2"/></g>`).join('')),
  corn: bowl(Array.from({ length: 14 }, (_, i) =>
    `<circle cx="${17 + (i % 7) * 5 + (i > 6 ? 2 : 0)}" cy="${i > 6 ? 30 : 25}" r="2.6" fill="#F6C43B"/>`).join(''))
}
const LEFT: ToolId[] = ['tomato', 'cream', 'cheese', 'ham', 'slice']
const RIGHT: ToolId[] = ['mushroom', 'olive', 'pepper', 'basil', 'corn']

type Obj3D = import('three').Object3D
type StdMat = import('three').MeshStandardMaterial

/** Un ingrédient qui tombe : trajectoire simple, un rebond, puis à plat. */
interface Falling { obj: Obj3D; kind: Topping; x: number; z: number; y: number; vy: number; ty: number; bounced: boolean; spin: number }
interface Wedge { group: import('three').Group; a0: number; items: Obj3D[]; cheese: number; eaten: boolean; lift: number; strands: Strand[] }
interface Strand { mesh: import('three').Mesh; a: import('three').Vector3; b: import('three').Vector3; snap: number }

interface State {
  stage: Stage
  phase: Phase
  tool: ToolId
  peel: import('three').Group
  pizza: import('three').Group
  wedges: Wedge[]
  layers: {
    out: CanvasRenderingContext2D; tex: import('three').CanvasTexture
    dough: HTMLCanvasElement; sauce: CanvasRenderingContext2D; cheese: CanvasRenderingContext2D
    gratin: CanvasRenderingContext2D; dirty: boolean; t: number
  }
  crustMat: StdMat
  sideMat: StdMat
  crusts: import('three').Mesh[]
  kit: Record<Topping, { make: () => import('three').Mesh; mats: StdMat[] }>
  baseCols: Map<StdMat, import('three').Color>
  falling: Falling[]
  cheeseBits: import('three').Mesh[]
  stack: Map<number, number>
  pieces: number
  bake: number
  bakeRate: number
  perfect: boolean
  tickT: number
  smokeT: number
  steamT: number
  lastDrop: number
  lastSquish: number
  cut: number
  eaten: number
  ended: boolean
  fx: Particles
  flames: { sp: import('three').Sprite; base: number; phase: number; speed: number }[]
  fireLight: import('three').PointLight
  cam: { pos: import('three').Vector3; look: import('three').Vector3; lookNow: import('three').Vector3 }
  strandGeo: import('three').CylinderGeometry
  strandMat: StdMat
}

let ctx: GameContext
let S: State | null = null

/* ---------- La surface de la pizza : cinq couches composées ---------- */
function canvas2d(size = TEX) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}
function doughBase(): HTMLCanvasElement {
  const c = canvas2d()
  const g = c.getContext('2d')!
  g.fillStyle = '#D9B173'; g.fillRect(0, 0, TEX, TEX)
  // Le grain de la pâte et un voile de farine
  for (let i = 0; i < 5200; i++) {
    g.fillStyle = `hsla(${34 + Math.random() * 12},${40 + Math.random() * 25}%,${58 + Math.random() * 22}%,.4)`
    g.beginPath(); g.arc(Math.random() * TEX, Math.random() * TEX, 1 + Math.random() * 4, 0, 7); g.fill()
  }
  return c
}
/** Coordonnées pizza (x, z) → pixel de la texture (la face du dessus est un
    disque dont les UV sont planaires : x → colonnes, z → lignes). */
const toTex = (x: number, z: number) => ({ px: (x / PR_IN + 1) / 2 * TEX, py: (z / PR_IN + 1) / 2 * TEX })

function paintSauce(me: State, x: number, z: number, sauce: Sauce) {
  const g = me.layers.sauce
  const { px, py } = toTex(x, z)
  const r = 64
  g.fillStyle = SAUCE_COL[sauce]
  // Une louche, pas un tampon : quelques ronds qui se chevauchent
  for (let k = 0; k < 5; k++) {
    const a = Math.random() * 7, d = Math.random() * r * 0.35
    g.beginPath(); g.arc(px + Math.cos(a) * d, py + Math.sin(a) * d, r * (0.55 + Math.random() * 0.3), 0, 7); g.fill()
  }
  me.layers.dirty = true
}
/** La nappe de mozzarella que dépose une pincée de fromage (visible en fondant). */
function paintCheese(me: State, x: number, z: number) {
  const g = me.layers.cheese
  const { px, py } = toTex(x, z)
  for (let k = 0; k < 6; k++) {
    const a = Math.random() * 7, d = Math.random() * 38
    const cx = px + Math.cos(a) * d, cy = py + Math.sin(a) * d, r = 30 + Math.random() * 24
    const gr = g.createRadialGradient(cx, cy, r * 0.3, cx, cy, r)
    // Une mozzarella fondue est crème-jaune, pas blanche (l'éclairage l'éclaircit)
    gr.addColorStop(0, 'rgba(240,206,120,1)')
    gr.addColorStop(0.7, 'rgba(236,198,108,.95)')
    gr.addColorStop(1, 'rgba(230,190,100,0)')
    g.fillStyle = gr
    g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill()
  }
}
/** Le gratin : des taches dorées qui ne vivent QUE sur le fromage. */
function buildGratin(me: State) {
  const g = me.layers.gratin
  g.clearRect(0, 0, TEX, TEX)
  g.globalCompositeOperation = 'source-over'
  g.drawImage(me.layers.cheese.canvas, 0, 0)
  g.globalCompositeOperation = 'source-atop'
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * TEX, y = Math.random() * TEX, r = 3 + Math.random() * 13
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, `rgba(${170 + Math.random() * 30},${100 + Math.random() * 25},40,.9)`)
    gr.addColorStop(1, 'rgba(200,140,60,0)')
    g.fillStyle = gr
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
  }
  g.globalCompositeOperation = 'source-over'
}

function composite(me: State) {
  const L = me.layers
  const g = L.out
  const k = me.bake
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  g.drawImage(L.dough, 0, 0)
  // La pâte dore
  const gold = Math.min(1, k / PERFECT_FROM)
  if (gold > 0) {
    g.globalCompositeOperation = 'multiply'
    g.globalAlpha = gold * 0.7
    g.fillStyle = '#C98A48'; g.fillRect(0, 0, TEX, TEX)
    g.globalCompositeOperation = 'source-over'
  }
  g.globalAlpha = 1
  g.drawImage(L.sauce.canvas, 0, 0)
  // La mozzarella fond en nappe…
  const melt = Math.max(0, Math.min(1, (k - 0.08) / 0.34))
  if (melt > 0) { g.globalAlpha = melt; g.drawImage(L.cheese.canvas, 0, 0) }
  // … puis gratine
  const grat = Math.max(0, Math.min(1, (k - 0.45) / 0.38))
  if (grat > 0) { g.globalAlpha = grat * 0.85; g.drawImage(L.gratin.canvas, 0, 0) }
  // Oubliée au four : tout noircit
  const burn = Math.max(0, Math.min(1, (k - PERFECT_TO) / (1 - PERFECT_TO)))
  if (burn > 0) {
    g.globalCompositeOperation = 'multiply'
    g.globalAlpha = burn * 0.9
    g.fillStyle = '#2A1B12'; g.fillRect(0, 0, TEX, TEX)
    g.globalCompositeOperation = 'source-over'
  }
  g.globalAlpha = 1
  L.tex.needsUpdate = true
  L.dirty = false
}

/* ---------- Les ingrédients, construits en 3D ----------
   Formes simples et lisibles, couleurs SOMBRES (l'ACES les remonte — piège
   connu), une géométrie par sorte partagée par toutes les copies : 180
   morceaux restent 240 appels de dessin au plus, pas 1500. */
function buildKit(T: T3): State['kit'] {
  const std = (c: number, r = 0.6) => new T.MeshStandardMaterial({ color: c, roughness: r })
  const merge = (parts: [import('three').BufferGeometry, number, number, number, number?][]) => {
    // Petite fusion maison : positions + normales, décalées et tournées sur Y
    const pos: number[] = [], nor: number[] = [], idx: number[] = []
    let off = 0
    for (const [geo, x, y, z, ry = 0] of parts) {
      const g = geo.index ? geo.toNonIndexed() : geo
      const p = g.attributes.position, n = g.attributes.normal
      const c = Math.cos(ry), s = Math.sin(ry)
      for (let i = 0; i < p.count; i++) {
        const px = p.getX(i), pz = p.getZ(i), nx = n.getX(i), nz = n.getZ(i)
        pos.push(px * c + pz * s + x, p.getY(i) + y, -px * s + pz * c + z)
        nor.push(nx * c + nz * s, n.getY(i), -nx * s + nz * c)
        idx.push(off + i)
      }
      off += p.count
      if (g !== geo) g.dispose()
      geo.dispose()
    }
    const out = new T.BufferGeometry()
    out.setAttribute('position', new T.Float32BufferAttribute(pos, 3))
    out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3))
    out.setIndex(idx)
    return out
  }

  // Mozzarella râpée : une pincée de brins couchés
  const cheeseMat = std(0xC9AA5C, 0.5)
  const cheeseGeos = [0, 1, 2].map(() => merge(Array.from({ length: 7 }, () => {
    const g = new T.CapsuleGeometry(0.0045, 0.026, 3, 6)
    g.rotateZ(Math.PI / 2)
    const a = Math.random() * 6.3, d = Math.random() * 0.024
    return [g, Math.cos(a) * d, 0.004 + Math.random() * 0.004, Math.sin(a) * d, Math.random() * 6.3] as [import('three').BufferGeometry, number, number, number, number]
  })))
  // Rondelle de tomate : la chair rouge, le cœur plus clair, les pépins
  const tomatoMat = std(0xB5281B, 0.45), tomatoIn = std(0xD4553F, 0.5), seedMat = std(0xE2B07A, 0.5)
  const sliceGeo = new T.CylinderGeometry(0.05, 0.05, 0.012, 22)
  const sliceIn = new T.CylinderGeometry(0.036, 0.036, 0.013, 18)
  const seedGeo = merge(Array.from({ length: 6 }, (_, i) => {
    const g = new T.SphereGeometry(0.006, 6, 4)
    g.scale(1, 0.4, 0.6)
    const a = i / 6 * Math.PI * 2
    return [g, Math.cos(a) * 0.02, 0.0068, Math.sin(a) * 0.02, -a] as [import('three').BufferGeometry, number, number, number, number]
  }))
  // Lamelle de champignon : le profil en coupe (chapeau + pied), extrudé
  const mushMat = std(0xCDB597, 0.7), mushEdge = std(0x7A5A3E, 0.8)
  const ms = new T.Shape()
  ms.moveTo(-0.045, 0); ms.quadraticCurveTo(-0.047, 0.04, 0, 0.042); ms.quadraticCurveTo(0.047, 0.04, 0.045, 0)
  ms.lineTo(0.014, 0); ms.lineTo(0.016, -0.034); ms.lineTo(-0.016, -0.034); ms.lineTo(-0.014, 0); ms.lineTo(-0.045, 0)
  const mushGeo = new T.ExtrudeGeometry(ms, { depth: 0.008, bevelEnabled: false })
  mushGeo.rotateX(-Math.PI / 2)
  const capRim = new T.TorusGeometry(0.044, 0.0035, 4, 20, Math.PI)
  capRim.rotateX(-Math.PI / 2); capRim.scale(1, 1, 0.95); capRim.translate(0, 0.008, 0)
  // Olive noire en anneau
  const oliveMat = std(0x1E1822, 0.3)
  const oliveGeo = new T.TorusGeometry(0.017, 0.008, 8, 16)
  oliveGeo.rotateX(Math.PI / 2)
  // Jambon : un disque rose ondulé, et son gras plus clair
  const hamMat = std(0xC86A70, 0.55), hamFat = std(0xE9B7B4, 0.6)
  const hamGeo = new T.CylinderGeometry(0.046, 0.046, 0.006, 20)
  {
    const p = hamGeo.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i)
      const a = Math.atan2(z, x), r = Math.hypot(x, z)
      const k = 1 + Math.sin(a * 5) * 0.08
      p.setXYZ(i, Math.cos(a) * r * k, p.getY(i) + Math.sin(a * 3) * 0.002 * (r / 0.046), Math.sin(a) * r * k)
    }
    hamGeo.computeVertexNormals()
  }
  const hamSpot = new T.CylinderGeometry(0.012, 0.012, 0.007, 10)
  // Poivron : une lanière arquée
  const pepperMat = std(0x2E7A2C, 0.35)
  const pepperGeo = new T.TorusGeometry(0.03, 0.0055, 6, 14, Math.PI * 0.85)
  pepperGeo.rotateX(Math.PI / 2); pepperGeo.scale(1, 1.6, 1)
  // Basilic : une feuille bombée avec sa nervure
  const basilMat = std(0x1F6B27, 0.5), veinMat = std(0x4FA14A, 0.6)
  const ls = new T.Shape()
  ls.moveTo(-0.034, 0); ls.quadraticCurveTo(0, 0.026, 0.034, 0); ls.quadraticCurveTo(0, -0.026, -0.034, 0)
  const leafGeo = new T.ShapeGeometry(ls, 10)
  leafGeo.rotateX(-Math.PI / 2)
  {
    const p = leafGeo.attributes.position
    for (let i = 0; i < p.count; i++) p.setY(i, 0.006 - Math.abs(p.getZ(i)) * 0.25 + (1 - Math.abs(p.getX(i)) / 0.034) * 0.002)
    leafGeo.computeVertexNormals()
  }
  const veinGeo = new T.BoxGeometry(0.056, 0.002, 0.0025)
  veinGeo.translate(0, 0.0072, 0)
  // Maïs : quelques grains dorés
  const cornMat = std(0xD9A21B, 0.4)
  const cornGeos = [0, 1].map(() => merge(Array.from({ length: 5 }, () => {
    const g = new T.SphereGeometry(0.0075, 8, 6)
    g.scale(1, 0.75, 0.9)
    const a = Math.random() * 6.3, d = Math.random() * 0.02
    return [g, Math.cos(a) * d, 0.006, Math.sin(a) * d] as [import('three').BufferGeometry, number, number, number]
  })))

  // Pas d'ombre portée : à plat sur la pizza elle ne se voit pas, et elle doublerait les appels de dessin
  const one = (geo: import('three').BufferGeometry, mat: StdMat) => new T.Mesh(geo, mat)
  const group = (...m: import('three').Mesh[]) => {
    // Un seul Mesh « racine » (pour la liste), ses pièces en enfants
    const [root, ...rest] = m
    rest.forEach(r => root.add(r))
    return root
  }
  return {
    cheese: { make: () => one(cheeseGeos[(Math.random() * 3) | 0], cheeseMat), mats: [cheeseMat] },
    slice: { make: () => group(one(sliceGeo, tomatoMat), one(sliceIn, tomatoIn), one(seedGeo, seedMat)), mats: [tomatoMat, tomatoIn, seedMat] },
    mushroom: { make: () => group(one(mushGeo, mushMat), one(capRim, mushEdge)), mats: [mushMat, mushEdge] },
    olive: { make: () => one(oliveGeo, oliveMat), mats: [oliveMat] },
    ham: {
      make: () => {
        const h = one(hamGeo, hamMat)
        const s = one(hamSpot, hamFat); s.position.set((Math.random() - 0.5) * 0.04, 0.0005, (Math.random() - 0.5) * 0.04)
        h.add(s); return h
      },
      mats: [hamMat, hamFat]
    },
    pepper: { make: () => one(pepperGeo, pepperMat), mats: [pepperMat] },
    basil: { make: () => group(one(leafGeo, basilMat), one(veinGeo, veinMat)), mats: [basilMat, veinMat] },
    corn: { make: () => one(cornGeos[(Math.random() * 2) | 0], cornMat), mats: [cornMat] }
  }
}
/** Épaisseur d'un ingrédient posé : de quoi empiler sans se traverser. */
const THICK: Record<Topping, number> = { cheese: 0.004, slice: 0.012, mushroom: 0.008, olive: 0.008, ham: 0.006, pepper: 0.01, basil: 0.006, corn: 0.009 }

/* ---------- Garnir ---------- */
function wedgeAt(x: number, z: number) {
  let a = Math.atan2(-z, x)
  if (a < 0) a += Math.PI * 2
  return Math.min(SLICES - 1, Math.floor(a / (Math.PI * 2 / SLICES)))
}
function drop(me: State, kind: Topping, x: number, z: number) {
  if (me.pieces >= MAX_PIECES) return
  // Toujours SUR la pizza : un morceau lâché au bord glisse vers l'intérieur
  const d = Math.hypot(x, z), lim = PR_IN - 0.035
  if (d > lim) { x *= lim / d; z *= lim / d }
  // Petite pile : chaque case de 3 cm garde sa hauteur
  const cell = Math.round(x / 0.03) * 1000 + Math.round(z / 0.03)
  const h = me.stack.get(cell) || 0
  me.stack.set(cell, Math.min(0.03, h + THICK[kind] * 0.8))
  const obj = me.kit[kind].make()
  obj.rotation.set((Math.random() - 0.5) * 0.12, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.12)
  const ty = PH + 0.001 + h
  obj.position.set(x, ty + 0.3, z)
  me.pizza.add(obj)
  me.falling.push({ obj, kind, x, z, y: ty + 0.3, vy: -0.4, ty, bounced: false, spin: (Math.random() - 0.5) * 7 })
  me.pieces++
  tone(NOTE[kind], 0.06, 'triangle', 0.05)
}
function land(me: State, f: Falling) {
  const w = me.wedges[wedgeAt(f.x, f.z)]
  w.group.attach(f.obj)
  w.items.push(f.obj)
  if (f.kind === 'cheese') {
    w.cheese++
    me.cheeseBits.push(f.obj as import('three').Mesh)
    paintCheese(me, f.x, f.z)
  }
  // Une pincée de farine soulevée : le contact se VOIT
  const p = f.obj.getWorldPosition(new me.stage.T.Vector3())
  me.fx.burst({ x: p.x, y: p.y + 0.01, z: p.z }, { count: 3, color: [0xFFF4DC, 0xE9D6B0], speed: 0.18, spread: 0.5, life: 0.4, size: 0.03, gravity: -0.3 })
}

/* ---------- Cuire ---------- */
function setPhase(me: State, p: Phase) {
  me.phase = p
  const arena = $('pzArena')
  arena.classList.toggle('garnir', p === 'garnir')
  arena.classList.toggle('cuisson', p === 'cuisson')
  arena.classList.toggle('servi', p === 'servi')
  $('pzCook').classList.toggle('on', p === 'cuisson')
  const T = me.stage.T
  // Où regarde la caméra (elle y glisse en douceur)
  if (p === 'cuisson') { me.cam.pos.set(0, 0.78, -0.32); me.cam.look.set(0, 0.06, OVEN_Z) }
  else if (p === 'servi') { me.cam.pos.set(0, 1.28, 0.95); me.cam.look.set(0, 0.02, 0.02) }
  else { me.cam.pos.set(0, 1.42, 0.88); me.cam.look.set(0, 0, 0.04) }
  void T
}
function toOven(me: State) {
  if (me.phase !== 'garnir' || me.ended) return
  // Tout ce qui tombe encore se pose d'un coup avant d'enfourner
  for (const f of me.falling) { f.obj.position.y = f.ty; land(me, f) }
  me.falling = []
  buildGratin(me)
  setPhase(me, 'cuisson')
  sfx('cloth', { vol: 0.5, rate: 0.8 })
  tone(180, 0.5, 'sawtooth', 0.05)
}
function paintGauge(me: State, dt: number) {
  const n = document.getElementById('pzNeedle')
  if (n) n.style.left = `${Math.min(100, me.bake * 100)}%`
  const good = me.bake >= PERFECT_FROM && me.bake <= PERFECT_TO
  if (good !== me.perfect) {
    me.perfect = good
    document.getElementById('pzCook')?.classList.toggle('go', good)
    if (good) { tone(880, 0.14, 'triangle', 0.09); tone(1320, 0.16, 'triangle', 0.07, 0.1) }
    else tone(200, 0.2, 'sawtooth', 0.06)
  }
  // Un tic-tac qui s'accélère à l'approche : l'oreille compte à rebours
  const period = me.bake < PERFECT_FROM ? 0.34 : good ? 0.16 : 0.5
  me.tickT += dt
  if (me.tickT >= period) { me.tickT = 0; tone(good ? 660 : 420, 0.04, 'square', good ? 0.05 : 0.03) }
}
function verdict(html: string, cls = '') {
  const v = $('pzVerdict')
  v.innerHTML = html
  v.className = 'pz-verdict show ' + cls
  ctx.after(2000, () => { const e = document.getElementById('pzVerdict'); if (e) e.className = 'pz-verdict' })
}
/** Sortir la pizza : trop tôt, elle ne sort pas (« pas encore ») et continue
    de cuire — aucune sanction, on est dans Créer. */
function pullOut(me: State) {
  if (me.phase !== 'cuisson' || me.ended) return
  if (me.bake < PERFECT_FROM) {
    verdict(ICON.clock, 'pale')
    const g = document.querySelector('.pz-gauge')
    g?.classList.remove('pz-nope'); void (g as HTMLElement | null)?.offsetWidth; g?.classList.add('pz-nope')
    tone(230, 0.25, 'sine', 0.08)
    return
  }
  sPop()
  me.perfect = false
  document.getElementById('pzCook')?.classList.remove('go')
  if (me.bake <= PERFECT_TO) { verdict(ICON.star, 'perfect'); confetti(); sWin() }
  else { verdict(ICON.flame, 'burnt'); tone(110, 0.5, 'sawtooth', 0.06) }
  me.steamT = 3.5
  setPhase(me, 'servi')
  // On la coupe en six sous nos yeux, une fois revenue sur la table
  me.cut = 0
  for (let i = 0; i < 3; i++) ctx.after(1300 + i * 260, () => { if (S === me) { sfx('slice', { vol: 0.6, rate: 0.9 + i * 0.1 }); me.cut = i + 1 } })
}

/* ---------- Croquer ---------- */
function takeWedge(me: State, wi: number) {
  const w = me.wedges[wi]
  if (!w || w.eaten || w.lift > 0 || me.cut < 3) return
  w.lift = 0.001
  sfx('cloth', { vol: 0.4, rate: 1.3 })
  // Le fromage FILE : des fils entre la part et le reste de la pizza.
  // Pas de fromage, ou pizza brûlée : ça casse net, pas de fil
  if (w.cheese < 1 || me.bake > PERFECT_TO + 0.06) return
  const T = me.stage.T
  const mid = w.a0 + Math.PI / SLICES
  const n = Math.min(8, 3 + w.cheese)
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1
    const along = 0.08 + Math.random() * 0.3
    const a = mid + side * (Math.PI / SLICES) * (0.98 + Math.random() * 0.02)
    // L'ancre reste sur la part voisine, l'autre bout suit la part soulevée
    const anchor = new T.Vector3(Math.cos(a) * along, PH + 0.004, -Math.sin(a) * along)
    const b = new T.Vector3(Math.cos(a - side * 0.05) * along, PH + 0.004, -Math.sin(a - side * 0.05) * along)
    const mesh = new T.Mesh(me.strandGeo, me.strandMat)
    me.pizza.add(mesh)
    w.strands.push({ mesh, a: anchor, b, snap: 0.14 + Math.random() * 0.16 })
  }
}
function finish(me: State) {
  if (me.ended) return
  me.ended = true
  confetti(); sWin()
  const burnt = me.bake > PERFECT_TO
  ctx.finish({
    title: me.eaten >= SLICES ? (burnt ? 'Toute noire… et dévorée !' : 'Pizza dévorée !') : 'Quelle belle pizza !',
    msg: `Tu as posé ${me.pieces} ingrédient${me.pieces > 1 ? 's' : ''}`,
    stars: 3
  })
}

export const pizza: GameDef = {
  id: 'pizza', name: 'La Pizzeria', icon: '🍕', sq: 'sq-peach', cat: 'creatif', music: 'kitchen',
  subtitle: 'Sauce, fromage, garniture… au four, puis on croque !',
  mount(c) {
    ctx = c
    let dead = false
    const bowlBtn = (t: ToolId) => `<button class="pz-bowl${t === 'tomato' ? ' sel' : ''}" data-t="${t}" aria-label="${t}">${BOWL[t]}</button>`
    c.root.innerHTML = `
      <div class="arena g3-arena pz-arena garnir" id="pzArena">
        <div class="pz-bowls left">${LEFT.map(bowlBtn).join('')}</div>
        <div class="pz-bowls right">${RIGHT.map(bowlBtn).join('')}</div>
        <button class="pz-oven" id="pzOven" aria-label="Au four">${ICON.flame}</button>
        <!-- LE mini-jeu de cuisson : la jauge, sa zone verte, le curseur -->
        <div class="pz-cook" id="pzCook">
          <div class="pz-gauge"><span class="pz-perfect"></span><b id="pzNeedle"></b></div>
          <button class="sn-tool pz-pull" id="pzOut" aria-label="Sortir la pizza">${ICON.out}</button>
        </div>
        <button class="sn-tool go pz-done" id="pzDone" aria-label="Fini">${ICON.check}</button>
        <div class="pz-verdict" id="pzVerdict"></div>
      </div>`

    const arena = $('pzArena')
    const hideLoader = loader(arena, 'pizza')
    preloadSfx(['cloth', 'tick', 'slice'])

    ;(async () => {
      const stage: Stage = await createStage(arena, {
        sky: '#2A1C14',
        fog: [4, 11], fogColor: '#2A1C14',
        cam: [0, 1.42, 0.88], target: [0, 0, 0.04], fov: 44,
        hemi: ['#FFE6C4', '#3A2618', 0.8],
        sun: { pos: [1.2, 3.4, 1.8], color: '#FFF1DA', intensity: 2.2, area: 2.2, far: 10 },
        fill: 0.35, exposure: 0.9
      })
      if (dead) { stage.dispose(); return }
      const T = stage.T
      const scene = stage.scene

      /* --- Plan de travail : bois net, farine autour de la pelle --- */
      const counter = new T.Mesh(new T.PlaneGeometry(10, 10), new T.MeshStandardMaterial({
        map: stage.keep(woodTex(T, '#8A5F38', 9)), roughness: 0.7, metalness: 0.02
      }))
      counter.rotation.x = -Math.PI / 2
      counter.receiveShadow = true
      scene.add(counter)
      {
        const fc = canvas2d(512), g = fc.getContext('2d')!
        // Un voile de farine : des grains fins, plus denses près de la pelle
        for (let i = 0; i < 9000; i++) {
          const a = Math.random() * 7, r = Math.pow(Math.random(), 0.6) * 250
          g.fillStyle = `rgba(255,250,238,${0.08 + Math.random() * 0.22})`
          g.fillRect(256 + Math.cos(a) * r, 256 + Math.sin(a) * r, 0.8 + Math.random() * 1.2, 0.8 + Math.random() * 1.2)
        }
        const ft = stage.keep(new T.CanvasTexture(fc))
        const flour = new T.Mesh(new T.PlaneGeometry(2.1, 2.1), new T.MeshStandardMaterial({ map: ft, transparent: true, depthWrite: false, roughness: 1 }))
        flour.rotation.x = -Math.PI / 2
        flour.position.set(0.05, 0.002, 0.05)
        flour.receiveShadow = true
        scene.add(flour)
      }
      // Un rouleau à pâtisserie et quelques produits sur le plan de travail
      {
        const woodMat = new T.MeshStandardMaterial({ color: 0xB07A45, roughness: 0.6 })
        const pin = new T.Group()
        const barrel = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.55, 18), woodMat)
        barrel.rotation.z = Math.PI / 2
        const h1 = new T.Mesh(new T.CylinderGeometry(0.022, 0.022, 0.16, 10), woodMat)
        h1.rotation.z = Math.PI / 2; h1.position.x = 0.35
        const h2 = h1.clone(); h2.position.x = -0.35
        pin.add(barrel, h1, h2)
        pin.traverse(o => { o.castShadow = true })
        pin.position.set(0.98, 0.05, 0.42)
        pin.rotation.y = 0.9
        scene.add(pin)
      }
      decor(stage, [
        { model: 'food/cheese-cut', x: -1.12, z: -0.42, size: 0.36, rot: 0.6, shade: 0.8 },
        { model: 'food/pepper', x: 1.02, z: -0.5, size: 0.17, rot: 0.3, shade: 0.8 },
        { model: 'food/mushroom', x: 1.2, z: -0.28, size: 0.12, rot: 1.2, shade: 0.8 },
        { model: 'food/mushroom', x: 1.1, z: -0.2, size: 0.1, rot: 2.4, shade: 0.8 },
        { model: 'food/bread', x: -1.1, z: 0.3, size: 0.34, rot: -0.5, shade: 0.8 }
      ]).catch(() => { /* sans décor, on cuisine quand même */ })

      /* --- Le four à bois : une vraie voûte, ouverte vers nous --- */
      const brick = new T.MeshStandardMaterial({
        color: 0xA84B36, roughness: 0.96, normalMap: stage.keep(bumpyNormal(T, 20, 5)), normalScale: new T.Vector2(0.8, 0.8)
      })
      const soot = new T.MeshStandardMaterial({ color: 0x3A2318, roughness: 1, side: T.BackSide })
      const VR = 0.8, VL = 1.15, VZ = OVEN_Z - 0.12
      const oven = new T.Group()
      const vault = new T.Mesh(new T.CylinderGeometry(VR, VR, VL, 24, 1, true, 0, Math.PI), soot)
      vault.rotation.set(Math.PI / 2, 0, -Math.PI / 2)
      vault.position.set(0, 0, VZ)
      const back = new T.Mesh(new T.CircleGeometry(VR, 24, 0, Math.PI), new T.MeshStandardMaterial({ color: 0x33200F, roughness: 1 }))
      back.position.set(0, 0, VZ - VL / 2)
      const sole = new T.Mesh(new T.PlaneGeometry(VR * 2, VL), new T.MeshStandardMaterial({ color: 0x5E4230, roughness: 0.95 }))
      sole.rotation.x = -Math.PI / 2
      sole.position.set(0, 0.004, VZ)
      const shell = new T.Mesh(new T.CylinderGeometry(VR + 0.17, VR + 0.17, VL + 0.1, 24, 1, true, 0, Math.PI), brick)
      shell.rotation.copy(vault.rotation); shell.position.copy(vault.position); shell.castShadow = true
      const frame = new T.Mesh(new T.RingGeometry(VR, VR + 0.17, 24, 1, 0, Math.PI), brick)
      frame.position.set(0, 0, VZ + VL / 2 + 0.03)
      oven.add(vault, back, sole, shell, frame)
      // Le feu : des langues de flammes additives qui dansent, et des bûches
      const fc = canvas2d(128); fc.width = 64
      const fg = fc.getContext('2d')!
      fg.translate(32, 0)
      const fp = new Path2D()
      fp.moveTo(0, 8); fp.bezierCurveTo(26, 52, 25, 88, 0, 120); fp.bezierCurveTo(-25, 88, -26, 52, 0, 8)
      const fgr = fg.createLinearGradient(0, 120, 0, 6)
      fgr.addColorStop(0, 'rgba(255,246,196,0.95)'); fgr.addColorStop(0.4, 'rgba(255,176,58,0.9)')
      fgr.addColorStop(0.78, 'rgba(226,84,30,0.6)'); fgr.addColorStop(1, 'rgba(190,40,18,0)')
      fg.fillStyle = fgr; fg.fill(fp)
      const flameTex = stage.keep(new T.CanvasTexture(fc))
      flameTex.colorSpace = T.SRGBColorSpace
      const fire = new T.Group()
      fire.position.set(-0.3, 0.02, VZ - VL / 2 + 0.2)
      const flames: State['flames'] = []
      for (let i = 0; i < 6; i++) {
        const sp = new T.Sprite(new T.SpriteMaterial({ map: flameTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }))
        const base = 0.13 + Math.random() * 0.1
        sp.position.set(-0.22 + i * 0.09, base, (Math.random() - 0.5) * 0.05)
        fire.add(sp)
        flames.push({ sp, base, phase: Math.random() * 9, speed: 80 + Math.random() * 40 })
      }
      const logMat = new T.MeshStandardMaterial({ color: 0x4A2E1B, roughness: 1 })
      for (let i = 0; i < 3; i++) {
        const log = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.34, 8), logMat)
        log.rotation.set(0, (i - 1) * 0.3, Math.PI / 2)
        log.position.set(-0.3 + (i - 1) * 0.05, 0.04 + i * 0.04, VZ - VL / 2 + 0.22)
        oven.add(log)
      }
      oven.add(fire)
      scene.add(oven)
      const fireLight = new T.PointLight(0xFF7A22, 6, 3.4, 2)
      fireLight.position.set(-0.3, 0.3, VZ - VL / 2 + 0.25)
      scene.add(fireLight)

      /* --- La pelle en bois, et la pizza dessus --- */
      const peel = new T.Group()
      const peelMat = new T.MeshStandardMaterial({ map: stage.keep(woodTex(T, '#B98552', 2)), roughness: 0.62 })
      const board = new T.Mesh(new T.CylinderGeometry(PR + 0.06, PR + 0.06, 0.018, 40), peelMat)
      board.position.y = 0.009
      board.receiveShadow = true; board.castShadow = true
      const handle = new T.Mesh(new T.BoxGeometry(0.1, 0.018, 0.62), peelMat)
      handle.position.set(0, 0.009, PR + 0.36)
      handle.castShadow = true
      peel.add(board, handle)
      scene.add(peel)

      const pizzaG = new T.Group()
      pizzaG.position.y = 0.018
      peel.add(pizzaG)
      const outC = canvas2d()
      const tex = new T.CanvasTexture(outC)
      tex.colorSpace = T.SRGBColorSpace
      tex.anisotropy = 4
      stage.keep(tex)
      const topMat = new T.MeshStandardMaterial({ map: tex, roughness: 0.72 })
      const sideMat = new T.MeshStandardMaterial({ color: 0xE9CE98, roughness: 0.85, side: T.DoubleSide })
      const crustMat = new T.MeshStandardMaterial({
        color: 0xE7C487, roughness: 0.75, normalMap: stage.keep(bumpyNormal(T, 14, 3)), normalScale: new T.Vector2(0.5, 0.5)
      })
      const step = (Math.PI * 2) / SLICES
      const wedges: Wedge[] = []
      /** Le toucher ne vise que le dessus des parts (pas 240 ingrédients) */
      const tops: import('three').Mesh[] = []
      const crusts: import('three').Mesh[] = []
      for (let i = 0; i < SLICES; i++) {
        const a0 = i * step
        const g = new T.Group()
        // Le dessus : un secteur de disque, UV planaires partagées par les six parts
        const top = new T.Mesh(new T.CircleGeometry(PR_IN, 24, a0, step), topMat)
        top.rotation.x = -Math.PI / 2
        top.position.y = PH
        top.receiveShadow = true
        // Le dessous, retourné : son secteur est pris en angles négatifs, sinon
        // le retournement le met en miroir… sous la part voisine
        const bottom = new T.Mesh(new T.CircleGeometry(PR_IN + 0.04, 24, -a0 - step, step), sideMat)
        bottom.rotation.x = Math.PI / 2
        bottom.position.y = 0.001
        // Les faces de coupe (on les voit quand les parts s'écartent)
        for (const a of [a0, a0 + step]) {
          // Un peu sous la surface : sinon on voit les coupes avant de couper
          const face = new T.Mesh(new T.PlaneGeometry(PR_IN, PH * 0.9), sideMat)
          face.position.set(Math.cos(a) * PR_IN / 2, PH * 0.44, -Math.sin(a) * PR_IN / 2)
          face.rotation.y = a
          g.add(face)
        }
        // La croûte : un boudin sur l'arc de la part
        const pts: import('three').Vector3[] = []
        for (let k = 0; k <= 10; k++) {
          const a = a0 + (k / 10) * step
          pts.push(new T.Vector3(Math.cos(a) * (PR - 0.05), PH * 0.8, -Math.sin(a) * (PR - 0.05)))
        }
        const crust = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 14, 0.052, 10, false), crustMat)
        crust.castShadow = true; crust.receiveShadow = true
        crusts.push(crust)
        g.add(top, bottom, crust)
        tops.push(top)
        pizzaG.add(g)
        wedges.push({ group: g, a0, items: [], cheese: 0, eaten: false, lift: 0, strands: [] })
      }

      const sauceC = canvas2d(), cheeseC = canvas2d(), gratinC = canvas2d()
      const strandMat = new T.MeshStandardMaterial({ color: 0xDDBB62, roughness: 0.4 })
      const kit = buildKit(T)
      const me: State = {
        stage, phase: 'garnir', tool: 'tomato', peel, pizza: pizzaG, wedges,
        layers: {
          out: outC.getContext('2d')!, tex, dough: doughBase(),
          sauce: sauceC.getContext('2d')!, cheese: cheeseC.getContext('2d')!, gratin: gratinC.getContext('2d')!,
          dirty: true, t: 0
        },
        crustMat, sideMat, crusts, kit,
        baseCols: new Map(), falling: [], cheeseBits: [], stack: new Map(), pieces: 0,
        bake: 0,
        // La jauge doit rester JOUABLE : ~11 s de bout en bout en douce, 5 s en expert
        bakeRate: 1 / ctx.byTier(11, 7, 5),
        perfect: false, tickT: 0, smokeT: 0, steamT: 0, lastDrop: 0, lastSquish: 0, cut: 0, eaten: 0, ended: false,
        fx: particles(stage, 300), flames, fireLight,
        cam: { pos: new T.Vector3(0, 1.42, 0.88), look: new T.Vector3(0, 0, 0.04), lookNow: new T.Vector3(0, 0, 0.04) },
        strandGeo: new T.CylinderGeometry(0.009, 0.009, 1, 8), strandMat
      }
      me.strandGeo.translate(0, 0.5, 0) // le fil part de son ancre
      for (const k of Object.values(kit)) for (const m of k.mats) me.baseCols.set(m, m.color.clone())
      S = me
      setPhase(me, 'garnir')
      composite(me)
      hideLoader()

      /* --- Toucher --- */
      const pick = picker(stage)
      let down = false
      const local = (e: PointerEvent) => {
        // Seules les parts encore posées : une part en l'air ne cache pas sa voisine
        const hits = pick(e, tops.filter((_, i) => !wedges[i].eaten && wedges[i].lift === 0), false)
        return hits.length ? pizzaG.worldToLocal(hits[0].point.clone()) : null
      }
      const act = (e: PointerEvent, first: boolean) => {
        if (S !== me || me.ended) return
        if (me.phase === 'servi') {
          if (!first) return
          const p = local(e)
          if (p) takeWedge(me, wedgeAt(p.x, p.z))
          return
        }
        if (me.phase !== 'garnir') return
        const p = local(e)
        if (!p) return
        const now = performance.now()
        if (me.tool === 'tomato' || me.tool === 'cream') {
          paintSauce(me, p.x, p.z, me.tool)
          if (now - me.lastSquish > 180) { me.lastSquish = now; sfx('cloth', { vol: 0.16, rate: 1.4 + Math.random() * 0.3 }) }
          return
        }
        // Saupoudrer : un tap = une pincée, un glissé = une pluie sous le doigt
        if (!first && now - me.lastDrop < (me.tool === 'cheese' || me.tool === 'corn' ? 45 : 85)) return
        me.lastDrop = now
        const n = me.tool === 'cheese' ? 2 : 1
        for (let i = 0; i < n; i++) drop(me, me.tool, p.x + (Math.random() - 0.5) * 0.06, p.z + (Math.random() - 0.5) * 0.06)
      }
      const onDown = (e: PointerEvent) => { down = true; act(e, true) }
      const onMove = (e: PointerEvent) => { if (down) act(e, false) }
      const onUp = () => { down = false }
      stage.renderer.domElement.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)

      arena.querySelectorAll<HTMLElement>('.pz-bowl').forEach(b => {
        b.onclick = () => {
          if (S !== me || me.phase !== 'garnir') return
          me.tool = b.dataset.t as ToolId
          arena.querySelectorAll('.pz-bowl').forEach(x => x.classList.toggle('sel', x === b))
          sPop()
        }
      })
      $('pzOven').onclick = () => toOven(me)
      $('pzOut').onclick = () => pullOut(me)
      $('pzDone').onclick = () => finish(me)

      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __pz: unknown }).__pz = {
          get phase() { return me.phase }, get bake() { return me.bake }, get cut() { return me.cut },
          get pieces() { return me.pieces }, get eaten() { return me.eaten },
          from: PERFECT_FROM, to: PERFECT_TO,
          /** Les parts encore là, en coordonnées écran. */
          slices: () => me.wedges.filter(w => !w.eaten && w.lift === 0).map(w => {
            const a = w.a0 + Math.PI / SLICES
            const v = new T.Vector3(Math.cos(a) * 0.3, PH, -Math.sin(a) * 0.3)
            pizzaG.localToWorld(v)
            v.project(stage.camera)
            const r = stage.renderer.domElement.getBoundingClientRect()
            return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }
          })
        }
      }

      /* --- Boucle --- */
      const tmpA = new T.Vector3(), tmpB = new T.Vector3(), up = new T.Vector3(0, 1, 0)
      stage.start((dt, now) => {
        if (S !== me) return
        // La pelle va au four et en revient ; la caméra glisse vers sa cible
        const pz = me.phase === 'cuisson' ? OVEN_Z + 0.02 : 0
        peel.position.z += (pz - peel.position.z) * Math.min(1, dt * 2.4)
        const k = Math.min(1, dt * 2.6)
        stage.camera.position.lerp(me.cam.pos, k)
        me.cam.lookNow.lerp(me.cam.look, k)
        stage.camera.lookAt(me.cam.lookNow)

        // Les ingrédients qui tombent : gravité douce, un petit rebond, à plat
        for (let i = me.falling.length - 1; i >= 0; i--) {
          const f = me.falling[i]
          f.vy -= 5.5 * dt
          f.y += f.vy * dt
          f.obj.rotation.y += f.spin * dt
          if (f.y <= f.ty) {
            if (!f.bounced && f.vy < -0.5) { f.bounced = true; f.y = f.ty; f.vy = -f.vy * 0.22; f.spin *= 0.3; sfx('tick', { vol: 0.18, rate: 1.4 + Math.random() * 0.4 }) }
            else { f.obj.position.y = f.ty; me.falling.splice(i, 1); land(me, f); continue }
          }
          f.obj.position.y = f.y
        }

        // La cuisson SE VOIT
        if (me.phase === 'cuisson' && peel.position.z < OVEN_Z * 0.6) {
          me.bake = Math.min(1, me.bake + dt * me.bakeRate)
          paintGauge(me, dt)
          if (me.bake >= 1 && !me.ended) {
            // Oubliée jusqu'au bout : elle sort toute seule, fumante
            me.smokeT += dt
            if (me.smokeT > 2.5) pullOut(me)
          }
        }
        if (me.phase === 'cuisson') {
          const b = me.bake
          const gold = Math.min(1, b / PERFECT_FROM)
          const burn = Math.max(0, (b - PERFECT_TO) / (1 - PERFECT_TO))
          const col = (c0: number, c1: number) => new T.Color(c0).lerp(new T.Color(c1), gold).lerp(new T.Color(0x24170F), burn * 0.9)
          me.crustMat.color.copy(col(0xE7C487, 0xB9742F))
          me.sideMat.color.copy(col(0xE9CE98, 0xC98E4E))
          // Le bord gonfle
          for (const cr of me.crusts) cr.scale.set(1, 1 + gold * 0.45, 1)
          // La mozzarella râpée fond dans sa nappe
          const melt = Math.max(0, Math.min(1, (b - 0.08) / 0.34))
          for (const m of me.cheeseBits) m.scale.set(1 + melt * 0.4, Math.max(0.05, 1 - melt), 1 + melt * 0.4)
          if (melt >= 1) for (const m of me.cheeseBits) m.visible = false
          // Les garnitures cuisent un peu, et noircissent si on oublie
          for (const [mat, base] of me.baseCols) mat.color.copy(base).multiplyScalar(1 - gold * 0.12).lerp(new T.Color(0x1A120C), burn * 0.8)
          me.layers.t += dt
          if (me.layers.t > 0.12) { me.layers.t = 0; me.layers.dirty = true }
          if (burn > 0.1) {
            me.smokeT += dt
            if (me.smokeT > 0.2) {
              me.smokeT = 0
              const p = peel.position
              me.fx.burst({ x: (Math.random() - 0.5) * 0.5, y: 0.12, z: p.z + (Math.random() - 0.5) * 0.4 },
                { count: 2, color: [0x4A4A4A, 0x7A7A7A], speed: 0.25, spread: 0.3, life: 1.6, size: 0.14 + burn * 0.1, gravity: -0.35 })
            }
          }
        }
        // Recomposer la surface coûte un envoi de texture : au plus toutes les 50 ms
        me.layers.t += me.phase === 'cuisson' ? 0 : dt
        if (me.layers.dirty && (me.phase !== 'garnir' || me.layers.t > 0.05)) { me.layers.t = 0; composite(me) }

        // Sortie du four : la vapeur monte
        if (me.steamT > 0) {
          me.steamT -= dt
          if (Math.random() < dt * 14) {
            me.fx.burst({ x: (Math.random() - 0.5) * 0.7, y: 0.08, z: peel.position.z + (Math.random() - 0.5) * 0.6 },
              { count: 1, color: [0xFFFFFF, 0xF2EEE8], speed: 0.18, spread: 0.2, life: 1.4, size: 0.1, gravity: -0.25 })
          }
        }

        // La coupe : les parts s'écartent un peu, une entaille après l'autre
        for (let i = 0; i < SLICES; i++) {
          const w = me.wedges[i]
          const mid = w.a0 + Math.PI / SLICES
          const gap = me.cut >= 3 ? 0.014 : me.cut * 0.004
          if (w.lift === 0) w.group.position.set(Math.cos(mid) * gap, 0, -Math.sin(mid) * gap)
        }

        // Une part qu'on tire : elle monte vers nous, le fromage file, puis croc !
        for (const w of me.wedges) {
          if (w.lift <= 0 || w.eaten) continue
          w.lift = Math.min(1.35, w.lift + dt * 0.8)
          const mid = w.a0 + Math.PI / SLICES
          const e = Math.min(1, w.lift)
          const ease = e * e * (3 - 2 * e)
          // Elle monte et s'écarte (sans pivoter : son centre de rotation est
          // celui de la pizza, elle montrerait son dessous), puis la bouchée
          const out = 0.02 + ease * 0.12
          w.group.position.set(Math.cos(mid) * out, ease * 0.24, -Math.sin(mid) * out)
          const bite = Math.max(0, (w.lift - 1) / 0.35)
          w.group.scale.setScalar(1 - bite * bite)
          for (let si = w.strands.length - 1; si >= 0; si--) {
            const s = w.strands[si]
            tmpA.copy(s.a)
            tmpB.copy(s.b); w.group.localToWorld(tmpB); me.pizza.worldToLocal(tmpB)
            const len = tmpA.distanceTo(tmpB)
            if (len > s.snap) {
              me.pizza.remove(s.mesh); w.strands.splice(si, 1)
              sfx('pluck', { vol: 0.35, rate: 1.2 + Math.random() * 0.5 })
              continue
            }
            s.mesh.position.copy(tmpA)
            s.mesh.quaternion.setFromUnitVectors(up, tmpB.clone().sub(tmpA).normalize())
            const thin = Math.max(0.25, 1 - len * 3.5)
            s.mesh.scale.set(thin, Math.max(0.001, len), thin)
          }
          if (w.lift >= 1.35) {
            // Croc ! La part disparaît dans un nuage de miettes
            w.eaten = true
            w.group.visible = false
            for (const s of w.strands) me.pizza.remove(s.mesh)
            w.strands = []
            const p = w.group.getWorldPosition(tmpA)
            me.fx.burst({ x: p.x, y: p.y + 0.05, z: p.z }, { count: 10, color: [0xE7C487, 0xC8321F, 0xFFF4D2], speed: 0.5, spread: 1, life: 0.6, size: 0.04, gravity: 1.2 })
            sCrunch()
            me.eaten++
            tone(300 + me.eaten * 40, 0.1, 'triangle', 0.1)
            if (me.eaten >= SLICES) ctx.after(700, () => { if (S === me) finish(me) })
          }
        }

        // Le feu danse
        for (const f of me.flames) {
          const kk = 0.78 + Math.sin(now / f.speed + f.phase) * 0.2 + Math.sin(now / 39 + f.phase * 2) * 0.09
          f.sp.scale.set(f.base * 0.95 * (1.15 - kk * 0.25), f.base * 2.1 * kk, 1)
          f.sp.position.y = f.base * 1.02 * kk
        }
        me.fireLight.intensity = 5.4 + Math.sin(now / 90) * 1.3 + Math.sin(now / 37) * 0.6
        me.fx.update(dt)
      })

      stage.keep({
        dispose() {
          stage.renderer.domElement.removeEventListener('pointerdown', onDown)
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          window.removeEventListener('pointercancel', onUp)
          me.fx.dispose()
          me.strandGeo.dispose()
          delete (window as { __pz?: unknown }).__pz
        }
      })
    })().catch(() => { hideLoader(); ctx.toast('La 3D n\'est pas disponible ici') })

    return () => {
      dead = true
      const me = S
      S = null
      if (me) { try { me.stage.dispose() } catch { /* déjà démonté */ } }
    }
  }
}
