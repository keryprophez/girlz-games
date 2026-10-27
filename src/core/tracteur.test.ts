import { describe, expect, it } from 'vitest'
import { makeRounds, run, seeded, solve, stepOf, type Level, type Token } from './tracteur'

const lv = (o: Partial<Level>): Level => ({
  n: 5, mode: 'abs', loops: false, slots: 8, start: { c: 0, r: 4 }, dir: 0, rocks: [], animals: [{ c: 0, r: 2 }], best: 0, ...o
})

describe('le tracteur exécute sa file', () => {
  it('avance avec les flèches de l’écran et ramasse l’animal', () => {
    const r = run(lv({}), [{ cmd: 'N' }, { cmd: 'N' }, { cmd: 'E' }])
    expect(r.ok).toBe(true)
    // La dernière flèche ne joue pas : l'animal est déjà monté
    expect(r.steps.length).toBe(2)
    expect(r.steps[1].pick).toBe(0)
  })

  it('s’arrête net sur un obstacle et désigne la flèche fautive', () => {
    const r = run(lv({ rocks: [{ c: 1, r: 4 }] }), [{ cmd: 'N' }, { cmd: 'S' }, { cmd: 'E' }, { cmd: 'N' }])
    expect(r.ok).toBe(false)
    expect(r.fault).toBe(2)
    expect(r.steps.at(-1)!.kind).toBe('bump')
  })

  it('ne sort pas du pré', () => {
    const r = run(lv({}), [{ cmd: 'W' }])
    expect(r.fault).toBe(0)
    expect(r.steps[0].kind).toBe('out')
  })

  it('tourne sur place vu du tracteur, comme le Bee-Bot', () => {
    const l = lv({ mode: 'rel', animals: [{ c: 1, r: 4 }] })
    expect(stepOf(l, { c: 0, r: 4, dir: 0, mask: 0 }, 'R').to).toEqual({ c: 0, r: 4, dir: 1, mask: 0 })
    const r = run(l, [{ cmd: 'R' }, { cmd: 'F' }])
    expect(r.ok).toBe(true)
  })

  it('joue deux fois une flèche ×2, dans la même case', () => {
    const l = lv({ mode: 'rel', loops: true, animals: [{ c: 0, r: 1 }] })
    const r = run(l, [{ cmd: 'F', x2: true }, { cmd: 'F' }])
    expect(r.ok).toBe(true)
    expect(r.steps.map(s => [s.tok, s.rep])).toEqual([[0, 0], [0, 1], [1, 0]])
  })

  it('un ×2 sans boucle permise ne joue qu’une fois', () => {
    const r = run(lv({ mode: 'rel' }), [{ cmd: 'F', x2: true }])
    expect(r.steps.length).toBe(1)
  })

  it('ramasse deux animaux dans la même file', () => {
    const l = lv({ animals: [{ c: 0, r: 3 }, { c: 1, r: 3 }] })
    const r = run(l, [{ cmd: 'N' }, { cmd: 'E' }])
    expect(r.ok).toBe(true)
    expect(r.steps.map(s => s.pick)).toEqual([0, 1])
  })
})

describe('la recherche de chemin', () => {
  it('trouve le plus court, en cases de file', () => {
    expect(solve(lv({}))!.length).toBe(2)
    expect(solve(lv({ mode: 'rel', loops: true }))!.length).toBe(1)
  })
  it('dit quand il n’y a pas de chemin', () => {
    expect(solve(lv({ rocks: [{ c: 0, r: 3 }, { c: 1, r: 4 }] }))).toBeNull()
  })
})

describe('les manches générées', () => {
  for (const tier of ['easy', 'med', 'exp'] as const) {
    it(`${tier} : huit manches, toutes solubles par leur propre exécution`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const rounds = makeRounds(tier, seeded(seed))
        expect(rounds).toHaveLength(8)
        for (const l of rounds) {
          const sol = solve(l) as Token[]
          expect(sol).not.toBeNull()
          expect(sol.length).toBeLessThanOrEqual(l.slots)
          expect(sol.length).toBe(l.best)
          expect(run(l, sol).ok).toBe(true)
          // Rien ne se chevauche
          const cells = [l.start, ...l.rocks, ...l.animals].map(p => p.c * 16 + p.r)
          expect(new Set(cells).size).toBe(cells.length)
        }
      }
    })
  }
  it('à la flamme, la boucle fait gagner des cases', () => {
    for (const l of makeRounds('exp', seeded(7))) {
      expect(solve({ ...l, loops: false })!.length).toBeGreaterThan(l.best)
    }
  })
})
