import type { GameContext, GameDef } from '../core/types'
import { pick, rnd, shuffle } from '../core/utils'
import { sfx, preloadSfx, cry, preloadCries, CRY } from '../core/sfx'
import { tone } from '../core/audio'
import { shake } from '../core/juice'
import { createStage, loader, dotTex, type Stage, type T3 } from '../core/three3d'
import { ground, decor, particles, type Particles } from '../core/scene3d'
import { critterKit, type Critter, type CritterKind, type CritterKit } from '../core/critters'
import { critterPortraits, portraitImg } from '../core/portraits'

/* Suites logiques — LE PETIT TRAIN DE LA FERME (28/09). Qu'est-ce qui vient
   après ? Un train entre en gare dans le pré : chaque wagon porte un animal
   de la ferme (les mêmes personnages 3D que partout), et le dernier wagon est
   vide, un anneau doré y brille. En bas, trois ou quatre animaux : on touche
   celui qui monte dans le wagon vide. Zéro lecture.

   Motifs AB / AAB en douce, ABC / AABC / ABB en normale, ABCC / ABAC / ACBC
   ou des animaux qui GRANDISSENT (petit, moyen, grand) en expert ; chaque
   motif est montré au moins deux fois en entier.

   Apprendre SANS sanction : un mauvais animal tremble et s'efface, on
   réessaie ; au deuxième raté, le bon monte tout seul. Une suite trouvée :
   l'animal saute dans le wagon (et dit son cri), les ridelles des wagons se
   colorent motif par motif — on VOIT pourquoi c'était lui —, tout le monde
   fait la vague, le train siffle et repart ; le suivant entre en gare. */

type Item = { kind: CritterKind; size?: number }
const KINDS: CritterKind[] = ['cow', 'pig', 'hen', 'chick', 'duck', 'sheep', 'dog', 'rabbit']
const GROW = [0.62, 0.8, 1]
/** Couleurs des ridelles : neutre, puis motif pair / impair une fois trouvé. */
const BOARD = 0x9C6B45, BOARD_A = 0xE39A2E, BOARD_B = 0x3D8FC4
const WAGON_L = 1.25, LOCO_L = 2.2
const ANIMAL = 0.74

const key = (it: Item) => it.kind + ':' + (it.size ?? 1)

function makeRound(tier: string): { seq: Item[]; answer: Item; options: Item[]; period: number } {
  const kinds = shuffle([...KINDS])
  let motif: Item[]
  if (tier === 'easy') {
    const [A, B] = [{ kind: kinds[0] }, { kind: kinds[1] }]
    motif = Math.random() < 0.5 ? [A, B] : [A, A, B]
  } else if (tier === 'med') {
    const [A, B, C] = [{ kind: kinds[0] }, { kind: kinds[1] }, { kind: kinds[2] }]
    motif = pick([[A, B, C], [A, A, B, C], [A, B, B]])
  } else if (Math.random() < 0.4) {
    // Le même animal, petit, moyen, grand… puis on recommence
    motif = GROW.map(size => ({ kind: kinds[0], size }))
  } else {
    const [A, B, C] = [{ kind: kinds[0] }, { kind: kinds[1] }, { kind: kinds[2] }]
    motif = pick([[A, B, C, C], [A, B, A, C], [A, C, B, C]])
  }
  // Deux motifs entiers au moins, et un train qui tient à l'écran
  const full: Item[] = []
  for (let r = 0; r < 3; r++) full.push(...motif)
  const cut = motif.length * 2 + rnd(0, Math.min(1, motif.length - 1))
  const seq = full.slice(0, cut)
  const answer = full[cut]
  const options: Item[] = [answer]
  let guard = 0
  while (options.length < (tier === 'easy' ? 3 : 4) && guard++ < 80) {
    const o: Item = answer.size && Math.random() < 0.6
      ? { kind: answer.kind, size: pick(GROW.filter(s => s !== answer.size)) }
      : { kind: pick(KINDS), size: answer.size }
    if (!options.some(x => key(x) === key(o))) options.push(o)
  }
  return { seq, answer, options: shuffle(options), period: motif.length }
}

