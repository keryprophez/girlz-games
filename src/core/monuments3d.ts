import type { T3 } from './three3d'

/* 🗼 LES MONUMENTS de Jade (19/10, la maquette d'abord) — modelés ici, pièce
   par pièce : chaque monument est une liste de PIÈCES à poser dans l'ordre
   (les pieds de la Tour Eiffel, ses étages, sa flèche…), chacune à sa place
   finale ; le jeu les fait venir une à une, la forme du monument dessinée
   en transparent (`ghost`). Huit monuments : la Pyramide, la Tour Eiffel,
   le Golden Gate, la Tour de Pise, un château de conte, le Taj Mahal, Big
   Ben et les statues de l'île de Pâques. Le treillis de la Tour Eiffel est
   fait de vraies poutres (des milliers, en instances) : pas de « 3D à cinq
   triangles ». Unité : la Tour Eiffel fait ~3,2 de haut. */

type V3 = import('three').Vector3
type Grp = import('three').Group
type Mat = import('three').Material

export type MonumentId = 'pyramide' | 'eiffel' | 'goldengate' | 'pise' | 'chateau' | 'taj' | 'bigben' | 'moai'
export const MONUMENTS: MonumentId[] = ['pyramide', 'eiffel', 'goldengate', 'pise', 'chateau', 'taj', 'bigben', 'moai']
export const MONUMENT_NAME: Record<MonumentId, string> = {
  pyramide: 'Pyramide', eiffel: 'Tour Eiffel', goldengate: 'Golden Gate', pise: 'Tour de Pise',
  chateau: 'Château', taj: 'Taj Mahal', bigben: 'Big Ben', moai: 'Île de Pâques'
}

/** Une pièce : posée à sa place finale ; `paint` : ce que le pinceau recolore. */
export interface Piece { obj: Grp; paint: Mat[] }
export interface Monument {
  id: MonumentId
  /** Le monument entier (toutes les pièces, à leur place). */
  obj: Grp
  pieces: Piece[]
  /** Sa hauteur, sa largeur (pour cadrer). */
  h: number; w: number
  /** Où accrocher des guirlandes (points du monument, à relier). */
  lights: V3[][]
  dispose(): void
}

const rng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }

