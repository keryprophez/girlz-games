import type { GameDef } from '../core/types'
import { $ } from '../core/utils'
import { impact } from '../core/impact'
import { loader } from '../core/three3d'
import { arcade, type Arcade } from '../core/arcade'
import { ICON } from '../core/icons'
import { sfx, preloadSfx, cry, preloadCries } from '../core/sfx'
import { isPaused } from '../core/session'

/* 🐤 Poussin Volant — refait en 2D illustrée le 25/09 (maquette validée).

   Le poussin rentre au poulailler : on tape pour battre des ailes, on passe
   entre les poteaux de la clôture, on attrape les grains de maïs qui brillent
   au milieu des passages ; au bout de la barre de chemin, maman poule
   l'attend devant le poulailler (elle glousse : la vraie voix de la poule).

   « Le plus punitif pour Jade » (audit du 2/09) : un choc ne tue plus. Il
   coûte un cœur, le poussin est étourdi et clignote un moment sans rien
   risquer ; en douce le passage est plus large et le vol plus lent. Frôler un
   poteau sans le toucher fait « ouf ». La cadence monte avec les poteaux
   passés (tous les quatre), jamais avec le temps.

   Rendu : un canvas 2D, le décor en couches qui défilent (nuages, panorama
   de la ferme), les illustrations Canva de `public/assets/poussin/`. Les
   distances sont en hauteurs d'arène (H) : le jeu est le même sur toute
   taille d'écran. */

const base = import.meta.env.BASE_URL
const SRC: Record<string, string> = Object.fromEntries(
  ['vole-haut', 'vole-bas', 'etourdi', 'plume', 'poule', 'poulailler', 'poteau-haut', 'grain', 'nuage', 'panorama']
    .map(n => [n, `${base}assets/poussin/${n}.webp`])
)

/** Réglages par niveau (en hauteurs d'arène). */
const CFG = {
  easy: { speed: 0.42, gap: 0.5, space: 1.75, grav: 3.7, flap: 1.18, goal: 12, lives: 5 },
  med: { speed: 0.5, gap: 0.42, space: 1.55, grav: 4.3, flap: 1.25, goal: 16, lives: 3 },
  exp: { speed: 0.58, gap: 0.36, space: 1.4, grav: 4.6, flap: 1.3, goal: 20, lives: 3 }
}
const R = 0.05          // rayon du poussin (H)
const PW = 0.1          // largeur d'un poteau (H)
const CHICK_X = 0.27    // position du poussin (fraction de la largeur)

interface Pair { x: number; lo: number; hi: number; grain: boolean; passed: boolean; minClear: number }
interface Feather { x: number; y: number; vx: number; vy: number; a: number; va: number; life: number }

interface State {
  arena: HTMLElement
  cv: HTMLCanvasElement
  g: CanvasRenderingContext2D
  img: Record<string, HTMLImageElement>
  cfg: typeof CFG.easy
  W: number; H: number; dpr: number
  /** Abscisse du poussin (px) : fixe en vol, il rejoint maman poule à l'arrivée. */
  cx: number
  /** Hauteur du poussin au-dessus du sol et vitesse verticale (H, vers le haut). */
  y: number
  vy: number
  started: boolean
  flapT: number
  dizzy: number
  invuln: number
  pairs: Pair[]
  feathers: Feather[]
  sparks: { x: number; y: number; life: number }[]
  /** Défilement : décalages des couches (px) et vitesse courante (H/s). */
  scroll: number
  speed: number
  passed: number
  home: number | null
  landed: number
  over: boolean
  won: boolean
  spin: number
  game: Arcade
  raf: number
  last: number
  hint: HTMLElement | null
}

let fl: State | null = null

/** Le sol : le bas de l'arène moins la bande d'herbe du panorama. */
const groundPx = (me: State) => me.H * 0.955
/** Une hauteur au-dessus du sol (H) → une ordonnée à l'écran (px). */
const toY = (me: State, h: number) => groundPx(me) - h * me.H
const ceil = (me: State) => groundPx(me) / me.H - R

function flap(me: State) {
  if (me.over || me.home !== null && me.landed > 0) return
  if (!me.started) { me.started = true; if (me.hint) { me.hint.remove(); me.hint = null } }
  me.vy = me.cfg.flap
  me.flapT = 1
  sfx('cloth', { vol: 0.45, rate: 1.6, spread: 0.1 })
}

