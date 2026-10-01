/* LES PERLES des Bijoux (30/09), en vraie 3D et à leur taille réelle (en
   mètres) — reprises de la maquette validée : la perle nacrée irisée, le
   verre, le cristal taillé, le cœur, l'étoile, la fleur, l'intercalaire doré,
   le cube. Le trou de chaque perle est sur son axe Y : pour l'enfiler, on
   aligne Y sur le fil (`orient`) ; les perles plates ont leur face sur Z.

   Un « kit » par scène garde une géométrie par sorte et un matériau par
   sorte et par couleur (toutes les perles pareilles partagent le leur).
   Le verre et le cristal VRAIMENT réfractés (`refract`, la vitrine) coûtent
   cher : un seul matériau transmissif oblige three.js à rendre toute la
   scène une fois de plus. Sur l'établi (on y joue, il doit rester fluide),
   ils sont « simulés » : transparents, vernis, un peu lumineux. `cheap` : la
   version de la princesse — moins de facettes, opaque (la salle de bal
   entière ne se rend pas deux fois pour un collier). Les perles d'une même
   sorte se dessinent d'un coup (`instancedRun`), comme celles du boîtier. */
import type { T3 } from './three3d'
import type { Bead, BeadKind } from './royal'

type Geo = import('three').BufferGeometry
type Mat = import('three').Material
type V3 = import('three').Vector3
type Q = import('three').Quaternion

/** Longueur d'une perle le long du fil (m). */
export const BEAD_LEN: Record<BeadKind, number> = {
  pearl: 0.0078, glass: 0.0062, crystal: 0.0072, heart: 0.0098, star: 0.0098, flower: 0.0092, spacer: 0.0018, cube: 0.0056
}
/** Hauteur de son centre quand elle est posée à plat (sa demi-épaisseur). */
export const BEAD_HALF: Record<BeadKind, number> = {
  pearl: 0.0039, glass: 0.0031, crystal: 0.0034, heart: 0.0024, star: 0.0022, flower: 0.0024, spacer: 0.0026, cube: 0.0026
}
/** Le jeu entre deux perles enfilées. */
export const BEAD_GAP = 0.0004

/** Où tombe chaque perle sur le fil : le début de chacune et la longueur totale. */
export function beadRun(beads: Bead[], scale = 1): { at: number[]; total: number } {
  const at: number[] = []
  let s = 0
  beads.forEach((b, i) => {
    if (i) s += BEAD_GAP * scale
    at.push(s)
    s += BEAD_LEN[b.k] * scale
  })
  return { at, total: s }
}

function heartShape(T: T3, s: number) {
  const p = new T.Shape()
  // Un cœur dessiné pointe en bas, centré ; le trou le traverse de haut en bas
  p.moveTo(0, -0.5 * s)
  p.bezierCurveTo(-0.08 * s, -0.36 * s, -0.5 * s, -0.1 * s, -0.5 * s, 0.16 * s)
  p.bezierCurveTo(-0.5 * s, 0.42 * s, -0.22 * s, 0.52 * s, 0, 0.3 * s)
  p.bezierCurveTo(0.22 * s, 0.52 * s, 0.5 * s, 0.42 * s, 0.5 * s, 0.16 * s)
  p.bezierCurveTo(0.5 * s, -0.1 * s, 0.08 * s, -0.36 * s, 0, -0.5 * s)
  return p
}
function starShape(T: T3, s: number) {
  const p = new T.Shape()
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5, r = (i % 2 ? 0.22 : 0.5) * s
    if (i === 0) p.moveTo(Math.cos(a) * r, Math.sin(a) * r); else p.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  p.closePath()
  return p
}
function flowerShape(T: T3, s: number, n = 80) {
  const p = new T.Shape()
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI * 2
    const r = s * (0.3 + 0.2 * Math.pow(Math.abs(Math.cos(a * 5 / 2)), 0.7))
    const x = Math.cos(a + Math.PI / 2) * r, y = Math.sin(a + Math.PI / 2) * r
    if (i === 0) p.moveTo(x, y); else p.lineTo(x, y)
  }
  return p
}
function extruded(T: T3, shape: import('three').Shape, depth: number, bevel: number, cheap: boolean) {
  // Une perle fait 20 à 30 px à l'écran : peu de segments suffisent (la
  // première version en avait 24 par courbe : 225 000 triangles pour le seul
  // boîtier, rendus trois fois par image — ombres, réfraction, image)
  const g = new T.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9,
    bevelSegments: 2, curveSegments: cheap ? 5 : 8
  })
  g.center()
  g.computeVertexNormals()
  return g
}

