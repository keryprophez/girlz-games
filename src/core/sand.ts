/* 🏰 LE SABLE du Château de sable (27/10) — la logique pure, sans 3D : une
   grille de hauteurs (`N` × `N` cases sur `SIZE` mètres), son humidité (le
   sable mouillé, plus sombre, tient les formes) et le niveau de l'eau dans
   les creux. Chaque geste ne touche que sa zone, et la note (`dirty`) :
   `beach3d.ts` ne renvoie que ces sommets-là à la carte graphique.
   - creuser (la Pelle) : le sable retiré s'amoncelle autour du trou, jamais
     dans le trou qu'on est en train de tracer (les douves) ;
   - lisser (la Main) : il s'étale vers ses voisins ; tasser : il se mouille ;
   - les moules : la forme posée sur le sable (tour ronde, tour crénelée,
     coquillage, étoile, tortue) ;
   - l'eau : versée dans un creux, elle le remplit jusqu'au niveau que
     permet son volume (un remplissage par le bas, comme une vraie flaque).
   La sauvegarde : la grille quantifiée et compressée (quelques Ko). Testé
   (`sand.test.ts`). */

export const N = 128
export const SIZE = 2.8
export const CELL = SIZE / (N - 1)
/** Les bornes des hauteurs (au-delà, le sable ne tient pas). */
export const H_MIN = -0.3, H_MAX = 0.5
const DRY = -1

export interface Rect { i0: number; j0: number; i1: number; j1: number }
export interface Sand {
  /** La hauteur de chaque case (i : le long de x, j : le long de z ; case = j·N + i). */
  h: Float32Array
  /** L'humidité (0 sec → 1 trempé). */
  wet: Float32Array
  /** Le niveau de l'eau (une hauteur), `DRY` (−1) s'il n'y en a pas. */
  wl: Float32Array
  dirty: Rect | null
}

export const makeSand = (): Sand => ({ h: new Float32Array(N * N), wet: new Float32Array(N * N), wl: new Float32Array(N * N).fill(DRY), dirty: null })

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
/** La case la plus proche d'un point (x, z) en mètres, le centre de la plage en (0, 0). */
export const cellOf = (x: number, z: number): [number, number] => [(x + SIZE / 2) / CELL, (z + SIZE / 2) / CELL]
export const posOf = (i: number, j: number): [number, number] => [i * CELL - SIZE / 2, j * CELL - SIZE / 2]
export const inside = (x: number, z: number) => Math.abs(x) <= SIZE / 2 && Math.abs(z) <= SIZE / 2

function mark(s: Sand, i0: number, j0: number, i1: number, j1: number) {
  i0 = clamp(Math.floor(i0), 0, N - 1); j0 = clamp(Math.floor(j0), 0, N - 1)
  i1 = clamp(Math.ceil(i1), 0, N - 1); j1 = clamp(Math.ceil(j1), 0, N - 1)
  const d = s.dirty
  s.dirty = d ? { i0: Math.min(d.i0, i0), j0: Math.min(d.j0, j0), i1: Math.max(d.i1, i1), j1: Math.max(d.j1, j1) } : { i0, j0, i1, j1 }
}
/** La zone à renvoyer depuis la dernière fois (et l'oublie). */
export function takeDirty(s: Sand) { const d = s.dirty; s.dirty = null; return d }

/** La hauteur du sable en (x, z), interpolée. */
export function heightAt(s: Sand, x: number, z: number) {
  const [fi, fj] = cellOf(x, z)
  const i = clamp(Math.floor(fi), 0, N - 2), j = clamp(Math.floor(fj), 0, N - 2)
  const u = clamp(fi - i, 0, 1), v = clamp(fj - j, 0, 1)
  const a = s.h[j * N + i], b = s.h[j * N + i + 1], c = s.h[(j + 1) * N + i], d = s.h[(j + 1) * N + i + 1]
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}
/** La surface (sable ou eau) en (x, z) : là où l'on pose un objet. */
export function surfaceAt(s: Sand, x: number, z: number) {
  const [fi, fj] = cellOf(x, z)
  const k = clamp(Math.round(fj), 0, N - 1) * N + clamp(Math.round(fi), 0, N - 1)
  return Math.max(heightAt(s, x, z), s.wl[k] > s.h[k] ? s.wl[k] : -Infinity)
}

