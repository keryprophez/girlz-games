import { describe, expect, it } from 'vitest'
import {
  ALL_MOTIFS, LARGE, LETTER, MEDIUM, PALETTE, QUAD, SMALL,
  isComplete, isGiven, makeRounds, missing, placeOnBoard, sourceOf, transpose,
  type ColorId, type Round
} from './perles'

const rev = (s: string) => [...s].reverse().join('')

describe('les dessins de perles', () => {
  it('chaque dessin est bien symétrique, de largeur paire, en couleurs connues', () => {
    for (const m of ALL_MOTIFS) {
      const w = m.rows[0].length
      expect(w % 2, m.id).toBe(0)
      for (const row of m.rows) {
        expect(row.length, `${m.id} : ${row}`).toBe(w)
        expect(row, `${m.id} : ligne non symétrique`).toBe(rev(row))
        for (const ch of row) if (ch !== '.') expect(LETTER[ch], `${m.id} : lettre ${ch}`).toBeDefined()
      }
      if (m.sym === 'vh') {
        expect(m.rows.length % 2, m.id).toBe(0)
        expect(m.rows, `${m.id} : pas symétrique de haut en bas`).toEqual([...m.rows].reverse())
      }
    }
  })

  it('chaque dessin tient sur la plaque de son niveau', () => {
    for (const m of SMALL) expect(Math.max(m.rows.length, m.rows[0].length), m.id).toBeLessThanOrEqual(8)
    for (const m of MEDIUM) expect(Math.max(m.rows.length, m.rows[0].length), m.id).toBeLessThanOrEqual(10)
    for (const m of [...LARGE, ...QUAD]) expect(Math.max(m.rows.length, m.rows[0].length), m.id).toBeLessThanOrEqual(12)
  })

  it('un dessin couché devient symétrique de haut en bas', () => {
    for (const m of ALL_MOTIFS.filter(x => x.turn)) {
      const t = transpose(m.rows)
      expect(t, m.id).toEqual([...t].reverse())
    }
  })

  it('toutes les couleurs de la palette ont un nom', () => {
    for (const [id, c] of Object.entries(PALETTE)) {
      expect(c.name.length, id).toBeGreaterThan(2)
      expect(c.hex, id).toBeGreaterThanOrEqual(0)
    }
  })
})

/** Un tirage reproductible. */
function seeded(seed: number) {
  let s = seed
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 }
}

function solved(rd: Round): (ColorId | null)[] {
  return rd.target.slice()
}

describe('les manches', () => {
  it('trois manches par niveau, sur la bonne plaque', () => {
    for (let k = 0; k < 40; k++) {
      const rng = seeded(k + 1)
      const easy = makeRounds('easy', rng), med = makeRounds('med', rng), exp = makeRounds('exp', rng)
      expect(easy.map(r => r.n)).toEqual([8, 8, 8])
      expect(med.map(r => r.n)).toEqual([10, 10, 10])
      expect(exp.map(r => r.axis)).toEqual(['v', 'h', 'vh'])
      expect(easy.every(r => r.side === 'left')).toBe(true)
      // Trois dessins différents dans une partie
      for (const rs of [easy, med, exp]) expect(new Set(rs.map(r => r.motif)).size).toBe(3)
      // Un pot de trop dès l'éclair, jamais plus de six pots
      for (const r of easy) expect(r.pots.length).toBe(r.colors.length)
      for (const r of [...med, ...exp]) {
        expect(r.pots.length).toBe(r.colors.length + 1)
        expect(r.pots.length).toBeLessThanOrEqual(6)
        for (const c of r.colors) expect(r.pots).toContain(c)
      }
    }
  })

  it('le dessin posé est le reflet de son modèle, par rapport à son axe', () => {
    for (let k = 0; k < 40; k++) {
      for (const rd of makeRounds('exp', seeded(100 + k)).concat(makeRounds('med', seeded(k)))) {
        for (let r = 0; r < rd.n; r++) for (let c = 0; c < rd.n; c++) {
          const [sc, sr] = sourceOf(rd, c, r)
          expect(isGiven(rd, sc, sr), `${rd.motif} ${rd.side} (${c},${r})`).toBe(true)
          expect(rd.target[r * rd.n + c], `${rd.motif} (${c},${r})`).toBe(rd.target[sr * rd.n + sc])
        }
      }
    }
  })

  it('il y a toujours un modèle à regarder et des perles à poser', () => {
    for (let k = 0; k < 40; k++) {
      for (const tier of ['easy', 'med', 'exp'] as const) {
        for (const rd of makeRounds(tier, seeded(7 * k + 3))) {
          const empty = new Array(rd.n * rd.n).fill(null)
          const given = rd.target.filter((c, i) => c && isGiven(rd, i % rd.n, Math.floor(i / rd.n))).length
          expect(given, rd.motif).toBeGreaterThan(4)
          expect(missing(rd, empty).need.length, rd.motif).toBeGreaterThan(4)
        }
      }
    }
  })

  it('complet seulement quand tout le reflet est juste, sans perle de trop', () => {
    const [rd] = makeRounds('easy', seeded(3))
    const state = solved(rd)
    expect(isComplete(rd, state)).toBe(true)
    // Une perle en trop sur une case vide du côté à compléter
    const i = rd.target.findIndex((c, k) => !c && !isGiven(rd, k % rd.n, Math.floor(k / rd.n)))
    state[i] = 'rouge'
    expect(isComplete(rd, state)).toBe(false)
    expect(missing(rd, state).wrong).toEqual([{ c: i % rd.n, r: Math.floor(i / rd.n) }])
    state[i] = null
    // Une mauvaise couleur
    const j = rd.target.findIndex((c, k) => c && !isGiven(rd, k % rd.n, Math.floor(k / rd.n)))
    state[j] = rd.target[j] === 'noir' ? 'blanc' : 'noir'
    const m = missing(rd, state)
    expect(m.wrong.length).toBe(1)
    expect(m.need.length).toBe(1)
  })

  it('un dessin plus petit que la plaque est centré sur l’axe', () => {
    // Deux lignes sur huit : posées aux lignes 3 et 4, colonnes 2 à 5
    const t = placeOnBoard(['.RR.', 'RRRR'], 8)
    expect(t[3 * 8 + 2]).toBe(null)
    expect(t[3 * 8 + 3]).toBe('rouge')
    expect(t[3 * 8 + 4]).toBe('rouge')
    expect(t[4 * 8 + 2]).toBe('rouge')
    expect(t[4 * 8 + 5]).toBe('rouge')
    expect(t.filter(Boolean).length).toBe(6)
  })
})
