import type { GameDef, GameContext } from '../core/types'
import { createStage, loader, type Stage, type T3 } from '../core/three3d'
import { particles, toScreen, type Particles } from '../core/scene3d'
import { buildProps, buildSeaside, decoObject, DECOS, makeCrab, makeGull, makeShovel, moldIcon, moldObject, sandMesh, SEA_HIGH, SEA_LOW, surf, waveFlags, type Crab, type DecoKind, type SandMesh, type Seaside } from '../core/beach3d'
import { clearSand, dig, heightAt, makeSand, MOLDS, MOLD_R, N, packSand, pat, pour, SIZE, smoothAt, stamp, surfaceAt, unpackSand, type Mold, type Sand } from '../core/sand'
import { sfx, preloadSfx } from '../core/sfx'
import { getCtx, isSoundOn, tone } from '../core/audio'
import { onPause } from '../core/session'
import { visible, handNow, type HandMove } from '../core/hand'

/* 🏰 LE CHÂTEAU DE SABLE (27/10, choisi par le père avec la Poterie et
   l'Aquarium) — une plage : la mer qui roule et son écume, le ciel, la
   serviette, le seau, la pelle. Le sable est une grille de
   hauteurs (`core/sand.ts`, 128 × 128) dont on ne renvoie que la zone
   touchée ; sec il est clair, mouillé il est plus sombre. Les outils, à
   gauche, chacun son icône et son nom :
   - la Main : on lisse en glissant, on tasse d'un toucher ;
   - la Pelle : on creuse (le sable retiré s'amoncelle autour du trou) ; un
     trait tracé fait des douves ;
   - les Moules (tour ronde, tour crénelée, coquillage, étoile, tortue) : on
     touche le sable, le seau se retourne, se pose (ploc), se soulève, la
     forme reste ;
   - la Déco : coquillages, galets, étoiles de mer, drapeaux, bâtonnets (un
     toucher dessus la reprend) ; un petit crabe se promène tout seul ;
   - l'Eau : le seau d'eau remplit les douves, jusqu'au niveau que permet
     son volume.
   La poubelle (deux touchers, comme le Cartable) remet la plage à plat.
   « Fini » : le soleil se couche, la marée monte doucement et remplit les
   douves, le château tient (on ne détruit jamais une création), des
   mouettes passent. Créer : aucune note. */

type Tool = 'main' | 'pelle' | 'moule' | 'deco' | 'eau'
const TOOLS: Tool[] = ['moule', 'pelle', 'main', 'deco', 'eau']
const TOOL_NAME: Record<Tool, string> = { main: 'Main', pelle: 'Pelle', moule: 'Moules', deco: 'Déco', eau: 'Eau' }
const MOLD_NAME: Record<Mold, string> = { tour: 'Tour', creneaux: 'Créneaux', coquillage: 'Coquillage', etoile: 'Étoile', tortue: 'Tortue' }
const DECO_NAME: Record<DecoKind, string> = { coquillage: 'Coquillage', galet: 'Galet', etoile: 'Étoile de mer', drapeau: 'Drapeau', baton: 'Bâtonnet' }
const MAX_DECO = 40
/** Le bord de la grille où les outils ne vont pas (le sable y rejoint la plage). */
const EDGE = SIZE / 2 - 0.16

/* ---------- La sauvegarde : une seule pour la famille, pour l'instant ----------
   Isolée ici (`load` / `save`) : l'orchestrateur la branchera sur les cartes
   Jade / Joyce de `core/mine.ts`. La plage compressée (quelques Ko) et la déco. */
const KEY = 'ferme:chateau'
interface Deco { k: DecoKind; x: number; z: number; r: number }
interface Saved { sand: Sand; deco: Deco[] }
export function load(): Saved {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null') as { v?: number; sand?: unknown; deco?: unknown } | null
    if (o && o.v === 1) {
      const sand = unpackSand(o.sand)
      if (sand) {
        const deco = (Array.isArray(o.deco) ? o.deco : []).filter((d): d is [DecoKind, number, number, number] =>
          Array.isArray(d) && DECOS.includes(d[0]) && [d[1], d[2], d[3]].every(v => typeof v === 'number' && isFinite(v)))
          .slice(0, MAX_DECO).map(([k, x, z, r]) => ({ k, x, z, r }))
        return { sand, deco }
      }
    }
  } catch { /* une plage neuve */ }
  return { sand: makeSand(), deco: [] }
}
export function save(s: Saved) {
  const q = (v: number) => Math.round(v * 1000) / 1000
  try { localStorage.setItem(KEY, JSON.stringify({ v: 1, sand: packSand(s.sand), deco: s.deco.map(d => [d.k, q(d.x), q(d.z), q(d.r)]) })) } catch { /* plein : tant pis */ }
}

/** Le seau qui se retourne, se pose, se soulève ; ou le seau d'eau qui se vide. */
interface Anim { kind: 'moule' | 'eau'; mold?: Mold; obj: import('three').Object3D; x: number; z: number; rot: number; t: number; done: boolean }

interface State {
  stage: Stage
  T: T3
  saved: Saved
  sand: SandMesh
  seaside: Seaside
  decos: { d: Deco; g: import('three').Group; pop: number }[]
  tool: Tool
  mold: Mold
  deco: DecoKind
  anims: Anim[]
  crab: { c: Crab; x: number; z: number; tx: number; tz: number; wait: number; walk: number; clac: number; yaw: number }
  gulls: import('three').Group[]
  shovel: import('three').Group
  phase: 'make' | 'outro' | 'done'
  outro: number
  fx: Particles
  ray: import('three').Raycaster
  t: number
  dirty: number
  surf: ReturnType<typeof surf> | null
  stamps: number
}

