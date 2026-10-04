"""Subject lines for the 200 Home Hunt prep items (item-art v2).

Names and rarities mirror the backend seeders
(themeparkshark-backend/database/seeders/{Churro,Pretzel,Flashlight,Umbrella,CameraCrew}SetSeeder.php).
Every subject names the item's identifying parts so the art reads as its NAME,
not as a palette swap. Each set shares one locked pose so the collection book
grid stays cohesive. Rarity reads through the details (tier extras below).
"""

# ---- shared pose per set (keeps camera angle and silhouette scale consistent)
POSE = {
    'churros': ("single thick chunky churro, short and fat like a cartoon, standing diagonally and leaning about 30 "
                "degrees to the right, a star-ridged fried dough stick with deep grooves, its bottom third tucked in a plain white paper sleeve with one "
                "thin navy stripe"),
    'pretzels': ("single large soft pretzel in the classic three-hole twisted knot shape, seen from the front, "
                 "tilted very slightly"),
    'flashlights': ("single handheld flashlight lying on a diagonal with the lens head at the upper right and the "
                    "tail at the lower left, round lens, clear button on the body"),
    'umbrellas': ("single open umbrella seen from a slight three-quarter angle, domed canopy on top with eight "
                  "panels, straight shaft and a curved J-hook handle at the bottom"),
    'cameras': ("single chunky cartoon camera seen from a three-quarter front angle, big round lens barrel in the "
                "middle, shutter button and small flash on top, short wrist strap loop on the side"),
}

NOT = {
    'churros': "NOT a cigar, NOT a crayon, NOT a breadstick, NOT a log",
    'pretzels': "NOT a heart, NOT a bow, NOT a donut",
    'flashlights': "NOT a torch with fire, NOT a telescope, NOT a microphone, no light beam, no glow",
    'umbrellas': "NOT a parasol drink umbrella, NOT a mushroom, no raindrops, no background",
    'cameras': "NOT a compass, NOT a phone, NOT a video camera, no light flash burst",
}

# ---- rarity tiers: rarity must read through the details
TIER = {
    'common': "simple and clean, one tasty topping detail",
    'uncommon': "a little extra detail and one fun garnish",
    'rare': "fancier and more elaborate, layered toppings, a special shape detail",
    'epic': "premium and ornate, polished trim, tiny gem accents",
    'legendary': ("the fanciest of the whole set, premium gold trim, a special shape, a couple of crisp "
                  "four-point sparkle shapes around it"),
}

