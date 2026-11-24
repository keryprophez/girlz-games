// DÉMO (phase 1 du Salon de coiffure, non livrée dans l'app) : un buste VRM, nos cheveux, la main et la brosse.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm'
import { Hair, faceGuard, onScalp, scalp, type Ellipsoid, type V3 } from '../../src/core/hair'
import { hairCap, hairView } from '../../src/core/hair3d'

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
let cap: ReturnType<typeof hairCap> | null = null
let looks = new Float32Array(0)
let skullDbg = ''

/* ---- Le pas à pas : une RECETTE par coiffure ----
   Ses étapes (chacune un geste sur les cheveux), ses attaches (où vont les
   mèches) et le côté de chaque mèche (les couettes : gauche ou droite). */
type Kind = 'brosser' | 'raie' | 'rassembler' | 'elastique' | 'fini'
interface Step { k: Kind; a: number; txt: string }
interface Recette { id: string; dirs: V3[]; side(r: V3): number; steps: Step[] }
const RECETTES: Recette[] = [
  {
    id: 'queue', dirs: [[0, 0.2, -1]], side: () => 0,
    steps: [
      { k: 'brosser', a: -1, txt: 'Brosse les cheveux vers l’arrière, du haut vers le bas' },
      { k: 'rassembler', a: 0, txt: 'Attrape les mèches et rassemble-les dans le rond, derrière la tête' },
      { k: 'elastique', a: 0, txt: 'Fais glisser l’élastique sur la queue de cheval' },
      { k: 'fini', a: -1, txt: 'C’est fini ! Une jolie queue de cheval.' }
    ]
  },
  {
    // deux couettes au-dessus des oreilles, un peu en arrière
    id: 'couettes', dirs: [[0.85, 0.32, -0.45], [-0.85, 0.32, -0.45]], side: r => (r[0] >= 0 ? 0 : 1),
    steps: [
      { k: 'brosser', a: -1, txt: 'Brosse les cheveux, du haut vers le bas' },
      { k: 'raie', a: -1, txt: 'Trace la raie au milieu de la tête, du front vers l’arrière' },
      { k: 'rassembler', a: 0, txt: 'Rassemble les cheveux de ce côté dans le rond' },
      { k: 'elastique', a: 0, txt: 'Fais glisser l’élastique sur la couette' },
      { k: 'rassembler', a: 1, txt: 'L’autre côté : rassemble les cheveux dans le rond' },
      { k: 'elastique', a: 1, txt: 'Fais glisser l’élastique sur la deuxième couette' },
      { k: 'fini', a: -1, txt: 'C’est fini ! Deux jolies couettes.' }
    ]
  }
]
let recette = RECETTES.find(r => r.id === q.get('coiffure')) ?? RECETTES[0]
let stepI = 0
const step = () => recette.steps[stepI]
let etape: Kind = 'brosser'
let initial: { pos: Float32Array; rest: Float32Array; dir: Float32Array } | null = null
/** Les attaches (repère de la tête), posées juste au-dessus de la calotte. */
let TIES: V3[] = []
let sides = new Int8Array(0)
let brushed = new Uint8Array(0)
const brushedNow = new Set<number>()
const rings: THREE.Mesh[] = [], bands: THREE.Mesh[] = []
for (let k = 0; k < 2; k++) {
  const r = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 12, 48), new THREE.MeshBasicMaterial({ color: '#FFC83D', transparent: true, opacity: 0.85, depthTest: false }))
  r.renderOrder = 10
  rings.push(r)
  bands.push(new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.034, 16, 40), new THREE.MeshStandardMaterial({ color: k ? '#3D9BF0' : '#E8427C', roughness: 0.45 })))
}
const bandPop = [0, 0], pulledA = [0, 0], tied = [false, false]
let lastRaie = { span: 0, mid: 0, n: 0 }
let partV = 0, partGoal = 0, yawGoal: number | null = null, camEl = 0
const isBack = (g: number) => hair!.rootL[g * 3 + 2] < 0.35
const outward = (a: number) => new THREE.Vector3(...TIES[a]).normalize()

