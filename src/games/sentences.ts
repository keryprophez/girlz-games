import type { GameContext, GameDef } from '../core/types'
import { $, pick, shuffle } from '../core/utils'
import { sfx, preloadSfx } from '../core/sfx'
import { fxAt, JUICE, confetti } from '../core/fx'
import { shake } from '../core/juice'
import { ICON } from '../core/icons'

/* 📮 La Poste aux Phrases — les types de phrases (leçon GR2 de Joyce).

   Trois choses à apprendre, donc trois façons de jouer :
   ✓ Phrase ?      reconnaître une phrase (majuscule, point, sens complet) ;
   🏷 Quel type ?  déclarative / interrogative / exclamative / injonctive ;
   ? Le nom        comment s'appelle chaque point.

   Le geste, c'est le TAMPON. La phrase s'affiche SANS son point final, un
   emplacement vide clignote au bout, et on claque le bon tampon dessus : le
   point s'imprime tout seul. C'est la leçon même — **on choisit le type, le
   point en découle**. D'où le piège de la fiche, qui devient jouable :
   « Comme il fait chaud ! » et « Arrête de parler ! » portent le même point
   sans être du même type, et « Souligne le verbe. » est injonctive avec un
   simple point. Le tampon injonctif porte donc SES DEUX points côte à côte :
   c'est la seule famille qui n'a pas un point à elle, et ça se voit.

   La voix lit les phrases, et c'est voulu : l'intonation est l'indice qui
   sépare « Tu viens. » de « Tu viens ? ». C'est du contenu pédagogique, comme
   les noms de lieux du Tour du Monde — jamais une consigne (règle 2).

   Apprendre = aucune sanction : pas de vies, pas de chrono, autant d'essais
   qu'on veut. Les étoiles sont un simple retour de fin de partie. */

type Kind = 'decl' | 'inter' | 'excl' | 'inj'
type Mark = '.' | '?' | '!'

interface Phrase { t: string; k: Kind; pt: Mark; lvl: 1 | 2 | 3 }

/* Le corpus. `t` n'a PAS son point final : c'est le jeu qui l'imprime.
   `pt` dit lequel — utile surtout pour l'injonctive, seule famille qui
   accepte les deux (« Ferme la porte. » mais « Viens vite ! »). */
const CORPUS: Phrase[] = [
  // ---- Déclaratives : on raconte, on explique ----
  { t: 'Je m’appelle Lisa', k: 'decl', pt: '.', lvl: 1 },
  { t: 'Le chat dort sur le canapé', k: 'decl', pt: '.', lvl: 1 },
  { t: 'Les poules picorent des graines', k: 'decl', pt: '.', lvl: 1 },
  { t: 'Il pleut depuis ce matin', k: 'decl', pt: '.', lvl: 1 },
  { t: 'Ma sœur joue dans le jardin', k: 'decl', pt: '.', lvl: 2 },
  { t: 'Papa prépare le dîner', k: 'decl', pt: '.', lvl: 2 },
  { t: 'Le lapin se cache sous la haie', k: 'decl', pt: '.', lvl: 2 },
  { t: 'Nous partons en vacances demain', k: 'decl', pt: '.', lvl: 3 },
  { t: 'La maîtresse écrit la date au tableau', k: 'decl', pt: '.', lvl: 3 },
  { t: 'Cette histoire finit bien', k: 'decl', pt: '.', lvl: 3 },

  // ---- Interrogatives : on demande ----
  { t: 'Où vas-tu', k: 'inter', pt: '?', lvl: 1 },
  { t: 'Quel âge as-tu', k: 'inter', pt: '?', lvl: 1 },
  { t: 'Comment t’appelles-tu', k: 'inter', pt: '?', lvl: 1 },
  { t: 'Veux-tu jouer avec moi', k: 'inter', pt: '?', lvl: 1 },
  { t: 'À qui appartient ce livre', k: 'inter', pt: '?', lvl: 2 },
  { t: 'As-tu vu mon crayon', k: 'inter', pt: '?', lvl: 2 },
  { t: 'Pourquoi ris-tu', k: 'inter', pt: '?', lvl: 2 },
  { t: 'Est-ce que tu viens avec moi', k: 'inter', pt: '?', lvl: 3 },
  { t: 'Combien de chatons y a-t-il', k: 'inter', pt: '?', lvl: 3 },
  { t: 'Quand partons-nous à la mer', k: 'inter', pt: '?', lvl: 3 },

  // ---- Exclamatives : on ressent, on s’émerveille ----
  { t: 'Comme il fait chaud', k: 'excl', pt: '!', lvl: 1 },
  { t: 'C’est magnifique', k: 'excl', pt: '!', lvl: 1 },
  { t: 'Quelle belle journée', k: 'excl', pt: '!', lvl: 1 },
  { t: 'Quelle chance', k: 'excl', pt: '!', lvl: 1 },
  { t: 'Comme tu as grandi', k: 'excl', pt: '!', lvl: 2 },
  { t: 'Que ce gâteau est bon', k: 'excl', pt: '!', lvl: 2 },
  { t: 'C’est vraiment trop drôle', k: 'excl', pt: '!', lvl: 2 },
  { t: 'Comme cette fleur sent bon', k: 'excl', pt: '!', lvl: 3 },
  { t: 'Que de monde dans la rue', k: 'excl', pt: '!', lvl: 3 },
  { t: 'Quel beau spectacle nous avons vu', k: 'excl', pt: '!', lvl: 3 },

  // ---- Injonctives : on ordonne, on conseille ----
  { t: 'Ferme la porte', k: 'inj', pt: '.', lvl: 1 },
  { t: 'Viens vite', k: 'inj', pt: '!', lvl: 1 },
  { t: 'Range ta chambre', k: 'inj', pt: '.', lvl: 1 },
  { t: 'Arrête de parler', k: 'inj', pt: '!', lvl: 1 },
  { t: 'Souligne le verbe', k: 'inj', pt: '.', lvl: 2 },
  { t: 'Donne-moi la main', k: 'inj', pt: '.', lvl: 2 },
  { t: 'Écoute bien la consigne', k: 'inj', pt: '.', lvl: 2 },
  { t: 'N’oublie pas ton cartable', k: 'inj', pt: '!', lvl: 3 },
  { t: 'Ne cours pas dans le couloir', k: 'inj', pt: '!', lvl: 3 },
  { t: 'Recopie cette phrase au propre', k: 'inj', pt: '.', lvl: 3 }
]

