import type { Stage } from './three3d'
import { disposeTree } from './three3d'
import type { Particles } from './scene3d'

/* Les décors du château (27/09), en vraie 3D — une maison de poupée avec
   laquelle on joue : on allume le lustre, on ouvre les rideaux, on fait
   tomber la nuit (feu d'artifice par les fenêtres), on fait jaillir la
   fontaine, fleurir les rosiers, se poser un papillon sur la princesse. Une
   porte (ou l'arche de roses) mène d'un décor à l'autre.

   La salle est construite à l'échelle réelle puis réduite (0,62) : l'estrade,
   elle, garde la taille de la princesse. Couleurs sombres à la source (ACES). */

type Obj3 = import('three').Object3D
type Grp = import('three').Group
type V3 = import('three').Vector3
type Tex = import('three').Texture

export type DecorId = 'bal' | 'jardin'
export type DecorAction = 'lustre' | 'rideau' | 'bouquet' | 'fenetre' | 'porte' | 'fontaine' | 'rosier' | 'papillon' | 'lanterne'

export interface Decor {
  id: DecorId
  group: Grp
  /** Hauteur de l'estrade sous la princesse. */
  floorY: number
  night: boolean
  /** Ce que fait un objet touché (null : rien). */
  actionOf(o: Obj3): { act: DecorAction; obj: Obj3 } | null
  /** Joue l'action. Pour le papillon, `at` est l'endroit où il va se poser. */
  act(a: DecorAction, obj: Obj3, at: V3): void
  setNight(n: boolean): void
  update(dt: number): void
  dispose(): void
}

function cv(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  draw(c.getContext('2d')!)
  return c
}

/** Le ciel peint : jour (nuages) ou nuit (étoiles, lune). */
function skyCanvas(night: boolean, w = 512, h = 512, tower = false) {
  return cv(w, h, g => {
    const gr = g.createLinearGradient(0, 0, 0, h)
    if (night) { gr.addColorStop(0, '#0E1440'); gr.addColorStop(0.7, '#2A2F6E'); gr.addColorStop(1, '#4A3F7A') }
    else { gr.addColorStop(0, '#6FAEE6'); gr.addColorStop(0.7, '#CFE6F6'); gr.addColorStop(1, '#F6E6D8') }
    g.fillStyle = gr; g.fillRect(0, 0, w, h)
    let s = night ? 5 : 9
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
    if (night) {
      for (let i = 0; i < 140; i++) {
        g.fillStyle = `rgba(255,255,240,${0.4 + rnd() * 0.6})`
        g.beginPath(); g.arc(rnd() * w, rnd() * h * 0.8, 0.6 + rnd() * 1.6, 0, Math.PI * 2); g.fill()
      }
      g.fillStyle = '#FFF6D8'
      g.beginPath(); g.arc(w * 0.72, h * 0.2, w * 0.07, 0, Math.PI * 2); g.fill()
      g.fillStyle = night ? '#1B2258' : '#fff'
      g.beginPath(); g.arc(w * 0.75, h * 0.18, w * 0.065, 0, Math.PI * 2); g.fill()
    } else {
      g.fillStyle = 'rgba(255,255,255,.85)'
      for (let i = 0; i < 6; i++) {
        const x = rnd() * w, y = h * (0.15 + rnd() * 0.35), r = w * (0.04 + rnd() * 0.05)
        for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + (k - 1.5) * r * 0.8, y + Math.sin(k * 2) * r * 0.2, r * (0.7 + (k % 2) * 0.3), 0, Math.PI * 2); g.fill() }
      }
    }
    if (tower) {
      g.fillStyle = night ? '#3A3F78' : '#B9C7DD'
      g.fillRect(w * 0.58, h * 0.7, w * 0.16, h * 0.3)
      g.beginPath(); g.moveTo(w * 0.56, h * 0.7); g.lineTo(w * 0.66, h * 0.58); g.lineTo(w * 0.76, h * 0.7); g.fill()
      if (night) { g.fillStyle = '#FFD27A'; g.fillRect(w * 0.64, h * 0.78, w * 0.04, h * 0.06) }
    }
  })
}

export function makeDecor(stage: Stage, id: DecorId, fx: Particles): Decor {
  return id === 'bal' ? ballroom(stage, fx) : garden(stage, fx)
}

/* ---- Réglage de la lumière pour le jour et la nuit ---- */
function lights(stage: Stage, night: boolean, indoor: boolean) {
  const { T, scene } = stage
  const hemi = scene.children.find(o => (o as import('three').HemisphereLight).isHemisphereLight) as import('three').HemisphereLight | undefined
  if (stage.sun) {
    stage.sun.color.set(night ? '#9FB0FF' : '#FFF1D0')
    stage.sun.intensity = night ? (indoor ? 1.1 : 0.7) : 2.1
  }
  if (hemi) {
    hemi.color.set(night ? '#6A74C8' : '#FFF4FA')
    hemi.intensity = night ? 0.22 : 0.32
  }
  scene.environmentIntensity = night ? (indoor ? 0.45 : 0.3) : 0.6
  if (!indoor) {
    const bg = new T.Color(night ? '#1B2258' : '#BFE0F4')
    if (scene.fog) scene.fog.color = bg
  }
}

/* =====================================================================
   La salle de bal
   ===================================================================== */
