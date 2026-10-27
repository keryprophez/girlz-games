/* 1, 2, 3… SOLEIL ! — la course, sans three.js (27/10). Pur et joué par
   vitest : l'épouvantail qui compte, les coureurs, qui se fait prendre.

   Une course : la piste va de 0 (la ligne de départ) à `L` (le dos de
   l'épouvantail). Chaque coureur a une position `x` et une vitesse `v` :
   - la joueuse : doigt posé (`hold`), elle accélère jusqu'à `vmax` ; doigt
     levé, elle freine (`dec`) en glissant un peu — l'élan fait la tension.
     Dans une flaque de boue, elle freine trois fois moins ;
   - le cochon et le mouton (`ai`) courent aussi : ils s'arrêtent un peu
     avant ou un peu après le troisième coup, et se font prendre aussi.

   L'épouvantail, dos tourné, bat TROIS coups (`beat` d'écart, un peu
   irrégulier quand la rampe monte), puis se retourne (`turnDur`) ; tourné,
   il REGARDE (`look`) : qui bouge encore (plus de `V_CAUGHT`) est pris —
   il recule de `back` et la joueuse perd un cœur (le jeu s'en occupe).
   Puis il se remet de dos et recompte. Une FEINTE : au deuxième coup, il
   se retourne à moitié et revient — sans regarder.

   Le « ouf » : la joueuse allait vite (plus de la moitié de `vmax`) moins de
   `NEAR` secondes avant qu'il ne regarde, et elle n'est pas prise.
   On gagne en touchant le dos de l'épouvantail (`x ≥ L`) ; un animal qui y
   arrive d'abord gagne la course à sa place. */

export const V_CAUGHT = 0.12
/** Le « ouf » : allait vite moins de NEAR s avant le regard. */
export const NEAR = 0.28

export interface SoleilCfg {
  L: number
  vmax: number
  acc: number
  dec: number
  /** Le freinage dans la boue. */
  mudDec: number
  /** L'écart entre deux coups, et son irrégularité (0..1). */
  beat: number
  jitter: number
  turnDur: number
  /** Combien de temps il regarde. */
  look: [number, number]
  /** La chance d'une feinte à chaque compte. */
  feint: number
  /** Le recul d'un coureur pris. */
  back: number
  /** Les flaques de boue : [début, fin] le long de la piste. */
  mud: [number, number][]
  /** Les animaux qui courent aussi : leur vitesse (× vmax) et leur retard de réaction (s, écart type). */
  ai: { speed: number; sloppy: number }[]
}

export type Phase = 'count' | 'feint' | 'turn' | 'look' | 'back'

export interface Runner {
  x: number
  v: number
  /** Doigt posé (la joueuse) ou envie de courir (un animal). */
  hold: boolean
  /** Pris : il recule jusqu'à `backTo`, ce temps-là (s). */
  caught: number
  backTo: number
  /** Le temps (horloge de la course) où il allait vite pour la dernière fois. */
  fastAt: number
  ai?: { speed: number; sloppy: number; stopAt: number; fooled: boolean }
}

export type SoleilEvent =
  | { t: 'beat'; n: number }
  | { t: 'feint' }
  | { t: 'turn' }
  | { t: 'look' }
  | { t: 'back' }
  | { t: 'caught'; who: number }
  | { t: 'safe'; moved: boolean }
  | { t: 'ouf' }
  | { t: 'win'; who: number }

export class Race {
  phase: Phase = 'count'
  /** Le temps passé dans la phase, et la durée de la phase. */
  pt = 0
  dur = 0
  /** Les coups déjà battus dans ce compte. */
  beats = 0
  /** L'horloge de la course. */
  t = 0
  /** Le dos de l'épouvantail : 0 = de dos, 1 = de face. */
  face = 0
  runners: Runner[]
  over = false
  winner = -1
  /** La joueuse a bougé pendant ce compte (pour la récompenser d'un arrêt réussi). */
  private moved = false
  private feinted = false
  /** Le compte en cours, en secondes depuis son début (les animaux s'en servent). */
  private countT = 0

