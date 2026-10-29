# CLAUDE.md — La Ferme Magique

Webapp PWA de jeux pour **Jade (6 ans)** et **Joyce (8 ans)**, sur tablette
(**Samsung Galaxy Tab A9+** : Snapdragon 695, Adreno 619, 1920×1200 — GPU
milieu de gamme, `pixelRatio` ≤ 1,5, pas de bloom ni de réfraction sans mesure).
Commanditaire : le père. Il veut un **niveau professionnel** — des vrais jeux,
pas un catalogue de mini-jeux. **Il valide le plan avant tout chantier lourd.**

**Répartition des documents — ne rien dupliquer d'un fichier à l'autre :**
`CLAUDE.md` = les règles et conventions (ce fichier) · `PIEGES.md` = les
bugs déjà payés et leur parade (à lire par domaine, pas en entier) ·
`ROADMAP.md` = où on en est, ce qui reste, ce qui a été refusé ou sorti ·
`AUDIT.md` = l'état des lieux du 2/09 · `README.md` = présentation de l'app.
L'histoire de chaque jeu est dans l'en-tête de son fichier et dans `git log`.

---

## Règles non négociables ❌

1. **Aucune mécanique d'addiction.** Ne jamais ajouter, quoi qu'en suggère la
   « bonne pratique » du jeu mobile : monnaie, boutique, coffres, énergie, vies
   qui se rechargent · paliers de déblocage, arbre de progression, saisons,
   événements limités · séries quotidiennes, notifications de rappel, « reviens
   demain » · classements ou comparaison entre les deux sœurs · publicité,
   achats intégrés, analytique tiers, compte en ligne pour les enfants. Les
   étoiles sont un simple retour de fin de partie : rien ne s'accumule (seule
   la meilleure note par jeu reste, sous sa tuile).
2. **Aucune lecture requise.** 6 ans = ne lit pas couramment. Icônes, sons
   distincts, démonstration visuelle. `core/voice.ts` ne lit que le **contenu
   pédagogique** (multiplications, heures, noms de lieux), **jamais les
   consignes**. Corollaire : dans Apprendre, **aucune sanction** (ni vies, ni
   chrono, ni bonus de vitesse) ; dans Créer, **aucune note** sur une création.
3. **Pas de collecte de données enfants.** Photos et voix restent locales.
   Aucun analytique tiers. **Deux exceptions, choisies par le père : Devine
   mon dessin (8/10) et Mon dessin prend vie (18/10, la Ferme à construire)**
   envoient le DESSIN (réduit, sans prénom, sans voix ni photo) à Claude,
   l'IA d'Anthropic, qui l'efface sous 30 jours et ne s'en sert pas pour
   s'entraîner — par NOTRE Worker (`worker/devine.ts`, `worker/vivant.ts`),
   avec la clé API du père, un secret du Worker Cloudflare
   (`ANTHROPIC_API_KEY`) : jamais dans l'app, ni sur la tablette, ni dans le
   dépôt. Rien d'autre ne part, nulle part.
4. **Français uniquement** : textes, commentaires de code, messages de commit.
   Et on se tutoie.

**Le hors-ligne n'est PAS une contrainte** (25/07) : la PWA sert à installer
l'app sur l'écran d'accueil, le poids du précache n'est pas un critère, ni le
temps de démarrage (28/07). Ce qui compte, c'est la **qualité une fois en
jeu** — design, physique, jouabilité.

**Règle d'arbitrage** : entre « ajouter un jeu » et « amener un jeu existant au
niveau des jeux 3D », **toujours la seconde option** — sauf quand le père
demande un jeu. **Un jeu par itération**, plein écran, avec enjeu, rampe liée
à la performance, near-miss et outro (les huit manques communs : `AUDIT.md` §4).

---

## Architecture

```
src/core/       le socle partagé (un module = une responsabilité) ↓
src/components/ Home (accueil) · GameHost (coquille d'un jeu) · PlayTimer
                (minuteur parental) · VoiceStudio · Ambient (le pré de l'accueil)
src/games/      un fichier par jeu + index.ts (le catalogue et les trois univers)
worker/         le Worker Cloudflare qui sert l'app (wrangler.jsonc) : index.ts
                (routes) · access.ts + access-page.ts (le code d'accès, cookie
                signé) · devine.ts (l'appel à Claude, partagé) · vivant.ts ·
                headers.ts · worker.test.ts
public/assets/  modèles Kenney, photos des imagiers, sons, affiches, CREDITS.md
scripts/        smoke.mjs (tous les jeux s'ouvrent) · play.mjs (un bot par jeu)
                · touched.mjs (quels bots lancer) · posters.mjs (les affiches)
                · import-assets.mjs (Kenney) · import-photos.mjs (imagiers)
```

