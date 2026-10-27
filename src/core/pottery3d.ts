/* 🏺 L'ATELIER DU POTIER en 3D (27/10, la Poterie) — modelé ici, rien de
   Kenney : la pièce de terre (UNE géométrie de révolution dont seules les
   positions changent : `PATH` points de profil × `SEG` côtés, normales
   calculées sur le profil — pas de couture), sa peinture (une texture en
   (tour, hauteur) rejouée depuis ses traits), la terre crue mate et la terre
   émaillée brillante ; le tour (plateau d'alu tourné, bac à barbotine,
   pédale), le four à briques et sa porte, l'étagère et ses huit places.
   La logique de la terre est dans `pottery.ts`. */
import type { Stage, T3 } from './three3d'
import { woodTex } from './three3d'
import { PATH, profilePath, type Clay, type PaintOp, type PotData } from './pottery'

type Mesh = import('three').Mesh
type Grp = import('three').Group
type Mat = import('three').MeshPhysicalMaterial

/** Les côtés de la pièce (un rond de 64 : la lèvre reste ronde de près). */
export const SEG = 64
/** La hauteur du plateau du tour. */
export const WHEEL_Y = 0.62

/** La terre crue (grise, humide) et la terre cuite (sous l'émail, un biscuit clair et chaud). */
const RAW = '#8E7262', FIRED = '#EAD6BC', INSIDE_RAW = '#7A5F50', INSIDE_FIRED = '#DCC09C'

/* ---------- La peinture : rejouée depuis ses traits ---------- */

/** Peint les traits d'une pièce sur son canvas (u : le tour, v : la hauteur ; `v` = 1 en haut du canvas). */
export function paintCanvas(cv: HTMLCanvasElement, ops: PaintOp[], glazed: boolean, clay: Clay) {
  const W = cv.width, H = cv.height, g = cv.getContext('2d')!
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  g.fillStyle = glazed ? FIRED : RAW
  g.fillRect(0, 0, W, H)
  // Le dedans et la lèvre, d'un ton plus sombre (là où le jour n'entre pas)
  g.fillStyle = glazed ? INSIDE_FIRED : INSIDE_RAW
  g.fillRect(0, 0, W, H * 0.035)
  // Le grain de la terre : des points et des traînées fines (le tour les tire en long)
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  for (let i = 0; i < W * H / 260; i++) {
    const l = rnd()
    g.fillStyle = l < 0.5 ? `rgba(70,45,30,${0.05 + rnd() * 0.06})` : `rgba(255,240,220,${0.04 + rnd() * 0.06})`
    g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * W * 0.03, 1 + rnd() * 1.4)
  }
  for (const op of ops) paintOp(g, W, H, op, glazed, clay)
}

/** Combien de pixels du canvas font un mètre, en tour et en hauteur (pour des points ronds sur la pièce). */
function scaleOf(W: number, H: number, clay: Clay, v: number) {
  const k = Math.max(0, Math.min(1, (v - 0.02) / 0.9))
  const i = Math.round(k * (clay.r.length - 1))
  const circ = 2 * Math.PI * Math.max(0.04, clay.r[i])
  return { su: W / circ, sv: 0.9 * H / clay.h }
}

/** Un trait sur le canvas. Un trait qui passe le bord du tour se redessine de l'autre côté. */
export function paintOp(g: CanvasRenderingContext2D, W: number, H: number, op: PaintOp, glazed: boolean, clay: Clay) {
  // Crue, la peinture est un engobe mat un peu poudré ; émaillée, elle ressort vive
  g.globalAlpha = glazed ? 1 : 0.82
  g.fillStyle = g.strokeStyle = op.c
  if (op.k === 'd') {
    const { su, sv } = scaleOf(W, H, clay, op.v)
    const rw = 0.022
    for (let i = 0; i < op.n; i++) {
      const u = (((op.u + i / op.n) % 1) + 1) % 1
      for (const off of [-1, 0, 1]) {
        g.beginPath()
        g.ellipse((u + off) * W, (1 - op.v) * H, rw * su, rw * sv, 0, 0, Math.PI * 2)
        g.fill()
      }
    }
  } else {
    const p = op.p
    const { sv } = scaleOf(W, H, clay, p[1])
    g.lineWidth = Math.max(2, op.w * sv)
    g.lineCap = 'round'; g.lineJoin = 'round'
    const base = Math.floor(Math.min(...p.filter((_, i) => i % 2 === 0)))
    const span = Math.ceil(Math.max(...p.filter((_, i) => i % 2 === 0))) - base
    for (let off = -1; off <= span; off++) {
      g.beginPath()
      for (let i = 0; i < p.length; i += 2) {
        const x = (p[i] - base - off) * W, y = (1 - p[i + 1]) * H
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y)
      }
      if (p.length === 2) { g.arc((p[0] - base - off) * W, (1 - p[1]) * H, g.lineWidth / 2, 0, Math.PI * 2); g.fill() }
      else g.stroke()
    }
  }
  g.globalAlpha = 1
}

