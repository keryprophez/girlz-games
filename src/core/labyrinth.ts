/* Le générateur de labyrinthes — sorti de `games/maze.ts` le 27/10 pour
   servir aussi au Labyrinthe à bille (`core/bille.ts`). Pur, sans DOM ni
   three.js : testé par vitest.

   Un labyrinthe « parfait » (un seul chemin entre deux cases), creusé par
   un parcours en profondeur au hasard. Une case garde ses quatre murs dans
   l'ordre haut, droite, bas, gauche ; deux cases voisines s'accordent
   toujours (le mur de droite de l'une est le mur de gauche de l'autre). */

export interface Cell { walls: boolean[] } // haut, droite, bas, gauche

/** Les quatre directions, dans l'ordre des murs : [dx, dy]. */
export const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]]

/** Un labyrinthe de `w` × `h` cases (carré si `h` manque) ; `rnd` pour rejouer
    le même (tests). `g[y][x]`. */
export function generate(w: number, h = w, rnd: () => number = Math.random): Cell[][] {
  const g: Cell[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => ({ walls: [true, true, true, true] })))
  const seen = Array.from({ length: h }, () => Array(w).fill(false))
  const stack: [number, number][] = [[0, 0]]
  seen[0][0] = true
  while (stack.length) {
    const [x, y] = stack[stack.length - 1]
    const opts: number[] = []
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1]
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[ny][nx]) opts.push(d)
    }
    if (!opts.length) { stack.pop(); continue }
    const d = opts[Math.floor(rnd() * opts.length)]
    const nx = x + DIRS[d][0], ny = y + DIRS[d][1]
    g[y][x].walls[d] = false
    g[ny][nx].walls[(d + 2) % 4] = false
    seen[ny][nx] = true
    stack.push([nx, ny])
  }
  return g
}

/** La distance (en cases) de chaque case jusqu'à `to`, par les couloirs ouverts. */
export function distances(g: Cell[][], to: [number, number]): number[][] {
  const h = g.length, w = g[0].length
  const dist = Array.from({ length: h }, () => Array(w).fill(Infinity) as number[])
  dist[to[1]][to[0]] = 0
  const q: [number, number][] = [to]
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i]
    for (let d = 0; d < 4; d++) {
      if (g[y][x].walls[d]) continue
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1]
      if (dist[ny][nx] > dist[y][x] + 1) { dist[ny][nx] = dist[y][x] + 1; q.push([nx, ny]) }
    }
  }
  return dist
}

/** Le chemin de `from` à `to`, cases comprises. */
export function solve(g: Cell[][], from: [number, number], to: [number, number]): [number, number][] {
  const dist = distances(g, to)
  if (!Number.isFinite(dist[from[1]][from[0]])) return []
  const path: [number, number][] = [from]
  let [x, y] = from
  while (x !== to[0] || y !== to[1]) {
    for (let d = 0; d < 4; d++) {
      if (g[y][x].walls[d]) continue
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1]
      if (dist[ny][nx] === dist[y][x] - 1) { x = nx; y = ny; break }
    }
    path.push([x, y])
  }
  return path
}

/** Un tirage reproductible (tests, plateaux rejoués). */
export function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}
