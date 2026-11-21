// MAQUETTE (non livrée) : la tête et les cheveux du Salon de coiffure.
import { createStage } from '../src/core/three3d'
import '../src/styles/global.css'

type V3 = import('three').Vector3
const q = new URLSearchParams(location.search)
const style = q.get('style') || 'loose'
const view = q.get('view') || 'back'

const holder = document.getElementById('scene')!
const stage = await createStage(holder, {
  sky: '#F1DADF', fov: 28,
  cam: view === 'face' ? [1.6, 0.5, 8.2] : view === 'side' ? [-6.2, 0.4, -5.4] : [-2.4, 0.5, -8.2],
  target: [0, -0.75, 0],
  hemi: ['#FFF4F0', '#B08A8A', 0.75],
  sun: { pos: view === 'face' ? [3, 8, 7] : [-4, 8, -7], color: '#FFF1E2', intensity: 2.2, area: 6, far: 40 },
  fill: 0.35, exposure: 0.95, iblIntensity: 0.7
})
const T = stage.T
const sc = stage.scene

const HAIR = '#6B4424'
function streaks(base: string) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = base; g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 150; i++) {
    const x = Math.random() * 256
    g.strokeStyle = Math.random() < 0.5 ? `rgba(255,215,160,${0.05 + Math.random() * 0.2})` : `rgba(30,14,4,${0.06 + Math.random() * 0.22})`
    g.lineWidth = 0.6 + Math.random() * 2
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 5, 256); g.stroke()
  }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4
  return t
}
const hairTex = streaks(HAIR)
const hairMat = new T.MeshStandardMaterial({ map: hairTex, roughness: 0.42, metalness: 0.05, side: T.DoubleSide })
const hotMat = new T.MeshStandardMaterial({ map: hairTex, roughness: 0.42, side: T.DoubleSide, emissive: 0xFFB627, emissiveIntensity: 0.55 })
const std = (c: number | string, r = 0.7) => new T.MeshStandardMaterial({ color: c, roughness: r })

/* ---- Le buste ---- */
const skin = std(0xE7AE86, 0.75), ink = std(0x1E1A18, 0.35), white = std(0xF2F2F2, 0.4), pink = std(0xE26F86, 0.6)
const ball = new T.SphereGeometry(1, 40, 28)
const add = (geo: import('three').BufferGeometry, m: import('three').Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) => {
  const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; o.receiveShadow = true; sc.add(o); return o
}
add(ball, skin, 0, 0, 0, 1, 1.04, 1)
for (const s of [-1, 1]) {
  add(ball, skin, s * 0.99, -0.08, 0.02, 0.13, 0.19, 0.1)                // les oreilles
  add(ball, ink, s * 0.35, 0.1, 0.9, 0.14, 0.17, 0.1)
  add(ball, white, s * 0.35 + 0.045, 0.16, 0.985, 0.045)
  add(ball, pink, s * 0.6, -0.25, 0.75, 0.17, 0.11, 0.06)
}
const smile = new T.Mesh(new T.TorusGeometry(0.22, 0.045, 8, 18, Math.PI), ink)
smile.position.set(0, -0.28, 0.94); smile.rotation.z = Math.PI; sc.add(smile)
add(new T.CylinderGeometry(0.34, 0.4, 0.6, 24), skin, 0, -1.2, -0.02, 1)
const dress = std(0xC9506A, 0.65)
add(ball, dress, 0, -2.25, -0.02, 1.25, 0.85, 0.72)                      // les épaules
add(ball, skin, 0, -1.52, 0, 0.5, 0.16, 0.42)

/* ---- La calotte : front dégagé, par-dessus l'oreille, jusqu'à la nuque ----
   `tied` : les cheveux tirés en arrière (le fil des cheveux converge vers la nuque) ;
   sinon ils tombent du sommet du crâne. */
