# 🗺 Roadmap — moins de jeux, des vrais

> Les règles sont dans `CLAUDE.md`. Ce document ne dit que **où on en est**,
> **ce qui reste**, et **ce qui a été sorti ou refusé** (à ne jamais
> reproposer sans que le père le demande). Le journal détaillé d'avant le
> 27/10 est dans `git log` (et `git show 016005d:ROADMAP.md` pour l'ancien
> document en entier) ; l'histoire de chaque jeu est dans l'en-tête de son
> fichier.

Objectif : des jeux **plein écran, avec une vraie boucle** (enjeu, rampe liée
à la performance, near-miss, outro), au niveau des jeux Flash qu'on aimait. Un
jeu par itération, livré, joué, capturé.

---

## Le catalogue (27/10) — 30 jeux

| Univers | Jeux |
|---|---|
| **Jouer** (11) — on s'amuse, on peut perdre | La Tour de Glace · Ninja Verger · Le Flipper · Cache-Cache · Devine mon dessin · Labyrinthe · Puzzle (et son mode Taquin) · Memory · Le Chœur · Puissance 4 · Perles Miroir |
| **Apprendre** (9) — on travaille, jamais de sanction | Quelle heure ? · Le Potager (+ − × ÷) · Le Marché · L'Intrus · Le Tour du Monde · Voyage dans l'Espace · Suites Logiques · Chasse aux lettres · La Poste aux Phrases |
| **Créer** (10) — pas de note | Habille-toi · Les Bijoux · Petit Piano · Feu d'Artifice · L'Atelier · La Cuisine (pizza ou gâteau) · L'Animal qui répète · La Ferme à construire · Mon cartable · Les Monuments |

Jeux en vraie 3D : la Tour, le Flipper, Cache-Cache, Labyrinthe, Puzzle,
Memory, le Chœur, Perles Miroir, l'Espace, Suites Logiques, Tour du Monde,
Habille-toi, les Bijoux, la Cuisine, l'Animal qui répète, la Ferme à
construire, Mon cartable, les Monuments.

---

## En cours — le lot du 27/10 (plan validé : « GO », « pousse tout sur main »)

1. ✅ **Couper** : le choix de joueuse (masqué depuis le 10/09) et la
   princesse (partie le 6/10) sortent du code — une seule sauvegarde « famille »
   (`core/save.ts`, la conversion des anciennes testée) ; le code mort ; la
   Pizzeria et la Pâtisserie fusionnées en **La Cuisine** (`variants` dans la
   coquille : la pizza ou le gâteau à l'ouverture) ; CLAUDE.md et cette
   ROADMAP réduits de moitié.
2. **Les bugs** trouvés le 27/10 (relecture de tout le code par trois agents) :
   minuteurs qui survivent à un changement de mode, Devine mon dessin, écran
   de fin relancé par une tape de trop, chargement infini si la 3D échoue,
   Lettres, graines de la glace, Intrus, Espace, micro qui reste ouvert,
   portraits rendus en pleine partie, fuites de la Cuisine et des paillettes…
3. **Leviers 2 et 3** : `core/mine.ts` (une création par fille : cartes
   Jade / Joyce, photo, sauvegarde aux mêmes clés, « Changer », la poubelle
   pour la Ferme, le Cartable ET les Monuments, « Fini » protégé du double
   toucher) ; `core/touchcam.ts` (les doigts lus une fois pour toutes : objets
   qu'on tourne, plateau de la ferme ; le globe et l'Espace seulement si rien
   ne change à l'usage).
4. **Levier 4** : la mémoire du Potager (`facts.ts`) rendue générique, pour
   l'Horloge, le Tour du Monde, les Lettres et le Marché (tirage sans remise,
   un raté revient trois questions plus loin, rien ne fane).

## Ensuite — huit nouveaux jeux (choisis le 27/10, plan présenté)

- **Apprendre** : le Tracteur à programmer (codage de déplacements sur un pré
  quadrillé de la ferme) · le Géoplan (élastiques sur la plaque à picots des
  Perles ; le Tangram avait été refusé le 29/09).
- **Créer** : la Poterie (le tour, la peinture, le four) · l'Aquarium des
  dessins (son poisson dessiné devient une peluche qui nage, sans Claude) ·
  le Château de sable (moules, douves, la marée qui monte).
- **Jouer** : 1, 2, 3… Soleil ! · le Jeu des différences (deux fermes en
  diorama) · le Labyrinthe à bille (incliner la tablette).
- Méthode : par lots de deux ou trois, le décor 3D en maquette d'abord (« oui »
  du père), puis un jeu à la fois avec vignette, affiche, main et bot.
- **Questions ouvertes** : le Labyrinthe à bille, nouvelle tuile ou 4ᵉ mode du
  Labyrinthe ? L'épouvantail qui se retourne dans Soleil ?

## À mesurer sur la tablette (`?fps`)

Rien n'a encore été relevé sur la Tab A9+ : la Tour de Glace (une cinquantaine
de modèles du paysage d'hiver), le Chœur, le petit train, le Puzzle à 48
pièces, le Feu d'artifice pendant le bouquet, le Flipper, Cache-Cache la nuit
et sur la carte ×4, la Ferme à construire pleine (36 pièces, 20 animaux), la
Cuisine (gâteau plein, la pizza), Mon cartable à paillettes, la Tour Eiffel
des Monuments, les Bijoux (plaque pleine, douze pots), Perles Miroir (144
perles). Le seuil de la qualité automatique (30 ms) est à confirmer. Les jeux
qui rament sont à nommer par le père, un par un.

