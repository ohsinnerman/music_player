/**
 * Expo config plugin: show a pre-release label ("1.1.0-beta") as the Android
 * versionName while `version` stays numeric (iOS requires "1.1.0").
 */
const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withVersionLabel(config, { label } = {}) {
  if (!label) return config;
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = cfg.modResults.contents.replace(/versionName\s+"[^"]*"/, `versionName "${label}"`);
    return cfg;
  });
};