**Le socle (`src/core/`)** — lire le module avant d'y toucher :

| Module | Ce qu'il fait |
|---|---|
| `types.ts` | le contrat `GameDef` / `GameContext` |
| `store.ts` + `save.ts` | la sauvegarde de la famille (zustand + persist) ; sa forme, sa relecture et la conversion des anciennes, testées |
| `backup.ts` | la clé de sauvegarde et le stockage qui prévient quand c'est plein |
| `session.ts` | la pause globale et les timers de partie |
| `three3d.ts` | **le socle 3D**, à lire avant tout jeu 3D (stage, chargement, qualité adaptative) |
| `scene3d.ts` | sol, décor glTF, particules GPU, secousse, projection monde → écran |
| `arcade.ts` | session d'un jeu d'adresse : score, vies, combo, rampe, HUD, outro |
| `impact.ts` · `juice.ts` · `fx.ts` | le feel des chocs, l'iris, les confettis |
| `audio.ts` · `sfx.ts` · `music.ts` | sons synthétiques, échantillons Kenney + vraies voix des animaux (`cry`), musique générative (`playNote` pour une partition écrite) |
| `voice.ts` · `voicefx.ts` · `mic.ts` | la voix (contenu seulement), la voix rigolote, le micro ouvert à la demande et coupé pour de bon |
| `hand.ts` | la main qui montre le geste de chaque jeu |
| `badges.ts` · `icons.ts` · `posters.ts` | vignettes dessinées, icônes SVG, liste des affiches (écrite par `posters.mjs`) |
| `imagier.ts` | **l'imagier** (29/10) : chaque photo, son mot, son thème, son niveau d'orthographe (Chasse aux lettres) et de dessin (Devine mon dessin) ; le Memory en tire ses thèmes — testé (chaque photo existe et est créditée) |
| `sprites.ts` · `portraits.ts` · `pictures.ts` · `lineart.ts` · `diskcache.ts` | photos des imagiers ; personnages 3D rendus en images ; images du Puzzle ; pages à colorier ; cache sur le disque |
| `critters.ts` · `doll3d.ts` + `character.ts` | les animaux de la ferme en formes rondes (`FARM`, `FARM_MORE`) ; la petite fille d'Habille-toi et son look |
| `farm3d.ts` | la ferme en diorama (Cache-Cache, la Ferme à construire, les Différences, le Tracteur, Soleil) : cachettes, places, pièces, carte ×4, l'épouvantail |
| `mine.ts` | **une création par fille** (Ferme à construire, Mon cartable, Monuments, Poterie, Château de sable, Aquarium) : les cartes Jade / Joyce, la photo, le coffre `ferme:<jeu>:<qui>`, « Changer », la poubelle à deux touchers (`twoTaps`), `calm` contre le double toucher — testé |
| `touchcam.ts` | les doigts sur une scène 3D : `Fingers` (chaque doigt par son `pointerId`, le doigt qui reste après deux ne fait rien), `Spinner` (tourner avec élan) — testé |
| `labyrinth.ts` | le générateur de labyrinthes, leur chemin et leurs distances (Labyrinthe, Labyrinthe à bille) |
| `soleil.ts` · `differences.ts` · `bille.ts` | la course de 1, 2, 3… Soleil ! ; le tirage d'une manche des Différences ; le plateau et la physique de la bille (pas fixe) — testés |
| `tracteur.ts` · `geoplan.ts` | le pré quadrillé et le programme du Tracteur ; les figures du Géoplan — testés |
| `pottery.ts` + `pottery3d.ts` · `sand.ts` + `beach3d.ts` · `fishtank.ts` + `aquarium3d.ts` | la Poterie, le Château de sable, l'Aquarium : la logique (testée) et la scène |
| `facts.ts` | la mémoire d'Apprendre : celle des calculs du Potager (aides, révisions espacées, « presque ») et, depuis le 27/10, les séries sans remise de l'Horloge, du Tour du Monde, des Lettres et du Marché (`recall(jeu)`, `ferme:memoire:<jeu>` ; un raté revient trois questions plus loin) — testé |
| `plants.ts` | les dix plantes illustrées du Potager |
| `cosmos.ts` · `rocket3d.ts` | le système solaire de l'Espace (rendu HDR à part) et sa fusée |
| `winter.ts` | le paysage d'hiver de la Tour de Glace, l'heure qui suit la hauteur |
| `pinball.ts` | la physique du Flipper (pas fixe 1/480 s, pilote automatique) — testé |
| `barn3d.ts` · `train3d.ts` | la grange et sa chorale (le Chœur) ; le petit train (Suites logiques) |
| `jigsaw.ts` | les découpes du Puzzle — testé |
| `hama3d.ts` · `perles.ts` · `bijoux3d.ts` | perles à repasser (plaque, fusion, fer) ; leurs dessins, manches et créations — testé ; les perles des Bijoux |
| `money3d.ts` | les pièces et billets du Marché |
| `cake3d.ts` | le gâteau de la Cuisine (étages, nappage, bouchée — testé) |
| `satchel3d.ts` | le cartable de Mon cartable (paillettes réversibles) |
| `monuments3d.ts` | les huit monuments en pièces à poser |
| `plush.ts` + `plush3d.ts` · `vivant.ts` | un dessin gonflé en peluche — testé ; ce que Claude dit de l'animal dessiné |
| `drawguess.ts` | le devineur de Devine mon dessin (fiche imposée, revérifiée) — testé |
| `atelierdb.ts` | l'IndexedDB de l'Atelier (dessins, coloriages) |
| `fps.ts` | la sonde `?fps` pour la tablette |

