import type { GameDef, GameContext } from '../core/types'
import { createStage, loader, woodTex, type Stage, type T3 } from '../core/three3d'
import { particles, type Particles } from '../core/scene3d'
import { bagKit, packBits, type Bag, type BagLook, type BagModel, type BagFabric, type Motif, type PatchKind, type BadgeKind, type CharmKind } from '../core/satchel3d'
import { withRenderer, critterPortraits } from '../core/portraits'
import { makeDoll, poseDoll, type Doll } from '../core/doll3d'
import { familyDoll, useFerme } from '../core/store'
import { sfx, preloadSfx } from '../core/sfx'
import { tone } from '../core/audio'
import { visible, handNow, type HandMove } from '../core/hand'
import { BADGE } from '../core/badges'

/* 🎒 MON CARTABLE (19/10, demandé par Joyce : « le tuning de cartable ») —
   sur le modèle de la Pâtisserie : le cartable en grand dans un coin de
   classe (tableau vert, patères, pupitre), qu'on fait tourner au doigt ; six
   étapes à gauche, chacune son icône et son nom :
   - Modèle    : le cartable à rabat, le sac à dos, le cartable à roulettes
   - Matière   : toile, cuir verni, jean, PAILLETTES RÉVERSIBLES (on les
                 caresse : vers le haut elles se retournent, vers le bas elles
                 reviennent — on dessine sur son rabat), peluche, holographique
   - Couleurs  : une couleur, puis toucher la pièce à peindre (le corps, le
                 rabat ou la poche, les bretelles ; sur les paillettes, la face
                 qu'on touche) ; le métal des fermoirs : or, argent, rose doré
   - Motifs    : pois, rayures, cœurs, étoiles, léopard, écossais, et leur couleur
   - Déco      : des écussons brodés et des badges qu'on pose où l'on touche
                 (un toucher dessus les reprend), des porte-clés qui se balancent
   - Remplir   : le rabat s'ouvre (la fermeture éclair du sac à dos) ; la
                 trousse, les cahiers, la règle, la gourde, la pomme : un
                 toucher, et elles filent dedans ; tout rangé, clac, il se ferme
   « Fini » : la petite fille d'Habille-toi arrive, le met sur son dos, saute
   de joie et part à l'école (un toucher passe). Un cartable par fille (deux
   cartes à l'ouverture, avec sa photo), gardé tel qu'elle l'a laissé.
   Créer : aucune note. */

type Step = 'modele' | 'matiere' | 'couleurs' | 'motifs' | 'deco' | 'remplir'
type Who = 'jade' | 'joyce'
const WHO: { id: Who; name: string; color: string }[] = [
  { id: 'jade', name: 'Jade', color: '#5EC97B' },
  { id: 'joyce', name: 'Joyce', color: '#B197FC' }
]
const KEY = (w: Who) => `ferme:cartable:${w}`
const PHOTO = (w: Who) => `ferme:cartable:photo:${w}`
const WHO_KEY = 'ferme:cartable:qui'

const STEPS: Step[] = ['modele', 'matiere', 'couleurs', 'motifs', 'deco', 'remplir']
const STEP_NAME: Record<Step, string> = { modele: 'Modèle', matiere: 'Matière', couleurs: 'Couleurs', motifs: 'Motifs', deco: 'Déco', remplir: 'Remplir' }
const MODELS: [BagModel, string][] = [['rabat', 'Cartable'], ['dos', 'Sac à dos'], ['roulettes', 'Roulettes']]
const FABRICS: [BagFabric, string][] = [['toile', 'Toile'], ['verni', 'Verni'], ['jean', 'Jean'], ['paillettes', 'Paillettes'], ['peluche', 'Peluche'], ['holo', 'Holo']]
const COLORS: [string, string][] = [
  ['#F27BAA', 'Rose'], ['#E8456B', 'Framboise'], ['#FF9F43', 'Orange'], ['#FFD34D', 'Jaune'], ['#5EC97B', 'Vert'], ['#4FB8E7', 'Bleu'],
  ['#3F5F9E', 'Marine'], ['#B197FC', 'Lilas'], ['#8A5A3C', 'Chocolat'], ['#FFFFFF', 'Blanc'], ['#3A3340', 'Noir'], ['#E3E7EE', 'Argent']
]
const METALS: [BagLook['metal'], string, string][] = [['or', 'Or', '#E2B85C'], ['argent', 'Argent', '#D5DAE0'], ['rose', 'Rose doré', '#E7A391']]
const MOTIFS: [Motif, string][] = [['uni', 'Uni'], ['pois', 'Pois'], ['rayures', 'Rayures'], ['coeurs', 'Cœurs'], ['etoiles', 'Étoiles'], ['leopard', 'Léopard'], ['ecossais', 'Écossais']]
const MOTIF_COLORS: [string, string][] = [['#FFFFFF', 'Blanc'], ['#FFD34D', 'Jaune'], ['#F27BAA', 'Rose'], ['#4FB8E7', 'Bleu'], ['#5EC97B', 'Vert'], ['#3A3340', 'Noir']]
const PATCHES: [PatchKind, string][] = [['coeur', 'Cœur'], ['etoile', 'Étoile'], ['arcenciel', 'Arc-en-ciel'], ['fraise', 'Fraise'], ['eclair', 'Éclair'], ['couronne', 'Couronne']]
const BADGES: [BadgeKind, string, string][] = [['sourire', 'Sourire', '#4FB8E7'], ['fleur', 'Fleur', '#FF8FAB'], ['coeur', 'Cœur', '#5EC97B']]
const CHARMS: [CharmKind, string][] = [['pig', 'Cochon'], ['chick', 'Poussin'], ['cat', 'Chat'], ['pompon', 'Pompon']]
const MAX_DECO = 10, MAX_CHARMS = 3

/** Les affaires à ranger, posées sur le pupitre devant le cartable. */
type ItemId = 'trousse' | 'cahier1' | 'cahier2' | 'regle' | 'gourde' | 'pomme'
const ITEMS: ItemId[] = ['trousse', 'cahier1', 'cahier2', 'regle', 'gourde', 'pomme']

const defaultLook = (w: Who): BagLook => w === 'jade'
  ? { model: 'rabat', fabric: 'toile', body: '#9EE0C0', flap: '#5EC97B', straps: '#FFFFFF', metal: 'or', motif: 'uni', motifColor: '#FFFFFF', sequinB: '#E3E7EE', patches: [], badges: [], charms: [] }
  : { model: 'rabat', fabric: 'toile', body: '#DCD3F5', flap: '#B197FC', straps: '#FFFFFF', metal: 'or', motif: 'uni', motifColor: '#FFFFFF', sequinB: '#E3E7EE', patches: [], badges: [], charms: [] }

interface Saved { v: 1; look: BagLook; seq?: string }

interface Item { id: ItemId; g: import('three').Group; home: import('three').Vector3; t: number; packed: boolean; pop: number
  /** Son centre (monde), là où on la vise. */
  c: import('three').Vector3 }

interface State {
  stage: Stage
  T: T3
  kit: Awaited<ReturnType<typeof bagKit>>
  bag: Bag
  look: BagLook
  /** Les faces des paillettes, gardées entre deux reconstructions. */
  seq: string | null
  step: Step
  color: string
  /** L'écusson, le badge choisi (Déco) : posé là où l'on touche. */
  pick: { type: 'patch' | 'badge'; id: string } | null
  rot: number
  vRot: number
  /** Un cartable neuf en route (une autre retouche attend son tour). */
  building: boolean
  again: boolean
  /** Ouvert (Remplir), de 0 à 1 ; voulu. */
  openK: number
  openWant: number
  items: Item[]
  squash: number
  phase: 'make' | 'outro' | 'done'
  outro: { doll: Doll; t: number; worn: boolean } | null
  fx: Particles
  ray: import('three').Raycaster
  cam: { p: import('three').Vector3; t: import('three').Vector3 }
  t: number
}

