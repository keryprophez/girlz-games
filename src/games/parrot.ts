import type { GameDef, GameContext } from '../core/types'
import { createStage, loader, type Stage, type T3 } from '../core/three3d'
import { particles, type Particles } from '../core/scene3d'
import { buildFarm } from '../core/farm3d'
import { critterKit, type Critter, type CritterKind, type CritterKit } from '../core/critters'
import { critterPortraits, portraitImg } from '../core/portraits'
import { cry, preloadCries, type AnimalVoice } from '../core/sfx'
import { getCtx, isSoundOn, tone } from '../core/audio'
import { onPause } from '../core/session'
import { openMic, type Mic, type MicError } from '../core/mic'
import { Phrase, voiceOf, envelope, type VoiceStyle } from '../core/voicefx'
import { visible } from '../core/hand'

/* 🦜 L'ANIMAL QUI RÉPÈTE (5/10, Créer) — un animal de la ferme, assis sur
   une botte de foin au milieu de l'enclos, redit ce qu'on lui dit avec sa
   voix à lui : le poussin accéléré, le cochon aigu qui finit en grognant,
   la vache grave, le mouton qui chevrote, le canard nasillard, le chat.
   Rien à lire, rien à toucher pour parler : on parle, il tend l'oreille
   (des ondes de chaque côté de sa tête) ; on se tait, il répète, la bouche
   suit le son. « À l'envers » le fait répéter à l'envers. Le toucher le
   chatouille.

   Rien n'est gardé (règle 3) : la phrase reste en mémoire le temps de la
   répéter, la suivante l'écrase, tout part au démontage ; rien sur le
   disque, rien ne quitte la tablette. Le micro ne s'ouvre que dans ce jeu
   et se coupe en pause (onglet caché, minuteur parental) et en sortant.
   Il n'écoute pas pendant qu'il parle (il se répéterait en boucle). */

interface Voice {
  name: string
  /** Taille de construction (la hauteur à l'écran est ensuite égalisée). */
  S: number
  style: VoiceStyle
  /** Les filtres posés à la lecture. */
  filters: { type: BiquadFilterType; f: number; q?: number; gain?: number }[]
  /** Son vrai cri, à la fin de la phrase (le poussin n'en a pas). */
  cry?: AnimalVoice
  /** La bouche : centre et demi-tailles, en unités de construction (devant = +z). */
  mouth: [number, number, number, number, number, number]
}

const VOICES: Partial<Record<CritterKind, Voice>> = {
  chick: { name: 'Poussin', S: 0.8, style: { pitch: 0, speed: 1.55 }, filters: [{ type: 'highpass', f: 280 }], mouth: [0, 0.625, 0.33, 0.055, 0.03, 0.03] },
  pig: { name: 'Cochon', S: 0.8, style: { pitch: 5, speed: 1.05 }, filters: [{ type: 'peaking', f: 1500, q: 1, gain: 4 }], cry: 'cochon', mouth: [0, 0.36, 0.385, 0.13, 0.075, 0.06] },
  cow: { name: 'Vache', S: 0.78, style: { pitch: -6, speed: 0.88 }, filters: [{ type: 'lowshelf', f: 220, gain: 5 }], cry: 'vache', mouth: [0, 0.28, 0.46, 0.13, 0.06, 0.05] },
  sheep: { name: 'Mouton', S: 0.8, style: { pitch: 3, speed: 1, vibrato: { rate: 7, depth: 1.1 } }, filters: [{ type: 'peaking', f: 1100, q: 1, gain: 3 }], cry: 'mouton', mouth: [0, 0.48, 0.43, 0.07, 0.04, 0.035] },
  duck: { name: 'Canard', S: 0.84, style: { pitch: 4, speed: 1.08 }, filters: [{ type: 'highpass', f: 550 }, { type: 'peaking', f: 1400, q: 2, gain: 9 }], cry: 'canard', mouth: [0, 0.655, 0.47, 0.075, 0.025, 0.06] },
  cat: { name: 'Chat', S: 0.84, style: { pitch: 7, speed: 1, vibrato: { rate: 5, depth: 0.4 } }, filters: [{ type: 'peaking', f: 2200, q: 1, gain: 3 }], cry: 'chat', mouth: [0, 0.66, 0.33, 0.055, 0.035, 0.03] }
}
const KINDS = Object.keys(VOICES) as CritterKind[]
/** La hauteur de chaque animal à l'écran (unités de scène) : tous pareils. */
const HEIGHT = 0.7
/** Le dessus de la botte de foin, et sa place dans l'enclos. */
const SEAT = { y: 0.46, z: 0.9 }

