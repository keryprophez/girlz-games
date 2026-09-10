# 🗺 Roadmap — moins de jeux, des vrais

> **Les règles du projet sont dans `CLAUDE.md`**, l'état des lieux détaillé
> (verdict par jeu, notes, bugs, stack) dans **`AUDIT.md`** du 2 septembre 2026.
> Ce document ne dit que : **où on en est** et **ce qui reste à faire**.

Objectif : des jeux **plein écran, avec une vraie boucle** (enjeu, rampe liée à
la performance, near-miss, outro), au niveau des jeux Flash qu'on aimait. Un
jeu par itération, livré, joué, capturé.

---

## Décisions du 2 septembre (validées)

- La coupe : de 37 à ~30 entrées, dont 9 à 12 vrais jeux. Sortis : `balloon`,
  `popcorn`, `fish`, `battleship`, `quiz`, `socks`, `puzzle`, `farmArt`, le mode
  3D du labyrinthe. Leurs bonnes idées à greffer sont notées dans
  `src/games/index.ts`.
- **Aucune lecture, aucune consigne à la voix** : `say()` ne lit que du
  contenu. Le moteur de voix est gardé, il servira ensuite.
- Apprendre **sans sanction** : plus de vies, chrono ni bonus de vitesse dans
  les exercices (à retirer de `intrus` en phase 2 ; `quiz` est sorti).
- `pizza` **gelée** dans Créer : on n'y investit plus.
- Tablette cible : **Samsung Galaxy Tab A9+** (Snapdragon 695, Adreno 619,
  1920×1200). Réglages 3D à mesurer dessus avant de toucher aux ombres.
- Pas de base cloud : photos et voix restent locales (règle 3). L'export JSON
  reste le filet ; IndexedDB pour les blobs plus tard.

---

## Phase 0 — Couper et assainir ✅ (2/09)

- Catalogue coupé et réorganisé ; plus de compteur de jeux à l'accueil.
- Bugs corrigés : sticker affiché en texte (« dog »), ligne gagnante du
  Puissance 4, révélation des Suites, échelle des ingrédients à la cuisson,
  crash du piano au démontage, IBL et voix de l'Espace, consignes de la Loupe.
- Hygiène : CSS mort (1153 → ~900 lignes), aurore de l'igloo, atlas `tiles`,
  docs, `strict: true`, ESLint, vitest, `types.ts` conforme à la règle voix.
- CI : smoke en paysage (viewport Tab A9+), service worker bloqué, échec si
  un jeu 3D reste sur son écran d'attente ; bots inchangés (ils tournent bien
  en CI : 2 min 22 s sur le dernier run).

## Phase 1 — La coquille de jeu et le moteur d'arcade (en cours)

Le chantier qui change tous les jeux d'un coup. Plan validé le 2/09 : tout en
paysage, plein écran automatique, carton titre, une ligne de texte gardée
sur l'écran de fin, sessions A puis B puis C.

1. ✅ **Session A — plein écran et cycle de vie** : l'arène = le viewport,
   barre flottante maison/pause/rejouer, carton titre 1,5 s, icônes SVG dans
   la coquille (`core/icons.ts`), cérémonies différenciées (3 étoiles = fête,
   1 étoile = « Encore ! » sans confetti, Créer sans étoiles), outro via
   `finish({ outroMs })`, pause globale (`core/session.ts` : onglet caché,
   minuteur parental qui fige au lieu de démonter, bouton pause), écran Oups
   sur `unhandledrejection` et loader bloqué > 15 s, timers de partie
   `ctx.after/every`, `pixelRatio` ≤ 1,5, manifest en paysage + invite à
   tourner la tablette. Reste pour la phase 2 : les HUD des jeux (chips
   emoji, `.g3-hint` en texte) passent par `core/arcade.ts` jeu par jeu.
