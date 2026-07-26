# 📋 Prompt de passation — à coller dans le nouveau chat

---

Tu reprends **La Ferme Magique** (`keryprophez/girlz-games`), une PWA de 38
mini-jeux pour Jade (6 ans) et Joyce (8 ans), déployée sur GitHub Pages.

Une session précédente a produit ce projet. Le verdict du commanditaire (le père)
sur l'ensemble, à prendre au mot :

> « ça fait vraiment petit jeu pourri rempli d'émoticônes, avec des animations
> flash des 80s » · « graphismes encore dégueulasse, 3d dégueulasse, physique
> dégueulasse » · « trouve réellement comment faire un jeu au niveau des jeux
> flash d'internet, QUI EUX SONT PLAISANTS À JOUER »

**Ta mission : amener les 38 jeux à un vrai niveau sur quatre axes —
GRAPHISMES, DESIGN, JOUABILITÉ/GAMEPLAY, PHYSIQUE.**

---

## Axe 1 — GRAPHISMES

**Le diagnostic** : chaque jeu dessine sa propre chose. Emoji en guise de sprites,
SVG écrit à la main dans le code, primitives 3D nues. 38 styles différents ≠ un
style. C'est ça qui donne l'impression d'amateurisme, pas le manque d'effort.

**Ce qu'il faut faire :**
- **Un seul kit d'art partagé**, dont tous les jeux tirent. Les assets CC0 Kenney
  sont déjà dans `public/assets/` avec `CREDITS.md`, et `src/core/three3d.ts`
  existe : **étends-les et impose-les partout.**
- **Interdits** : un emoji comme sprite principal, un SVG dessiné à la main dans un
  nouveau jeu, une couleur en dur hors palette.
- **Complète le kit** avec des modèles glTF stylisés (Poly Pizza, Quaternius —
  CC0, low-poly, adaptés au 6-8 ans) et des textures PBR. Vérifie les licences,
  tiens `public/assets/CREDITS.md` à jour.
- **Pour toute scène 3D** (leçons déjà payées, ne les redécouvre pas) :
  - **IBL obligatoire** : `PMREMGenerator` + `RoomEnvironment`. Sans carte
    d'environnement, un `MeshStandardMaterial` paraît plat et plastique.
  - `RoundedBoxGeometry` plutôt que `BoxGeometry` — une arête arrondie fait la
    différence entre « objet dessiné » et « boîte de programmeur ».
  - Bloom **très dosé** (`UnrealBloomPass` ~`0.16 / 0.4 / 0.96`) : au-delà, toute
    la scène blanchit. Erreur déjà commise.
  - Ombres `PCFSoftShadowMap` + `shadow.bias` réglé, tone mapping ACES.
  - **Contraste sujet/fond** : des objets clairs sur un fond clair sont illisibles.
    Assombris la palette de fond plutôt que d'éclaircir les objets.
- **Le plafond honnête** : des cubes arrondis restent des cubes. Sans vrais modèles,
  on plafonne à du « 3D correct de programmeur ». C'est pour ça que les assets sont
  la priorité n°1 de cet axe.

## Axe 2 — DESIGN (direction artistique et interface)

- **Une seule identité visuelle** : une palette, une typo, un traitement d'ombre,
  un HUD identique partout (score, vies, chrono au même endroit, même style).
- **Cadrage** : vérifie **par capture d'écran** que ce que la joueuse doit viser est
  dans le cadre. Un jeu a déjà été livré injouable parce que l'objet à lâcher
  sortait de l'écran.
- **Lisibilité 6 ans** : aucune lecture requise, cibles tactiles ≥ 44 px, une seule
  information à la fois.
