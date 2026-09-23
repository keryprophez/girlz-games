/* La mémoire des calculs — phase 4, « la Ferme des calculs » (23/09).

   Le Potager (× et ÷) et le Poulailler (+ et −) posent des calculs ; ce
   module retient, calcul par calcul, ce que l'enfant sait déjà, et compose
   chaque récolte en conséquence. Logique pure : aucun DOM, aucune 3D, un
   hasard injectable — tout est testé dans `facts.test.ts`.

   Cinq niveaux, qui sont aussi cinq niveaux d'AIDE (l'aide s'efface) :
     0 Découverte        le carré pousse et se compte tout seul
     1 Avec les légumes  le carré est planté, on peut compter les rangées
     2 Contour           seulement le sillon du rectangle, vide
     3 Nombres seuls     le champ vide, quatre réponses dont des pièges
     4 Par cœur          le pavé numérique

   Les règles (décisions du 23/09) :
   - bonne réponse : on monte d'un niveau. À partir du Contour il faut AUSSI
     répondre vite (sans recompter) ; le temps n'est jamais montré à l'enfant ;
   - erreur : retour à « Avec les légumes », et le calcul revient deux ou
     trois questions plus loin dans la même récolte (sans changer de niveau :
     c'est de l'entraînement, pas une seconde note) ;
   - un calcul jamais vu est d'abord posé en « Nombres seuls » : s'il est
     déjà su, pas la peine de réapprendre 2 × 3 ;
   - les révisions se comptent en PARTIES, jamais en jours (aucun « reviens
     demain », règle 1) : un calcul su revient après 1, 2, 4 puis 8 parties ;
   - rien ne redescend tout seul avec le temps : seule une erreur fait
     redescendre un calcul (« rien ne fane jamais »). */

export type Level = 0 | 1 | 2 | 3 | 4
export const LV = { discover: 0, plants: 1, outline: 2, numbers: 3, heart: 4 } as const

/** Un calcul. Pour × et +, 7 × 8 et 8 × 7 sont UN SEUL calcul (a ≤ b). */
export interface Fact {
  key: string
  a: number
  b: number
}

export interface FactRec {
  lv: Level
  /** Partie où il a été posé pour la dernière fois. */
  last: number
  /** Nombre de parties à attendre avant de le revoir (niveaux 3 et 4). */
  gap: number
  /** Nombre de fois posé ; 0 = jamais vu. */
  seen: number
}

export interface Memory {
  v: 1
  /** Parties commencées : l'horloge des révisions. */
  games: number
  facts: Record<string, FactRec>
}

export type Kind = 'learn' | 'review' | 'probe' | 'extra' | 'again'

/** Une question de la récolte. `again` = un calcul raté qui revient. */
export interface Item {
  fact: Fact
  kind: Kind
}

export type Rng = () => number

/** Le nombre de questions d'une récolte : douze caisses dans la remorque. */
export const HARVEST = 12
/** Jamais plus de calculs en cours d'apprentissage à la fois. */
export const WORK_MAX = 6
/** Révisions de calculs sus, au plus, par récolte. */
export const REVIEW_MAX = 3
/** Écart maximal entre deux révisions d'un calcul su, en parties. */
export const GAP_MAX = 8

export function emptyMemory(): Memory {
  return { v: 1, games: 0, facts: {} }
}

export function recOf(mem: Memory, key: string): FactRec {
  return mem.facts[key] || { lv: 0, last: -1, gap: 0, seen: 0 }
}

/* ---------- Les calculs de la multiplication ---------- */

export function mulKey(a: number, b: number): string {
  return a <= b ? `${a}x${b}` : `${b}x${a}`
}

/** Les calculs des tables demandées : une table t = t × 1 … t × 10. */
export function mulPool(tables: number[]): Fact[] {
  const out: Fact[] = []
  for (let a = 1; a <= 10; a++) {
    for (let b = a; b <= 10; b++) {
      if (tables.includes(a) || tables.includes(b)) out.push({ key: mulKey(a, b), a, b })
    }
  }
  return out
}

/** Facilité d'un calcul jamais vu, pour sonder d'abord les faciles :
    ×1 et ×10, puis ×2 et ×5, puis les carrés, puis le reste. */
export function mulEase(f: Fact): number {
  const has = (n: number) => f.a === n || f.b === n
  if (has(1) || has(10)) return 0
  if (has(2) || has(5)) return 1
  if (f.a === f.b) return 2
  return 3
}

/** Pose le calcul dans un sens ou dans l'autre : 7 × 8 ou 8 × 7. */
export function orient(f: Fact, rng: Rng = Math.random): [number, number] {
  return rng() < 0.5 ? [f.a, f.b] : [f.b, f.a]
}

/* ---------- Composer une récolte ---------- */

