// The moving world: the player on foot and behind wheels, traffic that follows the
// lanes, parked cars waiting to be borrowed, pedestrians on the sidewalks, and the
// collisions between all of them. Pure simulation — no DOM, no drawing — so a run
// can be stepped headlessly and always lands the same way from the same seed.
import {
  BLOCK, CAR, CAR_COLORS, COLS, LANE, PARKED_COUNT, PED_COUNT, PICKUP_COUNT,
  PICKUP_VALUE, PLAYER, ROWS, TRAFFIC_COUNT, WORLD,
} from './config.js';
import { buildCity, collideSolids, PITCH, blockX, blockY } from './city.js';
import { angleDelta, clamp, createRandom, distance } from './random.js';

/** Compass directions traffic drives in: east, south, west, north. */
const DIRS = [
  { x: 1, y: 0, angle: 0 },
  { x: 0, y: 1, angle: Math.PI / 2 },
  { x: -1, y: 0, angle: Math.PI },
  { x: 0, y: -1, angle: -Math.PI / 2 },
];

let nextCarId = 1;

/** The per-step news the rest of the game reacts to (sounds, heat, mission hooks). */
export function freshEvents() {
  return {
    pickup: false, cash: false, crash: 0,
    hitPed: false, hitPolice: false, hitCar: false, hitBuilding: false, ramRival: false,
    playerHurt: 0, carDied: false, busted: false, down: false,
  };
}

/** Build a fresh world: city, traffic, parked cars, pedestrians, cash bags. */
export function createWorld(random) {
  const city = buildCity(random);
  const state = {
    random,
    city,
    time: 0,
    player: { x: 0, y: 0, angle: -Math.PI / 2, health: PLAYER.health, car: null, hurtCd: 0 },
    cars: [],
    peds: [],
    pickups: [],
    particles: [],
    cash: 0,
    earned: 0,
    pendingSteal: null,
    rivalHits: 0,
    over: null,
    events: freshEvents(),
  };
  const diner = city.pois.get('diner');
  state.player.x = diner.x;
  state.player.y = diner.y + 14;

  for (let i = 0; i < TRAFFIC_COUNT; i += 1) spawnTrafficCar(state);
  spawnParkedCars(state);
  spawnRivalCar(state);
  for (let i = 0; i < PED_COUNT; i += 1) spawnPed(state);
  for (let i = 0; i < PICKUP_COUNT; i += 1) spawnPickup(state);
  return state;
}

function makeCar(x, y, angle, color, kind) {
  return {
    id: nextCarId++, x, y, angle, vx: 0, vy: 0, speed: 0,
    color, kind, health: CAR.health, driver: null, ai: null,
    dead: false, flash: 0,
  };
}

/** The lane line a car in `dir` on road centre `centre` should hold. */
function laneLine(dir, centre) {
  // Right-hand traffic: east rides south of centre, south rides west, and so on.
  if (dir === 0) return centre + LANE;
  if (dir === 1) return centre - LANE;
  if (dir === 2) return centre - LANE;
  return centre + LANE;
}

/** The next intersection ahead of a point travelling in `dir` from (cx, cy). */
function nextIntersection(city, cx, cy, dir) {
  const ahead = 30;
  if (dir === 0) return { x: city.vRoads.find((v) => v > cx + ahead) ?? WORLD.width, y: cy };
  if (dir === 2) return { x: [...city.vRoads].reverse().find((v) => v < cx - ahead) ?? 0, y: cy };
  if (dir === 1) return { x: cx, y: city.hRoads.find((v) => v > cy + ahead) ?? WORLD.height };
  return { x: cx, y: [...city.hRoads].reverse().find((v) => v < cy - ahead) ?? 0 };
}

