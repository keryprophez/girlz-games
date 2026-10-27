import { describe, expect, it } from 'vitest'
import { copyClay, freshPot, hollow, isBlank, MAX_H, MAX_R, MIN_R, packPot, PATH, preset, profilePath, raise, readPot, ROWS, shape, floorY, WALL } from './pottery'

describe('la terre du tour', () => {
  it('chaque forme de départ est tournable et a son nombre de rayons', () => {
    for (const p of ['motte', 'bol', 'vase', 'pot'] as const) {
      const c = preset(p)
      expect(c.r).toHaveLength(ROWS)
      expect(c.r.every(r => r >= MIN_R && r <= MAX_R)).toBe(true)
      expect(floorY(c)).toBeGreaterThan(0.04)
    }
    expect(preset('motte').depth).toBe(0)
    expect(preset('vase').h).toBeGreaterThan(preset('bol').h)
  })

  it('monter étire la terre, et elle s’affine', () => {
    const c = preset('motte'), r0 = c.r[10], h0 = c.h
    raise(c, 0.2)
    expect(c.h).toBeCloseTo(h0 + 0.2, 5)
    expect(c.r[10]).toBeLessThan(r0)
    raise(c, 5)
    expect(c.h).toBe(MAX_H)
  })

  it('sur le côté, le doigt évase ou resserre autour de lui seulement', () => {
    const c = preset('pot'), before = copyClay(c)
    shape(c, c.h * 0.5, 0.08)
    const mid = Math.round((ROWS - 1) * 0.5)
    expect(c.r[mid]).toBeGreaterThan(before.r[mid] + 0.04)
    expect(Math.abs(c.r[0] - before.r[0])).toBeLessThan(0.02)
    shape(c, c.h * 0.5, -1)
    expect(Math.min(...c.r)).toBeGreaterThanOrEqual(MIN_R)
  })

  it('creuser laisse toujours un fond et un goulot', () => {
    const c = preset('motte')
    hollow(c, 0.1)
    expect(c.depth).toBeCloseTo(0.1, 5)
    hollow(c, 9)
    expect(floorY(c)).toBeGreaterThanOrEqual(0.049)
    shape(c, c.h, -1)
    expect(c.r[ROWS - 1]).toBeGreaterThanOrEqual(WALL * 2)
  })

  it('le profil a toujours le même nombre de points, creux ou pas', () => {
    const a = profilePath(preset('motte')), b = profilePath(preset('vase'))
    expect(a.pts).toHaveLength(PATH)
    expect(b.pts).toHaveLength(PATH)
    expect(a.pts.every(([r, y]) => isFinite(r) && isFinite(y) && r > 0)).toBe(true)
    // Un vase est creux : son fond est bien plus bas que sa lèvre
    expect(b.pts[PATH - 1][1]).toBeLessThan(0.2)
    expect(a.pts[PATH - 1][1]).toBeGreaterThan(preset('motte').h * 0.9)
  })

  it('une pièce gardée se relit telle quelle, une abîmée est refusée', () => {
    const p = freshPot()
    p.clay = preset('vase')
    p.paint = [{ k: 'b', c: '#E8414F', w: 0.04, p: [0.1, 0.5, 0.6, 0.52, 1.3, 0.5] }, { k: 'd', c: '#4FB8E7', u: 0.2, v: 0.3, n: 8 }]
    p.glazed = true
    const back = readPot(JSON.parse(JSON.stringify(packPot(p))))!
    expect(back.glazed).toBe(true)
    expect(back.paint).toHaveLength(2)
    expect(back.clay.h).toBeCloseTo(p.clay.h, 3)
    expect(JSON.stringify(packPot(p)).length).toBeLessThan(1200)
    expect(readPot({ h: 1, d: 0, r: [1, 2] })).toBeNull()
    expect(readPot(null)).toBeNull()
    expect(readPot({ ...packPot(p), p: [{ k: 'b', c: 'rouge', w: 1, p: [0, 0] }] })!.paint).toHaveLength(0)
  })

  it('une motte jamais touchée est « vide »', () => {
    expect(isBlank(freshPot())).toBe(true)
    const p = freshPot(); raise(p.clay, 0.1)
    expect(isBlank(p)).toBe(false)
  })
})
