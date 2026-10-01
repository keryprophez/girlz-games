/* Les sons des Cubes de l'alphabet (30/09) — pensés pour Jade, qui apprend
   à lire au CP. Logique pure, testée (`phonics.test.ts`).

   Un cube porte un GRAPHÈME, pas forcément une lettre : « ch », « ou »,
   « on », « pp »… comme les étiquettes de la classe. Chaque graphème a un
   SON ; chaque mot est découpé à la main en SYLLABES (les syllabes écrites
   du CP : to-ma-te, ba-na-ne), et chaque syllabe a le texte que la voix
   doit prononcer.

   Pourquoi des textes écrits à la main : la synthèse vocale du navigateur
   lit une lettre seule par son NOM (« m » → « èm », « p » → « pé ») et
   devine mal les bouts de mots (« com » → « comme », « fan » à l'anglaise).
   On lui donne donc ce qui se prononce juste : « mmm », « peu », « champ »
   pour « cham », « faon » pour « phan ». Les consonnes qui se prolongent
   (m, s, f, ch…) sont écrites longues ET terminées par une voyelle
   (« ssseu ») : une suite de consonnes seules serait épelée lettre par
   lettre par certains moteurs. À écouter sur la tablette : tout se règle
   ICI, une ligne par son. */

export type SoundKey =
  | 'a' | 'e' | 'é' | 'è' | 'i' | 'o' | 'u' | 'ou' | 'on' | 'an' | 'in' | 'oi' | 'eu' | 'y'
  | 'm' | 'n' | 'l' | 'r' | 's' | 'f' | 'v' | 'ch' | 'j' | 'z'
  | 'p' | 't' | 'k' | 'b' | 'd' | 'g' | 'gn'

/** Le son → le texte à donner à la voix, et s'il est voyelle (cube rouge). */
export const SOUNDS: Record<SoundKey, { say: string; vowel: boolean }> = {
  // Les voyelles : leur nom EST leur son
  a: { say: 'a', vowel: true },
  e: { say: 'e', vowel: true },
  é: { say: 'é', vowel: true },
  è: { say: 'è', vowel: true },
  i: { say: 'i', vowel: true },
  o: { say: 'o', vowel: true },
  u: { say: 'u', vowel: true },
  ou: { say: 'ou', vowel: true },
  on: { say: 'on', vowel: true },
  an: { say: 'an', vowel: true },
  // « in » seul serait lu à l'anglaise : « hein » se prononce [ɛ̃] partout
  in: { say: 'hein', vowel: true },
  oi: { say: 'oie', vowel: true },
  eu: { say: 'eux', vowel: true },
  // Le « ill » de papillon, le « y » de Joyce : [j]
  y: { say: 'ye', vowel: false },
  // Les consonnes qui se prolongent : « mmm » (le mot du père), les autres
  // longues puis une voyelle, pour qu'aucun moteur ne les épelle
  m: { say: 'mmm', vowel: false },
  n: { say: 'nnneu', vowel: false },
  l: { say: 'llleu', vowel: false },
  r: { say: 'rrreu', vowel: false },
  s: { say: 'ssseu', vowel: false },
  f: { say: 'fffeu', vowel: false },
  v: { say: 'vvveu', vowel: false },
  ch: { say: 'chhheu', vowel: false },
  j: { say: 'jjjeu', vowel: false },
  z: { say: 'zzzeu', vowel: false },
  // Les consonnes qui claquent : un souffle de « e » (« p comme peu »)
  p: { say: 'peu', vowel: false },
  t: { say: 'teu', vowel: false },
  k: { say: 'keu', vowel: false },
  b: { say: 'beu', vowel: false },
  d: { say: 'deu', vowel: false },
  g: { say: 'gueu', vowel: false },
  gn: { say: 'gneu', vowel: false }
}

/** Le son habituel d'un graphème ; `null` = lettre muette (le « h » de hibou).
    Un mot peut le corriger (« c:s » dans citrouille, « e:è » dans perroquet). */
