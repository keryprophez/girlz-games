// Le WORKER de la Ferme (9/10 : l'app quitte GitHub Pages pour Cloudflare,
// compte tld83, https://girlz-games.tld83.workers.dev). Tout passe d'abord
// par ici (`run_worker_first`), sauf les médias de `/assets/` : rien de l'app
// n'est servi avant le code d'accès. Une seule route à nous : le devineur.
import { accessPage, type PageState } from './access-page'
import {
  allowed, isDevBypass, isUnlocked, readConfig, safeNext, sameCode, sessionCookie, sessionValue,
  type AccessEnv
} from './access'
import { devine, type Ask, type DevineEnv } from './devine'
import { withSecurityHeaders } from './headers'

export type Env = AccessEnv & DevineEnv & { ASSETS: Fetcher }

/**
 * Servi sans le code : ce qu'il faut pour installer l'app (le navigateur
 * demande le manifeste sans cookie, puis les icônes qu'il cite) et le service
 * worker (la liste des fichiers de l'app, rien de personnel). Chemins exacts
 * seulement. Un test vérifie que chacun existe dans `dist/` après le build.
 */
export const PUBLIC_FILES = new Set(['/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/sw.js'])
const isPublic = (pathname: string) => PUBLIC_FILES.has(pathname) || /^\/workbox-[\w-]+\.js$/.test(pathname)

const MAX_FORM_BYTES = 2048

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

function redirect(location: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(null, { status: 303, headers: { location, ...extraHeaders } })
}

function pageUrl(state: Exclude<PageState, 'saisie'>, next: string): string {
  const query = new URLSearchParams({ [state]: '1' })
  if (next !== '/') query.set('next', next)
  return `/acces?${query}`
}

function isNavigation(request: Request): boolean {
  if (request.headers.get('Sec-Fetch-Mode') === 'navigate') return true
  return request.method === 'GET' && (request.headers.get('Accept') ?? '').includes('text/html')
}

/** Pas de session valide : les pages vont au code, le reste reçoit un 401. */
function locked(request: Request, url: URL): Response {
  if (isNavigation(request)) {
    const next = safeNext(url.pathname + url.search)
    return redirect(next === '/' ? '/acces' : `/acces?next=${encodeURIComponent(next)}`)
  }
  return new Response('Accès réservé', { status: 401 })
}

async function codePage(request: Request, url: URL, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } })
  }
  const next = safeNext(url.searchParams.get('next'))
  const config = readConfig(env)
  if (!config) return html(accessPage('ferme', next))
  // Déjà entré (un favori sur /acces) : droit à l'app
  if (isDevBypass(request, env) || (await isUnlocked(request, config))) return redirect(next)
  const state: PageState = url.searchParams.has('attente') ? 'attente' : url.searchParams.has('erreur') ? 'erreur' : 'saisie'
  return html(accessPage(state, next))
}

async function checkCode(request: Request, url: URL, env: Env): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } })
  // Connexion forcée depuis un autre site : le navigateur envoie Origin sur tout formulaire POST
  const origin = request.headers.get('Origin')
  if (origin && origin !== url.origin) return new Response('Origine refusée', { status: 403 })
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_FORM_BYTES) return new Response(null, { status: 413 })
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return redirect(pageUrl('erreur', '/'))
  }
  const next = safeNext(String(form.get('next') ?? '/'))
  const config = readConfig(env)
  if (!config) return redirect(pageUrl('ferme', next))
  if (!(await allowed(request, env.ACCES_LIMITER))) return redirect(pageUrl('attente', next))
  if (!(await sameCode(String(form.get('code') ?? ''), config.code))) return redirect(pageUrl('erreur', next))
  const value = await sessionValue(config, Date.now())
  return redirect(next, { 'set-cookie': sessionCookie(value, config.maxAgeS) })
}

async function route(request: Request, url: URL, env: Env, ask?: Ask): Promise<Response> {
  const { pathname } = url
  if (pathname === '/acces') return codePage(request, url, env)
  if (pathname === '/api/acces') return checkCode(request, url, env)
  if (isPublic(pathname)) return env.ASSETS.fetch(request)
  if (!isDevBypass(request, env)) {
    const config = readConfig(env)
    if (!config || !(await isUnlocked(request, config))) return locked(request, url)
  }
  if (pathname === '/api/devine') return devine(request, env, ask)
  // Jamais la page de l'app pour un chemin d'API inconnu
  if (pathname.startsWith('/api/')) return new Response(null, { status: 404 })
  return env.ASSETS.fetch(request)
}

/** Le point d'entrée, avec le devineur remplaçable (tests). */
export async function handle(request: Request, env: Env, ask?: Ask): Promise<Response> {
  const url = new URL(request.url)
  try {
    return withSecurityHeaders(await route(request, url, env, ask), url.pathname)
  } catch (error) {
    console.error(error)
    return withSecurityHeaders(new Response('Erreur', { status: 500 }), url.pathname)
  }
}

export default {
  fetch: (request: Request, env: Env) => handle(request, env)
} satisfies ExportedHandler<Env>
