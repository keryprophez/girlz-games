/* Bots de jeu : là où le smoke test vérifie que les jeux SE MONTENT, ces bots
   vérifient qu'on peut Y JOUER — trancher des fruits au Ninja, empiler la
   Tour de Glace, et que la sauce de la pizza tombe SOUS le doigt
   (régression du bug de coordonnées UV). Depuis le 22/09, chaque jeu du
   catalogue a son bot : Suites, Lettres, Perles Miroir, Marché, Espace, Piano,
   Feu d'artifice, l'Atelier et la Princesse compris.

   Les jeux exposent leur état de pilotage seulement quand `window.__BOT` est
   posé avant le chargement — inerte en production.

   Usage : npm run build && npm run test:play
   (BOTS=poste,atelier npm run test:play pour n'en lancer que quelques-uns) */
import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

// PORT=… : un autre port quand 4189 est pris (plusieurs sessions en parallèle)
const PORT = Number(process.env.PORT || 4189)
const URL = `http://localhost:${PORT}/`

// Un serveur déjà là sur ce port servirait un AUTRE build : on s'arrête
if (await fetch(URL).then(() => true, () => false)) { console.error(`Le port ${PORT} est déjà pris : arrête ce serveur d'abord, ou PORT=…`); process.exit(1) }

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

/* Le faux micro de l'Animal qui répète (5/10) : Chromium lit ce fichier
   en boucle comme s'il venait du micro — un silence, des « syllabes » (une
   voix grave et ses harmoniques, quatre fois par seconde), un silence. */
const FAKE_VOICE = join(tmpdir(), 'ferme-fausse-voix.wav')
{
  const sr = 48000, plan = [[1.5, 0], [1.3, 1], [2.6, 0]]
  const n = Math.round(plan.reduce((t, [d]) => t + d, 0) * sr)
  const pcm = Buffer.alloc(44 + n * 2)
  let i = 0
  for (const [d, on] of plan) for (let k = 0; k < Math.round(d * sr); k++, i++) {
    const t = k / sr
    const v = on ? (Math.sin(2 * Math.PI * 190 * t) + 0.5 * Math.sin(2 * Math.PI * 380 * t) + 0.3 * Math.sin(2 * Math.PI * 570 * t)) * (0.55 + 0.45 * Math.sin(2 * Math.PI * 4 * t)) * 0.18 : 0
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2)
  }
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 2, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12)
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(sr, 24)
  pcm.writeUInt32LE(sr * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(n * 2, 40)
  writeFileSync(FAKE_VOICE, pcm)
}

const local = '/opt/pw-browsers/chromium'
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH }
    : existsSync(local) ? { executablePath: local }
    : { channel: 'chrome' }),
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${FAKE_VOICE}`]
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

const openGame = async (name, hook, tier = 'easy', ops = null, variant = null) => {
  errors.length = 0
  await page.goto(URL, { waitUntil: 'networkidle' })
  await clickTile(name)
  // Plusieurs jeux sous une tuile (la Cuisine, 27/10) : la variante voulue
  if (variant) await page.locator(`.varbtn[data-v="${variant}"]`).click()
  // Un jeu à calculs (le Potager, 27/09) demande d'abord ses opérations :
  // on allume exactement celles voulues (sinon celles par défaut), on passe
  // (un jeu sans niveau, 30/09, démarre directement : on attend le jeu lui-même)
  await page.locator('.opsgo, .tierbtn, .gameroot > *').first().waitFor()
  if (await page.locator('.opsgo').count()) {
    if (ops) {
      // Allumer d'abord (la dernière allumée ne s'éteint pas), puis éteindre
      for (const o of ops) if (!(await page.locator(`.opsbtn[data-op="${o}"].sel`).count())) await page.locator(`.opsbtn[data-op="${o}"]`).click()
      for (const o of ['add', 'sub', 'mul', 'div']) if (!ops.includes(o) && await page.locator(`.opsbtn[data-op="${o}"].sel`).count()) await page.locator(`.opsbtn[data-op="${o}"]`).click()
    }
    await page.locator('.opsgo').click()
  }
  // Le niveau se choisit dans le jeu : les bots jouent en douce (sauf besoin)
  if (await page.locator('.tierbtn').count()) await page.locator('.tierbtn.tier-' + tier).click()
  await page.waitForTimeout(3200)
  // Un jeu 3D n'installe son accroche qu'une fois ses modèles chargés : sur
  // un serveur d'intégration lent, 3,2 s ne suffisent pas toujours (la
  // Course a échoué en CI sur sa PREMIÈRE sonde, faute de `__run`).
  // Sondé toutes les demi-secondes, pas à chaque image : une page qui
  // compile ses shaders espace ses images de plusieurs secondes
  if (hook) await page.waitForFunction(k => k in window, hook, { timeout: 90000, polling: 500 })
}

const failures = []
// BOTS=poste,ninja npm run test:play → seulement les scénarios dont le nom contient l'un des mots
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

/* 🍕 Pizzeria : la sauce doit apparaître SOUS le doigt (régression UV). */
await scenario('pizza-sauce-sous-le-doigt', async () => {
  await openGame('La Cuisine', null, 'easy', null, 'pizza')
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

/* 🖼 Taquin (le second mode du Puzzle depuis le 30/09) : résoudre par
   recherche en largeur (grille 3×3 à la fleur : 181 440 positions au plus),
   puis taper les tuiles dans l'ordre — l'écran de fin doit venir. */
await scenario('taquin-remis-en-ordre', async () => {
  await openGame('Puzzle')
  await page.locator('.tq-mode[data-m="taquin"]').click({ force: true, timeout: 120000 })
  // L'image (un rendu 3D de la ferme) se calcule d'abord : sondé par intervalle
  await page.waitForFunction(() => window.__tq && window.__tq.mode === 'taquin' && window.__tq.cells && window.__tq.running, null, { timeout: 180000, polling: 500 })
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

/* 🧩 Le Puzzle (30/09) : une pièce attrapée AU DOIGT (la souris), emmenée
   au-dessus de sa place et lâchée — l'aimant doit la poser ; puis toutes les
   autres posées par l'accroche `__pz2` — l'écran de fin doit venir. */
await scenario('puzzle-complet', async () => {
  await openGame('Puzzle')
  if (!(await page.locator('.tq-mode[data-m="puzzle"].sel').count())) await page.locator('.tq-mode[data-m="puzzle"]').click({ force: true, timeout: 120000 })
  // Le rendu de l'image passe avant les pièces : sondé par intervalle (page prise)
  await page.waitForFunction(() => window.__pz2 && window.__pz2.ready, null, { timeout: 180000, polling: 1000 })
  const n = await page.evaluate(() => window.__pz2.n)
  if (n !== 12) throw new Error(`12 pièces attendues à la fleur, ${n} trouvées`)
  const p = (await page.evaluate(() => window.__pz2.pieces())).find(x => !x.placed)
  await page.mouse.move(p.at.x, p.at.y)
  await page.mouse.down()
  const held = await page.evaluate(() => window.__pz2.held)
  if (held !== 1) { await page.mouse.up(); throw new Error('la pièce ne s\'attrape pas au doigt') }
  for (let k = 1; k <= 8; k++) {
    await page.mouse.move(p.at.x + (p.home.x - p.at.x) * k / 8, p.at.y + (p.home.y - p.at.y) * k / 8)
    await page.waitForTimeout(60)
  }
  await page.mouse.up()
  await page.waitForFunction(() => window.__pz2.placed >= 1, null, { timeout: 30000, polling: 250 })
    .catch(() => { throw new Error('la pièce lâchée sur sa place ne s\'est pas posée') })
  const rest = await page.evaluate(() => window.__pz2.pieces().filter(x => !x.placed && !x.busy).map(x => x.i))
  for (const i of rest) await page.evaluate(k => window.__pz2.place(k), i)
  await page.waitForFunction(() => document.querySelector('#result.show') && document.body.innerText.includes('Puzzle terminé'), null, { timeout: 90000, polling: 500 })
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
    const d = JSON.parse(localStorage.getItem('ferme:v3') || '{}')
    return d.state?.best?.memory
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

/* 🕐 Quelle heure : mode « les heures », huit bonnes réponses lues sur le crochet,
   huit heures différentes (27/10 : la série se tire sans remise). */
await scenario('horloge-huit-heures', async () => {
  await openGame('Quelle heure')
  await page.waitForFunction(() => window.__ck, null, { timeout: 15000 })
  await page.locator('.ck-tool[data-m="hours"]').click()
  const posees = []
  for (let i = 0; i < 8; i++) {
    await page.waitForFunction(r => window.__ck.round === r && !window.__ck.lock, i, { timeout: 15000 })
    const h = await page.evaluate(() => window.__ck.h)
    posees.push(h)
    await page.locator('.qopt', { hasText: new RegExp('^' + h + ' h$') }).click()
    await page.waitForTimeout(200)
  }
  if (new Set(posees).size !== posees.length) throw new Error('la même heure posée deux fois dans la série : ' + posees.join(' '))
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

/* 🎯 Le Flipper de la grange (1/10) : une partie ENTIÈRE, jusqu'à l'écran de
   fin. Le lancer au vrai doigt (appuyer, le ressort se tend, relâcher) ; deux
   doigts à la fois, chacun son batteur (pointerId : à gauche le gauche, à
   droite le droit) ; le clavier aussi. Puis le pilote joue : il tourne DANS la
   simulation, à chaque pas de physique, comme dans les tests vitest (où ce
   même scénario est joué 1 200 fois, à trois cadences : 15 coups de batteur
   et 6 animaux touchés en 11 s simulées au pire). `turbo` fait plusieurs pas
   d'image par image — la 3D logicielle rend une image par seconde, la
   physique à pas fixes donne le même jeu, plus vite. Enfin le pilote lâche,
   les billes tombent, chaque nouvelle bille part au clavier. */
await scenario('flipper-partie-complete', async () => {
  await openGame('Le Flipper', '__pb')
  await page.waitForSelector('.nj-loading', { state: 'detached', timeout: 120000 })
  const until = (fn, what, timeout = 180000) => page.waitForFunction(fn, null, { timeout, polling: 1000 })
    .catch(() => { throw new Error('jamais vu : ' + what) })
  await until(() => window.__pb.state().waiting, 'la bille sur le ressort')
  const box = await page.locator('#pbArena').boundingBox()
  // Le lancer au doigt
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.8)
  await page.mouse.down()
  await until(() => window.__pb.state().pull > 0.25, 'le ressort qui se tend')
  await page.mouse.up()
  await until(() => window.__pb.stats().launches === 1 && window.__pb.state().inPlay > 0, 'la bille lancée')
  // Deux doigts, deux batteurs, et le clavier
  const fingers = await page.evaluate(b => {
    const el = document.querySelector('#pbArena')
    const ev = (type, id, fx, target) => target.dispatchEvent(new PointerEvent(type, {
      pointerId: id, pointerType: 'touch', isPrimary: id === 31, clientX: b.x + b.width * fx, clientY: b.y + b.height * 0.8, bubbles: true
    }))
    const f = () => window.__pb.state().flippers.map(Number).join('')
    const out = [f()]
    ev('pointerdown', 31, 0.15, el); out.push(f())
    ev('pointerdown', 32, 0.85, el); out.push(f())
    ev('pointerup', 31, 0.15, window); out.push(f())
    ev('pointerup', 32, 0.85, window); out.push(f())
    return out.join(' ')
  }, box)
  if (fingers !== '00 10 11 01 00') throw new Error('les batteurs ne suivent pas les doigts : ' + fingers)
  await page.keyboard.down('ArrowLeft')
  const keyL = await page.evaluate(() => window.__pb.state().flippers.map(Number).join(''))
  await page.keyboard.up('ArrowLeft')
  await page.keyboard.down('ArrowRight')
  const keyR = await page.evaluate(() => window.__pb.state().flippers.map(Number).join(''))
  await page.keyboard.up('ArrowRight')
  if (keyL !== '10' || keyR !== '01') throw new Error(`le clavier : ${keyL} ${keyR}`)
  // Le pilote joue
  await page.evaluate(() => { window.__pb.auto(true); window.__pb.turbo(6) })
  await until(() => { const s = window.__pb.stats(); return (s.flips >= 15 && s.bumpers >= 6) || window.__pb.state().t > 90 }, 'quinze coups de batteur')
  const mid = await page.evaluate(() => ({ ...window.__pb.stats(), score: window.__pb.state().score }))
  if (mid.flips < 15 || mid.bumpers < 6) throw new Error(`le pilote ne tient pas la bille : ${mid.flips} coups, ${mid.bumpers} animaux`)
  if (!(mid.score > 0)) throw new Error('aucun point marqué')
  // Il lâche : les billes tombent, chaque nouvelle part au clavier, jusqu'à la fin
  await page.evaluate(() => window.__pb.auto(false))
  for (let k = 0; k < 400; k++) {
    const s = await page.evaluate(() => window.__pb.state())
    if (s.over) break
    if (s.waiting) { await page.keyboard.down('Space'); await page.waitForTimeout(250); await page.keyboard.up('Space') }
    await page.waitForTimeout(1000)
  }
  if (!(await page.evaluate(() => window.__pb.state().over))) throw new Error('la partie ne finit pas')
  await page.waitForSelector('.result-score', { timeout: 60000 })
  const end = await page.evaluate(() => ({ ...window.__pb.stats(), score: window.__pb.state().score }))
  console.log(`  (${end.score} points : ${end.flips} coups de batteur, ${end.bumpers} animaux, ${end.cries} cris, ${end.launches} lancers, ${end.saves} sauvés par le chien)`)
})

/* 🌍 Le Tour du Monde : les vrais pays répondent à la bonne longitude/latitude,
   tous ont un continent, et la question de Trouve se pose bien — dans une
   manche sans doublon (27/10). */
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
  if (!st.plan?.length || new Set(st.plan).size !== st.plan.length) throw new Error('manche avec doublon : ' + JSON.stringify(st.plan))
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

/* 🍕 La pizza de la Cuisine (la Pizzeria, refaite le 23/09) : la partie entière. Du fromage au doigt,
   au four, sortie DANS la zone parfaite (une sortie trop tôt ne sort pas),
   la pizza se coupe, et on croque les six parts jusqu'à l'écran de fin. */
await scenario('pizza-du-four-a-la-bouche', async () => {
  // La cuisson dure 7 s simulées (la Cuisine n'a pas de niveau, 27/10)
  await openGame('La Cuisine', '__pz', 'easy', null, 'pizza')
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

/* 🔤 Chasse aux lettres : trois mots différents, lettre après lettre (la lettre vole). */
await scenario('lettres-trois-mots', async () => {
  await openGame('Chasse aux lettres', '__lg')
  const mots = []
  for (let r = 0; r < 3; r++) {
    await page.waitForFunction(k => window.__lg.round === k && !window.__lg.peeking && window.__lg.pos === 0, r, { timeout: 15000 })
    const word = await page.evaluate(() => window.__lg.word)
    mots.push(word)
    for (const ch of word) {
      await page.locator(`.lg-tile:not(.used)[data-ch="${ch}"]`).first().click()
      await page.waitForTimeout(120)
    }
  }
  if (new Set(mots).size !== mots.length) throw new Error('le même mot deux fois : ' + mots.join(' '))
  await finDe('Tous les mots trouvés')
})

/* 🪞 Les Perles Miroir (30/09) : trois reflets en perles à repasser, jusqu'à
   l'écran de fin. Le bot touche les VRAIS picots de la plaque 3D (le point
   d'écran de chaque case vient de l'accroche), prend la couleur dans les
   pots, et vérifie qu'une perle fausse se pose, est signalée, puis se
   retire d'un toucher (Apprendre : aucune sanction). Chaque manche finit
   par le fer et l'envol : on attend la manche suivante sur l'accroche, pas
   sur une durée. */
await scenario('perles-miroir-trois-reflets', async () => {
  await openGame('Perles Miroir', '__mi')
  const touch = async (c, r) => {
    const p = await page.evaluate(({ c, r }) => window.__mi.at(c, r), { c, r })
    await page.mouse.click(p.x, p.y)
  }
  for (let r = 0; r < 3; r++) {
    // Le fer et l'envol durent une dizaine de secondes simulées : sous la 3D
    // logicielle (une ou deux images par seconde quand la machine est prise),
    // plusieurs minutes. En cas d'échec, on dit où la partie en était.
    try {
      await page.waitForFunction(k => window.__mi.round === k && window.__mi.phase === 'play', r, { timeout: 240000, polling: 1000 })
    } catch (e) {
      const st = await page.evaluate(() => new Promise(ok => {
        let n = 0
        const t0 = performance.now()
        const f = () => { if (++n < 6) requestAnimationFrame(f); else ok({ manche: window.__mi.round, phase: window.__mi.phase, msParImage: Math.round((performance.now() - t0) / 5) }) }
        requestAnimationFrame(f)
      }))
      throw new Error(`manche ${r + 1} jamais prête : ${JSON.stringify(st)} — ${String(e).split('\n')[0]}`)
    }
    if (r === 0) {
      const blank = await page.evaluate(() => window.__mi.blank)
      const voir = async () => JSON.stringify(await page.evaluate(() => ({ phase: window.__mi.phase, fausses: window.__mi.wrong })))
      await touch(blank.c, blank.r)
      await page.waitForFunction(b => window.__mi.wrong.some(w => w.c === b.c && w.r === b.r), blank, { timeout: 30000, polling: 250 })
        .catch(async () => { throw new Error(`la perle fausse en ${blank.c},${blank.r} ne s'est pas posée : ${await voir()}`) })
      await touch(blank.c, blank.r)
      await page.waitForFunction(() => window.__mi.wrong.length === 0, null, { timeout: 30000, polling: 250 })
        .catch(async () => { throw new Error(`la perle fausse ne s'est pas retirée : ${await voir()}`) })
    }
    const need = await page.evaluate(() => window.__mi.need)
    const byColor = {}
    for (const n of need) (byColor[n.color] ||= []).push(n)
    for (const [color, cells] of Object.entries(byColor)) {
      await page.locator(`.pl-potbtn[data-c="${color}"]`).click({ force: true })
      for (const { c, r: row } of cells) await touch(c, row)
    }
    const left = await page.evaluate(() => ({ need: window.__mi.need.length, wrong: window.__mi.wrong.length }))
    if (left.need || left.wrong) throw new Error(`manche ${r + 1} : ${left.need} perle(s) manquante(s), ${left.wrong} fausse(s)`)
    await page.waitForFunction(k => window.__mi.round > k || window.__mi.phase !== 'play', r, { timeout: 15000 })
  }
  await finDe('Quel joli reflet', 120000)
})