function makeGeo(T: T3, k: BeadKind, cheap: boolean): Geo {
  switch (k) {
    case 'pearl': return cheap ? new T.SphereGeometry(0.0039, 12, 8) : new T.SphereGeometry(0.0039, 18, 12)
    case 'glass': return cheap ? new T.SphereGeometry(0.0031, 10, 7) : new T.SphereGeometry(0.0031, 16, 10)
    // Toupie taillée : deux cônes à huit facettes (sans index : facettes franches)
    case 'crystal': return new T.LatheGeometry([new T.Vector2(0.0005, -0.0036), new T.Vector2(0.0034, 0), new T.Vector2(0.0005, 0.0036)], 8).toNonIndexed()
    case 'heart': return extruded(T, heartShape(T, 0.0098), 0.0026, 0.0011, cheap)
    case 'star': return extruded(T, starShape(T, 0.0104), 0.0024, 0.001, cheap)
    case 'flower': return extruded(T, flowerShape(T, 0.0098, cheap ? 25 : 35), 0.0026, 0.0011, cheap)
    case 'spacer': return new T.CylinderGeometry(0.0026, 0.0026, 0.0014, cheap ? 10 : 16)
    case 'cube': return new T.BoxGeometry(0.0052, 0.0052, 0.0052)
  }
}

function makeMat(T: T3, k: BeadKind, color: string, cheap: boolean, refract: boolean): Mat {
  const c = new T.Color(color)
  if (k === 'pearl') {
    return cheap
      ? new T.MeshPhysicalMaterial({ color: c, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12, iridescence: 0.6, iridescenceIOR: 1.55, iridescenceThicknessRange: [180, 420] })
      : new T.MeshPhysicalMaterial({ color: c, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, iridescence: 0.75, iridescenceIOR: 1.55, iridescenceThicknessRange: [180, 420], sheen: 0.5, sheenColor: new T.Color(0xFFE6F0) })
  }
  if (k === 'glass') {
    if (refract) return new T.MeshPhysicalMaterial({ color: c, roughness: 0.04, transmission: 0.82, thickness: 0.004, ior: 1.52, clearcoat: 1, attenuationColor: c, attenuationDistance: 0.006 })
    // Sans réfraction, un verre de couleur reste lumineux : vernis, un peu irisé,
    // et (sur l'établi) laiteux comme une perle de verre au soleil
    return cheap
      ? new T.MeshPhysicalMaterial({ color: c, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 0.25, specularIntensity: 1 })
      : new T.MeshPhysicalMaterial({ color: c, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.2, specularIntensity: 1, transparent: true, opacity: 0.8, emissive: c, emissiveIntensity: 0.14 })
  }
  if (k === 'crystal') {
    if (refract) return new T.MeshPhysicalMaterial({ color: c, roughness: 0.02, metalness: 0.05, transmission: 0.55, thickness: 0.003, ior: 2.0, dispersion: 2, clearcoat: 1, iridescence: 0.35, flatShading: true, specularIntensity: 1 })
    return cheap
      ? new T.MeshPhysicalMaterial({ color: c, roughness: 0.04, metalness: 0.25, clearcoat: 1, iridescence: 0.45, flatShading: true, specularIntensity: 1 })
      : new T.MeshPhysicalMaterial({ color: c, roughness: 0.03, metalness: 0.2, clearcoat: 1, iridescence: 0.5, flatShading: true, specularIntensity: 1, transparent: true, opacity: 0.9, emissive: c, emissiveIntensity: 0.1 })
  }
  if (k === 'spacer') return new T.MeshPhysicalMaterial({ color: c, metalness: 1, roughness: 0.2, clearcoat: cheap ? 0 : 0.6 })
  return new T.MeshPhysicalMaterial({ color: c, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, sheen: cheap ? 0 : 0.2 })
}

