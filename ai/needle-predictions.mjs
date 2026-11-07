import { validateCall } from './needle-policy.mjs';

// Strictly bind predictions to the catalog definitions actually offered in the
// current inference request, not every tool in the global catalog.
export function normalizePredictions(output, catalog, offeredNames) {
  if (!(offeredNames instanceof Set) || offeredNames.size === 0) {
    throw new TypeError('A nonempty offered-tool set is required');
  }
  const predictions = output?.toolCalls ?? output?.function_calls ?? [];
  if (!Array.isArray(predictions)) throw new TypeError('Needle returned invalid function calls');
  if (predictions.length > 8) throw new Error('Needle output exceeded the per-turn tool-call limit');

  return predictions.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new TypeError('Malformed Needle tool call');
    const call = validateCall({
      name: raw.toolName ?? raw.name ?? raw.function?.name,
      arguments: raw.input ?? raw.arguments ?? raw.function?.arguments ?? {},
    }, catalog);
    if (!offeredNames.has(call.name)) {
      throw new Error(`Tool not offered for this request: ${call.name}`);
    }
    return call;
  });
}
