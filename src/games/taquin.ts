import type { GameContext, GameDef } from '../core/types'
import { $, pick } from '../core/utils'
import { sfx, preloadSfx } from '../core/sfx'
import { confetti } from '../core/fx'
import { ICON } from '../core/icons'
import { useFerme } from '../core/store'
import { drawings } from '../core/atelierdb'
import { drawingPicture } from './coloring'
import { farmPicture, spacePicture, canvasPicture, squareUrl, PIC_W, PIC_H, type Picture } from '../core/pictures'
import { mountJigsaw, pictureWait, pictureOrNull, type Jigsaw } from './jigsaw'

/* Le Puzzle — c'était le Taquin ; depuis le 30/09, deux modes (validé par
   le père : « le Taquin devient un vrai puzzle ; le taquin actuel reste en
   second mode ») :
   - PUZZLE (par défaut, `jigsaw.ts`) : de vraies pièces en 3D, tenons et
     mortaises, en vrac sur la table, à reposer sur le plateau ;
   - TAQUIN : les morceaux qui glissent dans le cadre, tel qu'il était.

   Les images viennent de LEURS créations (`core/pictures.ts`) : la ferme en
   3D, leur princesse dans la salle de bal, l'Espace avec leur fusée, et
   leurs dessins de l'Atelier (les deux plus récents du dossier — sans
   dessin, pas de vignette). Une image se choisit en touchant sa vignette,
   dans la colonne de droite ; le Taquin y ajoute les nombres. Le mode et
   l'image sont retenus (`ferme:puzzle:mode`, `ferme:puzzle:img`).

   Le Taquin (polish du 7/09, inchangé) : plateau carré sur toute la
   hauteur, taper une tuile alignée avec le trou fait glisser toute la
   rangée, un coup impossible se sent (secousse, petit son), le par est la
   vraie distance à la solution (Manhattan). */

type Mode = 'puzzle' | 'taquin'
type Kind = 'image' | 'num'

/** Une image au choix : sa vignette, son petit nom, et l'image elle-même. */
interface Pic {
  id: string
  cap: string
  /** L'image de la vignette (dès qu'elle est prête). */
  thumb: string
  /** Une classe de vignette (la princesse sur fond rose, les nombres…). */
  cls?: string
  /** L'image n'a pas de vignette à elle avant d'être calculée : on la prépare en fond. */
  warm?: boolean
  /** Une vignette à part (la princesse : son portrait, pas la salle de bal entière). */
  prep?: () => Promise<string>
  load(): Promise<Picture | null>
}

interface Shell {
  mode: Mode
  pic: string
  pics: Pic[]
  jig: Jigsaw | null
  alive: boolean
  /** Jeton : un changement de mode ou d'image annule ce qui était en route. */
  gen: number
  urls: string[]
  fingers: number
}

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

let sh: Shell | null = null
let tq: State | null = null
let ctx: GameContext
let kind: Kind = 'image'
/** L'image du taquin en cours (un redimensionnement relance la partie avec elle). */
let tqImg = ''
const TQ_COLORS = ['#FF9C8F', '#FFC06B', '#7BD494', '#6FC2EE', '#C0A0F2', '#F58FB8', '#8FD7CE', '#F2B58F']
const MODE_KEY = 'ferme:puzzle:mode'
const PIC_KEY = 'ferme:puzzle:img'

const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* stockage refusé */ } }

/* =====================================================================
   Les images
   ===================================================================== */

/** Une photo (sa tête, une photo chargée) recadrée au format du plateau. */
function photoCanvas(url: string): Promise<HTMLCanvasElement | null> {
  return new Promise(res => {
    const im = new Image()
    im.onload = () => {
      const cv = document.createElement('canvas')
      cv.width = PIC_W; cv.height = PIC_H
      const k = Math.max(PIC_W / im.width, PIC_H / im.height)
      cv.getContext('2d')!.drawImage(im, (PIC_W - im.width * k) / 2, (PIC_H - im.height * k) / 2, im.width * k, im.height * k)
      res(cv)
    }
    im.onerror = () => res(null)
    im.src = url
  })
}

