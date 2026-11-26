/* @version 2026-11-26 16:58 */
import { describe, expect, it, vi } from 'vitest'
import type { Coffre } from './courrierdb'
import type { Lettre, Vocal } from './courrier'
import { fichiersDe, lireLettre, lirePrefs, rang, type LettreFil, type PrefsFil } from './courrierfil'

vi.mock('./sfx', () => ({ sfx: () => {} }))
vi.mock('./music', () => ({ playMusic: () => {}, stopMusic: () => {} }))
const { coffreMemoire } = await import('./courrierdb')
const { coffreEnLigne, MARQUE } = await import('./courrierenligne')
const { neuve, cacheter, timbrer, poster, reposer } = await import('./courrier')

/* Un FAUX SERVEUR en mémoire qui suit le contrat de worker/courrier.ts (et
   valide avec le même fil) : on y voit chaque appel, et on le fait tomber. */
type Panne = null | 'reseau' | '401' | 'muet'
function fauxServeur() {
  const lettres = new Map<string, LettreFil & { jetee?: boolean }>()
  const fichiers = new Map<string, Blob>()
  const reglages = new Map<string, PrefsFil>()
  const appels: string[] = []
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })
  const s = {
    lettres, fichiers, reglages, appels,
    panne: null as Panne,
    /** Les fichiers qui ne viennent pas (500). */
    echecFichier: new Set<string>(),
    /** Un appel qui tombe (500), une fois ou plus. */
    casse: (_appel: string) => false,
    async fetch(chemin: string, init: RequestInit = {}): Promise<Response> {
      const m = init.method ?? 'GET', reste = chemin.slice('/api/courrier/'.length), appel = `${m} ${reste}`
      appels.push(appel)
      if (s.panne === 'reseau') throw new TypeError('Failed to fetch')
      if (s.panne === '401') return new Response('Accès réservé', { status: 401 })
      if (s.panne === 'muet') return new Promise<Response>(() => {})
      if (s.casse(appel)) return new Response(null, { status: 500 })
      const p = reste.split('/')
      if (p[0] === 'lettres' && p.length === 1) return json({ lettres: [...lettres.values()].filter(l => !l.jetee).map(({ jetee: _, ...l }) => l) })
      if (p[0] === 'lettres' && p.length === 2 && m === 'PUT') {
        const l = lireLettre(JSON.parse(String(init.body)), p[1])
        if (!l) return new Response(null, { status: 400 })
        const avant = lettres.get(l.id)
        if (avant?.jetee) return json({ refus: 'jetee' }, 409)
        if (avant && (avant.de !== l.de || l.version <= avant.version || rang(l.etat) < rang(avant.etat))) return json({ refus: 'version' }, 409)
        if (!fichiersDe(l).every(k => fichiers.has(k))) return json({ refus: 'fichier' }, 422)
        lettres.set(l.id, l)
        return json({ version: l.version })
      }
      if (p[0] === 'lettres' && p[2] === 'jeter' && m === 'POST') {
        const l = lettres.get(p[1])
        if (!l) return new Response(null, { status: 404 })
        l.jetee = true
        return json({ ok: true })
      }
      if (p[0] === 'fichiers') {
        const cle = p.slice(1).join('/')
        if (m === 'PUT') {
          const l = lettres.get(p[2])
          if (l && (l.jetee || l.etat !== 'brouillon')) return json({ refus: 'fige' }, 409)
          fichiers.set(cle, new Blob([init.body as Blob], { type: new Headers(init.headers).get('content-type') ?? '' }))
          return json({ ok: true })
        }
        if (s.echecFichier.has(cle)) return new Response(null, { status: 500 })
        const b = fichiers.get(cle)
        return b ? new Response(b, { headers: { 'content-type': b.type } }) : new Response(null, { status: 404 })
      }
      if (p[0] === 'reglages') {
        if (m === 'GET') return json({ prefs: reglages.get(p[1]) ?? null })
        const pr = lirePrefs(JSON.parse(String(init.body)))
        if (!pr) return new Response(null, { status: 400 })
        reglages.set(p[1], pr)
        return json({ ok: true })
      }
      return new Response(null, { status: 404 })
    }
  }
  return s
}
type Serveur = ReturnType<typeof fauxServeur>