/* Les quatre tampons. Celui de l'injonctive porte SES DEUX points côte à
   côte : c'est la seule famille qui accepte « . » comme « ! », et le tampon
   le dit à lui seul. */
const KINDS: { k: Kind; cap: string; marks: string[]; color: string }[] = [
  { k: 'decl', cap: 'déclarative', marks: ['.'], color: '#3A93BC' },
  { k: 'inter', cap: 'interrogative', marks: ['?'], color: '#3FA45E' },
  { k: 'excl', cap: 'exclamative', marks: ['!'], color: '#E8873A' },
  { k: 'inj', cap: 'injonctive', marks: ['.', '!'], color: '#8E6FD4' }
]

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
   c'est celle-là qu'on montre en rouge : Joyce voit POURQUOI, elle ne devine
   pas. `bad` nomme le repère cassé, `t` s'affiche tel quel. */
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
  { t: 'le chien aboie très fort.', ok: false, bad: 'maj' },
  { t: 'mes cousines arrivent ce soir.', ok: false, bad: 'maj' },
  { t: 'la neige recouvre le jardin.', ok: false, bad: 'maj' },
  { t: 'le facteur passe à midi.', ok: false, bad: 'maj' },
  { t: 'Le chien aboie très fort', ok: false, bad: 'pt' },
  { t: 'Nous avons cueilli des fraises', ok: false, bad: 'pt' },
  { t: 'La neige recouvre le jardin', ok: false, bad: 'pt' },
  { t: 'Mes cousines arrivent ce soir', ok: false, bad: 'pt' },
  { t: 'Le sous très aboie chien.', ok: false, bad: 'sens' },
  { t: 'Arrivent cousines ce mes.', ok: false, bad: 'sens' },
  { t: 'Recouvre jardin la le.', ok: false, bad: 'sens' },
  { t: 'Fraises avons des nous.', ok: false, bad: 'sens' }
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