**Les imagiers sont en PHOTOS, et rien qu'en photos** (12/09) : 324 sujets
depuis le 29/10 (Joyce : « toujours les mêmes mots »),
dans `public/assets/photos/*.jpg` (animaux : iNaturalist ; l'espace : NASA ;
le reste : Wikimedia Commons), carrés de 512 px, crédités dans
`photos/CREDITS.json` et `public/assets/CREDITS.md` (licences CC BY-NC
acceptées : app privée, sans usage commercial). La liste fait foi dans
`core/imagier.ts` ; `photoImg(nom, px)` dans `sprites.ts`. Ajouter un mot :
sa ligne dans `imagier.ts` ET dans `MORE` du script (`i:` taxon latin, `c:`
catégorie Commons, `n:` recherche NASA), `node scripts/import-photos.mjs
candidats <id>`, **regarder** la planche-contact, écrire `photos.picks.json`,
puis `… garder`.

**Règle du père : jamais deux styles.** Ce qui est PION ou DÉCOR est fait des
personnages 3D de la ferme (`critters.ts`), rendus en images par
`portraits.ts` pour les jeux en DOM (`critterPortraits`, `portraitImg`). La
petite fille d'Habille-toi suit la même règle (`dollPortraits` sur l'accueil,
l'écran de fin, les tampons de l'Atelier). Plus aucune planche 2D : Kenney
reste la source des modèles 3D (kits food, holiday, space, nature) et des
bruitages (`import-assets.mjs`, fichiers triés commités). Pas d'emoji dans
les jeux.

**Une illustration se commande, elle ne se dessine pas** (23/09) : refus nets
des modèles Kenney vus de près et des dessins SVG faits main. Ce qui marche :
une **planche générée d'un coup avec Canva** dans UN style (les plantes, puis
les fruits du Ninja avec la planche des plantes en image de référence),
découpée en WebP (texte de commande dans `CREDITS.md`). Canva ne télécharge
pas depuis la session : le père dépose le PNG dans son Google Drive, un
sous-agent le récupère par le connecteur Drive.

**La fluidité sur la tablette passe avant le réalisme** : un personnage lourd
(la princesse VRM, partie le 6/10) se mesure avec `?fps` AVANT d'être adopté.
Avant toute nouvelle direction visuelle : **des maquettes au format de la
tablette, montrées AVANT de coder**. Un jeu en vraie 3D ne redescend pas en
2D, sauf quand le père le demande.

---

## Le contrat d'un jeu

Volontairement minimal, c'est la force du projet :