const USUAL: Record<string, SoundKey | null> = {
  a: 'a', e: 'e', é: 'é', è: 'è', ê: 'è', i: 'i', o: 'o', u: 'u', y: 'i',
  ou: 'ou', on: 'on', om: 'on', an: 'an', am: 'an', en: 'an', in: 'in', oi: 'oi',
  au: 'o', eau: 'o', ai: 'è', ei: 'è', eu: 'eu', ill: 'y',
  b: 'b', c: 'k', d: 'd', f: 'f', g: 'g', h: null, j: 'j', k: 'k', l: 'l', m: 'm', n: 'n',
  p: 'p', q: 'k', r: 'r', s: 's', t: 't', v: 'v', z: 'z',
  ch: 'ch', gn: 'gn', ph: 'f', qu: 'k',
  pp: 'p', tt: 't', ss: 's', rr: 'r', ll: 'l', mm: 'm', nn: 'n'
}

export interface Grapheme {
  /** Ce qui est peint sur le cube (minuscules d'imprimerie). */
  t: string
  /** Son ; null = lettre muette (peinte en gris, ne dit rien). */
  s: SoundKey | null
  /** Numéro de la syllabe qui le contient. */
  syl: number
}
export interface Syllable {
  /** Indices des graphèmes (de…à, inclus). */
  from: number
  to: number
  /** Ce que la voix prononce pour cette syllabe. */
  say: string
}
export interface Word {
  /** Le mot écrit, en capitales (identifiant, compatible avec l'ancienne Chasse). */
  id: string
  /** Le mot tel que la voix le dit (minuscules, accents). */
  text: string
  /** La photo de l'imagier (`photoImg`) ; absente pour un prénom. */
  pic?: string
  g: Grapheme[]
  syl: Syllable[]
}

/* Un mot s'écrit : les syllabes séparées par « | », les graphèmes par des
   espaces, un son corrigé après « : » (« t: » = muet, « c:s », « e:è »),
   et les textes à dire, syllabe par syllabe, séparés par « | ». */
interface Spec { cut: string; say: string; pic?: string }

function build(id: string, sp: Spec): Word {
  const g: Grapheme[] = []
  const syl: Syllable[] = []
  const says = sp.say.split('|')
  sp.cut.split('|').forEach((part, k) => {
    const from = g.length
    for (const tok of part.trim().split(/\s+/)) {
      const [t, over] = tok.split(':')
      const s = over === undefined ? USUAL[t] : over === '' ? null : over as SoundKey
      if (s === undefined) throw new Error(`graphème inconnu « ${t} » dans ${id}`)
      g.push({ t, s, syl: k })
    }
    syl.push({ from, to: g.length - 1, say: (says[k] ?? '').trim() })
  })
  return { id, text: g.map(x => x.t).join(''), pic: sp.pic, g, syl }
}

/* ---------- Les mots, par niveau ----------
   Fleur : courts et réguliers, des syllabes consonne + voyelle.
   Éclair : plus longs — sons complexes (in, on, oi, ch), lettres muettes.
   Flamme : les longs mots (hippopotame, champignon, citrouille…). */
