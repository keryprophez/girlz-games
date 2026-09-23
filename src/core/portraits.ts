import { loadThree, loadModel, fitModel, dotTex, type T3 } from './three3d'
import { critterKit, type CritterKind } from './critters'
import { makeDoll, poseDoll, type DollPose } from './doll3d'
import type { Look } from './character'

/* Les personnages 3D de la ferme, rendus en IMAGES pour les jeux en DOM
   (Simon, Puissance 4, la Boîte à rythme, le Taquin). Ils remplacent les
   pastilles rondes de la planche Kenney — « un sprite atroce digne d'un
   Minitel » — par les mêmes personnages que Tape-Trous : un seul style.

   Un seul contexte WebGL, ouvert le temps de rendre un lot puis rendu au
   navigateur (les jeux 3D ont besoin des leurs). Les images sont gardées en
   mémoire : la deuxième partie ne recalcule rien. Même éclairage que
   `createStage` (hémisphère + soleil + IBL, ACES), fond transparent, une
   ombre douce sous les pieds. */

const cache = new Map<string, string>()

type Renderer = import('three').WebGLRenderer

/** Ouvre un moteur de rendu jetable, le passe à `fn`, puis libère tout. */
async function withRenderer<R>(w: number, h: number, fn: (T: T3, r: Renderer, env: import('three').Texture) => Promise<R> | R): Promise<R> {
  const T = await loadThree()
  const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js')
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(w, h, false)
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = T.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.outputColorSpace = T.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = T.PCFSoftShadowMap
  const pmrem = new T.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const env = pmrem.fromScene(room as unknown as import('three').Scene, 0.04)
  try {
    return await fn(T, renderer, env.texture)
  } finally {
    env.texture.dispose()
    pmrem.dispose()
    room.traverse((o: import('three').Object3D) => {
      const m = o as import('three').Mesh
      if (m.geometry) m.geometry.dispose()
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose())
    })
    renderer.dispose()
    renderer.forceContextLoss()
  }
}

function lights(T: T3, scene: import('three').Scene, env: import('three').Texture) {
  scene.environment = env
  scene.environmentIntensity = 0.6
  scene.add(new T.HemisphereLight('#CFE9FF', '#6E8F52', 0.32))
  const sun = new T.DirectionalLight('#FFF1D0', 2.2)
  sun.position.set(2.2, 5, 4)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.02
  const cam = sun.shadow.camera
  cam.left = cam.bottom = -4; cam.right = cam.top = 4; cam.near = 0.5; cam.far = 20
  scene.add(sun)
  return sun
}

/** Les portraits (dataURL PNG, `px` de côté) des personnages demandés. */
export async function critterPortraits(kinds: CritterKind[], px: number): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const missing = kinds.filter(k => {
    const hit = cache.get(k + '@' + px)
    if (hit) out[k] = hit
    return !hit
  })
  if (!missing.length) return out
  const size = Math.min(512, Math.round(px * 2)) // rendu ×2 : net sur la tablette
  await withRenderer(size, size, (T, renderer, env) => renderPortraits(T, renderer, env, missing, px, out))
    .catch(() => { /* pas de WebGL : les jeux gardent leur repli */ })
  return out
}

function renderPortraits(T: T3, renderer: Renderer, env: import('three').Texture, kinds: CritterKind[], px: number, out: Record<string, string>) {
  const kit = critterKit(T)
  const shadowTex = dotTex(T, '#2A2018')
  try {
    for (const kind of kinds) {
      const scene = new T.Scene()
      lights(T, scene, env)
      const c = kit.make(kind, 1)
      // Trois quarts, légèrement de haut : on voit le visage ET la silhouette
      c.obj.rotation.y = -0.42
      c.obj.traverse(o => { o.castShadow = true })
      scene.add(c.obj)
      const blob = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.35, depthWrite: false }))
      blob.rotation.x = -Math.PI / 2
      blob.position.y = 0.002
      blob.scale.set(0.95, 0.7, 1)
      scene.add(blob)
      const box = new T.Box3().setFromObject(c.obj)
      const ctr = box.getCenter(new T.Vector3())
      const rad = box.getSize(new T.Vector3()).length() / 2
      const cam = new T.PerspectiveCamera(30, 1, 0.05, 50)
      const dist = rad / Math.sin((30 / 2) * Math.PI / 180) * 0.74
      cam.position.set(ctr.x, ctr.y + dist * 0.28, ctr.z + dist * 0.96)
      cam.lookAt(ctr.x, ctr.y - rad * 0.05, ctr.z)
      renderer.render(scene, cam)
      const url = renderer.domElement.toDataURL('image/png')
      cache.set(kind + '@' + px, url)
      out[kind] = url
      blob.geometry.dispose(); (blob.material as import('three').Material).dispose()
    }
  } finally {
    shadowTex.dispose()
    kit.dispose()
  }
}