let me: State | null = null
let ctx: GameContext
let who: Who = 'joyce'
const thumbs: Record<string, string> = {}

/* ---------- La sauvegarde (un cartable par fille) ---------- */

function load(w: Who): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY(w)) || 'null') as Saved | null
    if (s && s.v === 1 && s.look && typeof s.look.model === 'string') return { v: 1, look: { ...defaultLook(w), ...s.look }, seq: s.seq }
  } catch { /* un cartable neuf */ }
  return { v: 1, look: defaultLook(w) }
}
let saveTimer = 0
function save(s: State) {
  const seq = s.bag.sequins ? s.bag.sequins.bits() : s.seq
  s.seq = seq ?? null
  const data: Saved = { v: 1, look: s.look, ...(seq ? { seq } : {}) }
  clearTimeout(saveTimer)
  const w = who
  saveTimer = window.setTimeout(() => { try { localStorage.setItem(KEY(w), JSON.stringify(data)) } catch { /* plein : tant pis */ } }, 300)
}
/** La photo du cartable pour sa carte : l'image telle qu'on la quitte, réduite. */
function snap(s: State) {
  try {
    const cv = s.stage.renderer.domElement
    s.stage.renderer.render(s.stage.scene, s.stage.camera)
    const w = 400, h = Math.max(1, Math.round(w * cv.height / Math.max(1, cv.width)))
    const c2 = document.createElement('canvas')
    c2.width = w; c2.height = h
    c2.getContext('2d')!.drawImage(cv, 0, 0, w, h)
    localStorage.setItem(PHOTO(who), c2.toDataURL('image/webp', 0.8))
  } catch { /* la carte garde l'ancienne photo */ }
}

/* ---------- Le coin de classe ---------- */

