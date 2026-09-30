import type { T3 } from './three3d'

/* 🚂 Le petit train de la ferme (28/09), sorti des Suites logiques le 30/09
   pour servir aussi de coloriage dans l'Atelier (core/lineart.ts) : une
   locomotive rouge et verte, sa cheminée, ses roues dorées, et des wagons de
   bois à ridelles. Le jeu y ajoute ses animaux, son anneau et sa fumée. */

/** Couleur des ridelles au départ ; longueurs d'un wagon et de la locomotive. */
export const TRAIN_BOARD = 0x9C6B45
export const TRAIN_WAGON = 1.25, TRAIN_LOCO = 2.2

export interface TrainParts {
  box: import('three').BoxGeometry
  cyl: import('three').CylinderGeometry
  sph: import('three').SphereGeometry
  ring: import('three').TorusGeometry
  dark: import('three').MeshStandardMaterial
  wood: import('three').MeshStandardMaterial
  red: import('three').MeshStandardMaterial
  green: import('three').MeshStandardMaterial
  gold: import('three').MeshStandardMaterial
  steel: import('three').MeshStandardMaterial
  lamp: import('three').MeshStandardMaterial
  glow: import('three').MeshStandardMaterial
  glass: import('three').MeshStandardMaterial
}

export function trainParts(T: T3): TrainParts {
  const std = (color: number, roughness = 0.6, metalness = 0, extra: Record<string, unknown> = {}) =>
    new T.MeshStandardMaterial({ color, roughness, metalness, ...extra })
  return {
    box: new T.BoxGeometry(1, 1, 1),
    cyl: new T.CylinderGeometry(1, 1, 1, 28),
    sph: new T.SphereGeometry(1, 24, 16),
    ring: new T.TorusGeometry(0.3, 0.045, 12, 40),
    dark: std(0x2E2A28, 0.55, 0.3),
    wood: std(0x7A4B2A, 0.85),
    red: std(0xA3261F, 0.4, 0.1),
    green: std(0x24613B, 0.5),
    gold: std(0xB8892E, 0.3, 0.9),
    steel: std(0x8E959C, 0.35, 0.85),
    lamp: std(0xFFE7A0, 0.3, 0, { emissive: 0xFFC94D, emissiveIntensity: 1.2 }),
    glow: std(0xFFD34D, 0.3, 0, { emissive: 0xFFB300, emissiveIntensity: 0.9, transparent: true, opacity: 0.9 }),
    glass: std(0x2B3B48, 0.15, 0.2)
  }
}

function add(T: T3, parent: import('three').Object3D, geo: import('three').BufferGeometry, mat: import('three').Material,
  pos: [number, number, number], scale: [number, number, number], rot: [number, number, number] = [0, 0, 0]) {
  const m = new T.Mesh(geo, mat)
  m.position.set(...pos); m.scale.set(...scale); m.rotation.set(...rot)
  m.castShadow = true; m.receiveShadow = true
  parent.add(m)
  return m
}

/** Une roue : le rayon, et un moyeu doré ; elle tourne autour de z. */
function wheel(T: T3, P: TrainParts, parent: import('three').Object3D, x: number, z: number, r: number, wheels: import('three').Object3D[]) {
  const w = new T.Group()
  w.position.set(x, r, z)
  add(T, w, P.cyl, P.red, [0, 0, 0], [r, 0.08, r], [Math.PI / 2, 0, 0])
  add(T, w, P.cyl, P.gold, [0, 0, z > 0 ? 0.045 : -0.045], [r * 0.35, 0.03, r * 0.35], [Math.PI / 2, 0, 0])
  // Un rayon, pour voir la roue tourner
  add(T, w, P.box, P.dark, [0, 0, z > 0 ? 0.042 : -0.042], [r * 1.7, r * 0.18, 0.02])
  parent.add(w)
  wheels.push(w)
}

export interface TrainModel {
  g: import('three').Group
  wagons: { g: import('three').Group; boards: import('three').MeshStandardMaterial }[]
  wheels: import('three').Object3D[]
  length: number
  chimney: import('three').Object3D
}

