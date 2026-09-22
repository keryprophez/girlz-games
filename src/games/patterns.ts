import type { GameContext, GameDef } from '../core/types'
import { pick, rnd, shuffle } from '../core/utils'
import { sfx, preloadSfx } from '../core/sfx'
import { fxAt, JUICE } from '../core/fx'
import { shake } from '../core/juice'

/* Suites logiques — qu'est-ce qui vient après ? Formes dessinées en SVG,
   zéro lecture. Motifs AB/AABB en douce, ABC en normale, tailles qui
   grandissent en expert.

   Repris le 22/09 : plein écran (le train de formes traverse l'écran, les
   réponses sont de grosses cartes en bas), manches en pastilles, plus de
   score écrit. Apprendre SANS sanction : une mauvaise forme tremble et
   s'efface, on réessaie ; au deuxième raté la bonne vient se poser dans
   la case. Une suite trouvée fait la vague, et le motif qui se répète se
   souligne de couleur — on VOIT pourquoi c'était cette forme-là. */

type Item = { kind: string; color: string; size?: number }
const KINDS = ['circle', 'square', 'triangle', 'star', 'heart', 'diamond']
const COLORS = ['#FF6B81', '#FFA94D', '#F5C518', '#5EC97B', '#4FB8E7', '#B197FC']

function shapeSVG(it: Item, px: number): string {
  const s = it.size ?? 1
  const w = px * s
  const c = it.color
  let inner = ''
  switch (it.kind) {
    case 'circle': inner = `<circle cx="30" cy="30" r="22" fill="${c}"/>`; break
    case 'square': inner = `<rect x="10" y="10" width="40" height="40" rx="8" fill="${c}"/>`; break
    case 'triangle': inner = `<path d="M30,8 L54,50 L6,50 Z" fill="${c}" stroke-linejoin="round"/>`; break
    case 'star': inner = `<path d="M30,6 L37,22 L54,23 L41,35 L45,52 L30,43 L15,52 L19,35 L6,23 L23,22 Z" fill="${c}" stroke-linejoin="round"/>`; break
    case 'heart': inner = `<path d="M30,18 C24,6 6,9 6,23 C6,36 22,44 30,52 C38,44 54,36 54,23 C54,9 36,6 30,18 Z" fill="${c}"/>`; break
    case 'diamond': inner = `<path d="M30,6 L52,30 L30,54 L8,30 Z" fill="${c}" stroke-linejoin="round"/>`; break
  }
  return `<svg viewBox="0 0 60 60" width="${w}" height="${w}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`
}

const key = (it: Item) => it.kind + it.color + (it.size ?? 1)

function makeRound(tier: string): { seq: Item[]; answer: Item; options: Item[]; period: number } {
  const kinds = shuffle([...KINDS])
  const colors = shuffle([...COLORS])
  let motif: Item[]
  let repeats: number
  if (tier === 'easy') {
    const A = { kind: kinds[0], color: colors[0] }
    const B = { kind: kinds[1], color: colors[1] }
    motif = Math.random() < 0.5 ? [A, B] : [A, A, B]
    repeats = 2
  } else if (tier === 'med') {
    const A = { kind: kinds[0], color: colors[0] }
    const B = { kind: kinds[1], color: colors[1] }
    const C = { kind: kinds[2], color: colors[2] }
    motif = pick([[A, B, C], [A, A, B, C], [A, B, B]])
    repeats = 2
  } else {
    if (Math.random() < 0.4) {
      // Tailles qui grandissent puis recommencent
      const A = { kind: kinds[0], color: colors[0] }
      motif = [{ ...A, size: 0.5 }, { ...A, size: 0.75 }, { ...A, size: 1 }]
      repeats = 2
    } else {
      const A = { kind: kinds[0], color: colors[0] }
      const B = { kind: kinds[1], color: colors[1] }
      const C = { kind: kinds[2], color: colors[2] }
      motif = pick([[A, B, C, C], [A, B, A, C], [A, C, B, C]])
      repeats = 2
    }
  }
  const full: Item[] = []
  for (let r = 0; r < repeats + 1; r++) full.push(...motif)
  const cut = motif.length * repeats + rnd(0, motif.length - 1)
  const seq = full.slice(0, cut)
  const answer = full[cut]
  const options: Item[] = [answer]
  let guard = 0
  while (options.length < (tier === 'easy' ? 3 : 4) && guard++ < 60) {
    const o: Item = Math.random() < 0.5 && answer.size
      ? { ...answer, size: pick([0.5, 0.75, 1].filter(s => s !== answer.size)) }
      : { kind: pick(KINDS), color: pick(COLORS), size: answer.size }
    if (!options.some(x => key(x) === key(o))) options.push(o)
  }
  return { seq, answer, options: shuffle(options), period: motif.length }
}

interface State {
  round: number
  total: number
  /** Manches trouvées du premier coup / au deuxième essai. */
  first: number
  second: number
  tries: number
  lock: boolean
  running: boolean
  answer: Item
  period: number
  root: HTMLElement
}

