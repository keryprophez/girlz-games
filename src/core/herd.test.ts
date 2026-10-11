import { describe, it, expect } from 'vitest'
import { makeHerd, spawn, addDogs, addFox, stepHerd, pilot, bark, wantsBark, outside, herdOpts, LEVELS, TUNE, type HerdOpts, type Herd, type Level } from './herd'

/** Les fermes des trois niveaux : celles du jeu. */
const LAYOUTS: Record<Level, HerdOpts> = { easy: herdOpts('easy'), med: herdOpts('med'), exp: herdOpts('exp') }
const PEN = LAYOUTS.easy.pen

/** Le pilote mène le troupeau : le temps qu'il lui faut (Infinity s'il n'y arrive pas en `max` s). */
function herdWith(h: Herd, max: number, dt = 0.1) {
  for (let t = 0; t < max; t += dt) {
    h.dogs.forEach((d, i) => { const p = pilot(h, i); d.tx = p.x; d.tz = p.z; if (wantsBark(h, i)) bark(h, i) })
    stepHerd(h, dt)
    if (!outside(h).length) return t
  }
  return Infinity
}

describe('le troupeau', () => {
  it('fuit le chien', () => {
    const h = makeHerd({ ...LAYOUTS.easy, seed: 3 })
    spawn(h, 5, { clusters: 1 })
    addDogs(h, 1)
    const s = h.sheep[0]
    const d = h.dogs[0]
    d.x = s.x + 1; d.z = s.z; d.tx = d.x; d.tz = d.z
    const before = Math.hypot(s.x - d.x, s.z - d.z)
    stepHerd(h, 0.8)
    expect(Math.hypot(s.x - d.x, s.z - d.z)).toBeGreaterThan(before + 0.4)
  })

  it('ne quitte jamais le plateau, ne traverse ni obstacle ni piquet', () => {
    for (const seed of [1, 2, 3]) {
      const h = makeHerd({ ...LAYOUTS.exp, seed })
      spawn(h, 12, { clusters: 3, goat: true })
      addDogs(h, 1)
      addFox(h, 5)
      for (let t = 0; t < 60; t += 0.1) {
        const d = h.dogs[0]
        // Le chien fonce partout, au hasard
        if (Math.floor(t * 10) % 25 === 0) { const a = h.rnd() * 6.28, r = h.rnd() * 7; d.tx = Math.sin(a) * r; d.tz = Math.cos(a) * r }
        stepHerd(h, 0.1)
        for (const s of h.sheep) {
          expect(Math.hypot(s.x, s.z)).toBeLessThanOrEqual(LEVELS.exp.edge + 1e-6)
          for (const c of h.o.obstacles) expect(Math.hypot(s.x - c.x, s.z - c.z)).toBeGreaterThan(c.r + TUNE.body - 0.02)
          const pd = Math.hypot(s.x - PEN.x, s.z - PEN.z)
          if (s.penned) expect(pd).toBeLessThan(PEN.r)
        }
      }
    }
  })

  it('on n’entre dans l’enclos que par l’ouverture', () => {
    const h = makeHerd({ ...LAYOUTS.easy, seed: 5 })
    // Un mouton derrière l'enclos, poussé droit dessus : il bute contre les piquets
    const back = { x: PEN.x - Math.sin(PEN.dir) * 2.4, z: PEN.z - Math.cos(PEN.dir) * 2.4 }
    spawn(h, 1, { clusters: 1 })
    h.sheep[0].x = back.x; h.sheep[0].z = back.z
    addDogs(h, 1)
    const d = h.dogs[0]
    d.x = back.x - Math.sin(PEN.dir) * 0.8; d.z = back.z - Math.cos(PEN.dir) * 0.8
    for (let t = 0; t < 6; t += 0.1) { d.tx = h.sheep[0].x - Math.sin(PEN.dir) * 0.7; d.tz = h.sheep[0].z - Math.cos(PEN.dir) * 0.7; stepHerd(h, 0.1) }
    expect(h.sheep[0].penned).toBe(false)
  })

  it('la chèvre est têtue, mais l’aboiement la fait détaler', () => {
    const h = makeHerd({ ...LAYOUTS.easy, seed: 7 })
    spawn(h, 1, { clusters: 1, goat: true })
    addDogs(h, 1)
    const g = h.sheep[0], d = h.dogs[0]
    expect(g.kind).toBe('goat')
    d.x = g.x + 2; d.z = g.z; d.tx = d.x; d.tz = d.z
    stepHerd(h, 0.5)
    expect(g.fear).toBe(0)
    bark(h, 0)
    const before = Math.hypot(g.x - d.x, g.z - d.z)
    stepHerd(h, 0.6)
    expect(Math.hypot(g.x - d.x, g.z - d.z)).toBeGreaterThan(before + 0.3)
  })

  it('le renard vient, et repart quand le chien approche', () => {
    const h = makeHerd({ ...LAYOUTS.exp, seed: 9 })
    spawn(h, 6, { clusters: 2 })
    addDogs(h, 1)
    addFox(h, 1)
    const ev: string[] = []
    for (let t = 0; t < 3; t += 0.1) for (const e of stepHerd(h, 0.1)) if (e.k === 'fox') ev.push(e.on ? 'in' : 'out')
    expect(ev).toContain('in')
    expect(h.fox!.state).toBe('in')
    // Le chien fonce sur lui
    for (let t = 0; t < 6 && h.fox!.state === 'in'; t += 0.1) { h.dogs[0].tx = h.fox!.x; h.dogs[0].tz = h.fox!.z; stepHerd(h, 0.1) }
    expect(h.fox!.state).not.toBe('in')
  })

  // Le pilote (le bot, la main) rentre chaque troupeau des trois niveaux, à plusieurs graines
  // (6 ici ; passer à 24 avant de toucher à TUNE : PIEGES.md, « le pilote qui cale »)
  const SEEDS = Array.from({ length: 6 }, (_, i) => i + 1)
  const CASES: [keyof typeof LAYOUTS, number, number, boolean, boolean, number][] = [
    ['easy', 6, 2, false, false, 75], ['med', 9, 3, true, false, 100], ['exp', 12, 3, true, true, 130]
  ]
  for (const [lvl, n, clusters, goat, fox, max] of CASES) {
    it(`le pilote rentre ${n} bêtes (${lvl})`, () => {
      const times: number[] = []
      for (const seed of SEEDS) {
        const h = makeHerd({ ...LAYOUTS[lvl], seed })
        spawn(h, n, { clusters, goat })
        addDogs(h, 1)
        if (fox) addFox(h, 12)
        times.push(herdWith(h, max))
      }
      expect(Math.max(...times)).toBeLessThan(max)
    })
  }
})
