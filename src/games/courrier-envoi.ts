/* @version 2026-11-26 13:29 */
import { sfx } from '../core/sfx'
import { buzz } from '../core/audio'
import { isPaused, onPause } from '../core/session'
import { girl, whoOf } from '../core/mine'
import { cacheter, timbrer, poster, ouvrir, type Enveloppe, type Lettre } from '../core/courrier'
import type { Boites } from '../core/boites3d'
import type { HandMove } from '../core/hand'
import { aplatir, gommeHTML } from './courrier-feuille'
import { heartD, starD } from '../core/pinceaux'
import type { Contexte, Ecran } from './courrier'

/* LA CÉRÉMONIE du Courrier.
   L'envoi (`envoyer`) : plier la feuille vers le haut, puis vers la droite (le
   pli suit le doigt) ; choisir la couleur de l'enveloppe et y glisser la
   lettre ; choisir le cachet et garder le doigt posé : la cire s'étale ;
   l'enveloppe se retourne, choisir le timbre ; la glisser dans la boîte de sa
   sœur : la porte claque, le drapeau se lève.
   - Une seule fois, un seul doigt : le premier posé compte, chaque étape
     n'avance qu'une fois (deux doigts, un double toucher : une seule lettre).
   - Cachetée, la lettre est gardée telle quelle : sortie avant de poster,
     « Écrire » reprend au timbre, ou à la boîte.
   - Une écriture refusée n'annonce rien : l'enveloppe revient et se secoue.
   - Le raccourci (à partir de la troisième lettre) : un seul pli au doigt,
     la couleur et le cachet déjà choisis, le dernier timbre au coin.
   L'arrivée (`ouvrirEnveloppe`) : la retourner, casser le cachet (trois
   appuis), sortir la lettre ; elle se déplie toute seule. */

const COULEURS = ['#F58FB8', '#FFB84D', '#7CCB8F', '#6FC3EA', '#B197FC', '#F4E3C3']
const TIMBRES = ['duck', 'chick', 'cat', 'rabbit', 'cow', 'pig', 'sheep', 'horse'].map(a => 'animal:' + a)
const CACHETS: Record<string, string> = {
  coeur: `<path d="${heartD(50, 54, 40)}"/>`,
  etoile: `<path d="${starD(50, 51, 26)}"/>`,
  fleur: [0, 1, 2, 3, 4].map(k => `<circle cx="${(50 + Math.cos(k * 1.257 - 1.57) * 15).toFixed(1)}" cy="${(50 + Math.sin(k * 1.257 - 1.57) * 15).toFixed(1)}" r="11"/>`).join('') + '<circle cx="50" cy="50" r="7" class="centre"/>',
  patte: '<ellipse cx="50" cy="60" rx="17" ry="13"/><circle cx="31" cy="43" r="8"/><circle cx="43" cy="32" r="8"/><circle cx="57" cy="32" r="8"/><circle cx="69" cy="43" r="8"/>'
}
/** La pastille de cire, son bord irrégulier, son motif en creux. */
function cireSVG(seal: string, clip = '') {
  let d = ''
  for (let k = 0; k <= 40; k++) { const a = k / 40 * 6.283, r = 44 + Math.sin(a * 5 + 1) * 2.2 + Math.sin(a * 9) * 1.6; d += `${k ? 'L' : 'M'}${(50 + Math.cos(a) * r).toFixed(1)} ${(50 + Math.sin(a) * r).toFixed(1)}` }
  return `<svg viewBox="0 0 100 100" style="${clip}"><path d="${d}Z" fill="#B3202E"/><circle cx="50" cy="50" r="35" fill="#9C1724"/><circle cx="50" cy="51.5" r="34" fill="#C22D3A"/><g fill="#8F1420" class="co-motif">${CACHETS[seal] ?? ''}</g><path d="M22 32a34 34 0 0 1 26-17" stroke="#fff" stroke-opacity=".4" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`
}
const TAMPON = '<svg viewBox="0 0 120 80" class="co-oblit"><circle cx="38" cy="40" r="30" fill="none" stroke="#33407A" stroke-width="4"/><circle cx="38" cy="40" r="22" fill="none" stroke="#33407A" stroke-width="2"/><path d="M72 24c8-6 14 6 22 0s14 6 22 0M72 40c8-6 14 6 22 0s14 6 22 0M72 56c8-6 14 6 22 0s14 6 22 0" fill="none" stroke="#33407A" stroke-width="4"/></svg>'

