import type { GameContext, GameDef } from '../core/types'
import { $, pick } from '../core/utils'
import { sGood, sPop, sWin, tone } from '../core/audio'
import { confetti, FX } from '../core/fx'

/* Mon Voyage dans l'Espace — la joueuse devient astronaute (sa photo dans le
   hublot de la fusée) et explore le système solaire. On touche une planète,
   la fusée s'y envole, la planète s'affiche en grand toute belle et une
   MERVEILLE est racontée à voix haute. Zéro quiz : découverte pure. Visiter
   les 8 planètes → diplôme d'astronaute. */

interface Planet {
  id: string; name: string; x: number; y: number; r: number
  hi: string; lo: string
  feat: (cx: number, cy: number, r: number) => string
  ring?: [string, string]
  fact: string
  extra?: string // petit bonus visuel dans la carte (emoji lunes, robot…)
}

/* ---------- Helpers de dessin ---------- */
function bands(cx: number, cy: number, r: number, cols: string[]): string {
  const n = cols.length
  let s = ''
  for (let i = 0; i < n; i++) {
    const y = cy - r + (i / n) * 2 * r
    s += `<rect x="${cx - r}" y="${y}" width="${2 * r}" height="${(2 * r) / n + 1}" fill="${cols[i]}" opacity=".6"/>`
  }
  return s
}
function craters(cx: number, cy: number, r: number, list: number[][]): string {
  return list.map(([x, y, rr]) =>
    `<circle cx="${cx + x * r}" cy="${cy + y * r}" r="${rr * r}" fill="rgba(70,56,42,.4)"/>
     <circle cx="${cx + x * r - rr * r * .25}" cy="${cy + y * r - rr * r * .25}" r="${rr * r * .7}" fill="rgba(120,104,86,.35)"/>`).join('')
}

