#!/usr/bin/env python3
"""Regenerate src/share/placeNames.ts from the backend's ride seeds.

usage: build-place-names.py <backend checkout> <GeoNames cities15000.txt>
Ride and task names come from database/seeders/RideSeeder.php and
database/seeders/data/tasks.json. Parks, resorts and IP franchises are listed
here. Generic words (Bridge, Castle, Games...) are skipped so catalog names
like "Sand Castle" survive; anything ride-specific is kept.
"""
import json, re, sys, pathlib

be = pathlib.Path(sys.argv[1])
names = set()
src = (be / 'database/seeders/RideSeeder.php').read_text()
for m in re.finditer(r"'name' => (?:'((?:[^'\\]|\\.)*)'|\"([^\"]*)\")", src):
    names.add((m.group(1) or m.group(2)).replace("\\'", "'"))
for t in json.loads((be / 'database/seeders/data/tasks.json').read_text()):
    names.add(t['name'])

GENERIC = {
    'Bridge', 'Castle', 'Games', 'Cars', 'Spider', 'Snowball', 'Lighthouse', 'Midway', 'The Arch', 'The Globe',
    'The Theatre', 'Red Button', 'Shark Statue', 'StorePants', 'Walt Statue', 'Sky School', 'Secret Alley',
    'Fire Department', 'Discovery Center', 'Courthouse Square', 'Supercharged', 'Pirates', 'World of Water',
    'Hollywood Star', 'Universal Plaza', 'Smugglers', 'Mummy', 'Studio Tour', 'Cafe 4', 'Butter Drink',
    'Picture Perfect Waterfall', 'Award Wieners', 'Simpson Game', 'River Adventure', 'Thunder Falls Terrace',
    'Port Of Entry', 'Sonoma Terrace', 'Jurassic Entrance', 'Pixar Pier Entrance', 'Mario World', 'Super Silly',
    'Inside Out', 'Golden Zephyr', 'Mr. Lincoln', "Mel's", 'Pal-A-Round', 'Animal Actors',
}
PLACES = [
    # parks and resorts
    'Walt Disney World', 'Disney World', 'Disneyland Resort', 'Disneyland Park', 'Disneyland', 'Magic Kingdom', 'EPCOT',
    'Hollywood Studios', 'Animal Kingdom', 'California Adventure', 'Disney California Adventure',
    'Universal Studios Hollywood', 'Universal Studios Florida', 'Universal Studios', 'Universal Orlando',
    'Universal Hollywood', 'Universal', 'Epic Universe', 'Islands of Adventure', 'Volcano Bay', 'CityWalk',
    'Downtown Disney', 'Disney Springs', 'SeaWorld', 'Busch Gardens', 'Six Flags', "Knott's Berry Farm",
    'Legoland', 'Cedar Point', 'Disney', 'Orlando', 'Anaheim',
    # franchises and lands that pin a park
    'Harry Potter', 'Hogwarts', 'Diagon Alley', 'Star Wars', "Galaxy's Edge", 'Marvel', 'Avengers Campus',
    'Super Nintendo World', 'Nintendo', 'Pixar', 'Mickey', 'Minnie', 'Minion', 'Minions', 'Toy Story',
    'Jurassic Park', 'Jurassic World', 'Fantasyland', 'Tomorrowland', 'Frontierland', 'Adventureland',
    'Halloween Horror Nights', 'Horror Nights', 'HHN',
    # other US parks and resorts
    'Dollywood', 'Kings Island', 'Kings Dominion', 'Carowinds', 'Silver Dollar City', 'Hersheypark', 'Hershey Park', 'Knoebels',
    'Kennywood', 'Holiday World', "Canada's Wonderland", 'Great Wolf Lodge', 'Discovery Cove', 'Aquatica', 'Typhoon Lagoon',
    'Blizzard Beach', 'Worlds of Fun', 'Valleyfair', "Michigan's Adventure", 'Schlitterbahn', 'Kalahari', 'Gilroy Gardens',
    'Disneyland Paris', 'Tokyo Disney', 'Tokyo DisneySea', 'Hong Kong Disneyland', 'Shanghai Disney', 'Europa-Park', 'Efteling',
    'Universal Studios Japan', 'Universal Beijing', 'Islands of Adventure', 'Fun Spot', 'ICON Park', 'Gardaland',
    # US states (abbreviations live in usCities.ts STATE_CODES, matched case-sensitively)
    'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii',
    'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
    'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
    'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
    'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'SoCal', 'NorCal',
    'So Cal', 'Central Florida', 'Southern California', 'Bay Area',
    'Galaxys Edge', 'Galaxy Edge', 'Tron Lightcycle', 'Mine-Train', 'Mine Train', 'Pandora',
    'Kissimmee', 'Knotts Berry Farm', "Knott's", 'Knotts', 'Lake Buena Vista',
    # characters and rides the seeds don't spell out (panel r2-fasttrack)
    'Hagrid', 'Gringotts', 'Spider-Man', 'Spiderman', 'Mario Kart', 'Simpsons', 'Hogsmeade', 'Wizarding World',
    # Epic Universe rides
    'Stardust Racers', 'Mine-Cart Madness', 'Monsters Unchained', 'Battle at the Ministry', "Hiccup's Wing Gliders",
    "Dragon Racer's Rally", 'Fyre Drill', 'Curse of the Werewolf', "Yoshi's Adventure", "Bowser Jr. Challenge",
    'Constellation Carousel', 'Isle of Berk', 'Dark Universe', 'Celestial Park', 'Ministry of Magic',
    # Walt Disney World and Disneyland attractions not in the ride seeds
    'Seven Dwarfs Mine Train', 'Tiana\'s Bayou Adventure', 'Expedition Everest', 'Flight of Passage', 'Avatar',
    'Na\'vi River Journey', 'Kilimanjaro Safaris', 'Test Track', 'Guardians of the Galaxy', 'Cosmic Rewind',
    "Remy's Ratatouille Adventure", 'Frozen Ever After', 'Spaceship Earth', 'Tower of Terror', 'Rock n Roller Coaster',
    "Rock 'n' Roller Coaster", 'Slinky Dog Dash', 'Mickey & Minnie\'s Runaway Railway', 'Runaway Railway', 'Toy Story Land',
    'Peoplemover', 'PeopleMover', 'Carousel of Progress', 'Winnie the Pooh', 'Dumbo', 'Big Thunder',
    'Splash Mountain', 'Matterhorn', 'Indiana Jones', 'Radiator Springs', 'Cars Land', 'Pixar Place', 'Incredicoaster',
    'Mission: Breakout', 'Web Slingers', 'WEB SLINGERS', 'Soarin', 'Grizzly River', 'Jungle Cruise', 'Haunted Mansion',
    'Pirates of the Caribbean', 'Space Mountain', 'Tomorrowland Speedway', 'Astro Orbiter', 'Mad Tea Party',
    "Peter Pan's Flight", "It's a Small World", 'Small World', 'Liberty Square', 'Main Street', 'Cinderella Castle',
    'Sleeping Beauty Castle', 'Hollywood Rip Ride Rockit', 'Velocicoaster', 'Jurassic', 'Transformers', 'Minion',
    'Despicable Me', 'Kong', 'Hulk', 'Men in Black', 'E.T.', 'Fast & Furious', 'Fast and Furious', 'Shrek',
]
rides = sorted({n.strip() for n in names if n.strip() and n.strip() not in GENERIC and len(n.strip()) >= 4})
all_names = sorted(set(PLACES) | set(rides), key=lambda s: (-len(s), s.lower()))

