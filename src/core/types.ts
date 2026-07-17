export type Tier = 'easy' | 'med' | 'exp'

export interface FinishPayload {
  title: string
  msg: string
  stars: 1 | 2 | 3
  starsEarned: number
}

import type { Look } from './character'

export interface GameContext {
  root: HTMLElement
  tier: Tier
  playerName: string
  avatar: string | null
  /** Look choisi dans Habille-toi — suit la joueuse dans les autres jeux. */
  look: Look | null
  byTier<T>(e: T, m: T, x: T): T
  finish(p: FinishPayload): void
  toast(msg: string): void
  /** Lit un texte à voix haute (consignes, questions) — essentiel pour les non-lectrices. */
  say(text: string): void
}

export type GameCategory = 'reflexion' | 'memoire' | 'action' | 'creatif'

export interface GameDef {
  id: string
  name: string
  icon: string
  sq: string
  cat: GameCategory
  subtitle: string
  /** false = pas de Défi à deux (jeux créatifs sans score : comparer n'a pas de sens). */
  duel?: boolean
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

export interface Progress {
  stars: number
  stickers: string[]
  bestStars: Record<string, number>
}
