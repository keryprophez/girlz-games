# 🤝 Passation — La Ferme Magique

> Document destiné à la **prochaine session Claude Code** (environnement réseau ouvert).
> Lis-le en entier avant de coder. Il contient l'état honnête du projet, les
> contraintes non négociables, les pièges déjà rencontrés, et ce qui bloque.

---

## 1. Le projet en trois phrases

Webapp PWA de **38 mini-jeux** pour **Jade (6 ans)** et **Joyce (8 ans)**, jouable
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

**Le seul jeu au niveau attendu aujourd'hui : `src/games/stand3d.ts`** — vraie 3D
Three.js + physique cannon-es (éclairage, ombres portées, matériaux PBR, tone
mapping). C'est la référence à suivre. **Regarde ce fichier avant tout autre.**

**Conclusion technique importante** : en 2D sans assets, on plafonne — le rendu
*est* le dessin. En **3D procédurale**, la qualité vient de la lumière, des
ombres, des matériaux et de la perspective : la machine produit le rendu qu'on ne
sait pas dessiner. C'est pourquoi la 3D est la voie retenue.

---

## 2 bis. LA LEÇON DE GAME DESIGN (la plus importante) 🎯

Retour de l'utilisateur, après avoir testé : *« l'igloo, c'est tellement nul »*,
*« trouve comment faire un jeu au niveau des jeux Flash, QUI EUX SONT PLAISANTS »*.

**Le diagnostic : les jeux Flash n'étaient pas beaux, ils étaient BONS.** Bloons
c'était des cercles plats. Line Rider, un trait sur fond blanc. Ils avaient
quatre choses que les jeux de ce projet n'avaient pas :

| Ce qu'ils avaient | L'erreur commise ici |
|---|---|
| **Un seul geste**, maîtrisable à l'infini | Des assistants en 6 étapes (choisis ta pâte, puis la sauce…) |
| **Un échec réel possible** | « Tout le monde gagne », zéro enjeu |
| **Réessai immédiat** | 1,5 s d'attente, toasts, modales entre deux essais |
| **Difficulté croissante** | La même chose N fois, puis « bravo » |

**J'avais confondu « bienveillant avec des enfants » et « sans difficulté ».**
En retirant tout risque, j'ai retiré toute satisfaction. Bloons n'a aucune
mécanique d'addiction *et* est difficile : ce sont deux axes indépendants.
« Pas d'addiction » ≠ « pas de challenge ».

**Référence de gameplay dans le projet : `src/games/icetower.ts`** (La Tour de
Glace). Un tap pour lâcher un bloc suspendu, la physique décide, la tour peut
s'écrouler. Preuve mesurée : en visant bien → 9-10 blocs et combo PARFAIT ×10 ;
en tapant au hasard → « la tour s'écroule » à 3 blocs. **Le même jeu, deux
résultats radicalement différents = de l'adresse existe.** C'est le critère à
appliquer à chaque jeu : *un joueur adroit fait-il visiblement mieux ?*

Tout jeu qui échoue à ce test est un formulaire déguisé, pas un jeu.

## 2 ter. Le plafond visuel : ce que je peux et ne peux PAS faire 🎨

Retour utilisateur sur la 3D : *« graphismes encore dégueulasse, 3d dégueulasse »*.
Honnête et fondé. Ce qui a été tenté sur `icetower.ts`, et qui **ne suffit pas** :