/** L'enveloppe (son dos à rabat, sa face à timbre et adresse). `poste` : le tampon est sur le timbre. */
function enveloppeHTML(env: Enveloppe, l: Lettre, poste = false) {
  return `<div class="co-env" style="--env:${env.couleur}"><div class="co-env-in">
    <div class="co-env-dos"><div class="co-env-fond"></div><div class="co-env-place"></div><div class="co-env-poche"></div><div class="co-env-rabat"><i></i></div><div class="co-env-cire"></div></div>
    <div class="co-env-face"><div class="co-env-timbre">${env.timbre ? `<span class="co-timbre">${gommeHTML(env.timbre)}</span>` : ''}${poste ? TAMPON : ''}</div>
      <div class="co-env-adr">${girl(whoOf(l.a).color, 92)}<b>${whoOf(l.a).name}</b></div><div class="co-env-exp">${girl(whoOf(l.de).color, 34)}</div></div>
  </div></div>`
}

type Etape = 'plier' | 'plier2' | 'enveloppe' | 'cire' | 'timbre' | 'poster' | 'retourner' | 'casser' | 'sortir' | 'fini'

/** Ce que les deux cérémonies partagent : les minuteurs de partie, un seul doigt, le ménage. */
function scene(hote: HTMLElement, x: Contexte) {
  const menage = new Set<() => void>()
  let vivant = true
  const ecouter = <K extends keyof WindowEventMap>(cible: Window | HTMLElement, t: K, f: (e: WindowEventMap[K]) => void) => {
    if (!vivant) return () => {}
    cible.addEventListener(t, f as EventListener)
    const off = () => cible.removeEventListener(t, f as EventListener)
    menage.add(off)
    return off
  }
  return {
    get vivant() { return vivant },
    /** Une pause du déroulé ; fermée, la cérémonie ne reprend plus (la promesse ne se résout jamais). */
    attendre: (ms: number) => new Promise<void>(r => x.c.after(ms, () => { if (vivant) r() })),
    /** Un abonnement rendu au ménage. */
    garder(off: () => void) { if (!vivant) { off(); return } menage.add(off) },
    ecouter,
    /** Suit un glissé (le premier doigt seulement) ; `p` de 0 à 1 ; rend la main quand c'est fait. */
    glisse(el: HTMLElement, axe: 'x' | 'y', sens: 1 | -1, dist: () => number, f: (p: number, tire: boolean) => void): Promise<void> {
      return new Promise(res => {
        let id = -1, s0 = 0, p = 0
        const pos = (e: PointerEvent) => (axe === 'x' ? e.clientX : e.clientY)
        const offs: (() => void)[] = []
        offs.push(ecouter(el, 'pointerdown', e => { if (id >= 0) return; id = e.pointerId; s0 = pos(e); sfx('cloth', { vol: 0.35 }) }))
        offs.push(ecouter(window, 'pointermove', e => { if (e.pointerId !== id) return; p = Math.min(1, Math.max(0, (pos(e) - s0) * sens / dist())); f(p, true) }))
        const lache = (e: PointerEvent) => {
          if (e.pointerId !== id) return
          id = -1
          if (p < 0.42) { p = 0; f(0, false); return }
          f(1, false)
          offs.forEach(o => o())
          res()
        }
        offs.push(ecouter(window, 'pointerup', lache))
        offs.push(ecouter(window, 'pointercancel', lache))
      })
    },
    /** Un toucher franc sur `el` (le premier). */
    toucher: (el: HTMLElement) => new Promise<void>(res => { const off = ecouter(el, 'pointerup', () => { off(); res() }) }),
    fermer() { vivant = false; menage.forEach(f => f()); menage.clear(); hote.innerHTML = '' }
  }
}

/* ---------- L'envoi ---------- */

export interface Envoi extends Ecran { /** Avant la cire : « Retour » ramène à la feuille. */ avantCachet(): boolean }