let me: State | null = null
let ctx: GameContext

const CAM = { p: [0, 1.95, 2.45] as [number, number, number], t: [0, -0.02, -0.3] as [number, number, number] }

/* ---------- Le doigt sur le sable ---------- */

/** Le point du sable sous le doigt (on avance le long du rayon jusqu'à toucher la surface), ou null. */
function hitSand(s: State, cx: number, cy: number) {
  const T = s.T, r = s.stage.renderer.domElement.getBoundingClientRect()
  s.ray.setFromCamera(new T.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), s.stage.camera)
  const o = s.ray.ray.origin, d = s.ray.ray.direction
  if (d.y >= -0.01) return null
  let t = (0.6 - o.y) / d.y
  const p = new T.Vector3()
  let prev = t
  for (let i = 0; i < 160; i++) {
    p.copy(o).addScaledVector(d, t)
    if (p.y < -0.35) return null
    const h = Math.abs(p.x) < SIZE / 2 && Math.abs(p.z) < SIZE / 2 ? heightAt(s.saved.sand, p.x, p.z) : 0
    if (p.y <= h) {
      // Affiné entre les deux derniers pas
      let a = prev, b = t
      for (let k = 0; k < 6; k++) {
        const m = (a + b) / 2
        p.copy(o).addScaledVector(d, m)
        const hm = Math.abs(p.x) < SIZE / 2 && Math.abs(p.z) < SIZE / 2 ? heightAt(s.saved.sand, p.x, p.z) : 0
        if (p.y <= hm) b = m; else a = m
      }
      p.copy(o).addScaledVector(d, b)
      return Math.abs(p.x) <= EDGE && Math.abs(p.z) <= EDGE ? p : null
    }
    prev = t
    t += 0.012
  }
  return null
}
const sandScreen = (s: State, x: number, z: number) => toScreen(s.stage, { x, y: surfaceAt(s.saved.sand, x, z), z })

let lastSandSound = 0
function sandSound(rate = 1, vol = 0.25) {
  const now = performance.now()
  if (now - lastSandSound < 110) return
  lastSandSound = now
  sfx('step', { vol, rate: rate * (0.85 + Math.random() * 0.3) })
}
/** Le plouf de l'eau : un souffle filtré qui retombe. */
function splash() {
  if (!isSoundOn()) return
  const ac = getCtx()
  if (!ac) return
  try {
    const len = Math.round(ac.sampleRate * 0.6), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5)
    const src = ac.createBufferSource(); src.buffer = buf
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(1800, ac.currentTime); f.frequency.exponentialRampToValueAtTime(400, ac.currentTime + 0.5); f.Q.value = 0.8
    const g = ac.createGain(); g.gain.value = 0.35
    src.connect(f); f.connect(g); g.connect(ac.destination)
    src.start()
  } catch { /* en silence */ }
  tone(320, 0.12, 'sine', 0.05, 0.05); tone(240, 0.16, 'sine', 0.04, 0.12)
}

/* ---------- Les gestes ---------- */

function placeDeco(s: State, d: Deco, pop = true) {
  const g = decoObject(s.T, d.k)
  g.position.set(d.x, surfaceAt(s.saved.sand, d.x, d.z), d.z)
  g.rotation.y = d.r
  g.traverse(o => { o.castShadow = true })
  s.stage.scene.add(g)
  s.decos.push({ d, g, pop: pop ? 0 : 1 })
}
function removeDeco(s: State, i: number) {
  const it = s.decos[i]
  s.decos.splice(i, 1)
  s.saved.deco.splice(s.saved.deco.indexOf(it.d), 1)
  it.g.removeFromParent()
  it.g.traverse(o => { const m = o as import('three').Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as import('three').Material).dispose() } })
  sfx('pluck', { vol: 0.4, rate: 0.8 })
  s.fx.burst(it.g.position.clone().setY(it.g.position.y + 0.05), { count: 10, color: ['#F2D6A8', '#FFFFFF'], speed: 0.5, spread: 1, life: 0.5, size: 0.025, gravity: 1.5 })
  s.dirty = 0.6
}

/** La déco la plus proche du doigt à l'écran (pour la reprendre). */
function decoNear(s: State, cx: number, cy: number) {
  let best = -1, bd = 34
  s.decos.forEach((it, i) => {
    const q = toScreen(s.stage, it.g.position.clone().setY(it.g.position.y + (it.d.k === 'drapeau' || it.d.k === 'baton' ? 0.12 : 0.02)))
    const dd = Math.hypot(q.x - cx, q.y - cy)
    if (dd < bd) { bd = dd; best = i }
  })
  return best
}

function startMold(s: State, x: number, z: number) {
  if (s.anims.some(a => a.kind === 'moule')) return
  const obj = moldObject(s.T, s.mold)
  const rot = (Math.random() - 0.5) * 0.5
  obj.position.set(x, 0.8, z)
  s.stage.scene.add(obj)
  s.anims.push({ kind: 'moule', mold: s.mold, obj, x, z, rot, t: 0, done: false })
  sfx('whoosh', { vol: 0.35, rate: 1.2 })
}
function startWater(s: State, x: number, z: number) {
  if (s.anims.some(a => a.kind === 'eau')) return
  const obj = new s.T.Group()
  const pail = new s.T.Mesh(new s.T.LatheGeometry([[0.001, 0], [0.1, 0], [0.13, 0.19], [0.14, 0.2], [0.127, 0.2], [0.095, 0.012], [0.001, 0.012]].map(([a, b]) => new s.T.Vector2(a, b)), 28), new s.T.MeshPhysicalMaterial({ color: '#2F9BE0', roughness: 0.35, clearcoat: 0.6, side: s.T.DoubleSide }))
  pail.castShadow = true
  const water = new s.T.Mesh(new s.T.CircleGeometry(0.125, 24), new s.T.MeshPhysicalMaterial({ color: '#56BDE8', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.85 }))
  water.rotation.x = -Math.PI / 2; water.position.y = 0.17
  obj.add(pail, water)
  obj.position.set(x + 0.1, 0.55, z)
  s.stage.scene.add(obj)
  s.anims.push({ kind: 'eau', obj, x, z, rot: 0, t: 0, done: false })
}

