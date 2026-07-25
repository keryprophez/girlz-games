import type { GameContext, GameDef } from '../core/types'
import { $, pick } from '../core/utils'
import { sBonk, sNope, sWin } from '../core/audio'
import { FX, fxAt, JUICE } from '../core/fx'
import { frameStyle, loadAtlas, FARM_ANIMALS, GREEN_GRASS, GREEN_TREES, type Atlas } from '../core/sprites'

/* Tape-Trous — les animaux de la ferme sortent de leur trou, on tape
   dessus… sauf le cactus, qui pique. Tous les visuels viennent des planches
   CC0 Kenney (`public/assets/`), plus un seul emoji dans le pré : arbres,
   nuages, herbe, animaux et cactus sont de vrais sprites. */

/** Décor du pré : arbres au fond, touffes d'herbe devant, nuages qui passent. */
function dressField(nature: Atlas) {
  const back = $('moleBack')
  const front = $('moleFront')
  const sky = $('moleSky')
  const put = (host: HTMLElement, frame: string, px: number, leftPct: number, bottom: number, z = 0) => {
    const el = document.createElement('span')
    el.className = 'mole-deco'
    el.setAttribute('style',
      `${frameStyle(nature, frame, px)};left:${leftPct}%;bottom:${bottom}px;z-index:${z}`)
    host.appendChild(el)
    return el
  }
  // Arbres : tailles et essences variées, ça évite l'effet papier peint
  const px = [92, 116, 80, 104]
  ;[5, 33, 64, 91].forEach((x, i) => put(back, GREEN_TREES[i % GREEN_TREES.length], px[i], x, -6))
  // Herbe : semée au hasard tout du long, devant les trous
  for (let i = 0; i < 22; i++) {
    put(front, GREEN_GRASS[i % GREEN_GRASS.length], 16 + Math.random() * 14,
      Math.random() * 97, -2 + Math.random() * 5)
  }
  // Un soleil dans un coin du ciel : ça ancre la scène pour un sprite de plus
  put(sky, 'sun', 44, 88, 58)
  // Nuages : deux suffisent, ils dérivent lentement en travers du ciel
  ;['cloud3', 'cloud6'].forEach((f, i) => {
    const c = put(sky, f, 70 + i * 24, 6 + i * 40, 12 + i * 26)
    c.style.animationDelay = `${-i * 19}s`
    c.classList.add('mole-cloud')
  })
}

let mole: any = null
let ctx: GameContext

/** Taille d'un sprite dans son trou — recalculée au montage et au redimensionnement. */
function spriteSize(): number {
  const h = mole?.holes[0]
  return Math.max(26, (h?.clientWidth || 120) * 0.54)
}

function popMole() {
  if (!mole.animals) return // les planches ne sont pas encore chargées
  const free = mole.holes.filter((h: any) => !h._busy)
  if (!free.length) return
  const h = pick(free) as any
  const isCactus = Math.random() < mole.cfg.cactus
  h._busy = true; h._isCactus = isCactus; h._whacked = false
  const peep = h.querySelector('.peep') as HTMLElement
  peep.setAttribute('style', isCactus
    ? frameStyle(mole.items, 'cactus', mole.px)
    : frameStyle(mole.animals, pick(FARM_ANIMALS), mole.px))
  h.classList.remove('bonk'); void h.offsetWidth
  h.classList.add('up')
  h._hideT = setTimeout(() => {
    h.classList.remove('up')
    setTimeout(() => { h._busy = false }, 180)
  }, mole.cfg.up)
}

function whack(h: any) {
  if (!mole || !mole.running || !h._busy || h._whacked || !h.classList.contains('up')) return
  h._whacked = true; clearTimeout(h._hideT)
  h.classList.remove('up'); h.classList.add('bonk')
  if (h._isCactus) { mole.score = Math.max(0, mole.score - 2); sNope(); ctx.toast('🌵 Aïe, ça pique ! -2') }
  else { mole.score++; sBonk(); fxAt(h, JUICE.warm, 12); FX.floatEl(h, '+1') }
  $('moleScore').textContent = '🔨 ' + mole.score
  setTimeout(() => { h.classList.remove('bonk'); h._busy = false }, 340)
}

