# 🐤 La Ferme Magique

Les jeux de **Joyce** (8 ans) et **Jade** (6 ans), sur tablette. Une webapp
installable, sans compte, sans publicité, sans collecte de données, où aucun
jeu n'exige de savoir lire.

Le projet est en pleine refonte (voir `AUDIT.md` du 2 septembre 2026) :
**moins de jeux, mais des vrais**, au niveau des jeux Flash qu'on aimait.

## ✨ Ce qu'il y a dedans

**Jouer** — des jeux d'adresse en vraie 3D (Three.js + cannon-es) : la Tour de
Glace ; Ninja Verger, en 2D, où l'on tranche des fruits illustrés
d'un trait de doigt, vague après vague, sans toucher le cactus ; le Labyrinthe
en vraies haies 3D (classique, brouillard à la lanterne, glace), où le poussin
rejoint sa maman poule — c'est au doigt de prendre chaque virage — en
ramassant les graines cachées au fond des impasses ; et des classiques : Taquin (une photo ou un pré en
3D), Memory (de vraies cartes qui se retournent), le Chœur de la ferme (les
animaux chantent avec leurs vraies voix, à toi de rejouer la chanson) et
Puissance 4, avec les personnages 3D de la ferme (vache, poule, cochon,
canard, mouton…) en pions.

**Apprendre** — sans sanction, la voix ne lit que le contenu : Quelle heure ?,
le Potager (LE jeu des calculs : on choisit ses opérations, + − × ÷, puis la
difficulté ; 7 × 8 pousse en rectangle de plantes compté par rangées, 7 + 4
en bande qui compte 8, 9, 10, 11 ; un Parcours de dix cases découvertes puis
redemandées trois fois, de plus en plus dur ; Découvre, où chaque résultat
reste écrit jusqu'à allumer toute la grille ; une récolte de douze questions
qui retient ce qui est déjà su), le Marché (vrais euros), l'Intrus, le Tour du Monde
(vrai globe NASA, vrais pays, la France avec ses régions et ses villes),
Voyage dans l'Espace (le vrai système solaire du jour : le Soleil qui bout,
la Terre et ses villes la nuit, les anneaux de Saturne, les lunes de Jupiter ;
une fusée qu'on suit en vol, le temps qui file, un mode « Trouve »),
Suites logiques, les Perles Miroir (une plaque à picots en 3D : on pose
les perles qui complètent le reflet d'un papillon, d'une fraise ou d'une tête
de cochon, puis le fer les fait fondre et l'objet s'envole), Chasse
aux lettres, la Poste aux Phrases (les types de phrases : on tamponne la
phrase avec le bon signe, et le point s'imprime tout seul).

**Créer** — sans score : la Princesse (une vraie princesse en
3D — un visage expressif, des yeux qui suivent le doigt, des cheveux qui
ondulent — qu'on habille pièce par pièce en glissant les habits de la garde-robe, qu'on teint
au doigt, qu'on coiffe — peigne, ciseaux, fer, barrettes —, avec son
compagnon — licorne, poney, chaton, chiot — dans une salle de bal ou un jardin
de château qu'on touche ; une photo qui devient un coloriage de l'Atelier ; à
deux, les princesses de Jade et de Joyce ; et pour finir, le bal — un petit
bouton ouvre l'ancienne version, Habille-toi, la petite fille à couettes
qu'on coiffe d'un chapeau et qui tient un ballon), les Bijoux (un collier
enfilé perle par perle — nacrées, verre, cristal, cœurs, étoiles — sur un
fil tendu en U, fermé, présenté en vitrine sur un coussin de velours… puis
porté par la princesse, au bal et dans la Princesse), Petit Piano (un piano laqué, la
partition qui descend, les animaux qui chantent, dix chansons), Feu d'artifice (au-dessus du village, reflété dans le lac ; on dessine une forme au doigt et la fusée éclate en la dessinant, et le bouquet final est un spectacle en musique où ses dessins reviennent en grand),
l'Atelier (dix pinceaux — néon, paillettes, aquarelle, craie, spray, cœurs,
étoiles, arc-en-ciel… —, le miroir et la rosace, des papiers de couleur, le
pot de peinture, les tampons de la ferme et leurs princesses, les coloriages
tirés des photos de la Princesse, et un livre de coloriages : les animaux de
la ferme de face et de profil, le petit train, la fusée, la grange ; un dossier où ranger ses dessins,
les reprendre, revoir leur film ou les enregistrer dans la tablette), la
Pizzeria (on garnit, on enfourne, le fromage fond… et file quand on croque).

**Autour** — un accueil en trois univers (Jouer, Apprendre, Créer) au-dessus
d'un pré en 3D, chaque jeu montré en affiche (une image du jeu en train de se
jouer), la difficulté choisie dans chaque jeu (fleur,
éclair, flamme), une main fantôme qui montre le geste de chaque jeu (sans
jamais donner la réponse), le Ninja et la Princesse à deux en équipe sur la même tablette,
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
