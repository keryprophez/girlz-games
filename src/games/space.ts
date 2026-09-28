import type { GameContext, GameDef } from '../core/types'
import { shuffle } from '../core/utils'
import { sGood, sNope, sPop, sWin, tone } from '../core/audio'
import { confetti, FX } from '../core/fx'
import { ICON } from '../core/icons'
import { shake } from '../core/juice'
import { createStage, loader, type Stage, type T3 } from '../core/three3d'
import { makeRocket, type Rocket } from '../core/rocket3d'
import { particles, toScreen, type Particles } from '../core/scene3d'
import { makeCosmos, SUN_R, type Cosmos } from '../core/cosmos'

/* Voyage dans l'Espace — refait le 27/09 au niveau de la maquette du père
   (« refais le système solaire à ce niveau de qualité ») : le rendu est dans
   `core/cosmos.ts` (ciel et Voie lactée, Soleil qui bout, Terre de nuit avec
   ses villes, atmosphères, ombres des anneaux, vraies positions du jour, HDR
   et halo lumineux). Ici, le JEU, qui garde tout ce qui marchait :
   - aucune consigne à lire : une colonne de BILLES-PLANÈTES (les vraies
     textures) sert de passeport et de raccourci, une lueur pulse autour d'une
     planète pas encore vue, la voix dit le nom et la merveille (contenu,
     règle 2) ;
   - deux modes : Explore (jusqu'à la fête des huit planètes) et Trouve (la
     voix dit une planète, on la cherche ; au deuxième essai la bonne
     s'illumine — aucune sanction) ;
   - la FUSÉE des filles : dessinée en 3D, la caméra de cinéma la suit dans
     son vol en courbe, et elle se pose à côté de l'astre ;
   - en bonus, les lunes (la Lune, Io, Europe, Ganymède, Callisto, Titan) et
     Pluton se visitent aussi (la fête reste celle des huit planètes) ;
   - le temps file : une tortue et un lièvre, sans un mot, règlent sa vitesse
     (une semaine par seconde au départ, pour que tout bouge) ;
   - on tourne autour au doigt, on pince pour zoomer, taper le ciel ramène au
     système. La qualité baisse toute seule si la tablette peine. */

interface Info { id: string; fact: string; tex: string }

const PLANETS: Info[] = [
  { id: 'mercure', tex: 'mercury.jpg', fact: 'Mercure ! La plus petite planète, et la plus rapide autour du Soleil. Le jour il y fait super chaud, et la nuit super froid.' },
  { id: 'venus', tex: 'venus.jpg', fact: 'Vénus ! La planète la plus chaude de toutes, plus chaude qu\'un four, à cause de ses gros nuages tout épais.' },
  { id: 'terre', tex: 'earth_day.jpg', fact: 'La Terre, c\'est chez nous ! La seule planète avec de l\'eau bleue, des nuages blancs et plein d\'animaux. Regarde, la nuit, les villes s\'allument !' },
  { id: 'mars', tex: 'mars.jpg', fact: 'Mars, la planète rouge ! Elle est couverte de poussière rouge, et des petits robots s\'y promènent pour l\'explorer.' },
  { id: 'jupiter', tex: 'jupiter.jpg', fact: 'Jupiter, la plus GROSSE planète ! Si grande qu\'elle pourrait avaler mille Terres. Elle a une tempête géante toute rouge, et quatre grosses lunes.' },
  { id: 'saturne', tex: 'saturn.jpg', fact: 'Saturne et ses magnifiques anneaux ! Ils sont faits de glace et de cailloux qui brillent dans la lumière du Soleil.' },
  { id: 'uranus', tex: 'uranus.jpg', fact: 'Uranus ! Elle est couchée sur le côté et roule comme une bille. Brrr, c\'est une planète toute bleue et très très froide.' },
  { id: 'neptune', tex: 'neptune.jpg', fact: 'Neptune, la planète la plus loin du Soleil ! Elle est toute bleue, avec les vents les plus rapides de tout le système solaire.' }
]
const BONUS: Info[] = [
  { id: 'soleil', tex: 'sun.jpg', fact: 'Le Soleil ! Une étoile géante toute brillante. Toutes les planètes tournent autour de lui.' },
  { id: 'pluton', tex: 'moon.jpg', fact: 'Pluton, une planète naine toute petite, si loin du Soleil qu\'il y fait glacial. Elle met deux cent quarante-huit ans à en faire le tour !' },
  { id: 'lune', tex: 'moon.jpg', fact: 'La Lune ! Elle tourne autour de la Terre, et des astronautes ont marché dessus.' },
  { id: 'io', tex: 'io.jpg', fact: 'Io, une lune de Jupiter pleine de volcans qui crachent du soufre jaune !' },
  { id: 'europe', tex: 'europa.jpg', fact: 'Europe, une lune de Jupiter couverte de glace. Dessous, il y a peut-être un océan !' },
  { id: 'ganymede', tex: 'ganymede.jpg', fact: 'Ganymède, la plus grosse lune de tout le système solaire : elle est plus grosse que Mercure !' },
  { id: 'callisto', tex: 'callisto.jpg', fact: 'Callisto, une lune de Jupiter toute couverte de cratères.' },
  { id: 'titan', tex: 'venus.jpg', fact: 'Titan, la grosse lune de Saturne, cachée sous un épais brouillard orange.' }
]
const INFO: Record<string, Info> = Object.fromEntries([...PLANETS, ...BONUS].map(i => [i.id, i]))
/** Les billes : le Soleil, les huit planètes, Pluton. */
const BALLS = ['soleil', ...PLANETS.map(p => p.id), 'pluton']

