/* Import des assets CC0 Kenney — à relancer seulement si on veut ajouter un pack.

   Ce script télécharge les zips, ne garde que les planches réellement utilisées,
   convertit l'atlas XML de Kenney en JSON (format attendu par core/sprites.ts)
   et écrit public/assets/CREDITS.md.

   Le tri est volontaire : les packs Kenney font des centaines de fichiers dont
   la plupart ne servent à rien ici. On ne commite que ce qui est utilisé.

   Usage : node scripts/import-assets.mjs */
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, basename } from 'node:path'

const TMP = '/tmp/kenney-import'
const OUT = 'public/assets'

/* Les packs qu'on télécharge, avec leur URL de zip direct (lisible dans le HTML
   de https://kenney.nl/assets/<slug>) et leur licence. */
const PACKS = {
  animals: {
    slug: 'animal-pack-remastered', title: 'Animal Pack Remastered',
    url: 'https://kenney.nl/media/pages/assets/animal-pack-remastered/54a307a369-1774771709/kenney_animal-pack-remastered.zip'
  },
  platformer: {
    slug: 'platformer-art-deluxe', title: 'Platformer Art Deluxe',
    url: 'https://kenney.nl/media/pages/assets/platformer-art-deluxe/cb30f83169-1677696393/kenney_platformer-art-deluxe.zip'
  },
  background: {
    slug: 'background-elements', title: 'Background Elements',
    url: 'https://kenney.nl/media/pages/assets/background-elements/b66a1ddec7-1677670395/kenney_background-elements.zip'
  },
  fish: {
    slug: 'fish-pack', title: 'Fish Pack',
    url: 'https://kenney.nl/media/pages/assets/fish-pack/07ae98c5b6-1747237960/kenney_fish-pack_2.zip'
  },
  food: {
    slug: 'food-kit', title: 'Food Kit (3D)',
    url: 'https://kenney.nl/media/pages/assets/food-kit/83086fa91c-1719418518/kenney_food-kit.zip'
  }
}

/* Les planches gardées : <nom de sortie> ← <pack>/<chemin du .png dans le zip>.
   Chaque planche a un .xml voisin que l'on convertit en .json. */
const SHEETS = [
  { out: 'animals', pack: 'animals', png: 'Spritesheet/round.png' },
  { out: 'fish', pack: 'fish', png: 'Spritesheet/spritesheet.png' },
  { out: 'nature', pack: 'background', png: 'Spritesheet/bgElements_spritesheet.png' },
  { out: 'items', pack: 'platformer', png: 'Base pack/Items/items_spritesheet.png' },
  { out: 'tiles', pack: 'platformer', png: 'Base pack/Tiles/tiles_spritesheet.png' }
]

/* Modèles 3D : quelques .glb triés dans les kits Kenney. Ils sont minuscules
   (8 à 60 Ko) et partagent une seule texture `Textures/colormap.png` — qu'il
   faut copier À CÔTÉ des .glb, car ils la référencent en chemin relatif. */
const MODELS = [
  { pack: 'food', dir: 'Models/GLB format', out: 'food', files: [
    'mushroom.glb', 'tomato-slice.glb', 'cheese-cut.glb', 'corn.glb',
    'onion-half.glb', 'sausage-half.glb', 'pepper.glb', 'bread.glb'
  ] }
]

/* Particules : PAS embarquées pour l'instant. Les PNG de Kenney font 512×512
   chacun — 550 Ko à eux seuls, la moitié du poids total — alors que core/fx.ts
   et core/juice.ts font déjà le travail en DOM. À reprendre quand les jeux
   d'action passeront sur PixiJS et qu'on saura lesquelles servent vraiment. */
const PARTICLES = []

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' })

