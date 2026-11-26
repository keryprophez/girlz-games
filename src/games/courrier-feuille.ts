/* @version 2026-11-26 11:29 */
import { sfx } from '../core/sfx'
import { FARM, FARM_MORE } from '../core/critters'
import { critterPortraits } from '../core/portraits'
import { photoUrl } from '../core/sprites'
import { IMAGIER, type Theme } from '../core/imagier'
import { TRASH_ICON, trashButton, twoTaps } from '../core/mine'
import { BRUSHES, BRUSH_ICON, BRUSH_NAME, ERASER_ICON, PALETTE, SIZES, heartD, starD, svgI, dab, segment, endStroke, newStroke, type Brush, type Stroke, type Trait } from '../core/pinceaux'
import { FW, FH, MAX_OBJETS, borner, pincer, vierge, type Gomme, type Lettre, type Objet, type XY } from '../core/courrier'
import type { HandMove } from '../core/hand'
import { EMOJIS as EMOJIS_COLLE } from '../core/clavier'
import type { Contexte, Ecran } from './courrier'

/* LA FEUILLE du Courrier : celle qu'on écrit (`ecrire`) et celle qu'on lit
   (`lire`). 1500 × 1000, comme l'Atelier : une lettre est la même quelle que
   soit la taille de l'écran.
   - Dessiner : les pinceaux de l'Atelier (`core/pinceaux.ts`), sans pot ni
     miroir ; plusieurs doigts, un trait chacun.
   - Coller : les animaux de la ferme, des émojis, des gommettes, les photos de
     l'imagier. Toucher pose ; tirer depuis le plateau pose sous le doigt.
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

/** Pose un objet à sa place sur la feuille. */
export function poser(el: HTMLElement, o: Objet) {
  el.style.left = o.x / FW * 100 + '%'
  el.style.top = o.y / FH * 100 + '%'
  el.style.transform = `translate(-50%,-50%) rotate(${o.r}rad) scale(${o.s})`
}
/** Habille un objet (sauf les textes et les voix, que la tâche suivante dessine). */
export function habiller(el: HTMLElement, o: Objet) {
  el.className = 'co-obj co-obj-' + o.k
  if (o.k === 'gomme') el.innerHTML = gommeHTML(o.src)
  poser(el, o)
}

async function peindre(cv: HTMLCanvasElement, p: Blob | null) {
  if (!p) return
  try { const b = await createImageBitmap(p); cv.getContext('2d')!.drawImage(b, 0, 0, cv.width, cv.height); b.close() } catch { /* dessin illisible : la feuille sans lui */ }
}
const versBlob = (cv: HTMLCanvasElement) => new Promise<Blob | null>(r => cv.toBlob(r, 'image/png'))
function blanc(cv: HTMLCanvasElement) {
  const c = document.createElement('canvas')
  c.width = 60; c.height = 40
  const g = c.getContext('2d')!
  g.drawImage(cv, 0, 0, 60, 40)
  return !g.getImageData(0, 0, 60, 40).data.some((v, i) => i % 4 === 3 && v > 8)
}

/* ---------- La feuille qu'on écrit ---------- */

