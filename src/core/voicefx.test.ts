import { describe, it, expect } from 'vitest'
import { pitchShift, speed, reverse, vibrato, envelope, voiceOf, Phrase } from './voicefx'

const SR = 16000
const sine = (f: number, s: number, a = 0.5) => {
  const x = new Float32Array(Math.round(SR * s))
  for (let i = 0; i < x.length; i++) x[i] = a * Math.sin(2 * Math.PI * f * i / SR)
  return x
}
/** La fréquence par les passages à zéro (au milieu, loin des bords). */
const freq = (x: Float32Array) => {
  const a = Math.floor(x.length * 0.2), b = Math.floor(x.length * 0.8)
  let n = 0
  for (let i = a + 1; i < b; i++) if (x[i - 1] < 0 && x[i] >= 0) n++
  return n / ((b - a) / SR)
}

describe('la voix rigolote', () => {
  it('monte de cinq demi-tons sans changer de durée', () => {
    const x = sine(300, 1)
    const y = pitchShift(x, SR, Math.pow(2, 5 / 12))
    expect(y.length).toBe(x.length)
    expect(freq(y)).toBeGreaterThan(300 * Math.pow(2, 5 / 12) * 0.95)
    expect(freq(y)).toBeLessThan(300 * Math.pow(2, 5 / 12) * 1.05)
  })
  it('descend aussi (la vache)', () => {
    const y = pitchShift(sine(400, 1), SR, Math.pow(2, -6 / 12))
    expect(freq(y)).toBeGreaterThan(400 * Math.pow(2, -6 / 12) * 0.95)
    expect(freq(y)).toBeLessThan(400 * Math.pow(2, -6 / 12) * 1.05)
  })
  it('garde son volume (pas de trous entre les grains)', () => {
    const y = pitchShift(sine(300, 1), SR, 1.4)
    const env = envelope(y, SR, 20)
    const mid = Array.from(env.slice(3, env.length - 3))
    expect(Math.min(...mid)).toBeGreaterThan(0.7)
  })
  it('accéléré : deux fois plus court, deux fois plus aigu', () => {
    const y = speed(sine(250, 1), 2)
    expect(y.length).toBe(SR / 2)
    expect(freq(y)).toBeGreaterThan(480)
    expect(freq(y)).toBeLessThan(520)
  })
  it("à l'envers", () => {
    const x = new Float32Array([1, 2, 3, 4])
    expect(Array.from(reverse(x))).toEqual([4, 3, 2, 1])
  })
  it('chevrotante, sans déborder', () => {
    const y = vibrato(sine(300, 1), SR, 6, 1.2)
    expect(y.length).toBe(SR)
    expect(Math.max(...Array.from(y).map(Math.abs))).toBeLessThanOrEqual(0.51)
  })
  it('la voix finale est ramenée à un volume franc (un murmure est amplifié, huit fois au plus)', () => {
    const y = voiceOf(sine(300, 0.5, 0.2), SR, { pitch: 3, speed: 1 })
    expect(Math.max(...Array.from(y).map(Math.abs))).toBeGreaterThan(0.8)
  })
})

describe('le détecteur de phrase', () => {
  const feed = (p: Phrase, x: Float32Array) => {
    const evs = []
    for (let i = 0; i < x.length; i += 512) {
      const e = p.push(x.subarray(i, Math.min(x.length, i + 512)))
      if (e) evs.push(e)
    }
    return evs
  }
  const noise = (s: number, a = 0.002) => {
    const x = new Float32Array(Math.round(SR * s))
    let r = 1
    for (let i = 0; i < x.length; i++) { r = (r * 16807) % 2147483647; x[i] = a * (r / 2147483647 * 2 - 1) }
    return x
  }
  const cat = (...xs: Float32Array[]) => {
    const out = new Float32Array(xs.reduce((n, x) => n + x.length, 0))
    let at = 0
    for (const x of xs) { out.set(x, at); at += x.length }
    return out
  }

  it('entend une phrase et la rend quand on se tait, premier mot compris', () => {
    const p = new Phrase({ sr: SR })
    const evs = feed(p, cat(noise(1), sine(220, 1.2, 0.3), noise(1)))
    expect(evs.map(e => e.type)).toEqual(['start', 'end'])
    const end = evs[1] as { type: 'end'; samples: Float32Array }
    // La phrase (1,2 s) + jusqu'à une demi-seconde d'avant, sans le long silence d'après
    expect(end.samples.length / SR).toBeGreaterThan(1.2)
    expect(end.samples.length / SR).toBeLessThan(1.9)
  })
  it("ignore un claquement de mains", () => {
    const p = new Phrase({ sr: SR })
    const evs = feed(p, cat(noise(1), sine(1000, 0.08, 0.5), noise(1)))
    expect(evs.map(e => e.type)).toEqual(['start', 'drop'])
  })
  it('coupe une phrase trop longue', () => {
    const p = new Phrase({ sr: SR, maxLen: 2 })
    const evs = feed(p, cat(noise(0.5), sine(220, 4, 0.3)))
    expect(evs[1]?.type).toBe('end')
  })
  it("s'habitue au bruit de la pièce", () => {
    const p = new Phrase({ sr: SR })
    const evs = feed(p, noise(3, 0.01))
    expect(evs).toEqual([])
    expect(p.floor).toBeGreaterThan(0.004)
  })
})