```ts
export const monJeu: GameDef = {
  id: 'monJeu', name: 'Mon Jeu', icon: '🎯', sq: 'sq-sky',
  cat: 'action',   // reflexion | memoire | action | creatif
  music: 'fair',   // optionnel : thème de core/music.ts
  subtitle: '…',
  hand: root => …, // le geste à montrer maintenant, ou null
  mount(ctx) { /* … */ return () => { /* cleanup IDEMPOTENT */ } }
}
```
Puis **une ligne dans `src/games/index.ts`** (GAMES et un univers de WORLDS).

**`ctx`** (fourni par `GameHost`) : `root`, `tier`, `byTier(e,m,x)`, `duo`,
`ops`, `variant`, `finish()`, `toast()`, `say()`, et les **timers de partie**
`after(ms,fn)` / `every(ms,fn)` / `cancel(id)` / `alive()` (annulés au
démontage, suspendus en pause — jamais `setTimeout` pour piloter un jeu).
Personne n'est nommé : les messages de fin tutoient (« vous » à deux) et ne
citent jamais de prénom. `finish({ outroMs })` : le jeu reste monté ce
temps-là (ralenti, chute, caméra) avant le score. La **pause** est globale
(`session.ts` : onglet caché, minuteur parental, bouton pause) ; `createStage`
fige sa boucle dessus tout seul.

**L'ouverture d'un jeu** (`GameHost`, sans un mot à lire) :
- **la difficulté** : fleur (`easy`), éclair (`med`), flamme (`exp`), petit nom
  dessous (Facile · Moyen · Difficile), le dernier retenu (`ferme:niveau:<id>`)
  et bordé. Depuis le 30/09, tout est décalé d'un cran : la fleur joue l'ancien
  normal, la flamme est plus dure que tout ce qui existait — jamais de retour
  aux valeurs de l'ancienne fleur ;
- `noTier` : pas de niveau, le jeu démarre (ou une flèche après « seule / à
  deux ») ;
- `ops: true` (le Potager) : d'abord les étiquettes + − × ÷, plusieurs à la
  fois, le + par défaut, retenues (`ferme:ops:<id>`), `ctx.ops` ;
- `duo: true` (Ninja, Flipper) : « seule / à deux », `ctx.duo` = deux sœurs EN
  ÉQUIPE sur la même tablette, un seul score, jamais qui a fait quoi ;
- `variants` (la Cuisine : pizza ou gâteau ; le Memory : son thème) : de
  grandes images à la place de la flèche, `ctx.variant`, la dernière retenue
  (`ferme:variante:<id>`) ; le bouton de la barre et « Changer » à la fin
  rouvrent le choix. Un jeu à variantes ET à niveaux (le Memory, 29/10) :
  le thème, puis le niveau (sa vignette au-dessus ramène aux thèmes) ;
  « Niveau » va droit aux niveaux.

**La coquille en jeu** : `body.playing` met tout en **plein écran**, la barre
ronde (maison, niveau, son, pause, rejouer) flotte par-dessus sans texte, le
titre est un carton de 1,5 s. Un voile d'arène reste à `z-index` 7 au plus
(la barre est à 8). L'écran de fin : Rejouer, **Niveau** et Menu ; une
cérémonie par note (3 étoiles = fête, 1 = « Encore ! » sans confetti, Créer
sans étoiles) ; la petite fille d'Habille-toi saute de joie ou fait coucou.

**Chaque bouton de mode ou d'outil porte son petit nom dessous** (30/09) :
`<span class="tool-item">bouton<i class="tool-cap">Nom</i></span>` — la
pastille s'allume seule quand le bouton a `.sel` ou `.on`. Le symbole reste
le repère (une enfant de 6 ans ne lit pas).

