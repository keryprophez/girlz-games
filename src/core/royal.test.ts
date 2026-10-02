import { describe, expect, it } from 'vitest'
import {
  BEADS_MAX, CLIPS_MAX, HAIR_LEN_MAX, NECKS, PARTS, PIECE_MAX, defaultRoyal, hasNecklace, moodFor, normalizePiece, normalizeRoyal,
  partsPresent, pieceSize, randomRoyal, royalKey, wearBeads, wearPendant, type Bead, type Piece
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

describe('le collier enfilé des Bijoux', () => {
  const fil: Bead[] = [{ k: 'pearl', c: '#F6EEF0' }, { k: 'heart', c: '#E8435F' }, { k: 'spacer', c: '#E2B657' }]
  it('n\'existe pas tant qu\'aucun collier n\'a été fait', () => {
    expect(defaultRoyal().beads).toEqual([])
    expect(normalizeRoyal({ neck: 'beads' }).neck).toBe(defaultRoyal().neck)
  })
  it('garde les perles valides dans l\'ordre du fil et jette les abîmées', () => {
    const r = normalizeRoyal({ neck: 'beads', beads: [fil[0], { k: 'caillou', c: '#000000' }, null, { k: 'star', c: 'jaune' }, fil[1]] })
    expect(r.neck).toBe('beads')
    expect(r.beads.map(b => b.k)).toEqual(['pearl', 'star', 'heart'])
    expect(r.beads[1].c).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
  it('ne dépasse pas la longueur du fil', () => {
    const long = Array.from({ length: BEADS_MAX + 30 }, () => ({ k: 'spacer', c: '#E2B657' }))
    expect(normalizeRoyal({ beads: long }).beads.length).toBe(BEADS_MAX)
  })
  it('le passe à son cou sans toucher à la princesse de départ, et un fil vide le retire', () => {
    const base = defaultRoyal()
    const before = royalKey(base)
    const r = wearBeads(base, fil)
    expect(r.neck).toBe('beads')
    expect(r.beads).toEqual(fil)
    expect(royalKey(base)).toBe(before)
    expect(normalizeRoyal(JSON.parse(royalKey(r)))).toEqual(r)
    const nu = wearBeads(r, [])
    expect(nu.beads).toEqual([])
    expect(nu.neck).toBe('none')
  })
  it('la surprise ne met le collier enfilé que s\'il existe', () => {
    const rnd = seeded(5)
    for (let i = 0; i < 200; i++) expect(NECKS).toContain(randomRoyal(defaultRoyal(), rnd).neck)
    const avec = wearBeads(defaultRoyal(), fil)
    const vus = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const r = randomRoyal(avec, rnd)
      vus.add(r.neck)
      expect(r.beads).toEqual(fil)
    }
    expect(vus.has('beads')).toBe(true)
  })
})

describe('le pendentif de perles à repasser', () => {
  const coeur: Piece = { rows: ['.RR.RR.', 'RRPRPRR', '.RRRRR.', '..RRR..', '...R...'] }
  const fil: Bead[] = [{ k: 'pearl', c: '#F6EEF0' }, { k: 'heart', c: '#E8435F' }]

  it('une vieille sauvegarde, sans pendentif, se relit sans que rien ne change', () => {
    // Une princesse gardée avant le 1/10 : pas de champ `pendant`
    const old = JSON.parse(royalKey(wearBeads(randomRoyal(defaultRoyal(), seeded(9)), fil))) as Record<string, unknown>
    delete old.pendant
    const r = normalizeRoyal(old)
    expect(r.pendant).toBe(null)
    expect(r).toEqual({ ...old, pendant: null })
    expect(normalizeRoyal({ ...old, pendant: 'un cœur' }).pendant).toBe(null)
  })

  it('garde une création valide, recadrée, et jette les abîmées', () => {
    expect(normalizePiece(coeur)).toEqual(coeur)
    expect(normalizePiece({ rows: ['.....', '..R..', '.PP..', '.....'] })).toEqual({ rows: ['.R', 'PP'] })
    expect(normalizePiece({ rows: ['RR', 'R'] })).toBe(null) // lignes de longueurs différentes
    expect(normalizePiece({ rows: ['RX'] })).toBe(null) // une couleur inconnue
    expect(normalizePiece({ rows: ['...', '...'] })).toBe(null) // pas une perle
    expect(normalizePiece({ rows: Array.from({ length: PIECE_MAX + 1 }, () => 'R') })).toBe(null)
    expect(normalizePiece(null)).toBe(null)
    expect(pieceSize(coeur)).toBe(20)
  })

  it('s\'accroche au collier sans toucher à la princesse de départ, et le collier le garde', () => {
    const base = wearBeads(defaultRoyal(), fil)
    const before = royalKey(base)
    const r = wearPendant(base, coeur)
    expect(r.pendant).toEqual(coeur)
    expect(r.neck).toBe('beads')
    expect(r.beads).toEqual(fil)
    expect(royalKey(base)).toBe(before)
    expect(normalizeRoyal(JSON.parse(royalKey(r)))).toEqual(r)
    // Un nouveau collier enfilé garde son pendentif au milieu
    expect(wearBeads(r, [fil[1]]).pendant).toEqual(coeur)
    // Décroché : le collier de perles reste
    const sans = wearPendant(r, null)
    expect(sans.pendant).toBe(null)
    expect(sans.neck).toBe('beads')
  })

  it('sans perles enfilées, un fil de soie le porte ; décroché, plus de collier', () => {
    const r = wearPendant(defaultRoyal(), coeur)
    expect(r.beads).toEqual([])
    expect(r.neck).toBe('beads')
    expect(hasNecklace(r)).toBe(true)
    expect(normalizeRoyal(JSON.parse(royalKey(r))).neck).toBe('beads')
    const nu = wearPendant(r, null)
    expect(nu.neck).toBe('none')
    expect(hasNecklace(nu)).toBe(false)
    expect(wearBeads(r, []).neck).toBe('beads') // le fil vide garde le pendentif
  })

  it('la surprise peut lui mettre son collier à pendentif', () => {
    const avec = wearPendant(defaultRoyal(), coeur)
    const rnd = seeded(13)
    const vus = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const r = randomRoyal(avec, rnd)
      vus.add(r.neck)
      expect(r.pendant).toEqual(coeur)
      expect(normalizeRoyal(r)).toEqual(r)
    }
    expect(vus.has('beads')).toBe(true)
  })
})
