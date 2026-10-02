/* LE FLIPPER DE LA GRANGE — la physique de la bille, sans three.js (1/10).

   La bille roule dans le PLAN de la table : x vers la droite, y vers le
   fond (la grange). Le rendu 3D (`games/pinball.ts`) ne fait que montrer ce
   qui se passe ici ; ce module est pur, et c'est la même physique qui tourne
   dans le jeu et dans les tests (vitest : des centaines de parties jouées par
   le pilote, à plusieurs cadences — piège « Bot qui gagne par chance »).

   Pourquoi une physique à nous plutôt que cannon-es : un batteur est un
   bâton qui tourne à 20 rad/s, dont le bout file à 25 unités/s. Dans un
   moteur générique, il traverse la bille. Ici :
   - pas fixe de 1/480 s : en un pas, la bille et le bout du batteur bougent
     ensemble de moins de 0,1, la moitié de son rayon — elle ne peut PAS
     passer à travers (elle devrait franchir 0,29 d'un coup) ;
   - le batteur est une capsule effilée qui tourne autour de son pivot : la
     vitesse de sa surface au point de contact (ω × r) est donnée à la bille,
     c'est ce qui fait un vrai coup de batteur (fort au bout, mou au pivot) ;
   - le temps est SIMULÉ (`update(dt)` découpe en pas fixes) : rien ne dépend
     de l'horloge murale (piège « Horloge murale vs simulée »).

   La table (unité ≈ 8,5 cm d'un vrai flipper, la bille fait 0,2 de rayon) :

        ╭──────────── la coupole (arc) ───────────╮
        │      vache        cochon                │ ← le couloir du lanceur
        │   œufs     mouton           ┌ rampe ┐   │   (x de 2,8 à 3,4),
        │   (cibles)                   (entrée)   │   fermé en haut par un
        │                                     │   │   portillon à sens unique
        │  ╲ foin            foin ╱           │   │
        │    ╲__ batteur  batteur __╱         │ ● │ ← la bille sur le ressort
        │            (le chien)               │   │

   Rien ici ne parle de score : la partie (vies, points, séries, multibille)
   est tenue par le jeu, avec `core/arcade.ts`. */

export type Side = 0 | 1
export const LEFT: Side = 0
export const RIGHT: Side = 1

/** Rayon de la bille. */
export const R = 0.2
/** Le pas de la physique. */
export const STEP = 1 / 480

export interface V { x: number; y: number }

/* ---------- La table ---------- */

/** Le plateau, entre ses bords intérieurs ; le couloir du lanceur à droite. */
export const TABLE = {
  left: -2.7,
  right: 2.7,
  laneL: 2.8,
  laneR: 3.4,
  /** La coupole du fond : un demi-cercle qui couvre le plateau ET le couloir. */
  arc: { x: 0.35, y: 7.6, r: 3.05 },
  /** La bille posée sur le ressort. */
  ready: { x: 3.1, y: 0.75 },
  /** Le bas du couloir (le nez du ressort). */
  laneBottom: 0.38,
  /** Le haut de la cloison du couloir, et le portillon à sens unique. */
  dividerTop: 6.35
}

export type WallKind = 'cadre' | 'cloison' | 'rail' | 'foin' | 'canal' | 'portillon' | 'nid'

export interface Wall {
  ax: number; ay: number; bx: number; by: number
  /** Demi-épaisseur (0 = un bord net). */
  r: number
  e: number
  kind: WallKind
  /** Sens unique : la bille ne cogne que si elle arrive du côté de cette normale. */
  one?: V
  /** Une face de botte de foin qui RENVOIE la bille (le « slingshot »). */
  kick?: Side
}

const W = (ax: number, ay: number, bx: number, by: number, kind: WallKind, o: Partial<Wall> = {}): Wall =>
  ({ ax, ay, bx, by, r: 0, e: 0.42, kind, ...o })

/** Les bottes de foin au-dessus des batteurs : un triangle, la face qui
    regarde le centre renvoie la bille. Côté gauche, miroir pour la droite. */
export const SLING = { top: { x: -2.15, y: 3.75 }, bottom: { x: -2.15, y: 2.61 }, tip: { x: -1.55, y: 2.2 } }

/** L'entrée de la rampe : la bouche, entre deux poteaux, ouverte vers le
    haut ; derrière, un petit canal (les rails du bas de la rampe). */
export const MOUTH = {
  a: { x: 1.95, y: 5.7 }, b: { x: 2.7, y: 5.5 },
  /** Le fond du canal : penché vers la gauche, PLUS BAS que le portillon du
      couloir : une bille qui glisse du portillon continue sur lui et roule
      vers le plateau (plus haut, elle restait coincée entre les deux). */
  backA: { x: 1.95, y: 6.1 }, backB: { x: 2.7, y: 6.27 }
}

