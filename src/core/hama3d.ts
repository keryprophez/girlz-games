/* LES PERLES À REPASSER EN 3D (30/09) — la plaque à picots, les perles, les
   pots, l'axe lumineux et le fer qui les fait fondre. Né avec les Perles
   Miroir (`games/mirror.ts`), pensé pour le futur Atelier des bijoux
   (perles à repasser en création libre, puis un pendentif au collier).

   L'unité est le PAS de la plaque : 1 = d'un picot au suivant (5 mm en
   vrai). Tout vit dans `board.group`, qu'un jeu met à l'échelle qu'il veut
   (les Perles Miroir : une plaque toujours de la même taille à l'écran ;
   l'Atelier, en mètres, `group.scale.setScalar(0.005)`).

   Une perle est un petit tube percé (la géométrie de la maquette du 30/09,
   `hamaGeo`), arrondi aux quatre arêtes, en plastique brillant. Sa version
   FONDUE (plus large, plus basse, le trou presque refermé) est une cible de
   morph : chaque perle fond pour elle-même (`setMorphAt`), au moment où le
   fer passe dessus. Plaque, picots et perles sont des `InstancedMesh` : 144
   perles = un seul appel de dessin. Aucun matériau à transmission (trop
   cher pour la tablette) : la plaque est translucide par simple opacité. */

import type { T3 } from './three3d'

type V3 = import('three').Vector3
type Group = import('three').Group
type IM = import('three').InstancedMesh

/** Mesures d'une perle et d'une perle fondue, en pas. */
export const BEAD = { ro: 0.48, ri: 0.23, h: 0.885 }
export const FUSED = { ro: 0.575, ri: 0.1, h: 0.66 }
const PEG_H = 0.58

/* ---------- La perle ---------- */

/** Le profil d'un anneau (coupe d'un tube), arrondi aux quatre arêtes, à
    faire tourner autour de Y. Même nombre de points quelles que soient les
    mesures : les deux profils (neuf et fondu) se morphent l'un dans l'autre. */
function ringProfile(T: T3, ro: number, ri: number, h: number, bo: number, bi: number, arc: number) {
  const pts: import('three').Vector2[] = []
  const mid = (ro + ri) / 2
  const corner = (cx: number, cy: number, r: number, a0: number, a1: number) => {
    for (let k = 0; k <= arc; k++) {
      const a = a0 + (a1 - a0) * k / arc
      pts.push(new T.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r))
    }
  }
  const P = Math.PI
  pts.push(new T.Vector2(mid, 0))
  corner(ro - bo, bo, bo, -P / 2, 0)          // arête extérieure du bas
  corner(ro - bo, h - bo, bo, 0, P / 2)       // arête extérieure du haut
  corner(ri + bi, h - bi, bi, P / 2, P)       // arête du trou, en haut
  corner(ri + bi, bi, bi, P, P * 1.5)         // arête du trou, en bas
  pts.push(new T.Vector2(mid, 0))
  return pts
}

/** Une perle à repasser, posée sur y = 0 (le trou sur l'axe Y). `fine` pour
    la plaque (avec sa cible de morph « fondue »), `lite` pour les tas des
    pots (moins de facettes, jamais fondue). */
export function hamaGeo(T: T3, detail: 'fine' | 'lite' = 'fine') {
  const seg = detail === 'fine' ? 18 : 12
  const arc = 2
  const g = new T.LatheGeometry(ringProfile(T, BEAD.ro, BEAD.ri, BEAD.h, 0.1, 0.05, arc), seg)
  if (detail === 'fine') {
    const f = new T.LatheGeometry(ringProfile(T, FUSED.ro, FUSED.ri, FUSED.h, 0.15, 0.04, arc), seg)
    g.morphAttributes.position = [f.attributes.position]
    g.morphAttributes.normal = [f.attributes.normal]
    f.dispose()
  }
  return g
}

/** Le plastique des perles : la couleur vient de chaque perle (instanceColor). */
export function beadMaterial(T: T3) {
  return new T.MeshPhysicalMaterial({ color: 0xFFFFFF, roughness: 0.3, metalness: 0, clearcoat: 0.65, clearcoatRoughness: 0.2 })
}

/* ---------- La plaque ---------- */

function roundedRect(T: T3, w: number, h: number, r: number) {
  const s = new T.Shape()
  s.moveTo(-w / 2 + r, -h / 2)
  s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2)
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r)
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)
  return s
}

/** Une géométrie extrudée couchée à plat, posée sur y = 0. */
function slab(T: T3, shape: import('three').Shape, depth: number, bevel: number, segs = 3) {
  const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: 10 })
  g.rotateX(-Math.PI / 2)
  g.computeBoundingBox()
  g.translate(0, -g.boundingBox!.min.y, 0)
  return g
}