function setStep(i: number) {
  stepI = i
  const st = step()
  etape = st.k
  mode = st.k === 'brosser' ? 'brosse' : 'main'
  const n = recette.steps.length - 1
  document.getElementById('texte')!.innerHTML = `<b>${st.k === 'fini' ? '✓' : i + 1}</b>${st.txt}`
  document.getElementById('etapes')!.innerHTML = Array.from({ length: n }, (_, k) => `<i class="${k < i ? 'on' : k === i ? 'cur' : ''}"></i>`).join('')
  rings.forEach((r, k) => { r.visible = st.k === 'rassembler' && st.a === k })
  document.getElementById('plateau')!.hidden = st.k !== 'elastique'
  raieHint.visible = st.k === 'raie'
  // la tête se tourne d'elle-même vers ce qu'il faut coiffer
  if (st.k === 'brosser') yawGoal = Math.PI
  else if (st.k === 'raie') yawGoal = 0
  else if (st.a >= 0) { const d = TIES[st.a]; yawGoal = Math.atan2(-d[0], d[2]) }
  if (st.k === 'fini') fete()
}
const next = () => setStep(Math.min(recette.steps.length - 1, stepI + 1))
const setEtape = (k: Kind) => setStep(Math.max(0, recette.steps.findIndex(s => s.k === k)))

/** L'élastique AUTOUR du faisceau : centré sur les attaches de son côté,
    son anneau perpendiculaire au flux (il suit la queue qui se balance). */
