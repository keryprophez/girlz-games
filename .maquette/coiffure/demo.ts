// DÉMO (phase 1 du Salon de coiffure, non livrée dans l'app) : un buste VRM, nos cheveux, la main et la brosse.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm'
import { Hair, faceGuard, scalp, type Ellipsoid, type V3 } from '../../src/core/hair'
import { hairView } from '../../src/core/hair3d'

// le visage 1, choisi par le père (23/11)
const TETES: Record<string, string> = { base: 'Base_Female.vrm.wasm' }
const TEINTES = ['#C9A35E', '#6B4A2B', '#9A3F1C', '#3E2A1E', '#1E1816']
const q = new URLSearchParams(location.search)
const tete = TETES[q.get('tete') || ''] ? q.get('tete')! : 'base'

const box = document.getElementById('scene')!
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1))
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.outputColorSpace = THREE.SRGBColorSpace
box.appendChild(renderer.domElement)
const scene = new THREE.Scene()
scene.background = new THREE.Color('#F6E7DA')
const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 20)
scene.add(new THREE.HemisphereLight('#FFF4EC', '#B99A8A', 1.6))
const sun = new THREE.DirectionalLight('#FFF1E0', 2.4)
scene.add(sun)
const fill = new THREE.DirectionalLight('#FFE6F0', 0.7)
scene.add(fill)

let model: VRM | null = null
let skullDbg = ''
/** Le corps du modèle (pour savoir si le doigt touche le corps ou les cheveux). */
const bodyMeshes: THREE.Object3D[] = []
const scalpMats: THREE.MeshBasicMaterial[] = []
function paintScalp(hex: string) {
  for (const m of scalpMats) {
    const u = m as unknown as { color?: THREE.Color; map?: THREE.Texture | null; uniforms?: Record<string, { value: unknown }> }
    if (u.uniforms?.litFactor) { (u.uniforms.litFactor.value as THREE.Color).set(hex).multiplyScalar(0.55); (u.uniforms.shadeColorFactor.value as THREE.Color).set(hex).multiplyScalar(0.35); u.uniforms.map.value = null }
    else if (u.color) { u.color.set(hex).multiplyScalar(0.55); u.map = null }
    m.needsUpdate = true
  }
}
let hair: Hair | null = null, view: ReturnType<typeof hairView> | null = null
const pivot = new THREE.Group()
scene.add(pivot)
const hairGroup = new THREE.Group()
pivot.add(hairGroup)
let C = new THREE.Vector3(), R = 0.09
let yaw = q.has('yaw') ? Number(q.get('yaw')) : Math.PI - 0.45, vYaw = 0

function resize() {
  const w = box.clientWidth, h = box.clientHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)

