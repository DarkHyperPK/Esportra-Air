'use strict';
const { WebSocket } = require('ws');
function discoverOBS(port = 4455) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return Promise.resolve({ found: false });
  return new Promise(resolve => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, 'obswebsocket.json', { handshakeTimeout: 1500, maxPayload: 16384 });
    let done = false;
    const finish = result => { if (done) return; done = true; clearTimeout(timer); socket.terminate(); resolve(result); };
    const timer = setTimeout(() => finish({ found: false }), 1500);
    socket.once('message', data => {
      try {
        const hello = JSON.parse(String(data));
        if (hello.op !== 0 || !Number.isInteger(hello.d?.rpcVersion)) return finish({ found: false });
        finish({ found: true, host: '127.0.0.1', port, version: typeof hello.d.obsStudioVersion === 'string' ? hello.d.obsStudioVersion : null, passwordRequired: !!hello.d.authentication });
      } catch (_) { finish({ found: false }); }
    });
    socket.once('error', () => finish({ found: false }));
    socket.once('close', () => finish({ found: false }));
  });
}
function allowedOBSHost(host) {
  if (['localhost', '127.0.0.1'].includes(host)) return { valid: true, remote: false };
  if (require('net').isIP(host) !== 4) return { valid: false };
  const parts = host.split('.').map(Number);
  const privateAddress = parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
  return { valid: privateAddress, remote: true };
}
module.exports = { discoverOBS, allowedOBSHost };
