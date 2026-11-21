import type { Stage, T3 } from './three3d'
import { woodTex } from './three3d'
import { fileOf, rankOf, type Kind, type Piece, type Side } from './chess'

/* Le jeu d'échecs en bois (21/11) — l'échiquier et ses pièces Staunton,
   celles d'un vrai jeu (le père : qu'elles les reconnaissent sur un vrai
   plateau). Tout est tourné : une géométrie de révolution par pièce, plus
   ce qui fait sa silhouette (les créneaux de la tour, la couronne de la
   dame, la croix du roi, la tête du cheval découpée de profil), fondu en
   UNE géométrie — 32 pièces, 32 appels de dessin.

   Une case fait 1 de côté ; a1 est en bas à gauche (x = −3,5, z = 3,5),
   les blancs du côté de l'enfant. */

type Geo = import('three').BufferGeometry
type Mesh = import('three').Mesh

export const squareXZ = (s: number) => ({ x: fileOf(s) - 3.5, z: 3.5 - rankOf(s) })

/** La case sous un point du plateau, ou −1 en dehors. */
export function squareAt(x: number, z: number): number {
  const f = Math.floor(x + 4), r = Math.floor(4 - z)
  return f < 0 || f > 7 || r < 0 || r > 7 ? -1 : f + r * 8
}

/** La hauteur de chaque pièce (pour poser quelque chose au-dessus). */
export const HEIGHT: Record<Kind, number> = { P: 0.84, R: 0.94, N: 1.08, B: 1.34, Q: 1.36, K: 1.62 }

export interface ChessSet {
  group: import('three').Group
  /** Une pièce neuve (sa matière est partagée : ne pas la jeter). */
  make(p: Piece): Mesh
  /** La même en silhouette claire (où poser la pièce). */
  ghost(p: Piece): Mesh
  dispose(): void
}

const LIGHT = '#D6B37A', DARK = '#84512F'

function boardTex(T: T3) {
  const c = document.createElement('canvas')
  c.width = c.height = 1024
  const g = c.getContext('2d')!
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    // a1 (en bas à gauche) est une case sombre
    const dark = (f + r) % 2 === 0
    const x = f * 128, y = (7 - r) * 128
    g.fillStyle = dark ? DARK : LIGHT
    g.fillRect(x, y, 128, 128)
    // Le fil du bois, une case sur deux dans l'autre sens
    for (let k = 0; k < 9; k++) {
      g.strokeStyle = dark ? `rgba(50,26,12,${0.1 + Math.random() * 0.16})` : `rgba(140,96,48,${0.08 + Math.random() * 0.14})`
      g.lineWidth = 1 + Math.random() * 2
      const o = 8 + Math.random() * 112, w = (Math.random() - 0.5) * 10
      g.beginPath()
      if (dark) { g.moveTo(x, y + o); g.bezierCurveTo(x + 40, y + o + w, x + 90, y + o - w, x + 128, y + o) }
      else { g.moveTo(x + o, y); g.bezierCurveTo(x + o + w, y + 40, x + o - w, y + 90, x + o, y + 128) }
      g.stroke()
    }
  }
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  t.anisotropy = 4
  return t
}