export async function monumentKit(T: T3) {
  const { RoundedBoxGeometry } = await import('three/examples/jsm/geometries/RoundedBoxGeometry.js')
  const kept: { dispose(): void }[] = []
  const k = <X extends { dispose(): void }>(x: X) => { kept.push(x); return x }

  const canvas = (w: number, h: number, f: (x: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d')!); return c
  }
  const tex = (c: HTMLCanvasElement, rx = 1, ry = rx, color = true) => {
    const t = k(new T.CanvasTexture(c)); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8
    if (color) t.colorSpace = T.SRGBColorSpace
    return t
  }
  const std = (o: import('three').MeshStandardMaterialParameters) => k(new T.MeshStandardMaterial({ roughness: 0.8, ...o }))

  /* ---- Les pierres ---- */
  /** Des blocs de pierre en assises (grès, calcaire) : joints, nuances, grain. */
  const blocks = (base: string, rows: number, cols: number, seed: number, joint = 'rgba(90,60,30,.45)') => tex(canvas(512, 512, x => {
    const r = rng(seed)
    x.fillStyle = base; x.fillRect(0, 0, 512, 512)
    const rh = 512 / rows
    for (let i = 0; i < rows; i++) {
      const off = (i % 2) * 0.5, cw = 512 / cols
      for (let j = -1; j <= cols; j++) {
        const l = 0.9 + r() * 0.2
        x.fillStyle = `rgba(${l > 1 ? '255,250,235' : '120,90,60'},${Math.abs(l - 1) * 0.6})`
        x.fillRect((j + off) * cw, i * rh, cw, rh)
      }
      x.strokeStyle = joint; x.lineWidth = 3
      x.beginPath(); x.moveTo(0, i * rh); x.lineTo(512, i * rh); x.stroke()
      for (let j = 0; j <= cols; j++) { x.beginPath(); x.moveTo((j + off) * cw, i * rh); x.lineTo((j + off) * cw, (i + 1) * rh); x.stroke() }
    }
    for (let i = 0; i < 5000; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '80,60,40'},${r() * 0.08})`; x.fillRect(r() * 512, r() * 512, 2, 2) }
  }))
  /** Le marbre blanc, à peine veiné. */
  const marble = tex(canvas(512, 512, x => {
    const r = rng(8)
    x.fillStyle = '#F4F1EA'; x.fillRect(0, 0, 512, 512)
    x.strokeStyle = 'rgba(170,165,175,.18)'; x.lineWidth = 1.5
    for (let i = 0; i < 14; i++) { x.beginPath(); let px = r() * 512, py = r() * 512; x.moveTo(px, py); for (let j = 0; j < 8; j++) { px += (r() - 0.3) * 90; py += (r() - 0.5) * 60; x.lineTo(px, py) } x.stroke() }
  }), 2)

  /* ---- Les poutres en instances : une boîte unité tendue entre deux points ---- */
  const unitBox = k(new T.BoxGeometry(1, 1, 1))
  const beams = (list: [V3, V3, number, number?][], mat: Mat) => {
    const im = new T.InstancedMesh(unitBox, mat, list.length)
    const m4 = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), mid = new T.Vector3(), d = new T.Vector3(), y = new T.Vector3(0, 1, 0)
    list.forEach(([a, b, w, h], i) => {
      d.subVectors(b, a); const len = d.length()
      q.setFromUnitVectors(y, d.normalize())
      mid.addVectors(a, b).multiplyScalar(0.5)
      im.setMatrixAt(i, m4.compose(mid, q, s.set(w, len + w * 0.5, h ?? w)))
    })
    im.castShadow = true; im.receiveShadow = true
    return im
  }
  const v = (x: number, y: number, z: number) => new T.Vector3(x, y, z)
  const mesh = (g: import('three').BufferGeometry, m: Mat, x = 0, y = 0, z = 0) => {
    const o = new T.Mesh(k(g), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o
  }
  const group = (...o: import('three').Object3D[]) => { const g = new T.Group(); for (const c of o) g.add(c); return g }

  /* ======================= LA TOUR EIFFEL ======================= */
  function eiffel(): Monument {
    const iron = std({ color: '#7A5E48', roughness: 0.55, metalness: 0.35 })
    const deck = std({ color: '#6A503E', roughness: 0.6, metalness: 0.3 })
    const H = 3.2
    // La demi-largeur de la tour à la hauteur y (au-dessus du premier étage)
    const half = (y: number) => 0.035 + 0.3 * Math.exp(-(y - 0.56) * 1.55)
    const P1 = 0.56, P2 = 1.15, P3 = 2.72
    /** Un treillis à quatre montants : leurs coins en fonction de t (0 → 1), n tronçons, croisillons sur les quatre faces. */
    const truss = (corner: (c: number, t: number) => V3, n: number, w: number) => {
      const L: [V3, V3, number, number?][] = []
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n
        for (let c = 0; c < 4; c++) {
          const a0 = corner(c, t0), a1 = corner(c, t1), b0 = corner((c + 1) % 4, t0), b1 = corner((c + 1) % 4, t1)
          L.push([a0, a1, w])
          L.push([a0, b0, w * 0.6])
          L.push([a0, b1, w * 0.4]); L.push([b0, a1, w * 0.4])
        }
      }
      for (let c = 0; c < 4; c++) L.push([corner(c, 1), corner((c + 1) % 4, 1), w * 0.6])
      return L
    }
    const pieces: Piece[] = []
    // 1-4. Les quatre pieds : des treillis penchés, qui se rejoignent au premier étage
    const legs: Piece[] = []
    for (let q = 0; q < 4; q++) {
      const sx = q === 0 || q === 3 ? 1 : -1, sz = q < 2 ? 1 : -1
      const B = 0.62, Tt = half(P1) - 0.02
      const leg = (c: number, t: number) => {
        // Le pied : un carré qui va du coin au sol jusqu'au coin du premier étage, en se courbant
        const bow = Math.sin(t * Math.PI) * 0.05
        const cx = B + (Tt - B) * t + bow, cz = cx
        const s0 = 0.17 * (1 - t) + 0.1 * t
        const dx = c === 0 || c === 3 ? 0 : -s0, dz = c < 2 ? 0 : -s0
        return v(sx * (cx + dx), t * P1, sz * (cz + dz))
      }
      const L = truss(leg, 7, 0.016)
      // Le socle de pierre
      const base = mesh(new RoundedBoxGeometry(0.24, 0.07, 0.24, 2, 0.01), std({ color: '#CDBFA6', roughness: 0.9 }), sx * 0.54, 0.035, sz * 0.54)
      const p = { obj: group(beams(L, iron), base), paint: [iron] }
      legs.push(p)
    }
    pieces.push(...legs)
    // 5. Les arches et le premier étage : la plateforme, ses arcs entre les pieds, sa balustrade
    {
      const L: [V3, V3, number, number?][] = []
      const w1 = half(P1) + 0.06
      for (let f = 0; f < 4; f++) {
        // L'arc décoratif de chaque face, en deux rangs : son sommet sous la plateforme, ses pieds dans les pieds de la tour
        for (const off of [0, 0.04]) {
          let prev: V3 | null = null
          for (let i = 0; i <= 20; i++) {
            const u = i / 10 - 1
            const y = P1 - 0.05 - off - 0.32 * (1 - Math.sqrt(Math.max(0, 1 - u * u)))
            const t = y / P1, outer = 0.62 + (half(P1) - 0.02 - 0.62) * t
            const inner = outer - (0.17 * (1 - t) + 0.1 * t), x = u * inner, zf = outer - 0.04
            const p = f === 0 ? v(x, y, zf) : f === 1 ? v(zf, y, -x) : f === 2 ? v(-x, y, -zf) : v(-zf, y, x)
            if (prev) L.push([prev, p, 0.02])
            prev = p
          }
        }
        // La balustrade (des barreaux) autour de la plateforme
        for (let i = 0; i <= 12; i++) {
          const t = i / 12 * 2 - 1, e = w1 + 0.1
          const a = f === 0 ? v(t * e, P1 + 0.06, e) : f === 1 ? v(e, P1 + 0.06, -t * e) : f === 2 ? v(-t * e, P1 + 0.06, -e) : v(-e, P1 + 0.06, t * e)
          L.push([a.clone().setY(P1 + 0.02), a, 0.01])
        }
      }
      const plat = mesh(new T.BoxGeometry((w1 + 0.1) * 2, 0.06, (w1 + 0.1) * 2), deck, 0, P1 + 0.0, 0)
      pieces.push({ obj: group(beams(L, iron), plat), paint: [iron, deck] })
    }
    // 6. Le deuxième tronçon et le deuxième étage
    {
      const corner = (c: number, t: number) => { const y = P1 + 0.03 + (P2 - P1 - 0.03) * t, hh = half(y); return v((c === 0 || c === 3 ? 1 : -1) * hh, y, (c < 2 ? 1 : -1) * hh) }
      const L = truss(corner, 6, 0.02)
      const w2 = half(P2) + 0.05
      const plat = mesh(new T.BoxGeometry(w2 * 2, 0.045, w2 * 2), deck, 0, P2, 0)
      for (let f = 0; f < 4; f++) for (let i = 0; i <= 8; i++) {
        const t = i / 8 * 2 - 1
        const a = f === 0 ? v(t * w2, P2 + 0.05, w2) : f === 1 ? v(w2, P2 + 0.05, -t * w2) : f === 2 ? v(-t * w2, P2 + 0.05, -w2) : v(-w2, P2 + 0.05, t * w2)
        L.push([a.clone().setY(P2 + 0.02), a, 0.008])
      }
      pieces.push({ obj: group(beams(L, iron), plat), paint: [iron, deck] })
    }
    // 7. Le grand fût, jusqu'au sommet
    {
      const corner = (c: number, t: number) => { const y = P2 + 0.02 + (P3 - P2 - 0.02) * t, hh = half(y); return v((c === 0 || c === 3 ? 1 : -1) * hh, y, (c < 2 ? 1 : -1) * hh) }
      const L = truss(corner, 14, 0.016)
      pieces.push({ obj: group(beams(L, iron)), paint: [iron] })
    }
    // 8. Le sommet : la lanterne, l'antenne
    {
      const top = std({ color: '#8C6F55', roughness: 0.5, metalness: 0.4 })
      const cab = mesh(new T.CylinderGeometry(0.06, 0.07, 0.12, 12), top, 0, P3 + 0.06, 0)
      const dome = mesh(new T.SphereGeometry(0.06, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), top, 0, P3 + 0.12, 0)
      const ant = mesh(new T.CylinderGeometry(0.008, 0.016, 0.36, 8), top, 0, P3 + 0.3, 0)
      pieces.push({ obj: group(cab, dome, ant), paint: [top] })
    }
    const obj = group(...pieces.map(p => p.obj))
    // Les guirlandes : les quatre arêtes, du sol au sommet
    const lights: V3[][] = []
    for (let c = 0; c < 4; c++) {
      const sx = c === 0 || c === 3 ? 1 : -1, sz = c < 2 ? 1 : -1, line: V3[] = []
      for (let i = 0; i <= 40; i++) {
        const y = i / 40 * P3, hh = y < P1 ? 0.62 + (half(P1) - 0.62) * (y / P1) : half(y)
        line.push(v(sx * (hh + 0.02), y, sz * (hh + 0.02)))
      }
      lights.push(line)
    }
    return { id: 'eiffel', obj, pieces, h: H, w: 1.4, lights, dispose() {} }
  }

  /* ======================= LA PYRAMIDE ======================= */
  function pyramide(): Monument {
    const n = 8, B = 2.4, Hh = 1.55
    const stone = std({ map: blocks('#D9B77E', 4, 6, 3), roughness: 0.95 })
    const gold = std({ color: '#F2C14E', metalness: 0.9, roughness: 0.25 })
    const pieces: Piece[] = []
    for (let i = 0; i < n; i++) {
      const s = B * (1 - i / n), h = Hh / n
      const g = new RoundedBoxGeometry(s, h * 0.98, s, 2, 0.012)
      // Les UV : la pierre à la même taille partout
      const p = g.getAttribute('position'), uv = g.getAttribute('uv') as import('three').BufferAttribute, nn = g.getAttribute('normal')
      for (let j = 0; j < p.count; j++) {
        const ax = Math.abs(nn.getX(j)), az = Math.abs(nn.getZ(j))
        uv.setXY(j, (ax > az ? p.getZ(j) : p.getX(j)) / 0.6, (p.getY(j) + h * i) / 0.6)
      }
      pieces.push({ obj: group(mesh(g, stone, 0, h * i + h / 2, 0)), paint: [stone] })
    }
    const top = new T.ConeGeometry(B / n * 0.72, Hh / n * 1.3, 4)
    top.rotateY(Math.PI / 4)
    pieces.push({ obj: group(mesh(top, gold, 0, Hh + Hh / n * 0.65 - 0.01, 0)), paint: [gold] })
    const obj = group(...pieces.map(p => p.obj))
    const lights: V3[][] = [0, 1, 2, 3].map(c => {
      const sx = c === 0 || c === 3 ? 1 : -1, sz = c < 2 ? 1 : -1
      return Array.from({ length: 30 }, (_, i) => { const t = i / 29; return v(sx * (B / 2) * (1 - t) + 0.01 * sx, t * Hh, sz * (B / 2) * (1 - t) + 0.01 * sz) })
    })
    return { id: 'pyramide', obj, pieces, h: Hh + 0.2, w: B, lights, dispose() {} }
  }

  /* ======================= LE GOLDEN GATE ======================= */
  function goldenGate(): Monument {
    const red = std({ color: '#C2412D', roughness: 0.55, metalness: 0.15 })
    const cableM = std({ color: '#B23A28', roughness: 0.5, metalness: 0.2 })
    const road = std({ color: '#4A4A4E', roughness: 0.9 })
    const L = 5.2, TX = 1.45, TH = 1.75, DY = 0.5
    const pieces: Piece[] = []
    // Les deux tours : deux piliers en gradins, reliés par des portiques
    for (const sx of [-1, 1]) {
      const parts: import('three').Object3D[] = []
      for (const sz of [-1, 1]) {
        let y = 0
        const steps = [[0.13, 0.75], [0.11, 0.5], [0.095, 0.32], [0.08, 0.18]]
        for (const [w, h] of steps) { parts.push(mesh(new RoundedBoxGeometry(w, h, w * 1.25, 2, 0.008), red, sx * TX, y + h / 2, sz * 0.2)); y += h }
      }
      for (const [y, h] of [[DY + 0.12, 0.06], [0.95, 0.07], [1.3, 0.07], [1.62, 0.09]]) parts.push(mesh(new T.BoxGeometry(0.1, h, 0.42), red, sx * TX, y, 0))
      // Le socle dans l'eau
      parts.push(mesh(new RoundedBoxGeometry(0.34, 0.16, 0.62, 2, 0.02), std({ color: '#B8B2A6', roughness: 0.9 }), sx * TX, 0.02, 0))
      pieces.push({ obj: group(...parts), paint: [red] })
    }
    // Le tablier : la route, son treillis
    {
      const parts: import('three').Object3D[] = [mesh(new T.BoxGeometry(L, 0.03, 0.34), road, 0, DY + 0.07, 0)]
      const B: [V3, V3, number, number?][] = []
      const n = 52
      for (const sz of [-0.17, 0.17]) {
        B.push([v(-L / 2, DY + 0.05, sz), v(L / 2, DY + 0.05, sz), 0.02])
        B.push([v(-L / 2, DY - 0.03, sz), v(L / 2, DY - 0.03, sz), 0.02])
        for (let i = 0; i < n; i++) {
          const x0 = -L / 2 + i / n * L, x1 = -L / 2 + (i + 1) / n * L
          B.push([v(x0, DY - 0.03, sz), v(x0, DY + 0.05, sz), 0.01]); B.push([v(x0, DY - 0.03, sz), v(x1, DY + 0.05, sz), 0.008])
        }
      }
      parts.push(beams(B, red))
      pieces.push({ obj: group(...parts), paint: [red, road] })
    }
    // Les deux grands câbles, et les suspentes
    {
      const sag = (x: number) => {
        const ax = Math.abs(x)
        if (ax <= TX) return DY + 0.12 + (TH - DY - 0.14) * Math.pow(ax / TX, 2)
        return TH - 0.02 - (TH - DY - 0.1) * Math.min(1, (ax - TX) / (L / 2 - TX))
      }
      const parts: import('three').Object3D[] = []
      const B: [V3, V3, number, number?][] = []
      for (const sz of [-0.2, 0.2]) {
        const pts = Array.from({ length: 81 }, (_, i) => { const x = -L / 2 + i / 80 * L; return v(x, sag(x), sz) })
        parts.push(mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 200, 0.016, 8), cableM))
        for (let x = -L / 2 + 0.1; x < L / 2; x += 0.1) if (Math.abs(Math.abs(x) - TX) > 0.06) B.push([v(x, DY + 0.07, sz * 0.88), v(x, sag(x), sz), 0.005])
      }
      parts.push(beams(B, cableM))
      pieces.push({ obj: group(...parts), paint: [cableM] })
    }
    const obj = group(...pieces.map(p => p.obj))
    const lights: V3[][] = [-0.2, 0.2].map(sz => Array.from({ length: 60 }, (_, i) => { const x = -L / 2 + i / 59 * L, ax = Math.abs(x); return v(x, (ax <= TX ? DY + 0.12 + (TH - DY - 0.14) * Math.pow(ax / TX, 2) : TH - 0.02 - (TH - DY - 0.1) * Math.min(1, (ax - TX) / (L / 2 - TX))) + 0.02, sz) }))
    return { id: 'goldengate', obj, pieces, h: TH, w: L, lights, dispose() {} }
  }

  /* ======================= LA TOUR DE PISE ======================= */
  function pise(): Monument {
    const R = 0.42, levels = 8, lh = 0.26
    // Le mur intérieur : ses arcades dessinées en creux
    const wallTex = tex(canvas(1024, 256, x => {
      x.fillStyle = '#F2EEE4'; x.fillRect(0, 0, 1024, 256)
      for (let i = 0; i < 16; i++) {
        const cx = i * 64 + 32
        x.fillStyle = '#C9C1B2'; x.beginPath(); x.moveTo(cx - 22, 250); x.lineTo(cx - 22, 90); x.arc(cx, 90, 22, Math.PI, 0); x.lineTo(cx + 22, 250); x.fill()
        x.fillStyle = '#B4AB9A'; x.beginPath(); x.moveTo(cx - 16, 250); x.lineTo(cx - 16, 96); x.arc(cx, 96, 16, Math.PI, 0); x.lineTo(cx + 16, 250); x.fill()
      }
    }), 1, 1)
    const wall = std({ map: wallTex, roughness: 0.85 })
    const white = std({ map: marble, roughness: 0.55 })
    const pieces: Piece[] = []
    const colGeo = k(new T.CylinderGeometry(0.018, 0.02, lh - 0.05, 8))
    for (let i = 0; i < levels; i++) {
      const y = i * lh, parts: import('three').Object3D[] = []
      const r = i === levels - 1 ? R * 0.62 : R
      parts.push(mesh(new T.CylinderGeometry(r * 0.86, r * 0.86, lh, 32, 1, true), i === 0 ? white : wall, 0, y + lh / 2, 0))
      parts.push(mesh(new T.CylinderGeometry(r + 0.025, r + 0.025, 0.035, 36), white, 0, y + lh - 0.0175, 0))
      if (i > 0 && i < levels - 1) {
        const n = 24, im = new T.InstancedMesh(colGeo, white, n), m4 = new T.Matrix4()
        for (let j = 0; j < n; j++) { const a = j / n * Math.PI * 2; im.setMatrixAt(j, m4.makeTranslation(Math.cos(a) * r, y + lh / 2 - 0.0, Math.sin(a) * r)) }
        im.castShadow = true
        parts.push(im)
      } else if (i === 0) parts.push(mesh(new T.CylinderGeometry(R + 0.03, R + 0.05, 0.08, 36), white, 0, 0.04, 0))
      else parts.push(mesh(new T.CylinderGeometry(r * 0.9, r * 0.9, 0.04, 28), white, 0, y + lh + 0.02, 0))
      pieces.push({ obj: group(...parts), paint: [white] })
    }
    const obj = new T.Group()
    const tilt = new T.Group()
    tilt.rotation.z = -0.09
    tilt.add(...pieces.map(p => p.obj))
    obj.add(tilt)
    const lights: V3[][] = Array.from({ length: levels - 1 }, (_, i) => Array.from({ length: 25 }, (_, j) => {
      const a = j / 24 * Math.PI * 2, p = v(Math.cos(a) * (R + 0.04), (i + 1) * lh, Math.sin(a) * (R + 0.04))
      return p.applyAxisAngle(v(0, 0, 1), -0.09)
    }))
    return { id: 'pise', obj, pieces, h: levels * lh + 0.1, w: 1.0, lights, dispose() {} }
  }

  /* ======================= LE CHÂTEAU DE CONTE ======================= */
  function chateau(): Monument {
    const wallM = std({ map: blocks('#F6C9D6', 7, 5, 4, 'rgba(180,110,130,.35)'), roughness: 0.9 })
    const roofM = std({ color: '#7FA8E8', roughness: 0.55 })
    const goldM = std({ color: '#F2C14E', metalness: 0.9, roughness: 0.25 })
    const doorM = std({ color: '#8A5A3C', roughness: 0.7 })
    const flagM = std({ color: '#FF6B81', roughness: 0.8, side: T.DoubleSide })
    const pieces: Piece[] = []
    const crenel = (r: number, y: number, n: number) => {
      const im = new T.InstancedMesh(k(new T.BoxGeometry(0.06, 0.07, 0.05)), wallM, n), m4 = new T.Matrix4(), q = new T.Quaternion()
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; q.setFromAxisAngle(v(0, 1, 0), -a); im.setMatrixAt(i, m4.compose(v(Math.cos(a) * r, y, Math.sin(a) * r), q, v(1, 1, 1))) }
      im.castShadow = true
      return im
    }
    const tower = (x: number, z: number, r: number, h: number, roofH: number, flag = true) => {
      const parts: import('three').Object3D[] = [mesh(new T.CylinderGeometry(r, r * 1.05, h, 28), wallM, x, h / 2, z), mesh(new T.CylinderGeometry(r * 1.15, r * 1.15, 0.08, 28), wallM, x, h + 0.04, z)]
      const c = crenel(r * 1.1, h + 0.11, 12); c.position.set(x, 0, z); parts.push(c)
      parts.push(mesh(new T.ConeGeometry(r * 1.2, roofH, 28), roofM, x, h + 0.08 + roofH / 2, z))
      parts.push(mesh(new T.SphereGeometry(0.025, 10, 8), goldM, x, h + 0.08 + roofH + 0.01, z))
      if (flag) {
        parts.push(mesh(new T.CylinderGeometry(0.006, 0.006, 0.2, 6), goldM, x, h + 0.08 + roofH + 0.1, z))
        const fg = new T.Shape(); fg.moveTo(0, 0); fg.lineTo(0.14, -0.035); fg.lineTo(0, -0.07); fg.closePath()
        parts.push(mesh(new T.ShapeGeometry(fg), flagM, x + 0.005, h + 0.08 + roofH + 0.2, z))
      }
      // Les fenêtres
      for (let i = 0; i < 2; i++) { const a = Math.PI / 2 + (i - 0.5) * 0.9; parts.push(mesh(new RoundedBoxGeometry(0.06, 0.11, 0.03, 2, 0.02), std({ color: '#5B6FA8', roughness: 0.3 }), x + Math.cos(a) * r, h * 0.65, z + Math.sin(a) * r)) }
      return group(...parts)
    }
    // Le rempart et sa porte
    {
      const W = 1.6, Dp = 1.1, h = 0.42
      const parts: import('three').Object3D[] = []
      for (const [w, d, x, z] of [[W, 0.1, 0, Dp / 2], [W, 0.1, 0, -Dp / 2], [0.1, Dp, W / 2, 0], [0.1, Dp, -W / 2, 0]]) parts.push(mesh(new T.BoxGeometry(w, h, d), wallM, x, h / 2, z))
      const im = new T.InstancedMesh(k(new T.BoxGeometry(0.06, 0.07, 0.12)), wallM, 26), m4 = new T.Matrix4()
      for (let i = 0; i < 13; i++) { im.setMatrixAt(i, m4.makeTranslation(-W / 2 + (i + 0.5) / 13 * W, h + 0.035, Dp / 2)); im.setMatrixAt(13 + i, m4.makeTranslation(-W / 2 + (i + 0.5) / 13 * W, h + 0.035, -Dp / 2)) }
      im.castShadow = true; parts.push(im)
      const door = new T.Shape(); door.moveTo(-0.12, 0); door.lineTo(-0.12, 0.2); door.absarc(0, 0.2, 0.12, Math.PI, 0, true); door.lineTo(0.12, 0); door.closePath()
      parts.push(mesh(new T.ExtrudeGeometry(door, { depth: 0.03, bevelEnabled: false }), doorM, 0, 0, Dp / 2 + 0.035))
      pieces.push({ obj: group(...parts), paint: [wallM] })
    }
    // Le donjon
    {
      const parts: import('three').Object3D[] = [mesh(new T.BoxGeometry(0.8, 0.9, 0.6), wallM, 0, 0.45, -0.1)]
      const c = crenel(0.01, 0, 1); c.visible = false; parts.push(c)
      parts.push(mesh(new T.ConeGeometry(0.62, 0.42, 4), roofM, 0, 1.11, -0.1))
      ;(parts[2] as import('three').Mesh).rotation.y = Math.PI / 4
      ;(parts[2] as import('three').Mesh).scale.set(1, 1, 0.75)
      for (let i = 0; i < 3; i++) parts.push(mesh(new RoundedBoxGeometry(0.08, 0.15, 0.03, 2, 0.03), std({ color: '#5B6FA8', roughness: 0.3 }), -0.22 + i * 0.22, 0.6, 0.2))
      pieces.push({ obj: group(...parts), paint: [wallM, roofM] })
    }
    // Les tours
    pieces.push({ obj: tower(0, -0.15, 0.17, 1.3, 0.5), paint: [wallM, roofM] })
    for (const [x, z] of [[-0.8, 0.55], [0.8, 0.55], [-0.8, -0.55], [0.8, -0.55]]) pieces.push({ obj: tower(x, z, 0.14, 0.7, 0.38), paint: [wallM, roofM] })
    const obj = group(...pieces.map(p => p.obj))
    const lights: V3[][] = [[v(-0.8, 0.5, 0.62), v(0, 0.5, 0.6), v(0.8, 0.5, 0.62)], [v(-0.8, 0.85, 0.55), v(0, 1.45, -0.05), v(0.8, 0.85, 0.55)]]
    return { id: 'chateau', obj, pieces, h: 2.05, w: 1.9, lights, dispose() {} }
  }

  /* ======================= LE TAJ MAHAL ======================= */
  function taj(): Monument {
    const white = std({ map: marble, roughness: 0.42 })
    const inset = std({ color: '#E6E0D4', roughness: 0.5 })
    const gold = std({ color: '#E8C25A', metalness: 0.9, roughness: 0.25 })
    const pieces: Piece[] = []
    // Le socle
    pieces.push({ obj: group(mesh(new T.BoxGeometry(2.3, 0.16, 2.3), white, 0, 0.08, 0)), paint: [white] })
    // Le bâtiment : un carré aux coins coupés, ses grandes arches
    {
      const s = new T.Shape(), a = 0.5, c = 0.16
      s.moveTo(-a + c, -a); s.lineTo(a - c, -a); s.lineTo(a, -a + c); s.lineTo(a, a - c); s.lineTo(a - c, a); s.lineTo(-a + c, a); s.lineTo(-a, a - c); s.lineTo(-a, -a + c); s.closePath()
      const g = new T.ExtrudeGeometry(s, { depth: 0.62, bevelEnabled: false }); g.rotateX(-Math.PI / 2)
      const parts: import('three').Object3D[] = [mesh(g, white, 0, 0.16, 0)]
      for (let f = 0; f < 4; f++) {
        const arch = new T.Shape(); arch.moveTo(-0.15, 0); arch.lineTo(-0.15, 0.3); arch.quadraticCurveTo(-0.15, 0.42, 0, 0.47); arch.quadraticCurveTo(0.15, 0.42, 0.15, 0.3); arch.lineTo(0.15, 0); arch.closePath()
        const m = mesh(new T.ExtrudeGeometry(arch, { depth: 0.02, bevelEnabled: false }), inset, 0, 0.18, 0.5)
        const g2 = new T.Group(); g2.add(m); g2.rotation.y = f * Math.PI / 2; parts.push(g2)
        const frame = mesh(new T.BoxGeometry(0.42, 0.56, 0.015), white, 0, 0.44, 0.502); const g3 = new T.Group(); g3.add(frame); g3.rotation.y = f * Math.PI / 2; parts.push(g3)
      }
      pieces.push({ obj: group(...parts), paint: [white] })
    }
    // Le grand dôme en bulbe, sa pointe dorée
    {
      const prof: import('three').Vector2[] = []
      for (let i = 0; i <= 30; i++) { const t = i / 30; const r = t < 0.85 ? 0.36 * Math.sin(Math.min(1, t / 0.55) * Math.PI * 0.62 + 0.25) * (1 - Math.pow(Math.max(0, t - 0.55) / 0.45, 1.7)) : 0.36 * 0.05 * (1 - (t - 0.85) / 0.15); prof.push(new T.Vector2(Math.max(0.001, r), t * 0.62)) }
      const parts: import('three').Object3D[] = [mesh(new T.CylinderGeometry(0.32, 0.32, 0.14, 40), white, 0, 0.85, 0), mesh(new T.LatheGeometry(prof, 48), white, 0, 0.92, 0)]
      parts.push(mesh(new T.CylinderGeometry(0.01, 0.02, 0.18, 8), gold, 0, 1.6, 0), mesh(new T.SphereGeometry(0.025, 12, 8), gold, 0, 1.55, 0))
      pieces.push({ obj: group(...parts), paint: [white] })
    }
    // Les quatre petits pavillons du toit
    {
      const parts: import('three').Object3D[] = []
      for (const [x, z] of [[0.32, 0.32], [-0.32, 0.32], [0.32, -0.32], [-0.32, -0.32]]) {
        for (let i = 0; i < 4; i++) parts.push(mesh(new T.CylinderGeometry(0.008, 0.008, 0.12, 6), white, x + (i % 2 ? 0.05 : -0.05), 0.84, z + (i < 2 ? 0.05 : -0.05)))
        parts.push(mesh(new T.SphereGeometry(0.08, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), white, x, 0.9, z))
        parts.push(mesh(new T.CylinderGeometry(0.004, 0.008, 0.06, 6), gold, x, 1.0, z))
      }
      pieces.push({ obj: group(...parts), paint: [white] })
    }
    // Les quatre minarets
    for (const [x, z] of [[1.02, 1.02], [-1.02, 1.02], [1.02, -1.02], [-1.02, -1.02]]) {
      const parts: import('three').Object3D[] = [mesh(new T.CylinderGeometry(0.055, 0.075, 1.3, 20), white, x, 0.16 + 0.65, z)]
      for (const y of [0.55, 0.95, 1.36]) parts.push(mesh(new T.CylinderGeometry(0.1, 0.1, 0.03, 20), white, x, 0.16 + y, z))
      parts.push(mesh(new T.CylinderGeometry(0.06, 0.06, 0.08, 16), white, x, 1.55, z), mesh(new T.SphereGeometry(0.075, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), white, x, 1.59, z), mesh(new T.CylinderGeometry(0.004, 0.008, 0.06, 6), gold, x, 1.69, z))
      pieces.push({ obj: group(...parts), paint: [white] })
    }
    const obj = group(...pieces.map(p => p.obj))
    const lights: V3[][] = [[v(-1.15, 0.17, 1.15), v(1.15, 0.17, 1.15)], [v(-0.5, 0.79, 0.5), v(0.5, 0.79, 0.5)]]
    return { id: 'taj', obj, pieces, h: 1.75, w: 2.3, lights, dispose() {} }
  }

  /* ======================= BIG BEN ======================= */
  function bigben(): Monument {
    const stoneTex = tex(canvas(256, 512, x => {
      x.fillStyle = '#DCC79C'; x.fillRect(0, 0, 256, 512)
      // Les panneaux gothiques en long
      for (let i = 0; i < 4; i++) {
        x.fillStyle = '#C6AE80'; x.fillRect(16 + i * 60, 20, 44, 470)
        x.fillStyle = '#B49A6A'; x.fillRect(26 + i * 60, 30, 24, 450)
        x.fillStyle = '#E6D3AA'; for (let j = 0; j < 8; j++) x.fillRect(16 + i * 60, 40 + j * 58, 44, 5)
      }
    }), 1, 1)
    const stone = std({ map: stoneTex, roughness: 0.85 })
    const plain = std({ color: '#D7C195', roughness: 0.85 })
    const roofM = std({ color: '#3F4A5A', roughness: 0.5, metalness: 0.3 })
    const gold = std({ color: '#E8C25A', metalness: 0.9, roughness: 0.25 })
    const clockTex = tex(canvas(512, 512, x => {
      x.fillStyle = '#2C3A4A'; x.fillRect(0, 0, 512, 512)
      x.fillStyle = '#E8C25A'; x.fillRect(20, 20, 472, 472)
      x.fillStyle = '#FFF8E8'; x.beginPath(); x.arc(256, 256, 200, 0, 7); x.fill()
      x.strokeStyle = '#2C3A4A'; x.lineWidth = 6; x.beginPath(); x.arc(256, 256, 200, 0, 7); x.stroke()
      x.fillStyle = '#2C3A4A'
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; x.save(); x.translate(256 + Math.sin(a) * 165, 256 - Math.cos(a) * 165); x.rotate(a); x.fillRect(-5, -20, 10, 40); x.restore() }
      x.lineCap = 'round'; x.lineWidth = 14; x.beginPath(); x.moveTo(256, 256); x.lineTo(256 + 70, 256 - 70); x.stroke()
      x.lineWidth = 9; x.beginPath(); x.moveTo(256, 256); x.lineTo(256, 256 - 150); x.stroke()
    }), 1, 1)
    const face = std({ map: clockTex, roughness: 0.4, emissive: '#000000' })
    const pieces: Piece[] = []
    const W = 0.5
    // Le fût, en trois tronçons
    for (let i = 0; i < 3; i++) pieces.push({ obj: group(mesh(new T.BoxGeometry(W, 0.55, W), stone, 0, 0.275 + i * 0.55, 0), mesh(new T.BoxGeometry(W + 0.04, 0.04, W + 0.04), plain, 0, 0.55 + i * 0.55, 0)), paint: [stone] })
    // L'étage des horloges
    {
      const y0 = 1.65, h = 0.55
      const parts: import('three').Object3D[] = [mesh(new T.BoxGeometry(W + 0.08, h, W + 0.08), plain, 0, y0 + h / 2, 0)]
      for (let f = 0; f < 4; f++) {
        const c = mesh(new T.PlaneGeometry(0.44, 0.44), face, 0, y0 + h / 2, (W + 0.08) / 2 + 0.002)
        const g = new T.Group(); g.add(c); g.rotation.y = f * Math.PI / 2; parts.push(g)
      }
      pieces.push({ obj: group(...parts), paint: [plain] })
    }
    // Le beffroi et la flèche
    {
      const y0 = 2.2
      const parts: import('three').Object3D[] = [mesh(new T.BoxGeometry(W, 0.3, W), stone, 0, y0 + 0.15, 0)]
      const sp = new T.ConeGeometry(W * 0.62, 0.75, 4); sp.rotateY(Math.PI / 4)
      parts.push(mesh(sp, roofM, 0, y0 + 0.3 + 0.375, 0))
      for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) parts.push(mesh(new T.ConeGeometry(0.04, 0.22, 8), gold, x * W / 2, y0 + 0.4, z * W / 2))
      parts.push(mesh(new T.CylinderGeometry(0.006, 0.012, 0.22, 6), gold, 0, y0 + 1.15, 0), mesh(new T.SphereGeometry(0.025, 10, 8), gold, 0, y0 + 1.05, 0))
      pieces.push({ obj: group(...parts), paint: [stone, roofM] })
    }
    const obj = group(...pieces.map(p => p.obj))
    const lights: V3[][] = [0, 1, 2, 3].map(c => { const sx = c === 0 || c === 3 ? 1 : -1, sz = c < 2 ? 1 : -1; return Array.from({ length: 24 }, (_, i) => v(sx * (W / 2 + 0.03), i / 23 * 2.2, sz * (W / 2 + 0.03))) })
    return { id: 'bigben', obj, pieces, h: 3.4, w: 0.7, lights, dispose() {} }
  }

  /* ======================= LES MOAI DE L'ÎLE DE PÂQUES ======================= */
  function moai(): Monument {
    const rock = std({ map: blocks('#8D8579', 2, 2, 12, 'rgba(60,55,50,.15)'), roughness: 1 })
    const dark = std({ color: '#5E5850', roughness: 1 })
    const hat = std({ color: '#A8543C', roughness: 0.95 })
    const ahuM = std({ map: blocks('#9C9384', 3, 5, 6, 'rgba(50,45,40,.5)'), roughness: 1 })
    const pieces: Piece[] = []
    pieces.push({ obj: group(mesh(new RoundedBoxGeometry(2.6, 0.3, 0.7, 3, 0.04), ahuM, 0, 0.15, 0)), paint: [ahuM] })
    /** Une statue : le torse, la longue tête, le front lourd, le grand nez, les lèvres serrées, les longues oreilles. */
    const statue = (x: number, s: number) => {
      const g = new T.Group()
      const add = (geo: import('three').BufferGeometry, m: Mat, px: number, py: number, pz: number, rx = 0) => { const o = mesh(geo, m, px, py, pz); o.rotation.x = rx; g.add(o); return o }
      add(new RoundedBoxGeometry(0.46, 0.5, 0.3, 4, 0.1), rock, 0, 0.25, 0)
      add(new RoundedBoxGeometry(0.4, 0.62, 0.34, 4, 0.12), rock, 0, 0.78, 0.01, -0.06)
      add(new RoundedBoxGeometry(0.42, 0.09, 0.14, 3, 0.04), rock, 0, 0.98, 0.13, -0.06)
      for (const sx of [-1, 1]) add(new RoundedBoxGeometry(0.11, 0.05, 0.03, 2, 0.015), dark, sx * 0.1, 0.92, 0.175, -0.06)
      const nose = new T.Shape(); nose.moveTo(0, 0.25); nose.lineTo(0.13, -0.02); nose.quadraticCurveTo(0.14, -0.06, 0.08, -0.07); nose.lineTo(0, -0.07); nose.closePath()
      const ng = new T.ExtrudeGeometry(nose, { depth: 0.13, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 }); ng.translate(0, 0, -0.065); ng.rotateY(-Math.PI / 2)
      add(ng, rock, 0, 0.73, 0.17, -0.06)
      add(new RoundedBoxGeometry(0.22, 0.05, 0.08, 2, 0.02), rock, 0, 0.58, 0.18, -0.06)
      for (const sx of [-1, 1]) add(new RoundedBoxGeometry(0.05, 0.36, 0.1, 2, 0.02), rock, sx * 0.215, 0.8, 0.0)
      g.position.set(x, 0.3, 0)
      g.scale.setScalar(s)
      return g
    }
    const xs = [-0.8, 0, 0.8], ss = [0.95, 1.1, 0.95]
    xs.forEach((x, i) => pieces.push({ obj: group(statue(x, ss[i])), paint: [rock] }))
    xs.forEach((x, i) => pieces.push({ obj: group(mesh(new T.CylinderGeometry(0.17, 0.19, 0.16, 24), hat, x, 0.3 + 1.12 * ss[i], -0.01)), paint: [hat] }))
    const obj = group(...pieces.map(p => p.obj))
    const lights: V3[][] = [[v(-1.3, 0.31, 0.36), v(1.3, 0.31, 0.36)]]
    return { id: 'moai', obj, pieces, h: 1.6, w: 2.6, lights, dispose() {} }
  }

  const build = (id: MonumentId): Monument => {
    const m = id === 'eiffel' ? eiffel() : id === 'pyramide' ? pyramide() : id === 'goldengate' ? goldenGate() : id === 'pise' ? pise()
      : id === 'chateau' ? chateau() : id === 'taj' ? taj() : id === 'bigben' ? bigben() : moai()
    return m
  }
  /** La forme du monument, en transparent : là où les pièces viendront. */
  const ghostMat = k(new T.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.6, depthWrite: false }))
  const ghost = (p: Piece) => {
    const g = p.obj.clone(true)
    g.traverse(o => { const m = o as import('three').Mesh; if (m.isMesh) { m.material = ghostMat; m.castShadow = false; m.receiveShadow = false } })
    return g
  }
  return { T, build, ghost, dispose() { kept.forEach(x => x.dispose()) } }
}
