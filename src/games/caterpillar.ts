import type { GameContext, GameDef } from '../core/types'
import { $, pick, rnd } from '../core/utils'
import { sCrunch, sNope, sWin, tone } from '../core/audio'
import { impact } from '../core/impact'
import {
  createStage, loadThree, loader, loadModel, fitModel,
  type Stage
} from '../core/three3d'

/* 🐛 La Chenille, en 3D — un snake incarné : une vraie chenille de sphères
   luisantes qui ondule sur un pré au soleil couchant, et de VRAIS fruits
   (modèles glTF) posés sur l'herbe. La logique de grille est inchangée —
   c'est elle qui fait le jeu — mais chaque segment GLISSE d'une case à
   l'autre au lieu de téléporter : la chenille serpente pour de vrai.

   L'enjeu ne change pas : se mordre coûte un cœur (et raccourcit), à zéro
   cœur c'est fini. Les bords ramènent de l'autre côté. La vitesse monte à
   chaque fruit — c'est elle qui finit par gagner. */

const COLS = 13
const ROWS = 11
const CELL = 0.3
const FRUITS = ['apple', 'strawberry', 'orange', 'pear', 'lemon']

const gx = (x: number) => (x - (COLS - 1) / 2) * CELL
const gz = (y: number) => (y - (ROWS - 1) / 2) * CELL

let cp: any = null
let ctx: GameContext

function placeFruit() {
  let x = 0, y = 0, tries = 0
  do { x = rnd(0, COLS - 1); y = rnd(0, ROWS - 1); tries++ }
  while (tries < 60 && cp.snake.some((s: any) => s.x === x && s.y === y))
  cp.fruit = { x, y, kind: pick(FRUITS) }
  for (const k of FRUITS) cp.fruitModels[k].visible = k === cp.fruit.kind
  cp.fruitGroup.position.set(gx(x), 0, gz(y))
}

function hud() {
  $('cpScore').textContent = `🍎 ${cp.eaten}`
  $('cpLives').textContent = '❤️'.repeat(Math.max(0, cp.lives)) || '—'
}

function setDir(x: number, y: number) {
  if (!cp || !cp.running) return
  // Pas de demi-tour sur place
  if (x === -cp.dir.x && y === -cp.dir.y) return
  cp.nextDir = { x, y }
}

function step() {
  if (!cp || !cp.running) return
  cp.dir = cp.nextDir
  const head = cp.snake[0]
  const nx = (head.x + cp.dir.x + COLS) % COLS
  const ny = (head.y + cp.dir.y + ROWS) % ROWS
  // Se mordre : ça coûte un cœur. À zéro, la partie s'arrête.
  const hitIdx = cp.snake.findIndex((s: any) => s.x === nx && s.y === ny)
  if (hitIdx > 0 && hitIdx < cp.snake.length - 1) {
    cp.lives--
    sNope()
    impact(0.7, { matter: 'pate' })
    hud()
    if (cp.lives <= 0) { finish(); return }
    // Il reste une vie : on raccourcit et on repart, sans temps mort
    cp.snake = cp.snake.slice(0, Math.max(4, Math.floor(cp.snake.length / 2)))
    ctx.toast(`💔 Aïe ! ${'❤️'.repeat(cp.lives)}`)
  }
  cp.snake.unshift({ x: nx, y: ny })
  if (nx === cp.fruit.x && ny === cp.fruit.y) {
    cp.eaten++
    sCrunch(); tone(520 + cp.eaten * 22, 0.09, 'triangle', 0.12)
    impact(0.35, { matter: 'pate', noShake: true })
    hud()
    placeFruit()
    // La chenille accélère : c'est ça qui finit par avoir raison de la joueuse
    cp.speed = Math.max(cp.floor, cp.speed - 8)
    clearInterval(cp.timer)
    cp.timer = setInterval(step, cp.speed)
  } else {
    cp.snake.pop()
  }
}