2. ✅ **Session B — le moteur d'arcade et la scène partagée** :
   `core/arcade.ts` (score, vies, combo, rampe liée à la performance, temps
   simulé, timers `after`, HUD en icônes dans l'arène, mot-image `flash`,
   barème d'étoiles, `end()` avec outro) ; `core/scene3d.ts` (sol, décor
   depuis le kit glTF nature importé, `shade` contre le délavage ACES,
   particules GPU en `Points`, secousse de caméra, projection monde → écran) ;
   `core/sfx.ts` (34 échantillons Kenney : tranche, whoosh, pas, tic, clic…
   sur un bus effets) ; ducking de la musique sous la voix ; `stage.timeScale`
   pour les ralentis. **`icetower`** migré : vrais sapins, tic de balancier,
   rampe par bloc posé, particules, écroulement joué en outro au ralenti.
3. ✅ **Session C — `ninja`** migré : HUD d'arcade avec chrono, fruits sur
   toute la largeur de l'écran (et en travers depuis les bords aux crans
   élevés), bonus multi-tranche avec ralenti et « ×N », moitiés coupées dans
   le sens du geste, jus en particules dans la scène, tranche et whoosh
   échantillonnés, lame nette (DPR), rampe tous les 6 fruits. Deux bots de
   plus en CI (tour, ninja) : 7 scénarios. Confettis en papier (plus d'emoji).
4. À faire en fond : `core/rounds.ts` et `core/exercise.ts` (manches sans
   temps mort, QCM avec second essai) quand les jeux 2D et Apprendre seront
   itérés ; sonde fps `?fps` ; captures de référence par jeu.

## Phase 2 — Un jeu par session

- ✅ **`mole` (Tape-Trous) refait en 3D** (2/09) : pré en vraie 3D avec haie,
  clôture, fleurs et buissons du kit nature ; trous creusés ; animaux Kenney
  en sprites face caméra qui jaillissent avec de la terre ; taper un trou
  vide casse le combo (fini le martelage) ; un animal qui s'échappe casse le
  combo puis coûte un cœur dès le 3ᵉ cran ; rampe tous les 8 animaux ; plus
  de chrono, la partie finit aux cœurs ; outro où les animaux ressortent se
  moquer. Bot CI `taupe-huit-animaux` (8 scénarios).
- ✅ **`geo` refait : Le Tour du Monde**, de la vraie géographie. Un globe
  avec la Terre NASA (Blue Marble) et les 177 pays de Natural Earth tracés
  dessus, qu'on fait tourner au doigt ; la France en relief avec ses 13
  régions (IGN) et 14 grandes villes en épingles (dont Saint-Maximin).
  Explore (on touche, la voix nomme) et Trouve (un animal → son continent,
  ou la voix dit un pays, une ville, une région). Deuxième essai puis
  révélation, aucune sanction. Bot CI `tour-du-monde-vrais-pays`.
- ✅ **`space` avec de vraies planètes** : textures NASA (Terre) et Solar System
  Scope CC BY 4.0 (Soleil, Mercure, Vénus, Lune, Mars, Jupiter, Saturne et ses
  anneaux, Uranus, Neptune), réduites à 1024×512 pour la tablette. Plus une
  seule planète dessinée à la main.

- ✅ **`catch` (Attrape) refait** : un VRAI panier physique (fond et bords
  cinématiques qui poussent les fruits), les fruits rebondissent et se posent
  dedans ou en ressortent par le bord ; une ombre au sol dit où chaque fruit
  va tomber ; un fruit par terre coûte un cœur, un piment attrapé aussi ;
  rampe tous les 8 fruits (gravité et cadence) ; plus de chrono ; verger du
  kit nature. Bot CI `attrape-six-fruits` (10 scénarios).

- ✅ **`caterpillar` (La Chenille) refait** sur `core/arcade.ts` : corps
  continu (courbe Catmull-Rom, anneaux à espacement constant qui ondulent),
  pas sur l'horloge simulée (plus de saut de phase à chaque fruit), la
  clôture du kit nature est un vrai mur (on cogne, on perd un cœur, on
  repart), se mordre coûte un cœur et raccourcit ; vrais fruits du kit food,
  fraise bonus 5 s qui vaut 3 ; tic à chaque pas, accélération par fruit ;
  outro au ralenti. Le compteur est le nombre de fruits (`plainScore`), pas
  un score à combo. Bot `chenille-croque-des-fruits` qui ne fait plus
  demi-tour dans le mur.

- ✅ **`run` (Course) et `flappy` (Poussin Volant) refaits sur un socle
  runner commun** (`core/runner.ts` : monde qui défile en mètres, obstacles
  comptés au passage et retirés derrière la caméra, couches de décor en
  parallaxe, invulnérabilité qui clignote, texture de sol qui défile).
  Course : une seule boucle en mètres, saut de 0,95 m proportionné aux
  obstacles (vrais rondins, rochers, souches du kit nature), tampon d'entrée,
  vitesse qui monte tous les 5 sauts avec des doubles aux paliers hauts,
  near-miss « Ouf ! » quand on frôle ou qu'on atterrit juste derrière,
  obstacle percuté qui valse, tracteur qui se renverse au ralenti. Poussin :
  rampe tous les 4 passages (vitesse et passage borné), le sol coûte un cœur
  et relance, near-miss à un cheveu d'un chapeau, culbute au ralenti dans un
  nuage de plumes, titre de fin qui ne fête plus une chute, prairie et nuages
  de jour. Bots `course-soixante-metres` et `poussin-deux-barrieres`
  synchronisés sur la frame (la 3D tourne à 4 fps sous swiftshader).

- ✅ **`snowman` (Bonhomme de neige) refait** : la boule ne se téléporte
  plus, on la ROULE jusqu'à la pile (un anneau au sol, une flèche quand elle
  est assez grosse), elle y monte en arc puis tombe et s'écrase avec la
  physique ; chaque boule est plafonnée à 78 % de la précédente. L'habillage
  n'est plus un formulaire à six onglets : un plateau de seize vrais objets
  3D accroché à la caméra, qu'on glisse sur le bonhomme (chaque objet
  connaît sa place, une seule pièce par famille, on peut les reprendre), un
  dé pour une tenue surprise, des flèches pour tourner autour. Chocs sur
  `impact`, particules GPU, plein écran, aucune note. Bot
  `bonhomme-parcours-complet` : trois boules roulées à la pile, un chapeau
  glissé sur la tête.

