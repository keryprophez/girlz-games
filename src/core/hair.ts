/* @version 2026-11-25 00:20 */
/* Les cheveux du Salon de coiffure (23/11) — la physique, sans rien dessiner.

   Pourquoi : trois essais ratés avant celui-ci (une tête en formes
   simples, une illustration plate qu'on découpait, des rubans étirés). Les
   jeux de coiffure qui marchent traitent les cheveux comme des objets : ici,
   quelques centaines de mèches « guides », chacune une chaîne de points,
   que le rendu (`hair3d.ts`) habille de milliers de fils.

   Les règles du père (22/11) : le doigt tient la mèche SANS retard (aucun
   lissage du geste : c'était le « ça traîne »), et rien ne tremble au repos.

   La méthode (« position based dynamics ») :
   - un pas FIXE (`STEP`), donc le même mouvement à 30 ou à 120 images/s ;
   - Verlet amorti + gravité ; la racine et le point suivant sont posés sur
     le crâne (la mèche part du cuir chevelu, dans son sens de pousse) ;
   - la longueur : chaque point est replacé à sa distance exacte du point
     d'avant (« follow the leader », Müller 2012), donc une mèche ne s'étire
     JAMAIS, même pressée contre l'épaule ; la correction est rendue à la
     vitesse du point précédent (sinon les cheveux paraissent raides) ;
   - un peu de raideur (un point sur deux) ;
   - collisions avec la VRAIE tête (`SkullMap`, son rayon dans chaque
     direction) et des ellipsoïdes (visage, cou, épaules), tous dans le
     repère de la tête. Chaque mèche a sa couche (`lift`) : elles ne se
     posent pas toutes à la même distance du crâne, d'où le volume. (Le
     24/11 : un simple ovale passait jusqu'à 14 % SOUS le cuir chevelu ; les
     mèches en sortaient, y replongeaient, la tête avait l'air d'un toit de
     chaume) ;
   - une mèche TENUE (`grab`, `hand`) va de sa racine à la main en glissant
     sur le crâne, TENDUE, et le reste de sa longueur pend sous la main : on
     fait coulisser les cheveux, comme pour une vraie queue de cheval. (Un
     point de la mèche cloué au doigt laissait tout le surplus se mettre en
     pelote entre la racine et lui.) Posée dans l'attache (`tie`), elle suit
     le même chemin : rien ne saute quand on la lâche ;
   - une FORME DE REPOS (`rest`, dans le repère de la tête) : la mèche y
     revient doucement (`SHAPE`). Elle est calculée une fois (`bake` : les
     cheveux tombent, très amortis, jusqu'à s'arrêter) — la physique ne
     simule plus que les écarts (la tête qui tourne, le doigt, la brosse),
     donc la chevelure se repose TOUJOURS, sans glisser sans fin sur les
     épaules. C'est aussi la mémoire de la coiffure : une queue de cheval,
     une tresse, une mèche brossée, c'est une autre forme de repos ;
   - une mèche sur deux à chaque pas (pas double) : deux fois moins de calcul,
     et à 60 images par seconde chacune avance d'un pas par image ; les mèches
     tenues, elles, à chaque pas (le doigt, sans retard) ;
   - le SOMMEIL, comme dans les moteurs physiques : une mèche qui n'a
     presque pas bougé depuis un quart de seconde est figée et n'est plus
     calculée (les contacts avec le crâne entretiennent sinon un
     micro-cycle qui fait vibrer) ; elle se réveille quand la tête tourne,
     quand le doigt ou la brosse la touche, quand le vent souffle.

   Unités : le rayon de la tête vaut 1. La tête tourne autour de son centre
   (`head`), qui est à l'origine du repère de la tête. Logique pure : aucun
   DOM, aucune 3D — testée dans `hair.test.ts`. */

export type V3 = [number, number, number]

/** Un ellipsoïde : centre et demi-axes (repère de la tête ou du monde). */
export interface Ellipsoid { c: V3; r: V3 }

export interface HairInit {
  /** Racine (repère de la tête) et direction de pousse (unitaire). */
  roots: V3[]
  dirs: V3[]
  /** Longueur de chaque mèche. */
  lengths: number[]
  /** Couche : distance gardée au-dessus des obstacles. */
  lifts: number[]
}

/** Le pas de la physique (s). */
export const STEP = 1 / 120
/** Au-delà, une image trop longue (onglet caché, à-coup) ne rattrape pas tout. */
const MAX_STEPS = 5
/** Pesanteur, en rayons de tête par s² (une tête ≈ 9 cm). */
export const GRAVITY = 45
/** La résistance de l'air (par s) : faible à la racine, forte aux pointes,
    qui flottent (le père, 23/11 : « trop rigide, comme lourds », « la
    retombée trop rapide »). */
const AIR: [number, number] = [6, 12]
const ITER = 2
const BEND = 0.12
/** La part de la correction de longueur rendue à la vitesse (Müller : 0,9). */
const FTL_DAMP = 0.45
/** Le frottement au contact (part de la vitesse perdue par pas). */
const FRICTION = 0.12
/** Le retour vers la forme de repos, par pas double (près de la racine → pointe). */
const SHAPE: [number, number] = [0.078, 0.012]
/** Une mèche dont aucun point n'a bougé de plus que ça en `NAP` pas s'endort. */
const SLEEP = 4e-3
const NAP = 30
/** Le temps qu'une mèche met à glisser jusqu'à son attache, ou dans la main (s). */
const TIE_S = 0.35
const GRAB_S = 0.2
/** Le temps laissé à la queue pour pendre, avant de garder sa pose (s). */
const TAIL_S = 1.2
/** Une mèche tenue ou attachée : ses points 0 à `HOLD` vont de la racine à la
    main (ou au bout du faisceau, l'attache au point d'avant) ; les autres pendent. */
export const HOLD = 8
/** La longueur du faisceau serré, entre l'attache et la queue libre. */
const BUNDLE = 0.17
/** La part de la mèche qu'on peut tendre : au-delà, elle n'atteint plus la main. */
const REACH = 0.9
const smooth = (t: number) => t * t * (3 - 2 * t)

/** Le rayon de la vraie tête dans chaque direction (une petite carte
    octaédrique, lue par interpolation) : les racines, les collisions et la
    calotte s'y posent toutes, donc rien ne passe dessous. */
export class SkullMap {
  readonly n: number
  readonly r: Float32Array
  /** Le plus grand rayon (au-delà, aucun contact possible). */
  max = 0
  constructor(n = 36) { this.n = n; this.r = new Float32Array(n * n) }

  /** La direction d'un nœud de la carte. */
  dir(i: number, j: number): V3 {
    let u = i / (this.n - 1) * 2 - 1, v = j / (this.n - 1) * 2 - 1
    const y = 1 - Math.abs(u) - Math.abs(v)
    if (y < 0) { const a = u; u = (1 - Math.abs(v)) * (a < 0 ? -1 : 1); v = (1 - Math.abs(a)) * (v < 0 ? -1 : 1) }
    const l = Math.hypot(u, y, v) || 1
    return [u / l, y / l, v / l]
  }

