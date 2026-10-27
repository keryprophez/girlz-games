/* 📐 Le Géoplan (27/10) — la logique, sans 3D : les figures, la
   comparaison de deux figures faites d'élastiques, les transformations de la
   flamme et les manches. Testé (`geoplan.test.ts`) ; le rendu (la plaque à
   picots des Perles, les élastiques qu'on tend) est dans `games/geoplan.ts`.

   Un picot : [colonne, rangée], la rangée 0 au fond de la plaque. Un
   élastique tendu entre deux picots est un segment. Deux figures sont les
   mêmes quand elles couvrent les mêmes PETITS segments — chaque segment
   coupé à chaque picot qu'il traverse : un élastique tendu sur trois
   picots alignés vaut ses deux moitiés, deux élastiques bout à bout valent
   un seul long, et un élastique posé deux fois ne compte qu'une. */

export type Pt = [number, number]
export type Seg = [Pt, Pt]
export type Tier = 'easy' | 'med' | 'exp'
/** La flamme : agrandie ×2, tournée d'un quart (sens des aiguilles), en miroir (gauche ↔ droite). */
export type Xf = 'x2' | 'rot' | 'mir'

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a))
const pk = (p: Pt) => `${p[0]},${p[1]}`

/** Le petit segment entre deux picots voisins sur une même droite, écrit
    dans un ordre fixe (le plus petit picot d'abord). */
function primKey(a: Pt, b: Pt): string {
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? `${pk(a)}|${pk(b)}` : `${pk(b)}|${pk(a)}`
}

/** Les petits segments couverts par une figure. */
export function prims(segs: Seg[]): Set<string> {
  const out = new Set<string>()
  for (const [a, b] of segs) {
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const g = gcd(Math.abs(dx), Math.abs(dy))
    if (!g) continue // un élastique sur un seul picot : rien
    const sx = dx / g, sy = dy / g
    for (let i = 0; i < g; i++) out.add(primKey([a[0] + sx * i, a[1] + sy * i], [a[0] + sx * (i + 1), a[1] + sy * (i + 1)]))
  }
  return out
}

const parse = (k: string): Seg => k.split('|').map(p => p.split(',').map(Number)) as Seg

/** La même figure ramenée contre le coin (0, 0) : la comparer « n'importe où ». */
function anchored(set: Set<string>): Set<string> {
  let mc = Infinity, mr = Infinity
  for (const k of set) for (const p of parse(k)) { mc = Math.min(mc, p[0]); mr = Math.min(mr, p[1]) }
  const out = new Set<string>()
  for (const k of set) { const [a, b] = parse(k); out.add(primKey([a[0] - mc, a[1] - mr], [b[0] - mc, b[1] - mr])) }
  return out
}

const eq = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(k => b.has(k))

/** Deux figures sont-elles les mêmes ? `anywhere` : à une translation près. */
export function same(made: Seg[], want: Seg[], anywhere: boolean): boolean {
  const a = prims(made), b = prims(want)
  if (!a.size) return false
  return anywhere ? eq(anchored(a), anchored(b)) : eq(a, b)
}

/** Les petits segments de la figure voulue qui manquent / ceux posés en trop
    (au même endroit). Pour la main et le bot, jamais montré à l'enfant. */
export function diff(made: Seg[], want: Seg[]): { missing: Seg[]; extra: Seg[] } {
  const a = prims(made), b = prims(want)
  return { missing: [...b].filter(k => !a.has(k)).map(parse), extra: [...a].filter(k => !b.has(k)).map(parse) }
}

/** Les côtés de la figure : les petits segments recollés bout à bout quand
    ils sont alignés (la harpe : une note par côté). Du plus haut au plus bas,
    puis de gauche à droite. */
export function sides(segs: Seg[]): Seg[] {
  const set = prims(segs)
  const dirOf = (s: Seg): Pt => [s[1][0] - s[0][0], s[1][1] - s[0][1]]
  const out: Seg[] = []
  const seen = new Set<string>()
  for (const k of [...set].sort()) {
    if (seen.has(k)) continue
    const s = parse(k), d = dirOf(s)
    // Le premier petit segment de la chaîne : on remonte tant qu'il y en a un avant
    let a = s[0]
    while (set.has(primKey([a[0] - d[0], a[1] - d[1]], a))) a = [a[0] - d[0], a[1] - d[1]]
    let b = a
    while (set.has(primKey(b, [b[0] + d[0], b[1] + d[1]]))) { seen.add(primKey(b, [b[0] + d[0], b[1] + d[1]])); b = [b[0] + d[0], b[1] + d[1]] }
    out.push([a, b])
  }
  const top = (s: Seg) => Math.min(s[0][1], s[1][1]) * 100 + Math.min(s[0][0], s[1][0])
  return out.sort((x, y) => top(x) - top(y))
}

