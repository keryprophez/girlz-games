import type { GameContext, GameDef } from '../core/types'
import { $, shuffle } from '../core/utils'
import { sGood, sNope, sPop, sWin } from '../core/audio'
import { fxAt, JUICE } from '../core/fx'
import { impactAt } from '../core/impact'
import { shade } from '../core/character'
import { frameStyle, GREEN_GRASS, GREEN_TREES, loadAtlas, type Atlas } from '../core/sprites'

/* Paires de Chaussettes — le panier de linge est renversé dans le jardin !
   Des chaussettes TRICOTÉES (talon, pointe, côtes, mailles), à apparier
   sur le fil à linge avec leur pince en bois, contre la montre. */

const SOCK_COLORS = ['#FF6B81', '#FFA94D', '#F5C518', '#5EC97B', '#4FB8E7', '#B197FC', '#F58FB8', '#8FD7CE']
const PATTERNS = ['plain', 'dots', 'stripes', 'star', 'heart'] as const
type Pattern = typeof PATTERNS[number]

let uid = 0
/** Une chaussette qui a l'air TRICOTÉE : talon et pointe contrastés, côtes au
    poignet, mailles verticales, ombre interne — le rendu « catalogue » qui
    manquait à l'ancien aplat. */
function sockSVG(color: string, pattern: Pattern, px: number): string {
  const id = 'sk' + ++uid
  const d = 'M20,10 L42,10 L42,42 Q42,47 46,50 L54,56 Q60,62 55,68 Q49,75 41,70 L26,59 Q20,54 20,46 Z'
  const dark = shade(color, 0.25)
  const darker = shade(color, 0.45)
  let deco = ''
  if (pattern === 'dots') deco = `<g fill="#fff" opacity=".85" clip-path="url(#${id})">
    <circle cx="27" cy="22" r="3.4"/><circle cx="37" cy="32" r="3.4"/><circle cx="27" cy="42" r="3.4"/>
    <circle cx="38" cy="52" r="3.4"/><circle cx="48" cy="62" r="3.4"/></g>`
  if (pattern === 'stripes') deco = `<g stroke="#fff" stroke-width="5" opacity=".85" clip-path="url(#${id})">
    <line x1="16" y1="22" x2="46" y2="22"/><line x1="16" y1="36" x2="46" y2="36"/><line x1="16" y1="50" x2="60" y2="50"/><line x1="26" y1="64" x2="60" y2="64"/></g>`
  if (pattern === 'star') deco = `<path clip-path="url(#${id})" fill="#fff" opacity=".9"
    d="M31,26 L34,34 L42,34 L36,39 L38,47 L31,42 L24,47 L26,39 L20,34 L28,34 Z"/>`
  if (pattern === 'heart') deco = `<path clip-path="url(#${id})" fill="#fff" opacity=".9"
    d="M31,30 C28,24 19,25 19,32 C19,38 27,42 31,46 C35,42 43,38 43,32 C43,25 34,24 31,30 Z"/>`
  return `<svg viewBox="0 0 66 80" width="${px}" height="${px * 1.2}" xmlns="http://www.w3.org/2000/svg">
    <clipPath id="${id}"><path d="${d}"/></clipPath>
    <path d="${d}" fill="${color}"/>${deco}
    <g clip-path="url(#${id})">
      <!-- Mailles : fines côtes verticales sur toute la jambe -->
      <g stroke="${darker}" stroke-width="1" opacity=".18">
        ${[24, 28, 32, 36, 40].map(x => `<line x1="${x}" y1="10" x2="${x}" y2="50"/>`).join('')}
      </g>
      <!-- Talon et pointe en teinte soutenue, comme les vraies -->
      <path d="M42,40 Q52,44 50,56 L42,52 Q40,46 42,40 Z" fill="${dark}" opacity=".8"/>
      <path d="M46,58 Q58,60 56,68 Q50,75 42,70 Z" fill="${dark}" opacity=".85"/>
      <!-- Ombre interne le long du bord bas : du volume -->
      <path d="${d}" fill="none" stroke="rgba(40,25,15,.16)" stroke-width="7" transform="translate(-1.6,-2)"/>
    </g>
    <path d="${d}" fill="none" stroke="${dark}" stroke-width="3" stroke-linejoin="round"/>
    <!-- Poignet côtelé -->
    <rect x="17" y="4" width="28" height="11" rx="4" fill="#FFF6E8" stroke="${dark}" stroke-width="3"/>
    <g stroke="${dark}" stroke-width="1.4" opacity=".5">
      <line x1="23" y1="6" x2="23" y2="13"/><line x1="29" y1="6" x2="29" y2="13"/>
      <line x1="35" y1="6" x2="35" y2="13"/><line x1="41" y1="6" x2="41" y2="13"/>
    </g>
  </svg>`
}

