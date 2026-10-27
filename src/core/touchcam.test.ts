import { describe, expect, it } from 'vitest'
import { Fingers, Spinner, coast, pairOf, turned, STILL_MS } from './touchcam'

const ev = (pointerId: number, clientX: number, clientY = 0, timeStamp = 0) => ({ pointerId, clientX, clientY, timeStamp })

describe('Fingers : chaque doigt par son pointerId', () => {
  it('un second doigt ne fait pas sauter le premier', () => {
    const f = new Fingers()
    f.down(ev(1, 100))
    f.down(ev(2, 600))
    expect(f.move(ev(1, 110))!.dx).toBe(10)
    expect(f.move(ev(2, 590))!.dx).toBe(-10)
    expect(f.move(ev(3, 0))).toBeNull()
  })
  it('compte ce que le doigt a bougé, garde ce que le jeu y range', () => {
    const f = new Fingers<{ kind: string }>()
    f.down(ev(1, 0, 0, 42), { kind: 'piece' })
    f.move(ev(1, 3, 4))
    const up = f.up(ev(1, 3, 4))!
    expect(up.moved).toBe(7)
    expect(up.kind).toBe('piece')
    expect(up.t0).toBe(42)
    expect(f.size).toBe(0)
    expect(f.up(ev(1, 0))).toBeNull()
  })
  it('deux doigts : tous deux « multi », et celui qui reste le reste', () => {
    const f = new Fingers()
    const a = f.down(ev(1, 0))
    expect(a.multi).toBe(false)
    const b = f.down(ev(2, 10))
    expect(a.multi && b.multi).toBe(true)
    f.up(ev(2, 10))
    expect(f.get(1)!.multi).toBe(true)
    // Tous levés : le doigt suivant repart seul
    f.up(ev(1, 0))
    expect(f.down(ev(3, 0)).multi).toBe(false)
  })
  it('pair : écart, angle, milieu', () => {
    const f = new Fingers()
    expect(f.pair()).toBeNull()
    f.down(ev(1, 0, 0)); f.down(ev(2, 30, 40))
    const p = f.pair()!
    expect(p.d).toBe(50)
    expect(p.m).toEqual({ x: 15, y: 20 })
    expect(p.ang).toBeCloseTo(Math.atan2(40, 30))
    expect(pairOf({ x: 0, y: 0 }, { x: 0, y: 2 }).ys).toEqual([0, 2])
  })
  it('turned : l\'angle le plus court', () => {
    expect(turned(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(-0.2)
    expect(turned(0.3, 0.1)).toBeCloseTo(0.2)
  })
})

describe('Spinner : tourner avec élan', () => {
  const s0 = () => ({ rot: 0, vRot: 0 })
  it('l\'élan se mesure en vrai (radians par seconde), lissé de moitié', () => {
    const sp = new Spinner({ max: 10, perPx: () => 0.01 })
    const s = s0()
    sp.start(s, 0)
    sp.turn(s, 10, 50) // 0,1 rad en 50 ms : 2 rad/s, lissé → 1
    expect(s.rot).toBeCloseTo(0.1)
    expect(s.vRot).toBeCloseTo(1)
  })
  it('borné, et le sens peut s\'inverser', () => {
    const sp = new Spinner({ max: 3, perPx: () => 0.01, sign: -1 })
    const s = s0()
    sp.start(s, 0)
    for (let t = 8; t <= 80; t += 8) sp.turn(s, 200, t)
    expect(s.vRot).toBe(-3)
    expect(s.rot).toBeCloseTo(-20)
  })
  it('deux événements dans la même image ne font pas une vitesse infinie (8 ms au moins)', () => {
    const sp = new Spinner({ max: 1000, perPx: () => 0.01 })
    const s = s0()
    sp.start(s, 100)
    sp.turn(s, 8, 100)
    expect(s.vRot).toBeCloseTo(0.08 / 0.008 * 0.5)
  })
  it('un doigt arrêté plus de 90 ms ne lance rien ; levé en glissant, il lance', () => {
    const sp = new Spinner({ max: 5, perPx: () => 0.01 })
    const s = s0()
    sp.start(s, 0); sp.turn(s, 20, 16)
    sp.release(s, 16 + STILL_MS + 1)
    expect(s.vRot).toBe(0)
    sp.start(s, 200); sp.turn(s, 20, 216)
    const v = s.vRot
    sp.release(s, 230)
    expect(s.vRot).toBe(v)
  })
  it('un doigt posé arrête ce qui tournait ; hold aussi', () => {
    const sp = new Spinner({ max: 5, perPx: () => 0.01 })
    const s = { rot: 0, vRot: 4 }
    sp.start(s, 0)
    expect(s.vRot).toBe(0)
    s.vRot = 2
    sp.hold(s, 10)
    expect(s.vRot).toBe(0)
    expect(sp.last).toBe(10)
  })
})

describe('coast : l\'élan file, puis s\'éteint', () => {
  it('il en reste `decay` au bout d\'une seconde', () => {
    const s = { rot: 0, vRot: 2 }
    for (let i = 0; i < 100; i++) coast(s, 0.01, 0.04)
    expect(s.vRot).toBeCloseTo(0.08)
    expect(s.rot).toBeGreaterThan(0.5)
  })
  it('sous le seuil, il s\'arrête net', () => {
    const s = { rot: 0, vRot: 0.02 }
    coast(s, 0.5, 0.004, 0.01)
    expect(s.vRot).toBe(0)
  })
})
