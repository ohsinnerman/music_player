#!/usr/bin/env node
/**
 * Lets Aura's output stage (modules/aura-audio-route → AuraDsp) plug into
 * expo-audio's ExoPlayer: float decoding, downmix, ReplayGain, EQ and
 * bit-perfect USB. expo-audio has no hook for a custom RenderersFactory, so
 * this adds one line to each `ExoPlayer.Builder(context)` plus a tiny helper
 * that finds AuraDsp by reflection (and falls back to the stock factory).
 *
 * Runs on `npm install` (postinstall). Idempotent; fails loudly if expo-audio
 * changed shape so the build doesn't silently lose the feature.
 */
const fs = require('fs');
const path = require('path');

let root;
try {
  root = path.dirname(require.resolve('expo-audio/package.json', { paths: [path.join(__dirname, '..')] }));
} catch {
  console.log('[aura] expo-audio not installed; skipping patch');
  process.exit(0);
}
const dir = path.join(root, 'android/src/main/java/expo/modules/audio');
const MARK = 'auraRenderersFactory(context)';

const helper = `package expo.modules.audio

import android.content.Context
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.RenderersFactory

/** Added by Aura (scripts/patch-expo-audio.js): use AuraDsp's renderers when the module is present. */
@UnstableApi
internal fun auraRenderersFactory(context: Context): RenderersFactory =
  try {
    Class.forName("expo.modules.auraaudioroute.AuraDsp")
      .getMethod("renderersFactory", Context::class.java)
      .invoke(null, context) as RenderersFactory
  } catch (e: Throwable) {
    DefaultRenderersFactory(context)
  }
`;

let changed = 0;
for (const file of ['AudioPlaylist.kt', 'AudioPlayer.kt']) {
  const p = path.join(dir, file);
  let src = fs.readFileSync(p, 'utf8');
  if (src.includes(MARK)) continue;
  const anchor = /ExoPlayer\.Builder\(context\)\n(\s*)\.setLooper\(context\.mainLooper\)/;
  if (!anchor.test(src)) {
    console.error(`[aura] expo-audio ${file}: ExoPlayer.Builder(context) not found — update scripts/patch-expo-audio.js`);
    process.exit(1);
  }
  src = src.replace(anchor, (_m, indent) => `ExoPlayer.Builder(context)\n${indent}.setRenderersFactory(${MARK})\n${indent}.setLooper(context.mainLooper)`);
  fs.writeFileSync(p, src);
  changed++;
}
fs.writeFileSync(path.join(dir, 'AuraHooks.kt'), helper);
console.log(changed ? `[aura] patched expo-audio (${changed} players)` : '[aura] expo-audio already patched');