/** La pince à linge en bois qui tient une chaussette accrochée. */
const pinSVG = `<svg class="sk-pin" viewBox="0 0 14 26" width="11" height="20">
  <rect x="4" y="1" width="6" height="24" rx="2.6" fill="#C99A5F" stroke="#96632F" stroke-width="1.6"/>
  <line x1="7" y1="10" x2="7" y2="24" stroke="#96632F" stroke-width="1.4"/>
  <circle cx="7" cy="7" r="1.6" fill="#8A8F98"/>
</svg>`

let sk: any = null
let ctx: GameContext

function loadRound() {
  const nPairs = sk.rounds[sk.round]
  $('skRound').textContent = `Manche ${sk.round + 1}/${sk.rounds.length}`
  sk.left = nPairs
  sk.sel = null

  // Combos couleur × motif : en facile toutes les couleurs diffèrent,
  // en normal/expert des paires partagent la couleur (il faut regarder le motif)
  let combos: { c: string; p: Pattern }[] = []
  if (ctx.tier === 'easy') {
    combos = shuffle([...SOCK_COLORS]).slice(0, nPairs).map((c, i) => ({ c, p: PATTERNS[i % PATTERNS.length] }))
  } else {
    const cols = shuffle([...SOCK_COLORS]).slice(0, Math.max(2, Math.ceil(nPairs / 2)))
    const all: { c: string; p: Pattern }[] = []
    cols.forEach(c => PATTERNS.forEach(p => all.push({ c, p })))
    combos = shuffle(all).slice(0, nPairs)
  }

  const area = $('skArea')
  area.querySelectorAll('.sock').forEach(e => e.remove())
  const W = area.clientWidth, H = area.clientHeight
  const lineH = 74 // zone du fil à linge en haut
  const n = nPairs * 2
  const px = Math.max(40, Math.min(58, Math.sqrt((W * (H - lineH)) / n) * 0.5))
  const cols2 = Math.ceil(Math.sqrt((n * W) / (H - lineH)))
  const rows = Math.ceil(n / cols2)
  const cw = W / cols2, ch = (H - lineH) / rows
  const cells = shuffle([...Array(cols2 * rows).keys()]).slice(0, n)
  const socks = shuffle(combos.flatMap(cb => [cb, cb]))

  sk.pinned = 0
  socks.forEach((cb, i) => {
    const cell = cells[i]
    const cx = cell % cols2, cy = Math.floor(cell / cols2)
    const b = document.createElement('button')
    b.className = 'sock'
    b.innerHTML = sockSVG(cb.c, cb.p, px)
    const jx = (Math.random() * 0.5 + 0.2) * (cw - px)
    const jy = (Math.random() * 0.5 + 0.2) * (ch - px * 1.2)
    b.style.left = Math.max(2, Math.min(W - px - 2, cx * cw + jx)) + 'px'
    b.style.top = lineH + Math.max(0, Math.min(H - lineH - px * 1.2 - 2, cy * ch + jy)) + 'px'
    b.style.setProperty('--rot', (Math.random() * 50 - 25).toFixed(0) + 'deg')
    ;(b as any)._key = cb.c + cb.p
    b.onclick = () => tapSock(b as any, px)
    area.appendChild(b)
  })
}

