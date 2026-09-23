/* Smoke test : ouvre chaque jeu de la ferme et vérifie qu'il se monte sans
   erreur JavaScript ET qu'il finit de charger (un jeu 3D bloqué sur son
   écran d'attente est un échec). Tablette en paysage, service worker bloqué
   (sa maj auto recharge la page en plein test — piège connu).
   Usage : npm run build && npm run test:smoke */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const PORT = 4188
const URL = `http://localhost:${PORT}/girlz-games/`

// Serveur de preview sur le build de production
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
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
  // La difficulté se choisit dans le jeu : on prend la douce (comme Jade)
  await page.locator('.tierbtn.tier-easy').click()
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
