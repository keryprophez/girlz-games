# 🐤 La Ferme Magique

Les jeux de **Joyce** et **Jade** — une webapp de 37 mini-jeux pensée pour jouer sur tablette ou téléphone, même sans connexion. Le portfolio est curé pour 6-8 ans : chaque jeu a une raison d'exister, aucun n'exige de savoir lire.

## ✨ Ce qu'il y a dedans

- **37 mini-jeux** en 4 catégories : Réflexion 🧠, Mémoire 🎯, Action ⚡, Créatif 🎨
- **⏳ Minuteur parental** : on règle un temps de jeu par tranches de 5 min ; à la fin, un doux écran de nuit met les jeux en pause — pour débloquer ou prolonger, il faut résoudre une multiplication « de grand » (verrou anti-enfant, 3 essais)
- **🐛 La Chenille** (snake tout doux : les bords téléportent, se marcher dessus fait juste trébucher), **🎪 Chamboule-Tout** (VRAIE physique matter.js : lance-pierre avec trajectoire prévisualisée exacte, boîtes-animaux qui culbutent, s'entrechoquent et dégringolent de l'étagère, la vache fait meuh), **🎆 Feu d'Artifice** (tape le ciel : sifflement, explosion en boule/anneau/cœur/étoile, bouquet final) — zéro échec
- **✨ Moteur de « juice »** (`core/juice.ts`) : ressorts amortis, transition en iris à l'entrée de chaque jeu, secousses d'impact, cérémonie des étoiles sonore sur l'écran de résultat
- **Mise à jour automatique** : la PWA applique les nouvelles versions dès l'ouverture (plus besoin de fermer/rouvrir deux fois) ; vibrations tactiles sur Android
- **🚀 Voyage dans l'Espace** : la joueuse devient astronaute (sa photo dans le hublot de la fusée) et explore le système solaire dessiné à la main — Soleil, 8 planètes vivantes (anneaux de Saturne, tempête de Jupiter, Terre bleue…), une merveille racontée à voix haute à chaque visite, passeport à remplir et diplôme d'astronaute à la fin. Découverte pure, sans quiz
- **🔍 La Loupe Magique** : comprendre l'emboîtement **continent ⊃ pays ⊃ région ⊃ ville** sans quiz ni lecture — un petit animal veut rentrer chez lui, on zoome (vraie caméra) du plus grand au plus petit, les mots sont lus à voix haute et codés par couleur, et un récapitulatif emboîté conclut chaque tour
- **⛄ Hiver & cuisine** : Bonhomme de neige (tape les boules pour changer leur taille, choisis leur forme et décore-le), L'Igloo (pose le bloc de glace de la bonne taille rangée par rangée — sans chrono en Douce, avant la tempête sinon), La Pizzeria (pâte, aplatissage, sauce tomate ou crème, ingrédients, cuisson au four à surveiller… puis on la croque !)
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
- **Aucune mécanique d'addiction** : pas de monnaie, pas de boutique, pas de zones à débloquer — juste des étoiles et un album
- **Progression séparée** par joueuse : étoiles, album de 24 animaux à collectionner, meilleurs scores par jeu
- **3 niveaux de difficulté** par profil (🌱 Douce / 🌿 Normale / 🔥 Expert), réglables d'un tap
- **PWA hors-ligne** : installable sur l'écran d'accueil, polices auto-hébergées, aucun réseau requis après la première visite
- **Sons synthétisés** en Web Audio (aucun fichier audio) : jingles, et de vrais bruitages sculptés au bruit blanc filtré (plouf 💦, explosion 🎈, pop sec 🍿, meuh 🐮)
- **Rendu WebGL (PixiJS)** pour les jeux d'action rapides — Ninja Verger, Attrape et Poussin Volant : fruits et légumes vectoriels texturés, particules, chargé à la demande (le reste de l'app reste léger)

## 🛠 Stack

| Brique | Choix |
|---|---|
| Build | Vite 6 + TypeScript |
| Coquille (accueil, profils, album, résultats) | React 18 |
| Jeux | Modules vanilla TS montés dans un hôte commun (`GameHost`) |
| État & persistance | Zustand + `localStorage` |
| Hors-ligne | vite-plugin-pwa (service worker + manifest) |
| Déploiement | GitHub Actions → GitHub Pages |

L'architecture des jeux est volontairement simple : chaque jeu implémente
`mount(ctx) => cleanup` (voir `src/core/types.ts`). Le `GameHost` React fournit
le contexte (difficulté, prénom, avatar, `finish()`, `toast()`) et gère
récompenses, rejouer et retour au menu. **Ajouter un 16ᵉ jeu = 1 fichier dans
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

## 🗺 Prochaines idées

- 🤝 Mode **coopération** (les deux jouent en même temps sur le même écran)
- 🖼 Les dessins des filles (scannés) comme fonds de niveaux
