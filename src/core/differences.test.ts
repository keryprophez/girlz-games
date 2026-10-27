import { describe, expect, it } from 'vitest'
import { PLACES, plan, recipe } from './differences'
import { seeded } from './labyrinth'

/* Le Jeu des différences : le tirage des manches. */

describe('le tirage', () => {
  it('donne 5, 7 et 9 différences selon le niveau, avec les fines et les cachées voulues', () => {
    for (const tier of [0, 1, 2] as const) {
      for (let lv = 0; lv <= 3; lv++) {
        for (let s = 1; s <= 40; s++) {
          const p = plan(tier, lv, seeded(s * 31 + lv))
          const r = recipe(tier, lv)
          expect(p.diffs.length).toBe(r.total)
          expect(p.diffs.filter(d => d.hidden).length).toBe(r.hidden)
          expect(p.diffs.filter(d => d.grade === 'fin').length).toBe(r.fin + r.hidden)
          if (tier === 0 && lv === 0) expect(p.diffs.every(d => d.grade === 'franc')).toBe(true)
          if (tier < 2) expect(p.diffs.some(d => d.hidden)).toBe(false)
        }
      }
    }
  })
  it('ne touche jamais deux fois la même chose', () => {
    for (let s = 1; s <= 200; s++) {
      const p = plan((s % 3) as 0 | 1 | 2, s % 4, seeded(s))
      const animals = p.diffs.filter(d => d.animal !== undefined).map(d => d.animal)
      expect(new Set(animals).size).toBe(animals.length)
      const single = p.diffs.filter(d => !d.kind.startsWith('animal-')).map(d => d.kind)
      expect(new Set(single).size).toBe(single.length)
      // Un animal en plus va sur une place libre
      const taken = new Set(p.animals.map(a => a.place))
      for (const d of p.diffs.filter(d => d.kind === 'animal-plus')) {
        expect(taken.has(d.place!)).toBe(false)
        taken.add(d.place!)
      }
      for (const d of p.diffs.filter(d => d.kind === 'animal-change')) expect(d.to).not.toBe(p.animals[d.animal!].kind)
      const kinds = p.diffs.map(d => d.kind)
      expect(kinds.includes('bois') && kinds.includes('cache-bois')).toBe(false)
      expect(kinds.includes('botte') && kinds.includes('cache-bottes')).toBe(false)
    }
  })
  it('change à chaque manche', () => {
    const a = plan(1, 0, seeded(1)), b = plan(1, 0, seeded(2))
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })
  it('garde les places de la cour loin les unes des autres', () => {
    for (let i = 0; i < PLACES.length; i++) for (let j = i + 1; j < PLACES.length; j++) {
      expect(Math.hypot(PLACES[i][0] - PLACES[j][0], PLACES[i][1] - PLACES[j][1])).toBeGreaterThan(0.9)
    }
  })
})
