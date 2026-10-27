import type { GameDef, GameContext } from '../core/types'
import { createStage, loader, type Stage, type T3 } from '../core/three3d'
import { particles, toScreen, type Particles } from '../core/scene3d'
import { aqDeco, buildTank, flakeMesh, sandY, TANK, type Tank } from '../core/aquarium3d'
import { buildPlush, plushParts, type Plush } from '../core/plush3d'
import { DECOS, headSide, lighten, MAX_DECO, MAX_FISH, packTank, readTank, swimStep, SWIM, type Deco, type DecoKind, type Fish, type Swimmer } from '../core/fishtank'
import { createSheet, plushStrokes, renderStrokes, type DrawStroke, type Sheet } from './farmdraw'
import { sfx, preloadSfx } from '../core/sfx'
import { tone } from '../core/audio'
import { visible, handNow, type HandMove } from '../core/hand'

/* 🐠 L'AQUARIUM (27/10, choisi par le père avec la Poterie et le Château de
   sable) — le petit frère de « Mon dessin prend vie » (la Ferme à
   construire) : là-bas, un animal dessiné devient une peluche qui vit sur
   la ferme ; ici, un poisson dessiné nage dans un aquarium.
   - L'aquarium vu de face : le verre et ses reflets, le sable et ses dunes,
     la lumière qui danse au fond, les rayons, les bulles du diffuseur
     (`core/aquarium3d.ts`).
   - Le décor, depuis le tiroir du bas : algues qui ondulent, rochers,
     château englouti, coffre au trésor (il s'ouvre et lâche ses bulles),
     coquillage, corail. On touche le sable pour le poser, on le touche
     dessus pour le reprendre.
   - « Dessiner » ouvre la feuille de la Ferme (`farmdraw.ts`) ; « Fini » :
     le dessin devient une peluche (`plush3d.ts`) qui se gonfle, puis nage.
     Elle ondule (la queue plus que la tête), fait demi-tour en se
     retournant (de profil, puis son dos : son dessin en miroir, comme sur
     la ferme), vient quand on tapote la vitre ; une pincée de flocons et
     les poissons montent manger. De quel côté est sa tête ? Celui de l'œil
     (`headSide` de `core/fishtank.ts`).
   - SANS CLAUDE : contrairement à la Ferme, aucun appel au Worker (un
     poisson nage, pas besoin de deviner son allure) — rien ne quitte la
     tablette. Six poissons au plus, gardés (leurs traits allégés) ; un
     septième, et le plus ancien remonte s'en aller.
   « Fini » : le soir tombe dans la pièce, l'aquarium reste allumé. Créer :
   aucune note. */

const DECO_NAME: Record<DecoKind, string> = { algue: 'Algues', rocher: 'Rochers', chateau: 'Château', coffre: 'Coffre', coquillage: 'Coquillage', corail: 'Corail' }
const MAX_FLAKES = 48
const FISH_H = 0.3

/* ---------- La sauvegarde : une seule pour la famille, pour l'instant ----------
   Isolée ici (`load` / `save`) : l'orchestrateur la branchera sur les cartes
   Jade / Joyce de `core/mine.ts`. Les traits des poissons (allégés), le décor. */
const KEY = 'ferme:aquarium'
interface Saved { fish: Fish[]; deco: Deco[] }
export function load(): Saved {
  try { return readTank(JSON.parse(localStorage.getItem(KEY) || 'null')) } catch { return { fish: [], deco: [] } }
}
export function save(s: Saved) {
  try { localStorage.setItem(KEY, JSON.stringify(packTank(s.fish, s.deco))) } catch { /* plein : tant pis */ }
}

interface FishView {
  data: Fish
  plush: Plush
  g: import('three').Group
  sw: Swimmer
  yaw: number
  /** Sa nage dans le shader : le temps, l'amplitude, le côté de la tête, la demi-longueur. */
  u: { uT: { value: number }; uAmp: { value: number }; uDir: { value: number }; uHalf: { value: number } }
  birth: number
  /** Il s'en va (le septième est arrivé) : il remonte et s'efface. */
  leaving: number
  wait: number
  /** Un toucher : il fait une pirouette. */
  spin: number
  /** Il a un flocon en vue. */
  food: number
  seed: number
}

interface Flake { x: number; y: number; z: number; ph: number; live: boolean; rest: number }

interface State {
  stage: Stage
  T: T3
  tank: Tank
  saved: Saved
  fish: FishView[]
  decos: { d: Deco; g: import('three').Group; pop: number; open: number; fall: number; from: number }[]
  pick: DecoKind | null
  flakes: Flake[]
  flakeMesh: import('three').InstancedMesh
  phase: 'make' | 'outro' | 'done'
  outro: number
  fx: Particles
  ray: import('three').Raycaster
  t: number
  uT: { value: number }
  dirty: number
  /** Les poissons gardés qui restent à fabriquer (un par image : l'ouverture ne bloque pas). */
  pending: Fish[]
}

let me: State | null = null
let ctx: GameContext

const CAM = { p: [0, 0.78, 2.8] as [number, number, number], t: [0, 0.68, 0] as [number, number, number] }

