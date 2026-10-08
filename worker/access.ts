// Le CODE D'ACCÈS de la Ferme (9/10, le père : « toute l'app derrière un
// code unique, cf. food-coach ») : un seul code pour la famille, vérifié par
// le Worker, retenu par un cookie signé. Repris de food-coach
// (`src/lib/access.ts`), le modèle tld83 validé en prod.
//
// Fermé exprès : sans ACCESS_CODE, ou avec un ACCESS_SIGNING_SECRET de moins
// de 32 caractères, personne n'entre. Une app privée qui s'ouvre toute seule
// quand un réglage manque, c'est exactement ce que ce portail doit empêcher.
//
// Le cookie ne porte aucune donnée : une date d'expiration et un HMAC. Le
// HMAC couvre aussi le code : changer ACCESS_CODE déconnecte tous les
// appareils (voir PIEGES.md : la PWA garde son cache, seul le réseau ferme).

export type RateLimiterLike = {
  limit: (options: { key: string }) => Promise<{ success: boolean }>
}

export type AccessEnv = {
  /** Le code de la famille (secret du Worker, posé dans le tableau de bord). */
  ACCESS_CODE?: string
  /** Au moins 32 caractères aléatoires qui signent le cookie (secret du Worker). */
  ACCESS_SIGNING_SECRET?: string
  /** Durée de la session en jours (variable, facultative, 400 par défaut). */
  ACCESS_MAX_AGE_DAYS?: string
  /** Essais du formulaire par adresse IP (`ratelimits` de wrangler.jsonc). */
  ACCES_LIMITER?: RateLimiterLike
  /** Développement local seulement (.dev.vars) : saute le portail sur localhost. */
  DEV_SKIP_ACCESS?: string
}

export type AccessConfig = { code: string; secret: string; maxAgeS: number }

/** « __Host- » : Secure, Path=/ et pas de Domain, imposés par le navigateur. */
export const COOKIE = '__Host-ferme-acces'
// 400 jours : le plafond des navigateurs pour un cookie. Une tablette
// d'enfants ne doit pas redemander le code tous les six mois.
const DEFAULT_MAX_AGE_DAYS = 400
const MIN_SECRET_LENGTH = 32
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Les réglages du portail, ou null quand il ne peut pas fonctionner (l'app reste fermée). */
export function readConfig(env: AccessEnv): AccessConfig | null {
  const code = env.ACCESS_CODE?.trim()
  const secret = env.ACCESS_SIGNING_SECRET
  if (!code || !secret || secret.length < MIN_SECRET_LENGTH) return null
  const days = Number(env.ACCESS_MAX_AGE_DAYS)
  const validDays = Number.isFinite(days) && days > 0 ? Math.min(days, 400) : DEFAULT_MAX_AGE_DAYS
  return { code, secret, maxAgeS: Math.round(validDays * 86_400) }
}

export function isDevBypass(request: Request, env: AccessEnv): boolean {
  return env.DEV_SKIP_ACCESS === '1' && LOCAL_HOSTS.has(new URL(request.url).hostname)
}

const encoder = new TextEncoder()

function b64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fromB64url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return Uint8Array.from(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)), c => c.charCodeAt(0))
  } catch {
    return null
  }
}

function hmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage])
}

const signedPart = (expiresMs: number, code: string) => encoder.encode(`v1.${expiresMs}.${code}`)

/** La valeur du cookie d'une session ouverte maintenant : « <expiration ms>.<HMAC> ». */
export async function sessionValue(config: AccessConfig, nowMs: number): Promise<string> {
  const expiresMs = nowMs + config.maxAgeS * 1000
  const key = await hmacKey(config.secret, 'sign')
  const mac = await crypto.subtle.sign('HMAC', key, signedPart(expiresMs, config.code))
  return `${expiresMs}.${b64url(mac)}`
}

export function sessionCookie(value: string, maxAgeS: number): string {
  return `${COOKIE}=${value}; Max-Age=${maxAgeS}; Path=/; Secure; HttpOnly; SameSite=Lax`
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return null
}

/** La requête porte-t-elle une session valide et pas expirée ? */
export async function isUnlocked(request: Request, config: AccessConfig, nowMs: number = Date.now()): Promise<boolean> {
  const value = readCookie(request, COOKIE)
  const match = value?.match(/^(\d{1,15})\.([A-Za-z0-9_-]+)$/)
  if (!match) return false
  const expiresMs = Number(match[1])
  if (expiresMs <= nowMs) return false
  const mac = fromB64url(match[2] ?? '')
  if (!mac) return false
  // crypto.subtle.verify compare en temps constant
  const key = await hmacKey(config.secret, 'verify')
  return crypto.subtle.verify('HMAC', key, mac, signedPart(expiresMs, config.code))
}

/**
 * Compare le code tapé à celui attendu. Les deux sont hachés d'abord et les
 * empreintes comparées en entier : s'arrêter au premier caractère faux
 * laisserait trouver le code lettre par lettre, et comparer les chaînes
 * brutes trahirait sa longueur.
 */
export async function sameCode(submitted: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all(
    [submitted.trim(), expected].map(s => crypto.subtle.digest('SHA-256', encoder.encode(s)))
  )
  const x = new Uint8Array(a as ArrayBuffer)
  const y = new Uint8Array(b as ArrayBuffer)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

/**
 * Le budget d'essais d'une adresse IP sur un limiteur (10 codes par minute
 * pour le formulaire). Ouvert en cas de panne : sans le binding (tests) ou
 * quand il échoue, la suite s'exécute quand même. Le limiteur ralentit,
 * il n'est pas le portail.
 */
export async function allowed(request: Request, limiter: RateLimiterLike | undefined): Promise<boolean> {
  if (!limiter) return true
  const ip = request.headers.get('CF-Connecting-IP') ?? 'inconnue'
  try {
    return (await limiter.limit({ key: ip })).success
  } catch (error) {
    console.warn('Limiteur indisponible, essai accepté', error)
    return true
  }
}

/**
 * Où revenir après le code. Seul un chemin du site survit : tout ce que
 * l'analyseur d'URL envoie ailleurs (« //evil.com », « /\evil.com », URL
 * absolues) retombe sur « / ».
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/')) return '/'
  const origin = 'https://ferme.invalid'
  let url: URL
  try {
    url = new URL(raw, origin)
  } catch {
    return '/'
  }
  if (url.origin !== origin) return '/'
  if (url.pathname === '/acces' || url.pathname.startsWith('/api/')) return '/'
  return url.pathname + url.search + url.hash
}