export interface Pegboard {
  /** La plaque et tout ce qu'elle porte (à mettre à l'échelle). */
  group: Group
  /** Les perles : c'est ce groupe qui se décolle après le fer. */
  piece: Group
  beads: IM
  cols: number
  rows: number
  /** Hauteur du dessus de la plaque. */
  top: number
  /** Le pied du picot (c, r), au ras de la plaque, en coordonnées de la plaque. */
  at(c: number, r: number, out?: V3): V3
  /** Le même point, dans la scène. */
  world(c: number, r: number, y?: number): V3
  /** La case sous un rayon (dans la scène) : le dessus d'une perle posée
      d'abord (on la touche de trois quarts), sinon le picot. */
  pick(ray: import('three').Ray): { c: number; r: number } | null
  /** La couleur de la perle posée, ou null. */
  get(c: number, r: number): number | null
  /** Pose une perle : elle tombe, rebondit, `onLand` sonne le clic. */
  put(c: number, r: number, hex: number, o?: { drop?: number; delay?: number }): void
  /** Retire une perle (elle saute et disparaît). */
  take(c: number, r: number, pop?: boolean): void
  /** Vide la plaque d'un coup (perles, fusion, clignotements). */
  clear(): void
  /** Une perle fausse clignote doucement, tant qu'elle est là. */
  wrong(c: number, r: number, on: boolean): void
  /** Petit saut sur place (une vague qui parcourt le dessin). */
  hop(c: number, r: number, delay?: number, height?: number): void
  /** Fusion d'une perle, de 0 (neuve) à 1 (fondue). */
  fuse(c: number, r: number, k: number): void
  fusion(c: number, r: number): number
  onLand: ((c: number, r: number) => void) | null
  update(dt: number): void
  dispose(): void
}

