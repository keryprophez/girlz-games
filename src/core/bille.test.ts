import { describe, expect, it } from 'vitest'
import { Bille, BALL_R, HOLE_R, autoPilot, makeBoard, type Board } from './bille'
import { generate, solve, distances, seeded } from './labyrinth'

/* Le Labyrinthe à bille : le plateau et la bille, joués hors navigateur. */

const CADENCES: [string, (r: () => number) => number][] = [
  ['60 i/s', () => 1 / 60],
  ['20 i/s', () => 1 / 20],
  ['saccadé', r => (r() < 0.15 ? 0.1 : 1 / 30 + r() * 0.03)]
]

describe('labyrinthe', () => {
  it('relie toutes les cases, murs accordés entre voisines', () => {
    for (let s = 1; s <= 20; s++) {
      const w = 4 + s % 7, h = 3 + s % 5
      const g = generate(w, h, seeded(s))
      const dist = distances(g, [0, 0])
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        expect(Number.isFinite(dist[y][x])).toBe(true)
        if (x < w - 1) expect(g[y][x].walls[1]).toBe(g[y][x + 1].walls[3])
        if (y < h - 1) expect(g[y][x].walls[2]).toBe(g[y + 1][x].walls[0])
      }
    }
  })
  it('trouve le chemin, case après case', () => {
    const g = generate(9, 6, seeded(3))
    const p = solve(g, [0, 0], [8, 5])
    expect(p[0]).toEqual([0, 0])
    expect(p[p.length - 1]).toEqual([8, 5])
    for (let i = 1; i < p.length; i++) expect(Math.abs(p[i][0] - p[i - 1][0]) + Math.abs(p[i][1] - p[i - 1][1])).toBe(1)
  })
})

describe('plateau', () => {
  it('ne met jamais un trou sur le chemin, ni à côté du départ', () => {
    for (let s = 1; s <= 60; s++) {
      const b = makeBoard({ w: 5 + s % 5, h: 4 + s % 4, holes: 0.2 + (s % 5) * 0.1, flagEvery: 4, rnd: seeded(s) })
      const onPath = new Set(b.path.map(p => p.join(',')))
      const holes = b.holes.filter(h => !h.goal)
      expect(holes.length).toBeGreaterThan(0)
      for (const h of holes) {
        expect(onPath.has([Math.floor(h.x), Math.floor(h.y)].join(','))).toBe(false)
        expect(Math.floor(h.x) + Math.floor(h.y)).toBeGreaterThan(1)
      }
      const goal = b.holes.find(h => h.goal)!
      expect([goal.x, goal.y]).toEqual([b.w - 0.5, b.h - 0.5])
      for (const f of b.flags) { expect(f).toBeGreaterThan(0); expect(f).toBeLessThan(b.path.length - 1) }
    }
  })
  it('met plus de trous quand on le demande', () => {
    const few = makeBoard({ w: 8, h: 6, holes: 0.2, flagEvery: 5, rnd: seeded(9) })
    const many = makeBoard({ w: 8, h: 6, holes: 0.6, flagEvery: 5, rnd: seeded(9) })
    expect(many.holes.length).toBeGreaterThan(few.holes.length)
  })
})

/** Une partie au pilote sur un plateau : combien de chutes avant l'arrivée. */
function run(b: Board, seed: number, cad: (r: () => number) => number, maxT = 240) {
  const r = seeded(seed)
  const ball = new Bille(b)
  ball.pilot = autoPilot()
  let falls = 0, t = 0, escapes = 0, worst = Infinity, out = false
  const res = (won: boolean) => ({ won, falls, t, escapes, worst, out })
  while (t < maxT) {
    const dt = cad(r)
    t += dt
    for (const e of ball.update(dt)) {
      if (e.t === 'fall') { falls++; ball.respawn() }
      if (e.t === 'escape') escapes++
      if (e.t === 'goal') return res(true)
    }
    // Jamais dans un muret, jamais hors du plateau
    for (const w of b.rects) {
      const qx = Math.max(w.x0, Math.min(w.x1, ball.x)), qy = Math.max(w.y0, Math.min(w.y1, ball.y))
      worst = Math.min(worst, Math.hypot(ball.x - qx, ball.y - qy))
    }
    if (ball.x <= 0 || ball.x >= b.w || ball.y <= 0 || ball.y >= b.h) out = true
  }
  return res(false)
}