/** Le personnage des filles (Habille-toi) rendu en images, une par pose :
    debout, qui saute de joie, qui fait coucou, qui marche. Cache par look. */
const inflight = new Map<string, Promise<Record<string, string>>>()
export function dollPortraits(look: Look, poses: DollPose[], px: number): Promise<Record<string, string>> {
  // Deux demandes identiques en même temps partagent le même rendu
  const k = JSON.stringify(look) + poses.join() + px
  let p = inflight.get(k)
  if (!p) {
    p = renderDolls(look, poses, px).finally(() => inflight.delete(k))
    inflight.set(k, p)
  }
  return p
}

async function renderDolls(look: Look, poses: DollPose[], px: number): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const key = (p: DollPose) => 'doll:' + JSON.stringify(look) + ':' + p + '@' + px
  const missing = poses.filter(p => { const hit = cache.get(key(p)); if (hit) out[p] = hit; return !hit })
  if (!missing.length) return out
  const size = Math.min(512, Math.round(px * 2))
  await withRenderer(size, size, (T, renderer, env) => {
    const shadowTex = dotTex(T, '#2A2018')
    const doll = makeDoll(T, look, 1)
    try {
      for (const pose of missing) {
        const scene = new T.Scene()
        lights(T, scene, env)
        // Des instants choisis : en haut du saut, main levée, pas en avant
        poseDoll(doll, pose, pose === 'cheer' ? 0.26 : pose === 'wave' ? 0.17 : pose === 'walk' || pose === 'stride' ? 0.2 : 0)
        doll.obj.rotation.y = -0.3
        scene.add(doll.obj)
        const blob = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.3, depthWrite: false }))
        blob.rotation.x = -Math.PI / 2
        blob.position.y = 0.002
        blob.scale.set(0.5, 0.36, 1)
        scene.add(blob)
        // Cadrage fixe (pas sur la boîte englobante : le saut et le ballon la
        // déformeraient, et les poses ne se superposeraient plus)
        const cam = new T.PerspectiveCamera(30, 1, 0.05, 50)
        cam.position.set(0, 0.92, 2.45)
        cam.lookAt(0, 0.6, 0)
        renderer.render(scene, cam)
        const url = renderer.domElement.toDataURL('image/png')
        cache.set(key(pose), url)
        out[pose] = url
        scene.remove(doll.obj)
        blob.geometry.dispose(); (blob.material as import('three').Material).dispose()
      }
    } finally {
      doll.dispose()
      shadowTex.dispose()
    }
  }).catch(() => { /* pas de WebGL : rien à montrer, rien de cassé */ })
  return out
}

/** Une image prête à insérer dans du HTML. */
export const portraitImg = (url: string | undefined, px: number, cls = '') =>
  url ? `<img class="portrait ${cls}" src="${url}" width="${px}" height="${px}" alt="" draggable="false">` : ''

/** L'image du Taquin : un vrai pré en 3D (arbres, clôture, fleurs du kit
    nature) avec quatre personnages de la ferme, rendue une fois en carré. */
