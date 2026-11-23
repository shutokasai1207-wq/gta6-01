// A tiny seeded random generator (mulberry32). One seed makes one city and one run
// of traffic, so a staged screenshot or a replayed run always comes out the same.

/** Create a generator: call it for a float in [0, 1). Helpers ride along below. */
export function createRandom(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (min, max) => min + next() * (max - min);
  next.int = (min, max) => Math.floor(next.range(min, max + 1));
  next.pick = (list) => list[Math.floor(next() * list.length)];
  next.chance = (p) => next() < p;
  return next;
}

/** Clamp a number into [min, max]. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Straight-line distance between two points. */
export function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

/** The shortest signed turn from angle `from` to angle `to`, in (-PI, PI]. */
export function angleDelta(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** Move an angle toward a target by at most `step`, turning the short way. */
export function turnToward(from, to, step) {
  const delta = angleDelta(from, to);
  if (Math.abs(delta) <= step) return to;
  return from + Math.sign(delta) * step;
}
