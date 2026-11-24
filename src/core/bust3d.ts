/* @version 2026-11-25 00:20 */
import type * as THREE from 'three'
import type { VRM } from '@pixiv/three-vrm'
import { SkullMap, type Ellipsoid, type V3 } from './hair'
import type { T3 } from './three3d'

/* Le buste du Salon de coiffure : `Base_Female`, le corps de base de VRoid
   (CC0, sans coiffure), choisi par le père (23/11). Chargé, les bras le long
   du corps, ses cheveux peints retirés ; puis ce dont les cheveux ont besoin,
   en « rayons de tête » autour du centre de la tête : le crâne (avec et sans
   les oreilles), le cou, les épaules, son cuir chevelu, son corps figé (pour
   savoir si le doigt touche le corps ou les cheveux). */

export interface Bust {
  vrm: VRM
  /** Le centre de la tête (déjà ramené à l'origine du modèle) et son rayon (mètres). */
  C: THREE.Vector3
  R: number
  skull: Ellipsoid
  map: SkullMap
  bare: SkullMap
  neck: Ellipsoid
  torso: Ellipsoid
  /** Le corps figé, sans le cuir chevelu caché (mètres, autour du centre de la tête). */
  skin: Float32Array
  /** Le cuir chevelu du modèle (rayons de tête). */
  scalp: Float32Array
  /** Le cuir chevelu peint, sous les cheveux, à leur teinte. */
  paint(hex: string): void
  /** Les expressions (VRM) : `happy`, `relaxed`, `blink`… (0..1). */
  face(name: string, v: number): void
  dispose(): void
}

