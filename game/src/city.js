// The city of Solara Bay: a grid of sun-bleached blocks between wide streets, built
// once from the run's seed. This file owns the map's facts — where the roads run,
// which buildings stand (and block movement), where the named places are — and the
// collision answers every mover asks. Rendering lives in render.js; this is data.
import {
  BEACH_Y, BLOCK, COLS, GRID_X, GRID_Y, ROAD, ROWS, WORLD,
} from './config.js';
import { clamp } from './random.js';

/** Distance from one road's edge to the next: a block plus the road after it. */
export const PITCH = BLOCK + ROAD;

const ROOFS = ['roofA', 'roofB', 'roofC', 'roofD', 'roofE'];

/** Named places the jobs revolve around, pinned to blocks of the grid. */
const POI_SPOTS = [
  { id: 'diner', name: "Sol's Diner", col: 1, row: 1 },
  { id: 'hotel', name: 'Hotel Palmera', col: 4, row: 0 },
  { id: 'airstrip', name: 'Solara Airstrip', col: 6, row: 0 },
  { id: 'bank', name: 'Banco Solara', col: 3, row: 2 },
  { id: 'garage', name: "Tito's Auto", col: 0, row: 3 },
  { id: 'club', name: 'Club Neon Palms', col: 5, row: 3 },
  { id: 'market', name: 'Mercado Sol', col: 2, row: 4 },
  { id: 'marina', name: 'Marina Del Sol', col: 6, row: 4 },
];

/** West edge of block column `col` (its sidewalk line, just east of its road). */
export function blockX(col) {
  return GRID_X + col * PITCH + ROAD;
}

/** North edge of block row `row`. */
export function blockY(row) {
  return GRID_Y + row * PITCH + ROAD;
}

/** Centre line of the vertical road west of block column `col` (col may be COLS). */
export function vRoadCenter(col) {
  return GRID_X + col * PITCH + ROAD / 2;
}

/** Centre line of the horizontal road north of block row `row` (row may be ROWS). */
export function hRoadCenter(row) {
  return GRID_Y + row * PITCH + ROAD / 2;
}

/**
 * Build the whole city from `random`. Returns plain data:
 * buildings (solid boxes with a roof colour key and an optional place name),
 * palms (round solids), blocks (what kind of block each cell is), pois by id,
 * and the road centre lines the traffic and the minimap both read.
 */
export function buildCity(random) {
  const buildings = [];
  const palms = [];
  const blocks = [];
  const pois = new Map();

  const poiByCell = new Map(POI_SPOTS.map((spot) => [`${spot.col},${spot.row}`, spot]));

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const x = blockX(col);
      const y = blockY(row);
      const spot = poiByCell.get(`${col},${row}`);
      let kind = 'built';

      if (spot && spot.id === 'airstrip') {
        kind = 'airstrip'; // one flat runway strip, no buildings at all
      } else if (!spot && random.chance(0.14)) {
        kind = 'park';
      } else if (!spot && random.chance(0.13)) {
        kind = 'lot'; // open parking: parked cars live here (entities.js fills it)
      }

      if (kind === 'built') fillBuiltBlock(random, buildings, palms, x, y, spot);
      if (kind === 'park') fillParkBlock(random, palms, x, y);
      blocks.push({ col, row, x, y, kind });

      if (spot) {
        pois.set(spot.id, {
          id: spot.id,
          name: spot.name,
          // The meeting point: on the sidewalk at the block's south edge, street side.
          x: x + BLOCK / 2,
          y: y + BLOCK + 26,
          blockX: x,
          blockY: y,
        });
      }
    }
  }

  // Palms line the boardwalk above the beach.
  for (let x = 180; x < WORLD.width - 120; x += 150) {
    palms.push({ x: x + random.range(-24, 24), y: BEACH_Y + 34, r: 7 });
  }

  return {
    buildings,
    palms,
    blocks,
    pois,
    vRoads: Array.from({ length: COLS + 1 }, (_, i) => vRoadCenter(i)),
    hRoads: Array.from({ length: ROWS + 1 }, (_, i) => hRoadCenter(i)),
  };
}

