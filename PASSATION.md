# 🤝 Passation — La Ferme Magique

> Document destiné à la **prochaine session Claude Code** (environnement réseau ouvert).
> Lis-le en entier avant de coder. Il contient l'état honnête du projet, les
> contraintes non négociables, les pièges déjà rencontrés, et ce qui bloque.

---

## 1. Le projet en trois phrases

Webapp PWA de **37 jeux** pour **Jade (6 ans)** et **Joyce (8 ans)**, jouable
hors-ligne sur tablette. Aucun jeu n'exige de savoir lire. Le père (utilisateur,
`thibaud.lucchese@gmail.com`) est le commanditaire : il veut un niveau
**professionnel**, et il a raison de dire que ce n'est pas encore le cas.

---

## 2. Verdict honnête sur l'état visuel ⚠️

**C'est le point n°1 à régler.** Retour textuel de l'utilisateur, à prendre au mot :

> « ça fait vraiment petit jeu pourri rempli d'émoticônes, avec des animations
> flash des 80s »

Il a raison. Diagnostic :

| Constat | Cause racine |
|---|---|
| Émoji utilisés comme sprites (animaux, objets, décors) | Aucun asset graphique dans le projet |
| Formes SVG dessinées « à la main » en code | Pas de direction artistique, pas d'illustrateur |
| Animations CSS keyframes basiques | Pas de moteur d'animation, pas d'interpolation d'états |
| 2D plate sans lumière ni profondeur | Rendu DOM/SVG/Canvas 2D |

