// audio.js — every sound in Solara Heat is synthesized with WebAudio.
//
// There are no audio files: an engine hum whose pitch follows the player's
// speed, a two-tone siren that fades with the nearest patrol car, and small
// one-shot voices for cash, crashes, paydays and the bust. The context is
// created lazily on the first key press, as browsers require a gesture.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenFlip = 0;
  let muted = false;
  let noiseBuffer = null;

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);

    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineOsc.connect(engineFilter).connect(engineGain).connect(master);
    engineOsc.start();

    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  function tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function thud(vol = 0.3) {
    if (!ctx || muted) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    src.connect(filter).connect(gain).connect(master);
    src.start();
    src.stop(ctx.currentTime + 0.2);
  }

  // One-shot voices, keyed by the game events main.js drains.
  function play(name) {
    if (!ctx || muted) return;
    if (name === 'cash') {
      tone(1240, 0.09, 'sine', 0.16);
      tone(1860, 0.12, 'sine', 0.12, 0.05);
    } else if (name === 'jobPaid') {
      tone(660, 0.11, 'triangle', 0.2);
      tone(880, 0.11, 'triangle', 0.2, 0.1);
      tone(1320, 0.2, 'triangle', 0.2, 0.2);
    } else if (name === 'crash') {
      thud(0.32);
    } else if (name === 'ram') {
      thud(0.22);
      tone(140, 0.12, 'square', 0.1, 0, 70);
    } else if (name === 'enterCar') {
      tone(320, 0.06, 'square', 0.08);
      tone(210, 0.08, 'square', 0.08, 0.06);
    } else if (name === 'arrested') {
      tone(392, 0.22, 'sawtooth', 0.16);
      tone(311, 0.22, 'sawtooth', 0.16, 0.2);
      tone(233, 0.42, 'sawtooth', 0.16, 0.4);
    } else if (name === 'won') {
      tone(523, 0.14, 'triangle', 0.2);
      tone(659, 0.14, 'triangle', 0.2, 0.12);
      tone(784, 0.14, 'triangle', 0.2, 0.24);
      tone(1046, 0.34, 'triangle', 0.22, 0.36);
    } else if (name === 'hurt') {
      tone(200, 0.14, 'square', 0.14, 0, 90);
    }
  }

  // Continuous voices: engine and siren follow the world each frame.
  function update(state, dt) {
    if (!ctx) return;
    const p = state.player;
    const driving = p.car && state.mode === 'playing';
    const speed = driving ? Math.abs(p.car.speed) : 0;
    engineOsc.frequency.value = 55 + speed * 0.55;
    engineGain.gain.value = muted ? 0 : driving ? 0.05 + speed * 0.00012 : 0;

    let nearest = Infinity;
    for (const car of state.cars) {
      if (car.kind !== 'police') continue;
      nearest = Math.min(nearest, Math.hypot(car.x - p.x, car.y - p.y));
    }
    if (nearest < 620 && state.mode === 'playing' && !muted) {
      sirenFlip += dt;
      if (sirenFlip > 0.42) { sirenFlip = 0; sirenOsc.frequency.value = sirenOsc.frequency.value > 800 ? 660 : 920; }
      sirenGain.gain.value = 0.028 * (1 - nearest / 700);
    } else {
      sirenGain.gain.value = 0;
    }
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  return { unlock, play, update, toggleMute };
}
