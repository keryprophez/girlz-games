import type { GameContext, GameDef } from '../core/types'
import { $, shuffle } from '../core/utils'
import { sfx, preloadSfx, cry, preloadCries, CRY, type AnimalVoice } from '../core/sfx'
import { playMusic, setMusicIntensity } from '../core/music'
import { onPause } from '../core/session'
import { createStage, loader, dotTex, type Stage, type T3 } from '../core/three3d'
import { particles, camShake, type Particles, type CamShake } from '../core/scene3d'
import { critterKit, type Critter, type CritterKit, type CritterKind } from '../core/critters'
import { critterPortraits } from '../core/portraits'
import { buildFarm, bake, type Farm, type FarmSpot, type FarmSlot, type Matter, type Size } from '../core/farm3d'

/* 🙈 Cache-Cache à la ferme (1/10, proposition 13, validée par le père :
   « On fait tourner la ferme au doigt : la queue du chat dépasse d'une botte
   de foin, les oreilles du lapin sortent derrière le puits. On les touche,
   ils sortent en riant avec leur cri. La nuit, on les cherche à la lampe
   torche. Idéal pour Jade. »)

   - La ferme est un diorama rond (core/farm3d.ts) qu'on fait TOURNER : un
     doigt tourne (suivi par son `pointerId`, élan mesuré en vrai, borné,
     éteint en une demi-seconde), deux doigts zooment un peu, un toucher
     cherche.
   - Au début, les animaux sont dans l'enclos ; on se cache les yeux (deux
     mains, trois tics — à la fleur, on voit entre les doigts) et ils
     courent se cacher : DANS le foin, le puits, la boue, un tonneau, un
     terrier, derrière la porte d'écurie… avec un bout qui dépasse (oreilles,
     queue, museau, fesses) et qui bouge de temps en temps.
   - Le toucher est généreux (près du bout qui dépasse, pas besoin de viser
     pile) : l'animal sort d'un bond, rit avec sa VRAIE voix (`cry`), des
     étincelles, et file à l'enclos, où on voit ceux déjà trouvés ; en haut,
     leurs silhouettes se colorient. Une cachette vide : un petit bruit doux,
     rien d'autre. Tout près d'un animal caché : il glousse, la cachette
     tremble, il passe la tête (le « presque »).
   - Fleur : 5 animaux, ils dépassent franchement ; éclair : 8, on ne voit
     que leurs oreilles, certains ne se voient que d'un côté de la ferme ;
     flamme : LA NUIT, 10 animaux, une lampe torche suit le doigt et leurs
     yeux brillent dans le noir.
   - Depuis le 6/10 (Joyce : « trop facile », puis le père : « joue de la
     taille de la carte + la navigation »), l'éclair et la flamme se jouent
     sur la CARTE ×4 (`buildFarm({ huge: true })`, rayon 26 : trois bois, le
     grand maïs, le lac, un hameau, tournesols, blé, bosquets, haies), avec
     14 et 18 animaux. Vus de loin, ils ne font que quelques pixels : il
     faut s'approcher. La caméra se mène comme une carte : un doigt promène
     la vue (avec son élan), pincer zoome jusqu'au ras du sol, tourner deux
     doigts fait pivoter la ferme, les glisser ensemble vers le haut ou le
     bas l'incline ; « Toute la ferme » recentre. Le toucher est à la mesure
     de ce qu'on voit (de loin, il faut viser). Certains se cachent EN
     ENTIER dans ce qui se fouille (botte, puits, charrette, niche,
     poulailler, porte du moulin, trappe du silo, buisson, haie, souche,
     tronc creux) : on touche la cachette — dans un bois, là où il est —, il
     en sort. Et de temps en temps, l'un de ceux qu'on ne voit pas change de
     cachette en courant, pas loin.
   - Performances (« catastrophiques » le 6/10) : de loin, ni ombres ni
     petits détails ; de près, une ombre serrée autour de ce qu'on regarde.
   - La rampe suit la joueuse : trouvée vite, ceux qui restent bougent moins
     (et à l'éclair et à la flamme, l'un d'eux change de cachette en
     courant : on peut l'attraper en route) ; coincée, ils bougent plus, et
     l'un d'eux finit par passer la tête en appelant.
   - La fin : la fête dans l'enclos, tout le monde saute et chante, la ferme
     tourne. Les étoiles viennent du temps passé à chercher. */

type V3 = import('three').Vector3
type Mesh = import('three').Mesh
type Obj = import('three').Object3D
type Group = import('three').Group
/** Ce qui dépasse : franchement, les oreilles, les yeux (la nuit), ou rien du tout (`cache` : il faut fouiller). */
type Peek = 'franc' | 'oreilles' | 'yeux' | 'cache'
type Phase = 'intro' | 'hide' | 'seek' | 'outro'

const POOL: CritterKind[] = ['cat', 'rabbit', 'pig', 'cow', 'dog', 'hen', 'duck', 'sheep', 'goat', 'horse', 'rooster', 'chick']
const SIZE: Partial<Record<CritterKind, Size>> = { chick: 's', cat: 's', rabbit: 's', hen: 's', duck: 's', rooster: 's', dog: 'm', pig: 'm', sheep: 'm', goat: 'm', cow: 'l', horse: 'l' }
const BASE: Partial<Record<CritterKind, number>> = { chick: 0.55, cat: 0.62, rabbit: 0.6, hen: 0.62, duck: 0.66, rooster: 0.62, dog: 0.74, pig: 0.75, sheep: 0.8, goat: 0.72, cow: 0.9, horse: 0.78 }
/** Le nom d'une place sans le suffixe d'une construction posée deux fois (`#2`, la grange du hameau). */
const baseId = (slot: FarmSlot) => slot.id.split('#')[0]
/** Les places préférées (les mots du père d'abord : le chat dans le foin, le lapin au puits). */
const PREF: Partial<Record<CritterKind, [string[], number]>> = {
  cat: [['bottes', 'meule-haut', 'meule-cote', 'pommier'], 0.75], rabbit: [['puits', 'terrier-1', 'terrier-2'], 0.75],
  pig: [['boue'], 0.5], duck: [['mare'], 0.6], horse: [['grange-porte'], 0.5], dog: [['niche-tete', 'niche-fesses'], 0.5], hen: [['poulailler'], 0.45]
}
/** Les oreilles et les queues de chaque animal, reconnues à leur place (en unités de sa taille). */
const EARS: Partial<Record<CritterKind, (x: number, y: number, z: number) => boolean>> = {
  rabbit: (x, y) => y > 0.98 && Math.abs(x) > 0.05,
  cat: (x, y) => y > 0.95 && Math.abs(x) > 0.1,
  pig: (x, y) => y > 0.8 && Math.abs(x) > 0.2,
  cow: (x, y) => Math.abs(x) > 0.4 && y > 0.7 && y < 0.8,
  goat: (x, y) => Math.abs(x) > 0.18 && y > 0.9 && y < 1.0,
  horse: (_x, y) => y > 1.33,
  dog: (x, y) => Math.abs(x) > 0.27 && y > 0.6 && y < 0.72,
  sheep: (x, y, z) => Math.abs(x) > 0.18 && y > 0.6 && y < 0.72 && z > 0.2
}
const TAILS: Partial<Record<CritterKind, (x: number, y: number, z: number) => boolean>> = {
  dog: (_x, y, z) => z < -0.4 && y > 0.4,
  horse: (_x, _y, z) => z < -0.5,
  duck: (_x, y, z) => z < -0.4 && y > 0.55,
  hen: (_x, y, z) => z < -0.38 && y > 0.5,
  rooster: (_x, y, z) => z < -0.4 && y > 0.6,
  goat: (_x, y, z) => z < -0.45 && y > 0.6
}
/** Les brins qui volent d'une cachette qu'on bouscule. */
const BITS: Record<Matter, number[]> = {
  foin: [0xD9B25A, 0xC49A3C, 0xE8CC80], feuilles: [0x4E8A34, 0x7DB552, 0xE8E2D2], bois: [0x8A6A40, 0xC9A56E],
  pierre: [0x9A948A, 0xC8C0B2], eau: [0x8FD0E8, 0xFFFFFF], boue: [0x5A3A20, 0x3A2616], metal: [0xFFE08A, 0xC9C2B5], terre: [0x5A3E2A, 0x8A6A4A]
}
/** Une cachette vide qu'on touche : un petit bruit doux, rien d'autre. */
const SOFT: Record<Matter, () => void> = {
  foin: () => sfx('cloth', { vol: 0.3, rate: 1.25 }),
  feuilles: () => sfx('cloth', { vol: 0.26, rate: 0.85 }),
  bois: () => sfx('tick', { vol: 0.22, rate: 0.8 }),
  pierre: () => sfx('click', { vol: 0.2, rate: 0.7 }),
  eau: () => sfx('drop', { vol: 0.28, rate: 1.2 }),
  boue: () => sfx('drop', { vol: 0.24, rate: 0.6 }),
  metal: () => sfx('metal', { vol: 0.16, rate: 1.1 }),
  terre: () => sfx('cloth', { vol: 0.2, rate: 0.7 })
}
const PAW = `<svg class="ico" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><ellipse cx="12" cy="16" rx="5.4" ry="4.6" fill="currentColor"/><ellipse cx="5.6" cy="10.4" rx="2.3" ry="2.9" fill="currentColor"/><ellipse cx="9.4" cy="6.4" rx="2.3" ry="3" fill="currentColor"/><ellipse cx="14.6" cy="6.4" rx="2.3" ry="3" fill="currentColor"/><ellipse cx="18.4" cy="10.4" rx="2.3" ry="2.9" fill="currentColor"/></svg>`
/** Deux mains qui cachent les yeux (le compte du cache-cache). */
/** « Toute la ferme » : une mire (la vue revient au milieu). */
const CENTRE = `<svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true"><circle cx="24" cy="24" r="15" fill="none" stroke="#4FB8E7" stroke-width="4"/><circle cx="24" cy="24" r="5" fill="#4FB8E7"/><path d="M24 3v8M24 37v8M3 24h8M37 24h8" stroke="#4FB8E7" stroke-width="4" stroke-linecap="round"/></svg>`
const HAND = `<svg viewBox="0 0 100 150" aria-hidden="true"><path d="M24 150V86c-6-6-14-14-15-22-1-6 5-9 10-5l9 9V30c0-5 3-8 7-8s7 3 7 8v34-46c0-5 3-8 7-8s7 3 7 8v46-40c0-5 3-8 7-8s7 3 7 8v42-30c0-5 3-7 6-7s6 2 6 7v56c0 20-10 32-18 38v22z" fill="#FFDCC0" stroke="#B9785A" stroke-width="3.5" stroke-linejoin="round"/><path d="M42 64v14M56 62v16M70 64v14" stroke="#D9A486" stroke-width="3" stroke-linecap="round"/></svg>`

interface Tween {
  a: V3; b: V3; t: number; dur: number; hops: number; h: number
  ry0: number; ry1: number; k0: number; k1: number
  end: () => void
}

