/* Smoke test : ouvre chaque jeu de la ferme et vérifie qu'il se monte sans
   erreur JavaScript ET qu'il finit de charger (un jeu 3D bloqué sur son
   écran d'attente est un échec). Tablette en paysage, service worker bloqué
   (sa maj auto recharge la page en plein test — piège connu).
   Usage : npm run build && npm run test:smoke */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

// PORT=… : un autre port quand 4188 est pris (plusieurs sessions en parallèle)
const PORT = Number(process.env.PORT || 4188)
const URL = `http://localhost:${PORT}/girlz-games/`

// Un serveur déjà là sur ce port servirait un AUTRE build : on s'arrête
if (await fetch(URL).then(() => true, () => false)) { console.error(`Le port ${PORT} est déjà pris : arrête ce serveur d'abord, ou PORT=…`); process.exit(1) }

// Serveur de preview sur le build de production
const server = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore', detached: false
})
const kill = () => { try { server.kill() } catch { /* déjà mort */ } }
process.on('exit', kill)

for (let i = 0; ; i++) {
  try {
    const r = await fetch(URL)
    if (r.ok) break
  } catch { /* pas encore prêt */ }
  if (i > 40) { console.error('Le serveur de preview ne répond pas'); process.exit(1) }
  await new Promise(r => setTimeout(r, 250))
}

// Chromium local (sandbox de dev) ou Chrome du runner CI
const local = '/opt/pw-browsers/chromium'
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH }
    : existsSync(local) ? { executablePath: local }
    : { channel: 'chrome' }),
  args: ['--no-sandbox']
})
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 }, // Galaxy Tab A9+ en paysage (CSS px)
  serviceWorkers: 'block'
})
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', e => pageErrors.push(e.message))

const TILE = '.gc'
const TAB = '.hm-tab'
await page.goto(URL)
await page.waitForSelector(TAB, { timeout: 15000 })
// Depuis le 23/09 l'accueil montre UN univers à la fois : on passe les onglets
const games = []
for (const w of await page.$$eval(TAB, els => els.map(el => el.dataset.w))) {
  await page.locator(`${TAB}[data-w="${w}"]`).click()
  await page.waitForSelector(TILE)
  for (const name of await page.$$eval(TILE, els => els.map(el => el.querySelector('.nm')?.textContent || '?'))) games.push({ w, name })
}
console.log(`${games.length} jeux à vérifier…`)

const failures = []
for (let i = 0; i < games.length; i++) {
  pageErrors.length = 0
  await page.goto(URL)
  await page.locator(`${TAB}[data-w="${games[i].w}"]`).click()
  await page.locator(TILE, { hasText: games[i].name }).first().click()
  // Un jeu à calculs (le Potager) demande d'abord ses opérations : on garde
  // celles par défaut et on passe (27/09)
  // (un jeu sans niveau, 30/09, démarre directement : on attend le jeu lui-même)
  await page.locator('.opsgo, .tierbtn.tier-easy, .gameroot > *').first().waitFor()
  if (await page.locator('.opsgo').count()) await page.locator('.opsgo').click()
  // La difficulté se choisit dans le jeu : on prend la douce (comme Jade)
  if (await page.locator('.tierbtn').count()) await page.locator('.tierbtn.tier-easy').click()
  // Laisse le temps au jeu de se monter (la 3D charge three.js à la demande)
  await page.waitForTimeout(1600)
  const mounted = await page.$eval('.gameroot', el => el.children.length > 0).catch(() => false)
  // L'écran d'attente doit avoir disparu : sinon le chargement 3D a échoué en silence
  const loaded = await page.waitForSelector('.nj-loading', { state: 'detached', timeout: 12000 })
    .then(() => true).catch(() => false)
  if (pageErrors.length || !mounted || !loaded) {
    failures.push({ game: games[i], errors: [...pageErrors], mounted, loaded })
    console.error(`✗ ${games[i].name} — monté: ${mounted}, chargé: ${loaded}, erreurs: ${pageErrors.join(' | ') || 'aucune'}`)
  } else {
    console.log(`✓ ${games[i].name}`)
  }
}

await browser.close()
kill()

if (failures.length) {
  console.error(`\n${failures.length} jeu(x) en échec`)
  process.exit(1)
}
console.log(`\nTous les ${games.length} jeux se montent sans erreur 🎉`)
