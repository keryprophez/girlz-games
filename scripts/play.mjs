/* Bots de jeu : là où le smoke test vérifie que les jeux SE MONTENT, ces bots
   vérifient qu'on peut Y JOUER — rouler les boules du bonhomme jusqu'au bout,
   croquer des fruits à la chenille, passer
   des barrières au poussin, et que la sauce de la pizza tombe SOUS le doigt
   (régression du bug de coordonnées UV). Depuis le 22/09, chaque jeu du
   catalogue a son bot : Suites, Lettres, Miroir, Marché, Espace, Piano,
   Boîte à rythme, Feu d'artifice, l'Atelier et Habille-toi compris.

   Les jeux exposent leur état de pilotage seulement quand `window.__BOT` est
   posé avant le chargement — inerte en production.

   Usage : npm run build && npm run test:play
   (BOTS=poste,atelier npm run test:play pour n'en lancer que quelques-uns) */
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

/* L'accueil montre un univers à la fois (23/09) : on cherche la tuile onglet par onglet */
const clickTile = async name => {
  for (const w of ['jouer', 'apprendre', 'creer']) {
    await page.locator(`.hm-tab[data-w="${w}"]`).click()
    const t = page.locator('.gc', { hasText: name })
    if (await t.count()) { await t.first().click(); return }
  }
  throw new Error(`tuile introuvable : ${name}`)
}

const openGame = async (name, hook, tier = 'easy') => {
  errors.length = 0
  await page.goto(URL, { waitUntil: 'networkidle' })
  await clickTile(name)
  // Le niveau se choisit dans le jeu : les bots jouent en douce (sauf besoin)
  await page.locator('.tierbtn.tier-' + tier).click()
  await page.waitForTimeout(3200)
  // Un jeu 3D n'installe son accroche qu'une fois ses modèles chargés : sur
  // un serveur d'intégration lent, 3,2 s ne suffisent pas toujours (la
  // Course a échoué en CI sur sa PREMIÈRE sonde, faute de `__run`).
  if (hook) await page.waitForFunction(k => k in window, hook, { timeout: 30000 })
}

const failures = []
// BOTS=poste,bonhomme npm run test:play → seulement les scénarios dont le nom contient l'un des mots
const only = process.env.BOTS ? process.env.BOTS.split(',') : null
const scenario = async (name, fn) => {
  if (only && !only.some(k => name.includes(k))) return
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
  await openGame('Bonhomme de neige', '__sn')
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
  // Et la meilleure note du jeu est enregistrée (sous sa tuile à l'accueil)
  const best = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('ferme:v2') || '{}')
    return d.state?.progress?.jade?.bestStars?.snowman
  })
  if (typeof best !== 'number') throw new Error('meilleure note non enregistrée après la partie')
})

/* 🐛 La Chenille : piloter la tête vers les fruits, en croquer au moins 2. */
await scenario('chenille-croque-des-fruits', async () => {
  await openGame('La Chenille', '__cp')
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

/* 🐤 Poussin Volant : viser le milieu du passage, franchir 2 barrières. */
await scenario('poussin-deux-barrieres', async () => {
  await openGame('Poussin Volant', '__fl')
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
    for (let i = 0; i < 400; i++) {
      // Une lecture par frame : __towerX vaut NaN tant que le bloc précédent tombe
      const x = await page.evaluate(() => new Promise(res => requestAnimationFrame(() => res(window.__towerX))))
      if (typeof x === 'number' && Math.abs(x) < 0.12) { await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); dropped = true; break }
    }
    if (!dropped) throw new Error('le balancier ne passe jamais au centre')
    await page.waitForTimeout(400)
  }
  // Le troisième bloc met du temps à se poser (la 3D tourne au ralenti ici)
  let score = 0
  for (let i = 0; i < 60 && score < 3; i++) {
    await page.waitForTimeout(250)
    score = parseInt(await page.locator('.hud-score b').textContent()) || 0
  }
  if (!(score >= 3)) throw new Error('score ' + score + ' après 3 blocs posés')
  if (errors.length) throw new Error('erreurs JS')
})

