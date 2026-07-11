import type { GameContext, GameDef } from '../core/types'
import { $, pick } from '../core/utils'
import { sFlip, sWin } from '../core/audio'

const TQ_TILE_COLORS = ['#FF9C8F', '#FFC06B', '#7BD494', '#6FC2EE', '#C0A0F2', '#F58FB8', '#8FD7CE', '#F2B58F']

let tq: any = null
let ctx: GameContext

function render() {
  tq.cells.forEach((v: number, i: number) => {
    if (v === 0) return
    const r = Math.floor(i / tq.size), c = i % tq.size
    const x = tq.pad + c * (tq.cell + tq.gap), y = tq.pad + r * (tq.cell + tq.gap)
    tq.tiles[v].style.transform = `translate(${x}px,${y}px)`
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
  if (solved) { tq.running = false; setTimeout(finish, 350) }
}

function finish() {
  const moves = tq ? tq.moves : 0
  const par = tq ? tq.par : 30
  sWin()
  const stars = moves <= par * 1.4 ? 3 : moves <= par * 2.4 ? 2 : 1
  ctx.finish({
    title: tq.photo ? 'Photo reconstituée !' : 'Puzzle reconstitué !',
    msg: `${ctx.playerName} a réussi en ${moves} coups 🧩`,
    stars, starsEarned: stars
  })
}

function mountTaquin(c: GameContext, photo: boolean): () => void {
  ctx = c
  const usePhoto = photo && !!c.avatar
  c.root.innerHTML = `
    <div class="topbar">
      <div class="chip" id="tqMoves">Coups : 0</div>
    </div>
    ${photo && !c.avatar ? '<div class="gsub">Ajoute une photo à ton profil pour jouer avec ta tête ! En attendant : les nombres 😉</div>' : ''}
    <div id="tqBoard"></div>`
  const size = photo ? 3 : c.byTier(3, 3, 4)
  const shuffleMoves = c.byTier(22, 60, 120)
  const boardPx = Math.min(400, Math.min(window.innerWidth - 48, window.innerHeight * 0.52))
  const gap = usePhoto ? 2 : 6, pad = 8
  const cell = (boardPx - pad * 2 - gap * (size - 1)) / size
  const n = size * size
  const cells = [...Array(n - 1).keys()].map(i => i + 1)
  cells.push(0)
  let blank = n - 1
  let prev = -1
  for (let m = 0; m < shuffleMoves; m++) {
    const r = Math.floor(blank / size), col = blank % size
    const opts: number[] = []
    if (r > 0) opts.push(blank - size)
    if (r < size - 1) opts.push(blank + size)
    if (col > 0) opts.push(blank - 1)
    if (col < size - 1) opts.push(blank + 1)
    const cand = opts.filter(o => o !== prev)
    const from = pick(cand.length ? cand : opts)
    cells[blank] = cells[from]; cells[from] = 0
    prev = blank; blank = from
  }
  tq = { size, cells, blank, moves: 0, par: shuffleMoves, running: true, photo: usePhoto }
  const board = $('tqBoard')
  board.style.width = boardPx + 'px'
  board.style.height = boardPx + 'px'
  board.innerHTML = ''
  tq.tiles = {}
  cells.forEach(v => {
    if (v === 0) return
    const t = document.createElement('button')
    t.className = 'tqt'
    t.style.width = cell + 'px'
    t.style.height = cell + 'px'
    if (usePhoto) {
      // Chaque case affiche sa tranche de la photo (position résolue = case v-1)
      const sr = Math.floor((v - 1) / size), sc = (v - 1) % size
      t.style.backgroundImage = `url('${c.avatar}')`
      t.style.backgroundSize = `${boardPx - pad * 2}px ${boardPx - pad * 2}px`
      t.style.backgroundPosition = `-${sc * (cell + gap)}px -${sr * (cell + gap)}px`
    } else {
      t.textContent = String(v)
      t.style.fontSize = cell * 0.42 + 'px'
      t.style.background = `linear-gradient(150deg,${TQ_TILE_COLORS[(v - 1) % TQ_TILE_COLORS.length]},${TQ_TILE_COLORS[v % TQ_TILE_COLORS.length]})`
    }
    t.onclick = () => slide(v)
    board.appendChild(t)
    tq.tiles[v] = t
  })
  tq.cell = cell; tq.gap = gap; tq.pad = pad
  render()
  return () => { if (tq) { tq.running = false; tq = null } }
}

export const taquin: GameDef = {
  id: 'taquin', name: 'Taquin', icon: '🧩', sq: 'sq-lilac', cat: 'reflexion',
  subtitle: 'Remets les nombres dans l\'ordre',
  mount: c => mountTaquin(c, false)
}

export const photoPuzzle: GameDef = {
  id: 'photopuzzle', name: 'Puzzle Photo', icon: '🤳', sq: 'sq-pink', cat: 'reflexion',
  subtitle: 'Reconstitue ta photo !',
  mount: c => mountTaquin(c, true)
}
