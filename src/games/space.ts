import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { sGood, sPop, sWin, tone } from '../core/audio'
import { confetti, FX } from '../core/fx'
import {
  createStage, loader, orbitCam, dotTex, picker, type Stage
} from '../core/three3d'

/* 🚀 Mon Voyage dans l'Espace, en 3D — un vrai système solaire : des sphères
   texturées qui tournent autour d'un Soleil qui éclaire tout le monde, les
   anneaux de Saturne en géométrie, et une fusée qui s'envole vers la planète
   touchée pendant que la caméra la suit. Zéro quiz : découverte pure, et une
   merveille racontée à voix haute à chaque arrivée. */

interface Planet {
  id: string; name: string
  orbit: number; radius: number; speed: number; tilt: number
  base: string; bands: string[]; spot?: string
  ring?: [number, number, string]
  clouds?: boolean
  moons?: number
  fact: string
}

const PLANETS: Planet[] = [
  {
    id: 'mercure', name: 'Mercure', orbit: 2.4, radius: 0.23, speed: 0.30, tilt: 0.02,
    base: '#9B8C79', bands: ['#7D705F', '#B4A794', '#6E6252'],
    fact: 'Mercure ! La plus petite planète, et la plus rapide autour du Soleil. Le jour il y fait super chaud, et la nuit super froid.'
  },
  {
    id: 'venus', name: 'Vénus', orbit: 3.1, radius: 0.34, speed: 0.23, tilt: 0.05,
    base: '#E8C377', bands: ['#F8E6AE', '#C08A3E', '#FFF0C4', '#D9A44E'],
    fact: 'Vénus ! La planète la plus chaude de toutes, plus chaude qu\'un four, à cause de ses gros nuages tout épais.'
  },
  {
    id: 'terre', name: 'la Terre', orbit: 3.9, radius: 0.38, speed: 0.19, tilt: 0.41,
    base: '#2E6BA8', bands: [], clouds: true, moons: 1,
    fact: 'La Terre, c\'est chez nous ! La seule planète avec de l\'eau bleue, des nuages blancs et plein d\'animaux.'
  },
  {
    id: 'mars', name: 'Mars', orbit: 4.7, radius: 0.29, speed: 0.16, tilt: 0.44, moons: 2,
    base: '#B4502E', bands: ['#EE9564', '#8E3620', '#D2703F'],
    fact: 'Mars, la planète rouge ! Elle est couverte de poussière rouge, et des petits robots s\'y promènent pour l\'explorer.'
  },
  {
    id: 'jupiter', name: 'Jupiter', orbit: 6.0, radius: 0.88, speed: 0.10, tilt: 0.05,
    base: '#D8B98C', bands: ['#F2D9B4', '#B07A48', '#E6CBA4', '#9C6A3E', '#F6E3C2'], spot: '#C4522F',
    moons: 3,
    fact: 'Jupiter, la plus GROSSE planète ! Si grande qu\'elle pourrait avaler mille Terres. Elle a une tempête géante toute rouge.'
  },
  {
    id: 'saturne', name: 'Saturne', orbit: 7.3, radius: 0.74, speed: 0.075, tilt: 0.47,
    base: '#E2CE9C', bands: ['#F4E6BC', '#C7A45A', '#EFDDAE'], ring: [1.35, 2.35, '#E4D2A4'],
    fact: 'Saturne et ses magnifiques anneaux ! Ils sont faits de glace et de cailloux qui brillent dans la lumière du Soleil.'
  },
  {
    id: 'uranus', name: 'Uranus', orbit: 8.5, radius: 0.52, speed: 0.055, tilt: 1.71,
    base: '#8FD4DC', bands: ['#C4F0F0', '#6BAEC4'], ring: [1.5, 1.9, '#BFE6EC'],
    fact: 'Uranus ! Elle est couchée sur le côté et roule comme une bille. Brrr, c\'est une planète toute bleue et très très froide.'
  },
  {
    id: 'neptune', name: 'Neptune', orbit: 9.5, radius: 0.50, speed: 0.042, tilt: 0.5,
    base: '#2A4FA0', bands: ['#6FA8F0', '#1D3570', '#4C7FD0'],
    fact: 'Neptune, la planète la plus loin du Soleil ! Elle est toute bleue, avec les vents les plus rapides de tout le système solaire.'
  }
]

const SUN_FACT = 'Le Soleil ! Une étoile géante toute brillante. Toutes les planètes tournent autour de lui.'

