/* 🏺 LA TERRE DU TOUR (27/10, la Poterie) — la logique pure, sans 3D :
   une pièce est UN profil de révolution, quelques dizaines de rayons de bas
   en haut (`ROWS`), sa hauteur, et la profondeur de son creux. Les gestes
   ne font que changer ces nombres ; `pottery3d.ts` en fait la géométrie
   (toujours le même nombre de sommets : seules les positions bougent).
   Unités : celles de la scène (le plateau du tour fait 0,42 de rayon).
   Testé (`pottery.test.ts`). */

export const ROWS = 36
export const MIN_H = 0.14, MAX_H = 0.92
export const MIN_R = 0.04, MAX_R = 0.46
/** L'épaisseur de la paroi. */
export const WALL = 0.034
/** Le fond reste au moins aussi épais. */
const FLOOR = 0.05

export interface Clay {
  /** Les rayons extérieurs, de y = 0 (le pied) à y = h (la lèvre), `ROWS` valeurs. */
  r: number[]
  h: number
  /** La profondeur du creux sous la lèvre (0 : une motte pleine). */
  depth: number
}

export type Preset = 'motte' | 'bol' | 'vase' | 'pot'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const rows = (f: (k: number) => number) => Array.from({ length: ROWS }, (_, i) => f(i / (ROWS - 1)))

/** Les formes de départ en un toucher (Jade) : la motte, le bol, le vase, le pot. */
export function preset(p: Preset): Clay {
  if (p === 'bol') return { h: 0.24, depth: 0.19, r: rows(k => 0.15 + 0.2 * Math.sin(Math.min(1, k * 1.25) * Math.PI / 2) + 0.012 * k) }
  if (p === 'vase') return { h: 0.74, depth: 0.66, r: rows(k => 0.11 + 0.15 * Math.exp(-(((k - 0.32) / 0.22) ** 2)) - 0.04 * Math.exp(-(((k - 0.78) / 0.1) ** 2)) + 0.05 * Math.max(0, k - 0.82) / 0.18) }
  if (p === 'pot') return { h: 0.42, depth: 0.36, r: rows(k => 0.2 + 0.035 * Math.sin(k * Math.PI) + (k > 0.9 ? 0.02 * (k - 0.9) / 0.1 : 0)) }
  // La motte : une boule écrasée, posée au milieu du plateau
  return { h: 0.27, depth: 0, r: rows(k => 0.06 + 0.2 * Math.sqrt(Math.max(0, 1 - Math.pow(k, 2.6))) + 0.03 * (1 - k)) }
}

export const copyClay = (c: Clay): Clay => ({ r: c.r.slice(), h: c.h, depth: c.depth })

/** Le rayon extérieur à la hauteur y. */
export function rAt(c: Clay, y: number) {
  const f = clamp(y / c.h, 0, 1) * (ROWS - 1), i = Math.min(ROWS - 2, Math.floor(f)), k = f - i
  return c.r[i] * (1 - k) + c.r[i + 1] * k
}

/** La hauteur du fond du creux. */
export const floorY = (c: Clay) => c.h - c.depth

/** Lisse le profil (`passes` fois, les deux bouts tenus) : la terre tourne, elle n'a pas d'arête. */
export function smooth(r: number[], passes = 1, k = 0.5) {
  for (let p = 0; p < passes; p++) {
    let prev = r[0]
    for (let i = 1; i < r.length - 1; i++) {
      const cur = r[i]
      r[i] = cur + k * ((prev + r[i + 1]) / 2 - cur)
      prev = cur
    }
  }
  return r
}

/** Garde la pièce tournable : rayons bornés, un creux qui laisse un fond et une paroi. */
export function settle(c: Clay) {
  c.h = clamp(c.h, MIN_H, MAX_H)
  for (let i = 0; i < ROWS; i++) c.r[i] = clamp(c.r[i], MIN_R, MAX_R)
  // Pas de goulot plus fin que deux parois (la terre s'écroulerait)
  if (c.depth > 0) {
    const y0 = floorY(c)
    for (let i = 0; i < ROWS; i++) if (i / (ROWS - 1) * c.h >= y0 - 0.02) c.r[i] = Math.max(c.r[i], WALL * 2 + 0.025)
  }
  c.depth = clamp(c.depth, 0, Math.max(0, c.h - FLOOR))
  return c
}

