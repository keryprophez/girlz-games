import type { GameContext, GameDef } from '../core/types'
import { $, rnd, pick } from '../core/utils'
import { sGood, sPop, sWin } from '../core/audio'
import { fxAt, JUICE } from '../core/fx'

/* Le Miroir — la moitié gauche montre un motif de pixels, il faut peindre la
   moitié droite pour compléter la symétrie (axe vertical en pointillés).
   Zéro lecture : on voit, on tape, ça se complète. La symétrie est au
   programme de CP/CE1/CE2 — ici elle devient un jeu de coloriage. */

const COLORS = ['#FF6B81', '#4FB8E7', '#FFC94D']
let mr: any = null
let ctx: GameContext

function conf() {
  return ctx.byTier(
    { size: 6, cells: 6, colors: 1 },
    { size: 8, cells: 9, colors: 2 },
    { size: 10, cells: 13, colors: 3 }
  )
}

function makePattern() {
  const { size, cells, colors } = conf()
  const half = size / 2
  const target: Record<string, string> = {}
  let guard = 0
  while (Object.keys(target).length < cells && guard++ < 400) {
    const r = rnd(0, size - 1), c = rnd(0, half - 1)
    target[r + ':' + c] = COLORS[rnd(0, colors - 1)]
  }
  return target
}

function buildRound() {
  const { size, colors } = conf()
  const half = size / 2
  mr.target = makePattern()
  mr.state = {}
  mr.done = false
  $('mrRound').textContent = `Motif ${mr.round + 1}/${mr.rounds}`

  const grid = $('mrGrid')
  grid.innerHTML = ''
  grid.style.gridTemplateColumns = `repeat(${size},1fr)`
  mr.cells = {}
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const left = c < half
      const el = document.createElement(left ? 'div' : 'button') as any
      el.className = 'mr-cell' + (left ? ' mr-fixed' : '') + (c === half - 1 ? ' mr-axis' : '')
      if (left) {
        const col = mr.target[r + ':' + c]
        if (col) { el.style.background = col; el.classList.add('mr-on') }
      } else {
        el._r = r; el._c = c
        el.onclick = () => tapCell(el)
        mr.cells[r + ':' + c] = el
      }
      grid.appendChild(el)
    }
  }

  // Palette : visible seulement s'il y a plusieurs couleurs
  const pal = $('mrPal')
  pal.innerHTML = ''
  pal.style.display = colors > 1 ? '' : 'none'
  mr.color = COLORS[0]
  for (let i = 0; i < colors; i++) {
    const b = document.createElement('button')
    b.className = 'mr-chip' + (i === 0 ? ' sel' : '')
    b.style.background = COLORS[i]
    b.onclick = () => {
      mr.color = COLORS[i]
      pal.querySelectorAll('.mr-chip').forEach(x => x.classList.remove('sel'))
      b.classList.add('sel')
      sPop()
    }
    pal.appendChild(b)
  }
}

function tapCell(el: any) {
  if (!mr || !mr.running || mr.done) return
  const key = el._r + ':' + el._c
  const cur = mr.state[key] || ''
  const next = cur === mr.color ? '' : mr.color
  if (next) { mr.state[key] = next; el.style.background = next; el.classList.add('mr-on') }
  else { delete mr.state[key]; el.style.background = ''; el.classList.remove('mr-on') }
  sPop()
  // La bonne couleur au bon endroit ? Sinon on compte une hésitation
  const { size } = conf()
  const want = mr.target[el._r + ':' + (size - 1 - el._c)] || ''
  if (next && next !== want) mr.mistakes++
  checkDone()
}

function checkDone() {
  const { size } = conf()
  const half = size / 2
  for (let r = 0; r < size; r++) {
    for (let c = half; c < size; c++) {
      const want = mr.target[r + ':' + (size - 1 - c)] || ''
      const got = mr.state[r + ':' + c] || ''
      if (want !== got) return
    }
  }
  // Symétrie parfaite !
  mr.done = true
  sGood()
  fxAt($('mrGrid'), pick([JUICE.green, JUICE.blue, JUICE.warm]), 16)
  $('mrGrid').classList.add('mr-win')
  mr.round++
  setTimeout(() => {
    if (!mr || !mr.running) return
    $('mrGrid').classList.remove('mr-win')
    if (mr.round >= mr.rounds) return finish()
    buildRound()
  }, 1100)
}

function finish() {
  sWin()
  const stars = mr.mistakes <= 2 ? 3 : mr.mistakes <= 7 ? 2 : 1
  ctx.finish({
    title: 'Miroir, joli miroir !',
    msg: `${ctx.playerName} a complété ${mr.rounds} symétries 🪞`,
    stars, starsEarned: stars
  })
}

export const mirror: GameDef = {
  id: 'mirror', name: 'Le Miroir', icon: '🪞', sq: 'sq-lilac', cat: 'reflexion',
  subtitle: 'Peins la moitié droite pour compléter le reflet !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="topbar">
        <div class="chip" id="mrRound"></div>
        <div class="mr-pal" id="mrPal"></div>
      </div>
      <div class="mr-wrap"><div id="mrGrid"></div></div>`
    mr = { round: 0, rounds: 3, mistakes: 0, running: true }
    buildRound()
    return () => { if (mr) { mr.running = false; mr = null } }
  }
}