/** Fill a built block: one landmark building for a named place, else 2–4 smaller ones. */
function fillBuiltBlock(random, buildings, palms, x, y, spot) {
  const inset = 26; // sidewalk inside the block's edge
  if (spot) {
    const w = BLOCK - inset * 2;
    const h = BLOCK - inset * 2 - 40;
    buildings.push({
      x: x + inset, y: y + inset, w, h,
      roof: random.pick(ROOFS), name: spot.name, floors: random.int(3, 9),
    });
    scatterPalms(random, palms, x, y, 2);
    return;
  }
  const across = random.chance(0.5) ? 2 : 1;
  const down = random.chance(0.5) ? 2 : 1;
  const gap = 18;
  const cellW = (BLOCK - inset * 2 - gap * (across - 1)) / across;
  const cellH = (BLOCK - inset * 2 - gap * (down - 1)) / down;
  for (let i = 0; i < across; i += 1) {
    for (let j = 0; j < down; j += 1) {
      const shrink = random.range(0, 14);
      buildings.push({
        x: x + inset + i * (cellW + gap) + shrink / 2,
        y: y + inset + j * (cellH + gap) + shrink / 2,
        w: cellW - shrink,
        h: cellH - shrink,
        roof: random.pick(ROOFS),
        name: null,
        floors: random.int(2, 12),
      });
    }
  }
  scatterPalms(random, palms, x, y, random.int(1, 3));
}

/** A park block: no buildings, a knot of palms to weave between. */
function fillParkBlock(random, palms, x, y) {
  scatterPalms(random, palms, x, y, random.int(6, 10));
}

/** Drop `count` palms at random spots inside a block, kept off its centre paths. */
function scatterPalms(random, palms, x, y, count) {
  for (let i = 0; i < count; i += 1) {
    palms.push({
      x: x + random.range(18, BLOCK - 18),
      y: y + random.range(18, BLOCK - 18),
      r: 7,
    });
  }
}

/** Is the point on asphalt (a road or the airstrip) rather than on a block? */
export function isOnRoad(city, x, y) {
  if (y >= BEACH_Y) return false;
  if (x < GRID_X || y < GRID_Y) return true; // the border streets
  const localX = (x - GRID_X) % PITCH;
  const localY = (y - GRID_Y) % PITCH;
  return localX < ROAD || localY < ROAD;
}

/**
 * Push a circle (a mover at x, y with radius r) out of every solid it overlaps:
 * building boxes and palm trunks. Returns the corrected point and what it hit,
 * so callers can charge damage or heat for the contact.
 */
export function collideSolids(city, x, y, r) {
  let hit = false;
  let hitBuilding = false;
  for (const b of city.buildings) {
    const nearX = clamp(x, b.x, b.x + b.w);
    const nearY = clamp(y, b.y, b.y + b.h);
    const dx = x - nearX;
    const dy = y - nearY;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    hitBuilding = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = nearX + (dx / d) * r;
      y = nearY + (dy / d) * r;
    } else {
      // Centre inside the box: leave by the nearest face.
      const left = x - b.x;
      const right = b.x + b.w - x;
      const top = y - b.y;
      const bottom = b.y + b.h - y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) x = b.x - r;
      else if (min === right) x = b.x + b.w + r;
      else if (min === top) y = b.y - r;
      else y = b.y + b.h + r;
    }
  }
  for (const p of city.palms) {
    const dx = x - p.x;
    const dy = y - p.y;
    const rr = r + p.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 === 0) continue;
    hit = true;
    const d = Math.sqrt(d2);
    x = p.x + (dx / d) * rr;
    y = p.y + (dy / d) * rr;
  }
  // The world border is solid on all four sides.
  if (x < r) { x = r; hit = true; }
  if (y < r) { y = r; hit = true; }
  if (x > WORLD.width - r) { x = WORLD.width - r; hit = true; }
  if (y > WORLD.height - r) { y = WORLD.height - r; hit = true; }
  return { x, y, hit, hitBuilding };
}

/** A random point on a random road, clear of intersections — traffic's spawn roll. */
export function randomRoadPoint(random, city) {
  const vertical = random.chance(0.5);
  if (vertical) {
    return {
      x: random.pick(city.vRoads),
      y: random.range(GRID_Y + ROAD, BEACH_Y - ROAD),
    };
  }
  return {
    x: random.range(GRID_X + ROAD, WORLD.width - GRID_X - ROAD),
    y: random.pick(city.hRoads),
  };
}