À essayer pour de vrai : le micro de l'Animal qui répète (volume, écho), la
voix sur la tablette, le premier vrai dessin de Devine mon dessin et de Mon
dessin prend vie (puis régler les consignes sur de vrais dessins).

## Idées en attente (ni faites ni refusées)

- **Partage** dans le Potager : la division avec les lapins, le reste que le
  chien vole — à décider après les retours des filles.
- Une **tournée de mesure** (`?tournee` : chaque jeu 3D 20 s avec son bot, un
  tableau à photographier) — proposée le 27/10, pas retenue pour l'instant.
- Demander au navigateur un **stockage persistant** pour les créations
  (`navigator.storage.persist()`) — proposé le 27/10, pas retenu.

---

## Les décisions qui tiennent

- **2/09** : un jeu par itération ; aucune consigne lue à voix haute ;
  Apprendre sans sanction ; pas de base cloud (photos et voix locales).
- **10/09** : la difficulté se choisit dans le jeu ; le choix de joueuse
  masqué (sorti du code le 27/10) ; plus de fenêtre d'export.
- **22/09** : l'album d'autocollants, le total d'étoiles et la difficulté
  adaptative silencieuse sortent (règle 1) — seule la meilleure note reste.
- **23/09** : le Potager en 2D illustré (planche Canva) plutôt qu'en 3D Kenney ;
  la mémoire des calculs est silencieuse, rien ne fane, rien ne se débloque.
- **27/09** : UN seul jeu de calcul, le Potager (+ − × ÷).
- **30/09** : les niveaux décalés d'un cran (« le plus facile dégage ») ; un
  petit nom sous chaque bouton ; la main qui montre ; `noTier` là où il n'y a
  pas de niveau.
- **6/10** : la fluidité sur la tablette avant le réalisme.
- **9/10** : hébergé sur Cloudflare, derrière un code d'accès ; la clé de
  Claude est un secret du Worker.
- **11/10** : Apprendre, c'est pour travailler (les Perles Miroir passent dans
  Jouer).
- **27/10** : une seule sauvegarde pour la famille ; la Cuisine.

## Sortis — ne pas les refaire sans demande

| Quoi | Quand | Pourquoi |
|---|---|---|
| Ballon, Pop-corn, Pêche, Bataille navale, Quiz, Chaussettes, Puzzle photo, `farmArt`, le Labyrinthe en 3D raycasté | 2/09 | la coupe de l'audit : « 50 jeux nuls » |
| La Loupe Magique (géographie de pays inventés) | 2/09 | n'apprend rien : une géographie VRAIE ou rien |
| Les Grands Tableaux × et + | 23-27/09 | remplacés par le Potager |
| La Course, le Stand 3D, Attrape | 24/09 | « la voiture c'est éclatée », « on enlève », le panier |
| Le mode Tableau du Potager | 25/09 | « pourquoi QUELQUES plantes » : une logique que rien ne montrait |
| Poussin Volant, Tape-Trous (et `core/runner.ts`) | 27/09 | « vire-les » |
| Le Bonhomme de neige | 28/09 | « supprime le bonhomme de neige » |
| La Boîte à rythme | 30/09 | « un peu nulle » : des cris coupés au temps sonnent mal |
| La Chenille | 30/09 | « elles aiment pas » |
| La princesse VRM (et compagnon, château, salle de bal) | 6/10 | « ça rame trop, ramène la moche tête ronde » |
| Les Cubes de l'alphabet en 3D | 6/10 | « je préférais la version 2D sans tes cubes moches » |
| Cache-Cache : changements de cachette, indices, « presque » (éclair, flamme) | 6/10 | « c'est ce qui simplifie encore + » |
| Le Chien de berger | 19/10 | « les filles trouvent ça nul » |
| Les bougies animées, le souffle au micro, la chanson de la Pâtisserie | 19/10 | « vire toute l'animation des bougies » |
| Le choix de joueuse, la Pizzeria et la Pâtisserie séparées | 27/10 | coupes proposées et validées |

**Allers-retours** : la Chenille et Poussin Volant en 2D illustrée (25/09),
retirés le soir même (« mille fois moins bien que la version isométrique ») ;
le Ninja repassé en 2D (24/09, à la demande : « les fruits trop grossiers »).

## Refusés — propositions écartées

- **Visuels** : les modèles Kenney vus de près (« 5 triangles par objet »), les
  plantes dessinées à la main en SVG (« hideux », 23/09), un personnage humain
  en formes rondes (« un pantin de bois de 1950 », 27/09 — la petite fille
  d'Habille-toi est revenue le 6/10 par choix du père, « tant pis pour moi »).
- **28/09** : la lumière du Bonhomme, Puissance 4 en 3D, l'horloge « journée à
  la ferme » (« trop brouillon, c'est pour apprendre l'heure »).
- **29/09** : trois jeux de plus à deux, le Mini-golf, le Chamboule-tout, les
  boîtes à œufs (le Poulailler, + et −), la Balance, le Tangram, le cycle de la
  vie.
- **6/10** : Cache-Cache, la marche au ras du sol.
- **2/09** : une base Supabase (contraire à la règle 3).
