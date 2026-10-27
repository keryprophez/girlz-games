import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { arcade, type Arcade } from '../core/arcade'
import { ICON } from '../core/icons'
import { sfx, preloadSfx, cry, preloadCries, CRY } from '../core/sfx'
import { tone } from '../core/audio'
import { setMusicIntensity } from '../core/music'
import { confetti } from '../core/fx'
import { createStage, loader, type Stage, type T3 } from '../core/three3d'
import { particles, camShake, toScreen, type Particles, type CamShake } from '../core/scene3d'
import { critterKit, type Critter, type CritterKit, type CritterKind } from '../core/critters'
import { buildFarm, scarecrowKit, type Farm, type PieceId } from '../core/farm3d'
import { Race, soleilCfg, V_CAUGHT, type SoleilEvent } from '../core/soleil'

/* ☀️ 1, 2, 3… SOLEIL ! (27/10, choisi par le père) — le jeu de cour, à la ferme.

   Au bout du chemin, l'ÉPOUVANTAIL de la ferme (`scarecrowKit` de
   core/farm3d.ts) tourne sur son piquet. Dos tourné, il compte : trois coups
   de tambour, pas un mot (et trois ronds qui s'allument en haut, pour qui
   n'entend pas) ; puis il se retourne, ses yeux s'allument, il REGARDE.
   - Le geste (`hold`, nouveau geste de la main) : le doigt posé n'importe
     où, le chat avance ; levé, il s'arrête en glissant un peu — l'élan fait
     la tension (la course elle-même est dans core/soleil.ts, pure et testée).
   - Pris en train de bouger quand il regarde : le chat recule de quelques
     mètres en sautillant, un cœur s'en va (trois cœurs pour la partie).
     S'arrêter au tout dernier moment : le « ouf », un ralenti.
   - La rampe suit la joueuse (un cran tous les deux arrêts réussis) : il
     compte plus vite, se retourne plus vite, fait des feintes (il se
     retourne à moitié et revient) ; le cochon et le mouton courent aussi
     (eux aussi se font prendre, avec leur vraie voix) ; à la flamme, des
     flaques de boue font glisser.
   - On gagne en touchant le dos de l'épouvantail : il sursaute, tous les
     animaux font la fête. Si le cochon ou le mouton y arrive d'abord, c'est
     sa fête à lui. Trois courses par partie ; l'outro : la grande fête de
     la dernière course, la caméra qui tourne autour. */

type Mesh = import('three').Mesh
type Group = import('three').Group

const PLAYER: CritterKind = 'cat'
const AI_KINDS: CritterKind[] = ['pig', 'sheep']
const SIZE: Partial<Record<CritterKind, number>> = { cat: 0.66, pig: 0.78, sheep: 0.82 }
/** La piste : le départ, le dos de l'épouvantail (z monde), l'épouvantail lui-même. */
const Z0 = 6.1, Z1 = -3.45, ZS = -4.0
const LANES = [0, -1.25, 1.25]
const RACES = 3
const OUTRO_MS = 3400

interface Runner3 {
  c: Critter
  kind: CritterKind
  lane: number
  ph: number
  /** Fête : temps restant (s). Triste : la tête basse. */
  party: number
  sad: number
  /** Le saut de surprise quand il est pris. */
  jolt: number
}

interface State {
  stage: Stage
  T: T3
  farm: Farm
  kit: CritterKit
  sc: { g: Group; body: Group; eyes: Mesh[] }
  race: Race
  runners: Runner3[]
  game: Arcade
  tier: 0 | 1 | 2
  /** La course en cours (0..2) et les courses gagnées. */
  n: number
  wins: number
  state: 'intro' | 'run' | 'party' | 'over'
  holding: Set<number>
  key: boolean
  fx: Particles
  shake: CamShake
  mud: Mesh[]
  mudMat: import('three').MeshStandardMaterial
  ring: Mesh
  camZ: number
  /** Le ralenti du « ouf » (s réelles), le sursaut de l'épouvantail, son rire (pris). */
  slow: number
  jump: number
  laugh: number
  t: number
  dots: HTMLElement
  flags: HTMLElement
  outroT: number
}

