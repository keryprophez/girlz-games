import type { GameContext, GameDef } from '../core/types'
import { $, pick, rnd } from '../core/utils'
import { impact } from '../core/impact'
import { createStage, loadThree, loader, loadModel, fitModel, type Stage, type T3 } from '../core/three3d'
import { arcade, type Arcade } from '../core/arcade'
import { ground, decor, particles, camShake, type Particles, type CamShake } from '../core/scene3d'
import { ICON } from '../core/icons'
import { sfx, preloadSfx } from '../core/sfx'

/* 🐛 La Chenille, refaite le 2/09 — un snake incarné pour de bon.

   La logique de grille ne change pas (c'est elle qui fait le jeu), mais :
   - le corps est CONTINU : une courbe passe par les maillons interpolés et
     les anneaux sont posés à espacement constant dessus — ça serpente, ça ne
     saute plus de case en case ;
   - la clôture est une VRAIE clôture : la toucher coûte un cœur, comme se
     mordre. Plus de bords qui téléportent à travers un mur dessiné ;
   - un « tic » à chaque pas, qui accélère avec la chenille : la tension
     s'entend ;
   - une fraise bonus apparaît de temps en temps 5 secondes : elle vaut trois
     fruits, la seule décision « je tente ou pas » du jeu ;
   - le pas vit sur l'horloge simulée : plus de saut de phase à chaque fruit.

   Cinquième jeu sur core/arcade.ts + core/scene3d.ts. */

const COLS = 13
const ROWS = 11
const CELL = 0.3
const FRUITS = ['apple', 'orange', 'banana', 'lemon']
const BONUS = 'strawberry'
const BONUS_S = 5

const gx = (x: number) => (x - (COLS - 1) / 2) * CELL
const gz = (y: number) => (y - (ROWS - 1) / 2) * CELL

type Cell = { x: number; y: number }
type Obj = import('three').Object3D

interface State {
  stage: Stage
  T: T3
  game: Arcade
  fx: Particles
  shake: CamShake
  snake: Cell[]
  /** Case que chaque maillon vient de quitter (pour interpoler). */
  prev: Cell[]
  dir: Cell
  nextDir: Cell
  eaten: number
  speed: number
  floor: number
  acc: number
  fruit: Cell & { kind: string }
  bonus: (Cell & { left: number }) | null
  fruitGroup: import('three').Group
  bonusGroup: import('three').Group
  fruitModels: Record<string, Obj>
  head: import('three').Group
  rings: import('three').Mesh[]
  ringGeo: import('three').SphereGeometry
  curve: import('three').CatmullRomCurve3
  over: boolean
  tapHint: HTMLElement
}

let cp: State | null = null
let ctx: GameContext

function freeCell(me: State): Cell {
  let x = 0, y = 0, tries = 0
  do { x = rnd(0, COLS - 1); y = rnd(0, ROWS - 1); tries++ }
  while (tries < 80 && (me.snake.some(s => s.x === x && s.y === y) || (me.fruit && me.fruit.x === x && me.fruit.y === y)))
  return { x, y }
}

function placeFruit(me: State) {
  const c = freeCell(me)
  me.fruit = { ...c, kind: pick(FRUITS) }
  for (const k of FRUITS) me.fruitModels[k].visible = k === me.fruit.kind
  me.fruitGroup.position.set(gx(c.x), 0, gz(c.y))
}

function placeBonus(me: State) {
  const c = freeCell(me)
  me.bonus = { ...c, left: BONUS_S }
  me.bonusGroup.position.set(gx(c.x), 0, gz(c.y))
  me.bonusGroup.visible = true
  sfx('pluck', { vol: 0.5, rate: 1.3 })
}

function setDir(x: number, y: number) {
  const me = cp
  if (!me || me.over) return
  if (x === -me.dir.x && y === -me.dir.y) return // pas de demi-tour sur place
  me.nextDir = { x, y }
  me.tapHint.classList.add('off')
}

function bite(me: State, at: Cell, wall: boolean) {
  const p = { x: gx(at.x), y: CELL * 0.4, z: gz(at.y) }
  impact(0.7, { matter: wall ? 'bois' : 'pate', noShake: true })
  me.shake.hit(0.6)
  me.fx.burst(p, { count: 18, color: wall ? [0xC9A874, 0x8A6238] : [0x9ED26A, 0xFFFFFF], speed: 2.2, life: 0.6, size: 0.05 })
  me.game.flash(ICON.heartEmpty, 'bad')
  if (me.game.hurt()) { finish(me); return true }
  // Il reste une vie : on raccourcit et on repart, sans temps mort
  const keep = Math.max(4, Math.floor(me.snake.length / 2))
  me.snake = me.snake.slice(0, keep)
  me.prev = me.prev.slice(0, keep)
  return false
}

