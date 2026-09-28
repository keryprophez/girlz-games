import type { Stage } from './three3d'
import { loadModel, dotTex } from './three3d'
import { decor, ring } from './scene3d'

/* Le paysage d'hiver de la Tour de Glace (né avec le Bonhomme de neige le
   23/09, redessiné pour la Tour le 28/09 quand le Bonhomme est sorti du
   catalogue). La caméra de la Tour regarde toujours vers −z et ne fait que
   monter : le décor est composé pour CE regard.
   - un ciel en dégradé et des montagnes enneigées au loin, noyées dans une
     brume de la même couleur ; des collines, des rochers coiffés de blanc ;
   - un chalet en rondins assemblé pièce par pièce (kit Holiday de Kenney :
     murs, coins, pignons, toit enneigé, cheminée qui FUME), sa couronne, un
     sapin décoré, une luge, un banc, des lanternes, deux rennes ;
   - des nuages qu'on traverse en montant ;
   - L'HEURE QUI TOURNE AVEC LA HAUTEUR (`setDusk`) : plein jour au pied de
     la tour, lumière dorée, crépuscule rose, puis la nuit — étoiles, lune et
     aurore boréale au sommet. C'est la seule récompense de la hauteur : rien
     ne se débloque, on voit seulement le ciel changer.
   Rien n'est posé devant la caméra ni derrière la tour à hauteur des blocs :
   le décor ne gêne jamais la visée. */

type T3 = Stage['T']

export interface Winter {
  /** À appeler à chaque image : fumée, lanternes, aurore. */
  update(dt: number, t: number): void
  /** L'heure du ciel : 0 = plein jour d'hiver, 1 = nuit étoilée avec aurore. */
  setDusk(k: number): void
}

/* Les kits Kenney sont clairs : sous hemi + soleil + IBL, l'ACES les délave
   (piège connu). On les assombrit, la lumière les remonte. */
const SHADE = 0.74

/** Les couleurs du ciel de jour : à reprendre pour le brouillard (horizon). */
export const WINTER_SKY = { top: '#5E97D6', mid: '#A9CFEF', horizon: '#F4DCCB' }

/* Les quatre heures du ciel, de 0 (jour) à 1 (nuit). Entre deux, on mélange. */
interface Hour {
  at: number
  top: string; mid: string; hor: string
  sun: string; sunI: number
  hemi: [string, string, number]
  env: number
  cloud: string
}
const HOURS: Hour[] = [
  { at: 0, top: WINTER_SKY.top, mid: WINTER_SKY.mid, hor: WINTER_SKY.horizon, sun: '#FFF4E0', sunI: 2.5, hemi: ['#DDF0FF', '#9FBBD0', 1.15], env: 0.55, cloud: '#FFFFFF' },
  { at: 0.35, top: '#4A78C0', mid: '#EAC39A', hor: '#FFB27A', sun: '#FFD29A', sunI: 2.3, hemi: ['#FFE3C2', '#A89AB0', 1.0], env: 0.5, cloud: '#FFE6CC' },
  { at: 0.65, top: '#26386F', mid: '#9E6FA6', hor: '#F4948A', sun: '#FF9E86', sunI: 1.5, hemi: ['#C9A6D8', '#6C6A94', 0.9], env: 0.42, cloud: '#F2B6C4' },
  { at: 1, top: '#070D26', mid: '#15244E', hor: '#2A3F6E', sun: '#A8C2FF', sunI: 1.1, hemi: ['#7F98D0', '#26345A', 0.75], env: 0.32, cloud: '#6A7AAE' }
]

function skyDome(T: T3) {
  const u = {
    uTop: { value: new T.Color(WINTER_SKY.top) },
    uMid: { value: new T.Color(WINTER_SKY.mid) },
    uHor: { value: new T.Color(WINTER_SKY.horizon) }
  }
  const m = new T.Mesh(new T.SphereGeometry(160, 32, 16), new T.ShaderMaterial({
    uniforms: u, side: T.BackSide, depthWrite: false, fog: false, toneMapped: false,
    vertexShader: `varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uTop, uMid, uHor; varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.3, h));
        c = mix(c, uTop, smoothstep(0.3, 0.8, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`
  }))
  m.renderOrder = -10
  return { mesh: m, u }
}