interface Hider {
  i: number
  kind: CritterKind
  voice: AnimalVoice | undefined
  c: Critter
  S: number
  /** Mesures à l'échelle 1 (repère de l'animal) */
  head: number; eyeY: number; eyeZ: number; eyeR: number
  minZ: number; maxZ: number; halfW: number
  ears: Mesh[]; tails: Obj[]
  raised: Group | null; hang: Group | null
  samples: { p: V3; tag: 'body' | 'raised' | 'hang' }[]
  spot: FarmSpot | null; slot: FarmSlot | null; peek: Peek
  base: V3; ry: number; k: number
  /** Les points qui dépassent (repère de l'animal) */
  pts: V3[]
  /** Quelques points de tout le corps, quand il court à découvert */
  body: V3[]
  state: 'pen' | 'run' | 'hidden' | 'jump'
  found: boolean
  wig: number; wigT: number; wigK: number; ph: number
  boost: number; giggle: number
  tw: Tween | null
  pen: number
  hop: number
  sang: boolean
  glow: import('three').Sprite[]
}

interface State {
  stage: Stage
  T: T3
  farm: Farm
  kit: CritterKit
  hiders: Hider[]
  night: boolean
  phase: Phase
  t: number
  phaseT: number
  seekT0: number
  rot: number; vRot: number; drag: boolean
  zoom: number; tgtZoom: number; elev: number; tgtElev: number; introK: number
  /** L'inclinaison vraie de la caméra (de près, la vue se couche). */
  el: number
  /** La carte ×4 : caméra libre, cachettes à fouiller. */
  big: boolean
  maxZoom: number
  /** Le point de la ferme qu'on regarde (repère du plateau) : la ferme tourne autour ; son élan. */
  pan: V3; tgtPan: V3; vPan: V3
  /** Vue de près : les petits détails et l'ombre du soleil sont allumés. */
  close: boolean
  /** La prochaine ombre de la lampe, vue de loin ; son point sur l'écran (la carte ×4 : il le garde quand la vue bouge). */
  torchT: number; torchAt: { x: number; y: number } | null
  /** Combien peuvent encore se cacher en entier ; quand le prochain change de place. */
  cacheLeft: number; nextMove: number
  fit: { key: string; d: number; ty: number }
  hint: number; stuck: number; lastFind: number; streak: number; nextCall: number
  relocs: number; maxRelocs: number; relocP: number
  penNext: number
  outroBurst: number
  fx: Particles
  shake: CamShake
  ray: import('three').Raycaster
  glowMat: import('three').SpriteMaterial | null
  torch: { spot: import('three').SpotLight; beam: Mesh; beamMat: import('three').ShaderMaterial; aim: V3; want: V3 } | null
  tray: HTMLElement
  veil: HTMLElement
}

/** L'angle de la caméra au-dessus du plateau (≈ 42°) : assez haut pour voir
    par-dessus la grange, assez bas pour que la ferme ait du volume. */
const BASE_EL = 0.73

let cc: State | null = null
let ctx: GameContext
let handTurn = 0

/* ---------- Les animaux : mesures, oreilles, queues ---------- */
type Kit = CritterKit & { sphereGeo: import('three').BufferGeometry }
type BGU = typeof import('three/examples/jsm/utils/BufferGeometryUtils.js')

function makeHider(me: { T: T3; U: BGU; kit: Kit; mats: Record<string, import('three').MeshStandardMaterial> }, kind: CritterKind, i: number, night: boolean, glowMat: import('three').SpriteMaterial | null): Hider {
  const { T, U, kit, mats } = me
  const S = BASE[kind] ?? 0.7
  const c = kit.make(kind, S)
  const o = c.obj
  o.updateMatrixWorld(true)
  const box = new T.Box3().setFromObject(o)
  const e = new T.Vector3()
  c.eyes[0].getWorldPosition(e)
  const eyeR = (c.eyes[0].children[0] as Mesh).scale.x
  const ears: Mesh[] = [], tails: Obj[] = []
  for (const ch of o.children) {
    const m = ch as Mesh
    if (!m.isMesh) continue
    const x = m.position.x / S, y = m.position.y / S, z = m.position.z / S
    if (EARS[kind]?.(x, y, z)) { m.userData.r0 = m.rotation.z; ears.push(m) }
    if (TAILS[kind]?.(x, y, z)) { m.userData.r0 = m.rotation.y; tails.push(m) }
    // La queue du chat, enroulée autour des pattes : remplacée par une queue dressée
    if (kind === 'cat' && m.geometry.type === 'SphereGeometry' && Math.abs(m.scale.x - 0.062 * S) < 0.003 && y < 0.2) m.visible = false
  }
  let raised: Group | null = null, hang: Group | null = null
  const chain = (pts: number[][], r0: number, r1: number, stripes: boolean) => {
    const g = new T.Group()
    const base = new T.Vector3(pts[0][0] * S, pts[0][1] * S, pts[0][2] * S)
    g.position.copy(base)
    const curve = new T.CatmullRomCurve3(pts.map(p => new T.Vector3(p[0] * S, p[1] * S, p[2] * S).sub(base)))
    const n = 18
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1)
      const p = curve.getPoint(u)
      const r = (r0 + (r1 - r0) * u) * S
      const mat = stripes && u > 0.62 && k % 2 ? mats.catStripe : mats.catOrange
      const s = new T.Mesh(kit.sphereGeo, mat)
      s.position.copy(p); s.scale.setScalar(r)
      s.castShadow = true
      g.add(s)
    }
    o.add(g)
    return g
  }
  if (kind === 'cat') {
    raised = chain([[0, 0.16, -0.3], [0, 0.42, -0.5], [0, 0.82, -0.54], [0.02, 1.14, -0.42], [0.04, 1.3, -0.25], [0.03, 1.34, -0.12]], 0.06, 0.048, true)
    hang = chain([[0, 0.2, -0.3], [0, -0.2, -0.42], [0.03, -0.7, -0.42], [0.08, -1.15, -0.34], [0.12, -1.45, -0.2], [0.08, -1.55, -0.06]], 0.058, 0.05, true)
    hang.visible = false
  } else if (kind === 'cow') {
    const curve = new T.CatmullRomCurve3([[0, 0.66, -0.38], [0, 0.6, -0.47], [0.02, 0.4, -0.5], [0.03, 0.2, -0.48]].map(p => new T.Vector3(p[0] * S, p[1] * S, p[2] * S)))
    const g = new T.Group()
    const tube = new T.Mesh(new T.TubeGeometry(curve, 16, 0.022 * S, 6), mats.cream)
    const tuft = new T.Mesh(kit.sphereGeo, mats.black)
    tuft.position.copy(curve.getPoint(1)); tuft.scale.set(0.05 * S, 0.08 * S, 0.05 * S)
    g.add(tube, tuft)
    o.add(g); tails.push(g); g.userData.r0 = 0
  } else if (kind === 'pig') {
    const pts: V3[] = []
    for (let k = 0; k <= 14; k++) { const a = k / 14 * Math.PI * 3; pts.push(new T.Vector3(Math.cos(a) * 0.04 * S, (0.56 + Math.sin(a) * 0.04 + k * 0.003) * S, (-0.42 - k * 0.007) * S)) }
    const tube = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 30, 0.016 * S, 6), mats.pink)
    o.add(tube); tails.push(tube); tube.userData.r0 = 0
  } else if (kind === 'rabbit') {
    const pom = new T.Mesh(kit.sphereGeo, mats.white)
    pom.position.set(0, 0.3 * S, -0.37 * S); pom.scale.setScalar(0.1 * S)
    o.add(pom); tails.push(pom); pom.userData.r0 = 0
  }
  // Les yeux qui brillent dans le noir
  const glow: import('three').Sprite[] = []
  if (night && glowMat) {
    for (const ey of c.eyes) {
      const sp = new T.Sprite(glowMat)
      sp.position.set(0, 0, eyeR * 0.9)
      sp.scale.setScalar(eyeR * 4.6)
      sp.userData.glow = true
      sp.renderOrder = 2
      sp.visible = false
      ey.add(sp)
      glow.push(sp)
    }
  }
  o.traverse(x => { x.castShadow = true })
  // Le haut de la tête : sans la queue dressée du chat
  let head = box.max.y
  if (kind === 'cat') head = 1.08 * S
  /* Les points d'où l'on voit l'animal : le centre et les bords de chacun de
     ses morceaux, pris AVANT la fusion (une boîte englobant tout le corps
     donnerait des coins dans le vide). Puis le corps immobile est fondu en un
     mesh par matériau : oreilles, queues et yeux restent à part (ils bougent). */
  o.updateMatrixWorld(true)
  const samples: { p: V3; tag: 'body' | 'raised' | 'hang' }[] = []
  const live = new Set<Obj>([...ears, ...tails, ...c.eyes])
  if (raised) live.add(raised)
  if (hang) live.add(hang)
  const under = (x: Obj, g: Obj | null) => { for (let p: Obj | null = x; p && p !== o; p = p.parent) if (p === g) return true; return false }
  const shown = (x: Obj) => { for (let p: Obj | null = x; p && p !== o; p = p.parent) if (!p.visible && p !== hang) return false; return true }
  o.traverse(x => {
    const m = x as Mesh
    if (!m.isMesh || !shown(m)) return
    const g = m.geometry
    if (!g.boundingBox) g.computeBoundingBox()
    const bb = g.boundingBox!
    const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2, cz = (bb.min.z + bb.max.z) / 2
    const ex = (bb.max.x - bb.min.x) * 0.42, ey = (bb.max.y - bb.min.y) * 0.42, ez = (bb.max.z - bb.min.z) * 0.42
    const tag = under(m, raised) ? 'raised' : under(m, hang) ? 'hang' : 'body'
    for (const [dx, dy, dz] of [[0, 0, 0], [ex, 0, 0], [-ex, 0, 0], [0, ey, 0], [0, -ey, 0], [0, 0, ez], [0, 0, -ez]]) {
      samples.push({ p: m.localToWorld(new T.Vector3(cx + dx, cy + dy, cz + dz)), tag })
    }
  })
  bake(T, U, o, m => { for (let p: Obj | null = m; p && p !== o; p = p.parent) if (live.has(p)) return true; return false })
  // Quelques points de tout le corps (quand il court à découvert)
  const body = samples.filter((sm, k) => sm.tag === 'body' && k % 5 === 0).map(sm => sm.p)
  return {
    i, kind, voice: CRY[kind], c, S,
    head, eyeY: e.y, eyeZ: e.z, eyeR,
    minZ: box.min.z, maxZ: box.max.z, halfW: Math.max(-box.min.x, box.max.x),
    ears, tails, raised, hang, samples,
    spot: null, slot: null, peek: 'franc',
    base: new T.Vector3(), ry: 0, k: 1, pts: [], body,
    state: 'pen', found: false,
    wig: 2 + Math.random() * 3, wigT: -1, wigK: 0, ph: Math.random() * 10,
    boost: 0, giggle: -9, tw: null, pen: i, hop: 1 + Math.random() * 3, sang: false, glow
  }
}

