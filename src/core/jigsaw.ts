/* LES DÉCOUPES DU PUZZLE (30/09) — logique pure, testée (`jigsaw.test.ts`).

   Un vrai puzzle : chaque côté intérieur a un TENON (la bosse ronde) d'un
   côté et sa MORTAISE (le creux) de l'autre, en courbes, avec un cou plus
   étroit que la tête — le profil classique d'un puzzle en carton. Les côtés
   du bord sont droits.

   Le profil d'un côté suit le générateur de Draradech (2019, domaine
   public) : trois courbes de Bézier cubiques, une épaule qui rentre à peine,
   le cou, la tête ronde ; un léger « jeu » tiré au hasard par côté (les
   pièces ne sont pas toutes identiques, comme une vraie découpe).

   Coordonnées en CASES : la pièce (r, c) occupe [c, c+1] × [r, r+1], x vers
   la droite, y vers le BAS (comme l'image). Le jeu les met à l'échelle. */

export type P2 = [number, number]
/** Un morceau de courbe cubique : départ, deux points de contrôle, arrivée. */
export type Bez = [P2, P2, P2, P2]

export interface Edge {
  /** +1 : la bosse part vers +y (côté horizontal) ou +x (côté vertical) ;
      −1 : vers l'autre côté ; 0 : bord droit. */
  tab: -1 | 0 | 1
  /** Le jeu du profil (a, b, c, d, e : quelques centièmes de case). */
  j: [number, number, number, number, number]
}

export interface Cut {
  rows: number
  cols: number
  /** Côtés horizontaux : `h[r][c]` est le haut de la pièce (r, c) (r = rows : le bas du puzzle). */
  h: Edge[][]
  /** Côtés verticaux : `v[r][c]` est la gauche de la pièce (r, c) (c = cols : la droite du puzzle). */
  v: Edge[][]
}

/** Taille de la bosse (fraction de la case) : 0,1 donne une tête d'environ 0,25. */
export const TAB = 0.1
const JITTER = 0.04

const flat = (): Edge => ({ tab: 0, j: [0, 0, 0, 0, 0] })

/** Tire les côtés d'un puzzle `rows` × `cols` ; `rnd` pour des tirages reproductibles. */
export function makeCut(rows: number, cols: number, rnd: () => number = Math.random): Cut {
  const u = () => (rnd() * 2 - 1) * JITTER
  const inner = (): Edge => ({ tab: rnd() < 0.5 ? -1 : 1, j: [u(), u(), u(), u(), u()] })
  const h: Edge[][] = []
  for (let r = 0; r <= rows; r++) {
    h.push([])
    for (let c = 0; c < cols; c++) h[r].push(r === 0 || r === rows ? flat() : inner())
  }
  const v: Edge[][] = []
  for (let r = 0; r < rows; r++) {
    v.push([])
    for (let c = 0; c <= cols; c++) v[r].push(c === 0 || c === cols ? flat() : inner())
  }
  return { rows, cols, h, v }
}

/** Le profil d'un côté dans son sens canonique (gauche → droite pour un côté
    horizontal, haut → bas pour un vertical), en coordonnées de cases. Un bord
    droit est une seule « courbe » droite. */
function edgeCurves(e: Edge, x0: number, y0: number, horizontal: boolean): Bez[] {
  const at = (l: number, w: number): P2 => horizontal ? [x0 + l, y0 + w * e.tab] : [x0 + w * e.tab, y0 + l]
  if (!e.tab) {
    const a = at(0, 0), b = at(1, 0)
    return [[a, at(1 / 3, 0), at(2 / 3, 0), b]]
  }
  const t = TAB
  const [a, b, c, d, ee] = e.j
  const p = [
    at(0, 0), at(0.2, a), at(0.5 + b + d, -t + c), at(0.5 - t + b, t + c),
    at(0.5 - 2 * t + b - d, 3 * t + c), at(0.5 + 2 * t + b - d, 3 * t + c), at(0.5 + t + b, t + c),
    at(0.5 + b + d, -t + c), at(0.8, ee), at(1, 0)
  ]
  return [[p[0], p[1], p[2], p[3]], [p[3], p[4], p[5], p[6]], [p[6], p[7], p[8], p[9]]]
}

const reverse = (bs: Bez[]): Bez[] => bs.slice().reverse().map(([a, b, c, d]) => [d, c, b, a])

/** Le contour de la pièce (r, c), dans le sens des aiguilles d'une montre à
    l'écran (haut → droite → bas → gauche) : une suite de courbes qui se
    touchent bout à bout, la dernière finit où la première commence. */
export function pieceOutline(cut: Cut, r: number, c: number): Bez[] {
  return [
    ...edgeCurves(cut.h[r][c], c, r, true),
    ...edgeCurves(cut.v[r][c + 1], c + 1, r, false),
    ...reverse(edgeCurves(cut.h[r + 1][c], c, r + 1, true)),
    ...reverse(edgeCurves(cut.v[r][c], c, r, false))
  ]
}

/** Un point d'une courbe de Bézier cubique. */
export function bezAt([p0, p1, p2, p3]: Bez, t: number): P2 {
  const m = 1 - t
  const a = m * m * m, b = 3 * m * m * t, c = 3 * m * t * t, d = t * t * t
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]
}

/** Le contour échantillonné (`n` points par courbe, un seul pour un bord droit). */
export function outlinePoints(bs: Bez[], n = 12): P2[] {
  const out: P2[] = [bs[0][0]]
  for (const b of bs) {
    const straight = isStraight(b)
    const k = straight ? 1 : n
    for (let i = 1; i <= k; i++) out.push(straight && i === k ? b[3] : bezAt(b, i / k))
  }
  return out
}

/** Une « courbe » qui est en fait un segment droit (un côté du bord). */
export function isStraight([a, b, c, d]: Bez): boolean {
  const cross = (p: P2) => (d[0] - a[0]) * (p[1] - a[1]) - (d[1] - a[1]) * (p[0] - a[0])
  return Math.abs(cross(b)) < 1e-9 && Math.abs(cross(c)) < 1e-9
}

/** Aire signée d'un polygone (formule du lacet). */
export function area(pts: P2[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]
    s += x0 * y1 - x1 * y0
  }
  return s / 2
}

/** Les dimensions (lignes × colonnes) d'un puzzle au format 4:3 de `n` pièces. */
export function gridFor(n: number): { rows: number; cols: number } {
  let best = { rows: 1, cols: n }, err = Infinity
  for (let rows = 1; rows <= n; rows++) {
    if (n % rows) continue
    const cols = n / rows
    const e = Math.abs(Math.log((cols / rows) / (4 / 3)))
    if (e < err) { err = e; best = { rows, cols } }
  }
  return best
}

/** Un tirage reproductible (graine entière) : même graine, même découpe. */
export function seeded(seed: number): () => number {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646 }
}
