import type { GameDef, GameContext } from '../core/types'
import { createStage, loader, type Stage, type T3 } from '../core/three3d'
import { particles, camShake, toScreen, type Particles, type CamShake } from '../core/scene3d'
import { buildFarm, type Farm } from '../core/farm3d'
import { critterKit, type Critter, type CritterKit } from '../core/critters'
import { critterPortraits } from '../core/portraits'
import { sfx, preloadSfx, cry, preloadCries } from '../core/sfx'
import { arcade, type Arcade } from '../core/arcade'
import { ICON } from '../core/icons'
import { handNow } from '../core/hand'
import {
  LEVELS, herdOpts, makeHerd, spawn, addDogs, addFox, stepHerd, pilot, bark, outside, TUNE,
  type Herd, type Level, type LevelDef
} from '../core/herd'

/* 🐕 LE CHIEN DE BERGER (11/10, Jouer, 3D ; maquettes et plan validés :
   « Go chien de berger », « yes ») — la ferme ronde de Cache-Cache, vue
   d'en haut, l'enclos au fond (le doigt reste sous le troupeau et ne le
   cache pas). Le doigt posé sur l'herbe appelle le chien ; les moutons le
   fuient en restant groupés ; une tape : le chien aboie. Trois troupeaux
   dans la journée (le matin, le midi, le soir : la lumière suit le soleil
   de la barre) ; à la nuit tombée, c'est fini. Le troupeau, ses peurs,
   l'enclos et le renard : `core/herd.ts` (logique pure, testée, qui sert
   aussi de pilote au bot et à la main).
   - la fleur : 4, 5 puis 6 moutons, une large ouverture ;
   - l'éclair : 5, 7, 9, la mare et des bottes au milieu, la chèvre têtue
     (elle ne fuit qu'à l'aboiement) ;
   - la flamme : 7, 9, 12, une ouverture étroite, et le renard qui sort du
     bord et éparpille le troupeau tant que le chien ne l'a pas chassé.
   Plus elle a été rapide, plus le troupeau suivant broute dispersé.
   Étoiles : tout le monde rentré avec un quart du jour d'avance (3), tout
   le monde rentré (2), la nuit tombée avant (1). À deux : deux chiens, un
   par doigt, en équipe. */

type Phase = 'play' | 'cheer' | 'fade' | 'night' | 'win' | 'demo'

interface Beast { c: Critter; pop: number; hop: number; jump: number }
interface State {
  stage: Stage
  T: T3
  farm: Farm
  kit: CritterKit
  lvl: LevelDef
  level: Level
  h: Herd
  beasts: Beast[]
  dogs: { c: Critter; hop: number; jump: number; ring: import('three').Mesh; ringA: number }[]
  fox: import('three').Group | null
  /** Les deux battants de la barrière, et son ouverture : 1 ouverte, 0 fermée. */
  leaves: { g: import('three').Group; closed: number; open: number }[]
  gateK: number
  phase: Phase
  phaseT: number
  /** Le troupeau de la journée (0, 1, 2), et le temps qu'il a pris. */
  herdIdx: number
  herdT: number
  /** Le jour : le temps passé, et la lumière (0 matin → 1 soir → 1,3 nuit). */
  dayT: number
  light: number
  penned: number
  fx: Particles
  shake: CamShake
  game: Arcade
  hemi: import('three').HemisphereLight | null
  hemiBase: number
  /** Ce qui ne se répète pas trop vite. */
  bleatIn: number
  cam: { p: import('three').Vector3; t: import('three').Vector3 }
  ray: import('three').Raycaster
  seed: number
}

let me: State | null = null
let ctx: GameContext
/** Les doigts posés : la main ne vient pas montrer le geste à qui le fait déjà. */
let held = 0

/* ---------- La lumière du jour ----------
   Le matin doux, le midi franc, le soir doré, puis la nuit bleue : le
   ciel, la lumière du ciel, le soleil (sa couleur, sa force, sa hauteur :
   les ombres s'allongent) suivent la barre du jour. */