/** L'animal tient-il dans cette place ? (taille, espèce, largeur). */
function fitK(h: Hider, slot: FarmSlot): number {
  const size = SIZE[h.kind] ?? 'm'
  if (!slot.sizes.includes(size)) return 0
  if (slot.only && !slot.only.includes(h.kind)) return 0
  const k = Math.min(1, slot.w / (h.halfW * 2))
  return k >= 0.74 ? k : 0
}

/** La pose d'un animal dans sa place (repère de la cachette). */
function pose(h: Hider, slot: FarmSlot, peek: Peek, k: number) {
  const H = h.head * k, eyeY = h.eyeY * k, eyeZ = h.eyeZ * k, eyeR = h.eyeR * k
  const maxZ = h.maxZ * k, minZ = h.minZ * k
  const [ax, ay, az] = slot.at
  if (slot.type === 'top') {
    // Caché en entier : tout le corps sous le bord
    if (peek === 'cache') return { x: ax, y: (slot.rim ?? 0) - H - 0.05, z: az, ry: slot.rot ?? 0 }
    const p = peek === 'franc' ? Math.min(H * 0.7, H - eyeY + 0.2)
      : peek === 'oreilles' ? Math.max(0.06, H - eyeY - eyeR - 0.02)
      : H - eyeY + 0.03
    let y = (slot.rim ?? 0) - H + p
    if (slot.floor !== undefined) y = Math.max(y, slot.floor)
    return { x: ax, y, z: az, ry: slot.rot ?? 0 }
  }
  if (slot.type === 'tree') return { x: ax, y: ay, z: az, ry: Math.random() * Math.PI * 2 }
  const [ox, oz] = slot.out ?? [0, 1]
  const plane = slot.plane ?? 0
  if (slot.type === 'face') {
    const q = peek === 'cache' ? -0.08 : peek === 'franc' ? (maxZ - eyeZ) + 0.18 : peek === 'oreilles' ? Math.max(0.05, maxZ - eyeZ - 0.05) : (maxZ - eyeZ) + 0.035
    const along = plane + q - maxZ
    const y = slot.open !== undefined ? Math.min(ay, slot.open - H - 0.03) : ay
    return { x: ax + ox * along, y, z: az + oz * along, ry: Math.atan2(ox, oz) }
  }
  // rear : les fesses dehors
  const L = maxZ - minZ
  const q = peek === 'franc' ? L * 0.48 : L * 0.24
  const along = plane + q + minZ
  const y = slot.open !== undefined ? Math.min(ay, slot.open - H * 0.85) : ay
  return { x: ax + ox * along, y, z: az + oz * along, ry: Math.atan2(-ox, -oz) }
}

/** Ce point de la cachette dépasse-t-il de ce qui cache ? */
function outside(slot: FarmSlot, q: V3): boolean {
  if (slot.type === 'top') return q.y > (slot.rim ?? 0) + 0.015
  if (slot.type === 'tree') return q.y < (slot.rim ?? 0) - 0.02
  const [ox, oz] = slot.out ?? [0, 1]
  return (q.x - slot.at[0]) * ox + (q.z - slot.at[2]) * oz > (slot.plane ?? 0) + 0.015
}

/** Range l'animal dans sa cachette ; faux si rien ne dépasserait. */
function hideIn(me: State, h: Hider, spot: FarmSpot, slot: FarmSlot, peek: Peek): boolean {
  const { T } = me
  const k = fitK(h, slot)
  if (!k) return false
  const ps = pose(h, slot, peek, k)
  const o = h.c.obj
  spot.g.add(o)
  o.position.set(ps.x, ps.y, ps.z)
  o.rotation.set(0, ps.ry, 0)
  o.scale.setScalar(k)
  if (h.raised && h.hang) { h.raised.visible = slot.type !== 'tree' && peek !== 'cache'; h.hang.visible = slot.type === 'tree' }
  spot.g.updateWorldMatrix(true, true)
  // Les points qui dépassent de la cachette
  const pts: V3[] = []
  const q = new T.Vector3()
  for (const sm of h.samples) {
    if (sm.tag === 'raised' && !h.raised?.visible) continue
    if (sm.tag === 'hang' && !h.hang?.visible) continue
    q.copy(sm.p); o.localToWorld(q); spot.g.worldToLocal(q)
    if (outside(slot, q)) pts.push(sm.p)
  }
  // Caché en entier : rien ne dépasse, il faudra fouiller la cachette
  if (peek !== 'cache' && pts.length < 2) { me.farm.root.attach(o); return false }
  // Au plus 16 points, bien répartis
  const keep = peek === 'cache' ? [] : pts.length > 16 ? shuffle(pts).slice(0, 16) : pts
  h.pts = keep
  h.spot = spot; h.slot = slot; h.peek = peek
  h.base.set(ps.x, ps.y, ps.z); h.ry = ps.ry; h.k = k
  h.state = 'hidden'
  // Caché, il ne trahit pas sa cachette par son ombre
  o.traverse(x => { x.castShadow = false })
  for (const g of h.glow) g.visible = peek !== 'cache'
  return true
}

/** Le cas qui ne devrait pas arriver : rien ne dépasserait de sa place. Il reste
    où il est arrivé, à découvert — jamais un animal introuvable. */
function strand(me: State, h: Hider, spot: FarmSpot, slot: FarmSlot) {
  if (import.meta.env.DEV) console.warn('cache-cache : rien ne dépasse', h.kind, slot.id)
  me.farm.root.attach(h.c.obj)
  // Arrivé DANS un buisson ou une botte : il monte dessus (sinon on ne le verrait de nulle part)
  if (slot.type === 'top') h.c.obj.position.y = Math.max(h.c.obj.position.y, slot.rim ?? 0)
  h.state = 'hidden'; h.pts = h.body; h.spot = spot; h.slot = slot
  h.base.copy(h.c.obj.position); h.ry = h.c.obj.rotation.y; h.k = h.c.obj.scale.x
}

/** La pose d'arrivée, en coordonnées du plateau (pour courir jusque-là). */
function targetOf(me: State, h: Hider, spot: FarmSpot, slot: FarmSlot, peek: Peek): V3 {
  const k = fitK(h, slot) || 1
  const ps = pose(h, slot, peek, k)
  const v = new me.T.Vector3(ps.x, Math.max(0, ps.y), ps.z)
  spot.g.updateWorldMatrix(true, false)
  spot.g.localToWorld(v)
  return me.farm.root.worldToLocal(v)
}

/** Qui va où : chaque animal une place qui lui va, jamais deux du même groupe. */
function plan(me: State): { h: Hider; spot: FarmSpot; slot: FarmSlot }[] | null {
  const all: { spot: FarmSpot; slot: FarmSlot }[] = []
  for (const spot of me.farm.spots) for (const slot of spot.slots) {
    if (me.night && (slot.type === 'rear' || slot.type === 'tree')) continue
    all.push({ spot, slot })
  }
  const tier = ctx.tier
  for (let attempt = 0; attempt < 80; attempt++) {
    const used = new Set<string>()
    const out: { h: Hider; spot: FarmSpot; slot: FarmSlot }[] = []
    const fits = (h: Hider) => all.filter(c => fitK(h, c.slot) > 0 && !used.has(c.slot.id) && !(c.slot.group && used.has(c.slot.group)))
    const order = shuffle(me.hiders.slice()).sort((a, b) => fits(a).length - fits(b).length)
    let side = 0, ok = true
    for (const h of order) {
      let cands = fits(h)
      const pref = PREF[h.kind]
      if (pref && attempt < 40 && Math.random() < pref[1]) { const p = cands.filter(c => pref[0].includes(baseId(c.slot))); if (p.length) cands = p }
      // La fleur se voit presque de partout ; l'éclair cache plusieurs animaux d'un seul côté
      if (tier === 'easy' && side >= 1) { const p = cands.filter(c => !c.slot.side); if (p.length) cands = p }
      if (tier === 'med' && side < 3 && Math.random() < 0.6) { const p = cands.filter(c => c.slot.side); if (p.length) cands = p }
      if (!cands.length) { ok = false; break }
      const pick = cands[Math.floor(Math.random() * cands.length)]
      out.push({ h, ...pick })
      used.add(pick.slot.id)
      if (pick.slot.group) used.add(pick.slot.group)
      if (pick.slot.side) side++
    }
    if (ok && (tier !== 'med' || side >= 3 || attempt > 60)) return out
  }
  return null
}

/** Ce qui se fouille : on y entre en entier (pas un plancher qu'on verrait, pas l'eau ni le maïs). */
const FOUILLE = new Set(['bottes', 'puits', 'charrette', 'godet', 'meule-haut', 'grange-porte', 'niche-tete', 'poulailler', 'moulin-porte', 'silo-trappe'])
/** Les buissons, et sur la carte ×4 : la souche, le tronc creux et les buissons des bois, des bosquets, les haies. */
const FOUILLE_RE = /^(buisson-\d+-haut|bois\d+-(souche|tronc|buisson-\d+)|bosquet\d+-buisson|haie\d+-\d+)$/
const fouille = (slot: FarmSlot) => FOUILLE.has(baseId(slot)) || FOUILLE_RE.test(baseId(slot))
/** Un grand coin (un bois, un champ, le lac) : on y fouille LÀ où l'on touche, pas tout le bois d'un coup. */
const wide = (spot: FarmSpot) => spot.foot > 3
function nearSlot(me: State, h: Hider, p: V3, r: number): boolean {
  if (!h.spot || !h.slot) return false
  const v = h.spot.g.localToWorld(new me.T.Vector3(...h.slot.at))
  return Math.hypot(v.x - p.x, v.z - p.z) < r
}

function peekFor(me: State, slot: FarmSlot): Peek {
  if (me.cacheLeft > 0 && fouille(slot) && Math.random() < 0.5) { me.cacheLeft--; return 'cache' }
  if (me.night) return 'yeux'
  if (ctx.tier === 'easy') return 'franc'
  // L'éclair : on ne voit que des oreilles… sauf d'un seul côté, où ça dépasse un peu plus
  return slot.side ? 'franc' : 'oreilles'
}

/* ---------- Voir et toucher ---------- */
const tmpV = (me: State) => new me.T.Vector3()

/** Les points de l'animal qu'on voit VRAIMENT d'ici (rien devant), en pixels d'écran. */
function seen(me: State, h: Hider): { x: number; y: number; w: V3 }[] {
  const cam = me.stage.camera
  const r = me.stage.renderer.domElement.getBoundingClientRect()
  const out: { x: number; y: number; w: V3 }[] = []
  const list = h.state === 'run' ? h.body : h.pts
  const dir = tmpV(me)
  for (const p of list) {
    const w = h.c.obj.localToWorld(p.clone())
    dir.copy(w).sub(cam.position)
    const d = dir.length()
    me.ray.set(cam.position, dir.normalize())
    me.ray.near = 0; me.ray.far = d - 0.03
    const hit = me.ray.intersectObjects(me.farm.occ, false)
    me.ray.far = Infinity
    if (hit.length) continue
    const s = w.clone().project(cam)
    if (s.z > 1 || Math.abs(s.x) > 1.02 || Math.abs(s.y) > 1.02) continue
    out.push({ x: r.left + (s.x + 1) / 2 * r.width, y: r.top + (1 - s.y) / 2 * r.height, w })
  }
  return out
}