const marque = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } }
}
function monter(o: { local?: Coffre; delai?: number; migre?: boolean } = {}) {
  const s = fauxServeur(), local = o.local ?? coffreMemoire(), mq = marque()
  if (o.migre !== false) mq.setItem(MARQUE, '1')
  return { s, local, mq, c: coffreEnLigne(local, { fetch: (ch, init) => s.fetch(ch, init), marque: mq, delai: o.delai ?? 1000 }) }
}
const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })
const son = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' })
const voix = (audio = son()): Vocal => ({ k: 'voix', x: 10, y: 10, s: 1, r: 0, audio, pics: [0.4], duree: 2 })
const ENV = { couleur: '#F58FB8', cachet: 'coeur', timbre: '' }
const ENVF = { ...ENV, timbre: 'animal:duck' }
const plein = (de: 'jade' | 'joyce' = 'jade', t = 1000): Lettre => ({ ...neuve(de, t), peinture: png(), objets: [voix()] })
const posesDeFichiers = (s: Serveur) => s.appels.filter(a => a.startsWith('PUT fichiers/'))
const fil = (id: string, plus: Partial<LettreFil> = {}): LettreFil => ({
  id, de: 'joyce', a: 'jade', etat: 'brouillon', cree: 1, postee: 0, tour: 0, papier: '#FFFDF8', env: null, objets: [], peinture: null, version: 1, ...plus
})
/** Une lettre déjà en ligne, avec son dessin et une voix. */
function semer(s: Serveur, id: string, plus: Partial<LettreFil> = {}) {
  const p = `lettres/${id}/peinture.png`, v = `lettres/${id}/voix-abc.webm`
  s.fichiers.set(p, png())
  s.fichiers.set(v, son())
  s.lettres.set(id, fil(id, { peinture: p, objets: [{ k: 'voix', cle: v, pics: [0.4], duree: 2, x: 1, y: 1, s: 1, r: 0 }], ...plus }))
  return { p, v }
}
const RECUE = { etat: 'postee' as const, env: ENVF, postee: 5, tour: 5 }

describe('le coffre en ligne : garder', () => {
  it('un brouillon « ici » ne sort pas de l’appareil ; sa version monte', async () => {
    const { s, local, c } = monter()
    const l = plein()
    expect(await c.garderLettre(l, { ici: true })).toBe(true)
    expect(await c.garderLettre(l, { ici: true })).toBe(true)
    expect(s.appels).toEqual([])
    expect((await local.lettres())[0].version).toBe(2)
  })
  it('un brouillon poussé : les fichiers avant la lettre, et gardé aussi sur l’appareil', async () => {
    const { s, local, c } = monter()
    const l = plein()
    expect(await c.garderLettre(l)).toBe(true)
    expect(s.appels).toHaveLength(3)
    expect(s.appels.slice(0, 2).every(a => a.startsWith('PUT fichiers/'))).toBe(true)
    expect(s.appels[2]).toBe(`PUT lettres/${l.id}`)
    const f = s.lettres.get(l.id)!
    expect(f.peinture).toBe(`lettres/${l.id}/peinture.png`)
    expect(fichiersDe(f).every(k => s.fichiers.has(k))).toBe(true)
    expect((await local.lettres()).map(x => x.id)).toEqual([l.id])
  })
  it('deux écritures de suite : chaque fichier une fois, la deuxième acceptée', async () => {
    const { s, c } = monter()
    const l = plein()
    expect(await c.garderLettre(l)).toBe(true)
    expect(await c.garderLettre(cacheter(l, ENV))).toBe(true)
    expect(posesDeFichiers(s)).toHaveLength(2)
    expect(s.appels.filter(a => a.startsWith('PUT lettres/'))).toHaveLength(2)
    expect(s.lettres.get(l.id)!.etat).toBe('cachetee')
  })
  it('une lettre en ligne réussie ôte la copie locale ; ratée, elle n’annonce rien', async () => {
    const { s, local, c } = monter()
    const l = plein()
    await c.garderLettre(l, { ici: true })
    s.casse = a => a.startsWith('PUT lettres/')
    expect(await c.garderLettre(cacheter(l, ENV))).toBe(false)
    expect(await local.lettres()).toHaveLength(1)
    s.casse = () => false
    expect(await c.garderLettre(cacheter(l, ENV))).toBe(true)
    expect(await local.lettres()).toHaveLength(0)
  })
  it('garder un brouillon encore à charger : false, rien d’écrit', async () => {
    const { s, local, c } = monter()
    semer(s, 'c-4')
    const [x] = await c.lettres()
    s.appels.length = 0
    expect(await c.garderLettre(x)).toBe(false)
    expect(await c.garderLettre(x, { ici: true })).toBe(false)
    expect(s.appels).toEqual([])
    expect(await local.lettres()).toEqual([])
  })
})

