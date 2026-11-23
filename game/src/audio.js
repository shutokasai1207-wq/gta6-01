// Sound, synthesised live with WebAudio — no audio files, nothing to load. A tiny
// engine hum and a police wail follow the action; the rest are one-shot blips for
// pickups, crashes and job outcomes. Everything is silent until the player's first
// key or click unlocks the context, as browsers require.

/** Create the sound kit. Every method is safe to call before unlock(). */
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let engine = null; // { osc, gain } while the player drives
  let siren = null; // { osc, gain, lfo } while wanted

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    ctx = new AudioCtor();
    master = ctx.createGain();
    master.gain.value = 0.4;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }

  /** One short tone with a soft envelope; `slide` bends the pitch across it. */
  function tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, delay = 0 } = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** A burst of filtered noise: a crash, sized by `strength` 0..1. */
  function crash(strength) {
    if (!ctx || strength <= 0.05) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300 + strength * 900;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.min(0.5, 0.12 + strength * 0.45), t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22 + strength * 0.2);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
    src.stop(t0 + 0.5);
  }

  function startEngine() {
    if (!ctx || engine) return;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 42;
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    gain.gain.value = 0.0;
    osc.connect(filter).connect(gain).connect(master);
    osc.start();
    engine = { osc, gain };
  }

  function stopEngine() {
    if (!engine) return;
    try { engine.osc.stop(); } catch { /* already stopped */ }
    engine = null;
  }

  function startSiren() {
    if (!ctx || siren) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 1050;
    lfo.frequency.value = 0.55;
    lfoGain.gain.value = 330;
    lfo.connect(lfoGain).connect(osc.frequency);
    gain.gain.value = 0.028;
    osc.connect(gain).connect(master);
    osc.start();
    lfo.start();
    siren = { osc, gain, lfo };
  }

  function stopSiren() {
    if (!siren) return;
    try { siren.osc.stop(); siren.lfo.stop(); } catch { /* already stopped */ }
    siren = null;
  }

  return {
    unlock,
    pickup() {
      tone(880, 0.09, { vol: 0.16 });
      tone(1318, 0.12, { vol: 0.16, delay: 0.07 });
    },
    cash() {
      tone(988, 0.08, { type: 'square', vol: 0.07 });
      tone(1319, 0.14, { type: 'square', vol: 0.07, delay: 0.06 });
    },
    success() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { vol: 0.14, delay: i * 0.09 }));
    },
    fail() {
      tone(233, 0.35, { type: 'sawtooth', vol: 0.12, slide: -120 });
    },
    busted() {
      tone(392, 0.2, { type: 'square', vol: 0.1 });
      tone(311, 0.2, { type: 'square', vol: 0.1, delay: 0.18 });
      tone(233, 0.45, { type: 'square', vol: 0.12, delay: 0.36 });
    },
    crash,
    door() {
      tone(196, 0.07, { type: 'square', vol: 0.1 });
      tone(147, 0.09, { type: 'square', vol: 0.1, delay: 0.06 });
    },
    /** Follow the frame: engine note by speed, siren while the heat is on. */
    update({ driving, speedRatio, wanted }) {
      if (!ctx) return;
      if (driving) {
        startEngine();
        engine.osc.frequency.value = 42 + Math.abs(speedRatio) * 165;
        engine.gain.gain.value = 0.035 + Math.abs(speedRatio) * 0.03;
      } else {
        stopEngine();
      }
      if (wanted > 0) startSiren();
      else stopSiren();
    },
  };
}
