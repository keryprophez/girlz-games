import type { GameContext, GameDef } from '../core/types'
import { $, pick, rnd } from '../core/utils'
import { sNope, sPower, sSlice, sWin } from '../core/audio'
import { FX } from '../core/fx'

const NJ_FRUITS: [string, string][] = [['🍉', '#FF6B81'], ['🍎', '#FF8787'], ['🍊', '#FFA94D'], ['🍋', '#FFE066'], ['🍇', '#B197FC'], ['🍓', '#FF8FA3'], ['🥝', '#94D82D'], ['🍑', '#FFC9C9']]

let nj: any = null
let ctx: GameContext

function updateScore() { $('njScore').textContent = '🥷 ' + nj.score }
function updateBlade() {
  const pts = nj.bladePoints.map((p: any) => p.x + ',' + p.y).join(' ')
  const l1 = document.getElementById('njLine')
  const l2 = document.getElementById('njLine2')
  if (l1) l1.setAttribute('points', pts)
  if (l2) l2.setAttribute('points', pts)
}

function spawnWave() {
  const n = rnd(nj.cfg.min, nj.cfg.max)
  for (let i = 0; i < n; i++) {
    const bad = Math.random() < nj.cfg.hedge
    const [emoji, color] = bad ? ['🦔', '#8A7A6B'] : pick(NJ_FRUITS)
    const x = nj.W * (0.12 + Math.random() * 0.76)
    const peak = nj.H * (0.5 + Math.random() * 0.3)
    const g = 0.0016
    const el = document.createElement('div')
    el.className = 'nj-fruit'; el.textContent = emoji
    nj.area.appendChild(el)
    nj.fruits.push({
      el, emoji, color, bad, x, y: nj.H + 30,
      vx: ((nj.W / 2 - x) / nj.W) * 0.16 + (Math.random() - 0.5) * 0.1,
      vy: -Math.sqrt(2 * g * peak), g, r: 28, rot: Math.random() * 60, vr: (Math.random() - 0.5) * 0.4,
      sliced: false, half: false
    })
  }
}