/** Les trois œufs (cibles qui tombent), le long du bord gauche. */
export const EGGS = { x: -2.45, ys: [5.45, 5.9, 6.35], half: 0.2, top: 6.65, bottom: 5.15 }

/** Les animaux-bumpers : la vache, le cochon, le mouton. */
export const BUMPERS: { x: number; y: number; r: number }[] = [
  { x: -1.05, y: 8.05, r: 0.54 },
  { x: 0.95, y: 8.05, r: 0.54 },
  { x: -0.05, y: 6.85, r: 0.54 }
]

/** La goulotte de retour de la grange : la bille retombe dans le couloir
    de gauche, au-dessus de la botte de foin, et file vers le batteur. */
export const CHUTE_OUT = { x: -2.43, y: 4.05, vx: 0.3, vy: -3 }

export function buildWalls(): Wall[] {
  const t = TABLE
  const s = SLING
  const ws: Wall[] = [
    // Le cadre : bord gauche, bord droit du couloir, nez du ressort
    W(t.left, 2.4, t.left, t.arc.y, 'cadre'),
    W(t.laneR, t.laneBottom, t.laneR, t.arc.y, 'cadre'),
    W(t.laneL, t.laneBottom, t.laneR, t.laneBottom, 'cadre', { e: 0.2 }),
    // La cloison du couloir (épaisse : on cogne des deux côtés)
    W(2.75, t.laneBottom, 2.75, t.dividerTop, 'cloison', { r: 0.05 }),
    // Le portillon : la bille monte à travers, mais ne redescend pas dans le couloir
    W(2.8, t.dividerTop, t.laneR, t.dividerTop + 0.4, 'portillon', { one: norm(-0.4, 0.6), e: 0.3 }),
    // Les rails qui mènent aux batteurs
    W(t.left, 2.4, -1.4, 1.5, 'rail', { e: 0.25 }),
    W(t.right, 2.4, 1.4, 1.5, 'rail', { e: 0.25 }),
    // Sous les batteurs, l'entonnoir de la sortie (les bords des talus)
    W(-1.32, 1.12, -0.5, -0.3, 'rail', { e: 0.2 }),
    W(1.32, 1.12, 0.5, -0.3, 'rail', { e: 0.2 }),
    // Le nid des œufs : le dessus penché vers le plateau, le dessous
    W(t.left, EGGS.top + 0.1, EGGS.x, EGGS.top, 'nid'),
    W(t.left, EGGS.bottom, EGGS.x, EGGS.bottom, 'nid'),
    // Le canal de la rampe
    W(MOUTH.a.x, MOUTH.a.y, MOUTH.backA.x, MOUTH.backA.y, 'canal', { r: 0.04 }),
    W(MOUTH.backA.x, MOUTH.backA.y, MOUTH.backB.x, MOUTH.backB.y, 'canal', { r: 0.04 })
  ]
  // Les bottes de foin : deux faces passives, la face qui renvoie
  for (const side of [LEFT, RIGHT] as Side[]) {
    const k = side === LEFT ? 1 : -1
    ws.push(W(k * s.bottom.x, s.bottom.y, k * s.top.x, s.top.y, 'foin', { r: 0.04 }))
    ws.push(W(k * s.bottom.x, s.bottom.y, k * s.tip.x, s.tip.y, 'foin', { r: 0.04 }))
    ws.push(W(k * s.top.x, s.top.y, k * s.tip.x, s.tip.y, 'foin', { r: 0.06, kick: side, e: 0.5 }))
  }
  return ws
}

/** Le piquet de bois sous le haut de la coupole. */
export const TOP_POST = { x: 0.15, y: 10.08, r: 0.13 }

/** Les poteaux ronds en caoutchouc : la bouche de la rampe, le haut des foins. */
export const POSTS: { x: number; y: number; r: number }[] = [
  { x: MOUTH.a.x, y: MOUTH.a.y, r: 0.09 },
  { x: MOUTH.b.x - 0.03, y: MOUTH.b.y, r: 0.09 },
  { x: SLING.top.x, y: SLING.top.y, r: 0.1 },
  { x: -SLING.top.x, y: SLING.top.y, r: 0.1 },
  // Le piquet du haut : la bille qui fait le tour de la coupole y cogne et
  // retombe chez les animaux
  { x: TOP_POST.x, y: TOP_POST.y, r: TOP_POST.r }
]

function norm(x: number, y: number): V {
  const d = Math.hypot(x, y) || 1
  return { x: x / d, y: y / d }
}