/** La vitesse du temps (jours par seconde) : la tortue et le lièvre. */
const RATES = [0, 1 / 24, 1, 7, 30.44, 365.25]
const RATE0 = 3

const SYSTEM = 'systeme'
/** `?hq` dans l'adresse : la qualité ne baisse jamais (captures, mesures). */
const HQ = typeof location !== 'undefined' && new URLSearchParams(location.search).has('hq')
type Mode = 'explore' | 'trouve'
type V3 = import('three').Vector3
interface View { yaw: number; pitch: number; distR: number }
interface Travel { id: string; arr: View; from: V3; lookFrom: V3; t: number; dur: number }

interface State {
  stage: Stage
  T: T3
  cosmos: Cosmos
  fx: Particles
  rocket: Rocket
  halo: import('three').Sprite
  camLight: import('three').DirectionalLight
  mode: Mode
  visited: Set<string>
  /** Là où la caméra regarde (un astre, ou le système entier). */
  target: string
  travel: Travel | null
  view: View
  tgtView: View
  vel: { yaw: number; pitch: number }
  lookTarget: V3
  baseFov: number
  /** La fusée est posée à côté de cet astre (décalage dans le monde). */
  rocketAt: string
  rocketOff: V3
  arrived: boolean
  jd: number
  spinJd: number
  rate: number
  /** Secondes sans geste : la lueur de démonstration apparaît après 3 s. */
  idle: number
  finaled: boolean
  dragging: boolean
  quiz: { order: string[]; i: number; tries: number; errors: number; wanted: string | null; lock: boolean }
  ui: {
    arena: HTMLElement
    balls: HTMLElement
    card: HTMLElement
    cardName: HTMLElement
    cardText: HTMLElement
    ask: HTMLElement
    askImg: HTMLElement
    askText: HTMLElement
    dots: HTMLElement
    hint: HTMLElement
    bar: HTMLElement
    time: HTMLElement
  }
  perf: { avg: number; last: number; frames: number; lastAdapt: number; maxPr: number }
  tmp: V3
  tmp2: V3
  tmp3: V3
}

let ctx: GameContext
let sp: State | null = null

const base = () => import.meta.env.BASE_URL + 'assets/space/'
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const isPlanet = (id: string) => PLANETS.some(p => p.id === id)

/** Retour au système : un soleil et son orbite (pas de flèche à interpréter). */
const ICON_SYSTEM = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="10" ry="4.6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.6" fill="currentColor"/><circle cx="20.4" cy="14.3" r="1.9" fill="currentColor"/></svg>`
/** La tortue (le temps ralentit) et le lièvre (il file), en formes pleines. */
const ICON_TURTLE = `<svg class="ico" viewBox="0 0 48 48" aria-hidden="true"><path fill="currentColor" d="M8 30c0-9 7-15 16-15s16 6 16 15H8z"/><circle cx="42" cy="27" r="4.5" fill="currentColor"/><rect x="11" y="30" width="6" height="7" rx="3" fill="currentColor"/><rect x="31" y="30" width="6" height="7" rx="3" fill="currentColor"/><path fill="none" stroke="rgba(0,0,0,.28)" stroke-width="2" d="M16 29l4-8h8l4 8M24 15v6"/></svg>`
const ICON_HARE = `<svg class="ico" viewBox="0 0 48 48" aria-hidden="true"><ellipse cx="22" cy="30" rx="13" ry="8.5" fill="currentColor"/><circle cx="36" cy="23" r="6.5" fill="currentColor"/><path fill="currentColor" d="M34 18c-3-8-1-13 2-13s3 7 1 13zM38.5 18c0-8 3-12 5.5-11.5s1 7-3 12z"/><circle cx="9" cy="28" r="3.5" fill="currentColor"/><path fill="currentColor" d="M26 36l8 3v2h-10zM12 35l-4 5h8z"/><path stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M2 20h7M4 25h5M2 30h4"/></svg>`

/** Une bille-planète : la vraie texture, qui défile comme une planète qui tourne. */
function ballHTML(id: string, cls = '') {
  const ringed = id === 'saturne'
  const info = INFO[id]
  return `<span class="sp3-ball ${cls}${ringed ? ' ringed' : ''}${id === 'soleil' ? ' sun' : ''}${id === 'pluton' ? ' dwarf' : ''}" data-id="${id}"
    style="background-image:url(${base()}${info.tex})"></span>`
}

function haloTex(T: T3) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 34, 64, 64, 62)
  grad.addColorStop(0, 'rgba(255,255,255,0)')
  grad.addColorStop(0.55, 'rgba(255,236,170,.95)')
  grad.addColorStop(1, 'rgba(255,236,170,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  return t
}

/* ---------- La fusée : dessinée en 3D (tour, ailerons, hublot, flamme qui
   brûle en HDR — le halo lumineux la fait rayonner). Longueur 1, nez en +y,
   origine au centre. ---------- */
