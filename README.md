# 🐤 La Ferme Magique

Les jeux de **Joyce** et **Jade** — une webapp de 22 mini-jeux pensée pour jouer sur tablette ou téléphone, même sans connexion. Le portfolio est curé pour 6-8 ans : chaque jeu a une raison d'exister, aucun n'exige de savoir lire.

## ✨ Ce qu'il y a dedans

- **22 mini-jeux** en 4 catégories : Réflexion 🧠, Mémoire 🎯, Action ⚡, Créatif 🎨
- **Zéro lecture obligatoire** : les consignes et questions sont lues à voix haute (synthèse vocale française du navigateur, hors-ligne, aucun asset)
- **⚔️ Défi à deux** : les sœurs jouent le même jeu tour à tour, écran de résultat commun et bienveillant, bouton Revanche
- **Profils avec photos** : chaque fille a sa carte, on ajoute sa photo (bouton 📷) et sa tête apparaît dans les jeux (Poussin Volant, Course, Attrape, Habille-toi…) et dans le **Puzzle Photo** 🤳 (glisser-déposer avec image fantôme pour guider)
- **Personnage illustré** : la photo devient le visage d'un personnage SVG dessiné (cheveux, corps, habits) ; le look choisi dans Habille-toi suit la joueuse dans Poussin Volant, Course et Attrape
- **Jeux créatifs sans score** : Coloriage magique, Habille ton avatar, Petit Piano (mode libre + mélodies guidées « suis les lumières »)
- **Chaussettes** : paires de chaussettes dessinées en SVG à trier sur le fil à linge, contre la montre
- **Apprentissages** : Suites logiques (formes SVG), Quelle heure ? (horloge à aiguilles), Grand Tableau des multiplications 10×10 (Explore / Trouve la case / Remplis ta table), Labyrinthe généré (toujours solvable)
- **Pop-corn !** : les grains tremblent quand ils sont chauds — tape dessus, POP, le pop-corn saute dans le carton
- **Boîte à Rythme de la ferme** : séquenceur 8 pas × 4 animaux dessinés, sons synthétisés, 3 tempos, presets
- **Puzzle avec n'importe quelle photo** : bouton 📷 dans le Puzzle pour charger une photo (papa, mamie, le chat…), gardée pour la prochaine fois
- **Aucune mécanique d'addiction** : pas de monnaie, pas de boutique, pas de zones à débloquer — juste des étoiles et un album
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

## 🗺 Prochaines idées

- 🤝 Mode **coopération** (les deux jouent en même temps sur le même écran)
- 🖼 Les dessins des filles (scannés) comme fonds de niveaux
