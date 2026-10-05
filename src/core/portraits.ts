import { loadThree, loadModel, fitModel, dotTex, type T3 } from './three3d'
import { critterKit, type CritterKind } from './critters'
import { makePrincess, posePrincess, type Pose } from './princess3d'
import { royalKey, type Royal } from './royal'
import { diskGet, diskPut } from './diskcache'

/* Les personnages 3D de la ferme, rendus en IMAGES pour les jeux en DOM
   (Simon, Puissance 4 ; les images du Puzzle sont dans `pictures.ts`). Ils remplacent les
   pastilles rondes de la planche Kenney — « un sprite atroce digne d'un
   Minitel » — par les mêmes personnages que Tape-Trous : un seul style.

   Un seul contexte WebGL, ouvert le temps de rendre un lot puis rendu au
   navigateur (les jeux 3D ont besoin des leurs). Les images sont gardées en
   mémoire : la deuxième partie ne recalcule rien. Même éclairage que
   `createStage` (hémisphère + soleil + IBL, ACES), fond transparent, une
   ombre douce sous les pieds. */

const cache = new Map<string, string>()

/* Les portraits de princesses coûtent cher (le personnage VRM : 6 Mo à lire,
   ses matériaux à compiler, dans un contexte 3D de plus) : ils sont GARDÉS
   (`core/diskcache.ts`) et ne se recalculent que pour une tenue nouvelle.
   Les 48 plus récents restent. */

type Renderer = import('three').WebGLRenderer

/** Ouvre un moteur de rendu jetable, le passe à `fn`, puis libère tout (servi aussi
    aux pièces et billets du Marché, `core/money3d.ts`). */
export async function withRenderer<R>(w: number, h: number, fn: (T: T3, r: Renderer, env: import('three').Texture) => Promise<R> | R): Promise<R> {
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

/** LEURS princesses (la Princesse) rendues en images, une par pose : qui
    saute de joie, qui fait coucou, qui marche. Une ou deux princesses côte à
    côte dans la même image (les deux sœurs sur l'écran de fin). Cache par
    tenue. L'image fait `px` de haut ; sa largeur suit le nombre de princesses. */
const inflight = new Map<string, Promise<Record<string, string>>>()
export function princessPortraits(looks: Royal[], poses: Pose[], px: number): Promise<Record<string, string>> {
  // Deux demandes identiques en même temps partagent le même rendu
  const k = looks.map(royalKey).join('+') + poses.join() + px
  let p = inflight.get(k)
  if (!p) {
    p = renderPrincesses(looks, poses, px).finally(() => inflight.delete(k))
    inflight.set(k, p)
  }
  return p
}

async function renderPrincesses(looks: Royal[], poses: Pose[], px: number): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const key = (p: Pose) => 'royal:' + looks.map(royalKey).join('+') + ':' + p + '@' + px
  let missing = poses.filter(p => { const hit = cache.get(key(p)); if (hit) out[p] = hit; return !hit })
  if (!missing.length || !looks.length) return out
  // Gardés d'une fois précédente ?
  const kept = await Promise.all(missing.map(p => diskGet('portrait', key(p))))
  missing.forEach((p, i) => { const u = kept[i]; if (u) { cache.set(key(p), u); out[p] = u } })
  missing = missing.filter((_, i) => !kept[i])
  if (!missing.length) return out
  const H = Math.min(640, Math.round(px * 2))
  const W = Math.round(H * (looks.length > 1 ? 1.35 : 0.8))
  await withRenderer(W, H, async (T, renderer, env) => {
    const shadowTex = dotTex(T, '#2A2018')
    const ps = await Promise.all(looks.map(l => makePrincess(T, l, { live: false })))
    try {
      for (const pose of missing) {
        const scene = new T.Scene()
        lights(T, scene, env)
        ps.forEach((pr, i) => {
          // Des instants choisis : en haut du saut, main levée, pas en avant
          const yaw = posePrincess(pr, pose, pose === 'cheer' ? 0.26 + i * 0.1 : pose === 'wave' ? 0.17 : pose === 'walk' || pose === 'stride' ? 0.2 : 0.5)
          pr.rig.rotation.y = yaw
          pr.update(0)
          pr.face.expr(pose === 'cheer' ? 'joy' : pose === 'wave' ? 'wink' : 'neutral', 99)
          pr.face.redraw()
          pr.obj.position.set(looks.length > 1 ? (i ? 0.36 : -0.36) : 0, 0, 0)
          pr.obj.rotation.y = looks.length > 1 ? (i ? -0.35 : 0.35) : pose === 'walk' || pose === 'stride' ? 0.9 : -0.3
          scene.add(pr.obj)
          const blob = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.3, depthWrite: false }))
          blob.rotation.x = -Math.PI / 2
          blob.position.set(pr.obj.position.x, 0.002, 0)
          blob.scale.set(0.74, 0.54, 1)
          scene.add(blob)
        })
        // Cadrage fixe : tout le corps, le saut compris
        const cam = new T.PerspectiveCamera(30, W / H, 0.05, 50)
        cam.position.set(0, 0.85, looks.length > 1 ? 3.25 : 3.0)
        cam.lookAt(0, 0.66, 0)
        renderer.render(scene, cam)
        const url = renderer.domElement.toDataURL('image/png')
        cache.set(key(pose), url)
        void diskPut('portrait', key(pose), url, 48)
        out[pose] = url
        ps.forEach(pr => scene.remove(pr.obj))
        scene.traverse(o => {
          const m = o as import('three').Mesh
          if (m.isMesh && m.geometry) { m.geometry.dispose(); (m.material as import('three').Material).dispose() }
        })
      }
    } finally {
      ps.forEach(pr => pr.dispose())
      shadowTex.dispose()
    }
  }).catch(() => { /* pas de WebGL : rien à montrer, rien de cassé */ })
  return out
}

