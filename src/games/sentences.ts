import type { GameContext, GameDef } from '../core/types'
import { $, pick, rnd, shuffle } from '../core/utils'
import { sfx, preloadSfx } from '../core/sfx'
import { fxAt, confetti } from '../core/fx'
import { shake } from '../core/juice'
import { ICON } from '../core/icons'

/* 📮 La Poste aux Phrases — les types de phrases (leçon GR2 de Joyce).

   Trois choses à apprendre, donc trois façons de jouer :
   ✓ Phrase ?      reconnaître une phrase (majuscule, point, sens complet) ;
   🏷 Quel type ?  déclarative / interrogative / exclamative / injonctive ;
   ? Le nom        comment s'appelle chaque point.

   Le geste, c'est le TAMPON. La lettre arrive en glissant, la phrase s'affiche
   SANS son point final, un emplacement vide clignote au bout, et on traîne le
   bon tampon dessus (ou on le tape : il vole tout seul). Il s'écrase, l'encre
   gicle de sa couleur, le point s'imprime un peu de travers comme un vrai —
   puis la lettre s'envole dans la boîte aux lettres, qui l'avale en
   tressautant. La huitième fait lever le drapeau.

   C'est la leçon même — **on choisit le type, le point en découle**. D'où le
   piège de la fiche, qui devient jouable : « Comme il fait chaud ! » et
   « Arrête de parler ! » portent le même point sans être du même type, et
   « Souligne le verbe. » est injonctive avec un simple point. Le tampon
   injonctif porte donc SES DEUX points côte à côte : c'est la seule famille
   qui n'a pas un point à elle, et ça se voit. Se tromper de type avec le BON
   point est un presque-juste : réaction douce, là où un contresens secoue.

   La voix lit les phrases, et c'est voulu : l'intonation est l'indice qui
   sépare « Tu viens. » de « Tu viens ? ». C'est du contenu pédagogique, comme
   les noms de lieux du Tour du Monde — jamais une consigne (règle 2).

   Apprendre = aucune sanction : pas de vies, pas de chrono, autant d'essais
   qu'on veut, et après deux ratés le bon tampon se met à luire (de l'aide).
   La rampe est liée à la performance : les phrases s'allongent tous les trois
   succès, dans la limite du niveau. Les étoiles sont un retour de fin. */

type Kind = 'decl' | 'inter' | 'excl' | 'inj'
type Mark = '.' | '?' | '!'

interface Phrase { t: string; k: Kind; pt: Mark; lvl: 1 | 2 | 3 }

/* Le corpus. `t` n'a PAS son point final : c'est le jeu qui l'imprime.
   `pt` dit lequel — utile surtout pour l'injonctive, seule famille qui
   accepte les deux (« Ferme la porte. » mais « Viens vite ! »). `lvl` est la
   longueur : la rampe les débloque au fil des succès. */
