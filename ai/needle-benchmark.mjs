#!/usr/bin/env node
// Opt-in, real-model accuracy benchmark. Not a deterministic unit test:
// CPU speed and Needle's predictions can vary by platform/runtime.
// No proposed tool is executed; failures are reported, not silently skipped.
import { readFile } from 'node:fs/promises';
import { routeNeedle } from './needle-engine.mjs';
import { selectTools } from './needle-selection.mjs';

function parseArgs(argv) {
  const options = { limit: 5, mode: 'auto', threshold: null };
  for (const item of argv) {
    if (item === '--help') {
      console.log('needle-benchmark [--limit=1..35] [--mode=auto|explicit] [--min-accuracy=0..1]');
      console.log('Runs the real local Needle model; NO catalog action is executed.');
      process.exit(0);
    }
    const [flag, value] = item.split('=', 2);
    if (flag === '--limit') {
      options.limit = Number(value);
      if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 35) {
        throw new Error('--limit must be an integer between 1 and 35');
      }
    } else if (flag === '--mode') {
      if (!['auto', 'explicit'].includes(value)) throw new Error('Unsupported --mode');
      options.mode = value;
    } else if (flag === '--min-accuracy') {
      options.threshold = Number(value);
      if (!Number.isFinite(options.threshold) || options.threshold < 0 || options.threshold > 1) {
        throw new Error('--min-accuracy must be a number between 0 and 1');
      }
    } else throw new Error('Unknown argument: ' + item);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const catalog = JSON.parse(await readFile(new URL('./needle-tools.json', import.meta.url), 'utf8'));
const scenarios = JSON.parse(await readFile(new URL('./needle-scenarios.json', import.meta.url), 'utf8'));
const tested = scenarios.examples.slice(0, options.limit);
let correct = 0, shortlisted = 0, empty = 0, errors = 0;
const results = [];

for (const entry of tested) {
  // Measure the deterministic candidate-selection stage independently from
  // model execution. A model exception must not erase a valid shortlist hit.
  const requestedScope = options.mode === 'auto' ? 'auto' : entry.scope;
  const candidates = selectTools(catalog, requestedScope, entry.prompt);
  const offered = candidates.names.includes(entry.expectedTool);
  if (offered) shortlisted++;
  try {
    const result = await routeNeedle(entry.prompt, {
      catalog, scope: requestedScope,
    });
    if (result.executed !== false || result.plans.some((p) => p.executed !== false)) {
      throw new Error('Router executed a tool during benchmark');
    }
    if (result.scope !== candidates.scope ||
        JSON.stringify(result.selectedTools) !== JSON.stringify(candidates.names)) {
      throw new Error('Inferred tool shortlist changed unexpectedly');
    }
    const chosen = result.function_calls.some((call) => call.name === entry.expectedTool);
    if (chosen) correct++;
    if (result.function_calls.length === 0) empty++;
    results.push({
      id: entry.id, expected: entry.expectedTool, inferredScope: result.scope,
      offered, chosen, predicted: result.function_calls.map((call) => call.name),
    });
  } catch (error) {
    errors++;
    results.push({
      id: entry.id, expected: entry.expectedTool, offered,
      inferredScope: candidates.scope,
      error: String(error.message ?? error),
    });
  }
}

const report = {
  benchmark: 'Needle 3 natural-language scenario selection',
  mode: options.mode, total: tested.length,
  offeredCorrectTool: shortlisted,
  selectionRecall: shortlisted / tested.length,
  correct, selectionAccuracy: correct / tested.length,
  empty, errors, executed: false, results,
};
console.log(JSON.stringify(report, null, 2));
if (options.threshold !== null && report.selectionAccuracy < options.threshold) {
  console.error('Needle accuracy below required threshold: ' + options.threshold);
  process.exitCode = 1;
}
