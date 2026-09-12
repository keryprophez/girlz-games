/* Importe de VRAIES photos libres de droit pour les jeux d'images (l'Intrus,
   la Chasse aux lettres, le Marché, Simon…).

   Sources, choisies selon la NATURE du mot :
     • Vivant (animaux, fruits, légumes) → **iNaturalist**. Des photos de
       naturalistes, identifiées par l'espèce : on demande un zèbre, on a un
       zèbre. C'est la source la plus fiable et la plus homogène qui existe
       sans clé d'API.
     • Fruits, légumes, plats et objets → la **catégorie Commons** du sujet
       (« Category:Carrots »), rangée à la main par des contributeurs. La
       recherche plein texte d'Openverse, elle, répond « champ de coquelicots »
       pour « orange » et « gens dans un festival » pour « oignon ».
     • Openverse en complément quand la catégorie est maigre.
     • En secours : Wikidata P18 (l'image « officielle » du concept), l'image
       de tête de l'article Wikipédia, puis Commons sur le titre du fichier.
       Attention : les API Wikimedia comptent par adresse IP et bloquent net
       quand on sort par un proxy partagé — d'où leur place en dernier.
   Licences : l'appli est privée, familiale et sans usage commercial. On accepte
   donc aussi les CC BY-NC / ND, qu'on crédite comme les autres ; on refuse
   seulement ce qui n'a AUCUNE licence identifiable. Aucune clé d'API nulle part.

   Deux temps, parce qu'une recherche automatique se trompe souvent de sujet :

     node scripts/import-photos.mjs candidats   → télécharge 6 propositions par
       mot dans .photos-candidats/ et fabrique une planche-contact HTML
     node scripts/import-photos.mjs garder      → lit photos.picks.json
       ({ "vache": 2 }) et installe le choix dans public/assets/photos/,
       avec les crédits dans public/assets/photos/CREDITS.json

   Les photos retenues sont commitées ; les candidats, non (voir .gitignore). */
import { mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const UA = 'LaFermeMagique/1.0 (jeu educatif familial; contact via github.com/keryprophez/girlz-games)'
const CAND_DIR = '.photos-candidats'
const OUT_DIR = 'public/assets/photos'
const PER_TERM = 5

/* Le vocabulaire des jeux : identifiant interne, mot français (pour la voix et
   les crédits), requête anglaise (Openverse indexe surtout en anglais). */
export const TERMS = [
  // id, mot français, article Wikipédia (fr), requête Commons (en), article Wikipédia (en)
  // --- Animaux de la ferme ---
  ['cow', 'vache', 'Vache', 'cow cattle', 'Cattle'],
  ['pig', 'cochon', 'Cochon', 'domestic pig', 'Pig'],
  ['chicken', 'poule', 'Poule', 'hen chicken', 'Chicken'],
  ['chick', 'poussin', 'Poussin (oiseau)', 'chick baby chicken', 'Chick'],
  ['duck', 'canard', 'Canard domestique', 'domestic duck', 'Domestic duck'],
  ['horse', 'cheval', 'Cheval', 'horse', 'Horse'],
  ['goat', 'chèvre', 'Chèvre domestique', 'domestic goat', 'Goat'],
  ['sheep', 'mouton', 'Mouton', 'sheep', 'Sheep'],
  ['rabbit', 'lapin', 'Lapin domestique', 'rabbit bunny', 'European rabbit'],
  ['dog', 'chien', 'Chien', 'dog', 'Dog'],
  ['cat', 'chat', 'Chat', 'cat', 'Cat'],
  ['mouse', 'souris', 'Souris domestique', 'house mouse', 'House mouse'],
  // --- Animaux sauvages ---
  ['elephant', 'éléphant', "Éléphant d'Afrique", 'african elephant'],
  ['giraffe', 'girafe', 'Girafe', 'giraffe', 'Giraffe'],
  ['lion', 'lion', 'Lion', 'lion', 'Lion'],
  ['monkey', 'singe', 'Macaque rhésus', 'monkey macaque', 'Rhesus macaque'],
  ['bear', 'ours', 'Ours brun', 'brown bear', 'Brown bear'],
  ['zebra', 'zèbre', 'Zèbre de Grant', 'zebra', 'Plains zebra'],
  ['fox', 'renard', 'Renard roux', 'red fox', 'Red fox'],
  ['deer', 'cerf', 'Cerf élaphe', 'red deer', 'Red deer'],
  ['hedgehog', 'hérisson', "Hérisson d'Europe", 'european hedgehog'],
  ['frog', 'grenouille', 'Grenouille verte', 'frog', 'Common frog'],
  ['snake', 'serpent', 'Serpent', 'snake', 'Snake'],
  ['owl', 'hibou', 'Grand-duc d\'Europe', 'eagle owl'],
  ['parrot', 'perroquet', 'Ara bleu', 'blue macaw parrot', 'Blue-and-yellow macaw'],
  ['penguin', 'pingouin', 'Manchot empereur', 'emperor penguin', 'Emperor penguin'],
  ['whale', 'baleine', 'Baleine à bosse', 'humpback whale', 'Humpback whale'],
  ['fish', 'poisson', 'Poisson rouge', 'goldfish', 'Goldfish'],
  ['turtle', 'tortue', 'Tortue terrestre', 'tortoise', 'Tortoise'],
  ['butterfly', 'papillon', 'Machaon', 'swallowtail butterfly', 'Papilio machaon'],
  // --- Fruits ---
  ['apple', 'pomme', 'Pomme', 'apple fruit', 'Apple'],
  ['banana', 'banane', 'Banane', 'banana fruit', 'Banana'],
  ['strawberry', 'fraise', 'Fraise', 'strawberry fruit', 'Strawberry'],
  ['grapes', 'raisin', 'Raisin', 'grapes', 'Table grape'],
  ['cherries', 'cerises', 'Cerise', 'cherries fruit', 'Cherry'],
  ['orange', 'orange', 'Orange (fruit)', 'orange', 'Orange (fruit)'],
  ['pear', 'poire', 'Poire', 'pear fruit', 'Pear'],
  ['lemon', 'citron', 'Citron', 'lemon fruit', 'Lemon'],
  ['pineapple', 'ananas', 'Ananas', 'whole pineapple fruit ripe', 'Pineapple'],
  ['watermelon', 'pastèque', 'Pastèque', 'watermelon fruit', 'Watermelon'],
  ['peach', 'pêche', 'Pêche (fruit)', 'peach fruit', 'Peach'],
  ['plum', 'prune', 'Prune', 'plum fruit', 'Plum'],
  // --- Légumes ---
  ['carrot', 'carotte', 'Carotte', 'carrot vegetable', 'Carrot'],
  ['tomato', 'tomate', 'Tomate', 'tomato', 'Tomato'],
  ['broccoli', 'brocoli', 'Brocoli', 'broccoli', 'Broccoli'],
  ['corn', 'maïs', 'Maïs', 'corn cob maize', 'Maize'],
  ['eggplant', 'aubergine', 'Aubergine', 'eggplant', 'Eggplant'],
  ['onion', 'oignon', 'Oignon', 'onion', 'Onion'],
  ['cabbage', 'chou', 'Chou pommé', 'cabbage', 'Cabbage'],
  ['pumpkin', 'citrouille', 'Citrouille', 'pumpkin', 'Pumpkin'],
  ['radish', 'radis', 'Radis', 'radish', 'Radish'],
  ['potato', 'pomme de terre', 'Pomme de terre', 'potato', 'Potato'],
  ['cucumber', 'concombre', 'Concombre', 'cucumber', 'Cucumber'],
  ['pepper', 'poivron', 'Poivron', 'bell pepper', 'Bell pepper'],
  ['mushroom', 'champignon', 'Champignon de Paris', 'mushroom', 'Edible mushroom'],
  ['salad', 'salade', 'Laitue', 'lettuce', 'Lettuce'],
  // --- À manger ---
  ['bread', 'pain', 'Pain', 'bread loaf', 'Bread'],
  ['cheese', 'fromage', 'Fromage', 'cheese', 'Cheese'],
  ['cake', 'gâteau', 'Gâteau', 'cake', 'Birthday cake'],
  ['cookie', 'biscuit', 'Cookie', 'cookie biscuit', 'Cookie'],
  ['egg', 'œuf', "Œuf (cuisine)", 'chicken egg'],
  ['milk', 'lait', 'Lait', 'glass of milk', 'Milk'],
  ['honey', 'miel', 'Miel', 'honey jar', 'Honey'],
  ['croissant', 'croissant', 'Croissant (viennoiserie)', 'croissant', 'Croissant'],
  ['baguette', 'baguette', 'Baguette (pain)', 'baguette bread', 'Baguette'],
  ['muffin', 'muffin', 'Muffin', 'muffin', 'Muffin'],
  // --- Objets de la cuisine (le Marché, l'Intrus) ---
  ['plate', 'assiette', 'Assiette', 'dinner plate', 'Plate (dishware)'],
  ['cup', 'tasse', 'Tasse', 'teacup saucer', 'Teacup'],
  ['pot', 'casserole', 'Casserole (ustensile)', 'cooking pot', 'Cookware and bakeware'],
  ['spoon', 'cuillère', 'Cuillère', 'spoon', 'Spoon'],
  ['glass', 'verre', 'Verre (récipient)', 'glass of water', 'Glass (drinkware)']
]

/* iNaturalist cherche par TAXON : le nom latin ne laisse aucune place au
   doute (« bear » ramène des peluches, « Ursus arctos » ramène un ours).
   Réservé aux ANIMAUX : pour un fruit ou un légume, iNaturalist montre la
   plante entière alors qu'on veut le fruit sur une table — là, Openverse. */
/** Pour ce qui ne bouge pas, la CATÉGORIE Commons du sujet : un classement
    fait par des humains, autrement plus fiable qu'une recherche de mots. */
const CATEG = {
  apple: 'Apples', banana: 'Bananas', strawberry: 'Strawberries', grapes: 'Grapes',
  cherries: 'Cherries', orange: 'Orange (fruit)', pear: 'Pears', lemon: 'Lemons',
  pineapple: 'Sliced pineapples', watermelon: 'Watermelons', peach: 'Peaches', plum: 'Plums',
  carrot: 'Carrots', tomato: 'Tomatoes', broccoli: 'Broccoli', corn: 'Corn on the cob',
  eggplant: 'Aubergines', onion: 'Onions', cabbage: 'Cabbages', pumpkin: 'Pumpkins',
  radish: 'Radishes', potato: 'Potatoes', cucumber: 'Cucumbers', pepper: 'Bell peppers',
  mushroom: 'Agaricus bisporus', salad: 'Lettuce',
  bear: 'Brown bears', lion: 'Lions',
  bread: 'Bread', cheese: 'Cheeses', cake: 'Cakes', cookie: 'Cookies',
  egg: 'Chicken eggs', milk: 'Glasses of milk', honey: 'Honey',
  croissant: 'Croissants', baguette: 'Baguettes', muffin: 'Muffins',
  plate: 'Plates (dishes)', cup: 'Teacups', pot: 'Cooking pots', spoon: 'Spoons',
  glass: 'Glasses of water'
}

const VIVANT = {
  cow: 'Bos taurus', pig: 'Sus domesticus', chicken: 'Gallus gallus domesticus',
  duck: 'Anas platyrhynchos', horse: 'Equus caballus', goat: 'Capra hircus',
  sheep: 'Ovis aries', rabbit: 'Oryctolagus cuniculus', dog: 'Canis familiaris',
  cat: 'Felis catus', mouse: 'Mus musculus',
  elephant: 'Loxodonta africana', giraffe: 'Giraffa camelopardalis', lion: 'Panthera leo',
  monkey: 'Macaca mulatta', bear: 'Ursus arctos', zebra: 'Equus quagga',
  fox: 'Vulpes vulpes', deer: 'Cervus elaphus', hedgehog: 'Erinaceus europaeus',
  frog: 'Rana temporaria', snake: 'Natrix natrix', owl: 'Bubo bubo',
  parrot: 'Ara ararauna', penguin: 'Aptenodytes forsteri', whale: 'Megaptera novaeangliae',
  fish: 'Carassius auratus', turtle: 'Testudo hermanni', butterfly: 'Papilio machaon'
}

/* ---------- Le style unique ----------
   Des photos venues de dix sources n'ont ni le même format ni le même poids.
   On les passe TOUTES dans le même moule : carré centré, 512 px, JPEG 86 %.
   Pas de dépendance à installer — Chromium est déjà là pour les tests. */
const CARRE = 512
async function carre(bufs) {
  const { chromium } = await import('playwright-core')
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' })
  const page = await (await b.newContext()).newPage()
  const out = {}
  for (const [id, buf] of Object.entries(bufs)) {
    out[id] = await page.evaluate(async ([b64, size]) => {
      const img = new Image()
      img.src = 'data:image/jpeg;base64,' + b64
      await img.decode()
      const c = document.createElement('canvas')
      c.width = c.height = size
      const g = c.getContext('2d')
      g.fillStyle = '#fff'; g.fillRect(0, 0, size, size)
      // Recadrage « cover » centré : le sujet est presque toujours au milieu
      const s = Math.min(img.naturalWidth, img.naturalHeight)
      g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size)
      return c.toDataURL('image/jpeg', 0.86).split(',')[1]
    }, [buf.toString('base64'), CARRE])
  }
  await b.close()
  return out
}