/* 🌀 Labyrinthe : le chemin le plus court (BFS), tracé au doigt en peu de
   points — c'est le suivi de trait (Bresenham) qu'on vérifie, pas la patience. */
await scenario('labyrinthe-doigt-rapide', async () => {
  await openGame('Labyrinthe')
  await page.waitForFunction(() => window.__mz && window.__mz.n > 0, null, { timeout: 15000 })
  await page.waitForTimeout(600)
  const st = await page.evaluate(() => ({ grid: window.__mz.grid, n: window.__mz.n }))
  const n = st.n
  const D = [[0, -1], [1, 0], [0, 1], [-1, 0]]
  const prev = new Map([['0:0', null]])
  const queue = [[0, 0]]
  while (queue.length) {
    const [x, y] = queue.shift()
    if (x === n - 1 && y === n - 1) break
    for (let d = 0; d < 4; d++) {
      if (st.grid[y][x][d]) continue
      const k = (x + D[d][0]) + ':' + (y + D[d][1])
      if (!prev.has(k)) { prev.set(k, x + ':' + y); queue.push([x + D[d][0], y + D[d][1]]) }
    }
  }
  const path = []
  for (let k = (n - 1) + ':' + (n - 1); k; k = prev.get(k)) path.unshift(k.split(':').map(Number))
  if (path.length < 2) throw new Error('pas de chemin trouvé')
  // On ne passe le doigt que sur un point sur trois : les cases sautées
  // doivent être rattrapées par le suivi de trait
  const pts = await page.evaluate(p => p.map(([x, y]) => window.__mz.cellCenter(x, y)), path)
  await page.mouse.move(pts[0].x, pts[0].y)
  await page.mouse.down()
  for (let i = 1; i < pts.length; i += 3) { await page.mouse.move(pts[i].x, pts[i].y); await page.waitForTimeout(12) }
  await page.mouse.move(pts[pts.length - 1].x, pts[pts.length - 1].y)
  await page.mouse.up()
  // Le poussin MARCHE jusqu'à la poule (13 cases/s) : on lui laisse le temps d'arriver
  await page.waitForFunction(() => window.__mz.round >= 1, null, { timeout: 8000 })
    .catch(() => { throw new Error('la poule n\'a pas été retrouvée avec un doigt rapide') })
})

/* 🖼 Taquin : résoudre par recherche en largeur (grille 3×3, mélange court
   en douce), puis taper les tuiles dans l'ordre — l'écran de fin doit venir. */
await scenario('taquin-remis-en-ordre', async () => {
  await openGame('Taquin')
  await page.waitForFunction(() => window.__tq && window.__tq.cells, null, { timeout: 15000 })
  await page.waitForTimeout(500)
  const { cells, size } = await page.evaluate(() => ({ cells: window.__tq.cells, size: window.__tq.size }))
  const n = size * size
  const goal = [...Array(n - 1).keys()].map(i => i + 1).concat([0]).join(',')
  const key = a => a.join(',')
  const prev = new Map([[key(cells), null]])
  const queue = [cells]
  let found = null
  while (queue.length && !found) {
    const cur = queue.shift()
    const b = cur.indexOf(0), r = Math.floor(b / size), c = b % size
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr, nc = c + dc
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue
      const j = nr * size + nc
      const next = [...cur]; next[b] = next[j]; next[j] = 0
      const k = key(next)
      if (prev.has(k)) continue
      prev.set(k, { from: key(cur), tile: cur[j] })
      if (k === goal) { found = k; break }
      queue.push(next)
    }
    if (prev.size > 200000) throw new Error('taquin trop mélangé pour le bot')
  }
  if (!found) throw new Error('pas de solution trouvée')
  const taps = []
  for (let k = found; prev.get(k); k = prev.get(k).from) taps.unshift(prev.get(k).tile)
  for (const t of taps) { await page.evaluate(v => window.__tq.tap(v), t); await page.waitForTimeout(60) }
  await page.waitForTimeout(1500)
  const fini = await page.evaluate(() => document.body.innerText.includes('reconstituée'))
  if (!fini) throw new Error(`l'écran de fin n'est pas apparu après ${taps.length} coups`)
})

/* 🃏 Memory : le bot connaît le paquet, il retourne les paires dans l'ordre
   sur les trois manches — l'écran de fin doit venir. */
