import { Needle, tool } from 'cactus-needle';
import { planCall } from './needle-policy.mjs';
import { normalizePredictions } from './needle-predictions.mjs';

import { SCOPES, selectTools } from './needle-selection.mjs';
export { SCOPES };

export function toolDefinitions(catalog, names) {
  const result = {};
  for (const name of names) {
    const entry = catalog.tools[name];
    if (!entry) throw new Error('Selected tool is absent from the catalog');
    result[name] = tool({ description: entry.description, inputSchema: entry.inputSchema });
  }
  if (!Object.keys(result).length) throw new Error('No selected catalog tools');
  return result;
}

export async function routeNeedle(prompt, { catalog, scope = 'auto' } = {}) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 1024) {
    throw new Error('Natural-language request must be 1–1024 characters');
  }
  if (!catalog) throw new Error('Catalog is required');
  const selection = selectTools(catalog, scope, prompt, 6);
  const needle = new Needle({
    stateless: true,
    tools: toolDefinitions(catalog, selection.names),
    system: 'Only propose supplied Nix/Alpine tools. Never execute commands. Plans marked *_plan are manual only.',
  });
  try {
    const output = await needle.generate({ prompt, maxOutputTokens: 512 });
    const calls = normalizePredictions(output, catalog, new Set(selection.names));
    return {
      prompt, scope: selection.scope, selectedTools: selection.names, executed: false,
      function_calls: calls, plans: calls.map(call => planCall(call, catalog)),
      note: 'Needle proposes structured calls only; no commands were executed.',
    };
  } finally {
    await needle.close();
  }
}
