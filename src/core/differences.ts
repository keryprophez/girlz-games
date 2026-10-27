/* LE JEU DES DIFFÉRENCES — le tirage d'une manche, sans three.js (27/10).
   Pur et testé : quels animaux sont dans la cour, et quelles différences
   la seconde ferme porte. Le jeu (`games/differences.ts`) les fabrique.

   Les deux fermes sont la petite ferme de Cache-Cache (`buildFarm`), dont
   les constructions ont une place fixe (`LAYOUT` de `core/farm3d.ts`) : la
   grange au fond, la meule, le pommier, la charrette, la mare, le tracteur,
   la niche, le potager, le poulailler, le tas de bois, le puits, les
   tonneaux, les bottes. Les différences sont tirées AU HASARD à chaque
   manche, parmi :
   - FRANCHES (on les voit du premier coup d'œil) : un animal en plus, un
     animal en moins, un animal changé en un autre, la grange d'une autre
     couleur, le tracteur d'une autre couleur, une citrouille, un buisson
     qui manque, la charrette qui manque ;
   - FINES : un animal tourné, une pomme dans l'arbre, la meule déplacée,
     les tonneaux tournés, la niche tournée, le puits tourné, une botte de
     plus, une poule sur le toit de la grange, un canard sur la mare, le tas
     de bois qui manque ;
   - CACHÉES (flamme seulement) : derrière la grange, derrière le tas de
     bois, derrière les bottes — vues d'en haut et de face, elles ne se
     voient pas : il faut tourner les fermes.
   Fleur : 5 franches ; éclair : 7 dont 4 fines ; flamme : 9 dont 5 fines et
   2 cachées. La rampe (0..3, les manches sans faute) remplace une franche
   par une fine. */

import type { CritterKind } from './critters'

export type Grade = 'franc' | 'fin'
export type DiffKind =
  | 'animal-plus' | 'animal-moins' | 'animal-change' | 'grange' | 'tracteur' | 'citrouille' | 'buisson' | 'charrette'
  | 'animal-tourne' | 'pomme' | 'meule' | 'tonneaux' | 'niche' | 'puits' | 'botte' | 'poule-toit' | 'canard-mare' | 'bois'
  | 'cache-grange' | 'cache-bois' | 'cache-bottes'

export interface Diff {
  kind: DiffKind
  grade: Grade
  hidden: boolean
  /** L'animal de la cour concerné (moins, changé, tourné). */
  animal?: number
  /** La place de la cour (un animal en plus). */
  place?: number
  /** Le nouvel animal (en plus, changé, caché). */
  to?: CritterKind
  /** Un tirage libre pour le jeu (couleur, angle, côté…), 0..1. */
  param: number
}

export interface Plan {
  animals: { kind: CritterKind; place: number; rot: number }[]
  diffs: Diff[]
}

/** Les places de la cour (repère du plateau) : autour de l'enclos, loin des constructions. */
export const PLACES: [number, number][] = (() => {
  const out: [number, number][] = []
  // L'anneau de la cour, entre l'enclos (1,6) et les constructions (3,5 et plus)
  for (const deg of [56, 84, 138, 166, 194, 236, 262, 312, 344, 14]) {
    const a = deg * Math.PI / 180
    out.push([Math.sin(a) * 2.35, Math.cos(a) * 2.35])
  }
  // Dans l'enclos
  for (const deg of [30, 150, 270]) {
    const a = deg * Math.PI / 180
    out.push([Math.sin(a) * 0.8, Math.cos(a) * 0.8])
  }
  return out
})()

const POOL: CritterKind[] = ['cow', 'pig', 'sheep', 'hen', 'duck', 'dog', 'rabbit', 'goat', 'horse', 'cat', 'chick', 'rooster']

