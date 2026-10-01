#!/usr/bin/env node
/**
 * Native fix for react-native-audio-api 0.6.5: its shipped JsiHostObject.cpp
 * sets JSI_DEBUG_ALLOCATIONS 1, which keeps every host object in an
 * unsynchronized global std::vector. decodeAudioDataSource builds host
 * objects on detached threads, so concurrent decodes (or a decode racing a
 * createGain on the JS thread) corrupt the vector and abort the app.
 *
 * This flips the flag to 0 (the library's own intended release value). It is
 * idempotent. Run it after `npm install`, before `pod install` / a native
 * build. The engine also serializes decodes in JS (audio/backends.ts), so the
 * current binary is safe either way; this removes the remaining JS-thread race.
 *
 *   node tools/audio/patch-audio-api.mjs            # patch
 *   node tools/audio/patch-audio-api.mjs --check    # exit 1 if unpatched
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = path.join(root, 'node_modules/react-native-audio-api/common/cpp/audioapi/jsi/JsiHostObject.cpp');
if (!fs.existsSync(file)) {
  console.log('react-native-audio-api not installed; nothing to patch');
  process.exit(0);
}
const src = fs.readFileSync(file, 'utf8');
const patched = src.replace(/#define JSI_DEBUG_ALLOCATIONS 1\b/, '#define JSI_DEBUG_ALLOCATIONS 0');
if (process.argv.includes('--check')) {
  const ok = !/#define JSI_DEBUG_ALLOCATIONS 1\b/.test(src);
  console.log(ok ? 'audio-api: patched' : 'audio-api: UNPATCHED (JSI_DEBUG_ALLOCATIONS 1)');
  process.exit(ok ? 0 : 1);
}
if (patched === src) {
  console.log('audio-api: already patched');
} else {
  fs.writeFileSync(file, patched);
  console.log('audio-api: JSI_DEBUG_ALLOCATIONS set to 0 (rebuild the native app)');
}
