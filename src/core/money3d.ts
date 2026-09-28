import type { T3 } from './three3d'
import { withRenderer } from './portraits'
import { diskGet, diskPut } from './diskcache'

/* L'ARGENT DU MARCHÉ en vraie 3D (28/09) — les pièces et les billets en
   euros, construits et rendus en IMAGES (comme les personnages de la ferme,
   `core/portraits.ts`) pour le Marché, qui reste un jeu en DOM :
   - les pièces : métal (cuivre pour 1, 2, 5 c ; or nordique pour 10, 20,
     50 c ; bimétal pour 1 € et 2 €), la face commune en relief (le chiffre,
     « EURO CENT », le globe ou la carte, les douze étoiles), le liseré
     relevé, la tranche lisse ou striée, les VRAIES tailles relatives (de
     16,25 mm pour 1 c à 25,75 mm pour 2 €) ;
   - les billets : papier courbé, couleur et motif de chaque valeur (arche
     classique du 5, arcs romans du 10, vitraux gothiques du 20), le chiffre,
     les douze étoiles, la bande argentée qui brille.
   Rendues une fois (un contexte WebGL jetable), gardées en mémoire et sur la
   tablette (`core/diskcache.ts`) : la deuxième ouverture ne calcule rien. */

type Mesh = import('three').Mesh

/** Diamètre (mm) et épaisseur (mm) des pièces, en centimes. */
const COIN: Record<number, [number, number]> = {
  1: [16.25, 1.67], 2: [18.75, 1.67], 5: [21.25, 1.67], 10: [19.75, 1.93],
  20: [22.25, 2.14], 50: [24.25, 2.38], 100: [23.25, 2.33], 200: [25.75, 2.2]
}
/** Les billets : taille (mm), couleur du papier, couleur du motif. */
const NOTE: Record<number, { w: number; h: number; paper: string; ink: string; deep: string }> = {
  500: { w: 120, h: 62, paper: '#9CA69A', ink: '#6D7C70', deep: '#3D4A42' },
  1000: { w: 127, h: 67, paper: '#D98270', ink: '#B24E3E', deep: '#7A2E24' },
  2000: { w: 133, h: 72, paper: '#7F9DD2', ink: '#4A6DB0', deep: '#2A4478' }
}
/* Couleurs des métaux assombries : sous l'ACES, un métal clair part en blanc */
const METAL = { copper: 0xA4582F, gold: 0xC49A45, silver: 0xAEB3BA }
const MAXMM = 25.75

const VERSION = 'v3'
const mem = new Map<string, string>()

/* ---- La face commune en relief : une carte de hauteurs (blanc = bosse) ---- */
function star(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  g.closePath(); g.fill()
}

/** La face commune : `low` pour le fond (creux), `high` pour ce qui est en
    relief. Tracée deux fois : en gris pour le relief (bump), et en clair sur
    fond patiné pour la couleur — le chiffre se LIT, comme sur une vraie pièce
    un peu usée dont les creux ont foncé. */
function faceArt(v: number, low: string, high: string, blur: number): HTMLCanvasElement {
  const S = 512, c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const C = S / 2
  if (blur) g.filter = `blur(${blur}px)`
  g.fillStyle = low; g.fillRect(0, 0, S, S)
  // Le liseré relevé
  g.strokeStyle = high; g.lineWidth = 18
  g.beginPath(); g.arc(C, C, C - 10, 0, Math.PI * 2); g.stroke()
  g.fillStyle = high; g.strokeStyle = high
  const big = v >= 100 ? String(v / 100) : String(v)
  g.textAlign = 'center'; g.textBaseline = 'middle'
  if (v <= 5) {
    // 1, 2, 5 c : le chiffre à gauche, le globe (l'Europe) à droite
    g.lineWidth = 6
    const gx = C + 108, gr = 92
    g.beginPath(); g.arc(gx, C - 8, gr, 0, Math.PI * 2); g.stroke()
    g.beginPath(); g.ellipse(gx, C - 8, gr * 0.45, gr, 0, 0, Math.PI * 2); g.stroke()
    g.beginPath(); g.moveTo(gx - gr, C - 8); g.lineTo(gx + gr, C - 8); g.stroke()
    g.beginPath(); g.ellipse(gx + 10, C - 40, 34, 26, 0.4, 0, Math.PI * 2); g.fill()
    g.font = "800 230px 'Baloo 2', sans-serif"
    g.fillText(big, C - 92, C - 22)
    g.font = "800 38px 'Baloo 2', sans-serif"
    g.fillText('EURO', C - 92, C + 110); g.fillText('CENT', C - 92, C + 150)
  } else {
    // 10, 20, 50 c et 1, 2 € : le chiffre à gauche, la carte de l'Europe et ses lignes à droite
    g.lineWidth = 5
    for (let i = 0; i < 6; i++) { const y = C - 130 + i * 52; g.beginPath(); g.moveTo(C + 50, y); g.lineTo(C + 205, y); g.stroke() }
    g.beginPath()
    g.moveTo(C + 70, C - 120); g.bezierCurveTo(C + 150, C - 160, C + 205, C - 60, C + 165, C)
    g.bezierCurveTo(C + 200, C + 80, C + 110, C + 140, C + 80, C + 80)
    g.bezierCurveTo(C + 45, C + 30, C + 100, C - 30, C + 70, C - 120)
    g.fill()
    g.font = `800 ${big.length > 1 ? 190 : 250}px 'Baloo 2', sans-serif`
    g.fillText(big, C - (big.length > 1 ? 88 : 72), C - 26)
    g.font = "800 40px 'Baloo 2', sans-serif"
    g.fillText(v >= 100 ? 'EURO' : 'EURO', C - 80, C + 112)
    if (v < 100) g.fillText('CENT', C - 80, C + 152)
  }
  // Les douze étoiles, sur l'arc de droite
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI * 0.42 + i * (Math.PI * 0.84 / 11)
    star(g, C + Math.cos(a) * (C - 46), C + Math.sin(a) * (C - 46), 15)
  }
  return c
}

