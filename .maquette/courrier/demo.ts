// LA MAQUETTE du Courrier (jetable, hors de l'app) : la lettre, une seule tablette, chacune son tour.
import { sfx, preloadSfx } from '../../src/core/sfx'
import { wakeAudio, buzz } from '../../src/core/audio'
import { say, shutUp, unlockVoice } from '../../src/core/voice'
import { critterPortraits } from '../../src/core/portraits'
import { FARM, FARM_MORE } from '../../src/core/critters'
import { WHO, girl, whoOf, type Who } from '../../src/core/mine'
import { coffre, other, type Lettre } from './coffre'
import { aplatir, ecrire, lire, outil, portraits, texteDe, type Editeur } from './feuille'
import { cacheter, enveloppeHTML, ouvrir } from './envoi'
import { creerBoites, type Boites } from './boites3d'
import { taire } from './voix'

const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E
const ecran = $('ecran'), bas = $('bas')
const consigne = (t: string) => { $('pere').textContent = t }
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const I = (b: string, s = 40) => `<svg viewBox="0 0 48 48" width="${s}" height="${s}">${b}</svg>`
const ICON = {
  ecrire: I('<rect x="8" y="6" width="28" height="36" rx="3" fill="#FFFDF8" stroke="#D9C9AE" stroke-width="2"/><path d="M14 16h16M14 23h16M14 30h9" stroke="#4FB8E7" stroke-width="3" stroke-linecap="round"/><path d="M27 35l3-8 11-11 5 5-11 11z" fill="#FF7B6B"/><path d="M27 35l3-8 5 5z" fill="#F2D1A0"/>'),
  coffre: I('<path d="M6 20c0-8 4-12 10-12h16c6 0 10 4 10 12v3H6z" fill="#B97F3F"/><rect x="6" y="22" width="36" height="19" rx="3" fill="#8B5E3C"/><rect x="6" y="21" width="36" height="4" fill="#6E4526"/><rect x="20" y="19" width="8" height="11" rx="2" fill="#FFC533"/><circle cx="24" cy="24" r="2" fill="#6E4526"/>'),
  maison: I('<path d="M24 6L5 23h5v18h10V29h8v12h10V23h5z" fill="#45362A"/>', 30),
  ecouter: I('<path d="M6 18v12h8l10 8V10l-10 8z" fill="#45362A"/><path d="M31 17a10 10 0 0 1 0 14M36 12a17 17 0 0 1 0 24" fill="none" stroke="#45362A" stroke-width="4" stroke-linecap="round"/>', 34),
  garder: I('<path d="M6 20c0-8 4-12 10-12h16c6 0 10 4 10 12v3H6z" fill="#B97F3F"/><rect x="6" y="22" width="36" height="19" rx="3" fill="#8B5E3C"/><rect x="20" y="19" width="8" height="11" rx="2" fill="#FFC533"/>', 34),
  repondre: I('<path d="M20 8L5 22l15 14v-9c10 0 17 3 22 10-1-13-8-21-22-21z" fill="#fff"/>', 34)
}

let boites: Boites
let who: Who | null = null
let ed: Editeur | null = null
let busy = false

const flags = (net = false) => { for (const w of WHO) { const n = coffre.waiting(w.id).length > 0; boites.drapeau(w.id, n, net); boites.lettre(w.id, n) } }

/* ---------- Les deux boîtes : à qui le tour ? ---------- */
function accueil() {
  who = null
  ed?.close(); ed = null
  taire(); shutUp()
  ecran.innerHTML = ''
  ecran.className = ''
  boites.dort(false)
  boites.vue('duo')
  WHO.forEach(w => boites.porte(w.id, false))
  flags()
  $('maison').hidden = true
  bas.className = 'duo'
  bas.innerHTML = WHO.map(w => `<button class="plaque" data-w="${w.id}" style="--c:${w.color}">${girl(w.color, 54)}<b>${w.name}</b></button>`).join('')
  bas.querySelectorAll<HTMLElement>('.plaque').forEach(b => { b.onclick = () => chez(b.dataset.w as Who) })
  consigne('À qui le tour ? Le drapeau levé : du courrier attend.')
}

