import type { Stage, T3 } from './three3d'
import { bumpyNormal, dotTex } from './three3d'
import { planks } from './barn3d'
import type { CritterKind } from './critters'

/* 🏡 La ferme en diorama — née avec Cache-Cache (1/10) : un plateau rond
   d'herbe posé dans le ciel comme une petite île, qu'on fait TOURNER au
   doigt, avec tout ce qu'une ferme a pour se cacher : la grange rouge à
   porte d'écurie et sa lucarne, la meule de foin et sa fourche, les bottes,
   le grand pommier, le puits, la charrette de foin, le tracteur et son
   godet, la niche, le poulailler, les tonneaux, le tas de bois, la mare et
   ses roseaux, la flaque de boue, le potager et ses terriers, les buissons.
   Au milieu, la cour en terre battue et l'enclos rond où se rangent les
   animaux trouvés. La nuit : étoiles, lune, lucioles, lanternes.

   Tout est construit ici, en formes arrondies et textures peintes au canvas
   (« jamais deux styles » : les animaux ronds de core/critters.ts y vivent ;
   pas de modèle Kenney vu de près). Pour une tablette moyenne : géométries
   partagées, instances pour ce qui se répète (piquets, bûches, fleurs,
   roseaux, touffes, pommes), couleurs sombres que l'éclairage remonte.

   Chaque cachette déclare ses PLACES (`FarmSlot`), dans son propre repère
   (+z regarde le centre de la ferme) :
   - 'top'  : l'animal dépasse d'un rebord, d'une surface de foin, d'eau ou
              de terre — tout ce qui est sous `rim` est caché ;
   - 'face' : la tête passe par une ouverture (`out`, plan à `plane`) ;
   - 'rear' : les fesses et la queue dépassent de l'ouverture ;
   - 'tree' : dans le feuillage, seule la queue pend dessous (`rim` = le bas
              du feuillage).
   `side` : on ne la voit que d'un côté de la ferme (il faut tourner).
   Le jeu (games/hideseek.ts) y pose ses animaux. */

type Mesh = import('three').Mesh
type Group = import('three').Group
type Geo = import('three').BufferGeometry
type Mat = import('three').Material
type Std = import('three').MeshStandardMaterial
type BGU = typeof import('three/examples/jsm/utils/BufferGeometryUtils.js')
type RBox = typeof import('three/examples/jsm/geometries/RoundedBoxGeometry.js')['RoundedBoxGeometry']

export type Size = 's' | 'm' | 'l'
export type Matter = 'foin' | 'bois' | 'pierre' | 'feuilles' | 'eau' | 'boue' | 'metal' | 'terre'

export interface FarmSlot {
  id: string
  type: 'top' | 'face' | 'rear' | 'tree'
  /** Les pieds de l'animal (repère de la cachette), avant réglage de la hauteur. */
  at: [number, number, number]
  /** top / tree : la surface qui cache. */
  rim?: number
  /** face / rear : l'ouverture regarde vers `out` (horizontal, unitaire)… */
  out?: [number, number]
  /** … et son plan est à `plane` de `at` le long de `out`. */
  plane?: number
  /** face / rear : le haut de l'ouverture. */
  open?: number
  /** L'animal ne descend pas plus bas (un plancher qu'on verrait). */
  floor?: number
  /** top : où regarde l'animal (0 = vers +z). */
  rot?: number
  /** Largeur utile : un animal plus large est réduit (jamais sous 0,74). */
  w: number
  sizes: Size[]
  only?: CritterKind[]
  side?: boolean
  /** Deux places du même groupe ne servent pas en même temps. */
  group?: string
}

export interface FarmSpot {
  id: string
  g: Group
  /** Ce qu'on touche de cette cachette (et qui cache). */
  occ: Mesh[]
  matter: Matter
  slots: FarmSlot[]
  /** Le point que la main montre (repère de la cachette). */
  aim: [number, number, number]
  /** Rayon au sol (pour semer fleurs et touffes autour). */
  foot: number
  /** Tremblement en cours (s) et sa force (une grange tremble moins qu'un buisson). */
  shake: number
  sway: number
}

export interface Farm {
  /** Le plateau qui tourne : tout ce qui est sur la ferme en est l'enfant. */
  root: Group
  spots: FarmSpot[]
  /** Tout ce qui cache la vue (toucher, visibilité). */
  occ: Mesh[]
  /** Le dessus du plateau (le doigt y promène la lampe). */
  top: Mesh
  /** Les places de l'enclos, au centre (repère du plateau). */
  pen: [number, number][]
  night: boolean
  /** La fête : les lanternes s'allument en grand (0..1). */
  party(k: number): void
  step(dt: number, t: number): void
  /** Une botte de foin de plus, du même foin (l'Animal qui répète s'y assoit). */
  bale(): Mesh
}

export const PLATEAU_R = 8

/* ---------- Peindre au canvas ---------- */
function paint(w: number, h = w) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return { c, g: c.getContext('2d')! }
}
function tex(T: T3, c: HTMLCanvasElement, rx = 1, ry = rx) {
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  t.wrapS = t.wrapT = T.RepeatWrapping
  t.repeat.set(rx, ry)
  t.anisotropy = 4
  return t
}
/** Dessine en se répétant sans couture (aux bords, on redessine de l'autre côté). */
function wrapDraw(W: number, H: number, x: number, y: number, r: number, f: (x: number, y: number) => void) {
  for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) {
    const X = x + dx, Y = y + dy
    if (X < -r || X > W + r || Y < -r || Y > H + r) continue
    f(X, Y)
  }
}

function grassTex(T: T3) {
  const S = 512
  const { c, g } = paint(S)
  g.fillStyle = '#4A8434'; g.fillRect(0, 0, S, S)
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 40 + Math.random() * 70
    const light = Math.random() < 0.5
    wrapDraw(S, S, x, y, r, (X, Y) => {
      const gr = g.createRadialGradient(X, Y, 0, X, Y, r)
      gr.addColorStop(0, light ? 'rgba(130,180,70,.22)' : 'rgba(35,70,25,.24)')
      gr.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = gr; g.fillRect(X - r, Y - r, r * 2, r * 2)
    })
  }
  const cols = ['#3B7228', '#5C9A3E', '#6CA847', '#427C2F', '#7DB552', '#35682A']
  g.lineCap = 'round'
  for (let i = 0; i < 6500; i++) {
    const x = Math.random() * S, y = Math.random() * S
    const len = 3 + Math.random() * 6, a = -Math.PI / 2 + (Math.random() - 0.5) * 0.9
    g.strokeStyle = cols[i % cols.length]; g.globalAlpha = 0.45 + Math.random() * 0.45; g.lineWidth = 1 + Math.random() * 1.2
    wrapDraw(S, S, x, y, 10, (X, Y) => { g.beginPath(); g.moveTo(X, Y); g.lineTo(X + Math.cos(a) * len, Y + Math.sin(a) * len); g.stroke() })
  }
  g.globalAlpha = 1
  return tex(T, c, 7)
}

/** La cour : un disque de terre battue aux bords fondus dans l'herbe. */
function yardTex(T: T3) {
  const S = 512
  const { c, g } = paint(S)
  g.fillStyle = '#7C5C40'; g.fillRect(0, 0, S, S)
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 20 + Math.random() * 60
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, Math.random() < 0.5 ? 'rgba(160,125,85,.25)' : 'rgba(70,48,30,.25)')
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 0.8 + Math.random() * 2.6
    g.fillStyle = ['#9A8068', '#5E4632', '#B09478', '#6E5A48'][i % 4]
    g.beginPath(); g.ellipse(x, y, r, r * 0.7, Math.random() * 3, 0, Math.PI * 2); g.fill()
  }
  // Des brins de paille tombés des charrettes
  g.lineWidth = 1.6
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * S, y = Math.random() * S, a = Math.random() * 6.28
    g.strokeStyle = 'rgba(214,176,90,.7)'
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12); g.stroke()
  }
  // Le bord se fond dans l'herbe
  g.globalCompositeOperation = 'destination-in'
  const gr = g.createRadialGradient(S / 2, S / 2, S * 0.36, S / 2, S / 2, S / 2)
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = gr; g.fillRect(0, 0, S, S)
  g.globalCompositeOperation = 'source-over'
  const t = tex(T, c, 1)
  t.wrapS = t.wrapT = T.ClampToEdgeWrapping
  return t
}

/** Le flanc du plateau : des couches de terre, des cailloux, des racines. */
function earthTex(T: T3) {
  const W = 512, H = 128
  const { c, g } = paint(W, H)
  const bands = ['#5E4128', '#6B4A2E', '#584026', '#6E5034', '#4E3622']
  let y = 0
  while (y < H) {
    const h = 10 + Math.random() * 22
    g.fillStyle = bands[Math.floor(Math.random() * bands.length)]
    g.fillRect(0, y, W, h + 1)
    y += h
  }
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * W, yy = 14 + Math.random() * (H - 14), r = 1.5 + Math.random() * 5
    wrapDraw(W, H, x, yy, r, (X, Y) => {
      g.fillStyle = ['#8A8478', '#6E6A62', '#9E968A'][i % 3]
      g.beginPath(); g.ellipse(X, Y, r, r * 0.7, 0, 0, Math.PI * 2); g.fill()
    })
  }
  g.strokeStyle = 'rgba(40,26,16,.6)'; g.lineWidth = 1.4
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * W
    g.beginPath(); g.moveTo(x, 8)
    g.bezierCurveTo(x + 8, 30, x - 10, 50, x + 4, 40 + Math.random() * 60); g.stroke()
  }
  // Le liseré d'herbe en haut
  g.fillStyle = '#3E7A2C'; g.fillRect(0, 0, W, 7)
  for (let x = 0; x < W; x += 3) { g.fillRect(x, 7, 2, 2 + Math.random() * 6) }
  const t = tex(T, c, 14, 1)
  t.wrapT = T.ClampToEdgeWrapping
  return t
}

function rockTex(T: T3) {
  const S = 256
  const { c, g } = paint(S)
  g.fillStyle = '#4E4438'; g.fillRect(0, 0, S, S)
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 6 + Math.random() * 18
    wrapDraw(S, S, x, y, r, (X, Y) => {
      g.fillStyle = ['#6A5E50', '#5A5044', '#776A5A', '#463C32'][i % 4]
      g.beginPath(); g.ellipse(X, Y, r, r * 0.6, Math.random(), 0, Math.PI * 2); g.fill()
    })
  }
  return tex(T, c, 8, 2)
}

/** Du foin : des brins dans tous les sens ; `twine` : les deux ficelles d'une botte. */
function hayTex(T: T3, twine = false) {
  const S = 256
  const { c, g } = paint(S)
  g.fillStyle = '#A9802F'; g.fillRect(0, 0, S, S)
  g.lineCap = 'round'
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * S, y = Math.random() * S, a = (Math.random() - 0.5) * 1.2 + (twine ? 0 : Math.random() * 3)
    g.strokeStyle = ['#D2A84E', '#8E6A24', '#E2C06C', '#9E7A2E', '#C49A40'][i % 5]
    g.lineWidth = 1 + Math.random() * 1.3
    const len = 14 + Math.random() * 18
    wrapDraw(S, S, x, y, len, (X, Y) => { g.beginPath(); g.moveTo(X, Y); g.lineTo(X + Math.cos(a) * len, Y + Math.sin(a) * len); g.stroke() })
  }
  if (twine) {
    g.fillStyle = '#5E3E1A'
    for (const x of [70, 180]) { g.fillRect(x, 0, 6, S); g.fillStyle = 'rgba(255,230,170,.25)'; g.fillRect(x + 1, 0, 2, S); g.fillStyle = '#5E3E1A' }
  }
  return tex(T, c, 1)
}

