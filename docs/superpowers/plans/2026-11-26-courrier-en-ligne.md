# Le Courrier en ligne — plan de construction

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Les lettres du Courrier sont gardées sur Cloudflare (D1 pour le texte, R2 pour les dessins et les voix) : la boîte, les Souvenirs et les brouillons suivent les filles d'un appareil à l'autre, et le père lit tout dans le tableau de bord.

**Architecture:** Un format d'échange pur, sans import (`src/core/courrierfil.ts`), lu par le Worker ET par l'app. Le Worker gagne des routes `/api/courrier/*` derrière le code d'accès (`worker/courrier.ts`). L'app gagne une troisième réalisation du `Coffre`, `coffreEnLigne` (`src/core/courrierenligne.ts`), posée sur le coffre IndexedDB qui garde les brouillons ; le jeu ne change qu'aux endroits où il lit la liste ou montre une lettre.

**Tech Stack:** TypeScript strict, Cloudflare Workers + D1 + R2, wrangler 4.151 (`getPlatformProxy` pour des D1 et R2 locaux dans les tests), vitest (node), Playwright. Aucune dépendance nouvelle.

**Spec:** `docs/superpowers/specs/2026-11-26-courrier-en-ligne-design.md` (cité « § n »). Le jeu lui-même : `docs/superpowers/specs/2026-11-25-courrier-design.md`.

## Global Constraints

- Lire `CLAUDE.md`, puis `PIEGES.md` par domaine (PWA, bots, scripts, voix) avant la tâche qui y touche.
- Français partout : textes, commentaires, commits d'une ligne. Aucun `Co-Authored-By`. `git add` des fichiers de la tâche seulement (jamais `.claude/launch.json`).
- À chaque commit, dans chaque fichier modifié qui porte `@version`, et en tête de tout fichier nouveau (`--` pour le SQL) : `date "+%Y-%m-%d %H:%M"`.
- Règle 3, troisième exception (§ 2) : les lettres du Courrier — texte, dessins, voix, sans autre donnée — sur le compte Cloudflare `tld83`, seulement à travers le Worker, derrière le code d'accès. Rien ne part ailleurs.
- Ressources : base D1 `girlz-games-courrier`, compartiment R2 `girlz-games-courrier`, liaisons `DB` et `COURRIER`. Clé neuve côté app : `ferme:courrier:migre`. Ne jamais toucher la base IndexedDB `ferme-courrier` ni les clés existantes.
- Limites : 40 objets et 5 voix par lettre ; `peinture.png` ≤ 8 Mo (voir Décisions) ; `voix-<x>.webm` ≤ 2 Mo ; corps d'une lettre ≤ 128 Ko.
- Pas de relecture régulière [décidé] : la liste est relue en entrant chez l'une ou l'autre et en touchant sa boîte, rien d'autre.
- Chaque appel réseau a un délai : 10 s pour le JSON, 30 s pour un fichier ; il tient même si `fetch` ignore le signal.
- Une écriture réussie = une réponse 2xx du Worker ; sinon rien n'est annoncé (le jeu garde son comportement actuel).
- Les bots jouent avec le coffre local (`__BOT`) ; `__COFFRE_EN_LIGNE` (vérifications seulement) force le coffre en ligne sous `__BOT`.
- `ctx.alive()` (ou `jeu === j`) après chaque `await` du jeu.
- Chaque tâche finit par `npm run build && npm run lint && npm test` au vert, puis un commit. Toute commande longue sous `timeout`, une ligne par élément (règle 6). Scripts `.verify-*.mjs` supprimés avant commit.
- **Porte** (§ 7) : rien n'est envoyé sur `main` avant que le père ait créé la base et le compartiment et élargi le jeton.

## Décisions prises en écrivant ce plan

À relire par le père ; chacune reste dans l'esprit de la conception.

