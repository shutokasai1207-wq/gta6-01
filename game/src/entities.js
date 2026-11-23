// entities.js — the moving things of Solara Bay and how they move.
//
// Everything here is plain data and step functions over the game state, so
// the same code runs in the browser and in headless tests. Rendering and
// sound live elsewhere; this module only moves things and reports what
// happened through state.events (a stolen car, a ram, a pedestrian hit).

import { LANE, collideSolids, clampWorld } from './city.js';

export const CAR_COLORS = ['#e74c3c', '#f39c12', '#27ae60', '#2980d9', '#9b59b6', '#ecf0f1', '#e67e22', '#1abc9c', '#fd79a8', '#95a5a6'];

let nextId = 1;

export function makeCar(x, y, angle, kind, color) {
  return {
    id: nextId++, kind, x, y, angle,
    speed: 0, steer: 0, color,
    health: 100, radius: 17,
    cruise: 150, maxSpeed: 320,
    route: null, // traffic routing state, set by giveRoute
    bust: 0,
  };
}

export function makePlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, radius: 10,
    car: null, // the car object being driven, or null on foot
    health: 100, walkCycle: 0,
  };
}

export function makePed(x, y, block, rng) {
  return {
    id: nextId++, x, y, angle: rng.range(0, Math.PI * 2),
    block, corner: rng.int(0, 3), speed: rng.range(34, 52),
    state: 'stroll', fleeT: 0, downT: 0, hue: rng.int(0, 360),
  };
}

// --- traffic routing -------------------------------------------------------
// A route is: travel along `axis` road number `road` in direction `dir`
// until intersection `nextCross`, then choose again.

export function giveRoute(rng, city, car) {
  const axis = rng.chance(0.5) ? 'v' : 'h';
  const road = axis === 'v' ? rng.int(0, city.vRoads.length - 1) : rng.int(0, city.hRoads.length - 1);
  const dir = rng.chance(0.5) ? 1 : -1;
  car.route = { axis, road, dir, nextCross: 0 };
  // Start mid-segment: pick a cross index ahead of a random position.
  if (axis === 'v') {
    car.x = city.vRoads[road] + (dir > 0 ? -LANE : LANE);
    car.route.nextCross = nearestCrossAhead(city.hRoads, car.y, dir);
    car.angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  } else {
    car.y = city.hRoads[road] + (dir > 0 ? LANE : -LANE);
    car.route.nextCross = nearestCrossAhead(city.vRoads, car.x, dir);
    car.angle = dir > 0 ? 0 : Math.PI;
  }
}