/** Les pierres du puits, en rangées décalées. */
function stoneTex(T: T3) {
  const W = 512, H = 256
  const { c, g } = paint(W, H)
  g.fillStyle = '#4A453E'; g.fillRect(0, 0, W, H)
  const rows = 6, rh = H / rows
  for (let r = 0; r < rows; r++) {
    let x = r % 2 ? -30 : 0
    while (x < W) {
      const w = 46 + Math.random() * 46
      const y = r * rh
      const shade = 0.78 + Math.random() * 0.3
      const base = [138, 130, 118].map(v => Math.round(v * shade))
      wrapDraw(W, H, x + w / 2, y + rh / 2, w, (X) => {
        const x0 = X - w / 2
        const gr = g.createLinearGradient(0, y, 0, y + rh)
        gr.addColorStop(0, `rgb(${base[0] + 18},${base[1] + 18},${base[2] + 16})`)
        gr.addColorStop(1, `rgb(${base[0] - 22},${base[1] - 22},${base[2] - 22})`)
        g.fillStyle = gr
        g.beginPath(); g.roundRect(x0 + 2, y + 2, w - 4, rh - 4, 9); g.fill()
      })
      x += w
    }
  }
  return tex(T, c, 3, 1)
}

/** Des tuiles en écailles, en rangées décalées (les rangées suivent `v`). */
function shingleTex(T: T3, base: [number, number, number]) {
  const S = 256
  const { c, g } = paint(S)
  g.fillStyle = `rgb(${base.map(v => v * 0.5).join(',')})`; g.fillRect(0, 0, S, S)
  const rows = 8, rh = S / rows, n = 6, tw = S / n
  for (let r = 0; r < rows; r++) {
    for (let k = -1; k <= n; k++) {
      const x = k * tw + (r % 2 ? tw / 2 : 0), y = r * rh
      const sh = 0.82 + Math.random() * 0.3
      g.fillStyle = `rgb(${base.map(v => Math.round(v * sh)).join(',')})`
      g.beginPath()
      g.moveTo(x + 1, y); g.lineTo(x + tw - 1, y); g.lineTo(x + tw - 1, y + rh * 0.6)
      g.quadraticCurveTo(x + tw / 2, y + rh * 1.25, x + 1, y + rh * 0.6); g.closePath(); g.fill()
      g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + 3, y + 2, tw - 6, 3)
    }
  }
  const t = tex(T, c, 1)
  t.center.set(0.5, 0.5)
  t.rotation = Math.PI / 2
  return t
}

function barkTex(T: T3) {
  const W = 128, H = 256
  const { c, g } = paint(W, H)
  g.fillStyle = '#4E3624'; g.fillRect(0, 0, W, H)
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * W
    g.strokeStyle = ['#2E1E12', '#6A4A32', '#3A281A'][i % 3]; g.lineWidth = 2 + Math.random() * 4
    g.beginPath(); g.moveTo(x, 0)
    for (let y = 0; y <= H; y += 32) g.lineTo(x + Math.sin(y * 0.05 + i) * 4, y)
    g.stroke()
  }
  return tex(T, c, 2, 1)
}

/** Le bout d'une bûche : écorce, cernes. */
function logEndTex(T: T3) {
  const S = 128
  const { c, g } = paint(S)
  g.fillStyle = '#3E2A1A'; g.fillRect(0, 0, S, S)
  g.fillStyle = '#B48A56'; g.beginPath(); g.arc(64, 64, 54, 0, 7); g.fill()
  g.strokeStyle = 'rgba(110,70,36,.7)'
  for (let r = 6; r < 52; r += 6 + Math.random() * 3) { g.lineWidth = 1.2 + Math.random(); g.beginPath(); g.arc(64 + Math.random() * 2, 64, r, 0, 7); g.stroke() }
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  return t
}

function soilTex(T: T3) {
  const S = 256
  const { c, g } = paint(S)
  g.fillStyle = '#3E2A1C'; g.fillRect(0, 0, S, S)
  for (let i = 0; i < 700; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 1 + Math.random() * 3
    g.fillStyle = ['#5A3E2A', '#2E1E14', '#6A4A34'][i % 3]
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
  }
  // Les sillons
  for (let y = 21; y < S; y += 43) {
    g.fillStyle = 'rgba(20,12,8,.55)'; g.fillRect(0, y, S, 7)
    g.fillStyle = 'rgba(120,90,60,.35)'; g.fillRect(0, y - 4, S, 3)
  }
  return tex(T, c, 1)
}

function skyTex(T: T3, top: string, mid: string, bottom: string) {
  const { c, g } = paint(2, 256)
  const gr = g.createLinearGradient(0, 0, 0, 256)
  gr.addColorStop(0, top); gr.addColorStop(0.55, mid); gr.addColorStop(1, bottom)
  g.fillStyle = gr; g.fillRect(0, 0, 2, 256)
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  return t
}

function cloudTex(T: T3) {
  const { c, g } = paint(256, 128)
  for (const [x, y, r] of [[70, 80, 40], [118, 62, 50], [168, 78, 40], [96, 92, 34], [148, 94, 36], [196, 92, 28], [48, 96, 26]]) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.7, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
  }
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  return t
}

function moonTex(T: T3) {
  const S = 256
  const { c, g } = paint(S)
  const gr = g.createRadialGradient(128, 128, 30, 128, 128, 128)
  gr.addColorStop(0, 'rgba(220,230,255,.5)'); gr.addColorStop(1, 'rgba(220,230,255,0)')
  g.fillStyle = gr; g.fillRect(0, 0, S, S)
  g.fillStyle = '#F2EEDC'; g.beginPath(); g.arc(128, 128, 44, 0, 7); g.fill()
  g.fillStyle = 'rgba(180,170,150,.45)'
  for (const [x, y, r] of [[114, 116, 9], [140, 138, 7], [124, 146, 5], [146, 112, 5], [108, 140, 4]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill() }
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  return t
}

/* ---------- La boîte à outils des constructions ---------- */
interface Kit {
  T: T3
  U: BGU
  RB: RBox
  M: ReturnType<typeof mats>
  box: Geo; sph: Geo; cyl: Geo
}

function mats(T: T3, stage: Stage) {
  const S = (o: import('three').MeshStandardMaterialParameters) => new T.MeshStandardMaterial(o)
  const k = <X extends { dispose(): void }>(x: X) => stage.keep(x)
  const red = planks(T, '#74221B', '#36100B', 14); red.repeat.set(0.5, 0.5)
  const redSide = red.clone(); redSide.repeat.set(1.25, 1); redSide.needsUpdate = true
  const redDoor = red.clone(); redDoor.repeat.set(1, 1); redDoor.needsUpdate = true
  const brown = planks(T, '#7A5634', '#3A2614', 10); brown.repeat.set(1, 1)
  const brownM = brown.clone(); brownM.repeat.set(0.9, 0.9); brownM.needsUpdate = true
  const tan = planks(T, '#8A6A40', '#4A3420', 9); tan.repeat.set(1.1, 1.1)
  const coopPl = planks(T, '#5E8A84', '#2E4A46', 9); coopPl.repeat.set(1.2, 1.2)
  const coopM = coopPl.clone(); coopM.repeat.set(0.9, 0.9); coopM.needsUpdate = true
  const kennelM = tan.clone(); kennelM.repeat.set(1, 1); kennelM.needsUpdate = true
  const hay = hayTex(T)
  const hayDome = hay.clone(); hayDome.repeat.set(5, 2.5); hayDome.needsUpdate = true
  const bale = hayTex(T, true)
  const tiles = shingleTex(T, [104, 52, 40])
  const shingles = (r: number) => { const t = tiles.clone(); t.repeat.set(r, r); t.needsUpdate = true; return t }
  const shingleBlue = shingleTex(T, [58, 70, 92]); shingleBlue.repeat.set(1.4, 1.4)
  stage.keep(tiles)
  const hayFloor = hay.clone(); hayFloor.repeat.set(4, 4); hayFloor.needsUpdate = true
  stage.keep(hayFloor)
  const leafN = bumpyNormal(T, 34, 3)
  const ripple = bumpyNormal(T, 10, 3)
  for (const t of [redSide, redDoor, brownM, coopM, kennelM, hayDome]) k(t)
  return {
    redWall: S({ map: red, roughness: 0.88 }),
    redSide: S({ map: redSide, roughness: 0.88 }),
    redDoor: S({ map: redDoor, roughness: 0.85 }),
    trim: S({ color: 0xB0A898, roughness: 0.8 }),
    dark: S({ color: 0x120C08, roughness: 1, side: T.DoubleSide }),
    roof: S({ map: k(shingles(3)), roughness: 0.8 }),
    roofS: S({ map: k(shingles(1.4)), roughness: 0.8 }),
    roofBlue: S({ map: k(shingleBlue), roughness: 0.8 }),
    roofEdge: S({ color: 0x3A2018, roughness: 0.85 }),
    wood: S({ map: brown, roughness: 0.82 }),
    woodM: S({ map: brownM, roughness: 0.82 }),
    woodDark: S({ color: 0x4A3020, roughness: 0.85 }),
    kennel: S({ map: tan, roughness: 0.85 }),
    kennelM: S({ map: kennelM, roughness: 0.85 }),
    coop: S({ map: coopPl, roughness: 0.85 }),
    coopM: S({ map: coopM, roughness: 0.85 }),
    hay: S({ map: hay, roughness: 1 }),
    hayFloor: S({ map: hayFloor, roughness: 1, color: 0xD8CCB0 }),
    hayDome: S({ map: hayDome, roughness: 1, color: 0xE8DCC0 }),
    hayDark: S({ map: hay, roughness: 1, color: 0x6A5A42 }),
    bale: S({ map: bale, roughness: 1 }),
    stone: S({ map: stoneTex(T), roughness: 0.92, side: T.DoubleSide }),
    stoneCap: S({ color: 0x6E685E, roughness: 0.9 }),
    leaf: S({ color: 0x5E9E3E, vertexColors: true, roughness: 0.9, normalMap: leafN, normalScale: new T.Vector2(1.3, 1.3) }),
    leafBush: S({ color: 0x4E8A34, vertexColors: true, roughness: 0.9, normalMap: leafN, normalScale: new T.Vector2(1.5, 1.5) }),
    bark: S({ map: barkTex(T), roughness: 0.95 }),
    logEnd: S({ map: logEndTex(T), roughness: 0.9 }),
    metal: S({ color: 0x3A3D42, roughness: 0.45, metalness: 0.6 }),
    rubber: S({ color: 0x1C1C1E, roughness: 0.92 }),
    paint: S({ color: 0x9A2018, roughness: 0.42, metalness: 0.08 }),
    yellow: S({ color: 0xB8840F, roughness: 0.5, metalness: 0.1 }),
    glass: S({ color: 0x2A3A44, roughness: 0.15, metalness: 0.5 }),
    water: S({ color: 0x1F4A56, roughness: 0.06, metalness: 0.25, normalMap: ripple, normalScale: new T.Vector2(0.22, 0.22) }),
    mud: S({ color: 0x4A3018, roughness: 0.3, metalness: 0.05, normalMap: ripple, normalScale: new T.Vector2(0.2, 0.2) }),
    mudDry: S({ color: 0x6A4C32, roughness: 0.95 }),
    shore: S({ color: 0x5E4630, roughness: 0.95 }),
    soil: S({ map: soilTex(T), roughness: 1 }),
    grass: S({ map: grassTex(T), roughness: 0.95 }),
    earth: S({ map: earthTex(T), roughness: 1 }),
    rock: S({ map: rockTex(T), roughness: 1 }),
    cabbage: S({ color: 0x5E9E46, vertexColors: true, roughness: 0.65, normalMap: leafN, normalScale: new T.Vector2(0.8, 0.8) }),
    sprout: S({ color: 0x3E8A2A, roughness: 0.8 }),
    carrot: S({ color: 0xC0501A, roughness: 0.55 }),
    reed: S({ color: 0x3A6A28, roughness: 0.8 }),
    cattail: S({ color: 0x4E2E14, roughness: 0.9 }),
    lily: S({ color: 0x2C6428, roughness: 0.45, side: T.DoubleSide }),
    pink: S({ color: 0xC8507E, roughness: 0.6 }),
    apple: S({ color: 0x9A1C16, roughness: 0.35 }),
    lamp: S({ color: 0x3A2A14, emissive: 0xFFB04A, emissiveIntensity: 0.15, roughness: 0.4 }),
    bowl: S({ color: 0x8A1E1A, roughness: 0.4 }),
    bone: S({ color: 0xD0C4AE, roughness: 0.6 }),
    straw: S({ color: 0xC49A3C, roughness: 0.9 }),
    flower: S({ color: 0xFFFFFF, roughness: 0.6 }),
    tuft: S({ color: 0x3A7428, roughness: 0.9 }),
    pebble: S({ color: 0x6E6A62, roughness: 0.9 }),
    yard: S({ map: yardTex(T), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
    rope: S({ color: 0x8A7048, roughness: 0.9 }),
    cloth: S({ color: 0x3A5E9A, roughness: 0.8 }),
    shirt: S({ color: 0x9A3A2A, roughness: 0.8 })
  }
}

/** Un mesh posé : position, échelle, rotation ; il porte et reçoit l'ombre. */
function mk(T: T3, g: Geo, m: Mat | Mat[], p?: number[], s?: number | number[], r?: number[]): Mesh {
  const o = new T.Mesh(g, m)
  if (p) o.position.set(p[0], p[1], p[2])
  if (s !== undefined) { if (typeof s === 'number') o.scale.setScalar(s); else o.scale.set(s[0], s[1], s[2]) }
  if (r) o.rotation.set(r[0], r[1], r[2])
  o.castShadow = true; o.receiveShadow = true
  return o
}

/** Un amas de boules fusionnées (feuillage, buisson, chou) : plus sombre en bas. */
function blob(K: Kit, balls: number[][], seg = 16, dark = 0.45): Geo {
  const { T, U } = K
  const parts = balls.map(([x, y, z, r, sy = 1]) => {
    const s = new T.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.7)))
    s.scale(1, sy, 1); s.translate(x, y, z)
    return s
  })
  const geo = U.mergeGeometries(parts)!
  parts.forEach(p => p.dispose())
  geo.computeBoundingBox()
  const bb = geo.boundingBox!
  const pos = geo.attributes.position
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const k = (pos.getY(i) - bb.min.y) / Math.max(0.01, bb.max.y - bb.min.y)
    const v = (1 - dark) + dark * Math.pow(k, 0.7) + (Math.random() - 0.5) * 0.07
    col[i * 3] = v; col[i * 3 + 1] = v; col[i * 3 + 2] = v * 0.96
  }
  geo.setAttribute('color', new T.BufferAttribute(col, 3))
  return geo
}

