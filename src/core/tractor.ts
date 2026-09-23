import type { T3 } from './three3d'

/* Le tracteur de la ferme — né dans la Course (elle est au volant), sorti
   ici le 23/09 pour que le Potager l'attelle à sa remorque de récolte.
   Origine au sol, capot vers +x, remorque derrière (vers −x). */

export interface Tractor {
  g: import('three').Group
  /** Les six roues : à faire tourner autour de z quand il roule. */
  wheels: import('three').Group[]
  /** Le plateau de la remorque, où s'empilent les récoltes. */
  load: import('three').Group
}

/** Le tracteur, avec sa remorque. Tout est fait de caisses et de cylindres,
    mais assemblés comme un vrai : capot arrondi, calandre, phares, cabine à
    montants, siège, volant, garde-boue, cheminée, et des roues à crampons —
    c'est le crampon qui rend la rotation visible. La remorque a un groupe
    `load` où les récoltes s'empilent. */
export function makeTractor(T: T3): Tractor {
  const g = new T.Group()
  const m = (color: number, roughness = 0.6, metalness = 0) => new T.MeshStandardMaterial({ color, roughness, metalness })
  const red = m(0x9E2E22, 0.45, 0.15), redDark = m(0x76231A, 0.5, 0.1)
  const rubber = m(0x2A2826, 0.9), tread = m(0x403C3A, 0.9), hub = m(0xC9A227, 0.4, 0.3)
  const dark = m(0x22201E, 0.7), steel = m(0x8A8F96, 0.35, 0.6), wood = m(0x8A6A3E, 0.8)
  const glass = new T.MeshStandardMaterial({ color: 0x9EC7D8, roughness: 0.1, transparent: true, opacity: 0.5 })
  const lamp = new T.MeshStandardMaterial({ color: 0xFFE9A0, emissive: 0xFFD060, emissiveIntensity: 0.9 })
  const box = (mat: import('three').Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0, into: import('three').Object3D = g) => {
    const b = new T.Mesh(new T.BoxGeometry(sx, sy, sz), mat)
    b.position.set(x, y, z); b.rotation.set(rx, ry, rz); b.castShadow = true
    into.add(b); return b
  }
  const cyl = (mat: import('three').Material, x: number, y: number, z: number, r: number, h: number, rx = 0, ry = 0, rz = 0, into: import('three').Object3D = g, rTop = r) => {
    const c = new T.Mesh(new T.CylinderGeometry(rTop, r, h, 18), mat)
    c.position.set(x, y, z); c.rotation.set(rx, ry, rz); c.castShadow = true
    into.add(c); return c
  }
  // Châssis et capot
  box(dark, 0.06, 0.3, 0, 0.92, 0.12, 0.36)
  box(red, 0.34, 0.5, 0, 0.52, 0.24, 0.34)
  const top = cyl(red, 0.34, 0.62, 0, 0.17, 0.52, 0, 0, Math.PI / 2)
  top.scale.x = 0.55 // aplati : le capot est bombé, pas rond
  box(dark, 0.61, 0.48, 0, 0.04, 0.2, 0.26)
  cyl(lamp, 0.62, 0.56, 0.11, 0.035, 0.03, 0, 0, Math.PI / 2)
  cyl(lamp, 0.62, 0.56, -0.11, 0.035, 0.03, 0, 0, Math.PI / 2)
  cyl(dark, 0.46, 0.8, 0.1, 0.03, 0.34)
  cyl(dark, 0.46, 0.99, 0.1, 0.05, 0.035)
  // Cabine : plancher, panneau arrière, quatre montants, toit, pare-brise
  box(redDark, -0.16, 0.42, 0, 0.42, 0.06, 0.36)
  box(red, -0.36, 0.62, 0, 0.05, 0.36, 0.36)
  for (const x of [0.03, -0.35]) for (const z of [-0.17, 0.17]) box(steel, x, 0.72, z, 0.03, 0.5, 0.03)
  box(red, -0.16, 0.99, 0, 0.48, 0.05, 0.42)
  box(glass, 0.03, 0.74, 0, 0.015, 0.42, 0.3)
  // Siège, dossier, volant
  box(dark, -0.22, 0.5, 0, 0.2, 0.08, 0.22)
  box(dark, -0.31, 0.62, 0, 0.05, 0.22, 0.22)
  const wheel = new T.Mesh(new T.TorusGeometry(0.07, 0.012, 8, 20), steel)
  wheel.position.set(-0.04, 0.66, 0); wheel.rotation.y = Math.PI / 2; wheel.rotation.x = 0.35
  g.add(wheel)
  // Garde-boue au-dessus des roues arrière
  box(red, -0.2, 0.6, 0.27, 0.42, 0.04, 0.14)
  box(red, -0.2, 0.6, -0.27, 0.42, 0.04, 0.14)

  const wheels: import('three').Group[] = []
  const mkWheel = (r: number, w: number, x: number, z: number, into: import('three').Object3D = g) => {
    const wg = new T.Group()
    const tire = new T.Mesh(new T.CylinderGeometry(r, r, w, 20), rubber)
    tire.rotation.x = Math.PI / 2; tire.castShadow = true
    const cap = new T.Mesh(new T.CylinderGeometry(r * 0.45, r * 0.45, w + 0.012, 12), hub)
    cap.rotation.x = Math.PI / 2
    wg.add(tire, cap)
    // Les crampons : dix pavés autour de la bande de roulement
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      const lug = new T.Mesh(new T.BoxGeometry(0.05, r * 0.28, w + 0.024), tread)
      lug.position.set(Math.cos(a) * r, Math.sin(a) * r, 0)
      lug.rotation.z = a
      wg.add(lug)
    }
    wg.position.set(x, r, z)
    into.add(wg)
    wheels.push(wg)
  }
  mkWheel(0.28, 0.16, -0.2, 0.27); mkWheel(0.28, 0.16, -0.2, -0.27)
  mkWheel(0.16, 0.11, 0.42, 0.21); mkWheel(0.16, 0.11, 0.42, -0.21)

  // La remorque en bois, attelée derrière
  box(steel, -0.56, 0.27, 0, 0.3, 0.03, 0.03)
  box(wood, -0.98, 0.32, 0, 0.66, 0.06, 0.5)
  box(wood, -0.98, 0.42, 0.25, 0.66, 0.14, 0.03)
  box(wood, -0.98, 0.42, -0.25, 0.66, 0.14, 0.03)
  box(wood, -0.66, 0.42, 0, 0.03, 0.14, 0.5)
  box(wood, -1.3, 0.42, 0, 0.03, 0.14, 0.5)
  mkWheel(0.14, 0.1, -1.05, 0.28); mkWheel(0.14, 0.1, -1.05, -0.28)
  const load = new T.Group()
  load.position.set(-0.98, 0.35, 0)
  g.add(load)

  g.traverse(o => { if ((o as import('three').Mesh).isMesh) o.castShadow = true })
  return { g, wheels, load }
}
