// LA FEUILLE : on dessine, on écrit, on colle, on parle ; et la même feuille, en lecture.
import { sfx } from '../../src/core/sfx'
import { say } from '../../src/core/voice'
import { FARM, FARM_MORE } from '../../src/core/critters'
import { photoUrl } from '../../src/core/sprites'
import { whoOf, TRASH_ICON, type Who } from '../../src/core/mine'
import { coffre, uid, W, H, type Gomme, type Lettre, type Obj, type Texte, type Voix } from './coffre'
import { Peintre, BRUSHES, BRUSH_ICON, BRUSH_NAME, ERASER_ICON, PALETTE, SIZES, heartD, starD } from './pinceaux'
import { clavier, EMOJIS, graphemes } from './clavier'
import { barres, brancher, enregistrer, MAX_S, taire, type Prise } from './voix'

export const PAPIERS = ['#FFFDF8', '#FFF1D6', '#FFE0EC', '#DDF0FF', '#E2F3DA', '#E6D3AE', '#1F1B2E']
const FONTS = ['Fredoka', 'Gochi Hand', 'Playwrite FR Moderne']
const TAILLES = [60, 92, 140]
const ANIMAUX = [...FARM, ...FARM_MORE]
const PHOTOS = ['cat', 'rabbit', 'horse', 'dog', 'duck', 'cow', 'sheep', 'pig', 'chick', 'moon', 'sun', 'earth']
const FORMES = ['coeur', 'etoile'].flatMap(f => ['#E8414F', '#FFA94D', '#FFD43B', '#5EC97B', '#4FB8E7', '#9C6ADE'].map(c => `forme:${f}:${c}`))

/** Les animaux de la ferme en images, rendus une fois au départ. */
export const portraits: Record<string, string> = {}

export const imgSrc = (src: string) => src.startsWith('animal:') ? portraits[src.slice(7)] ?? '' : src.startsWith('photo:') ? photoUrl(src.slice(6)) : ''
export function gommeHTML(src: string): string {
  const [k, v, c] = src.split(':')
  if (k === 'emoji') return `<span class="g-emo">${v}</span>`
  if (k === 'forme') return `<svg class="g-forme" viewBox="0 0 48 48"><path d="${v === 'coeur' ? heartD(24, 26, 24) : starD(24, 25, 22)}" fill="${c}" stroke="#fff" stroke-width="3.5" stroke-linejoin="round" paint-order="stroke"/></svg>`
  return `<img class="g-${k}" src="${imgSrc(src)}" alt="" draggable="false">`
}

const esc = (c: string) => c.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const lettresHTML = (t: string, caret: number | null) => {
  const g = graphemes(t)
  const bar = '<i class="caret"></i>'
  return g.map((c, i) => (caret === i ? bar : '') + (c === '\n' ? `<span data-i="${i}" class="nl">\n</span>` : `<span data-i="${i}">${esc(c)}</span>`)).join('') + (caret !== null && caret >= g.length ? bar : '') || (caret !== null ? bar : '')
}

/** Pose (ou repose) un objet à sa place sur la feuille. */
function poser(el: HTMLElement, o: Obj) {
  el.style.left = o.x / W * 100 + '%'
  el.style.top = o.y / H * 100 + '%'
  el.style.transform = `translate(-50%,-50%) rotate(${o.r}rad) scale(${o.s})`
}
function habiller(el: HTMLElement, o: Obj, caret: number | null = null) {
  el.className = 'obj obj-' + o.k
  if (o.k === 'texte') {
    el.style.color = o.color
    el.style.fontFamily = `'${o.font}',system-ui,sans-serif`
    el.style.fontSize = o.size / W * 100 + 'cqw'
    el.innerHTML = lettresHTML(o.t, caret)
  } else if (o.k === 'gomme') el.innerHTML = gommeHTML(o.src)
  else el.innerHTML = barres(o, o.color)
  poser(el, o)
}