const DAY: { k: number; sky: string; top: string; low: string; hemi: number; sun: string; si: number; az: number; el: number; env: number }[] = [
  { k: 0, sky: '#BFE3F5', top: '#EAF4FF', low: '#6E8F52', hemi: 1.0, sun: '#FFE0B0', si: 2.0, az: -1.0, el: 0.6, env: 0.6 },
  { k: 0.45, sky: '#9ED4F2', top: '#DCEFFF', low: '#5E8A44', hemi: 1.0, sun: '#FFF0D2', si: 2.3, az: -0.1, el: 1.1, env: 0.6 },
  { k: 0.78, sky: '#F3C48E', top: '#FFE0BA', low: '#6A6A4A', hemi: 0.85, sun: '#FFB868', si: 2.5, az: 0.85, el: 0.5, env: 0.5 },
  { k: 1.0, sky: '#E9906C', top: '#FFB98A', low: '#3E3E5E', hemi: 0.6, sun: '#FF8E48', si: 2.2, az: 1.2, el: 0.24, env: 0.35 },
  { k: 1.3, sky: '#18224A', top: '#5A6AAA', low: '#1A1E2A', hemi: 0.5, sun: '#9EB0FF', si: 0.45, az: 1.5, el: 0.9, env: 0.12 }
]
function setLight(s: State, k: number) {
  const T = s.T
  let i = 0
  while (i < DAY.length - 2 && k > DAY[i + 1].k) i++
  const a = DAY[i], b = DAY[i + 1]
  const u = Math.max(0, Math.min(1, (k - a.k) / (b.k - a.k)))
  const col = (x: string, y: string) => new T.Color(x).lerp(new T.Color(y), u)
  const L = (x: number, y: number) => x + (y - x) * u
  const sc = s.stage.scene
  ;(sc.background as import('three').Color).copy(col(a.sky, b.sky))
  sc.environmentIntensity = L(a.env, b.env)
  if (s.hemi) {
    s.hemi.color.copy(col(a.top, b.top))
    s.hemi.groundColor.copy(col(a.low, b.low))
    s.hemi.intensity = s.hemiBase * L(a.hemi, b.hemi)
  }
  const sun = s.stage.sun
  if (sun) {
    sun.color.copy(col(a.sun, b.sun))
    sun.intensity = L(a.si, b.si)
    const az = L(a.az, b.az), el = L(a.el, b.el), R = 16
    sun.position.set(Math.sin(az) * Math.cos(el) * R, Math.sin(el) * R, Math.cos(az) * Math.cos(el) * R)
  }
}

/* ---------- La scène ---------- */

/** L'enclos : la paille, les piquets, deux lisses, et la barrière (un battant à croisillon) sur le piquet du bord de l'ouverture. */
function buildPen(s: State) {
  const T = s.T, p = s.h.o.pen, R = s.farm.root
  const wood = s.stage.keep(new T.MeshStandardMaterial({ color: 0x8A5A34, roughness: 0.8 }))
  const dark = s.stage.keep(new T.MeshStandardMaterial({ color: 0x5A3A22, roughness: 0.85 }))
  const straw = new T.Mesh(s.stage.keep(new T.CircleGeometry(p.r - 0.05, 40)), s.stage.keep(new T.MeshStandardMaterial({ color: 0xE6C46A, roughness: 1 })))
  straw.rotation.x = -Math.PI / 2; straw.position.set(p.x, 0.012, p.z); straw.receiveShadow = true
  R.add(straw)
  const post = s.stage.keep(new T.BoxGeometry(0.09, 0.62, 0.09))
  const n = 18, posts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = p.dir + p.gap / 2 + i / (n - 1) * (Math.PI * 2 - p.gap)
    posts.push([p.x + Math.sin(a) * p.r, p.z + Math.cos(a) * p.r])
  }
  for (const [x, z] of posts) { const m = new T.Mesh(post, dark); m.position.set(x, 0.31, z); m.castShadow = true; R.add(m) }
  for (let i = 1; i < posts.length; i++) {
    const [ax, az] = posts[i - 1], [bx, bz] = posts[i]
    for (const y of [0.26, 0.5]) {
      const m = new T.Mesh(s.stage.keep(new T.BoxGeometry(Math.hypot(bx - ax, bz - az) + 0.04, 0.06, 0.04)), wood)
      m.position.set((ax + bx) / 2, y, (az + bz) / 2); m.rotation.y = -Math.atan2(bz - az, bx - ax); m.castShadow = true
      R.add(m)
    }
  }
  // La barrière : deux battants peints en clair (on la voit), un sur chaque
  // piquet de l'ouverture ; ouverts, ils se rabattent contre la clôture,
  // dehors, en passant par l'extérieur ; fermés, ils se rejoignent au milieu
  const paint = s.stage.keep(new T.MeshStandardMaterial({ color: 0xF4EADB, roughness: 0.7 }))
  const ends: [number, number, number, number][] = [[...posts[posts.length - 1], ...posts[0]], [...posts[0], ...posts[posts.length - 1]]]
  const hingeA = [p.dir - p.gap / 2, p.dir + p.gap / 2]
  s.leaves = ends.map(([hx, hz, ox, oz], k) => {
    const len = Math.hypot(ox - hx, oz - hz) / 2 - 0.03
    const g = new T.Group()
    for (const y of [0.16, 0.34, 0.52]) { const m = new T.Mesh(s.stage.keep(new T.BoxGeometry(len, 0.07, 0.05)), paint); m.position.set(len / 2, y, 0); m.castShadow = true; g.add(m) }
    const brace = new T.Mesh(s.stage.keep(new T.BoxGeometry(Math.hypot(len, 0.36), 0.06, 0.05)), paint)
    brace.position.set(len / 2, 0.34, 0); brace.rotation.z = Math.atan2(0.36, len); g.add(brace)
    const stile = new T.Mesh(s.stage.keep(new T.BoxGeometry(0.07, 0.6, 0.07)), paint); stile.position.set(len, 0.3, 0); g.add(stile)
    g.position.set(hx, 0, hz)
    R.add(g)
    // rotation.y = θ envoie le battant vers (cos θ, −sin θ)
    const closed = -Math.atan2(oz - hz, ox - hx)
    const a = hingeA[k], away = k === 0 ? -1 : 1
    const dx = Math.cos(a) * away + Math.sin(a) * 0.12, dz = -Math.sin(a) * away + Math.cos(a) * 0.12
    let d = -Math.atan2(dz, dx) - closed
    d = Math.atan2(Math.sin(d), Math.cos(d))
    // Le tour qui passe dehors (pas à travers l'enclos)
    const mid = closed + d / 2
    if (Math.cos(mid) * Math.sin(a) - Math.sin(mid) * Math.cos(a) < 0) d -= Math.sign(d) * Math.PI * 2
    g.rotation.y = closed + d
    return { g, closed, open: closed + d }
  })
}

