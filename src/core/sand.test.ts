import { describe, expect, it } from 'vitest'
import { CELL, clearSand, dig, heightAt, makeSand, moldHeight, MOLDS, MOLD_R, N, packSand, pat, pour, smoothAt, stamp, takeDirty, unpackSand } from './sand'

const total = (h: Float32Array) => h.reduce((a, b) => a + b, 0)

describe('le sable', () => {
  it('creuser fait un trou, et le sable retiré s’amoncelle autour', () => {
    const s = makeSand()
    const vol = dig(s, 0, 0)
    expect(vol).toBeGreaterThan(0)
    expect(heightAt(s, 0, 0)).toBeLessThan(-0.02)
    // Le bourrelet, à côté du trou
    expect(Math.max(heightAt(s, 0.12, 0), heightAt(s, 0, 0.12), heightAt(s, -0.12, 0))).toBeGreaterThan(0.003)
    // Rien ne se perd : le volume reste le même
    expect(Math.abs(total(s.h))).toBeLessThan(0.02)
  })

  it('les douves : un trait creusé ne se rebouche pas avec son propre sable', () => {
    const s = makeSand(), dug = new Uint8Array(N * N)
    for (let x = -0.5; x <= 0.5; x += 0.03) dig(s, x, 0, 0.07, 0.03, dug)
    for (const x of [-0.3, 0, 0.3]) expect(heightAt(s, x, 0)).toBeLessThan(-0.02)
    expect(heightAt(s, 0, 0.13)).toBeGreaterThan(0)
  })

  it('ne renvoie que la zone touchée', () => {
    const s = makeSand()
    takeDirty(s)
    dig(s, 0.5, 0.5)
    const d = takeDirty(s)!
    expect(d.i1 - d.i0).toBeLessThan(26)
    expect(d.j1 - d.j0).toBeLessThan(26)
    expect(takeDirty(s)).toBeNull()
  })

  it('chaque moule laisse sa forme, mouillée, posée sur le sable', () => {
    for (const m of MOLDS) {
      const s = makeSand()
      expect(moldHeight(m, 0, 0)).not.toBeNull()
      expect(moldHeight(m, MOLD_R[m] * 2, MOLD_R[m] * 2)).toBeNull()
      stamp(s, m, 0.2, -0.1)
      expect(heightAt(s, 0.2, -0.1)).toBeGreaterThan(0.05)
      const k = Math.round((-0.1 + 1.4) / CELL) * N + Math.round((0.2 + 1.4) / CELL)
      expect(s.wet[k]).toBeGreaterThan(0.5)
    }
    // Une tour sur une tour : elle se pose dessus
    const s = makeSand()
    stamp(s, 'tour', 0, 0); stamp(s, 'tour', 0, 0)
    expect(heightAt(s, 0, 0)).toBeGreaterThan(0.4)
  })

  it('lisser aplatit, tasser mouille', () => {
    const s = makeSand()
    stamp(s, 'etoile', 0, 0)
    const top = heightAt(s, 0, 0)
    for (let i = 0; i < 6; i++) smoothAt(s, 0, 0, 0.2, 0.8)
    expect(heightAt(s, 0, 0)).toBeLessThan(top)
    const t = makeSand()
    pat(t, 0.3, 0.3)
    expect(t.wet.some(w => w > 0.3)).toBe(true)
  })

  it('l’eau remplit le creux jusqu’à son niveau, et pas plus loin', () => {
    const s = makeSand(), dug = new Uint8Array(N * N)
    for (let x = -0.4; x <= 0.4; x += 0.03) dig(s, x, 0, 0.07, 0.04, dug)
    const wet = pour(s, 0, 0, 0.0015)
    expect(wet).toBeGreaterThan(20)
    const k = Math.round(1.4 / CELL) * N + Math.round(1.4 / CELL)
    expect(s.wl[k]).toBeGreaterThan(s.h[k])
    // Loin de la douve, c'est sec
    const far = Math.round(2.4 / CELL) * N + Math.round(2.4 / CELL)
    expect(s.wl[far]).toBeLessThan(s.h[far])
    // Le volume versé est bien là
    let vol = 0
    for (let c = 0; c < N * N; c++) if (s.wl[c] > s.h[c]) vol += (s.wl[c] - s.h[c]) * CELL * CELL
    expect(vol).toBeGreaterThan(0.0012)
    expect(vol).toBeLessThan(0.0018)
  })

  it('une plage gardée se relit (à 4 mm près), et tient en peu de place', () => {
    const s = makeSand()
    stamp(s, 'tour', 0, 0); stamp(s, 'tortue', 0.6, 0.4)
    for (let x = -0.6; x <= 0.6; x += 0.04) dig(s, x, 0.45, 0.07, 0.04)
    pour(s, 0, 0.45)
    const str = packSand(s)
    expect(str.length).toBeLessThan(12000)
    const b = unpackSand(str)!
    for (let c = 0; c < N * N; c += 97) {
      expect(Math.abs(b.h[c] - s.h[c])).toBeLessThan(0.0021)
      expect(b.wl[c] > b.h[c]).toBe(s.wl[c] > s.h[c] + 0.002 ? true : b.wl[c] > b.h[c])
    }
    expect(unpackSand('pas du tout ça')).toBeNull()
    expect(unpackSand(42)).toBeNull()
    clearSand(s)
    expect(packSand(s).length).toBeLessThan(800)
  })
})
