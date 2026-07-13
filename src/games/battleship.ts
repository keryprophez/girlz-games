import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { sHit, sMoo, sSplash, sWin } from '../core/audio'
import { confetti, fxAt, JUICE } from '../core/fx'
import { useFerme } from '../core/store'

/* Bataille Navale de la Ferme — à DEUX, on se passe la tablette.
   Les animaux se cachent dans le pré (grille 6×6) : une vache (3 cases),
   deux cochons (2 cases), deux canards (1 case). Touché 💥 on rejoue,
   dans l'eau 🌊 on passe la tablette. Retrouve tous les animaux ! */

const N = 6
const FLEET = [
  { emoji: '🐮', name: 'la vache', size: 3, sunk: sMoo },
  { emoji: '🐷', name: 'un cochon', size: 2, sunk: sHit },
  { emoji: '🐷', name: 'un cochon', size: 2, sunk: sHit },
  { emoji: '🦆', name: 'un canard', size: 1, sunk: sHit },
  { emoji: '🦆', name: 'un canard', size: 1, sunk: sHit }
]

interface Ship { emoji: string; name: string; cells: string[]; hits: number; sunk: boolean; sunkSfx: () => void }

let bt: any = null
let ctx: GameContext

function placeFleet(): Ship[] {
  const taken = new Set<string>()
  const ships: Ship[] = []
  for (const f of FLEET) {
    for (let tries = 0; tries < 500; tries++) {
      const horiz = Math.random() < 0.5
      const r = Math.floor(Math.random() * (horiz ? N : N - f.size + 1))
      const c = Math.floor(Math.random() * (horiz ? N - f.size + 1 : N))
      const cells: string[] = []
      for (let k = 0; k < f.size; k++) cells.push(horiz ? r + ':' + (c + k) : (r + k) + ':' + c)
      if (cells.some(x => taken.has(x))) continue
      cells.forEach(x => taken.add(x))
      ships.push({ emoji: f.emoji, name: f.name, cells, hits: 0, sunk: false, sunkSfx: f.sunk })
      break
    }
  }
  return ships
}

function faceHTML(p: any, px = 64): string {
  return p.avatar
    ? `<span class="face-sprite" style="width:${px}px;height:${px}px;background-image:url('${p.avatar}')"></span>`
    : `<span style="font-size:${px * 0.8}px">👧</span>`
}

function showPass() {
  const p = bt.players[bt.turn]
  bt.phase = 'pass'
  $('btBoard').innerHTML = `
    <div class="bt-pass">
      ${faceHTML(p, 84)}
      <div class="bt-pass-txt">Passe la tablette à <b>${p.name}</b> !<br><span class="bt-pass-sub">(sans regarder 🙈)</span></div>
      <button class="bigbtn primary" id="btGo">🔎 C'est parti !</button>
    </div>`
  ;($('btGo') as HTMLButtonElement).onclick = () => { if (bt && bt.running) showPlay() }
}

function fleetStatus(defIdx: number): string {
  return bt.ships[defIdx].map((s: Ship) =>
    `<span class="bt-fleet${s.sunk ? ' found' : ''}">${s.emoji}</span>`).join('')
}

function showPlay() {
  bt.phase = 'play'
  const att = bt.players[bt.turn]
  const def = 1 - bt.turn
  const shots = bt.shots[def]
  $('btBoard').innerHTML = `
    <div class="bt-banner">${faceHTML(att, 40)} <b>${att.name}</b> cherche&nbsp;: <span class="bt-fleetrow">${fleetStatus(def)}</span></div>
    <div class="bt-grid" id="btGrid"></div>`
  const grid = $('btGrid')
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const key = r + ':' + c
    const b = document.createElement('button')
    b.className = 'bt-cell'
    const shot = shots[key]
    if (shot === 'miss') { b.classList.add('miss'); b.textContent = '🌊' }
    if (shot === 'hit') {
      const ship = bt.owner[def][key]
      if (ship.sunk) { b.classList.add('sunk'); b.textContent = ship.emoji }
      else { b.classList.add('hit'); b.textContent = '💥' }
    }
    if (!shot) b.onclick = () => fire(key, b)
    grid.appendChild(b)
  }
}

function fire(key: string, cell: HTMLElement) {
  if (!bt || !bt.running || bt.lock || bt.phase !== 'play') return
  const def = 1 - bt.turn
  const shots = bt.shots[def]
  if (shots[key]) return
  const ship: Ship | undefined = bt.owner[def][key]
  if (ship) {
    shots[key] = 'hit'
    ship.hits++
    cell.classList.add('hit'); cell.textContent = '💥'
    sHit(); fxAt(cell, JUICE.warm, 8)
    if (ship.hits >= ship.cells.length) {
      ship.sunk = true
      setTimeout(() => ship.sunkSfx(), 250)
      // L'animal se révèle sur toutes ses cases
      ship.cells.forEach(k => {
        const idx = parseInt(k.split(':')[0]) * N + parseInt(k.split(':')[1])
        const el = $('btGrid').children[idx] as HTMLElement
        el.classList.remove('hit'); el.classList.add('sunk'); el.textContent = ship.emoji
      })
      ctx.toast(`Trouvé : ${ship.name} ${ship.emoji} !`)
      const banner = document.querySelector('.bt-fleetrow')
      if (banner) banner.innerHTML = fleetStatus(def)
      if (bt.ships[def].every((s: Ship) => s.sunk)) return win()
    }
    // Touché : on rejoue !
  } else {
    shots[key] = 'miss'
    cell.classList.add('miss'); cell.textContent = '🌊'
    sSplash()
    bt.lock = true
    setTimeout(() => {
      if (!bt || !bt.running) return
      bt.lock = false
      bt.turn = 1 - bt.turn
      showPass()
    }, 900)
  }
}

function win() {
  bt.running = false
  const p = bt.players[bt.turn]
  sWin(); confetti()
  setTimeout(() => {
    ctx.finish({
      title: `${p.name} a tout retrouvé !`,
      msg: `Tous les animaux sont rentrés à la ferme — bravo les deux ! 🐮🐷🦆`,
      stars: 3, starsEarned: 2
    })
  }, 1200)
}

export const battleship: GameDef = {
  id: 'battleship', name: 'Cache-Cache Pré', icon: '🐮', sq: 'sq-sky', cat: 'reflexion',
  subtitle: 'À DEUX : retrouve les animaux cachés dans le pré de ta sœur !',
  mount(c) {
    ctx = c
    const profiles = useFerme.getState().profiles
    c.root.innerHTML = `<div id="btBoard"></div>`
    bt = {
      players: [profiles[0], profiles[1] || profiles[0]],
      ships: [placeFleet(), placeFleet()],
      owner: [{}, {}] as Record<string, Ship>[],
      shots: [{}, {}] as Record<string, 'hit' | 'miss'>[],
      turn: 0, lock: false, running: true, phase: 'pass'
    }
    for (const i of [0, 1]) {
      for (const s of bt.ships[i]) for (const k of s.cells) bt.owner[i][k] = s
    }
    showPass()
    return () => { if (bt) { bt.running = false; bt = null } }
  }
}
