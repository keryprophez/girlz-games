import { tone } from './audio'

/* Moteur de particules en divs positionnées — pas de canvas nécessaire. */
export const JUICE = {
  warm: ['#FFB84D', '#FF9C8F', '#FFE08A', '#FF7B6B'],
  green: ['#5EC97B', '#8CE99A', '#B8F0C5'],
  blue: ['#4FB8E7', '#8CC9F5', '#B7E3FB'],
  pink: ['#F58FB8', '#FFC2D6', '#FF9CB1'],
  mix: ['#FFB84D', '#5EC97B', '#4FB8E7', '#F58FB8', '#FFE08A', '#B197FC']
}

export const FX = {
  burst(x: number, y: number, o: { colors?: string[]; count?: number; speed?: number } = {}) {
    const { colors = ['#FFB84D'], count = 12 } = o
    for (let i = 0; i < count; i++) {
      const d = document.createElement('div')
      d.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${4 + Math.random() * 5}px;height:${4 + Math.random() * 5}px;
        border-radius:50%;background:${colors[(Math.random() * colors.length) | 0]};pointer-events:none;z-index:60;opacity:1;`
      document.body.appendChild(d)
      const ang = Math.random() * Math.PI * 2
      const v = 2.5 + Math.random() * 3
      const vx = Math.cos(ang) * v
      let vvy = Math.sin(ang) * v - 2
      let life = 1, px = x, py = y
      ;(function tick() {
        life -= 0.04; vvy += 0.12; px += vx; py += vvy
        if (life <= 0) { d.remove(); return }
        d.style.left = px + 'px'; d.style.top = py + 'px'; d.style.opacity = String(life)
        requestAnimationFrame(tick)
      })()
    }
  },
  float(x: number, y: number, txt: string, c?: string) {
    const d = document.createElement('div')
    d.textContent = txt
    d.style.cssText = `position:fixed;left:${x}px;top:${y}px;font:800 20px 'Baloo 2',sans-serif;
      color:${c || '#45362A'};text-shadow:0 1px 3px rgba(255,255,255,.9);pointer-events:none;z-index:61;transform:translate(-50%,0);`
    document.body.appendChild(d)
    let life = 1, py = y
    ;(function tick() {
      life -= 0.025; py -= 1
      if (life <= 0) { d.remove(); return }
      d.style.top = py + 'px'; d.style.opacity = String(life)
      requestAnimationFrame(tick)
    })()
  },
  floatEl(el: Element, txt: string, c?: string) {
    const r = el.getBoundingClientRect()
    FX.float(r.left + r.width / 2, r.top + 6, txt, c)
  },
  fireworks() {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        FX.burst(innerWidth * (0.15 + Math.random() * 0.7), innerHeight * (0.15 + Math.random() * 0.35),
          { colors: JUICE.mix, count: 18 })
        tone(600 + Math.random() * 500, 0.12, 'triangle', 0.08)
      }, i * 200)
    }
  },
  shake(power = 6) {
    const app = document.getElementById('root')
    if (!app) return
    const t0 = performance.now()
    ;(function s() {
      const t = performance.now() - t0
      if (t > 300) { app.style.transform = ''; return }
      const k = power * (1 - t / 300)
      app.style.transform = `translate(${(Math.random() - 0.5) * k}px,${(Math.random() - 0.5) * k}px)`
      requestAnimationFrame(s)
    })()
  }
}

export function fxAt(el: Element, colors: string[], count?: number) {
  const r = el.getBoundingClientRect()
  FX.burst(r.left + r.width / 2, r.top + r.height / 2, { colors, count: count || 12 })
}

export function confetti() {
  const chars = ['🎉', '⭐', '🌟', '🎊', '🐔', '🥕', '🌈', '🦋']
  for (let i = 0; i < 26; i++) {
    const c = document.createElement('div')
    c.className = 'confetti'
    c.textContent = chars[(Math.random() * chars.length) | 0]
    c.style.left = Math.random() * 100 + 'vw'
    c.style.animationDuration = 1.8 + Math.random() * 1.7 + 's'
    c.style.animationDelay = Math.random() * 0.5 + 's'
    document.body.appendChild(c)
    setTimeout(() => c.remove(), 3800)
  }
}
