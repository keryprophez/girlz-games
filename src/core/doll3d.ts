import type { T3 } from './three3d'
import type { Look } from './character'

/* Le personnage des filles, en 3D (23/09) — la petite fille qu'elles habillent
   dans Habille-toi, construite en formes rondes comme les animaux de
   `core/critters.ts` : une grosse tête, un petit corps, des bras qui bougent.
   Elle vient ensuite jouer avec elles : au volant du tracteur, sur l'écran de
   fin (elle danse, ou elle encourage), en bas de l'accueil.

   Origine AUX PIEDS, regard vers +z, hauteur `size` debout. Le look (tenue,
   cheveux, chapeau, lunettes, objet à la main) vient de `core/character.ts`.
   Couleurs assombries : sous hemi + soleil + IBL, l'ACES remonte tout
   (piège « couleurs vives + ACES »). */

type Obj = import('three').Object3D
type Grp = import('three').Group

export type DollPose = 'idle' | 'cheer' | 'wave' | 'sit' | 'walk' | 'stride'

export interface Doll {
  obj: Grp
  /** Le corps entier, qu'on fait sauter sans bouger l'origine. */
  rig: Grp
  head: Grp
  armL: Grp
  armR: Grp
  legL: Grp
  legR: Grp
  eyes: Obj[]
  blinkIn: number
  dispose(): void
}

