// ── Reef soundtrack — a real composed loop, rendered in code ─────────────────
// A 16-bar piece at 70 BPM in C major (~55s): sustained chord pad, a soft
// bass walking roots and fifths, a written pentatonic melody in four phrases
// (A A' B A''), and harp-like arpeggios in the answering bars — all washed
// through a synthetic watery reverb. The piece is rendered once into a buffer
// with an OfflineAudioContext, the reverb tail is folded back onto the loop's
// head so the seam is inaudible, and the buffer loops forever. After dark the
// whole track dims and darkens with the sun. Zero audio assets: the song is
// sheet music in code.

const BPM = 70, BEAT = 60 / BPM, BAR = BEAT * 4, BARS = 16;
const LOOP_SEC = BAR * BARS, TAIL_SEC = 2.2;
const FREQ = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// One chord per bar: C Am F G | C Em F G | Am F C G | F Em Dm G  (midi triads)
const PROG = [
  [60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62],
  [60, 64, 67], [52, 55, 59], [53, 57, 60], [55, 59, 62],
  [57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62],
  [53, 57, 60], [52, 55, 59], [50, 53, 57], [55, 59, 62],
];
// The melody: [bar (1-based), beat, midi, length in beats]
const MELODY = [
  [1, 0, 64, 1], [1, 1, 67, 1], [1, 2, 69, 2],
  [2, 0, 67, 1.5], [2, 1.5, 64, 0.5], [2, 2, 62, 2],
  [3, 0, 60, 1], [3, 1, 62, 1], [3, 2, 64, 2],
  [4, 0, 62, 3],
  [5, 0, 64, 1], [5, 1, 67, 1], [5, 2, 69, 2],
  [6, 0, 71, 1.5], [6, 1.5, 69, 0.5], [6, 2, 67, 2],
  [7, 0, 69, 1], [7, 1, 72, 1], [7, 2, 69, 2],
  [8, 0, 67, 4],
  [9, 0, 72, 1.5], [9, 1.5, 69, 0.5], [9, 2, 67, 2],
  [10, 0, 69, 1], [10, 1, 67, 1], [10, 2, 65, 2],
  [11, 0, 64, 1], [11, 1, 67, 1], [11, 2, 72, 2],
  [12, 0, 74, 3.5],
  [13, 0, 72, 1], [13, 1, 69, 1], [13, 2, 65, 2],
  [14, 0, 67, 1.5], [14, 1.5, 64, 0.5], [14, 2, 71, 2],
  [15, 0, 62, 1], [15, 1, 64, 1], [15, 2, 65, 1], [15, 3, 69, 1],
  [16, 0, 67, 2], [16, 2, 64, 2],   // lands on E — hands the loop back to bar 1
];
const ARP_BARS = new Set([5, 6, 7, 8, 13, 14, 15, 16]);