/** Le renard : le chat de la ferme, roux, aux pattes sombres, et une grande queue touffue au bout blanc. */
function buildFox(s: State) {
  const T = s.T
  const c = s.kit.make('cat', 0.66)
  const red = s.stage.keep(new T.MeshStandardMaterial({ color: 0xC9561C, roughness: 0.75 }))
  const darkM = s.stage.keep(new T.MeshStandardMaterial({ color: 0x2E1C14, roughness: 0.8 }))
  const white = s.stage.keep(new T.MeshStandardMaterial({ color: 0xF4EEE6, roughness: 0.6 }))
  c.obj.updateMatrixWorld(true)
  c.obj.traverse(o => {
    const m = o as import('three').Mesh
    if (!m.isMesh) return
    const mm = m.material as import('three').MeshStandardMaterial
    const col = mm.color?.getHex?.()
    if (col === 0xAE5E24 || col === 0x6E3510) m.material = m.position.y < 0.12 ? darkM : red
    // La petite queue enroulée du chat s'en va : le renard a la sienne
    if (m.geometry.type === 'SphereGeometry' && col === 0xAE5E24 && m.position.y < 0.14 && m.position.z < -0.1) m.visible = false
  })
  const sph = s.stage.keep(new T.SphereGeometry(1, 14, 10))
  const tail: [number, number, number, number, boolean][] = [[0, 0.2, -0.3, 0.07, false], [0, 0.24, -0.42, 0.095, false], [0, 0.27, -0.56, 0.11, false], [0, 0.29, -0.7, 0.1, false], [0, 0.3, -0.82, 0.075, true]]
  for (const [x, y, z, r, tip] of tail) {
    const m = new T.Mesh(sph, tip ? white : red)
    m.position.set(x, y, z); m.scale.set(r, r * 0.9, r * 1.25); m.castShadow = true
    c.obj.add(m)
  }
  c.obj.visible = false
  s.farm.root.add(c.obj)
  return c.obj
}

function addBeasts(s: State) {
  for (const b of s.beasts) s.farm.root.remove(b.c.obj)
  s.beasts = s.h.sheep.map(a => {
    const c = s.kit.make(a.kind === 'goat' ? 'goat' : 'sheep', 0.72)
    c.obj.position.set(a.x, 0, a.z)
    c.obj.rotation.y = a.ry
    c.obj.scale.setScalar(0.001)
    s.farm.root.add(c.obj)
    return { c, pop: 0, hop: Math.random() * 6, jump: 0 }
  })
}

/** Un troupeau de la journée : n bêtes, en petits groupes (plus dispersé si le précédent est vite rentré). */
function newHerd(s: State, idx: number, spread: number) {
  s.h.sheep = []
  const n = s.lvl.herds[idx]
  const goat = s.lvl.goat && (s.level === 'exp' ? idx > 0 : idx === 2)
  spawn(s.h, n, { clusters: s.lvl.clusters[idx] + spread, goat })
  s.h.dogs.forEach((d, i) => {
    const x = (i - (s.h.dogs.length - 1) / 2) * 1.6, z = s.h.o.edge - 1.2
    d.x = x; d.z = z; d.vx = d.vz = 0; d.tx = x; d.tz = z; d.aim = null; d.side = 0
  })
  if (s.h.fox) { s.h.fox.state = 'away'; s.h.fox.next = s.h.t + 12 }
  addBeasts(s)
  s.herdIdx = idx
  s.herdT = 0
  paintHud(s)
}

