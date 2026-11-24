/* @version 2026-11-25 00:20 */
import type * as THREE from 'three'
import { Hair, faceGuard, onScalp, scalp, type Ellipsoid, type V3 } from './hair'
import { hairCap, hairView } from './hair3d'
import { CRANS, braidView } from './braid3d'
import { Spinner, coast } from './touchcam'
import { loadBust } from './bust3d'
import { reflets, salonObjets } from './salonobj3d'
import { RECETTES, type Coiffure, type Kind, type Step } from './salon'
import type { Stage } from './three3d'

/* Le Salon de coiffure — la scène et les gestes (23 au 25/11).

   Un buste (`bust3d.ts`), des cheveux de FILS (`hair.ts` la physique,
   `hair3d.ts` le rendu et la calotte, `braid3d.ts` la tresse), et le doigt,
   qui prend ce qu'il touche (le père, 23/11) : des cheveux → il les brosse
   ou en prend une poignée, qui seule bouge ; le corps ou le vide → le buste
   tourne. Le pas à pas vient des RECETTES (`salon.ts`). Ni bouton ni carte
   ici : le jeu (`games/coiffure.ts`) écoute `onStep` et `sound`.

   Tout est dans le repère de la tête (rayon 1) : `hairGroup`, à l'échelle. */

/** Ce qui s'entend : la brosse, une mèche prise, posée, lâchée, la raie, un cran de tresse, le nœud. */
export type Bruit = 'brosse' | 'lisse' | 'prise' | 'pose' | 'lache' | 'raie' | 'cran' | 'noeud'

export interface SalonOpts {
  stage: Stage
  /** Le modèle : son adresse, ou ses octets. */
  src: string | ArrayBuffer
  /** Plus tard (un timer de partie). */
  after(ms: number, fn: () => void): void
  /** Une étape commence. `n` : le nombre d'étapes à faire ; `quiet` : reposée toute faite (pas de fête). */
  onStep(i: number, st: Step, n: number, quiet: boolean): void
  sound(b: Bruit, n?: number): void
}

export type Salon = Awaited<ReturnType<typeof createSalon>>