/** Le meilleur point à toucher parmi ceux qu'on voit : le plus central. */
function central(v: { x: number; y: number }[]) {
  if (!v.length) return null
  const mx = v.reduce((a, p) => a + p.x, 0) / v.length, my = v.reduce((a, p) => a + p.y, 0) / v.length
  return v.reduce((b, p) => Math.hypot(p.x - mx, p.y - my) < Math.hypot(b.x - mx, b.y - my) ? p : b)
}

function onTap(me: State, x: number, y: number) {
  if (me.phase !== 'seek') return
  const el = me.stage.renderer.domElement
  const r = el.getBoundingClientRect()
  const ndc = new me.T.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
  let tol = Math.max(40, Math.min(r.width, r.height) * 0.065)
  if (me.big) {
    // La carte ×4 : généreux de près, mais de loin il faut viser (un animal n'y fait que quelques pixels)
    const cam = me.stage.camera
    const px = r.height / (2 * Math.tan(cam.fov * Math.PI / 360) * cam.position.length())
    tol = Math.max(18, Math.min(tol, px * 1.1))
  }
  let best: { h: Hider; d: number; w: V3 } | null = null
  for (const h of me.hiders) {
    if (h.found || (h.state !== 'hidden' && h.state !== 'run')) continue
    for (const p of seen(me, h)) {
      const d = Math.hypot(p.x - x, p.y - y)
      if (d < (h.state === 'run' ? tol * 1.4 : tol) && (!best || d < best.d)) best = { h, d, w: p.w }
    }
  }
  me.ray.setFromCamera(ndc, me.stage.camera)
  const wall = me.ray.intersectObjects(me.farm.occ, false)[0]
  if (!best) {
    // Pile sur l'animal, devant tout le reste
    const objs = me.hiders.filter(h => !h.found && (h.state === 'hidden' || h.state === 'run')).map(h => h.c.obj)
    const hit = me.ray.intersectObjects(objs, true).find(i => !i.object.userData.glow)
    if (hit && (!wall || hit.distance < wall.distance)) {
      let o: Obj | null = hit.object
      while (o && o.userData.hider === undefined) o = o.parent
      if (o) best = { h: me.hiders[o.userData.hider as number], d: 0, w: hit.point.clone() }
    }
  }
  if (best) { find(me, best.h, best.w); return }
  const si = wall?.object.userData.spot as number | undefined
  const spot = si !== undefined ? me.farm.spots[si] : null
  // On fouille : celui qui s'y cache en entier en sort
  const inside = spot && wall ? me.hiders.find(h => !h.found && h.state === 'hidden' && h.spot === spot && h.peek === 'cache' && (!wide(spot) || nearSlot(me, h, wall.point, 1.3))) : null
  if (inside && wall) { find(me, inside, wall.point.clone()); return }
  // Le « presque » : dans la cachette touchée (pas loin, dans un bois), ou tout près d'un animal caché
  let near: Hider | null = spot && wall ? me.hiders.find(h => !h.found && h.state === 'hidden' && h.spot === spot && (!wide(spot) || nearSlot(me, h, wall.point, 2.6))) ?? null : null
  if (!near) {
    const cam = me.stage.camera
    let bd = tol * 2.2
    for (const h of me.hiders) {
      if (h.found || h.state !== 'hidden') continue
      for (const p of h.pts) {
        const s = h.c.obj.localToWorld(p.clone()).project(cam)
        const d = Math.hypot(r.left + (s.x + 1) / 2 * r.width - x, r.top + (1 - s.y) / 2 * r.height - y)
        if (d < bd) { bd = d; near = h }
      }
    }
  }
  if (near) nearMiss(me, near, wall?.point ?? null)
  else if (spot) {
    SOFT[spot.matter]()
    // Sur la grande ferme, on la fouille pour rien : elle remue un peu
    if (me.big) spot.shake = Math.max(spot.shake, 0.3)
  }
}

/** Tout près : il glousse, sa cachette tremble, il passe la tête. */
function nearMiss(me: State, h: Hider, at: V3 | null) {
  const spot = h.spot
  if (!spot) return
  spot.shake = Math.max(spot.shake, 0.6)
  if (me.t - h.giggle < 1.3) return
  h.giggle = me.t
  h.boost = 1.1
  if (!h.voice || !cry(h.voice, { vol: 0.42, max: 0.42, rate: 1.12 })) sfx('pluck', { vol: 0.4, rate: 1.6 })
  SOFT[spot.matter]()
  const p = at ?? spot.g.getWorldPosition(tmpV(me)).setY(0.8)
  me.fx.burst(p, { count: 10, color: BITS[spot.matter], speed: 1.4, spread: 0.9, life: 0.6, size: 0.07, gravity: 4 })
  me.hint = Math.min(1, me.hint + 0.04)
}

/** Trouvé ! Il sort d'un bond, rit avec sa voix, file à l'enclos. */
function find(me: State, h: Hider, at: V3) {
  const { T } = me
  h.found = true
  h.tw = null
  const spot = h.spot
  me.farm.root.attach(h.c.obj)
  h.state = 'jump'
  h.spot = null; h.slot = null
  for (const g of h.glow) g.visible = false
  h.c.obj.traverse(x => { x.castShadow = true })
  if (h.raised && h.hang) { h.raised.visible = true; h.hang.visible = false }
  // Sa vraie voix ; le lapin, qui n'en a pas, fait boing
  if (!h.voice || !cry(h.voice, { vol: 0.95, max: 1.7 })) sfx('pluck', { vol: 0.7, rate: 1.35 })
  sfx('whoosh', { vol: 0.35, rate: 1.3 })
  sfx('confirm', { vol: 0.45, rate: 1 + me.penNext * 0.05, delay: 0.25 })
  me.fx.burst(at, { count: 28, color: [0xFFD34D, 0xFFFFFF, 0xFF8FB8, 0x8FD8FF], speed: 2.6, spread: 0.9, life: 1.0, size: 0.11, gravity: 3 })
  me.fx.burst(at, { count: 10, color: [0xFFF3B0], speed: 1.2, spread: 1.2, life: 1.3, size: 0.16, gravity: 0.6 })
  me.shake.hit(0.12)
  if (spot) {
    spot.shake = 0.5
    me.fx.burst(at, { count: 12, color: BITS[spot.matter], speed: 1.8, spread: 1, life: 0.7, size: 0.07, gravity: 5 })
  }
  // Au tableau : sa silhouette se colorie
  const pip = me.tray.querySelector<HTMLElement>(`.cc-pip[data-i="${h.i}"]`)
  pip?.classList.add('got')
  // À l'enclos, en trois bonds (le premier haut, pour sortir de sa cachette)
  const slot = me.farm.pen[me.penNext % me.farm.pen.length]
  h.pen = me.penNext++
  const from = h.c.obj.position.clone()
  const to = new T.Vector3(slot[0], 0, slot[1])
  h.tw = {
    a: from, b: to, t: 0, dur: 1.35, hops: 3, h: 1.5,
    ry0: h.c.obj.rotation.y, ry1: h.c.obj.rotation.y + Math.PI * 2, k0: h.k, k1: 1,
    end: () => { h.state = 'pen'; h.k = 1; h.hop = 1 + Math.random() * 3; sfx('pluck', { vol: 0.3, rate: 1.1 }) }
  }
  // La rampe : trouvée vite, ceux qui restent bougent moins ; lentement, plus
  const since = me.t - me.lastFind
  me.lastFind = me.t
  me.stuck = 0
  if (since < 8) { me.hint = Math.max(0.06, me.hint - 0.1); me.streak++ } else {
    if (since > 22) me.hint = Math.min(1, me.hint + 0.12)
    me.streak = 0
  }
  setMusicIntensity(Math.min(3, me.streak))
  const left = me.hiders.filter(x => !x.found).length
  if (!left) { me.phase = 'outro'; me.phaseT = me.t + 1.2; outro(me); return }
  if (since < 9 && me.relocs < me.maxRelocs && Math.random() < me.relocP) relocate(me)
}

/** L'un de ceux qui restent change de cachette, en courant : on peut l'attraper en route. */
function relocate(me: State, who?: Hider) {
  const free = me.hiders.filter(h => !h.found && h.state === 'hidden')
  if (!free.length) return
  const h = who ?? free[Math.floor(Math.random() * free.length)]
  const used = new Set<string>()
  for (const o of me.hiders) if (o !== h && o.slot && !o.found) { used.add(o.slot.id); if (o.slot.group) used.add(o.slot.group) }
  const cands: { spot: FarmSpot; slot: FarmSlot }[] = []
  for (const spot of me.farm.spots) {
    if (spot === h.spot) continue
    for (const slot of spot.slots) {
      if (me.night && (slot.type === 'rear' || slot.type === 'tree')) continue
      if (used.has(slot.id) || (slot.group && used.has(slot.group)) || !fitK(h, slot)) continue
      cands.push({ spot, slot })
    }
  }
  if (!cands.length) return
  // Sur la carte ×4, il ne traverse pas toute la ferme : une cachette pas loin
  const here = h.c.obj.getWorldPosition(tmpV(me))
  me.farm.root.worldToLocal(here)
  const close = me.big ? cands.filter(c => c.spot.g.position.distanceTo(here) < 10) : []
  const pool = close.length ? close : cands
  const pick = pool[Math.floor(Math.random() * pool.length)]
  const old = h.spot
  me.relocs++
  if (old) old.shake = 0.5
  me.farm.root.attach(h.c.obj)
  h.state = 'run'
  h.spot = null; h.slot = null
  for (const g of h.glow) g.visible = false
  if (h.raised && h.hang) { h.raised.visible = true; h.hang.visible = false }
  if (h.voice) cry(h.voice, { vol: 0.32, max: 0.35, rate: 1.15 })
  sfx('cloth', { vol: 0.35, rate: 1.1 })
  const peek = peekFor(me, pick.slot)
  const to = targetOf(me, h, pick.spot, pick.slot, peek)
  const from = h.c.obj.position.clone()
  const ry1 = Math.atan2(to.x - from.x, to.z - from.z)
  const dist = from.distanceTo(to)
  h.tw = {
    a: from, b: to, t: 0, dur: me.big ? 1.1 + dist * 0.12 : 2.3, hops: me.big ? Math.max(4, Math.round(dist / 1.5)) : 5, h: 0.75,
    ry0: ry1, ry1, k0: h.c.obj.scale.x, k1: fitK(h, pick.slot) || 1,
    end: () => {
      if (h.found) return
      // Comme au départ : un peu moins bien caché plutôt qu'introuvable (un canard n'a pas d'oreilles qui dépassent)
      if (!hideIn(me, h, pick.spot, pick.slot, peek) && !hideIn(me, h, pick.spot, pick.slot, 'franc')) strand(me, h, pick.spot, pick.slot)
      pick.spot.shake = 0.4
      SOFT[pick.spot.matter]()
    }
  }
}