CHURROS = [
    ('churro_01', 'Classic Cinnamon', 'common', "golden churro rolled in cinnamon sugar with visible sugar crystals in the ridges, one cinnamon stick leaning beside it"),
    ('churro_02', 'Sugar Dusted', 'common', "pale golden churro heavily dusted with snowy white powdered sugar, a little puff of sugar falling off the tip"),
    ('churro_03', 'Honey Glazed', 'common', "churro coated in shiny amber honey glaze with honey drips running down the ridges, a small honeycomb piece on the tip"),
    ('churro_04', 'Brown Sugar', 'common', "churro coated in coarse sparkly light-brown sugar crystals, one brown sugar cube resting at the sleeve"),
    ('churro_05', 'Maple Swirl', 'common', "churro twisted into a spiral corkscrew shape with a maple syrup swirl drizzle and one small orange maple leaf"),
    ('churro_06', 'Vanilla Bean', 'common', "churro with a line of white vanilla cream piped along the top flecked with tiny black vanilla seeds, one dark vanilla bean pod beside it"),
    ('churro_07', 'Caramel Drizzle', 'common', "golden churro with bold zigzag lines of golden caramel drizzle across it"),
    ('churro_08', 'Dulce de Leche', 'common', "churro with a bitten-off top end showing a hollow center filled with creamy tan dulce de leche oozing out"),
    ('churro_09', 'Butterscotch', 'common', "churro dipped at the tip in a thick butterscotch dip, with two round golden butterscotch hard candies stuck on"),
    ('churro_10', 'Toasted Coconut', 'common', "churro coated all over in toasted golden-brown coconut flakes, a small half coconut shell beside the sleeve"),
    ('churro_11', 'Churro Original', 'common', "plain classic churro with bare golden fried ridges and no topping at all, simple and perfect"),
    ('churro_12', 'Cinnamon Toast', 'common', "churro in cinnamon sugar with little square cinnamon toast cereal pieces stuck along it"),
    ('churro_13', 'Golden Crisp', 'common', "extra crispy deep golden churro with crunchy flaky bubbles on its ridges and a crisp curled tip"),
    ('churro_14', 'Sweet Cream', 'common', "churro with its top half dipped in smooth white sweet cream glaze and a dollop of swirled cream on the tip"),
    ('churro_15', 'Salted Caramel', 'common', "churro with caramel drizzle and big white flaky sea salt crystals on top"),
    ('churro_16', 'Toffee Crunch', 'common', "churro rolled in chunky golden toffee bits, a few broken toffee shards poking out"),
    ('churro_17', 'Praline', 'common', "churro with a glossy praline glaze and three pecan halves on top"),
    ('churro_18', 'Snickerdoodle', 'common', "churro in cinnamon sugar with one round crackly snickerdoodle cookie pressed onto the tip"),
    ('churro_19', 'Biscoff', 'common', "churro with a brown spiced cookie butter drizzle and one plain rectangular spiced biscuit with no lettering broken in half on the tip"),
    ('churro_20', 'Cookie Butter', 'common', "churro with a thick swoosh of smooth cookie butter spread down one side and cookie crumbs sprinkled on it"),
    ('churro_21', 'Chocolate Dipped', 'uncommon', "churro with its top half dipped in glossy dark chocolate with chocolate drips running down the ridges"),
    ('churro_22', 'Strawberry Frosted', 'uncommon', "churro with pink strawberry frosting on the top half, red and white sprinkles, and a fresh half strawberry on the tip"),
    ('churro_23', 'Blueberry Bliss', 'uncommon', "churro with a purple-blue blueberry glaze and three fresh round blueberries with little crowns on top"),
    ('churro_24', 'Matcha Green Tea', 'uncommon', "churro with its top dipped in soft green matcha glaze, a light dusting of matcha powder, and one small green tea leaf"),
    ('churro_25', 'Ube Purple Yam', 'uncommon', "churro with a lavender-purple ube glaze, a swirl of purple ube cream on the tip and white coconut flakes"),
    ('churro_26', 'Red Velvet', 'uncommon', "deep red velvet churro with white cream cheese frosting drizzle and red velvet crumbs"),
    ('churro_27', 'Orange Creamsicle', 'uncommon', "churro with a twisting orange and white swirl glaze like a creamsicle and a small orange slice on the tip"),
    ('churro_28', 'Lemon Zest', 'uncommon', "churro with bright yellow lemon glaze, thin curly lemon zest strips on top, and a lemon wedge on the tip"),
    ('churro_29', 'Mint Chocolate', 'uncommon', "churro with a mint green glaze, dark chocolate chips, and one fresh mint leaf on the tip"),
    ('churro_30', 'Cookies & Cream', 'uncommon', "churro dipped in white cream coating covered in black chocolate cookie crumbles, with half a plain round sandwich cookie with no logo on the tip"),
    ('churro_31', 'Pumpkin Spice', 'uncommon', "churro dusted in orange pumpkin spice with a swirl of whipped cream on the tip and a tiny orange pumpkin beside the sleeve"),
    ('churro_32', 'Birthday Cake', 'uncommon', "churro with white vanilla frosting and colorful rainbow sprinkles, one small striped birthday candle with a little flame on the tip"),
    ('churro_33', 'Cotton Candy', 'rare', "churro with a fluffy cloud of pink and blue cotton candy wrapped around its top, pastel pink sugar on the ridges"),
    ('churro_34', 'Tropical Mango', 'rare', "churro with a bright mango glaze, juicy mango cubes on top, and a tiny pineapple leaf tuft sticking out of the tip"),
    ('churro_35', 'Galaxy Swirl', 'rare', "churro with a swirling deep purple and blue galaxy glaze, tiny white star-shaped sprinkles, and a small ringed planet candy on the tip"),
    ('churro_36', 'Electric Blue', 'rare', "churro with a bright electric blue glaze and white lightning bolt shaped icing zigzags, a small lightning bolt candy on the tip"),
    ('churro_37', 'Watermelon Wave', 'rare', "churro with pink watermelon glaze, a green rind stripe band near the sleeve, little black seed sprinkles, and a wavy glaze edge"),
    ('churro_38', 'Sunset Orange', 'rare', "churro with glaze in stacked sunset bands of yellow, orange and pink, topped with a small round sun shaped candy"),
    ('churro_39', 'Golden Churro', 'legendary', "gleaming churro covered in shiny gold leaf, a gold foil sleeve instead of paper, and a tiny gold crown perched on its tip"),
    ('churro_40', 'Rainbow Galaxy', 'legendary', "twisted spiral churro with rainbow glaze bands, tiny star sprinkles, a small shooting star topper on the tip, and a sparkly iridescent sleeve"),
]