/* 🔥 Perles Miroir à la flamme (11/10, Joyce) : on ne sait qu'en validant.
   Une perle fausse ne clignote pas à la pose, la manche ne finit pas seule ;
   « Repasser » montre la fausse et la compte, puis le fer passe. */
await scenario('perles-miroir-flamme-au-fer', async () => {
  await openGame('Perles Miroir', '__mi', 'exp')
  const touch = async (c, r) => {
    const p = await page.evaluate(({ c, r }) => window.__mi.at(c, r), { c, r })
    await page.mouse.click(p.x, p.y)
  }
  const etat = () => page.evaluate(() => ({ phase: window.__mi.phase, faux: window.__mi.wrong.length, clignote: window.__mi.flagged.length, erreurs: window.__mi.mistakes }))
  const fer = () => page.locator('.pl-iron button').click({ force: true })
  for (let r = 0; r < 3; r++) {
    await page.waitForFunction(k => window.__mi.round === k && window.__mi.phase === 'play', r, { timeout: 240000, polling: 1000 })
    if (r > 0) { await page.evaluate(() => window.__mi.solve()); continue }
    if (!(await page.evaluate(() => window.__mi.hard))) throw new Error('la flamme ne joue pas en mode « au fer »')
    const blank = await page.evaluate(() => window.__mi.blank)
    await touch(blank.c, blank.r)
    const need = await page.evaluate(() => window.__mi.need)
    const byColor = {}
    for (const n of need) (byColor[n.color] ||= []).push(n)
    for (const [color, cells] of Object.entries(byColor)) {
      await page.locator(`.pl-potbtn[data-c="${color}"]`).click({ force: true })
      for (const { c, r: row } of cells) await touch(c, row)
    }
    await page.waitForTimeout(1500)
    let e = await etat()
    if (e.phase !== 'play' || e.faux !== 1 || e.clignote || e.erreurs) throw new Error(`avant le fer, rien ne doit trahir la perle fausse : ${JSON.stringify(e)}`)
    await fer()
    await page.waitForFunction(() => window.__mi.flagged.length === 1, null, { timeout: 15000, polling: 250 })
      .catch(async () => { throw new Error(`le fer ne montre pas la perle fausse : ${JSON.stringify(await etat())}`) })
    e = await etat()
    if (e.phase !== 'play' || e.erreurs !== 1) throw new Error(`après un fer faux : ${JSON.stringify(e)}`)
    await touch(blank.c, blank.r)
    await page.waitForFunction(() => window.__mi.wrong.length === 0 && window.__mi.flagged.length === 0, null, { timeout: 15000, polling: 250 })
    await fer()
    await page.waitForFunction(() => window.__mi.phase !== 'play', null, { timeout: 15000, polling: 250 })
      .catch(async () => { throw new Error(`le reflet juste n'est pas repassé : ${JSON.stringify(await etat())}`) })
  }
  await finDe('Quel joli reflet', 240000)
})

/* 🚜 Le Tracteur à programmer (27/10) : huit manches. À la première, une
   flèche posée puis retirée d'un toucher, puis une file trop courte : le
   tracteur s'arrête sans l'animal et revient à sa place (aucune sanction,
   un départ de plus) ; on complète la file, il ramène l'animal. Ensuite, le
   plus court programme de chaque manche. À la flamme : une file qui fonce
   tout droit cogne, sa flèche fautive clignote ; puis les boucles ×2. */
const tracteur = async (tier, titre) => {
  await openGame('Le Tracteur', '__tr', tier)
  const etat = () => page.evaluate(() => JSON.stringify({ manche: window.__tr.round, phase: window.__tr.phase, file: window.__tr.file.length, departs: window.__tr.retries, case: window.__tr.at }))
  const pose = async toks => {
    for (const t of toks) {
      if (t.x2) await page.locator('.tr-x2').click({ force: true })
      await page.locator(`.tr-cmd[data-cmd="${t.cmd}"]`).click({ force: true })
    }
  }
  const edit = k => page.waitForFunction(k => window.__tr.round === k && window.__tr.phase === 'edit', k, { timeout: 120000, polling: 250 })
  for (let r = 0; r < 8; r++) {
    await edit(r).catch(async () => { throw new Error(`manche ${r + 1} jamais prête (${await etat()})`) })
    const sol = await page.evaluate(() => window.__tr.solution)
    if (r === 0) {
      // Une flèche posée, retirée d'un toucher
      await page.locator('.tr-pal .tr-cmd').first().click({ force: true })
      if (await page.locator('.tr-tok').count() !== 1) throw new Error(`la flèche ne se pose pas (${await etat()})`)
      await page.locator('.tr-tok').first().click({ force: true })
      if (await page.locator('.tr-tok').count() !== 0) throw new Error(`la flèche ne se retire pas (${await etat()})`)
      if (tier === 'exp') {
        // Tout droit, jusqu'à cogner (ou, par chance, tout ramasser)
        for (let i = 0; i < 9; i++) await page.locator('.tr-cmd[data-cmd="F"]').click({ force: true })
        await page.locator('.tr-go').click({ force: true })
        await page.waitForFunction(() => ['stuck', 'win'].includes(window.__tr.phase), null, { timeout: 120000, polling: 200 })
        if (await page.evaluate(() => window.__tr.phase) === 'win') continue
        if (await page.evaluate(() => window.__tr.fault) < 0) throw new Error(`la flèche fautive ne clignote pas (${await etat()})`)
        await edit(0)
        while (await page.locator('.tr-tok').count()) await page.locator('.tr-tok').first().click({ force: true })
      } else {
        // Une file trop courte : il revient sans l'animal
        await pose(sol.slice(0, -1))
        await page.locator('.tr-go').click({ force: true })
        await page.waitForFunction(() => window.__tr.retries === 1, null, { timeout: 120000, polling: 200 })
          .catch(async () => { throw new Error(`la file trop courte ne compte pas un départ (${await etat()})`) })
        await edit(0)
        // Revenu à sa place : la file gardée, il ne manque que la dernière flèche
        if ((await page.evaluate(() => window.__tr.file.length)) !== sol.length - 1) throw new Error(`la file a changé au retour (${await etat()})`)
        await pose(sol.slice(-1))
        await page.locator('.tr-go').click({ force: true })
        await page.waitForFunction(() => window.__tr.round === 1, null, { timeout: 120000, polling: 250 })
          .catch(async () => { throw new Error(`la file complétée ne ramène pas l'animal (${await etat()})`) })
        continue
      }
    }
    await pose(sol)
    await page.locator('.tr-go').click({ force: true })
    await page.waitForFunction(k => window.__tr.round > k, r, { timeout: 120000, polling: 250 })
      .catch(async () => { throw new Error(`manche ${r + 1} : le tracteur ne ramène pas tout le monde (${await etat()})`) })
  }
  await finDe(titre, 60000)
}
await scenario('tracteur-fleur', () => tracteur('easy', 'Tout le monde est monté'))
await scenario('tracteur-flamme', () => tracteur('exp', 'Tout le monde est monté'))

/* 📐 Le Géoplan (27/10) : à la fleur, un élastique lâché dans le vide ne
   s'accroche pas, un élastique de trop se retire d'un toucher ; puis chaque
   figure est tendue côté par côté, au doigt (appuyer sur un picot, glisser,
   lâcher sur l'autre). À la flamme, les figures transformées, n'importe où. */
const geoplan = async (tier, manches) => {
  await openGame('Le Géoplan', '__gp', tier)
  const etat = () => page.evaluate(() => JSON.stringify({ manche: window.__gp.round, phase: window.__gp.phase, figure: window.__gp.shape, elastiques: window.__gp.bands.length, retires: window.__gp.undone }))
  const at = p => page.evaluate(([c, r]) => window.__gp.at(c, r), p)
  const tire = async (a, b, lache = true) => {
    const A = await at(a), B = b.x === undefined ? await at(b) : b
    await page.mouse.move(A.x, A.y); await page.mouse.down()
    for (let i = 1; i <= 6; i++) await page.mouse.move(A.x + (B.x - A.x) * i / 6, A.y + (B.y - A.y) * i / 6)
    if (lache) await page.mouse.up()
  }
  for (let r = 0; r < manches; r++) {
    await page.waitForFunction(k => window.__gp.round === k && window.__gp.phase === 'play', r, { timeout: 120000, polling: 250 })
      .catch(async () => { throw new Error(`manche ${r + 1} jamais prête (${await etat()})`) })
    const want = await page.evaluate(() => window.__gp.want)
    if (r === 0) {
      const n = await page.evaluate(() => window.__gp.n)
      // Lâché dans le vide (entre deux picots) : rien ne s'accroche
      const A = await at([0, 0]), B = await at([1, 1])
      await tire([0, 0], { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 + 3 })
      await page.waitForTimeout(300)
      if ((await page.evaluate(() => window.__gp.bands.length)) !== 0) throw new Error(`un élastique lâché dans le vide s'accroche (${await etat()})`)
      // Un élastique de trop, au bord de la plaque, puis retiré d'un toucher
      await tire([n - 1, n - 2], [n - 1, n - 1])
      await page.waitForFunction(() => window.__gp.bands.length === 1, null, { timeout: 20000, polling: 200 })
        .catch(async () => { throw new Error(`l'élastique ne s'accroche pas (${await etat()})`) })
      const m = await page.evaluate(() => window.__gp.mid(0))
      await page.mouse.click(m.x, m.y)
      await page.waitForFunction(() => window.__gp.bands.length === 0 && window.__gp.undone === 1, null, { timeout: 20000, polling: 200 })
        .catch(async () => { throw new Error(`l'élastique ne se retire pas (${await etat()})`) })
    }
    if (tier === 'exp' && !(await page.evaluate(() => window.__gp.xf))) throw new Error(`la flamme sans transformation (${await etat()})`)
    for (const [a, b] of want) await tire(a, b)
    await page.waitForFunction(k => window.__gp.round > k, r, { timeout: 30000, polling: 250 })
      .catch(async () => { throw new Error(`manche ${r + 1} : la figure tendue n'est pas reconnue (${await etat()})`) })
  }
  await finDe('Quelles belles figures', 60000)
}
await scenario('geoplan-fleur', () => geoplan('easy', 5))
await scenario('geoplan-flamme', () => geoplan('exp', 6))

/* 💶 Le Marché : quatre paiements exacts, pièces choisies de la plus grosse
   à la plus petite (le bot rend la monnaie comme un marchand), quatre prix
   différents (27/10 : sans remise). */
await scenario('marche-quatre-paiements', async () => {
  await openGame('Le Marché', '__mk')
  await page.locator('.mk-mode[data-m="pay"]').click()
  const prix = []
  for (let q = 0; q < 4; q++) {
    await page.waitForFunction(k => window.__mk.q === k && !window.__mk.lock && window.__mk.goal > 0, q, { timeout: 15000 })
    const denoms = await page.$$eval('#mkBank .mk-coin', els => els.map(e => +e.dataset.v).sort((a, b) => b - a))
    let reste = await page.evaluate(() => window.__mk.goal)
    prix.push(reste)
    for (const v of denoms) {
      while (reste >= v) { await page.locator(`#mkBank .mk-coin[data-v="${v}"]`).click(); reste -= v; await page.waitForTimeout(80) }
    }
    if (reste) throw new Error('prix impossible à payer avec la banque : reste ' + reste)
  }
  if (new Set(prix).size !== prix.length) throw new Error('le même prix deux fois : ' + prix.join(' '))
  await finDe('Le compte est bon')
})