- ✅ IBL via `PMREMGenerator` + `RoomEnvironment` (sans carte d'environnement,
  un `MeshStandardMaterial` est plat et plastique — c'est **indispensable**)
- ✅ Post-traitement `EffectComposer` + `UnrealBloomPass` (⚠️ à doser très bas,
  0.16/0.96 : au-delà, toute la scène blanchit — erreur commise puis corrigée)
- ✅ `RoundedBoxGeometry` (arêtes arrondies = objet dessiné, pas boîte de code)
- ✅ Ombres `PCFSoftShadowMap`, tone mapping ACES, palette assombrie pour que les
  objets clairs ressortent

**Le plafond : des cubes arrondis restent des cubes.** Sans modèles 3D et sans
textures, on obtient au mieux du « 3D correct de programmeur ». Le saut suivant
exige des **assets** (voir §6b) : modèles glTF stylisés (Poly Pizza, Quaternius),
textures PBR, et idéalement un illustrateur. Ce n'est pas un problème d'effort,
c'est un problème de matière première.

## 3. Contraintes NON NÉGOCIABLES ❌

Ces règles viennent de l'utilisateur. Les enfreindre = travail à refaire.

0. **La difficulté N'EST PAS de l'addiction.** Un jeu doit pouvoir être raté.
   Voir §2 bis — c'est la correction la plus importante à retenir.
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
    fx.ts         Particules DOM, confettis, feux d'artifice
    character.ts  Personnage SVG dont le visage est la photo de la joueuse
    clips.ts      Encouragements enregistrés par les parents
  components/
    Home.tsx      Accueil : profils, réglages, GRILLE des jeux par catégorie
    GameHost.tsx  Monte/démonte un jeu, écran de résultat, anti-crash, musique
    PlayTimer.tsx Minuteur parental + verrou « question de grand »
    ErrorBoundary.tsx / Album.tsx / VoiceStudio.tsx / Toast.tsx / Ambient.tsx
  games/          38 fichiers, 1 par jeu + index.ts (le catalogue)
scripts/smoke.mjs Smoke test Playwright : ouvre les 38 jeux, vérifie 0 erreur JS
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
| **Boucle de rendu après démontage** | ⚠️ Piège rencontré **deux fois** : appeler `ctx.finish()` (ou une fonction qui le fait) depuis la boucle `requestAnimationFrame` démonte le jeu **synchroniquement** (état global → `null`), puis la boucle continue et plante. **Toujours** `return` juste après, et re-tester `if (!it \|\| !it.running) return` après tout appel susceptible de terminer la partie. |
| **Bloom qui blanchit tout** | `UnrealBloomPass` avec un seuil bas sur une scène claire délave l'image entière. Rester vers `strength 0.16 / threshold 0.96`. |
| **Élément de jeu hors cadre** | La grue de `icetower` était à 3,1 unités au-dessus du sommet : le bloc à lâcher sortait de l'écran, le jeu était **injouable** sans le voir. Toujours vérifier par capture d'écran que ce qu'on doit viser est visible. |
| **Nettoyage GPU** | Three.js/Pixi : disposer géométries, matériaux, textures **et** renderer au démontage, sinon fuite à chaque partie. Voir `stand3d.ts`. |
| **CSS transform vs attribut SVG** | Une animation CSS `transform` écrase l'attribut `transform="translate(…)"` d'un `<g>` SVG. |
| **PWA en cache** | `registerSW` applique la maj automatiquement si elle arrive <15 s après l'ouverture (`src/main.tsx`). Sinon simple toast. Ne pas casser ça. |
| **AudioContext unique** | `getCtx()` dans `core/audio.ts` est partagé sons + musique, avec `resume()` auto (iOS). Ne pas créer un second contexte. |

---

## 6. Ce qui BLOQUE et dépend de l'utilisateur 🔑

### a) Pas de base de données — critique
Tout est en `localStorage` (clé `ferme:v2`) : profils, photos (dataURL), voix
enregistrées, progression. **Un nettoyage du navigateur efface tout.** Le quota
(~5 Mo) est aussi un risque : les photos et l'audio y sont stockés en base64, et
zustand-persist échoue **silencieusement** au dépassement.

Ce qu'il faut : **Supabase** (offre gratuite suffisante) ou équivalent.
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
`snowman` (⭐ le meilleur candidat 3D : sculpter des boules en 3D) · `pizza` (bac à sable façon Toca
Kitchen, en 3D) · `chamboule` (doublon du `stand3d`, à **supprimer** au profit
de la version 3D) · `caterpillar` · `socks` · `space` (les planètes mériteraient
d'être de vraies sphères 3D texturées) · `geo` (zoom caméra 3D)

**🟠 Jeux d'action au rendu daté (Pixi 2D, sprites = emoji ou SVG)**
`catch` · `mole` · `run` · `fish` · `ninja` · `flappy` · `popcorn` · `balloon`
→ tous gagneraient à passer sur de vrais sprites (Kenney) plutôt qu'une réécriture.

**🔵 Références à imiter**
`icetower` — **la référence de GAMEPLAY** (un geste, échec réel, adresse mesurable).
`stand3d` — la référence de **rendu 3D** (IBL, ombres, physique).
Tout nouveau jeu doit passer les deux tests : *« un joueur adroit fait-il mieux ? »*
et *« est-ce que ça ressemble à un jeu ? »*.

**🗑 Supprimés sur retour utilisateur**
`igloo` (« pose le bloc sur la case qui brille » = formulaire, aucune adresse) →
remplacé par `icetower`. `FarmHub` (accueil ferme : « nul et sans intérêt ») →
retour à la grille de jeux.

**⚪ Sans score, à laisser tranquilles**
`fireworks` · `dressup`

---

## 8. État git & déploiement

| | |
|---|---|
| Repo | `keryprophez/girlz-games` (public) |
| Branche **par défaut** | `claude/magic-farm-game-q66bw4` ← **c'est elle que `deploy.yml` publie** |
| `main` | maintenue au même commit (miroir) |
| Branche de travail | `claude/winter-games-pizza-maker-35tmjc` |
| Dernier commit | `e9fea93` (3D + retrait de l'addiction) |
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

Il ne veut pas d'un catalogue de 38 mini-jeux inégaux. Il veut **peu de jeux, mais
qui ressemblent à de vrais jeux** — visuels et physique modernes. Quand il faut
choisir entre « ajouter un 39ᵉ jeu » et « amener un jeu existant au niveau
`stand3d` », **choisir la seconde option**.

Voir `ROADMAP.md` pour l'ordre de bataille.