await scenario('memory-toutes-les-paires', async () => {
  await openGame('Memory', '__mem')
  await page.waitForFunction(() => window.__mem && window.__mem.deck.length > 0, null, { timeout: 30000 })
  const rounds = await page.evaluate(() => window.__mem.rounds)
  for (let r = 0; r < rounds; r++) {
    // La manche suivante est DISTRIBUÉE une seconde après la dernière paire : attendre le nouveau paquet
    await page.waitForFunction(rr => window.__mem.dealt === rr + 1 && !window.__mem.lock, r, { timeout: 15000 })
    const deck = await page.evaluate(() => window.__mem.deck)
    const seen = new Map()
    for (let i = 0; i < deck.length; i++) {
      if (seen.has(deck[i])) {
        // Une paire à la fois : les cartes 3D prennent le temps de se retourner
        await page.waitForFunction(() => !window.__mem.lock, null, { timeout: 10000 })
        await page.evaluate(([a, b]) => { window.__mem.flip(a); window.__mem.flip(b) }, [seen.get(deck[i]), i])
        await page.waitForTimeout(150)
      } else seen.set(deck[i], i)
    }
  }
  // (finDe est défini plus bas dans le script : zone morte si on l'appelle ici)
  await page.waitForFunction(() => document.querySelector('#result.show') && document.body.innerText.includes('paires trouvées'), null, { timeout: 12000 })
})

/* 🎵 Simon : le bot lit la mélodie sur le crochet et la rejoue, cinq tours. */
await scenario('simon-cinq-tours', async () => {
  await openGame('Simon')
  await page.waitForFunction(() => window.__simon, null, { timeout: 15000 })
  for (let tour = 0; tour < 5; tour++) {
    await page.waitForFunction(() => window.__simon.playerTurn, null, { timeout: 20000 })
    const seq = await page.evaluate(() => window.__simon.seq)
    for (const v of seq) { await page.evaluate(i => window.__simon.press(i), v); await page.waitForTimeout(120) }
    await page.waitForTimeout(300)
    const st = await page.evaluate(() => ({ best: window.__simon.best, over: window.__simon.over }))
    if (st.over) throw new Error('fausse note du bot au tour ' + (tour + 1))
  }
  const best = await page.evaluate(() => window.__simon.best)
  if (best < 5) throw new Error('mélodie de ' + best + ' notes seulement')
})

/* 🔴 Puissance 4 : contre la poule, le bot joue avec la même IA (profondeur 4)
   jusqu'à la fin de partie — l'écran de fin doit venir, quel que soit le vainqueur. */
await scenario('puissance4-contre-la-poule', async () => {
  await openGame('Puissance 4')
  await page.waitForFunction(() => window.__c4, null, { timeout: 15000 })
  await page.locator('.c4-mode[data-m="solo"]').click()
  await page.waitForTimeout(300)
  for (let i = 0; i < 42; i++) {
    const st = await page.evaluate(() => ({ over: window.__c4.over, turn: window.__c4.turn, lock: window.__c4.lock }))
    if (st.over) break
    if (st.turn === 0 && !st.lock) await page.evaluate(() => window.__c4.drop(window.__c4.ai(4)))
    await page.waitForTimeout(900)
  }
  await page.waitForTimeout(2200)
  const fini = await page.evaluate(() => /gagn|galit/.test(document.body.innerText))
  if (!fini) throw new Error('la partie contre la poule ne s\'est pas terminée')
})

/* 🕐 Quelle heure : mode « les heures », huit bonnes réponses lues sur le crochet. */
await scenario('horloge-huit-heures', async () => {
  await openGame('Quelle heure')
  await page.waitForFunction(() => window.__ck, null, { timeout: 15000 })
  await page.locator('.ck-tool[data-m="hours"]').click()
  for (let i = 0; i < 8; i++) {
    await page.waitForFunction(r => window.__ck.round === r && !window.__ck.lock, i, { timeout: 15000 })
    const h = await page.evaluate(() => window.__ck.h)
    await page.locator('.qopt', { hasText: new RegExp('^' + h + ' h$') }).click()
    await page.waitForTimeout(200)
  }
  await page.waitForTimeout(2200)
  const fini = await page.evaluate(() => document.body.innerText.includes('Maîtresse du temps'))
  if (!fini) throw new Error('l\'écran de fin de l\'horloge n\'est pas apparu')
})