/* 🚀 Voyage dans l'Espace : les huit planètes visitées par la barre des
   astres (on part de la Terre, déjà cochée), puis la fête et l'écran de fin. */
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
    await page.locator(`.sp3-b[data-id="${id}"]`).click({ force: true })
    await page.waitForFunction(i => window.__sp.target === i && !window.__sp.travelling && window.__sp.arrived, id, { timeout: 180000, polling: 500 })
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

/* 🎆 Feu d'artifice : des touchers (la fusée d'avant), puis le bouquet final
   jusqu'à la fin. */
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
  // Le bouquet est un spectacle sur sa musique (30/09) : une vingtaine de secondes
  await finDe('Quel spectacle', 60000)
})

/* ✏️ Le feu d'artifice qu'on DESSINE (30/09) : un cœur tracé au doigt (de
   vrais gestes appuyer / glisser / lever) éclate en forme LÀ OÙ il a été
   dessiné et à sa taille ; une étoile en or (la pastille) ; puis des
   touchers jusqu'au bouquet, où les dessins reviennent éclater en grand. */
await scenario('feu-dessin', async () => {
  await openGame("Feu d'Artifice", '__fw')
  const box = await page.locator('#fwArena').boundingBox()
  const trace = async pts => {
    await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down()
    for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y)
    await page.mouse.up()
  }
  const hx = box.x + box.width * 0.42, hy = box.y + box.height * 0.34, s = box.height * 0.009
  const heart = []
  for (let i = 0; i <= 48; i++) {
    const t = i / 48 * Math.PI * 2
    heart.push([hx + s * 16 * Math.sin(t) ** 3, hy - s * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))])
  }
  await trace(heart)
  await page.waitForFunction(() => window.__fw.drawn >= 1, null, { timeout: 20000, polling: 250 })
  // Le cœur a éclaté à sa place : centre et taille du tracé (coordonnées de l'arène)
  const xs = heart.map(p => p[0]), ys = heart.map(p => p[1])
  const want = {
    cx: (Math.min(...xs) + Math.max(...xs)) / 2 - box.x, cy: (Math.min(...ys) + Math.max(...ys)) / 2 - box.y,
    w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys)
  }
  const got = await page.evaluate(() => window.__fw.last)
  if (!got || Math.abs(got.cx - want.cx) > 12 || Math.abs(got.cy - want.cy) > 12 ||
    Math.abs(got.w - want.w) > want.w * 0.15 || Math.abs(got.h - want.h) > want.h * 0.15) {
    throw new Error(`le cœur n'éclate pas sur son tracé : ${JSON.stringify(got)} au lieu de ${JSON.stringify(want)}`)
  }
  if (got.n < 60) throw new Error(`trop peu d'étincelles pour dessiner le cœur (${got.n})`)
  // Une étoile en or, d'un seul trait
  await page.locator('.fw-ink[data-i="1"]').click()
  const sx = box.x + box.width * 0.72, sy = box.y + box.height * 0.3, R = box.height * 0.12
  const star = []
  for (let i = 0; i < 5; i++) {
    const a0 = -Math.PI / 2 + i * Math.PI * 4 / 5, a1 = a0 + Math.PI * 4 / 5
    for (let q = 0; q < 8; q++) {
      star.push([sx + Math.cos(a0) * R + (Math.cos(a1) - Math.cos(a0)) * R * q / 8, sy + Math.sin(a0) * R + (Math.sin(a1) - Math.sin(a0)) * R * q / 8])
    }
  }
  await trace(star)
  await page.waitForFunction(() => window.__fw.drawn >= 2, null, { timeout: 20000, polling: 250 })
  if (await page.evaluate(() => window.__fw.last.ink) !== 1) throw new Error('l\'étoile n\'a pas pris la couleur choisie')
  // Des touchers jusqu'au bouquet (les dessins comptent comme des fusées)
  const need = await page.evaluate(() => window.__fw.need)
  for (let i = 0; i < 20 && await page.evaluate(() => window.__fw.count) < need; i++) {
    await page.mouse.click(box.x + box.width * (0.15 + 0.07 * (i % 10)), box.y + box.height * 0.22)
    await page.waitForTimeout(120)
  }
  await page.locator('#fwFinal').click({ force: true })
  // Les deux dessins reviennent éclater en grand pendant le bouquet
  await page.waitForFunction(() => window.__fw.encore >= 2, null, { timeout: 40000, polling: 250 })
  await finDe('Quel spectacle', 60000)
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
/* 📿 Les Bijoux (30/09) : dix perles touchées dans le boîtier, une onzième
   GLISSÉE jusqu'à la planche, « annuler » en retire une, le fermoir ferme
   le collier (gardé), la vitrine ; « Fini » mène à l'écran de fin. */
const bjWait = (fn, arg, what, timeout = 120000) => page.waitForFunction(fn, arg, { timeout, polling: 500 }).catch(async () => {
  const st = await page.evaluate(() => window.__bj ? { phase: window.__bj.phase, mode: window.__bj.mode, count: window.__bj.count, moving: window.__bj.moving, hama: window.__bj.hama } : 'pas de __bj').catch(() => 'page perdue')
  throw new Error(`${what} : délai dépassé (${JSON.stringify(st)}) ${[...errors, ...consoleErrs].slice(-4).join(' | ')}`)
})
await scenario('bijoux-collier-de-perles', async () => {
  await openGame('Les Bijoux', '__bj')
  await bjWait(() => window.__bj.phase === 'work', null, 'établi')
  // Le dernier atelier choisi est retenu : on repart du collier
  await page.locator('#bjMode-collier').click({ force: true })
  await bjWait(() => window.__bj.mode === 'collier', null, 'atelier du collier')
  // Dix compartiments touchés d'affilée (plusieurs perles volent à la fois) :
  // sous la 3D logicielle, attendre chacune coûterait des minutes
  const pts = await page.evaluate(() => Array.from({ length: 10 }, (_, k) => window.__bj.comp(k)))
  for (const p of pts) await page.mouse.click(p.x, p.y)
  await bjWait(() => window.__bj.count === 10, null, 'dix perles', 180000)
  // Une perle glissée du dernier compartiment jusqu'à la planche
  const a = await page.evaluate(() => window.__bj.comp(11)), b = await page.evaluate(() => window.__bj.board())
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / 10, a.y + (b.y - a.y) * i / 10); await page.waitForTimeout(30) }
  await page.mouse.up()
  await bjWait(() => window.__bj.count === 11, null, 'perle glissée')
  await page.locator('#bjUndo').click({ force: true })
  await bjWait(() => window.__bj.count === 10 && window.__bj.moving === 0, null, 'annuler', 180000)
  await page.locator('#bjClose').click({ force: true })
  await bjWait(() => window.__bj.phase === 'vitrine', null, 'vitrine', 180000)
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('ferme:v3') || '{}').state?.necklace)
  if (kept?.length !== 10) throw new Error(`le collier n'est pas gardé : ${JSON.stringify(kept)}`)
  await page.locator('#bjFini').click({ force: true, timeout: 120000 })
  await finDe('Quel joli collier', 60000)
})

/* 📿 Les perles à repasser des Bijoux (1/10) : le second atelier, une
   plaque en cœur ; des perles roses touchées une à une, une rangée GLISSÉE
   en violet, une perle reprise d'un toucher (la gomme) ; le fer ; la
   création fondue en l'air, « Au collier » : elle devient le PENDENTIF du
   collier (gardé, dans la vitrine du collier). */
await scenario('bijoux-perles-a-repasser-pendentif', async () => {
  await openGame('Les Bijoux', '__bj')
  await bjWait(() => window.__bj.phase === 'work', null, 'établi')
  await page.locator('#bjMode-hama').click({ force: true })
  await bjWait(() => window.__bj.mode === 'hama' && window.__bj.hama, null, 'les perles à repasser')
  await page.locator('.bj-shape[data-s="coeur"]').click({ force: true })
  await bjWait(() => window.__bj.hama.shape === 'coeur', null, 'la plaque en cœur')
  // Six perles roses, touchées
  await page.locator('.bj-potbtn[data-c="rose"]').click({ force: true })
  await bjWait(() => window.__bj.hama.color === 'rose', null, 'le pot rose')
  const pegs = await page.evaluate(() => window.__bj.freePegs(40))
  for (const g of pegs.slice(0, 6)) {
    const p = await page.evaluate(([c, r]) => window.__bj.peg(c, r), [g.c, g.r])
    await page.mouse.click(p.x, p.y)
  }
  await bjWait(() => window.__bj.hama.placed === 6, null, 'six perles touchées')
  // Une rangée glissée en violet : cinq picots libres côte à côte
  await page.locator('.bj-potbtn[data-c="violet"]').click({ force: true })
  await bjWait(() => window.__bj.hama.color === 'violet', null, 'le pot violet')
  const row = await page.evaluate(() => {
    const free = window.__bj.freePegs(400), set = new Set(free.map(f => f.c + ',' + f.r))
    for (const f of free) if ([1, 2, 3, 4].every(k => set.has((f.c + k) + ',' + f.r))) return [0, 1, 2, 3, 4].map(k => window.__bj.peg(f.c + k, f.r))
    return null
  })
  if (!row) throw new Error('pas de rangée libre de cinq picots')
  await page.mouse.move(row[0].x, row[0].y)
  await page.mouse.down()
  for (let i = 1; i <= 16; i++) await page.mouse.move(row[0].x + (row[4].x - row[0].x) * i / 16, row[0].y + (row[4].y - row[0].y) * i / 16)
  await page.mouse.up()
  await bjWait(() => window.__bj.hama.placed === 11, null, 'la rangée glissée')
  // La gomme : un toucher sur une perle posée la reprend
  await page.mouse.click(row[4].x, row[4].y)
  await bjWait(() => window.__bj.hama.placed === 10, null, 'une perle reprise')
  // Le fer : papier, fer, fusion, l'envol ; puis « Au collier »
  await bjWait(() => !window.__bj.hama.busy, null, 'les perles posées', 120000)
  await page.locator('#bjIron').click({ force: true })
  await bjWait(() => window.__bj.phase === 'iron', null, 'le fer')
  await bjWait(() => window.__bj.phase === 'fly' && window.__bj.choose, null, 'la création en l\'air', 300000)
  await page.locator('#bjCollar').click({ force: true })
  await bjWait(() => window.__bj.phase === 'vitrine', null, 'la vitrine du collier', 180000)
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('ferme:v3') || '{}').state)
  const pend = kept?.pendant
  const beads = (pend?.rows || []).join('').replace(/\./g, '').length
  if (beads !== 10) throw new Error(`le pendentif n'est pas gardé : ${JSON.stringify(pend)}`)
  if (!kept.creations?.length) throw new Error('la création n\'est pas dans la vitrine des créations')
  if (!(await page.evaluate(() => window.__bj.vitrinePendant))) throw new Error('pas de pendentif dans la vitrine du collier')
  await page.locator('#bjFini').click({ force: true, timeout: 120000 })
  await finDe('Quel joli collier', 60000)
})

/* 👗 Habille-toi (revenue le 6/10 à la place de la princesse VRM) : une
   couronne sur sa tête, gardée dans la sauvegarde ; « Fini » mène à l'écran de fin. */
await scenario('habille-toi', async () => {
  await openGame('Habille-toi', '__du')
  await page.waitForFunction(() => window.__du && window.__du.ready, null, { timeout: 120000, polling: 500 })
  await page.locator('.du-opt[data-k="hat"][data-v="crown"]').click({ force: true, timeout: 120000 })
  await page.waitForFunction(() => window.__du.look.hat === 'crown', null, { timeout: 20000, polling: 250 })
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('ferme:v3') || '{}').state?.look)
  if (!kept || kept.hat !== 'crown') throw new Error('le look de la petite fille n\'est pas gardé')
  await page.locator('#duDone').click({ force: true, timeout: 120000 })
  await finDe('Superbe look', 60000)
})

/* 🙈 Cache-Cache (1/10) : la ferme qu'on fait tourner. Le bot touche d'abord
   une cachette vide (rien ne doit se passer), puis il cherche comme un enfant :
   il touche un animal qu'il VOIT d'ici (le crochet ne rend que les points
   qu'aucun décor ne cache), sinon il fait tourner la ferme d'un glissé et
   attend qu'elle s'arrête. Tous trouvés : la fête, puis l'écran de fin. La
   carte ×4 (éclair et flamme, 6/10) : un glissé doit promener la vue et la
   molette zoomer ; quand il ne voit rien, il s'approche d'un animal (comme
   un enfant qui zoome sur un coin), en tournant un peu à chaque fois. La
   nuit (flamme), dix-huit animaux à la lampe torche. Avant de chercher, il
   appuie sur l'aide (27/10) : tous brillent, la carte ×4 recule en entier,
   et ses touchers passent à travers les halos. */