/* Les API Wikimedia répondent « You are making too many requests » (en texte,
   pas en JSON) dès qu'on enchaîne : on étale, et on réessaie une fois. */
const wait = ms => new Promise(r => setTimeout(r, ms))

/* Les API de Wikimedia comptent les requêtes PAR ADRESSE IP, et on sort ici
   par un proxy partagé : au-delà d'une poignée de requêtes par seconde, tout
   répond 429 pendant plusieurs minutes. D'où deux files séparées — les appels
   d'API au compte-gouttes, les téléchargements d'images (upload.wikimedia.org,
   bien plus permissif) à un rythme normal — et un recul qui va jusqu'à deux
   minutes au lieu d'insister. La collecte complète prend une demi-heure : elle
   ne se lance qu'à la main, les photos retenues sont commitées. */
const ESPACE = { wiki: 2500, inat: 1100, ov: 800, img: 300 }
const RECUL = [20000, 45000, 90000, 120000]
const files = { wiki: Promise.resolve(), inat: Promise.resolve(), ov: Promise.resolve(), img: Promise.resolve() }
/** Chaque hôte a son propre compteur : inutile de faire attendre iNaturalist
    parce que Commons boude. */
const voieDe = (url) => url.includes('inaturalist') ? 'inat' : url.includes('openverse') ? 'ov' : 'wiki'

