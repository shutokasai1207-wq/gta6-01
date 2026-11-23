// The jobs: five pieces of work Mama Sol hands Rio, one after another — pickups,
// deliveries, a proof of nerve, a lesson for a rival, and one big hot drop. Each
// job is a short chain of stages; finishing a stage pays nothing, finishing a job
// pays cash. This file owns the chain's state and checks; render.js draws it.
import { addHeat } from './wanted.js';
import { distance } from './random.js';

/**
 * Stage kinds: goto (reach a place, `car` true means be driving), heat (reach the
 * star count), escape (be wanted by nobody), ram (hit the rival `count` times).
 * A stage's `heat` lands the moment the stage begins; `time` is a soft limit that
 * blows the job back to its first stage when it runs out.
 */
export const MISSIONS = [
  {
    title: 'Job 1 · First Run',
    pay: 150,
    stages: [
      { type: 'goto', poi: 'marina', text: 'Pick up the package at Marina Del Sol' },
      { type: 'goto', poi: 'diner', text: "Deliver it to Sol's Diner" },
    ],
  },
  {
    title: 'Job 2 · Hot Passenger',
    pay: 250,
    stages: [
      { type: 'goto', poi: 'hotel', car: true, text: 'Pick up the passenger at Hotel Palmera — arrive by car' },
      { type: 'goto', poi: 'airstrip', car: true, time: 95, heat: 120, text: 'Get him to Solara Airstrip, fast — he is hot' },
    ],
  },
  {
    title: 'Job 3 · Prove It',
    pay: 200,
    stages: [
      { type: 'heat', stars: 2, text: 'Make some noise: reach 2 wanted stars' },
      { type: 'escape', text: 'Now lose the police completely' },
    ],
  },
  {
    title: 'Job 4 · Turf Lesson',
    pay: 300,
    stages: [
      { type: 'ram', count: 3, text: 'Ram the rival courier — the purple car — 3 times' },
    ],
  },
  {
    title: 'Job 5 · The Big Drop',
    pay: 500,
    stages: [
      { type: 'goto', poi: 'bank', text: 'Collect the duffel from Banco Solara' },
      { type: 'goto', poi: 'garage', heat: 260, text: "Drop it at Tito's Auto — and do not get caught" },
    ],
  },
];

/** Attach the job chain to a fresh world, opened on the first job. */
export function createMissions(state) {
  state.mission = {
    index: 0,
    stage: 0,
    timer: null,
    ramBase: 0,
    done: false,
    toast: 'Mama Sol has work. Follow the gold marker.',
    toastT: 6,
  };
  enterStage(state);
  return state.mission;
}

function currentStage(state) {
  const m = state.mission;
  if (m.done) return null;
  return MISSIONS[m.index].stages[m.stage];
}

/** Set up whatever a stage needs the moment it begins: timers, heat, baselines. */
function enterStage(state) {
  const m = state.mission;
  const stage = currentStage(state);
  if (!stage) return;
  m.timer = stage.time ?? null;
  if (stage.heat) addHeat(state, stage.heat);
  if (stage.type === 'ram') m.ramBase = state.rivalHits;
}

function setToast(state, text, seconds = 5) {
  state.mission.toast = text;
  state.mission.toastT = seconds;
}

/** Move the chain on: next stage, or the job's pay and the next job. */
function advanceStage(state) {
  const m = state.mission;
  const job = MISSIONS[m.index];
  m.stage += 1;
  if (m.stage < job.stages.length) {
    enterStage(state);
    return;
  }
  state.cash += job.pay;
  state.earned += job.pay;
  state.events.cash = true;
  m.index += 1;
  m.stage = 0;
  if (m.index >= MISSIONS.length) {
    m.done = true;
    state.over = 'win';
    setToast(state, 'Every job done. Solara Bay is yours, Rio.', 8);
    return;
  }
  setToast(state, `${job.title} paid $${job.pay}. Next: ${MISSIONS[m.index].title}.`);
  enterStage(state);
}

/** A blown timer sends the job back to its first stage, unpaid and unheated twice. */
function blowJob(state) {
  const m = state.mission;
  m.stage = 0;
  setToast(state, 'Too slow — the job is blown. Start it again.', 5);
  enterStage(state);
}

/** Has the current stage's ask been met this step? */
function stageMet(state, stage) {
  const p = state.player;
  switch (stage.type) {
    case 'goto': {
      if (stage.car && !p.car) return false;
      const poi = state.city.pois.get(stage.poi);
      return distance(p.x, p.y, poi.x, poi.y) < 64;
    }
    case 'heat':
      return state.wanted.stars >= stage.stars;
    case 'escape':
      return state.wanted.stars === 0 && state.wanted.heat <= 0.5;
    case 'ram':
      return state.rivalHits - state.mission.ramBase >= stage.count;
    default:
      return false;
  }
}

/** One step of the chain: timers tick, met stages advance. */
export function stepMissions(state, dt) {
  const m = state.mission;
  if (m.done || state.over) return;
  if (m.toastT > 0) m.toastT -= dt;
  const stage = currentStage(state);
  if (!stage) return;
  if (m.timer !== null) {
    m.timer -= dt;
    if (m.timer <= 0) {
      blowJob(state);
      return;
    }
  }
  if (stageMet(state, stage)) advanceStage(state);
}

/**
 * What the HUD and the marker need: the job's title, the stage's ask, where to go
 * (a place, the rival, or nowhere in particular), and the seconds left if timed.
 */
export function currentObjective(state) {
  const m = state.mission;
  if (m.done) return { title: 'All jobs done', text: 'Solara Bay is yours.', x: null, y: null, timer: null };
  const job = MISSIONS[m.index];
  const stage = job.stages[m.stage];
  let x = null;
  let y = null;
  if (stage.type === 'goto') {
    const poi = state.city.pois.get(stage.poi);
    x = poi.x;
    y = poi.y;
  } else if (stage.type === 'ram' && state.rival) {
    x = state.rival.x;
    y = state.rival.y;
  }
  return { title: job.title, text: stage.text, x, y, timer: m.timer };
}
