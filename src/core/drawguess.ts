/* 🎨 LE DEVINEUR de « Devine mon dessin » (8/10, le père : « DEVINE MON
   DESSIN ! ») : le chat de la ferme regarde le dessin et dit ce qu'il y voit.
   C'est Claude (l'API d'Anthropic) qui regarde : le SEUL endroit de l'app
   où quelque chose quitte la tablette — le dessin, réduit, sans prénom, sans
   voix, sans photo (exception à la règle 3 choisie par le père le 8/10).
   Anthropic efface ce qu'on lui envoie sous 30 jours et ne s'en sert pas
   pour entraîner ses modèles.

   - Le jeu envoie le dessin à NOTRE Worker (`/api/devine`, derrière le code
     d'accès de l'app) ; c'est lui qui appelle Claude avec la clé du père,
     un secret du Worker (`worker/devine.ts`). La clé n'est ni dans l'app,
     ni sur la tablette, ni dans le dépôt (9/10).
   - La réponse est une FICHE imposée (`SCHEMA`) : trois propositions
     courtes, chacune avec la photo de l'imagier qui lui correspond (ou
     « aucune »). Rien d'autre ne peut sortir ; `parseGuess` revérifie tout
     (une photo inconnue devient « aucune ») et tronque, au Worker puis dans
     le jeu.
   - Le défi : selon le niveau, il choisit parmi les sujets du niveau (la
     fleur), parmi plus de sujets (l'éclair), ou parmi tout (la flamme).
   Logique pure et testée ici (lue aussi par le Worker), sauf `guessDrawing`
   (l'appel réseau). */

import { IMAGIER } from './imagier'

/** Le mot de chaque photo de l'imagier, avec son article (`core/imagier.ts`). */
export const WORDS: Record<string, [string, string]> = Object.fromEntries(IMAGIER.map(p => [p.id, [p.article, p.mot]]))

/** Les défis par niveau : ce qu'une enfant sait dessiner, du plus simple au
    plus dur (29/10 : la colonne « dessin » de l'imagier, une centaine de
    sujets au lieu de quarante-quatre ; la tarte aux fruits est sortie). */
export const POOLS: Record<'easy' | 'med' | 'exp', string[]> = {
  easy: IMAGIER.filter(p => p.dessin === 1).map(p => p.id),
  med: IMAGIER.filter(p => p.dessin === 2).map(p => p.id),
  exp: IMAGIER.filter(p => p.dessin === 3).map(p => p.id)
}

/** Ce qu'il peut répondre au défi : les sujets du niveau (fleur), ceux de la fleur et de l'éclair (éclair), tout (flamme : null). */
export function candidates(tier: Tier): string[] | null {
  if (tier === 'easy') return POOLS.easy
  if (tier === 'med') return [...POOLS.easy, ...POOLS.med]
  return null
}

export interface GuessItem { article: string; mot: string; photo: string | null }
export interface Guess { items: GuessItem[] }

const PHOTO_IDS = Object.keys(WORDS)

/** La fiche imposée : trois propositions, la photo de l'imagier ou « aucune ». */
export const SCHEMA = {
  type: 'object',
  properties: {
    propositions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          article: { type: 'string', enum: ['un', 'une', 'des', 'du', 'de la', "de l'"] },
          mot: { type: 'string' },
          // Pas d'`enum` (29/10) : cinq cents identifiants alourdiraient la
          // grammaire de la réponse ; la liste est dans le message système,
          // et `parseGuess` écarte ce qui n'est pas une photo de l'imagier
          photo: { type: 'string' }
        },
        required: ['article', 'mot', 'photo'],
        additionalProperties: false
      }
    }
  },
  required: ['propositions'],
  additionalProperties: false
} as const

/** Ce qu'on lui dit : qui il est, à qui il parle, ce qu'il doit rendre. Figé (pas de date, rien de variable) : il se garde en cache. */
export function systemPrompt(): string {
  return [
    "Tu es le chat de la ferme dans un jeu pour deux petites filles de 6 et 8 ans. Elles dessinent avec le doigt sur une tablette, et tu devines ce qu'elles ont dessiné.",
    "Réponds avec trois propositions, de la plus probable à la moins probable : chacune est un nom commun très court en français (un ou deux mots), avec son article.",
    "Pour chaque proposition, si elle correspond à l'une de ces photos, donne son identifiant dans « photo », sinon « aucune » : " +
      PHOTO_IDS.map(id => `${id} = ${WORDS[id][1]}`).join(', ') + '.',
    "Un dessin d'enfant est simple : un rond avec des oreilles pointues et des moustaches est un chat. Cherche ce que l'enfant a voulu dessiner, pas ce qu'un adulte y verrait.",
    "Reste toujours gentil et adapté à de jeunes enfants : jamais de moquerie, jamais de jugement sur le dessin, jamais rien d'effrayant. Si le dessin est vide ou impossible à reconnaître, propose quand même ce qui y ressemble le plus."
  ].join('\n')
}

