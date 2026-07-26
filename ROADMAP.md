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

## ⚠️ LIRE `AUDIT.md` EN PREMIER

Audit chiffré des 38 jeux (mesuré, pas estimé) : **9 jeux sur 38 peuvent se
perdre, 29 n'ont aucun échec possible**. Conclusion : le problème n'est pas
réparable jeu par jeu, il est architectural — trois couches partagées manquent
(art, feel, règles), et le catalogue doit être coupé de 38 à **10 jeux + 3
espaces assumés** (Apprendre / Créer / À deux).

**Ordre imposé : les RÈGLES d'abord, l'art en dernier.** Un joli jeu sans enjeu
reste ennuyeux — l'igloo passé en 3D en est la preuve.

## Étape 0 bis — Passer chaque jeu au TEST D'ADRESSE 🎯

**Avant tout travail graphique.** Pour chaque jeu, répondre :
*« un joueur adroit fait-il visiblement mieux qu'un joueur maladroit ? »*

Si non → ce n'est pas un jeu, c'est un formulaire. Le refondre autour de :
**un seul geste** · **un échec réel** · **réessai immédiat** · **difficulté qui monte**.

Modèle : `src/games/icetower.ts` (voir `PASSATION.md` §2 bis).
Premiers candidats à refondre : `pizza` (assistant en 6 étapes), `snowman`
(aucun enjeu), `geo` et `space` (découverte sans adresse — acceptable car
pédagogiques, mais alors les assumer comme « livres interactifs », pas jeux).

## Étape 1 — Refaire les jeux phares en 3D 🎮

Le modèle : `src/games/stand3d.ts` (Three.js + cannon-es, éclairage physique,
ombres portées PCFSoft, matériaux PBR, tone mapping ACES, pas fixe 60 Hz).

Ordre recommandé, du plus rentable au moins :

| # | Jeu | Ce que la 3D apporte |
|---|---|---|
| 1 | **⛄ Bonhomme de neige 3D** | Rouler de vraies boules qui grossissent, les **empiler avec la physique**, tourner autour avec la caméra, accessoires posés en 3D. Le meilleur candidat : créatif, sans échec, spectaculaire. |
| 2 | **🏔 Tour de Glace** (existe) | Déjà le bon gameplay. Ne manque que la matière : blocs de glace en vrai matériau transmissif + modèles de décor. |
| 3 | **🍕 Pizzeria 3D** (bac à sable) | Façon *Toca Kitchen* : pâte déformable, ingrédients qui **tombent** sur la pizza, four avec vraie lumière chaude, aucune étape imposée. |
| 4 | **🚀 Espace 3D** | Vraies sphères texturées, anneaux de Saturne en géométrie, vol de la fusée avec caméra qui suit. |
| 5 | **🎪 Supprimer `chamboule.ts`** | Doublon 2D de `stand3d`. Retirer le fichier + la ligne d'`index.ts`. |

**Standard de qualité à respecter pour chaque jeu 3D** (checklist) :
- [ ] **IBL obligatoire** : `PMREMGenerator` + `RoomEnvironment` (sans ça, tout
      matériau standard paraît plat et plastique)
- [ ] `RoundedBoxGeometry` plutôt que `BoxGeometry` pour tout objet « dessiné »
- [ ] Bloom **très dosé** (`0.16 / 0.4 / 0.96`) — au-delà, l'image blanchit
- [ ] Palette assombrie si les objets sont clairs (contraste sujet/fond)
- [ ] **Vérifier par capture d'écran que ce qu'on doit viser est dans le cadre**
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
