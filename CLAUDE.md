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
   demain » · classements ou comparaison entre les deux sœurs au-delà du Défi à
   deux amical · publicité, achats intégrés, analytique tiers, compte en ligne
   pour les enfants. Les étoiles sont un simple retour de fin de partie.
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
             music.ts (générative) · voice.ts · juice.ts · fx.ts · character.ts
             three3d.ts  ← SOCLE 3D PARTAGÉ, à lire avant tout jeu 3D
             sprites.ts  ← planches d'assets CC0 chargées à la demande
             impact.ts   ← LE feel des chocs : force 0..1 → son + secousse + particules
             backup.ts   ← export/import JSON + alerte quota localStorage
src/components/  Home · GameHost · PlayTimer · Backup · Album · VoiceStudio · …
src/games/       1 fichier par jeu + index.ts (le catalogue)
public/assets/     planches Kenney (PNG packé + JSON d'atlas) + CREDITS.md
scripts/smoke.mjs        ouvre tous les jeux dans Chromium, vérifie 0 erreur JS
scripts/import-assets.mjs  (re)télécharge et trie les packs Kenney
```

**Les visuels viennent des planches CC0 Kenney**, pas d'emoji : `loadAtlas('animals')`
puis `frameStyle(atlas, 'cow', 64)` pour un jeu en DOM (voir `mole.ts`, le patron).
Pour ajouter un pack, éditer `scripts/import-assets.mjs` et le relancer — les
sprites triés sont commités, les zips ne le sont pas. Attention : la planche
`nature` mélange les saisons, d'où les listes `GREEN_TREES` / `GREEN_GRASS` de
`sprites.ts` — piocher au hasard sème de la neige au milieu d'un pré.

**Contrat d'un jeu** — volontairement minimal, c'est la force du projet :

```ts
export const monJeu: GameDef = {
  id: 'monJeu', name: 'Mon Jeu', icon: '🎯', sq: 'sq-sky',
  cat: 'action',   // reflexion | memoire | action | creatif
  duel: false,     // optionnel : exclut du Défi à deux
  music: 'fair',   // optionnel : thème de core/music.ts
  subtitle: '…',
  mount(ctx) { /* … */ return () => { /* cleanup IDEMPOTENT */ } }
}
```
Puis **une ligne dans `src/games/index.ts`**. `GameHost` fournit `ctx` :
`root`, `tier`, `playerName`, `avatar`, `look`, `byTier(e,m,x)`, `finish()`,
`toast()`, `say()`, et depuis le 2/09 les **timers de partie** `after(ms,fn)` /
`every(ms,fn)` / `cancel(id)` / `alive()` (annulés au démontage, suspendus en
pause — ne plus utiliser `setTimeout` pour piloter un jeu). `finish()` accepte
`outroMs` : le jeu reste monté ce temps-là (ralenti, chute, caméra) avant le
score. La **pause** est globale (`core/session.ts` : `setPaused`, `onPause`) :
onglet caché, minuteur parental, bouton pause ; `createStage` fige sa boucle
dessus tout seul. En jeu, `body.playing` met la coquille en **plein écran** :
l'arène (`.arena`, `#catchArea`, `#runArea`) prend toute la place restante, la
barre maison/pause/rejouer flotte par-dessus (`.playbar`), le titre est un
carton de 1,5 s. Les icônes de la coquille viennent de `core/icons.ts` (SVG),
jamais d'emoji.

**Un jeu d'adresse part de `core/arcade.ts`** (session : score, vies, combo,
rampe par performance, timers simulés `game.after`, HUD en icônes dans
l'arène, `game.flash()` pour un mot-image, `game.end()` avec `outroMs`) et de
`core/sfx.ts` pour les sons de gestes (`sfx('slice')`, `preloadSfx([...])`).
Modèles : `icetower.ts`, `ninja.ts` et `mole.ts` (sprites Kenney en 3D via
`spriteFromAtlas`, raycast sur les sprites eux-mêmes).

**Un nouveau jeu 3D part de `core/three3d.ts`** : `createStage()` applique déjà
antialias, pixelRatio plafonné à 2, ACES, PCFSoftShadowMap, `shadow.bias`,
lumières et brouillard. Puis `fixedStep()` pour la physique, `orbitCam()` pour la
caméra, `loadThree()`/`loadPhysics()` + `loader()` pour le chargement à la
demande, `stage.dispose()` pour le nettoyage GPU (et `stage.keep(tex)` pour les
textures non attachées à la scène). Puis **`core/scene3d.ts`** : `ground()`,
`decor()` (modèles du kit `nature` ou `holiday`, avec `shade` pour assombrir
les kits clairs), `particles()` (GPU, dans la scène — plus de divs au-dessus du
canvas), `camShake()` (à `apply()` après avoir placé la caméra), `toScreen()`.
`stage.timeScale` fait les ralentis d'outro.

Jeux déjà en vraie 3D : `stand3d` · `snowman` · `pizza` · `space` · `icetower` ·
`catch` · `ninja` · `caterpillar` · `run` · `flappy` · `mole` (`stand3d` et `icetower`
contournent encore `createStage` : à migrer en phase 1).

---

## Pièges déjà payés 🪤

| Piège | Détail |
|---|---|
| **cannon-es : corps figé** | `body.type = STATIC` ne suffit pas, `invMass` reste fini. Mettre `body.mass = 0` **avant** `updateMassProperties()`. |
| **matter.js `isStatic`** | Même famille : créer **dynamique puis** `Body.setStatic(b, true)`, sinon positions `NaN`. |
| **Sphère sur sphère** | Empiler des sphères en physique pure finit toujours par rouler. Verrouiller x/z pendant la chute (voir `snowman.ts`). |
| **Blocs sur une coupole** | Des cubes tangents à une sphère donnent une boîte. Découper les blocs **dans** la sphère (`SphereGeometry` + `phiStart`/`thetaStart`). |
| **Planètes côté nuit** | Une seule lumière ponctuelle = premier plan en ombre totale. Ajouter une directionnelle faible recollée sur la caméra. |
| **Nettoyage GPU** | Disposer géométries, matériaux, **toutes** les textures et le renderer au démontage, sinon fuite à chaque partie. |
| **`zustand/persist` muet** | Quota dépassé → `setItem` lève, persist avale l'exception, plus rien n'est enregistré en silence. D'où `loudStorage` dans `core/backup.ts`. |
| **Horloge murale vs simulée** | Ne jamais tester la fin d'une action physique avec `performance.now()` si la physique tourne à pas fixe : accumuler un `simMs`. |
| **`preventDefault` global** | Un anti-double-tap sur `touchend` avale un clic sur deux. Utiliser `touch-action: manipulation` en CSS. |
| **CSS transform vs SVG** | Une animation CSS `transform` écrase l'attribut `transform="translate(…)"` d'un `<g>`. |
| **AudioContext unique** | `getCtx()` de `core/audio.ts` est partagé sons + musique. Ne pas créer un second contexte. |
| **PWA en cache** | `registerSW` applique la maj auto si elle arrive <15 s après l'ouverture (`src/main.tsx`). Ne pas casser ça. |
| **Animal « posé sur » un trou** | Un sprite au-dessus d'une ellipse sombre ne sort pas du trou, il est planté derrière. Il faut trois couches : terrier sombre, sprite dans un conteneur `overflow:hidden` coupé au bord du trou, bourrelet de terre par-dessus (voir `mole.ts` et `.hole` dans le CSS). |
| **Noms de jeux en double** | Le nom de fichier est la mécanique (`battleship.ts`), le nom affiché est le thème pour les filles (« Cache-Cache Pré »). Vérifier les collisions de nom ET d'icône avant d'en rebaptiser un. |
| **Mesure faussée par le service worker** | La maj auto de la PWA recharge la page <15 s après l'ouverture — en plein test Playwright, on mesure alors l'ACCUEIL et pas le jeu (une luminosité relevée à 210/255 au lieu de 68). Toujours ouvrir le contexte avec `serviceWorkers: 'block'`. |
| **Relire un canvas WebGL** | `preserveDrawingBuffer` est désactivé : `drawImage(canvas)` renvoie du noir. Pour mesurer un rendu, capturer l'élément avec Playwright et décoder le PNG **hors du navigateur**. |
| **`Color.setHSL` linéaire** | three.js interprète `setHSL` dans l'espace de travail **linéaire** : une clarté de 0.45 ressort crème pastel à l'écran. Passer `T.SRGBColorSpace` en 4ᵉ argument (les hexadécimaux, eux, sont convertis automatiquement). |
| **Couleurs vives + ACES** | Un matériau clair sous hemi+soleil+IBL cumule plus de 2× sa luminance : l'ACES l'écrase en blanc. Choisir des couleurs de matériaux **sombres** (la lumière les remonte), jamais l'inverse. |
| **Smoke test = grille de l'accueil** | `scripts/smoke.mjs` et `scripts/play.mjs` cliquent les tuiles `.gc:not(.gc-duel)` et lisent le nom dans `.nm`. Si tu changes l'accueil, mets-les à jour. |
| **État de jeu en singleton de module** | `let x: any = null` + `setTimeout` qui relit `x` : si on quitte et relance en moins d'une seconde, le vieux timer pilote la nouvelle partie (crash vécu dans `piano.ts`). Capturer l'état dans une constante locale et tester `x === me` — ou attendre le jeton de partie de la phase 1. |
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
5. Supprimer les scripts `.verify-*.mjs` avant de committer.

## Git & déploiement

- Repo `keryprophez/girlz-games` (public), en ligne :
  https://keryprophez.github.io/girlz-games/
- Branche **par défaut** `claude/magic-farm-game-q66bw4` ← c'est elle que
  `deploy.yml` publie. `main` est maintenue au même commit (miroir).
- Développer sur une branche de travail, ne jamais pousser ailleurs sans
  demander. Livraison (les trois branches restent au même commit) :
  ```bash
  git push -u origin <branche-de-travail>
  git checkout main && git merge --ff-only <branche> && git push origin main
  git checkout claude/magic-farm-game-q66bw4 && git merge --ff-only <branche> \
    && git push origin claude/magic-farm-game-q66bw4
  git checkout <branche>
  ```
  Si tu bascules la branche par défaut sur `main` dans les réglages GitHub,
  simplifier `deploy.yml` et supprimer cette gymnastique.
- CI : `npm ci` → `npm run build` → `npm run test:smoke` → Pages.