function stepAnims(s: State, dt: number) {
  const ease = (k: number) => k * k * (3 - 2 * k)
  for (const a of s.anims.slice()) {
    a.t += dt
    const o = a.obj
    if (a.kind === 'moule') {
      const base = heightAt(s.saved.sand, a.x, a.z)
      if (a.t < 0.45) {
        // Rempli de sable, ouverture en haut, il se retourne en descendant
        const k = ease(a.t / 0.45)
        o.rotation.set(Math.PI * (1 - k), a.rot, 0)
        o.position.set(a.x, base + 0.8 - 0.8 * k + (1 - k) * 0.25, a.z)
      } else if (a.t < 0.75) {
        if (!a.done) {
          a.done = true
          // Ploc
          sfx('drop', { vol: 0.6, rate: 0.6 }); tone(170, 0.12, 'sine', 0.12); tone(120, 0.18, 'sine', 0.08, 0.05)
          s.fx.burst(new s.T.Vector3(a.x, base + 0.02, a.z), { count: 18, color: ['#E6CFA2', '#D9BD8A'], speed: 0.9, spread: 1, life: 0.6, size: 0.03, gravity: 3 })
        }
        o.rotation.set(0, a.rot, 0)
        const q = Math.sin(Math.min(1, (a.t - 0.45) / 0.15) * Math.PI) * 0.08
        o.scale.set(1 + q, 1 - q, 1 + q)
        o.position.set(a.x, base, a.z)
      } else {
        if (a.done && !o.userData.stamped) {
          o.userData.stamped = true
          o.scale.setScalar(1)
          stamp(s.saved.sand, a.mold!, a.x, a.z, a.rot)
          s.stamps++
          s.dirty = 0.8
          // La déco posée là-dessous remonte sur le sable
          for (const it of s.decos) if (Math.hypot(it.d.x - a.x, it.d.z - a.z) < MOLD_R[a.mold!] * 1.5) it.g.position.y = surfaceAt(s.saved.sand, it.d.x, it.d.z)
        }
        // Il se soulève et s'en va
        const k = ease(Math.min(1, (a.t - 0.75) / 0.5))
        o.position.set(a.x, base + k * 0.9, a.z)
        o.rotation.set(-k * 0.6, a.rot + k * 0.4, 0)
        o.scale.setScalar(1 - k * 0.6)
        if (a.t > 1.25) { removeAnim(s, a); tone(660, 0.08, 'triangle', 0.06); tone(990, 0.12, 'triangle', 0.05, 0.07) }
      }
    } else {
      // Le seau d'eau s'incline, l'eau tombe en pluie, la douve se remplit
      const k = ease(Math.min(1, a.t / 0.4))
      o.rotation.z = k * 1.9
      if (a.t > 0.3 && a.t < 0.9 && Math.random() < 0.9) {
        s.fx.burst(new s.T.Vector3(a.x + (Math.random() - 0.5) * 0.06, 0.45, a.z), { count: 4, color: ['#7FD0F2', '#C8ECFA', '#FFFFFF'], speed: 0.3, spread: 0.4, life: 0.4, size: 0.035, gravity: 9, dir: { x: 0, y: -1, z: 0 } })
      }
      if (a.t > 0.55 && !a.done) {
        a.done = true
        pour(s.saved.sand, a.x, a.z)
        splash()
        s.fx.burst(new s.T.Vector3(a.x, surfaceAt(s.saved.sand, a.x, a.z) + 0.01, a.z), { count: 22, color: ['#7FD0F2', '#FFFFFF'], speed: 1, spread: 1, life: 0.5, size: 0.03, gravity: 4 })
        s.dirty = 0.8
      }
      if (a.t > 1.1) o.position.y += dt * 1.5
      if (a.t > 1.5) removeAnim(s, a)
    }
  }
}
function removeAnim(s: State, a: Anim) {
  s.anims.splice(s.anims.indexOf(a), 1)
  a.obj.removeFromParent()
  a.obj.traverse(o => { const m = o as import('three').Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as import('three').Material).dispose() } })
}

/* ---------- Le crabe ---------- */

