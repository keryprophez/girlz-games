// En-têtes de sécurité et de cache, d'une seule source (repris de food-coach).
// Ils s'appliquent à tout ce qui passe par le Worker : la page, le code de
// l'app (`/app/`), le portail et l'API. Les médias (`/assets/` : photos, sons,
// modèles 3D, rien de personnel) sont servis par Cloudflare sans le Worker
// (`run_worker_first` de wrangler.jsonc) : gratuits, et hors du quota de
// requêtes du compte.
//
// Pas de Content-Security-Policy ni de Permissions-Policy (contrairement à
// food-coach) : l'app se sert du micro (l'Animal qui répète, les bougies de la
// Pâtisserie), d'images en `data:` et `blob:`, de sons en `blob:` — et le smoke
// et les bots tournent sous `vite preview`, sans ces en-têtes : une règle trop
// stricte casserait un jeu sans qu'aucun test ne le voie.
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  // App privée : jamais indexée, quoi qu'il arrive à un robot
  'X-Robots-Tag': 'noindex, nofollow'
}

/**
 * Le cache selon le chemin. Le code de Vite porte une empreinte dans son nom :
 * gardé un an. Le portail et l'API ne sont jamais gardés. Le reste (la page,
 * le service worker, le manifeste, les icônes) est revérifié à chaque
 * chargement pour qu'une mise en ligne se voie tout de suite. « private » :
 * le code est derrière le portail, les caches partagés restent dehors.
 */
export function cacheControlFor(pathname: string): string {
  if (pathname === '/acces' || pathname.startsWith('/api/')) return 'no-store'
  return pathname.startsWith('/app/') ? 'private, max-age=31536000, immutable' : 'no-cache'
}

/** Copie une réponse et lui ajoute les en-têtes de sécurité et de cache. */
export function withSecurityHeaders(response: Response, pathname: string): Response {
  // Une copie : les en-têtes d'une réponse reçue sont figés
  const secured = new Response(response.body, response)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) secured.headers.set(name, value)
  // Un 304 (le fichier n'a pas changé) garde la règle du fichier : un
  // « no-store » sur lui ferait oublier au navigateur ce qu'il a déjà
  const kept = response.ok || response.status === 304
  secured.headers.set('Cache-Control', kept ? cacheControlFor(pathname) : 'no-store')
  return secured
}
