/* @version 2026-11-26 17:47 */
// LE COURRIER EN LIGNE (26/11, choisi par le père : troisième exception de la
// règle 3) : les lettres que Jade et Joyce s'envoient, gardées sur le compte
// Cloudflare `tld83` — le texte dans D1 (`girlz-games-courrier`, lisible dans
// la console), les dessins et les voix dans R2 (même nom, privé). Rien n'en
// sort que par ces routes, derrière le code d'accès (worker/index.ts).
//
// - Une lettre ne recule jamais : sa `version` doit avancer, son état aussi
//   (brouillon < cachetée < postée < ouverte < gardée), ses prénoms ne changent
//   pas, une lettre jetée ne s'écrit plus. Une fois cachetée, son contenu
//   (objets, papier, dessin) est figé : seuls l'enveloppe et le trajet changent
//   — un vieux brouillon resté sur un autre appareil ne la remplace pas.
// - Les fichiers d'abord, la lettre ensuite : une lettre qui désigne un
//   fichier absent de R2 est refusée (422). Un fichier ne s'écrit que pour une
//   lettre absente ou encore brouillon : une lettre postée ne change plus.
// - Jeter cache la lettre aux filles ; le père la garde. Rien n'est effacé.
import {
  cleDe, fichiersDe, ID, lireLettre, lirePrefs, MAX_LETTRE_OCTETS, MAX_PEINTURE, MAX_VOIX_OCTETS, nomFichier,
  rang, texteDe, type EtatFil
} from '../src/core/courrierfil'

/** Les liaisons de wrangler.jsonc ; sans elles (pas encore branchées), 503. */
export type CourrierEnv = { DB?: D1Database; COURRIER?: R2Bucket }

const MAX_PREFS_OCTETS = 8 * 1024

const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
const refus = (raison: string, status = 409) => json({ refus: raison }, status)
const vide = (status: number, headers?: Record<string, string>) => new Response(null, { status, headers })

/** Le corps, s'il annonce sa longueur et ne dépasse pas `max` (annoncé, puis lu). */
async function lireCorps(request: Request, max: number): Promise<ArrayBuffer | Response> {
  const n = request.headers.get('Content-Length')
  if (n === null || n === '') return vide(411)
  if (!(Number(n) <= max)) return vide(413)
  const corps = await request.arrayBuffer()
  return corps.byteLength > max ? vide(413) : corps
}
async function lireJSON(request: Request, max: number): Promise<{ v: unknown } | Response> {
  const corps = await lireCorps(request, max)
  if (corps instanceof Response) return corps
  try {
    return { v: JSON.parse(new TextDecoder().decode(corps)) }
  } catch {
    return vide(400)
  }
}

interface Ligne {
  id: string; de: string; a: string; etat: string; cree: number; postee: number; tour: number
  papier: string; env: string | null; objets: string; peinture: string | null; version: number
}

async function liste(db: D1Database): Promise<Response> {
  const { results } = await db.prepare('SELECT * FROM lettres WHERE jetee = 0 ORDER BY cree').all<Ligne>()
  // Une ligne illisible (abîmée à la main dans la console) est sautée, jamais une erreur
  const lettres = results.flatMap(r => {
    try {
      const l = lireLettre({ ...r, env: r.env === null ? null : JSON.parse(r.env), objets: JSON.parse(r.objets) }, r.id)
      return l ? [l] : []
    } catch {
      return []
    }
  })
  return json({ lettres })
}

async function ecrire(request: Request, db: D1Database, r2: R2Bucket, id: string): Promise<Response> {
  if (!ID.test(id)) return vide(400)
  const lu = await lireJSON(request, MAX_LETTRE_OCTETS)
  if (lu instanceof Response) return lu
  const l = lireLettre(lu.v, id)
  if (!l) return vide(400)
  const avant = await db.prepare('SELECT de, a, etat, version, jetee, objets, papier, peinture FROM lettres WHERE id = ?1').bind(id)
    .first<{ de: string; a: string; etat: EtatFil; version: number; jetee: number; objets: string; papier: string; peinture: string | null }>()
  if (avant) {
    if (avant.jetee) return refus('jetee')
    if (avant.de !== l.de || avant.a !== l.a) return refus('qui')
    if (l.version <= avant.version) return refus('version')
    if (rang(l.etat) < rang(avant.etat)) return refus('etat')
    if (avant.etat !== 'brouillon' && (avant.objets !== JSON.stringify(l.objets) || avant.papier !== l.papier || avant.peinture !== l.peinture)) return refus('fige')
  }
  for (const cle of fichiersDe(l)) if (!(await r2.head(cle))) return refus('fichier', 422)
  const fait = await db.prepare(`INSERT INTO lettres (id, de, a, etat, cree, postee, tour, papier, env, objets, peinture, texte, jetee, version, maj)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, ?13, ?14)
      ON CONFLICT(id) DO UPDATE SET etat = excluded.etat, cree = excluded.cree, postee = excluded.postee, tour = excluded.tour,
        papier = excluded.papier, env = excluded.env, objets = excluded.objets, peinture = excluded.peinture,
        texte = excluded.texte, version = excluded.version, maj = excluded.maj
      WHERE lettres.version < excluded.version AND lettres.jetee = 0`)
    .bind(id, l.de, l.a, l.etat, l.cree, l.postee, l.tour, l.papier, l.env ? JSON.stringify(l.env) : null,
      JSON.stringify(l.objets), l.peinture, texteDe(l), l.version, Date.now())
    .run()
  // Une autre écriture est passée entre la lecture et celle-ci
  if (!fait.meta.changes) return refus('version')
  return json({ version: l.version })
}

