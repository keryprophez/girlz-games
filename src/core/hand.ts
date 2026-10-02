import { onPause } from './session'
import type { GameContext } from './types'

/* 👆 La main qui montre (30/09) — le geste de chaque jeu, mimé par une main
   fantôme. Aucune lecture requise (règle 2) : c'est la démonstration
   visuelle, pour tous les jeux et plus seulement cinq.

   Chaque jeu déclare son geste dans `GameDef.hand` : une fonction qui
   regarde l'état de la partie et rend le geste à montrer MAINTENANT, ou
   `null` quand le jeu n'attend rien de l'enfant (chargement, écoute du
   Chœur, animation, manche qui change) :
     { tap: cible }            taper
     { taps: [cibles] }        taper ici, puis là (les deux pouces du
                               Flipper : à gauche, puis à droite)
     { drag: [de, vers] }      glisser (appuyer, emmener, lâcher)
     { swipe: [de, vers] }     trancher, d'un geste vif
     { trace: [points] }       dessiner une forme au doigt (le cœur du Feu
                               d'artifice) : le trait lumineux suit la main
     { choose: [cibles] }      « l'un de ceux-là » : la main survole sans
                               appuyer. C'est le geste des jeux Apprendre :
                               la main ne montre JAMAIS la réponse.
   Une cible est un élément du DOM, un point de l'écran `{ x, y }` (ce que
   rend `toScreen` pour la 3D) ou une fraction de l'arène `{ fx, fy }`.

   Quand : à la première partie d'un jeu, peu après le carton titre (tant
   qu'elle n'a encore jamais touché ce jeu — retenu dans `ferme:main:<id>`),
   puis chaque fois que le jeu ATTEND depuis quelques secondes sans un
   toucher. Un toucher la chasse aussitôt. Deux démonstrations sans réponse,
   et elle se fait plus rare. Elle ne capte aucun toucher. */

export type Spot = Element | { x: number; y: number } | { fx: number; fy: number } | null | undefined
export type HandMove =
  | { tap: Spot }
  | { taps: Spot[] }
  | { drag: [Spot, Spot]; ghost?: boolean }
  | { swipe: [Spot, Spot] }
  | { trace: Spot[] }
  | { choose: Spot[] }
export type HandSpec = (root: HTMLElement) => HandMove | null

/** Délai de la toute première démonstration d'un jeu (après le carton titre). */
const FIRST_MS = 1900

/* La main : un index tendu, gant blanc cerné de brun. Le bout du doigt est
   en (21, 3) dans la boîte 64 × 72 : c'est lui qu'on pose sur la cible. */
export const HAND_SVG = `<svg viewBox="0 0 64 72" aria-hidden="true">
  <path d="M16 8a5 5 0 0 1 10 0v21c0-3 2.2-5 5-5s5 2 5 5v1c0-2.8 2.2-4.6 4.6-4.6 2.6 0 4.4 1.9 4.4 4.6v1.4c.4-1.6 2-2.7 3.8-2.7 2.4 0 4.2 1.9 4.2 4.4V47c0 11-8 19-19 19h-3.2c-6.4 0-11.4-3.2-14.4-8.8L7.6 43.4c-1.3-2.7-.2-5.8 2.4-7 2.4-1.1 5.2-.3 6.6 2L16 39z"
    fill="#fff" stroke="#4A3A34" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M26 29v9M36 30v8M45 31.4v6.6" fill="none" stroke="#4A3A34" stroke-width="2" stroke-linecap="round" opacity=".55"/>
  <path d="M19.5 9.5a2 2 0 0 1 3 0" fill="none" stroke="#F2B8A0" stroke-width="2" stroke-linecap="round"/>
</svg>`
const W = 70, H = 79
const TIP_X = 21 / 64 * W, TIP_Y = 3 / 72 * H

const seenKey = (id: string) => `ferme:main:${id}`
function readSeen(id: string): boolean {
  try { return localStorage.getItem(seenKey(id)) === '1' } catch { return false }
}
function writeSeen(id: string) {
  try { localStorage.setItem(seenKey(id), '1') } catch { /* stockage refusé : elle reviendra */ }
}

type P = { x: number; y: number }