export function envoyer(hote: HTMLElement, x: Contexte, l0: Lettre, o: { boites: Boites; raccourci: Enveloppe | null; geste(nom: string): void; garde(l: Lettre): void; fini(l: Lettre): void }): Envoi {
  const S = scene(hote, x)
  let l = l0, etape: Etape = l.etat === 'brouillon' ? 'plier' : l.env?.timbre ? 'poster' : 'timbre'
  const env: Enveloppe = { ...(l.env ?? o.raccourci ?? { couleur: COULEURS[0], cachet: 'coeur', timbre: '' }), timbre: l.env?.timbre ?? '' }
  const ecrireLettre = async (nouvelle: Lettre) => { if (!(await x.coffre.garderLettre(nouvelle))) return false; l = nouvelle; o.garde(nouvelle); return true }
  const q = <E extends HTMLElement = HTMLElement>(s: string) => hote.querySelector<E>(s)

  async function derouler() {
    if (etape === 'plier' || etape === 'plier2' || etape === 'enveloppe' || etape === 'cire') await jusquAuCachet()
    if (!S.vivant) return
    if (etape === 'timbre') await auTimbre()
    if (!S.vivant) return
    await aLaBoite()
  }

  async function jusquAuCachet() {
    const flat = await aplatir(l)
    if (!S.vivant) return
    hote.innerHTML = `<div class="co-cer"><div class="co-pli" style="--img:url(${flat});--pap:${l.papier}"><div class="co-pli-h"></div><div class="co-pli-b"><i class="av"></i><i class="ar"></i></div></div><div class="co-choix" hidden></div></div>`
    const cer = q('.co-cer')!, choix = q('.co-choix')!
    let pli = q('.co-pli')!
    // 1. Plier le bas sur le haut (avec le raccourci, le second pli suit tout seul)
    etape = 'plier'
    await S.glisse(cer, 'y', -1, () => pli.clientHeight * 0.75, (p, tire) => { pli.classList.toggle('auto', !tire); pli.style.setProperty('--a', String(p)) })
    if (!S.vivant) return
    sfx('cloth', { vol: 0.8, rate: 0.9 }); buzz(12); o.geste('plier')
    await S.attendre(330)
    pli.outerHTML = `<div class="co-pli2" style="--pap:${l.papier}"><div class="co-p2-d"></div><div class="co-p2-g"><i class="av"></i><i class="ar"></i></div></div>`
    pli = q('.co-pli2')!
    etape = 'plier2'
    if (o.raccourci) {
      await S.attendre(60)
      pli.classList.add('auto'); pli.style.setProperty('--a', '1')
      sfx('cloth', { vol: 0.8 })
      await S.attendre(360)
    } else {
      await S.glisse(cer, 'x', 1, () => pli.clientWidth * 0.75, (p, tire) => { pli.classList.toggle('auto', !tire); pli.style.setProperty('--a', String(p)) })
      if (!S.vivant) return
      sfx('cloth', { vol: 0.8 }); buzz(12); o.geste('plier2')
      await S.attendre(330)
    }
    // 2. L'enveloppe : sa couleur, puis la lettre dedans
    pli.remove()
    cer.insertAdjacentHTML('afterbegin', enveloppeHTML(env, l))
    const e = q('.co-env')!
    e.classList.add('ouverte', 'arrive')
    const place = q('.co-env-place')!
    place.innerHTML = `<div class="co-carte sortie" style="--pap:${l.papier};--a:1"></div>`
    const carte = place.firstElementChild as HTMLElement
    etape = 'enveloppe'
    choix.hidden = false
    choix.innerHTML = COULEURS.map(c => `<button class="${c === env.couleur ? 'sel' : ''}" data-c="${c}" style="background:${c}" aria-label="Couleur"></button>`).join('')
    choix.onclick = ev => { const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-c]'); if (!b) return; sfx('click', { vol: 0.5 }); env.couleur = b.dataset.c!; e.style.setProperty('--env', env.couleur); choix.querySelectorAll('button').forEach(x2 => x2.classList.toggle('sel', x2 === b)) }
    await S.glisse(cer, 'y', 1, () => cer.clientHeight * 0.3, (p, tire) => { carte.classList.toggle('auto', !tire); carte.style.setProperty('--a', String(1 - p)) })
    if (!S.vivant) return
    sfx('whoosh', { vol: 0.5 }); o.geste('enveloppe')
    await S.attendre(360)
    choix.innerHTML = ''
    e.classList.remove('ouverte')
    sfx('cloth', { vol: 0.8, rate: 1.2 })
    await S.attendre(520)
    place.innerHTML = ''
    // 3. La cire : choisir le dessin, garder le doigt posé (la pause l'efface)
    etape = 'cire'
    choix.innerHTML = Object.keys(CACHETS).map(k => `<button class="co-ca ${k === env.cachet ? 'sel' : ''}" data-s="${k}" aria-label="Cachet">${cireSVG(k)}</button>`).join('')
    choix.onclick = ev => { const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-s]'); if (!b) return; sfx('click', { vol: 0.5 }); env.cachet = b.dataset.s!; choix.querySelectorAll('button').forEach(x2 => x2.classList.toggle('sel', x2 === b)) }
    const cire = q('.co-env-cire')!
    for (;;) {
      await new Promise<void>(res => {
        let raf = 0, t0 = 0, id = -1
        cire.innerHTML = '<i class="co-goutte"></i>'
        const g = cire.firstElementChild as HTMLElement
        const lacher = () => { id = -1; cancelAnimationFrame(raf); g.style.transform = 'scale(0.08)' }
        const tic = () => {
          const p = Math.min(1, (performance.now() - t0) / 1100)
          g.style.transform = `scale(${0.08 + p * 0.92})`
          if (p < 1) { raf = requestAnimationFrame(tic); return }
          offs.forEach(f => f()); offPause()
          res()
        }
        const offs = [
          S.ecouter(e, 'pointerdown', ev => { if (id >= 0) return; id = ev.pointerId; t0 = performance.now(); sfx('drop', { vol: 0.4, rate: 0.7 }); tic() }),
          S.ecouter(window, 'pointerup', ev => { if (ev.pointerId === id) lacher() }),
          S.ecouter(window, 'pointercancel', ev => { if (ev.pointerId === id) lacher() })
        ]
        const offPause = onPause(p => { if (p) lacher() })
        S.garder(offPause)
      })
      if (!S.vivant) return
      if (await ecrireLettre(cacheter(l, env))) break
      // Pas gardée : la cire repart, rien n'est cacheté
      sfx('error', { vol: 0.4 }); e.classList.add('non'); await S.attendre(450); e.classList.remove('non')
    }
    cire.innerHTML = cireSVG(env.cachet)
    cire.classList.add('tape')
    sfx('chop', { vol: 0.7, rate: 0.8 }); buzz([20, 30, 35]); o.geste('cire')
    choix.innerHTML = ''
    await S.attendre(800)
    etape = 'timbre'
  }

  async function auTimbre() {
    if (!q('.co-env')) {
      hote.innerHTML = `<div class="co-cer">${enveloppeHTML(env, l)}<div class="co-choix"></div></div>`
      q('.co-env-cire')!.innerHTML = cireSVG(env.cachet)
    }
    const e = q('.co-env')!, choix = q('.co-choix')!
    choix.hidden = false
    e.classList.add('face')
    sfx('whoosh', { vol: 0.4 })
    await S.attendre(650)
    if (!S.vivant) return
    const coin = q('.co-env-timbre')!
    for (;;) {
      const t = await new Promise<string>(res => {
        if (o.raccourci?.timbre) {
          // Le dernier timbre attend au coin : un toucher le colle ; les autres restent à côté
          coin.innerHTML = `<button class="co-timbre-pret" data-t="${o.raccourci.timbre}" aria-label="Timbre"><span class="co-timbre">${gommeHTML(o.raccourci.timbre)}</span></button>`
        }
        choix.innerHTML = TIMBRES.map(t2 => `<button class="co-ti" data-t="${t2}" aria-label="Timbre"><span class="co-timbre">${gommeHTML(t2)}</span></button>`).join('')
        const pris = (ev: Event) => { const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-t]'); if (b) { offA(); offB(); res(b.dataset.t!) } }
        const offA = S.ecouter(choix, 'click', pris), offB = S.ecouter(coin, 'click', pris)
      })
      if (!S.vivant) return
      if (await ecrireLettre(timbrer(l, t))) { env.timbre = t; break }
      sfx('error', { vol: 0.4 }); e.classList.add('non'); await S.attendre(450); e.classList.remove('non')
    }
    choix.innerHTML = ''
    coin.innerHTML = `<span class="co-timbre colle">${gommeHTML(env.timbre)}</span>`
    sfx('drop', { vol: 0.6 })
    await S.attendre(520)
    coin.insertAdjacentHTML('beforeend', TAMPON)
    sfx('chop', { vol: 0.8 }); buzz([25, 20, 40]); o.geste('timbre')
    await S.attendre(800)
    etape = 'poster'
  }

  async function aLaBoite() {
    const b = o.boites, a = l.a
    b.figer(false)
    b.vue(a)
    b.porte(a, 1)
    sfx('creak', { vol: 0.5 })
    hote.innerHTML = `<div class="co-poste">${enveloppeHTML(env, l, true)}</div>`
    const p = q('.co-poste')!
    q('.co-env')!.classList.add('face')
    for (;;) {
      await new Promise<void>(res => {
        let id = -1, x0 = 0, y0 = 0, dx = 0, dy = 0
        const poser = () => {
          const r = p.getBoundingClientRect(), f = b.fente(a)
          const loin = Math.hypot(r.left + r.width / 2 - f.x, r.top + r.height / 2 - f.y)
          p.style.transform = `translate(calc(-50% + ${dx}px),${dy}px) scale(${Math.max(0.34, Math.min(1, loin / 330))})`
          return loin
        }
        const revenir = () => { id = -1; dx = dy = 0; p.classList.add('retour'); p.style.transform = '' }
        const offPause = onPause(pa => { if (pa && id >= 0) revenir() })
        S.garder(offPause)
        const offs = [
          offPause,
          S.ecouter(p, 'pointerdown', e => { if (id >= 0 || isPaused()) return; id = e.pointerId; x0 = e.clientX - dx; y0 = e.clientY - dy; p.classList.remove('retour') }),
          S.ecouter(window, 'pointermove', e => { if (e.pointerId !== id) return; dx = e.clientX - x0; dy = e.clientY - y0; poser() }),
          S.ecouter(window, 'pointercancel', e => { if (e.pointerId === id) revenir() }),
          S.ecouter(window, 'pointerup', e => {
            if (e.pointerId !== id) return
            if (isPaused()) { revenir(); return }
            id = -1
            if (poser() < 120) {
              const r = p.getBoundingClientRect(), f = b.fente(a)
              dx += f.x - (r.left + r.width / 2); dy += f.y - (r.top + r.height / 2)
              p.classList.add('dedans')
              p.style.transform = `translate(calc(-50% + ${dx}px),${dy}px) scale(0.12)`
              offs.forEach(fn => fn())
              res()
            } else { dx = dy = 0; p.classList.add('retour'); p.style.transform = '' }
          })
        ]
      })
      if (!S.vivant) return
      sfx('whoosh', { vol: 0.6 })
      if (await ecrireLettre(poster(l, Date.now()))) break
      // Pas gardée : l'enveloppe revient et se secoue ; le drapeau ne bouge pas
      await S.attendre(300)
      p.classList.remove('dedans'); p.classList.add('retour', 'non'); p.style.transform = ''
      sfx('error', { vol: 0.4 })
      await S.attendre(450)
      p.classList.remove('non')
    }
    await S.attendre(320)
    hote.innerHTML = ''
    b.lettre(a, true)
    b.porte(a, 0)
    await S.attendre(260)
    sfx('metal', { vol: 0.7 }); buzz(25)
    b.secouer(a)
    await S.attendre(350)
    b.drapeau(a, true)
    sfx('bong', { vol: 0.6 })
    b.etincelles(a)
    o.geste('poster')
    etape = 'fini'
    await S.attendre(1700)
    if (S.vivant) o.fini(l)
  }

  void derouler()
  return {
    nom: 'envoi',
    fermer: () => S.fermer(),
    etape: () => (etape === 'fini' ? null : etape),
    avantCachet: () => etape === 'plier' || etape === 'plier2' || etape === 'enveloppe' || (etape === 'cire' && l.etat === 'brouillon'),
    main(): HandMove | null {
      const cer = q('.co-cer')
      const r = (cer ?? hote).getBoundingClientRect()
      const P = (fx: number, fy: number) => ({ x: r.left + r.width * fx, y: r.top + r.height * fy })
      if (etape === 'plier') return { drag: [P(0.5, 0.72), P(0.5, 0.36)] }
      if (etape === 'plier2') return { drag: [P(0.32, 0.52), P(0.62, 0.52)] }
      if (etape === 'enveloppe') return { drag: [P(0.5, 0.25), P(0.5, 0.58)] }
      if (etape === 'cire') { const e = q('.co-env-cire'); return e ? { hold: e } : null }
      if (etape === 'timbre') return { choose: [...hote.querySelectorAll<HTMLElement>('.co-ti, .co-timbre-pret')].slice(0, 4) }
      if (etape === 'poster') { const p = q('.co-poste'); return p ? { drag: [p, o.boites.fente(l.a)] } : null }
      return null
    }
  }
}

