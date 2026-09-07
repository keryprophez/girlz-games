import type { GameContext, GameDef } from '../core/types'
import { $, pick } from '../core/utils'
import { sfx, preloadSfx } from '../core/sfx'
import { confetti } from '../core/fx'
import { ICON } from '../core/icons'
import { loadAtlas, FARM_ANIMALS, type Atlas } from '../core/sprites'
import { useFerme } from '../core/store'

/* Taquin — on fait glisser des morceaux de photo (sa tête, une photo
   chargée, ou une image de la ferme) jusqu'à recomposer l'image ; ou des
   nombres à remettre en ordre. L'image fantôme en fond guide, le modèle
   miniature rappelle l'objectif.

   Polish du 7/09 (phase 2, jeux 2D) :
   - plein écran : plateau carré sur toute la hauteur, colonne d'icônes,
     modèle et compteur sur le côté — plus rien à lire ;
   - taper une tuile alignée avec le trou fait glisser toute la rangée ;
   - un coup impossible se sent (secousse, petit son) ;
   - le par est la vraie distance à la solution (Manhattan), plus le nombre
     de coups de mélange ;
   - l'image de base est dessinée avec les vrais animaux de la ferme, plus
     un SVG à emoji ; état typé. */

type Mode = 'image' | 'num'
interface State {
  size: number
  cells: number[]
  blank: number
  moves: number
  par: number
  cell: number
  gap: number
  pad: number
  tiles: Record<number, HTMLButtonElement>
  running: boolean
}

let tq: State | null = null
let ctx: GameContext
let mode: Mode = 'image'
const TQ_COLORS = ['#FF9C8F', '#FFC06B', '#7BD494', '#6FC2EE', '#C0A0F2', '#F58FB8', '#8FD7CE', '#F2B58F']

/** L'image de base : un pré, un ciel, et quatre animaux de la ferme (vrais sprites). */
function farmPicture(atlas: Atlas): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = c.height = 512
      const g = c.getContext('2d')!
      const sky = g.createLinearGradient(0, 0, 0, 320)
      sky.addColorStop(0, '#8FCDEB'); sky.addColorStop(1, '#D6EEFA')
      g.fillStyle = sky; g.fillRect(0, 0, 512, 512)
      g.fillStyle = '#FFE066'; g.beginPath(); g.arc(90, 90, 46, 0, 7); g.fill()
      g.fillStyle = '#FFFFFF'
      for (const [x, y, r] of [[330, 80, 30], [370, 70, 38], [410, 85, 28]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill() }
      const grass = g.createLinearGradient(0, 300, 0, 512)
      grass.addColorStop(0, '#7CC96F'); grass.addColorStop(1, '#4F9A45')
      g.fillStyle = grass; g.fillRect(0, 300, 512, 212)
      const names = [...FARM_ANIMALS].sort(() => Math.random() - 0.5).slice(0, 4)
      names.forEach((n, i) => {
        const f = atlas.frames[n]
        if (!f) return
        const size = 150
        const x = 30 + i * 118, y = 340 - (i % 2) * 40
        g.drawImage(img, f.x, f.y, f.w, f.h, x, y, size * f.w / f.h, size)
      })
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = () => resolve('')
    img.src = atlas.image
  })
}

function render(me: State) {
  me.cells.forEach((v, i) => {
    if (v === 0) return
    const r = Math.floor(i / me.size), c = i % me.size
    me.tiles[v].style.transform = `translate(${me.pad + c * (me.cell + me.gap)}px,${me.pad + r * (me.cell + me.gap)}px)`
  })
}

/** Distance de Manhattan de chaque tuile à sa place : le vrai « par ». */
function manhattan(cells: number[], size: number): number {
  let d = 0
  cells.forEach((v, i) => {
    if (!v) return
    const r = Math.floor(i / size), c = i % size
    const tr = Math.floor((v - 1) / size), tc = (v - 1) % size
    d += Math.abs(r - tr) + Math.abs(c - tc)
  })
  return d
}

function paintMoves(me: State) { $('tqMoves').innerHTML = `${ICON.tap}<span>${me.moves}</span>` }

/** Taper une tuile : si elle est alignée avec le trou, toute la rangée glisse. */
function slide(me: State, v: number) {
  if (tq !== me || !me.running) return
  const i = me.cells.indexOf(v)
  const r = Math.floor(i / me.size), c = i % me.size
  const br = Math.floor(me.blank / me.size), bc = me.blank % me.size
  if (r !== br && c !== bc) {
    // Pas dans la rangée du trou : ça ne bouge pas, et ça se sent
    const t = me.tiles[v]
    t.classList.remove('nope'); void t.offsetWidth; t.classList.add('nope')
    sfx('drop', { vol: 0.3, rate: 0.8 })
    return
  }
  const step = r === br ? (c < bc ? 1 : -1) : (r < br ? me.size : -me.size)
  // Les tuiles entre le trou et celle tapée avancent d'une case chacune
  let b = me.blank
  while (b !== i) {
    const from = b - step
    me.cells[b] = me.cells[from]; me.cells[from] = 0
    b = from
    me.moves++
  }
  me.blank = i
  paintMoves(me)
  sfx('tick', { vol: 0.4, rate: 1.2, spread: 0.1 })
  render(me)
  const solved = me.cells.every((val, idx) => (idx === me.cells.length - 1 ? val === 0 : val === idx + 1))
  if (solved) {
    me.running = false
    $('tqBoard').classList.add('done')
    sfx('confirm', { vol: 0.8, rate: 1.1 })
    confetti()
    ctx.after(900, () => { if (tq === me) finish(me) })
  }
}