const FLEUR: Record<string, Spec> = {
  LAMA: { cut: 'l a | m a', say: 'la|ma', pic: 'llama' },
  TOMATE: { cut: 't o | m a | t e', say: 'to|ma|te', pic: 'tomato' },
  BANANE: { cut: 'b a | n a | n e', say: 'ba|na|ne', pic: 'banana' },
  PATATE: { cut: 'p a | t a | t e', say: 'pa|ta|te', pic: 'potato' },
  // « ko » écrit « co » : « KO » se lirait « K.O. »
  KOALA: { cut: 'k o | a | l a', say: 'co|a|la', pic: 'koala' },
  VACHE: { cut: 'v a | ch e', say: 'va|cheu', pic: 'cow' },
  POULE: { cut: 'p ou | l e', say: 'pou|le', pic: 'chicken' }
}
const ECLAIR: Record<string, Spec> = {
  LAPIN: { cut: 'l a | p in', say: 'la|pin', pic: 'rabbit' },
  CHEVAL: { cut: 'ch e | v a l', say: 'cheu|val', pic: 'horse' },
  COCHON: { cut: 'c o | ch on', say: 'co|chon', pic: 'pig' },
  CANARD: { cut: 'c a | n a r d:', say: 'ca|nar', pic: 'duck' },
  HIBOU: { cut: 'h: i | b ou', say: 'i|bou', pic: 'owl' },
  GIRAFE: { cut: 'g:j i | r a | f e', say: 'gi|ra|feu', pic: 'giraffe' },
  CAROTTE: { cut: 'c a | r o | tt e', say: 'ca|ro|te', pic: 'carrot' },
  MOUTON: { cut: 'm ou | t on', say: 'mou|ton', pic: 'sheep' },
  TORTUE: { cut: 't o r | t u e:', say: 'tor|tu', pic: 'turtle' },
  POISSON: { cut: 'p oi | ss on', say: 'pois|son', pic: 'fish' },
  RENARD: { cut: 'r e | n a r d:', say: 'reu|nar', pic: 'fox' },
  // « lè » écrit « lait » : même son, et la voix le connaît
  BALEINE: { cut: 'b a | l ei | n e', say: 'ba|lait|ne', pic: 'whale' }
}
const FLAMME: Record<string, Spec> = {
  HIPPOPOTAME: { cut: 'h: i | pp o | p o | t a | m e', say: 'i|po|po|ta|me', pic: 'hippo' },
  // « cham » écrit « champ » : la voix dirait « came »
  CHAMPIGNON: { cut: 'ch am | p i | gn on', say: 'champ|pi|gnon', pic: 'mushroom' },
  CITROUILLE: { cut: 'c:s i | t r ou ill e:', say: 'ci|trouille', pic: 'pumpkin' },
  KANGOUROU: { cut: 'k an | g ou | r ou', say: 'quand|goût|roue', pic: 'kangaroo' },
  PAPILLON: { cut: 'p a | p i | ll:y on', say: 'pa|pi|yon', pic: 'butterfly' },
  AUBERGINE: { cut: 'au | b e:è r | g:j i | n e', say: 'au|ber|gi|ne', pic: 'eggplant' },
  // « con », « com » : la voix dirait « comme » — « qu'on » sonne juste
  CONCOMBRE: { cut: 'c on | c om | b r e', say: "qu'on|qu'on|breu", pic: 'cucumber' },
  HÉRISSON: { cut: 'h: é | r i | ss on', say: 'é|ri|son', pic: 'hedgehog' },
  GRENOUILLE: { cut: 'g r e | n ou ill e:', say: 'greu|nouille', pic: 'frog' },
  PERROQUET: { cut: 'p e:è | rr o | qu e:è t:', say: 'paix|ro|quet', pic: 'parrot' },
  PINGOUIN: { cut: 'p in | g ou in', say: 'pin|gouin', pic: 'penguin' },
  // « phan » écrit « faon » : « fan » se lirait à l'anglaise
  ÉLÉPHANT: { cut: 'é | l é | ph an t:', say: 'é|lé|faon', pic: 'elephant' }
}
/* Les prénoms (quand on sait qui joue : caché tant que SHOW_PROFILES l'est) */
const NAMES: Record<string, Spec> = {
  JADE: { cut: 'j a | d e', say: 'ja|de' },
  JOYCE: { cut: 'j o y:y c:s e:', say: 'Joyce' }
}

const all = (o: Record<string, Spec>) => Object.entries(o).map(([id, sp]) => build(id, sp))
export const WORDS = { easy: all(FLEUR), med: all(ECLAIR), exp: all(FLAMME) }
export const NAME_WORDS = all(NAMES)

/** Le prénom de la joueuse, s'il est connu (sinon null : on n'invente pas). */
export function nameWord(name: string): Word | null {
  const k = name.trim().toUpperCase()
  return NAME_WORDS.find(w => w.id === k) ?? null
}

/** Ce que la voix dit quand le cube n°i se pose (les précédents déjà posés) :
    son son (rien pour une lettre muette), puis la syllabe si elle est
    complète — une seule fois quand la syllabe n'est que ce son (le « a »
    de koala). Le mot entier, lui, est dit par la lecture finale. */
