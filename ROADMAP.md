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
- `pizza` était gelée dans Créer ; **dégelée le 12/09** à la demande du père
  (contrôles incompréhensibles) : cuisson refaite en mini-jeu.
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
   itérés ; captures de référence par jeu. ✅ La sonde `?fps` est faite
   (22/09) : reste à relever les chiffres sur la Tab A9+.

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

- ✅ **Plus un seul `setTimeout` dans les jeux**. Les 14 restants (Feu
  d'artifice, Tour du Monde, Boîte à rythme, Tour de Glace, Espace) sont
  passés soit aux timers de partie (`ctx.after`, annulés au démontage et
  suspendus en pause), soit — pour les queues de son — à un **délai sur
  l'horloge audio** : `tone()`, `sPopReal()`, `sBoomReal()` et `noiseBurst()`
  acceptent désormais un délai en secondes. Plus rien ne sonne après le
  retour au menu, et les mélodies ne dérivent plus sous la charge.

- ✅ **Un mot sous chaque icône de mode** (demande du 10/09) : les colonnes
  d'icônes n'étaient pas claires. Grand Tableau × et + (Explore, Trouve,
  Remplis, Écris), Quelle heure (Découvre, Heures, Minutes, Trouve, Règle),
  Labyrinthe (Jour, Nuit, Glace) et Marché (Découvre, Paye, Monnaie). Le mot
  est un renfort, jamais le porteur du sens : l'icône reste première, et le
  mode choisi se teinte, pastille et mot ensemble.

- ✅ **Retours tablette du 12/09**. La voix des tables et des additions suit le
  bouton son : elle se déclenche vraiment (deux pièges d'Android contournés,
  le `cancel()` qui avale l'énoncé et le déverrouillage par un geste) et se
  tait net quand on coupe. Le plein écran est demandé même quand l'app est
  installée en `standalone` — c'est ce qui laissait la barre système d'Android
  en bas — et il est repris au premier geste après un balayage. La Tour de
  Glace affiche en permanence le **nombre de blocs**, sans multiplicateur. Les
  pavés et boutons de réponse du Grand Tableau passent de 70 à plus de 100 px.
  Enfin, l'Intrus, Memory et la Chasse aux lettres montrent de **vraies
  photos** libres de droit à la place des dessins.

- ✅ **Trois demandes du 12/09 (deuxième passe tablette).**
  - **Géographie** : le jeu ne disait plus rien de ce qu'il fallait faire.
    La question est désormais écrite ET illustrée (l'image de l'animal
    cherché, le drapeau du pays), le nom du lieu touché s'affiche dans un
    bandeau et se fait dire à la voix (contenu pédagogique : c'est permis),
    un bouton haut-parleur le répète, les quatre boutons de la barre portent
    leur mot (Le monde / La France / Explore / Trouve) et les 177 noms de pays
    sont en français (`public/assets/geo/countries-fr.json`, généré depuis
    CLDR). Corrigé aussi : la face visible du globe restait dans le noir— une
    lampe est accrochée à la caméra.
  - **Grand Tableau × et +** : un bouton « Tout montrer » révèle les 100 cases
    en cascade dans le mode Explore, pour que Joyce puisse LIRE le tableau au
    lieu de taper case par case ; un second appui le referme.
  - **La Pizzeria** : cinq boutons à l'écran, on ne comprenait pas comment
    sortir la pizza. Le jeu a maintenant **trois temps, une seule action à la
    fois** : on garnit (les outils seuls), un gros bouton unique enfourne, puis
    la cuisson devient un **vrai mini-jeu** — une jauge se remplit, une zone
    verte s'illumine et carillonne, un tic-tac s'accélère, et il faut taper
    « Sortir ! » au bon moment. Trop tôt : la pizza est pâle et repart au four
    (aucune sanction, on est dans Créer) ; trop tard : elle est noire et fume.
    La dorée suit la jauge, la durée suit le niveau (10 s en douce, 4,5 s en
    expert). Côté garniture : on **saupoudre en gardant le doigt posé**, chaque
    ingrédient a sa note, une pincée de farine se soulève à l'atterrissage,
    et le fromage est enfin une flaque fondue (le modèle « cheese-cut » du kit
    posait une meule ET son couteau à manche bleu sur la pizza).

- ✅ **Un seul style d'images dans les imagiers (12/09).** Le père : « je veux
  bien que tu me trouves des images pour tout, mais je ne veux pas qu'il y ait
  deux styles ». **L'Intrus, Memory, la Chasse aux lettres et Le Marché**
  n'affichent plus QUE des photos — 68 sujets au lieu de 31, tous ramenés au
  même moule (carré, 512 px) à l'import. Les animaux viennent d'**iNaturalist**
  (recherche par taxon latin : `Bos taurus` et pas « cow »), le reste des
  **catégories de Wikimedia Commons** — la recherche plein texte d'Openverse
  répondait « champ de coquelicots » pour *orange*. L'app étant privée et sans
  usage commercial, les licences CC BY-NC sont acceptées et créditées comme
  les autres (`public/assets/photos/CREDITS.json`). Les 68 vignettes ont été
  regardées une à une sur planche-contact ; sept ont été refaites (l'ours était
  noir sur fond noir, le « lion » était un léopard, l'« oignon » des gens dans
  un festival). L'Intrus gagne une famille « Dans la cuisine ».
  Les planches Kenney restent pour les PIONS et le DÉCOR (Puissance 4, Simon,
  Taquin, labyrinthe, 3D) : ce n'est plus du vocabulaire illustré, et il
  faudrait des images détourées. **L'ananas est sorti du jeu** : toutes les
  photos libres le montrent sur son pied, vert et noyé dans ses feuilles —
  même une image techniquement juste ne sert à rien si elle n'est pas reconnue
  à 6 ans. Onze fruits suffisent.

- ✅ **Un 31ᵉ jeu, demandé par le père à partir de la fiche GR2 de Joyce :
  « La Poste aux Phrases » (12/09).** Trois objectifs, donc trois modes, sur
  le patron du Marché et de Quelle heure ? :
  - **Phrase ?** — une suite de mots est-elle une phrase ? Après la réponse,
    les trois repères s'allument (majuscule, point, sens) et **seul celui qui
    manque passe en rouge** : Joyce voit pourquoi, elle ne devine pas.
  - **Quel type ?** — le cœur. La phrase s'affiche **sans son point final**,
    un emplacement clignote au bout, et on claque le bon tampon dessus. On
    choisit le TYPE, jamais le point : le point s'imprime tout seul. C'est le
    piège de la fiche rendu jouable — exclamative et injonctive portent le
    même « ! » sans être du même type, et le tampon injonctif porte ses DEUX
    points (« . » et « ! ») parce que c'est la seule famille qui n'a pas un
    point à elle.
  - **Le nom** — le point, le point d'interrogation, le point d'exclamation
    (plus la virgule et les points de suspension en expert), dans les deux
    sens : on voit le signe et on cherche son nom, ou on entend le nom et on
    cherche le signe.
  La voix lit les phrases **avec leur point**, et c'est l'intérêt : l'intonation
  est l'indice qui sépare « Tu viens. » de « Tu viens ? ». Contenu pédagogique,
  donc conforme à la règle 2 ; en flamme la voix se tait et il faut lire.
  Aucune sanction : autant d'essais qu'on veut, la manche ratée se rejoue.
  **Deuxième passe (15/09) : la poste existe pour de vrai.** La lettre arrive
  en glissant, on **traîne** le tampon jusqu'à la case (ou on le tape, il vole
  tout seul), il s'écrase avec un « bong », l'encre gicle de sa couleur, le
  point s'imprime un peu de travers, puis la lettre s'envole dans une **boîte
  aux lettres** qui l'avale en tressautant — la huitième lève le drapeau.
  Se tromper de type avec le BON point (exclamative ↔ injonctive) est un
  presque-juste : la case montre en gris le point qu'elle aurait reçu, le
  tampon rebondit doucement ; un contresens secoue plus fort. Deux ratés et le
  bon tampon se met à luire (de l'aide, pas une sanction). Rampe liée à la
  performance : les phrases s'allongent tous les trois succès. En « Phrase ? »
  la majuscule et le point s'entourent dans le texte même, et une case vide
  apparaît là où le point manque. Deux pièges payés : la classe `.hint` de
  la coquille (absolue) a happé mon tampon, et un glissé écouté sur chaque
  bouton fait lever deux tampons quand le doigt en survole un autre — le
  glissé s'écoute sur la fenêtre.
  Surveillé en CI par **trois bots** (`poste-type`, `poste-phrase`,
  `poste-point`) : chacun joue une partie entière de son mode, sans une seule
  erreur, et vérifie que l'écran de fin arrive.

- **Verdict des filles (15/09)** : « les filles ont aimé que Tour de Glace, le
  Ninja est injouable, la voiture est pourrie, le Labyrinthe pas fun et plein
  de bugs de passe-muraille, Tape-Trous un sprite atroce digne d'un Minitel ».
  Ordre validé par le père : geste + Ninja, Tape-Trous, Course, Labyrinthe —
  une livraison par jeu, pour qu'elles testent entre chaque.
  - ✅ **Le geste** : depuis le 12/09 chaque `pointerdown` en jeu redemandait
    le plein écran à Android ; refusée, la demande repartait à chaque toucher
    et annulait le geste en cours. Les deux jeux « cassés » sont les deux jeux
    de glissé. On reprend le plein écran en FIN de geste, au plus toutes les
    3 s. (Hypothèse forte, invérifiable sans la tablette : à confirmer par les
    filles.)
  - ✅ **Ninja** : en douce, fruits deux fois plus gros, gravité plus faible
    (ils flottent), moins nombreux, lame plus large (72 px contre 46), presque
    pas de piment, et un fruit raté ne coûte un cœur qu'après trente fruits
    tranchés. Le jeu se durcit avec la performance, pas d'entrée.
  - ✅ **Tape-Trous** : les pastilles rondes de la planche Kenney sont sorties.
    Les habitants du pré sont des personnages construits en 3D
    (`core/critters.ts`) : taupe à moustaches, poussin à houppette, cochon à
    groin, lapin à longues oreilles, et un cactus à sourcils froncés — ils
    clignent des yeux, s'étirent en sortant, s'écrasent quand on tape. Le
    kit partage géométries et matériaux : dix personnages par partie ne
    coûtent rien. La clôture et les arbres sont ramenés dans le cadre.
  - ✅ **Course** (la « voiture ») : un vrai tracteur — capot arrondi,
    calandre et phares, cabine à montants, siège, volant, garde-boue, roues à
    crampons dont on VOIT la rotation, cheminée qui fume — et une remorque en
    bois derrière. Il fait jour : ciel bleu, soleil, nuages qui dérivent, une
    ferme et son silo au loin, une clôture le long du chemin, deux ornières.
    Et une seconde décision avec le même geste : des pommes et des carottes
    sont posées sur le chemin et se ramassent en ROULANT dessus — sauter au
    mauvais moment les fait rater. Chaque récolte atterrit dans la remorque,
    qui se remplit à vue. Jamais de sanction sur une récolte ratée.
  - ✅ **Labyrinthe** : le poussin MARCHE. Il ne glisse plus en ligne droite
    entre deux cases (le « passe-muraille » : une transition CSS coupait les
    coins à travers les haies) : chaque geste pousse une case dans une file
    d'attente, et un minuteur de partie le fait avancer case par case, à
    13 cases par seconde (26 sur la glace), en se tournant du bon côté, en se
    dandinant, et en laissant des miettes derrière lui. Les murs sont des
    haies vertes à trois passes, le poussin et la poule sont dessinés (SVG),
    plus de sprites. L'enjeu : des grains semés sur le chemin (quatre sur la
    route de la poule, un à l'écart) qui se ramassent en passant, avec
    étincelles et pépiement ; les étoiles de fin viennent des grains ramassés.

- ✅ **Les dix du 22/09** (liste proposée par Claude, « fais tout, et fais
  tout au mieux ») :
  1. **Plus de « Jade » pour tout le monde.** Le choix de joueuse masqué, tout
     le monde s'appelait Jade : Joyce lisait « Jade a empilé 12 blocs » et
     devait chercher J-A-D-E dans la Chasse aux lettres. Les jeux reçoivent un
     prénom vide, les messages de fin tutoient, Puissance 4 nomme les pions,
     les encouragements enregistrés sont communs à la famille.
  2. **Les pastilles Kenney « Minitel » sont sorties partout.** Cinq
     personnages de plus dans `core/critters.ts` (vache, poule, chien, canard,
     mouton) et `core/portraits.ts` qui les rend en images : Simon,
     Puissance 4, la Boîte à rythme et le pré 3D du Taquin. Le Tour du Monde
     passe en photos (neuf importées : panda, tigre, kangourou, koala,
     hippopotame, bison, élan, paresseux, lama). Plus aucune planche 2D.
  3. **Voyage dans l'Espace sans lecture** : billes-planètes (passeport et
     raccourci), lueur et main qui montrent quoi toucher, glisser pour tourner,
     haut-parleur ; nouveau mode **Trouve** (la voix dit une planète).
  4. **Règle 1 : l'album de 24 autocollants et le total d'étoiles** de
     l'accueil sont sortis (une collection à compléter). Reste la meilleure
     note par jeu, sous sa tuile.
  5. **Plein écran** : Suites logiques (train de formes, second essai, le motif
     se souligne), Petit Piano (chansons en dessins, partition de couleurs),
     Boîte à rythme, Chasse aux lettres (la lettre vole, aide après deux
     erreurs), le Miroir (on peint en glissant, le reflet se replie) ; manches
     en pastilles partout, plus de « Mot 1/3 ».
  6. **La musique suit le combo** : à 3, 6 et 10 d'affilée, un shaker, un
     arpège, une contre-voix ; le raté ramène au thème seul. Les huit jeux
     d'adresse d'un coup, par `core/arcade.ts`.
  7. **Sonde `?fps`** pour la vraie tablette.
  8. **Un bot par jeu** : onze scénarios de plus (Suites, Lettres, Miroir,
     Marché, Espace, Piano, Rythme, Feu d'artifice, Coloriage, Habille-toi,
     Tableau +).
  9. **Plus un seul `any`** : l'état des onze jeux qui restaient est typé (le
     piège qui avait fait planter le Piano), 0 avertissement ESLint.
  10. **Ménage** : `progress.adapt` (plus appliqué depuis le choix du niveau
      dans le jeu), minuteurs de la coquille annulés au démontage,
      `import-assets.mjs` qui effaçait les crédits des photos, le lapin de
      Tape-Trous qui n'avait pas d'yeux. Au passage, les derniers emoji vus
      par les filles hors des jeux sont partis : la poule et son poussin en 3D
      se promènent au bas de l'accueil, et l'écran « dodo » du minuteur a sa
      lune dessinée et trois personnages qui dorment.

- ✅ **Retours tablette du 23/09.**
  - **Quelle heure ?** « Très difficile de bouger les aiguilles : quand on en
    place une, l'autre vient en même temps. » Le jeu choisissait l'aiguille
    à CHAQUE mouvement du doigt selon la distance au centre : en passant près
    du centre, on attrapait l'autre. L'aiguille est maintenant choisie au
    toucher (celle dont on touche la direction) et gardée jusqu'au lever du
    doigt ; chaque aiguille a une boule au bout, celle qu'on tient brille ;
    Règle ne démarre plus à 12:00 (aiguilles superposées). « Les boutons sont
    peu clairs et trop petits » : modes en grosses horloges dessinées (la
    courte, la longue…) avec leur mot en grand ; réglages en deux rangées
    −/+ avec le dessin de l'aiguille qu'elles bougent ; gros bouton vert
    « Valide ».
  - **Tour de Glace** : le nombre de blocs est géant en haut de l'écran, et
    l'écran de fin de TOUS les jeux d'adresse montre le résultat en très
    grand (icône + chiffre qui défile avec un tic par cran) au lieu d'une
    phrase à 15 px. Au passage : l'animation `goodp` (la bonne réponse qui
    rebondit) était utilisée partout et jamais définie.

