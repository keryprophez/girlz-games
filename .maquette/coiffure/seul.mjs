/* @version 2026-11-25 00:20 */
// La démo en UN fichier (code et modèle dedans) : s'ouvre d'un double-clic, sans serveur.
// node .maquette/coiffure/seul.mjs [sortie.html]
import { build } from 'vite'
import { readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Le modèle sans ce que la démo ne montre pas (les expressions du visage, la
    vignette, les cheveux peints) : certains aperçus refusent les gros fichiers. */
function alleger(glb) {
  const nj = glb.readUInt32LE(12), j = JSON.parse(glb.toString('utf8', 20, 20 + nj)), bin = glb.subarray(28 + nj)
  for (const m of j.meshes) { delete m.weights; delete m.extras; for (const p of m.primitives) { delete p.targets; delete p.extras } }
  if (j.extensions?.VRM?.blendShapeMaster) j.extensions.VRM.blendShapeMaster.blendShapeGroups = []
  const vide = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'), creux = new Set()
  for (const i of j.images) if (/thumbnail|hairback/i.test(i.name ?? '')) { i.mimeType = 'image/png'; creux.add(i.bufferView) }
  const vus = new Set()
  for (const m of j.meshes) for (const p of m.primitives) { for (const a of Object.values(p.attributes)) vus.add(a); if (p.indices !== undefined) vus.add(p.indices) }
  for (const s of j.skins ?? []) if (s.inverseBindMatrices !== undefined) vus.add(s.inverseBindMatrices)
  for (const a of j.animations ?? []) for (const s of a.samplers) { vus.add(s.input); vus.add(s.output) }
  j.accessors.forEach((a, k) => { if (!vus.has(k)) { delete a.bufferView; delete a.sparse; delete a.min; delete a.max; a.count = 1 } })
  const gardes = new Set([...j.images.map(i => i.bufferView), ...j.accessors.flatMap(a => [a.bufferView, a.sparse?.indices.bufferView, a.sparse?.values.bufferView])])
  const bouts = []
  let o = 0
  j.bufferViews.forEach((v, k) => {
    const d = creux.has(k) ? vide : gardes.has(k) ? bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength) : Buffer.alloc(4)
    v.byteOffset = o; v.byteLength = d.length
    const fin = Buffer.concat([d, Buffer.alloc((4 - d.length % 4) % 4)])
    bouts.push(fin); o += fin.length
  })
  j.buffers = [{ byteLength: o }]
  let t = Buffer.from(JSON.stringify(j))
  t = Buffer.concat([t, Buffer.alloc((4 - t.length % 4) % 4, 32)])
  const tete = Buffer.alloc(20), suite = Buffer.alloc(8)
  tete.writeUInt32LE(0x46546C67, 0); tete.writeUInt32LE(2, 4); tete.writeUInt32LE(28 + t.length + o, 8); tete.writeUInt32LE(t.length, 12); tete.writeUInt32LE(0x4E4F534A, 16)
  suite.writeUInt32LE(o, 0); suite.writeUInt32LE(0x004E4942, 4)
  return Buffer.concat([tete, t, suite, ...bouts])
}

const ici = dirname(fileURLToPath(import.meta.url)), sortie = resolve(process.argv[2] ?? 'salon-de-coiffure.html')
const r = await build({
  root: ici, configFile: false, logLevel: 'warn',
  build: { write: false, assetsInlineLimit: 0, target: 'es2022', rollupOptions: { input: join(ici, 'demo.ts'), output: { format: 'iife', inlineDynamicImports: true } } }
})
const code = (Array.isArray(r) ? r[0] : r).output.find(o => o.type === 'chunk').code.replaceAll('</script', '<\\/script')
const modele = gzipSync(alleger(readFileSync(join(ici, '../../public/assets/salon/buste.glb'))), { level: 9 }).toString('base64')
const page = readFileSync(join(ici, 'index.html'), 'utf8'), appel = '<script type="module" src="./demo.ts"></script>'
if (!page.includes(appel)) throw new Error('index.html a changé : appel de demo.ts introuvable')
// tout en ASCII : les accents tiennent, quel que soit l'encodage que l'aperçu suppose
const ascii = (t, f) => Array.from(t, c => c.codePointAt(0) < 128 ? c : f(c)).join('')
const js = t => ascii(t, c => c.split('').map(u => '\\u' + u.charCodeAt(0).toString(16).padStart(4, '0')).join(''))
const html = t => t.split(/(<script>[\s\S]*?<\/script>)/).map(p => p.startsWith('<script>') ? js(p) : ascii(p, c => `&#${c.codePointAt(0)};`)).join('')
writeFileSync(sortie, html(page).replace(appel, () => `<script>window.__modele='gz:${modele}'</script>\n<script>${js(code)}</script>`))
console.log(sortie)
