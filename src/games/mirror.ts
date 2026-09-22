import type { GameContext, GameDef } from '../core/types'
import { rnd, pick } from '../core/utils'
import { sfx, preloadSfx } from '../core/sfx'
import { fxAt, JUICE } from '../core/fx'

/* Le Miroir — la moitié gauche montre un motif de pixels, il faut peindre la
   moitié droite pour compléter la symétrie (axe vertical en pointillés).
   Zéro lecture : on voit, on tape, ça se complète. La symétrie est au
   programme de CP/CE1/CE2 — ici elle devient un jeu de coloriage.

   Repris le 22/09 : plein écran, pots de couleur en colonne, manches en
   pastilles (plus de « Motif 1/3 »), on PEINT EN GLISSANT le doigt (le glissé
   s'écoute sur la fenêtre, piège connu), et le motif réussi se REPLIE comme
   un miroir : la moitié gauche pivote sur l'axe et vient se poser sur la
   droite — on voit que c'est le même dessin retourné. État typé. */

const COLORS = ['#FF6B81', '#4FB8E7', '#FFC94D']

interface Conf { size: number; cells: number; colors: number }
interface State {
  conf: Conf
  round: number
  rounds: number
  mistakes: number
  running: boolean
  done: boolean
  color: string
  target: Record<string, string>
  state: Record<string, string>
  cells: Record<string, HTMLElement>
  root: HTMLElement
  /** Le trait en cours : peindre ou effacer, et les cases déjà touchées. */
  stroke: { erase: boolean; seen: Set<string> } | null
}

let mr: State | null = null
let ctx: GameContext

const q = (me: State, sel: string) => me.root.querySelector<HTMLElement>(sel)!

function makePattern(conf: Conf) {
  const { size, cells, colors } = conf
  const half = size / 2
  const target: Record<string, string> = {}
  let guard = 0
  while (Object.keys(target).length < cells && guard++ < 400) {
    const r = rnd(0, size - 1), c = rnd(0, half - 1)
    target[r + ':' + c] = COLORS[rnd(0, colors - 1)]
  }
  return target
}

function buildRound(me: State) {
  const { size, colors } = me.conf
  const half = size / 2
  me.target = makePattern(me.conf)
  me.state = {}
  me.done = false
  q(me, '.mr-dots').innerHTML = Array.from({ length: me.rounds }, (_, i) =>
    `<i class="sn-dot${i < me.round ? ' on' : ''}${i === me.round ? ' cur' : ''}"></i>`).join('')

  const grid = q(me, '.mr-grid')
  grid.innerHTML = ''
  grid.style.gridTemplateColumns = `repeat(${size},1fr)`
  me.cells = {}
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const left = c < half
      const el = document.createElement('div')
      el.className = 'mr-cell' + (left ? ' mr-fixed' : ' mr-free') + (c === half - 1 ? ' mr-axis' : '')
      if (left) {
        const col = me.target[r + ':' + c]
        if (col) { el.style.background = col; el.classList.add('mr-on') }
      } else {
        el.dataset.k = r + ':' + c
        me.cells[r + ':' + c] = el
      }
      grid.appendChild(el)
    }
  }

  // Pots de couleur : visibles seulement s'il y a plusieurs couleurs
  const pal = q(me, '.mr-pal')
  pal.innerHTML = ''
  pal.style.display = colors > 1 ? '' : 'none'
  me.color = COLORS[0]
  for (let i = 0; i < colors; i++) {
    const b = document.createElement('button')
    b.className = 'mr-chip' + (i === 0 ? ' sel' : '')
    b.style.background = COLORS[i]
    b.setAttribute('aria-label', 'Couleur')
    b.onclick = () => {
      me.color = COLORS[i]
      pal.querySelectorAll('.mr-chip').forEach(x => x.classList.remove('sel'))
      b.classList.add('sel')
      sfx('click', { vol: 0.4 })
    }
    pal.appendChild(b)
  }
}

/** Peint (ou efface) une case du côté droit. */
function paint(me: State, key: string, erase: boolean) {
  const el = me.cells[key]
  if (!el) return
  const next = erase ? '' : me.color
  if ((me.state[key] || '') === next) return
  if (next) { me.state[key] = next; el.style.background = next; el.classList.add('mr-on') }
  else { delete me.state[key]; el.style.background = ''; el.classList.remove('mr-on') }
  // La bonne couleur au bon endroit ? Sinon la case tremble : une enfant
  // bloquée voit tout de suite où ça cloche (aucune sanction pour autant)
  const [r, c] = key.split(':').map(Number)
  const want = me.target[r + ':' + (me.conf.size - 1 - c)] || ''
  if (next && next !== want) {
    me.mistakes++
    sfx('drop', { vol: 0.35, rate: 0.8 })
    el.classList.remove('mr-wrong'); void el.offsetWidth; el.classList.add('mr-wrong')
  } else sfx('tick', { vol: 0.35, rate: 1.1 + Math.random() * 0.4 })
}