/** Des instances (même géométrie, même matériau) : un seul appel de dessin. */
function many(K: Kit, g: Geo, m: Mat | Mat[], list: { p: number[]; s?: number[]; r?: number[]; c?: number }[], shadow = true) {
  const { T } = K
  const im = new T.InstancedMesh(g, m, list.length)
  const o = new T.Object3D()
  const col = new T.Color()
  list.forEach((it, i) => {
    o.position.set(it.p[0], it.p[1], it.p[2])
    o.scale.set(it.s?.[0] ?? 1, it.s?.[1] ?? 1, it.s?.[2] ?? 1)
    o.rotation.set(it.r?.[0] ?? 0, it.r?.[1] ?? 0, it.r?.[2] ?? 0)
    o.updateMatrix()
    im.setMatrixAt(i, o.matrix)
    if (it.c !== undefined) im.setColorAt(i, col.setHex(it.c))
  })
  im.castShadow = shadow; im.receiveShadow = true
  im.computeBoundingSphere()
  return im
}

/** Toit à deux pans (le faîtage court le long de z) : tuiles dessus, sombre dessous. */
function gableRoof(K: Kit, g: Group, halfW: number, eave: number, ridge: number, depth: number, over: number, mat: Std, thick = 0.1) {
  const { T, M } = K
  const ang = Math.atan2(ridge - eave, halfW)
  const L = Math.hypot(halfW, ridge - eave) + over
  const geo = new T.BoxGeometry(L, thick, depth)
  const faces = [M.roofEdge, M.roofEdge, mat, M.dark, M.roofEdge, M.roofEdge]
  for (const s of [-1, 1]) {
    const m = mk(T, geo, faces)
    const midX = s * halfW / 2, midY = (eave + ridge) / 2
    const dn = over / 2 - 0.02
    m.position.set(midX + s * Math.cos(ang) * dn + s * Math.sin(ang) * thick / 2, midY - Math.sin(ang) * dn + Math.cos(ang) * thick / 2, 0)
    m.rotation.z = -s * ang
    g.add(m)
  }
  g.add(mk(T, K.box, M.roofEdge, [0, ridge + thick * 0.55, 0], [thick * 2.2, thick * 1.2, depth + 0.02]))
}

/** Un pignon (pentagone) extrudé, avec ses trous éventuels. */
function gableWall(K: Kit, halfW: number, eave: number, ridge: number, depth: number, door?: [number, number], holes: [number, number, number, number][] = [], arch = false) {
  const { T } = K
  const s = new T.Shape()
  s.moveTo(-halfW, 0)
  if (door) {
    const [dw, dh] = door
    s.lineTo(-dw, 0)
    if (arch) { s.lineTo(-dw, dh - dw); s.absarc(0, dh - dw, dw, Math.PI, 0, true); s.lineTo(dw, 0) }
    else { s.lineTo(-dw, dh); s.lineTo(dw, dh); s.lineTo(dw, 0) }
  }
  s.lineTo(halfW, 0); s.lineTo(halfW, eave); s.lineTo(0, ridge); s.lineTo(-halfW, eave); s.closePath()
  for (const [x0, y0, x1, y1] of holes) {
    const h = new T.Path()
    h.moveTo(x0, y0); h.lineTo(x1, y0); h.lineTo(x1, y1); h.lineTo(x0, y1); h.closePath()
    s.holes.push(h)
  }
  return new T.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 10 })
}

/** L'intérieur sombre d'une maison (fond, côtés, sous le toit, sol) : vu par la porte. */
function interior(K: Kit, g: Group, halfW: number, eave: number, ridge: number, halfD: number, y0 = 0, floorMat?: Mat) {
  const { T, M } = K
  const inset = 0.13
  const back = new T.Shape()
  back.moveTo(-halfW + inset, y0); back.lineTo(halfW - inset, y0); back.lineTo(halfW - inset, eave); back.lineTo(0, ridge - 0.12); back.lineTo(-halfW + inset, eave); back.closePath()
  const bg = new T.ShapeGeometry(back)
  g.add(mk(T, bg, M.dark, [0, 0, -halfD + inset + 0.005]))
  for (const s of [-1, 1]) {
    const p = mk(T, new T.PlaneGeometry(halfD * 2 - inset * 2, eave - y0), M.dark, [s * (halfW - inset - 0.005), (eave + y0) / 2, 0], 1, [0, -s * Math.PI / 2, 0])
    g.add(p)
    const ang = Math.atan2(ridge - eave, halfW)
    const L = Math.hypot(halfW, ridge - eave)
    const r = mk(T, new T.PlaneGeometry(L, halfD * 2 - inset * 2), M.dark, [s * halfW / 2, (eave + ridge) / 2 - 0.1, 0], 1, [Math.PI / 2, 0, 0])
    r.rotation.order = 'ZXY'
    r.rotation.z = -s * ang
    g.add(r)
  }
  const fl = mk(T, new T.PlaneGeometry(halfW * 2 - inset * 2, halfD * 2 - inset * 2), floorMat ?? M.dark, [0, y0 + 0.012, 0], 1, [-Math.PI / 2, 0, 0])
  g.add(fl)
}

/** Une tranche [start, start + count) d'une géométrie, à plat (non indexée). */
function sliceGeo(T: T3, src: Geo, start: number, count: number): Geo {
  const out = new T.BufferGeometry()
  const idx = src.index
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const a = src.getAttribute(name) as import('three').BufferAttribute | undefined
    if (!a) continue
    const n = a.itemSize
    const arr = new Float32Array(count * n)
    for (let i = 0; i < count; i++) {
      const v = idx ? idx.getX(start + i) : start + i
      for (let k = 0; k < n; k++) arr[i * n + k] = a.array[v * n + k]
    }
    out.setAttribute(name, new T.BufferAttribute(arr, n))
  }
  return out
}

/** Fond tout ce qui ne bouge pas dans une construction : un mesh par matériau.
    La grange passe ainsi d'une cinquantaine d'appels de dessin à une dizaine
    (la tablette a un GPU moyen). Les instances restent telles quelles. */
