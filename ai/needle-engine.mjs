import { Needle, tool } from 'cactus-needle';
import { validateCall, planCall } from './needle-policy.mjs';

export const SCOPES = Object.freeze(['auto','system','apk','nix','workspace','workflow','all']);
export function inferScope(prompt) {
  const input = String(prompt).toLowerCase();
  if (/\b(apk|alpine|apk-tools|packages? installed|package database|repositories)\b/.test(input)) return 'apk';
  if (/\b(nix|flake|derivation|store|profile|nixpkgs|gc roots)\b/.test(input)) return 'nix';
  if (/\b(file|directory|folder|workspace|sha256|create|read text)\b/.test(input)) return 'workspace';
  if (/\b(workflow|health audit|upgrade plan|dependency audit|preflight)\b/.test(input)) return 'workflow';
  return 'system';
}

export function toolDefinitions(catalog, scope) {
  if (!SCOPES.includes(scope)) throw new Error(`Unsupported catalog scope: ${scope}`);
  const result = {};
  for (const [name, entry] of Object.entries(catalog.tools)) {
    if (scope !== 'all' && entry.category !== scope) continue;
    result[name] = tool({ description: entry.description,
      inputSchema: entry.inputSchema });
  }
  if (!Object.keys(result).length) throw new Error(`No tools available for scope ${scope}`);
  return result;
}

export function normalizePredictions(output, catalog) {
  const predictions = output.toolCalls ?? output.function_calls ?? [];
  if (!Array.isArray(predictions)) throw new Error('Needle returned invalid function calls');
  if (predictions.length > 8) throw new Error('Needle output exceeded the per-turn tool-call limit');
  return predictions.map((raw) => {
    const call = validateCall({
      name: raw.toolName ?? raw.name ?? raw.function?.name,
      arguments: raw.input ?? raw.arguments ?? raw.function?.arguments ?? {},
    }, catalog);
    return call;
  });
}

export async function routeNeedle(prompt, { catalog, scope = 'auto' } = {}) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 1024) {
    throw new Error('Natural-language request must be 1–1024 characters');
  }
  if (!catalog) throw new Error('Catalog is required');
  const selectedScope = scope === 'auto' ? inferScope(prompt) : scope;
  const needle = new Needle({
    stateless: true,
    tools: toolDefinitions(catalog, selectedScope),
    system: 'Select only catalogued tools for Nix/Alpine tasks. Never invent command names. Tools marked *_plan are advice only; never execute them.',
  });
  try {
    const output = await needle.generate({ prompt, maxOutputTokens: 320 });
    const calls = normalizePredictions(output, catalog);
    return {
      prompt, scope: selectedScope, executed: false,
      function_calls: calls, plans: calls.map(call => planCall(call, catalog)),
      note: 'Needle proposes structured calls only; no commands were executed.',
    };
  } finally {
    await needle.close();
  }
}