/** La tranche : lisse, ou striée (10 c, 50 c, 1 €, 2 €). */
function edgeBump(reeded: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 16
  const g = c.getContext('2d')!
  g.fillStyle = '#808080'; g.fillRect(0, 0, 512, 16)
  if (reeded) { g.fillStyle = '#E0E0E0'; for (let x = 0; x < 512; x += 4) g.fillRect(x, 0, 2, 16) }
  return c
}

function coinMesh(T: T3, v: number, keep: { dispose(): void }[]) {
  const [mm, th] = COIN[v]
  const R = mm / MAXMM, H = th / MAXMM
  const bump = new T.CanvasTexture(faceArt(v, '#5A5A5A', '#E0E0E0', 2.5))
  const patina = new T.CanvasTexture(faceArt(v, '#9A958C', '#FFFFFF', 1))
  patina.colorSpace = T.SRGBColorSpace
  const edge = new T.CanvasTexture(edgeBump([10, 50, 100, 200].includes(v)))
  edge.wrapS = T.RepeatWrapping; edge.repeat.set(3, 1)
  keep.push(bump, patina, edge)
  const mat = (col: number, b: import('three').Texture | null, bs = 0, face = false) => {
    const m = new T.MeshPhysicalMaterial({
      color: col, map: face ? patina : null, metalness: 1, roughness: 0.34, bumpMap: b, bumpScale: bs, envMapIntensity: 1.25
    })
    keep.push(m)
    return m
  }
  const outer = v <= 5 ? METAL.copper : v <= 50 ? METAL.gold : v === 100 ? METAL.gold : METAL.silver
  const inner = v === 100 ? METAL.silver : v === 200 ? METAL.gold : outer
  const g = new T.Group()
  // La tranche
  const side = new T.Mesh(new T.CylinderGeometry(R, R, H, 96, 1, true), mat(outer, edge, 2))
  keep.push(side.geometry)
  g.add(side)
  // La face (planaire : le relief y est plaqué tel quel), en deux métaux pour 1 € et 2 €
  const up = (m: Mesh) => { m.rotation.x = -Math.PI / 2; m.position.y = H / 2; keep.push(m.geometry); g.add(m); return m }
  if (inner !== outer) {
    const k = 0.7
    // Les UV d'un anneau et d'un disque sont planaires : le relief continue de l'un à l'autre
    const ring = new T.RingGeometry(R * k, R, 96, 1)
    up(new T.Mesh(ring, mat(outer, bump, 3, true)))
    const disc = new T.CircleGeometry(R * k, 96)
    const uv = disc.attributes.uv, pos = disc.attributes.position
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / (2 * R), 0.5 + pos.getY(i) / (2 * R))
    up(new T.Mesh(disc, mat(inner, bump, 3, true)))
  } else {
    up(new T.Mesh(new T.CircleGeometry(R, 96), mat(outer, bump, 3, true)))
  }
  // Le dessous (pour la tranche vue d'en bas, jamais le relief)
  const back = new T.Mesh(new T.CircleGeometry(R, 64), mat(outer, null))
  back.rotation.x = Math.PI / 2; back.position.y = -H / 2
  keep.push(back.geometry)
  g.add(back)
  return g
}