# US cities (the same GeoNames cities15000 file HomeHuntZoneResolver labels zones from).
# A one-word city that is also an everyday word ("Mobile", "Surprise") is skipped unless it
# is a big metro (500k+) or near a park; catalog names were checked for collisions.
cities = set()
if len(sys.argv) > 2:
    words = {w.strip() for w in open('/usr/share/dict/words') if w.strip().islower()}
    for row in open(sys.argv[2], encoding='utf8'):
        r = row.rstrip('\n').split('\t')
        if r[8] != 'US':
            continue
        name = r[2] if r[2].isascii() else r[1]
        single = ' ' not in name and '-' not in name
        if single and name.lower() in words and int(r[14] or 0) < 500000:
            continue
        cities.add(name)
    cities |= {'Lakeland', 'Davenport', 'Kissimmee', 'Clermont', 'Ocoee', 'Sanford', 'Buena Park', 'Garden Grove', 'Fullerton',
               # resort towns and districts under 15k people next to the parks
               'Celebration', 'Windermere', 'Dr. Phillips', 'Dr Phillips', 'Doctor Phillips', 'Four Corners', 'ChampionsGate',
               'Champions Gate', 'Reunion', 'Bay Lake', 'Universal City', 'Burbank', 'Glendale', 'Pigeon Forge', 'Gatlinburg',
               'Sevierville', 'Branson', 'Sandusky', 'Mason', 'Valencia', 'Carlsbad', 'Williamsburg', 'Hershey'}
    # Abbreviated and spelled-out Saint/Fort/Mount forms ("St. Petersburg", "Ft Lauderdale", "Saint Pete").
    for name in list(cities):
        for a, alts in (('St. ', ('Saint ', 'St ')), ('Saint ', ('St. ', 'St ')), ('Fort ', ('Ft. ', 'Ft ')), ('Mount ', ('Mt. ', 'Mt '))):
            if name.startswith(a):
                for b in alts:
                    cities.add(b + name[len(a):])
    cities |= {'St. Pete', 'St Pete', 'Saint Pete'}
