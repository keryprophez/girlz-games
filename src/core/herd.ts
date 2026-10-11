/* 🐑 LE TROUPEAU du Chien de berger (11/10) — logique pure, testée
   (`herd.test.ts`), dans le plan de la ferme (x, z ; le centre du plateau
   en 0). Rien ici ne connaît three.js : le jeu dessine ce que ce module
   calcule.

   - Les moutons broutent tant que rien ne les inquiète ; le chien (ou le
     renard) approche : ils FUIENT, et se serrent les uns contre les autres
     en fuyant (la peur rassemble) — c'est ce qui permet de mener un
     troupeau entier en le poussant par derrière.
   - La chèvre est têtue : elle ne fuit le chien que tout près, ou quand il
     aboie (`bark`).
   - L'enclos : un rond de piquets avec UNE ouverture ; on n'y entre que par
     là (les piquets arrêtent le reste). Un mouton entré ne ressort plus : il
     va brouter à sa place dans l'enclos.
   - Le renard (la flamme) sort du bord, file vers le troupeau et l'éparpille,
     jusqu'à ce qu'un chien l'approche : il repart. Il ne touche jamais un
     mouton.
   - `pilot` : le pilote automatique (le bot, la main qui montre) — aller
     chercher le mouton le plus écarté, sinon pousser le troupeau par
     derrière vers l'ouverture (le berger de Strömbom, 2014).

   Pas fixes : `stepHerd` découpe le temps en pas de 1/60 s au plus (une
   image lente ne fait jamais traverser un piquet). */

export interface Circle { x: number; z: number; r: number }
export interface Pen {
  x: number; z: number
  /** Le rayon du rond de piquets. */
  r: number
  /** La direction de l'ouverture, depuis le centre de l'enclos (angle : (sin, cos), comme la ferme). */
  dir: number
  /** La largeur de l'ouverture (angle). */
  gap: number
}
export interface HerdOpts {
  /** Le bord du plateau : personne ne va plus loin (distance au centre). */
  edge: number
  pen: Pen
  obstacles: Circle[]
  seed?: number
}
export type Kind = 'sheep' | 'goat'
export interface Animal {
  kind: Kind
  x: number; z: number; vx: number; vz: number
  /** Où il regarde (angle de la ferme : atan2(vx, vz)). */
  ry: number
  penned: boolean
  /** La peur (0..1), qui retombe doucement. */
  fear: number
  /** Effrayé par un aboiement : secondes restantes. */
  scare: number
  /** Brouter : la direction et le temps avant de changer d'idée. */
  wander: number; wanderIn: number; still: boolean
  /** Sa place dans l'enclos, une fois rentré. */
  home: { x: number; z: number } | null
  /** Pour ne pas bêler ni « presque » en boucle. */
  bleatIn: number; nearIn: number
}
export interface Dog {
  x: number; z: number; vx: number; vz: number; ry: number; tx: number; tz: number
  /** Le pilote : le mouton qu'il est allé chercher (il le ramène avant d'en changer),
      et le côté par où il le contourne. */
  aim?: Animal | null
  side?: number
  /** Le pilote n'aboie pas avant cette heure. */
  barkAt?: number
}
export interface Fox {
  x: number; z: number; vx: number; vz: number; ry: number
  state: 'away' | 'in' | 'out'
  /** Temps passé dans l'état, et l'heure de la prochaine venue. */
  t: number; next: number
}
export type HerdEvent =
  | { k: 'pen'; i: number }
  | { k: 'near'; i: number }
  | { k: 'flee'; i: number }
  | { k: 'fox'; on: boolean }

export interface Herd {
  o: HerdOpts
  sheep: Animal[]
  dogs: Dog[]
  fox: Fox | null
  t: number
  rnd: () => number
}

/** Les réglages : distances en mètres de ferme (un mouton fait ~0,6), vitesses en m/s. */
export const TUNE = {
  /** Le rayon d'un mouton (au sol). */
  body: 0.28,
  /** En dessous, deux moutons s'écartent. */
  sep: 0.62,
  /** Les voisins avec qui l'on se serre. */
  coh: 3.5,
  /** La peur du chien, du chien pour la chèvre, du renard. */
  fear: 4.2, goatFear: 1.4, foxFear: 4.6,
  /** L'aboiement porte jusque-là. */
  bark: 3.6,
  /** Brouter, fuir. */
  graze: 0.22, run: 1.7,
  /** Le chien : vitesse, réactivité. */
  dog: 3.8, dogAcc: 9,
  /** Le renard : en approche, en fuite. */
  foxIn: 2.3, foxOut: 4.8
}

/* ---------- Les trois fermes (la fleur, l'éclair, la flamme) ----------
   L'enclos au fond à droite (le doigt reste sous le troupeau et ne le cache
   pas), avec un passage derrière lui ; rien n'est adossé au bord (un recoin
   entre une meule et la clôture coinçait les moutons) : au moins 1,2 m de
   passage partout ; pas d'arbre (ses feuilles cacheraient les moutons). Les
   rayons sont ceux des pièces (`foot`, core/farm3d.ts). */
