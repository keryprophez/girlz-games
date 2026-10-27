import type { GameContext, GameDef } from '../core/types'
import { sfx, preloadSfx } from '../core/sfx'
import { getCtx } from '../core/audio'
import { playNote } from '../core/music'
import { createStage, loader, woodTex, type Stage, type T3 } from '../core/three3d'
import { particles, toScreen, type Particles } from '../core/scene3d'
import { pegboard, type Pegboard } from '../core/hama3d'
import { makeRounds, prims, same, sides, span, starsFor, type Pt, type Round, type Seg, type Xf } from '../core/geoplan'

/* 📐 LE GÉOPLAN (27/10, Apprendre) — reproduire une figure, comme avec le
   géoplan de l'école : la plaque à picots des Perles (`pegboard` de
   `core/hama3d.ts`) sur l'établi, et des élastiques de couleur. On pose le
   doigt sur un picot, on tire : l'élastique s'étire sous le doigt ; on
   lâche sur un autre picot, il s'y accroche avec un « boing » et vibre. Un
   toucher sur un élastique posé le retire (il saute). Ce n'est pas le
   Tangram refusé le 29/09 : rien à placer, tout est dans le geste — TENDRE.

   Le modèle est sur une petite plaque rose, à côté. Fleur : on reproduit
   sur le fantôme du modèle, au même endroit (carré, rectangle, triangle,
   maison, flèche). Éclair : n'importe où sur la plaque, des figures plus
   variées (losange, trapèze, parallélogramme, bateau, hexagone, étoile).
   Flamme : la figure agrandie ×2, tournée d'un quart ou en miroir — une
   petite image dit laquelle, sans un mot.

   Une figure finie : la voix dit son nom (« un losange » : du contenu, la
   règle 2 l'autorise ; jamais une consigne), puis ses élastiques vibrent
   comme une harpe, une note par côté, du haut vers le bas. Apprendre :
   aucune sanction ; les étoiles comptent les élastiques retirés. La
   comparaison (petits segments, à une translation près) et les manches
   sont dans `core/geoplan.ts`, testées. */

type Phase = 'load' | 'intro' | 'play' | 'win' | 'out' | 'done'

interface Band {
  a: Pt
  /** Le second picot, ou null tant que le doigt tire. */
  b: Pt | null
  /** Sous le doigt (repère de la plaque, pas d'un picot = 1). */
  end: { x: number; z: number }
  mesh: import('three').Mesh
  mat: import('three').MeshStandardMaterial
  /** La vibration : amplitude (décroît), temps. */
  vib: number
  t: number
  /** Retiré : il saute et s'efface (s). */
  gone: number
  board: Pegboard
}

interface State {
  root: HTMLElement
  running: boolean
  rounds: Round[]
  round: number
  rd: Round
  phase: Phase
  pt: number
  undone: number
  stage: Stage | null
  T: T3 | null
  fx: Particles | null
  ray: import('three').Raycaster | null
  board: Pegboard | null
  model: Pegboard | null
  bands: Band[]
  modelBands: Band[]
  ghost: import('three').Group | null
  /** L'élastique tiré, par doigt. */
  drag: { pid: number; band: Band; snap: Pt | null } | null
  /** La harpe : les côtés et le prochain à jouer. */
  harp: { sides: Seg[]; next: number } | null
  colorK: number
}

let me_: State | null = null
let ctx: GameContext

const PLATE = 10.5
const PX = -2.4
const MODEL = 4.6
const MX = PX + PLATE / 2 + 1.3 + MODEL / 2
const MZ = -PLATE / 2 + MODEL / 2 + 0.2
const TILT = 0.5
/** La hauteur de l'élastique sur le picot, et son épaisseur (pas de plaque = 1). */
const BAND_Y = 0.3
const TUBE = 0.068
const COLORS = [0xE8124F, 0xF29400, 0x149A3C, 0xF0500A, 0x7A30E0, 0x0098B0]
/** La harpe : une gamme pentatonique qui monte, une note par côté. */
const NOTES = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81]

