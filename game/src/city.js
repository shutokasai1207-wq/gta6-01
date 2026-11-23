// city.js — the layout of Solara Bay.
//
// A grid of city blocks separated by two-lane roads. Most blocks hold one
// building (a solid the player and cars collide with); eight hold the named
// places the story visits, each with an open forecourt and a job marker.
// A few blocks are parks or parking lots you can cut across.

export const BLOCK = 250; // block size in world pixels
export const ROAD = 96; // road width between blocks
export const COLS = 6;
export const ROWS = 5;
export const LANE = 20; // lane offset from a road's centre line

export const WORLD_W = COLS * BLOCK + (COLS + 1) * ROAD;
export const WORLD_H = ROWS * BLOCK + (ROWS + 1) * ROAD;

// The named places, by block (col, row), with the colour of their sign.
const PLACE_DEFS = [
  { col: 0, row: 0, name: "Sol's Diner", sign: '#ffb347' },
  { col: 2, row: 0, name: 'Hotel Palmera', sign: '#7fe3c0' },
  { col: 4, row: 0, name: 'Banco Solara', sign: '#ffd94d' },
  { col: 3, row: 1, name: 'Club Neon Palms', sign: '#ff5fd2' },
  { col: 1, row: 2, name: "Tito's Auto", sign: '#8fd0ff' },
  { col: 5, row: 2, name: 'Mercado Sol', sign: '#ff8a5c' },
  { col: 0, row: 4, name: 'Marina Del Sol', sign: '#5cc8ff' },
  { col: 5, row: 4, name: 'Solara Airstrip', sign: '#e8e8e8' },
];

const BUILDING_COLORS = ['#d96f4e', '#c95d63', '#e0a458', '#9c6b30', '#b5525f', '#7a9e7e', '#5f8d87', '#c2b280', '#a26769', '#6d597a'];
const ROOF_COLORS = ['#8a4b2f', '#74404a', '#a5763a', '#6e5226', '#7d3a44', '#55705a', '#40635e', '#8f8262', '#6e4548', '#4c3f5e'];

export function blockRect(col, row) {
  return {
    x: ROAD + col * (BLOCK + ROAD),
    y: ROAD + row * (BLOCK + ROAD),
    w: BLOCK,
    h: BLOCK,
  };
}

export function buildCity(rng) {
  const blocks = [];
  const places = new Map();
  const placeAt = new Map(PLACE_DEFS.map((p) => [`${p.col},${p.row}`, p]));

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const r = blockRect(col, row);
      const def = placeAt.get(`${col},${row}`);
      if (def) {
        // The building sits at the back of its block; the front is an open
        // forecourt where the job marker glows.
        const solid = { x: r.x + 20, y: r.y + 16, w: r.w - 40, h: Math.round(r.h * 0.52) };
        const block = {
          ...r, col, row, kind: 'place', name: def.name, sign: def.sign,
          color: rng.pick(BUILDING_COLORS), roof: rng.pick(ROOF_COLORS), solid,
          marker: { x: r.x + r.w / 2, y: r.y + r.h * 0.82 },
        };
        blocks.push(block);
        places.set(def.name, block);
      } else if (rng.chance(0.14)) {
        // A park: grass, a path cross, and palms at fixed spots the renderer
        // and the screenshot scenes can rely on.
        const palms = [];
        const count = rng.int(3, 6);
        for (let i = 0; i < count; i++) {
          palms.push({ x: r.x + rng.range(28, r.w - 28), y: r.y + rng.range(28, r.h - 28), s: rng.range(0.8, 1.3) });
        }
        blocks.push({ ...r, col, row, kind: 'park', name: '', solid: null, palms });
      } else if (rng.chance(0.14)) {
        // A parking lot: two rows of bays along the block's long edges.
        const spots = [];
        for (let i = 0; i < 5; i++) {
          spots.push({ x: r.x + 34 + i * 46, y: r.y + 40, angle: Math.PI / 2 });
          spots.push({ x: r.x + 34 + i * 46, y: r.y + r.h - 40, angle: -Math.PI / 2 });
        }
        blocks.push({ ...r, col, row, kind: 'parking', name: '', solid: null, spots });
      } else {
        const solid = { x: r.x + 16, y: r.y + 16, w: r.w - 32, h: r.h - 32 };
        blocks.push({
          ...r, col, row, kind: 'building', name: '', solid,
          color: rng.pick(BUILDING_COLORS), roof: rng.pick(ROOF_COLORS),
          floors: rng.int(2, 6),
        });
      }
    }
  }

  // Road centre lines: vertical roads run between and around the columns.
  const vRoads = [];
  for (let i = 0; i <= COLS; i++) vRoads.push(i * (BLOCK + ROAD) + ROAD / 2);
  const hRoads = [];
  for (let j = 0; j <= ROWS; j++) hRoads.push(j * (BLOCK + ROAD) + ROAD / 2);

  const solids = blocks.filter((b) => b.solid).map((b) => b.solid);
  return { width: WORLD_W, height: WORLD_H, blocks, places, vRoads, hRoads, solids };
}

// Where a place's job marker sits (its forecourt).
export function placeMarker(city, name) {
  const block = city.places.get(name);
  return block ? block.marker : { x: city.width / 2, y: city.height / 2 };
}

// Circle vs the city's building solids: returns a push-out vector or null.
export function collideSolids(city, x, y, radius) {
  for (const s of city.solids) {
    const nx = Math.max(s.x, Math.min(x, s.x + s.w));
    const ny = Math.max(s.y, Math.min(y, s.y + s.h));
    const dx = x - nx;
    const dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        return { x: nx + (dx / d) * radius, y: ny + (dy / d) * radius };
      }
      // Centre inside the rect: push out through the nearest face.
      const left = x - s.x, right = s.x + s.w - x, top = y - s.y, bottom = s.y + s.h - y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) return { x: s.x - radius, y };
      if (m === right) return { x: s.x + s.w + radius, y };
      if (m === top) return { x, y: s.y - radius };
      return { x, y: s.y + s.h + radius };
    }
  }
  return null;
}

export function clampWorld(city, x, y, radius) {
  return {
    x: Math.max(radius, Math.min(city.width - radius, x)),
    y: Math.max(radius, Math.min(city.height - radius, y)),
  };
}
