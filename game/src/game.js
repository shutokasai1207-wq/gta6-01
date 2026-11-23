// game.js — Solara Heat's state and step: the city alive, the player in it,
// the law watching, and Mama Sol's jobs ticking over.
//
// This module is pure simulation — no DOM, no canvas — so the exact code
// that plays in the browser also runs in headless tests. The browser shell
// (main.js) feeds it input, drains state.events into sound, and draws the
// state with render.js and hud.js.

import { Rng } from './rng.js';
import { buildCity, placeMarker } from './city.js';
import {
  CAR_COLORS, makeCar, makePed, makePlayer, giveRoute,
  stepPlayer, stepTrafficCar, stepPoliceCar, stepRivalCar, stepCarPhysics, stepPed, resolveCollisions,
} from './entities.js';
import { makeWanted, stepWanted, addHeat } from './wanted.js';
import { makeJobs, beginJob, stepJobs } from './jobs.js';

export const VIEW_W = 1280;
export const VIEW_H = 800;

export function createGame(seed, save) {
  const rng = new Rng(seed);
  const city = buildCity(rng);
  const state = {
    rng, city,
    mode: 'title', // title | playing | arrested | down | won
    time: 0,
    player: null,
    cars: [], peds: [], bags: [],
    wanted: makeWanted(),
    jobs: makeJobs(),
    cash: 0, earned: 0,
    events: [],
    banner: null,
    camera: { x: 0, y: 0 },
    view: { w: VIEW_W, h: VIEW_H },
    stats: { steals: 0, rams: 0, pedHits: 0, bags: 0, jobsDone: 0 },
    save: save || { best: 0, wins: 0 },
    hurtCd: 0,
  };

  // Rio starts on foot outside Sol's Diner, where the work is.
  const start = placeMarker(city, "Sol's Diner");
  state.player = makePlayer(start.x, start.y + 26);

  // A first ride, parked by the diner — stealing it is the tutorial.
  const ride = makeCar(start.x + 52, start.y + 10, Math.PI / 2, 'parked', '#e74c3c');
  state.cars.push(ride);

  // Parked cars in the lots.
  for (const block of city.blocks) {
    if (block.kind !== 'parking') continue;
    for (const spot of block.spots) {
      if (rng.chance(0.45)) {
        const car = makeCar(spot.x, spot.y, spot.angle, 'parked', rng.pick(CAR_COLORS));
        state.cars.push(car);
      }
    }
  }

  // Traffic already rolling.
  for (let i = 0; i < 9; i++) {
    const car = makeCar(rng.range(100, city.width - 100), rng.range(100, city.height - 100), 0, 'traffic', rng.pick(CAR_COLORS));
    giveRoute(rng, city, car);
    car.cruise = rng.range(128, 168);
    state.cars.push(car);
  }

  // Pedestrians out for a stroll.
  const walkable = city.blocks.filter((b) => b.kind !== 'place');
  for (let i = 0; i < 16; i++) {
    const block = rng.pick(walkable);
    const ped = makePed(block.x + 10, block.y + 10, block, rng);
    state.peds.push(ped);
  }

  // Cash bags waiting on street corners.
  for (let i = 0; i < 6; i++) state.bags.push(newBag(state));
  return state;
}

function newBag(state) {
  const city = state.city;
  const vx = state.rng.pick(city.vRoads);
  const hy = state.rng.pick(city.hRoads);
  return { x: vx + state.rng.range(-26, 26), y: hy + state.rng.range(-26, 26) };
}

export function startRun(state) {
  state.mode = 'playing';
  beginJob(state, 0);
  state.events.push({ type: 'runStarted' });
}

