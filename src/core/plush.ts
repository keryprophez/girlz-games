// LA PELUCHE de « Mon dessin prend vie » (18/10, la Ferme à construire) :
// son dessin à elle, gonflé en peluche — sa silhouette exacte, ses traits
// brodés sur le tissu. Ici la logique pure, testée : la silhouette (un
// contour qui ne se ferme pas est refermé, l'intérieur rempli), la couleur
// du tissu de chaque zone, l'épaisseur (bombée au milieu, pincée à la
// couture) et le maillage (le devant, le dos, la couture qui les joint).
// Le rendu (tissu, broderie, points de couture) est dans `plush3d.ts`.

/** Une image RGBA : une `ImageData`, ou ce qui lui ressemble. */
export interface Rgba { width: number; height: number; data: Uint8ClampedArray }

export interface Silhouette {
  w: number
  h: number
  /** 1 = un trait de son dessin. */
  ink: Uint8Array
  /** 1 = dans la peluche (les traits, l'intérieur, les trous de contour bouchés). */
  mask: Uint8Array
  /** 1 = ajouté autour des traits pour qu'un trait fin puisse être cousu
      (il prend la couleur de son trait). */
  band: Uint8Array
  /** La distance au bord de la peluche, en pixels (0 dehors). */
  dist: Float32Array
}

export interface PlushMesh {
  /** Les sommets, en pixels du dessin : x vers la droite (0 au milieu),
      y vers le haut (0 sous les pieds), z l'épaisseur (+ devant, − dos). */
  pos: Float32Array
  /** Leur place sur le dessin (0..1, v vers le haut comme une texture). */
  uv: Float32Array
  index: Uint32Array
  /** Les coutures : chaque boucle, ses points sur le dessin (pixels, y vers le bas). */
  seams: [number, number][][]
  /** La boîte occupée sur le dessin (pixels). */
  box: { x0: number; y0: number; x1: number; y1: number }
}

/** Au-dessous, un pixel n'est que le flou du bord d'un trait. */
const INK_ALPHA = 40
const BIG = 1e20
/** Le tissu d'une zone cernée de noir : la couleur d'une peluche neuve. */
const CREAM: [number, number, number] = [247, 239, 226]

const count = (m: Uint8Array) => { let n = 0; for (let i = 0; i < m.length; i++) n += m[i]; return n }

export function inkMask(img: Rgba): Uint8Array {
  const n = img.width * img.height, m = new Uint8Array(n)
  for (let i = 0; i < n; i++) m[i] = img.data[i * 4 + 3] > INK_ALPHA ? 1 : 0
  return m
}

/* ---------- Distances (Felzenszwalb et Huttenlocher, en deux passes) ---------- */

function edt1(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0
  v[0] = 0; z[0] = -BIG; z[1] = BIG
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]) }
    k++; v[k] = q; z[k] = s; z[k + 1] = BIG
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
  }
}

/** Le carré de la distance de chaque pixel au plus proche pixel où `m` vaut `to`. */
function sqDist(m: Uint8Array, w: number, h: number, to: 0 | 1): Float64Array {
  const out = new Float64Array(w * h), n = Math.max(w, h)
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1)
  for (let i = 0; i < w * h; i++) out[i] = m[i] === to ? 0 : BIG
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = out[y * w + x]
    edt1(f, h, d, v, z)
    for (let y = 0; y < h; y++) out[y * w + x] = d[y]
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = out[y * w + x]
    edt1(f, w, d, v, z)
    for (let x = 0; x < w; x++) out[y * w + x] = d[x]
  }
  return out
}

export function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const d = sqDist(m, w, h, 1), out = new Uint8Array(w * h), r2 = r * r
  for (let i = 0; i < w * h; i++) out[i] = d[i] <= r2 ? 1 : 0
  return out
}

/** Les zones fermées : ce que l'eau versée depuis les bords n'atteint pas. */
export function fillHoles(m: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h).fill(1), stack = new Int32Array(w * h)
  let top = 0
  const push = (i: number) => { if (m[i] === 0 && out[i] === 1) { out[i] = 0; stack[top++] = i } }
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x) }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1) }
  while (top) {
    const i = stack[--top], x = i % w
    if (x > 0) push(i - 1)
    if (x < w - 1) push(i + 1)
    if (i >= w) push(i - w)
    if (i < w * (h - 1)) push(i + w)
  }
  return out
}

