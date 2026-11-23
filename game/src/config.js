// Solara Heat — shared constants: the city's shape, the pace of play, and the warm
// coastal palette every other file draws from. Nothing here touches the DOM, so the
// simulation files can be exercised headlessly.

/** Fixed simulation step, in seconds: the world always advances in 1/60 s ticks. */
export const STEP = 1 / 60;

/** The world is a rectangle of city; the camera shows a window into it. */
export const WORLD = { width: 3360, height: 2520 };

/** Streets form a grid: blocks of BLOCK px separated by roads of ROAD px. */
export const BLOCK = 340;
export const ROAD = 104;
export const COLS = 7; // building blocks across
export const ROWS = 5; // building blocks down

/** Offset of the first road's west / north edge from the world border. */
export const GRID_X = 88;
export const GRID_Y = 88;

/** How far a lane sits from its road's centre line (right-hand traffic). */
export const LANE = 27;

/** South edge of the street grid; below it a sandy boardwalk runs to the water. */
export const BEACH_Y = GRID_Y + ROWS * (BLOCK + ROAD) + ROAD;

export const PLAYER = {
  radius: 11,
  walkSpeed: 178,
  health: 100,
};

export const CAR = {
  length: 46,
  width: 22,
  radius: 24, // collision circle, a fair fit for the body
  accel: 300,
  brake: 460,
  reverse: 130,
  maxSpeed: 430,
  maxReverse: 130,
  grip: 7.5, // how fast the velocity turns toward the heading
  health: 100,
};

export const TRAFFIC_COUNT = 16;
export const PARKED_COUNT = 14;
export const PED_COUNT = 26;
export const PICKUP_COUNT = 6;
export const PICKUP_VALUE = 25;

/** Wanted heat: events add points, each full HUNDRED is one star, five stars at most. */
export const HEAT = {
  perStar: 100,
  maxStars: 5,
  stealCar: 55,
  stealWitnessed: 100,
  hitPed: 130,
  hitCar: 22,
  hitPolice: 110,
  hitBuilding: 6,
  ramRival: 30,
  decayPerSecond: 4.5, // only while no officer can see the player
  sightRange: 560,
};

/** Police strength by star: how many cars patrol and how hard they press. */
export const POLICE_BY_STAR = [0, 1, 2, 3, 4, 6];
export const BUST_TIME = 2.6; // seconds pinned before the arrest lands
export const BUST_RANGE = 120;

export const SAVE_KEY = 'solara-heat-save-v1';

/** Sun-soaked coastal palette: warm sand, teal water, pastel blocks, neon signs. */
export const COLORS = {
  water: '#1d7f8c',
  waterDeep: '#14616e',
  sand: '#ecd29a',
  grass: '#79b657',
  park: '#5da34c',
  sidewalk: '#cfc4ae',
  road: '#3c4148',
  roadEdge: '#2f3339',
  laneMark: '#e8e3d0',
  crosswalk: '#d8d2c0',
  roofA: '#e2725b',
  roofB: '#e8a04c',
  roofC: '#7fb3c8',
  roofD: '#c96f9a',
  roofE: '#8d9e5b',
  wallShade: 'rgba(60, 30, 10, 0.28)',
  palm: '#3e8e4f',
  palmTrunk: '#8a6b42',
  player: '#ffd23e',
  playerTrim: '#20303c',
  police: '#20303c',
  policeTrim: '#e8f2ff',
  rival: '#8e44ad',
  objective: '#ffc21f',
  pickup: '#57e389',
  hudText: '#fff7e6',
  hudShadow: 'rgba(10, 16, 22, 0.55)',
  title: '#ffd23e',
};

/** Car paint jobs for traffic and parked cars (the player's taste runs louder). */
export const CAR_COLORS = [
  '#e84c3d', '#f39c2c', '#f5d13d', '#57b24a', '#3d9be8', '#9b59b6',
  '#ecf0f1', '#95a5a6', '#2ecc71', '#e67e9e', '#4ad0c2', '#d35400',
];