  /** La carte d'un nuage de points de la surface (x, y, z à la suite) : dans
      chaque direction, le point le plus haut (une tête a des couches dessous),
      puis une moyenne douce (`soft`, en radians). `floor` : l'ovale (ou la
      carte) de secours là où il n'y a aucun point. */
  static from(points: ArrayLike<number>, floor: Ellipsoid | SkullMap, soft = 0.1, n = 36) {
    const m = new SkullMap(n), raw = new Float32Array(n * n)
    const under = (x: number, y: number, z: number) => floor instanceof SkullMap ? floor.at(x, y, z) : 1 / Math.hypot(x / floor.r[0], y / floor.r[1], z / floor.r[2])
    // chaque point monte les quatre nœuds qui l'entourent
    for (let k = 0; k < points.length; k += 3) {
      const x = points[k], y = points[k + 1], z = points[k + 2], l = Math.hypot(x, y, z)
      const [fx, fy] = m.uv(x, y, z), i = Math.min(n - 2, fx | 0), j = Math.min(n - 2, fy | 0), a = j * n + i
      for (const q of [a, a + 1, a + n, a + n + 1]) if (raw[q] < l) raw[q] = l
    }
    const dirs: V3[] = [], far = Math.cos(soft * 2.4)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const d = m.dir(i, j)
      dirs.push(d)
      if (!points.length) raw[j * n + i] = under(...d)
    }
    for (let a = 0; a < dirs.length; a++) {
      const [dx, dy, dz] = dirs[a]
      let sum = 0, w = 0
      for (let b = 0; b < dirs.length; b++) {
        const e = dirs[b], c = dx * e[0] + dy * e[1] + dz * e[2]
        if (c < far || !raw[b]) continue
        const g = Math.exp(-2 * (1 - c) / (soft * soft))
        sum += raw[b] * g; w += g
      }
      m.r[a] = w > 1e-6 ? sum / w : under(dx, dy, dz)
      m.max = Math.max(m.max, m.r[a])
    }
    return m
  }

  /** La place d'une direction sur la carte. */
  private uv(x: number, y: number, z: number): [number, number] {
    const l1 = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1e-9
    let u = x / l1, v = z / l1
    if (y < 0) { const a = u; u = (1 - Math.abs(v)) * (a < 0 ? -1 : 1); v = (1 - Math.abs(a)) * (v < 0 ? -1 : 1) }
    return [(u * 0.5 + 0.5) * (this.n - 1), (v * 0.5 + 0.5) * (this.n - 1)]
  }

  /** Un ovale en carte (les tests, ou sans modèle). */
  static ellipsoid(e: Ellipsoid, n = 36) { return SkullMap.from([], e, 0.03, n) }

  /** Le rayon dans la direction (x, y, z), de longueur quelconque. */
  at(x: number, y: number, z: number) {
    const l1 = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1e-9
    let u = x / l1, v = z / l1
    if (y < 0) { const a = u; u = (1 - Math.abs(v)) * (a < 0 ? -1 : 1); v = (1 - Math.abs(a)) * (v < 0 ? -1 : 1) }
    const n = this.n, fx = (u * 0.5 + 0.5) * (n - 1), fy = (v * 0.5 + 0.5) * (n - 1)
    const i = Math.min(n - 2, fx | 0), j = Math.min(n - 2, fy | 0), a = fx - i, b = fy - j, k = j * n + i, r = this.r
    return (r[k] * (1 - a) + r[k + 1] * a) * (1 - b) + (r[k + n] * (1 - a) + r[k + n + 1] * a) * b
  }
}

/* Tout est calculé dans le REPÈRE DE LA TÊTE : les racines, la forme de
   repos et les obstacles y sont fixes. Quand la tête tourne, les points
   (et leur position précédente) sont tournés à l'envers : dans le monde,
   ils n'ont pas bougé, et l'inertie fait le balancement. La pesanteur et le
   vent sont tournés dans ce repère. Le rendu tourne avec la tête. */
export class Hair {
  readonly G: number
  readonly P: number
  /** Positions (repère de la tête), mèche par mèche : (g × P + i) × 3. */
  readonly pos: Float32Array
  readonly prev: Float32Array
  readonly seg: Float32Array
  readonly lift: Float32Array
  readonly rootL: Float32Array
  readonly dirL: Float32Array
  /** La tête : rotation (matrice 3×3, lignes : tête → monde). */
  readonly rot = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
  /** Le vent ou le sèche-cheveux : une accélération (monde). */
  readonly wind = new Float32Array(3)
  /** La forme de repos, point par point. */
  readonly rest: Float32Array
  /** Le retour à la forme de repos, mèche par mèche (0 : libre). */
  readonly shape: Float32Array
  /** Mèches endormies (figées, non calculées). */
  readonly asleep: Uint8Array
  /** Les mèches TENUES ou ATTACHÉES : `HOLD` (−1 : libre). Leurs points 0 à
      `HOLD` sont posés sur leur chemin (sans calcul) ; au-delà, la queue est
      libre et se balance. */
  readonly tieIdx: Int16Array
  /** Tenue par la main (1), ou posée dans une attache (0). */
  readonly held: Uint8Array
  readonly tiePath: Float32Array
  readonly tieFrom: Float32Array
  /** Le trajet vers la main ou l'attache : 0 → 1 (puis la queue se pose). */
  readonly tieT: Float32Array
  /** La part de la longueur entre la racine et `HOLD` (le reste pend). */
  readonly arc: Float32Array
  /** Les segments de la queue libre (une mèche tenue ou attachée). */
  readonly segB: Float32Array
  /** Où la main tient la mèche (petit écart à son centre), et le trajet de
      la main depuis la prise. */
  private readonly grip: Float32Array
  private readonly handAt = new Float32Array(3)
  private readonly handFrom: Float32Array
  /** Le temps que chaque mèche met à venir dans la main (s). */
  private readonly grabS: Float32Array
  /** Le premier point, couché sur le cuir chevelu dans le sens de pousse. */
  private readonly p1: Float32Array
  private map: SkullMap | null = null
  private nu: SkullMap | null = null
  private yaw = 0
  private cols: Ellipsoid[] = []
  /** Les ellipsoïdes à plat : centre puis demi-axes. */
  private flat = new Float32Array(0)
  private nap = 0
  private snap = new Float32Array(0)
  private fix: Float32Array
  private acc = 0
  private tick = 0

  constructor(init: HairInit, P = 16) {
    const G = init.roots.length
    this.G = G
    this.P = P
    this.pos = new Float32Array(G * P * 3)
    this.prev = new Float32Array(G * P * 3)
    this.fix = new Float32Array(G * P * 3)
    this.seg = new Float32Array(G)
    this.lift = new Float32Array(G)
    this.rootL = new Float32Array(G * 3)
    this.dirL = new Float32Array(G * 3)
    this.p1 = new Float32Array(G * 3)
    this.rest = new Float32Array(G * P * 3)
    this.shape = new Float32Array(G).fill(1)
    this.asleep = new Uint8Array(G)
    this.tieIdx = new Int16Array(G).fill(-1)
    this.held = new Uint8Array(G)
    this.tiePath = new Float32Array(G * (HOLD + 1) * 3)
    this.tieFrom = new Float32Array(G * (HOLD + 1) * 3)
    this.tieT = new Float32Array(G)
    this.arc = new Float32Array(G)
    this.segB = new Float32Array(G)
    this.grip = new Float32Array(G * 3)
    this.handFrom = new Float32Array(G * 3)
    this.grabS = new Float32Array(G).fill(GRAB_S)
    for (let g = 0; g < G; g++) {
      this.rootL.set(init.roots[g], g * 3)
      this.dirL.set(init.dirs[g], g * 3)
      this.seg[g] = init.lengths[g] / (P - 1)
      this.lift[g] = init.lifts[g]
    }
    this.layRoots()
    this.settleStraight()
  }

