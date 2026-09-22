import type { GameContext, GameDef } from '../core/types'
import { shuffle } from '../core/utils'
import { sGood, sNope, sPop, sWin, tone } from '../core/audio'
import { confetti, FX } from '../core/fx'
import { ICON } from '../core/icons'
import { shake } from '../core/juice'
import {
  createStage, loader, orbitCam, dotTex, picker, loadModel, type Stage, type T3, type Orbit
} from '../core/three3d'
import { particles, toScreen, type Particles } from '../core/scene3d'

/* Voyage dans l'Espace, en 3D — un vrai système solaire : des sphères
   texturées (NASA, Solar System Scope) qui tournent autour d'un Soleil qui
   éclaire tout le monde, les anneaux de Saturne en géométrie, et une fusée
   qui s'envole vers la planète touchée pendant que la caméra la suit.

   Repris le 22/09 : c'était le dernier jeu qui faisait LIRE (« Touche une
   planète : ta fusée s'envole ! », « J'ai mon diplôme ! », compteur en
   emoji, flèches en texte). Plus un mot de consigne :
   - une colonne de BILLES-PLANÈTES (les vraies textures, qui tournent) sert
     à la fois de passeport — elles s'allument une fois visitées — et de
     raccourci pour les petites planètes dures à viser ;
   - une lueur pulse autour d'une planète pas encore vue quand on attend :
     c'est la démonstration du geste ;
   - on fait tourner le système en glissant le doigt ;
   - le nom de la planète et sa merveille s'affichent, et la voix les dit
     (contenu pédagogique, règle 2) ; un haut-parleur les répète.
   Deux modes, comme le Tour du Monde : Explore (la découverte, jusqu'à la
   fête des huit planètes) et Trouve (la voix dit une planète, on la cherche ;
   deuxième essai puis la bonne planète s'illumine — aucune sanction). */

interface Planet {
  id: string; name: string; tex: string
  orbit: number; radius: number; speed: number; tilt: number
  base: string
  ring?: [number, number, string]
  clouds?: boolean
  moons?: number
  fact: string
}

const PLANETS: Planet[] = [
  {
    id: 'mercure', name: 'Mercure', orbit: 2.4, radius: 0.23, speed: 0.30, tilt: 0.02, tex: 'mercury.jpg',
    base: '#9B8C79',
    fact: 'Mercure ! La plus petite planète, et la plus rapide autour du Soleil. Le jour il y fait super chaud, et la nuit super froid.'
  },
  {
    id: 'venus', name: 'Vénus', orbit: 3.1, radius: 0.34, speed: 0.23, tilt: 0.05, tex: 'venus.jpg',
    base: '#E8C377',
    fact: 'Vénus ! La planète la plus chaude de toutes, plus chaude qu\'un four, à cause de ses gros nuages tout épais.'
  },
  {
    id: 'terre', name: 'la Terre', orbit: 3.9, radius: 0.38, speed: 0.19, tilt: 0.41, tex: 'earth.jpg',
    base: '#2E6BA8', clouds: true, moons: 1,
    fact: 'La Terre, c\'est chez nous ! La seule planète avec de l\'eau bleue, des nuages blancs et plein d\'animaux.'
  },
  {
    id: 'mars', name: 'Mars', orbit: 4.7, radius: 0.29, speed: 0.16, tilt: 0.44, moons: 2, tex: 'mars.jpg',
    base: '#B4502E',
    fact: 'Mars, la planète rouge ! Elle est couverte de poussière rouge, et des petits robots s\'y promènent pour l\'explorer.'
  },
  {
    id: 'jupiter', name: 'Jupiter', orbit: 6.0, radius: 0.88, speed: 0.10, tilt: 0.05, tex: 'jupiter.jpg',
    base: '#D8B98C',
    moons: 3,
    fact: 'Jupiter, la plus GROSSE planète ! Si grande qu\'elle pourrait avaler mille Terres. Elle a une tempête géante toute rouge.'
  },
  {
    id: 'saturne', name: 'Saturne', orbit: 7.3, radius: 0.74, speed: 0.075, tilt: 0.47, tex: 'saturn.jpg',
    base: '#E2CE9C', ring: [1.35, 2.35, '#E4D2A4'],
    fact: 'Saturne et ses magnifiques anneaux ! Ils sont faits de glace et de cailloux qui brillent dans la lumière du Soleil.'
  },
  {
    id: 'uranus', name: 'Uranus', orbit: 8.5, radius: 0.52, speed: 0.055, tilt: 1.71, tex: 'uranus.jpg',
    base: '#8FD4DC', ring: [1.5, 1.9, '#BFE6EC'],
    fact: 'Uranus ! Elle est couchée sur le côté et roule comme une bille. Brrr, c\'est une planète toute bleue et très très froide.'
  },
  {
    id: 'neptune', name: 'Neptune', orbit: 9.5, radius: 0.50, speed: 0.042, tilt: 0.5, tex: 'neptune.jpg',
    base: '#2A4FA0',
    fact: 'Neptune, la planète la plus loin du Soleil ! Elle est toute bleue, avec les vents les plus rapides de tout le système solaire.'
  }
]

