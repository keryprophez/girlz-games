import type { GameContext, GameDef } from '../core/types'
import { $, pick, rnd, shuffle } from '../core/utils'
import { sGood, sNope, sWin } from '../core/audio'
import { fxAt, JUICE } from '../core/fx'

/* Suites logiques — qu'est-ce qui vient après ? Formes dessinées en SVG,
   zéro lecture. Motifs AB/AABB en douce, ABC en normale, tailles qui
   grandissent en expert. */

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

function makeRound(tier: string): { seq: Item[]; answer: Item; options: Item[] } {
  const kinds = shuffle([...KINDS])
  const colors = shuffle([...COLORS])
  let motif: Item[] = []
  let repeats = 2
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
  return { seq, answer, options: shuffle(options) }
}

let pt: any = null
let ctx: GameContext

function load() {
  const r = makeRound(ctx.tier)
  pt.answer = r.answer
  $('ptRound').textContent = `${pt.round + 1}/${pt.total}`
  $('ptSeq').innerHTML = r.seq.map(it => `<span class="pt-cell">${shapeSVG(it, 44)}</span>`).join('')
    + `<span class="pt-cell pt-q">?</span>`
  const opts = $('ptOpts')
  opts.innerHTML = ''
  r.options.forEach(o => {
    const b = document.createElement('button')
    b.className = 'pt-opt'
    b.innerHTML = shapeSVG(o, 48)
    b.onclick = () => answer(b, o)
    opts.appendChild(b)
  })
  pt.lock = false
  ctx.say('Qu\'est-ce qui vient après ?')
}

function answer(b: HTMLButtonElement, o: Item) {
  if (!pt || !pt.running || pt.lock) return
  pt.lock = true
  if (key(o) === key(pt.answer)) {
    b.classList.add('good'); pt.score++; sGood(); fxAt(b, JUICE.green, 12)
    const q = document.querySelector('.pt-q') as HTMLElement
    q.innerHTML = shapeSVG(pt.answer, 44); q.classList.add('found')
  } else {
    b.classList.add('bad'); sNope()
    document.querySelectorAll<HTMLButtonElement>('.pt-opt').forEach(x => {
      if (x !== b && x.innerHTML === shapeSVG(pt.answer, 48)) x.classList.add('good')
    })
  }
  $('ptScore').textContent = '⭐ ' + pt.score
  pt.round++
  setTimeout(() => {
    if (!pt || !pt.running) return
    if (pt.round < pt.total) load()
    else finish()
  }, 1100)
}

function finish() {
  sWin()
  const stars = pt.score >= pt.total - 1 ? 3 : pt.score >= pt.total - 3 ? 2 : 1
  ctx.finish({
    title: 'Sacré sens logique !',
    msg: `${ctx.playerName} a trouvé ${pt.score} suites sur ${pt.total} 🔷`,
    stars, starsEarned: stars
  })
}

export const patterns: GameDef = {
  id: 'patterns', name: 'Suites Logiques', icon: '🔷', sq: 'sq-lilac', cat: 'reflexion',
  subtitle: 'Regarde le motif : qu\'est-ce qui vient après ?',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="ptRound">1/6</div>
        <div class="chip" id="ptScore">⭐ 0</div>
      </div>
      <div class="panel pt-box">
        <div class="pt-seq" id="ptSeq"></div>
        <div class="pt-opts" id="ptOpts"></div>
      </div>`
    pt = { round: 0, total: 6, score: 0, lock: false, running: true }
    load()
    return () => { if (pt) { pt.running = false; pt = null } }
  }
}