- ✅ **« 10 autres améliorations, un truc vraiment stylé » (23/09, les 10
  validées).**
  1. **Habille-toi en 3D** : leur personnage construit en formes rondes
     comme les animaux de la ferme (`core/doll3d.ts`) — robe évasée,
     couettes, couronne, ballon… —, sur une estrade dans un petit décor ; on
     le fait tourner au doigt, il saute de joie à chaque habit.
  2. **Il vient jouer** : au volant du tracteur de la Course (bras en l'air au
     saut), et sur l'écran de fin de tous les jeux — il saute de joie à
     3 étoiles, fait coucou « encore ! » à 1 étoile. `ctx.look` sert enfin.
  3. **Accueil vivant** : il se promène avec la poule et le poussin ; la tuile
     touchée grandit jusqu'au plein écran avant d'ouvrir le jeu.
  4. **L'Atelier remplace le Coloriage** : feuille 1500 × 1000 au doigt,
     pinceau en trois tailles, arc-en-ciel, pot de peinture qui se déverse en
     rond, gomme, tampons des animaux 3D, annuler (10 crans), quatre feuilles
     (blanche, papillon, fleur, maison) gardées dans IndexedDB avec leur
     vignette ; les coloriages de l'ancien jeu reviennent dans la feuille.
  5. **Bonhomme de neige** : un vrai paysage d'hiver (`core/winter.ts`) — ciel
     en dégradé, montagnes, collines, chalet en rondins assemblé pièce par
     pièce avec sa cheminée qui fume, sapin décoré, luge, banc, lanternes qui
     luisent, rennes, rochers ; flocons ronds.
  6. **Le Marché plein écran** : modes en colonne (trois grosses icônes),
     étal à auvent rayé avec la marchandise en grand et son étiquette,
     tiroir-caisse à afficheur, bourse de grosses pièces ; Découvre = les
     pièces en très grand sur tout l'écran.
  7. **L'Intrus plein écran** : photos géantes (la grille prend le nombre de
     colonnes qui les fait les plus grandes), la famille file dans le panier,
     l'intrus reste seul au milieu — même quand on s'est trompée.
  8. **Pizzeria** : deux grosses flèches posées sur la scène à la place des
     deux minuscules du haut (sorties le jour même avec la refonte : la
     pizza vue de haut n'a plus besoin de tourner).
  9. **Écrans de chargement** : la vignette dessinée du jeu qui respire.
  10. **À deux en équipe** sur Ninja et Tape-Trous : choix « seule / à deux »
      sur l'écran de niveau, une lame par doigt (bleue à gauche, rose à
      droite), plus de fruits et d'animaux, un seul score, « vous avez
      marqué ». Le Ninja suit maintenant chaque doigt à part : avant, un
      second doigt faisait sauter la lame d'un bout à l'autre de l'écran.

- ✅ **La Pizzeria refaite (23/09, « absolument éclaté » selon les filles).**
  Les ingrédients étaient illisibles (un fromage en pommes de terre, un épi
  de maïs debout, un oignon pour une olive), la cuisson ne se voyait pas,
  la pizza était petite sur une planche floue. Maintenant : la pizza en
  grand sur sa pelle, dix bols dessinés de part et d'autre ; de vrais
  ingrédients construits en 3D (mozzarella râpée, tomate, champignon,
  olive, jambon, poivron, basilic, maïs) qui tombent sous le doigt et se
  posent à plat ; la pelle glisse au four et la cuisson SE VOIT (pâte qui
  dore, bord qui gonfle, fromage qui fond en nappe puis gratine, noir et
  fumée si on oublie) ; sortie trop tôt = « pas encore », elle continue de
  cuire ; puis la pizza se coupe en six et le fromage file quand on tire
  une part. Plus de physique cannon : trajectoires maîtrisées. Bot de la
  partie entière (`pizza-du-four-a-la-bouche`).

- ✅ **« Continue à améliorer le site » (23/09, six chantiers, « fais tout »).**
  1. **Accueil en trois univers** : onglets Jouer / Apprendre / Créer (le
     dernier ouvert est retenu), grandes tuiles, et au pied de l'écran un pré
     en 3D rendu en une image (`meadowBanner`) où paissent les animaux.
  2. **Memory en 3D** : de vraies cartes épaisses, distribuées sur une nappe,
     qui se retournent en se soulevant ; les paires trouvées sautent sur une
     pile. Les faces restent en photos (règle des imagiers).
  3. **Petit Piano** : un vrai piano laqué (touches ivoire, noires décoratives),
     le chœur des animaux qui chante la note, la partition qui descend vers
     la touche à jouer.
  4. **Labyrinthe en haies 3D** : haies instanciées (enneigées sur la glace),
     le poussin qui se dandine et bute contre les murs, sa maman poule à
     l'arrivée, une lanterne dans le brouillard de nuit. Logique inchangée.
  5. **Feu d'artifice** : un village, une ferme (grange, silo, moulin) et un
     lac qui reflète les bouquets et la rive ; croissant de lune.
  6. **Grand Tableau × et + : le potager** : la grille est un carré de terre
     dans un cadre de planches ; chaque case trouvée fait pousser sa plante,
     une espèce par rangée (`gardenPortraits`, fleurs et légumes 3D rendus en
     images) — la table de 3 est la rangée des violettes. Tableau complet ou
     ligne remplie : le jardin se balance au vent. Une case fausse montre son
     nombre mais rien n'y pousse.
  Et le bot de la Pizzeria cuit en expert : en douce, la cuisson dépassait la
  minute sous swiftshader en CI (deux déploiements bloqués).

