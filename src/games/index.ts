import type { GameDef } from '../core/types'
import { memory } from './memory'
import { intrus } from './intrus'
import { simonGame } from './simon'
import { ninja } from './ninja'
import { letters } from './letters'
import { coloring } from './coloring'
import { dressup } from './dressup'
import { piano } from './piano'
import { patterns } from './patterns'
import { clock } from './clock'
import { potager } from './potager'
import { mirror } from './mirror'
import { market } from './market'
import { maze } from './maze'
import { taquin } from './taquin'
import { connect4 } from './connect4'
import { pizza } from './pizza'
import { space } from './space'
import { geoGame } from './geo'
import { fireworks } from './fireworks'
import { icetower } from './icetower'
import { sentences } from './sentences'
import { bijoux } from './bijoux'
import { hideseek } from './hideseek'
import { pinball } from './pinball'
import { parrot } from './parrot'
import { farmbuild } from './farmbuild'
import { bakery } from './bakery'
import { drawguess } from './drawguess'

export const GAMES: GameDef[] = [
  icetower, ninja, pinball, hideseek, drawguess, maze, taquin, memory, simonGame,
  connect4,
  clock, potager, market, intrus, geoGame, space, patterns, mirror, letters, sentences,
  dressup, bijoux, piano, fireworks, coloring, pizza, parrot, farmbuild, bakery
]

/* L'accueil est découpé en trois univers. Chaque jeu vit dans
   UN SEUL univers — l'affectation est ici, pas dans les fichiers de jeux :
   - Jouer     = on s'amuse, on peut perdre (action, puzzles, plateau)
   - Apprendre = pédagogique, jamais de sanction
   - Créer     = pas de score du tout
   La coupe du 2 septembre (voir AUDIT.md) a retiré balloon, popcorn, fish,
   battleship, quiz, socks et puzzle du catalogue. Leurs bonnes idées sont
   à greffer : mode « Compte » de
   quiz → le Potager (+ − × ÷ depuis le 27/09), paires visibles contre la montre de socks → memory,
   pièces libres de puzzle → taquin. La Loupe Magique (geo) est sortie le
   2/09 : des pays inventés n'apprennent rien, on refera une géographie
   VRAIE ou rien. */
export const WORLDS: { id: string; label: string; icon: string; games: GameDef[] }[] = [
  {
    id: 'jouer', label: 'Jouer', icon: '⚡',
    games: [
      icetower, ninja, pinball, hideseek, drawguess,
      maze, taquin, memory, simonGame, connect4
    ]
  },
  {
    id: 'apprendre', label: 'Apprendre', icon: '📚',
    games: [clock, potager, market, intrus, geoGame, space, patterns, mirror, letters, sentences]
  },
  {
    id: 'creer', label: 'Créer', icon: '🎨',
    games: [dressup, bijoux, piano, fireworks, coloring, pizza, parrot, farmbuild, bakery]
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
