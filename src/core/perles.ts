/* LES MOTIFS DE PERLES À REPASSER (30/09) — logique pure, testée
   (`perles.test.ts`) : les couleurs des pots, les dessins en petites grilles,
   et les manches des Perles Miroir (la moitié modèle, l'axe, ce qui reste à
   compléter). Le rendu 3D est dans `hama3d.ts` ; ce fichier ne touche ni à
   three.js ni au DOM, pour servir aussi au futur Atelier des bijoux.

   Un dessin s'écrit ligne par ligne, une lettre par perle (`.` = pas de
   perle), toujours la même lettre pour la même couleur : R rouge, P rose,
   F fuchsia, O orange, Y jaune, G vert, B bleu, L violet, W blanc, K noir,
   M marron, E beige. Les dessins « v » sont symétriques gauche-droite (chaque
   ligne se lit pareil dans les deux sens) et de largeur PAIRE : l'axe passe
   entre deux colonnes de picots, jamais sur une perle (qui la poserait ?).
   Les dessins « vh » le sont aussi de haut en bas. `turn` : le dessin peut
   se coucher (transposé) pour une manche à axe horizontal — le poisson qui
   nageait vers le haut nage vers la gauche. */

export type ColorId =
  | 'rouge' | 'rose' | 'fuchsia' | 'orange' | 'jaune' | 'vert'
  | 'bleu' | 'violet' | 'blanc' | 'noir' | 'marron' | 'beige'

/** Les pots de perles : la couleur (choisie SOMBRE, l'éclairage et l'ACES la
    remontent — piège connu) et le petit nom écrit sous le pot. */
export const PALETTE: Record<ColorId, { hex: number; name: string }> = {
  rouge: { hex: 0xD8304C, name: 'Rouge' },
  rose: { hex: 0xF27AA6, name: 'Rose' },
  fuchsia: { hex: 0xC0306E, name: 'Fuchsia' },
  orange: { hex: 0xF07E22, name: 'Orange' },
  jaune: { hex: 0xEAA800, name: 'Jaune' },
  vert: { hex: 0x4FA83A, name: 'Vert' },
  bleu: { hex: 0x2F86CC, name: 'Bleu' },
  violet: { hex: 0x8D6AD8, name: 'Violet' },
  blanc: { hex: 0xEDEAE6, name: 'Blanc' },
  noir: { hex: 0x2E2530, name: 'Noir' },
  marron: { hex: 0x84522F, name: 'Marron' },
  beige: { hex: 0xE3C08E, name: 'Beige' }
}

export const LETTER: Record<string, ColorId> = {
  R: 'rouge', P: 'rose', F: 'fuchsia', O: 'orange', Y: 'jaune', G: 'vert',
  B: 'bleu', L: 'violet', W: 'blanc', K: 'noir', M: 'marron', E: 'beige'
}

export interface Motif {
  id: string
  /** Symétrie du dessin : gauche-droite, ou gauche-droite ET haut-bas. */
  sym: 'v' | 'vh'
  /** Peut se coucher pour une manche à axe horizontal. */
  turn?: boolean
  rows: string[]
}

/* ---------- Les dessins ----------
   Fleur (plaque de 8) : 2 ou 3 couleurs, une vingtaine de perles à poser.
   Éclair (10) : 3 ou 4 couleurs. Flamme (12) : 4 couleurs, et l'axe
   horizontal ou les deux axes. */
