# 🗺 Roadmap — passer au niveau professionnel

> **Les règles du projet sont dans `CLAUDE.md`** (contraintes, contrat d'un jeu,
> socle 3D, pièges, méthode, git). Ce document ne dit que : **où on en est** et
> **ce qui reste à faire**. Rien n'y est répété.

Objectif : **des vrais jeux, visuels et physique modernes** — pas un catalogue de
mini-jeux.

---

## Où on en est

Le point de départ était ce retour, à prendre au mot :

> « ça fait vraiment petit jeu pourri rempli d'émoticônes, avec des animations
> flash des 80s »

Cause racine : **aucun asset graphique dans le projet**. Les émoji servaient de
sprites et les décors étaient dessinés à la main en SVG. En 3D procédurale la
qualité vient de la lumière, des ombres et des matériaux — la machine produit le
rendu qu'on ne sait pas dessiner. C'est pourquoi les jeux phares sont passés en
3D. En 2D, sans assets, **on plafonne** : le rendu *est* le dessin.

### Verdict jeu par jeu

**🔵 Vraie 3D — le niveau attendu** (tous sur `core/three3d.ts`)
`stand3d` · `snowman` · `igloo` · `pizza` · `space`

**🟢 Bons, à garder tels quels** (mécanique juste, pas de dette visuelle bloquante)
`quiz` · `intrus` · `letters` · `puzzle` · `taquin` · `patterns` · `mirror` ·
`clock` · `tables` · `additions` · `market` · `maze` · `memory` · `simon` ·
`connect4` · `battleship` · `piano` · `beatbox` · `coloring`

**🟠 Jeux d'action au rendu daté** (sprites = emoji ou SVG) — **étape B**
`catch` · `mole` · `run` · `fish` · `ninja` · `flappy` · `popcorn` · `balloon`

**🟡 Bonne idée, rendu à refaire**
`caterpillar` · `socks` · `geo` (le zoom continent → ville gagnerait à devenir un
vrai déplacement de caméra 3D)

**⚪ Sans score, à laisser tranquilles**
`fireworks` · `dressup`

---

## Étape A — Les assets réels 🔑 ← **le prochain chantier**

**Le plus gros saut visuel du projet pour l'effort le plus faible.** Tout est CC0
(Kenney), donc utilisable sans contrepartie.

L'URL de téléchargement direct est lisible dans le HTML de chaque page
(`https://kenney.nl/media/pages/assets/<slug>/<hash>/<fichier>.zip`) : **aucune
manipulation manuelle n'est nécessaire**, l'agent récupère les zips lui-même.

### Priorité 1 — visuels 2D, pour l'étape B