PRETZELS = [
    ('pretzel_01', 'Classic Salted', 'common', "golden brown pretzel with chunky white salt pieces scattered across it"),
    ('pretzel_02', 'Butter Brushed', 'common', "extra glossy buttery golden pretzel with a small melting pat of butter on top"),
    ('pretzel_03', 'Garlic Parmesan', 'common', "pretzel covered in grated white parmesan and green herb flecks, one small garlic clove beside it"),
    ('pretzel_04', 'Sesame Seed', 'common', "pretzel covered all over in little cream sesame seeds"),
    ('pretzel_05', 'Everything Seasoned', 'common', "pretzel covered in a mix of black and white sesame, poppy seeds, toasted onion and garlic flakes"),
    ('pretzel_06', 'Poppy Seed', 'common', "pretzel speckled all over with tiny black poppy seeds"),
    ('pretzel_07', 'Sea Salt', 'common', "pretzel with a few big white flaky pyramid-shaped sea salt crystals on top"),
    ('pretzel_08', 'Herb Butter', 'common', "glossy pretzel brushed with butter and sprinkled with green chopped herbs, a small butter pat with a parsley leaf"),
    ('pretzel_09', 'Onion Flake', 'common', "pretzel topped with toasted golden onion flakes and one small crispy onion ring piece"),
    ('pretzel_10', 'Rosemary', 'common', "pretzel with a fresh green rosemary sprig laid across the top and a few coarse salt bits"),
    ('pretzel_11', 'Plain Jane', 'common', "plain simple golden brown pretzel with no toppings, smooth and honest"),
    ('pretzel_12', 'Kosher Salt', 'common', "pretzel with big chunky cube-shaped white salt crystals"),
    ('pretzel_13', 'Olive Oil', 'common', "shiny pretzel glistening with olive oil, one small green olive with a leaf beside it"),
    ('pretzel_14', 'Black Pepper', 'common', "pretzel speckled with cracked black pepper and two whole black peppercorns"),
    ('pretzel_15', 'Ranch Dusted', 'common', "pretzel dusted with pale green and white ranch seasoning and dill flecks, a small cup of white ranch dip beside it"),
    ('pretzel_16', 'Italian Herb', 'common', "pretzel sprinkled with oregano flecks, with one big fresh basil leaf on top"),
    ('pretzel_17', 'Smoked Paprika', 'common', "pretzel dusted in red-orange smoked paprika with a little curl of smoke rising from it"),
    ('pretzel_18', 'Cracked Pepper', 'common', "pretzel with coarse cracked pepper chunks and a tiny wooden pepper grinder leaning against it"),
    ('pretzel_19', 'Honey Mustard', 'common', "pretzel with a zigzag drizzle of yellow honey mustard and a small cup of honey mustard dip"),
    ('pretzel_20', 'Pretzel Bites', 'common', "small red and white striped paper boat piled high with bite-sized golden pretzel nuggets sprinkled with salt"),
    ('pretzel_21', 'Cheddar Cheese', 'uncommon', "pretzel with gooey melted orange cheddar cheese drizzling over it and dripping off one loop"),
    ('pretzel_22', 'Cinnamon Sugar', 'uncommon', "pretzel coated in sparkly cinnamon sugar with one cinnamon stick beside it"),
    ('pretzel_23', 'Jalapeno Cheddar', 'uncommon', "pretzel with melted cheddar and bright green jalapeno pepper slices on top"),
    ('pretzel_24', 'Pizza Pretzel', 'uncommon', "pretzel topped with red marinara, melted stretchy mozzarella and round pepperoni slices"),
    ('pretzel_25', 'Chocolate Dipped', 'uncommon', "pretzel with its bottom half dipped in glossy chocolate with drips and a few salt crystals on the dough"),
    ('pretzel_26', 'Buffalo Ranch', 'uncommon', "pretzel with orange buffalo sauce glaze and white ranch zigzag drizzle, one small celery stick beside it"),
    ('pretzel_27', 'Maple Bacon', 'uncommon', "pretzel with an amber maple glaze and crispy wavy bacon pieces on top"),
    ('pretzel_28', 'Caramel Pecan', 'uncommon', "pretzel with golden caramel drizzle and toasted pecan halves stuck on it"),
    ('pretzel_29', 'White Chocolate', 'uncommon', "pretzel dipped in creamy white chocolate with thin white chocolate drizzle lines"),
    ('pretzel_30', 'Peanut Butter', 'uncommon', "pretzel with a thick peanut butter drizzle and whole peanuts in the shell beside it"),
    ('pretzel_31', 'BBQ Smokehouse', 'uncommon', "pretzel with dark red barbecue sauce glaze, dark grill marks across it, and a little curl of smoke"),
    ('pretzel_32', 'Nutella Stuffed', 'uncommon', "plump pretzel split open with rich chocolate hazelnut spread oozing out, two whole hazelnuts beside it, no jar, no logo"),
    ('pretzel_33', 'Truffle Parmesan', 'rare', "gourmet pretzel with dark black truffle shavings, shaved parmesan curls, and one small whole black truffle beside it"),
    ('pretzel_34', 'Lobster Butter', 'rare', "fancy pretzel drizzled with golden butter, a small red cartoon lobster claw garnish on top and a lemon wedge"),
    ('pretzel_35', 'Galaxy Glaze', 'rare', "pretzel coated in a swirling deep purple and blue galaxy glaze with tiny white star sprinkles and a small crescent moon candy"),
    ('pretzel_36', 'Neon Sour', 'rare', "pretzel coated in bright neon green and hot pink sour sugar with chunky sour candy crystals"),
    ('pretzel_37', 'Firecracker', 'rare', "pretzel with fiery red chili glaze, two small red chili peppers, and little starburst spark shapes popping off it"),
    ('pretzel_38', 'Aurora Frost', 'rare', "pretzel with an icy frosted glaze in bands of mint green, teal and soft purple like the northern lights, little frost crystals and one snowflake"),
    ('pretzel_39', 'Golden Pretzel', 'legendary', "gleaming solid gold pretzel with shiny gold leaf, three small jewels studded in the knot, and crisp sparkles"),
    ('pretzel_40', 'Diamond Twist', 'legendary', "pretzel made of faceted sparkling clear blue diamond crystal with gem facets, a big cut diamond set in the center of the knot"),
]

