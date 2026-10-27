/* LE LABYRINTHE À BILLE — le plateau et la physique de la bille, sans
   three.js (27/10). Comme celle du Flipper (`core/pinball.ts`), cette
   physique est à nous, à pas fixe, pure et jouée par vitest : une bille sur
   un plan, c'est plus sûr qu'un moteur générique (pas de bille qui traverse
   un muret, pas de rebond qui dépend de la cadence).

   Le plateau : `w` × `h` cases d'une unité ; x vers la droite, y vers le
   bas de l'écran (vers l'enfant). Les murets sont des rectangles de
   `WALL_T` d'épaisseur posés sur les bords des cases (allongés de la
   demi-épaisseur aux deux bouts : ils se chevauchent aux coins, pas de
   fente où se coincer). La bille fait `BALL_R` de rayon.

   - Le labyrinthe vient du générateur du Labyrinthe (`core/labyrinth.ts`) :
     un seul chemin du départ (en haut à gauche) à l'arrivée (en bas à
     droite). Les TROUS ne sont JAMAIS sur ce chemin : d'abord dans les
     impasses qui s'ouvrent sur lui (c'est là qu'on file tout droit au lieu
     de tourner), puis ailleurs. L'arrivée est un trou doré.
   - Les DRAPEAUX jalonnent le chemin : une bille tombée revient au dernier
     drapeau atteint.
   - L'inclinaison (`tx`, `ty` de −1 à 1) accélère la bille ; un léger
     frottement la freine ; elle rebondit mollement sur les murets.
   - Au bord d'un trou, la pente du rebord l'attire (`rim`) : lente, elle
     tombe ; lancée, elle passe — et c'est le « presque » (`escape`). */

import { generate, distances, solve, DIRS, type Cell } from './labyrinth'

export const BALL_R = 0.27
export const WALL_T = 0.16
export const HOLE_R = 0.37
/** Le pas de la physique : à 6 cases/s, la bille avance de 0,025 par pas (le muret en fait 0,16). */
export const STEP = 1 / 240
/** L'accélération à pleine inclinaison (cases/s²). */
export const ACC = 8.5
/** Le frottement (par seconde) et la vitesse maximale. */
export const DAMP = 0.85
export const VMAX = 6
/** Le rebord d'un trou : la bille tombe quand son centre passe sous `FALL`, l'attraction commence à `RIM`. */
const FALL = HOLE_R - 0.12
const RIM = HOLE_R + 0.04
const GOAL_RIM = HOLE_R + 0.16

export interface Rect { x0: number; y0: number; x1: number; y1: number }
export interface Hole { x: number; y: number; goal?: boolean }

export interface Board {
  w: number
  h: number
  grid: Cell[][]
  /** Le seul chemin du départ à l'arrivée, cases comprises. */
  path: [number, number][]
  holes: Hole[]
  /** Les drapeaux : des indices dans `path` (le départ en est un, implicite). */
  flags: number[]
  rects: Rect[]
  /** La distance de chaque case à l'arrivée (le pilote s'en sert). */
  dist: number[][]
}

export interface BoardOpts {
  w: number
  h: number
  /** La part des cases hors du chemin qui ont un trou (0..1). */
  holes: number
  /** Un drapeau toutes les `flagEvery` cases du chemin. */
  flagEvery: number
  rnd?: () => number
}

/** Un plateau : le labyrinthe, son chemin, ses trous, ses drapeaux, ses murets. */
export function makeBoard(o: BoardOpts): Board {
  const rnd = o.rnd ?? Math.random
  const { w, h } = o
  const grid = generate(w, h, rnd)
  const start: [number, number] = [0, 0], goal: [number, number] = [w - 1, h - 1]
  const path = solve(grid, start, goal)
  const onPath = new Set(path.map(([x, y]) => x + ',' + y))
  // Les cases hors du chemin : d'abord celles qui s'ouvrent SUR le chemin (le piège
  // d'un virage manqué), puis les autres ; jamais la case voisine du départ
  const near: [number, number][] = [], far: [number, number][] = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (onPath.has(x + ',' + y)) continue
    if (Math.abs(x - start[0]) + Math.abs(y - start[1]) <= 1) continue
    let touches = false
    for (let d = 0; d < 4; d++) {
      if (grid[y][x].walls[d]) continue
      if (onPath.has((x + DIRS[d][0]) + ',' + (y + DIRS[d][1]))) touches = true
    }
    ;(touches ? near : far).push([x, y])
  }
  const mix = <T>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
  const want = Math.max(1, Math.round((near.length + far.length) * o.holes))
  const picked = [...mix(near), ...mix(far)].slice(0, want)
  const holes: Hole[] = picked.map(([x, y]) => ({ x: x + 0.5, y: y + 0.5 }))
  holes.push({ x: goal[0] + 0.5, y: goal[1] + 0.5, goal: true })
  const flags: number[] = []
  for (let i = o.flagEvery; i < path.length - 2; i += o.flagEvery) flags.push(i)
  return { w, h, grid, path, holes, flags, rects: wallRects(grid), dist: distances(grid, goal) }
}