async function peindre(cv: HTMLCanvasElement, paint: Blob | null) {
  if (!paint) return
  const b = await createImageBitmap(paint)
  cv.getContext('2d')!.drawImage(b, 0, 0, cv.width, cv.height)
  b.close()
}

/* ---------- La feuille lue ---------- */

/** La feuille en lecture dans `host` : les voix se touchent, « Écouter » lit le texte. */
export function lire(host: HTMLElement, l: Lettre) {
  host.innerHTML = `<div class="feuille" style="background:${l.paper}"><canvas width="${W}" height="${H}"></canvas><div class="objs"></div></div>`
  const objs = host.querySelector<HTMLElement>('.objs')!
  void peindre(host.querySelector('canvas')!, l.paint)
  for (const o of l.objs) {
    const el = document.createElement('div')
    habiller(el, o)
    if (o.k === 'voix') el.onclick = () => brancher(el, o)
    if (o.k === 'texte') el.onclick = () => say(o.t)
    objs.append(el)
  }
}
export const texteDe = (l: Lettre) => l.objs.filter((o): o is Texte => o.k === 'texte' && !!o.t.trim()).sort((a, b) => a.y - b.y).map(o => o.t).join('. ')

/* ---------- La feuille mise à plat (pliage, souvenirs) ---------- */

const loadImg = (src: string) => new Promise<HTMLImageElement | null>(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src })
export async function aplatir(l: Lettre, w = 1080): Promise<string> {
  const c = document.createElement('canvas')
  c.width = w; c.height = Math.round(w * H / W)
  const g = c.getContext('2d')!, k = w / W
  g.scale(k, k)
  g.fillStyle = l.paper
  g.fillRect(0, 0, W, H)
  if (l.paint) { const b = await createImageBitmap(l.paint); g.drawImage(b, 0, 0, W, H); b.close() }
  for (const o of l.objs) {
    g.save()
    g.translate(o.x, o.y); g.rotate(o.r); g.scale(o.s, o.s)
    g.textAlign = 'center'; g.textBaseline = 'middle'
    if (o.k === 'texte') {
      g.fillStyle = o.color
      g.font = `${o.size}px '${o.font}',system-ui,sans-serif`
      const lines = o.t.split('\n'), lh = o.size * 1.25
      lines.forEach((t, i) => g.fillText(t, 0, (i - (lines.length - 1) / 2) * lh))
    } else if (o.k === 'gomme') {
      const [kind, v, col] = o.src.split(':')
      if (kind === 'emoji') { g.font = '170px system-ui,sans-serif'; g.fillText(v, 0, 10) }
      else if (kind === 'forme') {
        g.scale(4.2, 4.2); g.translate(-24, -25)
        g.fillStyle = col
        g.fill(new Path2D(v === 'coeur' ? heartD(24, 26, 24) : starD(24, 25, 22)))
      } else {
        const im = await loadImg(imgSrc(o.src))
        if (im && kind === 'animal') g.drawImage(im, -120, -120, 240, 240)
        else if (im) { g.fillStyle = '#fff'; g.beginPath(); g.roundRect(-112, -112, 224, 224, 34); g.fill(); g.beginPath(); g.roundRect(-100, -100, 200, 200, 26); g.clip(); g.drawImage(im, -100, -100, 200, 200) }
      }
    } else {
      g.shadowColor = 'rgba(69,54,42,.3)'; g.shadowBlur = 14 * k; g.shadowOffsetY = 4 * k; g.fillStyle = '#fff'; g.beginPath(); g.roundRect(-210, -62, 420, 124, 62); g.fill(); g.shadowColor = 'transparent'
      g.fillStyle = o.color; g.beginPath(); g.arc(-148, 0, 46, 0, 6.3); g.fill()
      o.peaks.forEach((p, i) => { const h = p * 74; g.beginPath(); g.roundRect(-84 + i * 250 / o.peaks.length, -h / 2, 6, h, 3); g.fill() })
    }
    g.restore()
  }
  return c.toDataURL('image/webp', 0.86)
}