describe('le coffre en ligne : la liste', () => {
  it('sans fichiers, clés gardées, à charger', async () => {
    const { s, c } = monter()
    const { p, v } = semer(s, 'p-1', RECUE)
    const [x] = await c.lettres()
    expect(c.horsLigne()).toBe(false)
    expect([x.id, x.etat, x.aCharger, x.peinture, x.peintureCle, x.version]).toEqual(['p-1', 'postee', true, null, p, 1])
    const vx = x.objets[0] as Vocal
    expect([vx.cle, vx.audio.size]).toEqual([v, 0])
  })
  it('brouillon local plus récent : il gagne ; contre une lettre cachetée : il perd et disparaît', async () => {
    const { s, local, c } = monter()
    const a: Lettre = { ...neuve('jade', 1), version: 5, papier: '#FFE0EC' }
    const b: Lettre = { ...neuve('jade', 2), version: 9 }
    await local.garderLettre(a)
    await local.garderLettre(b)
    s.lettres.set(a.id, fil(a.id, { de: 'jade', a: 'joyce', version: 3 }))
    s.lettres.set(b.id, fil(b.id, { de: 'jade', a: 'joyce', version: 4, etat: 'cachetee', env: ENV }))
    const ls = await c.lettres()
    expect(ls.find(x => x.id === a.id)?.papier).toBe('#FFE0EC')
    expect(ls.find(x => x.id === b.id)?.etat).toBe('cachetee')
    expect((await local.lettres()).map(x => x.id)).toEqual([a.id])
    await c.garderLettre(b)
    expect(s.lettres.get(b.id)!.etat).toBe('cachetee')
  })
  it('un brouillon local qui n’est pas en ligne s’ajoute', async () => {
    const { local, c } = monter()
    const a = plein()
    await local.garderLettre(a)
    expect((await c.lettres()).map(x => x.id)).toEqual([a.id])
  })
  it('sans réseau, ou le code expiré : le nuage, les brouillons locaux, rien d’annoncé', async () => {
    for (const panne of ['reseau', '401'] as const) {
      const { s, local, c } = monter()
      const d = neuve('jade', 1)
      await local.garderLettre(d)
      await local.garderLettre({ ...neuve('joyce', 2), etat: 'gardee' })
      s.panne = panne
      const ls = await c.lettres()
      expect(c.horsLigne()).toBe(true)
      expect(ls.map(x => x.id)).toEqual([d.id])
      expect(await c.garderLettre(cacheter(d, ENV))).toBe(false)
      expect(await c.jeterLettre(d.id)).toBe(false)
      s.panne = null
      await c.lettres()
      expect(c.horsLigne()).toBe(false)
    }
  })
  it('un serveur muet : tout abandonne au délai', async () => {
    const { s, c } = monter({ delai: 50 })
    s.panne = 'muet'
    const t0 = Date.now()
    expect(await c.lettres()).toEqual([])
    expect(c.horsLigne()).toBe(true)
    expect(await c.garderLettre(cacheter(neuve('jade', 1), ENV))).toBe(false)
    expect(await c.completer({ ...neuve('joyce', 1), etat: 'postee', aCharger: true, peintureCle: 'lettres/x/peinture.png' })).not.toBeNull()
    expect(Date.now() - t0).toBeLessThan(1500)
  })
  it('jeter : la lettre quitte la liste', async () => {
    const { s, c } = monter()
    semer(s, 'j-1', { ...RECUE, etat: 'gardee' })
    expect(await c.lettres()).toHaveLength(1)
    expect(await c.jeterLettre('j-1')).toBe(true)
    expect(await c.lettres()).toHaveLength(0)
  })
})