function spawnTrafficCar(state) {
  const { random, city } = state;
  for (let tries = 0; tries < 12; tries += 1) {
    const vertical = random.chance(0.5);
    const dir = vertical ? random.pick([1, 3]) : random.pick([0, 2]);
    const road = vertical ? random.pick(city.vRoads) : random.pick(city.hRoads);
    const along = vertical
      ? random.range(city.hRoads[0], city.hRoads[city.hRoads.length - 1])
      : random.range(city.vRoads[0], city.vRoads[city.vRoads.length - 1]);
    const x = vertical ? laneLine(dir, road) : along;
    const y = vertical ? along : laneLine(dir, road);
    if (distance(x, y, state.player.x, state.player.y) < 420) continue;
    // The brain steers from the crossing behind it: name that crossing honestly.
    const behindV = dir === 0
      ? [...city.vRoads].reverse().find((v) => v <= x) ?? city.vRoads[0]
      : city.vRoads.find((v) => v >= x) ?? city.vRoads[city.vRoads.length - 1];
    const behindH = dir === 1
      ? [...city.hRoads].reverse().find((v) => v <= y) ?? city.hRoads[0]
      : city.hRoads.find((v) => v >= y) ?? city.hRoads[city.hRoads.length - 1];
    const car = makeCar(x, y, DIRS[dir].angle, random.pick(CAR_COLORS), 'traffic');
    car.driver = 'ai';
    car.ai = {
      dir,
      roadX: vertical ? road : behindV,
      roadY: vertical ? behindH : road,
      targetSpeed: random.range(140, 205),
    };
    state.cars.push(car);
    return;
  }
}

/** Parked cars wait in the open lots, a few near the marina boardwalk. */
function spawnParkedCars(state) {
  const { random, city } = state;
  const lots = city.blocks.filter((b) => b.kind === 'lot');
  let placed = 0;
  for (const lot of lots) {
    const rows = 2;
    for (let r = 0; r < rows && placed < PARKED_COUNT; r += 1) {
      for (let i = 0; i < 5 && placed < PARKED_COUNT; i += 1) {
        if (random.chance(0.3)) continue;
        const x = lot.x + 52 + i * 58;
        const y = lot.y + 74 + r * 92;
        const car = makeCar(x, y, Math.PI / 2, random.pick(CAR_COLORS), 'parked');
        state.cars.push(car);
        placed += 1;
      }
    }
  }
  while (placed < PARKED_COUNT) {
    const x = random.range(200, WORLD.width - 200);
    const car = makeCar(x, city.hRoads[city.hRoads.length - 1] + 30, 0, random.pick(CAR_COLORS), 'parked');
    state.cars.push(car);
    placed += 1;
  }
}

/** The rival courier's purple ride, cruising the grid until someone picks a fight. */
function spawnRivalCar(state) {
  const { city } = state;
  const road = city.hRoads[2];
  const car = makeCar(city.vRoads[5], laneLine(0, road), 0, '#8e44ad', 'rival');
  car.driver = 'ai';
  car.health = 170;
  car.ai = {
    dir: 0, roadX: city.vRoads[5], roadY: road,
    targetSpeed: 225, turnIn: 0.5,
  };
  state.cars.push(car);
  state.rival = car;
}

/** A point on a block's sidewalk loop, `s` px along it; also its walking angle. */
export function perimeterPoint(block, s) {
  const inset = 12;
  const w = BLOCK - inset * 2;
  const per = w * 4;
  let t = ((s % per) + per) % per;
  const x0 = block.x + inset;
  const y0 = block.y + inset;
  if (t < w) return { x: x0 + t, y: y0, angle: 0 };
  t -= w;
  if (t < w) return { x: x0 + w, y: y0 + t, angle: Math.PI / 2 };
  t -= w;
  if (t < w) return { x: x0 + w - t, y: y0 + w, angle: Math.PI };
  t -= w;
  return { x: x0, y: y0 + w - t, angle: -Math.PI / 2 };
}

function spawnPed(state) {
  const { random, city } = state;
  const block = random.pick(city.blocks);
  const s = random.range(0, (BLOCK - 24) * 4);
  const at = perimeterPoint(block, s);
  state.peds.push({
    x: at.x, y: at.y, angle: at.angle, block, s,
    dirSign: random.chance(0.5) ? 1 : -1,
    speed: random.range(38, 62),
    color: random.pick(CAR_COLORS),
    down: 0, flee: 0, threatX: 0, threatY: 0,
  });
}

