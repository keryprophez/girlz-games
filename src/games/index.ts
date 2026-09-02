import type { GameDef } from '../core/types'
import { memory } from './memory'
import { catchGame } from './catch'
import { intrus } from './intrus'
import { moleGame } from './mole'
import { simonGame } from './simon'
import { runGame } from './run'
import { ninja } from './ninja'
import { flappy } from './flappy'
import { letters } from './letters'
import { coloring } from './coloring'
import { dressup } from './dressup'
import { piano } from './piano'
import { patterns } from './patterns'
import { clock } from './clock'
import { tables, additions } from './tables'
import { mirror } from './mirror'
import { market } from './market'
import { maze } from './maze'
import { beatbox } from './beatbox'
import { taquin } from './taquin'
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
  icetower, ninja, moleGame, catchGame, caterpillar, runGame, flappy, maze, taquin, memory, simonGame, stand3d,
  connect4,
  clock, tables, additions, market, intrus, space, patterns, mirror, letters, geoGame,
  snowman, dressup, beatbox, piano, fireworks, coloring, pizza
]

/* L'accueil est découpé en trois univers + le Défi à deux. Chaque jeu vit dans
   UN SEUL univers — l'affectation est ici, pas dans les fichiers de jeux :
   - Jouer     = on s'amuse, on peut perdre (action, puzzles, plateau)
   - Apprendre = pédagogique, jamais de sanction
   - Créer     = pas de score du tout
   La coupe du 2 septembre (voir AUDIT.md) a retiré balloon, popcorn, fish,
   battleship, quiz, socks et puzzle du catalogue. Leurs bonnes idées sont
   à greffer : fenêtre « prêt/brûlé » de popcorn → mole, mode « Compte » de
   quiz → additions, paires visibles contre la montre de socks → memory,
   pièces libres de puzzle → taquin. */
export const WORLDS: { id: string; label: string; icon: string; games: GameDef[] }[] = [
  {
    id: 'jouer', label: 'Jouer', icon: '⚡',
    games: [
      icetower, ninja, moleGame, catchGame, caterpillar, runGame, flappy,
      maze, taquin, memory, simonGame, stand3d, connect4
    ]
  },
  {
    id: 'apprendre', label: 'Apprendre', icon: '📚',
    games: [clock, tables, additions, market, intrus, space, patterns, mirror, letters, geoGame]
  },
  {
    id: 'creer', label: 'Créer', icon: '🎨',
    games: [snowman, dressup, beatbox, piano, fireworks, coloring, pizza]
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
