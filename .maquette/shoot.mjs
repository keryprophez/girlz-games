import { chromium } from 'playwright-core'
const OUT = '/tmp/claude-0/-home-user-girlz-games/f686dda1-bf4b-5e41-936f-c648d01b09b8/scratchpad/'
const shots = JSON.parse(process.argv[2])
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 })).newPage()
page.on('pageerror', e => console.log('ERREUR', String(e)))
for (const [name, query] of shots) {
  await page.goto('http://localhost:5199/.maquette/index.html?hq&' + query)
  await page.waitForFunction(() => window.__ready, null, { timeout: 90000 })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: OUT + name + '.png' })
  console.log('✓', name)
}
await browser.close()