export function pegboard(T: T3, o: { cols: number; rows: number; plate?: number; opacity?: number }): Pegboard {
  const { cols, rows } = o
  const N = cols * rows
  const group = new T.Group()
  const piece = new T.Group()
  group.add(piece)
  const disposers: (() => void)[] = []

  // La plaque : un carré aux coins ronds, translucide (sans transmission)
  const W = cols + 0.9, D = rows + 0.9
  const plateGeo = slab(T, roundedRect(T, W, D, 0.9), 0.2, 0.06)
  const plateMat = new T.MeshPhysicalMaterial({
    color: o.plate ?? 0xC9E2F0, roughness: 0.2, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.15,
    transparent: true, opacity: o.opacity ?? 0.8
  })
  const plate = new T.Mesh(plateGeo, plateMat)
  plate.receiveShadow = true
  group.add(plate)
  const top = plateGeo.boundingBox!.max.y - plateGeo.boundingBox!.min.y
  disposers.push(() => { plateGeo.dispose(); plateMat.dispose() })

  const at = (c: number, r: number, out = new T.Vector3()) =>
    out.set(c - (cols - 1) / 2, top, r - (rows - 1) / 2)

  // Les picots : de petits cônes arrondis, un par case
  const pegGeo = new T.CylinderGeometry(0.13, 0.18, PEG_H, 10, 1)
  pegGeo.translate(0, PEG_H / 2, 0)
  const pegMat = new T.MeshStandardMaterial({ color: o.plate ?? 0xC9E2F0, roughness: 0.3, metalness: 0 })
  const pegs = new T.InstancedMesh(pegGeo, pegMat, N)
  const m4 = new T.Matrix4()
  const v = new T.Vector3()
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    at(c, r, v)
    m4.makeTranslation(v.x, v.y, v.z)
    pegs.setMatrixAt(r * cols + c, m4)
  }
  pegs.castShadow = true
  pegs.receiveShadow = true
  group.add(pegs)
  disposers.push(() => { pegGeo.dispose(); pegMat.dispose(); pegs.dispose() })

  // Les perles : un emplacement par picot, caché (échelle 0) tant qu'il est vide
  const beadGeo = hamaGeo(T, 'fine')
  const beadMat = beadMaterial(T)
  const beads = new T.InstancedMesh(beadGeo, beadMat, N)
  beads.castShadow = true
  beads.receiveShadow = true
  // Les perles bougent : la sphère englobante couvre toute la plaque, une fois pour toutes
  beads.frustumCulled = false
  piece.add(beads)
  disposers.push(() => { beadGeo.dispose(); beadMat.dispose(); beads.dispose() })

  const color = new Float64Array(N).fill(-1)
  const drop = new Float32Array(N).fill(-1)   // temps depuis le lâcher (< 0 : attend)
  const dropH = new Float32Array(N)
  const tilt = new Float32Array(N * 2)
  const pop = new Float32Array(N).fill(-1)
  const hopT = new Float32Array(N).fill(-9)
  const hopH = new Float32Array(N)
  const bad = new Uint8Array(N)
  const fused = new Float32Array(N)
  const active = new Set<number>()
  const zero = new T.Matrix4().makeScale(0, 0, 0)
  const q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), p = new T.Vector3()
  const col = new T.Color(), white = new T.Color(0xFFFFFF)
  const morph = { morphTargetInfluences: [0] } as unknown as import('three').Mesh
  let clock = 0

  for (let i = 0; i < N; i++) {
    beads.setMatrixAt(i, zero)
    beads.setColorAt(i, white)
    beads.setMorphAt(i, morph)
  }
  beads.instanceMatrix.needsUpdate = true

  const DROP_T = 0.26, BOUNCE_T = 0.17, POP_T = 0.24, HOP_T = 0.34

  /** Recalcule la perle i ; renvoie false quand elle n'a plus rien à animer. */
  const pose = (i: number): boolean => {
    const c = i % cols, r = Math.floor(i / cols)
    at(c, r, p)
    let busy = false
    let y = 0, sy = 1, sxz = 1, rx = 0, rz = 0
    if (pop[i] >= 0) {
      const k = Math.min(1, pop[i] / POP_T)
      y = Math.sin(k * Math.PI * 0.6) * 1.4
      sxz = sy = 1 - k
      rx = k * 1.2
      if (k >= 1) { pop[i] = -1; color[i] = -1; bad[i] = 0; beads.setMatrixAt(i, zero); return false }
      busy = true
    } else if (color[i] < 0) {
      beads.setMatrixAt(i, zero)
      return false
    } else if (drop[i] > -1) {
      const t = drop[i]
      if (t < 0) { beads.setMatrixAt(i, zero); return true } // pas encore lâchée
      if (t < DROP_T) {
        const k = t / DROP_T
        y = dropH[i] * (1 - k * k)
        rx = tilt[i * 2] * (1 - k); rz = tilt[i * 2 + 1] * (1 - k)
      } else if (t < DROP_T + BOUNCE_T) {
        const k = (t - DROP_T) / BOUNCE_T
        y = Math.sin(k * Math.PI) * 0.2
        sy = 1 - Math.sin(k * Math.PI) * 0.1
        sxz = 1 + Math.sin(k * Math.PI) * 0.05
      } else drop[i] = -1
      busy = drop[i] > -1
    }
    if (hopT[i] > -9 && pop[i] < 0) {
      if (hopT[i] >= 0) {
        const k = hopT[i] / HOP_T
        if (k >= 1) hopT[i] = -9
        else { y += Math.sin(k * Math.PI) * hopH[i]; rz += Math.sin(k * Math.PI * 2) * 0.12 }
      }
      busy = busy || hopT[i] > -9
    }
    if (bad[i]) {
      // La perle fausse se dandine doucement sur son picot (et pâlit, voir tint)
      busy = true
      const w = Math.sin(clock * 5.2)
      rz += Math.sin(clock * 9) * 0.1
      y += (0.5 + 0.5 * w) * 0.12
      sxz *= 1 + 0.06 * (0.5 + 0.5 * w)
    }
    e.set(rx, 0, rz)
    q.setFromEuler(e)
    s.set(sxz, sy, sxz)
    p.y += y
    m4.compose(p, q, s)
    beads.setMatrixAt(i, m4)
    return busy
  }

  const tint = (i: number) => {
    col.setHex(color[i] < 0 ? 0xFFFFFF : color[i])
    if (bad[i]) col.lerp(white, 0.6 * (0.5 + 0.5 * Math.sin(clock * 5.2)))
    beads.setColorAt(i, col)
  }

  const board: Pegboard = {
    group, piece, beads, cols, rows, top,
    at,
    world(c, r, y = 0) {
      group.updateWorldMatrix(true, false)
      return at(c, r).setY(top + y).applyMatrix4(group.matrixWorld)
    },
    pick(ray) {
      group.updateWorldMatrix(true, false)
      const inv = new T.Matrix4().copy(group.matrixWorld).invert()
      const lr = ray.clone().applyMatrix4(inv)
      const cell = (y: number) => {
        if (Math.abs(lr.direction.y) < 1e-6) return null
        const t = (y - lr.origin.y) / lr.direction.y
        if (t < 0) return null
        const x = lr.origin.x + lr.direction.x * t, z = lr.origin.z + lr.direction.z * t
        const c = Math.round(x + (cols - 1) / 2), r = Math.round(z + (rows - 1) / 2)
        return c >= 0 && c < cols && r >= 0 && r < rows ? { c, r } : null
      }
      const hit = cell(top + BEAD.h * 0.96)
      if (hit && color[hit.r * cols + hit.c] >= 0 && pop[hit.r * cols + hit.c] < 0) return hit
      return cell(top + 0.42)
    },
    get(c, r) {
      const i = r * cols + c
      return color[i] >= 0 && pop[i] < 0 ? color[i] : null
    },
    put(c, r, hex, opt = {}) {
      const i = r * cols + c
      color[i] = hex
      pop[i] = -1
      bad[i] = 0
      drop[i] = -(opt.delay ?? 0)
      dropH[i] = opt.drop ?? 2.4
      tilt[i * 2] = (Math.random() - 0.5) * 1.6
      tilt[i * 2 + 1] = (Math.random() - 0.5) * 1.6
      fused[i] = 0
      morph.morphTargetInfluences![0] = 0
      beads.setMorphAt(i, morph)
      if (beads.morphTexture) beads.morphTexture.needsUpdate = true
      if (dropH[i] <= 0) drop[i] = -1
      tint(i)
      beads.instanceColor!.needsUpdate = true
      active.add(i)
    },
    take(c, r, withPop = true) {
      const i = r * cols + c
      if (color[i] < 0) return
      bad[i] = 0
      tint(i)
      beads.instanceColor!.needsUpdate = true
      if (withPop) { pop[i] = 0; drop[i] = -1; active.add(i) } else { color[i] = -1; beads.setMatrixAt(i, zero); beads.instanceMatrix.needsUpdate = true }
    },
    clear() {
      for (let i = 0; i < N; i++) {
        color[i] = -1; drop[i] = -1; pop[i] = -1; hopT[i] = -9; bad[i] = 0; fused[i] = 0
        beads.setMatrixAt(i, zero)
        morph.morphTargetInfluences![0] = 0
        beads.setMorphAt(i, morph)
      }
      active.clear()
      beads.instanceMatrix.needsUpdate = true
      if (beads.morphTexture) beads.morphTexture.needsUpdate = true
    },
    wrong(c, r, on) {
      const i = r * cols + c
      bad[i] = on ? 1 : 0
      tint(i)
      beads.instanceColor!.needsUpdate = true
      active.add(i)
    },
    hop(c, r, delay = 0, height = 0.55) {
      const i = r * cols + c
      if (color[i] < 0) return
      hopT[i] = -delay - 1e-4
      hopH[i] = height
      active.add(i)
    },
    fuse(c, r, k) {
      const i = r * cols + c
      if (Math.abs(fused[i] - k) < 1e-3) return
      fused[i] = k
      morph.morphTargetInfluences![0] = k
      beads.setMorphAt(i, morph)
      if (beads.morphTexture) beads.morphTexture.needsUpdate = true
    },
    fusion(c, r) { return fused[r * cols + c] },
    onLand: null,
    update(dt) {
      clock += dt
      if (!active.size) return
      let colors = false
      for (const i of active) {
        if (pop[i] >= 0) pop[i] += dt
        else if (drop[i] > -1) {
          const before = drop[i]
          drop[i] += dt
          if (before < DROP_T && drop[i] >= DROP_T) board.onLand?.(i % cols, Math.floor(i / cols))
        }
        if (hopT[i] > -9) hopT[i] += dt
        if (bad[i]) { tint(i); colors = true }
        if (!pose(i)) active.delete(i)
      }
      beads.instanceMatrix.needsUpdate = true
      if (colors) beads.instanceColor!.needsUpdate = true
    },
    dispose() {
      disposers.forEach(f => f())
      group.removeFromParent()
    }
  }
  return board
}

