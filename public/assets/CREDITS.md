# Crédits des assets

Tous les visuels de ce dossier viennent de **[Kenney](https://kenney.nl)** et sont
publiés en **CC0 1.0 (domaine public)** : utilisation libre, y compris
commerciale, sans obligation d'attribution. On cite quand même, c'est la moindre
des choses — ce travail est offert.

- **Animal Pack Remastered** — <https://kenney.nl/assets/animal-pack-remastered>
- **Platformer Art Deluxe** — <https://kenney.nl/assets/platformer-art-deluxe>
- **Background Elements** — <https://kenney.nl/assets/background-elements>
- **Fish Pack** — <https://kenney.nl/assets/fish-pack>
- **Food Kit (3D)** — <https://kenney.nl/assets/food-kit>
- **Impact Sounds** — <https://kenney.nl/assets/impact-sounds>
- **Holiday Kit (3D)** — <https://kenney.nl/assets/holiday-kit>
- **Space Kit (3D)** — <https://kenney.nl/assets/space-kit>
- **Nature Kit (3D)** — <https://kenney.nl/assets/nature-kit>
- **RPG Audio** — <https://kenney.nl/assets/rpg-audio>
- **Interface Sounds** — <https://kenney.nl/assets/interface-sounds>

Les planches ont été **triées** : on ne garde que les sprites réellement utilisés
par les jeux. Pour en ajouter, modifier `scripts/import-assets.mjs` et le
relancer.

## Espace et géographie

- **La Terre** (`space/earth.jpg`, `geo/earth.jpg`) : NASA Blue Marble, *Visible Earth*
  (<https://visibleearth.nasa.gov>), domaine public.
- **Mercure, Vénus, la Lune, Mars, Jupiter, Saturne et ses anneaux, Uranus, Neptune,
  le Soleil** (`space/*.jpg`) : textures de **Solar System Scope**
  (<https://www.solarsystemscope.com/textures/>), licence **CC BY 4.0**,
  récupérées via Wikimedia Commons et réduites à 1024×512.
- **Pays et continents** (`geo/countries-110m.json`) : Natural Earth via
  `world-atlas` (<https://github.com/topojson/world-atlas>), domaine public.
- **Régions de France** (`geo/regions.geojson`) : IGN Admin Express via
  `france-geojson` de Grégoire David (<https://github.com/gregoiredavid/france-geojson>),
  Licence Ouverte Etalab.

## Photos des jeux d'images

Les imagiers — **l'Intrus**, **Memory**, la **Chasse aux lettres** et **Le
Marché** — n'utilisent QUE de vraies photographies : le père ne voulait pas
voir deux styles dans l'app. Les animaux viennent d'**iNaturalist** (photos
identifiées par l'espèce), le reste des **catégories de Wikimedia Commons** ;
tout est ramené au même moule à l'import (carré, 512 px) par
`scripts/import-photos.mjs`.

L'app est privée, familiale et sans usage commercial : les licences non
commerciales (CC BY-NC) sont donc acceptées, et créditées comme les autres.
La liste fait foi dans `public/assets/photos/CREDITS.json`.

- **ananas** (`pineapple.jpg`) — *Ananas.comosus1web.jpg*, Forest Starr &amp; Kim Starr, CC BY 3.0 — <https://commons.wikimedia.org/wiki/File:Ananas.comosus1web.jpg>
- **assiette** (`plate.jpg`) — *Botanical plate with spray of fruiting Indian Bean Tree MET DP-1687-038 (cropped).jpg*, Chelsea porcelain factory, CC0 — <https://commons.wikimedia.org/wiki/File:Botanical_plate_with_spray_of_fruiting_Indian_Bean_Tree_MET_DP-1687-038_(cropped).jpg>
- **aubergine** (`eggplant.jpg`) — *Des aubergines violettes.jpg*, BeraDigle, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Des_aubergines_violettes.jpg>
- **baguette** (`baguette.jpg`) — *9457French bagette 01.jpg*, Judgefloro, CC0 — <https://commons.wikimedia.org/wiki/File:9457French_bagette_01.jpg>
- **baleine** (`whale.jpg`) — *Humpback Whale (Megaptera novaeangliae)*, John Thorogood, CC-BY-NC — <https://www.inaturalist.org/photos/338733901>
- **banane** (`banana.jpg`) — *20150627-FFAS-LSC-0107*, USDAgov, PDM — <https://www.flickr.com/photos/41284017@N08/19047618349>
- **biscuit** (`cookie.jpg`) — *5-25-2025 Earl grey cookies with extra orange rind - 003.jpg*, Wheeler Cowperthwaite, CC BY 2.0 — <https://commons.wikimedia.org/wiki/File:5-25-2025_Earl_grey_cookies_with_extra_orange_rind_-_003.jpg>
- **brocoli** (`broccoli.jpg`) — *-2018-12-10 Broccoli, Trimingham (1).JPG*, Kolforn (Kolforn)
I'd appreciate if you could mail me (Kolforn@gmail.com) if you, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:-2018-12-10_Broccoli,_Trimingham_(1).JPG>
- **canard** (`duck.jpg`) — *Mallard (Anas platyrhynchos)*, anonymous, CC-BY-SA — <https://www.inaturalist.org/photos/95268822>
- **carotte** (`carrot.jpg`) — *13-08-31-wien-redaktionstreffen-EuT-by-Bi-frie-035.jpg*, Bi-frie (talk), CC BY 3.0 — <https://commons.wikimedia.org/wiki/File:13-08-31-wien-redaktionstreffen-EuT-by-Bi-frie-035.jpg>
- **casserole** (`pot.jpg`) — *2014-04-27 IMG 7338 최광모.JPG*, 최광모 (Choe Kwangmo), CC0 — <https://commons.wikimedia.org/wiki/File:2014-04-27_IMG_7338_%EC%B5%9C%EA%B4%91%EB%AA%A8.JPG>
- **cerf** (`deer.jpg`) — *Red Deer (Cervus elaphus)*, Jon J. Laysell, CC-BY-NC — <https://www.inaturalist.org/photos/25186445>
- **cerises** (`cherries.jpg`) — *- panoramio (3071).jpg*, dementevalexei, CC BY 3.0 — <https://commons.wikimedia.org/wiki/File:-_panoramio_(3071).jpg>
- **champignon** (`mushroom.jpg`) — *2013 Harvest Festival and Farmer's Market Outdoors Season Closure (20131122-NRCS-LSC-0068).jpg*, USDAgov, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:2013_Harvest_Festival_and_Farmer%27s_Market_Outdoors_Season_Closure_(20131122-NRCS-LSC-0068).jpg>
- **chat** (`cat.jpg`) — *Domestic Cat (Felis catus)*, capracornelius, CC-BY-NC — <https://www.inaturalist.org/photos/703856853>
- **cheval** (`horse.jpg`) — *Domestic Horse (Equus caballus)*, copper, CC-BY-NC — <https://www.inaturalist.org/photos/23672580>
- **chèvre** (`goat.jpg`) — *Domestic Goat (Capra hircus)*, Dan Foy, CC-BY-NC — <https://www.inaturalist.org/photos/138189496>
- **chien** (`dog.jpg`) — *Domestic Dog (Canis familiaris)*, Марина Горбунова-Ëлкина, CC-BY-NC — <https://www.inaturalist.org/photos/117465253>
- **chou** (`cabbage.jpg`) — *Individual cabbage in a cabbage field - geograph.org.uk - 6601083.jpg*, Neil Theasby, CC BY-SA 2.0 — <https://commons.wikimedia.org/wiki/File:Individual_cabbage_in_a_cabbage_field_-_geograph.org.uk_-_6601083.jpg>
- **citron** (`lemon.jpg`) — *Lemon.jpg*, André Karwath aka Aka, CC BY-SA 2.5 — <https://commons.wikimedia.org/wiki/File:Lemon.jpg>
- **citrouille** (`pumpkin.jpg`) — *500px photo (233156695).jpeg*, Matt Longmire, CC BY 3.0 — <https://commons.wikimedia.org/wiki/File:500px_photo_(233156695).jpeg>
- **cochon** (`pig.jpg`) — *Domestic Pig (Sus scrofa domesticus)*, 
Steven Lek, PD — <https://www.inaturalist.org/photos/267631414>
- **concombre** (`cucumber.jpg`) — *0106 komkommer sealed.jpg*, Frits weet het, CC BY 3.0 — <https://commons.wikimedia.org/wiki/File:0106_komkommer_sealed.jpg>
- **croissant** (`croissant.jpg`) — *00 Croissant. Yum.jpg*, Mark Mitchell, CC BY 2.0 — <https://commons.wikimedia.org/wiki/File:00_Croissant._Yum.jpg>
- **cuillère** (`spoon.jpg`) — *1129 Juego de cuchillo.jpg*, Museo Soumaya, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:1129_Juego_de_cuchillo.jpg>
- **éléphant** (`elephant.jpg`) — *African Savanna Elephant (Loxodonta africana)*, eslone, CC-BY-NC — <https://www.inaturalist.org/photos/25191638>
- **fraise** (`strawberry.jpg`) — *2015-365-149 Where Do Those Monsters Grow? (18255992275).jpg*, cogdogblog, CC BY 2.0 — <https://commons.wikimedia.org/wiki/File:2015-365-149_Where_Do_Those_Monsters_Grow%3F_(18255992275).jpg>
- **fromage** (`cheese.jpg`) — *Cowgirl Creamery Point Reyes - Red Hawk cheese.jpg*, Frank Schulenburg, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Cowgirl_Creamery_Point_Reyes_-_Red_Hawk_cheese.jpg>
- **gâteau** (`cake.jpg`) — *-365 shortcakes (27397449543).jpg*, terri_bateman, CC0 — <https://commons.wikimedia.org/wiki/File:-365_shortcakes_(27397449543).jpg>
- **girafe** (`giraffe.jpg`) — *South African Giraffe (Giraffa giraffa giraffa)*, Ray in Manila, CC-BY — <https://www.inaturalist.org/photos/115213140>
- **grenouille** (`frog.jpg`) — *European Common Frog (Rana temporaria)*, H. Krisp, CC-BY — <https://www.inaturalist.org/photos/54599133>
- **hérisson** (`hedgehog.jpg`) — *Common Hedgehog (Erinaceus europaeus)*, Caiden, CC-BY-NC — <https://www.inaturalist.org/photos/604670731>
- **hibou** (`owl.jpg`) — *Typical Eagle-Owls and Horned Owls (Bubo)*, Rigoberto Yáñez, CC-BY-NC — <https://www.inaturalist.org/photos/32660415>
- **lait** (`milk.jpg`) — *Agregace micel kaseinu v mléce při změně pH přidáním kyseliny octové.jpg*, ZuzanaBrabcova, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Agregace_micel_kaseinu_v_ml%C3%A9ce_p%C5%99i_zm%C4%9Bn%C4%9B_pH_p%C5%99id%C3%A1n%C3%ADm_kyseliny_octov%C3%A9.jpg>
- **lapin** (`rabbit.jpg`) — *European Rabbit (Oryctolagus cuniculus)*, jitensha2021, CC-BY-NC — <https://www.inaturalist.org/photos/520690657>
- **lion** (`lion.jpg`) — *Roaring Cats (Panthera)*, mikeloomis, CC-BY-NC — <https://www.inaturalist.org/photos/30922818>
- **maïs** (`corn.jpg`) — *Klip kukuruza uzgojen u Međimurju (Croatia).JPG*, Silverije, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Klip_kukuruza_uzgojen_u_Me%C4%91imurju_(Croatia).JPG>
- **miel** (`honey.jpg`) — *-365 honey mar23 (25480652103).jpg*, terri_bateman, CC0 — <https://commons.wikimedia.org/wiki/File:-365_honey_mar23_(25480652103).jpg>
- **mouton** (`sheep.jpg`) — *Domestic Sheep (Ovis aries)*, Christopher Stephens, CC-BY-SA — <https://www.inaturalist.org/photos/632127459>
- **muffin** (`muffin.jpg`) — *2013. Фестиваль славянской культуры в Донецке 209.jpg*, Andrey Butko, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:2013._%D0%A4%D0%B5%D1%81%D1%82%D0%B8%D0%B2%D0%B0%D0%BB%D1%8C_%D1%81%D0%BB%D0%B0%D0%B2%D1%8F%D0%BD%D1%81%D0%BA%D0%BE%D0%B9_%D0%BA%D1%83%D0%BB%D1%8C%D1%82%D1%83%D1%80%D1%8B_%D0%B2_%D0%94%D0%BE%D0%BD%D0%B5%D1%86%D0%BA%D0%B5_209.jpg>
- **œuf** (`egg.jpg`) — *2 Huevos de distintas especies de gallinas.jpg*, MONUMENTA, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:2_Huevos_de_distintas_especies_de_gallinas.jpg>
- **oignon** (`onion.jpg`) — *13-08-31-wien-redaktionstreffen-EuT-by-Bi-frie-025.jpg*, Bi-frie (talk), CC BY 3.0 — <https://commons.wikimedia.org/wiki/File:13-08-31-wien-redaktionstreffen-EuT-by-Bi-frie-025.jpg>
- **orange** (`orange.jpg`) — *Oranges - whole-halved-segment.jpg*, Ivar Leidus, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Oranges_-_whole-halved-segment.jpg>
- **ours** (`bear.jpg`) — *Brown Bear (Ursus arctos)*, Валерия Ковалева, CC-BY — <https://www.inaturalist.org/photos/414075864>
- **pain** (`bread.jpg`) — *-365 FreshBread Mar10 (25751715811).jpg*, terri_bateman, CC BY 2.0 — <https://commons.wikimedia.org/wiki/File:-365_FreshBread_Mar10_(25751715811).jpg>
- **papillon** (`butterfly.jpg`) — *Old World Swallowtail (Papilio machaon)*, Marcello Consolo, CC-BY-NC-SA — <https://www.inaturalist.org/photos/1317606>
- **pastèque** (`watermelon.jpg`) — *Watermelon001.jpg*, Don miraj, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Watermelon001.jpg>
- **pêche** (`peach.jpg`) — *20160624-AMS-LSC-9001 (55-seconds) (27524696944).jpg*, U.S. Department of Agriculture, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:20160624-AMS-LSC-9001_(55-seconds)_(27524696944).jpg>
- **perroquet** (`parrot.jpg`) — *Blue-and-yellow Macaw (Ara ararauna)*, Jorge Ralston, CC-BY-NC — <https://www.inaturalist.org/photos/77485182>
- **pingouin** (`penguin.jpg`) — *Emperor Penguin (Aptenodytes forsteri)*, Martha de Jong-Lantink, CC-BY-NC-ND — <https://www.inaturalist.org/photos/7229>
- **poire** (`pear.jpg`) — *Assumerpeer.JPG*, POMologische Vereniging Noord-Holland, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:Assumerpeer.JPG>
- **poisson** (`fish.jpg`) — *Goldfish (Carassius auratus)*, tigress16, CC-BY-NC — <https://www.inaturalist.org/photos/555919820>
- **pomme** (`apple.jpg`) — *Red Apple.jpg*, Abhijit Tembhekar from Mumbai, India, CC BY 2.0 — <https://commons.wikimedia.org/wiki/File:Red_Apple.jpg>
- **pomme de terre** (`potato.jpg`) — *110303 CNPP LSC 0413 (13065542084).jpg*, U.S. Department of Agriculture

Lance Chueng/Visual Information Specialist/USDA, PUBLIC DOMAIN — <https://commons.wikimedia.org/wiki/File:110303_CNPP_LSC_0413_(13065542084).jpg>
- **poule** (`chicken.jpg`) — *Domestic Chicken (Gallus gallus domesticus)*, Svklimkin, CC-BY-SA — <https://www.inaturalist.org/photos/274681663>
- **poussin** (`chick.jpg`) — *California Quail Chick*, Sharon out hiking:), BY-NC-SA 2.0 — <https://www.flickr.com/photos/119714073@N07/54578488119>
- **prune** (`plum.jpg`) — *100227 ciruelas.JPG*, Luisfi, CC BY-SA 3.0 — <https://commons.wikimedia.org/wiki/File:100227_ciruelas.JPG>
- **radis** (`radish.jpg`) — *Radishes*, Thad Zajdowicz, CC0 — <https://www.flickr.com/photos/40632439@N00/54730343759>
- **raisin** (`grapes.jpg`) — *2021-08-24 23 06 08 Red, green and black table grapes at the Ramada by Wyndham Rochelle Park Near Paramus in Rochelle Park Township, Bergen County, New Jersey.jpg*, Famartin, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:2021-08-24_23_06_08_Red,_green_and_black_table_grapes_at_the_Ramada_by_Wyndham_Rochelle_Park_Near_Paramus_in_Rochelle_Park_Township,_Bergen_County,_New_Jersey.jpg>
- **renard** (`fox.jpg`) — *Typical Foxes (Vulpes)*, Joanne Muis Redwood, CC-BY-NC — <https://www.inaturalist.org/photos/6568074>
- **serpent** (`snake.jpg`) — *Common Watersnake (Nerodia sipedon)*, markkrist, CC-BY-NC — <https://www.inaturalist.org/photos/13608867>
- **singe** (`monkey.jpg`) — *Rhesus Macaque (Macaca mulatta)*, Markus  Lilje, CC-BY-NC-ND — <https://www.inaturalist.org/photos/8739674>
- **tasse** (`cup.jpg`) — *Teacup.png*, Rijksmuseum, CC0 — <https://commons.wikimedia.org/wiki/File:Teacup.png>
- **tomate** (`tomato.jpg`) — *- panoramio - ✿ Vlinder ✿ (28).jpg*, ✿ Vlinder  ✿, CC BY 3.0 — <https://commons.wikimedia.org/wiki/File:-_panoramio_-_%E2%9C%BF_Vlinder_%E2%9C%BF_(28).jpg>
- **tortue** (`turtle.jpg`) — *Hermann's Tortoise (Testudo hermanni)*, Roberto Sindaco, CC-BY-NC-SA — <https://www.inaturalist.org/photos/669249>
- **vache** (`cow.jpg`) — *Domestic Cattle (Bos taurus)*, jwillardz, CC-BY-NC — <https://www.inaturalist.org/photos/408007934>
- **verre** (`glass.jpg`) — *Bagare-med-varmt-vatten.jpeg*, Mehinger, CC BY-SA 4.0 — <https://commons.wikimedia.org/wiki/File:Bagare-med-varmt-vatten.jpeg>
- **zèbre** (`zebra.jpg`) — *Plains Zebra (Equus quagga)*, ispylifers, CC-BY-NC — <https://www.inaturalist.org/photos/159452856>
