const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const files = fs.readdirSync(__dirname).filter(name => name.endsWith('.test.cjs')).sort();
const result = spawnSync(process.execPath, ['--test', '--test-reporter=dot', ...files.map(name => path.join(__dirname, name))], { stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
