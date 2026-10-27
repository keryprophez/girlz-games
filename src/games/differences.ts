import type { GameContext, GameDef } from '../core/types'
import { $ } from '../core/utils'
import { arcade, type Arcade } from '../core/arcade'
import { ICON } from '../core/icons'
import { sfx, preloadSfx, cry, preloadCries, CRY, type AnimalVoice } from '../core/sfx'
import { setMusicIntensity } from '../core/music'
import { confetti } from '../core/fx'
import { createStage, loader, type Stage, type T3 } from '../core/three3d'
import { particles, toScreen, type Particles } from '../core/scene3d'
import { critterKit, type CritterKit, type CritterKind } from '../core/critters'
import { buildFarm, bake, type Farm, type FarmSpot } from '../core/farm3d'
import { planks } from '../core/barn3d'
import { plan, PLACES, type Diff } from '../core/differences'

/* 🔍 LE JEU DES DIFFÉRENCES (27/10, choisi par le père) — deux petites
   fermes côte à côte (la petite ferme de Cache-Cache, `buildFarm`), qui
   tournent ENSEMBLE au doigt.

   - Les différences sont tirées au hasard à chaque manche (core/differences.ts,
     pur et testé) : un animal en plus ou en moins, un animal changé ou
     tourné, la grange ou le tracteur d'une autre couleur, une citrouille, un
     buisson ou la charrette qui manque, une pomme dans l'arbre, la meule
     déplacée, les tonneaux, la niche ou le puits tournés, une botte de plus,
     une poule sur le toit, un canard sur la mare ; à la flamme, d'autres
     cachées DERRIÈRE la grange, la meule ou le poulailler : il faut tourner.
     Fleur : 5 franches ; éclair : 7 dont 4 fines ; flamme : 9 dont 2 cachées.
   - Toucher une différence, sur l'une ou l'autre ferme : un cercle doré
     sur les deux, un son. Tout près : elle tremble (le « presque »), sans
     rien coûter. Dans le vide : un cœur (contre le mitraillage) — toucher
     le ciel ne coûte rien. Trois manches ; une manche sans faute fait
     monter la rampe (une franche devient fine).
   - L'outro : les deux fermes glissent l'une vers l'autre et n'en font
     plus qu'une, qui fait la fête.
   - LE RISQUE : la ferme est rendue deux fois. La seconde est un CLONE de
     la première (`clone()` : mêmes géométries, mêmes matériaux, rien de
     plus en mémoire), ses constructions sont déjà fondues (`bake`), et les
     animaux aussi (un mesh par matériau). Le nombre d'appels de dessin est
     dans l'accroche des bots (`calls`) ; à mesurer sur la tablette (`?fps`). */

type Obj = import('three').Object3D
type Group = import('three').Group
type V3 = import('three').Vector3
type Mat = import('three').MeshStandardMaterial

const ROUNDS = 3
const GAP = 8.35
const OUTRO_MS = 3200
const SIZE: Partial<Record<CritterKind, number>> = { chick: 0.48, cat: 0.6, rabbit: 0.58, hen: 0.6, duck: 0.62, rooster: 0.62, dog: 0.72, pig: 0.74, sheep: 0.78, goat: 0.74, cow: 0.95, horse: 0.92 }

/** Une différence posée dans la scène : ce qu'on touche dans chaque ferme, où elle est. */
interface Live {
  d: Diff
  /** Ce qui la porte dans la ferme de gauche (A) et dans la seconde (B). */
  a: Obj[]
  b: Obj[]
  /** Son centre (repère du plateau) et le rayon d'un toucher qui la trouve. */
  at: V3
  r: number
  found: boolean
  shake: number
  marks: import('three').Sprite[]
  /** L'animal qui parle quand on la trouve. */
  voice?: CritterKind
}