let so: State | null = null
let ctx: GameContext

/** La position monde d'un coureur. */
const zOf = (me: State, x: number) => Z0 - x / me.race.cfg.L * (Z0 - Z1)

/* ---------- Le décor : la ferme sans cour, le chemin, la grange au fond ---------- */
function pathTex(T: T3, L: number) {
  const c = document.createElement('canvas')
  c.width = 256; c.height = 1024
  const g = c.getContext('2d')!
  // Terre battue, plus claire au milieu, qui se fond dans l'herbe sur les bords
  const grd = g.createLinearGradient(0, 0, 256, 0)
  grd.addColorStop(0, 'rgba(120,88,52,0)')
  grd.addColorStop(0.12, 'rgba(120,88,52,.95)')
  grd.addColorStop(0.5, 'rgba(150,114,72,1)')
  grd.addColorStop(0.88, 'rgba(120,88,52,.95)')
  grd.addColorStop(1, 'rgba(120,88,52,0)')
  g.fillStyle = grd; g.fillRect(0, 0, 256, 1024)
  // Le grain : cailloux, mottes, traces de pas
  for (let i = 0; i < 2600; i++) {
    const x = 26 + Math.random() * 204, y = Math.random() * 1024
    g.fillStyle = `rgba(${70 + Math.random() * 60},${50 + Math.random() * 40},${30 + Math.random() * 25},${0.15 + Math.random() * 0.3})`
    g.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 3)
  }
  for (let i = 0; i < 90; i++) {
    const x = 34 + Math.random() * 188, y = Math.random() * 1024
    g.fillStyle = 'rgba(200,180,150,.55)'
    g.beginPath(); g.ellipse(x, y, 2 + Math.random() * 3, 1.5 + Math.random() * 2, Math.random() * 3, 0, 7); g.fill()
  }
  // La ligne de départ, tracée à la craie (en bas de l'image)
  const y0 = 1024 - 1024 * 0.3 / (L + 0.6)
  g.strokeStyle = 'rgba(255,250,235,.9)'; g.lineWidth = 9; g.setLineDash([22, 12])
  g.beginPath(); g.moveTo(30, y0); g.lineTo(226, y0); g.stroke()
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  t.anisotropy = 4
  return t
}

type Base = Pick<State, 'stage' | 'T' | 'farm' | 'kit' | 'sc' | 'fx' | 'shake' | 'mud' | 'mudMat' | 'ring'>

