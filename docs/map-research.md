# Map research: Orchard Road to the Singapore River

The Orchard Wars map is built from real OpenStreetMap (OSM) data, so the streets, building
footprints, the river and the parks are where they really are. This note records what the map
covers, where the data comes from, and how the real geography is turned into turf.

## Area covered

| | |
| --- | --- |
| Bounding box | lat 1.2840 to 1.3080, lon 103.8215 to 103.8600 (`src/world/geo.ts`) |
| Size | about 4.3 km east–west by 2.7 km north–south (about 11.5 km²) |
| West edge | Tanglin Road / Tanglin Mall end of Orchard Road |
| East edge | Esplanade, Marina Bay and the mouth of the Singapore River |
| North edge | Cairnhill, Newton side of Scotts Road |
| South edge | Raffles Place, Boat Quay, Tiong Bahru and Chinatown's northern streets |
| World units | 1 unit = 1 metre; +x is east, +z is south |

What's in it (from the 15 Nov 2026 export): **5,226 buildings, 9,595 road segments, 49 water areas,
261 parks and green areas, 19 MRT stations.**

## Data source and pipeline

1. `npm run map:fetch` downloads BBBike's weekly OSM export of Singapore
   (`download.bbbike.org/osm/bbbike/Singapore/Singapore.osm.gz`, about 79 MB) and keeps only what
   is inside the bounding box: roads, buildings, water, parks, trees and MRT stations.
2. `npm run map:build` converts that into `public/data/map.json` (about 1.5 MB), the compact format
   the game loads (`src/world/mapData.ts`).

The Overpass API (overpass-api.de and mirrors) is the usual way to query OSM, but it refused or
timed out from the cloud machine, so the pipeline uses the full Singapore extract instead. It is
also faster and doesn't depend on a busy public server.

**Licence:** OSM data is © OpenStreetMap contributors under the ODbL. The game must show the credit
(it's in the bottom-right corner of the HUD) and the map data stays under the ODbL.

## The geography the game is built on

**Orchard Road** is the spine. It is one-way, 3–7 lanes, running south-east from Tanglin to
Dhoby Ghaut, with Orchard Boulevard running the other way just south of it. It is the natural
setting for car chases and the main shopping strip with the most expensive turf.

From west to east, the spine passes:

- **Tanglin**: hotels, embassies' edge, Tanglin Road junction.
- **Orchard** (MRT): the mall cluster around the Orchard Road / Paterson Road / Scotts Road
  junction. The data includes ION Orchard (40 m podium), Wisma Atria, Ngee Ann City, Paragon,
  Scotts Square (159 m) and the Hilton.
- **Somerset** (MRT): 313@Somerset, TripleOne Somerset, The Centrepoint, and the youth park and skate
  park beside the MRT.
- **Cairnhill / Emerald Hill**: quieter residential streets and shophouses north of the strip.
- **Dhoby Ghaut** (MRT): Plaza Singapura, The Cathay, Dhoby Ghaut Green. Orchard Road ends here.
  Three MRT lines meet here, making it the junction of the map.

Then the city drops towards the river:

- **Fort Canning**: a wooded hill (Fort Canning Park) between Dhoby Ghaut and the river. It is real
  high ground and a natural fortress. Note that the map has no terrain heights yet, so the hill is flat.
- **Bras Basah**: museums, schools and the National Library (90 m) along Bras Basah Road and
  Stamford Road.
- **City Hall / Civic District**: the Padang (a big open field), City Hall MRT, Raffles City,
  Capitol Singapore, Funan, and the courts (State Courts and the 178 m Court Tower). It is the
  seat of whoever claims to run the city.
- **Esplanade / Marina**: Esplanade Park, the theatres, Marina Square and Millenia Walk, Suntec
  City's towers (155 m) along Marina Bay and the reservoir.
- **Clarke Quay**: nightlife on the river bend, Read Bridge and the old warehouses.
- **Boat Quay / Raffles Place**: the shophouse strip on the river with the CBD towers right behind
  it, such as Singapore Land Tower (190 m) and One Raffles Place.
- **River Valley**: long residential roads (River Valley Road, Zion Road, Killiney Road)
  between Orchard and the river, and Great World.

### Natural choke points

- **Bridges over the Singapore River** (all in the data): Cavenagh, Anderson, Jubilee, Esplanade,
  Elgin, Coleman, Ord, Clemenceau, Pulau Saigon, Kim Seng, Zion, Delta and Read. Holding a
  bridge controls who crosses between the CBD and the north bank.
- **Fort Canning hill**: few ways in, which makes it a good hideout or base.
- **The Padang**: a wide open field in the middle of the Civic District, a natural battleground.
- **MRT stations** (Orchard, Somerset, Dhoby Ghaut, City Hall, Bras Basah, Esplanade, Clarke Quay,
  Raffles Place, Fort Canning, Bencoolen, Great World, Havelock, Orchard Boulevard, …) can be used as
  fast travel points or gang spawn points.
- **The river** itself is a route for boats, smuggling and the River Tide faction.

## Territories

The game splits the map into 41 territories anchored on the places above: 19 strongholds (the big
malls, the Esplanade and the Raffles Place towers) and 22 street turfs. The table of territories,
regions and starting gangs is in [game-design.md](game-design.md), and the data itself in
`src/game/data.ts`. Every point on the map belongs to the nearest anchor, so borders are adjusted by
moving anchors. The river is only crossable where a road (a bridge) crosses it.

## Names

The game uses real Singapore names for streets, neighbourhoods, parks, landmarks and malls (ION
Orchard, Ngee Ann City, Plaza Singapura, Raffles City…), at the owner's request. Street labels on
the map come straight from OSM. If the game is ever published commercially, check whether mall and
brand names need permission, or swap them for made-up names in `src/game/data.ts` (only the `name`
fields need to change).

## Scale and gameplay notes

- At 1:1 scale, walking the length of Orchard Road (about 2.6 km) takes about 7 minutes at
  sprinting speed. Cars will make the map feel the right size. If it feels too big, the simplest fix
  is a scale factor in `geo.ts` (e.g. 0.6) rather than editing the data.
- Building heights come from OSM `height` or `building:levels` where mapped. Elsewhere
  `tools/build-map.ts` guesses by building type (e.g. 36 m for flats, 12 m for others).
- Road tunnels (parts of the CTE) and underground MRT structures are left out.
- Next data steps: terrain height for Fort Canning, bus stops and traffic lights from OSM
  for traffic AI, and one-way information for cars (OSM has it: Orchard Road is tagged one-way).