function stepTween(h: Hider, dt: number) {
  const tw = h.tw!
  tw.t += dt
  const u = Math.min(1, tw.t / tw.dur)
  const o = h.c.obj
  o.position.lerpVectors(tw.a, tw.b, u)
  const seg = u * tw.hops, i = Math.min(tw.hops - 1, Math.floor(seg)), f = seg - i
  const amp = i === 0 ? tw.h : tw.h * 0.45
  o.position.y += Math.sin(f * Math.PI) * amp * (u < 1 ? 1 : 0)
  o.rotation.set(0, tw.ry0 + (tw.ry1 - tw.ry0) * Math.min(1, u * 1.6), 0)
  const k = tw.k0 + (tw.k1 - tw.k0) * u
  // L'écrasement à chaque réception
  const squash = f < 0.12 && i > 0 ? (1 - f / 0.12) * 0.16 : 0
  o.scale.set(k * (1 + squash * 0.6), k * (1 - squash), k * (1 + squash * 0.6))
  if (u >= 1) { o.scale.setScalar(tw.k1); h.tw = null; tw.end() }
}

/** Caché : de temps en temps, le bout qui dépasse bouge (l'indice). */
function animHidden(me: State, h: Hider, dt: number) {
  const o = h.c.obj
  const slot = h.slot
  let dy = 0, rz = 0, ry = 0, fw = 0, ear = 0
  let wag = Math.sin(me.t * 2.1 + h.ph) * 0.1
  const amp = 0.7 + 0.6 * me.hint
  if (h.wigT < 0) {
    h.wig -= dt
    if (h.wig <= 0) { h.wigT = 0; h.wigK = Math.random() < 0.5 ? 0 : 1 }
  }
  if (h.wigT >= 0) {
    h.wigT += dt
    const u = h.wigT / 0.95
    if (u >= 1) { h.wigT = -1; h.wig = (6.5 - 4.9 * me.hint) * (0.7 + Math.random() * 0.6) }
    else {
      const env = Math.sin(u * Math.PI)
      if (slot?.type === 'top') {
        if (h.wigK === 0) dy = env * 0.06 * amp
        else rz = Math.sin(u * Math.PI * 4) * 0.12 * amp * env
      } else if (slot?.type === 'face') ry = Math.sin(u * Math.PI * 2) * 0.3 * amp
      else if (slot?.type === 'rear') ry = Math.sin(u * Math.PI * 6) * 0.13 * amp * env
      ear = Math.sin(u * Math.PI * 3) * 0.5 * env
      wag = Math.sin(u * Math.PI * 8) * 0.55 * env * amp
    }
  }
  // Il passe la tête un instant (un « presque », ou il en a assez d'attendre)
  if (h.boost > 0) {
    h.boost = Math.max(0, h.boost - dt)
    const b = Math.sin((1 - h.boost / 1.1) * Math.PI)
    if (slot?.type === 'face') fw = b * 0.1
    else if (slot?.type === 'rear') fw = -b * 0.1
    else dy += b * 0.11
  }
  o.position.set(h.base.x + Math.sin(h.ry) * fw, h.base.y + dy, h.base.z + Math.cos(h.ry) * fw)
  o.rotation.set(0, h.ry + ry, rz)
  h.ears.forEach((e, k) => { e.rotation.z = (e.userData.r0 as number) + (k % 2 ? ear : -ear) })
  for (const t of h.tails) t.rotation.y = (t.userData.r0 as number) + wag
  if (h.raised?.visible) h.raised.rotation.z = wag * 0.8
  if (h.hang?.visible) { h.hang.rotation.x = Math.sin(me.t * 1.5 + h.ph) * 0.08; h.hang.rotation.z = Math.sin(me.t * 1.1) * 0.1 + wag * 0.4 }
}

/** À l'enclos : il nous regarde, sautille de temps en temps ; à la fin, la fête. */
function animPen(me: State, h: Hider, dt: number) {
  const o = h.c.obj
  const cam = me.stage.camera.position
  const wp = o.getWorldPosition(tmpV(me))
  let want = Math.atan2(cam.x - wp.x, cam.z - wp.z) - me.farm.root.rotation.y
  let cur = o.rotation.y
  while (want - cur > Math.PI) want -= Math.PI * 2
  while (want - cur < -Math.PI) want += Math.PI * 2
  let y = 0
  if (me.phase === 'outro') {
    // La fête : une vague de sauts, et chacun fait un tour sur lui-même
    const t = me.t - me.phaseT
    y = Math.max(0, Math.sin(me.t * 5.2 + h.pen * 0.8)) * 0.34
    const spin = ((t + h.pen * 0.4) % 2.4) / 0.6
    if (t > 0 && spin < 1) cur = want + spin * Math.PI * 2
    else cur += (want - cur) * Math.min(1, dt * 6)
    if (!h.sang && t > 0.3 + h.pen * 0.32) {
      h.sang = true
      if (!h.voice || !cry(h.voice, { vol: 0.62, max: 1.0 })) sfx('pluck', { vol: 0.4, rate: 1.4 })
    }
  } else {
    cur += (want - cur) * Math.min(1, dt * 5)
    h.hop -= dt
    if (h.hop < 0) { if (h.hop < -0.36) h.hop = 2 + Math.random() * 4; else y = Math.sin(-h.hop / 0.36 * Math.PI) * 0.14 }
  }
  o.rotation.set(0, cur, 0)
  const slot = me.farm.pen[h.pen % me.farm.pen.length]
  o.position.set(slot[0], y, slot[1])
  const wag = Math.sin(me.t * 4 + h.ph) * 0.25
  for (const t of h.tails) t.rotation.y = (t.userData.r0 as number) + wag
  if (h.raised) h.raised.rotation.z = Math.sin(me.t * 2 + h.ph) * 0.2
}

/* ---------- Le cache-cache : l'enclos, les yeux cachés, la course ---------- */
function startHide(me: State, assign: { h: Hider; spot: FarmSpot; slot: FarmSlot }[]) {
  assign.forEach(({ h, spot, slot }, n) => {
    const peek = peekFor(me, slot)
    const to = targetOf(me, h, spot, slot, peek)
    const from = h.c.obj.position.clone()
    const ry = Math.atan2(to.x - from.x, to.z - from.z)
    h.state = 'run'
    h.tw = {
      a: from, b: to, t: -n * 0.09, dur: 1.5 + Math.min(1.2, from.distanceTo(to) * 0.08), hops: 3, h: 0.9,
      ry0: ry, ry1: ry, k0: 1, k1: fitK(h, slot) || 1,
      end: () => {
        if (!hideIn(me, h, spot, slot, peek)) {
          // Rien ne dépasserait : il se cache un peu moins bien (jamais introuvable)
          if (!hideIn(me, h, spot, slot, 'franc')) strand(me, h, spot, slot)
        }
        SOFT[spot.matter]()
      }
    }
  })
}

function outro(me: State) {
  const n = me.hiders.length
  const secs = me.t - me.seekT0
  const par = ctx.byTier(9, 18, 20) * n
  const stars: 1 | 2 | 3 = secs <= par ? 3 : secs <= par * 2 ? 2 : 1
  setMusicIntensity(3)
  ctx.finish({
    title: me.night ? 'Trouvés dans le noir !' : 'Tout le monde est trouvé !',
    msg: `Tu as retrouvé les ${n} animaux de la ferme`,
    stars, score: n, scoreIcon: PAW, outroMs: 5600
  })
}

/** Le cadrage : la distance la plus courte (et la visée) où le plateau tient
    en largeur, le haut de la grange du fond sous la rangée des animaux, et le
    bord de devant à peine rogné (la ferme tourne : ce qui est devant passera
    derrière). Recalculé quand l'écran change de forme. */
function fitCam(me: State) {
  const cam = me.stage.camera
  const key = cam.aspect.toFixed(3)
  if (me.fit.key === key) return
  const { T } = me
  const c = new T.PerspectiveCamera(cam.fov, cam.aspect, 0.1, 400)
  const R = me.farm.r
  const rim: V3[] = []
  for (let k = 0; k <= 8; k++) { const a = Math.PI / 2 + k / 8 * Math.PI; rim.push(new T.Vector3(Math.sin(a) * R, 0, Math.cos(a) * R)) }
  // Le plus haut au fond : la grange, ou le moulin et le silo de la grande ferme
  // La carte ×4 se voit en entier (on s'y promène ensuite) ; la petite ferme, le bord de devant à peine rogné
  const low = new T.Vector3(0, 0, R * (me.big ? 0.97 : 0.8)), high = me.big ? new T.Vector3(0, 4.6, -R + 2.3) : new T.Vector3(0, 3.3, -R + 1.9)
  const v = new T.Vector3()
  const ok = (d: number, ty: number) => {
    c.position.set(0, Math.sin(BASE_EL) * d, Math.cos(BASE_EL) * d)
    c.lookAt(0, ty, 0)
    c.updateMatrixWorld(true)
    if (v.copy(low).project(c).y < -0.97) return false
    if (v.copy(high).project(c).y > 0.74) return false
    return rim.every(p => Math.abs(v.copy(p).project(c).x) <= 0.985)
  }
  let best = { d: R * 4, ty: 1 }
  for (let ty = -1.5; ty <= 2.5; ty += 0.1) {
    let lo = R * 0.6, hi = R * 6
    for (let it = 0; it < 20; it++) { const d = (lo + hi) / 2; if (ok(d, ty)) hi = d; else lo = d }
    if (hi < best.d) best = { d: hi, ty }
  }
  me.fit = { key, d: best.d, ty: best.ty }
}

function frame(me: State, dt: number) {
  const cam = me.stage.camera
  fitCam(me)
  // La carte ×4 se zoome jusqu'à 4 m du point regardé, au ras des cachettes
  if (me.big) me.maxZoom = me.fit.d / 4.2
  me.elev += (me.tgtElev - me.elev) * Math.min(1, dt * 6)
  const d = me.fit.d / me.zoom * (1 + me.introK * 0.35)
  // Plus on s'approche de la carte, plus la vue se couche : on finit au ras du sol
  const f = me.big ? Math.max(0, Math.min(1, Math.log(me.zoom) / Math.log(me.maxZoom))) : 0
  me.el = Math.max(0.2, me.elev - f * 0.3) + me.introK * 0.18
  cam.position.set(0, Math.sin(me.el) * d, Math.cos(me.el) * d)
  // De près (la carte ×4), on regarde plus bas : là où se cachent les animaux
  cam.lookAt(0, me.big ? me.fit.ty / me.zoom + 0.5 * (1 - 1 / me.zoom) : me.fit.ty + (me.zoom - 1) * 0.6, 0)
  if (me.big) closeUp(me, d)
  me.shake.apply(dt)
}

/** Le soleil, vu de la ferme (son ombre suit ce qu'on regarde). */
const SUN: [number, number, number] = [6.5, 14, 7]

