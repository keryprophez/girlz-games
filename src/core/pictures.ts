import { withRenderer } from './portraits'
import { loadModel, fitModel, type Stage, type T3 } from './three3d'
import { critterKit, type CritterKind } from './critters'
import { makePrincess, posePrincess } from './princess3d'
import { makePet } from './pet3d'
import { makeDecor } from './castle3d'
import { makeRocket } from './rocket3d'
import { royalKey, type Royal } from './royal'
import { diskGet, diskPut } from './diskcache'
import type { Particles } from './scene3d'

/* LES IMAGES DU PUZZLE (30/09) — tirées de LEURS créations, au format du
   plateau (4:3) : la ferme en 3D, leur princesse dans la salle de bal, une
   belle vue de l'Espace avec leur fusée, et leurs dessins de l'Atelier
   (ceux-là sont composés par `drawingPicture` de `games/coloring.ts`).

   Chaque image est un rendu 3D fait UNE fois, dans un contexte WebGL
   jetable (`withRenderer`), comme les portraits : gardée en mémoire le temps
   de la session, et sur le disque (`core/diskcache.ts`) pour la ferme,
   l'Espace et la princesse (par tenue) — la deuxième ouverture de l'appli ne
   recalcule rien. Même style que les jeux 3D : mêmes personnages, même
   éclairage, ACES. */

export const PIC_W = 1280
export const PIC_H = 960

/** Une image prête : sa source (pour une texture ou un canvas) et une adresse
    (pour le DOM : vignette, taquin). */
export interface Picture { src: HTMLCanvasElement | HTMLImageElement; url: string }

const NS = 'puzzle'
const mem = new Map<string, Promise<Picture | null>>()

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise(res => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = () => res(null)
    im.src = src
  })
}
const toBlob = (cv: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob | null>(res => cv.toBlob(b => res(b), type, q))

/** Une image : en mémoire, sinon gardée sur le disque, sinon calculée (puis
    encodée HORS du fil principal, `toBlob`, et gardée). */
function cached(key: string, disk: boolean, make: () => Promise<HTMLCanvasElement | null>): Promise<Picture | null> {
  let p = mem.get(key)
  if (!p) {
    p = (async () => {
      if (disk) {
        const u = await diskGet(NS, key)
        const im = u ? await loadImg(u) : null
        if (u && im) return { src: im, url: u }
      }
      const cv = await make()
      if (!cv) return null
      const blob = await toBlob(cv, 'image/jpeg', 0.9)
      const url = blob ? URL.createObjectURL(blob) : cv.toDataURL('image/jpeg', 0.9)
      if (disk && blob) void diskPut(NS, key, url, 10)
      return { src: cv, url }
    })()
    mem.set(key, p)
    p.then(r => { if (!r) mem.delete(key) }, () => mem.delete(key))
  }
  return p
}

/** Une image déjà composée (un dessin de l'Atelier) : gardée pour la session. */
export function canvasPicture(key: string, make: () => Promise<HTMLCanvasElement | null>): Promise<Picture | null> {
  return cached('canvas:' + key, false, make)
}

/** Le carré du milieu d'une image (le Taquin a un plateau carré). */
export async function squareUrl(p: Picture, px = 640): Promise<string> {
  const cv = document.createElement('canvas')
  cv.width = cv.height = px
  const w = (p.src as HTMLCanvasElement).width, h = (p.src as HTMLCanvasElement).height
  const s = Math.min(w, h)
  cv.getContext('2d')!.drawImage(p.src, (w - s) / 2, (h - s) / 2, s, s, 0, 0, px, px)
  const b = await toBlob(cv, 'image/jpeg', 0.9)
  return b ? URL.createObjectURL(b) : cv.toDataURL('image/jpeg', 0.9)
}

/** Le rendu du contexte jetable, recopié dans un canvas 2D (pas d'encodage). */
function grab(r: import('three').WebGLRenderer, w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  cv.getContext('2d')!.drawImage(r.domElement, 0, 0, w, h)
  return cv
}

/** Libère géométries et matériaux (et leurs cartes) d'un arbre. */
function free(root: import('three').Object3D) {
  root.traverse(o => {
    const m = o as import('three').Mesh
    const sprite = !!(o as import('three').Sprite).isSprite
    if (!m.isMesh && !sprite) return
    // La géométrie d'un Sprite est partagée par tous les sprites de three : on la laisse
    if (!sprite) m.geometry?.dispose()
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const slots = mat as unknown as Record<string, { dispose?: () => void } | undefined>
      for (const k of ['map', 'alphaMap', 'normalMap', 'emissiveMap']) slots[k]?.dispose?.()
      mat.dispose()
    }
  })
}

