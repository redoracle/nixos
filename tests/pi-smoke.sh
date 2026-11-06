#!/bin/sh
set -eu
[ "$(id -u)" -eq 10001 ]
[ -w /workspace ]
nix --version
pi --version
node /opt/pi-needle/needle-cli.mjs --health | node -e '
let json = "";
process.stdin.on("data", c => json += c);
process.stdin.on("end", () => {
  const health = JSON.parse(json);
  if (health.executedByDefault !== false || health.count !== 60 ||
      health.byScope.nix !== 27 || health.byScope.apk !== 17) process.exit(1);
});
'
# The Pi extension is loaded from the default-user Pi configuration, and must
# register one proposal-only custom tool without invoking a remote model.
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import extension from '/opt/pi-needle/needle-pi-extension.js';
const settings = JSON.parse(await readFile('/home/nixuser/.pi/agent/settings.json','utf8'));
assert.ok(settings.extensions.includes('/opt/pi-needle/needle-pi-extension.js'));
const registered = [];
extension({ registerTool: entry => registered.push(entry) });
assert.equal(registered.length, 1);
assert.equal(registered[0].name, 'needle_route');
assert.equal(typeof registered[0].execute, 'function');
console.log('Pi extension registered its Needle proposal-only tool');
NODE
# The explicit-JSON route exercises one actually executed, validated diagnostic.
node /opt/pi-needle/needle-cli.mjs --call-json '{"name":"nix_version","arguments":{}}' --execute |
  node -e '
let raw = "";
process.stdin.on("data", c => raw += c);
process.stdin.on("end", () => {
  const item = JSON.parse(raw);
  if (item.result.executed !== true || item.result.ok !== true ||
      !item.result.stdout.includes("nix")) process.exit(1);
});
'
# Exercise actual offline WASM inference with the Nix-specific catalog profile.
timeout 180 node /opt/pi-needle/needle-cli.mjs --scope nix "What version of Nix is installed?" > /tmp/needle-inference.json
node -e '
const fs = require("node:fs");
const item = JSON.parse(fs.readFileSync("/tmp/needle-inference.json", "utf8"));
if (item.executed !== false || item.scope !== "nix" ||
    !Array.isArray(item.function_calls)) process.exit(1);
console.log("Needle model returned offline proposals without execution");
'
rm -f /tmp/needle-inference.json
