import type { GameContext, GameDef } from '../core/types'
import { $, boardSize, pick } from '../core/utils'
import { sFlip, sWin } from '../core/audio'
import { confetti } from '../core/fx'
import { useFerme } from '../core/store'

/* Taquin — version image : on fait glisser des morceaux de photo (sa tête,
   ou n'importe quelle photo chargée). L'image fantôme en fond guide, un
   modèle miniature rappelle l'objectif, et en Douce le mélange est très
   court pour que ce soit gagnable à 6 ans. */

let tq: any = null
let ctx: GameContext
let mode: 'image' | 'num' = 'image'
const TQ_COLORS = ['#FF9C8F', '#FFC06B', '#7BD494', '#6FC2EE', '#C0A0F2', '#F58FB8', '#8FD7CE', '#F2B58F']

const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360">
<rect width="360" height="360" fill="#BDE3FA"/><rect y="230" width="360" height="130" fill="#A5DB93"/>
<circle cx="70" cy="70" r="38" fill="#FFE066"/>
<text x="110" y="300" font-size="70">🐮</text><text x="230" y="310" font-size="60">🐔</text>
<text x="150" y="180" font-size="50">🌻</text><text x="260" y="150" font-size="44">🦋</text></svg>`
const FALLBACK = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(FALLBACK_SVG)))

function render() {
  tq.cells.forEach((v: number, i: number) => {
    if (v === 0) return
    const r = Math.floor(i / tq.size), c = i % tq.size
    tq.tiles[v].style.transform = `translate(${tq.pad + c * (tq.cell + tq.gap)}px,${tq.pad + r * (tq.cell + tq.gap)}px)`
  })
}

function slide(v: number) {
  if (!tq || !tq.running) return
  const i = tq.cells.indexOf(v)
  const r = Math.floor(i / tq.size), c = i % tq.size
  const br = Math.floor(tq.blank / tq.size), bc = tq.blank % tq.size
  if (Math.abs(r - br) + Math.abs(c - bc) !== 1) return
  tq.cells[tq.blank] = v; tq.cells[i] = 0; tq.blank = i
  tq.moves++
  $('tqMoves').textContent = 'Coups : ' + tq.moves
  sFlip()
  render()
  const solved = tq.cells.every((val: number, idx: number) => (idx === tq.cells.length - 1 ? val === 0 : val === idx + 1))
  if (solved) {
    tq.running = false
    // L'image se recompose en entier
    $('tqBoard').classList.add('done')
    confetti()
    setTimeout(finish, 900)
  }
}

function finish() {
  sWin()
  const stars = tq.moves <= tq.par * 1.6 ? 3 : tq.moves <= tq.par * 3 ? 2 : 1
  ctx.finish({
    title: mode === 'image' ? 'Image reconstituée !' : 'Nombres remis en ordre !',
    msg: `${ctx.playerName} a réussi en ${tq.moves} coups 🖼`,
    stars, starsEarned: stars
  })
}

function build(img: string) {
  const size = ctx.byTier(3, 3, 4)
  const shuffleMoves = ctx.byTier(10, 45, 110)
  const boardPx = boardSize(340)
  const gap = 3, pad = 6
  const cell = (boardPx - pad * 2 - gap * (size - 1)) / size
  const n = size * size

  // Mélange par coups légaux : toujours solvable
  const cells = [...Array(n - 1).keys()].map(i => i + 1)
  cells.push(0)
  let blank = n - 1
  let prev = -1
  for (let m = 0; m < shuffleMoves; m++) {
    const r = Math.floor(blank / size), c = blank % size
    const opts: number[] = []
    if (r > 0) opts.push(blank - size)
    if (r < size - 1) opts.push(blank + size)
    if (c > 0) opts.push(blank - 1)
    if (c < size - 1) opts.push(blank + 1)
    const cand = opts.filter(o => o !== prev)
    const from = pick(cand.length ? cand : opts)
    cells[blank] = cells[from]; cells[from] = 0
    prev = blank; blank = from
  }

  tq = { size, cells, blank, moves: 0, par: shuffleMoves, cell, gap, pad, tiles: {}, running: true }
  $('tqMoves').textContent = 'Coups : 0'
  $('tqMini').innerHTML = `<img src="${img}" alt="">`

  const board = $('tqBoard')
  board.classList.remove('done')
  board.style.width = boardPx + 'px'
  board.style.height = boardPx + 'px'
  // En mode image : image fantôme en fond pour se guider
  board.innerHTML = mode === 'image' ? `<div class="tq2-ghost" style="background-image:url('${img}')"></div>` : ''
  $('tqMini').style.display = mode === 'image' ? '' : 'none'
  const inner = boardPx - pad * 2
  cells.forEach(v => {
    if (v === 0) return
    const t = document.createElement('button')
    t.className = 'tq2-t'
    t.style.width = cell + 'px'
    t.style.height = cell + 'px'
    if (mode === 'image') {
      const sr = Math.floor((v - 1) / size), sc = (v - 1) % size
      t.style.backgroundImage = `url('${img}')`
      t.style.backgroundSize = `${inner}px ${inner}px`
      t.style.backgroundPosition = `-${sc * (cell + gap)}px -${sr * (cell + gap)}px`
    } else {
      t.classList.add('num')
      t.textContent = String(v)
      t.style.fontSize = cell * 0.4 + 'px'
      t.style.background = `linear-gradient(150deg,${TQ_COLORS[(v - 1) % TQ_COLORS.length]},${TQ_COLORS[v % TQ_COLORS.length]})`
    }
    t.onclick = () => slide(v)
    board.appendChild(t)
    tq.tiles[v] = t
  })
  render()
}

export const taquin: GameDef = {
  id: 'taquin2', name: 'Taquin', icon: '🖼', sq: 'sq-sky', cat: 'reflexion',
  subtitle: 'Fais glisser les morceaux pour recomposer l\'image',
  mount(c) {
    ctx = c
    const st = useFerme.getState()
    const customImg = st.puzzleImgs[st.currentId] || null
    let img = customImg || c.avatar || FALLBACK
    mode = 'image'
    c.root.innerHTML = `
      <div class="topbar">
        <button class="chip tq-mode sel" data-m="image">🖼</button>
        <button class="chip tq-mode" data-m="num">🔢</button>
        ${c.avatar ? '<button class="chip" id="tqMe" title="Ta tête">🤳</button>' : ''}
        <button class="chip" id="tqDefault" title="Image de base">🌻</button>
        <div class="chip" id="tqMoves">Coups : 0</div>
        <div class="chip tq2-mini" id="tqMini"></div>
        <button class="chip" id="tqRestart">↻</button>
      </div>
      <div id="tqBoard"></div>`
    document.querySelectorAll<HTMLElement>('.tq-mode').forEach(b => {
      b.onclick = () => {
        mode = b.dataset.m as 'image' | 'num'
        document.querySelectorAll('.tq-mode').forEach(x => x.classList.toggle('sel', x === b))
        if (tq) tq.running = false
        build(img)
      }
    })
    const tqMe = document.getElementById('tqMe') as HTMLButtonElement | null
    if (tqMe) tqMe.onclick = () => { img = c.avatar!; mode = 'image'; syncModeChips(); if (tq) tq.running = false; build(img) }
    ;($('tqDefault') as HTMLButtonElement).onclick = () => { img = FALLBACK; if (tq) tq.running = false; build(img) }
    function syncModeChips() {
      document.querySelectorAll<HTMLElement>('.tq-mode').forEach(x => x.classList.toggle('sel', x.dataset.m === mode))
    }
    build(img)
    ;($('tqRestart') as HTMLButtonElement).onclick = () => { if (tq) tq.running = false; build(img) }
    return () => { if (tq) { tq.running = false; tq = null } }
  }
}
