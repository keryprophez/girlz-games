/* Socle 3D partagé — tout ce que `stand3d.ts` avait inventé, mis en commun pour
   que chaque jeu 3D parte avec le même niveau de rendu :
   éclairage physique, ombres douces, tone mapping cinéma, brouillard,
   boucle à pas fixe et surtout NETTOYAGE GPU COMPLET au démontage.

   Three.js est toujours chargé À LA DEMANDE (`await import('three')`) : le
   bundle de départ reste léger et l'app démarre vite sur tablette. */

export type T3 = typeof import('three')
export type Cannon = typeof import('cannon-es')

/* ---------- Chargement à la demande ---------- */
export const loadThree = (): Promise<T3> => import('three')
export const loadPhysics = (): Promise<[T3, Cannon]> =>
  Promise.all([import('three'), import('cannon-es')])

/* ---------- Écran d'attente ---------- */
export function loader(arena: HTMLElement, icon: string): () => void {
  const el = document.createElement('div')
  el.className = 'nj-loading'
  el.textContent = icon
  arena.appendChild(el)
  return () => el.remove()
}

/* ---------- Options de scène ---------- */
export interface StageOpts {
  /** Éclairage d'environnement. `false` uniquement pour l'espace (fond noir). */
  ibl?: boolean
  /** Intensité de l'environnement (1 = neutre). */
  iblIntensity?: number
  /** Couleur du ciel / du fond. */
  sky: string
  /** Brouillard [proche, lointain] — teinté avec `fogColor` ou une variante du ciel. */
  fog?: [number, number]
  fogColor?: string
  fov?: number
  /** Position de la caméra et point visé. */
  cam?: [number, number, number]
  target?: [number, number, number]
  /** Lumière du ciel (haut) et rebond du sol (bas). */
  hemi?: [string, string, number]
  /** Soleil directionnel : position, couleur, intensité. */
  sun?: { pos: [number, number, number]; color?: string; intensity?: number; area?: number; far?: number }
  /** Appoint frontal doux : évite les faces avant éteintes. */
  fill?: number
  exposure?: number
  /** Sans soleil : scènes spatiales éclairées par leur propre étoile. */
  noSun?: boolean
}

export interface Stage {
  T: T3
  renderer: import('three').WebGLRenderer
  scene: import('three').Scene
  camera: import('three').PerspectiveCamera
  sun: import('three').DirectionalLight | null
  arena: HTMLElement
  /** Passe à false au démontage : toute boucle doit s'arrêter dessus. */
  alive: boolean
  /** Démarre la boucle de rendu. `dt` est borné à 100 ms (onglet en arrière-plan). */
  start(update: (dt: number, now: number) => void): void
  /** Enregistre une ressource GPU non attachée à la scène (texture, cible de rendu). */
  keep<R extends { dispose(): void }>(r: R): R
  dispose(): void
}