/** Des étoiles sur le haut du ciel (deux tailles), invisibles de jour. */
function stars(T: T3, dot: import('three').Texture) {
  const mk = (n: number, size: number) => {
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const h = 0.06 + Math.pow(Math.random(), 0.7) * 0.94
      const r = Math.sqrt(1 - h * h) * 150
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = h * 150; pos[i * 3 + 2] = Math.sin(a) * r
    }
    const geo = new T.BufferGeometry()
    geo.setAttribute('position', new T.BufferAttribute(pos, 3))
    const p = new T.Points(geo, new T.PointsMaterial({
      map: dot, size, sizeAttenuation: false, transparent: true, opacity: 0,
      depthWrite: false, fog: false, color: 0xEAF2FF, blending: T.AdditiveBlending
    }))
    p.renderOrder = -9
    return p
  }
  return [mk(420, 2.2), mk(70, 3.6)]
}

/** La lune : un disque pâle, un halo, quelques mers. */
function moon(T: T3) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const halo = g.createRadialGradient(64, 64, 24, 64, 64, 64)
  halo.addColorStop(0, 'rgba(200,216,255,.35)'); halo.addColorStop(1, 'rgba(200,216,255,0)')
  g.fillStyle = halo; g.fillRect(0, 0, 128, 128)
  g.fillStyle = '#F6F2E4'; g.beginPath(); g.arc(64, 64, 24, 0, Math.PI * 2); g.fill()
  g.fillStyle = 'rgba(150,160,185,.4)'
  for (const [x, y, r] of [[56, 56, 7], [72, 68, 5.5], [58, 75, 4], [74, 52, 3]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill() }
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  const s = new T.Sprite(new T.SpriteMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false, fog: false }))
  s.position.set(0.42, 0.3, -1).normalize().multiplyScalar(140)
  s.scale.setScalar(20)
  s.renderOrder = -8
  return { s, t }
}