Ordre pour la suite : relever `?fps` sur la Tab A9+ (l'Atelier, la Pizzeria, le
Memory, le Labyrinthe et le paysage d'hiver compris), faire tester aux filles l'Atelier et le jeu à
deux, puis la phase 3.

Chaque itération : une demi-page de design (geste, enjeu, rampe, outro,
sons), l'implémentation, un bot qui gagne, une capture de référence.

## Phase 3 — Ce qui fait « un jeu » plutôt que vingt

- ✅ Personnage partagé (23/09, en formes rondes plutôt qu'en glTF) ; reste :
  le mettre dans d'autres jeux 3D (Attrape : c'est elle qui tient le panier).
- ✅ Coopération à deux (Ninja, Tape-Trous) ; reste : Attrape (deux paniers ?).
- ✅ L'Atelier ; reste : plus de dessins à colorier (des animaux de la ferme).
- Chargement paresseux par jeu + CSS colocalisé (IndexedDB sert déjà à l'Atelier).
- À décider plus tard : `letters` (refonte ou sortie).

## Phase 4 — La Ferme des calculs (plan validé le 23/09)

Les deux Grands Tableaux (× et +) deviennent **deux vrais jeux** où chaque
opération est un geste sur un objet de la ferme qui EST le modèle
mathématique. Un moteur commun retient ce que l'enfant sait.

- ✅ **Le Potager livré le 23/09 — en 2D, pas en 3D.** Une première version
  en 3D (modèles Kenney) a été refusée net : « cette 3D immonde avec 5
  triangles par objet ». Trois maquettes au format tablette, puis des plantes
  commandées à Canva : le père a choisi la **5a** — la table de Pythagore en
  grille claire, une plante illustrée par case du rectangle (une espèce par
  rangée), le total de chaque rangée en grand sur la plante estompée de la
  dernière colonne, le résultat en pastille corail (« la 5b est une
  aberration mathématique » : le total doit être là où il vit dans la table).
  Il remplace le Grand Tableau × (sorti du catalogue avec son bot) ; le
  Grand Tableau + prend les mêmes plantes. Modes : **Découvre** (tracé au
  doigt, comptage chanté, « Tourne » : chaque plante saute sur sa case
  miroir), **Récolte** (12 questions de `core/facts.ts`, cinq niveaux d'aide,
  le « presque » dessiné à sa vraie place dans la table, pavé au dernier
  niveau, divisions des calculs sus en flamme : 56 ÷ 7 = chercher 56 dans la
  rangée du 7), **Tableau** (les calculs sus gardent leur plante, « Tout
  montrer »). Trois bots (`potager-*`).
- Reste du plan ci-dessous : **Partage** (÷ avec les lapins) et le
  **Poulailler** — leurs illustrations (lapins, poules, œufs, boîtes) sont à
  commander en UNE planche Canva, maquettes d'abord.

- **Le Potager** (× et ÷, Joyce) : un carré de légumes de 7 rangées de 8,
  c'est 7 × 8 — tracé au doigt, il pousse rangée par rangée, chaque rangée
  sur une note plus haute (la table devient une mélodie). Modes : Découvre
  (rectangles libres, le carré pivote : 7 × 8 = 8 × 7), Récolte (le cœur),
  Partage (÷ : une tape = une carotte à chaque lapin ; le reste, le chien
  le vole), le Tableau (le potager entier ; « tout montrer » = la colline
  des résultats ; faucher ×1, ×2, ×5, ×10 et le miroir → il reste 21 cases).
- **Le Poulailler** (+ et −, Jade) : boîtes de 10 œufs (2 × 5 = le cadre de
  10 du CP). Une tape = une poule pond ; 8 + 5 complète la boîte à 10 et
  déborde (« faire 10 » se voit) ; jusqu'à 100, une boîte pleine se ferme en
  dizaine (la retenue se voit).
- **La pédagogie** : aide qui s'efface calcul par calcul (carré entier →
  contour → nombres → pavé), une erreur la fait revenir ; mémoire par calcul
  (boîtes de Leitner, révisions espacées et entrelacées, un raté revient
  2-3 questions plus tard) ; familles d'opérations (÷ = × à l'envers) ;
  l'erreur DESSINÉE (49 pour 7 × 8 : le carré 7 × 7, puis la rangée qui
  manque pousse).
- **Décisions du 23/09** : la mémoire est visible dans le Tableau (les
  légumes des calculs sus restent) mais **rien ne fane jamais** et rien ne
  se débloque ; le temps de réponse est mesuré en silence (su par cœur ou
  recompté), jamais affiché ; profils masqués → mémoire commune par jeu, le
  moteur se corrige tout seul ; le Potager d'abord.

Itérations (maquettes au format tablette validées avant chacune) :
1. ✅ `core/facts.ts` (testé) + **Potager** : Découvre, Récolte, divisions
   (23/09 ; le Tableau est sorti le 25/09).
2. **Partage** (÷ avec les lapins, le reste que le chien vole) — à décider
   après les retours des filles sur le Potager.
3. ~~Poulailler jusqu'à 10 et 20~~, ~~jusqu'à 100~~ : mis de côté le 27/09 —
   le père veut UN seul jeu de calcul, c'est le Potager qui fait le + et le −
   (et le Grand Tableau + est sorti du catalogue avec son bot).

## Retours tablette du 24/09

- ✅ **Trois jeux sortis** : la Course (« la voiture c'est éclatée »), le Stand
  3D et Attrape (« le panier ») — fichiers, vignettes et bots retirés.
- ✅ **Quelle heure ?** : un interrupteur « 5 10 15 » cache les minutes
  écrites autour du cadran, comme sur une horloge ordinaire (retenu d'une
  partie à l'autre) ; l'heure à régler s'écrit EN GRAND dans une carte à côté
  du cadran (heures couleur petite aiguille, minutes couleur grande), et la
  voix la dit.
- ✅ **Le Potager** : « pas clair quand on dit une réponse fausse, la bonne
  réponse apparaît en ROUGE ». Le vert dit maintenant « juste » (pastille du
  résultat, réponse ajoutée à la question) et le rouge « faux » (sa réponse,
  rouge pleine, barrée, qui tremble, à sa place dans la table).
- ✅ **Ninja Verger refait en 2D** : « pas trop jouable, les fruits sont trop
  grossiers, c'est confus ». Les fruits sont une planche Canva du style des
  plantes (pomme, orange, pastèque, fraise, kiwi, leurs moitiés, et un cactus
  à fleur rose), sur le ciel du verger (maquette « B » choisie par le père
  contre une planche de bois). Règles simplifiées : **seul le cactus coûte un
  cœur** (il cogne, l'écran tremble, il luit en rouge pour qu'on le voie sans
  lire) ; un fruit raté casse seulement la série. La partie a une forme :
  **cinq vagues** de plus en plus denses (pastilles sous le score), puis
  **la pluie de fruits** qui tombent du ciel, sans cactus — une minute en
  douce. Fruits en grappe pour apprendre la multi-coupe (« ×2 » doré sur
  place), une main qui montre le geste jusqu'au premier fruit, étoiles à la
  part des fruits tranchés. Bot : la partie complète jusqu'à l'écran de fin
  sans perdre un cœur.

## Retours du 25/09 — le Potager

- Découvre : « parfait ». Récolte : « parfait », sauf deux choses, corrigées :
- ✅ **La réponse apparaissait avant le choix** : à l'aide la plus forte
  (« découverte », celle d'un calcul raté la fois d'avant), le comptage des
  rangées allait jusqu'au résultat, et la voix le disait. Maintenant les
  rangées se comptent en chantant jusqu'à l'avant-dernière, la dernière garde
  son « ? », et la voix ne dit que la question. En division, la même aide
  est la rangée des nombres (7, 14… 70), sans rien surligner.
- ✅ **Une erreur ne se refait plus sur-le-champ** : son « presque » se
  dessine (sa réponse barrée à sa place dans la table), la bonne réponse
  s'écrit en vert (dans la table, dans la question, sur le bon bouton, et la
  voix la dit), puis on passe au calcul suivant. Le calcul raté revient
  trois questions plus loin, comme avant.
- ✅ **Le mode Tableau est sorti** : « c'est quoi cette merde, pourquoi
  QUELQUES plantes ». Les plantes éparses étaient les calculs que la mémoire
  jugeait sus — une logique que rien ne montrait. Le Potager garde deux
  modes, Découvre et Récolte.
- ✅ Les nombres de la rangée d'une division s'écrivent à l'encre (ils étaient
  blancs sur crème, illisibles).
- ✅ **« Ça crashe à la première ouverture du Potager, ensuite ça marche »** :
  ce n'était pas le Potager, c'était la mise à jour de la PWA, qui rechargeait
  la page en pleine partie (`autoUpdate`). Elle attend maintenant l'accueil
  (piège consigné dans PIEGES.md).

## « Améliore encore 3 jeux » (25/09, plan validé)

Dans l'ordre validé : la Chenille, Poussin Volant, puis le Chœur — le Chœur
est passé devant parce que les deux autres attendent leur planche Canva.