function spawnPickup(state) {
  const { random, city } = state;
  const block = random.pick(city.blocks);
  const at = perimeterPoint(block, random.range(0, (BLOCK - 24) * 4));
  state.pickups.push({ x: at.x, y: at.y, taken: false, timer: 0 });
}

/**
 * Arcade car physics, shared by the player, traffic, the rival and the police:
 * throttle and steer in, one step of motion out. Returns what the car struck.
 */
export function stepCar(state, car, throttle, steer, handbrake, dt) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const lx = -fy;
  const ly = fx;
  let vf = car.vx * fx + car.vy * fy;
  let vl = car.vx * lx + car.vy * ly;

  if (car.dead) {
    vf -= vf * 2.4 * dt;
    vl -= vl * 2.4 * dt;
  } else if (throttle > 0) {
    vf += CAR.accel * throttle * dt;
  } else if (throttle < 0) {
    vf += (vf > 12 ? -CAR.brake : -CAR.reverse) * -throttle * dt;
  }
  vf -= vf * 0.5 * dt;
  if (handbrake) vf -= vf * 3.4 * dt;
  vf = clamp(vf, -CAR.maxReverse, CAR.maxSpeed);
  if (throttle === 0 && Math.abs(vf) < 3) vf = 0;
  vl *= Math.exp(-CAR.grip * dt);

  // Steering bites in proportion to speed, but never so weakly a slow car cannot
  // turn at all — a patrol car nosing toward a kerb still has to come around.
  let steerAuthority = clamp(vf / 150, -1, 1);
  if (steerAuthority !== 0 && Math.abs(steerAuthority) < 0.32) {
    steerAuthority = 0.32 * Math.sign(steerAuthority);
  }
  car.angle += steer * 2.25 * steerAuthority * dt;
  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  car.vx = nfx * vf + -nfy * vl;
  car.vy = nfy * vf + nfx * vl;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.speed = vf;

  const impactSpeed = Math.abs(vf);
  const resolved = collideSolids(state.city, car.x, car.y, CAR.radius);
  car.x = resolved.x;
  car.y = resolved.y;
  if (resolved.hit) {
    car.vx *= -0.16;
    car.vy *= -0.16;
    car.speed = 0;
    return { hit: true, hitBuilding: resolved.hitBuilding, impact: impactSpeed };
  }
  return { hit: false, hitBuilding: false, impact: 0 };
}

/** Charge a car for a crash it was in; a wreck stops being anyone's ride. */
function damageCar(state, car, amount, x, y) {
  if (car.dead) return;
  car.health -= amount;
  spawnSparks(state, x, y, 7, '#ffd23e');
  if (car.health <= 0) {
    car.dead = true;
    car.driver = null;
    spawnSparks(state, car.x, car.y, 22, '#e2725b');
  }
}

export function spawnSparks(state, x, y, count, color) {
  for (let i = 0; i < count; i += 1) {
    const a = state.random.range(0, Math.PI * 2);
    const sp = state.random.range(30, 190);
    state.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: state.random.range(0.25, 0.6), maxLife: 0.6,
      color, size: state.random.range(1.5, 3.5),
    });
  }
}

