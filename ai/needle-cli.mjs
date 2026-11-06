#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadModel } from 'cactus-needle';
import { executeAllowed, planCall, validateCall } from './needle-policy.mjs';
import { SCOPES, routeNeedle } from './needle-engine.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(await readFile(resolve(directory, 'needle-tools.json'), 'utf8'));
const argv = process.argv.slice(2);
let scope = 'auto', execute = false, allowWrite = false, callText = null;
let command = null;
const promptParts = [];
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (['--help','-h','--health','--download','--catalog'].includes(arg)) {
    if (command) throw new Error('Only one command option can be supplied');
    command = arg;
  } else if (arg === '--execute') execute = true;
  else if (arg === '--allow-write') allowWrite = true;
  else if (arg === '--scope') {
    if (!argv[i+1]) throw new Error('--scope requires a value');
    scope = argv[++i];
  } else if (arg === '--call-json') {
    if (!argv[i+1] || callText !== null) throw new Error('--call-json requires one JSON object');
    callText = argv[++i];
  } else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
  else promptParts.push(arg);
}
if (!SCOPES.includes(scope)) throw new Error('Unsupported --scope value');
if (allowWrite && !execute) throw new Error('--allow-write requires --execute');
function print(data) { process.stdout.write(JSON.stringify(data,null,2)+'\n'); }
if (command === '--help' || command === '-h') {
  console.log(`needle-cli [--scope auto|system|apk|nix|workspace|workflow|all] [--execute] [--allow-write] "natural request"
needle-cli --call-json '{"name":"nix_version","arguments":{}}' [--execute]
needle-cli --catalog  /  --health  /  --download
Default: model-proposed JSON only. Read-only tools execute only with --execute.
Workspace create requires --execute --allow-write.
Dangerous Nix builds, apk updates, installs, removals and GC are ALWAYS advisory only.
No arbitrary shell command is accepted. Pi's separate bash tool is not restricted.`);
} else if (command === '--health') {
  print({ runtime: 'cactus-needle WASM', catalogVersion: catalog.version,
    scopes: SCOPES, count: Object.keys(catalog.tools).length,
    byScope: Object.fromEntries(Object.keys(catalog.groups).map(
      group => [group, Object.values(catalog.tools).filter(t => t.category === group).length])),
    executedByDefault: false, piCli: 'pi' });
} else if (command === '--catalog') {
  print({ version: catalog.version, groups: catalog.groups,
    tools: Object.fromEntries(Object.entries(catalog.tools).map(([name, entry]) =>
      [name,{category:entry.category,mode:entry.mode,description:entry.description,
        inputSchema:entry.inputSchema,commandPreview:entry.commandPreview}])) });
} else if (command === '--download') {
  const location = await downloadModel();
  if (!location) throw new Error('Model download returned no path');
  print({ downloaded:true, location });
} else if (callText !== null) {
  if (callText.length > 25000) throw new Error('Input JSON exceeds size limit');
  if (promptParts.length || command) throw new Error('--call-json cannot be combined with an inference request');
  let call;
  try { call = JSON.parse(callText); } catch { throw new Error('Invalid --call-json JSON'); }
  const valid = validateCall(call, catalog);
  const result = execute
    ? await executeAllowed(valid, { catalog, execute, allowWrite })
    : planCall(valid, catalog);
  print({ source:'explicit JSON call (no model inference)', result });
  if (result.ok === false) process.exitCode = 1;
} else {
  if (command) throw new Error('Unknown CLI command');
  const prompt = promptParts.join(' ').trim();
  if (!prompt) { console.error('Supply a natural-language request or --help'); process.exitCode = 2; }
  else {
    const selected = await routeNeedle(prompt, { catalog, scope });
    const results = [];
    if (execute) {
      for (const call of selected.function_calls) {
        try {
          const result = await executeAllowed(call, { catalog, execute, allowWrite });
          results.push(result);
          if (result.ok === false) process.exitCode = 1;
        } catch (error) {
          results.push({name:call.name,ok:false,error:error.message});
          process.exitCode = 1;
        }
      }
    }
    print({ ...selected, executed: execute && results.some(x => x.executed),
      results });
  }
}
