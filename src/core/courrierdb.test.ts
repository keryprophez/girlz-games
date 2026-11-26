/* @version 2026-11-26 11:15 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('./sfx', () => ({ sfx: () => {} }))
vi.mock('./music', () => ({ playMusic: () => {}, stopMusic: () => {} }))
const { coffreMemoire } = await import('./courrierdb')
const { neuve } = await import('./courrier')

describe('le coffre (en mémoire)', () => {
  it('une lettre relue est égale, et indépendante de celle rendue', async () => {
    const c = coffreMemoire()
    const l = { ...neuve('jade', 1), peinture: new Blob(['abc']) }
    expect(await c.garderLettre(l)).toBe(true)
    const [r] = await c.lettres()
    expect(r.id).toBe(l.id)
    expect(r.etat).toBe('brouillon')
    expect(await r.peinture?.text()).toBe('abc')
    r.etat = 'gardee'
    r.objets.push({ k: 'gomme', src: 'emoji:🐱', x: 1, y: 1, s: 1, r: 0 })
    const [r2] = await c.lettres()
    expect([r2.etat, r2.objets.length]).toEqual(['brouillon', 0])
  })
  it('réécrire une lettre la remplace', async () => {
    const c = coffreMemoire()
    const l = neuve('jade', 1)
    await c.garderLettre(l)
    await c.garderLettre({ ...l, papier: '#FFE0EC' })
    const ls = await c.lettres()
    expect(ls).toHaveLength(1)
    expect(ls[0].papier).toBe('#FFE0EC')
  })
  it('jeter n’ôte que celle-là', async () => {
    const c = coffreMemoire()
    const a = neuve('jade', 1), b = neuve('joyce', 2)
    await c.garderLettre(a); await c.garderLettre(b)
    expect(await c.jeterLettre(a.id)).toBe(true)
    expect((await c.lettres()).map(x => x.id)).toEqual([b.id])
  })
  it('une écriture refusée rend false et laisse l’ancien contenu', async () => {
    let refuser = false
    const c = coffreMemoire({ echec: () => refuser })
    const l = neuve('jade', 1)
    await c.garderLettre(l)
    refuser = true
    expect(await c.garderLettre({ ...l, papier: '#000000' })).toBe(false)
    expect(await c.jeterLettre(l.id)).toBe(false)
    expect(await c.garderPrefs('jade', { envois: 9, env: null, faits: [] })).toBe(false)
    refuser = false
    expect((await c.lettres())[0].papier).toBe(l.papier)
    expect((await c.prefs('jade')).envois).toBe(0)
  })
  it('les réglages : par défaut, puis gardés pour chacune', async () => {
    const c = coffreMemoire()
    expect(await c.prefs('joyce')).toEqual({ envois: 0, env: null, faits: [] })
    await c.garderPrefs('joyce', { envois: 2, env: { couleur: '#F58FB8', cachet: 'coeur', timbre: 'animal:duck' }, faits: ['plier'] })
    expect((await c.prefs('joyce')).envois).toBe(2)
    expect((await c.prefs('jade')).envois).toBe(0)
  })
})