/** Les cases d'un disque (rayon en mètres) : (case, poids 0..1 du centre au bord). */
function disc(x: number, z: number, r: number, f: (k: number, w: number, d: number) => void) {
  const [ci, cj] = cellOf(x, z), rc = r / CELL
  for (let j = Math.max(0, Math.floor(cj - rc)); j <= Math.min(N - 1, Math.ceil(cj + rc)); j++)
    for (let i = Math.max(0, Math.floor(ci - rc)); i <= Math.min(N - 1, Math.ceil(ci + rc)); i++) {
      const d = Math.hypot(i - ci, j - cj) / rc
      if (d < 1) f(j * N + i, 1 - d * d * (3 - 2 * d), d)
    }
}

/** Le sable sec qui coule : une pente plus raide que le talus naturel s'éboule
    (le sable mouillé, lui, tient : les tours ne s'écroulent pas). */
function relax(s: Sand, x: number, z: number, r: number, passes = 2) {
  const [ci, cj] = cellOf(x, z), rc = Math.ceil(r / CELL)
  const i0 = Math.max(1, Math.floor(ci - rc)), i1 = Math.min(N - 2, Math.ceil(ci + rc))
  const j0 = Math.max(1, Math.floor(cj - rc)), j1 = Math.min(N - 2, Math.ceil(cj + rc))
  const max = CELL * 0.75
  for (let p = 0; p < passes; p++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * N + i
    if (s.wet[k] > 0.45) continue
    for (const n of [k + 1, k - 1, k + N, k - N]) {
      const dh = s.h[k] - s.h[n]
      if (dh > max) { const m = (dh - max) / 2 * 0.6; s.h[k] -= m; s.h[n] += m }
    }
  }
  mark(s, i0 - 1, j0 - 1, i1 + 1, j1 + 1)
}

/** La Pelle : creuse un trou en (x, z) ; le sable retiré s'amoncelle en bourrelet
    autour, sauf sur les cases marquées (`dug` : le trait de douves en cours).
    Renvoie le volume retiré (m³). */
export function dig(s: Sand, x: number, z: number, r = 0.08, depth = 0.03, dug?: Uint8Array) {
  let vol = 0
  disc(x, z, r, (k, w) => {
    const take = Math.min(depth * w, s.h[k] - H_MIN)
    if (take <= 0) return
    s.h[k] -= take
    vol += take * CELL * CELL
    // Le fond d'un trou est humide (on creuse jusqu'à l'eau)
    s.wet[k] = Math.min(1, s.wet[k] + 0.35 * w + (s.h[k] < -0.05 ? 0.3 : 0))
    if (dug && w > 0.2) dug[k] = 1
  })
  if (vol <= 0) return 0
  // Le bourrelet : un anneau autour, plus épais au milieu de l'anneau
  const ring: [number, number][] = []
  let sum = 0
  disc(x, z, r * 2.1, (k, _w, d) => {
    if (d * 2.1 < 1.05 || (dug && dug[k])) return
    const w = Math.max(0, 1 - Math.abs(d * 2.1 - 1.45) / 0.6)
    if (w > 0) { ring.push([k, w]); sum += w }
  })
  if (sum > 0) for (const [k, w] of ring) { s.h[k] = Math.min(H_MAX, s.h[k] + vol * w / sum / (CELL * CELL)); s.wet[k] = Math.min(1, s.wet[k] + 0.12 * w) }
  relax(s, x, z, r * 2.3)
  mark(s, ...cellOf(x - r * 2.3, z - r * 2.3), ...cellOf(x + r * 2.3, z + r * 2.3))
  return vol
}

/** La Main qui passe : le sable s'étale vers la moyenne de ses voisins (`k` : la force). */
export function smoothAt(s: Sand, x: number, z: number, r = 0.1, k = 0.5) {
  const src = new Map<number, number>()
  disc(x, z, r, (c) => {
    const i = c % N, j = (c - i) / N
    if (i < 1 || j < 1 || i > N - 2 || j > N - 2) return
    src.set(c, (s.h[c - 1] + s.h[c + 1] + s.h[c - N] + s.h[c + N] + s.h[c - N - 1] + s.h[c - N + 1] + s.h[c + N - 1] + s.h[c + N + 1]) / 8)
  })
  disc(x, z, r, (c, w) => { const m = src.get(c); if (m !== undefined) s.h[c] += (m - s.h[c]) * k * w })
  mark(s, ...cellOf(x - r, z - r), ...cellOf(x + r, z + r))
}