/* ---------- Le relief de la terre : les cercles qu'y laissent les doigts au tournage ---------- */

function throwRings(T: T3, stage: Stage) {
  const W = 64, H = 512
  const h = new Float32Array(W * H)
  let seed = 11
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const ph = Array.from({ length: 6 }, () => rnd() * 6)
  for (let y = 0; y < H; y++) {
    const ring = Math.sin(y * 0.19 + ph[0]) * 0.55 + Math.sin(y * 0.071 + ph[1]) * 0.35 + Math.sin(y * 0.43 + ph[2]) * 0.12
    for (let x = 0; x < W; x++) h[y * W + x] = ring + (rnd() - 0.5) * 0.18
  }
  const img = new ImageData(W, H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x
    const dx = (h[y * W + (x + 1) % W] - h[y * W + (x + W - 1) % W]) * 0.6
    const dy = (h[Math.min(H - 1, y + 1) * W + x] - h[Math.max(0, y - 1) * W + x]) * 1.6
    const l = Math.hypot(dx, dy, 1)
    img.data[i * 4] = (-dx / l * 0.5 + 0.5) * 255
    img.data[i * 4 + 1] = (dy / l * 0.5 + 0.5) * 255
    img.data[i * 4 + 2] = (1 / l * 0.5 + 0.5) * 255
    img.data[i * 4 + 3] = 255
  }
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H })
  c.getContext('2d')!.putImageData(img, 0, 0)
  const t = new T.CanvasTexture(c)
  t.wrapS = t.wrapT = T.RepeatWrapping
  t.repeat.set(10, 1)
  return stage.keep(t)
}

/* ---------- La pièce ---------- */

export interface PotView {
  mesh: Mesh
  mat: Mat
  canvas: HTMLCanvasElement
  /** Les positions suivent le profil (à chaque geste). */
  setClay(c: Clay): void
  /** Rejoue toute la peinture (au chargement, après un émaillage). */
  repaint(d: PotData): void
  /** Un trait de plus, peint sur le canvas ; `flush` l'envoie à la carte graphique. */
  addOp(op: PaintOp, d: PotData): void
  /** Envoie ce qui a été peint : le seul rectangle touché quand c'est un bout de bande
      (une texture entière à chaque image fait ramer la tablette : PIEGES.md). */
  flush(renderer: import('three').WebGLRenderer): void
  /** Crue (mate) ou émaillée (brillante). */
  setGlazed(on: boolean): void
  dispose(): void
}