const cacheCache = async (tier, fin) => {
  await openGame('Cache-Cache', '__cc', tier)
  await page.waitForFunction(() => window.__cc.phase === 'seek', null, { timeout: 120000, polling: 500 })
  const total = await page.evaluate(() => window.__cc.total)
  const want = { easy: 5, med: 14, exp: 18 }[tier]
  if (total !== want) throw new Error(`${total} animaux au lieu de ${want}`)
  const calme = () => page.waitForFunction(() => !window.__cc.moving, null, { timeout: 60000, polling: 250 })
  await calme()
  // Une cachette vide : un petit bruit doux, rien d'autre
  const vide = await page.evaluate(() => window.__cc.emptySpot())
  if (vide) {
    await page.mouse.click(vide.x, vide.y)
    await page.waitForTimeout(700)
    if (await page.evaluate(() => window.__cc.found) !== 0) throw new Error(`la cachette vide ${vide.id} a trouvé un animal`)
  }
  const box = await page.locator('#ccWrap canvas').boundingBox()
  const carte = tier !== 'easy'
  if (carte) {
    // Un doigt qui glisse promène la vue ; la molette (le pincement) zoome
    const [x0, z0] = await page.evaluate(() => window.__cc.pan)
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6)
    await page.mouse.down()
    for (let k = 1; k <= 8; k++) await page.mouse.move(box.x + box.width * (0.6 - k * 0.03), box.y + box.height * (0.6 - k * 0.02))
    await page.mouse.up()
    await calme()
    const [x1, z1] = await page.evaluate(() => window.__cc.pan)
    if (Math.hypot(x1 - x0, z1 - z0) < 1) throw new Error(`le glissé ne promène pas la vue (${x0.toFixed(1)},${z0.toFixed(1)} → ${x1.toFixed(1)},${z1.toFixed(1)})`)
    const zoom0 = await page.evaluate(() => window.__cc.zoom)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -600)
    await calme()
    if (await page.evaluate(() => window.__cc.zoom) < zoom0 * 1.5) throw new Error('la molette ne zoome pas')
  }
  // L'aide : tous ceux qui restent cachés brillent ; sur la carte ×4, la vue recule sur toute la ferme
  await page.locator('#ccHelp').click()
  await page.waitForFunction(() => window.__cc.hint > 0, null, { timeout: 30000, polling: 200 })
    .catch(() => { throw new Error('l\'aide ne fait briller personne') })
  const brillent = await page.evaluate(() => window.__cc.hint)
  if (brillent !== total) throw new Error(`${brillent} animaux brillent au lieu de ${total}`)
  await calme()
  if (carte && await page.evaluate(() => window.__cc.zoom) > 1.1) throw new Error('l\'aide ne recule pas sur toute la ferme')
  let tours = 0, rates = 0
  for (let i = 0; i < 260; i++) {
    // Ceux qu'on voit dépasser, puis ceux qui se cachent EN ENTIER : on fouille leur cachette
    const st = await page.evaluate(() => {
      const all = window.__cc.animals()
      const a = all.filter(a => !a.found && a.x !== null && a.state === 'hidden')
      const fouille = all.map((a, i) => ({ ...a, i })).filter(a => !a.found && a.inside && a.state === 'hidden')
        .map(a => ({ ...a, at: window.__cc.spotAt(a.i) })).filter(a => a.at)
      const reste = all.map((a, i) => ({ ...a, i })).filter(a => !a.found).map(a => a.i)
      return { found: window.__cc.found, total: window.__cc.total, a, fouille, reste }
    })
    if (st.found >= st.total) break
    const cible = st.a[0] ?? (st.fouille[0] && { ...st.fouille[0], x: st.fouille[0].at.x, y: st.fouille[0].at.y })
    if (cible) {
      await page.mouse.click(cible.x, cible.y)
      const ok = await page.waitForFunction(n => window.__cc.found > n, st.found, { timeout: 15000, polling: 250 }).then(() => true, () => false)
      if (!ok && ++rates > 8) throw new Error(`le toucher ne trouve pas ${cible.kind} (${cible.slot}${cible.inside ? ', caché en entier' : ''})`)
    } else if (carte) {
      // Rien de visible d'ici : on s'approche de l'un d'eux, en tournant, de plus ou moins près, de biais ou d'en haut
      if (++tours > 120) {
        const qui = await page.evaluate(() => window.__cc.animals().filter(a => !a.found).map(a => `${a.kind} ${a.slot} (${a.peek}, ${a.pts} points)`).join(' ; '))
        throw new Error(`${st.total - st.found} animaux restent introuvables après ${tours - 1} visites : ${qui}`)
      }
      const n = st.reste[tours % st.reste.length], k = Math.floor(tours / st.reste.length)
      await page.evaluate(([n, k]) => window.__cc.visit(n, 0.9 + (k % 3) * 0.6, [0.42, 0.26, 0.6][k % 3], k % 2 ? 1.35 : window.__cc.BASE_EL), [n, k])
      await page.waitForTimeout(400)
    } else {
      // Rien de visible d'ici : on fait tourner la ferme
      if (++tours > 40) throw new Error(`${st.total - st.found} animaux restent introuvables après ${tours} tours`)
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.8)
      await page.mouse.down()
      for (let k = 1; k <= 6; k++) await page.mouse.move(box.x + box.width * (0.3 + k * 0.05), box.y + box.height * 0.8)
      await page.mouse.up()
      await calme()
    }
  }
  await page.waitForFunction(t => document.querySelector('#result.show') && document.body.innerText.includes(t), fin, { timeout: 90000, polling: 500 })
}
/* 🦜 L'Animal qui répète : le faux micro « parle », il entend et répète
   (la bouche s'ouvre) ; il répète encore avec un autre animal, puis à
   l'envers ; le micro se coupe en pause et en sortant. */
await scenario('animal-qui-repete', async () => {
  await ctx.grantPermissions(['microphone'])
  await openGame("L'Animal qui répète", '__ar')
  await page.waitForFunction(() => window.__ar.micLive, null, { timeout: 60000, polling: 500 })
    .catch(async () => { throw new Error(`le micro ne s'ouvre pas (${await page.evaluate(() => window.__ar.micErr)})`) })
  await page.waitForFunction(() => window.__ar.repeats >= 1, null, { timeout: 60000, polling: 250 })
  await page.waitForFunction(() => window.__ar.maxOpen > 0.3, null, { timeout: 15000, polling: 100 })
    .catch(async () => { throw new Error(`il répète sans ouvrir la bouche (${await page.evaluate(() => window.__ar.maxOpen)})`) })
  await page.locator('.ar-pick[data-k="cow"]').click()
  const etat = () => page.evaluate(() => JSON.stringify({ ph: window.__ar.phase, k: window.__ar.kind, rep: window.__ar.repeats, mic: window.__ar.micLive, env: window.__ar.backwards }))
  await page.waitForFunction(() => window.__ar.kind === 'cow', null, { timeout: 10000 })
    .catch(async () => { throw new Error(`la vache ne vient pas (${await etat()})`) })
  let n = await page.evaluate(() => window.__ar.repeats)
  await page.waitForFunction(k => window.__ar.repeats > k, n, { timeout: 60000, polling: 250 })
  await page.locator('#arRev').click()
  n = await page.evaluate(() => window.__ar.repeats)
  await page.waitForFunction(k => window.__ar.backwards && window.__ar.repeats > k, n, { timeout: 60000, polling: 250 })
  // Pause : le micro se coupe ; reprise : il se rouvre
  await page.locator('.pbtn[aria-label="Pause"]').click()
  await page.waitForFunction(() => !window.__ar.micLive, null, { timeout: 10000 })
    .catch(async () => { throw new Error(`la pause ne coupe pas le micro (${await etat()})`) })
  await page.locator('.pausewall').click({ force: true }).catch(() => {})
  await page.waitForFunction(() => window.__ar.micLive, null, { timeout: 15000, polling: 250 })
    .catch(async () => { throw new Error(`le micro ne se rouvre pas après la pause (${await etat()})`) })
  // On sort : le micro est coupé pour de bon
  await page.locator('.pbtn[aria-label="Menu"]').click()
  await page.waitForFunction(() => window.__ar.phase === 'gone' && !window.__ar.micLive, null, { timeout: 10000 })
    .catch(async () => { throw new Error(`en sortant, le micro reste ouvert (${await etat()})`) })
})

/* 🏡 La Ferme à construire : glisser la grange du tiroir, toucher la mare,
   deux animaux (la vache se promène), la grange au panier, un chemin et une
   clôture au doigt, la gomme ; on sort, on revient : la ferme est gardée ;
   puis la nuit. */
await scenario('ferme-a-construire', async () => {
  await page.goto(URL, { waitUntil: 'networkidle' })
  const oublie = () => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('ferme:construire')).forEach(k => localStorage.removeItem(k)))
  await oublie()
  await openGame('La Ferme à construire', '__fb')
  // Une carte par fille (11/10) : celle de Jade
  const ferme = async qui => {
    await page.waitForFunction(() => window.__fb.cards, null, { timeout: 30000, polling: 250 })
    await page.locator(`.fb-card[data-who="${qui}"]`).click({ force: true })
    await page.waitForFunction(q => window.__fb.ready && window.__fb.who === q, qui, { timeout: 120000, polling: 500 })
  }
  await ferme('jade')
  const etat = () => page.evaluate(() => JSON.stringify({ p: window.__fb.pieces.map(x => x.id), a: window.__fb.animals.map(x => x.id), ch: window.__fb.paths, cl: window.__fb.fences, n: window.__fb.night }))
  const cv = await page.locator('.fb-wrap > canvas').boundingBox()
  const glisse = async (from, to, steps = 14) => {
    await page.mouse.move(from.x, from.y); await page.mouse.down()
    for (let i = 1; i <= steps; i++) await page.mouse.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps)
    await page.mouse.up()
  }
  const centre = async sel => { const b = await page.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
  // La grange, glissée du tiroir sur la ferme
  await glisse(await centre('.fb-item[data-id="barn"]'), { x: cv.x + cv.width * 0.4, y: cv.y + cv.height * 0.4 })
  await page.waitForFunction(() => window.__fb.pieces.length === 1, null, { timeout: 10000 })
    .catch(async () => { throw new Error(`la grange n'est pas posée (${await etat()})`) })
  // La mare, juste touchée
  await page.locator('.fb-tab[data-tab="nature"]').click()
  await page.locator('.fb-item[data-id="pond"]').click()
  await page.waitForFunction(() => window.__fb.pieces.length === 2, null, { timeout: 10000 })
  // Deux animaux ; la vache se promène
  await page.locator('.fb-tab[data-tab="animaux"]').click()
  await page.locator('.fb-item[data-id="cow"]').click()
  await page.locator('.fb-item[data-id="duck"]').click()
  await page.waitForFunction(() => window.__fb.animals.length === 2, null, { timeout: 10000 })
  const v0 = await page.evaluate(() => window.__fb.animals[0])
  await page.waitForFunction(v => { const a = window.__fb.animals[0]; return Math.hypot(a.x - v.x, a.z - v.z) > 0.3 }, v0, { timeout: 30000, polling: 250 })
    .catch(async () => { throw new Error(`la vache ne bouge pas (${await etat()})`) })
  // La grange au panier
  await glisse(await page.evaluate(() => window.__fb.at(0)), await centre('#fbTrash'), 18)
  await page.waitForFunction(() => window.__fb.pieces.length === 1 && window.__fb.pieces[0].id === 'pond', null, { timeout: 10000 })
    .catch(async () => { throw new Error(`la grange n'est pas au panier (${await etat()})`) })
  // Annuler (11/10) : la grange revient ; refaire : elle repart au panier
  await page.locator('#fbUndo').click()
  await page.waitForFunction(() => window.__fb.pieces.length === 2 && window.__fb.redo === 1, null, { timeout: 10000 })
    .catch(async () => { throw new Error(`« Annuler » ne rend pas la grange (${await etat()})`) })
  await page.locator('#fbRedo').click()
  await page.waitForFunction(() => window.__fb.pieces.length === 1 && window.__fb.redo === 0, null, { timeout: 10000 })
    .catch(async () => { throw new Error(`« Refaire » ne la rejette pas (${await etat()})`) })
  // Un chemin, une clôture, puis la gomme sur le chemin
  const trait = async (y) => glisse({ x: cv.x + cv.width * 0.25, y: cv.y + cv.height * y }, { x: cv.x + cv.width * 0.7, y: cv.y + cv.height * (y + 0.05) }, 20)
  await page.locator('.fb-tool[data-tool="path"]').click()
  await trait(0.55)
  await page.locator('.fb-tool[data-tool="fence"]').click()
  await trait(0.3)
  await page.waitForFunction(() => window.__fb.paths === 1 && window.__fb.fences === 1, null, { timeout: 10000 })
    .catch(async () => { throw new Error(`chemin ou clôture manquant (${await etat()})`) })
  await page.locator('.fb-tool[data-tool="erase"]').click()
  await trait(0.55)
  await page.waitForFunction(() => window.__fb.paths === 0 && window.__fb.fences === 1, null, { timeout: 10000 })
    .catch(async () => { throw new Error(`la gomme n'a pas effacé le chemin (${await etat()})`) })
  // Le coup de gomme annulé : le chemin revient (une étape), refait : il repart
  await page.locator('#fbUndo').click()
  await page.waitForFunction(() => window.__fb.paths === 1, null, { timeout: 10000 })
    .catch(async () => { throw new Error(`« Annuler » ne rend pas le chemin (${await etat()})`) })
  await page.locator('#fbRedo').click()
  await page.waitForFunction(() => window.__fb.paths === 0 && window.__fb.fences === 1, null, { timeout: 10000 })
    .catch(async () => { throw new Error(`« Refaire » ne regomme pas (${await etat()})`) })
  // La poubelle (27/10) : le premier toucher l'arme (rien ne change), le second vide la ferme
  // — UNE étape : « Annuler » fait tout revenir (les deux d'un coup : la 3D logicielle passe les 2,6 s armées)
  const avant = await page.evaluate(() => ({ n: window.__fb.pieces.length + window.__fb.animals.length, f: window.__fb.fences, u: window.__fb.undo }))
  const vide = await page.evaluate(() => {
    const b = document.querySelector('#fbReset')
    b.click()
    const r = { arm: b.classList.contains('arm'), n: window.__fb.pieces.length + window.__fb.animals.length }
    b.click()
    return r
  })
  if (!vide.arm || vide.n !== avant.n) throw new Error(`le premier toucher n'arme pas la poubelle, ou vide déjà (${JSON.stringify(vide)})`)
  await page.waitForFunction(u => !window.__fb.pieces.length && !window.__fb.animals.length && !window.__fb.fences && !window.__fb.paths && window.__fb.undo === u + 1, avant.u, { timeout: 10000, polling: 200 })
    .catch(async () => { throw new Error(`la poubelle ne vide pas la ferme en une étape (${await etat()})`) })
  await page.locator('#fbUndo').click()
  await page.waitForFunction(a => window.__fb.pieces.length + window.__fb.animals.length === a.n && window.__fb.fences === a.f, avant, { timeout: 20000, polling: 250 })
    .catch(async () => { throw new Error(`« Annuler » ne rend pas la ferme vidée (${await etat()})`) })
  // On sort, on revient : la ferme de Jade est gardée, et sa carte a la photo de sa ferme
  await page.locator('.pbtn[aria-label="Menu"]').click()
  await openGame('La Ferme à construire', '__fb')
  await page.waitForFunction(() => window.__fb.cards && document.querySelector('.fb-card[data-who="jade"].last img'), null, { timeout: 30000, polling: 250 })
    .catch(async () => { throw new Error('la carte de Jade n’a pas la photo de sa ferme') })
  await ferme('jade')
  await page.waitForFunction(() => window.__fb.ready && window.__fb.pieces.length === 1 && window.__fb.animals.length === 2 && window.__fb.fences === 1, null, { timeout: 120000, polling: 500 })
    .catch(async () => { throw new Error(`la ferme n'est pas gardée (${await etat()})`) })
  // La ferme de Joyce est à elle : vide, puis un cochon ; celle de Jade n'a pas bougé
  await page.locator('#fbMe').click()
  await ferme('joyce')
  if (await page.evaluate(() => window.__fb.pieces.length + window.__fb.animals.length + window.__fb.fences)) throw new Error(`la ferme de Joyce n'est pas neuve (${await etat()})`)
  await page.locator('.fb-tab[data-tab="animaux"]').click()
  await page.locator('.fb-item[data-id="pig"]').click()
  await page.waitForFunction(() => window.__fb.animals.length === 1, null, { timeout: 10000 })
  await page.locator('#fbMe').click()
  await ferme('jade')
  await page.waitForFunction(() => window.__fb.pieces.length === 1 && window.__fb.animals.length === 2 && !window.__fb.animals.some(a => a.id === 'pig'), null, { timeout: 30000, polling: 500 })
    .catch(async () => { throw new Error(`la ferme de Jade a changé (${await etat()})`) })
  // La nuit
  await page.locator('#fbNight').click()
  await page.waitForFunction(() => window.__fb.ready && window.__fb.night && window.__fb.pieces.length === 1, null, { timeout: 120000, polling: 500 })
    .catch(async () => { throw new Error(`la nuit ne vient pas (${await etat()})`) })
  await oublie()
})