/* ---------- Les poissons ---------- */

/** La nage dans le shader : le corps ondule de côté, la queue plus que la tête. */
function swimShader(m: import('three').Material, u: FishView['u']) {
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u)
    sh.vertexShader = 'uniform float uT; uniform float uAmp; uniform float uDir; uniform float uHalf;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float along = clamp((1.0 - transformed.x * uDir / uHalf) * 0.5, 0.0, 1.0);
      float bend = sin(transformed.x * uDir / uHalf * 3.0 + uT) * uAmp * along * along;
      transformed.z += bend * uHalf;
      transformed.x -= bend * uHalf * 0.15 * uDir;`)
  }
  m.customProgramCacheKey = () => 'poisson-nage'
  m.needsUpdate = true
}

function addFish(s: State, data: Fish, born: boolean, cv?: HTMLCanvasElement): FishView | null {
  const strokes = data.s
  const parts = plushParts(cv ?? renderStrokes(strokes), plushStrokes(strokes))
  if (!parts) return null
  const plush = buildPlush(s.T, parts, FISH_H)
  const g = new s.T.Group()
  plush.obj.position.y = -plush.height / 2
  g.add(plush.obj)
  plush.mesh.geometry.computeBoundingBox()
  const bb = plush.mesh.geometry.boundingBox!
  const u = { uT: { value: Math.random() * 6 }, uAmp: { value: 0.12 }, uDir: { value: data.d }, uHalf: { value: Math.max(0.05, (bb.max.x - bb.min.x) / 2) } }
  swimShader(plush.mesh.material as import('three').Material, u)
  const x = born ? 0 : (Math.random() * 2 - 1) * SWIM.x * 0.8, y = born ? 0.85 : SWIM.y0 + Math.random() * (SWIM.y1 - SWIM.y0)
  const z = born ? 0.15 : (Math.random() * 2 - 1) * 0.2
  g.position.set(x, y, z)
  s.stage.scene.add(g)
  const f: FishView = {
    data, plush, g, yaw: 0, u, birth: born ? 1 : 0, leaving: 0, wait: born ? 1.2 : Math.random() * 2, spin: 0, food: 0, seed: Math.random() * 6,
    sw: { x, y, z, vx: 0, vy: 0, vz: 0, gx: x, gy: y, gz: z, speed: 0.3 + Math.random() * 0.12 }
  }
  s.fish.push(f)
  return f
}

/** Un nouveau but, au hasard dans le bac. */
function wander(f: FishView) {
  const sw = f.sw
  sw.gx = (Math.random() * 2 - 1) * SWIM.x
  sw.gy = SWIM.y0 + Math.random() * (SWIM.y1 - SWIM.y0)
  sw.gz = SWIM.z0 + Math.random() * (SWIM.z1 - SWIM.z0)
  sw.speed = 0.25 + Math.random() * 0.15
}

function stepFish(s: State, f: FishView, dt: number) {
  const sw = f.sw
  // Sa naissance : le dessin, à plat, se gonfle d'un coup (et rebondit)
  let sz = 1
  if (f.birth > 0) {
    f.birth = Math.max(0, f.birth - dt / 0.9)
    const k = 1 - f.birth
    sz = 0.03 + 0.97 * (k >= 1 ? 1 : 1 - Math.pow(2, -9 * k) * Math.cos(k * Math.PI * 3.4))
  }
  if (f.leaving > 0) {
    // Le plus ancien remonte et s'efface vers le haut
    f.leaving += dt
    sw.gx = sw.x; sw.gy = TANK.water + 0.6; sw.gz = sw.z; sw.speed = 0.5
    sw.vy += dt * 0.5; sw.y += sw.vy * dt
    f.g.position.set(sw.x, sw.y, sw.z)
    f.g.scale.setScalar(Math.max(0.01, 1 - (f.leaving - 0.8) / 0.8))
    return f.leaving > 1.6
  }
  // Un flocon en vue : le plus proche
  const near = s.flakes.filter(k => k.live && k.rest === 0).reduce<{ k: Flake | null; d: number }>((b, k) => { const d = Math.hypot(k.x - sw.x, k.y - sw.y, k.z - sw.z); return d < b.d ? { k, d } : b }, { k: null, d: 1.6 })
  if (near.k && f.birth === 0) {
    sw.gx = near.k.x; sw.gy = near.k.y; sw.gz = near.k.z; sw.speed = 0.6
    f.food = 1
    if (near.d < 0.11) {
      near.k.live = false
      sfx('pluck', { vol: 0.35, rate: 1.4 + Math.random() * 0.4 })
      s.tank.bubbles(sw.x, sw.y + 0.05, sw.z, 2)
    }
  } else if (f.food) { f.food = 0; f.wait = 0.3 }
  const there = f.birth > 0 ? false : swimStep(sw, dt)
  if (there && !near.k) {
    f.wait -= dt
    if (f.wait <= 0) { wander(f); f.wait = 0.8 + Math.random() * 2.5 }
  }
  // Son sens : la tête vers où il va ; il se retourne par le profil (son dos : son dessin en miroir)
  const speed = Math.hypot(sw.vx, sw.vy, sw.vz)
  if (Math.abs(sw.vx) > 0.04) {
    const want = (sw.vx > 0 ? 1 : -1) === f.data.d ? 0 : Math.PI
    f.yaw += (want + (want ? -1 : 1) * Math.max(-0.35, Math.min(0.35, sw.vz * 0.8)) - f.yaw) * Math.min(1, dt * 3)
  }
  f.spin = Math.max(0, f.spin - dt)
  f.g.position.set(sw.x, sw.y + Math.sin(s.t * 1.6 + f.seed) * 0.012, sw.z)
  f.g.rotation.set(f.spin > 0 ? (1 - f.spin / 0.9) * Math.PI * 2 : 0, f.yaw, Math.max(-0.3, Math.min(0.3, sw.vy * 0.9)) * (f.yaw > Math.PI / 2 ? -1 : 1) * f.data.d)
  f.g.scale.set(1, 1, sz)
  // L'ondulation : plus vive quand il file
  f.u.uT.value += dt * (4 + speed * 14)
  f.u.uAmp.value += ((0.08 + Math.min(0.25, speed * 0.6)) - f.u.uAmp.value) * Math.min(1, dt * 3)
  return false
}

/* ---------- Les flocons ---------- */

function feed(s: State) {
  const cx = (Math.random() * 2 - 1) * 0.7
  let n = 14
  for (const k of s.flakes) {
    if (n <= 0) break
    if (k.live) continue
    k.live = true; k.rest = 0
    k.x = cx + (Math.random() - 0.5) * 0.35; k.y = TANK.water - 0.02 - Math.random() * 0.04; k.z = (Math.random() - 0.5) * 0.4; k.ph = Math.random() * 6
    n--
  }
  sfx('tick', { vol: 0.4, rate: 1.6 }); sfx('tick', { vol: 0.3, rate: 1.9, delay: 0.08 }); sfx('tick', { vol: 0.25, rate: 2.1, delay: 0.16 })
  // Tout le monde monte à la surface
  for (const f of s.fish) if (f.birth === 0 && !f.leaving) { f.sw.gx = cx; f.sw.gy = SWIM.y1; f.sw.speed = 0.6 }
}
function stepFlakes(s: State, dt: number) {
  const m4 = new s.T.Matrix4(), q = new s.T.Quaternion(), e = new s.T.Euler()
  s.flakes.forEach((k, i) => {
    if (k.live) {
      if (k.rest > 0) { k.rest += dt; if (k.rest > 4) k.live = false }
      else {
        // Ils tombent en tournoyant
        k.y -= dt * 0.11
        k.x += Math.sin(s.t * 2.2 + k.ph) * dt * 0.05
        k.z += Math.cos(s.t * 1.7 + k.ph) * dt * 0.03
        const ground = sandY(k.x, k.z) + 0.006
        if (k.y <= ground) { k.y = ground; k.rest = 0.001 }
      }
    }
    e.set(k.rest > 0 ? -Math.PI / 2 : Math.sin(s.t * 3 + k.ph) * 1.2, k.ph, Math.cos(s.t * 2.5 + k.ph))
    q.setFromEuler(e)
    const sc = k.live ? 0.011 * (k.rest > 3 ? 1 - (k.rest - 3) : 1) : 0
    m4.compose(new s.T.Vector3(k.x, k.live ? k.y : -9, k.z), q, new s.T.Vector3(sc, sc, sc))
    s.flakeMesh.setMatrixAt(i, m4)
  })
  s.flakeMesh.instanceMatrix.needsUpdate = true
}

/* ---------- Le décor ---------- */

/** Pose un décor ; `from` : la hauteur d'où il coule jusqu'au sable (touché en pleine eau). */
function placeDeco(s: State, d: Deco, pop = true, from?: number) {
  const g = aqDeco(s.T, s.stage, d.k, s.uT)
  const y = sandY(d.x, d.z) - 0.01
  g.position.set(d.x, from ?? y, d.z)
  g.rotation.y = d.r
  s.stage.scene.add(g)
  s.decos.push({ d, g, pop: pop && from === undefined ? 0 : 1, open: Math.random() * 4, fall: from !== undefined ? 1 : 0, from: from ?? y })
}
function removeDeco(s: State, i: number) {
  const it = s.decos[i]
  s.decos.splice(i, 1)
  s.saved.deco.splice(s.saved.deco.indexOf(it.d), 1)
  it.g.removeFromParent()
  it.g.traverse(o => { const m = o as import('three').Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as import('three').Material).dispose() } })
  sfx('pluck', { vol: 0.4, rate: 0.8 })
  s.tank.bubbles(it.d.x, sandY(it.d.x, it.d.z) + 0.1, it.d.z, 8)
  s.dirty = 0.6
}

function stepDecos(s: State, dt: number) {
  for (const it of s.decos) {
    if (it.fall > 0) {
      // Il coule doucement en se balançant, et se pose dans un nuage de sable
      it.fall = Math.max(0, it.fall - dt / 1.1)
      const k = 1 - it.fall, y = sandY(it.d.x, it.d.z) - 0.01
      it.g.position.y = it.from + (y - it.from) * (1 - Math.pow(1 - k, 2))
      it.g.rotation.z = Math.sin(k * 9) * 0.12 * it.fall
      if (it.fall === 0) {
        sfx('drop', { vol: 0.45, rate: 0.75 })
        s.fx.burst(it.g.position.clone().setY(y + 0.03), { count: 14, color: ['#F2E2C0', '#E2C99A'], speed: 0.45, spread: 1, life: 0.7, size: 0.035, gravity: 0.5 })
        s.tank.bubbles(it.d.x, y + 0.05, it.d.z, 4)
      }
    }
    if (it.pop < 1) {
      it.pop = Math.min(1, it.pop + dt * 3)
      const k = it.pop, b = k < 0.7 ? k / 0.7 * 1.15 : 1.15 - (k - 0.7) / 0.3 * 0.15
      it.g.scale.setScalar(Math.max(0.01, b))
    }
    // Le coffre : de temps en temps, il s'entrouvre et lâche un chapelet de bulles
    const lid = it.g.userData.lid as import('three').Object3D | undefined
    if (lid) {
      it.open += dt
      const cyc = it.open % 7
      const k = cyc < 4.8 ? 0 : cyc < 5.3 ? (cyc - 4.8) / 0.5 : cyc < 6.4 ? 1 : 1 - (cyc - 6.4) / 0.6
      lid.rotation.x = -k * 0.75
      if (cyc >= 5.2 && cyc - dt < 5.2) { s.tank.bubbles(it.d.x, sandY(it.d.x, it.d.z) + 0.16, it.d.z + 0.02, 14); sfx('pluck', { vol: 0.15, rate: 0.6 }) }
    }
  }
}

/* ---------- Fini : le soir tombe, l'aquarium reste allumé ---------- */

function startOutro(s: State) {
  if (s.phase !== 'make') return
  s.phase = 'outro'
  s.outro = 0
  save(s.saved)
  ctx.root.querySelector('.aq-wrap')?.setAttribute('data-phase', 'outro')
  sfx('confirm', { vol: 0.4 })
  for (const f of s.fish) if (!f.leaving) { f.sw.gx = (Math.random() * 2 - 1) * 0.8; f.sw.gy = 0.9; f.sw.gz = 0.2 }
}
function stepOutro(s: State, dt: number) {
  s.outro += dt
  const t = s.outro, k = Math.min(1, t / 3.5), e = k * k * (3 - 2 * k)
  s.tank.setEvening(e)
  // La brume bleue de l'eau se lève sur la pièce quand on recule
  const fog = s.stage.scene.fog as import('three').Fog | null
  if (fog) { fog.near = 2.6 + 5 * e; fog.far = 7.5 + 12 * e }
  s.stage.camera.position.set(CAM.p[0], CAM.p[1] + 0.15 * e, CAM.p[2] + 1.6 * e)
  s.stage.camera.lookAt(CAM.t[0], CAM.t[1] + 0.05 * e, CAM.t[2])
  if (t > 5.5 && s.phase === 'outro') endGame(s)
}
function endGame(s: State) {
  if (s.phase === 'done') return
  s.phase = 'done'
  ctx.finish({ title: 'Quel bel aquarium !', msg: s.fish.length ? 'Tes poissons nagent' : 'Le décor est prêt', stars: 3 })
}

/* ---------- Chaque image ---------- */

function frame(s: State, dt: number) {
  s.t += dt
  s.uT.value = s.t
  // Les poissons gardés, un par image
  const next = s.pending.shift()
  if (next) { addFish(s, next, false); s.stage.settle() }
  s.tank.step(dt, s.t)
  stepDecos(s, dt)
  for (const f of s.fish.slice()) {
    if (stepFish(s, f, dt)) {
      s.fish.splice(s.fish.indexOf(f), 1)
      f.g.removeFromParent()
      f.plush.dispose()
    }
  }
  stepFlakes(s, dt)
  s.fx.update(dt)
  if (s.phase !== 'make') stepOutro(s, dt)
  if (s.dirty > 0) { s.dirty -= dt; if (s.dirty <= 0) save(s.saved) }
}

/* ---------- La scène ---------- */

async function build(c: GameContext, arena: HTMLElement): Promise<State | null> {
  const stage = await createStage(arena, {
    sky: '#DCE6EE', fov: 40, cam: CAM.p, target: CAM.t, fog: [2.6, 7.5], fogColor: '#2F8DB5',
    hemi: ['#CFF4FF', '#6A8FA8', 1.1], sun: { pos: [0.6, 4.5, 1.6], color: '#F2FBFF', intensity: 2.0, area: 2.2, far: 10 },
    fill: 0.5, exposure: 1.0, iblIntensity: 0.55
  })
  if (!c.alive()) { stage.dispose(); return null }
  const T = stage.T
  const tank = buildTank(T, stage)
  const flakes = flakeMesh(T, MAX_FLAKES)
  stage.scene.add(flakes)
  const saved = load()
  const s: State = {
    stage, T, tank, saved, fish: [], decos: [], pick: null,
    flakes: Array.from({ length: MAX_FLAKES }, () => ({ x: 0, y: -9, z: 0, ph: 0, live: false, rest: 0 })), flakeMesh: flakes,
    phase: 'make', outro: 0, fx: particles(stage, 300), ray: new T.Raycaster(), t: 0, uT: { value: 0 }, dirty: 0, pending: saved.fish.slice()
  }
  for (const d of saved.deco) placeDeco(s, d, false)
  return s
}

/* ---------- Les icônes ---------- */

const svg = (inner: string, sz = 34) => `<svg viewBox="0 0 48 48" width="${sz}" height="${sz}">${inner}</svg>`
const FEED_ICON = svg('<path d="M14 18h20v20a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z" fill="#FFD34D"/><rect x="12" y="13" width="24" height="7" rx="2.5" fill="#E8573C"/><circle cx="20" cy="29" r="2.2" fill="#E8573C"/><circle cx="27" cy="33" r="2" fill="#5EC97B"/><circle cx="26" cy="26" r="1.8" fill="#FF9F43"/><path d="M38 8l2 3M42 13l3 1M36 4v3" stroke="#FF9F43" stroke-width="2.4" stroke-linecap="round"/>')
const FINI_ICON = svg('<circle cx="24" cy="24" r="18" fill="#5EC97B"/><path d="m15 24.5 6 6L33.5 18" fill="none" stroke="#fff" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>')
const DRAW_ICON = svg(`<path d="M7 26c6-9 16-11 24-4l7-6v16l-7-6c-8 7-18 5-24-4z" fill="#FF8FB5"/><circle cx="14" cy="24" r="2" fill="#3A2E25"/><path d="M33 4l9 9-14 14-9 2 2-9z" fill="#FFD43B"/><path d="M33 4l9 9-3 3-9-9z" fill="#E8414F"/><path d="M21 20l8 8-9 2z" fill="#F4D7B0"/>`, 44)
const DECO_ICON: Record<DecoKind, string> = {
  algue: svg('<path d="M14 44c-4-10 4-16 0-26s2-14 2-14c2 6 6 10 2 20s0 14-4 20z" fill="#2FA35A"/><path d="M26 44c-2-8 6-14 3-22s3-12 3-12c1 6 4 9 1 17s-1 12-7 17z" fill="#7CC94F"/><path d="M34 44c0-7 6-9 4-17 3 4 5 8 2 13z" fill="#45B86A"/>', 40),
  rocher: svg('<path d="M6 40c0-10 6-17 14-17 3-6 9-8 14-5 6 2 8 9 8 15v7z" fill="#7D7F86"/><path d="M20 23c3-6 9-8 14-5 3 1 5 4 6 7-6-3-13-3-20-2z" fill="#5E8F4A"/><ellipse cx="14" cy="34" rx="4" ry="2" fill="#9A9CA3"/>', 40),
  chateau: svg('<path d="M18 16h12v26H18z" fill="#B9A9C9"/><path d="M17 16l7-11 7 11z" fill="#E8456B"/><path d="M8 26h8v16H8zM32 26h8v16h-8z" fill="#A897BB"/><path d="M7 26l5-7 5 7zM31 26l5-7 5 7z" fill="#5E7DD6"/><path d="M21 42v-7a3 3 0 0 1 6 0v7z" fill="#1E1838"/><circle cx="24" cy="24" r="2" fill="#2A2350"/>', 40),
  coffre: svg('<rect x="7" y="22" width="34" height="18" rx="2" fill="#8A5A32"/><path d="M7 22c0-8 6-12 17-12s17 4 17 12z" fill="#94643A"/><path d="M12 10.8v29.2M36 10.8v29.2" stroke="#E2B85C" stroke-width="3.4"/><rect x="21" y="20" width="6" height="7" rx="1.4" fill="#E2B85C"/><circle cx="17" cy="9" r="2.4" fill="#FFE98A"/><circle cx="30" cy="7" r="1.8" fill="#FFE98A"/>', 40),
  coquillage: svg('<path d="M24 42 8 22c0-9 7-15 16-15s16 6 16 15z" fill="#F6A5B8"/><path d="M24 42V8M24 42 12 13M24 42l12-29M24 42 9 19M24 42l15-23" stroke="#E07A93" stroke-width="2"/><rect x="18" y="39" width="12" height="5" rx="2" fill="#EE93A9"/>', 40),
  corail: svg('<path d="M23 44V30l-7-8V12M23 30l8-9v-9M31 21l5-4M16 22l-5-5M23 36l-6-5" stroke="#FF7F9E" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="16" cy="11" r="3" fill="#FFC2D1"/><circle cx="31" cy="11" r="3" fill="#FFC2D1"/><circle cx="37" cy="16" r="2.6" fill="#FFC2D1"/><circle cx="10" cy="16" r="2.6" fill="#FFC2D1"/>', 40)
}

/* ---------- Le jeu ---------- */

let sheet: Sheet | null = null

export const aquarium: GameDef = {
  id: 'aquarium', name: 'L’Aquarium', icon: '🐠', sq: 'sq-sky', cat: 'creatif', noTier: true,
  subtitle: 'Dessine un poisson : il nage dans ton aquarium',
  // La main : dessiner un poisson ; sur la feuille, tracer puis « Fini » ; ensuite, le tiroir du décor, les flocons
  hand: (root): HandMove | null => {
    const s = me
    if (sheet?.open) return sheet.hand()
    if (!s || s.phase !== 'make') return null
    if (!s.fish.length && !s.pending.length) return { tap: visible(root, '#aqDraw')[0] }
    if (s.pick) return { tap: toScreen(s.stage, { x: 0.2, y: 0.75, z: 0.1 }) }
    return { choose: [...visible(root, '.aq-opt').slice(0, 3), ...visible(root, '#aqFeed')] }
  },
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="arena g3-arena aq-wrap" id="aqWrap" data-phase="make">
        <div class="aq-tools">
          <span class="tool-item"><button class="sn-tool aq-draw" id="aqDraw" aria-label="Dessiner un poisson">${DRAW_ICON}</button><i class="tool-cap">Dessiner</i></span>
          <span class="tool-item"><button class="sn-tool" id="aqFeed" aria-label="Nourrir">${FEED_ICON}</button><i class="tool-cap">Nourrir</i></span>
          <span class="tool-item"><button class="sn-tool aq-fini" id="aqFini" aria-label="Fini">${FINI_ICON}</button><i class="tool-cap">Fini</i></span>
        </div>
        <div class="aq-pal" id="aqPal">${DECOS.map(k => `<span class="tool-item"><button class="sn-tool aq-opt" data-deco="${k}" aria-label="${DECO_NAME[k]}">${DECO_ICON[k]}</button><i class="tool-cap">${DECO_NAME[k]}</i></span>`).join('')}</div>
        <div class="aq-ripples" id="aqRip"></div>
      </div>`
    const arena = c.root.querySelector<HTMLElement>('#aqWrap')!
    preloadSfx(['pluck', 'tick', 'glass', 'confirm', 'select', 'cloth', 'open', 'close', 'whoosh', 'drop'])
    const showPal = () => {
      const s = me
      c.root.querySelectorAll<HTMLElement>('.aq-opt').forEach(b => b.classList.toggle('sel', !!s && s.pick === b.dataset.deco))
    }

    /* Mon dessin nage : « Fini » sur la feuille, le poisson naît au milieu du bac */
    const born = (strokes: DrawStroke[], cv: HTMLCanvasElement): boolean => {
      const s = me
      if (!s) return false
      const data: Fish = { s: lighten(strokes.map(st => ({ ...st, p: st.p.slice() }))), d: headSide(strokes) }
      // Le septième : le plus ancien remonte s'en aller
      const live = s.fish.filter(f => !f.leaving)
      if (live.length + s.pending.length >= MAX_FISH) {
        if (s.pending.length) s.pending.shift()
        else { live[0].leaving = 0.001; s.saved.fish.splice(s.saved.fish.indexOf(live[0].data), 1) }
      }
      const f = addFish(s, data, true, cv)
      if (!f) return false
      s.saved.fish.push(data)
      still(false)
      s.stage.settle()
      sfx('cloth', { vol: 0.7 })
      c.after(320, () => {
        if (me !== s) return
        s.fx.burst(f.g.position, { count: 26, color: ['#FFFFFF', '#BFEFFF', '#FFD43B'], speed: 1.4, spread: 1.2, life: 0.9, size: 0.06, gravity: -1 })
        s.tank.bubbles(f.g.position.x, f.g.position.y, f.g.position.z, 10)
        sfx('pluck', { vol: 0.7 })
        tone(784, 0.12, 'triangle', 0.07); tone(1175, 0.2, 'triangle', 0.06, 0.1)
      })
      save(s.saved)
      return true
    }
    // La feuille ouverte, l'aquarium ne se redessine plus : sa dernière image reste derrière le voile
    const still = (on: boolean) => { if (me) me.stage.render = on ? () => { /* image figée */ } : undefined }
    sheet = createSheet(arena, { done: born, closed: () => still(false), opened: () => still(true) })

    const hideLoader = loader(arena, 'aquarium')
    build(c, arena).then(s => {
      hideLoader()
      if (!s || dead) { if (s) s.stage.dispose(); return }
      me = s
      s.stage.start(dt => { if (me === s) frame(s, dt) })
    }).catch(e => { hideLoader(); console.error(e); if (!dead) c.toast('La 3D n\'est pas disponible ici') })

    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      const s = me
      if (!s || s.phase !== 'make' || sheet?.open) return
      if (t.closest('#aqDraw')) { sheet?.show(); handNow(); return }
      if (t.closest('#aqFeed')) { feed(s); return }
      if (t.closest('#aqFini')) { startOutro(s); return }
      const o = t.closest<HTMLElement>('.aq-opt')
      if (o?.dataset.deco) {
        s.pick = s.pick === o.dataset.deco ? null : o.dataset.deco as DecoKind
        sfx('select', { vol: 0.4 })
        showPal()
        if (s.pick) handNow()
      }
    }
    c.root.addEventListener('click', onClick)

    /** Toc toc sur la vitre : un rond qui s'élargit, et les poissons viennent voir. */
    const knock = (s: State, cx: number, cy: number) => {
      const r = arena.getBoundingClientRect()
      const rip = document.createElement('i')
      rip.className = 'aq-ripple'
      rip.style.left = `${cx - r.left}px`; rip.style.top = `${cy - r.top}px`
      c.root.querySelector('#aqRip')!.appendChild(rip)
      c.after(900, () => rip.remove())
      sfx('glass', { vol: 0.5, rate: 1.3 }); sfx('glass', { vol: 0.4, rate: 1.5, delay: 0.14 })
      // Le point de la vitre, ramené dans le bac (juste derrière le verre)
      const rc = s.stage.renderer.domElement.getBoundingClientRect()
      s.ray.setFromCamera(new s.T.Vector2((cx - rc.left) / rc.width * 2 - 1, -((cy - rc.top) / rc.height) * 2 + 1), s.stage.camera)
      const p = s.ray.ray.intersectPlane(new s.T.Plane(new s.T.Vector3(0, 0, 1), -SWIM.z1), new s.T.Vector3())
      if (!p) return
      for (const f of s.fish) {
        if (f.birth > 0 || f.leaving) continue
        f.sw.gx = Math.max(-SWIM.x, Math.min(SWIM.x, p.x + (Math.random() - 0.5) * 0.25))
        f.sw.gy = Math.max(SWIM.y0, Math.min(SWIM.y1, p.y + (Math.random() - 0.5) * 0.2))
        f.sw.gz = SWIM.z1
        f.sw.speed = 0.7
        f.wait = 1.5 + Math.random()
      }
    }
    const onDown = (e: PointerEvent) => {
      const s = me
      if (!s || e.target !== s.stage.renderer.domElement) return
      if (s.phase === 'outro') { if (s.outro > 1.5) endGame(s); return }
      if (s.phase !== 'make') return
      const rc = s.stage.renderer.domElement.getBoundingClientRect()
      s.ray.setFromCamera(new s.T.Vector2((e.clientX - rc.left) / rc.width * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1), s.stage.camera)
      // Un poisson touché : une pirouette
      const fh = s.ray.intersectObjects(s.fish.map(f => f.plush.mesh), false)[0]
      if (fh) {
        const f = s.fish.find(x => x.plush.mesh === fh.object)
        if (f && f.spin === 0 && f.birth === 0) { f.spin = 0.9; sfx('pluck', { vol: 0.5, rate: 1.6 }); s.tank.bubbles(f.sw.x, f.sw.y, f.sw.z, 4) }
        return
      }
      if (s.pick) {
        // Le décor : touché, on le reprend ; sur le sable, on pose celui du tiroir
        const dh = s.ray.intersectObjects(s.decos.map(d => d.g), true)[0]
        if (dh) {
          let o: import('three').Object3D | null = dh.object
          while (o && !o.userData.deco) o = o.parent
          const i = s.decos.findIndex(d => d.g === o)
          if (i >= 0) { removeDeco(s, i); return }
        }
        // Sur le sable : il s'y pose ; en pleine eau : il coule jusqu'au fond, sous le doigt
        const sh = s.ray.intersectObject(s.tank.sand, false)[0]
        const p = sh?.point ?? s.ray.ray.intersectPlane(new s.T.Plane(new s.T.Vector3(0, 0, 1), 0.05), new s.T.Vector3())
        if (p && s.decos.length < MAX_DECO && p.y < TANK.water) {
          const d: Deco = { k: s.pick, x: Math.max(-TANK.w / 2 + 0.2, Math.min(TANK.w / 2 - 0.2, p.x)), z: Math.max(TANK.z0 + 0.15, Math.min(TANK.z1 - 0.12, p.z)), r: (Math.random() - 0.5) * 1.2 }
          s.saved.deco.push(d)
          placeDeco(s, d, true, sh ? undefined : Math.max(sandY(d.x, d.z), p.y))
          sfx(sh ? 'drop' : 'whoosh', { vol: 0.5, rate: 0.8 })
          s.tank.bubbles(d.x, sh ? sandY(d.x, d.z) + 0.05 : p.y, d.z, 6)
          s.dirty = 0.6
          return
        }
      }
      knock(s, e.clientX, e.clientY)
    }
    c.root.addEventListener('pointerdown', onDown)

    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __aq: unknown }).__aq = {
        get ready() { return !!me && me.phase === 'make' && !me.pending.length },
        get phase() { return me?.phase },
        get fish() { return me ? me.fish.filter(f => !f.leaving).length : 0 },
        get saved() { return me ? { fish: me.saved.fish.length, deco: me.saved.deco.length } : null },
        get sheet() { return !!sheet?.open },
        get eaten() { return me ? me.flakes.filter(k => !k.live).length : 0 },
        get flakes() { return me ? me.flakes.filter(k => k.live).length : 0 },
        /** Les poissons : où ils sont (à l'écran), où ils regardent (1 : leur dessin, −1 : leur dos). */
        get swim() { const s = me; return s ? s.fish.map(f => ({ ...toScreen(s.stage, f.g.position), x3: f.sw.x, y3: f.sw.y, z3: f.sw.z, face: Math.cos(f.yaw) > 0 ? 1 : -1, d: f.data.d, vx: f.sw.vx })) : [] },
        /** Un point du sable (x, z) à l'écran. */
        sand(x: number, z: number) { return me ? toScreen(me.stage, { x, y: sandY(x, z), z }) : null },
        /** Un point de la vitre (x, y en mètres) à l'écran. */
        glass(x: number, y: number) { return me ? toScreen(me.stage, { x, y, z: TANK.z1 }) : null },
        deco(i: number) { const s = me, it = s?.decos[i]; return s && it ? toScreen(s.stage, it.g.position.clone().setY(it.g.position.y + 0.06)) : null },
        /** Le poisson n° i va vers ce côté du bac (−1 : la gauche, 1 : la droite). */
        go(i: number, side: number) { const f = me?.fish[i]; if (f) { f.sw.gx = side * SWIM.x; f.sw.gy = 0.9; f.sw.gz = 0; f.sw.speed = 0.6; f.wait = 99 } },
        speed(k: number) { if (me) me.stage.timeScale = k },
        /** L'affiche : un décor tout fait, et deux poissons dessinés. */
        demo() {
          const s = me
          if (!s) return
          const oval = (cx: number, cy: number, rx: number, ry: number, n = 40) => Array.from({ length: n + 1 }, (_, i) => { const a = i / n * Math.PI * 2; return [Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry)] }).flat()
          /** Un ovale colorié au feutre (des allers-retours serrés), son contour par-dessus. */
          const filled = (cx: number, cy: number, rx: number, ry: number, c: string): DrawStroke[] => {
            const zig: number[] = []
            for (let y = -ry + 14; y <= ry - 14; y += 22) { const w = rx * Math.sqrt(1 - (y / ry) ** 2) - 12; zig.push(Math.round(cx - w), Math.round(cy + y), Math.round(cx + w), Math.round(cy + y + 11)) }
            return [{ c, w: 30, p: zig }, { c, w: 30, p: oval(cx, cy, rx, ry) }]
          }
          const tail = (x: number, dir: number, c: string): DrawStroke[] => [{ c, w: 30, p: [x, 400, x - dir * 150, 300, x - dir * 150, 500, x, 400, x - dir * 110, 340, x - dir * 110, 460, x - dir * 60, 380, x - dir * 60, 420] }]
          const fishes: DrawStroke[][] = [
            [...filled(520, 400, 210, 120, '#FFA94D'), ...tail(330, 1, '#FFA94D'), { c: '#FFFFFF', w: 30, p: [460, 290, 470, 510] }, { c: '#FFFFFF', w: 30, p: [600, 300, 610, 500] }, { c: '#3A2E25', w: 30, p: [660, 370, 662, 372] }],
            [...filled(500, 400, 190, 130, '#FF8FC8'), ...tail(680, -1, '#4FB8E7'), { c: '#9C6ADE', w: 18, p: [420, 290, 470, 240, 540, 270] }, { c: '#3A2E25', w: 30, p: [380, 370, 382, 372] }]
          ]
          if (!s.fish.length) for (const st of fishes) { const data: Fish = { s: st, d: headSide(st) }; s.saved.fish.push(data); addFish(s, data, false) }
          s.fish.forEach((f, i) => { f.sw.x = [0.55, -0.45][i] ?? 0; f.sw.y = [1.0, 0.75][i] ?? 1; f.sw.z = 0.1; f.sw.gx = f.sw.x + (i ? -0.3 : 0.3); f.sw.gy = f.sw.y; f.sw.gz = 0.1; f.wait = 99; f.yaw = (i ? -1 : 1) === f.data.d ? 0 : Math.PI })
          while (s.decos.length) removeDeco(s, 0)
          for (const [k, x, z, r] of [['algue', -1.15, -0.25, 0], ['algue', -0.95, -0.1, 1], ['rocher', -0.75, -0.3, 0.4], ['chateau', 0.45, -0.25, -0.2], ['coffre', -0.25, 0.15, 0.3], ['corail', 1.05, -0.05, 0], ['coquillage', 0.1, 0.25, 0.4], ['algue', 1.25, -0.3, 2], ['rocher', 1.2, 0.15, 1]] as [DecoKind, number, number, number][]) {
            const d = { k, x, z, r }
            s.saved.deco.push(d); placeDeco(s, d, false)
          }
        }
      }
    }

    return () => {
      if (dead) return
      dead = true
      c.root.removeEventListener('click', onClick)
      c.root.removeEventListener('pointerdown', onDown)
      sheet?.dispose()
      sheet = null
      const s = me
      me = null
      if (s) {
        save(s.saved)
        for (const f of s.fish) f.plush.dispose()
        try { s.stage.dispose() } catch { /* déjà démonté */ }
      }
      hideLoader()
    }
  }
}