/* 🥕 Le Potager : une récolte entière, douze caisses. Le bot se trompe une
   fois (deuxième question) pour faire jouer le « presque » et le nouvel
   essai, puis répond juste ; il attend que les réponses soient touchables
   (jamais une durée murale). */
await scenario('potager-recolte-douze-caisses', async () => {
  await openGame('Le Potager', '__pg')
  let wrongDone = false
  for (let i = 0; i < 40; i++) {
    await page.waitForFunction(() => window.__pg.ready || window.__pg.over, null, { timeout: 30000 })
    const s = await page.evaluate(() => ({ over: window.__pg.over, ans: window.__pg.answer, opts: window.__pg.opts, qi: window.__pg.qi, tries: window.__pg.tries }))
    if (s.over) break
    if (!wrongDone && s.qi === 1 && s.tries === 0 && s.opts.length) {
      wrongDone = true
      const ok = await page.evaluate(v => window.__pg.pick(v), s.opts.find(v => v !== s.ans))
      if (!ok) throw new Error('mauvaise réponse introuvable')
      continue
    }
    const ok = await page.evaluate(v => window.__pg.pick(v), s.ans)
    if (!ok) throw new Error(`réponse ${s.ans} introuvable`)
    await page.waitForFunction(q => window.__pg.qi !== q || window.__pg.over, s.qi, { timeout: 30000 })
  }
  if (!wrongDone) throw new Error('le presque n\'a pas été joué')
  await page.waitForFunction(() => document.body.innerText.includes('La récolte est rentrée'), null, { timeout: 15000 })
})

/* 🥕 Le Potager, Découvre : un vrai glissé du coin jusqu'à la case 7 × 8,
   le comptage par rangées jusqu'à 56, puis « Tourne » : 8 × 7, toujours 56. */
await scenario('potager-decouvre-et-pivot', async () => {
  await openGame('Le Potager', '__pg')
  await page.locator('.pg-tool[data-m="discover"]').click()
  const cell = (r, c) => page.evaluate(([r, c]) => window.__pg.cell(r, c), [r, c])
  const a = await cell(1, 1), b = await cell(7, 8)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y) * i / 8); await page.waitForTimeout(20) }
  await page.mouse.up()
  const rect = await page.evaluate(() => window.__pg.rect)
  if (rect[0] !== 7 || rect[1] !== 8) throw new Error(`rectangle ${rect} au lieu de 7 × 8`)
  await page.waitForFunction(() => !window.__pg.counting && document.querySelector('.pg-cell.res')?.textContent === '56', null, { timeout: 20000 })
  await page.locator('#pgPivot').click()
  await page.waitForFunction(() => {
    const [r, c] = window.__pg.rect
    return r === 8 && c === 7 && !window.__pg.counting && document.querySelector('.pg-cell.res')?.textContent === '56'
  }, null, { timeout: 20000 })
})

/* 🥕 Le Potager, Tableau : une case touchée montre son calcul. */
await scenario('potager-tableau', async () => {
  await openGame('Le Potager', '__pg')
  await page.locator('.pg-tool[data-m="table"]').click()
  const p = await page.evaluate(() => window.__pg.cell(6, 7))
  await page.mouse.click(p.x, p.y)
  await page.waitForFunction(() => [...document.querySelectorAll('.pg-cell.num')].some(el => el.textContent === '42'), null, { timeout: 5000 })
})

/* ➕ Grand Tableau + : la même chasse aux cases, sur la table d'addition. */
await scenario('tableau-plus-huit-cases', async () => {
  await openGame('Grand Tableau +')
  await page.waitForFunction(() => window.__tb, null, { timeout: 15000 })
  await page.locator('.tb-tool[data-m="find"]').click()
  for (let i = 0; i < 8; i++) {
    await page.waitForFunction(q => window.__tb.q === q && !window.__tb.lock, i, { timeout: 15000 })
    const ok = await page.evaluate(() => window.__tb.find(window.__tb.target))
    if (!ok) throw new Error('cible introuvable dans la grille')
    await page.waitForTimeout(200)
  }
  await page.waitForTimeout(2000)
  const fini = await page.evaluate(() => document.body.innerText.includes('Chasse aux cases'))
  if (!fini) throw new Error('l\'écran de fin du tableau + n\'est pas apparu')
})

