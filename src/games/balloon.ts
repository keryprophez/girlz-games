import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { sBoomReal, sWin, tone } from '../core/audio'
import { FX } from '../core/fx'

/* Gonfle le Ballon ! — tapote le plus vite possible : le ballon gonfle,
   tremble de plus en plus… BOUM ! Il se dégonfle doucement si on s'arrête,
   alors il faut pomper sans relâche. 3 ballons, au chrono. */

const COLORS = [
  ['#FF6B81', '#E04E63'],
  ['#4FB8E7', '#3391BF'],
  ['#F5C518', '#D9A32A'],
  ['#B197FC', '#8F74E0'],
  ['#5EC97B', '#3FA35C']
]

function balloonSVG(c: string, cd: string): string {
  return `<svg viewBox="0 0 200 260" width="200" height="260">
    <defs><radialGradient id="blg" cx="36%" cy="30%" r="80%">
      <stop offset="0" stop-color="#fff" stop-opacity=".55"/>
      <stop offset="35%" stop-color="${c}"/>
      <stop offset="100%" stop-color="${cd}"/>
    </radialGradient></defs>
    <path d="M100,238 Q86,252 100,258 Q114,252 100,238" fill="none" stroke="#8A7A6B" stroke-width="2.5"/>
    <path d="M92,222 L108,222 L102,236 L98,236 Z" fill="${cd}"/>
    <ellipse cx="100" cy="120" rx="86" ry="104" fill="url(#blg)"/>
    <ellipse cx="68" cy="72" rx="22" ry="34" fill="#fff" opacity=".4" transform="rotate(-18 68 72)"/>
  </svg>`
}

let bl: any = null
let ctx: GameContext

function sPump(k: number) { tone(220 + k * 4, 0.06, 'triangle', 0.14) }
const sBoom = sBoomReal

function loadBalloon() {
  const [c, cd] = COLORS[bl.round % COLORS.length]
  bl.size = 12
  bl.popped = false
  // Chaque ballon est plus dur : plus épais, il fuit plus vite
  bl.leak = 0.004 + bl.round * 0.0022
  $('blRound').textContent = `Ballon ${bl.round + 1}/${bl.goal}`
  const holder = $('blBalloon')
  holder.innerHTML = balloonSVG(c, cd)
  holder.className = 'bl-balloon'
  render()
}

function render() {
  const holder = $('blBalloon')
  const s = 0.22 + (bl.size / 100) * 1.05
  holder.style.transform = `translateX(-50%) scale(${s})`
  holder.classList.toggle('strain', bl.size > 72 && !bl.popped)
  $('blFill').style.width = Math.min(100, bl.size) + '%'
}

function pump() {
  if (!bl || !bl.running || bl.popped) return
  bl.size += bl.pump
  sPump(bl.size)
  const holder = $('blBalloon')
  holder.classList.remove('puff'); void holder.offsetWidth; holder.classList.add('puff')
  if (bl.size >= 100) return pop()
  render()
}

function pop() {
  bl.popped = true
  sBoom()
  const holder = $('blBalloon')
  const r = holder.getBoundingClientRect()
  FX.burst(r.left + r.width / 2, r.top + r.height / 2, {
    colors: [COLORS[bl.round % COLORS.length][0], '#fff', '#FFE08A'], count: 34
  })
  FX.shake(12)
  holder.innerHTML = ''
  $('blFill').style.width = '0%'
  ctx.toast('💥 BOUM !')
  bl.round++
  if (bl.round < bl.goal) {
    // Zéro temps mort : le ballon suivant arrive tout de suite
    setTimeout(() => bl && bl.running && loadBalloon(), 380)
  } else {
    setTimeout(() => bl && bl.running && finish(false), 500)
  }
}

function finish(timeout: boolean) {
  if (!bl || !bl.running) return
  bl.running = false
  const done = bl.round
  sWin()
  const stars = timeout ? (done >= bl.goal - 1 ? 2 : 1) : 3
  ctx.finish({
    title: timeout ? 'Le temps est écoulé ! ⏱' : 'Tous explosés ! 🎈',
    msg: timeout
      ? `${ctx.playerName} a fait péter ${done} ballon${done > 1 ? 's' : ''} sur ${bl.goal}`
      : `${ctx.playerName} a fait péter les ${bl.goal} ballons 🎉`,
    stars: stars as 1 | 2 | 3, starsEarned: stars
  })
}

export const balloon: GameDef = {
  id: 'balloon', name: 'Gonfle !', icon: '🎈', sq: 'sq-pink', cat: 'action',
  subtitle: 'Tapote à toute vitesse pour gonfler le ballon… jusqu\'au BOUM !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="blRound">Ballon 1/3</div>
        <div class="chip" id="blTime">⏱ 30s</div>
      </div>
      <div class="tbar" style="max-width:420px"><div class="tfill" id="blFill" style="width:0%"></div></div>
      <div id="blArea">
        <div class="hint">Tapote vite, il se dégonfle si tu t'arrêtes !</div>
        <div class="bl-balloon" id="blBalloon"></div>
      </div>`
    // Un chrono : sans lui, la partie ne peut pas se perdre et le BOUM ne vaut rien
    bl = {
      round: 0, size: 12, popped: false, running: true, leak: 0.004,
      goal: c.byTier(3, 4, 5),
      limit: c.byTier(34, 32, 30),
      pump: c.byTier(4.6, 3.7, 3.1),
      t0: performance.now(), lastT: performance.now()
    }
    const area = $('blArea')
    const onTap = (e: Event) => { e.preventDefault(); pump() }
    area.addEventListener('pointerdown', onTap)
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); pump() } }
    window.addEventListener('keydown', onKey)
    // Fuite d'air + chrono
    const raf = () => {
      if (!bl || !bl.running) return
      const now = performance.now()
      const dt = Math.min(60, now - bl.lastT)
      bl.lastT = now
      if (!bl.popped && bl.size > 12) {
        bl.size = Math.max(12, bl.size - dt * bl.leak)
        render()
      }
      const left = bl.limit - (now - bl.t0) / 1000
      const chip = $('blTime')
      chip.textContent = '⏱ ' + Math.max(0, left).toFixed(0) + 's'
      chip.classList.toggle('urgent', left <= 8)
      // finish() démonte le jeu : toujours sortir de la boucle juste après
      if (left <= 0) { finish(true); return }
      requestAnimationFrame(raf)
    }
    loadBalloon()
    requestAnimationFrame(raf)
    return () => {
      if (bl) { bl.running = false; bl = null }
      area.removeEventListener('pointerdown', onTap)
      window.removeEventListener('keydown', onKey)
    }
  }
}