async function jeter(db: D1Database, id: string): Promise<Response> {
  if (!ID.test(id)) return vide(400)
  const fait = await db.prepare('UPDATE lettres SET jetee = 1, maj = ?2 WHERE id = ?1').bind(id, Date.now()).run()
  return fait.meta.changes ? json({ ok: true }) : vide(404)
}

async function poserFichier(request: Request, db: D1Database, r2: R2Bucket, id: string, nom: string): Promise<Response> {
  const genre = nomFichier(nom)
  if (!ID.test(id) || !genre) return vide(400)
  const type = request.headers.get('content-type') ?? ''
  if (genre === 'peinture' ? type !== 'image/png' : !type.startsWith('audio/')) return vide(415)
  const avant = await db.prepare('SELECT etat, jetee FROM lettres WHERE id = ?1').bind(id).first<{ etat: string; jetee: number }>()
  if (avant && (avant.jetee || avant.etat !== 'brouillon')) return refus('fige')
  const corps = await lireCorps(request, genre === 'peinture' ? MAX_PEINTURE : MAX_VOIX_OCTETS)
  if (corps instanceof Response) return corps
  await r2.put(cleDe(id, nom), corps, { httpMetadata: { contentType: type } })
  return json({ ok: true })
}

async function lireFichier(r2: R2Bucket, id: string, nom: string): Promise<Response> {
  if (!ID.test(id) || !nomFichier(nom)) return vide(400)
  const o = await r2.get(cleDe(id, nom))
  if (!o) return vide(404)
  return new Response(await o.arrayBuffer(), { headers: { 'content-type': o.httpMetadata?.contentType ?? 'application/octet-stream' } })
}

async function reglages(request: Request, db: D1Database, qui: string): Promise<Response> {
  if (qui !== 'jade' && qui !== 'joyce') return vide(404)
  if (request.method === 'GET') {
    const r = await db.prepare('SELECT prefs FROM reglages WHERE qui = ?1').bind(qui).first<{ prefs: string }>()
    let prefs = null
    try { prefs = r ? lirePrefs(JSON.parse(r.prefs)) : null } catch { /* abîmés : comme absents */ }
    return json({ prefs })
  }
  if (request.method !== 'PUT') return vide(405, { allow: 'GET, PUT' })
  const lu = await lireJSON(request, MAX_PREFS_OCTETS)
  if (lu instanceof Response) return lu
  const p = lirePrefs(lu.v)
  if (!p) return vide(400)
  await db.prepare('INSERT INTO reglages (qui, prefs, maj) VALUES (?1, ?2, ?3) ON CONFLICT(qui) DO UPDATE SET prefs = excluded.prefs, maj = excluded.maj')
    .bind(qui, JSON.stringify(p), Date.now()).run()
  return json({ ok: true })
}

/** Les routes `/api/courrier/*` (le code d'accès est déjà vérifié). */
export async function courrier(request: Request, url: URL, env: CourrierEnv): Promise<Response> {
  const { DB: db, COURRIER: r2 } = env
  if (!db || !r2) return vide(503)
  const m = request.method
  // Seule l'app elle-même écrit (le navigateur envoie Origin sur un PUT ou un POST)
  const origin = request.headers.get('Origin')
  if ((m === 'PUT' || m === 'POST') && origin && origin !== url.origin) return new Response('Origine refusée', { status: 403 })
  const p = url.pathname.slice('/api/courrier/'.length).split('/')
  const seule = (permise: string, fn: () => Promise<Response>) => (m === permise ? fn() : vide(405, { allow: permise }))
  if (p[0] === 'lettres' && p.length === 1) return seule('GET', () => liste(db))
  if (p[0] === 'lettres' && p.length === 2) return seule('PUT', () => ecrire(request, db, r2, p[1]))
  if (p[0] === 'lettres' && p.length === 3 && p[2] === 'jeter') return seule('POST', () => jeter(db, p[1]))
  if (p[0] === 'fichiers' && p[1] === 'lettres' && p.length === 4) {
    if (m === 'PUT') return poserFichier(request, db, r2, p[2], p[3])
    if (m === 'GET') return lireFichier(r2, p[2], p[3])
    return vide(405, { allow: 'GET, PUT' })
  }
  if (p[0] === 'reglages' && p.length === 2) return reglages(request, db, p[1])
  return vide(404)
}