/* ---------- Le HUD : les bêtes du troupeau, et le soleil sur la barre du jour ---------- */

let pics: Record<string, string> = {}
function paintHud(s: State) {
  const row = ctx.root.querySelector<HTMLElement>('#sdHerd')
  if (!row) return
  // Le même troupeau : on n'allume que les nouvelles (leur icône saute, pas les autres)
  if (row.children.length === s.h.sheep.length && row.dataset.herd === String(s.herdIdx)) {
    s.h.sheep.forEach((a, i) => row.children[i].classList.toggle('in', a.penned))
    return
  }
  row.dataset.herd = String(s.herdIdx)
  row.innerHTML = s.h.sheep.map(a => {
    const src = pics[a.kind === 'goat' ? 'goat' : 'sheep']
    return src ? `<img src="${src}" alt="" draggable="false" class="${a.penned ? 'in' : ''}">` : `<i class="${a.penned ? 'in' : ''}"></i>`
  }).join('')
}
function paintSun(s: State) {
  const sun = ctx.root.querySelector<HTMLElement>('#sdSun')
  if (sun) sun.style.left = (Math.min(1, s.dayT / s.lvl.day) * 100).toFixed(1) + '%'
}

/* ---------- Chaque image ---------- */

function frame(s: State, dt: number) {
  s.phaseT += dt
  s.bleatIn = Math.max(0, s.bleatIn - dt)
  if (s.phase === 'play') {
    s.dayT += dt
    s.herdT += dt
    s.light = Math.min(1, s.dayT / s.lvl.day)
    for (const e of stepHerd(s.h, dt)) {
      if (e.k === 'pen') {
        s.penned++
        s.beasts[e.i].jump = 0.5
        s.game.hit(1)
        if (s.bleatIn <= 0) { cry(s.h.sheep[e.i].kind === 'goat' ? 'chevre' : 'mouton', { vol: 0.55, max: 1, rate: 1.05 + Math.random() * 0.2 }); s.bleatIn = 0.5 }
        paintHud(s)
      } else if (e.k === 'near') {
        // Presque : il a filé juste à côté de l'ouverture
        s.game.miss()
        s.shake.hit(0.35)
        cry('mouton', { vol: 0.7, max: 1, rate: 1.25 })
        s.bleatIn = 0.8
      } else if (e.k === 'flee') {
        if (s.bleatIn <= 0 && Math.random() < 0.5) { cry(s.h.sheep[e.i].kind === 'goat' ? 'chevre' : 'mouton', { vol: 0.35, max: 0.9, rate: 0.9 + Math.random() * 0.3 }); s.bleatIn = 0.7 }
      } else if (e.k === 'fox') {
        sfx(e.on ? 'whoosh' : 'pluck', { vol: 0.5, rate: e.on ? 0.7 : 1.4 })
        if (e.on) { s.shake.hit(0.2); handNow() }
      }
    }
    paintSun(s)
    if (!outside(s.h).length) cheer(s)
    else if (s.dayT >= s.lvl.day) nightfall(s)
  } else if (s.phase === 'cheer') {
    stepHerd(s.h, dt)
    s.gateK = Math.max(0, s.gateK - dt / 0.6)
    if (s.phaseT > 1.8) {
      if (s.herdIdx < 2) startFade(s)
      else win(s)
    }
  } else if (s.phase === 'fade') {
    const fade = ctx.root.querySelector<HTMLElement>('#sdFade')
    if (s.phaseT > 0.55 && fade?.classList.contains('on')) {
      // Dans le blanc : le troupeau suivant broute déjà, la barrière se rouvre
      const fast = s.herdT < s.lvl.herds[s.herdIdx] * 7
      newHerd(s, s.herdIdx + 1, fast ? 1 : 0)
      s.gateK = 1
      fade.classList.remove('on')
    }
    if (s.phaseT > 1.1) { s.phase = 'play'; s.phaseT = 0; handNow() }
  } else if (s.phase === 'night') {
    s.light = Math.min(1.3, 1 + s.phaseT / 2.5 * 0.3)
    stepHerd(s.h, dt * 0.3)
  } else if (s.phase === 'win') {
    // Le soir doré : la journée se termine, la caméra s'approche de l'enclos
    s.light = Math.min(Math.max(s.light, 0.9), s.light + dt * 0.08)
    s.gateK = Math.max(0, s.gateK - dt / 0.6)
    stepHerd(s.h, dt)
  }
  if (s.phase === 'play' || s.phase === 'night' || s.phase === 'win' || s.phase === 'cheer' || s.phase === 'fade') setLight(s, s.light)
  drawHerd(s, dt)
  // La caméra (posée chaque image : la secousse s'y ajoute)
  const cam = s.stage.camera
  // (en temps de jeu ralenti ×0,6 : 1,3 s ≈ 2,2 s vraies, avant l'écran de fin)
  const k = s.phase === 'win' ? Math.min(1, s.phaseT / 1.3) : 0
  const e = k * k * (3 - 2 * k), p = s.h.o.pen
  cam.position.set(s.cam.p.x + (p.x * 0.55 - s.cam.p.x) * e * 0.5, s.cam.p.y - 3.2 * e, s.cam.p.z + (p.z + 6 - s.cam.p.z) * e * 0.55)
  cam.lookAt(s.cam.t.x + (p.x - s.cam.t.x) * e * 0.7, 0, s.cam.t.z + (p.z - s.cam.t.z) * e * 0.7)
  s.shake.apply(dt)
  s.fx.update(dt)
}

