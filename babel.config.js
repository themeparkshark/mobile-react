module.exports = function (api) {
  // Metro passes isDev on the caller. Release bundles (EAS builds and
  // `eas update`) are built with isDev false and get console noise removed.
  const isDev = api.caller(caller => (caller && typeof caller.isDev === 'boolean' ? caller.isDev : process.env.NODE_ENV !== 'production'));
  const plugins = [];
  if (!isDev) plugins.push(require('./tools/babel/strip-console.cjs'));
  // Reanimated's plugin must stay last.
  plugins.push('react-native-reanimated/plugin');
  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
