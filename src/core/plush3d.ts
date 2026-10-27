// LA PELUCHE en 3D (18/10, « Mon dessin prend vie ») : le maillage de
// `plush.ts` habillé de son tissu — la couleur de chaque zone, ses traits
// à elle par-dessus, brodés (en relief dans la carte des normales), une
// trame de feutrine, des points de couture le long du bord, et un satin
// (`sheen`, teinté du tissu) qui fait le duvet — un matériau « de luxe » que la qualité
// automatique simplifie toute seule quand la tablette peine.
import type { T3 } from './three3d'
import { bridges, fabric, inflate, silhouette, type PlushMesh, type Stroke } from './plush'

export interface Plush {
  /** La peluche, l'origine entre ses pieds. */
  obj: import('three').Group
  mesh: import('three').Mesh
  /** Sa hauteur, en unités de scène. */
  height: number
  dispose(): void
}

/** La silhouette se calcule à cette taille (le plus grand côté, en pixels). */
const WORK = 384
/** La texture du tissu (le plus grand côté) : à l'écran, une peluche fait 200 à 400 pixels de haut. */
const TEX = 768

/** La boîte des traits sur la feuille, avec une marge (`null` : feuille vide). */
function inkBox(cv: HTMLCanvasElement) {
  const g = cv.getContext('2d', { willReadFrequently: true })!
  const { data } = g.getImageData(0, 0, cv.width, cv.height)
  let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
    if (data[(y * cv.width + x) * 4 + 3] <= 40) continue
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  if (x1 < 0) return null
  const m = Math.max(12, 0.07 * Math.max(x1 - x0, y1 - y0))
  return { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m }
}

const canvas = (w: number, h: number) => Object.assign(document.createElement('canvas'), { width: w, height: h })

/** Le tissu : ses couleurs, ses traits, les points de couture. */
function paintFabric(drawing: HTMLCanvasElement, box: { x: number; y: number; w: number; h: number }, fab: Uint8ClampedArray,
  ww: number, wh: number, mesh: PlushMesh, tw: number, th: number) {
  const small = canvas(ww, wh)
  small.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(fab), ww, wh), 0, 0)
  const cv = canvas(tw, th), g = cv.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  g.drawImage(small, 0, 0, tw, th)
  g.drawImage(drawing, box.x, box.y, box.w, box.h, 0, 0, tw, th)
  // Les points de couture, un peu en retrait du bord, d'un ton plus sombre que le tissu
  const k = tw / ww, inset = 0.016 * tw
  const stitches = canvas(tw, th), sg = stitches.getContext('2d')!
  sg.lineCap = 'round'; sg.lineWidth = Math.max(2, tw / 340)
  for (const loop of mesh.seams) {
    const n = loop.length
    const pts = loop.map(([x, y], i) => {
      const [ax, ay] = loop[(i - 2 + n) % n], [bx, by] = loop[(i + 2) % n]
      let nx = -(by - ay), ny = bx - ax
      const l = Math.hypot(nx, ny) || 1
      nx /= l; ny /= l
      // Vers l'intérieur : là où le tissu est opaque
      const tx = Math.round(x + nx * 3), ty = Math.round(y + ny * 3)
      if (tx < 0 || ty < 0 || tx >= ww || ty >= wh || fab[(ty * ww + tx) * 4 + 3] === 0) { nx = -nx; ny = -ny }
      return [x * k + nx * inset, y * k + ny * inset] as [number, number]
    })
    let run = 0
    const dash = tw / 95, gap = tw / 150
    for (let i = 0; i < n; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n]
      const len = Math.hypot(bx - ax, by - ay)
      for (let t = 0; t < len; t += 1.5) {
        const on = (run + t) % (dash + gap) < dash
        if (!on) continue
        const px = ax + (bx - ax) * t / len, py = ay + (by - ay) * t / len
        const fx = Math.min(ww - 1, Math.max(0, Math.round(px / k))), fy = Math.min(wh - 1, Math.max(0, Math.round(py / k)))
        const f = (fy * ww + fx) * 4
        sg.fillStyle = `rgb(${fab[f] * 0.62 | 0},${fab[f + 1] * 0.62 | 0},${fab[f + 2] * 0.62 | 0})`
        sg.beginPath(); sg.arc(px, py, sg.lineWidth / 2, 0, Math.PI * 2); sg.fill()
      }
      run += len
    }
  }
  g.drawImage(stitches, 0, 0)
  return { cv, stitches }
}

/** Le relief : la trame de la feutrine, la broderie de ses traits, les points de couture. */
function paintRelief(drawing: HTMLCanvasElement, box: { x: number; y: number; w: number; h: number }, stitches: HTMLCanvasElement, tw: number, th: number) {
  const ink = canvas(tw, th), ig = ink.getContext('2d', { willReadFrequently: true })!
  ig.filter = `blur(${Math.max(1, tw / 600)}px)`
  ig.drawImage(drawing, box.x, box.y, box.w, box.h, 0, 0, tw, th)
  ig.filter = 'none'
  ig.drawImage(stitches, 0, 0)
  const a = ig.getImageData(0, 0, tw, th).data
  const hgt = new Float32Array(tw * th)
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const i = y * tw + x
    // Une trame croisée et un grain irrégulier, sous la broderie
    const weave = (Math.sin(x * 1.9) * Math.sin(y * 1.9)) * 0.18 + (Math.sin(x * 0.37 + Math.sin(y * 0.21) * 3) * 0.06)
    hgt[i] = weave + (a[i * 4 + 3] / 255) * 1.6
  }
  const out = new ImageData(tw, th), d = out.data
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const i = y * tw + x
    const l = hgt[y * tw + Math.max(0, x - 1)], r = hgt[y * tw + Math.min(tw - 1, x + 1)]
    const u = hgt[Math.max(0, y - 1) * tw + x], dn = hgt[Math.min(th - 1, y + 1) * tw + x]
    let nx = -(r - l), ny = dn - u, nz = 1
    const len = Math.hypot(nx, ny, nz)
    nx /= len; ny /= len; nz /= len
    d[i * 4] = (nx * 0.5 + 0.5) * 255; d[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; d[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; d[i * 4 + 3] = 255
  }
  const cv = canvas(tw, th)
  cv.getContext('2d')!.putImageData(out, 0, 0)
  return cv
}

