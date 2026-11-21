import type { Keyed, Rng } from './facts'
import type { Tier } from './types'

/* Les échecs (21/11) — les règles et les exercices des Échecs d'Apprendre.
   Logique pure : aucun DOM, aucune 3D, un hasard injectable — tout est
   testé dans `chess.test.ts` (dont le compte des coups de la position de
   départ, qui ne pardonne aucune erreur de règle).

   Une case est un nombre : colonne + 8 × rangée, a1 = 0, h8 = 63. Les
   blancs sont en bas (rangées 0 et 1). La promotion donne toujours une
   dame : c'est ce qu'on apprend d'abord.

   Les exercices ne sont pas des parties. Six leçons :
     ranger   poser les pièces sur leur case de départ
     bouger   une pièce seule attrape des pommes (elle montre comment elle va)
     prendre  une pièce mange les pièces noires, qui ne bougent pas
     echec    le roi blanc est en échec : n'importe quel coup permis le sauve
     mat      un seul coup, et le roi noir est mat
     special  le roque, la promotion, la prise en passant */

export type Kind = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P'
export type Side = 'w' | 'b'
export interface Piece { k: Kind; s: Side }
export type Board = (Piece | null)[]

export interface Pos {
  board: Board
  turn: Side
  /** Les roques encore permis, comme dans une notation FEN : « KQkq ». */
  castle: string
  /** La case de la prise en passant, ou −1. */
  ep: number
}

export interface Move {
  from: number
  to: number
  /** La case de la pièce prise (pas `to` pour la prise en passant). */
  take?: number
  /** Le roque : K petit (côté roi), Q grand (côté dame). */
  castle?: 'K' | 'Q'
  promo?: Kind
  /** Un pion qui avance de deux cases. */
  double?: boolean
}

export const sq = (f: number, r: number) => f + r * 8
export const fileOf = (s: number) => s & 7
export const rankOf = (s: number) => s >> 3
export const other = (s: Side): Side => (s === 'w' ? 'b' : 'w')
const inside = (f: number, r: number) => f >= 0 && f < 8 && r >= 0 && r < 8

/** « e4 » → 28. */
export const at = (name: string) => sq(name.charCodeAt(0) - 97, Number(name[1]) - 1)
export const nameOf = (s: number) => String.fromCharCode(97 + fileOf(s)) + (rankOf(s) + 1)

const N_D = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
const K_D = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]
const R_D = [[1, 0], [0, 1], [-1, 0], [0, -1]]
const B_D = [[1, 1], [-1, 1], [-1, -1], [1, -1]]

export function emptyPos(turn: Side = 'w'): Pos {
  return { board: new Array<Piece | null>(64).fill(null), turn, castle: '', ep: -1 }
}

/** Lit une position FEN (les pièces, le trait, les roques, la prise en passant). */
export function fromFen(fen: string): Pos {
  const [rows, turn = 'w', castle = '-', ep = '-'] = fen.trim().split(/\s+/)
  const pos = emptyPos(turn === 'b' ? 'b' : 'w')
  rows.split('/').forEach((row, i) => {
    let f = 0
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') { f += Number(ch); continue }
      const up = ch.toUpperCase()
      pos.board[sq(f++, 7 - i)] = { k: up as Kind, s: ch === up ? 'w' : 'b' }
    }
  })
  pos.castle = castle === '-' ? '' : castle
  pos.ep = ep === '-' ? -1 : at(ep)
  return pos
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -'
export const startPos = () => fromFen(START_FEN)

export const clone = (p: Pos): Pos => ({ board: p.board.slice(), turn: p.turn, castle: p.castle, ep: p.ep })

export function kingSq(board: Board, side: Side): number {
  return board.findIndex(p => p?.k === 'K' && p.s === side)
}