const bandAxis = new THREE.Vector3(0, 0, 1)
function placeBand(a: number, dt: number) {
  const h = hair!, c = new THREE.Vector3(), d = new THREE.Vector3(), band = bands[a]
  let n = 0
  for (let g = 0; g < h.G; g++) {
    const j = h.tieIdx[g]
    if (j < 1 || sides[g] !== a) continue
    const p0 = h.point(g, j - 1), p1 = h.point(g, j)
    c.x += p0[0] + (p1[0] - p0[0]) * 0.35; c.y += p0[1] + (p1[1] - p0[1]) * 0.35; c.z += p0[2] + (p1[2] - p0[2]) * 0.35
    d.x += p1[0] - p0[0]; d.y += p1[1] - p0[1]; d.z += p1[2] - p0[2]
    n++
  }
  if (!n) return
  c.divideScalar(n); d.normalize()
  band.position.copy(c)
  band.quaternion.setFromUnitVectors(bandAxis, d)
  if (bandPop[a] > 0) {
    bandPop[a] = Math.max(0, bandPop[a] - dt * 2.5)
    band.scale.setScalar(1 + bandPop[a] * 1.2)
    band.rotateZ(bandPop[a] * 6)
  }
}
/** La lueur : les mèches à prendre maintenant. */
function glowNow() {
  const h = hair!, gl = view!.glow, st = step()
  for (let g = 0; g < h.G; g++) gl[g] = st.k === 'brosser' ? (isBack(g) && !brushed[g] ? 1 : 0) : st.k === 'rassembler' ? (h.tieIdx[g] < 0 && sides[g] === st.a ? 1 : 0) : 0
}
/** La raie tracée : la chevelure s'écarte de chaque côté de la ligne du milieu. */
function doPart() {
  const h = hair!, moved: number[] = []
  partGoal = 1
  for (let g = 0; g < h.G; g++) {
    const k = g * 3, x = h.rootL[k], y = h.rootL[k + 1], z = h.rootL[k + 2]
    if (Math.abs(x) > 0.5 || y < -0.5) continue
    const l = Math.hypot(x, y, z) || 1, n = [x / l, y / l, z / l]
    let d = [Math.sign(x || 1), -0.35, -0.25]
    const dn = d[0] * n[0] + d[1] * n[1] + d[2] * n[2]
    d = [d[0] - n[0] * dn + n[0] * 0.1, d[1] - n[1] * dn + n[1] * 0.1, d[2] - n[2] * dn + n[2] * 0.1]
    const dl = Math.hypot(d[0], d[1], d[2]) || 1
    h.dirL[k] = d[0] / dl; h.dirL[k + 1] = d[1] / dl; h.dirL[k + 2] = d[2] / dl
    h.shape[g] = 0.15; h.wake(g); moved.push(g)
  }
  setTimeout(() => { if (!hair) return; hair.keepPose(moved); for (const g of moved) hair.shape[g] = 1; next() }, 1300)
}
/** La ligne à tracer pour la raie : du front vers l'arrière, sur la calotte. */
const raieHint = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: '#FFC83D', transparent: true, opacity: 0.9, depthTest: true }))
function buildRaieHint() {
  const pts: THREE.Vector3[] = []
  for (let k = 0; k <= 24; k++) {
    const a = 0.7 - k / 24 * 2.1 // du front (devant, en haut) vers la nuque
    const q = cap!.surface([0, Math.cos(a - 0.0) * 0.9 + 0.1, Math.sin(a)])
    const l = Math.hypot(...q)
    pts.push(new THREE.Vector3(q[0] / l * (l + 0.04), q[1] / l * (l + 0.04), q[2] / l * (l + 0.04)))
  }
  raieHint.geometry.dispose()
  raieHint.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.022, 8, false)
}
function recommencer() {
  const h = hair!
  for (let g = 0; g < h.G; g++) { h.untie(g); h.shape[g] = 1 }
  h.pos.set(initial!.pos); h.prev.set(initial!.pos); h.rest.set(initial!.rest); h.dirL.set(initial!.dir)
  h.wake()
  brushed.fill(0)
  partV = partGoal = 0
  pulledA.fill(0); tied.fill(false)
  bands.forEach(b => { b.visible = false })
  setupRecette()
  setStep(0)
}
/** Les attaches et les côtés de la recette. */
function setupRecette() {
  const h = hair!
  TIES = recette.dirs.map(d => { const qq = cap!.surface(d), l = Math.hypot(...qq); return [qq[0] / l * (l + 0.06), qq[1] / l * (l + 0.06), qq[2] / l * (l + 0.06)] as V3 })
  sides = new Int8Array(h.G)
  for (let g = 0; g < h.G; g++) sides[g] = recette.side(h.root(g))
  cap!.setTie(TIES[0], 1)
  cap!.setTie2(TIES[1] ?? null)
  cap!.setSides((x, y, z) => recette.side([x, y, z]))
  TIES.forEach((t, a) => {
    const n = outward(a)
    rings[a].position.set(t[0], t[1], t[2]).addScaledVector(n, 0.16)
    rings[a].quaternion.setFromUnitVectors(bandAxis, n)
  })
  document.querySelectorAll<HTMLElement>('[data-coiffure]').forEach(b => b.classList.toggle('sel', b.dataset.coiffure === recette.id))
}
/** Où est une attache à l'écran. */
function tieScreen(a = Math.max(0, step().a)) {
  const p = new THREE.Vector3(...TIES[a]).addScaledVector(outward(a), 0.1)
  const w = hairGroup.localToWorld(p).project(camera)
  const r = renderer.domElement.getBoundingClientRect()
  return { x: r.left + (w.x + 1) / 2 * r.width, y: r.top + (1 - w.y) / 2 * r.height, front: w.z < 1 }
}
/** Attache une mèche : un peu écartée du centre de son attache (une queue qui a du volume). */
function tieGuide(g: number, delay: number) {
  const h = hair!, a = sides[g], t = new THREE.Vector3(...TIES[a]), n = outward(a)
  const off = new THREE.Vector3(...h.root(g)).sub(t)
  off.addScaledVector(n, -off.dot(n))
  if (off.lengthSq() < 1e-8) off.set(1, 0, 0)
  off.setLength(0.045)
  h.tie(g, [t.x + off.x, t.y + off.y, t.z + off.z], delay)
}
/** Toutes les mèches d'un côté ont rejoint leur attache. */
function arrived(a: number) {
  const h = hair!
  for (let g = 0; g < h.G; g++) if (sides[g] === a && (h.tieIdx[g] < 0 || h.tieT[g] < 1)) return false
  return true
}
function fete() {
  const box = document.getElementById('fete')!
  box.innerHTML = Array.from({ length: 40 }, (_, i) => `<i style="left:${50 + (Math.random() - 0.5) * 40}%;background:${['#F06292', '#FFC81E', '#4FB8E7', '#41C26A', '#FFFFFF'][i % 5]};--dx:${(Math.random() - 0.5) * 600}px;--dy:${-200 - Math.random() * 380}px;animation-delay:${Math.random() * 0.2}s"></i>`).join('')
}
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
  const T0 = performance.now(), tm: string[] = []
  const mark = (n: string) => tm.push(`${n} ${(performance.now() - T0).toFixed(0)}`)
  const gltf = await loader.loadAsync(TETES[tete])
  mark('modèle')
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
  mark('préparation')
  const skin: THREE.Mesh[] = [], headCopy: THREE.Mesh[] = [], scalpWorld: number[] = []
  vrm.scene.traverse(o => {
    const m = o as THREE.SkinnedMesh
    if (!m.isMesh || !m.visible) return
    skin.push(m)
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
    }
    if (tri.length) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3))
      headCopy.push(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })))
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
  mark('crâne')
  const init = scalp({ skull, count: 300, length: 3.6, seed: 5 })
  const ray = new THREE.Raycaster()
  for (const r of init.roots) {
    const d = new THREE.Vector3(...r).normalize()
    ray.set(C.clone().addScaledVector(d, R * 3), d.clone().negate())
    const hit = ray.intersectObjects(headCopy, false).find(h => h.point.distanceTo(C) < R * 1.6)
    if (hit) { const p = u(hit.point); r[0] = p[0]; r[1] = p[1]; r[2] = p[2] }
  }
  mark('racines')
  hair = new Hair(init, 14)
  hair.headColliders = [skull, faceGuard(skull), neck, torso]
  hair.setHead(yaw, 0, true)
  hair.bake(5)
  brushed = new Uint8Array(hair.G)
  looks = new Float32Array(hair.G)
  mark('chute')
  view = hairView(THREE, hair, { width: 0.05, child: 12 })
  ;(window as unknown as { __temps: string[] }).__temps = tm
  hairGroup.scale.setScalar(R)
  hairGroup.add(view.mesh)
  // la calotte sur le VRAI cuir chevelu du modèle (en unités de tête)
  const scalpTris = new Float32Array(scalpWorld.length)
  for (let k = 0; k < scalpWorld.length; k += 3) {
    scalpTris[k] = (scalpWorld[k] - C.x) / R; scalpTris[k + 1] = (scalpWorld[k + 1] - C.y) / R; scalpTris[k + 2] = (scalpWorld[k + 2] - C.z) / R
  }
  cap = hairCap(THREE, skull, onScalp, scalpTris.length ? { tris: scalpTris, lift: 0.025 } : undefined)
  hairGroup.add(cap.mesh)
  cap.setLight(-0.35, 0.8, 0.5)
  view.setColor(TEINTES[1])
  cap.setColor(TEINTES[1])
  paintScalp(TEINTES[1])
  initial = { pos: hair.pos.slice(), rest: hair.rest.slice(), dir: hair.dirL.slice() }
  rings.forEach(r => hairGroup.add(r))
  bands.forEach(b => { b.visible = false; hairGroup.add(b) })
  buildRaieHint()
  hairGroup.add(raieHint)
  setupRecette()
  setStep(0)
  aimCamera()
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
    get yaw() { return yaw },
    get etape() { return etape },
    setYaw(v: number) { yaw = v; vYaw = 0 },
    get h() { return hair },
    get recette() { return recette.id },
    debugTail() {
      const h = hair!, out: string[] = []
      out.push('colliders ' + h.headColliders.map(e => `c=${e.c.map(v => v.toFixed(2))} r=${e.r.map(v => v.toFixed(2))}`).join(' | '))
      for (const g of [0, 1].map(a => { for (let k = 0; k < h.G; k++) if (sides[k] === a && h.tieIdx[k] >= 0) return k; return -1 })) {
        if (g < 0) continue
        out.push(`g${g} side${sides[g]} j=${h.tieIdx[g]} asleep=${h.asleep[g]} shape=${h.shape[g]} pts ` + [h.tieIdx[g], h.tieIdx[g] + 2, h.P - 1].map(i => h.point(g, i).map(v => v.toFixed(2)).join(',')).join(' | '))
      }
      return out.join('\n')
    },
    get lastRaie() { return lastRaie },
    get turning() { return yawGoal !== null || Math.abs(camEl - (etape === 'raie' ? 1 : 0)) > 0.02 },
    raieScreen() {
      const pr = (d: V3) => { const qq = cap!.surface(d); const w = hairGroup.localToWorld(new THREE.Vector3(...qq)).project(camera); const r = renderer.domElement.getBoundingClientRect(); return { x: r.left + (w.x + 1) / 2 * r.width, y: r.top + (1 - w.y) / 2 * r.height } }
      return [pr([0, 0.55, 0.83]), pr([0, 0.95, 0.1]), pr([0, 0.7, -0.7])]
    },
    poignee(g0: number) {
      setEtape('rassembler')
      const r0 = hair!.root(g0); let k = 0
      for (let g = 0; g < hair!.G; g++) { const r = hair!.root(g); if (Math.hypot(r[0] - r0[0], r[1] - r0[1], r[2] - r0[2]) < 0.6) tieGuide(g, Math.min(0.35, (k++) * 0.006)) }
    },
    queueFinie() {
      if (recette.steps.some(s => s.k === 'raie')) { partGoal = 1 }
      for (let g = 0; g < hair!.G; g++) tieGuide(g, (g % 20) * 0.01)
      bands.forEach((b, a) => { b.visible = a < TIES.length })
      setEtape('fini')
    },
    tieScreen,
    tied() { return Array.from(hair!.tieIdx).filter(j => j >= 0).length / hair!.G },
    brushed() { return brushed.reduce((a, b) => a + b, 0) / hair!.G },
    untied() { const out: number[] = [], st = step(); for (let g = 0; g < hair!.G; g++) if (hair!.tieIdx[g] < 0 && (st.k === 'rassembler' ? sides[g] === st.a : isBack(g))) out.push(g); return out }
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
interface Grab { id: number; kind: 'main' | 'brosse' | 'tourner' | 'raie'; t: number; held: { idx: number; g: number; off: V3 }[]; x: number; y: number; last: V3 | null; path?: V3[] }
let grab: Grab | null = null
const at = (o: V3, d: V3, t: number): V3 => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t]
const cv = renderer.domElement
cv.style.touchAction = 'none'
/** Le point de la calotte sous le doigt (repère de la tête), ou rien. */
const capCaster = new THREE.Raycaster()
function capPoint(e: { clientX: number; clientY: number }): V3 | null {
  const r = renderer.domElement.getBoundingClientRect()
  capCaster.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera)
  const hit = cap ? capCaster.intersectObject(cap.mesh, false)[0] : null
  if (!hit) return null
  const p = hairGroup.worldToLocal(hit.point.clone())
  return [p.x, p.y, p.z]
}
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
  yawGoal = null
  const [o, d] = simRay(e)
  // la raie : un trait sur le dessus de la tête, n'importe où le doigt commence
  if (etape === 'raie') {
    const p = capPoint(e)
    if (p) { grab = { id: e.pointerId, kind: 'raie', t: 0, held: [], x: e.clientX, y: e.clientY, last: null, path: [p] }; return }
  }
  // le doigt prend ce qu'il touche VRAIMENT (le père, 23/11) : des cheveux
  // sous le doigt → on les attrape (même tout en bas du dos) ; le corps
  // devant les cheveux, ou le vide → le buste tourne
  const under = hair.pick(o, d, 0.12, 0.7, 2)
  const hairT = under.length ? Math.min(...under.map(h => h.t)) * R : Infinity
  const body = bodyRay(e)
  const onHair = under.length > 0 && !(body < hairT - R * 0.05)
  // (pendant un rassemblement : seulement les mèches de ce côté-là)
  const hits = onHair ? hair.pick(o, d, mode === 'main' ? 0.32 : 0.45, 0.7, 3).filter(h => hair!.tieIdx[h.g] < 0 && (etape !== 'rassembler' || sides[h.g] === step().a)) : []
  if (!hits.length || etape === 'fini' || etape === 'elastique' || etape === 'raie') { grab = { id: e.pointerId, kind: 'tourner', t: 0, held: [], x: e.clientX, y: e.clientY, last: null }; return }
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
  if (grab.kind === 'raie') {
    const p = capPoint(e)
    if (p) grab.path!.push(p)
    return
  }
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
    // une brosse large : un coup couvre une bande de cheveux, et les mèches
    // voisines du dessous comptent aussi (un enfant ne brosse pas mèche à mèche)
    const ml = Math.hypot(m[0], m[1], m[2])
    if (ml > 1e-4) brushDir.lerp(new THREE.Vector3(m[0] / ml, m[1] / ml, m[2] / ml), 0.35).normalize()
    for (const g of hair.comb(o, d, 0.6, m, 0.6)) {
      brushedNow.add(g)
      const r = hair.root(g)
      for (let k = 0; k < hair.G; k++) if (!brushed[k]) { const q = hair.root(k); if (Math.hypot(q[0] - r[0], q[1] - r[1], q[2] - r[2]) < 0.35) brushed[k] = 1 }
      brushed[g] = 1
    }
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
  const g0 = grab
  for (const h of g0.held) { hair.pin(h.idx, null); hair.shape[h.g] = 1 }
  grab = null
  if (g0.kind === 'brosse') {
    // les mèches brossées gardent leur nouvelle forme
    hair.keepPose(brushedNow); brushedNow.clear()
    let n = 0, all = 0
    for (let g = 0; g < hair.G; g++) if (isBack(g)) { all++; n += brushed[g] }
    if (n >= all * 0.6) { brushed.fill(1); setTimeout(() => { if (etape === 'brosser') next() }, 500) }
  }
  if (g0.kind === 'raie') {
    // un trait assez long, d'avant en arrière, près du milieu de la tête
    const path = g0.path!
    const zs = path.map(p => p[2]), mid = path.filter(p => Math.abs(p[0]) < 0.4 && p[1] > -0.2).length
    lastRaie = { span: Math.max(...zs) - Math.min(...zs), mid: mid / path.length, n: path.length }
    if (lastRaie.span > 0.8 && lastRaie.mid >= 0.6) doPart()
  }
  if (g0.kind === 'main' && etape === 'rassembler') {
    const a = step().a, t = tieScreen(a)
    if (Math.hypot(e.clientX - t.x, e.clientY - t.y) < 120) {
      // dans le rond : les mèches tenues, et leurs voisines (de ce côté), s'y attachent
      const held = new Set(g0.held.map(h => h.g))
      let k = 0
      for (let g = 0; g < hair.G; g++) {
        if (hair.tieIdx[g] >= 0 || sides[g] !== a) continue
        const r = hair.root(g)
        const near = held.has(g) || [...held].some(h => { const q = hair!.root(h); return Math.hypot(q[0] - r[0], q[1] - r[1], q[2] - r[2]) < 0.6 })
        if (near) tieGuide(g, Math.min(0.35, (k++) * 0.006))
      }
      // presque tout est rassemblé : le reste suit tout seul
      let mine = 0, done = 0
      for (let g = 0; g < hair.G; g++) if (sides[g] === a) { mine++; if (hair.tieIdx[g] >= 0) done++ }
      if (done >= mine * 0.75) {
        const left: number[] = []
        for (let g = 0; g < hair.G; g++) if (hair.tieIdx[g] < 0 && sides[g] === a) left.push(g)
        left.forEach((g, i) => tieGuide(g, 0.15 + i / left.length * 0.5))
      }
    }
  }
}
cv.addEventListener('pointerup', up)
cv.addEventListener('pointercancel', up)