/* 🧸 Mon dessin prend vie (18/10, la Ferme à construire) : « Fini » sur la
   feuille vide ne fait rien ; un animal tracé à la souris devient peluche ;
   le bot répond à la place de Claude (`__fb.fakeVivant` : jamais de vrai
   appel) ; il se retourne selon son sens ; annuler, refaire ; un second
   dessin sans réponse vit quand même ; gardé à la sortie, et la nuit. */
await scenario('ferme-a-construire-dessin', async () => {
  const oublie = () => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('ferme:construire')).forEach(k => localStorage.removeItem(k)))
  await page.goto(URL, { waitUntil: 'networkidle' })
  await oublie()
  await openGame('La Ferme à construire', '__fb')
  const ferme = async () => {
    await page.waitForFunction(() => window.__fb.cards, null, { timeout: 30000, polling: 250 })
    await page.locator('.fb-card[data-who="jade"]').click({ force: true })
    await page.waitForFunction(() => window.__fb.ready && window.__fb.who === 'jade', null, { timeout: 120000, polling: 500 })
  }
  await ferme()
  const etat = () => page.evaluate(() => JSON.stringify({ d: window.__fb.drawn, f: window.__fb.sheet, u: window.__fb.undo }))
  await page.evaluate(() => { window.__fb.fakeVivant = () => ({ allure: 'saute', regard: 'gauche', cri: 'chat', taille: 'petit' }) })
  await page.locator('#fbPen').click()
  await page.waitForFunction(() => window.__fb.sheet, null, { timeout: 10000 })
  // « Fini » sur la feuille vide : rien ne naît, la feuille reste
  await page.locator('.fb-ddone button').click({ force: true })
  await page.waitForTimeout(500)
  if (await page.evaluate(() => window.__fb.drawn.length || !window.__fb.sheet)) throw new Error(`la feuille vide a fait une peluche (${await etat()})`)
  // Un rond, deux pattes, un œil (peu de points : la 3D logicielle est lente)
  const dessine = async () => {
    const b = await page.locator('.fb-dpaper canvas').boundingBox()
    const at = (x, y) => [b.x + b.width * x, b.y + b.height * y]
    const trait = async pts => {
      await page.mouse.move(...at(...pts[0])); await page.mouse.down()
      for (const p of pts.slice(1)) await page.mouse.move(...at(...p))
      await page.mouse.up()
    }
    await trait(Array.from({ length: 17 }, (_, k) => { const a = k / 16 * Math.PI * 2.05; return [0.5 + Math.cos(a) * 0.2, 0.45 + Math.sin(a) * 0.2] }))
    await trait([[0.42, 0.62], [0.41, 0.8], [0.45, 0.8]])
    await trait([[0.58, 0.62], [0.59, 0.8], [0.63, 0.8]])
    await page.locator('.at-color[data-c="#3A2E25"]').click()
    await trait([[0.42, 0.4], [0.425, 0.405]])
  }
  await dessine()
  await page.locator('.fb-ddone button').click({ force: true })
  await page.waitForFunction(() => window.__fb.drawn.length === 1 && !window.__fb.sheet, null, { timeout: 15000, polling: 250 })
    .catch(async () => { throw new Error(`pas de peluche après « Fini » (${await etat()})`) })
  // « Claude » répond : il s'éveille (un petit qui saute, qui regarde à gauche)
  await page.waitForFunction(() => { const d = window.__fb.drawn[0]; return d.v?.allure === 'saute' && !d.asking && d.birth === 0 }, null, { timeout: 20000, polling: 250 })
    .catch(async () => { throw new Error(`la réponse n'arrive pas (${await etat()})`) })
  // Il se retourne selon son sens : vers la gauche on voit son dessin, vers la droite son dos
  for (const [side, want] of [[-1, 1], [1, -1]]) {
    await page.evaluate(sd => window.__fb.walk(0, sd), side)
    await page.waitForFunction(w => window.__fb.facing(0) === w, want, { timeout: 15000, polling: 250 })
      .catch(async () => { throw new Error(`il ne se retourne pas vers ${side} (${await etat()})`) })
  }
  // Annuler : il s'en va ; refaire : il revient, avec ce que Claude a dit de lui
  await page.locator('#fbUndo').click()
  await page.waitForFunction(() => window.__fb.drawn.length === 0, null, { timeout: 10000 })
    .catch(async () => { throw new Error(`« Annuler » ne l'enlève pas (${await etat()})`) })
  await page.locator('#fbRedo').click()
  await page.waitForFunction(() => window.__fb.drawn.length === 1 && window.__fb.drawn[0].v?.cri === 'chat', null, { timeout: 15000 })
    .catch(async () => { throw new Error(`« Refaire » ne le rend pas (${await etat()})`) })
  // Un second dessin, sans réponse : il vit quand même (il sautille, sans cri)
  await page.evaluate(() => { window.__fb.fakeVivant = () => null })
  await page.locator('#fbPen').click()
  await page.waitForFunction(() => window.__fb.sheet, null, { timeout: 10000 })
  await dessine()
  await page.locator('.fb-ddone button').click({ force: true })
  await page.waitForFunction(() => window.__fb.drawn.length === 2 && !window.__fb.drawn[1].asking && window.__fb.drawn[1].v === null, null, { timeout: 20000, polling: 250 })
    .catch(async () => { throw new Error(`le dessin sans réponse reste figé (${await etat()})`) })
  const p0 = await page.evaluate(() => window.__fb.drawn[1])
  await page.waitForFunction(p => { const d = window.__fb.drawn[1]; return Math.hypot(d.x - p.x, d.z - p.z) > 0.3 }, p0, { timeout: 30000, polling: 250 })
    .catch(async () => { throw new Error(`le dessin sans réponse ne bouge pas (${await etat()})`) })
  // On sort, on revient : les deux sont gardés (le premier avec sa fiche)
  await page.locator('.pbtn[aria-label="Menu"]').click()
  await openGame('La Ferme à construire', '__fb')
  await ferme()
  await page.waitForFunction(() => window.__fb.drawn.length === 2 && window.__fb.drawn.filter(d => d.v?.cri === 'chat').length === 1, null, { timeout: 60000, polling: 500 })
    .catch(async () => { throw new Error(`les dessins ne sont pas gardés (${await etat()})`) })
  // La nuit refait la scène : ils sont toujours là
  await page.locator('#fbNight').click()
  await page.waitForFunction(() => window.__fb.ready && window.__fb.night && window.__fb.drawn.length === 2, null, { timeout: 120000, polling: 500 })
    .catch(async () => { throw new Error(`la nuit perd les dessins (${await etat()})`) })
  await oublie()
})

/* 🎂 Le gâteau de la Cuisine (la Pâtisserie) : deux étages en cœur, le glaçage au doigt (flanc et
   nappage), une ligne de crème, une fraise et des vermicelles, trois
   bougies ; « Manger » : les bougies sortent (19/10 : plus de souffle ni de
   chanson), les six parts, l'écran de fin. */
/* 🎨 Devine mon dessin (8/10) : jamais de vrai appel à Claude ici (ni clé ni
   coût) — sans clé, la bulle montre le cadenas et le bouton « Clé » paraît ;
   puis le bot répond à la place de Claude (`__dg.fake`). En Libre : il
   propose, « Non », il propose autre chose, « Oui », la fête. En Défi (cinq
   dessins) : il se trompe puis trouve ; une fois il ne trouve pas, on passe
   (« Suivant ») ; l'écran de fin compte les dessins devinés. Les traits sont
   tracés à la souris, sur la vraie feuille. */
await scenario('devine-mon-dessin', async () => {
  await openGame('Devine mon dessin', '__dg', 'easy')
  await page.waitForFunction(() => window.__dg.ready && window.__dg.phase === 'draw', null, { timeout: 60000, polling: 250 })
  const draw = async () => {
    const b = await page.locator('#dgCv').boundingBox()
    await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.4)
    await page.mouse.down()
    for (let k = 1; k <= 12; k++) { const a = k / 12 * Math.PI * 2; await page.mouse.move(b.x + b.width * (0.5 + Math.cos(a) * 0.12), b.y + b.height * (0.45 + Math.sin(a) * 0.15)) }
    await page.mouse.up()
    if (!(await page.evaluate(() => window.__dg.dirty))) throw new Error('le doigt ne dessine pas sur la feuille')
  }
  // « Fini » respire quand le dessin est prêt : un bouton animé ne paraît jamais « stable » (piège connu)
  const fini = async () => { await page.locator('#dgDone button').click({ force: true }); await page.waitForFunction(() => window.__dg.phase !== 'draw', null, { timeout: 10000, polling: 100 }) }
  // Sans clé au Worker (le devineur répond « cle ») : le cadenas, et l'on dessine encore
  await page.evaluate(() => { window.__dg.fake = () => { throw { why: 'cle' } } })
  await draw()
  await page.locator('#dgDone button').click({ force: true })
  await page.waitForFunction(() => window.__dg.error === 'cle', null, { timeout: 10000, polling: 100 })
  if (!(await page.locator('#dgBubble .dg-icon').isVisible())) throw new Error('sans clé, pas de cadenas')
  if (await page.evaluate(() => window.__dg.phase) !== 'draw') throw new Error('sans clé, la feuille ne revient pas')
  // Libre : « Non », une autre idée, « Oui »
  await page.evaluate(() => { window.__dg.fake = () => ({ items: [{ article: 'un', mot: 'soleil', photo: null }, { article: 'un', mot: 'chat', photo: 'cat' }] }) })
  await page.locator('.dg-mode[data-m="libre"]').click()
  await draw(); await fini()
  await page.waitForFunction(() => window.__dg.shown?.mot === 'soleil', null, { timeout: 20000, polling: 200 })
  await page.locator('#dgNo').click()
  await page.waitForFunction(() => window.__dg.shown?.mot === 'chat', null, { timeout: 20000, polling: 200 })
  await page.locator('#dgYes').click()
  await page.waitForFunction(() => window.__dg.round === 1, null, { timeout: 30000, polling: 250 })
  // Défi : il se trompe, puis trouve ; au troisième dessin il ne trouve pas, on passe
  await page.locator('.dg-mode[data-m="defi"]').click()
  for (let r = 0; r < 5; r++) {
    await page.waitForFunction(n => window.__dg.round === n && window.__dg.phase === 'draw', r, { timeout: 30000, polling: 250 })
    const miss = r === 2
    await page.evaluate(m => { window.__dg.fake = t => ({ items: [{ article: 'un', mot: 'chien', photo: 'dog' }, ...(m ? [] : [{ article: '', mot: 'ça', photo: t }])] }) }, miss)
    await draw(); await fini()
    if (miss) {
      await page.waitForFunction(() => window.__dg.phase === 'draw', null, { timeout: 30000, polling: 250 })
      await page.locator('#dgNext button').click()
    }
  }
  await page.waitForFunction(() => document.querySelector('#result.show') && document.body.innerText.includes('Il a reconnu'), null, { timeout: 60000, polling: 500 })
})
await scenario('patisserie', async () => {
  await openGame('La Cuisine', '__bk', 'easy', null, 'gateau')
  await page.waitForFunction(() => window.__bk.ready, null, { timeout: 120000, polling: 500 })
  const etat = () => page.evaluate(() => JSON.stringify({ st: window.__bk.step, ph: window.__bk.phase, t: window.__bk.tiers, b0: window.__bk.body(0), g1: window.__bk.glazed(window.__bk.tiers - 1), cr: window.__bk.count('rosace'), fr: window.__bk.count('fraise'), sp: window.__bk.sprinkles, bougies: window.__bk.candles }))
  const tap = async p => { await page.mouse.click(p.x, p.y) }
  await page.locator('.bk-opt[data-tiers="2"]').click({ force: true, timeout: 120000 })
  await page.locator('.bk-opt[data-shape="heart"]').click({ force: true, timeout: 120000 })
  await page.waitForFunction(() => window.__bk.tiers === 2 && window.__bk.shape === 'heart', null, { timeout: 10000 })
  // Le glaçage : le flanc en rose, le dessus (le nappage coule)
  await page.locator('.bk-step[data-step="glacage"]').click({ force: true, timeout: 120000 })
  await page.locator('.bk-opt[data-glaze="#F58FB8"]').click({ force: true, timeout: 120000 })
  await tap(await page.evaluate(() => window.__bk.side(0)))
  await page.waitForFunction(() => window.__bk.body(0) !== '#e9b872', null, { timeout: 60000, polling: 250 })
    .catch(async () => { throw new Error(`le flanc n'a pas pris le glaçage (${await etat()})`) })
  await tap(await page.evaluate(() => window.__bk.top()))
  await page.waitForFunction(() => window.__bk.glazed(window.__bk.tiers - 1), null, { timeout: 10000 })
    .catch(async () => { throw new Error(`le nappage n'a pas coulé (${await etat()})`) })
  // La crème : un trait sur le dessus de l'étage du bas
  await page.locator('.bk-step[data-step="creme"]').click({ force: true, timeout: 120000 })
  const a = await page.evaluate(() => window.__bk.top(0, 0.82))
  await page.mouse.move(a.x - 80, a.y + 4); await page.mouse.down()
  for (let i = 1; i <= 16; i++) await page.mouse.move(a.x - 80 + i * 10, a.y + 4)
  await page.mouse.up()
  await page.waitForFunction(() => window.__bk.count('rosace') >= 3, null, { timeout: 10000 })
    .catch(async () => { throw new Error(`pas de crème (${await etat()})`) })
  // Le décor : une fraise, des vermicelles
  await page.locator('.bk-step[data-step="decor"]').click({ force: true, timeout: 120000 })
  await page.locator('.bk-opt[data-deco="fraise"]').click({ force: true, timeout: 120000 })
  await tap(await page.evaluate(() => window.__bk.top(undefined, 0.2)))
  await page.waitForFunction(() => window.__bk.count('fraise') >= 1, null, { timeout: 10000 })
    .catch(async () => { throw new Error(`pas de fraise (${await etat()})`) })
  await page.locator('.bk-opt[data-deco="vermicelles"]').click({ force: true, timeout: 120000 })
  const v = await page.evaluate(() => window.__bk.top(undefined, 0.4))
  await page.mouse.move(v.x - 30, v.y); await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(v.x - 30 + i * 8, v.y + (i % 2) * 4)
  await page.mouse.up()
  await page.waitForFunction(() => window.__bk.sprinkles > 0, null, { timeout: 10000 })
    .catch(async () => { throw new Error(`pas de vermicelles (${await etat()})`) })
  // Les bougies : une décoration
  await page.locator('.bk-step[data-step="bougies"]').click({ force: true, timeout: 120000 })
  for (const d of [0.2, 0.45, 0.6]) await tap(await page.evaluate(d => window.__bk.top(undefined, d), d))
  await page.waitForFunction(() => window.__bk.candles >= 2, null, { timeout: 30000 })
    .catch(async () => { throw new Error(`les bougies ne se plantent pas (${await etat()})`) })
  // « Manger » : les bougies sortent, six coups de couteau, puis on MANGE tout le gâteau (19/10 :
  // un toucher prend une part, elle vient à nous, croc, croc, avalée) ;
  // le temps du jeu suit les images (une par seconde sous la 3D logicielle), on l'accélère
  await page.evaluate(() => window.__bk.speed(4))
  await page.locator('#bkEat').click({ force: true, timeout: 120000 })
  await page.waitForFunction(() => window.__bk.candles === 0, null, { timeout: 60000, polling: 250 })
    .catch(async () => { throw new Error(`les bougies ne sortent pas (${await etat()})`) })
  const mange = () => page.evaluate(() => JSON.stringify(window.__bk.eat))
  await page.waitForFunction(() => window.__bk.eat?.at, null, { timeout: 240000, polling: 500 })
    .catch(async () => { throw new Error(`le gâteau n'est pas coupé (${await etat()} ${await mange()})`) })
  if (await page.evaluate(() => window.__bk.eat.cuts) !== 6) throw new Error(`le couteau n'a pas fait six coupes (${await mange()})`)
  for (let n = 0; n < 30 && await page.evaluate(() => window.__bk.phase) === 'eat'; n++) {
    await page.waitForFunction(() => window.__bk.eat?.at || window.__bk.phase !== 'eat', null, { timeout: 120000, polling: 300 })
      .catch(async () => { throw new Error(`on ne peut plus toucher (${await mange()})`) })
    const at = await page.evaluate(() => window.__bk.eat?.at)
    if (at) await tap(at)
  }
  await finDe('Gâteau dévoré', 120000).catch(async () => { throw new Error(`le gâteau n'est pas fini (${await mange()})`) })
})
// Sans une bougie, et à VITESSE NORMALE (19/10) : le repas ne commençait jamais en temps réel
// (le gâteau tournait en même temps qu'il se remettait de face) — en temps accéléré, on ne le voyait pas
await scenario('patisserie-sans-bougie', async () => {
  await openGame('La Cuisine', '__bk', 'easy', null, 'gateau')
  await page.waitForFunction(() => window.__bk.ready, null, { timeout: 120000, polling: 500 })
  await page.locator('#bkEat').click({ force: true, timeout: 120000 })
  await page.waitForFunction(() => window.__bk.phase === 'prep' || window.__bk.phase === 'eat', null, { timeout: 10000, polling: 250 })
    .catch(async () => { throw new Error(`« Manger » ne prépare pas le repas (${await page.evaluate(() => window.__bk.phase)})`) })
  await page.waitForFunction(() => window.__bk.eat?.at, null, { timeout: 240000, polling: 500 })
    .catch(async () => { throw new Error(`le gâteau n'est pas coupé (${await page.evaluate(() => JSON.stringify({ ph: window.__bk.phase, w: window.__bk.warmLeft, e: window.__bk.eat }))})`) })
  if (await page.evaluate(() => window.__bk.warmLeft) !== 0) throw new Error('le repas a commencé avant que ses rendus soient prêts')
  await page.mouse.click(...Object.values(await page.evaluate(() => window.__bk.eat.at)))
  await page.waitForFunction(() => window.__bk.eat?.bites >= 2, null, { timeout: 60000, polling: 300 })
    .catch(async () => { throw new Error(`pas de bouchée (${await page.evaluate(() => JSON.stringify(window.__bk.eat))})`) })
  await page.waitForFunction(() => window.__bk.eat?.eaten === 1, null, { timeout: 60000, polling: 300 })
    .catch(async () => { throw new Error(`la part n'est pas avalée (${await page.evaluate(() => JSON.stringify(window.__bk.eat))})`) })
})

