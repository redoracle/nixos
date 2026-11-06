// Piped into the Pi+Needle image's Node.js runtime by CI, on AMD64 and ARM64.
// It performs every catalog entry without relying on stochastic model selection.
import assert from 'node:assert/strict';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { execFile as callbackExecFile } from 'node:child_process';
import { promisify } from 'node:util';
import { executeAllowed, planCall, validateCall } from '/opt/pi-needle/needle-policy.mjs';

const execFile = promisify(callbackExecFile);
const catalog = JSON.parse(await readFile('/opt/pi-needle/needle-tools.json','utf8'));
const workspace = '/workspace';
const fixture = workspace+'/catalog-test.txt';
const createTarget = workspace+'/catalog-created.txt';
const storeFixture = '/tmp/needle-catalog-store-input.txt';

assert.equal(process.getuid(),10001, 'The Pi image must stay non-root');
assert.equal(Object.keys(catalog.tools).length,60);

await writeFile(fixture,'Needle inspection fixture\n',{flag:'wx',mode:0o600});
await writeFile(storeFixture,'Nix store example\n',{flag:'wx',mode:0o600});
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
      if (!result.ok) {
        // The image starts without a user-installed Nix profile; the command
        // must still be attempted and return a truthful failure.
        if (name === 'nix_profile_list') {
          console.log(`ENVIRONMENT-DEPENDENT ${name}: ${result.stderr.slice(0,140)}`);
        } else {
          throw new Error(`${name} failed (exit ${result.exitCode}): ${result.stderr.slice(0,220)}`);
        }
      }
      readOnly++;
    }
    console.log(`CATALOG PASS ${name} [${entry.mode}]`);
    tested++;
  }
  assert.equal(tested,60);
  assert.ok(readOnly >= 30 && manual >= 15 && writes === 1);
  console.log(JSON.stringify({tested,readOnly,manual,writes,storePath,architecture:process.arch}));
} finally {
  await Promise.allSettled([unlink(fixture),unlink(createTarget),unlink(storeFixture)]);
}