async function buildScene(stage: Stage): Promise<Base> {
  const { T } = stage
  const farm = await buildFarm(stage, { night: false, empty: true })
  farm.root.rotation.y = 0
  // Les constructions autour de la piste (jamais dessus : |x| < 2,2)
  const deco: [PieceId, number, number, number][] = [
    ['barn', -2.9, -5.5, 0.42], ['appleTree', 3.1, -5.0, 0], ['haystack', 4.6, -1.6, -0.9], ['bales', -3.7, 1.1, 1.2],
    ['bush', -4.9, -2.5, 0], ['coop', -5.4, 3.0, 1.6], ['well', 4.4, 3.9, -1.2], ['bush', 5.3, 4.6, 0],
    ['woodpile', -3.0, -2.2, 1.4], ['kennel', 5.6, 1.0, -1.9], ['bush', 2.9, -2.7, 0]
  ]
  for (const [id, x, z, r] of deco) {
    const p = farm.make(id)
    p.g.position.set(x, 0, z)
    p.g.rotation.y = r
    farm.root.add(p.g)
  }
  // Le chemin de terre, de la ligne de départ au pied de l'épouvantail
  const L = Z0 - ZS + 0.9
  const ptex = stage.keep(pathTex(T, L))
  const path = new T.Mesh(new T.PlaneGeometry(4.0, L + 0.6), new T.MeshStandardMaterial({ map: ptex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }))
  path.rotation.x = -Math.PI / 2
  path.position.set(0, 0.008, (Z0 + 0.3 + ZS - 0.6) / 2 + 0.3)
  path.receiveShadow = true
  farm.root.add(path)
  // Les flaques de boue (flamme) : posées à chaque course
  const mudMat = stage.keep(new T.MeshStandardMaterial({ color: 0x5A3418, roughness: 0.22, metalness: 0.05 }))
  const sk = await scarecrowKit(T, stage)
  const sc = sk.g
  sc.position.set(0, 0, ZS)
  sc.scale.setScalar(1.5)
  farm.root.add(sc)
  // Ses yeux qui s'allument quand il regarde
  const eyeMat = new T.MeshBasicMaterial({ color: 0xFFE070, toneMapped: false })
  const eyes = [-1, 1].map(s => {
    const e = new T.Mesh(new T.SphereGeometry(1, 12, 8), eyeMat)
    e.position.set(s * 0.06, 1.75, 0.165)
    e.scale.setScalar(0.001)
    sk.body.add(e)
    return e
  })
  sk.body.rotation.y = Math.PI
  // L'anneau doré sous le chat de la joueuse
  const ring = new T.Mesh(new T.RingGeometry(0.42, 0.52, 40), new T.MeshBasicMaterial({ color: 0xFFC83A, transparent: true, opacity: 0.85, depthWrite: false }))
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.02
  farm.root.add(ring)
  const kit = critterKit(T)
  return { stage, T, farm, kit, sc: { g: sc, body: sk.body, eyes }, fx: particles(stage, 500), shake: camShake(stage), mud: [], mudMat, ring }
}

/* ---------- Les courses ---------- */
function newRace(me: State) {
  const lv = me.game.s.level
  me.race = new Race(soleilCfg(me.tier, lv))
  // Les coureurs : le chat, puis autant d'animaux que la course en veut
  for (const r of me.runners.slice(1)) { me.farm.root.remove(r.c.obj) }
  me.runners = me.runners.slice(0, 1)
  me.race.cfg.ai.forEach((_, i) => {
    const kind = AI_KINDS[i]
    const c = me.kit.make(kind, SIZE[kind] ?? 0.8)
    me.farm.root.add(c.obj)
    me.runners.push({ c, kind, lane: LANES[i + 1], ph: Math.random() * 6, party: 0, sad: 0, jolt: 0 })
  })
  for (const r of me.runners) { r.party = 0; r.sad = 0; r.jolt = 0 }
  // Les flaques de la flamme
  for (const m of me.mud) { me.farm.root.remove(m); m.geometry.dispose() }
  me.mud = me.race.cfg.mud.map(([a, b]) => {
    const z0 = zOf(me, a), z1 = zOf(me, b)
    const m = new me.T.Mesh(new me.T.CircleGeometry(1, 32), me.mudMat)
    m.rotation.x = -Math.PI / 2
    m.scale.set(1.9 + Math.random() * 0.4, Math.abs(z1 - z0) / 2 + 0.15, 1)
    m.position.set((Math.random() - 0.5) * 0.4, 0.014, (z0 + z1) / 2)
    m.receiveShadow = true
    me.farm.root.add(m)
    return m
  })
  me.sc.body.rotation.y = Math.PI
  me.camZ = Z0
  me.state = 'run'
  paintFlags(me)
  paintDots(me)
}

function paintDots(me: State) {
  const r = me.race
  const looking = r.phase === 'look' || r.phase === 'turn'
  me.dots.classList.toggle('look', looking)
  me.dots.querySelectorAll<HTMLElement>('i').forEach((d, i) => d.classList.toggle('on', !looking && i < r.beats))
}

function paintFlags(me: State) {
  me.flags.querySelectorAll<HTMLElement>('i').forEach((f, i) => {
    f.className = i < me.n ? (f.dataset.won === '1' ? 'won' : 'lost') : i === me.n ? 'now' : ''
  })
}

