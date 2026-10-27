// 120 BPM, A minor, 20 s. Writes music.wav (48 kHz, 16-bit stereo). Every event sits on the beat grid from t = 0.
import { writeFileSync } from 'node:fs';
const SR = 48000, DUR = 20, N = SR * DUR, BEAT = 0.5;
const L = new Float32Array(N), R = new Float32Array(N);
const pad = [new Float32Array(N), new Float32Array(N)]; // ducked by the kick
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
function add(buf, i, l, r) { if (i >= 0 && i < N) { buf[0][i] += l; buf[1][i] += r; } }
const out = [L, R];

// chords per 2 s bar: Am F C G Am F C G F Am
const bars = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [53, 57, 60], [57, 60, 64]];
const roots = [45, 41, 36, 43, 45, 41, 36, 43, 41, 45];

// pad: detuned saws through a one-pole low-pass, slow attack
for (let b = 0; b < 10; b++) {
  const t0 = b * 2, len = b === 9 ? 2 : 2.05;
  for (const m of bars[b]) for (const det of [-0.08, 0.08]) {
    const f = hz(m + 12) * Math.pow(2, det / 12); let ph = Math.random(), lp = 0;
    const pan = det < 0 ? 0.35 : 0.65;
    for (let k = 0; k < len * SR; k++) {
      const t = k / SR; ph += f / SR; ph -= Math.floor(ph);
      const saw = 2 * ph - 1; lp += 0.06 * (saw - lp);
      const env = Math.min(1, t / 0.25) * (b === 9 ? Math.max(0, 1 - t / 2) : Math.min(1, (len - t) / 0.1));
      const v = lp * env * (t0 < 3 ? 0.075 : 0.04);
      add(pad, Math.round((t0 + t) * SR), v * (1 - pan) * 2, v * pan * 2);
    }
  }
}

// pluck arpeggio on 8ths (bars 0-8), quieter once drums enter
function pluck(time, m, gain, pan, decay = 0.35) {
  const f = hz(m); const i0 = Math.round(time * SR);
  for (let k = 0; k < decay * 4 * SR; k++) {
    const t = k / SR; const env = Math.exp(-t / decay) * Math.min(1, t / 0.003);
    const v = (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t / 0.08)) * env * gain;
    add(out, i0 + k, v * (1 - pan), v * pan);
  }
}
for (let s = 0; s < 36; s++) {
  const t = s * 0.25; if (t >= 17) break;
  const b = Math.floor(t / 2); const ch = bars[b]; const order = [0, 1, 2, 1, 0, 2, 1, 2];
  const m = ch[order[s % 8]] + 12; pluck(t, m, t < 3 ? 0.13 : 0.045, s % 2 ? 0.62 : 0.38, 0.22);
}
for (let s = 36; s < 68; s++) {
  const t = s * 0.25; if (t >= 17) break;
  const b = Math.floor(t / 2); const ch = bars[b]; const order = [0, 1, 2, 1, 0, 2, 1, 2];
  pluck(t, ch[order[s % 8]] + 12, 0.045, s % 2 ? 0.62 : 0.38, 0.22);
}

