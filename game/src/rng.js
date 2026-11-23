// rng.js — a small seeded random number generator.
//
// The whole city is dealt from one seed, so a given seed always builds the
// same Solara Bay and the staged screenshot scenes come out identical on
// every run. Nothing in the game uses Math.random.

export function hashSeed(text) {
  // FNV-1a over the seed text, folded into 32 bits.
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rng {
  constructor(seed) {
    this.state = (typeof seed === 'number' ? seed >>> 0 : hashSeed(seed)) || 1;
  }

  // mulberry32 step; returns a float in [0, 1).
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + this.next() * (max - min);
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }

  chance(p) {
    return this.next() < p;
  }
}
