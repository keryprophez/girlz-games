import { describe, expect, it } from 'vitest'
import { TAB, area, gridFor, makeCut, outlinePoints, pieceOutline, seeded, type P2 } from './jigsaw'

const near = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9

describe('makeCut', () => {
  it('met des bords droits autour et des tenons partout ailleurs', () => {
    const cut = makeCut(3, 4, seeded(7))
    for (let c = 0; c < 4; c++) { expect(cut.h[0][c].tab).toBe(0); expect(cut.h[3][c].tab).toBe(0) }
    for (let r = 0; r < 3; r++) { expect(cut.v[r][0].tab).toBe(0); expect(cut.v[r][4].tab).toBe(0) }
    for (let r = 1; r < 3; r++) for (let c = 0; c < 4; c++) expect(Math.abs(cut.h[r][c].tab)).toBe(1)
    for (let r = 0; r < 3; r++) for (let c = 1; c < 4; c++) expect(Math.abs(cut.v[r][c].tab)).toBe(1)
  })
  it('donne la même découpe pour la même graine', () => {
    expect(makeCut(4, 6, seeded(42))).toEqual(makeCut(4, 6, seeded(42)))
  })
})

describe('pieceOutline', () => {
  const cut = makeCut(6, 8, seeded(3))
  it('forme un contour fermé, courbe après courbe', () => {
    for (const [r, c] of [[0, 0], [2, 3], [5, 7]]) {
      const bs = pieceOutline(cut, r, c)
      for (let i = 0; i < bs.length; i++) expect(near(bs[i][3], bs[(i + 1) % bs.length][0])).toBe(true)
    }
  })
  it('fait que deux voisines s\'emboîtent exactement (même courbe, en sens inverse)', () => {
    // Une pièce du milieu : 3 courbes par côté, haut · droite · bas · gauche
    const a = pieceOutline(cut, 2, 3)
    const right = pieceOutline(cut, 2, 4)
    const below = pieceOutline(cut, 3, 3)
    const same = (xs: typeof a, ys: typeof a) => {
      expect(xs.length).toBe(ys.length)
      xs.forEach((b, i) => { const o = ys[ys.length - 1 - i]; for (let k = 0; k < 4; k++) expect(near(b[k], o[3 - k])).toBe(true) })
    }
    // Le côté droit de (2,3) est le côté gauche de (2,4), parcouru à l'envers
    same(a.slice(3, 6), right.slice(9, 12))
    // Son côté bas est le côté haut de (3,3)
    same(a.slice(6, 9), below.slice(0, 3))
    // Et ce qui est une bosse d'un côté est un creux de l'autre : même tracé
    const pa = outlinePoints(a.slice(3, 6), 10), pr = outlinePoints(right.slice(9, 12), 10)
    pa.forEach((p, i) => expect(near(p, pr[pr.length - 1 - i])).toBe(true))
  })
  it('pave tout le rectangle : la somme des aires vaut le nombre de cases', () => {
    let sum = 0
    for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) sum += Math.abs(area(outlinePoints(pieceOutline(cut, r, c), 24)))
    expect(sum).toBeCloseTo(48, 6)
  })
  it('a des tenons et des mortaises de vraie taille (ni plats, ni énormes)', () => {
    // Une pièce du milieu : chaque tenon ajoute, chaque mortaise retire la même aire
    const r = 2, c = 3
    const tabs = [cut.h[r][c].tab === -1, cut.v[r][c + 1].tab === 1, cut.h[r + 1][c].tab === 1, cut.v[r][c].tab === -1]
    const out = tabs.filter(Boolean).length
    const a = Math.abs(area(outlinePoints(pieceOutline(cut, r, c), 24)))
    const bump = (a - 1) / (out - (4 - out) || 1)
    if (out !== 2) {
      expect(Math.abs(bump)).toBeGreaterThan(TAB * 0.6)
      expect(Math.abs(bump)).toBeLessThan(TAB * 3)
    }
    // Le contour ne sort jamais de plus d'une tête de sa case
    for (const [x, y] of outlinePoints(pieceOutline(cut, r, c), 24)) {
      expect(x).toBeGreaterThan(c - 0.4); expect(x).toBeLessThan(c + 1.4)
      expect(y).toBeGreaterThan(r - 0.4); expect(y).toBeLessThan(r + 1.4)
    }
  })
})

describe('gridFor', () => {
  it('range 12, 24 et 48 pièces au format 4:3', () => {
    expect(gridFor(12)).toEqual({ rows: 3, cols: 4 })
    expect(gridFor(24)).toEqual({ rows: 4, cols: 6 })
    expect(gridFor(48)).toEqual({ rows: 6, cols: 8 })
  })
})
