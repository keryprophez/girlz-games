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
   - collisions avec des ellipsoïdes (crâne, cou, épaules), tous dans le
     repère de la tête. Chaque mèche a sa couche
     (`lift`) : elles ne se posent pas toutes à la même distance du crâne,
     d'où le volume ;
   - un point tenu (le doigt) a une masse infinie : il est posé, jamais
     tiré par ses voisins ;
   - une FORME DE REPOS (`rest`, dans le repère de la tête) : la mèche y
     revient doucement (`SHAPE`). Elle est calculée une fois (`bake` : les
     cheveux tombent, très amortis, jusqu'à s'arrêter) — la physique ne
     simule plus que les écarts (la tête qui tourne, le doigt, la brosse),
     donc la chevelure se repose TOUJOURS, sans glisser sans fin sur les
     épaules. C'est aussi la mémoire de la coiffure : une queue de cheval,
     une tresse, une mèche brossée, c'est une autre forme de repos ;
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
const DAMP = 4.2
const AIR: [number, number] = [6, 12]
const ITER = 2
const BEND = 0.12
/** La part de la correction de longueur rendue à la vitesse (Müller : 0,9). */
const FTL_DAMP = 0.45
/** Le frottement au contact (part de la vitesse perdue par pas). */
const FRICTION = 0.12
/** Le retour vers la forme de repos, par pas (près de la racine → pointe). */
const SHAPE: [number, number] = [0.04, 0.006]
/** Une mèche dont aucun point n'a bougé de plus que ça en `NAP` pas s'endort. */
const SLEEP = 4e-3
const NAP = 30
/** Le temps qu'une mèche met à glisser jusqu'à son attache (s). */
const TIE_S = 0.35
/** Le temps laissé à la queue pour pendre, avant de garder sa pose (s). */
const TAIL_S = 1.2
const smooth = (t: number) => t * t * (3 - 2 * t)

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
  /** Les obstacles, dans le repère de la tête (crâne, cou, épaules). */
  headColliders: Ellipsoid[] = []
  /** Points tenus : indice du point → cible (repère de la tête). */
  readonly pins = new Map<number, V3>()
  readonly pinned: Uint8Array
  /** Le vent ou le sèche-cheveux : une accélération (monde). */
  readonly wind = new Float32Array(3)
  /** La forme de repos, point par point. */
  readonly rest: Float32Array
  /** Le retour à la forme de repos, mèche par mèche (0 : libre). */
  readonly shape: Float32Array
  /** Mèches endormies (figées, non calculées). */
  readonly asleep: Uint8Array
  /** Les mèches ATTACHÉES (une queue de cheval, une couette) : jusqu'au
      point `tieIdx[g]`, la mèche suit un chemin posé sur le crâne jusqu'à
      l'attache (sans calcul) ; au-delà, la queue est libre et se balance.
      Le chemin arrive en glissant (`tieT` de 0 à 1, depuis `tieFrom`). */
  readonly tieIdx: Int16Array
  readonly tiePath: Float32Array
  readonly tieFrom: Float32Array
  readonly tieT: Float32Array
  private nap = 0
  private snap = new Float32Array(0)
  private fix: Float32Array
  private acc = 0
  private damp = DAMP

  constructor(init: HairInit, P = 14) {
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
    this.rest = new Float32Array(G * P * 3)
    this.shape = new Float32Array(G).fill(1)
    this.asleep = new Uint8Array(G)
    this.pinned = new Uint8Array(G * P)
    this.tieIdx = new Int16Array(G).fill(-1)
    this.tiePath = new Float32Array(G * P * 3)
    this.tieFrom = new Float32Array(G * P * 3)
    this.tieT = new Float32Array(G)
    for (let g = 0; g < G; g++) {
      this.rootL.set(init.roots[g], g * 3)
      this.dirL.set(init.dirs[g], g * 3)
      this.seg[g] = init.lengths[g] / (P - 1)
      this.lift[g] = init.lifts[g]
    }
    this.settleStraight()
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
    const { P } = this
    if (!only) this.rest.set(this.pos)
    else for (const g of only) this.rest.set(this.pos.subarray(g * P * 3, (g + 1) * P * 3), g * P * 3)
    this.prev.set(this.pos)
  }

  /** Pose chaque mèche droite dans son sens de pousse puis vers le bas. */
  settleStraight() {
    const { G, P, pos, rootL: r, dirL: d } = this
    for (let g = 0; g < G; g++) {
      const s = this.seg[g], k3 = g * 3
      let x = r[k3], y = r[k3 + 1], z = r[k3 + 2]
      for (let i = 0; i < P; i++) {
        const k = (g * P + i) * 3
        pos[k] = x; pos[k + 1] = y; pos[k + 2] = z
        const w = Math.min(1, i / 2)
        const dx = d[k3] * (1 - w), dy = d[k3 + 1] * (1 - w) - w, dz = d[k3 + 2] * (1 - w)
        const n = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
        x += dx / n * s; y += dy / n * s; z += dz / n * s
      }
    }
    this.prev.set(pos)
    this.rest.set(pos)
  }

  /** Racine de la mèche g (repère de la tête). */
  root(g: number): V3 { return [this.rootL[g * 3], this.rootL[g * 3 + 1], this.rootL[g * 3 + 2]] }

  /** Tourne la tête : lacet (autour de y) puis tangage (autour de x). Les
      cheveux, eux, restent où ils étaient dans le monde. `snap` : la tête
      est posée là d'un coup, les cheveux avec elle (au chargement). */
  setHead(yaw: number, pitch: number, snap = false) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch)
    // R = Ry(yaw) · Rx(pitch)
    const n = [cy, sy * sp, sy * cp, 0, cp, -sp, -sy, cy * sp, cy * cp], o = this.rot
    let same = true
    for (let i = 0; i < 9; i++) if (Math.abs(n[i] - o[i]) > 1e-7) { same = false; break }
    if (same) return
    if (snap) { this.rot.set(n); return }
    // Δ = Rnewᵀ · Rold : du repère de l'ancienne tête à celui de la nouvelle
    const D = new Float32Array(9)
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) D[r * 3 + c] = n[r] * o[c] + n[3 + r] * o[3 + c] + n[6 + r] * o[6 + c]
    for (const a of [this.pos, this.prev]) {
      for (let k = 0; k < a.length; k += 3) {
        const x = a[k], y = a[k + 1], z = a[k + 2]
        a[k] = D[0] * x + D[1] * y + D[2] * z
        a[k + 1] = D[3] * x + D[4] * y + D[5] * z
        a[k + 2] = D[6] * x + D[7] * y + D[8] * z
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

  /** Tenir un point au doigt (null : le lâcher). Repère de la tête. */
  pin(idx: number, target: V3 | null) {
    if (target) { this.pins.set(idx, this.outside(target, this.lift[Math.floor(idx / this.P)] * 1.5)); this.pinned[idx] = 1 }
    else { this.pins.delete(idx); this.pinned[idx] = 0 }
    this.wake(Math.floor(idx / this.P))
  }

  /** Attache la mèche g en `target` (une queue de cheval, une couette) :
      son chemin sur le crâne jusque-là, puis la queue libre. `delay` (s) :
      elle part un peu plus tard (les mèches rassemblées une à une). */
  tie(g: number, target: V3, delay = 0) {
    const { P, pos } = this
    const s = this.seg[g], base = g * P, k3 = g * 3
    const r = this.rootL, d = this.dirL
    const p1: V3 = [r[k3] + d[k3] * s, r[k3 + 1] + d[k3 + 1] * s, r[k3 + 2] + d[k3 + 2] * s]
    // l'ordre des couches : les cheveux qui viennent de loin (le front)
    // passent PAR-DESSUS ceux qui partent près de l'attache, comme sur une
    // vraie queue de cheval (au hasard, on voyait le départ de chaque mèche :
    // des écailles)
    const far = Math.min(1, Math.hypot(target[0] - p1[0], target[1] - p1[1], target[2] - p1[2]) / 2.6)
    const T = this.tiePath, lift = 0.008 + 0.05 * far
    // le chemin sur le crâne : la corde de la racine à l'attache, chaque point
    // ramené à la surface (+ sa couche), lissé ; puis sa VRAIE longueur. La
    // mèche y est TENDUE (aucun surplus qui se froisse près de l'attache) et
    // tout le reste de sa longueur va dans la queue.
    const N = 48, curve: V3[] = []
    for (let k = 0; k <= N; k++) {
      const u = k / N
      curve.push([p1[0] + (target[0] - p1[0]) * u, p1[1] + (target[1] - p1[1]) * u, p1[2] + (target[2] - p1[2]) * u])
    }
    for (let it = 0; it < 30; it++) {
      for (let k = 1; k < N; k++) curve[k] = this.outside(curve[k], lift)
      for (let k = 1; k < N; k++) for (let x = 0; x < 3; x++) curve[k][x] = (curve[k - 1][x] + 2 * curve[k][x] + curve[k + 1][x]) / 4
    }
    for (let k = 1; k < N; k++) curve[k] = this.outside(curve[k], lift)
    const acc = [0]
    for (let k = 1; k <= N; k++) acc.push(acc[k - 1] + Math.hypot(curve[k][0] - curve[k - 1][0], curve[k][1] - curve[k - 1][1], curve[k][2] - curve[k - 1][2]))
    const len = acc[N]
    const j = Math.min(P - 4, Math.max(2, Math.ceil(len / s) + 1))
    const at = (d: number): V3 => {
      let k = 1
      while (k < N && acc[k] < d) k++
      const u = Math.min(1, (d - acc[k - 1]) / ((acc[k] - acc[k - 1]) || 1))
      return [curve[k - 1][0] + (curve[k][0] - curve[k - 1][0]) * u, curve[k - 1][1] + (curve[k][1] - curve[k - 1][1]) * u, curve[k - 1][2] + (curve[k][2] - curve[k - 1][2]) * u]
    }
    T.set([r[k3], r[k3 + 1], r[k3 + 2]], base * 3)
    T.set(p1, (base + 1) * 3)
    // les points le long du chemin, régulièrement, le dernier sur l'attache
    for (let i = 2; i <= j; i++) T.set(at(Math.min(len, (i - 1) / (j - 1) * len)), (base + i) * 3)
    // le FAISCEAU : la queue sort d'abord de la tête, vers l'arrière et un
    // peu vers le bas, en un court faisceau serré où se pose l'élastique —
    // perpendiculaire au flux des cheveux (le père, 24/11 : un élastique
    // couché à l'horizontale « rentre dans la tête ») ; puis elle retombe
    const out = [target[0], target[1] - 0.35 * Math.hypot(...target), target[2]]
    const ol = Math.hypot(out[0], out[1], out[2]) || 1
    const a0 = (base + j) * 3
    T.set([T[a0] + out[0] / ol * s, T[a0 + 1] + out[1] / ol * s, T[a0 + 2] + out[2] / ol * s], (base + j + 1) * 3)
    for (let i = j + 2; i < P; i++) {
      const a = (base + i - 1) * 3
      T.set([T[a], T[a + 1] - s, T[a + 2] - s * 0.15], (base + i) * 3)
    }
    this.tieFrom.set(pos.subarray(base * 3, (base + P) * 3), base * 3)
    // jusqu'au bout du faisceau, la mèche est posée (sans calcul)
    this.tieIdx[g] = j + 1
    this.tieT[g] = -delay / TIE_S
    this.shape[g] = 0
    this.wake(g)
  }

  /** Détache la mèche g (défaire). */
  untie(g: number) {
    this.tieIdx[g] = -1
    this.shape[g] = 1
    this.wake(g)
  }

  /** Un point ramené hors des obstacles (la tête, le visage, le cou). */
  outside(p: V3, lift: number): V3 {
    const q: V3 = [p[0], p[1], p[2]]
    for (let pass = 0; pass < 3; pass++) for (const e of this.headColliders) {
      const rx = e.r[0] + lift, ry = e.r[1] + lift, rz = e.r[2] + lift
      const sx = (q[0] - e.c[0]) / rx, sy = (q[1] - e.c[1]) / ry, sz = (q[2] - e.c[2]) / rz
      const l = Math.sqrt(sx * sx + sy * sy + sz * sz)
      if (l >= 1 || l < 1e-9) continue
      q[0] = e.c[0] + sx / l * rx; q[1] = e.c[1] + sy / l * ry; q[2] = e.c[2] + sz / l * rz
    }
    return q
  }

  /** Avance la simulation du temps réel écoulé, par pas fixes. */
  advance(dt: number) {
    this.acc = Math.min(this.acc + dt, STEP * MAX_STEPS)
    while (this.acc >= STEP) {
      this.step(STEP)
      this.acc -= STEP
    }
  }

  step(h: number) {
    const { G, P, pos, prev, wind, asleep, pinned, rest, shape, rot: R } = this
    if (wind[0] || wind[1] || wind[2]) asleep.fill(0)
    const baking = this.damp !== DAMP, h2 = h * h
    // la pesanteur et le vent, dans le repère de la tête (Rᵀ · a)
    const ax = wind[0], ay = wind[1] - GRAVITY, az = wind[2]
    const gx = (R[0] * ax + R[3] * ay + R[6] * az) * h2
    const gy = (R[1] * ax + R[4] * ay + R[7] * az) * h2
    const gz = (R[2] * ax + R[5] * ay + R[8] * az) * h2
    const cols = this.headColliders
    for (let g = 0; g < G; g++) {
      if (asleep[g]) continue
      const base = g * P, m = shape[g], kin = this.tieIdx[g]
      if (kin >= 0 && this.tieT[g] < 1 + TAIL_S / TIE_S) {
        this.tieT[g] += h / TIE_S
        // (la queue pend librement : une pose gardée en plein balancement la
        // figerait en boucle au-dessus de l'attache)
      }
      // racine et premier point : posés sur le crâne
      const k0 = base * 3, r = this.rootL, d = this.dirL, s = this.seg[g], k3 = g * 3
      pos[k0] = prev[k0] = r[k3]; pos[k0 + 1] = prev[k0 + 1] = r[k3 + 1]; pos[k0 + 2] = prev[k0 + 2] = r[k3 + 2]
      if (!pinned[base + 1]) {
        pos[k0 + 3] = prev[k0 + 3] = r[k3] + d[k3] * s; pos[k0 + 4] = prev[k0 + 4] = r[k3 + 1] + d[k3 + 1] * s; pos[k0 + 5] = prev[k0 + 5] = r[k3 + 2] + d[k3 + 2] * s
      }
      for (let i = 2; i < P; i++) {
        const idx = base + i, k = idx * 3
        if (pinned[idx]) { const t = this.pins.get(idx)!; pos[k] = prev[k] = t[0]; pos[k + 1] = prev[k + 1] = t[1]; pos[k + 2] = prev[k + 2] = t[2]; continue }
        if (i <= kin || (kin >= 0 && this.tieT[g] < 1)) {
          // attaché : sur son chemin (qui arrive en glissant) ; la queue
          // glisse avec lui (sinon elle reste où pendait la mèche, sur le
          // côté du visage, et s'enroule autour du crâne)
          const u = smooth(Math.min(1, Math.max(0, this.tieT[g]))), F = this.tieFrom, T = this.tiePath
          pos[k] = prev[k] = F[k] + (T[k] - F[k]) * u; pos[k + 1] = prev[k + 1] = F[k + 1] + (T[k + 1] - F[k + 1]) * u; pos[k + 2] = prev[k + 2] = F[k + 2] + (T[k + 2] - F[k + 2]) * u
          continue
        }
        // Verlet amorti (l'air freine davantage les pointes) + pesanteur
        const damp = baking ? Math.max(0, 1 - this.damp * h) : Math.max(0, 1 - (AIR[0] + (AIR[1] - AIR[0]) * (i - 2) / (P - 3)) * (kin >= 0 ? 1.6 : 1) * h)
        const vx = (pos[k] - prev[k]) * damp, vy = (pos[k + 1] - prev[k + 1]) * damp, vz = (pos[k + 2] - prev[k + 2]) * damp
        prev[k] = pos[k]; prev[k + 1] = pos[k + 1]; prev[k + 2] = pos[k + 2]
        // la forme de repos est DÉJÀ la pose tombée sous la pesanteur : la
        // remettre par-dessus ferait glisser lentement les mèches posées sur
        // l'épaule vers une pose plus basse ; il n'en reste qu'une part
        const gw = 1 - 0.9 * m
        let x = pos[k] + vx + gx * gw, y = pos[k + 1] + vy + gy * gw, z = pos[k + 2] + vz + gz * gw
        // vers la forme de repos
        // (le rebond — le père, 23/11 : « trop bouncy » — est tenu par la
        // résistance de l'air, assez forte pour qu'il n'y ait pas d'aller-retour)
        if (m) {
          const f = (SHAPE[0] + (SHAPE[1] - SHAPE[0]) * (i - 2) / (P - 3)) * m
          x += (rest[k] - x) * f; y += (rest[k + 1] - y) * f; z += (rest[k + 2] - z) * f
        }
        pos[k] = x; pos[k + 1] = y; pos[k + 2] = z
      }
      for (let it = 0; it < ITER; it++) {
        // un peu de raideur : (i−2, i) ne se replie pas (pas contre la racine)
        for (let i = 4; i < P; i++) {
          // à l'élastique, la mèche se plie net (une mèche de la nuque remonte
          // jusqu'à l'attache et retombe dans la queue) : pas de raideur là
          if (kin >= 0 && i - 2 <= kin) continue
          const b = base + i, c = b - 2
          link(pos, c, b, s * 2 * 0.985, pinned[c] || i - 2 <= kin ? 0 : 1, pinned[b] || i <= kin ? 0 : 1, BEND, true)
        }
        for (let i = Math.max(2, kin + 1); i < P; i++) if (!pinned[base + i]) this.collide((base + i) * 3, liftAt(this.lift[g], i), cols)
      }
      this.follow(g)
    }
    this.sleep()
  }

  /** Chaque point à sa distance exacte du précédent (la mèche ne s'étire
      pas). Une mèche tenue : de la racine vers le point tenu, puis du point
      tenu vers la pointe. */
  private follow(g: number) {
    const { P, pos, prev, pinned, fix } = this
    const s = this.seg[g], base = g * P, lift = this.lift[g], cols = this.headColliders
    // une mèche attachée part de son attache ; une mèche tenue, du doigt
    const kin = this.tieIdx[g]
    let pin = kin >= 2 ? kin : -1
    if (pin < 0) for (let i = 2; i < P; i++) if (pinned[base + i]) { pin = i; break }
    for (let i = Math.max(2, pin < 0 ? 2 : pin + 1); i < P; i++) {
      const a = (base + i - 1) * 3, b = a + 3
      const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2]
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9
      const ox = pos[b], oy = pos[b + 1], oz = pos[b + 2]
      pos[b] = pos[a] + dx / d * s; pos[b + 1] = pos[a + 1] + dy / d * s; pos[b + 2] = pos[a + 2] + dz / d * s
      // seule la correction de longueur revient à la vitesse : une poussée
      // de la tête ou de l'épaule y remettrait de l'énergie
      fix[b] = pos[b] - ox; fix[b + 1] = pos[b + 1] - oy; fix[b + 2] = pos[b + 2] - oz
      // contre la tête : le point glisse dessus, toujours à sa distance
      for (let c = 0; c < 2 && this.collide(b, liftAt(lift, i), cols); c++) {
        const ex = pos[b] - pos[a], ey = pos[b + 1] - pos[a + 1], ez = pos[b + 2] - pos[a + 2]
        const e = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1e-9
        pos[b] = pos[a] + ex / e * s; pos[b + 1] = pos[a + 1] + ey / e * s; pos[b + 2] = pos[a + 2] + ez / e * s
      }
    }
    if (pin > 0 && kin < 0) {
      // entre la racine et le doigt, les deux bouts sont tenus : la longueur
      // se règle par itérations (quelques mèches seulement), et la mèche
      // garde une courbe douce au lieu de se plier en zigzag
      for (let it = 0; it < 14; it++) {
        for (let i = 2; i <= pin; i++) link(pos, base + i - 1, base + i, s, i - 1 < 2 ? 0 : 1, i === pin ? 0 : 1, 1)
        for (let i = 3; i <= pin; i++) link(pos, base + i - 2, base + i, s * 2 * 0.985, i - 2 < 2 ? 0 : 1, i === pin ? 0 : 1, 0.5, true)
        // et jamais à travers la tête ou le visage
        for (let i = 2; i < pin; i++) this.collide((base + i) * 3, liftAt(lift, i), cols)
      }
      for (let i = 2; i < pin; i++) { const b = (base + i) * 3; fix[b] = fix[b + 1] = fix[b + 2] = 0 }
    }
    // la correction d'un point est rendue à la vitesse de celui d'avant —
    // pas dans une queue attachée : partie d'un point fixe tout près du crâne,
    // cette énergie rendue la faisait tournoyer sans fin
    const fd = FTL_DAMP
    for (let i = 2; i < P - 1; i++) {
      const k = (base + i) * 3
      if (pinned[base + i]) continue
      prev[k] += fix[k + 3] * fd; prev[k + 1] += fix[k + 4] * fd; prev[k + 2] += fix[k + 5] * fd
    }
    fix.fill(0, base * 3, (base + P) * 3)
  }

  /** Sort un point des obstacles ; au contact, un peu de frottement. */
  private collide(k: number, m: number, cols: Ellipsoid[]) {
    const pos = this.pos
    let moved = false, touched = 0
    // deux passes : dans le creux entre deux obstacles (le cou et l'épaule),
    // une seule passe renvoie le point de l'un à l'autre et la mèche tourne en rond
    for (let pass = 0; pass < 2; pass++) for (let c = 0; c < cols.length; c++) {
      const e = cols[c]
      const rx = e.r[0] + m, ry = e.r[1] + m, rz = e.r[2] + m
      const sx = (pos[k] - e.c[0]) / rx, sy = (pos[k + 1] - e.c[1]) / ry, sz = (pos[k + 2] - e.c[2]) / rz
      const l2 = sx * sx + sy * sy + sz * sz
      if (l2 >= 1 || l2 < 1e-12) continue
      const l = Math.sqrt(l2)
      pos[k] = e.c[0] + sx / l * rx; pos[k + 1] = e.c[1] + sy / l * ry; pos[k + 2] = e.c[2] + sz / l * rz
      moved = true
      if (!pass) touched++
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
    const { G, P, pos, prev, pinned, asleep } = this
    if (this.snap.length !== pos.length) { this.snap = pos.slice(); this.nap = 0; return }
    if (++this.nap < NAP) return
    this.nap = 0
    const snap = this.snap
    for (let g = 0; g < G; g++) {
      if (asleep[g]) continue
      let still = this.tieIdx[g] < 0 || this.tieT[g] >= 1 + TAIL_S / TIE_S
      for (let i = 2; i < P && still; i++) {
        const idx = g * P + i, k = idx * 3
        if (pinned[idx]) still = false
        else if (Math.abs(pos[k] - snap[k]) + Math.abs(pos[k + 1] - snap[k + 1]) + Math.abs(pos[k + 2] - snap[k + 2]) > SLEEP) still = false
      }
      const k0 = g * P * 3, k1 = k0 + P * 3
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

  /** Déplace d'un bloc les points proches d'un rayon (la brosse, le peigne). Repère de la tête. */
  comb(o: V3, d: V3, radius: number, move: V3, depth: number) {
    const { pos, prev, P, pinned } = this
    let tmin = Infinity
    const hits: number[] = []
    for (let idx = 0; idx < pos.length / 3; idx++) {
      if (idx % P < 2 || pinned[idx]) continue
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
      touched.add(Math.floor(idx / P))
      this.wake(Math.floor(idx / P))
      const f = (1 - r2 / (radius * radius)) * (1 - (t - tmin) / depth)
      const k = idx * 3
      pos[k] += move[0] * f; pos[k + 1] += move[1] * f; pos[k + 2] += move[2] * f
      prev[k] += move[0] * f * 0.55; prev[k + 1] += move[1] * f * 0.55; prev[k + 2] += move[2] * f * 0.55
    }
    return touched
  }

  /** Les mèches qu'un rayon touche (repère de la tête) : pour chacune, le
      point le plus proche du rayon et sa profondeur. Seulement la surface. */
  pick(o: V3, d: V3, radius: number, depth: number, minI = 3) {
    const { G, P, pos } = this
    const best = new Map<number, { i: number; t: number; r2: number }>()
    let tmin = Infinity
    for (let g = 0; g < G; g++) {
      for (let i = minI; i < P; i++) {
        const k = (g * P + i) * 3
        const vx = pos[k] - o[0], vy = pos[k + 1] - o[1], vz = pos[k + 2] - o[2]
        const t = vx * d[0] + vy * d[1] + vz * d[2]
        if (t <= 0) continue
        const ex = vx - d[0] * t, ey = vy - d[1] * t, ez = vz - d[2] * t
        const r2 = ex * ex + ey * ey + ez * ez
        if (r2 > radius * radius) continue
        const b = best.get(g)
        if (!b || r2 < b.r2) best.set(g, { i, t, r2 })
        if (t < tmin) tmin = t
      }
    }
    return [...best].filter(([, b]) => b.t <= tmin + depth).map(([g, b]) => ({ g, i: b.i, t: b.t }))
  }
}

/** La couche d'une mèche s'installe peu à peu : au ras du crâne près de la
    racine, à sa hauteur à partir du 5e point. */
const liftAt = (lift: number, i: number) => lift * Math.min(1, (i - 1) / 4)

/** Ramène deux points à la distance `rest` (poids 0 = point fixe).
    `only`: seulement s'ils sont trop près (la raideur ne tire jamais). */
function link(p: Float32Array, a: number, b: number, rest: number, wa: number, wb: number, k: number, only = false) {
  const w = wa + wb
  if (!w) return
  const ka = a * 3, kb = b * 3
  const dx = p[kb] - p[ka], dy = p[kb + 1] - p[ka + 1], dz = p[kb + 2] - p[ka + 2]
  const d = Math.hypot(dx, dy, dz)
  if (d < 1e-9 || (only && d >= rest)) return
  const c = ((d - rest) / d) * k / w
  p[ka] += dx * c * wa; p[ka + 1] += dy * c * wa; p[ka + 2] += dz * c * wa
  p[kb] -= dx * c * wb; p[kb + 1] -= dy * c * wb; p[kb + 2] -= dz * c * wb
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
  const front = 0.78, ear = 0.1, nape = -0.55
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
  return { c: [skull.c[0], skull.c[1] - ry * 0.4, skull.c[2] + rz * 0.5], r: [rx * 0.86, ry * 1.12, rz * 0.74] }
}

/** Les racines réparties sur le cuir chevelu (spirale de Fibonacci), leur
    sens de pousse (depuis la raie, vers l'arrière et le bas) et leur
    longueur. */
export function scalp(o: ScalpOpts): HairInit {
  const rnd = rand(o.seed ?? 7)
  const roots: V3[] = [], dirs: V3[] = [], lengths: number[] = [], lifts: number[] = []
  const part = (o.part ?? 0) * 0.18
  const N = Math.round(o.count * 2.6)
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
