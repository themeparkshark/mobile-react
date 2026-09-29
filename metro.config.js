const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Local review checkouts may reuse the installed dependencies through a symlink.
// Watch the resolved modules so Metro can read them without pulling in another
// checkout's App entrypoint. Normal installations keep Expo's default config.
const fs = require('fs');
const path = require('path');
const modules = path.join(__dirname, 'node_modules');
if (fs.existsSync(modules) && fs.lstatSync(modules).isSymbolicLink()) {
  config.watchFolders = [...config.watchFolders, fs.realpathSync(modules)];
}

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