export async function chessSet(stage: Stage): Promise<ChessSet> {
  const T = stage.T
  const U = await import('three/examples/jsm/utils/BufferGeometryUtils.js')
  const trash: { dispose(): void }[] = []
  const keep = <R extends { dispose(): void }>(r: R) => { trash.push(r); return r }

  /* ---------- Le plateau ---------- */
  const group = new T.Group()
  const frameMat = keep(new T.MeshStandardMaterial({ map: keep(woodTex(T, '#5B3A24', 2)), roughness: 0.5 }))
  const frame = new T.Mesh(keep(new T.BoxGeometry(9.1, 0.36, 9.1)), frameMat)
  frame.position.y = -0.185
  frame.castShadow = true
  frame.receiveShadow = true
  group.add(frame)
  const top = new T.Mesh(keep(new T.PlaneGeometry(8, 8)), keep(new T.MeshStandardMaterial({ map: keep(boardTex(T)), roughness: 0.42 })))
  top.rotation.x = -Math.PI / 2
  top.receiveShadow = true
  group.add(top)

  /* ---------- Les pièces ---------- */
  const V = (r: number, y: number) => new T.Vector2(r, y)
  const lathe = (pts: [number, number][]) => new T.LatheGeometry(pts.map(([r, y]) => V(r, y)), 32)
  /** Le pied, commun à toutes : un socle, une gorge. */
  const foot = (rb: number): [number, number][] => [
    [0, 0], [rb, 0], [rb + 0.02, 0.035], [rb + 0.02, 0.07], [rb - 0.02, 0.11], [rb * 0.78, 0.14], [rb * 0.72, 0.19]
  ]
  const at = (g: Geo, x: number, y: number, z: number) => g.translate(x, y, z)
  const merge = (parts: Geo[]) => {
    const flat = parts.map(p => {
      const n = p.index ? p.toNonIndexed() : p
      if (n !== p) p.dispose()
      return n
    })
    const m = U.mergeGeometries(flat)!
    flat.forEach(p => p.dispose())
    return keep(m)
  }
  /** La mitre du fou : une goutte, ventrue en bas, pointue en haut. */
  const mitre = (y: number, rx: number, h: number): [number, number][] => {
    const out: [number, number][] = []
    for (let i = 0; i <= 12; i++) {
      const u = i / 12
      out.push([Math.max(0, rx * Math.pow(Math.sin(Math.PI * u), 0.75) * (1.3 - 0.75 * u)), y + h * u])
    }
    return out
  }

  const geo: Record<Kind, Geo> = {
    P: merge([
      lathe([...foot(0.27), [0.12, 0.34], [0.095, 0.47], [0.19, 0.51], [0.19, 0.54], [0.08, 0.58], [0, 0.6]]),
      at(new T.SphereGeometry(0.155, 20, 14), 0, 0.69, 0)
    ]),
    R: merge([
      lathe([...foot(0.32), [0.2, 0.3], [0.185, 0.62], [0.28, 0.68], [0.28, 0.8], [0, 0.8]]),
      // Les créneaux
      ...[0, 1, 2, 3, 4, 5].map(i => {
        const a = (i / 6) * Math.PI * 2
        const b = new T.BoxGeometry(0.15, 0.15, 0.1)
        b.translate(0, 0.87, 0.225)
        b.rotateY(a)
        return b
      })
    ]),
    N: merge([
      lathe([...foot(0.32), [0.25, 0.24], [0.25, 0.29], [0, 0.29]]),
      horse(T)
    ]),
    B: merge([
      lathe([...foot(0.31), [0.13, 0.4], [0.095, 0.68], [0.2, 0.72], [0.2, 0.75], [0.09, 0.79], ...mitre(0.79, 0.17, 0.46)]),
      at(new T.SphereGeometry(0.06, 12, 10), 0, 1.28, 0)
    ]),
    Q: merge([
      lathe([...foot(0.35), [0.16, 0.44], [0.105, 0.86], [0.21, 0.9], [0.21, 0.93], [0.11, 0.97], [0.14, 1.1], [0.26, 1.22], [0.2, 1.2], [0, 1.17]]),
      // Les perles de la couronne
      ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
        const a = (i / 8) * Math.PI * 2
        return at(new T.SphereGeometry(0.045, 10, 8), Math.cos(a) * 0.245, 1.25, Math.sin(a) * 0.245)
      }),
      at(new T.SphereGeometry(0.08, 14, 10), 0, 1.25, 0)
    ]),
    K: merge([
      lathe([...foot(0.36), [0.17, 0.46], [0.115, 0.92], [0.22, 0.96], [0.22, 0.99], [0.12, 1.03], [0.15, 1.18], [0.25, 1.3], [0.12, 1.33], [0, 1.33]]),
      at(new T.BoxGeometry(0.075, 0.3, 0.075), 0, 1.46, 0),
      at(new T.BoxGeometry(0.22, 0.075, 0.075), 0, 1.5, 0)
    ])
  }

  const mats: Record<Side, import('three').MeshStandardMaterial> = {
    w: keep(new T.MeshStandardMaterial({ color: '#AD9872', roughness: 0.42, metalness: 0.02 })),
    b: keep(new T.MeshStandardMaterial({ color: '#2B1C15', roughness: 0.32, metalness: 0.05 }))
  }
  const ghostMat = keep(new T.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.42, depthWrite: false }))

  const make = (p: Piece) => {
    const m = new T.Mesh(geo[p.k], mats[p.s])
    m.castShadow = true
    // Les cavaliers se regardent : les noirs tournés vers la gauche
    if (p.k === 'N' && p.s === 'b') m.rotation.y = Math.PI
    return m
  }
  const ghost = (p: Piece) => {
    const m = new T.Mesh(geo[p.k], ghostMat)
    m.renderOrder = 4
    if (p.k === 'N' && p.s === 'b') m.rotation.y = Math.PI
    return m
  }

  return { group, make, ghost, dispose: () => trash.forEach(t => t.dispose()) }
}

/** La tête du cheval, découpée de profil (elle regarde vers +x) et épaissie. */
function horse(T: T3): Geo {
  const s = new T.Shape()
  s.moveTo(-0.2, 0.27)
  s.quadraticCurveTo(-0.33, 0.62, -0.15, 0.93)   // l'encolure, la crinière
  s.lineTo(-0.1, 1.08)                           // l'oreille
  s.lineTo(-0.02, 0.96)
  s.quadraticCurveTo(0.14, 0.92, 0.28, 0.7)      // le front, le chanfrein
  s.quadraticCurveTo(0.33, 0.62, 0.27, 0.56)     // le bout du nez
  s.lineTo(0.17, 0.55)
  s.quadraticCurveTo(0.09, 0.6, 0.05, 0.66)      // la ganache
  s.quadraticCurveTo(0.0, 0.5, 0.19, 0.38)       // la gorge, le poitrail
  s.lineTo(0.21, 0.27)
  s.closePath()
  const g = new T.ExtrudeGeometry(s, {
    depth: 0.15, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.04, bevelOffset: -0.04, bevelSegments: 3, curveSegments: 10
  })
  g.translate(0, 0, -0.075)
  return g
}
