/* @version 2026-11-26 11:29 */
import type { GameContext, GameDef } from '../core/types'
import { loader } from '../core/three3d'
import { sfx, preloadSfx } from '../core/sfx'
import { visible, type HandMove } from '../core/hand'
import { WHO, girl, whoOf, type Who } from '../core/mine'
import { creerBoites, type Boites } from '../core/boites3d'
import { coffreIDB, type Coffre } from '../core/courrierdb'
import { drapeau, boite, brouillon, neuve, type Lettre } from '../core/courrier'
import { chargerPortraits, ecrire } from './courrier-feuille'

/* ✉️ LE COURRIER (Créer, conception du 25/11, `docs/superpowers/specs/`) —
   Joyce et Jade s'écrivent pour de vrai, chacune son tour, sur la tablette.

   L'ouverture : la ferme, leurs deux boîtes aux lettres, deux plaques à leur
   prénom. Une boîte touchée (ou sa plaque) : la caméra s'approche, c'est chez
   elle — sa boîte (le drapeau levé : une lettre attend), « Écrire »,
   « Souvenirs ». « Changer » ramène aux deux boîtes.

   La feuille (`courrier-feuille.ts`), l'envoi et l'ouverture d'une enveloppe
   (`courrier-envoi.ts`) sont des écrans pleins par-dessus la ferme figée.
   Pas d'écran de fin (comme la Ferme à construire) : on sort par la maison.
   Tout reste sur la tablette (`core/courrierdb.ts`). */

/** Un écran plein (la feuille, l'envoi, la lecture, les souvenirs). */
export interface Ecran { nom: string; fermer(): void; main?(): HandMove | null }
/** Ce que chaque écran reçoit. */
export interface Contexte { c: GameContext; coffre: Coffre; qui: Who }

const QUI = 'ferme:courrier:qui'
const I = (b: string, s = 60) => `<svg viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true">${b}</svg>`
export const ICONE = {
  ecrire: I('<rect x="8" y="6" width="28" height="36" rx="3" fill="#FFFDF8" stroke="#D9C9AE" stroke-width="2"/><path d="M14 16h16M14 23h16M14 30h9" stroke="#4FB8E7" stroke-width="3" stroke-linecap="round"/><path d="M27 35l3-8 11-11 5 5-11 11z" fill="#FF7B6B"/><path d="M27 35l3-8 5 5z" fill="#F2D1A0"/>'),
  souvenirs: I('<path d="M6 20c0-8 4-12 10-12h16c6 0 10 4 10 12v3H6z" fill="#B97F3F"/><rect x="6" y="22" width="36" height="19" rx="3" fill="#8B5E3C"/><rect x="6" y="21" width="36" height="4" fill="#6E4526"/><rect x="20" y="19" width="8" height="11" rx="2" fill="#FFC533"/><circle cx="24" cy="24" r="2" fill="#6E4526"/>'),
  retour: I('<path d="M20 10L6 24l14 14" fill="none" stroke="#45362A" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 24h24c6 0 10 4 10 10" fill="none" stroke="#45362A" stroke-width="5.5" stroke-linecap="round"/>', 34)
}

interface Jeu {
  c: GameContext
  wrap: HTMLElement
  coffre: Coffre
  boites: Boites | null
  lettres: Lettre[]
  qui: Who | null
  ecran: Ecran | null
  /** Une animation de la boîte en cours : les touchers attendent. */
  occupe: boolean
}
let jeu: Jeu | null = null

const lireQui = (): Who | null => { try { const v = localStorage.getItem(QUI); return v === 'jade' || v === 'joyce' ? v : null } catch { return null } }
const ecrireQui = (w: Who) => { try { localStorage.setItem(QUI, w) } catch { /* stockage refusé */ } }

/** Les drapeaux et les enveloppes qui dépassent, d'après les lettres. */
function peindreBoites(j: Jeu, net = false) {
  if (!j.boites) return
  for (const w of WHO) {
    j.boites.drapeau(w.id, drapeau(j.lettres, w.id), net)
    j.boites.lettre(w.id, boite(j.lettres, w.id).length > 0)
  }
}