/* ---------- Le pot de perles ---------- */
export interface BeadPot {
  group: Group
  /** Le pot se soulève un peu et son anneau s'allume (la couleur choisie). */
  select(on: boolean): void
  update(dt: number): void
  dispose(): void
}

/** Un petit bol blanc rempli d'un tas de perles d'une couleur. `radius` en
    unités de la scène, `bead` = la taille d'une perle (celle de la plaque). */
export function beadPot(T: T3, hex: number, o: { radius: number; bead: number }): BeadPot {
  const R = o.radius
  const group = new T.Group()
  const lift = new T.Group()
  group.add(lift)
  // Le bol : un profil tourné, lèvre arrondie, plastique blanc brillant
  const wall = R * 0.07, H = R * 0.42
  const prof = [
    new T.Vector2(0, 0), new T.Vector2(R * 0.78, 0), new T.Vector2(R * 0.93, H * 0.25),
    new T.Vector2(R, H * 0.92), new T.Vector2(R - wall * 0.2, H), new T.Vector2(R - wall, H * 0.95),
    new T.Vector2(R - wall * 1.4, H * 0.3), new T.Vector2(R * 0.72, wall), new T.Vector2(0, wall)
  ]
  const bowlGeo = new T.LatheGeometry(prof, 40)
  const bowlMat = new T.MeshPhysicalMaterial({ color: 0xF4F1EC, roughness: 0.25, clearcoat: 0.5, side: T.DoubleSide })
  const bowl = new T.Mesh(bowlGeo, bowlMat)
  bowl.castShadow = true
  bowl.receiveShadow = true
  lift.add(bowl)
  // Le tas : des perles en vrac, couchées ou debout, en deux ou trois
  // couches qui font un dôme ; chacune garde sa place (pas de perles
  // fondues l'une dans l'autre)
  const b = o.bead
  const inner = R - wall * 1.8 - b * 0.45
  const spots: import('three').Vector3[] = []
  for (let layer = 0; layer < 3; layer++) {
    const rad = inner * (1 - layer * 0.3)
    const y = wall + b * (0.28 + layer * 0.62)
    for (let tries = 0; tries < 260 && spots.length < 70; tries++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * rad
      const cand = new T.Vector3(Math.cos(a) * rr, y + Math.random() * b * 0.18, Math.sin(a) * rr)
      if (spots.every(q => q.distanceToSquared(cand) > (b * 0.86) ** 2)) spots.push(cand)
    }
  }
  const heapGeo = hamaGeo(T, 'lite')
  heapGeo.translate(0, -BEAD.h / 2, 0) // tourner autour du milieu de la perle
  const heapMat = beadMaterial(T)
  heapMat.color.setHex(hex)
  const heap = new T.InstancedMesh(heapGeo, heapMat, spots.length)
  const m4 = new T.Matrix4(), qq = new T.Quaternion(), ee = new T.Euler(), ss = new T.Vector3(b, b, b)
  spots.forEach((pp, j) => {
    // Deux sur trois couchées sur le flanc, le trou vers le côté
    const lying = Math.random() < 0.66
    ee.set(lying ? Math.PI / 2 + (Math.random() - 0.5) * 0.5 : (Math.random() - 0.5) * 0.5, Math.random() * 6.3, (Math.random() - 0.5) * 0.4, 'YXZ')
    qq.setFromEuler(ee)
    m4.compose(pp, qq, ss)
    heap.setMatrixAt(j, m4)
  })
  heap.castShadow = true
  heap.receiveShadow = true
  lift.add(heap)
  // L'anneau de la couleur choisie : il brille autour de la lèvre
  const ringGeo = new T.TorusGeometry(R * 1.08, R * 0.065, 10, 56)
  ringGeo.rotateX(Math.PI / 2)
  const ringMat = new T.MeshStandardMaterial({ color: 0xF59A1B, emissive: 0xF08A00, emissiveIntensity: 0.8, roughness: 0.4, transparent: true, opacity: 0 })
  const ring = new T.Mesh(ringGeo, ringMat)
  ring.position.y = H * 0.55
  lift.add(ring)
  let on = false, k = 0, t = Math.random() * 6
  return {
    group,
    select(v) { on = v },
    update(dt) {
      t += dt
      k += ((on ? 1 : 0) - k) * Math.min(1, dt * 9)
      lift.position.y = k * R * 0.22 + (on ? Math.sin(t * 3) * R * 0.02 : 0)
      ringMat.opacity = k * (0.85 + Math.sin(t * 4) * 0.15)
      ring.visible = k > 0.02
    },
    dispose() {
      bowlGeo.dispose(); bowlMat.dispose(); heapGeo.dispose(); heapMat.dispose(); heap.dispose()
      ringGeo.dispose(); ringMat.dispose()
      group.removeFromParent()
    }
  }
}