/** Le doigt qui monte (`dy` > 0) étire la terre vers le haut ; qui descend, la tasse.
    Le volume reste à peu près le même : plus haute, elle s'affine. */
export function raise(c: Clay, dy: number) {
  const h0 = c.h
  const h1 = clamp(h0 + dy, MIN_H, MAX_H)
  if (h1 === h0) return c
  const k = Math.sqrt(h0 / h1)
  for (let i = 0; i < ROWS; i++) c.r[i] *= k
  c.depth *= h1 / h0
  c.h = h1
  return settle(c)
}

/** Sur le côté, à la hauteur y : `dr` > 0 l'évase, < 0 la resserre (en douceur, autour du doigt). */
export function shape(c: Clay, y: number, dr: number, spread = 0.12) {
  const s = Math.max(0.05, spread * Math.max(0.6, c.h / 0.5))
  for (let i = 0; i < ROWS; i++) {
    const yi = i / (ROWS - 1) * c.h
    const w = Math.exp(-(((yi - y) / s) ** 2))
    c.r[i] += dr * w
  }
  smooth(c.r, 1, 0.35)
  return settle(c)
}

/** Au centre : le doigt creuse (`dd` > 0), ou remonte le fond. */
export function hollow(c: Clay, dd: number) {
  c.depth += dd
  // Un creux qui s'ouvre élargit un peu la lèvre (le doigt pousse la terre)
  if (dd > 0 && c.depth < 0.2) for (let i = ROWS - 4; i < ROWS; i++) c.r[i] += dd * 0.12 * (i - ROWS + 5) / 4
  return settle(c)
}

/** Le chemin du profil (rayon, hauteur) et ses normales (vers l'extérieur de la
    matière) : le pied, la paroi extérieure, la lèvre arrondie, la paroi
    intérieure, le fond du creux. TOUJOURS le même nombre de points (`PATH`) :
    sans creux, la paroi intérieure se couche sur le dessus de la motte.
    `v` : la coordonnée de texture (la hauteur peinte, de 0 au pied à 1 à la lèvre). */
export const LIP = 6, INNER = 18, BASE = 3
export const PATH = BASE + ROWS + LIP + INNER
export function profilePath(c: Clay) {
  const pts: [number, number][] = [], v: number[] = []
  const top = c.r[ROWS - 1]
  // Le pied : du centre au bord, sur le plateau
  for (let i = 0; i < BASE; i++) { pts.push([c.r[0] * i / BASE * 0.98 + 0.0005, 0]); v.push(0) }
  // La paroi extérieure
  for (let i = 0; i < ROWS; i++) { pts.push([c.r[i], i / (ROWS - 1) * c.h]); v.push(0.02 + 0.9 * i / (ROWS - 1)) }
  // La lèvre : un demi-rond de la largeur de la paroi
  const th = Math.min(WALL, top * 0.5)
  for (let i = 1; i <= LIP; i++) {
    const a = i / (LIP + 1) * Math.PI
    pts.push([top - th / 2 + Math.cos(a) * th / 2, c.h + Math.sin(a) * th * (c.depth > 0.004 ? 0.45 : 0.12)]); v.push(0.93 + 0.03 * i / LIP)
  }
  // Dedans : la paroi qui descend (ou le dessus de la motte), puis le fond
  const y0 = floorY(c), deep = c.depth > 0.004
  const ri = (y: number) => Math.max(0.012, rAt(c, y) - th)
  const wallN = Math.round(INNER * 0.7), floorN = INNER - wallN
  const dome = 0.035 * clamp(1 - c.depth / 0.08, 0, 1) * Math.min(1, top / 0.12)
  for (let i = 0; i < wallN; i++) {
    const y = c.h - (c.h - y0) * (i + 1) / wallN
    pts.push([deep ? ri(y) : ri(c.h) * (1 - (i + 1) / (wallN + floorN) * 0.6), deep ? y : c.h + dome * ((i + 1) / wallN) * 0.6]); v.push(0.97)
  }
  const rf = pts[pts.length - 1][0], yf = pts[pts.length - 1][1]
  for (let i = 1; i <= floorN; i++) {
    const k = i / floorN
    const x = rf * (1 - k)
    pts.push([Math.max(0.0005, x), deep ? y0 + 0.006 * (1 - k) : yf + (c.h + dome - yf) * Math.sin(k * Math.PI / 2)]); v.push(0.99)
  }
  // Les normales : la perpendiculaire du chemin, tournée vers la matière extérieure
  const n: [number, number][] = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1
    return [dy / l, -dx / l]
  })
  // Le pied regarde vers le bas
  for (let i = 0; i < BASE; i++) n[i] = [0, -1]
  return { pts, n, v }
}