/* 🎒 Mon cartable (19/10) : le cartable de Joyce, de bout en bout — le
   modèle, les paillettes caressées vers le haut (elles se retournent), la
   couleur du corps au doigt, un motif, un écusson posé puis repris, un
   porte-clés, la poubelle (deux touchers : le cartable de départ), les six
   affaires rangées, et « Fini » : elle part à l'école. */
await scenario('cartable', async () => {
  await openGame('Mon cartable', '__ct')
  await page.evaluate(() => { localStorage.removeItem('ferme:cartable:joyce'); localStorage.removeItem('ferme:cartable:photo:joyce') })
  await page.waitForFunction(() => window.__ct.cards, null, { timeout: 60000, polling: 500 })
  await page.locator('.ct-card[data-who="joyce"]').click()
  const pret = () => page.waitForFunction(() => window.__ct.ready, null, { timeout: 120000, polling: 300 })
  const etat = () => page.evaluate(() => JSON.stringify({ st: window.__ct.step, look: window.__ct.look, fl: window.__ct.flipped, pk: window.__ct.packed }))
  await pret()
  // Le modèle : le sac à dos, puis le cartable à rabat
  await page.locator('.ct-opt[data-model="dos"]').click({ force: true }); await pret()
  if (await page.evaluate(() => window.__ct.look.model) !== 'dos') throw new Error(`pas de sac à dos (${await etat()})`)
  await page.locator('.ct-opt[data-model="rabat"]').click({ force: true }); await pret()
  // Les paillettes : on les caresse vers le haut, elles se retournent
  await page.locator('.ct-step[data-step="matiere"]').click({ force: true })
  await page.locator('.ct-opt[data-fabric="paillettes"]').click({ force: true }); await pret()
  const [a, b] = await page.evaluate(() => window.__ct.stroke())
  await page.mouse.move(a.x, a.y); await page.mouse.down()
  for (let i = 1; i <= 12; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / 12, a.y + (b.y - a.y) * i / 12); await page.waitForTimeout(50) }
  await page.mouse.up()
  await page.waitForFunction(() => window.__ct.flipped > 10, null, { timeout: 30000, polling: 300 })
    .catch(async () => { throw new Error(`les paillettes ne se retournent pas (${await etat()})`) })
  // La couleur : le bleu, sur le corps (sous le rabat)
  await page.locator('.ct-step[data-step="couleurs"]').click({ force: true })
  await page.locator('.ct-opt[data-color="#4FB8E7"]').click({ force: true })
  const sz = await page.evaluate(() => window.__ct.size)
  const corps = await page.evaluate(sz => window.__ct.pt(0, -0.38 * sz.H, sz.D / 2), sz)
  await page.mouse.click(corps.x, corps.y); await pret()
  await page.waitForFunction(() => window.__ct.look.body === '#4FB8E7', null, { timeout: 30000, polling: 300 })
    .catch(async () => { throw new Error(`le corps n'est pas peint (${await etat()})`) })
  if (await page.evaluate(() => window.__ct.flipped) <= 10) throw new Error('les paillettes retournées sont perdues en repeignant')
  // Le motif
  await page.locator('.ct-step[data-step="motifs"]').click({ force: true })
  await page.locator('.ct-opt[data-motif="pois"]').click({ force: true }); await pret()
  // La déco : une étoile brodée posée sur le rabat, reprise, reposée ; un porte-clés
  await page.locator('.ct-step[data-step="deco"]').click({ force: true })
  await page.locator('.ct-opt[data-patch="etoile"]').click({ force: true })
  const ou = await page.evaluate(() => window.__ct.pt(0.28, 0.08))
  await page.mouse.click(ou.x, ou.y); await pret()
  await page.waitForFunction(() => window.__ct.look.patches.length === 1, null, { timeout: 30000, polling: 300 })
    .catch(async () => { throw new Error(`l'écusson ne se pose pas (${await etat()})`) })
  await page.mouse.click(ou.x, ou.y); await pret()
  await page.waitForFunction(() => window.__ct.look.patches.length === 0, null, { timeout: 30000, polling: 300 })
    .catch(async () => { throw new Error(`l'écusson ne se reprend pas (${await etat()})`) })
  await page.mouse.click(ou.x, ou.y); await pret()
  await page.locator('.ct-opt[data-charm="chick"]').click({ force: true }); await pret()
  if (await page.evaluate(() => window.__ct.look.charms.length) !== 1) throw new Error(`pas de porte-clés (${await etat()})`)
  // Effacer : un toucher arme la poubelle (rien ne change), le second rend le cartable de départ, à
  // l'étape Modèle — et ses paillettes retournées ne reviennent pas avec les paillettes
  // (les deux d'un coup : sous la 3D logicielle, une image passe les 2,6 s où elle reste armée)
  const arme = await page.evaluate(() => {
    const b = document.querySelector('#ctReset')
    b.click()
    const r = { arm: b.classList.contains('arm'), charms: window.__ct.look.charms.length }
    b.click()
    return r
  })
  if (!arme.arm || arme.charms !== 1) throw new Error(`le premier toucher n'arme pas la poubelle, ou efface déjà (${JSON.stringify(arme)})`)
  await pret()
  const neuf = await page.evaluate(() => ({ st: window.__ct.step, l: window.__ct.look }))
  if (neuf.st !== 'modele' || neuf.l.fabric !== 'toile' || neuf.l.body !== '#DCD3F5' || neuf.l.motif !== 'uni' || neuf.l.charms.length || neuf.l.patches.length)
    throw new Error(`le cartable n'est pas remis à zéro (${await etat()})`)
  await page.locator('.ct-step[data-step="matiere"]').click({ force: true })
  await page.locator('.ct-opt[data-fabric="paillettes"]').click({ force: true }); await pret()
  if (await page.evaluate(() => window.__ct.flipped) !== 0) throw new Error(`les paillettes retournées reviennent après Effacer (${await etat()})`)
  // Remplir : il s'ouvre, les six affaires y filent, il se referme
  await page.locator('.ct-step[data-step="remplir"]').click({ force: true })
  await page.waitForFunction(() => window.__ct.open > 0.9, null, { timeout: 60000, polling: 300 })
  await page.waitForTimeout(3000) // la caméra se pose au-dessus
  for (let n = 1; n <= 6; n++) {
    const it = await page.evaluate(() => window.__ct.item())
    if (!it) throw new Error(`plus d'affaire à ranger (${await etat()})`)
    await page.mouse.click(it.x, it.y)
    await page.waitForFunction(n => window.__ct.packed >= n, n, { timeout: 60000, polling: 200 })
      .catch(async () => { throw new Error(`l'affaire n° ${n} ne se range pas (${await etat()})`) })
  }
  await page.waitForFunction(() => window.__ct.open === 0, null, { timeout: 60000, polling: 300 })
    .catch(async () => { throw new Error(`le cartable ne se referme pas (${await etat()})`) })
  // Fini : la petite fille le met sur son dos et part à l'école
  await page.locator('#ctFini').click({ force: true })
  await finDe('Prête pour', 120000).catch(async () => { throw new Error(`pas de fin (${await etat()})`) })
  if (!await page.evaluate(() => !!localStorage.getItem('ferme:cartable:photo:joyce'))) throw new Error('le cartable n\'est pas photographié pour sa carte')
})

/* 🗼 Les Monuments (19/10) : le Golden Gate de Jade, de bout en bout — une
   pièce lâchée loin de sa place revient l'attendre, les deux tours et le
   tablier glissés à leur place, le câble tracé au doigt (les suspentes
   tombent), le monument gardé quand on le quitte et retrouvé debout, une
   couleur au pinceau, les guirlandes, la nuit, un drapeau planté puis
   repris, rien sur l'eau sauf le canard, et « Fini » : le bouquet. */