# Design x colour sets. The colour is part of the item's name, so each item is
# its DESIGN (a real object variation) in its named colourway, plus rarity extras.
COLOURS = {
    'Aqua': "aqua turquoise", 'Coral': "coral red-orange", 'Violet': "violet purple",
    'Lime': "lime green", 'Gold': "warm gold yellow",
}
COLOUR_ORDER = ['Aqua', 'Coral', 'Violet', 'Lime', 'Gold']

FLASHLIGHT_DESIGNS = [
    ('Scout', "rugged camping flashlight with chunky rubber grip rings, a wrist strap loop and a metal clip"),
    ('Starfinder', "flashlight whose lens head is shaped like a five-point star, with small star cutouts along the body"),
    ('Moonbeam', "rounded flashlight with a crescent moon shaped head hood over the lens and a little moon charm on the tail"),
    ('Wave Rider', "chunky waterproof dive flashlight with a rubber gasket ring, a wave stripe pattern on the body and a lanyard clip"),
    ('Compass', "explorer flashlight with a tiny compass built into the flat tail cap and a map-stripe band on the body"),
    ('Shark Fin', "flashlight with a little shark dorsal fin on top as the switch and three gill stripes on the body"),
    ('Movie Magic', "old Hollywood spotlight style flashlight with a wide barn-door lens hood and two small film reel wheels on the side"),
    ('Royal Glow', "ornate royal lantern flashlight with curly filigree trim, a jewel button and a tiny crown on the tail"),
]
UMBRELLA_DESIGNS = [
    ('Bubble', "clear see-through bubble dome umbrella with tinted rim panels and round bubble dots"),
    ('Star', "umbrella with a star print canopy and a star-shaped tip on top"),
    ('Cloud', "umbrella whose whole canopy is shaped like a fluffy cartoon cumulus cloud: three big round puffy bumps "
              "on top, a soft bumpy cloud-scallop edge, cloud-white puff highlights on the colour, a tiny cloud-shaped charm "
              "on the handle, NOT a plain smooth dome"),
    ('Wave', "umbrella with ocean wave curls along the canopy edge and a wave stripe pattern"),
    ('Compass', "umbrella whose canopy panels form a compass rose star pattern, with a compass-point tip"),
    ('Shark Fin', "umbrella with a shark dorsal fin on top and a zigzag shark-tooth canopy edge"),
    ('Castle', "umbrella with a canopy edge shaped like little fairytale castle turrets and a tiny pennant flag tip, a generic storybook castle"),
    ('Rainbow', "umbrella with rainbow striped canopy panels"),
]
CAMERA_DESIGNS = [
    ('Scout', "rugged adventure camera with rubber bumpers and a thick woven strap"),
    ('Star Shot', "camera with a star-shaped flash on top and a star-pattern lens ring"),
    ('Sunset', "instant photo camera with a sunset stripe band across the front and a blank photo sliding out of the slot"),
    ('Wave Rider', "chunky underwater camera in a clear waterproof housing with big side handles and a wave stripe"),
    ('Castle', "camera with a little fairytale castle turret shaped flash on top, a generic storybook castle"),
    ('Shark Fin', "camera with a shark dorsal fin on top and a toothy zigzag lens ring"),
    ('Fireworks', "camera covered in fireworks burst decals with a little sparkler sticking out of the top"),
    ('Golden Ticket', "premium camera with a blank golden admission ticket stub tucked into its strap, no writing on the ticket"),
]