function sliceCheck(a: any, b: any) {
  if (!nj) return
  for (const f of nj.fruits) {
    if (f.sliced) continue
    const dx = b.x - a.x, dy = b.y - a.y
    const len2 = dx * dx + dy * dy || 1
    let t = ((f.x - a.x) * dx + (f.y - a.y) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    const px = a.x + t * dx, py = a.y + t * dy
    if ((f.x - px) ** 2 + (f.y - py) ** 2 < f.r * f.r * 2.2) {
      f.sliced = true
      if (f.bad) {
        nj.score = Math.max(0, nj.score - 3); sNope(); FX.shake(8)
        $('njFlash').classList.add('on')
        setTimeout(() => $('njFlash')?.classList.remove('on'), 200)
        njFloat(f.x, f.y - 20, 'Aïe ! -3', '#FF7B6B')
      } else {
        nj.score++; nj.swipeHits++; sSlice()
        njSplash(f.x, f.y, f.color)
        njFloat(f.x, f.y - 20, '+1', '#fff')
        // Deux VRAIES moitiés : le fruit est coupé le long du trait de sabre
        const sliceDeg = (Math.atan2(dy, dx) * 180) / Math.PI
        for (const s of [-1, 1]) {
          const hel = document.createElement('div')
          hel.className = 'nj-fruit half'
          // Le fruit est tourné pour aligner la coupe, puis on n'affiche qu'une moitié
          hel.innerHTML = `<span class="nj-halfclip" style="transform:rotate(${sliceDeg}deg);clip-path:inset(${s === -1 ? '0 0 50% 0' : '50% 0 0 0'})">${f.emoji}</span>`
          nj.area.appendChild(hel)
          const ang = Math.atan2(dy, dx) + Math.PI / 2
          nj.fruits.push({
            el: hel, emoji: f.emoji, color: f.color, bad: false, half: true, sliced: true,
            x: f.x, y: f.y, vx: f.vx + Math.cos(ang) * 0.14 * s, vy: f.vy + Math.sin(ang) * 0.14 * s - 0.06,
            g: f.g, r: 20, rot: f.rot, vr: 0.45 * s
          })
        }
      }
      f.el.remove(); updateScore()
    }
  }
  nj.fruits = nj.fruits.filter((f: any) => !f.sliced || f.half)
}

function njSplash(x: number, y: number, color: string) {
  for (let i = 0; i < 8; i++) {
    const d = document.createElement('div')
    d.className = 'nj-splash'
    d.style.background = color
    d.style.left = x + 'px'; d.style.top = y + 'px'
    nj.area.appendChild(d)
    const ang = Math.random() * Math.PI * 2, v = 2 + Math.random() * 3
    let vx = Math.cos(ang) * v, vy = Math.sin(ang) * v - 1.5, life = 1, px = x, py = y
    ;(function tick() {
      life -= 0.045; vy += 0.12; px += vx; py += vy
      if (life <= 0 || !nj) { d.remove(); return }
      d.style.transform = `translate(${px - x}px,${py - y}px) scale(${life})`
      d.style.opacity = String(life)
      requestAnimationFrame(tick)
    })()
  }
}

function njFloat(x: number, y: number, txt: string, color?: string) {
  const d = document.createElement('div')
  d.className = 'nj-pts'; d.textContent = txt
  d.style.left = x + 'px'; d.style.top = y + 'px'; d.style.color = color || '#fff'
  nj.area.appendChild(d)
  setTimeout(() => d.remove(), 650)
}

function loop(t: number) {
  if (!nj || !nj.running) return
  const dt = Math.min(40, t - nj.lastT); nj.lastT = t
  nj.since += dt
  if (nj.since >= nj.cfg.spawn) { nj.since = 0; spawnWave() }
  for (let i = nj.fruits.length - 1; i >= 0; i--) {
    const f = nj.fruits[i]
    f.x += f.vx * dt; f.y += f.vy * dt; f.vy += f.g * dt; f.rot += f.vr * dt * 0.05
    if (f.y > nj.H + 70) { f.el.remove(); nj.fruits.splice(i, 1); continue }
    f.el.style.transform = `translate(${f.x - 26}px,${f.y - 26}px) rotate(${f.rot}deg)`
  }
  requestAnimationFrame(loop)
}

function finish() {
  const score = nj ? nj.score : 0
  sWin()
  const th = ctx.byTier([18, 10], [26, 16], [34, 22])
  const stars = score >= th[0] ? 3 : score >= th[1] ? 2 : 1
  ctx.finish({ title: 'Sabre rangé !', msg: `${ctx.playerName} a marqué ${score} points 🥷`, stars, starsEarned: stars })
}

export const ninja: GameDef = {
  id: 'ninja', name: 'Ninja Verger', icon: '🥷', sq: 'sq-pink', cat: 'action',
  subtitle: 'Tranche les fruits d\'un geste — évite le hérisson !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="njScore">🥷 0</div>
        <div class="chip" id="njBest">Combo ×1</div>
      </div>
      <div class="tbar" style="max-width:560px"><div class="tfill" id="njTimer"></div></div>
      <div id="njArea" class="arena nj-arena">
        <div class="nj-blade" id="njBlade"></div>
        <div class="nj-flash" id="njFlash"></div>
      </div>`
    const area = $('njArea')
    const W = area.clientWidth || 400, H = area.clientHeight || 360
    const cfg = c.byTier(
      { spawn: 1500, min: 1, max: 2, hedge: 0.10 },
      { spawn: 1200, min: 1, max: 3, hedge: 0.16 },
      { spawn: 950, min: 2, max: 4, hedge: 0.22 }
    )
    nj = {
      area, W, H, cfg, fruits: [], score: 0, bestCombo: 1, timeLeft: 60, running: true,
      lastT: performance.now(), since: 900, down: false, swipeHits: 0, lastPt: null,
      bladePoints: []
    }
    $('njBlade').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg"><polyline id="njLine" fill="none" stroke="rgba(79,184,231,.5)" stroke-width="10" stroke-linecap="round"/><polyline id="njLine2" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="3" stroke-linecap="round"/></svg>'
    const pos = (e: any) => {
      const r = area.getBoundingClientRect()
      const cx = e.touches ? e.touches[0].clientX : e.clientX
      const cy = e.touches ? e.touches[0].clientY : e.clientY
      return { x: cx - r.left, y: cy - r.top }
    }
    const pd = (e: any) => {
      e.preventDefault(); if (!nj || !nj.running) return
      nj.down = true; nj.swipeHits = 0; nj.bladePoints = []
      nj.lastPt = pos(e)
      nj.bladePoints.push(nj.lastPt)
    }
    const pm = (e: any) => {
      if (!nj || !nj.down || !nj.running) return
      const p = pos(e)
      nj.bladePoints.push(p)
      if (nj.bladePoints.length > 20) nj.bladePoints.shift()
      updateBlade()
      sliceCheck(nj.lastPt, p)
      nj.lastPt = p
    }
    const pu = () => {
      if (!nj) return
      nj.down = false; nj.bladePoints = []; updateBlade()
      if (nj.swipeHits >= 3) {
        nj.score += nj.swipeHits
        if (nj.swipeHits > nj.bestCombo) {
          nj.bestCombo = nj.swipeHits
          $('njBest').textContent = 'Combo ×' + nj.bestCombo
        }
        njFloat(nj.W / 2, nj.H * 0.3, 'COMBO ×' + nj.swipeHits + ' !', '#FF7B6B')
        sPower(); updateScore()
      }
    }
    const tm = (e: TouchEvent) => { e.preventDefault(); pm(e) }
    area.addEventListener('pointerdown', pd)
    area.addEventListener('pointermove', pm)
    area.addEventListener('pointerup', pu)
    area.addEventListener('pointerleave', pu)
    area.addEventListener('touchmove', tm, { passive: false })
    const timer = setInterval(() => {
      if (!nj || !nj.running) return
      nj.timeLeft--
      $('njTimer').style.width = (nj.timeLeft / 60) * 100 + '%'
      if (nj.timeLeft <= 0) finish()
    }, 1000)
    requestAnimationFrame(loop)
    return () => {
      if (nj) { nj.running = false; nj.fruits.forEach((f: any) => f.el && f.el.remove()); nj = null }
      clearInterval(timer)
      area.removeEventListener('pointerdown', pd)
      area.removeEventListener('pointermove', pm)
      area.removeEventListener('pointerup', pu)
      area.removeEventListener('pointerleave', pu)
      area.removeEventListener('touchmove', tm)
    }
  }
}
