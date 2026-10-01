import type { GameContext } from '../core/types'
import { createStage, loader, picker, woodTex, dotTex, type Stage, type T3 } from '../core/three3d'
import { particles, camShake, toScreen, type Particles, type CamShake } from '../core/scene3d'
import { makeCut, pieceOutline, gridFor, isStraight, type Cut } from '../core/jigsaw'
import { sfx, preloadSfx } from '../core/sfx'
import { tone } from '../core/audio'
import { ICON } from '../core/icons'
import { PIC_W, PIC_H, type Picture } from '../core/pictures'
import type { HandMove } from '../core/hand'
import { BADGE } from '../core/badges'

/* LE PUZZLE (30/09) — le premier mode du jeu Puzzle (`taquin.ts` le monte ;
   le Taquin est le second). Validé par le père : « un vrai puzzle, des
   pièces aux vraies découpes, en vrac sur la table, des images tirées de
   leurs créations ».

   En vraie 3D, sur le socle : une table en bois, un plateau encadré où
   l'image se reconstruit (son fantôme très pâle guide, et à la fleur le
   contour des pièces est tracé dessus), des pièces en carton épais —
   tenons et mortaises courbes (`core/jigsaw.ts`), léger biseau, l'image
   plaquée sur le dessus, tranche et dos couleur carton.

   Le geste : on attrape une pièce au doigt, elle se soulève (son ombre
   s'élargit), suit le doigt, et s'aimante à sa place si on la lâche près —
   la tolérance est large, pensée pour 6 ans. Clic, étincelles, petite
   secousse. Plusieurs doigts à la fois (chaque doigt suit SA pièce, par
   `pointerId`). Une pièce posée ne bouge plus ; une pièce lâchée ailleurs
   reste là où on l'a mise (sur la table, sur le plateau, ou sur une autre).

   Pas de chrono, pas de coups comptés : un puzzle fini, c'est trois étoiles.
   À la fin, un reflet passe sur l'image entière, des étincelles, la caméra
   s'approche — puis l'écran de fin. */

type Mesh = import('three').Mesh

/** Le plateau, en unités de la scène : 4:3 comme les images. */
const BW = 4
const BH = 3
/** Le dessus du plateau (là où se posent les pièces), le cadre en bois. */
const TRAY = 0.04
const RIM = 0.16
const TILT = 0.36 // la caméra, inclinée depuis la verticale (≈ 20°)

interface Piece {
  i: number
  r: number
  c: number
  mesh: Mesh
  /** Sa place sur le plateau (x, z du centre de sa case). */
  home: { x: number; z: number }
  /** Là où le doigt l'a laissée (ou la tient). */
  goal: { x: number; z: number }
  x: number
  z: number
  y: number
  /** Hauteur de repos : la table, le plateau, le cadre ou une autre pièce. */
  rest: number
  yaw: number
  yawGoal: number
  layer: number
  held: number | null
  placed: boolean
  /** L'aimant : progression 0..1 du vol vers la place (−1 : rien en cours). */
  snap: number
  from: { x: number; z: number; y: number; yaw: number }
  pop: number
  /** Elle penche un peu quand on la tire (en main). */
  tiltX: number
  tiltZ: number
}

interface Grab { p: Piece; ox: number; oz: number }

interface State {
  stage: Stage
  T: T3
  holder: HTMLElement
  fx: Particles
  shake: CamShake
  /** Jeton de l'image en cours : une image plus récente annule la précédente. */
  gen: number
  ready: boolean
  done: boolean
  n: number
  cut: Cut | null
  s: number
  th: number
  tol: number
  pieces: Piece[]
  placed: number
  layerTop: number
  held: Map<number, Grab>
  topMat: import('three').MeshStandardMaterial
  sideMat: import('three').MeshStandardMaterial
  tex: import('three').Texture | null
  ghost: Mesh
  ghostTex: import('three').Texture | null
  shine: Mesh
  shineT: number
  blobs: Mesh[]
  /** Ce que la caméra doit montrer, et la zone de la table où une pièce reste visible. */
  view: { d: number; want: number; zc: number; minX: number; maxX: number; minZ: number; maxZ: number }
  fin: number
  sparkT: number
  t: number
}

export interface Jigsaw {
  /** Change d'image : nouvelle découpe, pièces remélangées. */
  setPicture(p: Promise<Picture | null>): void
  hand(): HandMove | null
  /** Un doigt tient une pièce : le travail de fond (vignettes) attend. */
  busy(): boolean
  /** Les pièces sont sur la table (l'image est prête). */
  ready(): boolean
  dispose(): void
}

