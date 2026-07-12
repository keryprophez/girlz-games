import type { GameDef, GameCategory } from '../core/types'
import { memory } from './memory'
import { quizGame } from './quiz'
import { catchGame } from './catch'
import { intrus } from './intrus'
import { moleGame } from './mole'
import { simonGame } from './simon'
import { runGame } from './run'
import { fishGame } from './fish'
import { ninja } from './ninja'
import { flappy } from './flappy'
import { photoPuzzle } from './puzzle'
import { letters } from './letters'
import { coloring } from './coloring'
import { dressup } from './dressup'
import { piano } from './piano'
import { socks } from './socks'

export const GAMES: GameDef[] = [
  quizGame, intrus, letters, photoPuzzle, socks,
  memory, simonGame,
  catchGame, moleGame, runGame, fishGame, ninja, flappy,
  coloring, dressup, piano
]

export const CATEGORIES: { id: GameCategory; label: string; icon: string }[] = [
  { id: 'reflexion', label: 'Réflexion', icon: '🧠' },
  { id: 'memoire', label: 'Mémoire', icon: '🎯' },
  { id: 'action', label: 'Action', icon: '⚡' },
  { id: 'creatif', label: 'Créatif', icon: '🎨' }
]

export function gameById(id: string): GameDef | undefined {
  return GAMES.find(g => g.id === id)
}