/* ---------- Le train ---------- */
interface Wagon {
  g: import('three').Group
  boards: import('three').MeshStandardMaterial
  item: Item | null
  critter: Critter | null
  /** Pour l'animation : saut en cours (secondes), apparition (0 → 1). */
  hop: number
  pop: number
  ring: import('three').Mesh | null
}
interface Train {
  g: import('three').Group
  wagons: Wagon[]
  wheels: import('three').Object3D[]
  x: number
  /** 'in' : entre en gare ; 'wait' : à quai ; 'out' : repart. */
  phase: 'in' | 'wait' | 'out'
  /** Secondes avant d'entrer en gare (le temps que le précédent s'en aille). */
  delay: number
  stop: number
  glow: import('three').Sprite | null
  t: number
  from: number
  length: number
  chimney: import('three').Object3D
}

interface Parts {
  box: import('three').BoxGeometry
  cyl: import('three').CylinderGeometry
  sph: import('three').SphereGeometry
  ring: import('three').TorusGeometry
  dark: import('three').MeshStandardMaterial
  wood: import('three').MeshStandardMaterial
  red: import('three').MeshStandardMaterial
  green: import('three').MeshStandardMaterial
  gold: import('three').MeshStandardMaterial
  steel: import('three').MeshStandardMaterial
  lamp: import('three').MeshStandardMaterial
  glow: import('three').MeshStandardMaterial
  glass: import('three').MeshStandardMaterial
}

function makeParts(T: T3): Parts {
  const std = (color: number, roughness = 0.6, metalness = 0, extra: Record<string, unknown> = {}) =>
    new T.MeshStandardMaterial({ color, roughness, metalness, ...extra })
  return {
    box: new T.BoxGeometry(1, 1, 1),
    cyl: new T.CylinderGeometry(1, 1, 1, 28),
    sph: new T.SphereGeometry(1, 24, 16),
    ring: new T.TorusGeometry(0.3, 0.045, 12, 40),
    dark: std(0x2E2A28, 0.55, 0.3),
    wood: std(0x7A4B2A, 0.85),
    red: std(0xA3261F, 0.4, 0.1),
    green: std(0x24613B, 0.5),
    gold: std(0xB8892E, 0.3, 0.9),
    steel: std(0x8E959C, 0.35, 0.85),
    lamp: std(0xFFE7A0, 0.3, 0, { emissive: 0xFFC94D, emissiveIntensity: 1.2 }),
    glow: std(0xFFD34D, 0.3, 0, { emissive: 0xFFB300, emissiveIntensity: 0.9, transparent: true, opacity: 0.9 }),
    glass: std(0x2B3B48, 0.15, 0.2)
  }
}

function add(T: T3, parent: import('three').Object3D, geo: import('three').BufferGeometry, mat: import('three').Material,
  pos: [number, number, number], scale: [number, number, number], rot: [number, number, number] = [0, 0, 0]) {
  const m = new T.Mesh(geo, mat)
  m.position.set(...pos); m.scale.set(...scale); m.rotation.set(...rot)
  m.castShadow = true; m.receiveShadow = true
  parent.add(m)
  return m
}

/** Une roue : le rayon, et un moyeu doré ; elle tourne autour de z. */
function wheel(T: T3, P: Parts, parent: import('three').Object3D, x: number, z: number, r: number, wheels: import('three').Object3D[]) {
  const w = new T.Group()
  w.position.set(x, r, z)
  add(T, w, P.cyl, P.red, [0, 0, 0], [r, 0.08, r], [Math.PI / 2, 0, 0])
  add(T, w, P.cyl, P.gold, [0, 0, z > 0 ? 0.045 : -0.045], [r * 0.35, 0.03, r * 0.35], [Math.PI / 2, 0, 0])
  // Un rayon, pour voir la roue tourner
  add(T, w, P.box, P.dark, [0, 0, z > 0 ? 0.042 : -0.042], [r * 1.7, r * 0.18, 0.02])
  parent.add(w)
  wheels.push(w)
}

