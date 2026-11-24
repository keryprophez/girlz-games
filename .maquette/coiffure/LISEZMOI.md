# La démo du Salon de coiffure

Hors de l'app : le moteur du jeu (`src/core/salon3d.ts`), seul dans une page,
pour mettre au point les cheveux et l'essayer sans rien publier. Le jeu
lui-même est `src/games/coiffure.ts`.

```bash
npm run coiffure
```

ouvre la démo sur http://localhost:5301/ (`?coiffure=couettes`,
`?coiffure=tresse`).

`node .maquette/coiffure/seul.mjs sortie.html` met la démo entière (code et
modèle) dans un seul fichier, qui s'ouvre d'un double-clic, sans serveur.

La tête : `Base_Female.vrm.wasm`, le corps de base de VRoid (CC0, voir
`LICENCE-tete.txt`), l'original. L'app sert `public/assets/salon/buste.glb`,
fait par `node .maquette/coiffure/buste.mjs` (sans la vignette ni les cheveux
peints ; les expressions gardées, pour le sourire).

Se juge en mouvement, sur une vraie carte graphique (voir `PIEGES.md`,
« Juger un mouvement sans carte graphique »).
