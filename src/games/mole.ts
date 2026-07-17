import type { GameContext, GameDef } from '../core/types'
import { $, pick } from '../core/utils'
import { sBonk, sNope, sWin } from '../core/audio'
import { FX, fxAt, JUICE } from '../core/fx'

let mole: any = null
let ctx: GameContext

function popMole() {
  const free = mole.holes.filter((h: any) => !h._busy)
  if (!free.length) return
  const h = pick(free) as any
  const isHedge = Math.random() < mole.cfg.hedge
  h._busy = true; h._isHedge = isHedge; h._whacked = false
  h.querySelector('.peep').textContent = isHedge ? '🦔' : '🐹'
  h.classList.remove('bonk'); void h.offsetWidth
  h.classList.add('up')
  h._hideT = setTimeout(() => {
    h.classList.remove('up')
    setTimeout(() => { h._busy = false }, 180)
  }, mole.cfg.up)
}

function whack(h: any) {
  if (!mole || !mole.running || !h._busy || h._whacked || !h.classList.contains('up')) return
  h._whacked = true; clearTimeout(h._hideT)
  h.classList.remove('up'); h.classList.add('bonk')
  if (h._isHedge) { mole.score = Math.max(0, mole.score - 2); sNope(); ctx.toast('🦔 Aïe, ça pique ! -2') }
  else { mole.score++; sBonk(); fxAt(h, JUICE.warm, 12); FX.floatEl(h, '+1') }
  $('moleScore').textContent = '🔨 ' + mole.score
  setTimeout(() => { h.classList.remove('bonk'); h._busy = false }, 340)
}

function finish() {
  const score = mole ? mole.score : 0
  sWin()
  const th = ctx.byTier([14, 8], [20, 12], [26, 16])
  const stars = score >= th[0] ? 3 : score >= th[1] ? 2 : 1
  ctx.finish({ title: 'Taupes attrapées !', msg: `${ctx.playerName} a tapé ${score} taupes 🐹`, stars, starsEarned: stars })
}

export const moleGame: GameDef = {
  id: 'mole', name: 'La Taupe', icon: '🐹', sq: 'sq-peach', cat: 'action',
  subtitle: 'Tape les taupes, pas les hérissons !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="moleScore">🔨 0</div>
      </div>
      <div class="tbar" style="max-width:470px"><div class="tfill" id="moleTimer"></div></div>
      <div id="moleGrid"></div>`
    const cfg = c.byTier(
      { up: 1050, gap: 750, hedge: 0.12, multi: 0.1 },
      { up: 820, gap: 560, hedge: 0.2, multi: 0.25 },
      { up: 620, gap: 420, hedge: 0.28, multi: 0.4 }
    )
    mole = { score: 0, timeLeft: 30, cfg: { ...cfg }, holes: [], running: true }
    const grid = $('moleGrid')
    grid.innerHTML = ''
    for (let i = 0; i < 9; i++) {
      const b = document.createElement('button') as any
      b.className = 'hole'
      b.innerHTML = `<div class="peep"></div><div class="dirt"></div><div class="pow">💥</div>`
      b._busy = false
      b.onpointerdown = () => whack(b) // pointerdown : zéro latence, aucun tap rapide perdu
      grid.appendChild(b); mole.holes.push(b)
    }
    const timer = setInterval(() => {
      if (!mole || !mole.running) return
      mole.timeLeft--
      $('moleTimer').style.width = (mole.timeLeft / 30) * 100 + '%'
      if (mole.timeLeft === 20 || mole.timeLeft === 10) {
        mole.cfg.up = Math.max(420, mole.cfg.up * 0.8)
        mole.cfg.gap = Math.max(300, mole.cfg.gap * 0.8)
        ctx.toast('Plus vite ! ⚡')
      }
      if (mole.timeLeft <= 0) finish()
    }, 1000)
    const spawner = () => {
      if (!mole || !mole.running) return
      popMole()
      if (Math.random() < mole.cfg.multi) setTimeout(() => { if (mole && mole.running) popMole() }, 120)
      mole.spawnT = setTimeout(spawner, mole.cfg.gap * (0.7 + Math.random() * 0.6))
    }
    spawner()
    return () => {
      if (mole) { mole.running = false; clearTimeout(mole.spawnT); mole = null }
      clearInterval(timer)
    }
  }
}