function buildTrain(T: T3, P: Parts, n: number): Train {
  const g = new T.Group()
  const wheels: import('three').Object3D[] = []
  // La locomotive, qui mène à gauche (le train roule vers −x)
  const loco = new T.Group()
  add(T, loco, P.box, P.dark, [0, 0.31, 0], [2.0, 0.14, 0.66])
  add(T, loco, P.cyl, P.red, [-0.25, 0.72, 0], [0.34, 1.15, 0.34], [0, 0, Math.PI / 2])
  add(T, loco, P.cyl, P.dark, [-0.86, 0.72, 0], [0.35, 0.14, 0.35], [0, 0, Math.PI / 2])
  for (const bx of [-0.62, 0.12]) add(T, loco, P.cyl, P.gold, [bx, 0.72, 0], [0.355, 0.05, 0.355], [0, 0, Math.PI / 2])
  add(T, loco, P.cyl, P.dark, [-0.62, 1.2, 0], [0.1, 0.4, 0.1])
  add(T, loco, P.cyl, P.dark, [-0.62, 1.42, 0], [0.16, 0.1, 0.16])
  add(T, loco, P.sph, P.gold, [-0.08, 1.06, 0], [0.14, 0.14, 0.14])
  add(T, loco, P.cyl, P.lamp, [-0.95, 0.98, 0], [0.08, 0.06, 0.08], [0, 0, Math.PI / 2])
  // La cabine, son toit, ses fenêtres
  add(T, loco, P.box, P.green, [0.6, 0.83, 0], [0.64, 0.72, 0.8])
  add(T, loco, P.box, P.red, [0.62, 1.23, 0], [0.84, 0.08, 0.94])
  for (const z of [-0.41, 0.41]) add(T, loco, P.box, P.glass, [0.6, 0.98, z], [0.34, 0.26, 0.02])
  // Le chasse-pierres
  add(T, loco, P.box, P.red, [-1.06, 0.22, 0], [0.18, 0.2, 0.64], [0, 0, 0.55])
  for (const z of [-0.34, 0.34]) {
    wheel(T, P, loco, 0.05, z, 0.25, wheels)
    wheel(T, P, loco, 0.6, z, 0.25, wheels)
    wheel(T, P, loco, -0.68, z, 0.15, wheels)
  }
  g.add(loco)
  const chimney = new T.Object3D()
  chimney.position.set(-0.62, 1.5, 0)
  loco.add(chimney)
  // Les wagons, à la suite
  const wagons: Wagon[] = []
  for (let i = 0; i < n; i++) {
    const w = new T.Group()
    w.position.x = LOCO_L / 2 + 0.08 + WAGON_L * (i + 0.5)
    const boards = new T.MeshStandardMaterial({ color: BOARD, roughness: 0.7 })
    add(T, w, P.box, P.dark, [0, 0.29, 0], [1.02, 0.12, 0.6])
    add(T, w, P.box, P.wood, [0, 0.38, 0], [1.1, 0.06, 0.8])
    for (const z of [-0.39, 0.39]) add(T, w, P.box, boards, [0, 0.49, z], [1.1, 0.18, 0.05])
    for (const x of [-0.53, 0.53]) add(T, w, P.box, boards, [x, 0.49, 0], [0.05, 0.18, 0.8])
    add(T, w, P.box, P.dark, [-0.6, 0.29, 0], [0.16, 0.06, 0.08])
    for (const z of [-0.33, 0.33]) { wheel(T, P, w, -0.32, z, 0.15, wheels); wheel(T, P, w, 0.32, z, 0.15, wheels) }
    g.add(w)
    wagons.push({ g: w, boards, item: null, critter: null, hop: 0, pop: 1, ring: null })
  }
  const length = LOCO_L + n * WAGON_L
  return { g, wagons, wheels, x: 0, phase: 'in', delay: 0, stop: 0, glow: null, t: 0, from: 0, length, chimney }
}

/** Place un animal dans un wagon (le voici, ou il y saute). */
function board(me: State, w: Wagon, it: Item, pop: boolean) {
  const c = me.kit!.make(it.kind, ANIMAL * (it.size ?? 1))
  c.obj.position.y = 0.41
  c.obj.rotation.y = 0.35
  c.obj.traverse(o => { o.castShadow = true })
  w.g.add(c.obj)
  w.critter = c
  w.item = it
  w.pop = pop ? 0 : 1
}

