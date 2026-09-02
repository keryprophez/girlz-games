import { describe, expect, it } from 'vitest'
import { COLLECT, OLD_COLLECT, rnd, shuffle, uniqueNumbers } from './utils'

describe('utils', () => {
  it('shuffle garde les mêmes éléments', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8]
    expect([...shuffle([...a])].sort()).toEqual([...a].sort())
  })
  it('rnd reste dans les bornes, bornes incluses', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) { const v = rnd(2, 4); expect(v).toBeGreaterThanOrEqual(2); expect(v).toBeLessThanOrEqual(4); seen.add(v) }
    expect(seen).toEqual(new Set([2, 3, 4]))
  })
  it('uniqueNumbers contient la réponse et des valeurs distinctes', () => {
    const u = uniqueNumbers(12, 1, 30, 4)
    expect(u).toContain(12)
    expect(new Set(u).size).toBe(4)
  })
  it("l'ancienne collection emoji se migre index par index", () => {
    expect(OLD_COLLECT.length).toBe(COLLECT.length)
  })
})
