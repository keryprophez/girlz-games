import { describe, expect, it } from 'vitest'
import { COOKIE, readConfig, safeNext, sameCode, sessionValue, isUnlocked, type AccessConfig } from './access'
import { handle, type Env } from './index'
import { askClaude, isPngBase64, type Ask } from './devine'
import { GuessFailure } from '../src/core/drawguess'

const ORIGIN = 'https://girlz-games.tld83.workers.dev'
const CODE = 'poussin-rose'
const SECRET = 's'.repeat(40)
const PNG = 'iVBORw0KGgo' + 'A'.repeat(200)

/** Le binding des fichiers, pour de faux : il renvoie le chemin demandé. */
const ASSETS = {
  fetch: async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    return new Response(`fichier ${url.pathname}`, { status: 200 })
  }
} as unknown as Fetcher

const env = (more: Partial<Env> = {}): Env => ({
  ASSETS, ACCESS_CODE: CODE, ACCESS_SIGNING_SECRET: SECRET, ANTHROPIC_API_KEY: 'sk-ant-test', ...more
})

async function cookie(): Promise<string> {
  const config = readConfig(env())!
  return `${COOKIE}=${await sessionValue(config, Date.now())}`
}

const get = (path: string, headers: Record<string, string> = {}) => new Request(ORIGIN + path, { headers })

function devinePost(body: unknown, headers: Record<string, string> = {}) {
  const text = JSON.stringify(body)
  return new Request(ORIGIN + '/api/devine', {
    method: 'POST', body: text,
    headers: { 'content-type': 'application/json', 'content-length': String(text.length), origin: ORIGIN, ...headers }
  })
}

const fakeAsk: Ask = async (_key, _png, cands) => ({
  items: [{ article: 'un', mot: cands ? 'chat' : 'dragon', photo: cands ? 'cat' : null }]
})

describe('le code d\'accès', () => {
  it('reste fermé sans code ou avec une clé de signature trop courte', () => {
    expect(readConfig({})).toBeNull()
    expect(readConfig({ ACCESS_CODE: 'x', ACCESS_SIGNING_SECRET: 's'.repeat(31) })).toBeNull()
    expect(readConfig({ ACCESS_CODE: ' x ', ACCESS_SIGNING_SECRET: SECRET })).toEqual({ code: 'x', secret: SECRET, maxAgeS: 400 * 86_400 })
    expect(readConfig({ ACCESS_CODE: 'x', ACCESS_SIGNING_SECRET: SECRET, ACCESS_MAX_AGE_DAYS: '900' })?.maxAgeS).toBe(400 * 86_400)
  })
  it('un cookie signé ouvre, un cookie trafiqué non, changer le code déconnecte', async () => {
    const config: AccessConfig = { code: CODE, secret: SECRET, maxAgeS: 86_400 }
    const value = await sessionValue(config, 1_000)
    const req = (v: string) => get('/', { Cookie: `autre=1; ${COOKIE}=${v}` })
    expect(await isUnlocked(req(value), config, 2_000)).toBe(true)
    expect(await isUnlocked(req(value), config, 1_000 + 86_400_000)).toBe(false)
    const [exp, mac] = value.split('.')
    expect(await isUnlocked(req(`${Number(exp) + 9}.${mac}`), config, 2_000)).toBe(false)
    expect(await isUnlocked(req(value), { ...config, code: 'autre' }, 2_000)).toBe(false)
  })
  it('compare le code sans se tromper', async () => {
    expect(await sameCode(` ${CODE} `, CODE)).toBe(true)
    expect(await sameCode('poussin', CODE)).toBe(false)
  })
  it('ne renvoie qu\'à un chemin du site', () => {
    expect(safeNext('/?fps')).toBe('/?fps')
    expect(safeNext('//evil.com')).toBe('/')
    expect(safeNext('/\\evil.com')).toBe('/')
    expect(safeNext('https://evil.com')).toBe('/')
    expect(safeNext('/api/devine')).toBe('/')
  })
})

describe('le portail', () => {
  it('envoie une page au code, et refuse le reste', async () => {
    const page = await handle(get('/', { Accept: 'text/html' }), env())
    expect(page.status).toBe(303)
    expect(page.headers.get('location')).toBe('/acces')
    expect((await handle(get('/app/index-abc.js'), env())).status).toBe(401)
    expect((await handle(devinePost({ png: PNG, tier: 'easy' }), env(), fakeAsk)).status).toBe(401)
  })
  it('laisse passer l\'installation de l\'app (manifeste, icônes, service worker)', async () => {
    for (const p of ['/manifest.webmanifest', '/icon-512.png', '/sw.js', '/workbox-2fbc6a65.js']) {
      expect((await handle(get(p), env())).status, p).toBe(200)
    }
  })
  it('fermé tant que le code n\'est pas posé côté Cloudflare', async () => {
    const res = await handle(get('/acces'), env({ ACCESS_CODE: undefined }))
    expect(await res.text()).toContain('pas encore ouverte')
    expect((await handle(get('/', { Accept: 'text/html' }), env({ ACCESS_CODE: undefined }))).status).toBe(303)
  })
  it('le bon code pose le cookie, le mauvais non', async () => {
    const post = (code: string) => {
      const body = new URLSearchParams({ code, next: '/' }).toString()
      return new Request(ORIGIN + '/api/acces', {
        method: 'POST', body,
        headers: { 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN, 'content-length': String(body.length) }
      })
    }
    const ok = await handle(post(CODE), env())
    expect(ok.status).toBe(303)
    expect(ok.headers.get('set-cookie')).toContain(`${COOKIE}=`)
    expect(ok.headers.get('set-cookie')).toContain('HttpOnly')
    const ko = await handle(post('poule'), env())
    expect(ko.headers.get('location')).toBe('/acces?erreur=1')
    expect(ko.headers.get('set-cookie')).toBeNull()
  })
  it('avec le cookie : l\'app, avec ses en-têtes', async () => {
    const res = await handle(get('/app/index-abc.js', { Cookie: await cookie() }), env())
    expect(await res.text()).toBe('fichier /app/index-abc.js')
    expect(res.headers.get('cache-control')).toContain('immutable')
    expect(res.headers.get('x-robots-tag')).toContain('noindex')
    expect((await handle(get('/api/rien', { Cookie: await cookie() }), env())).status).toBe(404)
  })
})

