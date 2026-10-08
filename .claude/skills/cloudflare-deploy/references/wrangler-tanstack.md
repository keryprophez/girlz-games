# TanStack Start + Cloudflare Workers — les 5 pièges validés en prod
> maj 2026-09-24

Faits constatés en prod, pas des hypothèses. À appliquer dès le setup.

## 1. Compilation : `@cloudflare/vite-plugin`, PAS `nitro: true`

TanStack Start a historiquement supporté Nitro comme target, mais le chemin
validé en prod est le plugin officiel Cloudflare. `vite.config.ts` :

```ts
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

export default defineConfig(({ command }) => ({
  plugins: [
    // cloudflare() only at build time, targets the SSR environment
    ...(command === "build" ? [cloudflare({ viteEnvironment: { name: "ssr" } })] : []),
    tanstackStart({ server: { entry: "index" } }), // "index" (file src/index.ts), not "server" — see Prerendering
  ],
}));
```

> Si une session propose `nitro: true` : exiger une justification (version
> TanStack Start + raison vs plugin officiel). En 2026, le plugin officiel est
> le chemin propre SSR + edge.

## 2. NE PAS supprimer le pointeur de deploy — il est requis

`vite build` génère `.wrangler/deploy/config.json`, qui pointe vers
`dist/server/wrangler.json` (Worker bâti + assets `dist/client`). Avec
`@cloudflare/vite-plugin` ≥ 1.39 + wrangler 4.x, ce pointeur est **requis** :
`wrangler deploy` le suit et déploie correctement. Le **supprimer** fait
retomber wrangler sur la config racine, qui traite `main` comme un fichier
d'entrée littéral → **deploy cassé** (« entry-point not found » / re-bundle de
l'entrée). Aucun step `rm` dans `deploy.yml` : on laisse le pointeur en place.

Vérifier le déploiement sans rien envoyer :

```bash
wrangler deploy --dry-run
```