/** Le plus grand morceau d'un seul tenant (le soleil dessiné à côté reste sur la feuille). */
export function largest(m: Uint8Array, w: number, h: number): Uint8Array {
  const label = new Int32Array(w * h), stack = new Int32Array(w * h)
  let best = 0, bestN = 0, cur = 0
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || label[s]) continue
    cur++
    let top = 0, n = 0
    label[s] = cur; stack[top++] = s
    while (top) {
      const i = stack[--top], x = i % w, y = (i - x) / w
      n++
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (m[j] && !label[j]) { label[j] = cur; stack[top++] = j }
      }
    }
    if (n > bestN) { bestN = n; best = cur }
  }
  const out = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) out[i] = label[i] === best ? 1 : 0
  return out
}

/* ---------- La silhouette ---------- */

/** Un trait de son dessin, tel qu'elle l'a tracé (pixels de la feuille). */
export interface Stroke { pts: [number, number][]; width: number }

const len = (pts: [number, number][]) => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l }

/**
 * Les trous de contour à refermer, en segments [x0, y0, x1, y1] : le début
 * et la fin d'un même trait qui se rejoignent presque (un tour qu'elle n'a
 * pas tout à fait fini), ou la fin d'un trait et le début du suivant (elle
 * a levé le doigt et repris). Deux traits différents qui se frôlent ne sont
 * jamais reliés : l'écart entre deux pattes reste ouvert. `size` : le grand
 * côté du dessin.
 */
export function bridges(strokes: Stroke[], size: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = []
  strokes.forEach((s, i) => {
    if (s.pts.length < 2) return
    const a = s.pts[0], b = s.pts[s.pts.length - 1], gap = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (gap > s.width && gap < 0.14 * size && len(s.pts) > 4 * gap) out.push([b[0], b[1], a[0], a[1]])
    const nx = strokes[i + 1]
    if (nx?.pts.length) {
      const c = nx.pts[0], g2 = Math.hypot(c[0] - b[0], c[1] - b[1])
      if (g2 > s.width && g2 < 0.06 * size) out.push([b[0], b[1], c[0], c[1]])
    }
  })
  return out
}

function drawSegment(m: Uint8Array, w: number, h: number, [x0, y0, x1, y1]: [number, number, number, number], r: number) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) + 1
  for (let k = 0; k <= n; k++) {
    const cx = x0 + (x1 - x0) * k / n, cy = y0 + (y1 - y0) * k / n
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (x >= 0 && y >= 0 && x < w && y < h && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) m[y * w + x] = 1
    }
  }
}

/**
 * La forme de la peluche. Avec ses traits (`bridges`, en pixels de l'image),
 * seuls ses vrais trous de contour sont bouchés. Sans eux (une image seule),
 * le contour est épaissi jusqu'à ce qu'il enferme quelque chose (trois
 * essais, du plus fidèle au plus généreux). Dans les deux cas, seul
 * l'intérieur trouvé est ajouté : jamais de comblement autour. Un trait
 * trop fin pour être cousu s'épaissit un peu. `null` : rien de dessiné.
 */
export function silhouette(img: Rgba, o: { bridges?: [number, number, number, number][] } = {}): Silhouette | null {
  const w = img.width, h = img.height
  const ink = inkMask(img)
  if (count(ink) < 30) return null
  const long = Math.max(w, h)
  const closed = ink.slice()
  for (const b of o.bridges ?? []) drawSegment(closed, w, h, b, Math.max(1, 0.006 * long))
  const radii = o.bridges ? [1] : [0.012, 0.028, 0.05].map(f => Math.max(1, Math.round(f * long)))
  const tries = radii.map(r => {
    const grown = dilate(closed, w, h, r)
    const filled = fillHoles(grown, w, h)
    const holes = new Uint8Array(w * h)
    for (let i = 0; i < w * h; i++) holes[i] = filled[i] & (grown[i] ^ 1)
    return { r, grown, holes, n: count(holes) }
  })
  const most = Math.max(...tries.map(t => t.n))
  const t = tries.find(t => t.n >= 0.6 * most) ?? tries[0]
  // L'intérieur trouvé, rendu jusqu'aux traits (la bande que l'épaississement avait prise)
  const near = dilate(t.holes, w, h, t.r + 1)
  const shape = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) shape[i] = closed[i] | t.holes[i] | (near[i] & t.grown[i])
  const mask = largest(dilate(shape, w, h, Math.max(1, Math.round(0.008 * long))), w, h)
  const band = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) band[i] = mask[i] & (shape[i] ^ 1)
  const d2 = sqDist(mask, w, h, 0), dist = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) dist[i] = Math.sqrt(d2[i])
  return { w, h, ink, mask, band, dist }
}

