/* @version 2026-11-25 00:20 */
// Le modèle de l'app : sans la vignette ni les cheveux peints ; les expressions gardées
import fs from 'node:fs'
const glb = fs.readFileSync('.maquette/coiffure/Base_Female.vrm.wasm')
const nj = glb.readUInt32LE(12), j = JSON.parse(glb.toString('utf8', 20, 20 + nj)), bin = glb.subarray(28 + nj)
console.log('expressions', j.extensions.VRM.blendShapeMaster.blendShapeGroups.map(g => g.presetName + ':' + g.name + '(' + (g.binds?.length ?? 0) + ')').join(' '))
const vide = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'), creux = new Set()
for (const i of j.images) if (/thumbnail|hairback/i.test(i.name ?? '')) { i.mimeType = 'image/png'; creux.add(i.bufferView) }
const bouts = []; let o = 0
j.bufferViews.forEach((v, k) => { const d = creux.has(k) ? vide : bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength); v.byteOffset = o; v.byteLength = d.length; const f = Buffer.concat([d, Buffer.alloc((4 - d.length % 4) % 4)]); bouts.push(f); o += f.length })
j.buffers = [{ byteLength: o }]
let t = Buffer.from(JSON.stringify(j)); t = Buffer.concat([t, Buffer.alloc((4 - t.length % 4) % 4, 32)])
const a = Buffer.alloc(20), b = Buffer.alloc(8)
a.writeUInt32LE(0x46546C67, 0); a.writeUInt32LE(2, 4); a.writeUInt32LE(28 + t.length + o, 8); a.writeUInt32LE(t.length, 12); a.writeUInt32LE(0x4E4F534A, 16); b.writeUInt32LE(o, 0); b.writeUInt32LE(0x004E4942, 4)
fs.writeFileSync('public/assets/salon/buste.glb', Buffer.concat([a, t, b, ...bouts])); console.log('buste.glb', 28 + t.length + o)