function stepCrab(s: State, dt: number) {
  const c = s.crab, sd = s.saved.sand
  c.clac = Math.max(0, c.clac - dt)
  if (s.phase !== 'make') {
    // La marée monte : il file se cacher sur le côté
    c.tx = SIZE / 2 + 0.9; c.tz = 0.9; c.wait = 0
  }
  const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz)
  if (c.wait > 0) c.wait -= dt
  else if (d < 0.04) {
    c.wait = 1 + Math.random() * 3
    // Une nouvelle destination, pas dans l'eau
    for (let i = 0; i < 8; i++) {
      const x = (Math.random() * 2 - 1) * (EDGE - 0.1), z = (Math.random() * 2 - 1) * (EDGE - 0.1)
      const k = Math.round((z + SIZE / 2) / (SIZE / (N - 1))) * N + Math.round((x + SIZE / 2) / (SIZE / (N - 1)))
      if (sd.wl[k] > sd.h[k]) continue
      c.tx = x; c.tz = z
      break
    }
  } else {
    const sp = Math.min(d, (s.phase === 'make' ? 0.16 : 0.5) * dt)
    c.x += dx / d * sp; c.z += dz / d * sp
    c.walk += dt * 16
    // Un crabe marche de côté : son flanc dans le sens de la marche
    const want = Math.atan2(dx, dz) + Math.PI / 2
    let da = want - c.yaw
    da = Math.atan2(Math.sin(da), Math.cos(da))
    if (Math.abs(da) > Math.PI / 2) da = Math.atan2(Math.sin(da + Math.PI), Math.cos(da + Math.PI))
    c.yaw += da * Math.min(1, dt * 5)
  }
  const inGrid = Math.abs(c.x) < SIZE / 2 && Math.abs(c.z) < SIZE / 2
  const y = inGrid ? surfaceAt(sd, c.x, c.z) : 0
  const g = c.c.g
  g.position.set(c.x, y + Math.abs(Math.sin(c.walk)) * 0.006, c.z)
  g.rotation.y = c.yaw
  g.scale.setScalar(1.5)
  const moving = c.wait <= 0 && d > 0.04
  for (const l of c.c.legs) l.rotation.x = moving ? Math.sin(c.walk + l.userData.i * 2 + (l.userData.side > 0 ? Math.PI : 0)) * 0.45 : 0
  // Les pinces : elles se lèvent et claquent quand on le touche, sinon elles bercent
  for (const [i, a] of c.c.claws.entries()) {
    a.rotation.x = c.clac > 0 ? -0.9 + Math.sin(c.clac * 30) * 0.25 : Math.sin(s.t * 2 + i) * 0.08
    a.traverse(o => { if (o.userData.jaw) o.rotation.x = Math.PI / 2 + (c.clac > 0 ? Math.abs(Math.sin(c.clac * 30)) * 0.5 : 0) })
  }
  for (const e of c.c.eyes) e.rotation.z = Math.sin(s.t * 1.7 + e.position.x * 50) * 0.15
}

/* ---------- Fini : le soleil se couche, la marée monte ---------- */

function startOutro(s: State) {
  if (s.phase !== 'make' || s.anims.length) return
  s.phase = 'outro'
  s.outro = 0
  save(s.saved)
  ctx.root.querySelector('.ch-wrap')?.setAttribute('data-phase', 'outro')
  sfx('confirm', { vol: 0.4 })
}
function stepOutro(s: State, dt: number) {
  s.outro += dt
  const t = s.outro
  const ease = (k: number) => k * k * (3 - 2 * k)
  s.seaside.setDusk(ease(Math.min(1, t / 5.5)))
  const sea = SEA_LOW + (SEA_HIGH - SEA_LOW) * ease(Math.max(0, Math.min(1, (t - 1.2) / 5)))
  s.seaside.setSea(sea)
  // L'eau gagne la plage : le sable se mouille à mesure qu'elle arrive
  s.sand.soak(1 - Math.max(0, Math.min(1, -sea / 0.09)))
  // Les mouettes, de droite à gauche, en V
  s.gulls.forEach((g, i) => {
    const k = (t - 2.2 - i * 0.25) / 6
    g.visible = k > 0 && k < 1
    if (!g.visible) return
    g.position.set(7 - k * 14 + i * 0.5, 1.7 + i * 0.18 + Math.sin(t * 1.3 + i) * 0.08, -2.4 - i * 0.6)
    g.rotation.set(0, Math.PI, Math.sin(t * 1.3 + i) * 0.1)
    const fl = Math.sin(t * 9 + i * 1.7) * 0.7
    const [wl, wr] = g.userData.wings as import('three').Object3D[]
    wl.rotation.x = fl; wr.rotation.x = -fl
  })
  if (t > 2.4 && t - dt <= 2.4) { tone(1500, 0.12, 'triangle', 0.04); tone(1250, 0.18, 'triangle', 0.04, 0.12); tone(1450, 0.14, 'triangle', 0.035, 0.4) }
  // La caméra recule un peu, on voit le château dans le soir
  const k = ease(Math.min(1, t / 6))
  s.stage.camera.position.set(0.3 * k, CAM.p[1] + 0.35 * k, CAM.p[2] + 0.9 * k)
  s.stage.camera.lookAt(0, CAM.t[1] + 0.1 * k, CAM.t[2] - 0.3 * k)
  if (t > 8.2 && s.phase === 'outro') endGame(s)
}
function endGame(s: State) {
  if (s.phase === 'done') return
  s.phase = 'done'
  ctx.finish({ title: 'Quel beau château !', msg: 'La marée monte, il tient bon', stars: 3 })
}

/* ---------- Chaque image ---------- */

function frame(s: State, dt: number) {
  s.t += dt
  s.seaside.step(s.t)
  stepAnims(s, dt)
  stepCrab(s, dt)
  if (s.phase !== 'make') stepOutro(s, dt)
  for (const it of s.decos) {
    if (it.pop < 1) {
      it.pop = Math.min(1, it.pop + dt * 3.5)
      const k = it.pop, b = k < 0.7 ? k / 0.7 * 1.2 : 1.2 - (k - 0.7) / 0.3 * 0.2
      it.g.scale.setScalar(Math.max(0.01, b))
    }
    if (it.d.k === 'drapeau') waveFlags(it.g, s.t)
  }
  s.sand.sync(s.saved.sand)
  s.fx.update(dt)
  // La vague : le souffle monte quand elle arrive au bord
  if (s.surf) {
    const k = 0.5 + 0.5 * Math.sin(-2.4 * 3.6 - s.t * 2.1 + Math.PI / 2)
    s.surf.set(k * k, isSoundOn() ? 1 : 0)
  }
  if (s.dirty > 0) { s.dirty -= dt; if (s.dirty <= 0) save(s.saved) }
}