/* 🔍 L'Intrus : six manches, l'intrus lu sur le crochet. */
await scenario('intrus-six-manches', async () => {
  await openGame("L'Intrus")
  await page.waitForFunction(() => window.__int && window.__int.intruder >= 0, null, { timeout: 15000 })
  for (let i = 0; i < 6; i++) {
    await page.waitForFunction(r => window.__int.round === r && !window.__int.lock, i, { timeout: 15000 })
    const k = await page.evaluate(() => window.__int.intruder)
    await page.locator(`.itile[data-i="${k}"]`).click()
    await page.waitForTimeout(200)
  }
  await page.waitForTimeout(2200)
  const fini = await page.evaluate(() => document.body.innerText.includes('inspectrice'))
  if (!fini) throw new Error('l\'écran de fin de l\'Intrus n\'est pas apparu')
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

/* 🥷 À deux (23/09) : deux doigts en même temps, chacun sa lame, un seul
   score. Avant, le second doigt faisait sauter l'unique lame d'un bout de
   l'écran à l'autre. On choisit « à deux », puis deux balayages simultanés
   (événements pointeur synthétiques : Playwright n'a qu'une souris). */
await scenario('ninja-a-deux', async () => {
  errors.length = 0
  await page.goto(URL, { waitUntil: 'networkidle' })
  await clickTile('Ninja Verger')
  await page.locator('.duobtn[aria-label="À deux"]').click()
  await page.locator('.tierbtn.tier-easy').click()
  await page.waitForFunction(() => window.__nj, null, { timeout: 30000 })
  if (!(await page.evaluate(() => window.__nj.duo))) throw new Error('le mode à deux n\'est pas passé au jeu')
  const box = await page.locator('#njArena').boundingBox()
  let deux = false
  for (let k = 0; k < 24; k++) {
    const vu = await page.evaluate(async ({ b, k }) => {
      const cv = document.querySelector('#njArena canvas:not(#njBlade)') // le canvas 3D, pas la lame
      const ev = (type, id, x, y, target) => target.dispatchEvent(new PointerEvent(type, {
        pointerId: id, pointerType: 'touch', isPrimary: id === 11, clientX: x, clientY: y, bubbles: true
      }))
      const y0 = b.y + b.height * (0.62 + (k % 3) * 0.06)
      const L = b.x + b.width * 0.08, R = b.x + b.width * 0.92
      ev('pointerdown', 11, L, y0, cv)
      ev('pointerdown', 12, R, y0, cv)
      let both = 0
      for (let i = 1; i <= 10; i++) {
        ev('pointermove', 11, L + i * b.width * 0.04, y0 - i * 24, window)
        ev('pointermove', 12, R - i * b.width * 0.04, y0 - i * 24, window)
        both = Math.max(both, window.__nj.blades())
        await new Promise(r => requestAnimationFrame(r))
      }
      ev('pointerup', 11, 0, 0, window)
      ev('pointerup', 12, 0, 0, window)
      return both
    }, { b: box, k })
    if (vu >= 2) deux = true
    await page.waitForTimeout(200)
    const score = parseInt(await page.locator('.hud-score b').textContent())
    if (score >= 2 && deux) break
    if (k === 23) throw new Error(`à deux : score ${score}, deux lames vues : ${deux}`)
  }
  if ((await page.evaluate(() => window.__nj.blades())) !== 0) throw new Error('une lame reste accrochée après les doigts levés')
  await page.evaluate(() => localStorage.removeItem('ferme:duo:ninja'))
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

/* 📮 La Poste aux Phrases : une partie entière dans CHACUN des trois modes,
   sans une seule erreur. Le bot lit la réponse attendue dans `window.__po` ;
   elle vaut `null` pendant l'animation de réponse, donc il attend au lieu de
   doubler ses clics (piège des bots à 4 fps). Une partie finie ouvre l'écran
   de fin : on rouvre le jeu pour le mode suivant. */
for (const [mode, titre] of [['type', 'tamponné'], ['phrase', 'tamponné'], ['point', 'tamponné']]) {
  await scenario(`poste-${mode}`, async () => {
    await openGame('Poste aux Phrases')
    const st = () => page.evaluate(() => (window.__po ? window.__po.state() : null))
    if (!(await st())) throw new Error("pas d'accroche __po")
    await page.evaluate(m => window.__po.setMode(m), mode)
    await page.waitForTimeout(400)
    for (let i = 0; i < 240; i++) {
      const s = await st()
      if (!s || s.done >= s.total) break
      if (!s.answer) { await page.waitForTimeout(120); continue }
      const cible = page.locator(`[data-a="${s.answer}"]`).first()
      if (!(await cible.count())) throw new Error(`réponse « ${s.answer} » sans bouton (mode ${mode})`)
      await cible.click()
      await page.waitForTimeout(160)
    }
    const f = await st()
    if (!f) throw new Error(`mode ${mode} : le jeu a été démonté en cours de partie`)
    if (f.done < f.total) throw new Error(`mode ${mode} : ${f.done}/${f.total} manches gagnées`)
    if (f.mistakes) throw new Error(`mode ${mode} : ${f.mistakes} erreur(s) alors que le bot connaît la réponse`)
    // 1,5 s avant la manche suivante + 900 ms d'outro avant l'écran de score
    await page.waitForTimeout(3600)
    if (!(await page.evaluate(() => document.body.innerText)).includes(titre)) {
      throw new Error(`mode ${mode} : l'écran de fin n'est pas apparu`)
    }
    if (errors.length) throw new Error('erreurs JS')
  })
}

/* ── Bots du 22/09 : les jeux qui n'étaient surveillés par personne ── */
const finDe = async (texte, ms = 9000) => {
  await page.waitForFunction(t => document.querySelector('#result.show') && document.body.innerText.includes(t), texte, { timeout: ms })
}

/* 🍕 La Pizzeria, refaite le 23/09 : la partie entière. Du fromage au doigt,
   au four, sortie DANS la zone parfaite (une sortie trop tôt ne sort pas),
   la pizza se coupe, et on croque les six parts jusqu'à l'écran de fin. */
await scenario('pizza-du-four-a-la-bouche', async () => {
  // En expert, la cuisson dure 5 s simulées au lieu de 11 : sous swiftshader
  // en CI (2 à 3 images/s, dt borné à 100 ms), la douce dépassait la minute
  await openGame('La Pizzeria', '__pz', 'exp')
  const cv = await page.locator('#pzArena canvas').first().boundingBox()
  const cx = cv.x + cv.width / 2, cy = cv.y + cv.height / 2
  await page.locator('.pz-bowl[data-t="cheese"]').click()
  await page.mouse.move(cx - 120, cy); await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(cx - 120 + i * 20, cy + Math.sin(i) * 40)
  await page.mouse.up()
  await page.waitForFunction(() => window.__pz.pieces >= 4, null, { timeout: 10000 })
  await page.locator('#pzOven').click()
  await page.waitForFunction(() => window.__pz.phase === 'cuisson', null, { timeout: 5000 })
  // Trop tôt : elle ne sort pas
  await page.locator('#pzOut').click({ force: true })
  if (await page.evaluate(() => window.__pz.phase) !== 'cuisson') throw new Error('sortie trop tôt acceptée')
  await page.waitForFunction(() => window.__pz.bake > window.__pz.from + 0.04, null, { timeout: 150000 })
  await page.locator('#pzOut').click({ force: true })
  await page.waitForFunction(() => window.__pz.phase === 'servi' && window.__pz.cut >= 3, null, { timeout: 15000 })
  for (let i = 0; i < 40; i++) {
    const n = await page.evaluate(() => window.__pz.eaten)
    if (n >= 6) break
    const s = await page.evaluate(() => window.__pz.slices())
    if (s.length) await page.mouse.click(s[0].x, s[0].y)
    await page.waitForTimeout(700)
  }
  await finDe('Pizza dévorée', 15000)
})

/* 🔷 Suites logiques : six manches, la bonne forme lue sur le crochet. */
await scenario('suites-six-manches', async () => {
  await openGame('Suites Logiques', '__pt')
  for (let i = 0; i < 6; i++) {
    await page.waitForFunction(r => window.__pt.round === r && !window.__pt.lock, i, { timeout: 15000 })
    const k = await page.evaluate(() => window.__pt.answer)
    await page.locator(`.pt-opt[data-key="${k}"]`).click()
    await page.waitForTimeout(150)
  }
  await finDe('Sacré sens logique')
})

/* 🔤 Chasse aux lettres : trois mots, lettre après lettre (la lettre vole). */
await scenario('lettres-trois-mots', async () => {
  await openGame('Chasse aux lettres', '__lg')
  for (let r = 0; r < 3; r++) {
    await page.waitForFunction(k => window.__lg.round === k && !window.__lg.peeking && window.__lg.pos === 0, r, { timeout: 15000 })
    const word = await page.evaluate(() => window.__lg.word)
    for (const ch of word) {
      await page.locator(`.lg-tile:not(.used)[data-ch="${ch}"]`).first().click()
      await page.waitForTimeout(120)
    }
  }
  await finDe('Tous les mots trouvés')
})

/* 🪞 Le Miroir : trois motifs peints au doigt (couleur choisie, puis case). */
await scenario('miroir-trois-motifs', async () => {
  await openGame('Le Miroir', '__mr')
  for (let r = 0; r < 3; r++) {
    await page.waitForFunction(k => window.__mr.round === k && !window.__mr.done, r, { timeout: 15000 })
    const need = await page.evaluate(() => window.__mr.need)
    for (const { k, color } of need) {
      await page.evaluate(c => window.__mr.pick(c), color)
      await page.locator(`.mr-free[data-k="${k}"]`).click()
      await page.waitForTimeout(60)
    }
    await page.waitForFunction(() => window.__mr.done || window.__mr.round > 0, null, { timeout: 5000 })
  }
  await finDe('Miroir, joli miroir')
})

/* 💶 Le Marché : quatre paiements exacts, pièces choisies de la plus grosse
   à la plus petite (le bot rend la monnaie comme un marchand). */
await scenario('marche-quatre-paiements', async () => {
  await openGame('Le Marché', '__mk')
  await page.locator('.mk-mode[data-m="pay"]').click()
  for (let q = 0; q < 4; q++) {
    await page.waitForFunction(k => window.__mk.q === k && !window.__mk.lock && window.__mk.goal > 0, q, { timeout: 15000 })
    const denoms = await page.$$eval('#mkBank .mk-coin', els => els.map(e => +e.dataset.v).sort((a, b) => b - a))
    let reste = await page.evaluate(() => window.__mk.goal)
    for (const v of denoms) {
      while (reste >= v) { await page.locator(`#mkBank .mk-coin[data-v="${v}"]`).click(); reste -= v; await page.waitForTimeout(80) }
    }
    if (reste) throw new Error('prix impossible à payer avec la banque : reste ' + reste)
  }
  await finDe('Le compte est bon')
})

/* 🚀 Voyage dans l'Espace : les huit planètes visitées par les billes, puis
   la fête et l'écran de fin. */
await scenario('espace-huit-planetes', async () => {
  await openGame("Voyage dans l'Espace")
  await page.waitForSelector('.nj-loading', { state: 'detached', timeout: 30000 })
  await page.waitForSelector('.sp3-pick', { timeout: 20000 })
  for (const id of ['mercure', 'venus', 'terre', 'mars', 'jupiter', 'saturne', 'uranus', 'neptune']) {
    await page.locator(`.sp3-pick[data-id="${id}"]`).click({ force: true })
    await page.waitForSelector('.sp3-card:not(.off)', { timeout: 30000 })
    await page.locator('.sp3-home').click({ force: true })
    await page.waitForTimeout(200)
  }
  await finDe('Astronaute', 20000)
})

/* 🎹 Petit Piano : « Au clair de la lune » jouée en suivant la touche qui brille. */
await scenario('piano-une-chanson', async () => {
  await openGame('Petit Piano')
  await page.locator('.pn-mode[data-s="0"]').click()
  for (let i = 0; i < 40; i++) {
    if (await page.locator('.pn-score.won').count()) break
    await page.locator('.pkey.pulse').first().dispatchEvent('pointerdown')
    await page.waitForTimeout(90)
  }
  if (!(await page.locator('.pn-score.won').count())) throw new Error('la chanson ne s\'est pas finie')
  await finDe('Quelle musicienne')
})

/* 🥁 Boîte à rythme : un air tout fait, la tête de lecture tourne, les
   animaux chantent, puis « fini ». */
await scenario('rythme-un-air', async () => {
  await openGame('Boîte à Rythme')
  await page.locator('#bbP1').click()
  await page.waitForFunction(() => document.querySelector('.bb-cell.now') && document.querySelector('.bb-head.on'), null, { timeout: 5000 })
  await page.waitForFunction(() => document.querySelector('.bb-animal.sing'), null, { timeout: 5000 })
  await page.locator('#bbDone').click()
  await finDe('Quel orchestre')
})

/* 🎆 Feu d'artifice : huit fusées, puis le bouquet final jusqu'à la fin. */
await scenario('feu-bouquet-final', async () => {
  await openGame("Feu d'Artifice")
  const box = await page.locator('#fwArena').boundingBox()
  for (let i = 0; i < 8; i++) {
    await page.mouse.click(box.x + box.width * (0.2 + 0.08 * i), box.y + box.height * 0.3)
    await page.waitForTimeout(120)
  }
  // Le bouton du bouquet bat sans arrêt : Playwright ne le verrait jamais « stable »
  await page.locator('#fwFinal').click({ force: true })
  await finDe('Quel spectacle', 15000)
})

/* 🎨 L'Atelier et 👗 Habille-toi : les deux créations vont jusqu'à leur fin.
   L'Atelier : un trait au doigt, un tampon, le papillon rempli au pot de
   peinture, un « annuler » — et la peinture doit être sur la feuille. */
await scenario('atelier-papillon', async () => {
  await openGame("L'Atelier", '__at')
  const box = await page.locator('#atPaint').boundingBox()
  const X = f => box.x + box.width * f, Y = f => box.y + box.height * f
  await page.mouse.move(X(0.15), Y(0.5))
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(X(0.15 + i * 0.05), Y(0.5 + Math.sin(i / 2) * 0.1))
  await page.mouse.up()
  await page.locator('.at-tool[data-t="stamp"]').click()
  await page.locator('.at-stamp img').first().waitFor({ timeout: 20000 })
  await page.mouse.click(X(0.3), Y(0.8))
  await page.locator('.at-page[data-p="papillon"]').click()
  await page.locator('.at-tool[data-t="brush"]').click()
  await page.locator('.at-color[data-c="#FFA94D"]').click()
  await page.locator('.at-tool[data-t="bucket"]').click()
  await page.waitForTimeout(600)
  // L'aile gauche du papillon (x 130 du dessin 400 × 300, centré dans 450 × 300)
  await page.mouse.click(X(155 / 450), Y(120 / 300))
  await page.waitForFunction(() => window.__at.marks >= 3 && !window.__at.pouring, null, { timeout: 5000 })
  const avant = await page.evaluate(() => window.__at.painted())
  if (avant < 0.04) throw new Error(`le pot de peinture n'a rien rempli (${avant})`)
  await page.locator('#atUndo').click()
  const apres = await page.evaluate(() => window.__at.painted())
  if (apres > 0.001) throw new Error(`« annuler » n'a pas effacé le remplissage (${apres})`)
  await page.locator('#atDone').click()
  await finDe('Chef-d')
})
await scenario('habille-toi-surprise', async () => {
  await openGame('Habille-toi')
  await page.locator('#duRandom').click()
  await page.locator('#duDone').click()
  await finDe('Superbe look')
})

await browser.close()
if (failures.length) {
  console.error(`\n${failures.length} scénario(s) en échec : ${failures.join(', ')}`)
  process.exit(1)
}
console.log('\nTous les bots ont gagné leur partie 🏆')
process.exit(0) // le serveur de preview garderait le process en vie