/* ---------- La partie ---------- */
interface State {
  round: number
  total: number
  first: number
  second: number
  tries: number
  lock: boolean
  running: boolean
  answer: Item
  period: number
  root: HTMLElement
  stage: Stage | null
  T: T3 | null
  P: Parts | null
  kit: CritterKit | null
  fx: Particles | null
  train: Train | null
  gone: Train[]
  faces: Record<string, string>
  /** Jeton de manche : tout rappel d'une manche passée se tait. */
  gen: number
  smoke: { s: import('three').Sprite; age: number }[]
  dot: import('three').Texture | null
}

let pt: State | null = null
let ctx: GameContext

const $in = (me: State, sel: string) => me.root.querySelector<HTMLElement>(sel)!

function whistle(delay = 0) {
  // « Tchou-tchou » : deux notes, deux fois
  for (const d of [0, 0.34]) {
    tone(784, 0.26, 'triangle', 0.05, delay + d)
    tone(988, 0.26, 'triangle', 0.04, delay + d)
  }
}

/** Le cadrage : tout le train dans l'écran, au-dessus des réponses. */
function frame(me: State, length: number) {
  const st = me.stage!
  const cam = st.camera
  const aspect = cam.aspect
  const half = (length * 1.08 + 0.8) / 2
  const tanV = Math.tan((cam.fov / 2) * Math.PI / 180)
  const d = Math.max(half / (tanV * aspect), 4.2)
  cam.position.set(0, 1.2 + d * 0.3, d)
  // Le train un peu sous le milieu de l'écran, juste au-dessus des réponses
  cam.lookAt(0, 0.35 + d * 0.035, 0)
}

function load(me: State) {
  const T = me.T!, P = me.P!
  const r = makeRound(ctx.tier)
  me.gen++
  me.answer = r.answer
  me.period = r.period
  me.tries = 0
  me.lock = true
  // L'ancien train repart ; le nouveau entre en gare par la droite
  if (me.train) { me.train.phase = 'out'; me.train.t = 0; me.train.from = me.train.x; me.gone.push(me.train) }
  const tr = buildTrain(T, P, r.seq.length + 1)
  r.seq.forEach((it, i) => board(me, tr.wagons[i], it, false))
  // Le wagon vide : un anneau doré debout qui brille et respire au-dessus
  const last = tr.wagons[tr.wagons.length - 1]
  last.ring = new T.Mesh(P.ring, P.glow)
  last.ring.position.y = 0.86
  last.g.add(last.ring)
  tr.glow = new T.Sprite(new T.SpriteMaterial({ map: me.dot, color: 0xFFD34D, transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending }))
  tr.glow.position.set(0, 0.86, -0.05)
  tr.glow.scale.setScalar(1.3)
  last.g.add(tr.glow)
  const center = -(tr.length / 2) + LOCO_L / 2 // la locomotive à gauche, le train centré
  tr.from = center + tr.length + 16
  tr.x = tr.from
  tr.g.position.x = tr.x
  tr.phase = 'in'
  tr.stop = center
  // Il attend que le précédent ait quitté la gare
  tr.delay = me.train ? 1.7 : 0
  me.stage!.scene.add(tr.g)
  me.train = tr
  frame(me, tr.length)
  // Les réponses : les mêmes animaux, en portraits
  const opts = $in(me, '.pt-opts')
  opts.innerHTML = ''
  opts.classList.add('wait')
  r.options.forEach(o => {
    const b = document.createElement('button')
    b.className = 'pt-opt'
    b.dataset.key = key(o)
    b.innerHTML = `<span class="pt-face" style="--s:${o.size ?? 1}">${portraitImg(me.faces[o.kind], 140)}</span>`
    b.onclick = () => answer(me, b, o)
    opts.appendChild(b)
  })
  paintDots(me)
}

