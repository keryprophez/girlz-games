/* Le stockage de la sauvegarde : le localStorage du navigateur (la clé de
   la sauvegarde de la famille), par un stockage qui PRÉVIENT au lieu
   d'échouer en silence quand il est plein. L'export et l'import d'un
   fichier sont sortis (la fenêtre le 10/09, le code le 27/10). */

import { toast } from './utils'

export const STORE_KEY = 'ferme:v2'

/* ---- Stockage qui ne se tait pas ----
   zustand/persist avale les exceptions de setItem : au dépassement de quota,
   la partie n'est plus enregistrée et personne ne le sait. On prévient. */
let warned = false

export const loudStorage = {
  getItem: (name: string) => {
    try { return localStorage.getItem(name) } catch { return null }
  },
  setItem: (name: string, value: string) => {
    try {
      localStorage.setItem(name, value)
      warned = false
    } catch {
      if (!warned) {
        warned = true
        toast('⚠️ Mémoire pleine : la progression n\'est plus enregistrée')
      }
    }
  },
  removeItem: (name: string) => {
    try { localStorage.removeItem(name) } catch { /* rien à faire */ }
  }
}
