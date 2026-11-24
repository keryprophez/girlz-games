/* @version 2026-11-25 00:20 */
import { describe, expect, it } from 'vitest'
import { CRANS, braidLine, crossing, local, phaseAt, type BraidState } from './braid3d'

type V = [number, number, number]
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const dist = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
// une queue : elle sort de la nuque, puis retombe
const QUEUE: V[] = [[0, -0.5, -0.8], [0, -0.6, -0.95], [0, -0.85, -1.05], [0, -1.15, -1.1], [0, -1.45, -1.1], [0, -1.75, -1.08], [0, -2.05, -1.05], [0, -2.35, -1]]
// la même, emportée sur le côté par un coup de tête
const FOUET: V[] = QUEUE.map(([x, y, z], i) => [x + Math.sin(i * 0.5) * i * 0.2, y * 0.8, z - i * 0.05])

describe('la ligne de la tresse', () => {
  for (const [nom, pts] of [['au repos', QUEUE], ['emportée', FOUET]] as [string, V[]][]) {
    it(`a des pas égaux (${nom})`, () => {
      const l = braidLine(pts, 40, 0)
      const d = l.pos.slice(1).map((p, i) => dist(p, l.pos[i])), mean = d.reduce((a, b) => a + b) / d.length
      for (const x of d) expect(Math.abs(x - mean) / mean).toBeLessThan(0.06)
      expect(l.len).toBeCloseTo(mean * 39, 1)
    })
    it(`a un repère droit, qui ne se retourne jamais (${nom})`, () => {
      const l = braidLine(pts, 40, 0.1)
      for (let k = 0; k < 40; k++) {
        expect(Math.abs(dot(l.tan[k], l.dir[k]))).toBeLessThan(1e-6)
        expect(dot(l.dir[k], l.dir[k])).toBeCloseTo(1, 6)
        if (k) expect(dot(l.dir[k], l.dir[k - 1])).toBeGreaterThan(0.8)
      }
    })
  }
  it('au repos, son dehors tourne le dos à la tête', () => {
    const l = braidLine(QUEUE, 40, 0)
    expect(l.dir[30][2]).toBeLessThan(-0.9)
  })
  it('se raccourcit', () => {
    expect(braidLine(QUEUE, 40, 0, 0.8).len).toBeCloseTo(braidLine(QUEUE, 40, 0).len * 0.8, 5)
  })
})

const PAS = 0.2, END = 0.3 + PAS * CRANS, LEN = END + 0.55
const etat = (o: Partial<BraidState> = {}): BraidState => ({ n: 0, g: 0, spread: 1, tied: 0, show: 1, held: -1, hx: 0, hs: 0, hw: 0, glow: -1, lit: 0, born: 1, ...o })
const place = (b: BraidState, k: number, s: number) => local(b, k, s, PAS, END, LEN)

describe('tresser', () => {
  it('une mèche de côté passe devant, à gauche puis à droite, chacune à son tour', () => {
    const c = Array.from({ length: CRANS }, (_, n) => crossing(n))
    for (let n = 1; n < CRANS; n++) {
      expect(c[n].side).toBe(-c[n - 1].side)
      expect(c[n].k).not.toBe(c[n - 1].k)
    }
    expect(new Set(c.map(x => x.k)).size).toBe(3)
  })
  it('la mèche à prendre pend sur son côté, et finit au milieu, devant', () => {
    for (let n = 0; n < CRANS; n++) {
      const { k, side } = crossing(n)
      expect(Math.sin(phaseAt(k, n)) * side).toBeGreaterThan(0.8)
      expect(Math.abs(Math.sin(phaseAt(k, n + 1)))).toBeLessThan(0.01)
      // au milieu du cran, elle est devant les deux autres
      const b = etat({ n, g: 0.5 }), s = 0.3 + (n + 0.5) * PAS + 0.3
      const z = [0, 1, 2].map(j => place(b, j, s)[1])
      expect(z[k]).toBe(Math.max(...z))
    }
  })
  it('la fin du cran est le début du suivant : rien ne saute', () => {
    for (let n = 0; n < CRANS; n++) for (let k = 0; k < 3; k++) for (let s = 0; s < LEN; s += 0.05) {
      const a = place(etat({ n, g: 1 }), k, s), b = place(etat({ n: n + 1, g: 0 }), k, s)
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-9)
    }
  })
  it('dans la tresse faite, deux brins gardent leur distance', () => {
    const b = etat({ n: CRANS, tied: 1 })
    for (let s = 0.6; s < END - 0.3; s += 0.02) for (let k = 0; k < 3; k++) {
      const p = place(b, k, s), q = place(b, (k + 1) % 3, s)
      expect(Math.hypot(p[0] - q[0], p[1] - q[1])).toBeGreaterThan(0.12)
    }
  })
  it('tenue, elle suit la main ; les deux autres ne bougent pas', () => {
    const b = etat({ n: 2 }), { k } = crossing(2), h = etat({ n: 2, held: k, hx: 0.2, hs: 1.3, hw: 1 })
    expect(place(h, k, 1.3)[0]).toBeCloseTo(0.2, 2)
    for (let j = 0; j < 3; j++) if (j !== k) expect(place(h, j, 1.3)).toEqual(place(b, j, 1.3))
  })
})