/* ---------- La feuille qu'on écrit ---------- */

type Mode = 'dessin' | 'texte' | 'colle' | 'voix'
const I = (body: string, sz = 38) => `<svg viewBox="0 0 48 48" width="${sz}" height="${sz}">${body}</svg>`
const MODE_ICON: Record<Mode, string> = {
  dessin: I('<path d="M31 5l12 12-15 15-12-12z" fill="#C99457"/><path d="M31 5l12 12-5 5-12-12z" fill="#E8B676"/><path d="M16 20l12 12-4 3c-2 6-8 9-17 9 2-7 1-13 6-17z" fill="#FF6B81"/><path d="M16 20l12 12-3 2-11-11z" fill="#9AA3AD"/>'),
  texte: I('<rect x="4" y="12" width="40" height="26" rx="6" fill="#4FB8E7"/><g fill="#fff"><rect x="9" y="17" width="5" height="5" rx="1.4"/><rect x="17" y="17" width="5" height="5" rx="1.4"/><rect x="25" y="17" width="5" height="5" rx="1.4"/><rect x="33" y="17" width="5" height="5" rx="1.4"/><rect x="9" y="25" width="5" height="5" rx="1.4"/><rect x="34" y="25" width="5" height="5" rx="1.4"/><rect x="17" y="26" width="14" height="5" rx="2"/></g>'),
  colle: I(`<path d="${starD(19, 20, 17)}" fill="#FFC533"/><path d="${heartD(34, 36, 18)}" fill="#FF6B81"/>`),
  voix: I('<rect x="17" y="4" width="14" height="24" rx="7" fill="#E8414F"/><path d="M10 22a14 14 0 0 0 28 0M24 36v7m-8 0h16" fill="none" stroke="#45362A" stroke-width="4" stroke-linecap="round"/>')
}
const MODE_NAME: Record<Mode, string> = { dessin: 'Dessiner', texte: 'Écrire', colle: 'Coller', voix: 'Parler' }
const UNDO = I('<path d="M18 12 7 21l11 9" fill="none" stroke="#45362A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 21h19c8 0 13 5 13 11s-5 10-12 10h-6" fill="none" stroke="#45362A" stroke-width="5" stroke-linecap="round"/>', 32)
const PAPER = I('<rect x="12" y="6" width="26" height="34" rx="3" fill="#FFE0EC" stroke="#E0A8BC" stroke-width="2" transform="rotate(10 25 23)"/><rect x="9" y="8" width="26" height="34" rx="3" fill="#DDF0FF" stroke="#A8C8E0" stroke-width="2" transform="rotate(-6 22 25)"/><rect x="10" y="9" width="26" height="34" rx="3" fill="#FFFDF8" stroke="#B9AEA2" stroke-width="2"/>', 34)
const GO = I('<rect x="4" y="12" width="40" height="27" rx="4" fill="#fff"/><path d="M5 14l19 15 19-15" fill="none" stroke="#FF7B6B" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>', 40)
export const outil = (id: string, icon: string, cap: string, cls = '') => `<span class="outil"><button class="rond ${cls}" id="${id}" aria-label="${cap}">${icon}</button><i>${cap}</i></span>`

export interface Editeur { close(): void }

