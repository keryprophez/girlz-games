/* Sprites CC0 — chargement des planches d'assets, à la demande.

   Les planches viennent de `scripts/import-assets.mjs` : un PNG packé plus un
   JSON qui donne le rectangle de chaque sprite. Une planche est chargée une
   seule fois puis mise en cache : les jeux peuvent la demander sans se soucier
   de qui l'a déjà fait.

   Deux usages :
   - `frameStyle()` pour les jeux en DOM (le sprite devient un background-image
     décalé — pas d'image par sprite, une seule requête réseau pour la planche) ;
   - `atlas.image` + les rectangles pour les jeux WebGL, qui découpent eux-mêmes.

   Rien n'est précaché par le service worker : c'est le temps de démarrage qui
   compte, pas la disponibilité hors-ligne. */

export interface Frame { x: number; y: number; w: number; h: number }
export interface Atlas {
  /** URL complète du PNG, prête à l'emploi. */
  image: string
  size: { w: number; h: number }
  frames: Record<string, Frame>
  /** Noms de sprites disponibles, triés. */
  names: string[]
}

const cache = new Map<string, Promise<Atlas>>()

/** Vite sert l'app sous une base configurable — les assets la suivent. */
const url = (p: string) => `${import.meta.env.BASE_URL}assets/${p}`

export function loadAtlas(name: string): Promise<Atlas> {
  let p = cache.get(name)
  if (!p) {
    p = fetch(url(`${name}.json`))
      .then(r => {
        if (!r.ok) throw new Error(`planche introuvable : ${name}`)
        return r.json()
      })
      .then((raw: { image: string; size: Atlas['size']; frames: Atlas['frames'] }) => {
        const atlas: Atlas = {
          image: url(raw.image),
          size: raw.size,
          frames: raw.frames,
          names: Object.keys(raw.frames).sort()
        }
        // Précharge le PNG : sans ça le premier sprite affiché clignote
        return new Promise<Atlas>(resolve => {
          const img = new Image()
          img.onload = img.onerror = () => resolve(atlas)
          img.src = atlas.image
        })
      })
    cache.set(name, p)
    // Un échec réseau ne doit pas empoisonner le cache pour toute la session
    p.catch(() => cache.delete(name))
  }
  return p
}

/** Style CSS affichant un sprite de la planche, mis à l'échelle dans `px` pixels. */
export function frameStyle(atlas: Atlas, name: string, px: number): string {
  const f = atlas.frames[name]
  if (!f) return ''
  // On tient le sprite dans un carré de `px` sans le déformer
  const k = px / Math.max(f.w, f.h)
  return [
    `background-image:url('${atlas.image}')`,
    `background-position:${-f.x * k}px ${-f.y * k}px`,
    `background-size:${atlas.size.w * k}px ${atlas.size.h * k}px`,
    `width:${f.w * k}px`,
    `height:${f.h * k}px`
  ].join(';')
}

/** Applique un sprite à un élément déjà en place. */
export function setFrame(el: HTMLElement, atlas: Atlas, name: string, px: number) {
  el.setAttribute('style', (el.dataset.baseStyle || '') + ';' + frameStyle(atlas, name, px))
}

/* ---------- Ce que contiennent les planches ----------
   Les noms viennent de Kenney, on les garde tels quels : le script d'import
   se relance à l'identique, et on retrouve la source sans traduction à faire. */

/** Animaux de la ferme présents dans `animals`, dans l'ordre où on aime les voir. */
const imgEls = new Map<string, HTMLImageElement>()
const cropCache = new Map<string, string>()

/** Découpe une frame d'atlas en data-URL — pour les <image> d'un SVG, là où
    background-position ne peut pas suivre. Après `await loadAtlas`, la planche
    est déjà décodée : le découpage est immédiat. */
export function frameDataURL(atlas: Atlas, name: string, px: number): string {
  const key = `${atlas.image}|${name}|${px}`
  const hit = cropCache.get(key)
  if (hit) return hit
  const f = atlas.frames[name]
  if (!f) return ''
  let img = imgEls.get(atlas.image)
  if (!img) { img = new Image(); img.src = atlas.image; imgEls.set(atlas.image, img) }
  if (!img.complete) return ''
  const k = px / Math.max(f.w, f.h)
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(f.w * k))
  c.height = Math.max(1, Math.round(f.h * k))
  c.getContext('2d')!.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, c.width, c.height)
  const u = c.toDataURL('image/png')
  cropCache.set(key, u)
  return u
}

/** Chemin d'une icône food (rendu 2D du Food Kit, voir import-assets.mjs). */
export const foodIcon = (name: string) => `${import.meta.env.BASE_URL}assets/icons/food/${name}.png`

/** Une icône food prête à insérer dans du HTML. */
export const foodImg = (name: string, px: number) =>
  `<img class="spr" src="${foodIcon(name)}" width="${px}" height="${px}" alt="">`

/** Un sprite d'atlas prêt à insérer dans du HTML. */
export const spriteSpan = (atlas: Atlas, name: string, px: number) =>
  `<i class="spr" style="${frameStyle(atlas, name, px)}"></i>`

export const FARM_ANIMALS = [
  'cow', 'pig', 'chicken', 'chick', 'duck', 'horse', 'goat', 'rabbit',
  'dog', 'frog', 'owl', 'parrot'
]

/* La planche `nature` mélange les saisons : il y a des sapins enneigés, des
   feuillages d'automne et des cactus. On isole ici ce qui est vert et vivant,
   sinon on sème de la neige rouille au milieu d'un pré. */

/** Arbres verts, du plus rond au plus pointu. */
export const GREEN_TREES = [
  'tree05', 'tree34', 'tree02', 'tree03', 'tree10', 'tree14',
  'tree20', 'tree21', 'tree31', 'tree32', 'tree23'
]

/** Touffes d'herbe vertes (grass1 et 2 sont enneigées, grass3 est rouille). */
export const GREEN_GRASS = ['grass4', 'grass5', 'grass6']

/** Cactus de la planche `nature` — utiles pour un décor sec. */
export const CACTI = ['tree16', 'tree17', 'tree18', 'tree19']

/** Les autres animaux de la planche — pour l'album et la variété. */
export const WILD_ANIMALS = [
  'bear', 'buffalo', 'crocodile', 'elephant', 'giraffe', 'gorilla', 'hippo',
  'monkey', 'moose', 'narwhal', 'panda', 'penguin', 'rhino', 'sloth', 'snake',
  'walrus', 'whale', 'zebra'
]