  /** Les obstacles, dans le repère de la tête. Avec une carte du crâne, le
      premier est la garde du visage ; sans carte, c'est le crâne. */
  get headColliders() { return this.cols }
  set headColliders(e: Ellipsoid[]) {
    this.cols = e
    this.flat = new Float32Array(e.flatMap(o => [...o.c, ...o.r]))
  }

  /** La vraie tête : les racines y sont posées. */
  get skull() { return this.map }
  set skull(m: SkullMap | null) { this.map = this.nu = m; this.seat() }

  /** Le crâne NU, sans les oreilles : les racines y sont posées, les mèches
      tenues ou tirées glissent dessus (avec les oreilles, une chevelure tirée
      les recouvrait : deux bosses, le 24/11). Lâchés, les cheveux passent
      par-dessus les oreilles (`skull`). */
  get bare() { return this.nu }
  set bare(m: SkullMap | null) { this.nu = m; this.seat() }

  private seat() {
    const m = this.nu
    if (m) for (let g = 0; g < this.G; g++) {
      const k = g * 3, x = this.rootL[k], y = this.rootL[k + 1], z = this.rootL[k + 2], f = m.at(x, y, z) / (Math.hypot(x, y, z) || 1)
      this.rootL[k] = x * f; this.rootL[k + 1] = y * f; this.rootL[k + 2] = z * f
    }
    this.layRoots()
    this.settleStraight()
  }

  /** Change le sens de pousse d'une mèche (la raie). */
  setDir(g: number, x: number, y: number, z: number) {
    const k = g * 3, l = Math.hypot(x, y, z) || 1
    this.dirL[k] = x / l; this.dirL[k + 1] = y / l; this.dirL[k + 2] = z / l
    this.layRoots(g)
    this.wake(g)
  }

  /** Le premier point : dans le sens de pousse, mais COUCHÉ sur le cuir
      chevelu (tout droit, il s'en décollait et la mèche y revenait : une écaille). */
  private layRoots(only?: number) {
    const r = this.rootL, d = this.dirL
    for (let g = only ?? 0; g < (only === undefined ? this.G : only + 1); g++) {
      const k = g * 3, s = this.seg[g]
      const R = Math.hypot(r[k], r[k + 1], r[k + 2])
      let x = r[k] + d[k] * s, y = r[k + 1] + d[k + 1] * s, z = r[k + 2] + d[k + 2] * s
      for (let it = 0; it < 4; it++) {
        const l = Math.hypot(x, y, z) || 1, f = (this.nu ? this.nu.at(x, y, z) + 0.012 : Math.max(R, Math.min(l, R + 0.02))) / l
        x *= f; y *= f; z *= f
        // (toujours à sa longueur de la racine)
        const e = s / (Math.hypot(x - r[k], y - r[k + 1], z - r[k + 2]) || 1)
        x = r[k] + (x - r[k]) * e; y = r[k + 1] + (y - r[k + 1]) * e; z = r[k + 2] + (z - r[k + 2]) * e
      }
      this.p1[k] = x; this.p1[k + 1] = y; this.p1[k + 2] = z
    }
  }

  /** Laisse tomber les cheveux, très amortis et sans forme de repos, puis
      garde leur pose comme forme de repos. */
  bake(seconds = 6) {
    // la MÊME physique que pendant le jeu, jusqu’à l’arrêt :
    // une forme de repos photographiée en pleine chute (une mèche encore
    // repliée autour du cou) ne serait jamais atteinte, et la mèche
    // glisserait sans fin pour essayer
    const keep = this.shape.slice()
    this.shape.fill(0)
    this.wake()
    for (let i = 0; i < Math.round(seconds / STEP); i++) this.step(STEP)
    this.shape.set(keep)
    this.keepPose()
    this.wake()
  }

  /** La pose actuelle devient la forme de repos (une coiffure finie). */
  keepPose(only?: Iterable<number>) {
    const n = this.P * 3
    if (!only) { this.rest.set(this.pos); this.prev.set(this.pos); return }
    for (const g of only) {
      this.rest.set(this.pos.subarray(g * n, (g + 1) * n), g * n)
      this.prev.set(this.pos.subarray(g * n, (g + 1) * n), g * n)
    }
  }

  /** Remet tout comme au début (une pose, une forme de repos, un sens de pousse gardés). */
  restore(o: { pos: Float32Array; rest: Float32Array; dir: Float32Array }) {
    this.tieIdx.fill(-1); this.held.fill(0); this.shape.fill(1)
    this.pos.set(o.pos); this.prev.set(o.pos); this.rest.set(o.rest); this.dirL.set(o.dir)
    this.layRoots()
    this.wake()
  }

  /** Pose chaque mèche droite dans son sens de pousse puis vers le bas. */
  settleStraight() {
    const { G, P, pos, rootL: r, p1 } = this
    for (let g = 0; g < G; g++) {
      const s = this.seg[g], k3 = g * 3, b = g * P * 3
      pos.set([r[k3], r[k3 + 1], r[k3 + 2], p1[k3], p1[k3 + 1], p1[k3 + 2]], b)
      let dx = p1[k3] - r[k3], dy = p1[k3 + 1] - r[k3 + 1], dz = p1[k3 + 2] - r[k3 + 2]
      for (let i = 2; i < P; i++) {
        dx *= 0.5; dy = dy * 0.5 - s * 0.5; dz *= 0.5
        const n = Math.hypot(dx, dy, dz) || 1, k = b + i * 3
        pos[k] = pos[k - 3] + dx / n * s; pos[k + 1] = pos[k - 2] + dy / n * s; pos[k + 2] = pos[k - 1] + dz / n * s
      }
    }
    this.prev.set(pos)
    this.rest.set(pos)
  }

  /** Racine de la mèche g (repère de la tête). */
  root(g: number): V3 { return [this.rootL[g * 3], this.rootL[g * 3 + 1], this.rootL[g * 3 + 2]] }

