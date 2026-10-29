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
/** Un dossier par collecte (`CAND=…`) : deux collectes peuvent tourner côte à côte. */
const CAND_DIR = process.env.CAND || '.photos-candidats'
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
  // --- Animaux du Tour du Monde (22/09 : un animal par continent, en photo) ---
  ['panda', 'panda', 'Panda géant', 'giant panda', 'Giant panda'],
  ['kangaroo', 'kangourou', 'Kangourou roux', 'red kangaroo', 'Red kangaroo'],
  ['hippo', 'hippopotame', 'Hippopotame', 'hippopotamus', 'Hippopotamus'],
  ['bison', 'bison', "Bison d'Amérique", 'american bison', 'American bison'],
  ['sloth', 'paresseux', 'Paresseux à gorge brune', 'three-toed sloth', 'Brown-throated sloth'],
  ['moose', 'élan', 'Élan', 'moose', 'Moose'],
  ['koala', 'koala', 'Koala', 'koala', 'Koala'],
  ['tiger', 'tigre', 'Tigre', 'tiger', 'Tiger'],
  ['llama', 'lama', 'Lama', 'llama', 'Llama'],
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
  fish: 'Carassius auratus', turtle: 'Testudo hermanni', butterfly: 'Papilio machaon',
  panda: 'Ailuropoda melanoleuca', kangaroo: 'Osphranter rufus', hippo: 'Hippopotamus amphibius',
  bison: 'Bison bison', sloth: 'Bradypus variegatus', moose: 'Alces alces', koala: 'Phascolarctos cinereus',
  tiger: 'Panthera tigris', llama: 'Lama glama'
}

/* Le grand imagier (29/10, Joyce : « c'est toujours les mêmes mots ») :
   428 sujets à chercher, une ligne chacun — identifiant, mot français, article
   Wikipédia anglais (son image de tête est choisie par des humains pour
   REPRÉSENTER le sujet) et la source : `i:` le taxon iNaturalist, `c:` la
   catégorie Commons, `n:` une recherche à la NASA (domaine public). Le
   niveau d'orthographe, le thème et le défi de dessin de chaque mot sont
   dans `src/core/imagier.ts`. La collecte s'est arrêtée à 248 photos
   gardées (le père : « on peut s'arrêter à 200 photos ») : l'espace, la
   mer, les animaux, la nature, les fruits et les gourmandises sont faits ;
   la maison, l'école, les habits, les transports, la musique et les jeux
   attendent (`candidats <ids>`, puis leur ligne dans `imagier.ts`). */