- ✅ **Le Chœur de la ferme** (l'ancien Simon) : de VRAIES voix d'animaux
  (dix cris de Wikimedia Commons, choisis à l'oreille par le père sur une page
  d'écoute), l'animal saute quand il chante ; la chorale grandit avec le
  niveau (4, 5, 6 animaux) ; la chanson à atteindre se voit sur le côté (8,
  10, 12 notes) ; une fausse note coûte un cœur (3, 2, 1) et la même mélodie
  revient ; le « presque » sur la dernière note se voit ; la fin est un
  concert. Les mêmes voix chantent dans la Boîte à rythme.
- ↩️ **La Chenille qui fait des trous** (2D illustrée : une semaine de repas
  sur une grande feuille, jusqu'au papillon) : publiée puis **retirée le soir
  même** — « mille fois moins bien que la version isométrique hyper mignonne,
  de la 2D saccadée et pixelisée sur une surface minuscule ». La Chenille 3D
  du 23/09 est revenue telle quelle, avec son bot.
- ↩️ **Poussin Volant en 2D illustré** (entre les poteaux de la clôture,
  jusqu'au poulailler de maman poule, un choc = un cœur) : publié puis
  **retiré le soir même**, comme la Chenille. Le Poussin 3D du 23/09 est
  revenu tel quel, avec son bot. Reste à lui apporter ce que la 2D avait de
  mieux (un choc qui coûte un cœur au lieu de tuer, une arrivée chez maman
  poule) — en 3D, et seulement si le père le demande.
- Reste : le coq, la chèvre, le cheval et le chat ont leur voix mais pas
  encore de personnage 3D.

## Retours du 27/09

- ✅ **Le Potager unique** (« je veux plus de jeux uniques, un seul jeu qui
  mène au potager ») : à l'ouverture, les étiquettes + − × ÷ (plusieurs à la
  fois, + par défaut — maquette validée), puis la difficulté. La grille
  montre le tableau des + ou des × (le coin le dit, et se touche pour
  changer) ; 7 + 4 est une bande qui compte 8, 9, 10, 11 dans la rangée du
  7 ; − et ÷ se lisent à l'envers dans la rangée. Le Grand Tableau + est
  sorti.
- ✅ **Le Parcours** (le mode d'ouverture) : 10 cases découvertes au choix
  dans les tables du niveau, puis ces 10 cases reviennent trois fois — 4
  choix, le pavé, « trouve la case » ; étoiles sur les 30 réponses.
- ✅ **Découvre, retour de Joyce** : « trop dommage que la case disparaisse » —
  le résultat reste écrit en gros, sans plante dessous ; toute la grille
  allumée, le potager fleurit.
- ✅ **Pizzeria** : la sauce suit le doigt comme un stylet (elle laissait des
  taches espacées sur la tablette, il fallait repasser dix fois).
- ✅ **Poussin Volant et Tape-Trous sortis** (« vire-les »), avec leurs bots
  et `core/runner.ts`.
- ✅ **Labyrinthe** : « beaucoup trop simple » — plus grand (7 à 9 cases de
  côté en douce, 18 en expert), des graines au fond des impasses ; et « le
  poussin suit le doigt et fait tout seul les virages » : il n'avance plus
  qu'en ligne droite vers le doigt, c'est au doigt de tourner.
- ✅ **L'Atelier enrichi** (« elles adorent l'Atelier : complexifie-le, rends-le
  encore plus stylé ») : un tiroir de dix pinceaux (feutre, crayon, aquarelle,
  craie, spray, paillettes, néon, arc-en-ciel, cœurs, étoiles) ; le miroir (2,
  4) et la rosace (8) ; six papiers dont le papier nuit (le néon y brille) ;
  « tout effacer » : une poubelle à deux touchers, la feuille part en boule ;
  le DOSSIER : « Ranger » y met le dessin et rend une feuille propre, et
  chaque dessin s'y reprend, se revoit en film, s'enregistre en image dans la
  tablette ou se jette ; « Fini » rejoue le film du dessin.
- ✅ **La Princesse** (Habille-toi devenu un vrai jeu, « fais les 10 d'un
  coup ») — décor en 3D (recommandé contre l'illustré Canva) :
  1. la garde-robe : les habits se PRENNENT au doigt et se glissent sur elle
     (vignettes 3D : la princesse avec l'habit) ;
  2. la tenue en pièces (`core/royal.ts`) : haut, jupe (bal, courte, sirène,
     volants, pétales), traîne, cape, ailes, couronne, collier, lunettes,
     chaussures, objet ;
  3. la teinture magique : un pot (14 couleurs × 6 motifs), un toucher, la
     couleur se répand depuis le doigt (shader du tissu, `core/princess3d.ts`) ;
  4. elle est vivante : yeux qui suivent le doigt, clignements, cœurs dans les
     yeux, rire aux chatouilles, clin d'œil, bisou ;
  5. le BAL : la valse, six pas au choix (icônes), la révérence, la fin ;
  6. à deux : les princesses de Jade et de Joyce côte à côte (`duo`) ;
  7. un compagnon (`core/pet3d.ts`) : licorne, poney, chaton, chiot, teintables ;
  8. le salon de coiffure : peigne (jusqu'au sol), ciseaux, fer, lisseur,
     barrettes piquées où l'on veut ;
  9. des décors qu'on touche (`core/castle3d.ts`) : lustre, rideaux, nuit et
     feu d'artifice, fontaine, rosiers, papillons, lanternes, porte ;
  10. la photo : elle devient un coloriage de l'Atelier et un dessin du dossier.
  Cartes « Jade » / « Joyce » (portrait de la princesse gardée) ; les deux
  sœurs se promènent sur l'accueil et font la fête en fin de partie ; leurs
  princesses sont des tampons de l'Atelier. `doll3d.ts` et `character.ts`
  sont sortis. **À mesurer sur la tablette** (`?fps`) : tissus satinés, deux
  princesses et un compagnon ; la résolution baisse d'elle-même sous 30 i/s.
  Le soir même, la princesse en formes rondes est refusée (« un pantin de bois
  de 1950 ») : elle devient le personnage VRM professionnel de pixiv — un vrai
  visage et ses expressions (joie, surprise, clin d'œil, cœurs dans les
  yeux), des yeux qui suivent le doigt, des cheveux qui ondulent — et les
  dix mécaniques restent : les habits sont construits à sa mesure et liés à
  son squelette, ses cheveux, ses yeux et sa peau se recolorent, la longueur
  étire ses mèches, les coiffures attachées replient ses mèches du dos. Les
  taches de rousseur sont peintes sur la texture de son visage.

- ✅ **L'Espace refait au niveau de la maquette du père** (« refais le
  système solaire à ce niveau de qualité », plan validé : « gogo ») — rendu
  dans `core/cosmos.ts` : ciel procédural et Voie lactée, Soleil qui bout et
  sa couronne, Terre de nuit avec ses villes, reflets des océans, nuages,
  atmosphères, ombres des anneaux de Saturne, la Lune, les quatre lunes de
  Jupiter avec leurs vraies cartes, Titan, Pluton, la ceinture d'astéroïdes,
  les vraies positions du jour, HDR + halo + ACES. Le jeu garde les billes, la
  voix, Explore et Trouve ; la fusée (28/09 : la fusée « A » choisie dans
  Canva, refaite en vraie 3D dans `core/rocket3d.ts` — « elle est pas au
  niveau du reste » pour la première) file de profil et la caméra de cinéma
  la suit ; une tortue et un lièvre règlent la vitesse du temps ; les lunes
  et Pluton se visitent en bonus. En ligne le 28/09 (« publie ») ; **reste à mesurer sur
  la tablette** (`?fps`) : la qualité baisse d'elle-même (densité de pixels,
  puis lissage) si une image dépasse 34 ms ; `?hq` la fige.

## « Trouve encore 10 améliorations » (28/09)

Tournée de captures de l'accueil et des 25 jeux, dix propositions ; le père
en a retenu sept, et une suppression :

- ✅ **Le Bonhomme de neige sorti** (« supprime le bonhomme de neige ») : son
  jeu, sa vignette, son bot. `core/winter.ts` (le paysage d'hiver) reste,
  pour la Tour de Glace. Le bot de Memory vérifie désormais que la meilleure
  note s'enregistre (c'était celui du Bonhomme).
- ✅ **1. L'accueil en affiches** (maquette validée, « oui » ; l'accueil
  complet montré et validé, « oui ») : chaque tuile
  montre le jeu en train de se jouer, le nom dessous — des images prises dans
  les vrais jeux par `scripts/posters.mjs` (mise en scène par jeu : la Tour à
  neuf blocs, le papillon colorié de l'Atelier, la pizza garnie, le feu
  d'artifice en l'air…), la barre et le score cachés. La vignette dessinée
  reste pour le carton titre et le chargement ; l'affiche grandit jusqu'à
  remplir l'écran quand on touche la tuile.
- ✅ **2. La Tour de Glace dans le paysage d'hiver** (captures validées,
  « oui ») : chalet, sapin décoré, rennes, lanternes, forêt et montagnes
  autour de la tour ; l'heure qui suit la hauteur (jour, lumière dorée vers
  7 blocs, crépuscule vers 13, nuit étoilée et lune à 20, aurore au-dessus) ;
  la glace vernie ; le repère central doré bordé de sombre (il disparaissait
  sur le ciel de jour). Caméra, blocs, balancier, rampe et physique
  inchangés. **Reste : mesurer `?fps` sur la tablette** (une cinquantaine de
  modèles de plus).
- ✅ **5. Le Marché** (« fais les 4 de suite sans redemander aucune
  validation ») : les pièces en vrai métal 3D (`core/money3d.ts` — cuivre,
  or nordique, bimétal pour 1 € et 2 €, face commune en relief avec une
  patine qui fait lire le chiffre, tranche striée, tailles relatives exactes)
  et de vrais billets (papier courbé, arches du 5, arcs du 10, vitraux du 20,
  drapeau étoilé, bande argentée), rendus une fois en images et gardés ; la
  caisse qui tinte (sonnette, tiroir qui s'ouvre, pièces qui y tombent) ; la
  voix dit le total à chaque pièce, puis le prix payé.
- ✅ **6. Les Suites logiques deviennent le petit train de la ferme** : une
  vraie scène 3D (le pré, la voie, une locomotive rouge et verte qui fume,
  des wagons), chaque wagon porte un animal de la ferme (les personnages 3D
  de `critters.ts`), le dernier wagon est vide sous un anneau doré ; on
  touche l'animal qui y monte (portraits en bas). Trouvé : il saute dans le
  wagon et dit son cri, les ridelles se colorent motif par motif (on voit
  pourquoi), la vague, le sifflet, le train repart et le suivant entre en
  gare. En expert, le même animal petit, moyen, grand. Deux motifs entiers
  toujours montrés ; aucune sanction (le mauvais animal s'efface, au
  deuxième raté le bon monte tout seul).
- ✅ **8. Le Chœur sur une scène de grange en 3D** : mur de planches rouges
  aux portes en croix, poutres, bottes de foin, guirlande d'ampoules,
  estrade ; chaque choriste sur son coussin, sous son projecteur qui
  s'allume quand il chante (il saute, des notes s'envolent) ; on le touche
  directement ; la salle se tamise pendant l'écoute, la guirlande clignote au
  concert. Le coq, la chèvre, le cheval et le chat ont leur personnage
  (`critters.ts`) et leur voix : le coq, le chat et le cheval dans le
  Chœur, la chèvre et le coq dans la Boîte à rythme (6 lignes), le cheval
  et le chat au Piano.
- ✅ **9. La garde-robe de la Princesse tout de suite pleine** : vignettes
  gardées d'une ouverture à l'autre (`core/diskcache.ts`, Cache API ; à la
  deuxième ouverture : 12 lues, 0 recalculée), silhouettes en attendant.
- ✅ **Et l'ancienne version de la Princesse** (« prévoir un petit bouton
  pour qu'on puisse quand même faire l'ancienne version » ; laquelle : « A ·
  Habille-toi ») : la petite fille à couettes en formes rondes d'avant le
  27/09 (`games/doll.ts`, `core/doll3d.ts`, `core/character.ts`, revenus de
  l'historique tels quels), derrière un bouton rond en bas à gauche de la
  scène ; une couronne ramène à la princesse, le dernier choix est retenu,
  son look est gardé dans le profil. Un bot : aller, chapeau, retour.
- ✅ **10. Fluide partout** (fait sans attendre la mesure, à la demande du
  père) : la qualité s'adapte seule dans tous les jeux 3D (`createStage`) —
  moins de pixels quand la tablette peine (plus de 30 ms par image), puis
  plus d'ombres ; les pixels reviennent quand elle respire. La Princesse
  n'a plus sa propre baisse ; l'Espace garde la sienne (rendu à part).
  `?fps` montre la densité choisie et les ombres ; `?hq` fige la qualité.
  **Reste : regarder `?fps` sur la tablette** (Tour de Glace, Chœur, petit
  train, Princesse) pour vérifier que le seuil de 30 ms est le bon.
- Refusés : la lumière du Bonhomme (il sort), Puissance 4 en 3D, l'horloge
  « journée à la ferme » (« trop brouillon, c'est pour apprendre l'heure »).

## « 20 autres améliorations, nouveaux jeux, apprentissage ou création » (29/09)

Vingt propositions tirées de la planche des 24 affiches ; le père a répondu
au QCM (cinq salves de quatre questions). Retenues, dans l'ordre du plan ;
le lot 1 (4, 6, 5, 8) est fait (« go lot 1 ») :

- ✅ **4. La main qui montre** (en priorité, `core/hand.ts`) : un gant blanc
  mime le geste de chacun des 24 jeux, sur sa vraie cible — taper, glisser
  (pointillé ; dans la Princesse, l'habit suit la main jusqu'à la jupe),
  trancher (Ninja, Chenille, Labyrinthe sur la glace), ou « l'un de
  ceux-là » : dans Apprendre et le Chœur, la main survole plusieurs cibles
  sans appuyer, une lueur autour de chacune — jamais la réponse. À la
  première partie d'un jeu, puis après 7 s sans toucher quand le jeu attend
  (15 s dans Créer) ; un toucher la chasse ; deux démonstrations sans
  réponse et elle se fait plus rare. Les anciennes mains fixes (Tour,
  Chenille, Feu d'artifice, Ninja, Potager, Tour du Monde) sont retirées ;
  l'Espace garde la sienne (elle suit la planète à découvrir) avec le même
  gant.
- ✅ **6. Le Piano** : il avait déjà cinq chansons (ma proposition se
  trompait) ; cinq VRAIMENT nouvelles, relevées sur des partitions et
  transposées pour ses huit touches — Une poule sur un mur, Meunier tu dors,
  Le bon roi Dagobert, Il court le furet, À la claire fontaine. Il était
  un petit navire, Une souris verte, Savez-vous planter les choux n'y
  tiennent pas (voir le piège dans PIEGES.md). Les dix dessins sur deux
  colonnes.
- ✅ **5. La Boîte à rythme sur scène** (sortie le soir même, voir plus bas) : la grange du Chœur (sortie dans
  `core/barn3d.ts`) au-dessus de la grille, les six musiciens sur l'estrade
  sur un coussin de la couleur de leur ligne ; leur case joue, ils sautent
  sous le projecteur ; la guirlande bat la mesure ; on les touche aussi sur
  scène.
- ✅ **8. Le livre de coloriages de l'Atelier** (`core/lineart.ts`) : les
  13 animaux (les 12 de la ferme et la taupe), de trois quarts et de
  profil, dans leur pré sous le soleil ; le petit train et ses voyageurs
  (sorti dans `core/train3d.ts`) ; la fusée dans les étoiles ; la chorale
  sur la scène de la grange — 29 pages, des dessins au trait tirés des
  personnages 3D (une couleur par pièce, on garde les bords, les pupilles à
  l'encre), calculés à la première demande puis gardés. Le pot de peinture
  s'arrête sur le trait ; un dessin rangé se reprend même après avoir fermé
  l'app. Un bot : la tête de la vache au pot.
- ✅ **1. Le Miroir devient les Perles Miroir** (30/09, « le Miroir devient
  les perles à repasser… on apprend toujours la symétrie ») : une plaque à
  picots translucide en 3D sur l'établi, vue de trois quarts ; la moitié du
  dessin est posée (papillon, fraise, tête de cochon, cœur, poussin,
  champignon, étoile, sapin, coccinelle, chat, fleur, couronne, fusée,
  arc-en-ciel, poisson, flocon, rosace), une ficelle lumineuse tendue entre
  deux épingles marque l'axe. On prend la couleur dans un pot (un vrai tas
  de perles 3D, son petit nom dessous), on touche un picot — ou on glisse le
  doigt sur une rangée : la perle tombe, rebondit, clic. Une perle fausse se
  pose et clignote doucement ; un toucher la retire, sans pénalité. Le reflet
  complet : les perles sautent par paires depuis l'axe, le papier sulfurisé
  se pose, un petit fer bleu passe en S (la vapeur monte, chaque perle fond
  quand la semelle passe : elle s'élargit, s'aplatit, son trou se referme),
  puis l'objet se décolle et tourne dans les airs sous les confettis.
  Fleur : plaque de 8, modèle à gauche ; éclair : plaque de 10, modèle à
  gauche ou à droite, un pot de trop ; flamme : plaque de 12, quatre
  couleurs, puis l'axe horizontal, puis les deux axes (un quart posé, trois
  à compléter). La 3D est dans `core/hama3d.ts` (plaque, perles en
  `InstancedMesh` avec leur fusion en morph, pots, axe, fer), prête pour
  l'Atelier des bijoux ; les dessins et les manches dans `core/perles.ts`,
  testés. **À jouer sur la tablette** (`?fps` : 144 perles, les ombres).
- ✅ **2. Le Taquin devient un vrai puzzle** (30/09) — la tuile s'appelle
  maintenant **Puzzle** (même identifiant `taquin2` : meilleure note, niveau
  retenu et affiche suivent). Deux modes à gauche, Puzzle (par défaut) et
  Taquin (l'ancien jeu, inchangé) ; les images à droite, en vignettes : la
  ferme en 3D (neuf animaux, collines, nuages), leur princesse qui saute de
  joie dans la salle de bal (les deux sœurs dès qu'elles ont gardé la
  leur, et leur compagnon), l'Espace (Saturne et ses anneaux, la Terre, la
  Lune et LEUR fusée, flamme allumée, sur des nébuleuses), et les deux
  derniers dessins du dossier de l'Atelier (pas de dessin, pas de
  vignette) ; le Taquin y ajoute les nombres. Les images sont des rendus 3D
  faits une fois puis gardés sur la tablette (`core/pictures.ts`).
  Le puzzle, en vraie 3D (`games/jigsaw.ts`) : une table en bois, un
  plateau encadré où le fantôme très pâle de l'image guide, des pièces en
  carton épais aux vraies découpes courbes (`core/jigsaw.ts`, testé : les
  voisines s'emboîtent exactement, la somme des aires fait le rectangle),
  en vrac autour du plateau, un peu tournées. On en attrape une au doigt
  (elle se soulève, son ombre s'élargit, elle se remet droite), on la lâche
  près de sa place et elle s'y aimante — clic, une note qui monte à chaque
  pièce, étincelles ; ailleurs, elle reste où on la pose (sur une autre, elle
  se pose dessus). Plusieurs doigts à la fois. 12 pièces à la fleur (et le
  contour des pièces tracé sur le plateau), 24 à l'éclair, 48 à la flamme.
  Pas de chrono : un puzzle fini, c'est trois étoiles — un reflet passe sur
  l'image, la caméra s'approche. La main montre une pièce qui glisse à sa
  place. Bots : `taquin-remis-en-ordre` (passe par le mode Taquin) et
  `puzzle-complet` (une pièce au doigt, les autres par l'accroche).
  **Reste : la jouer sur la tablette** (`?fps` avec 48 pièces).
- ✅ **3. Les Cubes de l'alphabet** (la Chasse aux lettres, 30/09 ; « de
  vrais cubes en bois 3D sous la photo. Chaque cube posé dit son son, puis
  la syllabe, puis le mot », pour Jade) : en vraie 3D sur le socle — une
  table d'enfant peinte, la photo du mot debout dans son support de noyer,
  une réglette à cases, et des cubes de hêtre aux arêtes arrondies qui
  tombent en vrac. Un cube = un GRAPHÈME (« ch », « ou », « on » sont un
  cube), en minuscule d'imprimerie gravée et peinte — voyelles en rouge,
  consonnes en bleu, lettres muettes en gris, la capitale sur les côtés. On
  le touche ou on le glisse : il roule jusqu'à sa case, toc, sciure. La
  voix dit son SON (« mmm », « peu », jamais « èm »), la syllabe complète
  (un arc se dessine dessous, comme au CP), puis lit le mot syllabe par
  syllabe — chacune s'allume et saute — et le mot entier. Mots découpés à
  la main et testés (`core/phonics.ts`) : fleur, des mots réguliers
  consonne + voyelle (lama, tomate, banane, patate, koala, vache, poule) ;
  éclair, plus longs, avec sons complexes et lettres muettes (lapin,
  cochon, canard, hibou, girafe…) ; flamme, les longs mots (hippopotame,
  champignon, citrouille…, plus grenouille, perroquet, pingouin,
  éléphant). Leurres : moins nombreux à la fleur ; dès l'éclair, des
  pièges voisins (b/d/p/q, on/an/ou, m/n). Aucune sanction : un mauvais
  cube revient à sa place, et après deux essais le bon se met à luire.
  **Reste : écouter la voix sur la tablette** — les textes des sons sont
  une table à régler en une ligne (`SOUNDS`).
- ✅ **7. Le Feu d'artifice qu'on dessine** (30/09, plan validé par le
  père) : taper le ciel lance toujours la fusée d'avant ; un vrai tracé
  (plus de 28 px) est un DESSIN — le trait brille et scintille comme un
  cierge magique (paillettes le long du trait, étincelles au bout du doigt,
  petites notes de clochette), se reflète dans le lac, puis une fusée part
  du bas vers son centre et éclate : des centaines d'étincelles filent vers
  les points du tracé, la forme brille, puis retombe en pluie scintillante
  dans l'ordre du trait. Un trait qui commence tout près d'un dessin qui
  attend encore sa fusée (0,45 s) le complète — les deux traits d'un A, les
  yeux d'un bonhomme (un toucher y devient un point) ; deux doigts loin
  l'un de l'autre font deux dessins (suivis par `pointerId`). Sept
  pastilles de couleur sur le lac, sans nom (comme les couleurs de
  l'Atelier) : arc-en-ciel (la teinte suit le trait), or, rose, rouge,
  vert, bleu, violet — des encres FRANCHES, un pastel vire au blanc quand
  des centaines d'étincelles s'additionnent. Le **bouquet final** est un
  spectacle d'une vingtaine de secondes sur une petite mélodie écrite (Do
  majeur, 108 à la noire, clochettes, harpe, basse, nappe, shaker :
  `playNote` de `core/music.ts`) : l'ouverture en trois gerbes qui
  illuminent le ciel, puis à chaque mesure une forme dessinée pendant la
  partie qui revient éclater EN GRAND sur le premier temps (complétée par
  un cœur, une étoile, une fleur, un bonhomme, une spirale si elle a peu
  dessiné), une paire au troisième, des crépitements entre ; une montée
  d'une fusée par croche ; puis la grande gerbe d'or qui retombe pendant
  l'outro. Les salves éclatent SUR les temps (les fusées partent 0,8 s
  avant, les boums sont sur l'horloge audio, la latence de sortie est
  compensée) ; la pause arrête la partition. Le bouton du bouquet a son
  petit nom ; la main dessine un cœur (nouveau geste `trace` de
  `core/hand.ts`), puis montre un toucher, puis le bouquet quand il est
  là. Étincelles en tableaux typés (2 600 au plus), halos précalculés dans
  une seule planche, tout au temps et non plus à l'image (la tablette est
  à 90 Hz) ; le décor suit la taille de l'arène. Bots : `feu-bouquet-final`
  (le bouquet dure plus longtemps) et `feu-dessin` (un cœur qui doit
  éclater sur son tracé, une étoile en or, le bouquet où les dessins
  reviennent). L'affiche montre un cœur dessiné. **Reste : l'écouter et
  la voir sur la tablette** (`?fps` pendant le bouquet).