function step(me: State) {
  if (me.over) return
  me.dir = me.nextDir
  const head = me.snake[0]
  const nx = head.x + me.dir.x, ny = head.y + me.dir.y
  // La clôture : un vrai mur. On cogne, on perd un cœur, on repart ailleurs.
  if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
    if (bite(me, head, true)) return
    const turns: Cell[] = me.dir.x ? [{ x: 0, y: -1 }, { x: 0, y: 1 }] : [{ x: -1, y: 0 }, { x: 1, y: 0 }]
    const ok = turns.filter(d => {
      const tx = head.x + d.x, ty = head.y + d.y
      return tx >= 0 && tx < COLS && ty >= 0 && ty < ROWS && !me.snake.some(s => s.x === tx && s.y === ty)
    })
    me.dir = me.nextDir = ok.length ? pick(ok) : { x: -me.dir.x, y: -me.dir.y }
    return
  }
  // Se mordre : ça coûte un cœur. À zéro, la partie s'arrête.
  const hitIdx = me.snake.findIndex(s => s.x === nx && s.y === ny)
  if (hitIdx > 0 && hitIdx < me.snake.length - 1) {
    if (bite(me, { x: nx, y: ny }, false)) return
  }
  me.prev = me.snake.map(s => ({ ...s }))
  me.snake.unshift({ x: nx, y: ny })
  me.prev.unshift({ ...head })
  sfx('tick', { vol: 0.16, rate: 0.9 + (300 - me.speed) / 300 * 0.6, spread: 0.02 })

  const ateBonus = me.bonus && nx === me.bonus.x && ny === me.bonus.y
  if (nx === me.fruit.x && ny === me.fruit.y || ateBonus) {
    const pts = ateBonus ? 3 : 1
    me.eaten += pts
    sfx('chop', { vol: 0.7, rate: 1.1 + Math.min(20, me.eaten) * 0.015 })
    impact(0.35, { matter: 'pate', noShake: true })
    me.fx.burst({ x: gx(nx), y: CELL * 0.5, z: gz(ny) }, { count: ateBonus ? 26 : 14, color: ateBonus ? [0xFF5A6E, 0xFFFFFF, 0xFFC533] : [0xFFE08A, 0xFFFFFF, 0x9ED26A], speed: 2, life: 0.6, size: 0.05, gravity: 4 })
    me.game.hit(pts, { silent: true, perfect: !!ateBonus })
    if (ateBonus) { me.game.flash('×3'); me.bonus = null; me.bonusGroup.visible = false }
    else placeFruit(me)
    // La chenille accélère : c'est ça qui finit par avoir raison de la joueuse
    me.speed = Math.max(me.floor, me.speed - 8 * pts)
    // Une fraise bonus, parfois, quand il n'y en a pas déjà une
    if (!me.bonus && Math.random() < 0.22) placeBonus(me)
    if (!ateBonus) me.prev.pop() // on grandit : la queue reste, mais il faut un prev pour elle
    else me.snake.pop()
    if (!ateBonus) me.prev.push({ ...me.snake[me.snake.length - 1] })
    else me.prev.pop()
  } else {
    me.snake.pop()
    me.prev.pop()
  }
}

function finish(me: State) {
  if (me.over) return
  me.over = true
  me.stage.timeScale = 0.4
  const th = ctx.byTier([14, 7], [18, 9], [24, 12])
  const n = me.eaten
  me.game.end({
    title: n >= th[0] ? 'Chenille GÉANTE !' : n >= th[1] ? 'Belle chenille !' : 'Elle s\'est cognée !',
    msg: `${ctx.playerName} a croqué ${n} fruit${n > 1 ? 's' : ''}`,
    outroMs: 1200
  })
}