export type Level = 'easy' | 'med' | 'exp'
export const FOOT = { barn: 2.1, haystack: 1.15, pond: 1.6, bales: 0.85, woodpile: 1.15, well: 0.9 } as const
export type PieceName = keyof typeof FOOT
export interface LevelDef {
  /** Le bord du plateau pour les bêtes. */
  edge: number
  /** L'ouverture de l'enclos (angle). */
  gap: number
  /** Les trois troupeaux de la journée, et en combien de petits groupes ils broutent. */
  herds: [number, number, number]
  clusters: [number, number, number]
  goat: boolean
  fox: boolean
  /** La durée du jour (s) pour les trois troupeaux. */
  day: number
  pieces: { id: PieceName; x: number; z: number; ry: number }[]
}
const at = (deg: number, r: number) => ({ x: Math.sin(deg * Math.PI / 180) * r, z: Math.cos(deg * Math.PI / 180) * r })
/** Le centre de l'enclos et son rayon ; l'ouverture regarde le milieu de la ferme. */
export const PEN_AT = { ...at(155, 4.2), r: 1.55 }
const BASE: LevelDef['pieces'] = [
  { id: 'barn', x: -3.0, z: -2.2, ry: 0.55 },
  { id: 'haystack', x: -4.2, z: 2.2, ry: 0 }
]
export const LEVELS: Record<Level, LevelDef> = {
  easy: { edge: 7.1, gap: 1.1, herds: [4, 5, 6], clusters: [1, 2, 2], goat: false, fox: false, day: 240, pieces: BASE },
  med: {
    edge: 7.1, gap: 0.92, herds: [5, 7, 9], clusters: [2, 2, 3], goat: true, fox: false, day: 270,
    pieces: [...BASE, { id: 'pond', x: 3.0, z: 1.9, ry: 0.4 }, { id: 'bales', x: -0.6, z: 1.2, ry: 0.7 }]
  },
  exp: {
    edge: 7.1, gap: 0.8, herds: [7, 9, 12], clusters: [2, 3, 3], goat: true, fox: true, day: 300,
    pieces: [...BASE, { id: 'pond', x: 2.6, z: 2.6, ry: 0.4 }, { id: 'woodpile', x: -0.8, z: 1.0, ry: 0.3 }, { id: 'well', x: 4.4, z: -0.8, ry: 0 }]
  }
}
/** Les réglages du troupeau pour un niveau (la `seed` fait la partie). */
export function herdOpts(l: Level, seed = 1): HerdOpts {
  const L = LEVELS[l]
  return {
    edge: L.edge, seed,
    pen: { x: PEN_AT.x, z: PEN_AT.z, r: PEN_AT.r, dir: Math.atan2(-PEN_AT.x, -PEN_AT.z), gap: L.gap },
    obstacles: L.pieces.map(p => ({ x: p.x, z: p.z, r: FOOT[p.id] }))
  }
}

/** Un hasard reproductible (mulberry32) : les tests et le bot rejouent la même partie. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeHerd(o: HerdOpts): Herd {
  return { o, sheep: [], dogs: [], fox: null, t: 0, rnd: rng(o.seed ?? 1) }
}

/** L'angle (dans le sens de la ferme) de (x, z) vu du centre de l'enclos, rapporté à l'ouverture (−π..π). */
function gapAngle(p: Pen, x: number, z: number) {
  const a = Math.atan2(x - p.x, z - p.z) - p.dir
  return Math.atan2(Math.sin(a), Math.cos(a))
}
/** Le point juste devant l'ouverture, dehors (là où l'on amène le troupeau). */
export function gateFront(p: Pen, d = 0.9) {
  return { x: p.x + Math.sin(p.dir) * (p.r + d), z: p.z + Math.cos(p.dir) * (p.r + d) }
}
/** Ce point est-il libre (ni dans un obstacle, ni dans l'enclos, ni hors du plateau) ? */
export function free(h: Herd, x: number, z: number, margin = 0.4) {
  if (Math.hypot(x, z) > h.o.edge - margin) return false
  const p = h.o.pen
  if (Math.hypot(x - p.x, z - p.z) < p.r + margin + 0.3) return false
  return h.o.obstacles.every(c => Math.hypot(x - c.x, z - c.z) > c.r + margin)
}

/** Un nouveau troupeau : `n` bêtes en `clusters` petits groupes, posés sur
    l'herbe libre, loin de l'enclos ; la chèvre en plus si demandé (elle
    compte comme un mouton). */