function sunLight(T: T3, scene: import('three').Scene, pos: [number, number, number], intensity: number, area: number) {
  const sun = new T.DirectionalLight('#FFF1D0', intensity)
  sun.position.set(...pos)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0008
  sun.shadow.normalBias = 0.02
  sun.shadow.radius = 3
  const c = sun.shadow.camera
  c.left = c.bottom = -area; c.right = c.top = area; c.near = 0.5; c.far = 40
  scene.add(sun)
  return sun
}

/* =====================================================================
   La ferme : un pré en 3D, huit animaux, des nuages, des collines
   ===================================================================== */
const HERD: [CritterKind, number, number, number, number][] = [
  // animal, x, z, rotation, taille
  ['cow', -2.55, -1.05, 0.45, 1.3], ['horse', 0.15, -1.55, 0.1, 1.45], ['sheep', 2.6, -0.95, -0.5, 1.15],
  ['pig', -1.25, 0.45, 0.3, 1.05], ['hen', 1.2, 0.35, -0.35, 0.95], ['chick', 1.95, 1.2, -0.6, 0.55],
  ['duck', -2.95, 1.05, 0.7, 0.8], ['dog', 3.35, 0.75, -0.8, 0.95], ['rabbit', 0.05, 1.45, 0.05, 0.8]
]

