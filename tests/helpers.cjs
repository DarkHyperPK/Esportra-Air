const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const quiet = { info() {}, warn() {}, error() {}, log() {} };
function load(name, overrides = {}) {
  const filename = path.join(__dirname, '..', 'src', name);
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  const wrapper = vm.runInNewContext(
    `(function(require,module,exports,__filename,__dirname){${fs.readFileSync(filename, 'utf8')}\n})`,
    { console: quiet, Buffer, URL, setTimeout, clearTimeout, setInterval, clearInterval, process },
    { filename },
  );
  wrapper(key => Object.hasOwn(overrides, key) ? overrides[key] : localRequire(key), module, module.exports, filename, path.dirname(filename));
  return module.exports;
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
module.exports = { load, deferred, quiet };