def rarity_for(number):
    if number == 40:
        return 'legendary'
    if number >= 37:
        return 'epic'
    if number >= 31:
        return 'rare'
    if number >= 21:
        return 'uncommon'
    return 'common'


def design_set(prefix, noun, designs):
    out = []
    for di, (design, desc) in enumerate(designs):
        for ci, colour in enumerate(COLOUR_ORDER):
            n = di * 5 + ci + 1
            subj = f"{desc}, main body colour {COLOURS[colour]}"
            out.append((f"{prefix}_{n:02d}", f"{colour} {design} {noun}", rarity_for(n), subj))
    return out


SETS = {
    'churros': CHURROS,
    'pretzels': PRETZELS,
    'flashlights': design_set('flashlight', 'Light', FLASHLIGHT_DESIGNS),
    'umbrellas': design_set('umbrella', 'Umbrella', UMBRELLA_DESIGNS),
    'cameras': design_set('camera', 'Camera', CAMERA_DESIGNS),
}

SET_NAMES = {'churros': 'Churro Collection', 'pretzels': 'Pretzel Collection', 'flashlights': 'Night Lights',
             'umbrellas': 'Rain Parade', 'cameras': 'Camera Crew'}


TIER_GEAR = {
    'common': "simple and clean everyday version",
    'uncommon': "one extra fun detail like a charm or sticker shape",
    'rare': "fancier version with shiny metal trim and an extra special shape detail",
    'epic': "premium ornate version with polished gold trim and tiny gem accents",
    'legendary': ("the fanciest of the whole set, gold trim, a jewel, a special flourish shape, and a couple of crisp "
                  "four-point sparkle shapes around it"),
}
FOOD = {'churros', 'pretzels'}


def subject(setkey, item):
    slug, name, rarity, subj = item
    tier = TIER[rarity] if setkey in FOOD else TIER_GEAR[rarity]
    return f"{POSE[setkey]}: {subj}; {tier}; {NOT[setkey]}"


def all_items():
    for k, items in SETS.items():
        for it in items:
            yield k, it


