/* Des images GARDÉES d'une ouverture de l'appli à l'autre (Cache API du
   navigateur) : ce qui coûte un calcul 3D — les portraits des princesses de
   l'écran de fin, les vignettes de la garde-robe — ne se refait que pour une
   tenue nouvelle. Chaque espace (`ns`) a son plafond : au-delà, les plus
   anciennes s'en vont. Rien ne sort de la tablette. */

const DISK = 'ferme-princesses-v1'

export const hashKey = (s: string) => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36) + '-' + s.length.toString(36)
}

/** L'image gardée sous `key` (dataURL), ou null. */
export async function diskGet(ns: string, key: string): Promise<string | null> {
  if (typeof caches === 'undefined') return null
  try {
    const r = await (await caches.open(DISK)).match(ns + '/' + hashKey(key))
    if (!r) return null
    const b = await r.blob()
    return await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = () => rej(fr.error); fr.readAsDataURL(b) })
  } catch (e) {
    console.warn('image gardée illisible, on la recalcule', e)
    return null
  }
}

/** Garde l'image `url` (dataURL) ; `max` images au plus dans cet espace. */
export async function diskPut(ns: string, key: string, url: string, max: number) {
  if (typeof caches === 'undefined') return
  try {
    const c = await caches.open(DISK)
    const b = await (await fetch(url)).blob()
    await c.put(ns + '/' + hashKey(key), new Response(b, { headers: { 'content-type': b.type || 'image/png' } }))
    const mine = (await c.keys()).filter(k => new URL(k.url).pathname.includes('/' + ns + '/'))
    for (const k of mine.slice(0, Math.max(0, mine.length - max))) await c.delete(k)
  } catch (e) {
    console.warn('image non gardée (stockage refusé ?)', e)
  }
}
