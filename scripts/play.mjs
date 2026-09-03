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
  const sn = () => page.evaluate(() => new Promise(res => requestAnimationFrame(() => {
    const s = window.__sn
    res(s ? { phase: s.phase, r: s.r, min: s.minPose, stack: s.stack, ball: s.ball(), pile: s.pile() } : null)
  })))
  // Rouler : d'abord en rond pour grossir, puis droit sur la pile ; trois fois
  for (let k = 0; k < 60; k++) {
    const st = await sn()
    if (!st) throw new Error('le bonhomme ne répond pas')
    if (st.phase === 'deco') break
    if (st.phase !== 'roll' || !st.ball) { await page.waitForTimeout(150); continue }
    const grow = st.r < st.min
    const to = grow ? { x: st.ball.x + (k % 2 ? 140 : -140), y: st.ball.y + 30 } : st.pile
    await page.mouse.move(st.ball.x, st.ball.y)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(st.ball.x + (to.x - st.ball.x) * i / 8, st.ball.y + (to.y - st.ball.y) * i / 8)
      await page.waitForTimeout(16)
    }
    await page.mouse.up()
  }
  const deco = await sn()
  if (!deco || deco.phase !== 'deco') throw new Error(`pas d'habillage après 60 coups (phase ${deco && deco.phase}, ${deco && deco.stack} boules)`)
  // Habiller : glisser le haut-de-forme du plateau sur la tête
  await page.waitForTimeout(400)
  const where = await page.evaluate(() => {
    const s = window.__sn
    const hat = s.items().find(i => i.kind === 'hat' && i.variant === 'tophat')
    return { from: hat.screen, to: s.head() }
  })
  await page.mouse.move(where.from.x, where.from.y)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(where.from.x + (where.to.x - where.from.x) * i / 10, where.from.y + (where.to.y - where.from.y) * i / 10)
    await page.waitForTimeout(16)
  }
  await page.mouse.up()
  await page.waitForTimeout(300)
  const placed = await page.evaluate(() => window.__sn.items().find(i => i.variant === 'tophat').placed)
  if (!placed) throw new Error('le chapeau glissé sur la tête ne s\'est pas posé')
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
    // Cap voulu ; la clôture est un vrai mur et le demi-tour est interdit,
    // donc si le fruit est derrière on tourne d'abord de côté.
    const wx = Math.sign(st.fx - st.hx), wy = Math.sign(st.fy - st.hy)
    let want = null
    if (wx && st.d.x === 0) want = { x: wx, y: 0 }
    else if (wy && st.d.y === 0) want = { x: 0, y: wy }
    else if (wx && wx !== st.d.x) want = { x: 0, y: wy || (st.hy > 5 ? -1 : 1) }
    else if (wy && wy !== st.d.y) want = { x: wx || (st.hx > 6 ? -1 : 1), y: 0 }
    if (want) {
      const key = want.x ? (want.x > 0 ? 'ArrowRight' : 'ArrowLeft') : (want.y > 0 ? 'ArrowDown' : 'ArrowUp')
      await page.keyboard.press(key)
    }
    await page.mouse.move(300 + (i % 5) * 40, 300)
    await page.waitForTimeout(200)
  }
  throw new Error('moins de 2 fruits croqués en 22 s')
})

/* 🚜 Course : sauter les obstacles, tenir 60 m avec au moins un cœur. */
await scenario('course-soixante-metres', async () => {
  await openGame('Course')
  for (let i = 0; i < 420; i++) {
    // Une décision par frame rendue : sous swiftshader la 3D tourne à 4 fps
    const st = await page.evaluate(() => new Promise(res => requestAnimationFrame(() => {
      const r = window.__run
      if (!r || !r.running) return res(null)
      // Sauter quand l'avant de l'obstacle arrive sur le tracteur dans 0,14 à 0,3 s
      // (l'entrée est appliquée à la frame suivante, soit 0,1 s de simulation)
      const near = r.obstacles.some(o => { const t = (o.x - o.hw - r.front) / r.speed; return t > 0.14 && t < 0.3 })
      res({ near, jumping: r.jumping, dist: Math.floor(r.dist), lives: r.lives })
    })))
    if (!st) throw new Error('partie terminée avant 60 m')
    if (st.dist >= 60 && st.lives >= 1) return
    if (st.near && !st.jumping) await page.keyboard.press('Space')
  }
  throw new Error('60 m non atteints')
})

