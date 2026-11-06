import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, symlink, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateCall, planCall, checkedWorkspacePath, executeAllowed } from '../ai/needle-policy.mjs';

const catalog = JSON.parse(await readFile(new URL('../ai/needle-tools.json', import.meta.url), 'utf8'));
const definitions = Object.entries(catalog.tools);
const categories = new Set(['system','apk','nix','workspace','workflow']);
const modes = new Set(['readonly','manual','write']);

test('60 documented tool entries have strict input schemas, reviewed metadata and samples', () => {
  assert.equal(definitions.length, 60);
  for (const [name, entry] of definitions) {
    assert.match(name, /^[a-z][a-z0-9_]*$/);
    assert.ok(categories.has(entry.category), name);
    assert.ok(modes.has(entry.mode), name);
    assert.ok(entry.description.length > 16, name);
    assert.equal(entry.inputSchema.type, 'object', name);
    assert.equal(entry.inputSchema.additionalProperties, false, name);
    assert.ok(Array.isArray(entry.inputSchema.required), name);
    assert.ok(Array.isArray(entry.commandPreview) && entry.commandPreview.length > 0, name);
    assert.doesNotThrow(() => validateCall({
      name, arguments: Object.fromEntries(Object.entries(entry.exampleArguments).map(
        ([key,value]) => [key, value === '${STORE_PATH}' ? `/nix/store/${'a'.repeat(32)}-catalog-fixture` : value]
      )),
    }, catalog), name);
    const plan = planCall({ name, arguments: Object.fromEntries(Object.entries(entry.exampleArguments).map(
      ([key,value]) => [key, value === '${STORE_PATH}' ? `/nix/store/${'a'.repeat(32)}-catalog-fixture` : value]
    )) }, catalog);
    assert.equal(plan.executed, false, name);
    assert.equal(plan.mode, entry.mode, name);
  }
});

test('untrusted function names, missing args, malicious package names and schema bypasses fail closed', () => {
  for (const input of [
    { name:'bash',arguments:{command:'rm -rf /'} },
    { name:'__proto__',arguments:{} },
    { name:'apk_info',arguments:{} },
    { name:'apk_info',arguments:{package:'--root=/'} },
    { name:'apk_info',arguments:{package:'nix;id'} },
    { name:'nix_version',arguments:{command:'whoami'} },
    { name:'nix_store_hash',arguments:{store_path:'/etc/shadow'} },
    { name:'workspace_read',arguments:{file:123} },
  ]) {
    assert.throws(() => validateCall(input,catalog), undefined, JSON.stringify(input));
  }
});

test('all manual-only catalog commands stay non-executable even with write permission', async () => {
  for (const [name, entry] of definitions.filter(([,e]) => e.mode === 'manual')) {
    const result = await executeAllowed({ name, arguments: entry.exampleArguments }, {
      catalog, execute:true, allowWrite:true,
    });
    assert.equal(result.executed, false, name);
    assert.equal(result.mode, 'manual', name);
    assert.ok(result.argv.length >= 2, name);
  }
});

test('read-only commands are not run when explicit execute is omitted', async () => {
  for (const [name, entry] of definitions.filter(([,e]) => e.mode === 'readonly')) {
    const result = await executeAllowed({ name, arguments: entry.exampleArguments }, {
      catalog,
    });
    assert.equal(result.executed, false, name);
  }
});

test('workspace traversal, external symlinks and sensitive filenames are denied', async () => {
  const root = await mkdtemp(join(tmpdir(), 'needle-root-'));
  const external = await mkdtemp(join(tmpdir(), 'needle-outside-'));
  try {
    await mkdir(join(root,'safe'));
    await writeFile(join(root,'safe','hello.txt'),'hello');
    await writeFile(join(root,'.env'), 'password=hidden');
    await symlink(external,join(root,'escape'));
    assert.equal(await checkedWorkspacePath(root,'safe/hello.txt', {file:true}),
      join(root,'safe','hello.txt'));
    await assert.rejects(checkedWorkspacePath(root,'../outside'), /escapes/);
    await assert.rejects(checkedWorkspacePath(root,'/etc/passwd'), /relative/);
    await assert.rejects(checkedWorkspacePath(root,'escape', {file:true}), /escapes/);
    await assert.rejects(checkedWorkspacePath(root,'escape/missing', {create:true}), /escapes/);
    await assert.rejects(checkedWorkspacePath(root,'.env',{file:true}), /Sensitive/);
    await assert.rejects(checkedWorkspacePath(root,'safe/secret-key',{create:true}), /Sensitive/);
  } finally {
    await rm(root,{recursive:true,force:true});await rm(external,{recursive:true,force:true});
  }
});

test('workspace write needs an opt-in and cannot clobber an existing file', async () => {
  const root = await mkdtemp(join(tmpdir(),'needle-write-'));
  const input = {name:'workspace_create',arguments:{path:'new.txt',content:'hello'}};
  try {
    await assert.rejects(executeAllowed(input,{catalog,workspace:root,execute:true}),/allow-write/);
    const result = await executeAllowed(input,{catalog,workspace:root,execute:true,allowWrite:true});
    assert.equal(result.ok,true);assert.equal(result.executed,true);
    assert.equal(await readFile(join(root,'new.txt'),'utf8'),'hello');
    await assert.rejects(executeAllowed(input,{catalog,workspace:root,execute:true,allowWrite:true}),/EEXIST/);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('natural-language scenario examples refer to declared tool names and groups', async () => {
  const scenarios = JSON.parse(await readFile(new URL('../ai/needle-scenarios.json', import.meta.url),'utf8'));
  assert.equal(scenarios.examples.length, 35);
  for (const entry of scenarios.examples) {
    assert.ok(entry.prompt.length >= 12, entry.id);
    assert.ok(Object.hasOwn(catalog.tools, entry.expectedTool), entry.id);
    assert.equal(entry.scope, catalog.tools[entry.expectedTool].category, entry.id);
  }
});