export function spawn(h: Herd, n: number, o: { clusters: number; goat?: boolean }) {
  const p = h.o.pen, r = h.rnd
  const centres: { x: number; z: number }[] = []
  for (let tries = 0; centres.length < o.clusters && tries < 400; tries++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(0.15 + r() * 0.85) * (h.o.edge - 1.4)
    const x = Math.sin(a) * d, z = Math.cos(a) * d
    // Loin de l'enclos, des chiens (devant, au départ) et des autres groupes, sur de l'herbe libre
    if (Math.hypot(x - p.x, z - p.z) < p.r + 3.2 || !free(h, x, z, 1.0)) continue
    if (Math.hypot(x, z - (h.o.edge - 1.2)) < 3.6) continue
    if (centres.some(c => Math.hypot(c.x - x, c.z - z) < 3.2)) continue
    centres.push({ x, z })
  }
  if (!centres.length) centres.push({ x: 0, z: 2 })
  for (let i = 0; i < n; i++) {
    const c = centres[i % centres.length]
    let x = c.x, z = c.z
    for (let tries = 0; tries < 60; tries++) {
      const a = r() * Math.PI * 2, d = 0.4 + r() * 1.1
      x = c.x + Math.sin(a) * d; z = c.z + Math.cos(a) * d
      if (free(h, x, z, 0.35) && h.sheep.every(s => Math.hypot(s.x - x, s.z - z) > TUNE.sep)) break
    }
    h.sheep.push(animal(o.goat && i === n - 1 ? 'goat' : 'sheep', x, z, r()))
  }
}

function animal(kind: Kind, x: number, z: number, u: number): Animal {
  return { kind, x, z, vx: 0, vz: 0, ry: u * Math.PI * 2, penned: false, fear: 0, scare: 0, wander: u * Math.PI * 2, wanderIn: 0.5 + u * 2, still: u < 0.5, home: null, bleatIn: 0, nearIn: 0 }
}

/** Les chiens, posés devant (côté caméra), tournés vers la ferme. */
export function addDogs(h: Herd, n: number) {
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 1.6, z = h.o.edge - 1.2
    h.dogs.push({ x, z, vx: 0, vz: 0, ry: Math.PI, tx: x, tz: z })
  }
}

/** Le renard viendra (la flamme) : la première fois après `first` secondes. */
export function addFox(h: Herd, first = 14) {
  h.fox = { x: 0, z: h.o.edge + 2, vx: 0, vz: 0, ry: 0, state: 'away', t: 0, next: h.t + first }
}

/** Le chien aboie : tout ce qui est à portée prend peur (la chèvre aussi). */
export function bark(h: Herd, d = 0) {
  const dog = h.dogs[d]
  if (!dog) return
  for (const s of h.sheep) if (!s.penned && Math.hypot(s.x - dog.x, s.z - dog.z) < TUNE.bark) s.scare = 0.9
}

export const outside = (h: Herd) => h.sheep.filter(s => !s.penned)

/** Le temps qui passe, en pas d'un soixantième au plus. Renvoie ce qui s'est passé. */
export function stepHerd(h: Herd, dt: number): HerdEvent[] {
  const ev: HerdEvent[] = []
  const n = Math.max(1, Math.ceil(dt / (1 / 60)))
  for (let i = 0; i < n; i++) step(h, dt / n, ev)
  return ev
}

