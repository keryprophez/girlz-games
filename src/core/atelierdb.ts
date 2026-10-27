/* Le stockage de l'Atelier (IndexedDB « ferme-atelier », local à la
   tablette, règle 3), partagé depuis le 27/09 avec la Princesse : sa photo
   devient un coloriage de l'Atelier et un dessin du dossier.

   `pages` : la feuille de chaque modèle (PNG), son film (`…:frames`), et
   les coloriages des princesses (`princesse:<id>`, liste dans
   `princesse:liste`) ; `gallery` : les dessins rangés dans le dossier.
   localStorage est trop petit pour des images. */

/** Un dessin rangé dans le dossier. */
export interface Drawing { id: number; profile: string; page: string; paper: string; paint: Blob; thumb: Blob; frames: Blob[]; at: number }

let dbp: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((res, rej) => {
    const rq = indexedDB.open('ferme-atelier', 2)
    rq.onupgradeneeded = () => {
      const d = rq.result
      if (!d.objectStoreNames.contains('pages')) d.createObjectStore('pages')
      if (!d.objectStoreNames.contains('gallery')) d.createObjectStore('gallery', { keyPath: 'id' })
    }
    rq.onsuccess = () => res(rq.result)
    rq.onerror = () => { dbp = null; rej(rq.error) }
  })
  return dbp
}
export async function idbGet<T>(store: string, key: IDBValidKey): Promise<T | null> {
  try {
    const d = await db()
    return await new Promise(res => {
      const rq = d.transaction(store).objectStore(store).get(key)
      rq.onsuccess = () => res((rq.result as T) ?? null)
      rq.onerror = () => res(null)
    })
  } catch { return null }
}
export async function idbPut(store: string, value: unknown, key?: IDBValidKey): Promise<boolean> {
  try {
    const d = await db()
    return await new Promise(res => {
      const tx = d.transaction(store, 'readwrite')
      tx.objectStore(store).put(value, key)
      tx.oncomplete = () => res(true)
      tx.onerror = () => res(false)
      // Une transaction qui avorte (quota, base fermée) ne passe pas par
      // onerror : sans ceci, « Ranger » attendait pour toujours
      tx.onabort = () => res(false)
    })
  } catch { return false } // stockage refusé (navigation privée) : rien n'est gardé, rien ne casse
}
export async function idbDel(store: string, key: IDBValidKey) {
  try {
    const d = await db()
    await new Promise(res => {
      const tx = d.transaction(store, 'readwrite')
      tx.objectStore(store).delete(key)
      tx.oncomplete = () => res(true)
      tx.onerror = () => res(false)
      tx.onabort = () => res(false)
    })
  } catch { /* rien à jeter */ }
}
export async function drawings(profile: string): Promise<Drawing[]> {
  try {
    const d = await db()
    const all = await new Promise<Drawing[]>(res => {
      const rq = d.transaction('gallery').objectStore('gallery').getAll()
      rq.onsuccess = () => res((rq.result as Drawing[]) || [])
      rq.onerror = () => res([])
    })
    return all.filter(x => x.profile === profile).sort((a, b) => b.at - a.at)
  } catch { return [] }
}

/* ---- Les coloriages des princesses (photos de la Princesse, partie le
   6/10) : plus rien ne s'y ajoute, ceux qui restent se colorient encore ---- */
export async function princessPages(): Promise<string[]> {
  return (await idbGet<string[]>('pages', 'princesse:liste')) || []
}
