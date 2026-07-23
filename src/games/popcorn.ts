import type { GameContext, GameDef } from '../core/types'
import { $, rnd } from '../core/utils'
import { sNope, sPopReal as sPop, sPower, sWin, tone } from '../core/audio'
import { FX, JUICE } from '../core/fx'

/* Pop-corn ! — des grains de maïs chauffent : quand un grain tremble,
   tape dessus et il ÉCLATE en pop-corn qui saute dans le carton. */

function kernelSVG(px: number): string {
  return `<svg viewBox="0 0 40 44" width="${px}" height="${px * 1.1}">
    <path d="M20,4 C30,10 34,22 32,32 Q30,40 20,40 Q10,40 8,32 C6,22 10,10 20,4 Z"
      fill="#F5C518" stroke="#D9A32A" stroke-width="2.5"/>
    <path d="M15,12 Q13,22 15,30" fill="none" stroke="#FFE08A" stroke-width="3" stroke-linecap="round"/>
  </svg>`
}
function popcornSVG(px: number): string {
  return `<svg viewBox="0 0 48 46" width="${px}" height="${px}">
    <g fill="#FFFBF2" stroke="#D9C7A8" stroke-width="2">
      <circle cx="16" cy="18" r="11"/><circle cx="32" cy="16" r="10"/>
      <circle cx="24" cy="28" r="12"/><circle cx="12" cy="30" r="8"/><circle cx="36" cy="29" r="8"/>
    </g>
    <circle cx="20" cy="22" r="3" fill="#FFE9C7"/><circle cx="30" cy="24" r="3" fill="#FFE9C7"/>
  </svg>`
}

let pc: any = null
let ctx: GameContext

function spawnKernel() {
  if (!pc || !pc.running) return
  const area = pc.area
  const W = area.clientWidth, H = area.clientHeight
  const px = 44
  const el = document.createElement('button')
  el.className = 'pc-kernel'
  el.innerHTML = kernelSVG(px)
  el.style.left = 8 + Math.random() * (W - px - 16) + 'px'
  el.style.top = 44 + Math.random() * (H - px * 1.1 - 130) + 'px'
  area.appendChild(el)
  const k: any = { el, state: 'idle' }
  pc.kernels.push(k)
  // Le grain chauffe... puis est prêt à éclater (il tremble)
  k.readyT = setTimeout(() => {
    if (!pc || !pc.running || k.state !== 'idle') return
    k.state = 'ready'
    el.classList.add('ready')
    tone(620, 0.06, 'triangle', 0.08)
    // Trop tard : le grain a brûlé, il disparaît (sans punition)
    k.burnT = setTimeout(() => {
      if (!pc || !pc.running || k.state !== 'ready') return
      k.state = 'gone'
      el.classList.add('burnt')
      setTimeout(() => el.remove(), 500)
    }, pc.cfg.window)
  }, rnd(400, pc.cfg.heat))
  el.onpointerdown = () => tapKernel(k) // pointerdown : zéro latence, aucun tap rapide perdu
}

function tapKernel(k: any) {
  if (!pc || !pc.running || k.state === 'gone') return
  if (k.state === 'idle') {
    // Pas encore chaud : petit "toc", le grain se dandine
    k.el.classList.remove('nope'); void k.el.offsetWidth; k.el.classList.add('nope')
    sNope()
    return
  }
  k.state = 'gone'
  clearTimeout(k.burnT)
  pc.score++
  pc.streak++
  sPop()
  // L'éclatement : le grain devient pop-corn et saute dans le carton
  const el = k.el
  el.classList.remove('ready')
  el.innerHTML = popcornSVG(46)
  el.classList.add('popped')
  const r = el.getBoundingClientRect()
  FX.burst(r.left + r.width / 2, r.top + r.height / 2, { colors: ['#FFFBF2', '#FFE08A', '#F5C518'], count: 12 })
  const box = $('pcBox').getBoundingClientRect()
  const ar = pc.area.getBoundingClientRect()
  el.style.left = box.left - ar.left + box.width / 2 - 20 + rnd(-16, 16) + 'px'
  el.style.top = box.top - ar.top + 6 + 'px'
  setTimeout(() => el.remove(), 650)
  if (pc.streak % 8 === 0) { sPower(); ctx.toast('🍿 Quelle rafale !') }
  $('pcScore').textContent = '🍿 ' + pc.score
}

function finish() {
  const score = pc ? pc.score : 0
  sWin()
  const th = ctx.byTier([20, 12], [28, 18], [36, 24])
  const stars = score >= th[0] ? 3 : score >= th[1] ? 2 : 1
  ctx.finish({
    title: 'Le carton est plein !',
    msg: `${ctx.playerName} a fait éclater ${score} pop-corns 🍿`,
    stars, starsEarned: stars
  })
}

export const popcorn: GameDef = {
  id: 'popcorn', name: 'Pop-corn !', icon: '🍿', sq: 'sq-sun', cat: 'action', music: 'fair',
  subtitle: 'Quand un grain tremble, tape dessus : POP !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="pcScore">🍿 0</div>
      </div>
      <div class="tbar" style="max-width:540px"><div class="tfill" id="pcTimer"></div></div>
      <div id="pcArea">
        <div class="hint">Tape les grains qui tremblent !</div>
        <div id="pcBox">
          <svg viewBox="0 0 90 70" width="86" height="66">
            <path d="M10,8 L80,8 L74,66 L16,66 Z" fill="#fff" stroke="#E04E63" stroke-width="3"/>
            <path d="M22,8 L24,66 M36,8 L37,66 M52,8 L51,66 M66,8 L64,66" stroke="#FF6B81" stroke-width="7"/>
            <text x="45" y="45" text-anchor="middle" font-family="Baloo 2" font-weight="800" font-size="20" fill="#45362A">POP</text>
          </svg>
        </div>
      </div>`
    const cfg = c.byTier(
      { heat: 2600, window: 2600, spawn: 950, timeLeft: 45 },
      { heat: 2000, window: 1800, spawn: 750, timeLeft: 45 },
      { heat: 1500, window: 1200, spawn: 560, timeLeft: 45 }
    )
    pc = { area: $('pcArea'), cfg, kernels: [], score: 0, streak: 0, timeLeft: cfg.timeLeft, running: true }
    const spawner = setInterval(spawnKernel, cfg.spawn)
    spawnKernel(); spawnKernel()
    const timer = setInterval(() => {
      if (!pc || !pc.running) return
      pc.timeLeft--
      $('pcTimer').style.width = (pc.timeLeft / cfg.timeLeft) * 100 + '%'
      if (pc.timeLeft <= 0) finish()
    }, 1000)
    return () => {
      if (pc) {
        pc.running = false
        pc.kernels.forEach((k: any) => { clearTimeout(k.readyT); clearTimeout(k.burnT); k.el.remove() })
        pc = null
      }
      clearInterval(spawner)
      clearInterval(timer)
    }
  }
}
