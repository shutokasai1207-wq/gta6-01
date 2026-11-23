// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps, and the renderer paints what is there. Screens: title, play,
// paused, and the three ways a run ends — arrested, down, or owning the city.
//
// ?seed=N fixes the city and its traffic. ?shot=title|drive|chase|foot (with
// &seed=N) stages that scene instead of running the loop, paints it twice and
// sets window.__shotReady for a screenshot.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, freshEvents, stepWorld, tryInteract } from './entities.js';
import { createWanted, stepWanted } from './wanted.js';
import { createMissions, stepMissions } from './missions.js';
import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_PAUSE, createInput } from './input.js';
import {
  createRenderer, SCREEN_BUSTED, SCREEN_DOWN, SCREEN_PAUSED, SCREEN_PLAY,
  SCREEN_TITLE, SCREEN_WIN,
} from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;
const ZERO_CONTROL = { moveX: 0, moveY: 0, throttle: 0, steer: 0, handbrake: false };

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const audio = createAudio();

/** A whole run, bundled: the world plus the law and the jobs that govern it. */
function buildRun(runSeed) {
  const state = createWorld(createRandom(runSeed));
  createWanted(state);
  createMissions(state);
  return state;
}

function readSave() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? '{}');
    return { best: Number(raw.best) || 0, wins: Number(raw.wins) || 0 };
  } catch {
    return { best: 0, wins: 0 };
  }
}

function writeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}

function runShot(name) {
  try {
    const staged = stageShot(name, seed);
    renderer.snapTo(staged.state);
    let painted = 0;
    const paint = () => {
      renderer.draw(staged.state, staged.screen, { best: 0 }, 0);
      painted += 1;
      if (painted < 2) requestAnimationFrame(paint);
      else window.__shotReady = true;
    };
    requestAnimationFrame(paint);
  } catch (error) {
    window.__shotError = String(error && error.stack ? error.stack : error);
  }
}

function runGame() {
  const input = createInput(canvas);
  const save = readSave();
  let state = buildRun(seed);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();

  window.addEventListener('keydown', () => audio.unlock(), { once: false });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: false });

  function announce(message) {
    status.textContent = message;
  }

  function meta() {
    return { best: Math.max(save.best, state.earned) };
  }

  function endRun(kind) {
    screen = kind;
    if (state.earned > save.best) save.best = state.earned;
    if (kind === SCREEN_WIN) save.wins += 1;
    writeSave(save);
    if (kind === SCREEN_BUSTED) {
      audio.busted();
      announce(`Arrested. Earned ${state.earned} dollars.`);
    } else if (kind === SCREEN_DOWN) {
      audio.fail();
      announce(`Down and out. Earned ${state.earned} dollars.`);
    } else {
      audio.success();
      announce(`Every job done. Earned ${state.earned} dollars. Solara Bay is yours.`);
    }
  }

  function newRun() {
    state = buildRun(Math.floor(Math.random() * 4294967296));
    screen = SCREEN_PLAY;
    accumulator = 0;
    announce('A new night in Solara Bay. Follow the gold marker.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE) {
        screen = SCREEN_PLAY;
        announce('Playing. Follow the gold marker to the first job.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
      } else if (screen === SCREEN_BUSTED || screen === SCREEN_DOWN || screen === SCREEN_WIN) {
        newRun();
      }
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    if (actions & ACTION_INTERACT && screen === SCREEN_PLAY) {
      const happened = tryInteract(state);
      if (happened) audio.door();
      if (happened === 'enter') announce('Car taken.');
    }
  }

  /** Sound and story beats that ride on the step's news. */
  function reactToEvents() {
    const ev = state.events;
    if (ev.pickup) audio.pickup();
    if (ev.cash) {
      audio.cash();
      announce(`Job paid. Cash ${state.cash} dollars.`);
    }
    if (ev.crash > 0.3) audio.crash(ev.crash);
    if (ev.hitPed) announce('You hit someone. The heat is coming.');
    if (ev.carDied) announce('Your ride is wrecked.');
  }

  function step() {
    const control = screen === SCREEN_TITLE
      ? ZERO_CONTROL
      : {
          moveX: input.moveX(), moveY: input.moveY(),
          throttle: input.throttle(), steer: input.steer(),
          handbrake: input.handbrake(),
        };
    state.events = freshEvents();
    stepWorld(state, control, STEP);
    stepWanted(state, STEP);
    if (screen === SCREEN_PLAY) {
      stepMissions(state, STEP);
      reactToEvents();
      if (state.over === 'busted') endRun(SCREEN_BUSTED);
      else if (state.over === 'down') endRun(SCREEN_DOWN);
      else if (state.over === 'win') endRun(SCREEN_WIN);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    audio.update({
      driving: screen === SCREEN_PLAY && Boolean(state.player.car),
      speedRatio: state.player.car ? state.player.car.speed / 430 : 0,
      wanted: screen === SCREEN_PLAY ? state.wanted.stars : 0,
    });
    renderer.draw(state, screen, meta(), Math.min((now - last) / 1000 + STEP, MAX_FRAME));
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solara Heat. Press Enter or click to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
