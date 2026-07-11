import type { GameContext, GameDef } from '../core/types'
import { $, shuffle } from '../core/utils'
import { sGood, sPop, sWin } from '../core/audio'
import { fxAt, JUICE } from '../core/fx'

/* Puzzle Photo — glisser-déposer libre (pas de taquin !) :
   on attrape chaque pièce et on la pose sur la grille, ça aimante quand c'est bon.
   Une image fantôme guide les petites. */

let pz: any = null
let ctx: GameContext

// Scène de secours si le profil n'a pas encore de photo
const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360">
<rect width="360" height="360" fill="#BDE3FA"/><rect y="230" width="360" height="130" fill="#A5DB93"/>
<circle cx="70" cy="70" r="38" fill="#FFE066"/>
<text x="110" y="300" font-size="70">🐮</text><text x="230" y="310" font-size="60">🐔</text>
<text x="150" y="180" font-size="50">🌻</text><text x="260" y="150" font-size="44">🦋</text></svg>`
const FALLBACK = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(FALLBACK_SVG)))

function finish() {
  const secs = (performance.now() - pz.t0) / 1000
  sWin()
  const n = pz.size * pz.size
  const stars = secs <= n * 8 ? 3 : secs <= n * 15 ? 2 : 1
  ctx.finish({
    title: 'Photo reconstituée !',
    msg: `${ctx.playerName} a tout assemblé en ${Math.round(secs)} secondes 🤳`,
    stars, starsEarned: stars
  })
}

export const photoPuzzle: GameDef = {
  id: 'photopuzzle', name: 'Puzzle Photo', icon: '🤳', sq: 'sq-pink', cat: 'reflexion',
  subtitle: 'Fais glisser les morceaux pour reconstituer la photo',
  mount(c) {
    ctx = c
    const img = c.avatar || FALLBACK
    const size = c.byTier(3, 3, 4)
    const snapR = c.byTier(48, 38, 30)
    const boardPx = Math.min(340, window.innerWidth - 48)
    const cell = boardPx / size
    const trayH = Math.ceil((size * size) / 5) * 74 + 12

    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="pzLeft">🧩 ${size * size} morceaux</div>
      </div>
      <div id="pzWrap" style="width:${boardPx}px;height:${boardPx + trayH}px">
        <div id="pzBoard" style="width:${boardPx}px;height:${boardPx}px;background-image:url('${img}')"></div>
      </div>`
    const wrap = $('pzWrap')
    const board = $('pzBoard')

    // Grille cible en pointillés
    for (let i = 0; i < size * size; i++) {
      const cellEl = document.createElement('div')
      cellEl.className = 'pz-cell'
      cellEl.style.cssText = `width:${cell}px;height:${cell}px;left:${(i % size) * cell}px;top:${Math.floor(i / size) * cell}px`
      board.appendChild(cellEl)
    }

    pz = { size, cell, boardPx, snapR, placed: 0, t0: performance.now(), pieces: [], running: true }

    // Pièces mélangées dans le bac sous la grille
    const order = shuffle([...Array(size * size).keys()])
    order.forEach((idx, k) => {
      const p = document.createElement('div')
      p.className = 'pz-piece'
      const sr = Math.floor(idx / size), sc = idx % size
      const homeX = (k % 5) * (boardPx / 5) + 4
      const homeY = boardPx + 10 + Math.floor(k / 5) * 74
      p.style.cssText = `width:${cell}px;height:${cell}px;left:${homeX}px;top:${homeY}px;
        background-image:url('${img}');background-size:${boardPx}px ${boardPx}px;
        background-position:-${sc * cell}px -${sr * cell}px;transform:scale(${Math.min(1, 62 / cell)})`
      wrap.appendChild(p)
      const piece = { el: p, idx, homeX, homeY, placed: false }
      pz.pieces.push(piece)

      p.addEventListener('pointerdown', (e: PointerEvent) => {
        if (!pz || !pz.running || piece.placed) return
        e.preventDefault()
        p.setPointerCapture(e.pointerId)
        p.classList.add('drag')
        p.style.transform = 'scale(1.06)'
        const wr = wrap.getBoundingClientRect()
        const move = (ev: PointerEvent) => {
          p.style.left = ev.clientX - wr.left - cell / 2 + 'px'
          p.style.top = ev.clientY - wr.top - cell / 2 + 'px'
        }
        const up = (ev: PointerEvent) => {
          p.removeEventListener('pointermove', move)
          p.removeEventListener('pointerup', up)
          p.classList.remove('drag')
          if (!pz || !pz.running) return
          const tx = (piece.idx % size) * cell, ty = Math.floor(piece.idx / size) * cell
          const px = ev.clientX - wr.left - cell / 2, py = ev.clientY - wr.top - cell / 2
          if (Math.hypot(px - tx, py - ty) < snapR) {
            piece.placed = true
            p.style.left = tx + 'px'; p.style.top = ty + 'px'
            p.style.transform = 'scale(1)'
            p.classList.add('set')
            sPop(); fxAt(p, JUICE.green, 8)
            pz.placed++
            $('pzLeft').textContent = `🧩 ${size * size - pz.placed} morceaux`
            if (pz.placed === size * size) {
              sGood()
              board.classList.add('done')
              setTimeout(() => pz && pz.running && finish(), 700)
            }
          } else {
            p.style.left = piece.homeX + 'px'; p.style.top = piece.homeY + 'px'
            p.style.transform = `scale(${Math.min(1, 62 / cell)})`
          }
        }
        move(e)
        p.addEventListener('pointermove', move)
        p.addEventListener('pointerup', up)
      })
    })

    return () => { if (pz) { pz.running = false; pz = null } }
  }
}
