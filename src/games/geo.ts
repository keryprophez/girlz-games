import type { GameContext, GameDef } from '../core/types'
import { $, pick } from '../core/utils'
import { loadAtlas, frameStyle, type Atlas } from '../core/sprites'
import { createStage, loader, loadThree, picker, dotTex, type Stage, type T3 } from '../core/three3d'
import { particles, type Particles } from '../core/scene3d'
import { ICON } from '../core/icons'
import { sfx, preloadSfx } from '../core/sfx'
import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson'

/* Le Tour du Monde — de la VRAIE géographie (2/09).

   Deux cartes :
   - le MONDE : un globe avec la Terre de la NASA (Blue Marble) et les vrais
     contours des pays (Natural Earth). On le fait tourner au doigt ;
   - la FRANCE : les treize grandes régions en relief (IGN Admin Express) et
     les grandes villes en épingles.

   Deux façons de jouer, sans lire, sans sanction (univers Apprendre) :
   - EXPLORE : on touche, ça s'illumine, la voix dit le nom (du contenu,
     jamais une consigne) ;
   - TROUVE : la voix dit un nom — ou un animal apparaît et il faut toucher
     le continent où il vit — et on cherche. Deuxième essai, puis on montre.

   Le niveau choisit la question : douce = animaux et grandes villes ;
   normale = mélange ; expert = pays et régions. */

