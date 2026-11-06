// Piped into the Pi+Needle image's Node.js runtime by CI, on AMD64 and ARM64.
// It performs every catalog entry without relying on stochastic model selection.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile as callbackExecFile } from 'node:child_process';
import { promisify } from 'node:util';
import { executeAllowed, planCall, validateCall } from '/opt/pi-needle/needle-policy.mjs';

const execFile = promisify(callbackExecFile);
const catalog = JSON.parse(await readFile('/opt/pi-needle/needle-tools.json','utf8'));
// Use disposable directories so retries and concurrent jobs cannot collide.
const workspace = await mkdtemp('/workspace/needle-catalog-');
const storeInput = await mkdtemp(join(tmpdir(), 'needle-catalog-source-'));
const fixture = join(workspace, 'catalog-test.txt');
const createTarget = join(workspace, 'catalog-created.txt');
const storeFixture = join(storeInput, 'needle-catalog-store-input.txt');
const fixtureText = 'Needle inspection fixture\n';

assert.equal(process.getuid(), 10001, 'Pi image must be unprivileged');
assert.equal(Object.keys(catalog.tools).length, 60);
await writeFile(fixture, fixtureText, { flag: 'wx', mode: 0o600 });
await writeFile(storeFixture, 'Nix store example\n', { flag: 'wx', mode: 0o600 });
let storePath = '';
try {
  const { stdout } = await execFile('nix-store',['--add',storeFixture],{timeout:30000});
  storePath = stdout.trim();
  assert.match(storePath,/^\/nix\/store\/[a-z0-9]{32}-/);
  let tested = 0, readOnly = 0, manual = 0, writes = 0;
  for (const [name, entry] of Object.entries(catalog.tools)) {
    const args = structuredClone(entry.exampleArguments);
    for (const [key, value] of Object.entries(args)) {
      if (value === '${STORE_PATH}') args[key] = storePath;
    }
    const call = validateCall({name,arguments:args},catalog);
    assert.equal(planCall(call,catalog).executed,false,name);
    let result;
    if (entry.mode === 'manual') {
      result = await executeAllowed(call,{catalog,workspace,execute:true,allowWrite:true});
      assert.equal(result.executed,false,name);
      assert.equal(result.mode,'manual',name);
      manual++;
    } else if (entry.mode === 'write') {
      await assert.rejects(executeAllowed(call,{catalog,workspace,execute:true}),/allow-write/);
      args.path = 'catalog-created.txt';
      result = await executeAllowed({name,arguments:args},{catalog,workspace,execute:true,allowWrite:true});
      assert.equal(result.ok,true,name);
      assert.equal(await readFile(createTarget,'utf8'),args.content,name);
      writes++;
    } else {
      result = await executeAllowed(call,{catalog,workspace,execute:true});
      assert.equal(result.executed,true,name);
      assert.equal(result.ok, true,
        `${name} failed (exit ${result.exitCode}): ${String(result.stderr).slice(0, 220)}`);
      assert.equal(result.mode, 'readonly', name);
      if (name === 'system_identity') assert.match(result.stdout, /uid=10001/);
      if (name === 'nix_version') assert.match(result.stdout, /^nix [(]Nix[)] [0-9]+[.][0-9]+/);
      if (name === 'nix_eval_selftest') assert.equal(result.stdout.trim(), '2');
      if (name === 'apk_installed') assert.match(result.stdout, /nix/);
      if (name === 'workspace_read') assert.equal(result.text, fixtureText);
      if (name === 'workspace_list') {
        assert.ok(result.entries.some((e) => e.name === 'catalog-test.txt'));
      }
      if (name === 'workspace_hash') {
        assert.equal(result.sha256, createHash('sha256').update(fixtureText).digest('hex'));
      }
      if (name === 'workflow_nix_health') {
        assert.deepEqual(result.stages.map((stage) => stage.name),
          ['nix_eval_selftest', 'nix_store_verify']);
        assert.ok(result.stages.every((stage) => stage.result.ok));
        assert.equal(result.stages[0].result.stdout.trim(), '2');
      }
      readOnly++;
    }
    console.log(`CATALOG PASS ${name} [${entry.mode}]`);
    tested++;
  }
  assert.equal(tested,60);
  assert.deepEqual({ readOnly, manual, writes }, { readOnly: 41, manual: 18, writes: 1 });
  console.log(JSON.stringify({tested,readOnly,manual,writes,storePath,architecture:process.arch}));
} finally {
  await Promise.all([
    rm(workspace, { recursive: true, force: true }),
    rm(storeInput, { recursive: true, force: true }),
  ]);
}
