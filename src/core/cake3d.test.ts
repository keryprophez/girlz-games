import { describe, expect, it } from 'vitest'
import { TEETH, biteOf, biteRim, inBite } from './cake3d'

// Les gâteaux de la Pâtisserie : un étage (bas 0,4, haut 1,02), deux, trois
const CAKES: [number, number, number][] = [[1, 0.4, 1.02], [0.98, 0.4, 1.35], [1, 0.4, 1.56], [1.3, 0.4, 1.35]]

describe('biteOf', () => {
  it('mord la pointe par le coin du dessus, et laisse le bas du bord pour la dernière bouchée', () => {
    for (const [L, y0, y1] of CAKES) {
      const b0 = biteOf(L, y0, y1, 0), b1 = biteOf(L, y0, y1, 1)
      expect(inBite(b0, 0.02, y1 - 0.02)).toBe(true)
      expect(inBite(b0, L * 0.9, y0 + 0.02)).toBe(false)
      expect(inBite(b1, L * 0.95, y0 + 0.02)).toBe(false)
      expect(b0.teeth).toHaveLength(TEETH)
    }
  })
  it('la deuxième bouchée contient la première, dents comprises (sa paroi suffit)', () => {
    for (const [L, y0, y1] of CAKES) for (let seed = 1; seed <= 6; seed++) {
      const b0 = biteOf(L, y0, y1, 0, seed), b1 = biteOf(L, y0, y1, 1, seed)
      for (let u = -0.3; u <= L; u += 0.02) for (let y = y0; y <= y1 + 0.3; y += 0.02) {
        if (inBite(b0, u, y)) expect(inBite(b1, u, y)).toBe(true)
      }
    }
  })
})

describe('biteRim', () => {
  it('suit le bord : dedans juste avant, dehors juste après, festonné par les dents', () => {
    const b = biteOf(1, 0.4, 1.35, 0, 3)
    const rims: number[] = []
    for (let i = 0; i <= 60; i++) {
      const a = -Math.PI / 2 + i / 60 * (Math.PI / 2)
      const r = biteRim(b, a)
      rims.push(r)
      expect(r).toBeGreaterThanOrEqual(b.R)
      const at = (k: number) => [b.c[0] + Math.cos(a) * r * k, b.c[1] + Math.sin(a) * r * k] as const
      expect(inBite(b, ...at(0.995))).toBe(true)
      expect(inBite(b, ...at(1.005))).toBe(false)
    }
    // Les dents : le bord avance et recule
    expect(Math.max(...rims) - Math.min(...rims)).toBeGreaterThan(0.02)
  })
})