/* ---------- Données : continents, animaux, pays, villes ---------- */
type ContinentId = 'europe' | 'afrique' | 'asie' | 'oceanie' | 'amNord' | 'amSud' | 'antarctique'
const CONTINENTS: Record<ContinentId, { fr: string; color: number; countries: string[] }> = {
  europe: { fr: "l'Europe", color: 0x4FB8E7, countries: ['Albania', 'Austria', 'Belarus', 'Belgium', 'Bosnia and Herz.', 'Bulgaria', 'Croatia', 'Cyprus', 'N. Cyprus', 'Czechia', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Iceland', 'Ireland', 'Italy', 'Kosovo', 'Latvia', 'Lithuania', 'Luxembourg', 'Macedonia', 'Moldova', 'Montenegro', 'Netherlands', 'Norway', 'Poland', 'Portugal', 'Romania', 'Serbia', 'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland', 'Ukraine', 'United Kingdom'] },
  afrique: { fr: "l'Afrique", color: 0xFFB84D, countries: ['Algeria', 'Angola', 'Benin', 'Botswana', 'Burkina Faso', 'Burundi', 'Cameroon', 'Central African Rep.', 'Chad', 'Congo', "Côte d'Ivoire", 'Dem. Rep. Congo', 'Djibouti', 'Egypt', 'Eq. Guinea', 'Eritrea', 'Ethiopia', 'Gabon', 'Gambia', 'Ghana', 'Guinea', 'Guinea-Bissau', 'Kenya', 'Lesotho', 'Liberia', 'Libya', 'Madagascar', 'Malawi', 'Mali', 'Mauritania', 'Morocco', 'Mozambique', 'Namibia', 'Niger', 'Nigeria', 'Rwanda', 'S. Sudan', 'Senegal', 'Sierra Leone', 'Somalia', 'Somaliland', 'South Africa', 'Sudan', 'Tanzania', 'Togo', 'Tunisia', 'Uganda', 'W. Sahara', 'Zambia', 'Zimbabwe', 'eSwatini'] },
  asie: { fr: "l'Asie", color: 0xF58FB8, countries: ['Afghanistan', 'Armenia', 'Azerbaijan', 'Bangladesh', 'Bhutan', 'Brunei', 'Cambodia', 'China', 'Georgia', 'India', 'Indonesia', 'Iran', 'Iraq', 'Israel', 'Japan', 'Jordan', 'Kazakhstan', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Lebanon', 'Malaysia', 'Mongolia', 'Myanmar', 'Nepal', 'North Korea', 'Oman', 'Pakistan', 'Palestine', 'Philippines', 'Qatar', 'Russia', 'Saudi Arabia', 'South Korea', 'Sri Lanka', 'Syria', 'Taiwan', 'Tajikistan', 'Thailand', 'Timor-Leste', 'Turkey', 'Turkmenistan', 'United Arab Emirates', 'Uzbekistan', 'Vietnam', 'Yemen'] },
  oceanie: { fr: "l'Océanie", color: 0xB197FC, countries: ['Australia', 'Fiji', 'New Caledonia', 'New Zealand', 'Papua New Guinea', 'Solomon Is.', 'Vanuatu'] },
  amNord: { fr: "l'Amérique du Nord", color: 0x5EC97B, countries: ['Bahamas', 'Belize', 'Canada', 'Costa Rica', 'Cuba', 'Dominican Rep.', 'El Salvador', 'Greenland', 'Guatemala', 'Haiti', 'Honduras', 'Jamaica', 'Mexico', 'Nicaragua', 'Panama', 'Puerto Rico', 'Trinidad and Tobago', 'United States of America'] },
  amSud: { fr: "l'Amérique du Sud", color: 0xFF7B6B, countries: ['Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Ecuador', 'Falkland Is.', 'Guyana', 'Paraguay', 'Peru', 'Suriname', 'Uruguay', 'Venezuela'] },
  antarctique: { fr: "l'Antarctique", color: 0xDCEEFF, countries: ['Antarctica', 'Fr. S. Antarctic Lands'] }
}
const CONTINENT_OF: Record<string, ContinentId> = {}
for (const [id, c] of Object.entries(CONTINENTS) as [ContinentId, typeof CONTINENTS[ContinentId]][]) for (const n of c.countries) CONTINENT_OF[n] = id

/** Où vit chaque animal de la planche Kenney (pour la question de Jade). */
const ANIMALS: { frame: string; fr: string; continent: ContinentId }[] = [
  { frame: 'panda', fr: 'le panda', continent: 'asie' },
  { frame: 'penguin', fr: 'le pingouin', continent: 'antarctique' },
  { frame: 'giraffe', fr: 'la girafe', continent: 'afrique' },
  { frame: 'zebra', fr: 'le zèbre', continent: 'afrique' },
  { frame: 'elephant', fr: "l'éléphant", continent: 'afrique' },
  { frame: 'hippo', fr: "l'hippopotame", continent: 'afrique' },
  { frame: 'moose', fr: "l'élan", continent: 'amNord' },
  { frame: 'buffalo', fr: 'le bison', continent: 'amNord' },
  { frame: 'sloth', fr: 'le paresseux', continent: 'amSud' },
  { frame: 'parrot', fr: 'le perroquet', continent: 'amSud' },
  { frame: 'cow', fr: 'la vache', continent: 'europe' },
  { frame: 'crocodile', fr: 'le crocodile', continent: 'oceanie' },
  { frame: 'whale', fr: 'la baleine', continent: 'antarctique' }
]

/** Les pays de la question « Trouve le pays » : nom Natural Earth → nom dit. */
const COUNTRIES_FR: Record<string, string> = {
  France: 'la France', Spain: "l'Espagne", Italy: "l'Italie", Germany: "l'Allemagne", 'United Kingdom': "l'Angleterre",
  Portugal: 'le Portugal', Belgium: 'la Belgique', Switzerland: 'la Suisse', Greece: 'la Grèce', Norway: 'la Norvège',
  Morocco: 'le Maroc', Egypt: "l'Égypte", Madagascar: 'Madagascar', 'South Africa': "l'Afrique du Sud", Kenya: 'le Kenya',
  China: 'la Chine', India: "l'Inde", Japan: 'le Japon', Russia: 'la Russie', Turkey: 'la Turquie',
  Australia: "l'Australie", 'United States of America': 'les États-Unis', Canada: 'le Canada', Mexico: 'le Mexique',
  Brazil: 'le Brésil', Argentina: "l'Argentine", Greenland: 'le Groenland'
}

/** Les grandes villes : nom dit, longitude, latitude. Saint-Maximin, c'est chez elles. */
const CITIES = [
  { fr: 'Paris', lon: 2.3522, lat: 48.8566, big: true },
  { fr: 'Marseille', lon: 5.3698, lat: 43.2965, big: true },
  { fr: 'Saint-Maximin', lon: 5.8611, lat: 43.4517, big: true },
  { fr: 'Lyon', lon: 4.8357, lat: 45.764, big: true },
  { fr: 'Nice', lon: 7.262, lat: 43.7102, big: true },
  { fr: 'Toulouse', lon: 1.4442, lat: 43.6047, big: true },
  { fr: 'Bordeaux', lon: -0.5792, lat: 44.8378, big: true },
  { fr: 'Lille', lon: 3.0573, lat: 50.6292, big: false },
  { fr: 'Nantes', lon: -1.5536, lat: 47.2184, big: false },
  { fr: 'Strasbourg', lon: 7.7521, lat: 48.5734, big: false },
  { fr: 'Rennes', lon: -1.6778, lat: 48.1173, big: false },
  { fr: 'Montpellier', lon: 3.8767, lat: 43.6108, big: false },
  { fr: 'Brest', lon: -4.4861, lat: 48.3904, big: false },
  { fr: 'Ajaccio', lon: 8.7386, lat: 41.9192, big: false }
]
const REGION_COLORS = [0x4FB8E7, 0xFFB84D, 0x5EC97B, 0xF58FB8, 0xB197FC, 0xFF7B6B, 0x8CE99A, 0xFFE08A, 0x8CC9F5, 0xFFC2D6, 0xC3E88D, 0xF6C177, 0x9FD8D0]

/* ---------- Géométrie ---------- */
const R = 2.1
const D2R = Math.PI / 180
/** lon/lat → point sur la sphère, dans le repère de SphereGeometry (u=0 à lon −180). */
function toSphere(T: T3, lon: number, lat: number, r = R) {
  const theta = (90 - lat) * D2R, phi = (lon + 180) * D2R
  return new T.Vector3(-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta))
}
/** Point local sur la sphère → lon/lat. */
function fromSphere(p: { x: number; y: number; z: number }) {
  const len = Math.hypot(p.x, p.y, p.z) || 1
  const theta = Math.acos(p.y / len)
  let phi = Math.atan2(p.z, -p.x)
  if (phi < 0) phi += Math.PI * 2
  let lon = phi / D2R - 180
  if (lon > 180) lon -= 360
  return { lon, lat: 90 - theta / D2R }
}
function inRing(ring: number[][], lon: number, lat: number) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
function inFeature(f: Feature<Polygon | MultiPolygon>, lon: number, lat: number) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  for (const poly of polys) {
    if (!inRing(poly[0], lon, lat)) continue
    let hole = false
    for (let k = 1; k < poly.length; k++) if (inRing(poly[k], lon, lat)) { hole = true; break }
    if (!hole) return true
  }
  return false
}
/** Projection plane de la France (équirectangulaire centrée, en unités de scène). */
const F0 = { lon: 2.4, lat: 46.6, k: 0.44 }
const fx = (lon: number) => (lon - F0.lon) * Math.cos(F0.lat * D2R) * F0.k
const fz = (lat: number) => -(lat - F0.lat) * F0.k

/* ---------- État ---------- */
type MapId = 'monde' | 'france'
type Mode = 'explore' | 'trouve'
type Target =
  | { kind: 'animal'; animal: typeof ANIMALS[number] }
  | { kind: 'pays'; name: string }
  | { kind: 'ville'; city: typeof CITIES[number] }
  | { kind: 'region'; nom: string }

interface State {
  stage: Stage
  T: T3
  fx: Particles
  animals: Atlas
  countries: Feature<Polygon | MultiPolygon>[]
  regions: Feature<Polygon | MultiPolygon>[]
  globe: import('three').Group
  earth: import('three').Mesh
  overlay: { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: import('three').CanvasTexture }
  france: import('three').Group
  regionMeshes: Map<string, import('three').Mesh>
  cityPins: { city: typeof CITIES[number]; grp: import('three').Group; hit: import('three').Mesh }[]
  map: MapId
  mode: Mode
  spin: number; tilt: number; vSpin: number; vTilt: number
  idle: number
  selected: string | null
  target: Target | null
  tries: number
  asked: number
  errors: number
  total: number
  busy: boolean
  over: boolean
  ui: { bar: HTMLElement; ask: HTMLElement; askImg: HTMLElement; say: HTMLElement; dots: HTMLElement; done: HTMLElement }
  camFrom: import('three').Vector3
  camTo: import('three').Vector3
  camLook: import('three').Vector3
}

let geo: State | null = null
let ctx: GameContext

/* ---------- Le globe : peindre l'habillage (frontières + sélection) ---------- */
function paintOverlay(me: State, fill: { names: string[]; color: number } | null) {
  const { canvas, g, tex } = me.overlay
  const W = canvas.width, H = canvas.height
  const X = (lon: number) => ((lon + 180) / 360) * W
  const Y = (lat: number) => ((90 - lat) / 180) * H
  g.clearRect(0, 0, W, H)
  const trace = (f: Feature<Polygon | MultiPolygon>) => {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    g.beginPath()
    for (const poly of polys) for (const ring of poly) {
      ring.forEach(([lon, lat], i) => (i ? g.lineTo(X(lon), Y(lat)) : g.moveTo(X(lon), Y(lat))))
      g.closePath()
    }
  }
  if (fill) {
    const c = '#' + fill.color.toString(16).padStart(6, '0')
    for (const f of me.countries) {
      if (!fill.names.includes(f.properties!.name)) continue
      trace(f)
      g.fillStyle = c; g.globalAlpha = 0.62; g.fill('evenodd'); g.globalAlpha = 1
    }
  }
  g.strokeStyle = 'rgba(255,255,255,0.55)'
  g.lineWidth = 1.6
  for (const f of me.countries) { trace(f); g.stroke() }
  tex.needsUpdate = true
}

function selectCountry(me: State, name: string | null, asContinent: boolean) {
  me.selected = name
  if (!name) { paintOverlay(me, null); return }
  if (asContinent) {
    const cid = CONTINENT_OF[name]
    if (!cid) { paintOverlay(me, { names: [name], color: 0xFFFFFF }); return }
    paintOverlay(me, { names: CONTINENTS[cid].countries, color: CONTINENTS[cid].color })
  } else paintOverlay(me, { names: [name], color: 0xFFE08A })
}

/* ---------- La France : régions en relief, villes en épingles ---------- */
function selectRegion(me: State, nom: string | null) {
  me.selected = nom
  for (const [n, m] of me.regionMeshes) {
    const on = n === nom
    m.position.y = on ? 0.16 : 0
    const mat = m.material as import('three').MeshStandardMaterial
    mat.emissive.setHex(on ? 0xFFFFFF : 0x000000)
    mat.emissiveIntensity = on ? 0.35 : 0
  }
}
function pulseCity(me: State, city: typeof CITIES[number] | null) {
  for (const p of me.cityPins) {
    const on = p.city === city
    p.grp.scale.setScalar(on ? 1.6 : 1)
    ;(p.grp.userData as { pulse: number }).pulse = on ? 1 : 0
  }
}

/* ---------- Le jeu ---------- */
function speak(me: State) {
  const t = me.target
  if (!t) return
  if (t.kind === 'animal') ctx.say(t.animal.fr)
  else if (t.kind === 'pays') ctx.say(COUNTRIES_FR[t.name])
  else if (t.kind === 'ville') ctx.say(t.city.fr)
  else ctx.say(t.nom)
}

function nextQuestion(me: State) {
  if (me.over) return
  if (me.asked >= me.total) { finishRound(me); return }
  me.tries = 0
  me.busy = false
  const tier = ctx.tier
  let t: Target
  if (me.map === 'monde') {
    const animal = tier === 'easy' ? true : tier === 'med' ? Math.random() < 0.5 : false
    if (animal) t = { kind: 'animal', animal: pick(ANIMALS.filter(a => me.animals.frames[a.frame])) }
    else t = { kind: 'pays', name: pick(Object.keys(COUNTRIES_FR).filter(n => me.countries.some(f => f.properties!.name === n))) }
  } else {
    const city = tier === 'easy' ? true : tier === 'med' ? Math.random() < 0.5 : false
    if (city) t = { kind: 'ville', city: pick(CITIES.filter(c => tier === 'easy' ? c.big : true)) }
    else t = { kind: 'region', nom: pick(me.regions.map(r => (r.properties as { nom: string }).nom)) }
  }
  me.target = t
  me.asked++
  // La carte de question : l'animal en grand, ou un haut-parleur pour réentendre
  me.ui.askImg.innerHTML = ''
  if (t.kind === 'animal') {
    const i = document.createElement('i')
    i.className = 'spr'
    i.setAttribute('style', frameStyle(me.animals, t.animal.frame, 96))
    me.ui.askImg.appendChild(i)
  }
  me.ui.dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('cur', i === me.asked - 1))
  me.ui.ask.classList.remove('off')
  if (me.map === 'monde') selectCountry(me, null, false); else { selectRegion(me, null); pulseCity(me, null) }
  speak(me)
}

function judge(me: State, ok: boolean, tappedName: string | null) {
  if (me.busy) return
  if (ok) {
    me.busy = true
    sfx('confirm', { vol: 0.8 })
    me.ui.dots.querySelectorAll('i')[me.asked - 1]?.classList.add('ok')
    me.stage.timeScale = 1
    window.setTimeout(() => { if (geo === me) nextQuestion(me) }, 1400)
    return
  }
  me.tries++
  me.errors++
  sfx('error', { vol: 0.45 })
  // On dit ce qu'on a touché (du contenu : c'est comme ça qu'on apprend), et
  // au deuxième raté on montre la bonne réponse, qu'il faut toucher pour continuer
  if (tappedName) ctx.say(tappedName)
  if (me.tries >= 2) reveal(me)
}

function reveal(me: State) {
  const t = me.target!
  if (t.kind === 'animal') selectCountry(me, CONTINENTS[t.animal.continent].countries[0], true)
  else if (t.kind === 'pays') selectCountry(me, t.name, false)
  else if (t.kind === 'region') selectRegion(me, t.nom)
  else pulseCity(me, t.city)
  window.setTimeout(() => { if (geo === me) speak(me) }, 700)
}

function finishRound(me: State) {
  if (me.over) return
  me.over = true
  const e = me.errors
  const stars = e <= 1 ? 3 : e <= 4 ? 2 : 1
  ctx.finish({
    title: me.map === 'monde' ? 'Tour du monde !' : 'Tour de France !',
    msg: `${ctx.playerName} a trouvé ${me.total} ${me.map === 'monde' ? 'endroits sur le globe' : 'endroits en France'}`,
    stars, starsEarned: stars, outroMs: 400
  })
}

/** Un tap sur la carte : en Explore on nomme, en Trouve on juge. */
function tapped(me: State, hit: { kind: 'pays' | 'ville' | 'region'; name: string; city?: typeof CITIES[number] }) {
  const t = me.target
  if (me.mode === 'explore' || !t) {
    if (hit.kind === 'pays') {
      // Sur le globe, en douce on nomme le continent, sinon le pays
      const asCont = ctx.tier === 'easy' && !!CONTINENT_OF[hit.name]
      selectCountry(me, hit.name, asCont)
      ctx.say(asCont ? CONTINENTS[CONTINENT_OF[hit.name]].fr : (COUNTRIES_FR[hit.name] ?? CONTINENTS[CONTINENT_OF[hit.name]]?.fr ?? hit.name))
    } else if (hit.kind === 'region') { selectRegion(me, hit.name); pulseCity(me, null); ctx.say(hit.name) }
    else { pulseCity(me, hit.city!); ctx.say(hit.name) }
    sfx('pluck', { vol: 0.5 })
    return
  }
  if (t.kind === 'animal' && hit.kind === 'pays') {
    const cid = CONTINENT_OF[hit.name]
    selectCountry(me, hit.name, true)
    if (cid === t.animal.continent) { judge(me, true, null); animalJumps(me, hit.name) }
    else judge(me, false, cid ? CONTINENTS[cid].fr : null)
  } else if (t.kind === 'pays' && hit.kind === 'pays') {
    selectCountry(me, hit.name, false)
    judge(me, hit.name === t.name, COUNTRIES_FR[hit.name] ?? null)
  } else if (t.kind === 'ville' && hit.kind === 'ville') {
    pulseCity(me, hit.city!)
    judge(me, hit.city === t.city, hit.name)
  } else if (t.kind === 'region' && hit.kind === 'region') {
    selectRegion(me, hit.name)
    judge(me, hit.name === t.nom, hit.name)
  } else if (t.kind === 'ville' && hit.kind === 'region') {
    // On cherchait une ville, on a touché une région : on la nomme, ça ne compte pas
    selectRegion(me, hit.name); ctx.say(hit.name)
  } else if (t.kind === 'region' && hit.kind === 'ville') {
    pulseCity(me, hit.city!); ctx.say(hit.name)
  }
}

/** Bravo : des étincelles sur l'endroit trouvé. */
function animalJumps(me: State, countryName: string) {
  const f = me.countries.find(c => c.properties!.name === countryName)
  if (!f) return
  const ring = (f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0])
  const c = ring[Math.floor(ring.length / 2)]
  const p = toSphere(me.T, c[0], c[1], R + 0.05)
  me.globe.localToWorld(p)
  me.fx.burst(p, { count: 30, color: [0xFFE08A, 0xFFFFFF, 0xFFB84D], speed: 1.2, life: 0.9, size: 0.12, gravity: 0.5 })
}

