// Isolated native Electron smoke. All platform/OBS responses and credentials
// are synthetic fixtures; no real account, game capture or user data is touched.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { WebSocketServer } = require("ws");
const { encode, decode } = require("@msgpack/msgpack");
const {
  chromium,
} = require("../../frag-and-book-main/node_modules/playwright");
const root = path.resolve(__dirname, "..");
const artifacts = path.join(root, "docs/audits/product-smoke");
const showId = "5e182c34-49f8-40d3-bf6c-88b576c20c45";

async function main() {
  fs.mkdirSync(artifacts, { recursive: true });
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "air-native-product-"),
  );
  let app;
  let nativeProcess;
  let screenshotCount = 0;
  const backend = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/broadcast/nodes/pair")
      return res.end(
        JSON.stringify({ nodeId: showId, token: "fixture-node-token" }),
      );
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const obs = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise((resolve) => obs.once("listening", resolve));
  let program = "ESA_Holding",
    preview = "ESA_Casters";
  const scenes = new Set(["ESA_Holding"]),
    calls = [];
  obs.on("connection", (ws) => {
    const send = (op, d) =>
      ws.send(
        ws.protocol === "obswebsocket.msgpack"
          ? encode({ op, d })
          : JSON.stringify({ op, d }),
      );
    send(0, { obsWebSocketVersion: "5.0.0", rpcVersion: 1 });
    ws.on("message", (raw) => {
      const packet =
        ws.protocol === "obswebsocket.msgpack" ? decode(raw) : JSON.parse(raw);
      if (packet.op === 1) return send(2, { negotiatedRpcVersion: 1 });
      if (packet.op !== 6) return;
      const { requestType, requestId } = packet.d;
      const requestData = packet.d.requestData || {};
      calls.push(requestType);
      let responseData = {};
      if (requestType === "GetStudioModeEnabled")
        responseData = { studioModeEnabled: true };
      if (requestType === "GetCurrentProgramScene")
        responseData = { currentProgramSceneName: program };
      if (requestType === "GetCurrentPreviewScene")
        responseData = { currentPreviewSceneName: preview };
      if (requestType === "GetSceneList")
        responseData = {
          scenes: [...scenes].map((sceneName) => ({ sceneName })),
        };
      if (requestType === "GetSourceScreenshot")
        responseData = {
          imageData:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jwYQAAAAASUVORK5CYII=",
        };
      if (requestType === "CreateScene") scenes.add(requestData.sceneName);
      if (requestType === "SetCurrentPreviewScene") {
        preview = requestData.sceneName;
        send(5, {
          eventType: "CurrentPreviewSceneChanged",
          eventIntent: 4,
          eventData: { sceneName: preview },
        });
      }
      send(7, {
        requestType,
        requestId,
        requestStatus: { result: true, code: 100 },
        responseData,
      });
      if (
        requestType === "TriggerStudioModeTransition" ||
        requestType === "SetCurrentProgramScene"
      ) {
        program = requestData.sceneName || preview;
        send(5, {
          eventType: "CurrentProgramSceneChanged",
          eventIntent: 4,
          eventData: { sceneName: program },
        });
      }
    });
  });
  const config = {
    mode: "production",
    modeConfigured: false,
    showConfig: {
      showId,
      title: "Air QA Show",
      matches: [
        {
          matchId: showId,
          matchCode: "GF1",
          bestOf: 3,
          teams: [
            { name: "Team A", tag: "A" },
            { name: "Team B", tag: "B" },
          ],
        },
      ],
      rundown: [{ id: showId, title: "Opening", type: "pre_show" }],
      casters: [],
      sponsors: [],
    },
  };
  fs.writeFileSync(
    path.join(temporary, "node-config.json"),
    JSON.stringify(config),
  );
  const entry = path.join(temporary, "entry.js");
  fs.writeFileSync(
    entry,
    `const {app}=require('electron'); try { app.setPath('userData',${JSON.stringify(temporary)}); require(${JSON.stringify(require.resolve("keytar"))}); const Module=require('module'); const original=Module._load; const credentials=new Map(); Module._load=function(request,...args){ if(request==='keytar') return { getPassword:async(_,name)=>credentials.get(name)||null,setPassword:async(_,name,value)=>credentials.set(name,value),deletePassword:async(_,name)=>credentials.delete(name) }; return original.call(this,request,...args); }; require(${JSON.stringify(path.join(root, "src/main.js"))}); } catch(error) { console.error('Native fixture failed: '+error.message); app.exit(1); }`,
  );
  try {
    const electronEnv = {
      ...process.env,
      ESPORTRA_API_URL: `http://127.0.0.1:${backend.address().port}`,
      ESPORTRA_AIR_SMOKE_TEST: "1",
    };
    delete electronEnv.ELECTRON_RUN_AS_NODE;
    nativeProcess = spawn(
      require("electron"),
      ["--remote-debugging-port=0", entry],
      { env: electronEnv, windowsHide: true },
    );
    const endpoint = await new Promise((resolve, reject) => {
      let diagnostic = "";
      const timer = setTimeout(
        () =>
          reject(
            new Error(
              "Native remote debugging did not start. " +
                diagnostic.slice(-1800),
            ),
          ),
        30000,
      );
      const read = (chunk) => {
        const line = chunk.toString();
        diagnostic += line;
        const match = line.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
        if (line.includes("Native fixture failed:")) {
          clearTimeout(timer);
          reject(new Error(line.trim()));
        }
      };
      nativeProcess.stderr.on("data", read);
      nativeProcess.stdout.on("data", read);
      nativeProcess.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Native fixture exited (${code}).`));
      });
    });
    const browser = await chromium.connectOverCDP(endpoint);
    app = {
      firstWindow: async () =>
        browser.contexts()[0].pages()[0] ||
        (await browser.contexts()[0].waitForEvent("page")),
      close: async () => {
        for (const current of browser.contexts()[0].pages())
          await current.evaluate(() => window.close()).catch(() => undefined);
        await browser.close();
      },
    };
    const page = await app.firstWindow(),
      errors = [];
    const capture = async (name) => {
      try {
        await page.screenshot({
          path: path.join(artifacts, name),
          timeout: 3000,
        });
        screenshotCount++;
      } catch {
        /* Hidden native surfaces may not support compositor screenshots. */
      }
    };
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByRole("button", { name: "Use production mode" }).click();
    const pairInput = page.locator("input").first();
    await pairInput.fill("ABCD1234");
    await page.getByRole("button", { name: /^Pair/ }).click();
    await page
      .getByRole("heading", { name: "Prepare this production desk." })
      .waitFor();
    assert.equal(
      await page
        .evaluate(() => window.esportraBroadcast.air.getStatus())
        .then((status) => status.show.matchCode),
      "GF1",
    );
    await capture("desktop-readiness.png");
    await page.getByRole("button", { name: "Prepare browser sources" }).click();
    await page
      .getByRole("button", { name: "+ Add output", exact: true })
      .click();
    await page.getByLabel("Name", { exact: true }).fill("Main HUD");
    await page.getByLabel("Overlay", { exact: true }).selectOption("ingame");
    await page.getByLabel("Match code", { exact: true }).fill("GF1");
    await page
      .getByRole("button", { name: "Save output", exact: true })
      .click();
    await page.getByText("Main HUD", { exact: false }).waitFor();
    const outputs = await page
      .evaluate(() => window.esportraBroadcast.air.getStatus())
      .then((status) => status.outputs);
    assert.equal(outputs[0].matchCode, "GF1");
    assert.ok(outputs[0].url.includes("/overlays/ingame.html?match=GF1"));
    await capture("desktop-outputs.png");
    await page.getByRole("button", { name: "Producer", exact: true }).click();
    await page.getByLabel("Host", { exact: true }).fill("127.0.0.1");
    await page
      .getByLabel("Port", { exact: true })
      .fill(String(obs.address().port));
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await page
      .getByRole("button", { name: "Prepare ESA scenes", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Prepare ESA scenes", exact: true })
      .click();
    await page.getByText(/Scene setup complete/).waitFor();
    assert.equal(scenes.size, 5);
    assert.ok(calls.includes("CreateInput"));
    await page.getByRole("button", { name: "Readiness", exact: true }).click();
    await page
      .getByRole("button", { name: "Start rundown", exact: true })
      .click();
    await page.waitForFunction(
      async () =>
        (await window.esportraBroadcast.air.getStatus()).runner.activeSegment
          ?.state === "armed",
    );
    await page
      .getByRole("button", { name: "Open producer", exact: true })
      .click();
    await page.getByText("ARMED", { exact: true }).waitFor();
    await page.keyboard.press("F8");
    await page.waitForFunction(
      async () =>
        (await window.esportraBroadcast.air.getStatus()).runner.activeSegment
          ?.state === "on_air",
    );
    assert.equal(program, "ESA_Casters");
    await page.getByRole("img", { name: "PGM frame" }).waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector('img[alt="PGM frame"]')?.naturalWidth > 0 &&
        document.querySelector('img[alt="PVW frame"]')?.naturalWidth > 0,
    );
    const blocked = await page.evaluate(() =>
      window.esportraBroadcast.air.setMode("capture-only"),
    );
    assert.equal(blocked.ok, false);
    assert.equal(
      await page.getByLabel("Port", { exact: true }).inputValue(),
      String(obs.address().port),
    );
    await capture("desktop-producer.png");
    const stopped = await page.evaluate(() =>
      window.esportraBroadcast.runner.stop(),
    );
    assert.equal(stopped.ok, true);
    const loaded = await page.evaluate(() =>
      window.esportraBroadcast.air.applyPendingShow(),
    );
    assert.equal(loaded.ok, true);
    const pending = await page
      .evaluate(() => window.esportraBroadcast.air.getStatus())
      .then((status) => status.pendingRecords);
    assert.ok(pending > 0);
    await page.getByRole("button", { name: "Readiness", exact: true }).click();
    await page.getByRole("button", { name: "Start capture", exact: true }).click();
    await page.getByRole("dialog", { name: "Before starting capture" }).waitFor();
    await page.getByText(/Raw game events stay on your LAN/).waitFor();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await page.evaluate(() => window.esportraBroadcast.air.getStatus()).then(status => status.gepActive), false);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        nativeElectron: "passed",
        nativeKeytarLoad: "passed",
        checks: [
          "mode",
          "pairing",
          "cached show",
          "output creation",
          "OBS protocol connection",
          "scene builder",
          "runner manual take",
          "active mode guard",
          "stop/reload",
          "durable events",
          "capture consent/cancel",
        ],
        screenshots: screenshotCount,
        liveServices: false,
      }),
    );
  } catch (error) {
    if (app) {
      const current = await app.firstWindow();
      const alerts = await current
        .locator('[role="alert"]')
        .allTextContents()
        .catch(() => []);
      console.error(JSON.stringify({ alerts }));
      await current
        .screenshot({
          path: path.join(artifacts, "desktop-failure.png"),
          timeout: 3000,
        })
        .catch(() => undefined);
    }
    throw error;
  } finally {
    await app?.close();
    nativeProcess?.kill();
    for (const ws of obs.clients) ws.terminate();
    await new Promise((resolve) => obs.close(resolve));
    backend.closeAllConnections();
    await new Promise((resolve) => backend.close(resolve));
    assert.equal(path.dirname(temporary), os.tmpdir());
    assert.ok(path.basename(temporary).startsWith("air-native-product-"));
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        fs.rmSync(temporary, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (attempt === 9)
          console.warn(
            "Native fixture data remains in its isolated temporary folder.",
          );
      }
    }
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