/* ---------- La caméra : on vise un astre (ou le système), vol en courbe ---------- */
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
const radiusOf = (me: State, id: string) => id === SYSTEM ? SUN_R : me.cosmos.radius(id)
const targetPos = (me: State, id: string, out: V3) => id === SYSTEM ? out.set(0, 0, 0) : me.cosmos.worldPos(id, out)
/** Là où regarde la caméra : un peu SOUS l'astre, pour qu'il se tienne en
    haut de l'écran, au-dessus de la carte de sa merveille. */
const lookPos = (me: State, id: string, out: V3) => {
  targetPos(me, id, out)
  if (id !== SYSTEM) out.y -= radiusOf(me, id) * 0.42
  return out
}

function arrivalView(me: State, id: string): View {
  if (id === SYSTEM) return { yaw: -0.6, pitch: 0.75, distR: 55 }
  if (id === 'soleil') return { yaw: 0.5, pitch: 0.18, distR: 5.6 }
  const p = me.cosmos.worldPos(id, me.tmp)
  // Vue de trois quarts : la planète éclairée de côté, le Soleil derrière
  // l'épaule ; la Terre, à moitié dans la nuit (ses villes s'allument)
  const yaw = Math.atan2(-p.x, -p.z) + (id === 'terre' ? 1.35 : 0.75)
  const b = me.cosmos.byId[id]
  // Jupiter d'un peu plus loin et d'un peu plus haut : ses quatre lunes autour d'elle
  if (id === 'jupiter') return { yaw, pitch: 0.55, distR: 5.8 }
  return { yaw, pitch: b.rings ? 0.32 : 0.18, distR: b.rings ? 6.0 : b.parent ? 4.3 : 3.9 }
}
function distLimits(me: State, id: string): [number, number] {
  if (id === SYSTEM) return [6, 120]
  if (id === 'soleil') return [1.6, 40]
  return me.cosmos.byId[id].rings ? [1.4, 60] : [1.25, 60]
}
function orbitCamPos(me: State, id: string, v: View, out: V3) {
  const p = targetPos(me, id, me.tmp3)
  const d = radiusOf(me, id) * v.distR
  const cp = Math.cos(v.pitch)
  return out.set(p.x + d * cp * Math.sin(v.yaw), p.y + d * Math.sin(v.pitch), p.z + d * cp * Math.cos(v.yaw))
}

/** Part vers `id` : vol en courbe, la fusée devant la caméra. Renvoie sa durée (s). */
function travelTo(me: State, id: string): number {
  const T = me.T
  const arr = arrivalView(me, id)
  const from = me.stage.camera.position.clone()
  const dist = from.distanceTo(orbitCamPos(me, id, arr, new T.Vector3()))
  const dur = Math.min(4, Math.max(1.8, 1.4 + 0.6 * Math.log(1 + dist / 4)))
  me.travel = { id, arr, from, lookFrom: me.lookTarget.clone(), t: 0, dur }
  me.target = id
  me.arrived = false
  if (id !== SYSTEM) {
    // La place de la fusée à l'arrivée : à droite de l'astre, un peu au-dessus
    const R = radiusOf(me, id)
    const p = targetPos(me, id, new T.Vector3())
    const cam = orbitCamPos(me, id, arr, new T.Vector3())
    const toCam = cam.sub(p).normalize()
    const right = new T.Vector3().crossVectors(toCam.clone().negate(), new T.Vector3(0, 1, 0)).normalize()
    // À GAUCHE (la colonne des billes est à droite), un peu devant l'astre
    me.rocketOff.copy(right.multiplyScalar(-R * 1.4)).addScaledVector(new T.Vector3(0, 1, 0), R * 0.1).addScaledVector(toCam, R * 1.1)
  }
  return dur
}

function updateCamera(me: State, dt: number) {
  const cam = me.stage.camera
  const tr = me.travel
  if (tr) {
    tr.t = Math.min(1, tr.t + dt / tr.dur)
    const s = ease(tr.t)
    const end = orbitCamPos(me, tr.id, tr.arr, me.tmp)
    const mid = tr.from.clone().add(end).multiplyScalar(0.5)
    mid.y += tr.from.distanceTo(end) * 0.18
    const a = tr.from.clone().lerp(mid, s), b = mid.clone().lerp(end, s)
    cam.position.copy(a.lerp(b, s))
    const lt = ease(Math.min(1, tr.t / 0.55))
    me.lookTarget.copy(tr.lookFrom).lerp(lookPos(me, tr.id, me.tmp2), lt)
    cam.lookAt(me.lookTarget)
    cam.fov = me.baseFov + 10 * Math.sin(Math.PI * s)
    cam.updateProjectionMatrix()
    if (tr.t >= 1) {
      Object.assign(me.view, tr.arr); Object.assign(me.tgtView, tr.arr)
      me.travel = null
      cam.fov = me.baseFov; cam.updateProjectionMatrix()
      if (tr.id !== SYSTEM) { me.rocketAt = tr.id; arrive(me) }
    }
    return
  }
  const v = me.view, g = me.tgtView
  if (!me.dragging) {
    g.yaw += me.vel.yaw; g.pitch = Math.max(-1.45, Math.min(1.45, g.pitch + me.vel.pitch))
    me.vel.yaw *= 0.9; me.vel.pitch *= 0.9
    // Au repos, la caméra tourne doucement autour (le système, ou l'astre visité)
    if (me.idle > 2) g.yaw += dt * (me.target === SYSTEM ? 0.025 : 0.06)
  }
  const k = 1 - Math.pow(0.0005, dt)
  v.yaw += (g.yaw - v.yaw) * k
  v.pitch += (g.pitch - v.pitch) * k
  v.distR *= Math.pow(g.distR / v.distR, Math.min(1, k * 0.8))
  orbitCamPos(me, me.target, v, cam.position)
  lookPos(me, me.target, me.lookTarget)
  cam.lookAt(me.lookTarget)
}

