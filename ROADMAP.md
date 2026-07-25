# 🗺 Roadmap — passer au niveau professionnel

> Objectif fixé par l'utilisateur : **des vrais jeux, visuels et physique
> modernes** — pas un catalogue de mini-jeux. Lire `PASSATION.md` d'abord.
>
> Règle d'arbitrage : entre « ajouter un jeu » et « amener un jeu existant au
> niveau de `stand3d` », **toujours choisir la seconde option**.

---

## Étape 0 — Débloquer les deux fondations (à faire en premier) 🔑

Ces deux chantiers conditionnent tout le reste. Environnement réseau ouvert = ils
sont enfin possibles.

### 0.1 Assets réels — **toujours à faire**
> Vérifié le 25/07/2026 : `kenney.nl`, `poly.pizza` et `quaternius.com` répondent
> bien depuis cet environnement (HTTP 200), le blocage réseau de la session
> précédente a disparu. Le chantier n'a pas été mené faute de temps — il a été
> arbitré au profit de l'étape 1, conformément à la règle d'arbitrage ci-dessus.
> Attention : les téléchargements Kenney passent par un formulaire, l'URL directe
> du `.zip` renvoie 404.

- Télécharger les packs **CC0 Kenney** : *Impact Sounds*, *Interface Sounds*,
  *Animal Pack Redux*, *Physics Assets*, *Platformer Kit*.
