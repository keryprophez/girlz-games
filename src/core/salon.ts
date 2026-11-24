/* @version 2026-11-25 00:20 */
import type { V3 } from './hair'

/* Le Salon de coiffure — la logique, sans rien dessiner : une RECETTE par
   coiffure (ses étapes, chacune un geste sur les cheveux ; ses attaches, où
   vont les mèches ; le côté de chaque mèche), les teintes, et ce qu'on garde.
   Le texte des étapes est pour le père (toujours affiché) : le geste, lui,
   est montré par la main et par ce qui brille. Testé dans `salon.test.ts`. */

export type Coiffure = 'queue' | 'couettes' | 'tresse'
export const COIFFURES: { id: Coiffure; nom: string; fin: string }[] = [
  { id: 'queue', nom: 'Queue', fin: 'Une jolie queue de cheval' },
  { id: 'couettes', nom: 'Couettes', fin: 'Deux jolies couettes' },
  { id: 'tresse', nom: 'Tresse', fin: 'Une jolie tresse' }
]
/** Les cinq teintes choisies par le père (23/11), la deuxième pour commencer. */
export const TEINTES: { hex: string; nom: string }[] = [
  { hex: '#C9A35E', nom: 'Blond' }, { hex: '#6B4A2B', nom: 'Châtain' }, { hex: '#9A3F1C', nom: 'Roux' },
  { hex: '#3E2A1E', nom: 'Brun' }, { hex: '#352E30', nom: 'Noir' }
]
export const TEINTE = 1

export type Kind = 'libre' | 'brosser' | 'raie' | 'rassembler' | 'tresser' | 'elastique' | 'fini'
export interface Step { k: Kind; a: number; txt: string }
export interface Recette { id: Coiffure; dirs: V3[]; side(r: V3): number; steps: Step[]; tresse?: boolean; drop?: number }
export const RECETTES: Recette[] = [
  {
    id: 'queue', dirs: [[0, 0.2, -1]], side: () => 0,
    steps: [
      { k: 'brosser', a: -1, txt: 'Brosse les cheveux vers l’arrière, du haut vers le bas' },
      { k: 'rassembler', a: 0, txt: 'Attrape les mèches et rassemble-les dans le rond, derrière la tête' },
      { k: 'elastique', a: 0, txt: 'Fais glisser l’élastique sur la queue de cheval' },
      { k: 'fini', a: -1, txt: 'C’est fini ! Une jolie queue de cheval.' }
    ]
  },
  {
    // deux couettes au-dessus des oreilles, un peu en arrière
    id: 'couettes', dirs: [[0.85, 0.32, -0.45], [-0.85, 0.32, -0.45]], side: r => (r[0] >= 0 ? 0 : 1),
    steps: [
      { k: 'brosser', a: -1, txt: 'Brosse les cheveux, du haut vers le bas' },
      { k: 'raie', a: -1, txt: 'Trace la raie au milieu de la tête, du front vers l’arrière' },
      { k: 'rassembler', a: 0, txt: 'Rassemble les cheveux de ce côté dans le rond' },
      { k: 'elastique', a: 0, txt: 'Fais glisser l’élastique sur la couette' },
      { k: 'rassembler', a: 1, txt: 'L’autre côté : rassemble les cheveux dans le rond' },
      { k: 'elastique', a: 1, txt: 'Fais glisser l’élastique sur la deuxième couette' },
      { k: 'fini', a: -1, txt: 'C’est fini ! Deux jolies couettes.' }
    ]
  },
  {
    // la tresse, à la nuque (`drop` : le faisceau tombe tout de suite)
    id: 'tresse', tresse: true, drop: 1.8, dirs: [[0, -0.5, -0.87]], side: () => 0,
    steps: [
      { k: 'brosser', a: -1, txt: 'Brosse les cheveux vers l’arrière, du haut vers le bas' },
      { k: 'rassembler', a: 0, txt: 'Rassemble les cheveux dans le rond, sur la nuque' },
      { k: 'tresser', a: 0, txt: 'Passe la mèche qui brille par-dessus celle du milieu' },
      { k: 'elastique', a: 0, txt: 'Fais glisser l’élastique au bout de la tresse' },
      { k: 'fini', a: -1, txt: 'C’est fini ! Une jolie tresse.' }
    ]
  }
]

/** Ce qu'on garde pour chaque fille : sa dernière coiffure FINIE, sa teinte. */
export interface Saved { c: Coiffure | null; t: number }
export const packSalon = (s: Saved) => ({ v: 1, c: s.c, t: s.t })
/** Relu (illisible, ou rien : cheveux lâchés, châtain). */
export function readSalon(raw: unknown): Saved {
  const o = (raw && typeof raw === 'object' ? raw : {}) as { c?: unknown; t?: unknown }
  const c = COIFFURES.find(x => x.id === o.c)?.id ?? null
  const t = typeof o.t === 'number' && Number.isInteger(o.t) && TEINTES[o.t] ? o.t : TEINTE
  return { c, t }
}
