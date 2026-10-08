# DNS, domaines & custom domains — procédures exactes
> maj 2026-10-05

> **Repères UI, page d'un Worker** (vérifié le 2026-10-05) : onglets Overview ·
> Metrics · Deployments · Observability · Issues · **Domains** · **Access** ·
> Settings. L'URL `workers.dev`, les Preview URLs (interrupteurs), les Custom
> Domains et les Routes sont dans l'onglet **Domains** (plus dans Settings →
> Domains & Routes). Settings garde Variables and secrets, Bindings,
> Observability, Runtime, Builds, Trigger events, General.

> Vérifié en prod (bascule LBàJ). UI Cloudflare constatée en mai 2026 — si l'UI
> a changé, vérifier avant d'affirmer.

## 1. Split Registrar / DNS / Email / Web (avec Hostinger)

**Contrainte fixe** : Hostinger reste sur 100 % des projets — registrar `.fr`
(Cloudflare Registrar ne prend pas les `.fr`) + hébergement email pro (MX).
Le reste passe sur Cloudflare.

```
Registrar   = Hostinger    domaine.fr (renouvellement annuel)
DNS (zone)  = Cloudflare   gestion des records (A/AAAA/CNAME/MX/TXT)
Email/MX    = Hostinger    MX pointent vers les mail servers Hostinger
Web app     = Cloudflare   Worker (TanStack Start)
```

### Procédure de bascule DNS (1× par projet, jour de la mise en prod)

1. Dashboard Cloudflare (`tld83`) → **Add a Site** → `monclient.fr` → plan Free
2. CF scanne et préremplit les records. **Vérifier que les MX sont là** (vers
   les mail servers Hostinger). Sinon les ajouter manuellement AVANT de continuer.
3. CF donne 2 nameservers (ex. `lior.ns.cloudflare.com`, `pia.ns.cloudflare.com`)
4. Hostinger registrar → DNS / Nameservers → remplacer par les NS Cloudflare
5. Propagation 48 h max (souvent < 1 h). Vérifier : `dig NS monclient.fr` ou `whois`
6. Une fois propagé : les Custom Domains se créent au deploy via `wrangler.jsonc`
   (voir §3 ci-dessous — ne PAS passer par l'UI)

> ⚠️ **Anti-bug n°1** : changer les NS sans avoir copié les MX → emails pro down
> jusqu'à correction. Toujours **copier d'abord, switcher après**.

> Cas « zone DNS reste chez Hostinger » (CNAME vers `*.workers.dev`) : ça marche
> mais inférieur — pas de Custom Domain natif, pas de CDN CF complet, apex
> impossible à CNAME. À éviter sauf raison forte.

## 1 bis. Brancher un domaine DÉJÀ hébergé ailleurs (Hostinger) — procédure validée

> Validé en prod sur `tld83.fr` (bascule Hostinger → CF Workers, août 2026).
> Cas différent d'un domaine neuf : la zone importée contient déjà des
> enregistrements web qui **entrent en conflit** avec les Custom Domains.

### Ordre des opérations

**Principe** : tant que les NS pointent encore vers l'ancien hébergeur, la zone CF
est **inerte** — on peut y faire ce qu'on veut sans impacter le site en ligne.
On prépare donc TOUT dans la zone avant de basculer les NS.

1. **Add a Site** → domaine → plan Free. CF importe les records existants.
2. **Vérifier les MX** (mails pro). S'ils manquent → les ajouter à la main MAINTENANT.
3. **Dé-proxifier les enregistrements mail** (cf. Anti-bug n°2).
4. **Supprimer les records web en conflit** : `A` apex, `AAAA` apex, `CNAME www`.
   ⚠️ NE PAS toucher aux MX / TXT / CNAME mail.
   → Sans effet sur la prod : les NS pointent encore vers l'ancien hébergeur.
5. **Déployer** (Custom Domains déclarés dans `wrangler.jsonc`).
   - ✅ **Succès** → les records « Worker » sont posés. Passer à 6. **Bascule sans coupure.**
   - ❌ **Échec « zone not active »** → CF exige une zone Active. Se rabattre sur
     la variante *fallback* ci-dessous. **Ne PAS laisser la zone sans records web
     pendant la propagation** : recréer `A apex → <IP ancien hébergeur>` en attendant.
6. **Changer les NS** chez le registrar → attendre le statut **Active**.
   Le trafic bascule sur le Worker au fil de la propagation, sans interruption.
7. **Vérifier le site en ligne** (onglet privé) : apex, www, et une page profonde.
8. **Seulement ensuite** : décommissionner l'hébergement web source.
   Garder registrar + MX. Envoyer un mail test.

> ℹ️ **À confirmer à la prochaine migration** : Cloudflare accepte-t-il de créer un
> Custom Domain sur une zone encore `Pending Nameserver Update` ? Non testé sur
> `tld83.fr` (procédure découverte après coup). Indice : le `409 Conflict` observé
> avant l'activation suggère que l'API teste le conflit de records avant le statut
> de zone — donc que le chemin sans coupure fonctionne. **Tester tôt, c'est gratuit :
> en cas de refus, on se rabat sans rien avoir cassé.**

#### Variante *fallback* (si CF refuse les Custom Domains sur zone Pending)

Ordre dégradé, avec une coupure courte mais **maîtrisée** :

- 4'. Changer les NS → attendre **Active** (les records importés servent l'ancien
  site, aucune coupure pendant la propagation).