function ballroom(stage: Stage, fx: Particles): Decor {
  const { T } = stage
  const group = new T.Group()
  stage.scene.add(group)
  const room = new T.Group()
  room.scale.setScalar(0.62)
  group.add(room)
  const texs: Tex[] = []
  const tex = (c: HTMLCanvasElement, rep?: number) => {
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8
    if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep, rep) }
    texs.push(t); return t
  }
  const std = (o: import('three').MeshStandardMaterialParameters, dim = 1) => { const m = new T.MeshStandardMaterial(o); if (dim !== 1) m.color.multiplyScalar(dim); return m }
  const phys = (o: import('three').MeshPhysicalMaterialParameters) => new T.MeshPhysicalMaterial(o)
  const act = (o: Obj3, a: DecorAction) => { o.traverse(x => { x.userData.decor = a }); o.userData.decorRoot = true; return o }

  /* --- Sol : damier de marbre crème et rose, veiné --- */
  const marble = tex(cv(1024, 1024, g => {
    const n = 4, s = 1024 / n
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 ? '#E9D3D6' : '#F6EEE6'; g.fillRect(i * s, j * s, s, s) }
    let q = 3
    const rnd = () => { q = (q * 16807) % 2147483647; return q / 2147483647 }
    for (let k = 0; k < 60; k++) {
      g.strokeStyle = `rgba(160,130,140,${0.05 + rnd() * 0.08})`; g.lineWidth = 0.5 + rnd() * 1.5
      g.beginPath()
      let x = rnd() * 1024, y = rnd() * 1024
      g.moveTo(x, y)
      for (let p = 0; p < 6; p++) { x += (rnd() - 0.3) * 120; y += (rnd() - 0.5) * 120; g.lineTo(x, y) }
      g.stroke()
    }
    g.strokeStyle = 'rgba(180,150,120,.35)'; g.lineWidth = 3
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 1024); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(1024, i * s); g.stroke() }
  }), 6)
  const floor = new T.Mesh(new T.PlaneGeometry(24, 24), phys({ map: marble, roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.15 }))
  ;(floor.material as import('three').MeshPhysicalMaterial).color.multiplyScalar(0.8)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  room.add(floor)

  /* --- L'estrade et son tapis de velours, bordé d'or (taille réelle) --- */
  const gold = std({ color: 0xE0AE48, metalness: 1, roughness: 0.3 })
  const dais = new T.Mesh(new T.CylinderGeometry(0.92, 0.96, 0.08, 72), phys({ color: 0xE6DCD8, roughness: 0.3, clearcoat: 0.5 }))
  dais.position.y = 0.04; dais.receiveShadow = true; dais.castShadow = true
  group.add(dais)
  const rug = new T.Mesh(new T.CylinderGeometry(0.84, 0.84, 0.012, 72), phys({ color: 0xA8354E, roughness: 0.85, sheen: 1, sheenRoughness: 0.5, sheenColor: new T.Color(0xF2A0B8) }))
  rug.position.y = 0.086; rug.receiveShadow = true
  group.add(rug)
  for (const [r, y, w] of [[0.94, 0.08, 0.016], [0.78, 0.093, 0.006]]) {
    const ring = new T.Mesh(new T.TorusGeometry(r, w, 8, 96), gold)
    ring.rotation.x = Math.PI / 2; ring.position.y = y
    group.add(ring)
  }

  /* --- Mur, fenêtres en arc (l'une est une porte vitrée vers le jardin), colonnes --- */
  const WZ = -3.2
  const wall = new T.Mesh(new T.PlaneGeometry(24, 9), std({ color: 0xD9A9B4, roughness: 0.9 }, 0.8))
  wall.position.set(0, 4.5, WZ); wall.receiveShadow = true
  room.add(wall)
  const base = new T.Mesh(new T.BoxGeometry(24, 0.18, 0.08), std({ color: 0xF2E6DC, roughness: 0.5 }))
  base.position.set(0, 0.09, WZ + 0.04)
  room.add(base)
  const white = phys({ color: 0xF2ECE8, roughness: 0.35, clearcoat: 0.3 })
  white.color.multiplyScalar(0.9)
  for (const x of [-2.8, 0, 2.8]) {
    const pts = [[-0.55, 0], [0.55, 0], [0.55, 1.5], [-0.55, 1.5], [-0.55, 0]].map(([a, b]) => new T.Vector3(a, b, 0))
    const fr = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts, false, 'catmullrom', 0), 40, 0.025, 6), gold)
    fr.position.set(x, 2.2, WZ + 0.02)
    room.add(fr)
    const inner = new T.Mesh(new T.PlaneGeometry(1.1, 1.5), std({ color: 0xE7BFC8, roughness: 0.8 }, 0.8))
    inner.position.set(x, 2.95, WZ + 0.015)
    room.add(inner)
  }
  const skyDay = tex(skyCanvas(false, 256, 512, true)), skyNight = tex(skyCanvas(true, 256, 512, true))
  const gardenView = tex(cv(256, 512, g => {
    const gr = g.createLinearGradient(0, 0, 0, 512)
    gr.addColorStop(0, '#7FB6E8'); gr.addColorStop(0.55, '#CFE6F6'); gr.addColorStop(0.56, '#6FA84E'); gr.addColorStop(1, '#4E8A3A')
    g.fillStyle = gr; g.fillRect(0, 0, 256, 512)
    g.fillStyle = '#3E7A3A'
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(20 + i * 45, 290, 30, 0, Math.PI * 2); g.fill() }
    g.fillStyle = '#E88AA0'
    for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(15 + i * 18, 285 + (i % 3) * 8, 5, 0, Math.PI * 2); g.fill() }
  }))
  const winGeo = (() => {
    const s = new T.Shape()
    const w = 0.7, h = 2.2
    s.moveTo(-w, 0); s.lineTo(-w, h); s.absarc(0, h, w, Math.PI, 0, true); s.lineTo(w, 0); s.lineTo(-w, 0)
    const geo = new T.ShapeGeometry(s, 24)
    const p = geo.attributes.position as import('three').BufferAttribute
    const uv = geo.attributes.uv as import('three').BufferAttribute
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + 0.7) / 1.4, p.getY(i) / 2.9)
    return geo
  })()
  const frameGeo = (() => {
    const pts: V3[] = [new T.Vector3(-0.7, 0, 0), new T.Vector3(-0.7, 2.2, 0)]
    for (let k = 0; k <= 20; k++) { const a = Math.PI - (k / 20) * Math.PI; pts.push(new T.Vector3(Math.cos(a) * 0.7, 2.2 + Math.sin(a) * 0.7, 0)) }
    pts.push(new T.Vector3(0.7, 0, 0))
    return new T.TubeGeometry(new T.CatmullRomCurve3(pts, false, 'catmullrom', 0.02), 80, 0.05, 8)
  })()
  const glassMats: import('three').MeshBasicMaterial[] = []
  const windows: { x: number; door: boolean }[] = [{ x: -4.2, door: false }, { x: -1.4, door: false }, { x: 1.4, door: true }, { x: 4.2, door: false }]
  const fireSpots: V3[] = []
  for (const w of windows) {
    const win = new T.Group()
    const glass = new T.MeshBasicMaterial({ map: w.door ? gardenView : skyDay, toneMapped: false })
    if (!w.door) glassMats.push(glass)
    win.add(new T.Mesh(winGeo, glass))
    const fr = new T.Mesh(frameGeo, gold); fr.position.z = 0.01; win.add(fr)
    const bar = new T.Mesh(new T.BoxGeometry(0.03, 2.85, 0.02), gold); bar.position.set(0, 1.45, 0.02); win.add(bar)
    for (const y of w.door ? [1.2, 2.35] : [0.8, 1.6, 2.35]) { const b = new T.Mesh(new T.BoxGeometry(1.4, 0.03, 0.02), gold); b.position.set(0, y, 0.02); win.add(b) }
    if (w.door) {
      // Une porte vitrée : deux battants, deux poignées
      for (const s of [-1, 1]) { const k = new T.Mesh(new T.SphereGeometry(0.05, 12, 10), gold); k.position.set(s * 0.1, 1.1, 0.06); win.add(k) }
      win.position.set(w.x, 0.02, WZ + 0.01)
      act(win, 'porte')
    } else {
      const sill = new T.Mesh(new T.BoxGeometry(1.7, 0.08, 0.2), white); sill.position.set(0, -0.02, 0.08); win.add(sill)
      win.position.set(w.x, 1.1, WZ + 0.01)
      act(win, 'fenetre')
      fireSpots.push(new T.Vector3(w.x * 0.62, (1.1 + 1.9) * 0.62, (WZ + 0.08) * 0.62))
    }
    room.add(win)
    const beam = new T.Mesh(new T.PlaneGeometry(1.3, 3.2), new T.MeshBasicMaterial({ color: 0xFFF3D8, transparent: true, opacity: 0.16, depthWrite: false }))
    beam.rotation.x = -Math.PI / 2; beam.position.set(w.x * 1.05, 0.004, WZ + 1.9)
    beam.userData.beam = true
    room.add(beam)
  }
  const shaft = new T.CylinderGeometry(0.2, 0.22, 4.6, 24, 1)
  {
    const p = shaft.attributes.position as import('three').BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), a = Math.atan2(x, z)
      const f = 1 - 0.04 * Math.max(0, Math.cos(a * 12))
      p.setXYZ(i, x * f, p.getY(i), z * f)
    }
    shaft.computeVertexNormals()
  }
  const capGeo = new T.LatheGeometry([[0.001, 0], [0.34, 0], [0.34, 0.1], [0.28, 0.14], [0.3, 0.2], [0.24, 0.26], [0.2, 0.3], [0.001, 0.3]].map(([r, y]) => new T.Vector2(r, y)), 32)
  for (const x of [-5.6, -2.8, 0, 2.8, 5.6]) {
    const c = new T.Group()
    const sh = new T.Mesh(shaft, white); sh.position.y = 2.6; sh.castShadow = true; sh.receiveShadow = true; c.add(sh)
    c.add(new T.Mesh(capGeo, white))
    const top = new T.Mesh(capGeo, white); top.rotation.x = Math.PI; top.position.y = 5.2; c.add(top)
    for (const y of [0.32, 4.88]) { const ring = new T.Mesh(new T.TorusGeometry(0.215, 0.018, 8, 32), gold); ring.rotation.x = Math.PI / 2; ring.position.y = y; c.add(ring) }
    c.position.set(x, 0, WZ + 0.35)
    room.add(c)
  }

  /* --- Rideaux drapés : on les ouvre et on les ferme --- */
  const curtainMat = phys({ color: 0xB84A68, roughness: 0.7, sheen: 1, sheenRoughness: 0.4, sheenColor: new T.Color(0xF7B8CC), side: T.DoubleSide })
  const curtains: { mesh: import('three').Mesh; base: Float32Array; side: number; open: number; goal: number }[] = []
  const curtain = (x: number, side: number) => {
    const geo = new T.PlaneGeometry(1.6, 6.2, 40, 50)
    const base = (geo.attributes.position.array as Float32Array).slice()
    const m = new T.Mesh(geo, curtainMat)
    m.position.set(x, 3.1, WZ + 0.6)
    m.castShadow = true
    act(m, 'rideau')
    room.add(m)
    const c = { mesh: m, base, side, open: 1, goal: 1 }
    curtains.push(c)
    shapeCurtain(c)
    const rope = new T.Mesh(new T.TorusGeometry(0.16, 0.03, 8, 24), gold)
    rope.position.set(x - side * 0.1, 1.86, WZ + 0.7); rope.rotation.y = 0.3 * side
    room.add(rope)
  }
  /** Le rideau pincé à l'embrasse : `open` 1 = tiré sur le côté, 0 = fermé (déplié). */
  function shapeCurtain(c: { mesh: import('three').Mesh; base: Float32Array; side: number; open: number }) {
    const p = c.mesh.geometry.attributes.position as import('three').BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const px = c.base[i * 3], py = c.base[i * 3 + 1]
      const v = (py + 3.1) / 6.2
      const tie = 0.3
      const pinchOpen = v < tie ? 0.45 + (tie - v) * 1.6 : 0.45 + Math.pow((v - tie) / (1 - tie), 1.2) * 0.55
      const pinch = lerp(1.25, pinchOpen, c.open)
      const x2 = (px + c.side * 0.8) * pinch - c.side * 0.8
      const z = Math.sin(px * 9 + v * 1.5) * 0.07 * (0.6 + pinch * 0.5)
      p.setXYZ(i, x2, py, z)
    }
    p.needsUpdate = true
    c.mesh.geometry.computeVertexNormals()
  }
  curtain(-6.6, -1); curtain(6.6, 1); curtain(-3.6, 1); curtain(3.6, -1)

  /* --- Le lustre de cristal : on l'allume, il se balance --- */
  const ch = new T.Group()
  const crystal = phys({ color: 0xF4F8FF, roughness: 0.02, clearcoat: 1, iridescence: 0.6, transparent: true, opacity: 0.85 })
  const flameMat = new T.MeshBasicMaterial({ color: 0xFFD27A })
  const flames: Obj3[] = []
  for (const [r, y, n] of [[0.9, 0, 12], [0.55, 0.45, 8]] as [number, number, number][]) {
    const ring = new T.Mesh(new T.TorusGeometry(r, 0.03, 8, 64), gold)
    ring.rotation.x = Math.PI / 2; ring.position.y = y
    ch.add(ring)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r
      const candle = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 0.16, 10), std({ color: 0xF6EFE4, roughness: 0.6 }))
      candle.position.set(cx, y + 0.1, cz); ch.add(candle)
      const f = new T.Mesh(new T.SphereGeometry(0.03, 10, 8), flameMat); f.scale.y = 1.7; f.position.set(cx, y + 0.21, cz); ch.add(f)
      flames.push(f)
      for (let k = 0; k < 3; k++) {
        const d = new T.Mesh(new T.OctahedronGeometry(0.035 - k * 0.006, 0), crystal)
        d.scale.y = 1.8; d.position.set(cx, y - 0.08 - k * 0.1, cz); ch.add(d)
      }
    }
  }
  const stem = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 2.4, 10), gold); stem.position.y = 1.4; ch.add(stem)
  const ball = new T.Mesh(new T.SphereGeometry(0.14, 20, 14), gold); ball.position.y = 0.1; ch.add(ball)
  ch.position.set(-1.9, 2.95, -1.3)
  ch.scale.setScalar(0.8)
  act(ch, 'lustre')
  room.add(ch)
  const glow = new T.PointLight(0xFFD9A0, 4, 6, 1.6)
  glow.position.set(-1.9 * 0.62, 2.8 * 0.62, -1.3 * 0.62)
  group.add(glow)
  let lit = true, swing = 0

  /* --- Deux bouquets au pied des colonnes --- */
  const vaseProfile = [[0.001, 0], [0.16, 0], [0.2, 0.15], [0.14, 0.38], [0.18, 0.46], [0.001, 0.46]].map(([r, y]) => new T.Vector2(r, y))
  const cols = [0xD8567A, 0xF3EEF2, 0xE9A2B8, 0xC23A5E]
  const vases: Grp[] = []
  for (const x of [-2.1, 2.1]) {
    const v = new T.Group()
    const body = new T.Mesh(new T.LatheGeometry(vaseProfile, 32), white); body.castShadow = true; v.add(body)
    for (let i = 0; i < 16; i++) {
      const a = i * 2.4, r = 0.05 + (i % 4) * 0.045
      const f = new T.Mesh(new T.SphereGeometry(0.07, 14, 10), std({ color: cols[i % 4], roughness: 0.7 }, 0.85))
      f.position.set(Math.cos(a) * r, 0.58 + (3 - (i % 4)) * 0.05, Math.sin(a) * r)
      v.add(f)
    }
    for (let i = 0; i < 8; i++) {
      const l = new T.Mesh(new T.SphereGeometry(0.06, 10, 8), std({ color: 0x3E7A4A, roughness: 0.7 }))
      l.scale.set(1, 0.4, 0.6); const a = i * 0.8
      l.position.set(Math.cos(a) * 0.2, 0.5, Math.sin(a) * 0.2)
      v.add(l)
    }
    v.position.set(x, 0, WZ + 0.9)
    act(v, 'bouquet')
    room.add(v)
    vases.push(v)
  }

  let night = false, fireIn = 0
  const d: Decor = {
    id: 'bal', group, floorY: 0.092,
    get night() { return night },
    actionOf(o) {
      for (let x: Obj3 | null = o; x; x = x.parent) {
        if (x.userData.decorRoot) return { act: x.userData.decor as DecorAction, obj: x }
        if (x === group) break
      }
      return null
    },
    act(a, obj, at) {
      if (a === 'lustre') {
        lit = !lit
        swing = 1
        flames.forEach(f => { f.visible = lit })
        glow.intensity = lit ? (night ? 7 : 4) : 0
        fx.burst(at, { count: 30, color: ['#FFF6D8', '#BFE8FF', '#FFFFFF'], speed: 1.2, spread: 1, life: 1, size: 0.07, gravity: 0.6 })
      } else if (a === 'rideau') {
        const c = curtains.find(k => k.mesh === obj)
        if (c) c.goal = c.goal > 0.5 ? 0 : 1
      } else if (a === 'bouquet') {
        fx.burst(at, { count: 36, color: ['#E9A2B8', '#D8567A', '#FFFFFF'], speed: 1.4, spread: 1.2, life: 1.4, size: 0.06, gravity: 0.9 })
        obj.scale.setScalar(1.12)
      } else if (a === 'fenetre') {
        d.setNight(!night)
      }
    },
    setNight(n) {
      night = n
      glassMats.forEach(m => { m.map = n ? skyNight : skyDay; m.needsUpdate = true })
      room.children.forEach(c => { if (c.userData.beam) c.visible = !n })
      if (n && !lit) { lit = true; flames.forEach(f => { f.visible = true }) }
      glow.intensity = lit ? (n ? 7 : 4) : 0
      lights(stage, n, true)
      fireIn = 0.3
    },
    update(dt) {
      // Le lustre se balance puis s'arrête
      if (swing > 0) { swing = Math.max(0, swing - dt * 0.35); ch.rotation.z = Math.sin(swing * 18) * 0.06 * swing }
      if (lit) flames.forEach((f, i) => { f.scale.y = 1.6 + Math.sin(performance.now() / 90 + i) * 0.15 })
      for (const c of curtains) {
        if (Math.abs(c.open - c.goal) > 0.001) {
          c.open += Math.sign(c.goal - c.open) * Math.min(Math.abs(c.goal - c.open), dt * 1.4)
          shapeCurtain(c)
        }
      }
      vases.forEach(v => { if (v.scale.x > 1) v.scale.setScalar(Math.max(1, v.scale.x - dt * 0.4)) })
      // La nuit : un feu d'artifice dans une fenêtre, de temps en temps
      if (night) {
        fireIn -= dt
        if (fireIn < 0) {
          fireIn = 0.9 + Math.random() * 1.2
          const s = fireSpots[Math.floor(Math.random() * fireSpots.length)]
          const c = ['#FF6B81', '#FFD34D', '#6FB6EA', '#B79AE8', '#8CCB6A'][Math.floor(Math.random() * 5)]
          fx.burst({ x: s.x + (Math.random() - 0.5) * 0.3, y: s.y + (Math.random() - 0.5) * 0.3, z: s.z }, { count: 26, color: [c, '#FFFFFF'], speed: 0.5, spread: 1, life: 1.1, size: 0.05, gravity: 0.25 })
        }
      }
    },
    dispose() {
      lights(stage, false, true)
      disposeTree(T, group)
      texs.forEach(t => t.dispose())
      group.removeFromParent()
    }
  }
  return d
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/* =====================================================================
   Le jardin du château
   ===================================================================== */
