export type Tier = 'easy' | 'med' | 'exp'

export interface FinishPayload {
  title: string
  msg: string
  stars: 1 | 2 | 3
  starsEarned: number
}

export interface GameContext {
  root: HTMLElement
  tier: Tier
  playerName: string
  avatar: string | null
  byTier<T>(e: T, m: T, x: T): T
  finish(p: FinishPayload): void
  toast(msg: string): void
}

export type GameCategory = 'reflexion' | 'memoire' | 'action'

export interface GameDef {
  id: string
  name: string
  icon: string
  sq: string
  cat: GameCategory
  subtitle: string
  /** Monte le jeu dans root et renvoie une fonction de nettoyage idempotente. */
  mount(ctx: GameContext): () => void
}

export interface Profile {
  id: string
  name: string
  age: number
  avatar: string | null // dataURL
  tier: Tier
}

export interface Progress {
  stars: number
  stickers: string[]
  bestStars: Record<string, number>
}