export async function farmScene(kinds: CritterKind[], px: number): Promise<string> {
  const key = 'pre:' + kinds.join(',') + '@' + px
  const hit = cache.get(key)
  if (hit) return hit
  const url = await withRenderer(px, px, async (T, renderer, env) => {
    const scene = new T.Scene()
    // Un ciel en dégradé, comme la Course
    const sky = document.createElement('canvas')
    sky.width = 2; sky.height = 256
    const g = sky.getContext('2d')!
    const grad = g.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0, '#5FB3E6'); grad.addColorStop(1, '#CFEAF8')
    g.fillStyle = grad; g.fillRect(0, 0, 2, 256)
    const skyTex = new T.CanvasTexture(sky)
    skyTex.colorSpace = T.SRGBColorSpace
    scene.background = skyTex
    scene.fog = new T.Fog('#CFEAF8', 16, 34)
    lights(T, scene, env)
    const ground = new T.Mesh(new T.CircleGeometry(30, 48), new T.MeshStandardMaterial({ color: 0x4E8A3A, roughness: 1 }))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)
    const kit = critterKit(T)
    const loaded: import('three').Object3D[] = []
    try {
      const deco: [string, number, number, number, number][] = [
        ['tree_oak', -3.2, -4.2, 2.6, 0.4], ['tree_default', 3.4, -4.8, 2.4, 1.2], ['tree_fat', 0.4, -6.5, 2.2, 2],
        ['fence_simple', -3, -2.4, 1.3, 0], ['fence_simple', -1.5, -2.4, 1.3, 0], ['fence_simple', 0, -2.4, 1.3, 0],
        ['fence_simple', 1.5, -2.4, 1.3, 0], ['fence_simple', 3, -2.4, 1.3, 0],
        ['flower_redA', -2.3, 1.3, 0.45, 0], ['flower_yellowA', 2.4, 1.1, 0.45, 1], ['flower_purpleA', -0.2, 1.8, 0.4, 2],
        ['flower_yellowA', -1.1, 2.2, 0.4, 0.5], ['flower_redA', 1.3, 2, 0.4, 2.2],
        ['plant_bush', -3.4, -1.2, 0.7, 0], ['plant_bush', 3.6, -1.4, 0.6, 1]
      ]
      for (const [name, x, z, h, rot] of deco) {
        try {
          const m = await loadModel('nature', name)
          fitModel(T, m, h)
          m.traverse(o => {
            const mesh = o as import('three').Mesh
            if (!mesh.isMesh) return
            mesh.castShadow = true
            const mat = (mesh.material as import('three').MeshStandardMaterial).clone()
            mat.color.multiplyScalar(0.62) // les kits clairs délavés par l'ACES
            if (name.startsWith('tree') || name.startsWith('plant')) mat.color.multiply(new T.Color(0x9CCB6E)) // menthe → vert de pré
            mesh.material = mat
          })
          const box = new T.Box3().setFromObject(m)
          m.position.set(x, -box.min.y, z)
          m.rotation.y = rot
          scene.add(m)
          loaded.push(m)
        } catch { /* un modèle absent : le pré reste joli sans lui */ }
      }
      kinds.forEach((k, i) => {
        const c = kit.make(k, 1.15)
        const n = kinds.length
        c.obj.position.set((i - (n - 1) / 2) * 1.08, 0, (i % 2) * 0.5 - 0.2)
        c.obj.rotation.y = ((i - (n - 1) / 2) * -0.18)
        c.obj.traverse(o => { o.castShadow = true })
        scene.add(c.obj)
      })
      const cam = new T.PerspectiveCamera(40, 1, 0.1, 60)
      cam.position.set(0, 2.2, 6.4)
      cam.lookAt(0, 0.7, -0.6)
      renderer.render(scene, cam)
      return renderer.domElement.toDataURL('image/png')
    } finally {
      kit.dispose()
      skyTex.dispose()
      ground.geometry.dispose(); (ground.material as import('three').Material).dispose()
      for (const m of loaded) m.traverse(o => {
        const mesh = o as import('three').Mesh
        if (mesh.isMesh) (mesh.material as import('three').Material).dispose()
      })
    }
  }).catch(() => '')
  if (url) cache.set(key, url)
  return url
}

/** Le pré de l'accueil (23/09) : un panorama 3D large et bas, fond
    transparent — collines, haie d'arbres, clôture, fleurs, et les animaux
    de la ferme qui paissent. Rendu UNE fois en image (cache) : l'accueil
    garde un seul contexte WebGL jetable, aucun rendu en continu. */
