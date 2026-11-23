import { describe, expect, it } from 'vitest'
import { Hair, STEP, onScalp, scalp, type Ellipsoid } from './hair'

const SKULL: Ellipsoid = { c: [0, 0, 0], r: [1, 1.05, 1.08] }
const make = (count = 120) => {
  const h = new Hair(scalp({ skull: SKULL, count, length: 3.4, seed: 3 }), 14)
  h.headColliders = [SKULL, { c: [0, -1.55, -0.05], r: [0.42, 0.6, 0.42] }, { c: [0, -2.75, -0.1], r: [2.1, 0.75, 1.1] }]
  h.bake()
  return h
}
const run = (h: Hair, s: number) => { for (let i = 0; i < Math.round(s / STEP); i++) h.step(STEP) }
const finite = (h: Hair) => h.pos.every(Number.isFinite)
/** L'écart le plus grand entre un segment et sa longueur, en proportion. */
function stretch(h: Hair) {
  let worst = 0
  for (let g = 0; g < h.G; g++) for (let i = 1; i < h.P; i++) {
    const a = h.point(g, i - 1), b = h.point(g, i)
    const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    worst = Math.max(worst, Math.abs(d - h.seg[g]) / h.seg[g])
  }
  return worst
}
function inside(h: Hair, e: Ellipsoid) {
  let n = 0
  for (let k = 0; k < h.pos.length; k += 3) {
    // la racine et le point suivant sont posés sur le cuir chevelu : on ne les compte pas
    if ((k / 3) % h.P < 2) continue
    const x = (h.pos[k] - e.c[0]) / e.r[0], y = (h.pos[k + 1] - e.c[1]) / e.r[1], z = (h.pos[k + 2] - e.c[2]) / e.r[2]
    if (x * x + y * y + z * z < 0.97) n++
  }
  return n
}

describe('le cuir chevelu', () => {
  it('pas de cheveux sur le visage, ni sous la nuque', () => {
    expect(onScalp(0, 0, 1)).toBe(false)      // le nez
    expect(onScalp(0, 1, 0)).toBe(true)       // le sommet
    expect(onScalp(0, -0.3, -0.95)).toBe(true) // l'arrière du crâne
    expect(onScalp(0, -0.8, -0.6)).toBe(false) // le cou
  })
  it('autant de racines que demandé, sur le crâne, avec une pousse unitaire', () => {
    const s = scalp({ skull: SKULL, count: 200, length: 3, seed: 1 })
    expect(s.roots.length).toBe(200)
    for (const d of s.dirs) expect(Math.hypot(...d)).toBeCloseTo(1, 5)
  })
})

describe('la physique', () => {
  it('se pose sans exploser, sans s’étirer, sans traverser la tête', () => {
    const h = make()
    run(h, 3)
    expect(finite(h)).toBe(true)
    expect(stretch(h)).toBeLessThan(0.05)
    expect(inside(h, SKULL)).toBe(0)
  })
  it('au repos, plus rien ne bouge (aucun frémissement)', () => {
    const h = make()
    run(h, 3)
    const before = h.pos.slice()
    run(h, 0.5)
    let move = 0
    for (let k = 0; k < before.length; k++) move = Math.max(move, Math.abs(h.pos[k] - before[k]))
    expect(move).toBeLessThan(1e-3)
  })
  it('les racines suivent la tête quand elle tourne, et les cheveux se balancent', () => {
    const h = make()
    run(h, 2)
    const tip = h.point(0, h.P - 1)
    for (let i = 0; i < 30; i++) { h.setHead(i / 30 * 0.8, 0); h.step(STEP) }
    // dans le repère de la tête, la racine ne bouge pas ; la pointe, si (l'inertie)
    expect(h.point(0, 0)).toEqual(h.root(0).map(v => expect.closeTo(v, 5)))
    run(h, 0.05)
    expect(h.point(0, h.P - 1)).not.toEqual(tip)
    run(h, 3)
    expect(finite(h)).toBe(true)
    expect(stretch(h)).toBeLessThan(0.05)
  })
  it('un point tenu est exactement sous le doigt, sans retard', () => {
    const h = make()
    run(h, 2)
    const idx = 5 * h.P + 9
    const target: [number, number, number] = [1.6, -0.8, -1.4]
    h.pin(idx, target)
    h.step(STEP)
    expect(h.point(5, 9)).toEqual(target.map(v => expect.closeTo(v, 6)))
    run(h, 1)
    expect(finite(h)).toBe(true)
    // lâché, il garde son élan puis se repose
    h.pin(idx, null)
    run(h, 4)
    expect(finite(h)).toBe(true)
    expect(stretch(h)).toBeLessThan(0.05)
  })
  it('le pas est fixe : le même résultat à 30 ou à 120 images par seconde', () => {
    const a = make(40), b = make(40)
    for (let i = 0; i < 60; i++) a.advance(1 / 30)
    for (let i = 0; i < 240; i++) b.advance(1 / 120)
    let d = 0
    for (let k = 0; k < a.pos.length; k++) d = Math.max(d, Math.abs(a.pos[k] - b.pos[k]))
    expect(d).toBeLessThan(1e-4)
  })
  it('la brosse ne déplace que la surface touchée', () => {
    const h = make()
    run(h, 3)
    const n = h.comb([0, -0.6, -6], [0, 0, 1], 0.5, [0.3, 0, 0], 0.25)
    expect(n.size).toBeGreaterThan(0)
    run(h, 1)
    expect(finite(h)).toBe(true)
  })
  it('un rayon sur les cheveux trouve des mèches ; à côté, rien', () => {
    const h = make()
    run(h, 3)
    expect(h.pick([0, -0.8, -6], [0, 0, 1], 0.35, 0.4).length).toBeGreaterThan(0)
    expect(h.pick([5, 0, -6], [0, 0, 1], 0.35, 0.4).length).toBe(0)
  })
  it('la queue de cheval : chaque mèche attachée part de sa racine, passe sur le crâne et pend sous l’attache', () => {
    const h = make()
    run(h, 1)
    const tieAt: [number, number, number] = [0, 0.1, -1.2]
    for (let g = 0; g < h.G; g++) h.tie(g, tieAt, (g % 10) * 0.02)
    run(h, 3)
    expect(finite(h)).toBe(true)
    expect(inside(h, SKULL)).toBe(0)
    for (let g = 0; g < h.G; g++) {
      const j = h.tieIdx[g], p = h.point(g, j), tip = h.point(g, h.P - 1)
      // l'attache est au point d'attache, la pointe pend en dessous
      expect(Math.hypot(p[0] - tieAt[0], p[1] - tieAt[1], p[2] - tieAt[2])).toBeLessThan(0.05)
      expect(tip[1]).toBeLessThan(tieAt[1])
    }
    // la queue suit la tête qui tourne, puis se repose
    for (let i = 0; i < 40; i++) { h.setHead(i / 40, 0); h.step(STEP) }
    run(h, 4)
    expect(finite(h)).toBe(true)
    expect(h.asleep.every(a => a === 1)).toBe(true)
  })
})
