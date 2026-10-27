import { describe, expect, it } from 'vitest'
import { Race, soleilCfg, type SoleilEvent } from './soleil'
import { seeded } from './labyrinth'

/* 1, 2, 3… Soleil ! : la course jouée hors navigateur. Le « pilote » est
   celui du bot : il court pendant le compte et lève le doigt au coup
   `stopAt` (3 = au troisième coup, 2 = dès le deuxième). */

function race(tier: 0 | 1 | 2, level: number, seed: number, o: { stopAt?: number; greedy?: boolean; dt?: number } = {}) {
  const rnd = seeded(seed)
  const r = new Race(soleilCfg(tier, level, rnd), rnd)
  const stopAt = o.stopAt ?? 3
  const ev: SoleilEvent[] = []
  let t = 0
  while (!r.over && t < 300) {
    const dt = o.dt ?? 1 / 60
    t += dt
    r.setHold(o.greedy ? true : r.phase === 'feint' || (r.phase === 'count' && (r.beats < Math.floor(stopAt) - 1 || (r.beats === Math.floor(stopAt) - 1 && r.pt < r.dur * (stopAt % 1 || 1)))))
    ev.push(...r.step(dt))
  }
  return { r, ev, t, caught: ev.filter(e => e.t === 'caught' && e.who === 0).length }
}

describe('la course', () => {
  it('l\'épouvantail bat trois coups, se retourne, regarde, se remet de dos', () => {
    const rnd = seeded(1)
    const r = new Race({ ...soleilCfg(0, 0, rnd), feint: 0 }, rnd)
    const seen: string[] = []
    for (let i = 0; i < 60 * 8; i++) for (const e of r.step(1 / 60)) seen.push(e.t === 'beat' ? 'beat' + e.n : e.t)
    expect(seen.slice(0, 7)).toEqual(['beat1', 'beat2', 'beat3', 'turn', 'look', 'safe', 'back'])
  })
  it('prend celle qui court quand il regarde, et la fait reculer', () => {
    const { ev, r } = race(0, 0, 3, { greedy: true })
    expect(ev.some(e => e.t === 'caught' && e.who === 0)).toBe(true)
    expect(r.runners[0].x).toBeLessThanOrEqual(r.cfg.L)
  })
  it('le pilote du bot gagne ses courses sans se faire prendre (souvent)', () => {
    for (const tier of [0, 1, 2] as const) {
      let caught = 0, won = 0
      for (let s = 1; s <= 30; s++) {
        // Plus il se retourne vite, plus tôt on lève le doigt (avant le troisième coup)
        const res = race(tier, s % 5, s * 7, { stopAt: [3, 2.8, 2.5][tier] })
        caught += res.caught
        if (res.r.winner === 0) won++
      }
      expect(won, `niveau ${tier}`).toBeGreaterThan(18)
      expect(caught / 30, `niveau ${tier}`).toBeLessThan(0.5)
    }
  })
  it('à 4 images par seconde aussi (le bot sous la 3D logicielle)', () => {
    let won = 0
    for (let s = 1; s <= 20; s++) if (race(0, 0, s, { dt: 0.25 * 0.4 }).r.winner === 0) won++
    expect(won).toBeGreaterThan(14)
  })
  it('le cochon et le mouton se font prendre eux aussi', () => {
    let caught = 0
    for (let s = 1; s <= 20; s++) caught += race(1, 2, s).ev.filter(e => e.t === 'caught' && e.who > 0).length
    expect(caught).toBeGreaterThan(3)
  })
  it('s\'arrêter au dernier moment fait un « ouf »', () => {
    let ouf = 0
    for (let s = 1; s <= 20; s++) {
      // Elle lève le doigt pile au troisième coup, à la flamme (il se retourne vite)
      ouf += race(2, 0, s, { stopAt: 3 }).ev.filter(e => e.t === 'ouf').length
    }
    expect(ouf).toBeGreaterThan(0)
  })
  it('fait des feintes quand la rampe monte, jamais à la fleur au départ', () => {
    const count = (tier: 0 | 1 | 2, lv: number) => {
      let n = 0
      for (let s = 1; s <= 20; s++) n += race(tier, lv, s).ev.filter(e => e.t === 'feint').length
      return n
    }
    expect(count(0, 0)).toBe(0)
    expect(count(1, 4)).toBeGreaterThan(count(1, 0))
  })
  it('la boue fait glisser plus loin', () => {
    const cfg = soleilCfg(2, 0, seeded(2))
    const slide = (mud: boolean) => {
      const r = new Race({ ...cfg, ai: [], mud: mud ? [[0, 20]] : [], feint: 0 }, seeded(5))
      r.setHold(true)
      for (let i = 0; i < 40; i++) r.step(1 / 60)
      const x0 = r.runners[0].x
      r.setHold(false)
      for (let i = 0; i < 120; i++) r.step(1 / 60)
      return r.runners[0].x - x0
    }
    expect(slide(true)).toBeGreaterThan(slide(false) * 1.8)
  })
})
