import type { GameDef } from '../core/types'
import { pizzaDish } from './pizza'
import { cakeDish } from './bakery'

/* 🍳 LA CUISINE (27/10, Créer) — la Pizzeria et la Pâtisserie sous une seule
   tuile (le père : « dans la cuisine, pizzeria et pâtisseries, tu fusionnes »).
   À l'ouverture, deux grandes images : la pizza ou le gâteau (`variants`,
   choisi dans la coquille et retenu) ; ensuite chacun est le jeu qu'il était,
   avec sa propre scène. Le bouton de la barre ramène au choix. */

const DISHES = { pizza: pizzaDish, gateau: cakeDish }
type DishId = keyof typeof DISHES
let cur: DishId = 'pizza'

const img = (id: DishId) => import.meta.env.BASE_URL + `assets/affiches/cuisine-${id}.webp`

export const cuisine: GameDef = {
  id: 'cuisine', name: 'La Cuisine', icon: '🍳', sq: 'sq-peach', cat: 'creatif', music: 'kitchen', noTier: true,
  subtitle: 'Une pizza ou un gâteau : prépare-le, décore-le… et mange-le !',
  variants: [
    { id: 'pizza', name: 'Pizza', img: img('pizza') },
    { id: 'gateau', name: 'Gâteau', img: img('gateau') }
  ],
  hand: root => DISHES[cur].hand?.(root) ?? null,
  mount(c) {
    cur = c.variant === 'gateau' ? 'gateau' : 'pizza'
    return DISHES[cur].mount(c)
  }
}