function paintDots(me: State) {
  $in(me, '.pt-dots').innerHTML = Array.from({ length: me.total }, (_, i) =>
    `<i class="sn-dot${i < me.round ? ' on' : ''}${i === me.round ? ' cur' : ''}"></i>`).join('')
}

/** L'animal trouvé saute dans le wagon vide ; les ridelles se colorent motif
    par motif ; la vague ; le train siffle et repart. */
function solve(me: State) {
  const tr = me.train!
  const last = tr.wagons[tr.wagons.length - 1]
  if (last.ring) { last.g.remove(last.ring); last.ring = null }
  if (tr.glow) { last.g.remove(tr.glow); tr.glow.material.dispose(); tr.glow = null }
  board(me, last, me.answer, true)
  const v = CRY[me.answer.kind]
  if (v) cry(v, { vol: 0.7, max: 1.4 })
  const wp = new me.T!.Vector3()
  last.g.getWorldPosition(wp)
  me.fx?.burst({ x: wp.x, y: 0.9, z: wp.z }, { count: 26, color: [0xFFD34D, 0xFFFFFF, 0x7FD36B], speed: 2.4, life: 0.8, size: 0.09, gravity: 3 })
  tr.wagons.forEach((w, k) => {
    w.boards.color.setHex(Math.floor(k / me.period) % 2 ? BOARD_B : BOARD_A)
    w.hop = -0.08 * k // la vague : chaque wagon un peu après le précédent
  })
  $in(me, '.pt-opts').classList.add('wait')
  me.round++
  paintDots(me)
  const gen = me.gen
  ctx.after(1900, () => {
    if (pt !== me || !me.running || me.gen !== gen) return
    whistle()
    if (me.round < me.total) load(me)
    else finish(me)
  })
}

function answer(me: State, b: HTMLButtonElement, o: Item) {
  if (pt !== me || !me.running || me.lock || b.classList.contains('gone')) return
  if (key(o) === key(me.answer)) {
    me.lock = true
    if (me.tries === 0) me.first++; else me.second++
    b.classList.add('good')
    sfx('confirm', { vol: 0.7 })
    solve(me)
    return
  }
  // Pas de sanction : l'animal tremble et s'efface, on réessaie
  me.tries++
  sfx('drop', { vol: 0.4, rate: 0.8 })
  shake(b, 7, 300)
  b.classList.add('gone')
  if (me.tries >= 2) {
    me.lock = true
    const gen = me.gen
    ctx.after(500, () => {
      if (pt !== me || me.gen !== gen) return
      me.root.querySelectorAll<HTMLElement>('.pt-opt').forEach(x => { if (x.dataset.key === key(me.answer)) x.classList.add('good') })
      solve(me)
    })
  }
}

function finish(me: State) {
  const pts = me.first + me.second * 0.5
  const stars = pts >= me.total - 0.5 ? 3 : pts >= me.total - 2.5 ? 2 : 1
  // L'outro : le dernier train repart en sifflant, puis le résultat
  if (me.train) { me.train.phase = 'out'; me.train.t = 0; me.train.from = me.train.x }
  ctx.finish({
    title: 'Sacré sens logique !',
    msg: `Tu as trouvé ${me.first} suite${me.first > 1 ? 's' : ''} du premier coup, sur ${me.total}`,
    stars,
    outroMs: 1600
  })
}

/* ---------- La boucle ---------- */
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, t), 3)

