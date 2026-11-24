# La démo du Salon de coiffure

Hors de l'app : une page à part pour mettre au point les cheveux
(`src/core/hair.ts`, `src/core/hair3d.ts`) avant de les intégrer.

```bash
npm run coiffure
```

ouvre la démo sur http://localhost:5301/ (`?coiffure=couettes` pour les
couettes). La tête : `Base_Female.vrm.wasm`, le corps de base de VRoid
(CC0, voir `LICENCE-tete.txt`), textures réduites ; l'extension `.wasm`
vient d'une page publiée qui ne servait pas les `.vrm`.

À vérifier sur une vraie carte graphique, en mouvement : la fluidité, la
brosse, l'élastique, les cheveux qui ne doivent jamais bouger seuls.