const FRANC: DiffKind[] = ['animal-plus', 'animal-moins', 'animal-change', 'grange', 'tracteur', 'citrouille', 'buisson', 'charrette']
const FIN: DiffKind[] = ['animal-tourne', 'pomme', 'meule', 'tonneaux', 'niche', 'puits', 'botte', 'poule-toit', 'canard-mare', 'bois']
const HIDDEN: DiffKind[] = ['cache-grange', 'cache-bois', 'cache-bottes']
/** Ce qui peut revenir plusieurs fois dans une manche (sur des animaux différents). */
const MULTI = new Set<DiffKind>(['animal-plus', 'animal-moins', 'animal-change', 'animal-tourne'])
/** Ce qui touche la même construction ne va pas ensemble. */
const CLASH: [DiffKind, DiffKind][] = [['bois', 'cache-bois'], ['botte', 'cache-bottes'], ['poule-toit', 'grange'], ['poule-toit', 'cache-grange']]

/** Combien de différences, et de quelle sorte, pour un niveau (0 fleur, 1 éclair, 2 flamme) et une rampe (0..3). */
export function recipe(tier: 0 | 1 | 2, level: number): { total: number; fin: number; hidden: number } {
  const k = Math.max(0, Math.min(3, level))
  if (tier === 0) return { total: 5, fin: Math.min(2, k), hidden: 0 }
  if (tier === 1) return { total: 7, fin: 4 + Math.min(2, k), hidden: 0 }
  return { total: 9, fin: 5 + Math.min(2, k), hidden: 2 }
}

export function plan(tier: 0 | 1 | 2, level: number, rnd: () => number = Math.random): Plan {
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)]
  const mix = <T>(a: T[]) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] } return b }
  // Les animaux de la cour : six à huit, sur des places tirées
  const nAnimals = [6, 7, 8][tier]
  const places = mix(PLACES.map((_, i) => i))
  const kinds = mix(POOL)
  const animals = Array.from({ length: nAnimals }, (_, i) => ({ kind: kinds[i % kinds.length], place: places[i], rot: rnd() * Math.PI * 2 }))
  const freePlaces = places.slice(nAnimals)
  const { total, fin, hidden } = recipe(tier, level)
  const diffs: Diff[] = []
  const usedAnimals = new Set<number>()
  const has = (k: DiffKind) => diffs.some(d => d.kind === k)
  const clash = (k: DiffKind) => CLASH.some(([a, b]) => (a === k && has(b)) || (b === k && has(a)))
  const add = (kind: DiffKind, grade: Grade, isHidden: boolean): boolean => {
    if (!MULTI.has(kind) && has(kind)) return false
    if (clash(kind)) return false
    const d: Diff = { kind, grade, hidden: isHidden, param: rnd() }
    if (kind === 'animal-moins' || kind === 'animal-change' || kind === 'animal-tourne') {
      const free = animals.map((_, i) => i).filter(i => !usedAnimals.has(i))
      if (!free.length) return false
      d.animal = pick(free)
      usedAnimals.add(d.animal)
      if (kind === 'animal-change') d.to = pick(POOL.filter(k => k !== animals[d.animal!].kind))
    }
    if (kind === 'animal-plus') {
      if (!freePlaces.length) return false
      d.place = freePlaces.shift()!
      d.to = pick(POOL)
    }
    if (kind === 'cache-grange') d.to = pick(['pig', 'sheep', 'dog', 'goat'] as CritterKind[])
    diffs.push(d)
    return true
  }
  for (const k of mix(HIDDEN)) { if (diffs.length >= hidden) break; add(k, 'fin', true) }
  // Les animaux reviennent plus souvent : on les met deux fois dans le sac
  const finBag = mix<DiffKind>([...FIN, 'animal-tourne'])
  for (let i = 0; diffs.length < hidden + fin && i < finBag.length * 3; i++) add(finBag[i % finBag.length], 'fin', false)
  const francBag = mix<DiffKind>([...FRANC, 'animal-plus', 'animal-moins'])
  for (let i = 0; diffs.length < total && i < francBag.length * 3; i++) add(francBag[i % francBag.length], 'franc', false)
  return { animals, diffs: mix(diffs) }
}
