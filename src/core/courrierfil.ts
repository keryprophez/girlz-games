/* @version 2026-11-26 16:46 */
/* LE FIL du Courrier en ligne : la forme d'une lettre et des réglages tels
   qu'ils passent entre l'app et le Worker (JSON), leurs limites, les clés de
   leurs fichiers dans R2, et le texte que le père lit dans D1.

   AUCUN IMPORT : le Worker le lit aussi (`tsc -p worker`, sans DOM).

   `lireLettre` et `lirePrefs` rendent une COPIE PROPRE (les champs inconnus
   tombent) ou `null` au moindre écart : le Worker n'écrit rien qu'ils
   n'aient relu, l'app ne montre rien qu'ils n'aient relu. Un fichier de
   lettre a une clé fixe, `lettres/<id>/<nom>` : réécrire remplace. */

export type QuiFil = 'jade' | 'joyce'
export type EtatFil = 'brouillon' | 'cachetee' | 'postee' | 'ouverte' | 'gardee'
/** Les états dans l'ordre : une lettre ne recule jamais dans cette liste. */
export const ETATS: readonly EtatFil[] = ['brouillon', 'cachetee', 'postee', 'ouverte', 'gardee']
export const rang = (e: EtatFil) => ETATS.indexOf(e)

interface PoseFil { x: number; y: number; s: number; r: number }
export type ObjetFil =
  | (PoseFil & { k: 'texte'; t: string; couleur: string; police: string; taille: number })
  | (PoseFil & { k: 'gomme'; src: string })
  | (PoseFil & { k: 'voix'; cle: string; pics: number[]; duree: number })
export interface EnveloppeFil { couleur: string; cachet: string; timbre: string }
export interface LettreFil {
  id: string
  de: QuiFil
  a: QuiFil
  etat: EtatFil
  cree: number
  postee: number
  tour: number
  papier: string
  env: EnveloppeFil | null
  objets: ObjetFil[]
  /** La clé R2 du dessin, ou null. */
  peinture: string | null
  /** Le compteur d'écritures de l'app : le Worker refuse un nombre qui n'avance pas. */
  version: number
}
export interface PrefsFil { envois: number; env: EnveloppeFil | null; faits: string[] }

/** Les mêmes que `core/courrier.ts` (un test le vérifie). */
export const MAX_OBJETS = 40
export const MAX_VOIX = 5
/** Le pire PNG de 1500 × 1000 (du bruit pur) fait 6 Mo. */
export const MAX_PEINTURE = 8 * 1024 * 1024
export const MAX_VOIX_OCTETS = 2 * 1024 * 1024
export const MAX_LETTRE_OCTETS = 128 * 1024

export const ID = /^[a-z0-9-]{1,64}$/
const QUI: readonly string[] = ['jade', 'joyce']
const VOIX = /^voix-[a-z0-9]{1,16}\.webm$/

export const cleDe = (id: string, nom: string) => `lettres/${id}/${nom}`
export function nomFichier(nom: string): 'peinture' | 'voix' | null {
  if (nom === 'peinture.png') return 'peinture'
  return VOIX.test(nom) ? 'voix' : null
}

type Brut = Record<string, unknown>
const objet = (x: unknown): x is Brut => typeof x === 'object' && x !== null && !Array.isArray(x)
const fini = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const positif = (x: unknown): x is number => fini(x) && x >= 0
const chaine = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max

function lireEnveloppe(x: unknown): EnveloppeFil | null | undefined {
  if (x === null) return null
  if (!objet(x) || !chaine(x.couleur, 120) || !chaine(x.cachet, 120) || !chaine(x.timbre, 120)) return undefined
  return { couleur: x.couleur, cachet: x.cachet, timbre: x.timbre }
}

function lireObjet(x: unknown, id: string): ObjetFil | null {
  if (!objet(x) || !fini(x.x) || !fini(x.y) || !fini(x.s) || !fini(x.r)) return null
  const pose = { x: x.x, y: x.y, s: x.s, r: x.r }
  if (x.k === 'texte') {
    if (!chaine(x.t, 2000) || !chaine(x.couleur, 20) || !chaine(x.police, 40) || !fini(x.taille)) return null
    return { k: 'texte', t: x.t, couleur: x.couleur, police: x.police, taille: x.taille, ...pose }
  }
  if (x.k === 'gomme') return chaine(x.src, 200) ? { k: 'gomme', src: x.src, ...pose } : null
  if (x.k === 'voix') {
    const nom = typeof x.cle === 'string' ? x.cle.slice(cleDe(id, '').length) : ''
    if (x.cle !== cleDe(id, nom) || nomFichier(nom) !== 'voix') return null
    if (!Array.isArray(x.pics) || x.pics.length > 100 || !x.pics.every(fini)) return null
    if (!fini(x.duree) || x.duree < 0 || x.duree > 30) return null
    return { k: 'voix', cle: x.cle, pics: [...x.pics], duree: x.duree, ...pose }
  }
  return null
}

/** La lettre `id`, relue et copiée ; null au moindre écart. */
export function lireLettre(x: unknown, id: string): LettreFil | null {
  if (!objet(x) || x.id !== id || !ID.test(id)) return null
  const { de, a, etat } = x
  if (typeof de !== 'string' || typeof a !== 'string' || !QUI.includes(de) || !QUI.includes(a) || de === a) return null
  if (typeof etat !== 'string' || !ETATS.includes(etat as EtatFil)) return null
  if (!positif(x.cree) || !positif(x.postee) || !positif(x.tour)) return null
  if (!Number.isInteger(x.version) || (x.version as number) < 1) return null
  if (!chaine(x.papier, 20)) return null
  const env = lireEnveloppe(x.env)
  if (env === undefined) return null
  if (x.peinture !== null && x.peinture !== cleDe(id, 'peinture.png')) return null
  if (!Array.isArray(x.objets) || x.objets.length > MAX_OBJETS) return null
  const objets: ObjetFil[] = []
  for (const o of x.objets) {
    const lu = lireObjet(o, id)
    if (!lu) return null
    objets.push(lu)
  }
  if (objets.filter(o => o.k === 'voix').length > MAX_VOIX) return null
  return {
    id, de: de as QuiFil, a: a as QuiFil, etat: etat as EtatFil, cree: x.cree, postee: x.postee, tour: x.tour,
    papier: x.papier, env, objets, peinture: x.peinture, version: x.version as number
  }
}

/** Les réglages d'une fille, relus et copiés ; null au moindre écart. */
export function lirePrefs(x: unknown): PrefsFil | null {
  if (!objet(x) || !Number.isInteger(x.envois) || (x.envois as number) < 0) return null
  const env = lireEnveloppe(x.env)
  if (env === undefined) return null
  if (!Array.isArray(x.faits) || x.faits.length > 30 || !x.faits.every(f => chaine(f, 30))) return null
  return { envois: x.envois as number, env, faits: [...x.faits] as string[] }
}

/** Les clés R2 que la lettre désigne : son dessin, puis chaque voix. */
export const fichiersDe = (l: LettreFil): string[] => [
  ...(l.peinture ? [l.peinture] : []),
  ...l.objets.flatMap(o => (o.k === 'voix' ? [o.cle] : []))
]

/** Ce que le père lit dans D1 : les textes de haut en bas, émojis compris. */
export const texteDe = (l: LettreFil) => l.objets
  .flatMap(o => (o.k === 'texte' ? [o] : []))
  .sort((p, q) => p.y - q.y)
  .map(o => o.t)
  .join('\n')