const $ = (me: State, sel: string) => me.root.querySelector<HTMLElement>(sel)!

/* ---------- Les petites images de la flamme (sans un mot) ---------- */
const XF_ICON: Record<Xf, string> = {
  x2: `<svg viewBox="0 0 64 48" width="88" height="66" aria-hidden="true"><rect x="4" y="26" width="14" height="14" rx="2" fill="none" stroke="#3D9BF0" stroke-width="3.5"/>
    <path d="M22 33h8" stroke="#45362A" stroke-width="3.5" stroke-linecap="round"/><path d="M28 27l6 6-6 6z" fill="#45362A"/>
    <rect x="36" y="12" width="26" height="28" rx="3" fill="none" stroke="#FF4F86" stroke-width="3.5"/>
    <text x="49" y="31" text-anchor="middle" font-family="Baloo 2" font-weight="800" font-size="14" fill="#FF4F86">×2</text></svg>`,
  rot: `<svg viewBox="0 0 64 48" width="88" height="66" aria-hidden="true"><path d="M14 36V14h10z" fill="#3D9BF0"/>
    <path d="M30 10a16 16 0 0 1 20 10" fill="none" stroke="#45362A" stroke-width="3.5" stroke-linecap="round"/><path d="M45 21l7 1 1-8z" fill="#45362A"/>
    <path d="M38 30h22v10z" fill="#FF4F86"/></svg>`,
  mir: `<svg viewBox="0 0 64 48" width="88" height="66" aria-hidden="true"><path d="M28 8v34" stroke="#45362A" stroke-width="3" stroke-dasharray="4 4"/>
    <path d="M22 12v26H8z" fill="#3D9BF0"/><path d="M34 12v26h14z" fill="#FF4F86"/></svg>`
}

/* ---------- Un élastique ---------- */

/** La boucle d'un élastique autour de deux picots : deux brins et deux
    demi-tours, en tube. `vib` fait onduler les brins ; un bout sans picot
    (le doigt) se pince. */
function bandGeo(T: T3, top: number, a: { x: number; z: number }, b: { x: number; z: number }, vib: number, t: number, pinch: boolean) {
  const dx = b.x - a.x, dz = b.z - a.z
  const L = Math.hypot(dx, dz) || 0.0001
  const ux = dx / L, uz = dz / L, nx = -uz, nz = ux
  const ra = 0.17, rb = pinch ? 0.05 : 0.17
  const y = top + BAND_Y
  const pts: import('three').Vector3[] = []
  const wave = (s: number) => vib * Math.sin(s * Math.PI) * Math.cos(t * 38) * Math.min(1, L / 2)
  // Le demi-tour autour de b, de +n à −n en passant devant
  const arc = (cx: number, cz: number, r: number, from: number, k: number) => {
    for (let i = 0; i <= 7; i++) {
      const th = from + (i / 7) * Math.PI
      const cx2 = Math.cos(th), sz2 = Math.sin(th)
      pts.push(new T.Vector3(cx + (nx * cx2 + ux * sz2 * k) * r, y, cz + (nz * cx2 + uz * sz2 * k) * r))
    }
  }
  const strand = (side: number, fwd: boolean) => {
    for (let i = 1; i < 10; i++) {
      const s = fwd ? i / 10 : 1 - i / 10
      const w = wave(s)
      const r = (ra + (rb - ra) * s) * side
      pts.push(new T.Vector3(a.x + dx * s + nx * (r + w), y, a.z + dz * s + nz * (r + w)))
    }
  }
  strand(1, true)
  arc(b.x, b.z, rb, 0, 1)
  strand(-1, false)
  arc(a.x, a.z, ra, Math.PI, 1)
  const curve = new T.CatmullRomCurve3(pts, true, 'catmullrom', 0.3)
  return new T.TubeGeometry(curve, Math.min(120, 40 + Math.round(L * 10)), TUBE, 6, true)
}