export function farmPicture(): Promise<Picture | null> {
  return cached('ferme-v1', true, () => withRenderer(PIC_W, PIC_H, async (T, renderer, env) => {
    const scene = new T.Scene()
    const sky = document.createElement('canvas')
    sky.width = 2; sky.height = 256
    const g = sky.getContext('2d')!
    const grad = g.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0, '#4FA6E0'); grad.addColorStop(0.75, '#BFE3F7'); grad.addColorStop(1, '#E4F4FB')
    g.fillStyle = grad; g.fillRect(0, 0, 2, 256)
    const skyTex = new T.CanvasTexture(sky)
    skyTex.colorSpace = T.SRGBColorSpace
    scene.background = skyTex
    scene.fog = new T.Fog('#D6EEF9', 18, 40)
    scene.environment = env
    scene.environmentIntensity = 0.6
    scene.add(new T.HemisphereLight('#CFE9FF', '#6E8F52', 0.32))
    sunLight(T, scene, [3.5, 7, 5], 2.2, 8)
    const own: import('three').Object3D[] = []
    const add = (o: import('three').Object3D) => { scene.add(o); own.push(o); return o }
    const ground = new T.Mesh(new T.CircleGeometry(40, 48), new T.MeshStandardMaterial({ color: 0x4E8A3A, roughness: 1 }))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    add(ground)
    // Des collines douces : la ligne d'horizon
    const hillMat = new T.MeshStandardMaterial({ color: 0x74AE55, roughness: 1 })
    for (const [x, z, s, hh] of [[-9, -13, 7, 2.6], [-1.5, -15, 8, 3.4], [7.5, -13.5, 7, 2.8], [14, -12, 5, 1.8], [-15, -11, 5, 1.6]] as const) {
      const m = new T.Mesh(new T.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), hillMat.clone())
      m.scale.set(s, hh, s * 0.55)
      m.position.set(x, -0.05, z)
      m.receiveShadow = true
      add(m)
    }
    hillMat.dispose()
    // Des nuages en boules (ils donnent au ciel de quoi se reconnaître)
    const cloudMat = new T.MeshStandardMaterial({ color: 0xF4F8FC, roughness: 1, emissive: 0x9FB6CC, emissiveIntensity: 0.35 })
    const puff = new T.SphereGeometry(1, 20, 14)
    for (const [x, y, z, s] of [[-6.2, 5.2, -14, 1.2], [-1.2, 6.4, -16, 1.5], [4.6, 5.4, -14.5, 1.1], [8.8, 6.6, -17, 1.3]] as const) {
      const c = new T.Group()
      const parts: [number, number, number, number][] = [[0, 0, 0, 1], [1.1, -0.2, 0.1, 0.8], [-1.1, -0.25, 0, 0.75], [0.5, 0.45, -0.2, 0.7], [-0.5, 0.35, 0.1, 0.65], [1.9, -0.45, 0, 0.5], [-1.9, -0.5, 0, 0.45]]
      for (const [px, py, pz, ps] of parts) {
        const b = new T.Mesh(puff, cloudMat)
        b.position.set(px, py, pz)
        b.scale.set(ps, ps * 0.78, ps * 0.8)
        c.add(b)
      }
      c.position.set(x, y, z)
      c.scale.setScalar(s)
      add(c)
    }
    const kit = critterKit(T)
    try {
      const deco: [string, number, number, number, number][] = [
        ['tree_oak', -4.6, -4.6, 2.8, 0.4], ['tree_default', -1.8, -5.6, 2.5, 1.2], ['tree_fat', 1.6, -5.2, 2.3, 2],
        ['tree_detailed', 4.4, -4.8, 2.7, 0.8], ['tree_pineRoundA', 6.6, -6.2, 3, 0.3], ['tree_oak', -7, -6.4, 3.1, 1.7],
        ['plant_bushLarge', -3.2, -3.1, 0.9, 0], ['plant_bush', 3, -3.2, 0.7, 1], ['plant_bush', 5.6, -2.9, 0.6, 2],
        ['flower_redA', -2, 2.3, 0.45, 0], ['flower_yellowA', 2.5, 2.1, 0.45, 1], ['flower_purpleA', -0.9, 2.9, 0.4, 2],
        ['flower_yellowA', -3.6, 2.6, 0.4, 0.5], ['flower_redA', 1.1, 2.7, 0.4, 2.2], ['flower_purpleA', 3.4, 2.9, 0.42, 1.4],
        ['flower_redA', -4.6, 0.2, 0.42, 0.9], ['flower_yellowA', 4.5, -0.3, 0.4, 0.2],
        ['mushroom_red', -1.9, 1.6, 0.3, 0.3], ['rock_smallA', 2.9, 1.9, 0.3, 1], ['stump_round', -4.2, -1.8, 0.45, 0],
        ['grass_large', 0.8, 2.2, 0.35, 0], ['grass_large', -2.8, 1.9, 0.35, 1], ['grass', 3.9, 1.7, 0.3, 2], ['grass', -0.3, 3.1, 0.3, 0.4]
      ]
      for (let i = -4; i <= 4; i++) deco.push(['fence_simple', i * 1.45, -2.5, 1.25, 0])
      // Tous les modèles demandés d'un coup (chacun n'est chargé qu'une fois)
      const models = await Promise.all(deco.map(([name]) => loadModel('nature', name).catch(() => null)))
      for (const [k, [name, x, z, h, rot]] of deco.entries()) {
        try {
          const m = models[k]
          if (!m) continue
          fitModel(T, m, h)
          m.traverse(o => {
            const mesh = o as import('three').Mesh
            if (!mesh.isMesh) return
            mesh.castShadow = true
            mesh.receiveShadow = true
            const mat = (mesh.material as import('three').MeshStandardMaterial).clone()
            mat.color.multiplyScalar(0.62) // les kits clairs délavés par l'ACES
            if (name.startsWith('tree') || name.startsWith('plant') || name.startsWith('grass')) mat.color.multiply(new T.Color(0x9CCB6E))
            mesh.material = mat
          })
          const box = new T.Box3().setFromObject(m)
          m.position.set(x, -box.min.y, z)
          m.rotation.y = rot
          add(m)
        } catch { /* un modèle absent : le pré reste joli sans lui */ }
      }
      for (const [k, x, z, r, s] of HERD) {
        const c = kit.make(k, s)
        c.obj.position.set(x, 0, z)
        c.obj.rotation.y = r
        c.obj.traverse(o => { o.castShadow = true })
        scene.add(c.obj)
      }
      const cam = new T.PerspectiveCamera(40, PIC_W / PIC_H, 0.1, 80)
      cam.position.set(0, 2.5, 7.6)
      cam.lookAt(0, 0.95, -0.6)
      renderer.render(scene, cam)
      return grab(renderer, PIC_W, PIC_H)
    } finally {
      kit.dispose()
      skyTex.dispose()
      puff.dispose(); cloudMat.dispose()
      own.forEach(free)
    }
  }).catch(() => null))
}

