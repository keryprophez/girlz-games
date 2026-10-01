/* Bots de jeu : là où le smoke test vérifie que les jeux SE MONTENT, ces bots
   vérifient qu'on peut Y JOUER — croquer des fruits à la chenille, passer
   des barrières au poussin, et que la sauce de la pizza tombe SOUS le doigt
   (régression du bug de coordonnées UV). Depuis le 22/09, chaque jeu du
   catalogue a son bot : Suites, Lettres, Miroir, Marché, Espace, Piano,
   Feu d'artifice, l'Atelier et la Princesse compris.

   Les jeux exposent leur état de pilotage seulement quand `window.__BOT` est
   posé avant le chargement — inerte en production.

   Usage : npm run build && npm run test:play
   (BOTS=poste,atelier npm run test:play pour n'en lancer que quelques-uns) */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

// PORT=4197 : à côté des bots d'une autre session (voir CLAUDE.md)
const PORT = Number(process.env.PORT || 4189)
const URL = `http://localhost:${PORT}/girlz-games/`

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
// THROTTLE=4 npm run test:play → processeur ralenti ×4, pour jouer comme sur
// le serveur d'intégration (plus lent que la session : pilotes à éprouver)
if (process.env.THROTTLE) {
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE) })
}
const errors = []
page.on('pageerror', e => errors.push(String(e)))
// Les erreurs de console ne font pas échouer un bot, mais disent pourquoi il attend
const consoleErrs = []
page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 200)) })

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

const openGame = async (name, hook, tier = 'easy', ops = null) => {
  errors.length = 0
  await page.goto(URL, { waitUntil: 'networkidle' })
  await clickTile(name)
  // Un jeu à calculs (le Potager, 27/09) demande d'abord ses opérations :
  // on allume exactement celles voulues (sinon celles par défaut), on passe
  await page.locator('.opsgo, .tierbtn.tier-' + tier).first().waitFor()
  if (await page.locator('.opsgo').count()) {
    if (ops) {
      // Allumer d'abord (la dernière allumée ne s'éteint pas), puis éteindre
      for (const o of ops) if (!(await page.locator(`.opsbtn[data-op="${o}"].sel`).count())) await page.locator(`.opsbtn[data-op="${o}"]`).click()
      for (const o of ['add', 'sub', 'mul', 'div']) if (!ops.includes(o) && await page.locator(`.opsbtn[data-op="${o}"].sel`).count()) await page.locator(`.opsbtn[data-op="${o}"]`).click()
    }
    await page.locator('.opsgo').click()
  }
  // Le niveau se choisit dans le jeu : les bots jouent en douce (sauf besoin)
  await page.locator('.tierbtn.tier-' + tier).click()
  await page.waitForTimeout(3200)
  // Un jeu 3D n'installe son accroche qu'une fois ses modèles chargés : sur
  // un serveur d'intégration lent, 3,2 s ne suffisent pas toujours (la
  // Course a échoué en CI sur sa PREMIÈRE sonde, faute de `__run`).
  // Sondé toutes les demi-secondes, pas à chaque image : une page qui
  // compile ses shaders espace ses images de plusieurs secondes
  if (hook) await page.waitForFunction(k => k in window, hook, { timeout: 90000, polling: 500 })
}

const failures = []
// BOTS=poste,chenille npm run test:play → seulement les scénarios dont le nom contient l'un des mots
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

/* 🌀 Labyrinthe : le poussin ne prend JAMAIS un virage tout seul (27/09 :
   « il suit le doigt et fait tout seul les virages ») — un doigt qui saute
   un coin le laisse sur sa ligne (au plus un pas) ; puis le doigt passe par
   chaque coin du chemin, et le poussin rejoint la poule. */
await scenario('labyrinthe-virages-au-doigt', async () => {
  await openGame('Labyrinthe')
  await page.waitForFunction(() => window.__mz && window.__mz.n > 0, null, { timeout: 15000 })
  await page.waitForTimeout(600)
  const D = [[0, -1], [1, 0], [0, 1], [-1, 0]]
  const route = async () => {
    const st = await page.evaluate(() => ({ grid: window.__mz.grid, n: window.__mz.n, pos: window.__mz.pos }))
    const n = st.n, start = st.pos.x + ':' + st.pos.y
    const prev = new Map([[start, null]])
    const queue = [[st.pos.x, st.pos.y]]
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
    // Les coins : là où le chemin change de direction
    const corners = [path[0]]
    for (let i = 1; i < path.length - 1; i++) {
      const a = [path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]], b = [path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]]
      if (a[0] !== b[0] || a[1] !== b[1]) corners.push(path[i])
    }
    corners.push(path[path.length - 1])
    return corners
  }
  const center = ([x, y]) => page.evaluate(([x, y]) => window.__mz.cellCenter(x, y), [x, y])
  let corners = await route()
  if (corners.length < 3) throw new Error(`labyrinthe sans virage (${corners.length} points)`)
  // 1) Sauter un coin : du poussin, le doigt file droit sur le 2e coin
  let p = await center(corners[0])
  await page.mouse.move(p.x, p.y)
  await page.mouse.down()
  p = await center(corners[2])
  await page.mouse.move(p.x, p.y)
  await page.waitForTimeout(500)
  await page.mouse.up()
  const pos = await page.evaluate(() => window.__mz.pos)
  if (Math.abs(pos.x - corners[0][0]) + Math.abs(pos.y - corners[0][1]) > 1) throw new Error(`le poussin a pris un virage tout seul : (${pos.x}, ${pos.y})`)
  // 2) Le vrai tracé : le doigt tourne à chaque coin
  corners = await route()
  p = await center(corners[0])
  await page.mouse.move(p.x, p.y)
  await page.mouse.down()
  for (const c of corners.slice(1)) { p = await center(c); await page.mouse.move(p.x, p.y); await page.waitForTimeout(40) }
  await page.mouse.up()
  // Le poussin MARCHE jusqu'à la poule (13 cases/s) : on lui laisse le temps d'arriver
  await page.waitForFunction(() => window.__mz.round >= 1, null, { timeout: 12000 })
})