await scenario('monuments', async () => {
  await openGame('Les Monuments', '__mn')
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('ferme:monuments')) localStorage.removeItem(k) })
  await page.waitForFunction(() => window.__mn.cards, null, { timeout: 60000, polling: 500 })
  await page.locator('.mn-card[data-who="jade"]').click()
  await page.waitForFunction(() => window.__mn.grid, null, { timeout: 60000, polling: 300 })
  const ouvrir = async () => {
    await page.locator('.mn-mcard[data-mon="goldengate"]').click()
    await page.waitForFunction(() => window.__mn.ready, null, { timeout: 120000, polling: 300 })
  }
  const etat = () => page.evaluate(() => JSON.stringify({ st: window.__mn.step, ph: window.__mn.phase, b: window.__mn.built, s: window.__mn.saved }))
  const piece = async () => {
    await page.waitForFunction(() => window.__mn.piece(), null, { timeout: 30000, polling: 150 })
      .catch(async () => { throw new Error(`aucune pièce n'arrive (${await etat()})`) })
    return page.evaluate(() => window.__mn.piece())
  }
  const glisse = async (a, b) => {
    await page.mouse.move(a.x, a.y); await page.mouse.down()
    for (let i = 1; i <= 10; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / 10, a.y + (b.y - a.y) * i / 10); await page.waitForTimeout(30) }
    await page.mouse.up()
  }
  await ouvrir()
  // Lâchée loin de sa place : elle revient attendre, rien n'est posé
  let p = await piece()
  await glisse(p.from, { x: p.to.x, y: p.to.y - 260 })
  await page.waitForTimeout(1200)
  if (await page.evaluate(() => window.__mn.built) !== 0) throw new Error(`une pièce lâchée loin s'est posée quand même (${await etat()})`)
  // Les deux tours, le tablier, puis le câble à tracer
  for (let n = 1; n <= 3; n++) {
    p = await piece()
    if (p.trace) throw new Error(`le câble arrive avant le tablier (${await etat()})`)
    await glisse(p.from, p.to)
    await page.waitForFunction(n => window.__mn.built >= n, n, { timeout: 20000, polling: 150 })
      .catch(async () => { throw new Error(`la pièce n° ${n} ne se pose pas (${await etat()})`) })
    if (n > 1) continue
    // La poubelle (27/10) : deux touchers, le pont redevient tel qu'au premier jour, sa photo oubliée
    await page.evaluate(() => localStorage.setItem('ferme:monuments:photo:jade:goldengate', 'data:image/webp;base64,'))
    const arme = await page.evaluate(() => {
      const b = document.querySelector('#mnReset')
      b.click()
      const a = b.classList.contains('arm') && window.__mn.built === 1
      b.click()
      return a
    })
    if (!arme) throw new Error(`le premier toucher n'arme pas la poubelle, ou efface déjà (${await etat()})`)
    await page.waitForFunction(() => window.__mn.ready && window.__mn.built === 0, null, { timeout: 120000, polling: 300 })
      .catch(async () => { throw new Error(`la poubelle ne remet pas le pont à zéro (${await etat()})`) })
    if (await page.evaluate(() => localStorage.getItem('ferme:monuments:photo:jade:goldengate') || JSON.parse(localStorage.getItem('ferme:monuments:jade')).goldengate.built))
      throw new Error('après la poubelle, le pont garde sa photo ou ses pièces')
    p = await piece()
    await glisse(p.from, p.to)
    await page.waitForFunction(() => window.__mn.built >= 1, null, { timeout: 20000, polling: 150 })
      .catch(async () => { throw new Error(`après la poubelle, la première pièce ne se pose pas (${await etat()})`) })
  }
  p = await piece()
  if (!p.trace) throw new Error(`pas de câble à tracer (${await etat()})`)
  const t = p.trace
  await page.mouse.move(t[0].x, t[0].y); await page.mouse.down()
  for (let i = 1; i < t.length; i += 2) { await page.mouse.move(t[i].x, t[i].y); await page.waitForTimeout(16) }
  await page.mouse.move(t[t.length - 1].x, t[t.length - 1].y); await page.mouse.up()
  await page.waitForFunction(() => window.__mn.built === window.__mn.total && window.__mn.step === 'peindre', null, { timeout: 30000, polling: 200 })
    .catch(async () => { throw new Error(`le pont ne se termine pas (${await etat()})`) })
  // Quitter puis revenir : il est toujours debout, et sa carte a sa photo
  await page.locator('#mnBack').click({ force: true })
  await page.waitForFunction(() => window.__mn.grid, null, { timeout: 30000, polling: 300 })
  if (!await page.evaluate(() => !!localStorage.getItem('ferme:monuments:photo:jade:goldengate'))) throw new Error('le pont n\'est pas photographié pour sa carte')
  await ouvrir()
  if (await page.evaluate(() => window.__mn.built) !== 4) throw new Error(`le pont n'est plus debout en revenant (${await etat()})`)
  // Peindre : une couleur, là où le pinceau touche vraiment le pont
  await page.locator('.mn-opt[data-color]').nth(2).click({ force: true })
  let q = await page.evaluate(() => window.__mn.mon())
  await page.mouse.click(q.x, q.y)
  await page.waitForFunction(() => Object.keys(window.__mn.saved.colors).length >= 1, null, { timeout: 20000, polling: 200 })
    .catch(async () => { throw new Error(`le pinceau ne peint pas (${await etat()})`) })
  // Les lumières : les guirlandes roses, la nuit
  await page.locator('.mn-step[data-step="lumieres"]').click({ force: true })
  await page.locator('.mn-opt[data-light="rose"]').click({ force: true })
  await page.locator('.mn-opt[data-night="1"]').click({ force: true })
  await page.waitForFunction(() => window.__mn.saved.lights === 'rose' && window.__mn.saved.night, null, { timeout: 20000, polling: 200 })
    .catch(async () => { throw new Error(`pas de guirlandes ni de nuit (${await etat()})`) })
  // Un drapeau planté sur le pont, repris d'un toucher, replanté ; dans l'eau, plouf : rien
  await page.locator('.mn-step[data-step="deco"]').click({ force: true })
  await page.locator('.mn-opt[data-deco="drapeau"]').click({ force: true })
  const w = await page.evaluate(() => window.__mn.w)
  const eau = await page.evaluate(w => window.__mn.pt(w * 0.3, 0, 0.9), w)
  await page.mouse.click(eau.x, eau.y)
  await page.waitForTimeout(400)
  if (await page.evaluate(() => window.__mn.saved.deco.length) !== 0) throw new Error(`un drapeau flotte sur l'eau (${await etat()})`)
  q = await page.evaluate(() => window.__mn.mon())
  await page.mouse.click(q.x, q.y)
  await page.waitForFunction(() => window.__mn.saved.deco.length === 1, null, { timeout: 20000, polling: 200 })
    .catch(async () => { throw new Error(`le drapeau ne se pose pas (${await etat()})`) })
  const d = await page.evaluate(() => window.__mn.decoPt(0))
  await page.mouse.click(d.x, d.y)
  await page.waitForFunction(() => window.__mn.saved.deco.length === 0, null, { timeout: 20000, polling: 200 })
    .catch(async () => { throw new Error(`le drapeau ne se reprend pas (${await etat()})`) })
  await page.mouse.click(q.x, q.y)
  // Les visiteurs : le cochon refuse l'eau, le canard y nage ; le cochon va sur l'île
  await page.locator('.mn-step[data-step="visiteurs"]').click({ force: true })
  await page.locator('.mn-opt[data-vis="pig"]').click({ force: true })
  await page.mouse.click(eau.x, eau.y)
  await page.waitForTimeout(400)
  if (await page.evaluate(() => window.__mn.saved.vis.length) !== 0) throw new Error(`le cochon marche sur l'eau (${await etat()})`)
  q = await page.evaluate(w => window.__mn.pt(-w / 2 - 0.6, 0.5, 0), w)
  await page.mouse.click(q.x, q.y)
  await page.locator('.mn-opt[data-vis="duck"]').click({ force: true })
  await page.mouse.click(eau.x, eau.y)
  await page.waitForFunction(() => window.__mn.saved.vis.length === 2 && window.__mn.saved.deco.length === 1, null, { timeout: 20000, polling: 200 })
    .catch(async () => { throw new Error(`il manque un visiteur (${await etat()})`) })
  // Fini : le bouquet au-dessus du pont
  await page.locator('#mnFini').click({ force: true })
  await finDe('Quel beau monument', 120000).catch(async () => { throw new Error(`pas de fin (${await etat()})`) })
})

/* 🏺 La Poterie (27/10) : l'étagère de la famille reprise par Jade (la
   première qui ouvre) ; la motte qu'on fait monter au doigt, qu'on
   évase sur le côté, qu'on creuse au centre ; le vase en un toucher ; un
   point (l'anneau de points) et une bande tenue sur le tour qui tourne ; le
   four (elle ressort émaillée) ; « Fini » : sur l'étagère de Jade, gardée ;
   la carte de Jade a sa photo, Joyce a son étagère à elle ; « Changer », et
   Jade reprend son vase de l'étagère : il revient sur le tour. */
await scenario('poterie', async () => {
  // Une étagère de famille d'avant les cartes (un bol émaillé) : la première qui ouvre la reprend
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('ferme:poterie')) localStorage.removeItem(k)
    localStorage.setItem('ferme:poterie', JSON.stringify({ v: 1, cur: null, slot: null, shelf: [{ h: 0.24, d: 0.19, r: Array(36).fill(0.25), g: 1, p: [] }] }))
  })
  await openGame('La Poterie', '__pt')
  const carte = async qui => {
    await page.waitForFunction(() => window.__pt.cards, null, { timeout: 60000, polling: 300 })
    await page.locator(`.pt-card[data-who="${qui}"]`).click({ force: true })
  }
  await carte('jade')
  const pret = () => page.waitForFunction(() => window.__pt.ready, null, { timeout: 120000, polling: 300 })
  const etat = () => page.evaluate(() => JSON.stringify({ ph: window.__pt.phase, st: window.__pt.step, c: window.__pt.clay, p: window.__pt.paint, g: window.__pt.glazed, sh: window.__pt.shelf }))
  const glisse = async (a, b, n = 10) => {
    await page.mouse.move(a.x, a.y); await page.mouse.down()
    for (let i = 1; i <= n; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n); await page.waitForTimeout(40) }
    await page.mouse.up()
  }
  await pret()
  if (await page.evaluate(() => window.__pt.who) !== 'jade') throw new Error('ce n\'est pas l\'atelier de Jade')
  if (await page.evaluate(() => window.__pt.shelf) !== 1 || await page.evaluate(() => localStorage.getItem('ferme:poterie') !== null))
    throw new Error(`l'étagère de la famille n'est pas reprise par Jade (${await etat()})`)
  // Monter : le doigt glisse vers le haut sur la motte, elle grandit
  let c = await page.evaluate(() => window.__pt.clay)
  const h0 = c.h
  let a = await page.evaluate(c => window.__pt.pt(c.r[8] * 0.5, c.h * 0.3), c)
  await glisse(a, { x: a.x, y: a.y - 160 })
  c = await page.evaluate(() => window.__pt.clay)
  if (c.h < h0 + 0.08) throw new Error(`la terre ne monte pas (${await etat()})`)
  // Sur le côté : vers l'extérieur, elle s'évase autour du doigt
  const mid = Math.round((c.r.length - 1) * 0.5), r0 = c.r[mid]
  a = await page.evaluate(c => window.__pt.pt(c.r[Math.round((c.r.length - 1) * 0.5)] * 0.9, c.h * 0.5), c)
  await glisse(a, { x: a.x + 120, y: a.y })
  c = await page.evaluate(() => window.__pt.clay)
  if (c.r[mid] < r0 + 0.03) throw new Error(`elle ne s'évase pas (${await etat()})`)
  // Au centre, en haut : le doigt creuse
  a = await page.evaluate(c => window.__pt.pt(0, c.h - 0.01), c)
  await glisse(a, { x: a.x, y: a.y + 90 })
  c = await page.evaluate(() => window.__pt.clay)
  if (c.depth < 0.05) throw new Error(`elle ne se creuse pas (${await etat()})`)
  // Le vase, d'un toucher
  await page.locator('.pt-opt[data-preset="vase"]').click({ force: true })
  await page.waitForFunction(() => window.__pt.clay.h > 0.7, null, { timeout: 20000, polling: 200 })
    .catch(async () => { throw new Error(`pas de vase (${await etat()})`) })
  await page.waitForTimeout(2500) // la caméra recule pour le vase
  // Peindre : un toucher (l'anneau de points), puis un doigt tenu (la bande)
  await page.locator('.pt-step[data-step="peindre"]').click({ force: true })
  await page.locator('.pt-opt[data-color="#E8414F"]').click({ force: true })
  c = await page.evaluate(() => window.__pt.clay)
  a = await page.evaluate(c => window.__pt.pt(0, c.h * 0.3), c)
  await page.mouse.click(a.x, a.y)
  await page.waitForFunction(() => window.__pt.paint === 1, null, { timeout: 20000, polling: 200 })
    .catch(async () => { throw new Error(`le toucher ne pose pas de points (${await etat()})`) })
  await page.locator('.pt-opt[data-color="#2F6FD0"]').click({ force: true })
  a = await page.evaluate(c => window.__pt.pt(0, c.h * 0.5), c)
  await page.mouse.move(a.x, a.y); await page.mouse.down()
  await page.waitForTimeout(3000)
  await page.mouse.up()
  if (await page.evaluate(() => window.__pt.paint) !== 2) throw new Error(`le doigt tenu ne trace pas de bande (${await etat()})`)
  // Le four : elle y entre crue, elle en ressort émaillée, de retour sur le tour
  await page.locator('#ptFour').click({ force: true })
  await page.waitForFunction(() => window.__pt.phase === 'fire', null, { timeout: 20000, polling: 200 })
  await page.waitForFunction(() => window.__pt.glazed && window.__pt.ready, null, { timeout: 120000, polling: 300 })
    .catch(async () => { throw new Error(`elle ne ressort pas du four émaillée (${await etat()})`) })
  // Fini : sur l'étagère
  await page.locator('#ptFini').click({ force: true })
  await finDe('Quel joli pot', 120000).catch(async () => { throw new Error(`pas de fin (${await etat()})`) })
  const garde = await page.evaluate(() => JSON.parse(localStorage.getItem('ferme:poterie:jade') || 'null'))
  if (!garde || garde.shelf.filter(Boolean).length !== 2 || !garde.shelf[1].g || garde.shelf[1].p.length !== 2) throw new Error(`le vase n'est pas gardé sur l'étagère de Jade (${JSON.stringify(garde).slice(0, 200)})`)
  // Rouverte : la carte de Jade a sa photo ; Joyce a son étagère à elle, vide
  await openGame('La Poterie', '__pt')
  await page.waitForFunction(() => window.__pt.cards && document.querySelector('.pt-card[data-who="jade"].last img'), null, { timeout: 60000, polling: 300 })
    .catch(() => { throw new Error('la carte de Jade n\'a pas sa photo, ou n\'est pas bordée') })
  await carte('joyce')
  await pret()
  if (await page.evaluate(() => window.__pt.shelf) !== 0) throw new Error(`Joyce a l'étagère de Jade (${await etat()})`)
  // « Changer » : retour aux cartes, Jade reprend son vase de l'étagère, il revient sur le tour
  await page.locator('#ptMe').click({ force: true })
  await carte('jade')
  await pret()
  if (await page.evaluate(() => window.__pt.shelf) !== 2) throw new Error(`l'étagère de Jade n'est plus là (${await etat()})`)
  await page.locator('.pt-step[data-step="etagere"]').click({ force: true })
  await page.waitForTimeout(2500) // la caméra va à l'étagère
  const q = await page.evaluate(() => window.__pt.slot(1))
  await page.mouse.click(q.x, q.y)
  await page.waitForFunction(() => window.__pt.ready && window.__pt.clay.h > 0.7 && window.__pt.glazed && window.__pt.shelf === 1, null, { timeout: 60000, polling: 300 })
    .catch(async () => { throw new Error(`le vase ne revient pas sur le tour (${await etat()})`) })
})

/* 🏰 Le Château de sable (27/10) : la plage de Joyce ; une tour moulée (le seau se retourne,
   ploc, la forme reste), une tour crénelée et une étoile, des douves
   tracées à la pelle (le sable s'amoncelle à côté), le seau d'eau qui les
   remplit, le sable lissé et tassé, un drapeau planté puis repris, et
   « Fini » : la marée monte au coucher du soleil ; rouverte, la carte de
   Joyce a sa photo, Jade a sa plage à elle ; « Changer » : la plage de
   Joyce est telle qu'elle l'a laissée ; la poubelle (deux touchers). */