- 5'. Supprimer `A` / `AAAA` / `CNAME www`.
- 6'. Déployer **immédiatement** → coupure ~1-2 min entre 5' et 6'.

> ⚠️ Ce qu'il ne faut JAMAIS faire : supprimer les records web **avant** le switch
> NS sans avoir réussi le deploy. La zone devient alors vide au moment où elle prend
> autorité → site down pendant toute la propagation (imprévisible, jusqu'à 48 h).

**Rollback** (valable à tout moment avant l'étape 8) : recréer
`A apex → <IP ancien hébergeur>` en Proxied. Les MX n'ayant jamais bougé, les
mails ne sont pas impactés.

### ⚠️ Anti-bug n°2 — les CNAME mail importés arrivent en « Proxied »

CF proxifie par défaut TOUS les A/AAAA/CNAME importés. Or le proxy ne gère que
HTTP(S) : un enregistrement mail proxifié renvoie les IP Cloudflare au lieu de
celles du mailhost. **Repasser en « DNS only » (nuage gris) :**

- `autoconfig`, `autodiscover` → sinon la config auto des clients mail casse
- `hostingermail-a/b/c` (ou l'équivalent DKIM du mailhost) → sinon les signatures
  DKIM ne valident plus → mails sortants classés en spam

MX et TXT (SPF, DMARC) ne sont pas proxifiables : CF les laisse en DNS only tout
seul. Seuls apex et `www` restent Proxied (trafic web).
Vérif : `dig CNAME autodiscover.<domaine>` doit renvoyer le mailhost, pas une IP CF.

### ⚠️ Anti-bug n°3 — Custom Domain refusé si un record existe déjà (409)

Symptôme : le Worker s'upload, seuls les *triggers* échouent, avec un message muet :

```
✘ ERROR Some triggers failed to deploy for <worker>:
  - A request to the Cloudflare API
    (/accounts/<id>/workers/scripts/<name>/domains/records) failed.
```

**Ce message ne dit pas la cause.** Pour obtenir le vrai code, ajouter en `env`
du step `wrangler-action` :

```yaml
env:
  WRANGLER_LOG: debug
```

Le log montre alors la requête et son code :

```
PUT .../workers/scripts/<name>/domains/records
-- START CF API RESPONSE: Conflict 409
```

**Lecture du code — ne pas confondre les deux causes :**

| Code | Cause | Correctif |
|---|---|---|
| `409 Conflict` | un A/AAAA/CNAME existe déjà sur ce hostname | supprimer les records en conflit (étape 4) |
| `403 Forbidden` | token sans permissions **Zone** | ajouter `Zone → Workers Routes → Edit` + `Zone → Zone → Read`, Zone Resources = All zones from an account |

> **Erreur commise sur ce projet** : token accusé à tort sur la foi du message
> générique, alors qu'il était parfaitement configuré. Toujours obtenir le code
> HTTP avant de conclure — le diagnostic coûte 1 déploiement et zéro risque.

> ❌ **Ne PAS utiliser `WRANGLER_LOG_SANITIZE=false`** pour creuser : ça déverse
> les headers d'authentification dans les logs CI.

### ⚠️ Anti-bug n°4 — `workers_dev` absent = preview désactivée silencieusement

Pendant une bascule, on veut garder l'URL `*.workers.dev` comme filet. Un
commentaire ne suffit pas : si la clé est **absente** de `wrangler.jsonc`,
wrangler la désactive par défaut.

```
▲ WARNING Because 'workers_dev' is not in your Wrangler file, it will be
  disabled for this deployment by default.
No targets deployed for <worker>
```

→ Poser `"workers_dev": true` **explicitement** pendant toute la bascule, et ne
passer à `false` qu'une fois les Custom Domains vérifiés en ligne (duplicate content).

### Checklist de sortie

- [ ] apex + www servent le nouveau site (onglet privé)
- [ ] `*.workers.dev` désactivé (`workers_dev: false`) une fois les domaines vérifiés
- [ ] `WRANGLER_LOG: debug` retiré du workflow
- [ ] mail test envoyé ET reçu sur la boîte du domaine
- [ ] hébergement web source décommissionné, registrar + MX conservés

## 2. Dédup `www` vs apex (SEO)

Une fois apex + www actifs, les deux servent le même contenu → risque duplicate
content. Trois moyens, du plus simple au plus complet :

| Moyen | Effet | Reco |
|---|---|---|
| **Canonical HTML** (`<link rel="canonical">` posé par `buildPageSeo()`, `src/lib/seo.ts`, sur l'apex) | Google déduplique à l'indexation | ✅ **Toujours faire** — gratuit, fourni par le template |
| **Worker middleware 301** (`redirectTarget()`, `src/lib/redirects.ts`, lu par `src/index.ts` : la variante apex/www qui n'est pas celle de `SITE.url` → 301) | Barre d'URL cohérente + SEO renforcé | ✅ **Fourni par le template** (avec `assets.run_worker_first`, sinon les pages prerendues ne passent pas par le Worker) |
| **Page Rules CF** (UI) | Idem 301, hors-repo | ❌ Non versionné, en dépréciation |

Les deux sont en place par défaut : le canonical pour Google, la 301 pour la
barre d'URL et les liens entrants. L'hôte canonique est celui de `SITE.url`
(apex par défaut) : passer `SITE.url` en `https://www.X` suffit à inverser le
sens. Détail et vérification locale : wrangler-tanstack.md, « En-têtes, cache et
redirections ».

## 3. Custom Domains apex + www + workers.dev OFF — LE process

**Objectif final** : `apex.fr` et `www.apex.fr` servis par le Worker,
`<projet>.tld83.workers.dev` désactivé, tout déclaré en code.

### La config qui marche — dans `wrangler.jsonc` AVANT le premier deploy

État **à la mise en ligne**. Pendant le dev, `workers_dev` est à `true` : la
preview `<projet>.tld83.workers.dev` est l'URL de travail (SEO fermé).

```jsonc
{
  "name": "<projet>",
  "compatibility_date": "...",
  "main": "src/index.ts",
  // workers.dev subdomain: "true" during development (the preview URL
  // <projet>.tld83.workers.dev is how the site is reviewed, SEO closed),
  // "false" once the Custom Domains are verified live. Always set it
  // explicitly: when the key is absent, wrangler disables it (anti-bug #4);
  // when only the UI toggle is used, EVERY deploy re-enables it (official CF
  // docs). Left "true" at launch: the preview serves the same content as the
  // apex -> duplicate content + SEO penalty risk.
  "workers_dev": false,
  // Custom Domains apex + www declared here. CF auto-creates "Worker" DNS
  // records + provisions TLS certs on next deploy. WARNING: the routes block
  // is DECLARATIVE and DESTRUCTIVE -- any Custom Domain not listed will be
  // removed on next deploy. Always list both.
  "routes": [
    { "pattern": "apex.fr", "custom_domain": true },
    { "pattern": "www.apex.fr", "custom_domain": true }
  ]
}
```

### Pourquoi cette voie et pas une autre

| Alternative | Pourquoi NON |
|---|---|
| Custom Domain via l'UI (Worker → Domains → Add) | Depuis mai 2026, plus de champ texte libre — uniquement une liste de zones. Apex OK mais `www` impossible. Bloqué. |
| CNAME `www → apex` Proxied seul | Résout vers les IPs CF mais aucun Worker bindé sur ce hostname → erreur 522/525 |
| Workers Route `www.apex.fr/*` (ancien système) | Marche, mais Custom Domain est le standard depuis 2022 (cert auto). À éviter sauf raison forte |
| Single Redirect www→apex en remplacement | Sans record DNS sous-jacent sur `www`, le redirect ne se déclenche jamais. Complément, pas substitut |
| Single Redirect en plus (UX) | OK mais pas nécessaire : le canonical suffit à Google. 0 impact SEO additionnel |

### ⚠️ Comportement déclaratif de `routes` (point critique)

- Si un Custom Domain `apex.fr` existe via UI et qu'on deploy avec
  `routes: [www seulement]` → **CF retire le binding apex** (routes = source de
  vérité unique). **Toujours lister TOUS les Custom Domains.**
- Asymétrie : ajouter une route `custom_domain: true` → CF crée le binding au
  deploy. La **retirer** du fichier → CF **garde** le binding (silencieusement).
  Pour vraiment supprimer : UI (`Custom Domain` → `...` → Remove) ou API.

### Vérifs après le premier deploy avec cette config

1. Dashboard CF → Worker → onglet Domains : Worker URL toggle = **OFF** ;
   2 Custom Domains listés (apex + www), en Production
2. Zone DNS : 2 records type « Worker » (apex + www), proxied ☁️
3. Navigateur (onglet privé) : `https://apex.fr` → site ; `https://www.apex.fr`
   → site ; `https://<projet>.tld83.workers.dev` → erreur « no Workers.dev subdomain »
4. SEO : `view-source:https://apex.fr/` contient
   `<link rel="canonical" href="https://apex.fr/">` (l'apex, pas www)