# ---- Round 2 (panel fixes): stronger single cues that read at 40-64px.
R2 = {
    'churro_09': "churro with its whole top half dunked in a thick glossy golden-yellow butterscotch coating, and three big round amber butterscotch candies in clear twist wrappers stuck on it",
    'churro_12': "churro coated in cinnamon sugar with five big square golden cinnamon cereal squares stuck all along it and a little splash of milk drops",
    'churro_13': "extra dark golden-brown super crispy churro with big crunchy blistered bubbles, a crisp curled-up tip, and three crunchy crumb flakes flying off",
    'churro_19': "churro with a smooth brown spiced cookie butter dip on the top half and one big plain rectangular caramel-brown spiced biscuit with wavy edges and no lettering leaning against it, as big as the churro is wide",
    'churro_20': "churro with a thick tan cookie butter swirl piped down the whole length like frosting, a big glossy cookie butter drip, and two round tan cookies stuck on top",
    'pretzel_04': "pretzel thickly coated all over in big cream sesame seeds, with a small round wooden dish heaped with sesame seeds beside it",
    'pretzel_05': "pretzel coated in chunky mixed everything topping: big black and white seeds, orange dried onion bits and golden garlic chips, a small bowl of the colorful seed mix beside it",
    'pretzel_06': "pretzel so densely covered in tiny black poppy seeds it looks speckled grey-black, with one bright red poppy flower beside it",
    'pretzel_07': "pretzel with five huge white flaky pyramid sea salt crystals on top and a small pink scallop seashell beside it",
    'pretzel_12': "pretzel with big chunky white salt cubes and a small round white salt shaker with silver cap beside it",
    'pretzel_14': "pretzel speckled with black pepper with a small heap of whole round black peppercorns beside it",
    'pretzel_20': "pile of six bite-sized golden pretzel nuggets with salt, stacked in a small pyramid, no box, no container",
    'pretzel_37': "pretzel with fiery red chili glaze shaped like a firecracker with a short lit fuse sticking out of the top giving off a few crisp yellow star sparks, no chili peppers",
    'camera_11': "instant photo camera with a big sunset stripe band of yellow, orange and pink across the front, and a photo sliding out of the slot that shows a simple orange sunset over a wave",
    'camera_12': "instant photo camera with a big sunset stripe band of yellow, orange and pink across the front, and a photo sliding out of the slot that shows a simple orange sunset over a wave",
    'camera_13': "instant photo camera with a big sunset stripe band of yellow, orange and pink across the front, and a photo sliding out of the slot that shows a simple orange sunset over a wave",
    'camera_14': "instant photo camera with a big sunset stripe band of yellow, orange and pink across the front, and a photo sliding out of the slot that shows a simple orange sunset over a wave",
    'camera_15': "instant photo camera with a big sunset stripe band of yellow, orange and pink across the front, and a photo sliding out of the slot that shows a simple orange sunset over a wave",
}
for n in range(36, 40):
    R2[f'camera_{n}'] = ("premium camera with a big blank golden admission ticket, half as tall as the camera, tucked behind it and "
                         "sticking up diagonally, scalloped ticket edges, no writing on the ticket")
for n in range(36, 40):
    R2[f'umbrella_{n}'] = ("umbrella whose canopy is mostly one solid colour with a thin rainbow stripe band along the bottom edge only "
                           "and a tiny rainbow arc charm on the tip")
LEGEND_R2 = {
    'flashlight_40': ("ornate royal lantern flashlight in shining gold with a big jewelled crown on the tail end, a large red ruby button, "
                      "curly filigree, a tiny golden halo ring floating above it, and three crisp four-point sparkles"),
    'camera_40': ("solid gold royal camera with a small jewelled crown on top, a ruby shutter button, a big golden ticket fanned out "
                  "behind it with no writing, and three crisp four-point sparkles"),
    'umbrella_40': ("gold umbrella with a gold canopy, a thin rainbow band along the edge, gold ribs, a big jewelled crown tip on top, "
                    "a ruby on the handle, and three crisp four-point sparkles"),
    'churro_39': ("churro covered in shiny gold sugar in a white paper sleeve with a gold trim band, a tiny gold crown on its tip, "
                  "and crisp sparkles, still clearly a tasty churro, not a trophy"),
}
_subject_v1 = subject


