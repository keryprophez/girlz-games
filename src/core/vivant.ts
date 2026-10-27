/* 🧸 « MON DESSIN PREND VIE » (18/10, la Ferme à construire) : elle dessine
   un animal, il devient une peluche dans sa ferme — et Claude, qui regarde
   le dessin, dit comment il vit. Deuxième (et dernier) endroit où quelque
   chose quitte la tablette, choisi par le père le 18/10 : le DESSIN, réduit,
   sans prénom, sans voix, sans photo, par NOTRE Worker (`/api/vivant`, la
   clé du père en secret du Worker), comme Devine mon dessin (règle 3).

   La réponse est une FICHE imposée (`SCHEMA`), rien que des choix fermés :
   son allure (il marche, saute, vole, rampe ou nage), le côté où il
   regarde (pour se retourner dans le bon sens quand il change de
   direction), le cri qui lui va parmi les dix vrais cris de la ferme (ou
   aucun), sa taille. Pas un mot de texte ne revient. Sans réponse (pas de
   clé, pas de réseau), la peluche sautille sans cri (`DEFAULT`).
   Logique pure et testée ici (lue aussi par le Worker), sauf `askVivant`
   (l'appel réseau). */
import { GuessFailure, isGuessError, withDeadline } from './drawguess'

export type Allure = 'marche' | 'saute' | 'vole' | 'rampe' | 'nage'
export type Regard = 'gauche' | 'droite' | 'face'
export type Taille = 'petit' | 'moyen' | 'grand'
export interface Vivant { allure: Allure; regard: Regard; cri: Cri | null; taille: Taille }

export const ALLURES: readonly Allure[] = ['marche', 'saute', 'vole', 'rampe', 'nage']
export const REGARDS: readonly Regard[] = ['gauche', 'droite', 'face']
export const TAILLES: readonly Taille[] = ['petit', 'moyen', 'grand']
/** Les dix cris enregistrés (les `AnimalVoice` de `core/sfx.ts`, que le
    Worker ne lit pas), et ce qu'ils sont, pour Claude. */
export type Cri = 'vache' | 'poule' | 'canard' | 'mouton' | 'cochon' | 'chien' | 'coq' | 'chevre' | 'cheval' | 'chat'
export const CRIS: Record<Cri, string> = {
  vache: 'meuh (vache)', poule: 'cot cot (poule)', canard: 'coin coin (canard)', mouton: 'bêê (mouton)', cochon: 'groin groin (cochon)',
  chien: 'ouaf (chien)', coq: 'cocorico (coq)', chevre: 'mêê (chèvre)', cheval: 'hennissement (cheval)', chat: 'miaou (chat)'
}
const CRI_IDS = Object.keys(CRIS) as Cri[]

/** Sans réponse de Claude : une peluche qui sautille, sans cri. */
export const DEFAULT: Vivant = { allure: 'saute', regard: 'droite', cri: null, taille: 'moyen' }

/** La fiche imposée : quatre choix fermés. */
export const SCHEMA = {
  type: 'object',
  properties: {
    allure: { type: 'string', enum: [...ALLURES] },
    regard: { type: 'string', enum: [...REGARDS] },
    cri: { type: 'string', enum: [...CRI_IDS, 'aucun'] },
    taille: { type: 'string', enum: [...TAILLES] }
  },
  required: ['allure', 'regard', 'cri', 'taille'],
  additionalProperties: false
} as const

/** Ce qu'on lui dit, figé (rien de variable : il se garde en cache). */
export function systemPrompt(): string {
  return [
    "Tu regardes le dessin d'une petite fille de 6 ou 8 ans, fait au doigt sur une tablette : un animal, réel ou inventé, qui va devenir une peluche et vivre dans sa ferme. Tu décides comment il vit, avec quatre choix.",
    'allure — comment il se déplace : « vole » s’il a des ailes (oiseau, papillon, dragon, abeille), « nage » si c’est un animal de l’eau (poisson, baleine, canard, tortue de mer), « rampe » s’il n’a pas de pattes (serpent, ver, escargot, chenille), « saute » s’il saute (lapin, grenouille, kangourou, sauterelle), sinon « marche ».',
    'regard — de quel côté de la feuille regarde sa tête : « gauche », « droite », ou « face » s’il nous regarde en face (un visage rond, un monstre de face).',
    'cri — le cri qui lui irait le mieux parmi ceux-ci, ou « aucun » si aucun ne lui va vraiment (un poisson, un papillon) : ' +
      CRI_IDS.map(id => `${id} = ${CRIS[id]}`).join(', ') + '. Un animal qui ressemble à l’un d’eux prend son cri (un lion ou un tigre : chat ; un loup : chien ; un oiseau : poule ; un âne : cheval).',
    'taille — « petit » (souris, insecte, oiseau, poussin), « moyen » (chat, chien, lapin, mouton) ou « grand » (vache, cheval, éléphant, girafe, dragon).',
    "Un dessin d'enfant est simple : cherche ce qu'elle a voulu dessiner. Si tu ne reconnais rien, choisis ce qui ferait la peluche la plus joyeuse."
  ].join('\n')
}
export const USER_PROMPT = 'Voici son dessin. Comment vit-il ?'

const pick = <V extends string>(x: unknown, list: readonly V[]): V | null => (list as readonly unknown[]).includes(x) ? x as V : null

/** Revérifie la fiche : quatre choix connus (un cri « aucun » ou inconnu = pas de cri). */
export function parseVivant(raw: unknown): Vivant | null {
  const o = raw as Record<string, unknown> | null
  if (!o || typeof o !== 'object') return null
  const allure = pick(o.allure, ALLURES), regard = pick(o.regard, REGARDS), taille = pick(o.taille, TAILLES)
  if (!allure || !regard || !taille) return null
  return { allure, regard, taille, cri: pick(o.cri, CRI_IDS) }
}

/** Montre le dessin (une image PNG en base64, sans l'en-tête `data:`) et rend sa fiche. */
export async function askVivant(png: string, signal?: AbortSignal): Promise<Vivant> {
  let res: Response
  try {
    res = await fetch('/api/vivant', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ png }),
      signal: withDeadline(signal)
    })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw new GuessFailure('reseau')
  }
  if (res.status === 401) throw new GuessFailure('cle')
  let data: unknown = null
  try { data = await res.json() } catch { /* pas du JSON */ }
  if (!res.ok) {
    const why = (data as { error?: unknown } | null)?.error
    throw new GuessFailure(isGuessError(why) ? why : 'autre')
  }
  const v = parseVivant(data)
  if (!v) throw new GuessFailure('autre')
  return v
}
