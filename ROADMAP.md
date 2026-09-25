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
3. **Poulailler** jusqu'à 10 et 20.
4. **Poulailler jusqu'à 100** (la retenue) ; le Grand Tableau + sort alors du
   catalogue avec son bot.

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
  (piège consigné dans CLAUDE.md).

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