async function load() {
  const loader = new GLTFLoader()
  loader.register(p => new VRMLoaderPlugin(p))
  const gltf = await loader.loadAsync(TETES[tete])
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
  model = vrm
  // les cheveux du modèle s'en vont (on garde le cuir chevelu peint de VRoid)
  vrm.scene.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const mats = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.Material[]
    const hairy = /hair/i.test(m.name) || mats.every(x => /hair/i.test(x.name) && !/hairback/i.test(x.name))
    if (hairy) m.visible = false
    m.frustumCulled = false
    for (const x of mats) if (/hairback/i.test(x.name)) scalpMats.push(x as THREE.MeshBasicMaterial)
  })
  // la tête : ses sommets au-dessus du cou, près de l'os de la tête
  const hb = vrm.humanoid.getNormalizedBoneNode('head')!, nb = vrm.humanoid.getNormalizedBoneNode('neck')!
  const H = hb.getWorldPosition(new THREE.Vector3()), Nk = nb.getWorldPosition(new THREE.Vector3())
  const bb = new THREE.Box3(), v = new THREE.Vector3()
  const skin: THREE.Mesh[] = []
  vrm.scene.traverse(o => {
    const m = o as THREE.SkinnedMesh
    if (!m.isMesh || !m.visible) return
    skin.push(m)
    const p = m.geometry.getAttribute('position')
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      if (m.isSkinnedMesh) m.applyBoneTransform(i, v)
      v.applyMatrix4(m.matrixWorld)
      if (v.y > H.y - 0.02 && Math.hypot(v.x - H.x, v.z - H.z) < 0.14) bb.expandByPoint(v)
    }
  })
  const size = bb.getSize(new THREE.Vector3())
  C = bb.getCenter(new THREE.Vector3())
  // le crâne : un peu moins large que la boîte (les oreilles)
  const rx = size.x / 2 * 0.9, ry = size.y / 2, rz = size.z / 2 * 0.95
  R = (rx + ry + rz) / 3
  C.y -= ry * 0.04
  const skull: Ellipsoid = { c: [0, 0, 0], r: [rx / R, ry / R, rz / R] }
  skullDbg = 'crâne ' + skull.r.map(v => v.toFixed(2)) + ' R=' + R.toFixed(3) + ' taille ' + [size.x, size.y, size.z].map(v => v.toFixed(3))
  pivot.position.copy(C)
  vrm.scene.position.sub(C)
  pivot.add(vrm.scene)
  // les épaules et le cou, en unités de tête
  const ls = vrm.humanoid.getNormalizedBoneNode('leftUpperArm')!.getWorldPosition(new THREE.Vector3())
  const ch = (vrm.humanoid.getNormalizedBoneNode('upperChest') ?? vrm.humanoid.getNormalizedBoneNode('chest'))!.getWorldPosition(new THREE.Vector3())
  bodyMeshes.push(...skin)
  const u = (p: THREE.Vector3): V3 => [(p.x - C.x) / R, (p.y - C.y) / R, (p.z - C.z) / R]
  const neck: Ellipsoid = { c: u(Nk), r: [0.42, 0.9, 0.45] }
  neck.c[1] -= 0.2
  const sw = Math.abs(ls.x - C.x) / R
  const torso: Ellipsoid = { c: u(ch), r: [sw * 1.05, 1.25, 1.05] }
  torso.c[1] += 0.15
  // les racines posées sur le vrai crâne : un rayon de l'extérieur vers le centre
  const init = scalp({ skull, count: 300, length: 3.6, seed: 5 })
  const ray = new THREE.Raycaster()
  for (const r of init.roots) {
    const d = new THREE.Vector3(...r).normalize()
    ray.set(C.clone().addScaledVector(d, R * 3), d.clone().negate())
    const hit = ray.intersectObjects(skin, false).find(h => h.point.distanceTo(C) < R * 1.6)
    if (hit) { const p = u(hit.point); r[0] = p[0]; r[1] = p[1]; r[2] = p[2] }
  }
  hair = new Hair(init, 14)
  hair.headColliders = [skull, faceGuard(skull), neck, torso]
  hair.setHead(yaw, 0, true)
  hair.bake(5)
  view = hairView(THREE, hair, { width: 0.05, child: 12 })
  hairGroup.scale.setScalar(R)
  hairGroup.add(view.mesh)
  view.setColor(TEINTES[1])
  paintScalp(TEINTES[1])
  // le cadrage : la tête et les épaules
  camera.position.set(C.x, C.y - R * 0.3, C.z + R * 12)
  camera.lookAt(C.x, C.y - R * 1.15, C.z)
  sun.position.set(C.x - 1, C.y + 2, C.z + 1.5)
  fill.position.set(C.x + 1.5, C.y + 0.3, C.z - 1)
  view.setLight(-0.35, 0.8, 0.5)
  ;(window as unknown as { __coif: unknown }).__coif = {
    ready: true,
    proj(g: number, i: number) {
      const p = hair!.point(g, i); const w = hairGroup.localToWorld(new THREE.Vector3(...p)).project(camera)
      const r = renderer.domElement.getBoundingClientRect()
      return { x: r.left + (w.x + 1) / 2 * r.width, y: r.top + (1 - w.y) / 2 * r.height }
    },
    front() {
      const h = hair!; const out: string[] = []
      for (let g = 0; g < h.G; g++) for (let i = 4; i < h.P; i++) { const p = h.point(g, i); if (p[2] > 0.5 && Math.abs(p[0]) < 0.6 && p[1] < 0.2 && p[1] > -1.2) { out.push(`g${g} i${i} p=${p.map(v => v.toFixed(2))} racine=${h.root(g).map(v => v.toFixed(2))} pousse=${Array.from(h.dirL.slice(g * 3, g * 3 + 3)).map(v => v.toFixed(2))}`); break } }
      return [skullDbg, out.length, ...out.slice(0, 6)].join('\n')
    },
    still() { return hair!.asleep.reduce((a, b) => a + b, 0) / hair!.G },
    get G() { return hair!.G },
    get yaw() { return yaw }
  }
  document.body.classList.add('pret')
}

