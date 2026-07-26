# 🔬 Audit des 38 jeux — mesuré, pas estimé

> Retour utilisateur portant sur **TOUS** les jeux : *« graphismes encore
> dégueulasse, 3d dégueulasse, physique dégueulasse »* + *« à quoi sert de faire
> de la 3D si c'est pour avoir un truc aussi pourri »* + *« trouve comment faire
> un jeu au niveau des jeux Flash, QUI EUX SONT PLAISANTS À JOUER »*.
>
> Ce document est l'audit chiffré qui en découle, et la conclusion : **le problème
> n'est pas réparable jeu par jeu, il est architectural.**

---

## 1. La mesure qui explique tout

Comptage automatique sur les 38 fichiers de `src/games/` :

| Mesure | Résultat |
|---|---|
| Jeux où une partie peut **se perdre** | **9 / 38** |
| Jeux avec une **difficulté qui monte** en cours de partie | **6 / 38** |
| Jeux avec un **plafond d'adresse** (mieux jouer = visiblement mieux) | **~12 / 38** |

**29 jeux sur 38 ne peuvent pas être perdus.** Ce n'est pas un détail d'équilibrage,
c'est la cause racine du « pas plaisant à jouer ». Sans risque de perdre, il n'y a
pas de tension ; sans tension, aucune satisfaction à gagner. Les jeux Flash étaient
souvent moches **et durs** — c'est la dureté qui les rendait addictifs au bon sens
du terme.

⚠️ Rappel de la contrainte du projet : « pas d'addiction » = pas de monnaie, pas de
paliers, pas de rappels quotidiens. **Ça n'a jamais voulu dire « pas de
difficulté ».** Les deux axes sont indépendants. Cette confusion est l'erreur
d'origine.

---

## 2. Le problème est architectural, pas par jeu

Réparer 38 jeux un par un = 38 fois le même travail, et le résultat restera
hétérogène. Il manque **trois couches partagées**, à construire une seule fois :

### Couche A — L'ART (la seule réponse à « graphismes dégueulasse »)
Aujourd'hui : chaque jeu dessine sa propre chose, en SVG écrit à la main, en
emoji, ou en primitives 3D. 38 styles ≠ un style.
→ **Un kit unique** : un atlas de sprites 2D + un jeu de modèles glTF stylisés,
une palette, un traitement d'ombre commun. Tout jeu tire de ce kit, rien ne
dessine « à la main ». La session en cours a commencé (`public/assets/` Kenney,
`src/core/three3d.ts`) : **c'est la bonne direction, il faut l'imposer partout.**

### Couche B — LE FEEL (la réponse à « physique dégueulasse »)
Aujourd'hui : chaque jeu recopie ses réglages physiques et ses animations.
→ **Un module unique** avec des valeurs éprouvées : pas de temps fixe, masses et
frottements cohérents, endormissement rapide des corps, plus impact = *screen
shake* + particules + son proportionnels à la violence du choc, appliqués par le
`GameHost` et non par chaque jeu. Un choc doit **se sentir** partout pareil.

### Couche C — LES RÈGLES (la réponse à « pas plaisant »)
→ **Contrat imposé à tout ce qui s'appelle « jeu »** :
1. **un seul geste** (un tap, un glissé — pas un assistant en 6 étapes) ;
2. **on peut perdre** (vies, chrono, collision) ;
3. **réessai en moins d'une seconde** (pas de modale, pas d'attente) ;
4. **ça accélère** (vitesse, taille, densité) ;
5. **un joueur adroit fait visiblement mieux.**

Ce contrat devrait être vérifié par le smoke test, pas seulement par de la bonne
volonté.

---

## 3. Verdict par jeu, et coupe proposée

### 🎮 Les 10 VRAIS jeux à garder (et à amener au même niveau)

| Jeu | État | Ce qui manque |
|---|---|---|
| 🏔 Tour de Glace | ✅ passe tout | matière (modèles, glace crédible) |
| 🐦 Poussin Volant | ✅ échec réel | art + feel |
| 🥷 Ninja Verger | ✅ échec + montée | art + feel |
| 🎯 Le Stand | ✅ physique + visée | fusionner avec `chamboule` (doublon) |
| 🏃 Course | ✅ échec réel | art + feel |
| 🎣 Pêche Précise | ✅ timing | art + feel |
| 🐛 La Chenille | ⚠️ **la mort a été retirée** | remettre la mort |
| 🍄 La Taupe | ⚠️ aucune sanction | rater doit coûter |
| 🎈 Gonfle le Ballon | ⚠️ éclater ne punit pas | éclater = partie finie |
| 🎵 Simon | ⚠️ aucun game over | une erreur = fin |

### 📚 À ASSUMER comme exercices (ce ne sont pas des jeux — et c'est très bien)
`quiz` · `intrus` · `letters` · `patterns` · `mirror` · `clock` · `tables` ·
`additions` · `market` · `geo` (Loupe) · `space` (Espace)
→ Les sortir de la catégorie « jeux » : un espace **« Apprendre »**. Ils sont
utiles et bien faits **en tant qu'exercices**. Les vendre comme des jeux est ce qui
donne l'impression d'un catalogue creux.

### 🎨 À ASSUMER comme bacs à sable (sans score, volontairement)
`coloring` · `dressup` · `snowman` · `piano` · `beatbox` · `fireworks` · `puzzle`
→ Un espace **« Créer »**. Aucun échec attendu ici, c'est légitime.

### 👭 À garder tels quels (jeux à deux, la règle fait le sel)
`connect4` · `battleship` · `memory` · `taquin` · `maze`

### 🗑 À SUPPRIMER
- **`pizza`** — assistant en 6 étapes, zéro adresse. Le cas d'école du faux jeu.
  À refaire un jour en bac à sable libre (façon *Toca Kitchen*), ou à supprimer.
- **`igloo`** — « pose le bloc sur la case qui brille » = formulaire. Le passer en
  3D n'y change rien : le problème est la mécanique. Remplacé par `icetower`.
- **`socks`** · **`popcorn`** — pression molle, rater ne coûte rien. Fusionnables
  dans un seul jeu de réflexes correctement sanctionné.
- **`chamboule`** — doublon 2D de `stand3d`.
- **`caterpillar`** — à garder **seulement** si la mort revient.

**Résultat de la coupe : 10 jeux + 3 espaces assumés**, au lieu de 38 items
présentés à tort comme équivalents.

---

## 4. Ordre de travail recommandé

1. **Couche C d'abord** (les règles) — c'est gratuit et c'est ce qui change le
   plaisir : remettre la mort dans la Chenille, sanctionner la Taupe, tuer le
   Ballon qui éclate, terminer Simon sur erreur. **4 fichiers, un après-midi.**
2. **Couche B** (le feel) — un module physique + impact partagé, branché dans le
   `GameHost`. Bénéficie d'un coup aux 10 jeux.
3. **Couche A** (l'art) — le kit unique, imposé aux 10 survivants. C'est le plus
   long, et ça exige les assets (déjà en place côté `main`).
4. **Restructurer l'accueil** en 4 espaces : **Jouer** (10) · **Apprendre** ·
   **Créer** · **À deux**. La grille reste, mais elle cesse de mentir.

**Ne pas commencer par l'art.** Un joli jeu sans enjeu reste ennuyeux — c'est
exactement ce que prouve l'igloo passé en 3D.