await scenario('chateau', async () => {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('ferme:chateau')) localStorage.removeItem(k) })
  await openGame('Le Château de sable', '__ch')
  const carte = async qui => {
    await page.waitForFunction(() => window.__ch.cards, null, { timeout: 60000, polling: 300 })
    await page.locator(`.ch-card[data-who="${qui}"]`).click({ force: true })
  }
  await carte('joyce')
  // Le crabe se promène au hasard : un toucher près de lui lève ses pinces au lieu de jouer — on l'assoit dans un coin
  const pret = () => page.waitForFunction(() => window.__ch.ready && (window.__ch.park(), true), null, { timeout: 120000, polling: 300 })
  const etat = () => page.evaluate(() => JSON.stringify({ ph: window.__ch.phase, t: window.__ch.tool, st: window.__ch.stamps, d: window.__ch.decos, w: window.__ch.water }))
  const toucher = async (x, z) => { const q = await page.evaluate(([x, z]) => window.__ch.pt(x, z), [x, z]); await page.mouse.click(q.x, q.y) }
  const glisse = async (a, b, n = 14) => {
    const p = await page.evaluate(([x, z]) => window.__ch.pt(x, z), a), q = await page.evaluate(([x, z]) => window.__ch.pt(x, z), b)
    await page.mouse.move(p.x, p.y); await page.mouse.down()
    for (let i = 1; i <= n; i++) { await page.mouse.move(p.x + (q.x - p.x) * i / n, p.y + (q.y - p.y) * i / n); await page.waitForTimeout(40) }
    await page.mouse.up()
  }
  await pret()
  // Les moules : la tour (le moule de départ), la tour crénelée, l'étoile
  await toucher(0, -0.3)
  await page.waitForFunction(() => window.__ch.stamps === 1 && window.__ch.ready, null, { timeout: 60000, polling: 200 })
    .catch(async () => { throw new Error(`le moule ne laisse pas sa tour (${await etat()})`) })
  if (await page.evaluate(() => window.__ch.height(0, -0.3)) < 0.2) throw new Error(`la tour est trop basse (${await etat()})`)
  await page.locator('.ch-opt[data-mold="creneaux"]').click({ force: true })
  await toucher(0.5, -0.3)
  await page.waitForFunction(() => window.__ch.stamps === 2 && window.__ch.ready, null, { timeout: 60000, polling: 200 })
  await page.locator('.ch-opt[data-mold="etoile"]').click({ force: true })
  await toucher(-0.5, -0.3)
  await page.waitForFunction(() => window.__ch.stamps === 3 && window.__ch.ready, null, { timeout: 60000, polling: 200 })
    .catch(async () => { throw new Error(`pas d'étoile (${await etat()})`) })
  // La pelle : des douves devant le château, le sable à côté
  await page.locator('.ch-tool[data-tool="pelle"]').click({ force: true })
  await glisse([-0.7, 0.2], [0.7, 0.2])
  const creux = await page.evaluate(() => [window.__ch.height(0, 0.2), Math.max(window.__ch.height(0, 0.32), window.__ch.height(0, 0.08))])
  if (creux[0] > -0.015 || creux[1] <= 0) throw new Error(`pas de douves, ou pas de sable à côté (${creux})`)
  // L'eau : le seau les remplit
  await page.locator('.ch-tool[data-tool="eau"]').click({ force: true })
  await toucher(0, 0.2)
  await page.waitForFunction(() => window.__ch.water > 20 && window.__ch.ready, null, { timeout: 60000, polling: 200 })
    .catch(async () => { throw new Error(`les douves restent sèches (${await etat()})`) })
  // La main : lisser, tasser
  await page.locator('.ch-tool[data-tool="main"]').click({ force: true })
  await glisse([-0.8, 0.8], [-0.2, 0.8], 8)
  await toucher(0.6, 0.8)
  // La déco : un drapeau sur la tour, repris d'un toucher, replanté
  await page.locator('.ch-tool[data-tool="deco"]').click({ force: true })
  await page.locator('.ch-opt[data-deco="drapeau"]').click({ force: true })
  await toucher(0, -0.3)
  await page.waitForFunction(() => window.__ch.decos === 1, null, { timeout: 20000, polling: 200 })
    .catch(async () => { throw new Error(`le drapeau ne se plante pas (${await etat()})`) })
  await page.waitForTimeout(800)
  await toucher(0, -0.3)
  await page.waitForFunction(() => window.__ch.decos === 0, null, { timeout: 20000, polling: 200 })
    .catch(async () => { throw new Error(`le drapeau ne se reprend pas (${await etat()})`) })
  await page.waitForTimeout(500)
  await toucher(0, -0.3)
  await page.waitForFunction(() => window.__ch.decos === 1, null, { timeout: 20000, polling: 200 })
  // Fini : la marée monte au coucher du soleil
  await page.locator('#chFini').click({ force: true })
  await finDe('Quel beau château', 120000).catch(async () => { throw new Error(`pas de fin (${await etat()})`) })
  // Rouverte : la carte de Joyce a sa photo ; Jade a sa plage à elle, toute lisse
  await openGame('Le Château de sable', '__ch')
  await page.waitForFunction(() => window.__ch.cards && document.querySelector('.ch-card[data-who="joyce"].last img'), null, { timeout: 60000, polling: 300 })
    .catch(() => { throw new Error('la carte de Joyce n\'a pas sa photo, ou n\'est pas bordée') })
  await carte('jade')
  await pret()
  if (await page.evaluate(() => window.__ch.height(0, -0.3)) > 0.01) throw new Error('Jade a la plage de Joyce')
  // « Changer » : Joyce retrouve son château, ses douves pleines, son drapeau
  await page.locator('#chMe').click({ force: true })
  await carte('joyce')
  await pret()
  const revu = await page.evaluate(() => ({ h: window.__ch.height(0, -0.3), w: window.__ch.water, d: window.__ch.decos }))
  if (revu.h < 0.2 || revu.w < 20 || revu.d !== 1) throw new Error(`la plage de Joyce n'est pas gardée (${JSON.stringify(revu)})`)
  // La poubelle : un toucher l'arme (rien ne bouge), le second remet la plage à plat
  // (les deux d'un coup : sous la 3D logicielle, une image passe les 2,6 s où elle reste armée)
  const arme = await page.evaluate(() => {
    const b = document.querySelector('#chReset')
    b.click()
    const r = { arm: b.classList.contains('arm'), h: window.__ch.height(0, -0.3) }
    b.click()
    return r
  })
  if (!arme.arm || arme.h < 0.2) throw new Error(`le premier toucher n'arme pas la poubelle, ou efface déjà (${JSON.stringify(arme)})`)
  await page.waitForFunction(() => window.__ch.height(0, -0.3) < 0.01 && window.__ch.decos === 0, null, { timeout: 20000, polling: 200 })
    .catch(async () => { throw new Error(`la poubelle n'efface pas la plage (${await etat()})`) })
})

/* 🐠 L'Aquarium (27/10) : l'aquarium de la famille repris par Jade ; un poisson dessiné sur la feuille (un ovale, sa
   queue, son œil à droite), « Fini » : il naît, se gonfle et nage ; envoyé
   à gauche il se retourne (son dos), à droite il montre son dessin ; la
   vitre tapotée, il vient ; les flocons, il les mange ; un château posé
   puis repris, une algue posée ; « Fini » : le soir tombe ; rouvert, la
   carte de Jade a sa photo, Joyce a son aquarium à elle ; « Changer » : le
   poisson et le décor de Jade sont toujours là. */
await scenario('aquarium', async () => {
  // Un aquarium de famille d'avant les cartes (un rocher) : la première qui ouvre le reprend
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('ferme:aquarium')) localStorage.removeItem(k)
    localStorage.setItem('ferme:aquarium', JSON.stringify({ v: 1, fish: [], deco: [['rocher', 1.1, -0.2, 0]] }))
  })
  await openGame('L’Aquarium', '__aq')
  const carte = async qui => {
    await page.waitForFunction(() => window.__aq.cards, null, { timeout: 60000, polling: 300 })
    await page.locator(`.aq-card[data-who="${qui}"]`).click({ force: true })
  }
  await carte('jade')
  const pret = () => page.waitForFunction(() => window.__aq.ready, null, { timeout: 120000, polling: 300 })
  const etat = () => page.evaluate(() => JSON.stringify({ ph: window.__aq.phase, f: window.__aq.fish, s: window.__aq.saved, sw: window.__aq.swim, sh: window.__aq.sheet }))
  await pret()
  if (await page.evaluate(() => window.__aq.saved.deco) !== 1 || await page.evaluate(() => localStorage.getItem('ferme:aquarium') !== null))
    throw new Error(`l'aquarium de la famille n'est pas repris par Jade (${await etat()})`)
  // La feuille : un poisson, la tête à droite (l'œil)
  await page.locator('#aqDraw').click({ force: true })
  await page.waitForFunction(() => window.__aq.sheet, null, { timeout: 20000, polling: 200 })
  const cv = await page.locator('.fb-dpaper canvas').boundingBox()
  const P = (x, y) => [cv.x + cv.width * x, cv.y + cv.height * y]
  const trace = async pts => { await page.mouse.move(...P(...pts[0])); await page.mouse.down(); for (const p of pts.slice(1)) await page.mouse.move(...P(...p), { steps: 3 }); await page.mouse.up() }
  const ovale = Array.from({ length: 33 }, (_, i) => { const a = i / 32 * Math.PI * 2; return [0.5 + Math.cos(a) * 0.2, 0.5 + Math.sin(a) * 0.14] })
  await trace(ovale)
  await trace([[0.3, 0.5], [0.16, 0.36], [0.16, 0.64], [0.3, 0.5]])
  await page.locator('.at-color').last().click()
  await trace([[0.62, 0.45], [0.625, 0.455], [0.62, 0.46]])
  await page.locator('.fb-ddone button').click({ force: true })
  await page.waitForFunction(() => window.__aq.fish === 1 && !window.__aq.sheet, null, { timeout: 60000, polling: 300 })
    .catch(async () => { throw new Error(`le dessin ne devient pas poisson (${await etat()})`) })
  let f = (await page.evaluate(() => window.__aq.swim))[0]
  if (f.d !== 1) throw new Error(`la tête n'est pas du côté de l'œil (${await etat()})`)
  // Il nage : à gauche, il se retourne (on voit son dos) ; à droite, son dessin
  await page.waitForTimeout(1500)
  await page.evaluate(() => window.__aq.go(0, -1))
  await page.waitForFunction(() => window.__aq.swim[0].x3 < -0.8 && window.__aq.swim[0].face === -1, null, { timeout: 60000, polling: 300 })
    .catch(async () => { throw new Error(`il ne file pas à gauche en se retournant (${await etat()})`) })
  await page.evaluate(() => window.__aq.go(0, 1))
  await page.waitForFunction(() => window.__aq.swim[0].x3 > 0.4 && window.__aq.swim[0].face === 1, null, { timeout: 60000, polling: 300 })
    .catch(async () => { throw new Error(`il ne revient pas à droite en montrant son dessin (${await etat()})`) })
  // On tapote la vitre à gauche : il vient
  const vitre = await page.evaluate(() => window.__aq.glass(-0.8, 1.0))
  await page.mouse.click(vitre.x, vitre.y)
  await page.waitForFunction(() => window.__aq.swim[0].x3 < -0.4 && window.__aq.swim[0].z3 > 0.15, null, { timeout: 60000, polling: 300 })
    .catch(async () => { throw new Error(`il ne vient pas à la vitre (${await etat()})`) })
  // Les flocons : il en mange
  await page.locator('#aqFeed').click({ force: true })
  await page.waitForFunction(() => window.__aq.flakes > 0, null, { timeout: 10000, polling: 100 })
  const avant = await page.evaluate(() => window.__aq.flakes)
  await page.waitForFunction(n => window.__aq.flakes < n - 1, avant, { timeout: 90000, polling: 300 })
    .catch(async () => { throw new Error(`il ne mange pas les flocons (${await etat()})`) })
  // Le décor : un château posé sur le sable, repris d'un toucher ; une algue
  await page.locator('.aq-opt[data-deco="chateau"]').click({ force: true })
  // Touché en pleine eau : il coule jusqu'au sable
  let q = await page.evaluate(() => window.__aq.sand(0.3, -0.1))
  await page.mouse.click(q.x, q.y - 160)
  await page.waitForFunction(() => window.__aq.saved.deco === 2, null, { timeout: 20000, polling: 200 })
    .catch(async () => { throw new Error(`le château ne se pose pas (${await etat()})`) })
  await page.waitForTimeout(2500)
  q = await page.evaluate(() => window.__aq.deco(1))
  await page.mouse.click(q.x, q.y)
  await page.waitForFunction(() => window.__aq.saved.deco === 1, null, { timeout: 20000, polling: 200 })
    .catch(async () => { throw new Error(`le château ne se reprend pas (${await etat()})`) })
  await page.locator('.aq-opt[data-deco="algue"]').click({ force: true })
  q = await page.evaluate(() => window.__aq.sand(-0.9, -0.2))
  await page.mouse.click(q.x, q.y - 120)
  await page.waitForFunction(() => window.__aq.saved.deco === 2, null, { timeout: 20000, polling: 200 })
  // Fini : le soir tombe, l'aquarium reste allumé
  await page.locator('#aqFini').click({ force: true })
  await finDe('Quel bel aquarium', 120000).catch(async () => { throw new Error(`pas de fin (${await etat()})`) })
  // Rouvert : la carte de Jade a sa photo ; Joyce a son aquarium à elle, vide
  await openGame('L’Aquarium', '__aq')
  await page.waitForFunction(() => window.__aq.cards && document.querySelector('.aq-card[data-who="jade"].last img'), null, { timeout: 60000, polling: 300 })
    .catch(() => { throw new Error('la carte de Jade n\'a pas sa photo, ou n\'est pas bordée') })
  await carte('joyce')
  await pret()
  if (await page.evaluate(() => window.__aq.fish + window.__aq.saved.deco) !== 0) throw new Error(`Joyce a l'aquarium de Jade (${await etat()})`)
  // « Changer » : le poisson de Jade et son décor sont là
  await page.locator('#aqMe').click({ force: true })
  await carte('jade')
  await pret()
  const revu = await page.evaluate(() => ({ f: window.__aq.fish, d: window.__aq.saved.deco, d0: window.__aq.swim[0]?.d }))
  if (revu.f !== 1 || revu.d !== 2 || revu.d0 !== 1) throw new Error(`l'aquarium de Jade n'est pas gardé (${JSON.stringify(revu)})`)
})

await scenario('cache-cache-jour', () => cacheCache('easy', 'Tout le monde est trouvé'))
// L'éclair (6/10) : la grande ferme de jour, des animaux cachés en entier à fouiller
await scenario('cache-cache-eclair', () => cacheCache('med', 'Tout le monde est trouvé'))
await scenario('cache-cache-nuit', () => cacheCache('exp', 'Trouvés dans le noir'))


await browser.close()
if (failures.length) {
  console.error(`\n${failures.length} scénario(s) en échec : ${failures.join(', ')}`)
  process.exit(1)
}
console.log('\nTous les bots ont gagné leur partie 🏆')
process.exit(0) // le serveur de preview garderait le process en vie