/** Les bêtes, les chiens, le renard, la barrière : là où le troupeau les a mis. */
function drawHerd(s: State, dt: number) {
  s.h.sheep.forEach((a, i) => {
    const b = s.beasts[i]
    if (!b) return
    const o = b.c.obj
    if (b.pop < 1) { b.pop = Math.min(1, b.pop + dt * 2.5); const g = b.pop; o.scale.setScalar(Math.max(0.001, g < 0.7 ? g / 0.7 * 1.12 : 1.12 - (g - 0.7) / 0.3 * 0.12)) }
    const v = Math.hypot(a.vx, a.vz)
    b.hop += dt * (5 + v * 7)
    const jump = b.jump > 0 ? Math.sin((1 - b.jump / 0.5) * Math.PI) * 0.4 : 0
    if (b.jump > 0) b.jump = Math.max(0, b.jump - dt)
    o.position.set(a.x, Math.abs(Math.sin(b.hop)) * 0.06 * Math.min(1, v / 0.4) + jump, a.z)
    o.rotation.y = a.ry
    s.kit.blink(b.c, dt)
  })
  s.h.dogs.forEach((d, i) => {
    const g = s.dogs[i]
    if (!g) return
    const v = Math.hypot(d.vx, d.vz)
    g.hop += dt * (6 + v * 4)
    const jump = g.jump > 0 ? Math.sin((1 - g.jump / 0.35) * Math.PI) * 0.3 : 0
    if (g.jump > 0) g.jump = Math.max(0, g.jump - dt)
    const lie = s.phase === 'night' ? Math.min(1, s.phaseT / 1.2) : 0
    g.c.obj.position.set(d.x, Math.abs(Math.sin(g.hop)) * 0.07 * Math.min(1, v / 1.2) + jump - lie * 0.12, d.z)
    g.c.obj.rotation.y = d.ry
    s.kit.blink(g.c, dt)
    // Le rond sous le doigt (là où il court)
    g.ring.position.set(d.tx, 0.03, d.tz)
    g.ringA = Math.max(0, g.ringA - dt * 1.5)
    ;(g.ring.material as import('three').MeshBasicMaterial).opacity = Math.min(0.8, g.ringA)
    g.ring.visible = g.ringA > 0.01
  })
  if (s.fox && s.h.fox) {
    const f = s.h.fox
    s.fox.visible = f.state !== 'away'
    s.fox.position.set(f.x, Math.abs(Math.sin(s.phaseT * 14)) * 0.06, f.z)
    s.fox.rotation.y = f.ry
  }
  for (const l of s.leaves) l.g.rotation.y = l.closed + (l.open - l.closed) * s.gateK
}

/* ---------- Les moments ---------- */

function cheer(s: State) {
  s.phase = 'cheer'; s.phaseT = 0
  sfx('confirm', { vol: 0.7 })
  s.game.flash(ICON.star.replace('<svg', '<svg width="96" height="96"'), 'gold')
  s.beasts.forEach((b, i) => { b.jump = 0.5; b.hop = i })
  const p = s.h.o.pen
  s.fx.burst(new s.T.Vector3(p.x, 0.6, p.z), { count: 40, color: ['#FFD34D', '#FFFFFF', '#FF9E7A'], speed: 2.2, spread: 1.6, life: 1.2, size: 0.09, gravity: 2 })
  ctx.after(250, () => { if (me === s) cry('mouton', { vol: 0.6, max: 1.1 }) })
}

function startFade(s: State) {
  s.phase = 'fade'; s.phaseT = 0
  ctx.root.querySelector('#sdFade')?.classList.add('on')
}