export function ecrire(host: HTMLElement, from: Who, to: Who, draft: Lettre | null, o: { done(l: Lettre): void; quit(): void; consigne(t: string): void }): Editeur {
  const l: Lettre = draft ?? { id: uid(), from, to, at: Date.now(), paper: PAPIERS[0], paint: null, objs: [], env: null, opened: false }
  const me = whoOf(from)
  host.innerHTML = `<div class="ed">
    <div class="ed-g">${(Object.keys(MODE_NAME) as Mode[]).map(m => outil('m-' + m, MODE_ICON[m], MODE_NAME[m])).join('')}</div>
    <div class="ed-desk"><div class="feuille ed-f"><canvas width="${W}" height="${H}"></canvas><div class="objs"></div></div><div class="ed-bin" hidden>${TRASH_ICON}</div></div>
    <div class="ed-d">${outil('e-undo', UNDO, 'Annuler')}${outil('e-paper', PAPER, 'Papier')}${outil('e-go', GO, 'Envoyer', 'go')}</div>
    <div class="ed-papers" hidden>${PAPIERS.map(p => `<button data-p="${p}" style="background:${p}" aria-label="Papier"></button>`).join('')}</div>
    <div class="ed-tray"></div></div>`
  const q = <E extends HTMLElement = HTMLElement>(s: string) => host.querySelector<E>(s)!
  const sheet = q('.ed-f'), cv = q<HTMLCanvasElement>('canvas'), objs = q('.objs'), tray = q('.ed-tray'), bin = q('.ed-bin'), ed = q('.ed')
  let mode: Mode = 'dessin', alive = true
  let sel: Obj | null = null, caret = 0
  let prise: Prise | null = null
  const els = new Map<Obj, HTMLElement>()
  const undos: (() => void)[] = []
  const pushUndo = (f: () => void) => { undos.push(f); if (undos.length > 12) undos.shift() }

  sheet.style.background = l.paper
  void peindre(cv, l.paint)

  // Le brouillon, gardé tout seul
  let saveT = 0
  const save = () => { clearTimeout(saveT); saveT = window.setTimeout(() => void flush(), 500) }
  const flush = async () => {
    clearTimeout(saveT)
    l.paint = await new Promise<Blob | null>(r => cv.toBlob(r))
    if (alive) await coffre.setDraft(from, l)
  }

  const p = new Peintre(cv, {
    before() { const b = document.createElement('canvas'); b.width = W; b.height = H; b.getContext('2d')!.drawImage(cv, 0, 0); pushUndo(() => { const g = cv.getContext('2d')!; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H); g.drawImage(b, 0, 0) }) },
    after: save
  })
  p.color = PALETTE[8]
  p.listen(sheet, () => mode === 'dessin')

  /* --- Les objets : un doigt déplace, un second tourne et agrandit --- */
  function mount(ob: Obj, pop = false) {
    const el = document.createElement('div')
    els.set(ob, el)
    habiller(el, ob)
    objs.append(el)
    if (pop) { el.classList.add('pop'); setTimeout(() => el.classList.remove('pop'), 420) }
    el.addEventListener('pointerdown', e => { if (mode !== 'dessin') grab(e, ob, el) })
  }
  function add(ob: Obj) {
    l.objs.push(ob)
    mount(ob, true)
    pushUndo(() => remove(ob))
    save()
  }
  function remove(ob: Obj) {
    const i = l.objs.indexOf(ob)
    if (i >= 0) l.objs.splice(i, 1)
    els.get(ob)?.remove()
    els.delete(ob)
    if (sel === ob) { sel = null; if (mode === 'texte') showTray() }
    save()
  }
  const drag = { ob: null as Obj | null, el: null as HTMLElement | null, pts: new Map<number, { x: number; y: number }>(), moved: 0, span: null as HTMLElement | null }
  function grab(e: PointerEvent, ob: Obj, el: HTMLElement) {
    if (drag.ob) return
    e.preventDefault()
    drag.ob = ob; drag.el = el; drag.moved = 0
    drag.span = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')
    drag.pts.clear()
    drag.pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    el.classList.add('pris')
    const i = l.objs.indexOf(ob) // dessus
    l.objs.splice(i, 1); l.objs.push(ob)
    objs.append(el)
  }
  const overBin = (x: number, y: number) => { const r = bin.getBoundingClientRect(); return Math.hypot(x - r.left - r.width / 2, y - r.top - r.height / 2) < r.width * 0.75 }
  const onDown = (e: PointerEvent) => { if (drag.ob && drag.pts.size === 1 && !drag.pts.has(e.pointerId)) drag.pts.set(e.pointerId, { x: e.clientX, y: e.clientY }) }
  const onMove = (e: PointerEvent) => {
    const a = drag.pts.get(e.pointerId)
    if (!drag.ob || !a) return
    const r = sheet.getBoundingClientRect(), k = W / r.width
    if (drag.pts.size === 1) {
      const dx = e.clientX - a.x, dy = e.clientY - a.y
      drag.moved += Math.hypot(dx, dy)
      if (drag.moved < 8) return
      bin.hidden = false
      drag.ob.x += dx * k; drag.ob.y += dy * k
      bin.classList.toggle('on', overBin(e.clientX, e.clientY))
    } else {
      const b = [...drag.pts].find(([id]) => id !== e.pointerId)![1]
      const d0 = Math.hypot(a.x - b.x, a.y - b.y), d1 = Math.hypot(e.clientX - b.x, e.clientY - b.y)
      const t0 = Math.atan2(a.y - b.y, a.x - b.x), t1 = Math.atan2(e.clientY - b.y, e.clientX - b.x)
      drag.ob.s = Math.min(5, Math.max(0.35, drag.ob.s * d1 / Math.max(20, d0)))
      drag.ob.r += Math.atan2(Math.sin(t1 - t0), Math.cos(t1 - t0))
      drag.ob.x += (e.clientX - a.x) / 2 * k; drag.ob.y += (e.clientY - a.y) / 2 * k
      drag.moved += 9
    }
    drag.ob.x = Math.min(W - 10, Math.max(10, drag.ob.x)); drag.ob.y = Math.min(H + 40, Math.max(10, drag.ob.y))
    a.x = e.clientX; a.y = e.clientY
    poser(drag.el!, drag.ob)
  }
  const onUp = (e: PointerEvent) => {
    if (!drag.ob || !drag.pts.delete(e.pointerId)) return
    if (drag.pts.size) return
    const ob = drag.ob, el = drag.el!
    drag.ob = null
    el.classList.remove('pris')
    const drop = !bin.hidden && overBin(e.clientX, e.clientY)
    bin.hidden = true; bin.classList.remove('on')
    if (drop) { sfx('drop'); remove(ob); return }
    if (drag.moved < 8) {
      if (ob.k === 'voix') brancher(el, ob)
      if (ob.k === 'texte') { const at = drag.span ? +drag.span.dataset.i! + 1 : graphemes(ob.t).length; setMode('texte'); pick(ob, at) }
      if (ob.k === 'gomme') { sfx('click', { vol: 0.4 }); ob.s = ob.s > 2 ? 0.8 : ob.s * 1.25; poser(el, ob) }
    }
    save()
  }
  window.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)

  /* --- Le texte --- */
  const repaint = (ob: Texte) => habiller(els.get(ob)!, ob, sel === ob ? caret : null)
  function pick(ob: Texte | null, at?: number) {
    const old = sel
    sel = ob
    if (old && old !== ob && old.k === 'texte' && els.has(old)) { if (!old.t.trim()) remove(old); else repaint(old) }
    if (ob) { caret = at ?? graphemes(ob.t).length; repaint(ob); els.get(ob)!.classList.add('edit') }
  }
  const textNow = (): Texte => {
    if (sel?.k === 'texte') return sel
    const ob: Texte = { k: 'texte', t: '', x: W / 2, y: H * 0.4, s: 1, r: 0, color: st.color, font: st.font, size: st.size }
    add(ob)
    pick(ob)
    return ob
  }
  const st = { color: '#1C64C8', font: FONTS[0], size: TAILLES[1] }
  const kb = clavier({
    char(c) { const ob = textNow(), g = graphemes(ob.t); g.splice(caret, 0, c); ob.t = g.join(''); caret = Math.min(caret + 1, graphemes(ob.t).length); repaint(ob); els.get(ob)!.classList.add('edit'); wrap(ob); save() },
    back() { if (sel?.k !== 'texte' || !caret) return; const g = graphemes(sel.t); g.splice(caret - 1, 1); sel.t = g.join(''); caret--; repaint(sel); els.get(sel)!.classList.add('edit'); save() },
    enter() { const ob = textNow(), g = graphemes(ob.t); g.splice(caret, 0, '\n'); ob.t = g.join(''); caret++; repaint(ob); els.get(ob)!.classList.add('edit'); save() }
  })
  /** Une ligne qui déborde de la feuille passe à la suivante, au dernier espace. */
  function wrap(ob: Texte) {
    const el = els.get(ob)!
    if (el.offsetWidth <= sheet.clientWidth * 0.92 || caret < graphemes(ob.t).length) return
    const i = ob.t.lastIndexOf(' ')
    if (i < 0 || ob.t.indexOf('\n', i) >= 0) return
    ob.t = ob.t.slice(0, i) + '\n' + ob.t.slice(i + 1)
    repaint(ob); el.classList.add('edit')
  }
  sheet.addEventListener('pointerdown', e => {
    if (mode === 'texte' && !(e.target as HTMLElement).closest('.obj')) {
      const r = sheet.getBoundingClientRect()
      pick(null)
      const ob: Texte = { k: 'texte', t: '', x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H, s: 1, r: 0, color: st.color, font: st.font, size: st.size }
      ob.x = Math.min(W * 0.75, Math.max(W * 0.25, ob.x))
      add(ob); pick(ob)
    }
  })

  /* --- Les plateaux du bas --- */
  const pal = (cur: string) => `<div class="pal">${PALETTE.map(c => `<button data-c="${c}" class="${c === cur ? 'sel' : ''}" style="background:${c}" aria-label="Couleur"></button>`).join('')}</div>`
  let tab: 'animal' | 'emoji' | 'forme' | 'photo' = 'animal'
  function showTray() {
    tray.className = 'ed-tray t-' + mode
    ed.classList.toggle('tape', mode === 'texte')
    if (mode === 'dessin') {
      tray.innerHTML = `<div class="rang">${BRUSHES.map(b => `<span class="outil mini"><button class="rond ${!p.eraser && p.brush === b ? 'sel' : ''}" data-b="${b}" aria-label="${BRUSH_NAME[b]}">${BRUSH_ICON[b](p.color)}</button><i>${BRUSH_NAME[b]}</i></span>`).join('')}
        <span class="outil mini"><button class="rond ${p.eraser ? 'sel' : ''}" data-b="gomme" aria-label="Gomme">${ERASER_ICON}</button><i>Gomme</i></span></div>
        <div class="rang">${pal(p.color)}<div class="tailles">${SIZES.map((s, i) => `<button data-s="${i}" class="${p.size === i ? 'sel' : ''}" aria-label="Taille"><b style="width:${10 + i * 9}px;height:${10 + i * 9}px"></b></button>`).join('')}</div></div>`
    } else if (mode === 'texte') {
      const cur = sel?.k === 'texte' ? sel : st
      tray.innerHTML = `<div class="rang">${pal(cur.color)}<div class="tailles">${TAILLES.map(s => `<button data-t="${s}" class="${cur.size === s ? 'sel' : ''}" aria-label="Taille"><span style="font-size:${14 + TAILLES.indexOf(s) * 8}px">A</span></button>`).join('')}</div>
        <div class="tailles">${FONTS.map(f => `<button data-f="${f}" class="${cur.font === f ? 'sel' : ''}" aria-label="Écriture"><span style="font-family:'${f}';font-size:22px">ab</span></button>`).join('')}</div></div>`
      tray.append(kb.el)
    } else if (mode === 'colle') {
      const T = { animal: portraits.chick ? `<img src="${portraits.chick}" alt="">` : '🐥', emoji: '<span>😀</span>', forme: gommeHTML('forme:coeur:#E8414F'), photo: `<img class="g-photo" src="${photoUrl('cat')}" alt="">` }
      const N = { animal: 'Animaux', emoji: 'Émojis', forme: 'Gommettes', photo: 'Photos' }
      const items = tab === 'animal' ? ANIMAUX.map(a => 'animal:' + a) : tab === 'emoji' ? EMOJIS.map(e => 'emoji:' + e) : tab === 'forme' ? FORMES : PHOTOS.map(f => 'photo:' + f)
      tray.innerHTML = `<div class="rang onglets">${(Object.keys(T) as (keyof typeof T)[]).map(k => `<span class="outil mini"><button class="rond ${tab === k ? 'sel' : ''}" data-tab="${k}" aria-label="${N[k]}">${T[k]}</button><i>${N[k]}</i></span>`).join('')}</div>
        <div class="bande">${items.map(s => `<button class="collant" data-src="${s}" aria-label="Autocollant">${gommeHTML(s)}</button>`).join('')}</div>`
    } else {
      tray.innerHTML = `<div class="micro"><button class="mic" id="mic" aria-label="Parler">${MODE_ICON.voix}</button><div class="onde"></div><span class="chrono"></span></div>
        <p class="note-micro">Cette page privée n’a pas le droit au micro : un cri de la ferme remplace la voix. Dans le jeu, ce sera la vraie.</p>`
    }
  }
  tray.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!b) return
    const d = b.dataset
    if (d.b) { sfx('click', { vol: 0.4 }); if (d.b === 'gomme') p.eraser = true; else { p.eraser = false; p.brush = d.b as never } showTray() }
    if (d.s) { sfx('click', { vol: 0.4 }); p.size = +d.s; showTray() }
    if (d.c || d.t || d.f) {
      sfx('click', { vol: 0.4 })
      if (mode === 'dessin') { p.color = d.c!; p.eraser = false } else {
        const cur = sel?.k === 'texte' ? sel : null
        if (d.c) { st.color = d.c; if (cur) cur.color = d.c }
        if (d.t) { st.size = +d.t; if (cur) cur.size = +d.t }
        if (d.f) { st.font = d.f; if (cur) cur.font = d.f }
        if (cur) { repaint(cur); els.get(cur)!.classList.add('edit'); save() }
      }
      showTray()
    }
    if (d.tab) { sfx('click', { vol: 0.4 }); tab = d.tab as never; showTray() }
    if (b.id === 'mic') void mic()
  })
  // Un autocollant : touché, il se pose ; tiré vers la feuille, il suit le doigt
  tray.addEventListener('pointerdown', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.collant')
    if (!b) return
    const x0 = e.clientX, y0 = e.clientY, src = b.dataset.src!, id = e.pointerId
    let ghost: HTMLElement | null = null
    const put = (x: number, y: number) => { const r = sheet.getBoundingClientRect(); sfx('pluck', { vol: 0.5 }); add({ k: 'gomme', src, x: Math.min(W - 60, Math.max(60, (x - r.left) / r.width * W)), y: Math.min(H - 60, Math.max(60, (y - r.top) / r.height * H)), s: 1, r: (Math.random() - 0.5) * 0.24 } as Gomme) }
    const mv = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return
      if (!ghost && y0 - ev.clientY > 14) { ghost = document.createElement('div'); ghost.className = 'fantome'; ghost.innerHTML = gommeHTML(src); document.body.append(ghost) }
      if (ghost) { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px' }
    }
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end)
      if (ghost) { ghost.remove(); const r = sheet.getBoundingClientRect(); if (ev.clientX > r.left && ev.clientX < r.right && ev.clientY > r.top && ev.clientY < r.bottom) put(ev.clientX, ev.clientY) }
      else if (ev.type === 'pointerup' && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 10) { const r = sheet.getBoundingClientRect(); put(r.left + r.width * (0.3 + Math.random() * 0.4), r.top + r.height * (0.3 + Math.random() * 0.4)) }
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end)
  })

  /* --- La voix --- */
  let busy = false
  async function mic() {
    if (busy) return
    if (prise) { await stopMic(); return }
    busy = true
    taire()
    const onde = q('.onde')
    prise = await enregistrer((v, t) => {
      const bar = document.createElement('b')
      bar.style.height = 8 + v * 92 + '%'
      onde.append(bar)
      while (onde.children.length > 90) onde.firstChild!.remove()
      const c = host.querySelector('.chrono')
      if (c) c.textContent = `${Math.min(MAX_S, Math.floor(t))} s`
      host.querySelector<HTMLElement>('.mic')?.style.setProperty('--p', String(Math.min(1, t / MAX_S)))
    }, () => void stopMic())
    busy = false
    if (!alive) { prise.cancel(); prise = null; return }
    sfx('select', { vol: 0.5 })
    q('.mic').classList.add('on')
    if (document.body.classList.contains('sans-micro')) o.consigne('Pas de micro sur cette page : un cri de la ferme remplacera la voix.')
  }
  async function stopMic() {
    const pr = prise
    prise = null
    if (!pr) return
    const s = await pr.stop()
    if (!alive) return
    showTray()
    if (!s) return
    sfx('pluck')
    const n = l.objs.filter(x => x.k === 'voix').length
    add({ k: 'voix', ...s, x: W * 0.5 + (n % 3 - 1) * 60, y: H * (0.84 - (n % 4) * 0.13), s: 1, r: (Math.random() - 0.5) * 0.08, color: me.color } as Voix)
  }

  /* --- Les modes --- */
  function setMode(m: Mode) {
    if (prise && m !== 'voix') { prise.cancel(); prise = null }
    if (m !== 'texte') pick(null)
    mode = m
    ed.dataset.mode = m
    ;(Object.keys(MODE_NAME) as Mode[]).forEach(k => q('#m-' + k).classList.toggle('sel', k === m))
    showTray()
    o.consigne({
      dessin: 'Dessiner : le doigt peint.',
      texte: 'Écrire : toucher la feuille pose le texte là ; toucher un mot pour le corriger.',
      colle: 'Coller : toucher ou glisser. Deux doigts : tourner, agrandir. Glisser sur la poubelle : jeter.',
      voix: 'Parler : toucher le micro, parler, toucher encore. La voix se colle sur la feuille.'
    }[m])
  }
  ;(Object.keys(MODE_NAME) as Mode[]).forEach(m => { q('#m-' + m).onclick = () => { sfx('click', { vol: 0.5 }); setMode(m) } })
  q('#e-undo').onclick = () => { const f = undos.pop(); if (f) { sfx('whoosh', { vol: 0.3 }); f(); save() } }
  const papers = q('.ed-papers')
  q('#e-paper').onclick = () => { papers.hidden = !papers.hidden; sfx('click', { vol: 0.4 }) }
  papers.onclick = e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-p]'); if (!b) return; const old = l.paper; l.paper = b.dataset.p!; sheet.style.background = l.paper; pushUndo(() => { l.paper = old; sheet.style.background = old }); sfx('cloth', { vol: 0.5 }); papers.hidden = true; save() }
  q('#e-go').onclick = async () => {
    pick(null)
    await flush()
    if (!l.objs.length && blank(cv)) { sfx('error', { vol: 0.4 }); q('#e-go').classList.add('non'); setTimeout(() => q('#e-go')?.classList.remove('non'), 500); o.consigne('La feuille est vide : il faut y mettre quelque chose.'); return }
    sfx('confirm', { vol: 0.5 })
    close()
    o.done(l)
  }
  for (const ob of l.objs) mount(ob)
  setMode('dessin')

  function close() {
    alive = false
    clearTimeout(saveT)
    prise?.cancel(); prise = null
    taire()
    window.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    host.innerHTML = ''
  }
  return { close() { if (!alive) return; pick(null); void flush().then(() => coffre.setDraft(from, l)); close() } }
}

function blank(cv: HTMLCanvasElement) {
  const c = document.createElement('canvas')
  c.width = 60; c.height = 40
  const g = c.getContext('2d')!
  g.drawImage(cv, 0, 0, 60, 40)
  return !g.getImageData(0, 0, 60, 40).data.some((v, i) => i % 4 === 3 && v > 8)
}