/* ---------- La scène ---------- */

async function build(c: GameContext, arena: HTMLElement): Promise<State | null> {
  const stage = await createStage(arena, {
    sky: '#D6EEFA', fov: 42, cam: CAM.p, target: CAM.t, fog: [24, 60], fogColor: '#D6EEFA',
    hemi: ['#DDEFFF', '#E8C9A0', 1.0], sun: { pos: [-3.0, 4.4, 1.0], color: '#FFF1DA', intensity: 2.6, area: 3.2, far: 16 },
    fill: 0.4, exposure: 0.9
  })
  if (!c.alive()) { stage.dispose(); return null }
  const T = stage.T
  const saved = load()
  const seaside = buildSeaside(T, stage)
  const sand = sandMesh(T, stage, saved.sand)
  stage.scene.add(sand.mesh, sand.water)
  buildProps(T, stage)
  const crab = makeCrab(T)
  crab.g.traverse(o => { o.castShadow = true })
  stage.scene.add(crab.g)
  const gulls = [0, 1, 2].map(() => { const g = makeGull(T); g.visible = false; stage.scene.add(g); return g })
  const shovel = makeShovel(T)
  shovel.visible = false
  shovel.traverse(o => { o.castShadow = true })
  stage.scene.add(shovel)
  const s: State = {
    stage, T, saved, sand, seaside, decos: [], tool: 'moule', mold: 'tour', deco: 'coquillage', anims: [],
    crab: { c: crab, x: 0.9, z: 0.9, tx: 0.9, tz: 0.9, wait: 2, walk: 0, clac: 0, yaw: 0 },
    gulls, shovel, phase: 'make', outro: 0, fx: particles(stage, 500), ray: new T.Raycaster(), t: 0, dirty: 0, surf: null, stamps: 0
  }
  for (const d of saved.deco) placeDeco(s, d, false)
  seaside.setDusk(0)
  seaside.setSea(SEA_LOW)
  return s
}

/* ---------- Les icônes ---------- */

const svg = (inner: string, sz = 34) => `<svg viewBox="0 0 48 48" width="${sz}" height="${sz}">${inner}</svg>`
const TOOL_ICON: Record<Tool, string> = {
  main: svg('<path d="M14 26V12a3 3 0 0 1 6 0v10V9a3 3 0 0 1 6 0v13V11a3 3 0 0 1 6 0v12-7a3 3 0 0 1 6 0v14c0 9-6 15-14 15-6 0-9-3-12-8l-5-8a3 3 0 0 1 5-3z" fill="#F7CBA4" stroke="#C98E66" stroke-width="2"/>'),
  pelle: svg('<path d="M30 6l4 4-11 11-4-4z" fill="#FFC93C"/><circle cx="34" cy="8" r="5" fill="none" stroke="#FFC93C" stroke-width="3.4"/><path d="M19 17l12 12-6 6c-4 4-11 4-14-1s-1-10 2-11z" fill="#FFB020"/><path d="M8 42c6-2 12-2 18-6" stroke="#E6CFA2" stroke-width="4" stroke-linecap="round"/>'),
  moule: svg('<path d="M9 40l3-24h24l3 24z" fill="#E8414F"/><path d="M12 16h24l1 5H11z" fill="#C8303C"/><path d="M10 16V10h5v3h4v-3h5v3h4v-3h5v3h4v-3h5v6" fill="#E8414F"/><path d="M15 16c0-8 18-8 18 0" fill="none" stroke="#FFD34D" stroke-width="3"/>'),
  deco: svg('<path d="M24 40c-9 0-15-6-15-14 0-6 4-11 8-11 2 0 3 1 3 3 0-3 2-5 4-5s4 2 4 5c0-2 1-3 3-3 4 0 8 5 8 11 0 8-6 14-15 14z" fill="#F7C6C0"/><path d="M24 40V18M18 39l-3-17M30 39l3-17" stroke="#E79A8E" stroke-width="2"/><path d="M38 6l2 5 5 .5-4 3.5 1.2 5-4.2-2.8-4.2 2.8L35 15l-4-3.5 5-.5z" fill="#FF8A3D"/>'),
  eau: svg('<path d="M10 16h22l-3 24H13z" fill="#2F9BE0"/><path d="M10 16c0-6 22-6 22 0" fill="none" stroke="#FFD34D" stroke-width="3"/><path d="M30 14c6 2 8 6 8 10" stroke="#7FD0F2" stroke-width="4" stroke-linecap="round"/><path d="M38 28c-2 3-3 5-3 7a3 3 0 0 0 6 0c0-2-1-4-3-7z" fill="#7FD0F2"/><ellipse cx="21" cy="17" rx="10" ry="2.4" fill="#7FD0F2"/>')
}
const TRASH_ICON = svg('<path d="M12 15h24l-2 25a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3z" fill="#E8574C"/><rect x="8" y="9" width="32" height="6" rx="2.5" fill="#C8453B"/><rect x="19" y="5" width="10" height="6" rx="2.5" fill="#C8453B"/><path d="M19 21v16M24 21v16M29 21v16" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".85"/>', 32)
const FINI_ICON = svg('<circle cx="24" cy="24" r="18" fill="#5EC97B"/><path d="m15 24.5 6 6L33.5 18" fill="none" stroke="#fff" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/>')
const DECO_ICON: Record<DecoKind, string> = {
  coquillage: svg('<path d="M24 42 8 22c0-9 7-15 16-15s16 6 16 15z" fill="#F7C6C0"/><path d="M24 42V8M24 42 12 13M24 42l12-29M24 42 9 19M24 42l15-23" stroke="#E79A8E" stroke-width="2"/><rect x="18" y="39" width="12" height="5" rx="2" fill="#F2B0A8"/>', 40),
  galet: svg('<ellipse cx="24" cy="28" rx="17" ry="11" fill="#9AA3AE"/><ellipse cx="19" cy="24" rx="7" ry="3.4" fill="#C4CBD3"/><ellipse cx="34" cy="17" rx="7" ry="5" fill="#7E8894"/>', 40),
  etoile: svg('<path d="M24 5l5 13 14 1-11 9 4 14-12-8-12 8 4-14-11-9 14-1z" fill="#FF8A3D" stroke="#E86A20" stroke-width="2" stroke-linejoin="round"/><circle cx="24" cy="15" r="1.6" fill="#FFD9A8"/><circle cx="24" cy="24" r="2" fill="#FFD9A8"/><circle cx="17" cy="27" r="1.6" fill="#FFD9A8"/><circle cx="31" cy="27" r="1.6" fill="#FFD9A8"/>', 40),
  drapeau: svg('<path d="M15 6v38" stroke="#8A5A32" stroke-width="3.4" stroke-linecap="round"/><path d="M16 8c8-3 12 4 22 1v14c-10 3-14-4-22-1z" fill="#E8414F"/><circle cx="15" cy="6" r="2.6" fill="#FFD34D"/>', 40),
  baton: svg('<path d="M22 44c2-12 0-24 3-38" stroke="#8C6A48" stroke-width="4.4" stroke-linecap="round"/><path d="M23.5 24c5-3 8-6 10-11" stroke="#8C6A48" stroke-width="3" stroke-linecap="round"/><ellipse cx="35" cy="11" rx="5" ry="2.6" fill="#7DB85A" transform="rotate(-30 35 11)"/>', 40)
}