export async function meadowBanner(w: number, h: number): Promise<string> {
  const key = `pre-large@${w}x${h}`
  const hit = cache.get(key)
  if (hit) return hit
  const url = await withRenderer(w, h, async (T, renderer, env) => {
    const scene = new T.Scene()
    lights(T, scene, env)
    // Le soleil doit couvrir tout le panorama, pas un carré de 8 m
    scene.traverse(o => {
      const d = o as import('three').DirectionalLight
      if (!d.isDirectionalLight) return
      const sc = d.shadow.camera
      sc.left = -16; sc.right = 16; sc.top = 8; sc.bottom = -8
      sc.updateProjectionMatrix()
      d.shadow.mapSize.set(2048, 1024)
    })
    const own: { dispose(): void }[] = []
    const grassMat = new T.MeshStandardMaterial({ color: 0x5E9A45, roughness: 1 })
    const grassFar = new T.MeshStandardMaterial({ color: 0x7DB35C, roughness: 1 })
    own.push(grassMat, grassFar)
    const ground = new T.Mesh(new T.CircleGeometry(40, 48), grassMat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)
    own.push(ground.geometry)
    // Des collines douces derrière : elles dessinent la ligne d'horizon
    const hillGeo = new T.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2)
    own.push(hillGeo)
    for (const [x, z, s, hh] of [[-9, -7, 5.5, 1.5], [-2.5, -9, 6.5, 2], [5, -8, 5.8, 1.6], [11, -7.5, 5, 1.3], [-14, -8, 5, 1.2]] as const) {
      const m = new T.Mesh(hillGeo, grassFar)
      m.scale.set(s, hh, s * 0.6)
      m.position.set(x, -0.05, z)
      m.receiveShadow = true
      scene.add(m)
    }
    const kit = critterKit(T)
    const loaded: import('three').Object3D[] = []
    try {
      const deco: [string, number, number, number][] = [
        ['tree_oak', -8.2, -3.6, 2.6], ['tree_default', -5.6, -4.4, 2.3], ['tree_fat', -2.2, -4.8, 2.1],
        ['tree_detailed', 2.6, -4.2, 2.5], ['tree_oak', 6.2, -4.6, 2.7], ['tree_default', 9.4, -3.8, 2.2],
        ['plant_bush', -6.6, -1.6, 0.7], ['plant_bush', 4.4, -1.8, 0.6], ['plant_bushLarge', 8.2, -2.2, 0.9],
        ['flower_redA', -4.4, 1.4, 0.4], ['flower_yellowA', -1.2, 1.9, 0.38], ['flower_purpleA', 1.8, 1.6, 0.4],
        ['flower_yellowA', 5.6, 1.2, 0.4], ['flower_redA', 8.6, 1.8, 0.38], ['flower_purpleA', -7.8, 1.6, 0.4]
      ]
      for (let i = -6; i <= 6; i++) deco.push(['fence_simple', i * 1.45, -2.6, 1.2])
      for (const [name, x, z, size] of deco) {
        try {
          const m = await loadModel('nature', name)
          fitModel(T, m, size)
          m.traverse(o => {
            const mesh = o as import('three').Mesh
            if (!mesh.isMesh) return
            mesh.castShadow = true
            const mat = (mesh.material as import('three').MeshStandardMaterial).clone()
            mat.color.multiplyScalar(0.62)
            if (name.startsWith('tree') || name.startsWith('plant')) mat.color.multiply(new T.Color(0x9CCB6E))
            mesh.material = mat
          })
          const box = new T.Box3().setFromObject(m)
          m.position.set(x, -box.min.y, z)
          m.rotation.y = name.startsWith('fence') ? 0 : Math.random() * 6.3
          scene.add(m)
          loaded.push(m)
        } catch { /* un modèle absent : le pré reste joli sans lui */ }
      }
      // Les animaux paissent, chacun tourné à sa façon
      const herd: [CritterKind, number, number, number][] = [
        ['cow', -6.2, -0.4, 0.5], ['sheep', -3.6, 0.3, -0.4], ['pig', 3.4, -0.2, 0.7],
        ['duck', 6.4, 0.6, -0.8], ['rabbit', 0.4, -1.2, 0.2], ['dog', 9.2, -0.4, -0.5]
      ]
      for (const [k, x, z, r] of herd) {
        const c = kit.make(k, 1.1)
        c.obj.position.set(x, 0, z)
        c.obj.rotation.y = r
        c.obj.traverse(o => { o.castShadow = true })
        scene.add(c.obj)
      }
      const cam = new T.PerspectiveCamera(22, w / h, 0.1, 80)
      cam.position.set(0, 1.9, 14)
      cam.lookAt(0, 0.9, -1)
      renderer.render(scene, cam)
      return renderer.domElement.toDataURL('image/png')
    } finally {
      kit.dispose()
      own.forEach(o => o.dispose())
      for (const m of loaded) m.traverse(o => {
        const mesh = o as import('three').Mesh
        if (mesh.isMesh) (mesh.material as import('three').Material).dispose()
      })
    }
  }).catch(() => '')
  if (url) cache.set(key, url)
  return url
}