- ✅ **11. Le Flipper de la grange** (1/10, `games/pinball.ts`, physique
  dans `core/pinball.ts`) : une table en bois de grange vue depuis les
  batteurs, la grange au bout. Moitié gauche de l'écran = batteur gauche,
  moitié droite = droit (un doigt par `pointerId`, levé tant qu'il est
  posé ; flèches ou Maj au clavier). La vache, le cochon et le mouton en
  bumpers (ils sautent, s'allument, crient de leur vraie voix — deux voix
  au plus, jamais la même deux fois de suite) ; les foins qui renvoient ;
  les trois œufs de la poule (tous tombés : elle chante) ; la rampe jusqu'au
  grenier (le coq chante), retour par la goulotte. La série allume quatre
  lampes et la musique ; à la dernière, le multibille. Fleur : 3 billes,
  bille lente, le chien qui renvoie parfois la bille ; éclair : plus vite ;
  flamme : 2 billes, les animaux bougent. « Ouf » (ralenti + éclair) quand
  une bille est rattrapée au bord de la sortie ; la dernière tombe au
  ralenti, puis les animaux saluent. À deux : un batteur chacune (doré à
  gauche, rose à droite), un seul score, « vous ». Étoiles réglées sur le
  pilote en joueuse moyenne. Bot `flipper-partie-complete`. **Reste : le
  jouer sur la tablette** (`?fps`, sons, taille des batteurs).
