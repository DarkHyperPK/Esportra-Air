"use strict";
const dns = require("node:dns").promises;
const net = require("node:net");
const WebSocket = require("ws");
const privateAddress = (address) =>
  /^10\.|^192\.168\.|^127\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(
    address,
  );
async function testObserver({ host, port, key }) {
  if (
    typeof host !== "string" ||
    !/^[a-zA-Z0-9.-]{1,253}$/.test(host) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    typeof key !== "string" ||
    !/^[a-f0-9]{64}$/i.test(key)
  )
    throw new Error(
      "Enter a local observer address, port and its 64-character connection key.",
    );
  const addresses = net.isIP(host)
    ? [{ address: host }]
    : await dns.lookup(host, { all: true, family: 4 });
  if (
    !addresses.length ||
    addresses.some((item) => !privateAddress(item.address))
  )
    throw new Error("Use an observer PC on your private local network.");
  return new Promise((resolve) => {
    const socket = new WebSocket(`ws://${addresses[0].address}:${port}`, {
      headers: { "x-esportra-relay-key": key },
      handshakeTimeout: 2500,
    });
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.terminate();
      resolve(result);
    };
    const timer = setTimeout(
      () =>
        finish({
          ok: false,
          error:
            "Observer did not respond. Check its address, connection key and firewall.",
        }),
      3000,
    );
    socket.once("open", () => finish({ ok: true }));
    socket.once("error", () =>
      finish({
        ok: false,
        error:
          "Could not authenticate with the observer. Check its address, port and connection key.",
      }),
    );
  });
}
module.exports = { testObserver, privateAddress };