function puff(me: State, n: number) {
  const x = me.cx, y = toY(me, me.y)
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 160
    me.feathers.push({ x, y, vx: Math.cos(a) * sp - 40, vy: Math.sin(a) * sp - 60, a: Math.random() * 6, va: (Math.random() - 0.5) * 8, life: 0.9 + Math.random() * 0.5 })
  }
}

function hurt(me: State, what: 'sol' | 'bois') {
  if (me.over || me.invuln > 0) return
  impact(0.8, { matter: what === 'sol' ? 'sourd' : 'bois', noShake: true })
  puff(me, 8)
  me.game.flash(ICON.heartEmpty, 'bad')
  if (me.game.hurt()) { finish(me, false); return }
  me.invuln = 1.6
  me.dizzy = 0.9
}

function finish(me: State, won: boolean) {
  if (me.over) return
  me.over = true
  me.won = won
  const s = me.game.s
  me.game.end({
    title: won ? 'Maman poule est là !' : 'Le poussin est tombé !',
    msg: `Tu as attrapé ${s.score} grain${s.score > 1 ? 's' : ''}`,
    outroMs: won ? 1800 : 1300
  })
}

function spawnPair(me: State) {
  const gap = Math.max(me.cfg.gap - 0.08, me.cfg.gap - 0.01 * me.game.s.level)
  const top = ceil(me) - 0.06
  const lo = 0.12 + Math.random() * Math.max(0.05, top - gap - 0.12)
  me.pairs.push({ x: me.W + PW * me.H, lo, hi: lo + gap, grain: Math.random() < 0.7, passed: false, minClear: 9 })
}

/* ---------- La boucle ---------- */

function update(me: State, dt: number) {
  const { H, W } = me
  // Le monde défile ; à l'arrivée, il ralentit jusqu'à s'arrêter devant le poulailler
  if (me.home !== null && me.home <= W * 0.72) me.speed = Math.max(0, me.speed - dt * 0.6)
  const dx = me.started && !me.over ? me.speed * H * dt : (me.over ? me.speed * H * dt * 0.4 : 0)
  me.scroll += dx
  if (me.home !== null) me.home -= dx

  if (me.landed > 0 && me.home !== null) me.cx += (me.home - H * 0.34 * 0.4 - H * 0.16 - me.cx) * Math.min(1, dt * 2)
  else me.cx = W * CHICK_X
  if (me.started) {
    if (me.landed > 0) {
      // L'atterrissage : le poussin plane doucement vers maman poule
      me.landed += dt
      me.y += (0.07 - me.y) * Math.min(1, dt * 2.5)
      me.vy = 0
    } else {
      me.vy -= me.cfg.grav * dt
      me.y += me.vy * dt
    }
  } else me.y = 0.45 + Math.sin(performance.now() * 0.004) * 0.02

  if (me.over && !me.won) { me.spin += dt * 9 }
  if (me.y > ceil(me)) { me.y = ceil(me); me.vy = Math.min(me.vy, 0) }
  if (me.y < R) {
    me.y = R
    if (me.started && !me.over && me.landed === 0) { hurt(me, 'sol'); me.vy = me.cfg.flap }
    else me.vy = 0
  }
  me.invuln = Math.max(0, me.invuln - dt)
  me.dizzy = Math.max(0, me.dizzy - dt)
  me.flapT = Math.max(0, me.flapT - dt * 4)

  // Les poteaux : apparition, passage, collision, grains
  if (me.started && !me.over && me.home === null) {
    const lastPair = me.pairs[me.pairs.length - 1]
    const spawned = me.passed + me.pairs.filter(p => !p.passed).length
    if (spawned < me.cfg.goal && (!lastPair || lastPair.x < W + PW * H - me.cfg.space * H)) spawnPair(me)
    // Plus de poteaux : le poulailler arrive
    if (spawned >= me.cfg.goal && me.pairs.every(p => p.passed)) me.home = W + H * 0.3
  }
  const cxp = me.cx
  for (let i = me.pairs.length - 1; i >= 0; i--) {
    const p = me.pairs[i]
    p.x -= dx
    const half = PW * H / 2
    const inX = p.x + half * 0.8 > cxp - R * H && p.x - half * 0.8 < cxp + R * H
    if (inX && !me.over) {
      p.minClear = Math.min(p.minClear, me.y - R - p.lo, p.hi - (me.y + R))
      if (me.y - R < p.lo || me.y + R > p.hi) { hurt(me, 'bois'); if (fl !== me) return; me.vy = Math.max(me.vy, 0.4) }
    }
    // Le grain, au milieu du passage
    if (p.grain && !me.over && Math.abs(p.x - cxp) < (R + 0.035) * H && Math.abs(me.y - (p.lo + p.hi) / 2) < R + 0.05) {
      p.grain = false
      me.game.hit(1, { silent: true })
      sfx('pluck', { vol: 0.6, rate: 1.3 })
      me.sparks.push({ x: p.x, y: toY(me, (p.lo + p.hi) / 2), life: 0.5 })
    }
    if (!p.passed && p.x + half < cxp - R * H) {
      p.passed = true
      me.passed++
      if (!me.over) {
        impact(0.2, { matter: 'neige', noShake: true })
        // Le « ouf » : passé à un cheveu
        if (p.minClear < 0.03) { sfx('whoosh', { vol: 0.45, rate: 1.2 }); me.game.flash(ICON.bolt); puff(me, 3) }
        // La cadence monte avec les poteaux passés
        if (me.passed % 4 === 0) me.speed = Math.min(me.cfg.speed * 1.35, me.speed * 1.06)
      }
    }
    if (p.x < -PW * H) me.pairs.splice(i, 1)
  }
  me.game.s.level = Math.floor(me.passed / 4)

  // L'arrivée : le poulailler devant, maman poule glousse, le poussin se pose
  if (me.home !== null && me.home <= W * 0.74 && me.landed === 0 && !me.over) {
    me.landed = 0.001
    cry('poule', { vol: 0.8 })
    sfx('confirm', { vol: 0.7, rate: 1.1 })
    me.game.after(1600, () => { if (fl === me) finish(me, true) })
  }

  for (let i = me.feathers.length - 1; i >= 0; i--) {
    const f = me.feathers[i]
    f.vy += 140 * dt; f.vx *= 0.97
    f.x += f.vx * dt; f.y += f.vy * dt; f.a += f.va * dt; f.life -= dt
    if (f.life <= 0) me.feathers.splice(i, 1)
  }
  for (let i = me.sparks.length - 1; i >= 0; i--) { me.sparks[i].life -= dt; if (me.sparks[i].life <= 0) me.sparks.splice(i, 1) }
}