function step(me: State, dt: number, now: number) {
  const moveTrain = (tr: Train) => {
    if (tr.delay > 0) { tr.delay -= dt; return }
    tr.t += dt
    const stop = tr.stop
    const x0 = tr.x
    if (tr.phase === 'in') {
      const D = 2.6
      tr.x = tr.from + (stop - tr.from) * ease(tr.t / D)
      if (tr.t >= D) {
        tr.x = stop; tr.phase = 'wait'
        if (tr === me.train) { me.lock = false; $in(me, '.pt-opts').classList.remove('wait'); whistle() }
      }
    } else if (tr.phase === 'out') {
      // Il démarre, puis file vers la gauche
      tr.x = tr.from - (2.5 * tr.t + 4 * tr.t * tr.t)
    }
    const v = (tr.x - x0) / Math.max(dt, 1e-3)
    tr.g.position.x = tr.x
    for (const w of tr.wheels) w.rotation.z -= (v * dt) / 0.2
    for (const w of tr.wagons) {
      if (w.critter) {
        me.kit!.blink(w.critter, dt)
        if (w.pop < 1) {
          // Il saute dans le wagon : il grandit en passant par un peu trop grand
          w.pop = Math.min(1, w.pop + dt * 2.6)
          const p = w.pop
          const s = p < 0.7 ? p / 0.7 * 1.18 : 1.18 - (p - 0.7) / 0.3 * 0.18
          w.critter.obj.scale.setScalar(Math.max(0.01, s))
          w.critter.obj.position.y = 0.41 + Math.sin(p * Math.PI) * 0.9
        } else if (w.hop !== 0) {
          w.hop += dt
          const h = w.hop
          w.critter.obj.position.y = 0.41 + (h > 0 && h < 0.45 ? Math.sin(h / 0.45 * Math.PI) * 0.32 : 0)
          if (h >= 0.45) { w.hop = 0; w.critter.obj.position.y = 0.41 }
        } else {
          // Au repos, ils se dandinent un peu
          w.critter.obj.rotation.y = 0.35 + Math.sin(now / 700 + w.g.position.x) * 0.12
        }
      }
      if (w.ring) {
        const k = 1 + Math.sin(now / 260) * 0.08
        w.ring.scale.setScalar(k)
        w.ring.position.y = 0.86 + Math.sin(now / 400) * 0.05
        w.ring.rotation.y = Math.sin(now / 900) * 0.5
      }
    }
    // La fumée, tant qu'il est à l'écran
    if (Math.random() < dt * (Math.abs(v) > 0.2 ? 9 : 2.5)) puff(me, tr)
  }
  if (me.train) moveTrain(me.train)
  for (const tr of me.gone) moveTrain(tr)
  // Les trains partis loin sont rangés
  me.gone = me.gone.filter(tr => {
    if (tr.x > -tr.length - 30) return true
    me.stage!.scene.remove(tr.g)
    tr.wagons.forEach(w => w.boards.dispose())
    return false
  })
  for (const p of me.smoke) {
    if (p.age < 0) continue
    p.age += dt
    const k = p.age / 1.8
    p.s.position.y += dt * 0.7
    p.s.position.x += dt * 0.25
    p.s.scale.setScalar(0.25 + k * 0.9)
    ;(p.s.material as import('three').SpriteMaterial).opacity = k >= 1 ? 0 : (1 - k) * 0.55
    if (k >= 1) p.age = -1
  }
  me.fx?.update(dt)
}

function puff(me: State, tr: Train) {
  const p = me.smoke.find(q => q.age < 0)
  if (!p) return
  const wp = new me.T!.Vector3()
  tr.chimney.getWorldPosition(wp)
  p.s.position.copy(wp)
  p.age = 0
}