function garden(stage: Stage, fx: Particles): Decor {
  const { T, scene } = stage
  const group = new T.Group()
  scene.add(group)
  const texs: Tex[] = []
  const tex = (c: HTMLCanvasElement, rep?: number) => {
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8
    if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep, rep) }
    texs.push(t); return t
  }
  const std = (o: import('three').MeshStandardMaterialParameters, dim = 1) => { const m = new T.MeshStandardMaterial(o); if (dim !== 1) m.color.multiplyScalar(dim); return m }
  const act = (o: Obj3, a: DecorAction) => { o.traverse(x => { x.userData.decor = a }); o.userData.decorRoot = true; return o }
  const oldBg = scene.background
  const skyDay = tex(skyCanvas(false, 1024, 512)), skyNight = tex(skyCanvas(true, 1024, 512))
  scene.background = skyDay

  /* --- Pelouse, allée, estrade de pierre blanche --- */
  const grass = tex(cv(512, 512, g => {
    g.fillStyle = '#5F9E48'; g.fillRect(0, 0, 512, 512)
    let q = 4
    const rnd = () => { q = (q * 16807) % 2147483647; return q / 2147483647 }
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(40,90,30,.25)' : 'rgba(150,200,90,.2)'
      g.fillRect(rnd() * 512, rnd() * 512, 2, 5)
    }
  }), 10)
  const lawn = new T.Mesh(new T.CircleGeometry(30, 64), std({ map: grass, roughness: 0.95 }, 0.9))
  lawn.rotation.x = -Math.PI / 2; lawn.receiveShadow = true
  group.add(lawn)
  const path = new T.Mesh(new T.PlaneGeometry(1.4, 12), std({ color: 0xE3CFA8, roughness: 0.9 }, 0.85))
  path.rotation.x = -Math.PI / 2; path.position.set(0, 0.003, -6.5)
  path.receiveShadow = true
  group.add(path)
  const stone = std({ color: 0xF0EAE2, roughness: 0.45 }, 0.9)
  const gold = std({ color: 0xE0AE48, metalness: 1, roughness: 0.3 })
  const dais = new T.Mesh(new T.CylinderGeometry(0.92, 0.98, 0.06, 72), stone)
  dais.position.y = 0.03; dais.castShadow = true; dais.receiveShadow = true
  group.add(dais)
  const rim = new T.Mesh(new T.TorusGeometry(0.95, 0.014, 8, 96), gold)
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.06
  group.add(rim)

  /* --- Le château au fond : tours roses, toits bleus pointus, fanions --- */
  const castle = new T.Group()
  const pink = std({ color: 0xE9B8C4, roughness: 0.8 }, 0.85)
  const roof = std({ color: 0x4F74C8, roughness: 0.5 }, 0.8)
  const winM = std({ color: 0x2A3A6E, roughness: 0.4, emissive: 0x000000 })
  const keep = new T.Mesh(new T.BoxGeometry(3.2, 2.4, 1.4), pink); keep.position.y = 1.2; castle.add(keep)
  for (let i = -3; i <= 3; i++) { const b = new T.Mesh(new T.BoxGeometry(0.3, 0.3, 1.4), pink); b.position.set(i * 0.45, 2.55, 0); castle.add(b) }
  const gate = new T.Mesh(new T.CylinderGeometry(0.45, 0.45, 0.1, 24, 1, false, 0, Math.PI), winM); gate.rotation.x = Math.PI / 2; gate.rotation.z = Math.PI; gate.position.set(0, 0.9, 0.72); castle.add(gate)
  const gateLow = new T.Mesh(new T.BoxGeometry(0.9, 0.9, 0.1), winM); gateLow.position.set(0, 0.45, 0.72); castle.add(gateLow)
  const windowsLit: import('three').MeshStandardMaterial = winM
  const tower = (x: number, z: number, r: number, h: number) => {
    const t = new T.Group()
    const body = new T.Mesh(new T.CylinderGeometry(r, r * 1.05, h, 28), pink); body.position.y = h / 2; t.add(body)
    const top = new T.Mesh(new T.ConeGeometry(r * 1.35, r * 2.6, 28), roof); top.position.y = h + r * 1.3; t.add(top)
    const pole = new T.Mesh(new T.CylinderGeometry(0.015, 0.015, 0.5, 6), gold); pole.position.y = h + r * 2.6 + 0.2; t.add(pole)
    const flag = new T.Mesh(new T.PlaneGeometry(0.35, 0.2), std({ color: 0xE0607E, roughness: 0.6, side: T.DoubleSide }, 0.85)); flag.position.set(0.18, h + r * 2.6 + 0.35, 0); t.add(flag)
    for (const y of [h * 0.45, h * 0.75]) {
      const w = new T.Mesh(new T.PlaneGeometry(r * 0.5, r * 0.8), winM); w.position.set(0, y, r + 0.005); t.add(w)
    }
    t.position.set(x, 0, z)
    castle.add(t)
    return flag
  }
  const flags = [tower(-1.9, 0.3, 0.55, 3.6), tower(1.9, 0.3, 0.55, 3.6), tower(-0.9, -0.5, 0.4, 3.2), tower(0.9, -0.5, 0.4, 3.2), tower(0, -0.4, 0.5, 4.2)]
  castle.position.set(0, 0, -11)
  castle.traverse(o => { o.castShadow = false })
  group.add(castle)

  /* --- Haies, rosiers qu'on fait fleurir, arbres ronds --- */
  const hedgeM = std({ color: 0x3E7A3A, roughness: 0.9 }, 0.85)
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const h = new T.Mesh(new T.CapsuleGeometry(0.28, 0.6, 6, 14), hedgeM)
      h.rotation.z = Math.PI / 2
      h.position.set(s * (1.6 + i * 0.9), 0.28, -2.6 - i * 0.6)
      h.castShadow = true; h.receiveShadow = true
      group.add(h)
    }
  }
  const roseCols = [0xE83A5E, 0xF28AAE, 0xFFFFFF, 0xF5C75A]
  const roses: { g: Grp; blooms: import('three').Mesh[]; k: number }[] = []
  for (const [x, z, c] of [[-1.55, -0.9, 0], [-2.2, -1.9, 1], [1.7, -1.2, 2], [2.4, -2.1, 3]] as [number, number, number][]) {
    const g = new T.Group()
    const bush = new T.Mesh(new T.SphereGeometry(0.36, 20, 14), hedgeM); bush.scale.y = 0.8; bush.position.y = 0.28; bush.castShadow = true; g.add(bush)
    const bm = std({ color: roseCols[c], roughness: 0.55 }, 0.85)
    const blooms: import('three').Mesh[] = []
    for (let i = 0; i < 9; i++) {
      const a = i * 2.2, y = 0.3 + (i % 3) * 0.1
      const r = new T.Mesh(new T.SphereGeometry(0.055, 12, 10), bm)
      r.position.set(Math.cos(a) * 0.3, y, Math.sin(a) * 0.26)
      g.add(r); blooms.push(r)
    }
    g.position.set(x, 0, z)
    act(g, 'rosier')
    group.add(g)
    roses.push({ g, blooms, k: 1 })
  }
  const trunk = std({ color: 0x7A5230, roughness: 0.9 }, 0.8)
  for (const [x, z, s] of [[-4.2, -5, 1.2], [4.4, -5.6, 1.4], [-6, -8, 1.6], [6.2, -8.5, 1.5]]) {
    const t = new T.Group()
    const tr = new T.Mesh(new T.CylinderGeometry(0.1 * s, 0.14 * s, 1.1 * s, 10), trunk); tr.position.y = 0.55 * s; t.add(tr)
    for (let i = 0; i < 4; i++) {
      const l = new T.Mesh(new T.SphereGeometry((0.55 + (i % 2) * 0.15) * s, 18, 14), hedgeM)
      l.position.set(Math.cos(i * 1.7) * 0.3 * s, (1.4 + (i % 2) * 0.3) * s, Math.sin(i * 1.7) * 0.25 * s)
      l.castShadow = true
      t.add(l)
    }
    t.position.set(x, 0, z)
    group.add(t)
  }

  /* --- La fontaine : on la fait jaillir --- */
  const fountain = new T.Group()
  const f1 = new T.Mesh(new T.LatheGeometry([[0.001, 0], [0.62, 0], [0.64, 0.2], [0.58, 0.22], [0.56, 0.08], [0.001, 0.08]].map(([r, y]) => new T.Vector2(r, y)), 48), stone)
  f1.castShadow = true; f1.receiveShadow = true
  fountain.add(f1)
  const water = new T.Mesh(new T.CircleGeometry(0.57, 40), new T.MeshPhysicalMaterial({ color: 0x6FB6EA, roughness: 0.05, transmission: 0, clearcoat: 1, transparent: true, opacity: 0.85 }))
  water.rotation.x = -Math.PI / 2; water.position.y = 0.17
  fountain.add(water)
  const col = new T.Mesh(new T.LatheGeometry([[0.001, 0.08], [0.1, 0.08], [0.06, 0.4], [0.3, 0.52], [0.3, 0.56], [0.001, 0.56]].map(([r, y]) => new T.Vector2(r, y)), 32), stone)
  col.castShadow = true
  fountain.add(col)
  const top = new T.Mesh(new T.SphereGeometry(0.07, 16, 12), gold); top.position.y = 0.62; fountain.add(top)
  fountain.position.set(-2.1, 0, -3.4)
  act(fountain, 'fontaine')
  group.add(fountain)
  let jet = 0

  /* --- Lanternes : elles s'allument la nuit (et au toucher) --- */
  const lanterns: { g: Grp; bulb: import('three').MeshStandardMaterial; on: boolean }[] = []
  const lampLight = new T.PointLight(0xFFD27A, 0, 4, 1.8)
  lampLight.position.set(1.3, 1.1, -0.9)
  group.add(lampLight)
  for (const [x, z] of [[1.3, -0.9], [-1.3, -1.1]]) {
    const g = new T.Group()
    const post = new T.Mesh(new T.CylinderGeometry(0.03, 0.04, 1.1, 10), std({ color: 0x2F3A4A, roughness: 0.5 }))
    post.position.y = 0.55; g.add(post)
    const bulb = std({ color: 0xFFF1C8, roughness: 0.3, emissive: 0xFFC46A, emissiveIntensity: 0 })
    const b = new T.Mesh(new T.SphereGeometry(0.09, 16, 12), bulb); b.position.y = 1.15; g.add(b)
    const cap = new T.Mesh(new T.ConeGeometry(0.11, 0.1, 12), std({ color: 0x2F3A4A, roughness: 0.5 })); cap.position.y = 1.27; g.add(cap)
    g.position.set(x, 0, z)
    g.traverse(o => { o.castShadow = true })
    act(g, 'lanterne')
    group.add(g)
    lanterns.push({ g, bulb, on: false })
  }

  /* --- L'arche de roses : elle mène à la salle de bal --- */
  const arch = new T.Group()
  const archCurve = new T.CatmullRomCurve3([new T.Vector3(-0.55, 0, 0), new T.Vector3(-0.58, 1.3, 0), new T.Vector3(0, 1.85, 0), new T.Vector3(0.58, 1.3, 0), new T.Vector3(0.55, 0, 0)])
  arch.add(new T.Mesh(new T.TubeGeometry(archCurve, 40, 0.05, 8), std({ color: 0xF4F1EC, roughness: 0.4 }, 0.9)))
  for (let i = 0; i < 26; i++) {
    const p = archCurve.getPointAt(i / 25)
    const leaf = new T.Mesh(new T.SphereGeometry(0.09, 10, 8), hedgeM); leaf.position.copy(p).add(new T.Vector3(0, 0, 0.04)); arch.add(leaf)
    if (i % 2 === 0) { const r = new T.Mesh(new T.SphereGeometry(0.05, 10, 8), std({ color: roseCols[i % 4 === 0 ? 0 : 1], roughness: 0.55 }, 0.85)); r.position.copy(p).add(new T.Vector3(0.03, 0.02, 0.1)); arch.add(r) }
  }
  arch.position.set(2.3, 0, -3.2)
  arch.rotation.y = -0.35
  act(arch, 'porte')
  group.add(arch)

  /* --- Papillons : ils volent, et viennent se poser sur la princesse --- */
  const wingCols = [0xF28AAE, 0x6FB6EA, 0xF5C75A, 0xB79AE8]
  const butterflies: { g: Grp; wings: Obj3[]; ph: number; land: V3 | null; landT: number; pos: V3 }[] = []
  for (let i = 0; i < 4; i++) {
    const g = new T.Group()
    const m = std({ color: wingCols[i], roughness: 0.5, side: T.DoubleSide }, 0.9)
    const wings: Obj3[] = []
    for (const s of [-1, 1]) {
      const w = new T.Group()
      const up = new T.Mesh(new T.CircleGeometry(0.05, 16), m); up.position.set(s * 0.045, 0.02, 0); up.scale.set(1, 1.2, 1); w.add(up)
      const lo = new T.Mesh(new T.CircleGeometry(0.035, 14), m); lo.position.set(s * 0.035, -0.035, 0); w.add(lo)
      w.userData.s = s
      g.add(w); wings.push(w)
    }
    const b = new T.Mesh(new T.CapsuleGeometry(0.008, 0.06, 4, 8), std({ color: 0x2A1D15, roughness: 0.6 })); g.add(b)
    g.scale.setScalar(1.3)
    // Une zone invisible plus grosse pour le doigt
    const hit = new T.Mesh(new T.SphereGeometry(0.12, 8, 6), new T.MeshBasicMaterial({ visible: false }))
    g.add(hit)
    act(g, 'papillon')
    group.add(g)
    butterflies.push({ g, wings, ph: i * 1.7, land: null, landT: 0, pos: new T.Vector3() })
  }

  let night = false, fireIn = 0, t = 0
  const d: Decor = {
    id: 'jardin', group, floorY: 0.06,
    get night() { return night },
    actionOf(o) {
      for (let x: Obj3 | null = o; x; x = x.parent) {
        if (x.userData.decorRoot) return { act: x.userData.decor as DecorAction, obj: x }
        if (x === group) break
      }
      return null
    },
    act(a, obj, at) {
      if (a === 'fontaine') {
        jet = 2.2
      } else if (a === 'rosier') {
        const r = roses.find(k => k.g === obj)
        if (r) {
          r.k = 1.8
          fx.burst(at, { count: 30, color: ['#F28AAE', '#FFFFFF', '#E83A5E'], speed: 1.2, spread: 1.2, life: 1.3, size: 0.06, gravity: 0.8 })
        }
      } else if (a === 'lanterne') {
        const l = lanterns.find(k => k.g === obj)
        if (l) l.on = !l.on
        fx.burst(at, { count: 18, color: ['#FFE08A', '#FFFFFF'], speed: 0.8, spread: 1, life: 0.9, size: 0.05, gravity: 0.2 })
      } else if (a === 'papillon') {
        const b = butterflies.find(k => k.g === obj)
        if (b) { b.land = at.clone(); b.landT = 6 }
      }
    },
    setNight(n) {
      night = n
      scene.background = n ? skyNight : skyDay
      lanterns.forEach(l => { l.on = n })
      windowsLit.emissive.set(n ? 0xFFC46A : 0x000000)
      windowsLit.emissiveIntensity = n ? 0.8 : 0
      lights(stage, n, false)
      fireIn = 0.5
    },
    update(dt) {
      t += dt
      flags.forEach((f, i) => { f.rotation.y = Math.sin(t * 3 + i) * 0.3 })
      // La fontaine : un petit filet d'eau, et une gerbe quand on la touche
      jet = Math.max(0, jet - dt)
      const jetTop = fountain.position.clone().add(new T.Vector3(0, 0.62, 0))
      if (Math.random() < (jet > 0 ? 0.9 : 0.25)) {
        fx.burst(jetTop, { count: jet > 0 ? 8 : 2, color: ['#BFE8FF', '#FFFFFF'], speed: jet > 0 ? 2.2 : 0.9, spread: 0.35, life: jet > 0 ? 1.1 : 0.7, size: 0.035, gravity: 3 })
      }
      for (const r of roses) {
        if (r.k > 1) {
          r.k = Math.max(1, r.k - dt * 0.8)
          r.blooms.forEach((b, i) => b.scale.setScalar(1 + (r.k - 1) * (0.8 + Math.sin(i + t * 6) * 0.2)))
        }
      }
      let anyOn = false
      for (const l of lanterns) {
        l.bulb.emissiveIntensity += ((l.on ? 1.6 : 0) - l.bulb.emissiveIntensity) * Math.min(1, dt * 6)
        if (l.on) anyOn = true
      }
      lampLight.intensity += ((anyOn ? 3 : 0) - lampLight.intensity) * Math.min(1, dt * 6)
      // Papillons : des huit dans l'air, ou posés sur la princesse
      butterflies.forEach((b, i) => {
        const ph = t * 0.6 + b.ph
        const free = new T.Vector3(Math.sin(ph) * 1.6 + (i - 1.5) * 0.4, 0.9 + Math.sin(ph * 2.3) * 0.3 + i * 0.12, -1.4 + Math.cos(ph * 0.8) * 0.8)
        let goal = free
        if (b.land && b.landT > 0) { b.landT -= dt; goal = b.land; if (b.landT <= 0) b.land = null }
        if (b.pos.lengthSq() === 0) b.pos.copy(free)
        b.pos.lerp(goal, Math.min(1, dt * (b.land ? 2.5 : 3)))
        b.g.position.copy(b.pos)
        b.g.rotation.y = Math.atan2(goal.x - b.pos.x, goal.z - b.pos.z) + Math.PI / 2
        const flap = b.land && b.pos.distanceTo(b.land) < 0.05 ? Math.sin(t * 4) * 0.5 : Math.sin(t * 22 + i) * 1.1
        b.wings.forEach(w => { w.rotation.y = (w.userData.s as number) * flap })
      })
      // La nuit : lucioles et feu d'artifice au-dessus du château
      if (night) {
        if (Math.random() < 0.15) fx.burst({ x: (Math.random() - 0.5) * 5, y: 0.3 + Math.random() * 1.2, z: -1 - Math.random() * 3 }, { count: 1, color: ['#E8FF8A'], speed: 0.1, spread: 1, life: 2, size: 0.05, gravity: -0.05 })
        fireIn -= dt
        if (fireIn < 0) {
          fireIn = 0.8 + Math.random() * 1.1
          const c = ['#FF6B81', '#FFD34D', '#6FB6EA', '#B79AE8', '#8CCB6A'][Math.floor(Math.random() * 5)]
          fx.burst({ x: (Math.random() - 0.5) * 6, y: 4.5 + Math.random() * 2, z: -12 }, { count: 60, color: [c, '#FFFFFF'], speed: 2.2, spread: 1, life: 1.6, size: 0.3, gravity: 0.5 })
        }
      }
    },
    dispose() {
      scene.background = oldBg
      lights(stage, false, false)
      disposeTree(T, group)
      texs.forEach(x => x.dispose())
      group.removeFromParent()
    }
  }
  return d
}
