/* Bots de jeu : là où le smoke test vérifie que les jeux SE MONTENT, ces bots
   vérifient qu'on peut Y JOUER — rouler les boules du bonhomme jusqu'au bout,
   croquer des fruits à la chenille, sauter les obstacles du tracteur, passer
   des barrières au poussin, et que la sauce de la pizza tombe SOUS le doigt
   (régression du bug de coordonnées UV).

   Les jeux exposent leur état de pilotage seulement quand `window.__BOT` est
   posé avant le chargement — inerte en production.

   Usage : npm run build && npm run test:play */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const PORT = 4189
const URL = `http://localhost:${PORT}/girlz-games/`

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

const local = '/opt/pw-browsers/chromium'
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH }
    : existsSync(local) ? { executablePath: local }
    : { channel: 'chrome' }),
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
})
const ctx = await browser.newContext({
  viewport: { width: 900, height: 640 },
  serviceWorkers: 'block' // sa maj auto recharge la page en plein test (piège connu)
})
await ctx.addInitScript(() => { window.__BOT = true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))

// Sans WebGL utilisable, aucun bot 3D ne peut jouer : on passe (avertissement)
// plutôt que de bloquer un déploiement pour une lubie du runner.
await page.goto(URL, { waitUntil: 'networkidle' })
const gl = await page.evaluate(() => {
  const c = document.createElement('canvas')
  return !!(c.getContext('webgl2') || c.getContext('webgl'))
})
if (!gl) {
  console.warn('⚠ WebGL indisponible sur ce runner : bots de jeu sautés (le smoke test reste la barrière)')
  await browser.close()
  process.exit(0)
}

const openGame = async (name) => {
  errors.length = 0
  await page.goto(URL, { waitUntil: 'networkidle' })
  const who = page.locator('.who-card').first()
  if (await who.count()) await who.click()
  await page.waitForTimeout(300)
  await page.locator('.gc:not(.gc-duel)', { hasText: name }).first().click()
  await page.waitForTimeout(3200)
}

const failures = []
const scenario = async (name, fn) => {
  try {
    await fn()
    if (errors.length) throw new Error('erreurs JS : ' + errors.join(' | '))
    console.log(`✓ ${name}`)
  } catch (e) {
    failures.push(name)
    console.error(`✗ ${name} — ${String(e).split('\n')[0]}`)
  }
}

/* ⛄ Bonhomme de neige : le parcours complet, jusqu'à l'écran de fin.
   Protège le blocage vécu (barre de pose hors écran). */
await scenario('bonhomme-parcours-complet', async () => {
  await openGame('Bonhomme de neige')
  const box = await page.locator('#snArena').boundingBox()
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  for (let k = 0; k < 40; k++) {
    await page.mouse.move(cx - 160, cy + 40)
    await page.mouse.down()
    for (let i = 0; i <= 10; i++) { await page.mouse.move(cx - 160 + i * 32, cy + 40 - i * 5, { steps: 2 }); await page.waitForTimeout(14) }
    await page.mouse.up()
    await page.waitForTimeout(50)
    const deco = await page.evaluate(() => {
      const d = document.getElementById('snDeco')
      return d && d.style.display !== 'none'
    })
    if (deco) break
  }
  const deco = await page.evaluate(() => {
    const d = document.getElementById('snDeco')
    const a = document.getElementById('snArena').getBoundingClientRect()
    const r = d.getBoundingClientRect()
    return { visible: d.style.display !== 'none', dansArene: r.bottom <= a.bottom + 2 }
  })
  if (!deco.visible) throw new Error('la phase déco n\'est pas apparue (pose des boules cassée ?)')
  if (!deco.dansArene) throw new Error('le panneau déco sort de l\'arène')
  await page.locator('#snDone').click()
  await page.waitForTimeout(1200)
  const fini = await page.evaluate(() => document.body.innerText.includes('beau bonhomme'))
  if (!fini) throw new Error('l\'écran de fin n\'est pas apparu')
  // Et la difficulté adaptative a enregistré la partie (reward → adapt)
  const adapt = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('ferme'))
    const d = JSON.parse(localStorage.getItem(key))
    return d.state.progress?.jade?.adapt?.snowman
  })
  if (typeof adapt !== 'number') throw new Error('progress.adapt non enregistré après la partie')
})

