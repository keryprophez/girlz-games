import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { sfx, preloadSfx } from '../core/sfx'
import { impact } from '../core/impact'
import { confetti } from '../core/fx'
import { ICON } from '../core/icons'
import { loadAtlas, spriteSpan, type Atlas } from '../core/sprites'
import { useFerme } from '../core/store'

/* Puissance 4 des Sœurs — LE jeu à deux sur la même tablette, au tour par
   tour : chacune joue avec SA tête comme jeton. Aligne 4 pour gagner !

   Polish du 9/09 (phase 2, jeux 2D) :
   - plein écran : la grille prend toute la hauteur ;
   - une IA pour jouer SEULE contre la poule (deux icônes à gauche : à deux,
     ou contre la poule) — minimax avec élagage, profondeur selon le palier ;
   - à qui le tour : la tête de la joueuse en grand sur le côté, qui saute,
     plus de phrase à lire ; le jeton fantôme suit le doigt au-dessus de la
     colonne ; le jeton tombe avec un choc à l'arrivée ;
   - les quatre jetons gagnants scintillent (tous), la colonne pleine
     secoue ; timers de partie, état typé. */

const COLS = 7, ROWS = 6
const RIMS = ['#FF6B81', '#4FB8E7']
type Grid = number[][]

interface Player { name: string; avatar: string | null; fallback: string }
interface State {
  players: Player[]
  grid: Grid
  turn: number
  lock: boolean
  over: boolean
  solo: boolean
  cell: number
  pad: number
  atlas: Atlas | null
}

let c4: State | null = null
let ctx: GameContext

function tokenHTML(p: Player, rim: string, px: number): string {
  if (p.avatar) return `<span class="c4-face" style="background-image:url('${p.avatar}');border-color:${rim}"></span>`
  return `<span class="c4-face c4-drawn" style="border-color:${rim}">${c4?.atlas ? spriteSpan(c4.atlas, p.fallback, px * 0.62) : ''}</span>`
}

function winLine(g: Grid, player: number): [number, number][] | null {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]]
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (g[r][c] !== player) continue
    for (const [dc, dr] of dirs) {
      const line: [number, number][] = [[r, c]]
      for (let k = 1; k < 4; k++) {
        const nr = r + dr * k, nc = c + dc * k
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || g[nr][nc] !== player) break
        line.push([nr, nc])
      }
      if (line.length === 4) return line
    }
  }
  return null
}

/* ---------- L'IA : minimax avec élagage alpha-bêta ---------- */
const landing = (g: Grid, col: number) => { for (let r = ROWS - 1; r >= 0; r--) if (g[r][col] === -1) return r; return -1 }

/** Score d'une fenêtre de 4 cases pour `me` : alignements ouverts, menaces adverses. */
function windowScore(cells: number[], me: number): number {
  const mine = cells.filter(v => v === me).length
  const theirs = cells.filter(v => v === 1 - me).length
  const empty = cells.filter(v => v === -1).length
  if (mine === 4) return 1000
  if (mine === 3 && empty === 1) return 12
  if (mine === 2 && empty === 2) return 3
  if (theirs === 3 && empty === 1) return -14
  if (theirs === 2 && empty === 2) return -3
  return 0
}

function evaluate(g: Grid, me: number): number {
  let s = 0
  for (let r = 0; r < ROWS; r++) if (g[r][3] === me) s += 3 // la colonne du milieu vaut plus
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (c + 3 < COLS) s += windowScore([g[r][c], g[r][c + 1], g[r][c + 2], g[r][c + 3]], me)
    if (r + 3 < ROWS) s += windowScore([g[r][c], g[r + 1][c], g[r + 2][c], g[r + 3][c]], me)
    if (r + 3 < ROWS && c + 3 < COLS) s += windowScore([g[r][c], g[r + 1][c + 1], g[r + 2][c + 2], g[r + 3][c + 3]], me)
    if (r + 3 < ROWS && c - 3 >= 0) s += windowScore([g[r][c], g[r + 1][c - 1], g[r + 2][c - 2], g[r + 3][c - 3]], me)
  }
  return s
}

function minimax(g: Grid, depth: number, alpha: number, beta: number, maximizing: boolean, me: number): number {
  if (winLine(g, me)) return 100000 + depth
  if (winLine(g, 1 - me)) return -100000 - depth
  const cols = [3, 2, 4, 1, 5, 0, 6].filter(c => landing(g, c) >= 0)
  if (!cols.length) return 0
  if (depth === 0) return evaluate(g, me)
  if (maximizing) {
    let best = -Infinity
    for (const c of cols) {
      const r = landing(g, c); g[r][c] = me
      best = Math.max(best, minimax(g, depth - 1, alpha, beta, false, me))
      g[r][c] = -1
      alpha = Math.max(alpha, best)
      if (alpha >= beta) break
    }
    return best
  }
  let best = Infinity
  for (const c of cols) {
    const r = landing(g, c); g[r][c] = 1 - me
    best = Math.min(best, minimax(g, depth - 1, alpha, beta, true, me))
    g[r][c] = -1
    beta = Math.min(beta, best)
    if (alpha >= beta) break
  }
  return best
}