- ✅ **Retours de la tablette du 3/09** : bouton son dans la barre de jeu
  (coupe musique, bruitages et voix à tout moment) ; les plateaux 2D sont
  centrés verticalement ; les boutons de réponse (`.qopt` : heures, tables)
  ont enfin un style ; les moitiés de fruits du Ninja ne cognent plus les
  fruits entiers ; l'écran de fin laisse voir la partie figée derrière (le
  jeu reste monté, en pause, jusqu'au rejouer) ; le plein écran reste d'un
  jeu à l'autre et le jeu se monte après le passage en plein écran (plus de
  saut) ; l'animal tapé du Tape-Trous retombe dans son trou.

- ✅ **Retours du 7/09** : les déploiements échouaient depuis trois commits
  (bot de la Tour de Glace instable : crochet périmé, corrigé) — le site
  était resté à la version de la Chenille. Le plein écran natif de l'app
  installée (`display: fullscreen`) remplace la demande de plein écran et
  son message du navigateur. Tape-Trous : les animaux sont des panneaux
  verticaux ancrés aux pieds (`standeeFromAtlas`) qui SORTENT du trou, avec
  étirement à la sortie et dépassement, respiration, moquerie avant de
  replonger, écrasement puis chute en vrille quand on tape.

- ✅ **`maze` (Labyrinthe) poli** : plein écran (le plateau prend toute la
  hauteur), modes en colonne d'icônes soleil/lune/flocon, manches en
  pastilles, plus rien à lire ; le doigt rapide ne décroche plus (la case
  visée est rejointe en suivant le couloir si elle est à moins de six pas) ;
  un mur heurté se sent (choc, écrasement, poussière) ; retrouver la poule
  est une fête (câlin, cœurs) ; glace givrée ; timers de partie, état typé.
  Bot `labyrinthe-doigt-rapide` (chemin BFS tracé un point sur trois).

