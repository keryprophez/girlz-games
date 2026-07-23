import type { GameContext, GameDef } from '../core/types'
import { $, pick, rnd } from '../core/utils'
import { sCrunch, sGood, sPop, sWin, tone } from '../core/audio'
import { confetti, FX } from '../core/fx'

/* Bonhomme de neige — d'abord on ROULE ses trois boules soi-même (tape la
   boule : elle grossit, pose-la quand tu veux — chaque bonhomme est unique),
   puis on GLISSE les habits directement dessus : chapeau, écharpe, balai…
   Jeu créatif sans score. */

const BGS = [
  { icon: '☀️', css: 'linear-gradient(180deg,#BDE3FA,#EAF6FE 70%,#FFFFFF)' },
  { icon: '🌅', css: 'linear-gradient(180deg,#FFB98A,#FFE0CB 62%,#FFF3E6)' },
  { icon: '🌙', css: 'linear-gradient(180deg,#2E3A67,#5C6FA8 68%,#B9C8E8)' },
  { icon: '🌈', css: 'linear-gradient(180deg,#7FE0D4,#B9A7F2 55%,#F6D8F0)' }
]
const CAPS = [58, 44, 32]     // rayon maxi par boule (bas, milieu, tête)
const START_R = 20            // taille de départ d'une boule
const GROW = 3.4              // grossissement par tape
const SCARF_COLORS = ['#E04E63', '#4FA3D8', '#5EC97B', '#FFB84D', '#B08CF0']
const BTN_COLORS = ['#45362A', '#E04E63', '#4FA3D8', '#FFB84D']

interface SnLook {
  shape: string; hat: string; scarf: string; eyes: string
  nose: string; arms: string; buttons: string; extra: string
}

/* Les catégories d'habillage : un onglet = une rangée de gros choix. */
const CATS: { id: keyof SnLook; icon: string; opts?: [string, string][]; colors?: string[] }[] = [
  { id: 'hat', icon: '🎩', opts: [['none', '✖️'], ['tophat', '🎩'], ['bonnet', '🧶'], ['cap', '🧢'], ['crown', '👑']] },
  { id: 'scarf', icon: '🧣', colors: SCARF_COLORS },
  { id: 'eyes', icon: '👀', opts: [['coal', '⚫'], ['button', '🔵'], ['star', '✨']] },
  { id: 'nose', icon: '🥕', opts: [['carrot', '🥕'], ['dot', '🔴']] },
  { id: 'arms', icon: '💪', opts: [['branch', '🌿'], ['mitten', '🧤'], ['none', '✖️']] },
  { id: 'buttons', icon: '🔘', colors: BTN_COLORS },
  { id: 'extra', icon: '🎁', opts: [['none', '✖️'], ['broom', '🧹'], ['sled', '🛷'], ['bird', '🐦']] }
]

let sn: any = null
let ctx: GameContext

function defLook(): SnLook {
  return {
    shape: 'round', hat: 'none', scarf: 'none', eyes: 'coal',
    nose: 'carrot', arms: 'branch', buttons: '#45362A', extra: 'none'
  }
}

const GROUND = 300
const C = 120

function ballShape(cx: number, cy: number, r: number, shape: string, extraCls = ''): string {
  const s = `fill="url(#snBG)" stroke="#C2D9EA" stroke-width="2.5" class="${extraCls}"`
  // Petites étincelles de neige sur la boule
  const spark = `<circle cx="${cx - r * 0.4}" cy="${cy - r * 0.45}" r="${Math.max(1.6, r * 0.06)}" fill="#FFF" opacity=".9"/>
    <circle cx="${cx - r * 0.15}" cy="${cy - r * 0.6}" r="${Math.max(1.2, r * 0.04)}" fill="#FFF" opacity=".8"/>`
  if (shape === 'oval') return `<ellipse cx="${cx}" cy="${cy}" rx="${r * 1.16}" ry="${r * 0.86}" ${s}/>${spark}`
  if (shape === 'cube') return `<rect x="${cx - r * 0.92}" y="${cy - r * 0.87}" width="${r * 1.84}" height="${r * 1.74}" rx="${r * 0.34}" ${s}/>${spark}`
  return `<circle cx="${cx}" cy="${cy}" r="${r}" ${s}/>${spark}`
}