export const SMALL: Motif[] = [
  { id: 'coeur', sym: 'v', rows: [
    '.RR..RR.',
    'RPPRRPPR',
    'RPPPPPPR',
    'RPPPPPPR',
    '.RPPPPR.',
    '..RPPR..',
    '...RR...'
  ] },
  { id: 'fraise', sym: 'v', rows: [
    '...GG...',
    '.GGGGGG.',
    'RRGRRGRR',
    'RYRRRRYR',
    'RRRYYRRR',
    '.RRRRRR.',
    '..RYYR..',
    '...RR...'
  ] },
  { id: 'champignon', sym: 'v', rows: [
    '..RRRR..',
    '.RRWWRR.',
    'RWRRRRWR',
    'RRRRRRRR',
    '..EEEE..',
    '..EEEE..',
    '.EEEEEE.'
  ] },
  { id: 'poussin', sym: 'v', rows: [
    '..YYYY..',
    '.YYYYYY.',
    '.YKYYKY.',
    '.YYOOYY.',
    'YYYYYYYY',
    'YYYYYYYY',
    '.YYYYYY.',
    '..O..O..'
  ] },
  { id: 'etoile', sym: 'v', rows: [
    '...YY...',
    '...YY...',
    '..YYYY..',
    'YYYOOYYY',
    '.YYOOYY.',
    '..YYYY..',
    '.YY..YY.',
    'YY....YY'
  ] },
  { id: 'sapin', sym: 'v', rows: [
    '...YY...',
    '..GGGG..',
    '.GGGGGG.',
    '..GGGG..',
    '.GGGGGG.',
    'GGGGGGGG',
    '...MM...',
    '...MM...'
  ] }
]

export const MEDIUM: Motif[] = [
  { id: 'papillon', sym: 'v', turn: true, rows: [
    '..K....K..',
    '...K..K...',
    'LLL.KK.LLL',
    'LPPLKKLPPL',
    'LPPLKKLPPL',
    '.LLLKKLLL.',
    '..LLKKLL..',
    '.LYLKKLYL.',
    '.LLLKKLLL.',
    '..LL..LL..'
  ] },
  { id: 'cochon', sym: 'v', rows: [
    '.FF....FF.',
    '.FPF..FPF.',
    '..PPPPPP..',
    '.PPPPPPPP.',
    'PPKPPPPKPP',
    'PPPPPPPPPP',
    'PPPFFFFPPP',
    'PPFKFFKFPP',
    '.PPFFFFPP.',
    '..PPPPPP..'
  ] },
  { id: 'coccinelle', sym: 'v', turn: true, rows: [
    '..K....K..',
    '...K..K...',
    '...KKKK...',
    '..KWKKWK..',
    '.RRRKKRRR.',
    'RRKRKKRKRR',
    'RRRRKKRRRR',
    'RKRRKKRRKR',
    '.RRRKKRRR.',
    '..RRKKRR..'
  ] },
  { id: 'fleur', sym: 'v', rows: [
    '..PP..PP..',
    '.PPPPPPPP.',
    '.PPPYYPPP.',
    '..PYYYYP..',
    '.PPPYYPPP.',
    '.PPPPPPPP.',
    '..PP..PP..',
    '....GG....',
    '.GG.GG.GG.',
    '..GGGGGG..'
  ] },
  { id: 'chat', sym: 'v', rows: [
    '.O......O.',
    '.OO....OO.',
    '.OPO..OPO.',
    '.OOOOOOOO.',
    'OOOOOOOOOO',
    'OOKOOOOKOO',
    'OOOOOOOOOO',
    'OOOOPPOOOO',
    '.OOOOOOOO.',
    '..OOOOOO..'
  ] }
]

