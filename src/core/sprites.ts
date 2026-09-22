/* Images des jeux en DOM — les photos des imagiers et les icônes du Food Kit.

   Les planches 2D de Kenney (animaux, nature, objets, poissons) sont sorties
   le 22/09 : plus aucun jeu ne les chargeait. Les imagiers sont en photos
   (ci-dessous), les pions et les personnages en 3D (`core/critters.ts`,
   rendus en images par `core/portraits.ts` pour les jeux en DOM).

   Rien n'est précaché par le service worker : c'est le temps de démarrage qui
   compte, pas la disponibilité hors-ligne. */

/* ---------- Photos réelles (Wikimedia / Openverse, licences libres) ----------
   Demande du 12/09 : pour les jeux d'images, de VRAIES photos plutôt que des
   dessins. `scripts/import-photos.mjs` les installe dans public/assets/photos ;
   les crédits sont dans CREDITS.json à côté.

   Depuis le 12/09, **les imagiers n'utilisent plus que ça** : l'Intrus, Memory,
   la Chasse aux lettres et le Marché montrent des photos et rien d'autre — le
   père ne voulait pas voir deux styles. Ce qui est PION ou DÉCOR de jeu
   (Puissance 4, Simon, Taquin, la Boîte à rythme) est fait des personnages 3D
   de la ferme ; le Tour du Monde montre aussi ses animaux en photo (22/09).

   Les animaux viennent d'iNaturalist (photos identifiées par l'espèce), le
   reste des catégories de Wikimedia Commons. Toutes sont ramenées au même
   moule à l'import : carré, 512 px (voir scripts/import-photos.mjs). */
export const PHOTOS = new Set([
  // Ferme
  'cow', 'pig', 'chicken', 'chick', 'duck', 'horse', 'goat', 'sheep', 'rabbit', 'dog', 'cat',
  // Sauvages
  'elephant', 'giraffe', 'lion', 'monkey', 'bear', 'zebra', 'fox', 'deer', 'hedgehog',
  'frog', 'snake', 'owl', 'parrot', 'penguin', 'whale', 'fish', 'turtle', 'butterfly',
  // Un animal par continent, pour le Tour du Monde (22/09)
  'panda', 'tiger', 'kangaroo', 'koala', 'hippo', 'bison', 'moose', 'sloth', 'llama',
  // Fruits
  // Pas d'ananas : les seules photos libres le montrent sur son pied, vert et
  // noyé dans ses feuilles — irreconnaissable à 6 ans. Onze fruits suffisent.
  'apple', 'banana', 'strawberry', 'grapes', 'cherries', 'orange', 'pear', 'lemon',
  'watermelon', 'peach', 'plum',
  // Légumes
  'carrot', 'tomato', 'broccoli', 'corn', 'eggplant', 'onion', 'cabbage', 'pumpkin',
  'radish', 'potato', 'cucumber', 'mushroom',
  // À manger
  'bread', 'baguette', 'cheese', 'cake', 'cookie', 'muffin', 'croissant', 'egg', 'milk', 'honey',
  // Objets de la cuisine
  'plate', 'cup', 'pot', 'spoon', 'glass'
])
export const photoUrl = (name: string) => `${import.meta.env.BASE_URL}assets/photos/${name}.jpg`
/** Une photo prête à insérer : carrée, coins arrondis, recadrée au centre. */
export const photoImg = (name: string, px: number) =>
  `<img class="photo" src="${photoUrl(name)}" width="${px}" height="${px}" alt="" loading="lazy">`

/** Chemin d'une icône food (rendu 2D du Food Kit, voir import-assets.mjs). */
export const foodIcon = (name: string) => `${import.meta.env.BASE_URL}assets/icons/food/${name}.png`

/** Une icône food prête à insérer dans du HTML. */
export const foodImg = (name: string, px: number) =>
  `<img class="spr" src="${foodIcon(name)}" width="${px}" height="${px}" alt="">`