/** La boîte d'une figure : [largeur, hauteur] en pas de picots. */
export function span(segs: Seg[]): Pt {
  const ps = segs.flat()
  return [Math.max(...ps.map(p => p[0])) - Math.min(...ps.map(p => p[0])), Math.max(...ps.map(p => p[1])) - Math.min(...ps.map(p => p[1]))]
}

/** Ramène une figure contre le coin (0, 0), décalée de (dc, dr). */
export function moved(segs: Seg[], dc = 0, dr = 0): Seg[] {
  const ps = segs.flat()
  const mc = Math.min(...ps.map(p => p[0])), mr = Math.min(...ps.map(p => p[1]))
  return segs.map(s => s.map(p => [p[0] - mc + dc, p[1] - mr + dr]) as Seg)
}

/** La figure transformée (la flamme), ramenée contre le coin. */
export function transform(segs: Seg[], xf: Xf): Seg[] {
  const f = (p: Pt): Pt => xf === 'x2' ? [p[0] * 2, p[1] * 2] : xf === 'rot' ? [-p[1], p[0]] : [-p[0], p[1]]
  return moved(segs.map(s => s.map(f) as Seg))
}

/* ---------- Les figures ---------- */

/** Un polygone fermé (ses sommets dans l'ordre) en segments. */
const poly = (...ps: Pt[]): Seg[] => ps.map((p, i) => [p, ps[(i + 1) % ps.length]] as Seg)

export interface Shape {
  id: string
  /** Ce que dit la voix quand la figure est finie (du contenu, la règle 2 l'autorise). */
  name: string
  segs: Seg[]
}

export const SHAPES: Record<string, Shape> = {
  carre: { id: 'carre', name: 'un carré', segs: poly([0, 0], [2, 0], [2, 2], [0, 2]) },
  petitCarre: { id: 'petitCarre', name: 'un carré', segs: poly([0, 0], [1, 0], [1, 1], [0, 1]) },
  rectangle: { id: 'rectangle', name: 'un rectangle', segs: poly([0, 0], [3, 0], [3, 2], [0, 2]) },
  petitRectangle: { id: 'petitRectangle', name: 'un rectangle', segs: poly([0, 0], [2, 0], [2, 1], [0, 1]) },
  triangle: { id: 'triangle', name: 'un triangle', segs: poly([0, 2], [2, 0], [4, 2]) },
  triangleDroit: { id: 'triangleDroit', name: 'un triangle', segs: poly([0, 0], [0, 3], [2, 3]) },
  petitTriangle: { id: 'petitTriangle', name: 'un triangle', segs: poly([0, 0], [0, 2], [1, 2]) },
  // Les murs (un carré) et le toit posé dessus, comme on dessine une maison
  maison: { id: 'maison', name: 'une maison', segs: [...poly([0, 1], [2, 1], [2, 3], [0, 3]), [[0, 1], [1, 0]], [[1, 0], [2, 1]]] },
  fleche: { id: 'fleche', name: 'une flèche', segs: poly([0, 1], [2, 1], [2, 0], [4, 2], [2, 4], [2, 3], [0, 3]) },
  // Une pointe de flèche pleine (un chevron)
  petiteFleche: { id: 'petiteFleche', name: 'une flèche', segs: poly([0, 0], [2, 0], [3, 1], [2, 2], [0, 2], [1, 1]) },
  losange: { id: 'losange', name: 'un losange', segs: poly([2, 0], [4, 2], [2, 4], [0, 2]) },
  petitLosange: { id: 'petitLosange', name: 'un losange', segs: poly([1, 0], [2, 1], [1, 2], [0, 1]) },
  trapeze: { id: 'trapeze', name: 'un trapèze', segs: poly([1, 0], [3, 0], [4, 2], [0, 2]) },
  // Une étoile à quatre branches, pointes au milieu des bords
  etoile: { id: 'etoile', name: 'une étoile', segs: poly([3, 0], [4, 2], [6, 3], [4, 4], [3, 6], [2, 4], [0, 3], [2, 2]) },
  // La coque, le mât et la voile
  bateau: { id: 'bateau', name: 'un bateau', segs: [...poly([0, 3], [5, 3], [4, 4], [1, 4]), [[2, 0], [2, 3]], [[2, 0], [4, 2]], [[4, 2], [2, 2]]] },
  parallelogramme: { id: 'parallelogramme', name: 'un parallélogramme', segs: poly([1, 0], [4, 0], [3, 2], [0, 2]) },
  hexagone: { id: 'hexagone', name: 'un hexagone', segs: poly([1, 0], [3, 0], [4, 2], [3, 4], [1, 4], [0, 2]) },
  // Le mât, et le fanion échancré (son bord contre le mât se confond avec lui)
  drapeau: { id: 'drapeau', name: 'un drapeau', segs: [[[0, 0], [0, 3]], ...poly([0, 0], [2, 0], [1, 1], [2, 2], [0, 2])] }
}