let ctx: GameContext
let S: any = null

/* ---------- Textures de planètes, dessinées à la volée ---------- */
function planetTex(T: any, p: Planet) {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = p.base; g.fillRect(0, 0, 512, 256)

  if (p.id === 'terre') {
    // Océans + continents + calottes polaires
    for (let i = 0; i < 22; i++) {
      g.fillStyle = `hsl(${96 + Math.random() * 34},${38 + Math.random() * 26}%,${32 + Math.random() * 22}%)`
      const x = Math.random() * 512, y = 40 + Math.random() * 176
      g.beginPath()
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2
        const r = 18 + Math.random() * 46
        g.lineTo(x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 0.8)
      }
      g.closePath(); g.fill()
    }
    g.fillStyle = 'rgba(255,255,255,.9)'
    g.fillRect(0, 0, 512, 18); g.fillRect(0, 238, 512, 18)
  } else {
    // Bandes horizontales floues : c'est ce qui fait « planète »
    p.bands.forEach((col, i) => {
      const n = p.bands.length
      const h = 256 / n
      const y = i * h
      const grad = g.createLinearGradient(0, y, 0, y + h)
      grad.addColorStop(0, col + '00')
      grad.addColorStop(0.5, col)
      grad.addColorStop(1, col + '00')
      g.fillStyle = grad
      g.fillRect(0, y - h * 0.25, 512, h * 1.5)
    })
    // Turbulences
    for (let i = 0; i < 900; i++) {
      const y = Math.random() * 256
      g.strokeStyle = `rgba(255,255,255,${Math.random() * 0.09})`
      g.lineWidth = 1 + Math.random() * 3
      g.beginPath()
      const x = Math.random() * 512
      g.moveTo(x, y)
      g.lineTo(x + 20 + Math.random() * 70, y + (Math.random() - 0.5) * 4)
      g.stroke()
    }
    // Cratères pour les petites planètes rocheuses
    if (p.id === 'mercure' || p.id === 'mars') {
      for (let i = 0; i < 90; i++) {
        const x = Math.random() * 512, y = Math.random() * 256
        const r = 3 + Math.random() * 12
        g.fillStyle = 'rgba(0,0,0,.16)'
        g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
        g.fillStyle = 'rgba(255,255,255,.12)'
        g.beginPath(); g.arc(x - r * 0.25, y - r * 0.25, r * 0.7, 0, 7); g.fill()
      }
      if (p.id === 'mars') {
        g.fillStyle = 'rgba(255,255,255,.85)'
        g.fillRect(0, 0, 512, 12); g.fillRect(0, 244, 512, 12)
      }
    }
    if (p.spot) {
      const grad = g.createRadialGradient(340, 150, 4, 340, 150, 46)
      grad.addColorStop(0, p.spot)
      grad.addColorStop(0.7, p.spot)
      grad.addColorStop(1, p.spot + '00')
      g.fillStyle = grad
      g.save(); g.translate(340, 150); g.scale(1.5, 1); g.translate(-340, -150)
      g.beginPath(); g.arc(340, 150, 46, 0, 7); g.fill(); g.restore()
    }
  }
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function cloudTex(T: any) {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 256
  const g = c.getContext('2d')!
  g.clearRect(0, 0, 512, 256)
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

/** Anneaux : un dégradé radial en bandes, avec des trous — la division de Cassini. */
function ringTex(T: any, color: string) {
  const c = document.createElement('canvas')
  c.width = 256; c.height = 8
  const g = c.getContext('2d')!
  for (let x = 0; x < 256; x++) {
    const t = x / 256
    const gap = Math.abs(t - 0.62) < 0.035 || Math.abs(t - 0.28) < 0.02
    const a = gap ? 0.05 : 0.35 + Math.sin(t * 44) * 0.16 + (1 - t) * 0.35
    g.fillStyle = color
    g.globalAlpha = Math.max(0, Math.min(0.95, a))
    g.fillRect(x, 0, 1, 8)
  }
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  return t
}

/* ---------- La fusée ---------- */
function makeRocket(T: any) {
  const g = new T.Group()
  const white = new T.MeshStandardMaterial({ color: 0xF4F6FA, roughness: 0.35, metalness: 0.25 })
  const red = new T.MeshStandardMaterial({ color: 0xE8574C, roughness: 0.4 })
  const glass = new T.MeshStandardMaterial({ color: 0x7FD0F0, roughness: 0.1, metalness: 0.4, emissive: 0x2A6A8A })
  const body = new T.Mesh(new T.CapsuleGeometry(0.09, 0.2, 6, 14), white)
  const nose = new T.Mesh(new T.ConeGeometry(0.09, 0.17, 14), red)
  nose.position.y = 0.27
  const win = new T.Mesh(new T.SphereGeometry(0.045, 12, 10), glass)
  win.position.set(0, 0.08, 0.075)
  for (let i = 0; i < 3; i++) {
    const fin = new T.Mesh(new T.ConeGeometry(0.045, 0.13, 4), red)
    const a = (i / 3) * Math.PI * 2
    fin.position.set(Math.sin(a) * 0.09, -0.16, Math.cos(a) * 0.09)
    fin.rotation.y = a
    g.add(fin)
  }
  const flame = new T.Mesh(
    new T.ConeGeometry(0.06, 0.22, 12),
    new T.MeshBasicMaterial({ color: 0xFFB03A, transparent: true, opacity: 0.9 })
  )
  flame.position.y = -0.28
  flame.rotation.x = Math.PI
  g.add(body, nose, win, flame)
  return { group: g, flame }
}

/* ---------- Navigation ---------- */
function planetPos(p: any, t: number, out: any) {
  const a = p.phase + t * p.def.speed
  out.set(Math.sin(a) * p.def.orbit, 0, Math.cos(a) * p.def.orbit)
  return out
}

function visit(id: string) {
  if (!S || S.busy) return
  S.busy = true
  S.target = id
  S.flyT = 0
  tone(300, 0.18, 'sawtooth', 0.06)
  setTimeout(() => tone(520, 0.16, 'sine', 0.07), 120)
  $('spFactBox').style.display = 'none'
}

function arrive() {
  const id = S.target
  const p = id === 'soleil' ? null : S.planets.find((x: any) => x.def.id === id)
  const name = p ? p.def.name : 'le Soleil'
  const fact = p ? p.def.fact : SUN_FACT
  const isNew = !!p && !S.visited.has(id)
  if (isNew) { S.visited.add(id); sGood(); FX.fireworks?.() } else sPop()
  $('spFactName').innerHTML = `${p ? '' : '☀️ '}${name}${isNew ? ' <span class="sp3-new">Nouveau !</span>' : ''}`
  $('spFactText').textContent = fact
  $('spFactBox').style.display = ''
  ctx.say(fact)
  updatePassport()
}

function back() {
  if (!S) return
  S.busy = false
  S.target = null
  S.flyT = 0
  $('spFactBox').style.display = 'none'
  sPop()
  if (S.visited.size >= PLANETS.length && !S.finaled) finale()
}

function updatePassport() {
  $('spCount').textContent = `🚀 ${S.visited.size}/8`
  for (const p of PLANETS) {
    $('spDot_' + p.id)?.classList.toggle('on', S.visited.has(p.id))
  }
}

function finale() {
  S.finaled = true
  S.busy = true
  sWin(); confetti(); FX.fireworks?.()
  $('spFactName').innerHTML = '🚀 Bravo, astronaute !'
  $('spFactText').textContent = `${ctx.playerName} a visité toute la famille du Soleil ! 🌍🪐✨`
  $('spFactBox').style.display = ''
  ;($('spBack') as HTMLElement).style.display = 'none'
  ;($('spDiploma') as HTMLElement).style.display = ''
  ctx.say(`Bravo astronaute ${ctx.playerName} ! Tu as visité les huit planètes de la famille du Soleil. Tu es une vraie exploratrice de l'espace !`)
}

export const space: GameDef = {
  id: 'space', name: 'Voyage dans l\'Espace', icon: '🚀', sq: 'sq-lilac', cat: 'reflexion', music: 'space',
  subtitle: 'Pilote ta fusée jusqu\'aux vraies planètes du système solaire !',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="spCount">🚀 0/8</div>
        <button class="chip" id="spLeft">◀</button>
        <button class="chip" id="spRight">▶</button>
      </div>
      <div class="arena g3-arena sp3-arena" id="spArena">
        <div class="hint g3-hint" id="spHint">Touche une planète : ta fusée s'envole ! 🚀</div>
      </div>
      <div class="sp3-passport" id="spPassport">
        ${PLANETS.map(p => `<span class="sp3-dot" id="spDot_${p.id}" style="background:${p.base}"></span>`).join('')}
      </div>
      <div class="g3-bar sp3-fact" id="spFactBox" style="display:none">
        <div class="sp3-name" id="spFactName"></div>
        <div class="sp3-text" id="spFactText"></div>
        <div class="g3-row">
          <button class="g3-btn" id="spBack">🚀 Continuer</button>
          <button class="g3-btn" id="spDiploma" style="display:none">🌟 J'ai mon diplôme !</button>
        </div>
      </div>`

    const arena = $('spArena')
    const hideLoader = loader(arena, '🚀')

    ;(async () => {
      const stage: Stage = await createStage(arena, {
        sky: '#05060F',
        cam: [0, 9.5, 19], target: [0, 0, 0], fov: 52,
        hemi: ['#2A3A6A', '#05060F', 0.35],
        noSun: true, exposure: 1.0
      })
      if (dead) { stage.dispose(); return }
      hideLoader()
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
        new T.MeshBasicMaterial({ color: 0xFFD98A })
      )
      scene.add(sun)
      const glow = new T.Sprite(new T.SpriteMaterial({
        map: stage.keep(dotTex(T, '#FFC24A')), color: 0xFFB13A,
        transparent: true, blending: T.AdditiveBlending, depthWrite: false
      }))
      glow.scale.setScalar(3.6)
      scene.add(glow)
      const sunLight = new T.PointLight(0xFFF0D0, 260, 46, 2)
      scene.add(sunLight)
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
      const planets = PLANETS.map((def, i) => {
        const grp = new T.Group()
        const mesh = new T.Mesh(
          new T.SphereGeometry(def.radius, 40, 28),
          new T.MeshStandardMaterial({ map: stage.keep(planetTex(T, def)), roughness: 0.88, metalness: 0.02 })
        )
        mesh.rotation.z = def.tilt
        grp.add(mesh)
        if (def.clouds) {
          const cl = new T.Mesh(
            new T.SphereGeometry(def.radius * 1.03, 32, 22),
            new T.MeshStandardMaterial({
              map: stage.keep(cloudTex(T)), transparent: true, opacity: 0.75, roughness: 1, depthWrite: false
            })
          )
          cl.rotation.z = def.tilt
          grp.add(cl)
          grp.userData.clouds = cl
        }
        if (def.ring) {
          const [ri, ro, col] = def.ring
          const rg = new T.Mesh(
            new T.RingGeometry(def.radius * ri, def.radius * ro, 96, 1),
            new T.MeshBasicMaterial({
              map: stage.keep(ringTex(T, col)), transparent: true, side: T.DoubleSide, depthWrite: false
            })
          )
          rg.rotation.x = -Math.PI / 2 + 0.02
          rg.rotation.z = def.tilt
          rg.rotation.y = def.tilt
          const holder = new T.Group()
          holder.rotation.z = def.tilt
          holder.add(rg)
          grp.add(holder)
        }
        // Lunes : de simples cailloux gris qui tournent
        const moons: any[] = []
        for (let k = 0; k < (def.moons || 0); k++) {
          const m = new T.Mesh(
            new T.SphereGeometry(def.radius * (0.14 + k * 0.03), 12, 10),
            new T.MeshStandardMaterial({ color: 0xB8B2A8, roughness: 0.95 })
          )
          grp.add(m)
          moons.push({ m, d: def.radius * (1.9 + k * 0.7), s: 0.8 + k * 0.4, ph: Math.random() * 6 })
        }
        // Zone tapable généreuse : les petites planètes sont dures à viser
        const hit = new T.Mesh(
          new T.SphereGeometry(Math.max(def.radius * 1.55, 0.42), 12, 10),
          new T.MeshBasicMaterial({ visible: false })
        )
        hit.userData.pid = def.id
        grp.add(hit)
        scene.add(grp)
        return { def, grp, mesh, hit, moons, phase: (i * 2.1) % (Math.PI * 2) }
      })

      const sunHit = new T.Mesh(
        new T.SphereGeometry(1.25, 14, 12),
        new T.MeshBasicMaterial({ visible: false })
      )
      sunHit.userData.pid = 'soleil'
      scene.add(sunHit)

      const rocket = makeRocket(T)
      rocket.group.position.set(2.9, 3.1, 7.2)
      scene.add(rocket.group)

      S = {
        stage, planets, rocket, sun, glow, sunLight, fill, visited: new Set<string>(),
        busy: false, target: null, flyT: 0, t: 0, finaled: false,
        orbit: orbitCam(stage, 19, 9.5, [0, 0, 0]),
        tmp: new T.Vector3(), tmp2: new T.Vector3()
      }
      updatePassport()

      /* --- Toucher une planète --- */
      const pick = picker(stage)
      const onTap = (e: PointerEvent) => {
        if (!S || S.busy) return
        const hits = pick(e, [...planets.map(p => p.hit), sunHit])
        if (!hits.length) return
        let o: any = hits[0].object
        while (o && !o.userData.pid) o = o.parent
        if (o?.userData.pid) {
          visit(o.userData.pid)
          $('spHint').style.opacity = '0'
        }
      }
      stage.renderer.domElement.addEventListener('pointerdown', onTap)

      $('spLeft').onclick = () => { S?.orbit.turn(-0.5); sPop() }
      $('spRight').onclick = () => { S?.orbit.turn(0.5); sPop() }
      $('spBack').onclick = () => back()
      $('spDiploma').onclick = () => {
        ctx.finish({
          title: 'Astronaute diplômée ! 🚀',
          msg: `${ctx.playerName} a exploré tout le système solaire 🪐✨`,
          stars: 3, starsEarned: 3
        })
      }

      ctx.say('Bienvenue dans l\'espace ! Voici le Soleil, une étoile géante. Autour de lui vivent huit planètes. Touche-en une pour la visiter avec ta fusée !')

      /* --- Boucle --- */
      const goal = new T.Vector3()
      stage.start((dt, now) => {
        if (!S) return
        // Le système ralentit pendant une visite : on regarde tranquillement
        S.t += dt * (S.busy ? 0.15 : 1)

        for (const p of S.planets) {
          planetPos(p, S.t, p.grp.position)
          p.mesh.rotation.y += dt * 0.35
          if (p.grp.userData.clouds) p.grp.userData.clouds.rotation.y += dt * 0.24
          for (const mo of p.moons) {
            const a = mo.ph + S.t * mo.s * 2.4
            mo.m.position.set(Math.cos(a) * mo.d, Math.sin(a) * mo.d * 0.3, Math.sin(a) * mo.d)
          }
        }
        S.sun.rotation.y += dt * 0.05
        S.glow.scale.setScalar(3.6 + Math.sin(now / 900) * 0.18)

        // Cible de la fusée et de la caméra
        if (S.target) {
          const p = S.target === 'soleil' ? null : S.planets.find((x: any) => x.def.id === S.target)
          const rad = p ? p.def.radius : 0.92
          goal.copy(p ? p.grp.position : S.sun.position)
          const near = Math.max(1.1, rad * 3.4)
          S.orbit.look = [goal.x, goal.y, goal.z]
          S.orbit.dist = near
          S.orbit.height = rad * 0.9
          S.orbit.auto = 0.22
          // La fusée se pose à côté
          const rp = S.rocket.group.position
          const want = S.tmp.copy(goal)
          want.x += rad * 1.5; want.y += rad * 0.5; want.z += rad * 1.5
          rp.lerp(want, Math.min(1, dt * 2.2))
          S.rocket.group.lookAt(goal)
          S.rocket.group.rotateX(Math.PI / 2)
          S.flyT += dt
          if (S.flyT > 1.1 && !S.arrived) { S.arrived = true; arrive() }
        } else {
          S.arrived = false
          S.orbit.look = [0, 0, 0]
          S.orbit.dist = 19
          S.orbit.height = 9.5
          S.orbit.auto = 0.035
          const rp = S.rocket.group.position
          rp.lerp(S.tmp2.set(2.9, 3.1, 7.2), Math.min(1, dt * 1.6))
          S.rocket.group.rotation.set(0, now / 2600, 0)
        }
        S.rocket.flame.scale.setScalar(0.7 + Math.sin(now / 45) * 0.25)
        S.orbit.update(dt)
        S.fill.position.copy(stage.camera.position)
      })

      S.cleanup = () => {
        stage.renderer.domElement.removeEventListener('pointerdown', onTap)
        stage.dispose()
      }
    })().catch(() => { hideLoader(); ctx.toast('La 3D n\'est pas disponible ici 😕') })

    return () => {
      dead = true
      if (S) {
        try { S.cleanup?.() } catch { /* déjà démonté */ }
        S = null
      }
    }
  }
}