/** Lance la main d'un jeu ; renvoie son arrêt (à appeler au démontage). */
export function coachHand(ctx: GameContext, gameId: string, spec: HandSpec, idleMs: number): () => void {
  const root = ctx.root
  let seen = readSeen(gameId)
  let last = performance.now()
  let shows = 0
  let running: Animation[] = []
  let showing = false
  let dead = false

  const layer = document.createElement('div')
  layer.className = 'hand-layer'
  layer.innerHTML = `<svg class="hand-trail"><path/></svg><i class="hand-ring"></i><i class="hand-tap"></i><div class="hand">${HAND_SVG}</div>`
  const hand = layer.querySelector<HTMLElement>('.hand')!
  const tapFx = layer.querySelector<HTMLElement>('.hand-tap')!
  const ring = layer.querySelector<HTMLElement>('.hand-ring')!
  const trail = layer.querySelector<SVGPathElement>('.hand-trail path')!
  let ghost: HTMLElement | null = null

  const hide = () => {
    running.forEach(a => a.cancel())
    running = []
    ghost?.remove(); ghost = null
    layer.remove()
    showing = false
  }
  const onDown = () => {
    last = performance.now()
    shows = 0
    if (!seen) { seen = true; writeSeen(gameId) }
    if (showing) hide()
  }
  root.addEventListener('pointerdown', onDown, true)
  const offPause = onPause(p => { if (p) hide() })

  /** La cible en coordonnées d'écran, ou null si elle n'est pas visible. */
  const where = (s: Spot): P | null => {
    if (!s) return null
    if (s instanceof Element) {
      if (!s.isConnected) return null
      const r = s.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) return null
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }
    if ('fx' in s) {
      const a = (root.querySelector('.arena') || root).getBoundingClientRect()
      return { x: a.left + a.width * s.fx, y: a.top + a.height * s.fy }
    }
    return Number.isFinite(s.x) && Number.isFinite(s.y) ? { x: s.x, y: s.y } : null
  }
  const at = (p: P, scale = 1) => `translate(${p.x - TIP_X}px, ${p.y - TIP_Y}px) scale(${scale})`
  const anim = (el: Element, k: Keyframe[], o: KeyframeAnimationOptions) => {
    const a = el.animate(k, { fill: 'forwards', ...o })
    running.push(a)
    return a
  }
  const press = (p: P, delay: number) => {
    tapFx.style.left = p.x + 'px'; tapFx.style.top = p.y + 'px'
    anim(tapFx, [
      { opacity: 0.9, transform: 'scale(.25)' },
      { opacity: 0, transform: 'scale(1.7)' }
    ], { duration: 560, delay, easing: 'cubic-bezier(.2,.7,.3,1)' })
  }
  /** Le trait qui suit le doigt : pointillé pour glisser, plein pour trancher. */
  const stroke = (a: P, b: P, kind: 'drag' | 'swipe', delay: number, duration: number) => {
    trail.setAttribute('d', `M${a.x} ${a.y}L${b.x} ${b.y}`)
    trail.setAttribute('class', kind)
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    trail.style.strokeDasharray = kind === 'swipe' ? `${len}` : '2 16'
    if (kind === 'swipe') {
      anim(trail, [
        { strokeDashoffset: len, opacity: 1 },
        { strokeDashoffset: 0, opacity: 1, offset: 0.55 },
        { strokeDashoffset: 0, opacity: 0 }
      ], { duration: duration + 260, delay, easing: 'ease-out' })
    } else {
      // Le pointillé du chemin apparaît sous la main, puis s'efface
      anim(trail, [
        { opacity: 0 },
        { opacity: 0.95, offset: 0.1 },
        { opacity: 0.95, offset: 0.85 },
        { opacity: 0 }
      ], { duration: duration + 400, delay })
    }
  }

  async function play(mv: HandMove) {
    showing = true
    shows++
    root.appendChild(layer)
    try {
      if ('tap' in mv) {
        const p = where(mv.tap)
        if (!p) return
        const from = { x: p.x + 30, y: p.y + 40 }
        for (let rep = 0; rep < 2 && showing; rep++) {
          await anim(hand, [
            { transform: at(rep ? p : from), opacity: rep ? 1 : 0 },
            { transform: at(p), opacity: 1, offset: 0.3 },
            { transform: at(p, 0.84), opacity: 1, offset: 0.45 },
            { transform: at(p), opacity: 1, offset: 0.62 },
            { transform: at(p), opacity: 1 }
          ], { duration: 1150, easing: 'ease-in-out' }).finished
          press(p, 0)
        }
      } else if ('taps' in mv) {
        // Plusieurs touchers, l'un après l'autre : la main va de l'un à l'autre
        const pts = mv.taps.map(where).filter((p): p is P => !!p)
        if (!pts.length) return
        let prev: P | null = null
        for (let rep = 0; rep < 2 && showing; rep++) {
          for (let i = 0; i < pts.length && showing; i++) {
            const p = pts[i]
            const from = prev ?? { x: p.x + 30, y: p.y + 40 }
            await anim(hand, [
              { transform: at(from), opacity: prev ? 1 : 0 },
              { transform: at(p), opacity: 1, offset: 0.42 },
              { transform: at(p, 0.84), opacity: 1, offset: 0.6 },
              { transform: at(p), opacity: 1, offset: 0.78 },
              { transform: at(p), opacity: 1 }
            ], { duration: 1000, easing: 'ease-in-out' }).finished
            press(p, 0)
            prev = p
          }
        }
      } else if ('drag' in mv || 'swipe' in mv) {
        const swipe = 'swipe' in mv
        const [sa, sb] = swipe ? mv.swipe : mv.drag
        const a = where(sa), b = where(sb)
        if (!a || !b) return
        const moveMs = swipe ? 340 : 950
        for (let rep = 0; rep < 2 && showing; rep++) {
          // Arrivée sur le point de départ
          await anim(hand, [
            { transform: at({ x: a.x + 26, y: a.y + 36 }), opacity: 0 },
            { transform: at(a), opacity: 1 }
          ], { duration: 360, easing: 'ease-out' }).finished
          if (!swipe) {
            press(a, 0)
            await anim(hand, [{ transform: at(a) }, { transform: at(a, 0.86) }], { duration: 160 }).finished
            if (!ghost && 'drag' in mv && mv.ghost && sa instanceof HTMLElement) {
              const r = sa.getBoundingClientRect()
              ghost = sa.cloneNode(true) as HTMLElement
              // Une copie pour l'œil seulement : sans son id ni ses repères
              // `data-*`, sinon elle passe pour un second bouton (un bot qui
              // cherchait LA tuile en trouvait deux, 1/10)
              for (const el of [ghost, ...ghost.querySelectorAll<HTMLElement>('*')]) {
                el.removeAttribute('id')
                for (const a of [...el.attributes]) if (a.name.startsWith('data-')) el.removeAttribute(a.name)
              }
              ghost.setAttribute('aria-hidden', 'true')
              ghost.inert = true
              ghost.classList.add('hand-ghost')
              Object.assign(ghost.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', margin: '0' })
              layer.insertBefore(ghost, hand)
            }
          }
          stroke(a, b, swipe ? 'swipe' : 'drag', 0, moveMs)
          const s = swipe ? 1 : 0.86
          if (ghost) {
            anim(ghost, [
              { transform: 'translate(0,0)', opacity: 0.85 },
              { transform: `translate(${b.x - a.x}px, ${b.y - a.y}px)`, opacity: 0.85, offset: 0.9 },
              { transform: `translate(${b.x - a.x}px, ${b.y - a.y}px)`, opacity: 0 }
            ], { duration: moveMs + 200, easing: 'ease-in-out' })
          }
          await anim(hand, [{ transform: at(a, s) }, { transform: at(b, s) }],
            { duration: moveMs, easing: swipe ? 'cubic-bezier(.4,0,.2,1)' : 'ease-in-out' }).finished
          await anim(hand, [
            { transform: at(b, s), opacity: 1 },
            { transform: at(b), opacity: 1, offset: 0.3 },
            { transform: at(b), opacity: 0 }
          ], { duration: 560 }).finished
          ghost?.remove(); ghost = null
        }
      } else if ('trace' in mv) {
        // Une forme dessinée : la main pose le doigt, suit le chemin à vitesse
        // constante, et le trait s'allume derrière elle
        const pts = mv.trace.map(where).filter((p): p is P => !!p)
        if (pts.length < 2) return
        const cum = [0]
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
        const len = cum[cum.length - 1]
        if (len < 4) return
        const moveMs = Math.max(1300, Math.min(2600, len * 2.6))
        for (let rep = 0; rep < 2 && showing; rep++) {
          await anim(hand, [
            { transform: at({ x: pts[0].x + 26, y: pts[0].y + 36 }), opacity: 0 },
            { transform: at(pts[0]), opacity: 1 }
          ], { duration: 360, easing: 'ease-out' }).finished
          press(pts[0], 0)
          await anim(hand, [{ transform: at(pts[0]) }, { transform: at(pts[0], 0.86) }], { duration: 160 }).finished
          trail.setAttribute('d', 'M' + pts.map(p => `${p.x} ${p.y}`).join('L'))
          trail.setAttribute('class', 'trace')
          trail.style.strokeDasharray = `${len}`
          const hold = moveMs / (moveMs + 420)
          anim(trail, [
            { strokeDashoffset: len, opacity: 1 },
            { strokeDashoffset: 0, opacity: 1, offset: hold },
            { strokeDashoffset: 0, opacity: 0 }
          ], { duration: moveMs + 420, easing: 'linear' })
          await anim(hand, pts.map((p, i) => ({ transform: at(p, 0.86), offset: cum[i] / len })),
            { duration: moveMs, easing: 'linear' }).finished
          const end = pts[pts.length - 1]
          await anim(hand, [
            { transform: at(end, 0.86), opacity: 1 },
            { transform: at(end), opacity: 1, offset: 0.3 },
            { transform: at(end), opacity: 0 }
          ], { duration: 560 }).finished
        }
      } else {
        const pts = mv.choose.map(s => {
          const p = where(s)
          const r = s instanceof Element ? s.getBoundingClientRect() : null
          return p ? { p, size: r ? Math.max(r.width, r.height) : 70 } : null
        }).filter((x): x is { p: P; size: number } => !!x).slice(0, 5)
          // Dans l'ordre de lecture : par rangées, puis de gauche à droite
          .sort((u, v) => Math.round(u.p.y / 60) - Math.round(v.p.y / 60) || u.p.x - v.p.x)
        if (!pts.length) return
        const lift = (p: P) => ({ x: p.x, y: p.y + 6 })
        await anim(hand, [
          { transform: at({ x: pts[0].p.x + 26, y: pts[0].p.y + 40 }), opacity: 0 },
          { transform: at(lift(pts[0].p)), opacity: 1 }
        ], { duration: 380, easing: 'ease-out' }).finished
        for (let i = 0; i < pts.length && showing; i++) {
          const { p, size } = pts[i]
          if (i) {
            await anim(hand, [{ transform: at(lift(pts[i - 1].p)) }, { transform: at(lift(p)) }],
              { duration: 420, easing: 'ease-in-out' }).finished
          }
          // Une lueur autour de la cible : « celui-ci… ou celui-là ? » — sans appuyer
          const d = Math.min(220, size + 22)
          Object.assign(ring.style, { left: p.x + 'px', top: p.y + 'px', width: d + 'px', height: d + 'px', margin: `${-d / 2}px 0 0 ${-d / 2}px` })
          anim(ring, [
            { opacity: 0, transform: 'scale(.85)' },
            { opacity: 0.95, transform: 'scale(1)', offset: 0.4 },
            { opacity: 0, transform: 'scale(1.08)' }
          ], { duration: 640 })
          await anim(hand, [
            { transform: at(lift(p)) },
            { transform: at({ x: p.x, y: p.y - 4 }), offset: 0.5 },
            { transform: at(lift(p)) }
          ], { duration: 520, easing: 'ease-in-out' }).finished
        }
        await anim(hand, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).finished
      }
    } catch {
      // Une animation annulée (toucher, pause, démontage) rejette `finished` :
      // c'est la fin normale d'une démonstration interrompue.
    } finally {
      if (showing) hide()
      last = performance.now()
    }
  }

  let broken = false
  const tick = ctx.every(250, () => {
    if (dead || showing || broken) return
    if (root.classList.contains('outro')) return
    const now = performance.now()
    const wait = seen ? idleMs * (shows >= 2 ? 2 : 1) : FIRST_MS
    if (now - last < wait) return
    // Rien à montrer tant que le jeu charge
    if (root.querySelector('.nj-loading')) { last = now; return }
    let mv: HandMove | null
    try { mv = spec(root) } catch (err) {
      // Une main qui plante ne doit pas faire planter la partie : on la coupe
      console.error('main qui montre :', gameId, err)
      broken = true
      return
    }
    // Le jeu n'attend rien de l'enfant : l'attente repart de zéro
    if (!mv) { last = now; return }
    void play(mv)
  })

  return () => {
    if (dead) return
    dead = true
    ctx.cancel(tick)
    offPause()
    root.removeEventListener('pointerdown', onDown, true)
    hide()
  }
}

/** Les éléments VRAIMENT visibles d'une sélection, dans l'ordre du document :
    leur centre est à l'écran et c'est bien eux qu'un doigt y toucherait (pas
    un habit à moitié caché au bas d'un tiroir qui défile, pas un bouton
    sous un voile). */
export function visible(root: ParentNode, sel: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(sel)).filter(el => {
    const r = el.getBoundingClientRect()
    if (r.width <= 2 || r.height <= 2) return false
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return !!hit && (hit === el || el.contains(hit))
  })
}

/** Quelques cibles prises au hasard (sans répétition) — pour `choose`. */
export function some<T>(xs: T[], n: number): T[] {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
}