/** Le bas de l'écran et le bouton de gauche, selon l'endroit. */
function peindreBas(j: Jeu) {
  const bas = j.wrap.querySelector<HTMLElement>('.co-bas')!
  const ret = j.wrap.querySelector<HTMLElement>('.co-ret')!
  if (j.ecran) { bas.innerHTML = ''; ret.innerHTML = `<button class="sn-tool" id="coRet" aria-label="Retour">${ICONE.retour}</button><i class="tool-cap">Retour</i>`; return }
  if (!j.qui) {
    const last = lireQui()
    bas.className = 'co-bas duo'
    bas.innerHTML = WHO.map(w => `<button class="co-plaque${w.id === last ? ' last' : ''}" data-who="${w.id}" style="--c:${w.color}" aria-label="${w.name}">${girl(w.color, 54)}<b>${w.name}</b></button>`).join('')
    ret.innerHTML = ''
    return
  }
  bas.className = 'co-bas chez'
  bas.innerHTML = `<span class="tool-item"><button class="sn-tool co-gros" id="coEcrire" aria-label="Écrire">${ICONE.ecrire}</button><i class="tool-cap">Écrire</i></span>
    <span class="tool-item"><button class="sn-tool co-gros" id="coSouv" aria-label="Souvenirs">${ICONE.souvenirs}</button><i class="tool-cap">Souvenirs</i></span>`
  ret.innerHTML = `<button class="sn-tool" id="coRet" aria-label="Changer">${girl(whoOf(j.qui).color)}</button><i class="tool-cap">${whoOf(j.qui).name}</i>`
}

function accueil(j: Jeu) {
  j.qui = null
  j.boites?.vue('duo')
  for (const w of WHO) j.boites?.porte(w.id, 0)
  peindreBoites(j)
  peindreBas(j)
}

function chez(j: Jeu, w: Who) {
  j.qui = w
  ecrireQui(w)
  sfx('select', { vol: 0.5 })
  j.boites?.vue(w)
  peindreBas(j)
}

/** Un écran plein par-dessus la ferme figée. */
function ouvrirEcran(j: Jeu, fabrique: (hote: HTMLElement) => Ecran) {
  j.ecran?.fermer()
  j.boites?.figer(true)
  j.ecran = fabrique(j.wrap.querySelector<HTMLElement>('.co-ecran')!)
  peindreBas(j)
}
function fermerEcran(j: Jeu) {
  j.ecran?.fermer()
  j.ecran = null
  j.boites?.figer(false)
  peindreBas(j)
}
/** Une lettre gardée (brouillon, cachetée, postée…) : la liste suit. */
function retenir(j: Jeu, l: Lettre) {
  const i = j.lettres.findIndex(x => x.id === l.id)
  if (i >= 0) j.lettres[i] = l
  else j.lettres.push(l)
  peindreBoites(j)
}

/** « Écrire » : son brouillon, ou une feuille neuve. */
function ecrireLettre(j: Jeu) {
  const w = j.qui
  if (!w || j.occupe) return
  sfx('select', { vol: 0.5 })
  const l = brouillon(j.lettres, w) ?? neuve(w, Date.now())
  ouvrirEcran(j, hote => ecrire(hote, { c: j.c, coffre: j.coffre, qui: w }, l, {
    garde: x => retenir(j, x),
    geste: () => { /* la main par fille : tâche 13 */ },
    envoyer: () => { /* l'envoi : tâche 11 */ }
  }))
}

/** Sa boîte touchée. Vide : la porte s'ouvre, rien, elle se referme. */
function toucherBoite(j: Jeu, w: Who) {
  const b = j.boites
  if (!b || j.occupe) return
  j.occupe = true
  b.porte(w, 1)
  sfx('creak', { vol: 0.5 })
  b.secouer(w)
  j.c.after(1100, () => {
    if (jeu !== j) return
    b.porte(w, 0)
    sfx('metal', { vol: 0.4 })
    j.occupe = false
  })
}

