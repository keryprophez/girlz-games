# Le Courrier en ligne — conception

Statut : **validée par le père**, la troisième exception à la règle 3 (§ 2)
comprise. Rien n'est codé.
Le jeu lui-même est décrit dans `2026-11-25-courrier-design.md` (en ligne
depuis le 26/11) ; ce document ne change que l'endroit où ses lettres sont
gardées.

**[décidé]** = dit par le père ; **[proposé]** = mon choix, validé avec ce document.

---

## 1. L'intention

Le père veut une « bébé base de données » Cloudflare qui garde **tout ce que
les filles s'envoient** dans le Courrier [décidé] :
- **lui** le consulte depuis le tableau de bord Cloudflare [décidé] ;
- **elles** retrouvent leur boîte, leurs Souvenirs et leurs brouillons depuis
  **n'importe quel appareil et n'importe quelle session** où le code d'accès a
  été saisi [décidé].

Seulement le Courrier : les créations des autres jeux restent sur la tablette
[décidé].

### Objectifs
1. Une lettre postée sur un appareil arrive dans la boîte de sa sœur sur tous
   les autres.
2. Une trace complète, gardée sans limite de durée, lisible par le père dans le
   tableau de bord : qui écrit à qui, quand, le texte ; les dessins et les voix
   téléchargeables.
3. Ne jamais perdre une lettre ni un brouillon, même si le réseau tombe.

### Hors périmètre
- Les autres jeux. L'accès du père DANS l'app (il passe par Cloudflare).
- Le fonctionnement sans réseau : `CLAUDE.md` dit que le hors-ligne n'est pas
  une contrainte [décidé par le choix « le coffre en ligne »].
- Toute notification, tout e-mail, tout tiers.

### Ce qui en ferait un échec
- Une lettre annoncée postée qui n'est pas sur Cloudflare.
- Une lettre ou une voix lisible par quelqu'un qui n'a pas le code d'accès.
- Un brouillon perdu en changeant d'appareil ou parce que le réseau a sauté.
- La tablette d'aujourd'hui qui perd les lettres déjà écrites.

---

## 2. Les contraintes

- **Règle 3, troisième exception (choisie par le père, 26/11)** : les lettres
  du Courrier — texte, dessins, voix, sans autre donnée — sont gardées sur le
  compte Cloudflare `tld83` du père, accessibles seulement à travers le Worker,
  derrière le code d'accès de la famille. Rien ne part ailleurs. `CLAUDE.md`
  l'écrit.
- **Le code d'accès** (cookie signé, `worker/access.ts`) protège toutes les
  nouvelles routes : sans lui, 401.
- **Gratuit** : D1 5 Go, R2 10 Go, requêtes du Worker (100 000 par jour) ; une
  lettre pèse quelques centaines de Ko (le dessin, les voix).
- **Tests sans réseau** : le Worker se teste avec des D1 et R2 simulés
  (vitest) ; les bots continuent de jouer sous `vite preview`, sans Worker.
