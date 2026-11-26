/* @version 2026-11-26 17:47 */
// Les routes du Courrier en ligne, sur une VRAIE base D1 et un VRAI
// compartiment R2, locaux et en mémoire (getPlatformProxy de wrangler,
// `worker/banc.jsonc`). La migration est celle que la CI applique.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import sql from './migrations/0001_courrier.sql?raw'
import { COOKIE, readConfig, sessionValue } from './access'
import { handle, type Env } from './index'
import { MAX_LETTRE_OCTETS, MAX_PEINTURE, type LettreFil, type ObjetFil } from '../src/core/courrierfil'

const ORIGIN = 'https://girlz-games.tld83.workers.dev'
const ASSETS = { fetch: async () => new Response('page') } as unknown as Fetcher
type Banc = { DB: D1Database; COURRIER: R2Bucket }

let banc: { env: Banc; dispose(): Promise<void> }
let jeton = ''
const env = (more: Partial<Env> = {}): Env => ({ ASSETS, ACCESS_CODE: 'poussin-rose', ACCESS_SIGNING_SECRET: 's'.repeat(40), ...banc.env, ...more })

beforeAll(async () => {
  banc = await getPlatformProxy<Banc>({ configPath: 'worker/banc.jsonc', persist: false })
  // Les lignes de commentaire ôtées, une instruction par « ; »
  for (const s of sql.replace(/^--.*$/gm, '').split(';').map(x => x.trim()).filter(Boolean)) await banc.env.DB.prepare(s).run()
  jeton = `${COOKIE}=${await sessionValue(readConfig(env())!, Date.now())}`
}, 30_000)
afterAll(async () => { await banc?.dispose() })

const taille = (c: string | Uint8Array) => (typeof c === 'string' ? new TextEncoder().encode(c).length : c.byteLength)
/** Une requête de l'app (cookie, même origine, longueur annoncée). */
function req(methode: string, chemin: string, corps?: string | Uint8Array, en: Record<string, string> = {}, e: Env = env()) {
  const h: Record<string, string> = { cookie: jeton, origin: ORIGIN }
  if (corps !== undefined) h['content-length'] = String(taille(corps))
  return handle(new Request(ORIGIN + chemin, { method: methode, body: corps, headers: { ...h, ...en } }), e)
}
const lettre = (id: string, plus: Partial<LettreFil> = {}): LettreFil => ({
  id, de: 'jade', a: 'joyce', etat: 'brouillon', cree: 1, postee: 0, tour: 0, papier: '#FFFDF8',
  env: null, objets: [], peinture: null, version: 1, ...plus
})
const ecrire = (l: LettreFil, en: Record<string, string> = {}) => req('PUT', `/api/courrier/lettres/${l.id}`, JSON.stringify(l), { 'content-type': 'application/json', ...en })
const fichier = (id: string, nom: string, octets = new Uint8Array([1, 2, 3]), type = nom.endsWith('.png') ? 'image/png' : 'audio/webm', en: Record<string, string> = {}) =>
  req('PUT', `/api/courrier/fichiers/lettres/${id}/${nom}`, octets, { 'content-type': type, ...en })
const liste = async () => ((await (await req('GET', '/api/courrier/lettres')).json()) as { lettres: LettreFil[] }).lettres
const pose = { x: 10, s: 1, r: 0 }
const texte = (t: string, y: number): ObjetFil => ({ k: 'texte', t, couleur: '#1C64C8', police: 'Fredoka', taille: 92, y, ...pose })
const ENV = { couleur: '#F58FB8', cachet: 'coeur', timbre: 'animal:duck' }

describe('le Courrier en ligne : la porte', () => {
  it('sans code : 401', async () => {
    expect((await handle(new Request(ORIGIN + '/api/courrier/lettres'), env())).status).toBe(401)
  })
  it('une autre origine ne peut pas écrire : 403', async () => {
    expect((await ecrire(lettre('orig-1'), { origin: 'https://evil.example' })).status).toBe(403)
    expect((await fichier('orig-1', 'peinture.png', undefined, undefined, { origin: 'https://evil.example' })).status).toBe(403)
  })
  it('sans liaisons : 503', async () => {
    expect((await req('GET', '/api/courrier/lettres', undefined, {}, env({ DB: undefined, COURRIER: undefined }))).status).toBe(503)
  })
  it('une autre méthode : 405 ; un autre chemin : 404 ; jamais gardé en cache', async () => {
    const r = await req('DELETE', '/api/courrier/lettres/x-1')
    expect(r.status).toBe(405)
    expect(r.headers.get('allow')).toBe('PUT')
    expect((await req('GET', '/api/courrier/ailleurs')).status).toBe(404)
    expect((await req('GET', '/api/courrier/lettres')).headers.get('cache-control')).toBe('no-store')
  })
})