/** Les cases d'où une pièce du camp `by` attaque la case `s`. */
export function attackers(board: Board, s: number, by: Side): number[] {
  const out: number[] = []
  const f = fileOf(s), r = rankOf(s)
  const is = (ff: number, rr: number, k: Kind) => {
    if (!inside(ff, rr)) return false
    const p = board[sq(ff, rr)]
    return !!p && p.s === by && p.k === k
  }
  for (const [df, dr] of N_D) if (is(f + df, r + dr, 'N')) out.push(sq(f + df, r + dr))
  for (const [df, dr] of K_D) if (is(f + df, r + dr, 'K')) out.push(sq(f + df, r + dr))
  // Un pion attaque en biais, vers l'avant : il est donc une rangée derrière
  const pr = r - (by === 'w' ? 1 : -1)
  for (const df of [-1, 1]) if (is(f + df, pr, 'P')) out.push(sq(f + df, pr))
  const slide = (dirs: number[][], k: Kind) => {
    for (const [df, dr] of dirs) {
      let ff = f + df, rr = r + dr
      while (inside(ff, rr)) {
        const p = board[sq(ff, rr)]
        if (p) {
          if (p.s === by && (p.k === k || p.k === 'Q')) out.push(sq(ff, rr))
          break
        }
        ff += df; rr += dr
      }
    }
  }
  slide(R_D, 'R')
  slide(B_D, 'B')
  return out
}

export const attacked = (board: Board, s: number, by: Side) => attackers(board, s, by).length > 0

/** Les pièces qui font échec au roi de ce camp (aucune s'il n'a pas de roi). */
export function checkers(pos: Pos, side: Side): number[] {
  const k = kingSq(pos.board, side)
  return k < 0 ? [] : attackers(pos.board, k, other(side))
}
export const inCheck = (pos: Pos, side: Side) => checkers(pos, side).length > 0

/** Comment la pièce de cette case se déplace, sans regarder si son roi
    reste en échec (c'est ce que montrent les pastilles : le MOUVEMENT). */
export function pseudo(pos: Pos, from: number): Move[] {
  const p = pos.board[from]
  if (!p) return []
  const out: Move[] = []
  const f = fileOf(from), r = rankOf(from)
  const B = pos.board
  const step = (dirs: number[][], far: boolean) => {
    for (const [df, dr] of dirs) {
      let ff = f + df, rr = r + dr
      while (inside(ff, rr)) {
        const to = sq(ff, rr), q = B[to]
        if (!q) out.push({ from, to })
        else {
          if (q.s !== p.s) out.push({ from, to, take: to })
          break
        }
        if (!far) break
        ff += df; rr += dr
      }
    }
  }
  if (p.k === 'N') step(N_D, false)
  else if (p.k === 'B') step(B_D, true)
  else if (p.k === 'R') step(R_D, true)
  else if (p.k === 'Q') step(K_D, true)
  else if (p.k === 'K') {
    step(K_D, false)
    // Le roque : le roi et la tour chez eux, rien entre eux, et le roi ne
    // part pas d'un échec, ne traverse pas une case attaquée, n'y arrive pas
    const home = p.s === 'w' ? 0 : 7, foe = other(p.s)
    if (from === sq(4, home) && !attacked(B, from, foe)) {
      const can = (flag: string, rookF: number, empty: number[], safe: number[]) => {
        const rook = B[sq(rookF, home)]
        return pos.castle.includes(p.s === 'w' ? flag : flag.toLowerCase())
          && rook?.k === 'R' && rook.s === p.s
          && empty.every(x => !B[sq(x, home)]) && safe.every(x => !attacked(B, sq(x, home), foe))
      }
      if (can('K', 7, [5, 6], [5, 6])) out.push({ from, to: sq(6, home), castle: 'K' })
      if (can('Q', 0, [1, 2, 3], [2, 3])) out.push({ from, to: sq(2, home), castle: 'Q' })
    }
  } else {
    const dir = p.s === 'w' ? 1 : -1, home = p.s === 'w' ? 1 : 6, last = p.s === 'w' ? 7 : 0
    const push = (m: Move) => out.push(rankOf(m.to) === last ? { ...m, promo: 'Q' } : m)
    if (inside(f, r + dir) && !B[sq(f, r + dir)]) {
      push({ from, to: sq(f, r + dir) })
      if (r === home && !B[sq(f, r + 2 * dir)]) out.push({ from, to: sq(f, r + 2 * dir), double: true })
    }
    for (const df of [-1, 1]) {
      if (!inside(f + df, r + dir)) continue
      const to = sq(f + df, r + dir), q = B[to]
      if (q && q.s !== p.s) push({ from, to, take: to })
      else if (!q && to === pos.ep) out.push({ from, to, take: sq(f + df, r) })
    }
  }
  return out
}