const MORE = [
  // --- La ferme ---
  ['donkey', 'âne', 'Donkey', 'i:Equus asinus'],
  ['turkey', 'dindon', 'Domestic turkey', 'i:Meleagris gallopavo'],
  ['goose', 'oie', 'Domestic goose', 'c:Domestic geese'],
  ['pony', 'poney', 'Shetland pony', 'c:Shetland ponies'],
  ['hamster', 'hamster', 'Golden hamster', 'i:Mesocricetus auratus'],
  ['calf', 'veau', 'Calf', 'c:Calves (cattle)'],
  ['lamb', 'agneau', 'Lamb and mutton', 'c:Lambs'],
  ['bull', 'taureau', 'Bull', 'c:Bulls'],
  ['rooster', 'coq', 'Rooster', 'c:Roosters'],
  ['budgie', 'perruche', 'Budgerigar', 'i:Melopsittacus undulatus'],
  ['puppy', 'chiot', 'Puppy', 'c:Puppies'],
  ['kitten', 'chaton', 'Kitten', 'c:Kittens'],
  ['scarecrow', 'épouvantail', 'Scarecrow', 'c:Scarecrows'],
  // --- Les animaux du monde ---
  ['rhino', 'rhinocéros', 'White rhinoceros', 'i:Ceratotherium simum'],
  ['gorilla', 'gorille', 'Western gorilla', 'i:Gorilla gorilla'],
  ['chimp', 'chimpanzé', 'Chimpanzee', 'i:Pan troglodytes'],
  ['orangutan', 'orang-outan', 'Bornean orangutan', 'i:Pongo pygmaeus'],
  ['cheetah', 'guépard', 'Cheetah', 'i:Acinonyx jubatus'],
  ['leopard', 'léopard', 'Leopard', 'i:Panthera pardus'],
  ['jaguar', 'jaguar', 'Jaguar', 'i:Panthera onca'],
  ['wolf', 'loup', 'Wolf', 'i:Canis lupus'],
  ['polarbear', 'ours polaire', 'Polar bear', 'i:Ursus maritimus'],
  ['reindeer', 'renne', 'Reindeer', 'i:Rangifer tarandus'],
  ['camel', 'chameau', 'Bactrian camel', 'i:Camelus bactrianus'],
  ['dromedary', 'dromadaire', 'Dromedary', 'i:Camelus dromedarius'],
  ['crocodile', 'crocodile', 'Nile crocodile', 'i:Crocodylus niloticus'],
  ['chameleon', 'caméléon', 'Veiled chameleon', 'i:Chamaeleo calyptratus'],
  ['iguana', 'iguane', 'Green iguana', 'i:Iguana iguana'],
  ['lizard', 'lézard', 'Common wall lizard', 'i:Podarcis muralis'],
  ['beaver', 'castor', 'Eurasian beaver', 'i:Castor fiber'],
  ['squirrel', 'écureuil', 'Red squirrel', 'i:Sciurus vulgaris'],
  ['raccoon', 'raton laveur', 'Raccoon', 'i:Procyon lotor'],
  ['otter', 'loutre', 'Eurasian otter', 'i:Lutra lutra'],
  ['badger', 'blaireau', 'European badger', 'i:Meles meles'],
  ['boar', 'sanglier', 'Wild boar', 'i:Sus scrofa'],
  ['lynx', 'lynx', 'Eurasian lynx', 'i:Eurasian lynx'],
  ['meerkat', 'suricate', 'Meerkat', 'i:Suricata suricatta'],
  ['lemur', 'lémurien', 'Ring-tailed lemur', 'i:Lemur catta'],
  ['redpanda', 'panda roux', 'Red panda', 'i:Ailurus fulgens'],
  ['armadillo', 'tatou', 'Nine-banded armadillo', 'i:Dasypus novemcinctus'],
  ['anteater', 'fourmilier', 'Giant anteater', 'i:Myrmecophaga tridactyla'],
  ['platypus', 'ornithorynque', 'Platypus', 'i:Ornithorhynchus anatinus'],
  ['hyena', 'hyène', 'Spotted hyena', 'i:Crocuta crocuta'],
  ['gazelle', 'gazelle', 'Thomson\'s gazelle', 'i:Eudorcas thomsonii'],
  ['okapi', 'okapi', 'Okapi', 'i:Okapia johnstoni'],
  ['tapir', 'tapir', 'South American tapir', 'i:Tapirus terrestris'],
  ['hare', 'lièvre', 'European hare', 'i:Lepus europaeus'],
  ['mole', 'taupe', 'European mole', 'i:Talpa europaea'],
  ['bat', 'chauve-souris', 'Indian flying fox', 'i:Pteropus medius'],
  ['fennec', 'fennec', 'Fennec fox', 'i:Vulpes zerda'],
  ['porcupine', 'porc-épic', 'Crested porcupine', 'i:Hystrix cristata'],
  ['buffalo', 'buffle', 'African buffalo', 'i:Syncerus caffer'],
  ['warthog', 'phacochère', 'Common warthog', 'i:Phacochoerus africanus'],
  ['alpaca', 'alpaga', 'Alpaca', 'i:Vicugna pacos'],
  ['yak', 'yak', 'Domestic yak', 'i:Bos grunniens'],
  ['capybara', 'capybara', 'Capybara', 'i:Hydrochoerus hydrochaeris'],
  ['marmot', 'marmotte', 'Alpine marmot', 'i:Marmota marmota'],
  ['chamois', 'chamois', 'Chamois', 'i:Rupicapra rupicapra'],
  ['ibex', 'bouquetin', 'Alpine ibex', 'i:Capra ibex'],
  // --- Les oiseaux ---
  ['flamingo', 'flamant rose', 'Greater flamingo', 'i:Phoenicopterus roseus'],
  ['peacock', 'paon', 'Indian peafowl', 'i:Pavo cristatus'],
  ['toucan', 'toucan', 'Toco toucan', 'i:Ramphastos toco'],
  ['hummingbird', 'colibri', 'Anna\'s hummingbird', 'i:Calypte anna'],
  ['eagle', 'aigle', 'Golden eagle', 'i:Aquila chrysaetos'],
  ['swan', 'cygne', 'Mute swan', 'i:Cygnus olor'],
  ['pelican', 'pélican', 'Great white pelican', 'i:Pelecanus onocrotalus'],
  ['seagull', 'mouette', 'Black-headed gull', 'i:Chroicocephalus ridibundus'],
  ['robin', 'rouge-gorge', 'European robin', 'i:Erithacus rubecula'],
  ['bluetit', 'mésange', 'Eurasian blue tit', 'i:Cyanistes caeruleus'],
  ['magpie', 'pie', 'Eurasian magpie', 'i:Pica pica'],
  ['crow', 'corbeau', 'Common raven', 'i:Corvus corax'],
  ['sparrow', 'moineau', 'House sparrow', 'i:Passer domesticus'],
  ['pigeon', 'pigeon', 'Rock dove', 'i:Columba livia'],
  ['ostrich', 'autruche', 'Common ostrich', 'i:Struthio camelus'],
  ['stork', 'cigogne', 'White stork', 'i:Ciconia ciconia'],
  ['heron', 'héron', 'Grey heron', 'i:Ardea cinerea'],
  ['kingfisher', 'martin-pêcheur', 'Common kingfisher', 'i:Alcedo atthis'],
  ['puffin', 'macareux', 'Atlantic puffin', 'i:Fratercula arctica'],
  ['woodpecker', 'pic vert', 'European green woodpecker', 'i:Picus viridis'],
  ['swallow', 'hirondelle', 'Barn swallow', 'i:Hirundo rustica'],
  ['blackbird', 'merle', 'Common blackbird', 'i:Turdus merula'],
  ['vulture', 'vautour', 'Griffon vulture', 'i:Gyps fulvus'],
  ['falcon', 'faucon', 'Peregrine falcon', 'i:Falco peregrinus'],
  ['canary', 'canari', 'Domestic canary', 'c:Domestic canaries'],
  ['barnowl', 'chouette', 'Barn owl', 'i:Tyto alba'],
  ['jay', 'geai', 'Eurasian jay', 'i:Garrulus glandarius'],
  ['goldfinch', 'chardonneret', 'European goldfinch', 'i:Carduelis carduelis'],
  ['pheasant', 'faisan', 'Common pheasant', 'i:Phasianus colchicus'],
  ['cockatoo', 'cacatoès', 'Sulphur-crested cockatoo', 'i:Cacatua galerita'],
  // --- La mer ---
  ['dolphin', 'dauphin', 'Common bottlenose dolphin', 'i:Tursiops truncatus'],
  ['shark', 'requin', 'Great white shark', 'i:Carcharodon carcharias'],
  ['octopus', 'pieuvre', 'Common octopus', 'i:Octopus vulgaris'],
  ['jellyfish', 'méduse', 'Moon jellyfish', 'i:Aurelia aurita'],
  ['starfish', 'étoile de mer', 'Common starfish', 'i:Asterias rubens'],
  ['seahorse', 'hippocampe', 'Seahorse', 'i:Hippocampus kuda'],
  ['clownfish', 'poisson-clown', 'Ocellaris clownfish', 'i:Amphiprion ocellaris'],
  ['seaturtle', 'tortue de mer', 'Green sea turtle', 'i:Chelonia mydas'],
  ['crab', 'crabe', 'Grapsus grapsus', 'i:Grapsus grapsus'],
  ['lobster', 'homard', 'European lobster', 'i:Homarus gammarus'],
  ['shrimp', 'crevette', 'Lysmata amboinensis', 'i:Lysmata amboinensis'],
  ['seal', 'phoque', 'Harbor seal', 'i:Phoca vitulina'],
  ['sealion', 'otarie', 'California sea lion', 'i:Zalophus californianus'],
  ['walrus', 'morse', 'Walrus', 'i:Odobenus rosmarus'],
  ['orca', 'orque', 'Orca', 'i:Orcinus orca'],
  ['manta', 'raie', 'Giant oceanic manta ray', 'i:Mobula birostris'],
  ['urchin', 'oursin', 'Paracentrotus lividus', 'i:Paracentrotus lividus'],
  ['shell', 'coquillage', 'Seashell', 'c:Scallop shells'],
  ['coral', 'corail', 'Coral reef', 'c:Coral reefs'],
  ['anemone', 'anémone', 'Actinia equina', 'i:Actinia equina'],
  ['squid', 'calamar', 'Bigfin reef squid', 'i:Sepioteuthis lessoniana'],
  ['moray', 'murène', 'Mediterranean moray', 'i:Muraena helena'],
  ['hermitcrab', 'bernard-l\'ermite', 'Hermit crab', 'i:Pagurus bernhardus'],
  ['mussel', 'moule', 'Blue mussel', 'i:Mytilus edulis'],
  ['oyster', 'huître', 'Oyster', 'c:Oysters'],
  ['manatee', 'lamantin', 'West Indian manatee', 'i:Trichechus manatus'],
  ['sardine', 'sardine', 'Sardine', 'c:Sardines'],
  ['salmon', 'saumon', 'Atlantic salmon', 'i:Salmo salar'],
  ['beluga', 'béluga', 'Beluga whale', 'i:Delphinapterus leucas'],
  ['pufferfish', 'poisson-globe', 'Arothron hispidus', 'i:Arothron hispidus'],
  // --- Les petites bêtes ---
  ['ladybug', 'coccinelle', 'Coccinella septempunctata', 'i:Coccinella septempunctata'],
  ['bee', 'abeille', 'Western honey bee', 'i:Apis mellifera'],
  ['dragonfly', 'libellule', 'Emperor dragonfly', 'i:Anax imperator'],
  ['ant', 'fourmi', 'Formica rufa', 'i:Formica rufa'],
  ['snail', 'escargot', 'Cornu aspersum', 'i:Cornu aspersum'],
  ['spider', 'araignée', 'European garden spider', 'i:Araneus diadematus'],
  ['grasshopper', 'sauterelle', 'Great green bush-cricket', 'i:Tettigonia viridissima'],
  ['cricket', 'grillon', 'Gryllus campestris', 'i:Gryllus campestris'],
  ['beetle', 'scarabée', 'Cetonia aurata', 'i:Cetonia aurata'],
  ['caterpillar', 'chenille', 'Caterpillar', 'c:Caterpillars'],
  ['earthworm', 'ver de terre', 'Lumbricus terrestris', 'i:Lumbricus terrestris'],
  ['mantis', 'mante religieuse', 'Mantis religiosa', 'i:Mantis religiosa'],
  ['bumblebee', 'bourdon', 'Bombus terrestris', 'i:Bombus terrestris'],
  ['wasp', 'guêpe', 'Vespula vulgaris', 'i:Vespula vulgaris'],
  ['fly', 'mouche', 'Housefly', 'i:Musca domestica'],
  ['mosquito', 'moustique', 'Culex pipiens', 'i:Culex pipiens'],
  ['cicada', 'cigale', 'Lyristes plebejus', 'i:Lyristes plebejus'],
  ['slug', 'limace', 'Arion rufus', 'i:Arion rufus'],
  ['millipede', 'mille-pattes', 'Narceus americanus', 'i:Narceus americanus'],
  ['woodlouse', 'cloporte', 'Oniscus asellus', 'i:Oniscus asellus'],
  ['stickinsect', 'phasme', 'Carausius morosus', 'i:Carausius morosus'],
  ['scorpion', 'scorpion', 'Emperor scorpion', 'i:Pandinus imperator'],
  ['cockchafer', 'hanneton', 'Common cockchafer', 'i:Melolontha melolontha'],
  ['hornet', 'frelon', 'European hornet', 'i:Vespa crabro'],
  ['tadpole', 'têtard', 'Tadpole', 'c:Tadpoles'],
  ['monarch', 'monarque', 'Monarch butterfly', 'i:Danaus plexippus'],
  ['morpho', 'morpho', 'Morpho peleides', 'i:Morpho peleides'],
  ['peacockbutterfly', 'paon-du-jour', 'Aglais io', 'i:Aglais io'],
  ['spiderweb', 'toile d\'araignée', 'Spider web', 'c:Dew on spider webs'],
  // --- La nature ---
  ['rainbow', 'arc-en-ciel', 'Rainbow', 'c:Rainbows'],
  ['volcano', 'volcan', 'Volcano', 'c:Volcanic eruptions'],
  ['waterfall', 'cascade', 'Waterfall', 'c:Waterfalls'],
  ['aurora', 'aurore boréale', 'Aurora', 'c:Aurora borealis'],
  ['lightning', 'éclair', 'Lightning', 'c:Lightning'],
  ['mountain', 'montagne', 'Matterhorn', 'c:Matterhorn'],
  ['glacier', 'glacier', 'Glacier', 'c:Glaciers'],
  ['iceberg', 'iceberg', 'Iceberg', 'c:Icebergs'],
  ['desert', 'désert', 'Desert', 'c:Sand dunes'],
  ['island', 'île', 'Island', 'c:Islands'],
  ['beach', 'plage', 'Beach', 'c:Beaches'],
  ['forest', 'forêt', 'Forest', 'c:Forests'],
  ['lake', 'lac', 'Lake', 'c:Lakes'],
  ['river', 'rivière', 'River', 'c:Rivers'],
  ['snowflake', 'flocon', 'Snowflake', 'c:Snowflakes'],
  ['crystal', 'cristal', 'Amethyst', 'c:Amethyst geodes'],
  ['geyser', 'geyser', 'Strokkur', 'c:Strokkur'],
  ['cave', 'grotte', 'Cave', 'c:Caves'],
  ['cloud', 'nuage', 'Cumulus cloud', 'c:Cumulus clouds'],
  ['snowman', 'bonhomme de neige', 'Snowman', 'c:Snowmen'],
  ['cactus', 'cactus', 'Saguaro', 'c:Carnegiea gigantea'],
  ['baobab', 'baobab', 'Adansonia grandidieri', 'c:Adansonia grandidieri'],
  ['palmtree', 'palmier', 'Coconut', 'c:Cocos nucifera'],
  ['firtree', 'sapin', 'Fir', 'c:Abies nordmanniana'],
  ['tree', 'arbre', 'Tree', 'c:Solitary trees'],
  ['sunflower', 'tournesol', 'Common sunflower', 'i:Helianthus annuus'],
  ['rose', 'rose', 'Rose', 'c:Red roses'],
  ['tulip', 'tulipe', 'Tulip', 'i:Tulipa gesneriana'],
  ['poppy', 'coquelicot', 'Papaver rhoeas', 'i:Papaver rhoeas'],
  ['daisy', 'marguerite', 'Leucanthemum vulgare', 'i:Leucanthemum vulgare'],
  ['lavender', 'lavande', 'Lavandula angustifolia', 'i:Lavandula angustifolia'],
  ['waterlily', 'nénuphar', 'Nymphaea alba', 'i:Nymphaea alba'],
  ['orchid', 'orchidée', 'Phalaenopsis', 'c:Phalaenopsis'],
  ['dandelion', 'pissenlit', 'Taraxacum officinale', 'i:Taraxacum officinale'],
  ['leaf', 'feuille', 'Leaf', 'c:Autumn leaves'],
  ['acorn', 'gland', 'Acorn', 'c:Acorns'],
  ['pinecone', 'pomme de pin', 'Conifer cone', 'c:Pine cones'],
  ['chestnut', 'marron', 'Conker', 'c:Conkers'],
  ['hazelnut', 'noisette', 'Hazelnut', 'c:Hazelnuts'],
  ['walnut', 'noix', 'Walnut', 'c:Walnuts'],
  ['feather', 'plume', 'Feather', 'c:Peacock feathers'],
  ['pebble', 'caillou', 'Pebble', 'c:Pebbles'],
  ['tornado', 'tornade', 'Tornado', 'c:Tornadoes'],
  // --- L'espace (NASA, domaine public) ---
  ['sun', 'soleil', 'Sun', 'n:sun solar dynamics observatory'],
  ['moon', 'lune', 'Moon', 'n:full moon'],
  ['earth', 'Terre', 'Earth', 'n:blue marble earth'],
  ['mercury', 'Mercure', 'Mercury (planet)', 'n:mercury messenger'],
  ['venus', 'Vénus', 'Venus', 'n:venus'],
  ['mars', 'Mars', 'Mars', 'n:mars hubble'],
  ['jupiter', 'Jupiter', 'Jupiter', 'n:jupiter juno'],
  ['saturn', 'Saturne', 'Saturn', 'n:saturn cassini'],
  ['uranus', 'Uranus', 'Uranus', 'n:uranus'],
  ['neptune', 'Neptune', 'Neptune', 'n:neptune voyager'],
  ['pluto', 'Pluton', 'Pluto', 'n:pluto new horizons'],
  ['comet', 'comète', 'C/2020 F3 (NEOWISE)', 'n:comet'],
  ['galaxy', 'galaxie', 'Andromeda Galaxy', 'n:spiral galaxy hubble'],
  ['nebula', 'nébuleuse', 'Pillars of Creation', 'n:nebula'],
  ['astronaut', 'astronaute', 'Astronaut', 'n:astronaut spacewalk'],
  ['rocket', 'fusée', 'Saturn V', 'n:rocket launch'],
  ['shuttle', 'navette', 'Space Shuttle', 'n:space shuttle launch'],
  ['station', 'station spatiale', 'International Space Station', 'n:international space station'],
  ['satellite', 'satellite', 'Satellite', 'n:satellite in orbit'],
  ['telescope', 'télescope', 'Hubble Space Telescope', 'n:hubble space telescope'],
  ['eclipse', 'éclipse', 'Solar eclipse', 'n:total solar eclipse'],
  ['meteor', 'étoile filante', 'Perseids', 'n:perseid meteor'],
  ['milkyway', 'Voie lactée', 'Milky Way', 'n:milky way'],
  ['asteroid', 'astéroïde', '101955 Bennu', 'n:asteroid'],
  ['crater', 'cratère', 'Tycho (lunar crater)', 'n:lunar crater'],
  ['star', 'étoile', 'Pleiades', 'n:pleiades'],
  // --- Les fruits ---
  ['kiwi', 'kiwi', 'Kiwifruit', 'c:Kiwifruit'],
  ['mango', 'mangue', 'Mango', 'c:Mangoes'],
  ['raspberry', 'framboise', 'Raspberry', 'c:Raspberries'],
  ['blueberry', 'myrtille', 'Blueberry', 'c:Blueberries'],
  ['blackberry', 'mûre', 'Blackberry', 'c:Blackberries'],
  ['coconut', 'noix de coco', 'Coconut', 'c:Coconuts'],
  ['pomegranate', 'grenade', 'Pomegranate', 'c:Pomegranates'],
  ['apricot', 'abricot', 'Apricot', 'c:Apricots'],
  ['melon', 'melon', 'Cantaloupe', 'c:Cantaloupes'],
  ['fig', 'figue', 'Common fig', 'c:Figs (fruit)'],
  ['lychee', 'litchi', 'Lychee', 'c:Lychees'],
  ['redcurrant', 'groseille', 'Redcurrant', 'c:Redcurrants'],
  ['clementine', 'clémentine', 'Clementine', 'c:Clementines'],
  // --- Les gourmandises ---
  ['icecream', 'glace', 'Ice cream cone', 'c:Ice cream cones'],
  ['lollipop', 'sucette', 'Lollipop', 'c:Lollipops'],
  ['candy', 'bonbon', 'Candy', 'c:Candies'],
  ['chocolate', 'chocolat', 'Chocolate bar', 'c:Chocolate bars'],
  ['crepe', 'crêpe', 'Crêpe', 'c:Crêpes'],
  ['waffle', 'gaufre', 'Waffle', 'c:Waffles'],
  ['donut', 'beignet', 'Doughnut', 'c:Doughnuts'],
  ['macaron', 'macaron', 'Macaron', 'c:Macarons'],
  ['pie', 'tarte', 'Tart', 'c:Fruit tarts'],
  ['marshmallow', 'guimauve', 'Marshmallow', 'c:Marshmallows'],
  ['cottoncandy', 'barbe à papa', 'Cotton candy', 'c:Cotton candy'],
  ['brioche', 'brioche', 'Brioche', 'c:Brioches'],
  ['madeleine', 'madeleine', 'Madeleine (cake)', 'c:Madeleines'],
  ['popcorn', 'pop-corn', 'Popcorn', 'c:Popcorn'],
  // --- À table ---
  ['pizza', 'pizza', 'Pizza Margherita', 'c:Pizza Margherita'],
  ['fries', 'frites', 'French fries', 'c:French fries'],
  ['sandwich', 'sandwich', 'Sandwich', 'c:Sandwiches'],
  ['soup', 'soupe', 'Soup', 'c:Soups'],
  ['pasta', 'pâtes', 'Spaghetti', 'c:Spaghetti'],
  ['rice', 'riz', 'Cooked rice', 'c:Cooked rice'],
  ['hamburger', 'hamburger', 'Hamburger', 'c:Hamburgers'],
  ['jam', 'confiture', 'Fruit preserves', 'c:Jams (food)'],
  ['yogurt', 'yaourt', 'Yogurt', 'c:Yogurt'],
  ['butter', 'beurre', 'Butter', 'c:Butter'],
  ['sausage', 'saucisse', 'Sausage', 'c:Sausages'],
  ['omelette', 'omelette', 'Omelette', 'c:Omelettes'],
  // --- Les légumes ---
  ['avocado', 'avocat', 'Avocado', 'c:Avocados'],
  ['leek', 'poireau', 'Leek', 'c:Leeks'],
  ['greenbean', 'haricot', 'Green bean', 'c:Green beans'],
  ['zucchini', 'courgette', 'Zucchini', 'c:Zucchini'],
  ['turnip', 'navet', 'Turnip', 'c:Turnips'],
  ['beet', 'betterave', 'Beetroot', 'c:Beetroots'],
  ['spinach', 'épinards', 'Spinach', 'c:Spinach'],
  ['artichoke', 'artichaut', 'Artichoke', 'c:Artichokes'],
  ['asparagus', 'asperge', 'Asparagus', 'c:Asparagus (food)'],
  ['cauliflower', 'chou-fleur', 'Cauliflower', 'c:Cauliflowers'],
  ['garlic', 'ail', 'Garlic', 'c:Garlic bulbs'],
  // --- La maison ---
  ['bed', 'lit', 'Bed', 'c:Beds'],
  ['chair', 'chaise', 'Chair', 'c:Wooden chairs'],
  ['table', 'table', 'Table (furniture)', 'c:Wooden tables'],
  ['lamp', 'lampe', 'Desk lamp', 'c:Desk lamps'],
  ['armchair', 'fauteuil', 'Armchair', 'c:Armchairs'],
  ['sofa', 'canapé', 'Couch', 'c:Sofas'],
  ['key', 'clé', 'Key (lock)', 'c:Keys (lock)'],
  ['clock', 'horloge', 'Clock', 'c:Wall clocks'],
  ['alarmclock', 'réveil', 'Alarm clock', 'c:Alarm clocks'],
  ['phone', 'téléphone', 'Smartphone', 'c:Smartphones'],
  ['tv', 'télévision', 'Television set', 'c:Television sets'],
  ['computer', 'ordinateur', 'Laptop', 'c:Laptops'],
  ['comb', 'peigne', 'Comb', 'c:Combs'],
  ['toothbrush', 'brosse à dents', 'Toothbrush', 'c:Toothbrushes'],
  ['soap', 'savon', 'Soap', 'c:Soap bars'],
  ['towel', 'serviette', 'Towel', 'c:Towels'],
  ['umbrella', 'parapluie', 'Umbrella', 'c:Umbrellas'],
  ['broom', 'balai', 'Broom', 'c:Brooms'],
  ['candle', 'bougie', 'Candle', 'c:Candles'],
  ['suitcase', 'valise', 'Suitcase', 'c:Suitcases'],
  ['basket', 'panier', 'Basket', 'c:Wicker baskets'],
  ['ladder', 'échelle', 'Ladder', 'c:Ladders'],
  ['hammer', 'marteau', 'Hammer', 'c:Hammers'],
  ['saw', 'scie', 'Saw', 'c:Hand saws'],
  ['bucket', 'seau', 'Bucket', 'c:Buckets'],
  ['shovel', 'pelle', 'Shovel', 'c:Shovels'],
  ['wateringcan', 'arrosoir', 'Watering can', 'c:Watering cans'],
  ['fork', 'fourchette', 'Fork', 'c:Forks'],
  ['knife', 'couteau', 'Table knife', 'c:Table knives'],
  ['bowl', 'bol', 'Bowl', 'c:Bowls'],
  ['bottle', 'bouteille', 'Bottle', 'c:Glass bottles'],
  ['teapot', 'théière', 'Teapot', 'c:Teapots'],
  ['pan', 'poêle', 'Frying pan', 'c:Frying pans'],
  ['fridge', 'frigo', 'Refrigerator', 'c:Refrigerators'],
  ['mirror', 'miroir', 'Mirror', 'c:Mirrors'],
  ['pillow', 'oreiller', 'Pillow', 'c:Pillows'],
  ['door', 'porte', 'Door', 'c:Wooden doors'],
  ['window', 'fenêtre', 'Window', 'c:Windows'],
  ['bell', 'cloche', 'Bell', 'c:Bells'],
  ['hourglass', 'sablier', 'Hourglass', 'c:Hourglasses'],
  // --- Les bâtiments ---
  ['castle', 'château', 'Neuschwanstein Castle', 'c:Neuschwanstein Castle'],
  ['house', 'maison', 'House', 'c:Houses'],
  ['igloo', 'igloo', 'Igloo', 'c:Igloos'],
  ['tent', 'tente', 'Tent', 'c:Tents'],
  ['hut', 'cabane', 'Tree house', 'c:Tree houses'],
  ['lighthouse', 'phare', 'Lighthouse', 'c:Lighthouses'],
  ['windmill', 'moulin', 'Windmill', 'c:Windmills'],
  ['bridge', 'pont', 'Bridge', 'c:Stone bridges'],
  ['pyramid', 'pyramide', 'Pyramid of Khafre', 'c:Pyramid of Khafre'],
  // --- L'école ---
  ['book', 'livre', 'Book', 'c:Books'],
  ['scissors', 'ciseaux', 'Scissors', 'c:Scissors'],
  ['pencil', 'crayon', 'Colored pencil', 'c:Colored pencils'],
  ['eraser', 'gomme', 'Eraser', 'c:Erasers'],
  ['ruler', 'règle', 'Ruler', 'c:Rulers'],
  ['schoolbag', 'cartable', 'Satchel (bag)', 'c:School bags'],
  ['pen', 'stylo', 'Ballpoint pen', 'c:Ballpoint pens'],
  ['envelope', 'enveloppe', 'Envelope', 'c:Envelopes'],
  ['magnifier', 'loupe', 'Magnifying glass', 'c:Magnifying glasses'],
  ['paintbrush', 'pinceau', 'Paintbrush', 'c:Paintbrushes'],
  ['sharpener', 'taille-crayon', 'Pencil sharpener', 'c:Pencil sharpeners'],
  ['glue', 'colle', 'Glue stick', 'c:Glue sticks'],
  ['notebook', 'cahier', 'Notebook', 'c:Notebooks'],
  ['chalk', 'craie', 'Chalk', 'c:Chalk'],
  ['blackboard', 'tableau', 'Blackboard', 'c:Blackboards'],
  ['calculator', 'calculatrice', 'Calculator', 'c:Calculators'],
  ['globe', 'globe', 'Globe', 'c:Terrestrial globes'],
  // --- Les habits ---
  ['hat', 'chapeau', 'Straw hat', 'c:Straw hats'],
  ['beanie', 'bonnet', 'Knit cap', 'c:Knit caps'],
  ['scarf', 'écharpe', 'Scarf', 'c:Scarves'],
  ['gloves', 'gant', 'Glove', 'c:Gloves'],
  ['sock', 'chaussette', 'Sock', 'c:Socks'],
  ['shoe', 'chaussure', 'Shoe', 'c:Shoes'],
  ['boot', 'botte', 'Rubber boot', 'c:Rubber boots'],
  ['trousers', 'pantalon', 'Jeans', 'c:Jeans'],
  ['dress', 'robe', 'Dress', 'c:Dresses'],
  ['skirt', 'jupe', 'Skirt', 'c:Skirts'],
  ['coat', 'manteau', 'Coat', 'c:Coats'],
  ['sweater', 'pull', 'Sweater', 'c:Sweaters'],
  ['tshirt', 'tee-shirt', 'T-shirt', 'c:T-shirts'],
  ['shorts', 'short', 'Shorts', 'c:Shorts'],
  ['pyjamas', 'pyjama', 'Pajamas', 'c:Pajamas'],
  ['cap', 'casquette', 'Baseball cap', 'c:Baseball caps'],
  ['belt', 'ceinture', 'Belt (clothing)', 'c:Belts (clothing)'],
  ['tie', 'cravate', 'Necktie', 'c:Neckties'],
  ['handbag', 'sac', 'Handbag', 'c:Handbags'],
  ['necklace', 'collier', 'Necklace', 'c:Necklaces'],
  ['ring', 'bague', 'Ring (jewellery)', 'c:Rings (jewellery)'],
  ['bracelet', 'bracelet', 'Bracelet', 'c:Bracelets'],
  ['swimsuit', 'maillot', 'Swimsuit', 'c:Swimsuits'],
  ['slipper', 'chausson', 'Slipper', 'c:Slippers'],
  ['sneaker', 'basket', 'Sneakers', 'c:Sneakers'],
  ['mittens', 'moufle', 'Mitten', 'c:Mittens'],
  ['glasses', 'lunettes', 'Glasses', 'c:Eyeglasses'],
  ['watch', 'montre', 'Watch', 'c:Wristwatches'],
  ['crown', 'couronne', 'Crown (headgear)', 'c:Crowns (headgear)'],
  // --- Les transports ---
  ['car', 'voiture', 'Car', 'c:Red cars'],
  ['truck', 'camion', 'Truck', 'c:Trucks'],
  ['bus', 'bus', 'Bus', 'c:Buses'],
  ['train', 'train', 'TGV', 'c:TGV'],
  ['plane', 'avion', 'Airliner', 'c:Aircraft in flight'],
  ['helicopter', 'hélicoptère', 'Helicopter', 'c:Helicopters in flight'],
  ['boat', 'bateau', 'Fishing boat', 'c:Fishing boats'],
  ['sailboat', 'voilier', 'Sailboat', 'c:Sailboats'],
  ['submarine', 'sous-marin', 'Submarine', 'c:Submarines'],
  ['motorbike', 'moto', 'Motorcycle', 'c:Motorcycles'],
  ['bike', 'vélo', 'Bicycle', 'c:Bicycles'],
  ['scooter', 'trottinette', 'Kick scooter', 'c:Kick scooters'],
  ['tractor', 'tracteur', 'Tractor', 'c:Tractors'],
  ['hotairballoon', 'montgolfière', 'Hot air balloon', 'c:Hot air balloons'],
  ['ambulance', 'ambulance', 'Ambulance', 'c:Ambulances'],
  ['taxi', 'taxi', 'Taxicab', 'c:Taxicabs of New York City'],
  ['tram', 'tramway', 'Tram', 'c:Trams in France'],
  ['metro', 'métro', 'Paris Métro', 'c:MP 89 (Paris Métro)'],
  ['kayak', 'kayak', 'Kayak', 'c:Kayaks'],
  ['sled', 'luge', 'Sled', 'c:Sleds'],
  ['ski', 'ski', 'Ski', 'c:Skis'],
  ['canoe', 'canoë', 'Canoe', 'c:Canoes'],
  ['digger', 'pelleteuse', 'Excavator', 'c:Excavators'],
  ['caravan', 'caravane', 'Caravan (trailer)', 'c:Caravans (trailers)'],
  ['locomotive', 'locomotive', 'Steam locomotive', 'c:Steam locomotives'],
  ['liner', 'paquebot', 'Cruise ship', 'c:Cruise ships'],
  ['wheel', 'roue', 'Wheel', 'c:Wheels'],
  ['parachute', 'parachute', 'Parachute', 'c:Parachutes'],
  // --- La musique ---
  ['piano', 'piano', 'Grand piano', 'c:Grand pianos'],
  ['guitar', 'guitare', 'Acoustic guitar', 'c:Acoustic guitars'],
  ['violin', 'violon', 'Violin', 'c:Violins'],
  ['drum', 'tambour', 'Drum', 'c:Snare drums'],
  ['trumpet', 'trompette', 'Trumpet', 'c:Trumpets'],
  ['flute', 'flûte', 'Recorder (musical instrument)', 'c:Recorders (musical instruments)'],
  ['harp', 'harpe', 'Harp', 'c:Harps'],
  ['accordion', 'accordéon', 'Accordion', 'c:Accordions'],
  ['saxophone', 'saxophone', 'Saxophone', 'c:Alto saxophones'],
  ['xylophone', 'xylophone', 'Xylophone', 'c:Xylophones'],
  ['maracas', 'maracas', 'Maraca', 'c:Maracas'],
  ['triangle', 'triangle', 'Triangle (musical instrument)', 'c:Triangles (musical instruments)'],
  ['cello', 'violoncelle', 'Cello', 'c:Cellos'],
  ['clarinet', 'clarinette', 'Clarinet', 'c:Clarinets'],
  ['harmonica', 'harmonica', 'Harmonica', 'c:Harmonicas'],
  ['ukulele', 'ukulélé', 'Ukulele', 'c:Ukuleles'],
  ['trombone', 'trombone', 'Trombone', 'c:Trombones'],
  ['tambourine', 'tambourin', 'Tambourine', 'c:Tambourines'],
  ['microphone', 'micro', 'Microphone', 'c:Microphones'],
  // --- Les jeux ---
  ['balloon', 'ballon', 'Balloon', 'c:Toy balloons'],
  ['doll', 'poupée', 'Doll', 'c:Dolls'],
  ['teddy', 'nounours', 'Teddy bear', 'c:Teddy bears'],
  ['top', 'toupie', 'Spinning top', 'c:Spinning tops'],
  ['kite', 'cerf-volant', 'Kite', 'c:Kites'],
  ['puzzle', 'puzzle', 'Jigsaw puzzle', 'c:Jigsaw puzzles'],
  ['dice', 'dé', 'Dice', 'c:Dice'],
  ['gift', 'cadeau', 'Gift wrapping', 'c:Gift wrapping'],
  ['robot', 'robot', 'Robot', 'c:Toy robots'],
  ['swing', 'balançoire', 'Swing (seat)', 'c:Swings (seat)'],
  ['slide', 'toboggan', 'Playground slide', 'c:Playground slides'],
  ['trampoline', 'trampoline', 'Trampoline', 'c:Trampolines'],
  ['racket', 'raquette', 'Tennis racket', 'c:Tennis rackets'],
  ['medal', 'médaille', 'Medal', 'c:Gold medals'],
  ['trophy', 'coupe', 'Trophy', 'c:Trophies'],
  ['whistle', 'sifflet', 'Whistle', 'c:Whistles'],
  ['marbles', 'bille', 'Marble (toy)', 'c:Marbles (toys)'],
  ['dominoes', 'domino', 'Dominoes', 'c:Dominoes'],
  ['pool', 'piscine', 'Swimming pool', 'c:Swimming pools'],
]
/** L'espace : une recherche dans la photothèque de la NASA. */
const NASA = {}
for (const [id, fr, en, src] of MORE) {
  TERMS.push([id, fr, '', en.toLowerCase(), en])
  const v = src.slice(2)
  if (src.startsWith('i:')) VIVANT[id] = v
  else if (src.startsWith('c:')) CATEG[id] = v
  else if (src.startsWith('n:')) NASA[id] = v
}
// Refait le 29/10 : le « gâteau » était une tarte aux fruits, impossible à dessiner
CATEG.cake = 'Birthday cakes'

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
const ESPACE = { wiki: 2500, inat: 1100, ov: 800, nasa: 600, img: 900 }
const RECUL = [20000, 45000, 90000, 120000]
const files = { wiki: Promise.resolve(), inat: Promise.resolve(), ov: Promise.resolve(), nasa: Promise.resolve(), img: Promise.resolve() }
/** Chaque hôte a son propre compteur : inutile de faire attendre iNaturalist
    parce que Commons boude. */
