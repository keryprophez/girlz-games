import type { T3 } from './three3d'
import type { Paint, PetKind, Royal } from './royal'
import { fabric, lathe, lockGeo, merger, type Fabric, type Merge } from './princess3d'

/* Le compagnon de la princesse (27/09) : licorne, poney, chaton ou chiot,
   en formes rondes comme elle, avec de grands yeux brillants. Trois pièces
   se teignent comme sa robe : le pelage (`pbody`), la crinière et la queue
   (`pmane`), le nœud ou le collier (`pbow`). Il respire, remue la queue,
   sautille quand on le touche, danse au bal.

   Origine aux pieds, regard vers +z. La licorne et le poney arrivent à la
   taille de la princesse au garrot ; le chaton et le chiot à ses genoux. */

type Grp = import('three').Group
type Geo = import('three').BufferGeometry
type Mat = import('three').Material
type V3 = import('three').Vector3
type PetPart = 'pbody' | 'pmane' | 'pbow'

export type PetPose = 'idle' | 'hop' | 'walk' | 'dance' | 'happy'

export interface Pet {
  obj: Grp
  kind: PetKind
  /** Là où la princesse s'assoit (licorne, poney). */
  saddle: V3 | null
  dye(part: PetPart, paint: Paint, at: V3): void
  partOf(o: import('three').Object3D): PetPart | 'deco' | null
  pose(p: PetPose, t: number): void
  update(dt: number): void
  dispose(): void
}