/** La tête : sphère + yeux + antennes, orientée selon la direction. */
function makeHead(T: T3) {
  const g = new T.Group()
  const mat = new T.MeshStandardMaterial({ color: 0x4E8C3E, roughness: 0.55 })
  const skull = new T.Mesh(new T.SphereGeometry(CELL * 0.48, 20, 16), mat)
  skull.castShadow = true
  g.add(skull)
  const white = new T.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.3 })
  const dark = new T.MeshStandardMaterial({ color: 0x2A2A2A, roughness: 0.4 })
  for (const s of [-1, 1]) {
    const eye = new T.Mesh(new T.SphereGeometry(CELL * 0.14, 10, 8), white)
    eye.position.set(s * CELL * 0.2, CELL * 0.2, CELL * 0.36)
    const pupil = new T.Mesh(new T.SphereGeometry(CELL * 0.065, 8, 6), dark)
    pupil.position.set(s * CELL * 0.2, CELL * 0.2, CELL * 0.47)
    g.add(eye, pupil)
    const stem = new T.Mesh(new T.CylinderGeometry(CELL * 0.025, 0.025 * CELL, CELL * 0.4, 6),
      new T.MeshStandardMaterial({ color: 0x5B8F4A, roughness: 0.7 }))
    stem.position.set(s * CELL * 0.2, CELL * 0.6, 0)
    stem.rotation.z = -s * 0.5
    const tip = new T.Mesh(new T.SphereGeometry(CELL * 0.07, 8, 6),
      new T.MeshStandardMaterial({ color: 0xE85D75, roughness: 0.5 }))
    tip.position.set(s * CELL * 0.3, CELL * 0.78, 0)
    stem.castShadow = tip.castShadow = true
    g.add(stem, tip)
  }
  return g
}