/* ---------- Les batteurs ---------- */

export interface Flipper {
  side: Side
  /** +1 à gauche, −1 à droite (le batteur droit est le miroir du gauche). */
  s: 1 | -1
  px: number; py: number
  len: number
  /** Rayons au pivot et au bout (capsule effilée). */
  r0: number; r1: number
  /** Angles au repos et levé (radians, dans le repère du batteur gauche). */
  rest: number; up: number
  /** Angle courant et vitesse angulaire réelle du dernier pas. */
  a: number
  w: number
  held: boolean
}

function flipper(side: Side): Flipper {
  const s = side === LEFT ? 1 : -1
  const rest = -0.52, up = 0.49
  return { side, s, px: -1.25 * s, py: 1.3, len: 1.05, r0: 0.17, r1: 0.09, rest, up, a: rest, w: 0, held: false }
}

/** Le bout du batteur, à l'angle donné. */
export function flipperTip(f: Flipper, a = f.a): V {
  return { x: f.px + f.s * f.len * Math.cos(a), y: f.py + f.len * Math.sin(a) }
}

/* ---------- La bille ---------- */

/** Où est la bille :
    - `ready` : posée sur le ressort, en attente du lancer ;
    - `table` : elle roule sur le plateau (la physique) ;
    - `ramp`  : elle monte la rampe (un chemin, en une dimension) ;
    - `barn`  : dans la grange ;
    - `chute` : elle redescend par la goulotte ;
    - `guard` : le chien l'a attrapée et va la renvoyer ;
    - `gone`  : tombée entre les batteurs. */
export type BallState = 'ready' | 'table' | 'ramp' | 'barn' | 'chute' | 'guard' | 'gone'

export interface Ball {
  id: number
  st: BallState
  x: number; y: number
  vx: number; vy: number
  /** Rampe : abscisse le long du chemin (0 → RAMP_LEN) et vitesse ; goulotte : 0 → 1. */
  s: number
  sv: number
  /** Minuteur de l'état courant (grange, chien). */
  hold: number
  /** Le moment du lancer (pour le « sauvetage » des premières secondes). */
  launchedAt: number
  /** Elle est passée tout près de la sortie (pour le « ouf »). */
  danger: number
  /** Trop bas : plus aucun batteur ne l'atteint. */
  doomed: boolean
  /** Pas encore bougé : depuis quand elle est (presque) immobile. */
  still: number
  lastWall: number
}

/** Longueur de la rampe (le chemin 3D du jeu a la même). */
export const RAMP_LEN = 5.8
/** Durée de la descente par la goulotte (s). */
export const CHUTE_T = 1.15

/* ---------- Réglages par niveau ---------- */

export interface PinCfg {
  /** Gravité dans le plan de la table (unités/s²). */
  g: number
  /** Vitesse maximale de la bille. */
  vmax: number
  /** Vitesse de montée des batteurs (rad/s). */
  omega: number
  /** Les animaux bougent (amplitude, 0 = immobiles). */
  moving: number
  /** La chance que le chien renvoie une bille perdue (0 = pas de chien). */
  guard: number
  /** Une bille perdue dans les N premières secondes après le lancer est
      toujours renvoyée par le chien (s'il est là). */
  saveAfterLaunch: number
}

export const CFG: Record<'easy' | 'med' | 'exp', PinCfg> = {
  // Fleur : la bille lente, le chien qui sauve parfois
  easy: { g: 6.5, vmax: 14, omega: 17, moving: 0, guard: 0.45, saveAfterLaunch: 8 },
  // Éclair : plus vite, sans chien
  med: { g: 8.5, vmax: 16.5, omega: 19, moving: 0, guard: 0, saveAfterLaunch: 0 },
  // Flamme : vite, et les animaux bougent
  exp: { g: 10.5, vmax: 19, omega: 21, moving: 0.5, guard: 0, saveAfterLaunch: 0 }
}

/* ---------- Ce qui se passe (le jeu en fait des sons, des points, des étincelles) ---------- */

export type PinEvent =
  | { k: 'bumper'; i: number; v: number; x: number; y: number }
  | { k: 'sling'; side: Side; v: number; x: number; y: number }
  | { k: 'wall'; v: number; x: number; y: number; kind: WallKind }
  | { k: 'post'; v: number; x: number; y: number }
  | { k: 'flip'; side: Side; up: boolean }
  | { k: 'flipHit'; side: Side; v: number; x: number; y: number }
  | { k: 'target'; i: number }
  | { k: 'targets' }
  | { k: 'targetsUp' }
  | { k: 'rampIn'; ball: number }
  | { k: 'rampBack'; ball: number }
  | { k: 'barn'; ball: number }
  | { k: 'chuteOut'; ball: number }
  | { k: 'near'; ball: number }
  | { k: 'save'; ball: number }
  | { k: 'toss'; ball: number }
  | { k: 'doomed'; ball: number; last: boolean }
  | { k: 'drain'; ball: number; left: number }
  | { k: 'launch'; ball: number; p: number }
  | { k: 'ready'; ball: number }
  | { k: 'nudge'; ball: number }