function finish(me: State) {
  const stars = me.moves <= me.par * 1.8 ? 3 : me.moves <= me.par * 3.2 ? 2 : 1
  ctx.finish({
    title: mode === 'image' ? 'Image reconstituée !' : 'Nombres remis en ordre !',
    msg: `${ctx.playerName} a réussi en ${me.moves} coup${me.moves > 1 ? 's' : ''}`,
    stars, starsEarned: stars
  })
}

/** Le plus grand carré qui tient dans l'arène, en laissant la place aux colonnes. */
function fitPx(): number {
  const w = $('tqWrap')
  return Math.max(240, Math.min(w.clientWidth - 260, w.clientHeight - 20))
}

function build(img: string) {
  const size = ctx.byTier(3, 3, 4)
  const shuffleMoves = ctx.byTier(10, 45, 110)
  const boardPx = fitPx()
  const gap = 4, pad = 8
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

  const me: State = { size, cells, blank, moves: 0, par: Math.max(1, manhattan(cells, size)), cell, gap, pad, tiles: {}, running: true }
  tq = me
  paintMoves(me)
  $('tqMini').innerHTML = `<img src="${img}" alt="">`

  const board = $('tqBoard')
  board.classList.remove('done')
  board.style.width = boardPx + 'px'
  board.style.height = boardPx + 'px'
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
      t.style.fontSize = cell * 0.46 + 'px'
      t.style.background = `linear-gradient(150deg,${TQ_COLORS[(v - 1) % TQ_COLORS.length]},${TQ_COLORS[v % TQ_COLORS.length]})`
    }
    t.onclick = () => slide(me, v)
    board.appendChild(t)
    me.tiles[v] = t
  })
  render(me)
}

export const taquin: GameDef = {
  id: 'taquin2', name: 'Taquin', icon: '🖼', sq: 'sq-sky', cat: 'reflexion',
  subtitle: 'Fais glisser les morceaux pour recomposer l\'image',
  mount(c) {
    ctx = c
    const st = useFerme.getState()
    const customImg = st.puzzleImgs[st.currentId] || null
    let farm = ''
    let img = customImg || c.avatar || ''
    mode = 'image'
    c.root.innerHTML = `
      <div class="arena tq-wrap" id="tqWrap">
        <div id="tqBoard"></div>
        <div class="tq-tools">
          <button class="sn-tool tq-mode sel" data-m="image" aria-label="Image">${ICON.photo}</button>
          <button class="sn-tool tq-mode" data-m="num" aria-label="Nombres">${ICON.digits}</button>
          ${c.avatar ? `<button class="sn-tool" id="tqMe" aria-label="Ta tête">${ICON.camera}</button>` : ''}
          <button class="sn-tool" id="tqFarm" aria-label="La ferme">${ICON.flower}</button>
        </div>
        <div class="tq-side">
          <div class="tq2-mini" id="tqMini"></div>
          <div class="tq-moves" id="tqMoves"></div>
        </div>
      </div>`
    preloadSfx(['tick', 'drop', 'confirm'])
    let alive = true
    const rebuild = () => { if (tq) tq.running = false; build(img || farm) }
    const syncModeChips = () => document.querySelectorAll<HTMLElement>('.tq-mode').forEach(x => x.classList.toggle('sel', x.dataset.m === mode))
    document.querySelectorAll<HTMLElement>('.tq-mode').forEach(b => {
      b.onclick = () => { mode = b.dataset.m as Mode; syncModeChips(); sfx('click', { vol: 0.4 }); rebuild() }
    })
    const tqMe = document.getElementById('tqMe') as HTMLButtonElement | null
    if (tqMe) tqMe.onclick = () => { img = c.avatar!; mode = 'image'; syncModeChips(); rebuild() }
    ;($('tqFarm') as HTMLButtonElement).onclick = () => { img = farm; mode = 'image'; syncModeChips(); rebuild() }
    const onResize = () => { if (alive && tq) rebuild() }
    window.addEventListener('resize', onResize)

    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __tq: unknown }).__tq = {
        get cells() { return tq ? [...tq.cells] : null }, get size() { return tq?.size }, get running() { return !!tq?.running },
        tap: (v: number) => { if (tq) slide(tq, v) }
      }
    }

    // L'image de la ferme est dessinée avec les vrais animaux : on la prépare
    // d'abord, elle sert de base quand il n'y a ni photo ni tête
    loadAtlas('animals').then(farmPicture).then(p => {
      if (!alive) return
      farm = p
      build(img || farm)
    })
    return () => {
      alive = false
      window.removeEventListener('resize', onResize)
      if (tq) { tq.running = false; tq = null }
    }
  }
}
