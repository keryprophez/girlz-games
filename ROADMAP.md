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
- `pizza` **gelée** dans Créer : on n'y investit plus.
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

## Phase 1 — La coquille de jeu et le moteur d'arcade (à faire, 2-3 sessions)

Le chantier qui change tous les jeux d'un coup. **Plan détaillé à présenter
avant de coder.**

1. **Plein écran immersif** : l'arène = le viewport, titre et sous-titre
   disparaissent en jeu, HUD en icônes SVG dans la scène, bouton maison
   discret, plus aucun emoji dans la coquille.
2. **Cycle de vie** (`GameHost` + `three3d`) : outro gagner/perdre différencié
   (ralenti, caméra, silence, puis score), pause sur `visibilitychange` et
   minuteur parental, `unhandledrejection` → écran Oups, loader avec timeout,
   jeton de partie qui tue les timers orphelins.
3. **`core/arcade.ts`** : score, vies, combo, rampe liée à la performance,
   `simMs`, near-miss, barème d'étoiles, HUD standard.
4. **`core/scene3d.ts`** : sol, décor (kit glTF nature/ferme importé une
   fois), `toScreen()`, particules GPU, secousse caméra, `follow()`,
   `timeScale`. `pixelRatio` plafonné à 1,5 pour la Tab A9+, pas de bloom ni
   de réfraction tant que les fps ne sont pas mesurés.
5. **`core/rounds.ts`** et **`core/exercise.ts`** : manches sans temps mort,
   QCM avec second essai, barre de modes.
6. **Sons de gestes** (tranche, saut, flap, pas, prise, clic ; Kenney CC0) et
   bus musique / effets / voix avec ducking.
7. **Preuve** : `icetower` et `ninja` migrés dessus, capturés, comparés.

## Phase 2 — Un jeu par session (ordre proposé)

`icetower` (métronome, porte-à-faux qui casse, rampe, écroulement joué) →
`ninja` (multi-tranche, plein écran, whoosh) → `mole` (tap à vide coûte,
rampe par combo, fenêtre prêt/brûlé) → `catch` (vrai panier physique,
indicateur de chute) → `caterpillar` (corps continu, tic de pas, bords
tranchés) → `run` + `flappy` sur un socle runner commun → `snowman` (rouler
jusqu'à la pile, habillage par drag) → `maze` · `taquin` · `memory` · `simon` ·
`connect4` (polish 2D, IA du Puissance 4) → `clock` · `tables` · `market`
(drag partout, voix sur les cibles, plateau plein écran) → `intrus` (sans
chrono) → `dressup` · `beatbox` → `stand3d` (manches enchaînées).

Chaque itération : une demi-page de design (geste, enjeu, rampe, outro,
sons), l'implémentation, un bot qui gagne, une capture de référence.

## Phase 3 — Ce qui fait « un jeu » plutôt que vingt

- Personnage partagé glTF animé avec la photo en visage ; `ctx.look` lu.
- Coopération à deux doigts sur la même tablette (Attrape, Taupe, Ninja).
- L'Atelier (refonte de `coloring`) : pinceau, tampons, annuler, album.
- Chargement paresseux par jeu + CSS colocalisé ; IndexedDB pour les blobs.
- À décider plus tard : `geo`, `letters` (refonte ou sortie).

---

## Ce qui est déjà fait et qu'on ne refait pas ✅

- Vraie 3D + physique sur `core/three3d.ts` pour 11 jeux ; kits glTF `food`,
  `holiday`, `space` ; planches Kenney `animals`, `fish`, `nature`, `items` +
  icônes food, importées par `scripts/import-assets.mjs`.
- 24 foley Kenney branchés sur `core/impact.ts`.
- Musique générative 6 thèmes (`core/music.ts`), unique et sans fichier.
- Minuteur parental avec verrou « question de grand » (`PlayTimer.tsx`).
- Sauvegarde exportable + alerte quota (`core/backup.ts`).
- Difficulté adaptative silencieuse (`progress.adapt`).
- Médaillon photo dans la 3D (`avatarMedallion`).
- Anti-crash (ErrorBoundary + capture des erreurs runtime), maj PWA auto.
- Smoke test et bots de jeu en CI.
