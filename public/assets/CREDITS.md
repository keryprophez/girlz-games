# Crédits des assets

Les modèles 3D et les bruitages de ce dossier viennent de **[Kenney](https://kenney.nl)** et sont
publiés en **CC0 1.0 (domaine public)** : utilisation libre, y compris
commerciale, sans obligation d'attribution. On cite quand même, c'est la moindre
des choses — ce travail est offert.

- **Food Kit (3D)** — <https://kenney.nl/assets/food-kit>
- **Impact Sounds** — <https://kenney.nl/assets/impact-sounds>
- **Holiday Kit (3D)** — <https://kenney.nl/assets/holiday-kit>
- **Space Kit (3D)** — <https://kenney.nl/assets/space-kit>
- **Nature Kit (3D)** — <https://kenney.nl/assets/nature-kit>
- **RPG Audio** — <https://kenney.nl/assets/rpg-audio>
- **Interface Sounds** — <https://kenney.nl/assets/interface-sounds>

Les kits ont été **triés** : on ne garde que les modèles et les sons réellement
utilisés par les jeux. Pour en ajouter, modifier `scripts/import-assets.mjs` et
le relancer.

## Plantes du potager (`plants/`)

Les dix plantes du Potager et du Grand Tableau + (tulipe, bouton d'or,
violette, fraisier, carotte, maïs, pommier, brocoli, aubergine, ananas) sont
des **illustrations générées avec Canva** (génération d'images par IA) le
23/09/2026, pour cette app privée et familiale. Une seule planche de 5 × 2
(même style pour toutes), fond retiré dans Canva (médias Canva `MAHWDXWkHTg`
puis `MAHWDfyEwNk`, copie dans le Drive du père), découpée en carrés de
224 px en WebP.

Pour en ajouter ou en changer une : regénérer **toute la planche** (jamais
une plante seule, sinon deux styles), avec ce texte de commande :

> A sprite sheet of 10 separate garden plants for a children's educational
> tablet game, arranged in a clean grid of 5 columns and 2 rows, each plant
> centered in its own cell with generous empty space between them, on a
> plain flat pure white background. Each plant grows from a small round mound
> of brown soil, seen from a slight three-quarter top view. [liste des
> plantes, rangée par rangée] Style: polished, cute, high-quality mobile farm
> game icons, soft painterly shading with gentle gradients and highlights,
> clean thin dark brown outlines, warm saturated colors, consistent lighting
> from the top left, all plants the same scale. No text, no labels, no
> numbers, no shadows on the background.

## Fruits du Ninja (`fruits/`)

Les cinq fruits (pomme, orange, pastèque, fraise, kiwi), leurs moitiés et le
cactus du Ninja du Verger sont des **illustrations générées avec Canva** le
24/09/2026, avec la planche des plantes en référence de style (médias Canva
`MAHWFsYiho8`, fond retiré, copie dans le Drive du père). Planche de 6 × 2
découpée en WebP : les fruits entiers dans des carrés de 256 px, les moitiés
à la même échelle (`<fruit>-g`, `<fruit>-d`). La planche n'a qu'une face
coupée pour la pomme et l'orange : elle est rétrécie en largeur (vue de trois
quarts) et retournée pour la seconde moitié.

Même règle que pour les plantes : on regénère **toute la planche**, avec la
planche des plantes en référence et ce texte de commande :

> A sprite sheet for a children's fruit-slicing tablet game, in exactly the
> same art style as the reference image (same clean thin dark brown outlines,
> same soft painterly shading with gentle gradients and highlights, same warm
> saturated colors, same lighting from the top left), on a plain flat pure
> white background, arranged in a clean grid of 6 columns and 2 rows with
> generous empty space between items, no soil mounds, no plants. Top row,
> left to right, whole items: [les cinq fruits], and a round green cactus
> with sharp spines and a small pink flower (the item to avoid). Bottom row,
> left to right: the same fruits each cut cleanly in two halves, the two
> halves shown side by side with a clear gap between them, showing the juicy
> colorful inside flesh and seeds; the last cell of the bottom row is left
> completely empty. All items the same size. No text, no labels, no numbers,
> no shadows on the background.

## Voix des animaux (`sounds/animals/`)

Dix cris d'animaux enregistrés, pris sur **Wikimedia Commons** (licences
libres), choisis à l'oreille par le père sur une page d'écoute le 25/09 pour
le Chœur de la ferme (et le Piano). Chaque fichier est un court
extrait de l'enregistrement (secondes indiquées), ramené à un volume commun
(normalisation -16 LUFS), en MP3 mono. Les extraits des fichiers CC BY-SA
sont partagés sous la même licence.

- **vache** : « Mudchute cow 1.ogg », Secretlondon, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Mudchute_cow_1.ogg> (0,62–2,27 s)
- **poule** : « Chickens demanding food.ogg », alys, domaine public — <https://commons.wikimedia.org/wiki/File:Chickens_demanding_food.ogg> (8,72–10,22 s)
- **canard** : « Anas platyrhynchos - Mallard - XC62258.ogg », Jonathon Jongsma, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Anas_platyrhynchos_-_Mallard_-_XC62258.ogg> (1,07–2,77 s)
- **mouton** : « Sheep bleating.ogg », earthcalling, domaine public — <https://commons.wikimedia.org/wiki/File:Sheep_bleating.ogg> (0,42–1,82 s)
- **cochon** : « Mudchute pig 2.ogg », Secretlondon, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Mudchute_pig_2.ogg> (0–0,51 s)
- **chien** : « Barking of a dog 2.ogg », Amada44, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Barking_of_a_dog_2.ogg> (1,37–2,17 s)
- **coq** : « Rooster crowing.oga », Georgethewriter, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Rooster_crowing.oga> (1,62–3,47 s)
- **chèvre** : « Herd of goats bleating.ogg », stephan, domaine public — <https://commons.wikimedia.org/wiki/File:Herd_of_goats_bleating.ogg> (13,37–14,67 s)
- **cheval** : « Mares-Prefer-the-Voices-of-Highly-Fertile-Stallions-pone.0118468.s002.oga », Lemasson A., Remeuf K., Trabalon M., Cuir F., Hausberger M., CC BY 4.0 — <https://commons.wikimedia.org/wiki/File:Mares-Prefer-the-Voices-of-Highly-Fertile-Stallions-pone.0118468.s002.oga> (0,67–2,82 s)
- **chat** : « Meow.ogg », Dan Crosby (Dcrosby, Wikipédia en anglais), CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Meow.ogg> (0–0,96 s)

## Espace et géographie

