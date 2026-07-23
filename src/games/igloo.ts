import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { sGood, sNope, sPop, sWin, tone } from '../core/audio'
import { confetti, FX } from '../core/fx'

/* Construis l'igloo — attrape un bloc de glace dans les tas et GLISSE-le sur
   l'emplacement qui brille (un simple tap sur le bon tas marche aussi).
   Blocs de glace texturés, décor d'hiver, pingouin supporter. En Douce, pas
   de chrono ; sinon la tempête approche doucement. */

const SIZES: Record<string, { w: number; h: number; label: string }> = {
  L: { w: 56, h: 36, label: 'Grand' },
  M: { w: 46, h: 30, label: 'Moyen' },
  S: { w: 36, h: 24, label: 'Petit' }
}

let ig: any = null
let ctx: GameContext

function buildLayout(rows: [string, number][]) {
  const slots: any[] = []
  const rowEnds: number[] = []
  let door: any = null
  let y = 252
  rows.forEach(([sz, n], ri) => {
    const { w, h } = SIZES[sz]
    y -= h
    const total = n * w + (n - 1) * 5
    let x = 190 - total / 2
    for (let i = 0; i < n; i++) {
      // La porte remplace le bloc central de la rangée du bas
      if (ri === 0 && i === (n - 1) / 2) door = { x, y, w, h }
      else slots.push({ x, y, w, h, size: sz })
      x += w + 5
    }
    rowEnds.push(slots.length)
    y += 4 // les rangées se chevauchent légèrement
  })
  return { slots, door, rowEnds }
}

