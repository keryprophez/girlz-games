import type { GameDef, GameCategory } from '../core/types'
import { memory } from './memory'
import { quizGame } from './quiz'
import { catchGame } from './catch'
import { intrus } from './intrus'
import { moleGame } from './mole'
import { simonGame } from './simon'
import { runGame } from './run'
import { bubbles } from './bubbles'
import { memogrid } from './memogrid'
import { fishGame } from './fish'
import { vraifaux } from './vraifaux'
import { taquin, photoPuzzle } from './taquin'
import { ninja } from './ninja'
import { flappy } from './flappy'

export const GAMES: GameDef[] = [
  quizGame, intrus, vraifaux, taquin, photoPuzzle,
  memory, simonGame, memogrid,
  catchGame, moleGame, runGame, bubbles, fishGame, ninja, flappy
]

export const CATEGORIES: { id: GameCategory; label: string; icon: string }[] = [
  { id: 'reflexion', label: 'Réflexion', icon: '🧠' },
  { id: 'memoire', label: 'Mémoire', icon: '🎯' },
  { id: 'action', label: 'Action', icon: '⚡' }
]

export function gameById(id: string): GameDef | undefined {
  return GAMES.find(g => g.id === id)
}