export function potView(T: T3, d: PotData, texW = 1024, rings?: import('three').Texture): PotView {
  const N = PATH, cols = SEG + 1
  const pos = new Float32Array(N * cols * 3), nor = new Float32Array(N * cols * 3), uv = new Float32Array(N * cols * 2)
  const idx: number[] = []
  for (let i = 0; i < N - 1; i++) for (let j = 0; j < SEG; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols, e = c + 1
    idx.push(a, b, c, b, e, c)
  }
  const geo = new T.BufferGeometry()
  geo.setAttribute('position', new T.BufferAttribute(pos, 3))
  geo.setAttribute('normal', new T.BufferAttribute(nor, 3))
  geo.setAttribute('uv', new T.BufferAttribute(uv, 2))
  geo.setIndex(idx)
  const cos = Array.from({ length: cols }, (_, j) => Math.cos(j / SEG * Math.PI * 2))
  const sin = Array.from({ length: cols }, (_, j) => Math.sin(j / SEG * Math.PI * 2))
  const cv = Object.assign(document.createElement('canvas'), { width: texW, height: texW / 2 })
  const map = new T.CanvasTexture(cv)
  map.colorSpace = T.SRGBColorSpace
  map.anisotropy = 4
  map.wrapS = T.RepeatWrapping
  const mat = new T.MeshPhysicalMaterial({ map, roughness: 0.9, metalness: 0, normalMap: rings ?? null, normalScale: new T.Vector2(0.35, 0.35) })
  const mesh = new T.Mesh(geo, mat)
  mesh.castShadow = true; mesh.receiveShadow = true
  const setClay = (c: Clay) => {
    const { pts, n, v } = profilePath(c)
    for (let i = 0; i < N; i++) {
      const [r, y] = pts[i], [nr, ny] = n[i]
      for (let j = 0; j < cols; j++) {
        const k = (i * cols + j) * 3
        // L'angle croît avec u, vu d'en haut dans le sens du tour
        pos[k] = r * cos[j]; pos[k + 1] = y; pos[k + 2] = -r * sin[j]
        nor[k] = nr * cos[j]; nor[k + 1] = ny; nor[k + 2] = -nr * sin[j]
        const q = (i * cols + j) * 2
        uv[q] = j / SEG; uv[q + 1] = v[i]
      }
    }
    geo.attributes.position.needsUpdate = true
    geo.attributes.normal.needsUpdate = true
    geo.attributes.uv.needsUpdate = true
    geo.computeBoundingSphere(); geo.computeBoundingBox()
  }
  const setGlazed = (on: boolean) => {
    // L'émail : un vernis épais et net par-dessus ; crue, la terre boit la lumière
    mat.roughness = on ? 0.32 : 0.86
    mat.clearcoat = on ? 1 : 0.12
    mat.clearcoatRoughness = on ? 0.05 : 0.55
    mat.normalScale.set(on ? 0.12 : 0.35, on ? 0.12 : 0.35)
    mat.needsUpdate = true
  }
  setClay(d.clay)
  paintCanvas(cv, d.paint, d.glazed, d.clay)
  setGlazed(d.glazed)
  const TW = cv.width, TH = cv.height
  let dirty: { x0: number; y0: number; x1: number; y1: number } | 'all' | null = null
  let uploaded = false
  const patch = new T.CanvasTexture(Object.assign(document.createElement('canvas'), { width: 4, height: 4 }))
  patch.colorSpace = T.SRGBColorSpace
  return {
    mesh, mat, canvas: cv,
    setClay,
    repaint(dd) { paintCanvas(cv, dd.paint, dd.glazed, dd.clay); dirty = 'all' },
    addOp(op, dd) {
      paintOp(cv.getContext('2d')!, TW, TH, op, dd.glazed, dd.clay)
      // Un bout de bande qui ne passe pas le bord : son rectangle seulement
      if (op.k === 'b' && op.p.length === 4 && Math.floor(op.p[0]) === Math.floor(op.p[2]) && dirty !== 'all') {
        const m = op.w * 0.9 * TH / dd.clay.h + 6
        const b = Math.floor(op.p[0])
        const xa = (op.p[0] - b) * TW, xb = (op.p[2] - b) * TW, ya = (1 - op.p[1]) * TH, yb = (1 - op.p[3]) * TH
        const r = { x0: Math.min(xa, xb) - m, y0: Math.min(ya, yb) - m, x1: Math.max(xa, xb) + m, y1: Math.max(ya, yb) + m }
        dirty = dirty ? { x0: Math.min(dirty.x0, r.x0), y0: Math.min(dirty.y0, r.y0), x1: Math.max(dirty.x1, r.x1), y1: Math.max(dirty.y1, r.y1) } : r
      } else dirty = 'all'
    },
    flush(renderer) {
      if (!dirty) return
      const r = dirty
      dirty = null
      if (r === 'all' || !uploaded) { map.needsUpdate = true; uploaded = true; return }
      const x0 = Math.max(0, Math.floor(r.x0)), y0 = Math.max(0, Math.floor(r.y0))
      const x1 = Math.min(TW, Math.ceil(r.x1)), y1 = Math.min(TH, Math.ceil(r.y1))
      const w = x1 - x0, h = y1 - y0
      if (w <= 0 || h <= 0) return
      if (w * h > TW * TH * 0.4) { map.needsUpdate = true; return }
      const pc = patch.image as HTMLCanvasElement
      if (pc.width !== w || pc.height !== h) { pc.width = w; pc.height = h; patch.dispose() }
      const g = pc.getContext('2d')!
      g.globalCompositeOperation = 'copy'
      g.drawImage(cv, x0, y0, w, h, 0, 0, w, h)
      g.globalCompositeOperation = 'source-over'
      patch.needsUpdate = true
      // La texture est retournée à l'envoi (flipY) : le rectangle se pose en TH − y1
      renderer.copyTextureToTexture(patch, map, null, new T.Vector2(x0, TH - y1))
    },
    setGlazed,
    dispose() { geo.dispose(); mat.dispose(); map.dispose(); patch.dispose() }
  }
}

/* ---------- L'atelier ---------- */