function hatSVG(hat: string, x: number, yTop: number, rH: number): string {
  if (hat === 'tophat') return `
    <rect x="${x - rH * 1.15}" y="${yTop - 3}" width="${rH * 2.3}" height="6" rx="3" fill="#45362A"/>
    <rect x="${x - rH * 0.72}" y="${yTop - 3 - rH * 1.15}" width="${rH * 1.44}" height="${rH * 1.15}" rx="3" fill="#45362A"/>
    <rect x="${x - rH * 0.72}" y="${yTop - 3 - rH * 0.4}" width="${rH * 1.44}" height="5" fill="#E04E63"/>`
  if (hat === 'bonnet') return `
    <path d="M${x - rH * 0.95},${yTop + 5} Q${x},${yTop - rH * 1.3} ${x + rH * 0.95},${yTop + 5} Z" fill="#E04E63"/>
    <rect x="${x - rH * 0.98}" y="${yTop + 1}" width="${rH * 1.96}" height="6" rx="3" fill="#FFF"/>
    <circle cx="${x}" cy="${yTop - rH * 1.15}" r="4.5" fill="#FFF" stroke="#E9C8CE" stroke-width="1.5"/>`
  if (hat === 'cap') return `
    <path d="M${x - rH * 0.9},${yTop + 4} Q${x},${yTop - rH * 1.05} ${x + rH * 0.9},${yTop + 4} Z" fill="#4FA3D8"/>
    <rect x="${x - 2}" y="${yTop}" width="${rH * 1.5}" height="5" rx="2.5" fill="#3E88B8"/>`
  if (hat === 'crown') return `
    <path d="M${x - rH * 0.7},${yTop + 3} L${x - rH * 0.7},${yTop - 9} L${x - rH * 0.32},${yTop - 3} L${x},${yTop - 12} L${x + rH * 0.32},${yTop - 3} L${x + rH * 0.7},${yTop - 9} L${x + rH * 0.7},${yTop + 3} Z"
      fill="#FFD34D" stroke="#E0A722" stroke-width="2" stroke-linejoin="round"/>`
  return ''
}

/** Positions verticales des centres des boules posées (bas → tête). */
function centers(balls: number[], shape: string): number[] {
  const ry = (r: number) => (shape === 'round' ? r : r * 0.87)
  const ys: number[] = []
  let yPrev = 0
  balls.forEach((r, i) => {
    if (i === 0) yPrev = GROUND - ry(r)
    else yPrev = yPrev - ry(balls[i - 1]) * 0.8 - ry(r) * 0.72
    ys.push(yPrev)
  })
  return ys
}

function sceneDecor(): string {
  return `
    <defs>
      <radialGradient id="snBG" cx="35%" cy="30%" r="85%">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="72%" stop-color="#F2F8FD"/>
        <stop offset="100%" stop-color="#D3E5F2"/>
      </radialGradient>
    </defs>
    <ellipse cx="30" cy="${GROUND + 4}" rx="120" ry="26" fill="rgba(255,255,255,.75)"/>
    <ellipse cx="220" cy="${GROUND + 8}" rx="150" ry="30" fill="rgba(255,255,255,.85)"/>
    <g opacity=".9">
      <rect x="24" y="218" width="5" height="9" fill="#8A5A33"/>
      <polygon points="12,220 41,220 26.5,196" fill="#2E7D57"/>
      <polygon points="15,206 38,206 26.5,184" fill="#39905F"/>
      <path d="M15,206 Q26.5,201 38,206" stroke="#FFF" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    </g>
    <ellipse cx="${C}" cy="${GROUND + 6}" rx="112" ry="13" fill="#FFFFFF" stroke="#DCE9F3" stroke-width="2"/>`
}