function shuffled<T>(a: T[], rng: Rng): T[] {
  const out = [...a]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function isDue(mem: Memory, rec: FactRec): boolean {
  return rec.seen > 0 && mem.games - rec.last >= rec.gap
}

/** À appeler au début d'une récolte : c'est l'horloge des révisions. */
export function beginGame(mem: Memory) {
  mem.games++
}

/** Les douze questions d'une récolte, dans l'ordre où on les pose :
    - les calculs en cours d'apprentissage (niveaux 0 à 2) ;
    - jusqu'à trois révisions de calculs sus dont c'est le tour ;
    - des calculs jamais vus, s'il reste de la place ET si moins de six
      calculs sont en cours d'apprentissage ;
    - de quoi compléter : les calculs sus les plus anciens.
    On commence par une question facile (un calcul su, ou le plus facile des
    jamais vus) : la première caisse se remplit toujours. */
export function planHarvest(mem: Memory, pool: Fact[], opts: { n?: number; ease?: (f: Fact) => number; rng?: Rng } = {}): Item[] {
  const n = Math.min(opts.n ?? HARVEST, Math.max(1, pool.length))
  const rng = opts.rng ?? Math.random
  const ease = opts.ease ?? (() => 0)
  const rec = (f: Fact) => recOf(mem, f.key)

  const learning = pool.filter(f => rec(f).seen > 0 && rec(f).lv <= 2)
    .sort((x, y) => rec(x).lv - rec(y).lv || rec(x).last - rec(y).last)
  const known = pool.filter(f => rec(f).seen > 0 && rec(f).lv >= 3)
  const overdue = (f: Fact) => mem.games - rec(f).last - rec(f).gap
  const due = known.filter(f => isDue(mem, rec(f))).sort((x, y) => overdue(y) - overdue(x))
  const unseen = pool.filter(f => rec(f).seen === 0)
    .map(f => ({ f, k: ease(f) + rng() * 1.5 }))
    .sort((x, y) => x.k - y.k)
    .map(x => x.f)

  const out: Item[] = []
  const take = (fs: Fact[], kind: Kind, max: number) => {
    for (const f of fs) {
      if (out.length >= n || max <= 0) break
      if (out.some(it => it.fact.key === f.key)) continue
      out.push({ fact: f, kind })
      max--
    }
  }
  // Les révisions d'abord réservées (au plus trois), pour qu'une grosse
  // pile de calculs en cours ne les chasse jamais complètement
  const reviews = due.slice(0, Math.min(REVIEW_MAX, due.length))
  take(learning, 'learn', n - reviews.length)
  take(reviews, 'review', REVIEW_MAX)
  if (learning.length < WORK_MAX) take(unseen, 'probe', n)
  take(due, 'review', n)
  // Encore de la place : les calculs sus les plus anciens, puis (tout est
  // su et rien n'est dû) n'importe lesquels
  take([...known].sort((x, y) => rec(x).last - rec(y).last), 'extra', n)
  // Six calculs en cours et rien d'autre : on les repose une seconde fois
  // (entraînement, sans changer de niveau) plutôt que d'en ouvrir d'autres
  for (let k = 0; out.length < n && learning.length && k < n; k++) {
    out.push({ fact: learning[k % learning.length], kind: 'again' })
  }

  // Mélangées (entrelacement), sauf la première : la plus sûre
  const confidence = (it: Item) => it.kind === 'probe' ? 2 - ease(it.fact) : rec(it.fact).lv
  let first = 0
  out.forEach((it, i) => { if (confidence(it) > confidence(out[first])) first = i })
  const head = out.splice(first, 1)
  return spread([...head, ...shuffled(out, rng)])
}

/** Jamais deux fois le même calcul à la suite. */
function spread(q: Item[]): Item[] {
  for (let i = 1; i < q.length; i++) {
    if (q[i].fact.key !== q[i - 1].fact.key) continue
    const j = q.findIndex((it, k) => k > i && it.fact.key !== q[i].fact.key && (k + 1 >= q.length || q[k + 1].fact.key !== q[i].fact.key))
    if (j > 0) [q[i], q[j]] = [q[j], q[i]]
  }
  return q
}

/** Un calcul raté revient `gapQ` questions plus loin, à la place d'une
    question de moindre importance : la récolte garde ses douze caisses.
    Renvoie false s'il n'y a plus la place de le reposer. */
export function requeue(queue: Item[], at: number, fact: Fact, gapQ = 3): boolean {
  if (at >= queue.length - 1) return false
  const target = Math.min(queue.length - 1, at + gapQ)
  const PRIO: Record<Kind, number> = { again: 0, learn: 1, review: 2, probe: 3, extra: 4 }
  // La question sacrifiée : la moins importante après la courante (la plus
  // loin à importance égale), jamais le même calcul
  let drop = -1
  for (let i = queue.length - 1; i > at; i--) {
    const it = queue[i]
    if (it.kind === 'again' || it.fact.key === fact.key) continue
    if (drop < 0 || PRIO[it.kind] > PRIO[queue[drop].kind]) drop = i
  }
  if (drop < 0) return false
  queue.splice(drop, 1)
  queue.splice(Math.min(target, queue.length), 0, { fact, kind: 'again' })
  return true
}

/* ---------- Ce que montre le champ ---------- */

/** Le niveau d'aide d'une question : un calcul jamais vu est sondé en
    « Nombres seuls », un calcul raté qui revient a ses légumes. */
export function viewLevel(mem: Memory, it: Item): Level {
  if (it.kind === 'again') return LV.plants
  const r = recOf(mem, it.fact.key)
  if (r.seen === 0) return LV.numbers
  return r.lv
}

/** Répondre « vite » = sans recompter. Plus de marge au pavé qu'aux boutons. */
export function isFast(ms: number, pad: boolean): boolean {
  return ms <= (pad ? 7000 : 5000)
}

/* ---------- Noter une réponse ---------- */

export interface Outcome {
  /** Juste du premier coup. */
  ok: boolean
  /** Assez vite pour ne pas avoir recompté. */
  fast: boolean
}

/** Enregistre la réponse à une question. Un calcul qui revient (`again`)
    ne change pas de niveau : on a déjà noté son erreur. */
export function record(mem: Memory, it: Item, o: Outcome) {
  const key = it.fact.key
  const r = { ...recOf(mem, key) }
  const first = r.seen === 0
  r.seen++
  r.last = mem.games
  if (it.kind !== 'again') {
    const before = r.lv
    if (!o.ok) {
      r.lv = first ? LV.discover : (r.lv >= LV.plants ? LV.plants : LV.discover)
    } else if (first) {
      r.lv = o.fast ? LV.numbers : LV.outline
    } else if (r.lv <= LV.plants) {
      r.lv = (r.lv + 1) as Level          // en comptant, c'est normal d'être lente
    } else if (o.fast) {
      r.lv = Math.min(LV.heart, r.lv + 1) as Level
    }                                     // juste mais recompté : on reste
    if (r.lv < LV.numbers) r.gap = 0
    else if (before < LV.numbers) r.gap = 1
    else if (o.ok && o.fast) r.gap = Math.min(GAP_MAX, Math.max(1, r.gap * 2))
    // (su mais recompté : même écart, il reviendra aussi vite)
  }
  mem.facts[key] = r
}

/* ---------- Les réponses proposées ---------- */

/** Les réponses à proposer, dont la bonne, mélangées. Les pièges sont des
    calculs VOISINS (7 × 7, 7 × 9, 6 × 8, 8 × 8 pour 7 × 8), jamais des
    nombres au hasard : se tromper de rangée, c'est l'erreur qu'on veut voir. */
export function mulChoices(a: number, b: number, count: number, rng: Rng = Math.random, exclude: number[] = []): number[] {
  const ans = a * b
  const near = [a * (b - 1), a * (b + 1), (a - 1) * b, (a + 1) * b]
  const more = [a * a, b * b, (a - 1) * (b + 1), (a + 1) * (b - 1), a * (b - 2), a * (b + 2), (a - 2) * b, (a + 2) * b]
  const far = [ans + 1, ans - 1, ans + 2, ans - 2, ans + 10, ans - 10]
  const ok = (v: number) => v >= 1 && v <= 100 && v !== ans && !exclude.includes(v)
  const out: number[] = []
  for (const group of [near, more, far]) {
    for (const v of shuffled(group, rng)) {
      if (out.length >= count - 1) break
      if (ok(v) && !out.includes(v)) out.push(v)
    }
  }
  // Tout petit calcul (1 × 1…) : on complète avec des nombres proches
  for (let d = 1; out.length < count - 1 && d < 20; d++) {
    for (const v of [ans + d, ans - d]) if (out.length < count - 1 && ok(v) && !out.includes(v)) out.push(v)
  }
  return shuffled([ans, ...out], rng)
}

/** Le « presque » : si la réponse est le produit d'un rectangle voisin
    (une ou deux rangées de trop ou de moins), renvoie ce rectangle — le
    champ le plante en pâle, puis montre la rangée qui manque (ou celle
    en trop). Sinon null. Les rangées sont `r`, les colonnes `c`. */
export function nearMiss(r: number, c: number, v: number): { r: number; c: number } | null {
  if (v === r * c) return null
  for (const d of [1, -1, 2, -2]) {
    if (c + d >= 1 && c + d <= 10 && r * (c + d) === v) return { r, c: c + d }
    if (r + d >= 1 && r + d <= 10 && (r + d) * c === v) return { r: r + d, c }
  }
  return null
}

/* ---------- Sur la tablette ---------- */

const KEY = (game: string) => `ferme:faits:${game}`

export function loadMemory(game: string): Memory {
  try {
    const raw = localStorage.getItem(KEY(game))
    if (!raw) return emptyMemory()
    const m = JSON.parse(raw) as Partial<Memory>
    if (m.v !== 1 || typeof m.games !== 'number' || !m.facts || typeof m.facts !== 'object') return emptyMemory()
    return { v: 1, games: m.games, facts: m.facts }
  } catch {
    return emptyMemory() // mémoire illisible : on repart de zéro, le jeu reste jouable
  }
}

export function saveMemory(game: string, mem: Memory) {
  try {
    localStorage.setItem(KEY(game), JSON.stringify(mem))
  } catch (e) {
    // Quota plein ou stockage bloqué : la partie continue, sans mémoire
    console.warn('Mémoire des calculs non enregistrée', e)
  }
}
