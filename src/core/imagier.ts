/* 📚 L'IMAGIER — toutes les photos de l'app, et ce qu'on sait de chacune.

   Le 29/10, Joyce : « c'est quasiment toujours les mêmes mots ». L'imagier
   passe de 76 photos à 324, rangées par thème (le père : « on peut
   s'arrêter à 200 photos » ; la maison, l'école, les habits, les
   transports, la musique et les jeux attendent leurs photos : leurs mots
   sont prêts dans `scripts/import-photos.mjs`). Chaque ligne :
   la photo (`public/assets/photos/<id>.jpg`), l'article et le mot (la voix,
   le devineur de Devine mon dessin), puis deux niveaux.

   - Le niveau d'ORTHOGRAPHE (la Chasse aux lettres), d'après les repères
     des programmes : 1 = la fleur, CP (des syllabes simples ; ch, ou, on,
     an, oi ; une lettre muette courante : lapin, canard, fusée) ; 2 =
     l'éclair, CE1 (eau, au, ai, ei, gn, ill, gu, qu, les lettres doubles,
     les finales muettes : chameau, poireau, trompette) ; 3 = la flamme,
     CE2-CM1 (ph, th, y, h, ç, œ, les accents qui ne s'entendent pas, les
     mots longs ou composés : rhinocéros, hippocampe, arc-en-ciel) ; 0 =
     pas un mot à écrire (trop long, ou la photo en évoque un autre : le
     morpho est d'abord un papillon).
   - Le DÉFI de Devine mon dessin : 1 = la fleur (une forme simple : une
     pomme, un soleil), 2 = l'éclair, 3 = la flamme (un éléphant, un vélo),
     0 = la photo ne se dessine pas (une tarte aux fruits, un glacier).
   - Le THÈME : le Memory en tire ses jeux de cartes.

   Les sources et les crédits sont dans `scripts/import-photos.mjs` et
   `public/assets/photos/CREDITS.json`. Ajouter un mot : sa ligne ici ET
   dans le script, la planche-contact REGARDÉE, puis `garder`. */

export type Theme = 'ferme' | 'monde' | 'oiseaux' | 'mer' | 'betes' | 'nature' | 'espace' | 'fruits' | 'desserts'
  | 'cuisine' | 'legumes' | 'maison' | 'batiments' | 'ecole' | 'habits' | 'transports' | 'musique' | 'jeux'
export type Level = 0 | 1 | 2 | 3

/** [photo, article, mot, orthographe, dessin] */
type Row = [id: string, article: string, mot: string, niveau: Level, dessin: Level]

export interface Pic {
  id: string
  /** « un », « une », « des », « du », « de la », « de l' », « le », « la », ou rien (Mars). */
  article: string
  mot: string
  theme: Theme
  /** L'orthographe : 1 fleur (CP), 2 éclair (CE1), 3 flamme (CE2-CM1), 0 jamais. */
  niveau: Level
  /** Le défi de dessin : 1 fleur, 2 éclair, 3 flamme, 0 jamais. */
  dessin: Level
}