**L'accueil** : trois onglets (Jouer / Apprendre / Créer, le dernier retenu
dans `ferme:univers`), une grille de tuiles qui sont des **AFFICHES** — le jeu
en train de se jouer (`public/assets/affiches/<id>.webp`, 4:3, prises par
`scripts/posters.mjs` avec une mise en scène par jeu, `STAGE`). Un nouveau jeu
arrive avec **sa vignette** (`BADGE[id]` de `badges.ts`, `viewBox 0 0 48 48`,
formes pleines : carton titre, chargement), **son affiche**
(`ONLY=<id> node scripts/posters.mjs`, puis REGARDER l'image) et **sa main**
(`hand`) : une fonction qui rend le geste à montrer selon la phase, ou `null`
quand le jeu n'attend rien. Ses cibles : un élément (`visible(root, sel)`), un
point d'écran (`toScreen` en 3D) ou une fraction de l'arène ; gestes `tap`,
`drag`, `slice`, `trace`, `taps`, `hold` (garder le doigt posé), `tilt`
(pencher la tablette) et `choose` (« l'un de ceux-là », sans
appuyer : **jamais la réponse dans Apprendre**). Elle vient à la première
partie, puis après 7 s sans toucher (15 s dans Créer) ; un toucher la chasse ;
`handNow()` la fait venir tout de suite quand le jeu attend un geste NOUVEAU.

**La sauvegarde** est celle de la famille (`save.ts`, depuis le 27/10 : le
choix de joueuse et la princesse sont sortis) : meilleure note par jeu, look
de la petite fille, collier et pendentif des Bijoux, vitrine des créations,
voix enregistrées, minuteur. Les créations « par fille » (la Ferme à
construire, Mon cartable, les Monuments, la Poterie, le Château de sable,
l'Aquarium : deux cartes Jade / Joyce à l'ouverture, avec la photo de leur
création) passent par `core/mine.ts`, sous les clés `ferme:<jeu>:<qui>` —
**ne jamais changer ces clés**, ni `owner` (la clé de l'Atelier). Les
images coûteuses à rendre (le pré de l'accueil, les portraits, les pièces,
les pages à colorier) sont gardées sur le disque (`diskcache.ts`).

---

## Faire un jeu

**Un jeu d'adresse part de `core/arcade.ts`** (score, vies, combo, rampe par
performance, timers simulés `game.after`, HUD en icônes, `game.flash()`,
`game.end()` avec `outroMs` ; le combo pilote `setMusicIntensity()` : à 3, 6
et 10 d'affilée la musique gagne une couche) et de `core/sfx.ts` pour les
gestes (`sfx('slice')`, `preloadSfx`). **Un animal qui « parle » prend sa vraie
voix** (`cry('vache')`, dix cris enregistrés choisis par le père), jamais un
`tone()`. Modèles : `icetower.ts` (3D, physique cannon-es) et `ninja.ts` (2D,
un canvas).

**Un jeu 3D part de `core/three3d.ts`** : `createStage()` (antialias,
`pixelRatio` plafonné, ACES, ombres douces, lumières, brouillard), `fixedStep()`
pour la physique, `loadThree()` / `loadPhysics()` + `loader(arena, gameId)`
pour le chargement à la demande, `stage.dispose()` pour le nettoyage GPU
(`stage.keep(tex)` pour les textures hors scène), `stage.timeScale` pour les
ralentis. Puis `core/scene3d.ts`. **La qualité s'adapte seule** dans la boucle
de `createStage` (plus de 30 ms par image → un cran toutes les 1,5 s : densité,
matériaux de luxe, ombres ; moins de 17 ms → elle remonte, jamais jusqu'à un
niveau trop lent) ; ni les 2 premières secondes, ni `?hq`, ni les bots ne sont
mesurés. Un travail PRÉVU qui ralentit se signale par `stage.settle()`. Un jeu
à rendu propre (l'Espace) se branche sur `stage.render` et `stage.onResize`.
Physique rigide : `loadPhysics()`, `fixedStep` autour de `world.step`, corps
figé avec `mass = 0` ; physique sur mesure et testée quand c'est plus sûr (le
Flipper).

**Un jeu Apprendre en 3D sans arcade** : `geo.ts` (globe NASA, données Natural
Earth/IGN dans `public/assets/geo/`, voix = noms de lieux uniquement).

---

## Pièges déjà payés 🪤 → `PIEGES.md`

Une soixantaine de bugs vécus, leur cause et leur parade. **Avant de toucher à
un domaine, lire sa ligne** — 3D et GPU, physique, toucher (deux doigts, glissé
sur `window`, plein écran, tiroir qui avale le doigt, voile au-dessus de la
barre), voix et sons, bots, scripts, PWA, imagiers. Et en ajouter une ligne
quand on en paie un nouveau.

---

## Méthode de travail

1. `npm run build` (inclut `tsc -b`, **strict**) · `npm run lint` · `npm test`.
2. **Toujours vérifier dans un vrai navigateur** avec Playwright :
   `nohup npx vite preview --port 4188 --strictPort &`, puis un script
   `.verify-*.mjs` en racine. Chromium : `/opt/pw-browsers/chromium`.
   Pour la 3D : `args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']`.
3. **Regarder les captures d'écran.** Ne jamais conclure « ça marche » sur des
   logs : les trois pires bugs de la 3D étaient invisibles dans la console.
4. **Avant chaque envoi sur `main`, dans la session** : le smoke ouvre TOUS les
   jeux (`npm run test:smoke`, chaque variante comprise), puis **seuls les
   bots des jeux touchés** jouent (`node scripts/touched.mjs origin/main` dit
   lesquels : un fichier d'un jeu, un module qui ne sert qu'à lui — sa table
   `OWN` — ou un scénario modifié de `play.mjs` ; un module commun → aucun
   bot). L'un ou l'autre en échec = pas d'envoi. `npm run test:play` : un bot
   par jeu jusqu'à son écran de fin (`BOTS=poste,potager` pour quelques-uns,
   `PORT=…` à côté d'un autre serveur). Un nouveau jeu arrive avec son bot, son
   accroche `window.__xx` (posée seulement si `window.__BOT`) et sa ligne dans
   `OWN`.
5. Supprimer les scripts `.verify-*.mjs` avant de committer (ils sont dans
   `.gitignore` et ignorés par ESLint, par sécurité).
6. Sur la vraie tablette, `?fps` dans l'adresse allume la sonde (reste
   allumée, `?fps=0` l'éteint) : mesurer AVANT de toucher aux ombres, au
   `pixelRatio` ou aux particules.
7. **L'économie** (2/10) : un seul agent à la fois quand il ouvre un
   navigateur (la 3D logicielle sature 4 cœurs) ; 3 ou 4 captures bien
   choisies ; un seul passage du bot du jeu touché pendant le travail ; le
   smoke complet et les bots des jeux touchés UNE fois, avant l'envoi ; une
   mise en ligne par lot ; lire `PIEGES.md` par domaine et les gros fichiers
   par morceaux.

## Git & déploiement

- **Hébergé sur Cloudflare** depuis le 9/10 : le Worker `girlz-games` du compte
  `tld83`, https://girlz-games.tld83.workers.dev — **toute l'app derrière un
  code d'accès**. Procédures du compte (token, secrets, erreurs connues) :
  skill `.claude/skills/cloudflare-deploy`.
- Repo `keryprophez/girlz-games`, **privé** : ses minutes de CI comptent dans
  le quota commun du compte (2 000 par mois) — d'où la CI légère.
- **`main` est la branche par défaut ET la seule qui publie** (`deploy.yml`
  sur un push de `main`, sauf docs seules). Développer sur une branche de
  travail. Livraison :
  ```bash
  git fetch origin && git merge origin/main
  npm run build && npm run test:smoke   # tous les jeux s'ouvrent
  node scripts/touched.mjs origin/main  # dit les bots des jeux touchés…
  BOTS=<ceux-là> npm run test:play      # …qui jouent jusqu'à leur fin
  git push -u origin <branche-de-travail>
  git checkout main && git merge --ff-only <branche> && git push origin main
  git checkout <branche>
  ```
- CI : `npm ci` → `npm run lint` → `npm test` → `npm run build` (tsc de l'app
  ET du Worker) → `wrangler deploy`. Un seul secret GitHub :
  `CLOUDFLARE_API_TOKEN`. Run annulé ou échec réseau : `workflow_dispatch`.
- **Les secrets du Worker** se posent dans le tableau de bord Cloudflare
  (Workers & Pages → `girlz-games` → Settings → Variables and secrets, type
  Secret), jamais dans le dépôt : `ACCESS_CODE` (le code de la famille),
  `ACCESS_SIGNING_SECRET` (32 caractères aléatoires au moins ; absent = app
  fermée), `ANTHROPIC_API_KEY` (absente = le cadenas de Devine mon dessin).
  Variable facultative : `ACCESS_MAX_AGE_DAYS` (400 par défaut).
- En local : `npm run build && npm run worker:dev` sert le vrai Worker (port
  8787, secrets dans `.dev.vars`, ignoré par git). Le smoke et les bots
  tournent sous `vite preview`, sans portail.