/* ---------- Chez elle : sa boîte, son téléphone, ses souvenirs ---------- */
function chez(w: Who) {
  who = w
  busy = false
  ed = null
  ecran.innerHTML = ''
  ecran.className = ''
  boites.dort(false)
  boites.vue(w)
  WHO.forEach(x => boites.porte(x.id, false))
  flags()
  sfx('select', { vol: 0.5 })
  $('maison').hidden = false
  bas.className = 'chez'
  bas.innerHTML = outil('b-ecr', ICON.ecrire, 'Écrire', 'gros') + outil('b-sou', ICON.coffre, 'Souvenirs', 'gros')
  $('b-ecr').onclick = () => void nouvelle()
  $('b-sou').onclick = () => void souvenirs()
  consigne(coffre.waiting(w).length ? `${whoOf(w).name} a du courrier : toucher la boîte.` : `La boîte de ${whoOf(w).name} est vide. Écrire une lettre ?`)
}
function plein(cls = 'plein') {
  bas.innerHTML = ''
  bas.className = ''
  ecran.className = cls
  boites.dort(true)
}

async function nouvelle(depuis: Lettre | null = null) {
  const w = who!
  plein()
  const draft = depuis ?? await coffre.draft(w)
  ed = ecrire(ecran, w, other(w), draft, { done: l => void poster(l), quit: () => chez(w), consigne })
}

/* ---------- Cacheter, poster ---------- */
async function poster(l: Lettre) {
  const w = who!, to = other(w)
  ed = null
  busy = true
  ecran.className = 'plein table'
  l.env = await cacheter(ecran, l, consigne)
  // Devant la boîte de sa sœur : glisser l'enveloppe dedans
  ecran.className = 'transparent'
  boites.dort(false)
  boites.vue(to)
  boites.porte(to, true)
  sfx('creak', { vol: 0.5 })
  ecran.innerHTML = `<div class="a-poster">${enveloppeHTML(l.env!, l.to, l.from, true)}</div><i class="doigt d-boite"></i>`
  const e = ecran.querySelector<HTMLElement>('.a-poster')!
  e.querySelector('.env')!.classList.add('face')
  consigne(`Poster : glisser l’enveloppe dans la boîte de ${whoOf(to).name}.`)
  await new Promise<void>(res => {
    let id = -1, x0 = 0, y0 = 0, dx = 0, dy = 0
    const set = (s: number) => { e.style.transform = `translate(calc(-50% + ${dx}px),${dy}px) scale(${s})` }
    const near = () => { const r = e.getBoundingClientRect(), p = boites.ecran(to); return Math.hypot(r.left + r.width / 2 - p.x, r.top + r.height / 2 - p.y) }
    const scale = () => Math.max(0.34, Math.min(1, near() / 330))
    let sc = 1
    const dn = (ev: PointerEvent) => { if (id >= 0) return; id = ev.pointerId; x0 = ev.clientX - dx; y0 = ev.clientY - dy; ecran.querySelector('.doigt')?.remove(); e.classList.remove('retour') }
    const mv = (ev: PointerEvent) => { if (ev.pointerId !== id) return; dx = ev.clientX - x0; dy = ev.clientY - y0; set(sc); sc = scale(); set(sc) }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return
      id = -1
      if (near() < 120) {
        e.removeEventListener('pointerdown', dn); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
        const r = e.getBoundingClientRect(), p = boites.ecran(to)
        dx += p.x - (r.left + r.width / 2); dy += p.y - (r.top + r.height / 2)
        e.classList.add('dedans')
        set(0.12)
        res()
      } else { dx = dy = 0; sc = 1; e.classList.add('retour'); set(1) }
    }
    e.addEventListener('pointerdown', dn); window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  })
  sfx('whoosh', { vol: 0.6 })
  await wait(320)
  ecran.innerHTML = ''
  l.at = Date.now()
  l.opened = false
  coffre.lettres.push(l)
  await coffre.setDraft(w, null)
  await coffre.save()
  boites.lettre(to, true)
  boites.porte(to, false)
  await wait(260)
  sfx('metal', { vol: 0.7 }); buzz(25)
  boites.secoue(to)
  await wait(350)
  boites.drapeau(to, true)
  sfx('bong', { vol: 0.6 })
  boites.etincelles(to)
  consigne('Postée ! Le drapeau se lève.')
  await wait(1900)
  busy = false
  chez(w)
}