function drawImg(g: CanvasRenderingContext2D, im: HTMLImageElement, x: number, y: number, w: number, h = w, rot = 0, alpha = 1) {
  g.save()
  g.globalAlpha = alpha
  g.translate(x, y); g.rotate(rot)
  g.drawImage(im, -w / 2, -h / 2, w, h)
  g.restore()
}

/** Un poteau étiré par le milieu : la pointe et le pied gardent leur forme. */
function drawPost(g: CanvasRenderingContext2D, im: HTMLImageElement, x: number, top: number, bottom: number, w: number, flip: boolean) {
  const sw = im.naturalWidth, sh = im.naturalHeight
  const capS = sh * 0.14, footS = sh * 0.035
  const k = w / sw, cap = capS * k, foot = footS * k
  const h = bottom - top
  g.save()
  if (flip) { g.translate(0, top + bottom); g.scale(1, -1) }
  g.drawImage(im, 0, 0, sw, capS, x - w / 2, top, w, cap)
  g.drawImage(im, 0, capS, sw, sh - capS - footS, x - w / 2, top + cap - 0.5, w, Math.max(0, h - cap - foot) + 1)
  g.drawImage(im, 0, sh - footS, sw, footS, x - w / 2, bottom - foot, w, foot)
  g.restore()
}