export function bake(T: T3, U: BGU, g: Group, keep: (m: Mesh) => boolean = () => false) {
  g.updateWorldMatrix(true, true)
  const inv = new T.Matrix4().copy(g.matrixWorld).invert()
  const byMat = new Map<Mat, Geo[]>()
  const dead: Mesh[] = []
  g.traverse(o => {
    const m = o as Mesh
    if (!m.isMesh || (m as unknown as import('three').InstancedMesh).isInstancedMesh || keep(m)) return
    if (!m.visible) { dead.push(m); return }
    const rel = new T.Matrix4().multiplyMatrices(inv, m.matrixWorld)
    const src = m.geometry
    const parts: [Geo, Mat][] = []
    if (Array.isArray(m.material)) {
      const groups = src.groups.length ? src.groups : [{ start: 0, count: src.index ? src.index.count : src.getAttribute('position').count, materialIndex: 0 }]
      for (const gr of groups) parts.push([sliceGeo(T, src, gr.start, gr.count), m.material[gr.materialIndex ?? 0]])
    } else {
      parts.push([sliceGeo(T, src, 0, src.index ? src.index.count : src.getAttribute('position').count), m.material])
    }
    for (const [geo, mat] of parts) {
      geo.applyMatrix4(rel)
      const n = geo.getAttribute('position').count
      if (!geo.getAttribute('uv')) geo.setAttribute('uv', new T.BufferAttribute(new Float32Array(n * 2), 2))
      const vc = (mat as Std).vertexColors
      if (vc && !geo.getAttribute('color')) geo.setAttribute('color', new T.BufferAttribute(new Float32Array(n * 3).fill(1), 3))
      if (!vc) geo.deleteAttribute('color')
      let list = byMat.get(mat)
      if (!list) byMat.set(mat, list = [])
      list.push(geo)
    }
    dead.push(m)
  })
  for (const m of dead) m.parent?.remove(m)
  const out: Mesh[] = []
  for (const [mat, geos] of byMat) {
    const merged = U.mergeGeometries(geos)
    geos.forEach(x => x.dispose())
    if (!merged) continue
    merged.computeBoundingSphere()
    const mesh = new T.Mesh(merged, mat)
    mesh.castShadow = true; mesh.receiveShadow = true
    g.add(mesh)
    out.push(mesh)
  }
  return out
}

/* ---------- Les cachettes ---------- */
interface Built { g: Group; slots: FarmSlot[]; matter: Matter; aim: [number, number, number]; foot: number; sway?: number; lamp?: [number, number, number] }

function barn(K: Kit): Built {
  const { T, M } = K
  const g = new T.Group()
  const W = 3.2, D = 2.6, H = 2.0, P = 3.1, hw = W / 2, hd = D / 2
  const front = gableWall(K, hw, H, P, 0.12, [0.62, 1.5], [[-0.34, 1.98, 0.34, 2.5]])
  g.add(mk(T, front, M.redWall, [0, 0, hd - 0.12]))
  g.add(mk(T, gableWall(K, hw, H, P, 0.12), M.redWall, [0, 0, -hd]))
  for (const s of [-1, 1]) g.add(mk(T, K.box, M.redSide, [s * (hw - 0.06), H / 2, 0], [0.12, H, D - 0.24]))
  gableRoof(K, g, hw, H, P, D + 0.5, 0.42, M.roof, 0.11)
  interior(K, g, hw, H, P, hd, 0, M.hayDark)
  // Un tas de foin au fond, qu'on devine dans le noir
  g.add(mk(T, K.sph, M.hayDark, [-0.55, 0, -0.65], [1.0, 0.6, 0.55]))
  // Les bois blancs : coins, cadre de porte, lucarne, bords du pignon
  const tr = (p: number[], s: number[], rz = 0) => g.add(mk(T, K.box, M.trim, p, s, [0, 0, rz]))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) tr([sx * hw, H / 2, sz * hd], [0.14, H, 0.14])
  for (const sx of [-1, 1]) tr([sx * 0.68, 0.78, hd + 0.02], [0.12, 1.56, 0.06])
  tr([0, 1.56, hd + 0.02], [1.48, 0.12, 0.06])
  tr([0, 1.95, hd + 0.02], [0.82, 0.08, 0.06]); tr([0, 2.53, hd + 0.02], [0.82, 0.08, 0.06])
  for (const sx of [-1, 1]) tr([sx * 0.38, 2.24, hd + 0.02], [0.08, 0.66, 0.06])
  const ga = Math.atan2(P - H, hw), gl = Math.hypot(hw, P - H)
  for (const sx of [-1, 1]) tr([sx * hw / 2, (H + P) / 2 - 0.05, hd + 0.03], [gl, 0.12, 0.05], -sx * ga)
  // La porte d'écurie : le bas fermé (une croix blanche), le haut ouvert en grand
  g.add(mk(T, K.box, M.redDoor, [0, 0.37, hd - 0.05], [1.24, 0.74, 0.07]))
  const xl = Math.hypot(1.16, 0.66), xa = Math.atan2(0.66, 1.16)
  for (const sx of [-1, 1]) tr([0, 0.37, hd + 0.0], [xl, 0.08, 0.03], sx * xa)
  tr([0, 0.76, hd - 0.03], [1.3, 0.08, 0.14])
  for (const sx of [-1, 1]) {
    const hinge = new T.Group()
    hinge.position.set(sx * 0.62, 1.12, hd)
    hinge.rotation.y = sx * 1.75
    hinge.add(mk(T, K.box, M.redDoor, [-sx * 0.31, 0, 0], [0.62, 0.76, 0.06]))
    hinge.add(mk(T, K.box, M.trim, [-sx * 0.31, 0, 0.035], [0.7, 0.07, 0.02], [0, 0, sx * 0.88]))
    g.add(hinge)
  }
  // Du foin qui dépasse de la lucarne, la poulie au-dessus
  g.add(mk(T, K.sph, M.hay, [0.18, 1.98, hd - 0.1], [0.2, 0.06, 0.12]))
  g.add(mk(T, K.box, M.woodDark, [0, 2.78, hd + 0.18], [0.1, 0.1, 0.5]))
  // La lanterne à côté de la porte
  g.add(mk(T, K.box, M.woodDark, [0.98, 1.78, hd + 0.08], [0.05, 0.05, 0.18]))
  g.add(mk(T, K.box, M.lamp, [0.98, 1.66, hd + 0.16], [0.13, 0.19, 0.13]))
  return {
    g, matter: 'bois', aim: [0, 1.0, hd], foot: 2.1, sway: 0.25, lamp: [0.98, 1.6, hd + 0.4],
    slots: [
      { id: 'grange-porte', type: 'top', at: [0, 0, hd - 0.3], rim: 0.76, w: 1.15, sizes: ['s', 'm', 'l'], side: true },
      { id: 'grange-lucarne', type: 'top', at: [0, 1.6, hd - 0.3], rim: 1.98, floor: 1.6, w: 0.62, sizes: ['s'], side: true }
    ]
  }
}

function haystack(K: Kit): Built {
  const { T, M } = K
  const g = new T.Group()
  const prof = [[0.99, 0], [1.04, 0.22], [1.0, 0.6], [0.86, 1.0], [0.62, 1.34], [0.32, 1.56], [0.001, 1.64]]
  const curve = new T.SplineCurve(prof.map(([r, y]) => new T.Vector2(r, y)))
  const dome = mk(T, new T.LatheGeometry(curve.getPoints(22), 40), M.hayDome)
  g.add(dome)
  // Des brins qui dépassent : la meule est ébouriffée
  const straws: { p: number[]; s: number[]; r: number[] }[] = []
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2, t = 0.15 + Math.random() * 0.8
    const y = t * 1.55, r = curve.getPoint(Math.min(0.99, t)).x
    straws.push({ p: [Math.sin(a) * r, y, Math.cos(a) * r], s: [1, 0.18 + Math.random() * 0.16, 1], r: [Math.cos(a) * (0.6 + Math.random()), 0, -Math.sin(a) * (0.6 + Math.random())] })
  }
  const sm = many(K, new T.CylinderGeometry(0.008, 0.008, 1, 4), M.straw, straws, false)
  sm.userData.noOcc = true
  g.add(sm)
  // La fourche, plantée contre la meule
  const fork = new T.Group()
  fork.add(mk(T, K.cyl, M.woodDark, [0, 0.8, 0], [0.025, 1.6, 0.025]))
  fork.add(mk(T, K.box, M.metal, [0, 1.62, 0], [0.24, 0.03, 0.03]))
  for (const x of [-0.1, -0.035, 0.035, 0.1]) fork.add(mk(T, K.cyl, M.metal, [x, 1.75, 0], [0.012, 0.26, 0.012]))
  fork.position.set(0.82, 0, 0.62)
  fork.rotation.set(0.3, 0.6, -0.32)
  g.add(fork)
  return {
    g, matter: 'foin', aim: [0, 1.0, 0.7], foot: 1.15, sway: 1,
    slots: [
      { id: 'meule-haut', type: 'top', at: [0, 0, 0], rim: 1.58, w: 0.9, sizes: ['s', 'm'], group: 'meule' },
      { id: 'meule-cote', type: 'rear', at: [0, 0, 0], out: [0, 1], plane: 1.0, w: 0.8, sizes: ['s', 'm'], side: true, group: 'meule' }
    ]
  }
}

function bales(K: Kit): Built {
  const { T, M, RB } = K
  const g = new T.Group()
  const geo = new RB(0.92, 0.46, 0.5, 2, 0.05)
  for (const [x, y, z, ry] of [[0, 0.23, 0.48, 0.03], [0, 0.23, -0.48, -0.04], [-0.48, 0.23, 0, Math.PI / 2], [0.48, 0.23, 0.02, Math.PI / 2 + 0.05], [0.05, 0.69, -0.46, 0.1]]) {
    g.add(mk(T, geo, M.bale, [x, y, z], 1, [0, ry, 0]))
  }
  // Le foin tassé au creux des bottes
  g.add(mk(T, K.box, M.hay, [0, 0.2, 0], [0.5, 0.4, 0.5]))
  return {
    g, matter: 'foin', aim: [0, 0.5, 0.5], foot: 0.85, sway: 0.8,
    slots: [{ id: 'bottes', type: 'top', at: [0, 0, 0], rim: 0.42, w: 0.5, sizes: ['s'] }]
  }
}

function tree(K: Kit, apples: boolean, balls: number[][], trunkH: number): { g: Group; crown: Mesh } {
  const { T, M } = K
  const g = new T.Group()
  g.add(mk(T, new T.CylinderGeometry(0.16, 0.26, trunkH, 10), M.bark, [0, trunkH / 2, 0]))
  // Deux branches qui partent dans le feuillage
  for (const [rz, rx, y] of [[0.7, 0.2, trunkH * 0.75], [-0.6, -0.3, trunkH * 0.85]]) {
    g.add(mk(T, new T.CylinderGeometry(0.05, 0.09, 0.9, 7), M.bark, [Math.sin(rz) * -0.3, y + 0.3, Math.sin(rx) * 0.3], 1, [rx, 0, rz]))
  }
  // Les racines au pied
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.4
    g.add(mk(T, K.sph, M.bark, [Math.sin(a) * 0.24, 0.04, Math.cos(a) * 0.24], [0.12, 0.08, 0.22], [0, a, 0]))
  }
  const crown = mk(T, blob(K, balls, 18, 0.5), M.leaf)
  g.add(crown)
  if (apples) {
    const list: { p: number[] }[] = []
    for (let i = 0; i < 16; i++) {
      const b = balls[i % balls.length]
      const a = Math.random() * Math.PI * 2, e = -0.2 + Math.random() * 0.9
      list.push({ p: [b[0] + Math.cos(a) * Math.cos(e) * b[3] * 0.98, b[1] + Math.sin(e) * b[3] * 0.98, b[2] + Math.sin(a) * Math.cos(e) * b[3] * 0.98] })
    }
    const am = many(K, new T.SphereGeometry(0.075, 10, 8), M.apple, list.map(l => ({ p: l.p })))
    am.userData.noOcc = true
    g.add(am)
  }
  return { g, crown }
}

