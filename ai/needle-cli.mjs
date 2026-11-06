#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Needle, tool, downloadModel } from 'cactus-needle';
import { validateCall, executeAllowed } from './needle-policy.mjs';

const base = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(await readFile(resolve(base, 'needle-tools.json'), 'utf8'));
const args = process.argv.slice(2);

function usage() {
  console.log(`Usage: needle-cli [--execute] [--allow-write] "natural language request"
       needle-cli --download       Download upstream Needle 3 weights to the cache
       needle-cli --health         Print runtime configuration without executing a model
       needle-cli --help           Show this help

By default only JSON proposed calls are printed, with NO commands executed.
--execute executes allowlisted operations in /workspace; writes also require
--allow-write. Arbitrary bash/shell execution is intentionally unsupported.
Pi is a separate coding agent: use "pi" with an explicit model provider.`);
}

if (args.includes('--help') || args.includes('-h')) {
  usage();
} else if (args.includes('--health')) {
  console.log(JSON.stringify({
    piCli: 'pi',
    needleRuntime: 'cactus-needle WebAssembly',
    toolNames: Object.keys(catalog.tools),
    executingByDefault: false,
  }, null, 2));
} else if (args.includes('--download')) {
  const path = await downloadModel();
  if (!path) throw new Error('Needle model download returned no path');
  console.log(`Needle 3 weights cached: ${path}`);
} else {
  const execute = args.includes('--execute');
  const allowWrite = args.includes('--allow-write');
  if (allowWrite && !execute) throw new Error('--allow-write requires --execute');
  const prompt = args.filter((arg) => !arg.startsWith('--')).join(' ').trim();
  if (!prompt) {
    usage();
    process.exitCode = 2;
  } else {
    const definitions = Object.fromEntries(
      Object.entries(catalog.tools).map(([name, def]) => [
        name,
        tool({ description: def.description, inputSchema: def.inputSchema }),
      ]),
    );
    const needle = new Needle({ tools: definitions });
    try {
      const output = await needle.complete(prompt);
      const calls = output.function_calls ?? [];
      if (!Array.isArray(calls)) throw new Error('Needle returned a malformed call list');
      const response = { prompt, executed: execute, function_calls: [], results: [] };
      for (const raw of calls) {
        const call = validateCall(raw, catalog);
        response.function_calls.push(call);
        if (execute) {
          try {
            response.results.push({ name: call.name, result: await executeAllowed(call, { allowWrite }) });
          } catch (error) {
            response.results.push({ name: call.name, error: error.message });
            process.exitCode = 1;
          }
        }
      }
      console.log(JSON.stringify(response, null, 2));
    } finally {
      await needle.close();
    }
  }
}
