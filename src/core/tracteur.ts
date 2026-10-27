/* 🚜 Le Tracteur à programmer (27/10) — la logique, sans une ligne de 3D :
   le pré quadrillé, ses obstacles, les animaux à aller chercher, la file de
   flèches et son exécution pas à pas, les manches générées et toujours
   solubles. Testé (`tracteur.test.ts`) ; le rendu est dans
   `games/tracteur.ts`.

   Les cases : `c` de gauche à droite, `r` du fond (0) vers nous. Le cap :
   0 = vers le fond, 1 = à droite, 2 = vers nous, 3 = à gauche.

   Deux jeux de flèches (le codage de déplacements du cycle 2) :
   - `abs` (la fleur) : ↑ ↓ ← →, la direction de l'écran ; le tracteur se
     tourne de lui-même avant d'avancer d'une case ;
   - `rel` (l'éclair, la flamme) : avance, tourne à gauche, tourne à droite,
     vu du tracteur (comme le Bee-Bot de l'école) — tourner ne fait pas
     avancer.
   La flamme ajoute la boucle « ×2 » : posée devant une flèche, elle la
   joue deux fois, dans la même case de la file. */

export type Abs = 'N' | 'E' | 'S' | 'W'
export type Rel = 'F' | 'L' | 'R'
export type Cmd = Abs | Rel
export type Dir = 0 | 1 | 2 | 3
export type Mode = 'abs' | 'rel'
export type Tier = 'easy' | 'med' | 'exp'

/** Une case de la file : une flèche, jouée une fois ou deux (`x2`). */
export interface Token { cmd: Cmd; x2?: boolean }

export interface Pos { c: number; r: number }

export interface Level {
  n: number
  mode: Mode
  /** La boucle ×2 est disponible. */
  loops: boolean
  /** Combien de cases a la file. */
  slots: number
  start: Pos
  dir: Dir
  rocks: Pos[]
  animals: Pos[]
  /** Le plus court programme (en cases de file), pour la rampe et les tests. */
  best: number
}

/** Un état du tracteur pendant l'exécution. */
export interface Rig { c: number; r: number; dir: Dir; mask: number }

/** Ce qui se passe à un pas : le tracteur se tourne, avance, cogne ou sort du pré. */
export interface Step {
  /** L'indice de la flèche dans la file (celle qui s'allume). */
  tok: number
  /** 0 ou 1 : premier ou second passage d'une flèche ×2. */
  rep: number
  kind: 'turn' | 'move' | 'bump' | 'out'
  from: Rig
  to: Rig
  /** L'animal ramassé en arrivant dans la case (son indice). */
  pick?: number
}

export interface RunResult {
  steps: Step[]
  /** Tous les animaux sont dans la charrette. */
  ok: boolean
  /** La flèche fautive (choc ou sortie du pré), ou null. */
  fault: number | null
}

export const DC = [0, 1, 0, -1]
export const DR = [-1, 0, 1, 0]
const ABS_DIR: Record<Abs, Dir> = { N: 0, E: 1, S: 2, W: 3 }

export const CMDS: Record<Mode, Cmd[]> = { abs: ['N', 'W', 'E', 'S'], rel: ['F', 'L', 'R'] }

const key = (c: number, r: number) => c * 16 + r

/** Un pas d'une flèche, depuis un état : le pas, et l'état d'après. */
export function stepOf(lv: Level, s: Rig, cmd: Cmd, rocks?: Set<number>): Omit<Step, 'tok' | 'rep'> {
  const rk = rocks ?? new Set(lv.rocks.map(p => key(p.c, p.r)))
  let dir = s.dir
  if (cmd === 'L' || cmd === 'R') {
    dir = ((s.dir + (cmd === 'L' ? 3 : 1)) % 4) as Dir
    return { kind: 'turn', from: s, to: { ...s, dir } }
  }
  if (cmd !== 'F') dir = ABS_DIR[cmd]
  const c = s.c + DC[dir], r = s.r + DR[dir]
  if (c < 0 || r < 0 || c >= lv.n || r >= lv.n) return { kind: 'out', from: s, to: { ...s, dir } }
  if (rk.has(key(c, r))) return { kind: 'bump', from: s, to: { ...s, dir } }
  let mask = s.mask, pick: number | undefined
  lv.animals.forEach((a, i) => {
    if (a.c === c && a.r === r && !(mask & (1 << i))) { mask |= 1 << i; pick = i }
  })
  return { kind: 'move', from: s, to: { c, r, dir, mask }, ...(pick !== undefined ? { pick } : {}) }
}

const full = (lv: Level) => (1 << lv.animals.length) - 1

/** Joue toute la file : le tracteur s'arrête net au premier choc, et dès
    que le dernier animal est monté (la suite de la file ne joue pas). */
export function run(lv: Level, file: Token[]): RunResult {
  const rocks = new Set(lv.rocks.map(p => key(p.c, p.r)))
  let s: Rig = { c: lv.start.c, r: lv.start.r, dir: lv.dir, mask: 0 }
  const steps: Step[] = []
  for (let tok = 0; tok < file.length; tok++) {
    const t = file[tok]
    for (let rep = 0; rep < (t.x2 && lv.loops ? 2 : 1); rep++) {
      const st = { ...stepOf(lv, s, t.cmd, rocks), tok, rep }
      steps.push(st)
      if (st.kind === 'bump' || st.kind === 'out') return { steps, ok: false, fault: tok }
      s = st.to
      if (s.mask === full(lv)) return { steps, ok: true, fault: null }
    }
  }
  return { steps, ok: false, fault: null }
}