function snowmanSVG(): string {
  const l: SnLook = sn.look
  const balls: number[] = sn.balls
  const ry = (r: number) => (l.shape === 'round' ? r : r * 0.87)
  const ys = centers(balls, l.shape)
  const pop = (i: number) => (sn.pulse === i ? ' sn-pop' : '')

  let body = ''
  balls.forEach((r, i) => {
    let deco = ''
    if (i === 1 && balls.length > 1) {
      // Boutons sur la boule du milieu
      const btnR = Math.max(2.6, r * 0.12)
      if (l.buttons !== 'none') deco = [-0.38, 0, 0.38].map(k =>
        `<circle cx="${C}" cy="${ys[1] + ry(r) * k}" r="${btnR}" fill="${l.buttons}"/>`).join('')
    }
    body += `<g class="sn-hit${pop(i)}" data-b="${i}">${ballShape(C, ys[i], r, l.shape)}${deco}</g>`
  })

  // Bras sur la boule du milieu
  let arms = ''
  if (balls.length >= 2 && l.arms !== 'none') {
    const rM = balls[1], ay = ys[1] - ry(rM) * 0.25
    const lx = C - rM * 0.95, rx = C + rM * 0.95
    if (l.arms === 'branch') arms = `<g stroke="#8A5A33" stroke-width="4.5" stroke-linecap="round" fill="none">
      <path d="M${lx},${ay} L${lx - 28},${ay - 16} M${lx - 18},${ay - 11} L${lx - 22},${ay - 24}"/>
      <path d="M${rx},${ay} L${rx + 28},${ay - 16} M${rx + 18},${ay - 11} L${rx + 22},${ay - 24}"/></g>`
    else arms = `<g stroke="#8A5A33" stroke-width="4.5" stroke-linecap="round">
      <path d="M${lx},${ay} L${lx - 24},${ay - 14}"/><path d="M${rx},${ay} L${rx + 24},${ay - 14}"/></g>
      <circle cx="${lx - 28}" cy="${ay - 17}" r="7" fill="#E04E63" stroke="#C43B4E" stroke-width="1.6"/>
      <circle cx="${rx + 28}" cy="${ay - 17}" r="7" fill="#E04E63" stroke="#C43B4E" stroke-width="1.6"/>`
  }

  // Visage + joues roses sur la tête
  let face = ''
  if (balls.length === 3) {
    const rH = balls[2], yH = ys[2]
    const eyeY = yH - ry(rH) * 0.22, eyeDx = rH * 0.4
    if (l.eyes === 'coal') face += `<circle cx="${C - eyeDx}" cy="${eyeY}" r="${rH * 0.11}" fill="#3A3A3A"/><circle cx="${C + eyeDx}" cy="${eyeY}" r="${rH * 0.11}" fill="#3A3A3A"/>`
    else if (l.eyes === 'button') face += `<circle cx="${C - eyeDx}" cy="${eyeY}" r="${rH * 0.14}" fill="#4FA3D8" stroke="#3E88B8" stroke-width="1.4"/><circle cx="${C + eyeDx}" cy="${eyeY}" r="${rH * 0.14}" fill="#4FA3D8" stroke="#3E88B8" stroke-width="1.4"/>`
    else face += `<text x="${C - eyeDx}" y="${eyeY + rH * 0.14}" font-size="${rH * 0.42}" text-anchor="middle" fill="#FFB84D">✦</text><text x="${C + eyeDx}" y="${eyeY + rH * 0.14}" font-size="${rH * 0.42}" text-anchor="middle" fill="#FFB84D">✦</text>`
    face += `<circle cx="${C - rH * 0.62}" cy="${yH + rH * 0.18}" r="${rH * 0.2}" fill="#FFC9CF" opacity=".7"/>
      <circle cx="${C + rH * 0.62}" cy="${yH + rH * 0.18}" r="${rH * 0.2}" fill="#FFC9CF" opacity=".7"/>`
    const nY = yH + ry(rH) * 0.12
    face += l.nose === 'carrot'
      ? `<polygon points="${C - 2},${nY - rH * 0.16} ${C - 2},${nY + rH * 0.16} ${C + rH * 0.95 + 6},${nY + 1}" fill="#FF8C42" stroke="#E0731F" stroke-width="1.6" stroke-linejoin="round"/>`
      : `<circle cx="${C}" cy="${nY}" r="${rH * 0.16}" fill="#E8543F" stroke="#C43B2A" stroke-width="1.4"/>`
    const mY = yH + ry(rH) * 0.52
    face += [-2, -1, 0, 1, 2].map(i =>
      `<circle cx="${C + i * rH * 0.2}" cy="${mY + (Math.abs(i) < 2 ? rH * 0.07 : 0)}" r="${rH * 0.06}" fill="#3A3A3A"/>`).join('')
  }

  // Écharpe au cou (entre tête et milieu)
  let scarf = ''
  if (balls.length === 3 && l.scarf !== 'none') {
    const rM = balls[1]
    const neckY = ys[1] - ry(rM) * 0.82
    scarf = `<rect x="${C - rM * 0.74}" y="${neckY - 5}" width="${rM * 1.48}" height="11" rx="5.5" fill="${l.scarf}"/>
      <rect x="${C + rM * 0.16}" y="${neckY + 2}" width="10" height="${ry(rM) * 0.95}" rx="5" fill="${l.scarf}"/>`
  }

  let hat = ''
  if (balls.length === 3) hat = hatSVG(l.hat, C, ys[2] - ry(balls[2]), balls[2])

  // Déco à côté / sur la tête
  let extra = ''
  const rB = balls[0] || 30
  if (l.extra === 'broom') {
    const bx = C + rB + 22
    extra = `<path d="M${bx},${GROUND + 2} L${bx},${GROUND - 74}" stroke="#B07B45" stroke-width="5" stroke-linecap="round"/>
      <polygon points="${bx - 10},${GROUND + 4} ${bx + 10},${GROUND + 4} ${bx + 6},${GROUND - 26} ${bx - 6},${GROUND - 26}" fill="#E8C36A" stroke="#C99A3F" stroke-width="2" stroke-linejoin="round"/>`
  } else if (l.extra === 'sled') {
    extra = `<text x="${C - rB - 40}" y="${GROUND + 2}" font-size="34">🛷</text>`
  } else if (l.extra === 'bird' && balls.length === 3) {
    const topYH = ys[2] - ry(balls[2])
    const by = l.hat === 'none' ? topYH - 3 : topYH - balls[2] * 1.2 - 9
    extra = `<text x="${C + 3}" y="${by}" font-size="17">🐦</text>`
  }

  return `<svg viewBox="0 0 240 320">${sceneDecor()}${extra}${body}${arms}${scarf}${face}${hat}</svg>`
}

