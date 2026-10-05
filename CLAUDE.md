# CLAUDE.md — La Ferme Magique

Webapp PWA de jeux pour **Jade (6 ans)** et **Joyce (8 ans)**, sur tablette
(**Samsung Galaxy Tab A9+** : Snapdragon 695, Adreno 619, 1920×1200 — GPU
milieu de gamme, `pixelRatio` ≤ 1,5, pas de bloom ni de réfraction sans mesure).
Commanditaire : le père. Il veut un **niveau professionnel** — des vrais jeux,
pas un catalogue de mini-jeux. **Il valide le plan avant tout chantier lourd.**

**Répartition des documents — ne rien dupliquer d'un fichier à l'autre :**
`CLAUDE.md` = les règles et conventions (ce fichier) · `PIEGES.md` = les
bugs déjà payés et leur parade (à lire par domaine, pas en entier) ·
`ROADMAP.md` = où on en est et ce qui reste à faire · `AUDIT.md` = l'état
des lieux du 2/09 (verdict par jeu) · `README.md` = présentation de l'app.

---

## Règles non négociables ❌

1. **Aucune mécanique d'addiction.** Ne jamais ajouter, quoi qu'en suggère la
   « bonne pratique » du jeu mobile : monnaie, boutique, coffres, énergie, vies
   qui se rechargent · paliers de déblocage, arbre de progression, saisons,
   événements limités · séries quotidiennes, notifications de rappel, « reviens
   demain » · classements ou comparaison entre les deux sœurs · publicité,
   achats intégrés, analytique tiers, compte en ligne pour les enfants. Les étoiles sont un simple retour de fin de partie :
   rien ne s'accumule (l'album de 24 autocollants à débloquer et le total
   d'étoiles de l'accueil sont sortis le 22/09 ; seule la meilleure note par
   jeu reste, sous sa tuile).
2. **Aucune lecture requise.** 6 ans = ne lit pas couramment. Icônes, sons
   distincts, démonstration visuelle. `core/voice.ts` ne lit que le **contenu
   pédagogique** (multiplications, heures, noms de lieux), **jamais les
   consignes** (réaffirmé le 2/09 ; le moteur de voix est gardé pour la suite).
   Corollaire : dans Apprendre, **aucune sanction** (ni vies, ni chrono, ni
   bonus de vitesse) ; dans Créer, **aucune note** sur une création.
3. **Pas de collecte de données enfants.** Photos et voix restent locales.
   Aucun analytique tiers.
4. **Français uniquement** : textes, commentaires de code, messages de commit.
   Et on se tutoie.

**Le hors-ligne n'est PAS une contrainte** (décision du 25/07/2026). La PWA reste
— elle sert à installer l'app sur l'écran d'accueil — mais le poids du précache
n'est plus un critère de conception : les assets peuvent être chargés à la
demande. Le temps de démarrage n'est pas non plus un critère (dit explicitement
le 28/07) : ce qui compte, c'est la **qualité une fois en jeu** — design,
physique, jouabilité.

**Règle d'arbitrage** : entre « ajouter un jeu » et « amener un jeu existant au
niveau des jeux 3D », **toujours la seconde option**. Depuis le 2/09 : **un jeu
par itération**, plein écran, avec enjeu, rampe liée à la performance,
near-miss et outro (voir `AUDIT.md` §4 pour les huit manques communs).

---

## Architecture

