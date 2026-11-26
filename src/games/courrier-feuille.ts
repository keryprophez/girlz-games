/* @version 2026-11-26 13:29 */
import { sfx } from '../core/sfx'
import { FARM, FARM_MORE } from '../core/critters'
import { critterPortraits } from '../core/portraits'
import { photoUrl } from '../core/sprites'
import { IMAGIER, type Theme } from '../core/imagier'
import { TRASH_ICON, trashButton, twoTaps, whoOf } from '../core/mine'
import { useFerme } from '../core/store'
import { isSoundOn } from '../core/audio'
import { isPaused } from '../core/session'
import { BRUSHES, BRUSH_ICON, BRUSH_NAME, ERASER_ICON, PALETTE, SIZES, heartD, starD, svgI, dab, segment, endStroke, newStroke, type Brush, type Stroke, type Trait } from '../core/pinceaux'
import { FW, FH, MAX_OBJETS, MAX_VOIX, borner, pincer, vierge, type Gomme, type Lettre, type Objet, type Texte, type Vocal, type XY } from '../core/courrier'
import { Saisie, sansEmojis, vide, vus } from '../core/saisie'
import { enregistrer, jouer, taire, barresHTML, MAX_S, type Prise, type Son } from '../core/vocal'
import type { HandMove } from '../core/hand'
import { clavier, EMOJIS as EMOJIS_COLLE } from '../core/clavier'
import type { Contexte, Ecran } from './courrier'

/* LA FEUILLE du Courrier : celle qu'on écrit (`ecrire`) et celle qu'on lit
   (`lire`). 1500 × 1000, comme l'Atelier : une lettre est la même quelle que
   soit la taille de l'écran.
   - Dessiner : les pinceaux de l'Atelier (`core/pinceaux.ts`), sans pot ni
     miroir ; plusieurs doigts, un trait chacun.
   - Écrire : notre clavier (`core/clavier.ts`) ; toucher la feuille pose un
     texte là, toucher une lettre d'un texte y met le curseur ; trois tailles,
     douze couleurs, trois écritures. Un texte laissé vide disparaît.
   - Coller : les animaux de la ferme, des émojis, des gommettes, les photos de
     l'imagier. Toucher pose ; tirer depuis le plateau pose sous le doigt.
   - Parler : toucher le micro, parler (30 s au plus), toucher encore : la voix
     se colle sur la feuille. Coupée en route (pause, autre mode, sortie), elle
     est gardée. Micro refusé : le bouton se barre, le reste marche.
   - Hors du dessin, un doigt déplace un objet, un second le tourne et
     l'agrandit (`pincer`) ; tiré sur la poubelle, il s'en va.
   - Annuler (douze gestes), Papier, Effacer (deux touchers), Envoyer.
   - Le brouillon est gardé tout seul (une demi-seconde après le dernier
     geste, et en quittant) : on le retrouve en revenant. */

export const PAPIERS = ['#FFFDF8', '#FFF1D6', '#FFE0EC', '#DDF0FF', '#E2F3DA', '#E6D3AE', '#1F1B2E']
const ANIMAUX = [...FARM, ...FARM_MORE]
const FORMES = ['coeur', 'etoile'].flatMap(f => ['#E8414F', '#FFA94D', '#FFD43B', '#5EC97B', '#4FB8E7', '#9C6ADE'].map(c => `forme:${f}:${c}`))
const THEMES: [Theme, string][] = [['ferme', 'Ferme'], ['monde', 'Animaux'], ['oiseaux', 'Oiseaux'], ['mer', 'Mer'], ['betes', 'Petites bêtes'], ['nature', 'Nature'], ['espace', 'Espace'], ['fruits', 'Fruits'], ['desserts', 'Gourmandises']]
const UNDO = 12

/** Les animaux de la ferme en images (rendus une fois, gardés sur le disque). */
export const portraits: Record<string, string> = {}
export async function chargerPortraits() { Object.assign(portraits, await critterPortraits(ANIMAUX, 220)) }

const imgSrc = (src: string) => src.startsWith('animal:') ? portraits[src.slice(7)] ?? '' : src.startsWith('photo:') ? photoUrl(src.slice(6)) : ''
export function gommeHTML(src: string): string {
  const [k, v, c] = src.split(':')
  if (k === 'emoji') return `<span class="co-g-emo">${v}</span>`
  if (k === 'forme') return `<svg class="co-g-forme" viewBox="0 0 48 48"><path d="${v === 'coeur' ? heartD(24, 26, 24) : starD(24, 25, 22)}" fill="${c}" stroke="#fff" stroke-width="3.5" stroke-linejoin="round" paint-order="stroke"/></svg>`
  return `<img class="co-g-${k}" src="${imgSrc(src)}" alt="" draggable="false" loading="lazy">`
}