def subject(setkey, item):
    slug, name, rarity, subj = item
    if slug == 'pretzel_20':
        return f"{R2[slug]}, each nugget a soft golden pretzel bite; simple and clean, one tasty topping detail; NOT popcorn, NOT chicken nuggets"
    if slug in LEGEND_R2:
        return f"{POSE[setkey]}: {LEGEND_R2[slug]}; {NOT[setkey]}"
    if slug in R2:
        colour = ''
        if setkey not in FOOD:
            colour = ', main ' + ('canopy' if setkey == 'umbrellas' else 'body') + ' colour ' + COLOURS[name.split()[0]]
        tier = TIER[rarity] if setkey in FOOD else TIER_GEAR[rarity]
        return f"{POSE[setkey]}: {R2[slug]}{colour}; {tier}; {NOT[setkey]}"
    return _subject_v1(setkey, item)


# ---- Round 3 (panel fixes): one hero cue per item, sized like the Biscoff biscuit.
R3 = {
    'churro_02': "churro buried in a thick fluffy coat of snowy white powdered sugar, with a little white sugar cloud puffing off the top and a small sugar sifter beside it",
    'churro_03': "churro dripping with glossy amber honey, with a big wooden honey dipper resting against it and a little honeycomb hexagon",
    'churro_05': "churro twisted into a spiral corkscrew with maple syrup swirled down it and one big red-orange maple leaf as big as the churro is wide",
    'churro_07': "churro with bold zigzag golden caramel drizzle and a big glossy caramel puddle pooling at the cup rim",
    'churro_08': "churro with a bitten top showing creamy tan dulce de leche filling, beside a small glass jar of dulce de leche with a cloth lid tied with string, no label text",
    'churro_15': "churro with caramel drizzle and four huge white pyramid-shaped sea salt crystals on top, each crystal big and easy to see",
    'churro_16': "churro rolled in toffee bits with one big jagged golden toffee shard sticking out of the top like a sail",
    'churro_17': "churro with praline glaze and one big whole pecan half, as big as the churro is wide, sitting on the tip",
    'churro_18': "churro in cinnamon sugar with one big flat round crackly cinnamon-sugar snickerdoodle cookie leaning against it, as wide as the cup",
    'pretzel_01': "pretzel with big chunky white salt pieces all over it, classic ballpark style",
    'pretzel_08': "glossy buttered pretzel with green herb flecks and a big square butter pat with a parsley sprig on top, the butter pat as big as one pretzel loop",
    'pretzel_09': "pretzel topped with toasted onion flakes and one big golden crispy onion ring leaning against it",
    'pretzel_11': "completely plain bare golden-brown pretzel with absolutely no salt and no toppings, smooth and shiny",
    'pretzel_13': "shiny pretzel glistening with olive oil next to a big green olive on a little olive branch with leaves, the olive as big as one pretzel loop",
}
for n in range(31, 36):
    R3[f'flashlight_{n}'] = ("classic handheld flashlight body with a round lens, decorated like old Hollywood: a film strip band wrapped around the "
                             "body, one small film reel badge on the side, and a gold star on the switch, NOT a stage spotlight, NOT a projector")
for n in range(21, 26):
    R3[f'umbrella_{n}'] = ("umbrella with one big bold compass rose star printed across the whole canopy in white and gold, four big "
                           "pointed rays reaching the canopy edge, and a compass-needle shaped tip")
LEGEND_R3 = {
    'churro_39': ("churro coated all over in shiny gold sugar that gleams like gold, in a white paper cup with a wide gold band, a tiny gold "
                  "crown on its tip, a soft gold rim highlight and four crisp four-point sparkles around it, still clearly a tasty churro"),
    'umbrella_40': ("gold umbrella with a gold canopy, a thin rainbow band along the edge, a big jewelled gold crown on top as the tip, a small "
                    "golden halo ring floating above the crown, a ruby on the handle, and three crisp four-point sparkles"),
}
_subject_v2 = subject


