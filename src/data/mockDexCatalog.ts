/**
 * Dev-only collection book preview data, generated from the Home Hunt v3 art
 * catalog (next-wave/home-hunt-v3/catalog.json). Loaded only by
 * SetCollectionPreviewScreen through devRoutes (never ships).
 */
export interface MockDexSet {
  readonly slug: string;
  readonly name: string;
  readonly color: string;
  readonly reward: { readonly energy: number; readonly tickets: number; readonly xp: number; readonly title: string | null };
  readonly spawn: string;
  readonly badge: string;
  readonly items: readonly { readonly slug: string; readonly name: string; readonly rarity: number; readonly flavor: string }[];
}

export const MOCK_DEX_SETS: readonly MockDexSet[] = [
 {
  "slug": "snack_stand",
  "name": "Snack Stand",
  "color": "#FFB020",
  "reward": {
   "energy": 10,
   "tickets": 2,
   "xp": 60,
   "title": "Snack Boss"
  },
  "spawn": "always",
  "badge": "snack-stand",
  "items": [
   {
    "slug": "salted-pretzel",
    "name": "Giant Salted Pretzel",
    "rarity": 1,
    "flavor": "Twisty, salty and bigger than your face."
   },
   {
    "slug": "popcorn-bucket",
    "name": "Striped Popcorn Bucket",
    "rarity": 1,
    "flavor": "Pop, pop, pop! It never runs out (almost)."
   },
   {
    "slug": "corn-dog",
    "name": "Corn Dog",
    "rarity": 1,
    "flavor": "A hot dog in a cozy cornbread sweater."
   },
   {
    "slug": "hot-dog",
    "name": "Ballpark Hot Dog",
    "rarity": 1,
    "flavor": "Mustard zigzag made by a pro."
   },
   {
    "slug": "pizza-slice",
    "name": "Pizza Slice",
    "rarity": 1,
    "flavor": "Extra cheesy, extra stretchy."
   },
   {
    "slug": "nacho-tray",
    "name": "Loaded Nacho Tray",
    "rarity": 2,
    "flavor": "Every chip has a cheese hat."
   },
   {
    "slug": "chicken-basket",
    "name": "Chicken Tender Basket",
    "rarity": 2,
    "flavor": "Crunchy tenders plus fries. Dip twice."
   },
   {
    "slug": "corn-on-cob",
    "name": "Grilled Street Corn",
    "rarity": 2,
    "flavor": "Butter, char and a little sprinkle."
   },
   {
    "slug": "dill-pickle",
    "name": "Giant Pickle on a Stick",
    "rarity": 3,
    "flavor": "Crunch so loud the whole line hears it."
   },
   {
    "slug": "mac-cheese-cone",
    "name": "Mac and Cheese Cone",
    "rarity": 3,
    "flavor": "Dinner, but make it a cone."
   },
   {
    "slug": "turkey-leg",
    "name": "Smoky Turkey Leg",
    "rarity": 4,
    "flavor": "Hold it high like a royal snack."
   },
   {
    "slug": "golden-feast-platter",
    "name": "Golden Feast Platter",
    "rarity": 5,
    "flavor": "A little bit of everything, all sparkly."
   }
  ]
 },
 {
  "slug": "churro_cart",
  "name": "Churro Cart",
  "color": "#D9853B",
  "reward": {
   "energy": 10,
   "tickets": 2,
   "xp": 50,
   "title": "Churro Champ"
  },
  "spawn": "always",
  "badge": "churro-cart",
  "items": [
   {
    "slug": "classic-churro",
    "name": "Classic Cinnamon Churro",
    "rarity": 1,
    "flavor": "The original. Ridgy, sugary, perfect."
   },
   {
    "slug": "churro-bites",
    "name": "Churro Bites Cup",
    "rarity": 1,
    "flavor": "Tiny churros, giant snack energy."
   },
   {
    "slug": "chocolate-dip-churro",
    "name": "Chocolate Dipped Churro",
    "rarity": 2,
    "flavor": "Half churro, half chocolate, all happy."
   },
   {
    "slug": "sprinkle-heart-churro",
    "name": "Sprinkle Heart Churro",
    "rarity": 2,
    "flavor": "Bent into a heart and dunked in confetti."
   },
   {
    "slug": "churro-loop",
    "name": "Loop de Loop Churro",
    "rarity": 3,
    "flavor": "Shaped like the best coaster ever."
   },
   {
    "slug": "churro-sundae",
    "name": "Churro Sundae",
    "rarity": 3,
    "flavor": "Ice cream wearing churro sunglasses."
   },
   {
    "slug": "churro-ice-cream-sandwich",
    "name": "Churro Cream Sandwich",
    "rarity": 4,
    "flavor": "Two churro discs hugging a big scoop."
   },
   {
    "slug": "glazed-churro-donut",
    "name": "Churro Donut Ring",
    "rarity": 4,
    "flavor": "A donut that dreamed it was a churro."
   },
   {
    "slug": "golden-churro",
    "name": "Legendary Golden Churro",
    "rarity": 5,
    "flavor": "Shines brighter than the castle at noon."
   }
  ]
 },
 {
  "slug": "sweet_treats",
  "name": "Sweet Treats",
  "color": "#FF5FA2",
  "reward": {
   "energy": 10,
   "tickets": 2,
   "xp": 60,
   "title": "Sugar Scout"
  },
  "spawn": "always",
  "badge": "sweet-treats",
  "items": [
   {
    "slug": "cotton-candy",
    "name": "Cotton Candy Cloud",
    "rarity": 1,
    "flavor": "A fluffy cloud you can eat."
   },
   {
    "slug": "candy-apple",
    "name": "Candy Apple",
    "rarity": 1,
    "flavor": "Shiny red, super crunchy."
   },
   {
    "slug": "swirl-lollipop",
    "name": "Giant Swirl Lollipop",
    "rarity": 1,
    "flavor": "Takes three days to finish. Worth it."
   },
   {
    "slug": "frozen-pineapple-swirl",
    "name": "Frozen Pineapple Swirl",
    "rarity": 2,
    "flavor": "Sunshine in a cup. Cold sunshine."
   },
   {
    "slug": "funnel-cake",
    "name": "Funnel Cake",
    "rarity": 2,
    "flavor": "A tangle of crunch under a snowstorm of sugar."
   },
   {
    "slug": "shaved-ice",
    "name": "Rainbow Shaved Ice",
    "rarity": 2,
    "flavor": "Three flavors, one brain freeze."
   },
   {
    "slug": "frozen-banana",
    "name": "Chocolate Frozen Banana",
    "rarity": 3,
    "flavor": "Banana in a chocolate jacket with nuts."
   },
   {
    "slug": "giant-cupcake",
    "name": "Giant Celebration Cupcake",
    "rarity": 3,
    "flavor": "Big enough to share. You will not."
   },
   {
    "slug": "mini-donut-bag",
    "name": "Hot Mini Donut Bag",
    "rarity": 3,
    "flavor": "Warm, cinnamon-y and gone in seconds."
   },
   {
    "slug": "waffle-stick",
    "name": "Waffle on a Stick",
    "rarity": 4,
    "flavor": "Breakfast you can wave around."
   },
   {
    "slug": "milkshake-tower",
    "name": "Over the Top Milkshake",
    "rarity": 4,
    "flavor": "Topped with a donut, a cookie and dreams."
   },
   {
    "slug": "rainbow-cake-pop-bouquet",
    "name": "Rainbow Cake Pop Bouquet",
    "rarity": 5,
    "flavor": "Seven flavors. One amazing day."
   }
  ]
 },
 {
  "slug": "souvenirs",
  "name": "Souvenir Shop",
  "color": "#3D8BFF",
  "reward": {
   "energy": 10,
   "tickets": 3,
   "xp": 70,
   "title": "Gift Shop Guru"
  },
  "spawn": "always",
  "badge": "souvenirs",
  "items": [
   {
    "slug": "shark-plush",
    "name": "Shark Plush",
    "rarity": 1,
    "flavor": "Soft, squishy and always smiling."
   },
   {
    "slug": "souvenir-mug",
    "name": "Souvenir Mug",
    "rarity": 1,
    "flavor": "For cocoa, coffee or pencils."
   },
   {
    "slug": "trading-pin",
    "name": "Trading Pin",
    "rarity": 1,
    "flavor": "Trade it, wear it, love it."
   },
   {
    "slug": "snow-globe",
    "name": "Mini Snow Globe",
    "rarity": 2,
    "flavor": "Shake it and a tiny storm happens."
   },
   {
    "slug": "keychain",
    "name": "Name Keychain",
    "rarity": 2,
    "flavor": "Has your name on it. Probably."
   },
   {
    "slug": "autograph-book",
    "name": "Autograph Book",
    "rarity": 2,
    "flavor": "Collect signatures from the coolest characters."
   },
   {
    "slug": "postcard-stack",
    "name": "Postcard Stack",
    "rarity": 3,
    "flavor": "Wish you were here!"
   },
   {
    "slug": "pressed-penny",
    "name": "Pressed Penny",
    "rarity": 3,
    "flavor": "Squished flat and stamped with a star."
   },
   {
    "slug": "fin-headband",
    "name": "Shark Fin Headband",
    "rarity": 3,
    "flavor": "Instant shark mode, activated."
   },
   {
    "slug": "rocket-sipper",
    "name": "Rocket Sipper Cup",
    "rarity": 4,
    "flavor": "A rocket you can drink from."
   },
   {
    "slug": "light-up-wand",
    "name": "Light Up Wand",
    "rarity": 4,
    "flavor": "Swish it and the night sparkles."
   },
   {
    "slug": "dragon-plush",
    "name": "Giant Dragon Plush",
    "rarity": 5,
    "flavor": "Fluffy, friendly and only breathes bubbles."
   }
  ]
 },
 {
  "slug": "ride_day_gear",
  "name": "Ride Day Gear",
  "color": "#16B8C4",
  "reward": {
   "energy": 15,
   "tickets": 3,
   "xp": 60,
   "title": "Ready Rider"
  },
  "spawn": "always",
  "badge": "ride-day-gear",
  "items": [
   {
    "slug": "sunscreen",
    "name": "Sunscreen Bottle",
    "rarity": 1,
    "flavor": "Reapply every ride. Shark rule."
   },
   {
    "slug": "water-bottle",
    "name": "Water Bottle",
    "rarity": 1,
    "flavor": "Stay hydrated, stay awesome."
   },
   {
    "slug": "fanny-pack",
    "name": "Fanny Pack",
    "rarity": 1,
    "flavor": "Holds snacks. Mostly snacks."
   },
   {
    "slug": "park-map",
    "name": "Folded Park Map",
    "rarity": 1,
    "flavor": "X marks the snack spot."
   },
   {
    "slug": "rain-poncho",
    "name": "Rain Poncho",
    "rarity": 2,
    "flavor": "Splash zone? Bring it on."
   },
   {
    "slug": "bucket-hat",
    "name": "Bucket Hat",
    "rarity": 2,
    "flavor": "Shade for your whole head."
   },
   {
    "slug": "mister-fan",
    "name": "Mister Fan",
    "rarity": 2,
    "flavor": "A tiny breeze with a cool sprinkle."
   },
   {
    "slug": "sneakers",
    "name": "Comfy Park Sneakers",
    "rarity": 3,
    "flavor": "Built for 30,000 steps."
   },
   {
    "slug": "cooling-towel",
    "name": "Cooling Towel",
    "rarity": 3,
    "flavor": "Snap it, wear it, chill."
   },
   {
    "slug": "lanyard",
    "name": "Pin Lanyard",
    "rarity": 3,
    "flavor": "Room for twenty pins. Start trading."
   },
   {
    "slug": "umbrella",
    "name": "Rainbow Umbrella",
    "rarity": 4,
    "flavor": "Rain makes rainbows. This is proof."
   },
   {
    "slug": "adventure-backpack",
    "name": "Adventure Backpack",
    "rarity": 5,
    "flavor": "Every pocket is packed for fun."
   }
  ]
 },
 {
  "slug": "night_glow",
  "name": "Night Glow",
  "color": "#5B4CFF",
  "reward": {
   "energy": 15,
   "tickets": 3,
   "xp": 80,
   "title": "Night Owl"
  },
  "spawn": "time",
  "badge": "night-glow",
  "items": [
   {
    "slug": "glow-stick",
    "name": "Glow Stick Bracelet",
    "rarity": 1,
    "flavor": "Crack it and it lights up!"
   },
   {
    "slug": "glow-necklace",
    "name": "Glow Necklace",
    "rarity": 1,
    "flavor": "A glowing rainbow for your neck."
   },
   {
    "slug": "flashlight",
    "name": "Little Flashlight",
    "rarity": 1,
    "flavor": "Point it at the stars."
   },
   {
    "slug": "light-spinner",
    "name": "Light Up Spinner",
    "rarity": 2,
    "flavor": "Press the button. Whirl!"
   },
   {
    "slug": "star-lantern",
    "name": "Star Lantern",
    "rarity": 2,
    "flavor": "A paper star that glows warm."
   },
   {
    "slug": "glow-glasses",
    "name": "Glow Party Glasses",
    "rarity": 2,
    "flavor": "Big round frames that glow pink."
   },
   {
    "slug": "light-up-balloon",
    "name": "Light Up Balloon",
    "rarity": 3,
    "flavor": "It glows from the inside."
   },
   {
    "slug": "bubble-blaster",
    "name": "Glow Bubble Blaster",
    "rarity": 3,
    "flavor": "Glowing bubbles everywhere."
   },
   {
    "slug": "moon-cookie",
    "name": "Crescent Moon Cookie",
    "rarity": 3,
    "flavor": "Baked by the moon itself."
   },
   {
    "slug": "firework-rocket",
    "name": "Firework Rocket Toy",
    "rarity": 4,
    "flavor": "Fwoosh! (It is a toy. Safe and fun.)"
   },
   {
    "slug": "shooting-star",
    "name": "Wishing Star",
    "rarity": 5,
    "flavor": "Make a wish. It is listening."
   }
  ]
 },
 {
  "slug": "parade_day",
  "name": "Parade Day",
  "color": "#F0433A",
  "reward": {
   "energy": 10,
   "tickets": 3,
   "xp": 70,
   "title": "Parade Pro"
  },
  "spawn": "days",
  "badge": "parade-day",
  "items": [
   {
    "slug": "balloon-bunch",
    "name": "Balloon Bunch",
    "rarity": 1,
    "flavor": "Hold tight or they fly away!"
   },
   {
    "slug": "pennant-flag",
    "name": "Parade Pennant",
    "rarity": 1,
    "flavor": "Wave it high!"
   },
   {
    "slug": "confetti-popper",
    "name": "Confetti Popper",
    "rarity": 1,
    "flavor": "Pull the string. Party time."
   },
   {
    "slug": "parade-drum",
    "name": "Marching Drum",
    "rarity": 2,
    "flavor": "Boom, boom, ba-boom!"
   },
   {
    "slug": "band-hat",
    "name": "Band Leader Hat",
    "rarity": 2,
    "flavor": "The tall fluffy feather means you lead."
   },
   {
    "slug": "trumpet",
    "name": "Shiny Trumpet",
    "rarity": 2,
    "flavor": "Toot toot! Everyone look!"
   },
   {
    "slug": "tambourine",
    "name": "Tambourine",
    "rarity": 3,
    "flavor": "Shake, shake, jingle!"
   },
   {
    "slug": "ribbon-baton",
    "name": "Ribbon Baton",
    "rarity": 3,
    "flavor": "Twirl it into a rainbow."
   },
   {
    "slug": "bubble-machine",
    "name": "Bubble Machine",
    "rarity": 3,
    "flavor": "Makes a thousand bubbles a minute."
   },
   {
    "slug": "parade-float",
    "name": "Mini Parade Float",
    "rarity": 4,
    "flavor": "The tiniest parade in the world."
   },
   {
    "slug": "grand-marshal-sash",
    "name": "Grand Marshal Sash",
    "rarity": 5,
    "flavor": "You lead the whole parade today."
   }
  ]
 },
 {
  "slug": "spooky_snacks",
  "name": "Spooky Snacks",
  "color": "#FF7A1A",
  "reward": {
   "energy": 15,
   "tickets": 4,
   "xp": 90,
   "title": "Pumpkin Hunter"
  },
  "spawn": "seasonal",
  "badge": "spooky-snacks",
  "items": [
   {
    "slug": "pumpkin-bucket",
    "name": "Pumpkin Treat Bucket",
    "rarity": 1,
    "flavor": "Smiles on the outside, candy on the inside."
   },
   {
    "slug": "candy-corn-cone",
    "name": "Candy Corn Cone",
    "rarity": 1,
    "flavor": "Like candy corn, but ice cream."
   },
   {
    "slug": "ghost-marshmallow",
    "name": "Ghost Marshmallow Pop",
    "rarity": 1,
    "flavor": "Boo! It is too cute to be scary."
   },
   {
    "slug": "bat-cookie",
    "name": "Bat Wing Cookie",
    "rarity": 2,
    "flavor": "Flaps right into your mouth."
   },
   {
    "slug": "witch-hat",
    "name": "Witch Hat",
    "rarity": 2,
    "flavor": "Comes with zero spells. Probably."
   },
   {
    "slug": "caramel-pumpkin-apple",
    "name": "Caramel Pumpkin Apple",
    "rarity": 2,
    "flavor": "Dipped, drizzled and dressed for fall."
   },
   {
    "slug": "mummy-dog",
    "name": "Mummy Dog",
    "rarity": 3,
    "flavor": "Wrapped up for a snack-tacular night."
   },
   {
    "slug": "cauldron-cup",
    "name": "Bubbling Cauldron Cup",
    "rarity": 3,
    "flavor": "Green, fizzy and totally safe to drink."
   },
   {
    "slug": "candy-sack",
    "name": "Trick or Treat Sack",
    "rarity": 4,
    "flavor": "Heavy with every candy you can name."
   },
   {
    "slug": "harvest-moon-pumpkin",
    "name": "Golden Harvest Pumpkin",
    "rarity": 5,
    "flavor": "Only shows up when the moon is full and orange."
   }
  ]
 }
];
