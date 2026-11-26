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

## Le catalogue — 39 jeux

| Univers | Jeux |
|---|---|
| **Jouer** (12) — on s'amuse, on peut perdre | La Tour de Glace · Ninja Verger · Cache-Cache · Devine mon dessin · Labyrinthe · Puzzle (et son mode Taquin) · Memory · Le Chœur · Puissance 4 · Perles Miroir · Le Jeu des différences · Le Labyrinthe à bille |
| **Apprendre** (12) — on travaille, jamais de sanction | Quelle heure ? · Le Potager (+ − × ÷) · Le Marché · L'Intrus · Le Tour du Monde · Voyage dans l'Espace · Suites Logiques · Chasse aux lettres · La Poste aux Phrases · Le Tracteur · Le Géoplan · Les Échecs |
| **Créer** (15) — pas de note | Habille-toi · Les Bijoux · Petit Piano · Feu d'Artifice · L'Atelier · La Cuisine (pizza ou gâteau) · L'Animal qui répète · La Ferme à construire · Mon cartable · Les Monuments · La Poterie · Le Château de sable · L'Aquarium · Le Salon de coiffure · Le Courrier |

**Archivés** (le code, l'affiche et le bot sont gardés, plus aucune tuile ;
les filles n'aiment pas) : Le Flipper · 1, 2, 3… Soleil !

Jeux en vraie 3D : la Tour, Cache-Cache, Labyrinthe, Puzzle,
Memory, le Chœur, Perles Miroir, les Différences, la Bille, l'Espace,
Suites Logiques, Tour du Monde, le Tracteur, le Géoplan, les Échecs, Habille-toi, les
Bijoux, la Cuisine, l'Animal qui répète, la Ferme à construire, Mon cartable,
les Monuments, la Poterie, le Château de sable, l'Aquarium.

---

## Le lot du 27/10 — fait (plan validé : « GO », « pousse tout sur main »)

1. ✅ **Couper** : le choix de joueuse (masqué depuis le 10/09) et la
   princesse (partie le 6/10) sortent du code — une seule sauvegarde « famille »
   (`core/save.ts`, la conversion des anciennes testée) ; le code mort ; la
   Pizzeria et la Pâtisserie fusionnées en **La Cuisine** (`variants` dans la
   coquille : la pizza ou le gâteau à l'ouverture) ; CLAUDE.md et cette
   ROADMAP réduits de moitié.
2. ✅ **Les bugs** trouvés le 27/10 (relecture de tout le code par trois agents) :
   minuteurs qui survivent à un changement de mode, Devine mon dessin, écran
   de fin relancé par une tape de trop, chargement infini si la 3D échoue,
   Lettres, graines de la glace, Intrus, Espace, micro qui reste ouvert,
   portraits rendus en pleine partie, fuites de la Cuisine et des paillettes ;
   le pré de l'accueil et les portraits gardés sur le disque (ils se
   rendaient à chaque ouverture : 17 s de fil bloqué en 3D logicielle).
3. ✅ **Leviers 2 et 3** : `core/mine.ts` (une création par fille : cartes
   Jade / Joyce, photo, sauvegarde aux mêmes clés, « Changer », la poubelle à
   deux touchers pour la Ferme, le Cartable ET les Monuments, « Fini » protégé
   du double toucher) ; `core/touchcam.ts` (les doigts suivis un par un, le
   tour avec élan, pour les objets qu'on tourne et le plateau de la ferme ;
   le globe et l'Espace gardent leurs caméras).
4. ✅ **Levier 4** : la mémoire du Potager (`facts.ts`) rendue générique, pour
   l'Horloge, le Tour du Monde, les Lettres et le Marché (tirage sans remise,
   un raté revient trois questions plus loin, rien ne fane).
5. ✅ **Huit nouveaux jeux** (choisis le 27/10), faits en parallèle par trois
   sessions, chacun avec sa vignette, son affiche, sa main et son bot :
   - **Jouer** : 1, 2, 3… Soleil ! (l'épouvantail de la ferme se retourne ;
     le cochon et le mouton courent aussi) · le Jeu des différences (deux
     fermes de Cache-Cache qu'on tourne ensemble ; des différences cachées à
     la flamme) · le Labyrinthe à bille (sa propre tuile : la tablette
     inclinée, ou le doigt).
   - **Apprendre** : le Tracteur à programmer (des flèches sur un pré
     quadrillé) · le Géoplan (élastiques sur la plaque à picots).
   - **Créer** : la Poterie (le tour, la peinture, le four) · le Château de
     sable (moules, douves, la marée) · l'Aquarium (son poisson dessiné qui
     nage, sans Claude). Les trois rangent une création par fille
     (`core/mine.ts`).

