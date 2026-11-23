// Solara Heat — the hand-in program for the make.fun gta6-01 entry (Node 22,
// standard library only). The game itself is this directory's game/ folder: plain
// static files a desktop browser plays offline, no build step and no network.
// This program copies game/ and screenshots/ from beside itself into /output and
// writes /output/dossier.json — the summary the judge reads — with the vendored
// make.fun library, so the dossier on disk is byte for byte the one the library
// builds from the same files.
//
// Play it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps are the scorer's own (the gate refuses more than 4 screenshots or one
// over 256 KiB, more than 993 files or 48 MiB under game/, a game path over
// 1,000 bytes); only text_max_bytes shapes the dossier's bytes.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

const shots = existsSync(join(out, 'screenshots')) ? readdirSync(join(out, 'screenshots')).length : 0;
console.log(`Solara Heat handed in: game/ + ${shots} screenshots + dossier.json (${dossier.length} bytes) -> ${out}`);