const through = (voie, espace, url, tag) => {
  const run = async () => {
    for (let essai = 0; essai <= RECUL.length; essai++) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA } })
        if (r.status !== 429 && r.status < 500) return r
        if (essai === RECUL.length) return r
        process.stdout.write(`  (${tag}) ${r.status}, on attend ${RECUL[essai] / 1000}s…\n`)
        await wait(RECUL[essai])
      } catch (e) {
        if (essai === RECUL.length) throw e
        await wait(RECUL[essai])
      }
    }
    throw new Error(`injoignable : ${url.slice(0, 70)}…`)
  }
  files[voie] = files[voie].then(() => wait(espace))
  return files[voie].then(run)
}

const file = (url) => through('img', ESPACE.img, url, 'image')
const api = async (url) => {
  const v = voieDe(url)
  const r = await through(v, ESPACE[v], url, new URL(url).hostname.split('.')[0])
  const txt = await r.text()
  if (!r.ok || !txt.trim().startsWith('{')) throw new Error(`${r.status} sur ${url.slice(0, 70)}…`)
  return JSON.parse(txt)
}

/** Les propositions d'un mot : l'image de tête de l'article Wikipédia
    français (choisie par des humains pour REPRÉSENTER le sujet), puis les
    meilleures images de Commons, puis Openverse. Licences libres uniquement. */