**À confirmer par le père** : la pizza n'a pas de niveau (cuisson de 7 s) ;
le gâteau a la musique de la cuisine ; à la fleur du Tour du Monde, une
manche est moitié animaux, moitié pays (au lieu d'un pile ou face à chaque
question) ; le Labyrinthe à bille a sa propre tuile (pas un 4ᵉ mode du
Labyrinthe).

## Le lot du 29/10 — l'imagier (plan validé : « parfait 500 mots, parfait memory »)

Joyce : « c'est quasiment toujours les mêmes mots ».

1. ✅ **La Chasse aux lettres, à la flamme** : le mot n'est plus montré au
   début (la photo et la voix seulement).
2. ✅ **L'imagier** (`core/imagier.ts`) : de 76 photos à 324 (le père : « on
   peut s'arrêter à 200 photos »),
   rangées par thème (iNaturalist, NASA, Commons ; chaque photo regardée sur
   planche-contact). Chacune porte son niveau d'orthographe (fleur ≈ CP,
   éclair ≈ CE1, flamme ≈ CE2-CM1) et son défi de dessin.
3. ✅ **La Chasse aux lettres** tire ses mots de l'imagier (vingt-deux avant),
   sans remise d'une partie à l'autre ; mots composés (blancs et tirets posés
   d'avance) ; à la flamme, les lettres en trop sont des fautes probables.
4. ✅ **Devine mon dessin** : une centaine de sujets qui se dessinent (la tarte aux
   fruits est sortie), sans remise d'une partie à l'autre ; le devineur
   connaît tout l'imagier.
5. ✅ **Le Memory à thèmes** : Espace, Mer, Petites bêtes, Animaux, Oiseaux,
   Nature, Gourmandises, Tout mélangé — le thème, puis le niveau.

## Le lot du 21/11 — deux jeux demandés par le père (plan validé : « OK »)

1. **Les Échecs** (Apprendre) — **fait**. Pas une partie : huit exercices
   par séance sur un échiquier de bois, pièces Staunton (choix du père, pour
   les reconnaître sur un vrai jeu). Six leçons : ranger · bouger (des
   pommes à attraper) · prendre · sortir d'un échec · mat en un coup · le
   roque, la promotion, la prise en passant. Fleur = les trois premières,
   éclair = + l'échec, flamme = le mat et les coups spéciaux. Règles et
   tirages dans `core/chess.ts` (testés).
   **À voir sur la tablette** : la lisibilité des pièces blanches, `?fps`.
   **Pistes si ça plaît** : jouer une vraie partie à deux sur la tablette ;
   le mat en deux coups ; la fourchette du cavalier.
2. **Le Salon de coiffure** (Créer) — **en cours**. Trois essais refusés
   (une tête en formes simples : « vieux pantin de bois » ; une illustration
   Canva découpée et animée : « flou, lagguy, de la daube » ; des rubans
   étirés). Le plan validé (« go », 23/11) : des cheveux faits de FILS.
   - **Phase 1, validée (« c'est good », 23/11)** : `core/hair.ts` (300
     mèches guides, pas fixe, inextensibles, une forme de repos, le sommeil
     des mèches immobiles, tout dans le repère de la tête — testé) et
     `core/hair3d.ts` (≈ 3 600 fils, lumière des cheveux, teinte au choix).
     Démo hors de l'app : `.maquette/coiffure/` (publiée en page privée).
   - Décisions du père : le **visage 1** (le corps de base de VRoid, CC0,
     sans coiffure : `Base_Female.vrm`) ; des cheveux **légers**, sans
     rebond, qui ne passent jamais devant les yeux ; **le doigt prend ce
     qu'il touche** — des cheveux : on les attrape (même tout en bas du
     dos) ; le corps ou le vide : le buste tourne. Aucun bouton ni zone
     pour tourner (« pas de clic supplémentaire »). Ligne de texte pour le
     père toujours affichée ; cinq teintes.
   - **Phase 2, en cours** : le pas à pas en RECETTES (étapes, attaches,
     côté de chaque mèche). ✅ **La queue de cheval**, validée par le père,
     refaite à la carte graphique : brosser → rassembler dans le rond → l'élastique. Les
     décisions qui tiennent : sous les cheveux tirés, une CALOTTE lisse
     posée sur le vrai cuir chevelu du modèle (des fils tirés faisaient des
     « écailles ») ; l'élastique entoure un court faisceau qui SORT de la
     tête, perpendiculaire au flux (couché, il « rentrait dans la tête ») ;
     pendant le rassemblement, les cheveux glissent SUR le crâne et restent
     des fils, la chevelure se lisse d'un seul fondu à la fin ; **on prend
     une grosse poignée, elle seule bouge** (aucun rangement automatique,
     un simple toucher ne prend rien, lâchée hors du rond elle retombe).
     La brosse **laquée lilas à étoile** et l'élastique **à nœud de satin**,
     choisis par le père (`core/salonobj3d.ts`).
     🔧 **Les couettes** : brosser → la raie, qui s'ouvre sous le doigt et
     s'achève seule (trop courte, elle se reprend ; à l'envers, elle
     compte) → un côté, son nœud rose → l'autre côté, son nœud bleu. La
     tête tourne d'elle-même, doucement, en emmenant les cheveux. Jugées
     « pas mal » par le père, à confirmer au doigt sur la tablette.
     🔧 **La tresse** (`core/braid3d.ts`), jouable, à valider : brosser →
     rassembler à la nuque → trois mèches, on passe au doigt celle qui
     s'éclaire par-dessus celle du milieu, une fois d'un côté, une fois de
     l'autre, huit fois, rien d'automatique → l'élastique au bout. La
     physique ne donne que la ligne ; les trois brins se calculent autour.
   - **Phase 3, dans l'app** (`games/coiffure.ts`, Créer) : 🔧 les cartes
     Jade / Joyce avec leur photo, les trois coiffures en images, les cinq
     teintes, la main sur chaque geste, le sourire et la fête, la dernière
     coiffure finie gardée par fille (`ferme:coiffure:<qui>`), l'affiche, le
     bot. Moins de fils quand la tablette peine. À essayer au doigt.
   - ⬜ Mesurer `?fps` sur la tablette (c'est un VRM : la règle du projet).
   - ⬜ Après : les autres coiffures, le salon libre, le miroir, les vêtements
     d'origine du modèle.
   - Imperfections connues : le contour bosselé des cheveux lâchés vus du
     dessus (la raie), une poignée posée repasse sous les cheveux encore
     lâchés, l'ouverture en trois mèches est un fondu.

---

## Le Courrier (Créer) — plan validé

Joyce et Jade s'écrivent pour de vrai, chacune son tour, sur la tablette :
la feuille (dessiner, écrire, coller, parler), l'enveloppe (plier, la cire,
le timbre), la boîte aux lettres de sa sœur, son drapeau. Conception et plan :
`docs/superpowers/specs/` et `docs/superpowers/plans/`.