/* ---- Les boutons ---- */
document.getElementById('recommencer')!.onclick = () => recommencer()
document.querySelectorAll<HTMLButtonElement>('[data-coiffure]').forEach(b => b.onclick = () => {
  recette = RECETTES.find(r => r.id === b.dataset.coiffure) ?? RECETTES[0]
  if (hair) recommencer()
})
{
  const tray = document.getElementById('elastique')!, fly = document.getElementById('vol')!
  let id = -1
  tray.addEventListener('pointerdown', e => { id = e.pointerId; tray.setPointerCapture(id); fly.hidden = false; flyTo(e) })
  const flyTo = (e: PointerEvent) => { fly.style.left = e.clientX + 'px'; fly.style.top = e.clientY + 'px' }
  tray.addEventListener('pointermove', e => { if (e.pointerId === id) flyTo(e) })
  const drop = (e: PointerEvent) => {
    if (e.pointerId !== id) return
    id = -1; fly.hidden = true
    if (etape !== 'elastique') return
    const a = step().a, t = tieScreen(a)
    if (Math.hypot(e.clientX - t.x, e.clientY - t.y) < 130) { bands[a].visible = true; bandPop[a] = 1; next() }
  }
  tray.addEventListener('pointerup', drop); tray.addEventListener('pointercancel', drop)
}
document.querySelectorAll<HTMLButtonElement>('[data-teinte]').forEach((b, i) => {
  b.style.background = TEINTES[i]
  b.onclick = () => { view?.setColor(TEINTES[i]); cap?.setColor(TEINTES[i]); paintScalp(TEINTES[i]); document.querySelectorAll('[data-teinte]').forEach(x => x.classList.toggle('sel', x === b)) }
})