/** Les murets en rectangles : le haut et la droite de chaque case, plus le bas de la
    dernière rangée et la gauche de la première colonne. */
export function wallRects(grid: Cell[][]): Rect[] {
  const h = grid.length, w = grid[0].length, t = WALL_T / 2
  const out: Rect[] = []
  const hor = (x: number, y: number) => out.push({ x0: x - t, y0: y - t, x1: x + 1 + t, y1: y + t })
  const ver = (x: number, y: number) => out.push({ x0: x - t, y0: y - t, x1: x + t, y1: y + 1 + t })
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = grid[y][x].walls
    if (c[0]) hor(x, y)
    if (c[1]) ver(x + 1, y)
    if (y === h - 1 && c[2]) hor(x, y + 1)
    if (x === 0 && c[3]) ver(x, y)
  }
  return out
}

export type BilleEvent =
  | { t: 'wall'; f: number }
  | { t: 'rim'; hole: number }
  | { t: 'escape'; hole: number }
  | { t: 'fall'; hole: number }
  | { t: 'goal' }
  | { t: 'flag'; i: number }

/** La bille sur son plateau. `update(dt)` découpe le temps en pas fixes. */
export class Bille {
  x = 0.5
  y = 0.5
  vx = 0
  vy = 0
  /** L'inclinaison voulue, de −1 à 1 sur chaque axe. */
  tx = 0
  ty = 0
  state: 'roll' | 'fall' | 'goal' = 'roll'
  /** L'indice (dans `path`) du dernier drapeau atteint ; 0 = le départ. */
  flag = 0
  /** Le trou dont la bille est sur le rebord, ou −1. */
  rim = -1
  /** Le pilote (tests, bot) : il incline à la place du doigt. */
  pilot: ((b: Bille) => [number, number]) | null = null
  private acc = 0
  private flagSet: Set<string>

  constructor(public board: Board) {
    this.flagSet = new Set(board.flags.map(i => board.path[i].join(',')))
    this.respawn()
  }

  /** La bille revient au dernier drapeau, immobile. */
  respawn() {
    const [x, y] = this.board.path[this.flag]
    this.x = x + 0.5; this.y = y + 0.5
    this.vx = this.vy = 0
    this.state = 'roll'
    this.rim = -1
  }

  update(dt: number): BilleEvent[] {
    const ev: BilleEvent[] = []
    this.acc = Math.min(this.acc + dt, 0.25)
    while (this.acc >= STEP) {
      this.acc -= STEP
      if (this.state !== 'roll') { this.acc = 0; break }
      this.step(ev)
    }
    return ev
  }

  private step(ev: BilleEvent[]) {
    if (this.pilot) { const [a, b] = this.pilot(this); this.tx = a; this.ty = b }
    const tx = Math.max(-1, Math.min(1, this.tx)), ty = Math.max(-1, Math.min(1, this.ty))
    let ax = ACC * tx, ay = ACC * ty
    // Le rebord des trous : une pente vers le centre
    const holes = this.board.holes
    let rim = -1
    for (let i = 0; i < holes.length; i++) {
      const hl = holes[i]
      const dx = hl.x - this.x, dy = hl.y - this.y
      const d = Math.hypot(dx, dy)
      const outer = hl.goal ? GOAL_RIM : RIM
      if (d >= outer) continue
      if (d < FALL) {
        this.state = hl.goal ? 'goal' : 'fall'
        this.vx *= 0.3; this.vy *= 0.3
        ev.push(hl.goal ? { t: 'goal' } : { t: 'fall', hole: i })
        return
      }
      rim = i
      const k = (hl.goal ? 10 : 15) * (outer - d) / (outer - FALL) + 2
      ax += dx / d * k; ay += dy / d * k
    }
    if (rim !== this.rim) {
      if (rim >= 0) ev.push({ t: 'rim', hole: rim })
      else if (this.rim >= 0 && !holes[this.rim].goal) ev.push({ t: 'escape', hole: this.rim })
      this.rim = rim
    }
    this.vx += ax * STEP; this.vy += ay * STEP
    const damp = Math.exp(-DAMP * STEP)
    this.vx *= damp; this.vy *= damp
    // Le plateau presque à plat ne fait pas rouler une bille presque arrêtée
    if (rim < 0 && Math.abs(tx) < 0.03 && Math.abs(ty) < 0.03 && Math.hypot(this.vx, this.vy) < 0.05) { this.vx = this.vy = 0 }
    const sp = Math.hypot(this.vx, this.vy)
    if (sp > VMAX) { this.vx *= VMAX / sp; this.vy *= VMAX / sp }
    this.x += this.vx * STEP; this.y += this.vy * STEP
    this.collide(ev)
    // Les drapeaux du chemin
    const cx = Math.floor(this.x), cy = Math.floor(this.y)
    if (this.flagSet.has(cx + ',' + cy)) {
      const i = this.board.path.findIndex(([px, py]) => px === cx && py === cy)
      if (i > this.flag) { this.flag = i; ev.push({ t: 'flag', i }) }
    }
  }

