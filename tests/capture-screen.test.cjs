const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { buildSync } = require('esbuild');
const moduleOutput = buildSync({ entryPoints: [path.join(__dirname, '../src/renderer/components/CaptureScreen.jsx')], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'] });
const exported = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${moduleOutput.outputFiles[0].text}\n})`)(require, exported, exported.exports);
const CaptureScreen = exported.exports.default;
function render(status) { return renderToStaticMarkup(React.createElement(CaptureScreen, { status })); }
test('real GET_STATUS fields show active capture and connected LAN consumers', () => {
  const html = render({ gepActive: true, lanRelay: { listening: true, port: 5301, consumerCount: 2, gepMessagesPerSec: 7 }, hubConnected: true });
  assert.ok(html.includes('Capture active'));
  assert.ok(html.includes('7 msg/s'));
  assert.ok(html.includes('2 production connections'));
  assert.ok(html.includes('Connected'));
  assert.ok(!html.includes('GEP not detected'));
});
test('listening relay with zero consumers is waiting, not disconnected or buffering', () => {
  const html = render({ gepActive: false, lanRelay: { listening: true, port: 5301, consumerCount: 0 }, hubConnected: false });
  assert.ok(html.includes('Waiting for production'));
  assert.ok(!html.includes('buffering locally'));
  assert.ok(!html.includes('Latency'));
});
test('observer exposes marker hotkeys while player capture hides them', () => {
  const html = render({ gepActive: true, captureRole: 'observer', lanRelay: { listening: true, port: 5301, consumerCount: 1 } });
  assert.ok(html.includes('Mark replay')); assert.ok(html.includes('F10'));
  assert.ok(!render({ captureRole: 'player' }).includes('Mark replay'));
  for (const text of ['Pause sending', 'Resume sending', 'Change production PC']) assert.ok(!html.includes(text));
});
