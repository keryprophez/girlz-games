---
name: cloudflare-deploy
description: Stack et procédures de déploiement TLD83 — TanStack Start + Cloudflare Workers + bun + GitHub Actions. À utiliser pour tout setup de déploiement, CI/CD, bascule DNS, custom domains apex/www, secrets GitHub, token Cloudflare, config wrangler.jsonc, choix de DB, SEO d'ouverture, redirects 301 ou en-têtes HTTP (cache, sécurité, `_headers`).
---

# Déploiement TLD83 — Cloudflare Workers
> maj 2026-10-05

Source canonique des procédures deploy. Faits validés en prod — ne pas
improviser d'alternative sans justification explicite.

## Comptes (existants, à réutiliser — jamais de nouveau compte par projet)

| Service | Compte | Rôle |
|---|---|---|
| GitHub | `keryprophez` | Source de vérité du code, GHA pour CI/CD |
| Cloudflare | `tld83` | Tous les Workers/sites. Tout va dedans. Account ID `6a37af72767a90d91ba88a08adcc9f84` |
| Hostinger | (existant) | Registrar `.fr` (CF Registrar ne prend pas les `.fr`) + email pro (MX) |
| Supabase | (au cas par cas) | DB uniquement projets Sur-mesure (cf. tableau DB) |

## Stack par défaut (fixée, jamais re-débattue)

| Couche | Choix | Pourquoi |
|---|---|---|
| Framework | TanStack Start (React 19, SSR) | Cohérent avec CF Workers |
| Runtime | Cloudflare Workers (edge) | Compte Cloudflare unique (sous-domaine `workers.dev` : `tld83`), free tier 100k req/jour |
| CI/CD | GitHub Actions + `cloudflare/wrangler-action@v4` | Vendor-neutral, debug clair. **Jamais Workers Builds** (lock-in, debug pénible, WAF) |
| Package manager | bun ≥ 1.2, version exacte pinnée en CI et en local (`tld83-standards` §2) | Install rapide, runtime TS natif, `bun.lock` texte lisible (défaut depuis 1.2). `bun audit` + Dependabot OK |
| Tests | Vitest | Compatible bun, natif Vite |
| Lint / format | ESLint + Prettier | Lint en CI avant les tests (cicd-secrets.md §1) |
| Analytics | Cloudflare Web Analytics | Cookieless : pas de bandeau cookies (`tld83-standards` §9) |

## Tableau de décision DB

| Type de projet | DB par défaut | Pourquoi |
|---|---|---|
| **Vitrine Essentiel/Pro** (client n'édite rien, TLD83 modifie 2-4×/mois) | **Aucune DB.** Contenu dans `src/content/site.ts` versionné. Prerender statique. | Pas de DB si rien ne change à runtime |
| **Vitrine Autonome** (client édite contenus/photos) | **Cloudflare D1 + R2**, auth Cloudflare Access (magic link) | D1 : 5 Go/compte gratuits, jamais d'inactivation. R2 : 10 Go gratuits. 100 % CF, scale sur N clients |
| **Sur-mesure** (auth multi-users, realtime, RLS complexe, pgvector) | **Supabase** | Justifié quand Postgres/features Supabase nécessaires |

**Pièges Supabase (disqualifié comme défaut vitrine)** : pause après 7 j
d'inactivité en Free ; limite 2 projets Free/orga puis 25 $/mois/projet (10
clients = 200 $/mois) ; surdimensionné pour « le client édite ses chantiers ».

**Auth d'un outil privé (quelques personnes)** : Cloudflare Access exige
d'abord une organisation Zero Trust (onglet **Access** du Worker → « Set up
Zero Trust » : team name + plan), à créer une fois pour le compte. Si le
propriétaire n'en veut pas, alternative validée en prod : **code d'accès
partagé vérifié par le Worker** (cookie signé HttpOnly, 10 essais/min via un
binding `ratelimits`, fermé tant que les secrets manquent, manifest + icônes
publics pour une PWA). Modèles : `awa-communication/src/lib/access.ts`
(TanStack Start) et `food-coach/src/lib/access.ts` (Worker simple).

## Ordre chronologique — nouveau projet

> Le squelette de code (vite.config, wrangler.jsonc, workflows, `src/`) est
> **dans le template** : voir README « Ce que contient le squelette ». Les
> étapes ci-dessous personnalisent ce qui existe déjà.

1. Setup repo + `wrangler.jsonc` : `"workers_dev": true` (la preview
   `<projet>.tld83.workers.dev` est l'URL de travail pendant tout le dev, SEO
   fermé) + `routes` apex ET www déclarés dès le départ →
   [references/dns-domaines.md](references/dns-domaines.md)
2. Secrets GitHub posés → [references/cicd-secrets.md](references/cicd-secrets.md)
3. Premier deploy : la preview `*.workers.dev` sert à voir le site ; les Custom
   Domains, eux, **échouent tant que la zone DNS n'est pas chez CF — normal**
   (`Some triggers failed to deploy`)
4. Bascule DNS (NS Hostinger → CF, **MX copiés AVANT**) → dns-domaines.md
5. Re-deploy : CF crée Custom Domains + records + certifs
6. Vérifications (checklist dans dns-domaines.md), puis `"workers_dev": false`
   + re-deploy : la preview s'éteint (sinon duplicate content avec l'apex)
7. Réouverture SEO → [references/seo-ouverture.md](references/seo-ouverture.md)

> **Domaine déjà en ligne ailleurs** (refonte, reprise d'un site existant) :
> l'ordre ci-dessus ne s'applique pas tel quel — la zone importée contient des
> records web qui bloquent les Custom Domains, et il faut tout préparer AVANT le
> switch NS sous peine de coupure. Procédure dédiée :
> [references/dns-domaines.md](references/dns-domaines.md) §1 bis.

## Références (charger selon la tâche)

- [dns-domaines.md](references/dns-domaines.md) — bascule DNS, MX, custom domains
  apex+www, comportement déclaratif/destructif de `routes`, dédup www/apex ;
  §1 bis = migration d'un domaine déjà hébergé ailleurs (records en conflit,
  409 vs 403, CNAME mail proxifiés)
- [cicd-secrets.md](references/cicd-secrets.md) — deploy.yml, secrets GitHub,
  procédure exacte token Cloudflare (permissions précises)
- [wrangler-tanstack.md](references/wrangler-tanstack.md) — les 5 pièges
  TanStack Start + Workers (dont `validateSearch` idempotent), prerendering
  vitrines, en-têtes/cache/redirections (`_headers`, `_redirects`, apex ↔ www,
  CSP `frame-ancestors`, sitemap)
- [seo-ouverture.md](references/seo-ouverture.md) — SEO fermé par défaut,
  redirects 301 dans le Worker, checklist jour J
- [erreurs-courantes.md](references/erreurs-courantes.md) — table complète des
  erreurs connues et comment les éviter