function tapSock(b: any, px: number) {
  if (!sk || !sk.running || b.classList.contains('pinned')) return
  if (sk.sel === b) { b.classList.remove('lifted'); sk.sel = null; return }
  if (!sk.sel) { sk.sel = b; b.classList.add('lifted'); sPop(); return }
  const a = sk.sel
  sk.sel = null
  a.classList.remove('lifted')
  if (a._key === b._key) {
    // La paire s'envole s'accrocher au fil
    sGood()
    const slot = sk.pinned++
    const area = $('skArea')
    const W = area.clientWidth
    const nSlots = sk.rounds[sk.round]
    const slotW = Math.min(90, (W - 20) / nSlots)
    const baseX = (W - slotW * nSlots) / 2 + slot * slotW
    ;[a, b].forEach((s: HTMLElement, k: number) => {
      s.classList.add('pinned')
      s.style.left = baseX + k * (slotW * 0.34) + 'px'
      s.style.top = '14px'
      s.style.setProperty('--rot', (k ? 8 : -8) + 'deg')
      s.insertAdjacentHTML('afterbegin', pinSVG)
    })
    fxAt(b, JUICE.green, 10)
    impactAt(b, 0.35, { matter: 'pate', noShake: true })
    sk.left--
    if (sk.left === 0) {
      sk.round++
      if (sk.round < sk.rounds.length) {
        ctx.toast('Panier suivant ! 🧺')
        setTimeout(() => sk && sk.running && loadRound(), 900)
      } else finish()
    }
  } else {
    sk.penalties += 2
    ;[a, b].forEach((s: HTMLElement) => { s.classList.remove('shake'); void (s as any).offsetWidth; s.classList.add('shake') })
    sNope(); ctx.toast('Pas la même ! +2s')
  }
}

function finish() {
  const total = (performance.now() - sk.t0) / 1000 + sk.penalties
  sWin()
  const nTotal = sk.rounds.reduce((s: number, r: number) => s + r, 0)
  const stars = total <= nTotal * 4 ? 3 : total <= nTotal * 7 ? 2 : 1
  ctx.finish({
    title: 'Tout le linge est étendu !',
    msg: `${ctx.playerName} a trié ${nTotal} paires en ${Math.round(total)} secondes 🧦`,
    stars, starsEarned: stars
  })
}

export const socks: GameDef = {
  id: 'socks', name: 'Chaussettes', icon: '🧦', sq: 'sq-peach', cat: 'reflexion',
  subtitle: 'Retrouve les paires et accroche-les sur le fil !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="skRound">Manche 1/3</div>
        <div class="chip" id="skTime">⏱ 0s</div>
      </div>
      <div id="skArea">
        <svg class="sk-line" viewBox="0 0 400 30" preserveAspectRatio="none">
          <path d="M0,8 Q200,26 400,8" fill="none" stroke="#B97F3F" stroke-width="4"/>
          <path d="M0,10.5 Q200,28.5 400,10.5" fill="none" stroke="rgba(105,72,38,.3)" stroke-width="2"/>
        </svg>
        <div id="skDecor"></div>
      </div>`
    sk = { rounds: c.byTier([3, 4, 5], [4, 6, 7], [5, 7, 9]), round: 0, penalties: 0, t0: performance.now(), running: true, sel: null }
    const tick = setInterval(() => {
      if (!sk || !sk.running) return
      $('skTime').textContent = '⏱ ' + Math.floor((performance.now() - sk.t0) / 1000 + sk.penalties) + 's'
    }, 500)
    // Le jardin au fond : herbe et buissons de la planche nature
    loadAtlas('nature').then((n: Atlas) => {
      if (!sk || !sk.running) return
      const w = $('skArea').clientWidth
      const bits: string[] = []
      for (let i = 0; i < Math.max(4, Math.floor(w / 110)); i++) {
        const g = i % 2 ? GREEN_GRASS[i % GREEN_GRASS.length] : GREEN_TREES[i % GREEN_TREES.length]
        const px2 = i % 2 ? 44 : 64
        bits.push(`<i class="spr sk-bush" style="${frameStyle(n, g, px2)};left:${(i + 0.15) * 110}px"></i>`)
      }
      $('skDecor').innerHTML = bits.join('')
    })
    loadRound()
    return () => { if (sk) { sk.running = false; sk = null } clearInterval(tick) }
  }
}