/* =====================================================================
   Leur princesse, dans la salle de bal (les deux sœurs ensemble dès
   qu'elles ont chacune gardé la leur), qui saute de joie
   ===================================================================== */
export function princessPicture(looks: Royal[]): Promise<Picture | null> {
  const key = 'princesse-v2:' + looks.map(royalKey).join('+')
  return cached(key, true, () => withRenderer(PIC_W, PIC_H, async (T, renderer, env) => {
    renderer.toneMappingExposure = 1.0
    const scene = new T.Scene()
    scene.background = new T.Color('#F3E4EA')
    scene.fog = new T.Fog('#F3E4EA', 7, 16)
    scene.environment = env
    scene.environmentIntensity = 0.6
    scene.add(new T.HemisphereLight('#FFF4FA', '#C9A6B8', 0.32))
    const sun = sunLight(T, scene, [1.8, 4.2, 3.2], 2.1, 4.5)
    const fill = new T.DirectionalLight(0xFFFFFF, 0.22)
    fill.position.set(-1.8, 2.6, 5)
    scene.add(fill)
    // Le décor du château attend une scène du socle : on lui prête la nôtre
    const noFx: Particles = { burst() { /* image fixe */ }, update() { /* image fixe */ }, dispose() { /* rien */ } }
    const decor = makeDecor({ T, scene, sun } as unknown as Stage, 'bal', noFx)
    const fy = decor.floorY
    const duo = looks.length > 1
    const ps = await Promise.all(looks.map(l => makePrincess(T, l, { live: false })))
    const pets = await Promise.all(looks.map(l => l.pet !== 'none' ? makePet(T, l.pet, l).catch(() => null) : Promise.resolve(null)))
    try {
      ps.forEach((pr, i) => {
        const yaw = posePrincess(pr, 'cheer', 0.26 + i * 0.1)
        pr.rig.rotation.y = yaw
        pr.update(0)
        pr.face.expr('joy', 99)
        pr.face.redraw()
        pr.obj.position.set(duo ? (i ? 0.42 : -0.42) : 0, fy, 0)
        pr.obj.rotation.y = duo ? (i ? -0.25 : 0.25) : -0.12
        scene.add(pr.obj)
        const pet = pets[i]
        if (pet) {
          const big = looks[i].pet === 'unicorn' || looks[i].pet === 'pony'
          if (duo) pet.obj.position.set(i ? 1.05 : -1.05, fy, 0.1)
          else pet.obj.position.set(big ? 0.66 : 0.45, fy, big ? 0.05 : 0.24)
          pet.obj.rotation.y = duo ? (i ? -0.9 : 0.9) : -0.9
          pet.pose('happy', 0.2)
          pet.update(0)
          scene.add(pet.obj)
        }
      })
      const cam = new T.PerspectiveCamera(42, PIC_W / PIC_H, 0.05, 50)
      // Serré sur elle (les bras levés compris) : moins de sol uni, plus de détails à reconnaître
      if (duo) { cam.position.set(0, 1.05, 3.05); cam.lookAt(0, 0.74, 0) }
      else { cam.position.set(0.1, 1.0, 2.55); cam.lookAt(0.05, 0.76, 0) }
      renderer.render(scene, cam)
      return grab(renderer, PIC_W, PIC_H)
    } finally {
      ps.forEach(pr => { scene.remove(pr.obj); pr.dispose() })
      pets.forEach(p => { if (p) { scene.remove(p.obj); p.dispose() } })
      decor.dispose()
    }
  }).catch(() => null))
}

/* =====================================================================
   L'Espace : Saturne et ses anneaux, la Terre et la Lune, et LEUR fusée
   (celle de l'Espace, flamme allumée) sur un ciel de nébuleuses
   ===================================================================== */

