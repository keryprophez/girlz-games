import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { sGood, sNope, sPop, sWin } from '../core/audio'
import { confetti } from '../core/fx'
import { useFerme } from '../core/store'

/* Puissance 4 des Sœurs — LE jeu à deux sur la même tablette, au tour par
   tour : chacune joue avec SA tête comme jeton (ou un poussin/une poule
   dessinés si pas de photo). Aligne 4 pour gagner ! */

const COLS = 7, ROWS = 6
const RIMS = ['#FF6B81', '#4FB8E7']

function tokenHTML(avatar: string | null, fallback: string, rim: string): string {
  if (avatar) return `<span class="c4-face" style="background-image:url('${avatar}');border-color:${rim}"></span>`
  return `<span class="c4-face c4-drawn" style="border-color:${rim}">${fallback}</span>`
}
const CHICK = `<svg viewBox="0 0 40 40" width="100%" height="100%"><circle cx="20" cy="20" r="19" fill="#FFD44D"/>
  <circle cx="14" cy="16" r="2.6" fill="#45362A"/><circle cx="26" cy="16" r="2.6" fill="#45362A"/>
  <path d="M16,24 L24,24 L20,29 Z" fill="#FFA94D"/></svg>`
const HEN = `<svg viewBox="0 0 40 40" width="100%" height="100%"><circle cx="20" cy="21" r="18" fill="#FFF6E8"/>
  <path d="M13,8 Q15,2 18,7 Q20,1 23,7 Q25,2 27,8" fill="#FF6B81"/>
  <circle cx="14" cy="17" r="2.6" fill="#45362A"/><circle cx="26" cy="17" r="2.6" fill="#45362A"/>
  <path d="M16,25 L24,25 L20,30 Z" fill="#FFA94D"/></svg>`

let c4: any = null
let ctx: GameContext

function updateTurnBanner() {
  const p = c4.players[c4.turn]
  $('c4Turn').innerHTML = `${tokenHTML(p.avatar, c4.turn === 0 ? CHICK : HEN, RIMS[c4.turn])}
    <span>Au tour de <b>${p.name}</b></span>`
}

function winLine(g: number[][], player: number): [number, number][] | null {
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

function drop(col: number) {
  if (!c4 || !c4.running || c4.lock) return
  let row = -1
  for (let r = ROWS - 1; r >= 0; r--) if (c4.grid[r][col] === -1) { row = r; break }
  if (row === -1) { sNope(); return }
  c4.lock = true
  c4.grid[row][col] = c4.turn
  const p = c4.players[c4.turn]
  const tok = document.createElement('div')
  tok.className = 'c4-token'
  tok.innerHTML = tokenHTML(p.avatar, c4.turn === 0 ? CHICK : HEN, RIMS[c4.turn])
  tok.style.width = c4.cell + 'px'
  tok.style.height = c4.cell + 'px'
  tok.style.left = c4.pad + col * c4.cell + 'px'
  tok.style.top = '-' + c4.cell + 'px'
  $('c4Board').appendChild(tok)
  // La gravité : le jeton tombe jusqu'à sa case
  requestAnimationFrame(() => { tok.style.top = c4.pad + row * c4.cell + 'px' })
  sPop()
  setTimeout(() => {
    if (!c4 || !c4.running) return
    const line = winLine(c4.grid, c4.turn)
    if (line) {
      c4.running = false
      sGood(); confetti()
      // Les 4 jetons gagnants scintillent
      tok.classList.add('c4-win')
      $('c4Turn').innerHTML = `🏆 <b>${p.name}</b> gagne !`
      setTimeout(() => {
        ctx.finish({
          title: `${p.name} gagne !`,
          msg: `Quatre à la suite — bravo les deux ! 🔴🟡`,
          stars: 3, starsEarned: 2
        })
      }, 1400)
      return
    }
    if (c4.grid.every((r: number[]) => r.every(v => v !== -1))) {
      c4.running = false
      $('c4Turn').innerHTML = '🤝 Égalité !'
      setTimeout(() => {
        ctx.finish({ title: 'Égalité parfaite !', msg: 'La grille est pleine, match nul 🤝', stars: 2, starsEarned: 2 })
      }, 1200)
      return
    }
    c4.turn = 1 - c4.turn
    c4.lock = false
    updateTurnBanner()
  }, 420)
}

export const connect4: GameDef = {
  id: 'connect4', name: 'Puissance 4', icon: '🔴', sq: 'sq-sun', cat: 'reflexion',
  subtitle: 'À DEUX, chacune son tour : aligne 4 têtes pour gagner !',
  mount(c) {
    ctx = c
    const profiles = useFerme.getState().profiles
    const boardW = Math.min(420, window.innerWidth - 40)
    const pad = 10
    const cell = (boardW - pad * 2) / COLS
    const boardH = pad * 2 + cell * ROWS
    c.root.innerHTML = `
      <div class="c4-banner" id="c4Turn"></div>
      <div id="c4Board" style="width:${boardW}px;height:${boardH}px">
        ${Array.from({ length: ROWS * COLS }, (_, i) => {
          const r = Math.floor(i / COLS), col = i % COLS
          return `<div class="c4-hole" style="width:${cell}px;height:${cell}px;left:${pad + col * cell}px;top:${pad + r * cell}px"></div>`
        }).join('')}
        ${Array.from({ length: COLS }, (_, col) =>
          `<button class="c4-col" data-c="${col}" style="width:${cell}px;left:${pad + col * cell}px;height:${boardH}px"></button>`).join('')}
      </div>`
    c4 = {
      players: [profiles[0], profiles[1] || profiles[0]],
      grid: Array.from({ length: ROWS }, () => Array(COLS).fill(-1)),
      turn: 0, lock: false, running: true, cell, pad
    }
    document.querySelectorAll<HTMLElement>('.c4-col').forEach(b => {
      b.onclick = () => drop(parseInt(b.dataset.c!))
    })
    updateTurnBanner()
    return () => { if (c4) { c4.running = false; c4 = null } }
  }
}