  constructor(public cfg: SoleilCfg, private rnd: () => number = Math.random) {
    this.runners = [this.runner(), ...cfg.ai.map(a => ({ ...this.runner(), ai: { ...a, stopAt: 0, fooled: false } }))]
    this.startCount()
  }

  private runner(): Runner { return { x: 0, v: 0, hold: false, caught: 0, backTo: 0, fastAt: -9 } }

  /** Le compte qui recommence : trois coups, peut-être une feinte. */
  private startCount() {
    this.phase = 'count'
    this.pt = 0
    this.beats = 0
    this.moved = false
    this.countT = 0
    this.feinted = this.rnd() >= this.cfg.feint
    this.dur = this.nextBeat()
    // Les animaux décident quand ils s'arrêteront : vers le troisième coup, plus ou moins tôt
    const third = this.cfg.beat * 3
    for (const r of this.runners) {
      if (!r.ai) continue
      r.ai.stopAt = third + this.cfg.turnDur - 0.45 + gauss(this.rnd) * r.ai.sloppy
      r.ai.fooled = false
    }
  }

  private nextBeat() { return this.cfg.beat * (1 + (this.rnd() * 2 - 1) * this.cfg.jitter) }

  /** Le pied de la joueuse (doigt posé ou levé). */
  setHold(h: boolean) { this.runners[0].hold = h }

  step(dt: number): SoleilEvent[] {
    const ev: SoleilEvent[] = []
    if (this.over) return ev
    this.t += dt
    this.pt += dt
    const c = this.cfg
    // L'épouvantail
    if (this.phase === 'count' || this.phase === 'turn') this.countT += dt
    if (this.phase === 'count') {
      if (this.pt >= this.dur) {
        this.pt = 0
        this.beats++
        ev.push({ t: 'beat', n: this.beats })
        if (this.beats === 2 && !this.feinted) {
          this.feinted = true; this.phase = 'feint'; this.dur = 0.75
          // La moitié des animaux s'y laissent prendre : ils se figent pour rien
          for (const r of this.runners) if (r.ai) r.ai.fooled = this.rnd() < 0.5
          ev.push({ t: 'feint' })
        }
        else if (this.beats >= 3) { this.phase = 'turn'; this.dur = c.turnDur; ev.push({ t: 'turn' }) }
        else this.dur = this.nextBeat()
      }
    } else if (this.phase === 'feint') {
      this.face = Math.sin(Math.min(1, this.pt / this.dur) * Math.PI) * 0.45
      if (this.pt >= this.dur) { this.face = 0; this.phase = 'count'; this.pt = 0; this.dur = this.nextBeat() }
    } else if (this.phase === 'turn') {
      this.face = Math.min(1, this.pt / this.dur)
      if (this.pt >= this.dur) {
        this.face = 1
        this.phase = 'look'
        this.pt = 0
        this.dur = c.look[0] + this.rnd() * (c.look[1] - c.look[0])
        ev.push({ t: 'look' })
        this.judge(ev, true)
      }
    } else if (this.phase === 'look') {
      this.judge(ev, false)
      if (this.pt >= this.dur) { this.phase = 'back'; this.pt = 0; this.dur = 0.45; ev.push({ t: 'back' }) }
    } else if (this.phase === 'back') {
      this.face = 1 - Math.min(1, this.pt / this.dur)
      if (this.pt >= this.dur) { this.face = 0; this.startCount() }
    }
    // Les coureurs
    this.runners.forEach((r, i) => {
      if (r.caught > 0) {
        // Pris : il recule, sans courir
        r.caught = Math.max(0, r.caught - dt)
        r.x += (r.backTo - r.x) * Math.min(1, dt * 5)
        r.v = 0
        if (r.caught === 0) r.x = r.backTo
        return
      }
      if (r.ai) r.hold = this.aiWants(r)
      const mud = c.mud.some(([a, b]) => r.x >= a && r.x <= b)
      const vmax = c.vmax * (r.ai ? r.ai.speed : 1)
      if (r.hold) r.v = Math.min(vmax, r.v + c.acc * dt)
      else r.v = Math.max(0, r.v - (mud ? c.mudDec : c.dec) * dt)
      r.x += r.v * dt
      if (r.v > c.vmax * 0.5) r.fastAt = this.t
      if (i === 0 && r.v > V_CAUGHT && this.phase !== 'look') this.moved = true
      if (r.x >= c.L && !this.over) {
        r.x = c.L
        this.over = true
        this.winner = i
        ev.push({ t: 'win', who: i })
      }
    })
    return ev
  }