/** Les trois écritures : ronde, à la main, d'école (les deux dernières attendent leurs polices : `cursive` en attendant). */
export const POLICES = ['Fredoka', 'Gochi Hand', 'Playwrite FR Moderne']
const POLICE_NOM: Record<string, string> = { 'Fredoka': 'Ronde', 'Gochi Hand': 'À la main', 'Playwrite FR Moderne': 'D’école' }
export const pile = (police: string) => police === 'Fredoka' ? "'Fredoka',system-ui,sans-serif" : `'${police}',cursive`
export const TAILLES = [60, 92, 140]
const esc = (c: string) => c.replace(/&/g, '&amp;').replace(/</g, '&lt;')
/** Le texte en lettres (chacune sa place, pour le curseur) ; `curseur` : la barre qui clignote. */
function lettresHTML(t: string, curseur: number | null) {
  const g = vus(t), barre = '<i class="co-caret"></i>'
  return g.map((c, i) => (curseur === i ? barre : '') + `<span data-i="${i}">${c === '\n' ? '\n' : esc(c)}</span>`).join('') + (curseur !== null && curseur >= g.length ? barre : '')
}

/** Pose un objet à sa place sur la feuille. */
export function poser(el: HTMLElement, o: Objet) {
  el.style.left = o.x / FW * 100 + '%'
  el.style.top = o.y / FH * 100 + '%'
  el.style.transform = `translate(-50%,-50%) rotate(${o.r}rad) scale(${o.s})`
}
/** Habille un objet. `curseur` : le texte qu'on écrit ; `couleur` : celle des voix (la fille qui écrit). */
export function habiller(el: HTMLElement, o: Objet, couleur: string, curseur: number | null = null) {
  el.className = 'co-obj co-obj-' + o.k
  if (o.k === 'gomme') el.innerHTML = gommeHTML(o.src)
  else if (o.k === 'texte') {
    el.style.color = o.couleur
    el.style.fontFamily = pile(o.police)
    el.style.fontSize = o.taille / FW * 100 + 'cqw'
    el.innerHTML = lettresHTML(o.t, curseur)
  } else el.innerHTML = barresHTML(o, couleur)
  poser(el, o)
}
/** Une voix touchée : elle joue (ou se tait), ses barres s'allument. */
export function ecouter(el: HTMLElement, s: Son) {
  const b = el.querySelector<HTMLElement>('.voix-b')
  if (!b) return
  if (b.classList.contains('on')) { taire(); return }
  const barres = el.querySelectorAll<HTMLElement>('.voix-barres b')
  let joue = false
  const son = isSoundOn()
  jouer(s, p => {
    if (p >= 0) joue = true
    // Une voix illisible (le son allumé, et rien n'a joué) : la bulle se barre
    if (p < 0 && !joue && son) b.classList.add('casse')
    b.classList.toggle('on', p >= 0)
    barres.forEach((x, i) => x.classList.toggle('lu', p >= 0 && i / barres.length <= p))
  }, { musique: 'meadow' })
}

/** Pose le dessin gardé sur le canvas ; rend vrai s'il a pu être décodé. */
async function peindre(cv: HTMLCanvasElement, p: Blob | null): Promise<boolean> {
  if (!p) return false
  try { const b = await createImageBitmap(p); cv.getContext('2d')!.drawImage(b, 0, 0, cv.width, cv.height); b.close(); return true } catch { return false /* dessin illisible : la feuille sans lui */ }
}
const versBlob = (cv: HTMLCanvasElement) => new Promise<Blob | null>(r => cv.toBlob(r, 'image/png'))

/* ---------- La feuille qu'on écrit ---------- */

type Mode = 'dessin' | 'texte' | 'colle' | 'voix'
const MIC = svgI('<rect x="17" y="4" width="14" height="24" rx="7" fill="#E8414F"/><path d="M10 22a14 14 0 0 0 28 0M24 36v7m-8 0h16" fill="none" stroke="#45362A" stroke-width="4" stroke-linecap="round"/>')
const MODE_ICON: Record<Mode, string> = {
  dessin: BRUSH_ICON.feutre('#FF6B81'),
  texte: svgI('<rect x="4" y="12" width="40" height="26" rx="6" fill="#4FB8E7"/><g fill="#fff"><rect x="9" y="17" width="5" height="5" rx="1.4"/><rect x="17" y="17" width="5" height="5" rx="1.4"/><rect x="25" y="17" width="5" height="5" rx="1.4"/><rect x="33" y="17" width="5" height="5" rx="1.4"/><rect x="9" y="25" width="5" height="5" rx="1.4"/><rect x="34" y="25" width="5" height="5" rx="1.4"/><rect x="17" y="26" width="14" height="5" rx="2"/></g>'),
  colle: svgI(`<path d="${starD(19, 20, 17)}" fill="#FFC533"/><path d="${heartD(34, 36, 18)}" fill="#FF6B81"/>`),
  voix: MIC
}
const MODE_NAME: Record<Mode, string> = { dessin: 'Dessiner', texte: 'Écrire', colle: 'Coller', voix: 'Parler' }
const ICON = {
  undo: svgI('<path d="M18 12 7 21l11 9" fill="none" stroke="#45362A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 21h19c8 0 13 5 13 11s-5 10-12 10h-6" fill="none" stroke="#45362A" stroke-width="5" stroke-linecap="round"/>'),
  paper: svgI('<rect x="12" y="6" width="26" height="34" rx="3" fill="#FFE0EC" stroke="#E0A8BC" stroke-width="2" transform="rotate(10 25 23)"/><rect x="9" y="8" width="26" height="34" rx="3" fill="#DDF0FF" stroke="#A8C8E0" stroke-width="2" transform="rotate(-6 22 25)"/><rect x="10" y="9" width="26" height="34" rx="3" fill="#FFFDF8" stroke="#B9AEA2" stroke-width="2"/>'),
  go: svgI('<rect x="4" y="12" width="40" height="27" rx="4" fill="#fff"/><path d="M5 14l19 15 19-15" fill="none" stroke="#FF7B6B" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>')
}
const outil = (id: string, icon: string, cap: string, cls = '') => `<span class="tool-item"><button class="sn-tool ${cls}" id="${id}" aria-label="${cap}">${icon}</button><i class="tool-cap">${cap}</i></span>`