type Phase = 'load' | 'nomic' | 'listen' | 'hear' | 'talk'

interface Pet {
  kind: CritterKind
  c: Critter
  v: Voice
  /** La bouche (sombre + langue), qui s'ouvre avec le son. */
  mouth: import('three').Group
  /** Échelle de base (hauteur égalisée) et hauteur posé sur la botte. */
  k: number
  y0: number
}

interface State {
  stage: Stage
  T: T3
  kit: CritterKit
  pets: Map<CritterKind, Pet>
  pet: Pet
  /** Celui qui s'en va (on le voit filer) pendant l'arrivée du nouveau. */
  leaving: { pet: Pet; t: number } | null
  arrive: number
  phase: Phase
  phaseT: number
  t: number
  mic: Mic | null
  micErr: MicError | null
  opening: boolean
  det: Phrase | null
  backwards: boolean
  /** La phrase transformée en train d'être jouée, et le volume image par image. */
  play: { src: AudioBufferSourceNode; env: Float32Array; t0: number; dur: number } | null
  /** Le cri de la fin : la bouche s'ouvre et se ferme toute seule. */
  cryT: number
  open: number
  level: number
  tickle: number
  idle: number
  invites: number
  rings: import('three').Mesh[]
  talkArcs: import('three').Mesh[]
  fx: Particles
  ray: import('three').Raycaster
  heard: number
  repeats: number
  /** Les bots : la bouche la plus ouverte vue, et une pose figée (l'affiche). */
  maxOpen: number
  pose: number
}

let me: State | null = null
let ctx: GameContext

const MIC_OFF = `<svg viewBox="0 0 48 48" width="40" height="40"><rect x="17" y="6" width="14" height="24" rx="7" fill="#45362A"/><path d="M11 22a13 13 0 0 0 26 0M24 35v7M17 42h14" fill="none" stroke="#45362A" stroke-width="3.5" stroke-linecap="round"/><path d="M8 8l32 32" stroke="#E8574C" stroke-width="4.5" stroke-linecap="round"/></svg>`
const BACKWARDS = `<svg viewBox="0 0 48 48" width="36" height="36"><path d="M34 14H18a10 10 0 0 0 0 20h14" fill="none" stroke="#45362A" stroke-width="4.5" stroke-linecap="round"/><path d="M27 7l8 7-8 7" fill="none" stroke="#45362A" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 40l-5-6 5-6" fill="none" stroke="#FF6B81" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`

const KEY = 'ferme:repete:animal'
const lastKind = (): CritterKind => {
  try { const k = localStorage.getItem(KEY) as CritterKind | null; if (k && VOICES[k]) return k } catch { /* rien */ }
  return 'pig'
}

/** La bouche d'un animal : un ovale sombre et une langue, posés sur sa face. */
function makeMouth(T: T3, c: Critter, v: Voice, sph: import('three').BufferGeometry, mats: { dark: import('three').Material; tongue: import('three').Material }) {
  const S = v.S
  const [x, y, z, w, h, d] = v.mouth
  const g = new T.Group()
  g.position.set(x * S, y * S, z * S)
  const m = new T.Mesh(sph, mats.dark)
  m.scale.set(w * S, h * S, d * S)
  g.add(m)
  const t = new T.Mesh(sph, mats.tongue)
  t.position.set(0, -h * S * 0.35, d * S * 0.45)
  t.scale.set(w * S * 0.6, h * S * 0.45, d * S * 0.55)
  g.add(t)
  g.scale.y = 0.05
  g.visible = false
  c.obj.add(g)
  return g
}

