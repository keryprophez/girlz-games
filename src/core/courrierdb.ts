/* @version 2026-11-26 16:58 */
import type { Who } from './mine'
import type { Lettre, Prefs } from './courrier'

/* LE COFFRE du Courrier : les lettres (dessins et voix en `Blob`) et les
   réglages de chaque fille. Trois réalisations du même contrat :
   - `coffreIDB` : sur l'appareil (IndexedDB, base `ferme-courrier` ;
     localStorage est trop petit pour des voix) ; aucune clé existante n'est
     touchée. Seul coffre des bots ; sous le coffre en ligne, il garde les
     brouillons de l'appareil.
   - `coffreMemoire` : en mémoire (tests).
   - `coffreEnLigne` (core/courrierenligne.ts) : sur Cloudflare, par le
     Worker (troisième exception de la règle 3, choisie par le père le 26/11).

   - Une lettre est écrite TOUTE SEULE (une fiche par lettre), jamais la liste
     entière : une écriture qui échoue ne perd que celle-là.
   - Chaque écriture répond vrai ou faux. Faux (plein, refusé, base fermée) :
     le jeu n'annonce rien (« postée ») et garde l'état d'avant.
   - Une base refusée (navigation privée) : les lectures sont vides, les
     écritures répondent faux ; rien ne casse.
   - `coffreMemoire` : le même contrat, en mémoire (tests ; `echec` simule une
     écriture refusée). */

export interface Coffre {
  lettres(): Promise<Lettre[]>
  /** `ici` : un brouillon gardé sur cet appareil seulement (à chaque geste) ; sans lui, il part aussi en ligne. */
  garderLettre(l: Lettre, o?: { ici?: boolean }): Promise<boolean>
  jeterLettre(id: string): Promise<boolean>
  /** Les fichiers d'une lettre arrivée sans eux (`aCharger`) ; null : un brouillon dont un fichier n'est pas venu. */
  completer(l: Lettre): Promise<Lettre | null>
  /** La dernière lecture de la liste a échoué (réseau, code expiré). */
  horsLigne(): boolean
  prefs(w: Who): Promise<Prefs>
  garderPrefs(w: Who, p: Prefs): Promise<boolean>
}

const SANS: Prefs = { envois: 0, env: null, faits: [] }
const copie = <T>(v: T): T => structuredClone(v)

export function coffreMemoire(o: { echec?: () => boolean } = {}): Coffre {
  const lettres = new Map<string, Lettre>(), prefs = new Map<Who, Prefs>()
  const ok = () => !o.echec?.()
  return {
    async lettres() { return [...lettres.values()].map(copie) },
    async garderLettre(l) { if (!ok()) return false; lettres.set(l.id, copie(l)); return true },
    async jeterLettre(id) { if (!ok()) return false; lettres.delete(id); return true },
    async completer(l) { return l },
    horsLigne: () => false,
    async prefs(w) { return copie(prefs.get(w) ?? SANS) },
    async garderPrefs(w, p) { if (!ok()) return false; prefs.set(w, copie(p)); return true }
  }
}

export function coffreIDB(): Coffre {
  let base: Promise<IDBDatabase> | null = null
  const ouvrir = () => (base ??= new Promise<IDBDatabase>((res, rej) => {
    const rq = indexedDB.open('ferme-courrier', 1)
    rq.onupgradeneeded = () => {
      const d = rq.result
      if (!d.objectStoreNames.contains('lettres')) d.createObjectStore('lettres', { keyPath: 'id' })
      if (!d.objectStoreNames.contains('divers')) d.createObjectStore('divers')
    }
    rq.onsuccess = () => res(rq.result)
    rq.onerror = () => { base = null; rej(rq.error) }
  }))
  const lire = async <T>(magasin: string, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> => {
    try {
      const d = await ouvrir()
      return await new Promise<T | null>(res => {
        const rq = fn(d.transaction(magasin).objectStore(magasin))
        rq.onsuccess = () => res(rq.result ?? null)
        rq.onerror = () => res(null)
      })
    } catch { return null }
  }
  const ecrire = async (magasin: string, fn: (s: IDBObjectStore) => void): Promise<boolean> => {
    try {
      const d = await ouvrir()
      return await new Promise<boolean>(res => {
        const tx = d.transaction(magasin, 'readwrite')
        fn(tx.objectStore(magasin))
        tx.oncomplete = () => res(true)
        tx.onerror = () => res(false)
        // Une transaction qui avorte (quota, base fermée) ne passe pas par onerror (piège de l'Atelier)
        tx.onabort = () => res(false)
      })
    } catch { return false }
  }
  return {
    async lettres() { return (await lire<Lettre[]>('lettres', s => s.getAll())) ?? [] },
    garderLettre: l => ecrire('lettres', s => { s.put(l) }),
    jeterLettre: id => ecrire('lettres', s => { s.delete(id) }),
    async completer(l) { return l },
    horsLigne: () => false,
    async prefs(w) { return (await lire<Prefs>('divers', s => s.get('prefs:' + w))) ?? copie(SANS) },
    garderPrefs: (w, p) => ecrire('divers', s => { s.put(p, 'prefs:' + w) })
  }
}