/** The nearest car the player could climb into, or null. */
export function enterableCar(state) {
  const p = state.player;
  let best = null;
  let bestD = 56;
  for (const car of state.cars) {
    if (car.dead || car.kind === 'rival' || car.driver === 'player') continue;
    if (car.driver === 'ai' && Math.abs(car.speed) > 30) continue;
    const d = distance(p.x, p.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

/** E key: climb into a nearby car, or out of the current one. Returns what happened. */
export function tryInteract(state) {
  const p = state.player;
  if (p.car) {
    const car = p.car;
    car.driver = null;
    if (car.kind === 'traffic') car.kind = 'parked'; // its driver ran off; it stays
    p.car = null;
    const side = car.angle + Math.PI / 2;
    const resolved = collideSolids(state.city, car.x + Math.cos(side) * 34, car.y + Math.sin(side) * 34, PLAYER.radius);
    p.x = resolved.x;
    p.y = resolved.y;
    return 'exit';
  }
  const car = enterableCar(state);
  if (!car) return null;
  const wasDriven = car.driver === 'ai';
  car.driver = 'player';
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  // The theft is queued, not stepped: interactions land between steps, so the
  // wanted system picks this up on its next step and prices it then.
  state.pendingSteal = wasDriven
    || state.cars.some((c) => c.kind === 'police' && distance(c.x, c.y, p.x, p.y) < 330)
    || state.peds.some((ped) => ped.down <= 0 && distance(ped.x, ped.y, p.x, p.y) < 210);
  return 'enter';
}

/** Advance the player (and their car, if they are in one) by one step. */
function stepPlayer(state, control, dt) {
  const p = state.player;
  p.hurtCd = Math.max(0, p.hurtCd - dt);
  if (p.car) {
    const car = p.car;
    const struck = stepCar(state, car, control.throttle, control.steer, control.handbrake, dt);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (struck.hit && struck.impact > 120) {
      const dmg = (struck.impact - 120) / 11;
      damageCar(state, car, dmg, car.x, car.y);
      state.events.crash = Math.max(state.events.crash, struck.impact / CAR.maxSpeed);
      if (struck.hitBuilding) state.events.hitBuilding = true;
      if (car.dead && p.car === car) {
        // The wreck gives up its driver, scorched but standing.
        p.car = null;
        car.driver = null;
        p.health -= 16;
        state.events.carDied = true;
        const resolved = collideSolids(state.city, car.x + 30, car.y, PLAYER.radius);
        p.x = resolved.x;
        p.y = resolved.y;
      }
    }
    return;
  }
  const mx = control.moveX;
  const my = control.moveY;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    const vx = (mx / len) * PLAYER.walkSpeed;
    const vy = (my / len) * PLAYER.walkSpeed;
    p.x += vx * dt;
    p.y += vy * dt;
    p.angle = Math.atan2(vy, vx);
  }
  const resolved = collideSolids(state.city, p.x, p.y, PLAYER.radius);
  p.x = resolved.x;
  p.y = resolved.y;
}

/** Does a road actually run from this crossing in `dir`? (Edges say no.) */
function dirHasRoad(city, roadX, roadY, dir) {
  if (dir === 0) return roadX < city.vRoads[city.vRoads.length - 1] - 1;
  if (dir === 2) return roadX > city.vRoads[0] + 1;
  if (dir === 1) return roadY < city.hRoads[city.hRoads.length - 1] - 1;
  return roadY > city.hRoads[0] + 1;
}

/** What a traffic brain wants at an intersection: mostly straight on, never off-map. */
function chooseTrafficDir(state, car) {
  const { random, city } = state;
  const ai = car.ai;
  const roll = random();
  const wanted = [ai.dir, (ai.dir + 1) % 4, (ai.dir + 3) % 4];
  const pick = roll < 0.52 ? wanted[0] : roll < 0.76 ? wanted[1] : wanted[2];
  for (const dir of [pick, ...wanted]) {
    if (dirHasRoad(city, ai.roadX, ai.roadY, dir)) {
      ai.dir = dir;
      return;
    }
  }
}

/** Drive one AI car (traffic or the rival) along its lane for a step. */
function stepTrafficCar(state, car, dt) {
  if (car.driver !== 'ai' || car.dead) return;
  const ai = car.ai;
  const city = state.city;
  const crossing = { x: ai.roadX, y: ai.roadY };
  // The intersection this car is heading for, from the crossing it last passed.
  const target = nextIntersection(city, crossing.x, crossing.y, ai.dir);
  const laneTarget = {
    x: ai.dir === 1 ? laneLine(1, ai.roadX) : ai.dir === 3 ? laneLine(3, ai.roadX) : target.x,
    y: ai.dir === 0 ? laneLine(0, ai.roadY) : ai.dir === 2 ? laneLine(2, ai.roadY) : target.y,
  };
  // Reaching the crossing: adopt it and choose where to go next.
  const along = ai.dir === 0 ? car.x - target.x : ai.dir === 2 ? target.x - car.x
    : ai.dir === 1 ? car.y - target.y : target.y - car.y;
  if (along > -6) {
    if (ai.dir === 0 || ai.dir === 2) ai.roadX = target.x;
    else ai.roadY = target.y;
    chooseTrafficDir(state, car);
  }
  const desired = Math.atan2(laneTarget.y - car.y, laneTarget.x - car.x);
  const steer = clamp(angleDelta(car.angle, desired) * 2.4, -1, 1);

  // Brake for whatever is ahead in the lane: another car, or a pedestrian.
  let throttle = car.speed < ai.targetSpeed ? 0.75 : 0;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of state.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const fwd = dx * fx + dy * fy;
    const lat = Math.abs(dx * -fy + dy * fx);
    if (fwd > 0 && fwd < 84 && lat < 21) { throttle = fwd < 44 ? -0.9 : 0; break; }
  }
  if (throttle > 0 && !state.player.car) {
    const dx = state.player.x - car.x;
    const dy = state.player.y - car.y;
    const fwd = dx * fx + dy * fy;
    const lat = Math.abs(dx * -fy + dy * fx);
    if (fwd > 0 && fwd < 62 && lat < 18) throttle = -0.9;
  }
  stepCar(state, car, throttle, steer, false, dt);
}

/** Pedestrians stroll their block's sidewalk loop and scatter from fast metal. */
function stepPeds(state, dt) {
  for (const ped of state.peds) {
    if (ped.down > 0) {
      ped.down -= dt;
      continue;
    }
    if (ped.flee > 0) {
      ped.flee -= dt;
      const away = Math.atan2(ped.y - ped.threatY, ped.x - ped.threatX);
      ped.x += Math.cos(away) * 235 * dt;
      ped.y += Math.sin(away) * 235 * dt;
      ped.angle = away;
      if (ped.flee <= 0) {
        // Settle back onto the nearest block's loop.
        const col = clamp(Math.round((ped.x - blockX(0)) / PITCH), 0, COLS - 1);
        const row = clamp(Math.round((ped.y - blockY(0)) / PITCH), 0, ROWS - 1);
        ped.block = state.city.blocks[row * COLS + col];
        ped.s = nearestPerimeterS(ped.block, ped.x, ped.y);
      }
      continue;
    }
    // Scatter: a fast car close by, or the player's car bearing down.
    for (const car of state.cars) {
      if (car.dead) continue;
      const d = distance(ped.x, ped.y, car.x, car.y);
      if (d < 96 && Math.abs(car.speed) > 150) {
        ped.flee = 1.4;
        ped.threatX = car.x;
        ped.threatY = car.y;
        break;
      }
    }
    if (ped.flee > 0) continue;
    ped.s += ped.dirSign * ped.speed * dt;
    const at = perimeterPoint(ped.block, ped.s);
    ped.x = at.x;
    ped.y = at.y;
    ped.angle = ped.dirSign > 0 ? at.angle : at.angle + Math.PI;
  }
}

/** The perimeter parameter closest to a point (used when a fleeing ped settles). */
function nearestPerimeterS(block, x, y) {
  const inset = 12;
  const w = BLOCK - inset * 2;
  const cx = clamp(x, block.x + inset, block.x + inset + w);
  const cy = clamp(y, block.y + inset, block.y + inset + w);
  const dx = cx - (block.x + inset);
  const dy = cy - (block.y + inset);
  const options = [
    { s: dx, d: Math.abs(y - (block.y + inset)) },
    { s: w + dy, d: Math.abs(x - (block.x + inset + w)) },
    { s: 2 * w + (w - dx), d: Math.abs(y - (block.y + inset + w)) },
    { s: 3 * w + (w - dy), d: Math.abs(x - (block.x + inset)) },
  ];
  options.sort((a, b) => a.d - b.d);
  return options[0].s;
}

/** Cash bags: collected on touch, back a while later somewhere else. */
function stepPickups(state, dt) {
  const p = state.player;
  for (const bag of state.pickups) {
    if (bag.taken) {
      bag.timer -= dt;
      if (bag.timer <= 0) {
        const block = state.random.pick(state.city.blocks);
        const at = perimeterPoint(block, state.random.range(0, (BLOCK - 24) * 4));
        bag.x = at.x;
        bag.y = at.y;
        bag.taken = false;
      }
      continue;
    }
    if (distance(p.x, p.y, bag.x, bag.y) < 30) {
      bag.taken = true;
      bag.timer = 40;
      state.cash += PICKUP_VALUE;
      state.earned += PICKUP_VALUE;
      state.events.pickup = true;
      spawnSparks(state, bag.x, bag.y, 6, '#57e389');
    }
  }
}

/** Cars meet cars, cars meet pedestrians: push apart, charge damage, tell the news. */
function stepCollisions(state, dt) {
  const cars = state.cars;
  const p = state.player;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = CAR.radius * 2 - 5;
      if (d === 0 || d >= min) continue;
      const nx = dx / d;
      const ny = dy / d;
      const push = (min - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const impact = -rel;
        // Equal masses: swap the normal component of velocity, softened by bounce.
        const swap = (rel * (1 + 0.35)) / 2;
        a.vx += nx * swap;
        a.vy += ny * swap;
        b.vx -= nx * swap;
        b.vy -= ny * swap;
        if (impact > 85) {
          const dmg = (impact - 85) / 9;
          damageCar(state, a, dmg, a.x, a.y);
          damageCar(state, b, dmg, b.x, b.y);
          const playerIn = p.car === a || p.car === b;
          if (playerIn) {
            const other = p.car === a ? b : a;
            state.events.crash = Math.max(state.events.crash, impact / CAR.maxSpeed);
            if (other.kind === 'police') state.events.hitPolice = true;
            else if (other.kind === 'rival') {
              state.events.ramRival = true;
              state.rivalHits += 1;
            } else state.events.hitCar = true;
          }
        }
      }
      for (const car of [a, b]) {
        const resolved = collideSolids(state.city, car.x, car.y, CAR.radius);
        car.x = resolved.x;
        car.y = resolved.y;
      }
    }
  }
  // Cars versus the player on foot, and versus pedestrians.
  for (const car of cars) {
    if (car.dead) continue;
    if (!p.car && p.hurtCd <= 0 && distance(p.x, p.y, car.x, car.y) < CAR.radius + PLAYER.radius - 3) {
      if (Math.abs(car.speed) > 80) {
        const hurt = Math.min(30, Math.abs(car.speed) / 9);
        p.health -= hurt;
        p.hurtCd = 1;
        state.events.playerHurt = hurt;
        p.x += Math.cos(car.angle) * 26;
        p.y += Math.sin(car.angle) * 26;
        if (p.health <= 0) {
          p.health = 0;
          state.over = 'down';
          state.events.down = true;
        }
      }
    }
    for (const ped of state.peds) {
      if (ped.down > 0) continue;
      const d = distance(ped.x, ped.y, car.x, car.y);
      if (d >= CAR.radius + 9) continue;
      if (Math.abs(car.speed) > 65) {
        ped.down = 5;
        ped.x += car.vx * 0.16;
        ped.y += car.vy * 0.16;
        spawnSparks(state, ped.x, ped.y, 5, '#e84c3d');
        if (car.driver === 'player') state.events.hitPed = true;
      } else {
        ped.flee = 1;
        ped.threatX = car.x;
        ped.threatY = car.y;
      }
    }
  }
  void dt;
}

function stepParticles(state, dt) {
  const list = state.particles;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const pt = list[i];
    pt.life -= dt;
    if (pt.life <= 0) {
      list.splice(i, 1);
      continue;
    }
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= Math.exp(-3 * dt);
    pt.vy *= Math.exp(-3 * dt);
  }
}

/**
 * One whole step of the world the police don't own: player, traffic, the rival,
 * pedestrians, pickups, collisions and particles. Police move in wanted.js.
 */
export function stepWorld(state, control, dt) {
  state.time += dt;
  stepPlayer(state, control, dt);
  for (const car of state.cars) {
    if (car.kind === 'traffic' || car.kind === 'rival') stepTrafficCar(state, car, dt);
    if (car.flash > 0) car.flash -= dt;
  }
  stepPeds(state, dt);
  stepPickups(state, dt);
  stepCollisions(state, dt);
  stepParticles(state, dt);
}

/** A world factory that reseeds the id counter — used by staged screenshots. */
export function createFreshWorld(seed) {
  nextCarId = 1;
  return createWorld(createRandom(seed));
}