// Enter or leave a car, if one is in reach. Stealing is a crime.
function tryEnterExit(state) {
  const p = state.player;
  if (p.car) {
    const car = p.car;
    p.car = null;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 26;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 26;
    if (car.kind !== 'police') car.kind = 'parked';
    car.route = null;
    state.events.push({ type: 'exitCar' });
    return;
  }
  let best = null, bestD = 48;
  for (const car of state.cars) {
    if (Math.abs(car.speed) > 42) continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return;
  const stolen = best.owner !== 'player';
  p.car = best;
  best.owner = 'player';
  if (best.kind === 'traffic') { best.kind = 'parked'; best.route = null; }
  state.events.push({ type: 'enterCar', stolen });
  if (stolen) {
    state.stats.steals += 1;
    addHeat(state, best.kind === 'police' ? 40 : 16);
  }
}

function stepAmbient(state, dt) {
  for (const car of state.cars) {
    if (car.kind === 'traffic') stepTrafficCar(state, car, dt);
    else if (car.kind === 'rival') stepRivalCar(state, car, dt);
  }
  for (const ped of state.peds) stepPed(state, ped, dt);
  resolveCollisions(state);
}

export function stepGame(state, input, dt) {
  state.events.length = 0;
  state.time += dt;
  if (state.hurtCd > 0) state.hurtCd -= dt;
  if (state.banner) {
    state.banner.t -= dt;
    if (state.banner.t <= 0) state.banner = null;
  }

  if (state.mode === 'title') {
    stepAmbient(state, dt);
    // A slow pan across the bay behind the title.
    const pan = (Math.sin(state.time * 0.07) + 1) / 2;
    state.camera.x = pan * Math.max(0, state.city.width - state.view.w);
    state.camera.y = Math.max(0, (state.city.height - state.view.h) / 2);
    return;
  }
  if (state.mode !== 'playing') {
    stepAmbient(state, dt);
    return;
  }

  if (input.enterPressed) tryEnterExit(state);

  // A wrecked ride will not move; its driver has to walk.
  const driveInput = state.player.car && state.player.car.health <= 0
    ? { ...input, up: false, down: false }
    : input;
  stepPlayer(state, driveInput, dt);

  for (const car of state.cars) {
    if (car === state.player.car) continue;
    if (car.kind === 'traffic') stepTrafficCar(state, car, dt);
    else if (car.kind === 'rival') stepRivalCar(state, car, dt);
    else if (car.kind === 'police') stepPoliceCar(state, car, dt);
    else if (Math.abs(car.speed) > 0.5) stepCarPhysics(car, { throttle: 0, steer: 0, handbrake: true }, dt);
  }
  for (const ped of state.peds) stepPed(state, ped, dt);
  resolveCollisions(state);

  // Getting run down on foot.
  const p = state.player;
  if (!p.car && state.hurtCd <= 0) {
    for (const car of state.cars) {
      if (Math.abs(car.speed) > 78 && Math.hypot(car.x - p.x, car.y - p.y) < 25) {
        p.health -= 32;
        state.hurtCd = 1.1;
        state.events.push({ type: 'playerHurt', health: p.health });
        if (p.health <= 0) state.mode = 'down';
        break;
      }
    }
  }

  stepWanted(state, dt);
  stepJobs(state, dt);

  // Cash bags.
  for (let i = 0; i < state.bags.length; i++) {
    const bag = state.bags[i];
    if (Math.hypot(bag.x - p.x, bag.y - p.y) < 30) {
      state.cash += 25;
      state.stats.bags += 1;
      state.events.push({ type: 'cash', x: bag.x, y: bag.y });
      state.bags[i] = newBag(state);
    }
  }

  // Everything the step reported — crimes, pay, arrests, the campaign —
  // is settled here, at the end, so events raised by the wanted and job
  // steps are handled in the same step that raised them.
  for (const ev of state.events) {
    if (ev.type === 'pedHit' && ev.byPlayer) {
      addHeat(state, 34);
      state.stats.pedHits += 1;
    } else if (ev.type === 'ram' && ev.byPlayer) {
      addHeat(state, 10);
      state.stats.rams += 1;
    } else if (ev.type === 'crash' && ev.hard) {
      addHeat(state, 6);
    } else if (ev.type === 'jobPaid') {
      state.banner = { title: `+$${ev.amount}`, note: ev.note, t: 2.6 };
    } else if (ev.type === 'jobDone') {
      state.stats.jobsDone += 1;
      state.banner = { title: `Job done: ${ev.title}`, note: ev.note, t: 3 };
    } else if (ev.type === 'arrested') {
      state.mode = 'arrested';
    } else if (ev.type === 'campaignComplete') {
      state.mode = 'won';
      state.save.wins += 1;
      if (state.earned > state.save.best) state.save.best = state.earned;
      state.events.push({ type: 'saveDirty' });
    }
  }

  // Camera follows the player, clamped to the world.
  const tx = Math.max(0, Math.min(state.city.width - state.view.w, p.x - state.view.w / 2));
  const ty = Math.max(0, Math.min(state.city.height - state.view.h, p.y - state.view.h / 2));
  state.camera.x += (tx - state.camera.x) * Math.min(1, dt * 5);
  state.camera.y += (ty - state.camera.y) * Math.min(1, dt * 5);
}