describe('la bille', () => {
  it('roule vers où l\'on penche, s\'arrête à plat', () => {
    const b = makeBoard({ w: 6, h: 5, holes: 0.3, flagEvery: 4, rnd: seeded(1) })
    const ball = new Bille(b)
    const open = !b.grid[0][0].walls[1] ? [1, 0] : [0, 1]
    ball.tx = open[0]; ball.ty = open[1]
    ball.update(0.3)
    expect(ball.x * open[0] + ball.y * open[1]).toBeGreaterThan(0.6)
    ball.tx = ball.ty = 0
    for (let i = 0; i < 300; i++) ball.update(1 / 60)
    expect(Math.hypot(ball.vx, ball.vy)).toBe(0)
  })
  it('tombe dans un trou qu\'on lui fait traverser lentement', () => {
    const b = makeBoard({ w: 5, h: 4, holes: 0.3, flagEvery: 4, rnd: seeded(2) })
    const h = b.holes.find(x => !x.goal)!
    const ball = new Bille(b)
    ball.x = h.x + HOLE_R + 0.01; ball.y = h.y
    const ev = ball.update(1)
    expect(ev.some(e => e.t === 'fall')).toBe(true)
    expect(ball.state).toBe('fall')
  })
  it('passe au ras d\'un trou quand elle est lancée : le « presque »', () => {
    const b = makeBoard({ w: 5, h: 4, holes: 0.3, flagEvery: 4, rnd: seeded(2) })
    b.rects.length = 0 // un plan sans murets, pour viser le rebord
    const h = b.holes.find(x => !x.goal)!
    b.holes = [h]
    const ball = new Bille(b)
    ball.x = h.x - 1.2; ball.y = h.y - HOLE_R
    ball.vx = 4.5
    const ev = [...ball.update(0.2), ...ball.update(0.2), ...ball.update(0.2)]
    expect(ev.some(e => e.t === 'rim')).toBe(true)
    expect(ev.some(e => e.t === 'escape')).toBe(true)
    expect(ball.state).toBe('roll')
  })
  it('revient au dernier drapeau atteint', () => {
    const b = makeBoard({ w: 7, h: 5, holes: 0.3, flagEvery: 3, rnd: seeded(4) })
    const ball = new Bille(b)
    const [fx, fy] = b.path[b.flags[0]]
    ball.x = fx + 0.5; ball.y = fy + 0.5
    const ev = ball.update(1 / 60)
    expect(ev).toContainEqual({ t: 'flag', i: b.flags[0] })
    ball.x = 3; ball.y = 3
    ball.respawn()
    expect([ball.x, ball.y]).toEqual([fx + 0.5, fy + 0.5])
  })
  it('le pilote finit les plateaux, à toutes les cadences, sans traverser les murets', () => {
    let falls = 0, n = 0
    for (const [name, cad] of CADENCES) {
      for (let s = 1; s <= 8; s++) {
        const b = makeBoard({ w: 5 + s % 4, h: 4 + s % 3, holes: 0.25 + (s % 4) * 0.1, flagEvery: 4, rnd: seeded(s * 13) })
        const r = run(b, s, cad)
        expect(r.won, `${name}, plateau ${s}`).toBe(true)
        expect(r.worst).toBeGreaterThan(BALL_R * 0.6)
        expect(r.out).toBe(false)
        falls += r.falls; n++
      }
    }
    // Un bot qui tombe trop ne finirait pas sa partie à trois billes
    expect(falls / n).toBeLessThan(0.5)
  }, 30000)
})