const SUN_FACT = 'Le Soleil ! Une étoile géante toute brillante. Toutes les planètes tournent autour de lui.'

type Mesh = import('three').Mesh
type Group = import('three').Group
type Vec3 = import('three').Vector3

interface PlanetObj {
  def: Planet
  grp: Group
  mesh: Mesh
  hit: Mesh
  clouds: Mesh | null
  moons: { m: Mesh; d: number; s: number; ph: number }[]
  phase: number
}

type Mode = 'explore' | 'trouve'

interface State {
  stage: Stage
  T: T3
  fx: Particles
  planets: PlanetObj[]
  sun: Mesh
  sunHit: Mesh
  glow: import('three').Sprite
  halo: import('three').Sprite
  fill: import('three').DirectionalLight
  rocket: { group: Group; flame: Mesh }
  orbit: Orbit
  mode: Mode
  visited: Set<string>
  /** La fusée vole vers (ou est posée sur) cette planète. */
  target: string | null
  flyT: number
  arrived: boolean
  /** Temps simulé du système (les orbites). */
  t: number
  /** Secondes sans geste : la lueur de démonstration apparaît après 3 s. */
  idle: number
  finaled: boolean
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
  }
  tmp: Vec3
  tmp2: Vec3
  goal: Vec3
}

let ctx: GameContext
let sp: State | null = null