/** La carte ×4 coûte cher : de loin, ni ombre du soleil (une passe de rendu
    en moins) ni petits détails ; de près, les détails, et une ombre serrée
    autour du point regardé (l'origine du monde : la ferme glisse dessous),
    qui ne dessine que ce qui est dans sa boîte. */
function closeUp(me: State, d: number) {
  const on = me.close ? d < me.fit.d * 0.5 : d < me.fit.d * 0.4
  if (on !== me.close) { me.close = on; me.farm.detail(on) }
  const sun = me.stage.sun
  if (!sun || me.night) return
  if (!on) {
    // L'ombre part sous la ferme (même direction de soleil) et n'est plus redessinée : tout est éclairé
    if (sun.shadow.autoUpdate) {
      sun.shadow.autoUpdate = false
      sun.target.position.set(0, -600, 0); sun.position.set(SUN[0] * 1.6, SUN[1] * 1.6 - 600, SUN[2] * 1.6)
      sun.shadow.needsUpdate = true
    }
    return
  }
  sun.shadow.autoUpdate = true
  const a = Math.max(5, Math.min(14, Math.round(d * 0.5)))
  const sc = sun.shadow.camera
  if (sc.right !== a) { sc.left = -a; sc.right = a; sc.top = a; sc.bottom = -a; sc.updateProjectionMatrix() }
  // La boîte un peu en avant : la vue porte plus loin derrière le point regardé que devant
  sun.target.position.set(0, 0, -a * 0.4)
  sun.position.set(SUN[0] * 1.6, SUN[1] * 1.6, SUN[2] * 1.6 - a * 0.4)
}

/** Deux doigts qui glissent : la ferme suit les doigts ; le point regardé
    (repère du plateau, autour duquel elle tourne) recule d'autant. */
function panBy(me: State, mdx: number, mdy: number) {
  const cam = me.stage.camera, el = me.stage.renderer.domElement
  const k = cam.position.length() * 2 * Math.tan(cam.fov * Math.PI / 360) / Math.max(1, el.clientHeight)
  const dx = mdx * k, dz = mdy * k / Math.max(0.35, Math.sin(me.el))
  const c = Math.cos(me.rot), s = Math.sin(me.rot)
  me.tgtPan.x -= dx * c - dz * s
  me.tgtPan.z -= dx * s + dz * c
  keepIn(me)
  me.pan.copy(me.tgtPan)
}

/** La ferme tourne autour du point regardé : il reste sous la caméra. */
function place(me: State) {
  const cr = Math.cos(me.rot), sr = Math.sin(me.rot)
  me.farm.root.rotation.y = me.rot
  me.farm.root.position.set(-(me.pan.x * cr + me.pan.z * sr), 0, -(-me.pan.x * sr + me.pan.z * cr))
}

/** Le point regardé reste sur la ferme. */
function keepIn(me: State) {
  const L = Math.hypot(me.tgtPan.x, me.tgtPan.z), max = me.farm.r - 2
  if (L > max) me.tgtPan.multiplyScalar(max / L)
}

/** « Toute la ferme » : la vue de départ. */
function recenter(me: State) {
  me.tgtPan.set(0, 0, 0); me.vPan.set(0, 0, 0); me.tgtZoom = 1; me.tgtElev = BASE_EL
}

function aimTorch(me: State, x: number, y: number) {
  if (!me.torch) return
  const r = me.stage.renderer.domElement.getBoundingClientRect()
  const ndc = new me.T.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
  if (me.big) { me.torchAt = { x: ndc.x, y: ndc.y }; return }
  me.ray.setFromCamera(ndc, me.stage.camera)
  const hit = me.ray.intersectObjects(me.farm.occ, false)[0]
  if (hit) { me.torch.want.copy(hit.point); return }
  const p = new me.T.Vector3()
  if (me.ray.ray.intersectPlane(new me.T.Plane(new me.T.Vector3(0, 1, 0), -0.3), p)) me.torch.want.copy(p)
}

function step(me: State, dt: number) {
  me.t += dt
  const t = me.t
  // Les étapes : l'enclos, les yeux cachés (trois tics), la course, puis on cherche
  if (me.phase === 'intro') {
    me.introK = Math.max(0, 1 - t / 1.1)
    if (t > 1.0) {
      me.phase = 'hide'; me.phaseT = t
      me.veil.classList.add('on')
      const a = plan(me)
      if (a) startHide(me, a)
    }
  } else if (me.phase === 'hide') {
    const u = t - me.phaseT
    const dots = me.veil.querySelectorAll('.cc-count b')
    dots.forEach((d, k) => {
      const on = u > 0.45 + k * 0.62
      if (on && !d.classList.contains('on')) { d.classList.add('on'); sfx('tick', { vol: 0.5, rate: 0.9 + k * 0.08 }) }
    })
    const ready = me.hiders.every(h => !h.tw)
    if (u > 2.5 && ready) {
      me.veil.classList.remove('on')
      me.phase = 'seek'; me.phaseT = t; me.seekT0 = t; me.lastFind = t; me.nextCall = t + 26; me.nextMove = t + 25
      // La carte ×4 : on partait de l'enclos, on recule sur toute la ferme (ils sont quelque part là-dedans)
      if (me.big) me.tgtZoom = 1
      sfx('bong', { vol: 0.35, rate: 1.2 })
    }
  } else if (me.phase === 'seek') {
    // Sur la grande ferme, de temps en temps, l'un de ceux qu'on ne voit pas change de cachette
    if (me.big && t > me.nextMove) {
      me.nextMove = t + 20 + Math.random() * 14
      const unseen = me.hiders.filter(h => !h.found && h.state === 'hidden' && !seen(me, h).length)
      if (unseen.length && me.relocs < me.maxRelocs) relocate(me, unseen[Math.floor(Math.random() * unseen.length)])
    }
    me.stuck += dt
    if (me.stuck > 14) me.hint = Math.min(1, me.hint + 0.025 * dt)
    // Coincée depuis longtemps : l'un d'eux passe la tête et appelle
    if (me.stuck > 24 && t > me.nextCall) {
      me.nextCall = t + 9
      const hs = me.hiders.filter(h => !h.found && h.state === 'hidden')
      const h = hs[Math.floor(Math.random() * hs.length)]
      if (h) {
        h.boost = 1.1
        if (h.spot) h.spot.shake = 0.4
        if (h.voice) cry(h.voice, { vol: 0.3, max: 0.5 })
      }
    }
  } else if (me.phase === 'outro') {
    const u = t - me.phaseT
    // La fête : on revient au milieu, à l'enclos
    me.tgtZoom = me.big ? 4.5 : 1.6
    me.tgtElev = 0.5
    me.tgtPan.set(0, 0, 0)
    if (u > 0 && t > me.outroBurst) {
      me.outroBurst = t + 0.45
      const a = Math.random() * Math.PI * 2
      const p = new me.T.Vector3(Math.sin(a) * 0.8, 1.6, Math.cos(a) * 0.8)
      me.farm.root.localToWorld(p)
      me.fx.burst(p, { count: 22, color: [0xFFD34D, 0xFF6B81, 0x4FB8E7, 0x5EC97B, 0xB197FC, 0xFFFFFF], speed: 3, spread: 1, life: 1.2, size: 0.1, gravity: 3 })
    }
    if (me.night) {
      const k = Math.max(0, Math.min(1, u / 1.5))
      me.farm.party(k)
      if (me.torch) { me.torch.spot.intensity = 90 * (1 - k); me.torch.beamMat.uniforms.opacity.value = 0.2 * (1 - k) }
    }
  }
  // La ferme tourne : au doigt, avec son élan ; pendant la fête, toute seule
  if (!me.drag) {
    me.rot += me.vRot * dt
    me.vRot *= Math.pow(0.004, dt)
    if (Math.abs(me.vRot) < 0.01) me.vRot = 0
  }
  if (me.phase === 'outro') me.rot += 0.55 * dt
  // Le doigt levé, la vue glisse encore un peu (l'élan de la carte)
  if (!me.drag && (me.vPan.x || me.vPan.z)) {
    me.tgtPan.addScaledVector(me.vPan, dt)
    keepIn(me)
    me.vPan.multiplyScalar(Math.pow(0.03, dt))
    if (me.vPan.length() < 0.05) me.vPan.set(0, 0, 0)
  }
  me.pan.lerp(me.tgtPan, Math.min(1, dt * 6))
  place(me)
  me.zoom += (me.tgtZoom - me.zoom) * Math.min(1, dt * 8)
  frame(me, dt)
  for (const h of me.hiders) {
    me.kit.blink(h.c, dt)
    if (h.tw) { if (h.tw.t < 0) h.tw.t += dt; else stepTween(h, dt) } else if (h.state === 'hidden') animHidden(me, h, dt)
    else if (h.state === 'pen') animPen(me, h, dt)
  }
  if (me.glowMat) me.glowMat.opacity = 0.7 + Math.sin(t * 2.6) * 0.25
  const tc = me.torch
  if (tc) {
    const cam = me.stage.camera.position
    if (me.big) {
      // Sur la carte ×4, la vue bouge sans le doigt : la lampe garde son point
      // de l'écran (au départ, un peu sous le milieu), posé sur le sol
      me.ray.setFromCamera(new me.T.Vector2(me.torchAt?.x ?? 0, me.torchAt?.y ?? -0.15), me.stage.camera)
      me.ray.ray.intersectPlane(new me.T.Plane(new me.T.Vector3(0, 1, 0), 0), tc.want)
    }
    tc.spot.position.set(cam.x + 0.8, cam.y - 3.4, cam.z - 2.2)
    tc.aim.lerp(tc.want, Math.min(1, dt * 10))
    tc.spot.target.position.copy(tc.aim)
    tc.beam.position.copy(tc.spot.position)
    tc.beam.lookAt(tc.aim)
    const L = tc.aim.distanceTo(tc.spot.position)
    if (me.big && me.phase !== 'outro') {
      // Sur la carte ×4, la lampe porte aussi loin que la vue ; de loin, son
      // ombre n'est redessinée que trois fois par seconde (elle ne s'y voit pas)
      tc.spot.intensity = 90 * Math.max(1, L / 13)
      tc.spot.shadow.autoUpdate = me.close
      if (!me.close && t > me.torchT) { me.torchT = t + 0.33; tc.spot.shadow.needsUpdate = true }
    }
    const rr = L * Math.tan(tc.spot.angle) * 0.62
    tc.beam.scale.set(rr, rr, L)
  }
  me.farm.step(dt, t)
  me.fx.update(dt)
}