/* ---------- La simulation ---------- */

export class Pinball {
  cfg: PinCfg
  /** Le temps simulé (s). */
  t = 0
  balls: Ball[] = []
  flippers: [Flipper, Flipper] = [flipper(LEFT), flipper(RIGHT)]
  walls = buildWalls()
  /** Les animaux : position courante (ils bougent à la flamme) et vitesse. */
  bumpers = BUMPERS.map(b => ({ ...b, bx: b.x, by: b.y, vx: 0, vy: 0, last: -1 }))
  posts = POSTS.map(p => ({ ...p, last: -1 }))
  /** Les œufs : debout ou tombés, et quand ils se relèvent. */
  eggs = EGGS.ys.map(() => ({ down: false }))
  eggsUpAt = -1
  /** Le ressort : tiré de 0 à 1 tant qu'on appuie. */
  pull = 0
  pulling = false
  events: PinEvent[] = []
  /** Appelé à chaque pas, avant les batteurs : le pilote des tests. */
  pilot: ((sim: Pinball, h: number) => void) | null = null
  /** La rampe de difficulté (core/arcade) : la bille va un peu plus vite. */
  pace = 1
  /** Le chien ne sauve pas deux fois de suite (s). */
  guardReadyAt = 0
  private acc = 0
  private nextId = 1
  private rnd: () => number

  constructor(cfg: PinCfg, rnd: () => number = Math.random) {
    this.cfg = cfg
    this.rnd = rnd
  }

  get g() { return this.cfg.g * this.pace }
  get vmax() { return this.cfg.vmax * Math.sqrt(this.pace) }

  /** Les billes encore en jeu (pas sur le ressort, pas perdues). */
  inPlay(): Ball[] { return this.balls.filter(b => b.st !== 'gone' && b.st !== 'ready') }
  readyBall(): Ball | undefined { return this.balls.find(b => b.st === 'ready') }

  /** Une nouvelle bille sur le ressort. */
  serve(): Ball {
    const b = this.ball('ready', TABLE.ready.x, TABLE.ready.y)
    this.pull = 0
    this.pulling = false
    this.events.push({ k: 'ready', ball: b.id })
    return b
  }

  /** Le multibille : des billes sortent de la grange, l'une après l'autre. */
  release(n: number, gap = 0.7) {
    for (let i = 0; i < n; i++) {
      const b = this.ball('barn', 0.35, 10.9)
      b.hold = 0.35 + i * gap
    }
  }

  private ball(st: BallState, x: number, y: number): Ball {
    const b: Ball = { id: this.nextId++, st, x, y, vx: 0, vy: 0, s: 0, sv: 0, hold: 0, launchedAt: -99, danger: -99, doomed: false, still: 0, lastWall: -1 }
    this.balls.push(b)
    return b
  }

  setFlipper(side: Side, held: boolean) {
    const f = this.flippers[side]
    if (f.held === held) return
    f.held = held
    this.events.push({ k: 'flip', side, up: held })
  }

  /** Le ressort : appuyer le tire, relâcher lance la bille. */
  plunger(on: boolean) {
    const b = this.readyBall()
    if (on) { if (b) this.pulling = true; return }
    if (!this.pulling) return
    this.pulling = false
    if (!b) { this.pull = 0; return }
    // Même un toucher bref envoie la bille jusqu'à la coupole
    const p = Math.max(0, Math.min(1, this.pull))
    const v = Math.sqrt(this.g) * (4.45 + 1.15 * p)
    b.st = 'table'
    b.x = TABLE.ready.x
    b.y = TABLE.ready.y
    b.vx = 0
    b.vy = Math.min(this.vmax, v)
    b.launchedAt = this.t
    this.pull = 0
    this.events.push({ k: 'launch', ball: b.id, p })
  }

  /** Fait avancer la simulation de `dt` secondes (découpées en pas fixes). */
  update(dt: number) {
    this.acc = Math.min(this.acc + dt, 0.12)
    while (this.acc >= STEP) {
      this.acc -= STEP
      this.step(STEP)
    }
  }