const voieDe = (url) => url.includes('inaturalist') ? 'inat' : url.includes('openverse') ? 'ov' : url.includes('nasa.gov') ? 'nasa' : 'wiki'

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

/** Métadonnées (licence, auteur, vignette) de fichiers Commons. La vignette
    à 960 px, une largeur STANDARD : les autres (640…) répondent 429 en rafale
    (29/10, la leçon de la carte du globe, voir PIEGES.md). */
async function commonsMeta(names) {
  const titles = names.map(n => 'File:' + n).join('|')
  const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*`
    + `&titles=${encodeURIComponent(titles)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=960`
  const d = await api(u)
  return Object.values(d.query?.pages || {}).map(metaOf).filter(Boolean)
}

/** Une page de fichier Commons (avec son `imageinfo`) → une proposition, si sa licence est libre. */
function metaOf(p) {
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
  // Les fichiers ET leurs licences en une seule requête (29/10 : Commons
  // compte les appels, chaque requête économisée raccourcit la collecte)
  const d = await api(`https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*`
    + `&generator=categorymembers&gcmtype=file&gcmlimit=30&gcmtitle=${encodeURIComponent('Category:' + cat)}`
    + `&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=960`)
  return Object.values(d.query?.pages || {})
    .filter(p => /\.(jpe?g|png)$/i.test(p.title) && !/diagram|chart|map|logo|icon/i.test(p.title))
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(metaOf).filter(Boolean).slice(0, n)
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
  // Le taxon dont le nom latin est EXACTEMENT celui demandé : le premier
  // résultat de « Gorilla gorilla » est un crabe (le crabe-gorille, 29/10)
  const d = await api(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(q)}&per_page=10`)
  const t0 = d.results?.find(t => t.name?.toLowerCase() === q.toLowerCase()) || d.results?.[0]
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

/** La photothèque de la NASA : tout y est dans le domaine public. La vignette
    de la recherche (`~small`) est trop petite pour le moule de 512 px : on
    demande `~medium`, et la petite seulement si la moyenne manque. */
async function fromNASA(q, n) {
  if (!q) return []
  const d = await api(`https://images-api.nasa.gov/search?media_type=image&q=${encodeURIComponent(q)}`)
  return (d.collection?.items || []).slice(0, n).map(it => {
    const m = it.data?.[0] || {}
    const small = it.links?.[0]?.href || ''
    return {
      thumbnail: small.replace(/~(small|thumb)\./, '~medium.'), alt: small, url: small.replace(/~(small|thumb)\./, '~orig.'),
      title: m.title || m.nasa_id, creator: (m.photographer || m.secondary_creator || `NASA ${m.center || ''}`).trim().slice(0, 80),
      license: 'Domaine public (NASA)', license_version: '', foreign_landing_url: `https://images.nasa.gov/details/${encodeURIComponent(m.nasa_id)}`
    }
  }).filter(it => it.alt)
}

async function fromOpenverse(q, n) {
  // Openverse tombe en panne des heures durant (502 au bout de 45 s, 29/10) :
  // `SANS_OPENVERSE=1` s'en passe, c'est de toute façon la source la moins sûre
  if (process.env.SANS_OPENVERSE) return []
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
    ] : NASA[id] ? [
      () => fromWikipedia(en, 'en'),           // l'espace : l'image de tête, puis la NASA
      () => fromNASA(NASA[id], PER_TERM),
      () => fromWikidata(fr)
    ] : [
      // Le reste : l'image de tête de l'article (choisie pour représenter le
      // sujet), puis la catégorie Commons
      () => fromWikipedia(en, 'en'),
      () => fromCommonsCat(categ, PER_TERM),
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
        let r = await file(it.thumbnail)
        if (!r.ok && it.alt) r = await file(it.alt)
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
    // Gardé à chaque mot : une collecte de plusieurs heures peut s'arrêter en route
    await writeFile(path.join(CAND_DIR, 'index.json'), JSON.stringify(index, null, 2))
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
