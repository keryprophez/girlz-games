/* @version 2026-11-26 16:58 */
import type { Who } from './mine'
import type { Son } from './vocal'
import { sansEmojis, vide } from './saisie'

/* LE COURRIER — la logique, pure et testée : une lettre, ses états, la file de
   la boîte aux lettres, le raccourci de l'envoi, les doigts sur un objet.

   Une lettre va d'une fille à sa sœur (une seule tablette, chacune son tour) :
     brouillon → cachetée (la cire est posée : elle ne s'ouvre plus) →
     postée (dans la boîte de sa sœur, drapeau levé) → ouverte (le cachet
     cassé ; reposée sans être gardée, elle reste dans la boîte) → gardée
     (dans ses Souvenirs).
   Chaque passage rend une NOUVELLE lettre : celle qu'on donne ne change pas
   (le coffre n'écrit que ce qu'on lui rend, une écriture refusée laisse
   l'ancienne intacte). Un passage interdit lève une erreur. */

/** La feuille, en pixels de feuille (comme l'Atelier). */
export const FW = 1500
export const FH = 1000
export const MAX_OBJETS = 40
export const MAX_VOIX = 5

export type Etat = 'brouillon' | 'cachetee' | 'postee' | 'ouverte' | 'gardee'
export interface XY { x: number; y: number }
export interface Pose { x: number; y: number; s: number; r: number }
export interface Texte extends Pose { k: 'texte'; t: string; couleur: string; police: string; taille: number }
/** `src` : « emoji:😀 », « animal:cow », « photo:cat », « forme:coeur:#E8414F ». */
export interface Gomme extends Pose { k: 'gomme'; src: string }
/** `cle` : sa clé R2, posée par le coffre en ligne (une voix qui l'a n'est jamais renvoyée). */
export interface Vocal extends Pose, Son { k: 'voix'; cle?: string }
export type Objet = Texte | Gomme | Vocal

/** `timbre` : '' tant qu'il n'est pas collé. */
export interface Enveloppe { couleur: string; cachet: string; timbre: string }
export interface Lettre {
  id: string
  de: Who
  a: Who
  etat: Etat
  cree: number
  /** Le moment où elle est tombée dans la boîte (0 avant). */
  postee: number
  /** Sa place dans la file de la boîte : une ouverte reposée passe à la fin. */
  tour: number
  papier: string
  peinture: Blob | null
  objets: Objet[]
  env: Enveloppe | null
  /* Posés par le coffre en ligne seulement (core/courrierenligne.ts) ; le jeu ne les lit pas. */
  /** Le compteur d'écritures : la plus grande gagne. */
  version?: number
  /** Arrivée sans ses fichiers : `Coffre.completer` les apporte. */
  aCharger?: true
  /** La clé R2 du dessin, gardée même quand il n'a pas pu venir. */
  peintureCle?: string | null
}
/** Ce qu'on retient pour chaque fille : ses envois (le raccourci), sa dernière
    enveloppe, les gestes qu'elle a déjà réussis (la main ne revient plus). */
export interface Prefs { envois: number; env: Enveloppe | null; faits: string[] }

export const autre = (w: Who): Who => (w === 'jade' ? 'joyce' : 'jade')