describe('le devineur', () => {
  const asked = async (body: unknown, more: Partial<Env> = {}, headers: Record<string, string> = {}) =>
    handle(devinePost(body, { Cookie: await cookie(), ...headers }), env(more), fakeAsk)

  it('rend la fiche : le défi parmi les sujets du niveau, le libre parmi tout', async () => {
    const res = await asked({ png: PNG, tier: 'easy' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ propositions: [{ article: 'un', mot: 'chat', photo: 'cat' }] })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await (await asked({ png: PNG, tier: 'libre' })).json()).toEqual({ propositions: [{ article: 'un', mot: 'dragon', photo: 'aucune' }] })
  })
  it('sans clé au Worker : le cadenas', async () => {
    const res = await asked({ png: PNG, tier: 'med' }, { ANTHROPIC_API_KEY: undefined })
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'cle' })
  })
  it('refuse ce qui n\'est pas un dessin, un autre site, un trop gros envoi', async () => {
    expect((await asked({ png: 'bonjour', tier: 'easy' })).status).toBe(400)
    expect((await asked({ png: PNG, tier: 'facile' })).status).toBe(400)
    expect((await asked({ png: PNG, tier: 'easy' }, {}, { origin: 'https://evil.com' })).status).toBe(403)
    expect((await asked({ png: PNG, tier: 'easy' }, {}, { 'content-length': '9000000' })).status).toBe(413)
    expect(isPngBase64(PNG)).toBe(true)
    expect(isPngBase64(PNG + '<')).toBe(false)
  })
  it('freiné au-delà de sa limite par minute', async () => {
    const DEVINE_LIMITER = { limit: async () => ({ success: false }) }
    const res = await asked({ png: PNG, tier: 'easy' }, { DEVINE_LIMITER })
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: 'limite' })
  })
  it('les erreurs du devineur deviennent les icônes du jeu', async () => {
    const failing: Ask = async () => { throw new GuessFailure('refus') }
    const res = await handle(devinePost({ png: PNG, tier: 'easy' }, { Cookie: await cookie() }), env(), failing)
    expect(await res.json()).toEqual({ error: 'refus' })
  })
})

describe('l\'appel à Claude (réponses de l\'API simulées)', () => {
  const api = (status: number, body: unknown): typeof fetch => async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const message = (text: string, stop = 'end_turn') => ({
    id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: stop, stop_sequence: null,
    content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }
  })
  const error = (type: string, msg: string) => ({ type: 'error', error: { type, message: msg } })
  const why = async (f: typeof fetch) => askClaude('sk-ant-test', PNG, null, f).then(() => 'ok', (e: GuessFailure) => e.why)

  it('lit la fiche et la revérifie', async () => {
    const fiche = JSON.stringify({ propositions: [{ article: 'un', mot: 'chat', photo: 'cat' }] })
    expect((await askClaude('sk-ant-test', PNG, null, api(200, message(fiche)))).items).toEqual([{ article: 'un', mot: 'chat', photo: 'cat' }])
    expect(await why(api(200, message('pas du JSON')))).toBe('autre')
    expect(await why(api(200, message('', 'refusal')))).toBe('refus')
  })
  it('clé refusée, trop vite, plafond de dépense', async () => {
    expect(await why(api(401, error('authentication_error', 'invalid x-api-key')))).toBe('cle')
    expect(await why(api(429, error('rate_limit_error', 'You have reached your API usage limits')))).toBe('limite')
    expect(await why(api(400, error('invalid_request_error', 'You have reached your specified workspace API usage limits. You will regain access on 2026-11-01')))).toBe('limite')
  })
  it('un 400 sur le paramètre de repli : la même demande sans lui', async () => {
    let calls = 0
    const fiche = JSON.stringify({ propositions: [{ article: 'une', mot: 'pomme', photo: 'apple' }] })
    const f: typeof fetch = async () => {
      calls++
      return calls === 1
        ? new Response(JSON.stringify(error('invalid_request_error', 'fallbacks: unknown parameter')), { status: 400, headers: { 'content-type': 'application/json' } })
        : new Response(JSON.stringify(message(fiche)), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    expect((await askClaude('sk-ant-test', PNG, null, f)).items[0].mot).toBe('pomme')
    expect(calls).toBe(2)
  })
})
