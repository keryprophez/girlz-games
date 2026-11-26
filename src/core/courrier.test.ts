/* @version 2026-11-26 09:42 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('./sfx', () => ({ sfx: () => {} }))
vi.mock('./music', () => ({ playMusic: () => {}, stopMusic: () => {} }))
import type { Lettre, Prefs, Texte, Vocal } from './courrier'
const C = await import('./courrier')
const { neuve, cacheter, timbrer, poster, ouvrir, reposer, garder, boite, drapeau, souvenirs, brouillon, aPoster, raccourci, apresEnvoi, aLire, vierge, pincer, borner, autre } = C

const ENV = { couleur: '#F58FB8', cachet: 'coeur', timbre: '' }
/** Une lettre de `de`, postée à `t`. */
const postee = (de: 'jade' | 'joyce', t: number): Lettre => poster(timbrer(cacheter(neuve(de, t), ENV), 'animal:duck'), t)
const texte = (t: string, y: number): Texte => ({ k: 'texte', t, x: 700, y, s: 1, r: 0, couleur: '#1C64C8', police: 'Fredoka', taille: 92 })

describe('les états d’une lettre', () => {
  it('brouillon → cachetée → postée → ouverte → gardée', () => {
    let l = neuve('jade', 1)
    expect([l.etat, l.de, l.a]).toEqual(['brouillon', 'jade', 'joyce'])
    l = cacheter(l, ENV); expect(l.etat).toBe('cachetee')
    l = timbrer(l, 'animal:duck'); expect(l.env?.timbre).toBe('animal:duck')
    l = poster(l, 5); expect([l.etat, l.postee]).toEqual(['postee', 5])
    l = ouvrir(l, 6); expect(l.etat).toBe('ouverte')
    l = garder(l); expect(l.etat).toBe('gardee')
  })
  it('les autres passages lèvent', () => {
    const b = neuve('jade', 1)
    expect(() => poster(b, 2)).toThrow()
    expect(() => poster(cacheter(b, ENV), 2)).toThrow() // sans timbre
    expect(() => cacheter(postee('jade', 2), ENV)).toThrow()
    expect(() => ouvrir(garder(ouvrir(postee('jade', 2), 3)), 4)).toThrow()
    expect(() => garder(postee('jade', 2))).toThrow()
    expect(() => reposer(postee('jade', 2), 3)).toThrow()
  })
  it('les fonctions ne touchent pas la lettre donnée', () => {
    const b = neuve('jade', 1)
    cacheter(b, ENV)
    expect(b.etat).toBe('brouillon')
  })
})

describe('la boîte', () => {
  const l = [
    garder(ouvrir(postee('joyce', 1), 2)),
    ouvrir(postee('joyce', 3), 9),
    postee('joyce', 7),
    postee('joyce', 4),
    postee('jade', 5),
    neuve('joyce', 6),
    cacheter(neuve('joyce', 8), ENV)
  ]
  it('les fermées d’abord, la plus ancienne en tête, puis les ouvertes ; rien d’autre', () => {
    expect(boite(l, 'jade').map(x => [x.etat, x.postee])).toEqual([['postee', 4], ['postee', 7], ['ouverte', 3]])
  })
  it('une ouverte reposée passe en fin de file', () => {
    const l2 = [ouvrir(postee('joyce', 1), 2), ouvrir(postee('joyce', 3), 4)]
    l2[0] = reposer(l2[0], 10)
    expect(boite(l2, 'jade').map(x => x.postee)).toEqual([3, 1])
  })
  it('le drapeau : levé tant qu’une fermée attend', () => {
    expect(drapeau(l, 'jade')).toBe(true)
    expect(drapeau([ouvrir(postee('joyce', 1), 2)], 'jade')).toBe(false)
    expect(drapeau(l, 'joyce')).toBe(true)
  })
  it('les souvenirs : les siennes, la plus récente d’abord', () => {
    const s = [garder(ouvrir(postee('joyce', 1), 2)), garder(ouvrir(postee('joyce', 5), 6)), garder(ouvrir(postee('jade', 3), 4))]
    expect(souvenirs(s, 'jade').map(x => x.postee)).toEqual([5, 1])
  })
  it('son brouillon, son enveloppe à poster', () => {
    expect(brouillon(l, 'joyce')?.cree).toBe(6)
    expect(aPoster(l, 'joyce')?.cree).toBe(8)
    expect(brouillon(l, 'jade')).toBeNull()
    expect(autre('jade')).toBe('joyce')
  })
})

describe('le raccourci', () => {
  it('à partir de la troisième lettre, la dernière enveloppe', () => {
    let p: Prefs = { envois: 0, env: null, faits: [] }
    expect(raccourci(p)).toBeNull()
    p = apresEnvoi(p, { ...ENV, timbre: 'animal:cat' })
    expect(raccourci(p)).toBeNull()
    p = apresEnvoi(p, { ...ENV, timbre: 'animal:pig' })
    expect(p.envois).toBe(2)
    expect(raccourci(p)).toEqual({ ...ENV, timbre: 'animal:pig' })
  })
})

describe('le texte à lire et la feuille vierge', () => {
  it('de haut en bas, sans émojis, les vides sautés', () => {
    const l = { ...neuve('joyce', 1), objets: [texte('Bisous 💗', 800), texte('  ', 500), texte('Coucou Jade !', 200)] }
    expect(aLire(l)).toBe('Coucou Jade !. Bisous')
  })
  it('vierge : des blancs seuls et rien de peint ; une voix, non', () => {
    const l = { ...neuve('joyce', 1), objets: [texte(' \n ', 300)] }
    expect(vierge(l, false)).toBe(true)
    expect(vierge(l, true)).toBe(false)
    const v: Vocal = { k: 'voix', x: 1, y: 1, s: 1, r: 0, audio: new Blob(['x']), pics: [1], duree: 1 }
    expect(vierge({ ...l, objets: [v] }, false)).toBe(false)
  })
})

describe('les doigts sur un objet', () => {
  const o = { x: 700, y: 500, s: 1, r: 0 }
  it('écartés deux fois plus : deux fois plus grand', () => {
    expect(pincer(o, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: -50, y: 0 }, { x: 150, y: 0 }).s).toBeCloseTo(2)
  })
  it('tournés d’un quart de tour, même à cheval sur ±π', () => {
    expect(pincer(o, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 100 }).r).toBeCloseTo(Math.PI / 2)
    const p = pincer({ ...o, r: 3 }, { x: 0, y: 0 }, { x: -100, y: 1 }, { x: 0, y: 0 }, { x: -100, y: -1 })
    expect(p.r).toBeCloseTo(3 + 0.02, 2)
  })
  it('la taille est bornée ; deux doigts au même point ne font pas de NaN', () => {
    expect(pincer(o, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, { x: 900, y: 0 }).s).toBe(5)
    expect(pincer(o, { x: 0, y: 0 }, { x: 900, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }).s).toBe(0.35)
    const z = pincer(o, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 })
    expect([z.x, z.y, z.s, z.r].every(Number.isFinite)).toBe(true)
  })
  it('borner garde le centre dans la feuille', () => {
    expect(borner({ x: -40, y: 2000, s: 1, r: 0 })).toEqual({ x: 10, y: 990, s: 1, r: 0 })
  })
})