/* ---------- L'axe de symétrie : une ficelle lumineuse tendue ---------- */
export interface AxisThread {
  group: Group
  /** 0 = éteinte (invisible), 1 = allumée. */
  set(k: number): void
  update(dt: number): void
  dispose(): void
}

/** Une ficelle qui brille, tendue au-dessus des perles entre deux épingles, le
    long de l'axe (vertical : le long des colonnes ; horizontal : des rangées). */
export function axisThread(T: T3, board: Pegboard, axis: 'v' | 'h', hex = 0xFF4F7B): AxisThread {
  const group = new T.Group()
  const len = (axis === 'v' ? board.rows : board.cols) + 0.5
  const y = board.top + BEAD.h + 0.16
  const threadGeo = new T.CylinderGeometry(0.05, 0.05, len, 8)
  threadGeo.rotateX(Math.PI / 2)
  const threadMat = new T.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.55, roughness: 0.45 })
  const thread = new T.Mesh(threadGeo, threadMat)
  thread.position.y = y
  thread.castShadow = true
  group.add(thread)
  // La lueur : un ruban additif sous la ficelle, dégradé sur les bords
  const c = document.createElement('canvas')
  c.width = 8; c.height = 64
  const g = c.getContext('2d')!
  const gr = g.createLinearGradient(0, 0, 0, 64)
  gr.addColorStop(0, 'rgba(255,255,255,0)')
  gr.addColorStop(0.5, 'rgba(255,255,255,1)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 8, 64)
  const tex = new T.CanvasTexture(c)
  const glowGeo = new T.PlaneGeometry(0.6, len + 0.3)
  glowGeo.rotateX(-Math.PI / 2)
  const glowMat = new T.MeshBasicMaterial({ map: tex, color: hex, transparent: true, opacity: 0.3, blending: T.AdditiveBlending, depthWrite: false })
  // La texture est dégradée sur sa hauteur : on la tourne pour qu'elle le soit en travers
  tex.center.set(0.5, 0.5)
  tex.rotation = Math.PI / 2
  const glow = new T.Mesh(glowGeo, glowMat)
  glow.position.y = y - 0.02
  group.add(glow)
  // Deux épingles dorées aux deux bouts
  const pinGeo = new T.CylinderGeometry(0.06, 0.06, y - board.top + 0.1, 8)
  pinGeo.translate(0, (y - board.top + 0.1) / 2, 0)
  const headGeo = new T.SphereGeometry(0.2, 16, 12)
  const pinMat = new T.MeshStandardMaterial({ color: 0xE3B65A, metalness: 0.8, roughness: 0.3 })
  const headMat = new T.MeshPhysicalMaterial({ color: hex, roughness: 0.25, clearcoat: 0.8 })
  for (const sgn of [-1, 1]) {
    const pin = new T.Mesh(pinGeo, pinMat)
    pin.position.set(0, board.top, sgn * len / 2)
    pin.castShadow = true
    const head = new T.Mesh(headGeo, headMat)
    head.position.set(0, y + 0.12, sgn * len / 2)
    head.castShadow = true
    group.add(pin, head)
  }
  if (axis === 'h') group.rotation.y = Math.PI / 2
  board.group.add(group)
  let k = 1, want = 1, t = 0
  const apply = () => {
    group.visible = k > 0.01
    threadMat.opacity = k; threadMat.transparent = k < 1
    glowMat.opacity = k * (0.26 + Math.sin(t * 2.6) * 0.08)
    group.scale.set(1, 1, 0.3 + 0.7 * k)
  }
  return {
    group,
    set(v) { want = v },
    update(dt) {
      t += dt
      k += (want - k) * Math.min(1, dt * 6)
      if (Math.abs(want - k) < 0.005) k = want
      apply()
    },
    dispose() {
      threadGeo.dispose(); threadMat.dispose(); glowGeo.dispose(); glowMat.dispose(); tex.dispose()
      pinGeo.dispose(); headGeo.dispose(); pinMat.dispose(); headMat.dispose()
      group.removeFromParent()
    }
  }
}

