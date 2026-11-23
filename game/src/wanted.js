// The law: a heat score that every crime feeds and time out of sight cools, five
// stars of police attention, patrol cars that hunt the player down, and the slow
// grab of an arrest when they pin a slow target. Police cars live in the same
// state.cars list as everyone else; this file owns their brains.
import { BUST_RANGE, BUST_TIME, HEAT, POLICE_BY_STAR } from './config.js';
import { randomRoadPoint } from './city.js';
import { stepCar } from './entities.js';
import { angleDelta, clamp, distance } from './random.js';

/** Attach the wanted record to a fresh world. */
export function createWanted(state) {
  state.wanted = { heat: 0, stars: 0, bust: 0, seen: false };
  return state.wanted;
}

/** Add raw heat points (missions use this for scripted attention). */
export function addHeat(state, points) {
  const w = state.wanted;
  w.heat = clamp(w.heat + points, 0, HEAT.perStar * HEAT.maxStars);
}

/** Turn the step's news into heat: crimes the world reported, priced by the table. */
function priceEvents(state) {
  const ev = state.events;
  if (state.pendingSteal !== null && state.pendingSteal !== undefined) {
    addHeat(state, state.pendingSteal ? HEAT.stealWitnessed : HEAT.stealCar);
    state.pendingSteal = null;
  }
  if (ev.hitPed) addHeat(state, HEAT.hitPed);
  if (ev.hitPolice) addHeat(state, HEAT.hitPolice);
  if (ev.hitCar) addHeat(state, HEAT.hitCar);
  if (ev.hitBuilding) addHeat(state, HEAT.hitBuilding);
  if (ev.ramRival) addHeat(state, HEAT.ramRival);
}

/** Bring one police car onto a road a good way from the player. */
function spawnPolice(state) {
  const { random, city } = state;
  let x = 0;
  let y = 0;
  for (let tries = 0; tries < 12; tries += 1) {
    const at = randomRoadPoint(random, city);
    x = at.x;
    y = at.y;
    const d = distance(x, y, state.player.x, state.player.y);
    if (d > 640 && d < 1150) break;
  }
  const car = {
    id: 9000 + state.cars.length, x, y, angle: random.range(0, Math.PI * 2),
    vx: 0, vy: 0, speed: 0, color: '#20303c', kind: 'police',
    health: 130, driver: 'ai', ai: { leave: false }, dead: false, flash: 0,
  };
  state.cars.push(car);
}

/** One officer's driving: hunt the player, press close, never run down a walker. */
function stepPoliceCar(state, car, dt) {
  const p = state.player;
  const ai = car.ai;
  const dist = distance(car.x, car.y, p.x, p.y);

  if (ai.leave) {
    // Attention moved on: drive off and, once far away, be gone.
    const away = Math.atan2(car.y - p.y, car.x - p.x);
    const steer = clamp(angleDelta(car.angle, away) * 2.4, -1, 1);
    stepCar(state, car, car.speed < 260 ? 0.8 : 0, steer, false, dt);
    car.ai.gone = dist > 1150;
    return;
  }

  // Aim where the player is heading, not where they were.
  const lead = p.car ? clamp(dist / 300, 0, 0.55) : 0;
  const tx = p.x + (p.car ? p.car.vx * lead : 0);
  const ty = p.y + (p.car ? p.car.vy * lead : 0);
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const steer = clamp(angleDelta(car.angle, desired) * 2.8, -1, 1);

  let throttle;
  if (!p.car) {
    // On foot the arrest is the weapon: pull up alongside and stay there, close
    // enough to grab — braking rather than running the player down.
    if (dist > 46) throttle = dist > 130 ? 1 : dist > 70 ? 0.55 : 0.3;
    else throttle = car.speed > 14 ? -0.7 : 0;
  } else if (dist > 130) {
    throttle = 1;
  } else if (dist > 55) {
    throttle = 0.55;
  } else {
    throttle = state.wanted.stars >= 3 ? 0.5 : 0.15; // high heat rams; low heat shadows
  }
  stepCar(state, car, throttle, steer, false, dt);
  car.flash += dt;
}

/**
 * One step of the law: price the news, cool or stoke the heat, keep the patrol at
 * the size the stars demand, drive it, and run the arrest clock.
 */
export function stepWanted(state, dt) {
  const w = state.wanted;
  const p = state.player;
  priceEvents(state);
  w.stars = Math.min(HEAT.maxStars, Math.floor(w.heat / HEAT.perStar));

  const police = state.cars.filter((c) => c.kind === 'police' && c.driver === 'ai');
  w.seen = police.some((c) => !c.dead && distance(c.x, c.y, p.x, p.y) < HEAT.sightRange);
  if (!w.seen && w.stars > 0) {
    w.heat = Math.max(0, w.heat - HEAT.decayPerSecond * dt);
    w.stars = Math.min(HEAT.maxStars, Math.floor(w.heat / HEAT.perStar));
  }

  // The patrol grows and shrinks with the stars.
  const wanted = POLICE_BY_STAR[w.stars];
  const active = police.filter((c) => !c.ai.leave);
  if (active.length < wanted) {
    for (let i = active.length; i < wanted; i += 1) spawnPolice(state);
  } else if (active.length > wanted) {
    for (let i = 0; i < active.length - wanted; i += 1) active[i].ai.leave = true;
  }

  for (const car of state.cars) {
    if (car.kind === 'police' && car.driver === 'ai' && !car.dead) stepPoliceCar(state, car, dt);
  }
  // Retired patrol cars that made it away leave the world.
  for (let i = state.cars.length - 1; i >= 0; i -= 1) {
    if (state.cars[i].ai && state.cars[i].ai.gone) state.cars.splice(i, 1);
  }

  // The arrest clock: a close officer and a slow target.
  const nearest = police
    .filter((c) => !c.dead && !c.ai.leave)
    .reduce((best, c) => Math.min(best, distance(c.x, c.y, p.x, p.y)), Infinity);
  const playerSpeed = p.car ? Math.abs(p.car.speed) : 0;
  const pinned = w.stars > 0 && nearest < (p.car ? BUST_RANGE : 58)
    && (p.car ? playerSpeed < 38 : true);
  if (pinned) w.bust += dt;
  else w.bust = Math.max(0, w.bust - dt * 1.6);
  if (w.bust >= BUST_TIME && !state.over) {
    state.over = 'busted';
    state.events.busted = true;
  }
}