function step(h: Herd, dt: number, ev: HerdEvent[]) {
  h.t += dt
  const { pen: p, edge } = h.o
  const T = TUNE
  stepFox(h, dt, ev)
  for (const d of h.dogs) stepDog(h, d, dt)
  const live = h.sheep
  for (let i = 0; i < live.length; i++) {
    const s = live[i]
    s.bleatIn = Math.max(0, s.bleatIn - dt); s.nearIn = Math.max(0, s.nearIn - dt); s.scare = Math.max(0, s.scare - dt)
    if (s.penned) { stepPenned(h, s, dt); continue }
    // La peur : le chien (la chèvre est têtue), le renard qui rôde
    let fx = 0, fz = 0, fear = 0
    const threat = (x: number, z: number, R: number, k = 1) => {
      const dx = s.x - x, dz = s.z - z, d = Math.hypot(dx, dz)
      if (d >= R || d < 1e-4) return
      const w = (1 - d / R) * k
      fx += dx / d * w; fz += dz / d * w
      fear = Math.max(fear, w)
    }
    const dogR = s.kind === 'goat' && s.scare <= 0 ? T.goatFear : T.fear * (s.scare > 0 ? 1.3 : 1)
    for (const d of h.dogs) threat(d.x, d.z, dogR, s.scare > 0 ? 1.6 : 1)
    if (h.fox && h.fox.state === 'in') threat(h.fox.x, h.fox.z, T.foxFear, 1.3)
    const was = s.fear
    s.fear = Math.max(fear, s.fear - dt * 0.7)
    if (s.fear > 0.35 && was <= 0.35 && s.bleatIn <= 0) { ev.push({ k: 'flee', i }); s.bleatIn = 2.5 + h.rnd() * 2 }
    // Les voisins (le modèle de Strömbom, 2014 : chaque envie est une
    // direction, pesée) — s'écarter de trop près, se serrer vers les autres
    // quand on a peur, garder un peu son élan
    let sx = 0, sz = 0, cx = 0, cz = 0, nb = 0
    for (let j = 0; j < live.length; j++) {
      if (j === i) continue
      const o = live[j]
      if (o.penned) continue
      const dx = s.x - o.x, dz = s.z - o.z, d = Math.hypot(dx, dz)
      if (d < T.sep && d > 1e-4) { sx += dx / d; sz += dz / d }
      if (d < T.coh) { cx += o.x; cz += o.z; nb++ }
    }
    const unit = (x: number, z: number) => { const l = Math.hypot(x, z); return l > 1e-6 ? [x / l, z / l] : [0, 0] }
    const [rx, rz] = unit(sx, sz)
    let wx = 0, wz = 0, speed: number
    const f = s.fear
    if (f > 0.02) {
      const [tx, tz] = unit(fx, fz)
      const [qx, qz] = nb ? unit(cx / nb - s.x, cz / nb - s.z) : [0, 0]
      const [ix, iz] = unit(s.vx, s.vz)
      const na = h.rnd() * Math.PI * 2
      wx = tx * 1.0 + qx * 1.05 + rx * 2 + ix * 0.5 + Math.sin(na) * 0.2
      wz = tz * 1.0 + qz * 1.05 + rz * 2 + iz * 0.5 + Math.cos(na) * 0.2
      // Un peu de peur : il s'éloigne au pas ; beaucoup : il trotte
      speed = T.run * Math.min(1, Math.max(0.45, f * 1.6))
      s.still = false
    } else {
      // Brouter : quelques pas, une pause, une autre direction
      s.wanderIn -= dt
      if (s.wanderIn <= 0) { s.still = h.rnd() < 0.55; s.wander += (h.rnd() - 0.5) * 2.4; s.wanderIn = 1 + h.rnd() * 3 }
      if (!s.still) { wx = Math.sin(s.wander); wz = Math.cos(s.wander) }
      if (nb) { const [qx, qz] = unit(cx / nb - s.x, cz / nb - s.z); wx += qx * 0.3; wz += qz * 0.3 }
      wx += rx * 2; wz += rz * 2
      speed = s.still && !(rx || rz) ? 0 : T.graze
    }
    // Devant l'ouverture, la paille de l'enclos attire : on entre de soi-même
    {
      // (vers le milieu de l'ouverture, pas vers le centre : à côté d'un
      // piquet, on glisse dedans au lieu de buter dessus)
      const ex = p.x + Math.sin(p.dir) * (p.r - 0.3), ez = p.z + Math.cos(p.dir) * (p.r - 0.3)
      const dx = ex - s.x, dz = ez - s.z, d = Math.hypot(dx, dz)
      if (Math.hypot(s.x - p.x, s.z - p.z) < p.r + 1.4 && d > 1e-4 && Math.abs(gapAngle(p, s.x, s.z)) < p.gap / 2 + 0.35) {
        wx += dx / d * 1.6; wz += dz / d * 1.6
        if (speed < T.graze * 2.5) speed = T.graze * 2.5
      }
    }
    // Les obstacles, le bord, les piquets : on s'en détourne en les longeant
    for (const c of h.o.obstacles) {
      const dx = s.x - c.x, dz = s.z - c.z, d = Math.hypot(dx, dz), R = c.r + T.body + 0.45
      if (d < R && d > 1e-4) { const w = (1 - d / R) * 2; wx += dx / d * w; wz += dz / d * w }
    }
    // Le bord : on s'en détourne tôt (plaqués contre la clôture, ils en
    // faisaient le tour sans fin)
    const dc = Math.hypot(s.x, s.z)
    if (dc > edge - 1.4) { const w = (dc - (edge - 1.4)) / 1.4 * 3; wx -= s.x / dc * w; wz -= s.z / dc * w }
    {
      // Contre les piquets de l'enclos : on s'en écarte, et poussé dessus, on
      // les LONGE vers l'ouverture (comme les vrais moutons, qui suivent les
      // clôtures) — sinon un mouton plaqué au flanc de l'enclos y restait
      const dx = s.x - p.x, dz = s.z - p.z, d = Math.hypot(dx, dz)
      const g = gapAngle(p, s.x, s.z), ga = Math.abs(g)
      const post = p.gap / 2 - Math.asin(Math.min(1, T.body / p.r))
      if (d > 1e-4 && d < p.r + T.body + 0.6 && ga > post) {
        const w = Math.max(0, 1 - (d - p.r) / (T.body + 0.6))
        wx += dx / d * w * 1.5; wz += dz / d * w * 1.5
        const sg = g > 0 ? 1 : -1
        const tx = -dz / d * sg, tz = dx / d * sg
        // Le sens qui ramène vers l'ouverture : l'angle diminue
        const k = (f > 0.02 ? 1.8 : 0.4) * Math.max(w, 0.4)
        const probe = gapAngle(p, s.x + tx * 0.1, s.z + tz * 0.1)
        const dir = Math.abs(probe) < ga ? 1 : -1
        wx += tx * dir * k; wz += tz * dir * k
        if (f <= 0.02 && speed < T.graze) speed = T.graze
      }
    }
    const wl = Math.hypot(wx, wz)
    const dvx = wl > 1e-4 ? wx / wl * speed : 0, dvz = wl > 1e-4 ? wz / wl * speed : 0
    const k = Math.min(1, dt * (f > 0.02 ? 6 : 2.5))
    s.vx += (dvx - s.vx) * k; s.vz += (dvz - s.vz) * k
    s.x += s.vx * dt; s.z += s.vz * dt
    collide(h, s, ev, i)
    const v = Math.hypot(s.vx, s.vz)
    if (v > 0.05) { let da = Math.atan2(s.vx, s.vz) - s.ry; da = Math.atan2(Math.sin(da), Math.cos(da)); s.ry += da * Math.min(1, dt * 8) }
  }
}