- ✅ **13. Cache-Cache à la ferme** (1/10, Jouer, 3D ; le père : « la queue
  du chat dépasse d'une botte de foin, les oreilles du lapin sortent derrière
  le puits… La nuit, on les cherche à la lampe torche. Idéal pour Jade ») :
  la ferme est un diorama rond posé dans le ciel (`core/farm3d.ts`) qu'on
  fait tourner au doigt (élan mesuré en vrai, deux doigts zooment). Au début
  les animaux sont dans l'enclos ; deux mains cachent les yeux (trois tics ;
  à la fleur on voit entre les doigts) et ils courent se cacher DANS les
  cachettes : grange (par-dessus la porte d'écurie, à la lucarne), meule,
  bottes, puits, charrette, godet du tracteur, niche, poulailler, tonneaux,
  tas de bois, mare, boue, terriers du potager, buissons, pommier (la queue
  du chat pend du feuillage). Un bout dépasse et bouge de temps en temps ;
  on le touche (toucher généreux) : il sort d'un bond avec sa vraie voix et
  file à l'enclos, sa silhouette se colorie en haut. Cachette vide : un
  petit bruit doux ; tout près : il glousse, la cachette tremble (le
  « presque »). Fleur 5 animaux bien visibles (dont le chat et le lapin) ;
  éclair 8, les oreilles seulement, trois au moins visibles d'un seul côté ;
  flamme : la nuit, 10 animaux, la lampe torche suit le doigt, leurs yeux
  brillent. La rampe suit la joueuse (vite : ils bougent moins et, à
  l'éclair et la nuit, l'un change de cachette en courant ; coincée : ils
  bougent plus, l'un passe la tête en appelant). La fin : la fête dans
  l'enclos, la ferme tourne. Bots `cache-cache-jour` et `cache-cache-nuit`
  (passent aussi avec `THROTTLE=4`). **Reste : la tablette** (`?fps`, la
  nuit surtout : une lampe à ombre portée).
- ✅ **18. La Ferme à construire** (5/10, Créer, 3D ; plan validé « go »,
  maquette « oui ») : le plateau de Cache-Cache, vide ; en bas un tiroir à
  quatre onglets (Bâtiments, Nature, Objets, Animaux — leurs vignettes
  rendues une fois et gardées), et les outils Chemin, Clôture, Gomme,
  Panier. On glisse une pièce sur la ferme (ou on la touche : elle tombe
  devant, à une place libre), on la reprend pour la déplacer, on la touche
  pour un quart de tour, on la jette au panier ; deux doigts pincent, un
  doigt fait tourner la ferme. Les douze animaux se promènent et filent à
  leur place (canard → mare, cochon → boue, poule, coq et poussin →
  poulailler, chien → niche, cheval et vache → grange, lapin → potager…),
  répondent de leur vraie voix. Jour / nuit (la lanterne de la grange). La
  ferme se garde (`ferme:construire`, une pour la famille). Bot
  `ferme-a-construire`. **Reste : la tablette** (`?fps` avec une ferme
  pleine : 36 pièces, 20 animaux au plus).
- ✅ **19. L'Animal qui répète** (5/10, Créer, 3D ; « GO », maquette
  validée « oui ») : un animal de la ferme assis sur une botte de foin au
  milieu de l'enclos de Cache-Cache (le pommier, la meule, le tas de bois
  derrière), six au choix en bas avec leur nom. On parle, il penche la tête
  et des ondes montrent qu'il écoute ; on se tait (½ s), il répète avec sa
  voix — poussin accéléré, cochon aigu qui finit en grognant, vache grave
  et « meuh », mouton qui chevrote, canard nasillard, chat —, la bouche
  suit le son (`core/voicefx.ts`, testé). « À l'envers » ; le toucher le
  chatouille ; au bout de 14 s sans un mot, il invite doucement (trois fois
  au plus). Rien n'est gardé : la phrase reste en mémoire le temps de la
  répéter ; le micro (`core/mic.ts`) ne s'ouvre que dans ce jeu, se coupe en
  pause et en sortant ; sans micro, un micro barré qu'on touche pour
  réessayer. Bot `animal-qui-repete` (un faux micro). **Reste : l'essayer
  sur la tablette** (le micro, le volume, l'écho par le haut-parleur).
- ✅ **Le creux sous le cou de la Princesse** (5/10) : comblé par un anneau
  de peau lié à son squelette ; les perles et la chaîne du cœur posées sur
  son cou.
- ✅ **20. La Pâtisserie** (5/10, Créer, 3D ; plan « go », maquette « oui ») :
  une petite pâtisserie (mur à rayures, fanions, bocaux, comptoir en
  marbre), le gâteau sur son présentoir qu'on tourne au doigt. Cinq étapes :
  Gâteau (1 à 3 étages ; rond, cœur, carré), Glaçage (huit couleurs : le
  flanc touché se teint depuis le doigt, le dessus reçoit le nappage qui
  coule), Crème (cinq couleurs, rosace ou goutte, le doigt trace), Décor
  (fraise, framboise, myrtille, cerise, perles ; les vermicelles tombent où
  passe le doigt), Bougies (cinq couleurs, elles s'allument ; on souffle
  dans le micro, ouvert à cette étape seulement, ou on touche « Souffle ! »).
  Puis « Joyeux anniversaire » au carillon, des confettis, et la part
  coupée (génoise, crème, confiture) qui sort sur sa petite assiette ; écran
  de fin. Tout est modelé (`core/cake3d.ts`). Bot `patisserie`. **Reste :
  la tablette** (le souffle au micro, `?fps` gâteau plein).
- ✅ **Retours de Joyce sur la Pâtisserie** (6/10, plan « go ») :
  - les vermicelles ne se voyaient PAS (leur `InstancedMesh` jugé hors champ,
    voir `PIEGES.md`) ; ils tombent maintenant un à un sur ce qu'il y a sous
    eux, couchés sur la surface (le bourrelet, une rosace, l'étage du
    dessous), et se reposent si l'on verse le nappage après ;
  - une baie touchée sur le flanc d'un étage passait DERRIÈRE lui (le rayon
    sautait le flanc jusqu'au premier dessus suivant) : on garde la première
    surface touchée ; sur un flanc, la décoration monte au bord du dessus de
    cet étage ; jamais dans l'étage d'au-dessus ni dans ses coulures ;
  - on MANGE le gâteau, comme la pizza : la première part se coupe toute
    seule après la chanson (le couteau, puis elle glisse sur sa petite
    assiette, la caméra recule pour tout voir) ; un toucher = une bouchée à
    la fourchette (deux par part, la pointe d'abord, la coupe se voit) ; un
    toucher sur le gâteau : il tourne, le couteau coupe la suivante. Six
    parts, « Gâteau dévoré ! ».
- ✅ **« Les perfs sont assez catastrophiques »** (6/10, le père, sur la
  tablette) — deux retours en arrière demandés :
  - **Lettres** : « rollback, je préférais la version 2D sans tes cubes
    moches » : la Chasse aux lettres du 30/09 revient telle quelle (photo,
    cases, grosses lettres qui volent) ; les Cubes de l'alphabet 3D et
    `core/phonics.ts` sont retirés.
  - **Princesse** : « ça rame trop, ramène la moche tête ronde, tant pis pour
    moi » ; son choix : la petite fille d'Habille-toi. Elle EST le jeu
    (`dressup`, « Habille-toi ») ; le modèle VRM (6 Mo), `princess3d.ts`,
    `pet3d.ts`, `castle3d.ts` et `@pixiv/three-vrm` sont retirés ; l'accueil,
    l'écran de fin et le tampon de l'Atelier montrent la petite fille
    (`dollPortraits`) ; le Puzzle perd la photo de la salle de bal ; les
    Bijoux finissent à la vitrine (« Fini »), sans princesse.
  - **Reste** : les autres jeux qui rament, à nommer par le père, avec
    `?fps`, un par un.
- ✅ **Cache-Cache, « trop facile » pour Joyce** (6/10, plan « go », maquette
  « go ») : la fleur ne change pas (la petite ferme de Jade). L'éclair et la
  flamme se jouent sur la GRANDE ferme (`buildFarm({ big: true })`, rayon 13 ;
  autour de la cour : champ de maïs et épouvantail, silo, moulin aux ailes
  qui tournent, ruisseau et pont, verger, citrouilles), 10 et 12 animaux (le
  poussin les rejoint). Caméra libre : un doigt tourne ou incline (le sens
  se choisit aux premiers pixels), deux doigts zooment jusqu'à ×3 et
  promènent la vue, « Toute la ferme » recentre. Jusqu'à 3 (éclair) ou 4
  (flamme) animaux se cachent EN ENTIER dans ce qui se fouille (botte, puits,
  charrette, niche, poulailler, porte du moulin, trappe du silo, buisson) :
  on touche la cachette, il en sort ; une cachette vide remue un peu. Toutes
  les 20 à 34 s, l'un de ceux qu'on ne voit pas change de cachette en
  courant. Bot `cache-cache-eclair` en plus.
- ✅ **Cache-Cache, « toujours bcp trop simple »** (6/10 ; les règles en plus
  refusées, « joue de la taille de la carte + la navigation » ; la marche au
  ras du sol refusée ; maquette de la carte ×4 « GOO ») : l'éclair et la
  flamme passent sur la CARTE ×4 (`buildFarm({ huge: true })`, rayon 26 :
  trois bois avec souche et tronc creux, le grand maïs, le lac et sa barque,
  un hameau, tournesols, blé, dix bosquets, quatre haies — 69 coins), avec
  14 et 18 animaux (des jumeaux au-delà des douze espèces). On part de
  l'enclos, la vue recule sur toute la ferme : de là, un animal fait
  quelques pixels. Caméra de carte : un doigt promène (avec élan), pincer
  zoome jusqu'au ras du sol (la vue se couche en s'approchant), tourner
  deux doigts fait pivoter, les glisser ensemble incline. Le toucher est à
  la mesure de ce qu'on voit ; dans un bois ou un champ, on fouille là où
  l'on touche. Coût : de loin ni ombre ni détails (~540 appels de dessin,
  590 la nuit), de près une ombre serrée autour du point regardé (~270).
  **Reste : la tablette** (`?fps`, la nuit surtout).