  /** Tourne la tête : lacet (autour de y) puis tangage (autour de x). Les
      cheveux, eux, restent où ils étaient dans le monde. `snap` : la tête
      est posée là d'un coup, les cheveux avec elle (au chargement). `carry` :
      la part du lacet qui les emmène avec elle (la tête qui tourne SEULE :
      sinon les mèches de devant passent sur le visage). */
  setHead(yaw: number, pitch: number, snap = false, carry = 0) {
    const turn = yaw - this.yaw
    this.yaw = yaw
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch)
    // R = Ry(yaw) · Rx(pitch)
    const n = [cy, sy * sp, sy * cp, 0, cp, -sp, -sy, cy * sp, cy * cp], o = this.rot
    let same = true
    for (let i = 0; i < 9; i++) if (Math.abs(n[i] - o[i]) > 1e-7) { same = false; break }
    if (same) return
    if (snap) { this.rot.set(n); return }
    // Δ = Rnewᵀ · Rold : du repère de l'ancienne tête à celui de la nouvelle
    const D = new Float64Array(9)
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) D[r * 3 + c] = n[r] * o[c] + n[3 + r] * o[3 + c] + n[6 + r] * o[6 + c]
    if (carry && !pitch) { const a = -turn * (1 - carry), c = Math.cos(a), n = Math.sin(a); D.set([c, 0, n, 0, 1, 0, -n, 0, c]) }
    const d0 = D[0], d1 = D[1], d2 = D[2], d3 = D[3], d4 = D[4], d5 = D[5], d6 = D[6], d7 = D[7], d8 = D[8]
    // (la racine, et ce qui est posé sur un chemin, tournent AVEC la tête)
    for (let g = 0; g < this.G; g++) {
      const b = g * this.P * 3, end = b + this.P * 3, k0 = b + (this.tieIdx[g] >= 0 ? HOLD + 1 : 2) * 3
      for (const a of [this.pos, this.prev]) for (let k = k0; k < end; k += 3) {
        const x = a[k], y = a[k + 1], z = a[k + 2]
        a[k] = d0 * x + d1 * y + d2 * z
        a[k + 1] = d3 * x + d4 * y + d5 * z
        a[k + 2] = d6 * x + d7 * y + d8 * z
      }
    }
    this.rot.set(n)
    this.wake()
  }

  /** Réveille une mèche (ou toutes). */
  wake(g?: number) {
    if (g === undefined) this.asleep.fill(0)
    else this.asleep[g] = 0
  }

  /* ---- La main ---- */

  /** Prend la mèche g à la distance `a` (le long de la mèche) de sa racine.
      La mèche ne bouge pas : elle est seulement redécoupée, la main au point
      `HOLD`. `grip` : où elle ira dans la main (écart à son centre). */
  grab(g: number, a: number, hand: V3, grip: V3) {
    this.cut(g, a)
    const b = g * this.P * 3, n = (HOLD + 1) * 3
    this.tieFrom.set(this.pos.subarray(b, b + n), g * n)
    this.tiePath.set(this.pos.subarray(b, b + n), g * n)
    this.tieIdx[g] = HOLD
    this.held[g] = 1
    this.tieT[g] = 0
    this.shape[g] = 0
    this.grip.set(grip, g * 3)
    this.handFrom.set(hand, g * 3)
    this.handAt.set(hand)
    // (prise de loin, elle vient moins vite : d'un coup, elle faisait une boucle)
    const e = b + HOLD * 3, far = Math.hypot(this.pos[e] - hand[0] - grip[0], this.pos[e + 1] - hand[1] - grip[1], this.pos[e + 2] - hand[2] - grip[2])
    this.grabS[g] = GRAB_S + 0.4 * Math.min(1, Math.max(0, far - 0.3))
    this.wake(g)
  }

  /** La main bouge (repère de la tête) : chaque mèche tenue se tend de sa
      racine jusqu'à elle, sur le crâne, par-dessus les autres. */
  hand(at: V3) {
    this.handAt.set(at)
    // plus il reste de cheveux lâchés, plus elle passe haut (la dernière
    // poignée, seule sur le crâne, y faisait une bosse)
    let free = 0
    for (let g = 0; g < this.G; g++) if (this.tieIdx[g] < 0) free++
    const over = 0.05 + 0.11 * Math.min(1, free / this.G * 2)
    for (let g = 0; g < this.G; g++) {
      if (!this.held[g]) continue
      const k = g * 3
      this.route(g, at[0] + this.grip[k], at[1] + this.grip[k + 1], at[2] + this.grip[k + 2], HOLD, 4, 0.02, over)
      this.wake(g)
    }
  }

  /** Attache la mèche g en `target` (une queue de cheval, une couette) : son
      chemin sur le crâne jusque-là, un court faisceau qui sort de la tête,
      puis la queue libre. `delay` (s) : elle part un peu plus tard. `drop` :
      à quel point le faisceau plonge (une tresse à la nuque tombe tout de suite). */
  tie(g: number, target: V3, delay = 0, drop = 0.35) {
    const n = (HOLD + 1) * 3, b = g * this.P * 3, r = this.rootL, k3 = g * 3
    const d = Math.hypot(target[0] - r[k3], target[1] - r[k3 + 1], target[2] - r[k3 + 2])
    // l'ordre des couches : les cheveux qui viennent de loin (le front)
    // passent PAR-DESSUS ceux qui partent près de l'attache, comme sur une
    // vraie queue de cheval (au hasard, on voyait le départ de chaque mèche :
    // des écailles)
    const lift = 0.01 + 0.028 * Math.min(1, d / 2.4)
    // une mèche encore libre : redécoupée là où l'attache la tiendra
    if (this.tieIdx[g] < 0) this.cut(g, d * 1.3 + BUNDLE)
    this.tieFrom.set(this.pos.subarray(b, b + n), g * n)
    this.tiePath.set(this.pos.subarray(b, b + n), g * n)
    this.route(g, target[0], target[1], target[2], HOLD - 1, 40, lift, lift)
    // le FAISCEAU : la queue sort d'abord de la tête, vers l'arrière et un
    // peu vers le bas, en un court faisceau serré où se pose l'élastique —
    // perpendiculaire au flux des cheveux (le père, 24/11 : un élastique
    // couché à l'horizontale « rentre dans la tête ») ; puis elle retombe
    const T = this.tiePath, a0 = g * n + (HOLD - 1) * 3
    const ox = target[0], oy = target[1] - drop * Math.hypot(...target), oz = target[2], ol = Math.hypot(ox, oy, oz) || 1
    T[a0 + 3] = T[a0] + ox / ol * BUNDLE; T[a0 + 4] = T[a0 + 1] + oy / ol * BUNDLE; T[a0 + 5] = T[a0 + 2] + oz / ol * BUNDLE
    this.measure(g)
    this.tieIdx[g] = HOLD
    this.held[g] = 0
    this.tieT[g] = -delay / TIE_S
    this.shape[g] = 0
    this.wake(g)
  }

  /** Lâche ou détache la mèche g : elle retombe vers sa forme de repos. */
  untie(g: number) {
    if (this.tieIdx[g] >= 0) this.uncut(g)
    this.tieIdx[g] = -1
    this.held[g] = 0
    this.shape[g] = 1
    this.wake(g)
  }

  /** À quel point la mèche g est rendue « tirée » (0..1). */
  tiedLook(g: number) {
    return this.tieIdx[g] < 0 || this.held[g] ? 0 : smooth(Math.min(1, Math.max(0, (this.tieT[g] - 0.65) / 0.35)))
  }

  /** Redécoupe la mèche, sans la bouger : les points 0 à `HOLD` sur ses `a`
      premiers rayons de tête, les autres sur le reste. */
  private cut(g: number, a: number) {
    const L = this.seg[g] * (this.P - 1), len = Math.min(Math.max(a, L * 0.08), L * REACH)
    this.resample(g, i => i <= HOLD ? len * i / HOLD : len + (L - len) * (i - HOLD) / (this.P - 1 - HOLD))
    this.arc[g] = len / L
    this.segB[g] = (L - len) / (this.P - 1 - HOLD)
  }

  /** L'inverse : des segments tous égaux. */
  private uncut(g: number) { this.resample(g, i => i * this.seg[g]) }

  private resample(g: number, dist: (i: number) => number) {
    const { P, pos, prev } = this, b = g * P * 3
    const old = pos.slice(b, b + P * 3), acc = [0]
    for (let i = 1; i < P; i++) acc.push(acc[i - 1] + Math.hypot(old[i * 3] - old[i * 3 - 3], old[i * 3 + 1] - old[i * 3 - 2], old[i * 3 + 2] - old[i * 3 - 1]))
    for (let i = 1, j = 1; i < P; i++) {
      const d = Math.min(dist(i), acc[P - 1])
      while (j < P - 1 && acc[j] < d) j++
      const u = Math.min(1, Math.max(0, (d - acc[j - 1]) / (acc[j] - acc[j - 1] || 1)))
      for (let x = 0; x < 3; x++) pos[b + i * 3 + x] = prev[b + i * 3 + x] = old[j * 3 - 3 + x] + (old[j * 3 + x] - old[j * 3 - 3 + x]) * u
    }
  }

  /** Le chemin tendu de la racine à (x, y, z), sur le crâne : une corde,
      relâchée et ramenée à la surface (`its` fois ; beaucoup : repartie de
      zéro). Trop loin : la mèche est tendue vers la main, sans l'atteindre. */
  private route(g: number, x: number, y: number, z: number, end: number, its: number, lift0: number, lift1: number) {
    const T = this.tiePath, b = g * (HOLD + 1) * 3, k3 = g * 3, r = this.rootL, e = b + end * 3
    T[b] = r[k3]; T[b + 1] = r[k3 + 1]; T[b + 2] = r[k3 + 2]
    T[e] = x; T[e + 1] = y; T[e + 2] = z
    if (its > 10) for (let i = 1; i < end; i++) {
      const u = i / end, k = b + i * 3
      T[k] = T[b] + (x - T[b]) * u; T[k + 1] = T[b + 1] + (y - T[b + 1]) * u; T[k + 2] = T[b + 2] + (z - T[b + 2]) * u
    }
    for (let it = 0; it < its * 2; it++) for (let n = 1; n < end; n++) {
      // (un aller, un retour : le relâchement ne penche d'aucun côté)
      const i = it & 1 ? end - n : n, k = b + i * 3
      T[k] = (T[k - 3] + T[k + 3]) / 2; T[k + 1] = (T[k - 2] + T[k + 4]) / 2; T[k + 2] = (T[k - 1] + T[k + 5]) / 2
      // (elle ne monte que près de la main : au bord de la tête, elle y faisait des marches)
      this.push(T, k, lift0 + (lift1 - lift0) * Math.min(1, (i / end) ** 2 * 1.8))
    }
    const acc = [0]
    for (let i = 1; i <= end; i++) { const k = b + i * 3; acc.push(acc[i - 1] + Math.hypot(T[k] - T[k - 3], T[k + 1] - T[k - 2], T[k + 2] - T[k - 1])) }
    const len = acc[end], max = this.seg[g] * (this.P - 1) * REACH
    // (une mèche attachée atteint toujours son attache : seule sa queue est plus courte)
    if (len > max && end === HOLD) {
      const old = T.slice(b, e + 3)
      for (let i = 1, j = 1; i <= end; i++) {
        const d = max * i / end
        while (j < end && acc[j] < d) j++
        const u = (d - acc[j - 1]) / (acc[j] - acc[j - 1] || 1)
        for (let q = 0; q < 3; q++) T[b + i * 3 + q] = old[j * 3 - 3 + q] + (old[j * 3 + q] - old[j * 3 - 3 + q]) * u
      }
    }
    if (end === HOLD) this.measure(g)
  }

  /** La longueur du chemin → ce qui reste à pendre. */
  private measure(g: number) {
    const T = this.tiePath, b = g * (HOLD + 1) * 3, L = this.seg[g] * (this.P - 1)
    let len = 0
    for (let i = 1; i <= HOLD; i++) { const k = b + i * 3; len += Math.hypot(T[k] - T[k - 3], T[k + 1] - T[k - 2], T[k + 2] - T[k - 1]) }
    this.arc[g] = Math.min(0.97, len / L)
    this.segB[g] = Math.max(L * 0.03, L - len) / (this.P - 1 - HOLD)
  }

  /** Un point d'un chemin, ramené au-dessus du crâne, du cou et des épaules (pas de la garde du visage). */
  private push(T: Float32Array, k: number, m: number) {
    const map = this.nu, F = this.flat
    if (map) {
      const x = T[k], y = T[k + 1], z = T[k + 2], l = Math.sqrt(x * x + y * y + z * z)
      if (l < map.max + m && l > 1e-6) { const R = map.at(x, y, z) + m; if (l < R) { const f = R / l; T[k] = x * f; T[k + 1] = y * f; T[k + 2] = z * f } }
    }
    for (let c = map ? 6 : 0; c < F.length; c += 6) pushOut(T, k, m, F, c)
  }

  /** Un point ramené hors des obstacles (la tête, le visage, le cou). */
  outside(p: V3, lift: number): V3 {
    const T = new Float32Array(p)
    for (let pass = 0; pass < 3; pass++) { this.push(T, 0, lift); if (this.nu && this.flat.length) pushOut(T, 0, lift, this.flat, 0) }
    return [T[0], T[1], T[2]]
  }

  /** Avance la simulation du temps réel écoulé, par pas fixes. */
  advance(dt: number) {
    this.acc = Math.min(this.acc + dt, STEP * MAX_STEPS)
    while (this.acc >= STEP) {
      this.step(STEP)
      this.acc -= STEP
    }
  }

  step(h1: number) {
    const { G, P, pos, prev, wind, asleep, rest, shape, rot: R, p1, rootL: r, tieT, tieFrom: F, tiePath: T } = this
    if (wind[0] || wind[1] || wind[2]) asleep.fill(0)
    const h = h1 * 2, h2 = h * h, odd = this.tick++ & 1
    // la pesanteur et le vent, dans le repère de la tête (Rᵀ · a)
    const ax = wind[0], ay = wind[1] - GRAVITY, az = wind[2]
    const gx = (R[0] * ax + R[3] * ay + R[6] * az) * h2
    const gy = (R[1] * ax + R[4] * ay + R[7] * az) * h2
    const gz = (R[2] * ax + R[5] * ay + R[8] * az) * h2
    for (let g = 0; g < G; g++) {
      if (asleep[g] || ((g & 1) !== odd && !this.held[g])) continue
      const base = g * P, k0 = base * 3, k3 = g * 3, m = shape[g], tied = this.tieIdx[g] >= 0
      const s = tied ? this.segB[g] : this.seg[g], lift = this.lift[g]
      pos[k0] = prev[k0] = r[k3]; pos[k0 + 1] = prev[k0 + 1] = r[k3 + 1]; pos[k0 + 2] = prev[k0 + 2] = r[k3 + 2]
      let first = 2
      if (tied) {
        const held = this.held[g]
        tieT[g] = Math.min(1 + TAIL_S / TIE_S, tieT[g] + (held ? h1 / this.grabS[g] : h / TIE_S))
        // sur son chemin, jusqu'à la main ou au bout du faisceau ; en fondu
        // depuis la pose de la prise (qui suit déjà la main : aucun retard)
        const u = smooth(Math.min(1, Math.max(0, tieT[g]))), v = 1 - u, b = g * (HOLD + 1) * 3
        const sx = held ? this.handAt[0] - this.handFrom[k3] : 0, sy = held ? this.handAt[1] - this.handFrom[k3 + 1] : 0, sz = held ? this.handAt[2] - this.handFrom[k3 + 2] : 0
        for (let i = 1; i <= HOLD; i++) {
          const k = k0 + i * 3, q = b + i * 3, w = i / HOLD
          pos[k] = (F[q] + sx * w) * v + T[q] * u; pos[k + 1] = (F[q + 1] + sy * w) * v + T[q + 1] * u; pos[k + 2] = (F[q + 2] + sz * w) * v + T[q + 2] * u
          if (v > 0 && i < HOLD - 1) this.push(pos, k, 0.012)
          prev[k] = pos[k]; prev[k + 1] = pos[k + 1]; prev[k + 2] = pos[k + 2]
        }
        first = HOLD + 1
      } else {
        pos[k0 + 3] = prev[k0 + 3] = p1[k3]; pos[k0 + 4] = prev[k0 + 4] = p1[k3 + 1]; pos[k0 + 5] = prev[k0 + 5] = p1[k3 + 2]
      }
      // la forme de repos est DÉJÀ la pose tombée sous la pesanteur : la
      // remettre par-dessus ferait glisser lentement les mèches posées sur
      // l'épaule vers une pose plus basse ; il n'en reste qu'une part
      // (une mèche tenue avance à chaque pas : un pas simple, pesanteur au quart)
      const full = this.held[g] ? 0.25 : 1, gw = (1 - 0.9 * m) * full, wx = gx * gw, wy = gy * gw, wz = gz * gw, air = (tied ? 1.6 : 1) * (this.held[g] ? h1 : h)
      for (let i = first; i < P; i++) {
        const k = k0 + i * 3, e = (i - 2) / (P - 3)
        // Verlet amorti (l'air freine davantage les pointes) + pesanteur
        const damp = Math.max(0, 1 - (AIR[0] + (AIR[1] - AIR[0]) * e) * air)
        let x = pos[k] + (pos[k] - prev[k]) * damp + wx, y = pos[k + 1] + (pos[k + 1] - prev[k + 1]) * damp + wy, z = pos[k + 2] + (pos[k + 2] - prev[k + 2]) * damp + wz
        prev[k] = pos[k]; prev[k + 1] = pos[k + 1]; prev[k + 2] = pos[k + 2]
        // vers la forme de repos
        // (le rebond — le père, 23/11 : « trop bouncy » — est tenu par la
        // résistance de l'air, assez forte pour qu'il n'y ait pas d'aller-retour)
        if (m) {
          const f = (SHAPE[0] + (SHAPE[1] - SHAPE[0]) * e) * m
          x += (rest[k] - x) * f; y += (rest[k + 1] - y) * f; z += (rest[k + 2] - z) * f
        } else if (tied && i < HOLD + 3 && !this.held[g]) {
          // au sortir de l'élastique, la queue garde un peu du sens du
          // faisceau : elle retombe en arc, elle ne se casse pas net
          const v = (HOLD + 3 - i) / 3, q = g * (HOLD + 1) * 3 + HOLD * 3
          const bx = (T[q] - T[q - 3]) / BUNDLE * v, by = (T[q + 1] - T[q - 2]) / BUNDLE * v - (1 - v), bz = (T[q + 2] - T[q - 1]) / BUNDLE * v
          const n = s / (Math.sqrt(bx * bx + by * by + bz * bz) || 1)
          x += (pos[k - 3] + bx * n - x) * 0.1; y += (pos[k - 2] + by * n - y) * 0.1; z += (pos[k - 1] + bz * n - z) * 0.1
        }
        pos[k] = x; pos[k + 1] = y; pos[k + 2] = z
      }
      for (let it = 0; it < ITER; it++) {
        // un peu de raideur : (i−2, i) ne se replie pas (pas contre la racine,
        // ni à l'élastique, où la mèche se plie net)
        for (let i = tied ? HOLD + 3 : 4; i < P; i++) link(pos, base + i - 2, base + i, s * 2 * 0.985, BEND)
        for (let i = first; i < P; i++) this.collide(k0 + i * 3, liftAt(lift, i))
      }
      this.follow(g, first, s)
    }
    this.sleep()
  }

  /** Chaque point à sa distance exacte du précédent (la mèche ne s'étire pas). */
  private follow(g: number, first: number, s: number) {
    const { P, pos, prev, fix } = this
    const k0 = g * P * 3, lift = this.lift[g]
    for (let i = first; i < P; i++) {
      const b = k0 + i * 3, a = b - 3
      const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2]
      const f = s / (Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9)
      const ox = pos[b], oy = pos[b + 1], oz = pos[b + 2]
      pos[b] = pos[a] + dx * f; pos[b + 1] = pos[a + 1] + dy * f; pos[b + 2] = pos[a + 2] + dz * f
      // seule la correction de longueur revient à la vitesse : une poussée
      // de la tête ou de l'épaule y remettrait de l'énergie
      fix[b] = pos[b] - ox; fix[b + 1] = pos[b + 1] - oy; fix[b + 2] = pos[b + 2] - oz
      // contre la tête : le point glisse dessus, toujours à sa distance
      for (let c = 0; c < 2 && this.collide(b, liftAt(lift, i)); c++) {
        const ex = pos[b] - pos[a], ey = pos[b + 1] - pos[a + 1], ez = pos[b + 2] - pos[a + 2]
        const e = s / (Math.sqrt(ex * ex + ey * ey + ez * ez) || 1e-9)
        pos[b] = pos[a] + ex * e; pos[b + 1] = pos[a + 1] + ey * e; pos[b + 2] = pos[a + 2] + ez * e
      }
    }
    // la correction d'un point est rendue à la vitesse de celui d'avant
    for (let i = first; i < P - 1; i++) {
      const k = k0 + i * 3
      prev[k] += fix[k + 3] * FTL_DAMP; prev[k + 1] += fix[k + 4] * FTL_DAMP; prev[k + 2] += fix[k + 5] * FTL_DAMP
    }
    fix.fill(0, k0, k0 + P * 3)
  }

  /** Sort un point des obstacles ; au contact, un peu de frottement. */
  private collide(k: number, m: number) {
    const pos = this.pos, F = this.flat, map = this.map
    let moved = false, touched = 0
    // deux passes : dans le creux entre deux obstacles (le cou et l'épaule),
    // une seule passe renvoie le point de l'un à l'autre et la mèche tourne en rond
    for (let pass = 0; pass < 2; pass++) {
      let hit = 0
      if (map) {
        const x = pos[k], y = pos[k + 1], z = pos[k + 2], l2 = x * x + y * y + z * z, mx = map.max + m
        if (l2 < mx * mx && l2 > 1e-12) {
          const l = Math.sqrt(l2), R = map.at(x, y, z) + m
          if (l < R) { const f = R / l; pos[k] = x * f; pos[k + 1] = y * f; pos[k + 2] = z * f; hit++ }
        }
      }
      for (let c = 0; c < F.length; c += 6) if (pushOut(pos, k, m, F, c)) hit++
      if (!hit) break
      moved = true
      if (!pass) touched = hit
    }
    if (moved) {
      // le frottement ; coincé entre deux obstacles, le point s'arrête net
      const prev = this.prev, f = touched > 1 ? 1 : FRICTION
      prev[k] += (pos[k] - prev[k]) * f; prev[k + 1] += (pos[k + 1] - prev[k + 1]) * f; prev[k + 2] += (pos[k + 2] - prev[k + 2]) * f
    }
    return moved
  }

  /** Tous les `NAP` pas : une mèche qui n'a presque pas bougé depuis est
      remise à sa position d'alors, sans vitesse, et s'endort. */
  private sleep() {
    const { G, P, pos, prev, asleep } = this
    if (this.snap.length !== pos.length) { this.snap = pos.slice(); this.nap = 0; return }
    if (++this.nap < NAP) return
    this.nap = 0
    const snap = this.snap
    for (let g = 0; g < G; g++) {
      if (asleep[g]) continue
      const k0 = g * P * 3, k1 = k0 + P * 3
      let still = !this.held[g] && (this.tieIdx[g] < 0 || this.tieT[g] > 0.99 + TAIL_S / TIE_S)
      for (let k = k0 + 6; k < k1 && still; k += 3) if (Math.abs(pos[k] - snap[k]) + Math.abs(pos[k + 1] - snap[k + 1]) + Math.abs(pos[k + 2] - snap[k + 2]) > SLEEP) still = false
      if (still) {
        pos.set(snap.subarray(k0, k1), k0)
        prev.set(snap.subarray(k0, k1), k0)
        asleep[g] = 1
      } else snap.set(pos.subarray(k0, k1), k0)
    }
  }

  /** Le point i de la mèche g (repère de la tête). */
  point(g: number, i: number): V3 {
    const k = (g * this.P + i) * 3
    return [this.pos[k], this.pos[k + 1], this.pos[k + 2]]
  }

  /** La brosse : pousse de côté les points libres proches d'un rayon (repère
      de la tête). Jamais le long de la mèche : pousser vers la pointe une
      mèche qui pend déjà ne peut que la froisser. */
  comb(o: V3, d: V3, radius: number, move: V3, depth: number) {
    const { pos, prev, P } = this
    let tmin = Infinity
    const hits: number[] = []
    for (let idx = 0; idx < pos.length / 3; idx++) {
      if (idx % P < 2 || this.tieIdx[(idx / P) | 0] >= 0) continue
      const k = idx * 3
      const vx = pos[k] - o[0], vy = pos[k + 1] - o[1], vz = pos[k + 2] - o[2]
      const t = vx * d[0] + vy * d[1] + vz * d[2]
      if (t <= 0) continue
      const ex = vx - d[0] * t, ey = vy - d[1] * t, ez = vz - d[2] * t
      const r2 = ex * ex + ey * ey + ez * ez
      if (r2 > radius * radius) continue
      hits.push(idx, t, r2)
      if (t < tmin) tmin = t
    }
    const touched = new Set<number>()
    for (let h = 0; h < hits.length; h += 3) {
      const idx = hits[h], t = hits[h + 1], r2 = hits[h + 2]
      if (t > tmin + depth) continue
      const g = (idx / P) | 0, k = idx * 3, b = idx % P === P - 1 ? k : k + 3
      touched.add(g)
      this.wake(g)
      let tx = pos[b] - pos[k - 3], ty = pos[b + 1] - pos[k - 2], tz = pos[b + 2] - pos[k - 1]
      const tl = Math.hypot(tx, ty, tz) || 1
      tx /= tl; ty /= tl; tz /= tl
      const along = move[0] * tx + move[1] * ty + move[2] * tz
      const f = (1 - r2 / (radius * radius)) * (1 - (t - tmin) / depth) * 0.7
      // ni le long de la mèche, ni vers le fond : de côté seulement
      let mx = move[0] - tx * along, my = move[1] - ty * along, mz = move[2] - tz * along
      const deep = mx * d[0] + my * d[1] + mz * d[2]
      mx = (mx - d[0] * deep) * f; my = (my - d[1] * deep) * f; mz = (mz - d[2] * deep) * f
      pos[k] += mx; pos[k + 1] += my; pos[k + 2] += mz
      prev[k] += mx * 0.8; prev[k + 1] += my * 0.8; prev[k + 2] += mz * 0.8
    }
    return touched
  }

  /** Les mèches qu'un rayon touche (repère de la tête) : pour chacune, le
      point le plus proche du rayon, sa distance le long de la mèche (`a`), sa
      distance au rayon (`d`) et sa profondeur (`t`). Seulement la surface (`depth`). */
  pick(o: V3, d: V3, radius: number, depth: number, minI = 1) {
    const { G, P, pos } = this
    const out: { g: number; i: number; a: number; t: number; d: number }[] = []
    let tmin = Infinity
    for (let g = 0; g < G; g++) {
      let br = radius * radius, bi = -1, bt = 0, bf = 0
      for (let i = minI; i < P - 1; i++) {
        // le point du segment le plus proche du rayon (en coupe, face au rayon)
        const k = (g * P + i) * 3
        const ax = pos[k] - o[0], ay = pos[k + 1] - o[1], az = pos[k + 2] - o[2]
        const ta = ax * d[0] + ay * d[1] + az * d[2]
        const px = ax - d[0] * ta, py = ay - d[1] * ta, pz = az - d[2] * ta
        const bx = pos[k + 3] - pos[k], by = pos[k + 4] - pos[k + 1], bz = pos[k + 5] - pos[k + 2]
        const tb = bx * d[0] + by * d[1] + bz * d[2]
        const qx = bx - d[0] * tb, qy = by - d[1] * tb, qz = bz - d[2] * tb
        const q2 = qx * qx + qy * qy + qz * qz
        const f = q2 > 1e-12 ? Math.min(1, Math.max(0, -(px * qx + py * qy + pz * qz) / q2)) : 0
        const ex = px + qx * f, ey = py + qy * f, ez = pz + qz * f, r2 = ex * ex + ey * ey + ez * ez
        const t = ta + tb * f
        if (r2 < br && t > 0) { br = r2; bi = i; bt = t; bf = f }
      }
      if (bi < 0) continue
      const L = this.seg[g] * (P - 1), x = bi + bf
      const a = this.tieIdx[g] < 0 ? x * this.seg[g] : x <= HOLD ? this.arc[g] * L * x / HOLD : this.arc[g] * L + (x - HOLD) * this.segB[g]
      out.push({ g, i: bi, a, t: bt, d: Math.sqrt(br) })
      if (bt < tmin) tmin = bt
    }
    return out.filter(b => b.t <= tmin + depth)
  }
}

