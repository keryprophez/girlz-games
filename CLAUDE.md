# CLAUDE.md — La Ferme Magique

Webapp PWA de jeux pour **Jade (6 ans)** et **Joyce (8 ans)**, jouable hors-ligne
sur tablette. Commanditaire : le père. Il veut un **niveau professionnel** — des
vrais jeux, pas un catalogue de mini-jeux.

Docs longues : `PASSATION.md` (état honnête, pièges, verdict jeu par jeu) et
`ROADMAP.md` (ordre de bataille). Les lire avant un gros chantier.

---

## Règles non négociables ❌

1. **Aucune mécanique d'addiction.** Pas de monnaie, boutique, paliers de
   déblocage, série/streak, notification de rappel, « reviens demain ».
   Les étoiles sont un simple retour de fin de partie, rien de plus.
2. **Aucune lecture requise.** 6 ans = ne lit pas couramment. Icônes, voix,
   démonstration visuelle. `core/voice.ts` ne lit que le **contenu pédagogique**
   (multiplications, heures, noms de lieux), jamais les consignes.
3. **Hors-ligne obligatoire.** PWA, tout précaché. Aucun appel réseau au runtime.
4. **Pas de collecte de données enfants.** Photos et voix restent locales.
   Aucun analytique tiers.
5. **Français uniquement** : textes, commentaires de code, messages de commit.
   Et on se tutoie.

**Règle d'arbitrage** : entre « ajouter un jeu » et « amener un jeu existant au
niveau des jeux 3D », **toujours la seconde option**.

---

## Architecture

```
src/core/    types.ts (contrat GameDef) · store.ts (zustand+persist) · audio.ts
             music.ts (générative) · voice.ts · juice.ts · fx.ts · character.ts
             three3d.ts  ← SOCLE 3D PARTAGÉ, à lire avant tout jeu 3D
             backup.ts   ← export/import JSON + alerte quota localStorage
src/components/  Home · FarmHub · GameHost · PlayTimer · Backup · Album · …
src/games/       1 fichier par jeu + index.ts (le catalogue)
scripts/smoke.mjs  ouvre tous les jeux dans Chromium, vérifie 0 erreur JS
```

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
`toast()`, `say()`.

**Un nouveau jeu 3D part de `core/three3d.ts`** : `createStage()` applique déjà
antialias, pixelRatio plafonné à 2, ACES, PCFSoftShadowMap, `shadow.bias`,
lumières et brouillard. Puis `fixedStep()` pour la physique, `orbitCam()` pour la
caméra, `loadThree()`/`loadPhysics()` + `loader()` pour le chargement à la
demande, `stage.dispose()` pour le nettoyage GPU (et `stage.keep(tex)` pour les
textures non attachées à la scène).

Jeux déjà en vraie 3D : `stand3d` · `snowman` · `igloo` · `pizza` · `space`.

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
| **Smoke test + vue ferme** | L'accueil affiche la ferme, pas la grille : `scripts/smoke.mjs` bascule via `.hub-toggle`. Si tu changes l'accueil, mets à jour le smoke test. |

---

## Méthode de travail

1. `npm run build` (inclut `tsc -b`).
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
  demander. Procédure de livraison : voir `PASSATION.md` §8.
- CI : `npm ci` → `npm run build` → `npm run test:smoke` → Pages.
