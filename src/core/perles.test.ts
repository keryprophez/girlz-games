import { describe, expect, it } from 'vitest'
import {
  ALL_MOTIFS, COLOR_LETTER, LARGE, LETTER, MEDIUM, PALETTE, PLATE_MARGIN, PLATE_MAX, PLATE_SHAPES, PLATE_SIZE, QUAD, SMALL,
  edgeDistance, insidePoly, isComplete, isGiven, makeRounds, missing, pegXY, pieceBeads, pieceHook, pieceOf, placeOnBoard,
  plateMask, plateOutline, sourceOf, transpose,
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

describe('les plaques à formes des Bijoux', () => {
  const at = (m: boolean[], n: number, c: number, r: number) => m[r * n + c]
  /** Les picots se touchent tous (une plaque d'un seul tenant, pas de picot perdu). */
  const connected = (m: boolean[], n: number) => {
    const start = m.findIndex(Boolean)
    const seen = new Set([start]), todo = [start]
    while (todo.length) {
      const i = todo.pop()!, c = i % n, r = Math.floor(i / n)
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const cc = c + dc, rr = r + dr, j = rr * n + cc
        if (cc >= 0 && cc < n && rr >= 0 && rr < n && m[j] && !seen.has(j)) { seen.add(j); todo.push(j) }
      }
    }
    return seen.size === m.filter(Boolean).length
  }

  it('chaque plaque est symétrique gauche-droite, d\'un seul tenant, et chaque picot a son rebord', () => {
    for (const s of PLATE_SHAPES) {
      const n = PLATE_SIZE[s], m = plateMask(s), poly = plateOutline(s)
      expect(n % 2, s).toBe(1)
      expect(n).toBeLessThanOrEqual(PLATE_MAX)
      expect(m.length, s).toBe(n * n)
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) expect(at(m, n, c, r), `${s} ${c},${r}`).toBe(at(m, n, n - 1 - c, r))
      expect(connected(m, n), s).toBe(true)
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        if (!at(m, n, c, r)) continue
        const [x, y] = pegXY(c, r, n)
        expect(insidePoly(poly, x, y), s).toBe(true)
        expect(edgeDistance(poly, x, y), s).toBeGreaterThanOrEqual(PLATE_MARGIN)
      }
      // Le contour ne déborde pas de beaucoup de la grille
      for (const [x, y] of poly) expect(Math.max(Math.abs(x), Math.abs(y)), s).toBeLessThan(n / 2 + 0.5)
    }
  })

  it('le carré est plein, le rond aussi de haut en bas, le cœur a ses deux bosses et sa pointe, l\'étoile ses cinq pointes', () => {
    expect(plateMask('carre').every(Boolean)).toBe(true)
    const n = 15, rond = plateMask('rond')
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) expect(at(rond, n, c, r)).toBe(at(rond, n, c, n - 1 - r))
    expect(rond.filter(Boolean).length).toBeGreaterThan(140)
    expect(at(rond, n, 0, 0)).toBe(false)
    // Le cœur : le creux du milieu en haut, entre deux bosses ; une seule perle à la pointe
    const coeur = plateMask('coeur')
    const top = coeur.findIndex(Boolean), r0 = Math.floor(top / n)
    expect(at(coeur, n, 7, r0)).toBe(false)
    expect(at(coeur, n, 3, r0)).toBe(true)
    const rows = Array.from({ length: n }, (_, r) => coeur.slice(r * n, r * n + n).filter(Boolean).length).filter(Boolean)
    expect(rows[rows.length - 1]).toBe(1)
    // L'étoile : une pointe en haut, deux sur les côtés, deux jambes séparées par un creux
    const ne = PLATE_SIZE.etoile, et = plateMask('etoile')
    const er = Array.from({ length: ne }, (_, r) => et.slice(r * ne, r * ne + ne))
    const first = er.findIndex(l => l.some(Boolean)), last = er.length - 1 - [...er].reverse().findIndex(l => l.some(Boolean))
    expect(er[first].filter(Boolean).length).toBe(1)
    expect(er.some(l => l.every(Boolean))).toBe(true)
    expect(er[last][(ne - 1) / 2]).toBe(false)
    expect(er[last].filter(Boolean).length).toBeGreaterThanOrEqual(2)
  })
})

describe('une création de perles à repasser', () => {
  it('se recadre sur ses perles, une lettre par couleur', () => {
    const n = 5
    const grid: (ColorId | null)[] = new Array(n * n).fill(null)
    grid[1 * n + 1] = 'rouge'; grid[1 * n + 3] = 'rose'; grid[3 * n + 2] = 'bleu'
    expect(pieceOf(grid, n)).toEqual(['R.P', '...', '.B.'])
    expect(pieceOf(new Array(n * n).fill(null), n)).toBe(null)
    for (const [c, l] of Object.entries(COLOR_LETTER)) expect(LETTER[l]).toBe(c)
  })

  it('ses perles sont centrées, y vers le haut', () => {
    const b = pieceBeads(['R.P', '.B.'])
    expect(b).toEqual([{ x: -1, y: 0.5, color: 'rouge' }, { x: 1, y: 0.5, color: 'rose' }, { x: 0, y: -0.5, color: 'bleu' }])
  })

  it('l\'anneau du pendentif passe au milieu (le creux d\'un cœur), sinon tout en haut', () => {
    // Un cœur : le creux du milieu est une rangée plus bas que les bosses
    expect(pieceHook(['.RR.RR.', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'])).toEqual({ x: 0, y: 1, above: 1 })
    // Un U : le milieu n'a qu'une perle tout en bas → on accroche en haut d'un bras
    const u = pieceHook(['R...R', 'R...R', 'R...R', 'RRRRR'])
    expect(u.y).toBe(1.5)
    expect(u.above).toBe(0)
    expect(Math.abs(u.x)).toBe(2)
  })
})
