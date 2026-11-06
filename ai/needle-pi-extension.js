// Auto-loaded through ~/.pi/agent/settings.json in the opt-in image.
// Pi and Needle serve distinct purposes: Pi's reasoning model may request a
// local Needle tool-routing proposal; proposals NEVER execute commands here.
import { Type } from 'typebox';
import { readFile } from 'node:fs/promises';
import { routeNeedle } from './needle-engine.mjs';

const catalog = JSON.parse(await readFile(new URL('./needle-tools.json', import.meta.url), 'utf8'));
export default function registerNeedle(pi) {
  // Also expose a no-model-required health command. The real Pi RPC startup
  // test asserts this command is discoverable, proving extension loading.
  pi.registerCommand('needle-health', {
    description: 'Show the offline Needle tool catalog health without an LLM',
    handler: async (_args, ctx) => {
      const total = Object.keys(catalog.tools).length;
      ctx.ui.notify('Needle available: ' + total + ' catalog actions, proposal-only Pi tool', 'info');
    },
  });
  pi.registerTool({
    name: 'needle_route',
    label: 'Needle Nix/Alpine plan',
    description: 'Use offline Needle 3 to propose validated, catalogued Nix, Alpine apk, and workspace actions. Does not execute any command; always review proposed actions. Pi still needs its own reasoning model.',
    parameters: Type.Object({
      request: Type.String({ minLength: 1, maxLength: 1024 }),
      scope: Type.Optional(Type.Union([
        Type.Literal('auto'), Type.Literal('system'), Type.Literal('apk'),
        Type.Literal('nix'), Type.Literal('workspace'), Type.Literal('workflow'),
      ])),
    }),
    async execute(_id, params) {
      const response = await routeNeedle(params.request, {
        catalog, scope: params.scope ?? 'auto',
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
        details: { scope: response.scope, calls: response.function_calls.length, executed: false },
      };
    },
  });
}
