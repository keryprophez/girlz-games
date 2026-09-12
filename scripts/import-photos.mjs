/* Importe de VRAIES photos libres de droit pour les jeux d'images (l'Intrus,
   la Chasse aux lettres, le Marché, Simon…).

   Source : Openverse (l'agrégateur de Creative Commons), filtré sur les seules
   licences SANS obligation : CC0 et domaine public. Aucune clé d'API.

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
const PER_TERM = 6

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
  ['pineapple', 'ananas', 'Ananas', 'pineapple fruit', 'Pineapple'],
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
  ['croissant', 'croissant', 'Croissant (viennoiserie)', 'croissant', 'Croissant']
]

const api = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error(`${r.status} sur ${url}`)
  return r.json()
}

/** Les propositions d'un mot : l'image de tête de l'article Wikipédia
    français (choisie par des humains pour REPRÉSENTER le sujet), puis les
    meilleures images de Commons, puis Openverse. Licences libres uniquement. */
const OK_LICENCE = /^(cc0|cc by|cc by-sa|public domain|pd|no restrictions|copyrighted free use)/i

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

async function fromCommons(q, n) {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*`
    + `&generator=search&gsrnamespace=6&gsrlimit=${n}&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}`
  const d = await api(u)
  const names = Object.values(d.query?.pages || {}).map(p => p.title.replace(/^File:/, ''))
  return names.length ? commonsMeta(names) : []
}

async function fromOpenverse(q, n) {
  const u = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}`
    + `&license=cc0,pdm&category=photograph&size=medium&page_size=${n}`
  const d = await api(u)
  return (d.results || []).map(it => ({
    thumbnail: it.thumbnail || it.url, url: it.url, title: it.title,
    creator: it.creator, license: it.license, license_version: it.license_version,
    foreign_landing_url: it.foreign_landing_url
  }))
}

async function candidats() {
  await rm(CAND_DIR, { recursive: true, force: true })
  await mkdir(CAND_DIR, { recursive: true })
  const index = {}
  for (const [id, fr, wiki, q, en] of TERMS) {
    const found = []
    const seen = new Set()
    const push = arr => { for (const it of arr) { if (found.length < PER_TERM && !seen.has(it.url)) { seen.add(it.url); found.push(it) } } }
    for (const src of [
      () => fromWikipedia(en, 'en'),   // l'anglais a les photos les plus « catalogue »
      () => fromWikipedia(wiki, 'fr'),
      () => fromCommonsTitle(q.split(' ')[0], 4),
      () => fromCommons(q, 4),
      () => fromOpenverse(q, 3)
    ]) {
      if (found.length >= PER_TERM) break
      try { push(await src()) } catch (e) { console.error(`  (${id}) ${e.message}`) }
    }
    index[id] = { fr, wiki, en, q, items: [] }
    await Promise.all(found.map(async (it, i) => {
      try {
        const r = await fetch(it.thumbnail, { headers: { 'User-Agent': UA } })
        if (!r.ok) return
        const buf = Buffer.from(await r.arrayBuffer())
        const file = path.join(CAND_DIR, `${id}-${i}.jpg`)
        await writeFile(file, buf)
        index[id].items[i] = {
          file, title: it.title, creator: it.creator, license: it.license,
          license_version: it.license_version, source: it.foreign_landing_url, url: it.url
        }
      } catch { /* candidat perdu, tant pis */ }
    }))
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
  const credits = {}
  for (const [id, choice] of Object.entries(picks)) {
    const entry = index[id]
    const it = entry?.items?.[choice]
    if (!it) { console.error(`✗ ${id} : proposition ${choice} introuvable`); continue }
    const buf = await readFile(it.file)
    await writeFile(path.join(OUT_DIR, `${id}.jpg`), buf)
    credits[id] = {
      fr: entry.fr, titre: it.title, auteur: it.creator,
      licence: `${it.license.toUpperCase()}${it.license_version ? ' ' + it.license_version : ''}`,
      source: it.source
    }
    console.log(`✓ ${id} ← ${it.title} (${it.creator || 'auteur inconnu'})`)
  }
  await writeFile(path.join(OUT_DIR, 'CREDITS.json'), JSON.stringify(credits, null, 2))
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
  try { push(await fromCommonsTitle(q.split(' ')[0], 6)) } catch { /* rien */ }
  try { push(await fromOpenverse(q, 6)) } catch { /* rien */ }
  try { push(await fromWikipedia(en, 'en')) } catch { /* rien */ }
  void fr; void wiki
  const index = JSON.parse(await readFile(path.join(CAND_DIR, 'index.json'), 'utf8'))
  index[id].items = []
  await Promise.all(found.slice(0, 10).map(async (it, i) => {
    try {
      const r = await fetch(it.thumbnail, { headers: { 'User-Agent': UA } })
      if (!r.ok) return
      const file = path.join(CAND_DIR, `${id}-${i}.jpg`)
      await writeFile(file, Buffer.from(await r.arrayBuffer()))
      index[id].items[i] = { file, title: it.title, creator: it.creator, license: it.license,
        license_version: it.license_version, source: it.foreign_landing_url, url: it.url }
    } catch { /* rien */ }
  }))
  await writeFile(path.join(CAND_DIR, 'index.json'), JSON.stringify(index, null, 2))
  await writeFile(path.join(CAND_DIR, `un-${id}.html`), `<!doctype html><meta charset="utf-8">
    <style>body{background:#FFF9F0;margin:0;padding:10px;display:flex;gap:8px;flex-wrap:wrap}
    figure{margin:0;position:relative}img{width:150px;height:150px;object-fit:cover;border-radius:14px;display:block}
    figcaption{position:absolute;left:5px;top:5px;background:#000a;color:#fff;border-radius:6px;padding:0 6px;font:14px system-ui}</style>
    ${index[id].items.map((it, i) => it ? `<figure><img src="${path.basename(it.file)}"><figcaption>${i}</figcaption></figure>` : '').join('')}`)
  console.log(`${index[id].items.filter(Boolean).length} propositions → ${CAND_DIR}/un-${id}.html`)
}

const cmd = process.argv[2]
if (cmd === 'candidats') await candidats()
else if (cmd === 'un') await unMot(process.argv[3])
else if (cmd === 'garder') await garder()
else {
  console.log('Usage : node scripts/import-photos.mjs candidats | garder')
  if (!existsSync(CAND_DIR)) console.log('(commence par « candidats »)')
}