/* ---------- Le tissu ---------- */

/** Les traits voisins d'une zone, par couleur : combien, et leur somme. */
type Bin = { n: number; r: number; g: number; b: number }
const mix = (c: number[], k: number) => c.map(v => Math.round(v + (255 - v) * k))

/**
 * La couleur du tissu, pixel par pixel (RGBA, opaque dans la peluche et
 * débordant de 3 pixels autour, pour que le bord de la texture ne bave
 * pas). Chaque zone vide entre ses traits prend la couleur des traits qui
 * la bordent le plus : un contour rose donne un tissu rose pâle, des
 * gribouillis serrés donnent leur couleur presque pure, un contour noir
 * donne un tissu crème (un œil cerclé de noir, minuscule, reste noir). Le
 * noir des yeux et des moustaches ne l'emporte que si aucune couleur n'a
 * au moins 30 % des voix.
 */
export function fabric(img: Rgba, sil: Silhouette): Uint8ClampedArray {
  const { w, h, ink, mask, band } = sil, n = w * h, src = img.data
  const out = new Uint8ClampedArray(n * 4)
  const area = count(mask)
  const label = new Int32Array(n), stack = new Int32Array(n)
  const set = (i: number, c: number[]) => { out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255 }
  // Ses traits gardent leur couleur, et la donnent à ce qui a été ajouté autour
  const inked = new Uint8Array(n)
  let top = 0
  for (let i = 0; i < n; i++) if (ink[i] && mask[i]) { set(i, [src[i * 4], src[i * 4 + 1], src[i * 4 + 2]]); inked[i] = 1; stack[top++] = i }
  for (let at = 0; at < top; at++) {
    const i = stack[at], x = i % w
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j < 0 || j >= n || !band[j] || inked[j]) continue
      inked[j] = 1; set(j, [out[i * 4], out[i * 4 + 1], out[i * 4 + 2]]); stack[top++] = j
    }
  }
  let cur = 0
  for (let s = 0; s < n; s++) {
    if (!mask[s] || inked[s] || label[s]) continue
    cur++
    const members: number[] = []
    const bins = new Map<number, Bin>()
    let top = 0
    label[s] = cur; stack[top++] = s
    while (top) {
      const i = stack[--top], x = i % w
      members.push(i)
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= n) continue
        if (inked[j]) {
          const r = out[j * 4], g = out[j * 4 + 1], b = out[j * 4 + 2]
          const key = (r >> 5) << 6 | (g >> 5) << 3 | b >> 5
          const e = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
          e.n++; e.r += r; e.g += g; e.b += b
          bins.set(key, e)
        } else if (mask[j] && !label[j]) { label[j] = cur; stack[top++] = j }
      }
    }
    // Le noir (yeux, moustaches, bouche) ne vote que si aucune couleur n'a sa part
    const luma = (e: Bin) => (0.299 * e.r + 0.587 * e.g + 0.114 * e.b) / e.n
    let total = 0, best: Bin | null = null, bestCol: Bin | null = null
    for (const e of bins.values()) {
      total += e.n
      if (!best || e.n > best.n) best = e
      if (luma(e) >= 70 && (!bestCol || e.n > bestCol.n)) bestCol = e
    }
    if (bestCol && bestCol.n >= 0.3 * total) best = bestCol
    let c: number[] = CREAM
    if (best) {
      const col = [best.r / best.n, best.g / best.n, best.b / best.n]
      const frac = members.length / area
      if (luma(best) < 70) c = frac < 0.004 ? mix(col, 0.12) : CREAM
      else c = mix(col, frac < 0.02 ? 0.15 : 0.45)
    }
    for (const i of members) set(i, c)
  }
  // Le débordement : trois tours, chaque pixel vide prend un voisin coloré
  for (let pass = 0; pass < 3; pass++) {
    const prev = out.slice()
    for (let i = 0; i < n; i++) {
      if (prev[i * 4 + 3]) continue
      const x = i % w
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= n || !prev[j * 4 + 3]) continue
        out[i * 4] = prev[j * 4]; out[i * 4 + 1] = prev[j * 4 + 1]; out[i * 4 + 2] = prev[j * 4 + 2]; out[i * 4 + 3] = 255
        break
      }
    }
  }
  return out
}

