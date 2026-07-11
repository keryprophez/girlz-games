# 🐤 La Ferme Magique

Les jeux de **Joyce** et **Jade** — une webapp de 15 mini-jeux (et bientôt 20 !) pensée pour jouer sur tablette ou téléphone, même sans connexion.

## ✨ Ce qu'il y a dedans

- **15 mini-jeux** répartis en 3 catégories : Réflexion 🧠, Mémoire 🎯, Action ⚡
- **Profils avec photos** : chaque fille a sa carte, on ajoute sa photo (bouton 📷) et sa tête apparaît dans les jeux (Poussin Volant, Course, Attrape…) et dans le **Puzzle Photo** 🤳
- **Progression séparée** par joueuse : étoiles, album de 24 animaux à collectionner, meilleurs scores par jeu
- **3 niveaux de difficulté** par profil (🌱 Douce / 🌿 Normale / 🔥 Expert), réglables d'un tap
- **PWA hors-ligne** : installable sur l'écran d'accueil, polices auto-hébergées, aucun réseau requis après la première visite
- **Sons synthétisés** en Web Audio (aucun fichier audio), particules, confettis, écrans de récompense

## 🛠 Stack

| Brique | Choix |
|---|---|
| Build | Vite 6 + TypeScript |
| Coquille (accueil, profils, album, résultats) | React 18 |
| Jeux | Modules vanilla TS montés dans un hôte commun (`GameHost`) |
| État & persistance | Zustand + `localStorage` |
| Hors-ligne | vite-plugin-pwa (service worker + manifest) |
| Déploiement | GitHub Actions → GitHub Pages |

L'architecture des jeux est volontairement simple : chaque jeu implémente
`mount(ctx) => cleanup` (voir `src/core/types.ts`). Le `GameHost` React fournit
le contexte (difficulté, prénom, avatar, `finish()`, `toast()`) et gère
récompenses, rejouer et retour au menu. **Ajouter un 16ᵉ jeu = 1 fichier dans
`src/games/` + 1 ligne dans `src/games/index.ts`.**

## 🚀 Développement

```bash
npm install
npm run dev       # http://localhost:5173/girlz-games/
npm run build     # build de production dans dist/
npm run preview   # sert le build
```

## 🌍 Mise en ligne (une fois pour toutes)

1. Sur GitHub : **Settings → Pages → Source : GitHub Actions**
2. Merger sur `main` : le workflow `deploy.yml` construit et publie automatiquement
3. Le jeu est servi sur `https://<user>.github.io/girlz-games/` — à ajouter à l'écran d'accueil de la tablette

## 🗺 Roadmap vers 20 jeux

Idées prêtes à brancher sur l'architecture actuelle :

- 🎨 **Coloriage magique** (canvas + palette)
- 🔤 **Chasse aux lettres** (retrouver les lettres de son prénom)
- 🧦 **Paires de chaussettes** (tri contre la montre)
- 👗 **Habille l'avatar** (avec la photo !)
- 🎹 **Petit piano** (mode libre + mélodies à répéter)