export interface BeadKit {
  geo(k: BeadKind): Geo
  mat(k: BeadKind, color: string): Mat
  mesh(b: Bead): import('three').Mesh
  /** Les matériaux créés jusqu'ici (à confier à qui les libérera). */
  mats(): Mat[]
  /** Libère les géométries (après les avoir fusionnées ailleurs, par exemple). */
  disposeGeos(): void
  dispose(): void
}

export function beadKit(T: T3, o: { cheap?: boolean; refract?: boolean } = {}): BeadKit {
  const cheap = !!o.cheap, refract = !!o.refract && !cheap
  const geos = new Map<BeadKind, Geo>()
  const mats = new Map<string, Mat>()
  const kit: BeadKit = {
    geo(k) {
      let g = geos.get(k)
      if (!g) { g = makeGeo(T, k, cheap); geos.set(k, g) }
      return g
    },
    mat(k, color) {
      const key = k + color
      let m = mats.get(key)
      if (!m) { m = makeMat(T, k, color, cheap, refract); mats.set(key, m) }
      return m
    },
    mesh(b) {
      const m = new T.Mesh(kit.geo(b.k), kit.mat(b.k, b.c))
      m.castShadow = true
      m.receiveShadow = true
      return m
    },
    mats: () => [...mats.values()],
    disposeGeos() { geos.forEach(g => g.dispose()); geos.clear() },
    dispose() { kit.disposeGeos(); mats.forEach(m => m.dispose()); mats.clear() }
  }
  return kit
}

/* ---- Orienter une perle sur le fil ---- */
const tmp: { x?: V3; y?: V3; z?: V3; m?: import('three').Matrix4 } = {}
/** Le quaternion d'une perle : trou (Y) le long du fil, face (Z) vers `up`. */
export function orientQ(T: T3, q: Q, tangent: V3, up: V3): Q {
  const y = (tmp.y ??= new T.Vector3()).copy(tangent).normalize()
  const x = (tmp.x ??= new T.Vector3()).crossVectors(y, up)
  if (x.lengthSq() < 1e-10) x.set(1, 0, 0) // fil vertical sous `up` : n'importe quel côté
  x.normalize()
  const z = (tmp.z ??= new T.Vector3()).crossVectors(x, y).normalize()
  return q.setFromRotationMatrix((tmp.m ??= new T.Matrix4()).makeBasis(x, y, z))
}
export function orient(T: T3, obj: import('three').Object3D, tangent: V3, up: V3 = new T.Vector3(0, 1, 0)) {
  orientQ(T, obj.quaternion, tangent, up)
}

/** Des perles posées une fois pour toutes (une matrice chacune), dessinées
    d'un coup par sorte et par couleur. `group.userData.dispose()` libère les
    tampons des instances (le reste part avec la scène). */
export function instancedRun(T: T3, kit: BeadKit, items: { bead: Bead; m: import('three').Matrix4 }[]): import('three').Group {
  const group = new T.Group()
  const by = new Map<string, { bead: Bead; m: import('three').Matrix4 }[]>()
  for (const it of items) {
    const key = it.bead.k + it.bead.c
    const l = by.get(key)
    if (l) l.push(it); else by.set(key, [it])
  }
  const ims: import('three').InstancedMesh[] = []
  for (const list of by.values()) {
    const im = new T.InstancedMesh(kit.geo(list[0].bead.k), kit.mat(list[0].bead.k, list[0].bead.c), list.length)
    list.forEach((it, i) => im.setMatrixAt(i, it.m))
    im.instanceMatrix.needsUpdate = true
    im.castShadow = true
    im.receiveShadow = true
    im.computeBoundingSphere()
    ims.push(im)
    group.add(im)
  }
  group.userData.dispose = () => ims.forEach(im => im.dispose())
  return group
}