/** Le centre d'un picot dans le repère de la plaque (pas = 1). */
const pegXZ = (bd: Pegboard, p: Pt) => ({ x: p[0] - (bd.cols - 1) / 2, z: p[1] - (bd.rows - 1) / 2 })

function makeBand(me: State, bd: Pegboard, a: Pt, color: number): Band {
  const T = me.T!
  const mat = new T.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, emissive: color, emissiveIntensity: 0.1 })
  const mesh = new T.Mesh(new T.BufferGeometry(), mat)
  mesh.castShadow = true
  bd.group.add(mesh)
  const band: Band = { a, b: null, end: pegXZ(bd, a), mesh, mat, vib: 0, t: 0, gone: 0, board: bd }
  return band
}

function shapeBand(me: State, band: Band) {
  const T = me.T!
  const a = pegXZ(band.board, band.a)
  const b = band.b ? pegXZ(band.board, band.b) : band.end
  band.mesh.geometry.dispose()
  band.mesh.geometry = bandGeo(T, band.board.top, a, b, band.vib, band.t, !band.b)
}

function dropBand(band: Band) {
  band.board.group.remove(band.mesh)
  band.mesh.geometry.dispose()
  band.mat.dispose()
}

const segOf = (b: Band): Seg => [b.a, b.b!]

/* ---------- Le cadrage ---------- */
function frame(me: State) {
  const st = me.stage!, T = me.T!, cam = st.camera
  const box = { x0: PX - PLATE / 2 - 0.2, x1: MX + MODEL / 2 + 0.3, z0: -PLATE / 2 - 0.2, z1: PLATE / 2 + 0.3 }
  const dir = new T.Vector3(0, Math.cos(TILT), Math.sin(TILT))
  const tg = new T.Vector3((box.x0 + box.x1) / 2, 0, (box.z0 + box.z1) / 2)
  let dist = 30
  const corners = [box.x0, box.x1].flatMap(x => [box.z0, box.z1].flatMap(z => [0, 0.8].map(y => new T.Vector3(x, y, z))))
  const v = new T.Vector3()
  const want = { w: 1.86, h: 1.66, cx: 0, cy: -0.06 }
  for (let k = 0; k < 24; k++) {
    cam.position.copy(tg).addScaledVector(dir, dist)
    cam.lookAt(tg)
    cam.updateMatrixWorld()
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9
    for (const c of corners) {
      v.copy(c).project(cam)
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y)
    }
    const s = Math.max((x1 - x0) / want.w, (y1 - y0) / want.h)
    dist *= 0.35 + 0.65 * s
    const half = Math.tan(cam.fov * Math.PI / 360) * dist
    tg.x += ((x0 + x1) / 2 - want.cx) * half * cam.aspect * 0.8
    tg.z -= ((y0 + y1) / 2 - want.cy) * half / Math.cos(TILT) * 0.8
  }
  cam.position.copy(tg).addScaledVector(dir, dist)
  cam.lookAt(tg)
  cam.updateMatrixWorld()
  placeXf(me)
}

/** La petite image de la transformation (la flamme), sous la plaque du modèle. */
function placeXf(me: State) {
  const el = $(me, '.gp-xf')
  if (!me.rd.xf || !me.stage || !me.model) { el.hidden = true; return }
  el.hidden = false
  el.innerHTML = XF_ICON[me.rd.xf]
  const a = $(me, '.gp-arena').getBoundingClientRect()
  const p = toScreen(me.stage, { x: MX, y: 0, z: MZ + MODEL / 2 + 0.2 })
  el.style.left = (p.x - a.left) + 'px'
  el.style.top = (p.y - a.top + 6) + 'px'
}

function paintDots(me: State) {
  $(me, '.gp-dots').innerHTML = me.rounds.map((_, i) =>
    `<i class="sn-dot${i < me.round ? ' on' : ''}${i === me.round ? ' cur' : ''}"></i>`).join('')
}

