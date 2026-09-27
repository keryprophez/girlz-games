import { describe, expect, it } from 'vitest'
import {
  CLIPS_MAX, HAIR_LEN_MAX, PARTS, defaultRoyal, moodFor, normalizeRoyal, partsPresent, randomRoyal, royalKey
} from './royal'

/** Un hasard reproductible pour les tests. */
function seeded(s: number) {
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
}

describe('normalizeRoyal', () => {
  it('rend la princesse par défaut pour une valeur absente ou abîmée', () => {
    expect(normalizeRoyal(undefined)).toEqual(defaultRoyal())
    expect(normalizeRoyal('robe')).toEqual(defaultRoyal())
    expect(normalizeRoyal({ skirt: 'pantalon', skin: 'rouge', hair: { len: 99, curl: -3 } })).toMatchObject({
      skirt: 'ball', skin: defaultRoyal().skin, hair: { len: HAIR_LEN_MAX, curl: 0 }
    })
  })
  it('garde ce qui est valide et complète les peintures manquantes', () => {
    const r = normalizeRoyal({ skirt: 'mermaid', paint: { skirt: { c: '#123456', p: 'hearts' } } })
    expect(r.skirt).toBe('mermaid')
    expect(r.paint.skirt).toEqual({ c: '#123456', p: 'hearts' })
    for (const k of PARTS) expect(r.paint[k]).toBeDefined()
  })
  it('limite les barrettes et jette celles qui sont abîmées', () => {
    const clips = Array.from({ length: 12 }, (_, i) => ({ az: i * 0.1, th: 0.5, k: 'star', c: '#FFFFFF' }))
    const r = normalizeRoyal({ hair: { clips: [...clips, { az: 'x' }, null] } })
    expect(r.hair.clips.length).toBeLessThanOrEqual(CLIPS_MAX)
    expect(r.hair.clips.every(c => typeof c.az === 'number')).toBe(true)
  })
  it('relit sa propre sortie à l\'identique', () => {
    const r = randomRoyal(defaultRoyal(), seeded(7))
    expect(normalizeRoyal(JSON.parse(royalKey(r)))).toEqual(r)
  })
})

describe('randomRoyal', () => {
  it('ne touche pas à la princesse de départ et reste valide', () => {
    const base = defaultRoyal()
    const before = royalKey(base)
    const rnd = seeded(3)
    for (let i = 0; i < 200; i++) {
      const r = randomRoyal(base, rnd)
      expect(normalizeRoyal(r)).toEqual(r)
    }
    expect(royalKey(base)).toBe(before)
  })
  it('ne pose une traîne que sous une robe longue', () => {
    const rnd = seeded(11)
    for (let i = 0; i < 300; i++) {
      const r = randomRoyal(defaultRoyal(), rnd)
      if (r.train) expect(['ball', 'mermaid']).toContain(r.skirt)
    }
  })
})

describe('partsPresent et moodFor', () => {
  it('ne propose pas de teindre ce qui n\'est pas porté', () => {
    const r = defaultRoyal()
    r.top = 'bustier'; r.cape = 'none'; r.wings = 'none'; r.pet = 'none'
    const p = partsPresent(r)
    expect(p).not.toContain('sleeves')
    expect(p).not.toContain('cape')
    expect(p).not.toContain('pbody')
    r.pet = 'unicorn'; r.wings = 'fairy'
    expect(partsPresent(r)).toEqual(expect.arrayContaining(['pbody', 'pmane', 'wings']))
  })
  it('fait pouffer avec des lunettes rigolotes et émerveille avec une couronne', () => {
    expect(moodFor('glasses', 'hearts')).toBe('funny')
    expect(moodFor('crown', 'tiara')).toBe('wow')
    expect(['joy', 'love']).toContain(moodFor('skirt', 'short', seeded(1)))
  })
})
