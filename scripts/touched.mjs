/* Les bots à faire jouer : ceux des jeux TOUCHÉS, et eux seuls (2/10).

   Le père, le 2/10 : « on ne valide via bot que les jeux que l'on touche
   spécifiquement ». Ce script compare deux commits et en déduit les bots :
   - un fichier d'un jeu (`src/games/…`) ou un module qui ne sert qu'à lui
     (la table `OWN` ci-dessous) → les bots de ce jeu ;
   - un scénario modifié dans `scripts/play.mjs` → ce scénario ;
   - tout le reste (socle 3D, coquille, main qui montre, styles…) → aucun
     bot : le smoke, qui ouvre tous les jeux, reste le filet.

   node scripts/touched.mjs origin/main   → les bots de ta branche
   node scripts/touched.mjs --ci          → en intégration : depuis la dernière
     mise en ligne réussie (API GitHub), écrit `run` et `bots` dans
     $GITHUB_OUTPUT. BOTS_FORCE=tous les lance tous. */
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'

/* Mot-clé des scénarios de `play.mjs` (BOTS=… garde ceux dont le nom le
   contient) → les fichiers qui n'appartiennent qu'à ce jeu. Un module
   partagé par plusieurs jeux n'y figure pas, sauf s'il est le cœur de
   chacun (les perles à repasser : le Miroir et les Bijoux). */
const OWN = {
  'pizza': ['src/games/pizza.ts'],
  'tour-trois-blocs': ['src/games/icetower.ts', 'src/core/winter.ts'],
  'labyrinthe': ['src/games/maze.ts'],
  'taquin': ['src/games/taquin.ts'],
  'puzzle': ['src/games/taquin.ts', 'src/games/jigsaw.ts', 'src/core/jigsaw.ts', 'src/core/pictures.ts'],
  'memory': ['src/games/memory.ts'],
  'choeur': ['src/games/simon.ts'],
  'puissance4': ['src/games/connect4.ts'],
  'horloge': ['src/games/clock.ts'],
  'potager': ['src/games/potager.ts', 'src/core/facts.ts', 'src/core/plants.ts'],
  'intrus': ['src/games/intrus.ts'],
  'ninja': ['src/games/ninja.ts'],
  'flipper': ['src/games/pinball.ts', 'src/core/pinball.ts'],
  'tour-du-monde': ['src/games/geo.ts'],
  'suites': ['src/games/patterns.ts', 'src/core/train3d.ts'],
  'lettres': ['src/games/letters.ts'],
  'perles-miroir': ['src/games/mirror.ts', 'src/core/hama3d.ts', 'src/core/perles.ts'],
  'marche': ['src/games/market.ts', 'src/core/money3d.ts'],
  'espace': ['src/games/space.ts', 'src/core/cosmos.ts', 'src/core/rocket3d.ts'],
  'piano': ['src/games/piano.ts'],
  'atelier': ['src/games/coloring.ts', 'src/core/lineart.ts'],
  'feu-': ['src/games/fireworks.ts'],
  'bijoux': ['src/games/bijoux.ts', 'src/core/bijoux3d.ts', 'src/core/hama3d.ts', 'src/core/perles.ts', 'src/core/royal.ts'],
  'habille-toi': ['src/games/dressup.ts', 'src/games/doll.ts', 'src/core/doll3d.ts', 'src/core/character.ts'],
  'cache-cache': ['src/games/hideseek.ts', 'src/core/farm3d.ts'],
  'animal-qui-repete': ['src/games/parrot.ts', 'src/core/voicefx.ts', 'src/core/mic.ts'],
  'ferme-a-construire': ['src/games/farmbuild.ts', 'src/core/farm3d.ts'],
  'patisserie': ['src/games/bakery.ts', 'src/core/cake3d.ts'],
}
// Les jeux qui n'ont pas (encore) de bot : pas d'alerte pour eux
const NO_BOT = new Set(['src/games/sentences.ts', 'src/games/index.ts'])

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' })
const has = sha => { try { git('cat-file', '-e', sha + '^{commit}'); return true } catch { return false } }