/** Ce qui ne se traverse pas : les obstacles, le bord, les piquets (sauf par l'ouverture). */
function collide(h: Herd, s: Animal, ev: HerdEvent[], i: number) {
  const { pen: p, edge } = h.o
  const B = TUNE.body
  for (const c of h.o.obstacles) {
    const dx = s.x - c.x, dz = s.z - c.z, d = Math.hypot(dx, dz), R = c.r + B
    if (d < R) { const k = d > 1e-4 ? R / d : 0; s.x = c.x + (d > 1e-4 ? dx * k : R); s.z = c.z + (d > 1e-4 ? dz * k : 0) }
  }
  const dc = Math.hypot(s.x, s.z)
  if (dc > edge) { s.x *= edge / dc; s.z *= edge / dc }
  const dx = s.x - p.x, dz = s.z - p.z, d = Math.hypot(dx, dz)
  // Entré : il est à l'abri
  if (d < p.r - 0.35) {
    s.penned = true
    s.fear = 0
    ev.push({ k: 'pen', i })
    return
  }
  // Contre les piquets, hors de l'ouverture : il reste dehors (ou dedans)
  const ga = Math.abs(gapAngle(p, s.x, s.z))
  const half = p.gap / 2 - Math.asin(Math.min(1, B / p.r))
  if (d < p.r + B + 0.02 && ga > half) {
    const out = d >= p.r - 0.05
    const R = out ? p.r + B + 0.02 : p.r - B - 0.02
    if (d > 1e-4) { s.x = p.x + dx / d * R; s.z = p.z + dz / d * R }
    // Tout près de l'ouverture, mais à côté : « presque »
    if (out && ga < p.gap / 2 + 0.5 && s.nearIn <= 0 && Math.hypot(s.vx, s.vz) > 0.6) { ev.push({ k: 'near', i }); s.nearIn = 3 }
  }
}

/** Rentré : il va brouter à sa place, sans plus rien craindre. */
function stepPenned(h: Herd, s: Animal, dt: number) {
  const p = h.o.pen
  if (!s.home) {
    // Une place libre dans l'enclos (pas trop près des autres)
    let best = { x: p.x, z: p.z }, bestD = -1
    for (let k = 0; k < 14; k++) {
      const a = h.rnd() * Math.PI * 2, d = Math.sqrt(h.rnd()) * (p.r - 0.45)
      const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d
      const near = Math.min(9, ...h.sheep.filter(o => o !== s && o.penned && o.home).map(o => Math.hypot(o.home!.x - x, o.home!.z - z)))
      if (near > bestD) { bestD = near; best = { x, z } }
    }
    s.home = best
  }
  const dx = s.home.x - s.x, dz = s.home.z - s.z, d = Math.hypot(dx, dz)
  const sp = d > 0.05 ? Math.min(0.9, d * 2) : 0
  const k = Math.min(1, dt * 4)
  s.vx += ((d > 1e-4 ? dx / d : 0) * sp - s.vx) * k; s.vz += ((d > 1e-4 ? dz / d : 0) * sp - s.vz) * k
  s.x += s.vx * dt; s.z += s.vz * dt
  const ex = s.x - p.x, ez = s.z - p.z, e = Math.hypot(ex, ez), lim = p.r - TUNE.body - 0.05
  if (e > lim) { s.x = p.x + ex / e * lim; s.z = p.z + ez / e * lim }
  if (Math.hypot(s.vx, s.vz) > 0.05) { let da = Math.atan2(s.vx, s.vz) - s.ry; da = Math.atan2(Math.sin(da), Math.cos(da)); s.ry += da * Math.min(1, dt * 6) }
}

/** Les ronds qui barrent la route du chien (et du renard) : les obstacles, l'enclos entier. */
const blocks = (h: Herd) => [...h.o.obstacles, { x: h.o.pen.x, z: h.o.pen.z, r: h.o.pen.r + 0.12 }]

/** Vers (tx, tz), en CONTOURNANT ce qui barre le chemin (la grange, l'enclos) :
    on file le long du bord de l'obstacle, du côté qui mène au but et qui
    reste sur le plateau — pousser tout droit dessus, c'est rester planté. */