> Sources : le mécanisme « config racine = entrée ; config générée au build =
> sortie utilisée pour le deploy ; `wrangler deploy` reconnaît le build Vite et
> ne re-bundle pas » est documenté par Cloudflare
> ([blog du plugin Vite](https://blog.cloudflare.com/introducing-the-cloudflare-vite-plugin/)).
> Le nom de fichier `.wrangler/deploy/config.json` et la disparition de l'erreur
> « different base path » restent **constatés en prod** (détail interne non
> documenté), d'où la note ci-dessous.

> Note historique : un ancien conseil supprimait le pointeur
> (`rm -f .wrangler/deploy/config.json`) pour contourner une erreur
> « different base path ». Cette erreur n'existe plus sur wrangler 4.x /
> plugin ≥ 1.39 (vérifié sur plugin 1.39.2 & 1.40.2, wrangler 4.97 & 4.100, puis
> `wrangler deploy --dry-run` sur plugin 1.57.3 & wrangler 4.136.3 le 2026-09-23,
> plugin 1.58.0 & wrangler 4.137.0 le 2026-09-24).
> Ne plus supprimer le pointeur.

## 3. Figer le nom du Worker dans `wrangler.jsonc` dès le départ

Sinon CF génère un nom préfixé compte (`tld83-<projet>`) → URL moche, pas
portable.

```jsonc
{
  "name": "<projet>", // instead of auto-generated tld83-<projet>
  "main": "src/index.ts", // server entry named "index" (see Prerendering)
  "account_id": "6a37af72767a90d91ba88a08adcc9f84" // tld83 — not a secret, no GitHub secret needed (cicd-secrets.md §4)
}
```

## 4. Premier run en échec au deploy = normal

Tant que les secrets GitHub ne sont pas posés (cf. cicd-secrets.md), le step
deploy échoue. Poser les secrets, relancer. Ne pas chercher de bug ailleurs.

## 5. `validateSearch` doit être stable si on l'applique deux fois

Le routeur JSON-parse les paramètres d'URL (`?x=1` → le nombre `1`,
`?x=true` → le booléen `true`). En SSR, il reconstruit l'URL avec
`validateSearch` puis **réapplique `validateSearch` à son propre résultat**
avant de comparer à l'URL demandée ; si elles diffèrent, il renvoie un 307
vers la forme canonique. Une fonction non idempotente (ex. `x === '1' ? true :
undefined`, qui fait `1 → true` puis `true → undefined`) fait disparaître le
paramètre : redirection vers l'URL nue, message d'erreur jamais affiché.
Constaté en prod (AWA, page de code d'accès, « Code incorrect » invisible).

- Accepter toutes les formes que le routeur peut produire (`true`, `1`,
  `'1'`, `'true'`) et vérifier `f(f(x))` = `f(x)` dans un test.
- Côté serveur, rediriger directement vers la forme que le routeur garde
  (`?x=true` pour un booléen), sinon un 307 de plus.

---

## Prerendering — DÉFAUT des vitrines sans DB (Essentiel/Pro)

Aucune édition runtime → prerendering activé **par défaut**. Résultat : HTML
statiques servis depuis le cache CDN, latence ~10 ms, Lighthouse 95+ trivial,
coût quasi nul sur le free tier, SEO identique au SSR. Seule exception : un site
à contenu dynamique par requête garde le SSR pur. Prerender officiellement
supporté par Cloudflare ([changelog déc. 2025](https://developers.cloudflare.com/changelog/post/2025-12-19-tanstack-start-prerendering/)).

> **Règle d'or — entrée serveur nommée `index` (pas `server`).** Quand le
> prerender est activé, son serveur de preview (`@tanstack/start-plugin-core`)
> résout l'entrée SSR par le *basename* de l'input (`${basename}.js`). Or
> `@cloudflare/vite-plugin` émet toujours `index.js`. Si l'entrée s'appelle
> `server` (`src/server.ts`), le build casse au prerender :
> « Cannot find module dist/server/server.js ». Nommer l'entrée `index`
> (`src/index.ts`) résout dans tous les cas. Sans prerender, `server.ts`
> fonctionne — d'où ce bug invisible tant qu'on ne prerender pas.
>
> Sources : erreur identique `Cannot find module dist/server/server.js`
> ([TanStack/router #5939](https://github.com/TanStack/router/issues/5939)) ;
> le plugin CF impose un chunk d'entrée nommé `index`
> ([cloudflare/workers-sdk #12497](https://github.com/cloudflare/workers-sdk/issues/12497)).

```ts
// vite.config.ts — entry "index" + prerender
tanstackStart({
  server: { entry: "index" }, // file: src/index.ts (CF plugin emits index.js)
  prerender: {
    enabled: true,
    crawlLinks: true,
    filter: (page) => !page.path.includes("?"), // query-string links would overwrite the bare page's file
  },
})
```

Et côté `wrangler.jsonc` : `"main": "src/index.ts"`.

> **Toujours le `filter`** (validé en prod le 2026-09-23) : `crawlLinks` suit
> aussi les liens avec paramètres (`/page?x=1`) et écrit leur rendu dans le
> fichier de la page nue (`page/index.html`), qui est alors **écrasée** par la
> variante. On ne prerend que les chemins sans `?` ; les variantes passent par
> le SSR (cf. « Pages prerendues » plus bas et §5 `validateSearch`).

L'app reste une SSR React (routes dynamiques activables plus tard), mais les
pages vitrine sont précalculées au build.

### Piège : le build prerender sort en erreur 1 **hors CI** (`process.stdin.off is not a function`)

> Diagnostiqué le 2026-09-14 sur le template (react-start 1.168.50,
> @cloudflare/vite-plugin 1.54.5, vite 8.0.16, wrangler 4.101.0). C'est le
> « crash silencieux » qui avait fait désactiver le prerender sur tld83.
> **Toujours présent** sur @cloudflare/vite-plugin 1.57.3 + wrangler 4.136.3
> (build sans le correctif, 2026-09-23).
>
> **Ce qui le fait disparaître : la `compatibility_date`** (testé le 2026-09-24,
> plugin 1.58.0 + wrangler 4.137.0, build sans le correctif) : crash avec
> `2025-09-24`, build OK avec `2026-09-21`. Correctif **gardé** dans le
> template : sans effet quand le crash n'a pas lieu, il protège un projet resté
> sur une date ancienne.

Symptôme : les pages sont bien prerendues, puis Vite plante à la fermeture du
serveur de preview. Cause : le bundle SSR construit pour Workers
(`nodejs_compat`) embarque `@cloudflare/unenv-preset`, qui exécute
`globalThis.process = <polyfill>` au chargement ; le prerender de TanStack
importe ce bundle **dans le processus Node de Vite**, qui appelle ensuite
`process.stdin.off()` sur le polyfill. Vite saute cet appel quand `CI=true`,
d'où un bug invisible sous GitHub Actions et présent en local ou en sandbox.

Correctif (versionné dans `vite.config.ts` du template) : rendre `process`
non remplaçable pendant le build, fonction `keepNodeProcessDuringPrerender()`.
Le polyfill est fait pour workerd, pas pour Node. Ne pas contourner avec
`CI=true` en local ni désactiver le prerender.

---

## En-têtes, cache et redirections (Workers Static Assets)

- Défaut Cloudflare pour les fichiers statiques :
  `Cache-Control: public, max-age=0, must-revalidate` (constaté sur tld83.fr,
  2026-09). Une migration depuis un `.htaccess` avec cache 1 an PERD ce cache si
  rien n'est fait.
- Fix : `public/_headers`. `immutable` 1 an sur `/assets/*` (fichiers Vite
  hashés) ; ne JAMAIS mettre d'images à nom fixe dans `public/assets/` (elles se
  mélangent aux bundles) → `public/img/` avec un cache court (1 semaine).
- `_headers` et `_redirects` ne s'appliquent PAS aux réponses du Worker (SSR,
  404) : les en-têtes de sécurité vont aussi dans l'entrée Worker. Garder une
  seule source en TS + un test qui compare avec `public/_headers`.
- `_redirects` ne gère pas les redirections de domaine : la 301 apex ↔ www se
  fait dans le Worker. Avec le prerender, les pages sont des fichiers statiques
  servis sans le Worker → `assets.run_worker_first` pour les pages.
- Les chemins exclus de `run_worker_first` (`/assets/*`, `/img/*`)
  n'atteignent **jamais** le Worker : une ancienne URL sous ces préfixes ne peut
  pas être redirigée par `src/lib/redirects.ts`. Elle va dans
  `public/_redirects`, **une ligne par fichier** (`/assets/logo.webp
  /img/logo.webp 301`), **sans joker** : `/assets/*` est partagé avec les
  bundles Vite, un joker les redirigerait aussi (validé en prod le
  2026-09-23).
- `frame-ancestors` est ignoré en `Content-Security-Policy-Report-Only` : poser
  `X-Frame-Options: DENY` + une CSP bloquante réduite à `frame-ancestors 'none'`.
- Tester `_headers` en local : `bun run preview` ne les lit pas. Utiliser
  `bunx wrangler dev --config dist/server/wrangler.json --local-upstream www.<domaine>`
  (sans `--local-upstream`, wrangler dev simule l'apex → tout redirige).
- Sitemap natif TanStack Start (1.171) : namespace `https://www.sitemaps.org/...`
  (le bon est `http://`) + publie un `pages.json`. Préférer un petit générateur
  testé.

### Implémentation dans le template

> **En prod depuis le 2026-09-23** (prerender + `run_worker_first` +
> `drop-trailing-slash`, wrangler 4.137.0, `@cloudflare/vite-plugin` 1.58.0),
> après vérification locale sous `wrangler dev` (wrangler 4.101, 4.136.3 &
> 4.137.0, plugin 1.54.5, 1.57.3 & 1.58.0).

- **En-têtes** : source unique `src/lib/security-headers.ts` (HSTS sans
  `includeSubDomains`, nosniff, Referrer-Policy, `X-Frame-Options: DENY` + CSP
  bloquante `frame-ancestors 'none'`, CSP report-only, Permissions-Policy),
  posée par `src/index.ts` sur **toutes** les réponses du Worker.
  `public/_headers` en est le miroir ; `security-headers.test.ts` casse s'ils
  divergent, et si `public/assets/` existe.
- **301** : `redirectTarget()` (`src/lib/redirects.ts`) envoie la variante
  apex/www qui n'est pas l'hôte de `SITE.url` vers celui-ci, et applique la
  table de l'ancien site dans le même saut. `*.workers.dev` et localhost ne
  sont pas redirigés.
- **Pages prerendues** : `"run_worker_first": ["/*", "!/assets/*", "!/img/*"]`
  dans `wrangler.jsonc` ; le Worker sert la page via `env.ASSETS.fetch()` puis
  retombe sur TanStack Start (routes dynamiques, 404). Le fichier pré-généré est
  le rendu **sans paramètres** : `env.ASSETS` n'est interrogé que si
  `new URL(request.url).search` est vide ; une URL avec query string passe par
  TanStack Start (`validateSearch`, SSR), sinon le visiteur reçoit la page nue
  (validé en prod le 2026-09-23). La doc Cloudflare le
  précise : `_headers` ne s'applique pas non plus aux réponses obtenues via
  `env.ASSETS.fetch()`, d'où les en-têtes posés par le Worker. Le plugin Vite
  recopie bien `run_worker_first` et `html_handling` dans
  `dist/server/wrangler.json`.
- **Piège annexe du prerender** : les pages sont écrites en `page/index.html` ;
  avec `html_handling` par défaut (`auto-trailing-slash`), Cloudflare répond
  307 de `/page` vers `/page/`, alors que liens et canonical sont sans slash.
  Fix : `"html_handling": "drop-trailing-slash"` (`/page` en 200, `/page/` en
  307 vers `/page`).
- Sur l'hôte non canonique, `/assets/*` et `/img/*` restent servis en 200 (pas
  de Worker) : sans effet, aucune page n'y est servie.
- Contrôle local, après `bun run build` :
  `bunx wrangler dev --config dist/server/wrangler.json --local-upstream <hôte>`
  puis `curl -sI http://localhost:8787/<chemin>`. Avec l'hôte canonique : 200 +
  en-têtes partout (page, 404, `sitemap.xml`, `/assets/*`) ; avec l'autre
  variante : 301 sur les pages.

---

## `compatibility_date` : la monter avec wrangler, jamais seule

- Elle fixe le comportement du runtime Workers en prod : tous les flags activés
  entre l'ancienne et la nouvelle date s'appliquent d'un coup, sur chaque site
  qui hérite du template.
- Date maximale = date de release du workerd embarqué par wrangler (wrangler
  4.136.3 et 4.137.0 → workerd 1.20260921.1 → 2026-09-21) : l'outillage local ne fait pas
  tourner une date postérieure.
- Revue : dans `src/workerd/io/compatibility-date.capnp` du tag workerd
  correspondant, lister les `$compatEnableDate` de la fenêtre, et les
  `$impliedByAfterDate` liés à `nodeJsCompat` (modules Node activés d'office).
  Garder ceux qui touchent notre code (streams du SSR, `require`, modules et
  timers Node, `fetch`), puis retester : tests, build + prerender,
  `wrangler dev` (page prerendue, 404 SSR, `sitemap.xml`, en-têtes, 301 www),
  `wrangler deploy --dry-run`.
- Fait sur le template le 2026-09-23 (2025-09-24 → 2026-09-21), en prod depuis
  le 2026-09-23 (wrangler 4.137.0, plugin 1.58.0) : 28 flags dans la fenêtre, surtout Python, Durable Objects, WebSocket,
  Workflows et RPC, hors de notre périmètre ; aucun changement observé, bundle
  serveur 17 Ko plus léger (moins de polyfills unenv). `nodejs_compat` devient
  le défaut au 2026-08-04 : on le garde explicite dans `wrangler.jsonc`.