1. **8 Mo pour un dessin** au lieu de 4 : le pire possible d'un PNG de 1500 × 1000 (du bruit pur, 4 octets par point) fait 6 Mo ; à 4 Mo, une feuille très pailletée pourrait ne jamais partir.
2. **Une voix s'appelle `voix-<x>.webm`, `x` tiré au hasard** (8 caractères) et non un numéro : une voix effacée puis réenregistrée n'écrase jamais un fichier qu'une autre version de la lettre désigne encore.
3. **Une lettre postée ne change plus de fichiers** : le Worker refuse d'écrire un fichier pour une lettre qui n'est plus un brouillon (ou qui est jetée), et refuse une lettre qui désigne un fichier absent de R2 (§ 5, « une lettre ne désigne jamais un fichier absent », vérifié au lieu d'être supposé).
4. **`completer` ne rend `null` que pour un brouillon** dont un fichier n'est pas venu : « Écrire » refuse (le son d'erreur) au lieu d'ouvrir une feuille sans son dessin, que la sauvegarde suivante effacerait. Une lettre reçue s'ouvre toujours, sans le morceau manquant, et garde sa clé.
5. **Un 401** (cookie expiré sur une tablette installée, PIEGES « PWA derrière un code d'accès ») compte comme « sans réseau » : le nuage.
6. **Sans réseau, les Souvenirs vides montrent le nuage** au lieu du coffre vide.
7. **Le nuage barré** est un petit panneau 3D au-dessus de chaque boîte (il suit la caméra), à la place du drapeau.
8. **Les migrations D1 tournent dans une étape à elles** de `deploy.yml`, juste avant « Déployer le Worker » : une migration qui échoue arrête le job, le déploiement n'a pas lieu (§ 5).
9. **Les tests du coffre en ligne parlent à un faux serveur en mémoire**, pas au vrai Worker : l'app (DOM) et le Worker (sans DOM) ne peuvent pas se type-vérifier ensemble. Le contrat commun est `courrierfil.ts` (le faux serveur valide avec `lireLettre`), et le vrai chemin est essayé à deux navigateurs sous `wrangler dev` (tâche 5).

## Review Focus

1. **Un morceau qui ne vient pas** (réseau coupé pendant un téléchargement) dans une lettre reçue : elle s'ouvre sans lui ; la garder ou la reposer n'envoie aucun fichier et garde la clé. → tâche 3
2. **Le cookie expiré** (401 sur toute l'API) : le nuage, aucune exception, aucune écriture annoncée. → tâches 2 et 3
3. **Un brouillon continué sans réseau pendant que l'autre appareil l'a cacheté** : c'est la lettre cachetée qui reste ; la copie locale est oubliée ; son envoi est refusé. → tâches 2 et 3
4. **Un réseau qui ne répond jamais** : chaque appel abandonne à son délai ; la boîte ne reste pas « occupée ». → tâche 3
5. **La même lettre écrite deux fois de suite** (la sortie de la feuille, puis la cire) : chaque fichier ne part qu'une fois et la deuxième écriture n'est pas refusée pour sa version. → tâche 3

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/core/courrierfil.ts` | le format d'échange (types, limites, validation, clés R2, texte pour le père) — aucun import |
| `worker/migrations/0001_courrier.sql` | les tables `lettres` et `reglages` (§ 4) |
| `worker/courrier.ts` | les routes `/api/courrier/*` |
| `worker/index.ts` | `Env` gagne `DB?` et `COURRIER?` ; la route |
| `worker/banc.jsonc` · `worker/sql.d.ts` | la configuration des tests (D1 et R2 locaux) ; `import sql from '….sql?raw'` |
| `src/core/courrier.ts` · `src/core/courrierdb.ts` | `Lettre` gagne ses champs « en ligne » ; `Coffre` gagne `completer`, `horsLigne`, l'option `ici` |
| `src/core/courrierenligne.ts` | `coffreEnLigne` |
| `src/core/boites3d.ts` | `nuage(w, on)` |
| `src/games/courrier.ts` · `src/games/courrier-feuille.ts` | relire, compléter, le nuage ; le brouillon poussé à la sortie |
| `wrangler.jsonc` · `.github/workflows/deploy.yml` | les liaisons ; les migrations avant le déploiement |

---

### Task 1: Le fil — le format d'échange

**Files:** Create `src/core/courrierfil.ts` · Test `src/core/courrierfil.test.ts`

**Interfaces:**
- Produces (aucun import dans ce fichier : `tsc -p worker` le lit sans DOM) :
  - `type QuiFil = 'jade' | 'joyce'` · `type EtatFil = 'brouillon' | 'cachetee' | 'postee' | 'ouverte' | 'gardee'` · `ETATS: readonly EtatFil[]` dans cet ordre · `rang(e: EtatFil): number`
  - `type ObjetFil` = pose `{x, y, s, r}` + `{k:'texte'; t; couleur; police; taille}` | `{k:'gomme'; src}` | `{k:'voix'; cle; pics; duree}`
  - `interface EnveloppeFil { couleur: string; cachet: string; timbre: string }`
  - `interface LettreFil { id; de: QuiFil; a: QuiFil; etat: EtatFil; cree; postee; tour; papier; env: EnveloppeFil | null; objets: ObjetFil[]; peinture: string | null; version: number }`
  - `interface PrefsFil { envois: number; env: EnveloppeFil | null; faits: string[] }`
  - `MAX_OBJETS = 40`, `MAX_VOIX = 5`, `MAX_PEINTURE = 8 * 1024 * 1024`, `MAX_VOIX_OCTETS = 2 * 1024 * 1024`, `MAX_LETTRE_OCTETS = 128 * 1024`
  - `ID = /^[a-z0-9-]{1,64}$/` · `cleDe(id: string, nom: string): string` → `lettres/<id>/<nom>` · `nomFichier(nom: string): 'peinture' | 'voix' | null` (`peinture.png`, ou `/^voix-[a-z0-9]{1,16}\.webm$/`)
  - `lireLettre(x: unknown, id: string): LettreFil | null` · `lirePrefs(x: unknown): PrefsFil | null` · `fichiersDe(l: LettreFil): string[]` · `texteDe(l: LettreFil): string`

**Règles de `lireLettre`** (rend une copie propre, champs inconnus ôtés ; `null` au moindre écart) : `id` égal au paramètre et conforme à `ID` ; `de`, `a` dans `QuiFil` et différentes ; `etat` dans `ETATS` ; `cree`, `postee`, `tour` finis ≥ 0 ; `version` entier ≥ 1 ; `papier` chaîne ≤ 20 ; `env` `null` ou trois chaînes ≤ 120 ; `objets` tableau ≤ `MAX_OBJETS`, au plus `MAX_VOIX` voix ; pose : nombres finis ; texte : `t` ≤ 2000 caractères, `couleur` ≤ 20, `police` ≤ 40, `taille` fini ; gomme : `src` ≤ 200 ; voix : `cle === cleDe(id, nom)` avec `nomFichier(nom) === 'voix'`, `pics` ≤ 100 nombres finis, `duree` entre 0 et 30 ; `peinture` `null` ou `cleDe(id, 'peinture.png')`. `lirePrefs` : `envois` entier ≥ 0, `env` comme plus haut, `faits` ≤ 30 chaînes de ≤ 30 caractères.

- [ ] **Step 1: Écrire les tests**

```ts
const L = (plus = {}) => ({ id: 'abc-1', de: 'jade', a: 'joyce', etat: 'postee', cree: 1, postee: 2, tour: 2, papier: '#FFFDF8',
  env: { couleur: '#F58FB8', cachet: 'coeur', timbre: 'animal:duck' }, objets: [], peinture: null, version: 3, ...plus })
it('une lettre bien formée passe, les champs inconnus tombent', () => {
  expect(lireLettre({ ...L(), espion: 1 }, 'abc-1')).toEqual(L()) })
it('refuse un id autre que celui du chemin, ou hors du motif', () => {
  expect(lireLettre(L(), 'abc-2')).toBeNull(); expect(lireLettre(L({ id: '../x' }), '../x')).toBeNull() })
it('refuse de = a, un état inconnu, une version 0', () => { … trois toBeNull })
it('refuse 41 objets et 6 voix', () => { … })
it('une voix doit désigner un fichier de SA lettre', () => {
  const v = { k: 'voix', x: 1, y: 1, s: 1, r: 0, pics: [0.5], duree: 2 }
  expect(lireLettre(L({ objets: [{ ...v, cle: 'lettres/abc-1/voix-k3f9a2.webm' }] }), 'abc-1')).not.toBeNull()
  expect(lireLettre(L({ objets: [{ ...v, cle: 'lettres/zzz/voix-k3f9a2.webm' }] }), 'abc-1')).toBeNull()
  expect(lireLettre(L({ objets: [{ ...v, cle: 'lettres/abc-1/voix-1.mp3' }] }), 'abc-1')).toBeNull() })
it('peinture : null ou la clé de la lettre', () => { … 'lettres/abc-1/peinture.png' passe, 'lettres/abc-1/x.png' non })
it('nomFichier', () => { expect(['peinture.png', 'voix-a1.webm', 'voix-.webm', '../peinture.png'].map(nomFichier))
  .toEqual(['peinture', 'voix', null, null]) })
it('fichiersDe : le dessin et chaque voix', () => { … })
it('texteDe : les textes de haut en bas, émojis gardés', () => {
  expect(texteDe(L({ objets: [{ k: 'texte', t: 'bisous 💖', y: 800, … }, { k: 'texte', t: 'Coucou', y: 100, … }] })))
    .toBe('Coucou\nbisous 💖') })
it('lirePrefs : bonnes et mauvaises', () => { … })
```
Plus, dans le même fichier : `MAX_OBJETS` et `MAX_VOIX` égaux à ceux de `core/courrier.ts` (importés à côté).

- [ ] **Step 2:** `npx vitest run src/core/courrierfil.test.ts` → FAIL (module absent)
- [ ] **Step 3:** Écrire `src/core/courrierfil.ts`.
- [ ] **Step 4:** `npx vitest run src/core/courrierfil.test.ts` → PASS ; puis `npm run build && npm run lint && npm test` → vert.
- [ ] **Step 5:** Commit : `Le Courrier en ligne : le format d'échange`

---

### Task 2: Le Worker — D1, R2 et les routes

**Files:** Create `worker/migrations/0001_courrier.sql`, `worker/courrier.ts`, `worker/banc.jsonc`, `worker/sql.d.ts` · Modify `worker/index.ts`, `PIEGES.md` · Test `worker/courrier.test.ts`

**Interfaces:**
- Consumes : tout `courrierfil.ts` (tâche 1).
- Produces :
  - `export type CourrierEnv = { DB?: D1Database; COURRIER?: R2Bucket }` ; `Env = AccessEnv & DevineEnv & CourrierEnv & { ASSETS: Fetcher }` (facultatifs : les tests existants n'ont pas à les fournir, et un Worker sans liaison répond 503).
  - `export async function courrier(request: Request, url: URL, env: CourrierEnv): Promise<Response>`, appelée dans `route()` après le contrôle du code, avant le 404 des `/api/` inconnues.
  - Le contrat HTTP :

| Route | Réponses |
|---|---|
| `GET /api/courrier/lettres` | 200 `{ lettres: LettreFil[] }` (non jetées, par `cree`) ; une ligne illisible est sautée |
| `PUT /api/courrier/lettres/:id` | 200 `{ version }` · 400 (JSON ou `lireLettre` refusé) · 411 · 413 · 409 `{ refus: 'version' \| 'etat' \| 'jetee' \| 'qui' }` · 422 `{ refus: 'fichier' }` (une clé absente de R2) |
| `POST /api/courrier/lettres/:id/jeter` | 200 (une deuxième fois aussi) · 404 inconnue |
| `PUT /api/courrier/fichiers/lettres/:id/:nom` | 200 · 400 nom ou id · 411 · 413 · 415 (`image/png` pour le dessin, `audio/*` pour une voix) · 409 (lettre plus brouillon, ou jetée) |
| `GET /api/courrier/fichiers/lettres/:id/:nom` | 200 + le type gardé · 404 |
| `GET` / `PUT /api/courrier/reglages/:qui` | 200 `{ prefs: PrefsFil \| null }` · 200 · 400 · 404 pour un autre `:qui` |

  Partout : 403 si `Origin` est d'un autre site sur PUT/POST ; 405 + `allow` pour une autre méthode ; 404 pour un autre chemin ; 503 sans `DB` ou `COURRIER`. Taille : `Content-Length` d'abord, puis la taille réellement lue.
- La table `lettres` et la table `reglages` exactement comme § 4. Le Worker remplit `texte` avec `texteDe`, `maj` avec `Date.now()`. L'écriture d'une lettre : refus explicites d'abord (ligne existante : jetée, `de`/`a` changés, `version` pas plus grande, `rang` qui recule), `head` R2 de chaque clé de `fichiersDe`, puis `INSERT … ON CONFLICT(id) DO UPDATE … WHERE lettres.version < excluded.version AND lettres.jetee = 0` ; 0 ligne changée → 409 `version`.
- `worker/banc.jsonc` : `name`, `compatibility_date` de `wrangler.jsonc`, `main: "index.ts"`, les deux liaisons (id D1 `00000000-0000-0000-0000-000000000000`, `migrations_dir: "migrations"`). Jamais déployé : il ne sert qu'à `getPlatformProxy({ configPath: 'worker/banc.jsonc', persist: false })`.
- `worker/sql.d.ts` : `declare module '*.sql?raw' { const sql: string; export default sql }`. Le banc applique la migration : découpée sur `;`, chaque morceau non vide passé à `prepare().run()` (donc pas de `;` dans les commentaires du SQL).

- [ ] **Step 1: Écrire `worker/courrier.test.ts`** — un `banc()` en `beforeAll` (délai 30 s), `dispose` en `afterAll`, un cookie signé comme dans `worker.test.ts`, des `id` différents par test. Les cas :

```ts
it('sans code : 401', …)                       // GET /api/courrier/lettres sans cookie
it('une autre origine ne peut pas écrire : 403', …)
it('sans liaisons : 503', …)                   // env sans DB ni COURRIER
it('aller-retour : fichiers, lettre, liste, fichier relu', async () => {
  // PUT peinture.png (image/png, 3 octets) puis voix-a1.webm (audio/webm) puis la lettre v1
  // GET liste : la lettre, ses clés ; GET fichier : les mêmes octets, le même type
  // SELECT texte FROM lettres : les textes de haut en bas
})
it('une lettre qui désigne un fichier absent : 422', …)
it('une version qui n’avance pas : 409 version', …)          // v2 puis v2
it('un état qui recule : 409 etat', …)                       // postee v2 puis brouillon v3
it('de ou a changés : 409 qui', …)
it('jetée : absente de la liste, ni lettre ni fichier ne s’écrivent plus (409)', …)
it('plus de fichier une fois cachetée : 409', …)
it('trop gros : 413 (Content-Length annoncé)', …)            // peinture MAX_PEINTURE + 1
it('mauvais type : 415 ; mauvais nom : 400', …)              // voix en image/png ; voix-1.mp3 ; ../x
it('les réglages : null, écrits, relus ; 400 ; 404 pour un autre prénom', …)
it('une autre méthode : 405', …)
```

- [ ] **Step 2:** `timeout 120 npx vitest run worker/courrier.test.ts` → FAIL (module `./courrier` absent). Attendu : le banc démarre en ~2 s (mesuré à l'essai).
- [ ] **Step 3:** Écrire la migration, `worker/courrier.ts`, `banc.jsonc`, `sql.d.ts` ; brancher `worker/index.ts`.
- [ ] **Step 4:** `timeout 120 npx vitest run worker/courrier.test.ts` → PASS ; `npm run build && npm run lint && npm test` → vert (les tests existants du Worker aussi).
- [ ] **Step 5:** `PIEGES.md`, ligne « scripts » : Miniflare 5 (bêta, sous wrangler 4.151) refuse l'ancienne forme d'options ; les tests passent par `getPlatformProxy` de wrangler, et le SQL arrive par `?raw` (`node:fs` n'est pas typé sous `tsc -p worker`).
- [ ] **Step 6:** Commit : `Le Courrier en ligne : le Worker garde les lettres (D1, R2)`

---

### Task 3: Le coffre en ligne

**Files:** Create `src/core/courrierenligne.ts` · Modify `src/core/courrier.ts`, `src/core/courrierdb.ts` · Test `src/core/courrierenligne.test.ts`, `src/core/courrierdb.test.ts`

**Interfaces:**
- Consumes : `courrierfil.ts` (tâche 1) ; le contrat HTTP (tâche 2).
- Produces :
  - `Lettre` gagne `version?: number`, `aCharger?: true`, `peintureCle?: string | null` ; `Vocal` gagne `cle?: string`. Le jeu les ignore ; seuls les coffres les posent.
  - `Coffre` devient :
    ```ts
    lettres(): Promise<Lettre[]>
    garderLettre(l: Lettre, o?: { ici?: boolean }): Promise<boolean>  // ici : un brouillon, sur cet appareil seulement
    jeterLettre(id: string): Promise<boolean>
    completer(l: Lettre): Promise<Lettre | null>                     // les fichiers d'une lettre arrivée sans eux
    horsLigne(): boolean                                              // la dernière lecture de la liste a échoué
    prefs(w: Who): Promise<Prefs>
    garderPrefs(w: Who, p: Prefs): Promise<boolean>
    ```
    `coffreMemoire` et `coffreIDB` : `completer` rend la lettre telle quelle, `horsLigne` rend `false`, `ici` est ignoré.
  - `export const MARQUE = 'ferme:courrier:migre'`
  - `export function coffreEnLigne(local: Coffre, o?: { fetch?: (chemin: string, init?: RequestInit) => Promise<Response>; marque?: Pick<Storage, 'getItem' | 'setItem'>; delai?: number }): Coffre` — `delai` 10 000 ms par défaut (×3 pour un fichier) ; `fetch` appelé avec des chemins `/api/courrier/…`.

**Le comportement** (§ 6 et les Décisions) :
- **Garder.** Version = (dernière connue de cette lettre, sinon `l.version`, sinon 0) + 1. Un brouillon `aCharger` → `false`, rien d'écrit. Un brouillon : écrit sur `local` ; avec `ici`, c'est tout ; sans, il part aussi en ligne ; rend vrai si l'une des deux écritures a réussi. Une autre lettre : en ligne seulement ; rend la réponse du Worker ; réussie, la copie locale de cette lettre est ôtée. En ligne = les fichiers d'abord (dessin en `Blob` inconnu → `peinture.png` ; voix sans `cle` dont l'audio est inconnu → `voix-<8 caractères au hasard>.webm`), puis la lettre. « Connu » : un `Blob` déjà envoyé ou reçu par ce coffre (mémoire `Blob → clé`). Une voix qui a une `cle` n'est jamais renvoyée. Un dessin `null` : `peintureCle` pour une lettre qui n'est plus un brouillon, `null` pour un brouillon (effacé).
- **Lire la liste.** La liste en ligne arrive sans fichiers : `peinture: null`, `peintureCle`, voix à `audio` vide avec leur `cle`, `aCharger: true` s'il y a au moins un fichier. Un brouillon local gagne contre un brouillon en ligne de version plus petite, et s'ajoute s'il n'est pas en ligne ; contre une lettre en ligne qui n'est plus un brouillon, il perd et sa copie locale est ôtée. Échec (réseau, délai, réponse non 2xx ou pas du JSON, 401 compris) : `horsLigne()` vrai, la liste rendue = les brouillons locaux.
- **Migrer**, à la première lecture réussie tant que `MARQUE` n'est pas posée : chaque lettre locale absente de la liste part (fichiers d'abord, `version` gardée ou 1 ; un 409 compte comme fait) ; pour chaque fille, des réglages locaux non vides partent si ceux en ligne sont `null`. Tout réussi → `MARQUE` vaut `'1'` et la liste est relue une fois. Sinon on recommencera à la prochaine lecture. La base locale n'est pas effacée.
- **Compléter.** Sans `aCharger` : la lettre elle-même. Sinon, chaque fichier (mémoire d'abord, puis `GET`) ; un fichier qui ne vient pas : le dessin reste `null` (clé gardée), la voix garde un audio vide (clé gardée) ; pour un brouillon, `null`. Le résultat n'a plus `aCharger` ; ses `Blob` deviennent « connus ».
- **Jeter** : `POST …/jeter`. **Réglages** : en ligne (`null` → réglages vides) ; en panne → ceux du local ; `garderPrefs` écrit en ligne (c'est sa réponse) et sur le local.

- [ ] **Step 1: Écrire `src/core/courrierenligne.test.ts`** avec un `fauxServeur()` en mémoire, dans le fichier de test : il suit le contrat de la tâche 2 (valide par `lireLettre`, version, rang, jetée, fichiers présents, fichiers refusés hors brouillon), note chaque appel (`'PUT lettres/abc'`, `'PUT fichiers/…'`), et peut tomber (`panne: 'reseau' | '401' | 'muet'`, où `muet` ne répond jamais et ignore le signal). Le local : `coffreMemoire()`. La marque : un objet `{ getItem, setItem }` en mémoire. Les cas :

```ts
it('un brouillon « ici » ne sort pas de l’appareil ; sa version monte', …)  // 0 appel ; local v1 puis v2
it('un brouillon poussé : les fichiers avant la lettre', …)                // ordre des appels ; clés dans le serveur
it('deux écritures de suite : chaque fichier une fois, la 2e acceptée', …)  // brouillon poussé puis cacheter → 1 seul PUT par fichier, 2e PUT lettre en 200 (Review 5)
it('une lettre en ligne réussie ôte la copie locale', …)
it('la liste : sans fichiers, clés gardées, à charger', …)
it('brouillon local plus récent : il gagne ; brouillon local contre une cachetée : il perd et disparaît', …) // (Review 3)
it('sans réseau, 401 : le nuage, les brouillons locaux, une lettre cachetée non gardée', …) // (Review 2)
it('un serveur muet : tout abandonne au délai', …)                         // delai: 50 → lettres() < 500 ms, horsLigne (Review 4)
it('compléter : les fichiers ; déjà complète : la même', …)
it('compléter, une voix qui ne vient pas : audio vide, clé gardée ; la reposer n’envoie aucun fichier', …) // (Review 1)
it('compléter un brouillon dont le dessin ne vient pas : null', …)
it('garder un brouillon à charger : false, rien d’écrit', …)
it('migrer : lettres et réglages locaux partent, la marque se pose', …)
it('migrer interrompu : pas de marque, la suite la fois d’après, sans double', …)
it('jeter : la lettre quitte la liste', …)
it('réglages : en ligne, puis en panne ceux du local', …)
```
Dans `src/core/courrierdb.test.ts` : `completer` rend la même lettre et `horsLigne()` est faux pour le coffre en mémoire.

- [ ] **Step 2:** `npx vitest run src/core/courrierenligne.test.ts src/core/courrierdb.test.ts` → FAIL (module absent ; `completer` absent).
- [ ] **Step 3:** Les champs de `Lettre` et `Vocal` ; l'interface et les deux coffres de `courrierdb.ts` ; `courrierenligne.ts`. Le délai : un `AbortController` ET une course avec un minuteur.
- [ ] **Step 4:** `npx vitest run src/core/courrierenligne.test.ts src/core/courrierdb.test.ts` → PASS ; `npm run build && npm run lint && npm test` → vert.
- [ ] **Step 5:** Commit : `Le Courrier en ligne : le coffre en ligne`

---

### Task 4: Le jeu branché, et les documents

**Files:** Modify `src/games/courrier.ts`, `src/games/courrier-feuille.ts`, `src/core/boites3d.ts`, `src/core/courrierdb.ts` (en-tête), `scripts/touched.mjs`, `CLAUDE.md`, `README.md`, `ROADMAP.md`

**Interfaces:**
- Consumes : `Coffre` (tâche 3), `coffreEnLigne`, `coffreIDB`.
- Produces : `Boites.nuage(w: Who, on: boolean): void` — un panneau (sprite, texture dessinée sur un canvas : un nuage blanc barré) au-dessus du mât du drapeau, libéré par `dispose`.

**Les changements** (lire `src/games/courrier.ts` en entier avant) :
- **Le coffre** (`mount`) : `__BOT` et pas `__COFFRE_EN_LIGNE` → le coffre local d'aujourd'hui (avec `__co.echec`) ; sinon `coffreEnLigne(coffreIDB())`.
- **`Jeu.ecritures`** : un compteur que `retenir` augmente.
- **`relire(j): Promise<void>`** : attend `sauvegardes()`, note `ecritures`, lit `coffre.lettres()` ; s'il n'y a pas eu d'écriture entre-temps et que le jeu est vivant : `j.lettres` remplacée, `peindreBoites`, `guetter`. Appelée dans `chez` (sans attendre) et dans `toucherBoite`.
- **`prete(j, l): Promise<Lettre | null>`** : `coffre.completer(l)`, puis `retenir` si la lettre a changé ; `null` si le jeu n'est plus là.
- **`ecrireLettre`** : la lettre cachetée qui attend, et le brouillon (ou `depuis`), passent par `prete` sous `j.occupe` ; `null` → `sfx('error', { vol: 0.4 })`, rien ne s'ouvre. Revérifier `jeu`, `j.qui`, `j.ecran` après chaque `await`.
- **`toucherBoite`** : sans réseau (`horsLigne()`) → comme une boîte vide. Sinon la porte s'ouvre, puis `relire` et l'attente de 650 ms (par `j.c.after`) ensemble ; puis la première lettre de `boite()` (aucune, ou plus de réseau → la secousse, la porte se referme 450 ms plus tard) ; puis `prete`, puis l'ouverture d'aujourd'hui.
- **`peindreBoites`** : `horsLigne()` → drapeaux baissés, pas d'enveloppe qui dépasse, `nuage(w, true)` ; sinon `nuage(w, false)`.
- **`souvenirsDe`** : chaque vignette et chaque toucher passent par `prete` (la lecture ne s'ouvre que si les Souvenirs sont encore à l'écran) ; sans réseau et sans lettre : un nuage barré (`ICONE.nuage`) à la place du coffre vide.
- **`courrier-feuille.ts`** : `garder(sortie = false)` ; l'attente de 500 ms après un geste → `garderLettre(l, { ici: true })` ; « Envoyer » et `fermer` (qui forcent déjà `enAttente`) → `garderLettre(l)`.
- **`scripts/touched.mjs`** : `courrierfil.ts` et `courrierenligne.ts` dans `OWN.courrier`.
- **Documents** : `CLAUDE.md` — la troisième exception de la règle 3, avec les mots de la § 2 ; la ligne `worker/` de l'Architecture (`courrier.ts`, `migrations/`) ; la ligne du tableau du socle pour `courrierfil.ts` et `courrierenligne.ts` ; dans « En local » : appliquer une fois les migrations locales avant `worker:dev`. `README.md` — le Courrier n'est plus « tout reste sur la tablette » ; une section « Lire le Courrier (pour le père) » avec la requête de la § 4 et le chemin R2. `ROADMAP.md` — le point 4 du Courrier en 🔧, sans date. L'en-tête de `courrierdb.ts` (« sur la tablette seulement ») : les coffres locaux gardent les brouillons ; le coffre en ligne est dans `courrierenligne.ts`.

- [ ] **Step 1:** Les changements ci-dessus. `npm run build && npm run lint && npm test` → vert.
- [ ] **Step 2:** `BOTS=courrier timeout 600 npm run test:play` → le bot du Courrier va jusqu'à sa fin (coffre local : rien ne doit avoir changé pour lui).
- [ ] **Step 3:** `.verify-courrier-nuage.mjs` sous `vite preview` (port 4188), sans `__BOT` (donc sans Worker : hors ligne), Chromium en swiftshader, `serviceWorkers: 'block'` : le jeu s'ouvre sans `pageerror` ; capture des deux boîtes (nuages, pas de drapeau) ; Joyce → « Écrire » ouvre une feuille ; « Souvenirs » montre le nuage. **Regarder les captures.** Supprimer le script.
- [ ] **Step 4:** Commit : `Le Courrier en ligne : le jeu lit et écrit en ligne`

---

### Task 5: Le branchement, et l'essai à deux appareils

**Prérequis** (§ 7) : l'identifiant de la base D1 créée par le père. Sans lui, s'arrêter ici et le lui demander.

**Files:** Modify `wrangler.jsonc`, `.github/workflows/deploy.yml`, `PIEGES.md` (si un piège est payé)

- [ ] **Step 1:** `wrangler.jsonc` : `d1_databases` (`binding: "DB"`, `database_name: "girlz-games-courrier"`, `database_id` du père, `migrations_dir: "worker/migrations"`) et `r2_buckets` (`binding: "COURRIER"`, `bucket_name: "girlz-games-courrier"`), commentés en français comme le reste du fichier. `deploy.yml` : une étape « Migrations de la base du Courrier » avant « Déployer le Worker » : `npx wrangler d1 migrations apply girlz-games-courrier --remote`, `CLOUDFLARE_API_TOKEN` en `env`. Vérifier que `.wrangler/` est ignoré par git.
- [ ] **Step 2:** `npm run build`, puis `timeout 120 npx wrangler d1 migrations apply girlz-games-courrier --local` → la migration 0001 appliquée. `npm run worker:dev` en arrière-plan (port 8787 ; `.dev.vars` local avec `DEV_SKIP_ACCESS=1`).
- [ ] **Step 3:** `.verify-courrier-deux.mjs` : deux contextes Playwright (deux « appareils », chacun son IndexedDB), `__BOT` et `__COFFRE_EN_LIGNE` posés, une limite de 5 min et une ligne par étape :
  1. **La migration** : A garde d'abord une lettre postée de Joyce dans son IndexedDB (avant le jeu) ; A ouvre le jeu → la lettre est dans `GET /api/courrier/lettres` ; la marque est posée.
  2. **Le brouillon suit** : dans A, Jade dessine et écrit un mot, puis Retour → le brouillon est en ligne avec sa clé de dessin. Dans B, Jade → « Écrire » ouvre ce brouillon, dessin compris.
  3. **La lettre arrive** : B finit l'envoi (le parcours du bot `courrier-lettre`). Dans A, Joyce entre → le drapeau est levé ; la boîte → l'enveloppe, puis la lecture avec le dessin et le mot.
  4. **Sans réseau** : A coupe le réseau (`context.setOffline(true)`), Joyce entre → le nuage ; « Écrire » marche.
  Captures aux étapes 2, 3 et 4, et **les regarder**. Arrêter `worker:dev` et vérifier qu'aucun processus `workerd` ne reste. Supprimer le script.
- [ ] **Step 4:** Avant l'envoi (CLAUDE.md) : `git fetch origin && git merge origin/main` ; `npm run build && timeout 1200 npm run test:smoke` → tous les jeux s'ouvrent ; `node scripts/touched.mjs origin/main` → les bots qu'il cite, `timeout 900`, jusqu'à leur fin.
- [ ] **Step 5:** Commit : `Le Courrier en ligne : la base et le compartiment branchés`

**Après le plan** : l'envoi sur `main` attend le père — le jeton élargi (D1 · Edit, Workers R2 Storage · Edit) et son accord pour pousser. Puis, en ligne avec lui : une lettre de test lue dans la console D1 et dans R2 (§ 8).