```
src/core/    types.ts (contrat GameDef) · store.ts (zustand+persist) · audio.ts
             music.ts (générative ; `playNote` pour une partition écrite,
                       le bouquet du Feu d'artifice) · voice.ts · juice.ts · fx.ts
             three3d.ts  ← SOCLE 3D PARTAGÉ, à lire avant tout jeu 3D
             sprites.ts  ← photos des imagiers (`photoImg`) et icônes du Food Kit
             portraits.ts ← personnages 3D rendus en IMAGES pour les jeux en DOM
                           (+ `meadowBanner` : le pré de l'accueil)
             plants.ts   ← les 10 plantes illustrées du potager (une par rangée)
             facts.ts    ← LA MÉMOIRE DES CALCULS (phase 4) : niveaux d'aide,
                           récolte composée, révisions espacées, pièges voisins,
                           « presque », + − × ÷ — logique pure, testée
             phonics.ts  ← LES SONS DES CUBES DE L'ALPHABET (30/09) : les mots
                           découpés à la main en graphèmes (« ch », « ou » =
                           un cube) et en syllabes écrites du CP, le SON de
                           chaque graphème, ce que la voix prononce (`landing`,
                           `reading`), les leurres — logique pure, testée
             fps.ts      ← sonde `?fps` (images/s, coût 3D, GPU) pour la tablette
             impact.ts   ← LE feel des chocs : force 0..1 → son + secousse + particules
             backup.ts   ← export/import JSON + alerte quota localStorage
             badges.ts   ← une vignette SVG dessinée par jeu (accueil, carton titre)
             arcade.ts   ← session d'un jeu d'adresse : score, vies, combo, rampe, HUD
             critters.ts ← personnages 3D en formes rondes : taupe, poussin, cochon,
                           lapin, cactus, vache, poule, chien, canard, mouton
                           (`FARM`, les pions des jeux en DOM) et, depuis le
                           28/09, coq, chèvre, cheval, chat (`FARM_MORE`)
             royal.ts    ← LEUR princesse en données (27/09) : pièces, peintures
                           (couleur + motif) par pièce, cheveux, compagnon — testé
             princess3d.ts ← LA PRINCESSE en 3D : le personnage VRM de pixiv
                           (`assets/princess/princesse.vrm`, `@pixiv/three-vrm`)
                           habillé par nous — `makePrincess(T, royal)`, habits
                           liés à son squelette, tissu magique (`dye` : la
                           teinture part du doigt), ses expressions
                           (`face.expr`, `face.lookAt`), `posePrincess(p,
                           'cheer'|'spin'|'waltz'…)` sur ses os normalisés
             pet3d.ts    ← son compagnon : licorne, poney, chaton, chiot
             castle3d.ts ← les décors qu'on touche : salle de bal, jardin, jour/nuit
             atelierdb.ts ← l'IndexedDB de l'Atelier (partagée avec la Princesse)
             cosmos.ts   ← LE SYSTÈME SOLAIRE de l'Espace (27/09, d'après la
                           maquette du père) : ciel et Voie lactée procéduraux,
                           Soleil qui bout, Terre jour/nuit/villes, atmosphères,
                           ombres des anneaux, lunes, vraies positions (JPL),
                           rendu HDR + halo + ACES branché sur `stage.render` ;
                           depuis le 30/09 (sa maquette suivante), le flou de
                           rotation et les traînées quand le temps file
                           (`frame(dt, dJ, suivi)`) — le jeu, lui, reprend sa
                           disposition : nom et fiche, date et vitesse, barre
                           de tous les astres, noms des petits astres
             rocket3d.ts ← LA FUSÉE de l'Espace (28/09) : la fusée « A » choisie
                           dans Canva, reconstruite en vraie 3D (l'image sert de
                           modèle) — profil lissé, peinture vernie, joints et
                           rivets, reflets tournés vers le vrai Soleil, flamme
             winter.ts   ← le paysage d'hiver de la Tour de Glace (né avec le
                           Bonhomme, sorti le 28/09) : montagnes, chalet Kenney
                           assemblé pièce par pièce, lanternes, et l'HEURE qui
                           suit la hauteur (`setDusk` : jour → doré → crépuscule
                           → nuit, étoiles, lune, aurore)
             doll3d.ts   ← la petite fille d'Habille-toi en formes rondes (+
                           `character.ts`, son look) : l'ANCIENNE version de
                           la Princesse, derrière son petit bouton (28/09,
                           `games/doll.ts`, monté par `dressup.ts`)
             money3d.ts  ← L'ARGENT du Marché en 3D (28/09) : pièces en métal
                           (relief, patine, tranche, vraies tailles) et billets
                           courbés, rendus en IMAGES (`moneyImages`), gardés
             posters.ts  ← les jeux qui ont leur AFFICHE sur l'accueil
                           (écrit par `scripts/posters.mjs`)
             hand.ts     ← LA MAIN QUI MONTRE (30/09) : le geste de chaque jeu
                           mimé par un gant blanc (`GameDef.hand`, lancé par
                           GameHost) — taper, glisser, trancher, tracer une
                           forme (`trace`, le cœur du Feu d'artifice), taper
                           l'un après l'autre (`taps` : les deux pouces du
                           Flipper, le pot puis le picot des Bijoux), ou
                           `choose` (« l'un de ceux-là », sans appuyer :
                           jamais la réponse dans Apprendre)
             pinball.ts  ← LA PHYSIQUE DU FLIPPER (1/10) : la bille dans le
                           plan de la table, pas fixe de 1/480 s (un batteur ne
                           se traverse jamais), batteurs en capsules qui
                           tournent (ω × r donné à la bille), bumpers, foins,
                           œufs, rampe en une dimension, chien gardien, et
                           `autoPilot` (le pilote des tests et du bot) — pure,
                           testée ; les grandes séries : `npm run sim:flipper`
             barn3d.ts   ← la scène de la grange et sa chorale (le Chœur, le
                           coloriage) : `barnChoir`,
                           `singOn`, `stepChoir`
             train3d.ts  ← le petit train (Suites logiques, coloriage)
             lineart.ts  ← le LIVRE DE COLORIAGES de l'Atelier (30/09) : les
                           personnages 3D rendus en dessins au trait (une
                           couleur par pièce, on garde les bords), gardés
             jigsaw.ts   ← LES DÉCOUPES DU PUZZLE (30/09) : tenons et
                           mortaises en courbes de Bézier, bords droits —
                           logique pure, testée (`games/jigsaw.ts` en fait
                           des pièces 3D)
             pictures.ts ← LES IMAGES DU PUZZLE (30/09), en 4:3 : la ferme
                           en 3D, leur princesse dans la salle de bal,
                           l'Espace avec leur fusée — rendues une fois,
                           gardées sur le disque (+ `drawingPicture` de
                           `games/coloring.ts` pour un dessin du dossier)
             hama3d.ts   ← LES PERLES À REPASSER en 3D (30/09) : la plaque à
                           picots (`pegboard`, en pas de plaque, perles et
                           picots en `InstancedMesh`), la perle-tube et sa
                           version FONDUE en morph par perle (`fuse`), les
                           pots de perles, l'axe lumineux, le fer et le
                           papier sulfurisé (`ironing`) — pour les Perles
                           Miroir et les Bijoux ; depuis le 1/10, les plaques
                           à FORME (`outline` + `mask` : cœur, étoile, rond),
                           et la création fondue en UNE géométrie aux
                           couleurs dans ses sommets (`fusedPieceGeo`,
                           `pendantGeos` : le pendentif et son anneau)
             perles.ts   ← leurs dessins en petites grilles (papillon, fraise,
                           cochon…), la palette des pots et les manches du
                           Miroir (modèle, axe, reflet) ; les plaques à forme
                           des Bijoux (`plateMask`, `plateOutline`) et une
                           création en lignes de lettres (`pieceOf`,
                           `pieceHook` : où passe l'anneau) — logique pure, testée
             bijoux3d.ts ← LES PERLES des Bijoux (30/09) en vraie 3D, à leur
                           taille réelle : nacrée irisée, verre, cristal
                           taillé, cœur, étoile, fleur, intercalaire, cube ;
                           un « kit » par scène (`beadKit` : `refract` pour
                           la vitrine, `cheap` pour la princesse), `orientQ`
                           (le trou sur Y, le long du fil), `instancedRun`
             voicefx.ts  ← LA VOIX RIGOLOTE de l'Animal qui répète (5/10) :
                           plus aiguë sans aller plus vite (des grains),
                           accélérée, chevrotante, à l'envers, et le
                           détecteur de phrase (`Phrase` : le bruit de la
                           pièce appris, une demi-seconde gardée avant, un
                           claquement ignoré) — logique pure, testée
             mic.ts      ← LE MICRO (5/10) : ouvert à la demande, coupé pour
                           de bon (`stop` arrête la piste), il ne garde rien
                           (un morceau de son passé au jeu puis oublié)
             farm3d.ts   ← LA FERME EN DIORAMA (1/10, Cache-Cache) : un plateau
                           rond qu'on fait tourner, ses cachettes construites
                           (grange, meule, puits, charrette, tracteur, niche,
                           poulailler, mare, boue, potager…) et leurs PLACES
                           (`FarmSlot` : 'top', 'face', 'rear', 'tree'), la
                           nuit (lune, lucioles, lanternes) ; `bake()` fond ce
                           qui ne bouge pas en un mesh par matériau ;
                           `bale()` : une botte de foin de plus
src/components/  Home · GameHost · PlayTimer · Album · VoiceStudio · …
src/games/       1 fichier par jeu + index.ts (le catalogue)
public/assets/     planches Kenney (PNG packé + JSON d'atlas) + CREDITS.md
scripts/smoke.mjs        ouvre tous les jeux dans Chromium, vérifie 0 erreur JS
scripts/import-assets.mjs  (re)télécharge et trie les packs Kenney
scripts/posters.mjs      les affiches de l'accueil : chaque jeu ouvert, mis en
                         scène (`STAGE`), photographié sans la coquille
```