/** Les sauvegardes en cours (un brouillon qui s'encode en sortant) : le jeu les attend avant de
    relire le coffre — « Rejouer » remontait le jeu et relisait l'ancien brouillon, puis l'écrasait. */
const enVol = new Set<Promise<unknown>>()
const suivre = <T>(p: Promise<T>): Promise<T> => { enVol.add(p); void p.finally(() => enVol.delete(p)); return p }
export const sauvegardes = () => Promise.all([...enVol]).then(() => undefined)

export interface Feuille extends Ecran { etat(): { mode: string; objets: number; peint: boolean; papier: string; annuler: number } }

export function ecrire(hote: HTMLElement, x: Contexte, l0: Lettre, o: { envoyer(l: Lettre): void; geste(nom: string): void; garde(l: Lettre): void }): Feuille {
  const { c } = x
  const l: Lettre = { ...l0, objets: l0.objets.filter(ob => ob.k !== 'texte' || !vide(ob.t)).map(ob => ({ ...ob })) }
  hote.innerHTML = `<div class="co-ed" data-mode="dessin">
    <div class="co-ed-g">${(Object.keys(MODE_NAME) as Mode[]).map(m => outil('coM-' + m, MODE_ICON[m], MODE_NAME[m])).join('')}</div>
    <div class="co-ed-desk"><div class="co-feuille co-ed-f"><canvas width="${FW}" height="${FH}"></canvas><div class="co-objs"></div></div><div class="co-bin" hidden>${TRASH_ICON}</div></div>
    <div class="co-ed-d">${outil('coUndo', ICON.undo, 'Annuler')}${outil('coPaper', ICON.paper, 'Papier')}${trashButton('coWipe', 'co-wipe', 'Tout effacer')}${outil('coGo', ICON.go, 'Envoyer', 'go')}</div>
    <div class="co-papiers" hidden>${PAPIERS.map(p => `<button data-p="${p}" style="background:${p}" aria-label="Papier"></button>`).join('')}</div>
    <div class="co-tray"></div></div>`
  const q = <E extends HTMLElement = HTMLElement>(s: string) => hote.querySelector<E>(s)!
  const ed = q('.co-ed'), sheet = q('.co-ed-f'), cv = q<HTMLCanvasElement>('canvas'), g = cv.getContext('2d')!, objs = q('.co-objs'), tray = q('.co-tray'), bin = q('.co-bin')
  let mode: Mode = 'dessin', vivant = true, peint = false
  const st = { brush: 'feutre' as Brush, color: PALETTE[8], size: 1, eraser: false, hue: Math.random() * 360, tc: '#1C64C8', police: POLICES[0], taille: TAILLES[1] }
  const couleurVoix = whoOf(x.qui).color
  let sel: Texte | null = null, saisie: Saisie | null = null
  let prise: Prise | null = null, attente = false, micBarre = false
  const muet = () => ed.classList.toggle('muet', !useFerme.getState().sound)
  const offSon = useFerme.subscribe(muet)
  muet()
  const els = new Map<Objet, HTMLElement>()
  const annuler: (() => void)[] = []
  const pousser = (f: () => void) => { annuler.push(f); if (annuler.length > UNDO) annuler.shift() }

  sheet.style.background = l.papier
  let charge = !l.peinture
  void peindre(cv, l.peinture).then(lu => { if (lu) peint = true; charge = true })

  /* --- Le brouillon --- */
  let garde = 0, enAttente = false
  const plusTard = () => { enAttente = true; c.cancel(garde); garde = c.after(500, () => void garder()) }
  const garder = () => suivre((async () => {
    c.cancel(garde)
    if (!enAttente) return
    enAttente = false
    l.peinture = peint ? await versBlob(cv) : charge ? null : l0.peinture
    if (await x.coffre.garderLettre(l)) o.garde({ ...l })
  })())

  /* --- Dessiner --- */
  const traits = new Map<number, Stroke>()
  const trait = (): Trait => ({ g, brush: st.brush, color: st.color, px: SIZES[st.size], eraser: st.eraser, hue: st.hue, mats: [[1, 0, 0, 1, 0, 0]] })
  const surFeuille = (e: { clientX: number; clientY: number }): XY => { const r = sheet.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * FW, y: (e.clientY - r.top) / r.height * FH } }
  const instantane = () => {
    const b = document.createElement('canvas')
    b.width = FW; b.height = FH
    b.getContext('2d')!.drawImage(cv, 0, 0)
    const avant = peint
    pousser(() => { g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, FW, FH); g.drawImage(b, 0, 0); peint = avant })
  }
  sheet.addEventListener('pointerdown', e => {
    if (mode === 'texte' && !(e.target as HTMLElement).closest('.co-obj')) {
      // Un texte neuf là où le doigt touche (pas trop près des bords : il pousse vers la droite)
      const p = surFeuille(e)
      const ob = texteNeuf({ x: Math.min(FW * 0.75, Math.max(FW * 0.25, p.x)), y: p.y })
      if (ajouter(ob)) choisir(ob)
      return
    }
    if (mode !== 'dessin' || (e.target as HTMLElement).closest('.co-obj')) return
    e.preventDefault()
    if (!traits.size) instantane()
    if (st.brush === 'arcenciel') st.hue = (st.hue + 47) % 360
    try { sheet.setPointerCapture(e.pointerId) } catch { /* doigt déjà levé */ }
    const p = surFeuille(e)
    traits.set(e.pointerId, newStroke(p.x, p.y))
    dab(trait(), p.x, p.y)
    if (!st.eraser) peint = true
    o.geste('dessiner')
  })
  sheet.addEventListener('pointermove', e => {
    const s = traits.get(e.pointerId)
    if (!s) return
    const evs = e.getCoalescedEvents?.() ?? []
    for (const ev of evs.length ? evs : [e]) { const p = surFeuille(ev); if (Math.hypot(p.x - s.x, p.y - s.y) > 1.5) segment(trait(), s, p.x, p.y) }
  })
  const finTrait = (e: PointerEvent) => {
    const s = traits.get(e.pointerId)
    if (!s) return
    endStroke(trait(), s)
    traits.delete(e.pointerId)
    if (!traits.size) plusTard()
  }
  sheet.addEventListener('pointerup', finTrait)
  sheet.addEventListener('pointercancel', finTrait)

  /* --- Les objets : un doigt déplace, un second tourne et agrandit --- */
  function monter(ob: Objet, pop = false) {
    const el = document.createElement('div')
    els.set(ob, el)
    habiller(el, ob, couleurVoix, sel === ob ? saisie?.curseur ?? null : null)
    objs.append(el)
    if (pop) { el.classList.add('pop'); c.after(420, () => el.classList.remove('pop')) }
    el.addEventListener('pointerdown', e => { if (mode !== 'dessin') prendre(e, ob, el) })
  }
  function ajouter(ob: Objet): boolean {
    if (!vivant) { l.objets.push(ob); return true } // une voix arrivée en sortant : la sortie la garde
    if (l.objets.length >= MAX_OBJETS) return false
    l.objets.push(ob)
    monter(ob, true)
    pousser(() => retirer(ob, false))
    plusTard()
    return true
  }
  function retirer(ob: Objet, annulable = true) {
    const i = l.objets.indexOf(ob)
    if (i < 0) return
    l.objets.splice(i, 1)
    els.get(ob)?.remove()
    els.delete(ob)
    if (ob === sel) { sel = null; saisie = null }
    if (annulable) pousser(() => { l.objets.splice(i, 0, ob); monter(ob) })
    plusTard()
  }
  const tenu = { ob: null as Objet | null, el: null as HTMLElement | null, pts: new Map<number, XY>(), bouge: 0, avant: null as Objet | null, lettre: -1 }
  function prendre(e: PointerEvent, ob: Objet, el: HTMLElement) {
    if (tenu.ob) return
    e.preventDefault()
    tenu.ob = ob; tenu.el = el; tenu.bouge = 0; tenu.avant = { ...ob }
    const sp = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')
    tenu.lettre = sp ? +sp.dataset.i! + 1 : -1
    tenu.pts.clear()
    tenu.pts.set(e.pointerId, surFeuille(e))
    el.classList.add('pris')
    const i = l.objets.indexOf(ob) // l'objet tenu passe dessus
    l.objets.splice(i, 1); l.objets.push(ob)
    objs.append(el)
  }
  const surBin = (e: PointerEvent) => { const r = bin.getBoundingClientRect(); return Math.hypot(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2) < r.width * 0.75 }
  const bas = (e: PointerEvent) => { if (tenu.ob && tenu.pts.size === 1 && !tenu.pts.has(e.pointerId)) tenu.pts.set(e.pointerId, surFeuille(e)) }
  const bouge = (e: PointerEvent) => {
    const a = tenu.pts.get(e.pointerId), ob = tenu.ob
    if (!ob || !a) return
    const p = surFeuille(e)
    if (tenu.pts.size === 1) {
      tenu.bouge += Math.hypot(p.x - a.x, p.y - a.y)
      if (tenu.bouge < 10) return
      bin.hidden = false
      Object.assign(ob, borner({ ...ob, x: ob.x + p.x - a.x, y: ob.y + p.y - a.y }))
      bin.classList.toggle('on', surBin(e))
    } else {
      const b = [...tenu.pts].find(([id]) => id !== e.pointerId)![1]
      Object.assign(ob, borner(pincer(ob, a, b, p, b)))
      tenu.bouge += 10
      o.geste('pincer')
    }
    tenu.pts.set(e.pointerId, p)
    poser(tenu.el!, ob)
  }
  const haut = (e: PointerEvent) => {
    if (!tenu.ob || !tenu.pts.delete(e.pointerId) || tenu.pts.size) return
    const ob = tenu.ob, el = tenu.el!, avant = tenu.avant!
    tenu.ob = null
    el.classList.remove('pris')
    const jeter = !bin.hidden && surBin(e)
    bin.hidden = true; bin.classList.remove('on')
    if (jeter) { sfx('drop'); retirer(ob); return }
    if (tenu.bouge >= 10) { pousser(() => { Object.assign(ob, avant); const e2 = els.get(ob); if (e2) poser(e2, ob) }); plusTard(); return }
    // Un toucher : un texte se rouvre (le curseur sur la lettre touchée), une voix joue
    if (ob.k === 'texte') { if (mode !== 'texte') changer('texte'); choisir(ob, tenu.lettre >= 0 ? tenu.lettre : undefined) }
    if (ob.k === 'voix') ecouter(el, ob)
  }

  /* --- Écrire --- */
  const texteNeuf = (p: XY): Texte => ({ k: 'texte', t: '', x: p.x, y: p.y, s: 1, r: 0, couleur: st.tc, police: st.police, taille: st.taille })
  function repeindre(ob: Texte) {
    const el = els.get(ob)
    if (!el) return
    habiller(el, ob, couleurVoix, sel === ob && saisie ? saisie.curseur : null)
    el.classList.toggle('edit', sel === ob)
  }
  /** Le texte qu'on écrit (null : aucun) ; l'ancien, laissé vide, disparaît. */
  function choisir(ob: Texte | null, a?: number) {
    const avant = sel
    sel = ob
    if (avant && avant !== ob && els.has(avant)) { if (vide(avant.t)) retirer(avant, false); else repeindre(avant) }
    saisie = ob ? new Saisie(ob.t) : null
    if (ob && saisie && a !== undefined) saisie.placer(a)
    if (ob) repeindre(ob)
  }
  const actif = (): Texte | null => {
    if (sel) return sel
    const ob = texteNeuf({ x: FW / 2, y: FH * 0.35 })
    if (!ajouter(ob)) return null
    choisir(ob)
    return ob
  }
  /** Une ligne qui déborde de la feuille passe à la ligne, à son dernier espace. */
  const couper = (ob: Texte) => {
    const el = els.get(ob)
    if (!el || !saisie || el.offsetWidth * ob.s <= sheet.clientWidth * 0.92 || saisie.curseur < vus(ob.t).length) return
    saisie.couper()
    ob.t = saisie.texte
    repeindre(ob)
  }
  const frappe = (f: (s: Saisie) => void) => {
    const ob = actif()
    if (!ob || !saisie) return
    f(saisie)
    ob.t = saisie.texte
    repeindre(ob)
    couper(ob)
    plusTard()
    o.geste('ecrire')
  }
  const kb = clavier({
    char: c => frappe(s => s.poser(c)),
    effacer: () => { if (sel && saisie) frappe(s => s.effacer()) },
    entrer: () => frappe(s => s.poser('\n'))
  })

  /* --- Parler --- */
  const nVoix = () => l.objets.filter(ob => ob.k === 'voix').length
  const coller = (son: Son | null) => {
    if (!son) return
    const n = nVoix()
    const ob: Vocal = borner({ k: 'voix', ...son, x: FW * (0.3 + (n % 3) * 0.2), y: FH * (0.84 - (n % 2) * 0.14), s: 1, r: (Math.random() - 0.5) * 0.08 })
    if (ajouter(ob)) { sfx('pluck', { vol: 0.6 }); o.geste('parler') }
    if (vivant && mode === 'voix') plateau()
  }
  /** Arrête la prise en cours et colle ce qui a été dit. */
  const finirPrise = async () => { const p = prise; prise = null; if (p) coller(await p.arreter()) }
  async function micro() {
    if (attente) return
    if (prise) { await finirPrise(); return }
    if (micBarre || nVoix() >= MAX_VOIX) { sfx('error', { vol: 0.3 }); q('#coMic')?.classList.add('non'); c.after(450, () => hote.querySelector('#coMic')?.classList.remove('non')); return }
    attente = true
    try {
      prise = await enregistrer({
        niveau: (v, t) => {
          const onde = hote.querySelector('.co-onde'), chrono = hote.querySelector('.co-chrono')
          if (onde) { const b = document.createElement('b'); b.style.height = 8 + v * 92 + '%'; onde.append(b); while (onde.children.length > 90) onde.firstChild!.remove() }
          if (chrono) chrono.textContent = `${Math.min(MAX_S, Math.floor(t))} s`
        },
        fini: son => { prise = null; coller(son) }
      }, { musique: 'meadow', encore: () => vivant && mode === 'voix' && !isPaused() })
      if (prise) sfx('select', { vol: 0.5 })
    } catch { micBarre = true }
    attente = false
    if (vivant && mode === 'voix') plateau()
  }
  window.addEventListener('pointerdown', bas)
  window.addEventListener('pointermove', bouge)
  window.addEventListener('pointerup', haut)
  window.addEventListener('pointercancel', haut)

  /* --- Les plateaux --- */
  let onglet: 'animal' | 'emoji' | 'forme' | 'photo' = 'animal', theme: Theme = 'ferme'
  const pal = (cur: string) => `<div class="co-pal">${PALETTE.map(p => `<button data-c="${p}" class="${p === cur ? 'sel' : ''}" style="background:${p}" aria-label="Couleur"></button>`).join('')}</div>`
  function plateau() {
    tray.className = 'co-tray t-' + mode
    ed.dataset.mode = mode
    ;(Object.keys(MODE_NAME) as Mode[]).forEach(m => q('#coM-' + m).classList.toggle('sel', m === mode))
    ed.classList.toggle('tape', mode === 'texte')
    if (mode === 'texte') {
      const cur = sel ?? { couleur: st.tc, taille: st.taille, police: st.police }
      tray.innerHTML = `<div class="co-rang">${pal(cur.couleur).replace(/data-c=/g, 'data-tc=')}
        <div class="co-tailles">${TAILLES.map((t, i) => `<button data-t="${t}" class="${cur.taille === t ? 'sel' : ''}" aria-label="Taille"><span style="font-size:${14 + i * 8}px">A</span></button>`).join('')}</div>
        <div class="co-tailles co-polices">${POLICES.map(f => `<button data-f="${f}" class="${cur.police === f ? 'sel' : ''}" aria-label="${POLICE_NOM[f]}"><span style="font-family:${pile(f).replace(/'/g, '&#39;')}">ab</span></button>`).join('')}</div></div>`
      tray.append(kb.el)
      return
    }
    if (mode === 'voix') {
      const plein = nVoix() >= MAX_VOIX
      tray.innerHTML = `<div class="co-micro"><button class="sn-tool co-mic${prise ? ' on' : ''}${micBarre || plein ? ' barre' : ''}" id="coMic" aria-label="Parler">${MIC}</button><div class="co-onde"></div><span class="co-chrono"></span></div>`
      return
    }
    if (mode === 'dessin') {
      tray.innerHTML = `<div class="co-rang">${BRUSHES.map(b => `<span class="tool-item"><button class="sn-tool co-mini ${!st.eraser && st.brush === b ? 'sel' : ''}" data-b="${b}" aria-label="${BRUSH_NAME[b]}">${BRUSH_ICON[b](st.color)}</button><i class="tool-cap">${BRUSH_NAME[b]}</i></span>`).join('')}
        <span class="tool-item"><button class="sn-tool co-mini ${st.eraser ? 'sel' : ''}" data-b="gomme" aria-label="Gomme">${ERASER_ICON}</button><i class="tool-cap">Gomme</i></span></div>
        <div class="co-rang">${pal(st.color)}<div class="co-tailles">${SIZES.map((_, i) => `<button data-s="${i}" class="${st.size === i ? 'sel' : ''}" aria-label="Taille"><b style="width:${10 + i * 9}px;height:${10 + i * 9}px"></b></button>`).join('')}</div></div>`
    } else {
      const T = { animal: portraits.chick ? `<img src="${portraits.chick}" alt="">` : '', emoji: '<span class="co-g-emo">😀</span>', forme: gommeHTML('forme:coeur:#E8414F'), photo: `<img class="co-g-photo" src="${photoUrl('cat')}" alt="">` }
      const N = { animal: 'Animaux', emoji: 'Émojis', forme: 'Gommettes', photo: 'Photos' }
      const items = onglet === 'animal' ? ANIMAUX.map(a => 'animal:' + a) : onglet === 'emoji' ? EMOJIS_COLLE.map(e => 'emoji:' + e)
        : onglet === 'forme' ? FORMES : IMAGIER.filter(p => p.theme === theme).map(p => 'photo:' + p.id)
      tray.innerHTML = `<div class="co-rang">${(Object.keys(T) as (keyof typeof T)[]).map(k => `<span class="tool-item"><button class="sn-tool co-mini ${onglet === k ? 'sel' : ''}" data-tab="${k}" aria-label="${N[k]}">${T[k]}</button><i class="tool-cap">${N[k]}</i></span>`).join('')}
        ${onglet === 'photo' ? `<div class="co-themes">${THEMES.map(([t, n]) => `<button class="${t === theme ? 'sel' : ''}" data-th="${t}">${n}</button>`).join('')}</div>` : ''}</div>
        <div class="co-bande">${items.map(s => `<button class="co-collant" data-src="${s}" aria-label="Autocollant">${gommeHTML(s)}</button>`).join('')}</div>`
    }
  }
  tray.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!b || b.classList.contains('co-collant') || b.closest('.clav')) return
    if (b.id === 'coMic') { void micro(); return }
    const d = b.dataset
    sfx('click', { vol: 0.4 })
    if (d.b) { if (d.b === 'gomme') st.eraser = true; else { st.eraser = false; st.brush = d.b as Brush } }
    if (d.s) st.size = +d.s
    if (d.c) { st.color = d.c; st.eraser = false }
    if (d.tc || d.t || d.f) {
      if (d.tc) st.tc = d.tc
      if (d.t) st.taille = +d.t
      if (d.f) st.police = d.f
      if (sel) { sel.couleur = st.tc; sel.taille = st.taille; sel.police = st.police; repeindre(sel); plusTard() }
    }
    if (d.tab) onglet = d.tab as typeof onglet
    if (d.th) theme = d.th as Theme
    plateau()
  })
  // Un autocollant : touché, il se pose au milieu ; tiré vers la feuille, il suit le doigt
  tray.addEventListener('pointerdown', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.co-collant')
    if (!b) return
    const x0 = e.clientX, y0 = e.clientY, src = b.dataset.src!, id = e.pointerId
    let fantome: HTMLElement | null = null
    const coller = (p: XY) => {
      const ob: Gomme = borner({ k: 'gomme', src, x: p.x, y: p.y, s: 1, r: (Math.random() - 0.5) * 0.24 })
      if (ajouter(ob)) { sfx('pluck', { vol: 0.5 }); o.geste('coller') } else { sfx('error', { vol: 0.3 }); b.classList.add('non'); c.after(450, () => b.classList.remove('non')) }
    }
    const mv = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return
      if (!fantome && y0 - ev.clientY > 14) { fantome = document.createElement('div'); fantome.className = 'co-fantome'; fantome.innerHTML = gommeHTML(src); document.body.append(fantome) }
      if (fantome) { fantome.style.left = ev.clientX + 'px'; fantome.style.top = ev.clientY + 'px' }
    }
    const fin = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', fin); window.removeEventListener('pointercancel', fin)
      if (!vivant) { fantome?.remove(); return }
      if (fantome) {
        fantome.remove()
        const r = sheet.getBoundingClientRect()
        if (ev.clientX > r.left && ev.clientX < r.right && ev.clientY > r.top && ev.clientY < r.bottom) coller(surFeuille(ev))
      } else if (ev.type === 'pointerup' && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 10) coller({ x: FW * (0.3 + Math.random() * 0.4), y: FH * (0.3 + Math.random() * 0.4) })
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', fin); window.addEventListener('pointercancel', fin)
  })

  /* --- Les boutons de droite et de gauche --- */
  const changer = (m: Mode) => {
    if (prise && m !== 'voix') void finirPrise()
    if (m !== 'texte') choisir(null)
    mode = m
    plateau()
  }
  ;(Object.keys(MODE_NAME) as Mode[]).forEach(m => { q('#coM-' + m).onclick = () => { sfx('click', { vol: 0.5 }); changer(m) } })
  q('#coUndo').onclick = () => { const f = annuler.pop(); if (f) { sfx('switch', { vol: 0.5 }); f(); plusTard() } else sfx('error', { vol: 0.3 }) }
  const papiers = q('.co-papiers')
  q('#coPaper').onclick = () => { papiers.hidden = !papiers.hidden; sfx('click', { vol: 0.4 }) }
  papiers.onclick = e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-p]')
    if (!b) return
    const avant = l.papier
    l.papier = b.dataset.p!
    sheet.style.background = l.papier
    pousser(() => { l.papier = avant; sheet.style.background = avant })
    sfx('cloth', { vol: 0.5 })
    papiers.hidden = true
    plusTard()
  }
  const effacer = twoTaps(q('#coWipe'), c, () => {
    instantane()
    const avant = [...l.objets]
    pousser(() => { for (const ob of avant) { l.objets.push(ob); monter(ob) } })
    g.clearRect(0, 0, FW, FH)
    peint = false
    for (const ob of avant) { els.get(ob)?.remove(); els.delete(ob) }
    l.objets.length = 0
    sel = null; saisie = null
    // les deux gestes (feuille, objets) s'annulent d'un coup
    const b = annuler.pop()!, a = annuler.pop()!
    pousser(() => { b(); a() })
    sfx('whoosh', { vol: 0.6, rate: 0.7 })
    plusTard()
  })
  q('#coWipe').onclick = () => effacer.tap()
  let parti = false // deux doigts, un double toucher : un seul envoi
  q('#coGo').onclick = async () => {
    if (parti) return
    choisir(null)
    if (prise) await finirPrise()
    if (vierge(l, peint)) { sfx('error', { vol: 0.4 }); q('#coGo').classList.add('non'); c.after(500, () => q('#coGo').classList.remove('non')); return }
    enAttente = true
    await garder()
    if (!vivant) return
    if (parti) return
    parti = true
    sfx('confirm', { vol: 0.5 })
    o.envoyer({ ...l })
  }

  for (const ob of l.objets) monter(ob)
  plateau()

  const fermer = () => {
    if (!vivant) return
    vivant = false
    if (sel && vide(sel.t)) { const i = l.objets.indexOf(sel); if (i >= 0) l.objets.splice(i, 1) }
    sel = null
    // Ce qui a été dit est gardé (ajouter() sait qu'on est parti), puis le brouillon : suivis jusqu'au bout
    void suivre((async () => { await finirPrise(); enAttente = true; await garder() })())
    effacer.disarm()
    kb.detruire()
    taire()
    offSon()
    window.removeEventListener('pointerdown', bas)
    window.removeEventListener('pointermove', bouge)
    window.removeEventListener('pointerup', haut)
    window.removeEventListener('pointercancel', haut)
    hote.innerHTML = ''
  }
  return {
    nom: 'feuille',
    fermer,
    etape: () => ({ dessin: 'dessiner', texte: 'ecrire', colle: 'coller', voix: 'parler' } as const)[mode],
    main(): HandMove | null {
      if (mode === 'voix') return prise ? null : { tap: q('#coMic') }
      if (mode === 'texte') { const r = sheet.getBoundingClientRect(); return sel ? null : { tap: { x: r.left + r.width / 2, y: r.top + r.height * 0.35 } } }
      if (mode === 'dessin' && !peint && !l.objets.length) { const r = sheet.getBoundingClientRect(); return { trace: [0.3, 0.45, 0.55, 0.7].map((f, i) => ({ x: r.left + r.width * f, y: r.top + r.height * (0.45 + (i % 2) * 0.12) })) } }
      if (l.objets.length && mode !== 'dessin') { const el = els.get(l.objets[l.objets.length - 1]); return el ? { pinch: el } : null }
      return { tap: q('#coGo') }
    },
    etat: () => ({ mode, objets: l.objets.length, peint, papier: l.papier, annuler: annuler.length })
  }
}