/** Joue un coup : une NOUVELLE position, le trait à l'autre camp. */
export function play(pos: Pos, m: Move): Pos {
  const next = clone(pos)
  const B = next.board
  const p = B[m.from]!
  if (m.take !== undefined) B[m.take] = null
  B[m.from] = null
  B[m.to] = m.promo ? { k: m.promo, s: p.s } : p
  const home = p.s === 'w' ? 0 : 7
  if (m.castle) {
    const [a, b] = m.castle === 'K' ? [7, 5] : [0, 3]
    B[sq(b, home)] = B[sq(a, home)]
    B[sq(a, home)] = null
  }
  // Les droits de roque : perdus dès que le roi ou la tour a bougé (ou que la tour est prise)
  let c = next.castle
  const lose = (flags: string) => { for (const ch of flags) c = c.replace(ch, '') }
  if (p.k === 'K') lose(p.s === 'w' ? 'KQ' : 'kq')
  for (const s of [m.from, m.to]) {
    if (s === 0) lose('Q')
    if (s === 7) lose('K')
    if (s === 56) lose('q')
    if (s === 63) lose('k')
  }
  next.castle = c
  next.ep = m.double ? (m.from + m.to) / 2 : -1
  next.turn = other(p.s)
  return next
}

/** Un coup est permis s'il ne laisse pas son propre roi en échec. */
export function isLegal(pos: Pos, m: Move): boolean {
  const p = pos.board[m.from]
  return !!p && !inCheck(play(pos, m), p.s)
}

export const legal = (pos: Pos, from: number): Move[] => pseudo(pos, from).filter(m => isLegal(pos, m))

/** Tous les coups permis du camp qui a le trait. */
export function allLegal(pos: Pos): Move[] {
  const out: Move[] = []
  for (let s = 0; s < 64; s++) if (pos.board[s]?.s === pos.turn) out.push(...legal(pos, s))
  return out
}

export const isMate = (pos: Pos) => inCheck(pos, pos.turn) && allLegal(pos).length === 0
export const isStale = (pos: Pos) => !inCheck(pos, pos.turn) && allLegal(pos).length === 0

/** Le nombre de parties possibles en `depth` coups (pour les tests). */
export function perft(pos: Pos, depth: number): number {
  if (depth === 0) return 1
  let n = 0
  for (const m of allLegal(pos)) n += perft(play(pos, m), depth - 1)
  return n
}

/** La réponse des noirs à un coup qui ne fait pas mat : le roi s'échappe
    s'il le peut (c'est ce qu'on veut montrer), sinon une prise, sinon un
    coup quelconque. `null` : aucun coup (pat). */
export function reply(pos: Pos, rng: Rng = Math.random): Move | null {
  const all = allLegal(pos)
  if (!all.length) return null
  const pick = (xs: Move[]) => xs[Math.floor(rng() * xs.length)]
  const king = all.filter(m => pos.board[m.from]!.k === 'K')
  if (inCheck(pos, pos.turn) && king.length) return pick(king)
  const takes = all.filter(m => m.take !== undefined)
  if (takes.length) return pick(takes)
  return pick(king.length ? king : all)
}

/* ---------- Les exercices ---------- */

export type Lesson = 'ranger' | 'bouger' | 'prendre' | 'echec' | 'mat' | 'special'
export const LESSONS: Lesson[] = ['ranger', 'bouger', 'prendre', 'echec', 'mat', 'special']

/** Un exercice : sa leçon et sa variante (une pièce, une famille de mats…). */
export interface Exo extends Keyed {
  lesson: Lesson
  id: string
}
const exo = (lesson: Lesson, id: string): Exo => ({ key: `${lesson}:${id}`, lesson, id })

/** L'ordre où l'on apprend les pièces : les lignes droites d'abord, le
    cavalier et le pion (les deux bizarres) à la fin. */
export const ORDER: Kind[] = ['R', 'B', 'Q', 'K', 'N', 'P']

/** Le nom des pièces, que la voix dit (du contenu, pas une consigne). */
export const NAME: Record<Kind, string> = {
  K: 'le roi', Q: 'la dame', R: 'la tour', B: 'le fou', N: 'le cavalier', P: 'le pion'
}

const perKind = (lesson: Lesson, ks: Kind[] = ORDER) => ks.map(k => exo(lesson, k))

