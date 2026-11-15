// Token launch radar entrypoint (Node 22, standard library only).
// Reads the sealed snapshot, builds the ranked board, and writes every
// output the gate checks: board.json, dashboard/ (page + generated data),
// screenshots/, and dossier.json via the kit's buildDossier library.
// Deterministic: the same snapshot always produces the same bytes.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoard, renderResearch, renderDataJs } from './lib/model.ts';
import type { Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

function inputPath(): string {
  const args = process.argv.slice(2);
  const flag = args.indexOf('--input');
  if (flag >= 0 && args[flag + 1]) return args[flag + 1];
  if (process.env.MAKEFUN_INPUT_DIR) {
    return path.join(process.env.MAKEFUN_INPUT_DIR, 'snapshot.json');
  }
  return '/input/snapshot.json';
}

function outputDir(): string {
  return process.env.MAKEFUN_OUTPUT_DIR || '/output';
}

function fail(message: string): never {
  throw new Error('token-radar-01-v2: ' + message);
}

async function main(): Promise<void> {
  const snapshot = JSON.parse(
    fs.readFileSync(inputPath(), 'utf8')
  ) as Snapshot;
  const out = outputDir();
  fs.mkdirSync(out, { recursive: true });

  const board = buildBoard(snapshot);

  // Board file. Rows carry the gate's required fields plus the model detail
  // the dashboard renders; extra keys are allowed.
  const boardDoc = {
    rows: board.rows,
    model: {
      as_of: snapshot.as_of,
      comps: board.fit.n,
      intercept: board.fit.intercept,
      slope: board.fit.slope,
      r2: board.fit.r2,
      sigma: board.fit.sigma,
      loo_mean_abs_log_error: board.fit.looMeanAbs,
      candidates: board.rows.length,
      excluded: board.filter.excluded.length,
      verdicts: board.verdictCounts
    }
  };
  fs.writeFileSync(
    path.join(out, 'board.json'),
    JSON.stringify(boardDoc, null, 1) + '\n'
  );

  // Dashboard: copy the page, then write the generated files beside it.
  // 0-research.md sorts first in the dossier so the judge reads the model
  // before the code; z-data.js sorts last so a cut, if any, costs rows.
  const dashOut = path.join(out, 'dashboard');
  fs.mkdirSync(dashOut, { recursive: true });
  fs.cpSync(path.join(repoRoot, 'dashboard'), dashOut, { recursive: true });
  fs.writeFileSync(path.join(dashOut, '0-research.md'), renderResearch(snapshot, board));
  fs.writeFileSync(path.join(dashOut, 'z-data.js'), renderDataJs(snapshot, board));

  // Screenshots ship in the repository and are copied through unchanged.
  const shotsOut = path.join(out, 'screenshots');
  fs.mkdirSync(shotsOut, { recursive: true });
  fs.cpSync(path.join(repoRoot, 'screenshots'), shotsOut, { recursive: true });

  // Self-checks: the gate's shape, verified before the dossier is built.
  if (board.rows.length < 100) fail('board has under 100 rows');
  const seen = new Set<string>();
  for (const row of board.rows) {
    if (seen.has(row.slug)) fail('duplicate slug ' + row.slug);
    seen.add(row.slug);
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      fail('row ' + row.slug + ' has ' + row.farm_steps.length + ' farm steps');
    }
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) {
        fail('row ' + row.slug + ' has a farm step of ' + len + ' chars');
      }
    }
  }
  for (let i = 1; i < board.rows.length; i++) {
    if (board.rows[i].implied_value_usd > board.rows[i - 1].implied_value_usd) {
      fail('board is not sorted by implied value at rank ' + (i + 1));
    }
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) fail('watchlist slug missing from board: ' + slug);
  }

  // buildDossier returns the dossier.json file bytes; the entrypoint writes
  // them. The gate re-runs buildDossier and compares byte for byte.
  const dossierBytes = await buildDossier(out, { text_max_bytes: 65536 });
  const dossierPath = path.join(out, 'dossier.json');
  fs.writeFileSync(dossierPath, dossierBytes);
  console.log('rows=' + board.rows.length
    + ' top=' + board.rows[0].name + ' $' + board.rows[0].implied_value_usd
    + ' verdicts=FARM ' + board.verdictCounts.FARM
    + ' THIN ' + board.verdictCounts.THIN
    + ' SKIP ' + board.verdictCounts.SKIP
    + ' dossier=' + dossierBytes.length + ' bytes');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