- ✅ **`taquin` poli** : plein écran (plateau carré sur toute la hauteur,
  colonne d'icônes image/nombres/ma tête/la ferme, modèle et compteur sur
  le côté, plus rien à lire) ; taper une tuile alignée avec le trou fait
  glisser toute la rangée ; un coup impossible secoue la tuile ; le par est
  la vraie distance à la solution (Manhattan) ; l'image de base est
  dessinée avec les vrais animaux de la ferme (plus de SVG à emoji) ; état
  typé, timers de partie. Bot `taquin-remis-en-ordre` (recherche en
  largeur puis tuiles tapées dans l'ordre).

- ✅ **`memory` poli** : plein écran (cartes aussi grandes que la place le
  permet, manches en pastilles et compteur sur le côté, plus rien à lire) ;
  vrai dos de carte à motif étoile (plus de « ? ») ; l'aperçu ne vide plus
  le défi (long en douce, bref en normale, absent en experte) ; paire
  trouvée qui brille, mauvaise paire qui se secoue ; sons de gestes, état
  typé, timers de partie. Bot `memory-toutes-les-paires` (trois manches).

- ✅ **`simon` poli** : quatre grands pads plein écran avec les vrais animaux,
  plus de texte (oreille pendant l'écoute, main quand c'est à toi, pads
  grisés pendant l'écoute), l'animal qui chante saute, fausse note qui
  secoue en rouge et montre la bonne, titre de fin selon la longueur ;
  timers pause-safe, état typé. Bot `simon-cinq-tours`.
- ✅ **`connect4` poli + IA** : grille plein écran, **jouer seule contre la
  poule** (minimax alpha-bêta, profondeur 2/4/6 selon le palier, un brin de
  hasard), tour signalé par la tête en grand qui saute (plus de phrase),
  jeton fantôme qui suit le doigt, chute avec choc, colonne pleine qui
  secoue, les quatre jetons gagnants scintillent. Bot
  `puissance4-contre-la-poule` (même IA des deux côtés).

- ✅ **Apprendre poli : `clock`, `tables`/`additions`, `intrus`**. Horloge :
  plein écran (cadran sur toute la hauteur, modes en icônes, manches en
  pastilles, plus une ligne à lire), aiguilles au doigt dans Découvre et
  Règle, « une heure », « midi », « moins le quart » corrects. Grand Tableau :
  grille carrée plein écran aux cases enfin lisibles, consigne remplacée par
  un grand nombre-cible ou l'opération sur le côté, pavé numérique en
  colonne. Intrus : plus de chrono, de bonus vitesse ni de série (Apprendre
  sans sanction), plus d'énoncé en négation (la famille est nommée en
  positif et dite par la voix), tuiles plein écran. Bots
  `horloge-huit-heures`, `tableau-huit-cases`, `intrus-six-manches`.

- ✅ **Lot Réflexion/Créer poli : `market`, `letters`, `patterns`, `mirror`,
  `piano`, `dressup`, `coloring`, `beatbox`, `fireworks`**. Marché : la voix
  dit le total à chaque pièce posée ou retirée, modes et validation en icônes.
  Chasse aux lettres : le mot est montré 3 s, dit par la voix et illustré par
  l'animal de la planche avant d'être cherché. Suites : réponse révélée en
  place dans la suite. Miroir : la case fausse tremble (aucune sanction).
  Piano : chansons numérotées, crash au démontage corrigé (timer de partie).
  Habille-toi : la tenue est enregistrée à chaque geste, fonds en pastilles.
  Coloriage : le dessin est gardé par joueuse et par scène, scènes choisies
  sur des mini-dessins, panneau qui tient dans la hauteur. Boîte à rythme :
  horloge accumulée sans dérive, vrais animaux de la planche sur les lignes.
  Feu d'artifice : canvas à la densité de l'écran, village en silhouette,
  compteur de fusées et bouquet final en icônes.

- ✅ **`stand3d` refait sur le socle** : `createStage` + `arcade` +
  `scene3d` (plus de renderer maison, nettoyage GPU complet). Manches
  enchaînées : une pile tombée en entier = la suivante, plus de caisses,
  plus lourdes, plus loin. Un lancer qui ne couche rien coûte un cœur ; les
  caisses tombées d'un même lancer font monter le combo ; une caisse qui
  vacille et se rattrape = « presque ». Le geste est montré par la
  trajectoire qui pulse avant le premier lancer, puissance normalisée à la
  hauteur de l'arène. Décor du kit nature, auvent, particules GPU, secousse
  et suivi de caméra, outro au ralenti sur les caisses restantes. Bot
  `stand-six-caisses` (vise la caisse debout la plus basse).

- ✅ **`icetower` : le porte-à-faux casse**. Le bloc est jugé à
  l'atterrissage : ce qui dépasse du bloc du dessous se détache (un vrai
  morceau qui tombe, son de glace, éclats) et le bloc suivant a la largeur
  de ce qui reste — la précision se paie au bloc suivant, la tour s'affine.
  Trop peu de recouvrement = il bascule, un cœur. Un parfait garde la
  largeur ; trois parfaits d'affilée en redonnent un peu. Les blocs posés
  sont figés (plus de tour qui tremble), seuls les ratés et les morceaux
  vivent en physique.