| Pack | Fichiers | Poids | Pour quoi |
|---|---|---|---|
| [`animal-pack-remastered`](https://kenney.nl/assets/animal-pack-remastered) | 240 | 3,4 Mo | Les animaux de la ferme : `mole`, `catch`, album, décor d'accueil. **Le plus utile du lot.** |
| [`platformer-art-deluxe`](https://kenney.nl/assets/platformer-art-deluxe) | 930 | 6,3 Mo | Sols, plateformes, décors, ennemis : `run`, `flappy`. Contient déjà les spritesheets + atlas XML. |
| [`physics-assets`](https://kenney.nl/assets/physics-assets) | 215 | 2,5 Mo | Balles, caisses, éléments à faire tomber : `popcorn`, `balloon`. |
| [`background-elements`](https://kenney.nl/assets/background-elements) | 110 | 1,0 Mo | Arrière-plans en parallaxe pour `run` et `flappy` — ce qui manque le plus à ces deux-là. |
| [`fish-pack`](https://kenney.nl/assets/fish-pack) | 120 | 0,7 Mo | `fish`, directement. |
| [`generic-items`](https://kenney.nl/assets/generic-items) | 160 | 2,2 Mo | Objets à attraper dans `catch` et à trancher dans `ninja`. |
| [`particle-pack`](https://kenney.nl/assets/particle-pack) | 80 | 14,3 Mo | Étincelles, fumée, éclaboussures — le *juice* de tous les jeux d'action. Le plus lourd : à trier, on n'en garde qu'une poignée. |
| [`emotes-pack`](https://kenney.nl/assets/emotes-pack) | 480 | 0,4 Mo | Retour d'émotion (bravo, raté) sans un mot à lire — utile partout vu la contrainte « aucune lecture ». |

Optionnels si on veut aller plus loin : `shape-characters` (0,5 Mo),
`sports-pack` (1,3 Mo), `jumper-pack` (1,5 Mo), `new-platformer-pack` (3,1 Mo).

### Priorité 2 — modèles 3D, pour enrichir les jeux déjà faits

| Pack | Poids | Pour quoi |
|---|---|---|
| [`food-kit`](https://kenney.nl/assets/food-kit) | 4,4 Mo | Ingrédients de `pizza` — remplace les formes primitives par de vrais modèles. |
| [`holiday-kit`](https://kenney.nl/assets/holiday-kit) | 4,3 Mo | Décor de `snowman` et `igloo`. |
| [`nature-kit`](https://kenney.nl/assets/nature-kit) | 10,0 Mo | Arbres et rochers — remplace les sapins en cônes de `snowman`. |
| [`space-kit`](https://kenney.nl/assets/space-kit) | 6,4 Mo | Une vraie fusée pour `space`. |

### Priorité 3 — sons (étape C)

[`impact-sounds`](https://kenney.nl/assets/impact-sounds) (0,8 Mo) et
[`interface-sounds`](https://kenney.nl/assets/interface-sounds) (0,8 Mo).

### À faire à l'import
- Ranger dans `public/assets/<pack>/` et **trier** : on ne garde que ce qui sert.
- Écrire `public/assets/CREDITS.md` à partir des `License.txt` de chaque zip.
- Charger **à la demande par jeu** (comme Three.js aujourd'hui) : c'est le temps
  de démarrage qui compte, plus le hors-ligne.

---

## Étape B — Moderniser les jeux d'action 2D 🟠

`catch` · `mole` · `run` · `fish` · `ninja` · `flappy` · `popcorn` · `balloon`

Pas de réécriture : **remplacer les emoji par de vrais sprites**, passer tout le
monde sur PixiJS avec atlas partagé, ajouter particules et *screen shake*
cohérents. Effort faible, gain visuel élevé une fois l'étape A faite.

---

## Étape C — Le son au niveau 🔊

La musique générative (`core/music.ts`) est bonne et à garder — elle est unique et
ne pèse rien. Ce qui manque :
- **Vrais bruitages foley** en remplacement des bips synthétisés pour les impacts,
  clics et chutes.
- Mixage : bus musique / bus effets, volumes séparés, *ducking* léger de la
  musique pendant la voix.

---

## Étape D — Base de données 🔑 *(bloquée : dépend de toi)*

Tout vit aujourd'hui dans `localStorage` (clé `ferme:v2`) : profils, photos en
dataURL, voix enregistrées, progression. Un nettoyage du navigateur efface tout,
et le quota (~5 Mo) est atteignable avec quelques photos.

**Filet posé en attendant** : bouton 💾 de l'accueil — export d'un fichier JSON
complet, réimport protégé par la « question de grand », jauge de quota, et alerte
quand l'enregistrement échoue (`core/backup.ts`). Ça évite la perte sèche, ça ne
remplace pas une base.

Pour aller plus loin, il me faut de ta part : **l'URL du projet Supabase + la clé
`anon` publique** (l'offre gratuite suffit largement). Ensuite :
- Tables `profiles`, `progress` ; Storage pour les photos et les clips vocaux.
- Garder le local en cache + synchro opportuniste.
- RLS strict, aucun analytique tiers (données d'enfants).

---

## Étape E — Finitions produit ✨

- **Renommer/modifier les profils** depuis l'interface (`updateProfile()` existe
  dans le store mais n'est appelé nulle part) ; 3ᵉ profil « invitée ».
- **Album** : le déblocage prend toujours le premier animal verrouillé de la liste
  (donc identique pour les deux sœurs). Le rendre aléatoire parmi les restants.
- **Mode coopération** : les deux jouent en même temps sur la même tablette.
- Vérifier les perfs sur la vraie tablette (60 fps sur les jeux 3D, sinon baisser
  la résolution d'ombre / le `pixelRatio`).

---

## Ce qui est déjà fait ✅ (ne pas refaire)

- **Vraie 3D + physique** : `stand3d`, `snowman`, `igloo`, `pizza`, `space`, tous
  sur le socle `core/three3d.ts`. `chamboule` (doublon 2D) supprimé.
- **Sauvegarde exportable** : `core/backup.ts` + bouton 💾.
- **Moteur de game feel** : `core/juice.ts` (ressorts, transition iris, secousses).
- **Musique générative** 6 thèmes + foley synthétisé (`core/music.ts`, `audio.ts`).
- **Minuteur parental** avec verrou « question de grand » (`PlayTimer.tsx`) — la
  seule fonctionnalité « adulte » demandée, elle marche, ne pas y toucher.
- **Ferme d'accueil** décorative, ciel selon l'heure réelle, sans aucun palier.
- **Anti-crash** : ErrorBoundary + capture des erreurs runtime en jeu.
- **Maj PWA automatique**, vibrations tactiles, `touch-action` correct.
- **Smoke test CI** : les 37 jeux sont ouverts et vérifiés à chaque déploiement.
