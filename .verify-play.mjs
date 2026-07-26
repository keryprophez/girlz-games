/* Vérification temporaire : on JOUE aux jeux modifiés pour vérifier l'enjeu. */
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'
const OUT = '/tmp/claude-0/-home-user-girlz-games/45f4bedf-173b-58bb-9e36-5a6323d2d444/scratchpad/shots'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
})
const page = await browser.newPage({ viewport: { width: 520, height: 900 } })
page.on('pageerror', e => console.error('PAGEERROR:', e.message))
const open = async name => {
  await page.goto('http://localhost:4188/girlz-games/')
  await page.waitForSelector('.gc')
  await page.locator('.gc', { hasText: name }).first().click()
}

// ---------- CHENILLE : la mort existe-t-elle ? ----------
await open('La Chenille')
await page.waitForTimeout(600)
console.log('chenille — cœurs au départ :', await page.locator('#cpLives').textContent())
const arena = await page.locator('#cpArena').boundingBox()
const cx = arena.x + arena.width / 2, cy = arena.y + arena.height / 2
// Boucle serrée, cadencée sur le pas du jeu : une chenille assez longue s'y mord
for (let i = 0; i < 60; i++) {
  const dirs = [[80, 0], [0, 80], [-80, 0], [0, -80]]
  const [dx, dy] = dirs[i % 4]
  await page.mouse.move(cx, cy); await page.mouse.down()
  await page.mouse.move(cx + dx, cy + dy, { steps: 2 }); await page.mouse.up()
  await page.waitForTimeout(330)
  if (await page.locator('#result').count()) break
}
const cpDead = await page.locator('#result').count() > 0
console.log('chenille — partie terminée :', cpDead)
if (cpDead) {
  await page.screenshot({ path: `${OUT}/play-chenille.png` })
  console.log('chenille — titre :', (await page.locator('#result h2').textContent()).trim())
  console.log('chenille — rejouer sans viser :', await page.locator('#result.quickretry').count() > 0)
} else {
  console.log('chenille — cœurs restants :', await page.locator('#cpLives').textContent())
}

// ---------- TAUPE : cactus = cœur, combo ----------
await open('Tape-Trous')
await page.waitForTimeout(2600)
console.log('taupe — cœurs :', await page.locator('#moleLives').textContent())
let hits = 0
for (let i = 0; i < 150 && hits < 14; i++) {
  if (await page.locator('#result').count()) break
  const up = page.locator('.hole.up')
  if (await up.count()) { await up.first().dispatchEvent('pointerdown'); hits++ }
  await page.waitForTimeout(105)
}
if (await page.locator('#result').count()) {
  console.log('taupe — partie terminée :', (await page.locator('#result h2').textContent()).trim())
} else {
  console.log('taupe — score :', await page.locator('#moleScore').textContent(),
    '| cœurs :', await page.locator('#moleLives').textContent(),
    '| combo :', JSON.stringify(await page.locator('#moleCombo').textContent()))
}
await page.screenshot({ path: `${OUT}/play-taupe.png` })

// ---------- BALLON : le chrono descend ----------
await open('Gonfle !')
await page.waitForTimeout(500)
const t1 = await page.locator('#blTime').textContent()
const bArea = await page.locator('#blArea').boundingBox()
for (let i = 0; i < 40; i++) {
  await page.mouse.click(bArea.x + bArea.width / 2, bArea.y + bArea.height / 2)
  await page.waitForTimeout(45)
}
await page.waitForTimeout(2000)
console.log('ballon — chrono', t1, '->', await page.locator('#blTime').textContent(),
  '| manche :', await page.locator('#blRound').textContent())
await page.screenshot({ path: `${OUT}/play-ballon.png` })

// ---------- TOUR DE GLACE ----------
await open('La Tour de Glace')
await page.waitForTimeout(3500)
await page.screenshot({ path: `${OUT}/play-icetower.png` })
console.log('tour de glace : capture prise')
await browser.close()
