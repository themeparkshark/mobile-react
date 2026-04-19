const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundle .html (for WebView-embedded minigames like Sharky) as static assets.
if (!config.resolver.assetExts.includes('html')) {
  config.resolver.assetExts.push('html');
}

// Bundle .glb / .gltf / .hdr / .ktx (3D model + IBL assets for react-native-filament
// powered queue mini-games — Banana Basket, Cauldron Brew, Raptor Nest, etc.)
for (const ext of ['glb', 'gltf', 'hdr', 'ktx']) {
  if (!config.resolver.assetExts.includes(ext)) {
    config.resolver.assetExts.push(ext);
  }
}

module.exports = config;
