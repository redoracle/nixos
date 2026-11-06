import { writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
  console.error('Expected a semantic release version (for example, 3.0.0).');
  process.exit(1);
}

writeFileSync('.release-version', version + '\n', { flag: 'wx' });
console.log('Prepared release version: ' + version);