- **Qui écrit** : le code d'accès est celui de la famille ; le Worker ne sait
  pas QUELLE fille écrit (`de`, `:qui` viennent de l'app). Tout appareil qui a
  le code voit les deux boîtes — exactement comme la tablette aujourd'hui.
- **`CLAUDE.md` à modifier** : la règle 3 ne connaît que deux exceptions ; la
  troisième s'y écrit, et l'en-tête de `core/courrierdb.ts` (« sur la tablette
  seulement ») change.

---

## 3. Les approches

| Approche | Pour | Contre |
|---|---|---|
| **Le coffre en ligne** — **choisi par le père** | une seule vérité, la même partout ; le moins de code (le jeu passe déjà par un « coffre ») | sans réseau, ni poster ni ouvrir sa boîte |
| Local d'abord, synchronisé | marche sans réseau | conflits entre appareils, beaucoup plus de code |
| Une sauvegarde chaque soir | très simple | la boîte ne suit pas d'un appareil à l'autre : écarté |

---

## 4. Ce qui est gardé, où

**D1** (base `girlz-games-courrier`) — le texte, lisible dans la console :

```sql
CREATE TABLE lettres (
  id      TEXT PRIMARY KEY,
  de      TEXT NOT NULL,             -- 'jade' | 'joyce'
  a       TEXT NOT NULL,
  etat    TEXT NOT NULL,             -- brouillon | cachetee | postee | ouverte | gardee
  cree    INTEGER NOT NULL,          -- ms
  postee  INTEGER NOT NULL DEFAULT 0,
  tour    INTEGER NOT NULL DEFAULT 0,
  papier  TEXT NOT NULL,
  env     TEXT,                      -- JSON { couleur, cachet, timbre }
  objets  TEXT NOT NULL,             -- JSON : les objets, une voix = sa clé R2 (jamais le son)
  peinture TEXT,                     -- clé R2 du dessin, ou NULL
  texte   TEXT NOT NULL DEFAULT '',  -- les textes de la lettre, pour le père
  jetee   INTEGER NOT NULL DEFAULT 0,-- jetée par la destinataire : cachée pour elle, gardée ici
  version INTEGER NOT NULL,          -- compteur de l'app, +1 à chaque écriture
  maj     INTEGER NOT NULL           -- heure du Worker à la dernière écriture (ms), pour le père
);
CREATE TABLE reglages (qui TEXT PRIMARY KEY, prefs TEXT NOT NULL, maj INTEGER NOT NULL);
```

**R2** (compartiment `girlz-games-courrier`, privé, sans accès public) — les
fichiers : `lettres/<id>/peinture.png`, `lettres/<id>/voix-<n>.webm`.

**Le père** lit `SELECT de, a, etat, datetime(postee/1000,'unixepoch') AS quand, texte FROM lettres ORDER BY postee DESC`
dans la console de D1, et télécharge un dessin ou une voix depuis le navigateur
de R2 (dossier `lettres/<id>/`). La procédure est écrite dans `README.md`.

**Jeter** [proposé] : la poubelle des Souvenirs appelle `POST
/api/courrier/lettres/:id/jeter`, qui met `jetee = 1` ; la lettre disparaît
pour elle (la liste ne la rend plus), le père la garde. Rien n'est jamais
effacé de Cloudflare par l'app ; un brouillon abandonné y reste aussi.

**Une version plutôt qu'une heure** [proposé] : les tablettes n'ont pas la
même horloge. Chaque lettre porte un compteur `version` que l'app augmente à
chaque écriture ; le Worker refuse une version qui n'est pas plus grande que
la sienne (un appareil en retard ne peut rien écraser).

---

## 5. Le Worker

Toutes les routes derrière le code d'accès ; les réponses en JSON sauf les
fichiers ; `Origin` vérifiée sur les écritures (comme `/api/acces`).

| Route | Rôle |
|---|---|
| `GET /api/courrier/lettres` | les lettres non jetées, sans les fichiers (les objets voix portent leur clé) |
| `PUT /api/courrier/lettres/:id` | écrit une lettre ; refuse une version qui n'est pas plus grande, un état qui recule (une `postee` ne redevient pas `brouillon`), une lettre jetée, une forme invalide, plus de 40 objets |
| `POST /api/courrier/lettres/:id/jeter` | la cache pour les filles (`jetee = 1`) |
| `PUT /api/courrier/fichiers/lettres/:id/:nom` | écrit un fichier (`peinture.png` ≤ 4 Mo, `voix-<n>.webm` ≤ 2 Mo) |
| `GET /api/courrier/fichiers/lettres/:id/:nom` | lit un fichier |
| `GET`/`PUT /api/courrier/reglages/:qui` | les réglages de chacune (envois, dernière enveloppe, gestes réussis) |

- **L'ordre d'écriture** : les fichiers d'abord, la lettre ensuite. Une lettre
  dans D1 ne désigne jamais un fichier absent.
- **Un état qui ne recule jamais** : un appareil resté sur une vieille version
  ne peut pas défaire ce qu'un autre a fait (rang brouillon < cachetée <
  postée < ouverte < gardée ; `jetee` ne repasse pas à 0).
- **Réessayer ne fait pas de doublon** : un fichier a une clé fixe (la lettre,
  son nom), une lettre son `id` ; réécrire remplace. Des fichiers envoyés pour
  une lettre dont l'écriture a ensuite échoué restent dans R2 sans lien : on
  les laisse [proposé].
- Les réponses de `/api/` restent `no-store` (`worker/headers.ts`) ; l'app
  garde les fichiers en mémoire le temps de la partie.
- `Env` gagne `DB` (D1) et `COURRIER` (R2). Les migrations D1 sont dans
  `worker/migrations/` ; dans `deploy.yml`, la commande de
  `wrangler-action` devient « migrations puis déploiement » : une migration qui
  échoue bloque le déploiement. `wrangler dev` (`npm run worker:dev`) utilise
  des D1 et R2 locaux.

---

## 6. Dans le jeu

Le jeu range déjà ses lettres par l'interface `Coffre` (`core/courrierdb.ts`).
Une troisième réalisation, `coffreEnLigne`, parle au Worker.