function appleTree(K: Kit): Built {
  const balls = [[0, 2.85, 0, 1.15], [0.82, 2.62, 0.18, 0.74], [-0.78, 2.7, -0.08, 0.8], [0.2, 3.52, -0.18, 0.76], [-0.32, 2.42, 0.62, 0.66], [0.36, 2.46, -0.66, 0.66], [-0.5, 3.3, 0.42, 0.6]]
  const { g } = tree(K, true, balls, 2.1)
  return {
    g, matter: 'feuilles', aim: [0, 2.6, 0.9], foot: 0.5, sway: 0.6,
    slots: [{ id: 'pommier', type: 'tree', at: [0.1, 2.3, 0], rim: 1.68, w: 1.0, sizes: ['s'], only: ['cat'] }]
  }
}

function well(K: Kit): Built {
  const { T, M } = K
  const g = new T.Group()
  const prof = [[0.58, 0], [0.76, 0], [0.76, 0.72], [0.82, 0.74], [0.82, 0.82], [0.56, 0.82], [0.56, 0.74], [0.58, 0.7], [0.58, 0]]
  g.add(mk(T, new T.LatheGeometry(prof.map(([r, y]) => new T.Vector2(r, y)), 36), M.stone))
  // L'eau noire du fond, juste sous la margelle
  const wtr = mk(T, new T.CircleGeometry(0.58, 32), M.dark, [0, 0.76, 0], 1, [-Math.PI / 2, 0, 0])
  g.add(wtr)
  // Les montants, la traverse et sa manivelle, le petit toit, le seau
  for (const s of [-1, 1]) g.add(mk(T, K.box, M.woodDark, [s * 0.72, 1.3, 0], [0.1, 1.0, 0.1]))
  g.add(mk(T, K.cyl, M.wood, [0, 1.52, 0], [0.06, 1.56, 0.06], [0, 0, Math.PI / 2]))
  g.add(mk(T, K.box, M.metal, [0.82, 1.52, 0.08], [0.03, 0.03, 0.16]))
  g.add(mk(T, K.cyl, M.woodDark, [0.82, 1.52, 0.2], [0.025, 0.12, 0.025], [Math.PI / 2, 0, 0]))
  const roof = new T.Group()
  gableRoof(K, roof, 0.7, 0, 0.42, 1.75, 0.18, M.roofS, 0.06)
  roof.rotation.y = Math.PI / 2
  roof.position.y = 1.78
  g.add(roof)
  g.add(mk(T, new T.TorusGeometry(0.075, 0.035, 6, 14), M.rope, [0.2, 1.52, 0], [1, 1, 1.6], [0, Math.PI / 2, 0]))
  g.add(mk(T, new T.LatheGeometry([[0.001, 0], [0.12, 0], [0.15, 0.2], [0.13, 0.2], [0.11, 0.03], [0.001, 0.03]].map(([r, y]) => new T.Vector2(r, y)), 16), M.woodM, [0.6, 0.82, 0.4]))
  return {
    g, matter: 'pierre', aim: [0, 0.8, 0.6], foot: 0.9, sway: 0.4,
    slots: [{ id: 'puits', type: 'top', at: [0, 0, 0], rim: 0.76, w: 1.0, sizes: ['s', 'm'] }]
  }
}

function cart(K: Kit): Built {
  const { T, M } = K
  const g = new T.Group()
  const L = 1.7, Wd = 1.1, y0 = 0.6
  g.add(mk(T, K.box, M.wood, [0, y0, 0], [L, 0.08, Wd]))
  for (const s of [-1, 1]) {
    g.add(mk(T, K.box, M.woodM, [0, y0 + 0.2, s * (Wd / 2 - 0.03)], [L, 0.36, 0.06]))
    g.add(mk(T, K.box, M.woodM, [s * (L / 2 - 0.03), y0 + 0.2, 0], [0.06, 0.36, Wd - 0.06]))
    // Les roues : jante en bois cerclée de fer, huit rayons, moyeu
    const wheel = new T.Group()
    wheel.position.set(-0.1, 0.5, s * (Wd / 2 + 0.1))
    wheel.add(mk(T, new T.TorusGeometry(0.46, 0.05, 8, 28), M.woodDark))
    wheel.add(mk(T, new T.TorusGeometry(0.5, 0.018, 6, 28), M.metal))
    for (let k = 0; k < 8; k++) wheel.add(mk(T, K.box, M.wood, [0, 0, 0], [0.04, 0.9, 0.04], [0, 0, k * Math.PI / 8]))
    wheel.add(mk(T, K.cyl, M.woodDark, [0, 0, 0], [0.09, 0.16, 0.09], [Math.PI / 2, 0, 0]))
    g.add(wheel)
    // Les brancards, posés à terre
    const sh = mk(T, K.box, M.woodDark, [L / 2 + 0.55, 0.33, s * 0.36], [1.3, 0.07, 0.07], [0, 0, -0.42])
    g.add(sh)
  }
  // Le foin chargé : à plat d'un côté, en tas de l'autre
  g.add(mk(T, K.box, M.hay, [0, 0.84, 0], [L - 0.1, 0.36, Wd - 0.1]))
  g.add(mk(T, K.sph, M.hay, [0.38, 1.0, 0], [0.55, 0.26, 0.5]))
  return {
    g, matter: 'foin', aim: [0, 1.0, 0.6], foot: 1.25, sway: 0.6,
    slots: [{ id: 'charrette', type: 'top', at: [-0.42, 0, 0], rim: 1.0, w: 0.95, sizes: ['s', 'm'] }]
  }
}

function tractor(K: Kit): Built {
  const { T, M, RB } = K
  const g = new T.Group()
  // Le capot rouge, la calandre, les phares
  g.add(mk(T, new RB(1.15, 0.52, 0.62, 3, 0.1), M.paint, [0.42, 0.78, 0]))
  g.add(mk(T, K.box, M.metal, [1.0, 0.76, 0], [0.04, 0.38, 0.5]))
  for (const s of [-1, 1]) g.add(mk(T, K.cyl, M.lamp, [1.01, 0.9, s * 0.2], [0.06, 0.03, 0.06], [0, 0, Math.PI / 2]))
  g.add(mk(T, K.cyl, M.rubber, [0.62, 1.22, 0.16], [0.035, 0.42, 0.035]))
  // La cabine : plancher, siège, volant, montants, toit
  g.add(mk(T, K.box, M.paint, [-0.42, 0.62, 0], [0.8, 0.12, 0.8]))
  g.add(mk(T, new RB(0.36, 0.42, 0.42, 2, 0.06), M.rubber, [-0.55, 0.88, 0]))
  g.add(mk(T, new T.TorusGeometry(0.13, 0.02, 6, 18), M.rubber, [-0.12, 1.12, 0], 1, [0, Math.PI / 2, 0.5]))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mk(T, K.box, M.paint, [-0.42 + sx * 0.36, 1.24, sz * 0.36], [0.06, 1.15, 0.06]))
  g.add(mk(T, new RB(0.92, 0.09, 0.92, 2, 0.04), M.paint, [-0.42, 1.84, 0]))
  // Les grandes roues arrière et les petites devant
  const wheel = (x: number, z: number, r: number) => {
    const w = new T.Group()
    w.position.set(x, r, z)
    w.add(mk(T, new T.TorusGeometry(r * 0.72, r * 0.28, 10, 26), M.rubber))
    w.add(mk(T, K.cyl, M.yellow, [0, 0, 0], [r * 0.55, 0.16, r * 0.55], [Math.PI / 2, 0, 0]))
    w.add(mk(T, K.cyl, M.metal, [0, 0, Math.sign(z) * 0.06], [r * 0.18, 0.08, r * 0.18], [Math.PI / 2, 0, 0]))
    g.add(w)
  }
  for (const s of [-1, 1]) { wheel(-0.45, s * 0.56, 0.56); wheel(0.78, s * 0.42, 0.3) }
  // Les garde-boue au-dessus des grandes roues
  for (const s of [-1, 1]) g.add(mk(T, new T.CylinderGeometry(0.62, 0.62, 0.22, 16, 1, true, Math.PI / 2, Math.PI), M.paint, [-0.45, 0.56, s * 0.56], 1, [Math.PI / 2, 0, 0]))
  // Le chargeur : deux bras jaunes et le godet, garni de foin
  for (const s of [-1, 1]) {
    g.add(mk(T, K.box, M.yellow, [0.66, 1.1, s * 0.4], [1.25, 0.08, 0.08], [0, 0, -0.3]))
  }
  const bx = 1.5, bt = 1.06
  g.add(mk(T, K.box, M.yellow, [bx, bt - 0.36, 0], [0.56, 0.05, 1.0]))
  g.add(mk(T, K.box, M.yellow, [bx - 0.27, bt - 0.16, 0], [0.05, 0.42, 1.0]))
  g.add(mk(T, K.box, M.yellow, [bx + 0.27, bt - 0.22, 0], [0.05, 0.3, 1.0]))
  for (const s of [-1, 1]) g.add(mk(T, K.box, M.yellow, [bx, bt - 0.18, s * 0.5], [0.58, 0.38, 0.05]))
  g.add(mk(T, K.box, M.hay, [bx, bt - 0.2, 0], [0.5, 0.3, 0.94]))
  return {
    g, matter: 'metal', aim: [0.3, 1.0, 0.6], foot: 1.35, sway: 0.4,
    slots: [{ id: 'godet', type: 'top', at: [bx, 0, 0], rim: bt - 0.06, w: 0.48, sizes: ['s'] }]
  }
}

const BUSH = [[0, 0.62, 0, 0.72], [0.55, 0.5, 0.15, 0.55], [-0.55, 0.52, -0.1, 0.58], [0.15, 0.95, -0.25, 0.5], [-0.2, 0.9, 0.3, 0.5], [0.3, 0.45, -0.5, 0.45], [-0.25, 0.42, 0.55, 0.45]]
function bush(K: Kit, n: number): Built {
  const { T, M } = K
  const g = new T.Group()
  g.add(mk(T, blob(K, BUSH, 16, 0.55), M.leafBush))
  // Quelques fleurs blanches posées dessus
  const list: { p: number[] }[] = []
  for (let i = 0; i < 9; i++) {
    const b = BUSH[i % BUSH.length], a = Math.random() * 6.28, e = 0.1 + Math.random() * 0.9
    list.push({ p: [b[0] + Math.cos(a) * Math.cos(e) * b[3], b[1] + Math.sin(e) * b[3], b[2] + Math.sin(a) * Math.cos(e) * b[3]] })
  }
  const fl = many(K, new T.SphereGeometry(0.05, 8, 6), M.flower, list, false)
  fl.userData.noOcc = true
  g.add(fl)
  const side: [number, number] = n % 2 ? [-1, 0] : [1, 0]
  return {
    g, matter: 'feuilles', aim: [0, 0.8, 0.5], foot: 1.15, sway: 1,
    slots: [
      { id: `buisson-${n}-haut`, type: 'top', at: [0, 0, 0], rim: 1.27, w: 1.0, sizes: ['s', 'm', 'l'], group: `buisson${n}` },
      { id: `buisson-${n}-cote`, type: 'rear', at: [0, 0, 0], out: side, plane: 1.02, w: 0.8, sizes: ['s', 'm'], side: true, group: `buisson${n}` }
    ]
  }
}