/* 🐛 La Chenille : piloter la tête vers les fruits, en croquer au moins 2. */
await scenario('chenille-croque-des-fruits', async () => {
  await openGame('La Chenille')
  for (let i = 0; i < 110; i++) {
    const st = await page.evaluate(() => {
      const cp = window.__cp
      if (!cp || !cp.running) return null
      return { hx: cp.snake[0].x, hy: cp.snake[0].y, fx: cp.fruit.x, fy: cp.fruit.y, d: cp.dir, eaten: cp.eaten }
    })
    if (!st) break
    if (st.eaten >= 2) return
    let key = null
    if (st.hx !== st.fx && st.d.x !== 0) key = st.fx > st.hx ? 'ArrowRight' : 'ArrowLeft'
    else if (st.hy !== st.fy) key = st.fy > st.hy ? 'ArrowDown' : 'ArrowUp'
    else if (st.hx !== st.fx) key = st.fx > st.hx ? 'ArrowRight' : 'ArrowLeft'
    if (key) await page.keyboard.press(key)
    await page.mouse.move(300 + (i % 5) * 40, 300)
    await page.waitForTimeout(200)
  }
  throw new Error('moins de 2 fruits croqués en 22 s')
})

/* 🚜 Course : sauter les obstacles, tenir 100 m avec au moins un cœur. */
await scenario('course-cent-metres', async () => {
  await openGame('Course')
  for (let i = 0; i < 160; i++) {
    const st = await page.evaluate(() => {
      const r = window.__run
      if (!r || !r.running) return null
      const near = r.obstacles.some(o => o.x > 90 && o.x < 90 + r.speed * 330)
      return { near, jumping: r.jumping, dist: Math.floor(r.dist), lives: r.lives }
    })
    if (!st) throw new Error('partie terminée avant 100 m')
    if (st.dist >= 100 && st.lives >= 1) return
    if (st.near && !st.jumping) await page.keyboard.press('Space')
    await page.mouse.move(300 + (i % 5) * 40, 300)
    await page.waitForTimeout(90)
  }
  throw new Error('100 m non atteints en 15 s')
})

/* 🐤 Poussin Volant : viser le milieu du passage, franchir 2 barrières. */
await scenario('poussin-deux-barrieres', async () => {
  await openGame('Poussin Volant')
  await page.keyboard.press('Space')
  for (let i = 0; i < 200; i++) {
    const st = await page.evaluate(() => {
      const f = window.__fl
      if (!f || !f.running) return null
      const next = f.pipes.find(p => p.x + 52 > 900 * 0.22 - 18)
      const target = next ? next.gy + next.gap * 0.55 : 420 * 0.45
      return { y: f.y, vy: f.vy, target, score: f.score }
    })
    if (!st) break
    if (st.score >= 2) return
    if (st.y + st.vy * 140 > st.target) await page.keyboard.press('Space')
    await page.mouse.move(300 + (i % 5) * 40, 300)
    await page.waitForTimeout(80)
  }
  throw new Error('moins de 2 barrières passées en 16 s')
})

/* 🍕 Pizzeria : la sauce doit apparaître SOUS le doigt (régression UV). */
await scenario('pizza-sauce-sous-le-doigt', async () => {
  await openGame('La Pizzeria')
  const cv = await page.locator('canvas').first().boundingBox()
  const tapX = cv.x + cv.width * 0.56, tapY = cv.y + cv.height * 0.52
  await page.mouse.move(tapX, tapY)
  await page.mouse.down()
  await page.mouse.move(tapX + 4, tapY + 4, { steps: 2 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  // Capturer l'élément, chercher le rouge tomate PRÈS du point touché —
  // le canvas WebGL ne se relit pas (preserveDrawingBuffer off), on passe
  // par une capture décodée dans un canvas 2D de la page (piège connu)
  const shot = await page.locator('canvas').first().screenshot()
  // Recherche du rouge tomate autour du point touché, en coordonnées relatives
  const ok = await page.evaluate(async ({ b64, relX, relY }) => {
    const img = new Image()
    await new Promise((ok2, ko) => { img.onload = ok2; img.onerror = ko; img.src = 'data:image/png;base64,' + b64 })
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0)
    const cx = Math.round(relX * img.width), cy = Math.round(relY * img.height)
    const R = Math.round(img.width * 0.06)
    const d = g.getImageData(Math.max(0, cx - R), Math.max(0, cy - R), R * 2, R * 2).data
    let red = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 150 && d[i + 1] < 120 && d[i + 2] < 120) red++
    }
    return red > 20
  }, {
    b64: shot.toString('base64'),
    relX: (tapX - cv.x) / cv.width,
    relY: (tapY - cv.y) / cv.height
  })
  if (!ok) throw new Error('pas de sauce détectée sous le point touché')
})

await browser.close()
if (failures.length) {
  console.error(`\n${failures.length} scénario(s) en échec : ${failures.join(', ')}`)
  process.exit(1)
}
console.log('\nTous les bots ont gagné leur partie 🏆')
process.exit(0) // le serveur de preview garderait le process en vie
