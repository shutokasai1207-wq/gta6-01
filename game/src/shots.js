// The screenshot scenes behind ?shot=title|drive|chase|foot. Each builds a real
// world from the seed, places the player mid-story, and plays the real rules
// forward under a simple autopilot, so the frame is a moment the game itself
// produces — the same seed always lands on the same frame.
import { LANE, STEP, WORLD } from './config.js';
import { createFreshWorld, freshEvents, stepWorld } from './entities.js';
import { addHeat, createWanted, stepWanted } from './wanted.js';
import { createMissions, stepMissions } from './missions.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { angleDelta, clamp } from './random.js';

const IDLE = { moveX: 0, moveY: 0, throttle: 0, steer: 0, handbrake: false };

/** One staged step, exactly as the live loop runs it. */
function stepScene(state, control) {
  state.events = freshEvents();
  stepWorld(state, control, STEP);
  stepWanted(state, STEP);
  stepMissions(state, STEP);
}

/** Autopilot for a car: steer at the target, cruise, brake when the nose is full. */
function driveControl(state, tx, ty, cruise = 215) {
  const car = state.player.car;
  if (!car) return IDLE;
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const steer = clamp(angleDelta(car.angle, desired) * 2.4, -1, 1);
  const off = Math.abs(angleDelta(car.angle, desired));
  const throttle = off > 2.4 ? -0.5 : car.speed < cruise ? 0.9 : 0;
  return { moveX: 0, moveY: 0, throttle, steer, handbrake: false };
}

/** Autopilot on foot: walk straight at the target. */
function walkControl(state, tx, ty) {
  const p = state.player;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const len = Math.hypot(dx, dy) || 1;
  return { moveX: dx / len, moveY: dy / len, throttle: 0, steer: 0, handbrake: false };
}

/** Put the player behind the wheel of a spare car, placed on a chosen street. */
function putPlayerInCar(state, roadIndex, headingEast = true) {
  const car = state.cars.find((c) => c.kind === 'parked');
  const roadY = state.city.hRoads[roadIndex];
  car.x = state.city.vRoads[1] + 260;
  car.y = roadY + (headingEast ? LANE : -LANE);
  car.angle = headingEast ? 0 : Math.PI;
  car.vx = 0;
  car.vy = 0;
  car.driver = 'player';
  state.player.car = car;
  state.player.x = car.x;
  state.player.y = car.y;
  return car;
}

function stageTitle(seed) {
  const state = createFreshWorld(seed);
  createWanted(state);
  createMissions(state);
  for (let i = 0; i < 240; i += 1) stepScene(state, IDLE);
  return { state, screen: SCREEN_TITLE };
}

function stageDrive(seed) {
  const state = createFreshWorld(seed);
  createWanted(state);
  const m = createMissions(state);
  state.cash = 150; // Job 1 is in the bag; this is the morning of Job 2.
  state.earned = 150;
  m.index = 1;
  m.stage = 0;
  m.toastT = 0;
  // Start on the avenue north of the hotel's street and drive the grid like a
  // player would: up the avenue, then east along the hotel's road to its door.
  const car = state.cars.find((c) => c.kind === 'parked');
  const avenueX = state.city.vRoads[4] + LANE; // the northbound lane
  car.x = avenueX;
  car.y = state.city.hRoads[3];
  car.angle = -Math.PI / 2;
  car.vx = 0;
  car.vy = 0;
  car.driver = 'player';
  state.player.car = car;
  state.player.x = car.x;
  state.player.y = car.y;
  const hotel = state.city.pois.get('hotel');
  const route = [
    { x: avenueX, y: hotel.y },
    { x: hotel.x, y: hotel.y },
  ];
  for (let i = 0; i < 330; i += 1) {
    const target = route[0];
    if (Math.hypot(target.x - car.x, target.y - car.y) < 70 && route.length > 1) route.shift();
    stepScene(state, driveControl(state, target.x, target.y, 250));
  }
  return { state, screen: SCREEN_PLAY };
}

function stageChase(seed) {
  const state = createFreshWorld(seed);
  createWanted(state);
  const m = createMissions(state);
  state.cash = 400;
  state.earned = 400;
  m.index = 2;
  m.stage = 1; // "Now lose the police completely."
  m.toastT = 0;
  const car = putPlayerInCar(state, 3);
  addHeat(state, 330); // three stars' worth of trouble
  state.events = freshEvents();
  stepWanted(state, STEP); // the patrol rolls out
  // Bring the hunt into frame, queued up on the player's tail.
  const police = state.cars.filter((c) => c.kind === 'police');
  const spots = [[-130, -46], [-215, 26], [-305, -95]];
  police.forEach((cop, i) => {
    const [dx, dy] = spots[i % spots.length];
    cop.x = car.x + dx;
    cop.y = car.y + dy;
    cop.angle = 0;
    cop.vx = 0;
    cop.vy = 0;
  });
  state.wanted.bust = 1.05; // the grab is halfway there — run
  for (let i = 0; i < 200; i += 1) {
    stepScene(state, driveControl(state, WORLD.width - 260, car.y, 300));
  }
  if (!state.over) state.wanted.bust = Math.max(state.wanted.bust, 0.9);
  return { state, screen: SCREEN_PLAY };
}

function stageFoot(seed) {
  const state = createFreshWorld(seed);
  createWanted(state);
  createMissions(state);
  const m = state.mission;
  m.toastT = 0;
  const marina = state.city.pois.get('marina');
  state.player.x = marina.x - 300;
  state.player.y = marina.y + 4;
  // Walk toward the pickup but stop a respectful distance short, so the frame
  // keeps both Rio and the marina's gold marker in view.
  const stop = { x: marina.x - 85, y: marina.y };
  for (let i = 0; i < 200; i += 1) {
    stepScene(state, walkControl(state, stop.x, stop.y));
  }
  return { state, screen: SCREEN_PLAY };
}

/** Stage the named scene (title, drive, chase or foot; anything else is title). */
export function stageShot(name, seed) {
  switch (name) {
    case 'drive': return stageDrive(seed);
    case 'chase': return stageChase(seed);
    case 'foot': return stageFoot(seed);
    default: return stageTitle(seed);
  }
}