/* ---------- Une manche ---------- */
function startRound(me: State) {
  const T = me.T!, st = me.stage!
  me.rd = me.rounds[me.round]
  const rd = me.rd
  me.bands.forEach(dropBand)
  me.bands = []
  me.modelBands.forEach(dropBand)
  me.modelBands = []
  me.harp = null
  // La grande plaque, à la taille du niveau
  if (!me.board || me.board.cols !== rd.n) {
    me.board?.dispose()
    const b = pegboard(T, { cols: rd.n, rows: rd.n, plate: 0x2F7FC8, opacity: 0.96 })
    b.group.scale.setScalar(PLATE / (rd.n + 0.9))
    b.group.position.set(PX, 0, 0)
    st.scene.add(b.group)
    me.board = b
  }
  // La petite plaque du modèle : la figure au milieu, un picot de marge
  const [w, h] = span(rd.model)
  const mn = Math.max(w, h) + 3
  me.model?.dispose()
  const m = pegboard(T, { cols: mn, rows: mn, plate: 0xE2588E, opacity: 0.96 })
  m.group.scale.setScalar(MODEL / (mn + 0.9))
  m.group.position.set(MX, 0, MZ)
  st.scene.add(m.group)
  me.model = m
  const ox = Math.floor((mn - w) / 2), oz = Math.floor((mn - h) / 2)
  rd.model.forEach(([p, q], i) => {
    const band = makeBand(me, m, [p[0] + ox, p[1] + oz], COLORS[(i + me.round) % COLORS.length])
    band.b = [q[0] + ox, q[1] + oz]
    shapeBand(me, band)
    me.modelBands.push(band)
  })
  // La fleur : le fantôme de la figure, à reproduire au même endroit
  if (me.ghost) { me.ghost.parent?.remove(me.ghost); me.ghost.traverse(o => { const x = o as import('three').Mesh; if (x.isMesh) x.geometry.dispose() }) }
  me.ghost = null
  if (!rd.anywhere) {
    const g = new T.Group()
    const mat = st.keep(new T.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.85, depthWrite: false }))
    for (const [p, q] of rd.want) {
      const a = pegXZ(me.board!, p), b = pegXZ(me.board!, q)
      const L = Math.hypot(b.x - a.x, b.z - a.z)
      const strip = new T.Mesh(new T.BoxGeometry(L + 0.2, 0.02, 0.2), mat)
      strip.position.set((a.x + b.x) / 2, me.board!.top + 0.012, (a.z + b.z) / 2)
      strip.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x)
      // Après la plaque (translucide, donc dessinée avec les transparents)
      strip.renderOrder = 5
      g.add(strip)
    }
    me.board!.group.add(g)
    me.ghost = g
  }
  frame(me)
  paintDots(me)
  me.phase = 'intro'
  me.pt = 0
  st.settle()
}

function check(me: State) {
  const made = me.bands.filter(b => b.b && !b.gone).map(segOf)
  if (!same(made, me.rd.want, me.rd.anywhere)) return
  win(me, made)
}

function win(me: State, made: Seg[]) {
  me.phase = 'win'
  me.pt = 0
  ctx.say(me.rd.shape.name)
  me.harp = { sides: sides(made), next: 0 }
  me.round++
  paintDots(me)
}

/** Toucher le côté k de la harpe : les élastiques qui le couvrent vibrent, une note. */
function strum(me: State, k: number) {
  const side = me.harp!.sides[k]
  const sp = prims([side])
  for (const b of me.bands) {
    if (!b.b || b.gone) continue
    if ([...prims([segOf(b)])].some(x => sp.has(x))) { b.vib = 0.22; b.t = 0 }
  }
  const ac = getCtx()
  if (ac) playNote('harp', NOTES[k % NOTES.length], ac.currentTime, 0.8, 0.32)
}

function finish(me: State) {
  ctx.finish({
    title: 'Quelles belles figures !',
    msg: `Tu as tendu ${me.rounds.length} figures sur le géoplan`,
    stars: starsFor(me.undone),
    outroMs: 1800
  })
}