/* ---------- Création d'une scène au standard « jeu moderne » ---------- */
export async function createStage(arena: HTMLElement, o: StageOpts): Promise<Stage> {
  const T = await loadThree()
  const W = Math.max(1, arena.clientWidth)
  const H = Math.max(1, arena.clientHeight)

  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
  renderer.setSize(W, H)
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = T.PCFSoftShadowMap
  renderer.toneMapping = T.ACESFilmicToneMapping
  renderer.toneMappingExposure = o.exposure ?? 1.05
  renderer.outputColorSpace = T.SRGBColorSpace
  renderer.domElement.style.touchAction = 'none' // le drag pilote le jeu, pas le scroll
  arena.appendChild(renderer.domElement)

  const scene = new T.Scene()
  scene.background = new T.Color(o.sky)
  if (o.fog) scene.fog = new T.Fog(o.fogColor || o.sky, o.fog[0], o.fog[1])

  const camera = new T.PerspectiveCamera(o.fov ?? 48, W / H, 0.1, 400)
  const cp = o.cam || [0, 2.2, 4.2]
  camera.position.set(cp[0], cp[1], cp[2])
  const tg = o.target || [0, 1, 0]
  camera.lookAt(tg[0], tg[1], tg[2])

  /* L'IBL REMPLACE l'ambiante, elle ne s'y ajoute pas : sans cette baisse, la
     scène part en blanc délavé — le sujet ne ressort plus du fond. */
  const iblOn = o.ibl !== false
  const hemiCfg = o.hemi || ['#CFE9FF', '#6E8F52', 1.0]
  scene.add(new T.HemisphereLight(hemiCfg[0], hemiCfg[1], (hemiCfg[2] as number) * (iblOn ? 0.32 : 1)))

  /* --- IBL : LE réglage qui sépare « plastique mat » de « matière ».
     Sans carte d'environnement, un MeshStandardMaterial n'a rien à réfléchir :
     il rend une couleur plate. RoomEnvironment donne des reflets crédibles à
     tout le monde d'un coup, sans fichier HDR à télécharger. --- */
  let pmrem: any = null
  if (iblOn) {
    const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js')
    pmrem = new T.PMREMGenerator(renderer)
    const envScene = new RoomEnvironment()
    const env = pmrem.fromScene(envScene as any, 0.04)
    scene.environment = env.texture
    scene.environmentIntensity = o.iblIntensity ?? 0.6
    envScene.traverse?.((x: any) => {
      if (x.geometry) x.geometry.dispose()
      if (x.material) (Array.isArray(x.material) ? x.material : [x.material]).forEach((m: any) => m.dispose())
    })
  }

  let sun: import('three').DirectionalLight | null = null
  if (!o.noSun) {
    const s = o.sun || { pos: [3.4, 6.2, 4.2] as [number, number, number] }
    sun = new T.DirectionalLight(s.color || '#FFF1D0', s.intensity ?? 2.2)
    sun.position.set(s.pos[0], s.pos[1], s.pos[2])
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    sun.shadow.camera.near = 0.5
    sun.shadow.camera.far = s.far ?? 20
    const d = s.area ?? 4.5
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d
    sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d
    sun.shadow.bias = -0.0012          // pas d'acné d'ombre
    sun.shadow.normalBias = 0.02
    sun.shadow.radius = 3
    scene.add(sun)
    if (o.fill !== 0) {
      const fill = new T.DirectionalLight(0xFFFFFF, (o.fill ?? 0.5) * (iblOn ? 0.45 : 1))
      fill.position.set(-1.8, 2.6, 5)
      scene.add(fill)
    }
  }

  const extras: { dispose(): void }[] = []
  let raf = 0
  let last = performance.now()

  const stage: Stage = {
    T, renderer, scene, camera, sun, arena, alive: true,
    keep(r) { extras.push(r); return r },
    start(update) {
      last = performance.now()
      const loop = () => {
        if (!stage.alive) return
        const now = performance.now()
        const dt = Math.min(0.1, (now - last) / 1000)
        last = now
        try { update(dt, now) } catch (e) { stage.alive = false; throw e }
        if (!stage.alive) return
        renderer.render(scene, camera)
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    },
    dispose() {
      stage.alive = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      disposeTree(T, scene)
      extras.forEach(r => { try { r.dispose() } catch { /* déjà libéré */ } })
      extras.length = 0
      if (scene.environment) { scene.environment.dispose(); scene.environment = null }
      pmrem?.dispose()
      renderer.dispose()
      renderer.forceContextLoss?.()
      renderer.domElement.remove()
    }
  }

  function onResize() {
    if (!stage.alive) return
    const w = Math.max(1, arena.clientWidth), h = Math.max(1, arena.clientHeight)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  window.addEventListener('resize', onResize)

  return stage
}

/* ---------- Nettoyage GPU : géométries, matériaux ET toutes leurs textures ---------- */
const MAPS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap',
  'aoMap', 'bumpMap', 'displacementMap', 'envMap', 'lightMap', 'specularMap',
  'clearcoatMap', 'transmissionMap', 'thicknessMap', 'sheenColorMap', 'gradientMap'
]

export function disposeTree(T: T3, root: import('three').Object3D) {
  const geos = new Set<any>()
  const mats = new Set<any>()
  root.traverse((o: any) => {
    if (o.geometry) geos.add(o.geometry)
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m))
  })
  geos.forEach(g => g.dispose())
  mats.forEach((m: any) => {
    for (const k of MAPS) if (m[k]?.dispose) m[k].dispose()
    m.dispose()
  })
  // Vide la scène pour libérer les références JS
  while (root.children.length) root.remove(root.children[0])
  void T
}

