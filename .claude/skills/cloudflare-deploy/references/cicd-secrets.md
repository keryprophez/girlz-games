# CI/CD GitHub Actions & secrets — procédures exactes
> maj 2026-10-05

> Procédure token vérifiée sur l'UI Cloudflare (état mai 2026 ; liste API
> Tokens et résumé revérifiés le 2026-10-05 sur food-coach). Si l'UI a changé,
> vérifier avant d'affirmer.

## 1. Workflow deploy

Les deux workflows de référence sont **versionnés dans le template**
(`.github/workflows/ci.yml` pour les PR + audit hebdo, `deploy.yml` pour le push
sur `main`) : cette section explique les choix, le YAML fait foi.

Ordre : `bun install --frozen-lockfile` → lint → test → **build → typecheck** →
deploy. Les tests (Vitest) ne dépendent pas du build : ils tournent avant, pour
échouer vite. Le typecheck vient **après** le build, et pas avant : le plugin
TanStack Start génère `src/routeTree.gen.ts` (gitignoré) pendant le build, et
`tsc` échoue tant que ce fichier n'existe pas (constaté sur tld83).

- **Déclencheur : une seule branche déploie** (un seul Worker, pas de staging).
  `on: push: branches: [<branche>]` explicite, jamais `on: push` nu — sinon
  chaque branche de travail écrase la prod. Noter la branche dans
  ARCHITECTURE.md §6.

- **`vite build` ne vérifie PAS les types.** esbuild retire les annotations TS
  sans les contrôler (vérifié sur awa-communication : une erreur de type
  volontaire passe le build sans broncher). Le contrôle réel est un script
  `"typecheck": "tsc --noEmit"` dans `package.json`, exécuté en CI **avant** le
  build. Sans ce step, aucun contrôle de types n'existe avant déploiement.

  ```yaml
  # .github/workflows/deploy.yml - step order
  - uses: oven-sh/setup-bun@v2
    with:
      # Example value: must equal the local bun that wrote bun.lock (tld83-standards §2).
      bun-version: 1.3.11
  - run: bun install --frozen-lockfile
  # vite build strips TS annotations without checking them: tsc is the real gate.
  - run: bun run lint
  - run: bun run test
  - run: bun run build
  # routeTree.gen.ts now exists: tsc can run.
  - run: bun run typecheck
  - uses: cloudflare/wrangler-action@v4
    with:
      apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
  ```

  ```json
  // package.json
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
  ```

- Actions en Node 24 (Node 20 déprécié sur les runners GitHub) :
  `actions/checkout@v7`, `oven-sh/setup-bun@v2`, `cloudflare/wrangler-action@v4`
  (runtimes vérifiés le 2026-09-23 ; `wrangler-action@v4` pas encore passé
  par un vrai déploiement, `deploy.yml` étant inerte dans le template : surveiller
  le premier deploy d'un projet). La v4 de `wrangler-action` a un seul changement
  cassant : sans `wranglerVersion`, elle installe wrangler v4 par défaut. Sans
  effet ici : si wrangler est déjà installé dans le projet (épinglé dans
  `package.json`), l'action réutilise cette installation.
- Bun en CI : `oven-sh/setup-bun@v2` **avec `bun-version` pinné** (même valeur
  que le bun local, sinon lockfile illisible : `tld83-standards` §2) puis
  `bun install --frozen-lockfile` (équivalent `npm ci`). `bun.lock` versionné =
  build reproductible.
- **Repository secrets** (pas Environment secrets — utiles seulement avec
  staging/prod séparés).
- **Jamais Cloudflare Workers Builds** (intégration Git native CF) : trop
  magique, dépend du dashboard CF (parfois bloqué par WAF), peu portable.
- **Ne pas** ajouter de step supprimant `.wrangler/deploy/config.json` : ce
  pointeur de deploy est **requis** par wrangler 4.x / `@cloudflare/vite-plugin`
  ≥ 1.39. On le garde (détails et note historique : wrangler-tanstack.md §2).

- **Le premier run échoue au step deploy tant que les secrets ne sont pas
  posés — c'est normal.** On pousse, on pose les secrets, on relance. Ne pas
  chercher de bug ailleurs.

- **`wrangler deploy` efface les variables posées à la main dans le dashboard**
  (le fichier wrangler est la source de vérité ; les secrets, eux, survivent).
  Toute variable destinée à être réglée depuis le dashboard (durée de session,
  feature flag) impose `"keep_vars": true` dans wrangler.jsonc, sinon elle
  disparaît au prochain déploiement CI. Vérifié sur awa-communication
  (schéma wrangler 4.105 : keep_vars, défaut false).

- **Secret posé dans le dashboard** (Worker → Settings → Variables and
  secrets → Add variable, type Secret) : une bannière jaune « Update your
  Wrangler configuration with these changes to keep deployments in sync »
  apparaît avec `"vars": {}`. Pour un secret, elle est sans objet : un secret
  n'a rien à faire dans le fichier wrangler et survit aux déploiements ; la
  fermer. Seules les variables en clair relèvent de `keep_vars`. Vérifié sur
  food-coach (2026-10-05).
- **Juste après l'enregistrement d'un secret**, une requête peut encore être
  servie avec l'ancienne configuration (constaté sur food-coach : première
  requête encore « fermée », les suivantes correctes quelques secondes après).
  Retester avant de conclure à une erreur. Si ça reste fermé : vérifier le nom
  complet (le dashboard tronque les noms longs, le crayon l'affiche en entier)
  et la longueur minimale qu'exige le code (ex. 32 caractères pour une clé de
  signature).

