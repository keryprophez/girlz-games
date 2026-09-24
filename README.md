# 🐤 La Ferme Magique

Les jeux de **Joyce** (8 ans) et **Jade** (6 ans), sur tablette. Une webapp
installable, sans compte, sans publicité, sans collecte de données, où aucun
jeu n'exige de savoir lire.

Le projet est en pleine refonte (voir `AUDIT.md` du 2 septembre 2026) :
**moins de jeux, mais des vrais**, au niveau des jeux Flash qu'on aimait.

## ✨ Ce qu'il y a dedans

**Jouer** — des jeux d'adresse en vraie 3D (Three.js + cannon-es) : la Tour de
Glace, la Chenille, Poussin Volant ; Ninja Verger, en 2D, où l'on tranche des
fruits illustrés d'un trait de doigt, vague après vague, sans toucher le cactus ;
Tape-Trous et ses habitants construits en 3D (taupe, poussin, cochon, lapin…
et un cactus qui pique) ; le Labyrinthe en vraies haies 3D (classique,
brouillard à la lanterne, glace), où le poussin rejoint sa maman poule en
ramassant des grains ; et des classiques : Taquin (une photo ou un pré en
3D), Memory (de vraies cartes qui se retournent), Simon et Puissance 4, avec les
personnages 3D de la ferme (vache, poule, cochon, canard, mouton…) en pions.

**Apprendre** — sans sanction, la voix ne lit que le contenu : Quelle heure ?,
le Potager (les tables de multiplication : on trace au doigt un rectangle de
plantes, on le compte par rangées sur une petite mélodie, et une récolte de
douze questions retient ce qui est déjà su ; les divisions en expert), le
Grand Tableau + (un potager : chaque case trouvée fait pousser sa plante), le
Marché (vrais euros), l'Intrus, le Tour du Monde
(vrai globe NASA, vrais pays, la France avec ses régions et ses villes),
Voyage dans l'Espace (vraies planètes, une fusée, un mode « Trouve »),
Suites logiques, le Miroir (on peint en glissant, le reflet se replie), Chasse
aux lettres, la Poste aux Phrases (les types de phrases : on tamponne la
phrase avec le bon signe, et le point s'imprime tout seul).

**Créer** — sans score : Bonhomme de neige (on roule vraiment la boule dans la
neige, devant un chalet qui fume), Habille-toi (son personnage en 3D, qui la
suit ensuite dans les jeux), Boîte à Rythme (les animaux chantent en
sautant), Petit Piano (un piano laqué, la partition qui descend, les animaux
qui chantent), Feu d'artifice (au-dessus du village, reflété dans le lac),
l'Atelier (dessin au doigt, pot de peinture, tampons, dessins gardés), la
Pizzeria (on garnit, on enfourne, le fromage fond… et file quand on croque).

**Autour** — un accueil en trois univers (Jouer, Apprendre, Créer) au-dessus
d'un pré en 3D, la difficulté choisie dans chaque jeu (fleur,
éclair, flamme), le Ninja et Tape-Trous à deux en équipe sur la même tablette,
minuteur parental avec verrou « question de grand », voix de la famille
enregistrées (« Bravo ! »), musique générative par univers qui s'enrichit
quand le combo monte, vrais bruitages foley sur les chocs, mise à jour
automatique de la PWA. Le choix de joueuse (profils avec photo) est masqué
pour l'instant, prêt à revenir.

**Ce qu'il n'y aura jamais** : monnaie, boutique, paliers de déblocage ni
collection à compléter (l'album d'autocollants est sorti le 22/09), séries
quotidiennes, notifications, classements, publicité, analytique. Les règles
complètes sont dans `CLAUDE.md`.

## 🛠 Stack

| Brique | Choix |
|---|---|
| Build | Vite 6 + TypeScript strict, ESLint, vitest |
| Coquille (accueil, résultats, minuteur) | React 18 + zustand |
| Jeux | Modules vanilla TS montés dans un hôte commun (`GameHost`) |
| 3D & physique | Three.js + cannon-es via le socle `src/core/three3d.ts`, chargés à la demande |
| Images | Photos libres (iNaturalist, Wikimedia Commons) pour les imagiers ; personnages 3D rendus en images pour les pions (`src/core/portraits.ts`) |
| Son | Web Audio : musique générative, foley Kenney pour les chocs |
| Persistance | zustand + `localStorage` (meilleure note par jeu, réglages) |
| Installation | vite-plugin-pwa (service worker + manifest) |
| Déploiement | GitHub Actions → GitHub Pages |

Chaque jeu implémente `mount(ctx) => cleanup` (voir `src/core/types.ts`) et
tient en un fichier plus une ligne dans `src/games/index.ts`.

## 🚀 Développement

```bash
npm install
npm run dev          # http://localhost:5173/girlz-games/
npm run build        # tsc strict + build de production dans dist/
npm run preview      # sert le build
npm run lint         # ESLint
npm test             # vitest (logique pure)
npm run test:smoke   # ouvre chaque jeu dans Chromium : 0 erreur JS, chargement terminé
npm run test:play    # un bot par jeu joue sa partie jusqu'à l'écran de fin
```

`test:smoke` et `test:play` **bloquent le déploiement** en CI.

Sur la tablette, ajouter `?fps` à l'adresse allume un petit compteur d'images
par seconde (et le coût d'une image 3D) pour régler la 3D ; `?fps=0` l'éteint.

## 🌍 Mise en ligne

Le workflow `deploy.yml` construit, teste et publie sur
https://keryprophez.github.io/girlz-games/ à chaque push sur la branche par
défaut. Sur la tablette : ouvrir l'adresse, « Ajouter à l'écran d'accueil ».

## 🗺 Documents

- **`CLAUDE.md`** — les règles du projet, le contrat d'un jeu, le socle 3D, les
  pièges déjà payés, la méthode de vérification. **À lire avant de coder.**
- **`AUDIT.md`** — l'état des lieux du 2 septembre 2026 : verdict jeu par jeu,
  manques structurels, stack, roadmap.
- **`ROADMAP.md`** — où on en est et ce qui reste à faire.