/** Ce qu'on tire pour une partie de ce niveau : de chaque tas, tant
    d'exercices (la mémoire d'Apprendre choisit lesquels). Huit en tout. */
export function plan(tier: Tier): { pool: Exo[]; n: number }[] {
  if (tier === 'easy') return [
    { pool: ['coins', 'couple', 'rangee'].map(i => exo('ranger', i)), n: 1 },
    { pool: perKind('bouger'), n: 4 },
    { pool: perKind('prendre'), n: 3 }
  ]
  if (tier === 'med') return [
    { pool: ['couple', 'rangee'].map(i => exo('ranger', i)), n: 1 },
    { pool: perKind('bouger', ['N', 'P']), n: 1 },
    { pool: perKind('prendre'), n: 2 },
    { pool: perKind('echec', ['R', 'B', 'Q', 'N']), n: 4 }
  ]
  return [
    { pool: ['rangee', 'noirs'].map(i => exo('ranger', i)), n: 1 },
    { pool: perKind('echec', ['R', 'B', 'Q', 'N']), n: 2 },
    { pool: ['dame', 'tours', 'tourroi', 'couloir'].map(i => exo('mat', i)), n: 3 },
    { pool: ['roque', 'promo', 'passant'].map(i => exo('special', i)), n: 2 }
  ]
}

/** L'ordre d'une partie : leçon par leçon, les pièces dans l'ordre où on
    les apprend. */
export function lessonRank(e: Exo): number {
  const k = ORDER.indexOf(e.id as Kind)
  return LESSONS.indexOf(e.lesson) * 10 + (k < 0 ? 0 : k)
}

/** Ce qu'il faut faire pour finir l'exercice :
    - `place`  : poser toutes les pièces du plateau de côté ;
    - `apples` : passer sur toutes les pommes, en se déplaçant librement ;
    - `takes`  : manger toutes les pièces noires ;
    - `legal`  : jouer un coup permis (sortir de l'échec) ;
    - `moves`  : jouer l'un des coups de `want`. */
export type Goal = 'place' | 'apples' | 'takes' | 'legal' | 'moves'

export interface Round {
  exo: Exo
  goal: Goal
  pos: Pos
  /** `place` : les pièces à poser. */
  tray: Piece[]
  /** Les pommes (pour `moves`, la case d'arrivée du coup à trouver). */
  apples: number[]
  /** `takes` : les pièces à manger, dans un ordre qui marche. */
  targets: number[]
  want: Move[]
  /** Le nombre de coups qui suffit. */
  par: number
  /** Les silhouettes des pièces à poser (la fleur). */
  ghosts: boolean
  /** Les pastilles du mouvement (toujours, sauf à la flamme : après un raté). */
  dots: boolean
  /** Un coup des noirs joué avant de commencer (la prise en passant). */
  intro: Move | null
  /** Ce que la voix dit en ouvrant l'exercice (un nom de pièce, « Échec ! »). */
  say: string
  /** Ce qu'elle dit quand il est réussi. */
  done: string
}

const int = (rng: Rng, n: number) => Math.floor(rng() * n)
const pick = <X>(rng: Rng, xs: X[]) => xs[int(rng, xs.length)]

function blank(e: Exo, goal: Goal, tier: Tier, pos: Pos): Round {
  return {
    exo: e, goal, pos, tray: [], apples: [], targets: [], want: [], par: 1,
    ghosts: tier === 'easy', dots: tier !== 'exp', intro: null, say: '', done: ''
  }
}

/** La pièce de départ de cette case (pour ranger). */
export const homePiece = (s: number): Piece | null => START.board[s]
const START = startPos()

/** Une pièce posée sur cette case est-elle à sa place de départ ? */
export const isHome = (p: Piece, s: number) => {
  const h = homePiece(s)
  return !!h && h.k === p.k && h.s === p.s
}

