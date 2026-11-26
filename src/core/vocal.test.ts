/* @version 2026-11-26 09:40 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('./sfx', () => ({ sfx: () => {} }))
vi.mock('./music', () => ({ playMusic: () => {}, stopMusic: () => {} }))
const { pics, MIN_S, MAX_S } = await import('./vocal')

describe('les barres d’une voix', () => {
  it('toujours vingt-huit barres, même pour trois niveaux ou aucun', () => {
    expect(pics([0.2, 0.5, 0.1])).toHaveLength(28)
    expect(pics([])).toHaveLength(28)
    expect(pics(Array.from({ length: 900 }, (_, i) => i % 7 / 7))).toHaveLength(28)
  })
  it('le silence donne des barres au plancher', () => {
    expect(pics(new Array(100).fill(0)).every(v => v === 0.12)).toBe(true)
  })
  it('le plus fort vaut 1, tout est entre 0,12 et 1, sans NaN', () => {
    const p = pics([0.1, 0.4, 0.8, 0.2, 0, 0.05, 0.3])
    expect(Math.max(...p)).toBe(1)
    for (const v of p) { expect(Number.isNaN(v)).toBe(false); expect(v).toBeGreaterThanOrEqual(0.12); expect(v).toBeLessThanOrEqual(1) }
  })
  it('les bornes de la conception : 0,4 s à 30 s', () => {
    expect([MIN_S, MAX_S]).toEqual([0.4, 30])
  })
})