export const LARGE: Motif[] = [
  { id: 'grand-papillon', sym: 'v', rows: [
    '...K....K...',
    '....K..K....',
    'LLL..KK..LLL',
    'LPPL.KK.LPPL',
    'LPBPLKKLPBPL',
    'LPPPLKKLPPPL',
    '.LLLLKKLLLL.',
    '..LBBKKBBL..',
    '.LBBBKKBBBL.',
    '.LBPBKKBPBL.',
    '.LBBLKKLBBL.',
    '..LL.KK.LL..'
  ] },
  { id: 'couronne', sym: 'v', rows: [
    'Y....YY....Y',
    'YY..YYYY..YY',
    'YYY.YYYY.YYY',
    'YYYYYRRYYYYY',
    'YBYYYRRYYYBY',
    'YYYYYYYYYYYY',
    'OOOOOOOOOOOO',
    'ORORORRORORO'
  ] },
  { id: 'fusee', sym: 'v', turn: true, rows: [
    '...RR...',
    '..RRRR..',
    '..WWWW..',
    '.WWWWWW.',
    '.WWBBWW.',
    '.WBBBBW.',
    '.WWBBWW.',
    '.WWWWWW.',
    'RWWWWWWR',
    'RRWWWWRR',
    'RR.RR.RR',
    '...OO...'
  ] },
  { id: 'arc-en-ciel', sym: 'v', rows: [
    '....RRRR....',
    '..RROOOORR..',
    '.ROOYYYYOOR.',
    '.ROYYGGYYOR.',
    'ROYG....GYOR',
    'ROYG....GYOR',
    'ROYG....GYOR'
  ] },
  { id: 'poisson', sym: 'v', turn: true, rows: [
    '....BB....',
    '...BBBB...',
    '..BBBBBB..',
    '..BKBBKB..',
    '.BBBBBBBB.',
    '.BBLBBLBB.',
    '.BBBLLBBB.',
    '.BBLBBLBB.',
    '..BBBBBB..',
    '...BBBB...',
    '..BBBBBB..',
    '.BB....BB.'
  ] }
]

/** Les dessins à deux axes : un quart est posé, on complète les trois autres. */
export const QUAD: Motif[] = [
  { id: 'flocon', sym: 'vh', rows: [
    '....BB....',
    '.B.BBBB.B.',
    '..B.BB.B..',
    '.B.LLLL.B.',
    'BBBLWWLBBB',
    'BBBLWWLBBB',
    '.B.LLLL.B.',
    '..B.BB.B..',
    '.B.BBBB.B.',
    '....BB....'
  ] },
  { id: 'rosace', sym: 'vh', rows: [
    '...RRRR...',
    '..ROOOOR..',
    '.ROY..YOR.',
    'ROY.LL.YOR',
    'RO.LLLL.OR',
    'RO.LLLL.OR',
    'ROY.LL.YOR',
    '.ROY..YOR.',
    '..ROOOOR..',
    '...RRRR...'
  ] }
]

export const ALL_MOTIFS: Motif[] = [...SMALL, ...MEDIUM, ...LARGE, ...QUAD]

/* ---------- Les manches ---------- */
export type Axis = 'v' | 'h' | 'vh'
export type Tier = 'easy' | 'med' | 'exp'

export interface Round {
  motif: string
  /** Côté de la plaque carrée (en picots). */
  n: number
  /** 'v' : axe vertical ; 'h' : horizontal ; 'vh' : les deux. */
  axis: Axis
  /** La partie DÉJÀ posée (le modèle) : 'v' → gauche ou droite, 'h' → haut ou
      bas, 'vh' → le quart en haut à gauche. */
  side: 'left' | 'right' | 'top' | 'bottom' | 'corner'
  /** Le dessin entier sur la plaque, case r·n + c (null = pas de perle). */
  target: (ColorId | null)[]
  /** Les couleurs du dessin. */
  colors: ColorId[]
  /** Les pots proposés : les couleurs du dessin et, selon le niveau, un pot
      de plus qui ne sert pas (il faut regarder, pas deviner). */
  pots: ColorId[]
}

type Rng = () => number
const pickFrom = <T>(xs: T[], rng: Rng) => xs[Math.floor(rng() * xs.length) % xs.length]
function shuffled<T>(xs: T[], rng: Rng): T[] {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Le dessin couché (transposé) : la symétrie gauche-droite devient haut-bas. */
export function transpose(rows: string[]): string[] {
  const w = Math.max(...rows.map(r => r.length))
  return Array.from({ length: w }, (_, c) => rows.map(r => r[c] || '.').join(''))
}

/** Pose un dessin au milieu d'une plaque n × n. */
export function placeOnBoard(rows: string[], n: number): (ColorId | null)[] {
  const h = rows.length, w = Math.max(...rows.map(r => r.length))
  const ox = Math.floor((n - w) / 2), oy = Math.floor((n - h) / 2)
  const out: (ColorId | null)[] = new Array(n * n).fill(null)
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    const col = LETTER[ch]
    if (col) out[(r + oy) * n + (c + ox)] = col
  }))
  return out
}

