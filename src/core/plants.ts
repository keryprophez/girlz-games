/* Les dix plantes du potager — une par rangée de la table : la table de 3,
   c'est la rangée des violettes (Potager et Grand Tableau +).

   Des illustrations, pas des modèles 3D : les plantes Kenney rendues en
   image (puis en 3D) ont été jugées « immondes » par le père le 23/09. Elles
   ont été générées d'une seule planche avec Canva (même style pour toutes),
   fond retiré dans Canva, puis découpées en carrés de 224 px (WebP). La
   planche et son texte de commande sont décrits dans
   `public/assets/CREDITS.md` : pour en ajouter, regénérer TOUTE la planche,
   jamais une plante seule (deux styles sinon). */

export const GARDEN = ['tulipe', 'bouton', 'violette', 'fraise', 'carotte', 'mais', 'pomme', 'brocoli', 'aubergine', 'ananas'] as const
export type Plant = typeof GARDEN[number]

export const plantUrl = (p: Plant) => `${import.meta.env.BASE_URL}assets/plants/${p}.webp`

/** La plante de la rangée r (1 à 10). */
export const rowPlant = (r: number): Plant => GARDEN[(Math.max(1, r) - 1) % GARDEN.length]

/** Charge les dix images d'avance : aucune case ne pousse « à vide ». */
export function preloadPlants() {
  for (const p of GARDEN) { const im = new Image(); im.src = plantUrl(p) }
}