export async function createSalon(o: SalonOpts) {
  const { stage } = o, THREE = stage.T, { renderer, scene, camera } = stage
  const bust = await loadBust(THREE, o.src)
  camera.fov = 28; camera.near = 0.05; camera.far = 20
  camera.updateProjectionMatrix()
  const sun = new THREE.DirectionalLight('#FFF1E0', 2.4), fill = new THREE.DirectionalLight('#FFE6F0', 0.7)
  scene.add(sun, fill)
  /** Le doigt ne fait plus rien (la fin). */
  let figee = false

  let cap: ReturnType<typeof hairCap> | null = null
  let looks = new Float32Array(0)
  /** À quel point la calotte est peignée vers l'attache, mèche par mèche. */
  let sens: Float32Array<ArrayBufferLike> = new Float32Array(0)

  let recette = RECETTES[0]
  let stepI = 0
  const step = () => recette.steps[stepI]
  let etape: Kind = 'libre'
  let initial: { pos: Float32Array; rest: Float32Array; dir: Float32Array } | null = null
  /** Les attaches (repère de la tête), posées juste au-dessus de la calotte. */
  let TIES: V3[] = []
  let sides = new Int8Array(0)
  const envRT = stage.keep(await reflets(THREE, renderer)), env = envRT.texture
  const { brosse, elastique } = salonObjets(THREE)
  const rings: THREE.Mesh[] = [], bands: THREE.Object3D[] = []
  for (let k = 0; k < 2; k++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 12, 48), new THREE.MeshBasicMaterial({ color: '#FFC83D', transparent: true, opacity: 0.85, depthTest: false }))
    r.renderOrder = 10
    rings.push(r)
    bands.push(k ? elastique(env, '#4AA8F0', '#2464A8') : elastique(env))
  }
  const bandSet = [false, false], bandPop = [0, 0], pulledA = [0, 0]
  let lastRaie = { span: 0, mid: 0, n: 0 }
  let yawGoal: number | null = null, yawV = 0, camEl = 0
  /** La raie : d'où à où elle est ouverte (l'angle dans le plan du milieu : 0 le
      sommet, + le front, − l'arrière) ; `done` : le trait est fini, elle s'achève seule. */
  const FRONT = 1.4, NUQUE = -2.8
  const raie = { lo: 9, hi: -9, done: false, since: 0, open: new Map<number, { from: V3; to: V3; t: number }>() }
  const milieu = (p: V3) => Math.atan2(p[2], p[1])
  const isBack = (g: number) => hair!.rootL[g * 3 + 2] < 0.35
  const outward = (a: number) => new THREE.Vector3(...TIES[a]).normalize()

  function setStep(i: number, quiet = false) {
    stepI = i
    const st = step()
    etape = st.k
    rings.forEach((r, k) => { r.visible = st.k === 'rassembler' && st.a === k })
    raieHint.visible = st.k === 'raie'
    // la tête se tourne d'elle-même vers ce qu'il faut coiffer
    // (seulement si on ne le voit pas déjà : elle ne bouge pas sans raison)
    const goal = st.k === 'brosser' ? Math.PI : st.k === 'raie' ? 0 : st.a >= 0 ? Math.atan2(-TIES[st.a][0], TIES[st.a][2]) : null
    yawGoal = goal !== null && Math.abs(turnTo(goal)) > (recette.dirs.length > 1 ? 0.3 : 0.7) ? goal : null
    if (st.k === 'tresser') { braid!.mesh.visible = true; Object.assign(tresse, NEUVE) }
    o.onStep(i, st, recette.steps.length - 1, quiet)
  }
  /** L'écart (−π..π) jusqu'à un lacet. */
  const turnTo = (goal: number) => Math.atan2(Math.sin(goal - spin.rot), Math.cos(goal - spin.rot))
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
      if (j < 1 || h.held[g] || sides[g] !== a) continue
      const p0 = h.point(g, j - 1), p1 = h.point(g, j)
      c.x += p0[0] + (p1[0] - p0[0]) * 0.35; c.y += p0[1] + (p1[1] - p0[1]) * 0.35; c.z += p0[2] + (p1[2] - p0[2]) * 0.35
      d.x += p1[0] - p0[0]; d.y += p1[1] - p0[1]; d.z += p1[2] - p0[2]
      n++
    }
    if (!n) return
    c.divideScalar(n); d.normalize()
    band.position.copy(c)
    // (l'anneau perpendiculaire au flux, son haut vers le haut : le nœud)
    const upv = new THREE.Vector3(0, 1, 0).addScaledVector(d, -d.y).normalize()
    band.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(upv, d), upv, d))
    if (bandPop[a] > 0) {
      bandPop[a] = Math.max(0, bandPop[a] - dt * 2.5)
      band.scale.setScalar(1 + bandPop[a] * 1.2)
      band.rotateZ(bandPop[a] * 6)
    }
  }
  /** Une mèche est brossée quand la brosse y est descendue d'autant (rayons de tête). */
  const BRUSHED = 0.9
  let brushAmt = new Float32Array(0)
  /** La lueur : les mèches à prendre maintenant. */
  function glowNow() {
    const h = hair!, gl = view!.glow, st = step()
    for (let g = 0; g < h.G; g++) gl[g] = etape === 'brosser' ? (isBack(g) ? 1 - Math.min(1, brushAmt[g] / BRUSHED) : 0) : etape === 'rassembler' ? (h.tieIdx[g] < 0 && sides[g] === st.a ? 1 : 0) : 0
  }
  /** Le sens de pousse d'une mèche, une fois la raie ouverte (rien : elle ne bouge pas). */
  function partDir(g: number): V3 | null {
    const h = hair!, k = g * 3, x = h.rootL[k], y = h.rootL[k + 1], z = h.rootL[k + 2]
    if (Math.abs(x) > 0.5 || y < -0.5) return null
    const l = Math.hypot(x, y, z) || 1, n = [x / l, y / l, z / l]
    let d = [Math.sign(x || 1), -0.35, -0.25]
    const dn = d[0] * n[0] + d[1] * n[1] + d[2] * n[2]
    d = [d[0] - n[0] * dn + n[0] * 0.1, d[1] - n[1] * dn + n[1] * 0.1, d[2] - n[2] * dn + n[2] * 0.1]
    const dl = Math.hypot(d[0], d[1], d[2]) || 1
    return [d[0] / dl, d[1] / dl, d[2] / dl]
  }
  /** Chaque image : la raie s'ouvre là où le doigt est passé, mèche par mèche
      (d'un bloc, à la fin du trait, toute la chevelure sautait). */
  function moveRaie(dt: number) {
    const h = hair!
    if (raie.done) { raie.lo = Math.max(NUQUE, raie.lo - dt * 4); raie.hi = Math.min(FRONT, raie.hi + dt * 4) }
    cap!.setPart(raie.hi > raie.lo ? 1 : 0, raie.lo, raie.hi)
    if (raie.hi > raie.lo && etape === 'raie') for (let g = 0; g < h.G; g++) {
      if (raie.open.has(g)) continue
      const a = milieu(h.root(g))
      if (a < raie.lo || a > raie.hi) continue
      const to = partDir(g)
      if (to) { raie.open.set(g, { from: [h.dirL[g * 3], h.dirL[g * 3 + 1], h.dirL[g * 3 + 2]], to, t: 0 }); h.shape[g] = 0.15 }
    }
    for (const [g, o] of raie.open) {
      if (o.t >= 1) continue
      o.t = Math.min(1, o.t + dt / 0.45)
      const u = o.t * o.t * (3 - 2 * o.t)
      h.setDir(g, o.from[0] + (o.to[0] - o.from[0]) * u, o.from[1] + (o.to[1] - o.from[1]) * u, o.from[2] + (o.to[2] - o.from[2]) * u)
      raie.since = 0
    }
    // ouverte jusqu'au bout, un instant pour retomber, puis elle garde sa pose
    if (raie.done && etape === 'raie' && raie.lo <= NUQUE && raie.hi >= FRONT && (raie.since += dt) > 1) {
      const moved = [...raie.open.keys()]
      h.keepPose(moved)
      for (const g of moved) h.shape[g] = 1
      next()
    }
    // la ligne à suivre s'efface derrière le doigt
    if (raieHint.visible) {
      let k = 0
      if (raie.hi > 0.4) while (k < HINT && hintAngle(k / HINT) > raie.lo) k++
      raieHint.geometry.setDrawRange(k * 48, Infinity)
    }
  }
  /** La ligne à tracer pour la raie : du front vers l'arrière, sur la calotte. */
  const raieHint = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: '#FFC83D', transparent: true, opacity: 0.9, depthTest: true }))
  const HINT = 60
  const hintPoint = (u: number): V3 => { const a = 0.98 - u * 2.3; return [0, Math.cos(a) * 0.9 + 0.1, Math.sin(a)] }
  const hintAngle = (u: number) => milieu(hintPoint(u))
  function buildRaieHint() {
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= 24; k++) {
      const q = cap!.surface(hintPoint(k / 24)) // du front (devant, en haut) vers la nuque
      const l = Math.hypot(...q)
      pts.push(new THREE.Vector3(q[0] / l * (l + 0.04), q[1] / l * (l + 0.04), q[2] / l * (l + 0.04)))
    }
    raieHint.geometry.dispose()
    raieHint.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), HINT, 0.022, 8, false)
  }
  /** Cheveux lâchés, tels qu'au début. */
  function lacher() {
    const h = hair!
    h.restore(initial!)
    brushAmt.fill(0)
    raie.lo = 9; raie.hi = -9; raie.done = false; raie.since = 0; raie.open.clear()
    pulledA.fill(0)
    bands.forEach(b => { b.visible = false })
    bandSet.fill(false)
    bands.forEach(b => { b.scale.setScalar(1); droit(b) })
    setupRecette()
    sansTresse()
  }
  /** Ce qui se passe pendant qu'on tresse : prête (les mèches se sont écartées),
      le cran qui s'achève tout seul (1) ou qui se défait (0), la mèche tenue. */
  const NEUVE = { t: 0, ready: false, fade: 0, goal: -1, x0: 1, off: 0, done: 0 }
  const tresse = { ...NEUVE }
  function sansTresse() {
    braid!.mesh.visible = false
    braid!.state.show = 0
    view!.setBraid(0)
    Object.assign(tresse, NEUVE)
  }
  /** Chaque image : la mèche suit le doigt, le cran s'achève, les mèches s'écartent. */
  function moveBraid(dt: number) {
    const b = braid!, st = b.state
    if (etape === 'tresser') {
      tresse.t += dt
      // (la queue finit d'abord de retomber ; puis elle se partage en trois)
      if (!tresse.ready) { if (tresse.t < 0.7) return; b.reset(); tresse.ready = true }
      // (elle apparaît DANS la queue, puis la queue s'efface : les deux en fondu
      // ensemble faisaient un fantôme)
      if (st.show < 1) st.show = Math.min(1, st.show + dt / 0.15)
      else {
        tresse.fade = Math.min(1, tresse.fade + dt / 0.3)
        view!.setBraid(tresse.fade)
        st.born = Math.min(1, st.born + dt / 0.45)
        if (tresse.fade > 0.6) st.spread = Math.min(1, st.spread + (1.02 - st.spread) * Math.min(1, dt * 3.5))
      }
      const held = grab?.kind === 'brin'
      if (held) {
        const p = b.touch(...grab!.ray!), side = b.next().side
        tresse.off *= Math.exp(-dt * 9)
        // (au bout de sa longueur, elle tend vers le doigt sans l'atteindre)
        // (et passée devant le milieu, elle y reste : le doigt peut continuer)
        st.hs = Math.min(b.len - 0.1, Math.max(b.front + 0.3 + 0.3 * Math.min(1, b.len - b.front), p.s))
        const max = Math.min(0.8, (st.hs - b.front) * 0.6 + 0.06)
        st.hx = side * Math.max(-0.1, Math.min(Math.max(max, tresse.x0), (p.x + tresse.off) * side))
        st.hw = Math.min(1, st.hw + dt / 0.12)
        // passée devant le milieu : le cran est fait
        st.g = Math.min(1, Math.max(0, 1 - st.hx * side / tresse.x0))
      } else {
        st.hw = Math.max(0, st.hw - dt / 0.3)
        if (tresse.goal >= 0) {
          const d = dt / 0.25
          st.g = tresse.goal ? Math.min(1, st.g + d) : Math.max(0, st.g - d)
          if (st.g === tresse.goal) { if (tresse.goal) { st.n++; st.g = 0; o.sound('cran', st.n) } tresse.goal = -1 }
        }
        if (st.hw === 0) st.held = -1
      }
      const shine = !held && tresse.goal < 0 && st.n < CRANS && st.spread > 0.6
      if (shine && st.lit === 0) st.glow = b.next().k
      st.lit = shine && st.glow === b.next().k ? Math.min(1, st.lit + dt / 0.35) : Math.max(0, st.lit - dt / 0.12)
      if (st.n >= CRANS && st.hw === 0 && (tresse.done += dt) > 0.4) next()
    } else if (bands[0].visible) st.tied = Math.min(1, st.tied + dt / 0.3)
  }
  /** Le nœud d'un élastique, face aux cheveux qu'il serre. */
  function droit(b: THREE.Object3D) { const w = b.userData.bow as THREE.Object3D; w.rotation.x = 0; w.position.set(0, 0.118, 0.045) }
  /** L'élastique au bout de la tresse. */
  function placeBraidBand() {
    const e = braid!.end(), t = new THREE.Vector3(...e.t), d = new THREE.Vector3(...e.d), band = bands[0]
    band.position.set(...e.p)
    band.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(d, t), d, t))
    bandPop[0] = Math.max(0, bandPop[0])
    band.scale.setScalar(1 + bandPop[0] * 1.2)
    const bow = band.userData.bow as THREE.Object3D
    bow.rotation.x = -Math.PI / 2
    bow.position.set(0, 0.125, 0.02)
    if (bandPop[0] > 0) band.rotateZ(bandPop[0] * 6)
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
  }
  /** Où est une attache à l'écran. */
  function tieScreen(a = Math.max(0, step().a)) {
    // (celui d'une tresse se pose au bout)
    const p = recette.tresse && etape !== 'rassembler' && braid!.mesh.visible ? new THREE.Vector3(...braid!.end().p) : new THREE.Vector3(...TIES[a]).addScaledVector(outward(a), 0.1)
    const w = hairGroup.localToWorld(p).project(camera)
    const r = renderer.domElement.getBoundingClientRect()
    return { x: r.left + (w.x + 1) / 2 * r.width, y: r.top + (1 - w.y) / 2 * r.height, front: w.z < 1 }
  }
  /** Attache une mèche : un peu écartée du centre de son attache (une queue qui a du volume). */
  function tieGuide(g: number, delay: number, drop?: number) {
    const h = hair!, a = sides[g], t = new THREE.Vector3(...TIES[a]), n = outward(a)
    const off = new THREE.Vector3(...h.root(g)).sub(t)
    off.addScaledVector(n, -off.dot(n))
    if (off.lengthSq() < 1e-8) off.set(1, 0, 0)
    off.setLength(0.045)
    h.tie(g, [t.x + off.x, t.y + off.y, t.z + off.z], delay, drop ?? recette.drop)
  }
  /** Toutes les mèches d'un côté ont rejoint leur attache. */
  function arrived(a: number) {
    const h = hair!
    for (let g = 0; g < h.G; g++) if (sides[g] === a && (h.tieIdx[g] < 0 || h.held[g] || h.tieT[g] < 1)) return false
    return true
  }
  /** Le corps du modèle, figé (pour savoir si le doigt touche le corps ou les
      cheveux : sur le modèle animé, un toucher gelait l'image 150 ms). */
  const bodyGeo = new THREE.BufferGeometry()
  bodyGeo.setAttribute('position', new THREE.BufferAttribute(bust.skin, 3))
  const body = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  body.matrixAutoUpdate = false
  /** Ce sur quoi la main glisse (repère de la tête) : la tête, le cou, les épaules. */
  let handShapes: Ellipsoid[] = []
  const paintScalp = bust.paint
  let hair: Hair | null = null, view: ReturnType<typeof hairView> | null = null, braid: ReturnType<typeof braidView> | null = null
  const pivot = new THREE.Group()
  scene.add(pivot)
  const hairGroup = new THREE.Group()
  pivot.add(hairGroup)
  const C = new THREE.Vector3(), R = bust.R
  const spin = { rot: Math.PI, vRot: 0 }
  const spinner = new Spinner({ max: 5, perPx: () => 0.0075 })

  /* ---- Le doigt ---- */
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
  interface Grab { id: number; kind: 'main' | 'brosse' | 'tourner' | 'raie' | 'brin' | 'rien'; t: number; held: number[]; x: number; y: number; x0: number; y0: number; last: V3 | null; path?: V3[]; ray?: [V3, V3] }
  let grab: Grab | null = null
  let handPos: V3 = [0, 0, 0]
  const at = (o: V3, d: V3, t: number): V3 => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t]
  const cv = renderer.domElement, sound = o.sound
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
    pivot.updateWorldMatrix(true, false)
    body.matrixWorld.copy(pivot.matrixWorld)
    const hit = bodyCaster.intersectObject(body, false)[0]
    return hit ? hit.distance : Infinity
  }
  /** La profondeur de la main le long du rayon : elle glisse SUR la tête, le
      cou, le dos (grossis), par-dessus les cheveux ; à côté, dans le plan de la tête. */
  function handDepth(o: V3, d: V3) {
    let best = Infinity
    for (const e of handShapes) {
      const rx = e.r[0] + 0.28, ry = e.r[1] + 0.28, rz = e.r[2] + 0.28
      const ox = (o[0] - e.c[0]) / rx, oy = (o[1] - e.c[1]) / ry, oz = (o[2] - e.c[2]) / rz, dx = d[0] / rx, dy = d[1] / ry, dz = d[2] / rz
      const a = dx * dx + dy * dy + dz * dz, b = ox * dx + oy * dy + oz * dz, c = ox * ox + oy * oy + oz * oz - 1, q = b * b - a * c
      if (q > 0) best = Math.min(best, (-b - Math.sqrt(q)) / a)
    }
    return best < Infinity ? best : -(o[0] * d[0] + o[1] * d[1] + o[2] * d[2])
  }
  const down = (e: PointerEvent) => {
    if (!hair || grab || figee) return
    try { cv.setPointerCapture(e.pointerId) } catch { /* un doigt déjà levé */ }
    yawGoal = null
    spinner.start(spin)
    const [o, d] = simRay(e)
    const base = { id: e.pointerId, t: 0, held: [] as number[], x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, last: null }
    // la raie : un trait sur le dessus de la tête, n'importe où le doigt commence
    if (etape === 'raie') {
      const p = capPoint(e)
      if (p) { grab = { ...base, kind: 'raie', path: [] }; traceRaie(p); return }
    }
    // la tresse : la mèche qui brille, et elle seule ; les autres ne tournent pas le buste
    if (etape === 'tresser' && tresse.ready) {
      const near = braid!.near(o, d), b = braid!, st = b.state, want = b.next(), body = bodyRay(e) / R
      let touched = near.some(n => n[0] < 0.26 && n[2] < body + 0.4)
      for (let s = 0.1; s < b.front && !touched; s += 0.1) {
        const p = b.frame(s).p, v = [p[0] - o[0], p[1] - o[1], p[2] - o[2]], t = v[0] * d[0] + v[1] * d[1] + v[2] * d[2]
        touched = t < body + 0.4 && Math.hypot(v[0] - d[0] * t, v[1] - d[1] * t, v[2] - d[2] * t) < 0.32
      }
      const w = near[want.k]
      if (st.n < CRANS && tresse.goal < 0 && st.spread > 0.6 && w[0] < 0.3 && w[2] < body + 0.4) {
        const p = b.touch(o, d), f = b.frame(w[1]), q = b.point(want.k, w[1])
        const bx = (q[0] - f.p[0]) * f.x[0] + (q[1] - f.p[1]) * f.x[1] + (q[2] - f.p[2]) * f.x[2]
        tresse.x0 = Math.max(0.15, Math.abs(bx)); tresse.off = bx - p.x
        st.held = want.k; st.hx = bx; st.hs = Math.max(b.front + 0.3, w[1]); st.hw = 0
        grab = { ...base, kind: 'brin', ray: [o, d] }
        sound('prise')
        return
      }
      if (touched) { grab = { ...base, kind: 'rien' }; return }
    }
    // le doigt prend ce qu'il touche VRAIMENT (le père, 23/11) : des cheveux
    // sous le doigt → on les attrape (même tout en bas du dos) ; le corps
    // devant les cheveux, ou le vide → le buste tourne
    const free = (g: number) => hair!.tieIdx[g] < 0 && (etape !== 'rassembler' || sides[g] === step().a)
    // (la calotte, ce sont des cheveux aussi : sans elle, le doigt posé sur une
    // chevelure déjà tirée traversait la tête jusqu'aux mèches de devant, et le
    // buste tournait)
    const coiffe = etape === 'brosser' || etape === 'rassembler', under = coiffe ? hair.pick(o, d, 0.14, 0.7) : []
    let tHair = Infinity
    for (const h of under) tHair = Math.min(tHair, h.t)
    const tBody = coiffe ? bodyRay(e) / R : 0
    if (coiffe && !(tHair - 0.05 <= tBody && tHair < Infinity)) { const p = capPoint(e); if (p) tHair = Math.min(tHair, Math.hypot(p[0] - o[0], p[1] - o[1], p[2] - o[2])) }
    const onHair = tHair < Infinity && tHair - 0.05 <= tBody
    if (etape === 'brosser' && onHair) {
      grab = { ...base, kind: 'brosse', t: tHair }
      grab.last = at(o, d, grab.t)
      sound('brosse')
      return
    }
    if (etape === 'rassembler' && onHair) {
      // une POIGNÉE : toute l'épaisseur des cheveux sous la main (plus large
      // quand il n'en reste presque plus) ; elle seule bougera
      let left = 0, mine = 0
      for (let g = 0; g < hair.G; g++) if (sides[g] === step().a) { mine++; if (free(g)) left++ }
      let hits = hair.pick(o, d, left < mine * 0.2 ? 0.8 : 0.36, 9).filter(h => free(h.g))
      // (posé sur des cheveux déjà rassemblés : il prend les plus proches qui restent)
      if (!hits.length) hits = hair.pick(o, d, 0.8, 9).filter(h => free(h.g))
      // (la dernière poignée ramasse les quelques cheveux qui resteraient cachés)
      if (hits.length && left - hits.length <= 14) for (let g = 0; g < hair.G; g++) if (free(g) && !hits.some(h => h.g === g)) hits.push({ g, i: 0, a: hair.seg[g] * (hair.P - 1) * 0.5, t: 0, d: 0 })
      if (hits.length) {
        const t = tHair, p = at(o, d, t)
        const [ux, uy] = [new THREE.Vector3(), new THREE.Vector3()]
        ux.crossVectors(new THREE.Vector3(...d), new THREE.Vector3(0, 1, 0)).normalize()
        uy.crossVectors(ux, new THREE.Vector3(...d))
        hits.forEach((h, k) => {
          const r1 = 0.09 * Math.sqrt((k + 0.5) / hits.length), th = k * 2.399963
          const cx = Math.cos(th) * r1, cy = Math.sin(th) * r1
          hair!.grab(h.g, h.a, p, [ux.x * cx + uy.x * cy, ux.y * cx + uy.y * cy, ux.z * cx + uy.z * cy])
        })
        handPos = p
        grab = { ...base, kind: 'main', t, held: hits.map(h => h.g), ray: [o, d] }
        sound('prise')
        return
      }
      // aucun cheveu à prendre par là : le doigt est quand même sur des cheveux, rien ne tourne
      grab = { ...base, kind: 'rien' }
      return
    }
    grab = { ...base, kind: 'tourner' }
  }
  /** Le doigt trace la raie : elle s'ouvre de son départ jusqu'à lui. */
  function traceRaie(p: V3) {
    if (!grab?.path || raie.done) return
    grab.path.push(p)
    if (Math.abs(p[0]) > 0.4) return
    const a = milieu(p)
    raie.lo = Math.min(raie.lo, a)
    // (commencée près du front, elle part du bord des cheveux)
    raie.hi = Math.max(raie.hi, a > 0.55 ? FRONT : a)
  }
  function move(e: PointerEvent) {
    if (!grab || !hair || e.pointerId !== grab.id || grab.kind === 'rien') return
    if (grab.kind === 'raie') {
      const p = capPoint(e)
      if (p) traceRaie(p)
      return
    }
    if (grab.kind === 'tourner') {
      spinner.turn(spin, e.clientX - grab.x, e.timeStamp)
      grab.x = e.clientX
      return
    }
    const [o, d] = simRay(e)
    if (grab.kind === 'main' || grab.kind === 'brin') { grab.ray = [o, d]; return }
    const p = at(o, d, grab.t)
    const m: V3 = [p[0] - grab.last![0], p[1] - grab.last![1], p[2] - grab.last![2]]
    // ce qui compte : la brosse qui DESCEND (elle ne froisse rien, et les
    // cheveux reviennent lisses)
    // (dans toute l'épaisseur, pas seulement les mèches du dessus)
    hair.comb(o, d, 0.5, m, 0.6)
    for (const h of hair.pick(o, d, 0.45, 9)) brushAmt[h.g] += Math.max(0, -m[1])
    grab.last = p
  }
  const moving = (e: PointerEvent) => {
    // tous les points du geste, même entre deux images : le doigt n'a aucun retard
    const evs = (e as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] }).getCoalescedEvents?.() ?? []
    move(evs.length ? evs[evs.length - 1] : e)
  }
  /** Chaque image : la main suit le doigt (son point d'écran exact ; seule sa
      profondeur s'adoucit, ce qui ne se voit pas). */
  function moveHand(dt: number) {
    if (!grab || grab.kind !== 'main' || !hair) return
    const [o, d] = grab.ray!
    grab.t += (handDepth(o, d) - grab.t) * Math.min(1, dt * 14)
    handPos = at(o, d, grab.t)
    hair.hand(handPos)
  }
  /** La main est dans le rond de l'étape (en rayons de tête, à l'écran). */
  function inRing(e: { clientX: number; clientY: number }, g0: Grab) {
    const t = tieScreen(step().a), px = headPx()
    return Math.hypot(e.clientX - t.x, e.clientY - t.y) < px * 0.6 && Math.hypot(e.clientX - g0.x0, e.clientY - g0.y0) > px * 0.2
  }
  /** Le rayon de la tête à l'écran (px). */
  function headPx() {
    const r = renderer.domElement.getBoundingClientRect()
    return R / (camera.position.distanceTo(C) * Math.tan(camera.fov * Math.PI / 360)) * r.height / 2
  }
  const up = (e: PointerEvent) => {
    if (!grab || e.pointerId !== grab.id || !hair) return
    const g0 = grab
    grab = null
    if (g0.kind === 'tourner') spinner.release(spin, e.timeStamp)
    if (g0.kind === 'brin') tresse.goal = braid!.state.g > 0.5 ? 1 : 0
    if (g0.kind === 'brosse') {
      let n = 0, all = 0
      for (let g = 0; g < hair.G; g++) if (isBack(g)) { all++; if (brushAmt[g] >= BRUSHED) n++ }
      if (n >= all * 0.85) { brushAmt.fill(BRUSHED); o.sound('lisse'); o.after(500, () => { if (etape === 'brosser') next() }) }
    }
    if (g0.kind === 'raie') {
      // un trait assez long, d'avant en arrière, près du milieu de la tête : elle
      // s'achève seule. Trop court : ce qui est ouvert le reste, on continue.
      const path = g0.path!
      const zs = path.map(p => p[2]), mid = path.filter(p => Math.abs(p[0]) < 0.4 && p[1] > -0.2).length
      lastRaie = { span: Math.max(...zs) - Math.min(...zs), mid: mid / path.length, n: path.length }
      if (!raie.done && Math.min(raie.hi, 1) - raie.lo > 0.6) { raie.done = true; o.sound('raie') }
    }
    if (g0.kind === 'main') {
      // dans le rond : la poignée s'y pose. Ailleurs : elle retombe. Rien d'autre ne bouge.
      const ok = e.type === 'pointerup' && etape === 'rassembler' && inRing(e, g0)
      for (const g of g0.held) if (ok) tieGuide(g, 0); else hair.untie(g)
      o.sound(ok ? 'pose' : 'lache')
    }
  }
  cv.addEventListener('pointerdown', down)
  cv.addEventListener('pointermove', moving)
  cv.addEventListener('pointerup', up)
  cv.addEventListener('pointercancel', up)

  /* ---- La brosse (24/11 : « elle est où la brosse ? ») ----
     Elle attend à côté de la tête pendant l'étape « brosser », vient sous le
     doigt dès qu'on touche les cheveux, et glisse dessus, les poils contre les
     cheveux, le manche vers la droite (la main qui la tient). */
  const { o: brush, pull: brushPull } = brosse(env)
  brush.visible = false
  scene.add(brush)
  let brushOn = 0
  /** Le sens de la surface (tête, cou, dos) sous un point (repère de la tête). */
  function surfaceN(p: V3) {
    const n = new THREE.Vector3()
    for (const e of handShapes) {
      const x = (p[0] - e.c[0]) / e.r[0], y = (p[1] - e.c[1]) / e.r[1], z = (p[2] - e.c[2]) / e.r[2], l = Math.hypot(x, y, z) || 1
      const w = Math.exp(-6 * Math.max(0, l - 1))
      n.x += x / e.r[0] / l * w; n.y += y / e.r[1] / l * w; n.z += z / e.r[2] / l * w
    }
    return n.normalize()
  }
  /** La pose de la brosse à chaque image. */
  function placeBrush(dt: number, now: number) {
    const show = etape === 'brosser'
    brush.visible = show && R > 0
    if (!brush.visible) return
    brush.scale.setScalar(R * 1.12)
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), upc = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1), front = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2)
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), on = grab?.kind === 'brosse' && grab.last
    if (on) {
      // sous le doigt, posée sur la chevelure ; inclinée vers nous : on voit ses poils entrer dans les cheveux
      const n = surfaceN(grab!.last!).transformDirection(hairGroup.matrixWorld)
      pos.set(...grab!.last!)
      hairGroup.localToWorld(pos).addScaledVector(n, R * 0.33)
      // (en arrivant, elle passe DEVANT la tête, pas au travers)
      pos.addScaledVector(front, R * 1.3 * (1 - brushOn))
      const y = n.clone().addScaledVector(upc, 0.6).addScaledVector(front, 0.1).normalize()
      const x = right.clone().addScaledVector(upc, -0.28)
      x.addScaledVector(y, -x.dot(y)).normalize()
      quat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)))
      brushOn = Math.min(1, brushOn + dt / 0.14)
    } else {
      // elle attend à côté de la tête, poils vers nous, et respire un peu pour qu'on la voie
      pos.copy(C).addScaledVector(right, R * 1.95).addScaledVector(upc, -R * 0.3 + Math.sin(now / 400) * R * 0.05)
      const y = front.clone().multiplyScalar(-0.72).addScaledVector(upc, 0.55).addScaledVector(right, -0.3).normalize()
      const x = right.clone().multiplyScalar(0.75).addScaledVector(upc, -0.75)
      x.addScaledVector(y, -x.dot(y)).normalize()
      quat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)))
      brushOn = Math.max(0, brushOn - dt / 0.25)
    }
    // (seulement quand elle nous montre son dos)
    const back = new THREE.Vector3(0, 1, 0).applyQuaternion(brush.quaternion).dot(front)
    brushPull.value = R * 0.5 * brushOn * Math.min(1, Math.max(0, back / 0.3))
    // une fois arrivée sous le doigt, elle y est EXACTEMENT (aucun retard)
    if (on && brushOn >= 1) brush.position.copy(pos)
    else brush.position.lerp(pos, Math.min(1, dt * 16))
    brush.quaternion.slerp(quat, Math.min(1, dt * 16))
  }
  /** Le cadrage : la tête et les épaules ; plus haut pour la raie (le dessus de la tête). */
  function aimCamera() {
    const k = camEl * camEl * (3 - 2 * camEl), el = 0.85 * k, dist = R * (12 - 3 * k)
    camera.position.set(C.x, C.y - R * 0.3 * (1 - k) + Math.sin(el) * dist, C.z + Math.cos(el) * dist)
    camera.lookAt(C.x, C.y - R * 1.15 * (1 - k) - R * 0.1 * k, C.z)
  }

  /* ---- La mise en place ---- */
  pivot.add(bust.vrm.scene)
  {
    const { skull, map, bare, neck, torso } = bust
    const init = scalp({ skull, count: 300, length: 3.6, seed: 5 })
    hair = new Hair(init)
    hair.headColliders = [faceGuard(skull), neck, torso]
    hair.skull = map
    hair.bare = bare
    hair.setHead(spin.rot, 0, true)
    hair.bake(5)
    brushAmt = new Float32Array(hair.G)
    handShapes = [{ c: [0, 0, 0], r: [1.03, 1.16, 1.12] }, { c: neck.c, r: neck.r.map(v => v + 0.1) as V3 }, torso]
    looks = new Float32Array(hair.G)
    sens = new Float32Array(hair.G)
    view = hairView(THREE, hair, { width: 0.04, child: 14, skull: bare })
    hairGroup.scale.setScalar(R)
    hairGroup.add(view.mesh)
    // le vrai dos : les ovales de la physique sont plus larges que lui, et une
    // tresse, fine, flottait à distance
    const dos = new THREE.Raycaster(), profil: [number, number][] = []
    body.matrixWorld.identity()
    for (let y = -0.9; y >= -4; y -= 0.1) {
      dos.set(new THREE.Vector3(0, y * R, -4 * R), new THREE.Vector3(0, 0, 1))
      const hit = dos.intersectObject(body, false)[0]
      if (hit) profil.push([y, hit.point.z / R])
    }
    const ovale = (y: number) => Math.min(...[neck, torso].map(e => { const k = 1 - ((y - e.c[1]) / e.r[1]) ** 2; return k > 0 ? e.c[2] - e.r[2] * Math.sqrt(k) : 9 }))
    const settle = (p: V3): V3 => {
      const back = profil.length ? profil.reduce((a, b) => Math.abs(b[0] - p[1]) < Math.abs(a[0] - p[1]) ? b : a)[1] : 0, o = ovale(p[1])
      const gap = Math.max(0, Math.min(0.6, back - o - 0.12)), far = Math.max(0, o - p[2] - 0.1), side = Math.max(0, Math.abs(p[0]) - 0.3)
      return [p[0], p[1], p[2] + gap * Math.max(0, 1 - far / 0.6) * Math.max(0, 1 - side / 0.5)]
    }
    braid = braidView(THREE, hair, { settle })
    hairGroup.add(braid.mesh)
    // la calotte sur le VRAI cuir chevelu du modèle (en unités de tête)
    const scalpTris = bust.scalp
    cap = hairCap(THREE, skull, onScalp, scalpTris.length ? { tris: scalpTris, lift: 0.01, map: bare } : undefined)
    hairGroup.add(cap.mesh)
    cap.setLight(-0.35, 0.8, 0.5)
    initial = { pos: hair.pos.slice(), rest: hair.rest.slice(), dir: hair.dirL.slice() }
    rings.forEach(r => hairGroup.add(r))
    bands.forEach(b => { b.visible = false; hairGroup.add(b) })
    buildRaieHint()
    hairGroup.add(raieHint)
    sun.position.set(-1, 2, 1.5)
    fill.position.set(1.5, 0.3, -1)
    view.setLight(-0.35, 0.8, 0.5)
    braid.setLight(-0.35, 0.8, 0.5)
    rings.forEach(r => { r.visible = false })
    raieHint.visible = false
    setupRecette()
    sansTresse()
    aimCamera()
    // les matières de la brosse et de l'élastique, préparées tout de suite (leur
    // première apparition gelait l'image 200 à 400 ms)
    bands.forEach(b => { b.visible = true })
    renderer.compile(scene, camera)
    bands.forEach(b => { b.visible = false })
  }

  /** La coiffure, finie d'un coup. */
  function finie() {
    const h = hair!
    if (recette.steps.some(s => s.k === 'raie')) { raie.lo = NUQUE; raie.hi = FRONT; raie.done = true }
    for (let g = 0; g < h.G; g++) tieGuide(g, 0)
    h.tieT.fill(1)
    for (let k = 0; k < 200; k++) h.step(1 / 120)
    pulledA.fill(1); sens.fill(1)
    bands.forEach((b, a) => { b.visible = a < TIES.length })
    if (recette.tresse) { braid!.mesh.visible = true; braid!.reset(true); view!.setBraid(1) }
  }
  const dbg = {
    ready: true,
    proj(g: number, i: number) {
      const p = hair!.point(g, i); const w = hairGroup.localToWorld(new THREE.Vector3(...p)).project(camera)
      const r = renderer.domElement.getBoundingClientRect()
      return { x: r.left + (w.x + 1) / 2 * r.width, y: r.top + (1 - w.y) / 2 * r.height }
    },
    still() { return hair!.asleep.reduce((a, b) => a + b, 0) / hair!.G },
    get G() { return hair!.G },
    get yaw() { return spin.rot },
    get etape() { return etape },
    setYaw(v: number) { spin.rot = v; spin.vRot = 0 },
    get h() { return hair },
    get recette() { return recette.id },
    get lastRaie() { return lastRaie },
    get turning() { return yawGoal !== null || Math.abs(camEl - (etape === 'raie' ? 1 : 0)) > 0.02 },
    raieScreen() {
      const pr = (d: V3) => { const qq = cap!.surface(d); const w = hairGroup.localToWorld(new THREE.Vector3(...qq)).project(camera); const r = renderer.domElement.getBoundingClientRect(); return { x: r.left + (w.x + 1) / 2 * r.width, y: r.top + (1 - w.y) / 2 * r.height } }
      return [pr([0, 0.55, 0.83]), pr([0, 0.95, 0.1]), pr([0, 0.7, -0.7])]
    },
    /** Va droit à une étape (les vérifications). */
    etapeA(k: Kind) { setEtape(k) },
    queueFinie() { finie(); setEtape('fini') },
    get braidEnd() { return braid!.end().p },
    /** La tresse : où elle en est, et ses mèches à l'écran. */
    get tresse() { const b = braid!, st = b.state; return { pret: tresse.ready && st.spread > 0.6, n: st.n, g: +st.g.toFixed(2), tenue: st.held, hw: +st.hw.toFixed(2), next: b.next(), front: +b.front.toFixed(2), len: +b.len.toFixed(2), tied: st.tied } },
    brin(k: number, u: number) { const b = braid!, w = hairGroup.localToWorld(new THREE.Vector3(...b.point(k, b.front + (b.len - b.front) * u))).project(camera), r = renderer.domElement.getBoundingClientRect(); return { x: r.left + (w.x + 1) / 2 * r.width, y: r.top + (1 - w.y) / 2 * r.height } },
    /** Tout rassemblé, d'un coup. */
    rassemble() { for (let g = 0; g < hair!.G; g++) tieGuide(g, 0); hair!.tieT.fill(1); for (let k = 0; k < 200; k++) hair!.step(1 / 120) },
    tieScreen,
    tied() { return Array.from(hair!.tieIdx).filter(j => j >= 0).length / hair!.G },
    brushed() { return brushAmt.reduce((a, b) => a + Math.min(1, b / BRUSHED), 0) / hair!.G },
    /** La main : où elle tient, en points d'écran. */
    get main() { return grab?.kind === 'main' ? { n: grab.held.length, p: handPos } : null },
    get geste() { return grab?.kind ?? '' },
    untied() { const out: number[] = [], st = step(); for (let g = 0; g < hair!.G; g++) if (hair!.tieIdx[g] < 0 && (st.k === 'rassembler' ? sides[g] === st.a : isBack(g))) out.push(g); return out }
  }
  /* ---- Ce que le jeu pilote ---- */
  return {
    /** Le rayon de la tête (mètres), son centre à l'origine. */
    R,
    get recette() { return recette },
    get stepI() { return stepI },
    get etape() { return etape },
    get busy() { return grab !== null },
    /** Les cheveux, lâchés ; rien à faire encore. */
    libre() { lacher(); etape = 'libre'; rings.forEach(r => { r.visible = false }); raieHint.visible = false; yawGoal = null },
    /** Une coiffure commence (`done` : elle est là, toute faite). */
    start(id: Coiffure, done = false) {
      recette = RECETTES.find(r => r.id === id) ?? RECETTES[0]
      lacher()
      if (done) { finie(); setStep(recette.steps.length - 1, true) } else setStep(0)
    },
    setColor(hex: string) { view!.setColor(hex); braid!.setColor(hex); cap!.setColor(hex); paintScalp(hex) },
    /** La tête se tourne vers ce lacet (0 : le visage vers nous), doucement. */
    lookAt(yaw: number) { yawGoal = yaw },
    set yaw(v: number) { spin.rot = v; spin.vRot = 0; hair!.setHead(v, 0, true) },
    get yaw() { return spin.rot },
    freeze(v: boolean) { figee = v },
    /** Moins de fils, un peu plus larges (0..1). */
    setDensity(k: number) { view!.setDensity(k) },
    face: bust.face,
    /** L'élastique lâché en ce point de l'écran : posé sur la coiffure, ou pas. */
    drop(x: number, y: number) {
      if (etape !== 'elastique' || bands[step().a].visible) return false
      const a = step().a, t = tieScreen(a)
      if (Math.hypot(x - t.x, y - t.y) > Math.max(110, headPx() * 1.1)) return false
      bands[a].visible = true; bandPop[a] = 1
      o.sound('noeud')
      const i = stepI
      // (on le voit se poser avant que la tête ne tourne vers l'autre côté)
      o.after(recette.steps[i + 1]?.k === 'fini' ? 350 : 900, () => { if (stepI === i && etape === 'elastique') next() })
      return true
    },
    /** Le nœud de l'étape est déjà posé (son bouton s'en va). */
    get posed() { return etape === 'elastique' && bands[step().a].visible },
    tieScreen,
    /** Pour la main : ce qu'il faut toucher maintenant, en points de l'écran (null : rien à montrer). */
    geste(): V2[] | null {
      if (grab || yawGoal !== null || !hair) return null
      const pr = (p: V3): V2 => { const w = hairGroup.localToWorld(new THREE.Vector3(...p)).project(camera), r = renderer.domElement.getBoundingClientRect(); return { x: r.left + (w.x + 1) / 2 * r.width, y: r.top + (1 - w.y) / 2 * r.height } }
      // (son dos n'est pas en vue : elle l'a tournée, on attend)
      if (etape === 'brosser') return Math.cos(spin.rot - Math.PI) < 0.3 ? null : [pr([0, 0.55, -1.2]), pr([0, -2.2, -1.2])]
      if (etape === 'raie') return camEl > 0.9 && !raie.done ? Array.from({ length: 9 }, (_, k) => pr(cap!.surface(hintPoint(k / 11)))) : null
      if (etape === 'rassembler') {
        // une mèche encore libre, bien en vue, sur le côté
        let best: V2 | null = null, far = -1
        const t = tieScreen()
        for (let g = 0; g < hair.G; g++) {
          if (hair.tieIdx[g] >= 0 || sides[g] !== step().a) continue
          const p = hair.point(g, 6), w = hairGroup.localToWorld(new THREE.Vector3(...p))
          if (w.z < 0) continue
          const q = pr(p), d = Math.abs(q.x - t.x)
          if (d > far && d < headPx() * 1.2) { far = d; best = q }
        }
        return best ? [best, t] : null
      }
      if (etape === 'tresser') {
        const b = braid!, st = b.state
        if (!tresse.ready || st.n >= CRANS || st.lit < 0.5) return null
        const k = b.next().k, s = b.front + (b.len - b.front) * 0.4, a = pr(b.point(k, s)), m = pr(b.frame(s).p)
        return [a, { x: m.x + (m.x - a.x) * 0.3, y: m.y }]
      }
      if (etape === 'elastique') { const t = tieScreen(); return this.posed ? null : [t] }
      return null
    },
    update(dt: number, now: number) {
      // (l'élan s'arrête net : un reste de vitesse invisible gardait tous les cheveux éveillés)
      if (!grab || grab.kind !== 'tourner') coast(spin, dt, 0.02, 0.04)
      // la tête se tourne d'elle-même vers ce qu'il faut coiffer (un doigt l'arrête)
      const auto = yawGoal !== null && !grab
      if (yawGoal !== null && !grab) {
        // (départ et arrivée doux, une vitesse plafonnée : d'un coup, les cheveux
        // fouettaient le visage)
        const dYaw = turnTo(yawGoal), want = Math.max(-2.4, Math.min(2.4, dYaw * 2))
        spin.vRot = 0
        yawV += (want - yawV) * Math.min(1, dt * 7)
        if (Math.abs(dYaw) < 0.004 && Math.abs(yawV) < 0.05) { spin.rot += dYaw; yawGoal = null } else spin.rot += yawV * dt
      } else yawV = 0
      // pour la raie, on regarde le dessus de la tête
      camEl += ((etape === 'raie' ? 1 : 0) - camEl) * Math.min(1, dt * 3)
      aimCamera()
      pivot.rotation.y = spin.rot
      if (hair && view) {
        hair.setHead(spin.rot, 0, false, auto ? 0.75 : 0)
        moveHand(dt)
        hair.advance(dt)
        glowNow()
        if (etape === 'rassembler' && arrived(step().a)) next()
        rings.forEach(r => r.scale.setScalar(1 + Math.sin(now / 220) * 0.06))
        raieHint.scale.setScalar(1)
        ;(raieHint.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(now / 220)
        if (cap) moveRaie(dt)
        if (cap) {
          // pendant le rassemblement, les cheveux restent des fils (on les voit
          // tirés vers l'élastique) ; quand tout est rassemblé, la chevelure se
          // lisse d'un seul fondu (le 24/11 : une plaque lisse au milieu des
          // cheveux libres, ou des mèches qui disparaissaient d'un coup)
          // (chaque attache pour son côté)
          for (let a = 0; a < TIES.length; a++) pulledA[a] = arrived(a) ? Math.min(1, pulledA[a] + dt / 0.7) : Math.max(0, pulledA[a] - dt / 0.3)
          let same = view.look === looks
          for (let g = 0; g < hair.G; g++) { const v = pulledA[sides[g]], l = v * v * (3 - 2 * v); if (looks[g] !== Math.fround(l)) { looks[g] = l; same = false } }
          view.look = looks
          // (dessous, le SENS des stries suit déjà chaque mèche posée : sinon une ligne
          // nette séparait les cheveux tirés de la calotte encore peignée vers le bas)
          let still = true
          for (let g = 0; g < hair.G; g++) {
            const to = hair.tieIdx[g] >= 0 && !hair.held[g] ? 1 : 0, v = sens[g] + Math.max(-dt / 0.3, Math.min(dt / 0.5, to - sens[g]))
            if (v !== sens[g]) { sens[g] = v; still = false }
          }
          if (!same || !still) { cap.setTieField(hair.rootL, sens); cap.setDome(pulledA[0], pulledA[1]) }
        }
        if (braid?.mesh.visible) { moveBraid(dt); braid.update(); if (bands[0].visible) { bandPop[0] -= dt * 2.5; placeBraidBand() } } else bands.forEach((b, a) => { if (b.visible && (bandPop[a] > 0 || !bandSet[a])) { placeBand(a, dt); bandSet[a] = bandPop[a] <= 0 && arrived(a) } })
        placeBrush(dt, now)
        view.update()
      }
    },
    dispose() {
      cv.removeEventListener('pointerdown', down)
      cv.removeEventListener('pointermove', moving)
      cv.removeEventListener('pointerup', up)
      cv.removeEventListener('pointercancel', up)
      view?.dispose(); cap?.dispose(); braid?.dispose()
      bodyGeo.dispose()
      bust.dispose()
    },
    /** Pour les vérifications et les bots. */
    dbg
  }
}
interface V2 { x: number; y: number }