export interface Round {
  shape: Shape
  /** La figure du modèle, telle que montrée sur la petite plaque. */
  model: Seg[]
  /** Ce qu'il faut tendre sur la grande plaque. */
  want: Seg[]
  /** La fleur : au même endroit (le fantôme) ; sinon n'importe où. */
  anywhere: boolean
  xf: Xf | null
  /** La grande plaque : n × n picots. */
  n: number
}

export const BOARD: Record<Tier, number> = { easy: 6, med: 7, exp: 8 }

/** Les manches de chaque niveau : la fleur reproduit sur le fantôme, au même
    endroit ; l'éclair reproduit n'importe où des figures plus variées ; la
    flamme reproduit la figure agrandie, tournée ou en miroir. */
const PLAN: Record<Tier, (string | [string, Xf])[]> = {
  easy: ['carre', 'rectangle', 'triangle', 'maison', 'fleche'],
  med: ['losange', 'trapeze', 'parallelogramme', 'bateau', 'hexagone', 'etoile'],
  exp: [['petitCarre', 'x2'], ['triangleDroit', 'rot'], ['parallelogramme', 'mir'], ['petitTriangle', 'x2'], ['bateau', 'mir'], ['maison', 'rot'], ['petiteFleche', 'x2'], ['drapeau', 'mir'], ['trapeze', 'rot']]
}

export function makeRounds(tier: Tier, rand: () => number = Math.random): Round[] {
  const n = BOARD[tier]
  let plan = PLAN[tier]
  // L'éclair : les six figures dans un ordre tiré au sort (rejouer change tout)
  if (tier === 'med') plan = plan.slice().sort(() => rand() - 0.5)
  if (tier === 'exp') {
    // Six manches : deux de chaque transformation, dans un ordre tiré au sort
    const by: Record<Xf, [string, Xf][]> = { x2: [], rot: [], mir: [] }
    for (const p of plan as [string, Xf][]) by[p[1]].push(p)
    const pickTwo = (xs: [string, Xf][]) => xs.slice().sort(() => rand() - 0.5).slice(0, 2)
    const a = pickTwo(by.x2), b = pickTwo(by.rot), c = pickTwo(by.mir)
    plan = [a[0], b[0], c[0], a[1], b[1], c[1]]
  }
  return plan.map(p => {
    const [id, xf] = typeof p === 'string' ? [p, null] : p
    const shape = SHAPES[id]
    const model = moved(shape.segs)
    let want = xf ? transform(model, xf) : model
    // La fleur : le fantôme posé quelque part sur la plaque, où la figure tient
    const [w, h] = span(want)
    want = moved(want, Math.floor(rand() * (n - w)), Math.floor(rand() * (n - h)))
    return { shape, model, want, anywhere: tier !== 'easy', xf, n }
  })
}

/** Les étoiles : jamais de perte (Apprendre). Comptent les élastiques posés
    puis retirés parce qu'ils n'allaient pas. */
export function starsFor(undone: number): 1 | 2 | 3 {
  return undone <= 4 ? 3 : undone <= 10 ? 2 : 1
}
