// La maquette en UNE page (le code dedans) ; les sons et les photos restent à côté, dans assets/.
// node .maquette/courrier/seul.mjs dossier
import { build } from 'vite'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ici = dirname(fileURLToPath(import.meta.url)), out = resolve(process.argv[2] ?? 'courrier'), pub = join(ici, '../../public/assets')
const r = await build({
  root: ici, base: './', configFile: false, publicDir: false, logLevel: 'warn',
  build: { write: false, assetsInlineLimit: 0, target: 'es2022', rollupOptions: { input: join(ici, 'demo.ts'), output: { format: 'iife', inlineDynamicImports: true } } }
})
const code = (Array.isArray(r) ? r[0] : r).output.find(o => o.type === 'chunk').code.replaceAll('</script', '<\/script')
const page = readFileSync(join(ici, 'index.html'), 'utf8'), appel = '<script type="module" src="./demo.ts"></script>'
if (!page.includes(appel)) throw new Error('index.html a changé : appel de demo.ts introuvable')
mkdirSync(join(out, 'assets/photos'), { recursive: true })
// Ce que la page publiée ajoute d'elle-même : doctype, charset, viewport
const corps = page.replace(/<!doctype html>\s*|<meta charset[^>]*>\s*|<meta name="viewport"[^>]*>\s*/g, '')
writeFileSync(join(out, 'courrier.html'), corps.replace(appel, () => `<script>${code}</script>`))
const sons = ['cloth1', 'cloth2', 'drawKnife1', 'drawKnife2', 'chop', 'tick_001', 'tick_002', 'click_001', 'click_002', 'click_003', 'pluck_001', 'pluck_002', 'confirmation_001', 'confirmation_002', 'error_001', 'error_004', 'drop_001', 'drop_002', 'bong_001', 'glass_001', 'glass_002', 'select_001', 'creak1', 'metalClick']
mkdirSync(join(out, 'assets/sounds/animals'), { recursive: true })
for (const s of sons) cpSync(join(pub, 'sounds', s + '.ogg'), join(out, 'assets/sounds', s + '.ogg'))
for (const s of ['canard', 'mouton', 'chat', 'poule', 'cochon']) cpSync(join(pub, 'sounds/animals', s + '.mp3'), join(out, 'assets/sounds/animals', s + '.mp3'))
for (const s of ['cat', 'rabbit', 'horse', 'dog', 'duck', 'cow', 'sheep', 'pig', 'chick', 'moon', 'sun', 'earth']) cpSync(join(pub, 'photos', s + '.jpg'), join(out, 'assets/photos', s + '.jpg'))
console.log(out)
