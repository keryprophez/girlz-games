import { describe, it, expect } from 'vitest'
import { tonality, blowLevel, VOICED } from './souffle'

const SR = 48000
const N = 2048 // un morceau du micro (`core/mic.ts`)

/** Un générateur pseudo-aléatoire stable (les tests ne tremblent pas). */
const rng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }

/** Une voix d'enfant qui chante : une note et ses harmoniques, un vibrato, un peu de bruit. */
const voice = (f0: number, a = 0.3, noise = 0.02, seed = 3) => {
  const r = rng(seed), x = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const t = i / SR, f = f0 * (1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * t))
    let v = 0
    for (let h = 1; h <= 10; h++) v += Math.sin(2 * Math.PI * f * h * t + h) / (h * 1.3)
    x[i] = a * v * 0.5 + noise * (r() * 2 - 1)
  }
  return x
}
/** Un souffle dans le micro : du vent, un bruit filtré plus ou moins grave. */
const breath = (k: number, a = 1, seed = 7) => {
  const r = rng(seed), x = new Float32Array(N)
  let lp = 0, lp2 = 0
  for (let i = 0; i < N; i++) {
    const w = r() * 2 - 1
    lp += (w - lp) * k; lp2 += (lp - lp2) * k
    x[i] = a * (lp2 * 3 + w * 0.05)
  }
  return x
}
const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length)

describe('le souffle', () => {
  it('une voix qui chante a une note, aiguë ou grave', () => {
    for (const f0 of [180, 260, 340, 450, 620]) expect(tonality(voice(f0), SR)).toBeGreaterThan(0.8)
  })
  it('même noyée dans un peu de bruit', () => {
    expect(tonality(voice(300, 0.2, 0.08), SR)).toBeGreaterThan(VOICED + 0.1)
  })
  it('un souffle n’en a pas, du plus grave au plus clair', () => {
    for (const k of [0.02, 0.05, 0.1, 0.3, 0.9]) for (const seed of [1, 2, 3, 4, 5]) {
      expect(tonality(breath(k, 1, seed), SR)).toBeLessThan(VOICED - 0.1)
    }
  })
  it('un souffle fort souffle, une voix aussi forte ne souffle pas', () => {
    const b = breath(0.08, 0.5)
    const v = voice(300, 0.35)
    expect(rms(v)).toBeGreaterThan(0.1) // assez fort pour l'ancien seuil : elle éteignait les bougies
    expect(blowLevel(b, SR)).toBeGreaterThan(0.45)
    expect(blowLevel(v, SR)).toBe(0)
  })
  it('le silence et le bruit de la pièce ne soufflent pas', () => {
    expect(blowLevel(new Float32Array(N), SR)).toBe(0)
    expect(blowLevel(breath(0.3, 0.02), SR)).toBe(0)
  })
  it('à 44,1 kHz aussi (selon la tablette)', () => {
    const x = new Float32Array(N)
    for (let i = 0; i < N; i++) x[i] = 0.3 * (Math.sin(2 * Math.PI * 280 * i / 44100) + 0.5 * Math.sin(2 * Math.PI * 560 * i / 44100))
    expect(tonality(x, 44100)).toBeGreaterThan(0.8)
  })
})
