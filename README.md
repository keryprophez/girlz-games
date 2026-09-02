# 🐤 La Ferme Magique

Les jeux de **Joyce** (8 ans) et **Jade** (6 ans), sur tablette. Une webapp
installable, sans compte, sans publicité, sans collecte de données, où aucun
jeu n'exige de savoir lire.

Le projet est en pleine refonte (voir `AUDIT.md` du 2 septembre 2026) :
**moins de jeux, mais des vrais**, au niveau des jeux Flash qu'on aimait.

## ✨ Ce qu'il y a dedans

**Jouer** — des jeux d'adresse en vraie 3D (Three.js + cannon-es) : la Tour de
Glace, Ninja Verger, Attrape, la Chenille, Course, Poussin Volant, le Stand ;
et des classiques en sprites : Tape-Trous, Labyrinthe (classique, brouillard,
glace), Taquin photo, Memory, Simon, Puissance 4 avec les têtes des filles en
jetons.

**Apprendre** — sans sanction, la voix ne lit que le contenu : Quelle heure ?,
Grand Tableau × et +, le Marché (vrais euros), l'Intrus, Voyage dans l'Espace,
Suites logiques, le Miroir, Chasse aux lettres, la Loupe Magique.

**Créer** — sans score : Bonhomme de neige (on roule vraiment la boule dans la
neige), Habille-toi (le look est persisté), Boîte à Rythme, Petit Piano, Feu
d'artifice, Coloriage, la Pizzeria.

**Autour** — profils avec photo (cadrage zoomable), album d'animaux, Défi à
deux (chacune son tour, résultat commun et bienveillant), minuteur parental
avec verrou « question de grand », voix de la famille enregistrées (« Bravo ! »),
sauvegarde exportable, musique générative par univers, vrais bruitages foley
sur les chocs, mise à jour automatique de la PWA.

**Ce qu'il n'y aura jamais** : monnaie, boutique, paliers de déblocage, séries
quotidiennes, notifications, classements, publicité, analytique. Les règles
complètes sont dans `CLAUDE.md`.

## 🛠 Stack

| Brique | Choix |
|---|---|
| Build | Vite 6 + TypeScript strict, ESLint, vitest |
| Coquille (accueil, profils, album, résultats) | React 18 + zustand |
| Jeux | Modules vanilla TS montés dans un hôte commun (`GameHost`) |
| 3D & physique | Three.js + cannon-es via le socle `src/core/three3d.ts`, chargés à la demande |
| Visuels 2D | Planches de sprites CC0 (Kenney) chargées à la demande, `src/core/sprites.ts` |
| Son | Web Audio : musique générative, foley Kenney pour les chocs |
| Persistance | zustand + `localStorage`, export/import JSON (bouton 💾) |
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
npm run test:play    # des bots jouent les parcours clés jusqu'au bout
```

`test:smoke` et `test:play` **bloquent le déploiement** en CI.

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