/* ---------- Le jeu ---------- */

export const chateau: GameDef = {
  id: 'chateau', name: 'Le Château de sable', icon: '🏰', sq: 'sq-sun', cat: 'creatif', noTier: true,
  subtitle: 'Moules, pelle et douves : à toi la plage',
  // La main : poser une tour, tracer des douves, remplir d'eau, poser une déco
  hand: (root): HandMove | null => {
    const s = me
    if (!s || s.phase !== 'make' || s.anims.length) return null
    if (s.tool === 'moule') return { tap: sandScreen(s, s.stamps ? 0.4 : 0, -0.2) }
    if (s.tool === 'pelle') return { drag: [sandScreen(s, -0.6, 0.4), sandScreen(s, 0.6, 0.4)] }
    if (s.tool === 'main') return { drag: [sandScreen(s, -0.4, 0.7), sandScreen(s, 0.2, 0.7)] }
    if (s.tool === 'eau') {
      // Un creux où verser, sinon le sable devant
      const sd = s.saved.sand
      let best = -1, low = -0.015
      for (let k = 0; k < N * N; k += 7) if (sd.h[k] < low && !(sd.wl[k] > sd.h[k])) { low = sd.h[k]; best = k }
      if (best >= 0) { const i = best % N, j = (best - i) / N; return { tap: sandScreen(s, i / (N - 1) * SIZE - SIZE / 2, j / (N - 1) * SIZE - SIZE / 2) } }
      return { tap: sandScreen(s, 0, 0.4) }
    }
    return { choose: visible(root, '.ch-opt').slice(0, 4) }
  },
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="arena g3-arena ch-wrap" id="chWrap" data-phase="make">
        <div class="ch-tools">${TOOLS.map(t => `<span class="tool-item"><button class="sn-tool ch-tool${t === 'moule' ? ' sel' : ''}" data-tool="${t}" aria-label="${TOOL_NAME[t]}">${TOOL_ICON[t]}</button><i class="tool-cap">${TOOL_NAME[t]}</i></span>`).join('')}
          <span class="tool-item"><button class="sn-tool ch-fini" id="chFini" aria-label="Fini">${FINI_ICON}</button><i class="tool-cap">Fini</i></span></div>
        <span class="tool-item ch-reset"><button class="sn-tool at-trash" id="chReset" aria-label="Effacer la plage">${TRASH_ICON}</button><i class="tool-cap">Effacer</i></span>
        <div class="ch-pal" id="chPal"></div>
      </div>`
    const arena = c.root.querySelector<HTMLElement>('#chWrap')!
    const resetB = c.root.querySelector<HTMLElement>('#chReset')!
    let armed = false, armId = 0
    const disarm = () => { armed = false; resetB.classList.remove('arm'); ctx.cancel(armId) }
    preloadSfx(['step', 'drop', 'whoosh', 'pluck', 'confirm', 'select', 'switch', 'cloth', 'click'])
    const icons: Record<string, string> = {}
    for (const m of MOLDS) icons[m] = moldIcon(m)
    const opt = (attrs: string, icon: string, cap: string, sel: boolean) =>
      `<span class="tool-item"><button class="sn-tool ch-opt${sel ? ' sel' : ''}" ${attrs} aria-label="${cap}">${icon}</button><i class="tool-cap">${cap}</i></span>`
    const showPal = () => {
      const s = me
      const pal = c.root.querySelector<HTMLElement>('#chPal')!
      if (!s) { pal.innerHTML = ''; return }
      if (s.tool === 'moule') pal.innerHTML = MOLDS.map(m => opt(`data-mold="${m}"`, `<img src="${icons[m]}" alt="" draggable="false">`, MOLD_NAME[m], s.mold === m)).join('')
      else if (s.tool === 'deco') pal.innerHTML = DECOS.map(d => opt(`data-deco="${d}"`, DECO_ICON[d], DECO_NAME[d], s.deco === d)).join('')
      else pal.innerHTML = ''
      arena.setAttribute('data-pal', pal.innerHTML ? '1' : '0')
    }
    const setTool = (t: Tool) => {
      const s = me
      if (!s) return
      s.tool = t
      c.root.querySelectorAll<HTMLElement>('.ch-tool').forEach(b => b.classList.toggle('sel', b.dataset.tool === t))
      showPal()
      handNow()
    }

    let unPause = () => { /* posé au chargement */ }
    const hideLoader = loader(arena, 'chateau')
    build(c, arena).then(s => {
      hideLoader()
      if (!s || dead) { if (s) s.stage.dispose(); return }
      me = s
      const ac = getCtx()
      if (ac) try { s.surf = surf(ac) } catch { /* sans la mer qui chante */ }
      // En pause, la boucle s'arrête : la vague se tait avec elle
      unPause = onPause(p => { if (p) me?.surf?.set(0, 0) })
      setTool('moule')
      s.stage.start(dt => { if (me === s) frame(s, dt) })
    }).catch(e => { hideLoader(); console.error(e); if (!dead) c.toast('La 3D n\'est pas disponible ici') })

    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      const s = me
      if (!s || s.phase !== 'make') return
      if (armed && !t.closest('#chReset')) disarm()
      if (t.closest('#chFini')) { startOutro(s); return }
      if (t.closest('#chReset')) {
        // Deux touchers : le premier arme la poubelle
        if (!armed) { armed = true; resetB.classList.add('arm'); sfx('switch', { vol: 0.5 }); ctx.cancel(armId); armId = ctx.after(2600, disarm); return }
        disarm()
        clearSand(s.saved.sand)
        while (s.decos.length) removeDeco(s, 0)
        sfx('whoosh', { vol: 0.6, rate: 0.7 })
        s.fx.burst(new s.T.Vector3(0, 0.1, 0), { count: 60, color: ['#E6CFA2', '#FFFFFF', '#F2D6A8'], speed: 2, spread: 1, life: 0.8, size: 0.05, gravity: 2 })
        s.dirty = 0.1
        return
      }
      const tb = t.closest<HTMLElement>('.ch-tool')
      if (tb?.dataset.tool) { setTool(tb.dataset.tool as Tool); sfx('select', { vol: 0.5 }); return }
      const o = t.closest<HTMLElement>('.ch-opt')
      if (!o) return
      if (o.dataset.mold) s.mold = o.dataset.mold as Mold
      if (o.dataset.deco) s.deco = o.dataset.deco as DecoKind
      sfx('select', { vol: 0.4 })
      showPal()
      handNow()
    }
    c.root.addEventListener('click', onClick)

    /* Le doigt : un geste par doigt (suivi par pointerId) */
    interface Pt { x: number; y: number; moved: number; last: import('three').Vector3 | null; dug: Uint8Array | null }
    const pts = new Map<number, Pt>()
    const onDown = (e: PointerEvent) => {
      const s = me
      if (!s || e.target !== s.stage.renderer.domElement) return
      if (s.phase === 'outro') { if (s.outro > 1.5) endGame(s); return }
      if (s.phase !== 'make') return
      // Le crabe touché lève les pinces
      const cq = toScreen(s.stage, s.crab.c.g.position)
      if (Math.hypot(cq.x - e.clientX, cq.y - e.clientY) < 40) { s.crab.clac = 0.8; s.crab.wait = Math.max(s.crab.wait, 1); sfx('click', { vol: 0.6, rate: 1.5 }); sfx('click', { vol: 0.5, rate: 1.8, delay: 0.12 }); return }
      const p = hitSand(s, e.clientX, e.clientY)
      const pt: Pt = { x: e.clientX, y: e.clientY, moved: 0, last: p, dug: null }
      pts.set(e.pointerId, pt)
      if (!p) return
      if (s.tool === 'pelle') {
        pt.dug = new Uint8Array(N * N)
        dig(s.saved.sand, p.x, p.z, 0.08, 0.035, pt.dug)
        sandSound(0.8, 0.4)
        s.shovel.visible = true
        s.dirty = 0.8
      }
    }
    const onMove = (e: PointerEvent) => {
      const s = me, pt = pts.get(e.pointerId)
      if (!s || !pt || s.phase !== 'make') return
      pt.moved += Math.abs(e.clientX - pt.x) + Math.abs(e.clientY - pt.y)
      pt.x = e.clientX; pt.y = e.clientY
      if (s.tool !== 'pelle' && s.tool !== 'main') return
      const p = hitSand(s, e.clientX, e.clientY)
      if (!p) return
      const a = pt.last ?? p
      const d = Math.hypot(p.x - a.x, p.z - a.z)
      const step = 0.035
      if (d < step && pt.last) return
      const n = Math.max(1, Math.ceil(d / step))
      for (let i = 1; i <= n; i++) {
        const x = a.x + (p.x - a.x) * i / n, z = a.z + (p.z - a.z) * i / n
        if (s.tool === 'pelle') dig(s.saved.sand, x, z, 0.075, 0.03, pt.dug ?? undefined)
        else smoothAt(s.saved.sand, x, z, 0.12, 0.6)
      }
      pt.last = p
      sandSound(s.tool === 'pelle' ? 0.8 : 1.3, s.tool === 'pelle' ? 0.35 : 0.18)
      if (Math.random() < 0.3) s.fx.burst(p.clone().setY(p.y + 0.02), { count: 3, color: ['#E6CFA2', '#D9BD8A'], speed: 0.7, spread: 0.8, life: 0.4, size: 0.025, gravity: 4 })
      s.dirty = 0.8
    }
    const onUp = (e: PointerEvent) => {
      const s = me, pt = pts.get(e.pointerId)
      pts.delete(e.pointerId)
      if (!s) return
      if (![...pts.values()].some(q => q.dug)) s.shovel.visible = false
      if (!pt || s.phase !== 'make' || e.type === 'pointercancel' || pt.moved > 14) return
      // Un toucher
      if (s.tool === 'deco') {
        const i = decoNear(s, e.clientX, e.clientY)
        if (i >= 0) { removeDeco(s, i); return }
      }
      const p = pt.last
      if (!p) return
      if (s.tool === 'moule') startMold(s, p.x, p.z)
      else if (s.tool === 'eau') startWater(s, p.x, p.z)
      else if (s.tool === 'main') { pat(s.saved.sand, p.x, p.z); sandSound(0.6, 0.45); s.dirty = 0.8 }
      else if (s.tool === 'deco' && s.decos.length < MAX_DECO) {
        const d: Deco = { k: s.deco, x: p.x, z: p.z, r: Math.random() * Math.PI * 2 }
        s.saved.deco.push(d)
        placeDeco(s, d)
        sfx('pluck', { vol: 0.5, rate: 1 + Math.random() * 0.4 })
        s.fx.burst(p.clone().setY(p.y + 0.04), { count: 10, color: ['#FFD34D', '#FFFFFF'], speed: 0.6, spread: 1, life: 0.5, size: 0.025, gravity: 0.6 })
        s.dirty = 0.6
      }
    }
    c.root.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    // La pelle suit le doigt qui creuse
    const follow = (e: PointerEvent) => {
      const s = me
      if (!s || !s.shovel.visible) return
      const p = hitSand(s, e.clientX, e.clientY)
      if (!p) return
      s.shovel.position.set(p.x + 0.05, p.y + 0.03, p.z + 0.12)
      s.shovel.rotation.set(-0.7 + Math.sin(performance.now() / 90) * 0.15, 0.3, 0)
    }
    window.addEventListener('pointermove', follow)
    window.addEventListener('pointerdown', follow)

    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __ch: unknown }).__ch = {
        get ready() { return !!me && me.phase === 'make' && !me.anims.length },
        get phase() { return me?.phase },
        get tool() { return me?.tool },
        get decos() { return me ? me.saved.deco.length : 0 },
        get stamps() { return me?.stamps ?? 0 },
        /** Les cases où il y a de l'eau. */
        get water() { const sd = me?.saved.sand; if (!sd) return 0; let n = 0; for (let k = 0; k < N * N; k++) if (sd.wl[k] > sd.h[k]) n++; return n },
        height(x: number, z: number) { return me ? heightAt(me.saved.sand, x, z) : null },
        /** Un point du sable (x, z en mètres) à l'écran. */
        pt(x: number, z: number) { return me ? sandScreen(me, x, z) : null },
        speed(k: number) { if (me) me.stage.timeScale = k },
        /** L'affiche : un château à quatre tours, ses douves pleines, ses drapeaux et ses coquillages. */
        demo() {
          const s = me
          if (!s) return
          const sd = s.saved.sand
          clearSand(sd)
          while (s.decos.length) removeDeco(s, 0)
          const dug = new Uint8Array(N * N)
          for (let a = 0; a < Math.PI * 2; a += 0.04) dig(sd, Math.cos(a) * 0.62, -0.25 + Math.sin(a) * 0.48, 0.07, 0.045, dug)
          stamp(sd, 'creneaux', 0, -0.25, 0)
          stamp(sd, 'tour', 0, -0.25, 0.3)
          for (const [x, z] of [[-0.33, -0.48], [0.33, -0.48], [-0.33, -0.02], [0.33, -0.02]]) stamp(sd, 'tour', x, z, x)
          stamp(sd, 'etoile', -0.95, 0.55, 0.2)
          stamp(sd, 'tortue', 0.95, 0.5, -0.5)
          stamp(sd, 'coquillage', 0, 0.62, 0)
          pour(sd, 0.62, -0.25, 0.006)
          pour(sd, -0.62, -0.25, 0.006)
          const add = (k: DecoKind, x: number, z: number) => { s.saved.deco.push({ k, x, z, r: 0.3 }) }
          add('drapeau', 0, -0.25); add('drapeau', -0.33, -0.48); add('drapeau', 0.33, -0.48)
          add('coquillage', -0.2, 0.25); add('etoile', 0.45, 0.3); add('galet', -0.55, 0.32); add('coquillage', 0.2, 0.28); add('baton', 0.33, -0.02)
          s.sand.sync(sd)
          for (const d of s.saved.deco) placeDeco(s, d, false)
          s.crab.x = 0.55; s.crab.z = 0.75; s.crab.tx = 0.55; s.crab.tz = 0.75; s.crab.wait = 99; s.crab.yaw = -0.4
        }
      }
    }

    return () => {
      if (dead) return
      dead = true
      c.root.removeEventListener('click', onClick)
      c.root.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('pointermove', follow)
      window.removeEventListener('pointerdown', follow)
      unPause()
      const s = me
      me = null
      if (s) {
        save(s.saved)
        s.surf?.stop()
        try { s.stage.dispose() } catch { /* déjà démonté */ }
      }
      hideLoader()
    }
  }
}