/* ---- Le doigt ---- */
type Mode = 'main' | 'brosse'
let mode: Mode = 'main'
const ray = new THREE.Raycaster()
function simRay(e: { clientX: number; clientY: number }): [V3, V3] {
  const r = renderer.domElement.getBoundingClientRect()
  ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera)
  // dans le repère de la tête (celui des cheveux)
  hairGroup.updateWorldMatrix(true, false)
  const inv = hairGroup.matrixWorld.clone().invert()
  const o = ray.ray.origin.clone().applyMatrix4(inv)
  const d = ray.ray.direction.clone().transformDirection(inv)
  return [[o.x, o.y, o.z], [d.x, d.y, d.z]]
}
interface Grab { id: number; kind: 'main' | 'brosse' | 'tourner'; t: number; held: { idx: number; g: number; off: V3 }[]; x: number; y: number; last: V3 | null }
let grab: Grab | null = null
const at = (o: V3, d: V3, t: number): V3 => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t]
const cv = renderer.domElement
cv.style.touchAction = 'none'
/** La distance au corps sous le doigt (vêtements, peau), ou l'infini. */
const bodyCaster = new THREE.Raycaster()
function bodyRay(e: { clientX: number; clientY: number }) {
  const r = renderer.domElement.getBoundingClientRect()
  bodyCaster.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera)
  const hit = bodyCaster.intersectObjects(bodyMeshes, false)[0]
  return hit ? hit.distance : Infinity
}
cv.addEventListener('pointerdown', e => {
  if (!hair || grab) return
  cv.setPointerCapture(e.pointerId)
  const [o, d] = simRay(e)
  // le doigt prend ce qu'il touche VRAIMENT (le père, 23/11) : des cheveux
  // sous le doigt → on les attrape (même tout en bas du dos) ; le corps
  // devant les cheveux, ou le vide → le buste tourne
  const under = hair.pick(o, d, 0.12, 0.7, 2)
  const hairT = under.length ? Math.min(...under.map(h => h.t)) * R : Infinity
  const body = bodyRay(e)
  const onHair = under.length > 0 && !(body < hairT - R * 0.05)
  const hits = onHair ? hair.pick(o, d, mode === 'main' ? 0.32 : 0.45, 0.7, 3) : []
  if (!hits.length) { grab = { id: e.pointerId, kind: 'tourner', t: 0, held: [], x: e.clientX, y: e.clientY, last: null }; return }
  const tmin = Math.min(...hits.map(h => h.t))
  const p0 = at(o, d, tmin)
  if (mode === 'brosse') { grab = { id: e.pointerId, kind: 'brosse', t: tmin, held: [], x: e.clientX, y: e.clientY, last: p0 }; return }
  // la main : chaque mèche touchée est tenue par son point le plus proche, et les mèches se resserrent
  const held = hits.map(h => {
    const i = Math.max(4, h.i), idx = h.g * hair!.P + i, p = hair!.point(h.g, i)
    hair!.shape[h.g] = 0.08
    return { idx, g: h.g, off: [(p[0] - p0[0]) * 0.35, (p[1] - p0[1]) * 0.35, (p[2] - p0[2]) * 0.35] as V3 }
  })
  grab = { id: e.pointerId, kind: 'main', t: tmin, held, x: e.clientX, y: e.clientY, last: p0 }
  move(e)
})
function move(e: PointerEvent) {
  if (!grab || !hair || e.pointerId !== grab.id) return
  if (grab.kind === 'tourner') {
    const dx = e.clientX - grab.x
    grab.x = e.clientX
    vYaw = dx * 0.009 * 60
    yaw += dx * 0.009
    return
  }
  const [o, d] = simRay(e)
  const p = at(o, d, grab.t)
  if (grab.kind === 'brosse') {
    const m: V3 = [p[0] - grab.last![0], p[1] - grab.last![1], p[2] - grab.last![2]]
    hair.comb(o, d, 0.45, m, 0.45)
    grab.last = p
    return
  }
  for (const h of grab.held) {
    const r = hair.root(h.g), i = h.idx % hair.P
    let t: V3 = [p[0] + h.off[0], p[1] + h.off[1], p[2] + h.off[2]]
    // pas plus loin que la longueur de la mèche
    const dx = t[0] - r[0], dy = t[1] - r[1], dz = t[2] - r[2], l = Math.hypot(dx, dy, dz), max = hair.seg[h.g] * i * 0.98
    if (l > max) t = [r[0] + dx / l * max, r[1] + dy / l * max, r[2] + dz / l * max]
    hair.pin(h.idx, t)
  }
}
cv.addEventListener('pointermove', e => {
  // tous les points du geste, même entre deux images : le doigt n'a aucun retard
  const evs = (e as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] }).getCoalescedEvents?.() ?? []
  move(evs.length ? evs[evs.length - 1] : e)
})
const up = (e: PointerEvent) => {
  if (!grab || e.pointerId !== grab.id || !hair) return
  for (const h of grab.held) { hair.pin(h.idx, null); hair.shape[h.g] = 1 }
  grab = null
}
cv.addEventListener('pointerup', up)
cv.addEventListener('pointercancel', up)

