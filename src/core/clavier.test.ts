/* @version 2026-11-26 09:36 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('./sfx', () => ({ sfx: () => {} }))
const { rangees, EMOJIS } = await import('./clavier')
const { vus } = await import('./saisie')

const lettres = (r: { k: string }[]) => r.map(t => t.k).join('')

describe('le clavier', () => {
  it('cinq rangées de vingt demi-colonnes', () => {
    for (const [maj, ch] of [[false, false], [true, false], [false, true]]) {
      const R = rangees(maj, ch)
      expect(R).toHaveLength(5)
      for (const r of R) expect(r.reduce((a, t) => a + t.w, 0)).toBe(20)
    }
  })
  it('les accents en haut, ou les chiffres', () => {
    expect(lettres(rangees(false, false)[0])).toBe('éèêëàâçîôù')
    expect(lettres(rangees(false, true)[0])).toBe('1234567890')
  })
  it('un AZERTY', () => {
    const R = rangees(false, false)
    expect(lettres(R[1])).toBe('azertyuiop')
    expect(lettres(R[2])).toBe('qsdfghjklm')
    expect(R[3].map(t => t.k)).toEqual(['maj', 'w', 'x', 'c', 'v', 'b', 'n', '’', 'effacer'])
  })
  it('la majuscule change les lettres et les accents', () => {
    const R = rangees(true, false)
    expect(lettres(R[0])).toBe('ÉÈÊËÀÂÇÎÔÙ')
    expect(lettres(R[1])).toBe('AZERTYUIOP')
  })
  it('la dernière rangée', () => {
    expect(rangees(false, false)[4].map(t => t.k)).toEqual(['emoji', '123', ',', ' ', '.', '?', '!', 'entrer'])
  })
  it('les émojis : sans doublon, chacun un seul caractère vu', () => {
    expect(EMOJIS.length).toBeGreaterThanOrEqual(90)
    expect(new Set(EMOJIS).size).toBe(EMOJIS.length)
    for (const e of EMOJIS) expect(vus(e)).toHaveLength(1)
  })
})