/* ---------- Le fer à repasser ---------- */

/** Un petit fer tout rond, bleu ciel, semelle d'acier, poignée blanche. Son
    origine est au milieu du dessous de la semelle, le nez vers +X. */
export function ironModel(T: T3, L: number) {
  const group = new T.Group()
  const Wd = L * 0.6
  const outline = (k: number) => {
    const s = new T.Shape(), l = L * k, w = Wd * k, r = l * 0.13
    s.moveTo(-l / 2 + r, -w / 2)
    s.lineTo(-l * 0.06, -w / 2)
    s.quadraticCurveTo(l * 0.34, -w / 2, l / 2, 0)
    s.quadraticCurveTo(l * 0.34, w / 2, -l * 0.06, w / 2)
    s.lineTo(-l / 2 + r, w / 2)
    s.quadraticCurveTo(-l / 2, w / 2, -l / 2, w / 2 - r)
    s.lineTo(-l / 2, -w / 2 + r)
    s.quadraticCurveTo(-l / 2, -w / 2, -l / 2 + r, -w / 2)
    return s
  }
  const steel = new T.MeshStandardMaterial({ color: 0xB9C0CA, metalness: 0.85, roughness: 0.26 })
  const shell = new T.MeshPhysicalMaterial({ color: 0x2F93C8, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.12 })
  const white = new T.MeshPhysicalMaterial({ color: 0xEDE7E0, roughness: 0.35, clearcoat: 0.5 })
  const coral = new T.MeshPhysicalMaterial({ color: 0xE8574C, roughness: 0.3, clearcoat: 0.6 })
  const lamp = new T.MeshStandardMaterial({ color: 0xFFB347, emissive: 0xFF8A1E, emissiveIntensity: 1.6 })
  const geos: import('three').BufferGeometry[] = []
  const add = (geo: import('three').BufferGeometry, mat: import('three').Material, y = 0) => {
    geos.push(geo)
    const m = new T.Mesh(geo, mat)
    m.position.y = y
    m.castShadow = true
    m.receiveShadow = true
    group.add(m)
    return m
  }
  const soleH = L * 0.06
  add(slab(T, outline(1), soleH, L * 0.012, 2), steel)
  const bodyGeo = slab(T, outline(0.93), L * 0.13, L * 0.1, 6)
  add(bodyGeo, shell, soleH * 0.9)
  const topY = soleH * 0.9 + bodyGeo.boundingBox!.max.y - bodyGeo.boundingBox!.min.y
  // La poignée : une anse arrondie de l'arrière vers le nez
  const curve = new T.CatmullRomCurve3([
    new T.Vector3(-L * 0.36, topY - L * 0.04, 0),
    new T.Vector3(-L * 0.33, topY + L * 0.2, 0),
    new T.Vector3(-L * 0.08, topY + L * 0.27, 0),
    new T.Vector3(L * 0.14, topY + L * 0.2, 0),
    new T.Vector3(L * 0.22, topY - L * 0.03, 0)
  ])
  add(new T.TubeGeometry(curve, 40, L * 0.055, 12), white)
  add(new T.SphereGeometry(L * 0.055, 12, 10), white).position.copy(curve.getPoint(0))
  add(new T.SphereGeometry(L * 0.055, 12, 10), white).position.copy(curve.getPoint(1))
  // Le bouton de température et le voyant allumé
  const dial = add(new T.CylinderGeometry(L * 0.07, L * 0.075, L * 0.035, 20), coral, topY - L * 0.012)
  dial.position.x = -L * 0.02
  const light = add(new T.SphereGeometry(L * 0.028, 12, 10), lamp, topY - L * 0.03)
  light.position.x = -L * 0.3
  light.castShadow = false
  return {
    group,
    dispose() {
      geos.forEach(g => g.dispose())
      steel.dispose(); shell.dispose(); white.dispose(); coral.dispose(); lamp.dispose()
      group.removeFromParent()
    }
  }
}