/** Une image prête à insérer dans du HTML. */
export const portraitImg = (url: string | undefined, px: number, cls = '') =>
  url ? `<img class="portrait ${cls}" src="${url}" width="${px}" height="${px}" alt="" draggable="false">` : ''

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

/** Les pièces de la Ferme à construire (5/10) en vignettes, pour son tiroir :
    vues de trois quarts, d'un peu haut, sur fond transparent. Elles ne
    changent jamais : rendues une fois, gardées sur le disque. */
export async function piecePortraits(ids: import('./farm3d').PieceId[], px: number): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const todo: import('./farm3d').PieceId[] = []
  for (const id of ids) {
    const key = 'piece:' + id + '@' + px
    const hit = cache.get(key) ?? await diskGet('pieces', key).catch(() => null)
    if (hit) { cache.set(key, hit); out[id] = hit } else todo.push(id)
  }
  if (!todo.length) return out
  const size = Math.min(512, Math.round(px * 2))
  await withRenderer(size, size, async (T, renderer, env) => {
    const kept: { dispose(): void }[] = []
    const { pieceKit } = await import('./farm3d')
    const kit = await pieceKit(T, { keep: <X extends { dispose(): void }>(x: X) => { kept.push(x); return x } })
    const shadowTex = dotTex(T, '#2A2018')
    try {
      for (const id of todo) {
        const scene = new T.Scene()
        const sun = lights(T, scene, env)
        const p = kit.make(id)
        p.g.rotation.y = -0.55
        scene.add(p.g)
        const box = new T.Box3().setFromObject(p.g)
        const ctr = box.getCenter(new T.Vector3())
        const sz = box.getSize(new T.Vector3())
        const cam = sun.shadow.camera
        const r = Math.max(sz.x, sz.z) * 0.8
        cam.left = cam.bottom = -r; cam.right = cam.top = r; cam.updateProjectionMatrix()
        const blob = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.3, depthWrite: false }))
        blob.rotation.x = -Math.PI / 2
        blob.position.set(ctr.x, 0.002, ctr.z)
        blob.scale.set(sz.x * 1.2, sz.z * 1.2, 1)
        scene.add(blob)
        const rad = sz.length() / 2
        const view = new T.PerspectiveCamera(30, 1, 0.05, 80)
        const dist = rad / Math.sin(15 * Math.PI / 180) * 0.78
        view.position.set(ctr.x, ctr.y + dist * 0.55, ctr.z + dist * 0.84)
        view.lookAt(ctr.x, ctr.y - sz.y * 0.05, ctr.z)
        renderer.render(scene, view)
        const url = renderer.domElement.toDataURL('image/png')
        const key = 'piece:' + id + '@' + px
        cache.set(key, url)
        diskPut('pieces', key, url, 40).catch(() => { /* rien */ })
        out[id] = url
        scene.traverse(o => { const m = o as import('three').Mesh; if (m.isMesh) m.geometry.dispose() })
        blob.geometry.dispose(); (blob.material as import('three').Material).dispose()
      }
    } finally {
      shadowTex.dispose()
      kept.forEach(x => x.dispose())
    }
  }).catch(() => { /* pas de WebGL : le tiroir garde ses pastilles */ })
  return out
}
