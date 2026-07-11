import type { GameContext, GameDef } from '../core/types'
import { $, pick, shuffle } from '../core/utils'
import { sNope, sPop, sWin } from '../core/audio'
import { fxAt, JUICE } from '../core/fx'

const BUB_COLORS = ['#CFE8FB', '#DFF4DE', '#FFE0E4', '#FFEFC8', '#EDE3FD']
let bub: any = null
let ctx: GameContext

function loadRound() {
  const n = bub.rounds[bub.round]
  bub.next = 1
  $('bubRound').textContent = `Manche ${bub.round + 1}/${bub.rounds.length}`
  const area = $('bubArea')
  area.innerHTML = ''
  const W = area.clientWidth, H = area.clientHeight
  const size = Math.max(46, Math.min(64, Math.sqrt((W * H) / n) * 0.42))
  const cols = Math.ceil(Math.sqrt((n * W) / H)), rows = Math.ceil(n / cols)
  const cw = W / cols, ch = H / rows
  const cells = shuffle([...Array(cols * rows).keys()]).slice(0, n)
  const order = shuffle([...Array(n).keys()].map(i => i + 1))
  cells.forEach((cell, idx) => {
    const cx = cell % cols, cy = Math.floor(cell / cols)
    const jx = (Math.random() * 0.5 + 0.25) * (cw - size)
    const jy = (Math.random() * 0.5 + 0.25) * (ch - size)
    const b = document.createElement('button')
    b.className = 'bub'
    b.style.setProperty('--bs', size + 'px')
    b.style.setProperty('--bc', pick(BUB_COLORS))
    b.style.left = Math.min(W - size - 4, Math.max(4, cx * cw + jx)) + 'px'
    b.style.top = Math.min(H - size - 4, Math.max(4, cy * ch + jy)) + 'px'
    b.style.animationDuration = 1.6 + Math.random() * 1.4 + 's'
    b.style.animationDelay = -Math.random() * 2 + 's'
    b.textContent = String(order[idx])
    b.onclick = () => tap(b, order[idx])
    area.appendChild(b)
  })
}

function tap(b: HTMLButtonElement, num: number) {
  if (!bub || !bub.running || b.classList.contains('popping')) return
  if (num === bub.next) {
    b.classList.add('popping'); sPop()
    fxAt(b, JUICE.blue, 12)
    bub.next++
    const n = bub.rounds[bub.round]
    if (bub.next > n) {
      bub.round++
      if (bub.round < bub.rounds.length) {
        ctx.toast('Manche suivante ! 🫧')
        setTimeout(() => bub && bub.running && loadRound(), 600)
      } else finish()
    }
  } else {
    b.classList.remove('wrong'); void b.offsetWidth; b.classList.add('wrong')
    bub.penalties += 1; sNope(); ctx.toast('Pas celle-là ! +1s')
  }
}

function finish() {
  const total = (performance.now() - bub.t0) / 1000 + bub.penalties
  sWin()
  const th = ctx.byTier([26, 38], [40, 56], [50, 70])
  const stars = total <= th[0] ? 3 : total <= th[1] ? 2 : 1
  ctx.finish({ title: 'Toutes éclatées !', msg: `${ctx.playerName} a fini en ${total.toFixed(1)} secondes 🫧`, stars, starsEarned: stars })
}

export const bubbles: GameDef = {
  id: 'bubbles', name: 'Bulles Éclair', icon: '🫧', sq: 'sq-sky', cat: 'action',
  subtitle: 'Éclate les bulles dans l\'ordre : 1, 2, 3…',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="bubRound">Manche 1/3</div>
        <div class="chip" id="bubTime">⏱ 0.0s</div>
      </div>
      <div id="bubArea"></div>`
    bub = {
      rounds: c.byTier([4, 6, 8], [6, 9, 12], [8, 11, 14]), round: 0, penalties: 0,
      t0: performance.now(), running: true, next: 1
    }
    const tick = setInterval(() => {
      if (!bub || !bub.running) return
      const s = (performance.now() - bub.t0) / 1000 + bub.penalties
      $('bubTime').textContent = '⏱ ' + s.toFixed(1) + 's'
    }, 100)
    loadRound()
    return () => {
      if (bub) { bub.running = false; bub = null }
      clearInterval(tick)
    }
  }
}
