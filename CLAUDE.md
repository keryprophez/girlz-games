# CLAUDE.md — La Ferme Magique

Webapp PWA de jeux pour **Jade (6 ans)** et **Joyce (8 ans)**, sur tablette
(**Samsung Galaxy Tab A9+** : Snapdragon 695, Adreno 619, 1920×1200 — GPU
milieu de gamme, `pixelRatio` ≤ 1,5, pas de bloom ni de réfraction sans mesure).
Commanditaire : le père. Il veut un **niveau professionnel** — des vrais jeux,
pas un catalogue de mini-jeux. **Il valide le plan avant tout chantier lourd.**

**Répartition des documents — ne rien dupliquer d'un fichier à l'autre :**
`CLAUDE.md` = les règles et conventions (ce fichier) · `ROADMAP.md` = où on en
est et ce qui reste à faire · `AUDIT.md` = l'état des lieux du 2/09 (verdict
par jeu) · `README.md` = présentation de l'app.

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
             music.ts (générative) · voice.ts · juice.ts · fx.ts
             three3d.ts  ← SOCLE 3D PARTAGÉ, à lire avant tout jeu 3D
             sprites.ts  ← photos des imagiers (`photoImg`) et icônes du Food Kit
             portraits.ts ← personnages 3D rendus en IMAGES pour les jeux en DOM
                           (+ `meadowBanner` : le pré de l'accueil)
             plants.ts   ← les 10 plantes illustrées du potager (une par rangée)
             facts.ts    ← LA MÉMOIRE DES CALCULS (phase 4) : niveaux d'aide,
                           récolte composée, révisions espacées, pièges voisins,
                           « presque », + − × ÷ — logique pure, testée
             fps.ts      ← sonde `?fps` (images/s, coût 3D, GPU) pour la tablette
             impact.ts   ← LE feel des chocs : force 0..1 → son + secousse + particules
             backup.ts   ← export/import JSON + alerte quota localStorage
             badges.ts   ← une vignette SVG dessinée par jeu (accueil, carton titre)
             arcade.ts   ← session d'un jeu d'adresse : score, vies, combo, rampe, HUD
             critters.ts ← personnages 3D en formes rondes : taupe, poussin, cochon,
                           lapin, cactus, vache, poule, chien, canard, mouton
                           (`FARM`, les pions des jeux en DOM)
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
                           rendu HDR + halo + ACES branché sur `stage.render`
             rocket3d.ts ← LA FUSÉE de l'Espace (28/09) : la fusée « A » choisie
                           dans Canva, reconstruite en vraie 3D (l'image sert de
                           modèle) — profil lissé, peinture vernie, joints et
                           rivets, reflets tournés vers le vrai Soleil, flamme
             winter.ts   ← le paysage d'hiver de la Tour de Glace (né avec le
                           Bonhomme, sorti le 28/09) : montagnes, chalet Kenney
                           assemblé pièce par pièce, lanternes, et l'HEURE qui
                           suit la hauteur (`setDusk` : jour → doré → crépuscule
                           → nuit, étoiles, lune, aurore)