/* ---- Les billets ---- */
function noteTexture(v: number): HTMLCanvasElement {
  const n = NOTE[v]
  const W = 1024, H = Math.round(W * n.h / n.w)
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const gr = g.createLinearGradient(0, 0, W, H)
  gr.addColorStop(0, n.paper); gr.addColorStop(0.5, n.paper + 'D8'); gr.addColorStop(1, n.paper)
  g.fillStyle = '#D8D1C2'; g.fillRect(0, 0, W, H)
  g.fillStyle = gr; g.fillRect(0, 0, W, H)
  // Guillochis : de fines ondes
  g.strokeStyle = n.ink; g.globalAlpha = 0.18; g.lineWidth = 1.5
  for (let k = 0; k < 26; k++) {
    g.beginPath()
    for (let x = 0; x <= W; x += 8) g.lineTo(x, H * 0.08 + k * H * 0.034 + Math.sin(x / 38 + k * 0.7) * 9)
    g.stroke()
  }
  g.globalAlpha = 1
  // Le motif d'architecture, à gauche : l'arche (5), les arcs romans (10), les vitraux (20)
  g.fillStyle = n.ink; g.strokeStyle = n.deep; g.lineWidth = 6
  const x0 = W * 0.2, y0 = H * 0.24, aw = W * 0.26, ah = H * 0.62
  if (v === 500) {
    g.fillRect(x0 - aw / 2, y0 + ah * 0.12, aw * 0.16, ah * 0.88); g.fillRect(x0 + aw / 2 - aw * 0.16, y0 + ah * 0.12, aw * 0.16, ah * 0.88)
    g.fillRect(x0 - aw * 0.6, y0, aw * 1.2, ah * 0.12)
    g.beginPath(); g.moveTo(x0 - aw * 0.66, y0); g.lineTo(x0, y0 - ah * 0.2); g.lineTo(x0 + aw * 0.66, y0); g.fill()
  } else {
    for (const dx of [-0.26, 0.26]) {
      const cx = x0 + dx * aw, w2 = aw * 0.21
      g.beginPath(); g.moveTo(cx - w2, y0 + ah)
      g.lineTo(cx - w2, y0 + ah * 0.35)
      if (v === 1000) g.arc(cx, y0 + ah * 0.35, w2, Math.PI, 0)
      else { g.quadraticCurveTo(cx - w2, y0 + ah * 0.05, cx, y0 - ah * 0.06); g.quadraticCurveTo(cx + w2, y0 + ah * 0.05, cx + w2, y0 + ah * 0.35) }
      g.lineTo(cx + w2, y0 + ah); g.closePath(); g.fill(); g.stroke()
    }
  }
  // La valeur, en grand, et « EURO »
  const val = String(v / 100)
  g.fillStyle = n.deep; g.textBaseline = 'alphabetic'
  g.font = `800 ${H * 0.34}px 'Baloo 2', sans-serif`; g.textAlign = 'left'
  g.fillText(val, W * 0.035, H * 0.33)
  g.font = `800 ${H * 0.44}px 'Baloo 2', sans-serif`; g.textAlign = 'right'
  g.fillText(val, W * 0.8, H * 0.93)
  g.font = `800 ${H * 0.11}px 'Baloo 2', sans-serif`; g.textAlign = 'left'
  g.fillText('EURO', W * 0.36, H * 0.2)
  // Les douze étoiles, sur leur drapeau bleu
  g.fillStyle = '#2B4FA0'; g.fillRect(W * 0.52, H * 0.14, H * 0.36, H * 0.28)
  g.fillStyle = '#F2C230'
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; star(g, W * 0.52 + H * 0.18 + Math.cos(a) * H * 0.095, H * 0.28 + Math.sin(a) * H * 0.095, H * 0.02) }
  // La place de la bande argentée (elle est posée en 3D par-dessus)
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(W * 0.86, 0, W * 0.06, H)
  // Bord
  g.strokeStyle = n.deep; g.globalAlpha = 0.5; g.lineWidth = 4; g.strokeRect(2, 2, W - 4, H - 4); g.globalAlpha = 1
  return c
}