/** La case fait-elle partie du modèle déjà posé ? */
export function isGiven(rd: Pick<Round, 'n' | 'side'>, c: number, r: number): boolean {
  const h = rd.n / 2
  switch (rd.side) {
    case 'left': return c < h
    case 'right': return c >= h
    case 'top': return r < h
    case 'bottom': return r >= h
    case 'corner': return c < h && r < h
  }
}

/** La case modèle dont (c, r) est le reflet (elle-même si elle est modèle). */
export function sourceOf(rd: Pick<Round, 'n' | 'axis' | 'side'>, c: number, r: number): [number, number] {
  const m = rd.n - 1
  let sc = c, sr = r
  if (rd.axis === 'v' && !isGiven(rd, sc, sr)) sc = m - c
  if (rd.axis === 'h' && !isGiven(rd, sc, sr)) sr = m - r
  if (rd.axis === 'vh') {
    if (sc >= rd.n / 2) sc = m - sc
    if (sr >= rd.n / 2) sr = m - sr
  }
  return [sc, sr]
}

/** La couleur attendue sur une case. */
export const wantAt = (rd: Round, c: number, r: number): ColorId | null => rd.target[r * rd.n + c]

/** Ce qui manque encore : les cases à compléter dont la perle manque ou est
    fausse, et les perles posées là où il n'en faut pas. */
export function missing(rd: Round, state: (ColorId | null)[]) {
  const need: { c: number; r: number; color: ColorId }[] = []
  const wrong: { c: number; r: number }[] = []
  for (let r = 0; r < rd.n; r++) for (let c = 0; c < rd.n; c++) {
    if (isGiven(rd, c, r)) continue
    const want = wantAt(rd, c, r), got = state[r * rd.n + c]
    if (got && got !== want) wrong.push({ c, r })
    if (want && got !== want) need.push({ c, r, color: want })
  }
  return { need, wrong }
}

export function isComplete(rd: Round, state: (ColorId | null)[]): boolean {
  const { need, wrong } = missing(rd, state)
  return need.length === 0 && wrong.length === 0
}

function colorsOf(target: (ColorId | null)[]): ColorId[] {
  const seen: ColorId[] = []
  for (const c of target) if (c && !seen.includes(c)) seen.push(c)
  return seen
}

/** Les trois manches d'une partie. La fleur : axe vertical, le modèle
    toujours à gauche. L'éclair : le modèle à gauche OU à droite, un pot de
    trop. La flamme : axe vertical, puis horizontal, puis les deux. */
export function makeRounds(tier: Tier, rng: Rng = Math.random): Round[] {
  const n = tier === 'easy' ? 8 : tier === 'med' ? 10 : 12
  const decoys = tier === 'easy' ? 0 : 1
  const round = (m: Motif, axis: Axis, side: Round['side'], rows: string[]): Round => {
    const target = placeOnBoard(rows, n)
    const colors = colorsOf(target)
    const spare = shuffled((Object.keys(PALETTE) as ColorId[]).filter(c => !colors.includes(c)), rng).slice(0, decoys)
    return { motif: m.id, n, axis, side, target, colors, pots: shuffled([...colors, ...spare], rng) }
  }
  if (tier !== 'exp') {
    const pool = shuffled(tier === 'easy' ? SMALL : MEDIUM, rng)
    return pool.slice(0, 3).map(m => round(m, 'v', tier === 'easy' || rng() < 0.5 ? 'left' : 'right', m.rows))
  }
  const v = pickFrom(LARGE.filter(m => m.rows[0].length <= n), rng)
  const turnable = [...MEDIUM, ...LARGE].filter(m => m.turn && m.id !== v.id && m.rows.length <= n)
  const h = pickFrom(turnable, rng)
  const q = pickFrom(QUAD, rng)
  return [
    round(v, 'v', rng() < 0.5 ? 'left' : 'right', v.rows),
    round(h, 'h', rng() < 0.5 ? 'top' : 'bottom', transpose(h.rows)),
    round(q, 'vh', 'corner', q.rows)
  ]
}