city_list = sorted(cities, key=lambda s: (-len(s), s.lower()))
import re as _re
# Catalog names a city/town word would eat ("Giant Celebration Cupcake", "Hollywood Pin"): kept whole.
root = pathlib.Path(__file__).resolve().parents[2]
fixture = json.loads((root / 'tools/tests/fixtures/share-catalog-names.json').read_text())
catalog = sorted({n for k, v in fixture.items() if k != 'note' for n in v})
city_rx = _re.compile(r'(^|[^A-Za-z0-9])(' + '|'.join(_re.escape(c) for c in city_list) + r')(?=$|[^A-Za-z0-9])', _re.I) if city_list else None
safe = [n for n in catalog if city_rx and city_rx.search(n)]
STATE_CODES = ['AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'IA', 'ID', 'IL', 'KS', 'KY', 'LA', 'MA', 'MD', 'MI', 'MN', 'MO',
               'MS', 'MT', 'NC', 'ND', 'NE', 'NH', 'NJ', 'NM', 'NV', 'NY', 'NYC', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VT',
               'WA', 'WI', 'WV', 'WY', 'DC', 'L.A.', 'N.Y.', 'D.C.']
(root / 'src/share/usCities.ts').write_text(
    '/** US cities and towns (GeoNames cities15000, filtered, plus resort towns: see tools/share-studio/build-place-names.py). Never on a card. Do not edit by hand. */\n'
    'export const US_CITIES: readonly string[] = ' + json.dumps(city_list, ensure_ascii=False) + ';\n\n'
    '/** State and city abbreviations, matched case-sensitively (IN, OR, ME, OK, HI, OH are left out: they are words). */\n'
    'export const STATE_CODES: readonly string[] = ' + json.dumps(STATE_CODES) + ';\n\n'
    '/** Catalog names that contain a town word and are kept whole (tools/tests/fixtures/share-catalog-names.json). */\n'
    'export const CITY_SAFE_NAMES: readonly string[] = ' + json.dumps(safe, ensure_ascii=False) + ';\n')
print('city-safe catalog names:', safe)
print(f'{len(city_list)} US cities')

out = pathlib.Path(__file__).resolve().parents[2] / 'src/share/placeNames.ts'
city_lower = {c.lower() for c in city_list}
# A bare city lives in usCities.ts (matched with its North/Saint/Bay forms), not here.
all_names = [n for n in all_names if n.lower() not in city_lower]
body = ',\n'.join(f'  {json.dumps(n)}' for n in all_names)
out.write_text(f'''/**
 * Park, resort, land, franchise and ride names that must never print on a flex
 * card (CONTRACT.md section 4). Generated by tools/share-studio/build-place-names.py
 * from the backend ride seeds; longest first so "Revenge of the Mummy" goes
 * before any shorter overlap. Do not edit by hand.
 */
export const PLACE_NAMES: readonly string[] = [
{body},
];
''')
print(f'{len(all_names)} names -> {out}')
