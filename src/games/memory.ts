import type { GameContext, GameDef } from '../core/types'
import { $, shuffle } from '../core/utils'
import { sfx, preloadSfx } from '../core/sfx'
import { confetti } from '../core/fx'
import { ICON } from '../core/icons'
import { PHOTOS, photoUrl } from '../core/sprites'
import { createStage, loader, woodTex, picker, type Stage, type T3 } from '../core/three3d'
import { particles, type Particles } from '../core/scene3d'

/* Memory — retrouver les paires.

   En 3D depuis le 23/09 (« huit rectangles orange avec une étoile ») : de
   vraies cartes posées sur une table en bois, distribuées une à une depuis
   le paquet, qui se RETOURNENT en volume (elles se soulèvent, pivotent,
   retombent). Une paire trouvée saute de joie dans une gerbe d'étincelles,
   puis file se ranger sur la pile, face visible ; une mauvaise paire
   tremble et se recouche.

   Les faces restent des PHOTOS réelles (règle des imagiers : une vraie
   vache, un vrai renard — jamais deux styles dans la même grille, sinon les
   paires se repèrent au dessin), imprimées sur la carte avec un liseré blanc.

   L'aperçu du début ne vide pas le défi : long en douce, bref en normale,
   absent en experte. Plus rien à lire : manches en pastilles, coups en
   chiffre à côté d'une main. */

const CW = 1          // côté d'une carte
const GAP = 0.16
const THICK = 0.03

interface Card {
  i: number
  key: string
  g: import('three').Group
  /** Face visible demandée (le pivot suit) */
  up: boolean
  ang: number
  /** Où la carte se pose (le mouvement la rejoint en douceur) */
  pos: import('three').Vector3
  matched: boolean
  jump: number
  shake: number
}

interface State {
  stage: Stage
  T: T3
  rounds: number[]
  round: number
  moves: number
  pairs: number
  found: number
  first: Card | null
  lock: boolean
  deck: string[]
  cards: Card[]
  /** Nombre de manches distribuées : les bots attendent la suivante dessus. */
  dealt: number
  fx: Particles
  backTex: import('three').Texture
  faceTex: Map<string, import('three').Texture>
  geo: { body: import('three').BufferGeometry; face: import('three').BufferGeometry }
  bodyMat: import('three').MeshStandardMaterial
  pile: import('three').Vector3
  /** Cartes déjà sur la pile : chacune se pose un cran plus haut */
  piled: number
  gone: Card[]
}

let mem: State | null = null
let ctx: GameContext

function paintSide(me: State) {
  $('memDots').innerHTML = me.rounds.map((_, i) => `<i class="sn-dot${i < me.round ? ' on' : ''}"></i>`).join('')
  $('memMoves').innerHTML = `${ICON.tap}<span>${me.moves}</span>`
}

