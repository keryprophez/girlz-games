/* 🎨 LE DEVINEUR de « Devine mon dessin » (8/10, le père : « DEVINE MON
   DESSIN ! ») : le chat de la ferme regarde le dessin et dit ce qu'il y voit.
   C'est Claude (l'API d'Anthropic) qui regarde : le SEUL endroit de l'app
   où quelque chose quitte la tablette — le dessin, réduit, sans prénom, sans
   voix, sans photo (exception à la règle 3 choisie par le père le 8/10).
   Anthropic efface ce qu'on lui envoie sous 30 jours et ne s'en sert pas
   pour entraîner ses modèles.

   - La clé est celle du père, collée une fois derrière la « Question de
     grand » ; elle reste sur la tablette (`localStorage`), jamais dans le
     dépôt (le site est public). Plafond de dépense : dans la console.
   - La réponse est une FICHE imposée (`SCHEMA`) : trois propositions
     courtes, chacune avec la photo de l'imagier qui lui correspond (ou
     « aucune »). Rien d'autre ne peut sortir ; `parseGuess` revérifie tout
     et tronque.
   - Le défi : selon le niveau, il choisit parmi les sujets du niveau (la
     fleur), parmi plus de sujets (l'éclair), ou parmi tout (la flamme).
   Logique pure et testée ici, sauf `guessDrawing` (l'appel réseau). */

/** Le mot de chaque photo de l'imagier, avec son article. */
export const WORDS: Record<string, [string, string]> = {
  apple: ['une', 'pomme'], baguette: ['une', 'baguette'], banana: ['une', 'banane'], bear: ['un', 'ours'], bison: ['un', 'bison'],
  bread: ['du', 'pain'], broccoli: ['un', 'brocoli'], butterfly: ['un', 'papillon'], cabbage: ['un', 'chou'], cake: ['un', 'gâteau'],
  carrot: ['une', 'carotte'], cat: ['un', 'chat'], cheese: ['du', 'fromage'], cherries: ['des', 'cerises'], chick: ['un', 'poussin'],
  chicken: ['une', 'poule'], cookie: ['un', 'biscuit'], corn: ['du', 'maïs'], cow: ['une', 'vache'], croissant: ['un', 'croissant'],
  cucumber: ['un', 'concombre'], cup: ['une', 'tasse'], deer: ['un', 'cerf'], dog: ['un', 'chien'], duck: ['un', 'canard'],
  egg: ['un', 'œuf'], eggplant: ['une', 'aubergine'], elephant: ['un', 'éléphant'], fish: ['un', 'poisson'], fox: ['un', 'renard'],
  frog: ['une', 'grenouille'], giraffe: ['une', 'girafe'], glass: ['un', 'verre'], goat: ['une', 'chèvre'], grapes: ['du', 'raisin'],
  hedgehog: ['un', 'hérisson'], hippo: ['un', 'hippopotame'], honey: ['du', 'miel'], horse: ['un', 'cheval'], kangaroo: ['un', 'kangourou'],
  koala: ['un', 'koala'], lemon: ['un', 'citron'], lion: ['un', 'lion'], llama: ['un', 'lama'], milk: ['du', 'lait'],
  monkey: ['un', 'singe'], moose: ['un', 'élan'], muffin: ['un', 'muffin'], mushroom: ['un', 'champignon'], onion: ['un', 'oignon'],
  orange: ['une', 'orange'], owl: ['un', 'hibou'], panda: ['un', 'panda'], parrot: ['un', 'perroquet'], peach: ['une', 'pêche'],
  pear: ['une', 'poire'], penguin: ['un', 'pingouin'], pig: ['un', 'cochon'], plate: ['une', 'assiette'], plum: ['une', 'prune'],
  pot: ['une', 'casserole'], potato: ['une', 'pomme de terre'], pumpkin: ['une', 'citrouille'], rabbit: ['un', 'lapin'], radish: ['un', 'radis'],
  sheep: ['un', 'mouton'], sloth: ['un', 'paresseux'], snake: ['un', 'serpent'], spoon: ['une', 'cuillère'], strawberry: ['une', 'fraise'],
  tiger: ['un', 'tigre'], tomato: ['une', 'tomate'], turtle: ['une', 'tortue'], watermelon: ['une', 'pastèque'], whale: ['une', 'baleine'],
  zebra: ['un', 'zèbre']
}