/** Le ciel : nuit bleue, Voie lactée en diagonale, nébuleuses, étoiles. */
function nebula(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const g = cv.getContext('2d')!
  let s = 11
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  const base = g.createLinearGradient(0, 0, w, h)
  base.addColorStop(0, '#0B1233'); base.addColorStop(0.55, '#141040'); base.addColorStop(1, '#22123F')
  g.fillStyle = base
  g.fillRect(0, 0, w, h)
  g.globalCompositeOperation = 'lighter'
  const blob = (x: number, y: number, r: number, col: string, a: number) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, r)
    gr.addColorStop(0, col.replace('A', String(a)))
    gr.addColorStop(1, col.replace('A', '0'))
    g.fillStyle = gr
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // La Voie lactée : du bas à gauche vers le haut à droite
  for (let i = 0; i < 70; i++) {
    const t = rnd()
    const x = t * w + (rnd() - 0.5) * 120, y = h - t * h * 0.95 + (rnd() - 0.5) * 140
    blob(x, y, 60 + rnd() * 120, i % 3 ? 'rgba(92,78,170,A)' : 'rgba(70,120,190,A)', 0.07 + rnd() * 0.06)
  }
  // Nébuleuses : une rose, une turquoise, une dorée
  blob(w * 0.18, h * 0.22, w * 0.3, 'rgba(230,80,160,A)', 0.22)
  blob(w * 0.3, h * 0.12, w * 0.18, 'rgba(255,120,190,A)', 0.14)
  blob(w * 0.86, h * 0.8, w * 0.32, 'rgba(40,190,210,A)', 0.2)
  blob(w * 0.62, h * 0.95, w * 0.2, 'rgba(90,120,255,A)', 0.16)
  blob(w * 0.52, h * 0.42, w * 0.16, 'rgba(255,190,110,A)', 0.07)
  // Étoiles : une poussière dense le long de la Voie lactée, et partout ailleurs
  for (let i = 0; i < 2600; i++) {
    const along = rnd() < 0.55
    let x: number, y: number
    if (along) {
      const t = rnd()
      const off = (rnd() + rnd() + rnd() - 1.5) * 150
      x = t * w + off * 0.6; y = h - t * h * 0.95 + off
    } else { x = rnd() * w; y = rnd() * h }
    const r = 0.35 + Math.pow(rnd(), 3) * 1.4
    const tint = rnd()
    g.fillStyle = tint < 0.2 ? `rgba(190,210,255,${0.5 + rnd() * 0.5})` : tint < 0.3 ? `rgba(255,230,190,${0.5 + rnd() * 0.5})` : `rgba(255,255,255,${0.45 + rnd() * 0.55})`
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
  }
  // De grosses étoiles qui scintillent en croix
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w, y = rnd() * h, r = 2 + rnd() * 3.2
    blob(x, y, r * 7, 'rgba(210,225,255,A)', 0.35)
    g.fillStyle = 'rgba(255,255,255,0.95)'
    g.beginPath(); g.arc(x, y, r * 0.55, 0, Math.PI * 2); g.fill()
    g.strokeStyle = 'rgba(220,235,255,0.55)'; g.lineWidth = 1.1
    g.beginPath(); g.moveTo(x - r * 5, y); g.lineTo(x + r * 5, y); g.moveTo(x, y - r * 5); g.lineTo(x, y + r * 5); g.stroke()
  }
  g.globalCompositeOperation = 'source-over'
  return cv
}

/** Le halo bleu d'une atmosphère : un anneau lumineux autour du disque. */
function haloTex(T: T3, rgb: string): import('three').CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = cv.height = 256
  const g = cv.getContext('2d')!
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  gr.addColorStop(0, `rgba(${rgb},0)`)
  gr.addColorStop(0.74, `rgba(${rgb},0)`)
  gr.addColorStop(0.8, `rgba(${rgb},0.75)`)
  gr.addColorStop(0.88, `rgba(${rgb},0.25)`)
  gr.addColorStop(1, `rgba(${rgb},0)`)
  g.fillStyle = gr
  g.fillRect(0, 0, 256, 256)
  const t = new T.CanvasTexture(cv)
  t.colorSpace = T.SRGBColorSpace
  return t
}