/* ---------- La boucle ---------- */
function step(me: State, dt: number) {
  me.pt += dt
  me.fx?.update(dt)
  for (const b of [...me.bands, ...me.modelBands]) {
    if (b.gone) {
      b.gone += dt
      const k = b.gone / 0.32
      b.mesh.position.y = Math.sin(Math.min(1, k) * Math.PI) * 1.2
      b.mesh.scale.setScalar(Math.max(0.01, 1 - k))
      if (k >= 1) { dropBand(b); me.bands = me.bands.filter(x => x !== b) }
      continue
    }
    if (b.vib > 0.002 || me.drag?.band === b) {
      b.t += dt
      b.vib *= Math.pow(0.02, dt)
      if (b.vib < 0.002) b.vib = 0
      shapeBand(me, b)
    }
  }
  if (me.phase === 'intro' && me.pt > 0.5) me.phase = 'play'
  if (me.phase === 'win' && me.harp) {
    // La harpe : un côté toutes les 0,3 s, après le nom
    const h = me.harp
    while (h.next < h.sides.length && me.pt > 0.9 + h.next * 0.3) strum(me, h.next++)
    const end = 0.9 + h.sides.length * 0.3 + 0.4
    if (me.pt > end && me.pt - dt <= end) {
      sfx('confirm', { vol: 0.7 })
      const T = me.T!, bd = me.board!
      const c = bd.group.localToWorld(new T.Vector3(0, bd.top + 1, 0))
      me.fx?.burst({ x: c.x, y: c.y, z: c.z }, { count: 60, color: [0xFF4F86, 0xFFB627, 0x41C26A, 0x3D9BF0, 0xFFFFFF], speed: 9, spread: 0.6, life: 1.6, size: 1.3, gravity: 10 })
    }
    if (me.round >= me.rounds.length) {
      if (me.pt > end + 0.3) { me.phase = 'done'; finish(me) }
    } else if (me.pt > end + 1.4) {
      me.phase = 'out'
      me.pt = 0
      for (const b of me.bands) if (!b.gone) b.gone = 0.0001
      sfx('whoosh', { vol: 0.35 })
    }
  }
  if (me.phase === 'out' && me.pt > 0.45) startRound(me)
}

/* ---------- Le doigt ---------- */
/** Le point de la plaque sous le doigt (repère de la plaque, à hauteur d'élastique). */
function under(me: State, e: { clientX: number; clientY: number }) {
  const st = me.stage, bd = me.board
  if (!st || !bd || !me.ray) return null
  const r = st.renderer.domElement.getBoundingClientRect()
  const v = new me.T!.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  me.ray.setFromCamera(v, st.camera)
  bd.group.updateWorldMatrix(true, false)
  const inv = new me.T!.Matrix4().copy(bd.group.matrixWorld).invert()
  const ray = me.ray.ray.clone().applyMatrix4(inv)
  const y = bd.top + BAND_Y
  if (Math.abs(ray.direction.y) < 1e-6) return null
  const t = (y - ray.origin.y) / ray.direction.y
  if (t < 0) return null
  return { x: ray.origin.x + ray.direction.x * t, z: ray.origin.z + ray.direction.z * t }
}

/** Le picot le plus proche d'un point, s'il est assez près. */
function pegNear(me: State, p: { x: number; z: number }, r = 0.42): Pt | null {
  const bd = me.board!
  const c = Math.round(p.x + (bd.cols - 1) / 2), q = Math.round(p.z + (bd.rows - 1) / 2)
  if (c < 0 || q < 0 || c >= bd.cols || q >= bd.rows) return null
  const o = pegXZ(bd, [c, q])
  return Math.hypot(o.x - p.x, o.z - p.z) <= r ? [c, q] : null
}

