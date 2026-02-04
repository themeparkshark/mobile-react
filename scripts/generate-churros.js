/**
 * Generate 40 Churro Variants for Theme Park Shark
 * 
 * Uses the base churro image and applies hue rotations
 * to create different colored variants.
 * 
 * Run: node scripts/generate-churros.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const BASE_IMAGE = path.join(__dirname, '../assets/images/prep-items/churros/base_churro.png');
const OUTPUT_DIR = path.join(__dirname, '../assets/images/prep-items/churros');

// 40 Churro Variants with hue rotations and names
const CHURRO_VARIANTS = [
  // COMMON (20) - Basic flavors with slight hue variations
  { id: 1, name: 'Classic Cinnamon', hue: 0, rarity: 'common', wrapper: 'green' },
  { id: 2, name: 'Sugar Dusted', hue: 10, rarity: 'common', wrapper: 'green' },
  { id: 3, name: 'Honey Glazed', hue: 20, rarity: 'common', wrapper: 'yellow' },
  { id: 4, name: 'Brown Sugar', hue: -10, rarity: 'common', wrapper: 'red' },
  { id: 5, name: 'Maple Swirl', hue: 15, rarity: 'common', wrapper: 'orange' },
  { id: 6, name: 'Vanilla Bean', hue: 30, rarity: 'common', wrapper: 'white' },
  { id: 7, name: 'Caramel Drizzle', hue: 25, rarity: 'common', wrapper: 'gold' },
  { id: 8, name: 'Dulce de Leche', hue: 5, rarity: 'common', wrapper: 'tan' },
  { id: 9, name: 'Butterscotch', hue: 35, rarity: 'common', wrapper: 'yellow' },
  { id: 10, name: 'Toasted Coconut', hue: 40, rarity: 'common', wrapper: 'white' },
  { id: 11, name: 'Churro Original', hue: -5, rarity: 'common', wrapper: 'red' },
  { id: 12, name: 'Cinnamon Toast', hue: 8, rarity: 'common', wrapper: 'orange' },
  { id: 13, name: 'Golden Crisp', hue: 28, rarity: 'common', wrapper: 'gold' },
  { id: 14, name: 'Sweet Cream', hue: 45, rarity: 'common', wrapper: 'pink' },
  { id: 15, name: 'Salted Caramel', hue: 12, rarity: 'common', wrapper: 'blue' },
  { id: 16, name: 'Toffee Crunch', hue: -8, rarity: 'common', wrapper: 'brown' },
  { id: 17, name: 'Praline', hue: 18, rarity: 'common', wrapper: 'tan' },
  { id: 18, name: 'Snickerdoodle', hue: 22, rarity: 'common', wrapper: 'green' },
  { id: 19, name: 'Biscoff', hue: -3, rarity: 'common', wrapper: 'red' },
  { id: 20, name: 'Cookie Butter', hue: 7, rarity: 'common', wrapper: 'orange' },

  // UNCOMMON (12) - More exotic flavors with bigger hue shifts
  { id: 21, name: 'Chocolate Dipped', hue: -30, saturation: 0.8, rarity: 'uncommon', wrapper: 'brown' },
  { id: 22, name: 'Strawberry Frosted', hue: -60, rarity: 'uncommon', wrapper: 'pink' },
  { id: 23, name: 'Blueberry Bliss', hue: -120, rarity: 'uncommon', wrapper: 'blue' },
  { id: 24, name: 'Matcha Green Tea', hue: 80, rarity: 'uncommon', wrapper: 'green' },
  { id: 25, name: 'Ube Purple Yam', hue: -90, rarity: 'uncommon', wrapper: 'purple' },
  { id: 26, name: 'Red Velvet', hue: -45, saturation: 1.2, rarity: 'uncommon', wrapper: 'red' },
  { id: 27, name: 'Orange Creamsicle', hue: 50, saturation: 1.3, rarity: 'uncommon', wrapper: 'orange' },
  { id: 28, name: 'Lemon Zest', hue: 60, saturation: 1.2, rarity: 'uncommon', wrapper: 'yellow' },
  { id: 29, name: 'Mint Chocolate', hue: 100, rarity: 'uncommon', wrapper: 'green' },
  { id: 30, name: 'Cookies & Cream', hue: -20, saturation: 0.5, rarity: 'uncommon', wrapper: 'black' },
  { id: 31, name: 'Pumpkin Spice', hue: 40, saturation: 1.4, rarity: 'uncommon', wrapper: 'orange' },
  { id: 32, name: 'Birthday Cake', hue: -70, saturation: 0.9, rarity: 'uncommon', wrapper: 'pink' },

  // RARE (6) - Wild colors and special styles
  { id: 33, name: 'Cotton Candy', hue: -80, saturation: 1.5, brightness: 1.1, rarity: 'rare', wrapper: 'pink' },
  { id: 34, name: 'Tropical Mango', hue: 55, saturation: 1.6, rarity: 'rare', wrapper: 'yellow' },
  { id: 35, name: 'Galaxy Swirl', hue: -100, saturation: 1.3, rarity: 'rare', wrapper: 'purple' },
  { id: 36, name: 'Electric Blue', hue: -130, saturation: 1.4, rarity: 'rare', wrapper: 'blue' },
  { id: 37, name: 'Watermelon Wave', hue: -55, saturation: 1.5, rarity: 'rare', wrapper: 'green' },
  { id: 38, name: 'Sunset Orange', hue: 45, saturation: 1.6, brightness: 1.1, rarity: 'rare', wrapper: 'red' },

  // LEGENDARY (2) - Ultra special
  { id: 39, name: 'Golden Churro', hue: 35, saturation: 1.8, brightness: 1.3, rarity: 'legendary', wrapper: 'gold' },
  { id: 40, name: 'Rainbow Galaxy', hue: 0, saturation: 1.5, brightness: 1.2, rarity: 'legendary', wrapper: 'rainbow', special: true },
];

// Reward values by rarity
const REWARDS = {
  common: { energy: 5, xp: 10, ticketChance: 0.05, ticketAmount: 1 },
  uncommon: { energy: 10, xp: 25, ticketChance: 0.15, ticketAmount: 1 },
  rare: { energy: 20, xp: 50, ticketChance: 0.30, ticketAmount: 2 },
  legendary: { energy: 50, xp: 100, ticketChance: 1.0, ticketAmount: 5 },
};

// Spawn weights (higher = more common)
const SPAWN_WEIGHTS = {
  common: 60,
  uncommon: 25,
  rare: 12,
  legendary: 3,
};

// Despawn times in minutes
const DESPAWN_TIMES = {
  common: 30,
  uncommon: 20,
  rare: 10,
  legendary: 5,
};

async function generateChurro(variant) {
  const outputPath = path.join(OUTPUT_DIR, `churro_${variant.id.toString().padStart(2, '0')}.png`);
  
  try {
    let pipeline = sharp(BASE_IMAGE);
    
    // Apply hue rotation
    if (variant.hue !== 0) {
      pipeline = pipeline.modulate({
        hue: variant.hue,
        saturation: variant.saturation || 1,
        brightness: variant.brightness || 1,
      });
    } else if (variant.saturation || variant.brightness) {
      pipeline = pipeline.modulate({
        saturation: variant.saturation || 1,
        brightness: variant.brightness || 1,
      });
    }
    
    await pipeline.toFile(outputPath);
    console.log(`✅ Generated: ${variant.name} (${variant.rarity})`);
    return true;
  } catch (error) {
    console.error(`❌ Failed: ${variant.name}`, error.message);
    return false;
  }
}

async function generateConfigJSON() {
  const config = {
    setId: 'churro_set_001',
    setName: 'Churro Collection',
    setDescription: 'Collect all 40 delicious churro variants! Find them during the day while exploring.',
    setIcon: 'churro_01.png',
    theme: 'food',
    timeGate: {
      startHour: 6,
      endHour: 21,
      description: 'Churros appear during daytime (6am - 9pm)',
    },
    weatherGate: null, // Churros spawn in any weather
    totalItems: 40,
    completionRewards: {
      energy: 500,
      xp: 1000,
      tickets: 50,
      title: 'Churro Connoisseur',
      badge: 'churro_master_badge.png',
    },
    items: CHURRO_VARIANTS.map(variant => ({
      id: variant.id,
      name: variant.name,
      rarity: variant.rarity,
      iconFile: `churro_${variant.id.toString().padStart(2, '0')}.png`,
      wrapper: variant.wrapper,
      rewards: REWARDS[variant.rarity],
      spawnWeight: SPAWN_WEIGHTS[variant.rarity],
      despawnMinutes: DESPAWN_TIMES[variant.rarity],
      description: getDescription(variant),
    })),
  };
  
  const configPath = path.join(OUTPUT_DIR, 'churro_set_config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`\n📋 Config saved to: ${configPath}`);
  return config;
}

function getDescription(variant) {
  const descriptions = {
    common: [
      'A classic churro with that familiar taste.',
      'Simple and delicious!',
      'The everyday favorite.',
    ],
    uncommon: [
      'A special twist on the classic!',
      'Not your ordinary churro.',
      'A fan favorite flavor!',
    ],
    rare: [
      'A rare find! Lucky you!',
      'These don\'t come around often!',
      'Collectors go wild for this one!',
    ],
    legendary: [
      '🌟 LEGENDARY! An extremely rare churro!',
      '✨ The rarest of them all!',
    ],
  };
  
  const options = descriptions[variant.rarity];
  return options[variant.id % options.length];
}

async function main() {
  console.log('🥨 Generating 40 Churro Variants...\n');
  
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Generate all variants
  let success = 0;
  let failed = 0;
  
  for (const variant of CHURRO_VARIANTS) {
    const result = await generateChurro(variant);
    if (result) success++;
    else failed++;
  }
  
  console.log(`\n✅ Generated: ${success} churros`);
  if (failed > 0) console.log(`❌ Failed: ${failed} churros`);
  
  // Generate config JSON
  await generateConfigJSON();
  
  console.log('\n🎉 Done! Churro set ready for Theme Park Shark!');
}

main().catch(console.error);