/* ---------- La géométrie d'une pièce ---------- */
function pieceGeo(T: T3, cut: Cut, r: number, c: number, s: number, th: number, segs: number) {
  const bs = pieceOutline(cut, r, c)
  const X = (gx: number) => (gx - cut.cols / 2) * s
  const Y = (gy: number) => -(gy - cut.rows / 2) * s
  const shape = new T.Shape()
  shape.moveTo(X(bs[0][0][0]), Y(bs[0][0][1]))
  for (const b of bs) {
    if (isStraight(b)) shape.lineTo(X(b[3][0]), Y(b[3][1]))
    else shape.bezierCurveTo(X(b[1][0]), Y(b[1][1]), X(b[2][0]), Y(b[2][1]), X(b[3][0]), Y(b[3][1]))
  }
  // Le biseau RENTRE dans la forme (bevelOffset) : deux voisines se touchent
  // sans se chevaucher, et leur biseau dessine un fin sillon entre elles
  const bevT = th * 0.22, bevS = s * 0.016
  const geo = new T.ExtrudeGeometry(shape, {
    depth: th - 2 * bevT, bevelEnabled: true, bevelThickness: bevT, bevelSize: bevS, bevelOffset: -bevS,
    bevelSegments: 2, curveSegments: segs
  })
  // UV planaires : le dessus montre SA portion de l'image
  const pos = geo.attributes.position, uv = geo.attributes.uv
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + BW / 2) / BW, (pos.getY(i) + BH / 2) / BH)
  uv.needsUpdate = true
  // Groupes : le couvercle d'ExtrudeGeometry contient le dessous PUIS le
  // dessus. Le dessus prend l'image ; les flancs et le biseau, le carton ;
  // le dessous n'est jamais vu (une pièce n'est jamais retournée) : pas dessiné
  const [lid, side] = geo.groups
  geo.clearGroups()
  geo.addGroup(lid.start + lid.count / 2, lid.count / 2, 0)
  geo.addGroup(side.start, side.count, 1)
  // Le plan de la forme devient la table : son « haut » part vers −z (le fond)
  geo.rotateX(-Math.PI / 2)
  const cx = X(c + 0.5), cz = -Y(r + 0.5)
  geo.translate(-cx, bevT, -cz)
  geo.computeBoundingSphere()
  return { geo, home: { x: cx, z: cz } }
}

/* ---------- Le fantôme de l'image sur le plateau (et, à la fleur, les contours) ---------- */
function ghostCanvas(pic: Picture, cut: Cut, outlines: boolean): HTMLCanvasElement {
  const W = 1280, H = 960
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H
  const g = cv.getContext('2d')!
  g.fillStyle = '#EDE3D2'
  g.fillRect(0, 0, W, H)
  g.globalAlpha = 0.26
  g.drawImage(pic.src, 0, 0, W, H)
  g.globalAlpha = 1
  // Un voile crème uniforme : le fantôme reste un fantôme
  g.fillStyle = 'rgba(237,227,210,.18)'
  g.fillRect(0, 0, W, H)
  if (outlines) {
    const kx = W / cut.cols, ky = H / cut.rows
    g.strokeStyle = 'rgba(110,86,62,.5)'
    g.lineWidth = 3
    g.lineJoin = 'round'
    for (let r = 0; r < cut.rows; r++) for (let c = 0; c < cut.cols; c++) {
      const bs = pieceOutline(cut, r, c)
      g.beginPath()
      g.moveTo(bs[0][0][0] * kx, bs[0][0][1] * ky)
      for (const b of bs) g.bezierCurveTo(b[1][0] * kx, b[1][1] * ky, b[2][0] * kx, b[2][1] * ky, b[3][0] * kx, b[3][1] * ky)
      g.stroke()
    }
  }
  return cv
}