- Modèles 3D low-poly CC0 : **Poly Pizza**, **Quaternius** (glTF).
- Ranger dans `public/assets/<pack>/`, écrire `public/assets/CREDITS.md`.
- Charger **à la demande par jeu** (comme Three.js aujourd'hui) pour ne pas
  gonfler le précache PWA. Vérifier que le hors-ligne tient toujours.
- **Effet attendu : le plus gros saut visuel du projet, pour un effort modeste.**

### 0.2 Base de données
- ✅ **Fait (filet de secours)** : export/import d'une sauvegarde JSON depuis le
  bouton 💾 de l'accueil, jauge de quota, et alerte quand `localStorage` est plein
  (`core/backup.ts`). Ça ne remplace pas la BDD, ça évite la perte sèche.
- Demander à l'utilisateur : **URL projet Supabase + clé `anon`**.
- Tables `profiles`, `progress` ; Storage pour photos et clips vocaux.
- **Garder le local en cache** + synchro opportuniste (l'app doit rester jouable
  hors-ligne, contrainte 3).
- RLS strict, aucun analytique tiers (contrainte 4 : données d'enfants).
- ~~Bonus : export/import d'une sauvegarde JSON~~ → fait.

---

## Étape 1 — Refaire les jeux phares en 3D 🎮 ✅ FAIT

Les cinq jeux 3D partagent désormais **`src/core/three3d.ts`** : réglage de rendu
commun, boucle à pas fixe, caméra orbitale à boutons (pas de drag : le doigt sert
à jouer), textures procédurales et nettoyage GPU complet.

| # | Jeu | Ce que la 3D a apporté |
|---|---|---|
| 1 | **⛄ Bonhomme de neige 3D** | On roule la boule au doigt : elle **creuse son sillon** dans la neige (texture peinte en direct), elle grossit, puis elle tombe et **s'écrase sur la pile** avec cannon-es. Habillage en volumes (chapeau, écharpe, bras, boutons), caméra qui fait le tour. Aucun échec. |
| 2 | **🧊 Igloo 3D** | Blocs **taillés dans la sphère** (pas des cubes) en matériau transmissif, appareillage décalé d'une demi-brique, calotte de faîte qui referme la voûte, puis on allume un feu et **tout l'igloo s'illumine de l'intérieur** sous une aurore boréale. |
| 3 | **🍕 Pizzeria 3D** | Bac à sable sans étape imposée : sauce étalée au doigt sur une texture, ingrédients qui **tombent et roulent** (et parfois à côté), four à bois en voûte de berceau où la pâte dore et le fromage fond, parts mangées une par une. |
| 4 | **🚀 Espace 3D** | Vraies sphères texturées en orbite, anneaux de Saturne en géométrie (avec la division de Cassini), lunes, nuages sur la Terre, fusée qui s'envole et caméra qui suit. Les textes pédagogiques d'origine sont conservés. |
| 5 | **🎪 `chamboule.ts` supprimé** | Doublon 2D de `stand3d`. Fichier retiré, `matter.js` désinstallé. |

**Standard de qualité à respecter pour chaque nouveau jeu 3D** (checklist) :
- [ ] Partir de `createStage()` de `core/three3d.ts` — il applique déjà
      `antialias`, `pixelRatio` plafonné à 2, `ACESFilmicToneMapping`,
      `SRGBColorSpace`, `PCFSoftShadowMap`, `shadow.bias`, lumières et brouillard
- [ ] Matériaux `MeshStandardMaterial` avec `roughness`/`metalness` crédibles
- [ ] Physique à **pas fixe** (`fixedStep()`), prévisualisation honnête si visée
- [ ] **Nettoyage GPU** : `stage.dispose()` suffit si tout est dans la scène ;
      `stage.keep(tex)` pour les textures non attachées
- [ ] Chargement à la demande (`loadThree()` / `loadPhysics()`) + `loader()`
- [ ] Testé en navigateur avec **capture d'écran regardée**

---

## Étape 2 — Moderniser les jeux d'action 2D 🟠 ← **le prochain chantier**

`catch` · `mole` · `run` · `fish` · `ninja` · `flappy` · `popcorn` · `balloon`

Pas de réécriture : **remplacer les emoji par de vrais sprites** (Kenney), passer
tout le monde sur PixiJS avec atlas partagé, ajouter particules et *screen shake*
cohérents. Effort faible, gain visuel élevé une fois l'étape 0.1 faite.

---

## Étape 3 — Le son au niveau 🔊

La musique générative (`core/music.ts`) est bonne et à garder — elle est unique et
ne pèse rien. Ce qui manque :
- **Vrais bruitages foley** (Kenney *Impact/Interface Sounds*) en remplacement des
  bips synthétisés pour les impacts, clics, chutes.
- Mixage : bus musique / bus effets, volumes séparés, *ducking* léger de la
  musique pendant la voix.

---

## Étape 4 — Finitions produit ✨

- **Renommer/modifier les profils** depuis l'interface (`updateProfile()` existe
  dans le store mais n'est appelé nulle part) ; 3ᵉ profil « invitée ».
- **Album** : le déblocage prend toujours le premier animal verrouillé de la liste
  (donc identique pour les deux sœurs). Le rendre aléatoire parmi les restants.
- **Mode coopération** : les deux jouent en même temps sur la même tablette.
- Vérifier les perfs sur la vraie tablette (60 fps sur les jeux 3D, sinon baisser
  la résolution d'ombre / le pixelRatio).

---

## Ce qui est déjà fait ✅ (ne pas refaire)

- **Vraie 3D + physique** : `stand3d`, `snowman`, `igloo`, `pizza`, `space`,
  tous sur le socle `core/three3d.ts`.
- **Sauvegarde exportable** : `core/backup.ts` + bouton 💾 de l'accueil.
- **Moteur de game feel** : `core/juice.ts` (ressorts, transition iris, secousses).
- **Musique générative** 6 thèmes + foley synthétisé (`core/music.ts`, `audio.ts`).
- **Minuteur parental** avec verrou « question de grand » (`PlayTimer.tsx`) — la
  seule fonctionnalité « adulte » demandée, elle marche, ne pas y toucher.
- **Ferme d'accueil** décorative, ciel selon l'heure réelle, **sans aucun palier**
  (la mécanique de déblocage a été retirée : contrainte 1).
- **Anti-crash** : ErrorBoundary + capture des erreurs runtime en jeu.
- **Maj PWA automatique**, vibrations tactiles, `touch-action` correct.
- **Smoke test CI** : les 37 jeux sont ouverts et vérifiés à chaque déploiement.

---

## Anti-objectifs 🚫

À ne **jamais** ajouter, quoi qu'en suggère la « bonne pratique » du jeu mobile :

- Monnaie, boutique, coffres, énergie, vies qui se rechargent
- Paliers de déblocage, arbre de progression, saisons, événements limités
- Séries quotidiennes, notifications de rappel, « reviens demain »
- Classements, comparaison entre les deux sœurs au-delà du Défi à deux amical
- Publicité, achats intégrés, analytique tiers, compte en ligne pour les enfants
