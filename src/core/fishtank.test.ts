import { describe, expect, it } from 'vitest'
import { headSide, lighten, MAX_FISH, packTank, readTank, simplify, swimStep, SWIM, type Fish } from './fishtank'
import type { DrawStroke } from '../games/farmdraw'

/** Un poisson d'enfant : un ovale, une queue en triangle, un œil (côté `head`). */
function fish(head: 1 | -1, eye = true): DrawStroke[] {
  const body: number[] = []
  for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI * 2; body.push(Math.round(500 + Math.cos(a) * 200), Math.round(400 + Math.sin(a) * 110)) }
  const tx = 500 - head * 200
  const tail = [tx, 400, tx - head * 140, 300, tx - head * 140, 500, tx, 400]
  const s: DrawStroke[] = [{ c: '#FFA94D', w: 18, p: body }, { c: '#FFA94D', w: 18, p: tail }]
  if (eye) s.push({ c: '#3A2E25', w: 18, p: [500 + head * 120, 370, 501 + head * 120, 371] })
  return s
}

describe('l’aquarium', () => {
  it('alléger un trait garde sa forme avec bien moins de points', () => {
    const p: number[] = []
    for (let i = 0; i <= 400; i++) p.push(i, Math.round(Math.sin(i / 40) * 60))
    const q = simplify(p)
    expect(q.length).toBeLessThan(p.length / 4)
    expect(q.slice(0, 2)).toEqual([0, 0])
    expect(q.slice(-2)).toEqual(p.slice(-2))
    expect(simplify([1, 2])).toEqual([1, 2])
  })

  it('la tête est du côté de l’œil', () => {
    expect(headSide(fish(1))).toBe(1)
    expect(headSide(fish(-1))).toBe(-1)
    expect(headSide(lighten(fish(-1)))).toBe(-1)
    expect(headSide([])).toBe(1)
  })

  it('un aquarium gardé se relit ; six poissons au plus ; l’abîmé est laissé', () => {
    const many: Fish[] = Array.from({ length: 8 }, (_, i) => ({ s: fish(i % 2 ? 1 : -1), d: i % 2 ? 1 : -1 }))
    const back = readTank(JSON.parse(JSON.stringify(packTank(many, [{ k: 'algue', x: 0.1, z: -0.2, r: 1 }, { k: 'coffre', x: -0.5, z: 0, r: 0 }]))))
    expect(back.fish).toHaveLength(MAX_FISH)
    expect(back.fish[0].d).toBe(-1) // les six derniers : le premier gardé est le n° 2
    expect(back.deco.map(d => d.k)).toEqual(['algue', 'coffre'])
    const bad = readTank({ v: 1, fish: [{ s: [{ c: 'bleu', w: 3, p: [1, 2] }] }, null], deco: [['soucoupe', 0, 0, 0], ['rocher', 'x', 0, 0]] })
    expect(bad.fish).toHaveLength(0)
    expect(bad.deco).toHaveLength(0)
    expect(readTank(null).fish).toHaveLength(0)
  })

  it('un poisson rejoint son but sans sortir du bac', () => {
    const f = { x: 0, y: 0.8, z: 0, vx: 0, vy: 0, vz: 0, gx: 5, gy: 9, gz: 0.1, speed: 0.5 }
    for (let i = 0; i < 400; i++) swimStep(f, 1 / 30)
    expect(f.x).toBeLessThanOrEqual(SWIM.x)
    expect(f.y).toBeLessThanOrEqual(SWIM.y1)
    const g = { x: 0, y: 0.8, z: 0, vx: 0, vy: 0, vz: 0, gx: 0.8, gy: 1, gz: 0.1, speed: 0.5 }
    let there = false
    for (let i = 0; i < 300 && !there; i++) there = swimStep(g, 1 / 30)
    expect(there).toBe(true)
  })
})