- ✅ **La Pizzeria sans un mot** : outils en rendus du Food Kit (plus d'emoji),
  four et sortie en icônes, barre de cuisson crème → doré → brun → noir à la
  place des phrases, et la pizza **brûle** si on l'oublie (elle noircit et
  fume, particules GPU). Sons de gestes, timers de partie.

- ✅ **Coquille simplifiée (demande du 10/09)** : le **Défi à deux est
  supprimé** (accueil, coquille, contrat `GameDef`, CSS, bots) ; la fenêtre de
  **sauvegarde est retirée** ; le choix de joueuse est **masqué** derrière un
  drapeau dans `Home.tsx`. L'accueil n'est plus qu'une grille de jeux, et la
  **difficulté se choisit dans chaque jeu** : trois boutons sans lecture
  (fleur, éclair, flamme), dernier niveau retenu par jeu, bouton de la barre
  en jeu pour en changer.

- ✅ **Les 30 tuiles de l'accueil dessinées** (`core/badges.ts`) : plus un seul
  emoji sur l'accueil, les cartons titre ni le choix de niveau. Une vignette
  SVG par jeu dans la palette de l'app, lisible à 46 px, plus les trois
  univers (éclair, livre, palette). Cinq vignettes redessinées après lecture
  des captures : la Tour trop pâle, l'Attrape qui ressemblait à un cupcake,
  le Labyrinthe illisible, le Ninja sans découpe, le Marché sans monnaie.

- ✅ **Ninja Verger en survie** : le chrono de 45 s est supprimé — la partie
  finit quand les cœurs sont épuisés, le plafond d'adresse est infini. Un
  fruit laissé tomber casse la série et, une fois la cadence montée (cran 3
  en douce, 2 en normale, 1 en expert), coûte un cœur. Frôler un piment sans
  le trancher déclenche un « ouf » : le near-miss qui manquait.

Ordre pour la suite :

`pizza` (échelle des
ingrédients à la cuisson) → `ninja` (rampe) → tuiles de l'accueil encore en
emoji → sonde de fréquence d'images sur la tablette.

Chaque itération : une demi-page de design (geste, enjeu, rampe, outro,
sons), l'implémentation, un bot qui gagne, une capture de référence.

## Phase 3 — Ce qui fait « un jeu » plutôt que vingt

- Personnage partagé glTF animé avec la photo en visage ; `ctx.look` lu.
- Coopération à deux doigts sur la même tablette (Attrape, Taupe, Ninja).
- L'Atelier (refonte de `coloring`) : pinceau, tampons, annuler, album.
- Chargement paresseux par jeu + CSS colocalisé ; IndexedDB pour les blobs.
- À décider plus tard : `letters` (refonte ou sortie).

---

## Ce qui est déjà fait et qu'on ne refait pas ✅

- Vraie 3D + physique sur `core/three3d.ts` pour 11 jeux ; kits glTF `food`,
  `holiday`, `space` ; planches Kenney `animals`, `fish`, `nature`, `items` +
  icônes food, importées par `scripts/import-assets.mjs`.
- 24 foley Kenney branchés sur `core/impact.ts`.
- Musique générative 6 thèmes (`core/music.ts`), unique et sans fichier.
- Minuteur parental avec verrou « question de grand » (`PlayTimer.tsx`).
- Sauvegarde exportable + alerte quota (`core/backup.ts`).
- Difficulté adaptative silencieuse (`progress.adapt`).
- Médaillon photo dans la 3D (`avatarMedallion`).
- Anti-crash (ErrorBoundary + capture des erreurs runtime), maj PWA auto.
- Smoke test et bots de jeu en CI.