function around(h: Herd, x: number, z: number, tx: number, tz: number, R0: number) {
  const sx = tx - x, sz = tz - z, L = Math.hypot(sx, sz)
  if (L < 1e-4) return { dx: 0, dz: 0, L }
  let dx = sx / L, dz = sz / L
  // Le PREMIER rond qui barre le chemin (pas le premier de la liste : la
  // grange au loin faisait pousser le chien contre l'enclos tout proche)
  let hit: { c: Circle; R: number; u: number } | null = null
  for (const c of blocks(h)) {
    const R = c.r + R0
    const ox = x - c.x, oz = z - c.z
    if (Math.hypot(ox, oz) > R + L) continue
    const u = Math.max(0, Math.min(1, ((c.x - x) * sx + (c.z - z) * sz) / (L * L)))
    const qx = x + sx * u - c.x, qz = z + sz * u - c.z
    if (qx * qx + qz * qz >= R * R) continue
    if (!hit || u < hit.u) hit = { c, R, u }
  }
  if (hit) {
    const { c, R } = hit
    const ox = x - c.x, oz = z - c.z, od = Math.hypot(ox, oz)
    if (od > R + 0.05) {
      // De loin : vers l'un des deux points où la route frôle le rond (le
      // côté du but, s'il reste sur le plateau)
      const a = Math.asin(Math.min(1, R / od)), base = Math.atan2(-ox, -oz), reach = Math.sqrt(Math.max(0, od * od - R * R))
      const lim = h.o.edge + DOG_EDGE - 0.05
      let best: { x: number; z: number } | null = null, bestS = -Infinity
      for (const sgn of [1, -1]) {
        const ang = base + sgn * a, ux = Math.sin(ang), uz = Math.cos(ang)
        const inside = Math.hypot(x + ux * reach, z + uz * reach) < lim
        const sc = ux * dx + uz * dz + (inside ? 0 : -3)
        if (sc > bestS) { bestS = sc; best = { x: ux, z: uz } }
      }
      if (best) { dx = best.x; dz = best.z }
    } else if (od > 1e-4) {
      // Tout contre : on le longe, du côté du but, en s'en écartant un peu
      const t1 = { x: -oz / od, z: ox / od }, t2 = { x: oz / od, z: -ox / od }
      const t = t1.x * dx + t1.z * dz >= t2.x * dx + t2.z * dz ? t1 : t2
      const nx = t.x + ox / od * 0.35, nz = t.z + oz / od * 0.35, nl = Math.hypot(nx, nz)
      dx = nx / nl; dz = nz / nl
    }
  }
  return { dx, dz, L }
}

function stepDog(h: Herd, d: Dog, dt: number) {
  const { edge } = h.o
  const { dx, dz, L } = around(h, d.x, d.z, d.tx, d.tz, 0.3)
  const sp = Math.min(TUNE.dog, L * 4)
  const k = Math.min(1, dt * TUNE.dogAcc)
  d.vx += (dx * sp - d.vx) * k
  d.vz += (dz * sp - d.vz) * k
  d.x += d.vx * dt; d.z += d.vz * dt
  for (const c of blocks(h)) {
    const ox = d.x - c.x, oz = d.z - c.z, od = Math.hypot(ox, oz), R = c.r + 0.3
    if (od < R && od > 1e-4) { d.x = c.x + ox / od * R; d.z = c.z + oz / od * R }
  }
  // Le chien, lui, se glisse entre un mouton et la clôture (sinon un mouton
  // plaqué au bord ne se ramène jamais)
  const dc = Math.hypot(d.x, d.z), dEdge = edge + DOG_EDGE
  if (dc > dEdge) { d.x *= dEdge / dc; d.z *= dEdge / dc }
  if (Math.hypot(d.vx, d.vz) > 0.1) { let da = Math.atan2(d.vx, d.vz) - d.ry; da = Math.atan2(Math.sin(da), Math.cos(da)); d.ry += da * Math.min(1, dt * 12) }
}
/** Ce que le chien a de plus que les moutons, au bord (la clôture est à ~0,45 du bord des moutons). */
const DOG_EDGE = 0.35