describe('le Courrier en ligne : les lettres', () => {
  it('aller-retour : fichiers, lettre, liste, fichier relu, texte pour le père', async () => {
    expect((await fichier('ar-1', 'peinture.png')).status).toBe(200)
    expect((await fichier('ar-1', 'voix-a1.webm', new Uint8Array([4, 5]))).status).toBe(200)
    const voix: ObjetFil = { k: 'voix', cle: 'lettres/ar-1/voix-a1.webm', pics: [0.3], duree: 2, y: 400, ...pose }
    const l = lettre('ar-1', { peinture: 'lettres/ar-1/peinture.png', objets: [texte('bisous 💖', 800), voix, texte('Coucou', 100)] })
    const r = await ecrire(l)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ version: 1 })
    expect((await liste()).find(x => x.id === 'ar-1')).toEqual(l)
    const f = await req('GET', '/api/courrier/fichiers/lettres/ar-1/voix-a1.webm')
    expect(f.status).toBe(200)
    expect(f.headers.get('content-type')).toBe('audio/webm')
    expect([...new Uint8Array(await f.arrayBuffer())]).toEqual([4, 5])
    const ligne = await banc.env.DB.prepare('SELECT texte, maj FROM lettres WHERE id = ?1').bind('ar-1').first<{ texte: string; maj: number }>()
    expect(ligne?.texte).toBe('Coucou\nbisous 💖')
    expect(ligne?.maj).toBeGreaterThan(0)
  })
  it('une lettre qui désigne un fichier absent : 422', async () => {
    const r = await ecrire(lettre('manque-1', { peinture: 'lettres/manque-1/peinture.png' }))
    expect(r.status).toBe(422)
    expect(await r.json()).toEqual({ refus: 'fichier' })
  })
  it('une forme invalide : 400 ; sans longueur : 411 ; trop longue : 413', async () => {
    expect((await req('PUT', '/api/courrier/lettres/forme-1', 'pas du json', { 'content-type': 'application/json' })).status).toBe(400)
    expect((await ecrire(lettre('forme-1', { de: 'joyce', a: 'joyce' }))).status).toBe(400)
    expect((await req('PUT', '/api/courrier/lettres/forme-2', JSON.stringify(lettre('forme-1')), { 'content-type': 'application/json' })).status).toBe(400)
    const sans = new Request(ORIGIN + '/api/courrier/lettres/forme-1', { method: 'PUT', body: JSON.stringify(lettre('forme-1')), headers: { cookie: jeton, origin: ORIGIN } })
    expect((await handle(sans, env())).status).toBe(411)
    expect((await ecrire(lettre('forme-1'), { 'content-length': String(MAX_LETTRE_OCTETS + 1) })).status).toBe(413)
  })
  it('une version qui n’avance pas : 409 version', async () => {
    expect((await ecrire(lettre('ver-1', { version: 2 }))).status).toBe(200)
    const r = await ecrire(lettre('ver-1', { version: 2, papier: '#000000' }))
    expect(r.status).toBe(409)
    expect(await r.json()).toEqual({ refus: 'version' })
    expect((await ecrire(lettre('ver-1', { version: 1 }))).status).toBe(409)
    expect((await ecrire(lettre('ver-1', { version: 3, papier: '#FFE0EC' }))).status).toBe(200)
    expect((await liste()).find(x => x.id === 'ver-1')?.papier).toBe('#FFE0EC')
  })
  it('un état qui recule : 409 etat', async () => {
    expect((await ecrire(lettre('rec-1', { etat: 'postee', env: ENV, postee: 5, tour: 5, version: 2 }))).status).toBe(200)
    const r = await ecrire(lettre('rec-1', { version: 3 }))
    expect(r.status).toBe(409)
    expect(await r.json()).toEqual({ refus: 'etat' })
    expect((await ecrire(lettre('rec-1', { etat: 'ouverte', env: ENV, postee: 5, tour: 6, version: 3 }))).status).toBe(200)
  })
  it('une lettre cachetée ne change plus de contenu : 409 fige', async () => {
    const k = lettre('fige-1', { etat: 'cachetee', env: ENV, objets: [texte('Coucou', 100)] })
    expect((await ecrire(k)).status).toBe(200)
    const r = await ecrire({ ...k, version: 2, objets: [texte('Autre chose', 100)] })
    expect(r.status).toBe(409)
    expect(await r.json()).toEqual({ refus: 'fige' })
    expect((await ecrire({ ...k, version: 2, papier: '#000000' })).status).toBe(409)
    expect((await ecrire({ ...k, version: 2, etat: 'postee', postee: 9, tour: 9 })).status).toBe(200)
    expect((await liste()).find(x => x.id === 'fige-1')?.objets).toEqual(k.objets)
  })
  it('de ou a changés : 409 qui', async () => {
    expect((await ecrire(lettre('qui-1'))).status).toBe(200)
    const r = await ecrire(lettre('qui-1', { de: 'joyce', a: 'jade', version: 2 }))
    expect(r.status).toBe(409)
    expect(await r.json()).toEqual({ refus: 'qui' })
  })
  it('jetée : absente de la liste, ni lettre ni fichier ne s’écrivent plus', async () => {
    expect((await ecrire(lettre('jet-1', { etat: 'gardee', env: ENV, postee: 3, tour: 3 }))).status).toBe(200)
    expect((await req('POST', '/api/courrier/lettres/jet-1/jeter')).status).toBe(200)
    expect((await req('POST', '/api/courrier/lettres/jet-1/jeter')).status).toBe(200)
    expect((await liste()).some(x => x.id === 'jet-1')).toBe(false)
    const r = await ecrire(lettre('jet-1', { etat: 'gardee', env: ENV, postee: 3, tour: 3, version: 9 }))
    expect(r.status).toBe(409)
    expect(await r.json()).toEqual({ refus: 'jetee' })
    expect((await fichier('jet-1', 'peinture.png')).status).toBe(409)
    expect((await req('POST', '/api/courrier/lettres/inconnue-1/jeter')).status).toBe(404)
  })
})