/* ---------- Physique : accumulateur à pas fixe ---------- */
export function fixedStep(step = 1 / 60, max = 5) {
  let acc = 0
  return (dt: number, tick: () => void) => {
    acc = Math.min(acc + dt, step * max) // pas de spirale de la mort après un lag
    while (acc >= step) { acc -= step; tick() }
  }
}

/* ---------- Caméra orbitale « boutons » — pensée pour des petites mains ----------
   Pas de drag : les jeux utilisent le doigt pour JOUER. On tourne autour de la
   scène avec deux gros boutons, et la caméra glisse en douceur (ressort). */
export interface Orbit {
  /** Angle visé, en radians. Le mouvement est amorti. */
  target: number
  /** Distance et hauteur visées. */
  dist: number
  height: number
  /** Point regardé. */
  look: [number, number, number]
  /** Rotation automatique lente (rad/s), 0 = arrêt. */
  auto: number
  update(dt: number): void
  turn(delta: number): void
}

export function orbitCam(stage: Stage, dist: number, height: number, look: [number, number, number]): Orbit {
  let a = 0
  let d = dist, h = height
  const cur: [number, number, number] = [...look]
  const o: Orbit = {
    target: a, dist, height, look, auto: 0,
    turn(delta) { o.target += delta },
    update(dt) {
      o.target += o.auto * dt
      const k = 1 - Math.pow(0.001, dt) // amortissement indépendant du framerate
      a += (o.target - a) * k
      d += (o.dist - d) * k
      h += (o.height - h) * k
      for (let i = 0; i < 3; i++) cur[i] += (o.look[i] - cur[i]) * k
      stage.camera.position.set(cur[0] + Math.sin(a) * d, cur[1] + h, cur[2] + Math.cos(a) * d)
      stage.camera.lookAt(cur[0], cur[1], cur[2])
    }
  }
  return o
}

/* ---------- Textures procédurales partagées ---------- */
function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return [c, c.getContext('2d')!]
}

function tex(T: T3, c: HTMLCanvasElement, repeat = 1): import('three').CanvasTexture {
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  t.anisotropy = 4
  if (repeat !== 1) {
    t.wrapS = t.wrapT = T.RepeatWrapping
    t.repeat.set(repeat, repeat)
  }
  return t
}

/** Neige : blanc bleuté avec un grain fin et des paillettes qui accrochent la lumière. */
export function snowTex(T: T3, repeat = 6) {
  const [c, g] = canvas(512)
  g.fillStyle = '#F2F8FF'; g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * 512, y = Math.random() * 512
    g.fillStyle = `hsla(${200 + Math.random() * 20},${30 + Math.random() * 40}%,${88 + Math.random() * 11}%,.5)`
    g.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2)
  }
  for (let i = 0; i < 420; i++) {
    g.fillStyle = 'rgba(255,255,255,.95)'
    g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, 0.8 + Math.random() * 1.4, 0, 7); g.fill()
  }
  return tex(T, c, repeat)
}

