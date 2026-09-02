/* La session d'un jeu d'adresse — ce que dix jeux recopiaient en 120 lignes
   chacun, et tous un peu différemment : score, vies, combo, rampe, chrono,
   HUD, barème d'étoiles, fin de partie.

   Principes (voir AUDIT.md §4) :
   - la RAMPE est fonction de la performance (un cran tous les N réussites,
     plafonnée), jamais du temps qui passe ;
   - le temps de jeu est SIMULÉ (`tick(dt)`) : un timer d'arcade ne tire pas
     pendant la pause ni pendant un hoquet de l'onglet ;
   - le HUD est le même partout : cœurs, score avec l'icône du jeu, combo qui
     grossit, barre de temps. En icônes, jamais en texte ;
   - la fin passe par `end()` qui calcule les étoiles avec le barème du jeu et
     laisse l'outro se jouer. */

import type { GameContext } from './types'
import { ICON, heartsHTML } from './icons'
import { sfx } from './sfx'

export interface ArcadeState {
  score: number
  lives: number
  maxLives: number
  combo: number
  bestCombo: number
  hits: number
  misses: number
  /** Cran de difficulté courant, de 0 à `ramp.max`. */
  level: number
  /** Temps de jeu simulé (s). */
  time: number
  /** Temps restant si un chrono est configuré, sinon Infinity. */
  timeLeft: number
  over: boolean
}

export interface ArcadeOpts {
  /** L'arène : le HUD s'y superpose. */
  host: HTMLElement
  lives?: number
  /** Icône du score (SVG de core/icons.ts ou markup). */
  scoreIcon?: string
  /** Chrono en secondes ; absent = la partie finit par la mort. */
  timer?: number
  /** Rampe : un cran tous les `every` succès, `max` crans. */
  ramp?: { every: number; max: number }
  /** Barème d'étoiles, calculé à `end()`. */
  stars: (s: ArcadeState) => 1 | 2 | 3
  onLevel?: (level: number) => void
  onTimeUp?: () => void
}

export interface Arcade {
  s: ArcadeState
  /** Une réussite : points, combo, rampe. `perfect` fait grossir le combo plus fort. */
  hit(points?: number, o?: { perfect?: boolean; silent?: boolean }): void
  /** Un raté sans perte de vie : le combo tombe. */
  miss(): void
  /** Une vie perdue ; renvoie true si c'était la dernière. */
  hurt(): boolean
  /** Fait avancer l'horloge simulée et le chrono. À appeler chaque frame. */
  tick(dt: number): void
  /** Timer sur l'horloge simulée. */
  after(ms: number, fn: () => void): void
  /** Fin de partie : étoiles par le barème, puis ctx.finish (après l'outro). */
  end(o: { title: string; msg: string; outroMs?: number }): void
  /** Un gros mot-image au centre de l'arène, 0,8 s (« ×3 », une icône…). */
  flash(html: string, cls?: string): void
  dispose(): void
}

export function arcade(ctx: GameContext, o: ArcadeOpts): Arcade {
  const s: ArcadeState = {
    score: 0, lives: o.lives ?? 0, maxLives: o.lives ?? 0, combo: 0, bestCombo: 0,
    hits: 0, misses: 0, level: 0, time: 0, timeLeft: o.timer ?? Infinity, over: false
  }
  const timers: { at: number; fn: () => void }[] = []

  /* ---- HUD ---- */
  const hud = document.createElement('div')
  hud.className = 'hud'
  hud.innerHTML = `
    <span class="hud-score"><i>${o.scoreIcon ?? ICON.star}</i><b>0</b></span>
    ${s.maxLives ? `<span class="hud-lives">${heartsHTML(s.lives, s.maxLives)}</span>` : ''}
    <span class="hud-combo"></span>`
  o.host.appendChild(hud)
  let timerBar: HTMLElement | null = null
  if (o.timer) {
    timerBar = document.createElement('div')
    timerBar.className = 'hud-timer'
    timerBar.innerHTML = '<i></i>'
    o.host.appendChild(timerBar)
  }
  const flashEl = document.createElement('div')
  flashEl.className = 'hud-flash'
  o.host.appendChild(flashEl)
  const scoreEl = hud.querySelector<HTMLElement>('.hud-score b')!
  const livesEl = hud.querySelector<HTMLElement>('.hud-lives')
  const comboEl = hud.querySelector<HTMLElement>('.hud-combo')!

  const replay = (el: Element, cls: string) => { el.classList.remove(cls); void (el as HTMLElement).offsetWidth; el.classList.add(cls) }
  const paint = () => {
    scoreEl.textContent = String(s.score)
    if (livesEl) livesEl.innerHTML = heartsHTML(s.lives, s.maxLives)
    if (s.combo >= 2) {
      comboEl.textContent = '×' + s.combo
      comboEl.classList.add('on')
      replay(comboEl, 'pop')
    } else comboEl.classList.remove('on')
  }

  const a: Arcade = {
    s,
    hit(points = 1, h = {}) {
      if (s.over) return
      s.hits++
      s.combo += h.perfect ? 2 : 1
      s.bestCombo = Math.max(s.bestCombo, s.combo)
      const mult = Math.min(5, 1 + Math.floor(s.combo / 3))
      s.score += points * mult
      paint()
      replay(scoreEl, 'bump')
      if (!h.silent) sfx(h.perfect ? 'confirm' : 'pluck', { rate: 1 + Math.min(12, s.combo) * 0.03, vol: 0.7 })
      if (o.ramp && s.level < o.ramp.max && s.hits % o.ramp.every === 0) {
        s.level++
        o.onLevel?.(s.level)
      }
    },
    miss() {
      if (s.over) return
      s.misses++
      if (s.combo) { s.combo = 0; paint() }
    },
    hurt() {
      if (s.over) return true
      s.misses++
      s.combo = 0
      if (s.maxLives) s.lives = Math.max(0, s.lives - 1)
      paint()
      if (livesEl) replay(livesEl, 'lost')
      sfx('error', { vol: 0.6 })
      return s.maxLives > 0 && s.lives <= 0
    },
    tick(dt) {
      if (s.over) return
      s.time += dt
      for (let i = timers.length - 1; i >= 0; i--) {
        if (s.time >= timers[i].at) { const t = timers.splice(i, 1)[0]; t.fn() }
      }
      if (o.timer) {
        s.timeLeft = Math.max(0, o.timer - s.time)
        if (timerBar) (timerBar.firstElementChild as HTMLElement).style.width = (s.timeLeft / o.timer * 100) + '%'
        if (s.timeLeft <= 0) { s.timeLeft = 0; o.onTimeUp?.() }
      }
    },
    after(ms, fn) { timers.push({ at: s.time + ms / 1000, fn }) },
    end(e) {
      if (s.over) return
      s.over = true
      const stars = o.stars(s)
      hud.classList.add('off')
      ctx.finish({ title: e.title, msg: e.msg, stars, starsEarned: stars, outroMs: e.outroMs })
    },
    flash(html, cls = '') {
      flashEl.innerHTML = html
      flashEl.className = 'hud-flash ' + cls
      replay(flashEl, 'go')
    },
    dispose() {
      hud.remove(); timerBar?.remove(); flashEl.remove()
    }
  }
  paint()
  return a
}

/** Barème simple par score : `[deux, trois]` = seuils des 2ᵉ et 3ᵉ étoiles. */
export function starsByScore(th: [number, number]): (s: ArcadeState) => 1 | 2 | 3 {
  return s => (s.score >= th[1] ? 3 : s.score >= th[0] ? 2 : 1)
}