function onEvents(me: State, ev: SoleilEvent[]) {
  for (const e of ev) {
    if (e.t === 'beat') {
      // Le tambour : grave, plus haut au troisième coup
      const third = e.n === 3
      sfx('bong', { rate: third ? 0.86 : 0.6, vol: third ? 0.85 : 0.7, spread: 0 })
      tone(third ? 98 : 73, 0.22, 'sine', 0.3)
      me.jump = Math.max(me.jump, 0.18)
    } else if (e.t === 'feint') {
      sfx('whoosh', { rate: 0.8, vol: 0.4 })
    } else if (e.t === 'turn') {
      sfx('whoosh', { rate: 1.05, vol: 0.55 })
    } else if (e.t === 'look') {
      tone(880, 0.12, 'triangle', 0.12)
    } else if (e.t === 'caught') {
      const r = me.runners[e.who]
      r.jolt = 0.5
      me.laugh = 0.9
      const p = r.c.obj.position
      me.fx.burst({ x: p.x, y: 0.7, z: p.z }, { count: 16, color: ['#FF6B6B', '#FFD34D'], speed: 2.4, life: 0.6, size: 0.12 })
      if (e.who === 0) {
        me.shake.hit(0.35)
        cry('chat', { vol: 0.8, rate: 1.1 })
        const dead = me.game.hurt()
        if (dead) gameOver(me)
      } else {
        const v = CRY[r.kind]
        if (v) cry(v, { vol: 0.7 })
      }
    } else if (e.t === 'safe') {
      if (e.moved) me.game.hit(1)
    } else if (e.t === 'ouf') {
      // Le « ouf » : un ralenti, une goutte de sueur, un petit souffle
      me.slow = 0.75
      me.game.hit(2, { perfect: true })
      me.game.flash(`<span class="so-ouf">${ICON.heart}</span>`, 'so-flash')
      const p = me.runners[0].c.obj.position
      me.fx.burst({ x: p.x, y: 0.9, z: p.z }, { count: 10, color: ['#9ED8FF', '#FFFFFF'], speed: 1.4, life: 0.8, size: 0.1, gravity: 3 })
      sfx('whoosh', { rate: 0.55, vol: 0.5 })
    } else if (e.t === 'win') {
      raceOver(me, e.who)
    }
  }
}

function raceOver(me: State, who: number) {
  me.state = 'party'
  me.jump = 0.9
  me.flags.querySelectorAll<HTMLElement>('i')[me.n].dataset.won = who === 0 ? '1' : '0'
  me.n++
  const winner = me.runners[who]
  winner.party = 3
  if (who === 0) {
    me.wins++
    me.game.hit(5, { perfect: true })
    // Tout le monde fait la fête avec elle
    for (const r of me.runners) r.party = 3
    cry('chat', { vol: 0.9 })
    sfx('confirm', { vol: 0.8 })
    const p = me.sc.g.position
    me.fx.burst({ x: p.x, y: 2.4, z: p.z }, { count: 60, color: ['#FFD34D', '#FF6B81', '#5EC97B', '#4FB8E7', '#B197FC'], speed: 4, life: 1.4, size: 0.14 })
    if (me.n < RACES) confetti()
  } else {
    // Le cochon (ou le mouton) touche le dos d'abord : c'est sa fête à lui
    me.game.miss()
    me.runners[0].sad = 2.4
    const v = CRY[winner.kind]
    if (v) cry(v, { vol: 0.85 })
    sfx('drop', { vol: 0.5 })
  }
  paintFlags(me)
  if (me.n >= RACES) {
    me.state = 'over'
    for (const r of me.runners) r.party = 9
    if (who !== 0) me.runners[0].sad = 0
    confetti()
    const w = me.wins
    me.game.end({
      title: w === RACES ? 'Touché, touché, touché !' : w > 0 ? 'Touché !' : 'Encore une fois ?',
      msg: w === RACES ? 'Trois courses, trois fois au but' : w > 0 ? `${w} course${w > 1 ? 's' : ''} gagnée${w > 1 ? 's' : ''} sur trois` : 'Le cochon et le mouton ont été plus rapides',
      outroMs: OUTRO_MS
    })
    return
  }
  ctx.after(2600, () => { if (so === me && me.state === 'party') { resetRunners(me); newRace(me) } })
}