  /** Un pas de physique. */
  step(h: number) {
    this.t += h
    this.pilot?.(this, h)
    if (this.pulling) this.pull = Math.min(1, this.pull + h / 0.75)

    // Les batteurs tournent vers leur angle visé, à vitesse bornée
    for (const f of this.flippers) {
      const target = f.held ? f.up : f.rest
      const sp = f.held ? this.cfg.omega : this.cfg.omega * 0.62
      const da = Math.max(-sp * h, Math.min(sp * h, target - f.a))
      f.a += da
      f.w = da / h
    }

    // Les animaux qui bougent (flamme) : un petit va-et-vient, chacun son rythme
    if (this.cfg.moving > 0) {
      this.bumpers.forEach((b, i) => {
        const ph = this.t * (0.7 + i * 0.17) + i * 2.1
        const nx = b.bx + Math.sin(ph) * this.cfg.moving
        b.vx = (nx - b.x) / h
        b.x = nx
      })
    }

    // Les œufs se relèvent quand plus aucune bille n'est devant
    if (this.eggsUpAt >= 0 && this.t >= this.eggsUpAt) {
      const free = this.balls.every(b => b.st !== 'table' || b.x > EGGS.x + R + 0.05 || b.y < EGGS.bottom - R || b.y > EGGS.top + R)
      if (free) {
        this.eggs.forEach(e => { e.down = false })
        this.eggsUpAt = -1
        this.events.push({ k: 'targetsUp' })
      }
    }

    for (const b of this.balls) {
      switch (b.st) {
        case 'table': this.roll(b, h); break
        case 'ramp': this.climb(b, h); break
        case 'barn':
          b.hold -= h
          if (b.hold <= 0) { b.st = 'chute'; b.s = 0 }
          break
        case 'chute':
          b.s += h / CHUTE_T
          if (b.s >= 1) {
            b.st = 'table'
            b.x = CHUTE_OUT.x; b.y = CHUTE_OUT.y
            b.vx = CHUTE_OUT.vx; b.vy = CHUTE_OUT.vy
            b.doomed = false
            this.events.push({ k: 'chuteOut', ball: b.id })
          }
          break
        case 'guard':
          b.hold -= h
          if (b.hold <= 0) {
            // Le chien la renvoie TOUT DROIT entre les batteurs (l'écart est fait pour elle)
            b.st = 'table'
            b.x = 0; b.y = 0.35
            b.vx = 0; b.vy = Math.min(this.vmax, Math.sqrt(2 * this.g * 6.2))
            b.doomed = false
            b.launchedAt = -99
            this.events.push({ k: 'toss', ball: b.id })
          }
          break
        case 'ready':
          b.x = TABLE.ready.x
          b.y = TABLE.ready.y - this.pull * 0.32
          break
      }
    }

    this.collideBalls()

    // Les billes perdues s'en vont
    for (const b of this.balls) {
      if (b.st === 'table' && b.y < -0.45) {
        b.st = 'gone'
        this.events.push({ k: 'drain', ball: b.id, left: this.inPlay().length })
      }
    }
    if (this.balls.some(b => b.st === 'gone')) this.balls = this.balls.filter(b => b.st !== 'gone')
  }

