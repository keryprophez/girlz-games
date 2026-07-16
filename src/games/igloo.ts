import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { sNope, sPop, sWin, tone } from '../core/audio'
import { confetti, FX } from '../core/fx'

/* Construis l'igloo — l'emplacement qui clignote attend un bloc de glace :
   choisis la bonne taille dans les tas de neige (grand, moyen, petit) et
   l'igloo monte rangée par rangée. En Douce, pas de chrono ; sinon la tempête
   de neige approche doucement. */

const SIZES: Record<string, { w: number; h: number; label: string }> = {
  L: { w: 56, h: 36, label: 'Grand' },
  M: { w: 46, h: 30, label: 'Moyen' },
  S: { w: 36, h: 24, label: 'Petit' }
}

let ig: any = null
let ctx: GameContext

function buildLayout(rows: [string, number][]) {
  const slots: any[] = []
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
    y += 4 // les rangées se chevauchent légèrement
  })
  return { slots, door }
}

function setWant() {
  document.querySelectorAll('#igSvg .ig-slot').forEach(r => r.classList.remove('want'))
  const cur = $(`igs${ig.idx}`)
  if (cur) cur.classList.add('want')
  $('igCount').textContent = `🧊 ${ig.idx}/${ig.slots.length}`
}

function tapPile(size: string, el: HTMLElement) {
  if (!ig || !ig.running || ig.done) return
  const slot = ig.slots[ig.idx]
  if (size !== slot.size) {
    ig.errors++
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake')
    sNope()
    return
  }
  const rect = $(`igs${ig.idx}`)
  rect.classList.remove('ig-slot', 'want')
  rect.classList.add('ig-block')
  sPop(); tone(240 + ig.idx * 10, 0.1, 'sine', 0.1)
  const svgR = ($('igSvg') as unknown as SVGSVGElement).getBoundingClientRect()
  FX.burst(svgR.left + (slot.x + slot.w / 2) / 380 * svgR.width,
    svgR.top + (slot.y + slot.h / 2 - ig.topY) / ig.viewH * svgR.height,
    { colors: ['#F2FAFF', '#BFE0F5', '#FFFFFF'], count: 8 })
  ig.idx++
  if (ig.idx >= ig.slots.length) complete()
  else setWant()
}

function complete() {
  ig.done = true
  $('igCount').textContent = `🧊 ${ig.slots.length}/${ig.slots.length}`
  const d = ig.door
  const cx = d.x + d.w / 2, cy = d.y + d.h * 0.52, r = Math.min(d.w, d.h) * 0.42
  const face = ctx.avatar
    ? `<clipPath id="igFaceClip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
       <image href="${ctx.avatar}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}"
         clip-path="url(#igFaceClip)" preserveAspectRatio="xMidYMid slice"/>
       <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#fff" stroke-width="2.5"/>`
    : `<text x="${cx}" y="${cy + 7}" font-size="${r * 1.9}" text-anchor="middle">👧</text>`
  $('igSvg').insertAdjacentHTML('beforeend',
    `${face}<text x="${d.x - 34}" y="250" font-size="27">🐧</text>`)
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
  id: 'igloo', name: "L'Igloo", icon: '🧊', sq: 'sq-mint', cat: 'reflexion',
  subtitle: 'Pose le bloc de la bonne taille sur la case qui clignote !',
  mount(c) {
    ctx = c
    const cfg = c.byTier<{ rows: [string, number][]; time: number }>(
      { rows: [['L', 5], ['M', 4], ['S', 3]], time: 0 },
      { rows: [['L', 7], ['M', 5], ['S', 4]], time: 90 },
      { rows: [['L', 7], ['M', 6], ['S', 5], ['S', 3]], time: 60 }
    )
    const { slots, door } = buildLayout(cfg.rows)
    ig = { slots, door, idx: 0, errors: 0, done: false, running: true, timeLeft: cfg.time }
    // Cadre serré sur l'igloo : juste un peu de ciel au-dessus de la rangée la plus haute
    const topY = Math.min(...slots.map(s => s.y)) - 34
    ig.topY = topY
    ig.viewH = 270 - topY

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
          <rect x="0" y="248" width="380" height="22" fill="#FFFFFF"/>
          <ellipse cx="190" cy="250" rx="175" ry="9" fill="#F4FAFF" stroke="#DCE9F3" stroke-width="2"/>
          <path d="M${door.x},${door.y + door.h} L${door.x},${door.y + door.h * 0.5} Q${door.x + door.w / 2},${door.y - 10} ${door.x + door.w},${door.y + door.h * 0.5} L${door.x + door.w},${door.y + door.h} Z"
            fill="#2E5E86" stroke="#A8CFE8" stroke-width="3"/>
          ${slots.map((s, i) =>
            `<rect id="igs${i}" class="ig-slot" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="9"/>`).join('')}
        </svg>
      </div>
      <div class="ig-piles">
        ${(['L', 'M', 'S'] as const).map(sz => {
          const { w, h, label } = SIZES[sz]
          return `<button class="ig-pile" data-s="${sz}">
            <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
              <rect x="1.5" y="1.5" width="${w - 3}" height="${h - 3}" rx="8" fill="#F2FAFF" stroke="#A8CFE8" stroke-width="3"/>
            </svg><span>${label}</span></button>`
        }).join('')}
      </div>`

    document.querySelectorAll<HTMLElement>('.ig-pile').forEach(b => {
      b.onclick = () => tapPile(b.dataset.s!, b)
    })
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
      if (ig) { ig.running = false; clearTimeout(ig.endT); ig = null }
      clearInterval(timer)
    }
  }
}
