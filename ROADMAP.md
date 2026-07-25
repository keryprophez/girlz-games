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

### 0.1 Assets réels
- Télécharger les packs **CC0 Kenney** : *Impact Sounds*, *Interface Sounds*,
  *Animal Pack Redux*, *Physics Assets*, *Platformer Kit*.
- Modèles 3D low-poly CC0 : **Poly Pizza**, **Quaternius** (glTF).
- Ranger dans `public/assets/<pack>/`, écrire `public/assets/CREDITS.md`.
- Charger **à la demande par jeu** (comme Three.js aujourd'hui) pour ne pas
  gonfler le précache PWA. Vérifier que le hors-ligne tient toujours.
- **Effet attendu : le plus gros saut visuel du projet, pour un effort modeste.**

### 0.2 Base de données
- Demander à l'utilisateur : **URL projet Supabase + clé `anon`**.
- Tables `profiles`, `progress` ; Storage pour photos et clips vocaux.
- **Garder le local en cache** + synchro opportuniste (l'app doit rester jouable
  hors-ligne, contrainte 3).
- RLS strict, aucun analytique tiers (contrainte 4 : données d'enfants).
- Bonus utile immédiatement : **export/import d'une sauvegarde JSON** — filet de
  sécurité même sans BDD.

---

## Étape 1 — Refaire les jeux phares en 3D 🎮

Le modèle : `src/games/stand3d.ts` (Three.js + cannon-es, éclairage physique,
ombres portées PCFSoft, matériaux PBR, tone mapping ACES, pas fixe 60 Hz).

Ordre recommandé, du plus rentable au moins :

| # | Jeu | Ce que la 3D apporte |
|---|---|---|
| 1 | **⛄ Bonhomme de neige 3D** | Rouler de vraies boules qui grossissent, les **empiler avec la physique**, tourner autour avec la caméra, accessoires posés en 3D. Le meilleur candidat : créatif, sans échec, spectaculaire. |
| 2 | **🧊 Igloo 3D** | Empiler des blocs de glace **translucides** (matériau transmissif), la voûte se ferme, on entre dedans à la fin. |
| 3 | **🍕 Pizzeria 3D** (bac à sable) | Façon *Toca Kitchen* : pâte déformable, ingrédients qui **tombent** sur la pizza, four avec vraie lumière chaude, aucune étape imposée. |
| 4 | **🚀 Espace 3D** | Vraies sphères texturées, anneaux de Saturne en géométrie, vol de la fusée avec caméra qui suit. |
| 5 | **🎪 Supprimer `chamboule.ts`** | Doublon 2D de `stand3d`. Retirer le fichier + la ligne d'`index.ts`. |

**Standard de qualité à respecter pour chaque jeu 3D** (checklist) :
- [ ] `antialias`, `pixelRatio` plafonné à 2, `ACESFilmicToneMapping`, `SRGBColorSpace`
- [ ] Lumière hémisphérique + directionnelle avec `castShadow` + appoint frontal
- [ ] `PCFSoftShadowMap`, `shadow.bias` réglé (pas d'acné d'ombre)
- [ ] Matériaux `MeshStandardMaterial` avec `roughness`/`metalness` crédibles
- [ ] Brouillard de profondeur cohérent avec la couleur de fond
- [ ] Physique à **pas fixe**, prévisualisation honnête si visée
- [ ] **Nettoyage GPU complet** au démontage (géométries, matériaux, textures, renderer)
- [ ] Chargement à la demande (`await import('three')`) + écran d'attente
- [ ] Testé en navigateur avec capture d'écran regardée

---

## Étape 2 — Moderniser les jeux d'action 2D 🟠

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

- **Vraie 3D + physique** : `stand3d.ts` (Three.js + cannon-es) — la référence.
- **Physique 2D** : `chamboule.ts` (matter.js, lance-pierre, trajectoire exacte)
  — à supprimer au profit de la 3D.
- **Moteur de game feel** : `core/juice.ts` (ressorts, transition iris, secousses).
- **Musique générative** 6 thèmes + foley synthétisé (`core/music.ts`, `audio.ts`).
- **Minuteur parental** avec verrou « question de grand » (`PlayTimer.tsx`) — la
  seule fonctionnalité « adulte » demandée, elle marche, ne pas y toucher.
- **Ferme d'accueil** décorative, ciel selon l'heure réelle, **sans aucun palier**
  (la mécanique de déblocage a été retirée : contrainte 1).
- **Anti-crash** : ErrorBoundary + capture des erreurs runtime en jeu.
- **Maj PWA automatique**, vibrations tactiles, `touch-action` correct.
- **Smoke test CI** : les 38 jeux sont ouverts et vérifiés à chaque déploiement.

---

## Anti-objectifs 🚫

À ne **jamais** ajouter, quoi qu'en suggère la « bonne pratique » du jeu mobile :

- Monnaie, boutique, coffres, énergie, vies qui se rechargent
- Paliers de déblocage, arbre de progression, saisons, événements limités
- Séries quotidiennes, notifications de rappel, « reviens demain »
- Classements, comparaison entre les deux sœurs au-delà du Défi à deux amical
- Publicité, achats intégrés, analytique tiers, compte en ligne pour les enfants