/* ---- Phase 1 : rouler les boules ---- */
function rollSVG(): string {
  const shape = sn.look.shape
  const ry = (r: number) => (shape === 'round' ? r : r * 0.87)
  // La pile des boules déjà posées, décalée à gauche
  const ys = centers(sn.balls, shape)
  let stack = ''
  sn.balls.forEach((r: number, i: number) => {
    stack += ballShape(C - 45, ys[i], r, shape)
  })
  const r = sn.r
  const bx = 172, by = GROUND - ry(r)
  // Contour appuyé + ombre : la boule à rouler doit bien se détacher de la neige
  const roll = `<ellipse cx="${bx}" cy="${GROUND + 3}" rx="${r * 1.05}" ry="${r * 0.16}" fill="rgba(120,155,185,.22)"/>
  <g class="sn-hit sn-roll${sn.pulse === 9 ? ' sn-pop' : ''}" data-b="9">
    <circle cx="${bx}" cy="${by}" r="${r + 5}" fill="rgba(255,255,255,.01)"/>
    ${ballShape(bx, by, r, shape).replace('stroke="#C2D9EA" stroke-width="2.5"', 'stroke="#8FB8D6" stroke-width="3.5"')}
    <path d="M${bx - r * 0.55},${by} A${r * 0.55},${r * 0.5} 0 0 1 ${bx + r * 0.55},${by}" fill="none"
      stroke="#BAD5E8" stroke-width="2.5" stroke-linecap="round" opacity=".95"/>
    <path d="M${bx - r * 0.3},${by + r * 0.4} A${r * 0.35},${r * 0.3} 0 0 0 ${bx + r * 0.35},${by + r * 0.35}" fill="none"
      stroke="#BAD5E8" stroke-width="2" stroke-linecap="round" opacity=".8"/>
  </g>
  <text x="${bx}" y="${by - ry(r) - 14}" font-size="26" text-anchor="middle" class="sn-taphint">👆</text>`
  return `<svg viewBox="0 0 240 320">${sceneDecor()}${stack}${roll}</svg>`
}

