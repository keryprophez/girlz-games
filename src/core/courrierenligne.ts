/* @version 2026-11-26 16:58 */
import type { Who } from './mine'
import type { Lettre, Objet, Prefs, Vocal } from './courrier'
import type { Coffre } from './courrierdb'
import { cleDe, lireLettre, lirePrefs, type LettreFil, type ObjetFil, type PrefsFil } from './courrierfil'

/* LE COFFRE EN LIGNE du Courrier (26/11, troisième exception de la règle 3,
   choisie par le père) : les lettres vivent sur Cloudflare, par le Worker
   (`/api/courrier/*`, worker/courrier.ts) ; la boîte, les Souvenirs et les
   brouillons suivent les filles d'un appareil à l'autre.

   - Le BROUILLON reste aussi sur l'appareil (`local`, IndexedDB) : à chaque
     geste (`ici`) il n'y est gardé que là ; à la sortie de la feuille et à
     « Envoyer », il part aussi en ligne. À la lecture, le plus avancé des deux
     gagne (`version`), mais jamais contre une lettre déjà cachetée ailleurs.
   - Toute autre écriture est EN LIGNE : réussie = une réponse 2xx du Worker,
     sinon `false` et le jeu n'annonce rien.
   - Les fichiers d'abord (le dessin, chaque voix), la lettre ensuite. Un
     `Blob` déjà envoyé ou reçu n'est jamais renvoyé ; une voix qui a sa clé
     non plus.
   - La liste arrive SANS fichiers (`aCharger`) : `completer` les apporte quand
     il faut montrer la lettre, et les garde en mémoire le temps de la partie.
   - Une lecture ratée (réseau, délai, code expiré) : `horsLigne()`, la liste
     n'a que les brouillons de l'appareil (le jeu montre le nuage).
   - La première fois (`MARQUE`), ce que l'appareil gardait déjà part en ligne ;
     sa base n'est pas effacée.
   - Chaque appel a un délai, tenu même si `fetch` ignore le signal. */

export const MARQUE = 'ferme:courrier:migre'
const QUI: Who[] = ['jade', 'joyce']
type Fetch = (chemin: string, init?: RequestInit) => Promise<Response>
type Marque = Pick<Storage, 'getItem' | 'setItem'>
/** ok ; refus : le Worker a dit non (définitif) ; panne : réseau, délai, code expiré, serveur. */
type Issue = 'ok' | 'refus' | 'panne'
const REFUS = [400, 409, 413, 415, 422]

function stockage(): Marque {
  try {
    if (globalThis.localStorage) return globalThis.localStorage
  } catch { /* stockage refusé */ }
  const m = new Map<string, string>()
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v) } }
}
/** 8 caractères au hasard, pour le nom d'une voix. */
const hasard = () => (Math.random().toString(36).slice(2) + '00000000').slice(0, 8)
const vide = (p: Prefs) => !p.envois && !p.env && !p.faits.length

const versLettre = (f: LettreFil): Lettre => {
  const objets: Objet[] = f.objets.map(o => (o.k === 'voix'
    ? { k: 'voix', x: o.x, y: o.y, s: o.s, r: o.r, pics: [...o.pics], duree: o.duree, cle: o.cle, audio: new Blob([], { type: 'audio/webm' }) }
    : { ...o }))
  const l: Lettre = {
    id: f.id, de: f.de, a: f.a, etat: f.etat, cree: f.cree, postee: f.postee, tour: f.tour, papier: f.papier,
    env: f.env && { ...f.env }, objets, peinture: null, peintureCle: f.peinture, version: f.version
  }
  if (f.peinture || f.objets.some(o => o.k === 'voix')) l.aCharger = true
  return l
}