export function makeDoll(T: T3, look: Look, size = 1): Doll {
  const S = size
  const geos: import('three').BufferGeometry[] = []
  const mats: import('three').Material[] = []
  const g = <G extends import('three').BufferGeometry>(x: G) => { geos.push(x); return x }
  const mat = (c: number | string, rough = 0.7, dim = 1) => {
    const m = new T.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0 })
    if (dim !== 1) m.color.multiplyScalar(dim)
    mats.push(m)
    return m
  }
  const sphere = g(new T.SphereGeometry(1, 22, 16))
  const capsule = g(new T.CapsuleGeometry(1, 1, 4, 12))
  const cyl = g(new T.CylinderGeometry(1, 1, 1, 18))
  const cone = g(new T.ConeGeometry(1, 1, 18))
  const skin = mat(0xE7AE86, 0.75)
  const outfit = mat(look.color, 0.65, 0.78)
  const outfitDark = mat(look.color, 0.7, 0.55)
  const hair = mat(look.hairColor, 0.55, 0.9)
  const ink = mat(0x1E1A18, 0.35)
  const white = mat(0xF2F2F2, 0.4)
  const pink = mat(0xE26F86, 0.6)
  const shoe = mat(0x5A3A2E, 0.6)

  const part = (geo: import('three').BufferGeometry, m: import('three').Material, x: number, y: number, z: number,
    sx: number, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) => {
    const mesh = new T.Mesh(geo, m)
    mesh.position.set(x * S, y * S, z * S)
    mesh.scale.set(sx * S, sy * S, sz * S)
    mesh.rotation.set(rx, ry, rz)
    mesh.castShadow = true
    return mesh
  }

  const obj = new T.Group()
  const rig = new T.Group()
  obj.add(rig)

  /* --- Jambes (pivot à la hanche) et chaussures --- */
  const leg = (side: number) => {
    const p = new T.Group()
    p.position.set(side * 0.07 * S, 0.27 * S, 0)
    p.add(part(capsule, look.outfit === 'tee' ? mat(0x3E5C8A, 0.8) : skin, 0, -0.13, 0, 0.05, 0.1, 0.05))
    p.add(part(sphere, shoe, 0, -0.245, 0.025, 0.06, 0.04, 0.085))
    rig.add(p)
    return p
  }
  const legL = leg(1), legR = leg(-1)

  /* --- Corps : robe évasée, ou tee-shirt + short --- */
  if (look.outfit === 'dress') {
    // Évasée : un tronc de cône, le haut plus étroit que l'ourlet
    rig.add(part(g(new T.CylinderGeometry(0.5, 1, 1, 22)), outfit, 0, 0.39, 0, 0.2, 0.3, 0.2))
    rig.add(part(sphere, outfitDark, 0, 0.255, 0, 0.205, 0.03, 0.205)) // l'ourlet
    rig.add(part(sphere, white, 0, 0.47, 0.085, 0.03))                  // un bouton
  } else {
    rig.add(part(cyl, outfit, 0, 0.44, 0, 0.13, 0.2, 0.12))
    rig.add(part(sphere, outfit, 0, 0.54, 0, 0.13, 0.05, 0.12))
    rig.add(part(cyl, mat(0x3E5C8A, 0.8), 0, 0.3, 0, 0.135, 0.09, 0.125))
  }

  /* --- Bras (pivot à l'épaule), main au bout --- */
  const arm = (side: number) => {
    const p = new T.Group()
    p.position.set(side * 0.13 * S, 0.52 * S, 0)
    p.add(part(sphere, outfit, 0, 0, 0, 0.055))
    p.add(part(capsule, skin, side * 0.01, -0.1, 0, 0.038, 0.1, 0.038))
    p.add(part(sphere, skin, side * 0.012, -0.19, 0, 0.045))
    rig.add(p)
    return p
  }
  const armL = arm(1), armR = arm(-1)

  /* --- Tête --- */
  const head = new T.Group()
  head.position.set(0, 0.72 * S, 0)
  rig.add(head)
  head.add(part(sphere, skin, 0, 0, 0, 0.2))
  const eyes: Obj[] = []
  for (const side of [-1, 1]) {
    const e = new T.Group()
    e.position.set(side * 0.07 * S, 0.02 * S, 0.178 * S)
    e.add(part(sphere, ink, 0, 0, 0, 0.028, 0.034, 0.02))
    e.add(part(sphere, white, 0.009 * side, 0.012, 0.012, 0.009))
    head.add(e)
    eyes.push(e)
    head.add(part(sphere, pink, side * 0.12, -0.05, 0.15, 0.035, 0.022, 0.012))
  }
  const smile = new T.Mesh(g(new T.TorusGeometry(0.045 * S, 0.009 * S, 6, 14, Math.PI)), ink)
  smile.position.set(0, -0.055 * S, 0.188 * S)
  smile.rotation.z = Math.PI
  head.add(smile)

  /* --- Cheveux : une calotte + couettes, ou cheveux longs dans le dos --- */
  const cap = new T.Mesh(g(new T.SphereGeometry(0.212 * S, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5)), hair)
  cap.position.set(0, 0.035 * S, -0.012 * S)
  cap.rotation.x = -0.28
  cap.castShadow = true
  head.add(cap)
  if (look.hair === 'pigtails') {
    for (const side of [-1, 1]) {
      head.add(part(sphere, hair, side * 0.215, -0.01, -0.04, 0.085))
      head.add(part(sphere, pink, side * 0.17, 0.07, -0.02, 0.028))
    }
  } else {
    head.add(part(sphere, hair, 0, -0.1, -0.1, 0.2, 0.28, 0.12))
  }

  /* --- Chapeau --- */
  const gold = () => mat(0xD4A017, 0.35)
  if (look.hat === 'crown') {
    const c = new T.Mesh(g(new T.CylinderGeometry(0.1 * S, 0.11 * S, 0.07 * S, 18, 1, true)), gold())
    c.position.y = 0.22 * S
    head.add(c)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      head.add(part(cone, gold(), Math.sin(a) * 0.1, 0.28, Math.cos(a) * 0.1, 0.022, 0.06, 0.022))
    }
    head.add(part(sphere, mat(0xC0392B, 0.3), 0, 0.22, 0.11, 0.018))
  } else if (look.hat === 'cap') {
    const red = mat(0xB8302A, 0.6)
    const dome = new T.Mesh(g(new T.SphereGeometry(0.218 * S, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5)), red)
    dome.position.y = 0.04 * S
    head.add(dome)
    head.add(part(sphere, red, 0, 0.05, 0.2, 0.13, 0.015, 0.1))
  } else if (look.hat === 'sunhat') {
    const straw = mat(0xC9A45C, 0.9)
    head.add(part(cyl, straw, 0, 0.14, 0, 0.32, 0.012, 0.32))
    const dome = new T.Mesh(g(new T.SphereGeometry(0.17 * S, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)), straw)
    dome.position.y = 0.14 * S
    head.add(dome)
    head.add(part(cyl, pink, 0, 0.16, 0, 0.172, 0.03, 0.172))
  } else if (look.hat === 'party') {
    head.add(part(cone, mat(0x8C6FD6, 0.6), 0, 0.33, 0, 0.09, 0.24, 0.09))
    head.add(part(sphere, mat(0xE0B23A, 0.5), 0, 0.46, 0, 0.035))
  }

  /* --- Lunettes --- */
  if (look.glasses === 'round') {
    for (const side of [-1, 1]) {
      const r = new T.Mesh(g(new T.TorusGeometry(0.045 * S, 0.008 * S, 6, 18)), ink)
      r.position.set(side * 0.07 * S, 0.02 * S, 0.19 * S)
      head.add(r)
    }
    head.add(part(cyl, ink, 0, 0.025, 0.2, 0.006, 0.05, 0.006, 0, 0, Math.PI / 2))
  } else if (look.glasses === 'sun') {
    for (const side of [-1, 1]) head.add(part(sphere, ink, side * 0.07, 0.02, 0.19, 0.05, 0.038, 0.015))
    head.add(part(cyl, ink, 0, 0.03, 0.2, 0.006, 0.05, 0.006, 0, 0, Math.PI / 2))
  }

  /* --- Ce qu'elle tient dans la main droite --- */
  const hand = new T.Group()
  hand.position.set(-0.012 * S, -0.19 * S, 0.02 * S)
  armR.add(hand)
  if (look.held === 'balloon') {
    // Le ballon flotte À CÔTÉ de la tête (au-dessus de la main, il s'y cachait)
    hand.add(part(cyl, white, -0.07, 0.21, 0, 0.003, 0.44, 0.003, 0, 0, 0.32))
    hand.add(part(sphere, mat(0xD6334A, 0.25), -0.14, 0.44, -0.02, 0.09, 0.11, 0.09))
  } else if (look.held === 'wand') {
    hand.add(part(cyl, mat(0x8A5A2E, 0.6), 0, 0.08, 0.02, 0.01, 0.2, 0.01, 0.2))
    const star = new T.Shape()
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 0.022 : 0.055
      if (i === 0) star.moveTo(Math.cos(a) * r * S, -Math.sin(a) * r * S); else star.lineTo(Math.cos(a) * r * S, -Math.sin(a) * r * S)
    }
    const sm = new T.Mesh(g(new T.ExtrudeGeometry(star, { depth: 0.015 * S, bevelEnabled: false })), mat(0xE8B524, 0.3))
    sm.position.set(0, 0.2 * S, 0.04 * S)
    hand.add(sm)
  } else if (look.held === 'flower') {
    hand.add(part(cyl, mat(0x3A8A4A, 0.7), 0, 0.09, 0, 0.008, 0.18, 0.008))
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      hand.add(part(sphere, mat(0xE85C8C, 0.6), Math.sin(a) * 0.035, 0.19, Math.cos(a) * 0.035 + 0.01, 0.028, 0.028, 0.012))
    }
    hand.add(part(sphere, mat(0xE0B23A, 0.5), 0, 0.19, 0.02, 0.022))
  } else if (look.held === 'icecream') {
    hand.add(part(cone, mat(0xC98B4A, 0.8), 0, 0.03, 0, 0.035, 0.1, 0.035, Math.PI))
    hand.add(part(sphere, mat(0xE58AAE, 0.5), 0, 0.1, 0, 0.042))
  }

  obj.traverse(o => { o.castShadow = true })
  return {
    obj, rig, head, armL, armR, legL, legR, eyes, blinkIn: 2,
    dispose() {
      geos.forEach(x => x.dispose())
      mats.forEach(x => x.dispose())
    }
  }
}

