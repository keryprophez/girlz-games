/* Les AFFICHES de l'accueil (28/09) : une image de chaque jeu EN TRAIN DE SE
   JOUER, prise dans le vrai jeu (pas dessinée), sans la coquille (barre,
   score, cœurs, main qui montre où taper), cadrée en 4:3 et enregistrée en
   WebP dans public/assets/affiches/<id>.webp. La liste des jeux qui ont leur
   affiche est écrite dans src/core/posters.ts.

   Usage (à relancer quand un jeu change de visage) :
     npx vite build && node scripts/posters.mjs            (tous les jeux)
     ONLY=icetower,ninja node scripts/posters.mjs          (quelques-uns)
   Sous swiftshader la 3D rend 3 à 4 images/s : compter une quinzaine de
   minutes pour les 24 jeux. Regarder CHAQUE affiche avant de committer. */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

// PORT / DIST : à côté du smoke (4188) et des bots (4189), qui servent dist/
const PORT = Number(process.env.PORT || 4187)
const URL = `http://localhost:${PORT}/girlz-games/`
const OUT = 'public/assets/affiches/'
const W = 600, H = 450

/* La mise en scène de chaque jeu : combien attendre, quoi faire avant la
   photo (`act`), le cadrage (`zoom` ≥ 1, centre `cx`/`cy` en fractions de
   l'arène), et `shots` : plusieurs photos à `every` ms d'écart, on garde la
   plus colorée (le Ninja : le moment où il y a le plus de fruits en l'air).
   `tier` : le niveau (le Ninja en expert, plus de fruits à la fois).
   Par défaut : 5 s, une photo, cadrage 4:3 au centre, niveau doux. */
