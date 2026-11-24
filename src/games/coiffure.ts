/* @version 2026-11-25 00:20 */
import type { GameDef, GameContext } from '../core/types'
import { createStage, loader, type Stage } from '../core/three3d'
import { createSalon, type Bruit, type Salon } from '../core/salon3d'
import { COIFFURES, TEINTES, packSalon, readSalon, type Coiffure, type Saved, type Step } from '../core/salon'
import { sfx, preloadSfx } from '../core/sfx'
import { tone } from '../core/audio'
import { confetti } from '../core/fx'
import { visible, handNow, type HandMove } from '../core/hand'
import { mine, snapScene, whoCards, paintCards, meButton, paintMe, calm, type Who } from '../core/mine'
import { BADGE } from '../core/badges'

/* 💇 LE SALON DE COIFFURE (23 au 25/11, choisi par le père) — de vrais
   cheveux, qu'on coiffe au doigt sur un buste :
   - la queue de cheval : brosser, rassembler dans le rond, l'élastique ;
   - les couettes : brosser, tracer la raie, un côté puis l'autre ;
   - la tresse : brosser, rassembler à la nuque, passer huit fois la mèche
     qui s'éclaire par-dessus celle du milieu, l'élastique au bout.
   La scène et les gestes sont dans `core/salon3d.ts` (les fils :
   `hair.ts`, `hair3d.ts` ; la tresse : `braid3d.ts` ; le buste :
   `bust3d.ts`), les recettes dans `core/salon.ts`. Ici : une coiffure par
   fille (`core/mine.ts`), les trois images, les cinq teintes, l'élastique à
   faire glisser, la fête.
   Décisions du père : le doigt prend ce qu'il TOUCHE (des cheveux, sinon le
   buste tourne, sans bouton) ; il ne se passe rien qu'elle n'ait fait
   (aucun rangement automatique) ; la ligne de texte, pour lui, toujours là.
   Trois essais avant celui-ci (une tête en formes simples, une illustration
   découpée, des rubans étirés) : « de la daube ». Créer : aucune note. */

const BASE = `${import.meta.env.BASE_URL}assets/salon/`
const box = mine('coiffure')
/** Où on la regarde, une fois coiffée : de trois quarts, du côté de sa coiffure. */
const VUE: Record<Coiffure, number> = { queue: Math.PI - 0.75, couettes: 0.35, tresse: Math.PI - 0.5 }

interface State {
  stage: Stage
  salon: Salon
  saved: Saved
  /** Ce qui est à l'écran : rien en cours, une coiffure en cours, finie. */
  phase: 'libre' | 'fait' | 'finie' | 'fin'
  /** Le sourire (0..1) et ce vers quoi il va ; les paupières. */
  rire: number
  but: number
  cil: number
  /** La densité des fils, suivant la qualité de la scène (`fixe` : imposée, les bots). */
  dense: number
  fixe: number
}

let ctx: GameContext
let me: State | null = null
let who: Who = 'jade'

/* ---------- Ce qui s'entend ---------- */

let dernier = 0
function bruit(b: Bruit, n = 0) {
  const now = performance.now()
  // (la brosse souffle à chaque coup, pas à chaque toucher)
  if (b === 'brosse') { if (now - dernier > 220) { dernier = now; sfx('cloth', { vol: 0.35, rate: 1.35 }) } return }
  if (b === 'prise') sfx('pluck', { vol: 0.28, rate: 0.9 })
  else if (b === 'pose') { sfx('cloth', { vol: 0.35, rate: 1.1 }); tone(660, 0.1, 'triangle', 0.05) }
  else if (b === 'lache') sfx('whoosh', { vol: 0.14, rate: 1.2 })
  else if (b === 'lisse') { tone(587, 0.12, 'triangle', 0.06); tone(784, 0.18, 'triangle', 0.06, 0.1) }
  else if (b === 'raie') { sfx('tick', { vol: 0.4 }); tone(784, 0.16, 'triangle', 0.06) }
  else if (b === 'cran') { sfx('cloth', { vol: 0.3, rate: 1.2 }); tone([523, 587, 659, 698, 784, 880, 988, 1047][Math.min(7, Math.max(0, n - 1))], 0.14, 'triangle', 0.07) }
  else { sfx('confirm', { vol: 0.45 }); tone(784, 0.12, 'triangle', 0.07); tone(1047, 0.22, 'triangle', 0.07, 0.12) }
}

/* ---------- Le pas à pas à l'écran ---------- */

const $ = <E extends HTMLElement>(sel: string) => ctx.root.querySelector<E>(sel)!