export const caterpillar: GameDef = {
  id: 'caterpillar', name: 'La Chenille', icon: '🐛', sq: 'sq-mint', cat: 'action', music: 'meadow',
  subtitle: 'Glisse ton doigt pour guider la chenille vers les fruits !',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `<div class="arena g3-arena cp3-arena" id="cpArena"></div>`
    const arena = $('cpArena')
    const hideLoader = loader(arena, '🐛')
    preloadSfx(['tick', 'chop', 'pluck', 'error'])

    ;(async () => {
      const T = await loadThree()
      if (dead) return
      const stage: Stage = await createStage(arena, {
        sky: '#2A4A32', fog: [7, 16], fogColor: '#2A4A32',
        cam: [0, 3.9, 2.9], target: [0, 0, -0.1], fov: 48,
        hemi: ['#FFE9C4', '#1C3020', 0.8],
        sun: { pos: [2.6, 5, 2.8], color: '#FFD9A0', intensity: 1.9, area: 4.5, far: 13 },
        fill: 0.35, exposure: 0.95, iblIntensity: 0.55
      })
      if (dead) { stage.dispose(); return }
      const scene = stage.scene

      /* Le plateau : pré en damier, entouré d'une vraie clôture */
      const W = COLS * CELL, H = ROWS * CELL
      const Y0 = -CELL * 0.3
      const base = new T.Mesh(new T.BoxGeometry(W + 0.1, 0.12, H + 0.1), new T.MeshStandardMaterial({ color: 0x3E7A42, roughness: 0.9 }))
      base.position.y = Y0 - 0.06
      base.receiveShadow = true
      scene.add(base)
      const cellGeo = new T.PlaneGeometry(CELL, CELL)
      const cellMat = new T.MeshStandardMaterial({ color: 0x4E9152, roughness: 0.9 })
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        if ((x + y) % 2 !== 0) continue
        const m = new T.Mesh(cellGeo, cellMat)
        m.rotation.x = -Math.PI / 2
        m.position.set(gx(x), Y0 + 0.001, gz(y))
        m.receiveShadow = true
        scene.add(m)
      }
      const far = ground(stage, { radius: 14, color: 0x25402A, roughness: 1 })
      far.position.y = Y0 - 0.14
      // La clôture : des barrières du kit nature tout autour, et des arbres derrière
      const fences: { model: string; x: number; z: number; size: number; rot: number; tint: number }[] = []
      const fs = 0.23
      for (let x = -W / 2 + fs / 2; x < W / 2; x += fs) {
        fences.push({ model: 'nature/fence_simple', x, z: -H / 2 - 0.1, size: 0.22, rot: 0, tint: 0xC9A874 })
        fences.push({ model: 'nature/fence_simple', x, z: H / 2 + 0.1, size: 0.22, rot: 0, tint: 0xC9A874 })
      }
      for (let z = -H / 2 + fs / 2; z < H / 2; z += fs) {
        fences.push({ model: 'nature/fence_simple', x: -W / 2 - 0.1, z, size: 0.22, rot: Math.PI / 2, tint: 0xC9A874 })
        fences.push({ model: 'nature/fence_simple', x: W / 2 + 0.1, z, size: 0.22, rot: Math.PI / 2, tint: 0xC9A874 })
      }
      const trees = [[-2.9, -2.6, 1.3], [2.8, -2.8, 1.5], [-3.2, -0.4, 1.1], [3.3, 0.2, 1.2], [0.4, -3.1, 1.4], [-1.6, -3, 1.0]]
        .map(([x, z, size], i) => ({ model: `nature/${['tree_default', 'tree_oak', 'tree_fat'][i % 3]}`, x, z, size, rot: Math.random() * 6, tint: 0x5E9A3C }))
      decor(stage, [...fences, ...trees]).then(g => g.position.y = Y0).catch(() => { /* sans décor, le jeu tourne */ })

      /* Les vrais fruits : modèles chargés une fois, un seul visible ; et la fraise bonus */
      const fruitGroup = new T.Group()
      const fruitModels: Record<string, Obj> = {}
      for (const k of FRUITS) {
        const m = await loadModel('food', k)
        fitModel(T, m, 0.3)
        m.visible = false
        fruitModels[k] = m
        fruitGroup.add(m)
      }
      const bonusGroup = new T.Group()
      const bm = await loadModel('food', BONUS)
      fitModel(T, bm, 0.32)
      bonusGroup.add(bm)
      bonusGroup.visible = false
      if (dead) { stage.dispose(); return }
      scene.add(fruitGroup, bonusGroup)
      hideLoader()

      const tapHint = document.createElement('div')
      tapHint.className = 'tap-hint'
      tapHint.innerHTML = ICON.tap
      arena.appendChild(tapHint)

      /* La chenille : la tête + des anneaux posés sur une courbe continue */
      const head = makeHead(T)
      scene.add(head)
      const ringGeo = new T.SphereGeometry(CELL * 0.46, 16, 12)
      const rings: import('three').Mesh[] = []
      const ensureRings = (n: number) => {
        while (rings.length < n) {
          const m = new T.Mesh(ringGeo, new T.MeshStandardMaterial({ color: 0x5E9C4A, roughness: 0.6 }))
          m.castShadow = true
          scene.add(m)
          rings.push(m)
        }
        while (rings.length > n) {
          const m = rings.pop()!
          scene.remove(m); (m.material as import('three').Material).dispose()
        }
        // Dégradé du vert vif (cou) au vert tendre (queue), queue plus fine.
        // setHSL travaille en LINÉAIRE par défaut : SRGBColorSpace, sinon pastel.
        for (let i = 0; i < rings.length; i++) {
          const t = i / Math.max(1, rings.length - 1)
          ;(rings[i].material as import('three').MeshStandardMaterial).color.setHSL((95 - t * 25) / 360, 0.55, 0.45 + t * 0.12, T.SRGBColorSpace)
          rings[i].scale.setScalar(1 - t * 0.2)
        }
      }

      const game = arcade(c, {
        host: arena,
        lives: c.byTier(5, 3, 3),
        scoreIcon: ICON.apple,
        plainScore: true, // le compteur, c'est le nombre de fruits, pas un score à combo
        stars: s => { const th = c.byTier([14, 7], [18, 9], [24, 12]); return s.score >= th[0] ? 3 : s.score >= th[1] ? 2 : 1 }
      })
      const midY = Math.floor(ROWS / 2)
      const snake = Array.from({ length: 6 }, (_, i) => ({ x: 6 - i, y: midY }))
      const me: State = {
        stage, T, game, fx: particles(stage, 400), shake: camShake(stage),
        snake, prev: snake.map(s => ({ x: s.x - 1, y: s.y })),
        dir: { x: 1, y: 0 }, nextDir: { x: 1, y: 0 },
        eaten: 0, speed: c.byTier(300, 250, 200), floor: c.byTier(150, 125, 100), acc: 0,
        fruit: { x: 0, y: 0, kind: 'apple' }, bonus: null,
        fruitGroup, bonusGroup, fruitModels, head, rings, ringGeo,
        curve: new T.CatmullRomCurve3([new T.Vector3(), new T.Vector3()], false, 'centripetal', 0.5),
        over: false, tapHint
      }
      cp = me
      placeFruit(me)
      // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __cp: unknown }).__cp = {
          get running() { return !me.over }, get snake() { return me.snake }, get fruit() { return me.fruit },
          get dir() { return me.dir }, get eaten() { return me.eaten }
        }
      }

      /* --- Boucle : pas sur l'horloge simulée, corps interpolé sur une courbe --- */
      const pts: import('three').Vector3[] = []
      stage.start((dt, now) => {
        if (cp !== me) return
        game.tick(dt)
        if (!me.over) {
          me.acc += dt * 1000
          while (me.acc >= me.speed && !me.over) { me.acc -= me.speed; step(me) }
        }
        if (me.bonus) {
          me.bonus.left -= dt
          bonusGroup.visible = me.bonus.left > 1.2 || Math.floor(now / 120) % 2 === 0
          if (me.bonus.left <= 0) { me.bonus = null; bonusGroup.visible = false }
        }
        // Chaque maillon est entre la case qu'il quitte et celle où il va
        const p = me.over ? 1 : Math.min(1, me.acc / me.speed)
        pts.length = 0
        for (let i = 0; i < me.snake.length; i++) {
          const a = me.prev[i] ?? me.snake[i], b = me.snake[i]
          const x = gx(a.x) + (gx(b.x) - gx(a.x)) * p, z = gz(a.y) + (gz(b.y) - gz(a.y)) * p
          pts.push(new T.Vector3(x, 0, z))
        }
        if (pts.length >= 2) {
          me.curve.points = pts
          me.curve.updateArcLengths()
          const len = me.curve.getLength()
          const n = Math.max(1, Math.round(len / (CELL * 0.55)))
          ensureRings(n)
          for (let i = 0; i < n; i++) {
            const u = Math.min(1, (i + 1) / (n + 0.5))
            const q = me.curve.getPointAt(u)
            rings[i].position.set(q.x, CELL * 0.05 + Math.abs(Math.sin(now / 150 + i * 0.7)) * 0.025, q.z)
          }
          const h = pts[0]
          head.position.set(h.x, CELL * 0.08 + Math.abs(Math.sin(now / 150)) * 0.03, h.z)
        }
        // La tête regarde déjà vers le prochain virage
        const look = me.nextDir
        const want = Math.atan2(look.x, look.y)
        let d = want - head.rotation.y
        while (d > Math.PI) d -= Math.PI * 2
        while (d < -Math.PI) d += Math.PI * 2
        head.rotation.y += d * Math.min(1, dt * 12)

        // Le fruit frétille pour attirer l'œil ; la fraise aussi
        fruitGroup.rotation.y = now / 900
        fruitGroup.position.y = 0.02 + Math.sin(now / 300) * 0.02
        bonusGroup.rotation.y = -now / 500
        bonusGroup.position.y = 0.06 + Math.sin(now / 200) * 0.04

        // La caméra recule un peu avec la longueur
        const back = Math.min(0.9, (me.snake.length - 6) * 0.04)
        stage.camera.position.set(0, 3.9 + back * 0.8, 2.9 + back)
        stage.camera.lookAt(0, 0, -0.1)
        me.shake.apply(dt)
        me.fx.update(dt)
      })

      /* Glisser dans une direction (n'importe où sur l'arène) */
      let start: { x: number; y: number } | null = null
      const onDown = (e: PointerEvent) => { start = { x: e.clientX, y: e.clientY } }
      const onMove = (e: PointerEvent) => {
        if (!start) return
        const dx = e.clientX - start.x, dy = e.clientY - start.y
        if (Math.hypot(dx, dy) < 22) return
        if (Math.abs(dx) > Math.abs(dy)) setDir(Math.sign(dx), 0)
        else setDir(0, Math.sign(dy))
        start = { x: e.clientX, y: e.clientY }
      }
      const onUp = () => { start = null }
      arena.addEventListener('pointerdown', onDown)
      arena.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'ArrowUp') setDir(0, -1)
        else if (e.key === 'ArrowDown') setDir(0, 1)
        else if (e.key === 'ArrowLeft') setDir(-1, 0)
        else if (e.key === 'ArrowRight') setDir(1, 0)
      }
      window.addEventListener('keydown', onKey)

      stage.keep({ dispose() {
        arena.removeEventListener('pointerdown', onDown)
        arena.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('keydown', onKey)
        cellGeo.dispose(); cellMat.dispose(); ringGeo.dispose()
        me.fx.dispose()
        me.game.dispose()
      } })
    })().catch(err => { if (!dead) throw err })

    return () => {
      dead = true
      if (cp) { cp.stage.dispose(); cp = null }
    }
  }
}