export interface Studio {
  /** Le plateau qui tourne (la pièce s'y pose). */
  head: Grp
  /** Le four : sa porte (0 ouverte, 1 fermée), sa braise (0..1), l'endroit où la pièce cuit. */
  kiln: { g: Grp; door: Grp; glow: import('three').PointLight; ember: import('three').MeshStandardMaterial; spot: import('three').Vector3; window: import('three').MeshStandardMaterial }
  /** Les huit places de l'étagère (monde), du haut à gauche au bas à droite. */
  slots: import('three').Vector3[]
  rings: import('three').Texture
  /** Chaque image : la porte, la braise. */
  step(dt: number, door: number, heat: number, t: number): void
}

const canvasTex = (T: T3, stage: Stage, w: number, h: number, f: (g: CanvasRenderingContext2D) => void, srgb = true) => {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h })
  f(c.getContext('2d')!)
  const t = new T.CanvasTexture(c)
  if (srgb) t.colorSpace = T.SRGBColorSpace
  t.anisotropy = 4
  return stage.keep(t)
}

/** Des briques (couleur et relief) pour le four. */
function brickTex(T: T3, stage: Stage) {
  const W = 512, H = 512, rowH = 32, bw = 64
  let seed = 5
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const map = canvasTex(T, stage, W, H, g => {
    g.fillStyle = '#D9CBB8'; g.fillRect(0, 0, W, H)
    for (let r = 0; r < H / rowH; r++) for (let k = -1; k < W / bw + 1; k++) {
      const x = k * bw + (r % 2) * bw / 2, y = r * rowH
      const l = 0.85 + rnd() * 0.25
      g.fillStyle = `rgb(${172 * l | 0},${88 * l | 0},${62 * l | 0})`
      g.fillRect(x + 3, y + 3, bw - 6, rowH - 6)
      for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(60,25,15,${rnd() * 0.15})`; g.fillRect(x + 3 + rnd() * (bw - 9), y + 3 + rnd() * (rowH - 9), 3, 2) }
    }
  })
  const bump = canvasTex(T, stage, W, H, g => {
    g.fillStyle = '#555'; g.fillRect(0, 0, W, H)
    for (let r = 0; r < H / rowH; r++) for (let k = -1; k < W / bw + 1; k++) {
      const x = k * bw + (r % 2) * bw / 2, y = r * rowH
      g.fillStyle = '#DDD'; g.fillRect(x + 4, y + 4, bw - 8, rowH - 8)
    }
  }, false)
  for (const t of [map, bump]) { t.wrapS = t.wrapT = T.RepeatWrapping }
  return { map, bump }
}

export function buildStudio(T: T3, stage: Stage): Studio {
  const S = stage.scene
  const add = <M extends import('three').Object3D>(o: M, parent: import('three').Object3D = S) => { parent.add(o); o.traverse(x => { x.castShadow = true; x.receiveShadow = true }); return o }
  const std = (color: string, o: Partial<import('three').MeshStandardMaterialParameters> = {}) => new T.MeshStandardMaterial({ color, roughness: 0.6, ...o })
  const lathe = (pts: [number, number][], seg = 48) => new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), seg)

  // Le plancher et le mur à la chaux
  const floor = new T.Mesh(new T.PlaneGeometry(9, 7), new T.MeshStandardMaterial({ map: (() => { const t = stage.keep(woodTex(T, '#B88A5A')); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(3, 3); return t })(), roughness: 0.75 }))
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; S.add(floor)
  const wallMap = canvasTex(T, stage, 1024, 512, g => {
    g.fillStyle = '#EFE2CF'; g.fillRect(0, 0, 1024, 512)
    let seed = 3
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    for (let i = 0; i < 2200; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '160,130,100' : '255,250,240'},${rnd() * 0.07})`; g.beginPath(); g.arc(rnd() * 1024, rnd() * 512, 4 + rnd() * 26, 0, 7); g.fill() }
    // Le soubassement ocre
    g.fillStyle = '#D9A86C'; g.fillRect(0, 400, 1024, 112)
    g.fillStyle = 'rgba(120,80,40,.25)'; g.fillRect(0, 396, 1024, 6)
  })
  const wall = new T.Mesh(new T.PlaneGeometry(9, 4.5), new T.MeshStandardMaterial({ map: wallMap, roughness: 0.95 }))
  wall.position.set(0, 2.25, -1.45); wall.receiveShadow = true; S.add(wall)
  const side = new T.Mesh(new T.PlaneGeometry(7, 4.5), new T.MeshStandardMaterial({ map: wallMap, roughness: 0.95 }))
  side.position.set(-2.9, 2.25, 1.5); side.rotation.y = Math.PI / 2; side.receiveShadow = true; S.add(side)
  // La fenêtre : le jardin derrière les carreaux, la lumière du matin
  const win = new T.Group()
  const sky = new T.Mesh(new T.PlaneGeometry(1.1, 0.9), new T.MeshBasicMaterial({ map: canvasTex(T, stage, 256, 210, g => {
    const gr = g.createLinearGradient(0, 0, 0, 210); gr.addColorStop(0, '#9FD3F5'); gr.addColorStop(0.62, '#DDF1FB'); gr.addColorStop(0.63, '#8CC66A'); gr.addColorStop(1, '#6AAE4E')
    g.fillStyle = gr; g.fillRect(0, 0, 256, 210)
    g.fillStyle = '#5E9E45'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(20 + i * 46, 130, 24 + (i % 2) * 10, 0, 7); g.fill() }
    g.fillStyle = '#FFFFFF'; g.globalAlpha = 0.85; g.beginPath(); g.arc(70, 40, 16, 0, 7); g.arc(92, 36, 20, 0, 7); g.arc(114, 42, 14, 0, 7); g.fill()
  }), toneMapped: false }))
  win.add(sky)
  const frameMat = std('#F7F1E6', { roughness: 0.5 })
  for (const [w, h, x, y] of [[1.24, 0.07, 0, 0.48], [1.24, 0.1, 0, -0.49], [0.07, 1.0, -0.585, 0], [0.07, 1.0, 0.585, 0], [1.14, 0.04, 0, 0], [0.04, 0.92, 0, 0]] as const) {
    const b = new T.Mesh(new T.BoxGeometry(w, h, 0.06), frameMat); b.position.set(x, y, 0.02); win.add(b)
  }
  const sill = new T.Mesh(new T.BoxGeometry(1.4, 0.05, 0.18), frameMat); sill.position.set(0, -0.55, 0.08); win.add(sill)
  win.position.set(0.15, 2.0, -1.44)
  add(win)
  // Un pot de géranium sur le rebord (de vraies feuilles en boules)
  const ger = new T.Group()
  ger.add(new T.Mesh(lathe([[0.001, 0], [0.07, 0], [0.09, 0.12], [0.095, 0.13], [0.001, 0.13]], 24), std('#C46A44', { roughness: 0.85 })))
  for (let i = 0; i < 9; i++) { const l = new T.Mesh(new T.SphereGeometry(0.05, 12, 8), std('#4E9A44', { roughness: 0.7 })); l.position.set(Math.cos(i * 2.4) * 0.06, 0.17 + (i % 3) * 0.03, Math.sin(i * 2.4) * 0.05); ger.add(l) }
  for (let i = 0; i < 4; i++) { const f = new T.Mesh(new T.SphereGeometry(0.035, 12, 8), std('#E8456B', { roughness: 0.6 })); f.position.set(Math.cos(i * 1.6) * 0.05, 0.25 + (i % 2) * 0.02, Math.sin(i * 1.6) * 0.04); ger.add(f) }
  ger.position.set(-0.35, 1.47, -1.32); add(ger)

  /* --- Le tour : le bac à barbotine (blanc émaillé), le plateau en alu tourné, le socle, la pédale --- */
  const enamel = new T.MeshPhysicalMaterial({ color: '#F1EEE8', roughness: 0.35, clearcoat: 0.5 })
  const pan = new T.Mesh(lathe([[0.001, 0.0], [0.56, 0.0], [0.6, 0.02], [0.62, 0.17], [0.65, 0.19], [0.66, 0.18], [0.63, 0.015], [0.6, -0.01]], 64), enamel)
  pan.material.side = T.DoubleSide
  pan.position.y = WHEEL_Y - 0.16
  add(pan)
  // La barbotine au fond du bac (la terre délayée)
  const slip = new T.Mesh(new T.RingGeometry(0.14, 0.58, 48), new T.MeshPhysicalMaterial({ color: '#9C806C', roughness: 0.35, clearcoat: 0.6 }))
  slip.rotation.x = -Math.PI / 2; slip.position.y = WHEEL_Y - 0.155; add(slip)
  const alu = canvasTex(T, stage, 512, 512, g => {
    g.fillStyle = '#B9BEC4'; g.fillRect(0, 0, 512, 512)
    // Les cercles du tournage du métal, et quelques repères de centrage
    for (let r = 4; r < 256; r += 2) { g.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '90,95,100'},${0.05 + Math.random() * 0.08})`; g.lineWidth = 1.2; g.beginPath(); g.arc(256, 256, r, 0, 7); g.stroke() }
    g.strokeStyle = 'rgba(60,64,70,.5)'; g.lineWidth = 3
    for (const r of [80, 150, 220]) { g.beginPath(); g.arc(256, 256, r, 0, 7); g.stroke() }
    g.fillStyle = 'rgba(120,90,70,.4)'
    for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(256 + Math.cos(i * 0.7) * 200, 256 + Math.sin(i * 0.7) * 200, 14, 5, i * 0.7 + 1.57, 0, 7); g.fill() }
  })
  const head = new T.Group()
  head.position.y = WHEEL_Y
  const disc = new T.Mesh(new T.CylinderGeometry(0.42, 0.4, 0.05, 64), [
    new T.MeshStandardMaterial({ color: '#9EA3A9', metalness: 0.9, roughness: 0.35 }),
    new T.MeshStandardMaterial({ map: alu, metalness: 0.85, roughness: 0.38 }),
    new T.MeshStandardMaterial({ color: '#8A8F95', metalness: 0.9, roughness: 0.4 })
  ])
  disc.position.y = -0.025
  head.add(disc)
  // Deux taches de terre sur le plateau : on voit qu'il tourne
  for (const [a, rr] of [[0.6, 0.33], [2.9, 0.3]] as const) {
    const b = new T.Mesh(new T.CircleGeometry(0.03, 16), new T.MeshStandardMaterial({ color: '#8F7462', roughness: 0.9 }))
    b.rotation.x = -Math.PI / 2; b.position.set(Math.cos(a) * rr, 0.0015, Math.sin(a) * rr); b.scale.set(1.5, 0.8, 1); head.add(b)
  }
  add(head)
  const shaft = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.2, 20), std('#55595E', { metalness: 0.8, roughness: 0.4 }))
  shaft.position.y = WHEEL_Y - 0.12; add(shaft)
  const body = new T.Mesh(lathe([[0.001, 0], [0.5, 0], [0.52, 0.03], [0.48, 0.12], [0.36, WHEEL_Y - 0.17], [0.001, WHEEL_Y - 0.17]], 48), std('#3E6E8E', { roughness: 0.45, metalness: 0.3 }))
  add(body)
  const pedal = new T.Group()
  const pedalArm = new T.Mesh(new T.BoxGeometry(0.16, 0.035, 0.34), std('#2E3236', { roughness: 0.5 })); pedalArm.position.set(0, 0.05, 0.62); pedalArm.rotation.x = -0.18; pedal.add(pedalArm)
  const pedalPad = new T.Mesh(new T.BoxGeometry(0.18, 0.02, 0.2), std('#1E1F21', { roughness: 0.9 })); pedalPad.position.set(0, 0.075, 0.68); pedalPad.rotation.x = -0.18; pedal.add(pedalPad)
  pedal.position.x = 0.32; add(pedal)

  /* --- À côté du tour : le seau d'eau et son éponge, l'estèque, le fil à couper --- */
  const bucket = new T.Group()
  const bk = new T.Mesh(lathe([[0.001, 0], [0.13, 0], [0.16, 0.24], [0.17, 0.25], [0.165, 0.26], [0.15, 0.25], [0.12, 0.02], [0.001, 0.02]], 32), std('#E8A33D', { roughness: 0.45 }))
  bk.material.side = T.DoubleSide; bucket.add(bk)
  const water = new T.Mesh(new T.CircleGeometry(0.145, 32), new T.MeshPhysicalMaterial({ color: '#8C7766', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.92 }))
  water.rotation.x = -Math.PI / 2; water.position.y = 0.2; bucket.add(water)
  const sponge = new T.Mesh(new T.SphereGeometry(0.07, 16, 10), std('#F2D04E', { roughness: 0.95 }))
  sponge.scale.set(1.2, 0.55, 0.9); sponge.position.set(0.03, 0.215, 0.02); bucket.add(sponge)
  bucket.position.set(-0.95, 0, 0.35); add(bucket)
  const stool = new T.Group()
  const seat = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.05, 32), new T.MeshStandardMaterial({ map: stage.keep(woodTex(T, '#C99A5F')), roughness: 0.6 }))
  seat.position.y = 0.5; stool.add(seat)
  for (let i = 0; i < 3; i++) { const l = new T.Mesh(new T.CylinderGeometry(0.02, 0.025, 0.5, 8), std('#8A5A32')); const a = i * 2.09; l.position.set(Math.cos(a) * 0.13, 0.25, Math.sin(a) * 0.13); l.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12); stool.add(l) }
  stool.position.set(-1.0, 0, -0.5); add(stool)
  // Sur le tabouret : le pain de terre emballé, l'estèque en bois
  const loaf = new T.Mesh(new T.BoxGeometry(0.26, 0.12, 0.18, 4, 2, 3), new T.MeshPhysicalMaterial({ color: '#A98E7A', roughness: 0.55, clearcoat: 0.3 }))
  loaf.position.set(-1.0, 0.585, -0.5); loaf.rotation.y = 0.4; add(loaf)
  const rib = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.01, 24, 1, false, 0, Math.PI), std('#D9B07A', { roughness: 0.5 }))
  rib.position.set(-0.55, WHEEL_Y + 0.035, 0.42); rib.rotation.set(0, 0.6, 0); add(rib)

  /* --- Le four à briques : voûté, sa porte en fonte, son hublot, sa cheminée --- */
  const kilnG = new T.Group()
  const bricks = brickTex(T, stage)
  const bm = (rx: number, ry: number, turn = 0) => {
    const map = bricks.map.clone(); map.repeat.set(rx, ry); map.rotation = turn; map.needsUpdate = true
    const bump = bricks.bump.clone(); bump.repeat.set(rx, ry); bump.rotation = turn; bump.needsUpdate = true
    return new T.MeshStandardMaterial({ map: stage.keep(map), bumpMap: stage.keep(bump), bumpScale: 1.4, roughness: 0.9 })
  }
  const KW = 0.95, KH = 0.95, KD = 0.85
  const box = new T.Mesh(new T.BoxGeometry(KW, KH, KD), [bm(1.6, 1.6), bm(1.6, 1.6), bm(1.6, 1.4), bm(1.6, 1.4), bm(1.6, 1.6), bm(1.6, 1.6)])
  box.position.y = KH / 2; kilnG.add(box)
  // La voûte : un demi-cylindre couché d'avant en arrière, aplati
  const vault = new T.Mesh(new T.CylinderGeometry(KW / 2, KW / 2, KD, 32, 1, false, Math.PI / 2, Math.PI), bm(1.4, 1.2, Math.PI / 2))
  vault.rotation.x = Math.PI / 2
  vault.scale.z = 0.5
  vault.position.y = KH
  kilnG.add(vault)
  // La bouche du four (le noir dedans), sa braise, et le cadre en fonte
  const mouthW = 0.5, mouthH = 0.5
  const ember = new T.MeshStandardMaterial({ color: '#1A0E0A', emissive: '#FF5A1F', emissiveIntensity: 0, roughness: 1 })
  const inside = new T.Mesh(new T.PlaneGeometry(mouthW, mouthH), ember)
  inside.position.set(0, 0.42, KD / 2 + 0.002); kilnG.add(inside)
  const iron = std('#2D2A28', { metalness: 0.7, roughness: 0.45 })
  for (const [w, h, x, y] of [[mouthW + 0.1, 0.05, 0, 0.42 + mouthH / 2 + 0.025], [mouthW + 0.1, 0.05, 0, 0.42 - mouthH / 2 - 0.025], [0.05, mouthH, -mouthW / 2 - 0.025, 0.42], [0.05, mouthH, mouthW / 2 + 0.025, 0.42]] as const) {
    const b = new T.Mesh(new T.BoxGeometry(w, h, 0.04), iron); b.position.set(x, y, KD / 2 + 0.02); kilnG.add(b)
  }
  // La porte, sur ses gonds à gauche
  const door = new T.Group()
  door.position.set(-mouthW / 2 - 0.02, 0.42, KD / 2 + 0.05)
  const plate = new T.Mesh(new T.BoxGeometry(mouthW + 0.04, mouthH + 0.04, 0.04), std('#3A3532', { metalness: 0.75, roughness: 0.4 }))
  plate.position.x = mouthW / 2 + 0.02; door.add(plate)
  const win2 = new T.MeshStandardMaterial({ color: '#140A08', emissive: '#FF6A2A', emissiveIntensity: 0, roughness: 0.2 })
  const porthole = new T.Mesh(new T.CircleGeometry(0.075, 28), win2); porthole.position.set(mouthW / 2 + 0.02, 0.06, 0.021); door.add(porthole)
  const rim = new T.Mesh(new T.TorusGeometry(0.08, 0.014, 10, 28), std('#B08D57', { metalness: 1, roughness: 0.3 })); rim.position.copy(porthole.position); door.add(rim)
  const handle = new T.Mesh(new T.TorusGeometry(0.05, 0.012, 8, 20, Math.PI), std('#B08D57', { metalness: 1, roughness: 0.3 }))
  handle.position.set(mouthW - 0.04, -0.08, 0.04); handle.rotation.z = -Math.PI / 2; door.add(handle)
  for (const y of [0.17, -0.17]) { const h2 = new T.Mesh(new T.CylinderGeometry(0.015, 0.015, 0.08, 10), iron); h2.position.set(0, y, 0); door.add(h2) }
  kilnG.add(door)
  // La cheminée et son chapeau, le cadran de température
  const pipe = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.9, 20), std('#4A4643', { metalness: 0.7, roughness: 0.45 }))
  pipe.position.set(0.22, KH + 0.6, -0.15); kilnG.add(pipe)
  const cap = new T.Mesh(new T.ConeGeometry(0.13, 0.08, 20), std('#4A4643', { metalness: 0.7, roughness: 0.45 })); cap.position.set(0.22, KH + 1.1, -0.15); kilnG.add(cap)
  const dial = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.02, 24), [std('#B08D57', { metalness: 1, roughness: 0.3 }), new T.MeshStandardMaterial({ map: canvasTex(T, stage, 128, 128, g => {
    g.fillStyle = '#FFF8EC'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill()
    const gr = g.createConicGradient(Math.PI * 0.75, 64, 64); gr.addColorStop(0, '#5EC97B'); gr.addColorStop(0.4, '#FFD34D'); gr.addColorStop(0.75, '#E8456B'); gr.addColorStop(1, '#E8456B')
    g.strokeStyle = gr; g.lineWidth = 14; g.beginPath(); g.arc(64, 64, 44, Math.PI * 0.75, Math.PI * 2.25); g.stroke()
  }), roughness: 0.4 }), std('#B08D57')])
  dial.rotation.x = Math.PI / 2; dial.position.set(0.33, 0.82, KD / 2 + 0.012); kilnG.add(dial)
  const needle = new T.Mesh(new T.BoxGeometry(0.006, 0.045, 0.004), std('#3A2E25')); needle.geometry.translate(0, 0.022, 0)
  needle.position.set(0.33, 0.82, KD / 2 + 0.026); kilnG.add(needle)
  // Le socle du four (deux briques de calage) et sa lumière de braise
  const glow = new T.PointLight('#FF7A30', 0, 3.2, 1.6)
  glow.position.set(0, 0.45, KD / 2 + 0.35); kilnG.add(glow)
  kilnG.position.set(1.62, 0, -0.62)
  kilnG.rotation.y = -0.55
  add(kilnG)
  glow.castShadow = false
  const spot = kilnG.localToWorld(new T.Vector3(0, 0.2, 0.05))

  /* --- L'étagère : deux planches sur leurs équerres, huit places --- */
  const shelfG = new T.Group()
  const plankMat = new T.MeshStandardMaterial({ map: stage.keep(woodTex(T, '#B07A45')), roughness: 0.55 })
  const slots: import('three').Vector3[] = []
  const SX = -1.55, SY = [1.62, 1.12], SW = 1.5
  for (const y of SY) {
    const p = new T.Mesh(new T.BoxGeometry(SW, 0.04, 0.3), plankMat); p.position.set(0, y, 0); shelfG.add(p)
    for (const x of [-SW / 2 + 0.12, SW / 2 - 0.12]) {
      const br = new T.Mesh(new T.BoxGeometry(0.03, 0.16, 0.2), std('#3A3532', { metalness: 0.6, roughness: 0.5 })); br.position.set(x, y - 0.1, -0.03); shelfG.add(br)
    }
  }
  shelfG.position.set(SX, 0, -1.3)
  add(shelfG)
  for (const y of SY) for (let i = 0; i < 4; i++) slots.push(new T.Vector3(SX - SW / 2 + 0.2 + i * (SW - 0.4) / 3, y + 0.02, -1.27))

  const rings = throwRings(T, stage)
  let pedalT = 0
  return {
    head, slots, rings,
    kiln: { g: kilnG, door, glow, ember, spot, window: win2 },
    step(dt, d, heat, t) {
      door.rotation.y = -(1 - d) * 1.9
      ember.emissiveIntensity = heat * (2.2 + Math.sin(t * 7) * 0.25 + Math.sin(t * 13.3) * 0.15)
      win2.emissiveIntensity = heat * (3 + Math.sin(t * 9) * 0.4)
      glow.intensity = heat * (1 - d * 0.75) * 6
      needle.rotation.z = 2.3 - heat * 4.2
      pedalT += dt
      pedal.rotation.x = Math.sin(pedalT * 0.7) * 0.01
    }
  }
}