/** Sort le point k d'un ellipsoïde (à plat en c) grossi de m. */
function pushOut(p: Float32Array, k: number, m: number, F: Float32Array, c: number) {
  const ry = F[c + 4] + m, dy = p[k + 1] - F[c + 1]
  if (dy >= ry || dy <= -ry) return false
  const rx = F[c + 3] + m, rz = F[c + 5] + m
  const sx = (p[k] - F[c]) / rx, sy = dy / ry, sz = (p[k + 2] - F[c + 2]) / rz
  const l2 = sx * sx + sy * sy + sz * sz
  if (l2 >= 1 || l2 < 1e-12) return false
  const l = Math.sqrt(l2)
  p[k] = F[c] + sx / l * rx; p[k + 1] = F[c + 1] + sy / l * ry; p[k + 2] = F[c + 2] + sz / l * rz
  return true
}

/** La couche d'une mèche s'installe peu à peu : au ras du crâne près de la
    racine, à sa hauteur à partir du 5e point. */
const liftAt = (lift: number, i: number) => lift * Math.min(1, (i - 1) / 4)

/** Écarte deux points plus proches que `rest` (la raideur ne tire jamais). */
function link(p: Float32Array, a: number, b: number, rest: number, k: number) {
  const ka = a * 3, kb = b * 3
  const dx = p[kb] - p[ka], dy = p[kb + 1] - p[ka + 1], dz = p[kb + 2] - p[ka + 2]
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (d < 1e-9 || d >= rest) return
  const c = ((d - rest) / d) * k / 2
  p[ka] += dx * c; p[ka + 1] += dy * c; p[ka + 2] += dz * c
  p[kb] -= dx * c; p[kb + 1] -= dy * c; p[kb + 2] -= dz * c
}