- ✅ **Devine mon dessin** (8/10, Jouer ; l'étude « mettre l'IA dans l'app »,
  le père : « DEVINE MON DESSIN ! », maquette, « met un chat ») : elle
  dessine sur la feuille de l'Atelier, le chat de la ferme devine — c'est
  Claude qui regarde (`core/drawguess.ts` ; Opus 5.5, effort bas, une
  fiche imposée de trois propositions avec leur photo de l'imagier). Défi :
  la photo du sujet épinglée (la fleur choisit parmi 14 sujets, l'éclair
  parmi 29, la flamme parmi tout, avec une seule réponse) ; Libre : elle
  répond du pouce, sans score. Seul le dessin part (exception à la règle 3,
  écrite dans CLAUDE.md). Sans clé : un cadenas. Le bot répond à la place
  de Claude. Le 9/10, la clé quitte la tablette : c'est le Worker qui
  appelle Claude (voir ci-dessous). **Reste : le premier vrai essai** (la
  clé posée au Worker), puis régler le prompt sur de vrais dessins des
  filles.
- ✅ **La Ferme sur Cloudflare** (9/10, le père : « une vraie web app
  cloudflare, et plus une page github », sur le modèle de ses autres
  sites, gabarit `tld-docs`) : le Worker `girlz-games` du compte tld83
  (https://girlz-games.tld83.workers.dev) sert l'app, **toute derrière un
  code d'accès** (repris de food-coach : cookie signé de 400 jours, 10
  essais par minute, fermé tant que les secrets manquent) ; les médias de
  `/assets/` passent sans le Worker (gratuits, hors quota). Une route à
  nous : `POST /api/devine`, où la clé Anthropic est un secret du Worker —
  plus rien à régler sur la tablette, le bouton « Clé » est parti. Dépôt
  privé, CI légère (lint, tests, build, `wrangler deploy` : quelques
  minutes, au lieu de 20 à 40) ; le smoke et les bots des jeux touchés
  tournent dans la session avant l'envoi. On repart de zéro sur la
  tablette (les créations de l'ancienne adresse ne suivent pas, choix du
  père). **Reste au père** : le token Cloudflare dans GitHub, les trois
  secrets du Worker, la clé dans un workspace Anthropic à plafond, puis
  réinstaller l'icône depuis la nouvelle adresse, éteindre GitHub Pages et
  passer le dépôt en privé.
- ✅ **Cache-Cache : plus aucun changement de cachette** (6/10, le père :
  « enlève le changement de cachette complètement, c'est ce qui simplifie
  encore + ») : un animal qui courait d'une cachette à l'autre — après une
  trouvaille rapide, ou toutes les 20 à 34 s sur la carte — se faisait
  voir. Une fois cachés, ils ne bougent plus. Puis « enlève aussi les
  indices » et « enlève » : à TOUS les niveaux, le bout qui dépasse ne
  remue plus et personne ne passe la tête en appelant quand on cale ; à
  l'éclair et à la flamme, plus de « presque » non plus (un toucher tout
  près ne fait rien glousser). La fleur garde le « presque ».

- ✅ **« La Princesse est hyper saccadée »** (30/09, testé sur la tablette ;
  correctif validé, « oui, corrige et publie ») : la garde-robe rendait ses
  vignettes avec une seconde princesse 3D, une par image, chacune compressée
  en bloquant la page — et tout repartait à chaque habit changé ; elles
  s'encodent maintenant en arrière-plan, une toutes les 250 ms, jamais
  pendant qu'un doigt touche. Les ressorts des cheveux : deux pas au plus
  par image (ils allaient jusqu'à six, un cercle vicieux). Et la qualité
  automatique réagit en 1,5 s et par crans (densité 1, matériaux simples,
  ombres, 0,75), sans jamais remonter à un niveau trop lent. **Reste :
  `?fps` sur la tablette** pour voir où elle se pose.

- ✅ **La difficulté décalée d'un cran** (30/09 : « le niveau le plus facile
  dégage, un nouveau plus dur, et tout décalé d'un cran » ; « go, tel
  quel ») : dans les 20 jeux qui ont des niveaux, la fleur prend l'ancien
  normal, l'éclair l'ancien expert, et la flamme est neuve — Intrus, douze
  photos dès la première manche (familles agrandies : huit animaux
  sauvages de plus, le poussin, le lait ; une grande grille ne tire que les
  familles qui la remplissent) ; Miroir 12 × 12 à quatre couleurs ;
  Chasse aux lettres, huit longs mots (hippopotame, champignon,
  citrouille…) ; Labyrinthe de 18 à 22
  cases (23 la nuit) ; Taquin 5 × 5 ; Memory jusqu'à 12 paires, sans
  aperçu dès l'éclair ; Suites logiques, motifs de quatre ou cinq animaux et
  cinq wagons à choisir ; Chœur, une mélodie de 14 notes et un seul cœur ;
  Puissance 4 qui voit sept coups ; Horloge à la minute près ; Potager,
  toutes les tables et la réponse toujours au pavé, sans aide ; Marché,
  toute la monnaie et des prix jusqu'à 19,95 € (le client paie encore d'un
  billet : le plus grand est 20 €) ; Tour du Monde, douze questions, les
  petites villes de France ; Espace, la planète à trouver d'après une
  **devinette** (« la planète rouge », « celle qui a de grands anneaux »)
  au lieu de son nom — les lunes et Pluton, trop petites dans le système
  vu de loin, n'étaient pas jouables ; la Poste, les plus longues phrases
  tout de suite et sans la voix (le corpus n'a que trois longueurs) ; et
  pour les jeux d'adresse (Ninja, Tour de Glace, Chenille, Pizzeria, Feu
  d'artifice), plus vite, plus de cactus, moins de cœurs, des seuils
  d'étoiles plus hauts.

- ✅ **« Tu m'as enlevé le feutre multicolore de l'Atelier »** (30/09) : il
  n'était pas parti, mais depuis le 27/09 il était rangé dans le tiroir des
  pinceaux (8ᵉ sur 10) — introuvable. Il revient à un toucher : une
  pastille arc-en-ciel au bout des couleurs (il reste aussi dans le
  tiroir) ; une autre couleur ramène au feutre.

- ✅ **Retours du 30/09, joués sur la tablette** (plan validé : « go » pour
  la sauce, « modes + choix d'ouverture » pour les libellés) :
  - **Les petits noms sous les boutons**, dans toute l'app : les modes du
    Marché (Découvre · Paye · Monnaie), de Puissance 4 (À deux · Contre la
    poule), du Taquin (Image · Nombres · La ferme), la vitesse de l'Espace
    (Plus vite · Moins vite), les bols et le four de la Pizzeria, les
    outils de l'Atelier (Pinceau · Pot · Gomme · Tampons · Miroir · Annuler
    · Effacer ; Papier · Ranger · Dossier), les onglets et les boutons de la
    Princesse ; et à l'ouverture, Facile · Moyen · Difficile, Seule / À
    deux. La barre ronde en jeu reste sans texte.
  - **Le compte bon reste affiché** 4 s au Marché (1,3 s avant : « ça part
    trop vite ») : les pièces dans la caisse, le total en vert.
  - **« Niveau » sur l'écran de fin**, entre Rejouer et Menu : le choix
    fleur / éclair / flamme revient, puis la partie.
  - **Le flash blanc de la Pizzeria** (et le « blink » après le carton
    titre) : changer la taille du canvas l'efface, et l'image suivante
    n'arrivait qu'à l'image d'après. La qualité automatique change la
    taille (un cran), la barre des bols aussi en se repliant. Le canvas est
    maintenant redessiné tout de suite ; les 2 premières secondes ne sont
    plus mesurées (elles faisaient baisser la qualité à chaque ouverture) ;
    remonter attend 4 s de fluidité.
  - **La sauce fluide** : chaque louche partait avec TOUTE la surface de la
    pizza (1024 × 1024, cinq couches recomposées), au plus 20 fois par
    seconde. Pizza crue, la louche est peinte aussi sur la surface visible
    et seul son rectangle (≈ 160 px) part à la carte graphique, à chaque
    image. **À mesurer sur la tablette avec `?fps`.**
  - L'Intrus est bien dans Apprendre (4ᵉ tuile).
- ✅ **Partager les dessins de l'Atelier** (30/09, « pour que je puisse
  partager les images qu'elles font… les imprimer pour qu'elles les
  gardent » ; plan réduit à sa demande : « juste Partager », sans album
  PDF ni verrou) : dans le Dossier, un dessin ouvert a un bouton
  **Partager** — le menu de partage d'Android (Drive, Gmail, WhatsApp,
  Imprimer…), l'image en 1500 × 1000 nommée à la date du dessin. Sans
  menu de partage (ordinateur), l'image est enregistrée. Rien ne quitte la
  tablette sans qu'on choisisse où l'envoyer. Les boutons de la vue ont
  leurs petits noms (Reprendre · Film · Partager · Enregistrer · Jeter).

