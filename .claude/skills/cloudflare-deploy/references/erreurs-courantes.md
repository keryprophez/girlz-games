# Erreurs courantes — table complète
> maj 2026-10-05

Leçons validées en prod. Toute nouvelle leçon → ajouter ici ET backporter au
repo template `tld-docs` (règle « Rétroaction » du CLAUDE.md).

> Les gotchas propres aux **sessions Claude Code web** (commit « Unverified »
> faux négatif, fetch bloqué anti-bot vs policy réseau, conteneur éphémère)
> vivent dans la skill `claude-code-web` — pas ici.

| Erreur | Conséquence | Comment éviter |
|---|---|---|
| Laisser tourner le Supabase créé par Lovable | Pas de contrôle, Lovable peut le couper | Migrer vers TON Supabase dès la purge (ou abandonner Supabase si vitrine) |
| Supabase par défaut sur une vitrine | Pause après 7 j, limite 2 projets Free, 25 $/mois ensuite | Tableau DB du SKILL.md : pas de DB pour Essentiel/Pro, D1+R2 pour Autonome |
| Changer les NS vers CF sans copier les MX | Emails pro down | MX copiés dans CF AVANT le switch NS (dns-domaines.md §1) |
| Nouveau compte Cloudflare par projet | Billing dispersé, perte de vue globale | Tout sur le compte Cloudflare unique |
| Token CF via templates par défaut | Trop puissant (sécu) ou trop faible (deploy KO) | Custom token, permissions exactes (cicd-secrets.md §3) |
| Versions semver `^`/`~` sur libs critiques | Build qui casse seul à la prochaine minor | Pin exact + Dependabot (skill tld83-standards) |
| Pas de `bun audit` régulier | CVE qui s'accumulent | Routine mensuelle + Dependabot dès 3 repos en prod |
| Commits directs dans `main` sur un projet client/pro | Mélange dev/prod, plus de filet, deploy non validé | Branche de travail + feu vert avant push (CLAUDE.md > Git ; perso : push direct OK) |
| Pas de tests avant les features | Refactor risqué | Vitest + tests critiques dès le setup pro |
| Cloudflare Workers Builds au lieu de GHA | Lock-in CF, debug pénible, WAF | GitHub Actions dès le début |
| `.env` committé une fois | Secrets dans l'historique git pour toujours | `.gitignore` propre + révoquer immédiatement tout secret leaké |
| Tables Lovable avec RLS trop permissives | Lecture publique de données sensibles | Auditer les policies RLS à la purge |
| Preview / `*.workers.dev` indexé avant la bascule | Duplicate content + pénalité SEO | SEO fermé par défaut (seo-ouverture.md §1) |
| Migration depuis un `.htaccess` avec cache 1 an, sans `_headers` | Cache perdu : Cloudflare sert `max-age=0, must-revalidate` par défaut | `public/_headers` : `immutable` 1 an sur `/assets/*`, 1 semaine sur `/img/*` (wrangler-tanstack.md) |
| En-têtes de sécurité seulement dans `_headers` | Absents des réponses du Worker (SSR, 404, redirections, `env.ASSETS.fetch()`) | Source unique en TS appliquée par le Worker + test qui la compare à `_headers` |
| Prerender + `assets` sans `run_worker_first` | Pages servies sans le Worker : pas de 301 apex ↔ www ni d'en-têtes posés par le Worker | `"run_worker_first": ["/*", "!/assets/*", "!/img/*"]` + le Worker sert la page via `ASSETS` |
| Prerender (`page/index.html`) avec `html_handling` par défaut | 307 de `/page` vers `/page/`, alors que liens et canonical sont sans slash (constaté en local puis validé en prod le 2026-09-23) | `"html_handling": "drop-trailing-slash"` dans `assets` |
| Prerender avec `crawlLinks` sans `filter` | Un lien `/page?x=1` est rendu dans `page/index.html` : la page nue est écrasée | `filter: (page) => !page.path.includes("?")` + le Worker ne sert `ASSETS` que sans query string |
| `validateSearch` non idempotent | 307 SSR vers l'URL nue, paramètre (et message d'erreur) perdu | `f(f(x))` = `f(x)` testé (wrangler-tanstack.md §5) |
| Supprimer `.wrangler/deploy/config.json` (ancien `rm`) sur wrangler 4.x / plugin ≥ 1.39 | Deploy cassé : « entry-point not found » (wrangler retombe sur la config racine) | **Garder** le pointeur, il est requis (wrangler-tanstack.md §2) |
| `nitro: true` au lieu de `@cloudflare/vite-plugin` | Chemin non validé en prod SSR + edge | Plugin officiel ; exiger une justification sinon |
| Nom du Worker auto-généré (`tld83-<projet>`) | URL moche, pas portable | Figer `"name"` dans `wrangler.jsonc` dès le départ |
| Pas de prerendering sur une vitrine sans DB | Workers facturé pour rien, SSR à chaque hit | Prerendering activé (wrangler-tanstack.md) |
| Entrée serveur nommée `server` (`src/server.ts`) + prerender activé | Build cassé au prerender : « Cannot find module dist/server/server.js » | Nommer l'entrée `index` → `src/index.ts` (wrangler-tanstack.md, section Prerendering) |
| 301 posés chez l'ancien hébergeur | Le jour J ils deviennent invisibles → 404 partout | 301 dans le Worker AVANT la bascule (seo-ouverture.md §2) |
| Sharp sans `.rotate()` dans le pipeline images | Photos téléphone tournées de 90° en prod (EXIF ignoré) | `.rotate()` systématique (skill tld83-standards → pipeline-images.md) |
| Doublon `www`/apex non géré (ni canonical ni 301) | Duplicate content + dilution PageRank | Canonical dans le layout racine ; middleware 301 si besoin UX |
| Ajouter `www` via la nouvelle UI Workers > Domains (CF mai 2026) | Pas de champ texte libre → bloqué | Déclaratif dans `wrangler.jsonc` (`routes` + `custom_domain: true`) dès le 1er deploy |
| Deploy avec `routes: [www]` quand un Custom Domain apex existe via UI | Bloc `routes` déclaratif/destructif → CF retire le binding apex → site down | Toujours lister TOUS les Custom Domains dans `routes` |
| `workers.dev` désactivé seulement via l'UI | Le toggle se réactive à chaque deploy (doc CF) → duplicate content | `"workers_dev"` explicite dans `wrangler.jsonc` : `true` pendant le dev (preview), `false` à la mise en ligne |
| CNAME `www → apex` proxied « tout seul » | Résout vers CF mais aucun Worker bindé sur `www` → 522/525 | Custom Domain via `wrangler.jsonc` |
| Single Redirect www→apex sans record DNS sous-jacent | Le redirect ne se déclenche jamais | D'abord le Custom Domain `www`, ensuite (optionnel) le Single Redirect |
| Chercher un gotcha « session Claude Code web » ici | Mauvaise skill chargée, leçon introuvable | Skill `claude-code-web` (signature git, réseau/proxy, conteneur éphémère) |
| `CLOUDFLARE_ACCOUNT_ID` collé en secret GitHub avec un espace de fin | Toutes les requêtes API Cloudflare échouent, sans erreur claire | Account ID pas sensible → le figer dans `wrangler.jsonc` (`account_id`), pas en secret GitHub (cicd-secrets.md §4) — 1 seul secret à poser par projet (`CLOUDFLARE_API_TOKEN`) |
| CNAME mail (`autoconfig`, `autodiscover`, DKIM) laissés « Proxied » après l'import d'une zone existante | Config auto des clients mail cassée + DKIM invalide → mails sortants classés en spam | Repasser ces records en « DNS only » juste après l'import (dns-domaines.md §1 bis, anti-bug n°2) |
| Supprimer les records web (`A`/`AAAA`/`CNAME www`) avant d'avoir réussi le deploy Custom Domains | La zone prend autorité vide au switch NS → site down toute la propagation (jusqu'à 48 h) | Deploy d'abord (zone inerte tant que les NS ne sont pas basculés) ; en fallback, recréer `A apex → IP ancien hébergeur` (dns-domaines.md §1 bis) |
| Conclure « token mal configuré » sur `Some triggers failed to deploy` | Temps perdu sur un faux coupable, token refait pour rien | `WRANGLER_LOG: debug` puis lire le code HTTP : `409` = record DNS en conflit, `403` = permissions Zone (dns-domaines.md §1 bis, anti-bug n°3) |
| `WRANGLER_LOG_SANITIZE=false` pour déboguer un deploy | Headers d'authentification déversés dans les logs CI | `WRANGLER_LOG: debug` suffit — jamais `SANITIZE=false` |
| Build prerender qui sort en erreur 1 hors CI après avoir prerendu toutes les pages (`process.stdin.off is not a function`) | Prerender désactivé « en attendant », vitrine servie en SSR pur pour rien | Garde `keepNodeProcessDuringPrerender()` dans `vite.config.ts` (wrangler-tanstack.md, Prerendering) ; jamais `CI=true` en local ni prerender coupé |
| `vite-tsconfig-paths` avec Vite ≥ 8 | Avertissement à chaque commande, plugin inutile | `resolve: { tsconfigPaths: true }` natif dans vite.config et vitest.config |
| Typecheck avant le build en CI | `tsc` échoue : `src/routeTree.gen.ts` n'existe pas encore (généré par le build) | Ordre lint → test → build → typecheck (cicd-secrets.md §1) |
| Clé `workers_dev` absente de `wrangler.jsonc` (commentée) pendant une bascule | wrangler la désactive par défaut → plus de filet `*.workers.dev`, « No targets deployed » | `"workers_dev": true` explicite pendant la bascule, `false` une fois les Custom Domains vérifiés (dns-domaines.md §1 bis, anti-bug n°4) |
| Lire une API tierce (Notion) sans relance ni dernière lecture gardée | Une erreur 5xx passagère vide le site : en octobre 2026, l'API Notion a renvoyé 500 « Cross-cell memcached access is not allowed » et 504 sur ~50 % des appels pendant des heures, page de statut au vert | Relancer 429 / 5xx / coupure réseau (délai par essai, budget total, jamais sur 400/401/404) ; garder la dernière lecture réussie (R2 ou KV, clé hors de toute route publique, exclue des purges) et la servir avec une ancienneté maximale validée par le propriétaire |
