import type { GameContext, GameDef } from '../core/types'
import { $, pick } from '../core/utils'
import { sPop, sWin } from '../core/audio'
import { confetti } from '../core/fx'

/* Bonhomme de neige — sculpte tes trois boules : tape une boule pour changer
   sa taille, choisis leur forme, puis décore : chapeau, écharpe, nez carotte…
   Jeu créatif sans score, comme Habille-toi. */

const BGS = [
  { icon: '☀️', css: 'linear-gradient(180deg,#BDE3FA,#EAF6FE 70%,#FFFFFF)' },
  { icon: '🌅', css: 'linear-gradient(180deg,#FFB98A,#FFE0CB 62%,#FFF3E6)' },
  { icon: '🌙', css: 'linear-gradient(180deg,#2E3A67,#5C6FA8 68%,#B9C8E8)' },
  { icon: '🌈', css: 'linear-gradient(180deg,#7FE0D4,#B9A7F2 55%,#F6D8F0)' }
]
// Rayons des boules (bas, milieu, tête) pour les 3 tailles S/M/L
const RB = [26, 35, 44], RM = [19, 26, 33], RH = [13, 17, 22]
const SCARF_COLORS = ['#E04E63', '#4FA3D8', '#5EC97B', '#FFB84D', '#B08CF0']
const BTN_COLORS = ['#45362A', '#E04E63', '#4FA3D8', '#FFB84D']
const SHAPES = ['round', 'oval', 'cube'] as const
const HATS = ['none', 'tophat', 'bonnet', 'cap', 'crown'] as const
const EYES = ['coal', 'button', 'star'] as const
const NOSES = ['carrot', 'dot'] as const
const ARMS = ['branch', 'mitten', 'none'] as const
const EXTRAS = ['none', 'broom', 'sled', 'bird'] as const

interface SnLook {
  shape: string; sizes: number[]
  hat: string; scarf: string; eyes: string; nose: string
  arms: string; buttons: string; extra: string
}

let sn: any = null
let ctx: GameContext

function defLook(): SnLook {
  return {
    shape: 'round', sizes: [1, 1, 1], hat: 'tophat', scarf: SCARF_COLORS[0],
    eyes: 'coal', nose: 'carrot', arms: 'branch', buttons: BTN_COLORS[0], extra: 'none'
  }
}