/** Les trois troupeaux sont rentrés : le soir doré tombe sur l'enclos. */
function win(s: State) {
  s.phase = 'win'; s.phaseT = 0
  s.stage.timeScale = 0.6
  const left = 1 - s.dayT / s.lvl.day
  s.game.end({
    title: 'Tout le troupeau est rentré !',
    msg: left >= 0.25 ? 'Et bien avant la nuit' : 'Juste avant la nuit',
    outroMs: 2800, score: s.penned
  })
}

/** La nuit tombe avant : le chien se couche, c'est fini pour aujourd'hui. */
function nightfall(s: State) {
  s.phase = 'night'; s.phaseT = 0
  s.h.dogs.forEach(d => { d.tx = d.x; d.tz = d.z })
  sfx('whoosh', { vol: 0.4, rate: 0.6 })
  s.game.end({ title: 'La nuit est tombée', msg: s.penned > 1 ? `${s.penned} bêtes à l'abri` : 'Demain, le troupeau rentrera', outroMs: 2800, score: s.penned })
}

/** Les étoiles : tout rentré avec un quart du jour d'avance, tout rentré, ou la nuit avant. */
function stars(): 1 | 2 | 3 {
  const s = me
  if (!s || s.phase === 'night' || outside(s.h).length) return 1
  return 1 - s.dayT / s.lvl.day >= 0.25 ? 3 : 2
}

/* ---------- Le jeu ---------- */

/** Un point du plateau à l'écran. */
const scr = (s: State, x: number, z: number, y = 0.3) => toScreen(s.stage, { x, y, z })