interface State {
  stage: Stage
  T: T3
  U: typeof import('three/examples/jsm/utils/BufferGeometryUtils.js')
  farm: Farm
  kit: CritterKit
  /** Le modèle (la ferme de buildFarm, cachée, jamais touchée) et ses deux copies de la manche :
      A, l'originale, et B, celle qui porte les différences. `bSide` : B est à droite (1) ou à gauche (−1). */
  tpl: Group
  A: Group
  B: Group
  bSide: number
  game: Arcade
  tier: 0 | 1 | 2
  round: number
  level: number
  hurtThisRound: boolean
  lives: Live[]
  /** Ce qui n'existe que pour cette manche (animaux, ajouts, matériaux repeints). */
  extra: Obj[]
  trash: { dispose(): void }[]
  markMat: import('three').SpriteMaterial
  fx: Particles
  rot: number
  vRot: number
  drag: boolean
  phase: 'look' | 'between' | 'outro'
  t: number
  outroT: number
  pips: HTMLElement
  rounds: HTMLElement
  ray: import('three').Raycaster
  near: number
  void: number
  /** Le rendu à la demande : on redessine tant que quelque chose bouge (jusqu'à `busy`), sinon
      neuf fois par seconde (les nuages, l'eau) ; `draw` force l'image suivante. */
  busy: number
  draw: boolean
  res: {
    pumpkinGeo: import('three').BufferGeometry; pumpkinMat: Mat; stemGeo: import('three').BufferGeometry; stemMat: Mat
    appleGeo: import('three').BufferGeometry; appleMat: Mat
  }
}

let df: State | null = null
let ctx: GameContext
let handTurn = 0

/** La construction de la ferme (repère A) dont les places portent ce nom (`grange`, `meule`…), la n-ième. */
function spot(farm: Farm, prefix: string, nth = 0): FarmSpot {
  const all = farm.spots.filter(s => s.slots[0]?.id.split('-')[0] === prefix)
  return all[Math.min(nth, all.length - 1)]
}
/** Le même objet dans le clone : on suit le même chemin d'enfants depuis la racine. */
function twin(A: Obj, B: Obj, o: Obj): Obj {
  const path: number[] = []
  for (let x: Obj | null = o; x && x !== A; x = x.parent) path.unshift(x.parent!.children.indexOf(x))
  let y: Obj = B
  for (const i of path) y = y.children[i]
  return y
}

/** Un animal, fondu (un mesh par matériau), posé sur le plateau. */
function animal(me: State, kind: CritterKind): Group {
  const c = me.kit.make(kind, SIZE[kind] ?? 0.7)
  // Fondu, il ne coûte plus qu'un appel de dessin par matériau ; ses géométries fondues sont à lui
  for (const m of bake(me.T, me.U, c.obj)) { m.castShadow = true; me.trash.push(m.geometry) }
  return c.obj
}

function pumpkin(me: State): Group {
  const { T } = me
  const g = new T.Group()
  const body = new T.Mesh(me.res.pumpkinGeo, me.res.pumpkinMat)
  body.scale.set(1, 0.72, 1)
  body.position.y = 0.21
  const stem = new T.Mesh(me.res.stemGeo, me.res.stemMat)
  stem.position.y = 0.43
  stem.rotation.z = 0.25
  body.castShadow = stem.castShadow = true
  g.add(body, stem)
  return g
}