const BALL_NAMES = ['la grosse boule du bas', 'la boule du ventre', 'la boule de la tête']

function attachRollHit() {
  const hit = document.querySelector<HTMLElement>('#snSvg .sn-roll')
  if (!hit) return
  hit.onpointerdown = () => {
    if (!sn || !sn.running || sn.phase !== 'roll') return
    const cap = CAPS[sn.balls.length]
    if (sn.r >= cap) {
      $('snHint').textContent = 'Elle est GÉANTE ! Pose-la ! 😄'
      tone(140, 0.08, 'square', 0.1)
    } else {
      sn.r = Math.min(cap, sn.r + GROW)
      sCrunch(); tone(160 + sn.r * 3, 0.05, 'triangle', 0.1)
    }
    sn.pulse = 9
    $('snSvg').innerHTML = rollSVG()
    sn.pulse = -1
    attachRollHit()
  }
}

function renderRoll() {
  $('snSvg').innerHTML = rollSVG()
  sn.pulse = -1
  $('snHint').textContent = `Boule ${sn.balls.length + 1}/3 — tape ${BALL_NAMES[sn.balls.length]} pour la faire grossir !`
  $('snControls').innerHTML = `
    <button class="bigbtn primary" id="snPlace">✔ Je la pose !</button>`
  attachRollHit()
  ;($('snPlace') as HTMLButtonElement).onclick = () => {
    if (!sn || !sn.running || sn.phase !== 'roll') return
    sn.balls.push(sn.r)
    sn.r = START_R
    sGood()
    const st = $('snStage').getBoundingClientRect()
    FX.burst(st.left + st.width / 2, st.top + st.height * 0.7, { colors: ['#FFF', '#DCEFF9'], count: 10 })
    if (sn.balls.length === 3) { sn.phase = 'deco'; renderDeco(); return }
    renderRoll()
  }
}

/* ---- Phase 2 : habiller en glissant ---- */
function applyProp(k: string, v: string) {
  if (!sn || !sn.running) return
  sn.look[k] = v
  sPop()
  renderDecoSvg()
  document.querySelectorAll<HTMLElement>('.sn-opt').forEach(b => {
    b.classList.toggle('sel', sn.look[b.dataset.k!] === b.dataset.v)
  })
}

function renderDecoSvg() {
  $('snSvg').innerHTML = snowmanSVG()
  sn.pulse = -1
  document.querySelectorAll<HTMLElement>('#snSvg .sn-hit').forEach(g => {
    g.onpointerdown = () => { // toucher une boule : petit frétillement rigolo
      if (!sn || !sn.running) return
      sn.pulse = parseInt(g.dataset.b!)
      tone(500 + sn.pulse * 120, 0.06, 'triangle', 0.1)
      renderDecoSvg()
    }
  })
}