/** L'aurore boréale : un rideau lointain derrière la tour, qui ondule. */
function aurora(T: T3) {
  const u = { uTime: { value: 0 }, uAlpha: { value: 0 } }
  const geo = new T.CylinderGeometry(130, 130, 40, 64, 1, true, Math.PI - 1.0, 2.0)
  const m = new T.Mesh(geo, new T.ShaderMaterial({
    uniforms: u, side: T.BackSide, transparent: true, depthWrite: false, fog: false, toneMapped: false,
    blending: T.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime, uAlpha; varying vec2 vUv;
      void main() {
        float x = vUv.x * 6.2831;
        float n = sin(x * 2.0 + uTime * 0.3) * 0.5 + sin(x * 3.7 - uTime * 0.23 + 1.3) * 0.3 + sin(x * 9.1 + uTime * 0.4) * 0.2;
        float y = vUv.y - 0.1 * n;
        float band = smoothstep(0.02, 0.14, y) * (1.0 - smoothstep(0.14, 0.72, y));
        float rays = 0.62 + 0.38 * sin(x * 23.0 + 2.5 * sin(x * 3.1 + uTime * 0.4)) * sin(x * 11.0 - uTime * 0.2);
        float spot = 0.35 + 0.65 * smoothstep(-0.4, 0.8, sin(x * 1.3 + uTime * 0.12 + 2.0));
        float edge = smoothstep(0.0, 0.25, vUv.x) * (1.0 - smoothstep(0.75, 1.0, vUv.x));
        vec3 col = mix(vec3(0.25, 0.9, 0.62), vec3(0.56, 0.4, 0.95), smoothstep(0.12, 0.6, y));
        gl_FragColor = vec4(col * band * rays * spot * edge * uAlpha, 1.0);
        #include <colorspace_fragment>
      }`
  }))
  m.position.y = 36
  m.renderOrder = -7
  return { m, u }
}

/** Un nuage de dessin animé : des boules nettes, le dessous en aplat plus
    sombre (comme les modèles Kenney, pas de flou). */
function cloudTex(T: T3) {
  const c = document.createElement('canvas')
  c.width = 256; c.height = 128
  const g = c.getContext('2d')!
  const balls = [[58, 84, 30], [98, 66, 40], [148, 60, 38], [192, 80, 28], [124, 88, 32], [80, 94, 24], [170, 96, 22]]
  const draw = (dy: number) => { for (const [x, y, r] of balls) { g.beginPath(); g.arc(x, y + dy, r, 0, Math.PI * 2); g.fill() } }
  g.fillStyle = '#C9D6E6'; draw(0)
  g.fillStyle = '#FFFFFF'; draw(-7)
  // Le bas bien à plat
  g.globalCompositeOperation = 'destination-out'
  g.fillRect(0, 106, 256, 22)
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  return t
}

function clouds(T: T3, tex: import('three').Texture) {
  const list: import('three').Sprite[] = []
  const n = 8
  for (let i = 0; i < n; i++) {
    // Hauts et loin, de part et d'autre : jamais derrière la visée (la
    // colonne des blocs), jamais devant la lune (à droite)
    const side = i % 2 ? 1 : -1
    const a = Math.PI * (1.5 + side * (0.12 + ((i >> 1) + Math.random() * 0.5) / (n / 2) * 0.3))
    if (side > 0 && a > Math.PI * 1.6 && a < Math.PI * 1.72) continue
    const r = 70 + Math.random() * 30
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }))
    const w = 16 + Math.random() * 12
    s.scale.set(w, w * 0.5, 1)
    s.position.set(Math.cos(a) * r, 16 + Math.random() * 16, Math.sin(a) * r)
    s.renderOrder = -6
    list.push(s)
  }
  return list
}

/** Des montagnes en facettes, coiffées de neige, sur tout l'horizon. */
function mountains(T: T3, scene: import('three').Scene) {
  const rockMat = new T.MeshStandardMaterial({ color: 0x5E7396, roughness: 0.95, flatShading: true })
  const capMat = new T.MeshStandardMaterial({ color: 0xF2F7FF, roughness: 0.8, flatShading: true })
  const g = new T.Group()
  const n = 16
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.2
    const r = 62 + Math.random() * 18
    const h = 14 + Math.random() * 16
    const w = 16 + Math.random() * 12
    const seg = 5 + (i % 3)
    const peak = new T.Mesh(new T.ConeGeometry(w, h, seg, 1), rockMat)
    peak.position.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r)
    peak.rotation.y = Math.random() * Math.PI
    // La calotte : le même cône, plus petit, recalé sur le sommet
    const k = 0.38
    const cap = new T.Mesh(new T.ConeGeometry(w * k * 1.04, h * k, seg, 1), capMat)
    cap.position.y = h / 2 - (h * k) / 2 + 0.05
    peak.add(cap)
    g.add(peak)
  }
  scene.add(g)
}

/** Des collines de neige douces entre la tour et les montagnes. */
function hills(T: T3, scene: import('three').Scene, snowMat: import('three').Material) {
  const geo = new T.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2)
  for (const [x, z, s, h] of [
    [-34, -38, 16, 3.2], [8, -50, 20, 4], [42, -28, 15, 2.8], [48, 10, 17, 3.4],
    [26, 44, 16, 3], [-20, 46, 18, 3.6], [-50, 8, 17, 3.2], [-44, -14, 12, 2.2]
  ] as const) {
    const m = new T.Mesh(geo, snowMat)
    m.scale.set(s, h, s * 0.8)
    m.position.set(x, -0.2, z)
    m.receiveShadow = true
    scene.add(m)
  }
}

/* ---- Le chalet : grille de 2 × 2 cases (une case = 1 unité Kenney) ----
   Les murs du kit sont posés sur le bord +z de leur case ; on tourne la
   pièce pour la mettre sur un autre bord. Le pignon et le toit sont des
   demi-pièces : le côté droit tel quel, le côté gauche en miroir. */
async function cabin(T: T3): Promise<{ obj: import('three').Group; chimney: import('three').Vector3 }> {
  const names = ['cabin-wall', 'cabin-window-a', 'cabin-door-rotate', 'cabin-corner-logs', 'cabin-roof-snow',
    'cabin-roof-snow-chimney', 'cabin-wall-roof', 'cabin-wall-wreath'] as const
  const proto = Object.fromEntries(await Promise.all(names.map(async n => [n, await loadModel('holiday', n)] as const)))
  const g = new T.Group()
  const put = (name: typeof names[number], x: number, y: number, z: number, rot: number, mirror = false) => {
    const o = proto[name].clone(true)
    o.traverse(m => {
      const mesh = m as import('three').Mesh
      if (!mesh.isMesh) return
      const mat = (mesh.material as import('three').MeshStandardMaterial).clone()
      mat.color.multiplyScalar(SHADE * 0.82)
      mesh.material = mat
    })
    o.position.set(x, y, z)
    o.rotation.y = rot
    if (mirror) o.scale.x = -1
    g.add(o)
    return o
  }
  const P = Math.PI
  // Façade (+z) : fenêtre et porte ; derrière : deux murs ; côtés : la couronne, des fenêtres
  put('cabin-window-a', -0.5, 0, 0.5, 0)
  put('cabin-door-rotate', 0.5, 0, 0.5, 0)
  put('cabin-wall', -0.5, 0, -0.5, P)
  put('cabin-wall', 0.5, 0, -0.5, P)
  put('cabin-window-a', 0.5, 0, 0.5, P / 2)
  put('cabin-wall', 0.5, 0, -0.5, P / 2)
  put('cabin-wall-wreath', -0.5, 0, 0.5, -P / 2)
  put('cabin-window-a', -0.5, 0, -0.5, -P / 2)
  put('cabin-corner-logs', -0.5, 0, 0.5, 0)
  put('cabin-corner-logs', 0.5, 0, 0.5, P / 2)
  put('cabin-corner-logs', 0.5, 0, -0.5, P)
  put('cabin-corner-logs', -0.5, 0, -0.5, -P / 2)
  // Pignons, devant et derrière
  put('cabin-wall-roof', 0.5, 1, 0.5, 0)
  put('cabin-wall-roof', -0.5, 1, 0.5, 0, true)
  put('cabin-wall-roof', -0.5, 1, -0.5, P)
  put('cabin-wall-roof', 0.5, 1, -0.5, P, true)
  // Toit enneigé, faîtage au milieu (x = 0), et la cheminée derrière à droite
  put('cabin-roof-snow', 0.5, 1, 0.5, 0)
  put('cabin-roof-snow-chimney', 0.5, 1, -0.5, 0)
  put('cabin-roof-snow', -0.5, 1, 0.5, P)
  put('cabin-roof-snow', -0.5, 1, -0.5, P)
  // Le haut de la cheminée : le point le plus haut de sa pièce, côté cheminée
  return { obj: g, chimney: new T.Vector3(0.3, 2.45, -0.45) }
}

/** Pose tout le décor ; les modèles arrivent en arrière-plan (le jeu n'attend pas). */
export function winterScene(stage: Stage, o: {
  /** Le matériau du sol (neige), pour les collines. */
  snowMat: import('three').Material
}): Winter {
  const { T, scene } = stage
  const sky = skyDome(T)
  scene.add(sky.mesh)
  scene.background = new T.Color(WINTER_SKY.horizon)
  mountains(T, scene)
  hills(T, scene, o.snowMat)

  const dot = stage.keep(dotTex(T))
  const starPts = stars(T, dot)
  starPts.forEach(p => scene.add(p))
  const mn = moon(T)
  stage.keep(mn.t)
  scene.add(mn.s)
  const au = aurora(T)
  scene.add(au.m)
  const cTex = stage.keep(cloudTex(T))
  const cloudList = clouds(T, cTex)
  cloudList.forEach(c => scene.add(c))

  // Tourné vers la caméra de la Tour (qui regarde −z depuis z ≈ 8)
  const faceCam = (x: number, z: number) => Math.atan2(-x, 8 - z)

  /* Où vivent les éléments du décor (le reste = sapins) */
  const CABIN = { x: -7.2, z: -15, s: 1.9 }
  const spots: { model: string; x: number; z: number; size: number; rot?: number; shade?: number }[] = ([
    { model: 'holiday/tree-decorated-snow', x: CABIN.x + 4.1, z: CABIN.z + 0.4, size: 3.4, rot: 0.4 },
    { model: 'holiday/sled', x: CABIN.x + 2.7, z: CABIN.z + 3.2, size: 1.1, rot: 0.9 },
    { model: 'holiday/bench', x: CABIN.x - 2.2, z: CABIN.z + 3.3, size: 1.25, rot: faceCam(CABIN.x - 2.2, CABIN.z + 3.3) },
    { model: 'holiday/reindeer', x: 6.2, z: -10.5, size: 1.5, rot: -2.2 },
    { model: 'holiday/reindeer', x: 8.2, z: -13, size: 1.2, rot: -1.2 },
    { model: 'holiday/rocks-large', x: 7.6, z: -9.5, size: 2 },
    { model: 'holiday/rocks-medium', x: -5.8, z: -7.2, size: 1.3 },
    { model: 'holiday/snow-bunker', x: 4.2, z: -12, size: 2 },
    { model: 'holiday/snow-pile', x: 3.4, z: -5.2, size: 1.2 },
    { model: 'holiday/snow-pile', x: -3.2, z: -6, size: 1 },
    { model: 'holiday/snow-flat-large', x: CABIN.x + 0.3, z: CABIN.z + 3.4, size: 4.2, rot: 0.3 }
  ] as { model: string; x: number; z: number; size: number; rot?: number }[]).map(it => ({ ...it, shade: SHADE }))
  const LANTERNS: [number, number][] = [[CABIN.x + 1.6, CABIN.z + 4.1], [1.6, -8.4], [5.2, -7.5]]
  for (const [x, z] of LANTERNS) spots.push({ model: 'holiday/lantern', x, z, size: 1.9, rot: 0, shade: SHADE })
  for (let i = 0; i < 4; i++) {
    const x = CABIN.x - 2.6 + i * 1.28, z = CABIN.z + 4.6
    spots.push({ model: 'holiday/cabin-fence', x, z, size: 1.3, rot: 0, shade: SHADE })
  }

  // Sapins : une forêt derrière et sur les côtés, jamais devant la caméra ni
  // juste derrière la tour, ni sur le chalet et les autres éléments
  const busy: [number, number, number][] = [[CABIN.x, CABIN.z, 4.4], ...spots.map(s => [s.x, s.z, Math.max(1.2, s.size * 0.8)] as [number, number, number])]
  const free = (x: number, z: number) =>
    z < -4 && !(Math.abs(x) < 2.6 && z > -13) && busy.every(([bx, bz, br]) => Math.hypot(x - bx, z - bz) > br + 0.9)
  const trees = [...ring(40, 9, 20, [Math.PI * 1.02, Math.PI * 1.98]), ...ring(30, 22, 34, [Math.PI * 1.05, Math.PI * 1.95])]
    .filter(([x, z]) => free(x, z))
  const treeItems = trees.map(([x, z], i) => ({
    model: `holiday/tree-snow-${['a', 'b', 'c'][i % 3]}`, x, z, size: 1.8 + Math.random() * 1.9 + Math.hypot(x, z) * 0.04
  }))

  const smoke = puffs(stage)

  Promise.all([
    decor(stage, [...treeItems, ...spots]),
    cabin(T)
  ]).then(([, cab]) => {
    if (!stage.alive) return
    const house = cab.obj
    house.scale.setScalar(CABIN.s)
    house.position.set(CABIN.x, 0, CABIN.z)
    house.rotation.y = faceCam(CABIN.x, CABIN.z)
    scene.add(house)
    house.updateMatrixWorld(true)
    smoke.from.copy(cab.chimney).applyMatrix4(house.matrixWorld)
    glows.forEach(g => { g.visible = true })
  }).catch(() => { /* sans décor, le jeu tourne */ })

  // Halos chauds des lanternes (le haut de la lanterne, là où est la flamme)
  const halo = dotTex(T, '#FFD58A')
  stage.keep(halo)
  const glows = LANTERNS.map(([x, z]) => {
    const s = new T.Sprite(new T.SpriteMaterial({ map: halo, transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending }))
    s.position.set(x, 1.62, z)
    s.scale.setScalar(0.5)
    s.visible = false   // allumés quand les lanternes sont arrivées
    scene.add(s)
    return s
  })

  /* L'heure : on retrouve les lumières posées par createStage */
  const hemi = scene.children.find(x => (x as import('three').HemisphereLight).isHemisphereLight) as import('three').HemisphereLight | undefined
  const hemiK = hemi ? hemi.intensity / HOURS[0].hemi[2] : 0.32
  const ca = new T.Color(), cb = new T.Color()
  const mixHex = (a: string, b: string, t: number, out: import('three').Color) => out.copy(ca.set(a)).lerp(cb.set(b), t)
  let dusk = -1
  let glowK = 1

  const out: Winter = {
    setDusk(k) {
      k = Math.max(0, Math.min(1, k))
      if (Math.abs(k - dusk) < 0.002) return
      dusk = k
      let i = 0
      while (i < HOURS.length - 2 && k > HOURS[i + 1].at) i++
      const a = HOURS[i], b = HOURS[i + 1]
      const t = (k - a.at) / (b.at - a.at)
      mixHex(a.top, b.top, t, sky.u.uTop.value)
      mixHex(a.mid, b.mid, t, sky.u.uMid.value)
      mixHex(a.hor, b.hor, t, sky.u.uHor.value)
      ;(scene.background as import('three').Color).copy(sky.u.uHor.value)
      if (scene.fog) scene.fog.color.copy(sky.u.uHor.value)
      if (stage.sun) {
        mixHex(a.sun, b.sun, t, stage.sun.color)
        stage.sun.intensity = a.sunI + (b.sunI - a.sunI) * t
      }
      if (hemi) {
        mixHex(a.hemi[0], b.hemi[0], t, hemi.color)
        mixHex(a.hemi[1], b.hemi[1], t, hemi.groundColor)
        hemi.intensity = (a.hemi[2] + (b.hemi[2] - a.hemi[2]) * t) * hemiK
      }
      scene.environmentIntensity = a.env + (b.env - a.env) * t
      const cloud = mixHex(a.cloud, b.cloud, t, new T.Color())
      const night = Math.max(0, Math.min(1, (k - 0.62) / 0.33))
      cloudList.forEach(c => {
        const m = c.material as import('three').SpriteMaterial
        m.color.copy(cloud)
        m.opacity = 1 - night * 0.55   // la nuit, ils s'effacent devant l'aurore
      })
      starPts.forEach(p => { (p.material as import('three').PointsMaterial).opacity = night })
      ;(mn.s.material as import('three').SpriteMaterial).opacity = night
      au.u.uAlpha.value = Math.max(0, Math.min(1, (k - 0.8) / 0.2)) * 0.9
      au.m.visible = au.u.uAlpha.value > 0
      glowK = 1 + Math.max(0, (k - 0.4) / 0.6) * 1.6
    },
    update(dt, t) {
      smoke.update(dt)
      au.u.uTime.value = t
      glows.forEach((g, i) => {
        const f = 0.85 + Math.sin(t * 5.3 + i * 1.7) * 0.06 + Math.sin(t * 11 + i) * 0.04
        g.scale.setScalar(0.5 * f * (0.8 + glowK * 0.35))
        ;(g.material as import('three').SpriteMaterial).opacity = Math.min(1, 0.45 * glowK)
      })
    }
  }
  out.setDusk(0)
  return out
}

/* La fumée de la cheminée : quelques bouffées recyclées qui montent, grossissent
   et s'effacent, poussées par un petit vent. */
function puffs(stage: Stage) {
  const { T, scene } = stage
  const tex = dotTex(T, '#FFFFFF')
  stage.keep(tex)
  const N = 14
  const from = new T.Vector3(1e4, 0, 0)
  const list: { s: import('three').Sprite; age: number; life: number }[] = []
  for (let i = 0; i < N; i++) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, color: 0xE6E9EE, transparent: true, opacity: 0, depthWrite: false }))
    scene.add(s)
    list.push({ s, age: (i / N) * 4.2, life: 4.2 })
  }
  return {
    from,
    update(dt: number) {
      for (const p of list) {
        p.age += dt
        if (p.age > p.life) p.age -= p.life
        const k = p.age / p.life
        p.s.position.set(from.x + k * 2.6 + Math.sin(p.age * 1.3) * 0.12, from.y + k * 2.2, from.z + k * 0.6)
        p.s.scale.setScalar(0.4 + k * 1.3)
        ;(p.s.material as import('three').SpriteMaterial).opacity = from.x > 1e3 ? 0 : Math.min(1, k * 6) * (1 - k) * (1 - k) * 0.5
      }
    }
  }
}