/* 🖼 Taquin : résoudre par recherche en largeur (grille 3×3 à la fleur :
   181 440 positions au plus), puis taper les tuiles dans l'ordre — l'écran de fin doit venir. */
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
  // Et la meilleure note du jeu est enregistrée (sous sa tuile à l'accueil) —
  // vérifiée ici depuis que le Bonhomme de neige est sorti (28/09)
  const best = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('ferme:v2') || '{}')
    return d.state?.progress?.jade?.bestStars?.memory
  })
  if (typeof best !== 'number') throw new Error('meilleure note non enregistrée après la partie')
})

/* 🎵 Le Chœur (l'ancien Simon, 25/09) : le bot lit la mélodie sur le crochet
   et la rejoue jusqu'à la chanson complète (10 notes à la fleur), avec UNE
   fausse note exprès au troisième tour : elle coûte un cœur, et la MÊME
   mélodie doit revenir. La fin est le concert, puis l'écran de fin. */
await scenario('choeur-chanson-complete', async () => {
  await openGame('Le Chœur')
  await page.waitForFunction(() => window.__simon, null, { timeout: 15000 })
  const info = await page.evaluate(() => ({ pads: window.__simon.pads, goal: window.__simon.goal, lives: window.__simon.lives }))
  if (info.pads !== 5 || info.goal !== 10) throw new Error(`à la fleur : ${info.pads} animaux, chanson de ${info.goal}`)
  let fausse = false
  for (let tour = 0; tour < 30; tour++) {
    await page.waitForFunction(() => window.__simon.playerTurn || window.__simon.over, null, { timeout: 30000 })
    const st = await page.evaluate(() => ({ seq: window.__simon.seq, over: window.__simon.over, lives: window.__simon.lives }))
    if (st.over) break
    if (!fausse && st.seq.length === 3) {
      fausse = true
      await page.evaluate(v => window.__simon.press((v + 1) % 4), st.seq[0])
      await page.waitForFunction(() => window.__simon.playerTurn || window.__simon.over, null, { timeout: 30000 })
      const apres = await page.evaluate(() => ({ seq: window.__simon.seq, lives: window.__simon.lives, over: window.__simon.over }))
      if (apres.over || apres.lives !== info.lives - 1) throw new Error(`fausse note : ${apres.lives} cœurs, partie finie ${apres.over}`)
      if (apres.seq.join() !== st.seq.join()) throw new Error('après une fausse note, la mélodie a changé')
      continue
    }
    for (const v of st.seq) { await page.evaluate(i => window.__simon.press(i), v); await page.waitForTimeout(120) }
  }
  if (!fausse) throw new Error('la fausse note exprès n\'a pas été jouée')
  await page.waitForSelector('.result-score', { timeout: 20000 })
  const fin = await page.evaluate(() => ({ best: window.__simon.best, txt: document.body.innerText }))
  if (fin.best < 10 || !fin.txt.includes('Quel concert')) throw new Error(`fin sans la chanson complète (${fin.best} notes)`)
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

/* 🥕 Le Potager (× seul), Récolte : douze caisses jusqu'à l'écran de fin.
   La mémoire est préparée avec deux calculs ratés (niveau « découverte »,
   l'aide la plus forte) : à AUCUN moment la réponse ne doit être écrite
   avant qu'elle choisisse (25/09 : elle l'était, le comptage des rangées
   allait jusqu'au bout). Une mauvaise réponse exprès : la bonne s'écrit en
   vert, puis on passe au calcul suivant, sans nouvel essai. */
await scenario('potager-recolte-douze-caisses', async () => {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.setItem('ferme:faits:potager', JSON.stringify({
    v: 1, games: 3, facts: { '2x5': { lv: 0, last: 2, gap: 0, seen: 1 }, '5x10': { lv: 0, last: 2, gap: 0, seen: 1 } }
  })))
  await openGame('Le Potager', '__pg', 'easy', ['mul'])
  await page.locator('.pg-tool[data-m="harvest"]').click()
  let wrongDone = false, decouverte = 0
  for (let i = 0; i < 40; i++) {
    await page.waitForFunction(() => window.__pg.ready || window.__pg.over, null, { timeout: 30000 })
    const s = await page.evaluate(() => ({
      over: window.__pg.over, ans: window.__pg.answer, opts: window.__pg.opts, qi: window.__pg.qi,
      tries: window.__pg.tries, view: window.__pg.view, op: window.__pg.op,
      res: !!document.querySelector('.pg-cell.res'), ask: !!document.querySelector('.pg-cell.q'),
      nums: [...document.querySelectorAll('.pg-cell .pg-n')].map(n => n.textContent)
    }))
    if (s.over) break
    if (s.res) throw new Error(`question ${s.qi} : un résultat est déjà affiché avant le choix`)
    if (s.op === 'mul' && s.nums.includes(String(s.ans))) throw new Error(`question ${s.qi} : la réponse ${s.ans} est écrite avant le choix`)
    if (s.view === 0 && s.op === 'mul') {
      decouverte++
      if (!s.ask) throw new Error(`question ${s.qi} : le comptage n'a pas laissé son « ? »`)
    }
    if (!wrongDone && s.qi === 1 && s.opts.length) {
      wrongDone = true
      const ok = await page.evaluate(v => window.__pg.pick(v), s.opts.find(v => v !== s.ans))
      if (!ok) throw new Error('mauvaise réponse introuvable')
      // La bonne réponse s'écrit en vert (le bon bouton aussi), puis on passe au calcul suivant
      await page.waitForFunction(a => document.querySelector('.pg-opt.good')?.dataset.v === String(a) &&
        document.querySelector('#pgQ .ok')?.textContent === String(a), s.ans, { timeout: 20000 })
      await page.waitForFunction(() => window.__pg.qi === 2 && window.__pg.ready, null, { timeout: 20000 })
      continue
    }
    const ok = await page.evaluate(v => window.__pg.pick(v), s.ans)
    if (!ok) throw new Error(`réponse ${s.ans} introuvable`)
    await page.waitForFunction(q => window.__pg.qi !== q || window.__pg.over, s.qi, { timeout: 30000 })
  }
  if (!wrongDone) throw new Error('le presque n\'a pas été joué')
  if (!decouverte) throw new Error('aucune question à l\'aide « découverte » : la mémoire préparée n\'a pas pris')
  await page.waitForFunction(() => document.body.innerText.includes('La récolte est rentrée'), null, { timeout: 15000 })
  await page.evaluate(() => localStorage.removeItem('ferme:faits:potager'))
})

/* 🥕 Le Potager (× seul), Découvre : un vrai glissé du coin jusqu'à la case
   7 × 8, le comptage par rangées jusqu'à 56 ; puis les plantes s'en vont et
   56 RESTE écrit dans sa case (retour de Joyce, 27/09) ; « Tourne » : 8 × 7,
   toujours 56, et deux résultats gardés. */
await scenario('potager-decouvre-et-pivot', async () => {
  await openGame('Le Potager', '__pg', 'easy', ['mul'])
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
  // Les plantes s'en vont, le résultat reste, en gros, sans plante dessous
  await page.waitForFunction(() => !document.querySelector('.pg-cell.pl') &&
    document.querySelector('.pg-cell[data-r="7"][data-c="8"] .pg-k')?.textContent === '56', null, { timeout: 10000 })
  await page.locator('#pgPivot').click()
  await page.waitForFunction(() => {
    const [r, c] = window.__pg.rect
    return r === 8 && c === 7 && !window.__pg.counting && document.querySelector('.pg-cell.res')?.textContent === '56'
  }, null, { timeout: 20000 })
  await page.waitForFunction(() => window.__pg.found === 2 && window.__pg.kept === 2, null, { timeout: 10000 })
})

/* 🥕 Le Potager (+ seul), le PARCOURS complet (27/09) : 10 cases découvertes
   au doigt (dans les tables du niveau ; chacune garde son résultat), puis
   10 questions à 4 choix, 10 au pavé, 10 « trouve la case », jusqu'à l'écran
   de fin. Une erreur exprès à l'étape des 4 choix : la bonne réponse, puis
   la suite. La réponse n'est jamais écrite avant le choix. */
await scenario('potager-parcours-plus', async () => {
  await openGame('Le Potager', '__pg', 'easy', ['add'])
  const st = () => page.evaluate(() => ({
    stage: window.__pg.stage, tiles: window.__pg.tiles, ready: window.__pg.ready, over: window.__pg.over,
    ans: window.__pg.answer, opts: window.__pg.opts, find: window.__pg.find, i: window.__pg.pathI, op: window.__pg.op,
    res: !!document.querySelector('.pg-cell.res'), fam: window.__pg.fam
  }))
  if ((await st()).fam !== 'add') throw new Error('la grille n\'est pas celle des additions')
  // Étape 1 : dix cases ouvertes, touchées une à une
  const picks = await page.evaluate(() => {
    const out = []
    for (let r = 1; r <= 10 && out.length < 10; r++) for (let c = 1; c <= 10 && out.length < 10; c += 3) if (window.__pg.open(r, c)) out.push([r, c])
    return out
  })
  for (let k = 0; k < picks.length; k++) {
    const p = await page.evaluate(([r, c]) => window.__pg.cell(r, c), picks[k])
    await page.mouse.click(p.x, p.y)
    await page.waitForFunction(n => window.__pg.tiles > n, k, { timeout: 20000 })
  }
  await page.waitForFunction(() => window.__pg.kept >= 10 || window.__pg.stage > 0, null, { timeout: 15000 })
  let wrong = false
  for (let n = 0; n < 60; n++) {
    await page.waitForFunction(() => window.__pg.ready || window.__pg.over, null, { timeout: 30000 })
    const s = await st()
    if (s.over) break
    if (s.stage < 1) throw new Error(`toujours à l'étape de découverte (${s.tiles} cases)`)
    if (s.res) throw new Error(`étape ${s.stage}, question ${s.i} : un résultat est affiché avant le choix`)
    if (s.stage === 3) {
      const rc = await page.evaluate(v => window.__pg.where(v), s.find)
      if (!rc) throw new Error(`le nombre ${s.find} n'est nulle part dans la grille`)
      const p = await page.evaluate(([r, c]) => window.__pg.cell(r, c), rc)
      await page.mouse.click(p.x, p.y)
    } else if (!wrong && s.stage === 1 && s.opts.length) {
      wrong = true
      await page.evaluate(v => window.__pg.pick(v), s.opts.find(v => v !== s.ans))
      await page.waitForFunction(a => document.querySelector('#pgQ .ok')?.textContent === String(a), s.ans, { timeout: 20000 })
    } else {
      const ok = await page.evaluate(v => window.__pg.pick(v), s.ans)
      if (!ok) throw new Error(`étape ${s.stage} : réponse ${s.ans} introuvable`)
    }
    await page.waitForFunction(([stage, i]) => window.__pg.over || window.__pg.stage !== stage || window.__pg.pathI !== i, [s.stage, s.i], { timeout: 30000 })
  }
  await page.waitForFunction(() => document.body.innerText.includes('Le parcours est fini'), null, { timeout: 15000 })
  const good = await page.evaluate(() => window.__pg.good)
  if (good !== 29) throw new Error(`${good} bonnes réponses sur 30 au lieu de 29`)
})

/* 🥕 Le Potager, les QUATRE opérations en flamme : la Récolte mêle + − × ÷,
   la grille passe d'un tableau à l'autre, douze caisses jusqu'à la fin. */
await scenario('potager-recolte-quatre-operations', async () => {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.removeItem('ferme:faits:potager'))
  await openGame('Le Potager', '__pg', 'exp', ['add', 'sub', 'mul', 'div'])
  await page.locator('.pg-tool[data-m="harvest"]').click()
  const seen = new Set(), fams = new Set()
  for (let i = 0; i < 30; i++) {
    await page.waitForFunction(() => window.__pg.ready || window.__pg.over, null, { timeout: 30000 })
    const s = await page.evaluate(() => ({
      over: window.__pg.over, ans: window.__pg.answer, qi: window.__pg.qi, op: window.__pg.op, fam: window.__pg.fam,
      corner: document.querySelector('.pg-corner')?.textContent, res: !!document.querySelector('.pg-cell.res')
    }))
    if (s.over) break
    if (s.res) throw new Error(`question ${s.qi} : un résultat est déjà affiché avant le choix`)
    if (s.corner !== (s.fam === 'mul' ? '×' : '+')) throw new Error(`question ${s.qi} (${s.op}) : le coin dit ${s.corner}`)
    seen.add(s.op); fams.add(s.fam)
    const ok = await page.evaluate(v => window.__pg.pick(v), s.ans)
    if (!ok) throw new Error(`réponse ${s.ans} introuvable`)
    await page.waitForFunction(q => window.__pg.qi !== q || window.__pg.over, s.qi, { timeout: 30000 })
  }
  if (fams.size < 2) throw new Error(`une seule grille pendant la récolte (${[...seen].join(', ')})`)
  await page.waitForFunction(() => document.body.innerText.includes('La récolte est rentrée'), null, { timeout: 15000 })
  await page.evaluate(() => localStorage.removeItem('ferme:faits:potager'))
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

/* 🥷 Ninja Verger (2D, 24/09) : la partie ENTIÈRE — cinq vagues puis la
   pluie — jusqu'à l'écran de fin. Le bot tranche chaque fruit d'un trait
   court (événements pointeur synthétiques, une lame par trait) et ne passe
   jamais près d'un cactus : il doit finir sans perdre un cœur, en ayant
   tranché presque tout, pluie comprise. */
await scenario('ninja-partie-complete', async () => {
  await openGame('Ninja Verger', '__nj')
  const t0 = Date.now()
  // Les cœurs du départ (3 à la fleur depuis le 30/09) : aucun ne doit partir
  const lives0 = await page.evaluate(() => window.__nj.lives())
  await page.evaluate(() => {
    const segDist = (px, py, ax, ay, bx, by) => {
      const dx = bx - ax, dy = by - ay
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    }
    const cv = document.querySelector('#njCanvas')
    const ev = (type, id, x, y, target) => target.dispatchEvent(new PointerEvent(type, {
      pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true
    }))
    let id = 100
    ;(async () => {
      while (window.__nj && !window.__nj.over()) {
        await new Promise(r => requestAnimationFrame(r))
        const r = cv.getBoundingClientRect()
        const fs = window.__nj.fruits(), bads = fs.filter(f => f.bad)
        for (const f of fs) {
          if (f.bad || f.y < r.top + r.height * 0.12 || f.y > r.top + r.height * 0.9) continue
          for (const [ux, uy] of [[1, 0], [0, 1], [0.7, 0.7], [0.7, -0.7]]) {
            const ax = f.x - ux * f.r, ay = f.y - uy * f.r, bx = f.x + ux * f.r, by = f.y + uy * f.r
            if (!bads.every(c => segDist(c.x, c.y, ax, ay, bx, by) > c.r + 45)) continue
            const pid = ++id
            ev('pointerdown', pid, ax, ay, cv)
            for (let k = 1; k <= 4; k++) ev('pointermove', pid, ax + (bx - ax) * k / 4, ay + (by - ay) * k / 4, window)
            ev('pointerup', pid, bx, by, window)
            break
          }
        }
      }
    })()
  })
  let pluie = false
  for (let k = 0; k < 400; k++) {
    const s = await page.evaluate(() => ({ wave: window.__nj.wave(), over: window.__nj.over() }))
    if (s.wave === 5) pluie = true
    if (s.over) break
    await page.waitForTimeout(500)
  }
  const n = await page.evaluate(() => ({ ...window.__nj.counts(), lives: window.__nj.lives(), over: window.__nj.over() }))
  if (!n.over) throw new Error('la partie n\'a pas fini en 200 s')
  if (!pluie) throw new Error('la pluie de fruits n\'est jamais venue')
  if (n.lives !== lives0) throw new Error(`un cœur perdu sans toucher de cactus (${n.lives}/${lives0})`)
  if (n.sliced < n.launched * 0.9) throw new Error(`seulement ${n.sliced} fruits tranchés sur ${n.launched}`)
  if (n.rain < 5) throw new Error(`pluie : ${n.rain} fruits tranchés seulement`)
  await page.waitForSelector('.result-score', { timeout: 15000 })
  console.log(`  (partie en ${Math.round((Date.now() - t0) / 1000)} s : ${n.sliced}/${n.launched} fruits, ${n.rain} dans la pluie)`)
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
      const cv = document.querySelector('#njCanvas')
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
  // À l'éclair, la cuisson dure 5 s simulées (7 à la fleur, 4 à la flamme) :
  // sous swiftshader en CI (2 à 3 images/s, dt borné à 100 ms), une cuisson
  // longue dépasse la minute, une trop courte laisse une fenêtre de 3 images
  await openGame('La Pizzeria', '__pz', 'med')
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
    await page.waitForFunction(r => window.__pt.round === r && !window.__pt.lock, i, { timeout: 90000, polling: 250 })
    const k = await page.evaluate(() => window.__pt.answer)
    await page.locator(`.pt-opt[data-key="${k}"]`).click()
    await page.waitForTimeout(150)
  }
  await finDe('Sacré sens logique')
})

/* 🔤 Les Cubes de l'alphabet (30/09) : trois mots, cube après cube — le
   premier GLISSÉ jusqu'à sa case, les autres touchés — par de vrais clics
   sur les cubes 3D. Et la voix : pour chaque mot, exactement le mot, puis
   le son de chaque cube posé, chaque syllabe complète, et la lecture finale
   (syllabes puis mot) — ce qui est passé à `ctx.say`, dans l'ordre. */
await scenario('cubes-trois-mots', async () => {
  await openGame('Cubes de l', '__lg')
  for (let r = 0; r < 3; r++) {
    await page.waitForFunction(k => window.__lg.round === k && !window.__lg.peeking && window.__lg.pos === 0, r, { timeout: 90000, polling: 500 })
    const { text, expected, said } = await page.evaluate(() => ({ text: window.__lg.text, expected: window.__lg.expected, said: window.__lg.said }))
    const from = said.lastIndexOf(text)
    if (from < 0) throw new Error(`le mot « ${text} » n'a pas été dit au début`)
    for (let k = 0; ; k++) {
      const st = await page.evaluate(() => ({ need: window.__lg.need, pos: window.__lg.pos, cubes: window.__lg.cubes() }))
      if (!st.need) break
      const c = st.cubes.find(x => x.t === st.need && x.state === 'rest')
      if (!c) throw new Error(`aucun cube « ${st.need} » sur la table (${text})`)
      if (r === 0 && k === 0) {
        // Glissé : appuyer sur le cube, l'emmener jusqu'à sa case, lâcher
        const sl = await page.evaluate(i => window.__lg.slot(i), st.pos)
        await page.mouse.move(c.x, c.y); await page.mouse.down()
        for (let i = 1; i <= 8; i++) { await page.mouse.move(c.x + (sl.x - c.x) * i / 8, c.y + (sl.y - c.y) * i / 8); await page.waitForTimeout(40) }
        await page.mouse.up()
      } else await page.mouse.click(c.x, c.y)
      await page.waitForFunction(p => window.__lg.pos > p, st.pos, { timeout: 30000, polling: 250 })
      // La voix finit de parler avant le cube suivant (sinon elle saute des sons)
      await page.waitForFunction(() => window.__lg.idle || window.__lg.lock, null, { timeout: 60000, polling: 250 })
    }
    // Toute la lecture finale est dite, dans l'ordre
    await page.waitForFunction(n => window.__lg.said.length >= n, from + expected.length, { timeout: 90000, polling: 500 })
    const got = (await page.evaluate(() => window.__lg.said)).slice(from, from + expected.length)
    if (JSON.stringify(got) !== JSON.stringify(expected)) throw new Error(`voix de « ${text} » : ${JSON.stringify(got)} au lieu de ${JSON.stringify(expected)}`)
  }
  await finDe('Tous les mots écrits', 60000)
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
  // Refait le 27/09 (textures, shaders, HDR) : son accroche `__sp` arrive
  // après le chargement ; chaque visite est un vol de caméra de 2 à 4 s
  // simulées — sous swiftshader, bien plus en temps réel. On sonde, on ne
  // compte pas les secondes.
  errors.length = 0
  await page.goto(URL, { waitUntil: 'networkidle' })
  await clickTile("Voyage dans l'Espace")
  await page.locator('.tierbtn.tier-easy').click()
  await page.waitForFunction(() => window.__sp, null, { timeout: 300000, polling: 1000 })
  for (const id of ['mercure', 'venus', 'terre', 'mars', 'jupiter', 'saturne', 'uranus', 'neptune']) {
    await page.locator(`.sp3-pick[data-id="${id}"]`).click({ force: true })
    await page.waitForFunction(i => window.__sp.target === i && !window.__sp.travelling && document.querySelector('.sp3-card:not(.off)'), id, { timeout: 180000, polling: 500 })
    await page.locator('.sp3-home').click({ force: true })
    await page.waitForTimeout(200)
  }
  await page.waitForFunction(() => document.querySelector('#result.show') && document.body.innerText.includes('Astronaute'), null, { timeout: 120000, polling: 500 })
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

/* ✏️ Le livre de coloriages de l'Atelier : la vache (un dessin au trait
   calculé depuis son personnage 3D), le pot de peinture remplit sa tête et
   s'arrête sur le trait, puis « fini ». */
await scenario('atelier-livre', async () => {
  await openGame("L'Atelier", '__at')
  await page.locator('#atBookBtn').click()
  await page.locator('.at-sheet[data-p="bete-cow-face"]').click()
  await page.waitForFunction(() => window.__at.page === 'bete-cow-face', null, { timeout: 120000, polling: 500 })
  await page.locator('.at-tool[data-t="bucket"]').click()
  await page.locator('.at-color[data-c="#F58FB8"]').click()
  await page.waitForTimeout(800)
  const box = await page.locator('#atPaint').boundingBox()
  // Le haut de la tête de la vache, entre les yeux et le front
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.34)
  await page.waitForFunction(() => window.__at.marks >= 1 && !window.__at.pouring, null, { timeout: 10000 })
  const p = await page.evaluate(() => window.__at.painted())
  if (p < 0.01) throw new Error(`le pot n'a rien rempli sur la vache (${p})`)
  if (p > 0.5) throw new Error(`le pot a débordé du trait de la vache (${p})`)
  await page.locator('#atDone').click()
  await finDe('Chef-d', 20000)
})

/* 🎆 Feu d'artifice : huit fusées, puis le bouquet final jusqu'à la fin. */
await scenario('feu-bouquet-final', async () => {
  await openGame("Feu d'Artifice")
  const box = await page.locator('#fwArena').boundingBox()
  // Dix fusées pour le bouquet à la fleur (30/09) : douze tirs, au cas où
  for (let i = 0; i < 12; i++) {
    await page.mouse.click(box.x + box.width * (0.18 + 0.055 * i), box.y + box.height * 0.3)
    await page.waitForTimeout(120)
  }
  // Le bouton du bouquet bat sans arrêt : Playwright ne le verrait jamais « stable »
  await page.locator('#fwFinal').click({ force: true })
  await finDe('Quel spectacle', 15000)
})

/* 🎨 L'Atelier (27/09) : un trait, un tampon, le pot de peinture et
   « annuler » sur le papillon ; puis un pinceau du tiroir (néon) sur papier
   nuit avec le miroir ; « Ranger » met le dessin dans le dossier et rend une
   feuille propre ; le dossier le montre, on le reprend ; « tout effacer »
   (deux touchers) ; « Fini » rejoue le film puis la fête. */
await scenario('atelier-papillon', async () => {
  await openGame("L'Atelier", '__at')
  const box = await page.locator('#atPaint').boundingBox()
  const X = f => box.x + box.width * f, Y = f => box.y + box.height * f
  const trait = async (x0, y0) => {
    await page.mouse.move(X(x0), Y(y0))
    await page.mouse.down()
    for (let i = 1; i <= 12; i++) await page.mouse.move(X(x0 + i * 0.05), Y(y0 + Math.sin(i / 2) * 0.1))
    await page.mouse.up()
  }
  await trait(0.15, 0.5)
  await page.locator('.at-tool[data-t="stamp"]').click()
  await page.locator('.at-stamp img').first().waitFor({ timeout: 20000 })
  await page.mouse.click(X(0.3), Y(0.8))
  await page.locator('.at-page[data-p="papillon"]').click()
  // En mode tampons, la palette laisse la place aux animaux : le pot d'abord, puis la couleur
  await page.locator('.at-tool[data-t="bucket"]').click()
  await page.locator('.at-color[data-c="#FFA94D"]').click()
  await page.waitForTimeout(600)
  // L'aile gauche du papillon (x 130 du dessin 400 × 300, centré dans 450 × 300)
  await page.mouse.click(X(155 / 450), Y(120 / 300))
  await page.waitForFunction(() => window.__at.marks >= 3 && !window.__at.pouring, null, { timeout: 5000 })
  const avant = await page.evaluate(() => window.__at.painted())
  if (avant < 0.04) throw new Error(`le pot de peinture n'a rien rempli (${avant})`)
  await page.locator('#atUndo').click()
  const apres = await page.evaluate(() => window.__at.painted())
  if (apres > 0.001) throw new Error(`« annuler » n'a pas effacé le remplissage (${apres})`)
  // Le tiroir : le néon, sur papier nuit, avec le miroir
  await page.locator('.at-page[data-p="blanche"]').click()
  await page.waitForTimeout(400)
  await page.locator('#atBrush').click()
  await page.locator('.at-bk[data-b="neon"]').click()
  await page.locator('#atPaperBtn').click()
  await page.locator('.at-pp').last().click()
  await page.locator('#atSym').click()
  const n0 = await page.evaluate(() => window.__at.painted())
  await trait(0.1, 0.3)
  const st = await page.evaluate(() => ({ brush: window.__at.brush, sym: window.__at.sym, paper: window.__at.paper, p: window.__at.painted() }))
  if (st.brush !== 'neon' || st.sym !== 2 || st.paper !== '#1F1B2E') throw new Error(`outils : ${JSON.stringify(st)}`)
  if (!(st.p > n0)) throw new Error('le néon n\'a rien dessiné')
  // Ranger : le dossier gagne un dessin, la feuille est propre
  await page.waitForFunction(() => window.__at.folder >= 0, null, { timeout: 5000 })
  const f0 = await page.evaluate(() => window.__at.folder)
  await page.locator('#atRanger').click()
  await page.waitForFunction(f => window.__at.folder === f + 1, f0, { timeout: 10000 })
  if (await page.evaluate(() => window.__at.painted()) > 0.0005) throw new Error('la feuille n\'est pas propre après « Ranger »')
  // Le dossier, et la reprise
  await page.locator('#atFolderBtn').click()
  await page.locator('.at-fcard').first().click()
  await page.locator('#atFEdit').click()
  await page.waitForFunction(() => window.__at.gallery !== null && window.__at.painted() > 0.001, null, { timeout: 10000 })
  // Tout effacer : deux touchers (la poubelle armée bouge : on touche sans attendre)
  await page.locator('#atClear').click({ force: true })
  await page.locator('#atClear').click({ force: true })
  await page.waitForFunction(() => window.__at.painted() < 0.0005, null, { timeout: 5000 })
  await trait(0.2, 0.4)
  await page.locator('#atDone').click()
  await finDe('Chef-d', 20000)
})
/* 👑 La Princesse (27/09) : la partie entière, seule. Une jupe au toucher,
   la couronne GLISSÉE de la garde-robe sur la tête, la teinture magique sur
   la jupe, le peigne qui allonge les cheveux, la photo (rangée dans
   l'Atelier), puis le bal : six pas de danse jusqu'à l'écran de fin. */
const pr = f => page.evaluate(f)
const prOpen = async (duo) => {
  errors.length = 0
  await page.goto(URL, { waitUntil: 'networkidle' })
  await clickTile('La Princesse')
  await page.locator('.duobtn').nth(duo ? 1 : 0).click({ force: true, timeout: 120000 })
  await page.locator('.tierbtn.tier-easy').click({ force: true, timeout: 120000 })
  // La princesse (un personnage VRM de 6 Mo) et ses vignettes : sous
  // swiftshader, une minute ; on sonde chaque seconde (sonder à chaque image
  // étouffe la page pendant la compilation des shaders)
  await prWait(() => window.__pr && window.__pr.ready, 'princesse prête')
  await prSettle()
}
/* Les vignettes de la garde-robe se calculent en 3D (une princesse hors
   écran) : tant qu'elles tournent, la page est prise et un clic peut rester
   bloqué. On attend qu'elles soient toutes là, et on clique en force. */
const prSettle = () => prWait(() => window.__pr && window.__pr.pending === 0, 'vignettes calculées')
/** Attendre, et dire où l'on en était si ça n'arrive pas. */
const prWait = async (fn, what, timeout = 300000) => {
  try { await page.waitForFunction(fn, null, { timeout, polling: 1000 }) } catch {
    const st = await page.evaluate(() => window.__pr ? { ready: window.__pr.ready, pending: window.__pr.pending, tab: window.__pr.tab, ...window.__pr.dbg } : 'pas de __pr').catch(() => 'page perdue')
    const toast = await page.evaluate(() => document.querySelector('.toast')?.textContent || '').catch(() => '')
    throw new Error(`${what} : délai dépassé (${JSON.stringify(st)}) ${toast} ${[...errors, ...consoleErrs].slice(-5).join(' | ')}`)
  }
}
await scenario('princesse-habiller-teindre-bal', async () => {
  await prOpen(false)
  // La jupe courte, au toucher
  await page.locator('.pr-tab[data-t="dress"]').click({ force: true, timeout: 120000 })
  await prSettle()
  await page.locator('.pr-tile[data-s="1"][data-i="1"]').click({ force: true, timeout: 120000 })
  await page.waitForFunction(() => window.__pr.looks[0].skirt === 'short', null, { timeout: 40000, polling: 250 })
  // La couronne glissée sur la tête
  await page.locator('.pr-tab[data-t="crown"]').click({ force: true, timeout: 120000 })
  await prSettle()
  const tile = await page.locator('.pr-tile[data-s="0"][data-i="2"]').boundingBox()
  const head = await pr(() => window.__pr.screenOf('head'))
  const x0 = tile.x + tile.width / 2, y0 = tile.y + tile.height / 2
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(x0 + (head.x - x0) * i / 12, y0 + (head.y - y0) * i / 12)
    await page.waitForTimeout(25)
  }
  await page.mouse.up()
  await page.waitForFunction(() => window.__pr.looks[0].crown === 'crown', null, { timeout: 40000, polling: 250 })
  // La teinture : bleu à étoiles, sur la jupe
  await page.locator('.pr-tab[data-t="dye"]').click({ force: true, timeout: 120000 })
  await page.locator('[data-dye="#3F63C8"]').click({ force: true, timeout: 120000 })
  await page.locator('[data-pat="stars"]').click({ force: true, timeout: 120000 })
  await page.waitForTimeout(1500) // la caméra se pose
  const sk = await pr(() => window.__pr.screenOf('skirt'))
  await page.mouse.click(sk.x, sk.y)
  await page.waitForFunction(() => window.__pr.looks[0].paint.skirt.c === '#3F63C8' && window.__pr.looks[0].paint.skirt.p === 'stars', null, { timeout: 40000, polling: 250 })
  // Le peigne : tirer vers le bas allonge les cheveux
  await page.locator('.pr-tab[data-t="hair"]').click({ force: true, timeout: 120000 })
  await prSettle()
  await page.locator('[data-tool="comb"]').click({ force: true, timeout: 120000 })
  await page.waitForTimeout(2500) // la caméra s'approche du visage
  const len0 = await pr(() => window.__pr.looks[0].hair.len)
  const hp = await pr(() => window.__pr.screenOf('hair'))
  await page.mouse.move(hp.x, hp.y)
  await page.mouse.down()
  for (let i = 1; i <= 16; i++) { await page.mouse.move(hp.x, hp.y + i * 20); await page.waitForTimeout(60) }
  await page.mouse.up()
  await page.waitForFunction(l => window.__pr.looks[0].hair.len > l + 0.05, len0, { timeout: 60000, polling: 250 })
  // La photo : rangée dans l'Atelier (dossier et coloriage)
  await page.locator('#prPhoto').click({ force: true, timeout: 120000 })
  await page.waitForFunction(() => window.__pr.photos === 1, null, { timeout: 60000, polling: 250 })
  // Lire la base de l'Atelier SANS jamais la créer : ouverte ici avant le
  // jeu, elle naissait vide et le jeu ne pouvait plus rien y ranger
  await prWait(() => new Promise(res => {
    const rq = indexedDB.open('ferme-atelier')
    rq.onupgradeneeded = () => rq.transaction.abort()
    rq.onsuccess = () => {
      const d = rq.result
      if (!d.objectStoreNames.contains('pages')) { d.close(); res(false); return }
      const g = d.transaction('pages').objectStore('pages').get('princesse:liste')
      g.onsuccess = () => { d.close(); res(Array.isArray(g.result) && g.result.length > 0) }
      g.onerror = () => { d.close(); res(false) }
    }
    rq.onerror = () => res(false)
  }), 'coloriage rangé', 120000)
  // Le bal : six pas, puis la révérence et l'écran de fin
  await page.locator('#prBall').click({ force: true, timeout: 120000 })
  await page.locator('.pr-move').first().waitFor({ timeout: 120000 })
  for (let k = 0; k < 6; k++) {
    await page.locator('.pr-move').nth(k).click({ force: true, timeout: 120000 })
    await page.waitForFunction(n => window.__pr.ball && window.__pr.ball.moves >= n, k + 1, { timeout: 80000, polling: 250 })
  }
  await page.waitForFunction(() => document.querySelector('#result.show') && document.body.innerText.includes('Quel bal'), null, { timeout: 120000, polling: 500 })
  // La princesse est gardée pour la prochaine fois
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ferme:v2') || '{}').state?.royals?.solo)
  if (!saved || saved.skirt !== 'short' || saved.paint.skirt.c !== '#3F63C8') throw new Error('la princesse n\'est pas gardée')
})

/* 👑 À deux : deux princesses sur l'estrade, celles de Jade et de Joyce.
   Teindre la seconde la rend active et la garde dans la carte de Joyce. */
await scenario('princesse-a-deux', async () => {
  await prOpen(true)
  const n = await pr(() => window.__pr.looks.length)
  if (n !== 2) throw new Error('il faut deux princesses à deux')
  await page.locator('.pr-tab[data-t="dye"]').click({ force: true, timeout: 120000 })
  await page.locator('[data-dye="#8CCB6A"]').click({ force: true, timeout: 120000 })
  await page.waitForTimeout(1500)
  const sk = await pr(() => window.__pr.screenOf('skirt', 1))
  await page.mouse.click(sk.x, sk.y)
  await page.waitForFunction(() => window.__pr.active === 1 && window.__pr.looks[1].paint.skirt.c === '#8CCB6A', null, { timeout: 40000, polling: 250 })
  const joyce = await page.evaluate(() => JSON.parse(localStorage.getItem('ferme:v2') || '{}').state?.royals?.joyce)
  if (!joyce || joyce.paint.skirt.c !== '#8CCB6A') throw new Error('la princesse de Joyce n\'est pas gardée')
  // On repart seule (le choix « à deux » est retenu par jeu)
  await page.goto(URL, { waitUntil: 'networkidle' })
  await clickTile('La Princesse')
  await page.locator('.duobtn').first().click({ force: true, timeout: 120000 })
})

/* 👧 L'ancienne version (28/09) : le petit bouton rond de la Princesse ouvre
   Habille-toi, la petite fille d'avant ; une couronne sur sa tête, gardée
   dans le profil ; la couronne d'or ramène à la princesse. */
await scenario('princesse-ancienne-version', async () => {
  try {
    await prOpen(false)
    await page.locator('#prSwitch').click({ force: true, timeout: 120000 })
    await page.waitForFunction(() => window.__du && window.__du.ready && !window.__pr, null, { timeout: 120000, polling: 500 })
    await page.locator('.du-opt[data-k="hat"][data-v="crown"]').click({ force: true, timeout: 60000 })
    await page.waitForFunction(() => window.__du.look.hat === 'crown', null, { timeout: 20000, polling: 250 })
    const kept = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('ferme:v2') || '{}').state; return s?.profiles?.find(p => p.id === s.currentId)?.look })
    if (!kept || kept.hat !== 'crown') throw new Error('le look de la petite fille n\'est pas gardé')
    await page.locator('#duSwitch').click({ force: true, timeout: 60000 })
    await prWait(() => window.__pr && window.__pr.ready && !window.__du, 'retour à la princesse')
    if (errors.length) throw new Error('erreurs JS : ' + errors.join(' | '))
  } finally {
    // Le choix est retenu : ne pas laisser la petite fille aux bots suivants
    await page.evaluate(() => localStorage.removeItem('ferme:princesse:mode')).catch(() => {})
  }
})

await browser.close()
if (failures.length) {
  console.error(`\n${failures.length} scénario(s) en échec : ${failures.join(', ')}`)
  process.exit(1)
}
console.log('\nTous les bots ont gagné leur partie 🏆')
process.exit(0) // le serveur de preview garderait le process en vie
