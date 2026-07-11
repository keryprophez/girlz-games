import type { GameContext, GameDef } from '../core/types'
import { $, pick } from '../core/utils'
import { sGood, sNope, sWin } from '../core/audio'
import { fxAt, JUICE } from '../core/fx'

const FISHES = ['🐟', '🐠', '🐡', '🦐', '🦀', '🐙', '🦞']
let fish: any = null
let ctx: GameContext

function placeZone() {
  fish.zoneX = 0.08 + Math.random() * (0.84 - fish.zoneW)
  const z = $('fZone')
  z.style.left = fish.zoneX * 100 + '%'
  z.style.width = fish.zoneW * 100 + '%'
}

function loop(t: number) {
  if (!fish || !fish.running) return
  const dt = Math.min(50, t - fish.lastT); fish.lastT = t
  if (!fish.lock) {
    fish.pos += fish.dir * fish.speed * dt
    if (fish.pos >= 1) { fish.pos = 1; fish.dir = -1 }
    if (fish.pos <= 0) { fish.pos = 0; fish.dir = 1 }
    $('fCursor').style.left = `calc(${fish.pos * 100}% - 3px)`
  }
  requestAnimationFrame(loop)
}

function hookAttempt() {
  if (!fish || !fish.running || fish.lock) return
  fish.lock = true
  const inZone = fish.pos >= fish.zoneX && fish.pos <= fish.zoneX + fish.zoneW
  const face = $('pondFace')
  if (inZone) {
    fish.score++; sGood()
    fxAt(face, JUICE.blue, 16)
    face.textContent = pick(FISHES)
    face.classList.remove('caught'); void face.offsetWidth; face.classList.add('caught')
    $('fishScore').textContent = '🐟 ' + fish.score
    fish.speed *= 1.07
    fish.zoneW = Math.max(0.08, fish.zoneW * 0.90)
  } else {
    fish.lives--; sNope()
    face.textContent = '💧'
    $('fishHearts').textContent = '❤️'.repeat(fish.lives) + '🖤'.repeat(3 - fish.lives)
    if (fish.lives <= 0) { setTimeout(finish, 500); return }
  }
  setTimeout(() => { if (fish) { placeZone(); fish.lock = false } }, 450)
}

function finish() {
  const score = fish ? fish.score : 0
  sWin()
  const th = ctx.byTier([8, 5], [9, 6], [10, 7])
  const stars = score >= th[0] ? 3 : score >= th[1] ? 2 : 1
  ctx.finish({ title: 'Belle pêche !', msg: `${ctx.playerName} a attrapé ${score} poissons 🎣`, stars, starsEarned: stars })
}

export const fishGame: GameDef = {
  id: 'fish', name: 'Pêche Précise', icon: '🎣', sq: 'sq-sun', cat: 'action',
  subtitle: 'Stoppe le curseur dans la zone verte !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="hearts" id="fishHearts">❤️❤️❤️</div>
        <div class="chip" id="fishScore">🐟 0</div>
      </div>
      <div class="panel" id="fishPond">
        <div class="pondface" id="pondFace">🐟</div>
        <div class="fbar" id="fBar">
          <div class="fzone" id="fZone"></div>
          <div class="fcursor" id="fCursor"></div>
        </div>
        <button class="fbtn" id="fBtn">Ferre ! 🎣</button>
      </div>`
    fish = {
      score: 0, lives: 3, running: true,
      pos: 0, dir: 1, lastT: performance.now(),
      speed: c.byTier(0.00075, 0.00095, 0.00120),
      zoneW: c.byTier(0.26, 0.22, 0.18),
      zoneX: 0.4, lock: false
    }
    placeZone()
    const strike = () => hookAttempt()
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); strike() } }
    ;($('fBtn') as HTMLButtonElement).onclick = strike
    window.addEventListener('keydown', onKey)
    requestAnimationFrame(loop)
    return () => {
      if (fish) { fish.running = false; fish = null }
      window.removeEventListener('keydown', onKey)
    }
  }
}