1. ✅ **Les outils communs** : les pinceaux sortis de l'Atelier (identique au
   pixel près), le texte et le clavier, la voix gardée, le coffre, la main à
   deux doigts.
2. 🔧 **La lettre** : faite, à essayer sur la tablette — `?fps` aux boîtes et
   pendant l'envoi, un envoi complet par Jade sans aide, la durée de la
   cérémonie à la troisième lettre, le micro et la voix qui lit.
3. ⬜ Les polices « à la main » et « d'école » (Gochi Hand, Playwrite FR
   Moderne, SIL OFL) : à télécharger avec l'accord du père ; en attendant,
   l'écriture cursive de la tablette.
4. ⬜ Garder les lettres d'un appareil à l'autre : à discuter avec le père
   (pour l'instant tout reste sur la tablette, règle 3).

## À mesurer sur la tablette (`?fps`)

Rien n'a encore été relevé sur la Tab A9+ : la Tour de Glace (une cinquantaine
de modèles du paysage d'hiver), le Chœur, le petit train, le Puzzle à 48
pièces, le Feu d'artifice pendant le bouquet, Cache-Cache la nuit
et sur la carte ×4, la Ferme à construire pleine (36 pièces, 20 animaux), la
Cuisine (gâteau plein, la pizza), Mon cartable à paillettes, la Tour Eiffel
des Monuments, les Bijoux (plaque pleine, douze pots), Perles Miroir (144
perles), et les sept du 27/10 encore là — surtout le Jeu des différences (deux fermes,
environ 450 appels de dessin pendant une rotation, une ombre en 2048 : sinon
la ramener à 1024) et le Labyrinthe à bille (le sens du gyroscope en
paysage, jamais essayé sur une vraie tablette ; 16° d'inclinaison donnent
la pleine pente). Le seuil de la qualité automatique (30 ms) est à
confirmer. Les jeux qui rament sont à nommer par le père, un par un.

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
- **27/10** : une seule sauvegarde pour la famille ; la Cuisine ; huit
  nouveaux jeux (Soleil, Différences, Bille, Tracteur, Géoplan, Poterie,
  Château de sable, Aquarium).

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
| Le téléphone du Courrier (petits messages, deux téléphones côte à côte) | à la maquette du Courrier | « en vrai vire le telephone, la lettre c'est parfait » |

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