export async function makePet(T: T3, kind: Exclude<PetKind, 'none'>, look: Royal, o: { low?: boolean } = {}): Promise<Pet> {
  const merge: Merge = await merger()
  const geos: Geo[] = [], mats: Mat[] = []
  const g = <G extends Geo>(x: G) => { geos.push(x); return x }
  const fabs: Record<PetPart, Fabric> = {
    pbody: fabric(T, look.paint.pbody, { repeat: [5, 4], roughness: 0.7, low: o.low }),
    pmane: fabric(T, look.paint.pmane, { repeat: [3, 6], roughness: 0.45, low: o.low }),
    pbow: fabric(T, look.paint.pbow, { gloss: true, repeat: [4, 2], low: o.low })
  }
  const std = (p: import('three').MeshStandardMaterialParameters, dim = 1) => {
    const m = new T.MeshStandardMaterial(p); if (dim !== 1) m.color.multiplyScalar(dim); mats.push(m); return m
  }
  const ink = std({ color: 0x1B1210, roughness: 0.15 })
  const white = std({ color: 0xFFFFFF, roughness: 0.2, emissive: 0x333333 })
  const pinkNose = std({ color: 0xE88AA0, roughness: 0.5 }, 0.85)
  const hoof = std({ color: 0xE3B04B, metalness: 1, roughness: 0.3 })
  const sphere = g(new T.SphereGeometry(1, 28, 18))
  const mesh = (geo: Geo, m: Mat, part: string, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) => {
    const r = new T.Mesh(geo, m)
    r.position.set(x, y, z); r.scale.set(sx, sy, sz)
    r.castShadow = true
    r.userData.part = part
    return r
  }
  const body = fabs.pbody.mat, mane = fabs.pmane.mat, bow = fabs.pbow.mat
  const obj = new T.Group()
  const rig = new T.Group()
  obj.add(rig)
  const head = new T.Group()
  const tail = new T.Group()
  const legs: Grp[] = []
  let saddle: V3 | null = null
  const V = (x: number, y: number, z: number) => new T.Vector3(x, y, z)

  /** De grands yeux brillants avec deux reflets (et des cils pour la licorne). */
  const eyes = (parent: Grp, x: number, y: number, z: number, r: number, lashes: boolean) => {
    for (const s of [-1, 1]) {
      parent.add(mesh(sphere, ink, 'deco', s * x, y, z, r, r * 1.15, r * 0.7))
      parent.add(mesh(sphere, white, 'deco', s * x - r * 0.3, y + r * 0.35, z + r * 0.55, r * 0.32))
      parent.add(mesh(sphere, white, 'deco', s * x + r * 0.3, y - r * 0.35, z + r * 0.6, r * 0.15))
      if (lashes) {
        for (let k = 0; k < 3; k++) {
          const l = mesh(g(new T.CylinderGeometry(r * 0.08, r * 0.04, r * 0.7, 5)), ink, 'deco', s * (x + r * 0.55), y + r * (0.7 + k * 0.1), z + r * 0.1 - k * r * 0.25)
          l.rotation.z = -s * (0.9 - k * 0.2)
          parent.add(l)
        }
      }
    }
  }
  /** Un nœud (deux boucles et un cœur). */
  const ribbon = (parent: Grp, x: number, y: number, z: number, s: number, ry = 0) => {
    const b = new T.Group()
    for (const k of [-1, 1]) {
      const l = mesh(sphere, bow, 'pbow', k * 0.9 * s, 0, 0, s, s * 0.62, s * 0.3)
      l.rotation.z = k * 0.3
      b.add(l)
    }
    b.add(mesh(sphere, bow, 'pbow', 0, 0, 0.1 * s, s * 0.38))
    b.position.set(x, y, z); b.rotation.y = ry
    parent.add(b)
  }

  if (kind === 'unicorn' || kind === 'pony') {
    const S = kind === 'unicorn' ? 1 : 0.92
    // Corps en œuf, cou, tête au museau clair
    rig.add(mesh(sphere, body, 'pbody', 0, 0.43 * S, 0, 0.15 * S, 0.135 * S, 0.23 * S))
    const neck = mesh(g(new T.CylinderGeometry(0.055 * S, 0.075 * S, 0.22 * S, 18)), body, 'pbody', 0, 0.56 * S, 0.15 * S)
    neck.rotation.x = 0.55
    rig.add(neck)
    head.position.set(0, 0.68 * S, 0.24 * S)
    rig.add(head)
    head.add(mesh(sphere, body, 'pbody', 0, 0, 0, 0.075 * S, 0.08 * S, 0.095 * S))
    const muzzle = std({ color: 0xF6E6E0, roughness: 0.6 }, 0.85)
    head.add(mesh(sphere, muzzle, 'deco', 0, -0.03 * S, 0.075 * S, 0.058 * S, 0.05 * S, 0.06 * S))
    for (const s of [-1, 1]) head.add(mesh(sphere, pinkNose, 'deco', s * 0.02 * S, -0.028 * S, 0.128 * S, 0.008 * S, 0.006 * S, 0.004 * S))
    head.add(mesh(g(new T.TorusGeometry(0.014 * S, 0.003 * S, 6, 14, Math.PI)), ink, 'deco', 0, -0.052 * S, 0.12 * S).rotateZ(Math.PI))
    eyes(head, 0.055 * S, 0.012 * S, 0.045 * S, 0.022 * S, true)
    for (const s of [-1, 1]) {
      const ear = mesh(g(new T.ConeGeometry(0.02 * S, 0.06 * S, 10)), body, 'pbody', s * 0.04 * S, 0.075 * S, -0.02 * S)
      ear.rotation.z = -s * 0.3
      head.add(ear)
    }
    if (kind === 'unicorn') {
      // La corne : un cône nacré, torsadé
      const horn = g(lathe(T, [[0.001, 0.13], [0.006, 0.12], [0.015, 0.06], [0.02, 0.0], [0.001, -0.004]], 24))
      const p = horn.attributes.position as import('three').BufferAttribute
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
        const a = Math.atan2(x, z), r = Math.hypot(x, z)
        const rr = r * (1 + 0.12 * Math.sin(a * 2 + y * 90))
        p.setXYZ(i, Math.sin(a) * rr, y, Math.cos(a) * rr)
      }
      horn.computeVertexNormals()
      const pearl = new T.MeshPhysicalMaterial({ color: 0xF6E9D6, roughness: 0.2, iridescence: 1, clearcoat: 1 })
      pearl.color.multiplyScalar(0.9)
      mats.push(pearl)
      const hm = mesh(horn, pearl, 'deco', 0, 0.07 * S, 0.03 * S)
      hm.rotation.x = 0.45
      head.add(hm)
    }
    // Crinière : des mèches le long du cou, et une mèche sur le front
    const lockParts: Geo[] = []
    const axis = V(0, 0.5 * S, 0.1 * S)
    for (let i = 0; i < 9; i++) {
      const t = i / 8
      const base = V(0, lerpN(0.74, 0.5, t) * S, lerpN(0.2, 0.02, t) * S)
      const side = i % 2 ? 1 : -1
      lockParts.push(lockGeo(T, [
        base.clone().add(V(0, 0.01, -0.01)),
        base.clone().add(V(side * 0.03, 0.02, -0.04 * S)),
        base.clone().add(V(side * 0.06, -0.05, -0.05 * S)),
        base.clone().add(V(side * 0.07 + Math.sin(i) * 0.01, -0.11 - t * 0.03, -0.03 * S))
      ], 0.032 * S, 0.026 * S, 0.45, axis, 16, 8))
    }
    lockParts.push(lockGeo(T, [V(0, 0.75 * S, 0.22 * S), V(0.01, 0.78 * S, 0.27 * S), V(0.03, 0.74 * S, 0.31 * S), V(0.035, 0.7 * S, 0.31 * S)], 0.026 * S, 0.02 * S, 0.5, V(0, 0.68 * S, 0.24 * S), 12, 8))
    const maneGeo = g(merge(lockParts.map(x => x.index ? x.toNonIndexed() : x), false)!)
    lockParts.forEach(x => x.dispose())
    rig.add(mesh(maneGeo, mane, 'pmane'))
    // Queue : des mèches qui tombent en boucle
    tail.position.set(0, 0.47 * S, -0.2 * S)
    rig.add(tail)
    const tailParts: Geo[] = []
    for (let i = 0; i < 6; i++) {
      const o2 = (i / 5 - 0.5) * 0.04
      tailParts.push(lockGeo(T, [V(o2 * 0.3, 0, 0), V(o2, 0.02, -0.06), V(o2 * 1.5, -0.1, -0.1), V(o2 * 1.8 + Math.sin(i) * 0.01, -0.24, -0.08), V(o2 * 2, -0.3, -0.03)], 0.03 * S, 0.026 * S, 0.5, V(0, -0.1, 0), 16, 8))
    }
    const tailGeo = g(merge(tailParts.map(x => x.index ? x.toNonIndexed() : x), false)!)
    tailParts.forEach(x => x.dispose())
    tail.add(mesh(tailGeo, mane, 'pmane'))
    // Pattes et sabots dorés
    for (const [x, z] of [[0.078, 0.14], [-0.078, 0.14], [0.078, -0.14], [-0.078, -0.14]]) {
      const leg = new T.Group()
      leg.position.set(x * S, 0.36 * S, z * S)
      leg.add(mesh(g(lathe(T, [[0.001, -0.36], [0.031, -0.358], [0.032, -0.32], [0.028, -0.24], [0.031, -0.15], [0.041, -0.05], [0.044, 0.02], [0.001, 0.04]], 16)), body, 'pbody', 0, 0, 0, S))
      leg.add(mesh(g(new T.CylinderGeometry(0.031, 0.035, 0.035, 16)), hoof, 'deco', 0, -0.342 * S, 0, S))
      rig.add(leg)
      legs.push(leg)
    }
    ribbon(head, 0.05 * S, 0.06 * S, -0.03 * S, 0.028 * S, 0.6)
    saddle = V(0, 0.55 * S, -0.02 * S)
  } else {
    // Chaton ou chiot : corps rond, grosse tête, pattes courtes
    const cat = kind === 'kitten'
    const S = cat ? 1 : 1.1
    rig.add(mesh(sphere, body, 'pbody', 0, 0.14 * S, 0, 0.085 * S, 0.08 * S, 0.12 * S))
    head.position.set(0, 0.25 * S, 0.1 * S)
    rig.add(head)
    head.add(mesh(sphere, body, 'pbody', 0, 0, 0, 0.085 * S, 0.078 * S, 0.075 * S))
    const muzzle = std({ color: 0xF6ECE6, roughness: 0.6 }, 0.85)
    head.add(mesh(sphere, muzzle, 'deco', 0, -0.022 * S, 0.055 * S, cat ? 0.036 * S : 0.042 * S, 0.028 * S, 0.03 * S))
    head.add(mesh(sphere, cat ? pinkNose : ink, 'deco', 0, -0.006 * S, 0.083 * S, 0.011 * S, 0.008 * S, 0.006 * S))
    eyes(head, 0.035 * S, 0.012 * S, 0.06 * S, 0.018 * S, cat)
    if (cat) {
      for (const s of [-1, 1]) {
        const ear = mesh(g(new T.ConeGeometry(0.03 * S, 0.055 * S, 4)), body, 'pbody', s * 0.05 * S, 0.068 * S, -0.005 * S)
        ear.rotation.set(0, Math.PI / 4, -s * 0.35)
        head.add(ear)
        const inner = mesh(g(new T.ConeGeometry(0.018 * S, 0.035 * S, 4)), mane, 'pmane', s * 0.049 * S, 0.066 * S, 0.006 * S)
        inner.rotation.set(0, Math.PI / 4, -s * 0.35)
        head.add(inner)
        // Moustaches
        for (let k = 0; k < 2; k++) {
          const w = mesh(g(new T.CylinderGeometry(0.0012, 0.0012, 0.07, 4)), std({ color: 0xFFFFFF, roughness: 0.4 }), 'deco', s * 0.045 * S, (-0.02 - k * 0.008) * S, 0.06 * S)
          w.rotation.z = Math.PI / 2 + s * (0.1 - k * 0.2)
          head.add(w)
        }
      }
    } else {
      // Oreilles tombantes du chiot, en couleur de « crinière »
      for (const s of [-1, 1]) {
        const ear = mesh(sphere, mane, 'pmane', s * 0.075 * S, 0.0, -0.005 * S, 0.028 * S, 0.06 * S, 0.02 * S)
        ear.rotation.z = s * 0.25
        head.add(ear)
      }
      head.add(mesh(g(new T.TorusGeometry(0.012 * S, 0.003 * S, 6, 12, Math.PI)), ink, 'deco', 0, -0.035 * S, 0.075 * S).rotateZ(Math.PI))
    }
    // Queue : dressée en crosse (chaton) ou en panache (chiot)
    tail.position.set(0, 0.16 * S, -0.11 * S)
    rig.add(tail)
    const curve = new T.CatmullRomCurve3(cat
      ? [V(0, 0, 0), V(0, 0.06, -0.05), V(0, 0.15, -0.06), V(0.02, 0.2, -0.02)]
      : [V(0, 0, 0), V(0, 0.05, -0.04), V(0, 0.1, -0.05)])
    tail.add(mesh(g(new T.TubeGeometry(curve, 20, cat ? 0.014 * S : 0.02 * S, 10)), cat ? body : mane, cat ? 'pbody' : 'pmane'))
    tail.add(mesh(sphere, mane, 'pmane', curve.points[curve.points.length - 1].x, curve.points[curve.points.length - 1].y, curve.points[curve.points.length - 1].z, cat ? 0.017 * S : 0.025 * S))
    for (const [x, z] of [[0.045, 0.06], [-0.045, 0.06], [0.045, -0.06], [-0.045, -0.06]]) {
      const leg = new T.Group()
      leg.position.set(x * S, 0.1 * S, z * S)
      leg.add(mesh(g(new T.CapsuleGeometry(0.02 * S, 0.06 * S, 4, 10)), body, 'pbody', 0, -0.05 * S, 0))
      leg.add(mesh(sphere, muzzle, 'deco', 0, -0.095 * S, 0.008, 0.022 * S, 0.012 * S, 0.026 * S))
      rig.add(leg)
      legs.push(leg)
    }
    // Collier et clochette, ou nœud sur l'oreille
    const collar = mesh(g(new T.TorusGeometry(0.05 * S, 0.008 * S, 8, 28)), bow, 'pbow', 0, 0.2 * S, 0.07 * S)
    collar.rotation.x = Math.PI / 2 + 0.6
    rig.add(collar)
    rig.add(mesh(sphere, std({ color: 0xE3B04B, metalness: 1, roughness: 0.3 }), 'deco', 0, 0.165 * S, 0.105 * S, 0.012 * S))
    if (cat) ribbon(head, -0.05 * S, 0.07 * S, 0.0, 0.02 * S, -0.5)
  }
  obj.traverse(x => { x.castShadow = true })

  let t = 0
  let pose: PetPose = 'idle', poseT = 0
  return {
    obj, kind, saddle,
    dye(part, paint, at) { fabs[part].dye(paint, at) },
    partOf(x) {
      for (let o2: import('three').Object3D | null = x; o2; o2 = o2.parent) {
        const p = o2.userData?.part
        if (p) return p as PetPart | 'deco'
        if (o2 === obj) break
      }
      return null
    },
    pose(p, tt) { pose = p; poseT = tt },
    update(dt) {
      t += dt
      for (const f of Object.values(fabs)) f.update(dt)
      const big = kind === 'unicorn' || kind === 'pony'
      rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0)
      head.rotation.set(0, 0, 0)
      legs.forEach(l => l.rotation.set(0, 0, 0))
      // Queue qui remue, tête qui respire
      const wag = pose === 'happy' ? 14 : big ? 2.2 : 6
      tail.rotation.y = Math.sin(t * wag) * (pose === 'happy' ? 0.6 : 0.25)
      tail.rotation.x = Math.sin(t * 1.3) * 0.08
      head.rotation.x = Math.sin(t * 1.6) * 0.04
      if (pose === 'hop' || pose === 'happy') {
        const k = Math.max(0, Math.sin(poseT * 9))
        rig.position.y = k * (big ? 0.05 : 0.06)
        legs.forEach((l, i) => { l.rotation.x = (i < 2 ? -1 : 1) * k * 0.4 })
        head.rotation.x = -k * 0.2
      } else if (pose === 'walk') {
        legs.forEach((l, i) => { l.rotation.x = Math.sin(poseT * 9 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.45 })
        rig.position.y = Math.abs(Math.sin(poseT * 9)) * 0.01
      } else if (pose === 'dance') {
        rig.position.y = Math.abs(Math.sin(poseT * 5)) * 0.04
        rig.rotation.z = Math.sin(poseT * 5) * 0.08
        head.rotation.z = Math.sin(poseT * 5) * 0.15
      }
    },
    dispose() {
      Object.values(fabs).forEach(f => f.dispose())
      geos.forEach(x => x.dispose())
      mats.forEach(x => x.dispose())
      obj.removeFromParent()
    }
  }
}

function lerpN(a: number, b: number, t: number) { return a + (b - a) * t }