function checkDone(me: State) {
  const { size } = me.conf
  const half = size / 2
  for (let r = 0; r < size; r++) {
    for (let c = half; c < size; c++) {
      const want = me.target[r + ':' + (size - 1 - c)] || ''
      if (want !== (me.state[r + ':' + c] || '')) return
    }
  }
  // Symétrie parfaite : la moitié gauche se replie sur la droite
  me.done = true
  me.stroke = null
  sfx('confirm', { vol: 0.8 })
  const grid = q(me, '.mr-grid')
  fold(me, grid)
  ctx.after(900, () => {
    if (mr !== me) return
    fxAt(grid, pick([JUICE.green, JUICE.blue, JUICE.warm]), 16)
    grid.classList.add('mr-win')
  })
  me.round++
  ctx.after(2200, () => {
    if (mr !== me || !me.running) return
    grid.classList.remove('mr-win')
    if (me.round >= me.rounds) finish(me)
    else buildRound(me)
  })
}

/** Le reflet : une copie de la moitié gauche pivote sur l'axe (rotateY). */
function fold(me: State, grid: HTMLElement) {
  const { size } = me.conf
  const half = size / 2
  const cells = Array.from(grid.children) as HTMLElement[]
  const first = cells[0].getBoundingClientRect()
  const axis = cells[half - 1].getBoundingClientRect()
  const last = cells[size * size - 1].getBoundingClientRect()
  const g = grid.getBoundingClientRect()
  const leaf = document.createElement('div')
  leaf.className = 'mr-leaf'
  leaf.style.left = first.left - g.left + 'px'
  leaf.style.top = first.top - g.top + 'px'
  leaf.style.width = axis.right - first.left + 'px'
  leaf.style.height = last.bottom - first.top + 'px'
  leaf.style.gridTemplateColumns = `repeat(${half},1fr)`
  leaf.style.gap = getComputedStyle(grid).gap
  for (let r = 0; r < size; r++) for (let c = 0; c < half; c++) {
    const d = document.createElement('i')
    const col = me.target[r + ':' + c]
    if (col) d.style.background = col
    leaf.appendChild(d)
  }
  grid.appendChild(leaf)
  requestAnimationFrame(() => leaf.classList.add('go'))
  ctx.after(1200, () => leaf.remove())
}

function finish(me: State) {
  const stars = me.mistakes <= 2 ? 3 : me.mistakes <= 7 ? 2 : 1
  ctx.finish({
    title: 'Miroir, joli miroir !',
    msg: `Tu as complété ${me.rounds} symétries`,
    stars
  })
}

export const mirror: GameDef = {
  id: 'mirror', name: 'Le Miroir', icon: '🪞', sq: 'sq-lilac', cat: 'reflexion',
  subtitle: 'Peins la moitié droite pour compléter le reflet !',
  mount(c) {
    ctx = c
    c.root.innerHTML = `
      <div class="arena mr-arena">
        <div class="mr-pal"></div>
        <div class="mr-grid"></div>
        <div class="tq-side"><div class="mem-dots mr-dots"></div></div>
      </div>`
    const me: State = {
      conf: c.byTier({ size: 6, cells: 6, colors: 1 }, { size: 8, cells: 9, colors: 2 }, { size: 10, cells: 13, colors: 3 }),
      round: 0, rounds: 3, mistakes: 0, running: true, done: false, color: COLORS[0],
      target: {}, state: {}, cells: {}, root: c.root, stroke: null
    }
    mr = me
    preloadSfx(['tick', 'drop', 'confirm', 'click'])
    buildRound(me)

    // Peindre en glissant : un trait commence sur une case libre, puis suit
    // le doigt sur la fenêtre (jamais un pointermove par case — piège connu)
    const keyAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('.mr-free')?.dataset.k
    const grid = q(me, '.mr-grid')
    const onDown = (e: PointerEvent) => {
      if (!me.running || me.done) return
      const k = keyAt(e.clientX, e.clientY)
      if (!k) return
      e.preventDefault()
      me.stroke = { erase: me.state[k] === me.color, seen: new Set([k]) }
      paint(me, k, me.stroke.erase)
    }
    const onMove = (e: PointerEvent) => {
      if (!me.stroke || me.done) return
      const k = keyAt(e.clientX, e.clientY)
      if (!k || me.stroke.seen.has(k)) return
      me.stroke.seen.add(k)
      paint(me, k, me.stroke.erase)
    }
    const onUp = () => { if (me.stroke) { me.stroke = null; checkDone(me) } }
    grid.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __mr: unknown }).__mr = {
        get need() {
          const { size } = me.conf
          const out: { k: string; color: string }[] = []
          for (const [k, col] of Object.entries(me.target)) {
            const [r, cc] = k.split(':').map(Number)
            out.push({ k: r + ':' + (size - 1 - cc), color: col })
          }
          return out
        },
        get round() { return me.round }, get done() { return me.done },
        pick: (col: string) => { const i = COLORS.indexOf(col); (me.root.querySelectorAll<HTMLElement>('.mr-chip')[i] ?? null)?.click() }
      }
    }
    return () => {
      me.running = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (mr === me) mr = null
    }
  }
}