export const patterns: GameDef = {
  id: 'patterns', name: 'Suites Logiques', icon: '🔷', sq: 'sq-lilac', cat: 'reflexion',
  subtitle: 'Regarde le petit train : quel animal monte dans le dernier wagon ?',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="arena pt-arena">
        <div class="pt-scene" id="ptScene"></div>
        <div class="pt-opts wait"></div>
        <div class="mem-dots pt-dots"></div>
      </div>`
    preloadSfx(['confirm', 'drop'])
    preloadCries(['vache', 'cochon', 'poule', 'canard', 'mouton', 'chien'])
    const me: State = {
      round: 0, total: 6, first: 0, second: 0, tries: 0, lock: true, running: true,
      answer: { kind: 'cow' }, period: 1, root: c.root,
      stage: null, T: null, P: null, kit: null, fx: null, train: null, gone: [], faces: {}, gen: 0, smoke: [], dot: null
    }
    pt = me
    const holder = c.root.querySelector<HTMLElement>('#ptScene')!
    const hideLoader = loader(holder, 'patterns')
    ;(async () => {
      const [faces, stage] = await Promise.all([
        critterPortraits(KINDS, 140),
        createStage(holder, {
          sky: '#BFE3F4', fog: [26, 70], fogColor: '#CFE9F2', fov: 30,
          cam: [0, 3, 12], target: [0, 0.4, 0],
          hemi: ['#DDF0FF', '#6E8F52', 1.05],
          sun: { pos: [-5, 10, 7], color: '#FFF1D6', intensity: 2.3, area: 12, far: 40 },
          fill: 0.45, exposure: 1.02
        })
      ])
      if (!me.running) { stage.dispose(); return }
      me.faces = faces
      me.stage = stage
      const T = me.T = stage.T
      me.P = makeParts(T)
      me.kit = critterKit(T)
      me.fx = particles(stage, 300)
      stage.keep({ dispose: () => me.kit?.dispose() })
      const P = me.P
      stage.keep({ dispose: () => { for (const v of Object.values(P)) (v as { dispose(): void }).dispose() } })
      // Le pré, la voie, le ballast
      ground(stage, { radius: 80, color: 0x5F9A45 })
      const ballast = new T.Mesh(new T.BoxGeometry(160, 0.04, 1.35), new T.MeshStandardMaterial({ color: 0x8C8378, roughness: 1 }))
      ballast.position.y = 0.01; ballast.receiveShadow = true
      stage.scene.add(ballast)
      for (const z of [-0.33, 0.33]) {
        const rail = new T.Mesh(new T.BoxGeometry(160, 0.06, 0.06), P.steel)
        rail.position.set(0, 0.06, z); rail.receiveShadow = true
        stage.scene.add(rail)
      }
      const nS = 280
      const sleepers = new T.InstancedMesh(new T.BoxGeometry(0.16, 0.05, 0.98), P.wood, nS)
      const m4 = new T.Matrix4()
      for (let i = 0; i < nS; i++) { m4.makeTranslation(-70 + i * 0.5, 0.03, 0); sleepers.setMatrixAt(i, m4) }
      sleepers.receiveShadow = true
      stage.scene.add(sleepers)
      // Le décor : des arbres et une clôture derrière la voie, des fleurs devant
      const trees = Array.from({ length: 22 }, (_, i) => ({
        model: `nature/${['tree_oak', 'tree_default', 'tree_fat', 'tree_detailed'][i % 4]}`,
        x: -26 + i * 2.5 + Math.random() * 1.2, z: -6 - Math.random() * 9, size: 2.4 + Math.random() * 2, shade: 0.8
      }))
      const fence = Array.from({ length: 30 }, (_, i) => ({ model: 'nature/fence_simple', x: -30 + i * 2, z: -2.6, size: 0.7, rot: 0, shade: 0.8 }))
      const flowers = Array.from({ length: 26 }, (_, i) => ({
        model: `nature/${['flower_redA', 'flower_yellowA', 'flower_purpleA', 'plant_bush'][i % 4]}`,
        x: -20 + Math.random() * 40, z: 1.4 + Math.random() * 3, size: 0.3 + Math.random() * 0.25, shade: 0.85
      }))
      decor(stage, [...trees, ...fence, ...flowers]).catch(() => { /* sans décor, le train roule quand même */ })
      // La fumée de la locomotive
      const tex = stage.keep(dotTex(T, '#FFFFFF'))
      me.dot = tex
      for (let i = 0; i < 16; i++) {
        const s = new T.Sprite(new T.SpriteMaterial({ map: tex, color: 0xEDEDED, transparent: true, opacity: 0, depthWrite: false }))
        stage.scene.add(s)
        me.smoke.push({ s, age: -1 })
      }
      hideLoader()
      load(me)
      stage.start((dt, now) => { if (pt === me) step(me, dt, now) })
      // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __pt: unknown }).__pt = {
          get answer() { return key(me.answer) }, get round() { return me.round }, get lock() { return me.lock }
        }
      }
    })().catch(err => { hideLoader(); if (me.running) throw err })
    return () => {
      if (!me.running) return
      me.running = false
      me.stage?.dispose()
      if (pt === me) pt = null
      const w = window as unknown as { __pt?: unknown }
      if (w.__pt) delete w.__pt
    }
  }
}