function basePics(c: GameContext): Pic[] {
  const st = useFerme.getState()
  const pics: Pic[] = [
    { id: 'ferme', cap: 'Ferme', thumb: '', warm: true, load: farmPicture },
    { id: 'espace', cap: 'Espace', thumb: '', warm: true, load: spacePicture }
  ]
  const custom = st.puzzleImgs[st.currentId]
  if (custom) pics.push({ id: 'photo', cap: 'Ta photo', thumb: custom, load: () => canvasPicture('photo:' + custom.length, () => photoCanvas(custom)) })
  if (c.avatar) {
    const av = c.avatar
    pics.push({ id: 'tete', cap: 'Ta tête', thumb: av, load: () => canvasPicture('tete:' + av.length, () => photoCanvas(av)) })
  }
  pics.push({ id: 'nombres', cap: 'Nombres', thumb: '', cls: 'pz-num', load: () => Promise.resolve(null) })
  return pics
}

const picOf = (me: Shell) => me.pics.find(p => p.id === me.pic) || me.pics[0]
const shown = (me: Shell) => me.pics.filter(p => me.mode === 'taquin' || p.id !== 'nombres')

function thumbHtml(p: Pic): string {
  if (p.id === 'nombres') return ICON.digits
  if (p.thumb) return `<img src="${p.thumb}" alt="" draggable="false">`
  return `<span class="pz-wait"><i></i><i></i><i></i></span>`
}

function renderPics(me: Shell) {
  const host = document.getElementById('pzPics')
  if (!host) return
  host.innerHTML = shown(me).map(p =>
    `<span class="tool-item"><button class="pz-pic ${p.cls || ''}${p.id === me.pic ? ' sel' : ''}" data-p="${p.id}" aria-label="${p.cap}">${thumbHtml(p)}</button><i class="tool-cap">${p.cap}</i></span>`
  ).join('')
  host.querySelectorAll<HTMLElement>('.pz-pic').forEach(b => { b.onclick = () => choose(me, b.dataset.p!) })
}

function paintThumb(me: Shell, p: Pic) {
  const b = document.querySelector<HTMLElement>(`.pz-pic[data-p="${p.id}"]`)
  if (b && sh === me) b.innerHTML = thumbHtml(p)
}

/** Les vignettes qui attendent leur image (la ferme, la princesse, l'Espace) : calculées
    une à une, en fond, jamais pendant qu'un doigt tient une pièce. Gardées
    ensuite sur le disque : la prochaine fois, rien à calculer. */
function warm(me: Shell) {
  const todo = me.pics.filter(p => p.warm && !p.thumb)
  let i = 0
  const next = () => {
    if (sh !== me || !me.alive) return
    const p = todo[i]
    if (!p) return
    // On attend que la partie soit prête (son image passe d'abord), et qu'aucun doigt ne joue
    const settled = me.mode === 'puzzle' ? !!me.jig?.ready() : !!tq
    if (!settled || me.fingers > 0 || me.jig?.busy()) { ctx.after(700, next); return }
    i++
    void (p.prep ? p.prep() : p.load().then(pic => pic?.url || '')).then(url => {
      if (sh !== me || !me.alive) return
      if (url && !p.thumb) { p.thumb = url; paintThumb(me, p) }
      ctx.after(500, next)
    })
  }
  ctx.after(2200, next)
}

function choose(me: Shell, id: string) {
  if (id === me.pic || !me.alive) return
  me.pic = id
  write(PIC_KEY, id)
  document.querySelectorAll<HTMLElement>('.pz-pic').forEach(b => b.classList.toggle('sel', b.dataset.p === id))
  sfx('click', { vol: 0.4 })
  const p = picOf(me)
  if (me.mode === 'puzzle') me.jig?.setPicture(p.load().then(pic => { learnThumb(me, p, pic); return pic }))
  else void startTaquin(me)
}

/** Une image calculée donne sa vignette à celles qui n'en avaient pas. */
function learnThumb(me: Shell, p: Pic, pic: Picture | null) {
  if (pic && !p.thumb && p.warm && !p.prep) { p.thumb = pic.url; paintThumb(me, p) }
}