/* La dernière mise en ligne réussie : le commit de `main` dont le run de
   `deploy.yml` est allé au bout. Un run échoué ou annulé ne compte pas :
   ses jeux seront rejoués par le suivant. */
async function lastDeployed() {
  const repo = process.env.GITHUB_REPOSITORY, token = process.env.GH_TOKEN
  if (!repo || !token) return null
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/deploy.yml/runs?branch=main&status=success&per_page=1`,
      { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' } })
    if (!r.ok) { console.log(`API GitHub : ${r.status}`); return null }
    return (await r.json()).workflow_runs?.[0]?.head_sha ?? null
  } catch (e) { console.log(`API GitHub : ${e}`); return null }
}

/* Les scénarios de `play.mjs` touchés : chaque ligne ajoutée ou modifiée
   est rendue au scénario qui la contient (de son `await scenario(` à la
   prochaine instruction en colonne 0). Une ligne hors scénario (les outils
   communs du script) n'en déclenche aucun. */
function scenariosTouched(base) {
  const diff = git('diff', '-U0', base, 'HEAD', '--', 'scripts/play.mjs')
  const lines = []
  for (const m of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const at = +m[1], n = m[2] === undefined ? 1 : +m[2]
    if (n === 0) lines.push(at)
    for (let i = 0; i < n; i++) lines.push(at + i)
  }
  if (!lines.length) return []
  const src = readFileSync('scripts/play.mjs', 'utf8').split('\n')
  const blocks = []
  for (let i = 0; i < src.length; i++) {
    const m = src[i].match(/^await scenario\('([^']+)'/)
    if (!m) continue
    let j = i + 1
    while (j < src.length && !/^[^\s})\]]/.test(src[j])) j++
    blocks.push({ name: m[1], from: i + 1, to: j })
  }
  return [...new Set(lines.flatMap(l => blocks.filter(b => l >= b.from && l <= b.to).map(b => b.name)))]
}

function botsFor(base) {
  const files = git('diff', '--name-only', base, 'HEAD').split('\n').filter(Boolean)
  const bots = new Set()
  for (const f of files) for (const [k, own] of Object.entries(OWN)) if (own.includes(f)) bots.add(k)
  for (const s of scenariosTouched(base)) if (![...bots].some(k => s.includes(k))) bots.add(s)
  const known = new Set(Object.values(OWN).flat())
  const orphans = files.filter(f => /^src\/games\/[^/]+\.tsx?$/.test(f) && !known.has(f) && !NO_BOT.has(f))
  return { files, bots: [...bots], orphans }
}

const ci = process.argv.includes('--ci')
const out = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`) }

if (ci && /^tous$/i.test(process.env.BOTS_FORCE ?? '')) {
  console.log('Lancement manuel « tous » : tous les bots jouent.')
  out('run', 'true'); out('bots', '')
} else {
  let base = ci ? await lastDeployed() : (process.argv[2] ?? 'origin/main')
  if (ci && !(base && has(base))) {
    console.log(`Dernière mise en ligne introuvable (${base ?? 'aucune'}) : on part du commit d'avant le push.`)
    base = process.env.BEFORE
  }
  if (!(base && !/^0+$/.test(base) && has(base))) {
    // Rien à quoi se comparer (premier run, historique réécrit) : prudence
    console.log(`Aucune base de comparaison (${base ?? 'aucune'}) : tous les bots jouent.`)
    out('run', 'true'); out('bots', '')
  } else {
    const { files, bots, orphans } = botsFor(base)
    console.log(`Depuis ${base.slice(0, 7)} : ${files.length} fichier(s) changé(s).`)
    for (const o of orphans) console.log(`⚠ ${o} : jeu absent de la table OWN de scripts/touched.mjs (aucun bot ne le joue)`)
    if (bots.length) console.log(`Bots des jeux touchés : ${bots.join(', ')}`)
    else console.log('Aucun jeu touché en propre : pas de bot (le smoke a ouvert tous les jeux).')
    out('run', bots.length ? 'true' : 'false'); out('bots', bots.join(','))
  }
}
