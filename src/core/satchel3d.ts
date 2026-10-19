import type { T3 } from './three3d'

/* 🎒 LE CARTABLE de « Mon cartable » (19/10, la maquette d'abord) — modelé
   ici, comme le gâteau : le corps rembourré, le rabat qui épouse le dessus
   et le devant, ses fermoirs à tourniquet, la poignée, les bretelles ; le
   sac à dos (sa poche, ses fermetures éclair) ; le cartable à roulettes (sa
   canne, ses roues). Six matières : toile, cuir verni, jean, peluche,
   holographique, et les PAILLETTES RÉVERSIBLES — de vraies petites écailles
   posées sur le rabat, qu'on retourne en les caressant. Des motifs, des
   écussons brodés, des badges, des porte-clés qui se balancent.
   Unité : le cartable fait ~1 de large. */

type Geo = import('three').BufferGeometry
type Mat = import('three').Material
type Grp = import('three').Group
type V3 = import('three').Vector3

export type BagModel = 'rabat' | 'dos' | 'roulettes'
export type BagFabric = 'toile' | 'verni' | 'jean' | 'paillettes' | 'peluche' | 'holo'
export type Motif = 'uni' | 'pois' | 'rayures' | 'coeurs' | 'etoiles' | 'leopard' | 'ecossais'
export type PatchKind = 'coeur' | 'etoile' | 'arcenciel' | 'fraise' | 'eclair' | 'couronne'
export type BadgeKind = 'sourire' | 'fleur' | 'etoile' | 'coeur'
export type CharmKind = 'pompon' | 'etoile' | import('./critters').CritterKind

/** Le look d'un cartable, gardé tel quel. */
export interface BagLook {
  model: BagModel
  fabric: BagFabric
  /** Le corps, le rabat (la poche du sac à dos), les bretelles et la poignée, le métal. */
  body: string
  flap: string
  straps: string
  metal: 'or' | 'argent' | 'rose'
  motif: Motif
  motifColor: string
  /** L'autre face des paillettes. */
  sequinB: string
  patches: { kind: PatchKind; x: number; y: number; rot?: number; size?: number }[]
  badges: { kind: BadgeKind; color: string; x: number; y: number }[]
  charms: CharmKind[]
}

export interface Bag {
  obj: Grp
  /** Les paillettes du rabat : à retourner (0 : face A, 1 : face B), par (u, v) du rabat. */
  sequins: Sequins | null
  /** Les porte-clés se balancent quand le cartable bouge (vitesse de rotation en rad/s). */
  step(dt: number, spin: number): void
  dispose(): void
}

export interface Sequins {
  count: number
  /** Où est chacune, dans le repère du rabat : x (largeur) et s (longueur, du haut vers le bas). */
  at: [number, number][]
  /** Son état voulu (0 ou 1) ; elle y va en tournant sur sa charnière. */
  want: Float32Array
  /** La longueur du rabat et sa demi-largeur (pour dessiner dedans). */
  L: number
  halfW: number
}

export const METAL: Record<BagLook['metal'], string> = { or: '#E2B85C', argent: '#D5DAE0', rose: '#E7A391' }

/** Un hasard qu'on peut rejouer. */
const rng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }

export async function bagKit(T: T3) {
  const { RoundedBoxGeometry } = await import('three/examples/jsm/geometries/RoundedBoxGeometry.js')
  const U = await import('three/examples/jsm/utils/BufferGeometryUtils.js')
  const kept: { dispose(): void }[] = []
  const k = <X extends { dispose(): void }>(x: X) => { kept.push(x); return x }

  /* ---- Les textures, faites une fois ---- */
  const canvas = (w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h
    draw(cv.getContext('2d')!)
    return cv
  }
  /** Une carte de relief (hauteurs en gris) → carte de normales. */
  const normalOf = (src: HTMLCanvasElement, strength: number) => {
    const w = src.width, h = src.height
    const d = src.getContext('2d')!.getImageData(0, 0, w, h).data
    const out = document.createElement('canvas'); out.width = w; out.height = h
    const o = out.getContext('2d')!, img = o.createImageData(w, h)
    const H = (x: number, y: number) => d[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength
      const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4
      img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255
    }
    o.putImageData(img, 0, 0)
    return out
  }
  const tex = (cv: HTMLCanvasElement, color: boolean, rep = 1) => {
    const t = k(new T.CanvasTexture(cv))
    t.wrapS = t.wrapT = T.RepeatWrapping
    t.repeat.set(rep, rep)
    t.anisotropy = 4
    if (color) t.colorSpace = T.SRGBColorSpace
    return t
  }
  // La toile : un tissage serré
  const weave = tex(normalOf(canvas(128, 128, x => {
    x.fillStyle = '#808080'; x.fillRect(0, 0, 128, 128)
    for (let i = 0; i < 128; i += 4) for (let j = 0; j < 128; j += 4) {
      const up = ((i + j) / 4) % 2 === 0
      const g = x.createLinearGradient(i, j, up ? i + 4 : i, up ? j : j + 4)
      g.addColorStop(0, '#5A5A5A'); g.addColorStop(0.5, '#C8C8C8'); g.addColorStop(1, '#5A5A5A')
      x.fillStyle = g; x.fillRect(i, j, 4, 4)
    }
  }), 3), false, 6)
  // Le jean : le sergé en diagonale (gris, teinté par la couleur), et son relief
  const twillCv = canvas(256, 256, x => {
    x.fillStyle = '#9A9A9A'; x.fillRect(0, 0, 256, 256)
    const r = rng(5)
    for (let i = -256; i < 512; i += 5) {
      x.strokeStyle = `rgba(255,255,255,${0.35 + r() * 0.25})`; x.lineWidth = 2
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 256, 256); x.stroke()
    }
    for (let i = 0; i < 2400; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${r() * 0.12})`; x.fillRect(r() * 256, r() * 256, 2, 1) }
  })
  const twillN = tex(normalOf(twillCv, 2), false, 4)
  // La peluche : un duvet fin
  const fuzz = tex(normalOf(canvas(256, 256, x => {
    x.fillStyle = '#808080'; x.fillRect(0, 0, 256, 256)
    const r = rng(9)
    for (let i = 0; i < 9000; i++) {
      const px = r() * 256, py = r() * 256, a = r() * Math.PI * 2
      x.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'; x.lineWidth = 1
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * 4, py + Math.sin(a) * 4); x.stroke()
    }
  }), 4), false, 3)

  // L'holographique : des nappes d'arc-en-ciel pastel, et un froissé qui fait changer le reflet d'un endroit à l'autre
  const holoCv = canvas(512, 512, x => {
    const r = rng(17)
    x.fillStyle = '#E9E4F7'; x.fillRect(0, 0, 512, 512)
    const cols = ['#FFB3D9', '#B3E5FF', '#C8FFD9', '#FFF1B3', '#E0C2FF', '#B3FFF4']
    for (let i = 0; i < 46; i++) {
      const cx = r() * 512, cy = r() * 512, rr = 60 + r() * 140
      for (const [dx, dy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) {
        const g = x.createRadialGradient(cx + dx, cy + dy, 0, cx + dx, cy + dy, rr)
        g.addColorStop(0, cols[i % cols.length]); g.addColorStop(1, 'rgba(255,255,255,0)')
        x.globalAlpha = 0.55; x.fillStyle = g; x.fillRect(cx + dx - rr, cy + dy - rr, rr * 2, rr * 2)
      }
    }
    x.globalAlpha = 1
  })
  const crinkle = tex(normalOf(canvas(256, 256, x => {
    const r = rng(23)
    x.fillStyle = '#808080'; x.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 140; i++) {
      const cx = r() * 256, cy = r() * 256, rr = 10 + r() * 40
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rr)
      g.addColorStop(0, r() < 0.5 ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.5)'); g.addColorStop(1, 'rgba(128,128,128,0)')
      x.fillStyle = g; x.fillRect(cx - rr, cy - rr, rr * 2, rr * 2)
    }
  }), 6), false, 2)

  /** Un motif sur fond (une tuile de 0,5 de côté). */
  const motifTex = (base: string, m: Motif, col: string, under: 'jean' | 'holo' | null) => {
    const S = 512
    const cv = canvas(S, S, x => {
      x.fillStyle = base; x.fillRect(0, 0, S, S)
      if (under === 'jean') { x.globalCompositeOperation = 'multiply'; x.drawImage(twillCv, 0, 0, S, S); x.drawImage(twillCv, 0, 0, S, S); x.globalCompositeOperation = 'source-over' }
      if (under === 'holo') { x.globalAlpha = 0.75; x.drawImage(holoCv, 0, 0, S, S); x.globalAlpha = 1 }
      x.fillStyle = col; x.strokeStyle = col
      const heart = (cx: number, cy: number, s: number) => {
        x.beginPath(); x.moveTo(cx, cy + s * 0.9)
        x.bezierCurveTo(cx - s * 1.4, cy, cx - s * 0.9, cy - s, cx, cy - s * 0.35)
        x.bezierCurveTo(cx + s * 0.9, cy - s, cx + s * 1.4, cy, cx, cy + s * 0.9); x.fill()
      }
      const star = (cx: number, cy: number, s: number, rot = 0) => {
        x.beginPath()
        for (let i = 0; i < 10; i++) { const a = rot - Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? s * 0.45 : s; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) }
        x.closePath(); x.fill()
      }
      const grid = (n: number, f: (cx: number, cy: number, i: number) => void) => {
        const st = S / n
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) f((j + (i % 2) * 0.5) * st, (i + 0.5) * st, i * n + j)
        for (let i = 0; i < n; i++) f((n + (i % 2) * 0.5) * st - S, (i + 0.5) * st, -1)
      }
      if (m === 'pois') grid(6, (cx, cy) => { x.beginPath(); x.arc(cx, cy, 15, 0, 7); x.fill() })
      else if (m === 'rayures') { for (let i = 0; i < 8; i++) x.fillRect(i * S / 8, 0, S / 16, S) }
      else if (m === 'coeurs') grid(5, (cx, cy) => heart(cx, cy, 22))
      else if (m === 'etoiles') grid(5, (cx, cy, i) => star(cx, cy, 24, i * 0.7))
      else if (m === 'leopard') {
        const r = rng(3)
        for (let i = 0; i < 70; i++) {
          const cx = r() * S, cy = r() * S, s = 10 + r() * 10
          for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
            x.globalAlpha = 0.55; x.beginPath(); x.ellipse(cx + dx, cy + dy, s * 1.3, s, r() * 3, 0, 7); x.fill()
            x.globalAlpha = 1; x.lineWidth = 5; x.beginPath(); x.ellipse(cx + dx, cy + dy, s * 1.3, s, r() * 3, 0.4, 2.6); x.stroke()
          }
        }
      } else if (m === 'ecossais') {
        x.globalAlpha = 0.35
        for (let i = 0; i < 4; i++) { x.fillRect(i * S / 4 + 20, 0, 50, S); x.fillRect(0, i * S / 4 + 20, S, 50) }
        x.globalAlpha = 0.6; x.lineWidth = 4
        for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(i * S / 4 + 95, 0); x.lineTo(i * S / 4 + 95, S); x.moveTo(0, i * S / 4 + 95); x.lineTo(S, i * S / 4 + 95); x.stroke() }
        x.globalAlpha = 1
      }
    })
    return tex(cv, true, 1)
  }

  /** La matière d'une pièce : son tissu, sa couleur, son motif. */
  const fabricMat = (f: BagFabric, color: string, m: Motif = 'uni', mc = '#FFFFFF'): Mat => {
    const map = m !== 'uni' || f === 'jean' || f === 'holo' ? motifTex(color, m, mc, f === 'jean' || f === 'holo' ? f : null) : null
    const c = map ? '#FFFFFF' : color
    let mat: Mat
    if (f === 'verni') mat = new T.MeshPhysicalMaterial({ color: c, map, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.05 })
    else if (f === 'peluche') mat = new T.MeshPhysicalMaterial({ color: c, map, roughness: 1, sheen: 1, sheenRoughness: 0.45, sheenColor: new T.Color(color).lerp(new T.Color('#FFFFFF'), 0.6), normalMap: fuzz })
    else if (f === 'holo') mat = new T.MeshPhysicalMaterial({ color: c, map, metalness: 0.55, roughness: 0.16, iridescence: 1, iridescenceIOR: 1.5, iridescenceThicknessRange: [250, 750], clearcoat: 1, clearcoatRoughness: 0.05, normalMap: crinkle, normalScale: new T.Vector2(0.5, 0.5) })
    else if (f === 'jean') mat = new T.MeshStandardMaterial({ color: c, map, roughness: 0.95, normalMap: twillN })
    else mat = new T.MeshStandardMaterial({ color: c, map, roughness: 0.82, normalMap: weave, normalScale: new T.Vector2(0.6, 0.6) })
    return k(mat)
  }
  const metalMat = (m: BagLook['metal']) => k(new T.MeshStandardMaterial({ color: METAL[m], metalness: 0.75, roughness: 0.3 }))

  /* ---- Les formes ---- */
  /** Projette les UV d'une forme sur ses faces (une tuile de motif = 0,5) : le motif garde sa taille partout. */
  const boxUV = (g: Geo, tile = 0.5) => {
    const p = g.getAttribute('position'), n = g.getAttribute('normal')
    const uv = new Float32Array(p.count * 2)
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i))
      let u: number, v: number
      if (ay > ax && ay > az) { u = p.getX(i); v = p.getZ(i) }
      else if (ax > az) { u = p.getZ(i) * Math.sign(n.getX(i)); v = p.getY(i) }
      else { u = p.getX(i) * Math.sign(n.getZ(i)); v = p.getY(i) }
      uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile
    }
    g.setAttribute('uv', new T.BufferAttribute(uv, 2))
    return g
  }
  const rbox = (w: number, h: number, d: number, r: number, seg = 6) => boxUV(new RoundedBoxGeometry(w, h, d, seg, r))

  /** Un ruban épais (bretelle, poignée plate) le long d'une courbe : largeur sur x, épaisseur en travers. */
  const ribbon = (pts: V3[], wide: number, thick: number, n = 48) => {
    const curve = new T.CatmullRomCurve3(pts)
    const ring: [number, number][] = []
    const M = 14
    for (let i = 0; i < M; i++) {
      const a = i / M * Math.PI * 2
      // Un rectangle aux bords arrondis (superellipse)
      const c = Math.cos(a), s = Math.sin(a)
      ring.push([Math.sign(c) * Math.pow(Math.abs(c), 0.35) * wide / 2, Math.sign(s) * Math.pow(Math.abs(s), 0.35) * thick / 2])
    }
    const pos: number[] = [], uv: number[] = [], idx: number[] = []
    const side = new T.Vector3(1, 0, 0), tg = new T.Vector3(), nn = new T.Vector3(), sd = new T.Vector3()
    const len = curve.getLength()
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = curve.getPointAt(t)
      curve.getTangentAt(t, tg)
      nn.crossVectors(tg, side).normalize()
      sd.crossVectors(nn, tg).normalize()
      for (let j = 0; j <= M; j++) {
        const [a, b] = ring[j % M]
        pos.push(p.x + sd.x * a + nn.x * b, p.y + sd.y * a + nn.y * b, p.z + sd.z * a + nn.z * b)
        uv.push(a / 0.5 + j / M * 0, t * len / 0.5)
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j, b = a + M + 1
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
    const g = new T.BufferGeometry()
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }

  /** La surface d'un cube arrondi (w × h × d, rayon r) vue de devant : sa profondeur en (x, y). */
  const frontZ = (w: number, h: number, d: number, r: number, x: number, y: number) => {
    const ex = Math.max(0, Math.abs(x) - (w / 2 - r)), ey = Math.max(0, Math.abs(y) - (h / 2 - r))
    const e = Math.hypot(ex, ey)
    return e >= r ? d / 2 - r : d / 2 - r + Math.sqrt(r * r - e * e)
  }

  /* ---- Le rabat : il part du haut du dos, épouse le dessus, l'arrondi du
     bord et descend sur le devant ; ses coins du bas arrondis. ---- */
  const flapShape = (W: number, H: number, D: number, rb: number, front: number) => {
    const z0 = -D / 2 + 0.05
    const l1 = D / 2 - rb - z0, l2 = Math.PI / 2 * rb, L = l1 + l2 + front
    const halfW = W / 2 - 0.004, rc = 0.13
    const xm = (s: number) => s > L - rc ? halfW - rc + Math.sqrt(Math.max(0, rc * rc - (s - (L - rc)) ** 2)) : halfW
    // Le corps, en distance signée : le rabat l'épouse, arrondis des côtés compris
    const sdf = (x: number, y: number, z: number) => {
      const qx = Math.abs(x) - (W / 2 - rb), qy = Math.abs(y) - (H / 2 - rb), qz = Math.abs(z) - (D / 2 - rb)
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - rb
    }
    const grad = (x: number, y: number, z: number): [number, number, number] => {
      const e = 1e-4
      const gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e)
      const l = Math.hypot(gx, gy, gz) || 1
      return [gx / l, gy / l, gz / l]
    }
    /** Le point (et sa normale) à la longueur s, à la distance off du corps ; un peu bombé au milieu. */
    const at = (s: number, x: number, off: number): [number, number, number, number, number, number] => {
      let px = x, py: number, pz: number
      if (s < l1) { py = H / 2; pz = z0 + s }
      else if (s < l1 + l2) { const a = (s - l1) / l2 * Math.PI / 2; py = H / 2 - rb + rb * Math.cos(a); pz = D / 2 - rb + rb * Math.sin(a) }
      else { py = H / 2 - rb - (s - l1 - l2); pz = D / 2 }
      for (let k = 0; k < 3; k++) { const d = sdf(px, py, pz), g = grad(px, py, pz); px -= g[0] * d; py -= g[1] * d; pz -= g[2] * d }
      const g = grad(px, py, pz)
      const b = off + 0.012 * Math.cos(Math.min(1, Math.abs(x) / halfW) * Math.PI / 2)
      return [px + g[0] * b, py + g[1] * b, pz + g[2] * b, g[0], g[1], g[2]]
    }
    return { L, halfW, xm, at, z0 }
  }
  const flapGeo = (f: ReturnType<typeof flapShape>, t: number) => {
    const NS = 60, NX = 26
    const surf = (off: number, flip: boolean) => {
      const pos: number[] = [], uv: number[] = [], idx: number[] = []
      for (let i = 0; i <= NS; i++) {
        const s = i / NS * f.L, xm = f.xm(s)
        for (let j = 0; j <= NX; j++) {
          const x = (j / NX * 2 - 1) * xm
          const [px, py, pz] = f.at(s, x, off)
          pos.push(px, py, pz); uv.push(x / 0.5, -s / 0.5)
        }
      }
      for (let i = 0; i < NS; i++) for (let j = 0; j < NX; j++) {
        const a = i * (NX + 1) + j, b = a + NX + 1
        if (flip) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, b, b + 1, a + 1)
      }
      const g = new T.BufferGeometry()
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx)
      g.computeVertexNormals()
      return g
    }
    // La tranche : le tour du rabat, de l'intérieur à l'extérieur
    const rim = () => {
      const loop: [number, number][] = []
      for (let i = 0; i <= NS; i++) loop.push([i / NS * f.L, 1])
      for (let j = NX - 1; j >= 1; j--) loop.push([f.L, j / NX * 2 - 1])
      for (let i = NS; i >= 0; i--) loop.push([i / NS * f.L, -1])
      const pos: number[] = [], uv: number[] = [], idx: number[] = []
      loop.forEach(([s, sx], i) => {
        const x = sx * f.xm(s)
        const a = f.at(s, x, 0.003), b = f.at(s, x, t)
        pos.push(a[0], a[1], a[2], b[0], b[1], b[2]); uv.push(i * 0.02, 0, i * 0.02, 0.05)
      })
      for (let i = 0; i < loop.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) }
      const g = new T.BufferGeometry()
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx)
      g.computeVertexNormals()
      return g
    }
    const parts = [surf(t, false), surf(0.003, true), rim()]
    const g = U.mergeGeometries(parts)!
    parts.forEach(p => p.dispose())
    return g
  }

  /** Des surpiqûres : des petits points de fil le long d'une ligne. */
  const stitches = (pts: V3[], color: string, gap = 0.022) => {
    const curve = new T.CatmullRomCurve3(pts)
    const n = Math.max(2, Math.floor(curve.getLength() / gap))
    const geo = k(new T.CapsuleGeometry(0.0035, 0.011, 2, 6))
    geo.rotateZ(Math.PI / 2)
    const im = new T.InstancedMesh(geo, k(new T.MeshStandardMaterial({ color, roughness: 0.7 })), n)
    const m4 = new T.Matrix4(), q = new T.Quaternion(), tg = new T.Vector3(), one = new T.Vector3(1, 1, 1)
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      q.setFromUnitVectors(new T.Vector3(1, 0, 0), curve.getTangentAt(t, tg))
      im.setMatrixAt(i, m4.compose(curve.getPointAt(t), q, one))
    }
    return im
  }

  /* ---- Les écussons brodés : une forme bombée, le fil en satin, le bord surjeté ---- */
  const patchShape = (kind: PatchKind): import('three').Shape => {
    const s = new T.Shape()
    if (kind === 'coeur') {
      s.moveTo(0, -0.9); s.bezierCurveTo(-1.4, 0, -0.9, 1, 0, 0.45); s.bezierCurveTo(0.9, 1, 1.4, 0, 0, -0.9)
    } else if (kind === 'etoile' || kind === 'couronne' || kind === 'eclair') {
      const pts: [number, number][] = kind === 'etoile'
        ? Array.from({ length: 10 }, (_, i) => { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.45 : 1; return [Math.cos(a) * r, Math.sin(a) * r] })
        : kind === 'couronne' ? [[-0.9, -0.6], [0.9, -0.6], [1, 0.7], [0.5, 0.1], [0, 0.85], [-0.5, 0.1], [-1, 0.7]]
          : [[-0.2, 1], [0.55, 1], [0.15, 0.2], [0.6, 0.2], [-0.35, -1], [-0.05, -0.15], [-0.5, -0.15]]
      s.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) s.lineTo(x, y); s.closePath()
    } else if (kind === 'fraise') {
      s.moveTo(0, -1); s.bezierCurveTo(-0.6, -0.6, -0.95, 0.2, -0.75, 0.55); s.bezierCurveTo(-0.5, 0.85, 0.5, 0.85, 0.75, 0.55); s.bezierCurveTo(0.95, 0.2, 0.6, -0.6, 0, -1)
    } else {
      // L'arc-en-ciel, ses deux nuages
      s.moveTo(-1, -0.45); s.absarc(0, -0.45, 1, Math.PI, 0, true); s.lineTo(0.45, -0.45); s.absarc(0, -0.45, 0.45, 0, Math.PI, false); s.closePath()
    }
    return s
  }
  const PATCH_COL: Record<PatchKind, string[]> = {
    coeur: ['#E8456B'], etoile: ['#FFC83D'], fraise: ['#E3343F'], eclair: ['#FFD23F'], couronne: ['#F2B632'],
    arcenciel: ['#E8454D', '#F59A3A', '#F7D046', '#5BBE6A', '#4A9BE0', '#8E6BD8']
  }
  const satin = (cols: string[], kind: PatchKind) => {
    const cv = canvas(256, 256, x => {
      if (kind === 'arcenciel') cols.forEach((c, i) => { x.fillStyle = c; x.beginPath(); x.arc(128, 162, 128 - i * 10.5, Math.PI, 0); x.arc(128, 162, 128 - (i + 1) * 10.5, 0, Math.PI, true); x.fill() })
      else { x.fillStyle = cols[0]; x.fillRect(0, 0, 256, 256) }
      if (kind === 'fraise') { x.fillStyle = '#FFF2B0'; const r = rng(2); for (let i = 0; i < 26; i++) { x.beginPath(); x.ellipse(40 + r() * 176, 60 + r() * 150, 3, 5, 0, 0, 7); x.fill() } x.fillStyle = '#3E9A44'; x.fillRect(70, 0, 116, 40) }
      // Les points de satin, en biais
      x.globalAlpha = 0.22; x.lineWidth = 1.4
      for (let i = -256; i < 512; i += 3) { x.strokeStyle = i % 6 ? '#FFFFFF' : '#000000'; x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 140, 256); x.stroke() }
      x.globalAlpha = 1
    })
    return cv
  }
  const patch = (kind: PatchKind, size: number) => {
    const sh = patchShape(kind)
    const g = new T.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.06, bevelSegments: 3, curveSegments: 18 })
    g.computeBoundingBox()
    const bb = g.boundingBox!
    // Les UV du dessus : la boîte de la forme
    const p = g.getAttribute('position'), uv = g.getAttribute('uv') as import('three').BufferAttribute
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y))
    g.scale(size / 2, size / 2, size / 2 * 0.35)
    const cv = satin(PATCH_COL[kind], kind)
    const m = new T.MeshStandardMaterial({ map: tex(cv, true), normalMap: tex(normalOf(cv, 1.5), false), roughness: 0.55 })
    const mesh = new T.Mesh(k(g), k(m))
    mesh.castShadow = true
    const grp = new T.Group(); grp.add(mesh)
    // Le bord surjeté
    const outline = sh.getSpacedPoints(80).map(v => new T.Vector3(v.x * size / 2, v.y * size / 2, 0.11 * size / 2 * 0.35 + 0.002))
    const rim = new T.Mesh(k(new T.TubeGeometry(new T.CatmullRomCurve3(outline, true), 120, 0.006, 6, true)),
      k(new T.MeshStandardMaterial({ color: new T.Color(PATCH_COL[kind][0]).multiplyScalar(0.72), roughness: 0.6 })))
    grp.add(rim)
    return grp
  }

  /* ---- Les badges : un rond de métal, son image sous un vernis ---- */
  const badge = (kind: BadgeKind, color: string) => {
    const cv = canvas(256, 256, x => {
      x.fillStyle = color; x.fillRect(0, 0, 256, 256)
      x.fillStyle = '#FFFFFF'; x.strokeStyle = '#3A2A2A'; x.lineWidth = 12; x.lineCap = 'round'
      if (kind === 'sourire') { x.fillStyle = '#FFE14D'; x.beginPath(); x.arc(128, 128, 90, 0, 7); x.fill(); x.fillStyle = '#3A2A2A'; x.beginPath(); x.arc(98, 108, 12, 0, 7); x.arc(158, 108, 12, 0, 7); x.fill(); x.beginPath(); x.arc(128, 132, 52, 0.35, Math.PI - 0.35); x.stroke() }
      else if (kind === 'fleur') { for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; x.beginPath(); x.arc(128 + Math.cos(a) * 52, 128 + Math.sin(a) * 52, 40, 0, 7); x.fill() } x.fillStyle = '#FFC93D'; x.beginPath(); x.arc(128, 128, 36, 0, 7); x.fill() }
      else if (kind === 'coeur') { x.beginPath(); x.moveTo(128, 200); x.bezierCurveTo(10, 120, 60, 30, 128, 92); x.bezierCurveTo(196, 30, 246, 120, 128, 200); x.fill() }
      else { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 42 : 96; x.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r) } x.closePath(); x.fill() }
    })
    const face = new T.Mesh(k(new T.CylinderGeometry(0.058, 0.06, 0.012, 40)), [
      k(new T.MeshStandardMaterial({ color: '#C9CED6', metalness: 1, roughness: 0.3 })),
      k(new T.MeshPhysicalMaterial({ map: tex(cv, true), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03 })),
      k(new T.MeshStandardMaterial({ color: '#C9CED6', metalness: 1, roughness: 0.3 }))
    ])
    face.rotation.x = Math.PI / 2
    face.castShadow = true
    return face
  }

  /* ---- Les porte-clés : un anneau, une chaînette, et ce qui pend ---- */
  const charm = async (kind: CharmKind, metal: Mat) => {
    const g = new T.Group()
    const linkGeo = k(new T.TorusGeometry(0.012, 0.0032, 6, 14))
    const ring = new T.Mesh(k(new T.TorusGeometry(0.026, 0.004, 8, 24)), metal)
    ring.position.y = -0.026
    g.add(ring)
    for (let i = 0; i < 3; i++) {
      const l = new T.Mesh(linkGeo, metal)
      l.position.y = -0.06 - i * 0.02
      l.rotation.y = i % 2 ? Math.PI / 2 : 0
      g.add(l)
    }
    const end = -0.12
    let body: import('three').Object3D
    if (kind === 'pompon') {
      const geo = new T.IcosahedronGeometry(0.06, 4)
      const p = geo.getAttribute('position'), r = rng(4)
      for (let i = 0; i < p.count; i++) { const f = 1 + (r() - 0.5) * 0.12; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f) }
      geo.computeVertexNormals()
      body = new T.Mesh(k(geo), k(new T.MeshPhysicalMaterial({ color: '#FF8FB5', roughness: 1, sheen: 1, sheenColor: new T.Color('#FFE0EC'), normalMap: fuzz })))
      body.position.y = end - 0.06
    } else if (kind === 'etoile') {
      const st = patchShape('etoile')
      const geo = new T.ExtrudeGeometry(st, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.15, bevelSegments: 4 })
      geo.center(); geo.scale(0.06, 0.06, 0.06)
      body = new T.Mesh(k(geo), k(new T.MeshPhysicalMaterial({ color: '#FFD34D', roughness: 0.9, sheen: 1, sheenColor: new T.Color('#FFF3B0') })))
      body.position.y = end - 0.065
    } else {
      const { critterKit } = await import('./critters')
      const ck = critterKit(T)
      kept.push(ck)
      const c = ck.make(kind, 0.22)
      body = c.obj
      body.position.y = end - 0.17
    }
    body.traverse(o => { o.castShadow = true })
    g.add(body)
    return g
  }

  /* ---- Le cartable entier ---- */
  async function build(look: BagLook): Promise<Bag> {
    const obj = new T.Group()
    const mats: Mat[] = []
    const own = <M extends Mat>(m: M) => { mats.push(m); return m }
    const seqFabric = look.fabric === 'paillettes'
    const baseFabric: BagFabric = seqFabric ? 'toile' : look.fabric
    const bodyMat = own(fabricMat(baseFabric, look.body, look.motif, look.motifColor))
    const flapMat = seqFabric ? own(fabricMat('toile', look.flap)) : own(fabricMat(baseFabric, look.flap, look.motif, look.motifColor))
    const strapMat = own(fabricMat(look.fabric === 'verni' || look.fabric === 'jean' ? look.fabric : 'toile', look.straps))
    const metal = own(metalMat(look.metal))
    const lining = own(k(new T.MeshStandardMaterial({ color: '#3B3247', roughness: 0.9 })))
    const thread = look.fabric === 'jean' ? '#E39A3B' : new T.Color(look.flap).lerp(new T.Color('#FFFFFF'), 0.55).getStyle()
    const add = (g: Geo, m: Mat, x = 0, y = 0, z = 0) => {
      const mesh = new T.Mesh(k(g), m)
      mesh.position.set(x, y, z)
      mesh.castShadow = true; mesh.receiveShadow = true
      obj.add(mesh)
      return mesh
    }
    let sequins: Sequins | null = null
    let seqMesh: import('three').InstancedMesh | null = null
    const roulettes = look.model === 'roulettes'
    /** Où poser écussons et badges (x, y sur le devant) : la surface du devant. */
    let frontAt: (x: number, y: number) => [number, number, number, number, number, number]
    let W = 1, H = 0.78, D = 0.36

    if (look.model === 'dos') {
      W = 0.92; H = 1.06; D = 0.4
      const r = 0.2
      add(rbox(W, H, D, r, 8), bodyMat)
      // La poche du devant (elle prend la couleur du rabat)
      const pw = 0.72, ph = 0.46, pd = 0.15, py = -0.24
      const pz = frontZ(W, H, D, r, 0, py) - 0.02
      add(rbox(pw, ph, pd, 0.07, 6), flapMat, 0, py, pz + pd / 2 - 0.02)
      // Les fermetures éclair : le ruban, les dents, la tirette
      const zipTape = own(k(new T.MeshStandardMaterial({ color: new T.Color(look.body).multiplyScalar(0.55), roughness: 0.85 })))
      const toothGeo = k(new T.BoxGeometry(0.0065, 0.022, 0.007))
      const zipPath = (pts: V3[]) => {
        const c = new T.CatmullRomCurve3(pts)
        const tape = new T.Mesh(k(new T.TubeGeometry(c, 80, 0.014, 6)), zipTape)
        tape.scale.set(1, 1, 1)
        obj.add(tape)
        // Les dents, en travers, alternées
        const n = Math.floor(c.getLength() / 0.011)
        const im = new T.InstancedMesh(toothGeo, metal, n)
        const m4 = new T.Matrix4(), q = new T.Quaternion(), tg = new T.Vector3(), one = new T.Vector3(1, 1, 1), p = new T.Vector3()
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n
          q.setFromUnitVectors(new T.Vector3(1, 0, 0), c.getTangentAt(t, tg))
          c.getPointAt(t, p); p.z += 0.01
          im.setMatrixAt(i, m4.compose(p, q, one))
        }
        obj.add(im)
        return c
      }
      const arch: V3[] = []
      for (let i = 0; i <= 24; i++) {
        const a = Math.PI * (0.06 + 0.88 * i / 24)
        const x = -Math.cos(a) * (W / 2 - 0.1), y = 0.05 + Math.sin(a) * (H / 2 - 0.12)
        arch.push(new T.Vector3(x, y, frontZ(W, H, D, r, x, y) + 0.004))
      }
      const archC = zipPath(arch)
      const pTop: V3[] = []
      for (let i = 0; i <= 12; i++) { const x = (i / 12 - 0.5) * (pw - 0.12); pTop.push(new T.Vector3(x, py + ph / 2 - 0.05, pz + pd - 0.015)) }
      const pocketC = zipPath(pTop)
      for (const [c, t] of [[archC, 0.62], [pocketC, 0.8]] as [import('three').CatmullRomCurve3, number][]) {
        const p = c.getPointAt(t)
        const slider = new T.Mesh(k(new RoundedBoxGeometry(0.05, 0.03, 0.022, 2, 0.008)), metal)
        slider.position.set(p.x, p.y, p.z + 0.016)
        const pull = new T.Mesh(k(new RoundedBoxGeometry(0.034, 0.075, 0.008, 2, 0.006)), metal)
        pull.position.set(p.x, p.y - 0.05, p.z + 0.022); pull.rotation.x = -0.18
        const ring = new T.Mesh(k(new T.TorusGeometry(0.012, 0.004, 6, 16)), metal)
        ring.position.set(p.x, p.y - 0.068, p.z + 0.024)
        for (const o of [slider, pull, ring]) { o.castShadow = true; obj.add(o) }
      }
      // La poignée du haut, en boucle
      const loop = ribbon([new T.Vector3(-0.09, H / 2 - 0.05, -0.04), new T.Vector3(-0.06, H / 2 + 0.06, -0.03), new T.Vector3(0.06, H / 2 + 0.06, -0.03), new T.Vector3(0.09, H / 2 - 0.05, -0.04)], 0.05, 0.016)
      add(loop, strapMat)
      // Surpiqûres autour de la poche
      const seam: V3[] = []
      for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2; seam.push(new T.Vector3(Math.cos(a) * (pw / 2 - 0.035), py + Math.sin(a) * (ph / 2 - 0.035), pz + pd - 0.01)) }
      obj.add(stitches(seam.map(v => new T.Vector3(Math.max(-pw / 2 + 0.03, Math.min(pw / 2 - 0.03, v.x * 1.25)), Math.max(py - ph / 2 + 0.03, Math.min(py + ph / 2 - 0.03, (v.y - py) * 1.25 + py)), v.z)), thread))
      frontAt = (x, y) => {
        const inPocket = Math.abs(x) < pw / 2 - 0.05 && Math.abs(y - py) < ph / 2 - 0.05
        return [x, y, inPocket ? pz + pd - 0.004 : frontZ(W, H, D, r, x, y), 0, 0, 1]
      }
    } else {
      const rb = 0.07
      add(rbox(W, H, D, rb, 6), bodyMat)
      // Le rabat, sur sa charnière (pour l'ouvrir)
      const f = flapShape(W, H, D, rb, H * 0.62)
      const flap = new T.Mesh(k(flapGeo(f, 0.018)), flapMat)
      flap.castShadow = true; flap.receiveShadow = true
      obj.add(flap)
      // Ses surpiqûres, tout autour, à 2 cm du bord
      const seam: V3[] = []
      const inset = 0.03
      for (let i = 0; i <= 30; i++) { const s = 0.02 + i / 30 * (f.L - 0.02 - inset); const [x, y, z] = f.at(s, f.xm(s) - inset, 0.021); seam.push(new T.Vector3(x, y, z)) }
      for (let i = 1; i < 20; i++) { const x = (1 - i / 10) * (f.halfW - inset - 0.13) ; const [px, py, pz] = f.at(f.L - inset - (f.halfW - inset - Math.abs(x) < 0.13 ? 0.13 - Math.sqrt(Math.max(0, 0.0169 - (0.13 - (f.halfW - inset - Math.abs(x))) ** 2)) : 0), x, 0.021); seam.push(new T.Vector3(px, py, pz)) }
      for (let i = 30; i >= 0; i--) { const s = 0.02 + i / 30 * (f.L - 0.02 - inset); const [x, y, z] = f.at(s, -(f.xm(s) - inset), 0.021); seam.push(new T.Vector3(x, y, z)) }
      obj.add(stitches(seam, thread))
      // Les deux fermoirs à tourniquet : la plaque sur le rabat, la patte sur le corps
      for (const sx of [-0.25, 0.25]) {
        const [x, y, z] = f.at(f.L - 0.075, sx, 0.02)
        const plate = add(rbox(0.13, 0.085, 0.014, 0.012, 3), metal, x, y, z + 0.004)
        plate.castShadow = true
        const knob = add(new T.CylinderGeometry(0.016, 0.016, 0.02, 20), metal, x, y - 0.075, D / 2 + 0.016)
        knob.rotation.x = Math.PI / 2
        add(rbox(0.11, 0.04, 0.012, 0.01, 3), metal, x, y - 0.075, D / 2 + 0.004)
      }
      // La poignée : un arceau de cuir sur le dessus, ses deux pattes
      const top = H / 2 + 0.02
      const handle = new T.Mesh(k(new T.TubeGeometry(new T.CatmullRomCurve3([
        new T.Vector3(-0.17, top, -0.02), new T.Vector3(-0.15, top + 0.09, -0.02), new T.Vector3(0, top + 0.15, -0.02), new T.Vector3(0.15, top + 0.09, -0.02), new T.Vector3(0.17, top, -0.02)
      ]), 40, 0.02, 12)), strapMat)
      handle.castShadow = true
      obj.add(handle)
      for (const sx of [-0.17, 0.17]) add(rbox(0.07, 0.022, 0.06, 0.01, 2), strapMat, sx, top - 0.004, -0.02)
      frontAt = (x, y) => {
        // Sur le rabat (le devant) tant qu'il descend jusque-là, sinon sur le corps
        const sOn = H / 2 - rb - y + (D / 2 - rb - f.z0) + Math.PI / 2 * rb
        if (sOn < f.L - 0.02 && Math.abs(x) < f.xm(sOn) - 0.02) { const p = f.at(sOn, x, 0.02); return [p[0], p[1], p[2], 0, 0, 1] }
        return [x, y, D / 2 + 0.002, 0, 0, 1]
      }
      // Les paillettes, sur le rabat
      if (seqFabric) {
        const at: [number, number][] = []
        const st = 0.03
        for (let s = 0.05, row = 0; s < f.L - 0.015; s += st * 0.8, row++) {
          for (let x = -f.halfW + 0.02 + (row % 2) * st / 2; x < f.halfW - 0.02; x += st) if (Math.abs(x) < f.xm(s) - 0.012) at.push([x, s])
        }
        const disc = k(new T.CylinderGeometry(0.0175, 0.0175, 0.0025, 18))
        disc.translate(0, 0, 0.0155) // la charnière en haut de l'écaille
        const sm = own(k(new T.MeshStandardMaterial({ color: '#FFFFFF', metalness: 0.85, roughness: 0.22 })))
        seqMesh = new T.InstancedMesh(disc, sm, at.length)
        seqMesh.castShadow = false; seqMesh.receiveShadow = true
        obj.add(seqMesh)
        sequins = { count: at.length, at, want: new Float32Array(at.length), L: f.L, halfW: f.halfW }
        const state = new Float32Array(at.length)
        const r = rng(11)
        const jit = Float32Array.from({ length: at.length * 2 }, () => r() - 0.5)
        const cA = new T.Color(look.flap), cB = new T.Color(look.sequinB), c = new T.Color()
        const m4 = new T.Matrix4(), q = new T.Quaternion(), qa = new T.Quaternion(), e = new T.Euler(), one = new T.Vector3(1, 1, 1), pos = new T.Vector3(), nrm = new T.Vector3()
        const place = (i: number) => {
          const [x, s] = at[i]
          const p = f.at(s, x, 0.02)
          pos.set(p[0], p[1], p[2]); nrm.set(p[3], p[4], p[5])
          // Couchée sur le rabat, la charnière vers le haut de la pente ; retournée : de l'autre côté de sa charnière
          q.setFromUnitVectors(new T.Vector3(0, 1, 0), nrm)
          const flip = state[i]
          e.set(-0.2 - flip * (Math.PI - 0.4) + jit[i * 2] * 0.12, 0, jit[i * 2 + 1] * 0.25)
          qa.setFromEuler(e)
          q.multiply(qa)
          seqMesh!.setMatrixAt(i, m4.compose(pos, q, one))
          seqMesh!.setColorAt(i, c.copy(flip < 0.5 ? cA : cB).multiplyScalar(0.9 + jit[i * 2] * 0.2))
        }
        for (let i = 0; i < at.length; i++) place(i)
        seqMesh.userData.place = (dt: number) => {
          let dirty = false
          for (let i = 0; i < at.length; i++) {
            const w = sequins!.want[i]
            if (state[i] === w) continue
            state[i] = w > state[i] ? Math.min(w, state[i] + dt * 7) : Math.max(w, state[i] - dt * 7)
            place(i); dirty = true
          }
          if (dirty) { seqMesh!.instanceMatrix.needsUpdate = true; if (seqMesh!.instanceColor) seqMesh!.instanceColor.needsUpdate = true }
        }
        seqMesh.userData.snap = () => { state.set(sequins!.want); for (let i = 0; i < at.length; i++) place(i); seqMesh!.instanceMatrix.needsUpdate = true; if (seqMesh!.instanceColor) seqMesh!.instanceColor.needsUpdate = true }
      }
    }

    // Les bretelles, rembourrées, sur le dos ; leurs boucles
    for (const sx of [-1, 1]) {
      const x0 = sx * (W * 0.24)
      const pts = [
        new T.Vector3(x0, H / 2 - 0.08, -D / 2 + 0.02), new T.Vector3(x0 * 1.04, H * 0.22, -D / 2 - 0.13),
        new T.Vector3(x0 * 1.08, -H * 0.18, -D / 2 - 0.11), new T.Vector3(x0 * 1.12, -H / 2 + 0.1, -D / 2 - 0.02), new T.Vector3(x0 * 1.12, -H / 2 + 0.05, -D / 2 + 0.03)
      ]
      add(ribbon(pts, 0.085, 0.03), strapMat)
      const b = add(rbox(0.1, 0.05, 0.016, 0.01, 2), metal, x0 * 1.1, -H * 0.3, -D / 2 - 0.092)
      b.rotation.x = 0.18
    }

    // Le cartable à roulettes : la canne, la poignée, les roues
    if (roulettes) {
      const alu = own(k(new T.MeshStandardMaterial({ color: '#BFC6CF', metalness: 1, roughness: 0.3 })))
      const rubber = own(k(new T.MeshStandardMaterial({ color: '#2E2A30', roughness: 0.8 })))
      for (const sx of [-0.3, 0.3]) {
        add(new T.CylinderGeometry(0.018, 0.018, H + 0.62, 16), alu, sx, 0.25, -D / 2 - 0.05)
        const wheel = add(new T.CylinderGeometry(0.085, 0.085, 0.05, 28), rubber, sx * 1.22, -H / 2 - 0.02, -D / 2 - 0.02)
        wheel.rotation.z = Math.PI / 2
        const hub = add(new T.CylinderGeometry(0.04, 0.04, 0.056, 20), own(fabricMat('verni', look.straps)), sx * 1.22, -H / 2 - 0.02, -D / 2 - 0.02)
        hub.rotation.z = Math.PI / 2
      }
      const grip = add(new T.CapsuleGeometry(0.03, 0.56, 4, 14), own(fabricMat('verni', look.straps)), 0, H / 2 + 0.56, -D / 2 - 0.05)
      grip.rotation.z = Math.PI / 2
      add(rbox(0.7, 0.04, 0.12, 0.015, 2), alu, 0, -H / 2 - 0.01, -D / 2 - 0.02)
      for (const sx of [-0.36, 0.36]) add(rbox(0.06, 0.04, 0.06, 0.015, 2), rubber, sx, -H / 2 - 0.03, D / 2 - 0.06)
    }

    // Écussons et badges, sur le devant
    for (const pc of look.patches) {
      const p = patch(pc.kind, pc.size ?? 0.17)
      const [x, y, z] = frontAt(pc.x, pc.y)
      p.position.set(x, y, z + 0.002)
      p.rotation.z = pc.rot ?? 0
      obj.add(p)
    }
    for (const bd of look.badges) {
      const b = badge(bd.kind, bd.color)
      const [x, y, z] = frontAt(bd.x, bd.y)
      b.position.set(x, y, z + 0.008)
      obj.add(b)
    }
    void lining

    // Les porte-clés, accrochés à la poignée (au côté pour le sac à dos)
    const swing: { g: Grp; a: number; v: number; b: number; w: number }[] = []
    let ci = 0
    for (const ch of look.charms) {
      const g = new T.Group()
      g.add(await charm(ch, metal))
      // À un anneau sur le côté droit, l'un devant l'autre
      if (look.model === 'dos') g.position.set(W / 2 + 0.012, H / 2 - 0.3, D / 2 - 0.16 - ci * 0.1)
      else g.position.set(W / 2 + 0.012, H / 2 - 0.1, D / 2 - 0.1 - ci * 0.11)
      obj.add(g)
      swing.push({ g, a: 0.1 * (ci % 2 ? 1 : -1), v: 0, b: 0, w: 0 })
      ci++
    }

    return {
      obj, sequins,
      step(dt, spin) {
        for (const s of swing) {
          // Un pendule : la rotation du cartable le pousse, il revient en se balançant
          s.v += (-s.a * 26 - s.v * 1.6 - spin * 3) * dt
          s.a += s.v * dt
          s.w += (-s.b * 22 - s.w * 1.4) * dt
          s.b += s.w * dt
          s.g.rotation.z = s.a; s.g.rotation.x = s.b
        }
        seqMesh?.userData.place?.(dt)
      },
      dispose() { mats.forEach(m => m.dispose()) }
    }
  }

  return { T, build, patch, badge, dispose() { kept.forEach(x => x.dispose()) } }
}