function draw(me: State, now: number) {
  const { g, dpr, W, H, img } = me
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, W, H)

  // Les nuages, très loin ; le panorama de la ferme, loin
  const nw = H * 0.22
  for (let k = 0; k < 4; k++) {
    const span = W + nw * 2
    const x = ((k * span / 4 + W * 0.1 - me.scroll * 0.12) % span + span) % span - nw
    drawImg(g, img.nuage, x, H * (0.2 + (k % 3) * 0.1), nw * (0.8 + (k % 2) * 0.3), nw * 0.7 * (0.8 + (k % 2) * 0.3))
  }
  const ph = H * 0.38, pw = img.panorama.naturalWidth * ph / img.panorama.naturalHeight
  const off = (me.scroll * 0.35) % pw
  for (let x = -off; x < W; x += pw) g.drawImage(img.panorama, x, H - ph, pw + 1, ph)

  // Les poteaux, le grain qui brille au milieu du passage
  const gy = groundPx(me)
  for (const p of me.pairs) {
    const w = PW * H
    drawPost(g, img['poteau-haut'], p.x, -w * 0.4, toY(me, p.hi), w, true)
    drawPost(g, img['poteau-haut'], p.x, toY(me, p.lo), gy + w * 0.15, w, false)
    if (p.grain) {
      const y = toY(me, (p.lo + p.hi) / 2)
      const glow = g.createRadialGradient(p.x, y, 0, p.x, y, H * 0.06)
      glow.addColorStop(0, 'rgba(255,226,122,.75)'); glow.addColorStop(1, 'rgba(255,226,122,0)')
      g.fillStyle = glow
      g.beginPath(); g.arc(p.x, y, H * 0.06, 0, Math.PI * 2); g.fill()
      drawImg(g, img.grain, p.x, y + Math.sin(now / 250 + p.x) * 3, H * 0.055)
    }
  }
  for (const s of me.sparks) {
    g.fillStyle = `rgba(255,211,77,${s.life * 2})`
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2, d = (0.5 - s.life) * H * 0.2
      g.beginPath(); g.arc(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, 4, 0, Math.PI * 2); g.fill()
    }
  }

  // Le poulailler et maman poule, à l'arrivée
  if (me.home !== null) {
    const hs = H * 0.34
    drawImg(g, img.poulailler, me.home + hs * 0.35, gy - hs * 0.46, hs)
    drawImg(g, img.poule, me.home - hs * 0.4, gy - H * 0.1, H * 0.22)
    if (me.landed > 0) {
      for (let k = 0; k < 6; k++) {
        const t = (me.landed * 0.6 + k / 6) % 1
        g.globalAlpha = 1 - t
        g.fillStyle = '#FF5A6E'
        const x = me.home - hs * 0.3 + Math.sin(k * 2 + t * 6) * 30, y = gy - H * 0.2 - t * H * 0.25
        g.beginPath()
        const s = H * 0.014
        g.moveTo(x, y + s); g.bezierCurveTo(x - s * 2.2, y - s * 0.6, x - s, y - s * 2, x, y - s * 0.8)
        g.bezierCurveTo(x + s, y - s * 2, x + s * 2.2, y - s * 0.6, x, y + s); g.fill()
      }
      g.globalAlpha = 1
    }
  }

  // Les plumes
  for (const f of me.feathers) drawImg(g, img.plume, f.x, f.y, H * 0.035, H * 0.035, f.a, Math.min(1, f.life))

  // Le poussin : ailes hautes / basses, étourdi après un choc, clignotant tant qu'il est protégé
  const x = me.cx, y = toY(me, me.y)
  const blinkOff = me.invuln > 0 && Math.floor(now / 90) % 2 === 0
  if (!blinkOff) {
    const sprite = me.dizzy > 0 ? img.etourdi : (me.flapT > 0.5 || (!me.started && Math.floor(now / 200) % 2 === 0) ? img['vole-haut'] : img['vole-bas'])
    const tilt = me.over && !me.won ? me.spin : me.landed > 0 ? 0 : Math.max(-0.5, Math.min(0.35, -me.vy * 0.28))
    drawImg(g, sprite, x, y, H * 0.17, H * 0.17, tilt)
  }
}

/* ---------- Le jeu ---------- */