function optChips(cat: (typeof CATS)[number]): string {
  if (cat.colors) {
    return `<button class="du-opt sn-opt" data-k="${cat.id}" data-v="none">✖️</button>` + cat.colors.map(col =>
      `<button class="du-opt du-color sn-opt" data-k="${cat.id}" data-v="${col}" style="background:${col}"></button>`).join('')
  }
  return cat.opts!.map(([v, icon]) =>
    `<button class="du-opt sn-opt" data-k="${cat.id}" data-v="${v}">${icon}</button>`).join('')
}

function renderDeco() {
  $('snHint').textContent = 'Glisse les habits sur ton bonhomme !'
  $('snControls').innerHTML = `
    <div class="sn-tabs">
      ${CATS.map(cat => `<button class="chip sn-tab${cat.id === sn.cat ? ' sel' : ''}" data-c="${cat.id}">${cat.icon}</button>`).join('')}
    </div>
    <div class="du-row sn-optrow" id="snOpts"></div>
    <button class="bigbtn primary" id="snDone" style="margin-top:10px">✨ Il est parfait !</button>`
  renderDecoSvg()
  renderOpts()
  document.querySelectorAll<HTMLElement>('.sn-tab').forEach(b => {
    b.onclick = () => {
      if (!sn || !sn.running) return
      sn.cat = b.dataset.c
      document.querySelectorAll('.sn-tab').forEach(x => x.classList.remove('sel'))
      b.classList.add('sel')
      sPop(); renderOpts()
    }
  })
  ;($('snDone') as HTMLButtonElement).onclick = () => sn && sn.running && finish()
}

function renderOpts() {
  const cat = CATS.find(c => c.id === sn.cat)!
  $('snOpts').innerHTML = optChips(cat)
  document.querySelectorAll<HTMLElement>('.sn-opt').forEach(b => {
    b.classList.toggle('sel', sn.look[b.dataset.k!] === b.dataset.v)
    // Tap = applique. Glisser jusqu'au bonhomme = applique aussi (avec étincelles).
    b.onpointerdown = e => {
      if (!sn || !sn.running) return
      e.preventDefault()
      sn.dragOpt = { k: b.dataset.k!, v: b.dataset.v!, x0: e.clientX, y0: e.clientY, ghost: null, html: b.innerHTML, isColor: b.classList.contains('du-color'), bg: b.style.background }
    }
  })
}

function decoDragMove(e: PointerEvent) {
  const d = sn && sn.dragOpt
  if (!d) return
  if (!d.ghost && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 8) {
    d.ghost = document.createElement('div')
    d.ghost.className = 'sn-ghost'
    if (d.isColor) { d.ghost.style.background = d.bg; d.ghost.classList.add('sn-ghost-color') }
    else d.ghost.innerHTML = d.html
    document.body.appendChild(d.ghost)
  }
  if (d.ghost) {
    d.ghost.style.left = e.clientX - 24 + 'px'
    d.ghost.style.top = e.clientY - 24 + 'px'
  }
}

function decoDragEnd(e: PointerEvent) {
  const d = sn && sn.dragOpt
  if (!d) return
  sn.dragOpt = null
  if (!d.ghost) { applyProp(d.k, d.v); return } // simple tap
  d.ghost.remove()
  const st = $('snStage').getBoundingClientRect()
  if (e.clientX > st.left && e.clientX < st.right && e.clientY > st.top && e.clientY < st.bottom) {
    FX.burst(e.clientX, e.clientY, { colors: ['#FFF', '#FFE08A', '#DCEFF9'], count: 8 })
    applyProp(d.k, d.v)
  }
}

function finish() {
  sWin(); confetti()
  const svg = $('snSvg')
  svg.classList.add('sn-dance')
  sn.endT = setTimeout(() => sn && sn.running && ctx.finish({
    title: 'Quel bonhomme !',
    msg: `${ctx.playerName} a roulé et décoré un bonhomme de neige unique ⛄`,
    stars: 3, starsEarned: 3
  }), 900)
}