type Mode = 'dessin' | 'colle'
const MODE_ICON: Record<Mode, string> = {
  dessin: BRUSH_ICON.feutre('#FF6B81'),
  colle: svgI(`<path d="${starD(19, 20, 17)}" fill="#FFC533"/><path d="${heartD(34, 36, 18)}" fill="#FF6B81"/>`)
}
const MODE_NAME: Record<Mode, string> = { dessin: 'Dessiner', colle: 'Coller' }
const ICON = {
  undo: svgI('<path d="M18 12 7 21l11 9" fill="none" stroke="#45362A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 21h19c8 0 13 5 13 11s-5 10-12 10h-6" fill="none" stroke="#45362A" stroke-width="5" stroke-linecap="round"/>'),
  paper: svgI('<rect x="12" y="6" width="26" height="34" rx="3" fill="#FFE0EC" stroke="#E0A8BC" stroke-width="2" transform="rotate(10 25 23)"/><rect x="9" y="8" width="26" height="34" rx="3" fill="#DDF0FF" stroke="#A8C8E0" stroke-width="2" transform="rotate(-6 22 25)"/><rect x="10" y="9" width="26" height="34" rx="3" fill="#FFFDF8" stroke="#B9AEA2" stroke-width="2"/>'),
  go: svgI('<rect x="4" y="12" width="40" height="27" rx="4" fill="#fff"/><path d="M5 14l19 15 19-15" fill="none" stroke="#FF7B6B" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>')
}
const outil = (id: string, icon: string, cap: string, cls = '') => `<span class="tool-item"><button class="sn-tool ${cls}" id="${id}" aria-label="${cap}">${icon}</button><i class="tool-cap">${cap}</i></span>`

export interface Feuille extends Ecran { etat(): { mode: string; objets: number; peint: boolean; papier: string; annuler: number } }

