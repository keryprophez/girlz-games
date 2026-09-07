import type { GameContext, GameDef } from '../core/types'
import { $, pick } from '../core/utils'
import { impact } from '../core/impact'
import { loadAtlas, FARM_ANIMALS, type Atlas } from '../core/sprites'
import { createStage, loader, loadThree, picker, type Stage, type T3 } from '../core/three3d'
import { arcade, type Arcade } from '../core/arcade'
import { ground, decor, particles, camShake, standeeFromAtlas, faceCamera, type Particles, type CamShake } from '../core/scene3d'
import { ICON } from '../core/icons'
import { sfx, preloadSfx } from '../core/sfx'

/* Tape-Trous, refait le 2/09 — un pré en vraie 3D, des trous creusés dedans,
   et les animaux de la ferme (sprites Kenney, face caméra) qui en sortent.
   On tape dessus… sauf le cactus, qui pique.

   La boucle :
   - taper un animal SORTI = points × combo ; taper un cactus = un cœur ;
   - taper un trou VIDE casse le combo (fini le martelage au hasard) ;
   - un animal qui redescend sans être tapé casse le combo, et à partir du
     3ᵉ cran de difficulté il coûte un cœur : il faut le voir à temps ;
   - la rampe suit la performance : tous les 8 animaux, ils sortent moins
     longtemps, plus souvent, et plus nombreux à la fois. Pas de chrono : la
     partie finit quand les cœurs sont épuisés, et la seule façon de faire
     un gros score est d'être vraiment rapide.

   Troisième jeu sur core/arcade.ts + core/scene3d.ts. */

interface Hole {
  x: number
  z: number
  disc: import('three').Mesh
  hit: import('three').Mesh
  sprite: import('three').Mesh | null
  kind: 'animal' | 'cactus' | null
  /** down = vide ; rising/up/hiding = un habitant ; bonked = tapé. */
  phase: 'down' | 'rising' | 'up' | 'hiding' | 'bonked'
  /** Temps (simulé) passé dans la phase courante. */
  t: number
  upFor: number
  size: number
  /** La poussière de la chute a déjà giclé (phase bonked). */
  dusted?: boolean
  /** Largeur / hauteur du panneau. */
  aspect?: number
}

interface Cfg { up: number; gap: number; cactus: number; multi: number }

interface State {
  stage: Stage
  T: T3
  game: Arcade
  fx: Particles
  shake: CamShake
  holes: Hole[]
  animals: Atlas
  items: Atlas
  cfg: Cfg
  over: boolean
  tapHint: HTMLElement
}

let mo: State | null = null
let ctx: GameContext

const RISE_S = 0.22, HIDE_S = 0.2, BONK_S = 0.42
const SPRITE = 0.8

/** Un habitant sort d'un trou libre. */
function popOne(me: State) {
  const free = me.holes.filter(h => h.phase === 'down')
  if (!free.length) return
  const h = pick(free)
  const cactus = Math.random() < me.cfg.cactus
  const sp = cactus
    ? standeeFromAtlas(me.stage, me.items, 'cactus', SPRITE * 0.95)
    : standeeFromAtlas(me.stage, me.animals, pick(FARM_ANIMALS), SPRITE)
  // Un panneau debout, pieds au fond du trou : le sol cache ce qui est dessous
  sp.position.set(h.x, -SPRITE, h.z)
  faceCamera(me.stage, sp)
  me.stage.scene.add(sp)
  h.sprite = sp
  h.kind = cactus ? 'cactus' : 'animal'
  h.phase = 'rising'
  h.t = 0
  h.upFor = me.cfg.up / 1000 * (0.85 + Math.random() * 0.3)
  h.size = sp.scale.y
  h.aspect = sp.scale.x / sp.scale.y
  // De la terre qui gicle, et un petit « tic » : on entend sortir
  me.fx.burst({ x: h.x, y: 0.05, z: h.z }, { count: 8, color: [0x6B4A2A, 0x8A6238], speed: 1.4, life: 0.45, size: 0.05, spread: 0.8 })
  sfx('tick', { vol: 0.3, rate: 0.8 })
}