export const sheepdog: GameDef = {
  id: 'sheepdog', name: 'Le Chien de berger', icon: '🐕', sq: 'sq-mint', cat: 'action', music: 'meadow', duo: true,
  subtitle: 'Guide le chien et rentre les moutons avant la nuit',
  // La main : un doigt qui passe derrière le troupeau (ou le traînard) et le
  // pousse vers l'enclos — le chemin du pilote ; la chèvre têtue : une tape
  hand: () => {
    const s = me
    if (!s || s.phase !== 'play' || held > 0) return null
    const d = s.h.dogs[0]
    const goat = outside(s.h).find(a => a.kind === 'goat' && a.fear < 0.05 && Math.hypot(a.x - d.x, a.z - d.z) < TUNE.bark * 0.8)
    if (goat) return { tap: scr(s, d.x, d.z) }
    const p = pilot(s.h, 0)
    if (Math.hypot(p.x - d.x, p.z - d.z) < 0.8) return null
    return { drag: [scr(s, d.x, d.z), scr(s, p.x, p.z)] }
  },
  mount(c) {
    ctx = c
    let dead = false
    held = 0
    const level: Level = c.tier
    const lvl = LEVELS[level]
    c.root.innerHTML = `
      <div class="arena g3-arena sd-wrap" id="sdWrap">
        <div class="sd-hud"><div class="sd-herd" id="sdHerd"></div><div class="sd-day"><i class="sd-sun" id="sdSun"></i></div></div>
        <div class="sd-fade" id="sdFade"></div>
      </div>`
    const arena = c.root.querySelector<HTMLElement>('#sdWrap')!
    preloadSfx(['confirm', 'pluck', 'whoosh', 'select'])
    preloadCries(['mouton', 'chien', 'chevre'])
    const hideLoader = loader(arena, 'sheepdog')
    const bot = !!(window as unknown as { __BOT?: boolean }).__BOT

    ;(async () => {
      const [urls, stage] = await Promise.all([
        critterPortraits(['sheep', 'goat'], 72).catch(() => ({} as Record<string, string>)),
        createStage(arena, {
          sky: DAY[0].sky, fov: 38, cam: [0, 11.2, 12.2], target: [0, 0, 0.5],
          hemi: [DAY[0].top, DAY[0].low, 1.0], sun: { pos: [6.5, 14, 7], color: DAY[0].sun, intensity: 2.0, area: 10, far: 45 },
          fill: 0.4, exposure: 1.0
        })
      ])
      if (dead) { stage.dispose(); return }
      pics = urls
      const T = stage.T
      const farm = await buildFarm(stage, { night: false, empty: true })
      if (dead || !stage.alive) { stage.dispose(); return }
      farm.root.rotation.y = 0
      // Un pré à moutons : pas de cour en terre battue (le chien brun s'y perdait)
      for (const o of farm.root.children) {
        const m = o as import('three').Mesh
        if (m.isMesh && m.userData.noOcc && m.geometry.type === 'CircleGeometry') m.visible = false
      }
      // Vue d'en haut, on ne voit du ciel que le fond autour du plateau : une couleur, qui suit le jour
      stage.scene.background = new T.Color(DAY[0].sky)
      // Les obstacles du niveau (les rayons du troupeau sont ceux de ces pièces)
      for (const pc of lvl.pieces) {
        const p = farm.make(pc.id)
        p.g.position.set(pc.x, 0, pc.z); p.g.rotation.y = pc.ry
        farm.root.add(p.g)
      }
      const seed = bot ? 7 : (Math.random() * 1e9) | 0
      const h = makeHerd(herdOpts(level, seed))
      addDogs(h, c.duo ? 2 : 1)
      if (lvl.fox) addFox(h, 14)
      const kit = critterKit(T)
      let hemi: import('three').HemisphereLight | null = null
      stage.scene.traverse(o => { if ((o as import('three').HemisphereLight).isHemisphereLight) hemi = o as import('three').HemisphereLight })
      const sheepIcon = urls.sheep ? `<img src="${urls.sheep}" alt="" style="width:1.4em;height:1.4em">` : ICON.star
      const s: State = {
        stage, T, farm, kit, lvl, level, h, beasts: [], dogs: [], fox: null,
        leaves: [], gateK: 1,
        phase: 'play', phaseT: 0, herdIdx: 0, herdT: 0, dayT: 0, light: 0, penned: 0,
        fx: particles(stage, 300), shake: camShake(stage),
        game: arcade(c, { host: arena, plainScore: true, scoreIcon: sheepIcon, stars }),
        hemi, hemiBase: hemi ? (hemi as import('three').HemisphereLight).intensity : 1,
        bleatIn: 0,
        cam: { p: new T.Vector3(0, 11.2, 12.2), t: new T.Vector3(0, 0, 0.5) },
        ray: new T.Raycaster(), seed
      }
      buildPen(s)
      if (lvl.fox) s.fox = buildFox(s)
      const ringGeo = stage.keep(new T.RingGeometry(0.28, 0.38, 40))
      s.dogs = h.dogs.map(() => {
        const g = kit.make('dog', 0.85)
        farm.root.add(g.obj)
        const ring = new T.Mesh(ringGeo, stage.keep(new T.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0, depthWrite: false })))
        ring.rotation.x = -Math.PI / 2
        ring.visible = false
        farm.root.add(ring)
        return { c: g, hop: 0, jump: 0, ring, ringA: 0 }
      })
      newHerd(s, 0, 0)
      setLight(s, 0)
      hideLoader()
      me = s
      stage.start(dt => { if (me === s) frame(s, dt) })
    })().catch(e => { console.error('Chien de berger :', e); hideLoader(); c.toast('La 3D n\'est pas disponible ici') })

    /* Le doigt : par pointerId (à deux, un chien par doigt) ; glissé écouté sur window */
    const fingers = new Map<number, { dog: number; x: number; y: number; t0: number; moved: number }>()
    const ground = (s: State, cx: number, cy: number) => {
      const r = s.stage.renderer.domElement.getBoundingClientRect()
      s.ray.setFromCamera(new s.T.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), s.stage.camera)
      const hit = s.ray.ray.intersectPlane(new s.T.Plane(new s.T.Vector3(0, 1, 0), 0), new s.T.Vector3())
      if (!hit) return null
      // Sur le plateau (le chien n'en sort pas)
      const d = Math.hypot(hit.x, hit.z), lim = s.h.o.edge + 0.3
      return d > lim ? { x: hit.x * lim / d, z: hit.z * lim / d } : { x: hit.x, z: hit.z }
    }
    const aim = (s: State, dog: number, g: { x: number; z: number }) => {
      const d = s.h.dogs[dog]
      d.tx = g.x; d.tz = g.z
      s.dogs[dog].ringA = 1
    }
    const onDown = (e: PointerEvent) => {
      const s = me
      if (!s || e.target !== s.stage.renderer.domElement || s.phase !== 'play') return
      const g = ground(s, e.clientX, e.clientY)
      if (!g) return
      // À deux : le chien libre le plus proche du doigt ; seule : le sien
      let dog = 0
      if (s.h.dogs.length > 1) {
        const used = new Set([...fingers.values()].map(f => f.dog))
        const free = s.h.dogs.map((d, i) => ({ i, d: Math.hypot(d.x - g.x, d.z - g.z) })).filter(o => !used.has(o.i)).sort((a, b) => a.d - b.d)
        dog = free.length ? free[0].i : 0
      }
      fingers.set(e.pointerId, { dog, x: e.clientX, y: e.clientY, t0: performance.now(), moved: 0 })
      held = fingers.size
      aim(s, dog, g)
    }
    const onMove = (e: PointerEvent) => {
      const s = me
      const f = fingers.get(e.pointerId)
      if (!s || !f || s.phase !== 'play') return
      f.moved += Math.abs(e.clientX - f.x) + Math.abs(e.clientY - f.y)
      f.x = e.clientX; f.y = e.clientY
      const g = ground(s, e.clientX, e.clientY)
      if (g) aim(s, f.dog, g)
    }
    const onUp = (e: PointerEvent) => {
      const s = me
      const f = fingers.get(e.pointerId)
      fingers.delete(e.pointerId)
      held = fingers.size
      if (!s || !f || e.type === 'pointercancel' || s.phase !== 'play') return
      // Une tape : il aboie (tout ce qui est à portée détale, la chèvre aussi)
      if (f.moved < 14 && performance.now() - f.t0 < 300) {
        bark(s.h, f.dog)
        const d = s.h.dogs[f.dog]
        s.dogs[f.dog].jump = 0.35
        if (!cry('chien', { vol: 0.8, max: 0.9 })) sfx('pluck', { vol: 0.6, rate: 0.6 })
        s.fx.burst(new s.T.Vector3(d.x, 0.5, d.z), { count: 14, color: ['#FFFFFF', '#FFE9B0'], speed: 1.6, spread: 0.6, life: 0.5, size: 0.07, gravity: 0 })
      }
    }
    c.root.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __sd: unknown }).__sd = {
        get ready() { return !!me },
        get phase() { return me?.phase },
        get herd() { return me?.herdIdx ?? -1 },
        get out() { return me ? outside(me.h).length : -1 },
        get penned() { return me?.penned ?? 0 },
        get dayLeft() { return me ? 1 - me.dayT / me.lvl.day : 0 },
        /** Où est le chien, où le pilote l'enverrait (à l'écran) ; la chèvre têtue à portée. */
        get dog() { const s = me; return s ? scr(s, s.h.dogs[0].x, s.h.dogs[0].z, 0) : null },
        get target() { const s = me; if (!s) return null; const p = pilot(s.h, 0); return scr(s, p.x, p.z, 0) },
        get goat() { const s = me; if (!s) return false; const d = s.h.dogs[0]; return outside(s.h).some(a => a.kind === 'goat' && a.fear < 0.05 && Math.hypot(a.x - d.x, a.z - d.z) < TUNE.bark * 0.8) },
        /** Le temps du jeu accéléré (la 3D logicielle des bots : quelques images par seconde). */
        speed(k: number) { if (me) me.stage.timeScale = k },
        /** L'affiche : le troupeau qui entre dans l'enclos, le chien derrière, trois déjà rentrés, un traînard. */
        demo() {
          const s = me
          if (!s) return
          s.phase = 'demo'
          const p = s.h.o.pen
          // Devant l'ouverture, sur l'herbe libre de tous les niveaux
          const gx = p.x + Math.sin(p.dir) * (p.r + 0.25), gz = p.z + Math.cos(p.dir) * (p.r + 0.25)
          const ux = Math.sin(p.dir), uz = Math.cos(p.dir)
          const flock = [[0, 0.1], [0.45, 0.55], [-0.45, 0.6], [0.05, 1.05], [0.6, 1.3], [-0.5, 1.45], [0.1, 1.95]].map(([side, back]) => [gx + ux * back + uz * side, gz + uz * back - ux * side])
          const home = [[0.2, -0.4], [-0.5, -0.2], [0.5, 0.3]]
          s.h.sheep = []
          spawn(s.h, 11, { clusters: 1 })
          s.h.sheep.forEach((a, i) => {
            if (i < 3) { a.penned = true; a.x = p.x + home[i][0]; a.z = p.z + home[i][1]; a.ry = i * 2.1 }
            else if (i < 10) { const [x, z] = flock[i - 3]; a.x = x; a.z = z; a.ry = Math.atan2(gx - x, gz - z) + (i % 3 - 1) * 0.35 }
            else { a.x = 5.2; a.z = 3.6; a.ry = 0.4 }
          })
          addBeasts(s)
          s.beasts.forEach(b => { b.pop = 1; b.c.obj.scale.setScalar(1) })
          const d = s.h.dogs[0]
          d.x = gx + ux * 2.9 + uz * 0.9; d.z = gz + uz * 2.9 - ux * 0.9; d.tx = d.x; d.tz = d.z; d.ry = Math.atan2(gx - d.x, gz - d.z)
          s.dayT = s.lvl.day * 0.35
          setLight(s, 0.35)
          paintHud(s); paintSun(s)
        }
      }
    }

    return () => {
      if (dead) return
      dead = true
      c.root.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      const s = me
      me = null
      if (s) {
        s.game.dispose()
        s.kit.dispose()
        try { s.stage.dispose() } catch { /* déjà démonté */ }
      }
      hideLoader()
    }
  }
}