- **Une écriture réussie = une réponse 200 du Worker.** Sinon, comme
  aujourd'hui : rien d'annoncé, l'enveloppe revient et se secoue, l'état
  d'avant reste.
- **Le brouillon** [proposé] : gardé sur la tablette à chaque geste (comme
  aujourd'hui, IndexedDB), envoyé en ligne quand elle quitte la feuille (et à
  « Envoyer »). À l'ouverture, la plus grande `version` des deux gagne (égalité :
  celle en ligne). Une tablette qui s'éteint en pleine feuille garde ses
  derniers gestes chez elle ; en ligne, il manque ceux d'après la dernière
  sortie [proposé : accepté].
- **Les fichiers, à la demande** [proposé] : la liste arrive sans fichiers ;
  `Lettre` gagne `aCharger?: true` et une clé par fichier (`peintureCle`,
  `cle` sur chaque voix). Le `Coffre` gagne `completer(l): Promise<Lettre |
  null>` (les coffres locaux rendent la lettre telle quelle). Le jeu l'appelle
  avant de montrer une lettre : la feuille, le pliage, l'ouverture, la
  lecture, chaque vignette des Souvenirs ; un échec se traite comme un
  morceau illisible (la lettre s'ouvre sans lui). Les fichiers restent en
  mémoire le temps de la partie. Format : le dessin en PNG, les voix telles
  que `MediaRecorder` les donne (WebM/Opus sur la tablette).
- **La boîte se met à jour** : la liste est relue en entrant chez l'une ou
  l'autre et en touchant sa boîte, rien d'autre. Pas de relecture régulière
  [décidé] : elles jouent l'une après l'autre, une quinzaine de minutes par
  semaine ; une lettre postée pendant qu'une autre joue ailleurs se voit en
  revenant.
- **Sans réseau** [proposé] : la ferme s'ouvre ; un petit nuage barré
  remplace le drapeau sur les boîtes, la boîte ne s'ouvre pas, « Écrire »
  marche (brouillon local), « Poster » échoue comme une écriture refusée. Le
  jeu réessaie à la prochaine entrée ou au prochain toucher de la boîte.
- **Ce qui est déjà sur la tablette** : à la première ouverture avec le coffre
  en ligne, chaque lettre et chaque réglage locaux absents de Cloudflare y
  partent (fichiers d'abord). La base locale n'est pas effacée.
- **Les bots** jouent avec le coffre local (`__BOT`), sous `vite preview`
  sans Worker : le chemin en ligne n'a pas de bot. Il se teste par les tests
  du Worker, ceux du coffre en ligne (fetch simulé) et un essai à deux
  navigateurs sous `wrangler dev` (D1 et R2 locaux).

---

## 7. Ce que le père fait une fois

1. Dans le tableau de bord Cloudflare : créer la base D1 `girlz-games-courrier`
   et le compartiment R2 `girlz-games-courrier` (on reste sur le compte `tld83`).
   Donner l'identifiant de la base D1 (il va dans `wrangler.jsonc`).
2. Modifier le jeton `CLOUDFLARE_API_TOKEN` du dépôt : ajouter **D1 · Edit** et
   **Workers R2 Storage · Edit** (procédure du skill `cloudflare-deploy`).

**Porte** : tant que ces deux gestes ne sont pas faits, la branche n'est pas
envoyée sur `main` (le déploiement échouerait : les liaisons de
`wrangler.jsonc` désignent une base et un compartiment qui n'existent pas).

---

## 8. Vérifier

- **Tests du Worker** : refus sans code, refus d'une autre origine, refus d'un
  état qui recule, d'une version qui n'avance pas, d'un fichier trop gros ou
  mal nommé, d'une forme invalide ; l'aller-retour d'une lettre et d'un
  fichier ; une lettre jetée absente de la liste et qui ne s'écrit plus.
- **Tests du coffre en ligne** (fetch simulé) : une réponse 500 ou un réseau
  absent rend `false` ; les fichiers partent avant la lettre ; la reprise d'un
  brouillon prend la plus grande `version`.
- **Sous `wrangler dev`** : deux navigateurs (deux « appareils ») ; Jade
  poste dans l'un, la lettre arrive chez Joyce dans l'autre ; la migration
  d'une tablette déjà pleine.
- **En ligne, avec le père** : une lettre de test, lue dans la console D1 et
  dans R2.

---

## 9. Laissé au bâtisseur

Le découpage des fichiers du Worker, le format exact des réponses, la forme du
cache des fichiers en mémoire, le nom des migrations, le dessin du nuage
barré, le détail des validations (au-delà des limites ci-dessus).