const OK_LICENCE = /(cc0|cc by|cc-by|public domain|pdm|^pd|no restrictions|copyrighted free use|attribution)/i

/** Wikidata P18 : l'image « officielle » du concept, cherchée par son nom
    FRANÇAIS. C'est ce qui donne une poule quand on demande une poule. */
async function fromWikidata(fr) {
  if (!fr) return []
  const s = await api(`https://www.wikidata.org/w/api.php?action=wbsearchentities`
    + `&search=${encodeURIComponent(fr)}&language=fr&uselang=fr&format=json&limit=1&origin=*`)
  const qid = s.search?.[0]?.id
  if (!qid) return []
  const c = await api(`https://www.wikidata.org/w/api.php?action=wbgetclaims`
    + `&entity=${qid}&property=P18&format=json&origin=*`)
  const names = (c.claims?.P18 || []).slice(0, 3)
    .map(x => x.mainsnak?.datavalue?.value).filter(Boolean)
  return names.length ? commonsMeta(names) : []
}

async function fromWikipedia(wiki, lang = 'fr') {
  if (!wiki) return []
  const u = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1`
    + `&prop=pageimages&piprop=thumbnail|name&pithumbsize=640&titles=${encodeURIComponent(wiki)}`
  const d = await api(u)
  const page = Object.values(d.query?.pages || {})[0]
  if (!page?.pageimage) return []
  const meta = await commonsMeta([page.pageimage])
  return meta.length ? meta : []
}

/** Métadonnées (licence, auteur, vignette) de fichiers Commons. */
async function commonsMeta(names) {
  const titles = names.map(n => 'File:' + n).join('|')
  const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*`
    + `&titles=${encodeURIComponent(titles)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640`
  const d = await api(u)
  return Object.values(d.query?.pages || {}).map(p => {
    const ii = p.imageinfo?.[0]
    if (!ii) return null
    const m = ii.extmetadata || {}
    const lic = (m.LicenseShortName?.value || '').replace(/<[^>]+>/g, '')
    if (!OK_LICENCE.test(lic)) return null
    return {
      thumbnail: ii.thumburl, url: ii.url, title: p.title.replace(/^File:/, ''),
      creator: (m.Artist?.value || '').replace(/<[^>]+>/g, '').trim().slice(0, 80) || 'inconnu',
      license: lic, license_version: '', foreign_landing_url: ii.descriptionurl
    }
  }).filter(Boolean)
}

/** Le mot à chercher dans un titre de fichier : le nom de l'article anglais
    (« Pineapple »), pas le premier mot de la requête — `q` commence souvent par
    un adjectif et on cherchait « intitle:whole ». */
