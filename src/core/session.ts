/* Cycle de vie d'une partie — deux choses que chaque jeu réinventait mal :

   1. LA PAUSE. Un seul interrupteur global : onglet en arrière-plan, minuteur
      parental, ou bouton pause. Le socle 3D fige sa boucle dessus, GameHost
      coupe la musique et pose un voile, les timers de partie se suspendent.

   2. LES TIMERS DE PARTIE. `setTimeout` survit au démontage : si on quitte et
      qu'on relance en moins d'une seconde, le vieux timer pilote la nouvelle
      partie (crash vécu dans piano.ts). Une `Session` porte tous les timers
      d'une partie : ils sont annulés d'un bloc au démontage et suspendus
      pendant la pause. Les jeux y accèdent par `ctx.after` / `ctx.every`. */

/* ---------- Pause globale ---------- */
let paused = false
const listeners = new Set<(p: boolean) => void>()

export function isPaused() { return paused }

export function setPaused(p: boolean) {
  if (paused === p) return
  paused = p
  listeners.forEach(fn => { try { fn(p) } catch (e) { console.error(e) } })
}

/** Abonne une réaction à la pause ; renvoie le désabonnement. */
export function onPause(fn: (p: boolean) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/* ---------- Timers d'une partie ---------- */
interface Pending {
  fn: () => void
  /** Temps restant quand on suspend, délai complet sinon. */
  left: number
  /** Période pour `every`, 0 pour `after`. */
  period: number
  started: number
  handle: number
}

export class Session {
  private alive = true
  private timers = new Map<number, Pending>()
  private seq = 0
  private unsub: () => void

  constructor() {
    this.unsub = onPause(p => (p ? this.suspend() : this.resume()))
  }

  get running() { return this.alive }

  /** Comme setTimeout, mais annulé au démontage et suspendu en pause. */
  after(ms: number, fn: () => void): number {
    return this.arm({ fn, left: ms, period: 0, started: 0, handle: 0 })
  }

  /** Comme setInterval, même garanties. */
  every(ms: number, fn: () => void): number {
    return this.arm({ fn, left: ms, period: ms, started: 0, handle: 0 })
  }

  cancel(id: number) {
    const t = this.timers.get(id)
    if (!t) return
    clearTimeout(t.handle)
    this.timers.delete(id)
  }

  /** Fin de partie : plus aucun timer ne tirera. Idempotent. */
  end() {
    this.alive = false
    this.timers.forEach(t => clearTimeout(t.handle))
    this.timers.clear()
    this.unsub()
  }

  private arm(t: Pending): number {
    if (!this.alive) return -1
    const id = ++this.seq
    this.timers.set(id, t)
    if (!paused) this.schedule(id, t)
    return id
  }

  private schedule(id: number, t: Pending) {
    t.started = performance.now()
    t.handle = window.setTimeout(() => {
      if (!this.alive || !this.timers.has(id)) return
      if (t.period) { t.left = t.period; this.schedule(id, t) }
      else this.timers.delete(id)
      t.fn()
    }, t.left)
  }

  private suspend() {
    const now = performance.now()
    this.timers.forEach(t => {
      clearTimeout(t.handle)
      t.left = Math.max(0, t.left - (now - t.started))
    })
  }

  private resume() {
    if (!this.alive) return
    this.timers.forEach((t, id) => this.schedule(id, t))
  }
}