function shell(tied: boolean, tie: [number, number, number] = [0, -0.4, -1]) {
  const g = new T.SphereGeometry(1.045, 144, 96)
  if (tied) {
    // Le pôle de la sphère sur le point d'attache : les mèches y convergent
    const to = new T.Vector3(...tie).normalize()
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), to))
  } else g.rotateX(-0.5)
  g.scale(1, 1.04, 1)
  const pos = g.getAttribute('position'), idx = g.getIndex()!
  const keep: number[] = []
  const line = (x: number, z: number) => (z >= 0 ? 0.1 + 0.62 * Math.pow(z, 1.4) + 0.08 * (1 - Math.abs(x)) * z : 0.1 - 1.0 * Math.pow(Math.min(1, -z / 0.5), 1.3))
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2)
    const x = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3, y = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3, z = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3
    if (y > line(x, z)) keep.push(a, b, c)
  }
  g.setIndex(keep)
  const uv = g.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 1.5)
  const m = new T.Mesh(g, hairMat); m.castShadow = true; sc.add(m)
}

/* ---- Une mèche : un tube aplati le long d'une courbe ---- */
function strand(pts: number[][], w: number, t: number, out: (p: V3) => V3, mat = hairMat, taper = 0.25) {
  const curve = new T.CatmullRomCurve3(pts.map(p => new T.Vector3(p[0], p[1], p[2])), false, 'catmullrom', 0.5)
  const SEG = Math.max(26, pts.length * 3), AR = 12
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = []
  for (let i = 0; i <= SEG; i++) {
    const s = i / SEG
    const P = curve.getPoint(s), Tn = curve.getTangent(s)
    const N = out(P).clone(); N.addScaledVector(Tn, -N.dot(Tn)).normalize()
    const B = new T.Vector3().crossVectors(Tn, N).normalize()
    const k = (s < 0.12 ? 0.55 + s / 0.12 * 0.45 : 1) * (1 - Math.pow(Math.max(0, (s - 0.7) / 0.3), 2) * (1 - taper))
    for (let j = 0; j <= AR; j++) {
      const a = (j / AR) * Math.PI * 2
      const cx = Math.cos(a), sy = Math.sin(a)
      pos.push(P.x + B.x * cx * w * k + N.x * sy * t * k, P.y + B.y * cx * w * k + N.y * sy * t * k, P.z + B.z * cx * w * k + N.z * sy * t * k)
      const n = new T.Vector3().addScaledVector(B, cx * t).addScaledVector(N, sy * w).normalize()
      nor.push(n.x, n.y, n.z)
      uv.push(j / AR * 2, s * 2.5)
    }
  }
  for (let i = 0; i < SEG; i++) for (let j = 0; j < AR; j++) {
    const a = i * (AR + 1) + j, b = a + AR + 1
    idx.push(a, b, a + 1, a + 1, b, b + 1)
  }
  const g = new T.BufferGeometry()
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  const m = new T.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; sc.add(m); return m
}
const radial = (p: V3) => new T.Vector3(p.x, 0, p.z).normalize()
const back = () => new T.Vector3(0, 0, -1)
const d = (a: number) => [Math.sin(a), -Math.cos(a)]