let pt: State | null = null
let ctx: GameContext

const $in = (me: State, sel: string) => me.root.querySelector<HTMLElement>(sel)!

function cellPx(me: State, n: number) {
  const w = $in(me, '.pt-arena').clientWidth - 120
  return Math.max(52, Math.min(130, Math.floor(w / (n + 0.4)) - 10))
}

function load(me: State) {
  const r = makeRound(ctx.tier)
  me.answer = r.answer
  me.period = r.period
  me.tries = 0
  const px = cellPx(me, r.seq.length + 1)
  const seq = $in(me, '.pt-seq')
  seq.style.setProperty('--c', px + 'px')
  seq.innerHTML = r.seq.map((it, k) => `<span class="pt-cell" style="--k:${k}">${shapeSVG(it, px * 0.82)}</span>`).join('')
    + `<span class="pt-cell pt-q" style="--k:${r.seq.length}"></span>`
  seq.classList.remove('solved')
  const opts = $in(me, '.pt-opts')
  opts.innerHTML = ''
  const opx = Math.min(150, Math.max(96, px * 1.15))
  r.options.forEach(o => {
    const b = document.createElement('button')
    b.className = 'pt-opt'
    b.dataset.key = key(o)
    b.style.setProperty('--o', opx + 'px')
    b.innerHTML = shapeSVG(o, opx * 0.72)
    b.onclick = () => answer(me, b, o)
    opts.appendChild(b)
  })
  paintDots(me)
  me.lock = false
}

function paintDots(me: State) {
  $in(me, '.pt-dots').innerHTML = Array.from({ length: me.total }, (_, i) =>
    `<i class="sn-dot${i < me.round ? ' on' : ''}${i === me.round ? ' cur' : ''}"></i>`).join('')
}

/** La forme trouvée se pose dans la case, le train fait la vague et le motif
    qui se répète se souligne. */
function solve(me: State, fromBtn: HTMLElement | null) {
  const q = $in(me, '.pt-q')
  q.innerHTML = shapeSVG(me.answer, parseFloat(getComputedStyle($in(me, '.pt-seq')).getPropertyValue('--c')) * 0.82)
  q.classList.add('found')
  const seq = $in(me, '.pt-seq')
  seq.querySelectorAll<HTMLElement>('.pt-cell').forEach((c, k) => { c.dataset.g = String(Math.floor(k / me.period) % 2) })
  seq.classList.add('solved')
  if (fromBtn) fxAt(fromBtn, JUICE.green, 12)
  me.round++
  ctx.after(1700, () => {
    if (pt !== me || !me.running) return
    if (me.round < me.total) load(me)
    else finish(me)
  })
}

function answer(me: State, b: HTMLButtonElement, o: Item) {
  if (pt !== me || !me.running || me.lock || b.classList.contains('gone')) return
  if (key(o) === key(me.answer)) {
    me.lock = true
    if (me.tries === 0) me.first++; else me.second++
    b.classList.add('good')
    sfx('confirm', { vol: 0.7 })
    solve(me, b)
    return
  }
  // Pas de sanction : la forme tremble et s'efface, on réessaie
  me.tries++
  sfx('drop', { vol: 0.4, rate: 0.8 })
  shake(b, 7, 300)
  b.classList.add('gone')
  if (me.tries >= 2) {
    me.lock = true
    ctx.after(500, () => {
      if (pt !== me) return
      me.root.querySelectorAll<HTMLElement>('.pt-opt').forEach(x => { if (x.dataset.key === key(me.answer)) x.classList.add('good') })
      solve(me, null)
    })
  }
}

function finish(me: State) {
  const pts = me.first + me.second * 0.5
  const stars = pts >= me.total - 0.5 ? 3 : pts >= me.total - 2.5 ? 2 : 1
  ctx.finish({
    title: 'Sacré sens logique !',
    msg: `Tu as trouvé ${me.first} suite${me.first > 1 ? 's' : ''} du premier coup, sur ${me.total}`,
    stars
  })
}

export const patterns: GameDef = {
  id: 'patterns', name: 'Suites Logiques', icon: '🔷', sq: 'sq-lilac', cat: 'reflexion',
  subtitle: 'Regarde le motif : qu\'est-ce qui vient après ?',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="arena pt-arena">
        <div class="pt-seq"></div>
        <div class="pt-opts"></div>
        <div class="tq-side"><div class="mem-dots pt-dots"></div></div>
      </div>`
    preloadSfx(['confirm', 'drop'])
    const me: State = {
      round: 0, total: 6, first: 0, second: 0, tries: 0, lock: false, running: true,
      answer: { kind: 'circle', color: '#000' }, period: 1, root: c.root
    }
    pt = me
    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __pt: unknown }).__pt = {
        get answer() { return key(me.answer) }, get round() { return me.round }, get lock() { return me.lock }
      }
    }
    load(me)
    return () => { me.running = false; if (pt === me) pt = null }
  }
}