/** L'élastique posé sous un point (distance au segment). */
function bandNear(me: State, p: { x: number; z: number }): Band | null {
  let best: Band | null = null, bd = 0.3
  for (const b of me.bands) {
    if (!b.b || b.gone) continue
    const a = pegXZ(b.board, b.a), c = pegXZ(b.board, b.b)
    const dx = c.x - a.x, dz = c.z - a.z
    const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)))
    const d = Math.hypot(a.x + dx * k - p.x, a.z + dz * k - p.z)
    if (d < bd) { bd = d; best = b }
  }
  return best
}

function removeBand(me: State, b: Band) {
  b.gone = 0.0001
  me.undone++
  sfx('pluck', { vol: 0.45, rate: 1.9 })
  check(me)
}

export const geoplan: GameDef = {
  id: 'geoplan', name: 'Le Géoplan', icon: '📐', sq: 'sq-lilac', cat: 'reflexion',
  subtitle: 'Tends les élastiques pour refaire la figure',
  // La main : tirer un élastique d'un picot à un autre — jamais un côté de la figure
  hand: () => {
    const me = me_
    if (!me || me.phase !== 'play' || me.drag || !me.stage || !me.board) return null
    const want = prims(me.rd.want)
    const n = me.rd.n
    for (let k = 0; k < 40; k++) {
      const a: Pt = [1 + Math.floor(Math.random() * (n - 2)), 1 + Math.floor(Math.random() * (n - 2))]
      const b: Pt = Math.random() < 0.5 ? [a[0] + 1, a[1]] : [a[0], a[1] + 1]
      if (b[0] >= n || b[1] >= n || [...prims([[a, b]])].some(x => want.has(x))) continue
      const at = (p: Pt) => toScreen(me.stage!, me.board!.world(p[0], p[1], BAND_Y))
      return { drag: [at(a), at(b)] }
    }
    return null
  },
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="arena gp-arena">
        <div class="gp-scene"></div>
        <div class="mem-dots gp-dots"></div>
        <div class="gp-xf" hidden></div>
      </div>`
    preloadSfx(['pluck', 'tick', 'confirm', 'whoosh'])
    const rounds = makeRounds(c.tier)
    const me: State = {
      root: c.root, running: true, rounds, round: 0, rd: rounds[0], phase: 'load', pt: 0, undone: 0,
      stage: null, T: null, fx: null, ray: null, board: null, model: null, bands: [], modelBands: [], ghost: null,
      drag: null, harp: null, colorK: 0
    }
    me_ = me
    paintDots(me)
    const holder = c.root.querySelector<HTMLElement>('.gp-scene')!
    const hideLoader = loader(holder, 'geoplan')

    const onDown = (e: PointerEvent) => {
      if (me.phase !== 'play' || me.drag) return
      const p = under(me, e)
      if (!p) return
      const peg = pegNear(me, p, 0.36)
      if (peg) {
        e.preventDefault()
        const band = makeBand(me, me.board!, peg, COLORS[me.colorK++ % COLORS.length])
        band.end = p
        shapeBand(me, band)
        me.bands.push(band)
        me.drag = { pid: e.pointerId, band, snap: null }
        sfx('tick', { vol: 0.3, rate: 1.4 })
        return
      }
      const b = bandNear(me, p)
      if (b) removeBand(me, b)
    }
    const onMove = (e: PointerEvent) => {
      const d = me.drag
      if (!d || d.pid !== e.pointerId) return
      const p = under(me, e)
      if (!p) return
      // Près d'un autre picot, l'élastique s'y aimante (un petit clic)
      const peg = pegNear(me, p)
      const snap = peg && (peg[0] !== d.band.a[0] || peg[1] !== d.band.a[1]) ? peg : null
      if (snap && (!d.snap || d.snap[0] !== snap[0] || d.snap[1] !== snap[1])) sfx('tick', { vol: 0.25, rate: 1.8 })
      d.snap = snap
      d.band.end = snap ? pegXZ(me.board!, snap) : p
    }
    const onUp = (e: PointerEvent) => {
      const d = me.drag
      if (!d || d.pid !== e.pointerId) return
      me.drag = null
      const band = d.band
      const p = under(me, e)
      const peg = d.snap ?? (p ? pegNear(me, p) : null)
      if (!peg || (peg[0] === band.a[0] && peg[1] === band.a[1])) {
        // Lâché dans le vide : il revient claquer sur son picot et s'en va
        dropBand(band)
        me.bands = me.bands.filter(x => x !== band)
        if (p && Math.hypot(p.x - pegXZ(me.board!, band.a).x, p.z - pegXZ(me.board!, band.a).z) > 0.5) sfx('pluck', { vol: 0.3, rate: 2.2 })
        return
      }
      // Le même élastique deux fois : le second ne s'accroche pas
      const k = [...prims([[band.a, peg]])].sort().join()
      if (me.bands.some(b => b !== band && b.b && !b.gone && [...prims([segOf(b)])].sort().join() === k)) {
        dropBand(band)
        me.bands = me.bands.filter(x => x !== band)
        sfx('pluck', { vol: 0.3, rate: 2.2 })
        return
      }
      band.b = peg
      band.vib = 0.24
      band.t = 0
      shapeBand(me, band)
      // Boing : plus il est long, plus il est grave
      const L = Math.hypot(peg[0] - band.a[0], peg[1] - band.a[1])
      sfx('pluck', { vol: 0.6, rate: Math.max(0.55, 1.5 / Math.sqrt(L)), spread: 0 })
      check(me)
    }
    holder.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    ;(async () => {
      const stage = await createStage(holder, {
        sky: '#E6D5BE', fov: 26, cam: [0, 30, 16], target: [0, 0, 0],
        hemi: ['#FFF3E2', '#8A6A4A', 0.72],
        sun: { pos: [-7, 18, 8], color: '#FFF1DC', intensity: 2.4, area: 12, far: 50 },
        fill: 0.3, exposure: 0.96, iblIntensity: 0.75
      })
      if (!me.running) { stage.dispose(); return }
      me.stage = stage
      const T = me.T = stage.T
      me.ray = new T.Raycaster()
      me.fx = particles(stage, 400)
      // L'établi des Perles : un grand plateau de bois clair
      const wood = woodTex(T, '#CFA271', 5)
      const table = new T.Mesh(new T.PlaneGeometry(90, 60), new T.MeshStandardMaterial({ map: wood, roughness: 0.62 }))
      table.rotation.x = -Math.PI / 2
      table.receiveShadow = true
      stage.scene.add(table)
      stage.keep({
        dispose: () => {
          me.bands.forEach(dropBand)
          me.modelBands.forEach(dropBand)
          me.board?.dispose()
          me.model?.dispose()
        }
      })
      stage.onResize = () => frame(me)
      hideLoader()
      startRound(me)
      stage.start(dt => { if (me_ === me && me.running) step(me, dt) })
      // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __gp: unknown }).__gp = {
          get round() { return me.round },
          get phase() { return me.phase },
          get want() { return me.rd.want },
          get shape() { return me.rd.shape.id },
          get anywhere() { return me.rd.anywhere },
          get xf() { return me.rd.xf },
          get n() { return me.rd.n },
          get undone() { return me.undone },
          get bands() { return me.bands.filter(b => b.b && !b.gone).map(segOf) },
          /** Un picot, à l'écran. */
          at: (cc: number, r: number) => toScreen(stage, me.board!.world(cc, r, BAND_Y)),
          /** Le milieu d'un élastique posé, à l'écran (pour le retirer). */
          mid(i: number) {
            const b = me.bands.filter(x => x.b && !x.gone)[i]
            const p = me.board!.world((b.a[0] + b.b![0]) / 2, (b.a[1] + b.b![1]) / 2, BAND_Y)
            return toScreen(stage, p)
          }
        }
      }
    })().catch(err => { hideLoader(); console.error(err); if (me.running) throw err })

    return () => {
      if (!me.running) return
      me.running = false
      holder.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      me.stage?.dispose()
      if (me_ === me) me_ = null
      const w = window as unknown as { __gp?: unknown }
      if (w.__gp) delete w.__gp
    }
  }
}
