// Real HUD engine and local room; all identities/results are synthetic.
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { start } = require("../esportra-valorant-hud/server/server");
const {
  chromium,
} = require("../../frag-and-book-main/node_modules/playwright");
async function main() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "air-sample-check-"));
  const server = await start({
    port: 0,
    key: "synthetic-sample-check",
    root: path.resolve(__dirname, "../esportra-valorant-hud"),
    dataDir: temporary,
    resolveOutput: (id) =>
      id === "06100000-0000-4000-8000-000000000601"
        ? { overlay: "scoreboard", matchCode: "SAMPLE_CHECK" }
        : null,
  });
  let browser;
  try {
    const base = `http://127.0.0.1:${server.port}`,
      room = base + "/api/SAMPLE_CHECK";
    const seed = await fetch(room, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Esportra-Key": "synthetic-sample-check",
      },
      body: JSON.stringify({
        teams: [
          {
            name: "North",
            tag: "N",
            score: 0,
            color: "#80b7ff",
            series: 0,
            side: "ATK",
          },
          {
            name: "South",
            tag: "S",
            score: 0,
            color: "#ef9ca7",
            series: 0,
            side: "DEF",
          },
        ],
      }),
    });
    assert.equal(seed.ok, true);
    const original = await (await fetch(room)).json();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
        viewport: { width: 1280, height: 720 },
      }),
      errors = [],
      sockets = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("websocket", (socket) => sockets.push(socket.url()));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:)/, (route) => route.abort());
    const params = new URLSearchParams({
      match: "SAMPLE_CHECK",
      canvas: "1",
      preview: "1",
      sampleMotion: "1",
      previewTeams: JSON.stringify([
        { name: "North", tag: "N", players: ["Broadcast North"] },
        { name: "South", tag: "S" },
      ]),
    });
    await page.goto(`${base}/overlays/ingame.html?${params}`);
    await page.waitForFunction(() => window.HUD_READY);
    assert.equal(
      await page.evaluate(() => window.HUD.state.teams[0].name),
      "North",
    );
    assert.equal(
      await page.evaluate(() => window.HUD.state.players[0][0].name),
      "Broadcast North",
    );
    assert.equal(
      await page.evaluate(() => window.HUD.state.players.flat().length),
      10,
    );
    assert.ok(
      await page.evaluate(() =>
        window.HUD.state.teams.some((team) => team.score > 0),
      ),
      "sample scores differ from the zero-score live room",
    );
    fs.mkdirSync(path.resolve(__dirname, "../docs/audits/screen-controls"), {
      recursive: true,
    });
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.resolve(
        __dirname,
        "../docs/audits/screen-controls/sample-match-hud.png",
      ),
    });
    const before = await page.evaluate(() =>
      window.HUD.timeLeft(window.HUD.state.round),
    );
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() =>
      window.HUD.timeLeft(window.HUD.state.round),
    );
    assert.ok(after < before - 1, "the displayed sample round clock runs");
    assert.deepEqual(
      sockets,
      [],
      "sample mode cannot connect to the live room",
    );
    await page.goto(`${base}/overlays/starting-soon.html?${params}`);
    await page.waitForFunction(() => window.HUD_READY);
    const countdown = await page.evaluate(
      () => window.HUD.state.holding.target - window.HUD.now(),
    );
    assert.ok(countdown > 0);
    await page.waitForTimeout(1100);
    assert.ok(
      (await page.evaluate(
        () => window.HUD.state.holding.target - window.HUD.now(),
      )) <
        countdown - 900,
      "Opening uses a moving sample countdown",
    );
    await page.screenshot({
      path: path.resolve(
        __dirname,
        "../docs/audits/screen-controls/sample-opening.png",
      ),
    });
    assert.equal(
      await page.evaluate(() =>
        document.body.classList.contains("hud-preview"),
      ),
      false,
      "interactive sample mode does not replace the screen background",
    );
    const preferences = {
      layers: { ticker: false },
      holding: { minutes: 7, message: "Our next match" },
    };
    params.delete("preview");
    params.delete("sampleMotion");
    params.set("hudSettings", JSON.stringify(preferences));
    await page.goto(`${base}/overlays/starting-soon.html?${params}`);
    await page.waitForFunction(
      () => window.HUD?.connected && window.HUD.state.teams[0].name === "North",
    );
    assert.equal(
      await page.evaluate(() => window.HUD.state.show.ticker),
      false,
    );
    assert.equal(
      await page.evaluate(() => window.HUD.state.holding.message),
      "Our next match",
    );
    await page.goto(`${base}/o/06100000-0000-4000-8000-000000000601?canvas=1`);
    await page.waitForFunction(
      () => window.HUD?.connected && window.HUD.state.teams[0].name === "North",
    );
    assert.equal(
      await page.evaluate(() => window.HUD.state.show.scoreboard),
      true,
      "a dedicated browser source enables its primary screen",
    );
    assert.equal(
      await page
        .locator(".st")
        .evaluate((element) =>
          element.closest(".mod").classList.contains("on"),
        ),
      true,
    );
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.resolve(
        __dirname,
        "../docs/audits/screen-controls/dedicated-scoreboard.png",
      ),
    });
    const current = await (await fetch(room)).json();
    assert.equal(
      await page.getByText("WAITING FOR GAME DATA", { exact: true }).count(),
      1,
    );
    assert.equal(
      await page.getByText("Waiting for player", { exact: true }).count(),
      10,
    );
    assert.equal(current.v, original.v);
    assert.deepEqual(current.state.teams, original.state.teams);
    assert.deepEqual(current.state.holding, original.state.holding);
    assert.deepEqual(current.state.show, original.state.show);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        sampleMatchHud: "moving clock and ten players",
        sampleOpening: "moving countdown with retained background",
        draftPreview: "read-only",
        dedicatedScoreboard:
          "visible while the live Match HUD scoreboard layer stays off",
        liveRoom: "unchanged",
        rendererErrors: errors,
        liveServices: false,
      }),
    );
  } finally {
    await browser?.close();
    server.stop();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(path.dirname(temporary), os.tmpdir());
    assert.ok(path.basename(temporary).startsWith("air-sample-check-"));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