/* =====================================================================
   Les modes
   ===================================================================== */
function syncModes(me: Shell) {
  document.querySelectorAll<HTMLElement>('.tq-mode').forEach(x => x.classList.toggle('sel', x.dataset.m === me.mode))
  const wrap = document.getElementById('tqWrap')
  wrap?.classList.toggle('pz-on', me.mode === 'puzzle')
  const board = document.getElementById('tqBoard')
  if (board) board.hidden = me.mode !== 'taquin'
  const moves = document.getElementById('tqMoves')
  if (moves) moves.hidden = me.mode !== 'taquin'
}

function setMode(me: Shell, mode: Mode) {
  if (mode === me.mode || !me.alive) return
  me.mode = mode
  write(MODE_KEY, mode)
  sfx('click', { vol: 0.4 })
  enter(me)
}

function enter(me: Shell, listed?: Promise<unknown>) {
  me.gen++
  if (me.mode === 'puzzle') {
    if (tq) { tq.running = false; tq = null }
    const b = document.getElementById('tqBoard')
    if (b) b.innerHTML = ''
    if (me.pic === 'nombres') { me.pic = 'ferme'; write(PIC_KEY, me.pic) }
    syncModes(me)
    renderPics(me)
    const holder = $('pz3d')
    me.jig?.dispose()
    const p = (listed || Promise.resolve()).then(() => {
      const pc = picOf(me)
      return pc.load().then(pic => { learnThumb(me, pc, pic); return pic })
    })
    me.jig = mountJigsaw(ctx, holder, p)
  } else {
    me.jig?.dispose()
    me.jig = null
    syncModes(me)
    renderPics(me)
    void (listed || Promise.resolve()).then(() => startTaquin(me))
  }
}

async function startTaquin(me: Shell) {
  const gen = ++me.gen
  if (tq) { tq.running = false; tq = null }
  const p = picOf(me)
  if (p.id === 'nombres') { kind = 'num'; build(''); return }
  kind = 'image'
  const hide = pictureWait($('tqWrap'))
  const pic = await pictureOrNull(ctx, p.load())
  learnThumb(me, p, pic)
  const url = pic ? await squareUrl(pic) : ''
  hide()
  if (sh !== me || !me.alive || gen !== me.gen || me.mode !== 'taquin') return
  if (url) me.urls.push(url)
  if (!url) kind = 'num' // pas d'image possible : les nombres, pour jouer quand même
  build(url)
}

/* =====================================================================
   Le Taquin (inchangé dans son jeu)
   ===================================================================== */
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
    title: kind === 'image' ? 'Image reconstituée !' : 'Nombres remis en ordre !',
    msg: `Tu as réussi en ${me.moves} coup${me.moves > 1 ? 's' : ''}`,
    stars
  })
}

/** Le plus grand carré qui tient dans l'arène, en laissant la place aux colonnes. */
function fitPx(): number {
  const w = $('tqWrap')
  return Math.max(240, Math.min(w.clientWidth - 280, w.clientHeight - 20))
}