interface State {
  running: boolean
  lock: boolean
  mode: ModeId
  q: number
  mistakes: number
  done: number
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

/** Le point imprimé sur la carte, en très gros. */
function markSVG(m: string, px: number, color = '#E8574C'): string {
  return `<svg viewBox="0 0 60 60" width="${px}" height="${px}" class="po-mark" aria-hidden="true">
    ${glyph(m, 30, 46, 60, color)}</svg>`
}

/* ---------- Le pool de phrases, selon le niveau ---------- */
function kindsOfTier(): Kind[] {
  // Fleur : on laisse l'injonctive de côté, elle se confond avec l'exclamative
  return ctx.byTier<Kind[]>(['decl', 'inter', 'excl'], ['decl', 'inter', 'excl', 'inj'], ['decl', 'inter', 'excl', 'inj'])
}
const maxLvl = () => ctx.byTier(1, 2, 3)
const readsAloud = () => ctx.byTier(true, true, false)

function pickPhrase(): Phrase {
  const ks = kindsOfTier(), lv = maxLvl()
  const pool = CORPUS.filter(p => ks.includes(p.k) && p.lvl <= lv)
  // Éviter de resservir la même deux fois de suite
  const fresh = pool.filter(p => p !== po!.phrase)
  return pick(fresh.length ? fresh : pool)
}

/* ---------- Manche : « Phrase ? » ---------- */
function roundPhrase() {
  const me = po!
  const wantOk = Math.random() < 0.5
  const pool = CANDIDATES.filter(c => c.ok === wantOk && c !== me.cand)
  me.cand = pick(pool)
  hook(me.cand.ok ? 'oui' : 'non')
  $('poBoard').innerHTML = `
    <div class="po-card po-card-plain"><span class="po-text">${me.cand.t}</span></div>
    <div class="po-why" id="poWhy">
      ${(['maj', 'pt', 'sens'] as Flaw[]).map(f =>
        `<span class="po-crit" data-c="${f}"><b>${f === 'maj' ? 'Aa' : f === 'pt' ? '.' : '💭'}</b>${FLAW_CAP[f]}</span>`).join('')}
    </div>`
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
  const why = $('poWhy')
  why.classList.add('show')
  ;(['maj', 'pt', 'sens'] as Flaw[]).forEach(f => {
    const el = why.querySelector<HTMLElement>(`[data-c="${f}"]`)!
    el.classList.add(c.ok || c.bad !== f ? 'ok' : 'ko')
  })
  judge(right, () => {
    // Le repère cassé est le seul à retenir : on le laisse seul en rouge
    if (!c.ok) shake(why.querySelector(`[data-c="${c.bad}"]`)!, 7, 320)
  })
}

/* ---------- Manche : « Quel type ? » (le cœur) ---------- */
function roundType() {
  const me = po!
  me.phrase = pickPhrase()
  const p = me.phrase
  hook(p.k)
  $('poBoard').innerHTML = `
    <div class="po-card" id="poCardEl">
      <span class="po-text">${p.t}</span><span class="po-slot" id="poSlot"></span>
      <button class="po-say" id="poSay" aria-label="Réécouter">${ICON.sound}</button>
    </div>`
  // En fleur, l'injonctive est laissée de côté : son tampon disparaît aussi,
  // sinon on propose un choix qui n'est jamais la bonne réponse.
  const dispo = KINDS.filter(k => kindsOfTier().includes(k.k))
  $('poTools').innerHTML = shuffle([...dispo]).map(k =>
    `<span class="tool-item"><button class="po-stamp" data-a="${k.k}" aria-label="${k.cap}">
       ${stampSVG(k)}</button>
     <i class="tool-cap">${k.cap}</i></span>`).join('')
  bindTools(a => answerType(a as Kind))
  ;($('poSay') as HTMLButtonElement).onclick = () => speakPhrase()
  if (readsAloud()) ctx.after(420, () => po && po.running && speakPhrase())
}

/** On lit la phrase AVEC son point : c'est l'intonation qui enseigne. */
function speakPhrase() {
  const p = po?.phrase
  if (!p) return
  ctx.say(`${p.t}${p.pt === '.' ? '.' : ' ' + p.pt}`)
}

function answerType(k: Kind) {
  const me = po!
  const p = me.phrase!
  const right = k === p.k
  if (right) {
    // Le point s'imprime tout seul : on choisit le TYPE, pas le point
    const slot = $('poSlot')
    slot.innerHTML = markSVG(p.pt, 52)
    slot.classList.add('inked')
    fxAt(slot, JUICE.warm, 12)
    shake($('poCardEl'), 5, 260)
    ctx.after(520, () => po && po.running && ctx.say(KIND_SAY[p.k]))
  }
  judge(right, () => speakPhrase())
}

/* ---------- Manche : « Le nom du point » ---------- */
function roundMark() {
  const me = po!
  const pool = MARKS.filter(m => m.lvl <= maxLvl())
  const frais = pool.filter(m => m.name !== me.markQ?.name)
  const good = pick(frais.length ? frais : pool)
  me.markQ = good
  me.reverse = Math.random() < 0.4
  hook(good.name)
  if (me.reverse) {
    // On entend le nom, on cherche le signe
    $('poBoard').innerHTML = `
      <div class="po-card po-card-plain"><span class="po-name">${good.name}</span>
        <button class="po-say" id="poSay" aria-label="Réécouter">${ICON.sound}</button></div>`
    $('poTools').innerHTML = shuffle([...pool]).map(m =>
      `<span class="tool-item"><button class="po-bigmark" data-a="${m.name}" aria-label="${m.name}">
         ${markSVG(m.m, 46, '#45362A')}</button></span>`).join('')
    ;($('poSay') as HTMLButtonElement).onclick = () => ctx.say(good.name)
    ctx.after(380, () => po && po.running && ctx.say(good.name))
  } else {
    // On voit le signe, on cherche son nom
    $('poBoard').innerHTML = `<div class="po-card po-card-plain">${markSVG(good.m, 120)}</div>`
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

/** Branche les boutons de la rangée du bas sur une réponse. */
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
    la même manche, autant de fois qu'il faut. */
function judge(right: boolean, after?: () => void) {
  const me = po!
  // Le bot ne doit pas cliquer pendant l'animation : `busy` coupe le crochet
  // le temps de la réponse, `me.answer` garde la manche pour un nouvel essai.
  me.busy = true
  if (right) {
    me.done++
    sfx('bong', { vol: 0.55, rate: 0.9 })
    sfx('confirm', { vol: 0.7, delay: 0.12 })
    stampCard()
    paintDots()
    after?.()
    me.q++
    ctx.after(1500, () => {
      if (!po || !po.running) return
      me.lock = false
      me.busy = false
      if (me.q >= ROUNDS) return finish()
      nextRound()
    })
  } else {
    me.mistakes++
    sfx('drop', { vol: 0.4, rate: 0.85 })
    shake($('poTools'), 6, 300)
    after?.()
    ctx.after(1100, () => {
      if (!po || !po.running) return
      me.lock = false
      $('poTools').querySelectorAll<HTMLElement>('.picked').forEach(x => x.classList.remove('picked'))
      // On retente la MÊME manche : l'erreur n'est pas une perte
      $('poBoard').querySelectorAll<HTMLElement>('.po-crit').forEach(x => x.classList.remove('ok', 'ko'))
      $('poBoard').querySelectorAll<HTMLElement>('.po-why').forEach(x => x.classList.remove('show'))
      me.busy = false   // la manche est la même : le bot peut réessayer
    })
  }
}

/** La carte postale se remplit d'un tampon par bonne réponse. */
function stampCard() {
  const wall = $('poWall')
  const i = po!.done - 1
  const cell = wall.children[i] as HTMLElement | undefined
  if (!cell) return
  cell.innerHTML = stampSVG(pick(KINDS))
  cell.classList.add('on')
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
  me.q = 0; me.mistakes = 0; me.done = 0
  me.lock = false
  me.phrase = null; me.cand = null; me.markQ = null
  document.querySelectorAll<HTMLElement>('.po-mode').forEach(x => x.classList.toggle('sel', x.dataset.m === mode))
  $('poWall').innerHTML = Array.from({ length: ROUNDS }, () => '<span class="po-slotcell"></span>').join('')
  paintDots()
  nextRound()
}

function finish() {
  const me = po!
  const stars = me.mistakes === 0 ? 3 : me.mistakes <= 2 ? 2 : 1
  confetti()
  sfx('open', { vol: 0.7 })
  const titre = me.mode === 'phrase' ? 'Courrier trié !'
    : me.mode === 'type' ? 'Tout est tamponné !'
    : 'Tous les points nommés !'
  ctx.finish({
    title: titre,
    msg: `${ctx.playerName} a tamponné ${me.done} phrase${me.done > 1 ? 's' : ''}`,
    stars, starsEarned: stars, outroMs: 900
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
          <div class="po-wall" id="poWall"></div>
          <div class="mem-dots" id="poDots"></div>
        </div>
      </div>`
    preloadSfx(['bong', 'confirm', 'drop', 'open', 'click'])
    po = {
      running: true, lock: false, mode: 'type', q: 0, mistakes: 0, done: 0,
      phrase: null, cand: null, markQ: null, reverse: false, answer: null, busy: false
    }
    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if (botOn()) {
      ;(window as unknown as { __po: unknown }).__po = {
        state: () => po && {
          answer: po.busy ? null : po.answer, mode: po.mode,
          q: po.q, done: po.done, total: ROUNDS, mistakes: po.mistakes
        },
        setMode: (m: ModeId) => po && po.running && setMode(m)
      }
    }
    document.querySelectorAll<HTMLElement>('.po-mode').forEach(b => {
      b.onclick = () => { if (po && po.running) { sfx('click', { vol: 0.4 }); setMode(b.dataset.m as ModeId) } }
    })
    setMode('type')
    return () => {
      if (botOn()) delete (window as unknown as { __po?: unknown }).__po
      if (po) { po.running = false; po = null }
    }
  }
}