/** Ce qu'on demande pour ce dessin : la liste fermée des réponses possibles (fleur, éclair), ou rien (tout est permis). */
export function userPrompt(cands: string[] | null): string {
  if (!cands) return 'Qu\'est-ce que c\'est ?'
  return 'Qu\'est-ce que c\'est ? Choisis parmi : ' + cands.map(id => WORDS[id][1]).join(', ') + '.'
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()

/** Revérifie la fiche : au plus trois propositions, des mots courts, une photo qui existe (sinon rien). */
export function parseGuess(raw: unknown): Guess | null {
  const list = (raw as { propositions?: unknown } | null)?.propositions
  if (!Array.isArray(list)) return null
  const items: GuessItem[] = []
  for (const it of list) {
    const o = it as { article?: unknown; mot?: unknown; photo?: unknown }
    if (typeof o?.mot !== 'string') continue
    const mot = o.mot.trim().replace(/\s+/g, ' ').slice(0, 24)
    if (!mot || !/^[\p{L} '’-]+$/u.test(mot)) continue
    const photo = typeof o.photo === 'string' && o.photo in WORDS ? o.photo : null
    const article = typeof o.article === 'string' && ['un', 'une', 'des', 'du', 'de la', "de l'"].includes(o.article) ? o.article : ''
    // Le même mot deux fois ne compte qu'une
    if (items.some(x => norm(x.mot) === norm(mot))) continue
    items.push({ article, mot, photo })
    if (items.length === 3) break
  }
  return items.length ? { items } : null
}

/** Est-ce le sujet du défi ? Par la photo, ou par le mot (sans accents ni majuscules, un pluriel en -s accepté). */
export function matches(g: GuessItem, target: string): boolean {
  if (g.photo === target) return true
  const want = norm(WORDS[target]?.[1] ?? target), got = norm(g.mot)
  return got === want || got === want + 's' || got + 's' === want
}

/** Ce qu'il dit à voix haute : « Un chat ? » */
export function spoken(g: GuessItem): string {
  const s = !g.article ? g.mot : g.article.endsWith("'") ? g.article + g.mot : `${g.article} ${g.mot}`
  return s[0].toUpperCase() + s.slice(1) + ' ?'
}

/* ---------- L'appel ---------- */
export type GuessError = 'cle' | 'reseau' | 'limite' | 'refus' | 'autre'
const ERRORS: readonly GuessError[] = ['cle', 'reseau', 'limite', 'refus', 'autre']
export const isGuessError = (x: unknown): x is GuessError => ERRORS.includes(x as GuessError)
export class GuessFailure extends Error {
  constructor(public why: GuessError) { super(why) }
}

/** Le modèle qui regarde (au Worker) : le meilleur pour lire un dessin d'enfant, réglé pour répondre vite. */
export const MODEL = 'claude-opus-5-5'

export type Tier = 'easy' | 'med' | 'exp'

/** L'attente au plus (le Worker abandonne avant) : au-delà, le chat dit
    « pas de réseau » au lieu de réfléchir une minute et demie. */
export const ASK_MS = 35_000

/** Le signal de l'appelant, plus le délai : `TimeoutError` (pas `AbortError`)
    quand c'est le délai qui coupe. `AbortSignal.any` et `.timeout` manquent
    aux navigateurs d'avant Chromium 116 : sans eux, la même chose à la main
    (sinon chaque appel finissait en « pas de réseau »). */
export function withDeadline(signal?: AbortSignal, ms = ASK_MS): AbortSignal {
  const A = AbortSignal as typeof AbortSignal & { any?: (s: AbortSignal[]) => AbortSignal }
  if (typeof A.any === 'function' && typeof A.timeout === 'function') {
    const t = A.timeout(ms)
    return signal ? A.any([signal, t]) : t
  }
  const c = new AbortController()
  const timer = setTimeout(() => c.abort(new DOMException('délai dépassé', 'TimeoutError')), ms)
  signal?.addEventListener('abort', () => { clearTimeout(timer); c.abort(signal.reason) }, { once: true })
  return c.signal
}

/** Montre le dessin (une image PNG en base64, sans l'en-tête `data:`) et rend ses trois propositions.
 *  `tier` : le défi de ce niveau (parmi quels sujets il devine) ; null : Libre, parmi tout. */
export async function guessDrawing(png: string, tier: Tier | null, signal?: AbortSignal): Promise<Guess> {
  let res: Response
  try {
    res = await fetch('/api/devine', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ png, tier: tier ?? 'libre' }),
      signal: withDeadline(signal)
    })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw new GuessFailure('reseau')
  }
  // 401 : la session du code d'accès a expiré (un grand doit le retaper)
  if (res.status === 401) throw new GuessFailure('cle')
  let data: unknown = null
  try { data = await res.json() } catch { /* pas du JSON */ }
  if (!res.ok) {
    const why = (data as { error?: unknown } | null)?.error
    throw new GuessFailure(isGuessError(why) ? why : 'autre')
  }
  const g = parseGuess(data)
  if (!g) throw new GuessFailure('autre')
  return g
}