/** Une image de secours (pas de WebGL pour les rendus) : on peut jouer quand même. */
function fallbackPicture(): Picture {
  const cv = document.createElement('canvas')
  cv.width = PIC_W; cv.height = PIC_H
  const g = cv.getContext('2d')!
  const gr = g.createLinearGradient(0, 0, PIC_W, PIC_H)
  gr.addColorStop(0, '#FF9C8F'); gr.addColorStop(0.35, '#FFC06B'); gr.addColorStop(0.65, '#7BD494'); gr.addColorStop(1, '#6FC2EE')
  g.fillStyle = gr
  g.fillRect(0, 0, PIC_W, PIC_H)
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,255,255,${0.2 + (i % 5) * 0.12})`
    g.beginPath(); g.arc((i * 211) % PIC_W, (i * 137) % PIC_H, 18 + (i % 7) * 9, 0, Math.PI * 2); g.fill()
  }
  return { src: cv, url: '' }
}

/* ---------- L'attente d'une image ----------
   Une image est un rendu 3D à part (`core/pictures.ts`) : la vignette du
   jeu respire pendant ce temps, comme l'écran de chargement — mais sans son
   garde-fou « 3D bloquée » (la scène, elle, est déjà là) : une image qui ne
   vient pas est remplacée au bout de `PIC_WAIT_MS` par une image de
   secours, la partie ne reste jamais figée. */
const PIC_WAIT_MS = 120000
export function pictureWait(host: HTMLElement): () => void {
  const el = document.createElement('div')
  el.className = 'pz-loading'
  el.innerHTML = `<div class="ld-badge">${BADGE.taquin2 || ''}</div><div class="ld-dots"><i></i><i></i><i></i></div>`
  host.appendChild(el)
  return () => el.remove()
}
/** L'image, ou null si elle échoue ou tarde trop. */
export function pictureOrNull(ctx: GameContext, pr: Promise<Picture | null>): Promise<Picture | null> {
  return Promise.race([pr.catch(() => null), new Promise<null>(res => { ctx.after(PIC_WAIT_MS, () => res(null)) })])
}

/* ---------- Le montage ---------- */
export function mountJigsaw(ctx: GameContext, holder: HTMLElement, first: Promise<Picture | null>): Jigsaw {
  let me: State | null = null
  let rim: Mesh[] = []
  let dead = false
  let started = false
  let pendingPic: Promise<Picture | null> = first
  // L'écran de chargement du socle couvre la création de la scène ; l'image,
  // elle, a son attente à part (`pictureWait`)
  let hideLoader: (() => void) | null = loader(holder, 'taquin2')
  let waitOff: (() => void) | null = null
  const cleanups: (() => void)[] = []
  preloadSfx(['click', 'drop', 'tick', 'confirm', 'pluck'])

  const bot = !!(window as unknown as { __BOT?: boolean }).__BOT

  /** La zone sûre de l'écran : ni sous les colonnes d'outils, ni sous la barre. */
  const safeRect = () => {
    const a = holder.getBoundingClientRect()
    const root = ctx.root
    const L = root.querySelector('.tq-tools')?.getBoundingClientRect()
    const R = root.querySelector('.pz-pics')?.getBoundingClientRect()
    const P = document.querySelector('.playbar')?.getBoundingClientRect()
    const side = Math.max(L ? L.right - a.left : 0, R && R.width ? a.right - R.left : 0) + 10
    return { l: a.left + side, r: a.right - side, t: Math.max(a.top + 8, (P ? P.bottom : a.top) + 6), b: a.bottom - 8, a }
  }

  /** Place la caméra pour que plateau + marges tiennent dans la zone sûre. */
  function fit(m: State) {
    const { T, camera } = m.stage
    const sr = safeRect()
    const w = sr.a.width, h = sr.a.height
    if (w < 10 || h < 10) return
    // Le plateau, et autour de quoi étaler les pièces (autant de place que le plateau, à peu près)
    const want: [number, number][] = [[-BW * 1.1, -BH * 0.82], [BW * 1.1, -BH * 0.82], [-BW * 1.1, BH * 0.9], [BW * 1.1, BH * 0.9]]
    const zc = 0.12
    const v = new T.Vector3()
    const place = (d: number) => {
      camera.position.set(0, Math.cos(TILT) * d, zc + Math.sin(TILT) * d)
      camera.lookAt(0, 0, zc)
      camera.updateMatrixWorld()
      camera.updateProjectionMatrix()
    }
    const fits = (d: number, pts: [number, number][]) => {
      place(d)
      return pts.every(([x, z]) => {
        v.set(x, 0, z).project(camera)
        const px = sr.a.left + (v.x + 1) / 2 * w, py = sr.a.top + (1 - v.y) / 2 * h
        return px >= sr.l && px <= sr.r && py >= sr.t && py <= sr.b
      })
    }
    let lo = 2, hi = 60
    for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (fits(mid, want)) hi = mid; else lo = mid }
    // Pour l'outro : juste le plateau et son cadre, en grand
    const rimPts: [number, number][] = [[-BW / 2 - RIM, -BH / 2 - RIM], [BW / 2 + RIM, -BH / 2 - RIM], [-BW / 2 - RIM, BH / 2 + RIM], [BW / 2 + RIM, BH / 2 + RIM]]
    let lo2 = 2, hi2 = 60
    for (let k = 0; k < 30; k++) { const mid = (lo2 + hi2) / 2; if (fits(mid, rimPts)) hi2 = mid; else lo2 = mid }
    m.view.d = hi; m.view.want = hi2; m.view.zc = zc
    place(m.done ? m.view.want : hi)
    // La zone de la table qui reste visible (une pièce lâchée n'y échappe pas)
    const ray = new T.Raycaster()
    const hit = new T.Vector3()
    const ground = new T.Plane(new T.Vector3(0, 1, 0), 0)
    const at = (px: number, py: number) => {
      ray.setFromCamera(new T.Vector2((px - sr.a.left) / w * 2 - 1, -((py - sr.a.top) / h) * 2 + 1), camera)
      return ray.ray.intersectPlane(ground, hit) ? hit.clone() : null
    }
    const tl = at(sr.l, sr.t), tr = at(sr.r, sr.t), bl = at(sr.l, sr.b), br = at(sr.r, sr.b)
    if (tl && tr && bl && br) {
      m.view.minX = Math.max(tl.x, bl.x); m.view.maxX = Math.min(tr.x, br.x)
      m.view.minZ = Math.max(tl.z, tr.z); m.view.maxZ = Math.min(bl.z, br.z)
    }
  }

  /** Les pièces en vrac autour du plateau : tirées au hasard sur la table
      visible (hors du plateau, jamais sous les colonnes), écartées les unes
      des autres autant que la place le permet, un peu tournées. S'il n'y a
      vraiment plus de place, elles se chevauchent — et se posent l'une sur
      l'autre, comme un vrai tas. */
  function scatter(m: State) {
    const { T, camera } = m.stage
    const sr = safeRect()
    const w = sr.a.width, h = sr.a.height
    const r0 = m.s * 0.62
    const v = new T.Vector3()
    const screen = (x: number, z: number) => {
      v.set(x, m.th, z).project(camera)
      return { x: sr.a.left + (v.x + 1) / 2 * w, y: sr.a.top + (1 - v.y) / 2 * h }
    }
    const exX = BW / 2 + RIM + m.s * 0.85, exZ = BH / 2 + RIM + m.s * 0.85
    const ok = (x: number, z: number) => {
      if (Math.abs(x) < exX && Math.abs(z) < exZ) return false
      const c = screen(x, z), e = screen(x + r0 * 0.8, z)
      const rad = Math.abs(e.x - c.x)
      return c.x - rad >= sr.l && c.x + rad <= sr.r && c.y - rad >= sr.t && c.y + rad <= sr.b
    }
    const vw = m.view
    const put: { x: number; z: number }[] = []
    const order = m.pieces.slice().sort(() => Math.random() - 0.5)
    for (const p of order) {
      let at: { x: number; z: number } | null = null
      for (let sep = 1.4; sep >= 0.6 && !at; sep -= 0.1) {
        for (let t = 0; t < 140 && !at; t++) {
          const x = vw.minX + Math.random() * (vw.maxX - vw.minX), z = vw.minZ + Math.random() * (vw.maxZ - vw.minZ)
          if (ok(x, z) && put.every(q => Math.hypot(q.x - x, q.z - z) >= sep * m.s)) at = { x, z }
        }
      }
      at ??= { x: (Math.random() < 0.5 ? -1 : 1) * (exX + m.s * 0.2), z: (Math.random() - 0.5) * BH }
      put.push(at)
      p.goal.x = p.x = at.x
      p.goal.z = p.z = at.z
      p.yaw = p.yawGoal = (Math.random() - 0.5) * 0.5
      p.layer = ++m.layerTop
    }
    settle(m)
    m.pieces.forEach(p => { p.y = p.rest })
  }

  /** Les hauteurs de repos : une pièce lâchée sur une autre se pose dessus. */
  function settle(m: State) {
    const lay = m.pieces.filter(p => !p.placed && p.held === null && p.snap < 0).sort((a, b) => a.layer - b.layer)
    const tops: { x: number; z: number; top: number }[] = m.pieces.filter(p => p.placed || p.snap >= 0).map(p => ({ x: p.home.x, z: p.home.z, top: TRAY + m.th }))
    const near = m.s * 0.8
    const rimTop = TRAY + m.th + 0.015
    for (const p of lay) {
      const inTray = Math.abs(p.goal.x) < BW / 2 && Math.abs(p.goal.z) < BH / 2
      const onRim = !inTray && Math.abs(p.goal.x) < BW / 2 + RIM + m.s * 0.4 && Math.abs(p.goal.z) < BH / 2 + RIM + m.s * 0.4
      let rest = inTray ? TRAY : onRim ? rimTop : 0
      for (const q of tops) if (Math.hypot(q.x - p.goal.x, q.z - p.goal.z) < near) rest = Math.max(rest, q.top)
      p.rest = rest
      tops.push({ x: p.goal.x, z: p.goal.z, top: rest + m.th })
    }
  }

  function clearPieces(m: State) {
    m.held.clear()
    for (const p of m.pieces) {
      m.stage.scene.remove(p.mesh)
      p.mesh.geometry.dispose()
    }
    m.pieces = []
    m.placed = 0
    m.tex?.dispose(); m.tex = null
    m.ghostTex?.dispose(); m.ghostTex = null
    m.topMat.map = null
    m.topMat.emissiveMap = null
    ;(m.ghost.material as import('three').MeshStandardMaterial).map = null
    m.ghost.visible = false
    m.blobs.forEach(b => { b.visible = false })
  }

  function build(m: State, pic: Picture) {
    const { T } = m
    clearPieces(m)
    const { rows, cols } = gridFor(m.n)
    const cut = makeCut(rows, cols)
    m.cut = cut
    m.s = BW / cols
    m.th = m.s * 0.09
    m.tol = m.s * ctx.byTier(0.5, 0.42, 0.36)
    const tex = new T.Texture(pic.src)
    tex.colorSpace = T.SRGBColorSpace
    tex.anisotropy = 8
    tex.needsUpdate = true
    m.tex = tex
    m.topMat.map = tex
    m.topMat.emissiveMap = tex
    m.topMat.needsUpdate = true
    const gt = new T.CanvasTexture(ghostCanvas(pic, cut, ctx.tier === 'easy'))
    gt.colorSpace = T.SRGBColorSpace
    gt.anisotropy = 8
    m.ghostTex = gt
    const gm = m.ghost.material as import('three').MeshStandardMaterial
    gm.map = gt
    gm.needsUpdate = true
    m.ghost.visible = true
    // Le cadre suit l'épaisseur des pièces : il les dépasse à peine
    rim.forEach(b => { b.scale.y = m.th + 0.015; b.position.y = TRAY + (m.th + 0.015) / 2 })
    const segs = ctx.byTier(12, 10, 8)
    let i = 0
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const { geo, home } = pieceGeo(T, cut, r, c, m.s, m.th, segs)
      const mesh = new T.Mesh(geo, [m.topMat, m.sideMat])
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.userData.piece = i
      m.stage.scene.add(mesh)
      m.pieces.push({
        i, r, c, mesh, home, goal: { x: 0, z: 0 }, x: 0, z: 0, y: 0, rest: 0, yaw: 0, yawGoal: 0,
        layer: 0, held: null, placed: false, snap: -1, from: { x: 0, z: 0, y: 0, yaw: 0 }, pop: 0, tiltX: 0, tiltZ: 0
      })
      i++
    }
    fit(m)
    scatter(m)
    m.done = false
    m.fin = 0
    m.shine.visible = false
    m.ready = true
  }

  async function usePicture(pr: Promise<Picture | null>) {
    const m = me
    if (!m) { pendingPic = pr; return }
    const token = ++m.gen
    m.ready = false
    clearPieces(m)
    waitOff?.()
    const off = pictureWait(holder)
    waitOff = off
    const pic = await pictureOrNull(ctx, pr)
    off()
    if (dead || me !== m || token !== m.gen) return
    build(m, pic || fallbackPicture())
    // La boucle ne part qu'avec la première image : pendant le calcul de
    // l'image (un rendu 3D à part), la table vide ne lui vole pas la machine
    if (!started) { started = true; m.stage.start(dt => { if (me === m) update(m, dt) }) }
  }

  /* ---------- Le geste ---------- */
  function startSnap(p: Piece) {
    p.held = null
    p.snap = 0
    p.from = { x: p.x, z: p.z, y: p.y, yaw: p.yaw }
    p.goal.x = p.home.x; p.goal.z = p.home.z
  }

  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98]
  function landed(m: State, p: Piece) {
    p.snap = -1
    p.placed = true
    p.x = p.home.x; p.z = p.home.z; p.y = TRAY; p.yaw = 0; p.tiltX = p.tiltZ = 0
    p.pop = 1
    m.placed++
    const k = m.placed / m.n
    sfx('click', { vol: 0.75, rate: 0.95 + k * 0.25 })
    tone(NOTES[Math.min(NOTES.length - 1, Math.floor(k * (NOTES.length - 1)))], 0.16, 'triangle', 0.07, 0.03)
    m.fx.burst({ x: p.home.x, y: TRAY + m.th + 0.02, z: p.home.z }, {
      count: 16, color: ['#FFFFFF', '#FFE08A', '#FFC6DA', '#BDE7FF'], speed: 1.3 * Math.max(0.6, m.s), spread: 1,
      life: 0.6, size: 0.075 * Math.max(0.7, m.s), gravity: 3
    })
    m.shake.hit(0.1)
    settle(m)
    if (m.placed >= m.n) finale(m)
  }

  function finale(m: State) {
    m.done = true
    m.held.clear()
    m.fin = 0
    m.sparkT = 0
    m.shine.visible = true
    sfx('confirm', { vol: 0.8, rate: 1.05 })
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, k) => tone(f, 0.28, 'sine', 0.09, 0.35 + k * 0.12))
    ctx.finish({
      title: 'Puzzle terminé !',
      msg: `Tu as posé les ${m.n} pièces`,
      stars: 3,
      score: m.n,
      scoreIcon: ICON.piece,
      outroMs: 2800
    })
  }

  const planeHit = (m: State, e: { clientX: number; clientY: number }, y: number) => {
    const { T, camera, renderer } = m.stage
    const r = renderer.domElement.getBoundingClientRect()
    const ray = new T.Raycaster()
    ray.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
    const out = new T.Vector3()
    return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -y), out) ? out : null
  }
  const liftY = (m: State) => 0.42 + m.th * 2
  /** Le dessus de ce qui est sous (x, z) : table, plateau, cadre ou pièce posée. */
  const groundAt = (m: State, x: number, z: number) => {
    if (Math.abs(x) < BW / 2 && Math.abs(z) < BH / 2) {
      for (const q of m.pieces) if (q.placed && Math.abs(q.home.x - x) < m.s / 2 && Math.abs(q.home.z - z) < m.s / 2) return TRAY + m.th
      return TRAY
    }
    if (Math.abs(x) < BW / 2 + RIM && Math.abs(z) < BH / 2 + RIM) return TRAY + m.th + 0.015
    return 0
  }

  let pick: ReturnType<typeof picker> | null = null
  const onDown = (e: PointerEvent) => {
    const m = me
    if (!m || !m.ready || m.done || !pick || m.held.has(e.pointerId)) return
    const free = m.pieces.filter(p => !p.placed && p.held === null && p.snap < 0)
    const hits = pick(e, free.map(p => p.mesh), false)
    if (!hits.length) return
    const p = m.pieces[hits[0].object.userData.piece as number]
    const at = planeHit(m, e, liftY(m))
    if (!p || !at) return
    // On l'attrape là où le doigt l'a touchée : ce point reste sous le doigt
    const h = hits[0].point
    m.held.set(e.pointerId, { p, ox: p.x - h.x, oz: p.z - h.z })
    p.held = e.pointerId
    p.goal.x = at.x + (p.x - h.x); p.goal.z = at.z + (p.z - h.z)
    p.yawGoal = 0
    p.layer = ++m.layerTop
    settle(m)
    sfx('tick', { vol: 0.35, rate: 1.35, spread: 0.1 })
  }
  const onMove = (e: PointerEvent) => {
    const m = me
    const g = m?.held.get(e.pointerId)
    if (!m || !g) return
    const at = planeHit(m, e, liftY(m))
    if (!at) return
    const v = m.view, pad = m.s * 0.3
    g.p.goal.x = Math.min(v.maxX - pad, Math.max(v.minX + pad, at.x + g.ox))
    g.p.goal.z = Math.min(v.maxZ - pad, Math.max(v.minZ + pad, at.z + g.oz))
  }
  const onUp = (e: PointerEvent) => {
    const m = me
    const g = m?.held.get(e.pointerId)
    if (!m || !g) return
    m.held.delete(e.pointerId)
    const p = g.p
    p.held = null
    if (Math.hypot(p.goal.x - p.home.x, p.goal.z - p.home.z) < m.tol) {
      startSnap(p)
      return
    }
    p.layer = ++m.layerTop
    settle(m)
    sfx('drop', { vol: 0.3, rate: 1.3 })
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  cleanups.push(() => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  })

  /* ---------- La boucle ---------- */
  const ease = (x: number) => 1 - Math.pow(1 - x, 3)
  function update(m: State, dt: number) {
    m.t += dt
    const kHeld = 1 - Math.exp(-dt * 26), kFree = 1 - Math.exp(-dt * 13)
    let blob = 0
    for (const p of m.pieces) {
      if (p.snap >= 0) {
        p.snap = Math.min(1, p.snap + dt / 0.2)
        const k = ease(p.snap)
        p.x = p.from.x + (p.home.x - p.from.x) * k
        p.z = p.from.z + (p.home.z - p.from.z) * k
        p.y = p.from.y + (TRAY - p.from.y) * k
        p.yaw = p.from.yaw * (1 - k)
        p.tiltX *= 1 - k; p.tiltZ *= 1 - k
        if (p.snap >= 1) landed(m, p)
      } else if (!p.placed) {
        const held = p.held !== null
        const k = held ? kHeld : kFree
        p.x += (p.goal.x - p.x) * k
        p.z += (p.goal.z - p.z) * k
        p.y += ((held ? liftY(m) : p.rest) - p.y) * (held ? 1 - Math.exp(-dt * 16) : 1 - Math.exp(-dt * 14))
        p.yaw += (p.yawGoal - p.yaw) * (1 - Math.exp(-dt * 10))
        // En main, elle penche un peu dans le sens où on la tire
        const tx = held ? Math.max(-0.2, Math.min(0.2, (p.goal.z - p.z) * 0.9)) : 0
        const tz = held ? Math.max(-0.2, Math.min(0.2, -(p.goal.x - p.x) * 0.9)) : 0
        p.tiltX += (tx - p.tiltX) * (1 - Math.exp(-dt * 12))
        p.tiltZ += (tz - p.tiltZ) * (1 - Math.exp(-dt * 12))
        // Son ombre douce, sur ce qui est dessous, s'élargit quand on la soulève
        if (held && blob < m.blobs.length) {
          const b = m.blobs[blob++]
          const under = groundAt(m, p.x, p.z)
          const up = Math.max(0, p.y - under)
          b.visible = true
          b.position.set(p.x + up * 0.3, under + 0.004, p.z + up * 0.22)
          b.scale.setScalar(m.s * (1.3 + up * 1.2))
          ;(b.material as import('three').MeshBasicMaterial).opacity = Math.max(0.16, 0.5 - up * 0.4)
        }
      }
      if (p.pop > 0) p.pop = Math.max(0, p.pop - dt * 5)
      const sc = (p.held !== null ? 1.06 : 1) + Math.sin(p.pop * Math.PI) * 0.04
      p.mesh.position.set(p.x, p.y, p.z)
      p.mesh.rotation.set(p.tiltX, p.yaw, p.tiltZ)
      p.mesh.scale.set(sc, 1, sc)
    }
    for (let k = blob; k < m.blobs.length; k++) m.blobs[k].visible = false

    // La fin : un reflet passe sur l'image, des étincelles, la caméra s'approche
    const cam = m.stage.camera
    let d = m.view.d
    if (m.done) {
      m.fin += dt
      const u = m.shine.material as import('three').ShaderMaterial
      u.uniforms.uT.value = -0.35 + (m.fin % 1.5) / 1.1 * 1.7
      m.shine.position.y = TRAY + m.th + 0.004
      m.sparkT -= dt
      if (m.sparkT <= 0 && m.fin < 2.4) {
        m.sparkT = 0.09
        m.fx.burst({ x: (Math.random() - 0.5) * BW, y: TRAY + m.th + 0.05, z: (Math.random() - 0.5) * BH }, {
          count: 8, color: ['#FFFFFF', '#FFE9A8', '#FFD1E6'], speed: 0.9, spread: 1, life: 0.9, size: 0.07, gravity: 0.4
        })
      }
      d = m.view.d + (m.view.want - m.view.d) * ease(Math.min(1, m.fin / 1.6))
    }
    cam.position.set(0, Math.cos(TILT) * d, m.view.zc + Math.sin(TILT) * d)
    cam.lookAt(0, 0, m.view.zc)
    m.shake.apply(dt)
    m.fx.update(dt)
  }

  /* ---------- La scène ---------- */
  ;(async () => {
    const stage = await createStage(holder, {
      sky: '#2F2118', cam: [0, 9, 3.5], target: [0, 0, 0.1], fov: 32,
      hemi: ['#FFF3E2', '#6B4A30', 0.95],
      sun: { pos: [-3.4, 10, -2.6], color: '#FFF1DA', intensity: 2.0, area: 8, far: 26 },
      fill: 0.4, exposure: 1.0
    })
    if (dead) { stage.dispose(); return }
    const T = stage.T
    stage.sun?.shadow.mapSize.set(2048, 2048)
    // La table : du bois sombre, à perte de vue
    const table = new T.Mesh(new T.PlaneGeometry(60, 60), new T.MeshStandardMaterial({ map: stage.keep(woodTex(T, '#7E5231', 16)), roughness: 0.72 }))
    table.rotation.x = -Math.PI / 2
    table.receiveShadow = true
    stage.scene.add(table)
    // Le plateau : un fond, le fantôme de l'image, un cadre en bois clair
    const base = new T.Mesh(new T.BoxGeometry(BW + RIM * 2, TRAY, BH + RIM * 2), new T.MeshStandardMaterial({ color: 0x6A4A2E, roughness: 0.8 }))
    base.position.y = TRAY / 2
    base.receiveShadow = true
    base.castShadow = true
    stage.scene.add(base)
    const ghost = new T.Mesh(new T.PlaneGeometry(BW, BH), new T.MeshStandardMaterial({ roughness: 0.92, color: 0xE6DCCB }))
    ghost.rotation.x = -Math.PI / 2
    ghost.position.y = TRAY + 0.0008
    ghost.receiveShadow = true
    ghost.visible = false
    stage.scene.add(ghost)
    const rimMat = new T.MeshStandardMaterial({ map: stage.keep(woodTex(T, '#B9864E', 3)), roughness: 0.55 })
    const rimGeo = new T.BoxGeometry(1, 1, 1)
    rim = [
      [0, -(BH / 2 + RIM / 2), BW + RIM * 2, RIM], [0, BH / 2 + RIM / 2, BW + RIM * 2, RIM],
      [-(BW / 2 + RIM / 2), 0, RIM, BH], [BW / 2 + RIM / 2, 0, RIM, BH]
    ].map(([x, z, sx, sz]) => {
      const b = new T.Mesh(rimGeo, rimMat)
      b.scale.set(sx, 0.08, sz)
      b.position.set(x, TRAY + 0.04, z)
      b.castShadow = true
      b.receiveShadow = true
      stage.scene.add(b)
      return b
    })
    // Le reflet de la fin : une bande claire qui traverse l'image
    const shine = new T.Mesh(new T.PlaneGeometry(BW, BH), new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      uniforms: { uT: { value: -1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uT; varying vec2 vUv;
        void main(){
          float d = (vUv.x * 0.8 + (1.0 - vUv.y) * 0.45) / 1.25 - uT;
          float band = exp(-d * d * 220.0) * 0.4 + exp(-d * d * 24.0) * 0.07;
          gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * band, 1.0);
        }`
    }))
    shine.rotation.x = -Math.PI / 2
    shine.visible = false
    stage.scene.add(shine)
    // Les ombres douces des pièces qu'on tient
    const blobTex = stage.keep(dotTex(T, '#1E140C'))
    const blobGeo = new T.PlaneGeometry(1, 1)
    const blobs = [0, 1, 2, 3].map(() => {
      const b = new T.Mesh(blobGeo, new T.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.35, depthWrite: false }))
      b.rotation.x = -Math.PI / 2
      b.visible = false
      stage.scene.add(b)
      return b
    })
    const m: State = {
      stage, T, holder, fx: particles(stage, 500), shake: camShake(stage),
      gen: 0, ready: false, done: false, n: ctx.byTier(12, 24, 48), cut: null, s: 1, th: 0.09, tol: 0.5,
      pieces: [], placed: 0, layerTop: 0, held: new Map(),
      // L'image du dessus : surtout « imprimée » (émissive, hors tone mapping :
      // ses couleurs restent celles de l'image), un peu éclairée (les ombres
      // des pièces qu'on tient passent dessus, le soleil la fait vivre)
      topMat: new T.MeshStandardMaterial({ color: 0x5E5E5E, roughness: 0.78, metalness: 0, envMapIntensity: 0.3, emissive: 0xFFFFFF, emissiveIntensity: 0.72, toneMapped: false }),
      sideMat: new T.MeshStandardMaterial({ color: 0x9C8C72, roughness: 0.9 }),
      tex: null, ghost, ghostTex: null, shine, shineT: 0, blobs,
      view: { d: 9, want: 7, zc: 0.12, minX: -6, maxX: 6, minZ: -4, maxZ: 4 },
      fin: 0, sparkT: 0, t: 0
    }
    me = m
    pick = picker(stage)
    stage.renderer.domElement.addEventListener('pointerdown', onDown)
    cleanups.push(() => stage.renderer.domElement.removeEventListener('pointerdown', onDown))
    stage.onResize = () => { if (me === m) fit(m) }
    fit(m)
    hideLoader?.(); hideLoader = null

    if (bot) {
      const top = (x: number, z: number, y: number) => toScreen(stage, { x, y, z })
      ;(window as unknown as { __pz2: unknown }).__pz2 = {
        get ready() { return me === m && m.ready && !m.done },
        get n() { return m.n }, get placed() { return m.placed }, get done() { return m.done },
        get held() { return m.held.size },
        pieces: () => m.pieces.map(p => ({
          i: p.i, placed: p.placed, busy: p.held !== null || p.snap >= 0, y: +p.y.toFixed(3),
          at: top(p.x, p.z, p.y + m.th), home: top(p.home.x, p.home.z, TRAY + m.th)
        })),
        place: (i: number) => {
          const p = m.pieces[i]
          if (!m.ready || m.done || !p || p.placed || p.snap >= 0) return false
          for (const [id, g] of m.held) if (g.p === p) m.held.delete(id)
          startSnap(p)
          return true
        }
      }
      cleanups.push(() => { delete (window as { __pz2?: unknown }).__pz2 })
    }
    await usePicture(pendingPic)
  })().catch(err => {
    hideLoader?.(); hideLoader = null
    if (!dead) { console.error(err); ctx.toast('La 3D n\'est pas disponible ici') }
  })

  return {
    setPicture(p) {
      pendingPic = p
      if (me) void usePicture(p)
    },
    hand() {
      const m = me
      // Rien à montrer pendant qu'un doigt tient déjà une pièce
      if (!m || !m.ready || m.done || m.held.size) return null
      const free = m.pieces.filter(p => !p.placed && p.held === null && p.snap < 0)
      if (!free.length) return null
      const p = free[Math.floor(Math.random() * free.length)]
      return {
        drag: [
          toScreen(m.stage, { x: p.x, y: p.y + m.th, z: p.z }),
          toScreen(m.stage, { x: p.home.x, y: TRAY + m.th, z: p.home.z })
        ]
      }
    },
    busy() { return !!me && me.held.size > 0 },
    ready() { return !!me && me.ready },
    dispose() {
      if (dead) return
      dead = true
      hideLoader?.(); hideLoader = null
      waitOff?.(); waitOff = null
      cleanups.forEach(f => f())
      cleanups.length = 0
      const m = me
      me = null
      if (m) {
        m.pieces.forEach(p => p.mesh.geometry.dispose())
        m.ghostTex?.dispose()
        m.tex?.dispose()
        try { m.stage.dispose() } catch { /* déjà démonté */ }
      }
    }
  }
}