function pond(K: Kit): Built {
  const { T, M } = K
  const g = new T.Group()
  const ragged = (r: number, n: number, amp: number) => {
    const s = new T.Shape()
    for (let i = 0; i <= n; i++) {
      const a = i / n * Math.PI * 2
      const rr = r * (1 + Math.sin(a * 3 + 1) * amp + Math.sin(a * 5) * amp * 0.5)
      if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
    }
    return new T.ShapeGeometry(s, 4)
  }
  g.add(mk(T, ragged(1.5, 48, 0.06), M.shore, [0, 0.012, 0], 1, [-Math.PI / 2, 0, 0]))
  const water = mk(T, ragged(1.28, 48, 0.06), M.water, [0, 0.024, 0], 1, [-Math.PI / 2, 0, 0])
  g.add(water)
  // Les roseaux au fond (côté du bord de la ferme), quelques massettes
  const reeds: { p: number[]; s: number[]; r: number[] }[] = []
  const cats: { p: number[]; r: number[] }[] = []
  for (let i = 0; i < 46; i++) {
    const a = Math.PI + (Math.random() - 0.5) * 2.4
    const r = 0.95 + Math.random() * 0.5
    const h = 0.75 + Math.random() * 0.45
    const x = Math.sin(a) * r * 0.9, z = Math.cos(a) * r
    const tilt = [(Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3]
    reeds.push({ p: [x, h / 2, z], s: [1, h, 1], r: tilt })
    if (i % 4 === 0) cats.push({ p: [x + tilt[2] * -h * 0.8, h * 0.82, z + tilt[0] * h * 0.8], r: tilt })
  }
  g.add(many(K, new T.ConeGeometry(0.03, 1, 5), M.reed, reeds))
  g.add(many(K, new T.CapsuleGeometry(0.035, 0.14, 3, 6), M.cattail, cats))
  // Les nénuphars et une fleur rose
  const pads: { p: number[]; r: number[]; s: number[] }[] = []
  for (const [x, z, s] of [[0.5, 0.4, 1], [0.75, -0.1, 0.8], [-0.3, 0.75, 0.9], [0.15, 0.85, 0.7]]) pads.push({ p: [x, 0.03, z], r: [-Math.PI / 2, 0, Math.random() * 6], s: [s, s, s] })
  const pm = many(K, new T.CircleGeometry(0.17, 16, 0.3, Math.PI * 2 - 0.6), M.lily, pads, false)
  pm.userData.noOcc = true
  g.add(pm)
  g.add(mk(T, K.sph, M.pink, [0.5, 0.06, 0.4], [0.06, 0.04, 0.06]))
  // Des galets sur la berge
  const peb: { p: number[]; s: number[] }[] = []
  for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28, r = 1.32 + Math.random() * 0.12; peb.push({ p: [Math.cos(a) * r, 0.03, Math.sin(a) * r], s: [0.1 + Math.random() * 0.07, 0.05, 0.08 + Math.random() * 0.05] }) }
  g.add(many(K, K.sph, M.pebble, peb))
  return {
    g, matter: 'eau', aim: [0.2, 0.1, 0.4], foot: 1.6, sway: 0.5,
    slots: [{ id: 'mare', type: 'top', at: [-0.25, 0, -0.32], rim: 0.024, w: 0.9, sizes: ['s'], only: ['duck'] }]
  }
}

function mud(K: Kit): Built {
  const { T, M } = K
  const g = new T.Group()
  const s = new T.Shape()
  for (let i = 0; i <= 40; i++) {
    const a = i / 40 * Math.PI * 2, r = 0.9 * (1 + Math.sin(a * 4 + 0.5) * 0.08 + Math.sin(a * 7) * 0.04)
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  const geo = new T.ShapeGeometry(s, 4)
  g.add(mk(T, geo, M.mudDry, [0, 0.009, 0], [1.16, 1.16, 1], [-Math.PI / 2, 0, 0]))
  g.add(mk(T, geo, M.mud, [0, 0.014, 0], 1, [-Math.PI / 2, 0, 0]))
  const splats: { p: number[]; s: number[]; r: number[] }[] = []
  for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28, r = 1.16 + Math.random() * 0.25, k = 0.05 + Math.random() * 0.07; splats.push({ p: [Math.cos(a) * r, 0.011, Math.sin(a) * r], s: [k, k * (0.7 + Math.random() * 0.5), 1], r: [-Math.PI / 2, 0, Math.random() * 6] }) }
  const sp = many(K, new T.CircleGeometry(1, 10), M.mudDry, splats, false)
  sp.userData.noOcc = true
  g.add(sp)
  return {
    g, matter: 'boue', aim: [0, 0.05, 0], foot: 1.05, sway: 0.4,
    slots: [{ id: 'boue', type: 'top', at: [0, 0, 0], rim: 0.014, w: 1.0, sizes: ['m', 's', 'l'] }]
  }
}

function kennel(K: Kit): Built {
  const { T, M } = K
  const g = new T.Group()
  const hw = 0.5, hd = 0.55, eave = 0.72, ridge = 1.02
  g.add(mk(T, gableWall(K, hw, eave, ridge, 0.06, [0.24, 0.6], [], true), M.kennel, [0, 0, hd - 0.06]))
  g.add(mk(T, gableWall(K, hw, eave, ridge, 0.06), M.kennel, [0, 0, -hd]))
  for (const s of [-1, 1]) g.add(mk(T, K.box, M.kennelM, [s * (hw - 0.03), eave / 2, 0], [0.06, eave, hd * 2 - 0.12]))
  gableRoof(K, g, hw, eave, ridge, hd * 2 + 0.24, 0.16, M.roofS, 0.06)
  interior(K, g, hw, eave, ridge, hd, 0, M.hayDark)
  // Le cadre de la porte, la gamelle et un os
  const arc = new T.TorusGeometry(0.26, 0.035, 6, 18, Math.PI)
  g.add(mk(T, arc, M.trim, [0, 0.36, hd + 0.005]))
  for (const s of [-1, 1]) g.add(mk(T, K.box, M.trim, [s * 0.26, 0.18, hd + 0.005], [0.07, 0.36, 0.03]))
  g.add(mk(T, new T.LatheGeometry([[0.001, 0], [0.13, 0], [0.16, 0.08], [0.13, 0.08], [0.11, 0.025], [0.001, 0.025]].map(([r, y]) => new T.Vector2(r, y)), 18), M.bowl, [0.42, 0, hd + 0.35]))
  const bone = new T.Group()
  bone.add(mk(T, K.cyl, M.bone, [0, 0, 0], [0.025, 0.2, 0.025], [0, 0, Math.PI / 2]))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bone.add(mk(T, K.sph, M.bone, [sx * 0.1, 0, sz * 0.025], 0.035))
  bone.position.set(-0.35, 0.03, hd + 0.4); bone.rotation.y = 0.6
  g.add(bone)
  return {
    g, matter: 'bois', aim: [0, 0.45, hd], foot: 0.85, sway: 0.5,
    slots: [
      { id: 'niche-tete', type: 'face', at: [0, 0, 0], out: [0, 1], plane: hd, open: 0.6, w: 0.62, sizes: ['s', 'm'], side: true, group: 'niche' },
      { id: 'niche-fesses', type: 'rear', at: [0, 0, 0], out: [0, 1], plane: hd, open: 0.6, w: 0.62, sizes: ['s', 'm'], side: true, group: 'niche' }
    ]
  }
}

function veggie(K: Kit): Built {
  const { T, M, RB } = K
  const g = new T.Group()
  g.add(mk(T, new RB(2.1, 0.12, 1.5, 2, 0.05), M.soil, [0, 0, 0]))
  const top = 0.06
  // Trois rangées : choux, carottes, choux ; deux terriers entre les rangs
  const cab = blob(K, [[0, 0.12, 0, 0.16], [0.1, 0.1, 0.05, 0.12], [-0.09, 0.1, 0.06, 0.12], [0.02, 0.1, -0.11, 0.12], [0, 0.2, 0, 0.1]], 10, 0.4)
  const cabs: { p: number[]; r: number[]; s: number[] }[] = []
  for (const z of [-0.5, 0.5]) for (let i = 0; i < 4; i++) {
    const x = -0.75 + i * 0.5
    if ((z < 0 && i === 3) || (z > 0 && i === 0)) continue // la place des terriers
    cabs.push({ p: [x, top, z], r: [0, Math.random() * 6, 0], s: [1.1, 1.1, 1.1] })
  }
  g.add(many(K, cab, M.cabbage, cabs))
  const tops: { p: number[]; r: number[]; s: number[] }[] = []
  const roots: { p: number[] }[] = []
  for (let i = 0; i < 6; i++) {
    const x = -0.8 + i * 0.32
    roots.push({ p: [x, top + 0.02, 0] })
    for (let k = 0; k < 3; k++) tops.push({ p: [x, top + 0.13, 0], r: [(k - 1) * 0.35, 0, (k - 1) * 0.2], s: [1, 1, 1] })
  }
  g.add(many(K, new T.ConeGeometry(0.035, 0.26, 5), M.sprout, tops))
  g.add(many(K, new T.ConeGeometry(0.045, 0.1, 8).rotateX(Math.PI), M.carrot, roots))
  // Les terriers : un trou noir dans un bourrelet de terre
  const burrows: [number, number][] = [[0.78, -0.5], [-0.78, 0.5]]
  for (const [x, z] of burrows) {
    g.add(mk(T, new T.CircleGeometry(0.25, 20), M.dark, [x, top + 0.004, z], 1, [-Math.PI / 2, 0, 0]))
    g.add(mk(T, new T.TorusGeometry(0.29, 0.07, 6, 20), M.soil, [x, top, z], [1, 1, 0.55], [Math.PI / 2, 0, 0]))
  }
  // L'épouvantail qui garde le potager
  const sc = new T.Group()
  sc.add(mk(T, K.cyl, M.woodDark, [0, 0.7, 0], [0.035, 1.4, 0.035]))
  sc.add(mk(T, K.cyl, M.woodDark, [0, 1.12, 0], [0.03, 0.9, 0.03], [0, 0, Math.PI / 2]))
  sc.add(mk(T, new RB(0.36, 0.42, 0.18, 2, 0.05), M.shirt, [0, 1.02, 0]))
  sc.add(mk(T, K.box, M.cloth, [0, 0.74, 0], [0.32, 0.18, 0.16]))
  sc.add(mk(T, K.sph, M.bale, [0, 1.38, 0], 0.15))
  sc.add(mk(T, K.cyl, M.straw, [0, 1.5, 0], [0.22, 0.02, 0.22]))
  sc.add(mk(T, new T.ConeGeometry(0.12, 0.2, 10), M.straw, [0, 1.6, 0]))
  for (const s of [-1, 1]) sc.add(mk(T, K.sph, M.straw, [s * 0.47, 1.12, 0], [0.07, 0.05, 0.05]))
  sc.position.set(0, 0, -0.62)
  sc.rotation.y = 0.15
  g.add(sc)
  return {
    g, matter: 'terre', aim: [0, 0.3, 0.5], foot: 1.35, sway: 0.4,
    slots: burrows.map(([x, z], i) => ({ id: `terrier-${i + 1}`, type: 'top' as const, at: [x, 0, z] as [number, number, number], rim: top, w: 0.55, sizes: ['s'] as Size[] }))
  }
}

