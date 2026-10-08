// La route du DEVINEUR (`POST /api/devine`, 9/10) : le jeu envoie le dessin,
// le Worker le montre à Claude avec la clé du père et renvoie la fiche
// revérifiée. La clé est un secret du Worker (ANTHROPIC_API_KEY, posé dans
// le tableau de bord Cloudflare) : jamais dans l'app, ni sur la tablette, ni
// dans le dépôt. La route est derrière le code d'accès (`index.ts`).
//
// Rien n'est gardé ici : le dessin passe, la réponse repart, aucun journal ne
// contient l'image (règle 3 du CLAUDE.md).
import Anthropic from '@anthropic-ai/sdk'
import {
  candidates, GuessFailure, MODEL, parseGuess, SCHEMA, systemPrompt, userPrompt,
  type Guess, type GuessError, type Tier
} from '../src/core/drawguess'
import { allowed, type RateLimiterLike } from './access'

export type DevineEnv = {
  /** La clé de l'API Anthropic (secret du Worker). Absente : le chat montre un cadenas. */
  ANTHROPIC_API_KEY?: string
  /** Dessins par adresse IP et par minute (`ratelimits` de wrangler.jsonc). */
  DEVINE_LIMITER?: RateLimiterLike
}

/** Montre le dessin à Claude et rend la fiche (remplacé dans les tests). */
export type Ask = (key: string, png: string, cands: string[] | null) => Promise<Guess>

// Le dessin réduit (512 px de large, en PNG) pèse de 50 à 400 Ko en base64
const MAX_BYTES = 1_500_000
// Le niveau du défi, ou « libre » (elle dessine ce qu'elle veut : il devine parmi tout)
const TIERS: readonly (Tier | 'libre')[] = ['easy', 'med', 'exp', 'libre']
const STATUS: Record<GuessError, number> = { cle: 503, limite: 429, refus: 422, reseau: 502, autre: 502 }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
}
const fail = (why: GuessError, status = STATUS[why]) => json({ error: why }, status)

/** Le base64 d'une image PNG (sans l'en-tête `data:`), et rien d'autre. */
export function isPngBase64(s: unknown): s is string {
  return typeof s === 'string' && s.length <= MAX_BYTES && s.startsWith('iVBORw0KGgo') && /^[A-Za-z0-9+/]+={0,2}$/.test(s)
}

export async function devine(request: Request, env: DevineEnv, ask: Ask = askClaude): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } })
  // Seul le jeu lui-même peut demander (le navigateur envoie toujours Origin sur un POST)
  const origin = request.headers.get('Origin')
  if (origin && origin !== new URL(request.url).origin) return new Response('Origine refusée', { status: 403 })
  const length = request.headers.get('Content-Length')
  if (length === null) return new Response(null, { status: 411 })
  if (Number(length) > MAX_BYTES + 100) return fail('autre', 413)
  const key = env.ANTHROPIC_API_KEY?.trim()
  if (!key) return fail('cle')
  if (!(await allowed(request, env.DEVINE_LIMITER))) return fail('limite')
  let body: { png?: unknown; tier?: unknown }
  try {
    body = await request.json()
  } catch {
    return fail('autre', 400)
  }
  const tier = TIERS.find(t => t === body?.tier)
  if (!isPngBase64(body?.png) || !tier) return fail('autre', 400)
  try {
    const g = await ask(key, body.png, tier === 'libre' ? null : candidates(tier))
    // La même forme que la fiche imposée : le jeu la revérifie avec `parseGuess`
    return json({ propositions: g.items.map(i => ({ ...i, photo: i.photo ?? 'aucune' })) })
  } catch (e) {
    if (e instanceof GuessFailure) return fail(e.why)
    console.error('Devineur : erreur inattendue', e instanceof Error ? e.name : typeof e)
    return fail('autre')
  }
}

/** L'appel à Claude (Opus 5.5, effort bas, la fiche imposée), et ses erreurs en mots du jeu. */
export async function askClaude(key: string, png: string, cands: string[] | null, fetchImpl?: typeof fetch): Promise<Guess> {
  const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 45_000, ...(fetchImpl ? { fetch: fetchImpl } : {}) })
  const body = {
    model: MODEL,
    max_tokens: 2000,
    system: [{ type: 'text' as const, text: systemPrompt(), cache_control: { type: 'ephemeral' as const } }],
    output_config: { effort: 'low' as const, format: { type: 'json_schema' as const, schema: SCHEMA as unknown as Record<string, unknown> } },
    messages: [{
      role: 'user' as const,
      content: [
        { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/png' as const, data: png } },
        { type: 'text' as const, text: userPrompt(cands) }
      ]
    }]
  }
  let res: { stop_reason: string | null; content: { type: string; text?: string }[] }
  try {
    try {
      // Un refus de sécurité (peu probable sur un dessin d'enfant) est rejoué par un autre modèle, côté Anthropic
      res = await client.beta.messages.create({ ...body, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    } catch (e) {
      // Un 400 qui n'est pas le plafond de dépense : le paramètre de repli refusé, la même demande sans lui
      if (e instanceof Anthropic.BadRequestError && !isSpendLimit(e)) res = await client.messages.create(body)
      else throw e
    }
  } catch (e) {
    throw new GuessFailure(errorOf(e))
  }
  if (res.stop_reason === 'refusal') throw new GuessFailure('refus')
  const text = res.content.find(b => b.type === 'text')?.text
  let raw: unknown
  try { raw = text ? JSON.parse(text) : null } catch { raw = null }
  const g = parseGuess(raw)
  if (!g) throw new GuessFailure('autre')
  return g
}

// Le plafond de dépense posé par le père sur le workspace répond 400, avec un
// message qui commence par « You have reached your specified (workspace) API
// usage limits » (doc des limites de l'API, 10/2026) : aucun code d'erreur ne
// le distingue, d'où le texte.
const isSpendLimit = (e: InstanceType<typeof Anthropic.APIError>) => /reached your specified .*usage limits/i.test(e.message)

function errorOf(e: unknown): GuessError {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return 'cle'
  // 429 : trop vite, ou le plafond mensuel de l'offre atteint
  if (e instanceof Anthropic.RateLimitError) return 'limite'
  if (e instanceof Anthropic.BadRequestError && isSpendLimit(e)) return 'limite'
  if (e instanceof Anthropic.APIConnectionError) return 'reseau'
  console.error('Devineur : erreur de l\'API', e instanceof Anthropic.APIError ? e.status : e instanceof Error ? e.name : typeof e)
  return 'autre'
}