/** Bois de plan de travail — pizzeria, étagères. */
export function woodTex(T: T3, base = '#C99A5F', repeat = 1) {
  const [c, g] = canvas(512)
  g.fillStyle = base; g.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 8; i++) {
    const y = i * 64
    g.fillStyle = i % 2 ? 'rgba(150,105,60,.16)' : 'rgba(255,235,205,.12)'
    g.fillRect(0, y, 512, 62)
    g.strokeStyle = 'rgba(110,78,44,.4)'; g.lineWidth = 2
    g.beginPath(); g.moveTo(0, y + 63); g.lineTo(512, y + 63); g.stroke()
    for (let k = 0; k < 9; k++) {
      g.strokeStyle = `rgba(130,92,52,${0.08 + Math.random() * 0.14})`
      g.lineWidth = 1 + Math.random() * 2.5
      const yy = y + 5 + Math.random() * 52
      g.beginPath(); g.moveTo(0, yy)
      g.bezierCurveTo(160, yy + (Math.random() - 0.5) * 9, 340, yy + (Math.random() - 0.5) * 9, 512, yy)
      g.stroke()
    }
  }
  return tex(T, c, repeat)
}

/** Normal map de bruit doux — donne du relief sans géométrie (glace, pâte, roche). */
export function bumpyNormal(T: T3, strength = 22, repeat = 1) {
  const [c, g] = canvas(256)
  const img = g.createImageData(256, 256)
  const h = new Float32Array(256 * 256)
  for (let i = 0; i < h.length; i++) h[i] = Math.random()
  // Lissage : le bruit brut donne un relief sale, un flou léger le rend organique
  const s = new Float32Array(h.length)
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      let sum = 0
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        sum += h[((y + dy + 256) % 256) * 256 + ((x + dx + 256) % 256)]
      }
      s[y * 256 + x] = sum / 25
    }
  }
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const i = y * 256 + x
      const dx = (s[y * 256 + ((x + 1) % 256)] - s[y * 256 + ((x + 255) % 256)]) * strength
      const dy = (s[((y + 1) % 256) * 256 + x] - s[((y + 255) % 256) * 256 + x]) * strength
      img.data[i * 4] = Math.max(0, Math.min(255, 128 - dx * 127))
      img.data[i * 4 + 1] = Math.max(0, Math.min(255, 128 - dy * 127))
      img.data[i * 4 + 2] = 255
      img.data[i * 4 + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  const t = new T.CanvasTexture(c)   // pas de sRGB : une normal map est une donnée
  t.anisotropy = 4
  if (repeat !== 1) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat, repeat) }
  return t
}

/** Point rond dégradé — sert de sprite pour les étoiles et les particules. */
export function dotTex(T: T3, color = '#FFFFFF') {
  const [c, g] = canvas(64)
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, color)
  gr.addColorStop(0.35, color)
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 64)
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  return t
}

/** Glace translucide : matériau récupéré de l'ancien igloo 3D, le seul acquis
    visuel qui méritait de lui survivre. La réfraction coûte une passe de rendu —
    penser à `renderer.transmissionResolutionScale = 0.5` sur la scène. */
export function iceMaterial(T: T3, stage?: Stage) {
  const nrm = bumpyNormal(T, 6, 2)
  stage?.keep(nrm)
  return new T.MeshPhysicalMaterial({
    color: 0xD9F1FF, roughness: 0.14, metalness: 0,
    transmission: 0.72, thickness: 0.4, ior: 1.31, side: T.DoubleSide,
    clearcoat: 0.6, clearcoatRoughness: 0.25,
    normalMap: nrm, normalScale: new T.Vector2(0.35, 0.35)
  })
}

/** Aurore boréale : rideau de lumière sur un cylindre, vu de l'intérieur. */
export function aurora(T: T3, radius = 26, height = 14) {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 256
  const g = c.getContext('2d')!
  for (let b = 0; b < 5; b++) {
    const x = 40 + b * 95 + Math.random() * 40
    const grad = g.createLinearGradient(0, 0, 0, 256)
    const hue = 130 + Math.random() * 90
    grad.addColorStop(0, `hsla(${hue},85%,65%,0)`)
    grad.addColorStop(0.45, `hsla(${hue},85%,62%,.55)`)
    grad.addColorStop(1, `hsla(${hue + 40},80%,60%,0)`)
    g.fillStyle = grad
    g.beginPath()
    g.moveTo(x, 0)
    g.bezierCurveTo(x + 60, 80, x - 50, 170, x + 20, 256)
    g.lineTo(x + 60, 256)
    g.bezierCurveTo(x + 110, 170, x + 20, 80, x + 55, 0)
    g.closePath(); g.fill()
  }
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  return new T.Mesh(
    new T.CylinderGeometry(radius, radius, height, 40, 1, true),
    new T.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.55, side: T.BackSide, depthWrite: false })
  )
}

