# Le Courrier — conception

Statut : **validée par le père**, les deux exceptions (§ 2) comprises. Une maquette
jouable et jetable existe : `.maquette/courrier/` (page privée
https://claude.ai/artifact/Wj5bsnQSjLkSmUoeMnvSRU). Elle fait foi pour les
gestes et l'allure ; ce document fait foi pour le reste.

Dans ce document, **[décidé]** = dit par le père ; **[proposé]** = mon choix,
validé avec ce document.

---

## 1. L'intention

Joyce (8 ans) demande un jeu de communication avec sa sœur : dessins, messages
vocaux, messages écrits, émojis, qu'on envoie et que l'autre trouve chez elle.
Le père a retenu ses deux idées, la lettre et le téléphone, dans une seule
tuile.

- **Ce que c'est** : un jeu de Créer, sans note. Joyce et Jade s'écrivent pour
  de vrai, chacune son tour, sur **une seule tablette** [décidé].
- **La lettre est le cadeau** : on la fabrique longtemps, on la met sous
  enveloppe, l'autre l'ouvre. **Le téléphone est la conversation** : court,
  rapide.
- **Réussi si** : Jade (6 ans, ne lit pas couramment) envoie et reçoit une
  lettre sans aide ; elles y reviennent d'elles-mêmes, sans que rien ne les
  rappelle.

### Objectifs
1. Écrire une lettre : dessiner, taper, coller, parler.
2. L'envoyer par une suite de gestes qui ont du goût, et la recevoir par une
   ouverture qui en a autant.
3. S'envoyer de petits messages sur un grand téléphone.
4. Ne jamais perdre une lettre, un brouillon, une voix.

### Hors périmètre
- Deux téléphones côte à côte, réponse en direct [décidé : « Non, chacune son
  tour »].
- Deux tablettes, envoi par Internet, grands-parents, parents comme
  destinataires.
- Photos prises avec la tablette. Transcription de la voix. Traduction.
- Effacer un message envoyé au téléphone ; reprendre une lettre postée.
- Correction d'orthographe, suggestions de mots.

### Ce qui en ferait un échec
- Un envoi si long qu'à la troisième lettre elles renoncent.
- Un mot d'instruction à lire pour avancer.
- Une pastille, un compteur ou un « vu » qui pousse à revenir.
- Une lettre perdue, ou annoncée « postée » alors qu'elle n'est pas gardée.

---

## 2. Les contraintes

- **Règle 1** : ni notification, ni « vu », ni compteur, ni série de jours. Le
  drapeau de la boîte et le point du téléphone ne se voient **que dans le jeu**,
  jamais sur l'accueil ni sur la tuile. Aucun nombre.
- **Règle 2** : aucune consigne à lire. La main (`core/hand.ts`) montre chaque
  geste, y compris celui à deux doigts, à lui ajouter. Elle retient une première
  fois **par jeu** : si Joyce ouvre d'abord, Jade n'aurait plus rien. Le Courrier
  retient donc **par fille** ce qu'elle a déjà fait et appelle `handNow()` à
  chaque geste nouveau pour elle. Les lignes de texte de la maquette sont pour le
  père : elles ne passent pas dans le jeu.
- **Règle 3** : tout reste sur la tablette. Aucun appel réseau.
- **Deux exceptions aux règles, validées** :
  1. **Vrais émojis**, dans ce jeu seulement (la règle : « pas d'emoji dans les
     jeux »). Joyce les a demandés ; les boutons et icônes du jeu restent
     dessinés, sans emoji — sauf la touche et l'onglet « émojis », qui montrent
     un émoji parce que c'est ce qu'ils ouvrent.
  2. **La voix de la tablette lit le texte tapé par une enfant**, à la demande
     (la règle : « seulement le contenu pédagogique »). Sans ça, Jade ne peut
     pas recevoir un message écrit. Jamais une consigne, jamais toute seule.
- **Tablette** : Galaxy Tab A9+, 1280 × 800 px CSS en paysage, GPU moyen.
- **Maquette validée ≠ jeu validé** (`PIEGES.md`) : les trois livraisons se
  jouent sur la tablette avant de passer à la suivante.

---

## 3. Les approches

| Approche | Pour | Contre |
|---|---|---|
| La lettre seule | un jeu fini, adapté à Jade | pas d'échange rapide |
| Le téléphone seul | court à faire, plaît à Joyce | une tablette : personne ne répond en direct ; trop centré sur le texte pour Jade |
| **Les deux, une tuile, outils communs** — **choisi par le père** | tout ce que Joyce a demandé | le plus gros ; deux jeux à finir → trois livraisons (§ 9) |

Au téléphone, « deux téléphones côte à côte » a été proposé et refusé.

---

## 4. Le déroulé

```
            ┌──────────── ferme ────────────┐
 ouverture  │  boîte de Jade · boîte de Joyce│  drapeau levé = courrier fermé
            └───────────────┬───────────────┘
          toucher sa boîte, ou son prénom
                            ▼
      sa boîte  ·  Écrire  ·  Téléphone  ·  Souvenirs
         │           │            │             │
      recevoir    la feuille   le fil      lettres gardées
         │           │
   cachet, sortie,  plier ► enveloppe ► cachet ► timbre ► poster
   dépliage, lire                                  │
         │                                         ▼
 Écouter · Répondre · Garder              drapeau levé chez sa sœur
```

### 4.1 L'ouverture
La ferme en 3D, deux boîtes aux lettres (Jade verte, Joyce lilas), leurs
prénoms peints, et deux plaques à leur prénom en bas. **Les boîtes remplacent
les deux cartes** de `core/mine.ts` [proposé] : elles disent en plus où il y a
du courrier. Toucher une boîte ou une plaque : la caméra s'approche. Un bouton
« Changer » (`meButton`) ramène aux deux boîtes.

N'importe laquelle peut ouvrir n'importe quelle boîte (pas de code entre sœurs,
comme dans les autres jeux). C'est le cachet qui parle : voir 4.4.

### 4.2 La feuille
Une feuille de 1500 × 1000 (celle de l'Atelier), quatre modes :

| Mode | Ce qu'on fait |
|---|---|
| **Dessiner** | les dix pinceaux de l'Atelier, trois tailles, douze couleurs, la gomme. Ni pot, ni miroir, ni tampons. |
| **Écrire** | toucher la feuille pose un texte là ; toucher une lettre du texte y met le curseur. Douze couleurs, trois tailles, trois écritures (ronde, à la main, d'école). |
| **Coller** | animaux de la ferme (12), émojis, gommettes (cœurs, étoiles), photos de l'imagier (toutes, par thème). Toucher pose ; glisser depuis le plateau pose où l'on veut. |
| **Parler** | toucher le micro, parler (30 s au plus), toucher encore : une bulle à lecture se colle sur la feuille. Cinq au plus par lettre. |

- Hors « Dessiner », un doigt déplace un objet, un second doigt le tourne et
  l'agrandit ; le glisser sur la poubelle le jette ; toucher une bulle la joue ;
  toucher un texte le rouvre.
- **Annuler** (douze gestes), **Papier** (sept couleurs), **Effacer** (toute la
  feuille, deux touchers, `trashButton`), **Envoyer**. Feuille vide :
  « Envoyer » secoue la tête, sans plus.
- Quarante objets au plus ; au-delà, l'autocollant rebondit vers le plateau.
- **Un brouillon par fille**, gardé tout seul, repris à la prochaine ouverture.
  « Répondre » reprend le brouillon s'il y en a un.
- Au clavier ouvert, la feuille rétrécit pour rester entière au-dessus.

### 4.3 L'envoi
Six étapes, dans cet ordre. Jusqu'au cachet, « Retour » ramène à la feuille ; après,
la lettre ne s'ouvre plus. **Cachetée mais pas encore postée** (elle sort par la
maison, la tablette s'éteint), l'enveloppe est gardée telle quelle et l'attend :
« Écrire » reprend l'envoi là où il en était. Une seule à la fois : pas d'autre
lettre avant de l'avoir postée.

1. **Plier** vers le haut, puis **plier** vers la droite (le pli suit le doigt).
2. Choisir la **couleur** de l'enveloppe (six), **glisser** la lettre dedans.
3. Choisir le **dessin du cachet** (cœur, étoile, fleur, patte), **garder le
   doigt posé** ~1 s : la cire s'étale, le sceau tape.
4. L'enveloppe se retourne ; choisir le **timbre** (huit animaux), le tampon le
   frappe.
5. **Glisser** l'enveloppe dans la boîte ouverte de sa sœur.
6. La porte claque, **le drapeau se lève**, une gerbe d'étincelles.

**Raccourci** [proposé] : à partir de la troisième lettre d'une fille, un seul pli
au doigt (le second suit tout seul) ; la couleur et le cachet de sa dernière
lettre sont déjà choisis ; son dernier timbre attend au coin de l'enveloppe, un
toucher le colle (les autres restent à côté). Il épargne un geste et trois choix,
aucun moment fort (cachet, boîte). Si l'essai sur la tablette montre que c'est
encore trop long, c'est le second pli qui s'en va, pour toutes.

**Si la lettre ne peut pas être gardée** (place pleine), l'enveloppe revient devant
la boîte et se secoue, le drapeau ne se lève pas ; on peut la glisser de nouveau.
Rien n'est perdu : elle reste cachetée chez celle qui l'envoie.

### 4.4 La réception
Boîte touchée, drapeau levé : la porte s'ouvre, l'enveloppe vient. La toucher
la retourne ; appuyer trois fois casse le cachet ; glisser sort la lettre ; elle
se déplie seule. Puis la feuille en lecture : toucher une bulle la joue, toucher
un texte ou **Écouter** le lit, **Répondre** ouvre une feuille, **Garder** range
dans les Souvenirs.

- Plusieurs lettres : la plus ancienne d'abord. Le drapeau reste levé tant qu'il
  en reste une fermée.
- **Une lettre ouverte mais pas gardée reste dans la boîte** [proposé] :
  enveloppe ouverte, cachet cassé, drapeau baissé, porte entrouverte. Elle se
  rouvre sans refaire la cérémonie. Si Joyce ouvre le courrier de Jade, Jade le
  voit donc.
- Toucher la boîte sort **d'abord les fermées** (la plus ancienne), puis les
  ouvertes, une à la fois ; reposée sans être gardée, une ouverte passe à la fin
  de la file. Pas d'écran de choix. « Garder » et « Répondre » la rangent dans les
  Souvenirs ; la poubelle à deux touchers la jette.
- Boîte vide : la porte s'ouvre, rien, elle se referme.

### 4.5 Les Souvenirs
Les lettres gardées, posées sur la table, la plus récente d'abord. Les toucher
les rouvre en lecture. Une poubelle à deux touchers jette celle qu'on lit. Pas
de limite de nombre ; les vignettes ne se calculent qu'en arrivant à l'écran.

### 4.6 Le téléphone
Un grand téléphone, un fil commun aux deux (le même vu des deux côtés, les
bulles de chacune à sa couleur) :

- texte, émojis, voix (30 s), petit dessin (quatre pinceaux, huit couleurs) ;
- un message d'émojis seuls (quatre au plus) s'affiche en grand et fait une
  **pluie** dans l'écran, à l'envoi et à chaque toucher ;
- un haut-parleur sur chaque texte le lit ;
- les messages pas encore vus **arrivent un par un** à l'ouverture ;
- ni heure, ni « vu », ni « en train d'écrire », ni statut ;
- **tout est gardé** ; le fil montre les cent derniers, remonter en charge
  d'autres ;
- un message commencé (texte, dessin, voix pas encore envoyée) est gardé par
  fille et retrouvé.

Dans sa pièce, le bouton Téléphone porte un point rouge sans nombre quand un
message l'attend [proposé].

### 4.7 La fin
Pas d'écran de fin, comme la Ferme à construire et l'Animal qui répète : on
sort par la maison. `ctx.finish` n'est jamais appelé. `noTier: true`.

---

## 5. Les règles de fond

- **La voix** : `MediaRecorder`, 30 s, dans un module à part — `core/mic.ts`
  promet de ne rien garder, on ne l'élargit pas. Le micro s'ouvre au toucher, se
  coupe à l'arrêt, en pause, au minuteur parental, en quittant. **Coupé en
  route, ce qui est dit est gardé** (collé sur la feuille, ou prêt à envoyer au
  téléphone) — au contraire de l'Animal qui répète, qui jette sa phrase. Seule
  une page tuée en plein enregistrement le perd. La musique **s'arrête** pendant
  l'enregistrement et l'écoute, puis reprend (`duckMusic` ne fait que la
  baisser). Micro absent ou refusé : le bouton se barre, tout le reste marche (pas de cri de
  remplacement : c'était pour la maquette). Moins de 0,4 s : rien n'est gardé.
- **La lecture du texte** : `ctx.say`, émojis retirés avant, textes d'une lettre
  lus de haut en bas. Coupée en quittant l'écran et quand une bulle se joue.
- **Son coupé** (le bouton de la barre) : « Écouter » et les bulles montrent un
  haut-parleur barré et ne jouent rien.
- **Le clavier** : le nôtre, partout (jamais celui d'Android). AZERTY dix
  colonnes, rangée d'accents ou de chiffres, majuscule pour une lettre, effacer
  qui se répète, réponse dès que le doigt se pose, plusieurs doigts à la fois.
  Un émoji compte pour un caractère (`Intl.Segmenter`).
- **Le stockage** : IndexedDB `ferme-courrier` (lettres, brouillons, messages,
  voix et dessins en `Blob`), localStorage étant trop petit. Les lettres et les
  messages sont rangés un par un, jamais en une seule liste réécrite. Aucune clé
  existante n'est touchée.
- **Rien ne se perd** : une lettre est « postée » quand son écriture a réussi ;
  sinon l'enveloppe revient dans la main et le brouillon reste. Même règle pour
  un message : la bulle ne reste que si elle est gardée.
- **Stockage persistant** : pas fait. Il a été proposé le 27/10 et pas retenu
  (ROADMAP). Conséquence à connaître : si Android ou le navigateur vide les
  données du site, les lettres et les voix partent avec.
- **Les deux sœurs à égalité** : mêmes outils, aucun décompte de lettres,
  aucune comparaison.

---

## 6. L'allure

Celle de la maquette : la ferme 3D (`buildFarm` vide + pièces), deux boîtes en
formes rondes, le poussin, le chat et le canard ; la feuille, l'enveloppe, le
téléphone en 2D par-dessus ; table de bois pour la lettre, fond crème pour la
feuille et le téléphone. Pas d'illustration dessinée à la main en SVG au-delà
des icônes et du cachet.

- Chaque outil porte son petit nom (`.tool-item` / `.tool-cap`).
- **La barre de la coquille** (maison à gauche ; son, pause, rejouer à droite)
  flotte par-dessus : aucun outil ni bord de feuille sous elle. Le jeu ajoute
  son propre « Retour », sous la maison. Aucun voile au-dessus de `z-index` 7.
- Derrière un écran plein, la 3D est figée sur sa dernière image (comme
  l'Aquarium) ; pas de `backdrop-filter` par-dessus la 3D.
- Deux polices à ajouter en local (une « à la main », une « d'école ») : Gochi
  Hand et Playwrite FR Moderne dans la maquette. Licence à vérifier et à
  créditer avant de les embarquer ; sinon, d'autres.
- Musique `meadow`.
- Nom : **Le Courrier** ; `id: 'courrier'` ; univers Créer ; vignette, main,
  affiche prise dans le jeu au moment de poster (l'enveloppe devant la boîte
  ouverte).

---

## 7. Ce que ça touche dans l'app

| Où | Quoi |
|---|---|
| `src/games/courrier*.ts` | le jeu : l'ouverture, la feuille, la cérémonie, le téléphone |
| `src/core/` | nouveaux modules : pinceaux, clavier, message vocal, la logique du courrier (pure, testée) et son stockage, les boîtes 3D |
| `src/games/coloring.ts` | ses pinceaux **sortent** dans le module commun ; l'Atelier ne change pas d'un pixel pour les filles |
| `src/core/hand.ts` | un geste de plus : deux doigts qui tournent et agrandissent |
| `src/core/types.ts`, `src/core/voice.ts` | leur commentaire « contenu pédagogique seulement » dit l'exception |
| `src/games/index.ts`, `badges.ts`, `posters.mjs`, `play.mjs`, `touched.mjs` | l'arrivée d'un nouveau jeu |
| `global.css` | ses styles, préfixés |
| `CLAUDE.md` | les deux exceptions, les nouveaux modules, le stockage |

La maquette se réutilise comme modèle de gestes, pas comme code à copier tel
quel : ses minuteurs (`setTimeout`), ses textes pour le père, ses lettres
d'exemple et son cri de remplacement n'entrent pas dans l'app.

---

## 8. Vérifier

- **Tests (vitest)** : l'état d'une lettre (brouillon, cachetée, postée, ouverte, gardée),
  l'ordre de la boîte, le drapeau, « pas encore vu », le texte (curseur, émojis composés,
  retour à la ligne), l'échec d'écriture (rien n'est annoncé posté), la taille
  d'un objet bornée, le raccourci de la troisième lettre.
- **Bots** : `courrier-lettre` (Jade écrit, dessine, colle, parle avec la fausse
  voix, poste ; Joyce ouvre, lit, garde, sort et revient) et
  `courrier-telephone` (texte, émojis, dessin, voix ; l'autre les voit arriver).
  Les bots de l'Atelier repassent à la livraison 1.
- **Le smoke** ouvre tous les jeux.
- **Sur la tablette**, par le père : `?fps` sur les boîtes et pendant l'envoi,
  la taille des touches au doigt, la qualité du micro et de la voix qui lit, un
  envoi complet par Jade sans aide.

---

## 9. Les livraisons

1. **Les outils communs** : pinceaux sortis de l'Atelier, clavier, message vocal,
   stockage et logique, avec leurs tests. Rien de visible pour les filles ;
   l'Atelier identique.
2. **La lettre** : les boîtes, la feuille, l'envoi, la réception, les Souvenirs.
   La tuile arrive sur l'accueil, sans bouton Téléphone.
3. **Le téléphone.**

Chaque livraison passe par le smoke et ses bots, puis `main`, puis la tablette.

---

## 10. Laissé au bâtisseur

Découpage exact des fichiers, noms internes, forme des enregistrements
IndexedDB, courbes et durées des animations (proches de la maquette), bruitages
(ceux de `core/sfx.ts`), disposition fine des plateaux, choix des émojis (une
centaine, ceux de la maquette conviennent), placement des animaux dans la ferme.