function build(img: string) {
  tqImg = img
  const size = ctx.byTier(3, 4, 5)
  const shuffleMoves = ctx.byTier(45, 110, 200)
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

  const board = $('tqBoard')
  board.classList.remove('done')
  board.style.width = boardPx + 'px'
  board.style.height = boardPx + 'px'
  board.innerHTML = kind === 'image' ? `<div class="tq2-ghost" style="background-image:url('${img}')"></div>` : ''
  const inner = boardPx - pad * 2
  cells.forEach(v => {
    if (v === 0) return
    const t = document.createElement('button')
    t.className = 'tq2-t'
    t.style.width = cell + 'px'
    t.style.height = cell + 'px'
    if (kind === 'image') {
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

/* =====================================================================
   Le jeu
   ===================================================================== */
export const taquin: GameDef = {
  id: 'taquin2', name: 'Puzzle', icon: '🧩', sq: 'sq-sky', cat: 'reflexion',
  subtitle: 'Attrape les pièces et reconstruis l\'image',
  hand: () => {
    const shell = sh
    if (!shell) return null
    // Le Puzzle : une pièce en vrac glisse jusqu'à sa place
    if (shell.mode === 'puzzle') return shell.jig?.hand() ?? null
    // Le Taquin : on touche un morceau à côté du trou, il glisse
    const me = tq
    if (!me || !me.running) return null
    const n = me.size, b = me.blank, br = Math.floor(b / n), bc = b % n
    const near = [b - n, b + n, bc > 0 ? b - 1 : -1, bc < n - 1 ? b + 1 : -1]
      .filter(i => i >= 0 && i < n * n && (i % n === bc || Math.floor(i / n) === br))
    const i = near[Math.floor(Math.random() * near.length)]
    return i === undefined ? null : { tap: me.tiles[me.cells[i]] }
  },
  mount(c) {
    ctx = c
    const st = useFerme.getState()
    c.root.innerHTML = `
      <div class="arena tq-wrap" id="tqWrap">
        <div class="pz-3d" id="pz3d"></div>
        <div id="tqBoard" hidden></div>
        <div class="tq-tools">
          <span class="tool-item"><button class="sn-tool tq-mode" data-m="puzzle" aria-label="Puzzle">${ICON.piece}</button><i class="tool-cap">Puzzle</i></span>
          <span class="tool-item"><button class="sn-tool tq-mode" data-m="taquin" aria-label="Taquin">${ICON.slide}</button><i class="tool-cap">Taquin</i></span>
          <div class="tq-moves" id="tqMoves" hidden></div>
        </div>
        <div class="pz-pics" id="pzPics"></div>
      </div>`
    preloadSfx(['tick', 'drop', 'confirm', 'click'])
    const savedMode = read(MODE_KEY)
    const me: Shell = {
      mode: savedMode === 'taquin' ? 'taquin' : 'puzzle',
      pic: read(PIC_KEY) || 'ferme',
      pics: basePics(c), jig: null, alive: true, gen: 0, urls: [], fingers: 0
    }
    sh = me
    document.querySelectorAll<HTMLElement>('.tq-mode').forEach(b => {
      b.onclick = () => setMode(me, b.dataset.m as Mode)
    })
    // Leurs dessins du dossier (les deux plus récents) : lus avant de choisir l'image
    const listed = drawings(st.currentId).then(ds => {
      if (sh !== me) return
      const at = me.pics.findIndex(p => p.id === 'espace') + 1
      const mine = ds.slice(0, 2).map((d, k): Pic => {
        const url = URL.createObjectURL(d.thumb)
        me.urls.push(url)
        return { id: 'dessin' + k, cap: 'Dessin', thumb: url, cls: 'pz-draw', load: () => canvasPicture('dessin:' + d.id + ':' + d.at, () => drawingPicture(d, PIC_W, PIC_H)) }
      })
      me.pics.splice(at, 0, ...mine)
    }).catch(() => { /* pas de dossier : pas de vignette */ }).then(() => {
      if (sh !== me) return
      if (!me.pics.some(p => p.id === me.pic)) me.pic = 'ferme'
      renderPics(me)
    })
    renderPics(me)
    enter(me, listed)
    warm(me)

    // Un doigt posé : le travail de fond attend (les vignettes)
    const down = () => { me.fingers++ }
    const up = () => { me.fingers = Math.max(0, me.fingers - 1) }
    c.root.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    const onResize = () => { if (me.alive && me.mode === 'taquin' && tq) { tq.running = false; build(tqImg) } }
    window.addEventListener('resize', onResize)

    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __tq: unknown }).__tq = {
        get cells() { return tq ? [...tq.cells] : null }, get size() { return tq?.size }, get running() { return !!tq?.running },
        get mode() { return sh?.mode },
        tap: (v: number) => { if (tq) slide(tq, v) }
      }
    }

    return () => {
      if (!me.alive) return
      me.alive = false
      c.root.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('resize', onResize)
      me.jig?.dispose()
      me.jig = null
      if (tq) { tq.running = false; tq = null }
      me.urls.forEach(u => URL.revokeObjectURL(u))
      if (sh === me) sh = null
      delete (window as { __tq?: unknown }).__tq
    }
  }
}
