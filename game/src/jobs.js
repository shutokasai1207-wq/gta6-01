// jobs.js — the work Mama Sol hands Rio Vega, one job at a time.
//
// Five jobs in a chain: a package run, a timed night fare, losing a tail,
// settling a rival courier, and one hot duffel. Each job is a few stages of
// "be somewhere" (or "hit something"), tracked against the live world; the
// HUD reads the current objective from here.

import { placeMarker } from './city.js';
import { makeCar, giveRoute } from './entities.js';
import { addHeat } from './wanted.js';

export const JOB_TITLES = ['The Package', 'Night Fare', 'Hot Tail', 'The Rival', 'The Duffel'];

export function makeJobs() {
  return {
    index: 0, stage: 0, phase: 'active', phaseT: 0,
    target: null, targetName: '', text: '', timeLeft: -1, hits: 0,
    rival: null, started: false,
  };
}

function setTarget(state, placeName, text) {
  const j = state.jobs;
  j.targetName = placeName;
  j.target = placeMarker(state.city, placeName);
  j.text = text;
}

function payOut(state, amount, note) {
  state.cash += amount;
  state.earned += amount;
  state.events.push({ type: 'jobPaid', amount, note });
}

function finishJob(state, note) {
  const j = state.jobs;
  state.events.push({ type: 'jobDone', title: JOB_TITLES[j.index], note });
  j.index += 1;
  j.stage = 0;
  j.hits = 0;
  j.timeLeft = -1;
  j.rival = null;
  if (j.index >= JOB_TITLES.length) {
    j.phase = 'over';
    state.events.push({ type: 'campaignComplete' });
  } else {
    j.phase = 'rest';
    j.phaseT = 3.2;
    j.target = null;
    j.text = 'Mama Sol is lining up the next job…';
  }
}

export function beginJob(state, index) {
  const j = state.jobs;
  j.index = index;
  j.stage = 0;
  j.phase = 'active';
  j.started = true;
  if (index === 0) {
    setTarget(state, "Sol's Diner", "Mama Sol: pick up the package at Sol's Diner.");
  } else if (index === 1) {
    setTarget(state, 'Club Neon Palms', 'Mama Sol: a fare is waiting outside Club Neon Palms.');
  } else if (index === 2) {
    // The tail is already on you: two stars before you even move.
    state.wanted.heat = Math.max(state.wanted.heat, 42);
    state.wanted.stars = 2;
    j.target = null;
    j.targetName = '';
    j.text = 'Mama Sol: the law is on you — lose the heat, then we talk.';
  } else if (index === 3) {
    const spot = placeMarker(state.city, 'Mercado Sol');
    const rival = makeCar(spot.x + 60, spot.y, 0, 'rival', '#111111');
    rival.cruise = 205;
    rival.maxSpeed = 300;
    giveRoute(state.rng, state.city, rival);
    rival.x = spot.x + 60;
    rival.y = spot.y;
    state.cars.push(rival);
    j.rival = rival;
    j.target = { x: rival.x, y: rival.y };
    j.text = 'Mama Sol: a rival courier works my streets. Ram him — 0 of 3.';
  } else if (index === 4) {
    setTarget(state, 'Banco Solara', 'Mama Sol: one last run. Grab the duffel from Banco Solara.');
  }
}

function arriveStage(state) {
  const j = state.jobs;
  if (j.index === 0 && j.stage === 0) {
    j.stage = 1;
    setTarget(state, "Tito's Auto", 'Package on board. Take it to Tito at Tito\'s Auto.');
  } else if (j.index === 0 && j.stage === 1) {
    payOut(state, 150, 'Tito signs for the package.');
    finishJob(state, 'The Package delivered.');
  } else if (j.index === 1 && j.stage === 0) {
    j.stage = 1;
    j.timeLeft = 80;
    setTarget(state, 'Marina Del Sol', 'She is in a hurry: Marina Del Sol, and the clock is running.');
  } else if (j.index === 1 && j.stage === 1) {
    const bonus = Math.max(0, Math.round(j.timeLeft));
    payOut(state, 200 + bonus, 'The fare tips well for speed.');
    finishJob(state, 'Night Fare done.');
  } else if (j.index === 2 && j.stage === 1) {
    payOut(state, 250, 'Laid low at the airstrip.');
    finishJob(state, 'Hot Tail done.');
  } else if (j.index === 4 && j.stage === 0) {
    j.stage = 1;
    state.wanted.heat = Math.max(state.wanted.heat, 72);
    addHeat(state, 0);
    setTarget(state, 'Marina Del Sol', 'Duffel on board and every siren in Solara is awake. Marina Del Sol — do not stop.');
  } else if (j.index === 4 && j.stage === 1) {
    payOut(state, 400, 'The duffel changes hands at the marina.');
    finishJob(state, 'The Duffel delivered.');
  }
}

export function stepJobs(state, dt) {
  const j = state.jobs;
  if (!j.started || state.mode !== 'playing') return;

  if (j.phase === 'rest') {
    j.phaseT -= dt;
    if (j.phaseT <= 0) beginJob(state, j.index);
    return;
  }
  if (j.phase !== 'active') return;

  // The Rival: count the player's rams and keep the target on the rival.
  if (j.index === 3 && j.rival) {
    for (const ev of state.events) {
      if (ev.type === 'ram' && ev.byPlayer && ev.other === j.rival) {
        j.hits += 1;
        j.rival.health -= 22;
        j.text = `Mama Sol: a rival courier works my streets. Ram him — ${j.hits} of 3.`;
        state.events.push({ type: 'rivalHit', hits: j.hits });
      }
    }
    j.target = { x: j.rival.x, y: j.rival.y };
    if (j.hits >= 3) {
      const rival = j.rival;
      state.cars.splice(state.cars.indexOf(rival), 1);
      payOut(state, 300, 'The rival courier limps home.');
      finishJob(state, 'The Rival settled.');
      return;
    }
  }

  // Hot Tail, stage 0: the stage completes when the stars are gone.
  if (j.index === 2 && j.stage === 0) {
    if (state.wanted.stars === 0) {
      j.stage = 1;
      setTarget(state, 'Solara Airstrip', 'Heat is gone. Lay low at Solara Airstrip.');
    }
    return;
  }

  // The timed fare.
  if (j.timeLeft > 0) {
    j.timeLeft -= dt;
    if (j.timeLeft <= 0) {
      j.timeLeft = -1;
      payOut(state, 40, 'The fare bails out, furious and underpaid.');
      finishJob(state, 'Night Fare blown.');
      return;
    }
  }

  // Arrival at the current target.
  if (j.target) {
    const p = state.player;
    const dx = p.x - j.target.x, dy = p.y - j.target.y;
    if (dx * dx + dy * dy < 56 * 56) arriveStage(state);
  }
}

// What the HUD shows: the objective line, and where to go.
export function currentObjective(state) {
  const j = state.jobs;
  if (!j.started) return { text: '', target: null, timeLeft: -1 };
  return { text: j.text, target: j.target, timeLeft: j.timeLeft };
}