export const snowman: GameDef = {
  id: 'snowman', name: 'Bonhomme de neige', icon: '⛄', sq: 'sq-sky', cat: 'creatif', duel: false, music: 'winter',
  subtitle: 'Roule tes trois boules de neige, puis glisse les habits dessus !',
  mount(c) {
    ctx = c
    sn = { phase: 'roll', balls: [], r: START_R, look: defLook(), cat: 'hat', pulse: -1, dragOpt: null, running: true }

    const flakes = Array.from({ length: 12 }, () =>
      `<span class="sn-flake" style="left:${4 + Math.random() * 92}%;animation-duration:${5 + Math.random() * 6}s;animation-delay:${-Math.random() * 10}s;font-size:${9 + Math.random() * 8}px">❄</span>`).join('')

    c.root.innerHTML = `
      <div class="topbar" style="flex-wrap:wrap">
        ${BGS.map((b, i) => `<button class="chip sn-bg${i === 0 ? ' sel' : ''}" data-i="${i}">${b.icon}</button>`).join('')}
        <button class="chip sn-shape" data-v="round">⚪</button>
        <button class="chip sn-shape" data-v="oval">🥚</button>
        <button class="chip sn-shape" data-v="cube">🧊</button>
        <button class="chip" id="snRandom">🎲</button>
        <button class="chip" id="snReset" title="Recommencer">↺</button>
      </div>
      <div class="sn-stage" id="snStage" style="background:${BGS[0].css}">${flakes}<div id="snSvg"></div></div>
      <div class="hint" id="snHint" style="position:static;margin:4px 0 8px"></div>
      <div id="snControls"></div>`

    document.querySelectorAll<HTMLElement>('.sn-bg').forEach(b => {
      b.onclick = () => {
        if (!sn || !sn.running) return
        $('snStage').style.background = BGS[parseInt(b.dataset.i!)].css
        document.querySelectorAll('.sn-bg').forEach(x => x.classList.remove('sel'))
        b.classList.add('sel'); sPop()
      }
    })
    document.querySelectorAll<HTMLElement>('.sn-shape').forEach(b => {
      b.onclick = () => {
        if (!sn || !sn.running) return
        sn.look.shape = b.dataset.v
        sPop()
        if (sn.phase === 'roll') renderRoll(); else renderDecoSvg()
      }
    })
    ;($('snRandom') as HTMLButtonElement).onclick = () => {
      if (!sn || !sn.running) return
      // Surprise : trois boules toutes faites + look aléatoire
      sn.balls = [rnd(34, CAPS[0]), rnd(26, CAPS[1]), rnd(18, CAPS[2])]
      sn.phase = 'deco'
      sn.look = {
        shape: pick(['round', 'oval', 'cube']),
        hat: pick(['none', 'tophat', 'bonnet', 'cap', 'crown']),
        scarf: pick(['none', ...SCARF_COLORS]),
        eyes: pick(['coal', 'button', 'star']), nose: pick(['carrot', 'dot']),
        arms: pick(['branch', 'mitten', 'none']),
        buttons: pick(['none', ...BTN_COLORS]),
        extra: pick(['none', 'broom', 'sled', 'bird'])
      }
      $('snStage').style.background = pick(BGS).css
      sPop(); renderDeco()
    }
    ;($('snReset') as HTMLButtonElement).onclick = () => {
      if (!sn || !sn.running) return
      sn.phase = 'roll'; sn.balls = []; sn.r = START_R; sn.look = defLook(); sn.cat = 'hat'
      $('snStage').style.background = BGS[0].css
      document.querySelectorAll('.sn-bg').forEach((x, i) => x.classList.toggle('sel', i === 0))
      sPop(); renderRoll()
    }

    const onMove = (e: PointerEvent) => decoDragMove(e)
    const onUp = (e: PointerEvent) => decoDragEnd(e)
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)

    renderRoll()
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      if (sn) {
        sn.running = false
        clearTimeout(sn.endT)
        if (sn.dragOpt?.ghost) sn.dragOpt.ghost.remove()
        sn = null
      }
    }
  }
}