let n = 0
const uid = (t: number) => `${t.toString(36)}-${(n++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export const neuve = (de: Who, now: number): Lettre => ({
  id: uid(now), de, a: autre(de), etat: 'brouillon', cree: now, postee: 0, tour: 0,
  papier: '#FFFDF8', peinture: null, objets: [], env: null
})

function passer(l: Lettre, de: Etat, vers: Etat, plus: Partial<Lettre> = {}): Lettre {
  if (l.etat !== de) throw new Error(`une lettre « ${l.etat} » ne peut pas devenir « ${vers} »`)
  return { ...l, ...plus, etat: vers }
}
export const cacheter = (l: Lettre, env: Enveloppe) => passer(l, 'brouillon', 'cachetee', { env: { ...env } })
export const timbrer = (l: Lettre, timbre: string) => passer(l, 'cachetee', 'cachetee', { env: { ...l.env!, timbre } })
export function poster(l: Lettre, now: number) {
  if (!l.env?.timbre) throw new Error('une lettre sans timbre ne part pas')
  return passer(l, 'cachetee', 'postee', { postee: now, tour: now })
}
export const ouvrir = (l: Lettre, now: number) => passer(l, 'postee', 'ouverte', { tour: now })
export const reposer = (l: Lettre, now: number) => passer(l, 'ouverte', 'ouverte', { tour: now })
export const garder = (l: Lettre) => passer(l, 'ouverte', 'gardee')

const de = (w: Who, etat: Etat) => (l: Lettre) => l.de === w && l.etat === etat
export const brouillon = (ls: Lettre[], w: Who) => ls.find(de(w, 'brouillon')) ?? null
export const aPoster = (ls: Lettre[], w: Who) => ls.find(de(w, 'cachetee')) ?? null

/** La boîte de `w` : les fermées d'abord (la plus ancienne en tête), puis les ouvertes, dans leur ordre de passage. */
export function boite(ls: Lettre[], w: Who): Lettre[] {
  const pour = ls.filter(l => l.a === w)
  const fermees = pour.filter(l => l.etat === 'postee').sort((a, b) => a.postee - b.postee)
  const ouvertes = pour.filter(l => l.etat === 'ouverte').sort((a, b) => a.tour - b.tour)
  return [...fermees, ...ouvertes]
}
export const drapeau = (ls: Lettre[], w: Who) => ls.some(l => l.a === w && l.etat === 'postee')
export const souvenirs = (ls: Lettre[], w: Who) => ls.filter(l => l.a === w && l.etat === 'gardee').sort((a, b) => b.postee - a.postee)

/** À partir de la troisième lettre, sa dernière enveloppe est déjà prête. */
export const raccourci = (p: Prefs): Enveloppe | null => (p.envois >= 2 && p.env ? { ...p.env } : null)
export const apresEnvoi = (p: Prefs, env: Enveloppe): Prefs => ({ ...p, envois: p.envois + 1, env: { ...env } })

/** Ce que « Écouter » lit : les textes de haut en bas, sans émojis. */
export const aLire = (l: Lettre) => l.objets
  .filter((o): o is Texte => o.k === 'texte')
  .sort((a, b) => a.y - b.y)
  .map(o => sansEmojis(o.t))
  .filter(t => !vide(t))
  .join('. ')

/** Rien à envoyer : pas de peinture, et que des textes vides. */
export const vierge = (l: Lettre, peint: boolean) => !peint && l.objets.every(o => o.k === 'texte' && vide(o.t))

const tour = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
/** Deux doigts passés de (a0, b0) à (a1, b1) : l'objet suit, tourne et grandit avec eux. */
export function pincer(o: Pose, a0: XY, b0: XY, a1: XY, b1: XY): Pose {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y), d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y)
  const k = d0 > 1 ? d1 / d0 : 1
  const r = d0 > 1 && d1 > 1 ? tour(Math.atan2(b1.y - a1.y, b1.x - a1.x) - Math.atan2(b0.y - a0.y, b0.x - a0.x)) : 0
  return {
    x: o.x + ((a1.x + b1.x) - (a0.x + b0.x)) / 2,
    y: o.y + ((a1.y + b1.y) - (a0.y + b0.y)) / 2,
    s: Math.min(5, Math.max(0.35, o.s * k)),
    r: o.r + r
  }
}
/** Le centre d'un objet reste sur la feuille (à 10 px du bord). */
export const borner = <P extends Pose>(o: P): P => ({ ...o, x: Math.min(FW - 10, Math.max(10, o.x)), y: Math.min(FH - 10, Math.max(10, o.y)) })
