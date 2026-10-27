export type Tier = 'easy' | 'med' | 'exp'

/** Les quatre opérations (le Potager, 27/09) : `add` +, `sub` −, `mul` ×, `div` ÷. */
export type Op = 'add' | 'sub' | 'mul' | 'div'

export interface FinishPayload {
  title: string
  msg: string
  /** Simple retour de fin de partie (règle 1) : rien ne s'accumule. */
  stars: 1 | 2 | 3
  /** Le résultat en GRAND sur l'écran de fin (blocs, fruits, points…),
      avec son icône : une phrase à 15 px ne se lit pas à 6 ans (23/09). */
  score?: number
  scoreIcon?: string
  /** Outro : le jeu reste monté ce temps-là (ralenti, chute, caméra qui
      recule…) avant l'écran de résultat. 0 = tout de suite. */
  outroMs?: number
}

import type { HandSpec } from './hand'

export interface GameContext {
  root: HTMLElement
  tier: Tier
  byTier<T>(e: T, m: T, x: T): T
  /** À deux sur la même tablette, EN ÉQUIPE (23/09) : deux doigts à la
      fois, un seul score commun, aucune comparaison (règle 1). Toujours
      false pour un jeu qui ne déclare pas `duo`. */
  duo: boolean
  /** Les opérations choisies à l'ouverture (étiquettes + − × ÷, au moins
      une). Vide pour un jeu qui ne déclare pas `ops`. */
  ops: Op[]
  /** La variante choisie à l'ouverture (la Cuisine : 'pizza' ou 'gateau').
      Vide pour un jeu qui ne déclare pas `variants`. */
  variant: string
  finish(p: FinishPayload): void
  toast(msg: string): void
  /** Lit un texte à voix haute. UNIQUEMENT du contenu pédagogique (une
      heure, un résultat, un nom de lieu) — jamais une consigne : la règle
      du projet est « aucune lecture requise », et le moteur de voix est
      gardé pour la suite. */
  say(text: string): void
  /** Timers DE PARTIE : annulés au démontage, suspendus en pause. À utiliser
      à la place de setTimeout/setInterval pour tout ce qui pilote le jeu. */
  after(ms: number, fn: () => void): number
  every(ms: number, fn: () => void): number
  cancel(id: number): void
  /** false dès que la partie est démontée : à tester dans les callbacks
      asynchrones (chargement de modèles, promesses). */
  alive(): boolean
}

export type GameCategory = 'reflexion' | 'memoire' | 'action' | 'creatif'

export interface GameDef {
  id: string
  name: string
  icon: string
  sq: string
  cat: GameCategory
  subtitle: string
  /** Thème de musique d'ambiance générative (voir core/music.ts) ; absent = silence. */
  music?: string
  /** Le jeu se joue aussi à deux en équipe : l'écran de niveau propose
      « seule / à deux » (deux silhouettes, zéro mot) et `ctx.duo` suit. */
  duo?: boolean
  /** Le jeu pose des calculs : avant la difficulté, une première étape
      propose les étiquettes + − × ÷ (plusieurs à la fois, + par défaut,
      le dernier choix retenu) et `ctx.ops` suit (27/09). */
  ops?: boolean
  /** Pas de niveau (30/09 : « retire les niveaux de ce qui n'en a pas ») :
      le jeu démarre tout de suite, sans fleur / éclair / flamme. S'il se joue
      aussi à deux (`duo`), l'ouverture ne garde que « seule / à deux » et
      une flèche. `ctx.tier` vaut alors 'easy'. */
  noTier?: boolean
  /** Plusieurs jeux sous une même tuile (la Cuisine, 27/10 : la pizza ou le
      gâteau). L'ouverture les propose en grandes images à la place de la
      flèche (avec `noTier`), `ctx.variant` suit, le bouton de la barre et
      celui de l'écran de fin rouvrent le choix ; le dernier est retenu. */
  variants?: { id: string; name: string; img: string }[]
  /** La main qui montre (30/09, core/hand.ts) : le geste à mimer MAINTENANT
      (taper, glisser, trancher, ou « l'un de ceux-là » sans appuyer — jamais
      la réponse dans Apprendre), ou null quand le jeu n'attend rien. */
  hand?: HandSpec
  /** Monte le jeu dans root et renvoie une fonction de nettoyage idempotente. */
  mount(ctx: GameContext): () => void
}