/* ---------- Les cartes ---------- */
function roundRect(T: T3, w: number, h: number, r: number) {
  const s = new T.Shape()
  const x = -w / 2, y = -h / 2
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y)
  return s
}
function buildGeo(T: T3) {
  const shape = roundRect(T, CW, CW, 0.1)
  const body = new T.ExtrudeGeometry(shape, { depth: THICK, bevelEnabled: false, curveSegments: 6 })
  body.translate(0, 0, -THICK / 2)
  body.rotateX(-Math.PI / 2)
  // La face imprimée : la même forme, UV ramenées à 0..1
  const face = new T.ShapeGeometry(roundRect(T, CW * 0.998, CW * 0.998, 0.1), 6)
  const uv = face.attributes.uv, p = face.attributes.position
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / CW + 0.5, p.getY(i) / CW + 0.5)
  face.rotateX(-Math.PI / 2)
  return { body, face }
}
/** Le dos : orange de la ferme, un motif de petites étoiles et une grande au centre */
function backTexture(T: T3) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const gr = g.createLinearGradient(0, 0, 256, 256)
  gr.addColorStop(0, '#D9782A'); gr.addColorStop(1, '#B4431F')
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256)
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 8
  g.strokeRect(18, 18, 220, 220)
  const star = (x: number, y: number, r: number, a: number) => {
    g.fillStyle = `rgba(255,236,170,${a})`
    g.beginPath()
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? r * 0.45 : r, an = -Math.PI / 2 + k * Math.PI / 5
      g.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr)
    }
    g.closePath(); g.fill()
  }
  for (let y = 40; y < 240; y += 44) for (let x = 40 + ((y / 44) % 2) * 22; x < 240; x += 44) star(x, y, 7, 0.35)
  g.fillStyle = 'rgba(255,246,228,.95)'
  g.beginPath(); g.arc(128, 128, 56, 0, 7); g.fill()
  // L'étoile du milieu, dorée (couleur sombre : l'éclairage la remonte)
  const big = (r: number, col: string) => {
    g.fillStyle = col
    g.beginPath()
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? r * 0.45 : r, an = -Math.PI / 2 + k * Math.PI / 5
      g.lineTo(128 + Math.cos(an) * rr, 130 + Math.sin(an) * rr)
    }
    g.closePath(); g.fill()
  }
  big(42, '#B8761C'); big(35, '#E0A21F')
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  t.anisotropy = 4
  return t
}
/** La face : la photo imprimée avec un liseré blanc arrondi */
function loadFace(T: T3, name: string): Promise<import('three').Texture> {
  return new Promise(res => {
    const img = new Image()
    const make = (ok: boolean) => {
      const c = document.createElement('canvas')
      c.width = c.height = 384
      const g = c.getContext('2d')!
      g.fillStyle = '#FFFDF8'; g.fillRect(0, 0, 384, 384)
      if (ok) {
        g.save()
        g.beginPath()
        const m = 22, r = 26
        g.moveTo(m + r, m); g.arcTo(384 - m, m, 384 - m, 384 - m, r); g.arcTo(384 - m, 384 - m, m, 384 - m, r)
        g.arcTo(m, 384 - m, m, m, r); g.arcTo(m, m, 384 - m, m, r); g.closePath(); g.clip()
        g.drawImage(img, m, m, 384 - m * 2, 384 - m * 2)
        g.restore()
      }
      const t = new T.CanvasTexture(c)
      t.colorSpace = T.SRGBColorSpace
      t.anisotropy = 4
      res(t)
    }
    img.onload = () => make(true)
    img.onerror = () => make(false)
    img.src = photoUrl(name)
  })
}

function makeCard(me: State, i: number, key: string): Card {
  const { T } = me
  const g = new T.Group()
  const body = new T.Mesh(me.geo.body, me.bodyMat)
  body.castShadow = true; body.receiveShadow = true
  const back = new T.Mesh(me.geo.face, new T.MeshStandardMaterial({ map: me.backTex, roughness: 0.55 }))
  back.position.y = THICK / 2 + 0.001
  const front = new T.Mesh(me.geo.face, new T.MeshStandardMaterial({ map: me.faceTex.get(key)!, roughness: 0.6 }))
  // Retournée sous la carte : on la verra quand la carte pivote
  front.rotation.z = Math.PI
  front.position.y = -THICK / 2 - 0.001
  g.add(body, back, front)
  g.userData.card = i
  me.stage.scene.add(g)
  return { i, key, g, up: false, ang: 0, pos: new T.Vector3(), matched: false, jump: 0, shake: 0 }
}