function gameOver(me: State) {
  me.state = 'over'
  me.laugh = 3
  me.runners[0].sad = 9
  me.game.end({ title: 'Il t\'a vue !', msg: me.wins ? `${me.wins} course${me.wins > 1 ? 's' : ''} gagnée${me.wins > 1 ? 's' : ''}, mais plus de cœurs` : 'Plus de cœurs : il a l\'œil, cet épouvantail', outroMs: 2200 })
}

function resetRunners(me: State) {
  me.runners.forEach(r => { r.party = 0; r.sad = 0; r.jolt = 0 })
  me.holding.clear()
  me.key = false
}

/* ---------- La boucle ---------- */
function step(me: State, dt: number) {
  me.t += dt
  const realDt = dt / Math.max(0.05, me.stage.timeScale)
  if (me.slow > 0) { me.slow = Math.max(0, me.slow - realDt); me.stage.timeScale = me.slow > 0 ? 0.3 : 1 }
  me.game.tick(dt)
  const r = me.race
  if (me.state === 'run') {
    r.setHold(me.holding.size > 0 || me.key)
    onEvents(me, r.step(dt))
    paintDots(me)
  }
  // L'épouvantail : il tourne sur son piquet ; il saute à chaque coup ; il rit d'un animal pris
  const body = me.sc.body
  const face = me.state === 'run' ? r.face : me.state === 'over' && me.wins === 0 ? 1 : 0
  body.rotation.y = Math.PI * (1 - face)
  for (const e of me.sc.eyes) e.scale.setScalar(face > 0.95 ? 0.045 + Math.sin(me.t * 12) * 0.006 : 0.001)
  me.jump = Math.max(0, me.jump - dt)
  me.laugh = Math.max(0, me.laugh - dt)
  const hop = me.state === 'party' || me.state === 'over'
    ? Math.abs(Math.sin(me.t * 7)) * 0.35 * Math.min(1, me.jump * 2 + (me.state === 'over' ? 1 : 0))
    : Math.sin(Math.min(1, me.jump / 0.18) * Math.PI) * 0.08
  body.position.y = hop
  body.rotation.z = me.laugh > 0 ? Math.sin(me.t * 26) * 0.08 : me.state !== 'run' && me.jump > 0 ? Math.sin(me.t * 18) * 0.12 : 0
  // Les coureurs
  me.runners.forEach((ru, i) => {
    const rr = r.runners[i]
    const o = ru.c.obj
    if (!rr) return
    const z = zOf(me, rr.x)
    o.position.x = ru.lane
    o.position.z = z
    o.rotation.y = Math.PI
    const vk = Math.min(1, rr.v / (r.cfg.vmax || 1))
    ru.ph += dt * (4 + rr.v * 9)
    let y = Math.abs(Math.sin(ru.ph)) * 0.16 * vk
    let lean = vk * 0.22
    // En train de glisser (doigt levé, encore de l'élan) : il se penche en arrière
    if (!rr.hold && rr.v > V_CAUGHT) lean = -0.25 * vk
    if (rr.caught > 0) { y = Math.abs(Math.sin(rr.caught * 10)) * 0.25; lean = -0.3 }
    if (ru.jolt > 0) { ru.jolt = Math.max(0, ru.jolt - dt); y += Math.sin(ru.jolt / 0.5 * Math.PI) * 0.35 }
    if (ru.party > 0) {
      ru.party = Math.max(0, ru.party - dt)
      y = Math.abs(Math.sin(me.t * 8 + i * 1.3)) * 0.45
      o.rotation.y = Math.PI + Math.sin(me.t * 3 + i) * 0.6
      lean = 0
    }
    if (ru.sad > 0) { ru.sad = Math.max(0, ru.sad - dt); lean = 0.35; y = 0 }
    o.position.y = y
    o.rotation.x = -lean
    me.kit.blink(ru.c, dt)
    // De la poussière quand on glisse, de la boue qui gicle dans les flaques
    if (!rr.hold && rr.v > 0.5 && Math.random() < dt * 14) {
      const mud = r.cfg.mud.some(([a, b]) => rr.x >= a && rr.x <= b)
      me.fx.burst({ x: o.position.x, y: 0.05, z: z - 0.2 }, { count: 2, color: mud ? ['#4A2E18', '#6A4426'] : ['#C8A878', '#E6D2B0'], speed: 1.1, life: 0.45, size: 0.09, gravity: 4 })
    }
  })
  // L'anneau doré suit le chat
  const p0 = me.runners[0].c.obj.position
  me.ring.position.x = p0.x; me.ring.position.z = p0.z
  ;(me.ring.material as import('three').MeshBasicMaterial).opacity = 0.6 + Math.sin(me.t * 5) * 0.25
  // La caméra suit le chat, de derrière ; la fin tourne autour de l'épouvantail
  const cam = me.stage.camera
  if (me.state === 'over') {
    me.outroT += dt
    const a = me.outroT * 0.35
    cam.position.set(Math.sin(a) * 6.5, 3.0, ZS + 3.2 + Math.cos(a) * 6.5)
    cam.lookAt(0, 1.1, ZS + 1.4)
  } else {
    const want = Math.max(Z1 + 3.2, Math.min(Z0, p0.z))
    me.camZ += (want - me.camZ) * Math.min(1, dt * 2.2)
    const near = me.slow > 0 ? 0.72 : 1
    cam.position.set(0, 1.2 + 2.1 * near, me.camZ + 5.4 * near)
    cam.lookAt(0, 0.6, me.camZ - 5)
  }
  me.shake.apply(dt)
  me.fx.update(dt)
  me.farm.step(dt, me.t)
}