/** Le plus court programme (en cases de file) qui ramasse tous les animaux,
    ou null. Une recherche en largeur sur (case, cap, animaux ramassés), où
    chaque arête est UNE case de la file : une flèche, ou une flèche ×2 quand
    la boucle est permise. */
export function solve(lv: Level): Token[] | null {
  const rocks = new Set(lv.rocks.map(p => key(p.c, p.r)))
  const goal = full(lv)
  const sk = (s: Rig) => ((s.c * 16 + s.r) * 4 + s.dir) * 8 + s.mask
  const s0: Rig = { c: lv.start.c, r: lv.start.r, dir: lv.dir, mask: 0 }
  const prev = new Map<number, { from: number; tok: Token } | null>([[sk(s0), null]])
  const states = new Map<number, Rig>([[sk(s0), s0]])
  let front = [s0]
  const tokens: Token[] = []
  for (const cmd of CMDS[lv.mode]) {
    tokens.push({ cmd })
    if (lv.loops) tokens.push({ cmd, x2: true })
  }
  while (front.length) {
    const next: Rig[] = []
    for (const s of front) {
      for (const tok of tokens) {
        let cur = s, bad = false
        for (let rep = 0; rep < (tok.x2 ? 2 : 1); rep++) {
          const st = stepOf(lv, cur, tok.cmd, rocks)
          if (st.kind === 'bump' || st.kind === 'out') { bad = true; break }
          cur = st.to
          if (cur.mask === goal) break
        }
        if (bad) continue
        const k = sk(cur)
        if (prev.has(k)) continue
        prev.set(k, { from: sk(s), tok })
        states.set(k, cur)
        if (cur.mask === goal) {
          const out: Token[] = []
          for (let p = prev.get(k); p; p = prev.get(p.from)) out.unshift(p.tok)
          return out
        }
        next.push(cur)
      }
    }
    front = next
  }
  return null
}

/* ---------- Les manches ---------- */

/** Ce que chaque niveau demande, manche après manche (k = 0..7). */
const PLAN: Record<Tier, { n: number; mode: Mode; loops: boolean; slots: number; animals: number; rocks: (k: number) => number; len: (k: number) => [number, number] }> = {
  // La fleur : un pré de 5, quatre flèches de l'écran, de 2 à 6 flèches
  easy: { n: 5, mode: 'abs', loops: false, slots: 8, animals: 1, rocks: k => 2 + (k >> 1), len: k => [2 + (k >> 1), 3 + (k >> 1)] },
  // L'éclair : un pré de 6, vu du tracteur (tourner compte pour une flèche)
  med: { n: 6, mode: 'rel', loops: false, slots: 10, animals: 1, rocks: k => 3 + (k >> 1), len: k => [3 + (k >> 1), 4 + (k >> 1)] },
  // La flamme : un pré de 7, deux animaux, la boucle ×2 qui fait gagner des cases
  exp: { n: 7, mode: 'rel', loops: true, slots: 9, animals: 2, rocks: k => 4 + (k >> 1), len: k => [4 + (k >> 1), 5 + (k >> 1)] }
}

export const ROUNDS = 8

/** Un générateur pseudo-aléatoire à graine (les tests). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Une manche : on tire au sort, on garde celle dont le plus court programme
    tombe dans la fourchette voulue (et tient dans la file). À la flamme, la
    boucle doit vraiment servir : sans elle, il faudrait plus de cases. */
export function makeLevel(tier: Tier, k: number, rand: () => number = Math.random): Level {
  const P = PLAN[tier]
  const [lo0, hi] = P.len(k)
  const pick = (n: number) => Math.floor(rand() * n)
  for (let tries = 0; tries < 4000; tries++) {
    // Passé mille essais, on relâche la longueur minimale (jamais la soluble)
    const lo = Math.max(1, lo0 - Math.floor(tries / 1000))
    const used = new Set<number>()
    const cell = (): Pos => {
      for (;;) {
        const p = { c: pick(P.n), r: pick(P.n) }
        if (!used.has(key(p.c, p.r))) { used.add(key(p.c, p.r)); return p }
      }
    }
    // Le tracteur part plutôt du devant du pré (on le voit mieux), cap au fond
    const start = { c: pick(P.n), r: P.n - 1 - pick(Math.ceil(P.n / 2)) }
    used.add(key(start.c, start.r))
    const dir: Dir = P.mode === 'abs' ? 0 : (rand() < 0.6 ? 0 : ([1, 3][pick(2)] as Dir))
    const animals = Array.from({ length: P.animals }, cell)
    const rocks = Array.from({ length: P.rocks(k) }, cell)
    const lv: Level = { n: P.n, mode: P.mode, loops: P.loops, slots: P.slots, start, dir, rocks, animals, best: 0 }
    const sol = solve(lv)
    if (!sol || sol.length < lo || sol.length > Math.min(hi, P.slots)) continue
    if (P.loops) {
      const plain = solve({ ...lv, loops: false })
      if (!plain || plain.length <= sol.length) continue
    }
    lv.best = sol.length
    return lv
  }
  throw new Error('aucune manche soluble')
}

export function makeRounds(tier: Tier, rand: () => number = Math.random): Level[] {
  return Array.from({ length: ROUNDS }, (_, k) => makeLevel(tier, k, rand))
}

/** Les étoiles : jamais de perte (Apprendre). Seuls comptent les départs
    qui n'ont pas ramené tout le monde. */
export function starsFor(retries: number): 1 | 2 | 3 {
  return retries <= 3 ? 3 : retries <= 9 ? 2 : 1
}