/* ---- La brosse (24/11 : « elle est où la brosse ? ») ----
   Une vraie brosse en 3D : elle attend à côté de la tête pendant l'étape
   « brosser », vient sous le doigt dès qu'on touche les cheveux, et glisse
   sur la chevelure, les poils contre les cheveux, le manche qui suit le geste. */
function makeBrush() {
  const g = new THREE.Group()
  const pink = new THREE.MeshStandardMaterial({ color: '#D23A6E', roughness: 0.35, metalness: 0.05 })
  const cushion = new THREE.MeshStandardMaterial({ color: '#2E2A33', roughness: 0.8 })
  const pin = new THREE.MeshStandardMaterial({ color: '#F4EDE6', roughness: 0.4 })
  // le dos : une palette ovale (les poils vers −y, le manche vers +x)
  const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.26, 8, 24), pink)
  back.rotation.z = Math.PI / 2; back.scale.set(1, 1, 0.32); back.position.y = 0.05
  const bed = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.24, 8, 24), cushion)
  bed.rotation.z = Math.PI / 2; bed.scale.set(1, 1, 0.22); bed.position.y = 0.0
  g.add(back, bed)
  // les poils : de fines tiges à bout rond
  const stem = new THREE.CylinderGeometry(0.008, 0.008, 0.08, 6), tip = new THREE.SphereGeometry(0.016, 8, 6)
  const pts: [number, number][] = []
  for (let x = -0.26; x <= 0.261; x += 0.065) for (let z = -0.1; z <= 0.101; z += 0.05) if ((x / 0.32) ** 2 + (z / 0.13) ** 2 < 1) pts.push([x, z])
  const stems = new THREE.InstancedMesh(stem, pin, pts.length), tips = new THREE.InstancedMesh(tip, pin, pts.length)
  const m4 = new THREE.Matrix4()
  pts.forEach(([x, z], i) => { stems.setMatrixAt(i, m4.makeTranslation(x, -0.06, z)); tips.setMatrixAt(i, m4.makeTranslation(x, -0.1, z)) })
  g.add(stems, tips)
  // le manche
  const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.42, 8, 16), pink)
  handle.rotation.z = Math.PI / 2 - 0.12; handle.position.set(0.58, 0.08, 0)
  g.add(handle)
  g.traverse(o => { (o as THREE.Mesh).castShadow = false })
  return g
}
const brush = makeBrush()
brush.visible = false
scene.add(brush)
const brushDir = new THREE.Vector3(0, 1, 0)
let brushOn = 0
/** La pose de la brosse à chaque image. */
function placeBrush(dt: number, now: number) {
  const show = etape === 'brosser'
  brush.visible = show && R > 0
  if (!brush.visible) return
  brush.scale.setScalar(R * 1.05)
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion()
  if (grab && grab.kind === 'brosse' && grab.last) {
    // sous le doigt : posée sur la chevelure, les poils vers la tête
    const p = new THREE.Vector3(...grab.last), n = p.clone().normalize()
    pos.copy(p).addScaledVector(n, 0.19)
    // le manche traîne derrière le geste
    const h = brushDir.clone().negate()
    h.addScaledVector(n, -h.dot(n))
    if (h.lengthSq() < 1e-6) h.set(0, 1, 0).addScaledVector(n, -n.y)
    h.normalize()
    const basis = new THREE.Matrix4().makeBasis(h, n, new THREE.Vector3().crossVectors(h, n))
    quat.setFromRotationMatrix(basis)
    hairGroup.localToWorld(pos)
    const gq = new THREE.Quaternion(); hairGroup.getWorldQuaternion(gq)
    quat.premultiply(gq)
    brushOn = Math.min(1, brushOn + dt * 8)
  } else {
    // elle attend à côté de la tête, et respire un peu pour qu'on la voie
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
    pos.copy(C).addScaledVector(right, R * 2.15).addScaledVector(up, -R * 0.2 + Math.sin(now / 400) * R * 0.08)
    quat.setFromEuler(new THREE.Euler(0.5, -0.3, 0.9 + Math.sin(now / 700) * 0.08))
    const cq = new THREE.Quaternion(); camera.getWorldQuaternion(cq)
    quat.premultiply(cq)
    brushOn = Math.max(0, brushOn - dt * 4)
  }
  const k = Math.min(1, dt * 18)
  brush.position.lerp(pos, k)
  brush.quaternion.slerp(quat, k)
}
/** Le cadrage : la tête et les épaules ; plus haut pour la raie (le dessus de la tête). */
function aimCamera() {
  const k = camEl * camEl * (3 - 2 * camEl), el = 0.85 * k, dist = R * 12
  camera.position.set(C.x, C.y - R * 0.3 * (1 - k) + Math.sin(el) * dist, C.z + Math.cos(el) * dist)
  camera.lookAt(C.x, C.y - R * 1.15 * (1 - k) + R * 0.2 * k, C.z)
}
/* ---- La boucle ---- */
const fpsEl = document.getElementById('fps')!
let last = performance.now(), frames = 0, acc = 0
function loop(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (!grab || grab.kind !== 'tourner') { yaw += vYaw * dt; vYaw *= Math.pow(0.04, dt) }
  // la tête se tourne d'elle-même vers ce qu'il faut coiffer (un doigt l'arrête)
  if (yawGoal !== null && !grab) {
    const dYaw = Math.atan2(Math.sin(yawGoal - yaw), Math.cos(yawGoal - yaw))
    yaw += dYaw * Math.min(1, dt * 3.5); vYaw = 0
    if (Math.abs(dYaw) < 0.01) yawGoal = null
  }
  // pour la raie, on regarde le dessus de la tête
  camEl += ((etape === 'raie' ? 1 : 0) - camEl) * Math.min(1, dt * 3)
  aimCamera()
  pivot.rotation.y = yaw
  model?.update(dt)
  if (hair && view) {
    hair.setHead(yaw, 0)
    const t0 = performance.now()
    hair.advance(dt)
    const t1 = performance.now()
    glowNow()
    if (etape === 'rassembler' && arrived(step().a)) next()
    rings.forEach(r => r.scale.setScalar(1 + Math.sin(now / 220) * 0.06))
    raieHint.scale.setScalar(1)
    ;(raieHint.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(now / 220)
    partV += (partGoal - partV) * Math.min(1, dt * 4)
    cap?.setPart(partV)
    if (cap) {
      // pendant le rassemblement, les cheveux restent des fils (on les voit
      // tirés vers l'élastique) ; quand tout est rassemblé, la chevelure se
      // lisse d'un seul fondu (le 24/11 : une plaque lisse au milieu des
      // cheveux libres, ou des mèches qui disparaissaient d'un coup)
      // (chaque attache pour son côté)
      for (let a = 0; a < TIES.length; a++) pulledA[a] = arrived(a) ? Math.min(1, pulledA[a] + dt / 0.7) : Math.max(0, pulledA[a] - dt / 0.3)
      for (let g = 0; g < hair.G; g++) { const v = pulledA[sides[g]]; looks[g] = v * v * (3 - 2 * v) }
      view.look = looks
      cap.setTieField(hair.rootL, looks)
    }
    bands.forEach((b, a) => { if (b.visible) placeBand(a, dt) })
    placeBrush(dt, now)
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