  private collide(ev: BilleEvent[]) {
    let hard = 0
    for (const r of this.board.rects) {
      if (this.x < r.x0 - BALL_R || this.x > r.x1 + BALL_R || this.y < r.y0 - BALL_R || this.y > r.y1 + BALL_R) continue
      const qx = Math.max(r.x0, Math.min(r.x1, this.x)), qy = Math.max(r.y0, Math.min(r.y1, this.y))
      let dx = this.x - qx, dy = this.y - qy
      let d = Math.hypot(dx, dy)
      if (d >= BALL_R) continue
      if (d < 1e-6) {
        // Le centre DANS le muret (ne devrait pas arriver) : on sort par le côté le plus proche
        const l = this.x - r.x0, rr = r.x1 - this.x, t = this.y - r.y0, b = r.y1 - this.y
        const m = Math.min(l, rr, t, b)
        dx = m === l ? -1 : m === rr ? 1 : 0; dy = m === t ? -1 : m === b ? 1 : 0
        d = 0
      } else { dx /= d; dy /= d }
      this.x += dx * (BALL_R - d); this.y += dy * (BALL_R - d)
      const vn = this.vx * dx + this.vy * dy
      if (vn < 0) {
        // Un rebond mou (bois) et un peu de frottement le long du muret
        this.vx -= 1.38 * vn * dx; this.vy -= 1.38 * vn * dy
        this.vx *= 0.985; this.vy *= 0.985
        hard = Math.max(hard, -vn)
      }
    }
    if (hard > 0.9) ev.push({ t: 'wall', f: hard })
  }
}

/** Le pilote (tests et bot) : il suit les couloirs vers l'arrivée, plus vite dans les
    lignes droites, freine avant les virages et s'écarte du rebord des trous.
    `skill` < 1 le rend plus brusque (il visera moins bien). */
export function autoPilot(o: { skill?: number } = {}): (b: Bille) => [number, number] {
  const skill = o.skill ?? 1
  return b => {
    const { grid, dist, w, h, holes } = b.board
    const cx = Math.max(0, Math.min(w - 1, Math.floor(b.x))), cy = Math.max(0, Math.min(h - 1, Math.floor(b.y)))
    const next = (x: number, y: number): [number, number] | null => {
      for (let d = 0; d < 4; d++) {
        if (grid[y][x].walls[d]) continue
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1]
        if (dist[ny][nx] === dist[y][x] - 1) return [nx, ny]
      }
      return null
    }
    let tx = cx + 0.5, ty = cy + 0.5, speed = 1.1
    const n1 = next(cx, cy)
    // Tant que la bille n'est pas centrée dans son couloir, elle s'y recale d'abord
    const off = n1 ? (n1[0] !== cx ? Math.abs(b.y - (cy + 0.5)) : Math.abs(b.x - (cx + 0.5))) : 0
    if (n1 && off < 0.16) {
      tx = n1[0] + 0.5; ty = n1[1] + 0.5
      // Une ligne droite : on vise plus loin, plus vite
      let run = 1, px = cx, py = cy, qx = n1[0], qy = n1[1]
      while (run < 4) {
        const nn = next(qx, qy)
        if (!nn || nn[0] - qx !== qx - px || nn[1] - qy !== qy - py) break
        px = qx; py = qy; qx = nn[0]; qy = nn[1]; run++
      }
      speed = 0.9 + run * 0.45
      if (run > 1) { tx = qx + 0.5; ty = qy + 0.5 }
    }
    let vx = tx - b.x, vy = ty - b.y
    const l = Math.hypot(vx, vy) || 1
    const want = Math.min(speed, l * 3.2)
    vx = vx / l * want; vy = vy / l * want
    // Loin du rebord des trous (sauf l'arrivée)
    for (const hl of holes) {
      if (hl.goal) continue
      const dx = b.x - hl.x, dy = b.y - hl.y, d = Math.hypot(dx, dy)
      if (d < HOLE_R + 0.45) { vx += dx / d * 1.6; vy += dy / d * 1.6 }
    }
    const gain = 0.9 / skill
    return [Math.max(-1, Math.min(1, (vx - b.vx) * gain)), Math.max(-1, Math.min(1, (vy - b.vy) * gain))]
  }
}