/** La Main qui tape : le sable se tasse (le haut s'aplatit un peu) et se mouille. */
export function pat(s: Sand, x: number, z: number, r = 0.11) {
  let top = -Infinity
  disc(x, z, r * 0.6, c => { top = Math.max(top, s.h[c]) })
  let mean = 0, n = 0
  disc(x, z, r, c => { mean += s.h[c]; n++ })
  mean /= Math.max(1, n)
  disc(x, z, r, (c, w) => {
    s.h[c] += (Math.min(s.h[c], mean + (top - mean) * 0.7) - s.h[c]) * w
    s.wet[c] = Math.min(1, s.wet[c] + 0.4 * w)
  })
  mark(s, ...cellOf(x - r, z - r), ...cellOf(x + r, z + r))
}

/* ---------- Les moules ---------- */

export type Mold = 'tour' | 'creneaux' | 'coquillage' | 'etoile' | 'tortue'
export const MOLDS: Mold[] = ['tour', 'creneaux', 'coquillage', 'etoile', 'tortue']
/** Le rayon de chaque moule (mètres). */
export const MOLD_R: Record<Mold, number> = { tour: 0.16, creneaux: 0.17, coquillage: 0.17, etoile: 0.17, tortue: 0.19 }

/** La hauteur de la forme à (dx, dz) de son centre (repère du moule), ou null hors de la forme. */
export function moldHeight(m: Mold, dx: number, dz: number): number | null {
  const R = MOLD_R[m]
  const d = Math.hypot(dx, dz), a = Math.atan2(dz, dx)
  if (m === 'tour') {
    // Un seau renversé : un cylindre un peu évasé vers le bas, son rebord, quatre créneaux
    const H = 0.27
    if (d > R) return null
    const top = d < R * 0.7 ? H - 0.03 : H
    const cren = d > R * 0.7 && Math.cos(a * 4) > 0.2 ? 0.065 : 0
    const skirt = d > R * 0.92 ? -(d - R * 0.92) / (R * 0.08) * 0.04 : 0
    return Math.max(0.01, top + cren + skirt)
  }
  if (m === 'creneaux') {
    // Une tour carrée, sa couronne crénelée de trois dents par côté
    const H = 0.24, w = R * 0.78
    const ax = Math.abs(dx), az = Math.abs(dz)
    if (ax > w || az > w) return null
    const edge = Math.max(ax, az)
    if (edge < w * 0.72) return H - 0.03
    const along = ax > az ? dz : dx
    const tooth = Math.cos(along / w * Math.PI * 1.5) > 0 ? 0.065 : 0
    return H + tooth
  }
  if (m === 'coquillage') {
    // Une coquille Saint-Jacques : un éventail bombé à côtes, sa charnière vers −z
    const cz = dz + R * 0.55
    const r = Math.hypot(dx, cz), th = Math.atan2(dx, cz)
    if (cz < 0 && r > R * 0.32) return null
    if (Math.abs(th) > 1.25 && r > R * 0.32) return null
    if (r > R * 1.35 * (0.92 + 0.08 * Math.cos(th * 9))) return null
    const dome = 0.09 * Math.sqrt(Math.max(0, 1 - (r / (R * 1.4)) ** 2))
    const rib = 0.012 * Math.max(0, Math.cos(th * 9)) * Math.min(1, r / (R * 0.4))
    return 0.015 + dome + rib
  }
  if (m === 'etoile') {
    // Une étoile à cinq branches, bombée au milieu
    const k = 0.55 + 0.45 * Math.pow(Math.max(0, Math.cos((a + Math.PI / 2) * 2.5)), 1.4)
    const rr = R * 1.15 * (0.42 + 0.58 * k)
    if (d > rr) return null
    return 0.02 + 0.07 * (1 - d / rr) + 0.02
  }
  // La tortue : sa carapace en dôme et ses écailles, la tête et quatre pattes
  const shell = Math.hypot(dx / (R * 0.85), dz / (R * 0.7))
  if (shell < 1) {
    const scales = 0.008 * Math.max(0, Math.cos(dx * 70) * Math.cos(dz * 70))
    return 0.02 + 0.1 * Math.sqrt(1 - shell * shell) + scales
  }
  const head = Math.hypot((dx - R * 1.0) / (R * 0.28), dz / (R * 0.24))
  if (head < 1) return 0.02 + 0.045 * Math.sqrt(1 - head * head)
  for (const [lx, lz] of [[0.55, 0.62], [0.55, -0.62], [-0.55, 0.62], [-0.55, -0.62]]) {
    const leg = Math.hypot((dx - R * lx) / (R * 0.22), (dz - R * lz) / (R * 0.2))
    if (leg < 1) return 0.015 + 0.03 * Math.sqrt(1 - leg * leg)
  }
  return null
}