## 2. Secrets GitHub à poser (uniquement ce que le projet utilise)

| Secret | Quand | Note |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | toujours | procédure exacte ci-dessous |
| `SUPABASE_URL` | si DB Supabase | sinon ne pas créer |
| `SUPABASE_PUBLISHABLE_KEY` | si DB Supabase | lectures RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | si DB Supabase | écritures, jamais côté client |
| `RESEND_API_KEY` | si email transactionnel | + `RESEND_FROM` |
| `<API>_TOKEN` | si API d'écriture authentifiée (ex. webhook n8n) | Bearer partagé |

> `CLOUDFLARE_ACCOUNT_ID` **n'est plus un secret GitHub** : à figer directement
> dans `wrangler.jsonc` (`account_id`, cf. §4). Ce n'est pas une donnée
> sensible (visible dans le dashboard CF, aucun droit associé), et ça évite une
> classe d'erreur entière (cf. erreurs-courantes.md).

**1 secret suffit** pour une vitrine sans DB/email/API. Si le projet est
volontairement minimaliste, le noter dans ARCHITECTURE.md (« Secrets configurés »)
pour ne pas croire à un oubli plus tard.

> **D1 et R2 ne nécessitent aucun secret GitHub** : bindings déclarés dans
> `wrangler.jsonc`, auth via `CLOUDFLARE_API_TOKEN`.

### Un secret GitHub n'arrive pas tout seul dans le Worker

`wrangler-action` ne pousse dans le Worker que ce qu'on lui liste : l'input
`secrets:` (un nom par ligne), dont les valeurs sont lues dans `env:`. Sans ça,
`RESEND_API_KEY` posé sur GitHub n'existe pas côté runtime (`env.RESEND_API_KEY`
vaut `undefined`). Les secrets ainsi poussés **survivent** aux déploiements
suivants (contrairement aux `vars` du dashboard, cf. §1 `keep_vars`).

```yaml
- uses: cloudflare/wrangler-action@v4
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    # Names of the secrets to push into the Worker, values read from env below.
    secrets: |
      RESEND_API_KEY
      RESEND_FROM
  env:
    RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
    RESEND_FROM: ${{ secrets.RESEND_FROM }}
```

En local, les mêmes clés vont dans `.dev.vars` (gitignored, format `KEY=value`),
lu par wrangler / `@cloudflare/vite-plugin` — pas dans `.env`.

## 3. Procédure exacte `CLOUDFLARE_API_TOKEN`