function parseAtlas(xml) {
  // Format Starling/TexturePacker : <SubTexture name="x.png" x= y= width= height=/>
  const frames = {}
  const re = /<SubTexture\s+name="([^"]+)"\s+x="(\d+)"\s+y="(\d+)"\s+width="(\d+)"\s+height="(\d+)"/g
  let m
  while ((m = re.exec(xml))) {
    const name = m[1].replace(/\.png$/i, '')
    frames[name] = { x: +m[2], y: +m[3], w: +m[4], h: +m[5] }
  }
  return frames
}

/* PNG : la taille est dans le chunk IHDR, octets 16..24 — pas besoin de décodeur. */
function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
}

mkdirSync(TMP, { recursive: true })
mkdirSync(OUT, { recursive: true })

const credits = []
for (const [key, p] of Object.entries(PACKS)) {
  const zip = join(TMP, key + '.zip')
  const dir = join(TMP, key)
  if (!existsSync(zip)) {
    console.log(`↓ ${p.title}`)
    sh('curl', ['-sL', '--fail', '-o', zip, p.url])
  }
  if (existsSync(dir)) rmSync(dir, { recursive: true })
  mkdirSync(dir, { recursive: true })
  sh('unzip', ['-qo', zip, '-d', dir])
  credits.push(p)
}

let total = 0
for (const s of SHEETS) {
  const src = join(TMP, s.pack, s.png)
  const xmlPath = src.replace(/\.png$/, '.xml')
  if (!existsSync(src) || !existsSync(xmlPath)) {
    console.error(`✗ introuvable : ${src}`)
    process.exit(1)
  }
  const png = readFileSync(src)
  const { w, h } = pngSize(png)
  const frames = parseAtlas(readFileSync(xmlPath, 'utf8'))
  writeFileSync(join(OUT, s.out + '.png'), png)
  writeFileSync(join(OUT, s.out + '.json'), JSON.stringify({
    image: s.out + '.png', size: { w, h }, frames
  }))
  total += png.length
  console.log(`✓ ${s.out} — ${Object.keys(frames).length} sprites, ${Math.round(png.length / 1024)} Ko`)
}

if (PARTICLES.length) {
  mkdirSync(join(OUT, 'particles'), { recursive: true })
  for (const f of PARTICLES) {
    const src = join(TMP, 'particles', 'PNG (Transparent)', f)
    if (!existsSync(src)) { console.warn(`… particule absente, ignorée : ${f}`); continue }
    cpSync(src, join(OUT, 'particles', basename(f)))
    total += readFileSync(src).length
  }
}

for (const m of MODELS) {
  const dst = join(OUT, 'models', m.out)
  mkdirSync(join(dst, 'Textures'), { recursive: true })
  const src = join(TMP, m.pack, m.dir)
  for (const f of m.files) {
    const from = join(src, f)
    if (!existsSync(from)) { console.error(`✗ modèle introuvable : ${from}`); process.exit(1) }
    cpSync(from, join(dst, f))
    total += readFileSync(from).length
  }
  const tex = join(src, 'Textures', 'colormap.png')
  cpSync(tex, join(dst, 'Textures', 'colormap.png'))
  total += readFileSync(tex).length
  console.log(`✓ modèles ${m.out} — ${m.files.length} objets 3D`)
}

writeFileSync(join(OUT, 'CREDITS.md'), `# Crédits des assets

Tous les visuels de ce dossier viennent de **[Kenney](https://kenney.nl)** et sont
publiés en **CC0 1.0 (domaine public)** : utilisation libre, y compris
commerciale, sans obligation d'attribution. On cite quand même, c'est la moindre
des choses — ce travail est offert.

${credits.map(p => `- **${p.title}** — <https://kenney.nl/assets/${p.slug}>`).join('\n')}

Les planches ont été **triées** : on ne garde que les sprites réellement utilisés
par les jeux. Pour en ajouter, modifier \`scripts/import-assets.mjs\` et le
relancer.
`)

console.log(`\nTotal embarqué : ${Math.round(total / 1024)} Ko`)
