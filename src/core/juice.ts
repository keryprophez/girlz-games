/* Moteur de « juice » — ressorts, transitions de scène et secousses.
   Zéro dépendance : c'est la boîte à outils commune du game-feel. */

/** Valeur animée par ressort amorti : cb reçoit la valeur à chaque frame.
    Renvoie une fonction d'annulation. */
export function spring(
  from: number, to: number, cb: (v: number) => void,
  opts: { stiffness?: number; damping?: number; onDone?: () => void } = {}
) {
  const k = opts.stiffness ?? 170, d = opts.damping ?? 14
  let v = 0, x = from, raf = 0, last = performance.now()
  const step = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    v += (-k * (x - to) - d * v) * dt
    x += v * dt
    if (Math.abs(x - to) < 0.05 && Math.abs(v) < 0.5) { cb(to); opts.onDone?.(); return }
    cb(x)
    raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}

/** Transition en iris : un cercle s'ouvre depuis le centre et révèle la scène. */
export function iris(ms = 520) {
  const el = document.createElement('div')
  el.className = 'jc-iris'
  el.style.transitionDuration = ms + 'ms'
  document.body.appendChild(el)
  // double rAF : laisse le navigateur peindre l'état fermé d'abord
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')))
  setTimeout(() => el.remove(), ms + 120)
}

/** Secousse rapide d'un élément (impact, erreur, explosion). */
export function shake(el: Element, px = 6, ms = 280) {
  try {
    el.animate([
      { transform: 'translate(0,0)' },
      { transform: `translate(${px}px,${-px * 0.5}px)` },
      { transform: `translate(${-px}px,${px * 0.5}px)` },
      { transform: `translate(${px * 0.5}px,0)` },
      { transform: 'translate(0,0)' }
    ], { duration: ms, easing: 'ease-out' })
  } catch { /* vieux navigateur : pas de secousse */ }
}
