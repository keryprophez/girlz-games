# SEO d'ouverture — fermé par défaut, redirects 301, jour J
> maj 2026-09-14

## 1. SEO fermé par défaut (jusqu'à la prod publique)

**Règle systématique** : tant que le site n'est pas en prod sur son domaine
final, contenu finalisé et 301 prêtes, on bloque l'indexation :

1. `public/robots.txt` :
   ```
   User-agent: *
   Disallow: /
   ```
2. Meta robots global dans `src/routes/__root.tsx`, piloté par
   `SITE.seo.indexable` (`src/lib/site-config.ts`, `false` par défaut) :
   ```tsx
   { name: "robots", content: ROBOTS_VALUE } // "noindex, nofollow" tant que indexable = false
   ```
3. Pas de `Sitemap:` déclaré tant que le site est fermé.

**Pourquoi les deux** : `Disallow:/` empêche le crawl ; `noindex,nofollow`
empêche l'indexation pour les bots ayant déjà crawlé une preview ou un
`*.workers.dev`.

> **Anti-pattern** : laisser la preview indexable « au cas où ». Google peut
> indexer le `*.workers.dev` à la place du domaine final → duplicate content +
> pénalité à l'ouverture. Fermer, puis ouvrir proprement.

## 2. Redirects 301 — ils vivent dans le Worker, pas chez l'ancien hébergeur

Refonte d'un site existant (WordPress/Wix → CF) : les anciennes URLs ne doivent
pas tomber en 404 le jour J (perte SEO + bookmarks cassés).

**Pourquoi dans le Worker** : le jour J, le DNS pointe vers Cloudflare —
l'ancien hébergeur ne reçoit plus le trafic, ses règles de redirection
deviennent invisibles. C'est le nouveau Worker qui reçoit toutes les requêtes,
y compris pour les anciennes URLs.

Fourni par le template, à remplir **AVANT** la bascule DNS :

- `src/lib/redirects.ts` — table `REDIRECTS` `{ "/ancien-path": "/nouveau-path" }`
  (vide au départ) + `resolveRedirect(pathname)` (normalise le trailing slash,
  match case-sensitive, jamais la home)
- `src/index.ts` — middleware en tête de `fetch()` : si match →
  `Response.redirect(target, 301)` avec query string préservée
- `src/lib/redirects.test.ts` — vérifie chaque entrée de la table

**Sources pour bâtir la table** : `sitemap.xml` de l'ancien site + URLs
indexées dans Google Search Console (celles qui ont du jus SEO et des liens
entrants). À garder en place **même après lancement** : Google met des mois à
mettre à jour son index.

## 3. Réouverture SEO (jour J de la bascule)

1. `seo.indexable: true` dans `src/lib/site-config.ts` (retire le `noindex,
   nofollow` global)
2. `public/robots.txt` : remplacer le bloc fermé par le bloc d'ouverture déjà
   écrit en commentaire (`Allow: /`, `Disallow:` `/api/` + pages légales,
   `Sitemap: https://<domaine>/sitemap.xml` ; le sitemap est servi par
   `src/routes/sitemap[.]xml.ts`)
3. Soumettre le sitemap à Google Search Console et Bing Webmaster Tools
4. Vérifier que le Worker répond 301 sur les anciennes URLs (table du §2) vers
   les nouvelles — l'ancien hébergeur ne reçoit plus rien
5. Vérifier le canonical : `view-source:` doit montrer l'apex (cf. dns-domaines.md)