/* ---------- La feuille lue ---------- */

/** La feuille en lecture : toucher une voix la joue, toucher un texte le fait lire (`dire`). */
export function lire(hote: HTMLElement, l: Lettre, o: { dire?(t: string): void } = {}) {
  hote.innerHTML = `<div class="co-feuille co-lue" style="background:${l.papier}"><canvas width="${FW}" height="${FH}"></canvas><div class="co-objs"></div></div>`
  void peindre(hote.querySelector('canvas')!, l.peinture)
  const objs = hote.querySelector<HTMLElement>('.co-objs')!
  for (const ob of l.objets) {
    const el = document.createElement('div')
    habiller(el, ob, whoOf(l.de).color)
    if (ob.k === 'voix') el.onclick = () => ecouter(el, ob)
    if (ob.k === 'texte' && o.dire) el.onclick = () => { const t = sansEmojis(ob.t); if (!vide(t)) { taire(); o.dire!(t) } }
    objs.append(el)
  }
}

/* ---------- La feuille mise à plat (le pliage, les souvenirs) ---------- */

const image = (src: string) => new Promise<HTMLImageElement | null>(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src })
export async function aplatir(l: Lettre, largeur = 1080): Promise<string> {
  const cv = document.createElement('canvas')
  cv.width = largeur; cv.height = Math.round(largeur * FH / FW)
  const g = cv.getContext('2d')!, k = largeur / FW
  g.scale(k, k)
  g.fillStyle = l.papier
  g.fillRect(0, 0, FW, FH)
  if (l.peinture) { try { const b = await createImageBitmap(l.peinture); g.drawImage(b, 0, 0, FW, FH); b.close() } catch { /* illisible */ } }
  for (const ob of l.objets) {
    g.save()
    g.translate(ob.x, ob.y); g.rotate(ob.r); g.scale(ob.s, ob.s)
    g.textAlign = 'center'; g.textBaseline = 'middle'
    if (ob.k === 'texte') {
      g.fillStyle = ob.couleur
      g.font = `${ob.taille}px ${pile(ob.police)}`
      const lignes = ob.t.split('\n'), h = ob.taille * 1.25
      lignes.forEach((t, i) => g.fillText(t, 0, (i - (lignes.length - 1) / 2) * h))
    } else if (ob.k === 'voix') {
      g.shadowColor = 'rgba(69,54,42,.3)'; g.shadowBlur = 14 * k; g.shadowOffsetY = 4 * k
      g.fillStyle = '#fff'; g.beginPath(); g.roundRect(-210, -62, 420, 124, 62); g.fill()
      g.shadowColor = 'transparent'
      g.fillStyle = whoOf(l.de).color; g.beginPath(); g.arc(-148, 0, 46, 0, 6.3); g.fill()
      ob.pics.forEach((p, i) => { const hh = p * 74; g.beginPath(); g.roundRect(-84 + i * 250 / ob.pics.length, -hh / 2, 6, hh, 3); g.fill() })
    } else if (ob.k === 'gomme') {
      const [kind, v, col] = ob.src.split(':')
      if (kind === 'emoji') { g.font = '170px system-ui,sans-serif'; g.fillText(v, 0, 10) }
      else if (kind === 'forme') { g.scale(4.2, 4.2); g.translate(-24, -25); g.fillStyle = col; g.fill(new Path2D(v === 'coeur' ? heartD(24, 26, 24) : starD(24, 25, 22))) }
      else {
        const im = await image(imgSrc(ob.src))
        if (im && kind === 'animal') g.drawImage(im, -120, -120, 240, 240)
        else if (im) { g.fillStyle = '#fff'; g.beginPath(); g.roundRect(-112, -112, 224, 224, 34); g.fill(); g.beginPath(); g.roundRect(-100, -100, 200, 200, 26); g.clip(); g.drawImage(im, -100, -100, 200, 200) }
      }
    }
    g.restore()
  }
  return cv.toDataURL('image/webp', 0.86)
}