/** Le dessin ramené à la taille de travail : son image, sa silhouette, son tissu, son maillage. */
export function prepare(drawing: HTMLCanvasElement, strokes?: Stroke[]) {
  const box = inkBox(drawing)
  if (!box) return null
  const k = WORK / Math.max(box.w, box.h)
  const ww = Math.round(box.w * k), wh = Math.round(box.h * k)
  const work = canvas(ww, wh), wg = work.getContext('2d', { willReadFrequently: true })!
  wg.imageSmoothingQuality = 'high'
  wg.drawImage(drawing, box.x, box.y, box.w, box.h, 0, 0, ww, wh)
  const img = wg.getImageData(0, 0, ww, wh)
  const toWork = (x: number, y: number) => [(x - box.x) * k, (y - box.y) * k]
  const gaps = strokes && bridges(strokes, Math.max(box.w, box.h))
    .map(([x0, y0, x1, y1]) => [...toWork(x0, y0), ...toWork(x1, y1)] as [number, number, number, number])
  const sil = silhouette(img, { bridges: gaps })
  if (!sil) return null
  return { box, k, ww, wh, img, gaps, sil, fab: fabric(img, sil), mesh: inflate(sil, { step: 3 }) }
}

/** Ce que la peluche garde de son dessin, calculé une fois (la scène, elle,
    se reconstruit : la nuit, une étape annulée) : son maillage, son tissu,
    son relief, et ses trois couleurs les plus présentes (les confettis). */
export interface PlushParts { mesh: PlushMesh; color: HTMLCanvasElement; relief: HTMLCanvasElement; colors: string[] }

/** Son dessin (la feuille, traits sur fond transparent) prêt à devenir
    peluche. `strokes` : ses traits tels qu'elle les a tracés (pixels de la
    feuille) — seuls ses vrais trous de contour sont alors bouchés. `null` :
    rien de dessiné. */
export function plushParts(drawing: HTMLCanvasElement, strokes?: Stroke[]): PlushParts | null {
  const prep = prepare(drawing, strokes)
  if (!prep) return null
  const { box, ww, wh, fab, mesh, img, sil } = prep
  const tk = TEX / Math.max(ww, wh), tw = Math.round(ww * tk), th = Math.round(wh * tk)
  const { cv, stitches } = paintFabric(drawing, box, fab, ww, wh, mesh, tw, th)
  const relief = paintRelief(drawing, box, stitches, tw, th)
  const bins = new Map<number, number>()
  for (let i = 0; i < ww * wh; i++) {
    if (!sil.ink[i] || !sil.mask[i]) continue
    const key = (img.data[i * 4] >> 4) << 8 | (img.data[i * 4 + 1] >> 4) << 4 | img.data[i * 4 + 2] >> 4
    bins.set(key, (bins.get(key) ?? 0) + 1)
  }
  const colors = [...bins].sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k]) => '#' + [k >> 8, (k >> 4) & 15, k & 15].map(v => (v * 17).toString(16).padStart(2, '0')).join(''))
  return { mesh, color: cv, relief, colors }
}

/** La peluche dans une scène, haute de `height` (unités de scène ; un dessin
    très allongé est réduit pour tenir), l'origine entre ses pieds. */
export function buildPlush(T: T3, parts: PlushParts, height = 1): Plush {
  const { mesh } = parts
  const map = new T.CanvasTexture(parts.color)
  map.colorSpace = T.SRGBColorSpace
  map.anisotropy = 4
  const normalMap = new T.CanvasTexture(parts.relief)
  const mat = new T.MeshPhysicalMaterial({
    map, normalMap, normalScale: new T.Vector2(0.9, 0.9), roughness: 0.9, metalness: 0,
    // Le duvet a la couleur du tissu (un velours sombre ne blanchit pas)
    sheen: 1, sheenRoughness: 0.45, sheenColor: new T.Color(0.9, 0.9, 0.9), sheenColorMap: map
  })
  const bw = mesh.box.x1 - mesh.box.x0, bh = mesh.box.y1 - mesh.box.y0
  const s = height / Math.max(bh, bw * 0.7)
  const pos = mesh.pos.slice()
  for (let i = 0; i < pos.length; i++) pos[i] *= s
  const geo = new T.BufferGeometry()
  geo.setAttribute('position', new T.BufferAttribute(pos, 3))
  geo.setAttribute('uv', new T.BufferAttribute(mesh.uv, 2))
  geo.setIndex(new T.BufferAttribute(mesh.index, 1))
  geo.computeVertexNormals()
  const m = new T.Mesh(geo, mat)
  m.castShadow = true; m.receiveShadow = true
  const obj = new T.Group()
  obj.add(m)
  return {
    obj, mesh: m, height: bh * s,
    dispose() { geo.dispose(); mat.dispose(); map.dispose(); normalMap.dispose() }
  }
}