/* Un bloc de glace dessiné (reflet + fissure) pour le fantôme et les tas. */
function blockSVG(w: number, h: number): string {
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%">
    <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="8" fill="#EAF6FE" stroke="#A8CFE8" stroke-width="3"/>
    <rect x="${w * 0.14}" y="${h * 0.18}" width="${w * 0.34}" height="${h * 0.2}" rx="${h * 0.1}" fill="#FFFFFF" opacity=".85"/>
    <path d="M${w * 0.62},${h * 0.6} l${w * 0.12},${h * 0.14}" stroke="#C4E0F2" stroke-width="2" stroke-linecap="round"/>
  </svg>`
}

function fir(x: number, base: number, s: number): string {
  return `<g>
    <rect x="${x - 3 * s}" y="${base - 8 * s}" width="${6 * s}" height="${9 * s}" fill="#8A5A33"/>
    <polygon points="${x - 16 * s},${base - 6 * s} ${x + 16 * s},${base - 6 * s} ${x},${base - 30 * s}" fill="#2E7D57"/>
    <polygon points="${x - 12 * s},${base - 20 * s} ${x + 12 * s},${base - 20 * s} ${x},${base - 40 * s}" fill="#39905F"/>
    <polygon points="${x - 8 * s},${base - 34 * s} ${x + 8 * s},${base - 34 * s} ${x},${base - 48 * s}" fill="#46A56C"/>
    <path d="M${x - 8 * s},${base - 34 * s} Q${x},${base - 38 * s} ${x + 8 * s},${base - 34 * s}" stroke="#FFFFFF" stroke-width="${2.5 * s}" fill="none" stroke-linecap="round"/>
  </g>`
}

function setWant() {
  document.querySelectorAll('#igSvg .ig-slot').forEach(r => r.classList.remove('want'))
  const cur = $(`igs${ig.idx}`)
  if (cur) cur.classList.add('want')
  $('igCount').textContent = `🧊 ${ig.idx}/${ig.slots.length}`
}

function slotScreenCenter(slot: any) {
  const svgR = $('igSvg').getBoundingClientRect()
  const k = svgR.width / 380
  return {
    x: svgR.left + slot.x * k + slot.w * k / 2,
    y: svgR.top + (slot.y - ig.topY) * k + slot.h * k / 2,
    k
  }
}

function place() {
  const slot = ig.slots[ig.idx]
  const rect = $(`igs${ig.idx}`)
  rect.classList.remove('ig-slot', 'want')
  rect.classList.add('ig-block')
  rect.setAttribute('fill', 'url(#igIceG)')
  // Reflet sur le bloc posé
  rect.insertAdjacentHTML('afterend',
    `<rect x="${slot.x + slot.w * 0.14}" y="${slot.y + slot.h * 0.18}" width="${slot.w * 0.34}" height="${slot.h * 0.2}"
      rx="${slot.h * 0.1}" fill="#FFFFFF" opacity=".8" class="ig-block" style="pointer-events:none"/>`)
  sPop(); tone(240 + ig.idx * 10, 0.1, 'sine', 0.1)
  const c = slotScreenCenter(slot)
  FX.burst(c.x, c.y, { colors: ['#FFFFFF', '#DCEFF9', '#BFE0F5'], count: 10 })
  ig.idx++
  if (ig.idx >= ig.slots.length) { complete(); return }
  // Une rangée terminée : petit jingle + le pingouin saute
  if (ig.rowEnds.includes(ig.idx)) {
    sGood()
    const p = $('igPeng')
    if (p) { p.classList.remove('hop'); void p.offsetWidth; p.classList.add('hop') }
  }
  setWant()
}

function wrongSize(pileEl: HTMLElement | null) {
  ig.errors++
  sNope()
  const el = pileEl || document.querySelector<HTMLElement>('.ig-pile')
  if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake') }
}

/* ---- Glisser-déposer des blocs ---- */
function startDrag(e: PointerEvent, size: string, pileEl: HTMLElement) {
  if (!ig || !ig.running || ig.done || ig.drag) return
  e.preventDefault()
  const { w, h } = SIZES[size]
  const k = $('igSvg').getBoundingClientRect().width / 380
  const ghost = document.createElement('div')
  ghost.className = 'ig-ghost'
  ghost.style.width = w * k + 'px'
  ghost.style.height = h * k + 'px'
  ghost.innerHTML = blockSVG(w, h)
  document.body.appendChild(ghost)
  ig.drag = { size, ghost, w: w * k, h: h * k, x0: e.clientX, y0: e.clientY, from: pileEl.getBoundingClientRect(), pile: pileEl }
  dragMove(e)
}

function dragMove(e: PointerEvent) {
  const d = ig && ig.drag
  if (!d) return
  d.ghost.style.left = e.clientX - d.w / 2 + 'px'
  d.ghost.style.top = e.clientY - d.h / 2 + 'px'
}

function flyBack(d: any) {
  d.ghost.style.transition = 'left .25s ease, top .25s ease, opacity .25s'
  d.ghost.style.left = d.from.left + d.from.width / 2 - d.w / 2 + 'px'
  d.ghost.style.top = d.from.top + d.from.height / 2 - d.h / 2 + 'px'
  d.ghost.style.opacity = '0'
  setTimeout(() => d.ghost.remove(), 260)
}

function dragEnd(e: PointerEvent) {
  const d = ig && ig.drag
  if (!d) return
  ig.drag = null
  if (ig.done) { d.ghost.remove(); return }
  const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0)
  const slot = ig.slots[ig.idx]
  const c = slotScreenCenter(slot)
  const over = Math.abs(e.clientX - c.x) < slot.w * c.k / 2 + 20 && Math.abs(e.clientY - c.y) < slot.h * c.k / 2 + 20
  // Déposé sur la case qui brille, OU simple tap sur le tas
  if (over || dist < 10) {
    if (d.size === slot.size) { d.ghost.remove(); place(); return }
    wrongSize(d.pile)
    flyBack(d)
    return
  }
  flyBack(d) // lâché ailleurs : le bloc retourne au tas, sans punition
}

function complete() {
  ig.done = true
  $('igCount').textContent = `🧊 ${ig.slots.length}/${ig.slots.length}`
  const walker = $('igPeng')
  if (walker) walker.style.display = 'none'
  const d = ig.door
  const cx = d.x + d.w / 2, cy = d.y + d.h * 0.52, r = Math.min(d.w, d.h) * 0.42
  const face = ctx.avatar
    ? `<clipPath id="igFaceClip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
       <image href="${ctx.avatar}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}"
         clip-path="url(#igFaceClip)" preserveAspectRatio="xMidYMid slice"/>
       <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#fff" stroke-width="2.5"/>`
    : `<text x="${cx}" y="${cy + 7}" font-size="${r * 1.9}" text-anchor="middle">👧</text>`
  $('igSvg').insertAdjacentHTML('beforeend',
    `<circle cx="${cx}" cy="${cy}" r="${d.w * 0.7}" fill="#FFD34D" opacity=".35"/>
     ${face}<text x="${d.x - 34}" y="250" font-size="27">🐧</text>`)
  sWin(); confetti()
  ig.endT = setTimeout(() => ig && ig.running && finish(false), 1500)
}

function finish(storm: boolean) {
  ig.done = true
  const total = ig.slots.length
  const stars = storm ? 1 : ig.errors <= 1 ? 3 : ig.errors <= Math.ceil(total / 4) ? 2 : 1
  ctx.finish(storm
    ? {
        title: 'La tempête est arrivée !',
        msg: `${ctx.playerName} a posé ${ig.idx} blocs sur ${total} — on finira au chaud ⛄`,
        stars: 1, starsEarned: 1
      }
    : {
        title: 'Igloo terminé !',
        msg: `${ctx.playerName} a construit un igloo de ${total} blocs de glace 🐧`,
        stars: stars as 1 | 2 | 3, starsEarned: stars
      })
}