// kick on every beat 3.0-17.0
const kicks = [];
for (let t = 3.0; t < 17.0 - 1e-6; t += BEAT) kicks.push(t);
kicks.push(17.0, 18.0);
const softKicks = [0, 1.0, 2.0, 2.5];
for (const t0 of [...kicks, ...softKicks]) {
  const kg = softKicks.includes(t0) ? 0.5 : 1;
  const i0 = Math.round(t0 * SR); let ph = 0;
  for (let k = 0; k < 0.4 * SR; k++) {
    const t = k / SR; const f = 45 + 75 * Math.exp(-t / 0.035); ph += f / SR;
    const v = Math.sin(2 * Math.PI * ph) * Math.exp(-t / 0.16) * 0.42 * kg;
    add(out, i0 + k, v, v);
  }
}
// hats on off-beats 0.25 grid from 1.0, soft
for (let t = 0.5; t < 17.0 - 1e-6; t += 0.25) {
  const off = Math.abs((t / BEAT) % 1 - 0.5) < 1e-6; const g = (off ? 0.05 : 0.018) * (t < 3 ? 1.6 : 1);
  const i0 = Math.round(t * SR); let prev = 0;
  for (let k = 0; k < 0.06 * SR; k++) { const n = rnd(); const hp = n - prev; prev = n; const v = hp * Math.exp(-k / SR / 0.018) * g; add(out, i0 + k, v * 0.8, v * 1.2); }
}
// clap on beats 2 and 4 from 6.0
for (let t = 6.5; t < 17.0 - 1e-6; t += 1.0) {
  const i0 = Math.round(t * SR); let bp1 = 0, bp2 = 0;
  for (let k = 0; k < 0.2 * SR; k++) {
    const n = rnd(); bp1 += 0.35 * (n - bp1); bp2 += 0.35 * (bp1 - bp2); const band = bp1 - bp2;
    const v = band * Math.exp(-k / SR / 0.07) * 0.16; add(out, i0 + k, v, v);
  }
}
// bass: root 8ths 3.0-17.0, then a held root at 18.0
function bass(t0, m, len, g) {
  const f = hz(m); const i0 = Math.round(t0 * SR);
  for (let k = 0; k < len * SR; k++) {
    const t = k / SR; const env = Math.min(1, t / 0.005) * Math.min(1, (len - t) / 0.02);
    const x = Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t);
    const v = Math.tanh(x * 1.4) * env * g; add(out, i0 + k, v, v);
  }
}
for (let t = 3.0; t < 17.0 - 1e-6; t += 0.25 * 2) { const b = Math.floor(t / 2); bass(t, roots[b], 0.22, 0.13); bass(t + 0.25, roots[b] + 12, 0.18, 0.07); }
bass(2.0, 41, 0.9, 0.08); bass(2.5, 41, 0.4, 0.06);
bass(17.0, 41, 0.95, 0.13); bass(18.0, 45, 1.9, 0.14);
for (const m of [65, 69, 72]) pluck(17.0, m, 0.07, 0.3 + (m % 5) / 8, 0.7);

// cut accents: whoosh into each cut, then a high pluck on the root
function whoosh(tEnd, len, g) {
  const i0 = Math.round((tEnd - len) * SR); let lp = 0;
  for (let k = 0; k < len * SR; k++) {
    const t = k / SR; const p = t / len; lp += (0.02 + 0.25 * p * p) * (rnd() - lp);
    const v = lp * p * p * g; add(out, i0 + k, v * (1 - 0.3 * p), v * (0.7 + 0.3 * p));
  }
}
for (const c of [3, 6, 10, 14, 17]) { whoosh(c, 0.5, 0.5); const b = Math.min(9, Math.floor(c / 2)); pluck(c, roots[b] + 36, 0.08, 0.5, 0.5); }
// red reveal at 4.5: low A thud + A minor second-free stab
for (let k = 0; k < 0.6 * SR; k++) { const t = k / SR; const v = Math.sin(2 * Math.PI * hz(33) * t) * Math.exp(-t / 0.2) * 0.2; add(out, Math.round(4.5 * SR) + k, v, v); }
pluck(4.5, 69, 0.07, 0.4, 0.4); pluck(4.5, 72, 0.06, 0.6, 0.4);
// chime at 12.0 when 20 / 20 lands
pluck(12.0, 81, 0.07, 0.4, 0.6); pluck(12.0, 88, 0.05, 0.6, 0.6);
// outro chord at 18.0
for (const m of [69, 72, 76, 81]) pluck(18.0, m, 0.05, 0.3 + (m % 5) / 8, 0.9);

// sidechain the pad under each kick, then mix
for (let i = 0; i < N; i++) {
  const t = i / SR; let duck = 1;
  for (const k of kicks) { const d = t - k; if (d >= 0 && d < 0.3) duck = Math.min(duck, 0.45 + 0.55 * (d / 0.3)); }
  L[i] += pad[0][i] * duck; R[i] += pad[1][i] * duck;
}
let peak = 0; for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i] * 1.1); R[i] = Math.tanh(R[i] * 1.1); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const gain = 0.89 / peak; // -1 dBFS
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const fade = Math.min(1, i / (0.01 * SR)) * Math.min(1, (N - i) / (0.6 * SR));
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * gain * fade)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * gain * fade)) * 32767), 46 + i * 4);
}
writeFileSync(new URL('./music.wav', import.meta.url), buf);
console.log('peak before gain', peak.toFixed(3));