/* ---------- Modèles glTF ----------
   De vrais objets modélisés, pas des primitives. Un cube arrondi reste un cube :
   c'est ici que se joue le saut visuel. Chaque modèle n'est chargé qu'une fois
   puis cloné — un `.glb` Kenney pèse 8 à 60 Ko. */
const models = new Map<string, Promise<import('three').Group>>()

export function loadModel(kit: string, name: string): Promise<import('three').Group> {
  const key = `${kit}/${name}`
  let p = models.get(key)
  if (!p) {
    p = (async () => {
      const [T, { GLTFLoader }] = await Promise.all([
        loadThree(),
        import('three/examples/jsm/loaders/GLTFLoader.js')
      ])
      const url = `${import.meta.env.BASE_URL}assets/models/${kit}/${name}.glb`
      const gltf = await new GLTFLoader().loadAsync(url)
      gltf.scene.traverse((o: any) => {
        if (!o.isMesh) return
        o.castShadow = true
        o.receiveShadow = true
        // Kenney sort ses kits en filtrage « plus proche » : ça pixellise à
        // l'écran. On repasse en linéaire, la texture est un atlas de couleurs.
        const m = o.material
        if (m?.map) { m.map.magFilter = T.LinearFilter; m.map.minFilter = T.LinearMipmapLinearFilter; m.map.needsUpdate = true }
        if (m) { m.roughness = 0.62; m.metalness = 0.02 }
      })
      return gltf.scene as unknown as import('three').Group
    })()
    models.set(key, p)
    p.catch(() => models.delete(key))
  }
  return p.then(g => g.clone(true))
}

/** Met un modèle à l'échelle voulue et le pose sur son point le plus bas. */
export function fitModel(T: T3, g: import('three').Object3D, targetSize: number) {
  const box = new T.Box3().setFromObject(g)
  const size = box.getSize(new T.Vector3())
  const k = targetSize / Math.max(size.x, size.y, size.z)
  g.scale.setScalar(k)
  return g
}

/** Médaillon rond avec la photo de la joueuse (ctx.avatar), toujours face
    caméra — pour incarner « c'est MOI qui joue » dans les jeux 3D.
    Renvoie null sans photo ; le nettoyage passe par disposeTree comme le
    reste de la scène. */
export async function avatarMedallion(T: T3, dataUrl: string | null, size: number) {
  if (!dataUrl) return null
  const img = new Image()
  try {
    await new Promise((ok, ko) => { img.onload = ok; img.onerror = ko; img.src = dataUrl })
  } catch { return null }
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.save()
  g.beginPath(); g.arc(64, 64, 57, 0, Math.PI * 2); g.clip()
  g.drawImage(img, 0, 0, 128, 128)
  g.restore()
  g.beginPath(); g.arc(64, 64, 57, 0, Math.PI * 2)
  g.lineWidth = 9; g.strokeStyle = '#FFFDF6'; g.stroke()
  const tex = new T.CanvasTexture(c)
  tex.colorSpace = T.SRGBColorSpace
  const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthWrite: false }))
  sp.scale.set(size, size, 1)
  return sp
}

/* ---------- Interaction : quel objet est sous le doigt ? ---------- */
export function picker(stage: Stage) {
  const { T, camera, renderer } = stage
  const ray = new T.Raycaster()
  const v = new T.Vector2()
  return (ev: { clientX: number; clientY: number }, targets: import('three').Object3D[], deep = true) => {
    const r = renderer.domElement.getBoundingClientRect()
    v.x = ((ev.clientX - r.left) / r.width) * 2 - 1
    v.y = -((ev.clientY - r.top) / r.height) * 2 + 1
    ray.setFromCamera(v, camera)
    return ray.intersectObjects(targets, deep)
  }
}