const CORPUS: Phrase[] = [
  // ---- Déclaratives : on raconte, on explique ----
  { t: 'Je m’appelle Lisa', k: 'decl', pt: '.', lvl: 1 },
  { t: 'Le chat dort sur le canapé', k: 'decl', pt: '.', lvl: 1 },
  { t: 'Il pleut depuis ce matin', k: 'decl', pt: '.', lvl: 1 },
  { t: 'Mon chien adore les carottes', k: 'decl', pt: '.', lvl: 1 },
  { t: 'Les poules picorent des graines', k: 'decl', pt: '.', lvl: 2 },
  { t: 'Ma sœur joue dans le jardin', k: 'decl', pt: '.', lvl: 2 },
  { t: 'Papa prépare le dîner', k: 'decl', pt: '.', lvl: 2 },
  { t: 'Le train arrive à dix heures', k: 'decl', pt: '.', lvl: 2 },
  { t: 'Le lapin se cache sous la haie', k: 'decl', pt: '.', lvl: 3 },
  { t: 'Nous partons en vacances demain', k: 'decl', pt: '.', lvl: 3 },
  { t: 'La maîtresse écrit la date au tableau', k: 'decl', pt: '.', lvl: 3 },
  { t: 'Les feuilles tombent en automne', k: 'decl', pt: '.', lvl: 3 },

  // ---- Interrogatives : on demande ----
  { t: 'Où vas-tu', k: 'inter', pt: '?', lvl: 1 },
  { t: 'Quel âge as-tu', k: 'inter', pt: '?', lvl: 1 },
  { t: 'Qui a pris mon goûter', k: 'inter', pt: '?', lvl: 1 },
  { t: 'Veux-tu jouer avec moi', k: 'inter', pt: '?', lvl: 1 },
  { t: 'Comment t’appelles-tu', k: 'inter', pt: '?', lvl: 2 },
  { t: 'À qui appartient ce livre', k: 'inter', pt: '?', lvl: 2 },
  { t: 'As-tu vu mon crayon', k: 'inter', pt: '?', lvl: 2 },
  { t: 'Aimes-tu les fraises', k: 'inter', pt: '?', lvl: 2 },
  { t: 'Est-ce que tu viens avec moi', k: 'inter', pt: '?', lvl: 3 },
  { t: 'Combien de chatons y a-t-il', k: 'inter', pt: '?', lvl: 3 },
  { t: 'Quand partons-nous à la mer', k: 'inter', pt: '?', lvl: 3 },
  { t: 'Où habite ta grand-mère', k: 'inter', pt: '?', lvl: 3 },

  // ---- Exclamatives : on ressent, on s’émerveille ----
  { t: 'Comme il fait chaud', k: 'excl', pt: '!', lvl: 1 },
  { t: 'C’est magnifique', k: 'excl', pt: '!', lvl: 1 },
  { t: 'Quelle chance', k: 'excl', pt: '!', lvl: 1 },
  { t: 'Quel énorme gâteau', k: 'excl', pt: '!', lvl: 1 },
  { t: 'Quelle belle journée', k: 'excl', pt: '!', lvl: 2 },
  { t: 'Comme tu as grandi', k: 'excl', pt: '!', lvl: 2 },
  { t: 'Que ce gâteau est bon', k: 'excl', pt: '!', lvl: 2 },
  { t: 'Que tu es courageuse', k: 'excl', pt: '!', lvl: 2 },
  { t: 'C’est vraiment trop drôle', k: 'excl', pt: '!', lvl: 3 },
  { t: 'Comme cette fleur sent bon', k: 'excl', pt: '!', lvl: 3 },
  { t: 'Que de monde dans la rue', k: 'excl', pt: '!', lvl: 3 },
  { t: 'Quel beau spectacle nous avons vu', k: 'excl', pt: '!', lvl: 3 },

  // ---- Injonctives : on ordonne, on conseille ----
  { t: 'Ferme la porte', k: 'inj', pt: '.', lvl: 1 },
  { t: 'Viens vite', k: 'inj', pt: '!', lvl: 1 },
  { t: 'Range ta chambre', k: 'inj', pt: '.', lvl: 1 },
  { t: 'Mets ton manteau', k: 'inj', pt: '.', lvl: 1 },
  { t: 'Arrête de parler', k: 'inj', pt: '!', lvl: 2 },
  { t: 'Souligne le verbe', k: 'inj', pt: '.', lvl: 2 },
  { t: 'Donne-moi la main', k: 'inj', pt: '.', lvl: 2 },
  { t: 'Regarde bien la route', k: 'inj', pt: '!', lvl: 2 },
  { t: 'Écoute bien la consigne', k: 'inj', pt: '.', lvl: 3 },
  { t: 'N’oublie pas ton cartable', k: 'inj', pt: '!', lvl: 3 },
  { t: 'Ne cours pas dans le couloir', k: 'inj', pt: '!', lvl: 3 },
  { t: 'Recopie cette phrase au propre', k: 'inj', pt: '.', lvl: 3 }
]

/* Les quatre tampons. Celui de l'injonctive porte SES DEUX points côte à
   côte : c'est la seule famille qui accepte « . » comme « ! », et le tampon
   le dit à lui seul. La couleur est aussi celle de l'encre imprimée. */
interface KindDef { k: Kind; cap: string; marks: string[]; color: string }
const KINDS: KindDef[] = [
  { k: 'decl', cap: 'déclarative', marks: ['.'], color: '#3A93BC' },
  { k: 'inter', cap: 'interrogative', marks: ['?'], color: '#3FA45E' },
  { k: 'excl', cap: 'exclamative', marks: ['!'], color: '#E8873A' },
  { k: 'inj', cap: 'injonctive', marks: ['.', '!'], color: '#8E6FD4' }
]
const kindDef = (k: Kind) => KINDS.find(x => x.k === k)!

/** Le nom que la voix prononce — du contenu de leçon, pas une consigne. */
const KIND_SAY: Record<Kind, string> = {
  decl: 'phrase déclarative',
  inter: 'phrase interrogative',
  excl: 'phrase exclamative',
  inj: 'phrase injonctive'
}

/** Les noms des points. Les trois de la leçon, plus deux en expert. */
const MARKS: { m: string; name: string; lvl: 1 | 3 }[] = [
  { m: '.', name: 'le point', lvl: 1 },
  { m: '?', name: 'le point d’interrogation', lvl: 1 },
  { m: '!', name: 'le point d’exclamation', lvl: 1 },
  { m: ',', name: 'la virgule', lvl: 3 },
  { m: '…', name: 'les points de suspension', lvl: 3 }
]

/* Une phrase, c'est trois choses à la fois. Chaque intrus en casse UNE, et
   c'est celle-là qu'on montre en rouge — dans le texte même : la majuscule
   s'entoure, le point s'entoure, et une case vide apparaît là où il manque.
   Joyce voit POURQUOI, elle ne devine pas. */