/* ---------- Une manche : les animaux de la cour, puis les différences sur la copie ---------- */
function newRound(me: State) {
  const { T } = me
  // On repart de deux copies neuves du modèle (mêmes géométries, mêmes matériaux)
  me.extra = []
  for (const x of me.trash) x.dispose()
  me.trash = []
  me.stage.scene.remove(me.A, me.B)
  me.A = me.tpl.clone()
  me.B = me.tpl.clone()
  me.A.visible = me.B.visible = true
  me.stage.scene.add(me.A, me.B)
  me.bSide = Math.random() < 0.5 ? 1 : -1
  layout(me)
  const p = plan(me.tier, me.level)
  me.hurtThisRound = false
  const addA = (o: Obj, parent: Obj = me.A) => { parent.add(o); me.extra.push(o); return o }
  const addB = (o: Obj, parent: Obj = me.B) => { parent.add(o); me.extra.push(o); return o }
  const put = (o: Obj, [x, z]: [number, number], rot: number) => { o.position.set(x, 0, z); o.rotation.y = rot; return o }
  // Les animaux de la cour, dans les deux fermes (sauf ceux qu'une différence enlève ou change)
  const animalsA: Obj[] = [], animalsB: (Obj | null)[] = []
  const skipB = new Set(p.diffs.filter(d => d.kind === 'animal-moins' || d.kind === 'animal-change').map(d => d.animal))
  p.animals.forEach((a, i) => {
    const oa = put(animal(me, a.kind), PLACES[a.place], a.rot)
    addA(oa)
    animalsA.push(oa)
    if (skipB.has(i)) { animalsB.push(null); return }
    const ob = oa.clone()
    addB(ob)
    animalsB.push(ob)
  })
  const S = (prefix: string, nth = 0) => twin(me.tpl, me.A, spot(me.farm, prefix, nth).g)
  const SB = (prefix: string, nth = 0) => twin(me.tpl, me.B, spot(me.farm, prefix, nth).g)
  /** Une construction repeinte dans la copie : chaque mesh du matériau `names` reçoit `mat`. */
  const repaint = (g: Obj, names: string[], mk: (old: Mat) => Mat) => {
    const made = new Map<Mat, Mat>()
    g.traverse(o => {
      const m = o as import('three').Mesh
      const old = m.material as Mat | undefined
      if (!m.isMesh || !old || Array.isArray(old) || !names.includes(old.name)) return
      let nm = made.get(old)
      if (!nm) { nm = mk(old); made.set(old, nm); me.trash.push(nm); if (nm.map && nm.map !== old.map) me.trash.push(nm.map) }
      m.material = nm
    })
  }
  /** Derrière une construction du fond (repère du plateau) : plus loin du centre, et `side` de côté. */
  const behind = (g: Obj, d: number, side = 0): [number, number] => {
    const l = Math.hypot(g.position.x, g.position.z), ux = g.position.x / l, uz = g.position.z / l
    return [g.position.x + ux * d + uz * side, g.position.z + uz * d - ux * side]
  }
  me.lives = p.diffs.map(d => {
    const a: Obj[] = [], b: Obj[] = []
    let main: Obj | null = null
    let voice: CritterKind | undefined = d.to ?? (d.animal !== undefined ? p.animals[d.animal].kind : undefined)
    switch (d.kind) {
      case 'animal-plus': {
        const o = addB(put(animal(me, d.to!), PLACES[d.place!], d.param * 6.28))
        b.push(o); main = o
        break
      }
      case 'animal-moins': {
        a.push(animalsA[d.animal!]); main = animalsA[d.animal!]
        break
      }
      case 'animal-change': {
        const src = p.animals[d.animal!]
        const o = addB(put(animal(me, d.to!), PLACES[src.place], src.rot))
        a.push(animalsA[d.animal!]); b.push(o); main = o
        break
      }
      case 'animal-tourne': {
        const o = animalsB[d.animal!]!
        o.rotation.y += Math.PI * (0.5 + d.param * 0.5)
        a.push(animalsA[d.animal!]); b.push(o); main = o
        break
      }
      case 'grange': {
        const cols = [['#2A4A78', '#0E1C34'], ['#2C6438', '#0E2C16'], ['#8A6A18', '#3A2A08'], ['#6A3A7A', '#2A1034']]
        const [c0, c1] = cols[Math.floor(d.param * cols.length)]
        const tex = planks(T, c0, c1, 14)
        const gB = SB('grange')
        repaint(gB, ['redWall', 'redSide', 'redDoor'], old => {
          const t = tex.clone(); t.repeat.copy(old.map!.repeat); t.wrapS = old.map!.wrapS; t.wrapT = old.map!.wrapT; t.needsUpdate = true
          me.trash.push(t)
          return new T.MeshStandardMaterial({ map: t, roughness: old.roughness })
        })
        me.trash.push(tex)
        a.push(S('grange')); b.push(gB); main = gB
        break
      }
      case 'tracteur': {
        const gB = SB('godet')
        const col = d.param < 0.5 ? 0x1E4A8A : 0x2E7A2E
        repaint(gB, ['paint'], old => new T.MeshStandardMaterial({ color: col, roughness: old.roughness, metalness: old.metalness }))
        a.push(S('godet')); b.push(gB); main = gB
        break
      }
      case 'citrouille': {
        const v = S('terrier').position
        const o = addB(put(pumpkin(me), [v.x * 0.72, v.z * 0.72], d.param * 6))
        b.push(o); main = o
        break
      }
      case 'buisson': {
        const gB = SB('buisson', 1)
        gB.visible = false
        a.push(S('buisson', 1)); main = S('buisson', 1)
        break
      }
      case 'charrette': {
        SB('charrette').visible = false
        a.push(S('charrette')); main = S('charrette')
        break
      }
      case 'bois': {
        SB('bois').visible = false
        a.push(S('bois')); main = S('bois')
        break
      }
      case 'pomme': {
        const tree = SB('pommier')
        const ap = addB(new T.Mesh(me.res.appleGeo, me.res.appleMat), tree)
        ap.position.set(d.param < 0.5 ? 0.55 : -0.5, 1.9, 0.78)
        ap.castShadow = true
        a.push(S('pommier')); b.push(tree); main = ap
        break
      }
      case 'meule': {
        const gB = SB('meule')
        const side = d.param < 0.5 ? -1 : 1
        gB.position.x += Math.cos(gB.rotation.y) * 1.0 * side
        gB.position.z -= Math.sin(gB.rotation.y) * 1.0 * side
        a.push(S('meule')); b.push(gB); main = gB
        break
      }
      case 'tonneaux': case 'niche': case 'puits': {
        const pre = d.kind === 'tonneaux' ? 'tonneau' : d.kind
        const gB = SB(pre)
        gB.rotation.y += (d.param < 0.5 ? 1 : -1) * (d.kind === 'niche' ? 1.1 : Math.PI / 2)
        a.push(S(pre)); b.push(gB); main = gB
        break
      }
      case 'botte': {
        const gB = SB('bottes')
        const bl = addB(me.farm.bale(), gB)
        bl.position.set(-0.05, 0.69, 0.4)
        bl.rotation.y = 0.2 + d.param * 0.4
        a.push(S('bottes')); b.push(bl); main = bl
        break
      }
      case 'poule-toit': {
        const gB = SB('grange')
        const hen = addB(animal(me, 'hen'), gB)
        voice = 'hen'
        hen.position.set(d.param < 0.5 ? -0.5 : 0.5, 3.12, 0)
        hen.rotation.y = Math.PI / 2
        b.push(hen); main = hen
        break
      }
      case 'canard-mare': {
        const gB = SB('mare')
        const duck = addB(animal(me, 'duck'), gB)
        voice = 'duck'
        duck.position.set(-0.25, -0.04, -0.32)
        duck.rotation.y = d.param * 6
        a.push(S('mare')); b.push(duck); main = duck
        break
      }
      case 'cache-grange': case 'cache-bois': case 'cache-bottes': {
        // Collé derrière : vu d'en haut et de face, la construction le cache ; il faut tourner
        const pre = d.kind === 'cache-grange' ? 'grange' : d.kind === 'cache-bois' ? 'bois' : 'bottes'
        const g = S(pre)
        const at = behind(g, pre === 'grange' ? 1.6 : pre === 'bois' ? 0.72 : 0.92, pre === 'grange' ? (d.param < 0.5 ? -0.8 : 0.8) : 0)
        const o = addB(put(pre === 'grange' ? animal(me, d.to ?? 'pig') : pre === 'bois' ? pumpkin(me) : animal(me, 'chick'), at, d.param * 6))
        if (pre === 'bottes') voice = undefined
        b.push(o); main = o
        break
      }
    }
    // Son centre et son rayon, mesurés sur ce qui la porte (repère du plateau)
    const box = new T.Box3().setFromObject(main!)
    const root = (main as Obj).parent && isIn(main!, me.B) ? me.B : me.A
    root.updateMatrixWorld(true)
    const c = root.worldToLocal(box.getCenter(new T.Vector3()))
    const size = box.getSize(new T.Vector3())
    const r = Math.max(0.6, Math.min(1.5, Math.max(size.x, size.z) * 0.62))
    return { d, a, b, at: c, r, found: false, shake: 0, marks: [], voice }
  })
  // Tout ce qui ne bouge pas, dans chaque copie, fondu en un mesh par matériau (animaux
  // compris) — sauf ce qui porte une différence (on le touche, il tremble)
  const keep = me.lives.flatMap(l => [...l.a, ...l.b])
  for (const root of [me.A, me.B]) {
    for (const m of bake(T, me.U, root, m => keep.some(k => isIn(m, k)))) me.trash.push(m.geometry)
  }
  me.phase = 'look'
  me.draw = true
  paintPips(me)
}