describe('le coffre en ligne : compléter', () => {
  it('les fichiers arrivent ; une lettre complète est rendue telle quelle', async () => {
    const { s, c } = monter()
    semer(s, 'c-1', RECUE)
    const [x] = await c.lettres()
    const y = (await c.completer(x))!
    expect(y.aCharger).toBeUndefined()
    expect([...new Uint8Array(await y.peinture!.arrayBuffer())]).toEqual([137, 80, 78, 71])
    expect((y.objets[0] as Vocal).audio.size).toBe(3)
    expect(await c.completer(y)).toBe(y)
  })
  it('un dessin et une voix qui ne viennent pas : la lettre s’ouvre sans eux, et la reposer garde leurs clés sans rien envoyer', async () => {
    const { s, c } = monter()
    const { p, v } = semer(s, 'c-2', { ...RECUE, etat: 'ouverte' })
    s.echecFichier.add(p)
    s.echecFichier.add(v)
    const [x] = await c.lettres()
    const y = (await c.completer(x))!
    expect(y.peinture).toBeNull()
    const vy = y.objets[0] as Vocal
    expect([vy.audio.size, vy.cle]).toEqual([0, v])
    s.appels.length = 0
    expect(await c.garderLettre(reposer(y, 99))).toBe(true)
    expect(posesDeFichiers(s)).toEqual([])
    const f = s.lettres.get('c-2')!
    expect(f.peinture).toBe(p)
    expect(f.objets[0]).toMatchObject({ cle: v })
  })
  it('un brouillon dont le dessin ne vient pas : null', async () => {
    const { s, c } = monter()
    const { p } = semer(s, 'c-3', { de: 'jade', a: 'joyce' })
    s.echecFichier.add(p)
    const [x] = await c.lettres()
    expect(await c.completer(x)).toBeNull()
  })
})

describe('le coffre en ligne : la migration', () => {
  it('les lettres et réglages locaux partent, la marque se pose, la base locale reste', async () => {
    const local = coffreMemoire()
    const a = poster(timbrer(cacheter(plein('joyce', 5), ENV), 'animal:duck'), 6)
    await local.garderLettre(a)
    await local.garderPrefs('joyce', { envois: 3, env: ENVF, faits: ['plier'] })
    const { s, c, mq } = monter({ local, migre: false })
    const ls = await c.lettres()
    expect(s.lettres.get(a.id)?.etat).toBe('postee')
    expect(posesDeFichiers(s)).toHaveLength(2)
    expect(s.reglages.get('joyce')?.envois).toBe(3)
    expect(s.reglages.has('jade')).toBe(false)
    expect(mq.getItem(MARQUE)).toBe('1')
    expect(ls.find(x => x.id === a.id)?.etat).toBe('postee')
    expect(await local.lettres()).toHaveLength(1)
  })
  it('interrompue : pas de marque, la suite la fois d’après, sans double', async () => {
    const local = coffreMemoire()
    const a = poster(timbrer(cacheter(neuve('jade', 1), ENV), 'animal:duck'), 2)
    const b = poster(timbrer(cacheter(neuve('joyce', 3), ENV), 'animal:duck'), 4)
    await local.garderLettre(a)
    await local.garderLettre(b)
    const { s, c, mq } = monter({ local, migre: false })
    s.casse = x => x === `PUT lettres/${b.id}`
    await c.lettres()
    expect(mq.getItem(MARQUE)).toBeNull()
    expect([s.lettres.has(a.id), s.lettres.has(b.id)]).toEqual([true, false])
    s.casse = () => false
    await c.lettres()
    expect(mq.getItem(MARQUE)).toBe('1')
    expect(s.lettres.has(b.id)).toBe(true)
    expect(s.appels.filter(x => x === `PUT lettres/${a.id}`)).toHaveLength(1)
  })
  it('une lettre refusée pour sa forme ne bloque pas la marque', async () => {
    const local = coffreMemoire()
    await local.garderLettre({ ...neuve('jade', 1), papier: 'x'.repeat(40) })
    const { c, mq } = monter({ local, migre: false })
    await c.lettres()
    expect(mq.getItem(MARQUE)).toBe('1')
  })
})

describe('le coffre en ligne : les réglages', () => {
  const P = { envois: 2, env: ENVF, faits: ['plier'] }
  it('en ligne, gardés aussi sur l’appareil ; en panne, ceux de l’appareil', async () => {
    const { s, local, c } = monter()
    expect(await c.prefs('jade')).toEqual({ envois: 0, env: null, faits: [] })
    expect(await c.garderPrefs('jade', P)).toBe(true)
    expect(s.reglages.get('jade')).toEqual(P)
    expect(await local.prefs('jade')).toEqual(P)
    expect(await c.prefs('jade')).toEqual(P)
    s.panne = 'reseau'
    await local.garderPrefs('joyce', { ...P, envois: 7 })
    expect((await c.prefs('joyce')).envois).toBe(7)
    expect(await c.garderPrefs('jade', P)).toBe(false)
  })
})
