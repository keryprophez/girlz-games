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

export interface CakeKit {
  T: T3
  /** Un étage : sa génoise glacée, son nappage du dessus et ses coulures. */
  tier(r: number, h: number, body: string, glaze: string, seed?: number): Grp
  /** Une rosace de crème (posée sur y = 0, ~0,13 de rayon). */
  rosette(color?: string): Mesh
  strawberry(): Grp
  raspberry(): Grp
  blueberry(): Mesh
  cherry(): Grp
  /** Une bougie et sa flamme (la flamme : `userData.flame`). */
  candle(stripe: string): Grp
  /** Des vermicelles semés sur un disque de rayon r (y = 0). */
  sprinkles(n: number, r: number, seed?: number): import('three').InstancedMesh
  /** Des perles de sucre en couronne (rayon r, y = 0). */
  pearls(n: number, r: number, color?: string): import('three').InstancedMesh
  stand(): Grp
  dispose(): void
}

/** Un hasard qu'on peut rejouer (les coulures d'un étage restent les mêmes). */
const rng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }

export function cakeKit(T: T3): CakeKit {
  const own: { dispose(): void }[] = []
  const k = <X extends { dispose(): void }>(x: X) => { own.push(x); return x }
  const phys = (o: import('three').MeshPhysicalMaterialParameters) => k(new T.MeshPhysicalMaterial(o))

  /* Les matières : glaçage satiné, nappage brillant, fruits vernis */
  const icing = (c: string) => phys({ color: c, roughness: 0.5, sheen: 0.6, sheenColor: new T.Color('#FFFFFF'), sheenRoughness: 0.6, clearcoat: 0.15 })
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

  /* ---- Un étage ---- */
  const tier: CakeKit['tier'] = (r, h, body, glaze, seed = 7) => {
    const g = new T.Group()
    const rnd = rng(seed)
    // Le corps : un cylindre aux bords arrondis (lathe), glacé
    const prof: import('three').Vector2[] = [new T.Vector2(0, h)]
    const c = 0.07
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; prof.push(new T.Vector2(r - c + Math.sin(a) * c, h - c + Math.cos(a) * c)) }
    prof.push(new T.Vector2(r, 0.02), new T.Vector2(r - 0.015, 0))
    const bodyGeo = k(new T.LatheGeometry(prof.reverse(), 96))
    const bm = new T.Mesh(bodyGeo, icing(body))
    bm.castShadow = true; bm.receiveShadow = true
    g.add(bm)
    // Le nappage : une nappe sur le dessus et son bourrelet au bord
    const gm = glazeMat(glaze)
    const top = new T.Mesh(k(new T.CylinderGeometry(r - 0.02, r - 0.02, 0.025, 96)), gm)
    top.position.y = h + 0.006
    top.receiveShadow = true
    g.add(top)
    const lip = new T.Mesh(k(new T.TorusGeometry(r - 0.035, 0.034, 12, 120)), gm)
    lip.rotation.x = Math.PI / 2
    lip.position.y = h - 0.012
    g.add(lip)
    // Les coulures : des gouttes qui pendent du bord, chacune sa longueur
    const parts: Geo[] = []
    const n = Math.round(r * 22)
    for (let i = 0; i < n; i++) {
      const a = (i + rnd() * 0.6) / n * Math.PI * 2
      // Des longues, des courtes, des toutes petites : jamais deux pareilles
      const L = 0.05 + Math.pow(rnd(), 1.6) * h * 0.66
      const w = 0.02 + rnd() * 0.012
      // Une goutte : fine sous le bourrelet, qui s'arrondit en perle au bout
      const prof: import('three').Vector2[] = []
      for (let j = 0; j <= 14; j++) {
        const t = j / 14
        const y = -t * L
        const bulb = Math.max(0, (t - 0.72) / 0.28)
        const rr = w * (0.95 - 0.25 * Math.sin(t * Math.PI * 0.9) + 0.35 * Math.sin(bulb * Math.PI * 0.75))
        prof.push(new T.Vector2(rr, y))
      }
      for (let j = 1; j <= 6; j++) { const b = j / 6 * Math.PI / 2; prof.push(new T.Vector2(Math.cos(b) * prof[14].x, -L - Math.sin(b) * prof[14].x * 0.9)) }
      prof[prof.length - 1].x = 0.0005
      const drop = new T.LatheGeometry(prof.reverse(), 12)
      // Plaquée contre le flanc (aplatie), le haut caché sous le bourrelet
      drop.scale(1, 1, 0.42)
      drop.rotateY(-a + Math.PI / 2)
      drop.translate(Math.cos(a) * (r + 0.002), h - 0.015, Math.sin(a) * (r + 0.002))
      parts.push(drop)
    }
    import('three/examples/jsm/utils/BufferGeometryUtils.js').then(U => {
      const dg = U.mergeGeometries(parts)
      parts.forEach(p => p.dispose())
      if (!dg) return
      k(dg)
      const drips = new T.Mesh(dg, gm)
      drips.castShadow = true
      g.add(drips)
    })
    return g
  }

  /* ---- Une rosace : un profil en étoile qui monte en tournant et s'affine ---- */
  const rosetteGeo = (() => {
    const N = 96, M = 40, pts = 8
    const pos: number[] = [], idx: number[] = []
    for (let j = 0; j <= M; j++) {
      const t = j / M
      const s = Math.pow(1 - t, 0.85) * (1 + 0.1 * Math.sin(t * Math.PI * 3.2)) + (j === 0 ? 0.04 : 0)
      const y = t * 1.25 + Math.sin(t * Math.PI) * 0.12
      const tw = t * Math.PI * 2.3
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
  })()
  const creams = new Map<string, Mat>()
  const rosette: CakeKit['rosette'] = color => {
    let m = color ? creams.get(color) : cream
    if (!m && color) { m = phys({ color, roughness: 0.55, sheen: 0.5, sheenColor: new T.Color('#FFFFFF'), sheenRoughness: 0.7 }); creams.set(color, m) }
    const mesh = new T.Mesh(rosetteGeo, m!)
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
    T, tier, rosette, strawberry, raspberry, blueberry, cherry, candle, sprinkles, pearls, stand,
    dispose() { own.forEach(x => x.dispose()) }
  }
}