export function ecrire(hote: HTMLElement, x: Contexte, l0: Lettre, o: { envoyer(l: Lettre): void; geste(nom: string): void; garde(l: Lettre): void }): Feuille {
  const { c } = x
  const l: Lettre = { ...l0, objets: l0.objets.map(ob => ({ ...ob })) }
  hote.innerHTML = `<div class="co-ed" data-mode="dessin">
    <div class="co-ed-g">${(Object.keys(MODE_NAME) as Mode[]).map(m => outil('coM-' + m, MODE_ICON[m], MODE_NAME[m])).join('')}</div>
    <div class="co-ed-desk"><div class="co-feuille co-ed-f"><canvas width="${FW}" height="${FH}"></canvas><div class="co-objs"></div></div><div class="co-bin" hidden>${TRASH_ICON}</div></div>
    <div class="co-ed-d">${outil('coUndo', ICON.undo, 'Annuler')}${outil('coPaper', ICON.paper, 'Papier')}${trashButton('coWipe', 'co-wipe', 'Tout effacer')}${outil('coGo', ICON.go, 'Envoyer', 'go')}</div>
    <div class="co-papiers" hidden>${PAPIERS.map(p => `<button data-p="${p}" style="background:${p}" aria-label="Papier"></button>`).join('')}</div>
    <div class="co-tray"></div></div>`
  const q = <E extends HTMLElement = HTMLElement>(s: string) => hote.querySelector<E>(s)!
  const ed = q('.co-ed'), sheet = q('.co-ed-f'), cv = q<HTMLCanvasElement>('canvas'), g = cv.getContext('2d')!, objs = q('.co-objs'), tray = q('.co-tray'), bin = q('.co-bin')
  let mode: Mode = 'dessin', vivant = true, peint = false
  const st = { brush: 'feutre' as Brush, color: PALETTE[8], size: 1, eraser: false, hue: Math.random() * 360 }
  const els = new Map<Objet, HTMLElement>()
  const annuler: (() => void)[] = []
  const pousser = (f: () => void) => { annuler.push(f); if (annuler.length > UNDO) annuler.shift() }

  sheet.style.background = l.papier
  void peindre(cv, l.peinture).then(() => { if (vivant && l.peinture) peint = !blanc(cv) })

  /* --- Le brouillon --- */
  let garde = 0, enAttente = false
  const plusTard = () => { enAttente = true; c.cancel(garde); garde = c.after(500, () => void garder()) }
  const garder = async () => {
    c.cancel(garde)
    if (!enAttente) return
    enAttente = false
    l.peinture = peint ? await versBlob(cv) : null
    if (await x.coffre.garderLettre(l)) o.garde({ ...l })
  }

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
    habiller(el, ob)
    objs.append(el)
    if (pop) { el.classList.add('pop'); c.after(420, () => el.classList.remove('pop')) }
    el.addEventListener('pointerdown', e => { if (mode !== 'dessin') prendre(e, ob, el) })
  }
  function ajouter(ob: Objet): boolean {
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
    if (annulable) pousser(() => { l.objets.splice(i, 0, ob); monter(ob) })
    plusTard()
  }
  const tenu = { ob: null as Objet | null, el: null as HTMLElement | null, pts: new Map<number, XY>(), bouge: 0, avant: null as Objet | null }
  function prendre(e: PointerEvent, ob: Objet, el: HTMLElement) {
    if (tenu.ob) return
    e.preventDefault()
    tenu.ob = ob; tenu.el = el; tenu.bouge = 0; tenu.avant = { ...ob }
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
    if (tenu.bouge >= 10) { pousser(() => { Object.assign(ob, avant); const e2 = els.get(ob); if (e2) poser(e2, ob) }); plusTard() }
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
    if (!b || b.classList.contains('co-collant')) return
    const d = b.dataset
    sfx('click', { vol: 0.4 })
    if (d.b) { if (d.b === 'gomme') st.eraser = true; else { st.eraser = false; st.brush = d.b as Brush } }
    if (d.s) st.size = +d.s
    if (d.c) { st.color = d.c; st.eraser = false }
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
  ;(Object.keys(MODE_NAME) as Mode[]).forEach(m => { q('#coM-' + m).onclick = () => { sfx('click', { vol: 0.5 }); mode = m; plateau() } })
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
    // les deux gestes (feuille, objets) s'annulent d'un coup
    const b = annuler.pop()!, a = annuler.pop()!
    pousser(() => { b(); a() })
    sfx('whoosh', { vol: 0.6, rate: 0.7 })
    plusTard()
  })
  q('#coWipe').onclick = () => effacer.tap()
  q('#coGo').onclick = async () => {
    if (vierge(l, peint)) { sfx('error', { vol: 0.4 }); q('#coGo').classList.add('non'); c.after(500, () => q('#coGo').classList.remove('non')); return }
    enAttente = true
    await garder()
    if (!vivant) return
    sfx('confirm', { vol: 0.5 })
    o.envoyer({ ...l })
  }

  for (const ob of l.objets) monter(ob)
  plateau()

  const fermer = () => {
    if (!vivant) return
    vivant = false
    void garder()
    effacer.disarm()
    window.removeEventListener('pointerdown', bas)
    window.removeEventListener('pointermove', bouge)
    window.removeEventListener('pointerup', haut)
    window.removeEventListener('pointercancel', haut)
    hote.innerHTML = ''
  }
  return {
    nom: 'feuille',
    fermer,
    main(): HandMove | null {
      if (mode === 'dessin' && !peint && !l.objets.length) { const r = sheet.getBoundingClientRect(); return { trace: [0.3, 0.45, 0.55, 0.7].map((f, i) => ({ x: r.left + r.width * f, y: r.top + r.height * (0.45 + (i % 2) * 0.12) })) } }
      if (l.objets.length && mode !== 'dessin') { const el = els.get(l.objets[l.objets.length - 1]); return el ? { pinch: el } : null }
      return { tap: q('#coGo') }
    },
    etat: () => ({ mode, objets: l.objets.length, peint, papier: l.papier, annuler: annuler.length })
  }
}

/* ---------- La feuille lue ---------- */

export function lire(hote: HTMLElement, l: Lettre) {
  hote.innerHTML = `<div class="co-feuille" style="background:${l.papier}"><canvas width="${FW}" height="${FH}"></canvas><div class="co-objs"></div></div>`
  void peindre(hote.querySelector('canvas')!, l.peinture)
  const objs = hote.querySelector<HTMLElement>('.co-objs')!
  for (const ob of l.objets) { const el = document.createElement('div'); habiller(el, ob); objs.append(el) }
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
    if (ob.k === 'gomme') {
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