type Flaw = 'maj' | 'pt' | 'sens'
interface Candidate { t: string; ok: boolean; bad?: Flaw }
const CANDIDATES: Candidate[] = [
  { t: 'Le chien aboie très fort.', ok: true },
  { t: 'Mes cousines arrivent ce soir.', ok: true },
  { t: 'La neige recouvre le jardin.', ok: true },
  { t: 'Où as-tu rangé mes bottes ?', ok: true },
  { t: 'Comme ce chaton est doux !', ok: true },
  { t: 'Ferme bien le portail.', ok: true },
  { t: 'Nous avons cueilli des fraises.', ok: true },
  { t: 'Le facteur passe à midi.', ok: true },
  { t: 'Le vent souffle sur la colline.', ok: true },
  { t: 'Qui a cassé la fenêtre ?', ok: true },
  { t: 'Range vite tes jouets !', ok: true },
  { t: 'le chien aboie très fort.', ok: false, bad: 'maj' },
  { t: 'mes cousines arrivent ce soir.', ok: false, bad: 'maj' },
  { t: 'la neige recouvre le jardin.', ok: false, bad: 'maj' },
  { t: 'le facteur passe à midi.', ok: false, bad: 'maj' },
  { t: 'le vent souffle sur la colline.', ok: false, bad: 'maj' },
  { t: 'Le chien aboie très fort', ok: false, bad: 'pt' },
  { t: 'Nous avons cueilli des fraises', ok: false, bad: 'pt' },
  { t: 'La neige recouvre le jardin', ok: false, bad: 'pt' },
  { t: 'Mes cousines arrivent ce soir', ok: false, bad: 'pt' },
  { t: 'Le vent souffle sur la colline', ok: false, bad: 'pt' },
  { t: 'Le sous très aboie chien.', ok: false, bad: 'sens' },
  { t: 'Arrivent cousines ce mes.', ok: false, bad: 'sens' },
  { t: 'Recouvre jardin la le.', ok: false, bad: 'sens' },
  { t: 'Fraises avons des nous.', ok: false, bad: 'sens' },
  { t: 'Colline souffle vent la sur le.', ok: false, bad: 'sens' }
]

const FLAW_CAP: Record<Flaw, string> = {
  maj: 'la majuscule', pt: 'le point', sens: 'le sens'
}

const MODES = [
  { id: 'phrase', cap: 'Phrase ?', icon: ICON.check },
  { id: 'type', cap: 'Quel type ?', icon: ICON.pin },
  { id: 'point', cap: 'Le nom', icon: ICON.search }
] as const
type ModeId = (typeof MODES)[number]['id']

const ROUNDS = 8
/** Un tap sur un tampon : au-delà de ce déplacement, c'est un glissé. */
const DRAG_PX = 10

interface State {
  running: boolean
  lock: boolean
  mode: ModeId
  q: number
  mistakes: number
  done: number
  /** Ratés sur la manche en cours : au 2ᵉ, le bon tampon se met à luire. */
  miss: number
  /* Manche en cours, selon le mode */
  phrase: Phrase | null
  cand: Candidate | null
  markQ: { m: string; name: string } | null
  reverse: boolean
  /** La réponse attendue, gardée pour la rendre au bot après une erreur. */
  answer: string | null
  /** Vrai pendant l'animation de réponse : le bot attend. */
  busy: boolean
}

let po: State | null = null
let ctx: GameContext

/* Crochet de test : le bot lit la bonne réponse de la manche en cours.
   `null` pendant l'animation — une valeur périmée ferait cliquer le bot dans
   le vide (piège déjà payé sur la Tour de Glace). Inerte hors des tests. */
function hook(v: string | null) {
  if (po) po.answer = v
}
const botOn = () => !!(window as unknown as { __BOT?: boolean }).__BOT

/* ---------- Dessins ---------- */

/* Un signe de ponctuation dessiné PLEIN CADRE. Un « . » écrit comme un
   caractère se perd en bas de la ligne : à l'écran il faisait six pixels.
   Ici le point est un vrai gros rond, et les suspensions trois ronds. */
