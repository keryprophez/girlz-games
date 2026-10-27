/* La mémoire des calculs — phase 4, « la Ferme des calculs » (23/09).

   Le Potager pose des calculs des quatre opérations (+ − × ÷, choisies à
   l'ouverture, 27/09) ; ce module retient, calcul par calcul, ce que l'enfant sait déjà, et compose
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
     redescendre un calcul (« rien ne fane jamais »).

   Le même moteur pour les autres jeux d'Apprendre (27/10, « levier 4 ») :
   il ne connaît que des CLÉS (`Keyed`), un calcul n'en est qu'un cas. Une
   heure de l'Horloge, un pays du Tour du Monde, un mot de la Chasse aux
   lettres, un montant du Marché sont des éléments comme les autres. Pour
   eux (`recall`, tout en bas) :
   - une série se tire SANS REMISE (`planSeries`) : jamais deux fois la même
     question, sauf un raté qui revient trois questions plus loin
     (`comeBack`) quand la série est assez longue — sinon à la série
     suivante, en tête ;
   - ce qui a été raté passe d'abord, puis quelques révisions de ce qui est
     su, puis le jamais vu, puis ce qu'on n'a pas vu depuis le plus
     longtemps ;
   - « juste du premier coup » suffit pour monter : le temps n'y est pas
     compté (les niveaux ne disent pas d'aide, seulement ce qui est su) ;
   - une mémoire par jeu, commune à la famille, dans le localStorage
     (`ferme:memoire:<jeu>`, compacte, bornée à `MEM_MAX` éléments), relue
     prudemment (une entrée abîmée est oubliée, pas toute la mémoire) ;
   - silencieuse : rien ne s'affiche, rien ne fane, rien ne se débloque. */

export type Level = 0 | 1 | 2 | 3 | 4
export const LV = { discover: 0, plants: 1, outline: 2, numbers: 3, heart: 4 } as const

/** N'importe quel élément à retenir : un calcul, une heure, un pays, un
    mot, un montant. La mémoire ne connaît que sa clé. */
export interface Keyed {
  key: string
}

/** Les quatre opérations. − et ÷ se lisent dans le tableau de + et de × :
    ce sont les mêmes tableaux, lus à l'envers. */
export type Op = 'add' | 'sub' | 'mul' | 'div'

/** Un calcul. Pour × et +, 7 × 8 et 8 × 7 sont UN SEUL calcul (a ≤ b). Pour
    ÷ et −, le calcul est orienté : (a × b) ÷ a = b — 56 ÷ 7 et 56 ÷ 8 sont
    deux calculs (on lit la table à l'envers : dans la rangée du 7, où est
    56 ?) ; de même (a + b) − a = b : 11 − 7, c'est chercher 11 dans la
    rangée du 7. */
