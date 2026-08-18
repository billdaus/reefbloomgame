// ── Reef ambience — procedural WebAudio, no assets ────────────────────────────
// A slow-breathing underwater pad (four detuned voices drifting between calm
// chords), a low filtered-noise water wash, and occasional pentatonic droplets
// with long tails. After dark the pad dims and deepens and the droplets come
// rarer and an octave lower. Starts only after a user gesture (autoplay rules);
// everything is generated, so the whole soundtrack weighs zero bytes.

const CHORDS = [
  [130.81, 196.00, 246.94, 329.63],   // C  G  B  E   (Cmaj7)
  [146.83, 220.00, 261.63, 349.23],   // D  A  C  F   (Dm7)
  [ 98.00, 146.83, 246.94, 293.66],   // G  D  B  D   (G add)
  [ 87.31, 130.81, 220.00, 261.63],   // F  C  A  C   (Fmaj add)
];
const DROPLETS = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];   // C pentatonic

export function createReefMusic() {
  let ctx = null, master = null, padFilter = null, timer = null;
  const voices = [];
  let enabled = true, nf = 0, chordIdx = 0, nextChord = 0, nextDrop = 0;

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 750;
    padFilter.Q.value = 0.4;
    padFilter.connect(master);

    for (let v = 0; v < 4; v++) {
      const osc = ctx.createOscillator();
      osc.type = v % 2 ? 'sine' : 'triangle';
      osc.frequency.value = CHORDS[0][v];
      osc.detune.value = (v - 1.5) * 4;          // gentle chorus spread
      const g = ctx.createGain();
      g.gain.value = v === 0 ? 0.07 : 0.05;      // root slightly forward
      osc.connect(g); g.connect(padFilter);
      osc.start();
      voices.push(osc);
    }
    // The pad breathes: a very slow LFO wanders the filter cutoff.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 110;
    lfo.connect(lfoGain); lfoGain.connect(padFilter.frequency);
    lfo.start();

    // Water wash: looped brown-ish noise through a deep lowpass.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + (Math.random() * 2 - 1) * 0.02) * 0.98;
      data[i] = last * 6;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const nFilt = ctx.createBiquadFilter();
    nFilt.type = 'lowpass'; nFilt.frequency.value = 300;
    const nGain = ctx.createGain();
    nGain.gain.value = 0.15;
    noise.connect(nFilt); nFilt.connect(nGain); nGain.connect(master);
    noise.start();

    timer = setInterval(tick, 400);
    master.gain.linearRampToValueAtTime(enabled ? 0.12 : 0, ctx.currentTime + 4);
  }

  function tick() {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t >= nextChord) {
      chordIdx = (chordIdx + 1 + Math.floor(Math.random() * 2)) % CHORDS.length;
      CHORDS[chordIdx].forEach((f, i) => {
        voices[i].frequency.cancelScheduledValues(t);
        voices[i].frequency.setValueAtTime(voices[i].frequency.value, t);
        voices[i].frequency.linearRampToValueAtTime(f, t + 5);   // underwater glide
      });
      nextChord = t + 10 + Math.random() * 8;
    }
    if (enabled && t >= nextDrop) {
      const f = DROPLETS[Math.floor(Math.random() * DROPLETS.length)] * (nf > 0.5 ? 0.5 : 1);
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.045, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0004, t + 2.4);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 2.6);
      nextDrop = t + (4 + Math.random() * 7) * (1 + nf * 1.2);   // sparser after dark
    }
    // Night dims the pad and pulls the brightness down with the sun.
    padFilter.frequency.setTargetAtTime(750 - nf * 420, t, 1.5);
    master.gain.setTargetAtTime(enabled ? 0.12 - nf * 0.04 : 0, t, 0.8);
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
      if (ctx && master) master.gain.setTargetAtTime(v ? 0.12 : 0, ctx.currentTime, 0.4);
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