export const soleil: GameDef = {
  id: 'soleil', name: '1, 2, 3… Soleil !', icon: '☀️', sq: 'sq-sun', cat: 'action', music: 'meadow',
  subtitle: 'Garde le doigt posé pour courir, lève-le quand il se retourne',
  // La main : garder le doigt posé, pendant que l'épouvantail compte de dos
  hand: () => {
    const me = so
    if (!me || me.state !== 'run' || me.holding.size || me.race.runners[0].caught > 0) return null
    if (me.race.phase !== 'count' || me.race.beats >= 2) return null
    return { hold: { fx: 0.5, fy: 0.74 } }
  },
  mount(c) {
    ctx = c
    let dead = false
    const tier = c.byTier<0 | 1 | 2>(0, 1, 2)
    c.root.innerHTML = `
      <div class="arena g3-arena so-arena" id="soArena">
        <div class="so-flags" id="soFlags">${Array.from({ length: RACES }, () => `<i>${ICON.flag}</i>`).join('')}</div>
        <div class="so-dots" id="soDots"><i></i><i></i><i></i><b>${EYE}</b></div>
      </div>`
    const arena = $('soArena')
    const hideLoader = loader(arena, 'soleil')
    preloadSfx(['bong', 'whoosh', 'confirm', 'pluck', 'error', 'drop'])
    preloadCries(['chat', 'cochon', 'mouton'])

    ;(async () => {
      const stage = await createStage(arena, {
        sky: '#9ED4F2', fov: 42, cam: [0, 3.3, Z0 + 5.4], target: [0, 1, 0],
        hemi: ['#DCEFFF', '#5E8A44', 1.0],
        sun: { pos: [5, 11, 6], color: '#FFF0D2', intensity: 2.3, area: 9, far: 40 },
        fill: 0.45, exposure: 1.0
      })
      if (dead) { stage.dispose(); return }
      const base = await buildScene(stage)
      if (dead || !stage.alive) { stage.dispose(); return }
      const game = arcade(c, {
        host: arena,
        lives: 3,
        scoreIcon: ICON.flag,
        ramp: { every: 2, max: 4 },
        stars: s => {
          const w = so?.wins ?? 0
          return w >= 3 && s.lives >= 2 ? 3 : w >= 2 ? 2 : 1
        },
        onLevel: lv => {
          // La course en cours se durcit aussi : il compte et se retourne plus vite
          const me = so
          if (!me) return
          const nc = soleilCfg(me.tier, lv)
          Object.assign(me.race.cfg, { beat: nc.beat, jitter: nc.jitter, turnDur: nc.turnDur, feint: nc.feint })
        }
      })
      const cat = base.kit.make(PLAYER, SIZE[PLAYER] ?? 0.66)
      base.farm.root.add(cat.obj)
      const me: State = {
        ...base, tier, game,
        race: new Race(soleilCfg(tier, 0)),
        runners: [{ c: cat, kind: PLAYER, lane: LANES[0], ph: 0, party: 0, sad: 0, jolt: 0 }],
        n: 0, wins: 0, state: 'intro', holding: new Set(), key: false,
        camZ: Z0, slow: 0, jump: 0, laugh: 0, t: 0,
        dots: $('soDots'), flags: $('soFlags'), outroT: 0
      }
      so = me
      newRace(me)
      hideLoader()

      /* --- Le doigt : posé n'importe où, il court ; levé, il s'arrête. Chaque
         doigt est suivi par son `pointerId` (deux doigts = toujours « posé »). --- */
      const el = stage.renderer.domElement
      const onDown = (e: PointerEvent) => {
        if (so !== me || e.target !== el) return
        me.holding.add(e.pointerId)
      }
      const onUp = (e: PointerEvent) => { me.holding.delete(e.pointerId) }
      const onKey = (e: KeyboardEvent) => {
        if (e.code !== 'Space') return
        e.preventDefault()
        me.key = e.type === 'keydown'
      }
      el.addEventListener('pointerdown', onDown)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      window.addEventListener('keydown', onKey)
      window.addEventListener('keyup', onKey)

      // Accroche pour les bots (scripts/play.mjs) — inerte en production
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __so: unknown }).__so = {
          get state() { return me.state }, get phase() { return me.race.phase }, get beats() { return me.race.beats },
          get pt() { return me.race.pt }, get dur() { return me.race.dur }, get n() { return me.n }, get wins() { return me.wins },
          get lives() { return me.game.s.lives }, get x() { return me.race.runners[0].x }, get v() { return me.race.runners[0].v },
          get caught() { return me.race.runners[0].caught > 0 }, get holding() { return me.holding.size > 0 }, get level() { return me.game.s.level },
          get ai() { return me.race.runners.length - 1 }, get mud() { return me.race.cfg.mud.length },
          /** Le chat à l'écran (pour viser la photo de l'affiche). */
          cat: () => toScreen(stage, me.runners[0].c.obj.position)
        }
      }

      stage.start(dt => { if (so === me) step(me, dt) })
      stage.keep({
        dispose() {
          el.removeEventListener('pointerdown', onDown)
          window.removeEventListener('pointerup', onUp)
          window.removeEventListener('pointercancel', onUp)
          window.removeEventListener('keydown', onKey)
          window.removeEventListener('keyup', onKey)
          me.fx.dispose()
          me.kit.dispose()
          me.game.dispose()
          delete (window as { __so?: unknown }).__so
        }
      })
    })().catch(err => { console.error(err); hideLoader(); ctx.toast('La 3D n\'est pas disponible ici') })

    return () => {
      dead = true
      setMusicIntensity(0)
      const me = so
      so = null
      if (me) { try { me.stage.dispose() } catch { /* déjà démonté */ } }
    }
  }
}

/** L'œil qui s'allume quand l'épouvantail regarde. */
const EYE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12z" fill="#fff"/><circle cx="12" cy="12" r="4.6" fill="#45362A"/><circle cx="13.6" cy="10.4" r="1.5" fill="#fff"/></svg>`