export const courrier: GameDef = {
  id: 'courrier', name: 'Le Courrier', icon: '✉️', sq: 'sq-peach', cat: 'creatif', noTier: true, music: 'meadow',
  subtitle: 'Écris une lettre à ta sœur et poste-la dans sa boîte',
  hand: (root): HandMove | null => {
    const j = jeu
    if (!j?.boites || j.occupe) return null
    if (j.ecran) return j.ecran.main?.() ?? null
    if (!j.qui) return { choose: visible(root, '.co-plaque') }
    if (drapeau(j.lettres, j.qui)) return { tap: j.boites.fente(j.qui) }
    return { choose: visible(root, '#coEcrire') }
  },
  mount(c) {
    c.root.innerHTML = `<div class="arena g3-arena co-wrap" id="coWrap">
      <div class="co-3d"></div><div class="co-ecran"></div>
      <div class="co-bas"></div><span class="tool-item co-ret"></span></div>`
    const wrap = c.root.querySelector<HTMLElement>('#coWrap')!
    const j: Jeu = { c, wrap, coffre: coffreIDB(), boites: null, lettres: [], qui: null, ecran: null, occupe: false }
    jeu = j
    preloadSfx(['select', 'creak', 'metal', 'click', 'bong', 'whoosh', 'cloth', 'drop', 'pluck', 'chop', 'confirm', 'error', 'tick', 'switch', 'glass'])
    const finLoader = loader(wrap, 'courrier')
    void (async () => {
      const [ls, b] = await Promise.all([j.coffre.lettres(), creerBoites(wrap.querySelector<HTMLElement>('.co-3d')!).catch(e => { console.error(e); return null }), chargerPortraits().catch(() => { /* les animaux viendront sans image */ })])
      finLoader()
      if (jeu !== j || !c.alive()) { b?.dispose(); return }
      if (!b) { c.toast('La 3D n\'est pas disponible ici'); return }
      j.lettres = ls
      j.boites = b
      peindreBoites(j, true)
      accueil(j)
    })()

    let t0 = { x: 0, y: 0 }
    const surScene = (e: PointerEvent) => (e.target as HTMLElement).closest('.co-3d')
    const bas = (e: PointerEvent) => { if (surScene(e)) t0 = { x: e.clientX, y: e.clientY } }
    const haut = (e: PointerEvent) => {
      if (!surScene(e) || !j.boites || j.ecran || Math.hypot(e.clientX - t0.x, e.clientY - t0.y) > 14) return
      const w = j.boites.sous(e.clientX, e.clientY)
      if (!w) return
      if (!j.qui) chez(j, w)
      else if (w === j.qui) toucherBoite(j, w)
    }
    const clic = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      const plaque = t.closest<HTMLElement>('.co-plaque')
      if (plaque && !j.ecran) { chez(j, plaque.dataset.who as Who); return }
      if (t.closest('#coRet')) {
        sfx('click', { vol: 0.5 })
        if (j.ecran) { fermerEcran(j); return }
        accueil(j)
        return
      }
      if (t.closest('#coEcrire')) ecrireLettre(j)
    }
    wrap.addEventListener('pointerdown', bas)
    wrap.addEventListener('pointerup', haut)
    wrap.addEventListener('click', clic)

    // Crochet pour les bots de test (scripts/play.mjs) — inerte en prod
    if ((window as unknown as { __BOT?: boolean }).__BOT) {
      ;(window as unknown as { __co: unknown }).__co = {
        get ready() { return !!j.boites },
        get qui() { return j.qui },
        get ecran() { return j.ecran?.nom ?? null },
        get feuille() { const e = j.ecran as { etat?: () => unknown } | null; return e?.etat?.() ?? null },
        get lettres() { return j.lettres.map(l => ({ de: l.de, a: l.a, etat: l.etat, objets: l.objets.length })) },
        drapeau: (w: Who) => drapeau(j.lettres, w),
        /** La boîte de `w`, à l'écran. */
        boite: (w: Who) => j.boites?.fente(w) ?? null
      }
    }

    let fini = false
    return () => {
      if (fini) return
      fini = true
      wrap.removeEventListener('pointerdown', bas)
      wrap.removeEventListener('pointerup', haut)
      wrap.removeEventListener('click', clic)
      j.ecran?.fermer()
      j.ecran = null
      j.boites?.dispose()
      if (jeu === j) jeu = null
    }
  }
}
