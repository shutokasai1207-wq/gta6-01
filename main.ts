// Solara Heat — make.fun gta6-01 entry program (Node 22, standard library only).
//
// The game itself is the static site in game/ (open game/index.html in a desktop
// browser and play; no build step, no network). This program is the handover:
// it copies game/ and screenshots/ into the output directory and writes
// dossier.json there with the kit's vendored library, exactly as the grader
// expects to find them.
//
// Run locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// In the grader's container the output directory is /output.

import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

for (const part of ['game', 'screenshots']) {
  if (!existsSync(join(repoDir, part))) {
    throw new Error(`Solara Heat: expected ${part}/ beside main.ts`);
  }
}

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outputDir, 'game'), { recursive: true });
cpSync(join(repoDir, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });

// The caps are the gate's own (see the kit's RULES.txt): the dossier text the
// judge reads is capped, a screenshot is at most 256 KiB, game/ holds at most
// 993 entries and 48 MiB, and no path under game/ exceeds 1000 bytes.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

// One line of confirmation for whoever runs this by hand (the grader ignores
// stdout): what was handed in, and the size of the dossier the judge reads.
const dossierBytes = statSync(join(outputDir, 'dossier.json')).size;
console.log(`Solara Heat handed in: game/ and screenshots/ copied, dossier.json written (${dossierBytes} bytes).`);
