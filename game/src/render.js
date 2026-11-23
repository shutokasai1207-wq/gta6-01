// render.js — draws Solara Bay: roads, blocks, palms, cars, people, and the
// gold job marker. Flat shapes and a hard sun; everything is drawn from the
// simulation state, so what a screenshot shows is the game itself.

import { ROAD } from './city.js';

function rect(ctx, x, y, w, h, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
}

function roundRect(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
}

function circle(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawRoads(ctx, city) {
  rect(ctx, 0, 0, city.width, city.height, '#9aa0a3'); // pavement base
  ctx.fillStyle = '#3c4043';
  for (const cx of city.vRoads) ctx.fillRect(cx - ROAD / 2, 0, ROAD, city.height);
  for (const cy of city.hRoads) ctx.fillRect(0, cy - ROAD / 2, city.width, ROAD);
  // Centre dashes.
  ctx.fillStyle = '#d8c95a';
  for (const cx of city.vRoads) {
    for (let y = 12; y < city.height; y += 44) ctx.fillRect(cx - 2, y, 4, 24);
  }
  for (const cy of city.hRoads) {
    for (let x = 12; x < city.width; x += 44) ctx.fillRect(x, cy - 2, 24, 4);
  }
}

function drawPalm(ctx, palm) {
  const { x, y, s } = palm;
  ctx.strokeStyle = '#8a6b42';
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 3 * s, y - 8 * s, x + 6 * s, y - 13 * s);
  ctx.stroke();
  ctx.strokeStyle = '#3e9e4f';
  ctx.lineWidth = 2.4 * s;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(x + 6 * s, y - 13 * s);
    ctx.quadraticCurveTo(
      x + 6 * s + Math.cos(a) * 9 * s, y - 13 * s + Math.sin(a) * 5 * s - 3 * s,
      x + 6 * s + Math.cos(a) * 14 * s, y - 13 * s + Math.sin(a) * 9 * s + 2 * s,
    );
    ctx.stroke();
  }
}

function drawBlock(ctx, block) {
  if (block.kind === 'park') {
    rect(ctx, block.x, block.y, block.w, block.h, '#69a854');
    rect(ctx, block.x + block.w / 2 - 7, block.y, 14, block.h, '#d9c9a3');
    rect(ctx, block.x, block.y + block.h / 2 - 7, block.w, 14, '#d9c9a3');
    for (const palm of block.palms) drawPalm(ctx, palm);
    return;
  }
  if (block.kind === 'parking') {
    rect(ctx, block.x, block.y, block.w, block.h, '#565b60');
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    for (const spot of block.spots) {
      ctx.beginPath();
      ctx.moveTo(spot.x - 16, spot.y - 20);
      ctx.lineTo(spot.x - 16, spot.y + 20);
      ctx.lineTo(spot.x + 16, spot.y + 20);
      ctx.lineTo(spot.x + 16, spot.y - 20);
      ctx.stroke();
    }
    return;
  }
  // Buildings and places: a roof with a parapet, windows on the grid.
  const s = block.solid;
  rect(ctx, s.x + 7, s.y + 9, s.w, s.h, 'rgba(0,0,0,0.28)');
  rect(ctx, s.x, s.y, s.w, s.h, block.roof);
  rect(ctx, s.x + 10, s.y + 10, s.w - 20, s.h - 20, block.color);
  ctx.fillStyle = 'rgba(255,244,190,0.5)';
  const cols = Math.floor((s.w - 28) / 26);
  const rows = Math.floor((s.h - 28) / 24);
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if ((i * 7 + j * 13 + block.col * 3 + block.row) % 3 === 0) continue;
      ctx.fillRect(s.x + 18 + i * 26, s.y + 16 + j * 24, 11, 9);
    }
  }
  if (block.kind === 'place') {
    // The forecourt, then the sign band with the place's name.
    rect(ctx, block.x, block.y + block.h * 0.62, block.w, block.h * 0.38, '#6a6f74');
    rect(ctx, s.x, s.y + s.h - 30, s.w, 30, block.sign);
    ctx.fillStyle = '#1d2126';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(block.name.toUpperCase(), s.x + s.w / 2, s.y + s.h - 15);
  }
}

