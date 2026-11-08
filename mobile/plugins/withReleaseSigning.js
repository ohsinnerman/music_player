/**
 * Expo config plugin: sign release builds with your own keystore when one is
 * provided, otherwise fall back to the template's debug keystore (fine for
 * sideloading, NOT for the Play Store).
 *
 * Provide these as Gradle properties or environment variables:
 *   AURA_UPLOAD_STORE_FILE      absolute path to the .jks / .keystore
 *   AURA_UPLOAD_STORE_PASSWORD
 *   AURA_UPLOAD_KEY_ALIAS
 *   AURA_UPLOAD_KEY_PASSWORD
 *
 * The GitHub Actions workflow wires these from repository secrets.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// aura-release-signing';

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes(MARKER)) return cfg;

    const releaseConfig = `
        ${MARKER}
        release {
            def storeFilePath = findProperty('AURA_UPLOAD_STORE_FILE') ?: System.getenv('AURA_UPLOAD_STORE_FILE')
            if (storeFilePath) {
                storeFile file(storeFilePath)
                storePassword findProperty('AURA_UPLOAD_STORE_PASSWORD') ?: System.getenv('AURA_UPLOAD_STORE_PASSWORD')
                keyAlias findProperty('AURA_UPLOAD_KEY_ALIAS') ?: System.getenv('AURA_UPLOAD_KEY_ALIAS')
                keyPassword findProperty('AURA_UPLOAD_KEY_PASSWORD') ?: System.getenv('AURA_UPLOAD_KEY_PASSWORD')
            } else {
                storeFile signingConfigs.debug.storeFile
                storePassword signingConfigs.debug.storePassword
                keyAlias signingConfigs.debug.keyAlias
                keyPassword signingConfigs.debug.keyPassword
            }
        }`;

    // Add a "release" signing config right after the debug one.
    gradle = gradle.replace(/signingConfigs\s*\{([\s\S]*?debug\s*\{[\s\S]*?\})/, (m) => `${m}${releaseConfig}`);
    // Point the release build type at it.
    gradle = gradle.replace(/(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/, '$1signingConfig signingConfigs.release');

    cfg.modResults.contents = gradle;
    return cfg;
  });
};