/** La grille la plus grande qui tienne à l'écran, et la caméra qui la cadre */
function layout(me: State, n: number) {
  const { camera } = me.stage
  let best = { cols: 2, rows: Math.ceil(n / 2), score: 0 }
  for (let cols = 2; cols <= 7; cols++) {
    const rows = Math.ceil(n / cols)
    const w = cols * (CW + GAP), h = rows * (CW + GAP)
    // Place utile : l'écran moins la colonne de droite (pastilles) et la pile à gauche
    const score = Math.min((camera.aspect * 0.78) / w, 1 / h)
    if (score > best.score) best = { cols, rows, score }
  }
  const w = best.cols * (CW + GAP) - GAP, h = best.rows * (CW + GAP) - GAP
  const tan = Math.tan(camera.fov / 2 * Math.PI / 180)
  const dist = Math.max(h / 2 / tan / 0.86, w / 2 / (tan * camera.aspect * 0.76)) * 1.02
  camera.position.set(0.25, dist * 0.93, dist * 0.37)
  camera.lookAt(0.25, 0, 0.02)
  const halfW = tan * camera.aspect * dist
  me.pile.set(-halfW * 0.7 + 0.25, 0, h / 2 - 0.55)
  const slots: import('three').Vector3[] = []
  for (let k = 0; k < n; k++) {
    const r = Math.floor(k / best.cols), cIn = k % best.cols
    const inRow = Math.min(best.cols, n - r * best.cols)
    const x0 = -((inRow * (CW + GAP) - GAP) / 2) + CW / 2 + 0.3
    slots.push(new me.T.Vector3(x0 + cIn * (CW + GAP), THICK / 2, -h / 2 + CW / 2 + r * (CW + GAP)))
  }
  return slots
}

async function loadRound(me: State) {
  const pairs = me.rounds[me.round]
  const picks = shuffle([...PHOTOS]).slice(0, pairs)
  me.lock = true
  await Promise.all(picks.filter(k => !me.faceTex.has(k)).map(async k => me.faceTex.set(k, await loadFace(me.T, k))))
  if (mem !== me) return
  const deck = shuffle([...picks, ...picks])
  me.first = null; me.found = 0; me.pairs = pairs; me.deck = deck; me.piled = 0
  me.dealt++
  paintSide(me)
  // Les cartes de la manche d'avant partent de la pile vers la droite
  for (const c of me.cards) { c.pos.set(12, 0.5, c.pos.z); me.gone.push(c) }
  const slots = layout(me, deck.length)
  me.cards = deck.map((k, i) => {
    const c = makeCard(me, i, k)
    // Distribuées depuis le paquet, au fond de la table, une par une
    c.g.position.set(0.3, 2.2, -8)
    c.g.visible = false
    ctx.after(90 * i, () => {
      if (mem !== me) return
      c.g.visible = true
      c.pos.copy(slots[i])
      sfx('cloth', { vol: 0.22, rate: 1.6 + Math.random() * 0.3 })
    })
    return c
  })
  const dealt = 90 * deck.length + 500
  // L'aperçu : long en douce, bref en normale, aucun en experte
  const preview = ctx.byTier(Math.min(2600, 1100 + pairs * 230), 900, 0)
  ctx.after(dealt, () => {
    if (mem !== me) return
    if (!preview) { me.lock = false; return }
    me.cards.forEach(c => { c.up = true })
    ctx.after(preview + 400, () => {
      if (mem !== me) return
      me.cards.forEach(c => { c.up = false })
      ctx.after(420, () => { if (mem === me) me.lock = false })
    })
  })
}

function flipCard(me: State, c: Card | undefined) {
  if (!c || mem !== me || me.lock || c.up || c.matched) return
  c.up = true
  sfx('cloth', { vol: 0.45, rate: 1.4, spread: 0.1 })
  if (!me.first) { me.first = c; return }
  const first = me.first
  me.lock = true; me.moves++
  paintSide(me)
  if (first.key === c.key) {
    ctx.after(480, () => {
      if (mem !== me) return
      me.found++
      sfx('confirm', { vol: 0.7, rate: 1 + me.found * 0.04 })
      for (const cc of [first, c]) {
        cc.matched = true
        cc.jump = 0.001
        me.fx.burst({ x: cc.g.position.x, y: 0.3, z: cc.g.position.z },
          { count: 16, color: [0xFFD34D, 0x7BD88F, 0xFFFFFF], speed: 1.6, spread: 1, life: 0.8, size: 0.09, gravity: 2 })
      }
      // Après le saut, la paire file sur la pile (face visible)
      ctx.after(620, () => {
        if (mem !== me) return
        for (const cc of [first, c]) {
          cc.pos.set(me.pile.x + (Math.random() - 0.5) * 0.08, 0.04 + me.piled * 0.036, me.pile.z + (Math.random() - 0.5) * 0.08)
          me.piled++
        }
        sfx('whoosh', { vol: 0.3, rate: 1.3 })
      })
      me.first = null; me.lock = false
      if (me.found === me.pairs) {
        me.round++
        paintSide(me)
        if (me.round < me.rounds.length) {
          confetti()
          ctx.after(1500, () => { if (mem === me) void loadRound(me) })
        } else ctx.after(1100, () => { if (mem === me) finish(me) })
      }
    })
  } else {
    ctx.after(900, () => {
      if (mem !== me) return
      first.shake = 0.001; c.shake = 0.001
      sfx('drop', { vol: 0.35, rate: 0.85 })
      ctx.after(380, () => {
        if (mem !== me) return
        first.up = false; c.up = false
        me.first = null
        ctx.after(360, () => { if (mem === me) me.lock = false })
      })
    })
  }
}

