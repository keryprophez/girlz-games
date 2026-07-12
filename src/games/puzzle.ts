import type { GameContext, GameDef } from '../core/types'
import { $, shuffle } from '../core/utils'
import { sGood, sPop, sWin } from '../core/audio'
import { fxAt, JUICE } from '../core/fx'
import { useFerme } from '../core/store'

/* Puzzle Photo — glisser-déposer libre. On peut jouer avec sa tête (avatar)
   ou charger N'IMPORTE QUELLE photo (papa, mamie, le chat…), gardée pour
   la prochaine fois. */

let pz: any = null
let ctx: GameContext

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

function build(img: string) {
  const size = ctx.byTier(3, 3, 4)
  const snapR = ctx.byTier(48, 38, 30)
  const boardPx = Math.min(340, window.innerWidth - 48)
  const cell = boardPx / size
  const trayH = Math.ceil((size * size) / 5) * 74 + 12

  const wrap = $('pzWrap')
  wrap.style.width = boardPx + 'px'
  wrap.style.height = boardPx + trayH + 'px'
  wrap.innerHTML = `<div id="pzBoard" style="width:${boardPx}px;height:${boardPx}px;background-image:url('${img}')"></div>`
  const board = $('pzBoard')
  for (let i = 0; i < size * size; i++) {
    const cellEl = document.createElement('div')
    cellEl.className = 'pz-cell'
    cellEl.style.cssText = `width:${cell}px;height:${cell}px;left:${(i % size) * cell}px;top:${Math.floor(i / size) * cell}px`
    board.appendChild(cellEl)
  }

  pz = { size, cell, boardPx, snapR, placed: 0, t0: performance.now(), running: true }
  $('pzLeft').textContent = `🧩 ${size * size} morceaux`

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
}

export const photoPuzzle: GameDef = {
  id: 'photopuzzle', name: 'Puzzle Photo', icon: '🤳', sq: 'sq-pink', cat: 'reflexion',
  subtitle: 'Fais glisser les morceaux — ta tête, ou n\'importe quelle photo !',
  mount(c) {
    ctx = c
    const st = useFerme.getState()
    const customImg = st.puzzleImgs[st.currentId] || null
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="pzLeft">🧩</div>
        ${c.avatar ? '<button class="chip" id="pzMe">🤳 Ta tête</button>' : ''}
        <button class="chip" id="pzPhoto">📷 Autre photo</button>
      </div>
      <div id="pzWrap"></div>
      <input type="file" accept="image/*" id="pzFile" style="display:none">`
    build(customImg || c.avatar || FALLBACK)

    const meBtn = document.getElementById('pzMe') as HTMLButtonElement | null
    if (meBtn) meBtn.onclick = () => { if (pz) { pz.running = false }; build(c.avatar!) }
    const fileInput = $('pzFile') as HTMLInputElement
    ;($('pzPhoto') as HTMLButtonElement).onclick = () => fileInput.click()
    fileInput.onchange = () => {
      const file = fileInput.files?.[0]
      fileInput.value = ''
      if (!file) return
      const im = new Image()
      im.onload = () => {
        const side = Math.min(im.width, im.height)
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 360
        const cx2 = canvas.getContext('2d')!
        cx2.drawImage(im, (im.width - side) / 2, (im.height - side) / 2, side, side, 0, 0, 360, 360)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
        useFerme.getState().setPuzzleImg(useFerme.getState().currentId, dataUrl)
        URL.revokeObjectURL(im.src)
        if (pz) pz.running = false
        build(dataUrl)
        ctx.toast('Nouvelle photo chargée ! 🖼')
      }
      im.src = URL.createObjectURL(file)
    }
    return () => { if (pz) { pz.running = false; pz = null } }
  }
}