function coop(K: Kit): Built {
  const { T, M } = K
  const g = new T.Group()
  const hw = 0.55, hd = 0.45, fl = 0.55, eave = 1.15, ridge = 1.45
  // Sur pilotis : le plancher, quatre pieds
  g.add(mk(T, K.box, M.woodDark, [0, fl - 0.03, 0], [hw * 2, 0.06, hd * 2]))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mk(T, K.box, M.woodDark, [sx * (hw - 0.06), fl / 2, sz * (hd - 0.06)], [0.07, fl, 0.07]))
  const front = new T.Group()
  front.add(mk(T, gableWall(K, hw, eave - fl, ridge - fl, 0.06, [0.17, 0.38]), M.coop))
  front.position.set(0, fl, hd - 0.06)
  g.add(front)
  const back = mk(T, gableWall(K, hw, eave - fl, ridge - fl, 0.06), M.coop, [0, fl, -hd])
  g.add(back)
  for (const s of [-1, 1]) g.add(mk(T, K.box, M.coopM, [s * (hw - 0.03), (fl + eave) / 2, 0], [0.06, eave - fl, hd * 2 - 0.12]))
  const roof = new T.Group()
  gableRoof(K, roof, hw, 0, ridge - eave, hd * 2 + 0.26, 0.16, M.roofBlue, 0.06)
  roof.position.y = eave
  g.add(roof)
  const inner = new T.Group()
  interior(K, inner, hw, eave - fl, ridge - fl, hd, 0, M.hayDark)
  inner.position.y = fl
  g.add(inner)
  // Le cadre de la porte, la petite échelle à barreaux
  for (const s of [-1, 1]) g.add(mk(T, K.box, M.trim, [s * 0.2, fl + 0.19, hd + 0.005], [0.05, 0.4, 0.03]))
  g.add(mk(T, K.box, M.trim, [0, fl + 0.4, hd + 0.005], [0.45, 0.05, 0.03]))
  const ramp = new T.Group()
  const rl = Math.hypot(fl, 0.75), ra = Math.atan2(fl, 0.75)
  ramp.add(mk(T, K.box, M.woodM, [0, 0, 0], [0.3, 0.03, rl]))
  for (let k = 0; k < 5; k++) ramp.add(mk(T, K.box, M.woodDark, [0, 0.025, -rl / 2 + 0.1 + k * (rl - 0.2) / 4], [0.3, 0.025, 0.03]))
  ramp.position.set(0, fl / 2, hd + 0.375)
  ramp.rotation.x = ra
  g.add(ramp)
  return {
    g, matter: 'bois', aim: [0, fl + 0.2, hd], foot: 1.0, sway: 0.5,
    slots: [{ id: 'poulailler', type: 'face', at: [0, fl, 0], out: [0, 1], plane: hd, open: fl + 0.38, w: 0.7, sizes: ['s'], only: ['hen', 'rooster', 'duck', 'cat', 'rabbit'], side: true }]
  }
}

function barrels(K: Kit): Built {
  const { T, M } = K
  const g = new T.Group()
  const h = 0.82
  const prof: [number, number][] = []
  for (let i = 0; i <= 10; i++) { const y = i / 10 * h; prof.push([0.27 + Math.sin(i / 10 * Math.PI) * 0.05, y]) }
  const geo = new T.LatheGeometry(prof.map(([r, y]) => new T.Vector2(r, y)), 22)
  const staves = planks(T, '#6E4A2A', '#2E1C10', 12)
  staves.repeat.set(2, 1)
  const mat = new T.MeshStandardMaterial({ map: staves, roughness: 0.8, side: T.DoubleSide })
  const spots: [number, number][] = [[-0.36, 0.1], [0.38, -0.12]]
  for (const [x, z] of spots) {
    g.add(mk(T, geo, mat, [x, 0, z]))
    for (const y of [0.1, h / 2, h - 0.1]) {
      const r = 0.27 + Math.sin(y / h * Math.PI) * 0.05
      g.add(mk(T, new T.TorusGeometry(r + 0.004, 0.012, 4, 22), M.metal, [x, y, z], 1, [Math.PI / 2, 0, 0]))
    }
    g.add(mk(T, new T.CircleGeometry(0.27, 20), M.dark, [x, h - 0.04, z], 1, [-Math.PI / 2, 0, 0]))
  }
  return {
    g, matter: 'bois', aim: [0, 0.6, 0.3], foot: 0.85, sway: 0.7,
    slots: spots.map(([x, z], i) => ({ id: `tonneau-${i + 1}`, type: 'top' as const, at: [x, 0, z] as [number, number, number], rim: h - 0.04, w: 0.5, sizes: ['s'] as Size[] }))
  }
}

function woodpile(K: Kit): Built {
  const { T, M } = K
  const g = new T.Group()
  const logs: { p: number[]; r: number[]; s: number[] }[] = []
  const rows = [7, 6, 5, 4]
  rows.forEach((n, row) => {
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.262 + (Math.random() - 0.5) * 0.02
      logs.push({ p: [x, 0.13 + row * 0.225, (Math.random() - 0.5) * 0.08], r: [Math.PI / 2, Math.random() * 6, 0], s: [1, 1 + (Math.random() - 0.5) * 0.12, 1] })
    }
  })
  g.add(many(K, new T.CylinderGeometry(0.13, 0.13, 0.82, 12), [M.bark, M.logEnd, M.logEnd], logs))
  // Le billot, à côté
  g.add(mk(T, new T.CylinderGeometry(0.24, 0.27, 0.42, 14), [M.bark, M.logEnd, M.logEnd], [1.25, 0.21, 0.1]))
  return {
    g, matter: 'bois', aim: [0, 0.5, 0.4], foot: 1.15, sway: 0.4,
    slots: [{ id: 'bois', type: 'rear', at: [0, 0, 0], out: [0, 1], plane: 0.42, open: 0.68, w: 0.7, sizes: ['s', 'm'], side: true }]
  }
}

/* ---------- La ferme entière ---------- */
type Builder = (K: Kit) => Built
/** [construction, angle (degrés), distance au centre] : la grange au fond au départ. */
const LAYOUT: [Builder, number, number][] = [
  [barn, 0, 5.7], [haystack, 36, 5.4], [appleTree, 64, 6.3], [cart, 96, 5.6], [K => bush(K, 1), 124, 6.6],
  [pond, 154, 5.4], [tractor, 190, 5.4], [kennel, 218, 5.4], [K => bush(K, 2), 244, 6.7],
  [veggie, 272, 5.3], [coop, 302, 5.7], [K => bush(K, 3), 328, 6.6],
  [woodpile, 24, 3.5], [well, 112, 4.0], [mud, 200, 3.8], [barrels, 290, 4.0], [bales, 330, 3.9]
]