  /** Sur le plateau : la gravité, puis tout ce qu'elle touche. */
  private roll(b: Ball, h: number) {
    const px = b.x, py = b.y
    b.vy -= this.g * h
    const fr = 1 - 0.1 * h
    b.vx *= fr; b.vy *= fr
    const sp = Math.hypot(b.vx, b.vy)
    const vm = this.vmax
    if (sp > vm) { b.vx *= vm / sp; b.vy *= vm / sp }
    b.x += b.vx * h
    b.y += b.vy * h

    // Deux passes : dans un coin, une poussée peut en défaire une autre
    for (let pass = 0; pass < 2; pass++) {
      this.arc(b)
      for (const w of this.walls) this.wall(b, w)
      this.eggTargets(b)
      this.bumperHits(b)
      for (const p of this.posts) this.post(b, p)
      for (const f of this.flippers) this.flip(b, f)
    }

    // L'entrée de la rampe : elle franchit la bouche en montant
    const m = MOUTH
    const tx = m.b.x - m.a.x, ty = m.b.y - m.a.y
    const len = Math.hypot(tx, ty)
    const nx = -ty / len, ny = tx / len // la normale qui entre (vers le haut)
    const before = (px - m.a.x) * nx + (py - m.a.y) * ny
    const after = (b.x - m.a.x) * nx + (b.y - m.a.y) * ny
    if (before < 0 && after >= 0) {
      const u = ((b.x - m.a.x) * tx + (b.y - m.a.y) * ty) / (len * len)
      const vin = b.vx * nx + b.vy * ny
      if (u > 0.05 && u < 0.95 && vin > 0) {
        b.st = 'ramp'
        b.s = 0
        b.sv = Math.hypot(b.vx, b.vy) * 0.92
        b.x = m.a.x + tx * u; b.y = m.a.y + ty * u
        this.events.push({ k: 'rampIn', ball: b.id })
        return
      }
    }

    // De retour dans le bas du couloir : elle reprend sa place sur le ressort
    if (b.x > TABLE.laneL && b.y < 1.3 && Math.abs(b.vy) < 0.8 && !this.readyBall()) {
      b.st = 'ready'
      b.vx = b.vy = 0
      this.events.push({ k: 'ready', ball: b.id })
      return
    }

    // Tout près de la sortie, en descendant : on s'en souvient (le « ouf »)
    if (Math.abs(b.x) < 0.75 && b.y < 1.2 && b.vy < -0.5) b.danger = this.t
    // Trop bas pour un batteur : perdue… sauf si le chien est là
    if (!b.doomed && b.y < 0.45 && Math.abs(b.x) < 0.62 && b.vy < 0) {
      b.doomed = true
      const early = this.cfg.saveAfterLaunch > 0 && this.t - b.launchedAt < this.cfg.saveAfterLaunch
      if (this.cfg.guard > 0 && this.t >= this.guardReadyAt && (early || this.rnd() < this.cfg.guard)) {
        b.st = 'guard'
        b.hold = 0.45
        b.vx = b.vy = 0
        this.guardReadyAt = this.t + 5
        this.events.push({ k: 'save', ball: b.id })
        return
      }
      this.events.push({ k: 'doomed', ball: b.id, last: this.inPlay().length <= 1 })
    }

    // Une bille immobile hors d'un batteur levé : une petite secousse de la table
    if (Math.hypot(b.vx, b.vy) < 0.12) {
      b.still += h
      const cradled = this.flippers.some(f => f.held && Math.hypot(b.x - f.px, b.y - f.py) < f.len + 0.5)
      if (b.still > 2.5 && !cradled) {
        b.vx = (this.rnd() - 0.5) * 3
        b.vy = 2.5
        b.still = 0
        this.events.push({ k: 'nudge', ball: b.id })
      }
    } else b.still = 0
  }

  /** La rampe : une montée en une dimension. Trop lente, elle redescend. */
  private climb(b: Ball, h: number) {
    b.sv -= this.g * 1.15 * h
    b.s += b.sv * h
    if (b.s >= RAMP_LEN) {
      b.st = 'barn'
      b.hold = 0.95
      this.events.push({ k: 'barn', ball: b.id })
      return
    }
    if (b.s <= 0 && b.sv < 0) {
      // Elle ressort de la bouche, vers le bas
      const m = MOUTH
      const tx = m.b.x - m.a.x, ty = m.b.y - m.a.y
      const len = Math.hypot(tx, ty)
      const nx = -ty / len, ny = tx / len
      b.st = 'table'
      b.x -= nx * 0.02; b.y -= ny * 0.02
      const v = -b.sv * 0.8
      b.vx = -nx * v; b.vy = -ny * v
      this.events.push({ k: 'rampBack', ball: b.id })
    }
  }

  /* ---------- Les contacts ---------- */

  /** Repousse la bille hors d'un obstacle et renvoie la vitesse d'impact (≥ 0), ou −1. */
  private bounce(b: Ball, nx: number, ny: number, depth: number, e: number, svx = 0, svy = 0, fric = 0.02): number {
    b.x += nx * depth
    b.y += ny * depth
    const rvx = b.vx - svx, rvy = b.vy - svy
    const vn = rvx * nx + rvy * ny
    if (vn >= 0) return -1
    // Sans élan, elle se pose au lieu de sautiller
    const ee = -vn < 0.7 ? 0 : e
    b.vx -= (1 + ee) * vn * nx
    b.vy -= (1 + ee) * vn * ny
    if (fric > 0 && -vn > 0.7) {
      // Un peu de frottement le long de la surface, au choc seulement (posée,
      // elle roule librement)
      const tvx = (b.vx - svx) - ((b.vx - svx) * nx + (b.vy - svy) * ny) * nx
      const tvy = (b.vy - svy) - ((b.vx - svx) * nx + (b.vy - svy) * ny) * ny
      b.vx -= tvx * fric
      b.vy -= tvy * fric
    }
    return -vn
  }

  private arc(b: Ball) {
    const a = TABLE.arc
    if (b.y <= a.y) return
    const dx = b.x - a.x, dy = b.y - a.y
    const d = Math.hypot(dx, dy)
    const lim = a.r - R
    if (d <= lim) return
    const v = this.bounce(b, -dx / d, -dy / d, d - lim, 0.28, 0, 0, 0.005)
    if (v > 1.8 && this.t - b.lastWall > 0.07) { b.lastWall = this.t; this.events.push({ k: 'wall', v, x: b.x, y: b.y, kind: 'cadre' }) }
  }