/** Pose une forme moulée en (x, z), tournée de `rot` : le sable mouillé de la forme
    se pose sur le sable qu'il trouve (le point le plus haut sous le moule). */
export function stamp(s: Sand, m: Mold, x: number, z: number, rot = 0) {
  const R = MOLD_R[m] * 1.45
  let base = -Infinity
  disc(x, z, MOLD_R[m] * 0.6, c => { base = Math.max(base, s.h[c]) })
  base = Math.min(base, H_MAX - 0.2)
  const cs = Math.cos(-rot), sn = Math.sin(-rot)
  disc(x, z, R, c => {
    const i = c % N, j = (c - i) / N
    const [px, pz] = posOf(i, j)
    const lx = (px - x) * cs - (pz - z) * sn, lz = (px - x) * sn + (pz - z) * cs
    const mh = moldHeight(m, lx, lz)
    if (mh === null) return
    s.h[c] = Math.min(H_MAX, Math.max(s.h[c], base + mh))
    s.wet[c] = Math.max(s.wet[c], 0.75)
    // Posée dans l'eau : la forme la chasse
    if (s.wl[c] <= s.h[c]) s.wl[c] = DRY
  })
  mark(s, ...cellOf(x - R, z - R), ...cellOf(x + R, z + R))
}

/* ---------- L'eau ---------- */

/** Verse `vol` m³ d'eau en (x, z) : elle remplit le creux par le bas, case après case,
    jusqu'au niveau que permet son volume. Renvoie le nombre de cases mouillées. */
export function pour(s: Sand, x: number, z: number, vol = 0.0025) {
  const [fi, fj] = cellOf(x, z)
  const start = clamp(Math.round(fj), 0, N - 1) * N + clamp(Math.round(fi), 0, N - 1)
  // Le fond de la flaque : la surface (sable ou eau déjà là)
  const ground = (k: number) => Math.max(s.h[k], s.wl[k])
  const seen = new Uint8Array(N * N)
  // Un tas binaire (le plus bas d'abord) sur le bord de la flaque
  const heap: number[] = []
  const push = (k: number) => {
    heap.push(k); let i = heap.length - 1
    while (i > 0) { const p = (i - 1) >> 1; if (ground(heap[p]) <= ground(heap[i])) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p }
  }
  const pop = () => {
    const top = heap[0], last = heap.pop()!
    if (heap.length) {
      heap[0] = last; let i = 0
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i
        if (l < heap.length && ground(heap[l]) < ground(heap[m])) m = l
        if (r < heap.length && ground(heap[r]) < ground(heap[m])) m = r
        if (m === i) break
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m
      }
    }
    return top
  }
  // On descend d'abord au fond du creux le plus proche (l'eau coule vers le bas)
  let k0 = start
  for (let step = 0; step < 40; step++) {
    const i = k0 % N, j = (k0 - i) / N
    let best = k0
    for (const n of [i > 0 ? k0 - 1 : -1, i < N - 1 ? k0 + 1 : -1, j > 0 ? k0 - N : -1, j < N - 1 ? k0 + N : -1]) if (n >= 0 && ground(n) < ground(best) - 1e-5) best = n
    if (best === k0) break
    k0 = best
  }
  const area: number[] = []
  let level = ground(k0)
  push(k0); seen[k0] = 1
  const A = CELL * CELL
  let left = vol
  while (heap.length && area.length < N * N / 3) {
    const k = pop()
    const g = ground(k)
    if (g > level) {
      const need = (g - level) * area.length * A
      if (need >= left) { level += left / (area.length * A); left = 0; break }
      left -= need
      level = g
    }
    area.push(k)
    const i = k % N, j = (k - i) / N
    for (const n of [i > 0 ? k - 1 : -1, i < N - 1 ? k + 1 : -1, j > 0 ? k - N : -1, j < N - 1 ? k + N : -1]) {
      if (n >= 0 && !seen[n]) { seen[n] = 1; push(n) }
    }
  }
  if (left > 0 && area.length) level += left / (area.length * A)
  level = Math.min(level, H_MAX)
  let wetN = 0
  let i0 = N, j0 = N, i1 = 0, j1 = 0
  for (const k of area) {
    if (level <= s.h[k] + 0.001) continue
    s.wl[k] = Math.max(s.wl[k], level)
    s.wet[k] = 1
    wetN++
    const i = k % N, j = (k - i) / N
    i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j)
  }
  // Le sable autour de la flaque boit un peu (sur deux cases, de moins en moins)
  if (wetN) {
    for (const k of area) {
      if (!(s.wl[k] > s.h[k])) continue
      const i = k % N, j = (k - i) / N
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const ii = i + di, jj = j + dj
        if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue
        const n = jj * N + ii
        if (s.wl[n] > s.h[n]) continue
        s.wet[n] = Math.max(s.wet[n], 0.62 - 0.14 * Math.hypot(di, dj))
      }
    }
    mark(s, i0 - 3, j0 - 3, i1 + 3, j1 + 3)
  }
  return wetN
}