export async function buildFarm(stage: Stage, o: { night: boolean }): Promise<Farm> {
  const { T, scene } = stage
  const [U, RBmod] = await Promise.all([
    import('three/examples/jsm/utils/BufferGeometryUtils.js'),
    import('three/examples/jsm/geometries/RoundedBoxGeometry.js')
  ])
  const M = mats(T, stage)
  const K: Kit = {
    T, U, RB: RBmod.RoundedBoxGeometry, M,
    box: stage.keep(new T.BoxGeometry(1, 1, 1)), sph: stage.keep(new T.SphereGeometry(1, 18, 12)), cyl: stage.keep(new T.CylinderGeometry(1, 1, 1, 14))
  }
  const R = PLATEAU_R
  const root = new T.Group()
  scene.add(root)

  /* Le plateau : l'herbe, le flanc de terre, l'herbe qui roule au bord, la
     roche qui s'effile dessous comme une île flottante */
  const top = mk(T, new T.CircleGeometry(R, 96), M.grass, [0, 0, 0], 1, [-Math.PI / 2, 0, 0])
  top.castShadow = false
  root.add(top)
  const side = mk(T, new T.CylinderGeometry(R, R * 0.97, 1.0, 96, 1, true), M.earth, [0, -0.5, 0])
  side.castShadow = false
  root.add(side)
  const lip = mk(T, new T.TorusGeometry(R - 0.02, 0.08, 8, 128), M.tuft, [0, -0.01, 0], 1, [Math.PI / 2, 0, 0])
  lip.castShadow = false
  root.add(lip)
  const cone = new T.ConeGeometry(R * 0.97, 3.4, 48, 5, true)
  {
    const p = cone.attributes.position
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i)
      if (y < 1.69) { // l'anneau du haut reste collé au flanc
        const a = Math.atan2(p.getZ(i), p.getX(i))
        const k = 1 + (Math.sin(a * 5 + y * 2) * 0.06 + Math.sin(a * 11 - y) * 0.04) * (1.7 - y) / 3.4
        p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k)
      }
    }
    cone.computeVertexNormals()
  }
  const under = mk(T, cone, M.rock, [0, -1.0 - 1.7, 0], 1, [Math.PI, 0, 0])
  under.castShadow = false
  root.add(under)
  // La cour en terre battue
  const yard = new T.Mesh(new T.CircleGeometry(2.9, 48), M.yard)
  yard.rotation.x = -Math.PI / 2
  yard.position.y = 0.006
  yard.receiveShadow = true
  yard.userData.noOcc = true
  root.add(yard)

  /* L'enclos rond au milieu, sur un lit de paille */
  const straw = mk(T, new T.CircleGeometry(1.52, 40), M.hayFloor, [0, 0.012, 0], 1, [-Math.PI / 2, 0, 0])
  straw.castShadow = false
  root.add(straw)
  const posts: { p: number[] }[] = []
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; posts.push({ p: [Math.sin(a) * 1.58, 0.3, Math.cos(a) * 1.58] }) }
  root.add(many(K, new T.BoxGeometry(0.08, 0.6, 0.08), M.woodDark, posts))
  for (const y of [0.28, 0.52]) root.add(mk(T, new T.TorusGeometry(1.58, 0.032, 6, 64), M.wood, [0, y, 0], 1, [Math.PI / 2, 0, 0]))
  // La lanterne de l'enclos, sur son poteau
  root.add(mk(T, K.box, M.woodDark, [1.78, 0.75, 0.3], [0.08, 1.5, 0.08]))
  root.add(mk(T, K.box, M.woodDark, [1.66, 1.48, 0.3], [0.28, 0.05, 0.05]))
  const penLamp = mk(T, K.box, M.lamp, [1.55, 1.34, 0.3], [0.13, 0.19, 0.13])
  root.add(penLamp)
  const pen: [number, number][] = []
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2; pen.push([Math.sin(a) * 1.04, Math.cos(a) * 1.04]) }
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.6; pen.push([Math.sin(a) * 0.4, Math.cos(a) * 0.4]) }

  /* La barrière du tour de la ferme */
  const rim: { p: number[]; r: number[] }[] = []
  const RF = R - 0.42
  const nPost = 58
  for (let i = 0; i < nPost; i++) { const a = i / nPost * Math.PI * 2; rim.push({ p: [Math.sin(a) * RF, 0.27, Math.cos(a) * RF], r: [0, a, 0] }) }
  root.add(many(K, new T.BoxGeometry(0.08, 0.54, 0.08), M.woodDark, rim))
  for (const y of [0.24, 0.44]) root.add(mk(T, new T.TorusGeometry(RF, 0.028, 6, 160), M.wood, [0, y, 0], 1, [Math.PI / 2, 0, 0]))

  /* Les cachettes */
  const spots: FarmSpot[] = []
  for (const [build, deg, r] of LAYOUT) {
    const b = build(K)
    const a = deg * Math.PI / 180
    b.g.position.set(Math.sin(a) * r, 0, Math.cos(a) * r)
    b.g.rotation.y = a + Math.PI
    root.add(b.g)
    bake(T, U, b.g)
    const idx = spots.length
    const occ: Mesh[] = []
    b.g.traverse(ob => {
      const m = ob as Mesh
      if (!m.isMesh) return
      m.userData.spot = idx
      if (!m.userData.noOcc && !(m.parent?.userData.noOcc)) occ.push(m)
    })
    spots.push({ id: (b.slots[0]?.id.split('-')[0] ?? 'arbre') + idx, g: b.g, occ, matter: b.matter, slots: b.slots, aim: b.aim, foot: b.foot, shake: 0, sway: b.sway ?? 0.6 })
    if (b.lamp) b.g.userData.lamp = b.lamp
  }

  /* Fleurs, touffes et cailloux semés dans l'herbe, loin des cachettes */
  const free = (x: number, z: number, m: number) => {
    const d = Math.hypot(x, z)
    if (d < 3.0 || d > R - 0.65) return false
    return spots.every(s => Math.hypot(s.g.position.x - x, s.g.position.z - z) > s.foot + m)
  }
  const sow = (n: number, m: number) => {
    const out: [number, number][] = []
    for (let tries = 0; out.length < n && tries < n * 30; tries++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * R
      const x = Math.sin(a) * d, z = Math.cos(a) * d
      if (free(x, z, m)) out.push([x, z])
    }
    return out
  }
  {
    // Une fleur : cinq pétales et un cœur jaune (deux instances par fleur)
    const petal = U.mergeGeometries([0, 1, 2, 3, 4].map(k => {
      const s = new T.SphereGeometry(0.045, 8, 6)
      s.scale(1, 0.4, 1)
      s.translate(Math.cos(k * 1.2566) * 0.05, 0, Math.sin(k * 1.2566) * 0.05)
      return s
    }))!
    const cols = [0xE8E2D2, 0xD8506E, 0xE0B01E, 0x9A6AD0, 0xE07A2E]
    const pts = sow(80, 0.15)
    root.add(many(K, petal, M.flower, pts.map(([x, z], i) => ({ p: [x, 0.09, z], r: [0, Math.random() * 6, 0], s: [1, 1, 1], c: cols[i % cols.length] })), false))
    root.add(many(K, new T.SphereGeometry(0.03, 6, 5), M.yellow, pts.map(([x, z]) => ({ p: [x, 0.1, z] })), false))
    root.add(many(K, new T.CylinderGeometry(0.008, 0.008, 0.09, 4), M.sprout, pts.map(([x, z]) => ({ p: [x, 0.045, z] })), false))
    const tuft = U.mergeGeometries([-1, 0, 1].map(k => {
      const c = new T.ConeGeometry(0.03, 0.2, 4)
      c.translate(0, 0.1, 0); c.rotateZ(k * 0.4); c.translate(k * 0.03, 0, 0)
      return c
    }))!
    root.add(many(K, tuft, M.tuft, sow(140, 0.05).map(([x, z]) => ({ p: [x, 0, z], r: [0, Math.random() * 6, 0], s: [1, 0.7 + Math.random() * 0.8, 1] })), false))
    root.add(many(K, K.sph, M.pebble, sow(14, 0.2).map(([x, z]) => ({ p: [x, 0.02, z], s: [0.12 + Math.random() * 0.12, 0.07, 0.1 + Math.random() * 0.08] }))))
  }

  /* Ce qui cache la vue : le plateau, les cachettes, l'enclos, la barrière */
  const occ: Mesh[] = [top, side]
  for (const s of spots) occ.push(...s.occ)

  /* Le ciel */
  const sky = stage.keep(o.night ? skyTex(T, '#060B1E', '#13204A', '#2A3A6A') : skyTex(T, '#5AAEE6', '#9ED4F2', '#E2F3FA'))
  scene.background = sky
  const clouds: import('three').Sprite[] = []
  const flies: { p: import('three').Vector3; base: import('three').Vector3; ph: number }[] = []
  let fliesPts: import('three').Points | null = null
  const lights: import('three').PointLight[] = []
  if (!o.night) {
    const ct = cloudTex(T)
    for (let i = 0; i < 7; i++) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: i === 0 ? ct : ct, transparent: true, opacity: 0.85, depthWrite: false, fog: false }))
      const a = -1.2 + i * 0.42 + Math.random() * 0.2
      s.position.set(Math.sin(a) * 60, 10 + Math.random() * 16, -40 - Math.cos(a) * 25)
      s.scale.set(26 + Math.random() * 14, 13 + Math.random() * 6, 1)
      scene.add(s)
      clouds.push(s)
    }
    stage.keep(ct)
  } else {
    // Les étoiles, la lune
    const n = 420
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = 0.08 + Math.random() * 1.3
      pos[i * 3] = Math.cos(a) * Math.cos(e) * 150; pos[i * 3 + 1] = Math.sin(e) * 150 - 10; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 150
    }
    const sg = new T.BufferGeometry()
    sg.setAttribute('position', new T.BufferAttribute(pos, 3))
    const dot = stage.keep(dotTex(T))
    const stars = new T.Points(sg, new T.PointsMaterial({ color: 0xFFF6E0, size: 2.2, sizeAttenuation: false, map: dot, transparent: true, depthWrite: false, fog: false }))
    scene.add(stars)
    const moon = new T.Sprite(new T.SpriteMaterial({ map: moonTex(T), transparent: true, depthWrite: false, fog: false }))
    moon.position.set(-46, 46, -95)
    moon.scale.setScalar(30)
    scene.add(moon)
    // Les lucioles, autour des buissons, de la mare et du pommier
    const nf = 24
    const fp = new Float32Array(nf * 3), fc = new Float32Array(nf * 3)
    const near = spots.filter(s => s.matter === 'feuilles' || s.matter === 'eau')
    for (let i = 0; i < nf; i++) {
      const s = near[i % near.length]
      const base = new T.Vector3(s.g.position.x + (Math.random() - 0.5) * 2.4, 0.4 + Math.random() * 1.6, s.g.position.z + (Math.random() - 0.5) * 2.4)
      flies.push({ p: base.clone(), base, ph: Math.random() * 10 })
    }
    const fg = new T.BufferGeometry()
    fg.setAttribute('position', new T.BufferAttribute(fp, 3))
    fg.setAttribute('color', new T.BufferAttribute(fc, 3))
    fliesPts = new T.Points(fg, new T.PointsMaterial({ size: 0.13, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending }))
    fliesPts.frustumCulled = false
    root.add(fliesPts)
    // Les lanternes allumées : celle de la grange, celle de l'enclos
    for (const s of spots) {
      const lp = s.g.userData.lamp as [number, number, number] | undefined
      if (!lp) continue
      const L = new T.PointLight(0xFFB45A, 3.2, 5.5, 1.4)
      L.position.set(lp[0], lp[1], lp[2])
      s.g.add(L)
      lights.push(L)
    }
    const L2 = new T.PointLight(0xFFB45A, 2.6, 4.6, 1.4)
    L2.position.set(1.45, 1.3, 0.3)
    root.add(L2)
    lights.push(L2)
    M.lamp.emissiveIntensity = 2.2
    // La lune éclaire faiblement, sans ombre ; plus de reflets d'atelier
    scene.environmentIntensity = 0.07
    if (stage.sun) { stage.sun.color.set('#8EA6FF'); stage.sun.intensity = 0.5; stage.sun.castShadow = false }
    scene.traverse(x => {
      const h = x as import('three').HemisphereLight
      if (h.isHemisphereLight) { h.color.set('#4E5EA0'); h.groundColor.set('#1E2230'); h.intensity = 0.44 }
      const d = x as import('three').DirectionalLight
      if (d.isDirectionalLight && d !== stage.sun) d.intensity = 0.05
    })
  }

  let partyK = 0
  const baleGeo = new K.RB(0.92, 0.46, 0.5, 2, 0.05)
  stage.keep(baleGeo)
  return {
    root, spots, occ, top, pen, night: o.night,
    bale: () => mk(T, baleGeo, M.bale),
    party(k) {
      partyK = k
      M.lamp.emissiveIntensity = (o.night ? 2.2 : 0.15) + k * 2.5
      for (const L of lights) L.intensity = 3 + k * 4
    },
    step(dt, t) {
      // L'eau et la boue miroitent
      const rn = M.water.normalMap
      if (rn) { rn.offset.x = t * 0.02; rn.offset.y = Math.sin(t * 0.3) * 0.02 }
      for (const c of clouds) { c.position.x += dt * 0.6; if (c.position.x > 75) c.position.x = -75 }
      // Les cachettes tremblent (un toucher tout près d'un animal caché)
      for (const s of spots) {
        if (s.shake <= 0) { if (s.g.rotation.z !== 0) { s.g.rotation.z = 0; s.g.scale.set(1, 1, 1) } continue }
        s.shake = Math.max(0, s.shake - dt)
        const k = Math.min(1, s.shake / 0.5) * s.sway
        s.g.rotation.z = Math.sin(t * 46) * 0.035 * k
        s.g.scale.set(1 + Math.sin(t * 38) * 0.02 * k, 1 - Math.sin(t * 38) * 0.03 * k, 1)
      }
      if (fliesPts) {
        const pos = fliesPts.geometry.attributes.position as import('three').BufferAttribute
        const col = fliesPts.geometry.attributes.color as import('three').BufferAttribute
        flies.forEach((f, i) => {
          f.p.set(f.base.x + Math.sin(t * 0.5 + f.ph) * 0.6, f.base.y + Math.sin(t * 0.8 + f.ph * 2) * 0.3, f.base.z + Math.cos(t * 0.4 + f.ph) * 0.6)
          pos.setXYZ(i, f.p.x, f.p.y, f.p.z)
          const b = Math.max(0, Math.sin(t * 2.2 + f.ph * 3)) * (0.6 + partyK * 0.4)
          col.setXYZ(i, b * 0.45, b, b * 0.5)
        })
        pos.needsUpdate = true; col.needsUpdate = true
      }
      if (o.night) for (const L of lights) L.intensity = (3 + partyK * 4) * (0.92 + Math.sin(t * 9) * 0.04 + Math.sin(t * 23) * 0.03)
    }
  }
}