const rocketScale = (R: number) => Math.min(0.9, Math.max(0.08, R * 0.2))
/** La fusée : devant la caméra pendant le vol, puis posée à côté de l'astre. */
/** L'axe de la fusée sur `axis`, son hublot (+z) tourné vers `toCam`. */
function aimRocket(T: T3, axis: V3, toCam: V3) {
  const y = axis.clone().normalize()
  const z = toCam.clone().addScaledVector(y, -toCam.dot(y))
  if (z.lengthSq() < 1e-6) z.set(0, 0, 1).addScaledVector(y, -y.z)
  z.normalize()
  const x = new T.Vector3().crossVectors(y, z)
  return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z))
}

function updateRocket(me: State, dt: number, now: number) {
  const T = me.T
  const g = me.rocket.group
  const cam = me.stage.camera
  const tr = me.travel
  const parkedR = radiusOf(me, me.rocketAt)
  const parkScale = rocketScale(parkedR)
  const parked = targetPos(me, me.rocketAt, me.tmp).add(me.rocketOff)
  parked.y += Math.sin(now / 700) * parkedR * 0.04
  const up = new T.Vector3(0, 1, 0)
  const toCam = cam.position.clone().sub(g.position).normalize()
  const toBody = targetPos(me, me.rocketAt, me.tmp2).sub(parked).normalize()
  const parkedDir = up.clone().multiplyScalar(0.85).addScaledVector(toBody, 0.5).normalize()
  const parkedQ = aimRocket(T, parkedDir, toCam)
  let thrust = 0.15
  if (tr && tr.id !== SYSTEM) {
    // En route : la fusée file de trois quarts en bas à gauche, le nez vers
    // la destination au centre, le hublot vers nous (vue pile de dos, elle
    // ne ressemblait plus qu'à une cible)
    const fwd = new T.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
    const camUp = new T.Vector3(0, 1, 0).applyQuaternion(cam.quaternion)
    const right = new T.Vector3(1, 0, 0).applyQuaternion(cam.quaternion)
    const sway = Math.sin(now / 520) * 0.06
    const chase = cam.position.clone().addScaledVector(fwd, 2.6).addScaledVector(right, -0.62 + sway * 0.5).addScaledVector(camUp, -0.36 + Math.sin(now / 380) * 0.025)
    const destR = radiusOf(me, tr.id)
    const dest = targetPos(me, tr.id, new T.Vector3()).add(me.rocketOff)
    const kk = T.MathUtils.smoothstep(tr.t, 0.72, 1)
    g.position.copy(chase.lerp(dest, kk))
    // presque de profil, en diagonale vers le haut à droite, comme sur l'image Canva
    const axis = fwd.clone().multiplyScalar(0.3).addScaledVector(right, 0.78 + sway).addScaledVector(camUp, 0.58).normalize()
    g.quaternion.copy(aimRocket(T, axis, fwd.clone().negate())).slerp(parkedQ, kk)
    g.scale.setScalar(T.MathUtils.lerp(0.46, rocketScale(destR), kk))
    thrust = 1 - kk * 0.8
  } else {
    g.position.lerp(parked, Math.min(1, dt * 4))
    g.quaternion.slerp(parkedQ, Math.min(1, dt * 3))
    g.scale.setScalar(parkScale)
  }
  // le Soleil est à l'origine : ses reflets glissent sur la coque
  me.rocket.update(now, thrust, new T.Vector3().copy(g.position).negate())
}

/* ---------- Explore ---------- */
function fly(me: State, id: string) {
  me.idle = 0
  me.ui.card.classList.add('off')
  me.ui.hint.classList.add('off')
  tone(300, 0.18, 'sawtooth', 0.06)
  tone(520, 0.16, 'sine', 0.07, 0.12)
  travelTo(me, id)
  markBalls(me)
}

function arrive(me: State) {
  const id = me.target
  me.arrived = true
  const R = radiusOf(me, id)
  const p = targetPos(me, id, me.tmp)
  me.fx.burst(p, { count: 34, color: ['#FFE08A', '#FFFFFF', me.cosmos.byId[id]?.color || '#FFB13A'], speed: 1.4 * R + 0.6, spread: 1, life: 0.9, size: R * 0.28, gravity: 0 })
  if (me.mode === 'trouve') return
  const isNew = isPlanet(id) && !me.visited.has(id)
  if (isNew) { me.visited.add(id); sGood() } else sPop()
  const fact = INFO[id]?.fact || ''
  me.ui.cardName.textContent = cap(me.cosmos.byId[id].name)
  me.ui.cardName.classList.toggle('new', isNew)
  me.ui.cardText.textContent = fact
  me.ui.card.classList.remove('off')
  me.ui.card.classList.toggle('last', me.visited.size >= PLANETS.length && !me.finaled)
  ctx.say(fact)
  markBalls(me)
}