const PLANETS: Planet[] = [
  {
    id: 'mercure', name: 'Mercure', x: 120, y: 400, r: 9, hi: '#D8CBB6', lo: '#6E5F4E',
    feat: (cx, cy, r) => craters(cx, cy, r, [[-.3, -.2, .18], [.28, .12, .22], [.05, .42, .13], [.42, -.32, .11], [-.4, .28, .1]]),
    fact: 'Mercure ! La plus petite planète, et la plus rapide autour du Soleil. Le jour il y fait super chaud, et la nuit super froid.'
  },
  {
    id: 'venus', name: 'Vénus', x: 245, y: 360, r: 13, hi: '#F8E6AE', lo: '#C08A3E',
    feat: (cx, cy, r) => `<path d="M${cx - r},${cy - r * .35} Q${cx},${cy - r * .6} ${cx + r},${cy - r * .3}" stroke="rgba(255,255,255,.35)" stroke-width="${r * .16}" fill="none"/>
      <path d="M${cx - r},${cy} Q${cx},${cy + r * .25} ${cx + r},${cy - r * .05}" stroke="rgba(255,240,200,.5)" stroke-width="${r * .18}" fill="none"/>
      <path d="M${cx - r},${cy + r * .45} Q${cx},${cy + r * .2} ${cx + r},${cy + r * .5}" stroke="rgba(200,150,80,.4)" stroke-width="${r * .16}" fill="none"/>`,
    fact: 'Vénus ! La planète la plus chaude de toutes, plus chaude qu\'un four, à cause de ses gros nuages tout épais.'
  },
  {
    id: 'terre', name: 'la Terre', x: 108, y: 314, r: 15, hi: '#8FD0F2', lo: '#2E6BA8',
    feat: (cx, cy, r) => `
      <path d="M${cx - r * .5},${cy - r * .4} q${r * .3},-${r * .2} ${r * .5},${r * .1} q${r * .1},${r * .3} -${r * .2},${r * .35} q-${r * .3},0 -${r * .4},-${r * .25} Z" fill="#5CB86A"/>
      <path d="M${cx + r * .1},${cy + r * .1} q${r * .3},-${r * .05} ${r * .4},${r * .25} q-${r * .05},${r * .25} -${r * .35},${r * .2} q-${r * .15},-${r * .2} -${r * .05},-${r * .45} Z" fill="#5CB86A"/>
      <ellipse cx="${cx - r * .2}" cy="${cy - r * .55}" rx="${r * .4}" ry="${r * .16}" fill="rgba(255,255,255,.75)"/>
      <ellipse cx="${cx + r * .35}" cy="${cy + r * .5}" rx="${r * .35}" ry="${r * .14}" fill="rgba(255,255,255,.7)"/>`,
    fact: 'La Terre, c\'est chez nous ! La seule planète avec de l\'eau bleue, des nuages blancs et plein d\'animaux.',
    extra: '🌈'
  },
  {
    id: 'mars', name: 'Mars', x: 252, y: 272, r: 11, hi: '#EE9564', lo: '#A63B24',
    feat: (cx, cy, r) => `${craters(cx, cy, r, [[-.35, .1, .14], [.3, -.15, .16], [.1, .4, .11]])}
      <ellipse cx="${cx}" cy="${cy - r * .82}" rx="${r * .55}" ry="${r * .28}" fill="rgba(255,255,255,.85)"/>
      <ellipse cx="${cx}" cy="${cy + r * .85}" rx="${r * .4}" ry="${r * .2}" fill="rgba(255,255,255,.7)"/>`,
    fact: 'Mars, la planète rouge ! Elle est couverte de poussière rouge, et des petits robots s\'y promènent pour l\'explorer.',
    extra: '🤖 🌑🌑'
  },
  {
    id: 'jupiter', name: 'Jupiter', x: 150, y: 206, r: 30, hi: '#F2D9B4', lo: '#B07A48',
    feat: (cx, cy, r) => bands(cx, cy, r, ['#E9CBA0', '#C89968', '#EAD3AC', '#B7844F', '#E3C79C', '#C99A6A', '#D9B98C']) +
      `<ellipse cx="${cx + r * .34}" cy="${cy + r * .18}" rx="${r * .24}" ry="${r * .15}" fill="#C74B36"/>
       <ellipse cx="${cx + r * .34}" cy="${cy + r * .18}" rx="${r * .13}" ry="${r * .08}" fill="#E27A5F"/>`,
    fact: 'Jupiter, la plus GROSSE planète ! Si grande qu\'elle pourrait avaler mille Terres. Elle a une tempête géante toute rouge.'
  },
  {
    id: 'saturne', name: 'Saturne', x: 246, y: 140, r: 23, hi: '#F4E6BC', lo: '#C7A45A', ring: ['#EBDCAE', '#B89A5E'],
    feat: (cx, cy, r) => bands(cx, cy, r, ['#F0E1B4', '#D8BE84', '#EDDDAC', '#CBAE72', '#E8D6A2']),
    fact: 'Saturne et ses magnifiques anneaux ! Ils sont faits de glace et de cailloux qui brillent dans la lumière du Soleil.'
  },
  {
    id: 'uranus', name: 'Uranus', x: 112, y: 94, r: 18, hi: '#C4F0F0', lo: '#6BAEC4', ring: ['#BFE6EC', '#8FC3D0'],
    feat: (cx, cy, r) => bands(cx, cy, r, ['#CFF1F1', '#A8DDE4', '#C2ECEC', '#9AD4DC']),
    fact: 'Uranus ! Elle est couchée sur le côté et roule comme une bille. Brrr, c\'est une planète toute bleue et très très froide.'
  },
  {
    id: 'neptune', name: 'Neptune', x: 238, y: 46, r: 17, hi: '#6FA8F0', lo: '#243F86',
    feat: (cx, cy, r) => bands(cx, cy, r, ['#7FB0F2', '#3E68C0', '#6B9CE8', '#2C4E9E', '#5A88DC']) +
      `<ellipse cx="${cx - r * .28}" cy="${cy + r * .12}" rx="${r * .2}" ry="${r * .13}" fill="#16305e"/>
       <path d="M${cx + r * .1},${cy - r * .3} q${r * .3},${r * .05} ${r * .5},-${r * .05}" stroke="rgba(255,255,255,.55)" stroke-width="${r * .08}" fill="none"/>`,
    fact: 'Neptune, la planète la plus loin du Soleil ! Elle est toute bleue, avec les vents les plus rapides de tout le système solaire.'
  }
]

const SUN = { x: 180, y: 452, r: 40 }
const ORDER = PLANETS.map(p => p.id)

let sp: any = null
let ctx: GameContext

function planetDefs(p: Planet, cx: number, cy: number, r: number, pre: string): string {
  return `<radialGradient id="${pre}g_${p.id}" cx="36%" cy="32%" r="82%">
      <stop offset="0" stop-color="${p.hi}"/><stop offset="1" stop-color="${p.lo}"/></radialGradient>
    <clipPath id="${pre}c_${p.id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>`
}