export function spacePicture(): Promise<Picture | null> {
  return cached('espace-v1', true, () => withRenderer(PIC_W, PIC_H, async (T, renderer) => {
    const base = `${import.meta.env.BASE_URL}assets/space/`
    const loader = new T.TextureLoader()
    const load = (f: string, color = true) => loader.loadAsync(base + f).then(t => { if (color) t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t })
    const [satTex, ringTex, dayTex, cloudTex, moonTex] = await Promise.all([
      load('saturn.jpg'), load('saturn_ring.png'), load('earth_day.jpg'), load('earth_clouds.jpg', false), load('moon.jpg')
    ])
    const scene = new T.Scene()
    const skyTex = new T.CanvasTexture(nebula(PIC_W, PIC_H))
    skyTex.colorSpace = T.SRGBColorSpace
    scene.background = skyTex
    // Le Soleil est hors champ, en haut à gauche ; une faible lueur depuis la
    // caméra évite les côtés nuit tout noirs (piège « planètes côté nuit »)
    const sun = new T.DirectionalLight('#FFF4E2', 2.9)
    sun.position.set(-6, 3.2, 4.5)
    scene.add(sun)
    const fill = new T.DirectionalLight('#8FA8FF', 0.28)
    fill.position.set(2, -1, 10)
    scene.add(fill)
    scene.add(new T.AmbientLight('#20264A', 0.35))
    const own: import('three').Object3D[] = []
    const add = <O extends import('three').Object3D>(o: O, parent: import('three').Object3D = scene) => { parent.add(o); if (parent === scene) own.push(o); return o }
    // Saturne et ses anneaux (les UV de l'anneau suivent le rayon)
    const sat = add(new T.Group())
    const R = 1.2
    const ball = new T.Mesh(new T.SphereGeometry(R, 64, 40), new T.MeshStandardMaterial({ map: satTex, roughness: 0.9 }))
    ball.scale.y = 0.91
    sat.add(ball)
    const inner = R * 1.24, outer = R * 2.27
    const ringGeo = new T.RingGeometry(inner, outer, 160, 1)
    const pos = ringGeo.attributes.position, uv = ringGeo.attributes.uv
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i))
      uv.setXY(i, (r - inner) / (outer - inner), 0.5)
    }
    const ring = new T.Mesh(ringGeo, new T.MeshStandardMaterial({ map: ringTex, transparent: true, side: T.DoubleSide, depthWrite: false, roughness: 1, emissive: 0x2A2418, emissiveMap: ringTex }))
    ring.rotation.x = -Math.PI / 2
    sat.add(ring)
    sat.position.set(1.95, 1.05, -1.6)
    sat.rotation.set(0.42, 0, -0.32)
    // La Terre, ses nuages, son halo ; la Lune
    const earth = add(new T.Group())
    const E = 1.02
    const globe = new T.Mesh(new T.SphereGeometry(E, 64, 40), new T.MeshStandardMaterial({ map: dayTex, roughness: 0.75 }))
    globe.rotation.y = -1.9
    earth.add(globe)
    const clouds = new T.Mesh(new T.SphereGeometry(E * 1.012, 64, 40), new T.MeshStandardMaterial({ color: 0xFFFFFF, alphaMap: cloudTex, transparent: true, depthWrite: false, roughness: 1 }))
    clouds.rotation.y = -1.6
    earth.add(clouds)
    earth.position.set(-2.55, -1.2, 0.6)
    earth.rotation.z = 0.4
    const halo = add(new T.Sprite(new T.SpriteMaterial({ map: haloTex(T, '110,170,255'), transparent: true, depthWrite: false, blending: T.AdditiveBlending })))
    halo.position.set(-2.55, -1.2, 0.2)
    halo.scale.setScalar(E * 2.62)
    const moon = add(new T.Mesh(new T.SphereGeometry(0.28, 48, 32), new T.MeshStandardMaterial({ map: moonTex, roughness: 1 })))
    moon.position.set(-0.75, -0.05, 0.9)
    // Leur fusée, flamme allumée, qui file vers Saturne
    const kept: { dispose(): void }[] = []
    const rocket = makeRocket(T, { T, renderer, keep: <K extends { dispose(): void }>(r: K) => { kept.push(r); return r } } as unknown as Stage)
    rocket.group.scale.setScalar(1.35)
    rocket.group.position.set(0.55, -1.25, 2.4)
    rocket.group.rotation.set(0.25, -0.35, -0.72)
    rocket.update(1200, 0.85, new T.Vector3(-1, 0.5, 0.6))
    add(rocket.group)
    try {
      const cam = new T.PerspectiveCamera(34, PIC_W / PIC_H, 0.1, 100)
      cam.position.set(0, 0, 12)
      cam.lookAt(0, 0, 0)
      renderer.render(scene, cam)
      return grab(renderer, PIC_W, PIC_H)
    } finally {
      own.forEach(free)
      kept.forEach(k => k.dispose())
      ;[satTex, ringTex, dayTex, cloudTex, moonTex, skyTex].forEach(t => t.dispose())
    }
  }).catch(() => null))
}