/** Retour au système. Renvoie la durée du vol (s). */
function home(me: State) {
  me.idle = 0
  me.ui.card.classList.add('off')
  sPop()
  const dur = travelTo(me, SYSTEM)
  markBalls(me)
  if (me.mode === 'explore' && me.visited.size >= PLANETS.length && !me.finaled) finale(me)
  return dur
}

function markBalls(me: State) {
  me.ui.balls.querySelectorAll<HTMLElement>('.sp3-ball').forEach(b => {
    const id = b.dataset.id!
    b.classList.toggle('seen', !isPlanet(id) || me.visited.has(id))
    b.classList.toggle('here', me.target === id)
  })
}

/** Les huit planètes vues : le système s'illumine, puis l'écran de fin. */
function finale(me: State) {
  me.finaled = true
  sWin(); confetti(); FX.fireworks?.()
  me.ui.balls.classList.add('party')
  for (const p of PLANETS) {
    const R = me.cosmos.radius(p.id)
    me.fx.burst(me.cosmos.worldPos(p.id, me.tmp), { count: 18, color: ['#FFE08A', '#FFFFFF', me.cosmos.byId[p.id].color], speed: 6 + R * 2, life: 1.4, size: 4 + R, gravity: 0 })
  }
  ctx.say('Bravo ! Tu as visité les huit planètes de la famille du Soleil.')
  ctx.finish({ title: 'Astronaute diplômée !', msg: 'Tu as visité les huit planètes', stars: 3, outroMs: 3600 })
}

/* ---------- Trouve ---------- */
function nextQuestion(me: State) {
  const q = me.quiz
  q.tries = 0
  q.lock = false
  if (q.i >= q.order.length) { quizEnd(me); return }
  const id = q.order[q.i]
  q.wanted = id
  // En douce on MONTRE la planète cherchée (on la reconnaît à son allure) ;
  // ensuite il faut la retrouver d'après son nom
  me.ui.askImg.innerHTML = ctx.tier === 'easy' ? ballHTML(id, 'big') : ''
  me.ui.askText.textContent = cap(me.cosmos.byId[id].name)
  me.ui.ask.classList.remove('off')
  me.ui.dots.querySelectorAll('i').forEach((d, k) => d.classList.toggle('cur', k === q.i))
  ctx.say(cap(me.cosmos.byId[id].name))
}

/** Après une visite de Trouve : on rentre, puis la question suivante. */
function backAndNext(me: State) {
  ctx.after(1800, () => {
    if (sp !== me) return
    const dur = home(me)
    me.quiz.i++
    ctx.after(dur * 1000 + 400, () => sp === me && me.mode === 'trouve' && nextQuestion(me))
  })
}

function answer(me: State, id: string) {
  const q = me.quiz
  if (q.lock || !q.wanted) return
  if (id === q.wanted) {
    q.lock = true
    sGood()
    me.ui.dots.querySelectorAll('i')[q.i]?.classList.add('ok')
    fly(me, id)
    return
  }
  // Mauvais astre : on dit lequel on a touché (c'est du contenu, ça apprend),
  // la carte tremble ; au deuxième essai la bonne planète s'illumine et on y va
  q.tries++
  q.errors++
  sNope()
  shake(me.ui.ask, 6, 300)
  ctx.say(cap(me.cosmos.byId[id]?.name || ''))
  if (q.tries >= 2) {
    q.lock = true
    ctx.after(1100, () => {
      if (sp !== me) return
      ctx.say(cap(me.cosmos.byId[q.wanted!].name))
      fly(me, q.wanted!)
    })
  }
}

function quizEnd(me: State) {
  me.ui.ask.classList.add('off')
  const n = me.quiz.order.length, e = me.quiz.errors
  const stars = e <= 1 ? 3 : e <= 4 ? 2 : 1
  if (stars === 3) { sWin(); confetti() }
  ctx.finish({ title: stars === 3 ? 'Astronaute experte !' : 'Belle mission !', msg: `Tu as retrouvé ${n} planètes`, stars, outroMs: 600 })
}

function setMode(me: State, m: Mode) {
  if (me.mode === m) return
  me.mode = m
  me.ui.bar.querySelectorAll<HTMLElement>('[data-mode]').forEach(b => {
    const on = b.dataset.mode === m
    b.classList.toggle('on', on)
    b.parentElement!.classList.toggle('sel', on)
  })
  me.ui.card.classList.add('off')
  me.ui.balls.classList.toggle('off', m === 'trouve') // les billes donneraient la réponse
  sPop()
  const dur = me.target !== SYSTEM ? travelTo(me, SYSTEM) : 0
  if (m === 'trouve') {
    const n = ctx.byTier(5, 8, 8)
    me.quiz = { order: shuffle(PLANETS.map(p => p.id)).slice(0, n), i: 0, tries: 0, errors: 0, wanted: null, lock: false }
    me.ui.dots.innerHTML = Array.from({ length: n }, () => '<i></i>').join('')
    ctx.after(dur * 1000 + 500, () => sp === me && me.mode === 'trouve' && nextQuestion(me))
  } else {
    me.quiz.wanted = null
    me.ui.ask.classList.add('off')
  }
  markBalls(me)
}

function setRate(me: State, i: number) {
  const next = Math.max(0, Math.min(RATES.length - 1, i))
  if (next === me.rate) { tone(220, 0.08, 'sine', 0.04); return }
  me.rate = next
  tone(next === 0 ? 260 : 330 + next * 90, 0.12, 'triangle', 0.05)
  me.ui.time.querySelectorAll('.sp3-tick').forEach((d, k) => d.classList.toggle('on', k < me.rate))
  me.ui.time.classList.toggle('paused', me.rate === 0)
}