export const hideseek: GameDef = {
  id: 'hideseek', name: 'Cache-Cache', icon: '🙈', sq: 'sq-mint', cat: 'reflexion', music: 'meadow',
  subtitle: 'Fais tourner la ferme et trouve les animaux cachés',
  // La main : faire tourner la ferme d'un glissé, puis toucher une cachette
  // (n'importe laquelle : jamais forcément la bonne)
  hand: () => {
    const me = cc
    if (!me || me.phase !== 'seek') return null
    if (handTurn++ % 2 === 0) return { drag: [{ fx: 0.3, fy: 0.78 }, { fx: 0.7, fy: 0.78 }] }
    const r = me.stage.renderer.domElement.getBoundingClientRect()
    for (const s of shuffle(me.farm.spots.slice())) {
      const v = new me.T.Vector3(...s.aim)
      s.g.localToWorld(v)
      const p = v.project(me.stage.camera)
      if (Math.abs(p.x) < 0.8 && p.y > -0.75 && p.y < 0.6) return { tap: { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height } }
    }
    return null
  },
  mount(c) {
    ctx = c
    let dead = false
    const night = c.tier === 'exp'
    // La fleur reste la petite ferme de Jade ; l'éclair et la flamme, la carte ×4
    const big = c.tier !== 'easy'
    const n = c.byTier(5, 14, 18)
    // Le chat et le lapin (les mots du père) sont toujours de la partie à la fleur ;
    // au-delà des douze espèces, des jumeaux (petits et moyens : les grandes places sont rares)
    const kinds: CritterKind[] = n <= 5
      ? shuffle(['cat', 'rabbit', ...shuffle(POOL.filter(k => k !== 'cat' && k !== 'rabbit')).slice(0, n - 2)] as CritterKind[])
      : n <= POOL.length ? shuffle(POOL.slice()).slice(0, n)
      : shuffle([...POOL, ...shuffle(POOL.filter(k => SIZE[k] !== 'l')).slice(0, n - POOL.length)])
    c.root.innerHTML = `
      <div class="arena g3-arena cc-wrap${night ? ' cc-night' : ''}" id="ccWrap">
        <div class="cc-tray${n > 12 ? ' many' : ''}" id="ccTray">${kinds.map((k, i) => `<span class="cc-pip" data-i="${i}" data-k="${k}"></span>`).join('')}</div>
        <div class="cc-veil${c.tier === 'easy' ? ' peek' : ''}" id="ccVeil">
          <div class="cc-hands"><i class="cc-hand cc-l">${HAND}</i><i class="cc-hand cc-r">${HAND}</i></div>
          <div class="cc-count"><b></b><b></b><b></b></div>
        </div>${big ? `
        <span class="tool-item cc-centre"><button class="sn-tool" id="ccCentre" aria-label="Toute la ferme">${CENTRE}</button><i class="tool-cap">Toute la ferme</i></span>` : ''}
      </div>`
    preloadSfx(['cloth', 'tick', 'click', 'drop', 'metal', 'pluck', 'confirm', 'whoosh', 'bong'])
    preloadCries(kinds.map(k => CRY[k]).filter((v): v is AnimalVoice => !!v))
    if (night) playMusic('night')
    const offPause = onPause(p => { if (!p && night && !dead) playMusic('night') })
    const arena = $('ccWrap')
    const tray = $('ccTray')
    const veil = $('ccVeil')
    const hideLoader = loader(arena, 'hideseek')
    critterPortraits(kinds, 104).then(urls => {
      if (dead) return
      tray.querySelectorAll<HTMLElement>('.cc-pip').forEach(p => {
        const u = urls[p.dataset.k as string]
        if (u) p.innerHTML = `<img src="${u}" alt="" draggable="false">`
      })
    }).catch(() => { /* sans portraits, les pastilles restent rondes */ })

    ;(async () => {
      const stage = await createStage(arena, night ? {
        sky: '#0A1230', fov: 40, cam: [0, 12, 15], target: [0, 1, 0],
        hemi: ['#4A5A9A', '#1A1E2A', 0.9],
        sun: { pos: [-6, 14, -4], color: '#8EA6FF', intensity: 0.4, area: 10, far: 45 },
        fill: 0.3, exposure: 1.05
      } : {
        sky: '#9ED4F2', fov: 40, cam: [0, 12, 15], target: [0, 1, 0],
        hemi: ['#DCEFFF', '#5E8A44', 1.0],
        sun: { pos: SUN, color: '#FFF0D2', intensity: 2.3, area: 10, far: big ? 60 : 45 },
        fill: 0.45, exposure: 1.0
      })
      if (dead) { stage.dispose(); return }
      const T = stage.T
      const farm = await buildFarm(stage, { night, huge: big })
      // L'ombre du soleil suit le point regardé (`closeUp`) : sa cible doit être dans la scène
      if (big && stage.sun) stage.scene.add(stage.sun.target)
      if (dead || !stage.alive) { stage.dispose(); return }
      const kit = critterKit(T)
      const tm = {
        catOrange: new T.MeshStandardMaterial({ color: 0xAE5E24, roughness: 0.75 }),
        catStripe: new T.MeshStandardMaterial({ color: 0x6E3510, roughness: 0.8 }),
        cream: new T.MeshStandardMaterial({ color: 0xCFC3B2, roughness: 0.7 }),
        black: new T.MeshStandardMaterial({ color: 0x1E1A18, roughness: 0.4 }),
        pink: new T.MeshStandardMaterial({ color: 0xD4788A, roughness: 0.7 }),
        white: new T.MeshStandardMaterial({ color: 0xF2F2F2, roughness: 0.5 })
      }
      const sphereGeo = new T.SphereGeometry(1, 14, 10)
      const kitX: Kit = Object.assign(kit, { sphereGeo })
      const glowMat = night ? new T.SpriteMaterial({ map: stage.keep(dotTex(T, '#FFF4B0')), color: 0xFFE070, transparent: true, depthWrite: false, blending: T.AdditiveBlending }) : null
      const U = await import('three/examples/jsm/utils/BufferGeometryUtils.js')
      if (dead || !stage.alive) { stage.dispose(); return }
      const hiders = kinds.map((k, i) => makeHider({ T, U, kit: kitX, mats: tm }, k, i, night, glowMat))
      hiders.forEach(h => {
        h.c.obj.userData.hider = h.i
        const slot = farm.pen[h.i % farm.pen.length]
        h.c.obj.position.set(slot[0], 0, slot[1])
        farm.root.add(h.c.obj)
      })
      const me: State = {
        stage, T, farm, kit, hiders, night,
        phase: 'intro', t: 0, phaseT: 0, seekT0: 0,
        rot: Math.PI, vRot: 0, drag: false,
        // La carte ×4 s'ouvre sur l'enclos, puis recule sur toute la ferme quand on cherche
        zoom: big ? 3.2 : 1, tgtZoom: big ? 3.2 : 1, elev: BASE_EL, tgtElev: BASE_EL, introK: 1, fit: { key: '', d: 20, ty: 1 },
        el: BASE_EL, big, maxZoom: big ? 16 : 1.4, pan: new T.Vector3(), tgtPan: new T.Vector3(), vPan: new T.Vector3(),
        close: false, torchT: 0, torchAt: null,
        cacheLeft: c.byTier(0, 4, 6), nextMove: 0,
        hint: c.byTier(0.55, 0.3, 0.4), stuck: 0, lastFind: 0, streak: 0, nextCall: 0,
        relocs: 0, maxRelocs: c.byTier(0, 6, 8), relocP: c.byTier(0, 0.4, 0.5),
        penNext: 0, outroBurst: 0,
        fx: particles(stage, 500), shake: camShake(stage), ray: new T.Raycaster(),
        glowMat, torch: null, tray, veil
      }
      // L'enclos se remplit dans l'ordre : chacun sa place
      hiders.forEach(h => { h.pen = h.i })
      me.penNext = 0
      if (night) {
        // La lampe torche : un cône de lumière qui part du bas de l'écran et suit le doigt
        const spot = new T.SpotLight(0xFFF0D2, 90, 0, 0.24, 0.55, 1.0)
        spot.castShadow = true
        spot.shadow.mapSize.set(1024, 1024)
        spot.shadow.camera.near = 2; spot.shadow.camera.far = big ? 140 : 45
        spot.shadow.bias = -0.0008
        stage.scene.add(spot, spot.target)
        // Le faisceau : plus dense au cœur qu'aux bords, fondu à ses deux bouts
        const beamMat = new T.ShaderMaterial({
          uniforms: { color: { value: new T.Color(0xFFE6B0) }, opacity: { value: 0.2 } },
          vertexShader: `varying vec3 vN; varying vec3 vV; varying float vZ;
            void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal);
              vV = normalize(cameraPosition - wp.xyz); vZ = position.z; gl_Position = projectionMatrix * viewMatrix * wp; }`,
          fragmentShader: `uniform vec3 color; uniform float opacity; varying vec3 vN; varying vec3 vV; varying float vZ;
            void main(){ float f = abs(dot(normalize(vN), normalize(vV)));
              float a = pow(f, 3.0) * smoothstep(0.05, 0.4, vZ) * (1.0 - smoothstep(0.45, 0.9, vZ)) * opacity;
              gl_FragColor = vec4(color, a); }`,
          transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide
        })
        const cone = new T.ConeGeometry(1, 1, 28, 1, true)
        cone.translate(0, -0.5, 0)
        cone.rotateX(-Math.PI / 2)
        const beam = new T.Mesh(cone, beamMat)
        beam.renderOrder = 3
        stage.scene.add(beam)
        me.torch = { spot, beam, beamMat, aim: new T.Vector3(0, 0, 2), want: new T.Vector3(0, 0, 2) }
      }
      cc = me
      hideLoader()

      /* --- Le doigt. La petite ferme : un doigt la tourne (le point touché
         suit), deux doigts zooment, un toucher cherche. La carte ×4 se mène
         comme une carte : un doigt la promène, deux doigts pincent (zoom) en
         tournant (la ferme pivote) et promènent, ou glissent ensemble vers
         le haut ou le bas (la vue s'incline) — le geste se choisit aux
         premiers pixels. Chaque doigt est suivi par son `pointerId` ; l'élan
         se mesure en temps réel, borné, et s'éteint vite. La nuit, la lampe
         suit le doigt. --- */
      const el = stage.renderer.domElement
      const pts = new Map<number, { x: number; y: number }>()
      let tap: { x: number; y: number; t: number; moved: number; multi: boolean } | null = null
      let lastT = 0
      let mode: 'turn' | 'pan' | 'hold' = 'turn'
      /** Deux doigts : leur écart, leur angle, leur milieu et leurs hauteurs au départ du geste, et le geste choisi. */
      let two: { d0: number; a0: number; m: { x: number; y: number }; m0: { x: number; y: number }; ys: number[]; zoom0: number; rot0: number; el0: number; kind: 'pinch' | 'tilt' | null } | null = null
      const pair = () => {
        const [a, b] = [...pts.values()]
        return { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ys: [a.y, b.y] }
      }
      const startTwo = (kind: 'pinch' | 'tilt' | null) => {
        const p = pair()
        two = { d0: p.d, a0: p.ang, m: p.m, m0: p.m, ys: p.ys, zoom0: me.tgtZoom, rot0: me.rot, el0: me.tgtElev, kind }
      }
      const turned = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b))
      $('ccCentre')?.addEventListener('click', () => { if (cc === me) { recenter(me); sfx('whoosh', { vol: 0.3, rate: 1.2 }) } })
      const onDown = (e: PointerEvent) => {
        if (cc !== me || e.target !== el) return
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
        me.vRot = 0; me.vPan.set(0, 0, 0)
        lastT = performance.now()
        // L'heure de l'événement, pas celle où on le traite : une image lente entre l'appui et le lever ne transforme pas un toucher en appui long
        if (pts.size === 1) { tap = { x: e.clientX, y: e.clientY, t: e.timeStamp, moved: 0, multi: false }; mode = me.big ? 'pan' : 'turn' }
        else if (tap) tap.multi = true
        if (pts.size === 2) startTwo(me.big ? null : 'pinch')
        me.drag = true
        aimTorch(me, e.clientX, e.clientY)
      }
      const onMove = (e: PointerEvent) => {
        const p = pts.get(e.pointerId)
        if (!p || cc !== me) return
        const dx = e.clientX - p.x, dy = e.clientY - p.y
        p.x = e.clientX; p.y = e.clientY
        if (tap) tap.moved += Math.abs(dx) + Math.abs(dy)
        aimTorch(me, e.clientX, e.clientY)
        if (me.phase !== 'seek') return
        if (pts.size === 1) {
          if (mode === 'hold') return
          const now = performance.now()
          const dts = Math.max(8, now - lastT) / 1000
          lastT = now
          if (mode === 'pan') {
            // Un toucher qui tremble ne promène pas la vue
            if (tap && tap.moved < 8) return
            const x0 = me.tgtPan.x, z0 = me.tgtPan.z
            panBy(me, dx, dy)
            const vx = (me.tgtPan.x - x0) / dts, vz = (me.tgtPan.z - z0) / dts
            me.vPan.set(me.vPan.x * 0.5 + vx * 0.5, 0, me.vPan.z * 0.5 + vz * 0.5).clampLength(0, 40)
            return
          }
          const k = 1 / Math.max(120, el.clientWidth * 0.36)
          me.rot += dx * k
          me.vRot = Math.max(-3.2, Math.min(3.2, me.vRot * 0.5 + dx * k / dts * 0.5))
        } else if (pts.size === 2 && two) {
          const q = pair()
          me.vRot = 0
          if (!two.kind) {
            // Le geste se choisit aux premiers pixels : les deux doigts montent
            // ou descendent ensemble (incliner), sinon pincer et tourner
            const dd = Math.abs(q.d - two.d0), da = Math.abs(turned(q.ang, two.a0)) * q.d / 2
            const ya = q.ys[0] - two.ys[0], yb = q.ys[1] - two.ys[1]
            if (Math.max(dd, da, Math.abs(ya), Math.abs(yb)) < 14) return
            startTwo(Math.sign(ya) === Math.sign(yb) && Math.min(Math.abs(ya), Math.abs(yb)) > Math.max(dd, da) * 0.8 ? 'tilt' : 'pinch')
            return
          }
          if (two.kind === 'tilt') { me.tgtElev = Math.max(0.32, Math.min(1.45, two.el0 + (q.m.y - two.m0.y) * 0.004)); return }
          me.tgtZoom = Math.max(0.86, Math.min(me.maxZoom, two.zoom0 * q.d / Math.max(1, two.d0)))
          if (me.big) {
            // Tourner les doigts dans le sens des aiguilles d'une montre fait tourner la ferme dans le même sens
            me.rot = two.rot0 - turned(q.ang, two.a0)
            panBy(me, q.m.x - two.m.x, q.m.y - two.m.y)
            two.m = q.m
          }
        }
      }
      const onUp = (e: PointerEvent) => {
        if (!pts.has(e.pointerId) || cc !== me) return
        pts.delete(e.pointerId)
        if (pts.size < 2) two = null
        me.drag = pts.size > 0
        // Le doigt qui reste après deux doigts ne fait rien (pas de tour ni de glissé surprise)
        if (pts.size > 0) { me.vRot = 0; me.vPan.set(0, 0, 0); lastT = performance.now(); mode = 'hold'; return }
        // Un doigt qui s'est arrêté avant de se lever ne lance rien
        if (performance.now() - lastT > 90) { me.vRot = 0; me.vPan.set(0, 0, 0) }
        const t = tap
        tap = null
        if (e.type === 'pointercancel' || !t || t.multi || t.moved > 14 || e.timeStamp - t.t > 650) return
        me.vRot = 0; me.vPan.set(0, 0, 0)
        onTap(me, e.clientX, e.clientY)
      }
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        me.tgtZoom = Math.max(0.86, Math.min(me.maxZoom, me.tgtZoom * Math.exp(-e.deltaY * 0.0012)))
      }
      el.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      el.addEventListener('wheel', onWheel, { passive: false })

      // Accroche pour les bots (scripts/play.mjs) — inerte en production
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __cc: unknown }).__cc = {
          get phase() { return me.phase }, get found() { return me.hiders.filter(h => h.found).length },
          get total() { return me.hiders.length }, get spin() { return me.drag ? 1 : me.vRot }, get night() { return me.night },
          get relocs() { return me.relocs },
          get calls() { return stage.renderer.info.render.calls },
          // Seulement les points qu'un doigt toucherait vraiment (pas sous un bouton de la barre)
          animals: () => me.hiders.map(h => {
            const p = h.found ? null : central(seen(me, h).filter(q => document.elementFromPoint(q.x, q.y) === el))
            return { kind: h.kind, found: h.found, state: h.state, slot: h.slot?.id ?? null, inside: h.peek === 'cache', peek: h.peek, pts: h.pts.length, x: p ? p.x : null, y: p ? p.y : null }
          }),
          /** Où fouiller pour l'animal n° i (caché en entier) : sa cachette, si c'est bien elle qu'un doigt
              toucherait d'ici — dans un grand coin (un bois), là où il est. */
          spotAt: (i: number) => {
            const h = me.hiders[i], s = h?.spot
            if (!s || !h.slot) return null
            const r = el.getBoundingClientRect()
            const cands = [s.g.localToWorld(new T.Vector3(h.slot.at[0], h.slot.at[1] + 0.3, h.slot.at[2]))]
            if (!wide(s)) {
              for (const occ of shuffle(s.occ.slice()).slice(0, 12)) {
                if ((occ as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) continue
                const v = new T.Vector3()
                occ.geometry.computeBoundingBox()
                occ.geometry.boundingBox!.getCenter(v); occ.localToWorld(v)
                cands.push(v)
              }
            }
            for (const v of cands) {
              const p = v.clone().project(stage.camera)
              if (Math.abs(p.x) > 0.9 || Math.abs(p.y) > 0.85 || p.z > 1) continue
              me.ray.setFromCamera(new T.Vector2(p.x, p.y), stage.camera)
              const hit = me.ray.intersectObjects(me.farm.occ, false)[0]
              const x = r.left + (p.x + 1) / 2 * r.width, y = r.top + (1 - p.y) / 2 * r.height
              if (hit && me.farm.spots[hit.object.userData.spot as number] === s && (!wide(s) || nearSlot(me, h, hit.point, 1.3)) && document.elementFromPoint(x, y) === el) return { x, y }
            }
            return null
          },
          get zoom() { return me.zoom }, get elev() { return me.elev }, get pan() { return [me.pan.x, me.pan.z] },
          get maxZoom() { return me.maxZoom }, get close() { return me.close },
          /** La vue bouge encore (doigt, élan, zoom, glissé vers le point visé). */
          get moving() {
            return me.drag || Math.abs(me.vRot) > 0.01 || me.vPan.length() > 0.05 || me.pan.distanceTo(me.tgtPan) > 0.05 ||
              Math.abs(me.zoom - me.tgtZoom) > me.zoom * 0.02 || Math.abs(me.elev - me.tgtElev) > 0.01
          },
          /** Le bot s'approche de l'animal n° i comme un enfant qui zoome sur un coin de la carte : il tourne un
              peu, s'approche plus ou moins, regarde de biais ou d'en haut — d'un coup (sous SwiftShader, une
              image prend une seconde : glisser jusque-là prendrait des minutes). */
          visit: (i: number, turn: number, near: number, el: number) => {
            const h = me.hiders[i]
            if (!h || h.found) return false
            const p = me.farm.root.worldToLocal(h.c.obj.getWorldPosition(new T.Vector3()))
            me.rot += turn; me.vRot = 0; me.vPan.set(0, 0, 0)
            me.tgtPan.set(p.x, 0, p.z); keepIn(me); me.pan.copy(me.tgtPan)
            me.zoom = me.tgtZoom = me.maxZoom * near; me.elev = me.tgtElev = el
            place(me); frame(me, 0)
            me.farm.root.updateMatrixWorld(true); stage.camera.updateMatrixWorld()
            return true
          },
          get BASE_EL() { return BASE_EL },
          recenter: () => recenter(me),
          // Une cachette vide qu'on voit : son point visé, si c'est bien elle qu'un doigt toucherait
          emptySpot: () => {
            const r = el.getBoundingClientRect()
            for (const s of me.farm.spots) {
              if (me.hiders.some(h => !h.found && h.spot === s)) continue
              const v = new T.Vector3(...s.aim)
              s.g.localToWorld(v)
              const p = v.clone().project(stage.camera)
              if (Math.abs(p.x) > 0.85 || Math.abs(p.y) > 0.8) continue
              me.ray.setFromCamera(new T.Vector2(p.x, p.y), stage.camera)
              const hit = me.ray.intersectObjects(me.farm.occ, false)[0]
              if (hit && me.farm.spots[hit.object.userData.spot as number] === s) {
                // Et aucun animal caché tout près à l'écran (sinon ce serait un « presque »)
                const x = r.left + (p.x + 1) / 2 * r.width, y = r.top + (1 - p.y) / 2 * r.height
                const close = me.hiders.some(h => !h.found && h.pts.some(q => {
                  const s2 = h.c.obj.localToWorld(q.clone()).project(stage.camera)
                  return Math.hypot(r.left + (s2.x + 1) / 2 * r.width - x, r.top + (1 - s2.y) / 2 * r.height - y) < Math.min(r.width, r.height) * 0.16
                }))
                if (!close) return { x, y, id: s.id }
              }
            }
            return null
          }
        }
      }

      stage.start(dt => { if (cc === me) step(me, dt) })
      stage.keep({
        dispose() {
          el.removeEventListener('pointerdown', onDown)
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          window.removeEventListener('pointercancel', onUp)
          el.removeEventListener('wheel', onWheel)
          me.fx.dispose()
          kit.dispose()
          sphereGeo.dispose()
          Object.values(tm).forEach(m => m.dispose())
          glowMat?.dispose()
          delete (window as { __cc?: unknown }).__cc
        }
      })
    })().catch(err => { console.error(err); hideLoader(); ctx.toast('La 3D n\'est pas disponible ici') })

    return () => {
      dead = true
      offPause()
      setMusicIntensity(0)
      const me = cc
      cc = null
      if (me) { try { me.stage.dispose() } catch { /* déjà démonté */ } }
    }
  }
}