function finish() {
  if (!cp || !cp.running) return
  cp.running = false
  clearInterval(cp.timer)
  sWin()
  const th = ctx.byTier([14, 7], [18, 9], [24, 12])
  const n = cp.eaten
  const stars = n >= th[0] ? 3 : n >= th[1] ? 2 : 1
  ctx.finish({
    title: n >= th[0] ? 'Chenille GÉANTE !' : n >= th[1] ? 'Belle chenille !' : 'Elle s\'est mordu la queue !',
    msg: `${ctx.playerName} a croqué ${n} fruit${n > 1 ? 's' : ''} 🐛`,
    stars: stars as 1 | 2 | 3, starsEarned: stars
  })
}

/** La tête : sphère + yeux + antennes, orientée selon la direction. */
function makeHead(T: any) {
  const g = new T.Group()
  const mat = new T.MeshStandardMaterial({ color: 0x4E8C3E, roughness: 0.55 })
  const skull = new T.Mesh(new T.SphereGeometry(CELL * 0.46, 20, 16), mat)
  skull.castShadow = true
  g.add(skull)
  const white = new T.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.3 })
  const dark = new T.MeshStandardMaterial({ color: 0x2A2A2A, roughness: 0.4 })
  for (const s of [-1, 1]) {
    const eye = new T.Mesh(new T.SphereGeometry(CELL * 0.13, 10, 8), white)
    eye.position.set(s * CELL * 0.18, CELL * 0.18, CELL * 0.34)
    const pupil = new T.Mesh(new T.SphereGeometry(CELL * 0.06, 8, 6), dark)
    pupil.position.set(s * CELL * 0.18, CELL * 0.18, CELL * 0.45)
    g.add(eye, pupil)
    // Antenne : tige penchée + boule au bout
    const stem = new T.Mesh(new T.CylinderGeometry(CELL * 0.025, 0.025 * CELL, CELL * 0.4, 6),
      new T.MeshStandardMaterial({ color: 0x5B8F4A, roughness: 0.7 }))
    stem.position.set(s * CELL * 0.2, CELL * 0.58, 0)
    stem.rotation.z = -s * 0.5
    const tip = new T.Mesh(new T.SphereGeometry(CELL * 0.07, 8, 6),
      new T.MeshStandardMaterial({ color: 0xE85D75, roughness: 0.5 }))
    tip.position.set(s * CELL * 0.3, CELL * 0.76, 0)
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
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="cpScore">🍎 0</div>
        <div class="chip" id="cpLives">❤️❤️❤️</div>
      </div>
      <div class="arena g3-arena cp3-arena" id="cpArena">
        <div class="hint g3-hint" id="cpHint">Glisse ton doigt pour la diriger ! 🐛</div>
      </div>`

    const arena = $('cpArena')
    const hideLoader = loader(arena, '🐛')

    ;(async () => {
      const T = await loadThree()
      if (dead) return
      const stage: Stage = await createStage(arena, {
        sky: '#1E3524',
        fog: [6.5, 15], fogColor: '#1E3524',
        cam: [0, 3.6, 2.6], target: [0, 0, -0.1], fov: 50,
        hemi: ['#FFE9C4', '#1C3020', 0.75],
        sun: { pos: [2.6, 5, 2.8], color: '#FFD9A0', intensity: 1.8, area: 4.5, far: 13 },
        fill: 0.35, exposure: 0.92, iblIntensity: 0.55
      })
      if (dead) { stage.dispose(); return }
      const scene = stage.scene

      /* Le plateau : pré en damier, entouré d'une bordure de terre.
         Le damier aide à lire les cases sans les compter. */
      const W = COLS * CELL, H = ROWS * CELL
      const base = new T.Mesh(
        new T.BoxGeometry(W + 0.1, 0.12, H + 0.1),
        new T.MeshStandardMaterial({ color: 0x3E7A42, roughness: 0.9 })
      )
      base.position.y = -0.06 - CELL * 0.3
      base.receiveShadow = true
      scene.add(base)
      const cellGeo = new T.PlaneGeometry(CELL, CELL)
      const cellMat = new T.MeshStandardMaterial({ color: 0x4E9152, roughness: 0.9 })
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        if ((x + y) % 2 !== 0) continue
        const m = new T.Mesh(cellGeo, cellMat)
        m.rotation.x = -Math.PI / 2
        m.position.set(gx(x), 0.001 - CELL * 0.3, gz(y))
        m.receiveShadow = true
        scene.add(m)
      }
      // Bordure de terre : quatre poutres brunes autour du pré
      const dirtMat = new T.MeshStandardMaterial({ color: 0x5C4230, roughness: 0.95 })
      const mkEdge = (w: number, d: number, px: number, pz: number) => {
        const e = new T.Mesh(new T.BoxGeometry(w, 0.16, d), dirtMat)
        e.position.set(px, -0.02 - CELL * 0.3, pz)
        e.castShadow = e.receiveShadow = true
        scene.add(e)
      }
      mkEdge(W + 0.42, 0.16, 0, -H / 2 - 0.13)
      mkEdge(W + 0.42, 0.16, 0, H / 2 + 0.13)
      mkEdge(0.16, H + 0.1, -W / 2 - 0.13, 0)
      mkEdge(0.16, H + 0.1, W / 2 + 0.13, 0)
      // Sol lointain, même vert sombre que le ciel pour fondre dans la brume
      const far = new T.Mesh(
        new T.PlaneGeometry(24, 24),
        new T.MeshStandardMaterial({ color: 0x18291B, roughness: 1 })
      )
      far.rotation.x = -Math.PI / 2
      far.position.y = -0.14 - CELL * 0.3
      scene.add(far)

      /* Les vrais fruits : cinq modèles chargés une fois, un seul visible */
      const fruitGroup = new T.Group()
      const fruitModels: Record<string, any> = {}
      for (const k of FRUITS) {
        const m = await loadModel('food', k)
        fitModel(T, m, 0.3)
        m.visible = false
        fruitModels[k] = m
        fruitGroup.add(m)
      }
      if (dead) { stage.dispose(); return }
      scene.add(fruitGroup)
      hideLoader()

      /* La chenille : la tête + un chapelet de sphères. Chaque mesh GLISSE
         vers sa case cible — le pas de grille reste net, le mouvement non. */
      const head = makeHead(T)
      scene.add(head)
      const segMeshes: any[] = []
      const segY = CELL * 0.05
      const ensureSegments = (n: number) => {
        while (segMeshes.length < n) {
          const m = new T.Mesh(
            new T.SphereGeometry(CELL * 0.46, 16, 12),
            new T.MeshStandardMaterial({ color: 0x5E9C4A, roughness: 0.6 })
          )
          m.castShadow = true
          m.visible = false
          scene.add(m)
          segMeshes.push(m)
        }
        while (segMeshes.length > n) {
          const m = segMeshes.pop()
          scene.remove(m)
          m.geometry.dispose(); m.material.dispose()
        }
        // Dégradé du vert vif (cou) au vert tendre (queue), queue plus fine.
        // setHSL travaille en espace LINÉAIRE par défaut : sans SRGBColorSpace,
        // une clarté de 0.45 ressort pastel-crème à l'écran (vu en capture).
        for (let i = 0; i < segMeshes.length; i++) {
          const t = i / Math.max(1, segMeshes.length - 1)
          segMeshes[i].material.color.setHSL((95 - t * 25) / 360, 0.55, 0.45 + t * 0.12, T.SRGBColorSpace)
          segMeshes[i].scale.setScalar(1 - t * 0.15)
        }
      }

      const midY = Math.floor(ROWS / 2)
      cp = {
        stage, fruitGroup, fruitModels,
        // Assez longue dès le départ pour pouvoir se mordre : sans ça les
        // premières dizaines de secondes sont sans aucun risque, donc sans tension.
        snake: Array.from({ length: 6 }, (_, i) => ({ x: 6 - i, y: midY })),
        dir: { x: 1, y: 0 }, nextDir: { x: 1, y: 0 },
        eaten: 0, lives: 3, running: true,
        speed: c.byTier(300, 250, 200),
        floor: c.byTier(150, 125, 100),
        fruit: { x: 0, y: 0, kind: 'apple' }
      }
      hud()
      placeFruit()
      // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
      if ((window as any).__BOT) (window as any).__cp = cp
      // La tête démarre pile sur sa case, les segments derrière
      head.position.set(gx(6), segY, gz(midY))
      cp.timer = setInterval(step, cp.speed)

      /* --- Boucle de rendu : glissement, ondulation, fruit qui frétille --- */
      stage.start((dt, now) => {
        if (!cp || !cp.running) return
        ensureSegments(cp.snake.length - 1)

        // Chaque maillon glisse vers sa case ; les bords téléportent (wrap)
        const k = Math.min(1, dt * 14)
        const glide = (mesh: any, cell: any, wob: number) => {
          const tx = gx(cell.x), tz = gz(cell.y)
          if (Math.hypot(mesh.position.x - tx, mesh.position.z - tz) > CELL * 2.5) {
            mesh.position.set(tx, mesh.position.y, tz)
          } else {
            mesh.position.x += (tx - mesh.position.x) * k
            mesh.position.z += (tz - mesh.position.z) * k
          }
          mesh.position.y = segY + Math.abs(Math.sin(now / 150 + wob)) * 0.025
        }
        glide(head, cp.snake[0], 0)
        head.rotation.y = Math.atan2(cp.dir.x, cp.dir.y)
        for (let i = 0; i < segMeshes.length; i++) {
          const m = segMeshes[i]
          if (!m.visible) {
            // Un segment neuf apparaît sur sa case, pas au centre du monde
            const cell = cp.snake[i + 1]
            m.position.set(gx(cell.x), segY, gz(cell.y))
            m.visible = true
          }
          glide(m, cp.snake[i + 1], (i + 1) * 0.7)
        }

        // Le fruit frétille pour attirer l'œil
        fruitGroup.rotation.y = now / 900
        fruitGroup.position.y = 0.02 + Math.sin(now / 300) * 0.02
      })

      /* Glisser dans une direction (n'importe où sur l'arène) */
      let start: { x: number; y: number } | null = null
      arena.onpointerdown = e => { start = { x: e.clientX, y: e.clientY } }
      arena.onpointermove = e => {
        if (!start) return
        const dx = e.clientX - start.x, dy = e.clientY - start.y
        if (Math.hypot(dx, dy) < 22) return
        $('cpHint').style.opacity = '0'
        if (Math.abs(dx) > Math.abs(dy)) setDir(Math.sign(dx), 0)
        else setDir(0, Math.sign(dy))
        start = { x: e.clientX, y: e.clientY }
      }
      arena.onpointerup = () => { start = null }
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'ArrowUp') setDir(0, -1)
        else if (e.key === 'ArrowDown') setDir(0, 1)
        else if (e.key === 'ArrowLeft') setDir(-1, 0)
        else if (e.key === 'ArrowRight') setDir(1, 0)
      }
      window.addEventListener('keydown', onKey)

      cp.cleanup = () => {
        window.removeEventListener('keydown', onKey)
        cellGeo.dispose(); cellMat.dispose()
        stage.dispose()
      }
    })().catch(() => { hideLoader(); ctx.toast('La 3D n\'est pas disponible ici 😕') })

    return () => {
      dead = true
      if (cp) {
        cp.running = false
        clearInterval(cp.timer)
        try { cp.cleanup?.() } catch { /* déjà démonté */ }
        cp = null
      }
    }
  }
}