function showStep(i: number, st: Step, n: number, quiet: boolean) {
  const arena = $('.cf-wrap')
  arena.dataset.k = st.k
  $('.cf-texte').innerHTML = `<b>${st.k === 'fini' ? '✓' : i + 1}</b>${st.txt}`
  $('.cf-pas').innerHTML = Array.from({ length: n }, (_, k) => `<i class="${k < i ? 'on' : k === i ? 'cur' : ''}"></i>`).join('')
  $('.cf-noeud img').setAttribute('src', `${BASE}noeud${st.k === 'elastique' ? st.a : 0}.webp`)
  $('.cf-vol').innerHTML = $('.cf-noeud').innerHTML
  if (st.k === 'fini' && !quiet) fete()
  handNow()
}
function showPicks() {
  const s = me
  ctx.root.querySelectorAll<HTMLElement>('.cf-coif').forEach(b => b.classList.toggle('sel', !!s && s.phase !== 'libre' && s.salon.recette.id === b.dataset.coif))
  ctx.root.querySelectorAll<HTMLElement>('.cf-teinte').forEach(b => b.classList.toggle('sel', !!s && s.saved.t === Number(b.dataset.t)))
  $('.cf-wrap').dataset.phase = s?.phase ?? 'libre'
}

/** Coiffée : elle se tourne vers nous et sourit, puis montre sa coiffure. */
function fete() {
  const s = me
  if (!s) return
  s.phase = 'finie'
  s.saved.c = s.salon.recette.id
  box.save(who, packSalon(s.saved))
  showPicks()
  confetti()
  sfx('confirm', { vol: 0.5 })
  ;[523, 659, 784, 1047].forEach((f, k) => tone(f, 0.22, 'triangle', 0.07, 0.1 * k))
  s.but = 1
  ctx.after(500, () => { if (me === s && s.phase === 'finie') s.salon.lookAt(0.2) })
  ctx.after(4200, () => { if (me === s && s.phase === 'finie' && !s.salon.busy) s.salon.lookAt(VUE[s.salon.recette.id]) })
  ctx.after(6500, () => { if (me === s) s.but = 0.35 })
}

function commencer(id: Coiffure) {
  const s = me
  if (!s || s.phase === 'fin') return
  // (déjà en train de la faire : un toucher perdu n'efface rien ; « Rejouer » est dans la barre)
  if (s.phase === 'fait' && s.salon.recette.id === id && s.salon.stepI > 0) return
  s.phase = 'fait'
  s.but = 0
  s.salon.start(id)
  sfx('select', { vol: 0.4 })
  showPicks()
}

/** Sa carte : la photo de sa coiffure finie (celle d'avant aussi, si elle a changé de teinte). */
function photo(s: State) {
  if (s.salon.etape !== 'fini') return
  const url = snapScene(s.stage, 400)
  if (url) box.setPhoto(who, url)
}

function finir(s: State) {
  if (s.phase !== 'finie') return
  s.phase = 'fin'
  s.salon.freeze(true)
  showPicks()
  sfx('confirm', { vol: 0.4 })
  box.flush()
  photo(s)
  ctx.finish({ title: 'Quelle belle coiffure !', msg: COIFFURES.find(c => c.id === s.salon.recette.id)!.fin, stars: 3 })
}

/* ---------- Chaque image ---------- */

function frame(s: State, dt: number, now: number) {
  s.salon.update(dt, now)
  // le sourire, et un clignement de temps en temps
  const r = s.rire
  s.rire += (s.but - s.rire) * Math.min(1, dt * 3)
  s.cil += dt
  const c = s.cil % 4.3, blink = c < 0.16 ? Math.sin(c / 0.16 * Math.PI) : 0
  if (Math.abs(s.rire - r) > 1e-4 || blink > 0 || s.dense < 0) {
    s.salon.face('relaxed', s.rire)
    s.salon.face('blink', blink * (1 - s.rire))
  }
  // moins de fils, un peu plus larges, quand la tablette peine (la scène a baissé sa densité de pixels)
  const full = Math.min(1.5, window.devicePixelRatio), q = s.stage.renderer.getPixelRatio() / full
  const d = s.fixe || (q > 0.9 ? 1 : q > 0.6 ? 0.8 : 0.6)
  if (d !== s.dense) { s.dense = d; s.salon.setDensity(d) }
}

/* ---------- La scène ---------- */

