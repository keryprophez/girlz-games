/* @version 2026-11-25 00:20 */
import { describe, expect, it } from 'vitest'
import { HOLD, Hair, STEP, SkullMap, onScalp, scalp, type Ellipsoid, type V3 } from './hair'

const SKULL: Ellipsoid = { c: [0, 0, 0], r: [1, 1.05, 1.08] }
const make = (count = 120) => {
  const h = new Hair(scalp({ skull: SKULL, count, length: 3.4, seed: 3 }))
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
  it('la carte du crâne rend le rayon de la tête dans chaque direction', () => {
    const m = SkullMap.ellipsoid(SKULL)
    for (const [x, y, z] of [[0, 1, 0], [0, 0, -1], [1, 0, 0], [0.5, 0.6, -0.4], [-0.3, -0.8, 0.5], [0.2, -0.1, 0.9]]) {
      expect(m.at(x * 3, y * 3, z * 3)).toBeCloseTo(1 / Math.hypot(x / SKULL.r[0], y / SKULL.r[1], z / SKULL.r[2]) * Math.hypot(x, y, z), 2)
    }
  })
  it('avec la carte, aucune mèche ne passe sous le cuir chevelu, même près de sa racine', () => {
    // (le 24/11 : les racines étaient au-dessus de l'obstacle, les mèches replongeaient dessous : du chaume)
    const h = new Hair(scalp({ skull: SKULL, count: 120, length: 3.4, seed: 3 }))
    const m = SkullMap.ellipsoid({ c: [0, 0, 0], r: [1.1, 1.15, 1.2] })
    h.headColliders = [{ c: [0, -0.4, 0.6], r: [0.8, 1.1, 0.6] }, { c: [0, -1.55, -0.05], r: [0.42, 0.6, 0.42] }, { c: [0, -2.75, -0.1], r: [2.1, 0.75, 1.1] }]
    h.skull = m
    h.bake()
    for (let g = 0; g < h.G; g++) for (let i = 0; i < h.P; i++) { const p = h.point(g, i); expect(Math.hypot(...p) / m.at(...p)).toBeGreaterThan(0.995) }
  })
  it('lâchés, les cheveux passent par-dessus les oreilles ; tirés, dessous', () => {
    // (le 24/11 : l'oreille comptait comme du crâne, la chevelure tirée la recouvrait de deux bosses)
    const h = make(120)
    const bare = SkullMap.ellipsoid(SKULL), ears = SkullMap.ellipsoid(SKULL)
    for (let j = 0; j < ears.n; j++) for (let i = 0; i < ears.n; i++) { const d = ears.dir(i, j); if (Math.abs(d[0]) > 0.9 && d[1] < 0.2 && d[1] > -0.4) ears.r[j * ears.n + i] *= 1.25 }
    ears.max = Math.max(...ears.r)
    h.headColliders = [{ c: [0, -0.4, 0.6], r: [0.8, 1.1, 0.6] }, { c: [0, -1.55, -0.05], r: [0.42, 0.6, 0.42] }, { c: [0, -2.75, -0.1], r: [2.1, 0.75, 1.1] }]
    h.skull = ears
    h.bare = bare
    h.bake()
    for (let g = 0; g < h.G; g++) {
      const r = h.root(g)
      expect(Math.hypot(...r) / bare.at(...r)).toBeCloseTo(1, 2)
      for (let i = 2; i < h.P; i++) { const p = h.point(g, i); expect(Math.hypot(...p) / ears.at(...p)).toBeGreaterThan(0.97) }
    }
    for (let g = 0; g < h.G; g++) h.tie(g, [0, 0.25, -1.05])
    run(h, 2)
    for (let g = 0; g < h.G; g++) for (let i = 1; i < HOLD - 1; i++) { const p = h.point(g, i); expect(Math.hypot(...p)).toBeLessThan(bare.at(...p) + 0.12) }
  })
  it('la tête qui tourne seule emmène les cheveux, en tout ou en partie', () => {
    const turned = (carry: number) => {
      const h = make(40)
      run(h, 1)
      const a = h.pos.slice()
      h.setHead(0.6, 0, false, carry)
      let d = 0
      for (let k = 0; k < a.length; k++) d = Math.max(d, Math.abs(h.pos[k] - a[k]))
      return d
    }
    expect(turned(1)).toBeLessThan(1e-6)
    expect(turned(0.7)).toBeLessThan(turned(0) * 0.45)
    // sans emport, le calcul du lacet donne la même chose que la rotation complète
    const p = make(20), q = make(20)
    p.setHead(0.5, 0); q.setHead(0.5, 0, false, 1e-9)
    for (let k = 0; k < p.pos.length; k++) expect(q.pos[k]).toBeCloseTo(p.pos[k], 5)
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
  const back: V3 = [0.3, -1.2, -1.5]
  /** Une poignée prise à l'arrière, et ce que vaut chaque point avant la prise. */
  const take = (h: Hair) => {
    const got = h.pick([0.3, -1.2, -6], [0, 0, 1], 0.4, 9).filter(p => p.a < 2.4)
    for (const p of got) h.grab(p.g, p.a, back, [0, 0, 0])
    return got.map(p => p.g)
  }
  it('prendre une poignée ne la fait pas bouger : elle est seulement redécoupée', () => {
    const h = make()
    run(h, 3)
    const before = h.pos.slice()
    const got = take(h)
    expect(got.length).toBeGreaterThan(4)
    h.step(STEP)
    // chaque point reste sur le tracé de sa mèche d'avant (aucun bond)
    for (const g of got) for (let i = 1; i < h.P; i++) {
      const p = h.point(g, i)
      let d = 9
      for (let j = 0; j < h.P - 1; j++) for (let u = 0; u <= 1; u += 0.1) {
        const k = (g * h.P + j) * 3
        d = Math.min(d, Math.hypot(...[0, 1, 2].map(x => before[k + x] + (before[k + 3 + x] - before[k + x]) * u - p[x])))
      }
      expect(d).toBeLessThan(0.06)
    }
  })
  it('la main tient la mèche sans retard, tendue depuis la racine : aucune pelote', () => {
    const h = make()
    run(h, 3)
    const got = take(h)
    run(h, 0.3)
    const at: V3 = [0.2, 0.2, -1.35]
    for (let k = 1; k <= 30; k++) { const u = k / 30; h.hand([back[0] + (at[0] - back[0]) * u, back[1] + (at[1] - back[1]) * u, back[2] + (at[2] - back[2]) * u]); run(h, 1 / 60) }
    for (const g of got) {
      const r = h.root(g), p = h.point(g, HOLD)
      expect(Math.hypot(p[0] - at[0], p[1] - at[1], p[2] - at[2])).toBeLessThan(0.02)
      // le chemin de la racine à la main : à peine plus long que le tour du crâne
      let len = 0
      for (let i = 1; i <= HOLD; i++) { const a = h.point(g, i - 1), b = h.point(g, i); len += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) }
      const chord = Math.hypot(r[0] - at[0], r[1] - at[1], r[2] - at[2])
      expect(len).toBeLessThan(chord * 1.6 + 0.15)
      // et la longueur totale ne change pas
      for (let i = HOLD + 1; i < h.P; i++) { const a = h.point(g, i - 1), b = h.point(g, i); len += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) }
      expect(len / (h.seg[g] * (h.P - 1))).toBeCloseTo(1, 1)
    }
    expect(inside(h, SKULL)).toBe(0)
  })
  it('seules les mèches tenues bougent : les autres dorment', () => {
    const h = make()
    run(h, 4)
    const before = h.pos.slice()
    const got = new Set(take(h))
    for (let k = 0; k < 40; k++) { h.hand([0.3, -1.2 + k * 0.035, -1.5]); run(h, 1 / 60) }
    for (const g of got) h.tie(g, [0, 0.2, -1.2])
    run(h, 3)
    for (let g = 0; g < h.G; g++) if (!got.has(g)) for (let k = g * h.P * 3; k < (g + 1) * h.P * 3; k++) expect(h.pos[k]).toBe(before[k])
  })
  it('lâchée hors de l’attache, la poignée retombe à sa place et s’endort', () => {
    const h = make()
    run(h, 3)
    const before = h.pos.slice(), got = take(h)
    for (let k = 0; k < 30; k++) { h.hand([0.3 + k * 0.03, -1.2 + k * 0.02, -1.6]); run(h, 1 / 60) }
    for (const g of got) h.untie(g)
    run(h, 5)
    expect(finite(h)).toBe(true)
    expect(stretch(h)).toBeLessThan(0.05)
    for (const g of got) for (let i = 2; i < h.P; i++) { const p = h.point(g, i), k = (g * h.P + i) * 3; expect(Math.hypot(p[0] - before[k], p[1] - before[k + 1], p[2] - before[k + 2])).toBeLessThan(0.25) }
    expect(got.every(g => h.asleep[g])).toBe(true)
  })
  it('la brosse ne froisse pas : poussée le long des mèches, elle ne les déplace pas', () => {
    const h = make()
    run(h, 3)
    const before = h.pos.slice()
    for (let k = 0; k < 20; k++) h.comb([0, -1 - k * 0.05, -6], [0, 0, 1], 0.5, [0, -0.05, 0], 0.4)
    let d = 0
    for (let k = 0; k < before.length; k += 3) d = Math.max(d, Math.hypot(h.pos[k] - before[k], h.pos[k + 1] - before[k + 1], h.pos[k + 2] - before[k + 2]))
    expect(d).toBeLessThan(0.15)
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
      // (l'attache est au pied du faisceau, le point d'avant la fin de la partie posée)
      const j = h.tieIdx[g] - 1, p = h.point(g, j), tip = h.point(g, h.P - 1)
      const stub = h.point(g, j + 1)
      // le faisceau sort de la tête (vers l'arrière), il ne rentre pas dedans
      expect(Math.hypot(...stub)).toBeGreaterThan(Math.hypot(...p))
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