const motTitre = (q, en) => (en || q || '').split(/[\s(]/)[0].toLowerCase()

/** Commons, mais en ne gardant que les fichiers dont le TITRE contient le mot :
    « intitle: » évite les photos où le mot n'apparaît que dans la description
    (les pubs « The Bunch of Grapes », le masque à gaz pour « cabbage »…). */
async function fromCommonsTitle(word, n) {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*`
    + `&generator=search&gsrnamespace=6&gsrlimit=${n}`
    + `&gsrsearch=${encodeURIComponent(`intitle:${word} filetype:bitmap`)}`
  const d = await api(u)
  const names = Object.values(d.query?.pages || {}).map(p => p.title.replace(/^File:/, ''))
  return names.length ? commonsMeta(names) : []
}

/** Les images d'une catégorie Commons. On écarte les sons, les schémas et les
    SVG : on ne veut que des photographies. */
async function fromCommonsCat(cat, n) {
  if (!cat) return []
  const d = await api(`https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*`
    + `&list=categorymembers&cmtype=file&cmlimit=40&cmtitle=${encodeURIComponent('Category:' + cat)}`)
  const noms = (d.query?.categorymembers || [])
    .map(m => m.title.replace(/^File:/, ''))
    .filter(t => /\.(jpe?g|png)$/i.test(t) && !/diagram|chart|map|logo|icon/i.test(t))
    .slice(0, n * 2)
  if (!noms.length) return []
  // commonsMeta prend jusqu'à 50 titres d'un coup : une seule requête de plus
  return (await commonsMeta(noms)).slice(0, n)
}

async function fromCommons(q, n) {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*`
    + `&generator=search&gsrnamespace=6&gsrlimit=${n}&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}`
  const d = await api(u)
  const names = Object.values(d.query?.pages || {}).map(p => p.title.replace(/^File:/, ''))
  return names.length ? commonsMeta(names) : []
}

/** iNaturalist : on cherche le TAXON, puis on prend ses photos. Un taxon a
    souvent une dizaine de photos validées par la communauté — c'est le plus
    gros stock d'images fiables et homogènes accessible sans clé. */
async function fromINat(q, n) {
  if (!q) return []
  const d = await api(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(q)}&per_page=1`)
  const t0 = d.results?.[0]
  if (!t0) return []
  // La liste ne renvoie qu'une photo ; c'est la fiche du taxon qui en a douze.
  const det = await api(`https://api.inaturalist.org/v1/taxa/${t0.id}`)
  const t = det.results?.[0] || t0
  const photos = (t.taxon_photos || []).map(tp => tp.photo).filter(Boolean)
  if (t.default_photo) photos.unshift(t.default_photo)
  const moyen = ph => ph.medium_url || (ph.url || '').replace(/square\.(jpe?g|png)/i, 'medium.$1')
  const vues = new Set()
  return photos.filter(ph => ph && moyen(ph) && !vues.has(ph.id) && vues.add(ph.id)).slice(0, n).map(ph => ({
    thumbnail: moyen(ph), url: moyen(ph),
    title: `${t.preferred_common_name || t.name} (${t.name})`,
    creator: (ph.attribution || '').replace(/\s*\(c\)\s*/i, '').split(',')[0].slice(0, 80) || 'iNaturalist',
    license: (ph.license_code || 'cc-by-nc').toUpperCase(), license_version: '',
    foreign_landing_url: `https://www.inaturalist.org/photos/${ph.id}`
  }))
}

async function fromOpenverse(q, n) {
  const u = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}`
    + `&license=cc0,pdm,by,by-sa,by-nc,by-nc-sa&category=photograph&size=medium&page_size=${n}`
  const d = await api(u)
  return (d.results || []).map(it => ({
    thumbnail: it.thumbnail || it.url, url: it.url, title: it.title,
    creator: it.creator, license: it.license, license_version: it.license_version,
    foreign_landing_url: it.foreign_landing_url
  }))
}

async function candidats(seulement) {
  const liste = seulement ? seulement.split(',') : null
  if (!liste) await rm(CAND_DIR, { recursive: true, force: true })
  await mkdir(CAND_DIR, { recursive: true })
  const index = liste && existsSync(path.join(CAND_DIR, 'index.json'))
    ? JSON.parse(await readFile(path.join(CAND_DIR, 'index.json'), 'utf8')) : {}
  for (const [id, fr, wiki, q, en] of TERMS) {
    if (liste && !liste.includes(id)) continue
    const found = []
    const seen = new Set()
    const push = arr => { for (const it of arr) { if (found.length < PER_TERM && !seen.has(it.url)) { seen.add(it.url); found.push(it) } } }
    const vivant = VIVANT[id]
    const categ = CATEG[id]
    for (const src of vivant ? [
      () => fromINat(vivant, PER_TERM),   // le vivant : iNaturalist d'abord
      () => fromOpenverse(q, 4),
      () => fromWikidata(fr),
      () => fromWikipedia(en, 'en'),
      () => fromCommonsTitle(motTitre(q, en), 4)
    ] : [
      () => fromCommonsCat(categ, PER_TERM),   // le reste : la catégorie Commons
      () => fromWikidata(fr),
      () => fromWikipedia(en, 'en'),
      () => fromCommonsTitle(motTitre(q, en), 4),
      () => fromOpenverse(q, 4),
      () => fromCommons(q, 4)
    ]) {
      if (found.length >= PER_TERM) break
      try { push(await src()) } catch (e) { console.error(`  (${id}) ${e.message}`) }
    }
    index[id] = { fr, wiki, en, q, items: [] }
    for (const [i, it] of found.entries()) {
      try {
        const r = await file(it.thumbnail)
        if (!r.ok) continue
        const buf = Buffer.from(await r.arrayBuffer())
        const dest = path.join(CAND_DIR, `${id}-${i}.jpg`)
        await writeFile(dest, buf)
        index[id].items[i] = {
          file: dest, title: it.title, creator: it.creator, license: it.license,
          license_version: it.license_version, source: it.foreign_landing_url, url: it.url
        }
      } catch (e) { console.error(`  (${id}) image ${i} : ${e.message}`) }
    }
    console.log(`… ${id} (${fr}) : ${index[id].items.filter(Boolean).length} propositions`)
  }
  await writeFile(path.join(CAND_DIR, 'index.json'), JSON.stringify(index, null, 2))
  const rows = Object.entries(index).map(([id, e]) => `
    <div class="row"><div class="lab">${e.fr}<i>${id}</i></div>
      ${e.items.map((it, i) => it ? `<figure><img src="${path.basename(it.file)}"><figcaption>${i}</figcaption></figure>` : '').join('')}
    </div>`).join('')
  await writeFile(path.join(CAND_DIR, 'planche.html'), `<!doctype html><meta charset="utf-8">
    <style>body{font-family:system-ui;background:#FFF9F0;margin:0;padding:12px}
    .row{display:flex;align-items:center;gap:8px;margin-bottom:8px}
    .lab{width:120px;font-weight:700;font-size:14px}.lab i{display:block;color:#888;font-style:normal;font-size:11px}
    figure{margin:0;position:relative}img{width:104px;height:104px;object-fit:cover;border-radius:12px;display:block}
    figcaption{position:absolute;left:4px;top:4px;background:#000a;color:#fff;border-radius:6px;padding:0 5px;font-size:12px}
    </style>${rows}`)
  console.log(`\nPlanche-contact : ${CAND_DIR}/planche.html`)
}

/** Installe les choix de photos.picks.json dans public/assets/photos/. */
async function garder() {
  const index = JSON.parse(await readFile(path.join(CAND_DIR, 'index.json'), 'utf8'))
  const picks = JSON.parse(await readFile('photos.picks.json', 'utf8'))
  await mkdir(OUT_DIR, { recursive: true })
  // On complète les crédits existants : un mot absent des choix garde sa photo
  // (parfois la nouvelle proposition est MOINS bonne que celle déjà installée).
  const creditsFile = path.join(OUT_DIR, 'CREDITS.json')
  const credits = existsSync(creditsFile) ? JSON.parse(await readFile(creditsFile, 'utf8')) : {}
  const bruts = {}
  const infos = {}
  for (const [id, choice] of Object.entries(picks)) {
    const entry = index[id]
    const it = entry?.items?.[choice]
    if (!it) { console.error(`✗ ${id} : proposition ${choice} introuvable`); continue }
    bruts[id] = await readFile(it.file)
    infos[id] = [entry, it]
  }
  // Toutes au même moule avant d'atterrir dans le jeu
  const carrees = await carre(bruts)
  for (const [id, [entry, it]] of Object.entries(infos)) {
    await writeFile(path.join(OUT_DIR, `${id}.jpg`), Buffer.from(carrees[id], 'base64'))
    credits[id] = {
      fr: entry.fr, titre: it.title, auteur: it.creator,
      licence: `${it.license.toUpperCase()}${it.license_version ? ' ' + it.license_version : ''}`,
      source: it.source
    }
    console.log(`✓ ${id} ← ${it.title} (${it.creator || 'auteur inconnu'})`)
  }
  await writeFile(creditsFile, JSON.stringify(credits, null, 2))
  const files = (await readdir(OUT_DIR)).filter(f => f.endsWith('.jpg'))
  console.log(`\n${files.length} photos installées dans ${OUT_DIR}`)
}

/** Rattrapage d'UN mot : 8 propositions, planche dédiée. */
async function unMot(id) {
  const t = TERMS.find(t => t[0] === id)
  if (!t) return console.error('mot inconnu :', id)
  const [, fr, wiki, q, en] = t
  const found = []
  const seen = new Set()
  const push = arr => { for (const it of arr) if (!seen.has(it.url)) { seen.add(it.url); found.push(it) } }
  if (VIVANT[id]) { try { push(await fromINat(VIVANT[id], 8)) } catch { /* rien */ } }
  if (CATEG[id]) { try { push(await fromCommonsCat(CATEG[id], 10)) } catch { /* rien */ } }
  try { push(await fromWikidata(fr)) } catch { /* rien */ }
  try { push(await fromCommonsTitle(motTitre(q, en), 6)) } catch { /* rien */ }
  try { push(await fromOpenverse(q, 6)) } catch { /* rien */ }
  try { push(await fromWikipedia(en, 'en')) } catch { /* rien */ }
  void wiki
  const index = JSON.parse(await readFile(path.join(CAND_DIR, 'index.json'), 'utf8'))
  index[id].items = []
  for (const [i, it] of found.slice(0, 10).entries()) {
    try {
      const r = await file(it.thumbnail)
      if (!r.ok) continue
      const dest = path.join(CAND_DIR, `${id}-${i}.jpg`)
      await writeFile(dest, Buffer.from(await r.arrayBuffer()))
      index[id].items[i] = { file: dest, title: it.title, creator: it.creator, license: it.license,
        license_version: it.license_version, source: it.foreign_landing_url, url: it.url }
    } catch { /* rien */ }
  }
  await writeFile(path.join(CAND_DIR, 'index.json'), JSON.stringify(index, null, 2))
  await writeFile(path.join(CAND_DIR, `un-${id}.html`), `<!doctype html><meta charset="utf-8">
    <style>body{background:#FFF9F0;margin:0;padding:10px;display:flex;gap:8px;flex-wrap:wrap}
    figure{margin:0;position:relative}img{width:150px;height:150px;object-fit:cover;border-radius:14px;display:block}
    figcaption{position:absolute;left:5px;top:5px;background:#000a;color:#fff;border-radius:6px;padding:0 6px;font:14px system-ui}</style>
    ${index[id].items.map((it, i) => it ? `<figure><img src="${path.basename(it.file)}"><figcaption>${i}</figcaption></figure>` : '').join('')}`)
  console.log(`${index[id].items.filter(Boolean).length} propositions → ${CAND_DIR}/un-${id}.html`)
}

/** Repasse TOUTES les photos déjà installées au même moule. Les 31 premières
    ont été téléchargées telles quelles (600×293, 455×960…) : à l'écran,
    `object-fit: cover` coupait le sujet sans qu'on le voie. */
async function normaliser() {
  const noms = (await readdir(OUT_DIR)).filter(f => f.endsWith('.jpg'))
  const bruts = {}
  for (const n of noms) bruts[n.replace(/\.jpg$/, '')] = await readFile(path.join(OUT_DIR, n))
  const carrees = await carre(bruts)
  for (const [id, b64] of Object.entries(carrees)) {
    await writeFile(path.join(OUT_DIR, `${id}.jpg`), Buffer.from(b64, 'base64'))
  }
  console.log(`${noms.length} photos ramenées à ${CARRE}×${CARRE}`)
}

const cmd = process.argv[2]
if (cmd === 'candidats') await candidats(process.argv[3])
else if (cmd === 'normaliser') await normaliser()
else if (cmd === 'un') await unMot(process.argv[3])
else if (cmd === 'garder') await garder()
else {
  console.log('Usage : node scripts/import-photos.mjs candidats | un <id> | garder | normaliser')
  if (!existsSync(CAND_DIR)) console.log('(commence par « candidats »)')
}
