import type { GameDef } from '../core/types'
import { some, visible } from '../core/hand'
import { mountDoll } from './doll'

/* HABILLE-TOI — la petite fille des filles, en formes rondes comme les
   animaux de la ferme (`games/doll.ts`, `core/doll3d.ts`), sur son estrade.
   Du 27/09 au 6/10, ce jeu était « la Princesse » : le personnage VRM de
   pixiv, sa garde-robe, son bal. Le 6/10, le père : « ça rame trop, ramène
   la moche tête ronde, tant pis pour moi ». Le modèle VRM, ses décors et
   son compagnon sont partis ; la petite fille revient seule, comme du 23 au
   27/09, et c'est elle qu'on retrouve sur l'accueil, l'écran de fin et en
   tampon dans l'Atelier (`dollPortraits`). */
export const dressup: GameDef = {
  id: 'dressup', name: 'Habille-toi', icon: '👗', sq: 'sq-lilac', cat: 'creatif', music: 'meadow', noTier: true,
  subtitle: 'Compose ton look : robe, coiffure, chapeau…',
  // La main : une case d'habit
  hand: root => {
    const opts = visible(root, '.du-opt')
    return opts.length ? { tap: some(opts, 1)[0] } : null
  },
  mount: c => mountDoll(c)
}