const base = () => import.meta.env.BASE_URL + 'assets/space/'
const isSun = (id: string) => id === 'soleil'
const nameOf = (id: string) => isSun(id) ? 'le Soleil' : PLANETS.find(p => p.id === id)!.name
const texOf = (id: string) => isSun(id) ? 'sun.jpg' : PLANETS.find(p => p.id === id)!.tex
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** Retour au système : un soleil et son orbite (pas de flèche à interpréter). */
const ICON_SYSTEM = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="10" ry="4.6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.6" fill="currentColor"/><circle cx="20.4" cy="14.3" r="1.9" fill="currentColor"/></svg>`

/** Une bille-planète : la vraie texture, qui défile comme une planète qui tourne. */
function ballHTML(id: string, cls = '') {
  const ringed = id === 'saturne' || id === 'uranus'
  return `<span class="sp3-ball ${cls}${ringed ? ' ringed' : ''}${isSun(id) ? ' sun' : ''}" data-id="${id}"
    style="background-image:url(${base()}${texOf(id)})"></span>`
}

/* ---------- Textures : de VRAIES images (NASA Blue Marble pour la Terre,
   Solar System Scope CC BY 4.0 pour les autres, voir CREDITS.md) ---------- */
function realTex(T: T3, stage: Stage, file: string) {
  const t = new T.TextureLoader().load(base() + file)
  t.colorSpace = T.SRGBColorSpace
  t.anisotropy = 4
  return stage.keep(t)
}

/** Anneau : la texture est une bande radiale (transparence incluse) ; on
    recalcule les UV du RingGeometry pour qu'elle s'enroule du bord intérieur
    au bord extérieur. */
function ringUVs(T: T3, geo: import('three').RingGeometry, ri: number, ro: number) {
  const pos = geo.attributes.position, uv = geo.attributes.uv
  const v = new T.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    uv.setXY(i, (v.length() - ri) / (ro - ri), 0.5)
  }
  uv.needsUpdate = true
}

function cloudTex(T: T3) {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 256
  const g = c.getContext('2d')!
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * 512, y = 20 + Math.random() * 216
    const r = 8 + Math.random() * 30
    const grad = g.createRadialGradient(x, y, 1, x, y, r)
    grad.addColorStop(0, 'rgba(255,255,255,.85)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.save(); g.translate(x, y); g.scale(2.1, 1); g.translate(-x, -y)
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.restore()
  }
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  return t
}

/** Un anneau lumineux doux : la lueur qui montre « touche-moi ». */
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

async function makeRocket(T: T3) {
  const stackParts = await Promise.all(
    ['rocket_baseA', 'rocket_fuelA', 'rocket_topA'].map(n => loadModel('space', n))
  )
  const stack = new T.Group()
  const box = new T.Box3(), v = new T.Vector3()
  let h = 0
  for (const p of stackParts) {
    box.setFromObject(p)
    p.position.y = h - box.min.y
    h += box.getSize(v).y
    stack.add(p)
  }
  // ~0.6 unité, origine au CENTRE : la navigation fait lookAt + rotateX(π/2)
  stack.scale.setScalar(0.62 / h)
  stack.position.y = -0.31
  const group = new T.Group()
  const flame = new T.Mesh(
    new T.ConeGeometry(0.06, 0.22, 12),
    new T.MeshBasicMaterial({ color: 0xFFB03A, transparent: true, opacity: 0.9 })
  )
  flame.position.y = -0.36
  flame.rotation.x = Math.PI
  group.add(stack, flame)
  return { group, flame }
}

/* ---------- Le système ---------- */
function planetPos(p: PlanetObj, t: number, out: Vec3) {
  const a = p.phase + t * p.def.speed
  return out.set(Math.sin(a) * p.def.orbit, 0, Math.cos(a) * p.def.orbit)
}

function bodyPos(me: State, id: string, out: Vec3): number {
  if (isSun(id)) { out.set(0, 0, 0); return 0.92 }
  const p = me.planets.find(x => x.def.id === id)!
  out.copy(p.grp.position)
  return p.def.radius
}

/* ---------- Explore ---------- */
function fly(me: State, id: string) {
  me.target = id
  me.flyT = 0
  me.arrived = false
  me.idle = 0
  me.ui.card.classList.add('off')
  me.ui.hint.classList.add('off')
  tone(300, 0.18, 'sawtooth', 0.06)
  tone(520, 0.16, 'sine', 0.07, 0.12)
  markBalls(me)
}

function arrive(me: State) {
  const id = me.target!
  me.arrived = true
  const r = bodyPos(me, id, me.tmp)
  me.fx.burst(me.tmp, { count: 26, color: ['#FFE08A', '#FFFFFF', isSun(id) ? '#FFB13A' : me.planets.find(p => p.def.id === id)!.def.base], speed: 1.4 + r, spread: 1, life: 0.9, size: 0.5, gravity: 0 })
  if (me.mode === 'trouve') return
  const isNew = !isSun(id) && !me.visited.has(id)
  if (isNew) { me.visited.add(id); sGood() } else sPop()
  const fact = isSun(id) ? SUN_FACT : PLANETS.find(p => p.id === id)!.fact
  me.ui.cardName.textContent = cap(nameOf(id))
  me.ui.cardName.classList.toggle('new', isNew)
  me.ui.cardText.textContent = fact
  me.ui.card.classList.remove('off')
  me.ui.card.classList.toggle('last', me.visited.size >= PLANETS.length && !me.finaled)
  ctx.say(fact)
  markBalls(me)
}

function home(me: State) {
  me.target = null
  me.flyT = 0
  me.arrived = false
  me.idle = 0
  me.ui.card.classList.add('off')
  sPop()
  markBalls(me)
  if (me.mode === 'explore' && me.visited.size >= PLANETS.length && !me.finaled) finale(me)
}

function markBalls(me: State) {
  me.ui.balls.querySelectorAll<HTMLElement>('.sp3-ball').forEach(b => {
    const id = b.dataset.id!
    b.classList.toggle('seen', isSun(id) || me.visited.has(id))
    b.classList.toggle('here', me.target === id)
  })
}

/** Les huit planètes vues : le système s'illumine, puis l'écran de fin. */
function finale(me: State) {
  me.finaled = true
  sWin(); confetti(); FX.fireworks?.()
  me.ui.balls.classList.add('party')
  for (const p of me.planets) me.fx.burst(p.grp.position, { count: 18, color: ['#FFE08A', '#FFFFFF', p.def.base], speed: 1.6, life: 1.2, size: 0.45, gravity: 0 })
  ctx.say('Bravo ! Tu as visité les huit planètes de la famille du Soleil.')
  ctx.finish({ title: 'Astronaute diplômée !', msg: 'Tu as visité les huit planètes', stars: 3, outroMs: 3200 })
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
  me.ui.askText.textContent = cap(nameOf(id))
  me.ui.ask.classList.remove('off')
  me.ui.dots.querySelectorAll('i').forEach((d, k) => d.classList.toggle('cur', k === q.i))
  ctx.say(cap(nameOf(id)))
}

function answer(me: State, id: string) {
  const q = me.quiz
  if (q.lock || !q.wanted) return
  if (id === q.wanted) {
    q.lock = true
    sGood()
    me.ui.dots.querySelectorAll('i')[q.i]?.classList.add('ok')
    fly(me, id)
    ctx.after(2600, () => { if (sp !== me) return; home(me); q.i++; ctx.after(700, () => sp === me && nextQuestion(me)) })
    return
  }
  // Mauvaise planète : on dit laquelle on a touchée (c'est du contenu, ça
  // apprend), la carte tremble ; au deuxième essai la bonne s'illumine
  q.tries++
  q.errors++
  sNope()
  shake(me.ui.ask, 6, 300)
  ctx.say(cap(nameOf(id)))
  if (q.tries >= 2) {
    q.lock = true
    ctx.after(1100, () => {
      if (sp !== me) return
      ctx.say(cap(nameOf(q.wanted!)))
      fly(me, q.wanted!)
      ctx.after(2800, () => { if (sp !== me) return; home(me); q.i++; ctx.after(700, () => sp === me && nextQuestion(me)) })
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
  me.target = null
  me.arrived = false
  me.ui.card.classList.add('off')
  me.ui.balls.classList.toggle('off', m === 'trouve') // les billes donneraient la réponse
  sPop()
  if (m === 'trouve') {
    const n = ctx.byTier(5, 8, 8)
    me.quiz = { order: shuffle(PLANETS.map(p => p.id)).slice(0, n), i: 0, tries: 0, errors: 0, wanted: null, lock: false }
    me.ui.dots.innerHTML = Array.from({ length: n }, () => '<i></i>').join('')
    ctx.after(500, () => sp === me && me.mode === 'trouve' && nextQuestion(me))
  } else {
    me.quiz.wanted = null
    me.ui.ask.classList.add('off')
  }
  markBalls(me)
}

export const space: GameDef = {
  id: 'space', name: 'Voyage dans l\'Espace', icon: '🚀', sq: 'sq-lilac', cat: 'reflexion', music: 'space',
  subtitle: 'Pilote ta fusée jusqu\'aux vraies planètes du système solaire !',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `<div class="arena g3-arena sp3-arena" id="spArena"></div>`
    const arena = c.root.querySelector<HTMLElement>('#spArena')!
    const hideLoader = loader(arena, '🚀')
    const cleanups: (() => void)[] = []

    ;(async () => {
      const stage: Stage = await createStage(arena, {
        sky: '#05060F', ibl: false, // le Soleil est la seule lumière (pas de reflets de pièce)
        cam: [0, 9.5, 19], target: [0, 0, 0], fov: 52,
        hemi: ['#2A3A6A', '#05060F', 0.35],
        noSun: true, exposure: 1.0
      })
      if (dead) { stage.dispose(); return }
      const T = stage.T
      const scene = stage.scene

      /* --- Champ d'étoiles --- */
      const N = 1300
      const sp3 = new Float32Array(N * 3)
      for (let i = 0; i < N; i++) {
        const a = Math.random() * Math.PI * 2
        const b = Math.acos(2 * Math.random() - 1)
        const r = 60 + Math.random() * 30
        sp3[i * 3] = Math.sin(b) * Math.cos(a) * r
        sp3[i * 3 + 1] = Math.cos(b) * r
        sp3[i * 3 + 2] = Math.sin(b) * Math.sin(a) * r
      }
      const starGeo = new T.BufferGeometry()
      starGeo.setAttribute('position', new T.BufferAttribute(sp3, 3))
      scene.add(new T.Points(starGeo, new T.PointsMaterial({
        size: 0.75, map: stage.keep(dotTex(T)), transparent: true, depthWrite: false
      })))

      /* --- Le Soleil : la seule source de lumière du système --- */
      const sun = new T.Mesh(
        new T.SphereGeometry(0.92, 34, 24),
        new T.MeshBasicMaterial({ map: realTex(T, stage, 'sun.jpg'), color: 0xFFE9B8 })
      )
      scene.add(sun)
      const glow = new T.Sprite(new T.SpriteMaterial({
        map: stage.keep(dotTex(T, '#FFC24A')), color: 0xFFB13A,
        transparent: true, blending: T.AdditiveBlending, depthWrite: false
      }))
      glow.scale.setScalar(3.6)
      scene.add(glow)
      scene.add(new T.PointLight(0xFFF0D0, 260, 46, 2))
      // Appoint depuis la caméra : sans lui, les planètes du premier plan sont
      // vues côté nuit — c'est juste physiquement, mais inregardable à 6 ans.
      const fill = new T.DirectionalLight(0xB8CCFF, 0.75)
      scene.add(fill)

      /* --- Orbites --- */
      const orbitMat = new T.MeshBasicMaterial({
        color: 0x6E86C8, transparent: true, opacity: 0.16, side: T.DoubleSide, depthWrite: false
      })
      for (const def of PLANETS) {
        const ring = new T.Mesh(new T.RingGeometry(def.orbit - 0.012, def.orbit + 0.012, 128), orbitMat)
        ring.rotation.x = -Math.PI / 2
        scene.add(ring)
      }

      /* --- Les planètes --- */
      const planets: PlanetObj[] = PLANETS.map((def, i) => {
        const grp = new T.Group()
        const mesh = new T.Mesh(
          new T.SphereGeometry(def.radius, 40, 28),
          new T.MeshStandardMaterial({ map: realTex(T, stage, def.tex), roughness: 0.88, metalness: 0.02 })
        )
        mesh.rotation.z = def.tilt
        grp.add(mesh)
        let clouds: Mesh | null = null
        if (def.clouds) {
          clouds = new T.Mesh(
            new T.SphereGeometry(def.radius * 1.03, 32, 22),
            new T.MeshStandardMaterial({
              map: stage.keep(cloudTex(T)), transparent: true, opacity: 0.45, roughness: 1, depthWrite: false
            })
          )
          clouds.rotation.z = def.tilt
          grp.add(clouds)
        }
        if (def.ring) {
          const [ri, ro, col] = def.ring
          const rgeo = new T.RingGeometry(def.radius * ri, def.radius * ro, 96, 1)
          ringUVs(T, rgeo, def.radius * ri, def.radius * ro)
          const rg = new T.Mesh(rgeo, new T.MeshBasicMaterial({
            map: realTex(T, stage, 'saturn_ring.png'), color: col, transparent: true, side: T.DoubleSide, depthWrite: false
          }))
          // L'anneau est dans le plan équatorial : une seule inclinaison, portée par le holder
          rg.rotation.x = -Math.PI / 2 + 0.02
          const holder = new T.Group()
          holder.rotation.z = def.tilt
          holder.add(rg)
          grp.add(holder)
        }
        // Lunes : de simples cailloux gris qui tournent (la Lune a sa vraie texture)
        const moons: PlanetObj['moons'] = []
        for (let k = 0; k < (def.moons || 0); k++) {
          const m = new T.Mesh(
            new T.SphereGeometry(def.radius * (0.14 + k * 0.03), 14, 12),
            def.id === 'terre'
              ? new T.MeshStandardMaterial({ map: realTex(T, stage, 'moon.jpg'), roughness: 0.95 })
              : new T.MeshStandardMaterial({ color: 0xB8B2A8, roughness: 0.95 })
          )
          grp.add(m)
          moons.push({ m, d: def.radius * (1.9 + k * 0.7), s: 0.8 + k * 0.4, ph: Math.random() * 6 })
        }
        // Zone tapable généreuse : les petites planètes sont dures à viser
        const hit = new T.Mesh(
          new T.SphereGeometry(Math.max(def.radius * 1.55, 0.5), 12, 10),
          new T.MeshBasicMaterial({ visible: false })
        )
        hit.userData.pid = def.id
        grp.add(hit)
        scene.add(grp)
        return { def, grp, mesh, hit, clouds, moons, phase: (i * 2.1) % (Math.PI * 2) }
      })

      const sunHit = new T.Mesh(new T.SphereGeometry(1.25, 14, 12), new T.MeshBasicMaterial({ visible: false }))
      sunHit.userData.pid = 'soleil'
      scene.add(sunHit)

      const halo = new T.Sprite(new T.SpriteMaterial({
        map: stage.keep(haloTex(T)), transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0
      }))
      scene.add(halo)

      const rocket = await makeRocket(T)
      if (dead) { stage.dispose(); return }
      rocket.group.position.set(2.9, 3.1, 7.2)
      scene.add(rocket.group)
      hideLoader()

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
      balls.innerHTML = ['soleil', ...PLANETS.map(p => p.id)].map(id => `<button class="sp3-pick" data-id="${id}" aria-label="${nameOf(id)}">${ballHTML(id)}</button>`).join('')
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
      hint.className = 'tap-hint sp3-hint'
      hint.innerHTML = ICON.tap
      arena.append(bar, balls, card, ask, hint)

      const me: State = {
        stage, T, fx: particles(stage, 400), planets, sun, sunHit, glow, halo, fill, rocket,
        orbit: orbitCam(stage, 19, 9.5, [0, 0, 0]),
        mode: 'explore', visited: new Set(), target: null, flyT: 0, arrived: false, t: 0, idle: 0, finaled: false,
        quiz: { order: [], i: 0, tries: 0, errors: 0, wanted: null, lock: false },
        ui: {
          arena, balls, card, bar, hint, ask,
          cardName: card.querySelector('.sp3-name')!, cardText: card.querySelector('.sp3-text')!,
          askImg: ask.querySelector('.sp3-askimg')!, askText: ask.querySelector('.geo-asktext')!,
          dots: ask.querySelector('.geo-dots')!
        },
        tmp: new T.Vector3(), tmp2: new T.Vector3(), goal: new T.Vector3()
      }
      sp = me
      markBalls(me)

      /* --- Gestes : taper une planète, glisser pour tourner le système --- */
      const pick = picker(stage)
      const cv = stage.renderer.domElement
      let down: { x: number; y: number; moved: boolean } | null = null
      const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, moved: false }; me.idle = 0 }
      const onMove = (e: PointerEvent) => {
        if (!down) return
        const dx = e.clientX - down.x
        if (!down.moved && Math.abs(dx) + Math.abs(e.clientY - down.y) > 10) down.moved = true
        if (down.moved) { me.orbit.turn(-dx * 0.006); down.x = e.clientX; down.y = e.clientY; me.ui.hint.classList.add('off') }
      }
      const onUp = (e: PointerEvent) => {
        const d = down
        down = null
        if (!d || d.moved || me.finaled) return
        const hits = pick(e, [...planets.map(p => p.hit), sunHit])
        let o: import('three').Object3D | null = hits[0]?.object ?? null
        while (o && !o.userData.pid) o = o.parent
        const id = o?.userData.pid as string | undefined
        if (me.mode === 'trouve') { if (id) answer(me, id); return }
        if (id) fly(me, id)
        else if (me.target && me.arrived) home(me) // taper le ciel : on rentre
      }
      cv.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)

      balls.addEventListener('click', e => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('.sp3-pick')
        if (!b || me.finaled || me.mode !== 'explore') return
        fly(me, b.dataset.id!)
      })
      card.querySelector<HTMLElement>('.sp3-home')!.onclick = () => home(me)
      card.querySelector<HTMLElement>('.sp3-again')!.onclick = () => { if (me.target) ctx.say(me.ui.cardText.textContent || '') }
      ask.querySelector<HTMLElement>('.geo-say')!.onclick = () => { if (me.quiz.wanted) ctx.say(cap(nameOf(me.quiz.wanted))) }
      bar.addEventListener('click', e => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]')
        if (b && !me.finaled) setMode(me, b.dataset.mode as Mode)
      })

      // Contenu (pas consigne) : le Soleil et les planètes, c'est la leçon
      ctx.say('Voici le Soleil, une étoile géante. Autour de lui tournent huit planètes.')

      /* --- Boucle --- */
      stage.start((dt, now) => {
        if (sp !== me) return
        me.idle += dt
        // Le système ralentit pendant une visite : on regarde tranquillement
        me.t += dt * (me.target ? 0.15 : 1)
        for (const p of me.planets) {
          planetPos(p, me.t, p.grp.position)
          p.mesh.rotation.y += dt * 0.35
          if (p.clouds) p.clouds.rotation.y += dt * 0.24
          for (const mo of p.moons) {
            const a = mo.ph + me.t * mo.s * 2.4
            mo.m.position.set(Math.cos(a) * mo.d, Math.sin(a) * mo.d * 0.3, Math.sin(a) * mo.d)
          }
        }
        me.sun.rotation.y += dt * 0.05
        me.glow.scale.setScalar(3.6 + Math.sin(now / 900) * 0.18)

        // La démonstration : après 3 s sans geste, une lueur pulse autour
        // d'une planète pas encore vue (en Trouve, jamais : ce serait la réponse)
        // La plus grosse d'abord : Mercure, collée au Soleil, est la plus dure à viser
        const suggest = me.mode === 'explore' && !me.target && me.idle > 3
          ? me.planets.filter(p => !me.visited.has(p.def.id)).sort((x, y) => y.def.radius - x.def.radius)[0] : undefined
        const hm = me.halo.material
        if (suggest) {
          me.halo.position.copy(suggest.grp.position)
          const pulse = 0.5 + 0.5 * Math.sin(now / 260)
          me.halo.scale.setScalar(Math.max(1.2, suggest.def.radius * 4.2) * (1 + pulse * 0.18))
          hm.opacity = Math.min(1, hm.opacity + dt * 2) * (0.55 + pulse * 0.45)
          // La main se pose SUR la planète suggérée, tant qu'on n'a rien visité
          const showHand = me.visited.size === 0
          me.ui.hint.classList.toggle('off', !showHand)
          if (showHand) {
            const sc = toScreen(stage, suggest.grp.position), ar = arena.getBoundingClientRect()
            me.ui.hint.style.left = sc.x - ar.left + 'px'
            me.ui.hint.style.top = sc.y - ar.top + 14 + 'px'
          }
        } else {
          hm.opacity = Math.max(0, hm.opacity - dt * 4)
          me.ui.hint.classList.add('off')
        }
        me.ui.balls.querySelectorAll<HTMLElement>('.sp3-ball').forEach(b => b.classList.toggle('wink', b.dataset.id === suggest?.def.id))

        if (me.target) {
          const rad = bodyPos(me, me.target, me.goal)
          const near = Math.max(1.3, rad * 3.4)
          me.orbit.look = [me.goal.x, me.goal.y, me.goal.z]
          me.orbit.dist = near
          me.orbit.height = rad * 0.9
          me.orbit.auto = 0.22
          // La fusée se pose à côté
          const want = me.tmp2.copy(me.goal)
          want.x += rad * 1.5 + 0.3; want.y += rad * 0.5; want.z += rad * 1.5 + 0.3
          me.rocket.group.position.lerp(want, Math.min(1, dt * 2.2))
          me.rocket.group.lookAt(me.goal)
          me.rocket.group.rotateX(Math.PI / 2)
          me.flyT += dt
          if (me.flyT > 1.1 && !me.arrived) arrive(me)
        } else {
          me.orbit.look = [0, 0, 0]
          me.orbit.dist = me.finaled ? 23 : 19
          me.orbit.height = me.finaled ? 12 : 9.5
          me.orbit.auto = me.finaled ? 0.3 : 0.035
          me.rocket.group.position.lerp(me.tmp2.set(2.9, 3.1, 7.2), Math.min(1, dt * 1.6))
          me.rocket.group.rotation.set(0, now / 2600, 0)
        }
        me.rocket.flame.scale.setScalar(0.7 + Math.sin(now / 45) * 0.25)
        me.orbit.update(dt)
        me.fill.position.copy(stage.camera.position)
        me.fx.update(dt)
      })

      cleanups.push(() => {
        cv.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
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