- **La Terre** (`space/earth.jpg`, `geo/earth.jpg`) : NASA Blue Marble, *Visible Earth*
  (<https://visibleearth.nasa.gov>), domaine public.
- **Mercure, Vénus, la Lune, Mars, Jupiter, Saturne et ses anneaux, Uranus, Neptune,
  le Soleil** (`space/*.jpg`) : textures de **Solar System Scope**
  (<https://www.solarsystemscope.com/textures/>), licence **CC BY 4.0**,
  récupérées via Wikimedia Commons et réduites à 1024×512.
- **La Terre du Voyage dans l'Espace** (`space/earth_day.jpg`, `earth_night.jpg`,
  `earth_clouds.jpg`, `earth_spec.jpg` : le jour, les lumières des villes, les
  nuages, les océans qui brillent) et **Jupiter et Mars en 2048×1024** : Solar
  System Scope, **CC BY 4.0**, repris de la maquette du père (27/09). La carte 2k
  de Mars (relevé Viking, beige et bleuté) a reçu la palette rouge de la carte
  1k de Solar System Scope : « la planète rouge » doit l'être (28/09).
- **Ganymède et Callisto** (`space/ganymede.jpg`, `space/callisto.jpg`) : cartes
  en couleurs vraies d'**Askaniy Anpilogov** (Callisto avec John van Vliet ;
  Ganymède d'après USGS, Björn Jónsson, NASA/JPL-Caltech/SwRI/MSSS/Brian Swift),
  **CC BY-SA 3.0**, via Wikimedia Commons
  (<https://commons.wikimedia.org/wiki/File:Ganymede_map_by_Askaniy.png>,
  <https://commons.wikimedia.org/wiki/File:Callisto_map_by_Askaniy.png>) ;
  réduites à 1024×512, contraste et luminosité ajustés (28/09).
- **Io** (`space/io.jpg`) : mosaïque en couleurs Galileo SSI / Voyager de
  l'**USGS Astrogeology Science Center** (NASA), domaine public, via Wikimedia
  Commons (<https://commons.wikimedia.org/wiki/File:Io_for_GeoHacks.jpg>) ;
  réduite à 1024×512, couleurs ravivées (28/09).
- **Europe** (`space/europa.jpg`) : carte Voyager de **Caltech/JPL/USGS** (NASA),
  domaine public, via Wikimedia Commons
  (<https://commons.wikimedia.org/wiki/File:Jupiter_II-Europa_map_NASA_JPL_Voyager.jpg>) ;
  en niveaux de gris à l'origine, colorisée en glace crème et fissures brunes (28/09).
- **Pays et continents** (`geo/countries-110m.json`) : Natural Earth via
  `world-atlas` (<https://github.com/topojson/world-atlas>), domaine public.
- **Régions de France** (`geo/regions.geojson`) : IGN Admin Express via
  `france-geojson` de Grégoire David (<https://github.com/gregoiredavid/france-geojson>),
  Licence Ouverte Etalab.

## Photos des jeux d'images

Les imagiers — **l'Intrus**, **Memory**, la **Chasse aux lettres**, **Devine
mon dessin** et **Le Marché** — n'utilisent QUE de vraies photographies : le
père ne voulait pas voir deux styles dans l'app. Les animaux viennent
d'**iNaturalist** (photos identifiées par l'espèce), l'espace de la **NASA**
(domaine public), le reste des **catégories de Wikimedia Commons** ;
tout est ramené au même moule à l'import (carré, 512 px) par
`scripts/import-photos.mjs`.

L'app est privée, familiale et sans usage commercial : les licences non
commerciales (CC BY-NC) sont donc acceptées, et créditées comme les autres.
La liste fait foi dans `public/assets/photos/CREDITS.json`.

- **abeille** (`bee.jpg`) — *Western Honey Bee (Apis mellifera)*, Lê Thanh Hoa, CC-BY-NC — <https://www.inaturalist.org/photos/389898647>
- **abricot** (`apricot.jpg`) — *20070107 Apricot.jpg*, Ian W. Fieggen, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:20070107_Apricot.jpg>
- **agneau** (`lamb.jpg`) — *Sheep, Stodmarsh 6.jpg*, Keven Law, Los Angeles, USA, CC BY-SA 2.0 — <https://commons.wikimedia.org/wiki/File:Sheep,_Stodmarsh_6.jpg>
- **aigle** (`eagle.jpg`) — *Golden Eagle (Aquila chrysaetos)*, Carlos N. G. Bocos, CC-BY-NC — <https://www.inaturalist.org/photos/168362446>
- **alpaga** (`alpaca.jpg`) — *Alpaca (Lama pacos)*, shiranhersh, CC-BY-NC — <https://www.inaturalist.org/photos/22703716>
- **ananas** (`pineapple.jpg`) — *കൈതച്ചക്ക.jpg*, Suniltg at Malayalam Wikipedia, CC BY 3.0 — <https://commons.wikimedia.org/wiki/File:%E0%B4%95%E0%B5%88%E0%B4%A4%E0%B4%9A%E0%B5%8D%E0%B4%9A%E0%B4%95%E0%B5%8D%E0%B4%95.jpg>
- **âne** (`donkey.jpg`) — *Donkey (Equus asinus)*, Angela Marie, CC-BY — <https://www.inaturalist.org/photos/266668199>
- **anémone** (`anemone.jpg`) — *Atlantic Beadlet Anemone (Actinia equina)*, Heather G., CC-BY-NC — <https://www.inaturalist.org/photos/19571233>
- **araignée** (`spider.jpg`) — *Cross Orbweaver (Araneus diadematus)*, John Cramer III, CC-BY-NC — <https://www.inaturalist.org/photos/4094545>
- **arbre** (`tree.jpg`) — *Usamljeni jasen - panoramio (cropped).jpg*, menergo, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Usamljeni_jasen_-_panoramio_(cropped).jpg>
- **arc-en-ciel** (`rainbow.jpg`) — *Double-alaskan-rainbow.jpg*, Eric Rolph at English Wikipedia, CC BY-SA 2.5 — <https://commons.wikimedia.org/wiki/File:Double-alaskan-rainbow.jpg>
- **assiette** (`plate.jpg`) — *Botanical plate with spray of fruiting Indian Bean Tree MET DP-1687-038 (cropped).jpg*, Chelsea porcelain factory, CC0 — <https://commons.wikimedia.org/wiki/File:Botanical_plate_with_spray_of_fruiting_Indian_Bean_Tree_MET_DP-1687-038_(cropped).jpg>
- **astéroïde** (`asteroid.jpg`) — *Bennu mosaic OSIRIS-REx (square).png*, NASA/Goddard/University of Arizona, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:Bennu_mosaic_OSIRIS-REx_(square).png>
- **astronaute** (`astronaut.jpg`) — *Bruce McCandless II during EVA in 1984.jpg*, NASA, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:Bruce_McCandless_II_during_EVA_in_1984.jpg>
- **aubergine** (`eggplant.jpg`) — *Des aubergines violettes.jpg*, BeraDigle, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Des_aubergines_violettes.jpg>
- **aurore boréale** (`aurora.jpg`) — *Aurora borealis over Eielson Air Force Base, Alaska.jpg*, United States Air Force photo by Senior Airman Joshua Strang, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:Aurora_borealis_over_Eielson_Air_Force_Base,_Alaska.jpg>
- **autruche** (`ostrich.jpg`) — *Common Ostrich (Struthio camelus)*, tlim, CC-BY-NC — <https://www.inaturalist.org/photos/2568822>
- **baguette** (`baguette.jpg`) — *9457French bagette 01.jpg*, Judgefloro, CC0 — <https://commons.wikimedia.org/wiki/File:9457French_bagette_01.jpg>
- **baleine** (`whale.jpg`) — *Humpback Whale (Megaptera novaeangliae)*, John Thorogood, CC-BY-NC — <https://www.inaturalist.org/photos/338733901>
- **banane** (`banana.jpg`) — *20150627-FFAS-LSC-0107*, USDAgov, PDM — <https://www.flickr.com/photos/41284017@N08/19047618349>
- **baobab** (`baobab.jpg`) — *Adansonia grandidieri04.jpg*, Bernard Gagnon, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Adansonia_grandidieri04.jpg>
- **barbe à papa** (`cottoncandy.jpg`) — *Cotton candy Μαλλί της γριάς.JPG*, FocalPoint, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Cotton_candy_%CE%9C%CE%B1%CE%BB%CE%BB%CE%AF_%CF%84%CE%B7%CF%82_%CE%B3%CF%81%CE%B9%CE%AC%CF%82.JPG>
- **beignet** (`donut.jpg`) — *Glazed-Donut.jpg*, Evan-Amos, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:Glazed-Donut.jpg>
- **béluga** (`beluga.jpg`) — *Beluga (Delphinapterus leucas)*, Fundación Caja Mediterráneo, CC-BY-NC-ND — <https://www.inaturalist.org/photos/66927701>
- **bernard-l'ermite** (`hermitcrab.jpg`) — *Common Hermit Crab (Pagurus bernhardus)*, Stefan, CC-BY-NC — <https://www.inaturalist.org/photos/13213119>
- **biscuit** (`cookie.jpg`) — *5-25-2025 Earl grey cookies with extra orange rind - 003.jpg*, Wheeler Cowperthwaite, CC BY 2.0 — <https://commons.wikimedia.org/wiki/File:5-25-2025_Earl_grey_cookies_with_extra_orange_rind_-_003.jpg>
- **bison** (`bison.jpg`) — *Bovids (Bovidae)*, Sean Brady, CC-BY-NC-ND — <https://www.inaturalist.org/photos/7642>
- **blaireau** (`badger.jpg`) — *European Badger (Meles meles)*, Paul Bowyer, CC-BY-NC — <https://www.inaturalist.org/photos/53653140>
- **bonbon** (`candy.jpg`) — *Candy in Damascus.jpg*, Elisa  Azzali, CC BY 2.0 — <https://commons.wikimedia.org/wiki/File:Candy_in_Damascus.jpg>
- **bonhomme de neige** (`snowman.jpg`) — *Snowman in Indiana 2014.jpg*, GutMaze, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Snowman_in_Indiana_2014.jpg>
- **bouquetin** (`ibex.jpg`) — *Alpine Ibex (Capra ibex)*, Jérémy Calvo, CC-BY-NC — <https://www.inaturalist.org/photos/373820446>
- **bourdon** (`bumblebee.jpg`) — *Buff-tailed Bumble Bee (Bombus terrestris)*, Bill Lucas, CC-BY-NC — <https://www.inaturalist.org/photos/43060997>
- **brioche** (`brioche.jpg`) — *Brioche.jpg*, inconnu, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Brioche.jpg>
- **brocoli** (`broccoli.jpg`) — *-2018-12-10 Broccoli, Trimingham (1).JPG*, Kolforn (Kolforn)
I'd appreciate if you could mail me (Kolforn@gmail.com) if you, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:-2018-12-10_Broccoli,_Trimingham_(1).JPG>
- **buffle** (`buffalo.jpg`) — *African Buffalo (Syncerus caffer)*, Michael Jansen, CC-BY-ND — <https://www.inaturalist.org/photos/97834193>
- **cacatoès** (`cockatoo.jpg`) — *Sulphur-crested Cockatoo (Cacatua galerita)*, Hyme852052, CC-BY-SA — <https://www.inaturalist.org/photos/248913955>
- **cactus** (`cactus.jpg`) — *Carnegiea gigantea in Saguaro National Park near Tucson, Arizona during November (58).jpg*, WClarke, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Carnegiea_gigantea_in_Saguaro_National_Park_near_Tucson,_Arizona_during_November_(58).jpg>
- **caillou** (`pebble.jpg`) — *Pebble Dash (15366562092).jpg*, wardyboy400, CC BY 2.0 — <https://commons.wikimedia.org/wiki/File:Pebble_Dash_(15366562092).jpg>
- **calamar** (`squid.jpg`) — *Bigfin Reef Squid (Sepioteuthis lessoniana)*, Doug Finney, CC-BY-NC — <https://www.inaturalist.org/photos/114424866>
- **caméléon** (`chameleon.jpg`) — *Veiled Chameleon (Chamaeleo calyptratus)*, Bobby Bok, CC-BY-NC — <https://www.inaturalist.org/photos/473857256>
- **canard** (`duck.jpg`) — *Mallard (Anas platyrhynchos)*, anonymous, CC-BY-SA — <https://www.inaturalist.org/photos/95268822>
- **canari** (`canary.jpg`) — *GelbA.JPG*, NEWSchr, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:GelbA.JPG>
- **capybara** (`capybara.jpg`) — *Capybara (Hydrochoerus hydrochaeris)*, Carlos Sanchez, CC-BY-NC — <https://www.inaturalist.org/photos/91546944>
- **carotte** (`carrot.jpg`) — *13-08-31-wien-redaktionstreffen-EuT-by-Bi-frie-035.jpg*, Bi-frie (talk), CC BY 3.0 — <https://commons.wikimedia.org/wiki/File:13-08-31-wien-redaktionstreffen-EuT-by-Bi-frie-035.jpg>
- **cascade** (`waterfall.jpg`) — *Cascada Dynjandi, Vestfirðir, Islandia, 2014-08-14, DD 136-138 HDR.JPG*, Diego Delso, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Cascada_Dynjandi,_Vestfir%C3%B0ir,_Islandia,_2014-08-14,_DD_136-138_HDR.JPG>
- **casserole** (`pot.jpg`) — *2014-04-27 IMG 7338 최광모.JPG*, 최광모 (Choe Kwangmo), CC0 — <https://commons.wikimedia.org/wiki/File:2014-04-27_IMG_7338_%EC%B5%9C%EA%B4%91%EB%AA%A8.JPG>
- **castor** (`beaver.jpg`) — *Eurasian Beaver (Castor fiber)*, no rights reserved, CC0 — <https://www.inaturalist.org/photos/120665558>
- **cerf** (`deer.jpg`) — *Red Deer (Cervus elaphus)*, Jon J. Laysell, CC-BY-NC — <https://www.inaturalist.org/photos/25186445>
- **cerises** (`cherries.jpg`) — *- panoramio (3071).jpg*, dementevalexei, CC BY 3.0 — <https://commons.wikimedia.org/wiki/File:-_panoramio_(3071).jpg>
- **chameau** (`camel.jpg`) — *Domestic Bactrian Camel (Camelus bactrianus)*, Pavel Shukov, CC-BY-NC — <https://www.inaturalist.org/photos/107439185>
- **chamois** (`chamois.jpg`) — *Northern Chamois (Rupicapra rupicapra)*, Giles Laurent, CC-BY-SA — <https://www.inaturalist.org/photos/456684191>
- **champignon** (`mushroom.jpg`) — *2013 Harvest Festival and Farmer's Market Outdoors Season Closure (20131122-NRCS-LSC-0068).jpg*, USDAgov, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:2013_Harvest_Festival_and_Farmer%27s_Market_Outdoors_Season_Closure_(20131122-NRCS-LSC-0068).jpg>
- **chardonneret** (`goldfinch.jpg`) — *European Goldfinch (Carduelis carduelis)*, Antti Henttonen, CC-BY-NC — <https://www.inaturalist.org/photos/369311714>
- **chat** (`cat.jpg`) — *Domestic Cat (Felis catus)*, capracornelius, CC-BY-NC — <https://www.inaturalist.org/photos/703856853>
- **chaton** (`kitten.jpg`) — *Juvenile Ragdoll.jpg*, Leijurv, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Juvenile_Ragdoll.jpg>
- **chauve-souris** (`bat.jpg`) — *Indian Flying Fox (Pteropus medius)*, Matthew Blissett, CC-BY — <https://www.inaturalist.org/photos/31963525>
- **chenille** (`caterpillar.jpg`) — *Chenille de Grand porte queue (macaon).jpg*, Didier Descouens, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Chenille_de_Grand_porte_queue_(macaon).jpg>
- **cheval** (`horse.jpg`) — *Domestic Horse (Equus caballus)*, copper, CC-BY-NC — <https://www.inaturalist.org/photos/23672580>
- **chèvre** (`goat.jpg`) — *Domestic Goat (Capra hircus)*, Dan Foy, CC-BY-NC — <https://www.inaturalist.org/photos/138189496>
- **chien** (`dog.jpg`) — *Domestic Dog (Canis familiaris)*, Марина Горбунова-Ëлкина, CC-BY-NC — <https://www.inaturalist.org/photos/117465253>
- **chimpanzé** (`chimp.jpg`) — *Chimpanzee (Pan troglodytes)*, Martin Grimm, CC-BY-NC — <https://www.inaturalist.org/photos/11268628>
- **chiot** (`puppy.jpg`) — *Golde33443.jpg*, Golden Trvs Gol twister, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Golde33443.jpg>
- **chocolat** (`chocolate.jpg`) — *Green and Black's dark chocolate bar 2.jpg*, Mx. Granger, CC0 — <https://commons.wikimedia.org/wiki/File:Green_and_Black%27s_dark_chocolate_bar_2.jpg>
- **chou** (`cabbage.jpg`) — *Individual cabbage in a cabbage field - geograph.org.uk - 6601083.jpg*, Neil Theasby, CC BY-SA 2.0 — <https://commons.wikimedia.org/wiki/File:Individual_cabbage_in_a_cabbage_field_-_geograph.org.uk_-_6601083.jpg>
- **chouette** (`barnowl.jpg`) — *Western Barn Owl (Tyto alba)*, caroline legg, CC-BY — <https://www.inaturalist.org/photos/165796939>
- **cigale** (`cicada.jpg`) — *Common Cicada (Lyristes plebejus)*, jasius, CC-BY-NC — <https://www.inaturalist.org/photos/351231745>
- **cigogne** (`stork.jpg`) — *White Stork (Ciconia ciconia)*, xulescu_g, CC-BY-SA — <https://www.inaturalist.org/photos/269104502>
- **citron** (`lemon.jpg`) — *Lemon.jpg*, André Karwath aka Aka, CC BY-SA 2.5 — <https://commons.wikimedia.org/wiki/File:Lemon.jpg>
- **citrouille** (`pumpkin.jpg`) — *500px photo (233156695).jpeg*, Matt Longmire, CC BY 3.0 — <https://commons.wikimedia.org/wiki/File:500px_photo_(233156695).jpeg>
- **clémentine** (`clementine.jpg`) — *Clementines whole, peeled, half and sectioned.jpg*, carol, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Clementines_whole,_peeled,_half_and_sectioned.jpg>
- **cloporte** (`woodlouse.jpg`) — *Common Shiny Woodlouse (Oniscus asellus)*, Katja Schulz, CC-BY — <https://www.inaturalist.org/photos/2954551>
- **coccinelle** (`ladybug.jpg`) — *Seven-spotted Lady Beetle (Coccinella septempunctata)*, Thomas Shahan, CC-BY-NC — <https://www.inaturalist.org/photos/267168450>
- **cochon** (`pig.jpg`) — *Domestic Pig (Sus scrofa domesticus)*, 
Steven Lek, PD — <https://www.inaturalist.org/photos/267631414>
- **colibri** (`hummingbird.jpg`) — *Anna's Hummingbird (Calypte anna)*, Nancy Christensen, CC-BY-NC — <https://www.inaturalist.org/photos/358438292>
- **comète** (`comet.jpg`) — *Comet 2020 F3 (NEOWISE) on Jul 14 2020 aligned to stars.jpg*, SimgDe, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Comet_2020_F3_(NEOWISE)_on_Jul_14_2020_aligned_to_stars.jpg>
- **concombre** (`cucumber.jpg`) — *0106 komkommer sealed.jpg*, Frits weet het, CC BY 3.0 — <https://commons.wikimedia.org/wiki/File:0106_komkommer_sealed.jpg>
- **coq** (`rooster.jpg`) — *101C9183.JPG*, Au Domaine Des 3 Coqs, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:101C9183.JPG>
- **coquelicot** (`poppy.jpg`) — *common poppy (Papaver rhoeas)*, David Neale, CC-BY-NC — <https://www.inaturalist.org/photos/234132991>
- **corail** (`coral.jpg`) — *Acropora coral ffs.jpg*, Andy Collins, NOAA, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:Acropora_coral_ffs.jpg>
- **corbeau** (`crow.jpg`) — *Common Raven (Corvus corax)*, Tim Healy, CC-BY-NC — <https://www.inaturalist.org/photos/651411222>
- **crabe** (`crab.jpg`) — *Sally Lightfoot Crab (Grapsus grapsus)*, John Sullivan, CC-BY-NC — <https://www.inaturalist.org/photos/110627975>
- **cratère** (`crater.jpg`) — *Tycho LRO.png*, NASA, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:Tycho_LRO.png>
- **crêpe** (`crepe.jpg`) — *Crepes dsc07085.jpg*, David Monniaux, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Crepes_dsc07085.jpg>
- **crevette** (`shrimp.jpg`) — *Ambon Cleaner Shrimp (Lysmata amboinensis)*, Lucas Thompson, CC-BY-NC-SA — <https://www.inaturalist.org/photos/112849274>
- **cristal** (`crystal.jpg`) — *Amatista Laye 2.jpg*, Gonzalo Devia, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Amatista_Laye_2.jpg>
- **crocodile** (`crocodile.jpg`) — *Nile Crocodile (Crocodylus niloticus)*, David Roche, CC-BY-NC — <https://www.inaturalist.org/photos/545741360>
- **croissant** (`croissant.jpg`) — *00 Croissant. Yum.jpg*, Mark Mitchell, CC BY 2.0 — <https://commons.wikimedia.org/wiki/File:00_Croissant._Yum.jpg>
- **cuillère** (`spoon.jpg`) — *1129 Juego de cuchillo.jpg*, Museo Soumaya, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:1129_Juego_de_cuchillo.jpg>
- **cygne** (`swan.jpg`) — *Mute Swan (Cygnus olor)*, Mark Sikking, CC-BY-NC — <https://www.inaturalist.org/photos/264781420>
- **dauphin** (`dolphin.jpg`) — *Common Bottlenose Dolphin (Tursiops truncatus)*, Frank Krasovec, CC-BY-NC — <https://www.inaturalist.org/photos/611231392>
- **désert** (`desert.jpg`) — *Rub al Khali 002.JPG*, Nepenthes, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Rub_al_Khali_002.JPG>
- **dindon** (`turkey.jpg`) — *Wild Turkey (Meleagris gallopavo)*, Matt K, CC-BY-NC — <https://www.inaturalist.org/photos/31353610>
- **dromadaire** (`dromedary.jpg`) — *Dromedary Camel (Camelus dromedarius)*, Philipp salzgeber, CC-BY-NC — <https://www.inaturalist.org/photos/70717528>
- **éclair** (`lightning.jpg`) — *Lightning Pritzerbe 01 (MK).jpg*, Mathias Krumbholz, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Lightning_Pritzerbe_01_(MK).jpg>
- **éclipse** (`eclipse.jpg`) — *Solar eclipse 1999 4.jpg*, Luc Viatour, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Solar_eclipse_1999_4.jpg>
- **écureuil** (`squirrel.jpg`) — *Eurasian Red Squirrel (Sciurus vulgaris)*, Rhododendrites, CC-BY-SA — <https://www.inaturalist.org/photos/462357539>
- **élan** (`moose.jpg`) — *True Moose (Alces)*, Declan Troy, CC-BY-NC — <https://www.inaturalist.org/photos/335160686>
- **éléphant** (`elephant.jpg`) — *African Savanna Elephant (Loxodonta africana)*, eslone, CC-BY-NC — <https://www.inaturalist.org/photos/25191638>
- **épouvantail** (`scarecrow.jpg`) — *Kakashi2.jpg*, inconnu, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:Kakashi2.jpg>
- **escargot** (`snail.jpg`) — *Garden Snail (Cornu aspersum)*, Ferran Turmo Gort, CC-BY-NC-SA — <https://www.inaturalist.org/photos/16302570>
- **étoile** (`star.jpg`) — *Pleiades large.jpg*, NASA, ESA, AURA/Caltech, Palomar Observatory

The science team consists of: D. S, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:Pleiades_large.jpg>
- **étoile de mer** (`starfish.jpg`) — *Common Sea Star (Asterias rubens)*, ipat, CC-BY-NC-ND — <https://www.inaturalist.org/photos/111381060>
- **étoile filante** (`meteor.jpg`) — *Perseid Meteor Shower at Mojave National Preserve (51374983157) (cropped).jpg*, Jim Vajda from Oxford, Ohio, USA, CC BY 2.0 — <https://commons.wikimedia.org/wiki/File:Perseid_Meteor_Shower_at_Mojave_National_Preserve_(51374983157)_(cropped).jpg>
- **faisan** (`pheasant.jpg`) — *Ring-necked Pheasant (Phasianus colchicus)*, Frank Lin, CC-BY-NC — <https://www.inaturalist.org/photos/176733796>
- **faucon** (`falcon.jpg`) — *Peregrine Falcon (Falco peregrinus)*, Grigory Heaton, CC-BY-NC — <https://www.inaturalist.org/photos/330133179>
- **fennec** (`fennec.jpg`) — *Fennec Fox (Vulpes zerda)*, Tarek Nagah, CC-BY-NC — <https://www.inaturalist.org/photos/178694522>
- **feuille** (`leaf.jpg`) — *Lisc lipy.jpg*, Krzysztof P. Jasiutowicz, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Lisc_lipy.jpg>
- **flamant rose** (`flamingo.jpg`) — *Greater Flamingo (Phoenicopterus roseus)*, Pierre-Marie Epiney, CC-BY-SA — <https://www.inaturalist.org/photos/346681268>
- **flocon** (`snowflake.jpg`) — *Snowflake (lumehelves).jpg*, Janek Lass, CC BY 4.0 — <https://commons.wikimedia.org/wiki/File:Snowflake_(lumehelves).jpg>
- **forêt** (`forest.jpg`) — *- panoramio (4047).jpg*, tomyst, CC BY 3.0 — <https://commons.wikimedia.org/wiki/File:-_panoramio_(4047).jpg>
- **fourmi** (`ant.jpg`) — *rufa-group Wood Ants (Formica rufa)*, no rights reserved, CC0 — <https://www.inaturalist.org/photos/284616242>
- **fourmilier** (`anteater.jpg`) — *Giant Anteater (Myrmecophaga tridactyla)*, João Vitor Andriola, CC-BY-NC — <https://www.inaturalist.org/photos/76788283>
- **fraise** (`strawberry.jpg`) — *2015-365-149 Where Do Those Monsters Grow? (18255992275).jpg*, cogdogblog, CC BY 2.0 — <https://commons.wikimedia.org/wiki/File:2015-365-149_Where_Do_Those_Monsters_Grow%3F_(18255992275).jpg>
- **framboise** (`raspberry.jpg`) — *-365 june raspberries (27599222722).jpg*, terri_bateman, CC0 — <https://commons.wikimedia.org/wiki/File:-365_june_raspberries_(27599222722).jpg>
- **frelon** (`hornet.jpg`) — *European Hornet (Vespa crabro)*, Jürgen Mangelsdorf, CC-BY-NC-ND — <https://www.inaturalist.org/photos/55845563>
- **frites** (`fries.jpg`) — *French Fries.JPG*, StockSnap, CC0 — <https://commons.wikimedia.org/wiki/File:French_Fries.JPG>
- **fromage** (`cheese.jpg`) — *Cowgirl Creamery Point Reyes - Red Hawk cheese.jpg*, Frank Schulenburg, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Cowgirl_Creamery_Point_Reyes_-_Red_Hawk_cheese.jpg>
- **fusée** (`rocket.jpg`) — *Apollo 11 Launch - GPN-2000-000630.jpg*, NASA, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:Apollo_11_Launch_-_GPN-2000-000630.jpg>
- **galaxie** (`galaxy.jpg`) — *M31-Andromede-16-09-2023-Hamois.jpg*, Lviatour, CC BY-SA 2.5 — <https://commons.wikimedia.org/wiki/File:M31-Andromede-16-09-2023-Hamois.jpg>
- **gâteau** (`cake.jpg`) — *- panoramio (7).jpg*, claareee, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:-_panoramio_(7).jpg>
- **gaufre** (`waffle.jpg`) — *Waffles with Strawberries.jpg*, Parkerman &amp; Christie from San Diego, USA, CC BY 2.0 — <https://commons.wikimedia.org/wiki/File:Waffles_with_Strawberries.jpg>
- **gazelle** (`gazelle.jpg`) — *Thomson's Gazelle (Eudorcas thomsonii)*, Nancy Christensen, CC-BY-NC — <https://www.inaturalist.org/photos/132041009>
- **geai** (`jay.jpg`) — *Eurasian Jay (Garrulus glandarius)*, Luc Viatour, CC-BY-SA — <https://www.inaturalist.org/photos/168146456>
- **geyser** (`geyser.jpg`) — *Strokkur Geysir (14135319580) (cropped).jpg*, Christoph Strässler from Oberdorf BL, Schweiz, CC BY-SA 2.0 — <https://commons.wikimedia.org/wiki/File:Strokkur_Geysir_(14135319580)_(cropped).jpg>
- **girafe** (`giraffe.jpg`) — *South African Giraffe (Giraffa giraffa giraffa)*, Ray in Manila, CC-BY — <https://www.inaturalist.org/photos/115213140>
- **glace** (`icecream.jpg`) — *Strawberry ice cream cone (5076899310).jpg*, TheCulinaryGeek from Chicago, USA, CC BY 2.0 — <https://commons.wikimedia.org/wiki/File:Strawberry_ice_cream_cone_(5076899310).jpg>
- **glacier** (`glacier.jpg`) — *Aialik Glacier from a boat.jpg*, RndmCrs, CC0 — <https://commons.wikimedia.org/wiki/File:Aialik_Glacier_from_a_boat.jpg>
- **gland** (`acorn.jpg`) — *Acorn (2881856339).jpg*, Randi Hausken from Bærum, Norway, CC BY-SA 2.0 — <https://commons.wikimedia.org/wiki/File:Acorn_(2881856339).jpg>
- **gorille** (`gorilla.jpg`) — *Western Gorilla (Gorilla gorilla)*, Recherche Monitoring, CC-BY-NC — <https://www.inaturalist.org/photos/337066706>
- **grenade** (`pomegranate.jpg`) — *Pomegranate Juice (2019).jpg*, Augustus Binu : flickr, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Pomegranate_Juice_(2019).jpg>
- **grenouille** (`frog.jpg`) — *European Common Frog (Rana temporaria)*, H. Krisp, CC-BY — <https://www.inaturalist.org/photos/54599133>
- **grillon** (`cricket.jpg`) — *European Field Cricket (Gryllus campestris)*, Ryszard, CC-BY-NC — <https://www.inaturalist.org/photos/157317382>
- **groseille** (`redcurrant.jpg`) — *Redcurrant (Ribes rubrum) fruits.jpg*, Ivar Leidus, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Redcurrant_(Ribes_rubrum)_fruits.jpg>
- **grotte** (`cave.jpg`) — *Lechuguilla Cave Pearlsian Gulf.jpg*, Dave Bunnell / Under Earth Images, CC BY-SA 2.5 — <https://commons.wikimedia.org/wiki/File:Lechuguilla_Cave_Pearlsian_Gulf.jpg>
- **guépard** (`cheetah.jpg`) — *Cheetah (Acinonyx jubatus)*, Irene Domhoff, CC-BY-NC — <https://www.inaturalist.org/photos/57582224>
- **guêpe** (`wasp.jpg`) — *Common European Yellowjacket (Vespula vulgaris)*, Jakob Fahr, CC-BY-NC — <https://www.inaturalist.org/photos/6661326>
- **guimauve** (`marshmallow.jpg`) — *White Marshmallows.jpg*, John Morgan, CC BY 2.0 — <https://commons.wikimedia.org/wiki/File:White_Marshmallows.jpg>
- **hamster** (`hamster.jpg`) — *Golden Hamster (Mesocricetus auratus)*, Sqrt, CC-BY — <https://www.inaturalist.org/photos/147106686>
- **hanneton** (`cockchafer.jpg`) — *Common Cockchafer (Melolontha melolontha)*, Gilles San Martin, CC-BY-SA — <https://www.inaturalist.org/photos/128069579>
- **hérisson** (`hedgehog.jpg`) — *Common Hedgehog (Erinaceus europaeus)*, Caiden, CC-BY-NC — <https://www.inaturalist.org/photos/604670731>
- **héron** (`heron.jpg`) — *Grey Heron (Ardea cinerea)*, Anton Dangl, CC-BY-NC — <https://www.inaturalist.org/photos/334606225>
- **hibou** (`owl.jpg`) — *Typical Eagle-Owls and Horned Owls (Bubo)*, Rigoberto Yáñez, CC-BY-NC — <https://www.inaturalist.org/photos/32660415>
- **hippocampe** (`seahorse.jpg`) — *Common Seahorse (Hippocampus kuda)*, seahorses_of_the_world, CC-BY-NC — <https://www.inaturalist.org/photos/49705000>
- **hippopotame** (`hippo.jpg`) — *Common Hippopotamus (Hippopotamus amphibius)*, Michael Barth, CC-BY-NC — <https://www.inaturalist.org/photos/294638919>
- **hirondelle** (`swallow.jpg`) — *Barn Swallow (Hirundo rustica)*, Ad Konings, CC-BY-NC — <https://www.inaturalist.org/photos/122469139>
- **homard** (`lobster.jpg`) — *European lobster (Homarus gammarus)*, luismartinezartola, CC-BY-NC — <https://www.inaturalist.org/photos/88240797>
- **huître** (`oyster.jpg`) — *Crassostrea gigas p1040848.jpg*, David Monniaux, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Crassostrea_gigas_p1040848.jpg>
- **hyène** (`hyena.jpg`) — *Spotted Hyena (Crocuta crocuta)*, pgkaestner, CC-BY-NC — <https://www.inaturalist.org/photos/117295967>
- **iceberg** (`iceberg.jpg`) — *Iceberg in the Arctic with its underside exposed.jpg*, AWeith, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Iceberg_in_the_Arctic_with_its_underside_exposed.jpg>
- **iguane** (`iguana.jpg`) — *Green Iguana (Iguana iguana)*, Rainer Hungershausen, CC-BY-NC-ND — <https://www.inaturalist.org/photos/356025444>
- **île** (`island.jpg`) — *500px photo (39601158).jpeg*, Jorge Cortell, CC BY 3.0 — <https://commons.wikimedia.org/wiki/File:500px_photo_(39601158).jpeg>
- **jaguar** (`jaguar.jpg`) — *Jaguar (Panthera onca)*, rdwilcox51, CC-BY-NC — <https://www.inaturalist.org/photos/51015966>
- **Jupiter** (`jupiter.jpg`) — *Jupiter OPAL 2024.png*, NASA/STSCI (S.T.A.R.S), PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:Jupiter_OPAL_2024.png>
- **kangourou** (`kangaroo.jpg`) — *Red Kangaroo (Osphranter rufus)*, Dianne Clarke, CC-BY-NC — <https://www.inaturalist.org/photos/195432418>
- **kiwi** (`kiwi.jpg`) — *Kiwi Kaleidoscope Nature's Circular Elegance by Raju C Reddy.jpg*, rajucreddy, CC0 — <https://commons.wikimedia.org/wiki/File:Kiwi_Kaleidoscope_Nature%27s_Circular_Elegance_by_Raju_C_Reddy.jpg>
- **koala** (`koala.jpg`) — *Koala (Phascolarctos cinereus)*, Aidan, CC-BY-NC — <https://www.inaturalist.org/photos/212767739>
- **lac** (`lake.jpg`) — *Lake Idro Italy 2005-08-16.jpg*, No machine-readable author provided. Marius~commonswiki assumed (based on copyri, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Lake_Idro_Italy_2005-08-16.jpg>
- **lait** (`milk.jpg`) — *Agregace micel kaseinu v mléce při změně pH přidáním kyseliny octové.jpg*, ZuzanaBrabcova, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Agregace_micel_kaseinu_v_ml%C3%A9ce_p%C5%99i_zm%C4%9Bn%C4%9B_pH_p%C5%99id%C3%A1n%C3%ADm_kyseliny_octov%C3%A9.jpg>
- **lama** (`llama.jpg`) — *Llama (Lama glama)*, Lucyin, CC-BY-SA — <https://www.inaturalist.org/photos/188007033>
- **lamantin** (`manatee.jpg`) — *West Indian Manatee (Trichechus manatus)*, Szecska, CC-BY-NC-SA — <https://www.inaturalist.org/photos/9596501>
- **lapin** (`rabbit.jpg`) — *European Rabbit (Oryctolagus cuniculus)*, jitensha2021, CC-BY-NC — <https://www.inaturalist.org/photos/520690657>
- **lavande** (`lavender.jpg`) — *Common Lavender (Lavandula angustifolia)*, epicnom, CC-BY-NC — <https://www.inaturalist.org/photos/157057>
- **lémurien** (`lemur.jpg`) — *Ring-tailed Lemur (Lemur catta)*, Tambako The Jaguar, CC-BY-ND — <https://www.inaturalist.org/photos/25492>
- **léopard** (`leopard.jpg`) — *Leopard (Panthera pardus)*, janaohrner, CC-BY-NC — <https://www.inaturalist.org/photos/8666580>
- **lézard** (`lizard.jpg`) — *Common Wall Lizard (Podarcis muralis)*, Marek R. Swadzba, CC-BY-NC — <https://www.inaturalist.org/photos/349199966>
- **libellule** (`dragonfly.jpg`) — *Blue Emperor (Anax imperator)*, Alain Roujas, CC-BY-NC — <https://www.inaturalist.org/photos/201497583>
- **lièvre** (`hare.jpg`) — *Brown Hare (Lepus europaeus)*, Paul Cools, CC-BY-NC — <https://www.inaturalist.org/photos/1843520>
- **limace** (`slug.jpg`) — *Red Slug in Marburg Hessen Germany.jpg*, © Colin Erickson, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Red_Slug_in_Marburg_Hessen_Germany.jpg>
- **lion** (`lion.jpg`) — *Roaring Cats (Panthera)*, mikeloomis, CC-BY-NC — <https://www.inaturalist.org/photos/30922818>
- **litchi** (`lychee.jpg`) — *Litchi chinensis fruits.JPG*, B.navez, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Litchi_chinensis_fruits.JPG>
- **loup** (`wolf.jpg`) — *Gray Wolf (Canis lupus)*, Ryan O'Donnell, CC-BY-NC — <https://www.inaturalist.org/photos/21371987>
- **loutre** (`otter.jpg`) — *Eurasian Otter (Lutra lutra)*, Cloudtail the Snow Leopard, CC-BY-NC-ND — <https://www.inaturalist.org/photos/150213353>
- **lune** (`moon.jpg`) — *FullMoon2010.jpg*, Gregory H. Revera, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:FullMoon2010.jpg>
- **lynx** (`lynx.jpg`) — *Eurasian Lynx (Lynx lynx)*, Julia Moning, CC-BY — <https://www.inaturalist.org/photos/246545275>
- **macareux** (`puffin.jpg`) — *Atlantic Puffin (Fratercula arctica)*, Jackson W.F. Chu, CC-BY-NC-SA — <https://www.inaturalist.org/photos/94420777>
- **macaron** (`macaron.jpg`) — *120329-A-ON889-050 (6896018536).jpg*, U.S. Army Corps of Engineers Norfolk District from United States, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:120329-A-ON889-050_(6896018536).jpg>
- **madeleine** (`madeleine.jpg`) — *A Shell Leines.jpg*, Miyuki Meinaka, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:A_Shell_Leines.jpg>
- **maïs** (`corn.jpg`) — *Klip kukuruza uzgojen u Međimurju (Croatia).JPG*, Silverije, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Klip_kukuruza_uzgojen_u_Me%C4%91imurju_(Croatia).JPG>
- **mangue** (`mango.jpg`) — *Mangos - single and halved.jpg*, Ivar Leidus, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Mangos_-_single_and_halved.jpg>
- **mante religieuse** (`mantis.jpg`) — *European Mantis (Mantis religiosa)*, Charles J. Sharp
, CC-BY-SA — <https://www.inaturalist.org/photos/264035768>
- **marguerite** (`daisy.jpg`) — *Leucanthemum vulgare 'Filigran' Flower 2200px.jpg*, Photo by and (c)2008 Derek Ramsey (Ram-Man).  Co-attribution must be given to th, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Leucanthemum_vulgare_%27Filigran%27_Flower_2200px.jpg>
- **marmotte** (`marmot.jpg`) — *Alpine Marmot (Marmota marmota)*, Marco Piga, CC-BY-NC — <https://www.inaturalist.org/photos/238850548>
- **marron** (`chestnut.jpg`) — *Conker.jpg*, Sharonkcooper at English Wikipedia, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Conker.jpg>
- **Mars** (`mars.jpg`) — *Hubble Sharpest View Of Mars*, NASA/JPL, DOMAINE PUBLIC (NASA) — <https://images.nasa.gov/details/PIA01249>
- **martin-pêcheur** (`kingfisher.jpg`) — *Common Kingfisher (Alcedo atthis)*, Frank Sengpiel, CC-BY — <https://www.inaturalist.org/photos/33183952>
- **méduse** (`jellyfish.jpg`) — *Common Moon Jelly (Aurelia aurita)*, Bianca Bahlert, CC-BY-NC — <https://www.inaturalist.org/photos/492583365>
- **melon** (`melon.jpg`) — *Cucumis melo var. reticulatus (photo by Scott Bauer).jpg*, USDA photo by Scott Bauer. Image Number K7355-11., PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:Cucumis_melo_var._reticulatus_(photo_by_Scott_Bauer).jpg>
- **Mercure** (`mercury.jpg`) — *Mercury in true color.jpg*, NASA/Johns Hopkins University Applied Physics Laboratory/Arizona State Universit, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:Mercury_in_true_color.jpg>
- **merle** (`blackbird.jpg`) — *Eurasian Blackbird (Turdus merula)*, Luiz Lapa, CC-BY — <https://www.inaturalist.org/photos/356885346>
- **mésange** (`bluetit.jpg`) — *Eurasian Blue Tit (Cyanistes caeruleus)*, rorygardner79, CC-BY-NC — <https://www.inaturalist.org/photos/41677354>
- **miel** (`honey.jpg`) — *-365 honey mar23 (25480652103).jpg*, terri_bateman, CC0 — <https://commons.wikimedia.org/wiki/File:-365_honey_mar23_(25480652103).jpg>
- **mille-pattes** (`millipede.jpg`) — *American Giant Millipede Complex (Narceus americanus)*, sebastiancaraballo, CC-BY-NC — <https://www.inaturalist.org/photos/20076496>
- **moineau** (`sparrow.jpg`) — *House Sparrow (Passer domesticus)*, hedera.baltica, CC-BY-SA — <https://www.inaturalist.org/photos/181802756>
- **monarque** (`monarch.jpg`) — *Monarch (Danaus plexippus)*, Alejandro Lopez, CC-BY-NC-SA — <https://www.inaturalist.org/photos/227923335>
- **montagne** (`mountain.jpg`) — *Matterhorn from Domhütte - 2.jpg*, Photo: chil, on Camptocamp.org
Derivative work:Zacharie Grossen, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Matterhorn_from_Domh%C3%BCtte_-_2.jpg>
- **morpho** (`morpho.jpg`) — *Morpho helenor peleides (Morpho helenor peleides)*, Ivo Antušek, CC-BY-NC — <https://www.inaturalist.org/photos/1589763>
- **morse** (`walrus.jpg`) — *Walrus (Odobenus rosmarus)*, Charles Young, CC-BY-NC-ND — <https://www.inaturalist.org/photos/65857>
- **mouche** (`fly.jpg`) — *Common House Fly (Musca domestica)*, no rights reserved, CC0 — <https://www.inaturalist.org/photos/79611144>
- **mouette** (`seagull.jpg`) — *Black-headed Gull (Chroicocephalus ridibundus)*, Sam Hambly, CC-BY-NC — <https://www.inaturalist.org/photos/248819610>
- **moule** (`mussel.jpg`) — *Blue Mussels (Mytilus edulis)*, Christine Morrow, CC-BY-NC — <https://www.inaturalist.org/photos/73540771>
- **moustique** (`mosquito.jpg`) — *House Mosquito Complex (Culex pipiens)*, gernotkunz, CC-BY-NC — <https://www.inaturalist.org/photos/80260716>
- **mouton** (`sheep.jpg`) — *Domestic Sheep (Ovis aries)*, Christopher Stephens, CC-BY-SA — <https://www.inaturalist.org/photos/632127459>
- **muffin** (`muffin.jpg`) — *2013. Фестиваль славянской культуры в Донецке 209.jpg*, Andrey Butko, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:2013._%D0%A4%D0%B5%D1%81%D1%82%D0%B8%D0%B2%D0%B0%D0%BB%D1%8C_%D1%81%D0%BB%D0%B0%D0%B2%D1%8F%D0%BD%D1%81%D0%BA%D0%BE%D0%B9_%D0%BA%D1%83%D0%BB%D1%8C%D1%82%D1%83%D1%80%D1%8B_%D0%B2_%D0%94%D0%BE%D0%BD%D0%B5%D1%86%D0%BA%D0%B5_209.jpg>
- **mûre** (`blackberry.jpg`) — *-2020-08-30 Punnet of foraged Blackberries, Trimingham, Norfolk (1).JPG*, Kolforn (Kolforn)
I'd appreciate if you could mail me (Kolforn@gmail.com) if you, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:-2020-08-30_Punnet_of_foraged_Blackberries,_Trimingham,_Norfolk_(1).JPG>
- **murène** (`moray.jpg`) — *Mediterranean Moray (Muraena helena)*, Bernat Garrigós, CC-BY-NC — <https://www.inaturalist.org/photos/54968435>
- **myrtille** (`blueberry.jpg`) — *Blueberries.jpg*, The original Uploader was Oven Fresh at English Wikipedia, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:Blueberries.jpg>
- **navette** (`shuttle.jpg`) — *STS120LaunchHiRes-edit1.jpg*, NASA; edited by jjron (tilt corrected), PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:STS120LaunchHiRes-edit1.jpg>
- **nébuleuse** (`nebula.jpg`) — *Planetary Nebula*, NASA GSFC, DOMAINE PUBLIC (NASA) — <https://images.nasa.gov/details/GSFC_20171208_Archive_e001465>
- **nénuphar** (`waterlily.jpg`) — *European White Waterlily (Nymphaea alba)*, Kristin A. Bakkegard, CC-BY-NC — <https://www.inaturalist.org/photos/169681028>
- **Neptune** (`neptune.jpg`) — *Neptune*, NASA/JPL, DOMAINE PUBLIC (NASA) — <https://images.nasa.gov/details/PIA02210>
- **noisette** (`hazelnut.jpg`) — *Hazelnuts (Corylus avellana) - whole with kernels.jpg*, Ivar Leidus, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Hazelnuts_(Corylus_avellana)_-_whole_with_kernels.jpg>
- **noix** (`walnut.jpg`) — *Walnuts - whole and open with halved kernel.jpg*, Ivar Leidus, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Walnuts_-_whole_and_open_with_halved_kernel.jpg>
- **nuage** (`cloud.jpg`) — *Img20050526 0007 en tannheim cumulus.jpg*, Glg, edited by User:drini, CC BY-SA 2.0 DE — <https://commons.wikimedia.org/wiki/File:Img20050526_0007_en_tannheim_cumulus.jpg>
- **oie** (`goose.jpg`) — *Domestic Goose.jpg*, JJ Harrison, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Domestic_Goose.jpg>
- **oignon** (`onion.jpg`) — *13-08-31-wien-redaktionstreffen-EuT-by-Bi-frie-025.jpg*, Bi-frie (talk), CC BY 3.0 — <https://commons.wikimedia.org/wiki/File:13-08-31-wien-redaktionstreffen-EuT-by-Bi-frie-025.jpg>
- **okapi** (`okapi.jpg`) — *Okapi (Okapia johnstoni)*, Idriss AYAYA, CC-BY-NC — <https://www.inaturalist.org/photos/35649248>
- **orang-outan** (`orangutan.jpg`) — *Bornean Orangutan (Pongo pygmaeus)*, Pirataber, CC-BY — <https://www.inaturalist.org/photos/62662319>
- **orange** (`orange.jpg`) — *Oranges - whole-halved-segment.jpg*, Ivar Leidus, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Oranges_-_whole-halved-segment.jpg>
- **orchidée** (`orchid.jpg`) — *Phalaenopsis (aka).jpg*, André Karwath aka Aka, CC BY-SA 2.5 — <https://commons.wikimedia.org/wiki/File:Phalaenopsis_(aka).jpg>
- **ornithorynque** (`platypus.jpg`) — *Platypus (Ornithorhynchus anatinus)*, Jono Dashper, CC-BY-NC — <https://www.inaturalist.org/photos/278342378>
- **orque** (`orca.jpg`) — *Orca (Orcinus orca)*, Sherry Kirkvold, CC-BY-NC — <https://www.inaturalist.org/photos/223550594>
- **otarie** (`sealion.jpg`) — *California Sea Lion (Zalophus californianus)*, Jennifer Digdigan, CC-BY-NC — <https://www.inaturalist.org/photos/11888923>
- **ours** (`bear.jpg`) — *Brown Bear (Ursus arctos)*, Валерия Ковалева, CC-BY — <https://www.inaturalist.org/photos/414075864>
- **ours polaire** (`polarbear.jpg`) — *Polar Bear (Ursus maritimus)*, Peter K, CC-BY-NC — <https://www.inaturalist.org/photos/102785980>
- **oursin** (`urchin.jpg`) — *Atlantic Purple Sea Urchin (Paracentrotus lividus)*, Sylvain Le Bris, CC-BY-NC — <https://www.inaturalist.org/photos/322561355>
- **pain** (`bread.jpg`) — *-365 FreshBread Mar10 (25751715811).jpg*, terri_bateman, CC BY 2.0 — <https://commons.wikimedia.org/wiki/File:-365_FreshBread_Mar10_(25751715811).jpg>
- **palmier** (`palmtree.jpg`) — *1859-Martinique.web.jpg*, Patrick Verdier, Free On Line Photos, COPYRIGHTED FREE USE — <https://commons.wikimedia.org/wiki/File:1859-Martinique.web.jpg>
- **panda** (`panda.jpg`) — *Giant Panda (Ailuropoda melanoleuca)*, 昆虫学liuye, CC-BY-NC — <https://www.inaturalist.org/photos/443566770>
- **panda roux** (`redpanda.jpg`) — *Red Panda (Ailurus fulgens)*, Joachim S. Müller, CC-BY-NC-SA — <https://www.inaturalist.org/photos/110641178>
- **paon** (`peacock.jpg`) — *Indian Peafowl (Pavo cristatus)*, Cloudtail the Snow Leopard, CC-BY-NC-ND — <https://www.inaturalist.org/photos/165318600>
- **paon-du-jour** (`peacockbutterfly.jpg`) — *European Peacock Butterfly (Aglais io)*, S. Rae, CC-BY — <https://www.inaturalist.org/photos/4710619>
- **papillon** (`butterfly.jpg`) — *Old World Swallowtail (Papilio machaon)*, Marcello Consolo, CC-BY-NC-SA — <https://www.inaturalist.org/photos/1317606>
- **paresseux** (`sloth.jpg`) — *Brown-throated Three-toed Sloth (Bradypus variegatus)*, Dean Thompson, CC-BY-NC — <https://www.inaturalist.org/photos/224996933>
- **pastèque** (`watermelon.jpg`) — *Watermelon001.jpg*, Don miraj, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Watermelon001.jpg>
- **pêche** (`peach.jpg`) — *20160624-AMS-LSC-9001 (55-seconds) (27524696944).jpg*, U.S. Department of Agriculture, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:20160624-AMS-LSC-9001_(55-seconds)_(27524696944).jpg>
- **pélican** (`pelican.jpg`) — *Great White Pelican (Pelecanus onocrotalus)*, David Kidwell, CC-BY-NC-SA — <https://www.inaturalist.org/photos/407844113>
- **perroquet** (`parrot.jpg`) — *Blue-and-yellow Macaw (Ara ararauna)*, Jorge Ralston, CC-BY-NC — <https://www.inaturalist.org/photos/77485182>
- **perruche** (`budgie.jpg`) — *Budgerigar (Melopsittacus undulatus)*, Joseph j7uy5, CC-BY-NC-SA — <https://www.inaturalist.org/photos/66388650>
- **phacochère** (`warthog.jpg`) — *Common Warthog (Phacochoerus africanus)*, Bernard DUPONT, CC-BY-SA — <https://www.inaturalist.org/photos/251735512>
- **phasme** (`stickinsect.jpg`) — *Indian Walking Stick (Carausius morosus)*, Christian Schwarz, CC-BY-NC — <https://www.inaturalist.org/photos/2402554>
- **phoque** (`seal.jpg`) — *Harbor Seal (Phoca vitulina)*, Dan Roach, CC-BY-NC — <https://www.inaturalist.org/photos/65060962>
- **pic vert** (`woodpecker.jpg`) — *Eurasian Green Woodpecker (Picus viridis)*, Andrea Poggi, CC-BY — <https://www.inaturalist.org/photos/242668015>
- **pie** (`magpie.jpg`) — *Eurasian Magpie (Pica pica)*, Agustín Povedano, CC-BY-NC-SA — <https://www.inaturalist.org/photos/103446096>
- **pieuvre** (`octopus.jpg`) — *Common Octopus (Octopus vulgaris)*, Pero Ugarković, CC-BY-NC — <https://www.inaturalist.org/photos/629729927>
- **pigeon** (`pigeon.jpg`) — *Rock Pigeon (Columba livia)*, Birds of Gilgit-Baltistan, CC-BY-SA — <https://www.inaturalist.org/photos/466776981>
- **pingouin** (`penguin.jpg`) — *Emperor Penguin (Aptenodytes forsteri)*, Martha de Jong-Lantink, CC-BY-NC-ND — <https://www.inaturalist.org/photos/7229>
- **pissenlit** (`dandelion.jpg`) — *common dandelion (Taraxacum officinale)*, Paul Reeves, CC-BY-NC-SA — <https://www.inaturalist.org/photos/23575133>
- **pizza** (`pizza.jpg`) — *Neapolitan pizza at Trappica (48701940197).jpg*, Bex Walton from London, England, CC BY 2.0 — <https://commons.wikimedia.org/wiki/File:Neapolitan_pizza_at_Trappica_(48701940197).jpg>
- **plage** (`beach.jpg`) — *10-star-fish-sea-beach-sand-wallpaper.jpg*, Hashm hady, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:10-star-fish-sea-beach-sand-wallpaper.jpg>
- **plume** (`feather.jpg`) — *2011-12-07 12-49-02-plume-paon-57f.jpg*, Thomas Bresson, CC BY 3.0 — <https://commons.wikimedia.org/wiki/File:2011-12-07_12-49-02-plume-paon-57f.jpg>
- **Pluton** (`pluto.jpg`) — *Pluto in True Color - High-Res.png*, NASA/Johns Hopkins University Applied Physics Laboratory/Southwest Research Inst, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:Pluto_in_True_Color_-_High-Res.png>
- **poire** (`pear.jpg`) — *Assumerpeer.JPG*, POMologische Vereniging Noord-Holland, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Assumerpeer.JPG>
- **poisson** (`fish.jpg`) — *Goldfish (Carassius auratus)*, tigress16, CC-BY-NC — <https://www.inaturalist.org/photos/555919820>
- **poisson-clown** (`clownfish.jpg`) — *Clown fish in the Andaman Coral Reef.jpg*, Ritiks, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Clown_fish_in_the_Andaman_Coral_Reef.jpg>
- **poisson-globe** (`pufferfish.jpg`) — *White-spotted Puffer (Arothron hispidus)*, Luis P. B., CC-BY-NC — <https://www.inaturalist.org/photos/487402233>
- **poivron** (`pepper.jpg`) — *Green-Yellow-Red-Pepper-2009.jpg*, Kham Tran - www.khamtran.com, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Green-Yellow-Red-Pepper-2009.jpg>
- **pomme** (`apple.jpg`) — *Red Apple.jpg*, Abhijit Tembhekar from Mumbai, India, CC BY 2.0 — <https://commons.wikimedia.org/wiki/File:Red_Apple.jpg>
- **pomme de pin** (`pinecone.jpg`) — *Pinus coulteri MHNT Cone.jpg*, Didier Descouens, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Pinus_coulteri_MHNT_Cone.jpg>
- **pomme de terre** (`potato.jpg`) — *110303 CNPP LSC 0413 (13065542084).jpg*, U.S. Department of Agriculture

Lance Chueng/Visual Information Specialist/USDA, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:110303_CNPP_LSC_0413_(13065542084).jpg>
- **poney** (`pony.jpg`) — *IcelandicHorseInWinter.jpg*, Andreas Tille, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:IcelandicHorseInWinter.jpg>
- **pop-corn** (`popcorn.jpg`) — *104 365 Popcorn (3520531694).jpg*, jon collier from waltham, ma, usa, CC BY-SA 2.0 — <https://commons.wikimedia.org/wiki/File:104_365_Popcorn_(3520531694).jpg>
- **porc-épic** (`porcupine.jpg`) — *Crested Porcupine (Hystrix cristata)*, Howard Chalkley, CC-BY-NC-ND — <https://www.inaturalist.org/photos/113319357>
- **poule** (`chicken.jpg`) — *Domestic Chicken (Gallus gallus domesticus)*, Svklimkin, CC-BY-SA — <https://www.inaturalist.org/photos/274681663>
- **poussin** (`chick.jpg`) — *California Quail Chick*, Sharon out hiking:), BY-NC-SA 2.0 — <https://www.flickr.com/photos/119714073@N07/54578488119>
- **prune** (`plum.jpg`) — *100227 ciruelas.JPG*, Luisfi, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:100227_ciruelas.JPG>
- **radis** (`radish.jpg`) — *Radishes*, Thad Zajdowicz, CC0 — <https://www.flickr.com/photos/40632439@N00/54730343759>
- **raie** (`manta.jpg`) — *Oceanic Manta Ray (Mobula birostris)*, Sarichia Cacciatore, CC-BY-NC — <https://www.inaturalist.org/photos/177202542>
- **raisin** (`grapes.jpg`) — *2021-08-24 23 06 08 Red, green and black table grapes at the Ramada by Wyndham Rochelle Park Near Paramus in Rochelle Park Township, Bergen County, New Jersey.jpg*, Famartin, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:2021-08-24_23_06_08_Red,_green_and_black_table_grapes_at_the_Ramada_by_Wyndham_Rochelle_Park_Near_Paramus_in_Rochelle_Park_Township,_Bergen_County,_New_Jersey.jpg>
- **raton laveur** (`raccoon.jpg`) — *Common Raccoon (Procyon lotor)*, Kat Halsey, CC-BY-NC — <https://www.inaturalist.org/photos/290431922>
- **renard** (`fox.jpg`) — *Typical Foxes (Vulpes)*, Joanne Muis Redwood, CC-BY-NC — <https://www.inaturalist.org/photos/6568074>
- **renne** (`reindeer.jpg`) — *Caribou (Rangifer tarandus)*, Amanda Graham, CC-BY-NC-ND — <https://www.inaturalist.org/photos/151118671>
- **requin** (`shark.jpg`) — *Great White Shark (Carcharodon carcharias)*, René Campbell, CC-BY-NC — <https://www.inaturalist.org/photos/31212995>
- **rhinocéros** (`rhino.jpg`) — *White Rhinoceros (Ceratotherium simum)*, copper, CC-BY-NC — <https://www.inaturalist.org/photos/14357926>
- **rivière** (`river.jpg`) — *Pirogue running on the Mekong at golden hour between Don Det and Don Khon Laos.jpg*, Basile Morin, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Pirogue_running_on_the_Mekong_at_golden_hour_between_Don_Det_and_Don_Khon_Laos.jpg>
- **rose** (`rose.jpg`) — *Roses, Mussoorie Mall Road.jpg*, Anoushka Trivedi, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Roses,_Mussoorie_Mall_Road.jpg>
- **rouge-gorge** (`robin.jpg`) — *European Robin (Erithacus rubecula)*, Jakob W., CC-BY-NC — <https://www.inaturalist.org/photos/331946615>
- **salade** (`salad.jpg`) — *Iceberg lettuce in SB.jpg*, en:User:Geographer, CC BY 1.0 — <https://commons.wikimedia.org/wiki/File:Iceberg_lettuce_in_SB.jpg>
- **sandwich** (`sandwich.jpg`) — *Bacon, lettuce, tomato, and avocado.jpg*, Jami430, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Bacon,_lettuce,_tomato,_and_avocado.jpg>
- **sanglier** (`boar.jpg`) — *Wild Boar (Sus scrofa)*, Carlos N. G. Bocos, CC-BY-NC — <https://www.inaturalist.org/photos/45828104>
- **sapin** (`firtree.jpg`) — *Abies nordmanniana (Uludag National Park, Turkey).jpg*, johngibson139, CC0 — <https://commons.wikimedia.org/wiki/File:Abies_nordmanniana_(Uludag_National_Park,_Turkey).jpg>
- **sardine** (`sardine.jpg`) — *003 Caixa d'arengades al Mercat del Ram de Vic.jpg*, Enric, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:003_Caixa_d%27arengades_al_Mercat_del_Ram_de_Vic.jpg>
- **satellite** (`satellite.jpg`) — *Two 3U CubeSats.jpg*, NASA, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:Two_3U_CubeSats.jpg>
- **Saturne** (`saturn.jpg`) — *Saturn global view from Cassini, rings open Better Colour.png*, NASA / JPL-Caltech / SSI / color composite by Gordan Ugarkovic, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:Saturn_global_view_from_Cassini,_rings_open_Better_Colour.png>
- **saumon** (`salmon.jpg`) — *Atlantic Salmon (Salmo salar)*, chirleu, CC-BY-NC — <https://www.inaturalist.org/photos/60703307>
- **sauterelle** (`grasshopper.jpg`) — *Great Green Bush-cricket (Tettigonia viridissima)*, Erik Lerbæk, CC-BY-NC — <https://www.inaturalist.org/photos/10607935>
- **scarabée** (`beetle.jpg`) — *European Rose Chafer (Cetonia aurata)*, Frank Deschandol, CC-BY-NC — <https://www.inaturalist.org/photos/61588023>
- **scorpion** (`scorpion.jpg`) — *Common Emperor Scorpion (Pandinus imperator)*, Jan Ebr &amp; Ivana Ebrová, CC-BY — <https://www.inaturalist.org/photos/344669761>
- **serpent** (`snake.jpg`) — *Common Watersnake (Nerodia sipedon)*, markkrist, CC-BY-NC — <https://www.inaturalist.org/photos/13608867>
- **singe** (`monkey.jpg`) — *Rhesus Macaque (Macaca mulatta)*, Markus  Lilje, CC-BY-NC-ND — <https://www.inaturalist.org/photos/8739674>
- **soleil** (`sun.jpg`) — *Pulses from the Sun*, NASA/SDO/AIA, DOMAINE PUBLIC (NASA) — <https://images.nasa.gov/details/PIA17669>
- **soupe** (`soup.jpg`) — *Asparagus soup (spargelsuppe).jpg*, Petar Milošević, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Asparagus_soup_(spargelsuppe).jpg>
- **souris** (`mouse.jpg`) — *Mouse white background.jpg*, Unknown authorUnknown author (original) / Ilmari Karonen (editing), PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:Mouse_white_background.jpg>
- **station spatiale** (`station.jpg`) — *The station pictured from the SpaceX Crew Dragon 5.jpg*, NASA, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:The_station_pictured_from_the_SpaceX_Crew_Dragon_5.jpg>
- **sucette** (`lollipop.jpg`) — *Farbenfrohe Lollipops, Austria.jpg*, Naturpuur, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Farbenfrohe_Lollipops,_Austria.jpg>
- **suricate** (`meerkat.jpg`) — *Meerkat (Suricata suricatta)*, 魔笛, CC-BY-NC — <https://www.inaturalist.org/photos/626719914>
- **tapir** (`tapir.jpg`) — *South American Tapir (Tapirus terrestris)*, Jens-Christian Svenning, CC-BY — <https://www.inaturalist.org/photos/73961577>
- **tarte** (`pie.jpg`) — *Blueberry Strawberry Fruit Tart 1 2016-05-23.jpg*, FASTILY, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Blueberry_Strawberry_Fruit_Tart_1_2016-05-23.jpg>
- **tasse** (`cup.jpg`) — *Teacup.png*, Rijksmuseum, CC0 — <https://commons.wikimedia.org/wiki/File:Teacup.png>
- **tatou** (`armadillo.jpg`) — *Southern Long-nosed Armadillo (Dasypus novemcinctus)*, javierluque89, CC-BY-NC — <https://www.inaturalist.org/photos/528221418>
- **taupe** (`mole.jpg`) — *European Mole (Talpa europaea)*, Bogdan V. Kryzhatyuk, CC-BY-NC-SA — <https://www.inaturalist.org/photos/79276172>
- **taureau** (`bull.jpg`) — *2010 - djurparken i Höör 035 (cropped).JPG*, Mikael Parkvall, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:2010_-_djurparken_i_H%C3%B6%C3%B6r_035_(cropped).JPG>
- **télescope** (`telescope.jpg`) — *Hubble 2009 close-up 2.jpg*, NASA, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:Hubble_2009_close-up_2.jpg>
- **Terre** (`earth.jpg`) — *Blue Marble, Eastern Hemisphere March 2014*, NASA GSFC, DOMAINE PUBLIC (NASA) — <https://images.nasa.gov/details/GSFC_20171208_Archive_e001016>
- **têtard** (`tadpole.jpg`) — *RanaTemporariaLarva2.jpg*, Viridiflavus, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:RanaTemporariaLarva2.jpg>
- **tigre** (`tiger.jpg`) — *Roaring Cats (Panthera)*, girishdv, CC-BY-NC — <https://www.inaturalist.org/photos/1902449>
- **toile d'araignée** (`spiderweb.jpg`) — *A classic circular form spider's web.jpg*, Stephencdickson, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:A_classic_circular_form_spider%27s_web.jpg>
- **tomate** (`tomato.jpg`) — *- panoramio - ✿ Vlinder ✿ (28).jpg*, ✿ Vlinder  ✿, CC BY 3.0 — <https://commons.wikimedia.org/wiki/File:-_panoramio_-_%E2%9C%BF_Vlinder_%E2%9C%BF_(28).jpg>
- **tornade** (`tornado.jpg`) — *F5 tornado Elie Manitoba 2007.jpg*, Justin Hobson (Justin1569 at English Wikipedia), CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:F5_tornado_Elie_Manitoba_2007.jpg>
- **tortue** (`turtle.jpg`) — *Hermann's Tortoise (Testudo hermanni)*, Roberto Sindaco, CC-BY-NC-SA — <https://www.inaturalist.org/photos/669249>
- **tortue de mer** (`seaturtle.jpg`) — *Green Sea Turtle (Chelonia mydas)*, Andresvilla92, CC-BY-SA — <https://www.inaturalist.org/photos/464187430>
- **toucan** (`toucan.jpg`) — *Toco Toucan (Ramphastos toco)*, Paul Steeves, CC-BY-NC — <https://www.inaturalist.org/photos/63281117>
- **tournesol** (`sunflower.jpg`) — *Common Sunflower (Helianthus annuus)*, Emily Scherer, CC-BY-NC — <https://www.inaturalist.org/photos/323768723>
- **tulipe** (`tulip.jpg`) — *Garden Tulip (Tulipa gesneriana)*, sustainablemanny, CC-BY-NC — <https://www.inaturalist.org/photos/282813232>
- **œuf** (`egg.jpg`) — *2 Huevos de distintas especies de gallinas.jpg*, MONUMENTA, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:2_Huevos_de_distintas_especies_de_gallinas.jpg>
- **Uranus** (`uranus.jpg`) — *Uranus as seen by NASA Voyager 2*, NASA/JPL-Caltech, DOMAINE PUBLIC (NASA) — <https://images.nasa.gov/details/PIA18182>
- **vache** (`cow.jpg`) — *Domestic Cattle (Bos taurus)*, jwillardz, CC-BY-NC — <https://www.inaturalist.org/photos/408007934>
- **vautour** (`vulture.jpg`) — *Eurasian Griffon (Gyps fulvus)*, Titouan Roguet, CC-BY-NC — <https://www.inaturalist.org/photos/181654370>
- **veau** (`calf.jpg`) — *Close-up photograph of a calf's head looking at the viewer in Don Det Laos.jpg*, Basile Morin, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Close-up_photograph_of_a_calf%27s_head_looking_at_the_viewer_in_Don_Det_Laos.jpg>
- **Vénus** (`venus.jpg`) — *Venus from Mariner 10.jpg*, NASA/JPL-Caltech, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:Venus_from_Mariner_10.jpg>
- **ver de terre** (`earthworm.jpg`) — *Nightcrawler (Lumbricus terrestris)*, tiskolin, CC-BY-NC — <https://www.inaturalist.org/photos/2746352>
- **verre** (`glass.jpg`) — *Bagare-med-varmt-vatten.jpeg*, Mehinger, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Bagare-med-varmt-vatten.jpeg>
- **volcan** (`volcano.jpg`) — *Augustine volcano Jan 24 2006 - Cyrus Read.jpg*, Cyrus Read
Geophysicist
USGS, Alaska Volcano Observatory

cread@usgs.gov, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:Augustine_volcano_Jan_24_2006_-_Cyrus_Read.jpg>
- **yak** (`yak.jpg`) — *Domestic Yak (Bos grunniens)*, Chriest, CC-BY-NC-SA — <https://www.inaturalist.org/photos/79366025>
- **zèbre** (`zebra.jpg`) — *Plains Zebra (Equus quagga)*, ispylifers, CC-BY-NC — <https://www.inaturalist.org/photos/159452856>