function ballShape(cx: number, cy: number, r: number, shape: string): string {
  const s = 'fill="#FFFFFF" stroke="#C9DDEC" stroke-width="3"'
  if (shape === 'oval') return `<ellipse cx="${cx}" cy="${cy}" rx="${r * 1.16}" ry="${r * 0.86}" ${s}/>`
  if (shape === 'cube') return `<rect x="${cx - r * 0.92}" y="${cy - r * 0.87}" width="${r * 1.84}" height="${r * 1.74}" rx="${r * 0.34}" ${s}/>`
  return `<circle cx="${cx}" cy="${cy}" r="${r}" ${s}/>`
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

function snowmanSVG(l: SnLook): string {
  const C = 110
  const ry = (r: number) => (l.shape === 'round' ? r : r * 0.87)
  const rB = RB[l.sizes[0]], rM = RM[l.sizes[1]], rH = RH[l.sizes[2]]
  const yB = 236 - ry(rB)
  const yM = yB - ry(rB) * 0.82 - ry(rM) * 0.72
  const yH = yM - ry(rM) * 0.8 - ry(rH) * 0.68
  const headTop = yH - ry(rH)
  const pop = (i: number) => (sn && sn.pulse === i ? ' sn-pop' : '')

  // Visage
  const eyeY = yH - ry(rH) * 0.22, eyeDx = rH * 0.4
  let eyes = ''
  if (l.eyes === 'coal') eyes = `<circle cx="${C - eyeDx}" cy="${eyeY}" r="2.6" fill="#3A3A3A"/><circle cx="${C + eyeDx}" cy="${eyeY}" r="2.6" fill="#3A3A3A"/>`
  else if (l.eyes === 'button') eyes = `<circle cx="${C - eyeDx}" cy="${eyeY}" r="3.2" fill="#4FA3D8" stroke="#3E88B8" stroke-width="1.4"/><circle cx="${C + eyeDx}" cy="${eyeY}" r="3.2" fill="#4FA3D8" stroke="#3E88B8" stroke-width="1.4"/>`
  else eyes = `<text x="${C - eyeDx}" y="${eyeY + 3}" font-size="9" text-anchor="middle" fill="#FFB84D">✦</text><text x="${C + eyeDx}" y="${eyeY + 3}" font-size="9" text-anchor="middle" fill="#FFB84D">✦</text>`
  const nY = yH + ry(rH) * 0.12
  const nose = l.nose === 'carrot'
    ? `<polygon points="${C - 2},${nY - 3.4} ${C - 2},${nY + 3.4} ${C + rH * 0.95 + 5},${nY + 0.5}" fill="#FF8C42" stroke="#E0731F" stroke-width="1.6" stroke-linejoin="round"/>`
    : `<circle cx="${C}" cy="${nY}" r="3.4" fill="#E8543F" stroke="#C43B2A" stroke-width="1.4"/>`
  const mY = yH + ry(rH) * 0.52
  const mouth = [-2, -1, 0, 1, 2].map(i =>
    `<circle cx="${C + i * 4.4}" cy="${mY + (Math.abs(i) < 2 ? 1.6 : 0)}" r="1.4" fill="#3A3A3A"/>`).join('')

  // Écharpe : bande au cou + pan qui pend
  const neckY = yM - ry(rM) * 0.82
  const scarf = l.scarf === 'none' ? '' : `
    <rect x="${C - rM * 0.74}" y="${neckY - 5}" width="${rM * 1.48}" height="10" rx="5" fill="${l.scarf}"/>
    <rect x="${C + rM * 0.16}" y="${neckY + 1}" width="10" height="${ry(rM) * 0.95}" rx="5" fill="${l.scarf}"/>`

  // Boutons sur la boule du milieu
  const btnR = Math.max(2.6, rM * 0.12)
  const buttons = l.buttons === 'none' ? '' : [-0.38, 0, 0.38].map(k =>
    `<circle cx="${C}" cy="${yM + ry(rM) * k}" r="${btnR}" fill="${l.buttons}"/>`).join('')

  // Bras
  const ay = yM - ry(rM) * 0.25
  let arms = ''
  if (l.arms === 'branch') {
    const lx = C - rM * 0.92, rx = C + rM * 0.92
    arms = `<g stroke="#8A5A33" stroke-width="4" stroke-linecap="round" fill="none">
      <path d="M${lx},${ay} L${lx - 26},${ay - 15} M${lx - 17},${ay - 10} L${lx - 21},${ay - 22}"/>
      <path d="M${rx},${ay} L${rx + 26},${ay - 15} M${rx + 17},${ay - 10} L${rx + 21},${ay - 22}"/></g>`
  } else if (l.arms === 'mitten') {
    const lx = C - rM * 0.92, rx = C + rM * 0.92
    arms = `<g stroke="#8A5A33" stroke-width="4" stroke-linecap="round">
      <path d="M${lx},${ay} L${lx - 22},${ay - 13}"/><path d="M${rx},${ay} L${rx + 22},${ay - 13}"/></g>
      <circle cx="${C - rM * 0.92 - 26}" cy="${ay - 16}" r="6.5" fill="#E04E63" stroke="#C43B4E" stroke-width="1.6"/>
      <circle cx="${C + rM * 0.92 + 26}" cy="${ay - 16}" r="6.5" fill="#E04E63" stroke="#C43B4E" stroke-width="1.6"/>`
  }

  // Déco à côté / sur la tête
  let extra = ''
  if (l.extra === 'broom') {
    const bx = C + rB + 18
    extra = `<path d="M${bx},238 L${bx},170" stroke="#B07B45" stroke-width="4" stroke-linecap="round"/>
      <polygon points="${bx - 9},240 ${bx + 9},240 ${bx + 5},214 ${bx - 5},214" fill="#E8C36A" stroke="#C99A3F" stroke-width="2" stroke-linejoin="round"/>`
  } else if (l.extra === 'sled') {
    extra = `<text x="${C - rB - 34}" y="238" font-size="30">🛷</text>`
  } else if (l.extra === 'bird') {
    const by = l.hat === 'none' ? headTop - 2 : headTop - rH * 1.2 - 8
    extra = `<text x="${C + 2}" y="${by}" font-size="15">🐦</text>`
  }

  return `<svg viewBox="0 0 220 250">
    <ellipse cx="110" cy="242" rx="102" ry="11" fill="#FFFFFF" stroke="#DCE9F3" stroke-width="2"/>
    ${extra}
    <g class="sn-hit${pop(0)}" data-b="0">${ballShape(C, yB, rB, l.shape)}</g>
    <g class="sn-hit${pop(1)}" data-b="1">${ballShape(C, yM, rM, l.shape)}${buttons}</g>
    ${arms}
    <g class="sn-hit${pop(2)}" data-b="2">${ballShape(C, yH, rH, l.shape)}${eyes}${nose}${mouth}</g>
    ${scarf}
    ${hatSVG(l.hat, C, headTop, rH)}
  </svg>`
}

function render() {
  $('snSvg').innerHTML = snowmanSVG(sn.look)
  sn.pulse = -1
  document.querySelectorAll<HTMLElement>('#snSvg .sn-hit').forEach(g => {
    g.onclick = () => {
      if (!sn || !sn.running) return
      const b = parseInt(g.dataset.b!)
      sn.look.sizes[b] = (sn.look.sizes[b] + 1) % 3
      sn.pulse = b
      sPop(); render()
    }
  })
  document.querySelectorAll<HTMLElement>('.sn-opt').forEach(b => {
    b.classList.toggle('sel', sn.look[b.dataset.k!] === b.dataset.v)
  })
}

function setProp(k: string, v: string) {
  if (!sn || !sn.running) return
  sn.look[k] = v
  sPop(); render()
}

function finish() {
  sWin(); confetti()
  ctx.finish({
    title: 'Quel bonhomme !',
    msg: `${ctx.playerName} a sculpté un magnifique bonhomme de neige ⛄`,
    stars: 3, starsEarned: 3
  })
}

export const snowman: GameDef = {
  id: 'snowman', name: 'Bonhomme de neige', icon: '⛄', sq: 'sq-sky', cat: 'creatif', duel: false,
  subtitle: 'Tape les boules pour changer leur taille, puis décore-le !',
  mount(c) {
    ctx = c
    sn = { look: defLook(), pulse: -1, running: true }

    const opt = (k: string, v: string, html: string) =>
      `<button class="du-opt sn-opt" data-k="${k}" data-v="${v}">${html}</button>`
    const colorChips = (k: string, colors: string[]) => opt(k, 'none', '✖️') + colors.map(col =>
      `<button class="du-opt du-color sn-opt" data-k="${k}" data-v="${col}" style="background:${col}"></button>`).join('')
    const flakes = Array.from({ length: 12 }, (_, i) =>
      `<span class="sn-flake" style="left:${4 + Math.random() * 92}%;animation-duration:${5 + Math.random() * 6}s;animation-delay:${-Math.random() * 10}s;font-size:${9 + Math.random() * 8}px">❄</span>`).join('')

    c.root.innerHTML = `
      <div class="topbar">
        ${BGS.map((b, i) => `<button class="chip sn-bg${i === 0 ? ' sel' : ''}" data-i="${i}">${b.icon}</button>`).join('')}
        <button class="chip" id="snRandom">🎲</button>
        <button class="chip" id="snReset" title="Recommencer">↺</button>
      </div>
      <div class="sn-stage" id="snStage" style="background:${BGS[0].css}">${flakes}<div id="snSvg"></div></div>
      <div class="du-rows">
        <div class="du-row"><span class="du-label">Forme</span>
          ${opt('shape', 'round', '⚪')}${opt('shape', 'oval', '🥚')}${opt('shape', 'cube', '🧊')}
        </div>
        <div class="du-row"><span class="du-label">Chapeau</span>
          ${opt('hat', 'none', '✖️')}${opt('hat', 'tophat', '🎩')}${opt('hat', 'bonnet', '🧶')}${opt('hat', 'cap', '🧢')}${opt('hat', 'crown', '👑')}
        </div>
        <div class="du-row"><span class="du-label">Écharpe</span>${colorChips('scarf', SCARF_COLORS)}</div>
        <div class="du-row"><span class="du-label">Yeux</span>
          ${opt('eyes', 'coal', '⚫')}${opt('eyes', 'button', '🔵')}${opt('eyes', 'star', '✨')}
        </div>
        <div class="du-row"><span class="du-label">Nez</span>
          ${opt('nose', 'carrot', '🥕')}${opt('nose', 'dot', '🔴')}
        </div>
        <div class="du-row"><span class="du-label">Bras</span>
          ${opt('arms', 'branch', '🌿')}${opt('arms', 'mitten', '🧤')}${opt('arms', 'none', '✖️')}
        </div>
        <div class="du-row"><span class="du-label">Boutons</span>${colorChips('buttons', BTN_COLORS)}</div>
        <div class="du-row"><span class="du-label">Déco</span>
          ${opt('extra', 'none', '✖️')}${opt('extra', 'broom', '🧹')}${opt('extra', 'sled', '🛷')}${opt('extra', 'bird', '🐦')}
        </div>
      </div>
      <button class="bigbtn primary" id="snDone" style="margin-top:12px">✨ Il est parfait !</button>`

    document.querySelectorAll<HTMLElement>('.sn-opt').forEach(b => {
      b.onclick = () => setProp(b.dataset.k!, b.dataset.v!)
    })
    document.querySelectorAll<HTMLElement>('.sn-bg').forEach(b => {
      b.onclick = () => {
        if (!sn || !sn.running) return
        $('snStage').style.background = BGS[parseInt(b.dataset.i!)].css
        document.querySelectorAll('.sn-bg').forEach(x => x.classList.remove('sel'))
        b.classList.add('sel'); sPop()
      }
    })
    ;($('snRandom') as HTMLButtonElement).onclick = () => {
      if (!sn || !sn.running) return
      sn.look = {
        shape: pick([...SHAPES]), sizes: [pick([0, 1, 2]), pick([0, 1, 2]), pick([0, 1, 2])],
        hat: pick([...HATS]), scarf: pick(['none', ...SCARF_COLORS]),
        eyes: pick([...EYES]), nose: pick([...NOSES]), arms: pick([...ARMS]),
        buttons: pick(['none', ...BTN_COLORS]), extra: pick([...EXTRAS])
      }
      $('snStage').style.background = pick(BGS).css
      sPop(); render()
    }
    ;($('snReset') as HTMLButtonElement).onclick = () => {
      if (!sn || !sn.running) return
      sn.look = defLook()
      $('snStage').style.background = BGS[0].css
      document.querySelectorAll('.sn-bg').forEach((x, i) => x.classList.toggle('sel', i === 0))
      sPop(); render()
    }
    ;($('snDone') as HTMLButtonElement).onclick = () => sn && sn.running && finish()
    render()
    return () => { if (sn) { sn.running = false; sn = null } }
  }
}
