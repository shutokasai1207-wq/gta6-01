// shots.js — the four screenshot scenes, staged inside the real game.
//
// Each scene builds a normal game from the seed, arranges one honest moment
// (a title pan, a timed fare, a three-star chase, a walk to the first job),
// then steps the simulation with fixed inputs. Nothing is drawn by hand:
// main.js renders the state these return, so a screenshot is the game.

import { createGame, startRun, stepGame } from './game.js';
import { beginJob } from './jobs.js';
import { placeMarker } from './city.js';

const DT = 1 / 30;
const idle = () => ({ up: false, down: false, left: false, right: false, handbrake: false, enterPressed: false });

function step(state, input, frames) {
  for (let i = 0; i < frames; i++) stepGame(state, input, DT);
}

function putPlayerInRide(state, x, y, angle, speed) {
  const ride = state.cars[0];
  ride.x = x;
  ride.y = y;
  ride.angle = angle;
  ride.speed = speed;
  ride.owner = 'player';
  state.player.car = ride;
  state.player.x = x;
  state.player.y = y;
  return ride;
}

function stageTitle(state) {
  step(state, idle(), 150);
  return state;
}

function stageDrive(state) {
  startRun(state);
  beginJob(state, 1); // Night Fare
  const j = state.jobs;
  j.stage = 1;
  j.timeLeft = 63;
  j.target = placeMarker(state.city, 'Marina Del Sol');
  j.targetName = 'Marina Del Sol';
  j.text = 'She is in a hurry: Marina Del Sol, and the clock is running.';
  state.cash = 150;
  // On the avenue south of the club, already rolling east with traffic.
  const road = state.city.hRoads[2];
  putPlayerInRide(state, 760, road + 20, 0, 175);
  const drive = idle();
  drive.up = true;
  step(state, drive, 46);
  return state;
}

function stageChase(state) {
  startRun(state);
  beginJob(state, 4); // The Duffel
  const j = state.jobs;
  j.stage = 1;
  j.target = placeMarker(state.city, 'Marina Del Sol');
  j.targetName = 'Marina Del Sol';
  j.text = 'Duffel on board and every siren in Solara is awake. Marina Del Sol — do not stop.';
  state.cash = 900;
  state.wanted.heat = 74; // three stars
  state.wanted.stars = 3;
  const road = state.city.hRoads[3];
  putPlayerInRide(state, 900, road + 20, 0, 215);
  const drive = idle();
  drive.up = true;
  step(state, drive, 80);
  // Make sure the frame has its pursuit: any patrol still far off is
  // repositioned into the chase (it keeps driving itself from there).
  const p = state.player;
  const near = state.cars.filter((c) => c.kind === 'police' && Math.hypot(c.x - p.x, c.y - p.y) < 460);
  if (near.length < 2) {
    const cops = state.cars.filter((c) => c.kind === 'police');
    cops.forEach((cop, i) => {
      cop.x = p.x - 120 - i * 90;
      cop.y = p.y - 30 + i * 64;
      cop.angle = 0.2;
      cop.speed = 230;
    });
  }
  step(state, drive, 16);
  state.wanted.bust = 38; // the meter, mid-fill, as the chase closes in
  return state;
}

function stageFoot(state) {
  startRun(state);
  // Rio on foot outside the diner, the first job's marker glowing, the red
  // ride waiting, neighbours strolling the pavement.
  const spot = placeMarker(state.city, "Sol's Diner");
  state.player.x = spot.x - 64;
  state.player.y = spot.y + 34;
  state.player.angle = 0.4;
  let placed = 0;
  for (const ped of state.peds) {
    if (placed >= 5) break;
    ped.x = spot.x - 90 + placed * 44;
    ped.y = spot.y + 66 + (placed % 2) * 22;
    placed++;
  }
  step(state, idle(), 36);
  state.camera.x = Math.max(0, Math.min(state.city.width - state.view.w, state.player.x - 430));
  state.camera.y = Math.max(0, Math.min(state.city.height - state.view.h, state.player.y - 330));
  return state;
}

export function stageShot(seed, name) {
  const state = createGame(seed);
  if (name === 'drive') return stageDrive(state);
  if (name === 'chase') return stageChase(state);
  if (name === 'foot') return stageFoot(state);
  return stageTitle(state);
}