export const space: GameDef = {
  id: 'space', name: 'Voyage dans l\'Espace', icon: '🚀', sq: 'sq-lilac', cat: 'reflexion', music: 'space',
  subtitle: 'Pilote ta fusée jusqu\'aux vraies planètes du système solaire !',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `<div class="arena g3-arena sp3-arena" id="spArena"></div>`
    const arena = c.root.querySelector<HTMLElement>('#spArena')!
    const hideLoader = loader(arena, 'space')
    const cleanups: (() => void)[] = []

    ;(async () => {
      const stage: Stage = await createStage(arena, {
        sky: '#000000', ibl: false, noSun: true, fov: 50,
        cam: [0, 60, 120], target: [0, 0, 0], hemi: ['#000000', '#000000', 0]
      })
      if (dead) { stage.dispose(); return }
      const T = stage.T
      const cosmos = await makeCosmos(stage, base())
      if (dead) { stage.dispose(); return }
      cleanups.push(() => cosmos.dispose())
      const rocket = makeRocket(T, stage)
      stage.scene.add(rocket.group)
      // Un appoint collé à la caméra : la fusée reste lisible même côté nuit
      const camLight = new T.DirectionalLight(0xDDE6FF, 0.9)
      stage.scene.add(camLight, camLight.target)
      const halo = new T.Sprite(new T.SpriteMaterial({
        map: stage.keep(haloTex(T)), transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0
      }))
      stage.scene.add(halo)

      /* --- L'interface, sans un mot de consigne --- */
      const bar = document.createElement('div')
      bar.className = 'geo-bar'
      const modeBtn = (m: Mode, icon: string, capTxt: string, on = false) =>
        `<span class="tool-item${on ? ' sel' : ''}">
           <button class="geo-btn${on ? ' on' : ''}" data-mode="${m}" aria-label="${capTxt}">${icon}</button>
           <i class="tool-cap">${capTxt}</i></span>`
      bar.innerHTML = modeBtn('explore', ICON.search, 'Explore', true) + modeBtn('trouve', ICON.target, 'Trouve')
      const balls = document.createElement('div')
      balls.className = 'sp3-balls'
      balls.innerHTML = BALLS.map(id => `<button class="sp3-pick" data-id="${id}" aria-label="${cosmos.byId[id].name}">${ballHTML(id)}</button>`).join('')
      const card = document.createElement('div')
      card.className = 'sp3-card off'
      card.innerHTML = `<div class="sp3-cardhead"><b class="sp3-name"></b>
          <button class="geo-again sp3-again" aria-label="Réécouter">${ICON.sound}</button></div>
        <p class="sp3-text"></p>
        <button class="sp3-home" aria-label="Retour au système">${ICON_SYSTEM}</button>`
      const ask = document.createElement('div')
      ask.className = 'geo-ask sp3-ask off'
      ask.innerHTML = `<span class="sp3-askimg"></span><b class="geo-asktext"></b>
        <button class="geo-say" aria-label="Réécouter">${ICON.sound}</button><span class="geo-dots"></span>`
      const hint = document.createElement('div')
      hint.className = 'tap-hint sp3-hint off'
      hint.innerHTML = ICON.tap
      const time = document.createElement('div')
      time.className = 'sp3-time'
      time.innerHTML = `<button class="sp3-tbtn" data-t="+1" aria-label="Plus vite">${ICON_HARE}</button>
        <span class="sp3-ticks">${RATES.slice(1).map((_, k) => `<i class="sp3-tick${k < RATE0 ? ' on' : ''}"></i>`).join('')}</span>
        <button class="sp3-tbtn" data-t="-1" aria-label="Moins vite">${ICON_TURTLE}</button>`
      arena.append(bar, balls, card, ask, hint, time)

      const jd0 = Date.now() / 86400000 + 2440587.5
      const me: State = {
        stage, T, cosmos, fx: particles(stage, 500), rocket, halo, camLight,
        mode: 'explore', visited: new Set(), target: 'terre', travel: null,
        view: { yaw: 0, pitch: 0.2, distR: 3.2 }, tgtView: { yaw: 0, pitch: 0.2, distR: 3.2 },
        vel: { yaw: 0, pitch: 0 }, lookTarget: new T.Vector3(), baseFov: 50,
        rocketAt: 'terre', rocketOff: new T.Vector3(), arrived: true,
        jd: jd0, spinJd: jd0, rate: RATE0, idle: 0, finaled: false, dragging: false,
        quiz: { order: [], i: 0, tries: 0, errors: 0, wanted: null, lock: false },
        ui: {
          arena, balls, card, bar, hint, ask, time,
          cardName: card.querySelector('.sp3-name')!, cardText: card.querySelector('.sp3-text')!,
          askImg: ask.querySelector('.sp3-askimg')!, askText: ask.querySelector('.geo-asktext')!,
          dots: ask.querySelector('.geo-dots')!
        },
        perf: { avg: 16, last: performance.now(), frames: 0, lastAdapt: 0, maxPr: cosmos.pixelRatio },
        tmp: new T.Vector3(), tmp2: new T.Vector3(), tmp3: new T.Vector3()
      }
      sp = me
      // Le champ de vision suit la forme de l'écran (en portrait, plus large)
      const fitFov = () => {
        const w = arena.clientWidth, h = arena.clientHeight
        me.baseFov = w >= h ? 50 : Math.min(80, 2 * Math.atan(Math.tan(25 * Math.PI / 180) / (w / h)) * 180 / Math.PI * 0.86)
        if (!me.travel) { stage.camera.fov = me.baseFov; stage.camera.updateProjectionMatrix() }
      }
      fitFov()
      stage.onResize = () => { fitFov(); cosmos.resize() }
      stage.render = () => cosmos.render()

      // Au départ : la fusée posée à côté de la Terre, puis on s'envole vers le système
      cosmos.setTime(me.jd, me.spinJd)
      travelTo(me, 'terre')
      me.travel = null
      me.arrived = true
      Object.assign(me.view, arrivalView(me, 'terre')); Object.assign(me.tgtView, me.view)
      orbitCamPos(me, 'terre', me.view, stage.camera.position)
      lookPos(me, 'terre', me.lookTarget)
      stage.camera.lookAt(me.lookTarget)
      rocket.group.position.copy(cosmos.worldPos('terre', me.tmp)).add(me.rocketOff)
      hideLoader()
      markBalls(me)
      ctx.after(1400, () => { if (sp === me && me.target === 'terre' && !me.travel) { travelTo(me, SYSTEM); markBalls(me) } })
      // Contenu (pas consigne) : le Soleil et les planètes, c'est la leçon
      ctx.say('Voici le Soleil, une étoile géante. Autour de lui tournent huit planètes.')

      /* --- Gestes : taper un astre, glisser pour tourner, pincer pour zoomer --- */
      const cv = stage.renderer.domElement
      const pointers = new Map<number, { x: number; y: number }>()
      let pinch0 = 0, pinchD0 = 0
      let down: { x: number; y: number; t: number; moved: number } | null = null
      const onDown = (e: PointerEvent) => {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
        me.dragging = true; me.vel.yaw = me.vel.pitch = 0; me.idle = 0
        down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()]
          pinch0 = Math.hypot(a.x - b.x, a.y - b.y); pinchD0 = me.tgtView.distR
        }
      }
      const onMove = (e: PointerEvent) => {
        const p = pointers.get(e.pointerId)
        if (!p) return
        const dx = e.clientX - p.x, dy = e.clientY - p.y
        p.x = e.clientX; p.y = e.clientY
        if (down) down.moved += Math.abs(dx) + Math.abs(dy)
        if (me.travel) return
        if (pointers.size === 1) {
          const k = 0.005
          me.tgtView.yaw -= dx * k
          me.tgtView.pitch = Math.max(-1.45, Math.min(1.45, me.tgtView.pitch + dy * k))
          me.vel.yaw = -dx * k; me.vel.pitch = dy * k
          if (down && down.moved > 10) me.ui.hint.classList.add('off')
        } else if (pointers.size === 2 && pinch0 > 0) {
          const [a, b] = [...pointers.values()]
          const lim = distLimits(me, me.target)
          me.tgtView.distR = Math.max(lim[0], Math.min(lim[1], pinchD0 * pinch0 / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))))
        }
      }
      const onUp = (e: PointerEvent) => {
        if (!pointers.has(e.pointerId)) return
        pointers.delete(e.pointerId)
        if (pointers.size < 2) pinch0 = 0
        if (pointers.size > 0) return
        me.dragging = false
        const d = down
        down = null
        if (!d || d.moved > 12 || performance.now() - d.t > 700 || me.finaled) return
        const id = cosmos.pick(e.clientX, e.clientY, 38)
        if (me.mode === 'trouve') { if (id && !me.travel) answer(me, id); return }
        if (id && id !== me.target) fly(me, id)
        else if (!id && me.target !== SYSTEM && !me.travel) home(me) // taper le ciel : on rentre
      }
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        const lim = distLimits(me, me.target)
        me.tgtView.distR = Math.max(lim[0], Math.min(lim[1], me.tgtView.distR * Math.exp(e.deltaY * 0.0012)))
      }
      cv.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      cv.addEventListener('wheel', onWheel, { passive: false })

      balls.addEventListener('click', e => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('.sp3-pick')
        if (!b || me.finaled || me.mode !== 'explore') return
        fly(me, b.dataset.id!)
      })
      card.querySelector<HTMLElement>('.sp3-home')!.onclick = () => { if (me.mode === 'explore') home(me) }
      card.querySelector<HTMLElement>('.sp3-again')!.onclick = () => { ctx.say(me.ui.cardText.textContent || '') }
      ask.querySelector<HTMLElement>('.geo-say')!.onclick = () => { if (me.quiz.wanted) ctx.say(cap(cosmos.byId[me.quiz.wanted].name)) }
      bar.addEventListener('click', e => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]')
        if (b && !me.finaled) setMode(me, b.dataset.mode as Mode)
      })
      time.addEventListener('click', e => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-t]')
        if (b) { me.idle = 0; setRate(me, me.rate + Number(b.dataset.t)) }
      })

      /* --- Boucle --- */
      stage.start((dt, now) => {
        if (sp !== me) return
        me.idle += dt
        // Le temps : ralenti pendant une visite (on regarde tranquillement) ;
        // les rotations et les lunes plafonnent pour rester lisibles
        const visiting = me.target !== SYSTEM || !!me.travel
        const rate = visiting ? Math.min(RATES[me.rate], 1) : RATES[me.rate]
        me.jd += rate * dt
        me.spinJd += Math.min(rate, 0.25) * dt
        if (rate <= 1 / 24) me.spinJd = me.jd
        cosmos.setTime(me.jd, me.spinJd)
        updateCamera(me, dt)
        updateRocket(me, dt, now)
        cosmos.frame(dt)
        // Le plan proche suit les astres (cosmos) ET la fusée, qu'il ne coupe pas
        const rd = stage.camera.position.distanceTo(rocket.group.position) - rocket.group.scale.x * 0.6
        if (rd > 0 && rd * 0.5 < stage.camera.near) { stage.camera.near = Math.max(0.01, rd * 0.5); stage.camera.updateProjectionMatrix() }
        // L'appoint de la fusée vient d'en haut à gauche de la caméra, comme la
        // lumière de l'image Canva : posé sur la caméra, son reflet blanchissait
        // en entier les ailerons vus de profil
        const ld = stage.camera.position.distanceTo(me.lookTarget)
        me.camLight.position.copy(stage.camera.position)
          .addScaledVector(me.tmp2.set(0, 1, 0).applyQuaternion(stage.camera.quaternion), ld * 0.55)
          .addScaledVector(me.tmp2.set(1, 0, 0).applyQuaternion(stage.camera.quaternion), -ld * 0.75)
        me.camLight.target.position.copy(me.lookTarget)

        // Trouve : une visite achevée, on rentre et on enchaîne
        if (me.mode === 'trouve' && me.arrived && me.target !== SYSTEM && me.quiz.lock && !me.travel && me.quiz.wanted === me.target) {
          me.quiz.wanted = null
          backAndNext(me)
        }

        // La démonstration : après 3 s sans geste, une lueur pulse autour de
        // la plus grosse planète pas encore vue (en Trouve, jamais)
        const suggest = me.mode === 'explore' && me.target === SYSTEM && !me.travel && me.idle > 3 && !me.finaled
          ? PLANETS.filter(p => !me.visited.has(p.id)).sort((x, y) => cosmos.radius(y.id) - cosmos.radius(x.id))[0] : undefined
        const hm = me.halo.material
        if (suggest) {
          const p = cosmos.worldPos(suggest.id, me.tmp)
          me.halo.position.copy(p)
          const d = stage.camera.position.distanceTo(p)
          const pulse = 0.5 + 0.5 * Math.sin(now / 260)
          me.halo.scale.setScalar(Math.max(cosmos.radius(suggest.id) * 3.6, 64 / cosmos.pxPerUnit(d)) * (1 + pulse * 0.18))
          hm.opacity = Math.min(1, hm.opacity + dt * 2) * (0.55 + pulse * 0.45)
          const showHand = me.visited.size === 0
          me.ui.hint.classList.toggle('off', !showHand)
          if (showHand) {
            const sc = toScreen(stage, p), ar = arena.getBoundingClientRect()
            me.ui.hint.style.left = sc.x - ar.left + 'px'
            me.ui.hint.style.top = sc.y - ar.top + 14 + 'px'
          }
        } else {
          hm.opacity = Math.max(0, hm.opacity - dt * 4)
          me.ui.hint.classList.add('off')
        }
        me.ui.balls.querySelectorAll<HTMLElement>('.sp3-ball').forEach(b => b.classList.toggle('wink', b.dataset.id === suggest?.id))
        me.fx.update(dt)

        // La tablette peine (plus de 34 ms par image) : moins de pixels, puis
        // plus de lissage ; elle respire (moins de 18 ms) : on en rend
        const pf = me.perf
        const wall = now - pf.last
        pf.last = now
        if (dt > 0 && !HQ) {
          pf.avg = pf.avg * 0.93 + wall * 0.07
          pf.frames++
          if (now - pf.lastAdapt > 2000 && pf.frames > 60) {
            const pr = cosmos.pixelRatio
            if (pf.avg > 34) {
              if (pr > 0.76) cosmos.setPixelRatio(Math.max(0.75, pr * 0.85))
              else cosmos.setMsaa(false)
              pf.lastAdapt = now
            } else if (pf.avg < 18 && pr < pf.maxPr - 0.01) {
              cosmos.setPixelRatio(Math.min(pf.maxPr, pr * 1.1))
              pf.lastAdapt = now
            }
          }
        }
      })

      // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __sp: unknown }).__sp = {
          get target() { return me.target },
          get travelling() { return !!me.travel },
          get visited() { return me.visited.size },
          get rate() { return me.rate },
          get mode() { return me.mode },
          get wanted() { return me.quiz.wanted },
          /** Un astre à l'écran (pixels), pour que le bot le touche. */
          screenOf(id: string) { return toScreen(stage, cosmos.worldPos(id, new T.Vector3())) }
        }
      }

      cleanups.push(() => {
        cv.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        cv.removeEventListener('wheel', onWheel)
        me.fx.dispose()
        stage.dispose()
      })
    })().catch(() => { hideLoader(); ctx.toast('La 3D n\'est pas disponible ici') })

    return () => {
      dead = true
      sp = null
      cleanups.splice(0).forEach(f => { try { f() } catch { /* déjà démonté */ } })
    }
  }
}