src/components/  Home · GameHost · PlayTimer · Album · VoiceStudio · …
src/games/       1 fichier par jeu + index.ts (le catalogue)
public/assets/     planches Kenney (PNG packé + JSON d'atlas) + CREDITS.md
scripts/smoke.mjs        ouvre tous les jeux dans Chromium, vérifie 0 erreur JS
scripts/import-assets.mjs  (re)télécharge et trie les packs Kenney
```

**Les imagiers sont en PHOTOS, et rien qu'en photos** (12/09) : l'Intrus,
Memory, la Chasse aux lettres, le Marché — et depuis le 22/09 les animaux
des continents du Tour du Monde. 76 sujets dans
`public/assets/photos/*.jpg`, réunis par `scripts/import-photos.mjs` —
**animaux : iNaturalist** (recherche par taxon latin), **le reste : catégories
de Wikimedia Commons** — tous ramenés au même moule (carré, 512 px) à l'import.
`photoImg(nom, px)` et `hasPhoto(nom)` sont dans `core/sprites.ts`, les crédits
dans `photos/CREDITS.json` et `public/assets/CREDITS.md`. L'app est privée et
sans usage commercial : les licences CC BY-NC sont acceptées, et créditées.
**Règle du père : jamais deux styles.** Ce qui est PION ou DÉCOR (Simon,
Puissance 4, la Boîte à rythme, l'image du Taquin) est fait des personnages
3D de la ferme (`core/critters.ts`), rendus en images par `core/portraits.ts` :
`critterPortraits(['cow','hen'], px)` renvoie des dataURL (cache, un contexte
WebGL jetable), `portraitImg(url, px)` les insère, `farmScene(kinds, px)` rend
un pré 3D entier. **Leurs princesses** (27/09) suivent la même règle :
construites dans `core/princess3d.ts` à partir d'une `Royal`
(`core/royal.ts`), en vraie 3D dans la Princesse, en images
(`princessPortraits(looks, poses, px)`, une ou deux côte à côte) sur l'écran
de fin, en promenade sur l'accueil et en tampons dans l'Atelier. Le store
garde trois princesses (`royals.solo`, `.jade`, `.joyce`) ; `familyLooks()`
donne celles à montrer (les deux sœurs dès qu'elles ont gardé la leur). Pour ajouter un mot : une ligne dans
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
affiche trois boutons sans un mot — fleur (douce), éclair (normale), flamme
(expert) — et ne monte le jeu qu'après le choix, qui alimente `ctx.tier` et
`ctx.byTier`. Le dernier niveau joué est retenu par jeu (`ferme:niveau:<id>`)
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
jamais d'emoji — et **les tuiles de l'accueil ont leur vignette dessinée**
dans `core/badges.ts` (`BADGE[id]`, `viewBox 0 0 48 48`, formes pleines,
palette de `global.css`). Un jeu sans entrée retombe sur son emoji : ajouter
la vignette en même temps que le jeu.

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
là, jamais un `tone()` — le coq, la chèvre, le cheval et le chat attendent
encore leur personnage 3D.
Modèles : `icetower.ts` et, en 2D, `ninja.ts` (un canvas, les fruits Canva,
ombres et lueurs précalculées une fois par image, vagues puis pluie finale).
Poussin Volant et Tape-Trous sont sortis le 27/09 (« vire-les »), avec
`core/runner.ts` (le socle des jeux qui défilent). Pour un jeu Apprendre
en 3D sans arcade, `geo.ts` (globe NASA, données Natural Earth/IGN dans
`public/assets/geo/`, voix = noms de lieux uniquement).

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
`stage.timeScale` fait les ralentis d'outro. Un jeu qui a son propre rendu
(l'Espace : ciel à part, cible HDR, halo en sept étages, ACES écrit à la main)
le branche sur `stage.render` et réalloue ses cibles dans `stage.onResize` :
la pause, le redimensionnement, `?fps` et le nettoyage restent ceux du socle.

Jeux déjà en vraie 3D : `pizza` · `space` · `icetower` ·
`caterpillar` · `dressup` ·
`memory` · `maze` (logique de grille inchangée, rendu en haies 3D). La Course,
le Stand 3D et Attrape sont sortis le 24/09 (« éclatée », « on enlève ») ; le Ninja est repassé en 2D le même jour
(« les fruits trop grossiers, c'est confus »). La Chenille et Poussin Volant
ont fait l'aller-retour le 25/09 : leurs versions 2D illustrées ont été
retirées le soir même — « mille fois moins bien que la version isométrique
hyper mignonne », « de la 2D saccadée et pixelisée sur une surface
minuscule » ; les 3D du 23/09 sont revenues telles quelles. **Un jeu en vraie
3D ne redescend pas en 2D.** Pour
un jeu de physique rigide (cannon-es) sur le socle, `icetower.ts` est le
modèle : `loadPhysics()`, `fixedStep` autour de `world.step`, corps figé avec
`mass = 0`.

---

## Pièges déjà payés 🪤

| Piège | Détail |
|---|---|
| **cannon-es : corps figé** | `body.type = STATIC` ne suffit pas, `invMass` reste fini. Mettre `body.mass = 0` **avant** `updateMassProperties()`. |
| **matter.js `isStatic`** | Même famille : créer **dynamique puis** `Body.setStatic(b, true)`, sinon positions `NaN`. |
| **Sphère sur sphère** | Empiler des sphères en physique pure finit toujours par rouler. Verrouiller x/z pendant la chute (vécu dans le Bonhomme de neige, sorti le 28/09). |
| **Blocs sur une coupole** | Des cubes tangents à une sphère donnent une boîte. Découper les blocs **dans** la sphère (`SphereGeometry` + `phiStart`/`thetaStart`). |
| **Planètes côté nuit** | Une seule lumière ponctuelle = premier plan en ombre totale. Ajouter une directionnelle faible recollée sur la caméra. |
| **Nettoyage GPU** | Disposer géométries, matériaux, **toutes** les textures et le renderer au démontage, sinon fuite à chaque partie. |
| **`zustand/persist` muet** | Quota dépassé → `setItem` lève, persist avale l'exception, plus rien n'est enregistré en silence. D'où `loudStorage` dans `core/backup.ts`. |
| **Horloge murale vs simulée** | Ne jamais tester la fin d'une action physique avec `performance.now()` si la physique tourne à pas fixe : accumuler un `simMs`. |
| **`preventDefault` global** | Un anti-double-tap sur `touchend` avale un clic sur deux. Utiliser `touch-action: manipulation` en CSS. |
| **CSS transform vs SVG** | Une animation CSS `transform` écrase l'attribut `transform="translate(…)"` d'un `<g>`. |
| **AudioContext unique** | `getCtx()` de `core/audio.ts` est partagé sons + musique. Ne pas créer un second contexte. |
| **Le premier son après un silence** | Après quelques dizaines de secondes sans un son, Chrome met la sortie audio en veille et ne la rallume qu'au son suivant : sur la tablette, près d'une seconde de retard (la note des onglets de l'accueil, 28/09). `wakeAudio()` (appelé au `pointerdown` dans `App.tsx`) réveille le contexte et garde un souffle inaudible mais non nul tant que le son est permis et l'app au premier plan. Et `tone()` passe par `getCtx()`, qui relance un contexte suspendu. |
| **PWA : la maj qui recharge en pleine partie** | En `registerType: 'autoUpdate'`, le service worker recharge la page DÈS que la nouvelle version est installée — quelques secondes après l'ouverture, donc en plein jeu si on a lancé une partie tout de suite (« ça crashe à la première ouverture du Potager, ensuite ça marche », 25/09) ; et `onNeedRefresh` n'est jamais appelé dans ce mode. Depuis : `registerType: 'prompt'`, et `src/main.tsx` applique la maj sur l'accueil (tout de suite, ou au retour de la partie : `body.playing` observé). Vérifié en vrai navigateur avec deux builds servis l'un après l'autre. |
| **Animal « posé sur » un trou** | En DOM : un sprite au-dessus d'une ellipse sombre ne sort pas du trou, il est planté devant ; il faut trois couches (terrier, sprite dans un conteneur `overflow:hidden`, bourrelet par-dessus). En 3D, même piège avec un `Sprite` face caméra : incliné vers la caméra, il flotte DEVANT le trou. Utiliser `standeeFromAtlas` (panneau vertical, origine aux pieds, `faceCamera` sur Y seulement) : le sol cache ce qui est dessous, et l'étirement part des pieds. Depuis le 15/09 Tape-Trous n'utilise plus de panneau du tout : ses habitants sont des **personnages construits en 3D** (`core/critters.ts`, origine aux pieds aussi), et la pastille ronde de la planche Kenney est sortie — « un sprite atroce digne d'un Minitel » (les filles). `standeeFromAtlas` est parti avec les planches le 22/09. |
| **Noms de jeux en double** | Le nom de fichier est la mécanique (`battleship.ts`), le nom affiché est le thème pour les filles (« Cache-Cache Pré »). Vérifier les collisions de nom ET d'icône avant d'en rebaptiser un. |
| **Banques d'images : la recherche plein texte ment** | Openverse répond « champ de coquelicots » pour *orange* et « des gens dans un festival » pour *oignon*. Passer par ce qui est RANGÉ par des humains : iNaturalist par taxon latin (`Bos taurus`, jamais « cow »), et les catégories Commons (`Category:Carrots`). Et regarder la planche-contact avant de committer : sur 68 photos, sept étaient à refaire (l'ours noir sur fond noir, le « lion » qui était un léopard). |
| **Wikimedia compte par adresse IP** | Le proxy de la session est partagé : au-delà d'une poignée de requêtes par seconde, tout répond 429 pendant plusieurs minutes. `import-photos.mjs` a une file d'attente par hôte et un recul jusqu'à 2 min ; la collecte complète prend une demi-heure et ne se lance qu'à la main. Les vignettes ne se demandent plus qu'aux tailles standard (960, 1280, 1920, 3840 px de large) : une autre largeur est servie à la taille standard au-dessus, ou refusée en 429. Les cartes « USGS map » de Commons sont des planches imprimées (texte, projections polaires), pas des cartes à plaquer : prendre les cartes 2:1 (Askaniy, « for GeoHacks »). |
| **`const file` qui masque `file()`** | Une variable locale du même nom qu'une fonction du module met celle-ci dans sa zone morte : l'appel lève, et un `catch` vide avale tout. 70 mots ont ramené « 0 proposition » sans un seul message d'erreur. Jamais de `catch {}` muet dans un script d'import. |
| **Classes de la coquille : `.hint`, `.chip`, `.badge`…** | `global.css` a des classes courtes et globales (`.hint` est en `position:absolute`). Une classe de jeu nommée pareil est happée : le tampon « en lueur » de la Poste s'est retrouvé dans le coin de l'arène, large de 1340 px. Toujours préfixer les classes d'un jeu (`.po-`, `.nj-`, `.mz-`). |
| **Glissé écouté sur chaque bouton** | Un `pointermove` posé sur chaque tampon fait lever le tampon VOISIN quand le doigt le survole (deux fantômes à l'écran). Le glissé s'écoute sur `window`, avec un seul objet « en main », retiré au démontage. |
| **Plein écran redemandé à chaque toucher** | Depuis le 12/09, `enterFullscreen()` partait sur chaque `pointerdown` en jeu. Quand Android refuse (PWA en `standalone`), la demande repart à CHAQUE toucher, et un `requestFullscreen` en plein geste l'annule (`pointercancel`) : le Ninja ne tranchait plus, le poussin du Labyrinthe sautait de case en case. On reprend le plein écran en **fin** de geste (`pointerup`), au plus une fois toutes les 3 s. Ne jamais lancer d'API à permission (plein écran, orientation, vibration) au début d'un geste de jeu. |
| **Transition CSS entre deux cases** | Un `transition: left/top` sur le pion d'une grille le fait glisser EN LIGNE DROITE d'une case à l'autre : si deux gestes s'enchaînent, la trajectoire coupe le coin, à travers le mur — le « passe-muraille » du Labyrinthe. Le pion garde une file de cases à parcourir, et un minuteur de partie (`ctx.every`) l'avance case par case ; la transition CSS ne sert plus qu'aux effets qui n'ont pas de mur à respecter. |
| **Arène redimensionnée sans la fenêtre** | Une barre d'outils qui se replie agrandit l'arène : le canvas WebGL, lui, ne bougeait pas et laissait une bande noire (vécu sur la Pizzeria). `createStage` observe maintenant l'arène (`ResizeObserver`) en plus de `resize`. |
| **Modèle du kit Food mal nommé** | `cheese-cut.glb` n'est pas un morceau de fromage : c'est une meule **avec son couteau** (manche bleu). Regarder le modèle avant de le cloner cent fois sur une pizza. |
| **Mesure faussée par le service worker** | Une maj de la PWA recharge la page (sur l'accueil depuis le 25/09) — en plein test Playwright, on mesurait alors l'ACCUEIL et pas le jeu (une luminosité relevée à 210/255 au lieu de 68). Toujours ouvrir le contexte avec `serviceWorkers: 'block'`. |
| **Relire un canvas WebGL** | `preserveDrawingBuffer` est désactivé : `drawImage(canvas)` renvoie du noir. Pour mesurer un rendu, capturer l'élément avec Playwright et décoder le PNG **hors du navigateur**. |
| **`Color.setHSL` linéaire** | three.js interprète `setHSL` dans l'espace de travail **linéaire** : une clarté de 0.45 ressort crème pastel à l'écran. Passer `T.SRGBColorSpace` en 4ᵉ argument (les hexadécimaux, eux, sont convertis automatiquement). |
| **Couleurs vives + ACES** | Un matériau clair sous hemi+soleil+IBL cumule plus de 2× sa luminance : l'ACES l'écrase en blanc. Choisir des couleurs de matériaux **sombres** (la lumière les remonte), jamais l'inverse. |
| **Smoke test = grille de l'accueil** | `scripts/smoke.mjs` et `scripts/play.mjs` touchent l'onglet de l'univers (`.hm-tab[data-w]`, un univers affiché à la fois depuis le 23/09), puis la tuile `.gc` (nom dans `.nm`), puis — jeu `ops` — la flèche des opérations (`.opsgo`, étiquettes `.opsbtn[data-op]`), puis le niveau (`.tierbtn.tier-easy`). Si tu changes l'accueil ou le sélecteur de niveau, mets-les à jour. |
| **État de jeu en singleton de module** | `let x: any = null` + `setTimeout` qui relit `x` : si on quitte et relance en moins d'une seconde, le vieux timer pilote la nouvelle partie (crash vécu dans `piano.ts`). Capturer l'état dans une constante locale et tester `x === me` — ou attendre le jeton de partie de la phase 1. |
| **Bot sur une valeur périmée** | Un crochet de test (`__towerX`) qui n'est écrit que quand l'objet existe garde sa dernière valeur : le bot de la Tour cliquait « au centre » pendant la chute du bloc précédent, un bloc sur trois manquait, trois déploiements ont échoué sans qu'on le voie. Écrire `NaN` quand il n'y a rien à piloter, et faire attendre le bot sur le score plutôt que sur une durée murale. |
| **Bot qui sonde avant l'accroche** | `openGame` attendait 3,2 s à plat, puis le bot de la Course lisait `window.__run` : un jeu 3D n'installe son accroche qu'APRÈS ses modèles, et sur le serveur d'intégration (plus lent que la session) elle n'était pas là — première sonde à `null`, « partie terminée avant 60 m », déploiement bloqué alors que tout passait ici. Un bot attend son accroche (`openGame(nom, '__run')` → `waitForFunction`) ou la disparition de `.nj-loading`, jamais une durée murale. |
| **Bots à 4 fps** | Sous swiftshader la 3D rend 3 à 4 images/s et `dt` est borné à 100 ms : la simulation tourne au ralenti et une entrée n'est appliquée qu'à la frame suivante. Un bot qui sonde toutes les 60 ms voit le même état plusieurs fois et double ses commandes. Sonder **une fois par frame** (`evaluate` qui résout dans un `requestAnimationFrame`), anticiper d'une frame, et compter en temps simulé (mètres, pas secondes murales). Une capture d'écran prend 1,5 s : lancée après la mort, elle rate l'outro — la déclencher juste avant. |
| **Queue de son en `setTimeout`** | Un `tone()` programmé 60 ms plus tard par `setTimeout` joue APRÈS le retour au menu, et dérive sous la charge. `tone()`, `sPopReal()`, `sBoomReal()` et `noiseBurst()` prennent un **délai en secondes** programmé sur l'horloge audio : plus aucun timer pour un son. Depuis le 10/09, **aucun `setTimeout` ne subsiste dans `src/games/`** — état de jeu = `ctx.after`/`game.after`, son = délai audio. |
| **Les yeux dans la tête** | Un œil de personnage placé au centre d'une sphère de tête plus grande que lui est NOYÉ : le lapin de Tape-Trous n'a pas eu de regard pendant une semaine. Placer l'œil à la surface (distance ≈ rayon de la tête) et regarder un portrait (`critterPortraits`) avant de valider. |
| **La planche-contact ne ment pas** | 22/09, recherche iNaturalist par taxon : sur 5 « bisons », 4 antilopes ; sur 5 « tigres », un léopard, une lionne, un jaguar et une panthère — les observations sont identifiées au genre ou à la famille. Toujours regarder avant `garder`. |
| **`import-assets.mjs` et CREDITS.md** | Le script réécrivait TOUT `public/assets/CREDITS.md` : relancé, il effaçait les crédits des photos et de l'Espace. Il ne remplace plus que sa section (jusqu'au premier `## `). |
| **`pkill -f` qui se tue lui-même** | `pkill -f "vite preview"` dans une commande qui relance aussi `vite preview` tue le shell qui l'exécute (la ligne de commande contient le motif). Arrêter le serveur dans une commande à part. |
| **Deux doigts, une seule lame** | Le Ninja gardait UN « dernier point » : un second doigt le faisait sauter d'un bout de l'écran à l'autre, et le segment tranchait tout entre les deux. Tout geste de glissé se suit **par `pointerId`** (une `Map`), même dans un jeu pensé pour un doigt. |
| **Chalet Kenney en pièces** | Les pièces `cabin-*` du kit Holiday tiennent dans une case de 1 : un mur est posé sur le bord +z de sa case (on le tourne pour les autres bords), le coin est au coin (−x, +z), le toit et le pignon sont des DEMI-pièces dont le faîtage est en x = −0,5 — le côté gauche est la même pièce tournée de π (toit) ou en miroir `scale.x = −1` (pignon). Voir `cabin()` dans `core/winter.ts`. |
| **Secteur de disque retourné** | Un `CircleGeometry(r, n, a0, da)` tourné de −π/2 sur X couvre les angles monde a0…a0+da ; tourné de **+π/2** (pour faire un dessous), il couvre −a0−da…−a0 : le dessous d'une part de pizza se retrouvait SOUS LA PART VOISINE, et la recouvrait dès qu'on la soulevait. Prendre `thetaStart = −a0 − da` pour la face retournée. |
| **Répondre pendant une animation** | Dans le Potager, la rangée des nombres s'écrit case par case (`ctx.after`) : une réponse donnée avant la fin laissait des nombres apparaître APRÈS la bonne réponse. Tout ce qui répond (`success`, `showMiss`) change d'abord le jeton de question (`me.gen++`), et chaque rappel vérifie ce jeton. |
| **Bot qui gagne par chance** | Le premier bot du Poussin 2D (retiré depuis) (seuil fixe : taper si `y + vy·0,08 < cible − 0,07`) est passé trois fois dans la session, puis a bloqué le déploiement (« arrivé avec 3 cœurs sur 5 »). Simulé hors navigateur sur 3 000 parties : il perdait 2 cœurs ou plus une fois sur trois — les passages sont tirés au hasard. Un pilote de jeu à hasard se valide par une **simulation de la même physique en Node, sur des milliers de parties et plusieurs cadences** (60 i/s, 20 i/s, saccadé), pas par un passage réussi. `THROTTLE=4 npm run test:play` ralentit le processeur comme sur le serveur d'intégration. |
| **Maquette validée ≠ jeu validé** | La Chenille et le Poussin 2D avaient eu un « go » sur leurs maquettes (images fixes), puis ont été retirés le soir même, joués : le pas de case en case paraît SACCADÉ quand la 3D glissait en continu, des illustrations de 256 px agrandies plein écran sont PIXELISÉES, et une feuille entourée de marges (HUD en haut, semaine en bas) laisse une surface de jeu MINUSCULE. Avant de remplacer le rendu d'un jeu qui plaît, comparer les deux EN MOUVEMENT, à la taille de la tablette, côte à côte — et dire au père ce qu'on perd. |
| **Le doigt qui pilote tout seul** | Le Labyrinthe rejoignait la case sous le doigt par une recherche de chemin jusqu'à six cases (15/09, pour qu'un doigt rapide « ne décroche plus ») : le poussin prenait les virages tout seul, et le labyrinthe se jouait sans réfléchir (« il fait tout seul les virages », 27/09). Une aide qui fait le geste à la place de l'enfant retire le jeu : le poussin avance en ligne droite vers le doigt et cogne ; c'est au doigt de tourner. |
| **Un tiroir qui se referme avale le doigt** | Un panneau qu'on cache en fondu (`opacity` + `visibility` retardée) reçoit ENCORE les touchers pendant sa transition : le premier trait après avoir choisi un pinceau tombait sur le tiroir (vécu dans l'Atelier, 27/09). `pointer-events:none` sur l'état fermé, tout de suite. |
| **Bouton qui bouge, test qui attend** | Playwright attend qu'un élément soit « stable » avant de cliquer : sur un bouton animé en boucle (la poubelle armée qui se dandine), le clic part des secondes plus tard — après le désarmement. Au doigt ça marche ; dans un bot, `click({ force: true })`. |
| **VRM : cheveux qui s'envolent** | Les ressorts (`springBoneManager`) sont calculés dans le monde : déplacer la princesse d'un coup (placement, duo) ou la tourner au doigt fait voler ses cheveux à l'horizontale. `joint.center = obj` (le groupe de la princesse) : ils ne réagissent plus qu'à ses gestes à elle. Trois autres causes, mesurées une à une sur les pointes des mèches : ses matrices pas encore à jour quand les ressorts calculent (placée juste avant, ses mèches sautaient au-dessus de sa tête pendant 25 images) → `obj.updateWorldMatrix(true, true)` avant ; un pas de 0,1 s (à-coup, tests à 4 i/s) → les ressorts avancent par pas de 1/60 s ; une mèche allongée tout droit vers le bas traverse son dos et ses collisions la rejettent → on allonge en gardant l'écart naturel. Après avoir changé la longueur des chaînes : `setInitState()` puis `reset()`. |
| **VRM : ce que les noms ne disent pas** | Ses os d'yeux sont près du nez (± 1,7 cm) : le centre des yeux se mesure sur le maillage des iris. Les deux iris partagent LE MÊME dessin dans la texture (un seul cœur à peindre). `HairBack` n'est que l'arrière du crâne : les longues mèches sont dans `Hair_00` — pour une coiffure attachée, on replie leurs chaînes d'os sur leur racine. Une texture recopiée dans un canvas garde le `flipY` (false) de la texture glTF, sinon elle s'affiche à l'envers. |
| **Habit lié à un squelette** | Un habit construit (corsage, manches, bottes) suit les gestes si on lui recopie les poids du sommet du corps le plus proche (`skinned()` dans `princess3d.ts`), la géométrie ramenée dans l'espace de liaison (os × inverse de liaison × `bindMatrix`, inversé). Le toucher (`raycast`) d'un `SkinnedMesh` passe d'abord par une sphère englobante calculée UNE fois : on l'agrandit, sinon une manche levée ne se touche plus. |
| **Plan proche qui suit les astres** | Dans l'Espace, `camera.near` suit la distance du plus proche astre (jusqu'à 20 unités loin de tout) pour garder la précision de profondeur sur 1e5 : la fusée, à 2 unités devant la caméra pendant le vol, était COUPÉE — invisible, sans un message. Tout objet de premier plan compte dans le calcul du plan proche. |
| **Textures des `ShaderMaterial`** | `disposeTree` libère les cartes des matériaux standard (`map`, `normalMap`…), pas les textures rangées dans `uniforms` : chacune passe par `stage.keep()`, comme les cibles de rendu et le bruit 3D. |
| **Attendre à chaque image sous charge** | `waitForFunction` sonde par défaut à chaque image : quand la page compile ses shaders ou calcule des vignettes 3D, les images s'espacent de plusieurs secondes et le bot rate un état pourtant atteint (la Princesse « jamais prête » alors qu'elle l'était en 60 s). Sonder par intervalle (`polling: 1000`), et cliquer en force quand la page est prise. |
| **Ports « interdits » de fetch** | `fetch()` de Node refuse le port 4190 (liste des bad ports). Les scripts de vérification utilisent 4188/4189 ; ne pas prendre 4190 ni 6000. |

---

## Méthode de travail

1. `npm run build` (inclut `tsc -b`, **strict**) · `npm run lint` · `npm test`.
2. **Toujours vérifier dans un vrai navigateur** avec Playwright :
   `nohup npx vite preview --port 4188 --strictPort &`, puis un script
   `.verify-*.mjs` en racine. Chromium : `/opt/pw-browsers/chromium`.
   Pour la 3D : `args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']`.
3. **Regarder les captures d'écran.** Ne jamais conclure « ça marche » sur des
   logs : les trois pires bugs de la 3D étaient invisibles dans la console.
4. `npm run test:smoke` avant tout commit — il **bloque le déploiement** en CI.
   `npm run test:play` fait jouer **un bot par jeu** (28/09 : 28 scénarios, le Potager en a quatre ; `BOTS=poste,potager` pour n'en lancer que quelques-uns) jusqu'à
   son écran de fin ; un nouveau jeu arrive avec son bot et son accroche
   `window.__xx` (posée seulement si `window.__BOT`).
5. Supprimer les scripts `.verify-*.mjs` avant de committer (ils sont dans
   `.gitignore` et ignorés par ESLint, par sécurité).
6. Sur la vraie tablette, `?fps` dans l'adresse allume la sonde d'images par
   seconde (reste allumée, `?fps=0` l'éteint) : mesurer AVANT de toucher aux
   ombres, au `pixelRatio` ou aux particules.

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
- CI : `npm ci` → `npm run build` → `npm run test:smoke` → `test:play` → Pages.
  Si un run est annulé, le relancer à la main : `workflow_dispatch` sur `main`.
  Si le déploiement est refusé par l'environnement `github-pages`, c'est sa
  règle de branches (Settings → Environments → github-pages) qui n'accepte
  pas encore `main`.