export const flappy: GameDef = {
  id: 'flappy', name: 'Poussin Volant', icon: '🐤', sq: 'sq-lilac', cat: 'action',
  subtitle: 'Tape pour battre des ailes… jusqu\'au poulailler !',
  mount(c) {
    let dead = false
    const cleanups: (() => void)[] = []
    c.root.innerHTML = `
      <div id="flArea" class="arena fl2-arena">
        <canvas id="flCanvas"></canvas>
        <div class="fl2-track"><i id="flFill"></i><img id="flMe" src="${SRC['vole-haut']}" alt=""><img class="home" src="${SRC.poulailler}" alt=""></div>
      </div>`
    const area = $('flArea')
    const cv = $('flCanvas') as unknown as HTMLCanvasElement
    const hideLoader = loader(area, 'flappy')
    cleanups.push(hideLoader)
    preloadSfx(['cloth', 'whoosh', 'confirm', 'pluck', 'error'])
    preloadCries(['poule'])
    const cfg = CFG[c.tier]

    const names = Object.keys(SRC)
    Promise.all(names.map(n => { const im = new Image(); im.src = SRC[n]; return im.decode().then(() => im) })).then(imgs => {
      if (dead) return
      hideLoader()
      const img: Record<string, HTMLImageElement> = {}
      names.forEach((n, i) => { img[n] = imgs[i] })

      const game = arcade(c, {
        host: area,
        lives: cfg.lives,
        scoreIcon: `<img src="${SRC.grain}" alt="" style="width:1em;height:1em">`,
        plainScore: true,
        // Arriver chez maman poule, c'est déjà réussir : les étoiles comptent les cœurs gardés
        stars: s => !me.won ? 1 : s.lives >= s.maxLives ? 3 : 2
      })
      const me: State = {
        arena: area, cv, g: cv.getContext('2d')!, img, cfg,
        W: 0, H: 0, dpr: Math.min(2, window.devicePixelRatio || 1),
        cx: 0, y: 0.45, vy: 0, started: false, flapT: 0, dizzy: 0, invuln: 0,
        pairs: [], feathers: [], sparks: [], scroll: 0, speed: cfg.speed, passed: 0,
        home: null, landed: 0, over: false, won: false, spin: 0, game,
        raf: 0, last: performance.now(), hint: null
      }
      fl = me
      const size = () => {
        const W = area.clientWidth, H = area.clientHeight
        if (!W || !H || (W === me.W && H === me.H)) return
        me.W = W; me.H = H
        cv.width = Math.round(W * me.dpr); cv.height = Math.round(H * me.dpr)
      }
      size()
      const ro = new ResizeObserver(size)
      ro.observe(area)
      cleanups.push(() => ro.disconnect())

      const hint = document.createElement('div')
      hint.className = 'tap-hint'
      hint.innerHTML = ICON.tap
      area.appendChild(hint)
      me.hint = hint

      // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod.
      // Hauteurs en H au-dessus du sol, vers le haut.
      if ((window as unknown as { __BOT?: boolean }).__BOT) {
        ;(window as unknown as { __fl: unknown }).__fl = {
          get running() { return !me.over }, get started() { return me.started }, get y() { return me.y }, get vy() { return me.vy },
          get score() { return game.s.score }, get lives() { return game.s.lives }, get passed() { return me.passed },
          get goal() { return cfg.goal }, get landed() { return me.landed > 0 }, get won() { return me.won }, r: R,
          get pipes() { return me.pairs.filter(p => !p.passed).map(p => ({ dx: (p.x - me.W * CHICK_X) / me.H, lo: p.lo, hi: p.hi })) }
        }
      }

      const fill = $('flFill'), meIcon = $('flMe')
      const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.key === 'ArrowUp') { e.preventDefault(); flap(me) } }
      const onTap = (e: Event) => { e.preventDefault(); flap(me) }
      area.addEventListener('pointerdown', onTap)
      window.addEventListener('keydown', onKey)
      cleanups.push(() => { area.removeEventListener('pointerdown', onTap); window.removeEventListener('keydown', onKey) })

      const loop = (now: number) => {
        if (fl !== me) return
        me.raf = requestAnimationFrame(loop)
        const dt = Math.min(0.05, (now - me.last) / 1000)
        me.last = now
        if (isPaused()) return
        size()
        game.tick(dt)
        update(me, dt)
        draw(me, now)
        const prog = Math.min(1, me.passed / cfg.goal)
        fill.style.width = prog * 100 + '%'
        meIcon.style.left = prog * 100 + '%'
      }
      me.raf = requestAnimationFrame(loop)
    }).catch(err => { if (!dead) throw err })

    return () => {
      if (dead) return
      dead = true
      cleanups.forEach(fn => fn())
      if (fl) { cancelAnimationFrame(fl.raf); fl.game.dispose(); fl = null }
    }
  }
}
