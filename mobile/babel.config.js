// Expo's default preset (resolved through `expo`, which ships it) plus our own
// per-icon lucide import rewrite.
const preset = require.resolve('babel-preset-expo', { paths: [require.resolve('expo/package.json')] });

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [preset],
    plugins: ['./babel/lucide-direct-imports'],
  };
};