export const igloo: GameDef = {
  id: 'igloo', name: "L'Igloo", icon: '🧊', sq: 'sq-mint', cat: 'reflexion', music: 'winter',
  subtitle: 'Attrape un bloc de glace et glisse-le sur la case qui brille !',
  mount(c) {
    ctx = c
    const cfg = c.byTier<{ rows: [string, number][]; time: number }>(
      { rows: [['L', 5], ['M', 4], ['S', 3]], time: 0 },
      { rows: [['L', 7], ['M', 5], ['S', 4]], time: 90 },
      { rows: [['L', 7], ['M', 6], ['S', 5], ['S', 3]], time: 60 }
    )
    const { slots, door, rowEnds } = buildLayout(cfg.rows)
    // Cadre serré sur l'igloo : juste un peu de ciel au-dessus de la rangée la plus haute
    const topY = Math.min(...slots.map(s => s.y)) - 40
    ig = { slots, door, rowEnds, idx: 0, errors: 0, done: false, running: true, timeLeft: cfg.time, topY, drag: null }

    const flakes = Array.from({ length: 9 }, () =>
      `<span class="sn-flake" style="left:${4 + Math.random() * 92}%;animation-duration:${5 + Math.random() * 6}s;animation-delay:${-Math.random() * 10}s;font-size:${9 + Math.random() * 8}px">❄</span>`).join('')

    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="igCount">🧊 0/${slots.length}</div>
        ${cfg.time ? '<div class="chip">🌨 Avant la tempête…</div>' : ''}
      </div>
      ${cfg.time ? '<div class="tbar" style="max-width:520px"><div class="tfill" id="igTimer"></div></div>' : ''}
      <div id="igArea">
        ${flakes}
        <svg id="igSvg" viewBox="0 ${topY} 380 ${270 - topY}">
          <defs>
            <linearGradient id="igIceG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#CBE6F6"/>
            </linearGradient>
          </defs>
          <circle cx="332" cy="${topY + 26}" r="15" fill="#FFE08A" stroke="#FFD34D" stroke-width="4"/>
          <g fill="#FFFFFF" opacity=".85">
            <ellipse cx="70" cy="${topY + 30}" rx="26" ry="9"/><ellipse cx="92" cy="${topY + 24}" rx="18" ry="7"/>
            <ellipse cx="255" cy="${topY + 18}" rx="22" ry="7"/>
          </g>
          <ellipse cx="40" cy="252" rx="130" ry="30" fill="#F0F8FE"/>
          <ellipse cx="345" cy="254" rx="140" ry="34" fill="#EAF4FC"/>
          ${fir(28, 250, 1.15)}${fir(352, 250, 0.95)}${fir(64, 249, 0.7)}
          <rect x="0" y="248" width="380" height="22" fill="#FFFFFF"/>
          <ellipse cx="190" cy="250" rx="175" ry="9" fill="#F4FAFF" stroke="#DCE9F3" stroke-width="2"/>
          <path d="M${door.x},${door.y + door.h} L${door.x},${door.y + door.h * 0.5} Q${door.x + door.w / 2},${door.y - 10} ${door.x + door.w},${door.y + door.h * 0.5} L${door.x + door.w},${door.y + door.h} Z"
            fill="#2E5E86" stroke="#A8CFE8" stroke-width="3"/>
          ${slots.map((s, i) =>
            `<rect id="igs${i}" class="ig-slot" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="9"/>`).join('')}
        </svg>
        <div id="igPeng">🐧</div>
      </div>
      <div class="ig-piles">
        ${(['L', 'M', 'S'] as const).map(sz => {
          const { w, h, label } = SIZES[sz]
          return `<button class="ig-pile" data-s="${sz}">
            <span class="ig-pile-stack" style="width:${w}px;height:${h * 1.6}px">
              <span class="ig-pile-b" style="width:${w * 0.86}px;height:${h * 0.9}px;left:${w * 0.1}px;top:0">${blockSVG(w, h)}</span>
              <span class="ig-pile-b" style="width:${w}px;height:${h}px;left:0;top:${h * 0.62}px">${blockSVG(w, h)}</span>
            </span><span>${label}</span></button>`
        }).join('')}
      </div>`

    document.querySelectorAll<HTMLElement>('.ig-pile').forEach(b => {
      b.addEventListener('pointerdown', e => startDrag(e, b.dataset.s!, b))
    })
    const onMove = (e: PointerEvent) => dragMove(e)
    const onUp = (e: PointerEvent) => dragEnd(e)
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    setWant()

    let timer = 0
    if (cfg.time) {
      timer = window.setInterval(() => {
        if (!ig || !ig.running || ig.done) return
        ig.timeLeft--
        $('igTimer').style.width = (ig.timeLeft / cfg.time) * 100 + '%'
        if (ig.timeLeft <= 0) finish(true)
      }, 1000)
    }
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      if (ig) {
        ig.running = false
        clearTimeout(ig.endT)
        if (ig.drag) ig.drag.ghost.remove()
        ig = null
      }
      clearInterval(timer)
    }
  }
}