export function coffreEnLigne(local: Coffre, o: { fetch?: Fetch; marque?: Marque; delai?: number } = {}): Coffre {
  const f: Fetch = o.fetch ?? ((chemin, init) => fetch(chemin, init))
  const marque = o.marque ?? stockage()
  const delai = o.delai ?? 10_000
  /** Un `Blob` déjà envoyé ou reçu → sa clé R2. */
  const connus = new WeakMap<Blob, string>()
  /** Les fichiers reçus, le temps de la partie. */
  const recus = new Map<string, Blob>()
  /** La plus grande version connue de chaque lettre. */
  const versions = new Map<string, number>()
  let hors = false

  const noter = (id: string, v: number | undefined) => versions.set(id, Math.max(versions.get(id) ?? 0, v ?? 0))

  /** Un appel et la lecture de sa réponse, dans le délai ; null en cas de panne. */
  async function appel<T>(chemin: string, init: RequestInit, lire: (r: Response) => Promise<T | null>, ms = delai): Promise<T | null> {
    const ctl = new AbortController()
    let minuteur: ReturnType<typeof setTimeout> | undefined
    const trop = new Promise<null>(res => { minuteur = setTimeout(() => { ctl.abort(); res(null) }, ms) })
    const fait = (async () => {
      try {
        return await lire(await f(chemin, { ...init, signal: ctl.signal, credentials: 'same-origin' }))
      } catch {
        return null
      }
    })()
    try {
      return await Promise.race([fait, trop])
    } finally {
      clearTimeout(minuteur)
    }
  }
  const json = async (r: Response): Promise<unknown> =>
    (r.ok && (r.headers.get('content-type') ?? '').includes('application/json') ? r.json() : null)
  const issue = async (r: Response): Promise<Issue> => (r.ok ? 'ok' : REFUS.includes(r.status) ? 'refus' : 'panne')
  const ecrire = async (chemin: string, init: RequestInit, ms?: number): Promise<Issue> => (await appel(chemin, init, issue, ms)) ?? 'panne'
  const ecrireJSON = (chemin: string, methode: string, v: unknown) =>
    ecrire(chemin, { method: methode, body: JSON.stringify(v), headers: { 'content-type': 'application/json' } })

  /** La liste en ligne, relue par le fil ; null : panne. */
  async function lireListe(): Promise<LettreFil[] | null> {
    const v = await appel('/api/courrier/lettres', {}, json)
    if (!v || typeof v !== 'object' || !Array.isArray((v as { lettres?: unknown }).lettres)) return null
    return ((v as { lettres: unknown[] }).lettres).flatMap(x => {
      const l = lireLettre(x, (x as { id?: unknown } | null)?.id as string)
      return l ? [l] : []
    })
  }
  /** Les réglages en ligne ; null : jamais écrits ; undefined : panne. */
  async function lireReglages(w: Who): Promise<PrefsFil | null | undefined> {
    const v = await appel(`/api/courrier/reglages/${w}`, {}, json)
    if (!v || typeof v !== 'object' || !('prefs' in v)) return undefined
    const p = (v as { prefs: unknown }).prefs
    return p === null ? null : lirePrefs(p) ?? null
  }

  /** Un fichier de la lettre `id`, envoyé s'il ne l'a pas déjà été ; sa clé, ou l'issue ratée. */
  async function fichier(id: string, b: Blob, nom: () => string, type: string): Promise<string | Issue> {
    const deja = connus.get(b)
    if (deja?.startsWith(cleDe(id, ''))) return deja
    const cle = cleDe(id, nom())
    const r = await ecrire(`/api/courrier/fichiers/${cle}`, { method: 'PUT', body: b, headers: { 'content-type': type } }, delai * 3)
    if (r !== 'ok') return r === 'refus' ? 'refus' : 'panne'
    connus.set(b, cle)
    return cle
  }
  const estIssue = (x: string): x is Issue => x === 'ok' || x === 'refus' || x === 'panne'

  /** La lettre en ligne : ses fichiers d'abord, elle ensuite. */
  async function pousser(l: Lettre & { version: number }): Promise<Issue> {
    let peinture: string | null = null
    if (l.peinture) {
      const k = await fichier(l.id, l.peinture, () => 'peinture.png', 'image/png')
      if (estIssue(k)) return k
      peinture = k
    } else if (l.etat !== 'brouillon') peinture = l.peintureCle ?? null
    const objets: ObjetFil[] = []
    for (const ob of l.objets) {
      const pose = { x: ob.x, y: ob.y, s: ob.s, r: ob.r }
      if (ob.k === 'texte') objets.push({ k: 'texte', t: ob.t, couleur: ob.couleur, police: ob.police, taille: ob.taille, ...pose })
      else if (ob.k === 'gomme') objets.push({ k: 'gomme', src: ob.src, ...pose })
      else {
        const k = ob.cle?.startsWith(cleDe(l.id, '')) ? ob.cle : await fichier(l.id, ob.audio, () => `voix-${hasard()}.webm`, ob.audio.type || 'audio/webm')
        if (estIssue(k)) return k
        objets.push({ k: 'voix', cle: k, pics: [...ob.pics], duree: ob.duree, ...pose })
      }
    }
    const fil: LettreFil = {
      id: l.id, de: l.de, a: l.a, etat: l.etat, cree: l.cree, postee: l.postee, tour: l.tour, papier: l.papier,
      env: l.env && { ...l.env }, objets, peinture, version: l.version
    }
    return ecrireJSON(`/api/courrier/lettres/${l.id}`, 'PUT', fil)
  }

  /** La première fois : ce que l'appareil gardait part en ligne. Vrai quand tout est fait. */
  async function migrer(enLigne: LettreFil[], locales: Lettre[]): Promise<boolean> {
    const ids = new Set(enLigne.map(x => x.id))
    let fini = true
    for (const l of locales) {
      if (ids.has(l.id)) continue
      // Un refus (forme, version…) est définitif : on ne recommence pas pour lui
      if ((await pousser({ ...l, version: l.version ?? 1 })) === 'panne') fini = false
    }
    for (const w of QUI) {
      const en = await lireReglages(w)
      if (en === undefined) { fini = false; continue }
      if (en !== null) continue
      const p = await local.prefs(w)
      if (!vide(p) && (await ecrireJSON(`/api/courrier/reglages/${w}`, 'PUT', p)) === 'panne') fini = false
    }
    return fini
  }

  /** Un fichier reçu (mémoire, puis le Worker) ; null s'il ne vient pas. */
  async function recevoir(cle: string): Promise<Blob | null> {
    const deja = recus.get(cle)
    if (deja) return deja
    const b = await appel(`/api/courrier/fichiers/${cle}`, {}, async r => (r.ok ? r.blob() : null), delai * 3)
    if (!b) return null
    recus.set(cle, b)
    connus.set(b, cle)
    return b
  }

  return {
    async lettres() {
      let liste = await lireListe()
      const locales = await local.lettres()
      const brouillons = locales.filter(l => l.etat === 'brouillon')
      if (!liste) {
        hors = true
        for (const l of brouillons) noter(l.id, l.version)
        return brouillons
      }
      hors = false
      if (!marque.getItem(MARQUE) && (await migrer(liste, locales))) {
        try { marque.setItem(MARQUE, '1') } catch { /* on recommencera */ }
        liste = (await lireListe()) ?? liste
      }
      const enLigne = new Map(liste.map(x => [x.id, x]))
      const res = liste.map(versLettre)
      for (const b of brouillons) {
        const x = enLigne.get(b.id)
        if (!x) res.push(b)
        else if (x.etat !== 'brouillon') void local.jeterLettre(b.id)
        else if ((b.version ?? 0) > x.version) res[res.findIndex(y => y.id === b.id)] = b
      }
      for (const l of res) noter(l.id, l.version)
      return res
    },

    async garderLettre(l, opt = {}) {
      if (l.aCharger && l.etat === 'brouillon') return false
      const version = Math.max(versions.get(l.id) ?? 0, l.version ?? 0) + 1
      const x = { ...l, version }
      if (l.etat === 'brouillon') {
        const ici = await local.garderLettre(x)
        if (ici) noter(l.id, version)
        if (opt.ici) return ici
        const loin = (await pousser(x)) === 'ok'
        if (loin) noter(l.id, version)
        return ici || loin
      }
      if ((await pousser(x)) !== 'ok') return false
      noter(l.id, version)
      // La copie de l'appareil (un ancien brouillon) n'a plus lieu d'être
      void local.jeterLettre(l.id)
      return true
    },

    async jeterLettre(id) {
      const fait = (await ecrire(`/api/courrier/lettres/${id}/jeter`, { method: 'POST' })) === 'ok'
      if (fait) void local.jeterLettre(id)
      return fait
    },

    async completer(l) {
      if (!l.aCharger) return l
      let manque = false
      let peinture: Blob | null = null
      if (l.peintureCle) {
        peinture = await recevoir(l.peintureCle)
        if (!peinture) manque = true
      }
      const objets = await Promise.all(l.objets.map(async (ob): Promise<Objet> => {
        if (ob.k !== 'voix' || !ob.cle) return ob
        const audio = await recevoir(ob.cle)
        if (!audio) { manque = true; return ob }
        return { ...ob, audio } satisfies Vocal
      }))
      // Un brouillon sans son dessin : la sauvegarde suivante l'effacerait
      if (manque && l.etat === 'brouillon') return null
      const x: Lettre = { ...l, peinture, objets }
      delete x.aCharger
      return x
    },

    horsLigne: () => hors,

    async prefs(w) {
      const en = await lireReglages(w)
      if (en === undefined) return local.prefs(w)
      return en ? { envois: en.envois, env: en.env && { ...en.env }, faits: [...en.faits] } : { envois: 0, env: null, faits: [] }
    },

    async garderPrefs(w, p) {
      const [loin] = await Promise.all([ecrireJSON(`/api/courrier/reglages/${w}`, 'PUT', p), local.garderPrefs(w, p)])
      return loin === 'ok'
    }
  }
}