export async function loadBust(THREE: T3, src: string | ArrayBuffer): Promise<Bust> {
  const [{ GLTFLoader }, { VRMLoaderPlugin, VRMUtils }] = await Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('@pixiv/three-vrm')])
  const loader = new GLTFLoader()
  loader.register(p => new VRMLoaderPlugin(p))
  loader.register(textures(THREE))
  const gltf = typeof src === 'string' ? await loader.loadAsync(src) : await loader.parseAsync(src, '')
  const scalpMats: THREE.MeshBasicMaterial[] = []
  function paintScalp(hex: string) {
    for (const m of scalpMats) {
      const u = m as unknown as { color?: THREE.Color; map?: THREE.Texture | null; uniforms?: Record<string, { value: unknown }> }
      if (u.uniforms?.litFactor) { (u.uniforms.litFactor.value as THREE.Color).set(hex).multiplyScalar(0.55); (u.uniforms.shadeColorFactor.value as THREE.Color).set(hex).multiplyScalar(0.35); u.uniforms.map.value = null }
      else if (u.color) { u.color.set(hex).multiplyScalar(0.55); u.map = null }
      m.needsUpdate = true
    }
  }
  const vrm = gltf.userData.vrm as VRM
  VRMUtils.removeUnnecessaryVertices(gltf.scene)
  VRMUtils.rotateVRM0(vrm)
  // les bras le long du corps (le modèle est livré bras en croix)
  // (le sens dépend du format du modèle : on essaie, et on retourne si la main est montée)
  const handY = () => { vrm.update(0); vrm.scene.updateMatrixWorld(true); return vrm.humanoid.getRawBoneNode('leftHand')!.getWorldPosition(new THREE.Vector3()).y - vrm.humanoid.getRawBoneNode('leftUpperArm')!.getWorldPosition(new THREE.Vector3()).y }
  const lu = vrm.humanoid.getNormalizedBoneNode('leftUpperArm')!, ru = vrm.humanoid.getNormalizedBoneNode('rightUpperArm')!
  lu.rotation.z = 1.25; ru.rotation.z = -1.25
  if (handY() > 0) { lu.rotation.z = -1.25; ru.rotation.z = 1.25 }
  vrm.update(0)
  vrm.scene.updateMatrixWorld(true)
  // les cheveux du modèle s'en vont (on garde le cuir chevelu peint de VRoid)
  vrm.scene.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const mats = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.Material[]
    const hairy = /hair/i.test(m.name) || mats.every(x => /hair/i.test(x.name) && !/hairback/i.test(x.name))
    // (caché, il ne se dessine pas : il s'en va pour de bon)
    if (hairy) m.visible = false
    m.frustumCulled = false
    for (const x of mats) if (/hairback/i.test(x.name)) scalpMats.push(x as THREE.MeshBasicMaterial)
  })
  // la tête : ses sommets au-dessus du cou, près de l'os de la tête
  const hb = vrm.humanoid.getNormalizedBoneNode('head')!, nb = vrm.humanoid.getNormalizedBoneNode('neck')!
  const H = hb.getWorldPosition(new THREE.Vector3()), Nk = nb.getWorldPosition(new THREE.Vector3())
  const bb = new THREE.Box3(), v = new THREE.Vector3()
  const skin: number[] = [], headCopy: THREE.Mesh[] = [], scalpWorld: number[] = []
  vrm.scene.traverse(o => {
    const m = o as THREE.SkinnedMesh
    if (!m.isMesh || !m.visible) return
    const p = m.geometry.getAttribute('position')
    const world = new Float32Array(p.count * 3)
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      if (m.isSkinnedMesh) m.applyBoneTransform(i, v)
      v.applyMatrix4(m.matrixWorld)
      world.set([v.x, v.y, v.z], i * 3)
      if (v.y > H.y - 0.02 && Math.hypot(v.x - H.x, v.z - H.z) < 0.14) bb.expandByPoint(v)
    }
    // une copie FIGÉE des seuls triangles de la tête, pour poser les racines :
    // un rayon sur le modèle animé recalcule son squelette à chaque triangle
    // (14 s de chargement pour 300 racines)
    const idx = m.geometry.index, tri: number[] = []
    const n = idx ? idx.count : p.count
    for (let t = 0; t < n; t += 3) {
      const a = idx ? idx.getX(t) : t, b2 = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2
      if (world[a * 3 + 1] < Nk.y || world[b2 * 3 + 1] < Nk.y || world[c * 3 + 1] < Nk.y) continue
      for (const k of [a, b2, c]) tri.push(world[k * 3], world[k * 3 + 1], world[k * 3 + 2])
    }
    // le cuir chevelu peint du modèle : la calotte s'y posera exactement
    if (scalpMats.some(x => (Array.isArray(m.material) ? m.material : [m.material]).includes(x as unknown as THREE.Material))) {
      const all = idx ? idx.count : p.count
      for (let t = 0; t < all; t++) { const k = idx ? idx.getX(t) : t; scalpWorld.push(world[k * 3], world[k * 3 + 1], world[k * 3 + 2]) }
      m.visible = false
    } else {
      // le corps, FIGÉ lui aussi (sans le cuir chevelu caché : il passait
      // devant les cheveux, et le doigt tournait le buste au lieu de coiffer)
      const all = idx ? idx.count : p.count
      for (let t = 0; t < all; t++) { const k = idx ? idx.getX(t) : t; skin.push(world[k * 3], world[k * 3 + 1], world[k * 3 + 2]) }
    }
    if (tri.length) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3))
      headCopy.push(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })))
    }
  })
  const size = bb.getSize(new THREE.Vector3())
  const C = bb.getCenter(new THREE.Vector3())
  C.x = H.x // (la boîte penchait de 1 cm d'un côté : la tête tournait de travers)
  // le crâne : un peu moins large que la boîte (les oreilles)
  const rx = size.x / 2 * 0.9, ry = size.y / 2, rz = size.z / 2 * 0.95
  const R = (rx + ry + rz) / 3
  C.y -= ry * 0.04
  const skull: Ellipsoid = { c: [0, 0, 0], r: [rx / R, ry / R, rz / R] }
  // les épaules et le cou, en unités de tête
  const ls = vrm.humanoid.getNormalizedBoneNode('leftUpperArm')!.getWorldPosition(new THREE.Vector3())
  const ch = (vrm.humanoid.getNormalizedBoneNode('upperChest') ?? vrm.humanoid.getNormalizedBoneNode('chest'))!.getWorldPosition(new THREE.Vector3())
  for (let k = 0; k < skin.length; k += 3) { skin[k] -= C.x; skin[k + 1] -= C.y; skin[k + 2] -= C.z }
  const u = (p: THREE.Vector3): V3 => [(p.x - C.x) / R, (p.y - C.y) / R, (p.z - C.z) / R]
  const neck: Ellipsoid = { c: u(Nk), r: [0.42, 0.9, 0.45] }
  neck.c[1] -= 0.2
  const sw = Math.abs(ls.x - C.x) / R
  const torso: Ellipsoid = { c: u(ch), r: [sw * 1.05, 1.25, 1.05] }
  torso.c[1] += 0.15
  // (reculé vers le dos d'autant que la poitrine avance : les omoplates sont
  // plus loin que l'os, sinon le gilet perce les cheveux aux épaules)
  torso.c[2] = -torso.c[2]
  // les racines posées sur le vrai crâne : un rayon de l'extérieur vers le centre
  // la carte du crâne : des points serrés sur tous les triangles de la tête
  const cloud: number[] = [], bareCloud: number[] = []
  const sow = (P: ArrayLike<number>, into: number[]) => {
    for (let t = 0; t < P.length; t += 9) {
      const a = [P[t], P[t + 1], P[t + 2]], b = [P[t + 3], P[t + 4], P[t + 5]], c = [P[t + 6], P[t + 7], P[t + 8]]
      const n = Math.max(1, Math.ceil(Math.max(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2])) / R / 0.09))
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
        const u1 = i / n, v1 = j / n, w1 = 1 - u1 - v1
        const x = (a[0] * w1 + b[0] * u1 + c[0] * v1 - C.x) / R, y = (a[1] * w1 + b[1] * u1 + c[1] * v1 - C.y) / R, z = (a[2] * w1 + b[2] * u1 + c[2] * v1 - C.z) / R
        if (Math.hypot(x, y, z) < 1.45) into.push(x, y, z)
      }
    }
  }
  for (const m of headCopy) sow(m.geometry.getAttribute('position').array, cloud)
  // le crâne nu : le seul cuir chevelu du modèle, qui passe sous les oreilles
  sow(scalpWorld, bareCloud)
  const map = SkullMap.from(cloud, skull), bare = SkullMap.from(bareCloud, map)
  // (toutes les mesures faites, le modèle vient à l'origine, le centre de la tête en 0)
  vrm.scene.position.sub(C)
  const scalp = new Float32Array(scalpWorld.length)
  for (let k = 0; k < scalpWorld.length; k += 3) {
    scalp[k] = (scalpWorld[k] - C.x) / R; scalp[k + 1] = (scalpWorld[k + 1] - C.y) / R; scalp[k + 2] = (scalpWorld[k + 2] - C.z) / R
  }
  headCopy.forEach(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose() })
  return {
    vrm, C, R, skull, map, bare, neck, torso, skin: new Float32Array(skin), scalp, paint: paintScalp,
    face: (name, v) => { vrm.expressionManager?.setValue(name, v); vrm.expressionManager?.update() },
    dispose: () => { VRMUtils.deepDispose(vrm.scene) }
  }
}