function stepFox(h: Herd, dt: number, ev: HerdEvent[]) {
  const f = h.fox
  if (!f) return
  f.t += dt
  const { edge } = h.o
  if (f.state === 'away') {
    if (h.t < f.next || !outside(h).length) return
    // Il sort du bord, loin des chiens et de l'enclos (le meilleur de quelques essais)
    let pa = 0, best = -1
    for (let k = 0; k < 8; k++) {
      const a = h.rnd() * Math.PI * 2, x = Math.sin(a) * (edge - 0.2), z = Math.cos(a) * (edge - 0.2)
      const far = Math.min(Math.hypot(x - h.o.pen.x, z - h.o.pen.z) - 1, ...h.dogs.map(dg => Math.hypot(x - dg.x, z - dg.z)))
      if (far > best) { best = far; pa = a }
    }
    f.x = Math.sin(pa) * (edge - 0.2); f.z = Math.cos(pa) * (edge - 0.2)
    f.vx = f.vz = 0; f.ry = pa + Math.PI
    f.state = 'in'; f.t = 0
    ev.push({ k: 'fox', on: true })
    return
  }
  let tx: number, tz: number, sp: number
  if (f.state === 'in') {
    const out = outside(h)
    const c = out.length ? centroid(out) : { x: 0, z: 0 }
    tx = c.x; tz = c.z; sp = TUNE.foxIn
    // Un chien tout près, ou il a assez rôdé : il repart
    if (h.dogs.some(d => Math.hypot(d.x - f.x, d.z - f.z) < 1.9) || f.t > 10 || !out.length) { f.state = 'out'; f.t = 0 }
  } else {
    const dc = Math.hypot(f.x, f.z) || 1
    tx = f.x / dc * (edge + 1); tz = f.z / dc * (edge + 1); sp = TUNE.foxOut
    if (dc > edge - 0.1) { f.state = 'away'; f.t = 0; f.next = h.t + 20 + h.rnd() * 12; ev.push({ k: 'fox', on: false }); return }
  }
  const { dx, dz, L: d } = around(h, f.x, f.z, tx, tz, 0.3)
  const k = Math.min(1, dt * 6)
  f.vx += (dx * Math.min(sp, d * 3) - f.vx) * k
  f.vz += (dz * Math.min(sp, d * 3) - f.vz) * k
  f.x += f.vx * dt; f.z += f.vz * dt
  for (const c of h.o.obstacles) {
    const ox = f.x - c.x, oz = f.z - c.z, od = Math.hypot(ox, oz), R = c.r + 0.3
    if (od < R && od > 1e-4) { f.x = c.x + ox / od * R; f.z = c.z + oz / od * R }
  }
  if (Math.hypot(f.vx, f.vz) > 0.1) { let da = Math.atan2(f.vx, f.vz) - f.ry; da = Math.atan2(Math.sin(da), Math.cos(da)); f.ry += da * Math.min(1, dt * 10) }
}

export function centroid(a: { x: number; z: number }[]) {
  let x = 0, z = 0
  for (const s of a) { x += s.x; z += s.z }
  return { x: x / (a.length || 1), z: z / (a.length || 1) }
}

/** Le pilote : où envoyer le chien `d`. Chasser le renard s'il rôde ; sinon
    aller chercher le mouton le plus écarté (par derrière, pour le ramener
    vers les autres) ; sinon pousser tout le troupeau, par derrière, vers
    l'ouverture — puis dedans. En faisant le tour du troupeau quand on est
    du mauvais côté (passer au travers l'éparpillerait). */