/** Pose le personnage au temps `t` (secondes) : chaque pose est une petite
    boucle qu'on peut appeler à chaque image. `dt` fait cligner les yeux. */
export function poseDoll(d: Doll, pose: DollPose, t: number, dt = 0) {
  d.rig.position.set(0, 0, 0)
  d.rig.rotation.set(0, 0, 0)
  d.head.rotation.set(0, 0, 0)
  d.legL.rotation.set(0, 0, 0)
  d.legR.rotation.set(0, 0, 0)
  d.armL.rotation.set(0, 0, 0.12)
  d.armR.rotation.set(0, 0, -0.12)
  const h = d.head.position.y / 0.72 // la taille du personnage
  if (pose === 'idle') {
    d.rig.position.y = Math.sin(t * 2.2) * 0.006 * h
    d.armL.rotation.z = 0.12 + Math.sin(t * 2.2) * 0.05
    d.armR.rotation.z = -0.12 - Math.sin(t * 2.2) * 0.05
    d.head.rotation.z = Math.sin(t * 1.3) * 0.06
  } else if (pose === 'cheer') {
    // Elle saute de joie, les deux bras en l'air
    d.rig.position.y = Math.abs(Math.sin(t * 6)) * 0.14 * h
    d.armL.rotation.z = 2.7 + Math.sin(t * 12) * 0.25
    d.armR.rotation.z = -2.7 - Math.sin(t * 12) * 0.25
    d.head.rotation.z = Math.sin(t * 6) * 0.12
    d.legL.rotation.x = -Math.abs(Math.sin(t * 6)) * 0.4
    d.legR.rotation.x = -Math.abs(Math.sin(t * 6)) * 0.4
  } else if (pose === 'wave') {
    // Coucou d'une main : « encore ! »
    d.armR.rotation.z = -2.5 + Math.sin(t * 9) * 0.35
    d.head.rotation.z = -0.1 + Math.sin(t * 2) * 0.05
    d.rig.position.y = Math.abs(Math.sin(t * 3)) * 0.02 * h
  } else if (pose === 'sit') {
    d.legL.rotation.x = -Math.PI / 2
    d.legR.rotation.x = -Math.PI / 2
    d.armL.rotation.set(-1.1, 0, 0.05)
    d.armR.rotation.set(-1.1, 0, -0.05)
    d.head.rotation.z = Math.sin(t * 2) * 0.05
  } else if (pose === 'walk' || pose === 'stride') {
    // `stride` = le pas suivant (jambes inversées) : deux images suffisent à marcher
    const s = Math.sin(t * 8) * (pose === 'stride' ? -1 : 1)
    d.legL.rotation.x = s * 0.5
    d.legR.rotation.x = -s * 0.5
    d.armL.rotation.x = -s * 0.4
    d.armR.rotation.x = s * 0.4
    d.rig.position.y = Math.abs(Math.cos(t * 8)) * 0.02 * h
  }
  // Clignement : toutes les deux à quatre secondes, 120 ms
  if (dt > 0) {
    d.blinkIn -= dt
    const k = d.blinkIn < 0 ? 0.12 : 1
    for (const e of d.eyes) e.scale.y = k
    if (d.blinkIn < -0.12) d.blinkIn = 2 + Math.random() * 2
  }
}