/* ---------- Le gonflement et le maillage ---------- */

function blur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const rad = Math.ceil(sigma * 3), k = new Float32Array(rad * 2 + 1)
  let sum = 0
  for (let i = -rad; i <= rad; i++) { k[i + rad] = Math.exp(-i * i / (2 * sigma * sigma)); sum += k[i + rad] }
  for (let i = 0; i < k.length; i++) k[i] /= sum
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0
    for (let i = -rad; i <= rad; i++) a += src[y * w + Math.min(w - 1, Math.max(0, x + i))] * k[i + rad]
    tmp[y * w + x] = a
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0
    for (let i = -rad; i <= rad; i++) a += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] * k[i + rad]
    out[y * w + x] = a
  }
  return out
}

function sample(f: Float32Array, w: number, h: number, x: number, y: number): number {
  // Coordonnées en pixels (le centre du pixel i est en i + 0,5)
  const fx = Math.min(w - 1.001, Math.max(0, x - 0.5)), fy = Math.min(h - 1.001, Math.max(0, y - 0.5))
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0
  const i = y0 * w + x0
  return (f[i] * (1 - tx) + f[i + 1] * tx) * (1 - ty) + (f[i + w] * (1 - tx) + f[i + w + 1] * tx) * ty
}

/**
 * Le maillage de la peluche. Le bord suit la silhouette lissée (un sommet
 * par case de la grille qui la traverse, à la moyenne de ses passages :
 * pas d'escalier), et le devant et le dos s'y rejoignent — la couture.
 * L'épaisseur croît comme la racine de la distance au bord : une patte
 * fine devient un boudin rond, le ventre un coussin (`puff` : la demi-
 * épaisseur au plus large, en part de la demi-largeur, jamais plus que rond). `step` : la maille,
 * en pixels.
 */