function loose(from = -1.75, to = 1.75, n = 15, len = 1) {
  for (let layer = 0; layer < 2; layer++) for (let i = 0; i < n; i++) {
    const a = from + (to - from) * ((i + layer * 0.5) / (n - 1 + 0.5))
    const [dx, dz] = d(a)
    const r = 1.06 - layer * 0.03
    const side = Math.abs(a) > 1.05
    const bottom = (side ? -1.55 : -2.35 - Math.cos(a * 1.4) * 0.25) * len
    const j = Math.sin(i * 12.9 + layer * 4) * 0.03
    strand([
      [dx * 0.66, 0.74, dz * 0.66], [dx * 0.99, 0.3, dz * 0.99], [dx * (r + 0.02), -0.3, dz * (r + 0.02)],
      [dx * (r - 0.02) + j, -0.95, dz * (r - 0.04)], [dx * (r - 0.08) + j, bottom * 0.72, dz * (side ? r - 0.05 : r - 0.2)], [dx * (r - 0.14) + j * 2, bottom, dz * (side ? r - 0.02 : r - 0.3)]
    ], 0.17, 0.05, radial)
  }
}
const elastic = (x: number, y: number, z: number, r = 0.2, color = 0xE8427C) => {
  const e = new T.Mesh(new T.TorusGeometry(r, 0.06, 10, 24), std(color, 0.5)); e.position.set(x, y, z); e.rotation.x = Math.PI / 2 - 0.5; e.castShadow = true; sc.add(e)
}
function ponytail() {
  const o = [0, 0.3, -1.12]
  for (let i = 0; i < 7; i++) {
    const a = (i / 6 - 0.5) * 0.9, x = Math.sin(a) * 0.16, zz = Math.cos(a * 2) * 0.05
    strand([[o[0] + x * 0.3, o[1], o[2] + 0.1], [x * 0.7, o[1] + 0.12, o[2] - 0.32], [x * 1.3, -0.35, o[2] - 0.5 + zz], [x * 1.7, -1.1, o[2] - 0.34 + zz], [x * 1.9, -1.85, o[2] - 0.12 + zz], [x * 1.5, -2.3, o[2] + 0.02]],
      0.15, 0.085, back)
  }
  elastic(o[0], o[1] + 0.05, o[2] - 0.12)
}
/** La tresse : trois mèches qui se croisent, jusqu'à `done` (0..1) ; le reste pend. */
function braid(done = 1, hot = -1) {
  const top = [0, -0.5, -0.98], L = 2.0, turns = 3.4
  for (let k = 0; k < 3; k++) {
    const pts: number[][] = [[(k - 1) * 0.26, -0.22, -0.96], [(k - 1) * 0.2, -0.38, -1.03]]
    const N = 40
    for (let i = 0; i <= N; i++) {
      const s = i / N
      const y = top[1] - s * L
      const zAxis = top[2] + s * 0.16 - Math.sin(s * Math.PI) * 0.06
      if (s <= done) {
        const th = s * turns * Math.PI * 2 + k * Math.PI * 2 / 3
        const A = 0.2 - s * 0.05
        pts.push([Math.sin(th) * A, y, zAxis - Math.sin(th * 2) * A * 0.5])
      } else if (i % 5 === 0) {
        // Pas encore tressé : les trois mèches pendent côte à côte
        const th0 = done * turns * Math.PI * 2 + k * Math.PI * 2 / 3
        const x0 = Math.sin(th0) * 0.2
        const sp = Math.min(1, (s - done) * 5)
        pts.push([x0 + (Math.sign(x0 || (k - 1)) * 0.2 + (k - 1) * 0.12 - x0 * 0.3) * sp, y, zAxis - 0.02])
      }
    }
    strand(pts, 0.125, 0.105, back, k === hot ? hotMat : hairMat, done >= 1 ? 0.5 : 0.3)
  }
  if (done >= 1) {
    elastic(0, top[1] - L - 0.02, top[2] + 0.16, 0.13)
    for (let i = 0; i < 5; i++) { const x = (i - 2) * 0.05; strand([[x * 0.4, top[1] - L, top[2] + 0.16], [x * 1.5, top[1] - L - 0.25, top[2] + 0.18], [x * 2.4, top[1] - L - 0.45, top[2] + 0.2]], 0.07, 0.05, back, hairMat, 0.1) }
  }
}

if (style === 'loose') { shell(false); loose() }
if (style === 'ponytail') { shell(true, [0, 0.28, -1]); ponytail() }
if (style === 'braid') { shell(true); braid(1) }
if (style === 'step') { shell(true); braid(0.34, 0) }
if (style === 'pigtails') {
  shell(false)
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.05
      strand([[s * 0.95, -0.1, -0.35], [s * 1.22 + x, -0.3, -0.42], [s * 1.3 + x * 1.5, -1.0, -0.4 + x], [s * 1.26 + x * 2, -1.75, -0.36 + x], [s * 1.2 + x * 1.6, -2.1, -0.33]], 0.13, 0.08, radial)
    }
    const e = new T.Mesh(new T.TorusGeometry(0.17, 0.055, 10, 24), std(0x3D9BF0, 0.5)); e.position.set(s * 1.14, -0.24, -0.4); e.rotation.set(0.3, 0, s * 1.0); sc.add(e)
  }
}
stage.start(() => {})
;(window as unknown as { __ready: boolean }).__ready = true