/* ---- Les boutons ---- */
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.onclick = () => {
  mode = b.dataset.mode as Mode
  document.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('sel', x === b))
})
document.querySelectorAll<HTMLButtonElement>('[data-teinte]').forEach((b, i) => {
  b.style.background = TEINTES[i]
  b.onclick = () => { view?.setColor(TEINTES[i]); paintScalp(TEINTES[i]); document.querySelectorAll('[data-teinte]').forEach(x => x.classList.toggle('sel', x === b)) }
})

/* ---- La boucle ---- */
const fpsEl = document.getElementById('fps')!
let last = performance.now(), frames = 0, acc = 0
function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (!grab || grab.kind !== 'tourner') { yaw += vYaw * dt; vYaw *= Math.pow(0.04, dt) }
  pivot.rotation.y = yaw
  model?.update(dt)
  if (hair && view) {
    hair.setHead(yaw, 0)
    const t0 = performance.now()
    hair.advance(dt)
    const t1 = performance.now()
    view.update()
    fpsEl.dataset.phys = (t1 - t0).toFixed(1)
  }
  renderer.render(scene, camera)
  frames++; acc += dt
  if (acc > 0.5) { fpsEl.textContent = `${Math.round(frames / acc)} img/s · physique ${fpsEl.dataset.phys} ms`; frames = 0; acc = 0 }
  requestAnimationFrame(loop)
}
resize()
load().catch(err => { document.getElementById('err')!.textContent = String(err) })
requestAnimationFrame(loop)