function finish() {
  const score = mole ? mole.score : 0
  sWin()
  const th = ctx.byTier([14, 8], [20, 12], [26, 16])
  const stars = score >= th[0] ? 3 : score >= th[1] ? 2 : 1
  ctx.finish({ title: 'Animaux attrapés !', msg: `${ctx.playerName} en a attrapé ${score} 🐮`, stars, starsEarned: stars })
}

export const moleGame: GameDef = {
  id: 'mole', name: 'Tape-Trous', icon: '🔨', sq: 'sq-peach', cat: 'action',
  subtitle: 'Tape les animaux qui sortent… mais pas le cactus !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="moleScore">🔨 0</div>
      </div>
      <div class="tbar" style="max-width:470px"><div class="tfill" id="moleTimer"></div></div>
      <div id="moleField">
        <div class="mole-sky" id="moleSky"></div>
        <div class="mole-back" id="moleBack"></div>
        <div id="moleGrid"></div>
        <div class="mole-front" id="moleFront"></div>
      </div>`
    const cfg = c.byTier(
      { up: 1050, gap: 750, cactus: 0.12, multi: 0.1 },
      { up: 820, gap: 560, cactus: 0.2, multi: 0.25 },
      { up: 620, gap: 420, cactus: 0.28, multi: 0.4 }
    )
    mole = { score: 0, timeLeft: 30, cfg: { ...cfg }, holes: [], running: true, animals: null, items: null, px: 60 }
    const grid = $('moleGrid')
    grid.innerHTML = ''
    for (let i = 0; i < 9; i++) {
      const b = document.createElement('button') as any
      b.className = 'hole'
      b.innerHTML = `<div class="burrow"></div><div class="clip"><div class="peep"></div></div>` +
        `<div class="lip"></div><div class="pow">💥</div>`
      b._busy = false
      b.onpointerdown = () => whack(b) // pointerdown : zéro latence, aucun tap rapide perdu
      grid.appendChild(b); mole.holes.push(b)
    }

    const onResize = () => { if (mole) mole.px = spriteSize() }
    window.addEventListener('resize', onResize)

    let timer = 0
    const spawner = () => {
      if (!mole || !mole.running) return
      popMole()
      if (Math.random() < mole.cfg.multi) setTimeout(() => { if (mole && mole.running) popMole() }, 120)
      mole.spawnT = setTimeout(spawner, mole.cfg.gap * (0.7 + Math.random() * 0.6))
    }

    // Les planches se chargent à la demande : le chrono ne démarre qu'une fois prêtes,
    // sinon on perdrait les premières secondes à regarder des trous vides.
    Promise.all([loadAtlas('animals'), loadAtlas('items'), loadAtlas('nature')])
      .then(([animals, items, nature]: [Atlas, Atlas, Atlas]) => {
        if (!mole || !mole.running) return
        mole.animals = animals
        mole.items = items
        mole.px = spriteSize()
        dressField(nature)
        spawner()
        timer = window.setInterval(() => {
          if (!mole || !mole.running) return
          mole.timeLeft--
          $('moleTimer').style.width = (mole.timeLeft / 30) * 100 + '%'
          if (mole.timeLeft === 20 || mole.timeLeft === 10) {
            mole.cfg.up = Math.max(420, mole.cfg.up * 0.8)
            mole.cfg.gap = Math.max(300, mole.cfg.gap * 0.8)
            ctx.toast('Plus vite ! ⚡')
          }
          if (mole.timeLeft <= 0) finish()
        }, 1000)
      })
      .catch(() => ctx.toast('Les images n\'ont pas pu être chargées 😕'))

    return () => {
      window.removeEventListener('resize', onResize)
      if (mole) { mole.running = false; clearTimeout(mole.spawnT); mole = null }
      clearInterval(timer)
    }
  }
}
