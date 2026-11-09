#!/usr/bin/env bash
# Spectrum (fake-lossless) test: makes real encoder output with ffmpeg, then runs
# Spectrum.kt on a desktop JVM. Needs ffmpeg (with libmp3lame) and kotlinc.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
d="$(mktemp -d)"
ff() { ffmpeg -loglevel error -y "$@"; }
ff -f lavfi -i "anoisesrc=d=12:c=pink:r=44100:a=0.3" -ac 2 "$d/pink44.wav"
ff -i "$d/pink44.wav" -f f32le -ac 2 "$d/pink44.f32"
ff -i "$d/pink44.wav" -c:a libmp3lame -b:a 128k "$d/m128.mp3" && ff -i "$d/m128.mp3" -f f32le -ac 2 "$d/m128.f32"
ff -i "$d/pink44.wav" -c:a libmp3lame -b:a 320k "$d/m320.mp3" && ff -i "$d/m320.mp3" -f f32le -ac 2 "$d/m320.f32"
ff -i "$d/pink44.wav" -c:a aac -b:a 96k "$d/a96.m4a" && ff -i "$d/a96.m4a" -f f32le -ac 2 "$d/a96.f32"
ff -i "$d/pink44.wav" -af aresample=96000 -f f32le -ac 2 "$d/up96.f32"
ff -f lavfi -i "anoisesrc=d=12:c=pink:r=96000:a=0.3" -ac 2 -f f32le "$d/hi96.f32"
kotlinc "$here/../../android/src/main/java/expo/modules/auraaudioroute/Spectrum.kt" "$here/SpecTest.kt" -include-runtime -d "$d/t.jar" 2>/dev/null
java -jar "$d/t.jar" "$d"