function hideOne(me: State, h: Hole, escaped: boolean) {
  if (escaped && h.kind === 'animal') {
    // Parti sans être tapé : le combo tombe, et dès le 3ᵉ cran ça coûte un cœur
    if (me.game.s.level >= 2) {
      me.game.flash(ICON.heartEmpty, 'bad')
      if (me.game.hurt()) { gameOver(me); return }
    } else me.game.miss()
  }
  h.phase = 'hiding'
  h.t = 0
}

function clearHole(me: State, h: Hole) {
  if (h.sprite) {
    me.stage.scene.remove(h.sprite)
    ;(h.sprite.material as import('three').Material).dispose()
    h.sprite.geometry.dispose()
    h.sprite = null
  }
  h.kind = null
  h.phase = 'down'
  h.t = 0
  h.dusted = false
}

function whack(me: State, h: Hole) {
  if (me.over) return
  const tappable = h.sprite && (h.phase === 'up' || (h.phase === 'rising' && h.t > RISE_S * 0.4))
  if (!tappable) {
    // Trou vide (ou déjà tapé) : ça casse le combo — taper partout ne paie plus
    me.game.miss()
    sfx('drop', { vol: 0.25, rate: 0.9 })
    me.fx.burst({ x: h.x, y: 0.05, z: h.z }, { count: 5, color: 0x8A6238, speed: 0.9, life: 0.35, size: 0.04 })
    return
  }
  const p = { x: h.x, y: h.size * 0.55, z: h.z }
  if (h.kind === 'cactus') {
    impact(0.8, { matter: 'sourd', noShake: true })
    me.shake.hit(0.7)
    me.fx.burst(p, { count: 18, color: [0x3E8E4E, 0x2B6B3A], speed: 2.4, life: 0.6, size: 0.07 })
    me.game.flash(ICON.heartEmpty, 'bad')
    h.phase = 'bonked'; h.t = 0
    if (me.game.hurt()) { gameOver(me); return }
    return
  }
  // Bonk ! Le combo monte, le son aussi
  sfx('bong', { vol: 0.7, rate: 1 + Math.min(10, me.game.s.combo) * 0.03 })
  impact(0.4, { matter: 'bois', noShake: true })
  me.shake.hit(0.15)
  me.fx.burst(p, { count: 16, color: [0xFFE08A, 0xFFB84D, 0xFFFFFF], speed: 2.2, life: 0.6, size: 0.08, gravity: 5 })
  me.game.hit(1, { silent: true })
  if (me.game.s.combo >= 5 && me.game.s.combo % 5 === 0) me.game.flash('×' + me.game.s.combo)
  h.phase = 'bonked'; h.t = 0
  me.tapHint.classList.add('off')
}

function gameOver(me: State) {
  if (me.over) return
  me.over = true
  // Outro : les animaux restants ressortent tous se moquer, au ralenti
  me.stage.timeScale = 0.55
  for (const h of me.holes) if (h.phase === 'down' && Math.random() < 0.6) popOne(me)
  const s = me.game.s
  const th = ctx.byTier([24, 12], [34, 18], [46, 24])
  me.game.end({
    title: s.score >= th[0] ? 'Quel coup d\'œil !' : s.score >= th[1] ? 'Animaux attrapés !' : 'Ils se sont sauvés !',
    msg: `${ctx.playerName} a marqué ${s.score} points` + (s.bestCombo >= 5 ? `, ${s.bestCombo} d'affilée` : ''),
    outroMs: 1300
  })
}

