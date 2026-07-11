import type { GameContext, GameDef } from '../core/types'
import { $, shuffle } from '../core/utils'
import { sGood, sNope, sPop, sWin, tone } from '../core/audio'
import { fxAt, JUICE } from '../core/fx'

let mg: any = null
let ctx: GameContext

function size() {
  const L = mg.level
  return ctx.byTier(L <= 4 ? 3 : 4, L <= 3 ? 3 : L <= 6 ? 4 : 5, L <= 2 ? 3 : L <= 5 ? 4 : 5)
}
function count() {
  return Math.min(size() * size() - 1, ctx.byTier(mg.level + 1, mg.level + 2, mg.level + 2))
}

function loadLevel() {
  if (!mg || !mg.running) return
  const s = size(), k = count()
  $('mgLevel').textContent = 'Niveau ' + mg.level
  $('mgSub').textContent = "Regarde les cases qui s'allument… 👀"
  const grid = $('mgGrid')
  grid.style.gridTemplateColumns = `repeat(${s},minmax(0,1fr))`
  grid.style.maxWidth = s * 86 + 'px'
  grid.style.width = '100%'
  grid.innerHTML = ''
  mg.pattern = new Set(shuffle([...Array(s * s).keys()]).slice(0, k))
  mg.found = new Set(); mg.lock = true
  const tiles: any[] = []
  for (let i = 0; i < s * s; i++) {
    const t = document.createElement('button') as any
    t.className = 'mgt'; t._i = i
    t.onclick = () => tap(t)
    grid.appendChild(t); tiles.push(t)
  }
  mg.t1 = setTimeout(() => {
    if (!mg || !mg.running) return
    tiles.forEach(t => { if (mg.pattern.has(t._i)) t.classList.add('flash') })
    tone(700, 0.12, 'triangle', 0.12)
    mg.t2 = setTimeout(() => {
      if (!mg || !mg.running) return
      tiles.forEach(t => t.classList.remove('flash'))
      mg.lock = false
      $('mgSub').textContent = 'À toi : retrouve les cases ! (' + k + ')'
    }, ctx.byTier(1300, 1050, 850) + k * 90)
  }, 500)
}

function tap(t: any) {
  if (!mg || !mg.running || mg.lock || t.classList.contains('hit')) return
  if (mg.pattern.has(t._i)) {
    t.classList.add('hit'); mg.found.add(t._i); sPop()
    fxAt(t, JUICE.blue, 8)
    if (mg.found.size === mg.pattern.size) {
      mg.lock = true; sGood()
      mg.level++
      setTimeout(() => mg && mg.running && loadLevel(), 700)
    }
  } else {
    t.classList.add('miss'); mg.lock = true; sNope()
    document.querySelectorAll<any>('.mgt').forEach(x => { if (mg.pattern.has(x._i)) x.classList.add('flash') })
    mg.lives--
    $('mgHearts').textContent = '❤️'.repeat(mg.lives) + '🖤'.repeat(3 - mg.lives)
    if (mg.lives <= 0) setTimeout(finish, 900)
    else setTimeout(() => mg && mg.running && loadLevel(), 1100)
  }
}

function finish() {
  const level = mg ? mg.level : 1
  sWin()
  const th = ctx.byTier([6, 4], [7, 5], [8, 6])
  const stars = level >= th[0] ? 3 : level >= th[1] ? 2 : 1
  ctx.finish({ title: 'Sacrée mémoire !', msg: `${ctx.playerName} a atteint le niveau ${level} 🟩`, stars, starsEarned: stars })
}

export const memogrid: GameDef = {
  id: 'memogrid', name: 'Mémo Grille', icon: '🟩', sq: 'sq-mint', cat: 'memoire',
  subtitle: 'Retiens les cases qui s\'allument',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="hearts" id="mgHearts">❤️❤️❤️</div>
        <div class="chip" id="mgLevel">Niveau 1</div>
      </div>
      <div class="gsub" id="mgSub">Regarde les cases qui s'allument…</div>
      <div id="mgGrid"></div>`
    mg = { level: 1, lives: 3, running: true, lock: true }
    loadLevel()
    return () => {
      if (mg) { mg.running = false; clearTimeout(mg.t1); clearTimeout(mg.t2); mg = null }
    }
  }
}