**Où on en est (session du 25/07/2026)** : l'étape 1 de la roadmap est faite.
**Cinq jeux sont maintenant en vraie 3D** : `stand3d` (la référence d'origine),
`snowman`, `igloo`, `pizza`, `space`. Tous partagent le socle
**`src/core/three3d.ts`** — c'est LUI qu'il faut lire en premier : il contient le
réglage de rendu (ombres douces, tone mapping ACES, brouillard), la boucle à pas
fixe, la caméra orbitale à boutons, les textures procédurales partagées et
surtout le **nettoyage GPU complet**. Un nouveau jeu 3D part de là.

Il reste **8 jeux d'action en 2D** au rendu daté (voir §7) : c'est le prochain
gros chantier visuel.

**Conclusion technique importante** : en 2D sans assets, on plafonne — le rendu
*est* le dessin. En **3D procédurale**, la qualité vient de la lumière, des
ombres, des matériaux et de la perspective : la machine produit le rendu qu'on ne
sait pas dessiner. C'est pourquoi la 3D est la voie retenue.

---

## 3. Contraintes NON NÉGOCIABLES ❌

Ces règles viennent de l'utilisateur. Les enfreindre = travail à refaire.

1. **AUCUNE mécanique d'addiction.** Pas de monnaie, pas de boutique, pas de
   paliers de déblocage, pas de série/streak, pas de notification de rappel, pas
   de « reviens demain ». J'ai violé cette règle en construisant une ferme dont
   le décor se débloquait par paliers d'étoiles — **supprimé** (commit `e9fea93`).
   Les étoiles existantes sont un simple retour de fin de partie, rien de plus.
2. **Aucune lecture requise.** 6 ans = ne lit pas couramment. Icônes, voix,
   démonstration visuelle. La synthèse vocale (`core/voice.ts`) ne sert qu'à lire
   le **contenu pédagogique** (multiplications, heures, noms de lieux), jamais les
   consignes.
3. **Hors-ligne obligatoire.** PWA, tout précaché. Pas d'appel réseau au runtime
   pour jouer.
4. **Pas de collecte de données enfants.** Les photos et voix restent locales
   (voir §6 pour la question de la BDD).
5. **Français uniquement.** Textes, commentaires de code, messages de commit.

---

## 4. Architecture (ce qui est bon, à garder)

```
src/
  core/
    types.ts      GameDef + GameContext — le contrat d'un jeu
    store.ts      Zustand + persist(localStorage) — profils, progression, réglages
    audio.ts      Web Audio synthétisé (aucun fichier) + buzz() vibration
    music.ts      Musique d'ambiance GÉNÉRATIVE, 6 thèmes (jamais 2 fois pareil)
    voice.ts      Synthèse vocale FR
    juice.ts      spring() / iris() / shake() — game feel partagé
    three3d.ts    SOCLE 3D PARTAGÉ : createStage(), orbitCam(), fixedStep(),
                  textures procédurales, picker(), disposeTree() — à lire d'abord
    backup.ts     Export/import de la sauvegarde JSON + stockage qui alerte
                  quand le quota localStorage est atteint
    fx.ts         Particules DOM, confettis, feux d'artifice
    character.ts  Personnage SVG dont le visage est la photo de la joueuse
    clips.ts      Encouragements enregistrés par les parents
  components/
    Home.tsx      Accueil : profils, réglages, bascule ferme/liste
    FarmHub.tsx   Décor de ferme (SVG) — 4 lieux = 4 catégories
    GameHost.tsx  Monte/démonte un jeu, écran de résultat, anti-crash, musique
    PlayTimer.tsx Minuteur parental + verrou « question de grand » (MathGate, exporté)
    Backup.tsx    Fenêtre parents : exporter / restaurer la sauvegarde
    ErrorBoundary.tsx / Album.tsx / VoiceStudio.tsx / Toast.tsx / Ambient.tsx
  games/          37 fichiers, 1 par jeu + index.ts (le catalogue)
scripts/smoke.mjs Smoke test Playwright : ouvre les 37 jeux, vérifie 0 erreur JS
```

**Contrat d'un jeu** — volontairement minimal, c'est la force du projet :

```ts
export const monJeu: GameDef = {
  id: 'monJeu', name: 'Mon Jeu', icon: '🎯', sq: 'sq-sky',
  cat: 'action',            // reflexion | memoire | action | creatif
  duel: false,              // optionnel : exclut du Défi à deux
  music: 'fair',            // optionnel : thème de core/music.ts
  subtitle: '…',
  mount(ctx) { /* … */ return () => { /* cleanup IDEMPOTENT */ } }
}
```
Puis **1 ligne dans `src/games/index.ts`**. Le `GameHost` fournit `ctx` :
`root`, `tier`, `playerName`, `avatar`, `look`, `byTier(e,m,x)`, `finish()`,
`toast()`, `say()`.

---

## 5. Pièges déjà rencontrés (ne pas les redécouvrir) 🪤

| Piège | Détail |
|---|---|
| **matter.js `isStatic`** | Un corps créé avec `isStatic: true` garde une masse infinie quand on le libère → positions `NaN`. Créer **dynamique puis** `Body.setStatic(b, true)`. |
| **Horloge murale vs simulée** | Ne jamais tester la fin d'une action physique avec `performance.now()` si la physique tourne à pas fixe : accumuler un `simMs`. |
| **`preventDefault` global** | Un anti-double-tap sur `touchend` **avale un clic sur deux** dans les jeux rapides. Utiliser `touch-action: manipulation` en CSS. |
| **Smoke test + vue ferme** | L'accueil affiche la ferme, pas la grille. `scripts/smoke.mjs` bascule en vue liste via `.hub-toggle` avant d'énumérer les `.gc`. Si tu changes l'accueil, mets à jour le smoke test. |
| **Nettoyage GPU** | Three.js/Pixi : disposer géométries, matériaux, textures **et** renderer au démontage, sinon fuite à chaque partie. Voir `stand3d.ts`. |
| **CSS transform vs attribut SVG** | Une animation CSS `transform` écrase l'attribut `transform="translate(…)"` d'un `<g>` SVG. |
| **PWA en cache** | `registerSW` applique la maj automatiquement si elle arrive <15 s après l'ouverture (`src/main.tsx`). Sinon simple toast. Ne pas casser ça. |
| **AudioContext unique** | `getCtx()` dans `core/audio.ts` est partagé sons + musique, avec `resume()` auto (iOS). Ne pas créer un second contexte. |
| **cannon-es : corps figé** | Passer `body.type = STATIC` ne suffit pas : `invMass` reste fini et le corps suivant s'enfonce dedans. Mettre `body.mass = 0` **avant** `updateMassProperties()`. Même piège qu'`isStatic` en matter.js. |
| **Sphère sur sphère** | Empiler des sphères en physique pure finit toujours par rouler. Dans `snowman.ts` la boule tombe sur un **rail vertical** (x/z verrouillés à chaque pas) : la chute est simulée, la dérive non. Le jeu ne peut pas se bloquer. |
| **Planètes côté nuit** | Un système solaire éclairé par une seule lumière ponctuelle montre les planètes du premier plan **en ombre totale** — juste physiquement, inregardable à 6 ans. `space.ts` ajoute une directionnelle faible recollée sur la caméra à chaque image. |
| **Blocs d'igloo** | Des cubes tangents à une sphère donnent une boîte, pas une coupole. `igloo.ts` découpe chaque bloc **dans la sphère** (`SphereGeometry` avec `phiStart/thetaStart`) : la voûte est vraie et les joints se voient. |
| **`zustand/persist` muet** | Au dépassement de quota, `setItem` lève et persist avale l'exception : plus rien n'est enregistré, en silence. `core/backup.ts` fournit `loudStorage`, qui prévient par un toast. |

---

## 6. Ce qui BLOQUE et dépend de l'utilisateur 🔑

### a) Pas de base de données — critique
Tout est en `localStorage` (clé `ferme:v2`) : profils, photos (dataURL), voix
enregistrées, progression. **Un nettoyage du navigateur efface tout.** Le quota
(~5 Mo) est aussi un risque : les photos et l'audio y sont stockés en base64, et
zustand-persist échoue **silencieusement** au dépassement.

**Fait depuis** : un filet de secours existe — bouton **💾** de l'accueil
(`core/backup.ts` + `components/Backup.tsx`) : export d'un fichier JSON complet
(photos et voix comprises), réimport protégé par la « question de grand », jauge
de remplissage du quota, et alerte quand l'enregistrement échoue. **Ça ne
remplace pas une base de données**, ça évite juste la perte sèche.

Ce qu'il faut toujours : **Supabase** (offre gratuite suffisante) ou équivalent.
→ Demander à l'utilisateur : URL du projet + clé `anon` publique.
→ Migration : profils/progression en table, photos/audio en Storage.
→ Garder un mode hors-ligne (cache local + synchro opportuniste).
→ ⚠️ Contrainte 4 : données d'enfants, donc RLS strict et aucun tiers analytique.

### b) Pas d'assets graphiques — critique pour le visuel
Dans la session précédente, `kenney.nl` et `opengameart.org` étaient **bloqués
par la politique réseau** (proxy : `000` / refus de CONNECT). D'où le repli sur
le dessin en code, d'où le rendu amateur.

**Avec l'environnement ouvert, à faire en priorité :**
- Packs CC0 [Kenney](https://kenney.nl/assets) : *Impact Sounds*, *Interface
  Sounds*, *Animal Pack Redux*, *Physics Assets*, *Platformer Kit* (3D).
- Modèles 3D CC0 : [Poly Pizza](https://poly.pizza), [Quaternius](https://quaternius.com)
  (glTF low-poly stylisé, parfait pour du 6-8 ans).
- Vérifier les licences et écrire un `public/assets/CREDITS.md`.
- Attention au **poids du précache PWA** : garder le hors-ligne viable
  (charger les gros assets à la demande, par jeu).

### c) Éventuellement : un illustrateur
Pour une vraie direction artistique 2D, quelques centaines d'euros de freelance
feraient plus que n'importe quelle astuce technique. À arbitrer par l'utilisateur.

---

## 7. Verdict jeu par jeu (pour trancher)

**🟢 Bons, à garder tels quels (mécanique juste, pas de dette visuelle bloquante)**
`quiz` · `intrus` · `letters` · `puzzle` (photo) · `taquin` · `patterns` ·
`mirror` · `clock` · `tables` · `additions` · `market` · `maze` · `memory` ·
`simon` · `connect4` · `battleship` · `piano` · `beatbox` · `coloring`

**🟡 Bonne idée, rendu à refaire (candidats 3D ou refonte graphique)**
`caterpillar` · `socks` · `geo` (le zoom continent → ville gagnerait à devenir un
vrai déplacement de caméra 3D)
*(`snowman`, `igloo`, `pizza` et `space` sont faits — voir 🔵 ; `chamboule` a été
supprimé, `stand3d` le remplace.)*

**🟠 Jeux d'action au rendu daté (Pixi 2D, sprites = emoji ou SVG)**
`catch` · `mole` · `run` · `fish` · `ninja` · `flappy` · `popcorn` · `balloon`
→ tous gagneraient à passer sur de vrais sprites (Kenney) plutôt qu'une réécriture.

**🔵 Vraie 3D — le niveau attendu**
`stand3d` · `snowman` · `igloo` · `pizza` · `space`
Tous montés sur `core/three3d.ts`. **Le patron de tout nouveau développement.**

**⚪ Sans score, à laisser tranquilles**
`fireworks` · `dressup`

---

## 8. État git & déploiement

| | |
|---|---|
| Repo | `keryprophez/girlz-games` (public) |
| Branche **par défaut** | `claude/magic-farm-game-q66bw4` ← **c'est elle que `deploy.yml` publie** |
| `main` | maintenue au même commit (miroir) |
| Branche de travail | `claude/passation-roadmap-4b86sz` |
| Dernier commit | étape 1 de la roadmap : 4 jeux passés en vraie 3D |
| En ligne | https://keryprophez.github.io/girlz-games/ |

**Procédure de livraison utilisée** (les 3 branches restent au même commit) :
```bash
git push -u origin <branche-de-travail>
git checkout main && git merge --ff-only <branche> && git push origin main
git checkout claude/magic-farm-game-q66bw4 && git merge --ff-only <branche> && git push origin claude/magic-farm-game-q66bw4
git checkout <branche>
```
⚠️ **Nettoyage possible** : si l'utilisateur bascule la branche par défaut sur
`main` dans les réglages GitHub, simplifier `deploy.yml` (retirer
`claude/magic-farm-game-q66bw4` de `branches:`) et supprimer cette gymnastique.

**CI** (`.github/workflows/deploy.yml`) : `npm ci` → `npm run build` (inclut
`tsc -b`) → `npm run test:smoke` → déploiement Pages. Le smoke test **bloque**
le déploiement si un jeu casse. Le garder vert.

---

## 9. Comment travailler (méthode qui a marché)

1. `npm run build` — `tsc -b` attrape les erreurs de type.
2. **Toujours vérifier dans un vrai navigateur** avec Playwright :
   `nohup npx vite preview --port 4188 --strictPort &` puis un script
   `.verify-*.mjs` en racine (Chromium : `/opt/pw-browsers/chromium`).
   Pour la 3D, ajouter `args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']`.
3. **Regarder les captures d'écran** — c'est le seul moyen de juger le rendu.
   Ne pas conclure « ça marche » sur la base des logs.
4. `npm run test:smoke` avant tout commit.
5. Supprimer les scripts de vérification temporaires avant de committer.
6. Commits et messages **en français**, descriptifs.

---

## 10. Message de l'utilisateur à garder en tête

Il ne veut pas d'un catalogue de mini-jeux inégaux. Il veut **peu de jeux, mais
qui ressemblent à de vrais jeux** — visuels et physique modernes. Quand il faut
choisir entre « ajouter un 39ᵉ jeu » et « amener un jeu existant au niveau
`stand3d` », **choisir la seconde option**.

Voir `ROADMAP.md` pour l'ordre de bataille.
