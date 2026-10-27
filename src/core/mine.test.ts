import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `mine.ts` joue un son quand la poubelle s'arme : pas de son ici
vi.mock('./sfx', () => ({ sfx: () => undefined }))
const { mine, calm, twoTaps, WHO } = await import('./mine')

/** Un stockage en mémoire, comme `localStorage`. */
function memory() {
  const m = new Map<string, string>()
  return {
    m,
    s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) } }
  }
}

describe('mine : les clés de toujours', () => {
  it('celles d’avant le module, au caractère près (les créations de la tablette ne se perdent pas)', () => {
    const f = mine('construire'), c = mine('cartable'), n = mine('monuments')
    expect(f.key('jade')).toBe('ferme:construire:jade')
    expect(f.photoKey('joyce')).toBe('ferme:construire:photo:joyce')
    expect(f.lastKey).toBe('ferme:construire:qui')
    expect(c.key('joyce')).toBe('ferme:cartable:joyce')
    expect(c.photoKey('jade')).toBe('ferme:cartable:photo:jade')
    expect(c.lastKey).toBe('ferme:cartable:qui')
    expect(n.key('jade')).toBe('ferme:monuments:jade')
    expect(n.photoKey('jade', 'eiffel')).toBe('ferme:monuments:photo:jade:eiffel')
    expect(n.lastKey).toBe('ferme:monuments:qui')
  })
  it('les deux filles et leurs couleurs', () => {
    expect(WHO.map(w => [w.id, w.color])).toEqual([['jade', '#5EC97B'], ['joyce', '#B197FC']])
  })
})

describe('mine : garder, relire', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('relit ce qui est gardé ; rien ou illisible : null', () => {
    const { m, s } = memory()
    const b = mine('cartable', { storage: () => s })
    expect(b.read('jade')).toBeNull()
    m.set('ferme:cartable:jade', '{pas du json')
    expect(b.read('jade')).toBeNull()
    m.set('ferme:cartable:jade', '{"v":1}')
    expect(b.read('jade')).toEqual({ v: 1 })
  })
  it('garde après un délai, la dernière version seulement', () => {
    const { m, s } = memory()
    const b = mine('construire', { delay: 400, storage: () => s })
    b.save('jade', { n: 1 })
    b.save('jade', { n: 2 })
    vi.advanceTimersByTime(399)
    expect(m.has('ferme:construire:jade')).toBe(false)
    vi.advanceTimersByTime(1)
    expect(m.get('ferme:construire:jade')).toBe('{"n":2}')
  })
  it('flush écrit tout de suite (on quitte) ; une fonction est lue au moment d’écrire', () => {
    const { m, s } = memory()
    const b = mine('monuments', { storage: () => s })
    let n = 1
    b.save('joyce', () => ({ n }))
    n = 5
    b.flush()
    expect(m.get('ferme:monuments:joyce')).toBe('{"n":5}')
    vi.advanceTimersByTime(1000)
    expect(m.get('ferme:monuments:joyce')).toBe('{"n":5}')
  })
  it('l’autre fille en attente part d’abord (on vient de changer)', () => {
    const { m, s } = memory()
    const b = mine('cartable', { storage: () => s })
    b.save('jade', 'a')
    b.save('joyce', 'b')
    expect(m.get('ferme:cartable:jade')).toBe('"a"')
    vi.advanceTimersByTime(300)
    expect(m.get('ferme:cartable:joyce')).toBe('"b"')
  })
  it('write tout de suite annule l’attente de cette fille ; drop l’oublie', () => {
    const { m, s } = memory()
    const b = mine('cartable', { storage: () => s })
    b.save('jade', 'vieux')
    b.write('jade', 'neuf')
    vi.advanceTimersByTime(1000)
    expect(m.get('ferme:cartable:jade')).toBe('"neuf"')
    b.save('jade', 'effacé')
    b.drop('jade')
    vi.advanceTimersByTime(1000)
    expect(m.get('ferme:cartable:jade')).toBe('"neuf"')
  })
  it('photo, dernière choisie ; un stockage plein ne casse rien', () => {
    const { s } = memory()
    const b = mine('monuments', { storage: () => s })
    b.setPhoto('jade', 'data:x', 'taj')
    expect(b.photo('jade', 'taj')).toBe('data:x')
    expect(b.photo('jade')).toBeNull()
    b.dropPhoto('jade', 'taj')
    expect(b.photo('jade', 'taj')).toBeNull()
    expect(b.last()).toBeNull()
    b.setLast('joyce')
    expect(b.last()).toBe('joyce')
    const full = mine('cartable', { storage: () => ({ ...s, setItem: () => { throw new Error('plein') } }) })
    expect(() => { full.write('jade', 1); full.setPhoto('jade', 'x'); full.setLast('jade') }).not.toThrow()
  })
})

describe('twoTaps : la poubelle à deux touchers', () => {
  const fakeCtx = () => {
    const timers = new Map<number, () => void>()
    let n = 0
    return { timers, ctx: { after: (_ms: number, fn: () => void) => { timers.set(++n, fn); return n }, cancel: (id: number) => { timers.delete(id) } } }
  }
  const btn = () => { const cls = new Set<string>(); return { cls, el: { classList: { add: (c: string) => cls.add(c), remove: (c: string) => cls.delete(c) } } as unknown as HTMLElement } }
  it('le premier toucher arme, le second efface', () => {
    const { ctx } = fakeCtx(), b = btn()
    let wiped = 0
    const t = twoTaps(b.el, ctx, () => wiped++)
    t.tap()
    expect(t.armed && b.cls.has('arm')).toBe(true)
    expect(wiped).toBe(0)
    t.tap()
    expect(wiped).toBe(1)
    expect(t.armed || b.cls.has('arm')).toBe(false)
  })
  it('elle se désarme seule, ou par un toucher ailleurs', () => {
    const { ctx, timers } = fakeCtx(), b = btn()
    let wiped = 0
    const t = twoTaps(b.el, ctx, () => wiped++)
    t.tap()
    ;[...timers.values()][0]()
    expect(t.armed).toBe(false)
    t.tap(); t.disarm(); t.tap()
    expect(wiped).toBe(0)
    expect(t.armed).toBe(true)
  })
})

describe('calm : le second toucher d’un double toucher', () => {
  it('ignoré juste après un changement d’écran, plus après', () => {
    let now = 1000
    const q = calm(450, () => now)
    expect(q.quiet()).toBe(false)
    q.mark()
    now += 300
    expect(q.quiet()).toBe(true)
    now += 200
    expect(q.quiet()).toBe(false)
  })
})