  /** Qui bouge pendant qu'il regarde est pris. `first` : l'instant où il se retourne. */
  private judge(ev: SoleilEvent[], first: boolean) {
    this.runners.forEach((r, i) => {
      if (r.caught > 0 || this.over) return
      if (r.v > V_CAUGHT) {
        r.caught = 0.9
        r.backTo = Math.max(0, r.x - this.cfg.back)
        r.hold = false
        ev.push({ t: 'caught', who: i })
      } else if (first && i === 0) {
        if (this.t - r.fastAt < NEAR) ev.push({ t: 'ouf' })
        ev.push({ t: 'safe', moved: this.moved })
      }
    })
  }

  /** Un animal court pendant le compte, s'arrête vers le troisième coup ; une feinte le fige parfois. */
  private aiWants(r: Runner): boolean {
    const a = r.ai!
    if (this.phase !== 'count' && this.phase !== 'feint' && this.phase !== 'turn') return false
    return !a.fooled && this.countT < a.stopAt
  }
}

/** Un tirage en cloche (moyenne 0, écart type 1). */
function gauss(rnd: () => number) {
  const u = Math.max(1e-9, rnd()), v = rnd()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Le réglage d'une course : le niveau choisi (0 fleur, 1 éclair, 2 flamme) et
    la rampe (0..4, montée par les arrêts réussis). */
export function soleilCfg(tier: 0 | 1 | 2, level: number, rnd: () => number = Math.random): SoleilCfg {
  const k = Math.min(4, Math.max(0, level))
  const beat = [0.82, 0.7, 0.6][tier] - k * 0.05
  const L = 11
  const mud: [number, number][] = []
  if (tier === 2) {
    // Deux ou trois flaques, jamais sur la ligne de départ ni au pied de l'épouvantail
    const n = 2 + (k >= 2 ? 1 : 0)
    for (let i = 0; i < n; i++) {
      const a = 2 + (i + rnd() * 0.6) * (L - 4.5) / n
      mud.push([a, a + 0.9 + rnd() * 0.5])
    }
  }
  const ai: SoleilCfg['ai'] = []
  // Le cochon et le mouton : à la fleur ils arrivent avec la rampe, ailleurs tout de suite
  const nAi = tier === 0 ? (k >= 3 ? 2 : k >= 1 ? 1 : 0) : 2
  for (let i = 0; i < nAi; i++) ai.push({ speed: 0.7 + tier * 0.03 + k * 0.015 - i * 0.03, sloppy: 0.28 + i * 0.05 })
  return {
    L, vmax: 1.6 + tier * 0.1, acc: 4.2, dec: 4.4, mudDec: 2,
    beat, jitter: tier === 0 ? k * 0.03 : 0.08 + k * 0.05,
    turnDur: [0.6, 0.48, 0.4][tier] - k * 0.03,
    look: [1.3, 2.2],
    feint: tier === 0 ? Math.max(0, k - 1) * 0.12 : 0.15 + k * 0.06,
    back: [2, 2.6, 3][tier],
    mud, ai
  }
}
