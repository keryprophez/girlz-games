export type Tier = 'easy' | 'med' | 'exp'

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

import type { Look } from './character'

export interface GameContext {
  root: HTMLElement
  tier: Tier
  /** Prénom de la joueuse — CHAÎNE VIDE tant que le choix de joueuse est
      masqué (SHOW_PROFILES) : sans lui, tout le monde s'appellerait Jade.
      Les messages de fin tutoient et ne citent jamais de prénom. */
  playerName: string
  avatar: string | null
  /** Look choisi dans Habille-toi — suit la joueuse dans les autres jeux. */
  look: Look | null
  byTier<T>(e: T, m: T, x: T): T
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
  /** Monte le jeu dans root et renvoie une fonction de nettoyage idempotente. */
  mount(ctx: GameContext): () => void
}

export interface Profile {
  id: string
  name: string
  age: number
  avatar: string | null // dataURL
  tier: Tier
  look?: Look
}

/** Ce qu'on garde d'une partie à l'autre : la meilleure note par jeu,
    affichée sous la tuile. Pas de total, pas de collection (règle 1). */
export interface Progress {
  bestStars: Record<string, number>
}