/* 🐤 Poussin Volant : viser le milieu du passage, franchir 2 barrières. */
await scenario('poussin-deux-barrieres', async () => {
  await openGame('Poussin Volant')
  await page.keyboard.press('Space')
  for (let i = 0; i < 300; i++) {
    const st = await page.evaluate(() => new Promise(res => requestAnimationFrame(() => {
      const f = window.__fl
      if (!f || !f.running) return res(null)
      const next = f.pipes.find(p => p.x + p.hw > f.x - f.r)
      const target = next ? (next.lo + next.hi) / 2 : 0.3
      res({ y: f.y, vy: f.vy, target, score: f.score })
    })))
    if (!st) break
    if (st.score >= 2) return
    // Battre des ailes en bas du passage (un coup d'aile monte de 0,46 m),
    // jamais en pleine montée : l'entrée arrive avec une frame de retard
    const yNext = st.y + st.vy * 0.1
    if (st.vy < 0.5 && yNext < st.target - 0.2) await page.keyboard.press('Space')
  }
  throw new Error('moins de 2 barrières passées')
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

/* 🏔 La Tour de Glace : lâcher 3 blocs quand le balancier passe au centre. */
await scenario('tour-trois-blocs', async () => {
  await openGame('La Tour de Glace')
  await page.waitForSelector('.nj-loading', { state: 'detached', timeout: 20000 })
  await page.waitForTimeout(800)
  const box = await page.locator('#itArena').boundingBox()
  for (let k = 0; k < 3; k++) {
    let dropped = false
    for (let i = 0; i < 300; i++) {
      const x = await page.evaluate(() => window.__towerX)
      if (typeof x === 'number' && Math.abs(x) < 0.08) { await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); dropped = true; break }
      await page.waitForTimeout(16)
    }
    if (!dropped) throw new Error('le balancier ne passe jamais au centre')
    await page.waitForTimeout(1600)
  }
  const score = parseInt(await page.locator('.hud-score b').textContent())
  if (!(score >= 3)) throw new Error('score ' + score + ' après 3 blocs posés')
  if (errors.length) throw new Error('erreurs JS')
})

/* 🥷 Ninja Verger : balayer l'écran pendant 8 s, au moins 2 fruits tranchés. */
await scenario('ninja-tranche', async () => {
  await openGame('Ninja Verger')
  await page.waitForSelector('.nj-loading', { state: 'detached', timeout: 20000 })
  const box = await page.locator('#njArena').boundingBox()
  const cx = box.x + box.width / 2, cy = box.y + box.height * 0.55
  for (let k = 0; k < 24; k++) {
    await page.mouse.move(cx - box.width * 0.35, cy + 60)
    await page.mouse.down()
    for (let i = 1; i <= 8; i++) { await page.mouse.move(cx - box.width * 0.35 + i * box.width * 0.09, cy + 60 - i * 22); await page.waitForTimeout(12) }
    await page.mouse.up()
    await page.waitForTimeout(220)
    const score = parseInt(await page.locator('.hud-score b').textContent())
    if (score >= 2) return
  }
  throw new Error('moins de 2 fruits tranchés en 8 s')
})

/* 🔨 Tape-Trous : taper 8 animaux sortis (accroche window.__mole), aucun raté. */
await scenario('taupe-huit-animaux', async () => {
  await openGame('Tape-Trous')
  await page.waitForSelector('.nj-loading', { state: 'detached', timeout: 20000 })
  await page.waitForTimeout(600)
  let taps = 0
  for (let i = 0; i < 300 && taps < 8; i++) {
    const ready = await page.evaluate(() => window.__mole ? window.__mole.ready() : [])
    if (ready.length) { await page.mouse.click(ready[0].x, ready[0].y); taps++ }
    await page.waitForTimeout(60)
  }
  const score = parseInt(await page.locator('.hud-score b').textContent())
  if (taps < 8) throw new Error('seulement ' + taps + ' animaux sortis en 18 s')
  if (score < 8) throw new Error('score ' + score + ' pour 8 taps sur des animaux sortis')
  if (errors.length) throw new Error('erreurs JS')
})

/* 🌍 Le Tour du Monde : les vrais pays répondent à la bonne longitude/latitude,
   tous ont un continent, et la question de Trouve se pose bien. */
await scenario('tour-du-monde-vrais-pays', async () => {
  await openGame('Tour du Monde')
  await page.waitForSelector('.nj-loading', { state: 'detached', timeout: 30000 })
  await page.waitForTimeout(800)
  const r = await page.evaluate(() => ({
    paris: window.__geo.pick(2.35, 48.85), pekin: window.__geo.pick(116.4, 39.9), rio: window.__geo.pick(-43.2, -22.9),
    mer: window.__geo.pick(-30, 20), sans: window.__geo.unassigned().length
  }))
  if (r.paris !== 'France' || r.pekin !== 'China' || r.rio !== 'Brazil') throw new Error('pays faux : ' + JSON.stringify(r))
  if (r.mer !== null) throw new Error('la mer renvoie un pays')
  if (r.sans) throw new Error(r.sans + ' pays sans continent')
  await page.evaluate(() => window.__geo.setMode('trouve'))
  await page.waitForTimeout(300)
  const st = await page.evaluate(() => window.__geo.state())
  if (st.asked !== 1 || !st.target) throw new Error('pas de question posée')
  await page.evaluate(() => window.__geo.setMap('france'))
  await page.waitForTimeout(300)
  if ((await page.evaluate(() => window.__geo.state())).map !== 'france') throw new Error('la France ne s\'affiche pas')
  if (errors.length) throw new Error('erreurs JS')
})

/* 🧺 Attrape : suivre le fruit le plus bas avec le panier, en ramasser 6. */
await scenario('attrape-six-fruits', async () => {
  await openGame('Attrape')
  await page.waitForSelector('.nj-loading', { state: 'detached', timeout: 20000 })
  for (let i = 0; i < 400; i++) {
    const st = await page.evaluate(() => window.__catch ? window.__catch.state() : null)
    if (!st) throw new Error('pas d\'accroche __catch')
    if (st.over) throw new Error('partie finie trop tôt')
    const score = parseInt(await page.locator('.hud-score b').textContent())
    if (score >= 6) return
    const good = st.fruits.filter(f => !f.bad).sort((a, b) => a.y - b.y)[0]
    const bad = st.fruits.filter(f => f.bad).sort((a, b) => a.y - b.y)[0]
    let x = good ? good.x : st.basketX
    // Un piment plus bas que le fruit visé : on s'en écarte
    if (bad && (!good || bad.y < good.y) && Math.abs(bad.x - x) < 0.6) x = bad.x + (bad.x > 0 ? -0.9 : 0.9)
    await page.evaluate(x => window.__catch.want(x), x)
    await page.waitForTimeout(50)
  }
  throw new Error('moins de 6 fruits attrapés en 20 s')
})

await browser.close()
if (failures.length) {
  console.error(`\n${failures.length} scénario(s) en échec : ${failures.join(', ')}`)
  process.exit(1)
}
console.log('\nTous les bots ont gagné leur partie 🏆')
process.exit(0) // le serveur de preview garderait le process en vie