export function inflate(sil: Silhouette, o: { step?: number; puff?: number } = {}): PlushMesh {
  const { w, h, mask, dist } = sil
  const g = o.step ?? 2, puff = o.puff ?? 0.5
  const mf = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) mf[i] = mask[i]
  const soft = blur(mf, w, h, 1)
  const phi = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) phi[i] = soft[i] - 0.5
  let dmax = 1
  for (let i = 0; i < w * h; i++) if (dist[i] > dmax) dmax = dist[i]
  const k = puff * Math.sqrt(dmax)
  const hm = new Float32Array(w * h)
  // Jamais plus épais que rond : une patte reste un boudin, pas une planche de chant
  for (let i = 0; i < w * h; i++) hm[i] = mask[i] ? Math.min(k * Math.sqrt(dist[i]), 1.1 * dist[i] + 0.5) : 0
  // La crête du milieu (là où la distance plie) adoucie, sans déborder du tissu
  const num = blur(hm, w, h, 1.6), den = blur(mf, w, h, 1.6)
  const height = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) height[i] = den[i] > 0.01 ? num[i] / den[i] : 0

  const gx = Math.floor((w - 1) / g) + 1, gy = Math.floor((h - 1) / g) + 1
  const P = (i: number, j: number) => phi[(j * g) * w + i * g]
  const cw = gx - 1, ch = gy - 1
  const cellV = new Int32Array(cw * ch).fill(-1)
  const vx: number[] = [], vy: number[] = []
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1)
    const ins = +(a > 0) + +(b > 0) + +(c > 0) + +(d > 0)
    if (!ins) continue
    const x0 = i * g + 0.5, y0 = j * g + 0.5
    let px = x0 + g / 2, py = y0 + g / 2
    if (ins < 4) {
      let sx = 0, sy = 0, m = 0
      const cross = (p: number, q: number, ax: number, ay: number, bx: number, by: number) => {
        if ((p > 0) === (q > 0)) return
        const t = p / (p - q)
        sx += ax + (bx - ax) * t; sy += ay + (by - ay) * t; m++
      }
      cross(a, b, x0, y0, x0 + g, y0)
      cross(b, c, x0 + g, y0, x0 + g, y0 + g)
      cross(d, c, x0, y0 + g, x0 + g, y0 + g)
      cross(a, d, x0, y0, x0, y0 + g)
      px = sx / m; py = sy / m
    }
    cellV[j * cw + i] = vx.length
    vx.push(px); vy.push(py)
  }

  // Les mailles : une par point de la grille dans la peluche, entre ses quatre cases
  const quads: number[] = []
  for (let j = 1; j < gy - 1; j++) for (let i = 1; i < gx - 1; i++) {
    if (P(i, j) <= 0) continue
    quads.push(cellV[(j - 1) * cw + i - 1], cellV[(j - 1) * cw + i], cellV[j * cw + i], cellV[j * cw + i - 1])
  }
  // Les arêtes des mailles : une arête qui n'a qu'une maille est le bord, la couture
  const edges = new Map<number, number>()
  const edge = (p: number, q: number) => { const key = Math.min(p, q) * vx.length + Math.max(p, q); edges.set(key, (edges.get(key) ?? 0) + 1) }
  for (let q = 0; q < quads.length; q += 4) {
    edge(quads[q], quads[q + 1]); edge(quads[q + 1], quads[q + 2]); edge(quads[q + 2], quads[q + 3]); edge(quads[q + 3], quads[q])
  }
  // Seul un sommet posé sur la couture y est cousu (z = 0, partagé par le
  // devant et le dos) ; une case traversée par la silhouette mais entourée
  // de mailles garde son épaisseur, sinon devant et dos s'y colleraient
  const seam = new Uint8Array(vx.length), used = new Uint8Array(vx.length)
  for (const q of quads) used[q] = 1
  for (const [key, n] of edges) if (n === 1) { seam[Math.floor(key / vx.length)] = 1; seam[key % vx.length] = 1 }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let v = 0; v < vx.length; v++) if (used[v]) {
    x0 = Math.min(x0, vx[v]); x1 = Math.max(x1, vx[v]); y0 = Math.min(y0, vy[v]); y1 = Math.max(y1, vy[v])
  }
  const cx = (x0 + x1) / 2
  const front = new Int32Array(vx.length).fill(-1), back = new Int32Array(vx.length).fill(-1)
  const pos: number[] = [], uv: number[] = []
  const add = (v: number, z: number) => {
    pos.push(vx[v] - cx, y1 - vy[v], z)
    uv.push(vx[v] / w, 1 - vy[v] / h)
    return pos.length / 3 - 1
  }
  for (let v = 0; v < vx.length; v++) {
    if (!used[v]) continue
    if (seam[v]) { front[v] = back[v] = add(v, 0); continue }
    const z = Math.max(0.2, sample(height, w, h, vx[v], vy[v]))
    front[v] = add(v, z)
    back[v] = add(v, -z)
  }
  const index: number[] = []
  for (let q = 0; q < quads.length; q += 4) {
    let A = quads[q], B = quads[q + 1], C = quads[q + 2], D = quads[q + 3]
    // La diagonale ne relie jamais deux points de couture (devant et dos s'y confondraient)
    if (seam[A] && seam[C]) [A, B, C, D] = [B, C, D, A]
    // Le devant regarde vers +z (y monte : A en haut à gauche, D en bas à gauche)
    index.push(front[A], front[D], front[C], front[A], front[C], front[B])
    index.push(back[A], back[C], back[D], back[A], back[B], back[C])
  }

  // Les coutures : les arêtes du devant qui n'ont qu'une maille, mises bout à bout
  const next = new Map<number, number[]>()
  for (const [key, n] of edges) {
    if (n !== 1) continue
    const p = Math.floor(key / vx.length), q = key % vx.length
    next.set(p, [...(next.get(p) ?? []), q]); next.set(q, [...(next.get(q) ?? []), p])
  }
  const seams: [number, number][][] = []
  const seen = new Set<number>()
  for (const start of next.keys()) {
    if (seen.has(start)) continue
    const loop: [number, number][] = []
    let prev = -1, at = start
    while (at >= 0 && !seen.has(at)) {
      seen.add(at); loop.push([vx[at], vy[at]])
      const nb = (next.get(at) ?? []).filter(v => v !== prev && !seen.has(v))
      prev = at; at = nb.length ? nb[0] : -1
    }
    if (loop.length > 2) seams.push(loop)
  }
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), index: new Uint32Array(index), seams, box: { x0, y0, x1, y1 } }
}
