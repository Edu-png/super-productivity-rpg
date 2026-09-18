// Synthesizes a short looping 16-bit-era JRPG-style overworld theme (square
// lead + triangle bass + soft sine arpeggio backing) entirely from math - no
// samples, no external audio, so there's no licensing question. Writes a
// mono 16-bit PCM WAV to src/assets/rpg/bgm/theme.wav.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', '..', 'src', 'assets', 'rpg', 'bgm', 'theme.wav');

const SAMPLE_RATE = 32000;
const TEMPO_BPM = 132;
const BEAT_SEC = 60 / TEMPO_BPM;

const NOTE_HZ = {
  A1: 55.0,
  C2: 65.41,
  D2: 73.42,
  E2: 82.41,
  F2: 87.31,
  G2: 98.0,
  A2: 110.0,
  B2: 123.47,
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  G3: 196.0,
  A3: 220.0,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
};

const hz = (name) => NOTE_HZ[name];

// --- Composition: 8 bars, 4 beats/bar, A-minor town/overworld progression
// (Am - F - C - G) repeated twice with small melodic variation the 2nd time.
const CHORDS = ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G'];
const CHORD_TONES = {
  Am: ['A3', 'C4', 'E4'],
  F: ['F3', 'A3', 'C4'],
  C: ['C3', 'E3', 'G3'],
  G: ['G3', 'B3', 'D4'],
};
const BASS_ROOT = { Am: ['A2', 'A3'], F: ['F2', 'F3'], C: ['C3', 'C4'], G: ['G2', 'G3'] };

// Lead melody: one entry per eighth note (8 per bar), null = rest.
const MELODY = [
  // Bar 1 (Am)
  ['E4', 'G4', 'A4', 'C5', 'B4', 'A4', 'G4', 'E4'],
  // Bar 2 (F)
  ['F4', 'A4', 'C5', 'D5', 'C5', 'A4', 'F4', null],
  // Bar 3 (C)
  ['C4', 'E4', 'G4', 'C5', 'B4', 'G4', 'E4', 'C4'],
  // Bar 4 (G)
  ['G4', 'B4', 'D5', 'B4', 'G4', 'D5', 'B4', 'G4'],
  // Bar 5 (Am) - restate motif
  ['E4', 'G4', 'A4', 'C5', 'B4', 'A4', 'G4', 'E4'],
  // Bar 6 (F) - variation
  ['F4', 'A4', 'C5', 'D5', 'C5', 'A4', 'F4', 'D4'],
  // Bar 7 (C) - variation with passing tone
  ['C4', 'E4', 'G4', 'C5', 'D5', 'C5', 'B4', 'G4'],
  // Bar 8 (G) - descends back toward the loop point
  ['G4', 'B4', 'D5', 'B4', 'A4', 'G4', 'F4', 'E4'],
];

const BAR_SEC = BEAT_SEC * 4;
const EIGHTH_SEC = BEAT_SEC / 2;
const TOTAL_SEC = BAR_SEC * CHORDS.length;
const totalSamples = Math.ceil(TOTAL_SEC * SAMPLE_RATE);
const mix = new Float64Array(totalSamples);

function envelope(t, dur, attack = 0.008, release = 0.03) {
  if (t < attack) return t / attack;
  if (t > dur - release) return Math.max(0, (dur - t) / release);
  return 1;
}

function squareWave(phase) {
  return Math.sin(phase) >= 0 ? 1 : -1;
}

function triangleWave(phase) {
  return (2 / Math.PI) * Math.asin(Math.sin(phase));
}

function addNote({ freq, startSec, durSec, wave, amp }) {
  if (!freq) return;
  const startSample = Math.floor(startSec * SAMPLE_RATE);
  const endSample = Math.min(totalSamples, Math.floor((startSec + durSec) * SAMPLE_RATE));
  for (let i = startSample; i < endSample; i++) {
    const t = (i - startSample) / SAMPLE_RATE;
    const phase = 2 * Math.PI * freq * t;
    const env = envelope(t, durSec);
    mix[i] += wave(phase) * env * amp;
  }
}

// Lead (square wave, NES-style)
MELODY.forEach((bar, barIndex) => {
  bar.forEach((note, eighthIndex) => {
    if (!note) return;
    const start = barIndex * BAR_SEC + eighthIndex * EIGHTH_SEC;
    addNote({
      freq: hz(note),
      startSec: start,
      durSec: EIGHTH_SEC * 0.92,
      wave: squareWave,
      amp: 0.16,
    });
  });
});

// Bass (triangle wave, two half-notes per bar)
CHORDS.forEach((chord, barIndex) => {
  const [rootLow, rootHigh] = BASS_ROOT[chord];
  const half = BAR_SEC / 2;
  addNote({
    freq: hz(rootLow),
    startSec: barIndex * BAR_SEC,
    durSec: half * 0.95,
    wave: triangleWave,
    amp: 0.22,
  });
  addNote({
    freq: hz(rootHigh),
    startSec: barIndex * BAR_SEC + half,
    durSec: half * 0.95,
    wave: triangleWave,
    amp: 0.18,
  });
});

// Soft sine arpeggio backing (NES-style fast broken chords standing in for harmony)
CHORDS.forEach((chord, barIndex) => {
  const tones = CHORD_TONES[chord];
  const sixteenth = BAR_SEC / 8;
  const pattern = [
    tones[0],
    tones[1],
    tones[2],
    tones[1],
    tones[0],
    tones[1],
    tones[2],
    tones[1],
  ];
  pattern.forEach((note, index) => {
    addNote({
      freq: hz(note),
      startSec: barIndex * BAR_SEC + index * sixteenth,
      durSec: sixteenth * 0.9,
      wave: (p) => Math.sin(p),
      amp: 0.07,
    });
  });
});

// Normalize to avoid clipping, then encode as 16-bit PCM mono WAV.
let peak = 0;
for (let i = 0; i < totalSamples; i++) peak = Math.max(peak, Math.abs(mix[i]));
const scale = peak > 0 ? 0.9 / peak : 1;

const pcm = new Int16Array(totalSamples);
for (let i = 0; i < totalSamples; i++) {
  pcm[i] = Math.max(-32768, Math.min(32767, Math.round(mix[i] * scale * 32767)));
}

const bytesPerSample = 2;
const blockAlign = bytesPerSample; // mono
const byteRate = SAMPLE_RATE * blockAlign;
const dataSize = pcm.length * bytesPerSample;
const buffer = Buffer.alloc(44 + dataSize);
buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16); // fmt chunk size
buffer.writeUInt16LE(1, 20); // PCM
buffer.writeUInt16LE(1, 22); // mono
buffer.writeUInt32LE(SAMPLE_RATE, 24);
buffer.writeUInt32LE(byteRate, 28);
buffer.writeUInt16LE(blockAlign, 32);
buffer.writeUInt16LE(16, 34); // bits per sample
buffer.write('data', 36);
buffer.writeUInt32LE(dataSize, 40);
for (let i = 0; i < pcm.length; i++) {
  buffer.writeInt16LE(pcm[i], 44 + i * bytesPerSample);
}

writeFileSync(OUT_PATH, buffer);
console.log(
  `Escrito ${OUT_PATH} (${(buffer.length / 1024).toFixed(0)} KB, ${TOTAL_SEC.toFixed(1)}s, loop)`,
);