/* ---------- Le repassage ---------- */
export interface Ironing {
  /** Avance l'animation ; renvoie true quand tout est fini (fer et papier partis). */
  update(dt: number): boolean
  dispose(): void
}

/** Le papier sulfurisé se pose sur les perles, le fer descend et passe en
    zigzag (chaque perle fond quand la semelle passe dessus, le papier
    s'enfonce avec elles), la vapeur monte ; puis le fer repart et le papier
    s'envole. Tout se passe dans la plaque (`board.group`). Les rappels
    donnent de quoi faire la vapeur et le grésillement dans la scène du jeu. */
export function ironing(T: T3, board: Pegboard, o: {
  steam?: (worldPos: V3) => void
  sizzle?: () => void
  land?: () => void
  lift?: () => void
} = {}): Ironing {
  const { cols, rows, top } = board
  const size = Math.max(cols, rows)
  const L = size * 0.36
  const iron = ironModel(T, L)
  iron.group.visible = false
  board.group.add(iron.group)
  // Le papier : une feuille crème translucide, un peu froissée
  const PW = cols + 1.8, PD = rows + 1.8
  const paperGeo = new T.PlaneGeometry(PW, PD, 24, 24)
  paperGeo.rotateX(-Math.PI / 2)
  const pos = paperGeo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    pos.setY(i, Math.sin(x * 1.3 + z * 0.4) * 0.025 + Math.sin(z * 2.1 - x * 0.7) * 0.02)
  }
  paperGeo.computeVertexNormals()
  const paperMat = new T.MeshStandardMaterial({ color: 0xF4ECDC, roughness: 0.85, transparent: true, opacity: 0.66, side: T.DoubleSide, depthWrite: false })
  const paper = new T.Mesh(paperGeo, paperMat)
  paper.receiveShadow = true
  paper.visible = false
  board.group.add(paper)

  // Le chemin du fer : trois allers-retours en S, un peu au-delà des bords
  const X = (cols - 1) / 2 + 0.5, Z = (rows - 1) / 2
  const lanes = [-Z * 0.62, 0, Z * 0.62]
  const path = new T.CatmullRomCurve3([
    new T.Vector3(-X - 0.8, 0, lanes[0]), new T.Vector3(X, 0, lanes[0]),
    new T.Vector3(X + 0.6, 0, (lanes[0] + lanes[1]) / 2),
    new T.Vector3(X, 0, lanes[1]), new T.Vector3(-X, 0, lanes[1]),
    new T.Vector3(-X - 0.6, 0, (lanes[1] + lanes[2]) / 2),
    new T.Vector3(-X, 0, lanes[2]), new T.Vector3(X + 0.8, 0, lanes[2])
  ], false, 'centripetal')
  const SWEEP = 3.2
  const T_PAPER = 0.7, T_DOWN = 1.25, T_SWEEP = T_DOWN + SWEEP, T_UP = T_SWEEP + 0.6, T_END = T_UP + 0.75
  let t = 0, steamT = 0, sizzleT = 0, landed = false, lifted = false
  const pt = new T.Vector3(), tg = new T.Vector3(), wp = new T.Vector3()
  const ease = (k: number) => k * k * (3 - 2 * k)
  const reach = { along: L * 0.55, across: L * 0.6 * 0.72 }
  /** Le papier s'enfonce avec les perles, mais seulement quand TOUTES ont
      fondu (sinon celles d'à côté le percent) : c'est la moins fondue qui compte. */
  let melt = 0
  const paperY = () => top + BEAD.h + (FUSED.h - BEAD.h) * melt + 0.09

  const fuseUnder = (x: number, z: number, heading: number, dt: number) => {
    const ca = Math.cos(heading), sa = Math.sin(heading)
    let least = 1
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (board.get(c, r) === null) continue
      const bx = c - (cols - 1) / 2 - x, bz = r - (rows - 1) / 2 - z
      const u = bx * ca + bz * sa, w = -bx * sa + bz * ca
      const d = (u / reach.along) ** 2 + (w / reach.across) ** 2
      let k = board.fusion(c, r)
      if (d < 1) { k = Math.min(1, k + dt * 3.2 * (1.2 - d)); board.fuse(c, r, k) }
      least = Math.min(least, k)
    }
    return least
  }

  return {
    update(dt) {
      t += dt
      // 1. Le papier glisse depuis la gauche et se pose
      if (t < T_UP) {
        paper.visible = true
        const k = ease(Math.min(1, t / T_PAPER))
        paper.position.set(-(1 - k) * (PW * 1.2), paperY() + (1 - k) * 2.5, 0)
        paper.rotation.set(0, (1 - k) * 0.35, (1 - k) * 0.25)
      }
      // 2. Le fer descend au début du chemin, puis 3. repasse en S
      if (t >= T_PAPER * 0.6 && t < T_UP) {
        iron.group.visible = true
        const along = t < T_DOWN ? 0 : ease(Math.min(1, (t - T_DOWN) / SWEEP))
        path.getPointAt(along, pt)
        path.getTangentAt(Math.min(0.999, Math.max(0.001, along)), tg)
        const heading = Math.atan2(tg.z, tg.x)
        let y = paperY() + 0.02
        if (t < T_DOWN) {
          const k = (t - T_PAPER * 0.6) / (T_DOWN - T_PAPER * 0.6)
          y += (1 - ease(Math.min(1, k))) * size * 0.7
        } else {
          if (!landed) { landed = true; o.land?.() }
          y += Math.abs(Math.sin(t * 9)) * 0.03 // il appuie, il frotte
          melt = fuseUnder(pt.x, pt.z, heading, dt)
          steamT -= dt
          if (steamT <= 0 && o.steam) {
            steamT = 0.06
            wp.set(pt.x - Math.cos(heading) * L * 0.45, y + L * 0.12, pt.z - Math.sin(heading) * L * 0.45)
            o.steam(board.group.localToWorld(wp.clone()))
          }
          sizzleT -= dt
          if (sizzleT <= 0) { sizzleT = 0.42; o.sizzle?.() }
        }
        iron.group.position.set(pt.x, y, pt.z)
        iron.group.rotation.y = -heading
      }
      // 4. Il repart vers le haut ; ce qui n'a pas fondu finit de fondre
      if (t >= T_SWEEP) {
        if (!lifted) { lifted = true; o.lift?.() }
        let least = 1
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          if (board.get(c, r) === null) continue
          const k = Math.min(1, board.fusion(c, r) + dt * 2.5)
          board.fuse(c, r, k)
          least = Math.min(least, k)
        }
        melt = least
        const k = ease(Math.min(1, (t - T_SWEEP) / (T_UP - T_SWEEP)))
        path.getPointAt(1, pt)
        iron.group.position.set(pt.x + k * size * 0.5, paperY() + 0.02 + k * size * 0.9, pt.z - k * size * 0.3)
        iron.group.visible = k < 1
        // 5. Le papier se soulève d'un coin et s'envole
        if (t >= T_UP - 0.2) {
          const kp = ease(Math.min(1, (t - (T_UP - 0.2)) / (T_END - T_UP + 0.2)))
          paper.position.set(-kp * PW * 0.9, paperY() + kp * size * 0.5, -kp * 1.5)
          paper.rotation.set(-kp * 0.6, kp * 0.5, kp * 0.9)
          paperMat.opacity = 0.66 * (1 - kp)
        }
      }
      if (t >= T_END) { paper.visible = false; iron.group.visible = false; return true }
      return false
    },
    dispose() {
      iron.dispose()
      paperGeo.dispose(); paperMat.dispose()
      paper.removeFromParent()
    }
  }
}
