/* Sauvegarde de secours — tant qu'il n'y a pas de base de données, TOUT vit
   dans le localStorage du navigateur : profils, photos, voix enregistrées,
   progression. Un nettoyage du navigateur efface tout, et le quota (~5 Mo)
   peut être atteint sans prévenir.

   Ce module donne deux filets :
   1. exporter / réimporter un fichier JSON (à ranger dans le cloud du parent) ;
   2. un stockage qui PRÉVIENT au lieu d'échouer en silence quand c'est plein. */

import { toast } from './utils'

export const STORE_KEY = 'ferme:v2'
const FORMAT = 'ferme-magique-sauvegarde'

export interface SaveFile {
  format: string
  version: number
  date: string
  data: unknown
}

/** Poids approximatif de la sauvegarde, en octets. */
export function saveBytes(): number {
  try { return new Blob([localStorage.getItem(STORE_KEY) || '']).size } catch { return 0 }
}

export const prettySize = (b: number) =>
  b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} Mo` : `${Math.round(b / 1024)} Ko`

/** Le quota d'un localStorage tourne autour de 5 Mo : au-delà de 80 %, on alerte. */
export const QUOTA = 5 * 1024 * 1024
export const isTight = () => saveBytes() > QUOTA * 0.8

export function exportSave(): boolean {
  const raw = localStorage.getItem(STORE_KEY)
  if (!raw) { toast('Rien à sauvegarder pour l\'instant'); return false }
  let data: unknown
  try { data = JSON.parse(raw) } catch { toast('Sauvegarde illisible 😕'); return false }
  const file: SaveFile = {
    format: FORMAT, version: 2,
    date: new Date().toISOString(),
    data
  }
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const d = new Date()
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  a.href = url
  a.download = `ferme-magique-${stamp}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return true
}

/** Relit un fichier exporté et remplace la sauvegarde. Recharge l'app ensuite. */
export async function importSave(file: File): Promise<string | null> {
  let parsed: SaveFile
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    return 'Ce fichier n\'est pas une sauvegarde lisible.'
  }
  if (!parsed || parsed.format !== FORMAT || !parsed.data) {
    return 'Ce fichier ne vient pas de La Ferme Magique.'
  }
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(parsed.data))
  } catch {
    return 'Impossible d\'écrire : la mémoire du navigateur est pleine.'
  }
  return null
}

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