def subject(setkey, item):
    slug, name, rarity, subj = item
    if slug in LEGEND_R3:
        return f"{POSE[setkey]}: {LEGEND_R3[slug]}; {NOT[setkey]}"
    if slug in R3:
        colour = ''
        if setkey not in FOOD:
            colour = ', main ' + ('canopy' if setkey == 'umbrellas' else 'body') + ' colour ' + COLOURS[name.split()[0]]
        tier = TIER[rarity] if setkey in FOOD else TIER_GEAR[rarity]
        return f"{POSE[setkey]}: {R3[slug]}{colour}; {tier}; {NOT[setkey]}"
    return _subject_v2(setkey, item)


# ---- Round 4: one shared legendary signature (crown + sparkles), bigger toffee shard.
R4 = {
    'churro_16': "churro rolled in toffee bits with one big jagged dark amber toffee shard, half as long as the churro, angled out from the side like a sail",
}
R4.update({
    'churro_04': "churro coated in sparkly light-brown sugar crystals with a big pile of three golden-brown sugar cubes beside the cup, the pile as big as the cup",
    'churro_20': "churro with a thick tan cookie butter swirl down its length and a small round glass jar of cookie butter with a spoon sticking out beside it, the jar as big as the cup, no label text",
    'churro_40': "twisted spiral churro with bold saturated rainbow glaze bands in red, orange, yellow, green, blue and purple, tiny star sprinkles, a shooting star topper on the tip, and an iridescent sleeve, extra thick dark outline",
})
for n in range(31, 36):
    R4[f'flashlight_{n}'] = ("Hollywood flashlight: a classic flashlight body wrapped with a film strip band, topped with a wide square stage-spotlight "
                             "head with four flat barn-door flaps opened around the lens, NOT a projector")
LEGEND_R4 = {
    'churro_39': ("churro whose whole body is shiny solid gold glitter sugar, deep gold all over with bright gold highlights, in a white paper "
                  "cup with a wide gold band, a gold crown on its tip, and four crisp four-point sparkles, same size as a normal churro"),
    'pretzel_39': ("gleaming gold pretzel with shiny gold leaf, three small jewels in the knot, a small jewelled gold crown sitting on top of "
                   "the knot, and four crisp four-point sparkles around it"),
    'pretzel_40': ("pretzel made of faceted sparkling clear blue diamond crystal with gem facets, a small silver crown with blue gems on top "
                   "of the knot, and four crisp four-point sparkles around it"),
}
_subject_v3 = subject


def subject(setkey, item):
    slug = item[0]
    if slug in LEGEND_R4:
        return f"{POSE[setkey]}: {LEGEND_R4[slug]}; {NOT[setkey]}"
    if slug in R4:
        if setkey == 'flashlights':
            return f"{POSE[setkey]}: {R4[slug]}, main body colour {COLOURS[item[1].split()[0]]}; {TIER_GEAR[item[2]]}; {NOT[setkey]}"
        return f"{POSE[setkey]}: {R4[slug]}; {TIER[item[2]]}; {NOT[setkey]}"
    return _subject_v3(setkey, item)


# ---- Round 5: last legendary crown, chunkier props on three commons.
R5 = {
    'churro_01': "golden churro rolled in cinnamon sugar with visible sugar crystals, two thick chunky cinnamon sticks tied together leaning against the cup and a small puff of cinnamon dust",
    'churro_02': "churro buried in thick snowy white powdered sugar, a big fluffy white sugar cloud puffing off the top as wide as the churro, and a chunky sugar sifter with a thick rim beside the cup",
    'churro_06': "churro with a thick line of white vanilla cream piped along it flecked with vanilla seeds, a thick chunky dark vanilla pod and a big white vanilla orchid flower beside the cup",
}
LEGEND_R5 = {
    'churro_40': ("twisted spiral churro with bold saturated rainbow glaze bands in red, orange, yellow, green, blue and purple, tiny star "
                  "sprinkles, a small jewelled gold crown on its tip, an iridescent sleeve, four crisp four-point sparkles around it, extra thick dark outline"),
}
_subject_v4 = subject


def subject(setkey, item):
    slug = item[0]
    if slug in LEGEND_R5:
        return f"{POSE[setkey]}: {LEGEND_R5[slug]}; {NOT[setkey]}"
    if slug in R5:
        return f"{POSE[setkey]}: {R5[slug]}; {TIER[item[2]]}; {NOT[setkey]}"
    return _subject_v4(setkey, item)