function ranger(e: Exo, tier: Tier, rng: Rng): Round {
  const pos = startPos()
  pos.castle = ''
  const kinds: Kind[] = e.id === 'coins' ? ['R', 'N', 'B'] : e.id === 'couple' ? ['K', 'Q'] : ['R', 'N', 'B', 'Q', 'K']
  const side: Side = e.id === 'noirs' ? 'b' : 'w'
  const rd = blank(e, 'place', tier, pos)
  const home = side === 'w' ? 0 : 7
  for (let f = 0; f < 8; f++) {
    const p = pos.board[sq(f, home)]!
    if (kinds.includes(p.k)) { rd.tray.push(p); pos.board[sq(f, home)] = null }
  }
  // Mélangées : l'ordre du plateau de côté ne dit pas l'ordre des cases
  for (let i = rd.tray.length - 1; i > 0; i--) {
    const j = int(rng, i + 1)
    ;[rd.tray[i], rd.tray[j]] = [rd.tray[j], rd.tray[i]]
  }
  rd.par = rd.tray.length
  return rd
}

/** Une promenade de la pièce sur un plateau vide : `n` cases de suite,
    chacune à un coup de la précédente, toutes différentes. */
function walk(k: Kind, from: number, n: number, rng: Rng): number[] | null {
  const out: number[] = []
  let cur = from
  for (let i = 0; i < n; i++) {
    const pos = emptyPos()
    pos.board[cur] = { k, s: 'w' }
    let opts = pseudo(pos, cur).map(m => m.to).filter(t => t !== from && !out.includes(t))
    // Une pièce qui glisse va loin : c'est ce qu'il faut voir
    if (k === 'R' || k === 'B' || k === 'Q') {
      const farther = opts.filter(t => Math.max(Math.abs(fileOf(t) - fileOf(cur)), Math.abs(rankOf(t) - rankOf(cur))) >= 2)
      if (farther.length) opts = farther
    }
    if (!opts.length) return null
    cur = pick(rng, opts)
    out.push(cur)
  }
  return out
}

function bouger(e: Exo, tier: Tier, rng: Rng): Round {
  const k = e.id as Kind
  for (;;) {
    const pos = emptyPos()
    const rd = blank(e, 'apples', tier, pos)
    rd.say = NAME[k]
    if (k === 'P') {
      // Le pion : tout droit, deux cases d'un coup au départ, jamais en arrière
      const f = int(rng, 8)
      pos.board[sq(f, 1)] = { k, s: 'w' }
      rd.apples = [sq(f, 3), sq(f, 4), sq(f, 6)]
      rd.par = 4
      return rd
    }
    const from = int(rng, 64)
    const path = walk(k, from, k === 'K' ? 3 : 4, rng)
    if (!path) continue
    pos.board[from] = { k, s: 'w' }
    rd.apples = path
    rd.par = path.length
    return rd
  }
}

const PREY: Kind[] = ['P', 'P', 'N', 'B', 'R']

/** Les pièces à manger se prennent-elles bien dans cet ordre, un coup chacune ? */
export function chain(pos: Pos, from: number, targets: number[]): boolean {
  let p = clone(pos), cur = from
  for (const t of targets) {
    const m = pseudo(p, cur).find(x => x.to === t && x.take !== undefined)
    if (!m) return false
    p = play(p, m)
    p.turn = 'w'
    cur = t
  }
  return true
}

function prendre(e: Exo, tier: Tier, rng: Rng): Round {
  const k = e.id as Kind
  for (;;) {
    const pos = emptyPos()
    const rd = blank(e, 'takes', tier, pos)
    rd.say = NAME[k]
    let from: number
    let path: number[] | null
    if (k === 'P') {
      // Le pion mange en biais : trois pièces en zigzag devant lui
      let f = 2 + int(rng, 4)
      from = sq(f, 1)
      path = []
      for (let r = 2; r <= 4; r++) {
        f += f <= 0 ? 1 : f >= 7 ? -1 : rng() < 0.5 ? -1 : 1
        path.push(sq(f, r))
      }
    } else {
      from = int(rng, 64)
      path = walk(k, from, k === 'K' ? 3 : 4, rng)
    }
    if (!path) continue
    pos.board[from] = { k, s: 'w' }
    for (const t of path) {
      // Pas de pion noir sur la première ni la dernière rangée
      const edge = rankOf(t) === 0 || rankOf(t) === 7
      pos.board[t] = { k: pick(rng, edge ? PREY.filter(x => x !== 'P') : PREY), s: 'b' }
    }
    // Une pièce à manger plus tard peut barrer la route d'une plus tôt
    if (!chain(pos, from, path)) continue
    rd.targets = path
    rd.par = path.length
    return rd
  }
}

/** Le pion ne recule pas : une pièce à manger qu'il a dépassée est perdue,
    il faut recommencer l'exercice. */