function noteMesh(T: T3, v: number, keep: { dispose(): void }[]) {
  const n = NOTE[v]
  const w = n.w / 133 * 2, h = n.h / 133 * 2
  const tex = new T.CanvasTexture(noteTexture(v))
  tex.colorSpace = T.SRGBColorSpace
  tex.anisotropy = 4
  keep.push(tex)
  const geo = new T.PlaneGeometry(w, h, 32, 6)
  // Le papier se courbe un peu, comme un vrai billet posé
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i)
    pos.setZ(i, Math.sin((x / w + 0.5) * Math.PI) * 0.06 + Math.sin(x * 5 + y * 2) * 0.008)
  }
  geo.computeVertexNormals()
  const mat = new T.MeshStandardMaterial({ map: tex, roughness: 0.78, metalness: 0, side: T.DoubleSide })
  keep.push(geo, mat)
  const g = new T.Group()
  g.add(new T.Mesh(geo, mat))
  // La bande argentée : une vraie feuille de métal qui accroche la lumière
  const sg = new T.PlaneGeometry(w * 0.06, h, 1, 6)
  const sp = sg.attributes.position
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i) + w * 0.39
    sp.setX(i, x)
    sp.setZ(i, Math.sin((x / w + 0.5) * Math.PI) * 0.06 + Math.sin(x * 5 + sp.getY(i) * 2) * 0.008 + 0.004)
  }
  sg.computeVertexNormals()
  const sm = new T.MeshPhysicalMaterial({ color: 0xDADFE6, metalness: 0.55, roughness: 0.3, iridescence: 1, iridescenceIOR: 1.8, envMapIntensity: 1.6, side: T.DoubleSide })
  keep.push(sg, sm)
  g.add(new T.Mesh(sg, sm))
  return g
}

/** Les images (dataURL, fond transparent) de l'argent demandé, en centimes :
    1 … 200 pour les pièces (carrées, `px` de côté), 500, 1000, 2000 pour les
    billets (`px` × 0,56 px). */
export async function moneyImages(values: number[], px: number): Promise<Record<number, string>> {
  const out: Record<number, string> = {}
  const todo: number[] = []
  for (const v of values) {
    const key = `${VERSION}:${v}:${px}`
    const hit = mem.get(key) ?? await diskGet('argent', key)
    if (hit) { mem.set(key, hit); out[v] = hit } else todo.push(v)
  }
  if (!todo.length) return out
  // Le chiffre et « EURO » sont écrits dans la police de l'app : l'attendre
  try { await document.fonts.load("800 40px 'Baloo 2'") } catch { /* police système */ }
  const coins = todo.filter(v => v < 500), notes = todo.filter(v => v >= 500)
  if (coins.length) await renderBatch(coins, px, px, out)
  if (notes.length) await renderBatch(notes, px, Math.round(px * 0.56), out, px)
  return out
}

async function renderBatch(todo: number[], w: number, h: number, out: Record<number, string>, px = w) {
  await withRenderer(w, h, async (T, renderer, env) => {
    const scene = new T.Scene()
    scene.environment = env
    scene.environmentIntensity = 0.9
    scene.add(new T.HemisphereLight('#FFF6E8', '#6B5B4A', 0.5))
    const key = new T.DirectionalLight('#FFF1D8', 2.4)
    key.position.set(-2.5, 4, 3)
    scene.add(key)
    const rim = new T.DirectionalLight('#DDE8FF', 0.8)
    rim.position.set(3, 1, -2)
    scene.add(rim)
    const cam = new T.PerspectiveCamera(24, w / h, 0.1, 50)
    for (const v of todo) {
      const keep: { dispose(): void }[] = []
      const isNote = v >= 500
      const obj = isNote ? noteMesh(T, v, keep) : coinMesh(T, v, keep)
      // Le papier mat prend toute la lumière : on la baisse pour lui (sinon il sort délavé)
      key.intensity = isNote ? 1.3 : 2.4
      scene.environmentIntensity = isNote ? 0.45 : 0.9
      if (isNote) {
        // Un billet un peu de biais, vu d'au-dessus
        obj.rotation.set(-0.32, 0.06, -0.05)
        cam.position.set(0, 0.05, 3.1)
        cam.lookAt(0, 0, 0)
      } else {
        // Une pièce légèrement inclinée : on voit sa tranche, et le relief accroche la lumière
        obj.rotation.set(1.12, 0, -0.12)
        cam.position.set(0, 0, 5.2)
        cam.lookAt(0, 0, 0)
      }
      scene.add(obj)
      renderer.render(scene, cam)
      const url = renderer.domElement.toDataURL('image/png')
      scene.remove(obj)
      keep.forEach(k => k.dispose())
      const k = `${VERSION}:${v}:${px}`
      mem.set(k, url)
      out[v] = url
      void diskPut('argent', k, url, 40)
    }
  })
}