  private wall(b: Ball, w: Wall) {
    const dx = w.bx - w.ax, dy = w.by - w.ay
    const l2 = dx * dx + dy * dy
    let t = ((b.x - w.ax) * dx + (b.y - w.ay) * dy) / l2
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const qx = w.ax + dx * t, qy = w.ay + dy * t
    let nx = b.x - qx, ny = b.y - qy
    const d = Math.hypot(nx, ny)
    const lim = w.r + R
    if (d >= lim || d < 1e-9) return
    nx /= d; ny /= d
    // Sens unique : seulement une bille qui arrive par le bon côté ET s'y enfonce
    if (w.one && (nx * w.one.x + ny * w.one.y <= 0 || b.vx * nx + b.vy * ny >= 0)) return
    const v = this.bounce(b, nx, ny, lim - d, w.e)
    if (v < 0) return
    if (w.kick !== undefined && v > 0.9) {
      // La botte de foin renvoie : la bille repart d'au moins 4,4 unités/s —
      // pas plus : à 5,5, elle arrivait pile à la hauteur de l'autre botte,
      // et les deux se la renvoyaient sans fin (325 fois en 5 minutes)
      const out = b.vx * nx + b.vy * ny
      const want = 4.4 * Math.sqrt(this.pace)
      if (out < want) { b.vx += (want - out) * nx; b.vy += (want - out) * ny }
      this.events.push({ k: 'sling', side: w.kick, v, x: b.x, y: b.y })
      return
    }
    if (v > 1.6 && this.t - b.lastWall > 0.07) { b.lastWall = this.t; this.events.push({ k: 'wall', v, x: b.x, y: b.y, kind: w.kind }) }
  }

  private post(b: Ball, p: { x: number; y: number; r: number; last: number }) {
    const dx = b.x - p.x, dy = b.y - p.y
    const d = Math.hypot(dx, dy)
    const lim = p.r + R
    if (d >= lim || d < 1e-9) return
    const v = this.bounce(b, dx / d, dy / d, lim - d, 0.6)
    if (v > 1.4 && this.t - p.last > 0.1) { p.last = this.t; this.events.push({ k: 'post', v, x: p.x, y: p.y }) }
  }

  private bumperHits(b: Ball) {
    this.bumpers.forEach((c, i) => {
      const dx = b.x - c.x, dy = b.y - c.y
      const d = Math.hypot(dx, dy)
      const lim = c.r + R
      if (d >= lim || d < 1e-9) return
      const nx = dx / d, ny = dy / d
      const v = this.bounce(b, nx, ny, lim - d, 0.55, c.vx, c.vy, 0)
      if (v < 0) return
      // L'animal saute et la renvoie : au moins 6,5 unités/s
      const out = (b.vx - c.vx) * nx + (b.vy - c.vy) * ny
      const want = 6.5 * Math.sqrt(this.pace)
      if (out < want) { b.vx += (want - out) * nx; b.vy += (want - out) * ny }
      if (this.t - c.last > 0.08) {
        c.last = this.t
        this.events.push({ k: 'bumper', i, v, x: c.x, y: c.y })
      }
    })
  }

  private eggTargets(b: Ball) {
    const x = EGGS.x
    if (b.x - R > x + 0.02 || b.y < EGGS.bottom - R || b.y > EGGS.top + R) return
    this.eggs.forEach((e, i) => {
      if (e.down) return
      const y0 = EGGS.ys[i] - EGGS.half, y1 = EGGS.ys[i] + EGGS.half
      const qy = Math.max(y0, Math.min(y1, b.y))
      let nx = b.x - x, ny = b.y - qy
      const d = Math.hypot(nx, ny)
      if (d >= R || d < 1e-9) return
      nx /= d; ny /= d
      if (nx <= 0) return
      const v = this.bounce(b, nx, ny, R - d, 0.35)
      if (v < 0.4) return
      e.down = true
      this.events.push({ k: 'target', i })
      if (this.eggs.every(q => q.down)) {
        this.events.push({ k: 'targets' })
        this.eggsUpAt = this.t + 1.4
      }
    })
    // Derrière un œuf tombé : le fond du nid (le bord de la table)
  }

