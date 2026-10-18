import { describe, expect, it } from 'vitest'
import { bridges, fabric, inflate, silhouette, type Rgba } from './plush'

/** Une feuille transparente où l'on peint des disques (un trait = des disques serrés). */
function sheet(w: number, h: number) {
  const img: Rgba = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }
  const dot = (cx: number, cy: number, r: number, col: [number, number, number]) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h || (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue
      const i = (y * w + x) * 4
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255
    }
  }
  /** Un cercle de rayon R, sans l'arc [gapFrom, gapTo] (en radians). */
  const ring = (cx: number, cy: number, R: number, r: number, col: [number, number, number], gap: [number, number] = [0, 0]) => {
    for (let a = 0; a < Math.PI * 2; a += 0.01) if (a < gap[0] || a > gap[1]) dot(cx + Math.cos(a) * R, cy + Math.sin(a) * R, r, col)
  }
  const line = (x0: number, y0: number, x1: number, y1: number, r: number, col: [number, number, number]) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0))
    for (let k = 0; k <= n; k++) dot(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, r, col)
  }
  return { img, dot, ring, line }
}

const area = (m: Uint8Array) => m.reduce((a, v) => a + v, 0)
const PINK: [number, number, number] = [232, 65, 140]
const BLACK: [number, number, number] = [30, 26, 22]

describe('la silhouette', () => {
  it('remplit un contour fermé', () => {
    const s = sheet(200, 200)
    s.ring(100, 100, 60, 3, PINK)
    const sil = silhouette(s.img)!
    // Le disque entier (rayon ~63 avec le trait), pas seulement l'anneau
    expect(area(sil.mask)).toBeGreaterThan(Math.PI * 60 * 60)
    expect(sil.mask[100 * 200 + 100]).toBe(1)
  })

  it('referme un contour resté ouvert', () => {
    const s = sheet(200, 200)
    s.ring(100, 100, 60, 3, PINK, [0.2, 0.35])
    const sil = silhouette(s.img)!
    expect(sil.mask[100 * 200 + 100]).toBe(1)
  })

  it('ne comble jamais l’écart entre deux pattes', () => {
    const s = sheet(200, 200)
    // Un U : deux pattes et un dos, ouvert en bas
    s.line(60, 40, 140, 40, 4, PINK)
    s.line(60, 40, 60, 160, 4, PINK)
    s.line(140, 40, 140, 160, 4, PINK)
    const sil = silhouette(s.img)!
    expect(sil.mask[120 * 200 + 100]).toBe(0)
  })

  it('garde le plus grand morceau (le soleil à côté reste sur la feuille)', () => {
    const s = sheet(300, 200)
    s.ring(100, 100, 60, 3, PINK)
    s.ring(260, 30, 15, 3, [255, 212, 59])
    const sil = silhouette(s.img)!
    expect(sil.mask[30 * 300 + 260]).toBe(0)
  })

  it('rien de dessiné : pas de peluche', () => {
    expect(silhouette(sheet(100, 100).img)).toBeNull()
  })
})

describe('les trous de contour (avec ses traits)', () => {
  it('relie le début et la fin d’un tour pas tout à fait fini', () => {
    const pts: [number, number][] = []
    for (let a = 0.3; a < Math.PI * 2; a += 0.05) pts.push([100 + Math.cos(a) * 60, 100 + Math.sin(a) * 60])
    expect(bridges([{ pts, width: 6 }], 200)).toHaveLength(1)
  })

  it('ne relie jamais deux traits différents qui se frôlent', () => {
    const legA = { pts: [[60, 40], [60, 160], [92, 162]] as [number, number][], width: 4 }
    const back = { pts: [[50, 40], [150, 40]] as [number, number][], width: 4 }
    const legB = { pts: [[140, 40], [140, 160], [104, 162]] as [number, number][], width: 4 }
    expect(bridges([legA, legB, back], 200)).toHaveLength(0)
  })

  it('les doigts de pied qui se frôlent n’enferment pas l’écart entre les pattes', () => {
    const s = sheet(200, 200)
    s.line(60, 40, 140, 40, 4, PINK)
    s.line(60, 40, 60, 160, 4, PINK); s.line(60, 160, 92, 162, 3, PINK)
    s.line(140, 40, 140, 160, 4, PINK); s.line(140, 160, 104, 162, 3, PINK)
    // Sans ses traits, le bouchage par épaississement l'aurait fermé
    expect(silhouette(s.img)!.mask[120 * 200 + 100]).toBe(1)
    expect(silhouette(s.img, { bridges: [] })!.mask[120 * 200 + 100]).toBe(0)
  })

  it('un tour ouvert, refermé par son pont', () => {
    const s = sheet(200, 200)
    s.ring(100, 100, 60, 3, PINK, [0.2, 0.6])
    const a = [100 + Math.cos(0.2) * 60, 100 + Math.sin(0.2) * 60], b = [100 + Math.cos(0.6) * 60, 100 + Math.sin(0.6) * 60]
    expect(silhouette(s.img, { bridges: [] })!.mask[100 * 200 + 100]).toBe(0)
    expect(silhouette(s.img, { bridges: [[a[0], a[1], b[0], b[1]]] })!.mask[100 * 200 + 100]).toBe(1)
  })
})