Un token par projet : il se repère d'un coup d'œil dans la liste API Tokens et
se révoque sans toucher aux autres projets.

> **Compte et `tld83`** : il n'y a qu'un compte Cloudflare, affiché
> « <email>'s Account » dans le dashboard. `tld83` est le sous-domaine
> `workers.dev` des Workers (`<worker>.tld83.workers.dev`), pas le nom du
> compte : ne pas le chercher dans les menus de compte.

1. Dashboard Cloudflare → avatar (haut droite) → **My Profile**
2. Onglet **API Tokens** → **Create Token**
3. **Custom token** → **Get started** (PAS les templates : trop ou trop peu de droits)
4. Token name : le nom du repo du projet (ex. `food-coach`, `medical-history`)
5. **Permissions** (« Add more » autant que nécessaire) :

   | Niveau | Permission | Accès | Pour quoi |
   |---|---|---|---|
   | Account | Workers Scripts | **Edit** | déployer le Worker (obligatoire) |
   | Account | Account Settings | **Read** | wrangler vérifie l'account (obligatoire) |
   | User | Memberships | **Read** | évite « no account found » |
   | Account | Workers R2 Storage | **Edit** | si Autonome (upload photos) |
   | Account | D1 | **Edit** | si Autonome (migrations DB) |
   | Zone | Workers Routes | **Edit** | si Custom Domain |
   | Zone | Zone | **Read** | wrangler liste les zones |

6. Account Resources → Include → Specific account → **« <email>'s Account »**
   (le seul de la liste)
7. Seulement si une permission Zone est cochée : Zone Resources → Include →
   **All zones from an account** → ce même compte (sinon les Custom Domains ne
   marchent pas)
8. TTL : vide, ou 1 an si rotation souhaitée
9. Continue to summary : vérifier le résumé. Sans domaine dédié, il liste
   « <email>'s Account » avec les permissions Account, « All users » avec
   Memberships:Read, et aucune zone ; dans la liste API Tokens, la colonne
   Resources affiche alors « 1 Account, <email> » sans « All zones ». Puis
   Create Token → **copier la valeur (visible 1 seule fois)**
10. GitHub → repo Settings → Secrets and variables → Actions → New repository
    secret → `CLOUDFLARE_API_TOKEN`

> ⚠️ **Un deploy qui échoue sur les *triggers* n'accuse pas forcément le token.**
> `Some triggers failed to deploy` sort aussi bien sur un record DNS en conflit
> (`409`) que sur une permission Zone manquante (`403`) — le message ne dit pas
> lequel. Obtenir le code HTTP (`WRANGLER_LOG: debug` en `env` du step
> wrangler-action) AVANT de refaire le token : procédure et lecture des codes
> dans [dns-domaines.md](dns-domaines.md) §1 bis, anti-bug n°3.

## 4. `CLOUDFLARE_ACCOUNT_ID` — dans `wrangler.jsonc`, pas en secret GitHub

L'Account ID n'est pas un secret (aucun droit associé, visible pour tout membre
du compte) : ne pas créer de secret GitHub pour ça, le figer directement dans
`wrangler.jsonc` du projet.

1. Account ID du compte Cloudflare (unique) : **`6a37af72767a90d91ba88a08adcc9f84`**
   (pour le revérifier : dashboard CF → page d'accueil → sidebar droite « Account ID »)
2. `wrangler.jsonc` :

   ```jsonc
   {
     "account_id": "6a37af72767a90d91ba88a08adcc9f84"
   }
   ```

> **Pourquoi ce changement** : un `CLOUDFLARE_ACCOUNT_ID` collé en secret GitHub
> avec un espace de fin (erreur de copier-coller invisible à l'écran) casse
> silencieusement toutes les requêtes à l'API Cloudflare — pas d'erreur claire,
> juste des échecs d'auth. En sortant l'Account ID des secrets, cette classe
> d'erreur disparaît et il ne reste plus qu'un seul secret GitHub à poser par
> projet (`CLOUDFLARE_API_TOKEN`).