function drawMarker(ctx, state) {
  const target = state.jobs.target;
  if (!target || state.mode !== 'playing') return;
  const pulse = 30 + Math.sin(state.time * 4.2) * 6;
  const grad = ctx.createLinearGradient(0, target.y - 190, 0, target.y);
  grad.addColorStop(0, 'rgba(255,209,77,0)');
  grad.addColorStop(1, 'rgba(255,209,77,0.4)');
  rect(ctx, target.x - 9, target.y - 190, 18, 190, grad);
  ctx.beginPath();
  ctx.arc(target.x, target.y, pulse, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffd94d';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(target.x, target.y, 10, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd94d';
  ctx.fill();
}

function drawBag(ctx, bag, time) {
  const bob = Math.sin(time * 3 + bag.x) * 2.5;
  circle(ctx, bag.x, bag.y + bob + 3, 10, 'rgba(0,0,0,0.25)');
  circle(ctx, bag.x, bag.y + bob, 10, '#2f9e44');
  ctx.fillStyle = '#ffe066';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', bag.x, bag.y + bob + 1);
}

function drawCar(ctx, state, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  circle(ctx, 2, 4, 17, 'rgba(0,0,0,0.25)');
  ctx.rotate(car.angle);
  const isPolice = car.kind === 'police';
  const body = isPolice ? '#f2f3f5' : car.color;
  roundRect(ctx, -20, -11, 40, 22, 6, body);
  if (isPolice) {
    rect(ctx, -7, -11, 13, 22, '#22262b');
  }
  if (car.kind === 'rival') {
    rect(ctx, -20, -3, 40, 6, '#ff7b00');
  }
  // Cabin and glass.
  roundRect(ctx, -7, -8.5, 17, 17, 3, 'rgba(20,28,38,0.88)');
  roundRect(ctx, 11, -7.5, 4.5, 15, 2, 'rgba(140,200,235,0.8)');
  // Wheels, the front pair turned by the steering.
  ctx.fillStyle = '#14161a';
  const wy = 11;
  ctx.fillRect(-14, -wy - 2, 9, 4);
  ctx.fillRect(-14, wy - 2, 9, 4);
  ctx.save();
  ctx.translate(12, -wy);
  ctx.rotate(car.steer * 0.45);
  ctx.fillRect(-4.5, -2, 9, 4);
  ctx.restore();
  ctx.save();
  ctx.translate(12, wy);
  ctx.rotate(car.steer * 0.45);
  ctx.fillRect(-4.5, -2, 9, 4);
  ctx.restore();
  // Headlights.
  circle(ctx, 20, -6.5, 2.2, '#fff6bf');
  circle(ctx, 20, 6.5, 2.2, '#fff6bf');
  if (isPolice) {
    const flash = Math.floor(state.time * 5 + car.id) % 2 === 0;
    rect(ctx, -3, -8, 6, 5, flash ? '#ff3b30' : '#5b1a16');
    rect(ctx, -3, 3, 6, 5, flash ? '#1a2f5b' : '#2f7bff');
  }
  ctx.restore();
  // A wreck smokes.
  if (car.health < 35) {
    const rise = (state.time * 22 + car.id * 13) % 26;
    circle(ctx, car.x + 8, car.y - 10 - rise, 4 + rise * 0.22, 'rgba(90,90,90,0.4)');
  }
}

function drawPed(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.downT > 0) {
    ctx.rotate(1.35);
    ctx.globalAlpha = 0.75;
  }
  circle(ctx, 1, 2, 7, 'rgba(0,0,0,0.22)');
  circle(ctx, 0, 0, 6.4, `hsl(${ped.hue}, 55%, 52%)`);
  circle(ctx, 0, -1.5, 3.4, '#f2c79b');
  ctx.restore();
}

function drawPlayer(ctx, state) {
  const p = state.player;
  if (p.car) return;
  const bob = Math.abs(Math.sin(p.walkCycle)) * 1.6;
  ctx.save();
  ctx.translate(p.x, p.y - bob);
  circle(ctx, 1, 3 + bob, 8, 'rgba(0,0,0,0.25)');
  circle(ctx, 0, 0, 8, '#0fb5ae');
  circle(ctx, 0, -2, 4.2, '#f2c79b');
  ctx.strokeStyle = '#0b7c78';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(p.angle) * 10, Math.sin(p.angle) * 10);
  ctx.stroke();
  ctx.restore();
}

export function drawWorld(ctx, state) {
  const { camera, view } = state;
  rect(ctx, 0, 0, view.w, view.h, '#1d4e5e'); // the bay, past the world's edge
  ctx.save();
  ctx.translate(-Math.round(camera.x), -Math.round(camera.y));
  drawRoads(ctx, state.city);
  for (const block of state.city.blocks) drawBlock(ctx, block);
  drawMarker(ctx, state);
  for (const bag of state.bags) drawBag(ctx, bag, state.time);
  for (const ped of state.peds) drawPed(ctx, ped);
  const sorted = [...state.cars].sort((a, b) => a.y - b.y);
  for (const car of sorted) drawCar(ctx, state, car);
  drawPlayer(ctx, state);
  ctx.restore();
}
