// wanted.js — the heat system: stars, police response and getting busted.
//
// Crimes add heat. Heat sets the star level, the star level sets how many
// patrol cars hunt the player, and a patrol car that stays close to a slow
// or on-foot player fills the bust meter. Fill it and the run ends on the
// arrested screen. Break line of sight and the heat bleeds away.

import { makeCar } from './entities.js';

export function makeWanted() {
  return { heat: 0, stars: 0, bust: 0, seen: false, giveUpT: 0 };
}

export function starsForHeat(heat) {
  if (heat <= 0) return 0;
  if (heat < 25) return 1;
  if (heat < 55) return 2;
  if (heat < 95) return 3;
  if (heat < 145) return 4;
  return 5;
}

export function addHeat(state, points) {
  const w = state.wanted;
  w.heat = Math.min(220, w.heat + points);
  w.stars = starsForHeat(w.heat);
}

function spawnPoint(state) {
  const city = state.city;
  const p = state.player;
  const angle = state.rng.range(0, Math.PI * 2);
  let x = p.x + Math.cos(angle) * 660;
  let y = p.y + Math.sin(angle) * 660;
  x = Math.max(30, Math.min(city.width - 30, x));
  y = Math.max(30, Math.min(city.height - 30, y));
  // Snap to the nearer road centre line so the patrol starts on a street.
  let bestV = city.vRoads[0], bestVd = Infinity;
  for (const vx of city.vRoads) { const d = Math.abs(vx - x); if (d < bestVd) { bestVd = d; bestV = vx; } }
  let bestH = city.hRoads[0], bestHd = Infinity;
  for (const hy of city.hRoads) { const d = Math.abs(hy - y); if (d < bestHd) { bestHd = d; bestH = hy; } }
  if (bestVd < bestHd) x = bestV; else y = bestH;
  return { x, y };
}

export function stepWanted(state, dt) {
  const w = state.wanted;
  const p = state.player;
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;

  const police = state.cars.filter((c) => c.kind === 'police');

  // Line of sight: any patrol within 340 px sees the player.
  w.seen = police.some((c) => Math.hypot(c.x - px, c.y - py) < 340);

  // Heat bleeds off only while nobody is watching.
  if (!w.seen && w.heat > 0) {
    w.heat = Math.max(0, w.heat - 5.5 * dt);
    w.stars = starsForHeat(w.heat);
  }

  // Keep the patrol strength matched to the stars.
  const wanted = w.stars;
  if (police.length < wanted) {
    const s = spawnPoint(state);
    if (Math.hypot(s.x - px, s.y - py) > 380) {
      const car = makeCar(s.x, s.y, 0, 'police', '#f5f6fa');
      car.maxSpeed = 348;
      car.cruise = 300;
      state.cars.push(car);
      police.push(car);
    }
  } else if (police.length > wanted) {
    // Extras give up: drop the farthest one once it is well away.
    let far = null, farD = -1;
    for (const c of police) {
      const d = Math.hypot(c.x - px, c.y - py);
      if (d > farD) { farD = d; far = c; }
    }
    if (far && farD > 560) {
      state.cars.splice(state.cars.indexOf(far), 1);
    }
  }

  // The bust meter: a patrol right on top of a slow or on-foot player.
  let closest = Infinity;
  for (const c of police) {
    closest = Math.min(closest, Math.hypot(c.x - px, c.y - py));
  }
  const playerSpeed = p.car ? Math.abs(p.car.speed) : 0;
  const pinned = w.stars > 0 && ((p.car && closest < 46 && playerSpeed < 34) || (!p.car && closest < 40));
  if (pinned) {
    w.bust = Math.min(100, w.bust + (24 + w.stars * 3) * dt);
  } else {
    w.bust = Math.max(0, w.bust - 16 * dt);
  }
  if (w.bust >= 100 && state.mode === 'playing') {
    state.events.push({ type: 'arrested' });
  }
}