describe('le tissu', () => {
  const at = (f: Uint8ClampedArray, w: number, x: number, y: number) => [f[(y * w + x) * 4], f[(y * w + x) * 4 + 1], f[(y * w + x) * 4 + 2]]

  it('un contour rose donne un tissu rose pâle', () => {
    const s = sheet(200, 200)
    s.ring(100, 100, 60, 3, PINK)
    const f = fabric(s.img, silhouette(s.img)!)
    const [r, g, b] = at(f, 200, 100, 100)
    expect(r).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(PINK[1])
    expect(b).toBeGreaterThan(PINK[2])
  })

  it('les moustaches noires ne volent pas la couleur de la tête', () => {
    const s = sheet(200, 200)
    s.ring(100, 100, 60, 3, PINK)
    for (let k = 0; k < 4; k++) s.line(75, 90 + k * 8, 125, 94 + k * 8, 1.5, BLACK)
    const f = fabric(s.img, silhouette(s.img)!)
    const [r, g] = at(f, 200, 100, 140)
    expect(r - g).toBeGreaterThan(40)
  })

  it('un contour noir donne un tissu crème, un œil minuscule cerclé de noir reste sombre', () => {
    const s = sheet(240, 240)
    s.ring(120, 120, 90, 3, BLACK)
    s.ring(90, 100, 6, 1.5, BLACK)
    const f = fabric(s.img, silhouette(s.img)!)
    expect(at(f, 240, 150, 150)[0]).toBeGreaterThan(220)
    expect(at(f, 240, 90, 100)[0]).toBeLessThan(80)
  })
})

describe('le maillage', () => {
  const disk = () => {
    const s = sheet(160, 160)
    s.ring(80, 80, 50, 3, PINK)
    return silhouette(s.img)!
  }

  it('fermé : chaque arête est partagée par deux triangles (devant et dos cousus)', () => {
    const m = inflate(disk())
    const seen = new Map<string, number>()
    for (let t = 0; t < m.index.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = m.index[t + e], b = m.index[t + (e + 1) % 3]
      const key = a < b ? `${a}-${b}` : `${b}-${a}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    expect([...seen.values()].every(n => n === 2)).toBe(true)
  })

  it('bombé au milieu, plat à la couture, posé sur ses pieds', () => {
    const m = inflate(disk(), { puff: 0.34 })
    let zmax = 0, ymin = Infinity
    for (let i = 0; i < m.pos.length; i += 3) { zmax = Math.max(zmax, m.pos[i + 2]); ymin = Math.min(ymin, m.pos[i + 1]) }
    // Demi-largeur ~53 px : la demi-épaisseur au plus large en est environ le tiers
    expect(zmax).toBeGreaterThan(12)
    expect(zmax).toBeLessThan(25)
    expect(Math.abs(ymin)).toBeLessThan(0.01)
  })

  it('une seule couture autour d’un disque', () => {
    const m = inflate(disk())
    expect(m.seams.length).toBe(1)
    expect(m.seams[0].length).toBeGreaterThan(80)
  })
})
