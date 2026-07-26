/* Smoke test : ouvre chaque jeu de la ferme et vérifie qu'il se monte sans
   erreur JavaScript. Protège les 32 jeux contre les régressions.
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
const page = await browser.newPage({ viewport: { width: 480, height: 860 } })
const pageErrors = []
page.on('pageerror', e => pageErrors.push(e.message))

await page.goto(URL)
await page.waitForSelector('.gc', { timeout: 10000 })
const games = await page.$$eval('.gc', els => els.map(el => el.querySelector('.nm')?.textContent || '?'))
console.log(`${games.length} jeux à vérifier…`)

const failures = []
for (let i = 0; i < games.length; i++) {
  pageErrors.length = 0
  await page.goto(URL)
  await page.waitForSelector('.gc')
  await page.locator('.gc').nth(i).click()
  // Laisse le temps au jeu de se monter (les jeux WebGL chargent PixiJS à la demande)
  await page.waitForTimeout(1600)
  const mounted = await page.$eval('.gameroot', el => el.children.length > 0).catch(() => false)
  if (pageErrors.length || !mounted) {
    failures.push({ game: games[i], errors: [...pageErrors], mounted })
    console.error(`✗ ${games[i]} — monté: ${mounted}, erreurs: ${pageErrors.join(' | ') || 'aucune'}`)
  } else {
    console.log(`✓ ${games[i]}`)
  }
}

await browser.close()
kill()

if (failures.length) {
  console.error(`\n${failures.length} jeu(x) en échec`)
  process.exit(1)
}
console.log(`\nTous les ${games.length} jeux se montent sans erreur 🎉`)
