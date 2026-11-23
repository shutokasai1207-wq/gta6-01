# Solara Heat — a make.fun gta6-01 entry

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/shutokasai1207-wq/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/shutokasai1207-wq/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solara Heat** is an original open-world crime game that plays in a desktop
browser from static files — no build step, no network. Everything is its own:
the coastal city of **Solara Bay**, its people, its cars, its jobs and its art
(top-down canvas, drawn in code). Nothing comes from any commercial game.

You are **Rio Vega**, a driver running errands for fixer **Mama Sol**: a package
from the marina, a passenger who turns out to be very hot, a public proof of
nerve, a lesson for a rival courier, and one duffel that half the city wants
back. Finish all five jobs to own the night — get arrested or put in the
marina shallows and the night owns you.

## What's in the world

- A 7×5-block city grid with named places — Sol's Diner, Hotel Palmera, Banco
  Solara, Tito's Auto, Club Neon Palms, Mercado Sol, Marina Del Sol and the
  Solara Airstrip — plus parks, parking lots, palm trees and a beach boardwalk.
- On foot and by car: walk the sidewalks, take any parked or stopped car
  (its driver may object), and drive an arcade handling model with a handbrake.
- Traffic that follows the lanes and turns at intersections, pedestrians who
  stroll the sidewalks and scatter from fast metal, and a rival courier's
  purple car cruising the grid.
- A five-star wanted system: stealing, ramming and worse all feed the heat,
  patrol cars hunt you in numbers as the stars rise, and a pinned, slow target
  gets arrested. Break their line of sight and the heat cools.
- Five chained jobs with markers, an objective arrow, timers and cash pay,
  plus cash bags scattered on the sidewalks for the opportunistic.
- A full HUD: cash and best take, wanted stars, the current job, a live
  minimap (police, the rival, bags and the objective all blip), speed and
  vehicle/health gauges, and the arrest meter when the law gets its hands on you.
- Sound synthesized live in WebAudio — engine, sirens, crashes, paydays — with
  no audio files, and a save of your best take in the browser.

## How to play

| Keys | Action |
| --- | --- |
| WASD / arrow keys | Walk, or accelerate / brake / steer |
| E (or F) | Take a car · get out |
| Space | Handbrake (in a car) · confirm (in menus) |
| P / Esc | Pause |
| Enter / click | Start, confirm, retry |

Run it locally:

```sh
node serve.ts          # serves game/ at http://localhost:8080
```

Hand it in (what `main.ts` does): copies `game/` and `screenshots/` to the
output directory and writes `dossier.json` with the vendored library in
`vendor/makefun-game.ts`, byte-identical to the kit's copy.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Layout

- `game/index.html` — the page; loads `game/src/main.js` as a module.
- `game/src/config.js` — the city's dimensions, the pace of play, the palette.
- `game/src/city.js` — builds Solara Bay: roads, buildings, places, collisions.
- `game/src/entities.js` — the player, cars, traffic, pedestrians, impacts.
- `game/src/wanted.js` — heat, stars, the police hunt and the arrest clock.
- `game/src/missions.js` — Mama Sol's five jobs and their stages.
- `game/src/render.js` — the city from above, the HUD, the minimap, the screens.
- `game/src/audio.js` — synthesized engine, siren and effects.
- `game/src/input.js` — keyboard and mouse.
- `game/src/shots.js` — the staged, seeded scenes the screenshots were taken from.
- `screenshots/` — four real renders of the game running (title, driving,
  a three-star chase, and on foot at the marina).

---
<sub>Entered on [make.fun](https://make.fun/?ref=tbtbaqb8&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