describe('le Courrier en ligne : les fichiers', () => {
  it('plus de fichier une fois la lettre cachetée : 409', async () => {
    expect((await fichier('cach-1', 'peinture.png')).status).toBe(200)
    expect((await ecrire(lettre('cach-1', { etat: 'cachetee', env: ENV }))).status).toBe(200)
    expect((await fichier('cach-1', 'peinture.png')).status).toBe(409)
    expect((await fichier('cach-1', 'voix-b2.webm')).status).toBe(409)
  })
  it('trop gros : 413 ; mauvais type : 415 ; mauvais nom ou id : 400 ; absent : 404', async () => {
    expect((await fichier('gros-1', 'peinture.png', undefined, undefined, { 'content-length': String(MAX_PEINTURE + 1) })).status).toBe(413)
    expect((await fichier('gros-1', 'voix-a.webm', undefined, 'image/png')).status).toBe(415)
    expect((await fichier('gros-1', 'peinture.png', undefined, 'image/jpeg')).status).toBe(415)
    expect((await fichier('gros-1', 'voix-1.mp3')).status).toBe(400)
    expect((await fichier('GROS', 'peinture.png')).status).toBe(400)
    expect((await req('GET', '/api/courrier/fichiers/lettres/gros-1/voix-zz.webm')).status).toBe(404)
  })
})

describe('le Courrier en ligne : les réglages', () => {
  const P = { envois: 2, env: ENV, faits: ['plier'] }
  it('null, écrits, relus ; 400 ; 404 pour un autre prénom', async () => {
    expect(await (await req('GET', '/api/courrier/reglages/joyce')).json()).toEqual({ prefs: null })
    expect((await req('PUT', '/api/courrier/reglages/joyce', JSON.stringify(P), { 'content-type': 'application/json' })).status).toBe(200)
    expect(await (await req('GET', '/api/courrier/reglages/joyce')).json()).toEqual({ prefs: P })
    expect(await (await req('GET', '/api/courrier/reglages/jade')).json()).toEqual({ prefs: null })
    expect((await req('PUT', '/api/courrier/reglages/joyce', JSON.stringify({ ...P, envois: -1 }), { 'content-type': 'application/json' })).status).toBe(400)
    expect((await req('GET', '/api/courrier/reglages/papa')).status).toBe(404)
  })
})