/** Le coup de la poule : gagne si elle peut, bloque si elle doit, sinon réfléchit un peu. */
function aiMove(g: Grid, me: number, depth: number): number {
  const cols = [3, 2, 4, 1, 5, 0, 6].filter(c => landing(g, c) >= 0)
  let bestCol = cols[0], bestScore = -Infinity
  for (const c of cols) {
    const r = landing(g, c); g[r][c] = me
    const s = minimax(g, depth - 1, -Infinity, Infinity, false, me)
    g[r][c] = -1
    // Un brin de hasard aux coups équivalents : elle ne joue pas toujours pareil
    const jitter = Math.random() * 2
    if (s + jitter > bestScore) { bestScore = s + jitter; bestCol = c }
  }
  return bestCol
}

/* ---------- La partie ---------- */
function paintTurn(me: State) {
  const p = me.players[me.turn]
  const px = Math.round(me.cell * 1.6)
  $('c4Turn').innerHTML = `<div class="c4-who" style="width:${px}px;height:${px}px">${tokenHTML(p, RIMS[me.turn], px)}</div>`
}

function ghostAt(me: State, col: number | null) {
  const g = $('c4Ghost')
  if (col === null || me.over || me.lock || (me.solo && me.turn === 1)) { g.style.display = 'none'; return }
  g.style.display = ''
  g.style.left = me.pad + col * me.cell + 'px'
  g.innerHTML = tokenHTML(me.players[me.turn], RIMS[me.turn], me.cell)
}

function drop(me: State, col: number) {
  if (c4 !== me || me.over || me.lock) return
  const row = landing(me.grid, col)
  if (row === -1) {
    const b = document.querySelector<HTMLElement>(`.c4-col[data-c="${col}"]`)
    if (b) { b.classList.remove('full'); void b.offsetWidth; b.classList.add('full') }
    sfx('drop', { vol: 0.35, rate: 0.8 })
    return
  }
  me.lock = true
  ghostAt(me, null)
  me.grid[row][col] = me.turn
  const p = me.players[me.turn]
  const tok = document.createElement('div')
  tok.className = 'c4-token'
  tok.innerHTML = tokenHTML(p, RIMS[me.turn], me.cell)
  tok.style.width = tok.style.height = me.cell + 'px'
  tok.style.left = me.pad + col * me.cell + 'px'
  tok.style.top = '-' + me.cell + 'px'
  tok.style.transitionDuration = (0.18 + row * 0.05) + 's'
  tok.dataset.cell = row + ':' + col
  $('c4Board').appendChild(tok)
  requestAnimationFrame(() => { tok.style.top = me.pad + row * me.cell + 'px' })
  sfx('whoosh', { vol: 0.3, rate: 1.3 })
  ctx.after(180 + row * 50, () => {
    if (c4 !== me) return
    impact(0.3 + row * 0.04, { matter: 'bois', noShake: true })
    const line = winLine(me.grid, me.turn)
    if (line) {
      me.over = true
      sfx('confirm', { vol: 0.8 })
      confetti()
      for (const [r, c] of line) document.querySelector<HTMLElement>(`.c4-token[data-cell="${r}:${c}"]`)?.classList.add('c4-win')
      const winnerIsAI = me.solo && me.turn === 1
      ctx.after(1400, () => {
        if (c4 !== me) return
        ctx.finish({
          title: winnerIsAI ? 'La poule a gagné !' : `${p.name} gagne !`,
          msg: winnerIsAI ? `${ctx.playerName} a bien joué, la revanche est à portée` : me.solo ? `${p.name} a aligné quatre têtes contre la poule` : 'Quatre à la suite, bravo les deux !',
          stars: winnerIsAI ? 1 : 3, starsEarned: winnerIsAI ? 1 : 2
        })
      })
      return
    }
    if (me.grid.every(r => r.every(v => v !== -1))) {
      me.over = true
      ctx.after(1000, () => { if (c4 === me) ctx.finish({ title: 'Égalité parfaite !', msg: 'La grille est pleine, match nul', stars: 2, starsEarned: 2 }) })
      return
    }
    me.turn = 1 - me.turn
    me.lock = false
    paintTurn(me)
    if (me.solo && me.turn === 1) {
      me.lock = true
      const depth = ctx.byTier(2, 4, 6)
      ctx.after(550, () => {
        if (c4 !== me) return
        me.lock = false
        drop(me, aiMove(me.grid, 1, depth))
      })
    }
  })
}