export function pawnStuck(pawn: number, targets: number[]): boolean {
  return targets.some(t => {
    const dr = rankOf(t) - rankOf(pawn)
    return dr <= 0 || Math.abs(fileOf(t) - fileOf(pawn)) > dr
  })
}

const far = (a: number, b: number) => Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)))

/** Une case libre au hasard. */
function free(pos: Pos, rng: Rng, ok: (s: number) => boolean = () => true): number {
  for (let i = 0; i < 400; i++) {
    const s = int(rng, 64)
    if (!pos.board[s] && ok(s)) return s
  }
  return -1
}

const ECHEC_FALLBACK: Record<string, string> = {
  R: '4k3/8/8/8/8/2N5/8/r3K3 w - -',
  B: '4k3/8/8/8/1b6/8/5R2/4K3 w - -',
  Q: '4k3/8/8/4q3/8/8/3B4/4K3 w - -',
  N: '4k3/8/8/8/8/3n4/8/4K2R w - -'
}

function echec(e: Exo, tier: Tier, rng: Rng): Round {
  const k = e.id as Kind
  const make = (pos: Pos) => {
    const rd = blank(e, 'legal', tier, pos)
    rd.say = 'Échec !'
    return rd
  }
  for (let i = 0; i < 600; i++) {
    const pos = emptyPos()
    const wk = sq(1 + int(rng, 6), int(rng, 5))
    pos.board[wk] = { k: 'K', s: 'w' }
    const bk = free(pos, rng, s => far(s, wk) >= 3 && rankOf(s) >= 5)
    if (bk < 0) continue
    pos.board[bk] = { k: 'K', s: 'b' }
    // La pièce qui fait échec : pas collée au roi (une ligne d'attaque se voit de loin)
    const c = free(pos, rng, s => far(s, wk) >= 2)
    if (c < 0) continue
    pos.board[c] = { k, s: 'b' }
    // Une pièce blanche pour aider (la prendre, ou se mettre devant), parfois deux
    for (let h = 0; h < 1 + int(rng, 2); h++) {
      const s = free(pos, rng, x => rankOf(x) <= 5)
      if (s >= 0) pos.board[s] = { k: pick(rng, ['R', 'B', 'N', 'Q'] as Kind[]), s: 'w' }
    }
    const pawn = free(pos, rng, s => rankOf(s) >= 4 && rankOf(s) <= 6)
    if (pawn >= 0) pos.board[pawn] = { k: 'P', s: 'b' }
    const ch = checkers(pos, 'w')
    if (ch.length !== 1 || ch[0] !== c) continue
    // Une vraie position : le roi noir n'est pas en échec quand c'est aux blancs
    if (inCheck(pos, 'b')) continue
    // Au moins deux coups pour s'en sortir, mais pas tous : il y a à chercher
    const n = allLegal(pos).length
    if (n < 2) continue
    return make(pos)
  }
  return make(fromFen(ECHEC_FALLBACK[k] ?? ECHEC_FALLBACK.R))
}

/** Les coups des blancs qui font mat tout de suite. */
export function matesIn1(pos: Pos): Move[] {
  return allLegal(pos).filter(m => isMate(play(pos, m)))
}

const MAT_FALLBACK: Record<string, string> = {
  dame: '7k/8/5K2/6Q1/8/8/8/8 w - -',
  tours: '7k/R7/8/8/8/8/1R6/K7 w - -',
  tourroi: '7k/8/6K1/8/8/8/8/R7 w - -',
  couloir: '6k1/5ppp/8/8/8/8/8/R5K1 w - -'
}

