import type { T3 } from './three3d'

/* 🎂 LE GÂTEAU de la Pâtisserie (5/10) — modelé ici, rien de Kenney :
   des étages glacés (le nappage déborde du bord en coulures), des rosaces
   de crème en spirale comme sorties d'une poche à douille, des fruits vus
   de près (la fraise et ses grains, la framboise en petites billes, la
   myrtille poudrée, la cerise brillante et sa queue), des vermicelles, des
   perles de sucre, des bougies torsadées et leur flamme, le présentoir en
   porcelaine. Unité : un étage du bas fait ~1 de rayon.
   Tout ce qui se répète est en instances ; les géométries des fruits sont
   faites une fois par kit et partagées. */

type Geo = import('three').BufferGeometry
type Mat = import('three').Material
type Grp = import('three').Group
type Mesh = import('three').Mesh

export type CakeShape = 'round' | 'heart' | 'square'

/** Un étage construit. */
export interface Tier {
  g: Grp
  body: Mesh
  /** Le nappage (dessus, bourrelet, coulures) : caché tant qu'on ne l'a pas versé. */
  glaze: Grp
  bodyMat: import('three').MeshPhysicalMaterial
  glazeMat: import('three').MeshPhysicalMaterial
  /** Son contour (repère de l'étage), tous les ~3 cm. */
  outline: [number, number][]
  h: number
  r: number
  shape: CakeShape
  /** Verser le nappage (la première fois, les coulures descendent) ou le reteindre depuis `at`. */
  pour(color: string, at: import('three').Vector3): void
  step(dt: number): void
}

export interface CakeKit {
  T: T3
  /** Un étage de génoise, rond, en cœur ou carré (rayon ~r). */
  tier(o: { shape: CakeShape; r: number; h: number; body: string; glaze: string; seed?: number }): Tier
  /** Une rosace de crème (posée sur y = 0, ~0,13 de rayon) ; `drop` : une goutte de meringue. */
  rosette(color?: string, drop?: boolean): Mesh
  strawberry(): Grp
  raspberry(): Grp
  blueberry(): Mesh
  cherry(): Grp
  /** Une bougie et sa flamme (la flamme : `userData.flame`). */
  candle(stripe: string): Grp
  /** La part coupée (entre les angles a0 et a1, autour de +z) d'un étage. */
  slice(t: Tier, a0: number, a1: number): Mesh
  /** Les deux faces de coupe que laisse la part dans l'étage. */
  cutFaces(t: Tier, a0: number, a1: number): Mesh[]
  /** Des vermicelles semés sur un disque de rayon r (y = 0). */
  sprinkles(n: number, r: number, seed?: number): import('three').InstancedMesh
  /** Des perles de sucre en couronne (rayon r, y = 0). */
  pearls(n: number, r: number, color?: string): import('three').InstancedMesh
  stand(): Grp
  dispose(): void
}