const ROWS: Record<Theme, Row[]> = {
  // La ferme et les animaux de la maison
  ferme: [
    ['cow', 'une', 'vache', 1, 3],
    ['pig', 'un', 'cochon', 1, 2],
    ['chicken', 'une', 'poule', 1, 3],
    ['chick', 'un', 'poussin', 2, 2],
    ['duck', 'un', 'canard', 1, 2],
    ['horse', 'un', 'cheval', 1, 3],
    ['goat', 'une', 'chèvre', 2, 0],
    ['sheep', 'un', 'mouton', 1, 3],
    ['rabbit', 'un', 'lapin', 1, 2],
    ['dog', 'un', 'chien', 1, 2],
    ['cat', 'un', 'chat', 1, 1],
    ['mouse', 'une', 'souris', 2, 2],
    ['donkey', 'un', 'âne', 1, 3],
    ['turkey', 'un', 'dindon', 2, 0],
    ['goose', 'une', 'oie', 1, 0],
    ['pony', 'un', 'poney', 2, 0],
    ['hamster', 'un', 'hamster', 3, 0],
    ['calf', 'un', 'veau', 2, 0],
    ['lamb', 'un', 'agneau', 2, 0],
    ['bull', 'un', 'taureau', 3, 0],
    ['rooster', 'un', 'coq', 1, 3],
    ['budgie', 'une', 'perruche', 2, 0],
    ['puppy', 'un', 'chiot', 2, 0],
    ['kitten', 'un', 'chaton', 1, 0],
    ['scarecrow', 'un', 'épouvantail', 3, 2],
  ],
  // Les animaux du monde
  monde: [
    ['elephant', 'un', 'éléphant', 3, 3],
    ['giraffe', 'une', 'girafe', 2, 3],
    ['lion', 'un', 'lion', 1, 2],
    ['monkey', 'un', 'singe', 2, 3],
    ['bear', 'un', 'ours', 1, 3],
    ['zebra', 'un', 'zèbre', 2, 3],
    ['fox', 'un', 'renard', 2, 3],
    ['deer', 'un', 'cerf', 2, 0],
    ['hedgehog', 'un', 'hérisson', 3, 3],
    ['frog', 'une', 'grenouille', 3, 2],
    ['snake', 'un', 'serpent', 2, 1],
    ['turtle', 'une', 'tortue', 2, 2],
    ['panda', 'un', 'panda', 1, 2],
    ['tiger', 'un', 'tigre', 1, 0],
    ['kangaroo', 'un', 'kangourou', 3, 3],
    ['koala', 'un', 'koala', 1, 0],
    ['hippo', 'un', 'hippopotame', 3, 0],
    ['bison', 'un', 'bison', 1, 0],
    ['moose', 'un', 'élan', 2, 0],
    ['sloth', 'un', 'paresseux', 3, 0],
    ['llama', 'un', 'lama', 1, 0],
    ['rhino', 'un', 'rhinocéros', 3, 3],
    ['gorilla', 'un', 'gorille', 3, 0],
    ['chimp', 'un', 'chimpanzé', 3, 0],
    ['orangutan', 'un', 'orang-outan', 3, 0],
    ['cheetah', 'un', 'guépard', 3, 0],
    ['leopard', 'un', 'léopard', 3, 0],
    ['jaguar', 'un', 'jaguar', 2, 0],
    ['wolf', 'un', 'loup', 1, 0],
    ['polarbear', 'un', 'ours polaire', 3, 0],
    ['reindeer', 'un', 'renne', 2, 0],
    ['camel', 'un', 'chameau', 2, 3],
    ['dromedary', 'un', 'dromadaire', 3, 0],
    ['crocodile', 'un', 'crocodile', 2, 3],
    ['chameleon', 'un', 'caméléon', 3, 0],
    ['iguana', 'un', 'iguane', 2, 0],
    ['lizard', 'un', 'lézard', 2, 2],
    ['beaver', 'un', 'castor', 1, 0],
    ['squirrel', 'un', 'écureuil', 3, 3],
    ['raccoon', 'un', 'raton laveur', 3, 0],
    ['otter', 'une', 'loutre', 2, 0],
    ['badger', 'un', 'blaireau', 3, 0],
    ['boar', 'un', 'sanglier', 3, 0],
    ['lynx', 'un', 'lynx', 3, 0],
    ['meerkat', 'un', 'suricate', 2, 0],
    ['lemur', 'un', 'lémurien', 3, 0],
    ['redpanda', 'un', 'panda roux', 2, 0],
    ['armadillo', 'un', 'tatou', 1, 0],
    ['anteater', 'un', 'fourmilier', 3, 0],
    ['platypus', 'un', 'ornithorynque', 3, 0],
    ['hyena', 'une', 'hyène', 3, 0],
    ['gazelle', 'une', 'gazelle', 2, 0],
    ['okapi', 'un', 'okapi', 1, 0],
    ['tapir', 'un', 'tapir', 1, 0],
    ['hare', 'un', 'lièvre', 2, 0],
    ['mole', 'une', 'taupe', 2, 0],
    ['bat', 'une', 'chauve-souris', 3, 3],
    ['fennec', 'un', 'fennec', 2, 0],
    ['porcupine', 'un', 'porc-épic', 3, 0],
    ['buffalo', 'un', 'buffle', 2, 0],
    ['warthog', 'un', 'phacochère', 3, 0],
    ['alpaca', 'un', 'alpaga', 2, 0],
    ['yak', 'un', 'yak', 1, 0],
    ['capybara', 'un', 'capybara', 3, 0],
    ['marmot', 'une', 'marmotte', 2, 0],
    ['chamois', 'un', 'chamois', 3, 0],
    ['ibex', 'un', 'bouquetin', 3, 0],
  ],
  // Les oiseaux
  oiseaux: [
    ['owl', 'un', 'hibou', 1, 2],
    ['parrot', 'un', 'perroquet', 3, 3],
    ['penguin', 'un', 'pingouin', 3, 3],
    ['flamingo', 'un', 'flamant rose', 3, 3],
    ['peacock', 'un', 'paon', 2, 3],
    ['toucan', 'un', 'toucan', 1, 3],
    ['hummingbird', 'un', 'colibri', 1, 0],
    ['eagle', 'un', 'aigle', 2, 0],
    ['swan', 'un', 'cygne', 3, 3],
    ['pelican', 'un', 'pélican', 2, 0],
    ['seagull', 'une', 'mouette', 2, 0],
    ['robin', 'un', 'rouge-gorge', 3, 0],
    ['bluetit', 'une', 'mésange', 2, 0],
    ['magpie', 'une', 'pie', 1, 0],
    ['crow', 'un', 'corbeau', 2, 0],
    ['sparrow', 'un', 'moineau', 3, 0],
    ['pigeon', 'un', 'pigeon', 3, 0],
    ['ostrich', 'une', 'autruche', 2, 3],
    ['stork', 'une', 'cigogne', 3, 0],
    ['heron', 'un', 'héron', 2, 0],
    ['kingfisher', 'un', 'martin-pêcheur', 3, 0],
    ['puffin', 'un', 'macareux', 3, 0],
    ['woodpecker', 'un', 'pic vert', 2, 0],
    ['swallow', 'une', 'hirondelle', 3, 0],
    ['blackbird', 'un', 'merle', 1, 0],
    ['vulture', 'un', 'vautour', 2, 0],
    ['falcon', 'un', 'faucon', 2, 0],
    ['canary', 'un', 'canari', 1, 0],
    ['barnowl', 'une', 'chouette', 2, 0],
    ['jay', 'un', 'geai', 3, 0],
    ['goldfinch', 'un', 'chardonneret', 3, 0],
    ['pheasant', 'un', 'faisan', 3, 0],
    ['cockatoo', 'un', 'cacatoès', 3, 0],
  ],
  // La mer
  mer: [
    ['whale', 'une', 'baleine', 2, 2],
    ['fish', 'un', 'poisson', 2, 1],
    ['dolphin', 'un', 'dauphin', 3, 3],
    ['shark', 'un', 'requin', 2, 3],
    ['octopus', 'une', 'pieuvre', 2, 2],
    ['jellyfish', 'une', 'méduse', 1, 2],
    ['starfish', 'une', 'étoile de mer', 3, 1],
    ['seahorse', 'un', 'hippocampe', 3, 3],
    ['clownfish', 'un', 'poisson-clown', 3, 0],
    ['seaturtle', 'une', 'tortue de mer', 3, 0],
    ['crab', 'un', 'crabe', 1, 2],
    ['lobster', 'un', 'homard', 3, 0],
    ['shrimp', 'une', 'crevette', 2, 0],
    ['seal', 'un', 'phoque', 3, 0],
    ['sealion', 'une', 'otarie', 1, 0],
    ['walrus', 'un', 'morse', 1, 0],
    ['orca', 'une', 'orque', 2, 0],
    ['manta', 'une', 'raie', 2, 0],
    ['urchin', 'un', 'oursin', 2, 0],
    ['coral', 'un', 'corail', 3, 0],
    ['anemone', 'une', 'anémone', 2, 0],
    ['squid', 'un', 'calamar', 2, 0],
    ['moray', 'une', 'murène', 2, 0],
    ['hermitcrab', 'un', 'bernard-l\'ermite', 0, 0],
    ['mussel', 'une', 'moule', 1, 0],
    ['oyster', 'une', 'huître', 3, 0],
    ['manatee', 'un', 'lamantin', 2, 0],
    ['sardine', 'une', 'sardine', 1, 0],
    ['salmon', 'un', 'saumon', 2, 0],
    ['beluga', 'un', 'béluga', 1, 0],
    ['pufferfish', 'un', 'poisson-globe', 3, 0],
  ],
  // Les petites bêtes
  betes: [
    ['butterfly', 'un', 'papillon', 3, 1],
    ['ladybug', 'une', 'coccinelle', 3, 1],
    ['bee', 'une', 'abeille', 3, 2],
    ['dragonfly', 'une', 'libellule', 2, 2],
    ['ant', 'une', 'fourmi', 1, 0],
    ['snail', 'un', 'escargot', 2, 1],
    ['spider', 'une', 'araignée', 3, 1],
    ['grasshopper', 'une', 'sauterelle', 3, 0],
    ['cricket', 'un', 'grillon', 3, 0],
    ['beetle', 'un', 'scarabée', 2, 0],
    ['caterpillar', 'une', 'chenille', 3, 1],
    ['earthworm', 'un', 'ver de terre', 3, 1],
    ['mantis', 'une', 'mante religieuse', 0, 0],
    ['bumblebee', 'un', 'bourdon', 2, 0],
    ['wasp', 'une', 'guêpe', 3, 0],
    ['fly', 'une', 'mouche', 1, 0],
    ['mosquito', 'un', 'moustique', 2, 0],
    ['cicada', 'une', 'cigale', 1, 0],
    ['slug', 'une', 'limace', 1, 0],
    ['millipede', 'un', 'mille-pattes', 3, 0],
    ['woodlouse', 'un', 'cloporte', 2, 0],
    ['stickinsect', 'un', 'phasme', 3, 0],
    ['scorpion', 'un', 'scorpion', 2, 0],
    ['cockchafer', 'un', 'hanneton', 3, 0],
    ['hornet', 'un', 'frelon', 2, 0],
    ['tadpole', 'un', 'têtard', 3, 0],
    ['monarch', 'un', 'monarque', 0, 0],
    ['morpho', 'un', 'morpho', 0, 0],
    ['peacockbutterfly', 'un', 'paon-du-jour', 0, 0],
    ['spiderweb', 'une', 'toile d\'araignée', 0, 0],
  ],
  // La nature
  nature: [
    ['mushroom', 'un', 'champignon', 3, 1],
    ['rainbow', 'un', 'arc-en-ciel', 3, 1],
    ['volcano', 'un', 'volcan', 1, 2],
    ['waterfall', 'une', 'cascade', 1, 0],
    ['aurora', 'une', 'aurore boréale', 3, 0],
    ['lightning', 'un', 'éclair', 2, 1],
    ['mountain', 'une', 'montagne', 3, 1],
    ['glacier', 'un', 'glacier', 2, 0],
    ['iceberg', 'un', 'iceberg', 3, 0],
    ['desert', 'un', 'désert', 2, 0],
    ['island', 'une', 'île', 2, 2],
    ['beach', 'une', 'plage', 1, 0],
    ['forest', 'une', 'forêt', 3, 0],
    ['lake', 'un', 'lac', 1, 0],
    ['river', 'une', 'rivière', 2, 0],
    ['snowflake', 'un', 'flocon', 1, 2],
    ['crystal', 'un', 'cristal', 2, 0],
    ['geyser', 'un', 'geyser', 3, 0],
    ['cave', 'une', 'grotte', 2, 0],
    ['cloud', 'un', 'nuage', 1, 1],
    ['snowman', 'un', 'bonhomme de neige', 0, 1],
    ['cactus', 'un', 'cactus', 2, 1],
    ['baobab', 'un', 'baobab', 2, 0],
    ['palmtree', 'un', 'palmier', 2, 2],
    ['firtree', 'un', 'sapin', 1, 1],
    ['tree', 'un', 'arbre', 1, 1],
    ['sunflower', 'un', 'tournesol', 2, 1],
    ['rose', 'une', 'rose', 1, 1],
    ['tulip', 'une', 'tulipe', 1, 1],
    ['poppy', 'un', 'coquelicot', 3, 0],
    ['daisy', 'une', 'marguerite', 3, 1],
    ['lavender', 'de la', 'lavande', 2, 0],
    ['waterlily', 'un', 'nénuphar', 3, 0],
    ['orchid', 'une', 'orchidée', 3, 0],
    ['dandelion', 'un', 'pissenlit', 3, 0],
    ['leaf', 'une', 'feuille', 3, 1],
    ['acorn', 'un', 'gland', 2, 0],
    ['pinecone', 'une', 'pomme de pin', 3, 0],
    ['chestnut', 'un', 'marron', 2, 0],
    ['hazelnut', 'une', 'noisette', 2, 0],
    ['walnut', 'une', 'noix', 2, 0],
    ['feather', 'une', 'plume', 1, 0],
    ['pebble', 'un', 'caillou', 3, 0],
    ['tornado', 'une', 'tornade', 1, 0],
  ],
  // L'espace
  espace: [
    ['sun', 'le', 'soleil', 2, 1],
    ['moon', 'la', 'lune', 1, 1],
    ['earth', 'la', 'Terre', 2, 0],
    ['mercury', '', 'Mercure', 2, 0],
    ['venus', '', 'Vénus', 1, 0],
    ['mars', '', 'Mars', 1, 0],
    ['jupiter', '', 'Jupiter', 2, 0],
    ['saturn', '', 'Saturne', 2, 0],
    ['uranus', '', 'Uranus', 2, 0],
    ['neptune', '', 'Neptune', 2, 0],
    ['pluto', '', 'Pluton', 1, 0],
    ['comet', 'une', 'comète', 2, 0],
    ['galaxy', 'une', 'galaxie', 2, 0],
    ['nebula', 'une', 'nébuleuse', 3, 0],
    ['astronaut', 'un', 'astronaute', 3, 2],
    ['rocket', 'une', 'fusée', 1, 1],
    ['shuttle', 'une', 'navette', 2, 0],
    ['station', 'une', 'station spatiale', 0, 0],
    ['satellite', 'un', 'satellite', 3, 0],
    ['telescope', 'un', 'télescope', 3, 0],
    ['eclipse', 'une', 'éclipse', 3, 0],
    ['meteor', 'une', 'étoile filante', 3, 0],
    ['asteroid', 'un', 'astéroïde', 3, 0],
    ['crater', 'un', 'cratère', 2, 0],
    ['star', 'une', 'étoile', 1, 1],
  ],
  // Les fruits
  fruits: [
    ['apple', 'une', 'pomme', 1, 1],
    ['banana', 'une', 'banane', 1, 1],
    ['strawberry', 'une', 'fraise', 2, 1],
    ['grapes', 'du', 'raisin', 2, 0],
    ['cherries', 'des', 'cerises', 2, 1],
    ['orange', 'une', 'orange', 1, 0],
    ['pear', 'une', 'poire', 1, 1],
    ['lemon', 'un', 'citron', 1, 1],
    ['watermelon', 'une', 'pastèque', 3, 2],
    ['peach', 'une', 'pêche', 2, 0],
    ['plum', 'une', 'prune', 1, 0],
    ['pineapple', 'un', 'ananas', 1, 2],
    ['kiwi', 'un', 'kiwi', 1, 0],
    ['mango', 'une', 'mangue', 2, 0],
    ['raspberry', 'une', 'framboise', 2, 0],
    ['blueberry', 'une', 'myrtille', 3, 0],
    ['blackberry', 'une', 'mûre', 2, 0],
    ['pomegranate', 'une', 'grenade', 1, 0],
    ['apricot', 'un', 'abricot', 2, 0],
    ['melon', 'un', 'melon', 1, 0],
    ['lychee', 'un', 'litchi', 3, 0],
    ['redcurrant', 'une', 'groseille', 3, 0],
    ['clementine', 'une', 'clémentine', 2, 0],
  ],
  // Les gourmandises
  desserts: [
    ['cake', 'un', 'gâteau', 3, 2],
    ['cookie', 'un', 'biscuit', 2, 1],
    ['muffin', 'un', 'muffin', 2, 0],
    ['croissant', 'un', 'croissant', 3, 2],
    ['icecream', 'une', 'glace', 1, 1],
    ['lollipop', 'une', 'sucette', 2, 1],
    ['candy', 'un', 'bonbon', 1, 0],
    ['chocolate', 'du', 'chocolat', 2, 0],
    ['crepe', 'une', 'crêpe', 2, 0],
    ['waffle', 'une', 'gaufre', 2, 0],
    ['donut', 'un', 'beignet', 3, 1],
    ['macaron', 'un', 'macaron', 1, 0],
    ['pie', 'une', 'tarte', 1, 0],
    ['marshmallow', 'une', 'guimauve', 3, 0],
    ['cottoncandy', 'une', 'barbe à papa', 3, 0],
    ['brioche', 'une', 'brioche', 2, 0],
    ['madeleine', 'une', 'madeleine', 2, 0],
    ['popcorn', 'du', 'pop-corn', 3, 0],
  ],
  // À table
  cuisine: [
    ['bread', 'du', 'pain', 1, 0],
    ['baguette', 'une', 'baguette', 2, 0],
    ['cheese', 'du', 'fromage', 2, 0],
    ['egg', 'un', 'œuf', 3, 1],
    ['milk', 'du', 'lait', 1, 0],
    ['honey', 'du', 'miel', 1, 0],
    ['pizza', 'une', 'pizza', 2, 1],
    ['fries', 'des', 'frites', 1, 0],
    ['sandwich', 'un', 'sandwich', 3, 0],
    ['soup', 'une', 'soupe', 1, 0],
  ],
  // Les légumes
  legumes: [
    ['carrot', 'une', 'carotte', 2, 1],
    ['tomato', 'une', 'tomate', 1, 0],
    ['broccoli', 'un', 'brocoli', 2, 0],
    ['corn', 'du', 'maïs', 3, 0],
    ['eggplant', 'une', 'aubergine', 3, 0],
    ['onion', 'un', 'oignon', 3, 0],
    ['cabbage', 'un', 'chou', 1, 0],
    ['pumpkin', 'une', 'citrouille', 3, 2],
    ['radish', 'un', 'radis', 1, 0],
    ['potato', 'une', 'pomme de terre', 3, 0],
    ['cucumber', 'un', 'concombre', 3, 0],
    ['pepper', 'un', 'poivron', 2, 0],
    ['salad', 'une', 'salade', 1, 0],
  ],
  // La maison
  maison: [
    ['plate', 'une', 'assiette', 3, 0],
    ['cup', 'une', 'tasse', 1, 1],
    ['pot', 'une', 'casserole', 3, 0],
    ['spoon', 'une', 'cuillère', 3, 2],
    ['glass', 'un', 'verre', 2, 0],
  ],
  // Les bâtiments
  batiments: [
  ],
  // L'école
  ecole: [
  ],
  // Les habits et les bijoux
  habits: [
  ],
  // Les transports
  transports: [
  ],
  // La musique
  musique: [
  ],
  // Les jeux et les jouets
  jeux: [
  ],
}

export const IMAGIER: Pic[] = (Object.entries(ROWS) as [Theme, Row[]][]).flatMap(([theme, rows]) =>
  rows.map(([id, article, mot, niveau, dessin]) => ({ id, article, mot, theme, niveau, dessin })))

/** Une photo par son identifiant. */
export const PIC: Record<string, Pic> = Object.fromEntries(IMAGIER.map(p => [p.id, p]))

/** Les photos d'un ou plusieurs thèmes. */
export const ofThemes = (themes: readonly Theme[]) => IMAGIER.filter(p => themes.includes(p.theme))
