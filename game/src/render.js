// Everything the player sees: the sunlit city from above, the cars and people in
// it, and the HUD wrapped around the view — cash, wanted stars, the job at hand,
// a minimap, and the title / pause / arrested / down / victory screens. Canvas 2D
// only; the simulation never reads anything back from here.
import {
  BEACH_Y, BLOCK, CAR, COLORS, WORLD,
} from './config.js';
import { currentObjective } from './missions.js';
import { enterableCar } from './entities.js';
import { clamp } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_DOWN = 'down';
export const SCREEN_WIN = 'win';

const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif";

/** A deterministic little hash so a building's windows never flicker. */
function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  return ((h * 1274126177) >> 8) / 16777216 % 1;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function star(ctx, cx, cy, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Create the renderer bound to the page's one canvas. */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const cam = { x: WORLD.width / 2, y: WORLD.height / 2 };
  let viewW = 1280;
  let viewH = 800;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  /** Centre the camera on the player at once (staged screenshots use this). */
  function snapTo(state) {
    cam.x = clamp(state.player.x, viewW / 2, WORLD.width - viewW / 2);
    cam.y = clamp(state.player.y, viewH / 2, WORLD.height - viewH / 2);
  }

  function drawWorld(state) {
    const city = state.city;
    const left = cam.x - viewW / 2;
    const top = cam.y - viewH / 2;
    ctx.save();
    ctx.translate(-left, -top);

    // Sea, sand, and the city's green ground.
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(left, top, viewW, viewH);
    ctx.fillStyle = COLORS.waterDeep;
    for (let x = Math.floor(left / 260) * 260; x < left + viewW; x += 260) {
      ctx.fillRect(x, BEACH_Y + 90 + ((x * 7) % 40), 130, 7);
    }
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(0, BEACH_Y, WORLD.width, WORLD.height - BEACH_Y);
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(0, 0, WORLD.width, BEACH_Y);

    // Streets: asphalt bands along every centre line, then their markings.
    ctx.fillStyle = COLORS.road;
    for (const x of city.vRoads) ctx.fillRect(x - 52, 0, 104, BEACH_Y);
    for (const y of city.hRoads) ctx.fillRect(0, y - 52, WORLD.width, 104);
    ctx.strokeStyle = COLORS.laneMark;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 30]);
    for (const x of city.vRoads) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, BEACH_Y); ctx.stroke();
    }
    for (const y of city.hRoads) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.width, y); ctx.stroke();
    }
    ctx.setLineDash([]);
    // Crosswalks where streets meet.
    ctx.fillStyle = COLORS.crosswalk;
    for (const x of city.vRoads) {
      for (const y of city.hRoads) {
        for (let i = -2; i <= 2; i += 1) {
          ctx.fillRect(x + i * 18 - 6, y - 50, 12, 16);
          ctx.fillRect(x + i * 18 - 6, y + 34, 12, 16);
        }
      }
    }

    // Blocks: sidewalks first, then what stands on them.
    for (const block of city.blocks) {
      ctx.fillStyle = COLORS.sidewalk;
      ctx.fillRect(block.x, block.y, BLOCK, BLOCK);
      if (block.kind === 'park') {
        ctx.fillStyle = COLORS.park;
        ctx.fillRect(block.x + 8, block.y + 8, BLOCK - 16, BLOCK - 16);
      } else if (block.kind === 'lot') {
        ctx.fillStyle = '#9aa0a3';
        ctx.fillRect(block.x + 8, block.y + 8, BLOCK - 16, BLOCK - 16);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i += 1) {
          ctx.strokeRect(block.x + 44 + i * 58, block.y + 62, 48, 96);
          ctx.strokeRect(block.x + 44 + i * 58, block.y + 182, 48, 96);
        }
      } else if (block.kind === 'airstrip') {
        ctx.fillStyle = '#565d63';
        ctx.fillRect(block.x + 20, block.y + 128, BLOCK - 40, 84);
        ctx.fillStyle = '#e8e3d0';
        for (let x = block.x + 44; x < block.x + BLOCK - 60; x += 52) {
          ctx.fillRect(x, block.y + 166, 30, 7);
        }
        ctx.font = `bold 26px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText('SOLARA AIR', block.x + 34, block.y + 110);
      }
    }

    // Buildings: a shade of wall, a coloured roof, a scatter of lit windows.
    for (const b of city.buildings) {
      ctx.fillStyle = COLORS.wallShade;
      ctx.fillRect(b.x + 9, b.y + 12, b.w, b.h);
      ctx.fillStyle = '#6b5136';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = COLORS[b.roof];
      ctx.fillRect(b.x + 7, b.y + 7, b.w - 14, b.h - 14);
      ctx.fillStyle = 'rgba(255, 244, 190, 0.5)';
      const stepX = 26;
      const stepY = 30;
      for (let wx = b.x + 18; wx < b.x + b.w - 20; wx += stepX) {
        for (let wy = b.y + 18; wy < b.y + b.h - 20; wy += stepY) {
          if (hash(Math.round(wx), Math.round(wy)) > -0.35) ctx.fillRect(wx, wy, 9, 12);
        }
      }
      if (b.name) {
        ctx.font = `bold 17px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(20, 24, 30, 0.8)';
        ctx.fillText(b.name.toUpperCase(), b.x + b.w / 2, b.y + b.h / 2 + 6);
        ctx.textAlign = 'left';
      }
    }

    // Palms: a trunk dot and a fan of fronds.
    for (const palm of city.palms) {
      ctx.strokeStyle = COLORS.palm;
      ctx.lineWidth = 3.4;
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + palm.x * 0.01;
        ctx.beginPath();
        ctx.moveTo(palm.x, palm.y);
        ctx.quadraticCurveTo(
          palm.x + Math.cos(a) * 11, palm.y + Math.sin(a) * 11 - 3,
          palm.x + Math.cos(a) * 19, palm.y + Math.sin(a) * 19 + 3,
        );
        ctx.stroke();
      }
      ctx.fillStyle = COLORS.palmTrunk;
      ctx.beginPath();
      ctx.arc(palm.x, palm.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Cash bags waiting on the sidewalks.
    for (const bag of state.pickups) {
      if (bag.taken) continue;
      const pulse = 1 + Math.sin(state.time * 4 + bag.x) * 0.12;
      ctx.strokeStyle = COLORS.pickup;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(bag.x, bag.y, 15 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#1e7a3c';
      roundRect(ctx, bag.x - 8, bag.y - 7, 16, 15, 5);
      ctx.fill();
      ctx.fillStyle = '#dfffe9';
      ctx.font = `bold 12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('$', bag.x, bag.y + 4.5);
      ctx.textAlign = 'left';
    }

    drawObjectiveMarker(state);
    for (const ped of state.peds) drawPed(ped);
    for (const car of state.cars) drawCar(state, car);
    if (!state.player.car) drawPlayer(state);
    drawParticles(state);

    // The bust clock, hanging over the player's head while it fills.
    const w = state.wanted;
    if (w && w.bust > 0.05 && !state.over) {
      const p = state.player;
      ctx.fillStyle = 'rgba(10,16,22,0.6)';
      roundRect(ctx, p.x - 34, p.y - 52, 68, 9, 4);
      ctx.fill();
      ctx.fillStyle = '#3d9be8';
      roundRect(ctx, p.x - 32, p.y - 50, 64 * clamp(w.bust / 2.6, 0, 1), 5, 2.5);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawObjectiveMarker(state) {
    const obj = currentObjective(state);
    if (obj.x === null || state.over) return;
    const bob = Math.sin(state.time * 3.2) * 6;
    ctx.strokeStyle = COLORS.objective;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, 26 + bob * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 194, 31, 0.16)';
    ctx.beginPath();
    ctx.moveTo(obj.x - 13, obj.y);
    ctx.lineTo(obj.x + 13, obj.y);
    ctx.lineTo(obj.x, obj.y - 190);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLORS.objective;
    ctx.beginPath();
    ctx.moveTo(obj.x, obj.y - 44 + bob);
    ctx.lineTo(obj.x - 11, obj.y - 64 + bob);
    ctx.lineTo(obj.x + 11, obj.y - 64 + bob);
    ctx.closePath();
    ctx.fill();
  }

  function drawPed(ped) {
    ctx.fillStyle = 'rgba(20,20,20,0.25)';
    ctx.beginPath();
    ctx.arc(ped.x + 2, ped.y + 3, 8, 0, Math.PI * 2);
    ctx.fill();
    if (ped.down > 0) {
      ctx.fillStyle = ped.color;
      roundRect(ctx, ped.x - 10, ped.y - 4, 20, 8, 4);
      ctx.fill();
      return;
    }
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c79b';
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, 4.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer(state) {
    const p = state.player;
    ctx.fillStyle = 'rgba(20,20,20,0.3)';
    ctx.beginPath();
    ctx.arc(p.x + 2, p.y + 3, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.playerTrim;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.angle) * 13, p.y + Math.sin(p.angle) * 13);
    ctx.stroke();
    ctx.fillStyle = '#f2c79b';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCar(state, car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(15,15,20,0.32)';
    roundRect(ctx, -CAR.length / 2 + 3, -CAR.width / 2 + 4, CAR.length, CAR.width, 6);
    ctx.fill();
    ctx.fillStyle = car.dead ? '#3a3a3d' : car.color;
    roundRect(ctx, -CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 6);
    ctx.fill();
    // Cabin and glass.
    ctx.fillStyle = car.dead ? '#2c2c2e' : 'rgba(16, 30, 44, 0.88)';
    roundRect(ctx, -9, -CAR.width / 2 + 3.5, 19, CAR.width - 7, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(190, 225, 245, 0.5)';
    ctx.fillRect(8, -CAR.width / 2 + 4.5, 3.4, CAR.width - 9);
    // Wheels.
    ctx.fillStyle = '#14161a';
    for (const [wx, wy] of [[-15, -CAR.width / 2 - 1], [15, -CAR.width / 2 - 1], [-15, CAR.width / 2 - 2.6], [15, CAR.width / 2 - 2.6]]) {
      ctx.fillRect(wx - 4.5, wy, 9, 3.6);
    }
    if (car.kind === 'police') {
      ctx.fillStyle = COLORS.policeTrim;
      ctx.fillRect(-4, -CAR.width / 2 + 2, 9, CAR.width - 4);
      const phase = Math.floor(state.time * 5 + car.id) % 2 === 0;
      ctx.fillStyle = phase ? '#ff4747' : '#3868ff';
      ctx.fillRect(-3.4, -6.4, 6.8, 5.4);
      ctx.fillStyle = phase ? '#3868ff' : '#ff4747';
      ctx.fillRect(-3.4, 1, 6.8, 5.4);
    }
    if (car.kind === 'rival') {
      ctx.fillStyle = '#f5d13d';
      ctx.fillRect(-CAR.length / 2 + 3, -2.2, CAR.length - 6, 4.4);
    }
    if (car === state.player.car) {
      ctx.strokeStyle = COLORS.player;
      ctx.lineWidth = 2.2;
      roundRect(ctx, -CAR.length / 2 - 2.5, -CAR.width / 2 - 2.5, CAR.length + 5, CAR.width + 5, 8);
      ctx.stroke();
    }
    ctx.restore();
    if (car.dead) {
      // A wreck smoulders: two grey puffs on a slow loop.
      ctx.fillStyle = 'rgba(90, 90, 95, 0.35)';
      const rise = (state.time * 14 + car.id * 30) % 26;
      ctx.beginPath();
      ctx.arc(car.x, car.y - rise, 7 + rise * 0.3, 0, Math.PI * 2);
      ctx.arc(car.x + 6, car.y - rise * 0.7, 5 + rise * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawParticles(state) {
    for (const pt of state.particles) {
      ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = COLORS.hudShadow;
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
  }

  function drawMinimap(state) {
    const mw = 198;
    const mh = 150;
    const x0 = 14;
    const y0 = viewH - mh - 14;
    const scale = Math.min(mw / WORLD.width, mh / WORLD.height);
    const ox = x0 + (mw - WORLD.width * scale) / 2;
    const oy = y0 + (mh - WORLD.height * scale) / 2;
    const px = (wx) => ox + wx * scale;
    const py = (wy) => oy + wy * scale;
    panel(x0 - 4, y0 - 4, mw + 8, mh + 8);
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(x0, y0, mw, mh);
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(px(0), py(0), WORLD.width * scale, BEACH_Y * scale);
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(px(0), py(BEACH_Y), WORLD.width * scale, (WORLD.height - BEACH_Y) * scale);
    ctx.strokeStyle = 'rgba(240, 238, 220, 0.65)';
    ctx.lineWidth = 1.4;
    for (const x of state.city.vRoads) {
      ctx.beginPath(); ctx.moveTo(px(x), py(0)); ctx.lineTo(px(x), py(BEACH_Y)); ctx.stroke();
    }
    for (const y of state.city.hRoads) {
      ctx.beginPath(); ctx.moveTo(px(0), py(y)); ctx.lineTo(px(WORLD.width), py(y)); ctx.stroke();
    }
    for (const bag of state.pickups) {
      if (bag.taken) continue;
      ctx.fillStyle = COLORS.pickup;
      ctx.fillRect(px(bag.x) - 1.6, py(bag.y) - 1.6, 3.2, 3.2);
    }
    const obj = currentObjective(state);
    if (obj.x !== null) {
      const pulse = 2.6 + Math.sin(state.time * 4) * 1.1;
      ctx.fillStyle = COLORS.objective;
      ctx.beginPath();
      ctx.arc(px(obj.x), py(obj.y), pulse + 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of state.cars) {
      if (car.kind !== 'police' || car.dead) continue;
      ctx.fillStyle = Math.floor(state.time * 4) % 2 ? '#ff5a5a' : '#5a8aff';
      ctx.beginPath();
      ctx.arc(px(car.x), py(car.y), 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (state.rival && !state.rival.dead) {
      ctx.fillStyle = '#c77dff';
      ctx.beginPath();
      ctx.arc(px(state.rival.x), py(state.rival.y), 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player, a small arrow in their heading.
    const p = state.player;
    ctx.save();
    ctx.translate(px(p.x), py(p.y));
    ctx.rotate(p.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-4.4, -3.6);
    ctx.lineTo(-4.4, 3.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.font = `bold 10px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 247, 230, 0.85)';
    ctx.fillText('SOLARA BAY', x0 + 6, y0 + 14);
  }

  function drawHUD(state, meta) {
    const p = state.player;
    const w = state.wanted;
    const obj = currentObjective(state);

    // Cash and best, top-left.
    panel(14, 14, 178, 58);
    ctx.fillStyle = COLORS.hudText;
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillText(`$${state.cash}`, 28, 43);
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 247, 230, 0.75)';
    ctx.fillText(`best $${meta.best}`, 28, 63);

    // The job at hand, top-centre.
    const jobW = Math.min(520, viewW - 460);
    if (jobW > 220) {
      const jx = (viewW - jobW) / 2;
      panel(jx, 14, jobW, obj.timer !== null && obj.timer !== undefined ? 76 : 60);
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.objective;
      ctx.font = `bold 14px ${FONT}`;
      ctx.fillText(obj.title.toUpperCase(), viewW / 2, 34);
      ctx.fillStyle = COLORS.hudText;
      ctx.font = `15.5px ${FONT}`;
      ctx.fillText(obj.text, viewW / 2, 57);
      if (obj.timer !== null && obj.timer !== undefined) {
        ctx.fillStyle = obj.timer < 15 ? '#ff6b5e' : COLORS.hudText;
        ctx.font = `bold 14px ${FONT}`;
        ctx.fillText(`${Math.max(0, Math.ceil(obj.timer))}s left`, viewW / 2, 79);
      }
      ctx.textAlign = 'left';
    }

    // Wanted stars, top-right.
    panel(viewW - 196, 14, 182, 58);
    for (let i = 0; i < 5; i += 1) {
      const filled = w && i < w.stars;
      star(ctx, viewW - 168 + i * 33, 37, 13.5, filled ? '#ffc21f' : 'rgba(255,255,255,0.22)');
    }
    ctx.font = `bold 11px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 247, 230, 0.8)';
    ctx.fillText(w && w.stars > 0 ? 'WANTED' : 'NO HEAT', viewW - 168, 63);

    // Toast: the fixer's word, centre screen.
    const m = state.mission;
    if (m && m.toastT > 0 && m.toast) {
      ctx.font = `bold 19px ${FONT}`;
      const tw = ctx.measureText(m.toast).width + 44;
      panel((viewW - tw) / 2, 108, tw, 42);
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.hudText;
      ctx.fillText(m.toast, viewW / 2, 136);
      ctx.textAlign = 'left';
    }

    drawMinimap(state);

    // Gauges, bottom-right: speed and the relevant health.
    const gw = 190;
    const gx = viewW - gw - 14;
    const gy = viewH - 86;
    panel(gx, gy, gw, 72);
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = 'rgba(255, 247, 230, 0.8)';
    if (p.car) {
      const mph = Math.round(Math.abs(p.car.speed) * 0.16);
      ctx.fillStyle = COLORS.hudText;
      ctx.font = `bold 25px ${FONT}`;
      ctx.fillText(`${mph}`, gx + 14, gy + 31);
      ctx.font = `13px ${FONT}`;
      ctx.fillStyle = 'rgba(255, 247, 230, 0.8)';
      ctx.fillText('mph', gx + 14 + ctx.measureText(`${mph}`).width + 24, gy + 31);
      bar(gx + 14, gy + 44, gw - 28, 10, p.car.health / 100, '#e8a04c', 'CAR');
    } else {
      ctx.fillText('ON FOOT', gx + 14, gy + 24);
      bar(gx + 14, gy + 34, gw - 28, 10, p.health / 100, '#57e389', 'RIO');
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = 'rgba(255, 247, 230, 0.65)';
      ctx.fillText('WASD move · E take a car', gx + 14, gy + 62);
    }

    // Context prompt, bottom-centre.
    let prompt = null;
    if (p.car) prompt = 'E — get out · SPACE — handbrake';
    else if (enterableCar(state)) prompt = 'E — take this car';
    if (prompt) {
      ctx.font = `bold 16px ${FONT}`;
      const tw = ctx.measureText(prompt).width + 36;
      panel((viewW - tw) / 2, viewH - 52, tw, 36);
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.hudText;
      ctx.fillText(prompt, viewW / 2, viewH - 28);
      ctx.textAlign = 'left';
    }

    drawObjectiveArrow(state, obj);
  }

  function bar(x, y, w, h, ratio, color, label) {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = color;
    if (ratio > 0) {
      roundRect(ctx, x, y, w * clamp(ratio, 0, 1), h, h / 2);
      ctx.fill();
    }
    ctx.font = `bold 9.5px ${FONT}`;
    ctx.fillStyle = 'rgba(10, 16, 22, 0.75)';
    ctx.fillText(label, x + 5, y + h - 1.5);
  }

  /** When the job is off-screen, an arrow at the view's edge points the way. */
  function drawObjectiveArrow(state, obj) {
    if (obj.x === null || state.over) return;
    const sx = obj.x - cam.x + viewW / 2;
    const sy = obj.y - cam.y + viewH / 2;
    if (sx > 30 && sx < viewW - 30 && sy > 30 && sy < viewH - 30) return;
    const cx = viewW / 2;
    const cy = viewH / 2;
    const a = Math.atan2(sy - cy, sx - cx);
    const ex = clamp(sx, 44, viewW - 44);
    const ey = clamp(sy, 120, viewH - 70);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(a);
    ctx.fillStyle = COLORS.objective;
    ctx.beginPath();
    ctx.moveTo(17, 0);
    ctx.lineTo(-9, -10);
    ctx.lineTo(-9, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const d = Math.round(Math.hypot(obj.x - state.player.x, obj.y - state.player.y) / 10);
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillStyle = COLORS.hudText;
    ctx.textAlign = 'center';
    ctx.fillText(`${d}m`, ex, ey + 26);
    ctx.textAlign = 'left';
  }

  function overlay(alpha, color = '10, 16, 22') {
    ctx.fillStyle = `rgba(${color}, ${alpha})`;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  function centreLines(lines, firstY, gap) {
    ctx.textAlign = 'center';
    lines.forEach((line, i) => {
      ctx.font = line.font;
      ctx.fillStyle = line.color;
      ctx.fillText(line.text, viewW / 2, firstY + i * gap);
    });
    ctx.textAlign = 'left';
  }

  function drawTitle(state, meta) {
    overlay(0.42);
    const cy = viewH / 2;
    centreLines([
      { text: 'SOLARA HEAT', font: `bold 74px ${FONT}`, color: COLORS.title },
      { text: 'An open-world crime story in the city of Solara Bay', font: `19px ${FONT}`, color: COLORS.hudText },
      { text: 'Rio Vega runs errands for fixer Mama Sol — packages, passengers, and one duffel', font: `16px ${FONT}`, color: 'rgba(255,247,230,0.85)' },
      { text: 'that half the city wants back. Do all five jobs. Do not get caught.', font: `16px ${FONT}`, color: 'rgba(255,247,230,0.85)' },
      { text: 'WASD / arrows — move & drive · E — take or leave a car · SPACE — handbrake · P — pause', font: `15px ${FONT}`, color: 'rgba(255,247,230,0.75)' },
      { text: meta.best > 0 ? `Best take so far: $${meta.best}` : 'Your first night in Solara Bay starts now.', font: `15px ${FONT}`, color: 'rgba(255,247,230,0.75)' },
      { text: 'PRESS ENTER OR CLICK TO PLAY', font: `bold 22px ${FONT}`, color: COLORS.title },
    ], cy - 148, 40);
  }

  function drawEnd(state, meta, kind) {
    const jobs = state.mission ? state.mission.index : 0;
    if (kind === SCREEN_BUSTED) {
      overlay(0.55, '8, 18, 38');
      centreLines([
        { text: 'ARRESTED', font: `bold 64px ${FONT}`, color: '#7db4ff' },
        { text: 'The Solara Bay PD finally kept hold of Rio.', font: `18px ${FONT}`, color: COLORS.hudText },
        { text: `Jobs done: ${jobs} of 5 · Cash earned: $${state.earned} · Best: $${meta.best}`, font: `17px ${FONT}`, color: 'rgba(255,247,230,0.85)' },
        { text: 'PRESS ENTER TO TRY AGAIN', font: `bold 20px ${FONT}`, color: COLORS.title },
      ], viewH / 2 - 90, 44);
    } else if (kind === SCREEN_DOWN) {
      overlay(0.55, '40, 8, 8');
      centreLines([
        { text: 'DOWN AND OUT', font: `bold 64px ${FONT}`, color: '#ff8a7a' },
        { text: 'Rio wakes up in the marina shallows, pockets empty.', font: `18px ${FONT}`, color: COLORS.hudText },
        { text: `Jobs done: ${jobs} of 5 · Cash earned: $${state.earned} · Best: $${meta.best}`, font: `17px ${FONT}`, color: 'rgba(255,247,230,0.85)' },
        { text: 'PRESS ENTER TO TRY AGAIN', font: `bold 20px ${FONT}`, color: COLORS.title },
      ], viewH / 2 - 90, 44);
    } else {
      overlay(0.5, '30, 24, 4');
      centreLines([
        { text: 'YOU RUN SOLARA BAY', font: `bold 58px ${FONT}`, color: COLORS.title },
        { text: 'Every job done, every debt paid. Mama Sol raises a glass to Rio.', font: `18px ${FONT}`, color: COLORS.hudText },
        { text: `Cash earned: $${state.earned} · Best: $${meta.best}`, font: `17px ${FONT}`, color: 'rgba(255,247,230,0.85)' },
        { text: 'PRESS ENTER TO PLAY AGAIN', font: `bold 20px ${FONT}`, color: COLORS.title },
      ], viewH / 2 - 90, 44);
    }
  }

  /**
   * Paint one frame. `screen` says which overlay, if any, sits over the world;
   * `meta` carries the save's best take; `dt` eases the camera along.
   */
  function draw(state, screen, meta, dt = 0) {
    const p = state.player;
    const lead = p.car ? 0.32 : 0.12;
    const tx = clamp(p.x + (p.car ? p.car.vx * lead : 0), viewW / 2, Math.max(viewW / 2, WORLD.width - viewW / 2));
    const ty = clamp(p.y + (p.car ? p.car.vy * lead : 0), viewH / 2, Math.max(viewH / 2, WORLD.height - viewH / 2));
    const ease = dt > 0 ? Math.min(1, dt * 4.5) : 1;
    cam.x += (tx - cam.x) * ease;
    cam.y += (ty - cam.y) * ease;

    drawWorld(state);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, meta);
      return;
    }
    drawHUD(state, meta);
    if (screen === SCREEN_PAUSED) {
      overlay(0.45);
      centreLines([
        { text: 'PAUSED', font: `bold 52px ${FONT}`, color: COLORS.hudText },
        { text: 'P or ENTER to get back to it', font: `17px ${FONT}`, color: 'rgba(255,247,230,0.85)' },
      ], viewH / 2 - 20, 46);
    } else if (screen === SCREEN_BUSTED || screen === SCREEN_DOWN || screen === SCREEN_WIN) {
      drawEnd(state, meta, screen);
    }
    // A red edge while Rio is hurt and standing.
    if (!p.car && p.health < 38 && screen === SCREEN_PLAY) {
      ctx.strokeStyle = `rgba(220, 50, 40, ${0.5 - p.health / 90})`;
      ctx.lineWidth = 16;
      ctx.strokeRect(0, 0, viewW, viewH);
    }
  }

  return { draw, snapTo };
}
