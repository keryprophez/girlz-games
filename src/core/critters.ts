import type { T3 } from './three3d'

/* Les petits personnages en 3D — construits en formes rondes, comme le
   Bonhomme de neige, et non plus des planches de sprites plantées dans le
   décor : « un sprite atroce digne d'un Minitel », ont dit les filles de la
   pastille ronde de Tape-Trous (15/09).

   Chaque personnage a l'origine AUX PIEDS (y = 0) et regarde vers +z ; sa
   hauteur vaut `size`. Il est fait de meshes qui partagent des géométries
   unitaires et des matériaux communs (un seul jeu par scène) : en fabriquer
   dix par partie ne coûte rien, et tout se libère d'un coup avec `dispose()`.

   Les couleurs sont volontairement SOMBRES : sous hemi + soleil + IBL,
   l'ACES remonte tout (piège « couleurs vives + ACES » de CLAUDE.md). */

export type CritterKind = 'mole' | 'chick' | 'pig' | 'rabbit' | 'cactus'
/** Les habitants du pré — le cactus n'en est pas un, c'est le piège. */
export const CRITTERS: CritterKind[] = ['mole', 'chick', 'pig', 'rabbit']

type Obj = import('three').Object3D
type Mesh = import('three').Mesh

export interface Critter {
  kind: CritterKind
  obj: import('three').Group
  /** Les yeux (blanc + pupille), pour cligner. */
  eyes: Obj[]
  /** Horloge du clignement, tenue par le personnage lui-même. */
  blinkIn: number
  blinking: number
}

export interface CritterKit {
  make(kind: CritterKind, size: number): Critter
  /** À appeler chaque frame tant que le personnage est visible : il cligne
      des yeux toutes les deux à quatre secondes, 120 ms. */
  blink(c: Critter, dt: number): void
  dispose(): void
}

