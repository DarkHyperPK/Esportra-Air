const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict");
const { start } = require("../esportra-valorant-hud/server/server");
const {
  chromium,
} = require("../../frag-and-book-main/node_modules/playwright");
const esbuild = require("esbuild");
(async () => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "air-preview-controls-"),
  );
  const hud = await start({
    port: 0,
    key: "synthetic-preview-key",
    root: path.resolve(__dirname, "../esportra-valorant-hud"),
    dataDir: temporary,
  });
  const base = `http://127.0.0.1:${hud.port}`;
  const room = base + "/api/PREVIEW_FIX";
  await fetch(room, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Esportra-Key": "synthetic-preview-key",
    },
    body: JSON.stringify({
      teams: [
        {
          name: "North",
          tag: "N",
          score: 2,
          series: 0,
          color: "#4fd3ea",
          side: "ATK",
        },
        {
          name: "South",
          tag: "S",
          score: 1,
          series: 0,
          color: "#e0445e",
          side: "DEF",
        },
      ],
    }),
  });
  const original = await (await fetch(room)).json();
  const bundle = await esbuild.build({
    stdin: {
      contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Preview from './src/renderer/components/TemplatePreview.jsx';function Test(){const [overlay,setOverlay]=useState('ingame');const [settings,setSettings]=useState({layers:{scorebug:true,players:true}});return <><button onClick={()=>setOverlay('starting-soon')}>Preview Opening</button><button onClick={()=>setOverlay('ingame')}>Preview Match HUD</button><button onClick={()=>setSettings({layers:{scorebug:false,players:false}})}>Hide layers</button><button onClick={()=>setSettings({layers:{scorebug:true,players:true}})}>Show layers</button><button onClick={()=>setSettings(null)}>Clear draft</button><Preview item={{overlay,x:0,y:0,width:1920,height:1080}} matchCode="PREVIEW_FIX" teams={[{name:'North',tag:'N'},{name:'South',tag:'S'}]} previewBase="${base}" hudSettings={settings} disabled /></>}createRoot(document.getElementById('root')).render(<Test/>);`,
      resolveDir: path.resolve(__dirname, ".."),
      loader: "jsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
  });
  const app = http.createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<html><style>body{background:#222225;color:#f4f4f5;font:14px system-ui;margin:24px}button,select{padding:8px;margin:4px} .template-preview-stage{position:relative;aspect-ratio:16/9;overflow:hidden}.template-preview-layer{position:absolute}.template-preview-caption{display:flex;justify-content:space-between;align-items:center}.preview-loading{position:absolute;inset:0;display:grid;place-items:center}iframe{border:0}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script></html>`,
    );
  });
  let browser;
  try {
    await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:)/, (route) => route.abort());
    const output = path.resolve(__dirname, "../docs/audits/preview-workflow");
    fs.mkdirSync(output, { recursive: true });
    await page.goto(`http://127.0.0.1:${app.address().port}`);
    const frame = () => page.frames().find((f) => f.parentFrame());
    await page
      .frameLocator("iframe")
      .getByText("Game data hidden", { exact: true })
      .waitFor();
    assert.equal(await frame().evaluate(() => HUD.preview), true);
    assert.equal(await frame().evaluate(() => HUD.connected), undefined);
    assert.equal(
      await page.frameLocator("iframe").locator(".preview-label").count(),
      0,
    );
    await page.screenshot({ path: path.join(output, "no-game-data.png") });
    await page.getByRole('button',{name:'Preview Opening',exact:true}).click();
    await page.frameLocator('iframe').getByText('STARTING SOON',{exact:true}).waitFor();
    assert.equal(await frame().evaluate(()=>HUD.state.teams[0].name),'North');
    assert.equal(await page.frameLocator('iframe').locator('.preview-label').count(),0,'static screen does not pretend to use samples');
    await page.screenshot({path:path.join(output,'static-design-without-game-data.png')});
    await page.getByRole('button',{name:'Preview Match HUD',exact:true}).click();
    await page.frameLocator('iframe').getByText('Game data hidden',{exact:true}).waitFor();
    await page.getByLabel("Preview data source").selectOption("sample");
    await page
      .frameLocator("iframe")
      .getByText("PREVIEW · SAMPLE DATA", { exact: true })
      .waitFor();
    await frame().waitForFunction(() => HUD.state.show.scorebug === true);
    await frame().evaluate(() => (window.documentIdentity = "kept"));
    let navigations = 0;
    page.on("framenavigated", (f) => {
      if (f.parentFrame()) navigations++;
    });
    const sampleState = await frame().evaluate(() => ({
      round: HUD.state.round.number,
      target: HUD.state.round.endsAt,
    }));
    await page
      .getByRole("button", { name: "Hide layers", exact: true })
      .click();
    await frame().waitForFunction(
      () =>
        HUD.state.show.scorebug === false && HUD.state.show.players === false,
    );
    await page.waitForTimeout(1600);
    assert.equal(
      await frame().evaluate(() => HUD.state.show.scorebug),
      false,
      "simulator must retain editor visibility",
    );
    await page
      .getByRole("button", { name: "Show layers", exact: true })
      .click();
    await frame().waitForFunction(
      () => HUD.state.show.scorebug === true && HUD.state.show.players === true,
    );
    assert.equal(await frame().evaluate(() => window.documentIdentity), "kept");
    assert.equal(navigations, 0, "layer toggles cannot navigate the frame");
    assert.equal(
      await frame().evaluate(() => HUD.state.round.endsAt),
      sampleState.target,
      "layer changes cannot restart sample timer",
    );
    await page.screenshot({ path: path.join(output, "sample-no-reload.png") });
    await page.getByLabel("Preview data source").selectOption("received");
    await frame().waitForFunction(
      () => HUD.connected && HUD.state.teams[0].score === 2,
    );
    const currentFrame = frame();
    await currentFrame.evaluate(() => (window.documentIdentity = "live-kept"));
    navigations = 0;
    await page
      .getByRole("button", { name: "Hide layers", exact: true })
      .click();
    await currentFrame.waitForFunction(() => HUD.state.show.scorebug === false);
    await fetch(room, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Esportra-Key": "synthetic-preview-key",
      },
      body: JSON.stringify({ event: { name: "Synthetic live update" } }),
    });
    await currentFrame.waitForFunction(
      () => HUD.state.event.name === "Synthetic live update",
    );
    assert.equal(
      await currentFrame.evaluate(() => HUD.state.show.scorebug),
      false,
    );
    await page
      .getByRole("button", { name: "Clear draft", exact: true })
      .click();
    await currentFrame.waitForFunction(() => HUD.state.show.scorebug === true);
    assert.equal(
      await currentFrame.evaluate(() => window.documentIdentity),
      "live-kept",
    );
    assert.equal(navigations, 0);
    await currentFrame.evaluate(() =>
      window.dispatchEvent(
        new MessageEvent("message", {
          source: window.parent,
          origin: "https://untrusted.invalid",
          data: {
            type: "AIR_HUD_PREVIEW_SETTINGS",
            settings: { layers: { scorebug: false } },
          },
        }),
      ),
    );
    assert.equal(
      await currentFrame.evaluate(() => HUD.state.show.scorebug),
      true,
      "untrusted origin ignored",
    );
    await page.screenshot({ path: path.join(output, "received-data.png") });
    await page.getByLabel("Preview data source").selectOption("empty");
    await page
      .frameLocator("iframe")
      .getByText("Game data hidden", { exact: true })
      .waitFor();
    const final = await (await fetch(room)).json();
    assert.deepEqual(final.state.teams, original.state.teams);
    assert.deepEqual(final.state.show, original.state.show);
    assert.equal(
      final.v,
      original.v + 1,
      "only explicit synthetic server patch changes room",
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        modes: "empty/sample/received distinct",
        reloadsOnSettings: 0,
        sampleClock: "preserved",
        liveUpdates: "preserve draft; clearing restores source",
        originGuard: true,
        liveRoom: "unchanged by preview",
        screenshots: 4,
        errors,
      }),
    );
  } finally {
    await browser?.close();
    app.closeAllConnections();
    await new Promise((resolve) => app.close(resolve));
    hud.stop();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(path.dirname(temporary), os.tmpdir());
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