/** Ses ondes : de chaque côté de la tête quand il écoute, devant la bouche quand il parle. */
function makeRings(T: T3, stage: Stage) {
  const rings: import('three').Mesh[] = [], talk: import('three').Mesh[] = []
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const m = new T.Mesh(new T.TorusGeometry(0.3 + i * 0.07, 0.012, 8, 40, Math.PI * 0.42),
      new T.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0, depthWrite: false }))
    m.userData = { side, i }
    m.renderOrder = 5
    stage.scene.add(m)
    rings.push(m)
  }
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const m = new T.Mesh(new T.TorusGeometry(0.4 + i * 0.07, 0.012, 8, 32, Math.PI * 0.3),
      new T.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0, depthWrite: false }))
    m.userData = { side, i }
    m.renderOrder = 5
    stage.scene.add(m)
    talk.push(m)
  }
  return { rings, talk }
}

function setPhase(s: State, p: Phase) {
  s.phase = p
  s.phaseT = 0
  ctx.root.querySelector('.ar-wrap')?.setAttribute('data-phase', p)
}

/* ---------- Le micro ---------- */

async function startMic(s: State) {
  if (s.mic || s.opening || !ctx.alive()) return
  s.opening = true
  try {
    const mic = await openMic(x => onChunk(s, x), { raw: !!(window as unknown as { __BOT?: boolean }).__BOT })
    if (!ctx.alive() || me !== s) { mic.stop(); return }
    s.mic = mic
    s.micErr = null
    s.det = new Phrase({ sr: mic.sr })
    ctx.root.querySelector('.ar-wrap')?.classList.remove('nomic')
    if (s.phase === 'load' || s.phase === 'nomic') setPhase(s, 'listen')
  } catch (e) {
    s.micErr = typeof e === 'string' ? e as MicError : 'autre'
    ctx.root.querySelector('.ar-wrap')?.classList.add('nomic')
    setPhase(s, 'nomic')
  } finally {
    s.opening = false
  }
}

function stopMic(s: State) {
  s.mic?.stop()
  s.mic = null
  s.det?.reset()
  s.det = null
}

function onChunk(s: State, x: Float32Array) {
  if (me !== s || !s.det) return
  // Il n'écoute que quand il n'est pas en train de parler
  if (s.phase !== 'listen' && s.phase !== 'hear') return
  const e = s.det.push(x)
  s.level = s.det.level
  if (!e) return
  if (e.type === 'start') { setPhase(s, 'hear'); s.idle = 0; s.invites = 0 }
  else if (e.type === 'drop') setPhase(s, 'listen')
  else {
    s.heard++
    say(s, e.samples)
  }
}

/** Il répète : la phrase transformée, ses filtres, puis son cri. */
function say(s: State, x: Float32Array) {
  const ac = getCtx()
  const sr = s.det?.sr ?? ac?.sampleRate ?? 48000
  s.det?.reset()
  if (!ac) { setPhase(s, 'listen'); return }
  const y = voiceOf(x, sr, s.pet.v.style, s.backwards)
  const buf = ac.createBuffer(1, y.length, sr)
  buf.copyToChannel(y as Float32Array<ArrayBuffer>, 0)
  const src = ac.createBufferSource()
  src.buffer = buf
  let node: AudioNode = src
  for (const f of s.pet.v.filters) {
    const b = ac.createBiquadFilter()
    b.type = f.type; b.frequency.value = f.f
    if (f.q) b.Q.value = f.q
    if (f.gain) b.gain.value = f.gain
    node.connect(b); node = b
  }
  const g = ac.createGain()
  g.gain.value = isSoundOn() ? 0.95 : 0
  node.connect(g); g.connect(ac.destination)
  const t0 = ac.currentTime + 0.05
  src.start(t0)
  s.play = { src, env: envelope(y, sr, 60), t0, dur: y.length / sr }
  s.repeats++
  setPhase(s, 'talk')
  src.onended = () => {
    if (me !== s || s.play?.src !== src) return
    s.play = null
    const v = s.pet.v.cry
    if (v && cry(v, { max: 1.1, vol: 0.75 })) s.cryT = 0.9
    // Un souffle avant de rouvrir l'oreille : sa propre fin de phrase ne compte pas
    ctx.after(v ? 1000 : 300, () => { if (me === s && s.phase === 'talk') { s.det?.reset(); setPhase(s, 'listen') } })
  }
}