/** Les textures du modèle, décodées sans passer par une adresse `blob:`
    (certains aperçus les interdisent : les vêtements y étaient blancs). */
const textures = (THREE: T3) => (parser: import('three/examples/jsm/loaders/GLTFLoader.js').GLTFParser) => ({
  name: 'TEXTURES_SANS_ADRESSE',
  loadTexture(index: number) {
    const def = parser.json.textures[index], img = parser.json.images[def.source]
    if (img.bufferView === undefined) return null
    return parser.getDependency('bufferView', img.bufferView).then(async (buf: ArrayBuffer) => {
      const t = new THREE.Texture(await createImageBitmap(new Blob([buf], { type: img.mimeType }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
      const sm = parser.json.samplers?.[def.sampler] ?? {}, wrap: Record<number, THREE.Wrapping> = { 33071: THREE.ClampToEdgeWrapping, 33648: THREE.MirroredRepeatWrapping }
      t.flipY = false
      t.name = def.name || img.name || ''
      t.magFilter = sm.magFilter === 9728 ? THREE.NearestFilter : THREE.LinearFilter
      t.minFilter = ({ 9728: THREE.NearestFilter, 9729: THREE.LinearFilter, 9984: THREE.NearestMipmapNearestFilter, 9985: THREE.LinearMipmapNearestFilter, 9986: THREE.NearestMipmapLinearFilter } as Record<number, THREE.MinificationTextureFilter>)[sm.minFilter] ?? THREE.LinearMipmapLinearFilter
      t.wrapS = wrap[sm.wrapS] ?? THREE.RepeatWrapping
      t.wrapT = wrap[sm.wrapT] ?? THREE.RepeatWrapping
      t.generateMipmaps = t.minFilter !== THREE.NearestFilter && t.minFilter !== THREE.LinearFilter
      t.needsUpdate = true
      parser.associations.set(t, { textures: index })
      return t
    })
  }
})