/* ---------- Recevoir ---------- */
async function recevoir(w: Who) {
  const l = coffre.waiting(w)[0]
  busy = true
  boites.porte(w, true)
  sfx('creak', { vol: 0.6 })
  if (!l) {
    boites.secoue(w)
    consigne('Rien dans la boîte pour l’instant.')
    await wait(1100)
    boites.porte(w, false)
    sfx('metal', { vol: 0.4 })
    busy = false
    return
  }
  await wait(650)
  plein('plein table')
  await ouvrir(ecran, l, consigne, () => { l.opened = true; void coffre.save() })
  busy = false
  lecture(l, true)
}
function lecture(l: Lettre, neuve: boolean) {
  const w = who!
  plein('plein table')
  ecran.innerHTML = `<div class="lec"><div class="lec-f"></div><div class="ed-d">${outil('l-ec', ICON.ecouter, 'Écouter')}${outil('l-re', ICON.repondre, 'Répondre', 'go')}${outil('l-ga', ICON.garder, 'Garder')}</div></div>`
  lire(ecran.querySelector('.lec-f')!, l)
  const t = texteDe(l)
  $('l-ec').classList.toggle('eteint', !t)
  $('l-ec').onclick = () => { taire(); say(t) }
  $('l-re').onclick = () => { taire(); shutUp(); void nouvelle() }
  $('l-ga').onclick = () => { taire(); shutUp(); sfx('drop', { vol: 0.5 }); neuve ? chez(w) : void souvenirs() }
  consigne('Toucher la voix pour l’entendre ; « Écouter » lit le texte écrit. « Garder » range la lettre dans ses souvenirs.')
}
async function souvenirs() {
  const w = who!, ls = coffre.kept(w).slice().reverse()
  plein('plein table')
  ecran.innerHTML = `<div class="sou">${ls.map((_, i) => `<button class="sou-l" data-i="${i}" aria-label="Lettre"></button>`).join('')}${ls.length ? '' : `<div class="sou-v">${ICON.coffre}</div>`}</div>`
  consigne(ls.length ? `Les lettres gardées par ${whoOf(w).name}.` : 'Le coffre est vide : les lettres ouvertes s’y rangent.')
  ls.forEach(async (l, i) => {
    const b = ecran.querySelector<HTMLElement>(`.sou-l[data-i="${i}"]`)
    if (!b) return
    b.style.transform = `rotate(${(i * 37 % 7 - 3)}deg)`
    b.onclick = () => lecture(l, false)
    b.style.backgroundImage = `url(${await aplatir(l, 480)})`
  })
}

/* ---------- Départ ---------- */
async function start() {
  preloadSfx(['cloth', 'whoosh', 'chop', 'tick', 'click', 'pluck', 'confirm', 'error', 'drop', 'bong', 'glass', 'select', 'creak', 'metal'])
  addEventListener('pointerdown', () => { wakeAudio(); unlockVoice() }, { capture: true })
  addEventListener('contextmenu', e => e.preventDefault())
  await Promise.all([document.fonts.load("800 40px 'Baloo 2'"), document.fonts.load("40px 'Fredoka'"), document.fonts.load("40px 'Gochi Hand'"), document.fonts.load("40px 'Playwrite FR Moderne'")]).catch(() => { /* les polices du système */ })
  await coffre.load()
  Object.assign(portraits, await critterPortraits([...FARM, ...FARM_MORE], 220))
  boites = await creerBoites($('scene'))
  flags(true)
  $('maison').innerHTML = ICON.maison
  $('maison').onclick = () => {
    if (busy && ecran.querySelector('.cer')) return // une cérémonie va au bout
    sfx('click', { vol: 0.5 })
    if (ed && who) { ed.close(); ed = null; chez(who); return }
    if (ecran.className && who) { taire(); shutUp(); chez(who); return }
    accueil()
  }
  let t0 = { x: 0, y: 0 }
  $('scene').addEventListener('pointerdown', e => { t0 = { x: e.clientX, y: e.clientY } })
  $('scene').addEventListener('pointerup', e => {
    if (busy || Math.hypot(e.clientX - t0.x, e.clientY - t0.y) > 14) return
    const w = boites.sous(e.clientX, e.clientY)
    if (!w) return
    if (!who) chez(w)
    else if (w === who) void recevoir(w)
  })
  $('zero').onclick = async () => { await coffre.exemples(); accueil(); sfx('whoosh', { vol: 0.4 }) }
  accueil()
  document.body.classList.add('pret')
  ;(window as unknown as { __co: unknown }).__co = { coffre, boites, chez, accueil }
}
start().catch(e => { $('charge').textContent = 'La maquette n’a pas pu s’ouvrir : ' + (e?.message ?? e) })