function impulseResponse(off, seconds, decay) {
  const len = Math.floor(off.sampleRate * seconds);
  const buf = off.createBuffer(2, len, off.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export async function renderLoop() {
  const sr = 44100;
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const off = new Offline(2, Math.ceil((LOOP_SEC + TAIL_SEC) * sr), sr);

  const out = off.createGain();
  out.gain.value = 0.9;
  const tone = off.createBiquadFilter();
  tone.type = 'lowpass'; tone.frequency.value = 2600; tone.Q.value = 0.3;
  const conv = off.createConvolver();
  conv.buffer = impulseResponse(off, 1.8, 2.6);
  const dry = off.createGain(); dry.gain.value = 0.75;
  const wet = off.createGain(); wet.gain.value = 0.35;
  out.connect(tone);
  tone.connect(dry); dry.connect(off.destination);
  tone.connect(conv); conv.connect(wet); wet.connect(off.destination);

  const note = (t, midi, dur, { type = 'sine', gain = 0.1, attack = 0.03, release = 0.25, detune = 0 } = {}) => {
    const o = off.createOscillator();
    o.type = type; o.frequency.value = FREQ(midi); o.detune.value = detune;
    const g = off.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, Math.max(t + attack, t + dur - release));
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  };

  PROG.forEach((chord, bar) => {
    const t0 = bar * BAR;
    for (const m of chord) {   // pad — two detuned triangles per chord tone
      note(t0, m, BAR + 0.1, { type: 'triangle', gain: 0.034, attack: 0.5, release: 0.6 });
      note(t0, m, BAR + 0.1, { type: 'triangle', gain: 0.02, attack: 0.5, release: 0.6, detune: 6 });
    }
    // bass — root, then the fifth
    note(t0, chord[0] - 24, BEAT * 2.2, { gain: 0.15, attack: 0.02, release: 0.5 });
    note(t0 + BEAT * 2, chord[0] - 17, BEAT * 2.0, { gain: 0.1, attack: 0.02, release: 0.5 });
    // harp arps in the answering bars
    if (ARP_BARS.has(bar + 1)) {
      for (let i = 0; i < 8; i++) {
        const m = chord[i % 3] + 12 + (i === 7 ? 12 : 0);
        note(t0 + i * BEAT / 2, m, 0.32, { type: 'triangle', gain: 0.042, attack: 0.005, release: 0.25 });
      }
    }
  });
  for (const [bar, beat, m, beats] of MELODY) {
    const t = (bar - 1) * BAR + beat * BEAT;
    note(t, m, beats * BEAT, { gain: 0.082, attack: 0.04, release: 0.3 });
    note(t, m, beats * BEAT, { gain: 0.042, attack: 0.04, release: 0.3, detune: 5 });
  }
  return off.startRendering();
}

export function createReefMusic() {
  let ctx = null, master = null, nightFilter = null, timer = null;
  let enabled = true, nf = 0, building = false;

  async function build() {
    if (building) return;
    building = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    nightFilter = ctx.createBiquadFilter();
    nightFilter.type = 'lowpass'; nightFilter.frequency.value = 2600; nightFilter.Q.value = 0.3;
    nightFilter.connect(master); master.connect(ctx.destination);

    const rendered = await renderLoop();
    // Fold the reverb tail back onto the head so the loop seam is silent.
    const loopSamples = Math.floor(LOOP_SEC * rendered.sampleRate);
    const buf = ctx.createBuffer(2, loopSamples, rendered.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const src = rendered.getChannelData(ch);
      const dst = buf.getChannelData(ch);
      dst.set(src.subarray(0, loopSamples));
      for (let i = 0; i < rendered.length - loopSamples; i++) dst[i] += src[loopSamples + i];
    }
    const song = ctx.createBufferSource();
    song.buffer = buf; song.loop = true;
    song.connect(nightFilter);
    song.start();
    // A whisper of water under the song.
    const wlen = ctx.sampleRate * 2;
    const wbuf = ctx.createBuffer(1, wlen, ctx.sampleRate);
    const wd = wbuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < wlen; i++) {
      last = (last + (Math.random() * 2 - 1) * 0.02) * 0.98;
      wd[i] = last * 6;
    }
    const wash = ctx.createBufferSource();
    wash.buffer = wbuf; wash.loop = true;
    const washFilt = ctx.createBiquadFilter();
    washFilt.type = 'lowpass'; washFilt.frequency.value = 280;
    const washGain = ctx.createGain(); washGain.gain.value = 0.05;
    wash.connect(washFilt); washFilt.connect(washGain); washGain.connect(master);
    wash.start();

    timer = setInterval(() => {
      if (!ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      nightFilter.frequency.setTargetAtTime(2600 - nf * 1500, t, 1.5);
      master.gain.setTargetAtTime(enabled ? 0.5 - nf * 0.16 : 0, t, 0.8);
    }, 400);
    master.gain.linearRampToValueAtTime(enabled ? 0.5 : 0, ctx.currentTime + 3);
  }

  return {
    // Call from any user gesture: builds lazily, resumes if suspended.
    poke() {
      try {
        if (!ctx) build();
        if (ctx && ctx.state === 'suspended') ctx.resume();
      } catch (e) { /* audio unavailable — the reef stays silent, not broken */ }
    },
    setNight(v) { nf = v; },
    setEnabled(v) {
      enabled = v;
      if (ctx && master) master.gain.setTargetAtTime(v ? 0.5 : 0, ctx.currentTime, 0.4);
    },
    toggle() { this.setEnabled(!enabled); return enabled; },
    get enabled() { return enabled; },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      try { ctx?.close(); } catch (e) { /* already closed */ }
      ctx = null;
    },
  };
}