/* ---------- Le cuir chevelu ---------- */

/** Un hasard reproductible (mulberry32). */
export function rand(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface ScalpOpts {
  /** Le crâne (repère de la tête) sur lequel poser les racines. */
  skull: Ellipsoid
  count: number
  /** Longueur des cheveux sous la nuque (les mèches du front sont plus courtes). */
  length: number
  seed?: number
  /** La raie : son côté (−1 gauche, 0 milieu, 1 droite). */
  part?: number
}

/** La ligne des cheveux : le front dégagé, au-dessus des oreilles, la nuque.
    Repère de la tête : y en haut, z vers le visage, x vers la gauche de
    l'enfant. Renvoie vrai si un point du crâne (unitaire) porte des cheveux. */
export function onScalp(x: number, y: number, z: number): boolean {
  return y > hairline(x, z)
}

/** La hauteur de la lisière selon le tour de la tête (sur la sphère unité) :
    haute au front, plus basse au-dessus de l'oreille, à la nuque derrière,
    en une courbe continue (une règle en marches découpait une encoche
    rectangulaire près de l'oreille, 23/11). */
export function hairline(x: number, z: number): number {
  const a = Math.abs(Math.atan2(x, z))           // 0 : le front, π : la nuque
  const front = 0.78, ear = 0.1, nape = -0.68
  if (a < Math.PI / 2) {
    const u = a / (Math.PI / 2)
    return front + (ear - front) * (1 - Math.cos(u * Math.PI)) / 2
  }
  const u = (a - Math.PI / 2) / (Math.PI / 2)
  return ear + (nape - ear) * (1 - Math.cos(u * Math.PI)) / 2
}

/** L'obstacle du visage : un ellipsoïde devant le visage, qui écarte les
    mèches sur les côtés (le visage reste dégagé, encadré par les cheveux). */
export function faceGuard(skull: Ellipsoid): Ellipsoid {
  const [rx, ry, rz] = skull.r
  return { c: [skull.c[0], skull.c[1] - ry * 0.4, skull.c[2] + rz * 0.5], r: [rx * 0.96, ry * 1.12, rz * 0.74] }
}

/** Les racines réparties sur le cuir chevelu (spirale de Fibonacci), leur
    sens de pousse (depuis la raie, vers l'arrière et le bas) et leur
    longueur. */
export function scalp(o: ScalpOpts): HairInit {
  const rnd = rand(o.seed ?? 7)
  const roots: V3[] = [], dirs: V3[] = [], lengths: number[] = [], lifts: number[] = []
  const part = (o.part ?? 0) * 0.18
  // le nombre de points de la spirale pour en garder `count` sur TOUT le cuir
  // chevelu (au jugé, la spirale partait du sommet et s'arrêtait avant la
  // nuque : rien n'y poussait)
  const kept = (n: number) => { let c = 0; for (let k = 0; k < n; k++) { const y = 1 - (k + 0.5) / n * 2, r = Math.sqrt(1 - y * y), th = k * 2.399963229728653; if (onScalp(Math.cos(th) * r, y, Math.sin(th) * r)) c++ } return c }
  let N = Math.round(o.count * o.count / Math.max(1, kept(o.count)))
  while (kept(N) < o.count) N++
  for (let k = 0; k < N && roots.length < o.count; k++) {
    const y = 1 - (k + 0.5) / N * 2
    const r = Math.sqrt(1 - y * y), th = k * 2.399963229728653
    const x = Math.cos(th) * r, z = Math.sin(th) * r
    if (!onScalp(x, y, z)) continue
    const n: V3 = [x, y, z]
    const s = o.skull
    roots.push([s.c[0] + x * s.r[0] * 0.97, s.c[1] + y * s.r[1] * 0.97, s.c[2] + z * s.r[2] * 0.97])
    // la pousse : s'éloigne de la raie, glisse vers l'arrière et le bas,
    // COUCHÉE sur le crâne (sinon le dessus de la tête se hérisse de touffes)
    const side = x - part
    // derrière, les cheveux tombent droit (pas de raie qui ouvre le crâne) ;
    // devant et sur le dessus, ils partent de la raie
    let dx = z > -0.2 ? Math.sign(side || 1) * (Math.abs(side) < 0.3 ? 1 : 0.45) : side * 0.25
    let dy = -0.55
    // le devant part vers l'arrière et les côtés : jamais sur le visage
    let dz = z > 0 ? -0.6 - z : -0.45
    const dn = dx * n[0] + dy * n[1] + dz * n[2]
    dx -= n[0] * dn; dy -= n[1] * dn; dz -= n[2] * dn
    // un soupçon de volume
    dx += n[0] * 0.12; dy += n[1] * 0.12; dz += n[2] * 0.12
    const l = Math.hypot(dx, dy, dz) || 1
    dx /= l; dy /= l; dz /= l
    dirs.push([dx, dy, dz])
    // le devant est plus court, sinon les mèches couvriraient le visage
    const front = Math.max(0, z) * Math.max(0, y)
    lengths.push(o.length * (1 - 0.35 * front) * (0.94 + rnd() * 0.1))
    lifts.push(0.03 + rnd() * 0.07)
  }
  return { roots, dirs, lengths, lifts }
}