function mat(e: Exo, tier: Tier, rng: Rng): Round {
  const make = (pos: Pos) => {
    const rd = blank(e, 'moves', tier, pos)
    rd.want = matesIn1(pos)
    rd.done = 'Échec et mat !'
    return rd
  }
  const edge = () => pick(rng, [sq(int(rng, 8), 7), sq(int(rng, 8), 7), sq(7, 2 + int(rng, 6)), sq(0, 2 + int(rng, 6))])
  for (let i = 0; i < 4000; i++) {
    const pos = emptyPos()
    if (e.id === 'couloir') {
      // Le mat du couloir : le roi noir enfermé derrière ses propres pions
      const f = 1 + int(rng, 6)
      pos.board[sq(f, 7)] = { k: 'K', s: 'b' }
      for (const d of [-1, 0, 1]) pos.board[sq(f + d, 6)] = { k: 'P', s: 'b' }
      const wk = free(pos, rng, s => rankOf(s) <= 1)
      pos.board[wk] = { k: 'K', s: 'w' }
      const s = free(pos, rng, x => rankOf(x) <= 4 && Math.abs(fileOf(x) - f) > 1)
      if (s < 0) continue
      pos.board[s] = { k: rng() < 0.7 ? 'R' : 'Q', s: 'w' }
    } else {
      const bk = edge()
      pos.board[bk] = { k: 'K', s: 'b' }
      const wk = free(pos, rng, s => far(s, bk) >= 2 && far(s, bk) <= (e.id === 'tours' ? 7 : 3))
      if (wk < 0) continue
      pos.board[wk] = { k: 'K', s: 'w' }
      const men: Kind[] = e.id === 'dame' ? ['Q'] : e.id === 'tours' ? ['R', 'R'] : ['R']
      for (const k of men) {
        const s = free(pos, rng, x => far(x, bk) >= 2)
        if (s >= 0) pos.board[s] = { k, s: 'w' }
      }
    }
    if (inCheck(pos, 'b') || inCheck(pos, 'w')) continue
    // Les noirs peuvent encore bouger (sinon c'est déjà pat), et il y a un
    // mat — un ou deux, pas davantage : on le cherche
    pos.turn = 'b'
    const alive = allLegal(pos).length > 0
    pos.turn = 'w'
    if (!alive) continue
    const n = matesIn1(pos).length
    if (n < 1 || n > 2) continue
    return make(pos)
  }
  return make(fromFen(MAT_FALLBACK[e.id] ?? MAT_FALLBACK.dame))
}

function special(e: Exo, tier: Tier, rng: Rng): Round {
  if (e.id === 'roque') {
    const pos = fromFen('4k3/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQ -')
    const rd = blank(e, 'moves', tier, pos)
    const side: 'K' | 'Q' = rng() < 0.6 ? 'K' : 'Q'
    rd.want = pseudo(pos, at('e1')).filter(m => m.castle === side)
    rd.apples = rd.want.map(m => m.to)
    rd.say = NAME.K
    rd.done = side === 'K' ? 'Le petit roque' : 'Le grand roque'
    return rd
  }
  if (e.id === 'promo') {
    // Le pion arrive au bout : il devient une dame
    const pos = emptyPos()
    const f = int(rng, 8)
    pos.board[sq(f, 5)] = { k: 'P', s: 'w' }
    const rd = blank(e, 'apples', tier, pos)
    rd.apples = [sq(f, 6), sq(f, 7)]
    rd.par = 2
    rd.say = NAME.P
    rd.done = 'La promotion : une dame !'
    return rd
  }
  // La prise en passant : le pion noir vient de sauter deux cases à côté du nôtre
  const f = 1 + int(rng, 6), d = rng() < 0.5 ? -1 : 1
  const pos = emptyPos('b')
  pos.board[sq(f, 4)] = { k: 'P', s: 'w' }
  pos.board[sq(f + d, 6)] = { k: 'P', s: 'b' }
  const rd = blank(e, 'moves', tier, pos)
  rd.intro = { from: sq(f + d, 6), to: sq(f + d, 4), double: true }
  const after = play(pos, rd.intro)
  rd.want = pseudo(after, sq(f, 4)).filter(m => m.to === after.ep)
  rd.apples = rd.want.map(m => m.to)
  rd.say = NAME.P
  rd.done = 'La prise en passant'
  return rd
}

/** Construit un exercice. */
export function build(e: Exo, tier: Tier, rng: Rng = Math.random): Round {
  switch (e.lesson) {
    case 'ranger': return ranger(e, tier, rng)
    case 'bouger': return bouger(e, tier, rng)
    case 'prendre': return prendre(e, tier, rng)
    case 'echec': return echec(e, tier, rng)
    case 'mat': return mat(e, tier, rng)
    default: return special(e, tier, rng)
  }
}

/** Apprendre : aucune sanction, les étoiles comptent seulement les ratés. */
export function starsFor(misses: number): 1 | 2 | 3 {
  return misses <= 2 ? 3 : misses <= 6 ? 2 : 1
}
