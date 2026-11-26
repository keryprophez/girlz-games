/* @version 2026-11-26 09:32 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('./sfx', () => ({ sfx: () => {} }))
import type { Trait } from './pinceaux'
const { symMats, dab, segment, endStroke, newStroke, textured, BRUSHES, SIZES } = await import('./pinceaux')

/** Un faux contexte 2D : il compte les remplissages et garde son état. */
function faux() {
  const st = { fills: 0, strokes: 0 }
  const g = {
    globalCompositeOperation: 'source-over', globalAlpha: 1, shadowBlur: 0, shadowColor: 'transparent',
    lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', strokeStyle: '#000', fillStyle: '#000',
    beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, arc() {}, fillRect() { st.fills++ },
    fill() { st.fills++ }, stroke() { st.strokes++ }, save() {}, restore() {}, translate() {}, rotate() {}, setTransform() {}
  }
  return { g: g as unknown as CanvasRenderingContext2D, st }
}
globalThis.Path2D ??= class {} as unknown as typeof Path2D

const trait = (g: CanvasRenderingContext2D, o: Partial<Trait> = {}): Trait =>
  ({ g, brush: 'feutre', color: '#E8414F', px: SIZES[1], eraser: false, hue: 0, mats: symMats(1, 1500, 1000), ...o })

describe('les pinceaux', () => {
  it('symMats : 1, 2, 4 et 8 reflets, le premier est l’identité', () => {
    for (const n of [1, 2, 4, 8] as const) {
      const m = symMats(n, 1500, 1000)
      expect(m).toHaveLength(n)
      expect(m[0].map(v => v + 0)).toEqual([1, 0, 0, 1, 0, 0]) // la rosace donne -0, égal à 0
    }
  })

  it('un pinceau à grain pose ses empreintes à intervalle régulier, quel que soit le découpage du doigt', () => {
    const compte = (morceaux: number) => {
      const { g, st } = faux()
      const t = trait(g, { brush: 'etoiles' })
      const s = newStroke(100, 300)
      dab(t, 100, 300)
      for (let i = 1; i <= morceaux; i++) segment(t, s, 100 + 400 * i / morceaux, 300)
      return st.fills
    }
    expect(compte(1)).toBeGreaterThan(5)
    expect(compte(8)).toBe(compte(1))
  })

  it('la gomme efface (destination-out) et rend le contexte propre', () => {
    const { g } = faux()
    const seen: string[] = []
    const real = g.stroke.bind(g)
    g.stroke = () => { seen.push(g.globalCompositeOperation); real() }
    const t = trait(g, { eraser: true })
    const s = newStroke(10, 10)
    dab(t, 10, 10)
    segment(t, s, 60, 10); segment(t, s, 120, 14)
    endStroke(t, s)
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every(op => op === 'destination-out')).toBe(true)
    expect([g.globalCompositeOperation, g.globalAlpha, g.shadowBlur]).toEqual(['source-over', 1, 0])
  })

  it('les dix pinceaux, et la gomme n’est jamais un pinceau à grain', () => {
    expect(BRUSHES).toHaveLength(10)
    expect(textured({ brush: 'etoiles', eraser: true })).toBe(false)
    expect(textured({ brush: 'feutre', eraser: false })).toBe(false)
    expect(textured({ brush: 'craie', eraser: false })).toBe(true)
  })
})