/** La locomotive (elle mène à gauche : le train roule vers −x) et `n` wagons. */
export function trainModel(T: T3, P: TrainParts, n: number): TrainModel {

  const g = new T.Group()
  const wheels: import('three').Object3D[] = []
  // La locomotive, qui mène à gauche (le train roule vers −x)
  const loco = new T.Group()
  add(T, loco, P.box, P.dark, [0, 0.31, 0], [2.0, 0.14, 0.66])
  add(T, loco, P.cyl, P.red, [-0.25, 0.72, 0], [0.34, 1.15, 0.34], [0, 0, Math.PI / 2])
  add(T, loco, P.cyl, P.dark, [-0.86, 0.72, 0], [0.35, 0.14, 0.35], [0, 0, Math.PI / 2])
  for (const bx of [-0.62, 0.12]) add(T, loco, P.cyl, P.gold, [bx, 0.72, 0], [0.355, 0.05, 0.355], [0, 0, Math.PI / 2])
  add(T, loco, P.cyl, P.dark, [-0.62, 1.2, 0], [0.1, 0.4, 0.1])
  add(T, loco, P.cyl, P.dark, [-0.62, 1.42, 0], [0.16, 0.1, 0.16])
  add(T, loco, P.sph, P.gold, [-0.08, 1.06, 0], [0.14, 0.14, 0.14])
  add(T, loco, P.cyl, P.lamp, [-0.95, 0.98, 0], [0.08, 0.06, 0.08], [0, 0, Math.PI / 2])
  // La cabine, son toit, ses fenêtres
  add(T, loco, P.box, P.green, [0.6, 0.83, 0], [0.64, 0.72, 0.8])
  add(T, loco, P.box, P.red, [0.62, 1.23, 0], [0.84, 0.08, 0.94])
  for (const z of [-0.41, 0.41]) add(T, loco, P.box, P.glass, [0.6, 0.98, z], [0.34, 0.26, 0.02])
  // Le chasse-pierres
  add(T, loco, P.box, P.red, [-1.06, 0.22, 0], [0.18, 0.2, 0.64], [0, 0, 0.55])
  for (const z of [-0.34, 0.34]) {
    wheel(T, P, loco, 0.05, z, 0.25, wheels)
    wheel(T, P, loco, 0.6, z, 0.25, wheels)
    wheel(T, P, loco, -0.68, z, 0.15, wheels)
  }
  g.add(loco)
  const chimney = new T.Object3D()
  chimney.position.set(-0.62, 1.5, 0)
  loco.add(chimney)
  // Les wagons, à la suite
  const wagons: TrainModel['wagons'] = []
  for (let i = 0; i < n; i++) {
    const w = new T.Group()
    w.position.x = TRAIN_LOCO / 2 + 0.08 + TRAIN_WAGON * (i + 0.5)
    const boards = new T.MeshStandardMaterial({ color: TRAIN_BOARD, roughness: 0.7 })
    add(T, w, P.box, P.dark, [0, 0.29, 0], [1.02, 0.12, 0.6])
    add(T, w, P.box, P.wood, [0, 0.38, 0], [1.1, 0.06, 0.8])
    for (const z of [-0.39, 0.39]) add(T, w, P.box, boards, [0, 0.49, z], [1.1, 0.18, 0.05])
    for (const x of [-0.53, 0.53]) add(T, w, P.box, boards, [x, 0.49, 0], [0.05, 0.18, 0.8])
    add(T, w, P.box, P.dark, [-0.6, 0.29, 0], [0.16, 0.06, 0.08])
    for (const z of [-0.33, 0.33]) { wheel(T, P, w, -0.32, z, 0.15, wheels); wheel(T, P, w, 0.32, z, 0.15, wheels) }
    g.add(w)
    wagons.push({ g: w, boards })
  }
  const length = TRAIN_LOCO + n * TRAIN_WAGON
  return { g, wagons, wheels, length, chimney }
}