function glyph(m: string, cx: number, base: number, size: number, color: string): string {
  if (m === '.') return `<circle cx="${cx}" cy="${base - size * 0.1}" r="${size * 0.22}" fill="${color}"/>`
  if (m === '…') {
    const r = size * 0.13, y = base - size * 0.06
    return [cx - size * 0.33, cx, cx + size * 0.33]
      .map(x => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`).join('')
  }
  return `<text x="${cx}" y="${base}" text-anchor="middle" font-size="${size}" font-weight="800"
    fill="${color}" font-family="'Baloo 2',sans-serif">${m}</text>`
}

/** Un tampon : une plaque de couleur, son ou ses signes gravés en blanc. */
function stampSVG(k: { marks: string[]; color: string }): string {
  const g = k.marks.length === 1
    ? glyph(k.marks[0], 31, 41, 40, '#fff')
    : k.marks.map((m, i) => glyph(m, 20 + i * 22, 40, 28, '#fff')).join('')
  return `<svg viewBox="0 0 62 62" class="po-stampart" aria-hidden="true">
    <rect x="5" y="10" width="52" height="44" rx="7" fill="${k.color}" opacity=".3"/>
    <rect x="5" y="5" width="52" height="44" rx="7" fill="${k.color}"/>
    ${g}</svg>`
}

/** Le point imprimé sur la carte, en très gros, dans l'encre du tampon. */
function markSVG(m: string, px: number, color = '#E8574C'): string {
  return `<svg viewBox="0 0 60 60" width="${px}" height="${px}" class="po-mark" aria-hidden="true">
    ${glyph(m, 30, 46, 60, color)}</svg>`
}

/** La boîte aux lettres : un corps rouge, une fente, un drapeau qui se lève
    quand le courrier est complet. Les lettres avalées dépassent de la fente. */
function mailboxSVG(): string {
  return `<svg viewBox="0 0 120 150" class="po-boxart" aria-hidden="true">
    <rect x="52" y="96" width="16" height="54" rx="3" fill="#9C7340"/>
    <rect x="52" y="96" width="16" height="6" fill="#7A5A30"/>
    <g class="po-flag"><rect x="97" y="18" width="6" height="34" rx="3" fill="#E8873A"/>
      <path d="M100 18h20l-6 8 6 8h-20z" fill="#FFD34D"/></g>
    <rect x="14" y="34" width="92" height="66" rx="16" fill="#E8574C"/>
    <rect x="14" y="34" width="92" height="58" rx="16" fill="#FF6B81"/>
    <rect x="14" y="76" width="92" height="4" fill="#E8574C" opacity=".6"/>
    <g class="po-letters"></g>
    <rect x="30" y="50" width="60" height="9" rx="4.5" fill="#45362A"/>
    <rect x="33" y="52" width="54" height="3" rx="1.5" fill="#2B2118"/>
  </svg>`
}

/* ---------- Le pool de phrases, selon le niveau ET la performance ---------- */
function kindsOfTier(): Kind[] {
  // Fleur : on laisse l'injonctive de côté, elle se confond avec l'exclamative
  return ctx.byTier<Kind[]>(['decl', 'inter', 'excl'], ['decl', 'inter', 'excl', 'inj'], ['decl', 'inter', 'excl', 'inj'])
}
/** La rampe : un cran de longueur tous les trois succès, plafonné par le niveau. */
function lvlCap(): 1 | 2 | 3 {
  const base = ctx.byTier(1, 1, 2), cap = ctx.byTier(2, 3, 3)
  return Math.min(cap, base + Math.floor((po?.done || 0) / 3)) as 1 | 2 | 3
}
const marksLvl = () => ctx.byTier(1, 1, 3)
const readsAloud = () => ctx.byTier(true, true, false)

function pickPhrase(): Phrase {
  const ks = kindsOfTier(), lv = lvlCap()
  const pool = CORPUS.filter(p => ks.includes(p.k) && p.lvl <= lv)
  // On sert de préférence la longueur du moment, et jamais deux fois la même
  const cran = pool.filter(p => p.lvl === lv && p !== po!.phrase)
  const fresh = pool.filter(p => p !== po!.phrase)
  return pick(cran.length >= 3 ? cran : fresh.length ? fresh : pool)
}

/* ---------- La lettre : elle arrive, elle repart ---------- */

/** La nouvelle lettre glisse sur le comptoir. */
function arrive(html: string) {
  const board = $('poBoard')
  board.innerHTML = html
  const card = board.querySelector<HTMLElement>('.po-card')
  if (card) { card.classList.add('arrive'); sfx('whoosh', { vol: 0.3, rate: 1.25 }) }
}

/** La lettre tamponnée s'envole dans la boîte, qui l'avale en tressautant. */
function send() {
  const card = $('poBoard').querySelector<HTMLElement>('.po-card')
  const box = $('poBox')
  if (!card || !box) return
  const c = card.getBoundingClientRect(), b = box.getBoundingClientRect()
  const dx = (b.left + b.width / 2) - (c.left + c.width / 2)
  const dy = (b.top + b.height * 0.42) - (c.top + c.height / 2)
  card.classList.remove('arrive')
  card.style.setProperty('--dx', `${dx}px`)
  card.style.setProperty('--dy', `${dy}px`)
  card.classList.add('send')
  sfx('whoosh', { vol: 0.4, rate: 0.9 })
  ctx.after(520, () => {
    if (!po || !po.running) return
    sfx('drop', { vol: 0.5, rate: 1.1 })
    box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump')
    // Une lettre de plus dépasse de la fente
    const stack = box.querySelector('.po-letters')
    if (stack) {
      const n = stack.children.length
      stack.insertAdjacentHTML('beforeend',
        `<rect x="${34 + (n % 3) * 4}" y="${44 - n * 1.6}" width="${52 - (n % 3) * 6}" height="7" rx="2" fill="#FFF6E8" stroke="#D9C7A8" stroke-width="1"/>`)
    }
  })
}

/* ---------- Manche : « Phrase ? » ---------- */

/** Le texte avec sa première lettre et son signe final repérables. */
function decorate(t: string): string {
  const esc = (x: string) => x.replace(/</g, '&lt;')
  const first = t[0], last = t.slice(-1)
  const body = t.slice(1, -1)
  return `<span class="po-first">${esc(first)}</span>${esc(body)}<span class="po-last">${esc(last)}</span>`
}

function roundPhrase() {
  const me = po!
  const wantOk = Math.random() < 0.5
  const pool = CANDIDATES.filter(c => c.ok === wantOk && c !== me.cand)
  me.cand = pick(pool)
  hook(me.cand.ok ? 'oui' : 'non')
  arrive(`
    <div class="po-card po-card-plain"><span class="po-text" id="poText">${decorate(me.cand.t)}</span></div>
    <div class="po-why" id="poWhy">
      ${(['maj', 'pt', 'sens'] as Flaw[]).map(f =>
        `<span class="po-crit" data-c="${f}"><b>${f === 'maj' ? 'Aa' : f === 'pt' ? '.' : '💭'}</b>${FLAW_CAP[f]}</span>`).join('')}
    </div>`)
  $('poTools').innerHTML = `
    <span class="tool-item"><button class="sn-tool po-yes" data-a="oui" aria-label="C'est une phrase">${ICON.check}</button>
      <i class="tool-cap">Une phrase</i></span>
    <span class="tool-item"><button class="sn-tool po-no" data-a="non" aria-label="Ce n'est pas une phrase">${ICON.versus}</button>
      <i class="tool-cap">Pas une phrase</i></span>`
  bindTools(a => answerPhrase(a === 'oui'))
}

function answerPhrase(saidOk: boolean) {
  const me = po!
  const c = me.cand!
  const right = saidOk === c.ok
  const why = $('poWhy'), text = $('poText')
  why.classList.add('show')
  ;(['maj', 'pt', 'sens'] as Flaw[]).forEach(f => {
    const el = why.querySelector<HTMLElement>(`[data-c="${f}"]`)!
    el.classList.add(c.ok || c.bad !== f ? 'ok' : 'ko')
  })
  // Et dans le texte même : ce qui va s'entoure en vert, ce qui manque en rouge
  const first = text.querySelector('.po-first')!, last = text.querySelector('.po-last')!
  first.classList.add(c.bad === 'maj' ? 'ko' : 'ok')
  if (c.bad === 'pt') {
    last.classList.add('ok')
    text.insertAdjacentHTML('beforeend', '<span class="po-slot mini ko"></span>')
  } else last.classList.add(c.bad === 'sens' ? 'ok' : 'ok')
  if (c.bad === 'sens') text.classList.add('ko')
  judge(right, () => {
    if (!c.ok) shake(why.querySelector(`[data-c="${c.bad}"]`)!, 7, 320)
  })
}

/* ---------- Manche : « Quel type ? » (le cœur) ---------- */
function roundType() {
  const me = po!
  me.phrase = pickPhrase()
  me.miss = 0
  const p = me.phrase
  hook(p.k)
  arrive(`
    <div class="po-card" id="poCardEl">
      <span class="po-text">${p.t}</span><span class="po-slot" id="poSlot"></span>
      <button class="po-say" id="poSay" aria-label="Réécouter">${ICON.sound}</button>
    </div>`)
  // En fleur, l'injonctive est laissée de côté : son tampon disparaît aussi,
  // sinon on propose un choix qui n'est jamais la bonne réponse.
  const dispo = KINDS.filter(k => kindsOfTier().includes(k.k))
  $('poTools').innerHTML = shuffle([...dispo]).map(k =>
    `<span class="tool-item"><button class="po-stamp" data-a="${k.k}" aria-label="${k.cap}">
       ${stampSVG(k)}</button>
     <i class="tool-cap">${k.cap}</i></span>`).join('')
  bindStamps()
  ;($('poSay') as HTMLButtonElement).onclick = () => speakPhrase()
  if (readsAloud()) ctx.after(520, () => po && po.running && speakPhrase())
}

/** On lit la phrase AVEC son point : c'est l'intonation qui enseigne. */
function speakPhrase() {
  const p = po?.phrase
  if (!p) return
  ctx.say(`${p.t}${p.pt === '.' ? '.' : ' ' + p.pt}`)
}

/* Le tampon se prend en main : un tap le fait voler jusqu'à la case, un
   glissé le suit sous le doigt et le lâche dessus. Dans les deux cas il
   S'ÉCRASE sur l'emplacement avant qu'on sache s'il était le bon.

   Le glissé s'écoute sur la FENÊTRE, pas sur le bouton : sinon le doigt qui
   passe au-dessus d'un tampon voisin déclenche le sien, et on se retrouve
   avec deux tampons en l'air (vécu). Un seul tampon est en main à la fois. */
interface Grip { b: HTMLElement; kind: Kind; sx: number; sy: number; ghost: HTMLElement | null }
let grip: Grip | null = null
let suppressClick = false

function onGripMove(e: PointerEvent) {
  if (!grip || !po || po.lock) return
  if (!grip.ghost) {
    if (Math.hypot(e.clientX - grip.sx, e.clientY - grip.sy) < DRAG_PX) return
    grip.ghost = makeGhost(grip.b, $('poWrap'))
    sfx('cloth', { vol: 0.35, rate: 1.3 })
  }
  moveGhost(grip.ghost, e.clientX, e.clientY)
  document.getElementById('poSlot')?.classList.toggle('over', overSlot(e.clientX, e.clientY))
}
function onGripUp(e: PointerEvent) {
  const g = grip
  grip = null
  if (!g || !g.ghost) return          // un simple tap : c'est `click` qui joue
  suppressClick = true
  ctx.after(320, () => { suppressClick = false })
  document.getElementById('poSlot')?.classList.remove('over')
  if (po && po.running && !po.lock && overSlot(e.clientX, e.clientY)) {
    po.lock = true
    slam(g.kind, g.ghost, g.b)
  } else springBack(g.ghost, g.b)
}
function listenGrip(on: boolean) {
  const m = on ? window.addEventListener : window.removeEventListener
  m.call(window, 'pointermove', onGripMove as EventListener)
  m.call(window, 'pointerup', onGripUp as EventListener)
  m.call(window, 'pointercancel', onGripUp as EventListener)
}

function bindStamps() {
  const wrap = $('poWrap')
  $('poTools').querySelectorAll<HTMLElement>('.po-stamp').forEach(b => {
    const kind = b.dataset.a as Kind
    b.onpointerdown = e => {
      if (!po || !po.running || po.lock || grip) return
      grip = { b, kind, sx: e.clientX, sy: e.clientY, ghost: null }
    }
    b.onclick = () => {
      if (suppressClick || !po || !po.running || po.lock) return
      po.lock = true
      fly(kind, b, wrap)
    }
  })
}

function makeGhost(b: HTMLElement, wrap: HTMLElement): HTMLElement {
  const g = document.createElement('div')
  g.className = 'po-ghost'
  g.innerHTML = b.innerHTML
  const r = b.getBoundingClientRect(), w = wrap.getBoundingClientRect()
  g.style.width = `${r.width}px`; g.style.height = `${r.height}px`
  g.style.left = `${r.left - w.left}px`; g.style.top = `${r.top - w.top}px`
  g.dataset.cx = String(r.left + r.width / 2); g.dataset.cy = String(r.top + r.height / 2)
  wrap.appendChild(g)
  b.classList.add('lifted')
  return g
}
function moveGhost(g: HTMLElement, x: number, y: number) {
  g.style.transform = `translate(${x - Number(g.dataset.cx)}px, ${y - Number(g.dataset.cy) - 18}px) rotate(-6deg)`
}
function overSlot(x: number, y: number): boolean {
  const s = document.getElementById('poSlot')
  if (!s) return false
  const r = s.getBoundingClientRect(), m = 34
  return x > r.left - m && x < r.right + m && y > r.top - m && y < r.bottom + m
}
/** Le tampon lâché à côté revient à sa place, d'un ressort. */
function springBack(g: HTMLElement, b: HTMLElement) {
  const a = g.animate([{ transform: g.style.transform }, { transform: 'translate(0,0) rotate(0)' }],
    { duration: 380, easing: 'cubic-bezier(.2,1.6,.4,1)' })
  a.onfinish = () => { g.remove(); b.classList.remove('lifted') }
  sfx('cloth', { vol: 0.25, rate: 0.9 })
}
/** Un tap : le tampon vole tout seul jusqu'à la case. */
function fly(kind: Kind, b: HTMLElement, wrap: HTMLElement) {
  const s = document.getElementById('poSlot')
  const g = makeGhost(b, wrap)
  if (!s) return slam(kind, g, b)
  const r = s.getBoundingClientRect()
  const dx = (r.left + r.width / 2) - Number(g.dataset.cx), dy = (r.top + r.height / 2) - Number(g.dataset.cy)
  const a = g.animate([
    { transform: 'translate(0,0) scale(1) rotate(0)' },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(1.25) rotate(-10deg)`, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(1.1) rotate(-4deg)` }
  ], { duration: 340, easing: 'ease-in', fill: 'forwards' })
  sfx('whoosh', { vol: 0.35, rate: 1.4 })
  a.onfinish = () => {
    g.style.transform = `translate(${dx}px, ${dy}px)`
    if (po && po.running) slam(kind, g, b)
  }
}
/** Le tampon s'écrase sur la case : secousse, « bong », puis le verdict. */
function slam(kind: Kind, g: HTMLElement, b: HTMLElement) {
  const base = g.style.transform.replace(/\s*(scale|rotate)\([^)]*\)/g, '')
  g.animate([
    { transform: `${base} scale(1.1) rotate(-4deg)` },
    { transform: `${base} scale(.8) rotate(2deg)`, offset: 0.4 },
    { transform: `${base} scale(1) rotate(0)` }
  ], { duration: 220, easing: 'ease-out', fill: 'forwards' })
  sfx('bong', { vol: 0.6, rate: 0.85 })
  const card = document.getElementById('poCardEl')
  if (card) shake(card, 6, 280)
  ctx.after(130, () => { if (po && po.running) answerType(kind, g, b) })
}

function answerType(k: Kind, g: HTMLElement, b: HTMLElement) {
  const me = po!
  const p = me.phrase!
  const right = k === p.k
  const ink = kindDef(p.k).color
  if (right) {
    // Le point s'imprime tout seul, dans l'encre du tampon, un peu de travers
    const slot = $('poSlot')
    slot.innerHTML = markSVG(p.pt, 52, ink)
    slot.style.setProperty('--ink', ink)
    slot.style.setProperty('--tilt', `${rnd(-9, 9)}deg`)
    slot.classList.add('inked')
    fxAt(slot, [ink, '#fff', ink], 14)
    g.classList.add('fade')
    ctx.after(300, () => g.remove())
    ctx.after(520, () => po && po.running && ctx.say(KIND_SAY[p.k]))
    judge(true)
    return
  }
  // Raté. Le BON point avec le mauvais type, c'est un presque-juste : le
  // tampon rebondit doucement, l'emplacement montre en gris le point qu'il
  // aurait imprimé — le même — et la voix redit la phrase. Un contresens
  // secoue plus fort.
  const near = kindDef(k).marks.includes(p.pt)
  me.miss++
  const slot = $('poSlot')
  if (near) {
    slot.innerHTML = markSVG(p.pt, 52, '#B9AFA3')
    slot.classList.add('near')
    ctx.after(900, () => { if (po && po.running && slot.isConnected) { slot.innerHTML = ''; slot.classList.remove('near') } })
    sfx('pluck', { vol: 0.5, rate: 0.8 })
  } else {
    slot.classList.add('no')
    ctx.after(500, () => slot.classList.remove('no'))
  }
  springBack(g, b)
  if (me.miss >= 2) {
    // Deux ratés : le bon tampon se met à luire. De l'aide, pas une sanction.
    $('poTools').querySelector(`.po-stamp[data-a="${p.k}"]`)?.classList.add('po-glow')
  }
  judge(false, () => speakPhrase(), near)
}

/* ---------- Manche : « Le nom du point » ---------- */
function roundMark() {
  const me = po!
  const pool = MARKS.filter(m => m.lvl <= marksLvl())
  const frais = pool.filter(m => m.name !== me.markQ?.name)
  const good = pick(frais.length ? frais : pool)
  me.markQ = good
  me.reverse = Math.random() < 0.4
  hook(good.name)
  if (me.reverse) {
    // On entend le nom, on cherche le signe
    arrive(`
      <div class="po-card po-card-plain"><span class="po-name">${good.name}</span>
        <button class="po-say" id="poSay" aria-label="Réécouter">${ICON.sound}</button></div>`)
    $('poTools').innerHTML = shuffle([...pool]).map(m =>
      `<span class="tool-item"><button class="po-bigmark" data-a="${m.name}" aria-label="${m.name}">
         ${markSVG(m.m, 46, '#45362A')}</button></span>`).join('')
    ;($('poSay') as HTMLButtonElement).onclick = () => ctx.say(good.name)
    ctx.after(420, () => po && po.running && ctx.say(good.name))
  } else {
    // On voit le signe, on cherche son nom
    arrive(`<div class="po-card po-card-plain">${markSVG(good.m, 120)}</div>`)
    $('poTools').innerHTML = shuffle([...pool]).map(m =>
      `<span class="tool-item"><button class="po-label" data-a="${m.name}">${m.name}</button></span>`).join('')
  }
  bindTools(a => {
    const right = a === good.name
    if (right) ctx.say(good.name)
    judge(right)
  })
}

/* ---------- Le moteur commun ---------- */

/** Branche les boutons de la rangée du bas sur une réponse (modes à tap). */
function bindTools(fn: (answer: string) => void) {
  $('poTools').querySelectorAll<HTMLElement>('[data-a]').forEach(b => {
    b.onclick = () => {
      if (!po || !po.running || po.lock) return
      po.lock = true
      b.classList.add('picked')
      fn(b.dataset.a!)
    }
  })
}

/** Bon ou pas : aucune sanction, on montre et on enchaîne. Faux = on rejoue
    la même manche, autant de fois qu'il faut. `soft` = presque-juste. */
function judge(right: boolean, after?: () => void, soft = false) {
  const me = po!
  // Le bot ne doit pas cliquer pendant l'animation : `busy` coupe le crochet
  // le temps de la réponse, `me.answer` garde la manche pour un nouvel essai.
  me.busy = true
  if (right) {
    me.done++
    if (me.mode !== 'type') sfx('bong', { vol: 0.5, rate: 0.9 })
    sfx('confirm', { vol: 0.65, delay: 0.12 })
    paintDots()
    after?.()
    me.q++
    ctx.after(700, () => { if (po && po.running) send() })
    ctx.after(1500, () => {
      if (!po || !po.running) return
      me.lock = false
      me.busy = false
      if (me.q >= ROUNDS) return finish()
      nextRound()
    })
  } else {
    me.mistakes++
    if (!soft) { sfx('drop', { vol: 0.4, rate: 0.85 }); shake($('poTools'), 6, 300) }
    after?.()
    ctx.after(1100, () => {
      if (!po || !po.running) return
      me.lock = false
      $('poTools').querySelectorAll<HTMLElement>('.picked').forEach(x => x.classList.remove('picked'))
      // On retente la MÊME manche : l'erreur n'est pas une perte
      const board = $('poBoard')
      board.querySelectorAll<HTMLElement>('.po-crit').forEach(x => x.classList.remove('ok', 'ko'))
      board.querySelectorAll<HTMLElement>('.po-first, .po-last, .po-text').forEach(x => x.classList.remove('ok', 'ko'))
      board.querySelectorAll<HTMLElement>('.po-slot.mini').forEach(x => x.remove())
      board.querySelectorAll<HTMLElement>('.po-why').forEach(x => x.classList.remove('show'))
      me.busy = false   // la manche est la même : le bot peut réessayer
    })
  }
}

function paintDots() {
  $('poDots').innerHTML = Array.from({ length: ROUNDS },
    (_, i) => `<i class="sn-dot${i < po!.q + 1 ? ' on' : ''}"></i>`).join('')
}

function nextRound() {
  const me = po!
  $('poTools').innerHTML = ''
  if (me.mode === 'phrase') roundPhrase()
  else if (me.mode === 'type') roundType()
  else roundMark()
}

function setMode(mode: ModeId) {
  const me = po!
  me.mode = mode
  me.q = 0; me.mistakes = 0; me.done = 0; me.miss = 0
  me.lock = false; me.busy = false
  me.phrase = null; me.cand = null; me.markQ = null
  document.querySelectorAll<HTMLElement>('.po-mode').forEach(x => x.classList.toggle('sel', x.dataset.m === mode))
  $('poBox').innerHTML = mailboxSVG()
  $('poBox').classList.remove('full')
  paintDots()
  nextRound()
}

function finish() {
  const me = po!
  const stars = me.mistakes === 0 ? 3 : me.mistakes <= 2 ? 2 : 1
  // Le drapeau se lève : le courrier est complet
  $('poBox').classList.add('full')
  sfx('switch', { vol: 0.6 })
  confetti()
  sfx('open', { vol: 0.7, delay: 0.2 })
  const titre = me.mode === 'phrase' ? 'Courrier trié !'
    : me.mode === 'type' ? 'Tout est tamponné !'
    : 'Tous les points nommés !'
  ctx.finish({
    title: titre,
    msg: `Tu as tamponné ${me.done} phrase${me.done > 1 ? 's' : ''}`,
    stars, outroMs: 900
  })
}

export const sentences: GameDef = {
  id: 'sentences', name: 'La Poste aux Phrases', icon: '📮', sq: 'sq-mint', cat: 'reflexion',
  subtitle: 'Tamponne chaque phrase avec le bon signe !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        ${MODES.map((m, i) => `<button class="chip po-mode${i === 1 ? ' sel' : ''}" data-m="${m.id}"
          aria-label="${m.cap}">${m.icon}<b>${m.cap}</b></button>`).join('')}
      </div>
      <div class="arena po-wrap" id="poWrap">
        <div class="po-main">
          <div class="po-board" id="poBoard"></div>
          <div class="po-tools" id="poTools"></div>
        </div>
        <div class="tq-side">
          <div class="po-box" id="poBox"></div>
          <div class="mem-dots" id="poDots"></div>
        </div>
      </div>`
    preloadSfx(['bong', 'confirm', 'drop', 'open', 'click', 'whoosh', 'cloth', 'pluck', 'switch'])
    po = {
      running: true, lock: false, mode: 'type', q: 0, mistakes: 0, done: 0, miss: 0,
      phrase: null, cand: null, markQ: null, reverse: false, answer: null, busy: false
    }
    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if (botOn()) {
      ;(window as unknown as { __po: unknown }).__po = {
        state: () => po && {
          answer: po.busy || po.lock ? null : po.answer, mode: po.mode,
          q: po.q, done: po.done, total: ROUNDS, mistakes: po.mistakes
        },
        setMode: (m: ModeId) => po && po.running && setMode(m)
      }
    }
    document.querySelectorAll<HTMLElement>('.po-mode').forEach(b => {
      b.onclick = () => { if (po && po.running) { sfx('click', { vol: 0.4 }); setMode(b.dataset.m as ModeId) } }
    })
    listenGrip(true)
    setMode('type')
    return () => {
      listenGrip(false)
      grip = null
      document.querySelectorAll('.po-ghost').forEach(g => g.remove())
      if (botOn()) delete (window as unknown as { __po?: unknown }).__po
      if (po) { po.running = false; po = null }
    }
  }
}
