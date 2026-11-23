// hud.js — everything that sits on top of the world: cash and stars, the
// objective line and its timer, the minimap, the bust meter, banners, and
// the title / busted / down / win screens.

import { currentObjective } from './jobs.js';

function panel(ctx, x, y, w, h, alpha = 0.62) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fillStyle = `rgba(10, 14, 20, ${alpha})`;
  ctx.fill();
}

function text(ctx, str, x, y, size, color, align = 'left', weight = 'bold') {
  ctx.font = `${weight} ${size}px system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function drawStars(ctx, state) {
  const stars = state.wanted.stars;
  const x0 = state.view.w - 24;
  for (let i = 0; i < 5; i++) {
    const x = x0 - i * 34;
    const lit = i < stars;
    text(ctx, '★', x, 34, 30, lit ? '#ffd94d' : 'rgba(255,255,255,0.22)', 'center');
  }
  if (state.wanted.bust > 1) {
    panel(ctx, state.view.w - 196, 52, 172, 46);
    ctx.fillStyle = '#3a0d0d';
    ctx.fillRect(state.view.w - 190, 58, 160, 13);
    ctx.fillStyle = state.wanted.bust > 70 ? '#ff3b30' : '#ff9f43';
    ctx.fillRect(state.view.w - 190, 58, 160 * (state.wanted.bust / 100), 13);
    text(ctx, 'BUSTED', state.view.w - 110, 85, 12, '#ffb3ab', 'center');
  }
}

function drawObjective(ctx, state) {
  const obj = currentObjective(state);
  if (!obj.text || state.mode !== 'playing') return;
  const w = Math.min(760, 34 + obj.text.length * 8.4);
  const x = (state.view.w - w) / 2;
  panel(ctx, x, 16, w, 44);
  text(ctx, obj.text, state.view.w / 2, 38, 16.5, '#ffe9a8', 'center', '600');
  if (obj.timeLeft > 0) {
    const frac = Math.max(0, obj.timeLeft / 80);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 14, 66, w - 28, 7);
    ctx.fillStyle = obj.timeLeft < 15 ? '#ff3b30' : '#ffd94d';
    ctx.fillRect(x + 14, 66, (w - 28) * frac, 7);
    text(ctx, `${Math.ceil(obj.timeLeft)}s`, state.view.w / 2, 88, 13, '#ffffff', 'center');
  }
  // An off-screen arrow points the way to the marker.
  if (obj.target) {
    const p = state.player;
    const dx = obj.target.x - p.x, dy = obj.target.y - p.y;
    const dist = Math.hypot(dx, dy);
    const sx = obj.target.x - state.camera.x, sy = obj.target.y - state.camera.y;
    const onScreen = sx > 20 && sx < state.view.w - 20 && sy > 20 && sy < state.view.h - 20;
    if (!onScreen && dist > 60) {
      const a = Math.atan2(dy, dx);
      const ax = state.view.w / 2 + Math.cos(a) * 120;
      const ay = 130 + Math.sin(a) * 44;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, -9);
      ctx.lineTo(-8, 9);
      ctx.closePath();
      ctx.fillStyle = '#ffd94d';
      ctx.fill();
      ctx.restore();
      text(ctx, `${Math.round(dist / 10)}m`, ax, ay + 24, 12.5, '#ffd94d', 'center');
    }
  }
}

function drawMinimap(ctx, state) {
  const mw = 218, mh = 182;
  const x = 16, y = state.view.h - mh - 16;
  const sx = mw / state.city.width, sy = mh / state.city.height;
  panel(ctx, x - 5, y - 5, mw + 10, mh + 10, 0.55);
  ctx.fillStyle = '#2c3136';
  ctx.fillRect(x, y, mw, mh);
  ctx.fillStyle = '#484e54';
  for (const block of state.city.blocks) {
    if (block.kind === 'park') ctx.fillStyle = '#4a7c43';
    else if (block.kind === 'place') ctx.fillStyle = '#8a6d3b';
    else ctx.fillStyle = '#484e54';
    ctx.fillRect(x + block.x * sx, y + block.y * sy, Math.max(2, block.w * sx), Math.max(2, block.h * sy));
  }
  const dot = (wx, wy, r, color) => {
    ctx.beginPath();
    ctx.arc(x + wx * sx, y + wy * sy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };
  for (const bag of state.bags) dot(bag.x, bag.y, 2.2, '#69db7c');
  const obj = currentObjective(state);
  if (obj.target && state.mode === 'playing') {
    const pulse = 3.6 + Math.sin(state.time * 4.2) * 1.2;
    dot(obj.target.x, obj.target.y, pulse, '#ffd94d');
  }
  for (const car of state.cars) {
    if (car.kind === 'police') {
      const flash = Math.floor(state.time * 5 + car.id) % 2 === 0;
      dot(car.x, car.y, 3, flash ? '#ff3b30' : '#4dabff');
    } else if (car.kind === 'rival') {
      dot(car.x, car.y, 3.4, '#ff7b00');
    }
  }
  dot(state.player.x, state.player.y, 4, '#ffffff');
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + state.camera.x * sx, y + state.camera.y * sy, state.view.w * sx, state.view.h * sy);
}

function drawGauges(ctx, state) {
  const p = state.player;
  const x = state.view.w - 216, y = state.view.h - 74;
  panel(ctx, x - 6, y - 8, 206, 66);
  if (p.car) {
    const kmh = Math.round(Math.abs(p.car.speed) * 0.36);
    text(ctx, `${kmh} km/h`, x + 4, y + 8, 21, '#ffffff');
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 4, y + 28, 188, 9);
    ctx.fillStyle = p.car.health > 35 ? '#69db7c' : '#ff3b30';
    ctx.fillRect(x + 4, y + 28, 188 * Math.max(0, p.car.health / 100), 9);
    text(ctx, 'RIDE', x + 4, y + 48, 11, 'rgba(255,255,255,0.65)');
  } else {
    text(ctx, 'ON FOOT', x + 4, y + 8, 16, '#ffffff');
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 4, y + 28, 188, 9);
    ctx.fillStyle = p.health > 35 ? '#69db7c' : '#ff3b30';
    ctx.fillRect(x + 4, y + 28, 188 * Math.max(0, p.health / 100), 9);
    text(ctx, 'HEALTH', x + 4, y + 48, 11, 'rgba(255,255,255,0.65)');
  }
}

function drawBanner(ctx, state) {
  if (!state.banner) return;
  const b = state.banner;
  const alpha = Math.min(1, b.t / 0.5);
  ctx.save();
  ctx.globalAlpha = alpha;
  const w = 460;
  panel(ctx, (state.view.w - w) / 2, 120, w, 74, 0.72);
  text(ctx, b.title, state.view.w / 2, 146, 25, '#ffd94d', 'center');
  text(ctx, b.note, state.view.w / 2, 176, 14.5, '#ffffff', 'center', '600');
  ctx.restore();
}

function statsLines(state) {
  const s = state.stats;
  return [
    `Jobs done ${s.jobsDone} of 5`,
    `Cars stolen ${s.steals} · Rammings ${s.rams}`,
    `Cash bags ${s.bags} · Pedestrians downed ${s.pedHits}`,
    `Best take so far: $${state.save.best}`,
  ];
}

function drawEndScreen(ctx, state, title, titleColor, lines) {
  ctx.fillStyle = 'rgba(6, 8, 14, 0.78)';
  ctx.fillRect(0, 0, state.view.w, state.view.h);
  text(ctx, title, state.view.w / 2, 268, 74, titleColor, 'center', '900');
  text(ctx, `Take: $${state.earned}`, state.view.w / 2, 340, 30, '#ffe9a8', 'center');
  lines.forEach((line, i) => text(ctx, line, state.view.w / 2, 396 + i * 30, 17, '#dfe6ee', 'center', '600'));
  text(ctx, 'Press ENTER to run it again', state.view.w / 2, 396 + lines.length * 30 + 34, 16, 'rgba(255,255,255,0.75)', 'center', '600');
}

function drawTitle(ctx, state) {
  const grad = ctx.createLinearGradient(0, 0, 0, state.view.h);
  grad.addColorStop(0, 'rgba(10, 10, 30, 0.25)');
  grad.addColorStop(0.55, 'rgba(10, 10, 30, 0.1)');
  grad.addColorStop(1, 'rgba(10, 10, 30, 0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, state.view.w, state.view.h);
  text(ctx, 'SOLARA HEAT', state.view.w / 2, 218, 96, '#ffd94d', 'center', '900');
  text(ctx, 'An open-world crime story in Solara Bay', state.view.w / 2, 282, 23, '#ffffff', 'center', '600');
  const story = 'Rio Vega runs errands for fixer Mama Sol — packages, fares and one hot duffel —';
  const story2 = 'while the Solara PD counts every crime in stars. Five jobs. One city. Do not get busted.';
  text(ctx, story, state.view.w / 2, 348, 16.5, '#dfe6ee', 'center', '500');
  text(ctx, story2, state.view.w / 2, 374, 16.5, '#dfe6ee', 'center', '500');
  panel(ctx, state.view.w / 2 - 300, 420, 600, 118, 0.6);
  text(ctx, 'WASD / arrows — move & drive      E — steal / leave a car', state.view.w / 2, 452, 16, '#ffffff', 'center', '600');
  text(ctx, 'SPACE — handbrake      M — sound on/off', state.view.w / 2, 482, 16, '#ffffff', 'center', '600');
  text(ctx, 'Follow the gold marker. Green bags are cash. Stars bring sirens.', state.view.w / 2, 512, 16, '#ffffff', 'center', '600');
  const pulse = 0.72 + Math.sin(state.time * 3.4) * 0.28;
  ctx.save();
  ctx.globalAlpha = pulse;
  text(ctx, 'PRESS ENTER TO START', state.view.w / 2, 592, 26, '#ffd94d', 'center', '900');
  ctx.restore();
  if (state.save.best > 0 || state.save.wins > 0) {
    text(ctx, `Best take $${state.save.best} · Campaigns finished ${state.save.wins}`, state.view.w / 2, 646, 15, 'rgba(255,255,255,0.8)', 'center', '600');
  }
}

export function drawHud(ctx, state) {
  if (state.mode === 'title') {
    drawTitle(ctx, state);
    return;
  }
  // Cash, top-left.
  panel(ctx, 16, 16, 208, 56);
  text(ctx, `$${state.cash}`, 32, 45, 27, '#69db7c');
  drawStars(ctx, state);
  drawObjective(ctx, state);
  drawBanner(ctx, state);
  drawMinimap(ctx, state);
  drawGauges(ctx, state);
  if (state.wanted.stars >= 3 && state.mode === 'playing') {
    const edge = 0.1 + 0.07 * Math.sin(state.time * 6);
    ctx.strokeStyle = Math.floor(state.time * 2) % 2 === 0 ? `rgba(255,59,48,${edge})` : `rgba(47,123,255,${edge})`;
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, state.view.w, state.view.h);
  }
  if (state.mode === 'arrested') {
    drawEndScreen(ctx, state, 'BUSTED', '#ff6b5e', ['The patrol boxed Rio in and the meter ran out.', ...statsLines(state)]);
  } else if (state.mode === 'down') {
    drawEndScreen(ctx, state, 'DOWN AND OUT', '#ff6b5e', ['Solara traffic is merciless to pedestrians.', ...statsLines(state)]);
  } else if (state.mode === 'won') {
    drawEndScreen(ctx, state, 'SOLARA IS YOURS', '#ffd94d', ['Every job done, every debt settled. Mama Sol sends her regards.', ...statsLines(state)]);
  }
}