/* ---------- La peinture : des traits en (angle, hauteur), jamais une image ----------
   `u` : le tour (0 → 1, déroulé : un trait tenu qui fait deux tours va de 0,3
   à 2,3), `v` : la hauteur peinte (celle de `profilePath`). */
export interface Band { k: 'b'; c: string; w: number; p: number[] }
export interface Dots { k: 'd'; c: string; u: number; v: number; n: number }
export type PaintOp = Band | Dots

export interface PotData { clay: Clay; paint: PaintOp[]; glazed: boolean }

export const MAX_OPS = 80, MAX_PTS = 600
const q = (x: number, k = 1000) => Math.round(x * k) / k

/** Une pièce telle qu'on la garde (quelques centaines d'octets) — relue par `readPot`. */
export function packPot(p: PotData) {
  return {
    h: q(p.clay.h), d: q(p.clay.depth), r: p.clay.r.map(x => q(x)), g: p.glazed ? 1 : 0,
    p: p.paint.slice(-MAX_OPS).map(o => o.k === 'b' ? { k: 'b', c: o.c, w: q(o.w), p: o.p.slice(0, MAX_PTS * 2).map(x => q(x)) } : { ...o, u: q(o.u), v: q(o.v) })
  }
}
const isColor = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)
/** Relit une pièce gardée ; `null` si elle est abîmée. */
export function readPot(x: unknown): PotData | null {
  const o = x as { h?: unknown; d?: unknown; r?: unknown; g?: unknown; p?: unknown } | null
  if (!o || typeof o.h !== 'number' || typeof o.d !== 'number' || !Array.isArray(o.r) || o.r.length !== ROWS || !o.r.every(v => typeof v === 'number' && isFinite(v))) return null
  const paint: PaintOp[] = []
  if (Array.isArray(o.p)) for (const op of o.p as Record<string, unknown>[]) {
    if (!op || !isColor(op.c)) continue
    if (op.k === 'b' && Array.isArray(op.p) && typeof op.w === 'number' && op.p.length >= 2 && op.p.every(v => typeof v === 'number')) paint.push({ k: 'b', c: op.c, w: op.w, p: (op.p as number[]).slice(0, MAX_PTS * 2) })
    else if (op.k === 'd' && typeof op.u === 'number' && typeof op.v === 'number' && typeof op.n === 'number') paint.push({ k: 'd', c: op.c, u: op.u, v: op.v, n: Math.round(clamp(op.n, 1, 24)) })
  }
  return { clay: settle({ h: o.h, depth: o.d, r: (o.r as number[]).slice() }), paint: paint.slice(-MAX_OPS), glazed: o.g === 1 }
}

/** La motte fraîche, rien de peint. */
export const freshPot = (): PotData => ({ clay: preset('motte'), paint: [], glazed: false })
/** Une pièce encore « motte » (rien n'a été modelé ni peint) : inutile de la garder sur l'étagère. */
export function isBlank(p: PotData) {
  const m = preset('motte')
  return !p.paint.length && p.clay.depth === 0 && Math.abs(p.clay.h - m.h) < 0.005 && p.clay.r.every((v, i) => Math.abs(v - m.r[i]) < 0.005)
}