function finish(me: State) {
  const perfect = me.rounds.reduce((a, b) => a + b, 0)
  const stars = me.moves <= perfect * 1.4 ? 3 : me.moves <= perfect * 2 ? 2 : 1
  ctx.finish({
    title: 'Toutes les paires trouvées !',
    msg: `Tu as terminé en ${me.moves} coups`,
    stars
  })
}

export const memory: GameDef = {
  id: 'memory', name: 'Memory', icon: '🃏', sq: 'sq-peach', cat: 'memoire',
  subtitle: 'Mémorise pendant l\'aperçu, puis retrouve les paires',
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="arena g3-arena mem-wrap" id="memWrap">
        <div class="tq-side mem-side">
          <div class="tq-moves" id="memMoves"></div>
          <div class="mem-dots" id="memDots"></div>
        </div>
      </div>`
    preloadSfx(['cloth', 'confirm', 'drop', 'whoosh'])
    const arena = $('memWrap')
    const hideLoader = loader(arena, 'memory')

    ;(async () => {
      const stage = await createStage(arena, {
        sky: '#3A2A20', cam: [0, 6, 2.2], target: [0, 0, 0], fov: 40,
        hemi: ['#FFF1DC', '#5A4030', 0.9],
        sun: { pos: [2.5, 7, 3.5], color: '#FFF3DE', intensity: 2.1, area: 7, far: 20 },
        fill: 0.4, exposure: 0.95
      })
      if (dead) { stage.dispose(); return }
      const T = stage.T
      // La table : un plateau de bois, une nappe à carreaux sous les cartes
      const table = new T.Mesh(new T.PlaneGeometry(40, 40), new T.MeshStandardMaterial({
        map: stage.keep(woodTex(T, '#8A5A34', 12)), roughness: 0.7
      }))
      table.rotation.x = -Math.PI / 2
      table.receiveShadow = true
      stage.scene.add(table)
      {
        const cc = document.createElement('canvas')
        cc.width = cc.height = 64
        const g = cc.getContext('2d')!
        g.fillStyle = '#E9DCC6'; g.fillRect(0, 0, 64, 64)
        g.fillStyle = 'rgba(96,140,170,.28)'; g.fillRect(0, 0, 32, 64); g.fillRect(0, 0, 64, 32)
        g.fillStyle = 'rgba(96,140,170,.18)'; g.fillRect(0, 0, 32, 32)
        const t = stage.keep(new T.CanvasTexture(cc))
        t.colorSpace = T.SRGBColorSpace
        t.wrapS = t.wrapT = T.RepeatWrapping
        t.repeat.set(20, 15)
        const cloth = new T.Mesh(new T.PlaneGeometry(13, 10), new T.MeshStandardMaterial({ map: t, roughness: 0.95, color: 0xBBAA99 }))
        cloth.rotation.x = -Math.PI / 2
        cloth.position.set(0.3, 0.002, 0)
        cloth.receiveShadow = true
        stage.scene.add(cloth)
      }
      const geo = buildGeo(T)
      const me: State = {
        stage, T,
        rounds: c.byTier([3, 4, 6], [4, 6, 8], [6, 8, 10]), round: 0, moves: 0,
        pairs: 0, found: 0, first: null, lock: true, deck: [], cards: [], dealt: 0,
        fx: particles(stage, 300), backTex: stage.keep(backTexture(T)), faceTex: new Map(),
        geo, bodyMat: new T.MeshStandardMaterial({ color: 0xFFFBF2, roughness: 0.6 }),
        pile: new T.Vector3(), piled: 0, gone: []
      }
      mem = me
      hideLoader()

      // Toucher une carte (on remonte du morceau touché jusqu'à la carte)
      const pick = picker(stage)
      const onDown = (e: PointerEvent) => {
        if (mem !== me || me.lock) return
        const hits = pick(e, me.cards.filter(x => !x.matched).map(x => x.g), true)
        if (!hits.length) return
        let o: import('three').Object3D | null = hits[0].object
        while (o && o.userData.card === undefined) o = o.parent
        if (o) flipCard(me, me.cards[o.userData.card as number])
      }
      stage.renderer.domElement.addEventListener('pointerdown', onDown)

      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __mem: unknown }).__mem = {
          get deck() { return me.deck }, get round() { return me.round }, get lock() { return me.lock },
          get rounds() { return me.rounds.length }, get dealt() { return me.dealt },
          flip: (i: number) => flipCard(me, me.cards[i])
        }
      }

      stage.start(dt => {
        if (mem !== me) return
        const step = dt * Math.PI / 0.32
        for (const cd of [...me.cards, ...me.gone]) {
          // Le retournement : la carte pivote sur son grand axe et se soulève au milieu
          const target = cd.up ? Math.PI : 0
          if (cd.ang !== target) cd.ang = cd.up ? Math.min(target, cd.ang + step) : Math.max(0, cd.ang - step)
          const lift = Math.sin(cd.ang) * 0.42
          const k = Math.min(1, dt * 7)
          cd.g.position.x += (cd.pos.x - cd.g.position.x) * k
          cd.g.position.z += (cd.pos.z - cd.g.position.z) * k
          let y = cd.pos.y + lift
          const baseY = cd.g.userData.baseY ?? cd.g.position.y
          cd.g.userData.baseY = baseY + (y - baseY) * k
          y = cd.g.userData.baseY
          // La joie d'une paire : deux petits bonds
          if (cd.jump > 0) {
            cd.jump += dt * 2.4
            y += Math.abs(Math.sin(cd.jump * Math.PI)) * 0.5 * Math.max(0, 1 - cd.jump / 2)
            if (cd.jump >= 2) cd.jump = 0
          }
          cd.g.position.y = y
          cd.g.rotation.z = cd.ang
          // Mauvaise paire : elle tremble
          if (cd.shake > 0) {
            cd.shake += dt
            cd.g.rotation.y = Math.sin(cd.shake * 48) * 0.12 * Math.max(0, 1 - cd.shake / 0.38)
            if (cd.shake >= 0.38) { cd.shake = 0; cd.g.rotation.y = 0 }
          }
        }
        // Les cartes parties hors de l'écran sont rendues au GPU
        for (let i = me.gone.length - 1; i >= 0; i--) {
          const cd = me.gone[i]
          if (cd.g.position.x > 11) {
            stage.scene.remove(cd.g)
            cd.g.traverse(o => {
              const m = o as import('three').Mesh
              if (m.isMesh && m.material !== me.bodyMat) (m.material as import('three').Material).dispose()
            })
            me.gone.splice(i, 1)
          }
        }
        me.fx.update(dt)
      })

      stage.keep({
        dispose() {
          stage.renderer.domElement.removeEventListener('pointerdown', onDown)
          me.fx.dispose()
          me.faceTex.forEach(t => t.dispose())
          geo.body.dispose(); geo.face.dispose()
          delete (window as { __mem?: unknown }).__mem
        }
      })
      void loadRound(me)
    })().catch(() => { hideLoader(); ctx.toast('La 3D n\'est pas disponible ici') })

    return () => {
      dead = true
      const me = mem
      mem = null
      if (me) { try { me.stage.dispose() } catch { /* déjà démonté */ } }
    }
  }
}