function planetBody(p: Planet, cx: number, cy: number, r: number, pre: string): string {
  let back = '', front = ''
  if (p.ring) {
    const rx = r * 1.95, ry = r * 0.52
    back = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${p.ring[0]}" stroke-width="${r * 0.46}" opacity=".92"/>
      <ellipse cx="${cx}" cy="${cy}" rx="${rx * 0.82}" ry="${ry * 0.82}" fill="none" stroke="${p.ring[1]}" stroke-width="${r * 0.14}" opacity=".8"/>`
    front = `<path d="M ${cx - rx},${cy} A ${rx},${ry} 0 0 0 ${cx + rx},${cy}" fill="none" stroke="${p.ring[1]}" stroke-width="${r * 0.42}" opacity=".95"/>
      <path d="M ${cx - rx},${cy} A ${rx},${ry} 0 0 0 ${cx + rx},${cy}" fill="none" stroke="${p.ring[0]}" stroke-width="${r * 0.14}" opacity=".9"/>`
  }
  return `${back}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${pre}g_${p.id})"/>
    <g clip-path="url(#${pre}c_${p.id})">${p.feat(cx, cy, r)}</g>
    <ellipse cx="${cx - r * .34}" cy="${cy - r * .36}" rx="${r * .42}" ry="${r * .3}" fill="rgba(255,255,255,.3)"/>
    ${front}`
}

function sunSVG(cx: number, cy: number, r: number, pre: string): string {
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2
    return `<line x1="${cx + Math.cos(a) * r * 1.05}" y1="${cy + Math.sin(a) * r * 1.05}" x2="${cx + Math.cos(a) * r * 1.35}" y2="${cy + Math.sin(a) * r * 1.35}" stroke="#FFC24D" stroke-width="4" stroke-linecap="round" opacity=".8"/>`
  }).join('')
  return `<defs><radialGradient id="${pre}sun" cx="42%" cy="40%" r="65%">
      <stop offset="0" stop-color="#FFF6C0"/><stop offset="55%" stop-color="#FFCB4D"/><stop offset="100%" stop-color="#FF8A2E"/></radialGradient></defs>
    <g class="sp-sunrays">${rays}</g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${pre}sun)"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#FFE49A" stroke-width="2" opacity=".7"/>`
}

function rocketSVG(av: string | null): string {
  const face = av
    ? `<clipPath id="spRkFace"><circle cx="0" cy="-3" r="6.5"/></clipPath>
       <image href="${av}" x="-6.5" y="-9.5" width="13" height="13" clip-path="url(#spRkFace)" preserveAspectRatio="xMidYMid slice"/>`
    : `<text x="0" y="1" font-size="10" text-anchor="middle">👧</text>`
  return `<g id="spRocketWrap">
    <g id="spRocket">
      <ellipse cx="0" cy="14" rx="4.5" ry="8" fill="#FFB84D" class="sp-flame"/>
      <path d="M0,-20 C7,-13 8,0 6,9 L-6,9 C-8,0 -7,-13 0,-20 Z" fill="#F1F5F9" stroke="#AEBECC" stroke-width="1.5"/>
      <path d="M-6,7 L-13,16 L-4,12 Z" fill="#FF7B6B"/><path d="M6,7 L13,16 L4,12 Z" fill="#FF7B6B"/>
      <circle cx="0" cy="-3" r="6.5" fill="#CBE9FA" stroke="#7FB8E4" stroke-width="1.5"/>
      ${face}
    </g></g>`
}

function moveRocket(x: number, y: number, instant = false) {
  const w = $('spRocketWrap')
  if (instant) { w.style.transition = 'none'; void w.offsetWidth }
  // La fusée est dessinée autour de l'origine (0,0) → on la place directement en (x,y)
  w.style.transform = `translate(${x}px, ${y}px)`
  if (instant) { void w.offsetWidth; w.style.transition = '' }
}

function renderMap() {
  const trail = 'M ' + [[SUN.x, SUN.y - 30], ...PLANETS.map(p => [p.x, p.y])].map(([x, y]) => `${x} ${y}`).join(' L ')
  const defs = PLANETS.map(p => planetDefs(p, p.x, p.y, p.r, 'm_')).join('')
  const planets = PLANETS.map((p, i) => `
    <g class="sp-planet" style="animation-delay:${-i * 0.4}s">
      ${planetBody(p, p.x, p.y, p.r, 'm_')}
      <circle class="sp-hit" data-p="${p.id}" cx="${p.x}" cy="${p.y}" r="${Math.max(p.r + 8, 20)}" fill="transparent"/>
      <circle class="sp-halo" id="spHalo_${p.id}" cx="${p.x}" cy="${p.y}" r="${p.r + 6}" fill="none" stroke="#FFE08A" stroke-width="3" opacity="0"/>
    </g>`).join('')
  $('spMap').innerHTML = `
    <defs>${defs}</defs>
    <path d="${trail}" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2" stroke-dasharray="2 7" stroke-linecap="round"/>
    ${sunSVG(SUN.x, SUN.y, SUN.r, 'm_')}
    <circle class="sp-hit" data-p="soleil" cx="${SUN.x}" cy="${SUN.y}" r="${SUN.r}" fill="transparent"/>
    ${planets}
    ${rocketSVG(ctx.avatar)}`
  moveRocket(SUN.x, SUN.y - SUN.r - 20, true)
}

function updatePassport() {
  PLANETS.forEach(p => {
    const d = $('spDot_' + p.id)
    if (d) d.classList.toggle('got', sp.visited.has(p.id))
  })
  const left = PLANETS.length - sp.visited.size
  $('spCount').textContent = left > 0 ? `🚀 ${sp.visited.size}/8` : '🌟 8/8'
  // Guide : halo sur la prochaine planète non visitée (sauf niveau expert)
  PLANETS.forEach(p => { const h = $('spHalo_' + p.id); if (h) h.setAttribute('opacity', '0') })
  if (sp.hint && left > 0) {
    const next = PLANETS.find(p => !sp.visited.has(p.id))
    if (next) { const h = $('spHalo_' + next.id); if (h) h.setAttribute('opacity', '1'); h?.classList.add('pulse') }
  }
}

function setBanner() {
  const left = PLANETS.length - sp.visited.size
  $('spSay').innerHTML = left > 0
    ? `🚀 Touche une <b>planète</b> pour la visiter !<br><span class="sp-left">Encore ${left} à découvrir</span>`
    : `🌟 Tu les as toutes visitées !`
}

function visit(pid: string) {
  if (!sp || !sp.running || sp.busy) return
  const sun = pid === 'soleil'
  const p = sun ? null : PLANETS.find(x => x.id === pid)!
  sp.busy = true
  const tx = sun ? SUN.x : p!.x, ty = sun ? SUN.y : p!.y
  moveRocket(tx, ty - (sun ? SUN.r : p!.r) - 12)
  tone(300, 0.18, 'sawtooth', 0.06); setTimeout(() => tone(520, 0.16, 'sine', 0.07), 120)
  const wrap = $('spRocketWrap'); wrap.classList.remove('sp-launch'); void wrap.offsetWidth; wrap.classList.add('sp-launch')
  setTimeout(() => { if (sp && sp.running) openCard(pid) }, 820)
}

function openCard(pid: string) {
  const sun = pid === 'soleil'
  const p = sun ? null : PLANETS.find(x => x.id === pid)!
  const name = sun ? 'le Soleil' : p!.name
  const fact = sun
    ? 'Le Soleil ! Une étoile géante toute brillante. Toutes les planètes tournent autour de lui.'
    : p!.fact
  const svg = sun
    ? `<svg viewBox="0 0 240 220" class="sp-cardsvg">${sunSVG(120, 112, 74, 'k_')}</svg>`
    : `<svg viewBox="0 0 240 220" class="sp-cardsvg"><defs>${planetDefs(p!, 120, 108, 82, 'k_')}</defs>
        <g id="spBigPlanet" class="sp-bigplanet">${planetBody(p!, 120, 108, 82, 'k_')}</g></svg>`
  const extra = p?.extra ? `<div class="sp-extra">${p.extra}</div>` : ''
  const isNew = !sun && !sp.visited.has(pid)
  $('spArea').insertAdjacentHTML('beforeend', `
    <div class="sp-card" id="spCard">
      <div class="sp-cardname">${sun ? '☀️' : ''} ${name} ${isNew ? '<span class="sp-newbadge">Nouveau&nbsp;!</span>' : ''}</div>
      <div class="sp-planetwrap" id="spPlanetTap">${svg}${extra}</div>
      <div class="sp-fact">${fact}</div>
      <button class="bigbtn primary" id="spNext">🚀 Continuer</button>
    </div>`)
  ctx.say(fact)
  if (isNew) { sp.visited.add(pid); sGood(); FX.fireworks?.() }
  else sPop()
  updatePassport()
  // Rejouer la merveille en touchant la planète (étincelles)
  $('spPlanetTap').onclick = () => {
    if (!sp || !sp.running) return
    const big = $('spBigPlanet') || $('spPlanetTap')
    big.classList.remove('sp-pulse'); void (big as HTMLElement).offsetWidth; big.classList.add('sp-pulse')
    const r = $('spPlanetTap').getBoundingClientRect()
    FX.burst(r.left + r.width / 2, r.top + r.height * 0.42, { colors: ['#FFE08A', '#FFF', '#B9A7F2', '#7FB8E4'], count: 12 })
    tone(880, 0.08, 'triangle', 0.1); setTimeout(() => tone(1180, 0.09, 'sine', 0.08), 70)
    ctx.say(fact)
  }
  ;($('spNext') as HTMLButtonElement).onclick = () => {
    if (!sp || !sp.running) return
    sPop(); $('spCard')?.remove(); sp.busy = false
    setBanner()
    if (sp.visited.size >= PLANETS.length) finale()
  }
}

function finale() {
  sp.busy = true
  const row = PLANETS.map(p =>
    `<svg viewBox="0 0 ${p.r * 2.2 + 8} ${p.r * 2 + 6}" width="${p.r * 1.7 + 8}"><defs>${planetDefs(p, p.r * 1.1 + 4, p.r + 3, p.r, 'f_')}</defs>${planetBody(p, p.r * 1.1 + 4, p.r + 3, p.r, 'f_')}</svg>`).join('')
  $('spArea').insertAdjacentHTML('beforeend', `
    <div class="sp-card sp-finale" id="spFinale">
      <div class="sp-cardname">🚀 Bravo, astronaute !</div>
      <div class="sp-astro">${ctx.avatar ? `<span class="face-sprite" style="width:74px;height:74px;background-image:url('${ctx.avatar}')"></span>` : '👩‍🚀'}</div>
      <div class="sp-planetrow">${row}</div>
      <div class="sp-fact">${ctx.playerName} a visité <b>toute la famille du Soleil</b> ! 🌍🪐✨</div>
      <button class="bigbtn primary" id="spFin">🌟 J'ai mon diplôme !</button>
    </div>`)
  sWin(); confetti(); FX.fireworks?.()
  ctx.say(`Bravo astronaute ${ctx.playerName} ! Tu as visité les huit planètes de la famille du Soleil. Tu es une vraie exploratrice de l'espace !`)
  ;($('spFin') as HTMLButtonElement).onclick = () => {
    if (!sp || !sp.running) return
    ctx.finish({
      title: 'Astronaute diplômée ! 🚀',
      msg: `${ctx.playerName} a exploré tout le système solaire 🪐✨`,
      stars: 3, starsEarned: 3
    })
  }
}