export function pilot(h: Herd, d = 0): { x: number; z: number } {
  const dog = h.dogs[d] ?? { x: 0, z: h.o.edge - 1 }
  const out = outside(h)
  const p = h.o.pen
  if (h.fox?.state === 'in') return clampFree(h, h.fox.x, h.fox.z)
  if (!out.length) return { x: dog.x, z: dog.z }
  const C = centroid(out)
  // Bien en face de l'ouverture : on pousse dedans ; sinon on amène d'abord
  // le troupeau devant elle, au large (le pousser le long des piquets le
  // ferait glisser à côté)
  // — et s'il est derrière l'enclos, on le fait d'abord revenir par son côté
  const cd = Math.hypot(C.x - p.x, C.z - p.z)
  const ca = gapAngle(p, C.x, C.z)
  // Contre l'enclos (à côté de l'ouverture), il suffit de les pousser vers
  // lui : ils longent les piquets jusqu'à l'ouverture
  let T: { x: number; z: number }
  if ((Math.abs(ca) < 0.55 && cd < p.r + 3.2) || cd < p.r + 1.2) T = { x: p.x, z: p.z }
  else if (Math.abs(ca) < Math.PI / 2) T = gateFront(p, 2.2)
  else {
    const a = p.dir + Math.sign(ca) * Math.PI / 2
    T = { x: p.x + Math.sin(a) * (p.r + 2.0), z: p.z + Math.cos(a) * (p.r + 2.0) }
  }
  // Strömbom : on va chercher dès qu'un mouton s'écarte de plus de ra·N^⅔ ;
  // on pousse depuis ra·√N derrière le troupeau
  const rc = Math.max(1.2, TUNE.sep * Math.pow(out.length, 2 / 3))
  const dist = (s: { x: number; z: number }) => Math.hypot(s.x - C.x, s.z - C.z)
  // Le plus écarté (à deux chiens, chacun le sien) ; celui qu'on est allé
  // chercher reste le nôtre jusqu'à ce qu'il ait rejoint les autres (sinon
  // le pilote hésite entre deux traînards et n'en ramène aucun)
  const far = out.slice().sort((a, b) => dist(b) - dist(a))
  const mine = dog.aim && !dog.aim.penned && out.includes(dog.aim) && dist(dog.aim) > rc * 0.7 ? dog.aim : null
  const lone = mine ?? far[Math.min(d, far.length - 1)]
  let want: { x: number; z: number }, from: { x: number; z: number }, toward: { x: number; z: number }, back: number
  if (mine || dist(lone) > rc) {
    if (h.dogs[d]) h.dogs[d].aim = lone
    from = lone; toward = C; back = 0.9
  } else {
    if (h.dogs[d]) h.dogs[d].aim = null
    // Juste derrière le troupeau : assez près pour que les derniers le sentent
    from = C; toward = T; back = TUNE.sep * Math.sqrt(out.length) + 1.0
  }
  {
    const ux = from.x - toward.x, uz = from.z - toward.z, ul = Math.hypot(ux, uz) || 1
    want = { x: from.x + ux / ul * back, z: from.z + uz / ul * back }
  }
  // Derrière lui, c'est le bord : on longe le bord, pour le pousser le long de la clôture
  if (Math.hypot(want.x, want.z) > h.o.edge + DOG_EDGE) {
    const r = Math.hypot(from.x, from.z) || 1, nx = from.x / r, nz = from.z / r
    const sign = Math.sign(-nz * (toward.x - from.x) + nx * (toward.z - from.z)) || 1
    want = { x: from.x + nz * sign * back - nx * 0.4, z: from.z - nx * sign * back - nz * 0.4 }
  }
  // Du mauvais côté (entre lui et là où on veut l'amener) : on le contourne
  // au large, toujours du même côté (sinon le chien hésite et reste planté) —
  // sauf si ce côté est bouché (l'enclos, un obstacle, le bord)
  const dg = h.dogs[d]
  const ax = dog.x - from.x, az = dog.z - from.z, bx = want.x - from.x, bz = want.z - from.z
  const al = Math.hypot(ax, az), bl = Math.hypot(bx, bz)
  if (al > 1e-3 && bl > 1e-3 && (ax * bx + az * bz) / (al * bl) < -0.1) {
    const R = back + 1.0
    const way = (side: number) => ({ x: from.x + (ax / al * 0.25 - az / al * side) * R, z: from.z + (az / al * 0.25 + ax / al * side) * R })
    const pref = dg?.side || (ax * bz - az * bx > 0 ? -1 : 1)
    const side = free(h, way(pref).x, way(pref).z, 0.3) || !free(h, way(-pref).x, way(-pref).z, 0.3) ? pref : -pref
    if (dg) dg.side = side
    want = way(side)
  } else {
    if (dg) dg.side = 0
    // Trop près d'un mouton : le chien s'arrête et laisse le troupeau s'écarter
    // (foncer dedans l'éparpille)
    // — sauf tout près de l'enclos, où il faut pousser jusqu'au bout
    if (cd > p.r + 1.6 && out.some(s => Math.hypot(s.x - dog.x, s.z - dog.z) < 1.5)) return { x: dog.x, z: dog.z }
  }
  return clampFree(h, want.x, want.z)
}

/** Le pilote aboierait-il ? Quand une bête têtue (la chèvre) est à portée
    et ne bouge pas pour lui — une fois toutes les deux secondes au plus. */
export function wantsBark(h: Herd, d = 0): boolean {
  const dog = h.dogs[d]
  if (!dog || h.t < (dog.barkAt ?? 0)) return false
  const near = outside(h).some(s => s.kind === 'goat' && s.fear < 0.05 && Math.hypot(s.x - dog.x, s.z - dog.z) < TUNE.bark * 0.8)
  if (near) dog.barkAt = h.t + 2
  return near
}

/** Ramène un point là où le chien peut aller : sur le plateau, hors des
    obstacles et de l'enclos — et pas juste derrière l'enclos : sur son côté. */
function clampFree(h: Herd, x: number, z: number) {
  const p = h.o.pen, lim = h.o.edge + DOG_EDGE - 0.05
  for (const c of h.o.obstacles) {
    const ox = x - c.x, oz = z - c.z, od = Math.hypot(ox, oz), R = c.r + 0.4
    if (od < R) { x = c.x + (od > 1e-4 ? ox / od : 1) * R; z = c.z + (od > 1e-4 ? oz / od : 0) * R }
  }
  const gx = Math.sin(p.dir), gz = Math.cos(p.dir)
  let px = x - p.x, pz = z - p.z
  if (px * gx + pz * gz < 0 && Math.hypot(px, pz) < p.r + 1.8) {
    const side = px * gz - pz * gx >= 0 ? 1 : -1
    px = gz * side * (p.r + 0.9); pz = -gx * side * (p.r + 0.9)
    x = p.x + px; z = p.z + pz
  }
  const d = Math.hypot(x, z)
  if (d > lim) { x *= lim / d; z *= lim / d }
  px = x - p.x; pz = z - p.z
  const pd = Math.hypot(px, pz), R = p.r + 0.5
  if (pd < R) { x = p.x + (pd > 1e-4 ? px / pd : 0) * R; z = p.z + (pd > 1e-4 ? pz / pd : 1) * R }
  return { x, z }
}
