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
   photo (`act`), et le cadrage (`zoom` ≥ 1, centre `cx`/`cy` en fractions
   de l'arène). Par défaut : 5 s, cadrage 4:3 au centre. */
const STAGE = {
  // Jouer
  icetower: { wait: 6000, act: async p => { await p.evaluate(() => window.__itStack?.(9)) }, after: 7000, zoom: 1.15, cy: 0.42 },
  ninja: { wait: 7000 },
  caterpillar: { wait: 6000 },
  maze: { wait: 5000 },
  taquin2: { wait: 4000 },
  memory: { wait: 7000 },
  simon: { wait: 5000 },
  connect4: { wait: 4000 },
  // Apprendre
  clock: { wait: 4000 },
  potager: { wait: 5000 },
  market: { wait: 4000 },
  intrus: { wait: 5000 },
  geo: { wait: 12000 },
  space: { wait: 15000 },
  patterns: { wait: 4000 },
  mirror: { wait: 4000 },
  letters: { wait: 4000 },
  sentences: { wait: 4000 },
  // Créer
  dressup: { hook: '__pr', ready: () => window.__pr && window.__pr.ready && window.__pr.pending === 0, wait: 3000, zoom: 1.35, cx: 0.33, cy: 0.5 },
  // Un air tout fait : la grille se remplit et les animaux chantent
  beatbox: { wait: 3000, act: async p => { await p.locator('#bbP1').click() }, after: 2600 },
  piano: { wait: 4000 },
  fireworks: { wait: 3000, act: async (p, box) => { for (let i = 0; i < 6; i++) { await p.mouse.click(box.x + box.width * (0.2 + 0.12 * i), box.y + box.height * (0.25 + 0.08 * (i % 3))); await p.waitForTimeout(250) } }, after: 900 },
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
      await p.mouse.move(cx, cy); await p.mouse.down()
      for (let i = 1; i <= 40; i++) { const a = i * 0.45, r = i * 3.2; await p.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7) }
      await p.mouse.up()
      const bowls = await p.$$eval('.pz-bowl', els => els.map(e => e.dataset.t))
      for (const [k, t] of bowls.slice(0, 3).entries()) {
        await p.locator(`.pz-bowl[data-t="${t}"]`).click()
        await p.mouse.move(cx - 110, cy - 30 + k * 30); await p.mouse.down()
        for (let i = 1; i <= 11; i++) await p.mouse.move(cx - 110 + i * 20, cy - 30 + k * 30 + Math.sin(i + k) * 45)
        await p.mouse.up()
        await p.waitForTimeout(400)
      }
    },
    after: 1500
  }
}

/* Ce qui n'est pas le jeu : la barre maison/pause, le score, les cœurs, la
   main qui montre où taper, le carton titre. */
const HIDE = `.playbar,.titlecard,.hud,.tap-hint,.pausewall,.toast,.pr-switch{display:none !important;}`

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
  errors.length = 0
  await page.goto(URL)
  await page.locator(`.hm-tab[data-w="${g.w}"]`).click()
  await page.locator(`.gc[data-id="${g.id}"]`).click()
  await page.locator('.opsgo, .tierbtn.tier-easy').first().waitFor()
  if (await page.locator('.opsgo').count()) await page.locator('.opsgo').click()
  if (await page.locator('.duobtn').count()) await page.locator('.duobtn').first().click({ force: true })
  await page.locator('.tierbtn.tier-easy').click({ force: true })
  await page.waitForSelector('.nj-loading', { state: 'detached', timeout: 120000 }).catch(() => {})
  if (st.ready) await page.waitForFunction(st.ready, null, { timeout: 300000, polling: 1000 })
  await page.waitForTimeout(st.wait)
  const arena = page.locator('.gameroot')
  const box = await arena.boundingBox()
  if (st.act) { await st.act(page, box); await page.waitForTimeout(st.after || 1000) }
  await page.addStyleTag({ content: HIDE })
  await page.waitForTimeout(300)
  const png = await page.screenshot({ clip: box })
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