/* ---------- L'arrivée ---------- */

export function ouvrirEnveloppe(hote: HTMLElement, x: Contexte, l0: Lettre, o: { geste(nom: string): void; garde(l: Lettre): void; fini(l: Lettre): void }): Ecran {
  const S = scene(hote, x)
  let etape: Etape = 'retourner', l = l0
  const q = <E extends HTMLElement = HTMLElement>(s: string) => hote.querySelector<E>(s)
  async function derouler() {
    const flat = await aplatir(l)
    if (!S.vivant) return
    const env = l.env!
    hote.innerHTML = `<div class="co-cer">${enveloppeHTML(env, l, true)}</div>`
    const cer = q('.co-cer')!, e = q('.co-env')!, cire = q('.co-env-cire')!
    cire.innerHTML = cireSVG(env.cachet)
    e.classList.add('face', 'arrive')
    sfx('whoosh', { vol: 0.5 })
    await S.toucher(e)
    if (!S.vivant) return
    e.classList.remove('face')
    sfx('whoosh', { vol: 0.4 }); o.geste('retourner')
    await S.attendre(650)
    etape = 'casser'
    cire.style.pointerEvents = 'auto'
    for (let k = 1; k <= 3; k++) {
      await new Promise<void>(r => { const off = S.ecouter(cire, 'pointerdown', () => { off(); r() }) })
      if (!S.vivant) return
      if (k < 3) { cire.dataset.f = String(k); cire.classList.remove('fend'); void cire.offsetWidth; cire.classList.add('fend'); sfx('glass', { vol: 0.35, rate: 0.6 + k * 0.1 }); buzz(18) }
    }
    // Le cachet cassé : la lettre est ouverte (gardée AVANT d'être montrée)
    const ouverte = ouvrir(l, Date.now())
    if (await x.coffre.garderLettre(ouverte)) { l = ouverte; o.garde(ouverte) }
    delete cire.dataset.f
    sfx('chop', { vol: 0.8 }); buzz([30, 20, 30]); o.geste('casser')
    cire.innerHTML = `<span class="co-moitie g">${cireSVG(env.cachet, 'clip-path:polygon(0 0,52% 0,44% 30%,56% 52%,42% 74%,50% 100%,0 100%)')}</span><span class="co-moitie d">${cireSVG(env.cachet, 'clip-path:polygon(52% 0,100% 0,100% 100%,50% 100%,42% 74%,56% 52%,44% 30%)')}</span>`
    await S.attendre(650)
    cire.innerHTML = ''
    e.classList.add('ouverte')
    sfx('cloth', { vol: 0.9 })
    await S.attendre(620)
    etape = 'sortir'
    const place = q('.co-env-place')!
    place.innerHTML = `<div class="co-carte dedans" style="--pap:${l.papier}"></div>`
    const carte = place.firstElementChild as HTMLElement
    await S.glisse(cer, 'y', -1, () => cer.clientHeight * 0.28, (p, tire) => { carte.classList.toggle('auto', !tire); carte.style.setProperty('--a', String(p)) })
    if (!S.vivant) return
    sfx('whoosh', { vol: 0.5 }); o.geste('sortir')
    await S.attendre(300)
    e.classList.add('part')
    carte.remove()
    // Elle se déplie toute seule : le pli de côté, puis le pli du bas
    cer.insertAdjacentHTML('beforeend', `<div class="co-pli2 auto" style="--pap:${l.papier};--a:1"><div class="co-p2-d"></div><div class="co-p2-g"><i class="av"></i><i class="ar"></i></div></div>`)
    const p2 = q('.co-pli2')!
    await S.attendre(260)
    p2.style.setProperty('--a', '0'); sfx('cloth', { vol: 0.7 })
    await S.attendre(420)
    p2.outerHTML = `<div class="co-pli auto" style="--img:url(${flat});--pap:${l.papier};--a:1"><div class="co-pli-h"></div><div class="co-pli-b"><i class="av"></i><i class="ar"></i></div></div>`
    const p1 = q('.co-pli')!
    await S.attendre(160)
    p1.style.setProperty('--a', '0'); sfx('cloth', { vol: 0.8, rate: 0.9 })
    await S.attendre(480)
    etape = 'fini'
    if (S.vivant) o.fini(l)
  }
  void derouler()
  return {
    nom: 'arrivee',
    fermer: () => S.fermer(),
    etape: () => (etape === 'fini' ? null : etape),
    main(): HandMove | null {
      if (etape === 'retourner') { const e = q('.co-env'); return e ? { tap: e } : null }
      if (etape === 'casser') { const c = q('.co-env-cire'); return c ? { taps: [c, c, c] } : null }
      if (etape === 'sortir') { const r = hote.getBoundingClientRect(); return { drag: [{ x: r.left + r.width / 2, y: r.top + r.height * 0.62 }, { x: r.left + r.width / 2, y: r.top + r.height * 0.3 }] } }
      return null
    }
  }
}