export function critterKit(T: T3): CritterKit {
  const geos = {
    sphere: new T.SphereGeometry(1, 20, 14),
    cone: new T.ConeGeometry(1, 1, 12),
    cyl: new T.CylinderGeometry(1, 1, 1, 12),
    capsule: new T.CapsuleGeometry(1, 1, 4, 10),
    box: new T.BoxGeometry(1, 1, 1)
  }
  const mat = (color: number, roughness = 0.7) => new T.MeshStandardMaterial({ color, roughness, metalness: 0 })
  const mats = {
    brown: mat(0x5E4030), brownLight: mat(0x8E6D52),
    pink: mat(0xD4788A), pinkDark: mat(0xB85E70),
    yellow: mat(0xD9A72A), orange: mat(0xD4702A),
    cream: mat(0xCFC3B2), white: mat(0xF2F2F2, 0.5), black: mat(0x1E1A18, 0.4),
    green: mat(0x3A8A4A), greenDark: mat(0x2E6E3B), flower: mat(0xE85C8C),
    shine: new T.MeshBasicMaterial({ color: 0xFFFFFF })
  }

  /** Une pièce : géométrie unitaire, matériau partagé, posée et mise à l'échelle. */
  const part = (g: import('three').BufferGeometry, m: import('three').Material,
    x: number, y: number, z: number, sx: number, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0): Mesh => {
    const mesh = new T.Mesh(g, m)
    mesh.position.set(x, y, z)
    mesh.scale.set(sx, sy, sz)
    mesh.rotation.set(rx, ry, rz)
    mesh.castShadow = true
    return mesh
  }

  /** Une paire d'yeux : blanc, pupille noire, reflet — devant à (±dx, y, z). */
  const eyes = (grp: Obj, S: number, dx: number, y: number, z: number, r: number, angry = false): Obj[] => {
    const out: Obj[] = []
    for (const s of [-1, 1]) {
      const e = new T.Group()
      e.position.set(s * dx * S, y * S, z * S)
      e.add(part(geos.sphere, mats.white, 0, 0, 0, r * S))
      e.add(part(geos.sphere, mats.black, 0, 0, r * S * 0.62, r * S * 0.52))
      e.add(part(geos.sphere, mats.shine, r * S * 0.2, r * S * 0.22, r * S * 0.98, r * S * 0.16))
      if (angry) e.add(part(geos.box, mats.greenDark, 0, r * S * 1.15, r * S * 0.5, r * S * 1.9, r * S * 0.45, r * S * 0.5, 0, 0, -s * 0.5))
      grp.add(e)
      out.push(e)
    }
    return out
  }

  const builders: Record<CritterKind, (grp: Obj, S: number) => Obj[]> = {
    mole(grp, S) {
      grp.add(part(geos.sphere, mats.brown, 0, 0.5 * S, 0, 0.42 * S, 0.5 * S, 0.4 * S))
      grp.add(part(geos.sphere, mats.brownLight, 0, 0.4 * S, 0.24 * S, 0.28 * S, 0.32 * S, 0.2 * S))
      grp.add(part(geos.sphere, mats.pink, 0, 0.7 * S, 0.4 * S, 0.075 * S))
      for (const s of [-1, 1]) {
        grp.add(part(geos.sphere, mats.brown, s * 0.24 * S, 0.2 * S, 0.3 * S, 0.1 * S, 0.08 * S, 0.1 * S))
        grp.add(part(geos.sphere, mats.brownLight, s * 0.3 * S, 0.84 * S, -0.02 * S, 0.06 * S))
        // Moustaches : deux fines tiges de chaque côté du museau
        for (const dy of [-0.02, 0.04]) {
          grp.add(part(geos.cyl, mats.cream, s * 0.22 * S, (0.68 + dy) * S, 0.38 * S, 0.006 * S, 0.24 * S, 0.006 * S, 0, 0, Math.PI / 2 + s * 0.18))
        }
      }
      // Une taupe a de tout petits yeux
      return eyes(grp, S, 0.13, 0.76, 0.33, 0.045)
    },
    chick(grp, S) {
      grp.add(part(geos.sphere, mats.yellow, 0, 0.36 * S, 0, 0.4 * S, 0.38 * S, 0.36 * S))
      grp.add(part(geos.sphere, mats.yellow, 0, 0.72 * S, 0.04 * S, 0.27 * S))
      grp.add(part(geos.cone, mats.orange, 0, 0.68 * S, 0.34 * S, 0.07 * S, 0.14 * S, 0.07 * S, Math.PI / 2))
      for (const s of [-1, 1]) {
        grp.add(part(geos.sphere, mats.yellow, s * 0.38 * S, 0.38 * S, 0, 0.08 * S, 0.18 * S, 0.15 * S, 0, 0, s * 0.5))
        grp.add(part(geos.sphere, mats.orange, s * 0.12 * S, 0.02 * S, 0.1 * S, 0.1 * S, 0.03 * S, 0.14 * S))
      }
      grp.add(part(geos.sphere, mats.yellow, 0, 0.99 * S, 0, 0.05 * S))
      grp.add(part(geos.sphere, mats.yellow, -0.07 * S, 0.96 * S, -0.02 * S, 0.045 * S))
      grp.add(part(geos.sphere, mats.yellow, 0.07 * S, 0.96 * S, -0.02 * S, 0.045 * S))
      return eyes(grp, S, 0.11, 0.78, 0.2, 0.07)
    },
    pig(grp, S) {
      grp.add(part(geos.sphere, mats.pink, 0, 0.5 * S, 0, 0.44 * S, 0.46 * S, 0.42 * S))
      grp.add(part(geos.cyl, mats.pinkDark, 0, 0.52 * S, 0.42 * S, 0.12 * S, 0.08 * S, 0.12 * S, Math.PI / 2))
      for (const s of [-1, 1]) {
        grp.add(part(geos.sphere, mats.black, s * 0.045 * S, 0.52 * S, 0.465 * S, 0.025 * S))
        grp.add(part(geos.cone, mats.pink, s * 0.26 * S, 0.88 * S, 0.02 * S, 0.09 * S, 0.16 * S, 0.06 * S, -0.3, 0, s * 0.5))
        grp.add(part(geos.cyl, mats.pinkDark, s * 0.18 * S, 0.05 * S, 0.25 * S, 0.06 * S, 0.1 * S, 0.06 * S))
      }
      return eyes(grp, S, 0.15, 0.68, 0.34, 0.06)
    },
    rabbit(grp, S) {
      grp.add(part(geos.sphere, mats.cream, 0, 0.42 * S, 0, 0.38 * S, 0.42 * S, 0.36 * S))
      grp.add(part(geos.sphere, mats.cream, 0, 0.76 * S, 0.06 * S, 0.25 * S))
      grp.add(part(geos.sphere, mats.pink, 0, 0.72 * S, 0.29 * S, 0.035 * S))
      for (const s of [-1, 1]) {
        grp.add(part(geos.capsule, mats.cream, s * 0.11 * S, 1.1 * S, -0.02 * S, 0.07 * S, 0.16 * S, 0.07 * S, 0, 0, s * 0.15))
        grp.add(part(geos.capsule, mats.pink, s * 0.11 * S, 1.1 * S, 0.02 * S, 0.035 * S, 0.13 * S, 0.02 * S, 0, 0, s * 0.15))
        grp.add(part(geos.box, mats.white, s * 0.022 * S, 0.63 * S, 0.27 * S, 0.035 * S, 0.06 * S, 0.02 * S))
        grp.add(part(geos.sphere, mats.cream, s * 0.2 * S, 0.14 * S, 0.24 * S, 0.11 * S, 0.07 * S, 0.14 * S))
      }
      return eyes(grp, S, 0.1, 0.8, 0.2, 0.06)
    },
    cactus(grp, S) {
      grp.add(part(geos.capsule, mats.green, 0, 0.5 * S, 0, 0.2 * S, 0.28 * S, 0.2 * S))
      for (const s of [-1, 1]) {
        grp.add(part(geos.capsule, mats.green, s * 0.3 * S, 0.5 * S, 0, 0.09 * S, 0.1 * S, 0.09 * S, 0, 0, s * Math.PI / 2))
        grp.add(part(geos.capsule, mats.green, s * 0.38 * S, 0.68 * S, 0, 0.09 * S, 0.1 * S, 0.09 * S))
      }
      // Les épines : de petites pointes claires tout autour du tronc
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, y = 0.3 + (i % 4) * 0.14
        grp.add(part(geos.cone, mats.cream, Math.sin(a) * 0.2 * S, y * S, Math.cos(a) * 0.2 * S,
          0.014 * S, 0.07 * S, 0.014 * S, Math.PI / 2, a, 0))
      }
      // Une fleur sur la tête : cinq pétales et un cœur
      grp.add(part(geos.sphere, mats.yellow, 0, 0.99 * S, 0, 0.05 * S))
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        grp.add(part(geos.sphere, mats.flower, Math.sin(a) * 0.08 * S, 0.98 * S, Math.cos(a) * 0.08 * S, 0.06 * S, 0.03 * S, 0.06 * S))
      }
      // Des sourcils froncés : on voit qu'il ne faut pas le toucher
      return eyes(grp, S, 0.09, 0.66, 0.16, 0.06, true)
    }
  }

  return {
    make(kind, size) {
      const grp = new T.Group()
      const e = builders[kind](grp, size)
      return { kind, obj: grp, eyes: e, blinkIn: 1 + Math.random() * 2.5, blinking: 0 }
    },
    blink(c, dt) {
      if (c.blinking > 0) {
        c.blinking -= dt
        const k = c.blinking > 0 ? 0.12 : 1
        for (const e of c.eyes) e.scale.y = k
        if (c.blinking <= 0) c.blinkIn = 2 + Math.random() * 2.5
        return
      }
      c.blinkIn -= dt
      if (c.blinkIn <= 0) c.blinking = 0.12
    },
    dispose() {
      for (const g of Object.values(geos)) g.dispose()
      for (const m of Object.values(mats)) m.dispose()
    }
  }
}