**Les imagiers sont en PHOTOS, et rien qu'en photos** (12/09) : l'Intrus,
Memory, les Cubes de l'alphabet (ex-Chasse aux lettres), le Marché — et depuis le 22/09 les animaux
des continents du Tour du Monde. 76 sujets dans
`public/assets/photos/*.jpg`, réunis par `scripts/import-photos.mjs` —
**animaux : iNaturalist** (recherche par taxon latin), **le reste : catégories
de Wikimedia Commons** — tous ramenés au même moule (carré, 512 px) à l'import.
`photoImg(nom, px)` et `hasPhoto(nom)` sont dans `core/sprites.ts`, les crédits
dans `photos/CREDITS.json` et `public/assets/CREDITS.md`. L'app est privée et
sans usage commercial : les licences CC BY-NC sont acceptées, et créditées.
**Règle du père : jamais deux styles.** Ce qui est PION ou DÉCOR (Simon,
Puissance 4, les images du Puzzle) est fait des personnages
3D de la ferme (`core/critters.ts`), rendus en images par `core/portraits.ts` :
`critterPortraits(['cow','hen'], px)` renvoie des dataURL (cache, un contexte
WebGL jetable), `portraitImg(url, px)` les insère ; `farmPicture()` de
`core/pictures.ts` rend un pré 3D entier (4:3, gardé sur le disque). **Leurs princesses** (27/09) suivent la même règle :
construites dans `core/princess3d.ts` à partir d'une `Royal`
(`core/royal.ts`), en vraie 3D dans la Princesse, en images
(`princessPortraits(looks, poses, px)`, une ou deux côte à côte) sur l'écran
de fin, en promenade sur l'accueil et en tampons dans l'Atelier. Le store
garde trois princesses (`royals.solo`, `.jade`, `.joyce`) ; `familyLooks()`
donne celles à montrer (les deux sœurs dès qu'elles ont gardé la leur).
Le collier enfilé dans les **Bijoux** (30/09) est à elles aussi : ses perles
dans `Royal.beads` (sorte + couleur, dans l'ordre du fil), porté quand
`neck` vaut `beads` ; `wearNecklace` (store) le met à la princesse qu'on
habille seule et l'offre aux garde-robes de Jade et de Joyce ; `princess3d`
le construit sur elle (groupe `collier`, accroché au haut du buste, plus
long = plus bas sur la poitrine, par-dessus le corsage). Son **pendentif**
(1/10) : une création de perles à repasser des Bijoux, `Royal.pendant`
(`Piece` : des lignes de lettres, recadrées ; `null` dans une vieille
sauvegarde), accrochée au milieu du fil par un anneau doré (`wearPendant` ;
sans perles enfilées, un fil de soie le porte : `hasNecklace`), construite
en UNE géométrie (groupe `pendentif`, `MeshStandardMaterial` aux couleurs
dans ses sommets), inclinée juste assez pour rester sur le corsage. La
vitrine des créations est dans le store (`creations`, 24 au plus).
Un petit bouton rond (la petite fille à couettes, en bas à gauche de la
scène) ouvre l'**ancienne version**, Habille-toi (`games/doll.ts`, demandé
le 28/09) ; une couronne y ramène, le dernier choix est retenu
(`ferme:princesse:mode`), et chaque version a ses timers de partie à elle
(`scoped()` dans `dressup.ts`). Pour ajouter un mot : une ligne dans
`TERMS` (+ `VIVANT` ou `CATEG`), `node scripts/import-photos.mjs candidats <id>`,
**regarder** la planche-contact, écrire `photos.picks.json`, puis `… garder`.

**Plus aucune planche 2D** (22/09) : les planches Kenney `animals`, `nature`,
`items` et `fish` ne servaient plus à aucun jeu, elles sont sorties avec leur
code (`loadAtlas`, `frameStyle`, `spriteFromAtlas`…). Kenney reste la source
des modèles 3D (kits food, holiday, space, nature) et des bruitages : pour en
ajouter, éditer `scripts/import-assets.mjs` et le relancer — les fichiers
triés sont commités, les zips ne le sont pas. Pas d'emoji dans les jeux.

**Une illustration se commande, elle ne se dessine pas** (23/09). Deux
refus nets du père le même jour : les modèles Kenney vus de près (« cette 3D
immonde avec 5 triangles par objet ») et des plantes dessinées à la main en
SVG (« hideux »). Ce qui a été validé : une **planche générée d'un coup avec
Canva** (les dix plantes dans UN style, fond retiré dans Canva), découpée en
carrés WebP — voir `core/plants.ts` et la section des plantes de
`public/assets/CREDITS.md` (texte de commande à réutiliser). Canva refuse le
téléchargement depuis la session : le père dépose le PNG dans son Google Drive
et on le récupère par le connecteur Drive (un sous-agent, le fichier arrive en
base64). Une nouvelle planche se commande **avec la planche des plantes en
image de référence** (`generate-image` de Canva l'accepte) : c'est ainsi que
les fruits du Ninja (24/09, `public/assets/fruits/`) sont du même style.
**Un personnage humain ne se construit pas en formes rondes** (27/09) : la
première princesse, sphères et tubes, a été refusée le soir même (« sa tête
ronde, on dirait un pantin de bois de 1950 »). Elle est maintenant le modèle
VRM de démonstration de pixiv (licence VRM Public License 1.0 : modification
et redistribution permises), allégé à 6 Mo ; ce qu'elle porte reste à nous
(pièces construites, ajustées à son corps mesuré, liées à son squelette).
Les animaux ronds de la ferme, eux, restent en formes rondes.
Et avant toute nouvelle direction visuelle : **des maquettes au
format de la tablette, montrées AVANT de coder** (c'est ainsi que le rendu du
Potager et le ciel du Ninja ont été choisis).

**Contrat d'un jeu** — volontairement minimal, c'est la force du projet :

```ts
export const monJeu: GameDef = {
  id: 'monJeu', name: 'Mon Jeu', icon: '🎯', sq: 'sq-sky',
  cat: 'action',   // reflexion | memoire | action | creatif
  music: 'fair',   // optionnel : thème de core/music.ts
  subtitle: '…',
  mount(ctx) { /* … */ return () => { /* cleanup IDEMPOTENT */ } }
}
```
Puis **une ligne dans `src/games/index.ts`**. `GameHost` fournit `ctx` :
`root`, `tier`, `playerName` (**vide** tant que le choix de joueuse est
masqué : les messages de fin tutoient et ne nomment personne), `avatar`,
`look`, `byTier(e,m,x)`, `finish()`,
`toast()`, `say()`, et depuis le 2/09 les **timers de partie** `after(ms,fn)` /
`every(ms,fn)` / `cancel(id)` / `alive()` (annulés au démontage, suspendus en
pause — ne plus utiliser `setTimeout` pour piloter un jeu). `finish()` accepte
`outroMs` : le jeu reste monté ce temps-là (ralenti, chute, caméra) avant le
score. La **pause** est globale (`core/session.ts` : `setPaused`, `onPause`) :
onglet caché, minuteur parental, bouton pause ; `createStage` fige sa boucle
dessus tout seul. **La difficulté se choisit DANS le jeu** (10/09) : à l'ouverture, `GameHost`
affiche trois boutons sans un mot — fleur, éclair, flamme — et ne monte le
jeu qu'après le choix, qui alimente `ctx.tier` et `ctx.byTier(e, m, x)`.
**Depuis le 30/09, tout est décalé d'un cran** (« le niveau le plus facile
dégage ») : la fleur (`easy`) joue l'ancien normal, l'éclair (`med`)
l'ancien expert, la flamme (`exp`) est un niveau NEUF, plus dur que tout ce
qui existait. Un nouveau réglage part de là : jamais de retour aux valeurs
de l'ancienne fleur. Le dernier niveau joué est retenu par jeu (`ferme:niveau:<id>`)
et signalé d'un liseré ; un bouton de la barre en jeu rouvre le choix et
relance la partie. Un jeu qui déclare `ops: true` (le Potager, 27/09) ouvre
d'abord sur une étape « opérations » : quatre étiquettes + − × ÷ sans un mot,
plusieurs à la fois, le + par défaut, la dernière allumée ne s'éteint pas, le
choix retenu (`ferme:ops:<id>`) ; une flèche mène à la difficulté, dont le
rappel des opérations ramène à l'étape 1 ; `ctx.ops` suit. Un jeu qui déclare `duo: true` (Ninja) ajoute
au-dessus un choix « seule / à deux » (deux silhouettes) : `ctx.duo` = deux
sœurs sur la même tablette, EN ÉQUIPE — plusieurs doigts à la fois, un seul
score, les messages de fin disent « vous », jamais qui a fait quoi.
L'accueil est une **grille de jeux en trois onglets** (Jouer / Apprendre /
Créer, `.hm-tab[data-w]`, dernier onglet retenu dans `ferme:univers`) : le choix
de joueuse (Jade / Joyce) est masqué derrière `SHOW_PROFILES` dans
`core/store.ts` — prêt à revenir ; tant qu'il l'est, les encouragements
enregistrés sont communs à la famille — le Défi à deux et la fenêtre de
sauvegarde sont supprimés
(`core/backup.ts` reste pour `loudStorage` et l'alerte de quota).
En jeu, `body.playing` met la coquille en **plein écran** :
l'arène (`.arena`, `#catchArea`, `#runArea`) prend toute la place restante, la
barre maison/pause/rejouer flotte par-dessus (`.playbar`), le titre est un
carton de 1,5 s. Les icônes de la coquille viennent de `core/icons.ts` (SVG),
jamais d'emoji. **Chaque bouton de mode ou d'outil porte son petit nom
dessous** (30/09 : « un label en plus du symbole, dans toute l'app ») :
`<span class="tool-item">bouton<i class="tool-cap">Nom</i></span>` — la
pastille s'allume seule quand le bouton a `.sel` ou `.on` (`:has`), le jeu
n'a rien à suivre ; le choix de niveau dit Facile · Moyen · Difficile, et
Seule / À deux. Le symbole reste le repère (une enfant de 6 ans ne lit pas) ;
la barre ronde en jeu (maison, pause, son, rejouer) reste sans texte, pour ne
pas couvrir le jeu. L'écran de fin a trois boutons : Rejouer, **Niveau** (le
choix fleur / éclair / flamme revient, puis la partie) et Menu. **Les tuiles de l'accueil sont des AFFICHES** (28/09) : une
image du jeu en train de se jouer (`public/assets/affiches/<id>.webp`, 4:3),
prise dans le vrai jeu par `scripts/posters.mjs` — mise en scène par jeu
(`STAGE` : attente, gestes, cadrage), barre, score et main cachés. La
**vignette dessinée** de `core/badges.ts` (`BADGE[id]`, `viewBox 0 0 48 48`,
formes pleines, palette de `global.css`) reste pour le carton titre, le
chargement et un jeu sans affiche (sans vignette : son emoji). Un nouveau
jeu arrive avec les trois : sa vignette, son affiche
(`ONLY=<id> node scripts/posters.mjs`, puis REGARDER l'image), et **sa
main** (`hand`, `core/hand.ts`) : une fonction qui rend le geste à montrer
selon la phase du jeu, ou `null` quand il n'attend rien (chargement, écoute,
animation). Ses cibles : un élément (`visible(root, sel)` ne garde que ceux
qu'un doigt toucherait vraiment), un point d'écran (`toScreen` en 3D) ou une
fraction de l'arène. Dans Apprendre, `choose` sur plusieurs cibles, jamais
la bonne seule. Elle vient à la première partie, puis après 7 s sans toucher
(15 s dans Créer) ; un toucher la chasse.

**Un jeu d'adresse part de `core/arcade.ts`** (session : score, vies, combo,
rampe par performance, timers simulés `game.after`, HUD en icônes dans
l'arène, `game.flash()` pour un mot-image, `game.end()` avec `outroMs` ; le
combo pilote `setMusicIntensity()` de `core/music.ts` : à 3, 6 et 10
d'affilée la musique gagne un shaker, un arpège, une contre-voix) et de
`core/sfx.ts` pour les sons de gestes (`sfx('slice')`, `preloadSfx([...])`)
— et, depuis le 25/09, pour les **vraies voix des animaux** (`cry('vache', {max,
solo})`, `CRY[critter]`, `preloadCries`) : dix cris enregistrés de Wikimedia
Commons choisis à l'oreille par le père, dans `public/assets/sounds/animals/`
(crédits dans CREDITS.md). Un animal de la ferme qui « parle » prend sa voix
là, jamais un `tone()` — depuis le 28/09, les dix ont leur personnage 3D
(le coq, la chèvre, le cheval et le chat sont arrivés avec le Chœur sur scène).
Modèles : `icetower.ts` et, en 2D, `ninja.ts` (un canvas, les fruits Canva,
ombres et lueurs précalculées une fois par image, vagues puis pluie finale).
Poussin Volant et Tape-Trous sont sortis le 27/09 (« vire-les »), avec
`core/runner.ts` (le socle des jeux qui défilent) ; la Boîte à rythme le
30/09 (« un peu nulle » pour les filles : des cris d'animaux coupés au temps
sonnent mal, et le Piano tient déjà la musique dans Créer). Pour un jeu Apprendre
en 3D sans arcade, `geo.ts` (globe NASA, données Natural Earth/IGN dans
`public/assets/geo/`, voix = noms de lieux uniquement ; depuis le 30/09, on
pince pour zoomer sur le globe et sur la France, que le doigt fait glisser).

**Un nouveau jeu 3D part de `core/three3d.ts`** : `createStage()` applique déjà
antialias, pixelRatio plafonné à 2, ACES, PCFSoftShadowMap, `shadow.bias`,
lumières et brouillard. Puis `fixedStep()` pour la physique, `orbitCam()` pour la
caméra, `loadThree()`/`loadPhysics()` + `loader(arena, gameId)` (la vignette
`BADGE` du jeu qui respire) pour le chargement à la
demande, `stage.dispose()` pour le nettoyage GPU (et `stage.keep(tex)` pour les
textures non attachées à la scène). Puis **`core/scene3d.ts`** : `ground()`,
`decor()` (modèles du kit `nature` ou `holiday`, avec `shade` pour assombrir
les kits clairs), `particles()` (GPU, dans la scène — plus de divs au-dessus du
canvas), `camShake()` (à `apply()` après avoir placé la caméra), `toScreen()`.
`stage.timeScale` fait les ralentis d'outro. **La qualité s'adapte seule**
(28/09, reprise le 30/09 : « la Princesse est hyper saccadée ») dans la boucle
de `createStage` : plus de 30 ms par image en moyenne → un cran toutes les
1,5 s, du moins visible au plus visible : densité ramenée à 1, matériaux « de
luxe » simplifiés (vernis, satin, irisé, transmission : les plus chers par
pixel), ombres coupées, densité 0,85 puis 0,75 ; moins de 17 ms → la densité
remonte, mais jamais jusqu'à un niveau qui était trop lent (sinon elle fait
le va-et-vient, et chaque changement de taille est un à-coup) ; remonter
attend 4 s de fluidité. Les 2 premières secondes ne sont même pas MESURÉES
(shaders, modèles : elles faisaient baisser la qualité à chaque ouverture),
ni rien avec `?hq` (captures, mesures), ni pour les bots
(`__BOT`), ni pour un jeu à rendu propre ; `?fps` affiche l'état. Un jeu
n'a donc plus à faire sa propre baisse de qualité. Un jeu qui a son propre rendu
(l'Espace : ciel à part, cible HDR, halo en sept étages, ACES écrit à la main)
le branche sur `stage.render` et réalloue ses cibles dans `stage.onResize` :
la pause, le redimensionnement, `?fps` et le nettoyage restent ceux du socle.

Jeux déjà en vraie 3D : `pizza` · `space` · `icetower` · `patterns` (le petit train, 28/09) ·
`simon` (le Chœur sur scène, 28/09) · `pinball` (le Flipper de la grange, 1/10 :
physique à nous dans `core/pinball.ts`, pas cannon-es) · `mirror` (les Perles Miroir, 30/09) · `dressup` · `bijoux` (30/09) ·
`memory` · `maze` (logique de grille inchangée, rendu en haies 3D) ·
`taquin2` (le Puzzle, 30/09 : son mode Puzzle est en 3D, `games/jigsaw.ts` ;
son second mode, le Taquin, reste en DOM) ·
`letters` (les Cubes de l'alphabet, 30/09 : cubes de bois, la voix dit le
son, la syllabe, puis le mot — les sons dans `core/phonics.ts`) ·
`hideseek` (Cache-Cache, 1/10 : la ferme en diorama qu'on fait tourner au
doigt, `core/farm3d.ts` ; la nuit, à la lampe torche) · `parrot` (l'Animal
qui répète, 5/10 : un animal sur sa botte de foin dans l'enclos de cette
ferme, `critterKit(T, { fine: true })` pour les gros plans ; le micro ne
s'ouvre que là, se coupe en pause et en sortant, et n'écoute pas pendant
qu'il parle ; son bot parle par un faux micro, un WAV que `play.mjs`
génère et que Chromium lit en boucle). La Course,
le Stand 3D et Attrape sont sortis le 24/09 (« éclatée », « on enlève ») ; le Ninja est repassé en 2D le même jour
(« les fruits trop grossiers, c'est confus »). La Chenille et Poussin Volant
ont fait l'aller-retour le 25/09 : leurs versions 2D illustrées ont été
retirées le soir même — « mille fois moins bien que la version isométrique
hyper mignonne », « de la 2D saccadée et pixelisée sur une surface
minuscule » ; les 3D du 23/09 sont revenues telles quelles. La Chenille est
sortie le 30/09 (« elles aiment pas »). **Un jeu en vraie
3D ne redescend pas en 2D.** Pour
un jeu de physique rigide (cannon-es) sur le socle, `icetower.ts` est le
modèle : `loadPhysics()`, `fixedStep` autour de `world.step`, corps figé avec
`mass = 0`.

---

## Pièges déjà payés 🪤 → `PIEGES.md`

Une soixantaine de bugs vécus, leur cause et leur parade, rangés dans
`PIEGES.md` (sorti d'ici le 2/10 pour alléger ce fichier, relu à chaque
étape). **Avant de toucher à un domaine, lire sa ligne** — 3D et GPU
(nettoyage, couleurs + ACES, canvas redimensionné, textures de shader,
effets proportionnels au temps d'une image), physique (cannon-es, pas
fixes, horloge simulée), toucher (deux doigts, glissé sur `window`, plein
écran, tiroir qui avale le doigt), VRM (cheveux, yeux, habits liés, creux
du cou), voix et sons (`setTimeout`, premier son, noms des lettres), bots
(accroche, 4 fps, valeur périmée, gagner par chance, copie de la main),
scripts (`pkill -f`, ports, serveurs des autres), PWA (la maj qui
recharge), imagiers (banques d'images, planche-contact). Et en ajouter une
ligne quand on en paie un nouveau.

---

## Méthode de travail

1. `npm run build` (inclut `tsc -b`, **strict**) · `npm run lint` · `npm test`.
2. **Toujours vérifier dans un vrai navigateur** avec Playwright :
   `nohup npx vite preview --port 4188 --strictPort &`, puis un script
   `.verify-*.mjs` en racine. Chromium : `/opt/pw-browsers/chromium`.
   Pour la 3D : `args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']`.
3. **Regarder les captures d'écran.** Ne jamais conclure « ça marche » sur des
   logs : les trois pires bugs de la 3D étaient invisibles dans la console.
4. En CI, à chaque push sur `main` (sur GitHub, sans coûter un token), le
   smoke ouvre TOUS les jeux, puis **seuls les bots des jeux touchés**
   jouent (2/10, le père : « on ne valide via bot que les jeux que l'on
   touche spécifiquement ») ; l'un ou l'autre en échec **bloque la mise en
   ligne**. `scripts/touched.mjs` compare avec la dernière mise en ligne
   réussie : un fichier d'un jeu, un module qui ne sert qu'à lui (sa table
   `OWN`) ou un scénario modifié de `play.mjs` → ses bots ; un module commun
   → aucun bot. Sans jeu touché, la mise en ligne prend une douzaine de
   minutes. Tous les bots : lancement manuel du workflow avec « tous ».
   `node scripts/touched.mjs` dit lesquels joueront pour ta branche.
   `npm run test:play` a **un bot par jeu** (5/10 : 37 scénarios, le Potager en a quatre, le Feu d'artifice, le Puzzle, Cache-Cache et les Bijoux deux ; `BOTS=poste,potager` pour n'en lancer que quelques-uns ; `PORT=…` pour les faire tourner à côté d'un autre serveur) jusqu'à
   son écran de fin ; un nouveau jeu arrive avec son bot, son accroche
   `window.__xx` (posée seulement si `window.__BOT`) et sa ligne dans
   `OWN` (sinon `touched.mjs` le signale d'un ⚠ et aucun bot ne le joue). Plusieurs sessions en
   parallèle : `PORT=4186 npm run test:smoke` (ou `test:play`) prend un autre
   port, et les deux scripts refusent de démarrer sur un port déjà servi.
5. Supprimer les scripts `.verify-*.mjs` avant de committer (ils sont dans
   `.gitignore` et ignorés par ESLint, par sécurité).
6. Sur la vraie tablette, `?fps` dans l'adresse allume la sonde d'images par
   seconde (reste allumée, `?fps=0` l'éteint) : mesurer AVANT de toucher aux
   ombres, au `pixelRatio` ou aux particules.
7. **L'économie** (2/10, « pourquoi tu consommes autant de tokens ? ») :
   - **un seul agent à la fois** — à cinq sur 4 cœurs, la 3D logicielle
     sature, les tests expirent avant d'ouvrir un jeu et tout est refait ;
   - en local, **3 ou 4 captures** bien choisies (celles qui jugent le
     rendu), **un seul passage du bot du jeu touché**, pas de smoke complet :
     la CI rejoue le smoke et les bots des jeux touchés avant la mise en ligne ;
   - **une mise en ligne par lot**, pas une par jeu (un push sur `main`
     pendant un déploiement annule celui qui tourne) ;
   - lire `PIEGES.md` par domaine, et les gros fichiers par morceaux.

## Git & déploiement

- Repo `keryprophez/girlz-games` (public), en ligne :
  https://keryprophez.github.io/girlz-games/
- **`main` est la branche par défaut ET la seule qui publie** (23/09) :
  `deploy.yml` se déclenche sur un push de `main`. L'ancienne branche
  déployée `claude/magic-farm-game-q66bw4` n'est plus à pousser (elle va être
  supprimée).
- Développer sur une branche de travail, ne jamais pousser ailleurs sans
  demander. Livraison :
  ```bash
  git fetch origin && git merge origin/main   # puis smoke + bots
  git push -u origin <branche-de-travail>
  git checkout main && git merge --ff-only <branche> && git push origin main
  git checkout <branche>
  ```
- CI : `npm ci` → `npm run build` → `npm run test:smoke` → `touched.mjs` →
  `test:play` (les bots des jeux touchés, sauté s'il n'y en a pas) → Pages.
  Si un run est annulé, le relancer à la main : `workflow_dispatch` sur `main`.
  Si le déploiement est refusé par l'environnement `github-pages`, c'est sa
  règle de branches (Settings → Environments → github-pages) qui n'accepte
  pas encore `main`.