async function build(c: GameContext, arena: HTMLElement, saved: Saved): Promise<State | null> {
  const stage = await createStage(arena, {
    sky: '#F6E7DA', fov: 28, cam: [0, 0, 1.1], target: [0, 0, 0], ibl: false, noSun: true,
    hemi: ['#FFF4EC', '#B99A8A', 1.6], exposure: 1.05
  })
  if (!c.alive()) { stage.dispose(); return null }
  stage.renderer.shadowMap.enabled = false
  try {
    const salon = await createSalon({ stage, src: `${BASE}buste.glb`, after: (ms, fn) => { c.after(ms, fn) }, onStep: showStep, sound: bruit })
    if (!c.alive()) { salon.dispose(); stage.dispose(); return null }
    return { stage, salon, saved, phase: 'libre', rire: 0, but: 0, cil: 1, dense: -1, fixe: 0 }
  } catch (e) { stage.dispose(); throw e }
}

const FINI_ICON = '<svg viewBox="0 0 48 48" width="44" height="44"><circle cx="24" cy="24" r="18" fill="#5EC97B"/><path d="m15 24.5 6 6L33.5 18" fill="none" stroke="#fff" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'

/* ---------- Le jeu ---------- */

export const coiffure: GameDef = {
  id: 'coiffure', name: 'Le Salon de coiffure', icon: '💇', sq: 'sq-peach', cat: 'creatif', noTier: true, music: 'meadow',
  subtitle: 'Coiffe-la : queue de cheval, couettes ou tresse',
  // La main : choisir sa carte, une coiffure, puis le geste de l'étape
  hand: (root): HandMove | null => {
    if (root.querySelector('.cf-wrap[data-who=""]')) return { choose: visible(root, '.cf-card') }
    const s = me
    if (!s || s.phase === 'fin') return null
    if (s.phase === 'libre') return { choose: visible(root, '.cf-coif') }
    if (s.phase === 'finie') return { tap: visible(root, '#cfFini')[0] }
    const k = s.salon.etape, g = s.salon.geste()
    if (!g) return null
    if (k === 'raie') return { trace: g }
    if (k === 'elastique') return { drag: [visible(root, '#cfNoeud')[0], g[0]], ghost: true }
    return g.length > 1 ? { drag: [g[0], g[1]] } : { tap: g[0] }
  },
  mount(c) {
    ctx = c
    let dead = false
    c.root.innerHTML = `
      <div class="arena g3-arena cf-wrap" id="cfWrap" data-who="" data-k="" data-phase="libre">
        ${whoCards('cf')}
        ${meButton('cfMe', 'cf-me', 'Changer de fille')}
        <div class="cf-coifs">${COIFFURES.map(x => `<span class="tool-item"><button class="cf-coif" data-coif="${x.id}" aria-label="${x.nom}"><img src="${BASE}${x.id}.webp" alt="" draggable="false"></button><i class="tool-cap">${x.nom}</i></span>`).join('')}</div>
        <div class="cf-teintes">${TEINTES.map((t, i) => `<span class="tool-item"><button class="cf-teinte" data-t="${i}" aria-label="${t.nom}" style="--c:${t.hex}"></button><i class="tool-cap">${t.nom}</i></span>`).join('')}</div>
        <div class="cf-bas"><div class="cf-texte"></div><div class="cf-pas"></div></div>
        <span class="tool-item cf-tray"><button class="cf-noeud" id="cfNoeud" aria-label="L’élastique"><img src="${BASE}noeud0.webp" alt="" draggable="false"></button><i class="tool-cap">Élastique</i></span>
        <span class="tool-item cf-fin"><button class="sn-tool" id="cfFini" aria-label="Fini">${FINI_ICON}</button><i class="tool-cap">Fini</i></span>
        <div class="cf-vol" hidden></div>
      </div>`
    const arena = c.root.querySelector<HTMLElement>('#cfWrap')!
    preloadSfx(['cloth', 'pluck', 'confirm', 'select', 'whoosh', 'tick'])
    new Image().src = `${BASE}noeud1.webp`
    // (une carte, un bouton qui en remplace un autre : le second toucher d'un double toucher ne compte pas)
    const still = calm()

    const showCards = () => paintCards(arena, box, BADGE.coiffure || '')
    showCards()
    let hideLoader = () => { /* les cartes d'abord */ }
    let starting = false
    const choose = async (w: Who) => {
      if (me || starting) return
      starting = true
      who = w
      box.setLast(w)
      arena.setAttribute('data-who', w)
      arena.dataset.k = ''
      paintMe(c.root, 'cfMe', w)
      sfx('confirm', { vol: 0.5 })
      still.mark()
      hideLoader = loader(arena, 'coiffure', 45000)
      const saved = readSalon(box.read(w))
      const s = await build(c, arena, saved).catch(e => { console.error(e); return null })
      starting = false
      hideLoader()
      if (!s || dead) { if (s) { s.salon.dispose(); s.stage.dispose() } else if (!dead) c.toast('La 3D n\'est pas disponible ici'); return }
      me = s
      s.salon.setColor(TEINTES[saved.t].hex)
      // telle qu'on l'avait laissée ; ou les cheveux lâchés
      if (saved.c) { s.salon.start(saved.c, true); s.salon.yaw = VUE[saved.c]; s.phase = 'libre' } else { s.salon.libre(); s.salon.yaw = Math.PI - 0.35 }
      $('.cf-texte').textContent = ''
      $('.cf-pas').innerHTML = ''
      showPicks()
      s.stage.start((dt, now) => { if (me === s) frame(s, dt, now) })
      handNow()
    }
    /** On la quitte (pour l'autre, ou pour sortir) : sa coiffure finie est gardée, photographiée. */
    const leave = (s: State) => {
      box.flush()
      photo(s)
      me = null
      s.salon.dispose()
      try { s.stage.dispose() } catch { /* déjà démonté */ }
    }

    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      const card = t.closest<HTMLElement>('.cf-card')
      if (card?.dataset.who) { if (!still.quiet()) choose(card.dataset.who as Who); return }
      const s = me
      if (!s || s.phase === 'fin' || still.quiet()) return
      if (t.closest('#cfMe')) {
        leave(s)
        still.mark()
        arena.setAttribute('data-who', '')
        showCards()
        sfx('select', { vol: 0.4 })
        return
      }
      if (t.closest('#cfFini')) { finir(s); return }
      const co = t.closest<HTMLElement>('.cf-coif')
      if (co) { still.mark(); commencer(co.dataset.coif as Coiffure); return }
      const te = t.closest<HTMLElement>('.cf-teinte')
      if (te) {
        s.saved.t = Number(te.dataset.t)
        s.salon.setColor(TEINTES[s.saved.t].hex)
        box.save(who, packSalon(s.saved))
        sfx('select', { vol: 0.35 })
        showPicks()
      }
    }
    c.root.addEventListener('click', onClick)

    /* L'élastique : il suit le doigt, du bouton jusqu'aux cheveux */
    const tray = c.root.querySelector<HTMLElement>('#cfNoeud')!, vol = c.root.querySelector<HTMLElement>('.cf-vol')!
    let fly = -1
    const flyTo = (e: PointerEvent) => {
      const r = arena.getBoundingClientRect()
      vol.style.left = `${e.clientX - r.left}px`; vol.style.top = `${e.clientY - r.top}px`
    }
    const onDown = (e: PointerEvent) => {
      if (fly >= 0 || !me || me.salon.posed) return
      fly = e.pointerId
      try { tray.setPointerCapture(fly) } catch { /* un doigt déjà levé */ }
      vol.hidden = false
      tray.classList.add('pris')
      flyTo(e)
      sfx('pluck', { vol: 0.35 })
    }
    const onMove = (e: PointerEvent) => { if (e.pointerId === fly) flyTo(e) }
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== fly) return
      fly = -1
      vol.hidden = true
      tray.classList.remove('pris')
      if (e.type === 'pointerup' && me?.salon.drop(e.clientX, e.clientY)) arena.dataset.k = 'pose'
    }
    tray.addEventListener('pointerdown', onDown)
    tray.addEventListener('pointermove', onMove)
    tray.addEventListener('pointerup', onUp)
    tray.addEventListener('pointercancel', onUp)

    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __cf: unknown }).__cf = {
        get cards() { return arena.getAttribute('data-who') === '' },
        get who() { return me ? who : null },
        get ready() { return !!me && me.phase !== 'fin' },
        get phase() { return me?.phase },
        get coif() { return me?.salon.recette.id },
        get etape() { return me?.salon.etape },
        get i() { return me?.salon.stepI },
        get saved() { return me?.saved },
        get geste() { return me?.salon.geste() ?? null },
        get noeud() { const r = tray.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } },
        get dbg() { return me?.salon.dbg },
        /** Sous la 3D logicielle : peu de fils, une image plus petite. */
        leger() { if (me) { me.fixe = 0.15; me.stage.renderer.setPixelRatio(0.5) } },
        /** L'affiche : une coiffure finie, de trois quarts. */
        demo(id: Coiffure, yaw: number, t = 1) {
          const s = me
          if (!s) return
          s.salon.setColor(TEINTES[t].hex)
          s.salon.start(id, true)
          s.salon.yaw = yaw
        }
      }
    }

    return () => {
      if (dead) return
      dead = true
      c.root.removeEventListener('click', onClick)
      if (me) leave(me)
      hideLoader()
    }
  }
}