  private flip(b: Ball, f: Flipper) {
    const tip = flipperTip(f)
    const dx = tip.x - f.px, dy = tip.y - f.py
    let t = ((b.x - f.px) * dx + (b.y - f.py) * dy) / (f.len * f.len)
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const qx = f.px + dx * t, qy = f.py + dy * t
    const rr = f.r0 + (f.r1 - f.r0) * t
    let nx = b.x - qx, ny = b.y - qy
    const d = Math.hypot(nx, ny)
    const lim = rr + R
    if (d >= lim || d < 1e-9) return
    nx /= d; ny /= d
    // La vitesse de la surface au point touché : ω × r
    const cx = qx + nx * rr - f.px, cy = qy + ny * rr - f.py
    const w = f.s * f.w
    const v = this.bounce(b, nx, ny, lim - d, 0.32, -w * cy, w * cx, 0.04)
    if (v < 0) return
    if (v > 1.2) this.events.push({ k: 'flipHit', side: f.side, v, x: b.x, y: b.y })
    // Rattrapée au bord de la sortie : « ouf »
    if (this.t - b.danger < 0.8 && b.vy > 3) {
      b.danger = -99
      this.events.push({ k: 'near', ball: b.id })
    }
  }

  /** Les billes entre elles (multibille). */
  private collideBalls() {
    const bs = this.balls
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i]
      if (a.st !== 'table') continue
      for (let j = i + 1; j < bs.length; j++) {
        const c = bs[j]
        if (c.st !== 'table') continue
        const dx = c.x - a.x, dy = c.y - a.y
        const d = Math.hypot(dx, dy)
        if (d >= 2 * R || d < 1e-9) continue
        const nx = dx / d, ny = dy / d
        const push = (2 * R - d) / 2
        a.x -= nx * push; a.y -= ny * push
        c.x += nx * push; c.y += ny * push
        const vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny
        if (vn >= 0) continue
        const j2 = -(1 + 0.9) * vn / 2
        a.vx -= j2 * nx; a.vy -= j2 * ny
        c.vx += j2 * nx; c.vy += j2 * ny
      }
    }
  }
}

/* ---------- Le pilote (les tests, et le bot du navigateur) ----------
   Il lève le batteur quand une bille arrive dessus, le garde levé un
   instant, puis le relâche. Il tourne DANS la simulation, à chaque pas :
   la cadence d'affichage (60 i/s, ou 4 sous la 3D logicielle) n'y change
   rien (piège « Bots à 4 fps »). `skill` < 1 en fait une joueuse moins
   sûre : elle réagit en retard, et parfois pas du tout (pour régler les
   étoiles sur une vraie partie, pas sur un robot parfait). */
export function autoPilot(o: { launch?: boolean; skill?: number; rnd?: () => number } = {}): (sim: Pinball, h: number) => void {
  const skill = o.skill ?? 1
  const rnd = o.rnd ?? Math.random
  const hold = [0, 0], cool = [0, 0], wait = [-1, -1]
  const ignore = [false, false]
  let pullFor = 0
  return (sim, h) => {
    if (o.launch) {
      const ready = sim.readyBall()
      if (ready && sim.inPlay().length === 0) {
        if (!sim.pulling) { sim.plunger(true); pullFor = 0.25 + rnd() * 0.6 }
        else if ((pullFor -= h) <= 0) sim.plunger(false)
      }
    }
    for (const side of [LEFT, RIGHT] as Side[]) {
      const f = sim.flippers[side]
      if (hold[side] > 0) {
        hold[side] -= h
        if (hold[side] <= 0) { sim.setFlipper(side, false); cool[side] = 0.12 }
        continue
      }
      if (cool[side] > 0) { cool[side] -= h; continue }
      const there = sim.balls.some(b => b.st === 'table' && onFlipper(f, b))
      if (!there) { ignore[side] = false; wait[side] = -1; continue }
      if (ignore[side]) continue
      if (wait[side] < 0) {
        // Elle voit la bille arriver : tout de suite, en retard, ou jamais
        if (skill < 1 && rnd() < (1 - skill) * 0.45) { ignore[side] = true; continue }
        wait[side] = skill < 1 ? rnd() * (1 - skill) * 0.16 : 0
      }
      if ((wait[side] -= h) > 0) continue
      wait[side] = -1
      sim.setFlipper(side, true)
      hold[side] = 0.22
    }
  }
}

/** La bille est-elle là où le batteur, en se levant, va la frapper ? */
export function onFlipper(f: Flipper, b: { x: number; y: number; vy: number }): boolean {
  const rx = f.s * (b.x - f.px), ry = b.y - f.py
  const d = Math.hypot(rx, ry)
  if (d < 0.42 || d > f.len + R + 0.12) return false
  const a = Math.atan2(ry, rx)
  if (a < f.rest - 0.22 || a > f.up + 0.1) return false
  return b.vy < 1.5
}
