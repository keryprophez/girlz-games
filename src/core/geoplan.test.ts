import { describe, expect, it } from 'vitest'
import { BOARD, SHAPES, diff, makeRounds, prims, same, sides, span, transform, type Seg } from './geoplan'
import { seeded } from './tracteur'

const sq: Seg[] = [[[0, 0], [2, 0]], [[2, 0], [2, 2]], [[2, 2], [0, 2]], [[0, 2], [0, 0]]]

describe('comparer deux figures', () => {
  it('un élastique sur trois picots alignés vaut ses deux moitiés', () => {
    const halves: Seg[] = [[[0, 0], [1, 0]], [[1, 0], [2, 0]], [[2, 0], [2, 2]], [[2, 2], [0, 2]], [[0, 2], [0, 0]]]
    expect(same(halves, sq, false)).toBe(true)
  })
  it('le sens de l’élastique ne compte pas, ni un élastique posé deux fois', () => {
    const rev: Seg[] = [...sq.map(([a, b]) => [b, a] as Seg), [[0, 0], [2, 0]]]
    expect(same(rev, sq, false)).toBe(true)
  })
  it('deux élastiques qui se chevauchent couvrent le côté entier', () => {
    const over: Seg[] = [[[0, 0], [2, 0]], [[1, 0], [2, 0]], ...sq.slice(1)]
    expect(same(over, sq, false)).toBe(true)
  })
  it('à la même place pour la fleur, n’importe où ensuite', () => {
    const far = sq.map(s => s.map(([c, r]) => [c + 3, r + 1]) as Seg)
    expect(same(far, sq, false)).toBe(false)
    expect(same(far, sq, true)).toBe(true)
  })
  it('un côté en trop ou en moins, ce n’est pas la figure', () => {
    expect(same([...sq, [[0, 0], [2, 2]]], sq, true)).toBe(false)
    expect(same(sq.slice(1), sq, true)).toBe(false)
    expect(same([], sq, true)).toBe(false)
  })
  it('une diagonale longue passe par les picots qu’elle traverse', () => {
    expect([...prims([[[0, 0], [2, 2]]])]).toEqual(['0,0|1,1', '1,1|2,2'])
    expect(prims([[[0, 0], [2, 1]]]).size).toBe(1)
  })
  it('dit ce qui manque et ce qui est en trop', () => {
    const d = diff([[[0, 0], [2, 0]], [[0, 0], [1, 1]]], sq)
    expect(d.extra).toHaveLength(1)
    expect(d.missing).toHaveLength(6)
  })
})

describe('les côtés (la harpe)', () => {
  it('un carré a quatre côtés, quelle que soit la façon de le tendre', () => {
    expect(sides(sq)).toHaveLength(4)
    expect(sides([[[0, 0], [1, 0]], [[1, 0], [2, 0]], ...sq.slice(1)])).toHaveLength(4)
  })
  it('les figures ont le nombre de côtés attendu', () => {
    expect(sides(SHAPES.triangle.segs)).toHaveLength(3)
    expect(sides(SHAPES.maison.segs)).toHaveLength(6)
    expect(sides(SHAPES.fleche.segs)).toHaveLength(7)
    expect(sides(SHAPES.etoile.segs)).toHaveLength(8)
    expect(sides(SHAPES.hexagone.segs)).toHaveLength(6)
    // La coque (4), le mât, la voile (2) : le bas de la voile est sur le mât
    expect(sides(SHAPES.bateau.segs)).toHaveLength(7)
  })
})

describe('les transformations de la flamme', () => {
  it('agrandie ×2', () => {
    expect(span(transform(SHAPES.petitRectangle.segs, 'x2'))).toEqual([4, 2])
    expect(same(transform(SHAPES.petitCarre.segs, 'x2'), SHAPES.carre.segs, true)).toBe(true)
  })
  it('un quart de tour : la largeur devient la hauteur', () => {
    expect(span(transform(SHAPES.rectangle.segs, 'rot'))).toEqual([2, 3])
    // La flèche vers la droite, tournée d'un quart dans le sens des aiguilles, pointe vers nous
    const r = transform(SHAPES.fleche.segs, 'rot')
    expect(r.flat().some(([c, rr]) => c === 2 && rr === 4)).toBe(true)
  })
  it('en miroir : un carré reste un carré, un drapeau change de côté', () => {
    expect(same(transform(SHAPES.carre.segs, 'mir'), SHAPES.carre.segs, true)).toBe(true)
    expect(same(transform(SHAPES.drapeau.segs, 'mir'), SHAPES.drapeau.segs, true)).toBe(false)
  })
})

describe('les manches', () => {
  for (const tier of ['easy', 'med', 'exp'] as const) {
    it(`${tier} : chaque figure tient sur la plaque`, () => {
      for (let seed = 1; seed <= 30; seed++) {
        for (const rd of makeRounds(tier, seeded(seed))) {
          expect(rd.n).toBe(BOARD[tier])
          for (const [c, r] of rd.want.flat()) {
            expect(c).toBeGreaterThanOrEqual(0); expect(r).toBeGreaterThanOrEqual(0)
            expect(c).toBeLessThan(rd.n); expect(r).toBeLessThan(rd.n)
          }
          expect(same(rd.want, rd.xf ? transform(rd.model, rd.xf) : rd.model, true)).toBe(true)
        }
      }
    })
  }
  it('la flamme : deux de chaque transformation, et elles changent vraiment la figure', () => {
    const rds = makeRounds('exp', seeded(3))
    expect(rds.map(r => r.xf).sort()).toEqual(['mir', 'mir', 'rot', 'rot', 'x2', 'x2'])
    for (const r of rds) expect(same(r.want, r.model, true)).toBe(false)
  })
})