/** Toute la plage lisse et sèche (la poubelle). */
export function clearSand(s: Sand) {
  s.h.fill(0); s.wet.fill(0); s.wl.fill(DRY)
  s.dirty = { i0: 0, j0: 0, i1: N - 1, j1: N - 1 }
}

/* ---------- La sauvegarde : trois octets par case, compressés ---------- */

const Q = 0.004
/** La plage en texte court : hauteur (4 mm), eau (4 mm au-dessus du sable, 0 = sec), humidité (16 crans), en suites répétées. */
export function packSand(s: Sand): string {
  const bytes = new Uint8Array(N * N * 3)
  for (let k = 0; k < N * N; k++) {
    bytes[k] = clamp(Math.round(s.h[k] / Q) + 128, 0, 255)
    bytes[N * N + k] = s.wl[k] > s.h[k] ? clamp(Math.round((s.wl[k] - s.h[k]) / Q), 1, 255) : 0
    bytes[2 * N * N + k] = clamp(Math.round(s.wet[k] * 15), 0, 15)
  }
  // Des suites (valeur, longueur ≤ 255)
  const out: number[] = []
  for (let k = 0; k < bytes.length;) {
    let n = 1
    while (k + n < bytes.length && bytes[k + n] === bytes[k] && n < 255) n++
    out.push(bytes[k], n)
    k += n
  }
  let bin = ''
  for (let i = 0; i < out.length; i += 4096) bin += String.fromCharCode(...out.slice(i, i + 4096))
  return btoa(bin)
}

/** Relit une plage gardée ; `null` si elle est abîmée. */
export function unpackSand(str: unknown): Sand | null {
  if (typeof str !== 'string') return null
  let bin: string
  try { bin = atob(str) } catch { return null }
  const bytes = new Uint8Array(N * N * 3)
  let k = 0
  for (let i = 0; i + 1 < bin.length; i += 2) {
    const v = bin.charCodeAt(i), n = bin.charCodeAt(i + 1)
    if (!n || k + n > bytes.length) return null
    bytes.fill(v, k, k + n)
    k += n
  }
  if (k !== bytes.length) return null
  const s = makeSand()
  for (let c = 0; c < N * N; c++) {
    s.h[c] = (bytes[c] - 128) * Q
    const w = bytes[N * N + c]
    s.wl[c] = w ? s.h[c] + w * Q : DRY
    s.wet[c] = bytes[2 * N * N + c] / 15
  }
  s.dirty = { i0: 0, j0: 0, i1: N - 1, j1: N - 1 }
  return s
}
