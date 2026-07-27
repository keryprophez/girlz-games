import type { GameDef } from '../core/types'
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
import { pizza } from './pizza'
import { geoGame } from './geo'
import { space } from './space'
import { caterpillar } from './caterpillar'
import { fireworks } from './fireworks'
import { stand3d } from './stand3d'
import { icetower } from './icetower'

export const GAMES: GameDef[] = [
  quizGame, intrus, letters, photoPuzzle, taquin, socks, patterns, mirror, geoGame, space, clock, tables, additions, market, maze, connect4, battleship,
  memory, simonGame,
  catchGame, moleGame, runGame, fishGame, ninja, flappy, popcorn, balloon, caterpillar, stand3d, icetower,
  coloring, dressup, snowman, pizza, piano, beatbox, fireworks
]

/* L'accueil est découpé en trois univers + le Défi à deux. Chaque jeu vit dans
   UN SEUL univers — l'affectation est ici, pas dans les fichiers de jeux :
   - Jouer     = on s'amuse, on peut perdre (action, puzzles, plateau)
   - Apprendre = pédagogique, jamais de sanction
   - Créer     = pas de score du tout */
export const WORLDS: { id: string; label: string; icon: string; games: GameDef[] }[] = [
  {
    id: 'jouer', label: 'Jouer', icon: '⚡',
    games: [
      catchGame, moleGame, runGame, fishGame, ninja, flappy, popcorn, balloon,
      caterpillar, stand3d, icetower,
      photoPuzzle, taquin, socks, patterns, mirror, space, maze,
      connect4, battleship, memory, simonGame
    ]
  },
  {
    id: 'apprendre', label: 'Apprendre', icon: '📚',
    games: [letters, clock, tables, additions, market, quizGame, intrus, geoGame]
  },
  {
    id: 'creer', label: 'Créer', icon: '🎨',
    games: [coloring, dressup, snowman, pizza, piano, beatbox, fireworks]
  }
]

export function gameById(id: string): GameDef | undefined {
  return GAMES.find(g => g.id === id)
}

// Garde-fou (dev) : chaque jeu doit vivre dans exactement un univers
if (import.meta.env.DEV) {
  const seen = new Map<string, number>()
  for (const w of WORLDS) for (const g of w.games) seen.set(g.id, (seen.get(g.id) || 0) + 1)
  for (const g of GAMES) {
    const n = seen.get(g.id) || 0
    if (n !== 1) console.warn(`⚠️ ${g.id} apparaît ${n} fois dans WORLDS`)
  }
}