/** Les défis par niveau : ce qu'une enfant sait dessiner, du plus simple au plus dur. */
export const POOLS: Record<'easy' | 'med' | 'exp', string[]> = {
  easy: ['apple', 'banana', 'cat', 'fish', 'strawberry', 'carrot', 'mushroom', 'egg', 'cherries', 'snake', 'butterfly', 'cup', 'pear', 'lemon'],
  med: ['dog', 'pig', 'rabbit', 'turtle', 'duck', 'chick', 'owl', 'whale', 'cake', 'pumpkin', 'watermelon', 'spoon', 'croissant', 'frog', 'lion'],
  exp: ['elephant', 'giraffe', 'zebra', 'penguin', 'horse', 'cow', 'sheep', 'hedgehog', 'kangaroo', 'monkey', 'parrot', 'chicken', 'fox', 'bear', 'broccoli']
}

/** Ce qu'il peut répondre au défi : les sujets du niveau (fleur), ceux de la fleur et de l'éclair (éclair), tout (flamme : null). */
export function candidates(tier: 'easy' | 'med' | 'exp'): string[] | null {
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
          photo: { type: 'string', enum: [...PHOTO_IDS, 'aucune'] }
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

/* ---------- La clé (celle du père, sur la tablette seulement) ---------- */
const KEY = 'ferme:cle-claude'
export function getKey(): string {
  try { return localStorage.getItem(KEY) || '' } catch { return '' }
}
export function setKey(k: string) {
  try { if (k) localStorage.setItem(KEY, k.trim()); else localStorage.removeItem(KEY) } catch { /* stockage refusé */ }
}
/** Une clé de l'API Anthropic a cette forme. */
export const looksLikeKey = (k: string) => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k.trim())

/* ---------- L'appel ---------- */
export type GuessError = 'cle' | 'reseau' | 'limite' | 'refus' | 'autre'
export class GuessFailure extends Error {
  constructor(public why: GuessError) { super(why) }
}

/** Le modèle qui regarde : le meilleur pour lire un dessin d'enfant, réglé pour répondre vite. */
export const MODEL = 'claude-opus-5-5'

/** Montre le dessin (une image PNG en base64, sans l'en-tête `data:`) et rend ses trois propositions. */
export async function guessDrawing(key: string, png: string, cands: string[] | null, signal?: AbortSignal): Promise<Guess> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  // Dans le navigateur : la clé est celle du père, sur SA tablette (voir l'en-tête)
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 45_000 })
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
      // Un refus de sécurité (peu probable sur un dessin d'enfant) est rejoué par un autre modèle, côté serveur
      res = await client.beta.messages.create({ ...body, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal })
    } catch (e) {
      // Le paramètre refusé (400) : la même demande, sans lui
      if (e instanceof Anthropic.BadRequestError) res = await client.messages.create(body, { signal })
      else throw e
    }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new GuessFailure('cle')
    if (e instanceof Anthropic.RateLimitError) throw new GuessFailure('limite')
    if (e instanceof Anthropic.APIConnectionError) throw new GuessFailure('reseau')
    throw new GuessFailure('autre')
  }
  if (res.stop_reason === 'refusal') throw new GuessFailure('refus')
  const text = res.content.find(b => b.type === 'text')?.text
  let raw: unknown
  try { raw = text ? JSON.parse(text) : null } catch { raw = null }
  const g = parseGuess(raw)
  if (!g) throw new GuessFailure('autre')
  return g
}