const STAGE = {
  // Jouer
  icetower: { wait: 6000, act: async p => { await p.evaluate(() => window.__itStack?.(9)) }, after: 7000, zoom: 1.15, cy: 0.42 },
  ninja: { tier: 'exp', wait: 8000, shots: 14, every: 600 },
  maze: { wait: 5000 },
  // Le Puzzle : la moitié des pièces posées (le haut et la gauche de l'image), les autres en vrac
  taquin2: {
    ready: () => window.__pz2 && window.__pz2.ready, wait: 1500,
    act: async p => { await p.evaluate(() => [0, 1, 2, 3, 4, 8].forEach(i => window.__pz2.place(i))) },
    after: 2500
  },
  memory: { wait: 7000 },
  // Le Chœur sur scène : un choriste chante sous son projecteur
  simon: { tier: 'med', wait: 3000, act: async p => { await p.evaluate(() => window.__simon?.press?.(0)); await p.waitForFunction(() => window.__simon.playerTurn, null, { timeout: 60000 }).catch(() => {}); await p.evaluate(() => window.__simon.press(window.__simon.seq[0])) }, after: 300 },
  // Une partie commencée contre la poule : quelques pions de chaque couleur
  connect4: {
    wait: 3000,
    act: async p => {
      if (await p.locator('.c4-mode[data-m="solo"]').count()) await p.locator('.c4-mode[data-m="solo"]').click({ force: true })
      for (const col of [3, 2, 4, 3, 5, 1]) {
        await p.waitForFunction(() => window.__c4 && window.__c4.turn === 0 && !window.__c4.lock, null, { timeout: 15000 }).catch(() => {})
        await p.evaluate(c => window.__c4.drop(c), col)
        await p.waitForTimeout(1300)
      }
    },
    after: 1500
  },
  // Apprendre
  clock: { wait: 4000 },
  // Découvre : un rectangle 4 × 6 tiré du doigt, les plantes poussent dedans
  potager: {
    wait: 4000,
    act: async p => {
      await p.locator('.pg-tool[data-m="discover"]').click({ force: true }).catch(() => {})
      const a = await p.evaluate(() => window.__pg.cell(1, 1)), b = await p.evaluate(() => window.__pg.cell(4, 6))
      await p.mouse.move(a.x, a.y); await p.mouse.down()
      for (let i = 1; i <= 8; i++) { await p.mouse.move(a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y) * i / 8); await p.waitForTimeout(20) }
      await p.mouse.up()
    },
    after: 1800
  },
  // Le Marché : un prix, des pièces 3D dans le panier
  market: {
    tier: 'med', wait: 2000,
    act: async p => {
      await p.waitForFunction(() => window.__mk && window.__mk.real, null, { timeout: 120000 }).catch(() => {})
      await p.locator('.mk-mode[data-m="pay"]').click()
      await p.waitForTimeout(600)
      const denoms = await p.$$eval('#mkBank .mk-coin', els => els.map(e => +e.dataset.v).sort((a, b) => b - a))
      let reste = await p.evaluate(() => window.__mk.goal)
      const plan = []
      for (const v of denoms) while (reste >= v) { plan.push(v); reste -= v }
      for (const v of plan.slice(0, -1)) { await p.locator(`#mkBank .mk-coin[data-v="${v}"]`).click(); await p.waitForTimeout(120) }
    },
    after: 1200
  },
  // Les animaux de la ferme plutôt que la cuisine (la série est tirée au sort)
  intrus: { wait: 4000, accept: () => /animaux/i.test(document.querySelector('#intQ')?.textContent || '') },
  geo: { wait: 12000 },
  space: { wait: 15000 },
  // Le petit train à quai, l'anneau doré sur le wagon vide
  patterns: { tier: 'easy', ready: () => window.__pt && !window.__pt.lock, wait: 1500, zoom: 1.12, cy: 0.5 },
  mirror: { wait: 4000 },
  letters: { wait: 4000 },
  sentences: { wait: 4000 },
  // Créer
  dressup: { ready: () => window.__pr && window.__pr.ready && window.__pr.pending === 0, wait: 3000, zoom: 1.45, cx: 0.29, cy: 0.5 },
  // Un air tout fait : la grille se remplit et les animaux chantent
  // Une chanson en cours (la poule), la partition qui descend ; les dessins des chansons hors cadre
  piano: {
    wait: 3000, cx: 0.57,
    act: async p => {
      await p.locator('.pn-mode[data-s="5"]').click()
      for (let k = 0; k < 5; k++) {
        const i = await p.evaluate(() => [...document.querySelectorAll('.pkey')].findIndex(x => x.classList.contains('pulse')))
        await p.locator('.pkey').nth(i).dispatchEvent('pointerdown')
        await p.waitForTimeout(260)
      }
    },
    after: 300
  },
  // Un cœur arc-en-ciel dessiné au doigt qui éclate en forme (30/09), trois fusées autour
  fireworks: {
    wait: 3000,
    act: async (p, box) => {
      await p.addStyleTag({ content: '.fw-pal{display:none !important;}' })
      const cx = box.x + box.width * 0.5, cy = box.y + box.height * 0.36, s = box.height * 0.0105
      const heart = t => [cx + s * 16 * Math.sin(t) ** 3, cy - s * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]
      await p.mouse.move(...heart(0)); await p.mouse.down()
      for (let i = 1; i <= 48; i++) await p.mouse.move(...heart(i / 48 * Math.PI * 2))
      await p.mouse.up()
      await p.waitForTimeout(250)
      for (const [fx, fy] of [[0.2, 0.3], [0.8, 0.26], [0.3, 0.14]]) { await p.mouse.click(box.x + box.width * fx, box.y + box.height * fy); await p.waitForTimeout(60) }
      // Le cœur formé, les fusées en fleur : on fige (pause) au temps du JEU,
      // une capture lente arriverait sinon après la fête
      await p.waitForFunction(() => window.__fw?.drawn >= 1, null, { timeout: 60000, polling: 16 })
      const t = await p.evaluate(() => window.__fw.time)
      await p.waitForFunction(t0 => window.__fw.time >= t0 + 0.55, t, { timeout: 60000, polling: 16 })
      await p.locator('.pbtn[aria-label="Pause"]').click({ force: true })
    },
    after: 300
  },
  // Le papillon, deux ailes remplies au pot de peinture
  coloring: {
    wait: 3000,
    act: async p => {
      await p.locator('.at-page[data-p="papillon"]').click()
      await p.locator('.at-tool[data-t="bucket"]').click()
      const box = await p.locator('#atPaint').boundingBox()
      const at = (fx, fy) => p.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
      const colors = await p.$$eval('.at-color', els => els.map(e => e.dataset.c))
      await p.locator(`.at-color[data-c="${colors[1]}"]`).click(); await p.waitForTimeout(300); await at(155 / 450, 120 / 300)
      await p.waitForTimeout(700)
      await p.locator(`.at-color[data-c="${colors[3]}"]`).click(); await p.waitForTimeout(300); await at(295 / 450, 120 / 300)
    },
    after: 1500
  },
  // La sauce en spirale, puis trois garnitures semées du doigt
  pizza: {
    wait: 6000,
    act: async p => {
      const cv = await p.locator('#pzArena canvas').first().boundingBox()
      const cx = cv.x + cv.width / 2, cy = cv.y + cv.height / 2
      // La sauce : une spirale serrée jusqu'au bord
      const R = Math.min(cv.width, cv.height) * 0.3
      await p.mouse.move(cx, cy); await p.mouse.down()
      for (let i = 1; i <= 90; i++) { const a = i * 0.42, r = R * i / 90; await p.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.75) }
      await p.mouse.up()
      await p.waitForTimeout(400)
      // Trois garnitures semées en zigzag sur toute la pizza
      const bowls = await p.$$eval('.pz-bowl', els => els.map(e => e.dataset.t))
      for (const [k, t] of bowls.slice(0, 3).entries()) {
        await p.locator(`.pz-bowl[data-t="${t}"]`).click()
        for (let row = 0; row < 3; row++) {
          const y = cy + (row - 1) * R * 0.5 + (k - 1) * R * 0.12
          await p.mouse.move(cx - R * 0.8, y); await p.mouse.down()
          for (let i = 1; i <= 10; i++) await p.mouse.move(cx - R * 0.8 + i * R * 0.16, y + Math.sin(i * 1.3 + k) * R * 0.1)
          await p.mouse.up()
          await p.waitForTimeout(200)
        }
      }
    },
    after: 1500
  }
}

