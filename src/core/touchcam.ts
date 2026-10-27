/* Les doigts sur une scène 3D (27/10) — la mécanique qu'Habille-toi, Mon
   cartable, le gâteau de la Cuisine, les Monuments, la Ferme à construire
   et le plateau de Cache-Cache recopiaient chacun (la version de
   référence était celle de Cache-Cache) :
   - `Fingers` suit chaque doigt par son `pointerId` (un second doigt ne fait
     plus sauter le point du premier) et marque `multi` tous ceux qui ont
     partagé l'écran avec un autre : le doigt qui reste après deux doigts ne
     fait rien (pas de tour, pas de toucher surprise) ;
   - `pair()` : l'écart, l'angle et le milieu de deux doigts (pincer, tourner) ;
   - `Spinner` fait tourner `{ rot, vRot }` avec élan : l'élan se mesure en
     vrai (radians par seconde), borné ; un doigt arrêté plus de 90 ms avant
     de se lever ne lance rien ; `coast()` le laisse filer puis s'éteindre.
   Le globe du Tour du Monde et l'Espace gardent leurs caméras à eux
   (réglées avec le père). */

/** Ce qu'un doigt suivi retient : où il est, d'où il est parti, combien il
    a bougé, quand il s'est posé (l'heure de l'événement), et s'il a partagé
    l'écran avec un autre doigt. */
export interface Finger { id: number; x: number; y: number; x0: number; y0: number; moved: number; t0: number; multi: boolean }

/** Le strict nécessaire d'un `PointerEvent` (les tests en fabriquent). */
export type PointerLike = Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY' | 'timeStamp'>

/** Deux doigts : leur écart, leur angle, leur milieu, leurs hauteurs. */
export interface Pair { d: number; ang: number; m: { x: number; y: number }; ys: [number, number] }

/** L'écart, l'angle (de `a` vers `b`) et le milieu de deux points. */
export function pairOf(a: { x: number; y: number }, b: { x: number; y: number }): Pair {
  return { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, ys: [a.y, b.y] }
}

/** L'angle de `a` à `b`, ramené entre -π et π (deux doigts qui tournent). */
export const turned = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b))

/** Les doigts posés, chacun par son `pointerId`, avec ce que le jeu y range (`D`). */
export class Fingers<D extends object = object> {
  private readonly m = new Map<number, Finger & D>()

  get size() { return this.m.size }
  has(id: number) { return this.m.has(id) }
  get(id: number) { return this.m.get(id) }
  values() { return [...this.m.values()] }

  /** Un doigt se pose. Avec un autre déjà là, tous deux deviennent `multi`. */
  down(e: PointerLike, extra?: D): Finger & D {
    const f = { ...(extra as D), id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: 0, t0: e.timeStamp, multi: false } as Finger & D
    this.m.set(e.pointerId, f)
    if (this.m.size > 1) for (const o of this.m.values()) o.multi = true
    return f
  }

  /** Il glisse : de combien depuis l'événement d'avant (null : un doigt qu'on ne suit pas). */
  move(e: PointerLike): { f: Finger & D; dx: number; dy: number } | null {
    const f = this.m.get(e.pointerId)
    if (!f) return null
    const dx = e.clientX - f.x, dy = e.clientY - f.y
    f.x = e.clientX; f.y = e.clientY
    f.moved += Math.abs(dx) + Math.abs(dy)
    return { f, dx, dy }
  }

  /** Il se lève (ou le geste est annulé) : rendu une dernière fois, puis oublié. */
  up(e: Pick<PointerEvent, 'pointerId'>): (Finger & D) | null {
    const f = this.m.get(e.pointerId) ?? null
    this.m.delete(e.pointerId)
    return f
  }

  /** Les deux premiers doigts (null s'il n'y en a pas deux). */
  pair(): Pair | null {
    if (this.m.size < 2) return null
    const [a, b] = this.m.values()
    return pairOf(a, b)
  }

  clear() { this.m.clear() }
}

/** Ce qui tourne au doigt : son angle et son élan (radians par seconde). */
export interface Spin { rot: number; vRot: number }

/** Un doigt arrêté plus longtemps que ça avant de se lever ne lance rien. */
export const STILL_MS = 90

/** Les réglages d'un jeu : l'élan maximal, l'angle par pixel, et le sens. */
export interface SpinOpts {
  /** Élan maximal (radians par seconde). */
  max: number
  /** L'angle d'un pixel de glissé (souvent selon la largeur de la scène : `perWidth`). */
  perPx: () => number
  /** -1 : glisser vers la droite fait tourner dans l'autre sens (la caméra qui tourne autour). */
  sign?: 1 | -1
}

/** L'angle par pixel selon la largeur d'un élément : un tour de glissé ≈ `frac` de sa largeur. */
export const perWidth = (el: HTMLElement, min: number, frac: number) => () => 1 / Math.max(min, el.clientWidth * frac)

/** Tourner avec élan, mesuré en vrai. Les heures sont en ms (`performance.now()` par défaut). */
export class Spinner {
  /** L'heure du dernier glissé (ou de la pose du doigt). */
  last = 0
  constructor(private readonly o: SpinOpts) {}

  /** Un doigt se pose : ce qui tournait s'arrête. */
  start(s: Spin | null, now = performance.now()) { if (s) s.vRot = 0; this.last = now }

  /** Le temps écoulé depuis le dernier glissé, en secondes (8 ms au moins : deux événements dans la même image). */
  step(now = performance.now()) {
    const dts = Math.max(8, now - this.last) / 1000
    this.last = now
    return dts
  }

  /** Le doigt glisse de `dx` pixels : ça tourne d'autant, et l'élan suit sa vitesse (lissé, borné). */
  turn(s: Spin, dx: number, now = performance.now()) {
    const dts = this.step(now)
    const a = (this.o.sign ?? 1) * dx * this.o.perPx()
    s.rot += a
    s.vRot = Math.max(-this.o.max, Math.min(this.o.max, s.vRot * 0.5 + a / dts * 0.5))
  }

  /** Le doigt s'est arrêté avant de se lever (il ne doit rien lancer). */
  still(now = performance.now()) { return now - this.last > STILL_MS }

  /** Le doigt se lève : arrêté depuis plus de 90 ms, il ne lance rien. */
  release(s: Spin, now = performance.now()) { if (this.still(now)) s.vRot = 0 }

  /** Un second doigt, ou celui qui reste : rien ne tourne plus. */
  hold(s: Spin, now = performance.now()) { s.vRot = 0; this.last = now }
}

/** Chaque image, doigt levé : ça file sur son élan, qui s'éteint (`decay` : ce qu'il en reste après une seconde). */
export function coast(s: Spin, dt: number, decay: number, stop = 0) {
  s.rot += s.vRot * dt
  s.vRot *= Math.pow(decay, dt)
  if (Math.abs(s.vRot) < stop) s.vRot = 0
}
