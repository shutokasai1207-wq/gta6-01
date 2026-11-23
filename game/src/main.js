// main.js — the browser shell: keyboard in, sound out, frames drawn.
//
// The simulation lives in game.js and never touches the DOM; this file owns
// the canvas, the clock and the keys, drains each step's events into the
// synthesizer, and saves Rio's best take to localStorage.
//
// Screenshot mode: open the page with ?shot=title|drive|chase|foot&seed=N
// and it stages that scene, draws one frame and sets window.__shotReady.

import { createGame, startRun, stepGame } from './game.js';
import { drawWorld } from './render.js';
import { drawHud } from './hud.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const seed = params.get('seed') || 'solara-heat';
const SAVE_KEY = 'solara-heat-save-v1';

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { best: parsed.best | 0, wins: parsed.wins | 0 };
    }
  } catch { /* a private window, or a corrupt save: start fresh */ }
  return { best: 0, wins: 0 };
}

const save = loadSave();
const audio = createAudio();
let state = createGame(seed, save);
window.__solara = state;

// --- screenshot mode -------------------------------------------------------
if (params.has('shot')) {
  state = stageShot(seed, params.get('shot'));
  window.__solara = state;
  drawWorld(ctx, state);
  drawHud(ctx, state);
  window.__shotReady = true;
} else {
  play();
}

function play() {
  const keys = new Set();
  let enterQueued = false;
  let lastCrashSound = 0;

  addEventListener('keydown', (ev) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(ev.code)) ev.preventDefault();
    audio.unlock();
    keys.add(ev.code);
    // Car entry is queued from the key event itself, not sampled from the
    // held-keys set: a quick tap can fall between two simulation steps and
    // would otherwise never be seen.
    if ((ev.code === 'KeyE' || ev.code === 'KeyF') && !ev.repeat) enterQueued = true;
    if (ev.code === 'KeyM') audio.toggleMute();
    if (ev.code === 'Enter') {
      if (state.mode === 'title') {
        startRun(state);
      } else if (state.mode === 'arrested' || state.mode === 'down' || state.mode === 'won') {
        state = createGame(seed, save);
        window.__solara = state;
        startRun(state);
      }
    }
  });
  addEventListener('keyup', (ev) => keys.delete(ev.code));

  function input() {
    const enterPressed = enterQueued;
    enterQueued = false;
    return {
      up: keys.has('KeyW') || keys.has('ArrowUp'),
      down: keys.has('KeyS') || keys.has('ArrowDown'),
      left: keys.has('KeyA') || keys.has('ArrowLeft'),
      right: keys.has('KeyD') || keys.has('ArrowRight'),
      handbrake: keys.has('Space'),
      enterPressed,
    };
  }

  const SOUND_FOR = {
    cash: 'cash', jobPaid: 'jobPaid', crash: 'crash', ram: 'ram',
    rivalHit: 'ram', enterCar: 'enterCar', arrested: 'arrested',
    campaignComplete: 'won', playerHurt: 'hurt',
  };

  function drainEvents() {
    for (const ev of state.events) {
      if (ev.type === 'saveDirty') {
        try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* no storage, no save */ }
        continue;
      }
      const sound = SOUND_FOR[ev.type];
      if (!sound) continue;
      if (sound === 'crash' || sound === 'ram') {
        const now = performance.now();
        if (now - lastCrashSound < 90) continue;
        lastCrashSound = now;
      }
      audio.play(sound);
    }
  }

  const STEP = 1 / 60;
  let acc = 0;
  let last = performance.now();
  function frame(now) {
    acc += Math.min(0.12, (now - last) / 1000);
    last = now;
    while (acc >= STEP) {
      stepGame(state, input(), STEP);
      drainEvents();
      acc -= STEP;
    }
    audio.update(state, STEP);
    drawWorld(ctx, state);
    drawHud(ctx, state);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