/* Ce qui n'est pas le jeu : la barre maison/pause, le score, les cœurs, la
   main qui montre où taper, le carton titre. */
const HIDE = `.playbar,.titlecard,.hud,.tap-hint,.hand-layer,.pausewall,.toast,.pr-switch,.nj-waves,.geo-bar,.geo-dots,.mem-dots,.topbar,.tq-moves,.sp3-hud,.sp3-clock,.sp3-nav,.sp3-labels,.pz-pics{display:none !important;}`

// Un serveur déjà là sur ce port servirait un AUTRE build : on s'arrête
if (await fetch(URL).then(() => true, () => false)) { console.error(`Le port ${PORT} est déjà pris : arrête ce serveur d'abord`); process.exit(1) }
// vite lui-même, pas `npx vite` : tuer npx laissait vite orphelin, port gardé
const server = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort', ...(process.env.DIST ? ['--outDir', process.env.DIST] : [])], { stdio: 'ignore' })
const kill = () => { try { server.kill() } catch { /* déjà mort */ } }
process.on('exit', kill)
for (let i = 0; ; i++) {
  try { if ((await fetch(URL)).ok) break } catch { /* pas encore prêt */ }
  if (i > 60) { console.error('Le serveur de preview ne répond pas'); process.exit(1) }
  await new Promise(r => setTimeout(r, 250))
}

const local = '/opt/pw-browsers/chromium'
const browser = await chromium.launch({
  ...(existsSync(local) ? { executablePath: local } : { channel: 'chrome' }),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, serviceWorkers: 'block' })
await ctx.addInitScript(() => { window.__BOT = true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))

await page.goto(URL)
await page.waitForSelector('.hm-tab')
const games = []
for (const w of await page.$$eval('.hm-tab', els => els.map(el => el.dataset.w))) {
  await page.locator(`.hm-tab[data-w="${w}"]`).click()
  await page.waitForSelector('.gc')
  for (const id of await page.$$eval('.gc', els => els.map(el => el.dataset.id))) games.push({ w, id })
}
const only = process.env.ONLY ? process.env.ONLY.split(',') : null
mkdirSync(OUT, { recursive: true })