- ✅ **La Boîte à rythme sort** (30/09 : « les filles me disent que c'est
  un peu nul… soit tu pivotes soit tu me dégages ce jeu » ; « la retirer »
  plutôt que le pivot en « Orchestre de la ferme ») : des cris d'animaux
  coupés au temps sonnent mal, et le Piano tient déjà la musique dans
  Créer. Partis avec elle : sa vignette, son affiche, son bot, son CSS et le
  « meuh » synthétique ; la grange reste (le Chœur, le livre de coloriages).
  Au passage, le Piano nomme le mode choisi sous ses boutons (« Libre »,
  « Au clair de la lune »…) : dix titres ne tiennent pas sous des boutons
  de 58 px.

- ✅ **Les Bijoux, un nouveau jeu dans Créer** (30/09, la demande de Jade ;
  le père : « collier de perles », « oui, elle les porte », maquette
  d'abord — montrée et validée). L'établi en vraie 3D, à la taille réelle :
  la planche à collier en feutrine, le fil de soie tendu en U (fermoir doré
  au départ, aiguille au bout) et le boîtier à douze compartiments — perles
  nacrées irisées, verre, cristal taillé, cœurs, étoiles, fleurs,
  intercalaires dorés, cubes (`core/bijoux3d.ts`). On touche une perle (ou
  on la glisse) : elle vole jusqu'à l'aiguille, s'enfile avec un « tic » et
  glisse le long du fil jusqu'aux autres. Annuler · Vider (deux touchers) ·
  Fermer : le fil se referme en rond, le fermoir claque ; le collier se pose
  sur un coussin de velours qui tourne sous une lumière de bijouterie (la
  vraie réfraction du verre et du cristal est gardée pour cette vitrine) ;
  la couronne fait venir la princesse qui le porte, au bal. Elle le porte
  aussi dans **la Princesse** (`Royal.beads`, `neck: 'beads'`,
  `wearNecklace`), et il rejoint les colliers de sa garde-robe. Aucune
  note, pas de niveau. Vignette, affiche, main (une perle du boîtier ; le
  fermoir quand le fil est garni), bot `bijoux-collier-de-perles` (dix
  perles, une glissée, annuler, fermer, la princesse, puis la Princesse qui
  le porte) : 31 scénarios. Piège payé en route : la géométrie des perles
  de la maquette (661 000 triangles par image, voir `CLAUDE.md`). Sur elle,
  le collier descend en U sur le corsage : au ras de l'encolure, il tombait
  sur le **creux sombre entre son corsage et son cou** (le modèle n'a pas de
  peau sous son haut d'origine) — ce creux, visible aussi sans collier, est
  comblé depuis le 5/10 (voir plus bas).
  **À mesurer sur la tablette avec `?fps`.**
- ✅ **Les perles à repasser dans les Bijoux, et le pendentif au collier**
  (1/10, le choix du père : « les perles à repasser dedans ») : un second
  atelier dans la colonne d'outils (Collier · Perles à repasser, le dernier
  choisi est retenu). Une plaque à picots en création LIBRE, au choix sous
  la plaque comme les vraies plaques à formes : carré, cœur, rond (15 picots
  de côté), étoile (17 : à 15 ses jambes se collaient) — chacune de son
  plastique (bleu, rose, jaune, lilas), les masques et contours testés dans
  `core/perles.ts`. Douze pots de perles 3D à droite, leur nom dessous. On
  pose au toucher ou en glissant (un trait par doigt), un toucher sur une
  perle posée la reprend, Vider en deux touchers ; changer de plaque garde
  les perles qui tombent sur un picot de la nouvelle. Le fer (Repasser) : le
  papier se pose, le fer passe en S, les perles fondent (`ironing` des
  Perles Miroir), la création se décolle et monte vers nous en tournant,
  sous les confettis ; puis deux choix : **Garder** (la vitrine des
  créations : un plateau de velours bordé d'or, la nouvelle tombe dessus ;
  gardée dans le store, 24 au plus ; on y revient par le bouton Vitrine) ou
  **Au collier** (elle y est gardée aussi). Le **pendentif** : la création
  fondue, réduite (3,6 cm au plus, 3 mm la perle), pendue au milieu du
  collier par un petit anneau doré passé dans la perle du milieu (le creux
  d'un cœur : il pend droit) ; sans perles enfilées, un fil de soie le
  porte. Il se voit dans la vitrine du collier (couché sur le coussin), sur
  la princesse au bal des Bijoux et dans la Princesse (`Royal.pendant`,
  `wearPendant` ; une vieille sauvegarde n'a pas de pendentif, rien ne
  change) — UNE géométrie aux couleurs dans ses sommets, un éclairage
  simple. Dans la vitrine des créations, toucher une création la soulève :
  « Au collier » paraît. Sur l'établi du collier, le pendentif attend au
  milieu du U (l'affiche le montre). La main : un pot, puis un picot (nouveau geste
  `taps`), puis le fer ; en l'air, l'un des deux choix. Bot
  `bijoux-perles-a-repasser-pendentif` (six perles touchées, une rangée
  glissée, une reprise, le fer, « Au collier », la princesse qui le porte,
  puis la Princesse) : 33 scénarios. **À jouer sur la tablette** (`?fps`
  avec une plaque pleine et les douze pots).

**Et, arrivé le 30/09 : l'Espace d'après la NOUVELLE maquette du père**
(« je veux ça dans leur app ») — son fichier `systeme-solaire.html` ajoute
deux choses quand le temps va vite : les planètes tournent à leur vraie
vitesse avec un flou de rotation (la surface s'étire le long de la
rotation), et des traînées de lumière le long des orbites (la planète
suivie reste nette). Plan présenté, **en attente du go**.

**Retours du 30/09 après-midi** (« fais tout ce qu'on a validé ensemble ») :
- ✅ **La Chenille sort** (« vire la chenille, elles aiment pas ») : son
  jeu, sa vignette, son affiche et son bot. 23 → 22 jeux.
- ✅ **Plus de choix de niveau là où il n'y en a pas** (« retire les
  niveaux sur l'Atelier et tout ce qui n'a pas de niveau ») : `GameDef.noTier`.
  L'Atelier et le Piano démarrent tout de suite ; la Princesse garde
  « seule / à deux » et une flèche pour jouer. Plus de bouton « Niveau »
  à la fin de ces jeux.
- ✅ **L'Espace copie la maquette HTML du père** (« le jeu de l'espace n'a
  pas changé ! Je veux qu'il copie mon html, avec navigation au doigt et au
  pinch… là on voit rien, c'est injouable ») : on part de la Terre en grand ;
  un doigt tourne autour, deux doigts (ou la molette) s'approchent, deux
  petites tapes recadrent, taper un astre y emmène (taper le ciel ne fait
  plus rien, plus de rotation toute seule). En haut à gauche le nom et la
  fiche (rayon, distance), en haut à droite la date (un toucher : retour à
  aujourd'hui) et la vitesse du temps de la pause à 1 an/s (la tortue, le
  lièvre) ; en bas, la barre de TOUS les astres, lunes comprises, avec une
  étoile d'or sur les planètes visitées ; les astres trop petits portent
  leur nom. Quand le temps file : le flou de rotation et les traînées de
  lumière (l'astre suivi reste net). La voix dit toujours la merveille de
  chaque astre (un bouton la redit) ; Trouve cache la barre et les noms ; la
  fusée vole toujours. Les huit planètes vues : la fête, puis la fin.
- ✅ **Le Tour du Monde : on zoome sur le globe** (« je veux pouvoir zoomer
  sur le globe !!! pas le faire tourner accidentellement à 1000 tours
  seconde ») : deux doigts pincent (la molette aussi), sur le globe comme
  sur la France (que le doigt fait alors glisser) ; le point touché suit le
  doigt, chaque doigt est suivi à part (le deuxième doigt faisait tourner le
  globe à toute vitesse), l'élan est mesuré en vrai, borné et bref ; il ne
  tourne plus tout seul quand on est zoomé.
- 🔨 En cours, un agent par chantier : le **Miroir devient les perles à
  repasser** (proposition 1 : le père attendait l'évolution et ne voyait
  « encore que l'ancien jeu miroir »), le **puzzle** (2), le **Feu
  d'artifice qu'on dessine** (7), les **cubes de l'alphabet** (3) et
  l'**Atelier des bijoux** (le collier que la princesse porte).

Refusés : 9 (trois jeux de plus à deux), 10 (le Mini-golf), 12 (le
Chamboule-tout), 14 (les boîtes à œufs), 15 (la Balance), 16 (le Tangram),
17 (le cycle de la vie).

---

## Ce qui est déjà fait et qu'on ne refait pas ✅

- Vraie 3D + physique sur `core/three3d.ts` pour une dizaine de jeux ; kits glTF `food`,
  `holiday`, `space`, `nature` + icônes food, importés par
  `scripts/import-assets.mjs` ; personnages 3D de la ferme (`core/critters.ts`)
  rendus en images pour les jeux en DOM (`core/portraits.ts`).
- 24 foley Kenney branchés sur `core/impact.ts`.
- Musique générative 6 thèmes (`core/music.ts`), unique et sans fichier.
- Minuteur parental avec verrou « question de grand » (`PlayTimer.tsx`).
- Alerte de quota `localStorage` (`core/backup.ts`) ; la fenêtre d'export est
  sortie le 10/09, la difficulté adaptative silencieuse le 22/09 (le niveau se
  choisit dans le jeu).
- Médaillon photo dans la 3D (`avatarMedallion`).
- Anti-crash (ErrorBoundary + capture des erreurs runtime), maj PWA auto.
- Smoke test et bots de jeu en CI.