/* ---------- Les animaux ---------- */

function buildPet(s: State, kind: CritterKind, sph: import('three').BufferGeometry, mats: { dark: import('three').Material; tongue: import('three').Material }): Pet {
  const { T } = s
  const v = VOICES[kind]!
  const c = s.kit.make(kind, v.S)
  const box = new T.Box3().setFromObject(c.obj)
  const k = HEIGHT / Math.max(0.1, box.max.y - box.min.y)
  c.obj.scale.setScalar(k)
  c.obj.position.set(0, SEAT.y - box.min.y * k, SEAT.z)
  c.obj.rotation.y = Math.PI
  c.obj.traverse(o => { o.userData.pet = kind })
  const mouth = makeMouth(T, c, v, sph, mats)
  c.obj.visible = false
  s.stage.scene.add(c.obj)
  return { kind, c, v, mouth, k, y0: c.obj.position.y }
}

function choose(s: State, kind: CritterKind) {
  if (kind === s.pet.kind) return
  const next = s.pets.get(kind)
  if (!next) return
  try { localStorage.setItem(KEY, kind) } catch { /* rien */ }
  // Celui qui parlait se tait
  if (s.play) { try { s.play.src.stop() } catch { /* fini */ } s.play = null }
  s.leaving = { pet: s.pet, t: 0 }
  s.pet = next
  s.arrive = 0
  next.c.obj.visible = true
  next.mouth.visible = false
  s.det?.reset()
  s.cryT = 0
  s.idle = 0
  if (s.phase === 'talk' || s.phase === 'hear') setPhase(s, s.mic ? 'listen' : 'nomic')
  // Il dit bonjour avec sa voix
  const v = next.v.cry
  if (!v || !cry(v, { max: 0.9, vol: 0.6, delay: 0.25 })) tone(1300, 0.08, 'sine', 0.12, 0.25)
  ctx.root.querySelectorAll<HTMLElement>('.ar-pick').forEach(b => b.classList.toggle('sel', b.dataset.k === kind))
}

/* ---------- Chaque image ---------- */