for (const g of games) {
  if (only && !only.includes(g.id)) continue
  const st = STAGE[g.id] || { wait: 5000 }
  // `accept` : une partie tirée au sort qui ne convient pas est relancée (6 fois au plus)
  for (let tries = 0; ; tries++) {
    errors.length = 0
    await page.goto(URL)
    await page.locator(`.hm-tab[data-w="${g.w}"]`).click()
    await page.locator(`.gc[data-id="${g.id}"]`).click({ force: true })
    await page.locator('.opsgo, .tierbtn, .gameroot > *').first().waitFor()
    if (await page.locator('.opsgo').count()) await page.locator('.opsgo').click()
    if (await page.locator('.duobtn').count()) await page.locator('.duobtn').first().click({ force: true })
    if (await page.locator('.tierbtn').count()) await page.locator('.tierbtn.tier-' + (st.tier || 'easy')).click({ force: true })
    await page.waitForSelector('.nj-loading', { state: 'detached', timeout: 120000 }).catch(() => {})
    if (st.ready) await page.waitForFunction(st.ready, null, { timeout: 300000, polling: 1000 })
    await page.waitForTimeout(st.wait)
    if (!st.accept || tries >= 5 || await page.evaluate(st.accept)) break
  }
  const arena = page.locator('.gameroot')
  const box = await arena.boundingBox()
  if (st.act) { await st.act(page, box); await page.waitForTimeout(st.after || 1000) }
  await page.addStyleTag({ content: HIDE })
  await page.waitForTimeout(300)
  let png = await page.screenshot({ clip: box })
  // Plusieurs photos : on garde la plus colorée (écart moyen entre canaux)
  if (st.shots) {
    let best = -1
    for (let k = 0; k < st.shots; k++) {
      const shot = k === 0 ? png : await page.screenshot({ clip: box })
      const score = await page.evaluate(async b64 => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
        const c = document.createElement('canvas'); c.width = 160; c.height = 100
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, 160, 100)
        const d = g.getImageData(0, 0, 160, 100).data
        let s = 0
        for (let i = 0; i < d.length; i += 4) s += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2])
        return s
      }, shot.toString('base64'))
      if (score > best) { best = score; png = shot }
      if (k < st.shots - 1) await page.waitForTimeout(st.every || 500)
    }
  }
  // Recadrage 4:3 et WebP, dans le navigateur (aucune dépendance de plus)
  const webp = await page.evaluate(async ({ b64, zoom, cx, cy, W, H }) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const iw = img.naturalWidth, ih = img.naturalHeight
    let ch = ih / zoom, cw = ch * 4 / 3
    if (cw > iw / zoom) { cw = iw / zoom; ch = cw * 3 / 4 }
    const x = Math.min(iw - cw, Math.max(0, iw * cx - cw / 2))
    const y = Math.min(ih - ch, Math.max(0, ih * cy - ch / 2))
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const g = c.getContext('2d')
    g.imageSmoothingQuality = 'high'
    g.drawImage(img, x, y, cw, ch, 0, 0, W, H)
    return c.toDataURL('image/webp', 0.82).split(',')[1]
  }, { b64: png.toString('base64'), zoom: st.zoom || 1, cx: st.cx ?? 0.5, cy: st.cy ?? 0.5, W, H })
  writeFileSync(OUT + g.id + '.webp', Buffer.from(webp, 'base64'))
  console.log(`${errors.length ? '⚠' : '✓'} ${g.id}${errors.length ? ' — ' + errors.join(' | ') : ''}`)
}

// La liste des affiches présentes : l'accueil ne demande que celles-là
const ids = readdirSync(OUT).filter(f => f.endsWith('.webp')).map(f => f.slice(0, -5)).sort()
writeFileSync('src/core/posters.ts', `/* Les jeux qui ont leur affiche sur l'accueil (public/assets/affiches/).
   Fichier ÉCRIT par scripts/posters.mjs : ne pas le modifier à la main. */
export const POSTERS = new Set<string>(${JSON.stringify(ids)})
`)
console.log(`${ids.length} affiches`)
await browser.close()
kill()
process.exit(0)