function newGame(me: State) {
  me.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(-1))
  me.turn = 0; me.lock = false; me.over = false
  document.querySelectorAll('.c4-token:not(.c4-ghost)').forEach(t => t.remove())
  paintTurn(me)
}

export const connect4: GameDef = {
  id: 'connect4', name: 'Puissance 4', icon: '🔴', sq: 'sq-sun', cat: 'reflexion',
  subtitle: 'À deux, chacune son tour, ou seule contre la poule : aligne 4 têtes !',
  mount(c) {
    ctx = c
    const profiles = useFerme.getState().profiles
    const cur = profiles.find(p => p.id === useFerme.getState().currentId) || profiles[0]
    const other = profiles.find(p => p.id !== cur.id) || cur
    c.root.innerHTML = `
      <div class="arena c4-wrap" id="c4Wrap">
        <div id="c4Board"></div>
        <div class="tq-tools">
          <button class="sn-tool c4-mode sel" data-m="duo" aria-label="À deux">${ICON.versus}</button>
          <button class="sn-tool c4-mode" data-m="solo" aria-label="Contre la poule">${ICON.hexagon}</button>
        </div>
        <div class="tq-side"><div class="c4-turn" id="c4Turn"></div></div>
      </div>`
    preloadSfx(['whoosh', 'drop', 'confirm'])
    const wrap = $('c4Wrap')
    const pad = 12
    const boardH = Math.max(240, wrap.clientHeight - 24)
    const cell = Math.min((boardH - pad * 2) / ROWS, (wrap.clientWidth - 300 - pad * 2) / COLS)
    const boardW = pad * 2 + cell * COLS
    const board = $('c4Board')
    board.style.width = boardW + 'px'
    board.style.height = pad * 2 + cell * ROWS + 'px'
    board.innerHTML = `
      ${Array.from({ length: ROWS * COLS }, (_, i) => {
        const r = Math.floor(i / COLS), col = i % COLS
        return `<div class="c4-hole" style="width:${cell}px;height:${cell}px;left:${pad + col * cell}px;top:${pad + r * cell}px"></div>`
      }).join('')}
      <div class="c4-token c4-ghost" id="c4Ghost" style="width:${cell}px;height:${cell}px;top:${-cell * 0.15}px;display:none"></div>
      ${Array.from({ length: COLS }, (_, col) =>
        `<button class="c4-col" data-c="${col}" style="width:${cell}px;left:${pad + col * cell}px;height:${pad * 2 + cell * ROWS}px"></button>`).join('')}`
    const me: State = {
      players: [
        { name: cur.name, avatar: cur.avatar, fallback: 'chick' },
        { name: other.name, avatar: other.avatar, fallback: 'chicken' }
      ],
      grid: [], turn: 0, lock: false, over: false, solo: false, cell, pad, atlas: null
    }
    c4 = me
    const HEN: Player = { name: 'la poule', avatar: null, fallback: 'chicken' }
    document.querySelectorAll<HTMLElement>('.c4-mode').forEach(b => {
      b.onclick = () => {
        me.solo = b.dataset.m === 'solo'
        document.querySelectorAll('.c4-mode').forEach(x => x.classList.toggle('sel', x === b))
        me.players[1] = me.solo ? HEN : { name: other.name, avatar: other.avatar, fallback: 'chicken' }
        sfx('click', { vol: 0.4 })
        newGame(me)
      }
    })
    document.querySelectorAll<HTMLElement>('.c4-col').forEach(b => {
      const col = parseInt(b.dataset.c!)
      b.onpointerenter = () => ghostAt(me, col)
      b.onpointermove = () => ghostAt(me, col)
      b.onpointerleave = () => ghostAt(me, null)
      b.onclick = () => drop(me, col)
    })
    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __c4: unknown }).__c4 = {
        get grid() { return me.grid.map(r => [...r]) }, get turn() { return me.turn }, get over() { return me.over }, get lock() { return me.lock },
        get solo() { return me.solo }, drop: (col: number) => drop(me, col), ai: (col: number) => aiMove(me.grid, 0, col)
      }
    }
    loadAtlas('animals').then((a: Atlas) => { if (c4 === me) { me.atlas = a; newGame(me) } })
    newGame(me)
    return () => { if (c4 === me) c4 = null; me.over = true }
  }
}