export const space: GameDef = {
  id: 'space', name: 'Voyage dans l\'Espace', icon: '🚀', sq: 'sq-lilac', cat: 'reflexion', music: 'space',
  subtitle: 'Deviens astronaute et visite les planètes du système solaire !',
  mount(c) {
    ctx = c
    sp = { visited: new Set<string>(), busy: false, running: true, hint: c.byTier(true, true, false) }

    const stars = Array.from({ length: 46 }, () => {
      const s = 1 + Math.random() * 2.4
      return `<span class="sp-star" style="left:${Math.random() * 100}%;top:${Math.random() * 100}%;width:${s}px;height:${s}px;animation-delay:${-Math.random() * 4}s;animation-duration:${2.5 + Math.random() * 3}s"></span>`
    }).join('')

    c.root.innerHTML = `
      <div class="topbar"><div class="chip" id="spCount">🚀 0/8</div></div>
      <div class="geo-say sp-say" id="spSay"></div>
      <div id="spArea">
        <div class="sp-sky">${stars}<span class="sp-shoot"></span></div>
        <svg id="spMap" viewBox="0 0 360 480"></svg>
      </div>
      <div class="sp-passport" id="spPassport">
        ${PLANETS.map(p => `<span class="sp-dot" id="spDot_${p.id}" style="background:radial-gradient(circle at 35% 32%, ${p.hi}, ${p.lo})" title="${p.name}"></span>`).join('')}
      </div>`

    renderMap()
    setBanner()
    updatePassport()

    $('spMap').addEventListener('pointerdown', (e: PointerEvent) => {
      const el = (e.target as HTMLElement).closest('[data-p]') as HTMLElement | null
      if (el) visit(el.dataset.p!)
    })

    ctx.say('Bienvenue dans l\'espace ! Voici le Soleil, une étoile géante. Autour de lui vivent huit planètes. Touche-en une pour la visiter avec ta fusée !')

    return () => { if (sp) { sp.running = false; sp = null } }
  }
}
