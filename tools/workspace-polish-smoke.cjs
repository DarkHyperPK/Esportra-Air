// Actual desktop components with isolated IPC fixtures. No OBS, accounts or game.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const assert = require("node:assert/strict");
const esbuild = require("esbuild");
const {
  chromium,
} = require("../../frag-and-book-main/node_modules/playwright");
const fixture = require("./uiux-desktop-fixture.cjs");
const root = path.resolve(__dirname, "..");
const id = "5e182c34-49f8-40d3-bf6c-88b576c20c45";

async function main() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "air-polish-"));
  const output = path.join(root, "docs/audits/workspace-polish");
  fs.mkdirSync(output, { recursive: true });
  const bundle = await esbuild.build({
    entryPoints: [path.join(root, "src/renderer/main.jsx")],
    bundle: true,
    write: false,
    platform: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const css = [
    "app",
    "air",
    "product",
    "workspace",
    "workspace-flows",
    "workspace-editor",
    "workspace-production",
  ]
    .map((name) =>
      fs.readFileSync(
        path.join(root, `src/renderer/styles/${name}.css`),
        "utf8",
      ),
    )
    .join("\n");
  const show = {
    id,
    title: "Esportra Invitational",
    matchCode: "FINAL",
    tournamentId: id,
    status: "scheduled",
  };
  const server = http.createServer((request, response) => {
    const route = new URL(request.url, "http://127.0.0.1").pathname;
    if (/^\/assets\/brand\/esportra-(mark|wordmark)\.png$/.test(route)) {
      response.setHeader("Content-Type", "image/png");
      return response.end(fs.readFileSync(path.join(root, route.slice(1))));
    }
    if (route === "/app.js") {
      response.setHeader("Content-Type", "text/javascript");
      return response.end(bundle.outputFiles[0].text);
    }
    if (route === "/style.css") {
      response.setHeader("Content-Type", "text/css");
      return response.end(css);
    }
    if (route === "/") {
      response.setHeader("Content-Type", "text/html");
      return response.end(
        `<html><head><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script>${fixture(show, id)}</script><script src="/app.js"></script></body></html>`,
      );
    }
    if (route.startsWith("/hud-preview")) {
      response.setHeader("Content-Type", "text/html");
      return response.end(
        '<body style="background:#20242c;color:#a5aebb;font:14px system-ui;display:grid;place-items:center">Isolated screen-preview fixture<script>parent.postMessage({type:"AIR_HUD_PREVIEW_READY"},"*")</script></body>',
      );
    }
    response.statusCode = 404;
    response.end();
  });
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    const errors = [],
      checks = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:)/, (route) => route.abort());
    const base = `http://127.0.0.1:${server.address().port}`;
    async function open(screen = "workspace-matches") {
      await page.goto(`${base}/?screen=${screen}`);
      await page.getByRole("button", { name: "Matches", exact: true }).click();
      await page
        .getByRole("heading", { name: "Matches", exact: true })
        .waitFor();
    }
    async function capture(name) {
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
        name + " page overflow",
      );
      assert.equal(
        await page
          .locator(".air-screen-body")
          .evaluate((element) => element.scrollWidth > element.clientWidth + 1),
        false,
        name + " content overflow",
      );
      await page.screenshot({ path: path.join(output, `${name}.png`) });
    }
    await page.goto(`${base}/?screen=workspace-matches`);
    await page
      .getByRole("heading", {
        name: "Your broadcast starts here.",
        exact: true,
      })
      .waitFor();
    assert.equal(await page.locator(".broadcast-route li").count(), 4);
    await capture("setup-charcoal-1440");
    for (const width of [960, 1280, 1920]) {
      await page.setViewportSize({ width, height: width === 960 ? 600 : 900 });
      await capture("setup-charcoal-" + width);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page
      .locator(".broadcast-hero")
      .getByRole("button", { name: "Check players", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm lineup & continue", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Broadcast setup", exact: true })
      .click();
    await page
      .locator(".broadcast-hero")
      .getByRole("heading", { name: "Build your broadcast", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Keyboard shortcuts", exact: true })
      .click();
    await page.getByRole("heading", { name: /Keyboard shortcuts/ }).waitFor();
    checks.push(
      "entry workflow, explicit lineup review, next action and direct shortcuts",
    );
    await open();
    assert.equal(await page.locator(".workspace-sidebar nav svg").count(), 10);
    assert.equal(
      await page.locator(".guide-steps").count(),
      0,
      "Matches starts with one next step",
    );
    assert.ok(
      !/Poppins/.test(
        await page
          .locator(".air-window")
          .evaluate((element) => getComputedStyle(element).fontFamily),
      ),
    );
    assert.equal(
      await page
        .locator(".match-search input")
        .evaluate((element) => getComputedStyle(element).borderTopWidth),
      "0px",
    );
    assert.equal(
      await page
        .locator(".match-identity small")
        .first()
        .evaluate((element) => getComputedStyle(element).display),
      "flex",
    );
    assert.equal(
      await page.locator(".air-primary-btn").count(),
      1,
      "one primary action for the selected match",
    );
    await capture("matches-dark-1440");
    checks.push("semantic icons, system typeface and compact guide");
    await page
      .getByRole("button", { name: "View all steps", exact: true })
      .click();
    assert.equal(await page.locator(".guide-steps li").count(), 6);
    await page
      .getByRole("button", { name: "Hide all steps", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Skip walkthrough", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Restart walkthrough", exact: true })
      .click();
    await page
      .getByRole("button", { name: "View all steps", exact: true })
      .waitFor();
    checks.push("guide expand, dismiss and resume");
    await page
      .getByRole("textbox", { name: "Search matches", exact: true })
      .fill("no such match");
    await page
      .getByRole("heading", { name: "No matches found", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Clear search", exact: true })
      .click();
    await page.getByRole("tab", { name: "Completed", exact: true }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Prepare match", exact: true })
        .count(),
      0,
    );
    await page
      .getByRole("tab", { name: "Upcoming & live", exact: true })
      .click();
    checks.push("match search, recovery and history guards");
    await page
      .getByRole("button", {
        name: "Toggle light and dark appearance",
        exact: true,
      })
      .click();
    await capture("matches-light-1440");
    assert.equal(
      await page.locator("html").getAttribute("data-theme"),
      "light",
    );
    await page
      .getByRole("button", {
        name: "Toggle light and dark appearance",
        exact: true,
      })
      .click();
    for (const width of [1920, 1280, 1024, 960]) {
      await page.setViewportSize({
        width,
        height: width === 1920 ? 1080 : width === 960 ? 600 : 800,
      });
      await capture("matches-dark-" + width);
    }
    checks.push("dark/light and 960/1024/1280/1440/1920 layout fit");
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const [label, heading, file] of [
      ["Teams & players", "Teams & players", "players"],
      ["Live match", "Live match", "live"],
      ["Broadcast screens", "Customize your broadcast", "screens"],
      ["Connections", "Connect your production desk.", "connections"],
    ]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      // Page titles differ from their navigation label on retained production pages.
      if (file === "players" || file === "live")
        await page
          .getByRole("heading", { name: heading, exact: true })
          .waitFor();
      await page.waitForTimeout(100);
      await capture(file + "-dark");
    }
    checks.push(
      "players/live/editor/connections inherit the same shell and control system",
    );
    await page.getByRole("button", { name: "Matches", exact: true }).focus();
    const focus = await page
      .getByRole("button", { name: "Matches", exact: true })
      .evaluate((element) => getComputedStyle(element).outlineWidth);
    assert.notEqual(focus, "0px");
    checks.push("visible keyboard focus");
    assert.equal(await page.locator('.brand-symbol').evaluate(image=>image.complete&&image.naturalWidth>0),true,'official Esportra logo loads');
    await page.getByRole('button',{name:'Broadcast screens',exact:true}).click();
    await page.getByRole('button',{name:'Add screen',exact:true}).click();
    await page.getByRole('dialog').getByRole('tab',{name:'Templates',exact:true}).click();
    await page.getByRole('button',{name:'Add 5 screens',exact:true}).click();
    assert.equal(await page.locator('.template-screen-list li').count(),10);
    await page.locator('.workspace-sidebar').getByRole('button',{name:'HUD controls',exact:true}).click();
    await page.getByRole('heading',{name:'HUD controls',exact:true}).waitFor();
    await page.locator('.workspace-sidebar').getByRole('button',{name:'Broadcast screens',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.template-screen-list li').length===10);
    await page.getByRole('textbox',{name:'Screen name',exact:true}).fill('My imported opening');
    await capture('template-import-restored');
    await page.getByRole('button',{name:'Save draft',exact:true}).click();
    await page.getByText('Draft saved in Air. OBS has not been changed.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Send to OBS',exact:true}).click();
    await page.getByText(/Screens sent to OBS/).waitFor();
    checks.push('official logo and five-screen template import, navigation retention, save and explicit send');
    await page.locator('.workspace-sidebar').getByRole('button',{name:'Connections',exact:true}).click();
    await page.getByRole('button',{name:'Connect OBS',exact:true}).click();
    await page.getByRole('button',{name:'Disconnect OBS',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Connect OBS',exact:true}).count(),0);
    assert.equal(await page.getByLabel('OBS password',{exact:true}).count(),0);
    await capture('connections-confirmed');
    await page.getByRole('button',{name:'Disconnect OBS',exact:true}).click();
    await page.getByRole('button',{name:'Connect OBS',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Disconnect OBS',exact:true}).count(),0);
    checks.push('OBS connection state has mutually exclusive Connect/Disconnect actions and hides credentials while connected');


    assert.deepEqual(errors, []);
    const report = {
      date: "2026-10-16",
      checks,
      screenshots: fs
        .readdirSync(output)
        .filter((name) => name.endsWith(".png")).length,
      rendererErrors: errors,
      liveServices: false,
    };
    fs.writeFileSync(
      path.join(output, "verification.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    assert.equal(path.dirname(temporary), os.tmpdir());
    assert.ok(path.basename(temporary).startsWith("air-polish-"));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