function frame(s: State, dt: number) {
  s.t += dt
  s.phaseT += dt
  const { pet } = s
  const o = pet.c.obj
  s.kit.blink(pet.c, dt)

  // La bouche : le volume de la phrase jouée, ou le cri de la fin
  let open = 0
  if (s.play) {
    const ac = getCtx()
    const at = ac ? (ac.currentTime - s.play.t0) * 60 : 0
    open = at >= 0 && at < s.play.env.length ? s.play.env[Math.floor(at)] : 0
  } else if (s.cryT > 0) {
    s.cryT -= dt
    open = Math.max(0, Math.sin((0.9 - s.cryT) * Math.PI * 3.3)) * 0.8
  }
  if (s.pose) open = s.pose
  s.open += (open - s.open) * Math.min(1, dt * 22)
  s.maxOpen = Math.max(s.maxOpen, s.open)
  pet.mouth.visible = s.open > 0.04
  pet.mouth.scale.y = 0.15 + s.open * 1.1

  // Le corps : il respire ; il se penche pour écouter ; il rebondit en parlant
  const hearing = s.phase === 'hear' ? 1 : 0
  s.level += ((s.phase === 'hear' ? (s.det?.level ?? 0) : 0) - s.level) * Math.min(1, dt * 10)
  const breathe = Math.sin(s.t * 2.2) * 0.012
  const bounce = s.open * 0.06
  // L'arrivée : il saute sur la botte
  s.arrive = Math.min(1, s.arrive + dt * 2.6)
  const a = s.arrive, pop = a < 1 ? Math.sin(a * Math.PI) * 0.18 : 0
  const ease = 1 - Math.pow(1 - a, 3)
  const tk = s.tickle > 0 ? Math.sin(s.tickle * 38) * 0.12 * Math.min(1, s.tickle * 2) : 0
  if (s.tickle > 0) s.tickle = Math.max(0, s.tickle - dt)
  o.scale.set(pet.k * ease * (1 + bounce * 0.4 - breathe * 0.5), pet.k * ease * (1 + breathe + bounce), pet.k * ease * (1 + bounce * 0.4 - breathe * 0.5))
  o.position.y = pet.y0 + pop + bounce * 0.05
  o.rotation.z = 0.14 * hearing + 0.05 * s.level + tk
  o.rotation.x = -0.1 * hearing
  o.rotation.y = Math.PI + Math.sin(s.t * 0.45) * 0.12 * (1 - hearing)

  // Celui qui s'en va : il rapetisse et disparaît
  if (s.leaving) {
    s.leaving.t += dt * 3
    const L = s.leaving.pet
    L.c.obj.scale.setScalar(L.k * Math.max(0.001, 1 - s.leaving.t))
    if (s.leaving.t >= 1) { L.c.obj.visible = false; L.mouth.visible = false; s.leaving = null }
  }

  // Les ondes d'écoute : faibles quand il attend, fortes quand on lui parle
  const head = new s.T.Vector3(o.position.x, o.position.y + HEIGHT * 0.62, o.position.z)
  const cam = s.stage.camera.position
  const waiting = s.phase === 'listen' ? 0.18 + Math.sin(s.t * 2.4) * 0.08 : 0
  for (const r of s.rings) {
    const { side, i } = r.userData as { side: number; i: number }
    r.position.copy(head)
    r.lookAt(cam)
    r.rotateZ(side > 0 ? -Math.PI * 0.21 : Math.PI * 0.79)
    const lv = hearing ? 0.35 + s.level * 0.9 : waiting
    const wave = 0.5 + 0.5 * Math.sin(s.t * 9 - i * 1.3)
    ;(r.material as import('three').MeshBasicMaterial).opacity = Math.min(0.95, lv * (1 - i * 0.22) * (hearing ? 0.7 + 0.3 * wave : 1))
    r.scale.setScalar(1 + (hearing ? s.level * 0.25 : 0))
  }
  // Quand il parle : des ondes qui partent de chaque côté, à hauteur de bouche
  const mouthW = new s.T.Vector3()
  pet.mouth.getWorldPosition(mouthW)
  for (const r of s.talkArcs) {
    const { side, i } = r.userData as { side: number; i: number }
    r.position.set(o.position.x, mouthW.y, o.position.z)
    r.lookAt(cam)
    r.rotateZ(side > 0 ? -Math.PI * 0.15 : Math.PI * 0.85)
    const go = (s.t * 1.4 + i / 3) % 1
    ;(r.material as import('three').MeshBasicMaterial).opacity = Math.min(0.9, s.open * 1.5) * (1 - go)
    r.scale.setScalar(0.9 + go * 0.35)
  }

  // Il attend depuis longtemps : il invite à parler (son cri, tout doux), trois fois au plus
  if (s.phase === 'listen') {
    s.idle += dt
    if (s.idle > 14 && s.invites < 3) {
      s.idle = 0
      s.invites++
      const v = pet.v.cry
      if (v) cry(v, { max: 0.8, vol: 0.4 })
      s.cryT = 0.9
    }
  }
  s.fx.update(dt)
}

/* ---------- Le toucher : des chatouilles ---------- */

