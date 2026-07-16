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
import { patterns } from './patterns'
import { clock } from './clock'
import { tables, additions } from './tables'
import { mirror } from './mirror'
import { market } from './market'
import { battleship } from './battleship'
import { maze } from './maze'
import { popcorn } from './popcorn'
import { beatbox } from './beatbox'
import { taquin } from './taquin'
import { balloon } from './balloon'
import { connect4 } from './connect4'
import { snowman } from './snowman'
import { igloo } from './igloo'
import { pizza } from './pizza'

export const GAMES: GameDef[] = [
  quizGame, intrus, letters, photoPuzzle, taquin, socks, patterns, mirror, clock, tables, additions, market, maze, igloo, connect4, battleship,
  memory, simonGame,
  catchGame, moleGame, runGame, fishGame, ninja, flappy, popcorn, balloon,
  coloring, dressup, snowman, pizza, piano, beatbox
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