/* ---------- Montage ---------- */
export const geoGame: GameDef = {
  id: 'geo', name: 'Le Tour du Monde', icon: '🌍', sq: 'sq-sky', cat: 'reflexion', duel: false, music: 'space',
  subtitle: 'Le vrai globe, les vrais pays, et la France avec ses régions et ses villes',
  mount(c) {
    ctx = c
    c.root.innerHTML = `<div class="arena g3-arena geo-arena" id="geoArena"></div>`
    const arena = $('geoArena')
    const hideLoader = loader(arena, '🌍', 25000)
    preloadSfx(['confirm', 'error', 'pluck', 'click'])
    let dead = false

    ;(async () => {
      const base = import.meta.env.BASE_URL
      const [T, animals, topo, regionsFc] = await Promise.all([
        loadThree(), loadAtlas('animals'),
        fetch(`${base}assets/geo/countries-110m.json`).then(r => r.json() as Promise<Topology<{ countries: GeometryCollection<{ name: string }> }>>),
        fetch(`${base}assets/geo/regions.geojson`).then(r => r.json() as Promise<FeatureCollection<Polygon | MultiPolygon, { nom: string }>>)
      ])
      if (dead) return
      const countries = (feature(topo, topo.objects.countries) as FeatureCollection<Polygon | MultiPolygon, { name: string }>).features
      if (import.meta.env.DEV) for (const f of countries) if (!CONTINENT_OF[f.properties.name]) console.warn('geo : pays sans continent →', f.properties.name)

      const stage = await createStage(arena, {
        sky: '#0B1026', ibl: false,
        cam: [0, 0.6, 6.4], target: [0, 0, 0], fov: 40,
        hemi: ['#9FB6D8', '#1B2340', 0.55],
        sun: { pos: [5, 3, 6], color: '#FFF6E6', intensity: 2.4, area: 4, far: 20 },
        fill: 0.3, exposure: 1.0
      })
      if (dead) { stage.dispose(); return }
      const { scene } = stage

      // Des étoiles derrière
      const starGeo = new T.BufferGeometry()
      const sp = new Float32Array(900 * 3)
      for (let i = 0; i < 900; i++) {
        const v = new T.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 30)
        sp[i * 3] = v.x; sp[i * 3 + 1] = v.y; sp[i * 3 + 2] = v.z
      }
      starGeo.setAttribute('position', new T.BufferAttribute(sp, 3))
      scene.add(new T.Points(starGeo, new T.PointsMaterial({ size: 0.9, map: stage.keep(dotTex(T)), transparent: true, depthWrite: false })))

      /* --- Le globe --- */
      const globe = new T.Group()
      const earthTex = stage.keep(new T.TextureLoader().load(`${base}assets/geo/earth.jpg`))
      earthTex.colorSpace = T.SRGBColorSpace; earthTex.anisotropy = 4
      const earth = new T.Mesh(new T.SphereGeometry(R, 96, 64), new T.MeshStandardMaterial({ map: earthTex, roughness: 0.85, metalness: 0 }))
      earth.castShadow = false
      globe.add(earth)
      const canvas = document.createElement('canvas')
      canvas.width = 2048; canvas.height = 1024
      const g = canvas.getContext('2d')!
      const otex = stage.keep(new T.CanvasTexture(canvas))
      otex.colorSpace = T.SRGBColorSpace; otex.anisotropy = 4
      const overlay = new T.Mesh(new T.SphereGeometry(R + 0.006, 96, 64), new T.MeshBasicMaterial({ map: otex, transparent: true, depthWrite: false }))
      globe.add(overlay)
      // Une fine atmosphère
      const halo = new T.Mesh(new T.SphereGeometry(R * 1.035, 48, 32), new T.MeshBasicMaterial({ color: 0x6FB4FF, transparent: true, opacity: 0.12, side: T.BackSide }))
      globe.add(halo)
      globe.rotation.y = -0.35
      scene.add(globe)

      /* --- La France --- */
      const france = new T.Group()
      france.visible = false
      const sea = new T.Mesh(new T.CircleGeometry(9, 48), new T.MeshStandardMaterial({ color: 0x2F7FC7, roughness: 0.9 }))
      sea.rotation.x = -Math.PI / 2; sea.position.y = -0.02; sea.receiveShadow = true
      france.add(sea)
      const regionMeshes = new Map<string, import('three').Mesh>()
      regionsFc.features.forEach((f, i) => {
        const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
        const shapes: import('three').Shape[] = []
        for (const poly of polys) {
          const sh = new T.Shape(poly[0].map(([lon, lat]) => new T.Vector2(fx(lon), -fz(lat))))
          for (let k = 1; k < poly.length; k++) sh.holes.push(new T.Path(poly[k].map(([lon, lat]) => new T.Vector2(fx(lon), -fz(lat)))))
          shapes.push(sh)
        }
        const geom = new T.ExtrudeGeometry(shapes, { depth: 0.16, bevelEnabled: false })
        const mesh = new T.Mesh(geom, new T.MeshStandardMaterial({ color: REGION_COLORS[i % REGION_COLORS.length], roughness: 0.75 }))
        mesh.rotation.x = -Math.PI / 2
        mesh.castShadow = true; mesh.receiveShadow = true
        mesh.userData.nom = f.properties.nom
        const edges = new T.LineSegments(new T.EdgesGeometry(geom, 20), new T.LineBasicMaterial({ color: 0x3A2E24, transparent: true, opacity: 0.55 }))
        mesh.add(edges)
        france.add(mesh)
        regionMeshes.set(f.properties.nom, mesh)
      })
      const pinGeo = new T.SphereGeometry(0.085, 14, 10) // Marseille et Saint-Maximin sont voisines : des billes fines
      const stickGeo = new T.CylinderGeometry(0.025, 0.025, 0.34, 8)
      const hitGeo = new T.SphereGeometry(0.26, 8, 6)
      const cityPins = CITIES.map(city => {
        const grp = new T.Group()
        const ball = new T.Mesh(pinGeo, new T.MeshStandardMaterial({ color: city.big ? 0xFF5A6E : 0xFFB84D, roughness: 0.5 }))
        ball.position.y = 0.42
        const stick = new T.Mesh(stickGeo, new T.MeshStandardMaterial({ color: 0x3A2E24 }))
        stick.position.y = 0.18
        const hit = new T.Mesh(hitGeo, new T.MeshBasicMaterial({ transparent: true, opacity: 0 }))
        hit.position.y = 0.4
        hit.userData.city = city
        ball.castShadow = false // l'ombre d'une bille à 40 cm de haut couvre la mer
        grp.add(ball, stick, hit)
        grp.position.set(fx(city.lon), 0.16, fz(city.lat))
        grp.userData.pulse = 0
        france.add(grp)
        return { city, grp, hit }
      })
      scene.add(france)

      /* --- L'interface : cartes, modes, question, fin --- */
      const bar = document.createElement('div')
      bar.className = 'geo-bar'
      bar.innerHTML = `
        <button class="geo-btn on" data-map="monde" aria-label="Le monde">${ICON.globe}</button>
        <button class="geo-btn" data-map="france" aria-label="La France">${ICON.hexagon}</button>
        <span class="sep"></span>
        <button class="geo-btn on" data-mode="explore" aria-label="Explorer">${ICON.search}</button>
        <button class="geo-btn" data-mode="trouve" aria-label="Trouver">${ICON.target}</button>`
      arena.appendChild(bar)
      const ask = document.createElement('div')
      ask.className = 'geo-ask off'
      ask.innerHTML = `<span class="geo-askimg"></span><button class="geo-say" aria-label="Réécouter">${ICON.sound}</button><span class="geo-dots"></span>`
      arena.appendChild(ask)
      const done = document.createElement('button')
      done.className = 'geo-done'
      done.setAttribute('aria-label', "J'ai fini")
      done.innerHTML = ICON.check
      arena.appendChild(done)

      const me: State = {
        stage, T, fx: particles(stage, 300), animals, countries, regions: regionsFc.features,
        globe, earth, overlay: { canvas, g, tex: otex }, france, regionMeshes, cityPins,
        map: 'monde', mode: 'explore', spin: 0, tilt: 0.25, vSpin: 0, vTilt: 0, idle: 0,
        selected: null, target: null, tries: 0, asked: 0, errors: 0, total: 8, busy: false, over: false,
        ui: { bar, ask, askImg: ask.querySelector('.geo-askimg')!, say: ask.querySelector('.geo-say')!, dots: ask.querySelector('.geo-dots')!, done },
        camFrom: new T.Vector3(0, 0.6, 6.4), camTo: new T.Vector3(0, 0.6, 6.4), camLook: new T.Vector3(0, 0, 0)
      }
      me.ui.dots.innerHTML = Array.from({ length: me.total }, () => '<i></i>').join('')
      geo = me
      paintOverlay(me, null)
      hideLoader()

      const setMap = (m: MapId) => {
        me.map = m
        globe.visible = m === 'monde'
        france.visible = m === 'france'
        me.camTo.set(...(m === 'monde' ? [0, 0.6, 6.4] : [0, 6.6, 3.9]) as [number, number, number])
        me.camLook.set(0, 0, m === 'monde' ? 0 : -0.2)
        bar.querySelectorAll<HTMLElement>('[data-map]').forEach(b => b.classList.toggle('on', b.dataset.map === m))
        selectCountry(me, null, false); selectRegion(me, null); pulseCity(me, null)
        if (me.mode === 'trouve') startRound()
        sfx('click', { vol: 0.5 })
      }
      const startRound = () => {
        me.asked = 0; me.errors = 0; me.over = false; me.target = null
        me.ui.dots.querySelectorAll('i').forEach(d => d.classList.remove('ok', 'cur'))
        nextQuestion(me)
      }
      const setMode = (m: Mode) => {
        me.mode = m
        bar.querySelectorAll<HTMLElement>('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m))
        done.style.display = m === 'explore' ? '' : 'none'
        if (m === 'explore') { me.ui.ask.classList.add('off'); me.target = null }
        else startRound()
        sfx('click', { vol: 0.5 })
      }
      bar.addEventListener('click', e => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('.geo-btn')
        if (!b) return
        if (b.dataset.map) setMap(b.dataset.map as MapId)
        if (b.dataset.mode) setMode(b.dataset.mode as Mode)
      })
      me.ui.say.addEventListener('click', () => speak(me))
      done.addEventListener('click', () => {
        if (me.over) return
        me.over = true
        ctx.finish({ title: 'Belle exploration !', msg: `${ctx.playerName} a exploré ${me.map === 'monde' ? 'le globe' : 'la France'}`, stars: 3, starsEarned: 3 })
      })

      /* --- Le doigt : glisser fait tourner le globe, un tap touche --- */
      const pick3 = picker(stage)
      let down: { x: number; y: number; t: number } | null = null
      let lastMove: { x: number; y: number } | null = null
      const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; lastMove = { x: e.clientX, y: e.clientY }; me.vSpin = 0; me.vTilt = 0 }
      const onMove = (e: PointerEvent) => {
        if (!down || !lastMove || me.map !== 'monde') return
        const dx = e.clientX - lastMove.x, dy = e.clientY - lastMove.y
        me.spin += dx * 0.006; me.tilt = Math.max(-1.1, Math.min(1.1, me.tilt + dy * 0.006))
        me.vSpin = dx * 0.006 * 60; me.vTilt = dy * 0.006 * 60
        me.idle = 0
        lastMove = { x: e.clientX, y: e.clientY }
      }
      const onUp = (e: PointerEvent) => {
        if (!down) return
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
        const quick = performance.now() - down.t < 450
        down = null; lastMove = null
        if (moved > 12 || !quick) return
        me.idle = 0
        if (me.map === 'monde') {
          const hits = pick3(e, [earth], false)
          if (!hits.length) return
          const local = globe.worldToLocal(hits[0].point.clone())
          const { lon, lat } = fromSphere(local)
          const f = countries.find(c => inFeature(c, lon, lat))
          if (!f) { sfx('drop', { vol: 0.2, rate: 0.7 }); return } // la mer
          tapped(me, { kind: 'pays', name: f.properties.name })
        } else {
          const onPin = pick3(e, cityPins.map(p => p.hit), false)
          if (onPin.length) { const city = onPin[0].object.userData.city as typeof CITIES[number]; tapped(me, { kind: 'ville', name: city.fr, city }); return }
          const onRegion = pick3(e, [...regionMeshes.values()], false)
          if (onRegion.length) { const nom = onRegion[0].object.userData.nom as string; tapped(me, { kind: 'region', name: nom }); return }
          sfx('drop', { vol: 0.2, rate: 0.7 })
        }
      }
      const el = stage.renderer.domElement
      el.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', () => { down = null; lastMove = null })

      // Accroche pour les bots : quel pays à telle lon/lat, et l'état
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __geo: unknown }).__geo = {
          pick: (lon: number, lat: number) => countries.find(c => inFeature(c, lon, lat))?.properties.name ?? null,
          continentOf: (n: string) => CONTINENT_OF[n] ?? null,
          unassigned: () => countries.filter(c => !CONTINENT_OF[c.properties.name]).map(c => c.properties.name),
          state: () => ({ map: me.map, mode: me.mode, asked: me.asked, target: me.target, selected: me.selected }),
          tapAt: (x: number, y: number) => {
            const hits = pick3({ clientX: x, clientY: y }, [earth], false)
            if (!hits.length) return null
            const { lon, lat } = fromSphere(globe.worldToLocal(hits[0].point.clone()))
            return { lon, lat, name: countries.find(c => inFeature(c, lon, lat))?.properties.name ?? null }
          },
          setMap, setMode
        }
      }

      stage.start(dt => {
        if (geo !== me) return
        me.idle += dt
        if (me.map === 'monde') {
          if (!down) {
            me.spin += me.vSpin * dt; me.tilt += me.vTilt * dt
            me.vSpin *= Math.pow(0.05, dt); me.vTilt *= Math.pow(0.05, dt)
            me.tilt = Math.max(-1.1, Math.min(1.1, me.tilt))
            if (me.idle > 2.5 && Math.abs(me.vSpin) < 0.05) me.spin += 0.05 * dt // tourne tout seul quand on regarde
          }
          globe.rotation.set(me.tilt, me.spin, 0, 'XYZ')
        } else {
          for (const p of cityPins) {
            const u = p.grp.userData as { pulse: number }
            if (u.pulse) p.grp.scale.setScalar(1.35 + Math.sin(performance.now() / 160) * 0.25)
          }
        }
        // La caméra glisse entre le globe et la France
        const cam = stage.camera
        cam.position.lerp(me.camTo, Math.min(1, dt * 3.5))
        cam.lookAt(me.camLook)
        me.fx.update(dt)
      })

      stage.keep({ dispose() {
        el.removeEventListener('pointerdown', onDown)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        bar.remove(); ask.remove(); done.remove()
        me.fx.dispose()
        starGeo.dispose(); pinGeo.dispose(); stickGeo.dispose(); hitGeo.dispose()
      } })
    })().catch(err => { if (!dead) throw err })

    return () => {
      dead = true
      if (geo) { geo.stage.dispose(); geo = null }
    }
  }
}