function isIn(o: Obj, root: Obj) {
  for (let x: Obj | null = o; x; x = x.parent) if (x === root) return true
  return false
}

/** Les deux fermes côte à côte ; la copie à droite ou à gauche (tiré à chaque manche). */
function layout(me: State) {
  me.A.position.x = -GAP * me.bSide
  me.B.position.x = GAP * me.bSide
  me.A.rotation.y = me.B.rotation.y = me.rot
}

function paintPips(me: State) {
  me.pips.innerHTML = me.lives.map(l => `<i class="${l.found ? 'got' : ''}">${l.found ? ICON.check : ''}</i>`).join('')
  me.rounds.querySelectorAll<HTMLElement>('i').forEach((p, i) => { p.className = i < me.round ? 'won' : i === me.round ? 'now' : '' })
}

/* ---------- Le toucher ---------- */
/** Ce que ferait un toucher en (x, y) — sans rien changer (le bot s'en sert aussi). */
function probe(me: State, x: number, y: number): { kind: 'sky' } | { kind: 'found' | 'near'; l: Live } | { kind: 'void' } | { kind: 'again' } {
  const { T } = me
  const r = me.stage.renderer.domElement.getBoundingClientRect()
  me.ray.setFromCamera(new T.Vector2((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1), me.stage.camera)
  const hits = me.ray.intersectObjects([me.A, me.B], true).filter(h => isVisible(h.object) && !(h.object as import('three').Sprite).isSprite)
  const h = hits[0]
  if (!h) return { kind: 'sky' }
  const inB = isIn(h.object, me.B)
  const root = inB ? me.B : me.A
  const p = root.worldToLocal(h.point.clone())
  let best: Live | null = null, bestD = Infinity
  for (const l of me.lives) {
    const own = (inB ? l.b : l.a).some(o => isIn(h.object, o))
    // Une cachée ne se trouve pas à travers ce qui la cache : sur sa copie, on la touche
    // elle ; sur l'autre, on touche le sol à sa place
    if (l.d.hidden && !own && (inB || p.y > 0.25)) continue
    const d = own ? 0 : p.distanceTo(l.at)
    if (d < bestD) { bestD = d; best = l }
  }
  if (best && bestD <= best.r) return best.found ? { kind: 'again' } : { kind: 'found', l: best }
  if (best && bestD <= best.r + 0.9) return best.found ? { kind: 'again' } : { kind: 'near', l: best }
  return { kind: 'void' }
}

function isVisible(o: Obj) {
  for (let x: Obj | null = o; x; x = x.parent) if (!x.visible) return false
  return true
}

function onTap(me: State, x: number, y: number) {
  if (me.phase !== 'look') return
  const res = probe(me, x, y)
  if (res.kind === 'sky' || res.kind === 'again') return
  if (res.kind === 'found') return found(me, res.l)
  if (res.kind === 'near') {
    // Le « presque » : elle tremble, dans les deux fermes, sans rien coûter
    res.l.shake = 0.6
    me.busy = me.t + 0.7
    me.near++
    sfx('tick', { vol: 0.5, rate: 0.9 })
    return
  }
  me.void++
  me.hurtThisRound = true
  me.stage.renderer.domElement.classList.remove('df-no'); void me.stage.renderer.domElement.offsetWidth
  me.stage.renderer.domElement.classList.add('df-no')
  if (me.game.hurt()) {
    me.phase = 'outro'
    me.game.end({ title: 'Oups, plus de cœurs', msg: 'Regarde bien avant de toucher', outroMs: 900 })
  }
}

function found(me: State, l: Live) {
  const { T } = me
  l.found = true
  me.game.hit(1, { perfect: l.d.grade === 'fin' })
  sfx('confirm', { vol: 0.7, rate: 1 + me.lives.filter(x => x.found).length * 0.05 })
  // Un animal en cause : sa vraie voix
  const v: AnimalVoice | undefined = l.voice ? CRY[l.voice] : undefined
  if (v) cry(v, { vol: 0.6 })
  // Le cercle doré, dans les deux fermes, au même endroit
  for (const root of [me.A, me.B]) {
    const s = new T.Sprite(me.markMat)
    s.position.copy(l.at)
    s.scale.setScalar(l.r * 2.3)
    s.renderOrder = 5
    root.add(s)
    l.marks.push(s)
    const w = root.localToWorld(l.at.clone())
    me.fx.burst(w, { count: 18, color: ['#FFD34D', '#FFF2B0', '#FF9A3D'], speed: 2.2, life: 0.7, size: 0.16 })
  }
  me.busy = me.t + 1.2
  paintPips(me)
  if (me.lives.every(x => x.found)) roundWon(me)
}

function roundWon(me: State) {
  me.phase = 'between'
  if (!me.hurtThisRound) me.level = Math.min(3, me.level + 1)
  me.round++
  paintPips(me)
  sfx('confirm', { vol: 0.9, rate: 1.2, delay: 0.25 })
  if (me.round >= ROUNDS) {
    me.phase = 'outro'
    me.outroT = 0
    confetti()
    const full = me.game.s.lives === me.game.s.maxLives
    me.game.end({ title: full ? 'Œil de lynx !' : 'Toutes trouvées !', msg: 'Trois fermes, pas une différence oubliée', outroMs: OUTRO_MS })
    return
  }
  ctx.after(1600, () => { if (df === me && me.phase === 'between') newRound(me) })
}

/* ---------- La boucle ---------- */
function step(me: State, dt: number) {
  me.t += dt
  me.game.tick(dt)
  if (!me.drag) {
    me.rot += me.vRot * dt
    me.vRot *= Math.pow(0.04, dt)
    if (Math.abs(me.vRot) < 0.01) me.vRot = 0
  }
  me.A.rotation.y = me.B.rotation.y = me.rot
  // Le « presque » : elle tremble dans les deux fermes
  for (const l of me.lives) {
    const k = l.shake > 0 ? Math.sin(me.t * 50) * 0.05 * Math.min(1, l.shake / 0.3) : 0
    if (l.shake > 0) l.shake = Math.max(0, l.shake - dt)
    for (const o of [...l.a, ...l.b]) {
      if (o.userData.z0 === undefined) o.userData.z0 = o.rotation.z
      o.rotation.z = (o.userData.z0 as number) + k
    }
  }
  if (me.drag || me.vRot !== 0 || me.lives.some(l => l.shake > 0) || me.phase !== 'look') me.busy = me.t + 0.3
  // L'outro : les deux fermes se rejoignent, n'en font plus qu'une, et font la fête
  if (me.phase === 'outro' && me.round >= ROUNDS) {
    me.outroT += dt
    const u = Math.min(1, me.outroT / 1.6)
    const e = u * u * (3 - 2 * u)
    me.A.position.x = -GAP * me.bSide * (1 - e)
    me.B.position.x = GAP * me.bSide * (1 - e)
    if (u >= 1) me.B.visible = false
    me.rot += dt * 0.5
    if (Math.random() < dt * 6) {
      const a = Math.random() * 6.28, r = 2 + Math.random() * 5
      me.fx.burst(me.A.localToWorld(new me.T.Vector3(Math.sin(a) * r, 0.5, Math.cos(a) * r)), { count: 14, color: ['#FFD34D', '#FF6B81', '#5EC97B', '#4FB8E7'], speed: 3, life: 1, size: 0.2 })
    }
    const cam = me.stage.camera
    cam.position.lerp(new me.T.Vector3(0, 15, 17), Math.min(1, dt * 1.2))
    cam.lookAt(0, 0.5, 0)
  }
  me.farm.step(dt, me.t)
  me.fx.update(dt)
}

/** La caméra cadre les deux fermes, d'au-dessus, un peu de face. */
function frame(me: State) {
  const cam = me.stage.camera
  const el = 56 * Math.PI / 180
  const vf = cam.fov * Math.PI / 180 / 2
  const hf = Math.atan(Math.tan(vf) * cam.aspect)
  const halfW = GAP + 8.15
  const halfH = 8.6 * Math.sin(el) + 1.5
  const d = Math.max(halfW / Math.tan(hf), halfH / Math.tan(vf)) + 2
  cam.position.set(0, Math.sin(el) * d, Math.cos(el) * d)
  cam.lookAt(0, -0.5, 0.6)
}

export const differences: GameDef = {
  id: 'differences', name: 'Le Jeu des différences', icon: '🔍', sq: 'sq-mint', cat: 'reflexion', music: 'meadow',
  subtitle: 'Trouve ce qui change d\'une ferme à l\'autre',
  // La main : « regarde celle-ci… et celle-là » (sans appuyer), puis tourner les fermes
  hand: () => {
    const me = df
    if (!me || me.phase !== 'look') return null
    const c = (o: Obj) => toScreen(me.stage, o.localToWorld(new me.T.Vector3(0, 0.5, 0)))
    if (handTurn++ % 2 === 0) return { choose: [c(me.A), c(me.B)] }
    return { drag: [{ fx: 0.3, fy: 0.86 }, { fx: 0.62, fy: 0.86 }] }
  },
  mount(c) {
    ctx = c
    let dead = false
    const tier = c.byTier<0 | 1 | 2>(0, 1, 2)
    c.root.innerHTML = `
      <div class="arena g3-arena df-arena" id="dfArena">
        <div class="df-pips" id="dfPips"></div>
        <div class="df-rounds" id="dfRounds">${Array.from({ length: ROUNDS }, () => `<i>${ICON.search}</i>`).join('')}</div>
      </div>`
    const arena = $('dfArena')
    const hideLoader = loader(arena, 'differences')
    preloadSfx(['confirm', 'tick', 'error', 'pluck', 'whoosh'])
    preloadCries(['vache', 'cochon', 'mouton', 'poule', 'canard', 'chien', 'chevre', 'cheval', 'chat', 'coq'])

    ;(async () => {
      const stage = await createStage(arena, {
        sky: '#9ED4F2', fov: 30, cam: [0, 30, 20], target: [0, 0, 0],
        hemi: ['#DCEFFF', '#5E8A44', 1.0],
        sun: { pos: [6, 22, 10], color: '#FFF0D2', intensity: 2.3, area: 19, far: 70 },
        fill: 0.45, exposure: 1.0
      })
      if (dead) { stage.dispose(); return }
      const T = stage.T
      const [farm, U] = await Promise.all([
        buildFarm(stage, { night: false }),
        import('three/examples/jsm/utils/BufferGeometryUtils.js')
      ])
      if (dead || !stage.alive) { stage.dispose(); return }
      if (stage.sun) stage.sun.shadow.mapSize.set(2048, 2048)
      // Le modèle reste dans la scène (il sera libéré avec elle), mais ne se dessine pas
      farm.root.visible = false
      const kit = critterKit(T)
      const ringTex = (() => {
        const cv = document.createElement('canvas')
        cv.width = cv.height = 128
        const g = cv.getContext('2d')!
        g.shadowColor = 'rgba(255,190,40,.9)'; g.shadowBlur = 10
        g.strokeStyle = '#FFD34D'; g.lineWidth = 9
        g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.stroke()
        g.setLineDash([6, 12]); g.lineWidth = 3; g.strokeStyle = '#FFF6D0'
        g.beginPath(); g.arc(64, 64, 40, 0, Math.PI * 2); g.stroke()
        const t = new T.CanvasTexture(cv)
        t.colorSpace = T.SRGBColorSpace
        return stage.keep(t)
      })()
      const game = arcade(c, {
        host: arena,
        lives: 3,
        scoreIcon: ICON.search,
        stars: s => (df && df.round >= ROUNDS ? (s.lives >= 3 ? 3 : 2) : 1)
      })
      const res = {
        pumpkinGeo: stage.keep(new T.SphereGeometry(0.3, 18, 12)),
        pumpkinMat: stage.keep(new T.MeshStandardMaterial({ color: 0xC2560E, roughness: 0.55 })),
        stemGeo: stage.keep(new T.CylinderGeometry(0.03, 0.045, 0.14, 6)),
        stemMat: stage.keep(new T.MeshStandardMaterial({ color: 0x3E5A1E, roughness: 0.8 })),
        appleGeo: stage.keep(new T.SphereGeometry(0.16, 14, 10)),
        appleMat: stage.keep(new T.MeshStandardMaterial({ color: 0xB8C21A, roughness: 0.4 }))
      }
      const me: State = {
        stage, T, U, farm, kit, tpl: farm.root, A: new T.Group(), B: new T.Group(), bSide: 1, game, tier,
        round: 0, level: 0, hurtThisRound: false, lives: [], extra: [], trash: [],
        markMat: stage.keep(new T.SpriteMaterial({ map: ringTex, transparent: true, depthTest: false, depthWrite: false })),
        fx: particles(stage, 400), rot: Math.PI, vRot: 0, drag: false, phase: 'look', t: 0, outroT: 0,
        pips: $('dfPips'), rounds: $('dfRounds'), ray: new T.Raycaster(), near: 0, void: 0, busy: 0, draw: true, res
      }
      df = me
      frame(me)
      // Deux fermes immobiles ne se redessinent pas soixante fois par seconde (le risque de ce jeu :
      // la ferme rendue deux fois) ; un changement de taille efface le canvas : on redessine
      let lastDraw = 0
      stage.render = () => {
        const now = performance.now()
        if (!me.draw && me.t >= me.busy && now - lastDraw < 110) return
        stage.renderer.render(stage.scene, stage.camera)
        lastDraw = now
        me.draw = false
      }
      stage.onResize = () => { if (df !== me) return; if (me.phase !== 'outro') frame(me); me.draw = true }
      newRound(me)
      hideLoader()

      /* --- Le doigt : un glissé tourne les deux fermes ensemble (suivi par son
         pointerId, avec son élan) ; un toucher cherche. --- */
      const el = stage.renderer.domElement
      let finger: { id: number; x: number; y: number; x0: number; y0: number; t: number; moved: number; last: number } | null = null
      const onDown = (e: PointerEvent) => {
        if (df !== me || e.target !== el || finger) return
        finger = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t: e.timeStamp, moved: 0, last: performance.now() }
        me.vRot = 0
      }
      const onMove = (e: PointerEvent) => {
        if (!finger || e.pointerId !== finger.id || df !== me) return
        const dx = e.clientX - finger.x
        finger.moved += Math.abs(dx) + Math.abs(e.clientY - finger.y)
        finger.x = e.clientX; finger.y = e.clientY
        if (finger.moved < 10 || me.phase === 'outro') return
        me.drag = true
        const now = performance.now(), dts = Math.max(8, now - finger.last) / 1000
        finger.last = now
        const k = 1 / Math.max(160, el.clientWidth * 0.3)
        me.rot += dx * k
        me.vRot = Math.max(-3, Math.min(3, me.vRot * 0.5 + dx * k / dts * 0.5))
      }
      const onUp = (e: PointerEvent) => {
        if (!finger || e.pointerId !== finger.id) return
        const f = finger
        finger = null
        me.drag = false
        if (performance.now() - f.last > 90) me.vRot = 0
        if (e.type === 'pointercancel' || f.moved > 14 || e.timeStamp - f.t > 650) return
        me.vRot = 0
        onTap(me, e.clientX, e.clientY)
      }
      el.addEventListener('pointerdown', onDown)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)

      // Accroche pour les bots (scripts/play.mjs) — inerte en production
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __df: unknown }).__df = {
          get phase() { return me.phase }, get round() { return me.round }, get lives() { return me.game.s.lives },
          get found() { return me.lives.filter(l => l.found).length }, get total() { return me.lives.length },
          get hidden() { return me.lives.filter(l => l.d.hidden).length }, get near() { return me.near }, get void() { return me.void },
          get calls() { return stage.renderer.info.render.calls },
          /** Ce que dessine une copie : meshes, instances, et combien portent une ombre. */
          get stats() {
            let mesh = 0, inst = 0, cast = 0
            me.A.traverse(o => { const m = o as import('three').Mesh; if (!m.isMesh || !isVisible(m)) return; if ((m as import('three').InstancedMesh).isInstancedMesh) inst++; else mesh++; if (m.castShadow) cast++ })
            return { mesh, inst, cast }
          }, get moving() { return me.drag || me.vRot !== 0 },
          get kinds() { return me.lives.map(l => l.d.kind) },
          /** Un point d'écran qui TROUVE une différence pas encore trouvée, s'il y en a un de visible d'ici. */
          spot: () => {
            for (const l of me.lives) {
              if (l.found) continue
              for (const root of [me.B, me.A]) {
                for (const dy of [0, 0.25, -0.2]) {
                  const p = toScreen(stage, root.localToWorld(l.at.clone().add(new T.Vector3(0, dy, 0))))
                  const r = probe(me, p.x, p.y)
                  if (r.kind === 'found' && r.l === l && document.elementFromPoint(p.x, p.y) === el) return { x: p.x, y: p.y, kind: l.d.kind }
                }
              }
            }
            return null
          },
          /** Un point d'écran sur une ferme, loin de toute différence (un toucher « dans le vide »). */
          blank: () => {
            for (let i = 0; i < 60; i++) {
              const a = Math.random() * 6.28, rr = 3 + Math.random() * 4
              const p = toScreen(stage, me.A.localToWorld(new T.Vector3(Math.sin(a) * rr, 0, Math.cos(a) * rr)))
              if (probe(me, p.x, p.y).kind === 'void' && document.elementFromPoint(p.x, p.y) === el) return p
            }
            return null
          },
          /** Un point tout près d'une différence (le « presque »). */
          nearSpot: () => {
            for (const l of me.lives) {
              if (l.found) continue
              for (let i = 0; i < 24; i++) {
                const a = i / 24 * 6.28
                const v = l.at.clone().add(new T.Vector3(Math.sin(a) * (l.r + 0.45), -l.at.y, Math.cos(a) * (l.r + 0.45)))
                const p = toScreen(stage, me.A.localToWorld(v))
                const r = probe(me, p.x, p.y)
                if (r.kind === 'near' && document.elementFromPoint(p.x, p.y) === el) return p
              }
            }
            return null
          }
        }
      }

      stage.start(dt => { if (df === me) step(me, dt) })
      stage.keep({
        dispose() {
          el.removeEventListener('pointerdown', onDown)
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          window.removeEventListener('pointercancel', onUp)
          for (const x of me.trash) x.dispose()
          me.fx.dispose()
          me.kit.dispose()
          me.game.dispose()
          delete (window as { __df?: unknown }).__df
        }
      })
    })().catch(err => { console.error(err); hideLoader(); ctx.toast('La 3D n\'est pas disponible ici') })

    return () => {
      dead = true
      setMusicIntensity(0)
      const me = df
      df = null
      if (me) { try { me.stage.dispose() } catch { /* déjà démonté */ } }
    }
  }
}