function onTouch(s: State, ev: PointerEvent) {
  const cv = s.stage.renderer.domElement
  const r = cv.getBoundingClientRect()
  const p = new s.T.Vector2((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
  s.ray.setFromCamera(p, s.stage.camera)
  const hit = s.ray.intersectObject(s.pet.c.obj, true)[0]
  if (!hit) return
  s.tickle = 0.9
  s.idle = 0
  const v = s.pet.v.cry
  if (!v || !cry(v, { max: 0.5, vol: 0.55, rate: 1.35 })) [0, 0.09, 0.18].forEach((d, i) => tone(900 + i * 220, 0.07, 'sine', 0.1, d))
  s.fx.burst(hit.point, { count: 18, color: ['#FF6B81', '#FFD34D', '#FFFFFF'], speed: 1.2, spread: 0.9, life: 0.8, size: 0.05, gravity: -1.5 })
}

export const parrot: GameDef = {
  id: 'parrot', name: "L'Animal qui répète", icon: '🦜', sq: 'sq-peach', cat: 'creatif', noTier: true,
  subtitle: 'Parle-lui : il répète avec sa voix rigolote',
  // La main : « l'un de ceux-là », les animaux à choisir (parler, elle ne peut pas le montrer)
  hand: root => {
    if (!me || (me.phase !== 'listen' && me.phase !== 'nomic')) return null
    if (me.phase === 'nomic') { const b = root.querySelector('.ar-mic'); return b ? { tap: b } : null }
    return { choose: visible(root, '.ar-pick').filter(b => !b.classList.contains('sel')).slice(0, 3) }
  },
  mount(c) {
    ctx = c
    let dead = false
    const first = lastKind()
    c.root.innerHTML = `
      <div class="arena g3-arena ar-wrap" id="arWrap" data-phase="load">
        <div class="ar-tray" id="arTray">${KINDS.map(k => `<span class="tool-item"><button class="sn-tool ar-pick${k === first ? ' sel' : ''}" data-k="${k}" aria-label="${VOICES[k]!.name}"></button><i class="tool-cap">${VOICES[k]!.name}</i></span>`).join('')}</div>
        <span class="tool-item ar-revitem"><button class="sn-tool ar-rev" id="arRev" aria-label="À l'envers">${BACKWARDS}</button><i class="tool-cap">À l'envers</i></span>
        <button class="ar-mic" id="arMic" aria-label="Micro">${MIC_OFF}</button>
      </div>`
    const arena = c.root.querySelector<HTMLElement>('#arWrap')!
    preloadCries(KINDS.map(k => VOICES[k]!.cry).filter((v): v is AnimalVoice => !!v))
    // Les portraits des boutons (rendus une fois, gardés)
    critterPortraits(KINDS, 112).then(pics => {
      if (dead) return
      c.root.querySelectorAll<HTMLElement>('.ar-pick').forEach(b => { b.innerHTML = portraitImg(pics[b.dataset.k!], 72) })
    }).catch(() => { /* sans portraits, les boutons restent ronds */ })

    const hideLoader = loader(arena, 'parrot')
    ;(async () => {
      const stage = await createStage(arena, {
        sky: '#9ED4F2', fov: 36, cam: [0, 1.05, -1.42], target: [0, 0.8, 0.85],
        hemi: ['#DCEFFF', '#5E8A44', 1.0],
        sun: { pos: [6.5, 14, -7], color: '#FFF0D2', intensity: 2.3, area: 6, far: 45 },
        fill: 0.5, exposure: 1.0, fog: [9, 26]
      })
      if (dead) { stage.dispose(); return }
      const T = stage.T
      const farm = await buildFarm(stage, { night: false })
      if (dead || !stage.alive) { stage.dispose(); return }
      // Derrière lui : la meule et le pommier (la porte noire de la grange reste de côté)
      farm.root.rotation.y = -52 * Math.PI / 180
      const bale = farm.bale()
      bale.position.set(0, 0.23, SEAT.z)
      bale.rotation.y = Math.PI / 2 + 0.06
      stage.scene.add(bale)
      const kit = critterKit(T, { fine: true })
      const sph = stage.keep(new T.SphereGeometry(1, 32, 20))
      const mats = {
        dark: stage.keep(new T.MeshStandardMaterial({ color: 0x4A1E24, roughness: 0.6 })),
        tongue: stage.keep(new T.MeshStandardMaterial({ color: 0xE0607A, roughness: 0.5 }))
      }
      const { rings, talk } = makeRings(T, stage)
      const s: State = {
        stage, T, kit, pets: new Map(), pet: null as unknown as Pet, leaving: null, arrive: 0,
        phase: 'load', phaseT: 0, t: 0, mic: null, micErr: null, opening: false, det: null, backwards: false,
        play: null, cryT: 0, open: 0, level: 0, tickle: 0, idle: 0, invites: 0,
        rings, talkArcs: talk, fx: particles(stage, 200), ray: new T.Raycaster(), heard: 0, repeats: 0, maxOpen: 0, pose: 0
      }
      for (const k of KINDS) s.pets.set(k, buildPet(s, k, sph, mats))
      s.pet = s.pets.get(first)!
      s.pet.c.obj.visible = true
      me = s
      hideLoader()
      stage.start(dt => { if (me === s) frame(s, dt) })
      setPhase(s, 'load')
      startMic(s)

      // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __ar: unknown }).__ar = {
          get phase() { return me?.phase ?? 'gone' },
          get kind() { return me?.pet.kind },
          get heard() { return me?.heard ?? 0 },
          get repeats() { return me?.repeats ?? 0 },
          get backwards() { return me?.backwards },
          get micLive() { return !!me?.mic },
          get micErr() { return me?.micErr ?? null },
          get open() { return me?.open ?? 0 },
          get maxOpen() { return me?.maxOpen ?? 0 },
          /** L'affiche : cet animal, la bouche ouverte, en pleine phrase. */
          pose(kind: CritterKind, open = 0.8) { if (me) { choose(me, kind); me.arrive = 1; me.pose = open } }
        }
      }
    })().catch(() => { hideLoader(); ctx.toast('La 3D n\'est pas disponible ici') })

    // Choisir l'animal, « à l'envers », réessayer le micro
    const onClick = (e: MouseEvent) => {
      const s = me
      if (!s) return
      const t = e.target as HTMLElement
      const pick = t.closest<HTMLElement>('.ar-pick')
      if (pick?.dataset.k) { choose(s, pick.dataset.k as CritterKind); return }
      if (t.closest('#arRev')) {
        s.backwards = !s.backwards
        c.root.querySelector('#arRev')?.classList.toggle('on', s.backwards)
        tone(s.backwards ? 520 : 780, 0.08, 'triangle', 0.12); tone(s.backwards ? 390 : 1040, 0.1, 'triangle', 0.12, 0.07)
        return
      }
      if (t.closest('#arMic')) startMic(s)
    }
    c.root.addEventListener('click', onClick)
    const onDown = (e: PointerEvent) => { if (me && e.target === me.stage.renderer.domElement) onTouch(me, e) }
    c.root.addEventListener('pointerdown', onDown)
    // Pause (onglet caché, minuteur parental, bouton) : le micro se coupe pour de bon
    const offPause = onPause(p => {
      const s = me
      if (!s) return
      if (p) {
        stopMic(s)
        if (s.play) { try { s.play.src.stop() } catch { /* fini */ } s.play = null }
        if (s.phase !== 'nomic') setPhase(s, 'load')
      } else if (s.phase !== 'nomic') startMic(s)
    })

    return () => {
      if (dead) return
      dead = true
      offPause()
      c.root.removeEventListener('click', onClick)
      c.root.removeEventListener('pointerdown', onDown)
      const s = me
      me = null
      if (s) {
        stopMic(s)
        if (s.play) { try { s.play.src.stop() } catch { /* fini */ } s.play = null }
        s.kit.dispose()
        try { s.stage.dispose() } catch { /* déjà démonté */ }
      }
      const w = window as unknown as { __ar?: { phase: string } }
      if (w.__ar) w.__ar = { phase: 'gone', micLive: false } as unknown as { phase: string }
    }
  }
}