export const moleGame: GameDef = {
  id: 'mole', name: 'Tape-Trous', icon: '🔨', sq: 'sq-peach', cat: 'action', music: 'meadow',
  subtitle: 'Tape les animaux qui sortent… mais pas le cactus !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `<div class="arena g3-arena mo-arena" id="moArena"></div>`
    const arena = $('moArena')
    const hideLoader = loader(arena, '🔨')
    preloadSfx(['tick', 'bong', 'drop', 'error', 'pluck'])
    let dead = false

    ;(async () => {
      const [T, animals, items] = await Promise.all([loadThree(), loadAtlas('animals'), loadAtlas('items')])
      if (dead) return
      const stage = await createStage(arena, {
        sky: '#8FCDEB', fog: [14, 30], fogColor: '#B9E0F2',
        cam: [0, 4.3, 4.9], target: [0, 0.15, -0.35], fov: 42,
        hemi: ['#DFF3FF', '#4E7A3C', 1.0],
        sun: { pos: [3, 7, 4], color: '#FFF4D6', intensity: 2.0, area: 5, far: 22 },
        fill: 0.4, exposure: 1.0, iblIntensity: 0.5
      })
      if (dead) { stage.dispose(); return }
      const { scene } = stage

      ground(stage, { radius: 22, color: 0x4F8F3A, roughness: 0.98 })

      // La grille de trous : 3×2 en douce, 4×2 en normale, 4×3 en expert
      const [cols, rows] = c.byTier([3, 2], [4, 2], [4, 3])
      const sx = 1.2, sz = 1.05
      const holes: Hole[] = []
      const discGeo = new T.CircleGeometry(0.4, 28)
      const discMat = new T.MeshStandardMaterial({ color: 0x2A1A0E, roughness: 1 })
      const rimGeo = new T.TorusGeometry(0.42, 0.075, 8, 28)
      const rimMat = new T.MeshStandardMaterial({ color: 0x7A5233, roughness: 0.95 })
      const hitGeo = new T.CylinderGeometry(0.6, 0.6, 0.2, 12) // à plat : sert au « raté », les animaux se touchent sur leur sprite
      // Invisible mais raycastable : opacité 0 (material.visible=false est ignoré par certains raycasts)
      const hitMat = new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
        const x = (col - (cols - 1) / 2) * sx
        const z = (r - (rows - 1) / 2) * sz - 0.2
        const disc = new T.Mesh(discGeo, discMat)
        disc.rotation.x = -Math.PI / 2
        disc.position.set(x, 0.012, z)
        disc.receiveShadow = true
        const rim = new T.Mesh(rimGeo, rimMat)
        rim.rotation.x = -Math.PI / 2
        rim.scale.set(1, 1, 0.45)
        rim.position.set(x, 0.02, z)
        rim.castShadow = true
        const hit = new T.Mesh(hitGeo, hitMat)
        hit.position.set(x, 0.05, z)
        scene.add(disc, rim, hit)
        holes.push({ x, z, disc, hit, sprite: null, kind: null, phase: 'down', t: 0, upFor: 1, size: SPRITE })
      }

      // Le décor : une haie d'arbres derrière, une clôture, des fleurs et des
      // buissons autour du pré — jamais dans la grille
      const back = -3.6
      const items3d = [
        ...[-5.5, -3.2, -0.6, 1.9, 4.4, 6.6].map((x, i) => ({ model: `nature/${['tree_default', 'tree_oak', 'tree_fat', 'tree_detailed'][i % 4]}`, x, z: back - 1.4 - Math.random(), size: 2.2 + Math.random() * 1.2, tint: 0x6EAE48 })),
        ...[-4.5, -3, -1.5, 0, 1.5, 3, 4.5].map(x => ({ model: 'nature/fence_simple', x, z: back, size: 0.7, rot: 0, tint: 0xC9A874 })),
        ...[[-3.6, 1.6], [3.7, 1.4], [-3.9, -0.6], [3.9, -0.4], [-2.2, 2.1], [2.4, 2.2]].map(([x, z], i) => ({ model: `nature/${['flower_redA', 'flower_yellowA', 'flower_purpleA'][i % 3]}`, x, z, size: 0.36, tint: 0xFFFFFF })),
        ...[[-4.4, 0.6], [4.5, 0.8], [-3.2, -2.4], [3.4, -2.5]].map(([x, z]) => ({ model: 'nature/plant_bush', x, z, size: 0.55, tint: 0x6EAE48 }))
      ]
      decor(stage, items3d).catch(() => { /* sans décor, le jeu tourne */ })
      hideLoader()

      const tapHint = document.createElement('div')
      tapHint.className = 'tap-hint'
      tapHint.innerHTML = ICON.tap
      arena.appendChild(tapHint)

      const cfg: Cfg = c.byTier(
        { up: 1150, gap: 820, cactus: 0.1, multi: 0.1 },
        { up: 900, gap: 600, cactus: 0.18, multi: 0.25 },
        { up: 680, gap: 460, cactus: 0.25, multi: 0.4 }
      )
      const game = arcade(c, {
        host: arena,
        lives: c.byTier(5, 3, 3),
        scoreIcon: ICON.mallet,
        ramp: { every: 8, max: 8 },
        onLevel: () => {
          me.cfg.up = Math.max(380, me.cfg.up * 0.86)
          me.cfg.gap = Math.max(260, me.cfg.gap * 0.86)
          me.cfg.multi = Math.min(0.9, me.cfg.multi + 0.1)
          me.cfg.cactus = Math.min(0.32, me.cfg.cactus + 0.02)
          me.game.flash(ICON.bolt)
        },
        stars: s => { const th = c.byTier([24, 12], [34, 18], [46, 24]); return s.score >= th[0] ? 3 : s.score >= th[1] ? 2 : 1 }
      })
      const me: State = {
        stage, T, game, fx: particles(stage, 400), shake: camShake(stage),
        holes, animals, items, cfg: { ...cfg }, over: false, tapHint
      }
      mo = me

      // Qui sort, et quand : sur l'horloge simulée (pause, hoquets d'onglet)
      const spawner = () => {
        if (mo !== me || me.over) return
        popOne(me)
        if (Math.random() < me.cfg.multi) game.after(130, () => { if (mo === me && !me.over) popOne(me) })
        game.after(me.cfg.gap * (0.7 + Math.random() * 0.6), spawner)
      }
      spawner()

      // Un tap = un trou (raycast sur les colliders) — zéro latence, pointerdown
      const pick3 = picker(stage)
      const onDown = (e: PointerEvent) => {
        if (mo !== me) return
        // D'abord les animaux sortis (on tape sur la tête), sinon le trou visé
        const live = me.holes.filter(h => h.sprite && (h.phase === 'up' || h.phase === 'rising'))
        const onSprite = pick3(e, live.map(h => h.sprite!), false)
        if (onSprite.length) { whack(me, live.find(h => h.sprite === onSprite[0].object)!); return }
        const hits = pick3(e, me.holes.map(h => h.hit), false)
        if (!hits.length) return
        const h = me.holes.find(x => x.hit === hits[0].object)
        if (h) whack(me, h)
      }
      stage.renderer.domElement.addEventListener('pointerdown', onDown)

      // Accroche pour les bots de test : où sont les animaux sortis, à l'écran
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __mole: unknown }).__mole = {
          ready: () => me.holes.filter(h => h.sprite && h.kind === 'animal' && (h.phase === 'up' || h.phase === 'rising')).map(h => {
            const v = new T.Vector3(h.x, h.size * 0.45, h.z).project(stage.camera)
            const r = stage.renderer.domElement.getBoundingClientRect()
            return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }
          }),
          holes: () => me.holes.map(h => ({ phase: h.phase, kind: h.kind, t: Math.round(h.t * 100) / 100 })),
          over: () => me.over
        }
      }

      stage.start(dt => {
        if (mo !== me) return
        game.tick(dt)
        for (const h of me.holes) {
          if (!h.sprite) continue
          h.t += dt
          const sp = h.sprite
          const top = 0, bottom = -h.size // les pieds : au sol quand il est sorti, au fond du trou sinon
          // Un sprite plat qui glisse, c'est mort ; ce qui vit, c'est
          // l'étirement, l'écrasement, le dépassement et le petit balancement
          let sx = 1, sy = 1, y = top, rot = 0
          if (h.phase === 'rising') {
            const k = Math.min(1, h.t / RISE_S)
            const c1 = 1.7, c3 = c1 + 1 // sortie vive avec dépassement (ease-out-back)
            const e = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2)
            y = bottom + (top - bottom) * e
            const st = Math.sin(k * Math.PI)
            sy = 1 + st * 0.3; sx = 1 - st * 0.18 // étiré pendant la montée
            rot = Math.sin(k * Math.PI * 2) * 0.08
            if (k >= 1) { h.phase = 'up'; h.t = 0 }
          } else if (h.phase === 'up') {
            const left = h.upFor - h.t
            // Il respire, regarde à droite à gauche, et se moque juste avant de replonger
            y = top + Math.sin(h.t * 7) * 0.015
            sy = 1 + Math.sin(h.t * 7) * 0.03; sx = 1 - Math.sin(h.t * 7) * 0.03
            rot = Math.sin(h.t * 3.2) * 0.1
            if (left < 0.32) {
              const hop = Math.abs(Math.sin(h.t * 32))
              y += hop * 0.09; sy += hop * 0.12; sx -= hop * 0.08
              rot = Math.sin(h.t * 32) * 0.16
            }
            if (h.t >= h.upFor) hideOne(me, h, true)
          } else if (h.phase === 'hiding') {
            // Anticipation : un petit bond, puis plongeon
            const k = Math.min(1, h.t / HIDE_S)
            if (k < 0.3) { const a = k / 0.3; y = top + Math.sin(a * Math.PI) * 0.1; sy = 1 + a * 0.25; sx = 1 - a * 0.15 }
            else { const f = (k - 0.3) / 0.7; y = top + (bottom - top) * f * f; sy = 1.25 - f * 0.25; sx = 0.85 + f * 0.15 }
            if (k >= 1) clearHole(me, h)
          } else if (h.phase === 'bonked') {
            // Tapé : écrasé à plat, puis il dégringole dans le trou en vrille
            const k = Math.min(1, h.t / BONK_S)
            if (k < 0.22) { const a = k / 0.22; sy = 1 - a * 0.55; sx = 1 + a * 0.5; y = top - a * 0.12 }
            else {
              const f = (k - 0.22) / 0.78
              sy = 0.45 + Math.min(1, f * 3) * 0.55; sx = 1.5 - Math.min(1, f * 3) * 0.5
              y = top - 0.12 + (bottom - top + 0.12) * f * f
              rot = f * 1.3 * (h.x < 0 ? -1 : 1)
              if (f > 0.55 && !h.dusted) { h.dusted = true; me.fx.burst({ x: h.x, y: 0.06, z: h.z }, { count: 8, color: [0x6B4A2A, 0x8A6238], speed: 1.2, life: 0.4, size: 0.05, spread: 0.9 }) }
            }
            if (k >= 1) clearHole(me, h)
          }
          sp.position.y = y
          sp.scale.set(h.size * (h.aspect ?? 1) * sx, h.size * sy, 1)
          sp.rotation.z = rot // il se penche depuis les pieds
        }
        me.fx.update(dt)
        stage.camera.position.set(0, 4.3, 4.9)
        stage.camera.lookAt(0, 0.15, -0.35)
        me.shake.apply(dt)
      })

      stage.keep({ dispose() {
        stage.renderer.domElement.removeEventListener('pointerdown', onDown)
        discGeo.dispose(); discMat.dispose(); rimGeo.dispose(); rimMat.dispose(); hitGeo.dispose(); hitMat.dispose()
        me.fx.dispose()
        me.game.dispose()
      } })
    })().catch(err => { if (!dead) throw err })

    return () => {
      dead = true
      if (mo) { mo.stage.dispose(); mo = null }
    }
  }
}