export interface Fact extends Keyed {
  a: number
  b: number
  op: Op
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

/** Une question de la récolte (ou d'une série). `again` = un calcul raté
    qui revient. Le champ garde son nom de `fact`, quel que soit l'élément. */
export interface Item<F extends Keyed = Fact> {
  fact: F
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
      if (tables.includes(a) || tables.includes(b)) out.push({ key: mulKey(a, b), a, b, op: 'mul' })
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

/** Pose le calcul dans un sens ou dans l'autre : 7 × 8 ou 8 × 7. Une
    division ou une soustraction, elle, ne se retourne pas. */
export function orient(f: Fact, rng: Rng = Math.random): [number, number] {
  if (f.op === 'div' || f.op === 'sub') return [f.a, f.b]
  return rng() < 0.5 ? [f.a, f.b] : [f.b, f.a]
}

/* ---------- Les calculs de l'addition ---------- */

export function addKey(a: number, b: number): string {
  return a <= b ? `${a}+${b}` : `${b}+${a}`
}

/** Les additions des rangées demandées : une rangée r = r + 1 … r + 10. */
export function addPool(rows: number[]): Fact[] {
  const out: Fact[] = []
  for (let a = 1; a <= 10; a++) {
    for (let b = a; b <= 10; b++) {
      if (rows.includes(a) || rows.includes(b)) out.push({ key: addKey(a, b), a, b, op: 'add' })
    }
  }
  return out
}

/** Facilité d'une addition jamais vue : + 1 et + 10, puis les doubles, puis
    les sommes qui ne passent pas la dizaine, puis celles qui la passent. */
export function addEase(f: Fact): number {
  const has = (n: number) => f.a === n || f.b === n
  if (has(1) || has(10)) return 0
  if (f.a === f.b) return 1
  if (f.a + f.b <= 10) return 2
  return 3
}

/** (a + b) − a = b. Clé « 11-7 ». */
export function subFact(a: number, b: number): Fact {
  return { key: `${a + b}-${a}`, a, b, op: 'sub' }
}

/** Les soustractions des additions du lot : 11 − 7 et 11 − 4 pour 7 + 4. */
export function subPool(addFacts: Fact[]): Fact[] {
  const out: Fact[] = []
  for (const f of addFacts) {
    if (f.op !== 'add') continue
    out.push(subFact(f.a, f.b))
    if (f.b !== f.a) out.push(subFact(f.b, f.a))
  }
  return out
}

/* ---------- Les divisions : la table lue à l'envers ---------- */

/** (a × b) ÷ a = b. Clé « 56:7 ». */
export function divFact(a: number, b: number): Fact {
  return { key: `${a * b}:${a}`, a, b, op: 'div' }
}

/** Les divisions des multiplications du lot : 56 ÷ 7 et 56 ÷ 8 pour 7 × 8.
    Pas de ÷ 1, qui n'apprend rien. Avec une mémoire, seulement celles des
    multiplications SUES (niveau 3 ou plus) ; sans (l'étiquette ÷ choisie à
    l'ouverture du Potager), toutes. */
export function divPool(mulFacts: Fact[], mem?: Memory): Fact[] {
  const out: Fact[] = []
  for (const f of mulFacts) {
    if (f.op !== 'mul' || (mem && recOf(mem, f.key).lv < 3)) continue
    if (f.a > 1) out.push(divFact(f.a, f.b))
    if (f.b > 1 && f.b !== f.a) out.push(divFact(f.b, f.a))
  }
  return out
}

/** Facilité d'un calcul : une division a celle de sa multiplication, une
    soustraction celle de son addition. */
export function factEase(f: Fact): number {
  const lo = Math.min(f.a, f.b), hi = Math.max(f.a, f.b)
  if (f.op === 'add' || f.op === 'sub') return addEase({ key: '', a: lo, b: hi, op: 'add' })
  return mulEase({ key: '', a: lo, b: hi, op: 'mul' })
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

export interface PlanOpts<F extends Keyed> {
  /** Nombre de questions (douze pour une récolte). */
  n?: number
  /** Facilité d'un élément jamais vu (0 = le plus facile, sondé d'abord). */
  ease?: (f: F) => number
  rng?: Rng
  /** Révisions réservées, au plus (trois par défaut). */
  reviews?: number
  /** Six éléments en cours et rien d'autre : les reposer une seconde fois
      (le Potager, par défaut) ; sinon, en ouvrir de nouveaux (une série
      sans remise). */
  repeat?: boolean
}

/** Les douze questions d'une récolte, dans l'ordre où on les pose :
    - les calculs en cours d'apprentissage (niveaux 0 à 2) ;
    - jusqu'à trois révisions de calculs sus dont c'est le tour ;
    - des calculs jamais vus, s'il reste de la place ET si moins de six
      calculs sont en cours d'apprentissage ;
    - de quoi compléter : les calculs sus les plus anciens.
    On commence par une question facile (un calcul su, ou le plus facile des
    jamais vus) : la première caisse se remplit toujours. */
export function planHarvest<F extends Keyed = Fact>(mem: Memory, pool: F[], opts: PlanOpts<F> = {}): Item<F>[] {
  const rng = opts.rng ?? Math.random
  const ease = opts.ease ?? (() => 0)
  return arrange(mem, choose(mem, pool, opts, ease, rng), ease, rng)
}

/** Les éléments d'une récolte ou d'une série, pas encore dans l'ordre. */
function choose<F extends Keyed>(mem: Memory, pool: F[], opts: PlanOpts<F>, ease: (f: F) => number, rng: Rng): Item<F>[] {
  const n = Math.min(opts.n ?? HARVEST, Math.max(1, pool.length))
  const revMax = opts.reviews ?? REVIEW_MAX
  const repeat = opts.repeat ?? true
  const rec = (f: F) => recOf(mem, f.key)

  const learning = pool.filter(f => rec(f).seen > 0 && rec(f).lv <= 2)
    .sort((x, y) => rec(x).lv - rec(y).lv || rec(x).last - rec(y).last)
  const known = pool.filter(f => rec(f).seen > 0 && rec(f).lv >= 3)
  const overdue = (f: F) => mem.games - rec(f).last - rec(f).gap
  const due = known.filter(f => isDue(mem, rec(f))).sort((x, y) => overdue(y) - overdue(x))
  const unseen = pool.filter(f => rec(f).seen === 0)
    .map(f => ({ f, k: ease(f) + rng() * 1.5 }))
    .sort((x, y) => x.k - y.k)
    .map(x => x.f)

  const out: Item<F>[] = []
  const take = (fs: F[], kind: Kind, max: number) => {
    for (const f of fs) {
      if (out.length >= n || max <= 0) break
      if (out.some(it => it.fact.key === f.key)) continue
      out.push({ fact: f, kind })
      max--
    }
  }
  // Les révisions d'abord réservées (au plus trois), pour qu'une grosse
  // pile de calculs en cours ne les chasse jamais complètement
  const reviews = due.slice(0, Math.min(revMax, due.length))
  take(learning, 'learn', n - reviews.length)
  take(reviews, 'review', revMax)
  if (learning.length < WORK_MAX) take(unseen, 'probe', n)
  take(due, 'review', n)
  // Encore de la place : les calculs sus les plus anciens, puis (tout est
  // su et rien n'est dû) n'importe lesquels
  take([...known].sort((x, y) => rec(x).last - rec(y).last), 'extra', n)
  if (repeat) {
    // Six calculs en cours et rien d'autre : on les repose une seconde fois
    // (entraînement, sans changer de niveau) plutôt que d'en ouvrir d'autres
    for (let k = 0; out.length < n && learning.length && k < n; k++) {
      out.push({ fact: learning[k % learning.length], kind: 'again' })
    }
  } else {
    // Une série sans remise : plutôt du neuf que deux fois la même question
    take(unseen, 'probe', n)
  }
  return out
}

/** L'ordre des questions : mélangées (entrelacement), sauf la première, la
    plus sûre — la première caisse se remplit toujours. */
function arrange<F extends Keyed>(mem: Memory, out: Item<F>[], ease: (f: F) => number, rng: Rng): Item<F>[] {
  const confidence = (it: Item<F>) => it.kind === 'probe' ? 2 - ease(it.fact) : recOf(mem, it.fact.key).lv
  let first = 0
  out.forEach((it, i) => { if (confidence(it) > confidence(out[first])) first = i })
  const head = out.splice(first, 1)
  return spread([...head, ...shuffled(out, rng)])
}

/** Jamais deux fois le même calcul à la suite. */
function spread<F extends Keyed>(q: Item<F>[]): Item<F>[] {
  for (let i = 1; i < q.length; i++) {
    if (q[i].fact.key !== q[i - 1].fact.key) continue
    const j = q.findIndex((it, k) => k > i && it.fact.key !== q[i].fact.key && (k + 1 >= q.length || q[k + 1].fact.key !== q[i].fact.key))
    if (j > 0) [q[i], q[j]] = [q[j], q[i]]
  }
  return q
}

/** L'importance d'une question, quand il faut en sacrifier une : un élément
    qui revient (0) passe avant tout, un « de quoi compléter » (4) cède le
    premier. */
const PRIO: Record<Kind, number> = { again: 0, learn: 1, review: 2, probe: 3, extra: 4 }

/** Un calcul raté revient `gapQ` questions plus loin, à la place d'une
    question de moindre importance : la récolte garde ses douze caisses.
    Renvoie false s'il n'y a plus la place de le reposer. */
export function requeue<F extends Keyed>(queue: Item<F>[], at: number, fact: F, gapQ = 3): boolean {
  if (at >= queue.length - 1) return false
  const target = Math.min(queue.length - 1, at + gapQ)
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
export function viewLevel(mem: Memory, it: Item<Keyed>): Level {
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
export function record(mem: Memory, it: Item<Keyed>, o: Outcome) {
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

/** Les réponses d'une division (a × b) ÷ a = b : des quotients voisins
    (b ± 1, b ± 2), jamais hors de la table. */
export function divChoices(a: number, b: number, count: number, rng: Rng = Math.random, exclude: number[] = []): number[] {
  const ok = (v: number) => v >= 1 && v <= 10 && v !== b && !exclude.includes(v)
  const out: number[] = []
  for (const group of [[b - 1, b + 1], [b - 2, b + 2, a === b ? b + 3 : a], [b - 3, b + 3, b - 4, b + 4]]) {
    for (const v of shuffled(group, rng)) {
      if (out.length >= count - 1) break
      if (ok(v) && !out.includes(v)) out.push(v)
    }
  }
  return shuffled([b, ...out], rng)
}

/** Les réponses d'une addition : des sommes voisines (± 1, ± 2 : une case
    de trop ou de moins en comptant), et la dizaine confondue (± 10). */
export function addChoices(a: number, b: number, count: number, rng: Rng = Math.random, exclude: number[] = []): number[] {
  const ans = a + b
  const ok = (v: number) => v >= 2 && v <= 20 && v !== ans && !exclude.includes(v)
  const out: number[] = []
  for (const group of [[ans - 1, ans + 1], [ans - 2, ans + 2, ans + 10, ans - 10], [ans - 3, ans + 3, ans - 4, ans + 4]]) {
    for (const v of shuffled(group, rng)) {
      if (out.length >= count - 1) break
      if (ok(v) && !out.includes(v)) out.push(v)
    }
  }
  return shuffled([ans, ...out], rng)
}

/** Les réponses d'une soustraction (a + b) − a = b : des restes voisins
    (b ± 1, b ± 2) et l'autre nombre du calcul (a), jamais hors du tableau. */
export function subChoices(a: number, b: number, count: number, rng: Rng = Math.random, exclude: number[] = []): number[] {
  const ok = (v: number) => v >= 1 && v <= 10 && v !== b && !exclude.includes(v)
  const out: number[] = []
  for (const group of [[b - 1, b + 1], [b - 2, b + 2, a === b ? b + 3 : a], [b - 3, b + 3, b - 4, b + 4]]) {
    for (const v of shuffled(group, rng)) {
      if (out.length >= count - 1) break
      if (ok(v) && !out.includes(v)) out.push(v)
    }
  }
  return shuffled([b, ...out], rng)
}

/** Le « presque » d'une addition : la bande de SA réponse dans la même
    rangée (10 pour 7 + 4 : la rangée du 7 jusqu'à la case 3). Sinon null. */
export function nearMissAdd(r: number, c: number, v: number): { r: number; c: number } | null {
  const k = v - r
  if (v === r + c || k < 1 || k > 10) return null
  return { r, c: k }
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

/* ---------- Les séries des autres jeux d'Apprendre (27/10) ----------
   L'Horloge, le Tour du Monde, la Chasse aux lettres, le Marché : le même
   moteur, sans remise. Voir l'en-tête du fichier. */

export interface SeriesOpts<F extends Keyed> {
  rng?: Rng
  /** Facilité d'un élément jamais vu (par défaut : tous égaux, au hasard). */
  ease?: (f: F) => number
  /** Révisions réservées, au plus. Par défaut une question sur quatre (aucune
      dans une série de trois, deux sur huit, trois sur douze) : une série
      courte garde sa place à ce qui a été raté. 0 : pas de révision de ce
      qui est su (un montant du Marché n'est pas une leçon à revoir). */
  reviews?: number
}

/** Une série de `n` questions SANS REMISE : jamais deux fois le même
    élément (moins si le tas est plus petit). D'abord ce qui a été raté,
    quelques révisions, le jamais vu, puis le moins récent ; la plus sûre en
    tête, le reste mélangé. */
export function planSeries<F extends Keyed>(mem: Memory, pool: F[], n: number, opts: SeriesOpts<F> = {}): Item<F>[] {
  return planMix(mem, [{ pool, n }], opts)
}

/** Une série tirée de plusieurs tas, `n` de chacun, mêlés (le Tour du Monde
    à la fleur : autant d'animaux que de pays). Sans remise, d'un tas à
    l'autre aussi. */
export function planMix<F extends Keyed>(mem: Memory, parts: { pool: F[]; n: number }[], opts: SeriesOpts<F> = {}): Item<F>[] {
  const rng = opts.rng ?? Math.random
  const ease = opts.ease ?? (() => 0)
  const out: Item<F>[] = []
  for (const { pool, n } of parts) {
    if (n <= 0 || !pool.length) continue
    const reviews = opts.reviews ?? Math.min(REVIEW_MAX, Math.floor(n / 4))
    for (const it of choose(mem, pool, { n, reviews, repeat: false }, ease, rng)) {
      if (!out.some(o => o.fact.key === it.fact.key)) out.push(it)
    }
  }
  return arrange(mem, out, ease, rng)
}

/** Combien de questions plus loin revient un raté : trois (deux questions
    entre les deux). */
export const COME_BACK = 3

/** Un raté revient trois questions plus loin, à la place de la question la
    moins importante (la série garde sa longueur) — si la série est assez
    longue ; sinon il attend la série suivante, où il passe en tête. Un
    élément qui revient déjà ne revient pas une troisième fois.

    Plus strict que le `requeue` du Potager : la question sacrifiée est prise
    à partir de là où il revient, jamais entre les deux — rien n'avance, et
    un autre raté déjà en route garde ses trois questions d'écart. */
export function comeBack<F extends Keyed>(queue: Item<F>[], at: number): boolean {
  const it = queue[at]
  if (!it || it.kind === 'again') return false
  const target = at + COME_BACK
  if (target > queue.length - 1) return false
  let drop = -1
  for (let i = queue.length - 1; i >= target; i--) {
    const q = queue[i]
    if (q.kind === 'again' || q.fact.key === it.fact.key) continue
    if (drop < 0 || PRIO[q.kind] > PRIO[queue[drop].kind]) drop = i
  }
  if (drop < 0) return false
  queue.splice(drop, 1)
  queue.splice(target, 0, { fact: it.fact, kind: 'again' })
  return true
}

/** Au plus tant d'éléments retenus par jeu : l'Horloge en a 360 en tout,
    le Tour du Monde 70, les Lettres 22 ; seul le Marché, aux montants sans
    fin, peut dépasser. */
export const MEM_MAX = 400

/** Garde la mémoire sous `max` éléments : on oublie d'abord les éléments
    SUS les plus anciens (un montant payé il y a longtemps), jamais un raté
    avant eux. Un élément oublié redevient « jamais vu » : rien ne descend. */
export function prune(mem: Memory, max = MEM_MAX) {
  const keys = Object.keys(mem.facts)
  if (keys.length <= max) return
  const rec = (k: string) => mem.facts[k]
  const learning = (k: string) => Number(rec(k).lv < LV.numbers)
  keys.sort((x, y) => learning(x) - learning(y) || rec(x).last - rec(y).last)
  for (const k of keys.slice(0, keys.length - max)) delete mem.facts[k]
}

/** La mémoire en JSON compact : `[niveau, partie, écart, vu]` par élément. */
export function packMemory(mem: Memory, max = MEM_MAX): string {
  prune(mem, max)
  const facts: Record<string, number[]> = {}
  for (const [k, r] of Object.entries(mem.facts)) facts[k] = [r.lv, r.last, r.gap, r.seen]
  return JSON.stringify({ v: 1, games: mem.games, facts })
}

/** Relue prudemment : illisible → une mémoire neuve (le jeu reste jouable) ;
    une entrée abîmée est oubliée, les autres sont gardées. */
export function unpackMemory(raw: string | null | undefined, max = MEM_MAX): Memory {
  const mem = emptyMemory()
  if (!raw) return mem
  let m: unknown
  try { m = JSON.parse(raw) } catch { return mem }
  if (!m || typeof m !== 'object') return mem
  const { v, games, facts } = m as { v?: unknown; games?: unknown; facts?: unknown }
  if (v !== 1 || !Number.isSafeInteger(games) || (games as number) < 0) return mem
  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) return mem
  mem.games = games as number
  for (const [k, e] of Object.entries(facts as Record<string, unknown>)) {
    if (!k || k.length > 64 || !Array.isArray(e) || e.length !== 4 || !e.every(x => Number.isSafeInteger(x))) continue
    const [lv, last, gap, seen] = e as number[]
    if (lv < 0 || lv > LV.heart || last < -1 || gap < 0 || gap > GAP_MAX || seen < 1) continue
    mem.facts[k] = { lv: lv as Level, last: Math.min(last, mem.games), gap, seen }
  }
  prune(mem, max)
  return mem
}

/** Où se range la mémoire : le localStorage de la tablette (ou, pour les
    tests, n'importe quelle étagère). */
export interface Shelf {
  get(key: string): string | null
  set(key: string, value: string): void
}

const tablet: Shelf = {
  get: k => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => {
    try { localStorage.setItem(k, v) } catch (e) {
      // Quota plein ou stockage bloqué : la partie continue, sans mémoire
      console.warn('Mémoire du jeu non enregistrée', e)
    }
  }
}

export const memoryKey = (game: string) => `ferme:memoire:${game}`

/** La mémoire d'un jeu d'Apprendre, prête à l'emploi. */
export interface Recall {
  readonly mem: Memory
  /** Une nouvelle série de `n` questions : l'horloge des révisions avance
      d'une partie, puis le tirage sans remise. */
  series<F extends Keyed>(pool: F[], n: number, opts?: SeriesOpts<F>): Item<F>[]
  /** Pareil, tirée de plusieurs tas (`planMix`). */
  mix<F extends Keyed>(parts: { pool: F[]; n: number }[], opts?: SeriesOpts<F>): Item<F>[]
  /** La réponse à une question : juste du premier coup, ou ratée. Gardée
      tout de suite (une partie quittée en route compte). */
  note(it: Item<Keyed>, ok: boolean): void
}

/** Ouvre la mémoire d'un jeu (`ferme:memoire:<jeu>`, commune à la famille). */
export function recall(game: string, shelf: Shelf = tablet): Recall {
  const key = memoryKey(game)
  const mem = unpackMemory(shelf.get(key))
  const save = () => shelf.set(key, packMemory(mem))
  return {
    mem,
    series(pool, n, opts) {
      beginGame(mem); save()
      return planSeries(mem, pool, n, opts)
    },
    mix(parts, opts) {
      beginGame(mem); save()
      return planMix(mem, parts, opts)
    },
    note(it, ok) {
      record(mem, it, { ok, fast: ok })
      save()
    }
  }
}
