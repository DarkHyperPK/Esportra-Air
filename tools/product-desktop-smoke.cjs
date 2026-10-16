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
async function waitForIpc(page, predicate, timeoutMs = 5000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await page.evaluate(predicate)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('IPC state did not reach the expected value in five seconds.');
}


async function main() {
  fs.mkdirSync(artifacts, { recursive: true });
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "air-native-product-"),
  );
  const hudProbe = http.createServer();
  await new Promise(resolve => hudProbe.listen(0, "127.0.0.1", resolve));
  const hudPort = hudProbe.address().port;
  await new Promise(resolve => hudProbe.close(resolve));
  let app;
  let nativeProcess;
  let screenshotCount = 0;
  let nodeRevoked = false;
  let airAccessRevoked = false;
  let contextRenamed = false;
  let contextCompleted = false;
  const proposals = [];
  let acknowledgeQueues = false;
  const airUser='00000000-0000-4000-8000-000000000071',airWorkspace='00000000-0000-4000-8000-000000000072',airProjects=new Map();
  const backend = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if(req.url==='/api/auth/desktop-login')return res.end(JSON.stringify({access_token:'fixture-account-access',refresh_token:'fixture-refresh',expires_in:3600}));
    if(req.url==='/api/air/session')return res.end(JSON.stringify({userId:airUser,account:{status:'active',trialStartedAt:new Date().toISOString(),trialEndsAt:new Date(Date.now()+14*86400000).toISOString(),validUntil:new Date(Date.now()+14*86400000).toISOString(),planId:airWorkspace},workspaces:[{id:airWorkspace,name:'Independent workspace'}]}));
    if(req.url==='/api/air/devices')return res.end(JSON.stringify({deviceId:airUser}));
    if(req.url==='/api/air/access'){res.statusCode=airAccessRevoked?403:200;return res.end(JSON.stringify(airAccessRevoked?{error:'Device access revoked'}:{allowed:true,offlineLease:null}));}
    if(req.url.startsWith('/api/air/devices/')&&req.url.endsWith('/heartbeat'))return res.end('{}');
    if(req.url===`/api/air/workspaces/${airWorkspace}/projects`){if(req.method==='GET')return res.end(JSON.stringify([...airProjects.values()].map(({document,...rest})=>rest)));let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{const input=JSON.parse(body);const row={...input,workspaceId:airWorkspace,revision:1,updatedAt:new Date().toISOString()};airProjects.set(row.id,row);res.end(JSON.stringify(row));});return;}
    if(req.url.startsWith('/api/air/projects/')){const id=req.url.split('/')[4];if(req.url.endsWith('/events')){let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>res.end(JSON.stringify({accepted:JSON.parse(body).events.map(event=>event.id)})));return;}if(req.method==='GET')return res.end(JSON.stringify(airProjects.get(id)));let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{const row={...airProjects.get(id),...JSON.parse(body),revision:(airProjects.get(id)?.revision||0)+1};airProjects.set(id,row);res.end(JSON.stringify(row));});return;}
    if (req.url === '/api/broadcast/nodes/session') {
      res.statusCode = nodeRevoked ? 401 : 200;
      return res.end(JSON.stringify(nodeRevoked ? { error: 'node_not_active' } : { nodeId: showId, active: true }));
    }
    if (req.url === `/api/broadcast/nodes/shows/${showId}/matches/${showId}/context`) {
      res.statusCode = nodeRevoked ? 401 : 200;
      const match = { ...config.showConfig.matches[0], status: 'scheduled', scheduledAt: '2026-10-20T14:00:00Z', teams: [{ name: contextRenamed ? 'Platform Team A' : 'Team A', tag: 'A', teamId: showId, seriesScore: 1, roster: [{ name: 'Sample registered starter', role: 'starter' }] }, { name: 'Team B', tag: 'B', teamId: '00000000-0000-4000-8000-000000000062', seriesScore: 0, roster: [] }] };
      if (contextCompleted) { res.statusCode = 409; match.status = 'completed'; match.teams[0].seriesScore = 2; return res.end(JSON.stringify({ showId, selectedMatchId: showId, eligible: false, match, matches: [] })); }
      return res.end(JSON.stringify({ showId, match, matches: [match, { ...match, matchId: '00000000-0000-4000-8000-000000000063', matchCode: 'GF2' }], appearance: { bannerTheme: 'compact', sponsorRotation: false, sponsorSeconds: 12, matches: {} }, sponsors: config.showConfig.sponsors }));
    }
    if (req.method === 'POST' && req.url.endsWith('/result-proposals')) {
      let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => { proposals.push(JSON.parse(body)); res.end(JSON.stringify({ proposalId: showId, status: 'pending' })); }); return;
    }
    if (acknowledgeQueues && req.method === 'POST' && ['/corrections', '/events/drain', '/sponsor-impressions'].some(suffix => req.url.endsWith(suffix))) {
      let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => { const value = JSON.parse(body); res.end(JSON.stringify({ inserted: value.corrections?.length, accepted: value.events?.length ?? value.impressions?.length, rejected: 0, acknowledged: value.impressions?.length })); }); return;
    }
    if (req.url === "/api/broadcast/nodes/pair")
      return res.end(
        JSON.stringify({ nodeId: showId, token: "fixture-node-token" }),
      );
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const platformHub = new WebSocketServer({ noServer: true });
  backend.on('upgrade', (req, socket, head) => {
    if (!req.url.startsWith('/hubs/broadcast')) return socket.destroy();
    platformHub.handleUpgrade(req, socket, head, ws => platformHub.emit('connection', ws));
  });
  platformHub.on('connection', socket => {
    socket.on('message', raw => {
      for (const text of raw.toString().split('\x1e').filter(Boolean)) {
        const message = JSON.parse(text);
        if (message.protocol) socket.send('{}\x1e');
        else if (message.type === 1 && message.invocationId) socket.send(JSON.stringify({type:3,invocationId:message.invocationId})+'\x1e');
      }
    });
  });
  const obs = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise((resolve) => obs.once("listening", resolve));
  let program = "ESA_Holding",
    preview = "ESA_Casters";
  const scenes = new Set(["ESA_Holding"]),
    calls = [];
  const transitionChoices = [];
  let replayActive = false;
  let replayUnavailable = false;
  let collection = 'Synthetic fixture collection';
  const collections = [collection], slotItems = new Map();
  const browserInputs = new Map();
  const obsTransitions = [{ transitionName: 'Cut', transitionKind: 'cut_transition' }, { transitionName: 'Fade', transitionKind: 'fade_transition' }, { transitionName: 'Fixture Stinger', transitionKind: 'obs_stinger_transition' }];
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
      if (requestType === 'SetCurrentSceneTransition') transitionChoices.push(requestData.transitionName);
      let responseData = {};
      if (requestType === 'GetVersion') responseData = { obsVersion: '32.0.0', obsWebSocketVersion: '5.6.0' };
      if (requestType === 'GetSceneCollectionList') responseData = { currentSceneCollectionName: collection, sceneCollections: [...collections] };
      if (requestType === 'CreateSceneCollection') { collection = requestData.sceneCollectionName; collections.push(collection); }
      if (requestType === 'SetCurrentSceneCollection') collection = requestData.sceneCollectionName;
      if (['GetStreamStatus', 'GetRecordStatus'].includes(requestType)) responseData = { outputActive: false };
      if (requestType === 'GetSceneItemList') responseData = { sceneItems: slotItems.get(requestData.sceneName) || [] };
      if (requestType === 'CreateSceneItem') { const item = { sourceName: requestData.sourceName, sceneItemId: calls.length }; slotItems.set(requestData.sceneName, [...slotItems.get(requestData.sceneName) || [], item]); responseData = item; }
      if (requestType === 'GetSceneTransitionList') responseData = { transitions: obsTransitions };
      if (requestType === 'GetReplayBufferStatus') responseData = { outputActive: replayActive };
      if (requestType === 'GetInputList') responseData = { inputs: [{ inputName: 'Fixture camera', inputKind: 'dshow_input' }, ...[...browserInputs].map(([inputName]) => ({ inputName, inputKind: 'browser_source' }))] };
      if (requestType === 'CreateInput') { browserInputs.set(requestData.inputName, requestData.inputSettings); const item = { sourceName: requestData.inputName, sceneItemId: calls.length }; slotItems.set(requestData.sceneName, [...slotItems.get(requestData.sceneName) || [], item]); responseData = item; }
      if (requestType === 'GetInputSettings') responseData = { inputSettings: browserInputs.get(requestData.inputName) || {} };
      if (requestType === 'SetInputSettings') browserInputs.set(requestData.inputName, { ...browserInputs.get(requestData.inputName), ...requestData.inputSettings });
      if (requestType === 'RemoveSceneItem') slotItems.set(requestData.sceneName, (slotItems.get(requestData.sceneName) || []).filter(item => item.sceneItemId !== requestData.sceneItemId));
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
        requestStatus: requestType === 'GetReplayBufferStatus' && replayUnavailable ? {result:false,code:604,comment:"Replay buffer not configured"} : { result: true, code: 100 },
        responseData,
      });
      if (requestType === 'SaveReplayBuffer') send(5, { eventType: 'ReplayBufferSaved', eventIntent: 64, eventData: { savedReplayPath: 'C:/synthetic-fixture/replay.mp4' } });
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
      rundownVersion: 1,
      title: "Air QA Show",
      matches: [
        {
          matchId: showId,
          matchCode: "GF1",
          bestOf: 3,
          teams: [
            { name: "Team A", tag: "A", teamId: showId },
            { name: "Team B", tag: "B", teamId: '00000000-0000-4000-8000-000000000062' },
          ],
        },
      ],
      rundown: [{ id: showId, title: "Opening", type: "pre_show" }],
      casters: [],
      sponsors: [{ sponsorId: '00000000-0000-4000-8000-000000000062', name: 'Sample sponsor', logoUrl: '' }],
    },
  };
  fs.writeFileSync(
    path.join(temporary, "node-config.json"),
    JSON.stringify(config),
  );
  // The fixture keeps CSP narrow to its own temporary HUD origin.
  // Production index/CSP and the operator's running HUD are untouched.
  const rendererIndex = path.join(root, 'src/renderer/index.html');
  const fixtureIndex = path.join(root, 'src/renderer', '.native-smoke-'+path.basename(temporary)+'.html');
  fs.writeFileSync(fixtureIndex, fs.readFileSync(rendererIndex,'utf8').replaceAll('localhost:5300', 'localhost:'+hudPort));
  const entry = path.join(temporary, "entry.js");
  fs.writeFileSync(
    entry,
    `const {app,BrowserWindow}=require('electron'); const loadFile=BrowserWindow.prototype.loadFile;BrowserWindow.prototype.loadFile=function(file,...args){return loadFile.call(this,file===${JSON.stringify(rendererIndex)}?${JSON.stringify(fixtureIndex)}:file,...args);}; try { app.setPath('userData',${JSON.stringify(temporary)}); require(${JSON.stringify(require.resolve("keytar"))}); const Module=require('module'); const original=Module._load; const credentials=new Map(); Module._load=function(request,...args){ if(request==='keytar') return { getPassword:async(_,name)=>credentials.get(name)||null,setPassword:async(_,name,value)=>credentials.set(name,value),deletePassword:async(_,name)=>credentials.delete(name) }; const loaded=original.call(this,request,...args); if(request.includes('esportra-valorant-hud/server/server')) return {...loaded,start:options=>{require('fs').writeFileSync(${JSON.stringify(path.join(temporary, 'hud-session.fixture'))},options.key);return loaded.start(options);}}; return loaded; }; require(${JSON.stringify(path.join(root, "src/main.js"))}); } catch(error) { console.error('Native fixture failed: '+error.message); app.exit(1); }`,
  );
  try {
    const electronEnv = {
      ...process.env,
      ESPORTRA_API_URL: `http://127.0.0.1:${backend.address().port}`,
      ESPORTRA_AIR_SMOKE_TEST: "1",
      ESPORTRA_AIR_SMOKE_HUD_PORT: String(hudPort),
    };
    delete electronEnv.ELECTRON_RUN_AS_NODE;
    nativeProcess = spawn(
      require("electron"),
      ["--remote-debugging-port=0", "--user-data-dir="+temporary, entry],
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
    await page.getByRole("button", { name: "Use capture-only mode" }).click();
    await page.getByRole('button', { name: 'Restart Air', exact: true }).waitFor();
    const pendingRole = await page.evaluate(() => window.esportraBroadcast.air.getStatus());
    assert.equal(pendingRole.mode, 'production');
    assert.equal(pendingRole.configuredMode, 'capture-only');
    assert.equal(pendingRole.restartRequired, true);
    assert.equal(pendingRole.gepActive, false);
    await page.getByRole('button', { name: 'Change selection', exact: true }).click();
    await page.getByRole("button", { name: "Use production mode" }).click();
    await page.getByRole('button', { name: 'PC role', exact: true }).click();
    await page.getByRole('heading', { name: 'How will you use this PC?' }).waitFor();
    await page.getByRole('button', { name: 'Back to workspace', exact: true }).click();
    const currentRole = await page.evaluate(() => window.esportraBroadcast.air.getStatus());
    assert.equal(currentRole.configuredMode, 'production');
    assert.equal(currentRole.restartRequired, false);
    assert.equal(currentRole.gepActive, false);
    const pairInput = page.locator("input").first();
    await pairInput.fill("ABCD1234");
    await page.getByRole("button", { name: /^Pair/ }).click();
    await page.getByRole("heading", { name: "Your broadcast starts here.", exact: true }).waitFor();
    await capture("desktop-broadcast-setup.png");
    await page.getByRole("button", { name: "Matches", exact: true }).click();
    await page
      .getByRole("heading", { name: "Matches", exact: true })
      .waitFor();
    assert.equal(
      await page
        .evaluate(() => window.esportraBroadcast.air.getStatus())
        .then((status) => status.show.matchCode),
      "GF1",
    );
    await capture("desktop-readiness.png");
    await page.getByRole("button", { name: "Settings & help", exact: true }).click();
    await page.getByRole("button", { name: "Advanced browser sources", exact: true }).click();
    await page
      .getByRole("button", { name: "+ Add output", exact: true })
      .click();
    await page.getByLabel("Name", { exact: true }).fill("Main HUD");
    await page.getByLabel("Overlay", { exact: true }).selectOption("ingame");
    assert.equal(await page.getByLabel('Follow selected match', { exact: true }).isChecked(), true);
    await page
      .getByRole("button", { name: "Save output", exact: true })
      .click();
    await page.getByText("Main HUD", { exact: false }).waitFor();
    const outputs = await page
      .evaluate(() => window.esportraBroadcast.air.getStatus())
      .then((status) => status.outputs);
    assert.equal(outputs[0].followMatch, true);
    assert.ok(outputs[0].url.includes('/o/' + outputs[0].id));
    await capture("desktop-outputs.png");
    await page.getByRole("button", { name: "OBS controls", exact: true }).click();
    await page.getByLabel("Host", { exact: true }).fill("127.0.0.1");
    await page
      .getByLabel("Port", { exact: true })
      .fill(String(obs.address().port));
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await page.getByText("OBS connected · Connection settings", {exact:true}).click();
    const legacyScenes = await page.evaluate(hudPort => window.esportraBroadcast.obs.buildScenes(Object.fromEntries(Object.entries({
      holding: 'holding', gameplay: 'ingame', fullscreen: 'scoreboard', replay: 'replay', casters: 'casters',
    }).map(([key, overlay]) => [key, `http://localhost:${hudPort}/overlays/${overlay}.html?match=GF1`]))), hudPort);
    assert.equal(legacyScenes.ok, true);
    assert.equal(scenes.size, 5);
    assert.ok(calls.includes("CreateInput"));
    const inspected = await page.evaluate(() => window.esportraBroadcast.obs.getStatus());
    assert.equal(inspected.version, '32.0.0'); assert.equal(inspected.collection, 'Synthetic fixture collection');
    await page.getByText('Broadcast collection & source slots', { exact: true }).click();
    await page.getByRole('button', { name: 'Create broadcast collection', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Create collection', exact: true }).click();
    await page.getByText('Broadcast collection and source slots ready.', { exact: true }).waitFor();
    await page.getByLabel('Input for Talent camera 1', { exact: true }).selectOption('Fixture camera');
    await page.getByLabel('Input for Talent camera 1', { exact: true }).locator('..').getByRole('button', { name: 'Add to slot', exact: true }).click();
    await page.getByText('Connected: Fixture camera', { exact: true }).waitFor();
    assert.ok(JSON.parse(fs.readFileSync(path.join(temporary, 'node-config.json'), 'utf8')).ownedObsCollection.startsWith('Esportra ·'));
    await page.getByText('Broadcast collection & source slots', { exact: true }).click();
    assert.equal((await page.evaluate(() => window.esportraBroadcast.obs.connect('127.0.0.1', 0, ''))).ok, false);
    assert.equal((await page.evaluate(() => window.esportraBroadcast.obs.connect('192.168.1.20', 4455, '', false))).ok, false);
    await page.getByText('Scene mappings', { exact: true }).click();
    await page.getByRole('button', { name: 'Refresh scenes from OBS', exact: true }).click();
    await page.getByLabel('Transition for Opening', { exact: true }).selectOption('Fade');
    await page.getByRole('button', { name: 'Save mappings', exact: true }).click();
    await page.getByText(/Scene mappings saved on this workstation/).waitFor();
    assert.equal(JSON.parse(fs.readFileSync(path.join(temporary, 'node-config.json'), 'utf8')).sceneMappings[showId].transition.mode, 'fade');
    const invalidMapping = await page.evaluate(id => window.esportraBroadcast.obs.setSetup([{ id, scene: 'Missing scene' }]), showId);
    assert.equal(invalidMapping.ok, false);
    await page.getByRole('button', { name: 'Cut', exact: true }).click();
    await waitForIpc(page, async () => (await window.esportraBroadcast.obs.getStatus()).tally.program === 'ESA_Casters');
    assert.ok(calls.includes('SetCurrentSceneTransition'));
    const beforeSyncProgram = program;
    contextRenamed = true;
    await waitForIpc(page, async () => (await window.esportraBroadcast.air.getStatus()).show.matches[0].label.includes('Platform Team A'), 8000);
    const syncedHud = (await (await fetch(`http://127.0.0.1:${hudPort}/api/GF1`)).json()).state;
    assert.equal(syncedHud.layout.bannerTheme, 'compact'); assert.equal(syncedHud.layout.sponsorRotation, false); assert.equal(syncedHud.teams[0].series, 1); assert.equal(program, beforeSyncProgram);
    const correctionContext = (await page.evaluate(() => window.esportraBroadcast.air.getStatus())).correctionContext;
    const staleMapFix = await page.evaluate(context => window.esportraBroadcast.fixData({ context: { ...context, matchId: '00000000-0000-4000-8000-000000000069' }, matchCode: context.matchCode, mapIndex: 1, teamAScore: 13, teamBScore: 9, reason: 'Synthetic stale form' }), correctionContext);
    assert.equal(staleMapFix.ok, false);
    const mapFix = await page.evaluate(context => window.esportraBroadcast.fixData({ context, matchCode: context.matchCode, mapIndex: 1, teamAScore: 13, teamBScore: 9, reason: 'Synthetic map correction' }), correctionContext);
    assert.equal(mapFix.ok, true); assert.equal(mapFix.queued, true);
    assert.deepEqual((await (await fetch(`http://127.0.0.1:${hudPort}/api/GF1`)).json()).state.series[0].score, [13, 9]);
    acknowledgeQueues = true;
    const proposed = await page.evaluate(context => window.esportraBroadcast.fixData({ context, scope: 'air_and_bracket', matchCode: context.matchCode, mapIndex: 1, teamAScore: 13, teamBScore: 9, reason: 'Synthetic official proposal' }), correctionContext);
    assert.equal(proposed.ok, true); assert.equal(proposed.queued, true);
    const proposalDeadline = Date.now() + 8000;
    while (!proposals.length && Date.now() < proposalDeadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(proposals.length, 1); assert.equal(proposals[0].matchId, showId); assert.equal(proposals[0].nodeId, showId);
    assert.equal(proposals[0].team1Id, showId); assert.equal(proposals[0].bestOf, 3);
    acknowledgeQueues = false; // Later actions exercise durable storage during a platform delivery outage.
    const originalMap = (await page.evaluate(() => window.esportraBroadcast.displayFixes.get())).context;
    await page.evaluate(context => window.esportraBroadcast.displayFixes.change({ context, input: { action: 'undo' } }), originalMap);
    await page.evaluate(context => window.esportraBroadcast.displayFixes.change({ context, input: { action: 'undo' } }), originalMap);
    assert.notDeepEqual((await (await fetch(`http://127.0.0.1:${hudPort}/api/GF1`)).json()).state.series[0].score, [13, 9]);
    assert.equal(proposals.length, 1); // Local Undo cannot silently retract a delivered official proposal.
    assert.equal((await page.evaluate(() => window.esportraBroadcast.air.getStatus())).show.matches.length, 2);
    await page.evaluate(hudPort => { const frame = document.createElement('iframe'); frame.dataset.rosterProbe = 'true'; frame.src = `http://localhost:${hudPort}/overlays/team-roster-a.html?match=GF1`; document.body.appendChild(frame); }, hudPort);
    const rosterFrame = page.frameLocator('iframe[data-roster-probe]');
    await rosterFrame.getByText('Sample registered starter', { exact: true }).waitFor();
    assert.ok((await rosterFrame.locator('body').textContent()).includes('REGISTERED LINEUP · WAITING FOR GAME DATA'));
    await page.evaluate(() => document.querySelector('iframe[data-roster-probe]').remove());
    assert.equal((await page.evaluate(() => window.esportraBroadcast.obs.triggerReplay())).ok, false);
    replayActive = true;
    assert.equal((await page.evaluate(() => window.esportraBroadcast.obs.triggerReplay())).ok, true);
    await waitForIpc(page, async () => (await window.esportraBroadcast.obs.getStatus()).tally.program === 'ESA_Replay');
    for (const socket of obs.clients) {
      const packet = { op: 5, d: { eventType: 'MediaInputPlaybackEnded', eventIntent: 256, eventData: { inputName: 'ESA_Replay_clip' } } };
      socket.send(socket.protocol === 'obswebsocket.msgpack' ? encode(packet) : JSON.stringify(packet));
    }
    await waitForIpc(page, async () => (await window.esportraBroadcast.obs.getStatus()).tally.program === 'ESA_Casters');
    assert.equal((await page.evaluate(() => window.esportraBroadcast.runner.timeout(true))).ok, true);
    await page.evaluate(() => window.esportraBroadcast.runner.techPause());
    await page.evaluate(() => window.esportraBroadcast.runner.timeout(false));
    assert.equal((await page.evaluate(() => window.esportraBroadcast.air.getStatus())).runner.techPaused, true);
    await page.evaluate(() => window.esportraBroadcast.runner.resume());
    assert.equal((await page.evaluate(() => window.esportraBroadcast.pauseRules.set({ enabled: true, delayMs: 1000, scene: 'ESA_Holding' }))).ok, true);
    await page.evaluate(() => window.esportraBroadcast.runner.techPause());
    await waitForIpc(page, async () => (await window.esportraBroadcast.air.getStatus()).pauseRule.panelVisible);
    await waitForIpc(page, async () => (await window.esportraBroadcast.obs.getStatus()).tally.program === 'ESA_Holding');
    const pauseState = await (await fetch(`http://127.0.0.1:${hudPort}/api/GF1`)).json();
    assert.equal(pauseState.state.airPause.kind, 'technical');
    await page.evaluate(hudPort => { const frame = document.createElement('iframe'); frame.id = 'native-pause-probe'; frame.src = `http://localhost:${hudPort}/overlays/ingame.html?match=GF1`; frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;transform:scale(.25);transform-origin:top left;z-index:99999'; document.body.appendChild(frame); }, hudPort);
    await page.frameLocator('#native-pause-probe').getByText('TECHNICAL PAUSE', { exact: true }).waitFor();
    await page.evaluate(() => window.esportraBroadcast.runner.resume());
    await waitForIpc(page, async () => !(await window.esportraBroadcast.air.getStatus()).pauseRule.panelVisible);
    await page.frameLocator('#native-pause-probe').getByText('TECHNICAL PAUSE', { exact: true }).waitFor({ state: 'hidden' });
    assert.equal(program, 'ESA_Holding');
    await page.evaluate(() => document.getElementById('native-pause-probe').remove());
    await page.getByRole("button", { name: "Connections", exact: true }).click();
    await page.getByRole("button", { name: "Review broadcast setup", exact: true }).click();
    await page
      .getByRole("button", { name: "Start broadcast", exact: true })
      .click();
    await waitForIpc(page, async () =>
        (await window.esportraBroadcast.air.getStatus()).runner.activeSegment
          ?.state === "armed");
    await page
      .getByRole("button", { name: "OBS controls", exact: true })
      .click();
    await page.getByText("ARMED", { exact: true }).waitFor();
    const published = { ...config.showConfig, rundownVersion: 2, rundown: [
      { id: showId, title: 'Opening revised', type: 'pre_show' },
      { id: '00000000-0000-4000-8000-000000000063', title: 'Break', type: 'break', plan: { trigger: 'map_end', mode: 'automatic', holdMode: 'window', holdSeconds: 1, graphics: [], transition: { mode: 'stinger', name: 'Fixture Stinger' } } },
    ] };
    for (const socket of platformHub.clients) socket.send(JSON.stringify({ type: 1, target: 'ShowConfig', arguments: [published] }) + '\x1e');
    await waitForIpc(page, async () => (await window.esportraBroadcast.air.getStatus()).rundownPublication.pendingVersion === 2);
    assert.equal((await page.evaluate(() => window.esportraBroadcast.air.getStatus())).runner.activeSegment.name, 'Opening');
    const defaults = await page.evaluate(() => window.esportraBroadcast.shortcuts.get());
    assert.equal(defaults.bindings.take, 'F8');
    const conflict = await page.evaluate(bindings => window.esportraBroadcast.shortcuts.set({...bindings, take:'F1'}), defaults.bindings);
    assert.equal(conflict.ok, false);
    await page.getByRole('button',{name:'Keyboard shortcuts',exact:true}).click();
    await page.getByRole('button',{name:'Change Show next screen on air shortcut',exact:true}).click();
    await page.keyboard.press('Control+Shift+T');
    await page.getByRole('button',{name:'Save shortcuts',exact:true}).click();
    await page.getByText('Shortcuts saved on this workstation.',{exact:true}).waitFor();
    assert.equal(JSON.parse(fs.readFileSync(path.join(temporary,'node-config.json'),'utf8')).shortcuts.take, 'Ctrl+Shift+T');
    await page.getByRole('button',{name:'Back to production',exact:true}).click();
    await page.getByRole('button',{name:'Ctrl+Shift+T: Show next screen on air',exact:true}).waitFor();
    await page.keyboard.press('F8');
    assert.equal((await page.evaluate(() => window.esportraBroadcast.air.getStatus())).runner.activeSegment.state, 'armed');
    await page.getByRole('button', { name: 'Pause automatic switch', exact: true }).click();
    await waitForIpc(page, async () => (await window.esportraBroadcast.air.getStatus()).runner.activeSegment.heldBy === 'operator');
    await page.getByText('Automatic switch paused · show this screen or skip it', { exact: true }).waitFor();
    await page.keyboard.press('Control+Shift+T');
    await waitForIpc(page, async () =>
        (await window.esportraBroadcast.air.getStatus()).runner.onAirSegment
          ?.state === "on_air");
    await waitForIpc(page, async () => (await window.esportraBroadcast.air.getStatus()).rundownPublication.version === 2);
    const revised = await page.evaluate(() => window.esportraBroadcast.air.getStatus());
    assert.equal(revised.runner.onAirSegment.name, 'Opening');
    assert.equal(revised.runner.activeSegment.name, 'Break');
    assert.equal(revised.rundownPublication.pendingVersion, null);
    for (const socket of platformHub.clients) socket.send(JSON.stringify({ type: 1, target: 'ShowConfig', arguments: [config.showConfig] }) + '\x1e');
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal((await page.evaluate(() => window.esportraBroadcast.air.getStatus())).rundownPublication.version, 2);
    assert.equal(program, "ESA_Casters");
    const hudSession = fs.readFileSync(path.join(temporary, 'hud-session.fixture'), 'utf8');
    const ingest = await fetch(`http://127.0.0.1:${hudPort}/api/GF1/ingest/valorant`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Esportra-Key': hudSession }, body: JSON.stringify({ events: [{ name: 'match_end', data: {} }] }) });
    assert.equal(ingest.status, 200);
    await waitForIpc(page, async () => (await window.esportraBroadcast.air.getStatus()).runner.activeSegment?.state === 'holding');
    await waitForIpc(page, async () => (await window.esportraBroadcast.air.getStatus()).runner.onAirSegment?.name === 'Break');
    assert.ok(transitionChoices.includes('Fixture Stinger'));
    assert.equal(program, 'ESA_Holding');
    await page.getByRole('button', { name: 'Ctrl+Shift+U: Show update', exact: true }).click();
    await page.getByLabel('Update text').fill('Sample broadcast update');
    await page.getByRole('form', { name: 'Show update', exact: true }).getByRole('button', { name: 'Show update', exact: true }).click();
    await page.getByRole('form',{name:'Show update',exact:true}).getByText('HUD updated.',{exact:true}).waitFor();
    assert.equal((await (await fetch(`http://127.0.0.1:${hudPort}/api/GF1`)).json()).state.toast.text, 'Sample broadcast update');
    await page.getByRole('button', { name: 'Close form', exact: true }).click();
    await page.getByRole('button', { name: 'Ctrl+Shift+L: Show poll', exact: true }).click();
    await page.getByLabel('Poll question').fill('Who wins?');
    await page.getByLabel('Option 1', { exact: true }).fill('North');
    await page.getByLabel('Option 2', { exact: true }).fill('South');
    await page.getByRole('form', { name: 'Show poll', exact: true }).getByRole('button', { name: 'Show poll', exact: true }).click();
    await page.getByRole('form',{name:'Show poll',exact:true}).getByText('HUD updated.',{exact:true}).waitFor();
    assert.equal((await (await fetch(`http://127.0.0.1:${hudPort}/api/GF1`)).json()).state.show.poll, true);
    await page.getByRole('button', { name: 'Hide poll', exact: true }).click();
    assert.equal((await (await fetch(`http://127.0.0.1:${hudPort}/api/GF1`)).json()).state.show.poll, false);
    await page.getByRole('button', { name: 'Close form', exact: true }).click();
    await page.getByRole('button', { name: 'Ctrl+Shift+B: Sponsor read', exact: true }).click();
    await page.getByRole('button', { name: 'Start sponsor read', exact: true }).click();
    await page.getByRole('button', { name: 'End sponsor read', exact: true }).click();
    assert.equal((await page.evaluate(() => window.esportraBroadcast.air.getStatus())).sponsorPlacements.length, 0);
    await capture('desktop-graphic-forms.png');
    await page.getByRole('button', { name: 'Close form', exact: true }).click();
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
    await page.getByRole('button',{name:'Open one-hour activity',exact:true}).click();
    await page.getByRole('heading',{name:'The last hour of production.',exact:true}).waitFor();
    await page.getByText('Manual take · Opening',{exact:true}).waitFor();
    await page.getByText('Automatic take · Break', { exact: true }).waitFor();
    const takes = (await page.evaluate(()=>window.esportraBroadcast.air.getHistory())).history.items.filter(entry=>entry.type==='SegmentTake');
    const rundownTakes = takes.filter(entry => ['Opening', 'Break'].includes(entry.data.segmentName));
    assert.equal(rundownTakes.length, 2);
    assert.equal(rundownTakes[1].actor, 'automation');
    await capture('desktop-production-timeline.png');
    await page.getByRole('button',{name:'Back to OBS controls',exact:true}).click();

    await page.evaluate(() => window.esportraBroadcast.runner.techPause());
    await page.keyboard.press('Control+Shift+D');
    await page.getByRole('heading', { name: 'Fix on-air match data.', exact: true }).waitFor();
    await page.getByRole('button', { name: 'On-air score', exact: true }).click();
    await page.getByLabel('Team 1 on-air score').fill('8');
    await page.getByLabel('Team 2 on-air score').fill('7');
    await page.getByLabel('On-air fix reason').fill('Synthetic source correction');
    await page.getByRole('button', { name: 'Apply on-air fix', exact: true }).click();
    await page.getByText('On-air data updated. Esportra’s tournament records and official results are unchanged.', { exact: true }).waitFor();
    assert.equal((await (await fetch(`http://127.0.0.1:${hudPort}/api/GF1`)).json()).state.teams[0].score, 8);
    const staleFix = await page.evaluate(async () => { const result = await window.esportraBroadcast.displayFixes.get(); return window.esportraBroadcast.displayFixes.change({ context: { ...result.context, matchId: '00000000-0000-4000-8000-000000000000' }, input: { action: 'clear' } }); });
    assert.equal(staleFix.ok, false);
    await page.getByRole('button', { name: 'Undo last fix', exact: true }).click();
    await waitForIpc(page, async () => (await window.esportraBroadcast.displayFixes.get()).status.active.length === 0);
    assert.equal((await (await fetch(`http://127.0.0.1:${hudPort}/api/GF1`)).json()).state.teams[0].score, 0);
    await page.getByRole('button', { name: 'Series wins', exact: true }).click();
    await page.getByLabel('Team 1 series wins').fill('2'); await page.getByLabel('Team 2 series wins').fill('1');
    await page.getByLabel('On-air fix reason').fill('Synthetic series presentation');
    await page.getByRole('button', { name: 'Apply on-air fix', exact: true }).click();
    await waitForIpc(page, async () => (await window.esportraBroadcast.displayFixes.get()).status.teams[0].series === 2);
    await page.getByRole('button', { name: 'Undo last fix', exact: true }).click();
    await waitForIpc(page, async () => (await window.esportraBroadcast.displayFixes.get()).status.active.length === 0);
    const rosterSource = (await (await fetch(`http://127.0.0.1:${hudPort}/api/GF1`)).json()).state.players;
    rosterSource[0][0].id = 'synthetic-player'; rosterSource[0][0].name = 'Sample Riot#123';
    const rosterWrite = await fetch(`http://127.0.0.1:${hudPort}/api/GF1`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Esportra-Key': hudSession }, body: JSON.stringify({ players: rosterSource }) });
    assert.equal(rosterWrite.status, 200);
    await waitForIpc(page, async () => (await window.esportraBroadcast.displayFixes.get()).status.players[0][0].name === 'Sample Riot#123');
    await page.getByRole('button', { name: 'Player display name', exact: true }).click();
    await page.getByLabel('Player to rename').selectOption('0:0');
    await page.getByLabel('Player broadcast display name').fill('Sample player');
    await page.getByLabel('On-air fix reason').fill('Synthetic player presentation');
    await page.getByRole('button', { name: 'Apply on-air fix', exact: true }).click();
    await waitForIpc(page, async () => (await window.esportraBroadcast.displayFixes.get()).status.players[0][0].name === 'Sample player');
    await page.getByRole('button', { name: 'Undo last fix', exact: true }).click();
    await waitForIpc(page, async () => (await window.esportraBroadcast.displayFixes.get()).status.players[0][0].name === 'Sample Riot#123');
    await capture('desktop-display-fixes.png');
    await page.getByRole('button',{name:'Back to OBS controls',exact:true}).click();
    await page.evaluate(() => window.esportraBroadcast.runner.resume());

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
    await page.getByRole("button", { name: "Connections", exact: true }).click();
    await page.getByRole("button", { name: "Review broadcast setup", exact: true }).click();
    await page.getByRole('heading', { name: 'Game capture on this PC', exact: true }).waitFor();
    await page.getByLabel('Capture from').selectOption('player');
    await page.getByRole("button", { name: "Start capture", exact: true }).click();
    await page.getByRole("dialog", { name: "Before starting capture" }).waitFor();
    await page.getByText(/Capture reads your Valorant identity/).waitFor();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await page.evaluate(() => window.esportraBroadcast.air.getStatus()).then(status => status.gepActive), false);
    await page.getByRole('button', { name: 'Settings & help', exact: true }).click();
    await page.getByRole('button', { name: 'Practice with sample data', exact: true }).click();
    await page.getByRole('button', { name: 'Load sample match', exact: true }).click();
    await page.frameLocator('iframe').getByText('REHEARSAL · SAMPLE DATA', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const paused = await page.evaluate(() => window.esportraBroadcast.simulation.getStatus());
    assert.equal(paused.status.playing, false);
    await page.evaluate(() => window.esportraBroadcast.simulation.control({ action: 'seek', value: 60000 }));
    assert.equal((await page.evaluate(() => window.esportraBroadcast.simulation.getStatus())).status.positionMs, 60000);
    // Inspect through the isolated HUD frame rather than granting renderer fetch access.
    await page.frames().find(frame => frame.url().includes('match=__ESA_SIM_')).waitForFunction(() => window.HUD?.state.round.phase === 'planted');
    const frameState = await page.frameLocator('iframe').locator('body').evaluate(() => window.HUD.state);
    assert.equal(frameState.round.phase, 'planted'); assert.equal(frameState.airContext.simulation, true);
    await page.waitForTimeout(500); // Let the existing HUD layer fade finish before capture.
    await capture('desktop-rehearsal.png');
    await page.getByLabel('Rehearsal OBS scene', { exact: true }).selectOption('ESA_Gameplay');
    await page.getByLabel('Allow OBS scene changes', { exact: true }).check();
    await page.evaluate(() => window.esportraBroadcast.simulation.control({ action: 'seek', value: 29000 }));
    await page.evaluate(() => window.esportraBroadcast.simulation.control({ action: 'speed', value: 10 }));
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await waitForIpc(page, async () => (await window.esportraBroadcast.simulation.getStatus()).status.rundown.onAirSegment?.name === 'Sample round 1');
    assert.equal(program, 'ESA_Gameplay', JSON.stringify((await page.evaluate(() => window.esportraBroadcast.simulation.getStatus())).status));
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.getByLabel('Allow OBS scene changes', { exact: true }).uncheck();
    replayUnavailable = true;
    const templateProgram = program;
    const inputsBeforeDraft = calls.filter(name => name === 'CreateInput').length;
    await page.getByRole('button', { name: 'Connections', exact: true }).click();
    await page.getByRole('button', { name: 'Review broadcast setup', exact: true }).click();
    await page.getByRole('button', { name: 'Broadcast screens', exact: true }).last().click();
    await page.getByRole('heading', { name: 'Broadcast screens' }).waitFor();
    await page.getByLabel('Screen name', { exact: true }).fill('Welcome to the final');
    await page.getByLabel('Screen design', { exact: true }).selectOption('match-intro');
    await page.getByLabel('Preview data source',{exact:true}).selectOption('received');
    const expectedPreview = (await (await fetch(`http://127.0.0.1:${hudPort}/api/GF1`)).json()).state;
    await page.frameLocator('iframe').locator('body').evaluate(async (_body, expected) => {
      await new Promise((resolve, reject) => { const start = Date.now(); const poll = () => { if (window.HUD?.connected && window.HUD?.state?.airContext?.matchId === expected) return resolve(); if (Date.now() - start > 5000) return reject(new Error('Selected match HUD did not load: '+JSON.stringify({expected,match:window.HUD?.match,connected:window.HUD?.connected,context:window.HUD?.state?.airContext,name:window.HUD?.state?.teams?.[0]?.name,url:location.href}))); setTimeout(poll, 50); }; poll(); });
    }, expectedPreview.airContext.matchId);
    assert.equal(await page.frameLocator('iframe').locator('body').evaluate(() => window.HUD.preview), false);
    await page.getByLabel('Game video or camera', { exact: true }).selectOption('Fixture camera');
    await page.getByText('HUD size and position', { exact: true }).click();
    for (const [label, value] of [['Horizontal position','20'],['Vertical position','30'],['Width','960'],['Height','540']]) await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page.getByText('Draft saved in Air. OBS has not been changed.', { exact: true }).waitFor();
    assert.equal(calls.filter(name => name === 'CreateInput').length, inputsBeforeDraft);
    assert.equal(program, templateProgram);
    const savedTemplate = await page.evaluate(() => window.esportraBroadcast.obs.getTemplate());
    assert.equal(savedTemplate.draft.items[0].title, 'Welcome to the final');
    const staleTemplate = await page.evaluate(draft => window.esportraBroadcast.obs.pushTemplate({ ...draft, context: { ...draft.context, matchId: '00000000-0000-4000-8000-000000000061' } }), savedTemplate.draft);
    assert.equal(staleTemplate.ok, false);
    assert.equal(calls.filter(name => name === 'CreateInput').length, inputsBeforeDraft);
    await page.getByRole('button', { name: 'Send to OBS', exact: true }).click();
    await page.getByText(/Screens sent to OBS. Open OBS controls/).waitFor();
    assert.equal(program, templateProgram);
    const sentTemplate = await page.evaluate(() => window.esportraBroadcast.obs.getTemplate());
    assert.equal(sentTemplate.prepared, true);
    assert.ok([...browserInputs].some(([name, input]) => name.includes('Welcome to the final') && input.url.includes('/o/')));
    assert.ok([...slotItems].some(([name, items]) => name.includes('Welcome to the final') && items.some(item => item.sourceName === 'Fixture camera')));
    assert.equal((await page.evaluate(() => window.esportraBroadcast.air.getStatus())).runner.segments[0].name, 'Welcome to the final');
    const inputsBeforeRepeat = calls.filter(name => name === 'CreateInput').length;
    const transformsBeforeRepeat = calls.filter(name => name === 'SetSceneItemTransform').length;
    const repeatedTemplate = await page.evaluate(draft => window.esportraBroadcast.obs.pushTemplate(draft), sentTemplate.draft);
    assert.equal(repeatedTemplate.ok, true, repeatedTemplate.error);
    assert.equal(calls.filter(name => name === 'CreateInput').length, inputsBeforeRepeat);
    assert.equal(calls.filter(name => name === 'SetSceneItemTransform').length, transformsBeforeRepeat);
    assert.equal(program, templateProgram);
    await capture('desktop-template-setup.png');
    const finalProgram = program; contextCompleted = true;
    await waitForIpc(page, async () => (await window.esportraBroadcast.air.getStatus()).show.matches.length === 0, 8000);
    assert.equal((await page.evaluate(() => window.esportraBroadcast.air.getStatus())).show.matches.length, 0);
    assert.equal((await (await fetch(`http://127.0.0.1:${hudPort}/api/GF1`)).json()).state.teams[0].series, 2);
    assert.equal(program, finalProgram);
    nodeRevoked = true; const revokedAt = Date.now();
    for (const socket of platformHub.clients) socket.send(JSON.stringify({ type: 1, target: 'NodeRevoked', arguments: [] }) + '\x1e');
    await page.getByText('Pair this node', { exact: true }).waitFor({ timeout: 5000 });
    assert.ok(Date.now() - revokedAt < 5000);
    await page.getByText(/pairing was revoked/).waitFor();
    assert.equal((await page.evaluate(() => window.esportraBroadcast.air.getStatus())).show, null);
    await page.getByRole('button',{name:'Create independent broadcast',exact:true}).click();
    await page.getByLabel('Email',{exact:true}).fill('producer@fixture.invalid');await page.getByLabel('Password',{exact:true}).fill('synthetic-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.getByLabel('Project name',{exact:true}).fill('Independent weekend');await page.getByRole('button',{name:'Create project',exact:true}).click();
    await page.getByRole('heading',{name:'Independent weekend',exact:true}).waitFor();
    for(const name of ['Atlas','Orion']){await page.getByRole('button',{name:'Add team',exact:true}).click();await page.getByLabel('Team name',{exact:true}).fill(name);await page.getByLabel('Short team tag',{exact:true}).fill(name.slice(0,3));for(let n=1;n<=5;n++)await page.getByLabel(`Player ${n} in-game identity`,{exact:true}).fill(`${name}${n}#TEST`);await page.getByRole('button',{name:'Save team',exact:true}).click();await page.getByRole('button',{name:'Edit team',exact:true}).last().waitFor();}
    await page.getByRole('button',{name:'Create match',exact:true}).click();await page.getByPlaceholder('Ascent, Haven, Lotus').fill('Haven, Ascent');await page.getByRole('button',{name:'Save match',exact:true}).click();await page.getByRole('button',{name:'Prepare match',exact:true}).click();
    await page.getByRole('heading',{name:'Teams & players',exact:true}).waitFor();
    const independent=await page.evaluate(()=>window.esportraBroadcast.air.getStatus());assert.equal(independent.show.source,'standalone');assert.match(independent.show.matchCode,/^AIR_/);assert.equal(independent.paired,false);
    const roster=await page.evaluate(()=>window.esportraBroadcast.air.getMatchDay());assert.equal(roster.teams[0].players.length,5);const original=roster.teams[0].players[0].originalName;
    const renamed=await page.evaluate(({context,key})=>window.esportraBroadcast.air.setPlayerPreference({context,playerKey:key,nickname:'TV Atlas',gameId:''}),{context:roster.context,key:roster.teams[0].players[0].key});assert.equal(renamed.ok,true,renamed.error);
    const afterAlias=await page.evaluate(()=>window.esportraBroadcast.air.getMatchDay());assert.equal(afterAlias.teams[0].players[0].originalName,original);assert.equal(afterAlias.teams[0].players[0].hudNickname,'TV Atlas');
    await capture('desktop-independent-players.png');
    await page.getByRole('button',{name:'Live match',exact:true}).click();await page.getByRole('tab',{name:'Incoming packets',exact:true}).click();await page.getByRole('button',{name:'Pause display',exact:true}).click();await page.getByText('Display paused; capture continues.',{exact:true}).waitFor();await page.getByRole('button',{name:'Resume display',exact:true}).click();
    await page.locator('.workspace-sidebar').getByRole('button',{name:'HUD controls',exact:true}).click();
    await page.getByRole('heading',{name:'HUD controls',exact:true}).waitFor();
    const hudBefore=await page.evaluate(()=>window.esportraBroadcast.hudControls.get());assert.equal(hudBefore.ok,true,hudBefore.error);
    const ticker=page.getByRole('checkbox',{name:'Ticker',exact:true});await ticker.setChecked(!hudBefore.draft.layers.ticker);
    await page.getByRole('button',{name:'Save HUD draft',exact:true}).click();await page.getByText(/HUD draft saved. The live HUD is unchanged/).waitFor();
    const hudSaved=await page.evaluate(()=>window.esportraBroadcast.hudControls.get());assert.equal(hudSaved.liveSettings.layers.ticker,hudBefore.liveSettings.layers.ticker);assert.equal(hudSaved.draft.layers.ticker,!hudBefore.draft.layers.ticker);
    await page.getByLabel('Preview data source',{exact:true}).selectOption('sample');await page.frameLocator('iframe').getByText('PREVIEW · SAMPLE DATA',{exact:true}).waitFor();await page.waitForTimeout(800);await page.locator('.air-screen-body').evaluate(element=>element.scrollTop=0);await capture('desktop-hud-controls.png');
    const sampledFrame = page.frames().find(frame => frame.parentFrame() && frame.url().includes('/overlays/'));
    await sampledFrame.waitForFunction(expected => HUD.state.show.ticker === expected, hudSaved.draft.layers.ticker);
    assert.equal(await sampledFrame.evaluate(() => HUD.state.teams[0].name),'Atlas');
    await sampledFrame.evaluate(() => window.airDocumentIdentity='retained');
    await ticker.setChecked(hudBefore.draft.layers.ticker);
    await sampledFrame.waitForFunction(expected => HUD.state.show.ticker === expected, hudBefore.draft.layers.ticker);
    assert.equal(await sampledFrame.evaluate(() => window.airDocumentIdentity),'retained');
    await ticker.setChecked(hudSaved.draft.layers.ticker);
    await page.getByRole('tab',{name:'Live graphics',exact:true}).click();await page.getByRole('combobox',{name:'Live banner type',exact:true}).selectOption('custom');await page.getByLabel('Headline',{exact:true}).fill('Fixture bulletin');await page.getByLabel('Subline',{exact:true}).fill('Local test only');await page.getByRole('button',{name:'Show banner on live HUD',exact:true}).click();await page.getByText('Graphic updated on this match’s live HUD.',{exact:true}).waitFor();
    await page.frameLocator('iframe').getByText('Fixture bulletin',{exact:true}).waitFor();assert.equal(await page.frameLocator('iframe').locator('body').evaluate(()=>window.HUD.preview),false);await capture('desktop-hud-live-graphics.png');await page.getByRole('button',{name:'Hide live banner',exact:true}).click();
    await page.locator('.workspace-sidebar').getByRole('button',{name:'Broadcast screens',exact:true}).click();
    await page.getByRole('button',{name:'Add screen',exact:true}).click();await page.getByRole('dialog').getByRole('textbox',{name:'Search screen library',exact:true}).fill('Scoreboard');await page.getByRole('dialog').getByRole('button',{name:/^Scoreboard/}).click();await page.getByRole('dialog').frameLocator('iframe').getByText('PREVIEW · SAMPLE DATA',{exact:true}).waitFor();await page.waitForTimeout(800);await capture('desktop-screen-library.png');await page.getByRole('button',{name:'Add to broadcast',exact:true}).click();
    const unsaved=await page.locator('.template-screen-list li').count();
    await page.locator('.workspace-sidebar').getByRole('button',{name:'HUD controls',exact:true}).click();
    await page.getByRole('heading',{name:'HUD controls',exact:true}).waitFor();
    await page.locator('.workspace-sidebar').getByRole('button',{name:'Broadcast screens',exact:true}).click();
    await page.getByRole('button',{name:'Add screen',exact:true}).waitFor();
    await page.waitForFunction(expected=>document.querySelectorAll('.template-screen-list li').length===expected,unsaved);
    await page.getByRole('button',{name:'Save draft',exact:true}).click();await page.getByText(/Draft saved in Air/).waitFor();
    const expanded=await page.evaluate(()=>window.esportraBroadcast.obs.getTemplate());assert.equal(expanded.draft.items.length,6);assert.match(expanded.draft.items.at(-1).id,/^air_/);assert.equal(expanded.draft.items.at(-1).overlay,'scoreboard');
    await page.getByLabel('Preview data source',{exact:true}).selectOption('sample');await page.frameLocator('iframe').getByText('PREVIEW · SAMPLE DATA',{exact:true}).waitFor().catch(async error=>{console.log(JSON.stringify({previewDiagnostics:await page.locator('iframe').evaluate(element=>({src:element.src,box:element.getBoundingClientRect().toJSON()})),frames:await Promise.all(page.frames().filter(frame=>frame.parentFrame()).map(frame=>frame.evaluate(()=>({url:location.href,preview:window.HUD?.preview,text:document.body.innerText.slice(0,250)}))))}));await capture('desktop-preview-failure.png');throw error;});await page.frameLocator('iframe').locator('body').evaluate(()=>{if(window.HUD.state.teams[0].name!=='Atlas')throw new Error('Selected teams missing from sample preview');});const returningFrame=page.waitForEvent('framenavigated',{predicate:frame=>frame.url().includes('/overlays/')&&frame.url().includes('match=AIR_')&&!frame.url().includes('preview=1')});await page.getByLabel('Preview data source',{exact:true}).selectOption('received');
    await (await returningFrame).waitForFunction(()=>window.HUD?.connected&&window.HUD.state.teams[0].name==='Atlas');
    const beforeIndependentProgram=program;await page.getByRole('button',{name:'Send to OBS',exact:true}).click();await page.getByText(/Screens sent to OBS. Open OBS controls/).waitFor();assert.equal(program,beforeIndependentProgram);const prepared=await page.evaluate(()=>window.esportraBroadcast.obs.getTemplate());assert.equal(prepared.prepared,true);assert.equal(prepared.draft.items.length,6);const hudApplied=await page.evaluate(()=>window.esportraBroadcast.hudControls.get());assert.equal(hudApplied.liveSettings.layers.ticker,hudSaved.draft.layers.ticker);assert.ok((await page.evaluate(()=>window.esportraBroadcast.air.getStatus())).runner.segments.some(row=>row.id===expanded.draft.items.at(-1).id));
    await page.getByRole('button',{name:'Toggle light and dark appearance',exact:true}).click();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');await page.waitForTimeout(180);await capture('desktop-independent-light.png');
    await page.getByRole('button',{name:'Toggle light and dark appearance',exact:true}).click();await page.waitForTimeout(180);await capture('desktop-independent-template.png');


    const independentStart=await page.evaluate(()=>window.esportraBroadcast.runner.start());assert.equal(independentStart.ok,true,independentStart.error);
    const independentFirst=(await page.evaluate(()=>window.esportraBroadcast.air.getStatus())).runner.activeSegment;
    const firstIndependentTake=await page.evaluate(id=>window.esportraBroadcast.runner.take(id),independentFirst.id);assert.equal(firstIndependentTake.ok,true,firstIndependentTake.error);await waitForIpc(page,async()=>!!(await window.esportraBroadcast.air.getStatus()).runner.onAirSegment);
    const onAirBeforeDenial=program;airAccessRevoked=true;const deniedAccess=await page.evaluate(()=>window.esportraBroadcast.projects.checkAccess());assert.equal(deniedAccess.ok,false);assert.equal(program,onAirBeforeDenial);
    assert.equal((await page.evaluate(()=>window.esportraBroadcast.air.getStatus())).airAccount.canProduce,false);
    const following=(await page.evaluate(()=>window.esportraBroadcast.air.getStatus())).runner.activeSegment;const continueActive=await page.evaluate(id=>window.esportraBroadcast.runner.take(id),following.id);assert.equal(continueActive.ok,true,continueActive.error);
    await page.evaluate(()=>window.esportraBroadcast.runner.stop());const deniedRestart=await page.evaluate(()=>window.esportraBroadcast.runner.start());assert.equal(deniedRestart.ok,false);assert.match(deniedRestart.error,/revoked|renew|expired/i);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        nativeElectron: "passed",
        nativeKeytarLoad: "passed",
        checks: [
          "mode",
          "online device revocation retains Program and permits active takes, then blocks another broadcast session",
          "standalone account sign-in, teams, roster, match, isolated HUD nickname, local packet viewer and Send to OBS without pairing",
          "sample preview toggle keeps selected teams and stays separate from live match",
          "add a new local screen from the in-app library, save and send it into the production list",
          "HUD control drafts leave live output unchanged until explicit Send to OBS applies them",
          "HUD layer updates apply inside the same native preview document without reload",
          "new Broadcast setup entry opens after pairing with ordered navigation",
          "unavailable OBS replay buffer does not block sending real scene/source requests or starting a session",
          "unsaved added screens survive HUD navigation without altering live OBS",
          "live HUD graphic actions switch to actual live preview and preserve the selected match",
          "charcoal and light appearance toggle",
          "role selection can be changed before restart and reopened before pairing; keeping the running role cancels restart",
          "production supports opt-in local game capture and never starts it merely by choosing a role",
          "pairing",
          "shortcut IPC conflict rejection",
          "shortcut persistence and custom key dispatch",
          "cached show",
          "output creation",
          "OBS protocol connection",
          "OBS version and collection inspection",
          "persisted scene mapping and missing-scene rejection",
          "Cut transition through trusted IPC",
          "inactive replay guard and media-ended return",
          "independent timeout and technical pause",
          "scene builder",
          "runner manual take",
          "active mode guard",
          "stop/reload",
          "durable events",
          "capture consent/cancel",
          "player capture consent without starting GEP",
          "rehearsal play/pause/scrub and isolated HUD frame",
          "confirmed revocation returns to pairing within five seconds",
          "manual update appears in live HUD room",
          "inline poll show and hide",
          "assigned sponsor read queues original-show start/end",
          "dedicated Air collection and existing camera assignment",
          "rehearsal uses isolated ShowRunner and actual OBS tally after opt-in",
          "one-hour timeline records confirmed take and manual actions",
          "operator Hold waits for explicit Take",
          "versioned upcoming rundown changes only at confirmed OBS boundary",
          "older pushed plan cannot replace active version",
          "live parsed GEP cue triggers configured hold window and confirmed OBS take",
          "on-air score override and Undo through trusted IPC preserve source data",
          "stale match binding cannot mutate another on-air match",
          "delayed technical-pause panel renders in the actual HUD",
          "explicit pause scene takes while paused and Resume leaves Program unchanged",
          "five-second scoped platform identity/appearance sync keeps actual Program and published rundown",
          "new eligible match choices and registered lineup render without replacing GEP players",
          "published Stinger item uses the actual existing OBS transition before confirmed Program take",
          "map correction binds original pairing/show/match and rejects stale trusted IPC before mutation",
          "official result proposal travels through durable queue to the original-show REST endpoint with pairing and team identity",
          "completed selected match refreshes final HUD series score, disappears from picker and leaves actual Program unchanged",
          "map-score override Undo restores received data without withdrawing the delivered official proposal",
          "series wins and player display name controls render in the real HUD and Undo restores source data",
          "customize and save draft without OBS changes; stale match send rejected before mutation",
          "explicit Send to OBS automatically creates HUD and video composition; repeated send preserves layout and actual Program",
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
    for (const socket of platformHub.clients) socket.terminate();
    platformHub.close();
    await new Promise((resolve) => backend.close(resolve));
    assert.equal(path.dirname(fixtureIndex),path.join(root,'src/renderer'));
    if(fs.existsSync(fixtureIndex))fs.unlinkSync(fixtureIndex);
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
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