/** Le contour d'un étage, de « rayon » r, dans le sens des aiguilles vu d'en haut. */
export function outlineOf(shape: CakeShape, r: number): [number, number][] {
  const out: [number, number][] = []
  if (shape === 'round') {
    const n = 96
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; out.push([Math.cos(a) * r, Math.sin(a) * r]) }
  } else if (shape === 'heart') {
    // Le cœur, pointe vers nous (+z), à peu près de la même surface qu'un rond
    const n = 140, s = r / 15.2
    for (let i = 0; i < n; i++) {
      const t = i / n * Math.PI * 2
      const x = 16 * Math.pow(Math.sin(t), 3)
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
      out.push([x * s, -(y - 2.5) * s * 1.02])
    }
    out.reverse()
  } else {
    const a = r * 0.88, c = Math.min(0.2, a * 0.35), m = 12
    const corners: [number, number, number][] = [[a - c, a - c, 0], [-(a - c), a - c, 90], [-(a - c), -(a - c), 180], [a - c, -(a - c), 270]]
    for (const [cx, cz, d0] of corners) for (let j = 0; j <= m; j++) {
      const ang = (d0 + j / m * 90) * Math.PI / 180
      out.push([cx + Math.cos(ang) * c, cz + Math.sin(ang) * c])
    }
  }
  return out
}
export function perimeter(pts: [number, number][]) {
  let L = 0
  for (let i = 0; i < pts.length; i++) { const [a, b] = pts[i], [c, d] = pts[(i + 1) % pts.length]; L += Math.hypot(c - a, d - b) }
  return L
}
/** Le point du contour à la distance `s` et sa normale vers l'extérieur. */
export function along(pts: [number, number][], s: number): [number, number, number, number] {
  const L = perimeter(pts)
  s = ((s % L) + L) % L
  for (let i = 0; i < pts.length; i++) {
    const [a, b] = pts[i], [c, d] = pts[(i + 1) % pts.length]
    const l = Math.hypot(c - a, d - b)
    if (s <= l || i === pts.length - 1) {
      const t = l > 0 ? s / l : 0
      const x = a + (c - a) * t, z = b + (d - b) * t
      let nx = d - b, nz = -(c - a)
      const nl = Math.hypot(nx, nz) || 1
      nx /= nl; nz /= nl
      // Toujours vers l'extérieur (le centre est près de l'origine)
      if (nx * x + nz * z < 0) { nx = -nx; nz = -nz }
      return [x, z, nx, nz]
    }
    s -= l
  }
  return [pts[0][0], pts[0][1], 1, 0]
}
/** Le point (x, z) est-il dans le contour ? */
export function inside(pts: [number, number][], x: number, z: number) {
  let c = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j]
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c
  }
  return c
}
/** La distance du centre au bord, dans la direction `a` (0 = +x, sens de x vers z). */
export function radiusAt(pts: [number, number][], a: number) {
  const dx = Math.cos(a), dz = Math.sin(a)
  let best = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length]
    const ex = x2 - x1, ez = z2 - z1
    const den = dx * ez - dz * ex
    if (Math.abs(den) < 1e-9) continue
    const t = (x1 * ez - z1 * ex) / den, u = (x1 * dz - z1 * dx) / den
    if (t > 0 && u >= 0 && u <= 1) best = Math.max(best, t)
  }
  return best
}

/** Un hasard qu'on peut rejouer (les coulures d'un étage restent les mêmes). */
const rng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }

export async function cakeKit(T: T3): Promise<CakeKit> {
  const own: { dispose(): void }[] = []
  const k = <X extends { dispose(): void }>(x: X) => { own.push(x); return x }
  const phys = (o: import('three').MeshPhysicalMaterialParameters) => k(new T.MeshPhysicalMaterial(o))

  /* Les matières : glaçage satiné, nappage brillant, fruits vernis */
  // Le glaçage couvre une grande part de l'écran : pas de velours (cher par pixel), un léger vernis
  const icing = (c: string) => phys({ color: c, roughness: 0.45, clearcoat: 0.2, clearcoatRoughness: 0.4 })
  const glazeMat = (c: string) => phys({ color: c, roughness: 0.18, clearcoat: 0.9, clearcoatRoughness: 0.12 })
  const cream = phys({ color: '#FFF7EC', roughness: 0.55, sheen: 0.5, sheenColor: new T.Color('#FFFFFF'), sheenRoughness: 0.7 })
  const red = phys({ color: '#D2203A', roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.18 })
  const seedMat = phys({ color: '#EDC65A', roughness: 0.4 })
  const leaf = phys({ color: '#3E8B3C', roughness: 0.55, side: T.DoubleSide })
  const rasp = phys({ color: '#C72747', roughness: 0.32, clearcoat: 0.5, sheen: 0.4, sheenColor: new T.Color('#FF8FA6') })
  const blue = phys({ color: '#34407E', roughness: 0.6, sheen: 0.9, sheenColor: new T.Color('#A9B6E0'), sheenRoughness: 0.4 })
  const blueDark = phys({ color: '#1C2144', roughness: 0.7 })
  const cherryMat = phys({ color: '#9A0E23', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 })
  const stem = phys({ color: '#6E7B2C', roughness: 0.6 })
  const porcelain = phys({ color: '#F6F2EC', roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.15 })
  const gold = phys({ color: '#D9AE4E', metalness: 1, roughness: 0.3 })
  const sph = k(new T.SphereGeometry(1, 24, 16))
  const U: typeof import('three/examples/jsm/utils/BufferGeometryUtils.js') | null = await import('three/examples/jsm/utils/BufferGeometryUtils.js')
  const mergeV = (g: Geo) => U ? U.mergeVertices(g, 1e-4) : g
  const mergeG = (gs: Geo[]) => U ? U.mergeGeometries(gs) : null

  /* La couleur qui s'étale depuis le doigt : un cercle qui grandit autour du
     point touché (repère du monde), la nouvelle couleur dedans. */
  const paintable = (m: import('three').MeshPhysicalMaterial) => {
    const u = { uNew: { value: new T.Color() }, uC: { value: new T.Vector3() }, uR: { value: -1 } }
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u)
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;\nuniform vec3 uNew; uniform vec3 uC; uniform float uR;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nif (uR > 0.0) { float e = smoothstep(uR, uR - 0.04, distance(vWp, uC)); diffuseColor.rgb = mix(diffuseColor.rgb, uNew, e); }')
    }
    m.customProgramCacheKey = () => 'peinture'
    m.userData.paint = (c: string, at: import('three').Vector3) => {
      if (u.uR.value > 0) m.color.copy(u.uNew.value)
      u.uNew.value.set(c); u.uC.value.copy(at); u.uR.value = 0.001
    }
    m.userData.step = (dt: number) => {
      if (u.uR.value <= 0) return
      u.uR.value += dt * 3.2
      if (u.uR.value > 3.5) { m.color.copy(u.uNew.value); u.uR.value = -1 }
    }
    return m
  }

  /* ---- Un étage ---- */
  /* ---- Un étage, de la forme qu'on veut : la génoise (glacée ensuite), et
     son nappage — le dessus, le bourrelet du bord, les coulures — caché tant
     qu'on ne l'a pas versé (`pour`). ---- */
  const tier: CakeKit['tier'] = (o): Tier => {
    const { shape, r, h, seed = 7 } = o
    const rnd = rng(seed)
    const g = new T.Group()
    const B = 0.06
    // La génoise : le contour extrudé, aux bords arrondis (sommets soudés : lisse)
    const inner = outlineOf(shape, r - B)
    const sh = new T.Shape(inner.map(([x, z]) => new T.Vector2(x, -z)))
    let geo: Geo = new T.ExtrudeGeometry(sh, { depth: Math.max(0.02, h - 2 * B), bevelEnabled: true, bevelThickness: B, bevelSize: B, bevelSegments: 5, curveSegments: 1 })
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, B, 0)
    geo.deleteAttribute('uv'); geo.deleteAttribute('normal')
    geo = mergeV(geo)
    geo.computeVertexNormals()
    k(geo)
    const bodyMat = paintable(icing(o.body))
    const body = new T.Mesh(geo, bodyMat)
    body.castShadow = true; body.receiveShadow = true
    body.userData.paint = 'body'
    g.add(body)
    // Le nappage
    const glazeG = new T.Group()
    glazeG.visible = false
    g.add(glazeG)
    const gmat = paintable(glazeMat(o.glaze))
    const topPts = outlineOf(shape, r - 0.03)
    const topGeo = k(new T.ShapeGeometry(new T.Shape(topPts.map(([x, z]) => new T.Vector2(x, -z)))))
    topGeo.rotateX(-Math.PI / 2)
    const top = new T.Mesh(topGeo, gmat)
    top.position.y = h + 0.006
    top.receiveShadow = true
    top.userData.paint = 'glaze'
    glazeG.add(top)
    const lipPts = outlineOf(shape, r - 0.035)
    const lipCurve = new T.CatmullRomCurve3(lipPts.map(([x, z]) => new T.Vector3(x, 0, z)), true)
    const lip = new T.Mesh(k(new T.TubeGeometry(lipCurve, lipPts.length * 2, 0.034, 10, true)), gmat)
    lip.position.y = h - 0.012
    lip.userData.paint = 'glaze'
    glazeG.add(lip)
    // Les coulures : des gouttes plaquées contre le flanc, de longueurs différentes
    const parts: Geo[] = []
    const ring = outlineOf(shape, r)
    const per = perimeter(ring)
    const n = Math.round(per * 3.6)
    for (let i = 0; i < n; i++) {
      const [px, pz, nx, nz] = along(ring, (i + rnd() * 0.6) / n * per)
      const L = 0.05 + Math.pow(rnd(), 1.6) * h * 0.66
      const w = 0.02 + rnd() * 0.012
      const prof: import('three').Vector2[] = []
      for (let j = 0; j <= 14; j++) {
        const t = j / 14
        const bulb = Math.max(0, (t - 0.72) / 0.28)
        prof.push(new T.Vector2(w * (0.95 - 0.25 * Math.sin(t * Math.PI * 0.9) + 0.35 * Math.sin(bulb * Math.PI * 0.75)), -t * L))
      }
      for (let j = 1; j <= 6; j++) { const b = j / 6 * Math.PI / 2; prof.push(new T.Vector2(Math.cos(b) * prof[14].x, -L - Math.sin(b) * prof[14].x * 0.9)) }
      prof[prof.length - 1].x = 0.0005
      const drop = new T.LatheGeometry(prof.reverse(), 12)
      drop.scale(1, 1, 0.42)
      drop.rotateY(-Math.atan2(nz, nx) + Math.PI / 2)
      drop.translate(px + nx * 0.002, 0, pz + nz * 0.002)
      parts.push(drop)
    }
    const dg = mergeG(parts)
    parts.forEach(x => x.dispose())
    const drips = new T.Group()
    drips.position.y = h - 0.015
    if (dg) {
      k(dg)
      const dm = new T.Mesh(dg, gmat)
      dm.castShadow = true
      dm.userData.paint = 'glaze'
      drips.add(dm)
    }
    glazeG.add(drips)
    let pour = 0
    return {
      g, body, glaze: glazeG, bodyMat, glazeMat: gmat, outline: ring, h, r, shape,
      pour(color, at) {
        const first = !glazeG.visible
        glazeG.visible = true
        if (first) { gmat.color.set(color); pour = 0.001; drips.scale.y = 0.001 } else gmat.userData.paint(color, at)
      },
      step(dt) {
        bodyMat.userData.step(dt); gmat.userData.step(dt)
        if (pour > 0 && pour < 1) { pour = Math.min(1, pour + dt * 1.1); drips.scale.y = Math.max(0.001, 1 - Math.pow(1 - pour, 3)) }
      }
    }
  }

  /* ---- Une rosace : un profil en étoile qui monte en tournant et s'affine ---- */
  const rosetteGeo = (drop = false) => {
    const N = 96, M = 40, pts = drop ? 6 : 8
    const pos: number[] = [], idx: number[] = []
    for (let j = 0; j <= M; j++) {
      const t = j / M
      const s = drop
        ? Math.pow(1 - t, 0.6) * (0.9 + 0.25 * Math.sin(Math.min(1, t * 2.2) * Math.PI)) * (1 - 0.6 * t * t)
        : Math.pow(1 - t, 0.85) * (1 + 0.1 * Math.sin(t * Math.PI * 3.2)) + (j === 0 ? 0.04 : 0)
      const y = drop ? t * 1.15 : t * 1.25 + Math.sin(t * Math.PI) * 0.12
      const tw = t * Math.PI * (drop ? 0.6 : 2.3)
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * Math.PI * 2
        const star = 1 - 0.22 * Math.pow(0.5 - 0.5 * Math.cos(th * pts), 1.6)
        const rr = s * star
        pos.push(Math.cos(th + tw) * rr, y, Math.sin(th + tw) * rr)
      }
    }
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i, b = a + N + 1
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
    const geo = new T.BufferGeometry()
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    geo.scale(0.13, 0.13, 0.13)
    return k(geo)
  }
  const rosettes = { star: rosetteGeo(false), drop: rosetteGeo(true) }
  const creams = new Map<string, Mat>()
  const rosette: CakeKit['rosette'] = (color, drop = false) => {
    let m = color ? creams.get(color) : cream
    if (!m && color) { m = phys({ color, roughness: 0.55, sheen: 0.5, sheenColor: new T.Color('#FFFFFF'), sheenRoughness: 0.7 }); creams.set(color, m) }
    const mesh = new T.Mesh(drop ? rosettes.drop : rosettes.star, m!)
    mesh.castShadow = true
    return mesh
  }

  /* ---- La fraise : un cœur arrondi, ses grains, sa collerette ---- */
  const strawProf: import('three').Vector2[] = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    const y = t
    const r = Math.sin(Math.pow(t, 0.62) * Math.PI * 0.92) * 0.46 * (0.55 + 0.45 * t) + (t > 0.96 ? -(t - 0.96) * 6 : 0)
    strawProf.push(new T.Vector2(Math.max(0.001, r), y))
  }
  strawProf.push(new T.Vector2(0.001, 1.0))
  const strawGeo = k(new T.LatheGeometry(strawProf, 40))
  strawGeo.scale(0.16, 0.16, 0.16)
  const seedGeo = k(new T.SphereGeometry(1, 6, 4))
  const leafGeo = (() => {
    const s = new T.Shape()
    s.moveTo(0, 0); s.quadraticCurveTo(0.3, 0.25, 0, 1); s.quadraticCurveTo(-0.3, 0.25, 0, 0)
    const g = new T.ShapeGeometry(s, 8)
    g.scale(0.05, 0.075, 1)
    return k(g)
  })()
  const strawberry = (): Grp => {
    const g = new T.Group()
    const body = new T.Mesh(strawGeo, red)
    body.castShadow = true
    g.add(body)
    // Les grains : en spirale sur la peau, un peu enfoncés
    const n = 46
    const seeds = new T.InstancedMesh(seedGeo, seedMat, n)
    const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(0.006, 0.009, 0.006)
    for (let i = 0; i < n; i++) {
      const t = 0.08 + 0.8 * (i + 0.5) / n
      const th = i * 2.399963
      const pi = Math.floor(t * 24)
      const r = strawProf[pi].x + (strawProf[pi + 1].x - strawProf[pi].x) * (t * 24 - pi)
      const p = new T.Vector3(Math.cos(th) * r * 0.16 * 0.97, t * 0.16, Math.sin(th) * r * 0.16 * 0.97)
      q.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(p.x, 0.25 * r, p.z).normalize())
      m4.compose(p, q, sc)
      seeds.setMatrixAt(i, m4)
    }
    g.add(seeds)
    // La collerette verte et sa queue
    for (let i = 0; i < 7; i++) {
      const l = new T.Mesh(leafGeo, leaf)
      l.position.y = 0.158
      l.rotation.set(-Math.PI / 2 + 0.55, i / 7 * Math.PI * 2, 0, 'YXZ')
      g.add(l)
    }
    const st = new T.Mesh(k(new T.CylinderGeometry(0.004, 0.006, 0.03, 6)), leaf)
    st.position.y = 0.17
    g.add(st)
    return g
  }

  /* ---- La framboise : des petites billes serrées sur un cône arrondi ---- */
  const raspberry = (): Grp => {
    const g = new T.Group()
    const n = 52
    const im = new T.InstancedMesh(sph, rasp, n)
    const m4 = new T.Matrix4(), q = new T.Quaternion()
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      const y = t * 0.11
      const r = Math.sin(Math.pow(1 - t, 0.75) * Math.PI * 0.55 + 0.25) * 0.05
      const th = i * 2.399963
      const s = 0.016 * (0.85 + 0.3 * Math.sin(t * Math.PI))
      m4.compose(new T.Vector3(Math.cos(th) * r, y, Math.sin(th) * r), q, new T.Vector3(s, s, s))
      im.setMatrixAt(i, m4)
    }
    im.castShadow = true
    g.add(im)
    const core = new T.Mesh(sph, rasp)
    core.scale.set(0.042, 0.055, 0.042)
    core.position.y = 0.05
    g.add(core)
    return g
  }

  /* ---- La myrtille : une bille poudrée, sa petite couronne ---- */
  const blueGeo = k(new T.SphereGeometry(0.048, 24, 16))
  blueGeo.scale(1, 0.86, 1)
  const crownGeo = k(new T.CylinderGeometry(0.014, 0.009, 0.01, 5, 1, true))
  blueGeo.translate(0, 0.04, 0)
  const blueberry = (): Mesh => {
    // Posée SUR la surface (son centre 4 cm au-dessus du point où on la pose)
    const m = new T.Mesh(blueGeo, blue)
    m.castShadow = true
    const c = new T.Mesh(crownGeo, blueDark)
    c.position.y = 0.081
    m.add(c)
    return m
  }

  /* ---- La cerise : vernie, creusée en haut, et sa queue courbe ---- */
  const cherryProf: import('three').Vector2[] = []
  for (let i = 0; i <= 20; i++) {
    const a = i / 20 * Math.PI
    const r = Math.sin(a) * 0.062
    const y = (1 - Math.cos(a)) * 0.058 - (i > 17 ? (i - 17) * 0.006 : 0)
    cherryProf.push(new T.Vector2(Math.max(0.001, r), y))
  }
  const cherryGeo = k(new T.LatheGeometry(cherryProf, 32))
  const stemGeo = k(new T.TubeGeometry(new T.CatmullRomCurve3([
    new T.Vector3(0, 0.105, 0), new T.Vector3(0.01, 0.15, 0.005), new T.Vector3(0.035, 0.2, 0.01), new T.Vector3(0.07, 0.23, 0.012)
  ]), 16, 0.0045, 6))
  const cherry = (): Grp => {
    const g = new T.Group()
    const b = new T.Mesh(cherryGeo, cherryMat)
    b.castShadow = true
    g.add(b, new T.Mesh(stemGeo, stem))
    return g
  }

  /* ---- La bougie torsadée et sa flamme ---- */
  const stripeTex = (c: string) => {
    const cv = document.createElement('canvas')
    cv.width = 64; cv.height = 256
    const x = cv.getContext('2d')!
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, 64, 256)
    x.fillStyle = c
    for (let i = -4; i < 12; i++) { x.beginPath(); x.moveTo(0, i * 32); x.lineTo(64, i * 32 - 40); x.lineTo(64, i * 32 - 24); x.lineTo(0, i * 32 + 16); x.fill() }
    const t = k(new T.CanvasTexture(cv))
    t.colorSpace = T.SRGBColorSpace
    return t
  }
  const candleGeo = k(new T.CylinderGeometry(0.022, 0.024, 0.24, 20))
  candleGeo.translate(0, 0.12, 0)
  const wickGeo = k(new T.CylinderGeometry(0.003, 0.003, 0.025, 5))
  const flameProf: import('three').Vector2[] = []
  for (let i = 0; i <= 16; i++) { const t = i / 16; flameProf.push(new T.Vector2(Math.sin(Math.pow(t, 0.55) * Math.PI) * 0.018 * (1 - t * 0.35), t * 0.075)) }
  const flameGeo = k(new T.LatheGeometry(flameProf, 16))
  const flameOut = k(new T.MeshBasicMaterial({ color: '#FF9A2E', transparent: true, opacity: 0.9, depthWrite: false }))
  const flameIn = k(new T.MeshBasicMaterial({ color: '#FFF6C8', transparent: true, opacity: 0.95, depthWrite: false }))
  const glowTex = (() => {
    const cv = document.createElement('canvas')
    cv.width = cv.height = 64
    const x = cv.getContext('2d')!
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,190,110,0.55)'); gr.addColorStop(0.35, 'rgba(255,150,60,0.18)'); gr.addColorStop(1, 'rgba(255,140,50,0)')
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64)
    return k(new T.CanvasTexture(cv))
  })()
  const glowMat = k(new T.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending }))
  const stripes = new Map<string, Mat>()
  const candle: CakeKit['candle'] = c => {
    let m = stripes.get(c)
    if (!m) { m = phys({ map: stripeTex(c), roughness: 0.45, sheen: 0.3 }); stripes.set(c, m) }
    const g = new T.Group()
    const body = new T.Mesh(candleGeo, m)
    body.castShadow = true
    g.add(body)
    const wick = new T.Mesh(wickGeo, blueDark)
    wick.position.y = 0.252
    g.add(wick)
    const flame = new T.Group()
    flame.position.y = 0.258
    const out = new T.Mesh(flameGeo, flameOut)
    const inn = new T.Mesh(flameGeo, flameIn)
    inn.scale.set(0.5, 0.6, 0.5)
    const glow = new T.Sprite(glowMat)
    glow.scale.setScalar(0.13)
    glow.position.y = 0.04
    flame.add(out, inn, glow)
    g.add(flame)
    g.userData.flame = flame
    return g
  }

  /* ---- Les vermicelles et les perles de sucre ---- */
  const sprGeo = k(new T.CapsuleGeometry(0.0065, 0.03, 2, 6))
  sprGeo.rotateZ(Math.PI / 2)
  const sprMat = phys({ roughness: 0.4, clearcoat: 0.4 })
  const SPR = ['#FF6B81', '#FFC94D', '#5EC97B', '#4FB8E7', '#B197FC', '#FFFFFF', '#FF9F43']
  const sprinkles: CakeKit['sprinkles'] = (n, r, seed = 3) => {
    const rnd = rng(seed)
    const im = new T.InstancedMesh(sprGeo, sprMat, n)
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), col = new T.Color()
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r
      e.set(0, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.3)
      q.setFromEuler(e)
      m4.compose(new T.Vector3(Math.cos(a) * d, 0.007, Math.sin(a) * d), q, new T.Vector3(1, 1, 1))
      im.setMatrixAt(i, m4)
      im.setColorAt(i, col.set(SPR[i % SPR.length]))
    }
    return im
  }
  const pearlMats = new Map<string, Mat>()
  const pearls: CakeKit['pearls'] = (n, r, color = '#FFFFFF') => {
    let m = pearlMats.get(color)
    if (!m) { m = phys({ color, roughness: 0.15, clearcoat: 1, metalness: 0.1, iridescence: 0.4 }); pearlMats.set(color, m) }
    const im = new T.InstancedMesh(sph, m, n)
    const m4 = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(0.028, 0.028, 0.028)
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2
      m4.compose(new T.Vector3(Math.cos(a) * r, 0.026, Math.sin(a) * r), q, s)
      im.setMatrixAt(i, m4)
    }
    im.castShadow = true
    return im
  }

  /* ---- La part : génoise, crème et confiture en couches sur les coupes ---- */
  const spongeTex = (() => {
    const cv = document.createElement('canvas')
    cv.width = 64; cv.height = 256
    const x = cv.getContext('2d')!
    const bands: [string, number][] = [['#E9B872', 54], ['#FFF4E0', 14], ['#D2203A', 8], ['#FFF4E0', 10], ['#E9B872', 54], ['#FFF4E0', 14], ['#E9B872', 54], ['#FFF4E0', 48]]
    let y = 0
    for (const [c, hh] of bands) { x.fillStyle = c; x.fillRect(0, 256 - y - hh, 64, hh); y += hh }
    // Les trous de la génoise
    x.fillStyle = 'rgba(160,110,50,0.35)'
    for (let i = 0; i < 160; i++) x.fillRect(Math.random() * 64, Math.random() * 256, 2, 2)
    const t = k(new T.CanvasTexture(cv))
    t.colorSpace = T.SRGBColorSpace
    return t
  })()
  const spongeMat = phys({ map: spongeTex, roughness: 0.85, side: T.DoubleSide })
  const faceGeo = (t: Tier, a: number) => {
    const R = radiusAt(t.outline, a)
    const g = new T.PlaneGeometry(R, t.h)
    g.translate(R / 2, t.h / 2, 0)
    g.rotateY(-a)
    return k(g)
  }
  const cutFaces: CakeKit['cutFaces'] = (t, a0, a1) => [faceGeo(t, a0), faceGeo(t, a1)].map(g => {
    const m = new T.Mesh(g, spongeMat)
    m.receiveShadow = true
    return m
  })
  const slice: CakeKit['slice'] = (t, a0, a1) => {
    // Un prisme : le dessus (nappage ou génoise glacée), le flanc (glaçage), les deux coupes
    const n = 14
    const pos: number[] = [], uv: number[] = [], idx: number[] = []
    const groups: [number, number, number][] = []
    const P = (x: number, y: number, z: number, u: number, v: number) => { pos.push(x, y, z); uv.push(u, v); return pos.length / 3 - 1 }
    const rim = Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; const R = radiusAt(t.outline, a); return [Math.cos(a) * R, Math.sin(a) * R] as [number, number] })
    // Dessus
    let s0 = idx.length
    const c = P(0, t.h, 0, 0.5, 0.5)
    const top = rim.map(([x, z]) => P(x, t.h, z, 0.5, 0.5))
    for (let i = 0; i < n; i++) idx.push(c, top[i + 1], top[i])
    groups.push([s0, idx.length - s0, 0])
    // Flanc
    s0 = idx.length
    const lo = rim.map(([x, z]) => P(x, 0, z, 0, 0)), hi = rim.map(([x, z]) => P(x, t.h, z, 0, 1))
    for (let i = 0; i < n; i++) idx.push(lo[i], lo[i + 1], hi[i], hi[i], lo[i + 1], hi[i + 1])
    groups.push([s0, idx.length - s0, 1])
    // Les coupes (génoise en couches)
    s0 = idx.length
    for (const [i, flip] of [[0, false], [n, true]] as [number, boolean][]) {
      const [x, z] = rim[i]
      const a = P(0, 0, 0, 0, 0), b = P(x, 0, z, 1, 0), d = P(x, t.h, z, 1, 1), e = P(0, t.h, 0, 0, 1)
      if (flip) idx.push(a, b, d, a, d, e); else idx.push(a, d, b, a, e, d)
    }
    groups.push([s0, idx.length - s0, 2])
    const geo = new T.BufferGeometry()
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3))
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
    geo.setIndex(idx)
    for (const [st, cnt, mi] of groups) geo.addGroup(st, cnt, mi)
    geo.computeVertexNormals()
    k(geo)
    const topMat = t.glaze.visible ? t.glazeMat : t.bodyMat
    const m = new T.Mesh(geo, [topMat, t.bodyMat, spongeMat])
    m.castShadow = true
    return m
  }

  /* ---- Le présentoir en porcelaine, son liseré doré ---- */
  const stand = (): Grp => {
    const g = new T.Group()
    const p: import('three').Vector2[] = [
      new T.Vector2(0.001, 0), new T.Vector2(0.55, 0), new T.Vector2(0.58, 0.03), new T.Vector2(0.5, 0.06),
      new T.Vector2(0.2, 0.12), new T.Vector2(0.13, 0.2), new T.Vector2(0.12, 0.28), new T.Vector2(0.16, 0.33),
      new T.Vector2(1.3, 0.35), new T.Vector2(1.36, 0.38), new T.Vector2(1.34, 0.4), new T.Vector2(0.001, 0.395)
    ]
    const m = new T.Mesh(k(new T.LatheGeometry(p, 96)), porcelain)
    m.castShadow = true; m.receiveShadow = true
    g.add(m)
    const rim = new T.Mesh(k(new T.TorusGeometry(1.355, 0.012, 8, 128)), gold)
    rim.rotation.x = Math.PI / 2
    rim.position.y = 0.39
    g.add(rim)
    return g
  }

  return {
    T, tier, rosette, strawberry, raspberry, blueberry, cherry, candle, sprinkles, pearls, stand, slice, cutFaces,
    dispose() { own.forEach(x => x.dispose()) }
  }
}
