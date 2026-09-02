# 🔬 Audit complet — 2 septembre 2026

> Point de départ, ton mot : *« ce qu'on a fait c'est majoritairement de la
> daube. Plutôt que faire 50 jeux nuls, on part des bons, on les optimise, on
> itère. »*
>
> Méthode : les 36 fichiers de jeux, le socle, les composants, le CSS, les
> scripts et la CI lus **en entier** par quatre auditeurs (action 3D · 3D
> créatif + 2D Jouer · Apprendre + Créer · socle technique), puis les 37 jeux
> **joués et capturés** dans Chromium (deux captures par jeu, au montage et
> après interaction). Ce document remplace l'audit du 26/07, dont la coupe
> n'avait jamais été appliquée dans `index.ts`.

---

## 1. Le diagnostic en cinq phrases

1. **Il n'y a pas 37 jeux, il y a 8 vrais jeux** noyés dans 29 exercices,
   démos, formulaires et doublons. L'accueil qui annonce « 37 jeux » est le
   symptôme : le catalogue dilue ce qui est bon.
2. **Tout est enfermé dans une page web.** Titre, sous-titre en texte, chips
   HUD en emoji, puis une arène de 55 % de largeur dans une carte arrondie sur
   fond beige. Un jeu pro est plein écran et son HUD vit dans la scène. C'est
   *ça*, le « petit jeu pourri » ressenti, et ça touche les 37 jeux d'un coup.
