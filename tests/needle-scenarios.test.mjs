import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { inferScope, selectTools } from '../ai/needle-selection.mjs';

const catalog = JSON.parse(
  await readFile(new URL('../ai/needle-tools.json', import.meta.url), 'utf8'),
);
const { examples } = JSON.parse(
  await readFile(new URL('../ai/needle-scenarios.json', import.meta.url), 'utf8'),
);

test('documented scenario suite has unique IDs, valid scopes and real catalog targets', () => {
  assert.equal(examples.length, 35);
  assert.equal(new Set(examples.map((item) => item.id)).size, examples.length);
  for (const item of examples) {
    assert.match(item.id, /^[a-z0-9-]+$/);
    assert.ok(item.prompt.length > 10);
    assert.ok(Object.hasOwn(catalog.groups, item.scope), item.id);
    assert.ok(Object.hasOwn(catalog.tools, item.expectedTool), item.id);
    assert.equal(catalog.tools[item.expectedTool].category, item.scope, item.id);
  }
});

for (const scenario of examples) {
  test('scoped shortlist contains correct action: ' + scenario.id, () => {
    const result = selectTools(catalog, scenario.scope, scenario.prompt);
    assert.equal(result.scope, scenario.scope);
    assert.ok(result.names.includes(scenario.expectedTool),
      'Expected ' + scenario.expectedTool + '; offered: ' + result.names.join(', '));
    assert.ok(result.names.length <= 6);
    assert.equal(new Set(result.names).size, result.names.length);
    for (const name of result.names) {
      assert.equal(catalog.tools[name].category, scenario.scope);
    }
  });

  test('automatic scope includes correct action: ' + scenario.id, () => {
    const result = selectTools(catalog, 'auto', scenario.prompt);
    assert.equal(inferScope(scenario.prompt), scenario.scope,
      'Unexpected scope for ' + scenario.id + ': ' + result.scope);
    assert.equal(result.scope, scenario.scope);
    assert.ok(result.names.includes(scenario.expectedTool),
      'Expected ' + scenario.expectedTool + '; offered: ' + result.names.join(', '));
    assert.ok(result.names.length <= 6);
  });
}

test('explicit scope overrides automatic heuristics without cross-scope leakage', () => {
  const result = selectTools(catalog, 'nix', 'Audit installed Alpine packages');
  assert.equal(result.scope, 'nix');
  assert.ok(result.names.every((name) => catalog.tools[name].category === 'nix'));
});

test('invalid shortlist arguments fail closed rather than offering the full catalog', () => {
  assert.throws(() => selectTools(catalog, '__proto__', 'nix version'), /Unsupported catalog scope/);
  assert.throws(() => selectTools(catalog, 'system', 'id', 0), /Invalid selection limit/);
  assert.throws(() => selectTools(catalog, 'system', 'id', 9), /Invalid selection limit/);
  assert.throws(() => selectTools(catalog, 'system', 'id', 1.5), /Invalid selection limit/);
});

test('shortlist selection is stable under repeated requests', () => {
  const prompt = 'How should I upgrade Alpine packages safely?';
  const first = selectTools(catalog, 'auto', prompt);
  for (let i = 0; i < 20; i++) {
    assert.deepEqual(selectTools(catalog, 'auto', prompt), first);
  }
});
