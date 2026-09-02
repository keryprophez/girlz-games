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
  },
  impact: {
    slug: 'impact-sounds', title: 'Impact Sounds',
    url: 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip'
  },
  holiday: {
    slug: 'holiday-kit', title: 'Holiday Kit (3D)',
    url: 'https://kenney.nl/media/pages/assets/holiday-kit/3976a6496a-1733923970/kenney_holiday-kit.zip'
  },
  space: {
    slug: 'space-kit', title: 'Space Kit (3D)',
    url: 'https://kenney.nl/media/pages/assets/space-kit/20874c75ac-1677698978/kenney_space-kit.zip'
  }
}

/* Les planches gardées : <nom de sortie> ← <pack>/<chemin du .png dans le zip>.
   Chaque planche a un .xml voisin que l'on convertit en .json. */
const SHEETS = [
  { out: 'animals', pack: 'animals', png: 'Spritesheet/round.png' },
  { out: 'fish', pack: 'fish', png: 'Spritesheet/spritesheet.png' },
  { out: 'nature', pack: 'background', png: 'Spritesheet/bgElements_spritesheet.png' },
  { out: 'items', pack: 'platformer', png: 'Base pack/Items/items_spritesheet.png' }
  // `tiles` (planche de sols du platformer) a été retirée le 2/09 : aucun jeu ne la chargeait.
]

/* Modèles 3D : quelques .glb triés dans les kits Kenney. Ils sont minuscules
   (8 à 60 Ko) et partagent une seule texture `Textures/colormap.png` — qu'il
   faut copier À CÔTÉ des .glb, car ils la référencent en chemin relatif. */
const MODELS = [
  { pack: 'food', dir: 'Models/GLB format', out: 'food', files: [
    // Garniture de la Pizzeria
    'mushroom.glb', 'tomato-slice.glb', 'cheese-cut.glb', 'corn.glb',
    'onion-half.glb', 'sausage-half.glb', 'pepper.glb', 'bread.glb',
    // Récolte d'Attrape, et le panier
    'bowl.glb', 'apple.glb', 'carrot.glb', 'banana.glb', 'orange.glb',
    'strawberry.glb', 'pear.glb', 'broccoli.glb', 'leek.glb', 'pineapple.glb',
    'eggplant.glb', 'avocado.glb',
    // La poêle de Pop-corn
    'frying-pan.glb',
    // Ninja Verger : fruits entiers + leurs moitiés (« advocado » : typo Kenney)
    'lemon.glb', 'apple-half.glb', 'lemon-half.glb', 'pear-half.glb', 'advocado-half.glb',
    // Pêche Précise
    'fish.glb'
  ] },
  // Sapins enneigés du Bonhomme de neige (colormap externe, comme food)
  { pack: 'holiday', dir: 'Models/GLB format', out: 'holiday', files: [
    'tree-snow-a.glb', 'tree-snow-b.glb', 'tree-snow-c.glb'
  ] },
  // La vraie fusée de Voyage dans l'Espace : modulaire, on l'assemble en jeu
  // (matériaux embarqués, pas de colormap dans ce kit)
  { pack: 'space', dir: 'Models/GLTF format', out: 'space', files: [
    'rocket_baseA.glb', 'rocket_fuelA.glb', 'rocket_topA.glb'
  ] }
]

/* Icônes 2D tirées des RENDUS du Food Kit (Previews/) : les mêmes objets que
   les modèles 3D de la Pizzeria et d'Attrape, en pictogrammes cohérents.
   Servent au Marché (produits), au Quiz (scènes à compter) et à l'Intrus. */
const ICONS = [
  // Étal du marché
  'apple', 'carrot', 'loaf-baguette', 'cheese', 'strawberry', 'egg', 'honey',
  'corn', 'cookie', 'muffin',
  // Fruits et légumes de l'Intrus
  'banana', 'grapes', 'cherries', 'orange', 'pear', 'lemon', 'pineapple',
  'watermelon', 'broccoli', 'tomato', 'eggplant', 'onion', 'pumpkin-basic',
  'radish', 'cabbage',
  // Objets (« lequel n'est pas un animal ? »)
  'pot', 'plate-dinner', 'cup', 'bread', 'cake'
]

/* Bruitages foley pour core/impact.ts : 4 variantes par matière, classées du
   plus léger au plus lourd — c'est la FORCE du choc qui choisit la variante.
   Les fichiers viennent de Audio/ dans le pack impact-sounds. */
const SOUNDS = {
  bois: ['impactWood_light_000', 'impactWood_medium_000', 'impactWood_medium_002', 'impactWood_heavy_000'],
  glace: ['impactGlass_light_000', 'impactGlass_light_002', 'impactGlass_medium_000', 'impactGlass_heavy_000'],
  neige: ['footstep_snow_000', 'footstep_snow_002', 'impactSoft_medium_000', 'impactSoft_heavy_000'],
  pate: ['impactSoft_medium_001', 'impactSoft_medium_003', 'impactSoft_heavy_001', 'impactSoft_heavy_003'],
  metal: ['impactMetal_light_000', 'impactMetal_medium_000', 'impactMetal_medium_002', 'impactMetal_heavy_000'],
  sourd: ['impactPunch_medium_000', 'impactPunch_medium_002', 'impactPunch_heavy_000', 'impactPunch_heavy_002']
}

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
  // Certains kits (space, nature) embarquent leurs matériaux : pas de colormap
  const tex = join(src, 'Textures', 'colormap.png')
  if (existsSync(tex)) {
    cpSync(tex, join(dst, 'Textures', 'colormap.png'))
    total += readFileSync(tex).length
  }
  console.log(`✓ modèles ${m.out} — ${m.files.length} objets 3D`)
}

{
  const dst = join(OUT, 'icons', 'food')
  mkdirSync(dst, { recursive: true })
  for (const f of ICONS) {
    const from = join(TMP, 'food', 'Previews', f + '.png')
    if (!existsSync(from)) { console.error(`✗ icône introuvable : ${from}`); process.exit(1) }
    cpSync(from, join(dst, f + '.png'))
    total += readFileSync(from).length
  }
  console.log(`✓ icônes food — ${ICONS.length} pictogrammes`)
}

{
  const dst = join(OUT, 'sounds')
  mkdirSync(dst, { recursive: true })
  let n = 0
  for (const files of Object.values(SOUNDS)) {
    for (const f of files) {
      const from = join(TMP, 'impact', 'Audio', f + '.ogg')
      if (!existsSync(from)) { console.error(`✗ son introuvable : ${from}`); process.exit(1) }
      cpSync(from, join(dst, f + '.ogg'))
      total += readFileSync(from).length
      n++
    }
  }
  console.log(`✓ sons — ${n} bruitages foley`)
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
