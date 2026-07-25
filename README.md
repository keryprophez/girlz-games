# 🐤 La Ferme Magique

Les jeux de **Joyce** et **Jade** — une webapp de 37 jeux pensée pour jouer sur tablette ou téléphone. Le portfolio est curé pour 6-8 ans : chaque jeu a une raison d'exister, aucun n'exige de savoir lire.

## ✨ Ce qu'il y a dedans

- **37 jeux** en 4 catégories : Réflexion 🧠, Mémoire 🎯, Action ⚡, Créatif 🎨
- **⏳ Minuteur parental** : on règle un temps de jeu par tranches de 5 min ; à la fin, un doux écran de nuit met les jeux en pause — pour débloquer ou prolonger, il faut résoudre une multiplication « de grand » (verrou anti-enfant, 3 essais)
- **🐛 La Chenille** (snake tout doux : les bords téléportent, se marcher dessus fait juste trébucher), **🎆 Feu d'Artifice** (tape le ciel : sifflement, explosion en boule/anneau/cœur/étoile, bouquet final) — zéro échec
- **🎯 Le Stand 3D** : de la **vraie 3D temps réel** (Three.js) avec **vraie physique rigide** (cannon-es) — éclairage physique, ombres portées douces, matériaux PBR, tone mapping cinéma, textures générées à la volée (aucun fichier). On tire la balle en arrière, la trajectoire balistique exacte s'affiche, et les caisses basculent, s'entrechoquent et tombent de l'étagère pour de vrai
- **🌾 La Ferme** : l'accueil est un décor vivant plutôt qu'une grille — les deux filles s'y promènent (leurs photos en avatar), le **ciel suit l'heure réelle** (matin, jour, soir, nuit étoilée). **Tout le décor est là dès la première seconde** : aucun palier, rien à débloquer, rien qui pousse à rejouer. On touche **L'École 🧠, La Grange 🎯, Le Pré ⚡ ou L'Atelier 🎨** pour ouvrir ses jeux. Bouton 📋 pour la liste classique
- **✨ Moteur de « juice »** (`core/juice.ts`) : ressorts amortis, transition en iris à l'entrée de chaque jeu, secousses d'impact, cérémonie des étoiles sonore sur l'écran de résultat
- **Mise à jour automatique** : la PWA applique les nouvelles versions dès l'ouverture (plus besoin de fermer/rouvrir deux fois) ; vibrations tactiles sur Android
- **🚀 Voyage dans l'Espace 3D** : un vrai système solaire en trois dimensions — sphères texturées qui tournent autour d'un Soleil qui éclaire tout le monde, anneaux de Saturne en géométrie, lunes en orbite, nuages sur la Terre. On touche une planète, la fusée s'y envole et la caméra la suit ; une merveille est racontée à voix haute. Passeport à remplir et diplôme d'astronaute à la fin. Découverte pure, sans quiz
- **🔍 La Loupe Magique** : comprendre l'emboîtement **continent ⊃ pays ⊃ région ⊃ ville** sans quiz ni lecture — un petit animal veut rentrer chez lui, on zoome (vraie caméra) du plus grand au plus petit, les mots sont lus à voix haute et codés par couleur, et un récapitulatif emboîté conclut chaque tour
- **⛄ Hiver & cuisine, en 3D** : **Bonhomme de neige** (on roule vraiment une boule dans la neige, elle creuse son sillon et grossit, puis elle tombe et s'écrase sur la pile avec la physique — chapeau, écharpe et bras en volumes), **L'Igloo** (blocs de glace translucides taillés dans une vraie coupole, la calotte referme le sommet, un feu s'allume dedans et tout l'igloo s'illumine sous une aurore boréale), **La Pizzeria** (bac à sable sans étape imposée : sauce étalée au doigt, ingrédients qui *tombent* et roulent sur la pâte, four à bois où la pâte dore et le fromage fond, puis on mange les parts une par une)
- **Voix discrète** : la synthèse vocale ne sert qu'à lire le contenu à apprendre — multiplications, additions, heures, valeurs des pièces — jamais les consignes
- **🎙 Voix de la famille** : papa/maman enregistrent « Bravo ! » et « Presque ! » pour chaque fille (bouton 🎙 sur l'accueil) ; le vrai clip est joué à la fin des parties
- **⚔️ Défi à deux** : les sœurs jouent le même jeu tour à tour, écran de résultat commun et bienveillant, bouton Revanche — plus deux vrais jeux à deux sur la même tablette : **Puissance 4** (avec leurs têtes en jetons) et **Cache-Cache Pré** (bataille navale des animaux, on se passe la tablette)
- **Profils avec photos** : chaque fille a sa carte, on ajoute sa photo (bouton 📷) et sa tête apparaît dans les jeux (Poussin Volant, Course, Attrape, Habille-toi…) et dans le **Puzzle Photo** 🤳 (glisser-déposer avec image fantôme pour guider)
- **Personnage illustré** : la photo devient le visage d'un personnage SVG dessiné (cheveux, corps, habits) ; le look choisi dans Habille-toi suit la joueuse dans Poussin Volant, Course et Attrape
- **Jeux créatifs sans score** : Coloriage magique, Habille ton avatar, Petit Piano (mode libre + mélodies guidées « suis les lumières »)
- **Chaussettes** : paires de chaussettes dessinées en SVG à trier sur le fil à linge, contre la montre
- **Apprentissages** : Suites logiques (formes SVG), Quelle heure ? (5 modes didactiques : Découvre en manipulant, Les heures, Les minutes avec anneau, Quiz, Règle l'horloge en déplaçant les aiguilles), Grand Tableau des multiplications ET des additions 10×10 (Explore / Trouve la case / Remplis / Tape le résultat au clavier), Le Marché (vraies pièces en euros dessinées : Découvre, Paye le prix exact, Rends la monnaie), Le Miroir (complète la symétrie d'un motif de pixels), Labyrinthe généré (toujours solvable) avec 4 modes : 🐤 classique, 🌫 brouillard (lampe-torche), 🧊 glace (on glisse jusqu'au mur), 🕶 3D première personne (raycasting canvas + mini-carte)
- **Pop-corn !** : les grains tremblent quand ils sont chauds — tape dessus, POP, le pop-corn saute dans le carton
- **Boîte à Rythme de la ferme** : séquenceur 8 pas × 4 animaux dessinés, sons synthétisés, 3 tempos, presets
- **Puzzle avec n'importe quelle photo** : bouton 📷 dans le Puzzle pour charger une photo (papa, mamie, le chat…), gardée pour la prochaine fois
- **Aucune mécanique d'addiction** : pas de monnaie, pas de boutique, pas de paliers de déblocage, pas de série quotidienne, pas de notification. Les étoiles sont un simple retour de fin de partie ; le décor de la ferme est entier dès la première seconde. Voir les anti-objectifs de `ROADMAP.md`
- **Progression séparée** par joueuse : étoiles, album de 24 animaux à collectionner, meilleurs scores par jeu
- **3 niveaux de difficulté** par profil (🌱 Douce / 🌿 Normale / 🔥 Expert), réglables d'un tap
- **PWA installable** : s'ajoute à l'écran d'accueil comme une vraie app, polices auto-hébergées, mise à jour automatique
- **Sons synthétisés** en Web Audio (aucun fichier audio) : jingles, et de vrais bruitages sculptés au bruit blanc filtré (plouf 💦, explosion 🎈, pop sec 🍿, meuh 🐮, crounch de neige ❄️, woosh de lancer 🎾)
- **🎼 Musique d'ambiance GÉNÉRATIVE** (`core/music.ts`, toujours zéro fichier) : chaque univers a son thème — boîte à musique d'hiver, grand pad spatial, orgue de fête foraine, valse de trattoria, prairie douce, nuit calme — et la mélodie est improvisée en marche aléatoire sur la gamme : elle ne se répète jamais exactement. Volume discret, liée au bouton 🔊
- **Rendu WebGL (PixiJS)** pour les jeux d'action rapides — Ninja Verger, Attrape et Poussin Volant : fruits et légumes vectoriels texturés, particules, chargé à la demande (le reste de l'app reste léger)

## 🛠 Stack

| Brique | Choix |
|---|---|
| Build | Vite 6 + TypeScript |
| Coquille (accueil, profils, album, résultats) | React 18 |
| Jeux | Modules vanilla TS montés dans un hôte commun (`GameHost`) |
| 3D & physique | Three.js + cannon-es via le socle commun `src/core/three3d.ts` (Stand 3D, Bonhomme de neige, Igloo, Pizzeria, Espace) — chargés à la demande |
| Rendu WebGL 2D | PixiJS (Ninja, Attrape, Poussin) — chargé à la demande |
| État & persistance | Zustand + `localStorage`, export/import d'une sauvegarde JSON (bouton 💾) ⚠️ *pas encore de base de données — voir `ROADMAP.md` étape D* |
| Installation | vite-plugin-pwa (service worker + manifest) — l'app s'ajoute à l'écran d'accueil |
| Déploiement | GitHub Actions → GitHub Pages |

L'architecture des jeux est volontairement simple : chaque jeu implémente
`mount(ctx) => cleanup` (voir `src/core/types.ts`). Le `GameHost` React fournit
le contexte (difficulté, prénom, avatar, `finish()`, `toast()`) et gère
récompenses, rejouer et retour au menu. **Ajouter un 39ᵉ jeu = 1 fichier dans
`src/games/` + 1 ligne dans `src/games/index.ts`.**

## 🚀 Développement

```bash
npm install
npm run dev       # http://localhost:5173/girlz-games/
npm run build     # build de production dans dist/
npm run preview   # sert le build
```

## 🌍 Mise en ligne (une fois pour toutes)

1. Sur GitHub : **Settings → Pages → Source : GitHub Actions**
2. Merger sur `main` : le workflow `deploy.yml` construit et publie automatiquement
3. Le jeu est servi sur `https://<user>.github.io/girlz-games/` — à ajouter à l'écran d'accueil de la tablette

## 🧪 Qualité

```bash
npm run test:smoke   # ouvre les 37 jeux dans Chromium et vérifie 0 erreur JS
```
Ce test **bloque le déploiement** en CI si un jeu casse.

## 🗺 Suite du projet

- **`CLAUDE.md`** — les règles du projet : contraintes non négociables, contrat
  d'un jeu, socle 3D, pièges techniques déjà payés, méthode de vérification.
  **À lire avant de coder.**
- **`ROADMAP.md`** — où on en est (verdict jeu par jeu) et ce qui reste à faire.