- **Arrête de faire passer 38 items pour équivalents.** Restructure l'accueil en
  quatre espaces honnêtes : **Jouer** (jeux d'adresse) · **Apprendre** (exercices)
  · **Créer** (bacs à sable) · **À deux**. La grille de jeux reste — le
  commanditaire a explicitement refusé toute page d'accueil « monde » ou « ferme ».

## Axe 3 — JOUABILITÉ / GAMEPLAY

**Ce qui rendait les jeux Flash plaisants n'était pas les graphismes** — Bloons
c'était des cercles plats. C'était : **un geste clair, un retour immédiat, aucun
temps mort, et une difficulté qui se sent.**

**Règles valables pour TOUS les jeux, sans exception :**
1. **un geste clair** — jamais d'assistant en plusieurs étapes (`pizza.ts` est le
   contre-exemple : choisis la pâte, puis la sauce, puis… ce n'est pas un jeu) ;
2. **zéro temps mort** — recommencer en moins d'une seconde, pas de modale ni
   d'attente entre deux tentatives ;
3. **retour en moins de 100 ms** sur chaque action (son + visuel).

**Puis, selon le genre — et SEULEMENT selon le genre :**
- **Adresse / action** (Poussin, Ninja, Course, Taupe, Chenille, Ballon, Simon,
  Pêche, Stand, Tour de Glace) → il faut pouvoir **perdre**, et la difficulté doit
  monter. Plusieurs en manquent : la Chenille n'a plus de mort, la Taupe ne
  sanctionne rien, le Ballon qui éclate ne coûte rien, Simon n'a pas de fin sur
  erreur. **C'est le correctif le moins cher et le plus rentable de tout le
  projet : 4 fichiers.**
- **Puzzle / réflexion** (Taquin, Labyrinthe, Miroir, Suites) → pas de défaite
  nécessaire, mais **une mesure** (coups, temps) pour que progresser se voie.
- **Exercices pédagogiques** (tables, additions, heure, marché, lettres, quiz,
  Loupe, Espace) → **jamais de sanction**, correction immédiate, aucun temps mort.
  Ce sont de bons exercices : assume-les comme tels.
- **Bacs à sable créatifs** (coloriage, habille-toi, bonhomme, piano, boîte à
  rythme, feu d'artifice) → **jamais de score ni d'échec**. Ce qu'il leur faut,
  c'est plus de liberté : plus d'options, annuler, sauvegarder son œuvre.

⚠️ **N'impose pas de défaite à un coloriage ou à un exercice de maths** — ce serait
absurde. La règle est par genre.

**Référence de gameplay dans le dépôt** : `src/games/icetower.ts` (branche
`claude/winter-games-pizza-maker-35tmjc`). Un tap lâche un bloc suspendu, la
physique décide, la tour peut s'écrouler. Mesuré : en visant bien → 10 blocs et
combo ×10 ; au hasard → écroulée à 3 blocs. **Le critère à appliquer aux jeux
d'adresse : un joueur adroit fait-il visiblement mieux ?**

## Axe 4 — PHYSIQUE

**Le diagnostic** : chaque jeu recopie ses propres réglages, d'où un ressenti
flottant et incohérent.

**Ce qu'il faut faire :**
- **Un module physique partagé** avec des valeurs éprouvées : **pas de temps fixe**
  avec accumulateur (jamais de `dt` variable passé au solveur), masses / frottements
  / restitutions cohérents entre jeux, endormissement rapide des corps, gravité
  franche (une gravité trop faible donne le côté « flottant »).
- **Impact = trois retours proportionnels à la vitesse de collision** : son,
  secousse d'écran, particules. À factoriser une fois (`core/juice.ts` a déjà
  `shake()` et `spring()`), pas à réécrire par jeu.
- **Prévisualisation honnête** : si un jeu affiche une trajectoire, elle doit être
  simulée avec les mêmes réglages que le tir réel (amortissement nul), jamais
  approchée.
- **Deux pièges déjà rencontrés, ne les refais pas :**
  - Un corps `matter.js` créé avec `isStatic: true` garde une masse infinie quand on
    le libère → positions `NaN`. Le créer **dynamique puis** `setStatic(b, true)`.
  - **Appeler `ctx.finish()` depuis la boucle `requestAnimationFrame` démonte le jeu
    synchroniquement** (l'état global passe à `null`), et la boucle continue puis
    plante. Toujours `return` juste après, et re-tester l'état après tout appel
    susceptible de terminer la partie. Ce bug est apparu **deux fois**.

---

## Contraintes NON NÉGOCIABLES

1. **Aucune mécanique d'addiction** : pas de monnaie, pas de boutique, pas de
   paliers de déblocage, pas de série quotidienne, pas de notification de rappel.
   Une session précédente a construit une carte de ferme dont le décor se
   débloquait par étoiles : **refusé et supprimé.** ⚠️ Attention : « pas
   d'addiction » n'interdit pas la **difficulté** — ce sont deux axes indépendants.
2. **Aucune lecture requise** — 6 ans. Icônes, voix, démonstration.
3. **Hors-ligne** (PWA, tout précaché). Charge les gros assets **à la demande par
   jeu** pour ne pas gonfler le précache.
4. **Données d'enfants** (photos, voix) : locales, aucun analytique tiers.
5. **Tout en français** : interface, commentaires de code, messages de commit.
6. **Pas de page d'accueil « monde » / « ferme »** : la grille de jeux, refusée
   explicitement une fois déjà.

## État du dépôt

- **`main`** (= branche déployée, ainsi que `claude/magic-farm-game-q66bw4`) : ton
  travail en cours — assets Kenney, `src/core/three3d.ts`, quatre jeux passés en 3D
  (igloo, pizza, bonhomme, espace), `CLAUDE.md`, docs dédupliquées.
- **`claude/winter-games-pizza-maker-35tmjc`** : travail parallèle **non fusionné**,
  à reprendre **sélectivement** (`git log claude/winter-games-pizza-maker-35tmjc`) :
  - ✅ `src/games/icetower.ts` — la référence de gameplay, à récupérer
  - ✅ suppression de la carte de ferme d'accueil (refusée par le commanditaire ;
    elle est **encore présente sur `main`**, à retirer)
  - ✅ deux corrections de bugs (boucle après démontage, élément hors cadre)
  - ✅ `AUDIT.md` — verdict par jeu sur les 4 axes, et coupe proposée
  - ⚠️ **ne reprends pas la suppression de `igloo.ts` sans arbitrer** : tu l'as
    refait en 3D entre-temps. Le reproche du commanditaire portait sur sa
    *mécanique* (« pose le bloc sur la case qui brille » = formulaire), que la 3D
    ne corrige pas.

## Méthode de travail

- `npm run build` (inclut `tsc -b`), puis **vérifie dans un vrai navigateur** :
  `nohup npx vite preview --port 4188 --strictPort &` et un script Playwright
  (Chromium : `/opt/pw-browsers/chromium` ; pour la 3D ajoute
  `--use-gl=swiftshader --enable-unsafe-swiftshader`).
- **Regarde les captures d'écran.** Ne conclus jamais « ça marche » sur des logs :
  les deux pires défauts livrés (scène délavée, objet hors cadre) étaient
  invisibles autrement.
- `npm run test:smoke` avant chaque commit — il ouvre les 38 jeux et **bloque le
  déploiement** si l'un casse.
- Supprime tes scripts de vérification temporaires avant de committer.

## Ordre recommandé

1. **Jouabilité** — les correctifs par genre, en commençant par les 4 jeux
   d'adresse sans sanction. Gratuit, immédiat, c'est ce qui change le plaisir.
2. **Physique** — le module partagé + les retours d'impact, branchés une fois.
3. **Graphismes / design** — le kit d'art unique, imposé jeu par jeu, avec les
   assets. Le plus long.
4. **Restructuration de l'accueil** en quatre espaces honnêtes.

**Ne commence pas par les graphismes.** Un joli jeu sans jouabilité reste
ennuyeux : l'igloo passé en 3D, jugé « tellement nul » malgré la 3D, en est la
preuve directe.