export function landing(w: Word, i: number): string[] {
  const out: string[] = []
  const gr = w.g[i]
  const sound = gr.s ? SOUNDS[gr.s].say : null
  const sy = w.syl[gr.syl]
  const done = sy.to === i
  if (sound && !(done && sy.say === sound)) out.push(sound)
  if (done) out.push(sy.say)
  return out
}

/** La lecture finale, « comme un doigt qui lit » : chaque syllabe, puis le mot. */
export function reading(w: Word): string[] {
  return w.syl.length > 1 ? [...w.syl.map(s => s.say), w.text] : [w.text]
}

/** La peinture d'un cube, comme au CP : voyelles en rouge, consonnes en
    bleu, lettres muettes en gris. `s` : le son dans le mot (sinon le son
    habituel du graphème, pour un leurre). */
export function paintOf(t: string, s?: SoundKey | null): 'vowel' | 'consonant' | 'mute' {
  const k = s === undefined ? USUAL[t] : s
  if (k === null) return 'mute'
  if (k === undefined) return /^[aeiouyéèê]/.test(t) ? 'vowel' : 'consonant'
  return SOUNDS[k].vowel ? 'vowel' : 'consonant'
}

/** Est-ce un mot « régulier » de la fleur : chaque syllabe = une consonne
    (ou rien) puis une voyelle, sans lettre muette. */
export function isSimpleCV(w: Word): boolean {
  return w.syl.every(s => {
    const gs = w.g.slice(s.from, s.to + 1)
    if (gs.some(x => x.s === null)) return false
    const v = gs.map(x => SOUNDS[x.s!].vowel)
    return (v.length === 1 && v[0]) || (v.length === 2 && !v[0] && v[1])
  })
}

/* ---------- Les leurres ----------
   Des cubes qui ne servent pas au mot. Dès l'éclair, des PIÈGES VOISINS :
   les lettres miroirs (b/d, p/q), les sons proches (on/an/ou, m/n, f/v). */
const NEIGHBORS: Record<string, string[]> = {
  b: ['d', 'p'], d: ['b', 'q'], p: ['q', 'b'], q: ['p'], m: ['n'], n: ['m', 'u'], u: ['n'],
  f: ['v'], v: ['f'], t: ['d'], s: ['z'], z: ['s'], l: ['i'], i: ['l'], a: ['o'], o: ['a'],
  é: ['è'], è: ['é'], ou: ['on', 'oi'], on: ['ou', 'an'], an: ['on', 'in'], in: ['an', 'on'],
  oi: ['ou', 'on'], ch: ['gn'], gn: ['ch'], ph: ['f'], qu: ['q'], am: ['an'], om: ['on']
}
const LETTERS = 'abcdefghijlmnoprstuvz'.split('')
const COMPLEX = ['ou', 'on', 'an', 'in', 'oi', 'ch', 'au', 'é', 'è']

/** Les leurres d'un mot : `n` cubes, jamais un graphème du mot. `rand` pour
    les tests (hasard reproductible). */
export function decoys(w: Word, n: number, tier: 'easy' | 'med' | 'exp', rand: () => number = Math.random): string[] {
  const used = new Set(w.g.map(x => x.t))
  const out: string[] = []
  const take = (t: string) => { if (!used.has(t) && !out.includes(t) && out.length < n) out.push(t) }
  const shuffled = <T>(a: T[]) => {
    const b = a.slice()
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] }
    return b
  }
  if (tier !== 'easy') {
    // Au plus la moitié des leurres sont des pièges voisins
    const traps = shuffled(w.g.flatMap(x => NEIGHBORS[x.t] ?? []))
    for (const t of traps) { if (out.length >= Math.ceil(n / 2)) break; take(t) }
  }
  const pool = tier === 'easy' ? LETTERS.filter(c => c !== 'h') : [...LETTERS, ...COMPLEX]
  for (const t of shuffled(pool)) take(t)
  return out
}