3. **Gagner et perdre se ressemblent.** `finish()` démonte le jeu avant la
   modale (l'écroulement de la tour, le crash du tracteur : jamais vus) et
   lance confetti + feux d'artifice sur « 0 barrières passées, 1 étoile ».
   Aucun jeu n'a d'outro, de ralenti, de near-miss, de rampe liée à la
   performance.
4. **Le socle 3D est bon, mais il manque le moteur de jeu au-dessus** : vies,
   score, combo, rampe, timers simulés, HUD, cérémonie de fin sont recopiés
   dans chaque fichier (34 HUD bricolés, 14 barèmes d'étoiles, 32 drapeaux
   `running`), deux jeux 3D contournent même `createStage`.
5. **Les docs mentent** (igloo, FarmHub, PixiJS, « 38 jeux », un smoke test
   décrit qui n'existe pas) et **le dernier commit a une régression visible** :
   l'écran de récompense affiche le mot « dog » à la place du sprite.

Ce qui est **solide et à garder** : le contrat `mount(ctx) → cleanup` ;
`core/three3d.ts` (IBL, ACES, ombres, pas fixe, nettoyage GPU) ;
`core/impact.ts` avec ses 24 foley ; la musique générative ; le minuteur
parental ; la sauvegarde exportable ; le pipeline d'assets CC0 ; les bots de
jeu en CI ; et quatre boucles de jeu déjà justes (`icetower`, `ninja`, `mole`,
`caterpillar`).

---

## 2. Ce que montrent les captures

| Vu à l'écran | Conséquence |
|---|---|
| Toutes les arènes 3D sont une carte arrondie de ~560 px de large au milieu d'une page beige, avec titre, sous-titre et chips au-dessus. Le mode « grand écran » ne fait qu'élargir la carte à 1100 px. | La 3D n'est jamais immersive. C'est un widget. |
| Attrape : ciel bleu marine, « grange » = plan brun, deux cubes, un bol blanc. | Le jeu 3D le plus visible de la ferme a le décor le plus pauvre. |
| Ninja : scène sous-exposée, arbres = sphère sur cylindre, fruits qui volent dans le tiers bas seulement. | Bon jeu, mauvais décor, un tiers d'écran inutilisé. |
| Poussin Volant : ciel nuit uni, nuages = 3 sphères grises, fleurs = sucettes. Fin de partie « Bel envol ! » + confetti pour 0 barrière. | La défaite est fêtée. |
| Tour de Glace : sapins en cônes, sol plat, aucun sillage ; la modale arrive avant l'écroulement. | Le meilleur jeu du projet coupe son propre climax. |
| Course : modale de fin « dog » en texte brut dans l'encart récompense. | Régression du commit « Memory et Album en sprites ». |
| Tape-Trous, Marché, Intrus, Chenille, Bonhomme, Stand, Pizzeria, Espace : rendu propre. | Ce sont les seuls qui « tiennent » visuellement. |
| Puzzle Photo, Memory, Simon, Cache-Cache, Feu d'artifice : emoji comme sprites, dos de cartes « ? », village 🏠🏠⛪. | Le reproche « rempli d'émoticônes » est encore vrai dans un tiers des jeux. |
| Apprendre : `clock`, `tables`, `market` ont une vraie architecture (Explore → Trouve → Fais). `letters` ne montre jamais le mot à trouver. `geo` = 4 taps sur l'animal déjà visible. | Trois outils réels, quatre contrôles déguisés. |

---

## 3. Verdict jeu par jeu

Notes /10 : **M** mécanique · **R** rendu · **F** feel · **E** adapté à 6 ans
sans lecture. Les « bugs » cités sont vérifiés dans le code.

### 3.1 Action 3D (10)

| Jeu | M | R | F | E | Verdict | Le point décisif |
|---|---|---|---|---|---|---|
| `icetower` | 8 | 6 | 6 | 8 | **GARDER, investir** | Contourne `createStage` et `iceMaterial` ; balancier sans son ni rampe ; l'écroulement n'est jamais vu (`running2=false` puis `finish()` immédiat). |
| `ninja` | 7 | 6 | 7 | 8 | **GARDER, investir** | Pas de bonus multi-tranche en un trait ; lame sans DPR (floue sur tablette) ; fruits confinés au tiers bas ; moitiés toujours coupées à l'horizontale. |
| `caterpillar` | 7 | 5 | 4 | 7 | **GARDER, investir** | Clôture dessinée mais bords traversants (contradiction visuelle) ; corps = billes qui sautent, pas une chenille ; `setInterval` réarmé à chaque fruit (saut de phase) ; zéro particule à la bouchée. |
| `catch` | 5 | 5 | 4 | 8 | **GARDER, refaire le cœur** | Le panier n'a pas de corps physique : le fruit disparaît en vol. Les vagues ne changent rien (G écrase `speed`). Médaillon photo dans le couloir de chute. |
| `flappy` | 6 | 5 | 5 | 5 | GARDER, socle runner commun | Aucune rampe ; rebond automatique au sol ; le plus punitif pour Jade. |
| `run` | 4 | 5 | 4 | 8 | GARDER, socle runner commun | Deux boucles rAF ; saut de 1,74 m pour des obstacles de 0,4 m ; une seule situation de jeu ; obstacles supprimés encore à l'écran. |
| `stand3d` | 5 | 6 | 6 | 6 | GARDER, en dernier | Contourne `createStage` ; démo physique sans manches ; fuite WebGL si on quitte pendant `await` ; puissance en pixels non normalisée. |
| `fish` | 3 | 4 | 4 | 7 | **SUPPRIMER** (ou refaire une autre pêche) | Barre de timing à une dimension ; fenêtre de 0,25 s à la 8ᵉ prise en *easy* ; poisson = modèle « à cuire » du kit food. |
| `popcorn` | 3 | 4 | 3 | 7 | **SUPPRIMER** (greffer la fenêtre « prêt/brûlé » dans `mole`) | Marteler la poêle gagne ; gameplay sur `setTimeout` mural ; pop-corns qui flottent au-dessus de la table. |
| `balloon` | 1 | 3 | 4 | 8 | **SUPPRIMER** | Test de fréquence de tap ; *easy* imperdable seulement à ≥ 3,5 taps/s pendant 34 s. |

### 3.2 3D créatif et Jouer 2D (14)

| Jeu | M | R | F | E | Verdict | Le point décisif |
|---|---|---|---|---|---|---|
| `mole` | 8 | 7 | 8 | 8 | **GARDER, patron 2D** | Taper à vide ne coûte rien ; rampe à secondes fixes ; `💥` emoji. |
| `snowman` | 4 | 7,5 | 6 | 7 | **GARDER (Créer)** | Meilleur rendu du projet, mais la boule est *téléportée* sur la pile au moment de poser ; habillage = formulaire 6 onglets ; `impact()` non branché. |
| `maze` | 7 | 5 | 6 | 7 | GARDER, retirer le mode 3D | Le « 3D » est un raycaster 160 colonnes façon 1992 ; doigt rapide décroche (pas de Bresenham) ; mur heurté = silence. |
| `taquin` | 7 | 6 | 6 | 7 | GARDER, absorbe `puzzle` | Par = nombre de coups de mélange, pas une distance ; coup illégal muet. |
| `memory` | 7 | 6 | 6 | 8 | GARDER, absorbe `socks` | Dos = `❓` ; aperçu de 3,4 s en expert vide le défi. |
| `simon` | 7 | 3 | 5 | 5 | GARDER, polir (94 lignes) | Vrai game over ✓ ; pads emoji, bips, tour signalé par du texte. |
| `connect4` | 7 | 6 | 6 | 8 | GARDER + IA | **Bug** : seule la dernière pièce scintille, pas la ligne (l.73-78) ; sans IA on joue contre soi. |
| `pizza` | 3 | 7 | 5 | 6 | REFONDRE « service » ou geler en Créer | **Bug probable** : cuisson écrase `scale` absolu → fromage 5-10× trop gros avec les glTF (l.553) ; olive = demi-oignon ; four ne brûle jamais. |
| `socks` | 5 | 6 | 6 | 6 | FUSIONNER → `memory` | Memory sans la mémoire ; chaussettes 58 px dans 900 px de vide ; pénalité en texte. |
| `puzzle` | 4 | 5 | 6 | 8 | FUSIONNER → `taquin` | Carrés à poser sur leur ombre ; `FALLBACK_SVG` copié-collé de taquin. |
| `battleship` | 4 | 3 | 5 | 5 | **SUPPRIMER** | 100 % emoji, hasard pur, passage de tablette expliqué en texte. |
| `space` | 2 | 7 | 4 | 7 | → Apprendre, geler | Documentaire à 8 taps ; `ibl` non désactivé (contredit le socle) ; anneau triplement incliné ; voix lit une consigne. |
| `patterns` | 3 | 5 | 5 | 8 | → Apprendre | **Bug** : révélation de la bonne réponse comparée par `innerHTML` re-sérialisé, jamais vraie (l.108). |
| `mirror` | 4 | 4 | 4 | 6 | → Apprendre | Aucun retour sur case fausse : une enfant bloquée sans indice. |

### 3.3 Apprendre (7) et Créer (6)

| Jeu | Péda/Créa | R | F | E | Verdict | Le point décisif |
|---|---|---|---|---|---|---|
| `tables` + `additions` | 8 | 5 | 6 | 5 | **GARDER, pièce maîtresse** | La fabrique `createBoard` est le meilleur code du projet ; cases à `opacity:.28` et police 8,5 px : illisible sur tablette. |
| `clock` | 8 | 6 | 6 | 5 | **GARDER, pièce maîtresse** | Le drag des aiguilles est enfermé dans le mode le plus dur ; « 1 heures moins le quart ». |
| `market` | 7 | 7 | 7 | 6 | GARDER | La voix ne dit pas le total courant (le geste pédagogique du marché). |
| `dressup` | 6 | 6 | 5 | 8 | GARDER, patron Créer | Le look ne se sauve qu'au bouton final ; `ctx.look` n'est plus lu par **aucun** jeu (la promesse du README est morte). |
| `beatbox` | 6 | 4 | 5 | 7 | GARDER | Horloge en `setTimeout` (jitter) ; icônes dessinées à la main alors que l'atlas a cow/pig/duck. |
| `intrus` | 5 | 8 | 7 | 5 | GARDER sans chrono | Chrono + bonus vitesse dans un exercice = contraire à la règle « Apprendre sans sanction » ; énoncés en négation écrite. |
| `fireworks` | 2 | 5 | 8 | 9 | GARDER (jouet) | Canvas sans DPR (flou 2×) ; village emoji. |
| `piano` | 4 | 5 | 5 | 8 | GARDER, sons réels | **Crash** si on quitte dans les 900 ms après une chanson (`pn` null, l.48). |
| `geo` | 4 | 6 | 6 | 5 | REFONDRE ou SUPPRIMER | L'animal est dessiné sur la ville dès le début : 4 taps sans décision ; 9 consignes lues à la voix. |
| `coloring` | 3 | 4 | 3 | 8 | REFONDRE (atelier) | Rien n'est sauvegardé ; « Joli début » = 2 étoiles pour une création. |
| `letters` | 3 | 3 | 6 | 2 | REFONDRE | Le mot à trouver n'est ni montré, ni dit, ni illustré : essai-erreur sanctionné. |
| `quiz` | 3 | 6 | 6 | 3 | FUSIONNER → `tables` | Vies + série bonus + étoile de série dans un exercice ; redondant avec les modes de `tables`. |
| `farmArt.ts` | — | — | — | — | **SUPPRIMER** | Code mort depuis le passage d'Attrape en 3D. |

### 3.4 Le catalogue cible

**Jouer (9)** `icetower` · `ninja` · `mole` · `catch` · `caterpillar` · `run` ·
`flappy` · `maze` · `taquin` — plus `memory`, `simon` et `stand3d` en second rang.
**À deux** `connect4` (+ IA pour jouer seule) et le Défi à deux sur les jeux d'adresse.
**Apprendre (6)** `clock` · `tables` · `additions` · `market` · `intrus` · `space`
(+ `patterns`, `mirror` en exercices secondaires).
**Créer (5)** `snowman` · `dressup` · `beatbox` · `piano` · `fireworks`.
**Sortent** `balloon` · `popcorn` · `fish` · `battleship` · `socks` (dans memory) ·
`puzzle` (dans taquin) · `quiz` (dans tables) · `farmArt` · le mode 3D de `maze`.
**En attente d'une décision** `pizza` (refonte « service » ou gel) · `geo` ·
`coloring` · `letters`.

De 37 à **~20 entrées, dont 9 à 12 jeux**. Et on n'affiche plus le nombre.

---

## 4. Ce qui manque structurellement (les huit manques communs)

Ce ne sont pas dix problèmes par jeu, ce sont les mêmes manques partout.

1. **Personne ne voit sa mort, et perdre est fêté.** `GameHost.finish()` → `safeCleanup()` puis modale ; confetti et feux d'artifice quels que soient les résultats. Il faut un *outro* : 1 à 1,5 s de ralenti, caméra qui recule, musique qui s'éteint, *puis* le score — et une cérémonie différente pour 1 étoile.
2. **La difficulté ne monte pas avec la performance.** Aucune rampe (popcorn, flappy, balloon, stand3d), rampe cosmétique (catch, icetower), rampes à marches horaires (ninja, catch). Le standard : la difficulté est fonction de ce que la joueuse réussit, continue, plafonnée ; la partie finit par la mort, pas par un chrono de 45 s.
3. **Pas de « presque ».** Aucun near-miss signalé. C'est le « ouf ! » qui fait rejouer.
4. **Le combo est un chiffre dans un div.** Pas de couche musicale ajoutée (la musique générative est faite pour ça), pas de teinte, pas de multi-action.
5. **Le feedback est du texte.** `toast('🌶️ Trop piquant !')`, `flash('Vague 2 !')`, `.hint`, « À toi ! », « Manche 1/3 », « Coups : 12 ». Règle 2 du projet violée en petites touches partout — et `ctx.say()` n'est appelé par aucun jeu d'action.
6. **Les gestes sonnent synthétique.** Le foley des chocs est réel, mais tranche, saut, flap, pas, prise, clic sont des `tone()`. Un jeu Flash c'est 50 % de son.
7. **Caméra statique dans 9 jeux 3D sur 10.** `orbitCam()` existe et aucun jeu d'action ne l'utilise ; la secousse est un `transform` CSS sur `#root`, HUD compris.
8. **Des primitives à la place d'un décor.** Trois recettes d'arbres faites main (ninja, run, icetower) alors que `holiday/tree-snow-*.glb` est là ; nuages, fleurs, fanions, éclats = sphères et cônes. Un seul kit glTF utilisé (`food`). Pas de mascotte, pas de personnage : la joueuse est un autocollant photo qui flotte.

Et la cause des huit : **~120 lignes recopiées par jeu** (mount async + `dead` + loader + stage + sol + HUD + timer + `finish` + cleanup). Tant que c'est dupliqué, chaque amélioration se fait dix fois.

---

## 5. Stack technique — verdict

| Choix | Verdict | Pourquoi |
|---|---|---|
| React 18 + zustand pour la coquille | **Garder** | Coquille petite (Home 214 l., GameHost 264 l.). |
| Jeux en TS vanilla dans un div, contrat `mount → cleanup` | **Garder le principe**, corriger l'exécution | État en singleton de module (`let ca: any = null`) → impossible à instancier deux fois, impossible à tester, timers qui survivent à un remontage (bug commun aux 12 jeux Apprendre/Créer, crash `piano.ts:48`). |
| three.js 0.185 + cannon-es 0.20 à la demande | **Garder** | Chunks bien séparés (three 190 Ko gz, cannon 36 Ko gz). cannon-es n'a plus de release depuis 2022 ; Rapier (WASM) est l'alternative si la physique devient centrale. Pas urgent. |
| Pas de moteur (Phaser, Pixi, Babylon, PlayCanvas) | **Correct, ne pas en ajouter** | 13 jeux tournent sur `three3d.ts`. Ce qui manque n'est pas le rendu mais ~1 000 lignes de « moteur de jeu » au-dessus (cycle de vie, entrées, HUD, tween, particules en scène). Migrer 13 jeux vers Babylon coûterait plus et n'apporterait rien aux jeux 2D. |
| `strict: false`, pas de lint, pas de tests unitaires | **Handicap réel** | `tsc --strict` ne sort **qu'une** erreur : le vrai trou, c'est 132 `: any` + 56 `as any` (l'état de chaque jeu 3D est `any`). Quatre `eslint-disable` pour un ESLint non installé. Zéro `vitest`. |
| Vite 6 + vite-plugin-pwa | **Garder** | Mais `index-*.js` = 430 Ko et contient les 37 jeux (imports statiques) : aucun jeu n'est chargé à la demande, et le CSS par jeu (60 % des 1 153 lignes de `global.css`, 47 classes mortes, 5 sélecteurs définis deux fois) ne peut pas être colocalisé. |
| `localStorage` unique via `zustand/persist` | **À corriger** | Re-sérialise tout (photos, 4 clips vocaux, image du puzzle) à chaque `set` : 0,3-0,6 Mo de `JSON.stringify` synchrone à chaque récompense. Le risque réel n'est pas le quota mais l'éviction Safari (7 jours sans installation). Blobs → IndexedDB, état léger → localStorage. |
| Étape D « Supabase » de la ROADMAP | **Abandonner** | Photos et voix dans un Storage cloud contredit la règle 3 (« photos et voix restent locales »). Export/import JSON + IndexedDB suffisent. |
| Assets | **Pipeline sain, couverture insuffisante** | Atlas `tiles` (126 Ko) chargé par aucun jeu ; les planches sont gardées entières (d'où la neige dans `nature`) ; pas de kit décor 3D, pas de mascotte, pas de kit d'icônes UI (d'où 481 lignes d'emoji dans `src/`), pas de SFX de gestes. |
| CI : smoke + bots | **Bonne idée, angles morts** | Le smoke passe si un jeu 3D reste bloqué sur son loader ; il n'utilise pas `serviceWorkers: 'block'` (le piège documenté) ; il ne teste qu'en portrait 480×860. Les bots **se sautent en silence sans WebGL** : la CI n'a jamais prouvé la 3D. Aucune capture de référence, aucune mesure de fps sur la vraie tablette. |

---

## 6. Règles du projet à trancher (elles sont contredites dans le code)

1. **La voix et les consignes.** `CLAUDE.md` : « `say()` ne lit que le contenu pédagogique, jamais les consignes ». `types.ts:22` documente l'inverse (« consignes, questions »). `geo` lit 9 consignes, `space` en lit une. **Proposition** : autoriser une consigne courte dite *une fois* au démarrage d'une partie (une non-lectrice de 6 ans en a besoin), interdire les consignes en cours de jeu au profit de la démonstration visuelle et des sons distincts. À valider.
2. **Sanction dans Apprendre.** `quiz` a des vies et une étoile de série, `intrus` un chrono et un bonus vitesse. L'audit de juillet disait « exercices → aucune défaite ». À retirer.
3. **Bacs à sable notés.** `coloring` donne 2 étoiles pour un dessin « pas fini ». Les cinq jeux Créer passent par la modale d'étoiles. **Proposition** : `cat: 'creatif'` → pas de modale, un bouton « garder dans l'album ».
4. **Le nombre de jeux affiché.** « 37 jeux pour rêver » à l'accueil va disparaître de fait. À assumer : on ne compte plus.

---

## 7. Roadmap proposée

Principe : **une itération = un jeu**, livrée, jouée, capturée, avec son bot.
Avant ça, deux sessions de fondations qui bénéficient à tous.

### Phase 0 — Couper et assainir (1 session)

- Appliquer la coupe du §3.4 dans `src/games/index.ts` ; supprimer `balloon`,
  `popcorn`, `fish`, `battleship`, `farmArt`, le raycaster de `maze` ; fusionner
  `quiz` → `tables`, `socks` → `memory`, `puzzle` → `taquin` ; déplacer `space`,
  `patterns`, `mirror` en Apprendre.
- Corriger les régressions et bugs nets : sticker « dog » en texte, `connect4`
  ligne gagnante, `patterns` révélation, `pizza` échelle à la cuisson, `piano`
  crash au démontage, `space` `ibl:false`.
- Hygiène : 47 classes CSS mortes, 20 exports morts, atlas `tiles`, docs
  (`CLAUDE.md`, `README.md`, `ROADMAP.md`, `smoke.mjs`, `play.mjs`),
  `strict: true`, `noUnusedLocals`, ESLint, `vitest` installé.
- CI : smoke en paysage avec `serviceWorkers: 'block'` et attente réelle de la
  fin du chargement ; bots avec `--use-gl=swiftshader` pour qu'ils **tournent**
  en CI au lieu de se sauter.

### Phase 1 — La coquille de jeu et le moteur d'arcade (2 à 3 sessions)

C'est le chantier qui change les 20 jeux d'un coup.

- **Plein écran immersif** : l'arène = le viewport ; titre et sous-titre
  disparaissent en jeu ; HUD en icônes SVG (kit UI CC0) *dans* la scène ;
  bouton maison discret ; plus aucun emoji dans la coquille.
- **Cycle de vie** dans `GameHost` + `three3d` : outro gagner/perdre
  différencié (ralenti, caméra, silence, puis score), pause sur
  `visibilitychange` et sur le minuteur parental, `unhandledrejection` → écran
  Oups, loader avec timeout et progression, jeton de partie qui tue les timers
  orphelins.
- **`core/arcade.ts`** : score, vies, combo, rampe fonction de la performance,
  `simMs` (plus jamais `setTimeout` mural pour du gameplay), near-miss, barème
  d'étoiles par tier, HUD standard.
- **`core/scene3d.ts`** : sol, décor (kit glTF nature/ferme importé une fois),
  `toScreen()`, pool de particules GPU (`Points` + `dotTex`), secousse caméra,
  `follow()`, `timeScale`.
- **`core/rounds.ts`** et **`core/exercise.ts`** : manches sans temps mort,
  QCM avec second essai, barre de modes — pour les 2D et Apprendre.
- **Sons de gestes** : tranche, saut, flap, pas, prise, clic (Kenney, CC0) via
  `import-assets.mjs` ; bus musique / effets / voix avec ducking.
- **Preuve** : `icetower` et `ninja` migrés dessus, capturés, comparés.

### Phase 2 — Itérer, un jeu par session

Ordre proposé, du plus rentable au moins : `icetower` (métronome, porte-à-faux
qui casse, rampe, écroulement joué) → `ninja` (multi-tranche, plein écran,
whoosh) → `mole` (tap à vide coûte, rampe par combo, fenêtre prêt/brûlé) →
`catch` (vrai panier physique, indicateur de chute) → `caterpillar` (corps
continu, tic de pas, bords tranchés) → `run` + `flappy` sur un socle runner
commun → `snowman` (rouler jusqu'à la pile, habillage par drag) → `maze` ·
`taquin` · `memory` · `simon` · `connect4` (polish 2D) → `clock` · `tables` ·
`market` (drag partout, voix sur les cibles, plateau plein écran) → `dressup` ·
`beatbox` → `stand3d` (manches enchaînées).

Chaque itération : une demi-page de design (geste, enjeu, rampe, outro, sons),
l'implémentation, un bot qui gagne, une capture de référence commitée.

### Phase 3 — Ce qui fait « un jeu » plutôt que vingt

- **Personnage partagé** : un glTF animé (idle / bravo / raté) avec la photo de
  la joueuse en visage, en scène dans les jeux 3D et en sprite dans les 2D ;
  `ctx.look` enfin lu.
- **Coopération à deux doigts** sur la même tablette (Attrape, Taupe, Ninja) :
  la seule fonctionnalité « à deux » qui n'existe pas encore.
- **L'Atelier** (refonte de `coloring`) : pinceau, tampons Kenney, pages
  générées depuis les silhouettes des sprites, annuler, album.
- Chargement paresseux par jeu + CSS colocalisé ; IndexedDB pour les blobs.

---

## 8. Ce qu'il faut de toi

- Valider la coupe (§3.4) et les quatre arbitrages du §6.
- Le modèle de tablette, pour mesurer les fps réels avant de régler
  `pixelRatio`, ombres et bloom.
- Décider pour `pizza` : refonte « service » (un client commande, la pizza
  peut brûler, on livre) ou gel en Créer.