function classroom(stage: Stage) {
  const T = stage.T, S = stage.scene
  const cv = (w: number, h: number, f: (x: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d')!)
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return stage.keep(t)
  }
  // Le mur et son soubassement
  const wall = new T.Mesh(new T.PlaneGeometry(16, 9), new T.MeshStandardMaterial({ roughness: 0.95, map: cv(1024, 576, x => {
    x.fillStyle = '#F8EEDD'; x.fillRect(0, 0, 1024, 576)
    x.fillStyle = '#FBD9B4'; x.fillRect(0, 400, 1024, 176)
    x.fillStyle = '#E9B98A'; x.fillRect(0, 392, 1024, 10)
  }) }))
  wall.position.set(0, 1.4, -2.6); wall.receiveShadow = true; S.add(wall)
  // Le tableau vert, ses dessins à la craie
  const board = new T.Mesh(new T.PlaneGeometry(3.0, 1.5), new T.MeshStandardMaterial({ roughness: 0.92, map: cv(1024, 512, x => {
    x.fillStyle = '#2F5A49'; x.fillRect(0, 0, 1024, 512)
    let seed = 3
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(255,255,255,${r() * 0.04})`; x.fillRect(r() * 1024, r() * 512, 30, 3) }
    x.strokeStyle = 'rgba(255,255,255,.85)'; x.fillStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 6; x.lineCap = 'round'
    x.beginPath(); x.arc(150, 130, 50, 0, 7); x.stroke()
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; x.beginPath(); x.moveTo(150 + Math.cos(a) * 68, 130 + Math.sin(a) * 68); x.lineTo(150 + Math.cos(a) * 92, 130 + Math.sin(a) * 92); x.stroke() }
    x.font = '700 92px "Baloo 2", sans-serif'; x.fillText('A B C', 330, 170); x.fillText('1 2 3', 360, 330)
    x.strokeStyle = 'rgba(255,180,200,.9)'
    x.beginPath(); x.moveTo(840, 300); x.bezierCurveTo(740, 230, 780, 160, 840, 210); x.bezierCurveTo(900, 160, 940, 230, 840, 300); x.stroke()
    x.strokeStyle = 'rgba(255,240,150,.9)'
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 4 * Math.PI / 5, b = -Math.PI / 2 + (i + 1) * 4 * Math.PI / 5; x.beginPath(); x.moveTo(860 + Math.cos(a) * 55, 110 + Math.sin(a) * 55); x.lineTo(860 + Math.cos(b) * 55, 110 + Math.sin(b) * 55); x.stroke() }
  }) }))
  board.position.set(-1.45, 1.75, -2.57); S.add(board)
  const frame = new T.MeshStandardMaterial({ map: stage.keep(woodTex(T, '#B98552')), roughness: 0.6 })
  for (const [w, h, x, y] of [[3.2, 0.1, -1.45, 2.55], [3.2, 0.14, -1.45, 0.96], [0.1, 1.66, -3.05, 1.75], [0.1, 1.66, 0.15, 1.75]]) {
    const b = new T.Mesh(new T.BoxGeometry(w, h, 0.08), frame); b.position.set(x, y, -2.55); b.castShadow = true; S.add(b)
  }
  // Le porte-manteau
  const plank = new T.Mesh(new T.BoxGeometry(1.8, 0.2, 0.06), frame); plank.position.set(2.1, 1.7, -2.56); plank.castShadow = true; S.add(plank)
  const brass = new T.MeshStandardMaterial({ color: '#D8B25A', metalness: 1, roughness: 0.3 })
  for (let i = 0; i < 3; i++) {
    const h = new T.Mesh(new T.CapsuleGeometry(0.025, 0.14, 4, 10), brass); h.position.set(1.5 + i * 0.6, 1.66, -2.47); h.rotation.x = 1.1; h.castShadow = true; S.add(h)
    const k = new T.Mesh(new T.SphereGeometry(0.04, 16, 12), brass); k.position.set(1.5 + i * 0.6, 1.72, -2.4); S.add(k)
  }
  // Le pupitre en bois clair
  const top = new T.Mesh(new T.BoxGeometry(5.2, 0.1, 3.0), new T.MeshStandardMaterial({ map: stage.keep(woodTex(T, '#E3BB86', 2)), roughness: 0.55 }))
  top.position.set(0, -0.05, 0); top.receiveShadow = true; S.add(top)
  // Le pot de crayons, au fond
  const pot = new T.Mesh(new T.CylinderGeometry(0.13, 0.12, 0.3, 28), new T.MeshStandardMaterial({ color: '#4FB8E7', roughness: 0.5 }))
  pot.position.set(-1.55, 0.15, -0.75); pot.castShadow = true; S.add(pot)
  ;['#FF6B81', '#FFC94D', '#5EC97B', '#B197FC', '#FF9F43'].forEach((c, i) => {
    const p = new T.Mesh(new T.CylinderGeometry(0.018, 0.018, 0.5, 6), new T.MeshStandardMaterial({ color: c, roughness: 0.6 }))
    p.position.set(-1.55 + Math.cos(i * 1.3) * 0.06, 0.38, -0.75 + Math.sin(i * 1.3) * 0.06); p.rotation.set(Math.sin(i) * 0.15, 0, Math.cos(i * 2) * 0.15); p.castShadow = true; S.add(p)
  })
}

/* ---------- Les affaires de classe (Remplir) ---------- */

function makeItem(T: T3, stage: Stage, id: ItemId) {
  const g = new T.Group()
  const m = (color: string, o: Partial<import('three').MeshStandardMaterialParameters> = {}) => new T.MeshStandardMaterial({ color, roughness: 0.5, ...o })
  const add = (geo: import('three').BufferGeometry, mat: import('three').Material, x = 0, y = 0, z = 0) => { const o = new T.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o }
  const cover = (color: string) => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 160
    const x = c.getContext('2d')!
    x.fillStyle = color; x.fillRect(0, 0, 128, 160)
    x.fillStyle = '#FFFFFF'; x.fillRect(24, 40, 80, 34)
    x.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 3; i++) x.fillRect(32, 48 + i * 9, 64, 3)
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace
    return stage.keep(t)
  }
  if (id === 'trousse') {
    add(new T.CapsuleGeometry(0.075, 0.28, 6, 16), m('#FF8FB5', { roughness: 0.75 }), 0, 0.075, 0).rotation.z = Math.PI / 2
    const zip = add(new T.BoxGeometry(0.3, 0.012, 0.012), m('#C9CED6', { metalness: 1, roughness: 0.3 }), 0, 0.145, 0)
    zip.castShadow = false
    add(new T.BoxGeometry(0.025, 0.05, 0.008), m('#C9CED6', { metalness: 1, roughness: 0.3 }), 0.1, 0.13, 0.04)
  } else if (id === 'cahier1' || id === 'cahier2') {
    const mats = [m('#FFFFFF'), m('#FFFFFF'), m('#FFFFFF', { map: cover(id === 'cahier1' ? '#4FB8E7' : '#F27BAA') }), m('#EEEEEE'), m('#FFFFFF'), m('#FFFFFF')]
    add(new T.BoxGeometry(0.3, 0.025, 0.4), mats as unknown as import('three').Material, 0, 0.0125, 0)
  } else if (id === 'regle') {
    const c = document.createElement('canvas'); c.width = 512; c.height = 64
    const x = c.getContext('2d')!
    x.fillStyle = '#FFE27A'; x.fillRect(0, 0, 512, 64)
    x.fillStyle = '#7A5A2A'; for (let i = 0; i <= 50; i++) x.fillRect(8 + i * 9.8, 0, 2, i % 5 ? 14 : 26)
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; stage.keep(t)
    add(new T.BoxGeometry(0.56, 0.01, 0.07), [m('#FFE27A'), m('#FFE27A'), m('#FFFFFF', { map: t }), m('#FFE27A'), m('#FFE27A'), m('#FFE27A')] as unknown as import('three').Material, 0, 0.005, 0)
  } else if (id === 'gourde') {
    const prof = [[0.001, 0], [0.065, 0], [0.07, 0.02], [0.07, 0.2], [0.05, 0.25], [0.035, 0.27], [0.035, 0.3], [0.001, 0.3]].map(([a, b]) => new T.Vector2(a, b))
    add(new T.LatheGeometry(prof, 28), m('#5EC97B', { metalness: 0.6, roughness: 0.25 }))
    add(new T.CylinderGeometry(0.04, 0.04, 0.05, 20), m('#FFFFFF'), 0, 0.32, 0)
  } else {
    add(new T.SphereGeometry(0.1, 28, 20), new T.MeshPhysicalMaterial({ color: '#E3343F', roughness: 0.35, clearcoat: 0.6 }), 0, 0.09, 0).scale.y = 0.9
    add(new T.CylinderGeometry(0.007, 0.009, 0.06, 6), m('#6B4A2A'), 0, 0.2, 0)
    const leaf = add(new T.SphereGeometry(0.03, 12, 8), m('#5EC97B'), 0.03, 0.2, 0)
    leaf.scale.set(1.4, 0.35, 0.8)
  }
  g.userData.item = id
  return g
}

/* ---------- Le cartable : construit, reconstruit ---------- */

const BAG_X = 0.12

async function rebuild(s: State) {
  if (s.building) { s.again = true; return }
  s.building = true
  try {
    do {
      s.again = false
      const old = s.bag
      const seq = old.sequins ? old.sequins.bits() : s.seq
      const bag = await s.kit.build({ ...s.look, patches: [...s.look.patches], badges: [...s.look.badges], charms: [...s.look.charms] })
      if (me !== s) { bag.dispose(); return }
      if (bag.sequins && seq) { bag.sequins.setBits(seq); bag.sequins.snap() }
      placeBag(s, bag)
      s.stage.scene.remove(old.obj)
      old.dispose()
      s.bag = bag
      bag.open(s.openK)
    } while (s.again)
  } finally { s.building = false }
  save(s)
}
function placeBag(s: State, bag: Bag) {
  bag.obj.position.set(BAG_X, bag.H / 2 + (s.look.model === 'roulettes' ? 0.11 : 0), 0)
  bag.obj.rotation.y = s.rot
  bag.obj.traverse(o => { if ((o as import('three').Mesh).isMesh) o.castShadow = true })
  s.stage.scene.add(bag.obj)
}

/** Ce que le doigt touche sur le cartable : la pièce, l'ornement, le point (repère du cartable). */
function hitBag(s: State, cx: number, cy: number) {
  const el = s.stage.renderer.domElement, r = el.getBoundingClientRect()
  s.ray.setFromCamera(new s.T.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), s.stage.camera)
  const hits = s.ray.intersectObject(s.bag.obj, true)
  for (const h of hits) {
    let o: import('three').Object3D | null = h.object, deco: { type: string; i: number } | null = null, part: string | null = null
    while (o && o !== s.bag.obj) { if (o.userData.deco) deco = o.userData.deco; if (!part && o.userData.part) part = o.userData.part; o = o.parent }
    if (!part && !deco) continue
    return { part, deco, local: s.bag.obj.worldToLocal(h.point.clone()), normal: h.face?.normal.clone().transformDirection(h.object.matrixWorld) ?? null }
  }
  return null
}

/** Un point du cartable (son repère) à l'écran. */
function screenOf(s: State, x: number, y: number, z: number) {
  const v = s.bag.obj.localToWorld(new s.T.Vector3(x, y, z)).project(s.stage.camera)
  const r = s.stage.renderer.domElement.getBoundingClientRect()
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }
}
const worldScreen = (s: State, w: import('three').Vector3) => {
  const v = w.clone().project(s.stage.camera), r = s.stage.renderer.domElement.getBoundingClientRect()
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }
}

/* ---------- Les gestes ---------- */

const sparkle = (s: State, at: import('three').Vector3, cols: string[], n = 10) =>
  s.fx.burst(at, { count: n, color: cols, speed: 0.6, spread: 1, life: 0.6, size: 0.03, gravity: 0.6 })

/** Peindre la pièce touchée de la couleur choisie. */
function paint(s: State, h: NonNullable<ReturnType<typeof hitBag>>) {
  const c = s.color, L = s.look
  if (h.part === 'paillettes' && s.bag.sequins) {
    if (s.bag.sequins.faceAt(h.local)) L.sequinB = c; else L.flap = c
  } else if (h.part === 'rabat') L.flap = c
  else if (h.part === 'corps') L.body = c
  else if (h.part === 'bretelles') L.straps = c
  else return
  sfx('pluck', { vol: 0.5, rate: 0.9 + Math.random() * 0.3 })
  sparkle(s, s.bag.obj.localToWorld(h.local.clone()), [c, '#FFFFFF'], 14)
  rebuild(s)
}

/** Déco : reprendre un ornement touché, ou poser celui qu'on a choisi là où l'on touche. */
function decorate(s: State, h: NonNullable<ReturnType<typeof hitBag>>) {
  const L = s.look
  if (h.deco) {
    const { type, i } = h.deco
    if (type === 'patch') L.patches.splice(i, 1)
    else if (type === 'badge') L.badges.splice(i, 1)
    else L.charms.splice(i, 1)
    sfx('cloth', { vol: 0.5, rate: 1.3 })
    rebuild(s)
    return
  }
  if (!s.pick || L.patches.length + L.badges.length >= MAX_DECO) return
  // Sur le devant seulement
  const front = s.look.model === 'dos' ? h.local.z > s.bag.D / 2 - 0.12 : h.local.z > s.bag.D / 2 - 0.05
  if (!front || !h.part || h.part === 'metal') return
  const x = Math.max(-s.bag.W / 2 + 0.1, Math.min(s.bag.W / 2 - 0.1, h.local.x)), y = Math.max(-s.bag.H / 2 + 0.1, Math.min(s.bag.H / 2 - 0.1, h.local.y))
  if (s.pick.type === 'patch') L.patches.push({ kind: s.pick.id as PatchKind, x, y, rot: (Math.random() - 0.5) * 0.5, size: 0.17 })
  else { const b = BADGES.find(b => b[0] === s.pick!.id)!; L.badges.push({ kind: b[0], color: b[2], x, y }) }
  sfx('drop', { vol: 0.6 })
  sparkle(s, s.bag.obj.localToWorld(h.local.clone()), ['#FFD34D', '#FFFFFF'], 12)
  rebuild(s)
}

/** Remplir : l'affaire touchée file dans le cartable. */
function pack(s: State, it: Item) {
  if (it.packed || it.t > 0 || s.openK < 0.6) return
  it.t = 0.001
  sfx('whoosh', { vol: 0.4, rate: 1.2 })
}

/* ---------- Chaque image ---------- */

const ease = (k: number) => k * k * (3 - 2 * k)
const CAMS: Record<'make' | 'fill' | 'outro', { p: [number, number, number]; t: [number, number, number] }> = {
  make: { p: [0, 1.0, 3.4], t: [0.12, 0.5, 0] },
  fill: { p: [0.15, 2.3, 3.95], t: [0.2, 0.42, 0.3] },
  outro: { p: [0.3, 1.45, 5.6], t: [0.4, 0.78, 0] }
}

function frame(s: State, dt: number) {
  s.t += dt
  const T = s.T
  // La caméra glisse vers son cadre (Remplir : plus haut, pour voir dedans)
  const want = s.phase === 'outro' || s.phase === 'done' ? CAMS.outro : s.step === 'remplir' ? CAMS.fill : CAMS.make
  const k = Math.min(1, dt * 3)
  s.cam.p.lerp(new T.Vector3(...want.p), k); s.cam.t.lerp(new T.Vector3(...want.t), k)
  s.stage.camera.position.copy(s.cam.p); s.stage.camera.lookAt(s.cam.t)
  // Le cartable tourne au doigt (avec son élan) ; pour Remplir, il se met de face
  if (s.step === 'remplir' && s.phase === 'make') s.rot += (0 - s.rot) * Math.min(1, dt * 4)
  else { s.rot += s.vRot * dt; s.vRot *= Math.pow(0.02, dt) }
  // Ouvrir, fermer
  if (s.openK !== s.openWant) {
    const was = s.openK
    s.openK = s.openWant > s.openK ? Math.min(s.openWant, s.openK + dt * 2.2) : Math.max(s.openWant, s.openK - dt * 2.6)
    s.bag.open(ease(s.openK))
    if (was > 0 && s.openK === 0) { sfx('metal', { vol: 0.7 }); s.squash = 1 }
  }
  // Les affaires qui filent dedans
  const mouthW = s.bag.obj.localToWorld(s.bag.mouth.clone())
  for (const [i, it] of s.items.entries()) {
    if (it.pop < 1 && it.g.visible) {
      // Elles arrivent sur le pupitre l'une après l'autre, en rebondissant
      it.pop = Math.min(1, it.pop + dt * 2.2)
      const k2 = Math.max(0, Math.min(1, (it.pop - i * 0.08) / (1 - i * 0.08)))
      it.g.scale.setScalar(Math.max(0.001, k2 < 0.7 ? k2 / 0.7 * 1.15 : 1.15 - (k2 - 0.7) / 0.3 * 0.15))
    }
    if (it.packed || it.t <= 0) continue
    it.t = Math.min(1, it.t + dt / 0.75)
    const e = ease(it.t)
    it.g.position.lerpVectors(it.home, mouthW, e)
    it.g.position.y += Math.sin(e * Math.PI) * 0.7
    it.g.rotation.x = e * 1.3
    it.g.scale.setScalar(Math.max(0.001, 1 - e * e * 0.85))
    if (it.t >= 1) {
      it.packed = true
      it.g.visible = false
      s.squash = 1
      sfx('drop', { vol: 0.6, rate: 0.8 + s.items.filter(x => x.packed).length * 0.08 })
      sparkle(s, mouthW, ['#FFD34D', '#FFFFFF', '#FF8FB5'], 12)
      // Tout est rangé : clac, il se ferme
      if (s.items.every(x => x.packed)) ctx.after(450, () => { if (me === s) { s.openWant = 0; tone(660, 0.1, 'triangle', 0.08); tone(990, 0.16, 'triangle', 0.08, 0.1) } })
    }
  }
  // Le cartable qui s'écrase un peu quand on le remplit, et rebondit
  if (s.squash > 0) {
    s.squash = Math.max(0, s.squash - dt * 3)
    const q = Math.sin(s.squash * Math.PI) * 0.06
    s.bag.obj.scale.set(1 + q * 0.6, 1 - q, 1 + q * 0.6)
  }
  if (s.phase === 'outro' || s.phase === 'done') stepOutro(s, dt)
  else s.bag.obj.rotation.y = s.rot
  s.bag.step(dt, s.vRot)
  s.fx.update(dt)
}

/* ---------- Fini : la petite fille part à l'école ---------- */

/** Sa taille ; où va le cartable sur son dos (hauteur, recul) ; sa taille une fois porté. */
const DOLL = 1.2, BACK = [0.42 * DOLL, -0.22 * DOLL], WORN = 0.3 * DOLL

function startOutro(s: State) {
  if (s.phase !== 'make') return
  s.openWant = 0
  snap(s)
  save(s)
  s.phase = 'outro'
  ctx.root.querySelector('.ct-wrap')?.setAttribute('data-phase', 'outro')
  for (const it of s.items) it.g.visible = false
  const doll = makeDoll(s.T, familyDoll(useFerme.getState()), DOLL)
  doll.obj.position.set(2.6, 0, 0.35)
  doll.obj.rotation.y = -Math.PI / 2
  doll.obj.traverse(o => { o.castShadow = true })
  s.stage.scene.add(doll.obj)
  s.outro = { doll, t: 0, worn: false }
  sfx('confirm', { vol: 0.5 })
}
function stepOutro(s: State, dt: number) {
  const o = s.outro
  if (!o) return
  o.t += dt
  const d = o.doll, t = o.t
  const T = s.T
  if (t < 1.5) {
    // Elle arrive en marchant, jusqu'à côté du cartable
    d.obj.position.x = 2.6 - (2.6 - 0.95) * ease(t / 1.5)
    poseDoll(d, 'walk', t, dt)
    s.bag.obj.rotation.y += (0 - s.bag.obj.rotation.y) * Math.min(1, dt * 4)
  } else if (t < 2.2) {
    // Elle se tourne ; le cartable saute sur son dos
    poseDoll(d, 'idle', t, dt)
    d.obj.rotation.y += (Math.PI - 0.5 - d.obj.rotation.y) * Math.min(1, dt * 6)
    if (!o.worn) {
      o.worn = true
      sfx('whoosh', { vol: 0.5 })
    }
    const k = ease((t - 1.5) / 0.7)
    const back = d.obj.localToWorld(new T.Vector3(0, BACK[0], BACK[1]))
    const from = new T.Vector3(BAG_X, s.bag.H / 2 + (s.look.model === 'roulettes' ? 0.11 : 0), 0)
    s.bag.obj.position.lerpVectors(from, back, k)
    s.bag.obj.position.y += Math.sin(k * Math.PI) * 0.5
    s.bag.obj.scale.setScalar(1 - (1 - WORN) * k)
    s.bag.obj.rotation.y = d.obj.rotation.y + Math.PI * k
  } else {
    // Sur son dos ; elle saute de joie, puis part à l'école
    if (s.bag.obj.parent !== d.rig) {
      d.rig.add(s.bag.obj)
      s.bag.obj.position.set(0, BACK[0], BACK[1])
      s.bag.obj.rotation.set(0, Math.PI, 0)
      s.bag.obj.scale.setScalar(WORN)
      sfx('pluck', { vol: 0.6, rate: 1.2 })
    }
    if (t < 3.3) poseDoll(d, 'cheer', t, dt)
    else {
      d.obj.rotation.y += (-Math.PI / 2 - 0.3 - d.obj.rotation.y) * Math.min(1, dt * 5)
      d.obj.position.x -= dt * 1.3
      d.obj.position.z -= dt * 0.25
      poseDoll(d, 'walk', t, dt)
    }
    if (t > 5.4 && s.phase === 'outro') endGame(s)
  }
}
function endGame(s: State) {
  if (s.phase === 'done') return
  s.phase = 'done'
  ctx.finish({ title: 'Prête pour l’école !', msg: 'Ton cartable est tout beau', stars: 3 })
}

/* ---------- La scène ---------- */

async function build(c: GameContext, arena: HTMLElement, saved: Saved): Promise<State | null> {
  const stage = await createStage(arena, {
    sky: '#F6E3D6', fov: 30, cam: CAMS.make.p, target: CAMS.make.t,
    hemi: ['#FFF4E6', '#C8A88E', 0.9], sun: { pos: [2.6, 5.5, 4.2], color: '#FFF1DC', intensity: 2.4, area: 3, far: 20 },
    fill: 0.55, exposure: 1.0
  })
  if (!c.alive()) { stage.dispose(); return null }
  const T = stage.T
  classroom(stage)
  const kit = await bagKit(T)
  if (!c.alive() || !stage.alive) { kit.dispose(); stage.dispose(); return null }
  const look: BagLook = { ...saved.look, patches: [...saved.look.patches], badges: [...saved.look.badges], charms: [...saved.look.charms] }
  const bag = await kit.build(look)
  if (!c.alive() || !stage.alive) { bag.dispose(); kit.dispose(); stage.dispose(); return null }
  if (bag.sequins && saved.seq) { bag.sequins.setBits(saved.seq); bag.sequins.snap() }
  // Les affaires, sur le pupitre devant le cartable
  const spots: [number, number, number][] = [[-0.85, 0.78, 0.3], [-0.42, 1.0, -0.2], [0.1, 1.08, 0.15], [0.64, 1.02, -0.25], [1.07, 0.86, 0], [1.42, 0.68, 0]]
  const items: Item[] = ITEMS.map((id, i) => {
    const g = makeItem(T, stage, id)
    const [x, z, ry] = spots[i]
    g.position.set(x, 0, z); g.rotation.y = ry
    // Sur le pupitre seulement pour Remplir : sinon, elles encombrent le premier plan
    g.visible = false
    stage.scene.add(g)
    g.updateMatrixWorld(true)
    const c2 = new T.Box3().setFromObject(g).getCenter(new T.Vector3())
    return { id, g, home: g.position.clone(), t: 0, packed: false, pop: 1, c: c2 }
  })
  const s: State = {
    stage, T, kit, bag, look, seq: saved.seq ?? null, step: 'modele', color: COLORS[0][0], pick: null,
    rot: -0.32, vRot: 0, building: false, again: false, openK: 0, openWant: 0, items, squash: 0,
    phase: 'make', outro: null, fx: particles(stage, 300), ray: new T.Raycaster(),
    cam: { p: new T.Vector3(...CAMS.make.p), t: new T.Vector3(...CAMS.make.t) }, t: 0
  }
  placeBag(s, bag)
  return s
}

/* ---------- Les vignettes (rendues une fois, en 3D) ---------- */

async function renderThumbs(px: number) {
  if (Object.keys(thumbs).length) return
  await withRenderer(px, px, async (T2, r, env) => {
    const k2 = await bagKit(T2)
    /** Une vignette ; `soft` : une lumière plus douce (le vernis des badges, le fil des écussons pâlissaient). */
    const shot = (o: import('three').Object3D, dir = new T2.Vector3(0.35, 0.3, 1), soft = false) => {
      const sc = new T2.Scene(); sc.environment = env; sc.environmentIntensity = soft ? 0.32 : 0.7
      sc.add(new T2.HemisphereLight('#FFF4E6', '#C8A88E', soft ? 0.35 : 0.5))
      const sun = new T2.DirectionalLight('#FFF1DC', soft ? 1.15 : 1.8); sun.position.set(-1.5, 3, 3); sc.add(sun)
      sc.add(o)
      const box = new T2.Box3().setFromObject(o), c = box.getCenter(new T2.Vector3()), rad = box.getSize(new T2.Vector3()).length() / 2
      const cam = new T2.PerspectiveCamera(30, 1, 0.01, 50)
      cam.position.copy(c).addScaledVector(dir.normalize(), rad / Math.sin(15 * Math.PI / 180) * 0.85); cam.lookAt(c)
      r.render(sc, cam)
      return r.domElement.toDataURL('image/png')
    }
    const base: BagLook = { ...defaultLook('joyce'), flap: '#F27BAA', body: '#F6A9C6' }
    for (const [m] of MODELS) { const b = await k2.build({ ...base, model: m }); thumbs['m-' + m] = shot(b.obj, new T2.Vector3(-0.45, 0.25, 1)); b.dispose() }
    const FCOL: Record<BagFabric, string> = { toile: '#7FC4E8', verni: '#E8456B', jean: '#4A6CA8', paillettes: '#F27BAA', peluche: '#C9B3F2', holo: '#DCD6F7' }
    for (const [f] of FABRICS) {
      const b = await k2.build({ ...base, fabric: f, body: FCOL[f], flap: FCOL[f], straps: FCOL[f] })
      if (b.sequins) { for (let i = 0; i < b.sequins.count; i++) if (b.sequins.pos[i * 3] > 0.05) b.sequins.want[i] = 1; b.sequins.snap() }
      thumbs['f-' + f] = shot(b.obj, new T2.Vector3(0.45, 0.35, 1)); b.dispose()
    }
    for (const [p] of PATCHES) thumbs['p-' + p] = shot(k2.patch(p, 1), new T2.Vector3(0, -0.3, 1), true)
    for (const [b, , col] of BADGES) { const o = k2.badge(b, col); o.scale.setScalar(13); thumbs['b-' + b] = shot(o, new T2.Vector3(0.15, 0.1, 1), true) }
    thumbs['c-pompon'] = shot(await k2.charm('pompon', new T2.MeshStandardMaterial({ color: '#E2B85C', metalness: 0.75, roughness: 0.3 })), new T2.Vector3(0.2, 0, 1))
    for (const [m] of MOTIFS) thumbs['o-' + m] = k2.motifSwatch('#DCD3F5', m, '#B197FC', px)
    k2.dispose()
  }).catch(() => { /* sans vignettes : des pastilles */ })
  const crit = await critterPortraits(['pig', 'chick', 'cat'], px).catch(() => ({} as Record<string, string>))
  for (const [k, v] of Object.entries(crit)) thumbs['c-' + k] = v
}

/* ---------- Les icônes ---------- */

const svg = (inner: string, sz = 34) => `<svg viewBox="0 0 48 48" width="${sz}" height="${sz}">${inner}</svg>`
const STEP_ICON: Record<Step, string> = {
  modele: svg('<path d="M24 6c-5 0-7 3-7 6h3c0-2 1.5-3 4-3s4 1 4 3h3c0-3-2-6-7-6z" fill="#8A5A3C"/><rect x="7" y="12" width="34" height="28" rx="6" fill="#F27BAA"/><path d="M7 18c0-3.3 2.7-6 6-6h22c3.3 0 6 2.7 6 6v8c0 3-2 5-5 5H12c-3 0-5-2-5-5z" fill="#E2558F"/><rect x="14" y="27" width="6" height="7" rx="1.5" fill="#F2C14E"/><rect x="28" y="27" width="6" height="7" rx="1.5" fill="#F2C14E"/>'),
  matiere: svg('<path d="M8 10h32v24l-4 4-4-4-4 4-4-4-4 4-4-4-4 4-4-4z" fill="#9FC8F0"/>' + Array.from({ length: 12 }, (_, i) => `<circle cx="${13 + (i % 4) * 7.5 + (Math.floor(i / 4) % 2) * 3.5}" cy="${15 + Math.floor(i / 4) * 6.5}" r="2.8" fill="#FFFFFF" opacity=".85"/>`).join('')),
  couleurs: svg('<path d="M24 6C13 6 5 13.5 5 23c0 8 6 14 13 14 3 0 4-1.6 4-3.6 0-2.4 1.8-4 4.2-4H31c6.6 0 12-4.4 12-11C43 11 34.5 6 24 6z" fill="#F6D49B"/><circle cx="15" cy="20" r="3.6" fill="#E8456B"/><circle cx="22" cy="13" r="3.6" fill="#4A9BE0"/><circle cx="31" cy="14" r="3.6" fill="#5BBE6A"/><circle cx="36" cy="21" r="3.6" fill="#F7D046"/>'),
  motifs: svg('<rect x="7" y="7" width="34" height="34" rx="7" fill="#C3A6F5"/><path d="M16 12l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6zM33 26l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z" fill="#FFF3B0"/><circle cx="33" cy="15" r="3" fill="#fff"/><circle cx="16" cy="32" r="3" fill="#fff"/>'),
  deco: svg('<path d="M24 41C10 31 7 24 9 18c2-6 10-8 15-2 5-6 13-4 15 2 2 6-1 13-15 23z" fill="#FF6B81" stroke="#C93F5A" stroke-width="2.4" stroke-dasharray="3 2"/><circle cx="36" cy="12" r="7" fill="#FFC94D" stroke="#C9CED6" stroke-width="2"/>'),
  remplir: svg('<rect x="8" y="14" width="20" height="26" rx="2.5" fill="#4FB8E7"/><rect x="11" y="18" width="14" height="3" rx="1.5" fill="#fff" opacity=".8"/><path d="M33 8l6 6-14 22-7 2 1-7z" fill="#FFC94D"/><path d="M18 31l7 5-7 2z" fill="#F4D6B0"/><path d="M33 8l6 6 2-3-6-6z" fill="#FF8FAB"/>')
}
const FINI_ICON = svg('<circle cx="24" cy="24" r="18" fill="#5EC97B"/><path d="m15 24.5 6 6L33.5 18" fill="none" stroke="#fff" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>')
const girl = (color: string, sz = 40) => svg(`<path d="M11 45c1-8 6-11 13-11s12 3 13 11z" fill="${color}"/><circle cx="24" cy="22" r="11" fill="#FFD9B8"/><path d="M12.5 22c0-9 5-14 11.5-14S35.5 13 35.5 22c-3-5-6.5-7-11.5-7s-8.5 2-11.5 7z" fill="#6B3E26"/><circle cx="10" cy="21" r="4.5" fill="#6B3E26"/><circle cx="38" cy="21" r="4.5" fill="#6B3E26"/><circle cx="20" cy="23.5" r="1.5" fill="#45362A"/><circle cx="28" cy="23.5" r="1.5" fill="#45362A"/><path d="M21 28c2 1.5 4 1.5 6 0" fill="none" stroke="#C0605A" stroke-width="1.5" stroke-linecap="round"/>`, sz)

/* ---------- Le jeu ---------- */

/** Où caresser les paillettes (la main, le bot) : deux points du rabat, de bas en haut. */
function strokePath(s: State) {
  const sq = s.bag.sequins
  if (!sq) return null
  const D = s.bag.D, H = s.bag.H
  return [screenOf(s, -0.22, -0.05 * H, D / 2 + 0.03), screenOf(s, 0.2, 0.18 * H, D / 2 + 0.03)]
}

export const cartable: GameDef = {
  id: 'cartable', name: 'Mon cartable', icon: '🎒', sq: 'sq-sky', cat: 'creatif', noTier: true,
  subtitle: 'Fais-toi le plus beau cartable de l’école',
  // La main : choisir son cartable ; puis selon l'étape, choisir dans la palette, caresser les paillettes, toucher le cartable, une affaire à ranger
  hand: (root): HandMove | null => {
    if (root.querySelector('.ct-wrap[data-who=""]')) return { choose: visible(root, '.ct-card') }
    const s = me
    if (!s || s.phase !== 'make' || s.building) return null
    if (s.step === 'matiere' && s.look.fabric === 'paillettes') { const p = strokePath(s); if (p) return { drag: [p[0], p[1]] } }
    if (s.step === 'couleurs') return { tap: screenOf(s, 0, -0.38 * s.bag.H, s.bag.D / 2) }
    if (s.step === 'deco' && s.pick) return { tap: screenOf(s, 0.1, 0.05, s.bag.D / 2 + 0.03) }
    if (s.step === 'remplir') { const it = s.items.find(i => !i.packed && i.t === 0); return it && s.openK > 0.6 ? { tap: worldScreen(s, it.c) } : null }
    return { choose: visible(root, '.ct-opt').slice(0, 4) }
  },
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="arena g3-arena ct-wrap" id="ctWrap" data-who="" data-step="modele">
        <div class="ct-who">${WHO.map(w => `
          <span class="tool-item"><button class="ct-card" data-who="${w.id}" aria-label="${w.name}" style="--c:${w.color}"><span class="ct-photo"></span></button><b class="ct-card-name">${girl(w.color, 44)}${w.name}</b></span>`).join('')}
        </div>
        <div class="ct-steps">${STEPS.map(st => `<span class="tool-item"><button class="sn-tool ct-step${st === 'modele' ? ' sel' : ''}" data-step="${st}" aria-label="${STEP_NAME[st]}">${STEP_ICON[st]}</button><i class="tool-cap">${STEP_NAME[st]}</i></span>`).join('')}<span class="tool-item"><button class="sn-tool ct-fini" id="ctFini" aria-label="Fini">${FINI_ICON}</button><i class="tool-cap">Fini</i></span></div>
        <span class="tool-item ct-me"><button class="sn-tool" id="ctMe" aria-label="Changer de cartable"></button><i class="tool-cap" id="ctMeCap"></i></span>
        <div class="ct-pal" id="ctPal"></div>
      </div>`
    const arena = c.root.querySelector<HTMLElement>('#ctWrap')!
    preloadSfx(['pluck', 'cloth', 'select', 'confirm', 'drop', 'whoosh', 'metal', 'open'])

    const opt = (attrs: string, icon: string, cap: string, sel: boolean, big = false) =>
      `<span class="tool-item"><button class="sn-tool ct-opt${big ? ' big' : ''}${sel ? ' sel' : ''}" ${attrs} aria-label="${cap}">${icon}</button><i class="tool-cap">${cap}</i></span>`
    const img = (id: string, fallback: string) => thumbs[id] ? `<img src="${thumbs[id]}" alt="" draggable="false">` : fallback
    const dot = (col: string, extra = '') => `<span class="ct-dot" style="background:${col}${extra}"></span>`
    const sep = '<i class="ct-sep"></i>'
    const showPal = () => {
      const s = me
      const pal = c.root.querySelector<HTMLElement>('#ctPal')!
      if (!s) { pal.innerHTML = ''; return }
      const L = s.look
      if (s.step === 'modele') pal.innerHTML = MODELS.map(([m, n]) => opt(`data-model="${m}"`, img('m-' + m, dot('#F27BAA')), n, L.model === m, true)).join('')
      else if (s.step === 'matiere') pal.innerHTML = FABRICS.map(([f, n]) => opt(`data-fabric="${f}"`, img('f-' + f, dot('#9FC8F0')), n, L.fabric === f, true)).join('')
      else if (s.step === 'couleurs') pal.innerHTML = COLORS.map(([col, n]) => opt(`data-color="${col}"`, dot(col), n, s.color === col)).join('') + sep +
        METALS.map(([m, n, col]) => opt(`data-metal="${m}"`, dot(`radial-gradient(circle at 35% 30%,#fff,${col} 55%,${col})`), n, L.metal === m)).join('')
      else if (s.step === 'motifs') pal.innerHTML = MOTIFS.map(([m, n]) => opt(`data-motif="${m}"`, img('o-' + m, dot('#DCD3F5')), n, L.motif === m, true)).join('') + sep +
        MOTIF_COLORS.map(([col, n]) => opt(`data-mcolor="${col}"`, dot(col), n, L.motifColor === col)).join('')
      else if (s.step === 'deco') pal.innerHTML = PATCHES.map(([p, n]) => opt(`data-patch="${p}"`, img('p-' + p, dot('#FF6B81')), n, s.pick?.type === 'patch' && s.pick.id === p, true)).join('') + sep +
        BADGES.map(([b, n, col]) => opt(`data-badge="${b}"`, img('b-' + b, dot(col)), n, s.pick?.type === 'badge' && s.pick.id === b, true)).join('') + sep +
        CHARMS.map(([ch, n]) => opt(`data-charm="${ch}"`, img('c-' + ch, dot('#FFD34D')), n, L.charms.includes(ch), true)).join('')
      else pal.innerHTML = ''
      arena.setAttribute('data-pal', pal.innerHTML ? '1' : '0')
      pal.setAttribute('data-step', s.step)
    }
    const setStep = (st: Step) => {
      const s = me
      if (!s || s.phase !== 'make') return
      s.step = st
      arena.setAttribute('data-step', st)
      c.root.querySelectorAll<HTMLElement>('.ct-step').forEach(b => b.classList.toggle('sel', b.dataset.step === st))
      // Remplir : il s'ouvre, les affaires reviennent sur le pupitre ; sinon il se referme
      if (st === 'remplir') {
        s.openWant = 1
        sfx('open', { vol: 0.5 })
        for (const it of s.items) { it.packed = false; it.t = 0; it.g.visible = true; it.g.position.copy(it.home); it.g.scale.setScalar(1); it.g.rotation.x = 0; it.pop = 0 }
        ctx.after(700, () => { if (me === s && s.step === 'remplir') handNow() })
      } else {
        s.openWant = 0
        for (const it of s.items) it.g.visible = false
      }
      if (st !== 'deco') s.pick = null
      showPal()
      // Les paillettes : un geste nouveau (caresser), la main le montre tout de suite
      if (st === 'matiere' && s.look.fabric === 'paillettes') handNow()
    }

    /* Les deux cartes : la photo de chaque cartable, la dernière bordée */
    const showCards = () => {
      let last: string | null = null
      try { last = localStorage.getItem(WHO_KEY) } catch { /* rien */ }
      for (const w of WHO) {
        const b = c.root.querySelector<HTMLElement>(`.ct-card[data-who="${w.id}"]`)
        if (!b) continue
        b.classList.toggle('last', w.id === last)
        let src: string | null = null
        try { src = localStorage.getItem(PHOTO(w.id)) } catch { /* rien */ }
        b.querySelector('.ct-photo')!.innerHTML = src ? `<img src="${src}" alt="" draggable="false">` : `<span class="ct-empty">${BADGE.cartable || ''}</span>`
      }
    }
    showCards()
    let hideLoader = () => { /* les cartes d'abord */ }
    let starting = false
    const choose = async (w: Who) => {
      if (me || starting) return
      starting = true
      who = w
      try { localStorage.setItem(WHO_KEY, w) } catch { /* rien */ }
      arena.setAttribute('data-who', w)
      const me0 = WHO.find(x => x.id === w)!
      c.root.querySelector('#ctMe')!.innerHTML = girl(me0.color)
      c.root.querySelector('#ctMeCap')!.textContent = me0.name
      sfx('confirm', { vol: 0.5 })
      hideLoader = loader(arena, 'cartable')
      const s = await build(c, arena, load(w)).catch(() => null)
      starting = false
      hideLoader()
      if (!s || dead) { if (s) { s.bag.dispose(); s.kit.dispose(); s.stage.dispose() } else if (!dead) c.toast('La 3D n\'est pas disponible ici'); return }
      me = s
      setStep('modele')
      s.stage.start(dt => { if (me === s) frame(s, dt) })
      // Les vignettes (un second contexte 3D) : pas pour les bots, ils voient des pastilles
      if (!(window as unknown as { __BOT?: boolean }).__BOT) renderThumbs(96).then(() => { if (!dead) showPal() })
    }
    /** On quitte son cartable (pour l'autre, ou pour sortir) : gardé, photographié. */
    const leave = (s: State) => {
      if (s.phase === 'make') { s.bag.open(0); snap(s) }
      save(s)
      clearTimeout(saveTimer)
      try { localStorage.setItem(KEY(who), JSON.stringify({ v: 1, look: s.look, ...(s.seq ? { seq: s.seq } : {}) })) } catch { /* plein */ }
      me = null
      s.outro?.doll.dispose()
      s.bag.dispose(); s.kit.dispose()
      try { s.stage.dispose() } catch { /* déjà démonté */ }
    }

    // Les boutons
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      const card = t.closest<HTMLElement>('.ct-card')
      if (card?.dataset.who) { choose(card.dataset.who as Who); return }
      const s = me
      if (!s) return
      if (t.closest('#ctMe')) {
        if (s.phase !== 'make') return
        leave(s)
        arena.setAttribute('data-who', '')
        showCards()
        sfx('select', { vol: 0.4 })
        return
      }
      if (t.closest('#ctFini')) { startOutro(s); return }
      const stepB = t.closest<HTMLElement>('.ct-step')
      if (stepB?.dataset.step) { setStep(stepB.dataset.step as Step); sfx('select', { vol: 0.5 }); return }
      const o = t.closest<HTMLElement>('.ct-opt')
      if (!o || s.phase !== 'make') return
      const d = o.dataset, L = s.look
      let changed = true
      if (d.model) { L.model = d.model as BagModel; sfx('cloth', { vol: 0.6 }) }
      else if (d.fabric) { L.fabric = d.fabric as BagFabric; if (L.fabric === 'paillettes') handNow() }
      else if (d.color) { s.color = d.color; changed = false }
      else if (d.metal) L.metal = d.metal as BagLook['metal']
      else if (d.motif) L.motif = d.motif as Motif
      else if (d.mcolor) { L.motifColor = d.mcolor; if (L.motif === 'uni') L.motif = 'pois' }
      else if (d.patch) { s.pick = s.pick?.id === d.patch && s.pick.type === 'patch' ? null : { type: 'patch', id: d.patch }; changed = false; if (s.pick) handNow() }
      else if (d.badge) { s.pick = s.pick?.id === d.badge && s.pick.type === 'badge' ? null : { type: 'badge', id: d.badge }; changed = false; if (s.pick) handNow() }
      else if (d.charm) {
        const ch = d.charm as CharmKind, i = L.charms.indexOf(ch)
        if (i >= 0) L.charms.splice(i, 1)
        else { L.charms.push(ch); if (L.charms.length > MAX_CHARMS) L.charms.shift() }
        s.vRot += 1.2
      } else changed = false
      sfx('select', { vol: 0.4 })
      if (changed) rebuild(s)
      showPal()
    }
    c.root.addEventListener('click', onClick)

    // Le doigt sur la scène : caresser les paillettes, toucher, ou faire tourner le cartable
    const pts = new Map<number, { x: number; y: number; moved: number; stroke: boolean; flips: number }>()
    let lastT = 0, lastFlipSound = 0
    const canStroke = (s: State) => s.look.fabric === 'paillettes' && !!s.bag.sequins && s.step !== 'remplir' && s.openK < 0.05
    const onDown = (e: PointerEvent) => {
      const s = me
      if (!s || e.target !== s.stage.renderer.domElement || s.phase !== 'make') {
        if (s && s.phase === 'outro' && e.target === s.stage.renderer.domElement) endGame(s)
        return
      }
      const h = canStroke(s) ? hitBag(s, e.clientX, e.clientY) : null
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: 0, stroke: !!h && (h.part === 'paillettes' || h.part === 'rabat'), flips: 0 })
      lastT = performance.now()
      s.vRot = 0
    }
    const onMove = (e: PointerEvent) => {
      const s = me
      const p = pts.get(e.pointerId)
      if (!s || !p) return
      const dx = e.clientX - p.x, dy = e.clientY - p.y
      p.moved += Math.abs(dx) + Math.abs(dy)
      if (p.stroke) {
        // Caresser : vers le haut, elles se retournent ; vers le bas, elles reviennent
        if (Math.abs(dy) < 2 && Math.abs(dx) < 2) return
        p.x = e.clientX; p.y = e.clientY
        const h = hitBag(s, e.clientX, e.clientY)
        if (!h || !s.bag.sequins) return
        const w: 0 | 1 = dy < 0 ? 1 : dy > 0 ? 0 : (s.bag.sequins.faceAt(h.local) ? 1 : 0)
        const n = s.bag.sequins.stroke(h.local, 0.05, w)
        if (n) {
          p.flips += n
          const now = performance.now()
          if (now - lastFlipSound > 70) { lastFlipSound = now; sfx('pluck', { vol: 0.25, rate: 1.6 + Math.random() * 0.6 }) }
          sparkle(s, s.bag.obj.localToWorld(h.local.clone()), [w ? s.look.sequinB : s.look.flap, '#FFFFFF'], 3)
        }
        return
      }
      p.x = e.clientX; p.y = e.clientY
      if (pts.size > 1) return
      const now = performance.now(), dts = Math.max(8, now - lastT) / 1000
      lastT = now
      const k = 1 / Math.max(120, s.stage.renderer.domElement.clientWidth * 0.35)
      s.rot += dx * k
      s.vRot = Math.max(-4, Math.min(4, s.vRot * 0.5 + dx * k / dts * 0.5))
    }
    const onUp = (e: PointerEvent) => {
      const s = me
      const p = pts.get(e.pointerId)
      pts.delete(e.pointerId)
      if (!s || !p || s.phase !== 'make') return
      if (p.stroke && p.flips) { save(s); return }
      if (performance.now() - lastT > 90) s.vRot = 0
      if (e.type === 'pointercancel' || p.moved >= 12) return
      // Un toucher
      if (s.step === 'remplir') {
        const el = s.stage.renderer.domElement, r = el.getBoundingClientRect()
        s.ray.setFromCamera(new s.T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), s.stage.camera)
        const left = s.items.filter(i => !i.packed && i.t === 0)
        const hit = s.ray.intersectObjects(left.map(i => i.g), true)[0]
        let o: import('three').Object3D | null = hit?.object ?? null
        while (o && !o.userData.item) o = o.parent
        // Manquée de peu (la règle est fine) : la plus proche à l'écran
        let it = o ? s.items.find(i => i.g === o) : undefined
        if (!it) {
          let bd = 0.12 * Math.min(r.width, r.height)
          for (const i of left) { const q = worldScreen(s, i.c), d = Math.hypot(q.x - e.clientX, q.y - e.clientY); if (d < bd) { bd = d; it = i } }
        }
        if (it) pack(s, it)
        return
      }
      const h = hitBag(s, e.clientX, e.clientY)
      if (!h) return
      if (s.step === 'couleurs') paint(s, h)
      else if (s.step === 'deco') decorate(s, h)
      else if (s.step === 'matiere' && h.part === 'paillettes' && s.bag.sequins) {
        // Un toucher sur les paillettes : celles-là se retournent
        const w: 0 | 1 = s.bag.sequins.faceAt(h.local) ? 0 : 1
        if (s.bag.sequins.stroke(h.local, 0.06, w)) { sfx('pluck', { vol: 0.4, rate: 1.7 }); save(s) }
      }
    }
    c.root.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __ct: unknown }).__ct = {
        get cards() { return arena.getAttribute('data-who') === '' },
        get ready() { return !!me && !me.building },
        get who() { return who },
        get step() { return me?.step },
        get phase() { return me?.phase },
        get look() { return me ? JSON.parse(JSON.stringify(me.look)) : null },
        /** Les paillettes retournées (face B). */
        get flipped() { const sq = me?.bag.sequins; return sq ? sq.want.reduce((n, v) => n + v, 0) : null },
        get packed() { return me ? me.items.filter(i => i.packed).length : 0 },
        get open() { return me?.openK ?? 0 },
        get outroT() { return me?.outro?.t ?? 0 },
        /** Un point du cartable (son repère) à l'écran. */
        pt(x: number, y: number, z?: number) { return me ? screenOf(me, x, y, z ?? me.bag.D / 2 + 0.03) : null },
        get size() { return me ? { W: me.bag.W, H: me.bag.H, D: me.bag.D } : null },
        stroke() { return me ? strokePath(me) : null },
        /** Une affaire à ranger, à l'écran. */
        item() { const s = me; const it = s?.items.find(i => !i.packed && i.t === 0); return s && it ? worldScreen(s, it.c) : null },
        speed(k: number) { if (me) me.stage.timeScale = k },
        /** L'affiche : un cartable à paillettes, un cœur dessiné dedans, un cochon porte-clés. */
        async demo() {
          const s = me
          if (!s) return
          Object.assign(s.look, { model: 'rabat', fabric: 'paillettes', body: '#F6A9C6', flap: '#F0629B', straps: '#FFFFFF', metal: 'or', motif: 'uni', sequinB: '#E9EDF3', patches: [], badges: [], charms: ['pig', 'pompon'] })
          s.seq = null
          await rebuild(s)
          const sq = s.bag.sequins
          if (sq) {
            for (let i = 0; i < sq.count; i++) {
              const u = sq.pos[i * 3] / 0.21, v = (sq.pos[i * 3 + 1] - 0.07) / 0.19
              sq.want[i] = Math.pow(u * u + v * v - 1, 3) - u * u * Math.pow(v, 3) < 0 ? 1 : 0
            }
            sq.snap()
          }
          s.rot = -0.32; s.vRot = 0
        },
        bits() { return me?.bag.sequins ? packBits(me.bag.sequins.want) : null }
      }
    }

    return () => {
      if (dead) return
      dead = true
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