function nearestCrossAhead(lines, pos, dir) {
  let best = dir > 0 ? lines.length - 1 : 0;
  let bestDist = Infinity;
  for (let i = 0; i < lines.length; i++) {
    const d = (lines[i] - pos) * dir;
    if (d > 30 && d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

function routeTarget(city, car) {
  const r = car.route;
  if (r.axis === 'v') {
    return { x: city.vRoads[r.road] + (r.dir > 0 ? -LANE : LANE), y: city.hRoads[r.nextCross] };
  }
  return { x: city.vRoads[r.nextCross], y: city.hRoads[r.road] + (r.dir > 0 ? LANE : -LANE) };
}

function chooseAtIntersection(rng, city, car) {
  const r = car.route;
  const ciV = r.axis === 'v' ? r.road : r.nextCross;
  const ciH = r.axis === 'v' ? r.nextCross : r.road;
  const options = [];
  // Straight on.
  if (r.axis === 'v' && ciH + r.dir >= 0 && ciH + r.dir < city.hRoads.length) {
    options.push({ axis: 'v', road: ciV, dir: r.dir, nextCross: ciH + r.dir, w: 3 });
  }
  if (r.axis === 'h' && ciV + r.dir >= 0 && ciV + r.dir < city.vRoads.length) {
    options.push({ axis: 'h', road: ciH, dir: r.dir, nextCross: ciV + r.dir, w: 3 });
  }
  // Turns onto the crossing road, either way.
  for (const d of [1, -1]) {
    if (r.axis === 'v' && ciV + d >= 0 && ciV + d < city.vRoads.length) {
      options.push({ axis: 'h', road: ciH, dir: d, nextCross: ciV + d, w: 1 });
    }
    if (r.axis === 'h' && ciH + d >= 0 && ciH + d < city.hRoads.length) {
      options.push({ axis: 'v', road: ciV, dir: d, nextCross: ciH + d, w: 1 });
    }
  }
  if (!options.length) {
    // Dead end of the grid: turn around.
    car.route = { axis: r.axis, road: r.road, dir: -r.dir, nextCross: r.axis === 'v' ? ciH - r.dir : ciV - r.dir };
    return;
  }
  const total = options.reduce((s, o) => s + o.w, 0);
  let roll = rng.next() * total;
  for (const o of options) {
    roll -= o.w;
    if (roll <= 0) { car.route = { axis: o.axis, road: o.road, dir: o.dir, nextCross: o.nextCross }; return; }
  }
  const last = options[options.length - 1];
  car.route = { axis: last.axis, road: last.road, dir: last.dir, nextCross: last.nextCross };
}

// --- shared car physics ----------------------------------------------------

export function stepCarPhysics(car, ctl, dt) {
  const accel = car.kind === 'police' ? 300 : 260;
  if (ctl.throttle > 0) {
    car.speed += ctl.throttle * accel * dt;
  } else if (ctl.throttle < 0) {
    if (car.speed > 12) car.speed += ctl.throttle * 380 * dt; // brakes
    else car.speed += ctl.throttle * 150 * dt; // reverse
  }
  car.speed -= car.speed * 0.55 * dt; // drag
  if (!ctl.throttle) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  const max = car.maxSpeed;
  car.speed = Math.max(-95, Math.min(max, car.speed));

  const steerAuthority = Math.max(-1.7, Math.min(1.7, car.speed / 46));
  car.steer = ctl.steer;
  car.angle += ctl.steer * 1.55 * steerAuthority * dt * (ctl.handbrake ? 1.6 : 1);
  if (ctl.handbrake) car.speed -= car.speed * 0.9 * dt;

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}

function angleTo(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function controlsToward(car, tx, ty, targetSpeed) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  const diff = angleTo(car.angle, want);
  return {
    steer: Math.max(-1, Math.min(1, diff * 2.4)),
    throttle: car.speed < targetSpeed ? 0.85 : car.speed > targetSpeed + 24 ? -0.5 : 0.1,
    handbrake: false,
  };
}

function obstacleAhead(state, car, dist) {
  const px = car.x + Math.cos(car.angle) * dist;
  const py = car.y + Math.sin(car.angle) * dist;
  for (const other of state.cars) {
    if (other === car) continue;
    const dx = other.x - px, dy = other.y - py;
    if (dx * dx + dy * dy < 36 * 36) return true;
  }
  const p = state.player;
  if (!p.car) {
    const dx = p.x - px, dy = p.y - py;
    if (dx * dx + dy * dy < 30 * 30) return true;
  }
  return false;
}

export function stepTrafficCar(state, car, dt) {
  const city = state.city;
  const target = routeTarget(city, car);
  const dx = target.x - car.x, dy = target.y - car.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 42) {
    chooseAtIntersection(state.rng, city, car);
    return;
  }
  let speed = car.cruise;
  if (dist < 110) speed = Math.min(speed, 92); // ease into the turn
  if (obstacleAhead(state, car, 58)) speed = 0;
  else if (obstacleAhead(state, car, 96)) speed = Math.min(speed, 60);
  stepCarPhysics(car, controlsToward(car, target.x, target.y, speed), dt);
}

// The rival courier runs: while the player is near he abandons his route
// and drives away from them flat out; otherwise he works his route.
export function stepRivalCar(state, car, dt) {
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  const dx = car.x - px, dy = car.y - py;
  const dist = Math.hypot(dx, dy);
  if (dist < 280 && dist > 1) {
    const tx = car.x + (dx / dist) * 320;
    const ty = car.y + (dy / dist) * 320;
    stepCarPhysics(car, controlsToward(car, tx, ty, car.maxSpeed), dt);
    return;
  }
  stepTrafficCar(state, car, dt);
}

export function stepPoliceCar(state, car, dt) {
  const p = state.player;
  const tx = p.car ? p.car.x : p.x;
  const ty = p.car ? p.car.y : p.y;
  const dist = Math.hypot(tx - car.x, ty - car.y);
  let speed = car.maxSpeed;
  if (!p.car && dist < 60) speed = 0; // pull up beside a runner on foot
  else if (dist < 90) speed = Math.min(speed, 190);
  stepCarPhysics(car, controlsToward(car, tx, ty, speed), dt);
}

// --- the player ------------------------------------------------------------

export function stepPlayer(state, input, dt) {
  const p = state.player;
  if (p.car) {
    const ctl = {
      throttle: (input.up ? 1 : 0) + (input.down ? -1 : 0),
      steer: (input.right ? 1 : 0) - (input.left ? 1 : 0),
      handbrake: !!input.handbrake,
    };
    stepCarPhysics(p.car, ctl, dt);
    p.x = p.car.x;
    p.y = p.car.y;
    p.angle = p.car.angle;
    return;
  }
  const mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (mx || my) {
    const len = Math.hypot(mx, my);
    const speed = 152;
    p.x += (mx / len) * speed * dt;
    p.y += (my / len) * speed * dt;
    p.angle = Math.atan2(my, mx);
    p.walkCycle += dt * 9;
  }
}

// --- pedestrians -----------------------------------------------------------

export function stepPed(state, ped, dt) {
  if (ped.downT > 0) {
    ped.downT -= dt;
    return;
  }
  const p = state.player;
  if (ped.fleeT > 0) {
    ped.fleeT -= dt;
    ped.x += Math.cos(ped.angle) * 205 * dt;
    ped.y += Math.sin(ped.angle) * 205 * dt;
    return;
  }
  // Stroll the pavement around the home block, corner to corner.
  const b = ped.block;
  const inset = 8;
  const corners = [
    { x: b.x + inset, y: b.y + inset },
    { x: b.x + b.w - inset, y: b.y + inset },
    { x: b.x + b.w - inset, y: b.y + b.h - inset },
    { x: b.x + inset, y: b.y + b.h - inset },
  ];
  const target = corners[ped.corner % 4];
  const dx = target.x - ped.x, dy = target.y - ped.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 6) {
    ped.corner = (ped.corner + 1) % 4;
    return;
  }
  ped.angle = Math.atan2(dy, dx);
  ped.x += Math.cos(ped.angle) * ped.speed * dt;
  ped.y += Math.sin(ped.angle) * ped.speed * dt;
  void p;
}

// --- collisions, run once per step over everything -------------------------

export function resolveCollisions(state) {
  const city = state.city;
  const events = state.events;

  for (const car of state.cars) {
    const fixed = collideSolids(city, car.x, car.y, car.radius);
    if (fixed) {
      const impact = Math.abs(car.speed);
      car.x = fixed.x;
      car.y = fixed.y;
      if (impact > 60) {
        car.health -= impact * 0.03;
        if (car === state.player.car) events.push({ type: 'crash', hard: impact > 170 });
        car.speed *= -0.18;
      } else {
        car.speed *= 0.55;
      }
    }
    const clamped = clampWorld(city, car.x, car.y, car.radius);
    car.x = clamped.x;
    car.y = clamped.y;
  }

  // Car against car: soft push-apart, with a ram event when it is hard.
  for (let i = 0; i < state.cars.length; i++) {
    for (let j = i + 1; j < state.cars.length; j++) {
      const a = state.cars[i], b = state.cars[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = a.radius + b.radius + 2;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const closing = Math.abs(a.speed) + Math.abs(b.speed);
        if (closing > 130) {
          a.health -= 2.5; b.health -= 2.5;
          const byPlayer = a === state.player.car || b === state.player.car;
          events.push({ type: 'ram', byPlayer, other: a === state.player.car ? b : b === state.player.car ? a : null, hard: closing > 260 });
          a.speed *= 0.62; b.speed *= 0.62;
        } else {
          a.speed *= 0.9; b.speed *= 0.9;
        }
      }
    }
  }

  // Cars against pedestrians.
  for (const car of state.cars) {
    if (Math.abs(car.speed) < 24) continue;
    for (const ped of state.peds) {
      if (ped.downT > 0) continue;
      const dx = ped.x - car.x, dy = ped.y - car.y;
      if (dx * dx + dy * dy < 26 * 26) {
        ped.downT = 4;
        ped.fleeT = 0;
        events.push({ type: 'pedHit', byPlayer: car === state.player.car, x: ped.x, y: ped.y });
      } else if (dx * dx + dy * dy < 92 * 92 && Math.abs(car.speed) > 130) {
        ped.fleeT = 1.4;
        ped.angle = Math.atan2(dy, dx);
      }
    }
  }

  // The player on foot vs buildings and the world edge.
  const p = state.player;
  if (!p.car) {
    const fixed = collideSolids(city, p.x, p.y, p.radius);
    if (fixed) { p.x = fixed.x; p.y = fixed.y; }
    const clamped = clampWorld(city, p.x, p.y, p.radius);
    p.x = clamped.x;
    p.y = clamped.y;
  }
}
